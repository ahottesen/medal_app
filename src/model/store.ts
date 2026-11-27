// Enkel tilstand med angre/gjør om og automatisk lagring i nettleseren.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MedalDesign } from './types';
import { defaultDesign } from './defaults';

const STORAGE_KEY = 'medaljemaker.design.v1';

function loadSaved(): MedalDesign | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as MedalDesign;
    return d && d.version === 1 ? migrate(d) : null;
  } catch {
    return null;
  }
}

/** Fyll inn felt som mangler i eldre/importerte prosjekter. */
export function migrate(d: MedalDesign): MedalDesign {
  const def = defaultDesign();
  return {
    ...def,
    ...d,
    outline: { ...def.outline, ...d.outline },
    base: { ...def.base, ...d.base },
    edge: { ...def.edge, ...d.edge, reeding: { ...def.edge.reeding, ...d.edge?.reeding } },
    rim: { ...def.rim, ...d.rim, inner: { ...def.rim.inner, ...d.rim?.inner } },
    hanger: { ...def.hanger, ...d.hanger },
    magnet: { ...def.magnet, ...d.magnet },
    print: { ...def.print, ...d.print },
    colors: d.colors?.length ? d.colors : def.colors,
    elements: d.elements ?? [],
  };
}

export interface Store {
  design: MedalDesign;
  /** Oppdater designet. `coalesce` slår sammen raske endringer av samme felt i angre-historikken. */
  update: (fn: (d: MedalDesign) => MedalDesign, coalesce?: string) => void;
  replace: (d: MedalDesign) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDesignStore(): Store {
  const [design, setDesign] = useState<MedalDesign>(() => loadSaved() ?? defaultDesign());
  const past = useRef<MedalDesign[]>([]);
  const future = useRef<MedalDesign[]>([]);
  const lastCoalesce = useRef<{ key: string; t: number } | null>(null);
  const [, force] = useState(0);

  const update = useCallback((fn: (d: MedalDesign) => MedalDesign, coalesce?: string) => {
    setDesign((cur) => {
      const next = fn(cur);
      if (next === cur) return cur;
      const now = Date.now();
      const lc = lastCoalesce.current;
      if (!(coalesce && lc && lc.key === coalesce && now - lc.t < 800)) {
        past.current.push(cur);
        if (past.current.length > 200) past.current.shift();
      }
      lastCoalesce.current = coalesce ? { key: coalesce, t: now } : null;
      future.current = [];
      return next;
    });
    force((x) => x + 1);
  }, []);

  const replace = useCallback((d: MedalDesign) => {
    setDesign((cur) => {
      past.current.push(cur);
      future.current = [];
      lastCoalesce.current = null;
      return migrate(d);
    });
    force((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    setDesign((cur) => {
      const prev = past.current.pop();
      if (!prev) return cur;
      future.current.push(cur);
      lastCoalesce.current = null;
      return prev;
    });
    force((x) => x + 1);
  }, []);

  const redo = useCallback(() => {
    setDesign((cur) => {
      const next = future.current.pop();
      if (!next) return cur;
      past.current.push(cur);
      lastCoalesce.current = null;
      return next;
    });
    force((x) => x + 1);
  }, []);

  // autolagring
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
      } catch {
        /* full lagring eller privat modus */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [design]);

  return {
    design,
    update,
    replace,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

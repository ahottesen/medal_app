import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveShapes } from './assets/resolve';
import { GeometryClient } from './geometry/client';
import { safeName, to3MF, toSTL, toStlZip } from './geometry/export';
import { TEMPLATES } from './model/defaults';
import { migrate, useDesignStore } from './model/store';
import { dataUrlToBytes, isDesktop, saveFile } from './platform';
import type { BuildResult, MedalDesign } from './model/types';
import { ColorsPanel, ElementsPanel, MedalPanel, PrintPanel } from './ui/Panels';
import { Viewer, type ViewerHandle } from './ui/Viewer';
import { Modal } from './ui/widgets';

type Tab = 'medal' | 'elements' | 'colors' | 'print';

export default function App() {
  const store = useDesignStore();
  const { design, update } = store;
  const client = useMemo(() => new GeometryClient(), []);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('elements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPlate, setShowPlate] = useState(true);
  const viewer = useRef<ViewerHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      client.onResult((r) => {
        setResult((prev) => (r.error && prev && r.parts.length === 0 ? { ...prev, error: r.error } : r));
        setBuilding(false);
      }),
    [client],
  );

  // bygg modellen når designet endres
  useEffect(() => {
    const r = resolveShapes(design, () => setTick((t) => t + 1));
    setErrors(r.errors);
    setLoadingAssets(r.loading);
    setBuilding(true);
    const h = setTimeout(() => void client.build(design, r.shapes), 10);
    return () => clearTimeout(h);
  }, [design, tick, client]);

  // tastatursnarveier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
      } else if (!typing && selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        update((d) => ({ ...d, elements: d.elements.filter((x) => x.id !== selectedId) }));
        setSelectedId(null);
      } else if (!typing && selectedId && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        update(
          (d) => ({ ...d, elements: d.elements.map((x) => (x.id === selectedId ? { ...x, x: +(x.x + dx).toFixed(2), y: +(x.y + dy).toFixed(2) } : x)) }),
          'nudge' + selectedId,
        );
      } else if (!typing && e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onMove = useCallback(
    (id: string, x: number, y: number) =>
      update((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, x, y } : e)) }), 'drag' + id),
    [update],
  );
  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setTab('elements');
  }, []);

  const base = safeName(design.name);
  const parts = result?.parts ?? [];
  const canExport = parts.length > 0 && !result?.error;

  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Lagre en fil og gi beskjed (i skrivebordsappen: via «Lagre som»-dialog). */
  const save = async (make: () => Uint8Array | string, filename: string, mime: string) => {
    try {
      const where = await saveFile(make(), filename, mime);
      if (where && where !== 'download') setToast({ text: `Lagret: ${where}` });
    } catch (e) {
      setToast({ text: 'Kunne ikke lagre: ' + (e instanceof Error ? e.message : String(e)), err: true });
    }
  };
  const exportSTL = () => save(() => toSTL(parts, design.name), `${base}.stl`, 'model/stl');
  const export3MF = () => save(() => to3MF(parts, design.colors, design.name), `${base}.3mf`, 'model/3mf');
  const exportZip = () => save(() => toStlZip(parts, design.colors, base), `${base}_per_farge.zip`, 'application/zip');
  const exportPNG = () => {
    const url = viewer.current?.screenshot();
    if (!url) return;
    void save(() => dataUrlToBytes(url), `${base}.png`, 'image/png');
  };
  function saveProject() {
    void save(() => JSON.stringify(design, null, 1), `${base}.medalje.json`, 'application/json');
  }
  const openProject = async (f: File | undefined) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as MedalDesign;
      if (d.version !== 1 || !d.outline) throw new Error('Ukjent filformat');
      store.replace(migrate(d));
      setSelectedId(null);
    } catch (e) {
      alert('Kunne ikke åpne prosjektet: ' + (e as Error).message);
    }
  };

  const exportButtons = (
    <div className="export-buttons">
      <button className="btn primary" disabled={!canExport} onClick={export3MF} title="Flerfarge-modell for moderne slicere">
        ⬇ 3MF (flerfarge)
      </button>
      <button className="btn" disabled={!canExport} onClick={exportSTL}>
        ⬇ STL
      </button>
      <button className="btn" disabled={!canExport} onClick={exportZip}>
        ⬇ STL per farge (ZIP)
      </button>
      <button className="btn" onClick={exportPNG}>
        🖼 Bilde (PNG)
      </button>
    </div>
  );

  const warnCount = (result?.warnings ?? []).filter((w) => w.level === 'warn').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏅</span>
          <span>Medaljemaker</span>
        </div>
        <input
          className="name-input"
          value={design.name}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }), 'name')}
          aria-label="Prosjektnavn"
        />
        <div className="top-actions">
          <button className="btn" onClick={() => setShowTemplates(true)}>
            ✦ Maler
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Åpne .medalje.json">
            Åpne
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => openProject(e.target.files?.[0])} />
          <button className="btn" onClick={saveProject} title="Lagre prosjektfil (Ctrl+S)">
            Lagre
          </button>
          <span className="sep" />
          <button className="icon-btn" disabled={!store.canUndo} onClick={store.undo} title="Angre (Ctrl+Z)">
            ↶
          </button>
          <button className="icon-btn" disabled={!store.canRedo} onClick={store.redo} title="Gjør om (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className="sep" />
          <button className="btn primary" disabled={!canExport} onClick={export3MF}>
            ⬇ 3MF
          </button>
          <button className="btn" disabled={!canExport} onClick={exportSTL}>
            ⬇ STL
          </button>
          <button className="icon-btn" onClick={() => setShowHelp(true)} title="Hjelp">
            ?
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <nav className="tabs">
          {(
            [
              ['medal', 'Medalje'],
              ['elements', `Elementer (${design.elements.length})`],
              ['colors', 'Farger'],
              ['print', warnCount ? `Print ⚠${warnCount}` : 'Print'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="panel">
          {tab === 'medal' && <MedalPanel design={design} update={update} />}
          {tab === 'elements' && (
            <ElementsPanel design={design} update={update} selectedId={selectedId} setSelectedId={setSelectedId} errors={errors} />
          )}
          {tab === 'colors' && <ColorsPanel design={design} update={update} />}
          {tab === 'print' && <PrintPanel design={design} update={update} result={result} building={building} exportButtons={exportButtons} />}
        </div>
      </aside>

      <main className="stage">
        <Viewer
          ref={viewer}
          result={result}
          colors={design.colors}
          elements={design.elements}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
          showPlate={showPlate}
        />
        <div className="view-buttons">
          <button onClick={() => viewer.current?.setView('angle')}>Skrå</button>
          <button onClick={() => viewer.current?.setView('top')}>Forside</button>
          <button onClick={() => viewer.current?.setView('bottom')}>Bakside</button>
          <button onClick={() => viewer.current?.setView('side')}>Kant</button>
          <button className={showPlate ? 'active' : ''} onClick={() => setShowPlate(!showPlate)} title="Vis byggeplate">
            #
          </button>
        </div>
        {toast && <div className={'toast' + (toast.err ? ' err' : '')}>{toast.text}</div>}
        <div className="status">
          {building || loadingAssets ? (
            <span className="spinner">{loadingAssets ? 'Laster fonter/ikoner…' : 'Bygger…'}</span>
          ) : result?.error ? (
            <span className="err">⚠ {result.error}</span>
          ) : result ? (
            <span>
              {result.size[0].toFixed(1)} × {result.size[1].toFixed(1)} × {result.size[2].toFixed(1)} mm · {result.timeMs.toFixed(0)} ms
            </span>
          ) : null}
          {warnCount > 0 && (
            <button className="warn-pill" onClick={() => setTab('print')}>
              ⚠ {warnCount} advarsel{warnCount > 1 ? 'er' : ''}
            </button>
          )}
        </div>
      </main>

      {showTemplates && (
        <Modal title="Velg en mal" onClose={() => setShowTemplates(false)} wide>
          <p className="muted">Malen erstatter det nåværende designet (du kan angre med Ctrl+Z).</p>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => {
                  store.replace(t.make());
                  setSelectedId(null);
                  setShowTemplates(false);
                  setTimeout(() => viewer.current?.setView('angle'), 50);
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {showHelp && (
        <Modal title="Slik bruker du Medaljemaker" onClose={() => setShowHelp(false)}>
          <div className="help">
            <ol>
              <li>
                <b>Medalje:</b> velg form, størrelse, tykkelse, kant og oppheng (øye, båndspalte eller hull).
              </li>
              <li>
                <b>Elementer:</b> legg til tekst (rett eller i bue), ikoner fra Iconify, laurbærkrans, stjerner, mønstre, former og egne bilder. Dra dem rundt i
                3D-visningen.
              </li>
              <li>
                <b>Utførelse:</b> hvert element kan være <i>opphøyd</i>, <i>gravert</i>, <i>innlagt</i> (flat flerfarge) eller skåret <i>gjennom</i>, på forsiden
                eller baksiden.
              </li>
              <li>
                <b>Farger:</b> lag fargespor (f.eks. gull + svart). Hver farge blir en egen del i 3MF-filen.
              </li>
              <li>
                <b>Print:</b> se mål, vekt, advarsler og når du skal bytte filament. Eksporter som 3MF, STL eller ZIP.
              </li>
            </ol>
            <h4>Snarveier</h4>
            <ul>
              <li>Ctrl+Z / Ctrl+Shift+Z – angre / gjør om</li>
              <li>Piltaster – flytt valgt element 0,5 mm (Shift: 2 mm)</li>
              <li>Delete – slett valgt element</li>
              <li>Ctrl+S – lagre prosjektfil</li>
            </ul>
            <p className="muted small">
              {isDesktop ? 'Designet lagres automatisk mellom hver gang du åpner programmet.' : 'Designet lagres automatisk i nettleseren.'} Ikoner: Iconify (sjekk lisens per samling). Fonter: Fontsource / Google Fonts (åpne lisenser).
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

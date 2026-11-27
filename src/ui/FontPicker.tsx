import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUNDLED_CATALOG,
  CATEGORY_LABELS,
  ensurePreviewFont,
  fontFromFile,
  loadCatalog,
  type FontCatalogEntry,
} from '../assets/fonts';
import type { FontRef } from '../model/types';
import { Modal } from './widgets';

const POPULAR = [
  'cinzel',
  'roboto',
  'oswald',
  'bebas-neue',
  'montserrat',
  'playfair-display',
  'anton',
  'lobster',
  'pacifico',
  'righteous',
  'black-ops-one',
  'bangers',
  'russo-one',
  'archivo-black',
  'abril-fatface',
  'alfa-slab-one',
  'bungee',
  'staatliches',
  'uncialantiqua',
  'pirata-one',
  'great-vibes',
  'permanent-marker',
  'press-start-2p',
  'orbitron',
  'audiowide',
  'cinzel-decorative',
  'marcellus',
  'trajan-pro',
  'teko',
  'fjalla-one',
];

function Row({ f, active, sample, onPick }: { f: FontCatalogEntry; active: boolean; sample: string; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setFamily(ensurePreviewFont(f));
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [f]);
  return (
    <button ref={ref} className={'font-row' + (active ? ' active' : '')} onClick={onPick}>
      <span className="font-sample" style={{ fontFamily: family ? `"${family}", sans-serif` : 'inherit' }}>
        {sample || f.family}
      </span>
      <span className="font-meta">
        {f.family} · {CATEGORY_LABELS[f.category] ?? f.category} · {f.weights.length} vekter
      </span>
    </button>
  );
}

export function FontPicker({
  current,
  sample,
  onPick,
  onClose,
}: {
  current: FontRef;
  sample: string;
  onPick: (f: FontRef) => void;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<FontCatalogEntry[]>(BUNDLED_CATALOG);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [preview, setPreview] = useState(sample.split('\n')[0].slice(0, 24) || 'MESTERSKAP 2026');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCatalog().then((c) => {
      setCatalog(c);
      setOnline(c !== BUNDLED_CATALOG);
    });
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let l = catalog.filter((f) => (!category || f.category === category) && (!q || f.family.toLowerCase().includes(q)));
    if (!q && !category) {
      const pop = POPULAR.map((id) => l.find((f) => f.id === id)).filter(Boolean) as FontCatalogEntry[];
      l = [...pop, ...l.filter((f) => !POPULAR.includes(f.id))];
    }
    return l.slice(0, 400);
  }, [catalog, query, category]);

  const choose = (f: FontCatalogEntry) => {
    const weight = f.weights.includes(current.weight)
      ? current.weight
      : f.weights.reduce((b, w) => (Math.abs(w - 700) < Math.abs(b - 700) ? w : b), f.weights[0] ?? 400);
    onPick({ id: f.id, family: f.family, weight, italic: current.italic && f.styles.includes('italic') });
  };

  return (
    <Modal title="Velg font" onClose={onClose} wide>
      <div className="picker-toolbar">
        <input autoFocus className="search" placeholder="Søk etter font…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Alle kategorier</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="preview-input" value={preview} onChange={(e) => setPreview(e.target.value)} title="Forhåndsvisningstekst" />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Last opp font…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              onPick(await fontFromFile(f));
            } catch (err) {
              alert('Kunne ikke lese fonten (støtter TTF, OTF og WOFF): ' + (err as Error).message);
            }
          }}
        />
      </div>
      {online === false && <div className="notice warn">Ingen kontakt med Fontsource – viser bare innebygde fonter.</div>}
      <div className="font-list">
        {list.map((f) => (
          <Row key={f.id} f={f} sample={preview} active={f.id === current.id} onPick={() => choose(f)} />
        ))}
      </div>
      <div className="picker-footer">
        <span className="muted">
          {catalog.length} fonter fra{' '}
          <a href="https://fontsource.org" target="_blank" rel="noreferrer">
            Fontsource
          </a>{' '}
          (Google Fonts m.fl., åpne lisenser). Viser maks 400 – søk for å finne flere.
        </span>
      </div>
    </Modal>
  );
}

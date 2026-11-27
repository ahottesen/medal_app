import { useEffect, useRef, useState } from 'react';
import {
  fetchIconSvg,
  iconPreviewUrl,
  loadCollections,
  QUICK_SEARCHES,
  RECOMMENDED_SETS,
  searchIcons,
  type IconCollection,
} from '../assets/icons';
import { PRESET_ICONS } from '../model/presetIcons';
import { Modal } from './widgets';

export interface PickedIcon {
  name: string;
  svg: string;
  license?: string;
}

export function IconPicker({ onPick, onClose }: { onPick: (icon: PickedIcon) => void; onClose: () => void }) {
  const [query, setQuery] = useState('trophy');
  const [prefix, setPrefix] = useState('');
  const [icons, setIcons] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Record<string, IconCollection>>({});
  const [busyIcon, setBusyIcon] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCollections().then(setCollections, () => {});
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setIcons([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await searchIcons(q, prefix, limit);
        setIcons(r.icons);
        setTotal(r.total);
      } catch (e) {
        setError('Fikk ikke kontakt med Iconify. Sjekk nettforbindelsen – du kan fortsatt bruke de innebygde ikonene eller laste opp en SVG.');
        setIcons([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, prefix, limit]);

  const pick = async (name: string) => {
    setBusyIcon(name);
    try {
      const svg = await fetchIconSvg(name);
      const col = collections[name.split(':')[0]];
      const license = col ? `${col.license?.title ?? ''} – ${col.name}${col.author ? ' av ' + col.author.name : ''}` : undefined;
      onPick({ name, svg, license });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIcon(null);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const svg = await f.text();
    onPick({ name: f.name.replace(/\.svg$/i, ''), svg, license: 'Egen fil' });
  };

  const usesStroke = (name: string) => collections[name.split(':')[0]]?.tags?.includes('Uses Stroke');

  return (
    <Modal title="Velg ikon" onClose={onClose} wide>
      <div className="picker-toolbar">
        <input
          autoFocus
          className="search"
          placeholder="Søk på engelsk, f.eks. trophy, runner, horse…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(120);
          }}
        />
        <select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
          {RECOMMENDED_SETS.map((s) => (
            <option key={s.prefix} value={s.prefix}>
              {s.label}
            </option>
          ))}
          {Object.values(collections)
            .filter((c) => !RECOMMENDED_SETS.some((r) => r.prefix === c.prefix))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.prefix} value={c.prefix}>
                {c.name} ({c.total})
              </option>
            ))}
        </select>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Last opp SVG…
        </button>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <div className="chips">
        {QUICK_SEARCHES.map((q) => (
          <button key={q} className={'chip' + (q === query ? ' active' : '')} onClick={() => setQuery(q)}>
            {q}
          </button>
        ))}
      </div>
      {error && <div className="notice warn">{error}</div>}
      <div className="icon-grid">
        {icons.map((name) => (
          <button
            key={name}
            className={'icon-cell' + (busyIcon === name ? ' busy' : '')}
            title={name + (usesStroke(name) ? ' (strek-ikon)' : '')}
            onClick={() => pick(name)}
          >
            <img src={iconPreviewUrl(name)} alt={name} loading="lazy" />
            <span>{name.split(':')[1]}</span>
            {usesStroke(name) && <em className="badge">strek</em>}
          </button>
        ))}
        {!loading && !icons.length && !error && query.trim() && <p className="muted">Ingen treff.</p>}
      </div>
      <div className="picker-footer">
        <span className="muted">
          {loading ? 'Søker…' : icons.length ? `Viser ${icons.length} av ${total}` : ''} · Ikoner fra{' '}
          <a href="https://iconify.design" target="_blank" rel="noreferrer">
            Iconify
          </a>
          . Sjekk lisensen til samlingen før kommersiell bruk.
        </span>
        {icons.length >= limit && limit < 999 && (
          <button className="btn" onClick={() => setLimit(999)}>
            Vis flere
          </button>
        )}
      </div>
      <details className="offline">
        <summary>Innebygde ikoner (virker uten nett)</summary>
        <div className="icon-grid small">
          {Object.entries(PRESET_ICONS).map(([name, p]) => (
            <button key={name} className="icon-cell" title={name} onClick={() => onPick({ name, svg: p.svg, license: p.license })}>
              <img src={'data:image/svg+xml;utf8,' + encodeURIComponent(p.svg.replace(/currentColor/g, '#ddd'))} alt={name} />
              <span>{name.split(':')[1]}</span>
            </button>
          ))}
        </div>
      </details>
    </Modal>
  );
}

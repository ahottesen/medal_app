// Ikoner fra Iconify (over 200 000 ikoner fra ca. 200 åpne ikonsamlinger).
const API = 'https://api.iconify.design';

export interface IconCollection {
  prefix: string;
  name: string;
  total: number;
  category?: string;
  license?: { title: string; spdx?: string; url?: string };
  author?: { name: string; url?: string };
  palette?: boolean;
  tags?: string[];
}

let collectionsPromise: Promise<Record<string, IconCollection>> | null = null;

export function loadCollections(): Promise<Record<string, IconCollection>> {
  if (!collectionsPromise) {
    collectionsPromise = (async () => {
      const res = await fetch(`${API}/collections`);
      if (!res.ok) throw new Error('Iconify: ' + res.status);
      const data = (await res.json()) as Record<string, Omit<IconCollection, 'prefix'>>;
      const out: Record<string, IconCollection> = {};
      for (const [prefix, c] of Object.entries(data)) out[prefix] = { prefix, ...c };
      return out;
    })();
    collectionsPromise.catch(() => (collectionsPromise = null));
  }
  return collectionsPromise;
}

/** Samlinger som egner seg godt til 3D-print (fylte, ensfargede former). */
export const RECOMMENDED_SETS: { prefix: string; label: string }[] = [
  { prefix: '', label: 'Alle (uten flerfarge)' },
  { prefix: 'game-icons', label: 'Game Icons – fylte, detaljerte' },
  { prefix: 'mdi', label: 'Material Design Icons' },
  { prefix: 'material-symbols', label: 'Material Symbols' },
  { prefix: 'fa6-solid', label: 'Font Awesome (solid)' },
  { prefix: 'ph', label: 'Phosphor' },
  { prefix: 'tabler', label: 'Tabler (strek)' },
  { prefix: 'mingcute', label: 'MingCute' },
  { prefix: 'fluent', label: 'Fluent' },
  { prefix: 'healthicons', label: 'Health Icons' },
  { prefix: 'map', label: 'Map Icons' },
  { prefix: 'emojione-monotone', label: 'Emoji (ensfarget)' },
  { prefix: 'twemoji', label: 'Twemoji (flerfarge)' },
  { prefix: 'flag', label: 'Flagg (flerfarge)' },
];

export const QUICK_SEARCHES = [
  'trophy',
  'medal',
  'star',
  'crown',
  'laurel',
  'run',
  'bike',
  'swim',
  'ski',
  'soccer',
  'football',
  'handball',
  'basketball',
  'tennis',
  'golf',
  'chess',
  'music',
  'heart',
  'flag',
  'mountain',
  'tree',
  'paw',
  'rocket',
  'graduation',
];

export async function searchIcons(query: string, prefix = '', limit = 120): Promise<{ icons: string[]; total: number }> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  if (prefix) params.set('prefixes', prefix);
  else params.set('palette', 'false');
  const res = await fetch(`${API}/search?${params}`);
  if (!res.ok) throw new Error('Iconify-søk feilet: ' + res.status);
  const data = (await res.json()) as { icons: string[]; total: number };
  return { icons: data.icons ?? [], total: data.total ?? 0 };
}

export function iconPreviewUrl(name: string): string {
  const [prefix, icon] = name.split(':');
  return `${API}/${prefix}/${icon}.svg?height=48&color=%23e8e6e1`;
}

interface IconifyJSON {
  prefix: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number; hFlip?: boolean; vFlip?: boolean; rotate?: number }>;
  aliases?: Record<string, { parent: string; hFlip?: boolean; vFlip?: boolean; rotate?: number }>;
}

const svgCache = new Map<string, Promise<string>>();

/** Hent et ikon som komplett SVG-tekst. */
export function fetchIconSvg(name: string): Promise<string> {
  let p = svgCache.get(name);
  if (!p) {
    p = (async () => {
      const [prefix, icon] = name.split(':');
      const res = await fetch(`${API}/${prefix}.json?icons=${encodeURIComponent(icon)}`);
      if (!res.ok) throw new Error('Kunne ikke hente ikon: ' + res.status);
      const data = (await res.json()) as IconifyJSON;
      let key = icon;
      let flipH = false;
      let flipV = false;
      let rotate = 0;
      for (let guard = 0; guard < 5 && !data.icons[key] && data.aliases?.[key]; guard++) {
        const a: { parent: string; hFlip?: boolean; vFlip?: boolean; rotate?: number } = data.aliases[key];
        flipH = flipH !== !!a.hFlip;
        flipV = flipV !== !!a.vFlip;
        rotate += a.rotate ?? 0;
        key = a.parent;
      }
      const ic = data.icons[key];
      if (!ic) throw new Error('Fant ikke ikonet ' + name);
      const w = ic.width ?? data.width ?? 16;
      const h = ic.height ?? data.height ?? 16;
      const l = ic.left ?? data.left ?? 0;
      const t = ic.top ?? data.top ?? 0;
      flipH = flipH !== !!ic.hFlip;
      flipV = flipV !== !!ic.vFlip;
      rotate += ic.rotate ?? 0;
      let body = ic.body;
      const tr: string[] = [];
      if (rotate % 4) tr.push(`rotate(${(rotate % 4) * 90} ${l + w / 2} ${t + h / 2})`);
      if (flipH || flipV) tr.push(`translate(${flipH ? 2 * l + w : 0} ${flipV ? 2 * t + h : 0}) scale(${flipH ? -1 : 1} ${flipV ? -1 : 1})`);
      if (tr.length) body = `<g transform="${tr.join(' ')}">${body}</g>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${l} ${t} ${w} ${h}">${body}</svg>`;
    })();
    svgCache.set(name, p);
    p.catch(() => svgCache.delete(name));
  }
  return p;
}

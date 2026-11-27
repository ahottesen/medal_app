// Fonter: katalog fra Fontsource (alle Google Fonts + flere), lasting som TTF via jsDelivr,
// og noen innebygde fonter som virker uten nett.
import { parse, type Font } from 'opentype.js';
import type { FontRef } from '../model/types';

import roboto400 from '@fontsource/roboto/files/roboto-latin-400-normal.woff?url';
import roboto700 from '@fontsource/roboto/files/roboto-latin-700-normal.woff?url';
import roboto900 from '@fontsource/roboto/files/roboto-latin-900-normal.woff?url';
import oswald400 from '@fontsource/oswald/files/oswald-latin-400-normal.woff?url';
import oswald700 from '@fontsource/oswald/files/oswald-latin-700-normal.woff?url';
import cinzel400 from '@fontsource/cinzel/files/cinzel-latin-400-normal.woff?url';
import cinzel700 from '@fontsource/cinzel/files/cinzel-latin-700-normal.woff?url';
import cinzel900 from '@fontsource/cinzel/files/cinzel-latin-900-normal.woff?url';
import bebas400 from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';

export interface FontCatalogEntry {
  id: string;
  family: string;
  category: string;
  weights: number[];
  styles: string[];
  subsets: string[];
  defSubset?: string;
}

const BUNDLED: Record<string, { family: string; category: string; files: Record<string, string> }> = {
  roboto: { family: 'Roboto', category: 'sans-serif', files: { '400-normal': roboto400, '700-normal': roboto700, '900-normal': roboto900 } },
  oswald: { family: 'Oswald', category: 'sans-serif', files: { '400-normal': oswald400, '700-normal': oswald700 } },
  cinzel: { family: 'Cinzel', category: 'serif', files: { '400-normal': cinzel400, '700-normal': cinzel700, '900-normal': cinzel900 } },
  'bebas-neue': { family: 'Bebas Neue', category: 'display', files: { '400-normal': bebas400 } },
};

export const BUNDLED_CATALOG: FontCatalogEntry[] = Object.entries(BUNDLED).map(([id, b]) => ({
  id,
  family: b.family,
  category: b.category,
  weights: Object.keys(b.files).map((k) => parseInt(k)),
  styles: ['normal'],
  subsets: ['latin'],
}));

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
const API = 'https://api.fontsource.org/v1/fonts';

let catalogPromise: Promise<FontCatalogEntry[]> | null = null;

/** Henter hele fontkatalogen (ca. 2000 fonter). Faller tilbake til innebygde fonter uten nett. */
export function loadCatalog(): Promise<FontCatalogEntry[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        const res = await fetch(API);
        if (!res.ok) throw new Error(String(res.status));
        const list = (await res.json()) as FontCatalogEntry[];
        return list
          .filter((f) => f.category !== 'icons')
          .map((f) => ({
            id: f.id,
            family: f.family,
            category: f.category,
            weights: f.weights,
            styles: f.styles,
            subsets: f.subsets,
            defSubset: f.defSubset,
          }))
          .sort((a, b) => a.family.localeCompare(b.family));
      } catch (e) {
        console.warn('Kunne ikke hente fontkatalog, bruker innebygde fonter', e);
        catalogPromise = null;
        return BUNDLED_CATALOG;
      }
    })();
  }
  return catalogPromise;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Håndskrift',
  monospace: 'Monospace',
  other: 'Annet',
};

/** En lastet font med reservefonter for tegn som mangler. */
export interface LoadedFont {
  fonts: Font[];
}

const fontCache = new Map<string, Promise<Font>>();

async function fetchFont(url: string): Promise<Font> {
  let p = fontCache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Font ${url}: ${res.status}`);
      return parse(await res.arrayBuffer());
    })();
    fontCache.set(url, p);
    p.catch(() => fontCache.delete(url));
  }
  return p;
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

const uploadCache = new Map<string, Font>();

function closestWeight(weights: number[], w: number): number {
  if (!weights.length) return w;
  return weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), weights[0]);
}

/** URL til en fontfil (for forhåndsvisning i fontvelgeren brukes woff2). */
export function fontFileUrl(id: string, subset: string, weight: number, style: string, ext: 'ttf' | 'woff2' = 'ttf') {
  return `${CDN}/${id}@latest/${subset}-${weight}-${style}.${ext}`;
}

export async function loadFont(ref: FontRef): Promise<LoadedFont> {
  const fonts: Font[] = [];
  if (ref.data) {
    let f = uploadCache.get(ref.id);
    if (!f) {
      f = parse(base64ToBuffer(ref.data));
      uploadCache.set(ref.id, f);
    }
    fonts.push(f);
  } else {
    const style = ref.italic ? 'italic' : 'normal';
    const bundled = BUNDLED[ref.id];
    const bundledFile = bundled?.files[`${ref.weight}-${style}`];
    if (bundledFile) {
      fonts.push(await fetchFont(bundledFile));
    } else {
      const catalog = await loadCatalog();
      const entry = catalog.find((c) => c.id === ref.id);
      const weight = entry ? closestWeight(entry.weights, ref.weight) : ref.weight;
      const st = entry && !entry.styles.includes(style) ? 'normal' : style;
      const subsets = entry?.subsets ?? ['latin'];
      const primary = subsets.includes('latin') ? 'latin' : (entry?.defSubset ?? subsets[0] ?? 'latin');
      try {
        fonts.push(await fetchFont(fontFileUrl(ref.id, primary, weight, st)));
      } catch (e) {
        if (bundled) {
          const k = closestWeight(Object.keys(bundled.files).map((x) => parseInt(x)), ref.weight);
          fonts.push(await fetchFont(bundled.files[`${k}-normal`]));
        } else throw e;
      }
      if (subsets.includes('latin-ext') && primary !== 'latin-ext') {
        try {
          fonts.push(await fetchFont(fontFileUrl(ref.id, 'latin-ext', weight, st)));
        } catch {
          /* valgfri */
        }
      }
    }
  }
  // Global reservefont for tegn som mangler
  try {
    fonts.push(await fetchFont(roboto700));
  } catch {
    /* ignorer */
  }
  return { fonts };
}

/** Last en lokal fontfil (ttf/otf/woff) som FontRef med innebygde data. */
export async function fontFromFile(file: File): Promise<FontRef> {
  const buf = await file.arrayBuffer();
  const font = parse(buf);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
  const fam =
    names.fontFamily?.en ??
    (names as unknown as { windows?: { fontFamily?: { en?: string } } }).windows?.fontFamily?.en ??
    file.name.replace(/\.[^.]+$/, '');
  return { id: 'upload:' + file.name + ':' + buf.byteLength, family: fam, weight: 400, italic: false, data: btoa(bin) };
}

/** Registrer en font i nettleseren for forhåndsvisning (CSS FontFace). */
const previewLoaded = new Set<string>();
export function ensurePreviewFont(entry: FontCatalogEntry): string {
  const name = `pv-${entry.id}`;
  if (previewLoaded.has(entry.id)) return name;
  previewLoaded.add(entry.id);
  const bundled = BUNDLED[entry.id];
  const weight = closestWeight(entry.weights, 400);
  const url = bundled
    ? bundled.files[`${closestWeight(Object.keys(bundled.files).map((x) => parseInt(x)), 400)}-normal`]
    : fontFileUrl(entry.id, entry.subsets.includes('latin') ? 'latin' : (entry.defSubset ?? entry.subsets[0]), weight, 'normal', 'woff2');
  try {
    const ff = new FontFace(name, `url(${url})`);
    ff.load()
      .then((f) => document.fonts.add(f))
      .catch(() => {});
  } catch {
    /* ignorer */
  }
  return name;
}

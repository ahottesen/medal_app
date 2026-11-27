// Gjør om ikon-, tekst- og bildeelementer til 2D-formdata (med hurtigbuffer).
import type { MedalDesign, MedalElement, ShapeData, TextElement } from '../model/types';
import { loadFont } from './fonts';
import { svgToShape } from './svgShape';
import { layoutText } from './text';
import { imageToShape } from './trace';

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ':' + s.length;
}

const cache = new Map<string, ShapeData>();
/** Sist kjente form per element – brukes mens en ny versjon beregnes (unngår blinking). */
const lastById = new Map<string, ShapeData>();
const inflight = new Map<string, Promise<ShapeData>>();

function textKey(el: TextElement): string {
  return JSON.stringify([
    el.text,
    el.font.id,
    el.font.weight,
    el.font.italic,
    el.size,
    el.letterSpacing,
    el.lineHeight,
    el.align,
    el.layout,
    el.radius,
    el.span,
  ]);
}

function keyFor(el: MedalElement): string | null {
  switch (el.kind) {
    case 'icon':
      return el.svg ? 'icon:' + hash(el.svg) : null;
    case 'text':
      return 'text:' + textKey(el);
    case 'image':
      return el.dataUrl ? `img:${hash(el.dataUrl)}:${el.threshold}:${el.invert}` : null;
    default:
      return null;
  }
}

async function compute(el: MedalElement): Promise<ShapeData> {
  switch (el.kind) {
    case 'icon':
      return svgToShape(el.svg);
    case 'text':
      return layoutText(el, await loadFont(el.font));
    case 'image':
      return imageToShape(el.dataUrl, el.threshold, el.invert);
    default:
      throw new Error('ukjent');
  }
}

export interface ResolveResult {
  shapes: Record<string, ShapeData>;
  errors: Record<string, string>;
  /** true hvis noe fortsatt lastes og et nytt bygg vil komme */
  loading: boolean;
}

/** Synkron variant: returnerer det som er klart, og starter lasting av resten. */
export function resolveShapes(d: MedalDesign, onReady: () => void): ResolveResult {
  const shapes: Record<string, ShapeData> = {};
  const errors: Record<string, string> = {};
  let loading = false;
  for (const el of d.elements) {
    if (!el.visible) continue;
    const key = keyFor(el);
    if (!key) continue;
    const hit = cache.get(key);
    if (hit) {
      shapes[el.id] = hit;
      lastById.set(el.id, hit);
      continue;
    }
    const err = failed.get(key);
    if (err) {
      errors[el.id] = err;
      continue;
    }
    loading = true;
    const stale = lastById.get(el.id);
    if (stale) shapes[el.id] = stale;
    if (!inflight.has(key)) {
      const p = compute(el);
      inflight.set(key, p);
      p.then(
        (s) => {
          cache.set(key, s);
          if (cache.size > 300) cache.delete(cache.keys().next().value!);
        },
        (e) => failed.set(key, e instanceof Error ? e.message : String(e)),
      ).finally(() => {
        inflight.delete(key);
        onReady();
      });
    }
  }
  return { shapes, errors, loading };
}

const failed = new Map<string, string>();

export function clearFailed() {
  failed.clear();
}

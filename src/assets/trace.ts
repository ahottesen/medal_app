// Raster-bilde → konturer med "marching squares" (glatte kanter med interpolasjon).
import type { FlatPoly, ShapeData } from '../model/types';
import { svgToShape } from './svgShape';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Kunne ikke lese bildet'));
    img.src = src;
  });
}

export function isSvgDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/svg+xml');
}

export function decodeSvgDataUrl(dataUrl: string): string {
  const [head, body] = dataUrl.split(',', 2);
  if (head.includes(';base64')) {
    const bin = atob(body);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(body);
}

export async function imageToShape(dataUrl: string, threshold: number, invert: boolean): Promise<ShapeData> {
  if (isSvgDataUrl(dataUrl)) return svgToShape(decodeSvgDataUrl(dataUrl));
  const img = await loadImage(dataUrl);
  const maxDim = 360;
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(2, Math.round(img.naturalWidth * s));
  const H = Math.max(2, Math.round(img.naturalHeight * s));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  // verdifelt med 1 px ramme av "bakgrunn"; høy verdi = innside
  const GW = W + 2;
  const GH = H + 2;
  const v = new Float32Array(GW * GH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const dark = 255 - lum; // mørk = innside
      v[(y + 1) * GW + (x + 1)] = invert ? lum : dark;
    }
  }
  const thr = invert ? threshold : 255 - threshold;
  return marchingSquares(v, GW, GH, thr);
}

function marchingSquares(v: Float32Array, W: number, H: number, thr: number): ShapeData {
  // Kant-ID: horisontal kant fra (x,y) til (x+1,y) = 2*(y*W+x), vertikal fra (x,y) til (x,y+1) = 2*(y*W+x)+1
  const hId = (x: number, y: number) => 2 * (y * W + x);
  const vId = (x: number, y: number) => 2 * (y * W + x) + 1;
  const pos = new Map<number, [number, number]>();
  const adj = new Map<number, number[]>();
  const val = (x: number, y: number) => v[y * W + x];
  const pt = (id: number): [number, number] => {
    let p = pos.get(id);
    if (p) return p;
    const horiz = id % 2 === 0;
    const base = id >> 1;
    const x = base % W;
    const y = Math.floor(base / W);
    const a = val(x, y);
    const b = horiz ? val(x + 1, y) : val(x, y + 1);
    const t = Math.abs(b - a) < 1e-6 ? 0.5 : Math.min(1, Math.max(0, (thr - a) / (b - a)));
    p = horiz ? [x + t, y] : [x, y + t];
    pos.set(id, p);
    return p;
  };
  const link = (a: number, b: number) => {
    pt(a);
    pt(b);
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = val(x, y) > thr ? 8 : 0;
      const tr = val(x + 1, y) > thr ? 4 : 0;
      const br = val(x + 1, y + 1) > thr ? 2 : 0;
      const bl = val(x, y + 1) > thr ? 1 : 0;
      const c = tl | tr | br | bl;
      if (c === 0 || c === 15) continue;
      const T = hId(x, y);
      const B = hId(x, y + 1);
      const L = vId(x, y);
      const R = vId(x + 1, y);
      switch (c) {
        case 1:
        case 14:
          link(L, B);
          break;
        case 2:
        case 13:
          link(B, R);
          break;
        case 3:
        case 12:
          link(L, R);
          break;
        case 4:
        case 11:
          link(T, R);
          break;
        case 6:
        case 9:
          link(T, B);
          break;
        case 7:
        case 8:
          link(L, T);
          break;
        case 5:
          link(T, R);
          link(L, B);
          break;
        case 10:
          link(L, T);
          link(B, R);
          break;
      }
    }
  }
  const visited = new Set<number>();
  const contours: FlatPoly[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < 1e6; guard++) {
      visited.add(cur);
      const p = pos.get(cur)!;
      loop.push(p[0], -p[1]);
      const nb = adj.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      if (next === undefined || next === start) break;
      if (visited.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 8) {
      contours.push(loop);
      for (let i = 0; i < loop.length; i += 2) {
        minX = Math.min(minX, loop[i]);
        maxX = Math.max(maxX, loop[i]);
        minY = Math.min(minY, loop[i + 1]);
        maxY = Math.max(maxY, loop[i + 1]);
      }
    }
  }
  if (!contours.length) return { ops: [], bounds: [0, 0, 1, 1], normalize: true };
  return { ops: [{ kind: 'fill', sub: false, rule: 'EvenOdd', contours }], bounds: [minX, minY, maxX, maxY], normalize: true };
}

// SVG → 2D-konturer (fyll og strek) ved hjelp av three.js sin SVGLoader.
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { FlatPoly, ShapeData, ShapeOp } from '../model/types';

const WHITE = new Set(['#fff', '#ffffff', 'white', 'rgb(255,255,255)', 'rgb(255, 255, 255)']);

function isWhite(c: string | undefined): boolean {
  return !!c && WHITE.has(c.trim().toLowerCase());
}

function isPaint(c: string | undefined): boolean {
  if (!c) return false;
  const v = c.trim().toLowerCase();
  return v !== 'none' && v !== 'transparent' && !v.startsWith('url(');
}

export function svgToShape(svg: string): ShapeData {
  const loader = new SVGLoader();
  // undertrykk advarsler om "currentColor" o.l.
  const warn = console.warn;
  console.warn = () => {};
  let data: ReturnType<SVGLoader['parse']>;
  try {
    data = loader.parse(svg);
  } finally {
    console.warn = warn;
  }
  const ops: ShapeOp[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, pad = 0) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + pad);
  };

  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as {
      fill?: string;
      fillOpacity?: number;
      fillRule?: string;
      stroke?: string;
      strokeWidth?: number;
      strokeOpacity?: number;
      strokeLineCap?: string;
      opacity?: number;
      visibility?: string;
    };
    if (style.visibility === 'hidden' || style.opacity === 0) continue;
    const subs: { pts: FlatPoly; closed: boolean }[] = [];
    for (const sp of path.subPaths) {
      const pts = sp.getPoints(16);
      const flat: number[] = [];
      for (const p of pts) flat.push(p.x, -p.y);
      subs.push({ pts: flat, closed: !!(sp as { autoClose?: boolean }).autoClose });
    }
    if (!subs.length) continue;
    const fill = style.fill ?? '#000';
    if (isPaint(fill) && style.fillOpacity !== 0) {
      const contours = subs.map((s) => s.pts).filter((p) => p.length >= 6);
      if (contours.length) {
        ops.push({
          kind: 'fill',
          sub: isWhite(fill),
          rule: style.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero',
          contours,
        });
        if (!isWhite(fill)) for (const c of contours) for (let i = 0; i < c.length; i += 2) grow(c[i], c[i + 1]);
      }
    }
    const sw = style.strokeWidth ?? 1;
    if (isPaint(style.stroke) && sw > 0 && style.strokeOpacity !== 0) {
      const cap = style.strokeLineCap === 'round' ? 'round' : style.strokeLineCap === 'square' ? 'square' : 'butt';
      ops.push({ kind: 'stroke', sub: isWhite(style.stroke), width: sw, cap, paths: subs });
      if (!isWhite(style.stroke)) for (const s of subs) for (let i = 0; i < s.pts.length; i += 2) grow(s.pts[i], s.pts[i + 1], sw / 2);
    }
  }
  // Ops som starter med 'sub' har ingenting å trekke fra – fjern dem
  while (ops.length && ops[0].sub) ops.shift();
  if (!isFinite(minX)) return { ops: [], bounds: [0, 0, 1, 1], normalize: true };
  return { ops, bounds: [minX, minY, maxX, maxY], normalize: true };
}

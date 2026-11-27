// Rene 2D-polygongeneratorer (ingen avhengigheter), brukt av geometri-workeren.
import type {
  FlatPoly,
  OutlineParams,
  PatternElement,
  RepeatItem,
  ShapeData,
  ShapeOp,
  WreathElement,
} from '../model/types';

export type Vec2 = [number, number];
export type Poly = Vec2[];

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function signedArea(p: Poly): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  }
  return a / 2;
}

export function ccw(p: Poly): Poly {
  return signedArea(p) < 0 ? p.slice().reverse() : p;
}

export function circlePts(cx: number, cy: number, r: number, n: number, start = 0): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * TAU;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function segsFor(r: number, quality = 1): number {
  // ca. 0.4 mm kantlengde, begrenset
  const n = Math.ceil((TAU * Math.max(r, 0.01)) / (0.45 / quality));
  return Math.max(12, Math.min(256, n));
}

export function transformPoly(p: Poly, m: Mat): Poly {
  return p.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
}

/** 2D affin matrise [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f */
export type Mat = [number, number, number, number, number, number];

export function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const matIdentity = (): Mat => [1, 0, 0, 1, 0, 0];
export const matTranslate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const matScale = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
export const matRotate = (deg: number): Mat => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, -s, c, 0, 0];
};

function quadBezier(p0: Vec2, c: Vec2, p1: Vec2, n: number): Poly {
  const out: Poly = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

export interface OutlineResult {
  /** Polygoner som skal slås sammen (union) */
  polys: Poly[];
  convex: boolean;
}

/** Lager konturen til en form, sentrert i origo. */
export function outlinePolys(p: OutlineParams, quality = 1): OutlineResult {
  const W = Math.max(0.5, p.width);
  const H = Math.max(0.5, p.height);
  const R = W / 2;
  let polys: Poly[] = [];
  let convex = false;

  switch (p.type) {
    case 'circle': {
      polys = [circlePts(0, 0, R, segsFor(R, quality))];
      convex = true;
      break;
    }
    case 'ellipse': {
      const n = segsFor(Math.max(W, H) / 2, quality);
      polys = [circlePts(0, 0, 1, n).map(([x, y]) => [(x * W) / 2, (y * H) / 2] as Vec2)];
      convex = true;
      break;
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(p.sides));
      const start = n % 2 === 0 ? 90 + 180 / n : 90;
      polys = [circlePts(0, 0, R, n, start * DEG)];
      convex = true;
      break;
    }
    case 'star': {
      const n = Math.max(3, Math.round(p.points));
      const r = R * clamp(p.inner, 0.05, 0.98);
      const pts: Poly = [];
      for (let i = 0; i < n * 2; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / n;
        const rr = i % 2 === 0 ? R : r;
        pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
      }
      polys = [pts];
      break;
    }
    case 'rosette': {
      const n = Math.max(3, Math.round(p.points));
      const b = R * Math.sin(Math.PI / n) * (0.45 + 0.9 * clamp(p.inner, 0, 1));
      const cr = R - b;
      polys.push(circlePts(0, 0, cr + b * 0.25, segsFor(cr, quality)));
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i * TAU) / n;
        polys.push(circlePts(cr * Math.cos(a), cr * Math.sin(a), b, segsFor(b, quality)));
      }
      break;
    }
    case 'gear': {
      const n = Math.max(4, Math.round(p.points));
      const depth = R * clamp(p.inner, 0.02, 0.6) * 0.5;
      const rr = R - depth;
      const pitch = TAU / n;
      const pts: Poly = [];
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI / 2 + i * pitch;
        const prof: [number, number][] = [
          [-0.5, rr],
          [-0.27, rr],
          [-0.15, R],
          [0.15, R],
          [0.27, rr],
        ];
        for (const [f, r] of prof) {
          const a = a0 + f * pitch;
          pts.push([r * Math.cos(a), r * Math.sin(a)]);
        }
      }
      polys = [pts];
      break;
    }
    case 'shield': {
      const hw = W / 2;
      const top = H / 2;
      const shoulder = H * 0.08;
      const tip: Vec2 = [0, -H / 2];
      const right = quadBezier([hw, shoulder], [hw, -H * 0.32], tip, 32);
      const left = quadBezier(tip, [-hw, -H * 0.32], [-hw, shoulder], 32).slice(1);
      // liten bue i toppen
      const topArc: Poly = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const x = -hw + t * W;
        topArc.push([x, top - H * 0.04 * Math.sin(t * Math.PI)]);
      }
      // høyre side ned til tuppen, venstre side opp, så toppen fra venstre mot høyre (lukkes automatisk)
      polys = [ccw([...right, ...left, ...topArc])];
      convex = true;
      break;
    }
    case 'heart': {
      const n = segsFor(Math.max(W, H) / 2, quality);
      const pts: Poly = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([(x / 32) * W, ((y + 2.5) / 29) * H]);
      }
      polys = [pts];
      break;
    }
    case 'rect': {
      polys = [
        [
          [-W / 2, -H / 2],
          [W / 2, -H / 2],
          [W / 2, H / 2],
          [-W / 2, H / 2],
        ],
      ];
      convex = true;
      break;
    }
    case 'banner': {
      polys = [bannerPoly(W, H, clamp(p.inner, 0, 1), p.bend)];
      break;
    }
  }
  if (p.rotation) polys = polys.map((q) => transformPoly(q, matRotate(p.rotation)));
  return { polys: polys.map(ccw), convex };
}

/** Banner/bånd med svalehale-ender, valgfritt bøyd langs en bue. */
function bannerPoly(W: number, H: number, notch: number, bend: number): Poly {
  const hw = W / 2;
  const hh = H / 2;
  const nd = notch * H * 0.9; // hakkdybde i x-retning
  const N = 48;
  const pts: Poly = [];
  // underkant fra høyre til venstre? Vi bygger: underkant v->h, høyre hakk, overkant h->v, venstre hakk
  for (let i = 0; i <= N; i++) pts.push([-hw + (i / N) * W, -hh]);
  pts.push([hw - nd, 0]);
  for (let i = 0; i <= N; i++) pts.push([hw - (i / N) * W, hh]);
  pts.push([-hw + nd, 0]);
  if (Math.abs(bend) < 0.5) return pts;
  const ang = bend * DEG;
  const Rb = W / ang; // radius til senterlinjen
  return pts.map(([x, y]) => {
    const phi = x / Rb;
    const r = Rb + y;
    return [r * Math.sin(phi), r * Math.cos(phi) - Rb] as Vec2;
  });
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

// ---------- Dekor-elementer → ShapeData ----------

function flat(p: Poly): FlatPoly {
  const out: number[] = [];
  for (const [x, y] of p) out.push(x, y);
  return out;
}

function fillOp(polys: Poly[], rule: 'NonZero' | 'EvenOdd' = 'NonZero', sub = false): ShapeOp {
  return { kind: 'fill', sub, rule, contours: polys.map(flat) };
}

function shapeFrom(ops: ShapeOp[]): ShapeData {
  return { ops, bounds: [0, 0, 0, 0], normalize: false };
}

/** Bue-bånd (ring eller del av ring), som ett polygon. */
export function arcBand(r: number, w: number, spanDeg: number, centerDeg: number, quality = 1): Poly[] {
  const r0 = Math.max(0.01, r - w / 2);
  const r1 = r + w / 2;
  if (spanDeg >= 359.9) {
    const n = segsFor(r1, quality);
    return [circlePts(0, 0, r1, n), circlePts(0, 0, r0, n).reverse()];
  }
  const span = spanDeg * DEG;
  const a0 = centerDeg * DEG - span / 2;
  const n = Math.max(4, Math.ceil((segsFor(r1, quality) * spanDeg) / 360));
  const pts: Poly = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * span;
    pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (i / n) * span;
    pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  // runde ender
  const out: Poly[] = [ccw(pts)];
  const capR = w / 2;
  for (const a of [a0, a0 + span]) {
    out.push(circlePts(r * Math.cos(a), r * Math.sin(a), capR, segsFor(capR, quality)));
  }
  return out;
}

export function ringShape(radius: number, width: number, span: number, angle: number, quality = 1): ShapeData {
  const polys = arcBand(radius, width, span, angle, quality);
  if (span >= 359.9) return shapeFrom([fillOp(polys, 'EvenOdd')]);
  return shapeFrom(polys.map((p) => fillOp([p])));
}

export function repeatItemPoly(item: RepeatItem, size: number, quality = 1): Poly {
  const base: OutlineParams = {
    type: 'circle',
    width: size,
    height: size,
    sides: 4,
    points: 5,
    inner: 0.45,
    corner: 0,
    rotation: 0,
    bend: 0,
  };
  switch (item) {
    case 'dot':
      return outlinePolys({ ...base, type: 'circle' }, quality).polys[0];
    case 'star':
      return outlinePolys({ ...base, type: 'star', inner: 0.42 }, quality).polys[0];
    case 'diamond':
      return outlinePolys({ ...base, type: 'polygon', sides: 4, rotation: 45, width: size * 1.0 }, quality).polys[0].map(
        ([x, y]) => [x * 0.7, y] as Vec2,
      );
    case 'heart':
      return outlinePolys({ ...base, type: 'heart' }, quality).polys[0];
    case 'square':
      return outlinePolys({ ...base, type: 'rect', width: size * 0.85, height: size * 0.85 }, quality).polys[0];
    case 'triangle':
      return outlinePolys({ ...base, type: 'polygon', sides: 3 }, quality).polys[0];
  }
}

export function repeatShape(
  item: RepeatItem,
  radius: number,
  count: number,
  spanDeg: number,
  angleDeg: number,
  itemSize: number,
  rotateItems: boolean,
  quality = 1,
): ShapeData {
  const n = Math.max(1, Math.round(count));
  const full = spanDeg >= 359.9;
  const proto = repeatItemPoly(item, itemSize, quality);
  const polys: Poly[] = [];
  for (let i = 0; i < n; i++) {
    let a: number;
    if (full) a = angleDeg + (i * 360) / n;
    else a = n === 1 ? angleDeg : angleDeg + spanDeg / 2 - (i * spanDeg) / (n - 1);
    const rot = rotateItems ? a - 90 : 0;
    const m = matMul(matTranslate(radius * Math.cos(a * DEG), radius * Math.sin(a * DEG)), matRotate(rot));
    polys.push(transformPoly(proto, m));
  }
  return shapeFrom(polys.map((p) => fillOp([p])));
}

function leafPoly(length: number, width: number): Poly {
  const n = 10;
  const top: Poly = [];
  const bot: Poly = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * length;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9);
    top.push([x, w]);
    bot.push([x, -w]);
  }
  return ccw([...bot, ...top.reverse().slice(1, -1)]);
}

export function wreathShape(el: WreathElement, quality = 1): ShapeData {
  const polys: Poly[] = [];
  const R = el.radius;
  const start = Math.max(0, el.gap / 2);
  const end = Math.max(start + 5, el.span);
  const N = Math.max(1, Math.round(el.leaves));
  const sides: number[] = el.sides === 'both' ? [1, -1] : el.sides === 'right' ? [1] : [-1];
  for (const side of sides) {
    // stilk
    const stemSpan = end - start;
    const stemCenter = -90 + side * (start + stemSpan / 2);
    if (el.stem > 0) polys.push(...arcBand(R, el.stem, stemSpan, stemCenter, quality));
    for (let k = 0; k < N; k++) {
      const f = (k + 0.35) / N;
      const phi = start + f * (end - start);
      const theta = (-90 + side * phi) * DEG;
      const px = R * Math.cos(theta);
      const py = R * Math.sin(theta);
      // tangent i vekstretning
      const tx = side > 0 ? -Math.sin(theta) : Math.sin(theta);
      const ty = side > 0 ? Math.cos(theta) : -Math.cos(theta);
      const tangentDeg = Math.atan2(ty, tx) / DEG;
      const scale = 1 - 0.35 * (k / Math.max(1, N));
      const L = el.leafLength * scale;
      const Wd = el.leafWidth * scale;
      const proto = leafPoly(L, Wd);
      const dirs: number[] = [];
      if (el.style === 'pairs') dirs.push(1, -1);
      else dirs.push(k % 2 === 0 ? 1 : -1);
      for (const d of dirs) {
        // d=1 utover, d=-1 innover
        const outwardSign = side > 0 ? -1 : 1;
        const rot = tangentDeg + d * outwardSign * el.leafAngle;
        const m = matMul(matTranslate(px, py), matRotate(rot));
        polys.push(transformPoly(proto, m));
      }
    }
    // toppblad
    const thetaEnd = (-90 + side * end) * DEG;
    const tx = side > 0 ? -Math.sin(thetaEnd) : Math.sin(thetaEnd);
    const ty = side > 0 ? Math.cos(thetaEnd) : -Math.cos(thetaEnd);
    const proto = leafPoly(el.leafLength * 0.7, el.leafWidth * 0.65);
    const m = matMul(matTranslate(R * Math.cos(thetaEnd), R * Math.sin(thetaEnd)), matRotate(Math.atan2(ty, tx) / DEG));
    polys.push(transformPoly(proto, m));
  }
  return shapeFrom(polys.map((p) => fillOp([p])));
}

export function patternShape(el: PatternElement, quality = 1): ShapeData {
  const R = Math.max(1, el.extent);
  const r0 = Math.max(0, el.innerRadius);
  const s = Math.max(0.3, el.spacing);
  const w = Math.max(0.1, el.lineWidth);
  const ops: ShapeOp[] = [];
  const stroke = (paths: { pts: FlatPoly; closed: boolean }[]): ShapeOp => ({
    kind: 'stroke',
    sub: false,
    width: w,
    cap: 'butt',
    paths,
  });
  switch (el.pattern) {
    case 'rays': {
      const n = Math.max(3, Math.round(el.count));
      const frac = clamp(w / s, 0.05, 0.95); // andel av hver sektor som er fylt
      const polys: Poly[] = [];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU + Math.PI / 2;
        const da = (TAU / n) * frac;
        const pts: Poly = [];
        const steps = Math.max(2, Math.ceil((da * R) / 1.5));
        for (let j = 0; j <= steps; j++) {
          const a = a0 - da / 2 + (j / steps) * da;
          pts.push([R * Math.cos(a), R * Math.sin(a)]);
        }
        if (r0 > 0) {
          for (let j = steps; j >= 0; j--) {
            const a = a0 - da / 2 + (j / steps) * da;
            pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
          }
        } else pts.push([0, 0]);
        polys.push(ccw(pts));
      }
      ops.push(...polys.map((p) => fillOp([p])));
      break;
    }
    case 'rings': {
      const polys: Poly[] = [];
      for (let r = Math.max(r0, w / 2) + s / 2; r + 0 < R; r += s) {
        polys.push(...arcBand(r, w, 360, 90, quality));
      }
      if (polys.length) ops.push(fillOp(polys, 'EvenOdd'));
      break;
    }
    case 'lines':
    case 'grid':
    case 'waves': {
      const paths: { pts: FlatPoly; closed: boolean }[] = [];
      const angles = el.pattern === 'grid' ? [0, 90] : [0];
      for (const ang of angles) {
        const m = matRotate(ang + 45 * (el.pattern === 'grid' ? 1 : 0));
        const k = Math.ceil(R / s) + 1;
        for (let i = -k; i <= k; i++) {
          const y = i * s;
          const pts: Poly = [];
          if (el.pattern === 'waves') {
            const amp = s * 0.3;
            const wl = s * 2.2;
            for (let x = -R - s; x <= R + s; x += wl / 10) pts.push([x, y + amp * Math.sin((x / wl) * TAU)]);
          } else {
            pts.push([-R - s, y], [R + s, y]);
          }
          paths.push({ pts: flat(transformPoly(pts, m)), closed: false });
        }
      }
      ops.push(stroke(paths));
      break;
    }
    case 'hex': {
      const paths: { pts: FlatPoly; closed: boolean }[] = [];
      const a = s / Math.sqrt(3); // sideslengde for celleavstand s
      const dx = s;
      const dy = 1.5 * a;
      let row = 0;
      for (let y = -R - dy; y <= R + dy; y += dy, row++) {
        const off = row % 2 ? dx / 2 : 0;
        for (let x = -R - dx + off; x <= R + dx; x += dx) {
          if (Math.hypot(x, y) > R + s) continue;
          const pts = circlePts(x, y, a, 6, Math.PI / 6);
          paths.push({ pts: flat(pts), closed: true });
        }
      }
      ops.push(stroke(paths));
      break;
    }
    case 'dots': {
      const polys: Poly[] = [];
      const dy = (s * Math.sqrt(3)) / 2;
      let row = 0;
      for (let y = -R; y <= R; y += dy, row++) {
        const off = row % 2 ? s / 2 : 0;
        for (let x = -R + off; x <= R; x += s) {
          if (Math.hypot(x, y) > R || Math.hypot(x, y) < r0) continue;
          polys.push(circlePts(x, y, w / 2, Math.max(8, segsFor(w / 2, quality))));
        }
      }
      ops.push(fillOp(polys));
      break;
    }
    case 'checker': {
      const polys: Poly[] = [];
      let i = 0;
      for (let y = -R - s; y <= R; y += s, i++) {
        let j = 0;
        for (let x = -R - s; x <= R; x += s, j++) {
          if ((i + j) % 2) continue;
          if (Math.hypot(x + s / 2, y + s / 2) > R + s) continue;
          polys.push([
            [x, y],
            [x + s, y],
            [x + s, y + s],
            [x, y + s],
          ]);
        }
      }
      ops.push(fillOp(polys));
      break;
    }
  }
  // Klipp til sirkel med radius R (og hull i midten)
  const clipOuter = circlePts(0, 0, R, segsFor(R, quality));
  return {
    ops: [
      ...ops,
      // Markør-op: brukes av byggeren til å klippe; representert som 'sub' av en stor ring utenfor R
      {
        kind: 'fill',
        sub: true,
        rule: 'EvenOdd',
        contours: [flat(circlePts(0, 0, R * 3 + 50, 64)), flat(clipOuter)],
      },
      ...(r0 > 0 && el.pattern !== 'rays' && el.pattern !== 'dots'
        ? [{ kind: 'fill', sub: true, rule: 'NonZero', contours: [flat(circlePts(0, 0, r0, segsFor(r0, quality)))] } as ShapeOp]
        : []),
    ],
    bounds: [0, 0, 0, 0],
    normalize: false,
  };
}

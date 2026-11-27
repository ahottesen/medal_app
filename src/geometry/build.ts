// Bygger 3D-modellen av en medalje med manifold-3d (vanntette, printbare meshes).
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  BuildRequest,
  BuildResult,
  BuildWarning,
  BuiltPart,
  MedalDesign,
  MedalElement,
  ShapeData,
  ShapeOp,
} from '../model/types';
import {
  ccw,
  circlePts,
  DEG,
  matMul,
  matRotate,
  matScale,
  matTranslate,
  outlinePolys,
  patternShape,
  repeatShape,
  ringShape,
  TAU,
  transformPoly,
  wreathShape,
  type Mat,
  type Poly,
  type Vec2,
} from './polys';

type CS = CrossSection;
type MF = Manifold;

const BIG = 1000;
const EPS = 0.01;

const QUALITY: Record<MedalDesign['print']['quality'], number> = { draft: 0.55, normal: 1, high: 1.8 };

export interface BuildContext {
  M: ManifoldToplevel;
  /** Registrerer et WASM-objekt for sletting etter bygging */
  track: <T extends { delete(): void }>(x: T) => T;
}

/** Kjør bygging og frigjør alt WASM-minne etterpå. */
export function buildMedal(M: ManifoldToplevel, req: BuildRequest): BuildResult {
  const t0 = performance.now();
  const garbage: { delete(): void }[] = [];
  const ctx: BuildContext = {
    M,
    track: (x) => {
      garbage.push(x);
      return x;
    },
  };
  try {
    const res = buildInner(ctx, req);
    res.timeMs = performance.now() - t0;
    return res;
  } catch (e) {
    console.error(e);
    return {
      seq: req.seq,
      parts: [],
      elementBounds: {},
      faceZ: req.design.base.thickness,
      size: [0, 0, 0],
      warnings: [],
      timeMs: performance.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    for (const g of garbage) {
      try {
        g.delete();
      } catch {
        /* allerede slettet */
      }
    }
  }
}

function buildInner(ctx: BuildContext, req: BuildRequest): BuildResult {
  const { M, track: T } = ctx;
  const CSx = M.CrossSection;
  const MFx = M.Manifold;
  const d = req.design;
  const q = QUALITY[d.print.quality] ?? 1;
  M.setMinCircularAngle(Math.max(2, 7.5 / q));
  M.setMinCircularEdgeLength(Math.max(0.12, 0.45 / q));

  const warnings: BuildWarning[] = [];
  const elementBounds: Record<string, [number, number, number, number]> = {};

  const csOf = (polys: Poly[], rule: 'NonZero' | 'EvenOdd' | 'Positive' = 'NonZero'): CS =>
    T(CSx.ofPolygons(polys.filter((p) => p.length >= 3) as Vec2[][], rule));
  const extrude = (cs: CS, h: number, z = 0): MF => {
    const m = T(MFx.extrude(cs, Math.max(EPS, h)));
    return z !== 0 ? T(m.translate([0, 0, z])) : m;
  };
  const round = (cs: CS, r: number): CS => {
    if (r <= 0.001) return cs;
    // avrund konvekse og konkave hjørner
    const a = T(T(cs.offset(-r, 'Round')).offset(r, 'Round'));
    return T(T(a.offset(r, 'Round')).offset(-r, 'Round'));
  };

  const thickness = Math.max(0.4, d.base.thickness);
  const faceZ = thickness;

  // ---------- Kontur ----------
  const outline = outlinePolys(d.outline, q);
  let mainCs = round(csOf(outline.polys), d.outline.type === 'circle' || d.outline.type === 'ellipse' ? 0 : d.outline.corner);
  if (mainCs.isEmpty()) throw new Error('Medaljeformen er tom – sjekk målene.');
  const mainPolys = mainCs.toPolygons() as Poly[];

  // Riller i kanten (som på mynter)
  let baseOutline = mainCs;
  if (d.edge.reeding.enabled && d.edge.reeding.count > 0 && d.edge.reeding.depth > 0) {
    const notches = reedingNotches(mainPolys, d.edge.reeding.count, d.edge.reeding.depth, d.edge.reeding.width);
    baseOutline = T(mainCs.subtract(csOf(notches, 'Positive')));
  }

  // ---------- Oppheng ----------
  const hang = hangerGeometry(d, mainPolys, q);
  const tabCs = hang.tab.length ? round(csOf(hang.tab, 'Positive'), 0) : null;
  const holeCs = hang.holes.length ? csOf(hang.holes, 'Positive') : null;
  if (hang.warning) warnings.push({ level: 'warn', message: hang.warning });

  // ---------- Grunnplate + kant ----------
  const hangerThickness = d.hanger.thickness > 0 ? Math.min(d.hanger.thickness, thickness) : thickness;
  const rimW = d.rim.enabled ? Math.max(0.2, d.rim.width) : 0;
  const rimH = d.rim.enabled ? Math.max(0, d.rim.height) : 0;
  const hasRim = d.rim.enabled && rimW > 0 && rimH > 0;
  const topZ = faceZ + (hasRim ? rimH : 0);
  const bottom = Math.min(Math.max(0, d.edge.bottomChamfer), thickness / 2);
  let edgeSize = d.edge.profile === 'none' ? 0 : Math.max(0, d.edge.size);
  if (hasRim) edgeSize = Math.min(edgeSize, Math.max(0, rimW - 0.2));
  edgeSize = Math.max(0, Math.min(edgeSize, topZ - bottom - 0.2));
  const prof = makeProfile(topZ, edgeSize, d.edge.profile, bottom);
  const mainConvex = outline.convex && !d.edge.reeding.enabled;

  let baseSolid = profiledSolid(ctx, baseOutline, mainConvex, prof, 0, faceZ, warnings);
  const rimParts: MF[] = [];
  let faceInset = 0;
  if (d.rim.enabled && rimW > 0) {
    faceInset = rimW;
    const inner = T(mainCs.offset(-rimW, 'Round'));
    if (hasRim) {
      const outer = profiledSolid(ctx, baseOutline, mainConvex, prof, faceZ, topZ, warnings);
      rimParts.push(T(outer.subtract(extrude(inner, BIG, faceZ - 1))));
    }
    if (d.rim.inner.enabled && d.rim.inner.width > 0) {
      const o = T(mainCs.offset(-(rimW + d.rim.inner.gap), 'Round'));
      const i = T(mainCs.offset(-(rimW + d.rim.inner.gap + d.rim.inner.width), 'Round'));
      const ring = T(o.subtract(i));
      const h = d.rim.inner.height > 0 ? d.rim.inner.height : rimH;
      if (!ring.isEmpty() && h > 0) rimParts.push(extrude(ring, h, faceZ));
    }
  } else if (d.edge.profile !== 'none') {
    faceInset = edgeSize;
  }
  const faceCs = faceInset > 0 ? T(mainCs.offset(-faceInset, 'Round')) : mainCs;

  if (tabCs) {
    const tabProf = makeProfile(
      hangerThickness,
      Math.min(edgeSize, hangerThickness / 2),
      d.edge.profile,
      Math.min(bottom, hangerThickness / 3),
    );
    const tabSolid = profiledSolid(ctx, tabCs, true, tabProf, 0, hangerThickness, warnings);
    baseSolid = T(MFx.union([baseSolid, tabSolid]));
  }
  const bodyOutline = tabCs ? T(baseOutline.add(tabCs)) : baseOutline;

  // ---------- Fargedeler ----------
  const parts = new Map<string, MF>();
  const bboxOverlap = (a: MF, b: MF) => {
    const A = a.boundingBox();
    const B = b.boundingBox();
    return !(A.max[0] < B.min[0] || B.max[0] < A.min[0] || A.max[1] < B.min[1] || B.max[1] < A.min[1] || A.max[2] < B.min[2] || B.max[2] < A.min[2]);
  };
  const addSolid = (color: string, S: MF) => {
    if (S.isEmpty()) return;
    for (const [c, P] of parts) {
      if (c !== color && bboxOverlap(P, S)) parts.set(c, T(P.subtract(S)));
    }
    const cur = parts.get(color);
    parts.set(color, cur ? T(MFx.union([cur, S])) : S);
  };
  const subtractAll = (C: MF) => {
    if (C.isEmpty()) return;
    for (const [c, P] of parts) {
      if (bboxOverlap(P, C)) parts.set(c, T(P.subtract(C)));
    }
  };

  addSolid(d.base.color, baseSolid);
  if (rimParts.length) addSolid(d.rim.color, rimParts.length === 1 ? rimParts[0] : T(MFx.union(rimParts)));

  // ---------- Elementer ----------
  const nozzle = Math.max(0.1, d.print.nozzle);
  const backClip = T(mainCs.offset(-0.8, 'Round'));
  for (const el of d.elements) {
    if (!el.visible) continue;
    let cs: CS | null;
    try {
      cs = elementCs(ctx, el, req.shapes[el.id], q);
    } catch (e) {
      warnings.push({ elementId: el.id, level: 'warn', message: `«${el.name}» kunne ikke bygges: ${(e as Error).message}` });
      continue;
    }
    if (!cs) continue;
    if (Math.abs(el.bold) > 0.001) cs = T(cs.offset(el.bold, 'Round'));
    if (el.outline > 0) {
      const o = T(cs.offset(el.outline / 2, 'Round'));
      const i = T(cs.offset(-el.outline / 2, 'Round'));
      cs = T(o.subtract(i));
    }
    if (el.clip) cs = T(cs.intersect(el.side === 'back' ? backClip : faceCs));
    if (cs.isEmpty()) {
      warnings.push({ elementId: el.id, level: 'info', message: `«${el.name}» havnet utenfor medaljeflaten.` });
      continue;
    }
    const b = cs.bounds();
    elementBounds[el.id] = [b.min[0], b.min[1], b.max[0], b.max[1]];

    // tynne detaljer
    const area = cs.area();
    if (area > 0.01) {
      const r = nozzle * 0.45;
      const opened = T(T(cs.offset(-r, 'Round')).offset(r, 'Round'));
      const lost = 1 - opened.area() / area;
      if (lost > 0.12) {
        warnings.push({
          elementId: el.id,
          level: 'warn',
          message: `«${el.name}» har detaljer tynnere enn dysa (${nozzle} mm) – ca. ${Math.round(lost * 100)} % kan forsvinne. Gjør elementet større eller bruk «Forsterk».`,
        });
      }
    }
    if (el.height < d.print.layerHeight - 1e-6 && el.mode !== 'cut') {
      warnings.push({ elementId: el.id, level: 'warn', message: `«${el.name}» er lavere enn ett lag (${d.print.layerHeight} mm).` });
    }

    const h = Math.max(EPS, el.height);
    if (el.side === 'back') {
      if (el.mode === 'cut') {
        subtractAll(extrude(cs, BIG, -1));
      } else {
        const depth = Math.min(h, thickness - 0.2);
        if (el.mode === 'raise') {
          warnings.push({ elementId: el.id, level: 'info', message: `«${el.name}» på baksiden graveres (opphøyd bakside kan ikke printes flatt).` });
        }
        subtractAll(extrude(cs, depth + 1, -1));
        if (el.mode === 'inlay') addSolid(el.color, extrude(cs, depth, 0));
      }
      continue;
    }
    const surface = faceZ + el.z;
    // Sørg for at ingenting svever: fyll under deler som er løftet over ingenting
    // eller som stikker utenfor medaljen (f.eks. bannerender).
    const withSupport = (S: MF, bottomZ: number): MF => {
      if (bottomZ <= 0.001) return S;
      if (el.z > 0.01) {
        let fill = extrude(cs, bottomZ, 0);
        for (const P of parts.values()) if (bboxOverlap(P, fill)) fill = T(fill.subtract(P));
        if (fill.isEmpty() || fill.volume() < 0.05) return S;
        return T(MFx.union([S, fill]));
      }
      const outside = T(cs.subtract(bodyOutline));
      if (outside.isEmpty() || outside.area() < 0.01) return S;
      return T(MFx.union([S, extrude(outside, bottomZ, 0)]));
    };
    switch (el.mode) {
      case 'raise':
        addSolid(el.color, withSupport(extrude(cs, h, surface), surface));
        break;
      case 'engrave':
        if (surface - h < 0.4) warnings.push({ elementId: el.id, level: 'warn', message: `«${el.name}» graveres nesten gjennom medaljen.` });
        subtractAll(extrude(cs, BIG, surface - h));
        break;
      case 'inlay':
        subtractAll(extrude(cs, BIG, surface - h));
        addSolid(el.color, withSupport(extrude(cs, h, surface - h), surface - h));
        break;
      case 'cut':
        subtractAll(extrude(cs, BIG, -1));
        break;
    }
  }

  // ---------- Magnetlomme ----------
  if (d.magnet.enabled && d.magnet.diameter > 0 && d.magnet.depth > 0) {
    const r = d.magnet.diameter / 2;
    const pocket = csOf([circlePts(d.magnet.x, d.magnet.y, r, Math.max(24, Math.ceil(TAU * r / 0.4)))]);
    subtractAll(extrude(pocket, d.magnet.depth + 1, -1));
    if (thickness - d.magnet.depth < 0.8) {
      warnings.push({ level: 'warn', message: 'Magnetlommen er nesten like dyp som medaljen er tykk.' });
    }
  }

  // ---------- Hull gjennom alt (oppheng) ----------
  if (holeCs) subtractAll(extrude(holeCs, BIG, -1));

  // ---------- Resultat ----------
  const out: BuiltPart[] = [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const [colorId, P] of parts) {
    if (P.isEmpty()) continue;
    const mesh = P.getMesh();
    const np = mesh.numProp;
    let positions: Float32Array;
    if (np === 3) positions = new Float32Array(mesh.vertProperties);
    else {
      const nv = mesh.vertProperties.length / np;
      positions = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) {
        positions[i * 3] = mesh.vertProperties[i * np];
        positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
        positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
      }
    }
    const bb = P.boundingBox();
    min = min.map((v, i) => Math.min(v, bb.min[i]));
    max = max.map((v, i) => Math.max(v, bb.max[i]));
    out.push({
      colorId,
      positions,
      indices: new Uint32Array(mesh.triVerts),
      volume: P.volume(),
      minZ: bb.min[2],
      maxZ: bb.max[2],
    });
  }
  return {
    seq: req.seq,
    parts: out,
    elementBounds,
    faceZ,
    size: out.length ? [max[0] - min[0], max[1] - min[1], max[2] - min[2]] : [0, 0, 0],
    warnings,
    timeMs: 0,
  };
}

// ---------- Hjelpefunksjoner ----------

function supportDistance(polys: Poly[], dir: Vec2): number {
  let e = -Infinity;
  for (const p of polys) for (const [x, y] of p) e = Math.max(e, x * dir[0] + y * dir[1]);
  return e;
}

function roundedRectPoly(w: number, h: number, r: number, segs = 8): Poly {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r < 0.01) {
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
  }
  const pts: Poly = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, -h / 2 + r, -90],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = (a0 + (i / segs) * 90) * DEG;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function hull(points: Vec2[]): Poly {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function hangerGeometry(d: MedalDesign, mainPolys: Poly[], q: number): { tab: Poly[]; holes: Poly[]; warning?: string } {
  const h = d.hanger;
  if (h.type === 'none') return { tab: [], holes: [] };
  const a = h.angle * DEG;
  const dir: Vec2 = [Math.cos(a), Math.sin(a)];
  const e = supportDistance(mainPolys, dir);
  const at = (dist: number): Vec2 => [dir[0] * dist, dir[1] * dist];
  const seg = (r: number) => Math.max(24, Math.min(128, Math.ceil((TAU * r) / (0.4 / q))));
  const rot = matRotate(h.angle - 90);

  if (h.type === 'loop') {
    const R = Math.max(1, h.outer / 2);
    const rh = Math.min(Math.max(0.2, h.hole / 2), R - 0.8);
    const c = at(e + R - h.overlap);
    const inner = at(e - R * 0.6 - h.overlap * 0.5);
    const tab = hull([...circlePts(c[0], c[1], R, seg(R)), ...circlePts(inner[0], inner[1], R * 0.85, seg(R))]);
    const hole = circlePts(c[0], c[1], rh, seg(rh));
    const warning = e + R - h.overlap - rh < e + 0.6 ? 'Hullet i øyet går inn i medaljen – øk ytre diameter eller reduser overlapp.' : undefined;
    return { tab: [tab], holes: [hole], warning };
  }
  if (h.type === 'slot') {
    const sw = Math.max(2, h.slotWidth);
    const sh = Math.max(0.8, h.slotHeight);
    const wall = Math.max(0.8, h.wall);
    const tw = sw + 2 * wall;
    const th = sh + 2 * wall;
    const centerDist = e + th / 2 - h.overlap + 0.6;
    const c = at(centerDist);
    const outer = transformPoly(roundedRectPoly(tw, th, Math.min(th / 2, wall + sh / 2)), matMul(matTranslate(c[0], c[1]), rot));
    const base = at(e - wall - h.overlap);
    const neck = transformPoly(roundedRectPoly(tw * 0.9, 1, 0.3), matMul(matTranslate(base[0], base[1]), rot));
    const tab = hull([...outer, ...neck]);
    const slot = transformPoly(roundedRectPoly(sw, sh, sh / 2), matMul(matTranslate(c[0], c[1]), rot));
    const slotInner = centerDist - sh / 2;
    const warning = slotInner < e + 0.3 ? 'Båndspalten går inn i medaljen – reduser overlapp.' : undefined;
    return { tab: [tab], holes: [slot], warning };
  }
  // hole
  const rh = Math.max(0.5, h.hole / 2);
  const inset = (d.rim.enabled ? d.rim.width : 0) + Math.max(1.2, h.wall);
  const c = at(e - inset - rh + h.overlap * 0);
  return { tab: [], holes: [circlePts(c[0], c[1], rh, seg(rh))] };
}

function reedingNotches(mainPolys: Poly[], count: number, depth: number, width: number): Poly[] {
  // bruk den største konturen
  let best = mainPolys[0];
  let bestLen = 0;
  for (const p of mainPolys) {
    let L = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (L > bestLen) {
      bestLen = L;
      best = p;
    }
  }
  const poly = ccw(best);
  const cum: number[] = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[cum.length - 1];
  const out: Poly[] = [];
  const n = Math.max(1, Math.round(count));
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * L;
    while (seg < poly.length - 1 && cum[seg + 1] < s) seg++;
    const a = poly[seg];
    const b = poly[(seg + 1) % poly.length];
    const segLen = Math.max(1e-9, cum[seg + 1] - cum[seg]);
    const t = (s - cum[seg]) / segLen;
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const tx = (b[0] - a[0]) / segLen;
    const ty = (b[1] - a[1]) / segLen;
    // utover-normal for CCW-polygon
    const nx = ty;
    const ny = -tx;
    const hw = width / 2;
    out.push(
      ccw([
        [px - tx * hw - nx * depth, py - ty * hw - ny * depth],
        [px + tx * hw - nx * depth, py + ty * hw - ny * depth],
        [px + tx * hw + nx * depth, py + ty * hw + ny * depth],
        [px - tx * hw + nx * depth, py - ty * hw + ny * depth],
      ]),
    );
  }
  return out;
}

type Profile = [number, number][]; // [z, innrykk], sortert på z

/** Kantprofil: bunnfas + fas/avrunding i toppen, som stykkevis lineær funksjon av z. */
function makeProfile(topZ: number, size: number, kind: MedalDesign['edge']['profile'], bottom: number): Profile {
  const prof: Profile = [];
  if (bottom > 0) prof.push([0, bottom], [bottom, 0]);
  else prof.push([0, 0]);
  if (size > 0 && kind !== 'none') {
    const k = kind === 'chamfer' ? 1 : 10;
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const dz = size * t;
      const inset = kind === 'chamfer' ? dz : size - Math.sqrt(Math.max(0, size * size - dz * dz));
      prof.push([topZ - size + dz, inset]);
    }
  } else prof.push([topZ, 0]);
  prof.sort((a, b) => a[0] - b[0]);
  return prof;
}

function insetAt(prof: Profile, z: number): number {
  if (z <= prof[0][0]) return prof[0][1];
  for (let i = 0; i < prof.length - 1; i++) {
    const [z0, i0] = prof[i];
    const [z1, i1] = prof[i + 1];
    if (z <= z1) return z1 - z0 < 1e-9 ? Math.max(i0, i1) : i0 + ((i1 - i0) * (z - z0)) / (z1 - z0);
  }
  return prof[prof.length - 1][1];
}

/** Nivåer [z, innrykk] mellom za og zb; fine=true deler skrå partier i 0,1 mm-trinn. */
function profileLevels(prof: Profile, za: number, zb: number, fine: boolean): Profile {
  const zs = new Set<number>([za, zb]);
  for (const [z] of prof) if (z > za && z < zb) zs.add(z);
  const sorted = [...zs].sort((a, b) => a - b);
  const out: Profile = [];
  for (let i = 0; i < sorted.length; i++) {
    const z = sorted[i];
    out.push([z, insetAt(prof, z)]);
    if (fine && i < sorted.length - 1) {
      const z1 = sorted[i + 1];
      const i0 = insetAt(prof, z);
      const i1 = insetAt(prof, z1);
      if (Math.abs(i1 - i0) > 1e-6) {
        const steps = Math.max(1, Math.ceil((z1 - z) / 0.1));
        for (let s = 1; s < steps; s++) {
          const zz = z + ((z1 - z) * s) / steps;
          out.push([zz, insetAt(prof, zz)]);
        }
      }
    }
  }
  return out;
}

/** Ekstruderer en kontur mellom za og zb med kantprofil. */
function profiledSolid(
  ctx: BuildContext,
  outline: CS,
  convex: boolean,
  prof: Profile,
  za: number,
  zb: number,
  warnings: BuildWarning[],
): MF {
  const { M, track: T } = ctx;
  const plain = () => T(T(M.Manifold.extrude(outline, Math.max(EPS, zb - za))).translate([0, 0, za]));
  const levels = profileLevels(prof, za, zb, !convex);
  if (levels.every(([, i]) => i < 1e-4)) return plain();
  if (convex) {
    const slabs: MF[] = [];
    for (const [z, inset] of levels) {
      const cs = inset > 1e-4 ? T(outline.offset(-inset, 'Round')) : outline;
      if (cs.isEmpty()) continue;
      const zz = Math.min(Math.max(z, za), zb - EPS);
      slabs.push(T(T(M.Manifold.extrude(cs, EPS)).translate([0, 0, zz])));
    }
    return T(M.Manifold.hull(slabs));
  }
  try {
    return steppedSolid(ctx, outline, levels);
  } catch (e) {
    console.warn('Trappetrinn-profil feilet, bruker rett kant', e);
    warnings.push({ level: 'info', message: 'Kantprofilen kunne ikke lages for denne formen – bruker rett kant.' });
    return plain();
  }
}

/**
 * Bygger et "trappetrinn"-volum direkte som mesh (uten boolske operasjoner):
 * hvert nivå er konturen forskjøvet innover, med vegger og ringflater mellom nivåene.
 */
function steppedSolid(ctx: BuildContext, outline: CS, levels: Profile): MF {
  const { M, track: T } = ctx;
  type Prism = { z0: number; z1: number; s: number; polys: Poly[] };
  const cache = new Map<number, Poly[]>();
  const section = (s: number): Poly[] => {
    const key = Math.round(s * 1e4);
    let polys = cache.get(key);
    if (!polys) {
      const cs = s > 1e-4 ? T(outline.offset(-s, 'Round')) : outline;
      polys = (cs.toPolygons() as Poly[]).filter((p) => p.length >= 3);
      cache.set(key, polys);
    }
    return polys;
  };
  const prisms: Prism[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const z0 = levels[i][0];
    const z1 = levels[i + 1][0];
    if (z1 - z0 < 1e-6) continue;
    let s = Math.max(levels[i][1], levels[i + 1][1]);
    const last = prisms[prisms.length - 1];
    if (last && Math.abs(last.s - s) < 0.025) {
      last.z1 = z1;
      continue;
    }
    if (s < 1e-4) s = 0;
    const polys = section(s);
    if (!polys.length) break;
    prisms.push({ z0, z1, s, polys });
  }
  if (!prisms.length) throw new Error('tom profil');

  const pos: number[] = [];
  const tri: number[] = [];
  const ring = (polys: Poly[], z: number): number[][] =>
    polys.map((p) =>
      p.map(([x, y]) => {
        pos.push(x, y, z);
        return pos.length / 3 - 1;
      }),
    );
  const bot = prisms.map((P) => ring(P.polys, P.z0));
  const top = prisms.map((P) => ring(P.polys, P.z1));
  // vegger
  prisms.forEach((P, k) => {
    P.polys.forEach((p, c) => {
      const B = bot[k][c];
      const U = top[k][c];
      const n = p.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri.push(B[i], B[j], U[j], B[i], U[j], U[i]);
      }
    });
  });
  const tess = (polys: Poly[], idx: number[][], flip: boolean) => {
    const flatIdx = idx.flat();
    const tris = M.triangulate(polys as Vec2[][]);
    for (const t of tris) {
      const a = flatIdx[t[0]];
      const b = flatIdx[t[1]];
      const c = flatIdx[t[2]];
      if (flip) tri.push(a, c, b);
      else tri.push(a, b, c);
    }
  };
  const rev = <X,>(a: X[]) => a.slice().reverse();
  tess(prisms[0].polys, bot[0], true);
  const L = prisms.length - 1;
  tess(prisms[L].polys, top[L], false);
  for (let k = 0; k < L; k++) {
    const A = prisms[k];
    const B = prisms[k + 1];
    if (B.s > A.s) {
      tess([...A.polys, ...B.polys.map(rev)], [...top[k], ...bot[k + 1].map(rev)], false);
    } else {
      tess([...B.polys, ...A.polys.map(rev)], [...bot[k + 1], ...top[k].map(rev)], true);
    }
  }
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) });
  const mf = T(new M.Manifold(mesh));
  if (mf.status() !== 'NoError') throw new Error('ugyldig mesh: ' + mf.status());
  if (mf.volume() <= 0) throw new Error('negativt volum');
  return mf;
}

/** Matrise for element: lokal → verden */
function elementMatrix(el: MedalElement, shape: ShapeData | undefined): { m: Mat; scale: number } {
  let s = 1;
  let pre: Mat = [1, 0, 0, 1, 0, 0];
  if (shape?.normalize) {
    const [x0, y0, x1, y1] = shape.bounds;
    const w = x1 - x0;
    const h = y1 - y0;
    const size = (el as { size?: number }).size ?? 20;
    s = size / Math.max(1e-6, Math.max(w, h));
    pre = matMul(matScale(s), matTranslate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }
  let m = matMul(matRotate(el.rotation), el.mirror ? matMul(matScale(-1, 1), pre) : pre);
  m = matMul(matTranslate(el.x, el.y), m);
  if (el.side === 'back') m = matMul(matScale(-1, 1), m);
  return { m, scale: s };
}

function elementLocalShape(el: MedalElement, shapes: ShapeData | undefined, q: number): ShapeData | undefined {
  switch (el.kind) {
    case 'icon':
    case 'text':
    case 'image':
      return shapes;
    case 'shape': {
      const o = outlinePolys(el.shape, q);
      return {
        ops: [{ kind: 'fill', sub: false, rule: 'NonZero', contours: o.polys.map((p) => p.flat()) }],
        bounds: [0, 0, 0, 0],
        normalize: false,
      };
    }
    case 'ring':
      return ringShape(el.radius, el.width, el.span, el.angle, q);
    case 'repeat':
      return repeatShape(el.item, el.radius, el.count, el.span, el.angle, el.itemSize, el.rotateItems, q);
    case 'wreath':
      return wreathShape(el, q);
    case 'pattern':
      return patternShape(el, q);
  }
}

function elementCs(ctx: BuildContext, el: MedalElement, provided: ShapeData | undefined, q: number): CS | null {
  const shape = elementLocalShape(el, provided, q);
  if (!shape || !shape.ops.length) return null;
  const { m, scale } = elementMatrix(el, shape);
  let cs = shapeDataToCs(ctx, shape, m, scale);
  if (el.kind === 'shape' && el.shape.corner > 0 && el.shape.type !== 'circle' && el.shape.type !== 'ellipse') {
    const { track: T } = ctx;
    const r = el.shape.corner;
    const a = T(T(cs.offset(-r, 'Round')).offset(r, 'Round'));
    cs = T(T(a.offset(r, 'Round')).offset(-r, 'Round'));
  }
  if (el.kind === 'image' && (el as { smooth: number }).smooth > 0) {
    const { track: T } = ctx;
    const r = (el as { smooth: number }).smooth;
    cs = T(T(T(cs.offset(r, 'Round')).offset(-2 * r, 'Round')).offset(r, 'Round'));
  }
  return cs;
}

function toPoly(flatPts: number[], m: Mat): Poly {
  const out: Poly = [];
  for (let i = 0; i + 1 < flatPts.length; i += 2) {
    const x = flatPts[i];
    const y = flatPts[i + 1];
    out.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  }
  return out;
}

export function shapeDataToCs(ctx: BuildContext, shape: ShapeData, m: Mat, scale: number): CS {
  const { M, track: T } = ctx;
  const CSx = M.CrossSection;
  let acc: CS | null = null;
  let pending: CS[] = [];
  const flush = () => {
    if (!pending.length) return;
    const list = acc ? [acc, ...pending] : pending;
    acc = list.length === 1 ? list[0] : T(CSx.union(list));
    pending = [];
  };
  for (const op of shape.ops) {
    const cs = opToCs(ctx, op, m, scale);
    if (!cs) continue;
    if (op.sub) {
      flush();
      if (acc) acc = T((acc as CS).subtract(cs));
    } else pending.push(cs);
  }
  flush();
  return acc ?? T(CSx.ofPolygons([], 'NonZero'));
}

function opToCs(ctx: BuildContext, op: ShapeOp, m: Mat, scale: number): CS | null {
  const { M, track: T } = ctx;
  if (op.kind === 'fill') {
    const polys = op.contours.filter((c) => c.length >= 6).map((c) => toPoly(c, m));
    if (!polys.length) return null;
    return T(M.CrossSection.ofPolygons(polys as Vec2[][], op.rule));
  }
  const r = (op.width * scale) / 2;
  if (r < 0.005) return null;
  const segs = Math.max(8, Math.min(32, Math.ceil((TAU * r) / 0.3)));
  const polys: Poly[] = [];
  const circle = (p: Vec2) => polys.push(circlePts(p[0], p[1], r, segs));
  for (const path of op.paths) {
    const raw = toPoly(path.pts, m);
    const pts: Poly = [];
    for (const p of raw) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) pts.push(p);
    }
    let closed = path.closed;
    if (pts.length > 2) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) {
        pts.pop();
        closed = true;
      }
    }
    const n = pts.length;
    if (n === 0) continue;
    if (n === 1) {
      if (op.cap === 'round') circle(pts[0]);
      continue;
    }
    const segCount = closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      let a = pts[i];
      let b = pts[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const ux = dx / len;
      const uy = dy / len;
      if (!closed && op.cap === 'square') {
        if (i === 0) a = [a[0] - ux * r, a[1] - uy * r];
        if (i === segCount - 1) b = [b[0] + ux * r, b[1] + uy * r];
      }
      const nx = -uy * r;
      const ny = ux * r;
      polys.push(
        ccw([
          [a[0] + nx, a[1] + ny],
          [a[0] - nx, a[1] - ny],
          [b[0] - nx, b[1] - ny],
          [b[0] + nx, b[1] + ny],
        ]),
      );
    }
    for (let i = 0; i < n; i++) {
      const isEnd = !closed && (i === 0 || i === n - 1);
      if (isEnd) {
        if (op.cap === 'round') circle(pts[i]);
        continue;
      }
      // ledd: hopp over nesten rette knekk (gapet blir < r·θ²/8)
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      let turn = Math.abs(a2 - a1);
      if (turn > Math.PI) turn = TAU - turn;
      if (turn * turn * r > 0.02) circle(p1);
    }
  }
  if (!polys.length) return null;
  return T(M.CrossSection.ofPolygons(polys as Vec2[][], 'Positive'));
}

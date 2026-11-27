// Tekstlayout: rett tekst (flere linjer) og tekst langs bue, til 2D-konturer i mm.
import type { Font, Glyph, PathCommand } from 'opentype.js';
import type { FlatPoly, ShapeData, ShapeOp, TextElement } from '../model/types';
import type { LoadedFont } from './fonts';

interface PlacedGlyph {
  font: Font;
  glyph: Glyph;
  /** x-posisjon (venstre kant) langs linjen, mm */
  x: number;
  advance: number;
}

function capRatio(font: Font): number {
  const os2 = (font.tables as { os2?: { sCapHeight?: number } }).os2;
  if (os2?.sCapHeight && os2.sCapHeight > 0) return os2.sCapHeight / font.unitsPerEm;
  const H = font.charToGlyph('H');
  if (H && H.index > 0) {
    const bb = H.getBoundingBox();
    if (bb.y2 > 0) return bb.y2 / font.unitsPerEm;
  }
  return 0.7;
}

function pickGlyph(fonts: Font[], ch: string): { font: Font; glyph: Glyph } {
  for (const f of fonts) {
    const g = f.charToGlyph(ch);
    if (g && g.index > 0) return { font: f, glyph: g };
  }
  const f = fonts[0];
  return { font: f, glyph: f.charToGlyph(ch) };
}

/** Plasser glyfer på én linje. */
function layoutLine(line: string, fonts: Font[], emMM: number, letterSpacing: number): { glyphs: PlacedGlyph[]; width: number } {
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  let prev: { font: Font; glyph: Glyph } | null = null;
  const chars = Array.from(line);
  chars.forEach((ch, i) => {
    const pg = pickGlyph(fonts, ch);
    const scale = emMM / pg.font.unitsPerEm;
    if (prev && prev.font === pg.font) {
      try {
        x += pg.font.getKerningValue(prev.glyph, pg.glyph) * scale;
      } catch {
        /* ingen kerning */
      }
    }
    const adv = (pg.glyph.advanceWidth ?? pg.font.unitsPerEm * 0.5) * scale;
    glyphs.push({ font: pg.font, glyph: pg.glyph, x, advance: adv });
    x += adv + (i < chars.length - 1 ? letterSpacing : 0);
    prev = pg;
  });
  return { glyphs, width: x };
}

/** Konverter glyf-sti (y ned) til konturer i lokale mm-koordinater (y opp), origo i grunnlinje-start. */
function glyphContours(g: PlacedGlyph, emMM: number): FlatPoly[] {
  const path = g.glyph.getPath(0, 0, emMM);
  const out: FlatPoly[] = [];
  let cur: number[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const tol = Math.max(0.04, emMM * 0.004);
  const push = (x: number, y: number) => {
    cur.push(x, -y);
  };
  const close = () => {
    if (cur.length >= 6) out.push(cur);
    cur = [];
  };
  for (const c of path.commands as PathCommand[]) {
    switch (c.type) {
      case 'M':
        close();
        cx = sx = c.x;
        cy = sy = c.y;
        push(cx, cy);
        break;
      case 'L':
        cx = c.x;
        cy = c.y;
        push(cx, cy);
        break;
      case 'Q': {
        const len = Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x - c.x1, c.y - c.y1);
        const n = Math.max(2, Math.min(24, Math.ceil(Math.sqrt(len / tol))));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          push(u * u * cx + 2 * u * t * c.x1 + t * t * c.x, u * u * cy + 2 * u * t * c.y1 + t * t * c.y);
        }
        cx = c.x;
        cy = c.y;
        break;
      }
      case 'C': {
        const len =
          Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2);
        const n = Math.max(3, Math.min(32, Math.ceil(Math.sqrt(len / tol) * 1.3)));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          push(
            u * u * u * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          );
        }
        cx = c.x;
        cy = c.y;
        break;
      }
      case 'Z':
        cx = sx;
        cy = sy;
        close();
        break;
    }
  }
  close();
  // fjern duplisert sluttpunkt
  return out.map((p) => {
    const n = p.length;
    if (n >= 4 && Math.abs(p[0] - p[n - 2]) < 1e-9 && Math.abs(p[1] - p[n - 1]) < 1e-9) return p.slice(0, n - 2);
    return p;
  });
}

function transformFlat(p: FlatPoly, a: number, b: number, c: number, d: number, e: number, f: number): FlatPoly {
  const out = new Array<number>(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i];
    const y = p[i + 1];
    out[i] = a * x + c * y + e;
    out[i + 1] = b * x + d * y + f;
  }
  return out;
}

export function layoutText(el: TextElement, loaded: LoadedFont): ShapeData {
  const fonts = loaded.fonts;
  const primary = fonts[0];
  const emMM = Math.max(0.1, el.size) / capRatio(primary);
  const capH = Math.max(0.1, el.size);
  const ops: ShapeOp[] = [];
  const addGlyph = (contours: FlatPoly[]) => {
    if (contours.length) ops.push({ kind: 'fill', sub: false, rule: 'NonZero', contours });
  };

  if (el.layout === 'straight') {
    const lines = el.text.split('\n');
    const lineAdv = emMM * el.lineHeight;
    const blockH = (lines.length - 1) * lineAdv + capH;
    lines.forEach((line, li) => {
      const { glyphs, width } = layoutLine(line, fonts, emMM, el.letterSpacing);
      const x0 = el.align === 'left' ? 0 : el.align === 'right' ? -width : -width / 2;
      const baseline = blockH / 2 - capH - li * lineAdv;
      for (const g of glyphs) {
        const contours = glyphContours(g, emMM).map((p) => transformFlat(p, 1, 0, 0, 1, x0 + g.x, baseline));
        addGlyph(contours);
      }
    });
  } else {
    const line = el.text.replace(/\n/g, ' ');
    const top = el.layout === 'arcTop';
    // grunnlinjeradius: midten av bokstavene ligger på el.radius
    const rb = Math.max(0.5, top ? el.radius - capH / 2 : el.radius + capH / 2);
    let { glyphs, width } = layoutLine(line, fonts, emMM, el.letterSpacing);
    if (el.span > 0 && glyphs.length > 1) {
      const target = (el.span * Math.PI * rb) / 180;
      const natural = width - (glyphs[0].advance + glyphs[glyphs.length - 1].advance) / 2;
      const extra = (target - natural) / (glyphs.length - 1);
      glyphs = glyphs.map((g, i) => ({ ...g, x: g.x + extra * i }));
      width = width + extra * (glyphs.length - 1);
    }
    const centers = glyphs.map((g) => g.x + g.advance / 2);
    const mid = (centers[0] + centers[centers.length - 1]) / 2 || width / 2;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const s = centers[i] - mid;
      const theta = top ? Math.PI / 2 - s / rb : -Math.PI / 2 + s / rb;
      const rot = top ? theta - Math.PI / 2 : theta + Math.PI / 2;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const px = rb * Math.cos(theta);
      const py = rb * Math.sin(theta);
      const contours = glyphContours(g, emMM).map((p) => {
        // flytt glyfen så midten av fremrykket er i origo, roter, flytt til buen
        const local = transformFlat(p, 1, 0, 0, 1, -g.advance / 2, 0);
        return transformFlat(local, cr, sr, -sr, cr, px, py);
      });
      addGlyph(contours);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    if (op.kind !== 'fill') continue;
    for (const c of op.contours) {
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]);
        maxX = Math.max(maxX, c[i]);
        minY = Math.min(minY, c[i + 1]);
        maxY = Math.max(maxY, c[i + 1]);
      }
    }
  }
  if (!isFinite(minX)) return { ops: [], bounds: [0, 0, 0, 0], normalize: false };
  return { ops, bounds: [minX, minY, maxX, maxY], normalize: false };
}

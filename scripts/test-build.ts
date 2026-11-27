// Røyktest av geometrikjernen i Node: bygger alle maler (uten tekst/ikon-former) og sjekker at meshene er gyldige.
import Module from 'manifold-3d';
import { buildMedal } from '../src/geometry/build';
import { TEMPLATES, makeElement } from '../src/model/defaults';
import type { MedalDesign } from '../src/model/types';

const M = await Module();
M.setup();

function check(name: string, d: MedalDesign) {
  const res = buildMedal(M, { seq: 1, design: d, shapes: {} });
  if (res.error) {
    console.log(`✗ ${name}: ${res.error}`);
    process.exitCode = 1;
    return;
  }
  const tris = res.parts.reduce((s, p) => s + p.indices.length / 3, 0);
  const vol = res.parts.map((p) => `${p.colorId}:${p.volume.toFixed(0)}`).join(' ');
  console.log(`✓ ${name.padEnd(28)} ${res.timeMs.toFixed(0).padStart(5)} ms  tris=${tris}  size=${res.size.map((v) => v.toFixed(1)).join('x')}  ${vol}`);
  for (const w of res.warnings) console.log(`    [${w.level}] ${w.message}`);
}

for (const t of TEMPLATES) check(t.id, t.make());

// alle elementtyper og former
const base = TEMPLATES.find((t) => t.id === 'blank')!.make();
for (const kind of ['shape', 'ring', 'repeat', 'wreath', 'pattern'] as const) {
  const d = structuredClone(base);
  d.elements = [makeElement(kind, d)];
  check('element ' + kind, d);
}
for (const p of ['rays', 'rings', 'lines', 'grid', 'hex', 'dots', 'waves', 'checker'] as const) {
  const d = structuredClone(base);
  const el = makeElement('pattern', d) as any;
  el.pattern = p;
  d.elements = [el];
  check('pattern ' + p, d);
}
for (const type of ['circle', 'ellipse', 'polygon', 'star', 'rosette', 'gear', 'shield', 'heart', 'rect', 'banner'] as const) {
  for (const hanger of ['loop', 'slot', 'hole'] as const) {
    const d = structuredClone(base);
    d.outline.type = type;
    d.outline.height = 45;
    d.outline.corner = 1;
    d.hanger.type = hanger;
    d.edge.profile = 'round';
    d.edge.size = 0.8;
    check(`outline ${type}/${hanger}`, d);
  }
}
for (const mode of ['raise', 'engrave', 'inlay', 'cut'] as const) {
  const d = structuredClone(base);
  const el = makeElement('shape', d);
  el.mode = mode;
  el.color = 'c2';
  const back = makeElement('ring', d);
  back.side = 'back';
  back.mode = 'inlay';
  back.color = 'c3';
  d.elements = [el, back];
  d.magnet.enabled = true;
  d.edge.reeding.enabled = true;
  check('mode ' + mode, d);
}

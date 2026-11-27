// Eksport: binær STL, 3MF (flerfarge, én modell med én del per farge) og ZIP med STL per farge.
import { strToU8, zipSync } from 'fflate';
import type { BuiltPart, ColorSlot } from '../model/types';

export function download(data: Uint8Array | string, filename: string, mime: string) {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[æÆ]/g, 'ae')
      .replace(/[øØ]/g, 'o')
      .replace(/[åÅ]/g, 'a')
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase() || 'medalje'
  );
}

export function toSTL(parts: BuiltPart[], name = 'medalje'): Uint8Array {
  const triCount = parts.reduce((s, p) => s + p.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `Medaljemaker: ${name}`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, triCount, true);
  let off = 84;
  for (const p of parts) {
    const P = p.positions;
    const I = p.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ux = P[b] - P[a];
      const uy = P[b + 1] - P[a + 1];
      const uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a];
      const vy = P[c + 1] - P[a + 1];
      const vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      dv.setFloat32(off, nx, true);
      dv.setFloat32(off + 4, ny, true);
      dv.setFloat32(off + 8, nz, true);
      off += 12;
      for (const v of [a, b, c]) {
        dv.setFloat32(off, P[v], true);
        dv.setFloat32(off + 4, P[v + 1], true);
        dv.setFloat32(off + 8, P[v + 2], true);
        off += 12;
      }
      dv.setUint16(off, 0, true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function to3MF(parts: BuiltPart[], colors: ColorSlot[], title: string): Uint8Array {
  const colorOf = (id: string) => colors.find((c) => c.id === id);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
  );
  lines.push(`<metadata name="Title">${xmlEscape(title)}</metadata>`);
  lines.push('<metadata name="Application">Medaljemaker</metadata>');
  lines.push('<resources>');
  lines.push('<basematerials id="1">');
  parts.forEach((p) => {
    const c = colorOf(p.colorId);
    const hex = (c?.hex ?? '#cccccc').replace('#', '').toUpperCase();
    lines.push(`<base name="${xmlEscape(c?.name ?? p.colorId)}" displaycolor="#${hex}FF"/>`);
  });
  lines.push('</basematerials>');
  parts.forEach((p, k) => {
    const c = colorOf(p.colorId);
    lines.push(`<object id="${k + 2}" type="model" pid="1" pindex="${k}" name="${xmlEscape(c?.name ?? p.colorId)}">`);
    lines.push('<mesh><vertices>');
    const P = p.positions;
    const chunk: string[] = [];
    for (let i = 0; i < P.length; i += 3) chunk.push(`<vertex x="${fmt(P[i])}" y="${fmt(P[i + 1])}" z="${fmt(P[i + 2])}"/>`);
    lines.push(chunk.join(''));
    lines.push('</vertices><triangles>');
    const I = p.indices;
    const tchunk: string[] = [];
    for (let t = 0; t < I.length; t += 3) tchunk.push(`<triangle v1="${I[t]}" v2="${I[t + 1]}" v3="${I[t + 2]}"/>`);
    lines.push(tchunk.join(''));
    lines.push('</triangles></mesh></object>');
  });
  const asmId = parts.length + 2;
  lines.push(`<object id="${asmId}" type="model" name="${xmlEscape(title)}"><components>`);
  parts.forEach((_, k) => lines.push(`<component objectid="${k + 2}"/>`));
  lines.push('</components></object>');
  lines.push('</resources>');
  lines.push(`<build><item objectid="${asmId}"/></build>`);
  lines.push('</model>');

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    '</Relationships>';
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(lines.join('\n')),
    },
    { level: 6 },
  );
}

export function toStlZip(parts: BuiltPart[], colors: ColorSlot[], base: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  parts.forEach((p, k) => {
    const c = colors.find((x) => x.id === p.colorId);
    files[`${base}_${k + 1}_${safeName(c?.name ?? p.colorId)}.stl`] = toSTL([p], `${base} ${c?.name ?? ''}`);
  });
  files['LES_MEG.txt'] = strToU8(
    [
      `Medalje: ${base}`,
      '',
      'Én STL-fil per farge. Alle filene har samme origo, så de passer sammen.',
      'PrusaSlicer/Bambu Studio/OrcaSlicer: velg alle filene og importer samtidig,',
      'svar «Ja» på spørsmålet om å laste dem som ett objekt med flere deler,',
      'og tildel så filament/ekstruder per del.',
      '',
      ...parts.map((p, k) => {
        const c = colors.find((x) => x.id === p.colorId);
        return `${k + 1}: ${c?.name ?? p.colorId} (${c?.hex ?? ''}) – z ${p.minZ.toFixed(2)}–${p.maxZ.toFixed(2)} mm`;
      }),
    ].join('\r\n'),
  );
  return zipSync(files, { level: 6 });
}

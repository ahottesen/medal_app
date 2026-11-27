import { useState, type ReactNode } from 'react';
import { COLOR_PRESETS, ELEMENT_LABELS, makeElement, newId } from '../model/defaults';
import type { BuildResult, ColorSlot, ElementKind, Finish, MedalDesign, MedalElement } from '../model/types';
import { ElementEditor } from './ElementEditor';
import { IconPicker } from './IconPicker';
import { OutlineFields } from './OutlineFields';
import { ColorPick, NumField, Section, Segmented, Select, Toggle } from './widgets';

type Update = (fn: (d: MedalDesign) => MedalDesign, coalesce?: string) => void;

// ---------------- Medalje ----------------

export function MedalPanel({ design: d, update }: { design: MedalDesign; update: Update }) {
  const patch = <K extends keyof MedalDesign>(k: K, v: Partial<MedalDesign[K]>, key?: string) =>
    update((x) => ({ ...x, [k]: { ...(x[k] as object), ...v } }), key);
  return (
    <>
      <Section title="Form og størrelse">
        <OutlineFields value={d.outline} onChange={(p, k) => patch('outline', p, k)} />
        <NumField label="Tykkelse" value={d.base.thickness} min={1} max={10} step={0.1} onChange={(v) => patch('base', { thickness: v }, 'thick')} hint="Tykkelsen på selve platen (uten kant og opphøyde detaljer)" />
        <ColorPick label="Farge på platen" value={d.base.color} colors={d.colors} onChange={(v) => patch('base', { color: v })} />
      </Section>

      <Section title="Kant">
        <Toggle label="Opphøyd kant" checked={d.rim.enabled} onChange={(v) => patch('rim', { enabled: v })} />
        {d.rim.enabled && (
          <>
            <NumField label="Kantbredde" value={d.rim.width} min={0.5} max={10} step={0.1} onChange={(v) => patch('rim', { width: v }, 'rimw')} />
            <NumField label="Kanthøyde" value={d.rim.height} min={0} max={5} step={0.1} onChange={(v) => patch('rim', { height: v }, 'rimh')} />
            <ColorPick label="Kantfarge" value={d.rim.color} colors={d.colors} onChange={(v) => patch('rim', { color: v })} />
            <Toggle label="Ekstra indre ring" checked={d.rim.inner.enabled} onChange={(v) => patch('rim', { inner: { ...d.rim.inner, enabled: v } })} />
            {d.rim.inner.enabled && (
              <>
                <NumField label="Avstand fra kanten" value={d.rim.inner.gap} min={0.2} max={10} step={0.1} onChange={(v) => patch('rim', { inner: { ...d.rim.inner, gap: v } }, 'rig')} />
                <NumField label="Ringbredde" value={d.rim.inner.width} min={0.2} max={5} step={0.1} onChange={(v) => patch('rim', { inner: { ...d.rim.inner, width: v } }, 'riw')} />
                <NumField label="Ringhøyde" value={d.rim.inner.height} min={0.1} max={5} step={0.1} onChange={(v) => patch('rim', { inner: { ...d.rim.inner, height: v } }, 'rih')} />
              </>
            )}
          </>
        )}
        <Segmented
          label="Ytterkant"
          value={d.edge.profile}
          options={[
            { value: 'none', label: 'Rett' },
            { value: 'chamfer', label: 'Fas' },
            { value: 'round', label: 'Avrundet' },
          ]}
          onChange={(v) => patch('edge', { profile: v })}
        />
        {d.edge.profile !== 'none' && (
          <NumField label="Størrelse på fas/avrunding" value={d.edge.size} min={0.1} max={4} step={0.1} onChange={(v) => patch('edge', { size: v }, 'edges')} />
        )}
        <NumField label="Bunnfas (mot «elefantfot»)" value={d.edge.bottomChamfer} min={0} max={1.5} step={0.05} onChange={(v) => patch('edge', { bottomChamfer: v }, 'edgeb')} />
        <Toggle label="Riflet kant (som en mynt)" checked={d.edge.reeding.enabled} onChange={(v) => patch('edge', { reeding: { ...d.edge.reeding, enabled: v } })} />
        {d.edge.reeding.enabled && (
          <>
            <NumField label="Antall riller" value={d.edge.reeding.count} min={10} max={400} step={1} unit="" onChange={(v) => patch('edge', { reeding: { ...d.edge.reeding, count: v } }, 'rc')} />
            <NumField label="Rilledybde" value={d.edge.reeding.depth} min={0.1} max={2} step={0.05} onChange={(v) => patch('edge', { reeding: { ...d.edge.reeding, depth: v } }, 'rd')} />
            <NumField label="Rillebredde" value={d.edge.reeding.width} min={0.2} max={3} step={0.05} onChange={(v) => patch('edge', { reeding: { ...d.edge.reeding, width: v } }, 'rw')} />
          </>
        )}
      </Section>

      <Section title="Oppheng">
        <Segmented
          value={d.hanger.type}
          options={[
            { value: 'none', label: 'Ingen' },
            { value: 'loop', label: 'Øye' },
            { value: 'slot', label: 'Båndspalte' },
            { value: 'hole', label: 'Hull' },
          ]}
          onChange={(v) => patch('hanger', { type: v })}
        />
        {d.hanger.type === 'loop' && (
          <>
            <NumField label="Ytre diameter" value={d.hanger.outer} min={4} max={30} step={0.5} onChange={(v) => patch('hanger', { outer: v }, 'ho')} />
            <NumField label="Hulldiameter" value={d.hanger.hole} min={1} max={25} step={0.1} onChange={(v) => patch('hanger', { hole: v }, 'hh')} />
          </>
        )}
        {d.hanger.type === 'slot' && (
          <>
            <NumField label="Spaltebredde (båndbredde + 1–2 mm)" value={d.hanger.slotWidth} min={5} max={60} step={0.5} onChange={(v) => patch('hanger', { slotWidth: v }, 'hsw')} />
            <div className="chips">
              {[
                [12, 13.5],
                [22, 23.5],
                [25, 26.5],
                [30, 31.5],
                [38, 39.5],
              ].map(([band, w]) => (
                <button key={band} className={'chip' + (d.hanger.slotWidth === w ? ' active' : '')} onClick={() => patch('hanger', { slotWidth: w })}>
                  {band} mm bånd
                </button>
              ))}
            </div>
            <NumField label="Spaltehøyde" value={d.hanger.slotHeight} min={1} max={10} step={0.1} onChange={(v) => patch('hanger', { slotHeight: v }, 'hsh')} />
            <NumField label="Godstykkelse" value={d.hanger.wall} min={1} max={8} step={0.1} onChange={(v) => patch('hanger', { wall: v }, 'hw')} />
          </>
        )}
        {d.hanger.type === 'hole' && (
          <>
            <NumField label="Hulldiameter" value={d.hanger.hole} min={1} max={20} step={0.1} onChange={(v) => patch('hanger', { hole: v }, 'hh')} />
            <NumField label="Avstand fra kanten" value={d.hanger.wall} min={0.8} max={15} step={0.1} onChange={(v) => patch('hanger', { wall: v }, 'hw')} />
          </>
        )}
        {(d.hanger.type === 'loop' || d.hanger.type === 'slot') && (
          <>
            <NumField label="Overlapp med medaljen" value={d.hanger.overlap} min={0} max={10} step={0.1} onChange={(v) => patch('hanger', { overlap: v }, 'hov')} />
            <NumField label="Tykkelse (0 = som medaljen)" value={d.hanger.thickness} min={0} max={d.base.thickness} step={0.1} onChange={(v) => patch('hanger', { thickness: v }, 'ht')} />
          </>
        )}
        {d.hanger.type !== 'none' && (
          <NumField label="Plassering (vinkel)" value={d.hanger.angle} min={0} max={360} step={1} unit="°" onChange={(v) => patch('hanger', { angle: v }, 'ha')} hint="90° = toppen" />
        )}
      </Section>

      <Section title="Bakside" defaultOpen={false}>
        <p className="muted small">
          Legg til tekst eller ikoner på baksiden under <b>Elementer</b> → velg «Bakside». De graveres eller legges inn speilvendt, slik at de leses riktig når medaljen snus.
        </p>
        <Toggle label="Magnetlomme" checked={d.magnet.enabled} onChange={(v) => patch('magnet', { enabled: v })} />
        {d.magnet.enabled && (
          <>
            <NumField label="Diameter (magnet + 0,2 mm)" value={d.magnet.diameter} min={2} max={40} step={0.1} onChange={(v) => patch('magnet', { diameter: v }, 'md')} />
            <NumField label="Dybde" value={d.magnet.depth} min={0.4} max={d.base.thickness - 0.4} step={0.1} onChange={(v) => patch('magnet', { depth: v }, 'mdp')} />
            <div className="row2">
              <NumField label="X" value={d.magnet.x} min={-50} max={50} step={0.5} slider={false} onChange={(v) => patch('magnet', { x: v }, 'mx')} />
              <NumField label="Y" value={d.magnet.y} min={-50} max={50} step={0.5} slider={false} onChange={(v) => patch('magnet', { y: v }, 'my')} />
            </div>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------- Elementer ----------------

const KIND_ICON: Record<ElementKind, string> = {
  icon: '★',
  text: 'T',
  shape: '◆',
  ring: '◯',
  repeat: '⁂',
  wreath: '❦',
  pattern: '▦',
  image: '🖼',
};

const MODE_SHORT: Record<string, string> = { raise: 'opphøyd', engrave: 'gravert', inlay: 'innlagt', cut: 'gjennom' };

export function ElementsPanel({
  design,
  update,
  selectedId,
  setSelectedId,
  errors,
}: {
  design: MedalDesign;
  update: Update;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  errors: Record<string, string>;
}) {
  const els = design.elements;
  const sel = els.find((e) => e.id === selectedId) ?? null;
  const [pickIcon, setPickIcon] = useState(false);
  const add = (kind: ElementKind, init?: Partial<MedalElement>) => {
    if (kind === 'icon' && !init) {
      setPickIcon(true);
      return;
    }
    const el = { ...makeElement(kind, design), ...init } as MedalElement;
    if (design.colors.length > 1 && (kind === 'icon' || kind === 'text')) el.color = design.colors[0].id;
    update((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };
  const move = (id: string, dir: -1 | 1) =>
    update((d) => {
      const i = d.elements.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.elements.length) return d;
      const a = d.elements.slice();
      [a[i], a[j]] = [a[j], a[i]];
      return { ...d, elements: a };
    });
  const patchEl = (id: string, p: Partial<MedalElement>, key?: string) =>
    update((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...p } as MedalElement) : e)) }), key);
  const remove = (id: string) => {
    update((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicate = (id: string) => {
    const src = els.find((e) => e.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: newId(src.kind), name: src.name + ' (kopi)', x: src.x + 3, y: src.y - 3 };
    update((d) => {
      const i = d.elements.findIndex((e) => e.id === id);
      const a = d.elements.slice();
      a.splice(i + 1, 0, copy);
      return { ...d, elements: a };
    });
    setSelectedId(copy.id);
  };

  return (
    <>
      <div className="add-grid">
        {(Object.keys(ELEMENT_LABELS) as ElementKind[]).map((k) => (
          <button key={k} className="add-btn" onClick={() => add(k)}>
            <span className="kind-icon">{KIND_ICON[k]}</span>
            {ELEMENT_LABELS[k]}
          </button>
        ))}
      </div>
      <ul className="el-list">
        {els.length === 0 && <li className="muted empty">Ingen elementer ennå – legg til tekst, ikoner eller dekor over.</li>}
        {els.map((e, i) => (
          <li key={e.id} className={(e.id === selectedId ? 'active ' : '') + (e.visible ? '' : 'hidden-el')} onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}>
            <button
              className="icon-btn eye"
              title={e.visible ? 'Skjul' : 'Vis'}
              onClick={(ev) => {
                ev.stopPropagation();
                patchEl(e.id, { visible: !e.visible });
              }}
            >
              {e.visible ? '👁' : '◌'}
            </button>
            <span className="kind-icon">{KIND_ICON[e.kind]}</span>
            <span className="el-name">
              {e.name}
              <small>
                {MODE_SHORT[e.mode]}
                {e.side === 'back' ? ' · bakside' : ''}
              </small>
            </span>
            <span className="swatch tiny" style={{ background: design.colors.find((c) => c.id === e.color)?.hex }} />
            {errors[e.id] && <span title={errors[e.id]}>⚠️</span>}
            <span className="el-actions" onClick={(ev) => ev.stopPropagation()}>
              <button className="icon-btn" title="Flytt opp (tegnes tidligere)" disabled={i === 0} onClick={() => move(e.id, -1)}>
                ↑
              </button>
              <button className="icon-btn" title="Flytt ned (tegnes senere, ligger «over»)" disabled={i === els.length - 1} onClick={() => move(e.id, 1)}>
                ↓
              </button>
              <button className="icon-btn" title="Dupliser" onClick={() => duplicate(e.id)}>
                ⧉
              </button>
              <button className="icon-btn danger" title="Slett" onClick={() => remove(e.id)}>
                🗑
              </button>
            </span>
          </li>
        ))}
      </ul>
      {sel && <ElementEditor key={sel.id} el={sel} design={design} error={errors[sel.id]} onChange={(p, k) => patchEl(sel.id, p, k)} />}
      {pickIcon && (
        <IconPicker
          onClose={() => setPickIcon(false)}
          onPick={(ic) => {
            setPickIcon(false);
            add('icon', { iconName: ic.name, svg: ic.svg, license: ic.license, name: ic.name.split(':').pop() ?? ic.name } as Partial<MedalElement>);
          }}
        />
      )}
      {!sel && els.length > 0 && <p className="muted small center">Velg et element i lista eller klikk på det i 3D-visningen.</p>}
    </>
  );
}

// ---------------- Farger ----------------

export function ColorsPanel({ design: d, update }: { design: MedalDesign; update: Update }) {
  const used = (id: string) => d.base.color === id || d.rim.color === id || d.elements.some((e) => e.color === id);
  const patchColor = (id: string, p: Partial<ColorSlot>, key?: string) =>
    update((x) => ({ ...x, colors: x.colors.map((c) => (c.id === id ? { ...c, ...p } : c)) }), key);
  return (
    <>
      <Section title="Fargespor">
        <p className="muted small">
          Hver farge blir en egen del ved eksport (3MF / STL per farge). Med én dyse kan du bytte filament på riktig lag – se fanen <b>Print</b>.
        </p>
        {d.colors.map((c) => (
          <div key={c.id} className="color-row">
            <input type="color" value={c.hex} onChange={(e) => patchColor(c.id, { hex: e.target.value }, 'col' + c.id)} />
            <input className="color-name" value={c.name} onChange={(e) => patchColor(c.id, { name: e.target.value }, 'cn' + c.id)} />
            <select value={c.finish} onChange={(e) => patchColor(c.id, { finish: e.target.value as Finish })} title="Utseende i forhåndsvisningen">
              <option value="matte">Matt</option>
              <option value="silk">Silke</option>
              <option value="metal">Metallisk</option>
            </select>
            <button
              className="icon-btn danger"
              disabled={used(c.id) || d.colors.length <= 1}
              title={used(c.id) ? 'Fargen er i bruk' : 'Fjern'}
              onClick={() => update((x) => ({ ...x, colors: x.colors.filter((y) => y.id !== c.id) }))}
            >
              ✕
            </button>
          </div>
        ))}
        {d.colors.length < 8 && (
          <button
            className="btn"
            onClick={() =>
              update((x) => {
                const p = COLOR_PRESETS.find((cp) => !x.colors.some((c) => c.hex === cp.hex)) ?? COLOR_PRESETS[0];
                let n = 1;
                while (x.colors.some((c) => c.id === 'c' + n)) n++;
                return { ...x, colors: [...x.colors, { id: 'c' + n, name: p.name, hex: p.hex, finish: p.finish }] };
              })
            }
          >
            + Legg til farge
          </button>
        )}
      </Section>
      <Section title="Ferdige farger">
        <p className="muted small">Klikk en farge for å bruke den på fargesporet til platen.</p>
        <div className="preset-colors">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.name}
              className={'preset-color finish-' + p.finish}
              style={{ background: p.hex }}
              title={p.name}
              onClick={() => patchColor(d.base.color, { hex: p.hex, name: p.name, finish: p.finish })}
            >
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Bruk">
        <ColorPick label="Plate" value={d.base.color} colors={d.colors} onChange={(v) => update((x) => ({ ...x, base: { ...x.base, color: v } }))} />
        <ColorPick label="Kant" value={d.rim.color} colors={d.colors} onChange={(v) => update((x) => ({ ...x, rim: { ...x.rim, color: v } }))} />
        <ColorPick
          label="Sett alle elementer til"
          value=""
          colors={d.colors}
          onChange={(id) => update((x) => ({ ...x, elements: x.elements.map((e) => ({ ...e, color: id })) }))}
        />
      </Section>
    </>
  );
}

// ---------------- Print ----------------

export function PrintPanel({
  design: d,
  update,
  result,
  building,
  exportButtons,
}: {
  design: MedalDesign;
  update: Update;
  result: BuildResult | null;
  building: boolean;
  exportButtons: ReactNode;
}) {
  const p = d.print;
  const patch = (v: Partial<MedalDesign['print']>, k?: string) => update((x) => ({ ...x, print: { ...x.print, ...v } }), k);
  const parts = result?.parts ?? [];
  const colorOf = (id: string) => d.colors.find((c) => c.id === id);
  const totalVol = parts.reduce((s, x) => s + x.volume, 0);
  const layerOf = (z: number) => (z <= p.firstLayer + 1e-6 ? 1 : Math.floor((z - p.firstLayer) / p.layerHeight + 1e-6) + 2);
  const aligned = (z: number) => {
    const r = (z - p.firstLayer) / p.layerHeight;
    return Math.abs(r - Math.round(r)) < 0.02;
  };
  const sorted = [...parts].sort((a, b) => a.minZ - b.minZ || a.maxZ - b.maxZ);
  const overlapping: string[] = [];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (sorted[i].maxZ > sorted[j].minZ + 1e-3) overlapping.push(`${colorOf(sorted[i].colorId)?.name} og ${colorOf(sorted[j].colorId)?.name}`);

  return (
    <>
      <Section title="Eksport">
        {exportButtons}
        <p className="muted small">
          <b>3MF</b> inneholder én modell med én del per farge (Bambu Studio, OrcaSlicer, PrusaSlicer). <b>STL</b> er alt i én fil. <b>ZIP</b> gir én STL per farge.
        </p>
      </Section>
      <Section title="Skriver">
        <NumField label="Laghøyde" value={p.layerHeight} min={0.04} max={0.4} step={0.02} onChange={(v) => patch({ layerHeight: v }, 'lh')} />
        <NumField label="Første lag" value={p.firstLayer} min={0.08} max={0.4} step={0.02} onChange={(v) => patch({ firstLayer: v }, 'fl')} />
        <NumField label="Dysediameter" value={p.nozzle} min={0.1} max={1} step={0.05} onChange={(v) => patch({ nozzle: v }, 'nz')} />
        <Select
          label="Oppløsning på modellen"
          value={p.quality}
          options={[
            { value: 'draft', label: 'Utkast (rask)' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Høy (glattere kurver)' },
          ]}
          onChange={(v) => patch({ quality: v })}
        />
      </Section>
      <Section title="Mål og materiale">
        {result && parts.length > 0 ? (
          <table className="stats">
            <tbody>
              <tr>
                <td>Mål (B × H × T)</td>
                <td>
                  {result.size[0].toFixed(1)} × {result.size[1].toFixed(1)} × {result.size[2].toFixed(1)} mm
                </td>
              </tr>
              {parts.map((x) => (
                <tr key={x.colorId}>
                  <td>
                    <span className="swatch tiny" style={{ background: colorOf(x.colorId)?.hex }} /> {colorOf(x.colorId)?.name}
                  </td>
                  <td>
                    {(x.volume / 1000).toFixed(2)} cm³ · ca. {((x.volume / 1000) * 1.24).toFixed(1)} g
                  </td>
                </tr>
              ))}
              <tr>
                <td>Totalt (100 % fyll, PLA)</td>
                <td>
                  ca. {((totalVol / 1000) * 1.24).toFixed(1)} g · {(((totalVol / 1000) * 1.24) / 2.98).toFixed(1)} m filament
                </td>
              </tr>
              <tr>
                <td>Byggetid</td>
                <td>{building ? 'bygger…' : `${result.timeMs.toFixed(0)} ms · ${parts.reduce((s, x) => s + x.indices.length / 3, 0).toLocaleString('nb-NO')} trekanter`}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">Ingen modell ennå.</p>
        )}
      </Section>
      <Section title="Fargebytte-plan (én dyse)">
        {sorted.length <= 1 ? (
          <p className="muted small">Bare én farge – ingen bytte nødvendig.</p>
        ) : (
          <>
            <ol className="plan">
              <li>
                Start med <b>{colorOf(sorted[0].colorId)?.name}</b>
              </li>
              {sorted.slice(1).map((x) => (
                <li key={x.colorId}>
                  Bytt til <b>{colorOf(x.colorId)?.name}</b> ved Z = {x.minZ.toFixed(2)} mm → <b>lag {layerOf(x.minZ + 1e-4)}</b>
                  {!aligned(x.minZ) && <span className="warn-text"> (ikke på lagskille – juster høyder til hele lag)</span>}
                </li>
              ))}
            </ol>
            {overlapping.length > 0 ? (
              <div className="notice warn small">
                Fargene {overlapping.join(', ')} finnes på de samme lagene. Det krever et flerfargesystem (AMS/MMU/verktøybytte). For manuelt bytte: gi alt over
                et visst nivå samme farge (f.eks. samme farge på kant og opphøyde elementer), og bruk ikke «Innlagt».
              </div>
            ) : (
              <div className="notice ok small">Fargene ligger på hver sine lag – dette kan printes med manuelle filamentbytter (M600 / «pause ved lag»).</div>
            )}
          </>
        )}
      </Section>
      <Section title="Advarsler og tips">
        {result?.error && <div className="notice warn">Feil: {result.error}</div>}
        {(result?.warnings ?? []).length === 0 && !result?.error && <p className="muted small">Ingen advarsler. 👍</p>}
        <ul className="warnings">
          {(result?.warnings ?? []).map((w, i) => (
            <li key={i} className={w.level}>
              {w.message}
            </li>
          ))}
        </ul>
        <ul className="tips small muted">
          <li>Print med forsiden opp – ingen support nødvendig.</li>
          <li>3–4 vegger og 20–40 % fyll gir en solid, tung medalje. 100 % fyll gir mest «metallfølelse».</li>
          <li>Hold opphøyde detaljer på hele lag (f.eks. 0,6 / 0,8 / 1,0 mm med 0,2 mm lag).</li>
          <li>Silke-PLA i gull/sølv/bronse gir et flott metallisk utseende.</li>
          <li>Tekst under ca. 3 mm versalhøyde og streker under {d.print.nozzle * 2} mm blir utydelige.</li>
        </ul>
      </Section>
    </>
  );
}

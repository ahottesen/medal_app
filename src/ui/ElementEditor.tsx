import { useEffect, useRef, useState } from 'react';
import { loadCatalog, type FontCatalogEntry } from '../assets/fonts';
import { iconPreviewUrl } from '../assets/icons';
import type {
  ElementMode,
  MedalDesign,
  MedalElement,
  PatternType,
  RepeatItem,
  TextLayout,
} from '../model/types';
import { FontPicker } from './FontPicker';
import { IconPicker } from './IconPicker';
import { OutlineFields } from './OutlineFields';
import { ColorPick, NumField, Section, Segmented, Select, Toggle } from './widgets';

const MODE_OPTIONS: { value: ElementMode; label: string; title: string }[] = [
  { value: 'raise', label: 'Opphøyd', title: 'Står opp fra flaten' },
  { value: 'engrave', label: 'Gravert', title: 'Senket ned i flaten' },
  { value: 'inlay', label: 'Innlagt', title: 'Senket og fylt med en annen farge – flat overflate (krever flerfarge)' },
  { value: 'cut', label: 'Gjennom', title: 'Skjæres helt gjennom medaljen' },
];

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Tynn',
  200: 'Ekstra lett',
  300: 'Lett',
  400: 'Normal',
  500: 'Medium',
  600: 'Halvfet',
  700: 'Fet',
  800: 'Ekstra fet',
  900: 'Svart',
};

export function ElementEditor({
  el,
  design,
  onChange,
  error,
}: {
  el: MedalElement;
  design: MedalDesign;
  onChange: (patch: Partial<MedalElement>, key?: string) => void;
  error?: string;
}) {
  const [picker, setPicker] = useState<null | 'icon' | 'font'>(null);
  const [fontEntry, setFontEntry] = useState<FontCatalogEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const R = design.outline.width / 2;
  const maxR = Math.max(10, Math.ceil(R * 1.2));

  useEffect(() => {
    if (el.kind !== 'text') return;
    let alive = true;
    loadCatalog().then((c) => alive && setFontEntry(c.find((f) => f.id === el.font.id) ?? null));
    return () => {
      alive = false;
    };
  }, [el.kind, el.kind === 'text' ? el.font.id : '']);

  // generisk oppdatering med sammenslåing i angre-historikken
  const set = <K extends string>(k: K) => (v: unknown) => onChange({ [k]: v } as Partial<MedalElement>, el.id + '.' + k);

  const back = el.side === 'back';
  const modes = back ? MODE_OPTIONS.filter((m) => m.value !== 'raise') : MODE_OPTIONS;

  return (
    <div className="element-editor">
      <label className="field">
        <span className="field-label">Navn</span>
        <input value={el.name} onChange={(e) => onChange({ name: e.target.value }, el.id + '.name')} />
      </label>
      {error && <div className="notice warn">{error}</div>}

      {el.kind === 'text' && (
        <Section title="Tekst">
          <label className="field">
            <span className="field-label">Tekst {el.layout === 'straight' ? '(Enter = ny linje)' : ''}</span>
            <textarea
              rows={el.layout === 'straight' ? 2 : 1}
              value={el.text}
              onChange={(e) => onChange({ text: e.target.value }, el.id + '.text')}
            />
          </label>
          <div className="field">
            <span className="field-label">Font</span>
            <button className="btn font-btn" onClick={() => setPicker('font')}>
              {el.font.family} ▾
            </button>
          </div>
          <div className="row2">
            <Select
              label="Vekt"
              value={el.font.weight}
              options={(fontEntry?.weights ?? [el.font.weight]).map((w) => ({ value: w, label: `${w} ${WEIGHT_NAMES[w] ?? ''}` }))}
              onChange={(w) => onChange({ font: { ...el.font, weight: w } })}
            />
            {(fontEntry?.styles.includes('italic') || el.font.italic) && (
              <Toggle label="Kursiv" checked={el.font.italic} onChange={(v) => onChange({ font: { ...el.font, italic: v } })} />
            )}
          </div>
          <Segmented<TextLayout>
            label="Plassering"
            value={el.layout}
            options={[
              { value: 'straight', label: 'Rett' },
              { value: 'arcTop', label: 'Bue topp' },
              { value: 'arcBottom', label: 'Bue bunn' },
            ]}
            onChange={(v) => onChange({ layout: v })}
          />
          <NumField label="Bokstavhøyde (versal)" value={el.size} min={1} max={40} step={0.1} onChange={set('size')} hint="Høyden på store bokstaver. Under ca. 3 mm blir detaljene vanskelige å printe." />
          <NumField label="Bokstavavstand" value={el.letterSpacing} min={-2} max={8} step={0.05} onChange={set('letterSpacing')} />
          {el.layout === 'straight' ? (
            <>
              <NumField label="Linjeavstand" value={el.lineHeight} min={0.6} max={3} step={0.05} unit="×" onChange={set('lineHeight')} />
              <Segmented
                label="Justering"
                value={el.align}
                options={[
                  { value: 'left', label: 'Venstre' },
                  { value: 'center', label: 'Midt' },
                  { value: 'right', label: 'Høyre' },
                ]}
                onChange={(v) => onChange({ align: v })}
              />
            </>
          ) : (
            <>
              <NumField label="Radius (midt i bokstavene)" value={el.radius} min={2} max={maxR * 2} step={0.1} onChange={set('radius')} />
              <NumField label="Spre over vinkel (0 = naturlig)" value={el.span} min={0} max={350} step={1} unit="°" onChange={set('span')} />
            </>
          )}
        </Section>
      )}

      {el.kind === 'icon' && (
        <Section title="Ikon">
          <div className="icon-current">
            {el.iconName.includes(':') && !el.iconName.startsWith('upload') ? (
              <img src={iconPreviewUrl(el.iconName)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
            ) : (
              <img src={'data:image/svg+xml;utf8,' + encodeURIComponent(el.svg.replace(/currentColor/g, '#e8e6e1'))} alt="" />
            )}
            <div>
              <strong>{el.iconName}</strong>
              {el.license && <div className="muted small">Lisens: {el.license}</div>}
            </div>
            <button className="btn" onClick={() => setPicker('icon')}>
              Bytt ikon…
            </button>
          </div>
          <NumField label="Størrelse (største side)" value={el.size} min={2} max={maxR * 2} step={0.5} onChange={set('size')} />
        </Section>
      )}

      {el.kind === 'image' && (
        <Section title="Bilde">
          <div className="field">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {el.dataUrl ? 'Bytt bilde…' : 'Velg bilde (PNG, JPG, SVG)…'}
            </button>
            {el.fileName && <span className="muted small"> {el.fileName}</span>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.svg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => onChange({ dataUrl: String(reader.result), fileName: f.name, name: f.name.replace(/\.[^.]+$/, '') });
                reader.readAsDataURL(f);
              }}
            />
          </div>
          <p className="muted small">Rasterbilder spores automatisk til konturer. Logoer med høy kontrast gir best resultat. SVG brukes direkte som vektor.</p>
          <NumField label="Størrelse (største side)" value={el.size} min={2} max={maxR * 2} step={0.5} onChange={set('size')} />
          {!el.dataUrl.startsWith('data:image/svg') && (
            <>
              <NumField label="Terskel" value={el.threshold} min={1} max={254} step={1} unit="" onChange={set('threshold')} hint="Hvor mørk en piksel må være for å bli med" />
              <Toggle label="Inverter (lyse områder blir form)" checked={el.invert} onChange={set('invert')} />
            </>
          )}
          <NumField label="Utjevning" value={el.smooth} min={0} max={2} step={0.05} onChange={set('smooth')} hint="Runder av små hakk og fjerner støy" />
        </Section>
      )}

      {el.kind === 'shape' && (
        <Section title="Form">
          <OutlineFields value={el.shape} maxSize={maxR * 2} onChange={(p, k) => onChange({ shape: { ...el.shape, ...p } }, el.id + '.' + k)} />
        </Section>
      )}

      {el.kind === 'ring' && (
        <Section title="Ring / bue">
          <NumField label="Radius" value={el.radius} min={1} max={maxR} step={0.1} onChange={set('radius')} />
          <NumField label="Bredde" value={el.width} min={0.2} max={20} step={0.1} onChange={set('width')} />
          <NumField label="Buelengde" value={el.span} min={5} max={360} step={1} unit="°" onChange={set('span')} />
          {el.span < 360 && <NumField label="Midtpunkt" value={el.angle} min={-180} max={360} step={1} unit="°" onChange={set('angle')} hint="90° = toppen, 270° = bunnen" />}
        </Section>
      )}

      {el.kind === 'repeat' && (
        <Section title="Gjentakelse på bue">
          <Select<RepeatItem>
            label="Figur"
            value={el.item}
            options={[
              { value: 'star', label: 'Stjerne' },
              { value: 'dot', label: 'Prikk / perle' },
              { value: 'diamond', label: 'Rombe' },
              { value: 'heart', label: 'Hjerte' },
              { value: 'square', label: 'Kvadrat' },
              { value: 'triangle', label: 'Trekant' },
            ]}
            onChange={set('item')}
          />
          <NumField label="Antall" value={el.count} min={1} max={120} step={1} unit="" onChange={set('count')} />
          <NumField label="Figurstørrelse" value={el.itemSize} min={0.5} max={20} step={0.1} onChange={set('itemSize')} />
          <NumField label="Radius" value={el.radius} min={0} max={maxR} step={0.1} onChange={set('radius')} />
          <NumField label="Buelengde" value={el.span} min={0} max={360} step={1} unit="°" onChange={set('span')} hint="360 = rundt hele" />
          <NumField label="Midtpunkt" value={el.angle} min={-180} max={360} step={1} unit="°" onChange={set('angle')} hint="90° = toppen, 270° = bunnen" />
          <Toggle label="Roter figurene langs buen" checked={el.rotateItems} onChange={set('rotateItems')} />
        </Section>
      )}

      {el.kind === 'wreath' && (
        <Section title="Laurbærkrans">
          <NumField label="Radius" value={el.radius} min={3} max={maxR} step={0.1} onChange={set('radius')} />
          <NumField label="Høyde på grenene" value={el.span} min={20} max={180} step={1} unit="°" onChange={set('span')} />
          <NumField label="Åpning nederst" value={el.gap} min={0} max={90} step={1} unit="°" onChange={set('gap')} />
          <NumField label="Blad per gren" value={el.leaves} min={2} max={30} step={1} unit="" onChange={set('leaves')} />
          <NumField label="Bladlengde" value={el.leafLength} min={1} max={25} step={0.1} onChange={set('leafLength')} />
          <NumField label="Bladbredde" value={el.leafWidth} min={0.5} max={12} step={0.1} onChange={set('leafWidth')} />
          <NumField label="Bladvinkel" value={el.leafAngle} min={0} max={80} step={1} unit="°" onChange={set('leafAngle')} />
          <NumField label="Stilk" value={el.stem} min={0} max={4} step={0.1} onChange={set('stem')} />
          <Segmented
            label="Blader"
            value={el.style}
            options={[
              { value: 'pairs', label: 'Parvis' },
              { value: 'alternate', label: 'Vekselvis' },
            ]}
            onChange={set('style')}
          />
          <Segmented
            label="Sider"
            value={el.sides}
            options={[
              { value: 'both', label: 'Begge' },
              { value: 'left', label: 'Venstre' },
              { value: 'right', label: 'Høyre' },
            ]}
            onChange={set('sides')}
          />
        </Section>
      )}

      {el.kind === 'pattern' && (
        <Section title="Mønster">
          <Select<PatternType>
            label="Type"
            value={el.pattern}
            options={[
              { value: 'rays', label: 'Stråler (solstråler)' },
              { value: 'rings', label: 'Konsentriske ringer' },
              { value: 'lines', label: 'Linjer' },
              { value: 'grid', label: 'Rutenett (diagonalt)' },
              { value: 'hex', label: 'Bikube' },
              { value: 'dots', label: 'Prikker' },
              { value: 'waves', label: 'Bølger' },
              { value: 'checker', label: 'Sjakkbrett' },
            ]}
            onChange={set('pattern')}
          />
          <NumField label="Ytre radius" value={el.extent} min={2} max={maxR} step={0.5} onChange={set('extent')} />
          <NumField label="Indre radius (tomt felt)" value={el.innerRadius} min={0} max={maxR} step={0.5} onChange={set('innerRadius')} />
          {el.pattern === 'rays' ? (
            <>
              <NumField label="Antall stråler" value={el.count} min={4} max={180} step={1} unit="" onChange={set('count')} />
              <NumField label="Strålebredde (andel)" value={el.lineWidth / el.spacing} min={0.05} max={0.95} step={0.01} unit="" onChange={(v) => onChange({ lineWidth: +(v * el.spacing).toFixed(3) }, el.id + '.lw')} />
            </>
          ) : (
            <>
              <NumField label="Avstand" value={el.spacing} min={0.5} max={15} step={0.1} onChange={set('spacing')} />
              <NumField label={el.pattern === 'dots' ? 'Prikkdiameter' : 'Linjebredde'} value={el.lineWidth} min={0.2} max={10} step={0.05} onChange={set('lineWidth')} />
            </>
          )}
        </Section>
      )}

      <Section title="Utførelse">
        <Segmented<'front' | 'back'>
          label="Side"
          value={el.side}
          options={[
            { value: 'front', label: 'Forside' },
            { value: 'back', label: 'Bakside' },
          ]}
          onChange={(v) => onChange({ side: v, mode: v === 'back' && el.mode === 'raise' ? 'engrave' : el.mode })}
        />
        <Segmented<ElementMode> label="Type" value={el.mode} options={modes} onChange={(v) => onChange({ mode: v })} />
        {el.mode !== 'cut' && (
          <NumField
            label={el.mode === 'raise' ? 'Høyde' : 'Dybde'}
            value={el.height}
            min={0.1}
            max={Math.max(5, design.base.thickness)}
            step={0.1}
            onChange={set('height')}
          />
        )}
        {(el.mode === 'raise' || el.mode === 'inlay' || el.mode === 'engrave') && !back && (
          <NumField label="Starthøyde (løft)" value={el.z} min={-design.base.thickness + 0.2} max={5} step={0.1} onChange={set('z')} hint="Løft elementet opp, f.eks. tekst oppå et banner. 0 = medaljeflaten." />
        )}
        {(el.mode === 'raise' || el.mode === 'inlay') && (
          <ColorPick label="Farge" value={el.color} colors={design.colors} onChange={set('color')} />
        )}
      </Section>

      <Section title="Plassering">
        <div className="row2">
          <NumField label="X" value={el.x} min={-maxR} max={maxR} step={0.1} onChange={set('x')} slider={false} />
          <NumField label="Y" value={el.y} min={-maxR} max={maxR} step={0.1} onChange={set('y')} slider={false} />
        </div>
        <NumField label="Rotasjon" value={el.rotation} min={-180} max={180} step={1} unit="°" onChange={set('rotation')} />
        <div className="row2">
          <Toggle label="Speilvend" checked={el.mirror} onChange={set('mirror')} />
          <Toggle label="Klipp til flaten" checked={el.clip} onChange={set('clip')} hint="Kutt bort det som går utenfor medaljeflaten/kanten" />
        </div>
        <p className="muted small">Tips: dra elementet direkte i 3D-visningen (hold Shift for 1 mm-steg), eller bruk piltastene.</p>
      </Section>

      <Section title="Effekter" defaultOpen={false}>
        <NumField label="Forsterk / slank" value={el.bold} min={-1} max={2} step={0.05} onChange={set('bold')} hint="Gjør streker tykkere (+) eller tynnere (−). Nyttig for tynne ikoner og fonter." />
        <NumField label="Kun kontur (bredde, 0 = av)" value={el.outline} min={0} max={4} step={0.05} onChange={set('outline')} hint="Lager bare omrisset av formen" />
      </Section>

      {picker === 'icon' && el.kind === 'icon' && (
        <IconPicker
          onClose={() => setPicker(null)}
          onPick={(ic) => {
            onChange({ iconName: ic.name, svg: ic.svg, license: ic.license, name: ic.name.split(':').pop() ?? ic.name });
            setPicker(null);
          }}
        />
      )}
      {picker === 'font' && el.kind === 'text' && (
        <FontPicker
          current={el.font}
          sample={el.text}
          onClose={() => setPicker(null)}
          onPick={(f) => {
            onChange({ font: f });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

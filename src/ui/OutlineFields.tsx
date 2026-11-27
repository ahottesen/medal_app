import type { OutlineParams, OutlineType } from '../model/types';
import { NumField, Select } from './widgets';

export const OUTLINE_LABELS: Record<OutlineType, string> = {
  circle: 'Sirkel',
  ellipse: 'Ellipse',
  polygon: 'Mangekant',
  star: 'Stjerne',
  rosette: 'Rosett (bølget)',
  gear: 'Tannhjul',
  shield: 'Skjold',
  heart: 'Hjerte',
  rect: 'Rektangel',
  banner: 'Banner / bånd',
};

export function OutlineFields({
  value,
  onChange,
  maxSize = 150,
  types,
}: {
  value: OutlineParams;
  onChange: (p: Partial<OutlineParams>, key: string) => void;
  maxSize?: number;
  types?: OutlineType[];
}) {
  const t = value.type;
  const hasHeight = ['ellipse', 'shield', 'heart', 'rect', 'banner'].includes(t);
  const set = (k: keyof OutlineParams) => (v: number) => onChange({ [k]: v } as Partial<OutlineParams>, 'outline.' + k);
  return (
    <>
      <Select
        label="Form"
        value={t}
        options={(types ?? (Object.keys(OUTLINE_LABELS) as OutlineType[])).map((k) => ({ value: k, label: OUTLINE_LABELS[k] }))}
        onChange={(v) => onChange({ type: v }, 'outline.type')}
      />
      <NumField
        label={t === 'circle' || t === 'polygon' || t === 'star' || t === 'rosette' || t === 'gear' ? 'Diameter' : 'Bredde'}
        value={value.width}
        min={3}
        max={maxSize}
        step={0.5}
        onChange={set('width')}
      />
      {hasHeight && <NumField label="Høyde" value={value.height} min={3} max={maxSize} step={0.5} onChange={set('height')} />}
      {t === 'polygon' && <NumField label="Antall sider" value={value.sides} min={3} max={16} step={1} unit="" onChange={set('sides')} />}
      {(t === 'star' || t === 'rosette' || t === 'gear') && (
        <NumField
          label={t === 'star' ? 'Antall tagger' : t === 'gear' ? 'Antall tenner' : 'Antall bølger'}
          value={value.points}
          min={t === 'gear' ? 6 : 3}
          max={t === 'gear' ? 60 : 40}
          step={1}
          unit=""
          onChange={set('points')}
        />
      )}
      {(t === 'star' || t === 'rosette' || t === 'gear' || t === 'banner') && (
        <NumField
          label={t === 'star' ? 'Indre radius' : t === 'gear' ? 'Tanndybde' : t === 'banner' ? 'Hakk i endene' : 'Bølgestørrelse'}
          value={value.inner}
          min={t === 'star' ? 0.15 : 0}
          max={t === 'star' ? 0.95 : 1}
          step={0.01}
          unit=""
          onChange={set('inner')}
        />
      )}
      {t === 'banner' && (
        <NumField label="Bøy" value={value.bend} min={-120} max={120} step={1} unit="°" onChange={set('bend')} hint="Positiv = buer oppover, negativ = smil" />
      )}
      {t !== 'circle' && t !== 'ellipse' && (
        <NumField label="Avrundede hjørner" value={value.corner} min={0} max={10} step={0.1} onChange={set('corner')} />
      )}
      {t !== 'circle' && <NumField label="Rotasjon" value={value.rotation} min={-180} max={180} step={1} unit="°" onChange={set('rotation')} />}
    </>
  );
}

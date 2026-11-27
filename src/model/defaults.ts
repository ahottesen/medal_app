import type {
  ColorSlot,
  ElementCommon,
  ElementKind,
  FontRef,
  IconElement,
  ImageElement,
  MedalDesign,
  MedalElement,
  OutlineParams,
  PatternElement,
  RepeatElement,
  RingElement,
  ShapeElement,
  TextElement,
  WreathElement,
} from './types';
import { PRESET_ICONS } from './presetIcons';

let idCounter = 0;
export function newId(prefix = 'el'): string {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export const COLOR_PRESETS: { name: string; hex: string; finish: ColorSlot['finish'] }[] = [
  { name: 'Gull', hex: '#d4a72c', finish: 'metal' },
  { name: 'Sølv', hex: '#c0c4cc', finish: 'metal' },
  { name: 'Bronse', hex: '#b0703a', finish: 'metal' },
  { name: 'Kobber', hex: '#c46a3c', finish: 'silk' },
  { name: 'Hvit', hex: '#f4f4f0', finish: 'matte' },
  { name: 'Svart', hex: '#222326', finish: 'matte' },
  { name: 'Rød', hex: '#c8202f', finish: 'matte' },
  { name: 'Blå', hex: '#1f5fbf', finish: 'matte' },
  { name: 'Marineblå', hex: '#1b2a4a', finish: 'matte' },
  { name: 'Grønn', hex: '#2e8b4a', finish: 'matte' },
  { name: 'Lilla', hex: '#6b3fa0', finish: 'silk' },
  { name: 'Oransje', hex: '#e8731c', finish: 'matte' },
];

export const DEFAULT_FONT: FontRef = { id: 'cinzel', family: 'Cinzel', weight: 700, italic: false };

export const defaultOutline = (over: Partial<OutlineParams> = {}): OutlineParams => ({
  type: 'circle',
  width: 60,
  height: 60,
  sides: 6,
  points: 12,
  inner: 0.5,
  corner: 0,
  rotation: 0,
  bend: 0,
  ...over,
});

function common(kind: ElementKind, name: string, over: Partial<ElementCommon> = {}): ElementCommon {
  return {
    id: newId(kind),
    name,
    visible: true,
    side: 'front',
    x: 0,
    y: 0,
    rotation: 0,
    mirror: false,
    mode: 'raise',
    height: 1,
    z: 0,
    color: 'c1',
    bold: 0,
    outline: 0,
    clip: true,
    ...over,
  };
}

export function presetIcon(name: string, size = 24, over: Partial<IconElement> = {}): IconElement {
  const p = PRESET_ICONS[name];
  return {
    ...common('icon', name.split(':')[1] ?? name),
    kind: 'icon',
    iconName: name,
    svg: p?.svg ?? '',
    license: p?.license,
    size,
    ...over,
  };
}

export function makeElement(kind: ElementKind, d: MedalDesign): MedalElement {
  const R = d.outline.width / 2;
  const face = R - (d.rim.enabled ? d.rim.width : 1);
  switch (kind) {
    case 'icon':
      return presetIcon('mdi:trophy', Math.round(R * 0.8));
    case 'text':
      return {
        ...common('text', 'Tekst'),
        kind: 'text',
        text: 'TEKST',
        font: { ...DEFAULT_FONT },
        size: Math.max(3, Math.round(R * 0.16 * 2) / 2),
        letterSpacing: 0.3,
        lineHeight: 1.25,
        align: 'center',
        layout: 'straight',
        radius: Math.max(5, face - 5),
        span: 0,
        height: 0.8,
      } satisfies TextElement;
    case 'shape':
      return {
        ...common('shape', 'Form'),
        kind: 'shape',
        shape: defaultOutline({ type: 'star', width: Math.round(R * 0.5), points: 5, inner: 0.45 }),
      } satisfies ShapeElement;
    case 'ring':
      return {
        ...common('ring', 'Ring'),
        kind: 'ring',
        radius: Math.max(3, face - 2.5),
        width: 1,
        span: 360,
        angle: 90,
        height: 0.8,
      } satisfies RingElement;
    case 'repeat':
      return {
        ...common('repeat', 'Stjerner på bue'),
        kind: 'repeat',
        item: 'star',
        radius: Math.max(3, face - 3),
        count: 5,
        span: 60,
        angle: 90,
        itemSize: 4,
        rotateItems: true,
        height: 0.8,
      } satisfies RepeatElement;
    case 'wreath':
      return {
        ...common('wreath', 'Laurbærkrans'),
        kind: 'wreath',
        radius: Math.max(5, face - 5),
        span: 150,
        gap: 20,
        leaves: 9,
        leafLength: Math.max(3, R * 0.2),
        leafWidth: Math.max(1.5, R * 0.08),
        leafAngle: 35,
        stem: 0.9,
        style: 'pairs',
        sides: 'both',
        height: 0.8,
      } satisfies WreathElement;
    case 'pattern':
      return {
        ...common('pattern', 'Strålemønster'),
        kind: 'pattern',
        pattern: 'rays',
        extent: face,
        innerRadius: 0,
        spacing: 2,
        lineWidth: 1,
        count: 36,
        height: 0.4,
      } satisfies PatternElement;
    case 'image':
      return {
        ...common('image', 'Bilde'),
        kind: 'image',
        dataUrl: '',
        fileName: '',
        threshold: 128,
        invert: false,
        size: Math.round(R),
        smooth: 0.1,
      } satisfies ImageElement;
  }
}

export const ELEMENT_LABELS: Record<ElementKind, string> = {
  icon: 'Ikon',
  text: 'Tekst',
  shape: 'Form',
  ring: 'Ring / bue',
  repeat: 'Gjentakelse på bue',
  wreath: 'Laurbærkrans',
  pattern: 'Bakgrunnsmønster',
  image: 'Bilde / SVG',
};

export function baseDesign(): MedalDesign {
  return {
    version: 1,
    name: 'Min medalje',
    outline: defaultOutline(),
    base: { thickness: 3, color: 'c1' },
    edge: {
      profile: 'chamfer',
      size: 0.6,
      bottomChamfer: 0.3,
      reeding: { enabled: false, count: 120, depth: 0.4, width: 0.8 },
    },
    rim: {
      enabled: true,
      width: 2.5,
      height: 1,
      color: 'c1',
      inner: { enabled: false, gap: 1.2, width: 0.8, height: 0.6 },
    },
    hanger: {
      type: 'loop',
      angle: 90,
      outer: 11,
      hole: 5.5,
      slotWidth: 26,
      slotHeight: 3.5,
      wall: 2.5,
      overlap: 2,
      thickness: 0,
    },
    magnet: { enabled: false, diameter: 10.2, depth: 2.2, x: 0, y: 0 },
    elements: [],
    colors: [
      { id: 'c1', name: 'Gull', hex: '#d4a72c', finish: 'metal' },
      { id: 'c2', name: 'Svart', hex: '#222326', finish: 'matte' },
      { id: 'c3', name: 'Rød', hex: '#c8202f', finish: 'matte' },
    ],
    print: { layerHeight: 0.2, firstLayer: 0.2, nozzle: 0.4, quality: 'normal' },
  };
}

function text(over: Partial<TextElement>): TextElement {
  return { ...(makeElement('text', baseDesign()) as TextElement), ...over };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  make: () => MedalDesign;
}

export const TEMPLATES: Template[] = [
  {
    id: 'classic',
    name: 'Klassisk mesterskap',
    description: 'Rund gullmedalje med krans, pokal og buetekst',
    make: () => {
      const d = baseDesign();
      d.name = 'Klassisk mesterskap';
      d.elements = [
        {
          ...(makeElement('wreath', d) as WreathElement),
          radius: 21.5,
          span: 104,
          gap: 46,
          leaves: 7,
          leafLength: 6,
          leafWidth: 2.4,
          height: 0.8,
        },
        presetIcon('mdi:trophy', 18, { y: 3, height: 1.2 }),
        text({ name: 'Topptekst', text: 'MESTERSKAP', layout: 'arcTop', radius: 21.3, size: 3.8, height: 0.8, letterSpacing: 0.3, bold: 0.08 }),
        text({ name: 'Årstall', text: '2026', y: -10, size: 4.5, height: 0.8 }),
        {
          ...(makeElement('repeat', d) as RepeatElement),
          name: 'Stjerner',
          item: 'star',
          radius: 21.5,
          angle: 270,
          span: 22,
          count: 3,
          itemSize: 3.2,
        },
        text({
          name: 'Bakside',
          text: 'NAVN\n2026',
          side: 'back',
          mode: 'engrave',
          height: 0.6,
          size: 5,
          font: { id: 'roboto', family: 'Roboto', weight: 700, italic: false },
        }),
      ];
      return d;
    },
  },
  {
    id: 'race',
    name: 'Løpsmedalje',
    description: 'Bølget kant, strålemønster og båndspalte',
    make: () => {
      const d = baseDesign();
      d.name = 'Løpsmedalje';
      d.outline = defaultOutline({ type: 'rosette', width: 70, points: 16, inner: 0.35 });
      d.hanger = { ...d.hanger, type: 'slot', slotWidth: 26, slotHeight: 3.5, wall: 2.5, overlap: 1 };
      d.colors[0] = { id: 'c1', name: 'Sølv', hex: '#c0c4cc', finish: 'metal' };
      d.colors[1] = { id: 'c2', name: 'Blå', hex: '#1f5fbf', finish: 'matte' };
      d.rim.width = 2.5;
      d.edge.size = 0.5;
      d.elements = [
        {
          ...(makeElement('pattern', d) as PatternElement),
          pattern: 'rays',
          count: 40,
          spacing: 2,
          lineWidth: 1,
          extent: 30,
          innerRadius: 13,
          height: 0.4,
        },
        {
          ...(makeElement('ring', d) as RingElement),
          name: 'Indre ring',
          radius: 13,
          width: 1,
          height: 0.8,
        },
        presetIcon('mdi:run-fast', 18, { color: 'c2', height: 1.2 }),
        text({
          name: 'Løpsnavn',
          text: 'OSLO HALVMARATON',
          layout: 'arcTop',
          radius: 22,
          size: 4,
          font: { id: 'oswald', family: 'Oswald', weight: 700, italic: false },
          letterSpacing: 0.4,
          color: 'c2',
        }),
        text({
          name: 'Distanse',
          text: '21,1 KM',
          layout: 'arcBottom',
          radius: 22,
          size: 4,
          font: { id: 'oswald', family: 'Oswald', weight: 700, italic: false },
          color: 'c2',
        }),
      ];
      return d;
    },
  },
  {
    id: 'star',
    name: 'Stjernemedalje',
    description: 'Stjerneform med plassering i midten',
    make: () => {
      const d = baseDesign();
      d.name = 'Stjernemedalje';
      d.outline = defaultOutline({ type: 'star', width: 70, points: 5, inner: 0.5, corner: 1.5 });
      d.rim = { ...d.rim, width: 2 };
      d.edge.profile = 'round';
      d.edge.size = 0.8;
      d.hanger.overlap = 1.2;
      d.elements = [
        {
          ...(makeElement('shape', d) as ShapeElement),
          name: 'Sirkel',
          shape: defaultOutline({ type: 'circle', width: 26 }),
          mode: 'raise',
          height: 0.6,
          color: 'c2',
        },
        text({
          name: 'Plassering',
          text: '1',
          size: 14,
          font: { id: 'bebas-neue', family: 'Bebas Neue', weight: 400, italic: false },
          height: 1,
          z: 0.6,
        }),
      ];
      return d;
    },
  },
  {
    id: 'shield',
    name: 'Skjold med banner',
    description: 'Skjold, ikon og buet banner med tekst',
    make: () => {
      const d = baseDesign();
      d.name = 'Skjold';
      d.outline = defaultOutline({ type: 'shield', width: 56, height: 66, corner: 1 });
      d.colors[0] = { id: 'c1', name: 'Bronse', hex: '#b0703a', finish: 'metal' };
      d.colors[1] = { id: 'c2', name: 'Hvit', hex: '#f4f4f0', finish: 'matte' };
      d.hanger.overlap = 2;
      d.elements = [
        presetIcon('mdi:soccer', 22, { y: 9, height: 1 }),
        {
          ...(makeElement('shape', d) as ShapeElement),
          name: 'Banner',
          y: -12,
          shape: defaultOutline({ type: 'banner', width: 62, height: 10, inner: 0.5, bend: 30 }),
          height: 0.8,
          color: 'c2',
          clip: false,
        },
        text({
          name: 'Bannertekst',
          text: 'CUPVINNER',
          y: -12,
          size: 4,
          height: 0.6,
          z: 0.8,
          layout: 'arcTop',
          radius: 0,
          color: 'c1',
          font: { id: 'roboto', family: 'Roboto', weight: 900, italic: false },
        }),
      ];
      // buetekst på banneret: sentrer buen under banneret
      const t = d.elements[2] as TextElement;
      const bend = 30;
      const Rb = 62 / ((bend * Math.PI) / 180);
      t.radius = Rb;
      t.y = -12 - Rb;
      return d;
    },
  },
  {
    id: 'gear',
    name: 'Teknisk tannhjul',
    description: 'Tannhjul med innlagt tekst (flerfarge, flat overflate)',
    make: () => {
      const d = baseDesign();
      d.name = 'Tannhjul';
      d.outline = defaultOutline({ type: 'gear', width: 60, points: 18, inner: 0.35, corner: 0.6 });
      d.colors[0] = { id: 'c1', name: 'Grafitt', hex: '#3a3d44', finish: 'matte' };
      d.colors[1] = { id: 'c2', name: 'Oransje', hex: '#e8731c', finish: 'matte' };
      d.rim.enabled = false;
      d.edge.profile = 'chamfer';
      d.edge.size = 0.4;
      d.hanger = { ...d.hanger, type: 'hole', hole: 5, wall: 3 };
      d.elements = [
        presetIcon('game-icons:gear-hammer', 26, { y: 2, mode: 'inlay', height: 0.6, color: 'c2' }),
        text({
          name: 'Tekst',
          text: 'MAKER 2026',
          layout: 'arcBottom',
          radius: 19,
          size: 4,
          mode: 'inlay',
          height: 0.6,
          color: 'c2',
          font: { id: 'roboto', family: 'Roboto', weight: 900, italic: false },
        }),
      ];
      return d;
    },
  },
  {
    id: 'magnet',
    name: 'Kjøleskapsmagnet',
    description: 'Liten sekskant med magnetlomme bak',
    make: () => {
      const d = baseDesign();
      d.name = 'Magnet';
      d.outline = defaultOutline({ type: 'polygon', sides: 6, width: 45, corner: 2 });
      d.hanger.type = 'none';
      d.magnet = { enabled: true, diameter: 10.2, depth: 2.2, x: 0, y: 0 };
      d.base.thickness = 4;
      d.colors[0] = { id: 'c1', name: 'Hvit', hex: '#f4f4f0', finish: 'matte' };
      d.colors[1] = { id: 'c2', name: 'Rød', hex: '#c8202f', finish: 'matte' };
      d.rim.color = 'c2';
      d.elements = [presetIcon('mdi:crown', 22, { color: 'c2', height: 1 })];
      return d;
    },
  },
  {
    id: 'coin',
    name: 'Mynt med riller',
    description: 'Myntlignende med riflet kant og dobbel ring',
    make: () => {
      const d = baseDesign();
      d.name = 'Mynt';
      d.outline = defaultOutline({ type: 'circle', width: 40 });
      d.hanger.type = 'none';
      d.edge.reeding = { enabled: true, count: 110, depth: 0.35, width: 0.6 };
      d.edge.profile = 'round';
      d.edge.size = 0.6;
      d.rim = { ...d.rim, width: 1.6, height: 0.8, inner: { enabled: true, gap: 1, width: 0.6, height: 0.5 } };
      d.colors[0] = { id: 'c1', name: 'Kobber', hex: '#c46a3c', finish: 'metal' };
      d.elements = [
        presetIcon('mdi:star-four-points', 12, { y: 3, height: 0.8 }),
        text({ name: 'Verdi', text: 'ÉN POENG', layout: 'arcBottom', radius: 14, size: 3.2, height: 0.6, bold: 0.1 }),
        text({ name: 'Navn', text: 'BELØNNING', layout: 'arcTop', radius: 14, size: 3.2, height: 0.6, bold: 0.1 }),
      ];
      return d;
    },
  },
  {
    id: 'blank',
    name: 'Tom medalje',
    description: 'Start fra bunnen',
    make: () => {
      const d = baseDesign();
      d.name = 'Ny medalje';
      return d;
    },
  },
];

export function defaultDesign(): MedalDesign {
  return TEMPLATES[0].make();
}

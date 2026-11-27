// Datamodell for en medalje. Alle mål er i millimeter, vinkler i grader.

export type ColorId = string;

export type Finish = 'matte' | 'silk' | 'metal';

export interface ColorSlot {
  id: ColorId;
  name: string;
  hex: string;
  finish: Finish;
}

export type OutlineType =
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'rosette'
  | 'gear'
  | 'shield'
  | 'heart'
  | 'rect'
  | 'banner';

export interface OutlineParams {
  type: OutlineType;
  /** Bredde / diameter */
  width: number;
  /** Høyde (ellipse, skjold, hjerte, rektangel, banner) */
  height: number;
  /** Antall sider (polygon) */
  sides: number;
  /** Antall tagger / bølger / tenner (stjerne, rosett, tannhjul) */
  points: number;
  /** 0..1: indre radius (stjerne), bølgestørrelse (rosett), tanndybde (tannhjul), hakk (banner) */
  inner: number;
  /** Avrunding av hjørner i mm */
  corner: number;
  /** Rotasjon i grader */
  rotation: number;
  /** Bøy (banner), grader. Positiv = buet opp (bue), negativ = smil */
  bend: number;
}

export type EdgeProfile = 'none' | 'chamfer' | 'round';

export type HangerType = 'none' | 'loop' | 'slot' | 'hole';

export type ElementMode = 'raise' | 'engrave' | 'inlay' | 'cut';

export type Side = 'front' | 'back';

export interface FontRef {
  /** Fontsource-id (f.eks. "roboto") eller "upload:<navn>" */
  id: string;
  family: string;
  weight: number;
  italic: boolean;
  /** Base64-data for opplastet font (ttf/otf/woff) */
  data?: string;
}

export interface ElementCommon {
  id: string;
  name: string;
  visible: boolean;
  side: Side;
  x: number;
  y: number;
  rotation: number;
  mirror: boolean;
  mode: ElementMode;
  /** Høyde for opphøyd, dybde for gravert/innlagt */
  height: number;
  /** Ekstra løft/startnivå over medaljeflaten (for å stable elementer) */
  z: number;
  color: ColorId;
  /** Forsterk (+) / slank (−) i mm */
  bold: number;
  /** 0 = fylt; > 0 = kun kontur med denne bredden */
  outline: number;
  /** Klipp elementet til medaljeflaten (innenfor kanten) */
  clip: boolean;
}

export interface IconElement extends ElementCommon {
  kind: 'icon';
  iconName: string;
  svg: string;
  size: number;
  license?: string;
}

export type TextLayout = 'straight' | 'arcTop' | 'arcBottom';

export interface TextElement extends ElementCommon {
  kind: 'text';
  text: string;
  font: FontRef;
  /** Versalhøyde i mm */
  size: number;
  /** Ekstra bokstavavstand i mm */
  letterSpacing: number;
  /** Linjeavstand (multiplikator) */
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  layout: TextLayout;
  /** Radius til midten av bokstavene (buetekst) */
  radius: number;
  /** Spre teksten over denne vinkelen (0 = naturlig avstand) */
  span: number;
}

export interface ShapeElement extends ElementCommon {
  kind: 'shape';
  shape: OutlineParams;
}

export interface RingElement extends ElementCommon {
  kind: 'ring';
  radius: number;
  width: number;
  /** Bue-lengde i grader (360 = hel ring) */
  span: number;
  /** Senter av buen, grader (90 = topp) */
  angle: number;
}

export type RepeatItem = 'dot' | 'star' | 'diamond' | 'heart' | 'square' | 'triangle';

export interface RepeatElement extends ElementCommon {
  kind: 'repeat';
  item: RepeatItem;
  radius: number;
  count: number;
  span: number;
  angle: number;
  itemSize: number;
  rotateItems: boolean;
}

export interface WreathElement extends ElementCommon {
  kind: 'wreath';
  radius: number;
  /** Hvor høyt hver gren går, i grader fra bunnen */
  span: number;
  /** Åpning nederst, grader */
  gap: number;
  leaves: number;
  leafLength: number;
  leafWidth: number;
  leafAngle: number;
  stem: number;
  style: 'pairs' | 'alternate';
  sides: 'both' | 'left' | 'right';
}

export type PatternType = 'rays' | 'rings' | 'lines' | 'grid' | 'hex' | 'dots' | 'waves' | 'checker';

export interface PatternElement extends ElementCommon {
  kind: 'pattern';
  pattern: PatternType;
  /** Mønsteret dekker en sirkel med denne radiusen */
  extent: number;
  /** Indre radius uten mønster (stråler/ringer) */
  innerRadius: number;
  spacing: number;
  lineWidth: number;
  /** Antall stråler */
  count: number;
}

export interface ImageElement extends ElementCommon {
  kind: 'image';
  dataUrl: string;
  fileName: string;
  threshold: number;
  invert: boolean;
  size: number;
  /** Utjevning av konturer (mm) */
  smooth: number;
}

export type MedalElement =
  | IconElement
  | TextElement
  | ShapeElement
  | RingElement
  | RepeatElement
  | WreathElement
  | PatternElement
  | ImageElement;

export type ElementKind = MedalElement['kind'];

export interface MedalDesign {
  version: 1;
  name: string;
  outline: OutlineParams;
  base: {
    thickness: number;
    color: ColorId;
  };
  edge: {
    profile: EdgeProfile;
    size: number;
    bottomChamfer: number;
    reeding: { enabled: boolean; count: number; depth: number; width: number };
  };
  rim: {
    enabled: boolean;
    width: number;
    height: number;
    color: ColorId;
    inner: { enabled: boolean; gap: number; width: number; height: number };
  };
  hanger: {
    type: HangerType;
    angle: number;
    /** Ytre diameter (øye) */
    outer: number;
    /** Hulldiameter (øye / hull) */
    hole: number;
    /** Båndspalte bredde og høyde */
    slotWidth: number;
    slotHeight: number;
    /** Godstykkelse rundt spalten */
    wall: number;
    /** Hvor mye opphenget går inn i medaljen */
    overlap: number;
    /** Tykkelse på opphenget (0 = samme som medaljen) */
    thickness: number;
  };
  magnet: { enabled: boolean; diameter: number; depth: number; x: number; y: number };
  elements: MedalElement[];
  colors: ColorSlot[];
  print: {
    layerHeight: number;
    firstLayer: number;
    nozzle: number;
    quality: 'draft' | 'normal' | 'high';
  };
}

// ---------- 2D-formdata (fra hovedtråd til geometri-worker) ----------

export type FlatPoly = number[]; // [x0, y0, x1, y1, ...]

export type ShapeOp =
  | { kind: 'fill'; sub: boolean; rule: 'NonZero' | 'EvenOdd'; contours: FlatPoly[] }
  | {
      kind: 'stroke';
      sub: boolean;
      width: number;
      cap: 'round' | 'butt' | 'square';
      paths: { pts: FlatPoly; closed: boolean }[];
    };

export interface ShapeData {
  ops: ShapeOp[];
  /** [minX, minY, maxX, maxY] */
  bounds: [number, number, number, number];
  /** Skaler så største side = element.size, og sentrer */
  normalize: boolean;
}

// ---------- Byggeresultat ----------

export interface BuiltPart {
  colorId: ColorId;
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
  minZ: number;
  maxZ: number;
}

export interface BuildWarning {
  elementId?: string;
  level: 'info' | 'warn';
  message: string;
}

export interface BuildResult {
  seq: number;
  parts: BuiltPart[];
  elementBounds: Record<string, [number, number, number, number]>;
  /** Medaljeflaten (der elementer klippes), polygoner for 2D-hjelpelinjer */
  faceZ: number;
  size: [number, number, number];
  warnings: BuildWarning[];
  timeMs: number;
  error?: string;
}

export interface BuildRequest {
  seq: number;
  design: MedalDesign;
  shapes: Record<string, ShapeData>;
}

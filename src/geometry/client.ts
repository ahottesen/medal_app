import type { BuildRequest, BuildResult, MedalDesign, ShapeData } from '../model/types';

/** Hovedtrådens grensesnitt mot geometri-workeren. Bare siste forespørsel teller. */
export class GeometryClient {
  private worker: Worker;
  private seq = 0;
  private listeners = new Set<(r: BuildResult) => void>();
  private waiters = new Map<number, (r: BuildResult) => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<BuildResult>) => {
      const r = e.data;
      const w = this.waiters.get(r.seq);
      if (w) {
        this.waiters.delete(r.seq);
        w(r);
      }
      if (r.seq === this.seq || r.seq === -1) for (const l of this.listeners) l(r);
      // forkast eldre ventere som aldri blir bygget
      for (const k of this.waiters.keys()) if (k < r.seq) this.waiters.delete(k);
    };
  }

  onResult(fn: (r: BuildResult) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  build(design: MedalDesign, shapes: Record<string, ShapeData>): Promise<BuildResult> {
    const seq = ++this.seq;
    const req: BuildRequest = { seq, design: stripHeavy(design), shapes };
    return new Promise((resolve) => {
      this.waiters.set(seq, resolve);
      this.worker.postMessage(req);
    });
  }
}

/** Fjern store felt (SVG, bildedata, fontdata) som workeren ikke trenger. */
function stripHeavy(d: MedalDesign): MedalDesign {
  return {
    ...d,
    elements: d.elements.map((el) => {
      switch (el.kind) {
        case 'icon':
          return { ...el, svg: '' };
        case 'image':
          return { ...el, dataUrl: '' };
        case 'text':
          return { ...el, font: { ...el.font, data: undefined } };
        default:
          return el;
      }
    }),
  };
}

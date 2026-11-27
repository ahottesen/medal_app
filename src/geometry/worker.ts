/// <reference lib="webworker" />
// Geometri-worker: holder manifold-3d (WASM) og bygger modellen uten å fryse brukergrensesnittet.
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildMedal } from './build';
import type { BuildRequest, BuildResult } from '../model/types';

const ready = (async () => {
  const M = await Module({ locateFile: () => wasmUrl });
  M.setup();
  return M;
})();

let pending: BuildRequest | null = null;
let busy = false;

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  pending = e.data;
  void pump();
};

async function pump() {
  if (busy) return;
  busy = true;
  try {
    const M = await ready;
    while (pending) {
      const req = pending;
      pending = null;
      const res: BuildResult = buildMedal(M, req);
      const transfer: Transferable[] = [];
      for (const p of res.parts) transfer.push(p.positions.buffer, p.indices.buffer);
      (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, transfer);
      // la ventende meldinger komme inn, slik at bare den nyeste bygges
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      seq: -1,
      parts: [],
      elementBounds: {},
      faceZ: 0,
      size: [0, 0, 0],
      warnings: [],
      timeMs: 0,
      error: 'Geometrimotoren kunne ikke starte: ' + (e instanceof Error ? e.message : String(e)),
    } satisfies BuildResult);
  } finally {
    busy = false;
  }
}

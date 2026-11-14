// Stage 5 search in a Web Worker, so the interface stays responsive while it runs (about two seconds).
import type { Context } from './characteristics';
import { search } from './search';

self.onmessage = (e: MessageEvent<{ key: string; ctx: Context }>) => {
  const r = search(e.data.ctx);
  (self as unknown as Worker).postMessage({ key: e.data.key, variants: r.variants, baseline: r.baseline, soilScale: r.soilScale, evaluated: r.evaluated, combinations: r.combinations });
};

// Experiment G: how much do the illustrative variable costs matter for comparing variants?
// Each crop's cost is moved independently by up to ±20 % (uniform), 200 draws. For the non-dominated variants found
// with the base costs: is the order by margin kept, does the best-margin variant stay on top, and does the difference
// to usual practice keep its sign?
// Usage: npx tsx pipeline/91_cost_sensitivity.ts   -> prints a summary
import { characteristics, optionPart, prepare } from '../src/engine/characteristics.ts';
import { economics, fields, makeContext, makeSetup } from '../src/pilot/demo.ts';
import { search } from '../src/engine/search.ts';
import { spearman, rng, quantile } from './lib/stats.ts';

const ctx = makeContext(makeSetup());
const base = search(ctx);
const all = [base.baseline, ...base.variants];
const rand = rng(7);
const margins = (econ: any) => {
  const c = { ...ctx, econ }; const pre = prepare(c);
  return all.map(v => characteristics(pre, v.options, v.options.map(o => optionPart(pre, fields.find(f => f.id === o.fieldId)!, o))).marginMean);
};
const m0 = margins(economics);
const top0 = m0.indexOf(Math.max(...m0.slice(1)));
const rho: number[] = [], diffTop: number[] = []; let topStays = 0, topIn3 = 0, signKept = 0;
const N = 200;
for (let i = 0; i < N; i++) {
  const econ = JSON.parse(JSON.stringify(economics));
  for (const c of Object.values<any>(econ.crops)) if (c.costEurHa) c.costEurHa *= 0.8 + 0.4 * rand();
  const m = margins(econ);
  rho.push(spearman(m0.slice(1), m.slice(1)));
  const order = m.slice(1).map((v, k) => [v, k + 1] as const).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  if (order[0] === top0) topStays++; if (order.slice(0, 3).includes(top0)) topIn3++;
  diffTop.push(m[top0] - m[0]); if (Math.sign(m[top0] - m[0]) === Math.sign(m0[top0] - m0[0])) signKept++;
}
console.log(`variants on the front: ${base.variants.length}; base margins ${Math.min(...m0.slice(1))}..${Math.max(...m0.slice(1))} EUR/ha, usual practice ${m0[0]}`);
console.log(`rank correlation of margins, base vs perturbed costs: median ${quantile(rho, 0.5).toFixed(2)}, 10th percentile ${quantile(rho, 0.1).toFixed(2)}`);
console.log(`best-margin variant stays first in ${(topStays / N * 100).toFixed(0)} % of draws, in the top three in ${(topIn3 / N * 100).toFixed(0)} %`);
console.log(`best-margin minus usual practice: base ${m0[top0] - m0[0]} EUR/ha; perturbed median ${quantile(diffTop, 0.5).toFixed(0)}, 10th-90th percentile ${quantile(diffTop, 0.1).toFixed(0)}..${quantile(diffTop, 0.9).toFixed(0)}; sign kept in ${(signKept / N * 100).toFixed(0)} % of draws`);

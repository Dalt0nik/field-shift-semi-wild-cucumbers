// Runs the engine on the demo farm and prints the result (a smoke check for stages 2-7 outside the browser), and
// checks how close the heuristic search comes to bounds that can be computed exactly.
// Usage: npx tsx pipeline/90_engine_check.ts [decision day ...]      default: the decision day of the demo
//   e.g. npx tsx pipeline/90_engine_check.ts 2026-07-15 2026-08-01 2026-09-01 2026-11-14
import { rulesFor } from '../src/engine/characteristics.ts';
import { AXES, consequences, search, shareBeaten } from '../src/engine/search.ts';
import { catchBefore } from '../src/engine/plan.ts';
import { DECISION_DATE, fields, makeContext, makeSetup } from '../src/pilot/demo.ts';
import { cropLabel } from '../src/pilot/regional.ts';

const dates = process.argv.slice(2).length ? process.argv.slice(2) : [DECISION_DATE];
const pctS = (v: number) => `${(v * 100).toFixed(0)}%`;
const show = (v: any) => `${String(v.id).padEnd(6)} margin ${v.ch.marginMean} [${v.ch.marginP10}..${v.ch.marginP90}] worst5th ${v.ch.marginWorstFifth} dry ${v.ch.marginDry} wetH ${v.ch.marginWetHarvest} | S1e ${v.ch.bareErosive.p50} [${v.ch.bareErosive.p25}-${v.ch.bareErosive.p75}] S1 ${v.ch.bareDays.p50} S2 ${v.ch.bareOnSlopes} S5 ${v.ch.bareLeaching} S4 ${v.ch.wetHarvestHa}ha S6 ${v.ch.humus} fam ${v.ch.familiesPerYear.join('/')} | c>c ${pctS(v.ch.cerealAfterCereal)} legume ${pctS(v.ch.legumeShare)} largest ${pctS(v.ch.largestCropShare)} eco ${v.ch.ecoRotationEligible.map((e: boolean) => (e ? 'Y' : 'n')).join('')} pay ${v.ch.paymentsEurHa} ${v.ch.feasible ? '' : 'INFEASIBLE '}${v.tags.join(', ')}`;
const plan = (v: any) => v.options.map((o: any) => `  ${o.fieldId}: ${o.crops.map((c: string, i: number) => (catchBefore(o, i) ? 'catch crop + ' : '') + cropLabel(c) + (o.fixed[i] ? '*' : '')).join(' -> ')}${o.warnings.length ? '  ! ' + o.warnings.join('; ') : ''}`).join('\n');

for (const date of dates) {
  const t0 = Date.now();
  const ctx = makeContext(makeSetup({ decisionDate: date }));
  const r = search(ctx);
  console.log(`\n================ decision day ${date} · harvests ${ctx.setup.planYears.join(', ')} ================`);
  console.log(`in the ground for ${ctx.setup.planYears[0]}: ${Object.entries(ctx.setup.current).filter(([, c]) => c).map(([f, c]) => `${f} ${c}`).join(', ') || 'nothing'}`);
  console.log(`options per field: ${r.fieldOpts.map(fo => `${fo.field.id}:${fo.options.length}`).join(' ')}`);
  console.log(`combinations ${r.combinations.toExponential(2)}; evaluated ${r.evaluated}; non-dominated ${r.variants.length}; ${Date.now() - t0} ms`);
  const span = (get: (c: any) => number) => { const v = r.variants.map(x => get(x.ch)); return `${Math.min(...v)}–${Math.max(...v)}`; };
  console.log(`span of the non-dominated plans: margin ${span(c => c.marginMean)} (usual ${r.baseline.ch.marginMean}) | S1e ${span(c => c.bareErosive.p50)} (usual ${r.baseline.ch.bareErosive.p50}) | S1 ${span(c => c.bareDays.p50)} (usual ${r.baseline.ch.bareDays.p50}) | S5 ${span(c => c.bareLeaching)} (usual ${r.baseline.ch.bareLeaching}) | S6 ${span(c => c.humus)} (usual ${r.baseline.ch.humus}) | c>c ${span(c => Math.round(c.cerealAfterCereal * 100))} % (usual ${Math.round(r.baseline.ch.cerealAfterCereal * 100)} %)`);
  console.log('BASE  ', show(r.baseline), 'nonDominated', r.baseline.nonDominated);
  // usual practice is the typical of the statistical farms (docs/usual-practice.md): their spread, and how the cards place
  const fb = r.farmers;
  console.log(`statistical farms: ${fb.n} kept of ${fb.drawn} drawn${fb.rulesPassed ? '' : ' (too few pass the farm rules: failing farms kept too)'} | 10th / 50th / 90th percentile: ${AXES.map(a => `${a.key} ${fb.axes[a.key].p10.toFixed(0)} / ${fb.axes[a.key].p50.toFixed(0)} / ${fb.axes[a.key].p90.toFixed(0)}`).join(' | ')}`);
  console.log(`kept farmer probability per field: ${Object.entries(fb.keptMass).map(([f, m]) => `${f} ${m.toFixed(2)}${m < 0.2 ? ' (!)' : ''}`).join(' ')}`);
  for (const v of r.variants.filter(v => v.tags.length)) console.log(`  ${v.tags.join(', ').padEnd(30)} beats statistical farms: ${AXES.map(a => `${a.key} ${(shareBeaten(fb, a.key, v.ch) * 100).toFixed(0)} %`).join(', ')}`);
  for (const v of r.variants.filter(v => v.tags.length)) console.log(show(v));

  // exact bounds: soil and margin add up over fields, so the best option of each field taken alone bounds the farm.
  // The farm rules can only make it worse; the rotation eco-scheme (a farm-level payment) is added to the margin bound.
  const pre = r.pre, total = pre.totalHa;
  const parts = r.fieldOpts.map(fo => fo.options.map(o => ({ o, s1e: 0, m: 0 })));
  void parts;
  const best = r.variants.find(v => v.tags.includes('best: soil'))!, top = r.variants.find(v => v.tags.includes('best: margin, usual season'))!;
  const ws = await import('../src/engine/editor.ts').then(m => m.workspace(ctx));
  const loS1e = ws.fields.reduce((t, fc) => t + Math.min(...fc.parts.map(p => p.bareErosive[1])), 0) / total;
  const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
  const hiMargin = ws.fields.reduce((t, fc) => t + Math.max(...fc.parts.map(p => mean(p.margin))), 0) / total;
  const greedy = ws.fields.map(fc => fc.options[fc.parts.reduce((b, p, k) => (p.bareErosive[1] < fc.parts[b].bareErosive[1] ? k : b), 0)]);
  console.log(`bounds: S1e cannot be below ${loS1e.toFixed(1)} (each field's best option, rules ignored${rulesFor(ctx, greedy).feasible ? '; that plan passes the rules' : '; that plan breaks a farm rule'}); best for soil found ${best.ch.bareErosive.p50}`);
  console.log(`        margin cannot exceed ${Math.round(hiMargin)} + rotation payment up to 48 = ${Math.round(hiMargin + 48)}; highest margin found ${top.ch.marginMean} (payments ${top.ch.paymentsEurHa})`);
  // stability of the heuristic: other seeds, and a longer run
  const alt = [1, 2, 3].map(seed => search(ctx, { seed }));
  const long = search(ctx, { population: 240, generations: 320 });
  const key = (x: typeof r) => `S1e ${Math.min(...x.variants.map(v => v.ch.bareErosive.p50))} margin ${Math.max(...x.variants.map(v => v.ch.marginMean))} worst5th ${Math.max(...x.variants.map(v => v.ch.marginWorstFifth))} c>c ${Math.min(...x.variants.map(v => Math.round(v.ch.cerealAfterCereal * 100)))}`;
  console.log(`best per axis, default run: ${key(r)}\n   other seeds: ${alt.map(key).join(' | ')}\n   longer run (${long.evaluated} evaluated): ${key(long)}`);

  console.log('best-for-soil plan:'); console.log(plan(best));
  console.log('usual practice:'); console.log(plan(r.baseline));
  for (const rule of best.ch.rules) console.log('   ', rule.year, rule.title, rule.ok ? 'OK' : 'FAIL', '|', rule.detail);
  const c = consequences(ctx, fields[1], best.options[1]);
  console.log('consequences F2', c.year, 'open', c.open.join(','), '| closed', c.closed.map(x => x.crop + ': ' + x.reasons[0]).join(' ; ').slice(0, 300));
}
void AXES;

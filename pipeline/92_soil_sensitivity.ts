// How much does the soil headline (S1e, erosion-weighted days without cover) depend on how the erosivity shares are
// computed? For every set of shares in src/data/soil-climate.json the search is run again and compared with the base:
// does the plan with the fewest such days stay the same, where does the base plan rank, and is the order of the plans
// kept. (That plan was "Best for soil" until the soil health score; the score's own check, against other weights of its
// three aspects, is in tests/soil.test.ts.)
// Also prints the price of soil protection along the non-dominated set (highest margin at each S1e value).
// With no argument it also writes src/data/soil-check.json: the numbers the Method tab of Analytics and the assistant
// quote. tests/soil.test.ts fails when that file no longer matches the demo set-up.
// Usage: npx tsx pipeline/92_soil_sensitivity.ts [decision day]
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib/ee.ts';
import { workspace } from '../src/engine/editor.ts';
import { characteristics, optionPart, prepare } from '../src/engine/characteristics.ts';
import { optionKey } from '../src/engine/plan.ts';
import { search } from '../src/engine/search.ts';
import { fewestBareSoil } from '../src/engine/soil-score.ts';
import { DECISION_DATE, fields, makeContext, makeSetup } from '../src/pilot/demo.ts';
import { soilClimate } from '../src/pilot/soil.ts';
import { spearman } from './lib/stats.ts';

const date = process.argv[2] ?? DECISION_DATE;
const setup = makeSetup({ decisionDate: date });
const ctxOf = (erosivity?: string) => makeContext(setup, { erosivity });
const base = search(ctxOf());
const soilBest = (r: typeof base) => fewestBareSoil(r.variants);
const sig = (v: { options: any[] }) => v.options.map(optionKey).join(' / ');
const b0 = soilBest(base);
console.log(`decision day ${date}; base shares "${soilClimate.erosivity.base}"; non-dominated ${base.variants.length}; fewest bare-soil days: S1e ${b0.ch.bareErosive.p50}, margin ${b0.ch.marginMean}; usual practice S1e ${base.baseline.ch.bareErosive.p50}, margin ${base.baseline.ch.marginMean}`);

const ws = workspace(ctxOf());
const bound = ws.fields.reduce((t, fc) => t + Math.min(...fc.parts.map(p => p.bareErosive[1])), 0) / ws.totalHa;
const check: any = { decisionDate: date, cropSet: setup.cropSet, base: soilClimate.erosivity.base, plans: base.variants.length + 1,
  fewestBareSoil: { s1e: b0.ch.bareErosive.p50, margin: b0.ch.marginMean }, usual: { s1e: base.baseline.ch.bareErosive.p50, margin: base.baseline.ch.marginMean },
  lowerBound: +bound.toFixed(1), frontier: [] as any[], variants: [] as any[] };
console.log('\nprice of soil protection (non-dominated plans, the highest margin at each S1e):');
const byS = new Map<number, typeof b0>();
for (const v of base.variants) { const k = v.ch.bareErosive.p50; if (!byS.has(k) || v.ch.marginMean > byS.get(k)!.ch.marginMean) byS.set(k, v); }
for (const [k, v] of [...byS].sort((a, b) => a[0] - b[0])) check.frontier.push({ s1e: k, margin: v.ch.marginMean });
for (const [k, v] of [...byS].sort((a, b) => a[0] - b[0])) console.log(`  S1e ${k}  margin ${v.ch.marginMean}  (${v.ch.marginMean - base.baseline.ch.marginMean >= 0 ? '+' : ''}${v.ch.marginMean - base.baseline.ch.marginMean} against usual)  S1 ${v.ch.bareDays.p50} S5 ${v.ch.bareLeaching} S6 ${v.ch.humus} c>c ${Math.round(v.ch.cerealAfterCereal * 100)} % ${v.tags.join(', ')}`);

console.log('\nsensitivity to the erosivity shares:');
const all = [base.baseline, ...base.variants];
const s1eUnder = (erosivity: string) => { const c = ctxOf(erosivity), pre = prepare(c); return all.map(v => { const parts = v.options.map(o => optionPart(pre, fields.find(f => f.id === o.fieldId)!, o)); return parts.reduce((t, p) => t + p.bareErosive[1], 0) / pre.totalHa; }); };
const s0 = s1eUnder(soilClimate.erosivity.base);
void characteristics;
for (const key of Object.keys(soilClimate.erosivity.shares)) {
  const r = search(ctxOf(key)), b = soilBest(r), s = s1eUnder(key);
  const same = sig(b) === sig(b0), diff = b.options.filter((o, i) => optionKey(o) !== optionKey(b0.options[i])).length;
  // the base Best-for-soil plan measured with these shares: its place among the base plans
  const i0 = all.indexOf(b0), rank = s.filter(v => v < s[i0] - 1e-9).length + 1;
  if (key !== soilClimate.erosivity.base) check.variants.push({ key, junToAug: soilClimate.erosivity.summary[key].junToAug, decToFeb: soilClimate.erosivity.summary[key].decToFeb, basePlanRank: rank, of: all.length, rho: +spearman(s0, s).toFixed(3), bestDiffersOnFields: diff, basePlanS1e: +s[i0].toFixed(1), usualS1e: +s[0].toFixed(1) });
  console.log(`  ${key.padEnd(15)} Jun-Aug ${(soilClimate.erosivity.summary[key].junToAug * 100).toFixed(0)} %, Dec-Feb ${(soilClimate.erosivity.summary[key].decToFeb * 100).toFixed(0)} % | best for soil: S1e ${b.ch.bareErosive.p50}, margin ${b.ch.marginMean}, ${same ? 'the same plan' : `differs on ${diff} fields`} | base plan under these shares: S1e ${s[i0].toFixed(1)} (usual ${s[0].toFixed(1)}), rank ${rank} of ${all.length} | order of plans kept: rho ${spearman(s0, s).toFixed(3)}`);
}
if (!process.argv[2]) { fs.writeFileSync(path.join(OUT, 'soil-check.json'), JSON.stringify(check, null, 1)); console.log('\nwritten src/data/soil-check.json'); }

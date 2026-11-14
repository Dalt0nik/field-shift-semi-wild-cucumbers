// Runs the engine on the demo farm and prints the result (a smoke check for stages 2-7 outside the browser).
// Usage: npx tsx pipeline/90_engine_check.ts
import { AXES, consequences, search } from '../src/engine/search.ts';
import { fields, makeContext, makeSetup } from '../src/pilot/demo.ts';
import { cropLabel } from '../src/pilot/regional.ts';

const t0 = Date.now();
const ctx = makeContext(makeSetup());
const r = search(ctx);
console.log(`fields ${fields.length}; options per field: ${r.fieldOpts.map(fo => `${fo.field.id}:${fo.options.length}`).join(' ')}`);
console.log(`combinations ${r.combinations.toExponential(2)}; evaluated ${r.evaluated}; non-dominated ${r.variants.length}; ${Date.now() - t0} ms`);
console.log('normal levels:', Object.entries(r.pre.normal).map(([c, n]) => `${c} ${n.yieldTHa.toFixed(2)} t/ha x ${n.priceEurT.toFixed(0)} - ${n.costEurHa}`).join(' | '));
const show = (v: any) => `${v.id.padEnd(6)} margin ${v.ch.marginMean} [${v.ch.marginP10}..${v.ch.marginP90}] worst5th ${v.ch.marginWorstFifth} dry ${v.ch.marginDry} wetH ${v.ch.marginWetHarvest} | bare ${v.ch.bareDays.p50} [${v.ch.bareDays.p25}-${v.ch.bareDays.p75}] winter ${v.ch.bareDaysWinter} slopes ${v.ch.bareOnSlopes} | c>c ${(v.ch.cerealAfterCereal * 100).toFixed(0)}% legume ${(v.ch.legumeShare * 100).toFixed(0)}% largest ${(v.ch.largestCropShare * 100).toFixed(0)}% eco ${v.ch.ecoRotationEligible.map((e: boolean) => (e ? 'Y' : 'n')).join('')} pay ${v.ch.paymentsEurHa} feasible ${v.ch.feasible} ${v.tags.join(', ')}`;
console.log('BASE  ', show(r.baseline), 'nonDominated', r.baseline.nonDominated);
for (const rule of r.baseline.ch.rules) console.log('   ', rule.year, rule.title, rule.ok ? 'OK' : 'FAIL', '|', rule.value);
for (const v of r.variants.filter(v => v.tags.length)) console.log(show(v));
console.log('...all:'); for (const v of r.variants.slice(0, 12)) console.log(show(v));
const pick = r.variants.find(v => v.tags.includes('balanced'))!;
console.log('balanced plan:'); for (const o of pick.options) console.log(`  ${o.fieldId}: ${o.crops.map((c, i) => cropLabel(c) + (i > 0 && o.catchAfter[i - 1] ? ' (after catch crop)' : '') + (o.fixed[i] ? '*' : '')).join(' -> ')}${o.warnings.length ? '  ! ' + o.warnings.join('; ') : ''}`);
for (const rule of pick.ch.rules) console.log('   ', rule.year, rule.title, rule.ok ? 'OK' : 'FAIL', '|', rule.detail);
const c = consequences(ctx, fields[1], pick.options[1]);
console.log('consequences F2', c.year, 'open', c.open.join(','), '| closed', c.closed.map(x => x.crop + ': ' + x.reasons[0]).join(' ; ').slice(0, 400));
console.log('rejected F2:', r.fieldOpts[1].rejected.slice(0, 6).map(x => `${x.year} ${x.crop} after ${x.after}: ${x.reasons[0]}`).join(' | ').slice(0, 700));
void AXES;

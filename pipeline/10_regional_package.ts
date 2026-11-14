// Regional package for Lithuania: converts the reviewed crop reference (pipeline/inputs/crops.yaml, LAMMC guides)
// into the compact JSON the engine reads. Nothing is retyped by hand: sowing and harvest windows, preceding-crop
// rules and return intervals come from the reference; a missing value stays null ("unknown", never "allowed").
// Usage: npx tsx pipeline/10_regional_package.ts [--print]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, 'inputs', 'crops.yaml');
const y = YAML.parse(fs.readFileSync(src, 'utf8'));

const md = (v: unknown): string | null => (typeof v === 'string' && /^\d\d-\d\d$/.test(v) ? v : null);
const crops: Record<string, unknown> = {};
for (const [id, c] of Object.entries<any>(y.crops)) {
  const sow = c.sowing ?? {};
  const har = c.harvest ?? {};
  const rule = (r: any) => ({ ref: r.ref, severity: r.severity ?? 'soft', reason: r.reason ?? '' });
  crops[id] = {
    id,
    name: c.names?.en ?? id,
    nameLt: c.names?.lt ?? '',
    season: c.season ?? null,
    groups: c.groups ?? [],
    declarationClass: c.declaration_class?.code ?? null,
    sowing: {
      from: md(sow.optimal?.from) ?? md(sow.earliest) ?? md(sow.from),
      to: md(sow.optimal?.to) ?? md(sow.to),
      latest: md(sow.latest),
      status: sow.optimal ? 'primary' : sow.estimate ? 'estimate' : 'unknown',
      estimate: sow.estimate ? { from: md(sow.estimate.from), to: md(sow.estimate.to) } : null,
    },
    harvest: {
      from: md(har.from) ?? md(har.estimate?.from),
      to: md(har.to) ?? md(har.estimate?.to),
      status: md(har.from) ? 'primary' : har.estimate ? 'estimate' : 'unknown',
    },
    gdd: c.gdd ? { base: c.gdd.base_c ?? null, toMaturity: c.gdd.sowing_to_maturity_c ?? null } : null,
    previous: { good: (c.previous_crops?.good ?? []).map(rule), bad: (c.previous_crops?.bad ?? []).map(rule) },
    returnInterval: c.return_interval_years ? { min: c.return_interval_years.min ?? null, recommended: c.return_interval_years.recommended ?? null, scope: c.return_interval_years.scope ?? id } : null,
  };
}
const groups: Record<string, string[]> = {};
for (const [g, v] of Object.entries<any>(y.groups ?? {})) groups[g] = v.members ?? v.crops ?? (Array.isArray(v) ? v : []);
const out = { meta: { source: 'pipeline/inputs/crops.yaml', version: y.meta?.version, compiled: y.meta?.compiled }, crops, groups, pseudoCrops: Object.keys(y.pseudo_crops ?? {}) };

if (process.argv.includes('--print')) {
  for (const c of Object.values<any>(crops)) {
    console.log(`${c.id.padEnd(18)} ${String(c.season).padEnd(7)} sow ${c.sowing.from}..${c.sowing.to} (latest ${c.sowing.latest}, ${c.sowing.status}${c.sowing.estimate ? ' est ' + c.sowing.estimate.from + '..' + c.sowing.estimate.to : ''}) harvest ${c.harvest.from}..${c.harvest.to} (${c.harvest.status}) ret ${c.returnInterval?.min}/${c.returnInterval?.recommended}@${c.returnInterval?.scope} groups ${c.groups.join('/')}`);
    console.log(`   bad: ${c.previous.bad.map((r: any) => `${r.ref}(${r.severity})`).join(', ')} | good: ${c.previous.good.map((r: any) => r.ref).join(', ')}`);
  }
  console.log('groups', JSON.stringify(groups));
  console.log('raw group sample', JSON.stringify(y.groups.cereals), JSON.stringify(y.groups.brassicas));
  console.log('derived_rules', JSON.stringify(y.derived_rules).slice(0, 1500));
} else {
  const dst = path.resolve(here, '..', 'src', 'data', 'regional-lt.json');
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('written', dst, Object.keys(crops).length, 'crops');
}

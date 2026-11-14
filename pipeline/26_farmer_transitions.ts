// Usual practice from what farmers actually sow: the transition table of the statistical farmer (docs/usual-practice.md).
// What follows each declaration class on the fields within RADIUS_KM of the pilot farm, from the NMA declarations 2024
// and 2025 (fields matched by polygon overlap, IoU >= 0.5, weighted by area; the pilot fields excluded), shrunk towards
// the national table with KAPPA_HA, and the split of each class into the crops of the application by the sown areas of
// the farm's municipality (Statistics Lithuania S9R088).
// Input:  lt-2024.parquet, lt-2025.parquet (NMA declarations via Fields of the World, CC-BY-4.0; local, never committed:
//         pipeline/local/ or LT_DECLARATIONS_2024 / LT_DECLARATIONS), inputs/transitions-national-2024-2025.csv,
//         inputs/areas.csv, src/data/farm.json, src/data/products.json
// Output: src/data/farmer-transitions.json
// Usage:  npx tsx pipeline/26_farmer_transitions.ts
import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { INPUTS, LOCAL, OUT } from './lib/ee.ts';

const RADIUS_KM = 15;
const KAPPA_HA = 300;
const IOU = 0.5;
const YEARS = [2024, 2025];

const parquet = (year: number, env: string | undefined) => {
  const candidates = [env, path.join(LOCAL, `lt-${year}.parquet`)].filter((f): f is string => !!f);
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) throw new Error(`lt-${year}.parquet not found in ${candidates.join(' or ')}`);
  return file.split(path.sep).join('/');
};
const P24 = parquet(2024, process.env.LT_DECLARATIONS_2024), P25 = parquet(2025, process.env.LT_DECLARATIONS);

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products.json'), 'utf8'));
const [w, s, e, n] = products.overlayBounds as number[];
const own = farm.fields.features.map((f: any) => `'${String(f.properties.nmaId)}'`).join(',');
const TERR = String(farm.municipality.code).padStart(2, '0');

// declaration classes (English labels of the files; "Early cereals" is a known mislabel of pulses, ankštiniai javai)
const CLASS: Record<string, string> = {
  'Winter cereals': 'winter_cereals', 'Summer cereals': 'spring_cereals', 'Oats': 'oats', 'Rape': 'rapeseed', 'Early cereals': 'pulses',
  'Sugar beet': 'sugar_beet', 'Corn': 'maize', 'Buckwheat': 'buckwheat', 'Fallow': 'fallow', 'Perennial grasses': 'perennial_grass',
  'Pastures-meadows up to 5m.': 'grass_lt5', 'Pastures-meadows over 5m.': 'grass_gt5',
};
// national table (prepared input): classes not in CLASS go to "other"
const NATIONAL_OTHER = new Set(['aromatic', 'flax', 'hemp', 'other_arable', 'vegetables']);

const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run('INSTALL spatial; LOAD spatial;');
const q = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjectsJson() as Record<string, any>[];
// the parquet files are in EPSG:3035; distances are taken between bounding-box centres
const c = (await q(`select ST_X(g) x, ST_Y(g) y from (select ST_Transform(ST_Point(${(w + e) / 2}, ${(s + n) / 2}), 'EPSG:4326', 'EPSG:3035', always_xy := true) g)`))[0];
const near = (file: string, padKm: number) => `select id::varchar id, "hcat:name_en" cls, geometry g, bbox b from '${file}'
  where "metrics:area" >= 3000 and sqrt(power((bbox.xmin+bbox.xmax)/2 - ${c.x}, 2) + power((bbox.ymin+bbox.ymax)/2 - ${c.y}, 2)) <= ${(RADIUS_KM + padKm) * 1000}`;
await con.run(`create table a as ${near(P25, 0)} and id::varchar not in (${own})`);
await con.run(`create table p as ${near(P24, 1)}`);
const rows = await q(`
  with j as (
    select a.id, a.cls c25, p.cls c24, ST_Area(a.g) a25, ST_Area(ST_Intersection(a.g, p.g)) i, ST_Area(p.g) a24
    from a join p on p.b.xmax >= a.b.xmin and p.b.xmin <= a.b.xmax and p.b.ymax >= a.b.ymin and p.b.ymin <= a.b.ymax and ST_Intersects(a.g, p.g)),
  best as (select id, c25, c24, a25, i / (a25 + a24 - i) iou, row_number() over (partition by id order by i / (a25 + a24 - i) desc) k from j)
  select c24, c25, count(*) n, sum(a25) / 1e4 ha from best where k = 1 and iou >= ${IOU} group by 1, 2`);
const total = (await q(`select count(*) n, sum(ST_Area(g)) / 1e4 ha from a`))[0];

const add = (t: Record<string, Record<string, number>>, i: string, j: string, v: number) => { (t[i] ??= {})[j] = (t[i][j] ?? 0) + v; };
const localHa: Record<string, Record<string, number>> = {};
let matchedFields = 0, matchedHa = 0;
for (const r of rows) { add(localHa, CLASS[r.c24] ?? 'other', CLASS[r.c25] ?? 'other', +r.ha); matchedFields += +r.n; matchedHa += +r.ha; }

const csv = fs.readFileSync(path.join(INPUTS, 'transitions-national-2024-2025.csv'), 'utf8').trim().split(/\r?\n/).map(l => l.split(','));
const head = csv[0].slice(1);
const nationalHa: Record<string, Record<string, number>> = {};
for (const row of csv.slice(1)) head.forEach((h, k) => add(nationalHa, NATIONAL_OTHER.has(row[0]) ? 'other' : row[0], NATIONAL_OTHER.has(h) ? 'other' : h, +row[k + 1]));

const sum = (o: Record<string, number> = {}) => Object.values(o).reduce((t, v) => t + v, 0);
const classes = [...new Set([...Object.keys(nationalHa), ...Object.keys(localHa)])].sort();
// p(j | i) = (A_local(i -> j) + KAPPA x p_national(j | i)) / (A_local(i) + KAPPA)
const p: Record<string, Record<string, number>> = {};
for (const i of classes) {
  const nat = nationalHa[i] ?? nationalHa.other, loc = localHa[i] ?? {}, A = sum(loc), N = sum(nat);
  p[i] = Object.fromEntries(classes.map(j => [j, +(((loc[j] ?? 0) + KAPPA_HA * (nat[j] ?? 0) / N) / (A + KAPPA_HA)).toFixed(5)]).filter(([, v]) => (v as number) > 0));
}

// class -> crops of the application: sown area of the municipality, mean of the last three years with values
const areas = fs.readFileSync(path.join(INPUTS, 'areas.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const sown = (stat: string) => {
  const v = areas.filter(r => r[0] === stat && r[1].padStart(2, '0') === TERR && +r[2] <= YEARS[1] && r[3] !== '').sort((x, y) => +y[2] - +x[2]).slice(0, 3);
  return { ha: v.reduce((t, r) => t + +r[3], 0) / (v.length || 1), years: v.map(r => +r[2]).sort() };
};
const SPLIT: Record<string, Record<string, string>> = {
  winter_cereals: { winter_wheat: 'winter_wheat', winter_barley: 'winter_barley', triticale: 'winter_triticale', winter_rye: 'winter_rye' },
  spring_cereals: { spring_wheat: 'spring_wheat', spring_barley: 'spring_barley' },
  oats: { oats: 'oats' }, rapeseed: { winter_rapeseed: 'winter_rape', spring_rapeseed: 'spring_rape' },
  pulses: { peas: 'peas', faba_bean: 'beans' }, sugar_beet: { sugar_beet: 'sugar_beet' },
};
const share: Record<string, Record<string, number>> = {};
let shareYears: number[] = [];
for (const [cls, m] of Object.entries(SPLIT)) {
  const v = Object.entries(m).map(([crop, stat]) => [crop, sown(stat)] as const);
  const t = v.reduce((a, [, x]) => a + x.ha, 0);
  share[cls] = Object.fromEntries(v.map(([crop, x]) => [crop, +(t ? x.ha / t : 1 / v.length).toFixed(4)]));
  shareYears = v[0][1].years;
}

const round = (t: Record<string, Record<string, number>>) => Object.fromEntries(Object.entries(t).map(([i, r]) => [i, Object.fromEntries(Object.entries(r).map(([j, v]) => [j, +v.toFixed(1)]))]));
fs.writeFileSync(path.join(OUT, 'farmer-transitions.json'), JSON.stringify({
  note: 'What farms around the pilot sow after each crop class: the statistical farmer behind "Usual practice" (docs/usual-practice.md).',
  source: 'NMA declarations 2024 and 2025 via Fields of the World (CC-BY-4.0); national table from the same declarations (research/crops/rotations); Statistics Lithuania S9R088 for the split of a class into crops',
  years: YEARS, dataUntil: `${YEARS[1]}-12-31`, radiusKm: RADIUS_KM, kappaHa: KAPPA_HA, iou: IOU, municipality: farm.municipality, shareYears,
  matched: { fields: matchedFields, ha: Math.round(matchedHa), fieldsInRadius: +total.n, haInRadius: Math.round(+total.ha), pilotFieldsExcluded: farm.fields.features.length },
  p, share, localHa: round(localHa), nationalHa: round(nationalHa),
}, null, 1));

const pct = (t: Record<string, number>) => Object.entries(t).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}`).join(', ');
console.log(`within ${RADIUS_KM} km: ${total.n} fields of 2025 (${Math.round(+total.ha)} ha); matched to 2024 with IoU >= ${IOU}: ${matchedFields} fields, ${Math.round(matchedHa)} ha`);
for (const i of Object.keys(localHa).sort((x, y) => sum(localHa[y]) - sum(localHa[x]))) console.log(`  after ${i.padEnd(16)} ${String(Math.round(sum(localHa[i]))).padStart(6)} ha local | p: ${pct(p[i])}`);
console.log(`split by municipality ${farm.municipality.name}, ${shareYears.join(', ')}:`, JSON.stringify(share));
console.log('written src/data/farmer-transitions.json');

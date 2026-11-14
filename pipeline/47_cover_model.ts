// Cover model for the planner: how bare the soil is in each half-month of the year between two harvests, by
// (harvest timing of the preceding crop) x (sowing timing of the next crop), from NASA HLS fractional cover of about
// 1 700 declared Lithuanian fields in the seasons 2024-25 and 2025-26 (the two seasons are pooled, so the spread
// includes the difference between years). For spring-sown next crops the table is split by whether the field was
// green in autumn (catch crop or dense regrowth: max NDVI 16 Sep - 31 Oct >= 0.5).
//
// It extends the cover model of the prototype round (experiment C6): the totals per
// sequence are the same numbers, and each sequence now also carries its 24 half-month bare fractions, which is what
// the soil measures need: bare fraction x share of the yearly erosivity (S1e), x share of the leaching-season water
// surplus (S5). Bare fraction = 1 - FVC, FVC = (NDVI - soil) / (full - soil) clamped to 0..1.
// Half-months without a clear view are filled as in C6: December-February keep the last autumn state (plants do not
// grow, tillage does not happen), other gaps take the mean of the neighbours.
//
// Input (local, never committed): the HLS field series and the field sample of the prototype. Set COVER_DATA to the
//   folder that holds hls/*.json and sample_fields.csv; default: pipeline/local/cover.
//   src/data/soil-climate.json (46_soil_climate.ts) for the weights of the stored quartiles.
// Output: pipeline/inputs/cover-model.json and its copy src/data/cover-model.json
// Usage: npx tsx pipeline/47_cover_model.ts
import fs from 'node:fs';
import path from 'node:path';
import { INPUTS, LOCAL, OUT, readCsv } from './lib/ee.ts';
import { quantile } from './lib/stats.ts';

const DATA = process.env.COVER_DATA ?? path.join(LOCAL, 'cover');
if (!fs.existsSync(path.join(DATA, 'hls'))) throw new Error(`HLS field series not found in ${DATA}: set COVER_DATA (see the header of this script)`);
const prevModel = JSON.parse(fs.readFileSync(path.join(INPUTS, 'cover-model.json'), 'utf8'));
const SOIL: number = prevModel.ndvi_soil, FULL: number = prevModel.ndvi_full; // end-members of experiment C4b
const clim = JSON.parse(fs.readFileSync(path.join(OUT, 'soil-climate.json'), 'utf8'));
const W: number[] = clim.erosivity.shares[clim.erosivity.base], D: number[] = clim.leaching.shares, LEACH_DAYS: number = clim.leaching.days;

const series = new Map<string, Map<string, number>>();
for (const f of fs.readdirSync(path.join(DATA, 'hls'))) for (const p of JSON.parse(fs.readFileSync(path.join(DATA, 'hls', f), 'utf8'))) {
  const m = series.get(p.id) ?? new Map<string, number>();
  for (const k of Object.keys(p)) if (k.startsWith('v_') && typeof p[k] === 'number') m.set(k.slice(2), p[k]);
  series.set(p.id, m);
}
const fields = readCsv(path.join(DATA, 'sample_fields.csv')).filter(f => series.has(f.id));
const fvc = (v: number) => Math.max(0, Math.min(1, (v - SOIL) / (FULL - SOIL)));
const per = (y: number, m: number, h: string) => `${y}${String(m).padStart(2, '0')}${h}`;

// harvest timing of the preceding crop, sowing timing of the next crop (NMA species codes and declaration classes)
const PREV_SP: Record<string, string> = { 'RAŽ': 'early', 'MIŽ': 'early', 'KVŽ': 'mid', 'KRŽ': 'mid', 'RUŽ': 'mid', 'KVV': 'mid', 'MIV': 'mid', 'AVI': 'mid', 'AVV': 'mid', 'ŽIR': 'mid', 'RAV': 'mid', 'PUP': 'late', 'KUK': 'late', 'CUR': 'late', 'GRI': 'late' };
const PREV_CLS: Record<string, string> = { 'Winter cereals': 'mid', 'Rape': 'early', 'Summer cereals': 'mid', 'Oats': 'mid', 'Early cereals': 'mid', 'Corn': 'late', 'Sugar beet': 'late', 'Buckwheat': 'late', 'Perennial grasses': 'grass', 'Pastures-meadows over 5m.': 'grass', 'Pastures-meadows up to 5m.': 'grass', 'Fallow': 'fallow' };
const NEXT_SP: Record<string, string> = { 'RAŽ': 'august', 'KVŽ': 'september', 'KRŽ': 'september', 'RUŽ': 'september', 'MIŽ': 'september', 'KVV': 'spring_early', 'MIV': 'spring_early', 'AVI': 'spring_early', 'AVV': 'spring_early', 'ŽIR': 'spring_early', 'PUP': 'spring_early', 'RAV': 'spring_early', 'KUK': 'spring_late', 'CUR': 'spring_late', 'GRI': 'spring_late' };
const NEXT_CLS: Record<string, string> = { 'Perennial grasses': 'grass', 'Pastures-meadows over 5m.': 'grass' };

const HALF = 365 / 24; // days per half-month
interface Curve { b: number[]; observed: boolean[]; season: number }
/** Bare fraction in the 24 half-months from 1 Jul (y-1) to 30 Jun (y), gaps filled. */
function curve(id: string, y: number): Curve | undefined {
  const s = series.get(id)!;
  const ps: string[] = [];
  for (let yy = y - 1, m = 7; ; m === 12 ? (yy++, m = 1) : m++) { ps.push(per(yy, m, 'a'), per(yy, m, 'b')); if (yy === y && m === 6) break; }
  const v = ps.map(p => s.get(p));
  if (v.filter(x => x !== undefined).length < 9) return undefined;
  const b: number[] = [];
  for (let i = 0; i < v.length; i++) {
    let x = v[i]; const m = +ps[i].slice(4, 6);
    if (x === undefined) {
      let a: number | undefined, c: number | undefined;
      for (let j = i - 1; j >= 0; j--) if (v[j] !== undefined) { a = v[j]; break; }
      for (let j = i + 1; j < v.length; j++) if (v[j] !== undefined) { c = v[j]; break; }
      x = m === 12 || m <= 2 ? a ?? c : a !== undefined && c !== undefined ? (a + c) / 2 : a ?? c;
    }
    if (x === undefined) return undefined;
    b.push(1 - fvc(x));
  }
  return { b, observed: v.map(x => x !== undefined), season: y };
}
const autumnGreen = (id: string, y: number) => { const s = series.get(id)!; const v = [per(y, 9, 'b'), per(y, 10, 'a'), per(y, 10, 'b')].map(p => s.get(p)).filter((x): x is number => x !== undefined); return v.length ? Math.max(...v) >= 0.5 : undefined; };

const groups = new Map<string, Curve[]>();
const add = (k: string, c: Curve) => (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
for (const f of fields) {
  const cases: [number, string | undefined, string | undefined][] = [
    [2026, PREV_SP[f.sp25] ?? PREV_SP[f.pre26] ?? PREV_CLS[f.cls25], NEXT_SP[f.sp26]],
    [2025, PREV_CLS[f.cls24], NEXT_SP[f.sp25] ?? NEXT_SP[f.pre26] ?? NEXT_CLS[f.cls25]],
  ];
  for (const [y, prev, next] of cases) {
    if (!prev || !next) continue;
    const c = curve(f.id, y); if (!c) continue;
    add(`${prev}>${next}`, c);
    if (next.startsWith('spring')) { const g = autumnGreen(f.id, y - 1); if (g !== undefined) add(`${prev}>${next}>${g ? 'green_autumn' : 'open_autumn'}`, c); }
  }
}

const month = (i: number) => ((Math.floor(i / 2) + 6) % 12) + 1;
const part = (c: Curve, keep: (m: number) => boolean) => c.b.reduce((t, x, i) => (keep(month(i)) ? t + x * 15.2 : t), 0); // 15.2 as in C6
const s1 = (c: Curve) => c.b.reduce((t, x) => t + x * HALF, 0);
const s1e = (c: Curve) => c.b.reduce((t, x, i) => t + x * W[i] * 365, 0);
const s5 = (c: Curve) => c.b.reduce((t, x, i) => t + x * D[i] * LEACH_DAYS, 0);
const q3 = (a: number[], digits = 0) => [0.25, 0.5, 0.75].map(p => +quantile(a, p).toFixed(digits));
const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;

const model: Record<string, any> = {};
let observedShare: number[] = new Array(24).fill(0), nAll = 0;
for (const [k, a] of [...groups].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (a.length < 10) continue;
  const col = (i: number) => a.map(c => c.b[i]);
  const bySeason = (y: number) => { const s = a.filter(c => c.season === y); return s.length >= 5 ? { n: s.length, s1: Math.round(mean(s.map(s1))), s1e: Math.round(mean(s.map(s1e))), s5: Math.round(mean(s.map(s5))) } : null; };
  model[k] = {
    n: a.length,
    // C6 numbers, unchanged: quartiles over fields of the bare-soil-equivalent days of the whole year and of its parts
    autumn: q3(a.map(c => part(c, m => m >= 7 && m <= 10))), winter: q3(a.map(c => part(c, m => m >= 11 || m <= 2))), spring: q3(a.map(c => part(c, m => m >= 3 && m <= 6))), total: q3(a.map(c => part(c, () => true))),
    // quartiles over fields of the erosion-weighted days and of the leaching-season days, with the farm's weights
    erosive: q3(a.map(s1e)), leaching: q3(a.map(s5)),
    // bare fraction by half-month from 1-15 July: mean over fields (what the engine sums) and quartiles (for display)
    half: { mean: Array.from({ length: 24 }, (_, i) => +mean(col(i)).toFixed(3)), p25: Array.from({ length: 24 }, (_, i) => +quantile(col(i), 0.25).toFixed(3)), p50: Array.from({ length: 24 }, (_, i) => +quantile(col(i), 0.5).toFixed(3)), p75: Array.from({ length: 24 }, (_, i) => +quantile(col(i), 0.75).toFixed(3)) },
    bySeason: { '2024-25': bySeason(2025), '2025-26': bySeason(2026) },
  };
  if (!k.includes('autumn')) { a.forEach(c => c.observed.forEach((o, i) => { if (o) observedShare[i]++; })); nAll += a.length; }
}
observedShare = observedShare.map(v => +(v / nAll).toFixed(2));

// the totals must reproduce the model the application already ships (experiment C6)
let drift = 0;
for (const [k, m] of Object.entries<any>(prevModel.model)) for (const key of ['autumn', 'winter', 'spring', 'total'] as const) for (let i = 0; i < 3; i++) if (model[k]?.[key][i] !== m[key][i]) drift++;
if (Object.keys(prevModel.model).length !== Object.keys(model).length || drift) throw new Error(`the rebuilt totals differ from the shipped cover model in ${drift} values: check the input data before overwriting`);

const out = {
  unit: 'bare-soil-equivalent days, 1 Jul - 30 Jun; [p25, median, p75] over fields. half: bare fraction (1 - FVC) in each of the 24 half-months from 1-15 July',
  ndvi_soil: SOIL, ndvi_full: FULL, seasons: ['2024-25', '2025-26'], dataUntil: '2026-06-30', halfMonths: clim.halfMonths,
  weights: { erosivity: clim.erosivity.base, note: 'the "erosive" and "leaching" quartiles use the erosivity and water-surplus shares of src/data/soil-climate.json' },
  observedShare, // share of field-seasons with a clear HLS view in each half-month
  model,
};
const txt = JSON.stringify(out, null, 1);
fs.writeFileSync(path.join(INPUTS, 'cover-model.json'), txt);
fs.writeFileSync(path.join(OUT, 'cover-model.json'), txt);

console.log(`fields ${fields.length}, sequences ${Object.keys(model).length}; totals reproduce the shipped model`);
console.log('clear view by half-month from 1 Jul:', observedShare.join(' '));
console.log('sequence'.padEnd(34), 'n'.padStart(4), ' S1 mean (median)   S1e mean (median)  S5 mean (median) | by season: S1 / S1e');
for (const [k, m] of Object.entries<any>(model)) {
  const mS1 = m.half.mean.reduce((t: number, x: number) => t + x * HALF, 0), mS1e = m.half.mean.reduce((t: number, x: number, i: number) => t + x * W[i] * 365, 0), mS5 = m.half.mean.reduce((t: number, x: number, i: number) => t + x * D[i] * LEACH_DAYS, 0);
  const bs = Object.values<any>(m.bySeason).map(s => (s ? `${s.s1}/${s.s1e} (n=${s.n})` : '—')).join('  ');
  console.log(k.padEnd(34), String(m.n).padStart(4), `${mS1.toFixed(0).padStart(5)} (${m.total[1]})`.padEnd(19), `${mS1e.toFixed(0).padStart(5)} (${m.erosive[1]})`.padEnd(19), `${mS5.toFixed(0).padStart(4)} (${m.leaching[1]})`.padEnd(16), '|', bs);
}

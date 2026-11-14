// Demo farm, modules "Climate risks" and "Economics".
// Weather: NASA POWER daily at the farm centroid 2001-2025 — IMERG precipitation (IMERG_PRECTOT, UTC days) and
// MERRA-2 temperature. Season types follow the indicators that passed the checks on Lithuanian station and yield data
// (weather sources and drought indicators).
// Economics: municipal yields (Statistics Lithuania S9R086), real prices (Eurostat apri_ap_crpouta, HICP-deflated),
// winter losses (sown vs harvested area, S9R088/S9R089) — prepared tables in pipeline/inputs.
// Output: src/data/weather.json, src/data/economics.json
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, INPUTS, OUT, readCsv, retry } from './lib/ee.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const [lon, lat] = farm.centroid;
const TERR = farm.municipality.code;

// ---------- weather ----------
fs.mkdirSync(CACHE, { recursive: true });
const pf = path.join(CACHE, 'farm_power.json');
if (!fs.existsSync(pf)) {
  const base = `https://power.larc.nasa.gov/api/temporal/daily/point?community=AG&format=JSON&start=20010101&end=20261031&longitude=${lon}&latitude=${lat}`;
  const get = (q: string) => retry(async () => { const r = await fetch(`${base}&${q}`); if (!r.ok) throw new Error('http ' + r.status); return (await r.json()).properties.parameter; }, 5, 'power');
  const a = await get('parameters=T2M_MAX,T2M_MIN,PRECTOTCORR'), b = await get('parameters=IMERG_PRECTOT&time-standard=UTC');
  fs.writeFileSync(pf, JSON.stringify({ ...a, ...b }));
}
const P = JSON.parse(fs.readFileSync(pf, 'utf8'));
const days = Object.keys(P.T2M_MIN).filter(k => P.T2M_MIN[k] > -900);
function ra(doy: number) { const phi = lat * Math.PI / 180, dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365), d = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39); const ws = Math.acos(-Math.tan(phi) * Math.tan(d)); return 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws)); }
const doy = (k: string) => Math.floor((Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) - Date.UTC(+k.slice(0, 4), 0, 1)) / 864e5) + 1;
const et0 = (k: string) => 0.0023 * 0.408 * ra(doy(k)) * ((P.T2M_MIN[k] + P.T2M_MAX[k]) / 2 + 17.8) * Math.sqrt(Math.max(0, P.T2M_MAX[k] - P.T2M_MIN[k]));
const rain = (k: string) => (P.IMERG_PRECTOT[k] > -900 ? P.IMERG_PRECTOT[k] : P.PRECTOTCORR[k] > -900 ? P.PRECTOTCORR[k] : 0);
const md = (k: string) => k.slice(4);
const years: any[] = [];
for (let y = 2001; y <= 2026; y++) {
  const d = days.filter(k => k.startsWith(String(y)));
  const sum = (a: string, b: string, f: (k: string) => number) => d.filter(k => md(k) >= a && md(k) <= b).reduce((t, k) => t + f(k), 0);
  const cnt = (a: string, b: string, f: (k: string) => boolean) => d.filter(k => md(k) >= a && md(k) <= b && f(k)).length;
  const prevDec = days.filter(k => k.startsWith(String(y - 1)) && md(k) >= '1201');
  years.push({
    year: y,
    rainMayJul: Math.round(sum('0501', '0731', rain)), et0MayJul: Math.round(sum('0501', '0731', et0)), waterBalanceMayJul: Math.round(sum('0501', '0731', k => rain(k) - et0(k))),
    waterBalanceMayJun: Math.round(sum('0501', '0630', k => rain(k) - et0(k))),
    frostDays: cnt('0425', '0610', k => P.T2M_MIN[k] <= -2), heatDays: cnt('0601', '0720', k => P.T2M_MAX[k] >= 28),
    deepColdDays: cnt('0101', '0228', k => P.T2M_MIN[k] <= -20) + prevDec.filter(k => P.T2M_MIN[k] <= -20).length,
    harvestRain: Math.round(sum('0720', '0831', rain)), harvestWetDays: cnt('0720', '0831', k => rain(k) >= 5),
    heavyRainDays: cnt('0101', '1231', k => rain(k) >= 10),
  });
}
const hist = years.filter(y => y.year <= 2025);
const rankOf = (key: string, v: number) => hist.filter(y => y[key] < v).length / (hist.length - 1);
for (const y of years) { y.waterBalanceRank = +rankOf('waterBalanceMayJul', y.waterBalanceMayJul).toFixed(2); y.harvestRainRank = +rankOf('harvestRain', y.harvestRain).toFixed(2); }
const sortedWb = [...hist].sort((a, b) => a.waterBalanceMayJul - b.waterBalanceMayJul), sortedHr = [...hist].sort((a, b) => b.harvestRain - a.harvestRain);
const nFifth = Math.round(hist.length / 5);
const dry = new Set(sortedWb.slice(0, nFifth).map(y => y.year)), wetHarvest = new Set(sortedHr.slice(0, nFifth).map(y => y.year));
for (const y of years) y.type = y.year > 2025 ? 'current' : dry.has(y.year) ? 'dry' : wetHarvest.has(y.year) ? 'wetHarvest' : 'normal';
// monthly climatology of heavy rain (erosive rain): mean days per month with >= 10 mm and >= 20 mm
const monthly = Array.from({ length: 12 }, (_, m) => {
  const mm = String(m + 1).padStart(2, '0'); const d = days.filter(k => k.slice(4, 6) === mm && +k.slice(0, 4) <= 2025);
  return { month: m + 1, rainMm: +(d.reduce((t, k) => t + rain(k), 0) / 25).toFixed(0), days10: +(d.filter(k => rain(k) >= 10).length / 25).toFixed(2), days20: +(d.filter(k => rain(k) >= 20).length / 25).toFixed(2) };
});
// Mann-Kendall trend of the May-July water balance (shown as context only; trends are not extrapolated)
const x = hist.map(y => y.waterBalanceMayJul); let sN = 0; const slopes: number[] = [];
for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) { sN += Math.sign(x[j] - x[i]); slopes.push((x[j] - x[i]) / (j - i)); }
const nn = x.length, varS = nn * (nn - 1) * (2 * nn + 5) / 18, z = sN === 0 ? 0 : (sN - Math.sign(sN)) / Math.sqrt(varS);
slopes.sort((a, b) => a - b);
const trend = { senSlopeMmPerYear: +slopes[Math.floor(slopes.length / 2)].toFixed(1), mannKendallZ: +z.toFixed(2), significant: Math.abs(z) > 1.96 };
fs.writeFileSync(path.join(OUT, 'weather.json'), JSON.stringify({
  point: [lon, lat], period: '2001-2025', years, monthly, trend, dryYears: [...dry].sort(), wetHarvestYears: [...wetHarvest].sort(),
  definitions: {
    dry: 'lowest fifth of May-July water balance (IMERG rain minus Hargreaves ET0 from POWER temperature) in 2001-2025',
    wetHarvest: 'highest fifth of IMERG rain 20 Jul - 31 Aug in 2001-2025 (a dry season takes precedence)',
    frostDays: 'days with POWER minimum temperature <= -2 °C, 25 Apr - 10 Jun', deepColdDays: 'days with POWER minimum temperature <= -20 °C, Dec-Feb',
  },
  sources: ['NASA POWER daily API (AG community): IMERG_PRECTOT (GPM IMERG), T2M_MIN, T2M_MAX (MERRA-2)'],
}));
console.log('dry years', [...dry].sort().join(','), '| wet-harvest years', [...wetHarvest].sort().join(','), '| trend', JSON.stringify(trend));
console.log(years.map(y => `${y.year}:${y.waterBalanceMayJul}/${y.frostDays}f/${y.deepColdDays}c/${y.harvestRain}`).join(' '));

// ---------- economics ----------
const STAT: Record<string, string> = { winter_wheat: 'winter_wheat', spring_wheat: 'spring_wheat', winter_barley: 'winter_barley', spring_barley: 'spring_barley', triticale: 'winter_triticale', winter_rye: 'winter_rye', oats: 'oats', winter_rapeseed: 'winter_rape', spring_rapeseed: 'spring_rape', peas: 'peas', faba_bean: 'beans', maize_grain: 'grain_maize', sugar_beet: 'sugar_beet' };
const ys = readCsv(path.join(INPUTS, 'yields.csv')), pr = readCsv(path.join(INPUTS, 'prices.csv')), ar = readCsv(path.join(INPUTS, 'areas.csv'));
// ILLUSTRATIVE variable costs, EUR/ha (seed, fertiliser, plant protection, fuel, drying). No open per-crop source exists for Lithuania;
// values sit inside the published range for winter wheat (500-800 EUR/ha).
const COST: Record<string, number> = { winter_wheat: 650, triticale: 560, winter_rye: 470, winter_barley: 600, winter_rapeseed: 720, spring_barley: 520, spring_wheat: 560, oats: 420, faba_bean: 470, peas: 460, maize_grain: 900, spring_rapeseed: 600, sugar_beet: 1900 };
const crops: Record<string, any> = {};
for (const [id, st] of Object.entries(STAT)) {
  const y: Record<string, number> = {}, yNat: Record<string, number> = {}, p: Record<string, number> = {}, loss: Record<string, number> = {};
  for (const r of ys) if (r.crop === st && r.yield_t_ha !== '' && isFinite(+r.yield_t_ha)) { if (r.territory_code.padStart(2, '0') === TERR) y[r.year] = +r.yield_t_ha; if (r.territory_code === '00') yNat[r.year] = +r.yield_t_ha; }
  for (const r of pr) if (r.crop === st && r.eur_t_real !== '') p[r.year] = +(+r.eur_t_real).toFixed(1);
  for (const r of ar) if (r.crop === st && r.territory_code.padStart(2, '0') === TERR && r.loss_share !== '') loss[r.year] = +(+r.loss_share).toFixed(4);
  crops[id] = { statCrop: st, yieldTHa: y, yieldNationalTHa: yNat, priceEurT: p, sownAreaLost: loss, costEurHa: COST[id] ?? null };
  const last5 = [2021, 2022, 2023, 2024, 2025].map(k => y[k]).filter(v => v !== undefined);
  console.log(id.padEnd(16), 'yield years', Object.keys(y).length, 'last5 mean', (last5.reduce((t, v) => t + v, 0) / last5.length).toFixed(2), 'price years', Object.keys(p).length, 'last price', p['2024']);
}
fs.writeFileSync(path.join(OUT, 'economics.json'), JSON.stringify({
  municipality: farm.municipality, priceBaseYear: 2024, crops,
  costNote: 'Variable costs are illustrative and editable; there is no open per-crop cost source for Lithuania.',
  sources: ['Statistics Lithuania, table S9R086 (municipal crop yields), S9R088/S9R089 (sown and harvested area)', 'Eurostat apri_ap_crpouta (prices), prc_hicp_aind (deflator)'],
}));
console.log('done');

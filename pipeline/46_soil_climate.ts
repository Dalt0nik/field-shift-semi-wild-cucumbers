// Soil-protection climate of the farm: when in the year rain is erosive, when water drains through the soil, and
// which harvest windows are typically wet. Years 2001-2025, one grid cell for the whole farm.
//
//  erosivity  share of the yearly rainfall erosivity in each of the 24 half-months. Only shares are used, never the
//             erosivity itself. Two methods:
//    storms   (base, when the half-hourly download of 44_imerg_halfhourly.ts is in the cache) NASA GPM IMERG V07
//             half-hourly rain. Storms are separated by 6 h with less than 1.27 mm; a storm is erosive from 12.7 mm;
//             EI30 = storm energy x maximum 30-minute intensity, unit energy e = 0.29 (1 - 0.72 exp(-0.05 i)) MJ/ha
//             per mm at intensity i in mm/h (the RUSLE definitions: Renard et al. 1997, energy equation of Brown &
//             Foster 1987). Half-hours that IMERG marks as probably frozen (probabilityLiquidPrecipitation < 50 %)
//             are not rain. Variants for the sensitivity check: frozen precipitation kept, and the shares smoothed
//             over three half-months (the shares rest on some 260 storms, so single storms show).
//    daily    NASA POWER daily IMERG rain (IMERG_PRECTOT): EI_d = a x P_d^b on days with P_d >= 12.7 mm, else 0
//             (daily-rainfall erosivity model of Richardson, Foster & Wright 1983, exponent 1.81). Variants for the
//             sensitivity check: b = 1.5, b = 2.0, and a warm-season (April-September) coefficient twice the
//             cool-season one. Richardson et al. fitted a seasonal coefficient for US sites; its values are not
//             transferable, so "twice" is our own test, not a sourced number.
//  leaching   share of the leaching-season (1 Sep - 28 Feb) water surplus in each of its 12 half-months:
//             median over the seasons of max(0, rain - ET0) summed over the half-month (Hargreaves ET0, as in 40_).
//  harvest    per crop of the regional package with a harvest window: rain - ET0 summed over the window, by year;
//             the window is "typically wet" when the median over the years is above zero.
// Half-months are 1-15 and 16-end of each month; index 0 = 1-15 July ... 23 = 16-30 June (the cover-model year).
// Input: pipeline/cache/farm_power.json, pipeline/cache/farm_imerg_30min.json (optional)
// Output: src/data/soil-climate.json
// Usage: npx tsx pipeline/46_soil_climate.ts
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, OUT } from './lib/ee.ts';
import { quantile } from './lib/stats.ts';
import { CROPS } from '../src/pilot/regional.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const lat = farm.centroid[1];
const P = JSON.parse(fs.readFileSync(path.join(CACHE, 'farm_power.json'), 'utf8'));
const Y0 = 2001, Y1 = 2025;
const days = Object.keys(P.T2M_MIN).filter(k => P.T2M_MIN[k] > -900 && +k.slice(0, 4) >= Y0 && +k.slice(0, 4) <= Y1);
const years = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const rain = (k: string) => (P.IMERG_PRECTOT[k] > -900 ? P.IMERG_PRECTOT[k] : P.PRECTOTCORR[k] > -900 ? P.PRECTOTCORR[k] : 0);
function ra(doy: number) { const phi = lat * Math.PI / 180, dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365), d = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39); const ws = Math.acos(-Math.tan(phi) * Math.tan(d)); return 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws)); }
const doy = (k: string) => Math.floor((Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) - Date.UTC(+k.slice(0, 4), 0, 1)) / 864e5) + 1;
const et0 = (k: string) => 0.0023 * 0.408 * ra(doy(k)) * ((P.T2M_MIN[k] + P.T2M_MAX[k]) / 2 + 17.8) * Math.sqrt(Math.max(0, P.T2M_MAX[k] - P.T2M_MIN[k]));

/** Half-month index in the cover-model year: 0 = 1-15 Jul ... 23 = 16-30 Jun. */
const halfOf = (month: number, day: number) => ((month + 5) % 12) * 2 + (day <= 15 ? 0 : 1);
const half = (k: string) => halfOf(+k.slice(4, 6), +k.slice(6, 8));
const HALF_LABELS = Array.from({ length: 24 }, (_, i) => `${String(((Math.floor(i / 2) + 6) % 12) + 1).padStart(2, '0')}${i % 2 ? 'b' : 'a'}`);
const r4 = (v: number) => +v.toFixed(4);
const norm = (s: number[]) => { const t = s.reduce((a, v) => a + v, 0); return s.map(v => r4(v / t)); };

// ---------- erosivity shares, daily method ----------
const THRESHOLD = 12.7; // mm, erosive-storm threshold of the USLE
const warm = (k: string) => { const m = +k.slice(4, 6); return m >= 4 && m <= 9; };
function dailyShares(b: number, warmFactor = 1): number[] {
  const s = new Array(24).fill(0);
  for (const k of days) { const p = rain(k); if (p >= THRESHOLD) s[half(k)] += (warm(k) ? warmFactor : 1) * p ** b; }
  return norm(s);
}
const shares: Record<string, number[]> = { daily: dailyShares(1.81), dailyB15: dailyShares(1.5), dailyB20: dailyShares(2.0), dailyWarm2: dailyShares(1.81, 2) };
const erosiveDays = days.filter(k => rain(k) >= THRESHOLD).length / years.length;

// ---------- erosivity shares, storm method (EI30 from half-hourly IMERG) ----------
const f30 = path.join(CACHE, 'farm_imerg_30min.json');
let storms: any = null;
if (fs.existsSync(f30)) {
  const raw: Record<string, [number, number, number][]> = JSON.parse(fs.readFileSync(f30, 'utf8'));
  const run = (snowFilter: boolean) => {
    const s = new Array(24).fill(0), byYear = new Map<number, number>(), eis: number[] = []; let n = 0, frozenMm = 0, allMm = 0;
    const byYearJJA = new Map<number, number>();
    for (const y of years) {
      // dense series of the year in half-hours: depth in mm, and the calendar position of each half-hour
      const t0 = Date.UTC(y, 0, 1), nH = Math.round((Date.UTC(y + 1, 0, 1) - t0) / 18e5);
      const depth = new Float32Array(nH);
      for (let m = 1; m <= 12; m++) {
        const off = Math.round((Date.UTC(y, m - 1, 1) - t0) / 18e5);
        for (const [min, mmh, liquid] of raw[`${y}${String(m).padStart(2, '0')}`] ?? []) {
          const frozen = liquid >= 0 && liquid < 50; allMm += mmh / 2; if (frozen) frozenMm += mmh / 2;
          if (!(snowFilter && frozen)) depth[off + Math.round(min / 30)] = mmh / 2;
        }
      }
      // storms: a storm ends when the next 6 hours bring less than 1.27 mm
      let i = 0;
      while (i < nH) {
        if (depth[i] <= 0) { i++; continue; }
        let end = i, j = i;
        for (;;) {
          let next = 0; for (let k = j + 1; k <= j + 12 && k < nH; k++) next += depth[k];
          if (next < 1.27) { end = j; break; }
          j++; while (j < nH && depth[j] <= 0) j++; // move to the next wet half-hour inside the storm
          if (j >= nH) { end = nH - 1; break; }
        }
        let total = 0, energy = 0, i30 = 0, peak = i;
        for (let k = i; k <= end; k++) { const d = depth[k]; if (d <= 0) continue; const inten = d * 2; total += d; energy += 0.29 * (1 - 0.72 * Math.exp(-0.05 * inten)) * d; if (inten > i30) { i30 = inten; peak = k; } }
        if (total >= THRESHOLD) {
          const date = new Date(t0 + peak * 18e5), ei = energy * i30;
          s[halfOf(date.getUTCMonth() + 1, date.getUTCDate())] += ei; n++; eis.push(ei);
          byYear.set(y, (byYear.get(y) ?? 0) + ei);
          if (date.getUTCMonth() >= 5 && date.getUTCMonth() <= 7) byYearJJA.set(y, (byYearJJA.get(y) ?? 0) + ei);
        }
        i = end + 1;
      }
    }
    const R = [...byYear.values()];
    eis.sort((a, b) => b - a);
    return { shares: norm(s), storms: n, top15Share: r4(eis.slice(0, 15).reduce((a, v) => a + v, 0) / eis.reduce((a, v) => a + v, 0)), stormsPerYear: +(n / years.length).toFixed(1), meanAnnualEI30: Math.round(R.reduce((a, v) => a + v, 0) / years.length), frozenShareOfPrecipitation: r4(frozenMm / allMm),
      junToAugByYear: years.map(y => (byYear.get(y) ? (byYearJJA.get(y) ?? 0) / byYear.get(y)! : NaN)).filter(v => isFinite(v)) };
  };
  const base = run(true), withSnow = run(false);
  shares.storms = base.shares; shares.stormsWithSnow = withSnow.shares;
  // the same shares smoothed over three half-months: single storms weigh less
  shares.stormsSmoothed = norm(base.shares.map((_, i) => (base.shares[(i + 23) % 24] + base.shares[i] + base.shares[(i + 1) % 24]) / 3));
  storms = { storms: base.storms, top15Share: base.top15Share, stormsPerYear: base.stormsPerYear, meanAnnualEI30: base.meanAnnualEI30, frozenShareOfPrecipitation: base.frozenShareOfPrecipitation,
    junToAugShareByYear: { p10: r4(quantile(base.junToAugByYear, 0.1)), median: r4(quantile(base.junToAugByYear, 0.5)), p90: r4(quantile(base.junToAugByYear, 0.9)) } };
}
const BASE = shares.storms ? 'storms' : 'daily';
const byMonth = (w: number[]) => Array.from({ length: 12 }, (_, m) => { const i = ((m + 6) % 12) * 2; return r4(w[i] + w[i + 1]); }); // Jan..Dec
const summary = (w: number[]) => { const m = byMonth(w); return { mayToSep: r4(m.slice(4, 9).reduce((a, v) => a + v, 0)), junToAug: r4(m[5] + m[6] + m[7]), decToFeb: r4(m[11] + m[0] + m[1]), summerToWinter: +((m[5] + m[6] + m[7]) / (m[11] + m[0] + m[1])).toFixed(1), blindHalfMonths: r4(w[9] + w[10] + w[11] + w[12] + w[13]) }; };

// ---------- leaching-season surplus shares ----------
const LEACH = Array.from({ length: 12 }, (_, i) => 4 + i); // half-month indices 4 (1-15 Sep) .. 15 (16-28 Feb)
const surplus: number[][] = LEACH.map(() => []);
for (const y of years.slice(0, -1)) { // season y/y+1 needs both years
  const s = new Array(24).fill(0);
  for (const k of days) { const ky = +k.slice(0, 4), m = +k.slice(4, 6); if ((ky === y && m >= 9) || (ky === y + 1 && m <= 2)) s[half(k)] += rain(k) - et0(k); }
  LEACH.forEach((h, i) => surplus[i].push(Math.max(0, s[h])));
}
const med = surplus.map(a => quantile(a, 0.5)), medSum = med.reduce((a, v) => a + v, 0);
const leaching = new Array(24).fill(0); LEACH.forEach((h, i) => (leaching[h] = r4(med[i] / medSum)));
const leachingDays = 181; // 1 Sep - 28 Feb

// ---------- harvest windows ----------
const harvest: Record<string, any> = {};
for (const c of Object.values(CROPS)) {
  if (!c.harvest.from || !c.harvest.to) continue;
  const a = c.harvest.from.replace('-', ''), b = c.harvest.to.replace('-', '');
  const inWin = (y: number) => days.filter(k => +k.slice(0, 4) === y && k.slice(4) >= a && k.slice(4) <= b);
  const bal = years.map(y => inWin(y).reduce((t, k) => t + rain(k) - et0(k), 0)), rainMm = years.map(y => inWin(y).reduce((t, k) => t + rain(k), 0));
  harvest[c.id] = { from: c.harvest.from, to: c.harvest.to, windowStatus: c.harvest.status, medianBalanceMm: Math.round(quantile(bal, 0.5)), wetYearsShare: +(bal.filter(v => v > 0).length / bal.length).toFixed(2), medianRainMm: Math.round(quantile(rainMm, 0.5)), typicallyWet: quantile(bal, 0.5) > 0 };
}

fs.writeFileSync(path.join(OUT, 'soil-climate.json'), JSON.stringify({
  point: farm.centroid, period: `${Y0}-${Y1}`, dataUntil: `${Y1}-12-31`, halfMonths: HALF_LABELS,
  erosivity: {
    method: 'Share of the yearly rainfall erosivity per half-month, 2001-2025. "storms": EI30 of erosive storms (12.7 mm or more) from NASA GPM IMERG V07 half-hourly rain, frozen precipitation left out. "daily": a x P^1.81 on days with at least 12.7 mm (IMERG daily rain via NASA POWER). The other entries are sensitivity variants.',
    thresholdMm: THRESHOLD, base: BASE, shares, byMonth: byMonth(shares[BASE]), summary: Object.fromEntries(Object.entries(shares).map(([k, w]) => [k, summary(w)])),
    erosiveDaysPerYear: +erosiveDays.toFixed(1), storms,
  },
  leaching: {
    method: 'Share of the water surplus of 1 Sep - 28 Feb per half-month: median over the seasons 2001/02-2024/25 of max(0, IMERG rain - Hargreaves ET0 from POWER temperature).',
    days: leachingDays, shares: leaching, medianSurplusMm: LEACH.map((h, i) => ({ halfMonth: HALF_LABELS[h], mm: Math.round(med[i]) })), seasonSurplusMm: Math.round(medSum),
  },
  harvest: { method: 'IMERG rain minus Hargreaves ET0 summed over the harvest window of the crop reference, by year 2001-2025; typically wet = median above zero.', crops: harvest },
  sources: ['NASA GPM IMERG V07 half-hourly (Earth Engine NASA/GPM_L3/IMERG_V07): precipitation, probabilityLiquidPrecipitation', 'NASA POWER daily API (AG community): IMERG_PRECTOT (NASA GPM IMERG), T2M_MIN, T2M_MAX (MERRA-2)'],
}, null, 1));

const show = (w: number[]) => byMonth(w).map(v => String(Math.round(v * 100)).padStart(4)).join('');
console.log('base:', BASE, '| erosive days (>= 12.7 mm) per year:', erosiveDays.toFixed(1), storms ? `| erosive storms per year ${storms.stormsPerYear}, mean annual EI30 ${storms.meanAnnualEI30} MJ mm/(ha h), frozen share of precipitation ${storms.frozenShareOfPrecipitation}` : '');
console.log('erosivity share by month, %  Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec');
for (const [k, w] of Object.entries(shares)) console.log(k.padEnd(16), '          ', show(w), JSON.stringify(summary(w)));
if (storms) console.log('Jun-Aug share of a year\'s EI30: p10', storms.junToAugShareByYear.p10, 'median', storms.junToAugShareByYear.median, 'p90', storms.junToAugShareByYear.p90);
console.log('leaching surplus by half-month, mm:', LEACH.map((h, i) => `${HALF_LABELS[h]} ${Math.round(med[i])}`).join(' | '), '| season', Math.round(medSum));
for (const [id, h] of Object.entries(harvest)) console.log(id.padEnd(16), h.from, h.to, 'median balance', String(h.medianBalanceMm).padStart(5), 'mm; wet in', h.wetYearsShare, 'of years; rain', h.medianRainMm, h.typicallyWet ? 'WET' : '');

// "Vulnerable seasons" calendar: for each month, the share of years 2001-2025 in which a weather hazard occurred
// at the farm. Same sources as the season typing of stage 6 (40_weather_economics.ts): NASA POWER daily API —
// IMERG precipitation and MERRA-2 temperature. Thresholds are working values, not agreed with an agronomist.
// Input: pipeline/cache/farm_power.json   Output: src/data/hazards.json
// Usage: npx tsx pipeline/45_hazards.ts
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, OUT } from './lib/ee.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const lat = farm.centroid[1];
const P = JSON.parse(fs.readFileSync(path.join(CACHE, 'farm_power.json'), 'utf8'));
const days = Object.keys(P.T2M_MIN).filter(k => P.T2M_MIN[k] > -900 && +k.slice(0, 4) >= 2001 && +k.slice(0, 4) <= 2025);
const rain = (k: string) => (P.IMERG_PRECTOT[k] > -900 ? P.IMERG_PRECTOT[k] : P.PRECTOTCORR[k] > -900 ? P.PRECTOTCORR[k] : 0);
function ra(doy: number) { const phi = lat * Math.PI / 180, dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365), d = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39); const ws = Math.acos(-Math.tan(phi) * Math.tan(d)); return 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws)); }
const doy = (k: string) => Math.floor((Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) - Date.UTC(+k.slice(0, 4), 0, 1)) / 864e5) + 1;
const et0 = (k: string) => 0.0023 * 0.408 * ra(doy(k)) * ((P.T2M_MIN[k] + P.T2M_MAX[k]) / 2 + 17.8) * Math.sqrt(Math.max(0, P.T2M_MAX[k] - P.T2M_MIN[k]));

const years = [...new Set(days.map(k => +k.slice(0, 4)))].sort();
const byYm = new Map<string, string[]>();
for (const k of days) { const key = k.slice(0, 6); (byYm.get(key) ?? byYm.set(key, []).get(key)!).push(k); }
const monthDays = (y: number, m: number) => byYm.get(`${y}${String(m).padStart(2, '0')}`) ?? [];

// monthly water balance (rain - ET0) per year, to find the driest fifth of each month
const balance = (y: number, m: number) => monthDays(y, m).reduce((t, k) => t + rain(k) - et0(k), 0);
const dryCut: number[] = [];
for (let m = 1; m <= 12; m++) { const v = years.map(y => balance(y, m)).sort((a, b) => a - b); dryCut[m] = v[Math.floor(v.length / 5)]; }

interface Hazard { id: string; label: string; source: string; definition: string; months: number[]; test: (y: number, m: number) => boolean }
const any = (y: number, m: number, f: (k: string) => boolean) => monthDays(y, m).some(f);
const count = (y: number, m: number, f: (k: string) => boolean) => monthDays(y, m).filter(f).length;
const HAZARDS: Hazard[] = [
  { id: 'frost', label: 'Frost in the growing season (Tmin ≤ −2 °C)', source: 'NASA POWER (MERRA-2)', definition: 'at least one day with minimum temperature ≤ −2 °C; shown for April–October', months: [4, 5, 6, 7, 8, 9, 10], test: (y, m) => any(y, m, k => P.T2M_MIN[k] <= -2) },
  { id: 'deepCold', label: 'Deep cold (Tmin ≤ −20 °C)', source: 'NASA POWER (MERRA-2)', definition: 'at least one day with minimum temperature ≤ −20 °C: winterkill risk for winter crops without snow', months: [11, 12, 1, 2, 3], test: (y, m) => any(y, m, k => P.T2M_MIN[k] <= -20) },
  { id: 'heat', label: 'Heat (Tmax ≥ 30 °C, 3+ days)', source: 'NASA POWER (MERRA-2)', definition: 'three or more days with maximum temperature ≥ 30 °C', months: [5, 6, 7, 8, 9], test: (y, m) => count(y, m, k => P.T2M_MAX[k] >= 30) >= 3 },
  { id: 'dry', label: 'Dry month (rain − evaporative demand, lowest fifth)', source: 'GPM IMERG + POWER', definition: 'monthly rain minus Hargreaves ET0 in the lowest fifth of that month over 2001–2025 and below −40 mm', months: [4, 5, 6, 7, 8, 9], test: (y, m) => balance(y, m) <= dryCut[m] && balance(y, m) < -40 },
  { id: 'heavyRain', label: 'Heavy rain (≥ 20 mm in a day)', source: 'GPM IMERG', definition: 'at least one day with 20 mm of rain or more', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], test: (y, m) => any(y, m, k => rain(k) >= 20) },
  { id: 'wetSpell', label: 'Wet spell (≥ 10 rain days of 1 mm+)', source: 'GPM IMERG', definition: 'ten or more days with at least 1 mm of rain: field work and harvest are delayed', months: [3, 4, 5, 7, 8, 9, 10], test: (y, m) => count(y, m, k => rain(k) >= 1) >= 10 },
];
const out = HAZARDS.map(h => ({
  id: h.id, label: h.label, source: h.source, definition: h.definition,
  byMonth: Array.from({ length: 12 }, (_, i) => (h.months.includes(i + 1) ? +(years.filter(y => h.test(y, i + 1)).length / years.length).toFixed(2) : null)),
}));
fs.writeFileSync(path.join(OUT, 'hazards.json'), JSON.stringify({
  period: `${years[0]}-${years[years.length - 1]}`, years: years.length, point: farm.centroid,
  note: 'Share of years with the event in that month. Weather comes from one grid cell (about 10 km for IMERG, 50 km for MERRA-2): the same value for every field of the farm. Thresholds are working values to be set with an agronomist.',
  hazards: out, sources: ['NASA POWER daily API (AG community): IMERG_PRECTOT (GPM IMERG), T2M_MIN, T2M_MAX (MERRA-2)'],
}));
for (const h of out) console.log(h.id.padEnd(10), h.byMonth.map(v => (v === null ? '  . ' : String(Math.round(v * 100)).padStart(3) + '%')).join(' '));

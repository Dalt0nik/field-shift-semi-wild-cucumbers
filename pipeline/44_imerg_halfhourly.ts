// NASA GPM IMERG V07 half-hourly rain at the farm, 2001-2025, for the storm-based rainfall erosivity (EI30) of
// 46_soil_climate.ts: the daily IMERG total of NASA POWER cannot tell a long drizzle from a short downpour.
// One cell of 0.1 degree (about 11 x 7 km) covers the whole farm. Downloaded month by month and cached.
// Output: pipeline/cache/farm_imerg_30min.json  { "YYYYMM": [[minutes since the start of the month, mm/h, probability of liquid phase %], ...] }
//         (only half-hours with rain are kept)
// Usage: npx tsx pipeline/44_imerg_halfhourly.ts
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, OUT, ee, evaluate, initEE, pool, retry } from './lib/ee.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const file = path.join(CACHE, 'farm_imerg_30min.json');
const cache: Record<string, [number, number, number][]> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
await initEE();
const pt = ee.Geometry.Point(farm.centroid);
const col = ee.ImageCollection('NASA/GPM_L3/IMERG_V07').select(['precipitation', 'probabilityLiquidPrecipitation']);
const months: [number, number][] = [];
for (let y = 2001; y <= 2025; y++) for (let m = 1; m <= 12; m++) if (!cache[`${y}${String(m).padStart(2, '0')}`]) months.push([y, m]);
console.log('months to download', months.length);
let done = 0;
await pool(months, 6, async ([y, m]) => {
  const a = `${y}-${String(m).padStart(2, '0')}-01`, b = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const t0 = Date.UTC(y, m - 1, 1);
  const rows: any[][] = await retry(() => evaluate(col.filterDate(a, b).getRegion(pt, 11132)), 5, `imerg ${a}`);
  const head = rows[0], it = head.indexOf('time'), ip = head.indexOf('precipitation'), il = head.indexOf('probabilityLiquidPrecipitation');
  const expected = Math.round((Date.parse(b) - Date.parse(a)) / 18e5);
  if (rows.length - 1 < expected * 0.98) console.warn(`${a}: ${rows.length - 1} of ${expected} half-hours`);
  cache[`${y}${String(m).padStart(2, '0')}`] = rows.slice(1).filter(r => r[ip] > 0).map(r => [Math.round((r[it] - t0) / 6e4), +(+r[ip]).toFixed(3), r[il] == null ? -1 : Math.round(r[il])] as [number, number, number]).sort((p, q) => p[0] - q[0]);
  if (++done % 12 === 0) { fs.writeFileSync(file, JSON.stringify(cache)); console.log('done', done, 'of', months.length); }
});
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(file, JSON.stringify(cache));
console.log('written', file, Object.keys(cache).length, 'months');

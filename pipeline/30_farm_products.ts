// Demo farm, data products from Earth Engine:
//  - NASA HLS (L30 + S30) half-month NDVI per field, 2016-2026 -> soil-cover history, bare-soil calendar, autumn-2026 state
//  - NASADEM terrain per field: elevation, median slope, relative height (cold-air pooling and wet spots)
//  - map overlays (PNG): HLS true colour of autumn 2026, NASADEM slope, how often a pixel is bare in early spring
// Output: src/data/products.json, public/overlays/*.png
// Usage: npx tsx pipeline/30_farm_products.ts
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, INPUTS, OUT, ROOT, ee, evaluate, initEE, pool, retry } from './lib/ee.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const cover = JSON.parse(fs.readFileSync(path.join(INPUTS, 'cover-model.json'), 'utf8'));
const SOIL: number = cover.ndvi_soil, FULL: number = cover.ndvi_full;
const fvc = (v: number) => Math.max(0, Math.min(1, (v - SOIL) / (FULL - SOIL)));
await initEE();

const fields = farm.fields.features;
const fc = ee.FeatureCollection(fields.map((f: any) => ee.Feature(ee.Geometry(f.geometry).buffer(-15), { id: f.properties.id })));
const periods = (year: number) => { const o: [string, string, string][] = []; for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`; o.push([`${year}${mm}a`, `${year}-${mm}-01`, `${year}-${mm}-16`], [`${year}${mm}b`, `${year}-${mm}-16`, next]); } return o; };
const L = ee.ImageCollection('NASA/HLS/HLSL30/v002').select(['B2', 'B3', 'B4', 'B5', 'Fmask'], ['blue', 'green', 'red', 'nir', 'fm']);
const S = ee.ImageCollection('NASA/HLS/HLSS30/v002').select(['B2', 'B3', 'B4', 'B8A', 'Fmask'], ['blue', 'green', 'red', 'nir', 'fm']);
const good = (img: any) => { const fm = img.select('fm'); const bit = (b: number) => fm.bitwiseAnd(1 << b).neq(0); return bit(1).or(bit(2)).or(bit(3)).or(bit(4)).not(); };
const prep = (img: any) => img.normalizedDifference(['nir', 'red']).updateMask(good(img)).rename('ndvi').addBands(good(img).unmask(0).rename('ok')).toFloat().copyProperties(img, ['system:time_start']);
const dummy = ee.Image.constant(0).rename('ndvi').updateMask(0).addBands(ee.Image.constant(0).rename('ok')).toFloat();
const region = ee.Geometry.Rectangle(farm.bbox).buffer(400).bounds();

// ---- HLS series per field
const cacheFile = path.join(CACHE, 'farm_hls.json');
let series: Record<string, Record<string, number>> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
if (!Object.keys(series).length) {
  const years = Array.from({ length: 11 }, (_, i) => 2016 + i);
  await pool(years, 4, async y => {
    const col = L.merge(S).filterBounds(region).filterDate(`${y}-01-01`, `${y + 1}-01-01`).map(prep);
    const img = ee.Image.cat(periods(y).map(([name, a, b]) => { const sub = ee.ImageCollection(col.filterDate(a, b).merge(ee.ImageCollection([dummy]))); return sub.select('ndvi').median().rename(`v_${name}`).addBands(sub.select('ok').sum().rename(`n_${name}`)); }));
    const res: any = await retry(() => evaluate(img.reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: 30 }).map((f: any) => f.setGeometry(null))), 4, 'hls ' + y);
    for (const f of res.features) { const p = f.properties; const s = (series[p.id] ??= {}); for (const k of Object.keys(p)) if (k.startsWith('v_') && typeof p[k] === 'number') s[k.slice(2)] = +p[k].toFixed(3); }
    console.log('hls', y);
  });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(series));
}

// ---- terrain per field (NASADEM)
const dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation');
const slope = ee.Terrain.slope(dem).multiply(Math.PI / 180).tan().multiply(100).rename('slope');
const tpi = dem.subtract(dem.focalMean({ radius: 500, units: 'meters' })).rename('tpi500');
const terr: any = await retry(() => evaluate(dem.rename('elev').addBands(slope).addBands(tpi).reduceRegions({ collection: fc, reducer: ee.Reducer.median(), scale: 30 }).map((f: any) => f.setGeometry(null))), 3, 'terrain');
const terrain = new Map<string, any>(terr.features.map((f: any) => [f.properties.id, f.properties]));

// ---- per-field derived products
const per = (y: number, m: number, h: string) => `${y}${String(m).padStart(2, '0')}${h}`;
const products: Record<string, any> = {};
for (const f of fields) {
  const id = f.properties.id; const s = series[id] ?? {};
  // bare-soil-equivalent days by season (1 Jul .. 30 Jun)
  const seasons: any[] = [];
  for (let y = 2017; y <= 2026; y++) {
    const ps: string[] = []; for (let yy = y - 1, m = 7; ; m === 12 ? (yy++, m = 1) : m++) { ps.push(per(yy, m, 'a'), per(yy, m, 'b')); if (yy === y && m === 6) break; }
    const v = ps.map(p => s[p]); const known = v.filter(x => x !== undefined).length;
    if (known < 9) { seasons.push({ season: `${y - 1}/${String(y).slice(2)}`, known }); continue; }
    const r = { autumn: 0, winter: 0, spring: 0 };
    v.forEach((x, i) => { const m = +ps[i].slice(4, 6); if (x === undefined) { let a, b; for (let j = i - 1; j >= 0; j--) if (v[j] !== undefined) { a = v[j]; break; } for (let j = i + 1; j < v.length; j++) if (v[j] !== undefined) { b = v[j]; break; } x = m === 12 || m <= 2 ? a ?? b : a !== undefined && b !== undefined ? (a + b) / 2 : a ?? b; } if (x === undefined) return; const d = (1 - fvc(x)) * 15.2; if (m >= 11 || m <= 2) r.winter += d; else if (m >= 7) r.autumn += d; else r.spring += d; });
    seasons.push({ season: `${y - 1}/${String(y).slice(2)}`, known, autumn: Math.round(r.autumn), winter: Math.round(r.winter), spring: Math.round(r.spring), total: Math.round(r.autumn + r.winter + r.spring) });
  }
  // calendar: for each half-month, in what share of observed years the field was mostly bare (cover < 30 %)
  const calendar: any[] = [];
  for (let m = 1; m <= 12; m++) for (const h of ['a', 'b']) {
    const v: number[] = []; for (let y = 2016; y <= 2026; y++) { const x = s[per(y, m, h)]; if (x !== undefined) v.push(x); }
    calendar.push({ halfMonth: `${String(m).padStart(2, '0')}${h}`, yearsObserved: v.length, bareShare: v.length >= 3 ? +(v.filter(x => fvc(x) < 0.3).length / v.length).toFixed(2) : null, ndviMedian: v.length ? +[...v].sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(2) : null });
  }
  // autumn 2026 state: (seedbed dip < 0.30 in 16 Aug-15 Oct, then a rise of >= 0.08)
  const dip = [per(2026, 8, 'b'), per(2026, 9, 'a'), per(2026, 9, 'b'), per(2026, 10, 'a')].map(p => s[p]).filter(x => x !== undefined) as number[];
  const late = [per(2026, 10, 'b'), per(2026, 11, 'a'), per(2026, 11, 'b')].map(p => s[p]).filter(x => x !== undefined) as number[];
  const autumn2026 = { minNdviAugOct: dip.length ? Math.min(...dip) : null, lateNdvi: late.length ? Math.max(...late) : null,
    winterCropSuggested: dip.length && late.length ? Math.min(...dip) < 0.30 && Math.max(...late) - Math.min(...dip) >= 0.08 : null, accuracyNote: 'Right for 72-75 % of fields in the test on 1 338-1 380 declared fields (2024, 2025). Confirm on the field.' };
  const recent: Record<string, number> = {}; for (const k of Object.keys(s)) if (k >= '202301a') recent[k] = s[k];
  const t = terrain.get(id) ?? {};
  products[id] = { ndvi: recent, seasons, calendar, autumn2026, terrain: { elevationM: t.elev != null ? +t.elev.toFixed(1) : null, slopePct: t.slope != null ? +t.slope.toFixed(1) : null, relHeight500m: t.tpi500 != null ? +t.tpi500.toFixed(1) : null } };
  console.log(id, 'slope', products[id].terrain.slopePct, 'relH', products[id].terrain.relHeight500m, 'autumn26', autumn2026.minNdviAugOct, '->', autumn2026.lateNdvi, autumn2026.winterCropSuggested, '| last seasons', seasons.slice(-3).map(x => x.total).join(','));
}

// ---- map overlays
const ovDir = path.join(ROOT, 'public', 'overlays');
fs.mkdirSync(ovDir, { recursive: true });
const [w, s0, e, n] = farm.bbox; const pad = 0.006;
const box = [w - pad * 1.6, s0 - pad, e + pad * 1.6, n + pad];
const rect = ee.Geometry.Rectangle(box);
const mask = (img: any) => img.updateMask(good(img));
const hls26 = L.merge(S).filterBounds(rect).filterDate('2026-08-20', '2026-10-25').map(mask).median();
const springBare = ee.ImageCollection(Array.from({ length: 10 }, (_, i) => 2017 + i).map(y =>
  L.merge(S).filterBounds(rect).filterDate(`${y}-03-16`, `${y}-04-16`).map(prep).select('ndvi').median().lt(SOIL + 0.3 * (FULL - SOIL)).rename('bare'))).mean();
const overlays: [string, any, any][] = [
  ['hls_truecolor_autumn2026', hls26.select(['red', 'green', 'blue']), { min: 0.01, max: 0.16, gamma: 1.3 }],
  ['nasadem_slope', slope, { min: 0, max: 15, palette: ['#f7fbff', '#c6dbef', '#6baed6', '#fdae6b', '#e6550d', '#7f2704'] }],
  ['hls_spring_bare_frequency', springBare, { min: 0, max: 1, palette: ['#1a7d3a', '#a6d96a', '#ffffbf', '#fdae61', '#a6611a'] }],
];
for (const [name, img, vis] of overlays) {
  const url: string = await new Promise((res, rej) => img.visualize(vis).getThumbURL({ region: rect, dimensions: 1400, format: 'png', crs: 'EPSG:4326' }, (u: string, err: any) => (err ? rej(new Error(String(err))) : res(u))));
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(ovDir, `${name}.png`), buf);
  console.log('overlay', name, buf.length);
}
fs.writeFileSync(path.join(OUT, 'products.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), fvc: { ndviSoil: SOIL, ndviFull: FULL }, overlayBounds: box, fields: products,
  sources: ['NASA HLS L30 + S30 v002 (Earth Engine NASA/HLS/HLSL30/v002, NASA/HLS/HLSS30/v002)', 'NASADEM (Earth Engine NASA/NASADEM_HGT/001)'] }));
console.log('done');

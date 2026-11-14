// Common analysis grid for the "Scenes" screens (challenge R10): every layer resampled to one 30 m grid over the farm
// neighbourhood, exported as plain arrays so the browser can draw the pixels and read the value under the cursor.
// Layers: NASA HLS (L30 + S30) NDVI medians for chosen periods, how often a pixel is bare in early spring (HLS),
// NASADEM slope and height relative to the surroundings.
// Output: src/data/scene-grid.json
// Usage: npx tsx pipeline/35_scene_grid.ts
import fs from 'node:fs';
import path from 'node:path';
import { INPUTS, OUT, ee, evaluate, initEE, retry } from './lib/ee.ts';

const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products.json'), 'utf8'));
const cover = JSON.parse(fs.readFileSync(path.join(INPUTS, 'cover-model.json'), 'utf8'));
const SOIL: number = cover.ndvi_soil, FULL: number = cover.ndvi_full;
await initEE();

const [w, s, e, n] = products.overlayBounds as number[];
const midLat = (s + n) / 2;
const dy = 30 / 111320, dx = 30 / (111320 * Math.cos(midLat * Math.PI / 180)); // degrees per 30 m
const cols = Math.floor((e - w) / dx), rows = Math.floor((n - s) / dy);
const bounds = [w, n - rows * dy, w + cols * dx, n];
const proj = ee.Projection('EPSG:4326', [dx, 0, w, 0, -dy, n]);
// sample slightly inside the outer pixels so the rectangle covers exactly rows x cols cells
const rect = ee.Geometry.Rectangle([bounds[0] + dx / 4, bounds[1] + dy / 4, bounds[2] - dx / 4, bounds[3] - dy / 4], null, false);
const wide = ee.Geometry.Rectangle([w, s, e, n]).buffer(600).bounds();

const L = ee.ImageCollection('NASA/HLS/HLSL30/v002').select(['B4', 'B5', 'Fmask'], ['red', 'nir', 'fm']);
const S = ee.ImageCollection('NASA/HLS/HLSS30/v002').select(['B4', 'B8A', 'Fmask'], ['red', 'nir', 'fm']);
const good = (img: any) => { const fm = img.select('fm'); const bit = (b: number) => fm.bitwiseAnd(1 << b).neq(0); return bit(1).or(bit(2)).or(bit(3)).or(bit(4)).not(); };
const ndvi = (img: any) => img.normalizedDifference(['nir', 'red']).updateMask(good(img)).rename('v').toFloat();
const hls = (a: string, b: string) => L.merge(S).filterBounds(wide).filterDate(a, b);
const dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation');

const layers: { id: string; label: string; source: string; period?: string; unit: string; img: any; count?: any; digits: number }[] = [
  { id: 'ndvi_peak_2025', label: 'NDVI, peak season 2025', source: 'NASA HLS L30 + S30', period: '1 Jun – 15 Jul 2025, median of cloud-free pixels', unit: 'NDVI', img: hls('2025-06-01', '2025-07-16').map(ndvi).median(), count: hls('2025-06-01', '2025-07-16').map(ndvi).count(), digits: 2 },
  { id: 'ndvi_peak_2026', label: 'NDVI, peak season 2026', source: 'NASA HLS L30 + S30', period: '1 Jun – 15 Jul 2026, median of cloud-free pixels', unit: 'NDVI', img: hls('2026-06-01', '2026-07-16').map(ndvi).median(), count: hls('2026-06-01', '2026-07-16').map(ndvi).count(), digits: 2 },
  { id: 'ndvi_autumn_2026', label: 'NDVI, autumn 2026', source: 'NASA HLS L30 + S30', period: '1 Oct – 10 Nov 2026, median of cloud-free pixels', unit: 'NDVI', img: hls('2026-10-01', '2026-11-11').map(ndvi).median(), count: hls('2026-10-01', '2026-11-11').map(ndvi).count(), digits: 2 },
  { id: 'spring_bare', label: 'How often bare in early spring', source: 'NASA HLS L30 + S30', period: '16 Mar – 15 Apr, share of years 2017–2026 with cover below 30 %', unit: 'share of years',
    img: ee.ImageCollection(Array.from({ length: 10 }, (_, i) => 2017 + i).map(y => hls(`${y}-03-16`, `${y}-04-16`).map(ndvi).median().lt(SOIL + 0.3 * (FULL - SOIL)).rename('v'))).mean(), digits: 2 },
  { id: 'slope', label: 'Slope', source: 'NASADEM', unit: '%', img: ee.Terrain.slope(dem).multiply(Math.PI / 180).tan().multiply(100).rename('v'), digits: 1 },
  { id: 'rel_height', label: 'Height relative to surroundings (500 m)', source: 'NASADEM', unit: 'm', img: dem.subtract(dem.focalMean({ radius: 500, units: 'meters' })).rename('v'), digits: 1 },
];

const NODATA = -9999;
const out: any[] = [];
for (const l of layers) {
  const grab = async (img: any, digits: number) => {
    const res: any = await retry(() => evaluate(img.rename('v').unmask(NODATA).reproject(proj).sampleRectangle({ region: rect, defaultValue: NODATA })), 3, l.id);
    const a: number[][] = res.properties.v;
    if (a.length !== rows || a[0].length !== cols) console.warn(l.id, 'grid', a.length, 'x', a[0].length, 'expected', rows, 'x', cols);
    const k = 10 ** digits;
    return { rows: a.length, cols: a[0].length, values: a.flat().map(v => (v === NODATA || v == null ? null : Math.round(v * k) / k)) };
  };
  const g = await grab(l.img, l.digits);
  const c = l.count ? await grab(l.count, 0) : null;
  const valid = g.values.filter(v => v !== null) as number[];
  out.push({ id: l.id, label: l.label, source: l.source, period: l.period ?? null, unit: l.unit, values: g.values, clearCount: c?.values ?? null });
  console.log(l.id, g.rows, 'x', g.cols, 'valid', valid.length, 'min', Math.min(...valid), 'max', Math.max(...valid));
  if (!out[0].rows) { out[0].rows = g.rows; out[0].cols = g.cols; }
}
const gRows = out[0].rows, gCols = out[0].cols; delete out[0].rows; delete out[0].cols;
fs.writeFileSync(path.join(OUT, 'scene-grid.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), cellM: 30, rows: gRows, cols: gCols,
  bounds: [bounds[0], n - gRows * dy, bounds[0] + gCols * dx, n], dx, dy,
  note: 'One 30 m grid for all layers (EPSG:4326, cell about 30 m). null = no cloud-free observation.',
  layers: out,
}));
console.log('grid', gRows, 'x', gCols, 'bounds', bounds.map(v => v.toFixed(5)).join(','));

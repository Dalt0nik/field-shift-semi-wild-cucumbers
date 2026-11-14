// The common 30 m analysis grid (src/data/scene-grid.json, challenge R10): drawing a layer as an image,
// reading the pixel under a point, and statistics of the pixels inside each field.
import gridJson from '@/data/scene-grid.json';
import { farm } from '@/pilot/demo';
import { rampFor } from './colors';

export interface GridLayer { id: string; label: string; source: string; period: string | null; unit: string; values: (number | null)[]; clearCount: (number | null)[] | null }
export const grid = gridJson as unknown as { rows: number; cols: number; bounds: number[]; dx: number; dy: number; cellM: number; note: string; layers: GridLayer[] };
export const layerById = (id: string) => grid.layers.find(l => l.id === id)!;

const inRing = (x: number, y: number, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
const inGeom = (x: number, y: number, g: any) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly: number[][][]) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));

let cellFieldCache: (string | null)[] | null = null;
/** For every cell of the grid, the farm field whose polygon contains the cell centre (or null). */
export function cellField(): (string | null)[] {
  if (cellFieldCache) return cellFieldCache;
  const out: (string | null)[] = new Array(grid.rows * grid.cols).fill(null);
  for (const f of farm.fields.features) {
    const xs = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flat(2)) as number[][];
    const x0 = Math.min(...xs.map(p => p[0])), x1 = Math.max(...xs.map(p => p[0])), y0 = Math.min(...xs.map(p => p[1])), y1 = Math.max(...xs.map(p => p[1]));
    const c0 = Math.max(0, Math.floor((x0 - grid.bounds[0]) / grid.dx)), c1 = Math.min(grid.cols - 1, Math.ceil((x1 - grid.bounds[0]) / grid.dx));
    const r0 = Math.max(0, Math.floor((grid.bounds[3] - y1) / grid.dy)), r1 = Math.min(grid.rows - 1, Math.ceil((grid.bounds[3] - y0) / grid.dy));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = grid.bounds[0] + (c + 0.5) * grid.dx, y = grid.bounds[3] - (r + 0.5) * grid.dy;
      if (inGeom(x, y, f.geometry)) out[r * grid.cols + c] = f.properties.id;
    }
  }
  return (cellFieldCache = out);
}

/** Index of the grid cell under a point, or -1 outside the grid. */
export function cellAt(lng: number, lat: number): number {
  const c = Math.floor((lng - grid.bounds[0]) / grid.dx), r = Math.floor((grid.bounds[3] - lat) / grid.dy);
  return c < 0 || r < 0 || c >= grid.cols || r >= grid.rows ? -1 : r * grid.cols + c;
}

const urlCache = new Map<string, string>();
/** The layer as a PNG data URL, one image pixel per grid cell. With `clip`, cells outside the farm fields are dimmed. */
export function layerImage(id: string, clip: boolean): string {
  const key = `${id}|${clip}`;
  if (urlCache.has(key)) return urlCache.get(key)!;
  const l = layerById(id), ramp = rampFor(id), mask = clip ? cellField() : null;
  const cv = document.createElement('canvas'); cv.width = grid.cols; cv.height = grid.rows;
  const g = cv.getContext('2d')!, img = g.createImageData(grid.cols, grid.rows);
  l.values.forEach((v, i) => {
    if (v === null) { img.data[i * 4 + 3] = 0; return; }
    const [r, gg, b] = ramp.rgb(v);
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = mask && !mask[i] ? 0 : 235;
  });
  g.putImageData(img, 0, 0);
  // upscale without smoothing so the map shows the real 30 m cells
  const big = document.createElement('canvas'); big.width = grid.cols * 8; big.height = grid.rows * 8;
  const bg = big.getContext('2d')!; bg.imageSmoothingEnabled = false; bg.drawImage(cv, 0, 0, big.width, big.height);
  const url = big.toDataURL('image/png'); urlCache.set(key, url); return url;
}

export interface FieldStat { id: string; n: number; median: number; p10: number; p90: number; clear: number | null }
const q = (s: number[], p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
/** Statistics of a layer over the grid cells inside each field. */
export function fieldStats(id: string): FieldStat[] {
  const l = layerById(id), mask = cellField();
  const by = new Map<string, { v: number[]; c: number[] }>();
  mask.forEach((f, i) => { if (!f) return; const v = l.values[i]; const e = by.get(f) ?? by.set(f, { v: [], c: [] }).get(f)!; if (v !== null) e.v.push(v); const c = l.clearCount?.[i]; if (c != null) e.c.push(c); });
  return farm.fields.features.map((f: any) => {
    const e = by.get(f.properties.id) ?? { v: [], c: [] }; const s = [...e.v].sort((a, b) => a - b);
    return { id: f.properties.id, n: s.length, median: s.length ? q(s, 0.5) : NaN, p10: s.length ? q(s, 0.1) : NaN, p90: s.length ? q(s, 0.9) : NaN, clear: e.c.length ? e.c.reduce((t, v) => t + v, 0) / e.c.length : null };
  });
}

// Map context for the "Map" screen: all declared fields (NMA 2025) around the demo farm, with their crop class.
// They show what the agronomist would pick from when assembling an organization; only the demo farm has data products.
// Input: lt-2025.parquet (NMA declarations 2025 via Fields of the World, CC-BY-4.0), src/data/farm.json, products.json
// Output: src/data/neighbours.json
// Usage: npx tsx pipeline/25_neighbours.ts
import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { LOCAL, OUT } from './lib/ee.ts';

const farm = JSON.parse(fs.readFileSync(path.join(OUT, 'farm.json'), 'utf8'));
const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products.json'), 'utf8'));
const [w, s, e, n] = products.overlayBounds as number[];
// 630 MB, never committed: set LT_DECLARATIONS to its path or put it in pipeline/local/
const candidates = [process.env.LT_DECLARATIONS, path.join(LOCAL, 'lt-2025.parquet')].filter((f): f is string => !!f);
const file = candidates.find(f => fs.existsSync(f));
if (!file) throw new Error('lt-2025.parquet not found in ' + candidates.join(' or '));
const P = file.split(path.sep).join('/');

const CLASS: Record<string, string> = { 'Winter cereals': 'winter_cereals', 'Summer cereals': 'spring_cereals', 'Rape': 'rapeseed', 'Early cereals': 'grain_legumes', 'Oats': 'oats', 'Corn': 'maize', 'Buckwheat': 'buckwheat', 'Sugar beet': 'sugar_beet', 'Perennial grasses': 'perennial_grasses', 'Pastures-meadows over 5m.': 'permanent_grassland', 'Pastures-meadows up to 5m.': 'grassland_up_to_5y', 'Fallow': 'fallow' };

const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run('INSTALL spatial; LOAD spatial;');
const q = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjectsJson() as Record<string, any>[];
// the parquet is in EPSG:3035; its bbox column is in the same CRS
const box = (await q(`select ST_XMin(g) x0, ST_YMin(g) y0, ST_XMax(g) x1, ST_YMax(g) y1 from (select ST_Transform(ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}), 'EPSG:4326', 'EPSG:3035', always_xy := true) g)`))[0];
const rows = await q(`
  select id, "hcat:name_en" cls, round("metrics:area"/1e4, 2) ha,
         ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geometry, 4), 'EPSG:3035', 'EPSG:4326', always_xy := true)) gj
  from '${P}'
  where bbox.xmax >= ${box.x0} and bbox.xmin <= ${box.x1} and bbox.ymax >= ${box.y0} and bbox.ymin <= ${box.y1} and "metrics:area" >= 3000`);
const own = new Set<string>(farm.fields.features.map((f: any) => String(f.properties.nmaId)));
const round = (c: any): any => (typeof c[0] === 'number' ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(round));
const features = rows.filter(r => !own.has(String(r.id))).map(r => {
  const g = JSON.parse(r.gj);
  return { type: 'Feature', properties: { nmaId: String(r.id), cropClass: CLASS[r.cls] ?? null, classEn: r.cls ?? null, areaHa: +r.ha }, geometry: { type: g.type, coordinates: round(g.coordinates) } };
});
fs.writeFileSync(path.join(OUT, 'neighbours.json'), JSON.stringify({
  note: 'Declared fields of 2025 around the demo farm, as map context. Crop is known as a declaration class only.',
  source: 'National Paying Agency (NMA) declarations 2025 via Fields of the World (CC-BY-4.0)',
  bounds: [w, s, e, n], features: { type: 'FeatureCollection', features },
}));
const byCls: Record<string, number> = {};
for (const f of features) byCls[f.properties.classEn ?? '?'] = (byCls[f.properties.classEn ?? '?'] ?? 0) + 1;
console.log('neighbours', features.length, 'fields,', features.reduce((t, f) => t + f.properties.areaHa, 0).toFixed(0), 'ha', byCls);

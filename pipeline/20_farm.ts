// Demo farm, module "Field boundaries / Field history / rule layers".
// Input: pipeline/inputs/farm_<seed>.geojson, a cluster of real declared fields (NMA 2025).
// Adds per field: crop species 2025 and 2026 (NMA area-monitoring layers), share of the field inside the official
// GAEC 5 erosion-sensitive layer and the GAEC 2 peat layer (NMA), soil type and texture (Dirv_DR10LT, geoportal.lt),
// soil organic carbon (NMA). Output: src/data/farm.json, src/data/farm-layers.json
// Usage: npx tsx pipeline/20_farm.ts [seed field id]
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { INPUTS, OUT, retry } from './lib/ee.ts';

const seed = process.argv[2] ?? '98984';
const src = JSON.parse(fs.readFileSync(path.join(INPUTS, `farm_${seed}.geojson`), 'utf8'));
const NMA = 'https://services5.arcgis.com/5W5P6PU8onvMuTvZ/arcgis/rest/services';

async function arc(url: string, params: Record<string, string>): Promise<any> {
  return retry(async () => {
    const r = await fetch(url + '/query', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', ...params }) });
    const j = await r.json();
    if (j.error?.code === 429) { await new Promise(w => setTimeout(w, 61000)); throw new Error('429'); }
    if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
    return j;
  }, 5, url.slice(-40));
}
const atPoint = async (layer: string, field: string, lon: number, lat: number) =>
  (await arc(`${NMA}/${layer}/FeatureServer/0`, { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: field, returnGeometry: 'false' })).features?.[0]?.attributes?.[field] ?? null;

// polygons of a layer intersecting a field, clipped to the field
async function clipLayer(layer: string, feature: any): Promise<{ share: number; parts: any[] }> {
  const rings = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
  const j = await arc(`${NMA}/${layer}/FeatureServer/0`, { geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true', outFields: 'OBJECTID' });
  const parts: any[] = [];
  let area = 0;
  for (const f of j.features ?? []) {
    try {
      const poly = turf.polygon(f.geometry.rings);
      const inter = turf.intersect(turf.featureCollection([poly, feature]));
      if (inter) { area += turf.area(inter); parts.push(turf.truncate(inter, { precision: 6 }).geometry); }
    } catch { /* invalid ring from the service: skip */ }
  }
  return { share: area / turf.area(feature), parts };
}

const SPECIES: Record<string, string> = { 'KVŽ': 'winter_wheat', 'KVV': 'spring_wheat', 'MIŽ': 'winter_barley', 'MIV': 'spring_barley', 'KRŽ': 'triticale', 'RUŽ': 'winter_rye', 'AVI': 'oats', 'AVV': 'oats', 'RAŽ': 'winter_rapeseed', 'RAV': 'spring_rapeseed', 'ŽIR': 'peas', 'PUP': 'faba_bean', 'KUK': 'maize_grain', 'GRI': 'buckwheat', 'CUR': 'sugar_beet', 'DGP': 'perennial_grasses' };
const CLASS: Record<string, string> = { 'Winter cereals': 'winter_cereals', 'Summer cereals': 'spring_cereals', 'Rape': 'rapeseed', 'Early cereals': 'grain_legumes', 'Oats': 'oats', 'Corn': 'maize', 'Buckwheat': 'buckwheat', 'Sugar beet': 'sugar_beet', 'Perennial grasses': 'perennial_grasses', 'Pastures-meadows over 5m.': 'permanent_grassland', 'Pastures-meadows up to 5m.': 'grassland_up_to_5y', 'Fallow': 'fallow' };

const feats = [...src.features].sort((a: any, b: any) => b.properties.area_ha - a.properties.area_ha);
const erosionParts: any[] = [], peatParts: any[] = [];
const out: any[] = [];
let i = 0;
for (const f of feats) {
  const p = f.properties;
  const [sp25, sp26, pre25, soc] = await Promise.all([
    atPoint(encodeURIComponent('heterogeniškumas_2025'), 'glk_paseli', p.lon, p.lat), atPoint('Heterogeniskumas_2026', 'paselis', p.lon, p.lat),
    atPoint(encodeURIComponent('Išankstinis_pasėlių_klasifikavimas_2025_2026'), 'glk_kodas', p.lon, p.lat), atPoint(encodeURIComponent('Dirvožemio_organinės_anglies_kiekis'), 'SOC_v2_B', p.lon, p.lat),
  ]);
  const erosion = await clipLayer('Erozija20260717', f);
  const peat = await clipLayer('DurpzemiaiGaab2026', f);
  // soil map: identify at the interior point (LKS-94 not needed: the service accepts sr=4326)
  const d = 0.002;
  const soilUrl = `https://www.geoportal.lt/mapproxy/rest/services/nzt_dirv_dr10lt_public/MapServer/identify?f=json&geometry=${p.lon},${p.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:2&tolerance=1&mapExtent=${p.lon - d},${p.lat - d},${p.lon + d},${p.lat + d}&imageDisplay=400,400,96&returnGeometry=false`;
  const soilRes: any = await retry(async () => (await fetch(soilUrl)).json(), 3, 'soil').catch(() => ({}));
  const sa = soilRes.results?.[0]?.attributes ?? {};
  erosion.parts.forEach(g => erosionParts.push({ type: 'Feature', properties: { field: p.id }, geometry: g }));
  peat.parts.forEach(g => peatParts.push({ type: 'Feature', properties: { field: p.id }, geometry: g }));
  const id = `F${++i}`;
  out.push({
    type: 'Feature',
    properties: {
      id, nmaId: p.id, areaHa: +(+p.area_ha).toFixed(2), lon: +(+p.lon).toFixed(6), lat: +(+p.lat).toFixed(6),
      history: {
        2024: { cropClass: CLASS[p.cls24] ?? p.cls24 ?? null, source: 'NMA declaration 2024 (crop class)' },
        2025: { crop: SPECIES[sp25] ?? SPECIES[pre25] ?? null, cropClass: CLASS[p.cls25] ?? p.cls25, code: sp25 ?? pre25, source: 'NMA declaration 2025 + NMA area monitoring (species)' },
        2026: { crop: SPECIES[sp26] ?? null, code: sp26, source: 'NMA area monitoring 2026 (species)' },
      },
      erosionShare: +erosion.share.toFixed(4), peatShare: +peat.share.toFixed(4),
      soil: { type: (sa.SNS_KOM1 ?? '').trim() || null, texture: (sa.TEX_F_P ?? '').trim() || null, code: (sa.PAVKOMP1 ?? '').trim() || null, score: sa.SNS_N_KOM1 ? +sa.SNS_N_KOM1 : null, socPct: soc },
    },
    geometry: turf.truncate(f, { precision: 6 }).geometry,
  });
  const h = out[out.length - 1].properties;
  console.log(id, p.id, h.areaHa, 'ha |', h.history[2024].cropClass, '->', h.history[2025].crop ?? h.history[2025].cropClass, '->', h.history[2026].crop, '| GAEC5', (h.erosionShare * 100).toFixed(1) + '%', 'peat', (h.peatShare * 100).toFixed(1) + '%', '| soil', h.soil.type, h.soil.texture, 'score', h.soil.score, 'SOC', h.soil.socPct);
}
const fc = turf.featureCollection(out as any);
const c = turf.centroid(fc).geometry.coordinates;
fs.writeFileSync(path.join(OUT, 'farm.json'), JSON.stringify({
  id: `demo-${seed}`, name: 'Demo farm near Vilkaviškis', note: 'A cluster of real neighbouring declared fields; open declarations carry no farm identifier, so this is not one real holding.',
  municipality: { code: '39', name: 'Vilkaviškio r. sav.' }, jurisdiction: ['EU', 'LT'], centroid: [+c[0].toFixed(5), +c[1].toFixed(5)], bbox: turf.bbox(fc).map(v => +v.toFixed(5)),
  totalHa: +out.reduce((t, f) => t + f.properties.areaHa, 0).toFixed(2), fields: fc,
  credits: ['Field boundaries and crops: National Paying Agency (NMA), declarations 2024-2025 via Fields of the World (CC-BY-4.0); NMA area-monitoring layers 2025-2026', 'Soil: Dirv_DR10LT, geoportal.lt public service (© NŽT)'],
}));
fs.writeFileSync(path.join(OUT, 'farm-layers.json'), JSON.stringify({ erosion: turf.featureCollection(erosionParts), peat: turf.featureCollection(peatParts) }));
console.log('farm total ha', out.reduce((t, f) => t + f.properties.areaHa, 0).toFixed(1), 'centroid', c, 'erosion parts', erosionParts.length, 'peat parts', peatParts.length);

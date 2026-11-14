// Pilot wiring (Lithuania): the preloaded farm, its data products and the plan set-up.
import farmJson from '../data/farm.json';
import econJson from '../data/economics.json';
import weatherJson from '../data/weather.json';
import coverJson from '../data/cover-model.json';
import productsJson from '../data/products.json';
import fieldIndexJson from '../data/field-index.json';
import { FIELD_GROUP, WET_HARVEST } from './economics';
import type { Context, CoverModel, Economics, FieldIndex, Replay, UsualPractice, Weather } from '../engine/characteristics';
import type { PlanSetup } from '../engine/plan';
import type { CropId, FieldInfo } from '../engine/types';

export const farm = farmJson as any;
export const products = productsJson as any;
export const weather = weatherJson as any;
export const economics = econJson as any;
export const coverModel = coverJson as any;
/** NASA HLS field index of the 12 pilot fields (prepared input, see pipeline/README.md). */
export const fieldIndex = fieldIndexJson as unknown as FieldIndex & { seasons: number[]; rho: number; beta90: Record<string, number[]>; check2026: { r: number; slope: number; fields: number }; radiusM: number };

export const fields: FieldInfo[] = farm.fields.features.map((f: any) => {
  const p = f.properties;
  const history: FieldInfo['history'] = {};
  for (const y of Object.keys(p.history)) history[+y] = { crop: p.history[y].crop ?? null, cropClass: p.history[y].cropClass ?? null, source: p.history[y].source };
  return { id: p.id, areaHa: p.areaHa, erosionShare: p.erosionShare, peatShare: p.peatShare, soilTexture: p.soil?.texture ?? null, soilType: p.soil?.type ?? null, history };
});

export const DECISION_DATE = '2026-11-14';
export const PLAN_YEARS = [2027, 2028];

/** Stage 2 in the demo: what the agronomist confirms is growing now. Open declarations lag a year, so this is entered by
 *  hand; NASA HLS only pre-fills "a winter crop seems to be sown" (right for about three fields in four). The crops below
 *  are demo presets consistent with the HLS suggestion for autumn 2026 and with each field's history. */
export const DEMO_CURRENT: Record<string, CropId | null> = {
  F1: 'winter_wheat', F2: null, F3: 'winter_rapeseed', F4: 'winter_wheat', F5: 'winter_wheat', F6: 'winter_wheat',
  F7: null, F8: 'winter_rapeseed', F9: null, F10: null, F11: 'perennial_grasses', F12: 'winter_wheat',
};
// F11: no 2026 crop in the monitoring layer; HLS shows it green all year (NDVI 0.77-0.82 in autumn 2026), entered as grass.
export const HISTORY_FIXES: Record<string, Record<number, CropId>> = { F11: { 2026: 'perennial_grasses' } };
for (const f of fields) for (const [y, c] of Object.entries(HISTORY_FIXES[f.id] ?? {})) f.history[+y] = { crop: c, cropClass: null, source: 'agronomist input (demo preset; HLS shows permanent green cover)' };

export const DEFAULT_CROP_SET: CropId[] = ['winter_wheat', 'winter_rapeseed', 'winter_barley', 'triticale', 'spring_wheat', 'spring_barley', 'oats', 'peas', 'faba_bean', 'sugar_beet', 'perennial_grasses'];

/** Money replay: seasons with municipal yields and prices, and the years that define the normal level. */
export const REPLAY: Replay = { firstSeason: 2006, lastSeason: 2024, normalYieldYears: [2021, 2022, 2023, 2024, 2025], normalPriceYears: [2020, 2021, 2022, 2023, 2024] };
/** The wheat and rapeseed habit of the region: winter wheat after rapeseed, legumes and other crops; winter rapeseed
 *  after a cereal when its interval allows; spring cereals on fields that are free in spring. */
export const USUAL_PRACTICE: UsualPractice = { openFirstYear: ['spring_wheat', 'spring_barley', 'oats'], afterCereal: ['winter_rapeseed', 'winter_wheat', 'spring_barley'], otherwise: ['winter_wheat', 'winter_rapeseed', 'spring_wheat'] };

export function makeSetup(over: Partial<PlanSetup> = {}): PlanSetup {
  return { decisionDate: DECISION_DATE, planYears: PLAN_YEARS, cropSet: DEFAULT_CROP_SET, excluded: {}, current: DEMO_CURRENT, catchCrops: true, ...over };
}
export function makeContext(setup: PlanSetup = makeSetup(), costFactor = 1): Context {
  return { fields, setup, econ: economics as Economics, weather: weather as Weather, cover: coverModel as CoverModel, replay: REPLAY, usual: USUAL_PRACTICE, costFactor,
    fieldIndex, fieldGroup: FIELD_GROUP, wetHarvest: WET_HARVEST };
}

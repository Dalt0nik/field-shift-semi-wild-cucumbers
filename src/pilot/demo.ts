// Pilot wiring (Lithuania): the preloaded farm, its data products and the plan set-up.
//
// THE DECISION DAY. Everything that depends on "today" is derived from DECISION_DATE below: the plan years, what is
// in the ground, which seasons the field index may use, which satellite observations the plan and the screens may
// show as known. Nothing else in the app names a date of the demo. Rule of the demo: the plan uses only data from
// before the decision day; later data are shown only with the label "after the decision day — not used by the plan".
// tests/demo-date.test.ts checks this for the chosen day and for other days of the supported range.
import farmJson from '../data/farm.json';
import econJson from '../data/economics.json';
import weatherJson from '../data/weather.json';
import coverJson from '../data/cover-model.json';
import productsJson from '../data/products.json';
import fieldIndexJson from '../data/field-index.json';
import { FARM_COSTS_EUR_HA, FIELD_GROUP, LATE_SOWING, WET_HARVEST, redistributivePerHa } from './economics';
import { CROPS } from './regional';
import { soilClimate, soilParams } from './soil';
import { FARMER_MODEL, farmerTransitions } from './farmers';
import type { Context, CoverModel, Economics, FieldIndex, Replay, Weather } from '../engine/characteristics';
import type { PlanSetup } from '../engine/plan';
import type { CropId, FieldInfo } from '../engine/types';

export const farm = farmJson as any;
export const products = productsJson as any;
export const weather = weatherJson as any;
export const economics = econJson as any;
export const coverModel = coverJson as any;

/** The decision day of the demo: 1 August 2026. The rapeseed harvest is over, the cereal harvest is starting, and
 *  winter rapeseed has to be sown within three weeks: the last day on which the whole plan for the next harvest is
 *  still open, catch crops for this autumn included. Why this day: README.md, "The decision day".
 *  NEXT_PUBLIC_DECISION_DATE overrides it, to check that the app holds on another day of the supported range. */
export const DECISION_DATE: string = process.env.NEXT_PUBLIC_DECISION_DATE || '2026-08-01';
/** Days for which the preloaded data are enough: from the day after the last season of the cover model and the
 *  declaration of the 2026 crops, to the end of the year whose crops are the last known history. */
export const SUPPORTED_DAYS = { from: '2026-07-01', to: '2026-12-31' };
if (!/^\d{4}-\d{2}-\d{2}$/.test(DECISION_DATE) || DECISION_DATE < SUPPORTED_DAYS.from || DECISION_DATE > SUPPORTED_DAYS.to)
  throw new Error(`Decision day ${DECISION_DATE} is outside ${SUPPORTED_DAYS.from} … ${SUPPORTED_DAYS.to}: the field histories, the cover model and the economics of the demo are prepared for this range only (see pipeline/README.md)`);
/** The year whose crops stand on the fields or were just harvested on the decision day. */
export const DECISION_YEAR = +DECISION_DATE.slice(0, 4);
/** The plan covers the next two harvests. */
export const PLAN_YEARS = [DECISION_YEAR + 1, DECISION_YEAR + 2];
export const niceDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Is a piece of data that ends on `until` later than the decision day (so: not usable by the plan)? */
export const afterDecision = (until: string) => until > DECISION_DATE;

// ---------- fields and their history ----------
// F11: no 2026 crop in the monitoring layer; HLS shows it green all year (NDVI 0.70 in early spring 2026), entered as grass.
export const HISTORY_FIXES: Record<string, Record<number, CropId>> = { F11: { 2026: 'perennial_grasses' } };
const baseFields: FieldInfo[] = farm.fields.features.map((f: any) => {
  const p = f.properties;
  const history: FieldInfo['history'] = {};
  for (const y of Object.keys(p.history)) history[+y] = { crop: p.history[y].crop ?? null, cropClass: p.history[y].cropClass ?? null, source: p.history[y].source };
  for (const [y, c] of Object.entries(HISTORY_FIXES[p.id] ?? {})) history[+y] = { crop: c, cropClass: null, source: 'agronomist input (demo preset; HLS shows permanent green cover)' };
  return { id: p.id, areaHa: p.areaHa, erosionShare: p.erosionShare, peatShare: p.peatShare, soilTexture: p.soil?.texture ?? null, soilType: p.soil?.type ?? null, history };
});
export const fields: FieldInfo[] = baseFields;
/** Stage 2: the fields with the agronomist's corrections of the crop of the decision year. */
export function fieldsWith(confirmed: Record<string, CropId>): FieldInfo[] {
  if (!Object.keys(confirmed).length) return baseFields;
  return baseFields.map(f => (confirmed[f.id] && confirmed[f.id] !== f.history[DECISION_YEAR]?.crop
    ? { ...f, history: { ...f.history, [DECISION_YEAR]: { crop: confirmed[f.id], cropClass: null, source: 'agronomist input' } } } : f));
}

/** What the crop of the decision year is doing on the decision day, from its harvest window in the crop reference. */
export function standing(cropId: string | null | undefined, date: string = DECISION_DATE): { state: 'stays' | 'standing' | 'harvest' | 'harvested' | 'unknown'; from?: string; to?: string } {
  const c = cropId ? CROPS[cropId] : undefined;
  if (!c) return { state: 'unknown' };
  if (c.season === 'perennial') return { state: 'stays' };
  if (!c.harvest.from || !c.harvest.to) return { state: 'unknown' };
  const y = date.slice(0, 4), from = `${y}-${c.harvest.from}`, to = `${y}-${c.harvest.to}`;
  return { state: date < from ? 'standing' : date <= to ? 'harvest' : 'harvested', from, to };
}

// ---------- stage 2: what is sown for the first plan year ----------
/** What was sown on the farm in the autumn of the decision year (demo presets, consistent with what NASA HLS saw in
 *  that autumn and with each field's history). A crop counts as in the ground only on a decision day after the end of
 *  its sowing window; before that the field is still open and the plan decides. Perennial grass stays. */
export const SOWN_IN_AUTUMN: Record<string, CropId> = { F1: 'winter_wheat', F3: 'winter_rapeseed', F4: 'winter_wheat', F5: 'winter_wheat', F6: 'winter_wheat', F8: 'winter_rapeseed', F12: 'winter_wheat' };
/** Crops whose sowing for the first plan year has started by the decision day (the choices of stage 2). */
export function sowableBy(date: string = DECISION_DATE): CropId[] {
  return Object.values(CROPS).filter(c => c.season === 'winter' && c.sowing.from && `${DECISION_YEAR}-${c.sowing.from}` <= date).map(c => c.id);
}
export function currentAt(date: string = DECISION_DATE): Record<string, CropId | null> {
  return Object.fromEntries(baseFields.map(f => {
    if (CROPS[f.history[DECISION_YEAR]?.crop ?? '']?.season === 'perennial') return [f.id, f.history[DECISION_YEAR]!.crop];
    const c = SOWN_IN_AUTUMN[f.id], to = c ? CROPS[c].sowing.to : null;
    return [f.id, c && to && `${DECISION_YEAR}-${to}` <= date ? c : null];
  }));
}
export const DEMO_CURRENT: Record<string, CropId | null> = currentAt();

export const DEFAULT_CROP_SET: CropId[] = ['winter_wheat', 'winter_rapeseed', 'winter_barley', 'triticale', 'spring_wheat', 'spring_barley', 'oats', 'peas', 'faba_bean', 'sugar_beet', 'perennial_grasses'];

// ---------- data the plan uses, and until when each of them runs ----------
/** Money replay: seasons with municipal yields and prices, and the years that define the normal level. Yields of a
 *  year are published in the following spring, prices a year later, so both end before the decision year. */
export const REPLAY: Replay = { firstSeason: 2006, lastSeason: DECISION_YEAR - 2, normalYieldYears: [5, 4, 3, 2, 1].map(d => DECISION_YEAR - d), normalPriceYears: [6, 5, 4, 3, 2].map(d => DECISION_YEAR - d) };

type FieldIndexFile = FieldIndex & { seasons: number[]; rho: number; beta90: Record<string, number[]>; check2026: { r: number; slope: number; fields: number }; radiusM: number };
const fieldIndexAll = fieldIndexJson as unknown as FieldIndexFile;
/** The season peak of the field index is read from 1 April to 31 July (NASA HLS). */
export const fieldIndexSeasonEnd = (season: number | string) => `${season}-07-31`;
/** NASA HLS field index as it could be known on a day: only the seasons whose peak window had closed. The mean
 *  difference from the neighbours is shrunk by the reliability of a k-season mean (Spearman-Brown with rho), exactly
 *  as the prepared input does for all seasons (pipeline/README.md, field-index.json). */
export function fieldIndexAt(date: string = DECISION_DATE): FieldIndexFile {
  const keep = (s: string) => !(fieldIndexSeasonEnd(s) > date);
  const rel = (k: number) => (k ? (k * fieldIndexAll.rho) / (1 + (k - 1) * fieldIndexAll.rho) : 0);
  const out: FieldIndexFile['fields'] = {};
  for (const [id, f] of Object.entries(fieldIndexAll.fields)) {
    const d = Object.fromEntries(Object.entries(f.d).filter(([s]) => keep(s))), k = Object.keys(d).length;
    const mean = k ? Object.values(d).reduce((t, v) => t + v, 0) / k : 0;
    // with every season kept, the prepared values are taken as they are (no second rounding)
    out[id] = k === f.k ? f : { d, percentile: Object.fromEntries(Object.entries(f.percentile).filter(([s]) => keep(s))), k, reliability: +rel(k).toFixed(3), dShrunk: +(mean * rel(k)).toFixed(5) };
  }
  return { ...fieldIndexAll, seasons: fieldIndexAll.seasons.filter(s => keep(String(s))), fields: out };
}
/** NASA HLS field index of the 12 pilot fields as known on the decision day (prepared input, see pipeline/README.md). */
export const fieldIndex = fieldIndexAt();

/** Every dataset behind the plan, with the last day its data cover. tests/demo-date.test.ts fails if one of them
 *  runs past the decision day. */
export const PLAN_DATA: { id: string; label: string; until: string }[] = [
  { id: 'cover', label: 'Cover model: NASA HLS cover curves, seasons 2024–25 and 2025–26', until: coverModel.dataUntil },
  { id: 'soilClimate', label: `Erosive rain, leaching season, wet harvest windows: NASA GPM IMERG and POWER, ${soilClimate.period}`, until: soilClimate.dataUntil },
  { id: 'seasons', label: `Dry and wet-harvest seasons: NASA GPM IMERG and POWER, ${weather.period}`, until: `${String(weather.period).slice(-4)}-12-31` },
  { id: 'fieldIndex', label: `Field index: NASA HLS season peaks ${fieldIndex.seasons.join(', ')}`, until: fieldIndexSeasonEnd(Math.max(...fieldIndex.seasons)) },
  { id: 'yields', label: `District yields ${REPLAY.firstSeason - 5}–${Math.max(...REPLAY.normalYieldYears)}`, until: `${Math.max(...REPLAY.normalYieldYears)}-12-31` },
  { id: 'prices', label: `Prices to ${Math.max(...REPLAY.normalPriceYears)}`, until: `${Math.max(...REPLAY.normalPriceYears)}-12-31` },
  { id: 'history', label: `Crops of ${DECISION_YEAR}: declared in spring, confirmed by the agronomist`, until: `${DECISION_YEAR}-06-30` },
  { id: 'farmers', label: `Usual practice: what farms within ${farmerTransitions.radiusKm} km sowed after each crop, declarations ${farmerTransitions.years.join(' → ')}`, until: farmerTransitions.dataUntil },
];

export interface SetupOptions { costFactor?: number; strawLeft?: boolean; confirmed?: Record<string, CropId>; erosivity?: string }
export function makeSetup(over: Partial<PlanSetup> = {}): PlanSetup {
  const decisionDate = over.decisionDate ?? DECISION_DATE;
  return { decisionDate, planYears: PLAN_YEARS, cropSet: DEFAULT_CROP_SET, excluded: {}, current: currentAt(decisionDate), catchCrops: true, ...over };
}
export function makeContext(setup: PlanSetup = makeSetup(), opts: SetupOptions | number = {}): Context {
  const o: SetupOptions = typeof opts === 'number' ? { costFactor: opts } : opts;
  const fs = fieldsWith(o.confirmed ?? {}), ha = fs.reduce((t, f) => t + f.areaHa, 0);
  return { fields: fs, setup, econ: economics as Economics, weather: weather as Weather, cover: coverModel as CoverModel, replay: REPLAY, usual: FARMER_MODEL, costFactor: o.costFactor ?? 1,
    fieldIndex: fieldIndexAt(setup.decisionDate), fieldGroup: FIELD_GROUP, wetHarvest: WET_HARVEST, soil: soilParams(o.strawLeft ?? true, o.erosivity),
    farmLevel: { costsEurHa: FARM_COSTS_EUR_HA, paymentsEurHa: redistributivePerHa(ha) }, lateSowing: LATE_SOWING };
}

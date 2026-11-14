// Stage 6: the same set of characteristics for every variant, assembled from data products, economics and the
// rules of the pilot (src/pilot/rules.ts).
//  Money     — replay of past seasons: normal yield = mean of the last five municipal seasons, spread = relative
//              deviations of past seasons, all crops of a variant replayed in the same season (backtest: experiment F).
//              Yield of a field = normal yield x field index (NASA HLS: the field against its neighbours) x season
//              deviation x preceding crop; in wet-harvest seasons (NASA IMERG) extra drying and feed-grade wheat are
//              subtracted. Described in docs/money.md.
//  Seasons   — each replayed season is typed by NASA data: dry = lowest fifth of the May-July water balance
//              (IMERG rain minus ET0 from POWER temperature), wet harvest = highest fifth of IMERG rain 20 Jul - 31 Aug.
//  Soil      — six measures of soil protection, no composite score and no weights between them (see "Soil protection"
//              below): S1e erosion-weighted days without living cover (NASA HLS cover x NASA GPM IMERG erosivity),
//              S1 days without living cover, S2 the same on erosion-sensitive land, S3 crop diversity, S4 harvest in
//              a typically wet window, S5 bare soil in the leaching season, S6 humus balance.
//  Rules     — EU conditionality (GAEC 6, GAEC 7) as implemented in Lithuania, eco-scheme and payments.
import { CLASS_INFO, CROPS, crop } from '../pilot/regional';
import { PAYMENTS_2025, ecoRotation, gaec6, gaec7, type YearState } from '../pilot/rules';
import { PREP_DAYS, catchBefore, familyOf, lastHistoryCrop, type PlanSetup } from './plan';
import type { Characteristics, CropId, FieldInfo, FieldOption, Range, RuleResult } from './types';

export interface EconCrop { yieldTHa: Record<string, number>; priceEurT: Record<string, number>; costEurHa: number | null }
export interface Economics { crops: Record<string, EconCrop> }
export interface Weather { years: { year: number; type: string; waterBalanceMayJul: number; harvestRain: number; harvestRainRank?: number; frostDays: number }[] }
/** Field index: per field the shrunk mean difference of season peak NDVI (NASA HLS) from the
 *  neighbouring fields of the same crop group; beta converts it into a share of yield per crop group. */
export interface FieldIndex {
  beta: Record<string, number>;
  cap: [number, number];
  fields: Record<string, { dShrunk: number; k: number; reliability: number; d: Record<string, number>; percentile: Record<string, number> }>;
}
/** Wet-harvest loss: seasons with harvest rain at or above `rankFrom` (rank in 2001-2025). */
export interface WetHarvestParams {
  rankFrom: number;
  /** extra moisture to dry over an ordinary season, percentage points */
  extraMoisturePct: number;
  /** drying tariff, EUR per tonne per percentage point; oilseeds have their own */
  dryingEurPerTPct: number;
  dryingOilseedEurPerTPct: number;
  /** crops of which a share goes to feed at a discount (wheat) */
  feedCrops: CropId[];
  feedShare: number;
  feedDiscount: number;
}
/** Cover model: per crop sequence the quartiles over fields of the bare days (total, winter, erosion-weighted,
 *  leaching season) and the mean bare fraction (1 - green cover) in each of the 24 half-months from 1-15 July. */
export interface CoverModel { model: Record<string, { n: number; autumn: number[]; winter: number[]; spring: number[]; total: number[]; erosive: number[]; leaching: number[]; half: { mean: number[] } }> }

/** Soil protection: the climate and the coefficients behind the soil measures (set by the pilot, not by the engine).
 *  Half-month arrays have 24 values, index 0 = 1-15 July ... 23 = 16-30 June. */
export interface SoilParams {
  /** share of the yearly rainfall erosivity in each half-month (sums to 1) */
  erosivity: number[];
  /** share of the leaching-season water surplus in each half-month (zero outside the season; sums to 1) */
  leaching: number[];
  /** length of the leaching season, days */
  leachingDays: number;
  /** crops whose harvest window is typically wet */
  wetHarvest: Record<CropId, boolean>;
  humus: HumusParams;
}
/** Humus balance: coefficients in kg humus-C per hectare and year (crop) or per 100 kg of by-product (straw, leaves). */
export interface HumusParams {
  crop: Record<CropId, number>;
  /** by-product left on the field: dt of by-product per dt of main product, and kg humus-C per dt of by-product */
  byProduct: Record<CropId, { ratio: number; perDt: number }>;
  catchCrop: number;
  /** are straw and beet leaves left on the field? */
  strawLeft: boolean;
}

export interface Context {
  fields: FieldInfo[];
  setup: PlanSetup;
  econ: Economics;
  weather: Weather;
  cover: CoverModel;
  /** which past seasons are replayed and which years define the normal level (set by the pilot, not by the engine) */
  replay: Replay;
  /** the statistical farmer of the region, used to build the "usual practice" variant (set by the pilot) */
  usual: FarmerModel;
  /** multiplies all variable costs (sensitivity of the ranking to the illustrative costs) */
  costFactor?: number;
  /** field index from NASA HLS and the crop group of each crop it applies to (absent: every field as the district) */
  fieldIndex?: FieldIndex;
  fieldGroup?: Record<CropId, string>;
  /** wet-harvest loss parameters (absent: no loss) */
  wetHarvest?: WetHarvestParams;
  /** switch single money steps off, for checks and sensitivity runs (default: on when their data are given) */
  moneySteps?: { fieldIndex?: boolean; wetHarvest?: boolean; farmLevel?: boolean };
  /** money of the whole farm that no crop choice changes, EUR/ha a year (set by the pilot): costs beyond the crops'
   *  variable costs (overheads, depreciation, rent, wages, interest, land tax) and payments per holding (redistributive).
   *  Absent: both 0, and the margin stays a gross margin. */
  farmLevel?: { costsEurHa: number; paymentsEurHa: number };
  /** yield of a crop by its sowing day, as a share of the yield at the best sowing: points ['MM-DD', factor], linear
   *  between them, the last slope continued after the last point (set by the pilot from field trials) */
  lateSowing?: Record<CropId, [string, number][]>;
  /** soil-protection climate and coefficients (absent: every half-month weighs the same, S4-S6 are zero) */
  soil?: SoilParams;
}
export interface Replay { firstSeason: number; lastSeason: number; normalYieldYears: number[]; normalPriceYears: number[] }
/** What farms of the region sow after each crop (docs/usual-practice.md). Plain data, so that the context can be posted
 *  to the search worker.
 *  - classOf: the class of the transition table for a crop id or a history class id (unknown: 'other')
 *  - p[class][next class]: share of the area sown with the next class after the class
 *  - share[class][crop]: split of a class into crops
 *  - farms, seed: how many statistical farms to keep, and the seed of the draws */
export interface FarmerModel {
  classOf: Record<string, string>;
  p: Record<string, Record<string, number>>;
  share: Record<string, Record<CropId, number>>;
  farms: number;
  seed: number;
}

export const CATCH_CROP_COST = 60; // EUR/ha, seed and sowing of a catch crop (illustrative)
export const GRASS_MARGIN_NOTE = 'Perennial grass has no market price here: its margin is payments only; forage value depends on livestock.';
/** Yield factor by preceding crop, relative to the Lithuanian average mix of preceding crops (literature, not Lithuanian trials). */
export function precropFactor(c: CropId, prev: string | null): number {
  if (!prev || crop(c).family !== 'cereal') return 1;
  const f = familyOf(prev);
  return f === 'cereal' ? 0.93 : f === 'oilseed' ? 1.02 : f === 'legume' ? 1.06 : 1;
}

/** Field index of a field for a crop (1 = as the district). */
const dayOfYear = (md: string) => Date.UTC(2001, +md.slice(0, 2) - 1, +md.slice(3, 5)) / 864e5 - Date.UTC(2001, 0, 0) / 864e5;
/** Yield factor of a crop sown on day-of-year `d`, from the pilot's late-sowing points (1 before the first point). */
function sowingCurve(points: [string, number][], d: number): number {
  const p = points.map(([md, v]) => [dayOfYear(md), v] as const);
  if (d <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (d <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (d - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  const [a, b] = [p[p.length - 2], p[p.length - 1]];
  return Math.max(0, b[1] + (b[1] - a[1]) / (b[0] - a[0]) * (d - b[0]));
}
/** Expected yield factor of a crop that is sown only after the preceding crop leaves the field: the harvest of the
 *  preceding crop falls on any day of its harvest window with equal chance, the field is sown PREP_DAYS later (not before
 *  the crop's own sowing window opens), and the yield follows the pilot's late-sowing points. 1 for crops without points
 *  and after a perennial crop or an unknown one. */
export function sowingFactor(ctx: Context, prev: string | null, c: CropId): number {
  const points = ctx.lateSowing?.[c], from = CROPS[c]?.sowing.from;
  if (!points?.length || !from || !prev) return 1;
  const p = CROPS[prev] ?? CROPS[CLASS_INFO[prev]?.members[0] ?? ''];
  if (!p || p.season === 'perennial' || !p.harvest.from || !p.harvest.to) return 1;
  const open = dayOfYear(from), h0 = dayOfYear(p.harvest.from), h1 = dayOfYear(p.harvest.to);
  let sum = 0, n = 0;
  for (let h = h0; h <= h1; h++) { sum += sowingCurve(points, Math.max(open, h + PREP_DAYS)); n++; }
  return n ? sum / n : 1;
}

export function fieldFactor(ctx: Context, fieldId: string, c: CropId): number {
  const fi = ctx.fieldIndex;
  if (!fi || ctx.moneySteps?.fieldIndex === false) return 1;
  const g = ctx.fieldGroup?.[c], beta = g ? fi.beta[g] : undefined, f = fi.fields[fieldId];
  if (beta === undefined || !f) return 1;
  return Math.min(fi.cap[1], Math.max(fi.cap[0], 1 + beta * f.dShrunk));
}

/** EUR/ha lost in a wet-harvest season by a crop with `tonnes` per ha and `revenue` per ha: extra drying, and for the
 *  feed crops a share sold as feed at a discount. Grain and seed crops only. */
export function wetHarvestLoss(p: WetHarvestParams, c: CropId, tonnes: number, revenue: number): number {
  const k = crop(c);
  if (!['cereal', 'oilseed', 'legume'].includes(k.family) || k.season === 'perennial') return 0;
  const tariff = k.family === 'oilseed' ? p.dryingOilseedEurPerTPct : p.dryingEurPerTPct;
  return tonnes * p.extraMoisturePct * tariff + (p.feedCrops.includes(c) ? revenue * p.feedShare * p.feedDiscount : 0);
}

const mean = (a: number[]) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : NaN);
function quantile(a: number[], p: number): number { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }

export interface Prepared {
  ctx: Context;
  seasons: number[];
  types: string[];
  /** wet-harvest season (harvest rain in the top fifth) and the loss is switched on */
  wet: boolean[];
  totalHa: number;
  /** per crop: yield deviation of each replayed season (1 = as expected) */
  yieldDev: Record<CropId, number[]>;
  /** per crop: revenue per ha in each replayed season (that season's yield and price deviations) */
  revenue: Record<CropId, number[]>;
  /** per crop: revenue per ha with that season's yield deviation at the normal price (isolates weather from prices) */
  revenueYield: Record<CropId, number[]>;
  normal: Record<CropId, { yieldTHa: number; priceEurT: number; costEurHa: number; seasonsUsed: number; seasonsFilled: number }>;
}

/** A season's deviation needs at least this many of the five seasons before it. */
export const MIN_PREV_SEASONS = 3;
/** Deviation of season s: its value over the mean of the (up to five) seasons before it; null when the value of s is
 *  missing or fewer than MIN_PREV_SEASONS of the seasons before it are known. */
export function deviation(get: (year: number) => number | undefined, s: number): number | null {
  const v = get(s), prev = [1, 2, 3, 4, 5].map(d => get(s - d)).filter((x): x is number => x !== undefined);
  return v !== undefined && prev.length >= MIN_PREV_SEASONS ? v / mean(prev) : null;
}
/** A missing deviation is never "an ordinary season": it takes the mean deviation of the same family's crops in that
 *  season; 1 only when no crop of the family has data (counted in seasonsFilled). */
function fillDev(dev: Record<CropId, (number | null)[]>, id: CropId, i: number): number {
  const own = dev[id]?.[i];
  if (own !== null && own !== undefined) return own;
  const fam = Object.keys(dev).filter(o => o !== id && familyOf(o) === familyOf(id)).map(o => dev[o][i]).filter((v): v is number => v !== null);
  return fam.length ? mean(fam) : 1;
}
const unitMean = (a: number[]) => { const m = mean(a); return a.map(v => v / m); };

/** Economics module: normal levels and the replay table (crop x season). */
export function prepare(ctx: Context): Prepared {
  const seasons: number[] = [];
  for (let s = ctx.replay.firstSeason; s <= ctx.replay.lastSeason; s++) seasons.push(s);
  const typeOf = new Map(ctx.weather.years.map(y => [y.year, y.type]));
  const revenue: Prepared['revenue'] = {}, revenueYield: Prepared['revenueYield'] = {}, normal: Prepared['normal'] = {}, yieldDev: Prepared['yieldDev'] = {};
  const rankOf = new Map(ctx.weather.years.map(y => [y.year, y.harvestRainRank ?? 0]));
  const wh = ctx.moneySteps?.wetHarvest === false ? undefined : ctx.wetHarvest;
  const wet = seasons.map(s => !!wh && (rankOf.get(s) ?? 0) >= wh.rankFrom);
  // own deviations of every crop with economics (null where the data are missing), the source of the family fill
  const devY: Record<CropId, (number | null)[]> = {}, devP: Record<CropId, (number | null)[]> = {};
  for (const [id, e] of Object.entries(ctx.econ.crops)) {
    devY[id] = seasons.map(s => deviation(k => e.yieldTHa[String(k)], s));
    devP[id] = seasons.map(s => deviation(k => e.priceEurT[String(k)], s));
  }
  for (const id of ctx.setup.cropSet) {
    const e = ctx.econ.crops[id];
    if (!e) continue;
    const y = (k: number) => e.yieldTHa[String(k)], p = (k: number) => e.priceEurT[String(k)];
    const lastY = ctx.replay.normalYieldYears.map(y).filter(v => v !== undefined), lastP = ctx.replay.normalPriceYears.map(p).filter(v => v !== undefined);
    const ny = mean(lastY), np = mean(lastP);
    // dY and dP: own deviation where the data allow, else the crop family's deviation of that season; then each series
    // is scaled to mean 1 over the replayed seasons, so that the replay keeps today's level (the trend is in the level
    // already). dY and dP are scaled separately: their covariance, the natural hedge of price and yield, stays.
    const dY = unitMean(seasons.map((_, i) => fillDev(devY, id, i))), dP = unitMean(seasons.map((_, i) => fillDev(devP, id, i)));
    const own = seasons.filter((_, i) => devY[id][i] !== null && devP[id][i] !== null).length;
    yieldDev[id] = dY;
    revenueYield[id] = dY.map(ry => ny * ry * np);
    revenue[id] = dY.map((ry, i) => ny * ry * np * dP[i]);
    normal[id] = { yieldTHa: ny, priceEurT: np, costEurHa: (e.costEurHa ?? 0) * (ctx.costFactor ?? 1), seasonsUsed: own, seasonsFilled: seasons.length - own };
  }
  return { ctx, seasons, types: seasons.map(s => typeOf.get(s) ?? 'normal'), wet, totalHa: ctx.fields.reduce((t, f) => t + f.areaHa, 0), revenue, revenueYield, normal, yieldDev };
}

const timing = (id: string | null, kind: 'harvest' | 'sowing'): string => {
  if (!id) return 'mid';
  const c = CROPS[id];
  if (c) return kind === 'harvest' ? c.harvestTiming : c.sowingTiming;
  return CLASS_INFO[id]?.harvestTiming ?? 'mid';
};
/** Cover-model entry for the year ending with `next`, after `prev`: quartiles over fields and the half-month curve.
 *  `exact` is false when the sequence has no entry of its own and a similar one stands in. */
export function bareFor(cover: CoverModel, prev: string | null, next: CropId, catchCrop: boolean): { total: number[]; winter: number[]; erosive: number[]; half: number[]; key: string; n: number; exact: boolean } {
  const p = timing(prev, 'harvest'), n = timing(next, 'sowing');
  const keys = [catchCrop ? `${p}>${n}>green_autumn` : `${p}>${n}`, catchCrop ? `mid>${n}>green_autumn` : `mid>${n}`, `${p}>${n}`, `mid>${n}`, 'mid>september'];
  for (const k of keys) { const m = cover.model[k]; if (m) return { total: m.total, winter: m.winter, erosive: m.erosive, half: m.half.mean, key: k, n: m.n, exact: k === keys[0] }; }
  // no silent default: a cover model without the general entry is a broken input, not a 200-day field
  throw new Error(`cover model has no entry for "${p}>${n}" and no general entry "mid>september"`);
}

// ---------- Soil protection ----------
// Sources and their status are listed in the "?" panel of the Planner (src/pilot/soil.ts); the specification is
// docs/soil.md. None of these is an erosion rate, a leached amount or measured carbon: they compare plans on the
// part that the crop plan decides.
export const HALF_MONTHS = 24;
const UNIFORM = Array.from({ length: HALF_MONTHS }, () => 1 / HALF_MONTHS);

/** Days without living cover of one field-year from its half-month bare fractions b (1 - green cover, NASA HLS).
 *  S1  = sum of b x 365/24: every half-month weighs the same.
 *  S1e = sum of b x w x 365, w = that half-month's share of the yearly rainfall erosivity (NASA GPM IMERG): the time
 *        weighting of the RUSLE cover factor (soil-loss ratio x share of erosivity, in 15-day steps), with the bare
 *        fraction in place of the soil-loss ratio. With equal shares S1e equals S1.
 *  S5  = sum over the leaching season of b x d x season length, d = that half-month's share of the season's water
 *        surplus (IMERG rain above ET0 from POWER temperature). */
export function coverDays(half: number[], soil?: SoilParams): { s1: number; s1e: number; s5: number } {
  const w = soil?.erosivity ?? UNIFORM;
  let s1 = 0, s1e = 0, s5 = 0;
  for (let h = 0; h < HALF_MONTHS; h++) { s1 += half[h] * 365 / HALF_MONTHS; s1e += half[h] * w[h] * 365; if (soil) s5 += half[h] * soil.leaching[h] * soil.leachingDays; }
  return { s1, s1e, s5 };
}

/** S6, humus balance of one crop-year in kg humus-C per hectare (VDLUFA method): the crop's own coefficient, plus the
 *  by-product left on the field (yield in dt/ha x by-product ratio x coefficient per dt), plus a catch crop. */
export function humusOf(h: HumusParams, c: CropId, yieldTHa: number, catchCrop: boolean): number {
  const by = h.byProduct[c];
  return (h.crop[c] ?? 0) + (h.strawLeft && by ? yieldTHa * 10 * by.ratio * by.perDt : 0) + (catchCrop ? h.catchCrop : 0);
}

export interface OptionPart {
  /** EUR for the whole field, mean of the plan years, by replayed season (without farm-level eco-scheme) */
  margin: number[];
  /** the same at normal prices: only the yield deviation of the season */
  marginYield: number[];
  bare: number[]; // S1, ha x days: low, typical, high (mean of plan years)
  bareErosive: number[]; // S1e, ha x days: low, typical, high
  bareWinter: number;
  bareSlopes: number; // S2, ha x erosion-weighted days on erosion-sensitive land
  bareLeaching: number; // S5, ha x days
  wetHarvest: number; // S4, ha per plan year
  humus: number; // S6, kg humus-C per year for the whole field
  cerealAfterCereal: number; // ha-years
  legume: number; // ha-years
  payments: number; // EUR per year (field level)
}

/** Field-level part of the characteristics for one option: everything that adds up over fields. */
export function optionPart(pre: Prepared, f: FieldInfo, o: FieldOption): OptionPart {
  const { ctx } = pre; const ny = ctx.setup.planYears.length;
  const margin = new Array(pre.seasons.length).fill(0), marginYield = new Array(pre.seasons.length).fill(0);
  const bare = [0, 0, 0], bareE = [0, 0, 0]; let bareWinter = 0, bareSlopes = 0, bareLeach = 0, wetH = 0, humus = 0, cac = 0, leg = 0, pay = 0;
  const soil = ctx.soil;
  let prev = lastHistoryCrop(f, ctx.setup.planYears[0]);
  o.crops.forEach((id, i) => {
    const c = crop(id), catchB = catchBefore(o, i);
    const payHa = PAYMENTS_2025.basic + (c.legume && c.season !== 'perennial' ? PAYMENTS_2025.coupledProtein : 0) + (catchB ? PAYMENTS_2025.ecoCatchCrop : 0);
    const costHa = (pre.normal[id]?.costEurHa ?? 0) + (catchB ? CATCH_CROP_COST * (ctx.costFactor ?? 1) : 0);
    // yield of this field = normal x field index x season deviation x preceding crop
    // a crop already in the ground was sown on time; a crop still to be sown waits for the preceding harvest
    const k = precropFactor(id, prev) * fieldFactor(ctx, f.id, id) * (o.fixed[i] ? 1 : sowingFactor(ctx, prev, id));
    const rev = pre.revenue[id], revY = pre.revenueYield[id], dev = pre.yieldDev[id], nt = pre.normal[id]?.yieldTHa ?? 0;
    const wh = ctx.wetHarvest;
    for (let s = 0; s < margin.length; s++) {
      const r = rev ? rev[s] * k : 0, rY = revY ? revY[s] * k : 0;
      const t = dev ? nt * dev[s] * k : 0;
      const loss = pre.wet[s] && wh ? wetHarvestLoss(wh, id, t, r) : 0, lossY = pre.wet[s] && wh ? wetHarvestLoss(wh, id, t, rY) : 0;
      margin[s] += f.areaHa * (r - loss + payHa - costHa) / ny;
      marginYield[s] += f.areaHa * (rY - lossY + payHa - costHa) / ny;
    }
    pay += f.areaHa * payHa / ny;
    // soil: the typical value comes from the mean half-month curve of the sequence; low and high keep the distance
    // of the quartiles over fields from their median
    const b = bareFor(ctx.cover, prev, id, catchB), d = coverDays(b.half, soil);
    const spread = (v: number, q: number[]) => [v + q[0] - q[1], v, v + q[2] - q[1]];
    const r1 = spread(d.s1, b.total), r1e = spread(d.s1e, soil ? b.erosive : b.total);
    for (let q = 0; q < 3; q++) { bare[q] += f.areaHa * r1[q] / ny; bareE[q] += f.areaHa * r1e[q] / ny; }
    bareWinter += f.areaHa * b.winter[1] / ny;
    bareSlopes += f.areaHa * f.erosionShare * d.s1e / ny;
    bareLeach += f.areaHa * d.s5 / ny;
    if (soil?.wetHarvest[id]) wetH += f.areaHa / ny;
    if (soil) humus += f.areaHa * humusOf(soil.humus, id, nt * k, catchB) / ny;
    if (c.family === 'cereal' && prev && familyOf(prev) === 'cereal') cac += f.areaHa;
    if (c.legume) leg += f.areaHa;
    prev = id;
  });
  return { margin, marginYield, bare, bareErosive: bareE, bareWinter, bareSlopes, bareLeaching: bareLeach, wetHarvest: wetH, humus, cerealAfterCereal: cac, legume: leg, payments: pay };
}

const sameCrop = (a: string | null, b: string) => !!a && (a === b || (!CROPS[a] && !!CLASS_INFO[a]?.members.includes(b)));

/** Farm-level state of each plan year, the input of the farm rules. */
export function yearStates(ctx: Context, options: FieldOption[]): YearState[] {
  const byField = new Map(ctx.fields.map(f => [f.id, f]));
  return ctx.setup.planYears.map((year, i) => {
    const s: YearState = { year, area: new Map(), arableHa: 0, changedHa: 0, catchHa: 0, fourthYearHa: 0, repeatedHa: 0, winterGreenHa: 0, winterStubbleHa: 0, winterExemptHa: 0, stay: new Map() };
    for (const o of options) {
      const f = byField.get(o.fieldId)!; const id = o.crops[i]; const c = crop(id);
      const hist = (y: number) => f.history[y]?.crop ?? f.history[y]?.cropClass ?? null;
      const before = (k: number): string | null => (i - k >= 0 ? o.crops[i - k] : hist(year - k)); // crop k years earlier
      const prev = before(1);
      s.arableHa += f.areaHa; s.area.set(id, (s.area.get(id) ?? 0) + f.areaHa);
      if (!sameCrop(prev, id)) s.changedHa += f.areaHa; else s.repeatedHa += f.areaHa;
      if (c.season === 'perennial' && sameCrop(prev, id)) s.stay!.set(id, (s.stay!.get(id) ?? 0) + f.areaHa);
      // "no crop for more than three years on a plot" concerns annual crops; perennial grass is meant to stay
      if (c.season !== 'perennial' && sameCrop(before(1), id) && sameCrop(before(2), id) && sameCrop(before(3), id)) s.fourthYearHa += f.areaHa;
      const catchB = catchBefore(o, i);
      if (catchB) s.catchHa += f.areaHa;
      if (c.season === 'winter' || c.season === 'perennial' || catchB) s.winterGreenHa += f.areaHa;
      else if (prev && CROPS[prev]?.rootCrop) s.winterExemptHa += f.areaHa;
      else s.winterStubbleHa += f.areaHa;
    }
    return s;
  });
}

export function rulesFor(ctx: Context, options: FieldOption[]): { rules: RuleResult[]; eco: boolean[]; ecoShare: number[]; feasible: boolean; states: YearState[] } {
  const states = yearStates(ctx, options);
  const total = ctx.fields.reduce((t, f) => t + f.areaHa, 0);
  const rules: RuleResult[] = []; const eco: boolean[] = [], ecoShare: number[] = []; let feasible = true;
  for (const s of states) {
    const r7 = gaec7(s), r6 = gaec6(s, total), re = ecoRotation(s);
    rules.push(r7, r6, re); eco.push(re.ok); ecoShare.push(re.ok ? re.paidShare ?? 1 : 0);
    if (!r7.ok || !r6.ok) feasible = false; // strict mode: payment conditions act as prohibitions
  }
  return { rules, eco, ecoShare, feasible, states };
}

/** Stage 6 for one variant, from the field-level parts of its options. */
export function characteristics(pre: Prepared, options: FieldOption[], parts: OptionPart[]): Characteristics {
  const { ctx, seasons, types, totalHa } = pre;
  const { rules, eco, ecoShare, feasible, states } = rulesFor(ctx, options);
  const ecoBonus = ecoShare.reduce((t, share) => t + share * PAYMENTS_2025.ecoRotation, 0) / ecoShare.length; // EUR/ha/yr, farm level, on the scheme area
  // money that is the same for every plan of this farm: it moves the level of every margin, never the order of plans
  const fl = ctx.moneySteps?.farmLevel === false ? undefined : ctx.farmLevel;
  const farmPay = fl?.paymentsEurHa ?? 0, farm = farmPay - (fl?.costsEurHa ?? 0);
  const series = seasons.map((s, i) => parts.reduce((t, p) => t + p.margin[i], 0) / totalHa + ecoBonus + farm);
  const sorted = [...series].sort((a, b) => a - b);
  const nWorst = Math.max(1, Math.round(series.length / 5));
  // season types are compared at normal prices, so that a price spike in a dry or wet year does not pass for weather
  const seriesY = seasons.map((_, i) => parts.reduce((t, p) => t + p.marginYield[i], 0) / totalHa + ecoBonus + farm);
  const pick = (t: string) => seriesY.filter((_, i) => types[i] === t);
  const dry = pick('dry'), wet = pick('wetHarvest'), normal = pick('normal');
  const rows = seasons.map((s, i) => ({ season: String(s), margin: Math.round(series[i]), type: types[i] }));
  const sum = (f: (p: OptionPart) => number) => parts.reduce((t, p) => t + f(p), 0);
  const range = (get: (p: OptionPart) => number[]): Range => ({ p25: Math.round(sum(p => get(p)[0]) / totalHa), p50: Math.round(sum(p => get(p)[1]) / totalHa), p75: Math.round(sum(p => get(p)[2]) / totalHa) });
  const bare = range(p => p.bare);
  // S3: crop families on the farm in each plan year
  const families = states.map(s => new Set([...s.area.keys()].map(id => crop(id).family)).size);
  const ny = ctx.setup.planYears.length;
  const largest = Math.max(...states.map(s => Math.max(...s.area.values()) / s.arableHa));
  return {
    marginMean: Math.round(mean(series)), marginP10: Math.round(quantile(series, 0.1)), marginP90: Math.round(quantile(series, 0.9)),
    marginWorstFifth: Math.round(mean(sorted.slice(0, nWorst))),
    marginDry: dry.length ? Math.round(mean(dry)) : null, marginDryN: dry.length,
    marginWetHarvest: wet.length ? Math.round(mean(wet)) : null, marginWetHarvestN: wet.length,
    marginNormal: normal.length ? Math.round(mean(normal)) : null,
    worstSeasons: [...rows].sort((a, b) => a.margin - b.margin).slice(0, 3), marginSeries: rows,
    bareErosive: range(p => p.bareErosive), bareDays: bare, bareDaysWinter: Math.round(sum(p => p.bareWinter) / totalHa), bareOnSlopes: Math.round(sum(p => p.bareSlopes)),
    bareLeaching: Math.round(sum(p => p.bareLeaching) / totalHa), familiesPerYear: families, wetHarvestHa: +sum(p => p.wetHarvest).toFixed(1),
    humus: Math.round(sum(p => p.humus) / totalHa), humusStrawLeft: ctx.soil?.humus.strawLeft ?? true,
    cerealAfterCereal: +(sum(p => p.cerealAfterCereal) / (totalHa * ny)).toFixed(3), legumeShare: +(sum(p => p.legume) / (totalHa * ny)).toFixed(3),
    largestCropShare: +largest.toFixed(3), cropsPerYear: states.map(s => s.area.size),
    paymentsEurHa: Math.round(sum(p => p.payments) / totalHa + ecoBonus + farmPay), ecoRotationEligible: eco,
    softWarnings: options.reduce((t, o) => t + o.warnings.length, 0), rules, feasible,
  };
}

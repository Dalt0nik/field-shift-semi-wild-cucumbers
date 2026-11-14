// Stage 6: the same set of characteristics for every variant, assembled from data products, economics and the
// rules of the pilot (src/pilot/rules.ts).
//  Money     — replay of past seasons: normal yield = mean of the last five municipal seasons, spread = relative
//              deviations of past seasons, all crops of a variant replayed in the same season (backtest: experiment F).
//              Yield of a field = normal yield x field index (NASA HLS: the field against its neighbours) x season
//              deviation x preceding crop; in wet-harvest seasons (NASA IMERG) extra drying and feed-grade wheat are
//              subtracted.
//  Seasons   — each replayed season is typed by NASA data: dry = lowest fifth of the May-July water balance
//              (IMERG rain minus ET0 from POWER temperature), wet harvest = highest fifth of IMERG rain 20 Jul - 31 Aug.
//  Bare soil — bare-soil-equivalent days from NASA HLS cover curves of 1 700 declared fields, by crop sequence (C4, C6).
//  Rules     — EU conditionality (GAEC 6, GAEC 7) as implemented in Lithuania, eco-scheme and payments.
import { CLASS_INFO, CROPS, crop } from '../pilot/regional';
import { PAYMENTS_2025, ecoRotation, gaec6, gaec7, type YearState } from '../pilot/rules';
import { familyOf, lastHistoryCrop, type PlanSetup } from './plan';
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
export interface CoverModel { model: Record<string, { n: number; autumn: number[]; winter: number[]; spring: number[]; total: number[] }> }

export interface Context {
  fields: FieldInfo[];
  setup: PlanSetup;
  econ: Economics;
  weather: Weather;
  cover: CoverModel;
  /** which past seasons are replayed and which years define the normal level (set by the pilot, not by the engine) */
  replay: Replay;
  /** the habit of the region, used to build the "usual practice" variant: preferred crops in order */
  usual: UsualPractice;
  /** multiplies all variable costs (sensitivity of the ranking to the illustrative costs) */
  costFactor?: number;
  /** field index from NASA HLS and the crop group of each crop it applies to (absent: every field as the district) */
  fieldIndex?: FieldIndex;
  fieldGroup?: Record<CropId, string>;
  /** wet-harvest loss parameters (absent: no loss) */
  wetHarvest?: WetHarvestParams;
  /** switch single money steps off, for checks and sensitivity runs (default: on when their data are given) */
  moneySteps?: { fieldIndex?: boolean; wetHarvest?: boolean };
}
export interface Replay { firstSeason: number; lastSeason: number; normalYieldYears: number[]; normalPriceYears: number[] }
export interface UsualPractice { openFirstYear: CropId[]; afterCereal: CropId[]; otherwise: CropId[] }

export const CATCH_CROP_COST = 60; // EUR/ha, seed and sowing of a catch crop (illustrative)
export const GRASS_MARGIN_NOTE = 'Perennial grass has no market price here: its margin is payments only; forage value depends on livestock.';
/** Yield factor by preceding crop, relative to the Lithuanian average mix of preceding crops (literature, not Lithuanian trials). */
export function precropFactor(c: CropId, prev: string | null): number {
  if (!prev || crop(c).family !== 'cereal') return 1;
  const f = familyOf(prev);
  return f === 'cereal' ? 0.93 : f === 'oilseed' ? 1.02 : f === 'legume' ? 1.06 : 1;
}

/** Field index of a field for a crop (1 = as the district). */
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
  normal: Record<CropId, { yieldTHa: number; priceEurT: number; costEurHa: number; seasonsUsed: number }>;
}

/** Economics module: normal levels and the replay table (crop x season). */
export function prepare(ctx: Context): Prepared {
  const seasons: number[] = [];
  for (let s = ctx.replay.firstSeason; s <= ctx.replay.lastSeason; s++) seasons.push(s);
  const typeOf = new Map(ctx.weather.years.map(y => [y.year, y.type]));
  const revenue: Prepared['revenue'] = {}, revenueYield: Prepared['revenueYield'] = {}, normal: Prepared['normal'] = {}, yieldDev: Prepared['yieldDev'] = {};
  const rankOf = new Map(ctx.weather.years.map(y => [y.year, y.harvestRainRank ?? 0]));
  const wh = ctx.moneySteps?.wetHarvest === false ? undefined : ctx.wetHarvest;
  const wet = seasons.map(s => !!wh && (rankOf.get(s) ?? 0) >= wh.rankFrom);
  for (const id of ctx.setup.cropSet) {
    const e = ctx.econ.crops[id];
    if (!e) continue;
    const y = (k: number) => e.yieldTHa[String(k)], p = (k: number) => e.priceEurT[String(k)];
    const lastY = ctx.replay.normalYieldYears.map(y).filter(v => v !== undefined), lastP = ctx.replay.normalPriceYears.map(p).filter(v => v !== undefined);
    const ny = mean(lastY), np = mean(lastP);
    let used = 0;
    yieldDev[id] = seasons.map(s => { const py = [1, 2, 3, 4, 5].map(d => y(s - d)).filter(v => v !== undefined); return y(s) !== undefined && py.length === 5 ? y(s) / mean(py) : 1; });
    revenueYield[id] = yieldDev[id].map(ry => ny * ry * np);
    revenue[id] = seasons.map(s => {
      const py = [1, 2, 3, 4, 5].map(d => y(s - d)).filter(v => v !== undefined), pp = [1, 2, 3, 4, 5].map(d => p(s - d)).filter(v => v !== undefined);
      const ry = y(s) !== undefined && py.length === 5 ? y(s) / mean(py) : 1, rp = p(s) !== undefined && pp.length === 5 ? p(s) / mean(pp) : 1;
      if (y(s) !== undefined && py.length === 5 && p(s) !== undefined && pp.length === 5) used++;
      return ny * ry * np * rp;
    });
    normal[id] = { yieldTHa: ny, priceEurT: np, costEurHa: (e.costEurHa ?? 0) * (ctx.costFactor ?? 1), seasonsUsed: used };
  }
  return { ctx, seasons, types: seasons.map(s => typeOf.get(s) ?? 'normal'), wet, totalHa: ctx.fields.reduce((t, f) => t + f.areaHa, 0), revenue, revenueYield, normal, yieldDev };
}

const timing = (id: string | null, kind: 'harvest' | 'sowing'): string => {
  if (!id) return 'mid';
  const c = CROPS[id];
  if (c) return kind === 'harvest' ? c.harvestTiming : c.sowingTiming;
  return CLASS_INFO[id]?.harvestTiming ?? 'mid';
};
/** Bare-soil-equivalent days (p25, median, p75) for the year ending with `next`, after `prev`. */
export function bareFor(cover: CoverModel, prev: string | null, next: CropId, catchCrop: boolean): { total: number[]; winter: number[]; key: string; n: number } {
  const p = timing(prev, 'harvest'), n = timing(next, 'sowing');
  const keys = [catchCrop ? `${p}>${n}>green_autumn` : `${p}>${n}`, catchCrop ? `mid>${n}>green_autumn` : `mid>${n}`, `${p}>${n}`, `mid>${n}`, 'mid>september'];
  for (const k of keys) { const m = cover.model[k]; if (m) return { total: m.total, winter: m.winter, key: k, n: m.n }; }
  // no silent default: a cover model without the general entry is a broken input, not a 200-day field
  throw new Error(`cover model has no entry for "${p}>${n}" and no general entry "mid>september"`);
}

export interface OptionPart {
  /** EUR for the whole field, mean of the plan years, by replayed season (without farm-level eco-scheme) */
  margin: number[];
  /** the same at normal prices: only the yield deviation of the season */
  marginYield: number[];
  bare: number[]; // ha x days: p25, p50, p75 (mean of plan years)
  bareWinter: number;
  bareSlopes: number;
  cerealAfterCereal: number; // ha-years
  legume: number; // ha-years
  payments: number; // EUR per year (field level)
}

/** Field-level part of the characteristics for one option: everything that adds up over fields. */
export function optionPart(pre: Prepared, f: FieldInfo, o: FieldOption): OptionPart {
  const { ctx } = pre; const ny = ctx.setup.planYears.length;
  const margin = new Array(pre.seasons.length).fill(0), marginYield = new Array(pre.seasons.length).fill(0);
  const bare = [0, 0, 0]; let bareWinter = 0, bareSlopes = 0, cac = 0, leg = 0, pay = 0;
  let prev = lastHistoryCrop(f, ctx.setup.planYears[0]);
  o.crops.forEach((id, i) => {
    const c = crop(id), catchBefore = i > 0 && o.catchAfter[i - 1];
    const payHa = PAYMENTS_2025.basic + (c.legume && c.season !== 'perennial' ? PAYMENTS_2025.coupledProtein : 0) + (catchBefore ? PAYMENTS_2025.ecoCatchCrop : 0);
    const costHa = (pre.normal[id]?.costEurHa ?? 0) + (catchBefore ? CATCH_CROP_COST * (ctx.costFactor ?? 1) : 0);
    // yield of this field = normal x field index x season deviation x preceding crop
    const k = precropFactor(id, prev) * fieldFactor(ctx, f.id, id);
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
    const b = bareFor(ctx.cover, prev, id, catchBefore);
    for (let q = 0; q < 3; q++) bare[q] += f.areaHa * b.total[q] / ny;
    bareWinter += f.areaHa * b.winter[1] / ny;
    bareSlopes += f.areaHa * f.erosionShare * b.total[1] / ny;
    if (c.family === 'cereal' && prev && familyOf(prev) === 'cereal') cac += f.areaHa;
    if (c.legume) leg += f.areaHa;
    prev = id;
  });
  return { margin, marginYield, bare, bareWinter, bareSlopes, cerealAfterCereal: cac, legume: leg, payments: pay };
}

const sameCrop = (a: string | null, b: string) => !!a && (a === b || (!CROPS[a] && !!CLASS_INFO[a]?.members.includes(b)));

/** Farm-level state of each plan year, the input of the farm rules. */
export function yearStates(ctx: Context, options: FieldOption[]): YearState[] {
  const byField = new Map(ctx.fields.map(f => [f.id, f]));
  return ctx.setup.planYears.map((year, i) => {
    const s: YearState = { year, area: new Map(), arableHa: 0, changedHa: 0, catchHa: 0, fourthYearHa: 0, repeatedHa: 0, winterGreenHa: 0, winterStubbleHa: 0, winterExemptHa: 0 };
    for (const o of options) {
      const f = byField.get(o.fieldId)!; const id = o.crops[i]; const c = crop(id);
      const hist = (y: number) => f.history[y]?.crop ?? f.history[y]?.cropClass ?? null;
      const before = (k: number): string | null => (i - k >= 0 ? o.crops[i - k] : hist(year - k)); // crop k years earlier
      const prev = before(1);
      s.arableHa += f.areaHa; s.area.set(id, (s.area.get(id) ?? 0) + f.areaHa);
      if (!sameCrop(prev, id)) s.changedHa += f.areaHa; else s.repeatedHa += f.areaHa;
      // "no crop for more than three years on a plot" concerns annual crops; perennial grass is meant to stay
      if (c.season !== 'perennial' && sameCrop(before(1), id) && sameCrop(before(2), id) && sameCrop(before(3), id)) s.fourthYearHa += f.areaHa;
      const catchBefore = i > 0 && o.catchAfter[i - 1];
      if (catchBefore) s.catchHa += f.areaHa;
      if (c.season === 'winter' || c.season === 'perennial' || catchBefore) s.winterGreenHa += f.areaHa;
      else if (prev && CROPS[prev]?.rootCrop) s.winterExemptHa += f.areaHa;
      else s.winterStubbleHa += f.areaHa;
    }
    return s;
  });
}

export function rulesFor(ctx: Context, options: FieldOption[]): { rules: RuleResult[]; eco: boolean[]; feasible: boolean; states: YearState[] } {
  const states = yearStates(ctx, options);
  const total = ctx.fields.reduce((t, f) => t + f.areaHa, 0);
  const rules: RuleResult[] = []; const eco: boolean[] = []; let feasible = true;
  for (const s of states) {
    const r7 = gaec7(s), r6 = gaec6(s, total), re = ecoRotation(s);
    rules.push(r7, r6, re); eco.push(re.ok);
    if (!r7.ok || !r6.ok) feasible = false; // strict mode: payment conditions act as prohibitions
  }
  return { rules, eco, feasible, states };
}

/** Stage 6 for one variant, from the field-level parts of its options. */
export function characteristics(pre: Prepared, options: FieldOption[], parts: OptionPart[]): Characteristics {
  const { ctx, seasons, types, totalHa } = pre;
  const { rules, eco, feasible, states } = rulesFor(ctx, options);
  const ecoBonus = eco.reduce((t, ok) => t + (ok ? PAYMENTS_2025.ecoRotation : 0), 0) / eco.length; // EUR/ha/yr, farm level
  const series = seasons.map((s, i) => parts.reduce((t, p) => t + p.margin[i], 0) / totalHa + ecoBonus);
  const sorted = [...series].sort((a, b) => a - b);
  const nWorst = Math.max(1, Math.round(series.length / 5));
  // season types are compared at normal prices, so that a price spike in a dry or wet year does not pass for weather
  const seriesY = seasons.map((_, i) => parts.reduce((t, p) => t + p.marginYield[i], 0) / totalHa + ecoBonus);
  const pick = (t: string) => seriesY.filter((_, i) => types[i] === t);
  const dry = pick('dry'), wet = pick('wetHarvest'), normal = pick('normal');
  const rows = seasons.map((s, i) => ({ season: String(s), margin: Math.round(series[i]), type: types[i] }));
  const sum = (f: (p: OptionPart) => number) => parts.reduce((t, p) => t + f(p), 0);
  const bare: Range = { p25: Math.round(sum(p => p.bare[0]) / totalHa), p50: Math.round(sum(p => p.bare[1]) / totalHa), p75: Math.round(sum(p => p.bare[2]) / totalHa) };
  const ny = ctx.setup.planYears.length;
  const largest = Math.max(...states.map(s => Math.max(...s.area.values()) / s.arableHa));
  return {
    marginMean: Math.round(mean(series)), marginP10: Math.round(quantile(series, 0.1)), marginP90: Math.round(quantile(series, 0.9)),
    marginWorstFifth: Math.round(mean(sorted.slice(0, nWorst))),
    marginDry: dry.length ? Math.round(mean(dry)) : null, marginDryN: dry.length,
    marginWetHarvest: wet.length ? Math.round(mean(wet)) : null, marginWetHarvestN: wet.length,
    marginNormal: normal.length ? Math.round(mean(normal)) : null,
    worstSeasons: [...rows].sort((a, b) => a.margin - b.margin).slice(0, 3), marginSeries: rows,
    bareDays: bare, bareDaysWinter: Math.round(sum(p => p.bareWinter) / totalHa), bareOnSlopes: Math.round(sum(p => p.bareSlopes)),
    cerealAfterCereal: +(sum(p => p.cerealAfterCereal) / (totalHa * ny)).toFixed(3), legumeShare: +(sum(p => p.legume) / (totalHa * ny)).toFixed(3),
    largestCropShare: +largest.toFixed(3), cropsPerYear: states.map(s => s.area.size),
    paymentsEurHa: Math.round(sum(p => p.payments) / totalHa + ecoBonus), ecoRotationEligible: eco,
    softWarnings: options.reduce((t, o) => t + o.warnings.length, 0), rules, feasible,
  };
}

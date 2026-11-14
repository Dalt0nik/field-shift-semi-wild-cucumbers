// The soil health score of a plan (docs/soil.md, section 7): one number, 0-100, bigger is better.
// Three aspects that a crop plan changes, one measure each so that nothing is counted twice:
//   cover           days of bare soil under heavy rain (S1e)
//   variety         cereal after cereal and crop groups per year (S3), averaged
//   organic matter  humus balance (S6)
// Each measure is put on a 0-100 scale: 0 = the weakest tenth of the local farms (the statistical farms behind the
// typical local plan), 100 = the best plan found. The three aspects are averaged with equal weights. No source sets
// weights between soil measures (JRC, Tools for Composite Indicators Building, 2005: "No agreed methodology exists to
// weight individual indicators"), so the weights are a stated judgement and tests/soil.test.ts checks that the plan
// shown as Best for soil does not depend on them. The score compares the plans of one farm on one decision day; it is
// not a measurement of the soil.
import type { Characteristics, SoilScore } from './types';

/** Weights of the three aspects. */
export const SOIL_WEIGHTS = { cover: 1, variety: 1, organic: 1 };
export type SoilWeights = typeof SOIL_WEIGHTS;
/** The zero of each scale: this share of the local farms is weaker. */
export const SOIL_ZERO_SHARE = 0.1;
/** Plans within this many points of the highest score count as equal for "Best for soil"; the highest margin decides. */
export const SOIL_TIE_POINTS = 3;

/** The measures behind the score. sign +1 = larger is better. */
const MEASURES = {
  cover: { get: (c: Characteristics) => c.bareErosive.p50, sign: -1 },
  cerealAfterCereal: { get: (c: Characteristics) => c.cerealAfterCereal, sign: -1 },
  cropGroups: { get: (c: Characteristics) => c.familiesPerYear.reduce((t, v) => t + v, 0) / (c.familiesPerYear.length || 1), sign: 1 },
  humus: { get: (c: Characteristics) => c.humus, sign: 1 },
} as const;
type MeasureKey = keyof typeof MEASURES;
/** For each measure: the value that scores 0 and the value that scores 100. */
export type SoilScale = Record<MeasureKey, [zero: number, hundred: number]>;

const quantile = (sorted: number[], p: number) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

/** The scale of a set-up: zero from the local farms, hundred from the plans found (the typical plan included). */
export function soilScale(farms: Characteristics[], plans: Characteristics[]): SoilScale {
  const out = {} as SoilScale;
  for (const k of Object.keys(MEASURES) as MeasureKey[]) {
    const { get, sign } = MEASURES[k];
    const f = farms.map(get).sort((a, b) => a - b);
    // the weakest tenth: the 10th percentile where larger is better, the 90th where smaller is better
    const zero = quantile(f, sign > 0 ? SOIL_ZERO_SHARE : 1 - SOIL_ZERO_SHARE);
    const hundred = sign > 0 ? Math.max(...plans.map(get)) : Math.min(...plans.map(get));
    out[k] = [zero, hundred];
  }
  return out;
}

function points(k: MeasureKey, c: Characteristics, scale: SoilScale): number {
  const { get, sign } = MEASURES[k], [zero, hundred] = scale[k], v = get(c);
  // no room between the weakest farms and the best plan: a plan is either as good as the best or not
  if (sign * hundred <= sign * zero) return sign * v >= sign * hundred ? 100 : 0;
  return Math.max(0, Math.min(100, ((v - zero) / (hundred - zero)) * 100));
}

/** The score of a plan on a scale. Aspect scores and the total are whole points. */
export function soilScore(c: Characteristics, scale: SoilScale, w: SoilWeights = SOIL_WEIGHTS): SoilScore {
  const cover = points('cover', c, scale), variety = (points('cerealAfterCereal', c, scale) + points('cropGroups', c, scale)) / 2, organic = points('humus', c, scale);
  const total = (cover * w.cover + variety * w.variety + organic * w.organic) / (w.cover + w.variety + w.organic);
  return { total: Math.round(total), cover: Math.round(cover), variety: Math.round(variety), organic: Math.round(organic) };
}

/** Three bands for reading a score, on the cut points of the Cornell soil health report (below 40 low, 40 to 60
 *  medium, above 60 high; the report's five colours folded into three). On this scale "high" means close to the best
 *  plan found for this farm and "low" means like the weakest local farms. */
export type SoilBand = 'low' | 'medium' | 'high';
export const soilBand = (points: number): SoilBand => (points < 40 ? 'low' : points < 60 ? 'medium' : 'high');

/** Best for soil: the highest soil health score. Plans within SOIL_TIE_POINTS of the top count as equal, because a
 *  point or two is less than the measures can tell apart; among them the highest margin wins. */
export function bestForSoil<T extends { ch: Characteristics }>(variants: T[]): T {
  const s = (v: T) => v.ch.soilScore?.total ?? 0;
  const top = Math.max(...variants.map(s));
  return variants.filter(v => s(v) >= top - SOIL_TIE_POINTS).sort((a, b) => b.ch.marginMean - a.ch.marginMean || s(b) - s(a) || a.ch.bareErosive.p50 - b.ch.bareErosive.p50)[0];
}

/** The plan with the fewest days of bare soil under heavy rain (ties: the same on erosion-sensitive land, cereal after
 *  cereal, the higher margin). It was "Best for soil" before the score; the check of the rain weighting
 *  (pipeline/92_soil_sensitivity.ts) still follows it. */
export function fewestBareSoil<T extends { ch: Characteristics }>(variants: T[]): T {
  return [...variants].sort((a, b) => a.ch.bareErosive.p50 - b.ch.bareErosive.p50 || a.ch.bareOnSlopes - b.ch.bareOnSlopes || a.ch.cerealAfterCereal - b.ch.cerealAfterCereal || b.ch.marginMean - a.ch.marginMean)[0];
}

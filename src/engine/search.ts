// Stage 5 (search for admissible farm variants) and the stage 7 helpers (non-dominated set, best per characteristic,
// consequences of a choice). Full enumeration is impossible (12 fields x ~50 options each), so the search is an
// evolutionary multi-objective search with a fixed seed: it keeps only variants that pass the farm rules in strict mode
// and pushes towards the trade-off front of the comparison characteristics. It is a heuristic: the set shown is the
// non-dominated part of the variants that were evaluated, not a proof that no better variant exists.
import { characteristics, optionPart, prepare, rulesFor, type Context, type OptionPart, type Prepared } from './characteristics';
import { baseTimeline, checkCandidate, fieldOptions, lastHistoryCrop, occupancyFor } from './plan';
import { CROPS, crop } from '../pilot/regional';
import type { Characteristics, CropId, EvaluatedVariant, FieldInfo, FieldOption, Occupancy } from './types';

/** Comparison characteristics (axes of the non-dominated set). sign +1 = larger is better. */
export const AXES: { key: string; label: string; unit: string; sign: 1 | -1; get: (c: Characteristics) => number; hint: string }[] = [
  { key: 'marginMean', label: 'Margin, usual season', unit: 'EUR/ha', sign: 1, get: c => c.marginMean, hint: 'Mean over the replayed past seasons: field yield x price - wet-harvest loss + payments - variable costs - the farm costs every plan carries (overheads, depreciation, rent, wages, interest; Lithuanian FADN 2024).' },
  { key: 'marginWorstFifth', label: 'Margin, bad seasons', unit: 'EUR/ha', sign: 1, get: c => c.marginWorstFifth, hint: 'Mean of the worst fifth of replayed seasons.' },
  { key: 'bareErosive', label: 'Soil', unit: 'days/yr', sign: -1, get: c => c.bareErosive.p50, hint: 'Erosion-weighted days without living cover per hectare and year: NASA HLS cover curves of declared Lithuanian fields, each half-month weighted by its share of the yearly rainfall erosivity (NASA GPM IMERG).' },
  { key: 'cerealAfterCereal', label: 'Cereal after cereal', unit: '% area', sign: -1, get: c => c.cerealAfterCereal * 100, hint: 'Share of area where a cereal follows a cereal: disease, pest and weed pressure.' },
];

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dominates = (a: number[], b: number[]) => { let better = false; for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-9) return false; if (a[i] > b[i] + 1e-9) better = true; } return better; };

export interface SearchResult {
  pre: Prepared;
  fieldOpts: { field: FieldInfo; options: FieldOption[]; rejected: { year: number; crop: CropId; after: CropId | null; reasons: string[] }[] }[];
  variants: EvaluatedVariant[]; // non-dominated set, sorted by margin
  baseline: EvaluatedVariant;
  /** the statistical farms behind the baseline */
  farmers: FarmerBand;
  evaluated: number;
  combinations: number;
}

export function search(ctx: Context, opts: { seed?: number; population?: number; generations?: number } = {}): SearchResult {
  const pre = prepare(ctx);
  const fieldOpts = ctx.fields.map(f => ({ field: f, ...fieldOptions(f, ctx.setup) }));
  const parts: OptionPart[][] = fieldOpts.map(fo => fo.options.map(o => optionPart(pre, fo.field, o)));
  const nF = fieldOpts.length;
  const rand = rng(opts.seed ?? 20261114);
  const N = opts.population ?? 160, G = opts.generations ?? 140;
  const cache = new Map<string, { idx: number[]; ch: Characteristics; obj: number[] } | null>();
  let evaluated = 0;
  const evalIdx = (idx: number[]) => {
    const key = idx.join(',');
    if (cache.has(key)) return cache.get(key)!;
    const options = idx.map((k, f) => fieldOpts[f].options[k]);
    evaluated++;
    if (!rulesFor(ctx, options).feasible) { cache.set(key, null); return null; }
    const ch = characteristics(pre, options, idx.map((k, f) => parts[f][k]));
    const v = { idx, ch, obj: AXES.map(a => a.sign * a.get(ch)) };
    cache.set(key, v); return v;
  };
  const randomIdx = () => fieldOpts.map(fo => Math.floor(rand() * fo.options.length));
  const mutate = (idx: number[]) => { const c = [...idx]; const n = 1 + (rand() < 0.35 ? 1 : 0); for (let i = 0; i < n; i++) { const f = Math.floor(rand() * nF); c[f] = Math.floor(rand() * fieldOpts[f].options.length); } return c; };
  type Ind = NonNullable<ReturnType<typeof evalIdx>>;
  let pop: Ind[] = [];
  const add = (idx: number[]) => { const v = evalIdx(idx); if (v && !pop.some(p => p === v)) pop.push(v); return v; };
  // greedy seeds: per field the best option for each axis taken alone, then repaired towards feasibility by mutation
  const meanArr = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
  const fieldScore: ((p: OptionPart) => number)[] = [p => meanArr(p.margin), p => Math.min(...p.margin), p => -p.bareErosive[1], p => -p.cerealAfterCereal];
  for (const fs of fieldScore) {
    let idx = parts.map(ps => ps.reduce((best, p, k) => (fs(p) > fs(ps[best]) ? k : best), 0));
    for (let t = 0; t < 400 && !evalIdx(idx); t++) idx = mutate(idx);
    add(idx);
  }
  for (let t = 0; pop.length < N && t < N * 80; t++) add(randomIdx());
  const select = (cands: Ind[], n: number): Ind[] => {
    const out: Ind[] = []; let rest = [...new Set(cands)];
    while (out.length < n && rest.length) {
      const front = rest.filter(a => !rest.some(b => b !== a && dominates(b.obj, a.obj)));
      if (out.length + front.length <= n) out.push(...front);
      else { // crowding: keep the most spread-out members of the last front
        const crowd = new Map<Ind, number>(front.map(f => [f, 0]));
        for (let m = 0; m < AXES.length; m++) {
          const s = [...front].sort((a, b) => a.obj[m] - b.obj[m]); const span = s[s.length - 1].obj[m] - s[0].obj[m] || 1;
          crowd.set(s[0], Infinity); crowd.set(s[s.length - 1], Infinity);
          for (let i = 1; i < s.length - 1; i++) crowd.set(s[i], crowd.get(s[i])! + (s[i + 1].obj[m] - s[i - 1].obj[m]) / span);
        }
        out.push(...[...front].sort((a, b) => crowd.get(b)! - crowd.get(a)!).slice(0, n - out.length));
      }
      rest = rest.filter(a => !front.includes(a));
    }
    return out;
  };
  for (let g = 0; g < G; g++) {
    const kids: Ind[] = [];
    for (let t = 0; t < N * 2 && kids.length < N; t++) {
      const a = pop[Math.floor(rand() * pop.length)], b = pop[Math.floor(rand() * pop.length)];
      const child = mutate(a.idx.map((k, f) => (rand() < 0.5 ? k : b.idx[f])));
      const v = evalIdx(child); if (v) kids.push(v);
    }
    pop = select([...pop, ...kids], N);
  }
  const all = [...cache.values()].filter((v): v is Ind => !!v);
  const front = all.filter(a => !all.some(b => b !== a && dominates(b.obj, a.obj)));
  const toVariant = (v: Ind, i: number): EvaluatedVariant => ({ id: `V${i + 1}`, options: v.idx.map((k, f) => fieldOpts[f].options[k]), origin: 'search', ch: v.ch, nonDominated: true, tags: [] });
  const variants = front.sort((a, b) => b.ch.marginMean - a.ch.marginMean).map(toVariant);
  for (const a of AXES) { const best = a.key === 'bareErosive' ? bestForSoil(variants) : variants.reduce((x, y) => (a.sign * a.get(y.ch) > a.sign * a.get(x.ch) ? y : x)); best.tags.push(`best: ${a.label.toLowerCase()}`); }
  // "balanced": the variant whose worst normalised axis is the best
  const lo = AXES.map(a => Math.min(...variants.map(v => a.sign * a.get(v.ch)))), hi = AXES.map(a => Math.max(...variants.map(v => a.sign * a.get(v.ch))));
  const score = (v: EvaluatedVariant) => Math.min(...AXES.map((a, i) => (a.sign * a.get(v.ch) - lo[i]) / (hi[i] - lo[i] || 1)));
  variants.reduce((x, y) => (score(y) > score(x) ? y : x)).tags.push('balanced');
  const { baseline, farmers } = typicalFarm(ctx, pre, fieldOpts, parts);
  baseline.nonDominated = !all.some(b => dominates(b.obj, AXES.map(a => a.sign * a.get(baseline.ch))));
  const combinations = fieldOpts.reduce((t, fo) => t * Math.max(1, fo.options.length), 1);
  return { pre, fieldOpts, variants, baseline, farmers, evaluated, combinations };
}

/** Best for soil: the lowest erosion-weighted days without cover (S1e); ties are broken by the same on erosion-sensitive
 *  land (S2), then by cereal after cereal, then by the higher margin. No weights are involved. */
export function bestForSoil<T extends { ch: Characteristics }>(variants: T[]): T {
  return [...variants].sort((a, b) => a.ch.bareErosive.p50 - b.ch.bareErosive.p50 || a.ch.bareOnSlopes - b.ch.bareOnSlopes || a.ch.cerealAfterCereal - b.ch.cerealAfterCereal || b.ch.marginMean - a.ch.marginMean)[0];
}

/** The statistical farms behind "the typical local plan": how many were kept and how they spread on each comparison axis. */
export interface FarmerBand {
  /** farms kept (they pass the farm rules) and farms drawn */
  n: number;
  drawn: number;
  /** false when fewer than FARMS_MIN farms passed the farm rules and the drawn farms that fail them were kept too */
  rulesPassed: boolean;
  /** per AXES key, in the units of the axis: 10th, 50th and 90th percentile, and all values sorted ascending */
  axes: Record<string, { p10: number; p50: number; p90: number; sorted: number[] }>;
  /** per field: the share of the farmer probability that falls on options still open on the decision day */
  keptMass: Record<string, number>;
}
const FARMS_MIN = 200;
const quantileOf = (s: number[], p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** Share of the statistical farms that a plan beats on one comparison axis (strictly better). */
export function shareBeaten(band: FarmerBand, key: string, c: Characteristics): number {
  const a = AXES.find(x => x.key === key)!, v = a.get(c), s = band.axes[key].sorted;
  return s.filter(x => a.sign * v > a.sign * x).length / s.length;
}

/** Current practice as a variant (challenge: compare with the existing rotation), from what farms around the pilot
 *  actually sow (docs/usual-practice.md). Every field gets a probability for each of its admissible options without a
 *  catch crop: the product over the open plan years of p(crop | crop of the year before), from the pilot's transition
 *  table (ctx.usual). Farms are drawn field by field, those that pass the farm rules are kept, and the card shows the
 *  typical one: the kept farm nearest to the median on the four comparison axes, each axis scaled by its interquartile
 *  range. Fixed seed, so the same inputs give the same plan. */
function typicalFarm(ctx: Context, pre: Prepared, fieldOpts: SearchResult['fieldOpts'], parts: OptionPart[][]): { baseline: EvaluatedVariant; farmers: FarmerBand } {
  const m = ctx.usual;
  const classOf = (id: string | null) => (id ? m.classOf[id] ?? 'other' : 'other');
  // p(crop | preceding crop) over the annual crops of the plan's crop set; the rest of the class probability is dropped
  const crops = ctx.setup.cropSet.filter(c => CROPS[c]?.season !== 'perennial');
  const memo = new Map<string, Map<CropId, number>>();
  const pCrop = (prev: string | null, c: CropId): number => {
    const i = classOf(prev);
    let row = memo.get(i);
    if (!row) {
      const raw = crops.map(k => { const cl = classOf(k); return [k, (m.p[i]?.[cl] ?? 0) * (m.share[cl]?.[k] ?? 0)] as const; });
      const tot = raw.reduce((t, [, v]) => t + v, 0);
      row = new Map(raw.map(([k, v]) => [k, tot > 0 ? v / tot : 0]));
      memo.set(i, row);
    }
    return row.get(c) ?? 0;
  };
  const keptMass: Record<string, number> = {};
  const dist = fieldOpts.map(fo => {
    const prev0 = lastHistoryCrop(fo.field, ctx.setup.planYears[0]);
    const w = fo.options.map(o => {
      if (o.catchAfter.some(Boolean) || o.catchFirst) return 0;
      let p = 1, prev: string | null = prev0;
      o.crops.forEach((c, i) => { if (!o.fixed[i]) p *= pCrop(prev, c); prev = c; });
      return p;
    });
    const kept = w.reduce((t, v) => t + v, 0);
    keptMass[fo.field.id] = +kept.toFixed(3);
    if (kept > 0) return w.map(v => v / kept);
    // nothing farmers do here is still open: every option without a catch crop is equally likely
    const plain: number[] = fo.options.map(o => (o.catchAfter.some(Boolean) || o.catchFirst ? 0 : 1)), n = plain.reduce((t, v) => t + v, 0);
    return n ? plain.map(v => v / n) : fo.options.map((_, k) => (k === 0 ? 1 : 0));
  });
  const rand = rng(m.seed);
  const draw = (w: number[]) => { let u = rand(), last = 0; for (let k = 0; k < w.length; k++) { if (w[k] <= 0) continue; last = k; u -= w[k]; if (u <= 0) return k; } return last; };
  type Farm = { idx: number[]; ch: Characteristics };
  const measure = (idx: number[]): Farm => ({ idx, ch: characteristics(pre, idx.map((k, f) => fieldOpts[f].options[k]), idx.map((k, f) => parts[f][k])) });
  const kept: Farm[] = [], failed: number[][] = [];
  let drawn = 0;
  while (kept.length < m.farms && drawn < 20 * m.farms) {
    drawn++;
    const idx = dist.map(draw);
    if (rulesFor(ctx, idx.map((k, f) => fieldOpts[f].options[k])).feasible) kept.push(measure(idx));
    else if (failed.length < m.farms) failed.push(idx);
  }
  const rulesPassed = kept.length >= FARMS_MIN;
  const pool = rulesPassed ? kept : [...kept, ...failed.map(measure)];
  const axes: FarmerBand['axes'] = {};
  const scale = AXES.map(a => {
    const sorted = pool.map(f => a.get(f.ch)).sort((x, y) => x - y);
    axes[a.key] = { p10: quantileOf(sorted, 0.1), p50: quantileOf(sorted, 0.5), p90: quantileOf(sorted, 0.9), sorted };
    return { a, med: axes[a.key].p50, iqr: quantileOf(sorted, 0.75) - quantileOf(sorted, 0.25) || sorted[sorted.length - 1] - sorted[0] || 1 };
  });
  let typical = pool[0], nearest = Infinity;
  for (const f of pool) {
    const d = scale.reduce((t, x) => t + ((x.a.get(f.ch) - x.med) / x.iqr) ** 2, 0);
    if (d < nearest) { nearest = d; typical = f; }
  }
  const options = typical.idx.map((k, f) => fieldOpts[f].options[k]);
  return { baseline: { id: 'usual', label: 'Typical local plan', options, origin: 'baseline', ch: typical.ch, tags: ['current practice'] }, farmers: { n: kept.length, drawn, rulesPassed, axes, keptMass } };
}

export function isDominated(a: Characteristics, others: Characteristics[]): boolean {
  const oa = AXES.map(x => x.sign * x.get(a));
  return others.some(o => dominates(AXES.map(x => x.sign * x.get(o)), oa));
}

/** Stage 7: what a choice closes and opens for the year after the plan horizon. */
export function consequences(ctx: Context, f: FieldInfo, o: FieldOption): { year: number; open: CropId[]; closed: { crop: CropId; reasons: string[] }[]; goodAfter: CropId[] } {
  const year = ctx.setup.planYears[ctx.setup.planYears.length - 1] + 1;
  const timeline: Occupancy[] = baseTimeline(f, { ...ctx.setup, current: { ...ctx.setup.current, [f.id]: null } });
  o.crops.forEach((id, i) => { const occ = occupancyFor(id, ctx.setup.planYears[i], 'plan'); if (occ) timeline.push(occ); });
  const open: CropId[] = [], closed: { crop: CropId; reasons: string[] }[] = [], goodAfter: CropId[] = [];
  const last = o.crops[o.crops.length - 1];
  for (const id of ctx.setup.cropSet) {
    if (CROPS[id]?.season === 'perennial') continue;
    const chk = checkCandidate(f, timeline, id, year, { ...ctx.setup, planYears: [...ctx.setup.planYears, year] });
    if (chk.ok) { open.push(id); if (crop(id).previous.good.some(g => g.ref === last || CROPS[last]?.groups.includes(g.ref))) goodAfter.push(id); }
    else closed.push({ crop: id, reasons: chk.reasons });
  }
  return { year, open, closed, goodAfter };
}

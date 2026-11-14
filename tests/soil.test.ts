// Soil protection: the six measures (S1e, S1, S2, S3, S4, S5, S6), the Best-for-soil rule, and the grounding rules of
// its implementation brief (docs/soil.md gives the definitions).
import { describe, expect, it } from 'vitest';
import { HALF_MONTHS, characteristics, coverDays, humusOf, optionPart, prepare, type SoilParams } from '@/engine/characteristics';
import { workspace } from '@/engine/editor';
import { catchBefore, fieldOptions } from '@/engine/plan';
import { AXES, bestForSoil, search } from '@/engine/search';
import type { Characteristics, FieldOption } from '@/engine/types';
import { DECISION_DATE, coverModel, fields, makeContext, makeSetup } from '@/pilot/demo';
import soilCheck from '@/data/soil-check.json';
import { HUMUS_BYPRODUCT, HUMUS_CATCH_CROP, HUMUS_CROP, humusClass, humusParams, soilClimate, soilParams } from '@/pilot/soil';

const ctx = makeContext(makeSetup());
const pre = prepare(ctx);
const soil = ctx.soil!;
const sum = (a: number[]) => a.reduce((t, v) => t + v, 0);
const f2 = fields.find(f => f.id === 'F2')!;
const opt = (crops: string[], catchAfter: boolean[], catchFirst = false): FieldOption => ({ fieldId: 'F2', crops, catchAfter, catchFirst, fixed: crops.map(() => false), warnings: [] });

describe('soil climate', () => {
  it('every set of erosivity shares and the leaching shares sum to 1 over 24 half-months', () => {
    for (const w of Object.values(soilClimate.erosivity.shares)) { expect(w.length).toBe(HALF_MONTHS); expect(sum(w)).toBeCloseTo(1, 2); }
    expect(sum(soilClimate.leaching.shares)).toBeCloseTo(1, 2);
    // nothing leaches in the shares outside 1 Sep - 28 Feb (half-months 4..15 of the year that starts on 1 July)
    soilClimate.leaching.shares.forEach((d, h) => { if (h < 4 || h > 15) expect(d).toBe(0); });
  });
  it('more than half of the erosive rain falls from May to September, by both methods', () => {
    expect(soilClimate.erosivity.summary.storms.mayToSep).toBeGreaterThan(0.5);
    expect(soilClimate.erosivity.summary.daily.mayToSep).toBeGreaterThan(0.5);
  });
});

describe('S1e, erosion-weighted days without cover', () => {
  it('equals S1 when every half-month has the same share of the erosivity', () => {
    const uniform: SoilParams = { ...soil, erosivity: Array.from({ length: HALF_MONTHS }, () => 1 / HALF_MONTHS) };
    for (const m of Object.values<any>(coverModel.model)) {
      const d = coverDays(m.half.mean, uniform);
      expect(d.s1e).toBeCloseTo(d.s1, 9);
      expect(coverDays(m.half.mean).s1e).toBeCloseTo(d.s1, 9); // no soil climate given: the same
    }
    // and for a whole plan
    const r = search({ ...ctx, soil: uniform }, { population: 40, generations: 10 });
    for (const v of [r.baseline, ...r.variants.slice(0, 5)]) expect(v.ch.bareErosive.p50).toBe(v.ch.bareDays.p50);
  });
  it('stays between 0 and 365 days for every sequence of the cover model', () => {
    for (const m of Object.values<any>(coverModel.model)) {
      const d = coverDays(m.half.mean, soil);
      for (const v of [d.s1, d.s1e]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(365); }
      expect(d.s5).toBeLessThanOrEqual(soil.leachingDays);
    }
  });
  it('S1 from the half-month curves stays close to the totals of the cover model (mean against median of fields)', () => {
    for (const m of Object.values<any>(coverModel.model)) expect(Math.abs(coverDays(m.half.mean).s1 - m.total[1])).toBeLessThan(20);
  });
  it('is the bare-soil axis of the search', () => { expect(AXES.map(a => a.key)).toEqual(['marginMean', 'marginWorstFifth', 'bareErosive', 'cerealAfterCereal']); });
});

describe('S4, S5, S6', () => {
  it('S4 is zero without a crop harvested in a typically wet window, and counts the hectares of one that is', () => {
    expect(optionPart(pre, f2, opt(['faba_bean', 'winter_wheat'], [false])).wetHarvest).toBe(0);
    expect(soil.wetHarvest.sugar_beet).toBe(true);
    expect(optionPart(pre, f2, opt(['sugar_beet', 'spring_wheat'], [false])).wetHarvest).toBeCloseTo(f2.areaHa / 2, 6);
  });
  it('S5 and S1e fall when a catch crop is added', () => {
    const a = optionPart(pre, f2, opt(['faba_bean', 'spring_wheat'], [false], false)), b = optionPart(pre, f2, opt(['faba_bean', 'spring_wheat'], [false], true));
    expect(b.bareLeaching).toBeLessThan(a.bareLeaching);
    expect(b.bareErosive[1]).toBeLessThan(a.bareErosive[1]);
    const c = optionPart(pre, f2, opt(['winter_wheat', 'spring_barley'], [false])), d = optionPart(pre, f2, opt(['winter_wheat', 'spring_barley'], [true]));
    expect(d.bareLeaching).toBeLessThan(c.bareLeaching);
  });
  it('S6 rises when straw is left instead of removed, and with a catch crop', () => {
    const left = search(makeContext(makeSetup(), { strawLeft: true }), { population: 30, generations: 5 }).baseline.ch;
    const removed = search(makeContext(makeSetup(), { strawLeft: false }), { population: 30, generations: 5 }).baseline.ch;
    expect(left.humus).toBeGreaterThan(removed.humus);
    expect(removed.humusStrawLeft).toBe(false);
    expect(humusOf(humusParams(true), 'spring_wheat', 4, true) - humusOf(humusParams(true), 'spring_wheat', 4, false)).toBe(HUMUS_CATCH_CROP);
  });
  it('S6 uses the coefficients of the worksheet: wheat at 5.73 t/ha with straw left is -400 + 57.3 x 0.8 x 7', () => {
    expect(humusOf(humusParams(true), 'winter_wheat', 5.73, false)).toBeCloseTo(-400 + 57.3 * 0.8 * 7, 6);
    expect(humusOf(humusParams(false), 'winter_wheat', 5.73, false)).toBe(-400);
    expect(humusOf(humusParams(true), 'faba_bean', 3, false)).toBe(160);
    expect(humusClass(-79)).toBe('low'); expect(humusClass(40)).toBe('balanced');
  });
  it('every crop of the crop set has a humus coefficient', () => {
    for (const c of ctx.setup.cropSet) expect(HUMUS_CROP[c]).toBeTypeOf('number');
    for (const c of Object.keys(HUMUS_BYPRODUCT)) expect(HUMUS_CROP[c]).toBeLessThan(0);
  });
});

describe('S2 and S3', () => {
  const r = search(ctx, { population: 40, generations: 10 });
  it('S2 is the erosion-weighted days on the land inside the erosion-sensitive layer', () => {
    const ws = workspace(ctx), v = r.baseline;
    const expected = v.options.reduce((t, o, i) => { const fc = ws.fields[i], k = fc.options.findIndex(x => x.crops.join() === o.crops.join() && !x.catchFirst && !x.catchAfter.some(Boolean)); return t + fc.field.erosionShare * fc.parts[k].bareErosive[1]; }, 0);
    expect(v.ch.bareOnSlopes).toBe(Math.round(expected));
  });
  it('S3 counts the crop families on the farm in each plan year', () => {
    expect(r.baseline.ch.familiesPerYear.length).toBe(ctx.setup.planYears.length);
    for (const n of r.baseline.ch.familiesPerYear) { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(5); }
  });
});

describe('Best for soil', () => {
  const r = search(ctx);
  const best = r.variants.find(v => v.tags.includes('best: soil'))!;
  it('is the plan with the lowest S1e among the plans that pass the farm rules', () => {
    expect(best).toBeTruthy(); expect(best.ch.feasible).toBe(true);
    expect(best.ch.bareErosive.p50).toBe(Math.min(...r.variants.map(v => v.ch.bareErosive.p50)));
  });
  it('breaks ties by S2, then by cereal after cereal', () => {
    const c = (s1e: number, s2: number, cac: number, m = 0) => ({ id: `${s1e}-${s2}-${cac}`, ch: { bareErosive: { p50: s1e }, bareOnSlopes: s2, cerealAfterCereal: cac, marginMean: m } as unknown as Characteristics });
    expect(bestForSoil([c(140, 5, 0), c(139, 9, 0.1), c(139, 8, 0.2), c(139, 8, 0.1)]).id).toBe('139-8-0.1');
  });
  it('reaches the exact bound: no plan can have fewer erosion-weighted days than the best option of every field', () => {
    const ws = workspace(ctx);
    const bound = sum(ws.fields.map(fc => Math.min(...fc.parts.map(p => p.bareErosive[1])))) / ws.totalHa;
    expect(best.ch.bareErosive.p50).toBeGreaterThanOrEqual(Math.floor(bound));
    expect(best.ch.bareErosive.p50 - bound).toBeLessThan(1.5);
  });
  it('differs from usual practice and from the highest-margin plan, and protects the soil better than both', () => {
    const top = r.variants.find(v => v.tags.includes('best: margin, usual season'))!;
    expect(best.id).not.toBe(top.id);
    expect(best.ch.bareErosive.p50).toBeLessThan(r.baseline.ch.bareErosive.p50);
    expect(best.ch.bareErosive.p50).toBeLessThan(top.ch.bareErosive.p50);
    expect(best.ch.bareLeaching).toBeLessThan(r.baseline.ch.bareLeaching);
  });
  it('the stored check that the "?" panel quotes (src/data/soil-check.json) belongs to this set-up: rerun pipeline/92_soil_sensitivity.ts otherwise', () => {
    expect(soilCheck.decisionDate).toBe(DECISION_DATE);
    expect(soilCheck.base).toBe(soilClimate.erosivity.base);
    expect(soilCheck.cropSet).toEqual(ctx.setup.cropSet);
    expect(soilCheck.bestForSoil).toEqual({ s1e: best.ch.bareErosive.p50, margin: best.ch.marginMean });
    expect(soilCheck.usual).toEqual({ s1e: r.baseline.ch.bareErosive.p50, margin: r.baseline.ch.marginMean });
    expect(soilCheck.plans).toBe(r.variants.length + 1);
    expect(soilCheck.variants.map(v => v.key).sort()).toEqual(Object.keys(soilClimate.erosivity.shares).filter(k => k !== soilClimate.erosivity.base).sort());
  });
  it('the measured characteristics are those of its own options', () => {
    const ws = workspace(ctx);
    const parts = best.options.map((o, i) => ws.fields[i].parts[ws.fields[i].options.findIndex(x => x.crops.join() === o.crops.join() && !!x.catchFirst === !!o.catchFirst && x.catchAfter.join() === o.catchAfter.join())]);
    expect(characteristics(ws.pre, best.options, parts).bareErosive).toEqual(best.ch.bareErosive);
  });
});

describe('catch crop before the first plan year', () => {
  it('is offered while this autumn\'s sowing is still ahead, after a crop harvested by early September', () => {
    const aug = fieldOptions(f2, makeSetup({ decisionDate: '2026-08-01' })).options; // F2: winter rapeseed in 2026
    expect(aug.some(o => o.catchFirst && catchBefore(o, 0))).toBe(true);
    for (const o of aug.filter(x => x.catchFirst)) expect(['spring_wheat', 'spring_barley', 'oats', 'peas', 'faba_bean', 'sugar_beet']).toContain(o.crops[0]);
    const f1 = fields.find(f => f.id === 'F1')!; // faba bean in 2026, harvested in September: too late for a catch crop
    expect(fieldOptions(f1, makeSetup({ decisionDate: '2026-08-01' })).options.some(o => o.catchFirst)).toBe(false);
  });
  it('is not offered once the decision day is past that sowing', () => {
    expect(fieldOptions(f2, makeSetup({ decisionDate: '2026-11-14' })).options.some(o => o.catchFirst)).toBe(false);
    expect(fieldOptions(f2, makeSetup({ decisionDate: '2026-08-01', catchCrops: false })).options.some(o => o.catchFirst || o.catchAfter.some(Boolean))).toBe(false);
  });
});

it('soilParams fails loudly on an unknown set of erosivity shares', () => { expect(() => soilParams(true, 'nope')).toThrow(/no erosivity shares/); });

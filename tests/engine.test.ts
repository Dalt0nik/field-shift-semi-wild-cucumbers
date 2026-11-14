import { describe, expect, it } from 'vitest';
import { bareFor, precropFactor, prepare } from '@/engine/characteristics';
import { coverModel, fields, makeContext, makeSetup } from '@/pilot/demo';
import { baseTimeline, checkCandidate, fieldOptions, slots } from '@/engine/plan';
import { ecoRotation, gaec6, gaec7, type YearState } from '@/pilot/rules';
import { AXES, search } from '@/engine/search';

// The stage 2-4 cases below are written for a decision day in November, when winter crops are in the ground:
// the same day the money reference values of docs/money.md are computed for.
const NOV = '2026-11-14';
const setup = makeSetup({ decisionDate: NOV });
const byId = (id: string) => fields.find(f => f.id === id)!;
const state = (over: Partial<YearState>): YearState => ({ year: 2028, area: new Map(), arableHa: 100, changedHa: 0, catchHa: 0, fourthYearHa: 0, repeatedHa: 0, winterGreenHa: 0, winterStubbleHa: 0, winterExemptHa: 0, ...over });

describe('stages 2-4: timeline, slots, candidates', () => {
  it('a field with a winter crop in the ground has its first free slot after the 2027 harvest', () => {
    const f = byId('F1'); const s = slots(f, baseTimeline(f, setup), setup);
    expect(s[0].from >= '2027-07-01').toBe(true);
  });
  it('a free field has a slot from the decision date', () => {
    const f = byId('F2'); expect(slots(f, baseTimeline(f, setup), setup)[0].from).toBe(setup.decisionDate);
  });
  it('a winter crop cannot be sown for 2027 after the decision date in November', () => {
    const f = byId('F2'); const r = checkCandidate(f, baseTimeline(f, setup), 'winter_wheat', 2027, setup);
    expect(r.ok).toBe(false); expect(r.reasons.join(' ')).toMatch(/sowing window closed/);
  });
  it('GAEC 5 bans a root crop on a field with erosion-sensitive land', () => {
    const f = byId('F2'); const r = checkCandidate(f, baseTimeline(f, setup), 'sugar_beet', 2027, setup);
    expect(f.erosionShare).toBeGreaterThan(0.005); expect(r.ok).toBe(false); expect(r.reasons.join(' ')).toMatch(/erosion-sensitive/);
  });
  it('rapeseed does not return before its 4-year interval', () => {
    const f = byId('F2'); // winter rapeseed in 2026
    expect(fieldOptions(f, setup).options.some(o => o.crops.includes('winter_rapeseed'))).toBe(false);
  });
  it('winter rapeseed is admitted after winter wheat, with a warning about an early harvest', () => {
    const f = byId('F1'); const o = fieldOptions(f, setup).options.find(x => x.crops[1] === 'winter_rapeseed');
    expect(o).toBeTruthy(); expect(o!.warnings.join(' ')).toMatch(/early harvest/);
  });
  it('a crop outside the crop set is never a candidate', () => {
    expect(fieldOptions(byId('F2'), setup).options.some(o => o.crops.includes('maize_grain'))).toBe(false);
  });
});

describe('regulatory module', () => {
  it('GAEC 7 passes by crop change, by catch crops or by diversification', () => {
    const mono = new Map([['winter_wheat', 100]]);
    expect(gaec7(state({ area: mono })).ok).toBe(false);
    expect(gaec7(state({ area: mono, changedHa: 40 })).ok).toBe(true);
    expect(gaec7(state({ area: mono, changedHa: 40, fourthYearHa: 5 })).ok).toBe(false);
    expect(gaec7(state({ area: mono, catchHa: 35 })).ok).toBe(true);
    expect(gaec7(state({ area: new Map([['winter_wheat', 70], ['peas', 20], ['oats', 10]]) })).ok).toBe(true);
    expect(gaec7(state({ area: new Map([['winter_wheat', 80], ['peas', 15], ['oats', 5]]) })).ok).toBe(false);
  });
  it('GAEC 6 needs 65 % above 50 ha and 50 % below, and counts stubble', () => {
    expect(gaec6(state({ winterGreenHa: 40, winterStubbleHa: 20 }), 100).ok).toBe(false);
    expect(gaec6(state({ winterGreenHa: 40, winterStubbleHa: 30 }), 100).ok).toBe(true);
    expect(gaec6(state({ winterGreenHa: 40, winterStubbleHa: 10 }), 45).ok).toBe(true);
  });
  it('the rotation eco-scheme needs 4 crops, a legume, main crop <= 50 % and no repeats', () => {
    const ok = new Map([['winter_wheat', 45], ['winter_rapeseed', 25], ['peas', 15], ['oats', 15]]);
    expect(ecoRotation(state({ area: ok })).ok).toBe(true);
    expect(ecoRotation(state({ area: ok, repeatedHa: 3 })).ok).toBe(false);
    expect(ecoRotation(state({ area: new Map([['winter_wheat', 55], ['winter_rapeseed', 20], ['peas', 15], ['oats', 10]]) })).ok).toBe(false);
    expect(ecoRotation(state({ area: new Map([['winter_wheat', 45], ['winter_rapeseed', 25], ['spring_barley', 15], ['oats', 15]]) })).ok).toBe(false);
  });
});

describe('stage 6: characteristics', () => {
  it('the cover model orders sequences as measured from HLS', () => {
    const aug = bareFor(coverModel, 'winter_wheat', 'winter_rapeseed', false).total[1];
    const sep = bareFor(coverModel, 'winter_rapeseed', 'winter_wheat', false).total[1];
    const springOpen = bareFor(coverModel, 'winter_wheat', 'spring_barley', false).total[1];
    const springCatch = bareFor(coverModel, 'winter_wheat', 'spring_barley', true).total[1];
    expect(aug).toBeLessThan(sep); expect(springCatch).toBeLessThan(springOpen);
  });
  it('preceding-crop factors apply to cereals only', () => {
    expect(precropFactor('winter_wheat', 'winter_wheat')).toBeLessThan(1);
    expect(precropFactor('winter_wheat', 'peas')).toBeGreaterThan(1);
    expect(precropFactor('peas', 'winter_wheat')).toBe(1);
  });
  it('replays 19 seasons and flags the dry ones from IMERG', () => {
    const pre = prepare(makeContext(setup));
    expect(pre.seasons.length).toBe(19);
    expect(pre.types.filter(t => t === 'dry').length).toBeGreaterThanOrEqual(3);
    expect(pre.normal.winter_wheat.yieldTHa).toBeGreaterThan(3);
  });
});

describe('stage 5 and 7: search', () => {
  const r = search(makeContext(setup), { population: 60, generations: 30 });
  it('returns only variants that pass the farm rules', () => { expect(r.variants.length).toBeGreaterThan(3); expect(r.variants.every(v => v.ch.feasible)).toBe(true); });
  it('no returned variant is beaten on every comparison characteristic', () => {
    const obj = (v: (typeof r.variants)[number]) => AXES.map(a => a.sign * a.get(v.ch));
    for (const a of r.variants) for (const b of r.variants) if (a !== b) expect(obj(b).every((x, i) => x >= obj(a)[i]) && obj(b).some((x, i) => x > obj(a)[i])).toBe(false);
  });
  it('is reproducible with the same seed', () => {
    const again = search(makeContext(setup), { population: 60, generations: 30 });
    expect(again.variants.map(v => v.ch.marginMean)).toEqual(r.variants.map(v => v.ch.marginMean));
  });
  it('keeps what is already sown', () => { for (const v of r.variants) expect(v.options.find(o => o.fieldId === 'F1')!.crops[0]).toBe('winter_wheat'); });
});

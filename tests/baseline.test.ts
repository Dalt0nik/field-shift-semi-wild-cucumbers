// Usual practice from what farms around the pilot sow (docs/usual-practice.md): the statistical farmer.
import { describe, expect, it } from 'vitest';
import { AXES, search, shareBeaten } from '@/engine/search';
import { makeContext, makeSetup } from '@/pilot/demo';
import { FARMER_MODEL, farmerTransitions } from '@/pilot/farmers';
import { CROPS } from '@/pilot/regional';

// the search itself does not change the baseline, so a short search is enough here
const quick = { population: 20, generations: 2 };
const T = 60_000;
const ctx = makeContext(makeSetup({ decisionDate: '2026-08-01' }));
const r = search(ctx, quick);

describe('transition table', () => {
  it('gives probabilities that sum to 1 for every preceding class, and class splits that sum to 1', () => {
    for (const row of Object.values(FARMER_MODEL.p)) expect(Object.values(row).reduce((t, v) => t + v, 0)).toBeCloseTo(1, 2);
    for (const row of Object.values(FARMER_MODEL.share)) expect(Object.values(row).reduce((t, v) => t + v, 0)).toBeCloseTo(1, 3);
  });
  it('knows the class of every crop of the reference', () => {
    for (const id of Object.keys(CROPS)) expect(FARMER_MODEL.classOf[id]).toBeTruthy();
  });
  it('rests on the declarations around the pilot, which end before every supported decision day', () => {
    expect(farmerTransitions.matched.fields).toBeGreaterThan(5000);
    expect(farmerTransitions.dataUntil < '2026-07-01').toBe(true);
  });
});

describe('typical statistical farm', () => {
  it('uses only admissible options without catch crops and keeps what is fixed', () => {
    r.baseline.options.forEach((o, f) => {
      const fo = r.fieldOpts[f];
      expect(fo.options).toContain(o);
      expect(o.catchAfter.some(Boolean) || !!o.catchFirst).toBe(false);
    });
    expect(r.baseline.options.find(o => o.fieldId === 'F11')!.crops).toEqual(['perennial_grasses', 'perennial_grasses']);
  });
  it('passes the farm rules, as the farms it is drawn from', () => {
    expect(r.farmers.rulesPassed).toBe(true);
    expect(r.farmers.n).toBe(FARMER_MODEL.farms);
    expect(r.baseline.ch.feasible).toBe(true);
  });
  it('is the same for the same inputs, whatever the search does', () => {
    const again = search(ctx, { population: 30, generations: 3, seed: 7 });
    expect(again.baseline.options).toEqual(r.baseline.options);
  }, T);
  it('lies inside the band of the statistical farms on every axis', () => {
    for (const a of AXES) {
      const b = r.farmers.axes[a.key], v = a.get(r.baseline.ch);
      expect(b.p10).toBeLessThanOrEqual(b.p50); expect(b.p50).toBeLessThanOrEqual(b.p90);
      expect(v).toBeGreaterThanOrEqual(b.p10); expect(v).toBeLessThanOrEqual(b.p90);
    }
    for (const m of Object.values(r.farmers.keptMass)) { expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(1.000001); }
  });
  it('gives the reference values of docs/usual-practice.md on 1 August 2026', () => {
    const c = r.baseline.ch;
    expect([c.marginMean, c.marginWorstFifth, c.bareErosive.p50, Math.round(c.cerealAfterCereal * 100)]).toEqual([319, -129, 156, 38]);
  });
  it('is beaten by the highest-margin plan of the full search on margin by almost every statistical farm', () => {
    const full = search(ctx);
    const top = full.variants.find(v => v.tags.includes('best: margin, usual season'))!;
    expect(shareBeaten(full.farmers, 'marginMean', top.ch)).toBeGreaterThan(0.9);
  }, T);
  it('follows the table: with "always winter wheat" every field that can take it gets it', () => {
    const p = Object.fromEntries(Object.keys(FARMER_MODEL.p).map(i => [i, { winter_cereals: 1 }]));
    const one = search({ ...ctx, usual: { ...FARMER_MODEL, p, share: { ...FARMER_MODEL.share, winter_cereals: { winter_wheat: 1 } } } }, quick);
    one.baseline.options.forEach((o, f) => {
      const allWheat = (x: typeof o) => x.crops.every((c, i) => x.fixed[i] || c === 'winter_wheat') && !x.catchAfter.some(Boolean) && !x.catchFirst;
      if (one.fieldOpts[f].options.some(allWheat)) expect(allWheat(o)).toBe(true);
    });
  }, T);
});

// Money steps on the pilot: field index (NASA HLS) and wet-harvest loss (NASA IMERG).
import { describe, expect, it } from 'vitest';
import { fieldFactor, optionPart, prepare, wetHarvestLoss } from '@/engine/characteristics';
import { fieldIndex, fields, makeContext, makeSetup } from '@/pilot/demo';
import { WET_HARVEST } from '@/pilot/economics';
import { search } from '@/engine/search';

const ctx = makeContext(makeSetup());

describe('field index', () => {
  it('gives the pilot values', () => {
    expect(fieldFactor(ctx, 'F12', 'winter_wheat')).toBeCloseTo(0.813, 3);
    expect(fieldFactor(ctx, 'F5', 'winter_rapeseed')).toBeCloseTo(1.115, 3);
  });
  it('is 1 for a field without index seasons and for crops without a group', () => {
    expect(fieldFactor(ctx, 'F11', 'winter_wheat')).toBe(1);
    expect(fieldFactor(ctx, 'F5', 'sugar_beet')).toBe(1);
    expect(fieldFactor(ctx, 'F5', 'perennial_grasses')).toBe(1);
  });
  it('stays within the cap for every field and crop', () => {
    for (const f of Object.keys(fieldIndex.fields)) for (const c of ctx.setup.cropSet) {
      const v = fieldFactor(ctx, f, c);
      expect(v).toBeGreaterThanOrEqual(0.8); expect(v).toBeLessThanOrEqual(1.2);
    }
  });
  it('is switched off by moneySteps', () => { expect(fieldFactor({ ...ctx, moneySteps: { fieldIndex: false } }, 'F12', 'winter_wheat')).toBe(1); });
});

describe('wet harvest', () => {
  it('flags 2006, 2007, 2010 and 2011 from IMERG harvest rain', () => {
    const pre = prepare(ctx);
    expect(pre.seasons.filter((_, i) => pre.wet[i])).toEqual([2006, 2007, 2010, 2011]);
  });
  it('costs wheat about 162 EUR/ha at the normal yield and revenue, nothing for beet or grass', () => {
    expect(wetHarvestLoss(WET_HARVEST, 'winter_wheat', 5.73, 1456)).toBeCloseTo(162.0, 0);
    expect(wetHarvestLoss(WET_HARVEST, 'sugar_beet', 70, 2800)).toBe(0);
    expect(wetHarvestLoss(WET_HARVEST, 'perennial_grasses', 5, 0)).toBe(0);
  });
});

describe('money of a field and of the farm', () => {
  it('reproduces the worked example: F2, faba bean then winter wheat, season 2006', () => {
    const pre = prepare(ctx);
    const f2 = fields.find(f => f.id === 'F2')!;
    const p = optionPart(pre, f2, { fieldId: 'F2', crops: ['faba_bean', 'winter_wheat'], catchAfter: [false, false], fixed: [false, false], warnings: [] } as any);
    expect(p.margin[pre.seasons.indexOf(2006)] / f2.areaHa).toBeCloseTo(445.7, -0.5);
  });
  it('gives the earlier numbers with both steps off, and the wet-harvest numbers with the field index off', () => {
    const off = search({ ...ctx, moneySteps: { fieldIndex: false, wetHarvest: false } }).baseline.ch;
    expect([off.marginMean, off.marginWorstFifth, off.marginWetHarvest]).toEqual([910, 400, 792]);
    const wh = search({ ...ctx, moneySteps: { fieldIndex: false } }).baseline.ch;
    expect([wh.marginMean, wh.marginWorstFifth, wh.marginWetHarvest]).toEqual([887, 383, 676]);
  });
});

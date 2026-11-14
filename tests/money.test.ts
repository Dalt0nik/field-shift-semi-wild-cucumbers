// Money steps on the pilot: field index (NASA HLS) and wet-harvest loss (NASA IMERG).
import { describe, expect, it } from 'vitest';
import { characteristics, fieldFactor, optionPart, prepare, wetHarvestLoss, type Context } from '@/engine/characteristics';
import { fieldIndex, fields, makeContext, makeSetup } from '@/pilot/demo';
import { FARM_COSTS_EUR_HA, WET_HARVEST, redistributivePerHa } from '@/pilot/economics';
import type { FieldOption } from '@/engine/types';

// Reference set-up of docs/money.md, section 9: the decision day 14 November 2026, with the autumn sowing in the ground.
const ctx = makeContext(makeSetup({ decisionDate: '2026-11-14' }));

// The plan the reference values of docs/money.md were computed on: usual practice of 14 November as it was before it
// came from the declarations (the hand-written wheat and rapeseed habit). Kept fixed here, so the test checks the money
// steps and not how usual practice is chosen.
const HABIT_14_NOV: FieldOption[] = ([
  ['F1', 'winter_wheat', 'winter_rapeseed', true], ['F2', 'spring_wheat', 'winter_wheat', false], ['F3', 'winter_rapeseed', 'winter_wheat', true],
  ['F4', 'winter_wheat', 'winter_rapeseed', true], ['F5', 'winter_wheat', 'winter_wheat', true], ['F6', 'winter_wheat', 'winter_rapeseed', true],
  ['F7', 'spring_wheat', 'winter_wheat', false], ['F8', 'winter_rapeseed', 'winter_wheat', true], ['F9', 'spring_wheat', 'winter_wheat', false],
  ['F10', 'spring_wheat', 'winter_wheat', false], ['F11', 'perennial_grasses', 'perennial_grasses', true], ['F12', 'winter_wheat', 'winter_rapeseed', true],
] as const).map(([fieldId, a, b, sown]) => ({ fieldId, crops: [a, b], catchAfter: [false], fixed: [sown, fieldId === 'F11'], warnings: [] }));
const habitMoney = (c: Context) => {
  const pre = prepare(c);
  return characteristics(pre, HABIT_14_NOV, HABIT_14_NOV.map(o => optionPart(pre, fields.find(f => f.id === o.fieldId)!, o)));
};

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
    expect(p.margin[pre.seasons.indexOf(2006)] / f2.areaHa).toBeCloseTo(63.5, -0.5);
  });
  it('gives the earlier numbers with both steps off, and the wet-harvest numbers with the field index off (gross margin)', () => {
    const off = habitMoney({ ...ctx, moneySteps: { fieldIndex: false, wetHarvest: false, farmLevel: false } });
    expect([off.marginMean, off.marginWorstFifth, off.marginWetHarvest]).toEqual([821, 342, 743]);
    const wh = habitMoney({ ...ctx, moneySteps: { fieldIndex: false, farmLevel: false } });
    expect([wh.marginMean, wh.marginWorstFifth, wh.marginWetHarvest]).toEqual([799, 326, 632]);
    const both = habitMoney({ ...ctx, moneySteps: { farmLevel: false } });
    expect([both.marginMean, both.marginWorstFifth, both.marginWetHarvest]).toEqual([838, 350, 666]);
  });
  it('takes the farm costs (Lithuanian FADN 2024) and the redistributive payment off every season alike', () => {
    const gross = habitMoney({ ...ctx, moneySteps: { farmLevel: false } }), net = habitMoney(ctx);
    expect(FARM_COSTS_EUR_HA).toBe(491);
    expect(redistributivePerHa(fields.reduce((t, f) => t + f.areaHa, 0))).toBeCloseTo(45.97, 2);
    expect([net.marginMean, net.marginWorstFifth, net.marginWetHarvest]).toEqual([393, -95, 221]);
    gross.marginSeries.forEach((s, i) => expect(Math.abs(net.marginSeries[i].margin - (s.margin - 491 + 45.97))).toBeLessThanOrEqual(1));
  });
});

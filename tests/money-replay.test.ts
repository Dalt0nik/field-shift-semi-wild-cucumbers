// The replay of past seasons keeps today's level, never treats missing data as an ordinary season, and forecasts the
// revenue of later harvests without bias (rolling check on the district data, the app's information lag).
import { describe, expect, it } from 'vitest';
import { prepare, type Context } from '@/engine/characteristics';
import { makeContext, makeSetup } from '@/pilot/demo';

const ctx = makeContext(makeSetup({ decisionDate: '2026-11-14' }));
const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
const PLANNED = ['winter_wheat', 'winter_barley', 'triticale', 'winter_rapeseed', 'spring_wheat', 'spring_barley', 'oats', 'peas', 'faba_bean'];

describe('replay of past seasons', () => {
  const pre = prepare(ctx);
  it('keeps the normal level: the yield deviations of every crop average 1', () => {
    for (const c of Object.keys(pre.yieldDev)) expect(mean(pre.yieldDev[c])).toBeCloseTo(1, 9);
  });
  it('keeps the joint move of price and yield within a few per cent of the normal revenue', () => {
    for (const c of PLANNED) { const n = pre.normal[c]; expect(Math.abs(mean(pre.revenue[c]) / (n.yieldTHa * n.priceEurT) - 1)).toBeLessThan(0.05); }
  });
  it('does not turn the 2006 drought into an ordinary season for legumes (data from 2003)', () => {
    const i = pre.seasons.indexOf(2006);
    expect(pre.yieldDev.faba_bean[i]).toBeLessThan(0.4);
    expect(pre.yieldDev.peas[i]).toBeLessThan(0.6);
  });
  it('counts the seasons that had to borrow a deviation', () => {
    for (const c of PLANNED) expect(pre.normal[c].seasonsUsed + pre.normal[c].seasonsFilled).toBe(pre.seasons.length);
    expect(pre.normal.faba_bean.seasonsFilled).toBe(0);
  });
});

describe('rolling forecast of district revenue, harvests 2014-2025', () => {
  it('has no systematic bias (within 3 %)', () => {
    const econ = ctx.econ.crops; const logErr: number[] = [];
    for (let T = 2014; T <= 2025; T++) {
      // what the app knew in the autumn before sowing for harvest T: yields to T-2, prices to T-3
      const c: Context = { ...ctx, replay: { firstSeason: 2006, lastSeason: T - 3, normalYieldYears: [6, 5, 4, 3, 2].map(d => T - d), normalPriceYears: [7, 6, 5, 4, 3].map(d => T - d) } };
      const p = prepare(c);
      for (const crop of PLANNED) {
        const y = econ[crop].yieldTHa[String(T)], pr = econ[crop].priceEurT[String(T)];
        if (y === undefined || pr === undefined) continue;
        logErr.push(Math.log(mean(p.revenue[crop]) / (y * pr)));
      }
    }
    expect(logErr.length).toBeGreaterThan(90);
    expect(Math.abs(Math.exp(mean(logErr)) - 1)).toBeLessThan(0.03);
  });
});

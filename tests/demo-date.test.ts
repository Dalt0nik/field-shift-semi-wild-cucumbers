// Everything that depends on the decision day of the demo must stay valid when the day changes, and the plan may
// use only data from before it (no hindsight).
import { describe, expect, it, vi } from 'vitest';
import { workspace } from '@/engine/editor';
import { checkCandidate, baseTimeline } from '@/engine/plan';
import { search } from '@/engine/search';
import { DECISION_DATE, DECISION_YEAR, PLAN_DATA, PLAN_YEARS, REPLAY, SUPPORTED_DAYS, afterDecision, currentAt, fieldIndexAt, fieldIndexSeasonEnd, fields, fieldsWith, makeContext, makeSetup, sowableBy, standing } from '@/pilot/demo';
import { CROPS } from '@/pilot/regional';
import fieldIndexFile from '@/data/field-index.json';

const DAYS = ['2026-07-01', '2026-07-15', '2026-08-01', '2026-08-20', '2026-09-01', '2026-09-20', '2026-10-15', '2026-11-14', '2026-12-31'];

describe('the decision day of the demo', () => {
  it('lies in the supported range and sets the plan years', () => {
    expect(DECISION_DATE >= SUPPORTED_DAYS.from && DECISION_DATE <= SUPPORTED_DAYS.to).toBe(true);
    expect(PLAN_YEARS).toEqual([DECISION_YEAR + 1, DECISION_YEAR + 2]);
    expect(Math.max(...REPLAY.normalYieldYears)).toBeLessThan(DECISION_YEAR);
    expect(REPLAY.lastSeason).toBeLessThan(DECISION_YEAR);
  });
  it('no dataset behind the plan runs past the decision day', () => {
    for (const d of PLAN_DATA) expect(afterDecision(d.until), `${d.label} runs to ${d.until}`).toBe(false);
  });
  it('a day outside the supported range stops the app with an explanation', async () => {
    vi.resetModules(); vi.stubEnv('NEXT_PUBLIC_DECISION_DATE', '2027-06-01');
    await expect(import('@/pilot/demo')).rejects.toThrow(/outside 2026-07-01/);
    vi.unstubAllEnvs(); vi.resetModules();
  });
});

describe.each(DAYS)('decision day %s', day => {
  const setup = makeSetup({ decisionDate: day });
  const ctx = makeContext(setup);
  it('the field index uses only seasons whose peak window had closed', () => {
    const fi = fieldIndexAt(day);
    for (const s of fi.seasons) expect(fieldIndexSeasonEnd(s) <= day).toBe(true);
    for (const f of Object.values(fi.fields)) { expect(Object.keys(f.d).length).toBe(f.k); for (const s of Object.keys(f.d)) expect(fieldIndexSeasonEnd(s) <= day).toBe(true); }
    expect(ctx.fieldIndex!.fields).toEqual(fi.fields);
  });
  it('only crops whose sowing window is over count as in the ground; grass stays', () => {
    const cur = currentAt(day);
    for (const [f, c] of Object.entries(cur)) {
      if (!c) continue;
      if (CROPS[c].season === 'perennial') continue;
      expect(`${DECISION_YEAR}-${CROPS[c].sowing.to}` <= day, `${f} ${c}`).toBe(true);
    }
    expect(cur.F11).toBe('perennial_grasses');
    for (const c of sowableBy(day)) expect(`${DECISION_YEAR}-${CROPS[c].sowing.from}` <= day).toBe(true);
  });
  it('nothing is planned to be sown before the decision day, and a catch crop for this autumn only while it can still be sown', () => {
    const ws = workspace(ctx);
    for (const fc of ws.fields) {
      expect(fc.options.length).toBeGreaterThan(0);
      const tl = baseTimeline(fc.field, setup);
      for (const o of fc.options) {
        if (!o.fixed[0]) expect(checkCandidate(fc.field, tl, o.crops[0], setup.planYears[0], setup).occupancy!.sow >= day).toBe(true);
        if (o.catchFirst) expect(day <= `${DECISION_YEAR}-09-05`).toBe(true);
      }
    }
  });
  it('the search finds plans that pass the farm rules, with a Best-for-soil plan among them', () => {
    const r = search(ctx, { population: 50, generations: 20 });
    expect(r.variants.length).toBeGreaterThan(3);
    expect(r.variants.every(v => v.ch.feasible)).toBe(true);
    const best = r.variants.find(v => v.tags.includes('best: soil'))!;
    expect(best.ch.bareErosive.p50).toBeLessThanOrEqual(r.baseline.ch.bareErosive.p50);
    for (const v of [r.baseline, ...r.variants]) for (const o of v.options) expect(o.crops.length).toBe(2);
  });
});

describe('field index by decision day', () => {
  it('with every season kept it is the prepared input, unchanged', () => {
    expect(fieldIndexAt('2026-12-31').fields).toEqual((fieldIndexFile as any).fields);
    expect(fieldIndexAt('2026-08-01').seasons).toEqual([2021, 2024, 2025, 2026]);
  });
  it('before the 2026 peak window closes, the 2026 season is left out and the reliability falls', () => {
    const jul = fieldIndexAt('2026-07-15'), all = fieldIndexAt('2026-08-01');
    expect(jul.seasons).toEqual([2021, 2024, 2025]);
    expect(jul.fields.F1.k).toBe(all.fields.F1.k - 1);
    expect(jul.fields.F1.reliability).toBeLessThan(all.fields.F1.reliability);
    // Spearman-Brown with rho = 0.34: two seasons -> 0.507
    expect(jul.fields.F1.reliability).toBeCloseTo((2 * 0.34) / (1 + 0.34), 3);
    expect(jul.fields.F1.dShrunk).toBeCloseTo(((0.0164 + 0.0014) / 2) * jul.fields.F1.reliability, 4);
  });
});

describe('stage 2 on the decision day', () => {
  it('tells what the crop of the year is doing from its harvest window', () => {
    expect(standing('winter_rapeseed', '2026-08-01').state).toBe('harvested');
    expect(standing('winter_wheat', '2026-08-01').state).toBe('harvest');
    expect(standing('faba_bean', '2026-08-01').state).toBe('standing');
    expect(standing('perennial_grasses', '2026-08-01').state).toBe('stays');
    expect(standing('winter_wheat', '2026-11-14').state).toBe('harvested');
    expect(standing(null).state).toBe('unknown');
  });
  it('a corrected crop of the decision year changes what can follow', () => {
    const f = fieldsWith({ F2: 'winter_wheat' }).find(x => x.id === 'F2')!;
    expect(f.history[DECISION_YEAR].crop).toBe('winter_wheat');
    expect(f.history[DECISION_YEAR].source).toMatch(/agronomist/);
    expect(fields.find(x => x.id === 'F2')!.history[DECISION_YEAR].crop).toBe('winter_rapeseed'); // the base is untouched
    expect(fieldsWith({}).length).toBe(fields.length);
  });
});

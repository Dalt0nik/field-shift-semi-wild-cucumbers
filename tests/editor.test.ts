// The agronomist's own plan must be measured exactly like a variant of the search, and only admissible crops can be picked.
import { describe, expect, it } from 'vitest';
import { makeContext } from '../src/pilot/demo';
import { evaluatePlan, pickCrop, selectionOf, workspace, yearChoices } from '../src/engine/editor';
import { fiveAnswers, planDiff } from '../src/engine/explain';
import { search } from '../src/engine/search';

const ctx = makeContext();
const ws = workspace(ctx);
const found = search(ctx, { population: 40, generations: 12 });

describe('own plan', () => {
  it('gets the same characteristics as the same variant from the search', () => {
    const v = found.variants[0];
    const mine = evaluatePlan(ws, selectionOf(v.options), 'my1', 'My plan');
    expect(mine.adjusted).toEqual([]);
    expect(mine.ch.marginMean).toBe(v.ch.marginMean);
    expect(mine.ch.bareDays).toEqual(v.ch.bareDays);
    expect(mine.ch.rules.map(r => r.ok)).toEqual(v.ch.rules.map(r => r.ok));
  });

  it('locks fields that are already sown and offers reasons for the rest', () => {
    const sel = selectionOf(found.baseline.options);
    const sown = ctx.fields.find(f => ctx.setup.current[f.id])!, free = ctx.fields.find(f => !ctx.setup.current[f.id])!;
    expect(yearChoices(ws, sown.id, sel, 0).locked).toBe(true);
    const c = yearChoices(ws, free.id, sel, 0);
    expect(c.locked).toBe(false);
    expect(c.items.some(i => i.status !== 'no')).toBe(true);
    for (const i of c.items.filter(x => x.status === 'no')) expect(i.notes.length).toBeGreaterThan(0);
  });

  it('keeps the selection admissible after a crop is changed', () => {
    const sel = selectionOf(found.baseline.options);
    const free = ctx.fields.find(f => !ctx.setup.current[f.id])!;
    const pickable = yearChoices(ws, free.id, sel, 0).items.filter(i => i.status !== 'no' && i.crop !== sel[free.id].crops[0]);
    expect(pickable.length).toBeGreaterThan(0);
    const next = pickCrop(ws, sel, free.id, 0, pickable[0].crop);
    expect(next[free.id].crops[0]).toBe(pickable[0].crop);
    expect(evaluatePlan(ws, next, 'my2', 'My plan').adjusted).toEqual([]);
    // a crop that is not admissible leaves the selection as it was
    const banned = yearChoices(ws, free.id, sel, 0).items.find(i => i.status === 'no');
    if (banned) expect(pickCrop(ws, sel, free.id, 0, banned.crop)).toBe(sel);
  });

  it('explains a plan and the difference between two plans from engine numbers', () => {
    const v = found.variants[0];
    const five = fiveAnswers(v, found.baseline, ws);
    for (const k of ['why', 'evidence', 'benefits', 'gaps', 'risks'] as const) expect(five[k].length).toBeGreaterThan(20);
    const d = planDiff(found.baseline, v, ws);
    expect(d.length).toBe(v.options.filter((o, i) => o.crops.join() !== found.baseline.options[i].crops.join() || o.catchAfter.join() !== found.baseline.options[i].catchAfter.join()).length);
  });
});

// The agronomist's own plan (archive design, "agronomist builds their own plan"; challenge R8: support, not replace).
// A plan is a selection: for each field the main crop of every plan year and the catch crops between them. Only
// admissible sequences can be selected (the same stage-4 checks as the search), and a selection is evaluated with
// exactly the same stage-6 characteristics as the variants the search finds.
import { characteristics, optionPart, prepare, type Context, type OptionPart, type Prepared } from './characteristics';
import { baseTimeline, catchCropFits, checkCandidate, fieldOptions } from './plan';
import { CROPS } from '../pilot/regional';
import type { CropId, EvaluatedVariant, FieldInfo, FieldOption, Occupancy } from './types';

export interface FieldChoices {
  field: FieldInfo;
  options: FieldOption[];
  parts: OptionPart[];
  rejected: { year: number; crop: CropId; after: CropId | null; reasons: string[] }[];
}
export interface Workspace { ctx: Context; pre: Prepared; fields: FieldChoices[]; totalHa: number }

/** Everything that is needed to evaluate any plan of the current set-up: economics replay and per-field options. */
export function workspace(ctx: Context): Workspace {
  const pre = prepare(ctx);
  const fields = ctx.fields.map(f => { const fo = fieldOptions(f, ctx.setup); return { field: f, options: fo.options, rejected: fo.rejected, parts: fo.options.map(o => optionPart(pre, f, o)) }; });
  return { ctx, pre, fields, totalHa: pre.totalHa };
}

/** Field-level parts of stage 6 for the options of a plan (null when an option is no longer admissible in this set-up). */
export function partsOf(ws: Workspace, options: FieldOption[]): (OptionPart | null)[] {
  return ws.fields.map((fc, i) => { const o = options[i]; const k = o ? fc.options.findIndex(x => x.crops.join() === o.crops.join() && x.catchAfter.join() === o.catchAfter.join()) : -1; return k < 0 ? null : fc.parts[k]; });
}

export type Selection =Record<string, { crops: CropId[]; catchAfter: boolean[] }>;
export const selectionOf = (options: FieldOption[]): Selection => Object.fromEntries(options.map(o => [o.fieldId, { crops: [...o.crops], catchAfter: [...o.catchAfter] }]));

const same = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((v, i) => v === b[i]);
/** Index of the admissible option closest to a selection (exact when the selection is still admissible). */
function nearest(fc: FieldChoices, want: { crops: CropId[]; catchAfter: boolean[] } | undefined): { k: number; exact: boolean } {
  if (!fc.options.length) return { k: -1, exact: false };
  if (!want) return { k: 0, exact: false };
  let best = 0, bestScore = -1;
  fc.options.forEach((o, k) => {
    let s = 0;
    for (let i = 0; i < o.crops.length; i++) { if (o.crops[i] !== want.crops[i]) break; s += 10; } // longest common prefix first
    o.crops.forEach((c, i) => { if (c === want.crops[i]) s += 2; });
    o.catchAfter.forEach((c, i) => { if (c === !!want.catchAfter[i]) s += 1; });
    if (s > bestScore) { bestScore = s; best = k; }
  });
  const o = fc.options[best];
  return { k: best, exact: same(o.crops, want.crops) && same(o.catchAfter, want.catchAfter.slice(0, o.catchAfter.length).map(Boolean)) };
}

export interface EvaluatedPlan extends EvaluatedVariant { adjusted: string[] }
/** Stage 6 for a selection. Fields whose selection is no longer admissible (the set-up changed) fall back to the nearest option. */
export function evaluatePlan(ws: Workspace, sel: Selection, id: string, label: string): EvaluatedPlan {
  const adjusted: string[] = [];
  const idx = ws.fields.map(fc => { const n = nearest(fc, sel[fc.field.id]); if (!n.exact) adjusted.push(fc.field.id); return Math.max(0, n.k); });
  const options = idx.map((k, f) => ws.fields[f].options[k]);
  const ch = characteristics(ws.pre, options, idx.map((k, f) => ws.fields[f].parts[k]));
  return { id, label, options, origin: 'agronomist', ch, tags: [], adjusted };
}

export interface CropStatus { crop: CropId; status: 'ok' | 'warn' | 'no'; notes: string[]; catchPossible: boolean }
export interface YearChoices { year: number; locked: boolean; lockReason?: string; chosen: CropId; catchBefore: boolean; items: CropStatus[] }

/** For one field and one plan year: every crop of the crop set with its status and the reason, given the crops chosen for earlier years. */
export function yearChoices(ws: Workspace, fieldId: string, sel: Selection, i: number): YearChoices {
  const { setup } = ws.ctx;
  const fc = ws.fields.find(x => x.field.id === fieldId)!;
  const cur = fc.options[nearest(fc, sel[fieldId]).k];
  const year = setup.planYears[i];
  const chosen = cur.crops[i], catchBefore = i > 0 && !!cur.catchAfter[i - 1];
  if (i === 0 && setup.current[fieldId]) return { year, locked: true, lockReason: `already sown for ${year}`, chosen, catchBefore, items: [] };
  const prevCrop = i > 0 ? cur.crops[i - 1] : null;
  if (prevCrop && CROPS[prevCrop]?.season === 'perennial') return { year, locked: true, lockReason: 'perennial grass stays', chosen, catchBefore, items: [] };
  // timeline so far: history, what grows now, and the crops chosen for earlier plan years
  let timeline: Occupancy[] = baseTimeline(fc.field, setup);
  for (let j = 0; j < i; j++) {
    if (j === 0 && setup.current[fieldId]) continue;
    const chk = checkCandidate(fc.field, timeline, cur.crops[j], setup.planYears[j], setup);
    if (chk.occupancy) timeline = [...timeline, chk.occupancy];
  }
  const prefix = cur.crops.slice(0, i);
  const items: CropStatus[] = [];
  for (const id of setup.cropSet) {
    if (CROPS[id]?.season === 'perennial') continue;
    const chk = checkCandidate(fc.field, timeline, id, year, setup);
    const hasOption = fc.options.some(o => same(o.crops.slice(0, i), prefix) && o.crops[i] === id);
    const notes = chk.ok ? [...chk.warnings] : [...chk.reasons];
    if (chk.ok && !hasOption) notes.unshift(`no admissible crop could follow it in ${setup.planYears[i + 1] ?? year + 1}`);
    items.push({ crop: id, status: !chk.ok || !hasOption ? 'no' : chk.warnings.length ? 'warn' : 'ok', notes, catchPossible: i > 0 && setup.catchCrops && !!prevCrop && catchCropFits(prevCrop, id) });
  }
  const order = { ok: 0, warn: 1, no: 2 };
  items.sort((a, b) => order[a.status] - order[b.status]);
  return { year, locked: false, chosen, catchBefore, items };
}

/** Change the crop of one plan year on one field; later years keep their crops when that stays admissible. */
export function pickCrop(ws: Workspace, sel: Selection, fieldId: string, i: number, cropId: CropId, catchBefore?: boolean): Selection {
  const fc = ws.fields.find(x => x.field.id === fieldId)!;
  const cur = fc.options[nearest(fc, sel[fieldId]).k];
  const want = { crops: [...cur.crops.slice(0, i), cropId, ...cur.crops.slice(i + 1)], catchAfter: [...cur.catchAfter] };
  if (i > 0 && catchBefore !== undefined) want.catchAfter[i - 1] = catchBefore;
  const cands = fc.options.filter(o => same(o.crops.slice(0, i + 1), want.crops.slice(0, i + 1)));
  if (!cands.length) return sel;
  const n = nearest({ ...fc, options: cands }, want);
  const o = cands[n.k];
  return { ...sel, [fieldId]: { crops: [...o.crops], catchAfter: [...o.catchAfter] } };
}

// Stages 2-4 of the framework: decision point, slot search, candidates.
//  stage 2: what occupies each field now and until when (agronomist input)
//  stage 3: field timeline = occupied gaps (history, current, plan) and the free slots up to the plan horizon
//  stage 4: a crop becomes a candidate for a slot if (1) its sowing is not earlier than the harvest of the preceding crop,
//           (2) the sowing window falls within the slot, (3) the harvest ends before the next occupied gap,
//           (4) no field rule prohibits it, (5) it is in the plan's crop set and not excluded on the field.
import { CLASS_INFO, CROPS, crop, matches } from '../pilot/regional';
import { gaec5Forbids } from '../pilot/rules';
import type { CandidateCheck, CropId, FieldInfo, FieldOption, Occupancy, Slot } from './types';

export const PREP_DAYS = 10; // days between a harvest and the next sowing (team parameter)
export const LATE_DAYS = 10; // sowing later than the optimal window by up to this many days is allowed with a warning

export interface PlanSetup {
  decisionDate: string; // ISO day
  planYears: number[]; // harvest years of the plan, e.g. [2027, 2028]
  cropSet: CropId[];
  /** crops excluded on specific fields by the agronomist */
  excluded: Record<string, CropId[]>;
  /** stage 2: what grows now (sown for the first plan year), per field; null = free */
  current: Record<string, CropId | null>;
  catchCrops: boolean;
}

const day = (iso: string) => Date.parse(iso + 'T00:00:00Z') / 864e5;
const iso = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(day(s) + n);
const ymd = (year: number, md: string) => `${year}-${md}`;
/** Dates in messages are read by an agronomist: "10 Oct 2026", not "2026-10-10". */
const nice = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plain = (s: string) => s.replace(/_/g, ' ');

/** Dates of a crop grown for a given harvest year, from the regional package windows. */
export function occupancyFor(cropId: CropId, harvestYear: number, source: Occupancy['source']): Occupancy | null {
  const c = CROPS[cropId];
  if (!c) return null;
  if (c.season === 'perennial') return { crop: cropId, sow: `${harvestYear}-01-01`, harvest: `${harvestYear}-12-31`, harvestYear, source, kind: 'main' };
  if (!c.sowing.from || !c.harvest.to) return null;
  const sowYear = c.season === 'winter' ? harvestYear - 1 : harvestYear;
  return { crop: cropId, sow: ymd(sowYear, c.sowing.from), harvest: ymd(harvestYear, c.harvest.to), harvestYear, source, kind: 'main' };
}

/** Stage 3: the past and present of a field as occupied gaps. Class-only history takes the dates of a member crop. */
export function baseTimeline(f: FieldInfo, setup: PlanSetup): Occupancy[] {
  const out: Occupancy[] = [];
  for (const y of Object.keys(f.history).map(Number).sort()) {
    const h = f.history[y];
    const id = h.crop ?? (h.cropClass ? CLASS_INFO[h.cropClass]?.members[0] : null);
    if (!id) continue;
    const o = occupancyFor(id, y, 'history');
    if (o) out.push({ ...o, crop: h.crop ?? h.cropClass ?? id, note: h.crop ? undefined : 'crop class only' });
  }
  const cur = setup.current[f.id];
  if (cur) { const o = occupancyFor(cur, setup.planYears[0], 'current'); if (o) out.push(o); }
  return out;
}

/** Stage 3: free gaps between the decision date and the end of the plan horizon. */
export function slots(f: FieldInfo, timeline: Occupancy[], setup: PlanSetup): Slot[] {
  const end = `${setup.planYears[setup.planYears.length - 1]}-12-31`;
  const occ = timeline.filter(o => o.kind === 'main' && o.harvest >= setup.decisionDate).sort((a, b) => a.sow.localeCompare(b.sow));
  const res: Slot[] = [];
  let cursor = setup.decisionDate;
  let after: Occupancy | null = [...timeline].filter(o => o.kind === 'main' && o.harvest < setup.decisionDate).sort((a, b) => a.harvest.localeCompare(b.harvest)).pop() ?? null;
  for (const o of occ) {
    if (o.sow > cursor) res.push({ fieldId: f.id, from: cursor, to: o.sow, after });
    if (o.harvest > cursor) cursor = o.harvest;
    after = o;
  }
  if (cursor < end) res.push({ fieldId: f.id, from: cursor, to: end, after });
  return res;
}

const familyOf = (id: string) => CROPS[id]?.family ?? CLASS_INFO[id]?.family ?? 'other';
/** Does a past crop (species id or class id) match a rule reference? Class-only history matches if any member matches. */
function pastMatches(pastId: string, ref: string): boolean {
  if (CROPS[pastId]) return matches(pastId, ref === 'self' ? pastId : ref);
  const cls = CLASS_INFO[pastId];
  return !!cls && cls.members.some(m => matches(m, ref));
}

/** Stage 4: admission of one crop for one harvest year on a field, given the timeline so far. */
export function checkCandidate(f: FieldInfo, timeline: Occupancy[], cropId: CropId, harvestYear: number, setup: PlanSetup): CandidateCheck & { occupancy?: Occupancy } {
  const reasons: string[] = [], warnings: string[] = [];
  const c = crop(cropId);
  if (!setup.cropSet.includes(cropId)) reasons.push('not in the crop set of the plan');
  if (setup.excluded[f.id]?.includes(cropId)) reasons.push('excluded on this field by the agronomist');
  const o = occupancyFor(cropId, harvestYear, 'plan');
  if (!o) return { ok: false, unknown: true, reasons: ['sowing or harvest window unknown in the regional package'], warnings };
  const mains = timeline.filter(t => t.kind === 'main').sort((a, b) => a.harvest.localeCompare(b.harvest));
  const prev = [...mains].filter(t => t.harvest <= o.harvest && t.harvestYear < harvestYear).pop() ?? null;
  const next = mains.find(t => t.harvestYear > harvestYear) ?? null;
  // (1) and (2): sowing after the preceding harvest and inside the window.
  // The field counts as free from the START of the preceding crop's harvest window plus preparation days (rule D1 of
  // the crop reference). If only an early harvest makes the sowing possible, the candidate carries a warning.
  const prevC = prev ? CROPS[prev.crop] : undefined;
  const prevFree = !prev || prevC?.season === 'perennial' ? o.sow : addDays(prevC?.harvest.from ? ymd(prev.harvestYear, prevC.harvest.from) : prev.harvest, PREP_DAYS);
  const earliest = [o.sow, prevFree, setup.decisionDate].sort().pop()!;
  const windowEnd = ymd(+o.sow.slice(0, 4), c.sowing.to!);
  const latest = c.sowing.latest ? ymd(+o.sow.slice(0, 4), c.sowing.latest) : addDays(windowEnd, LATE_DAYS);
  if (earliest > latest) {
    reasons.push(earliest === setup.decisionDate
      ? `sowing window closed: it had to be sown by ${nice(latest)}`
      : `sowing window closed: the field is free only from ${nice(earliest)}, sowing ends ${nice(latest)}`);
  } else if (earliest > windowEnd) warnings.push(`late sowing: the field is free from ${nice(earliest)}, the best window ends ${nice(windowEnd)}`);
  else if (prev && prevC && prevC.season !== 'perennial' && addDays(prev.harvest, PREP_DAYS) > latest) warnings.push(`needs an early harvest of ${prevC.name.toLowerCase()}: its harvest can run to ${nice(prev.harvest)}`);
  o.sow = earliest > o.sow ? earliest : o.sow;
  // (3) harvest before the next occupied gap
  if (next && o.harvest > next.sow) reasons.push(`its harvest (${nice(o.harvest)}) runs into the next crop, sown ${nice(next.sow)}`);
  // (4) field rules: preceding crop, return interval, regulatory prohibitions
  if (prev) {
    for (const r of c.previous.bad) if (pastMatches(prev.crop, r.ref)) (r.severity === 'hard' ? reasons : warnings).push(`after ${plain(prev.crop)}: ${(r.reason || 'not recommended').replace(/\bIKOK /g, '')} (crop guide)`);
  }
  if (c.returnInterval?.min) {
    const scope = c.returnInterval.scope === 'self' ? cropId : c.returnInterval.scope;
    const last = [...mains].filter(t => t.harvestYear < harvestYear && pastMatches(t.crop, scope)).pop();
    if (last && harvestYear - last.harvestYear < c.returnInterval.min) {
      const gap = harvestYear - last.harvestYear;
      const msg = `${scope === cropId ? 'the same crop' : plain(scope)} grew here ${gap === 1 ? 'the year before' : `${gap} years before`}; the crop guide advises ${c.returnInterval.min} years between`;
      // cereals after cereals are common practice in Lithuania (declarations 2021-2025): a warning, not a ban
      (c.family === 'cereal' ? warnings : reasons).push(msg);
    }
  }
  if (gaec5Forbids(cropId, f.erosionShare)) reasons.push(`root crops are not allowed on erosion-sensitive land (${(f.erosionShare * 100).toFixed(0)} % of this field is in the official layer)`);
  return { ok: reasons.length === 0, reasons, warnings, occupancy: o };
}

/** A catch crop fits after a crop harvested by early September and before a spring-sown crop. */
export function catchCropFits(prevCrop: CropId, nextCrop: CropId): boolean {
  const p = CROPS[prevCrop], n = CROPS[nextCrop];
  return !!p && !!n && p.season !== 'perennial' && n.season === 'spring' && !!p.harvest.to && p.harvest.to <= '09-05';
}

/** All admissible choices for one field over the plan years (the per-field part of stage 5). */
export function fieldOptions(f: FieldInfo, setup: PlanSetup): { options: FieldOption[]; rejected: { year: number; crop: CropId; after: CropId | null; reasons: string[] }[] } {
  const base = baseTimeline(f, setup);
  const rejected: { year: number; crop: CropId; after: CropId | null; reasons: string[] }[] = [];
  const options: FieldOption[] = [];
  const cur = setup.current[f.id];
  const rec = (i: number, timeline: Occupancy[], crops: CropId[], catches: boolean[], fixed: boolean[], warnings: string[]) => {
    if (i === setup.planYears.length) { options.push({ fieldId: f.id, crops, catchAfter: catches, fixed, warnings }); return; }
    const year = setup.planYears[i];
    const prevCrop = crops[i - 1] ?? null;
    if (i === 0 && cur) { rec(1, timeline, [cur], [], [true], warnings); return; }
    if (prevCrop && CROPS[prevCrop]?.season === 'perennial') { // grass stays
      const o = occupancyFor(prevCrop, year, 'plan')!;
      rec(i + 1, [...timeline, o], [...crops, prevCrop], [...catches, false], [...fixed, true], warnings); return;
    }
    for (const id of setup.cropSet) {
      if (CROPS[id]?.season === 'perennial') continue;
      const chk = checkCandidate(f, timeline, id, year, setup);
      if (!chk.ok) { if (!rejected.some(r => r.year === year && r.crop === id && r.after === prevCrop)) rejected.push({ year, crop: id, after: prevCrop, reasons: chk.reasons }); continue; }
      const w = [...warnings, ...chk.warnings.map(x => `${year} ${CROPS[id].name}: ${x}`)];
      const tl = [...timeline, chk.occupancy!];
      const catchOpts = i > 0 && setup.catchCrops && prevCrop && catchCropFits(prevCrop, id) ? [false, true] : [false];
      for (const cc of catchOpts) rec(i + 1, tl, [...crops, id], i > 0 ? [...catches, cc] : catches, [...fixed, false], w);
    }
  };
  rec(0, base, [], [], [], []);
  return { options, rejected };
}

/** Preceding main crop (species or class id) of the first plan year, for cover and preceding-crop effects. */
export function lastHistoryCrop(f: FieldInfo, beforeYear: number): string | null {
  const ys = Object.keys(f.history).map(Number).filter(y => y < beforeYear).sort((a, b) => b - a);
  for (const y of ys) { const h = f.history[y]; if (h.crop || h.cropClass) return h.crop ?? h.cropClass ?? null; }
  return null;
}
export { familyOf };

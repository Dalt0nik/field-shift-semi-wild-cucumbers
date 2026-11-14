// What NASA HLS saw on the pilot fields, as it could be known on the decision day. The half-month NDVI series of
// every field (src/data/farm-hls.json, built by pipeline/30_farm_products.ts) is cut at the decision day, and the
// products of the screens are computed from what is left: the bare-soil calendar, the days without cover of past
// seasons, the greenness profile, and the hints that pre-fill stage 2.
import seriesJson from '../data/farm-hls.json';
import { DECISION_DATE, DECISION_YEAR, coverModel, products } from './demo';

const ALL = seriesJson as unknown as Record<string, Record<string, number>>;
const SOIL: number = coverModel.ndvi_soil, FULL: number = coverModel.ndvi_full;
/** Green cover fraction from NDVI between bare soil and full cover (the end-members of the cover model). */
export const fvc = (v: number) => Math.max(0, Math.min(1, (v - SOIL) / (FULL - SOIL)));
/** The day the series were downloaded: a half-month that had started by then holds nothing later. */
export const DOWNLOADED: string = products.generated;

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, h: 'a' | 'b') => `${y}${pad(m)}${h}`;
const startOf = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k[6] === 'a' ? '01' : '16'}`;
const endOf = (k: string) => { const y = +k.slice(0, 4), m = +k.slice(4, 6); return k[6] === 'a' ? `${y}-${pad(m)}-15` : `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
/** Is the half-month composite known on a day? Yes when the half-month is over, or when it had started and the
 *  series were downloaded by that day (then the composite cannot hold a later image). */
export const knownOn = (k: string, date: string = DECISION_DATE) => endOf(k) <= date || (startOf(k) <= date && DOWNLOADED <= date);

/** Half-month NDVI of a field as known on a day. */
export function series(fieldId: string, date: string = DECISION_DATE): Record<string, number> {
  return Object.fromEntries(Object.entries(ALL[fieldId] ?? {}).filter(([k]) => knownOn(k, date)));
}
/** The last half-month with an observation that the plan may know of (for labels). */
export const lastObserved = (fieldId: string, date: string = DECISION_DATE) => Object.keys(series(fieldId, date)).sort().pop() ?? null;

export interface CalendarCell { halfMonth: string; yearsObserved: number; bareShare: number | null; ndviMedian: number | null }
/** For each half-month of the year: in what share of the observed years the field was mostly bare (cover < 30 %). */
export function bareCalendar(fieldId: string, date: string = DECISION_DATE): CalendarCell[] {
  const s = series(fieldId, date), out: CalendarCell[] = [];
  for (let m = 1; m <= 12; m++) for (const h of ['a', 'b'] as const) {
    const v: number[] = []; for (let y = 2016; y <= +date.slice(0, 4); y++) { const x = s[key(y, m, h)]; if (x !== undefined) v.push(x); }
    out.push({ halfMonth: `${pad(m)}${h}`, yearsObserved: v.length, bareShare: v.length >= 3 ? +(v.filter(x => fvc(x) < 0.3).length / v.length).toFixed(2) : null, ndviMedian: v.length ? +[...v].sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(2) : null });
  }
  return out;
}

export interface SeasonCover { season: string; known: number; autumn?: number; winter?: number; spring?: number; total?: number }
/** Days without living cover of each past season (1 Jul - 30 Jun) that had ended by the day; gaps filled as in the
 *  cover model (December-February keep the last autumn state). */
export function seasonCover(fieldId: string, date: string = DECISION_DATE): SeasonCover[] {
  const s = series(fieldId, date), out: SeasonCover[] = [];
  for (let y = 2017; `${y}-06-30` <= date; y++) {
    const ps: string[] = []; for (let yy = y - 1, m = 7; ; m === 12 ? (yy++, m = 1) : m++) { ps.push(key(yy, m, 'a'), key(yy, m, 'b')); if (yy === y && m === 6) break; }
    const v = ps.map(p => s[p] as number | undefined), known = v.filter(x => x !== undefined).length, season = `${y - 1}/${String(y).slice(2)}`;
    if (known < 9) { out.push({ season, known }); continue; }
    const r = { autumn: 0, winter: 0, spring: 0 };
    v.forEach((x, i) => {
      const m = +ps[i].slice(4, 6);
      if (x === undefined) { let a: number | undefined, b: number | undefined; for (let j = i - 1; j >= 0; j--) if (v[j] !== undefined) { a = v[j]; break; } for (let j = i + 1; j < v.length; j++) if (v[j] !== undefined) { b = v[j]; break; } x = m === 12 || m <= 2 ? a ?? b : a !== undefined && b !== undefined ? (a + b) / 2 : a ?? b; }
      if (x === undefined) return;
      const d = (1 - fvc(x)) * 15.2;
      if (m >= 11 || m <= 2) r.winter += d; else if (m >= 7) r.autumn += d; else r.spring += d;
    });
    out.push({ season, known, autumn: Math.round(r.autumn), winter: Math.round(r.winter), spring: Math.round(r.spring), total: Math.round(r.autumn + r.winter + r.spring) });
  }
  return out;
}

const vals = (s: Record<string, number>, keys: string[]) => keys.map(k => s[k]).filter((x): x is number => x !== undefined);
/** Early-spring greenness of the decision year: green from 16 March to 15 April means a winter crop or grass, bare
 *  means a spring-sown crop. Threshold and accuracy from our test on declared fields (experiment C3b, feature E). */
export const SPRING_HINT = { threshold: 0.44, accuracy: 'Right for 65–85 % of fields in the test on 1 338–1 380 declared fields (crops of 2025 and 2026).' };
export function springHint(fieldId: string, date: string = DECISION_DATE): { maxNdvi: number | null; overwintered: boolean | null } {
  const v = vals(series(fieldId, date), [key(DECISION_YEAR, 3, 'b'), key(DECISION_YEAR, 4, 'a')]);
  return v.length ? { maxNdvi: Math.max(...v), overwintered: Math.max(...v) >= SPRING_HINT.threshold } : { maxNdvi: null, overwintered: null };
}
/** Autumn of the decision year: a seedbed dip (16 Aug - 15 Oct) followed by a green-up means a winter crop was sown.
 *  Known only on a decision day late enough to have seen both. Accuracy from experiment C3b, rule D. */
export const AUTUMN_HINT = { accuracy: 'Right for 72–75 % of fields in the test on 1 338–1 380 declared fields (autumns of 2024 and 2025).' };
export function autumnHint(fieldId: string, date: string = DECISION_DATE): { minNdvi: number | null; lateNdvi: number | null; winterCropSuggested: boolean | null } {
  const s = series(fieldId, date), y = DECISION_YEAR;
  const dip = vals(s, [key(y, 8, 'b'), key(y, 9, 'a'), key(y, 9, 'b'), key(y, 10, 'a')]), late = vals(s, [key(y, 10, 'b'), key(y, 11, 'a'), key(y, 11, 'b')]);
  if (!dip.length || !late.length) return { minNdvi: dip.length ? Math.min(...dip) : null, lateNdvi: null, winterCropSuggested: null };
  return { minNdvi: Math.min(...dip), lateNdvi: Math.max(...late), winterCropSuggested: Math.min(...dip) < 0.30 && Math.max(...late) - Math.min(...dip) >= 0.08 };
}

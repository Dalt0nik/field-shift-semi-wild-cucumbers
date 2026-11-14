'use client';
// One store for the whole app: the plan set-up (what grows now, crop set, constraints), the search result, the
// agronomist's custom plan and the current selections. Changing the set-up re-runs the search in a Web Worker.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DECISION_YEAR, DEFAULT_CROP_SET, DEMO_CURRENT, makeContext, makeSetup } from '@/pilot/demo';
import { CROPS } from '@/pilot/regional';
import { farmerTransitions } from '@/pilot/farmers';
import { evaluatePlan, selectionOf, workspace, type EvaluatedPlan, type Selection, type Workspace } from '@/engine/editor';
import type { PlanSetup } from '@/engine/plan';
import { search } from '@/engine/search';
import { soilScore, type SoilScale } from '@/engine/soil-score';
import type { Context } from '@/engine/characteristics';
import type { CropId, EvaluatedVariant, FieldInfo } from '@/engine/types';

export interface PlanItem { id: string; name: string; sub: string; letter: string; kind: 'baseline' | 'tagged' | 'front' | 'custom'; v: EvaluatedVariant; adjusted?: string[] }
interface Found { key: string; variants: EvaluatedVariant[]; baseline: EvaluatedVariant; soilScale: SoilScale; evaluated: number; combinations: number }
/** The agronomist's custom plan: a copy of a plan, changed field by field. `from` is the id of that plan. The draft is
 *  what the Custom plan tab edits; only a saved custom plan stands next to the suggested plans. */
interface Custom { sel: Selection; from: string }

const TAGS: [string, string, string][] = [
  ['best: margin, usual season', 'Highest margin', 'highest margin in a usual year'],
  ['best: margin, bad seasons', 'Best in a bad year', 'highest margin in the worst year of five'],
  ['best: soil', 'Best for soil', 'the highest soil health score'],
  ['balanced', 'Balanced', 'never the worst on any measure'],
];

interface Store {
  current: Record<string, CropId | null>; setCurrent: (id: string, c: CropId | null) => void;
  cropSet: CropId[]; toggleCrop: (c: CropId) => void;
  catchCrops: boolean; setCatchCrops: (b: boolean) => void;
  excluded: Record<string, CropId[]>; setBan: (fieldId: string, c: CropId, on: boolean) => void;
  costFactor: number; setCostFactor: (v: number) => void;
  /** stage 2: the agronomist's corrections of the crop that stands on the decision day */
  confirmed: Record<string, CropId>; confirmCrop: (fieldId: string, c: CropId) => void;
  /** the fields with those corrections */
  fields: FieldInfo[];
  /** the straw assumption of the humus balance */
  strawLeft: boolean; setStrawLeft: (b: boolean) => void;
  setup: PlanSetup; ctx: Context; ws: Workspace;
  found: Found | null; busy: boolean;
  plans: PlanItem[]; plan: PlanItem | null; base: PlanItem | null;
  planId: string; setPlanId: (id: string) => void;
  field: string; setField: (id: string) => void;
  yearIdx: number; setYearIdx: (i: number) => void;
  /** the custom plan being edited (measured like the others, not yet among `plans` until saved) */
  draft: PlanItem | null; draftSaved: boolean; customSaved: boolean;
  /** start the draft as a copy of a plan (the saved custom plan keeps an open draft as it is) */
  startDraft: (fromId: string) => void; updateDraft: (sel: Selection) => void; saveCustom: () => void; deleteCustom: () => void;
  /** stage 7 output: the plan the agronomist has chosen, which is the selected one: a click on a plan chooses it */
  chosen: PlanItem | null;
  /** which screen the user is on and what it shows right now, for the assistant */
  screenKey: string; screenState: () => unknown; reportScreen: (key: string, state?: unknown) => void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('store missing'); return s; };
/** A screen tells the store where the user is; the assistant reads it when a question is asked. */
export function useScreen(key: string | null, state?: unknown) { const { reportScreen } = useStore(); useEffect(() => { if (key) reportScreen(key, state); }); }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [current, setCur] = useState<Record<string, CropId | null>>(DEMO_CURRENT);
  const [cropSet, setCropSet] = useState<CropId[]>(DEFAULT_CROP_SET);
  const [catchCrops, setCatchCrops] = useState(true);
  const [excluded, setExcluded] = useState<Record<string, CropId[]>>({});
  const [costFactor, setCostFactor] = useState(1);
  const [confirmed, setConfirmed] = useState<Record<string, CropId>>({});
  const [strawLeft, setStrawLeft] = useState(true);
  const [found, setFound] = useState<Found | null>(null);
  const [planId, setPlanId] = useState('');
  const [field, setField] = useState('F1');
  const [yearIdx, setYearIdx] = useState(0);
  const [custom, setCustom] = useState<Custom | null>(null);
  const [draftSel, setDraftSel] = useState<Custom | null>(null);
  const [screenKey, setScreenKey] = useState('map');
  const screenRef = useRef<unknown>(null);
  const reportScreen = useCallback((key: string, state?: unknown) => { screenRef.current = state ?? null; setScreenKey(key); }, []);
  const screenState = useCallback(() => screenRef.current, []);

  const setup = useMemo(() => makeSetup({ current, cropSet, catchCrops, excluded }), [current, cropSet, catchCrops, excluded]);
  const ctx = useMemo(() => makeContext(setup, { costFactor, strawLeft, confirmed }), [setup, costFactor, strawLeft, confirmed]);
  const ws = useMemo(() => workspace(ctx), [ctx]);
  const key = useMemo(() => JSON.stringify([current, cropSet, catchCrops, excluded, costFactor, strawLeft, confirmed]), [current, cropSet, catchCrops, excluded, costFactor, strawLeft, confirmed]);

  // stage 5: search in a worker; a plain call is the fallback where workers are not available
  const worker = useRef<Worker | null>(null);
  const latest = useRef(key); latest.current = key;
  useEffect(() => {
    const t = setTimeout(() => {
      const done = (f: Found) => { if (f.key === latest.current) setFound(f); };
      try {
        worker.current ??= new Worker(new URL('../engine/search.worker.ts', import.meta.url), { type: 'module' });
        worker.current.onmessage = e => done(e.data as Found);
        worker.current.onerror = () => { worker.current = null; const r = search(ctx); done({ key, variants: r.variants, baseline: r.baseline, soilScale: r.soilScale, evaluated: r.evaluated, combinations: r.combinations }); };
        worker.current.postMessage({ key, ctx });
      } catch {
        const r = search(ctx); done({ key, variants: r.variants, baseline: r.baseline, soilScale: r.soilScale, evaluated: r.evaluated, combinations: r.combinations });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [key, ctx]);
  useEffect(() => () => worker.current?.terminate(), []);
  const fresh = found?.key === key ? found : null;
  // the custom plan (saved or draft) is measured exactly like the suggested plans
  const customItem = (c: Custom, id: string, others: PlanItem[]): PlanItem => {
    const e: EvaluatedPlan = evaluatePlan(ws, c.sel, id, 'Custom plan'); e.ch.soilScore = soilScore(e.ch, fresh!.soilScale);
    const from = others.find(p => p.id === c.from)?.name.toLowerCase();
    return { id, name: 'Custom plan', sub: from ? `started from ${from}` : 'started from a suggested plan', letter: '★', kind: 'custom', v: e, adjusted: e.adjusted };
  };

  const plans = useMemo<PlanItem[]>(() => {
    if (!fresh) return [];
    const out: PlanItem[] = [{ id: 'usual', name: 'Typical local plan', sub: `what farms within ${farmerTransitions.radiusKm} km sow`, letter: '0', kind: 'baseline', v: fresh.baseline }];
    let n = 0;
    const tagged = new Set<string>();
    for (const [tag] of TAGS) {
      const v = fresh.variants.find(x => x.tags.includes(tag));
      if (!v || tagged.has(v.id)) continue;
      tagged.add(v.id);
      const mine = TAGS.filter(([t]) => v.tags.includes(t));
      out.push({ id: v.id, name: mine.map(m => m[1]).join(' · '), sub: mine.map(m => m[2]).join('; '), letter: String.fromCharCode(65 + n++), kind: 'tagged', v });
    }
    for (const v of fresh.variants) if (!tagged.has(v.id)) out.push({ id: v.id, name: `Variant ${v.id.slice(1)}`, sub: 'not beaten on all four characteristics at once', letter: '', kind: 'front', v });
    if (custom) out.push(customItem(custom, 'custom', out));
    return out;
  }, [fresh, custom, ws]);
  const draft = useMemo(() => (fresh && draftSel ? customItem(draftSel, 'draft', plans) : null), [fresh, draftSel, plans]);
  const base = plans[0] ?? null;
  const plan = plans.find(p => p.id === planId) ?? plans.find(p => p.v.tags.includes('balanced')) ?? base;

  const setCurrent = useCallback((id: string, c: CropId | null) => setCur(s => ({ ...s, [id]: c })), []);
  // a field cannot "stay in grass" for the next harvest when the crop confirmed for this year is not grass
  const confirmCrop = useCallback((id: string, c: CropId) => {
    setConfirmed(s => ({ ...s, [id]: c }));
    setCur(s => (s[id] && CROPS[s[id]!]?.season === 'perennial' && s[id] !== c ? { ...s, [id]: null } : CROPS[c]?.season === 'perennial' ? { ...s, [id]: c } : s));
  }, []);
  const toggleCrop = useCallback((c: CropId) => setCropSet(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c])), []);
  const setBan = useCallback((fieldId: string, c: CropId, on: boolean) => setExcluded(s => { const cur = (s[fieldId] ?? []).filter(x => x !== c); return { ...s, [fieldId]: on ? [...cur, c] : cur }; }), []);
  const startDraft = useCallback((fromId: string) => {
    if (fromId === 'custom' && custom) { setDraftSel(d => d ?? custom); return; }
    const src = plans.find(p => p.id === fromId) ?? plans[0];
    if (src) setDraftSel({ sel: selectionOf(src.v.options), from: src.id });
  }, [plans, custom]);
  const updateDraft = useCallback((sel: Selection) => setDraftSel(s => (s ? { ...s, sel } : s)), []);
  const saveCustom = useCallback(() => setCustom(draftSel), [draftSel]);
  const deleteCustom = useCallback(() => { setCustom(null); setDraftSel(null); }, []);

  const value: Store = { current, setCurrent, cropSet, toggleCrop, catchCrops, setCatchCrops, excluded, setBan, costFactor, setCostFactor, confirmed, confirmCrop, fields: ctx.fields, strawLeft, setStrawLeft, setup, ctx, ws,
    found: fresh, busy: !fresh, plans, plan, base, planId: plan?.id ?? '', setPlanId, field, setField, yearIdx, setYearIdx, draft, draftSaved: !!draftSel && !!custom && JSON.stringify(draftSel) === JSON.stringify(custom), customSaved: !!custom,
    startDraft, updateDraft, saveCustom, deleteCustom, chosen: plan, screenKey, screenState, reportScreen };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

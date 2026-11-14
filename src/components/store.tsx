'use client';
// One store for the whole app: the plan set-up (what grows now, crop set, constraints), the search result, the
// agronomist's own plans and the current selections. Changing the set-up re-runs the search in a Web Worker.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CROP_SET, DEMO_CURRENT, makeContext, makeSetup } from '@/pilot/demo';
import { evaluatePlan, selectionOf, workspace, type EvaluatedPlan, type Selection, type Workspace } from '@/engine/editor';
import type { PlanSetup } from '@/engine/plan';
import { search } from '@/engine/search';
import type { Context } from '@/engine/characteristics';
import type { CropId, EvaluatedVariant } from '@/engine/types';

export interface PlanItem { id: string; name: string; sub: string; letter: string; kind: 'baseline' | 'tagged' | 'front' | 'mine'; v: EvaluatedVariant; adjusted?: string[] }
interface Found { key: string; variants: EvaluatedVariant[]; baseline: EvaluatedVariant; evaluated: number; combinations: number }
interface MyPlan { id: string; name: string; sel: Selection; from: string }

const TAGS: [string, string, string][] = [
  ['best: margin, usual season', 'Highest margin', 'highest margin in a usual year'],
  ['best: margin, bad seasons', 'Best in a bad year', 'highest margin in the worst year of five'],
  ['best: bare soil', 'Least bare soil', 'fewest days without crop cover'],
  ['best: cereal after cereal', 'Least cereal after cereal', 'smallest area of cereal after cereal'],
  ['balanced', 'Balanced', 'never the worst on any measure'],
];

interface Store {
  current: Record<string, CropId | null>; setCurrent: (id: string, c: CropId | null) => void;
  cropSet: CropId[]; toggleCrop: (c: CropId) => void;
  catchCrops: boolean; setCatchCrops: (b: boolean) => void;
  excluded: Record<string, CropId[]>; setBan: (fieldId: string, c: CropId, on: boolean) => void;
  costFactor: number; setCostFactor: (v: number) => void;
  setup: PlanSetup; ctx: Context; ws: Workspace;
  found: Found | null; busy: boolean;
  plans: PlanItem[]; plan: PlanItem | null; base: PlanItem | null;
  planId: string; setPlanId: (id: string) => void;
  field: string; setField: (id: string) => void;
  yearIdx: number; setYearIdx: (i: number) => void;
  myPlans: MyPlan[]; addMyPlan: (fromId: string) => string | null; updateMyPlan: (id: string, sel: Selection) => void; removeMyPlan: (id: string) => void;
  glossary: boolean; setGlossary: (b: boolean) => void;
  /** stage 7 output: the plan the agronomist has chosen (null until they choose) */
  chosen: PlanItem | null; choose: (id: string | null) => void;
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
  const [found, setFound] = useState<Found | null>(null);
  const [planId, setPlanId] = useState('');
  const [field, setField] = useState('F1');
  const [yearIdx, setYearIdx] = useState(0);
  const [myPlans, setMyPlans] = useState<MyPlan[]>([]);
  const [glossary, setGlossary] = useState(false);
  const [chosenId, choose] = useState<string | null>(null);
  const [screenKey, setScreenKey] = useState('map');
  const screenRef = useRef<unknown>(null);
  const reportScreen = useCallback((key: string, state?: unknown) => { screenRef.current = state ?? null; setScreenKey(key); }, []);
  const screenState = useCallback(() => screenRef.current, []);

  const setup = useMemo(() => makeSetup({ current, cropSet, catchCrops, excluded }), [current, cropSet, catchCrops, excluded]);
  const ctx = useMemo(() => makeContext(setup, costFactor), [setup, costFactor]);
  const ws = useMemo(() => workspace(ctx), [ctx]);
  const key = useMemo(() => JSON.stringify([current, cropSet, catchCrops, excluded, costFactor]), [current, cropSet, catchCrops, excluded, costFactor]);

  // stage 5: search in a worker; a plain call is the fallback where workers are not available
  const worker = useRef<Worker | null>(null);
  const latest = useRef(key); latest.current = key;
  useEffect(() => {
    const t = setTimeout(() => {
      const done = (f: Found) => { if (f.key === latest.current) setFound(f); };
      try {
        worker.current ??= new Worker(new URL('../engine/search.worker.ts', import.meta.url), { type: 'module' });
        worker.current.onmessage = e => done(e.data as Found);
        worker.current.onerror = () => { worker.current = null; const r = search(ctx); done({ key, variants: r.variants, baseline: r.baseline, evaluated: r.evaluated, combinations: r.combinations }); };
        worker.current.postMessage({ key, ctx });
      } catch {
        const r = search(ctx); done({ key, variants: r.variants, baseline: r.baseline, evaluated: r.evaluated, combinations: r.combinations });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [key, ctx]);
  useEffect(() => () => worker.current?.terminate(), []);
  const fresh = found?.key === key ? found : null;

  const plans = useMemo<PlanItem[]>(() => {
    if (!fresh) return [];
    const out: PlanItem[] = [{ id: 'usual', name: 'Usual practice', sub: 'the wheat and rapeseed habit, no catch crops', letter: '0', kind: 'baseline', v: fresh.baseline }];
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
    myPlans.forEach(p => { const e: EvaluatedPlan = evaluatePlan(ws, p.sel, p.id, p.name); out.push({ id: p.id, name: p.name, sub: `your plan, started from ${p.from}`, letter: '★', kind: 'mine', v: e, adjusted: e.adjusted }); });
    return out;
  }, [fresh, myPlans, ws]);
  const base = plans[0] ?? null;
  const plan = plans.find(p => p.id === planId) ?? plans.find(p => p.v.tags.includes('balanced')) ?? base;

  const setCurrent = useCallback((id: string, c: CropId | null) => setCur(s => ({ ...s, [id]: c })), []);
  const toggleCrop = useCallback((c: CropId) => setCropSet(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c])), []);
  const setBan = useCallback((fieldId: string, c: CropId, on: boolean) => setExcluded(s => { const cur = (s[fieldId] ?? []).filter(x => x !== c); return { ...s, [fieldId]: on ? [...cur, c] : cur }; }), []);
  const addMyPlan = useCallback((fromId: string) => {
    const src = plans.find(p => p.id === fromId) ?? plans[0];
    if (!src) return null;
    const n = myPlans.length + 1, id = `my${Date.now().toString(36)}`;
    setMyPlans(s => [...s, { id, name: `My plan v${n}`, sel: selectionOf(src.v.options), from: src.name.toLowerCase() }]);
    setPlanId(id);
    return id;
  }, [plans, myPlans.length]);
  const updateMyPlan = useCallback((id: string, sel: Selection) => setMyPlans(s => s.map(p => (p.id === id ? { ...p, sel } : p))), []);
  const removeMyPlan = useCallback((id: string) => setMyPlans(s => s.filter(p => p.id !== id)), []);

  const value: Store = { current, setCurrent, cropSet, toggleCrop, catchCrops, setCatchCrops, excluded, setBan, costFactor, setCostFactor, setup, ctx, ws,
    found: fresh, busy: !fresh, plans, plan, base, planId: plan?.id ?? '', setPlanId, field, setField, yearIdx, setYearIdx, myPlans, addMyPlan, updateMyPlan, removeMyPlan, glossary, setGlossary, chosen: plans.find(p => p.id === chosenId) ?? null, choose, screenKey, screenState, reportScreen };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

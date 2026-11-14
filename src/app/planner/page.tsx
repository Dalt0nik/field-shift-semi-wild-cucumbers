'use client';
// Planner: suggested plans (with the sowing list and the reasons of the selected one), the comparison of any
// plans, and the agronomist's own plan. Every tab ends in the same action: choose a plan.
import Link from 'next/link';
import { useStore } from '@/components/store';
import { Tabs, useQueryState } from '@/components/ui';
import { PLAN_YEARS } from '@/pilot/demo';
import Compare from './Compare';
import Editor from './Editor';
import Variants from './Variants';

type Tab = 'variants' | 'compare' | 'mine';
export default function PlannerPage() {
  const s = useStore();
  const [tab, setTab] = useQueryState<Tab>('tab', 'variants');
  const edit = () => { if (s.plan && s.plan.kind !== 'mine') s.addMyPlan(s.plan.id); setTab('mine'); };
  return (
    <div className="page">
      <div className="page-head">
        <h1>What to sow for {PLAN_YEARS.join(' and ')}</h1>
        <Tabs label="Planner views" tabs={[{ id: 'variants', label: 'Suggested plans' }, { id: 'compare', label: 'Compare' }, { id: 'mine', label: 'My own plan' }]} value={tab} onChange={setTab} />
      </div>
      {s.chosen && tab !== 'variants' && (
        <p className="done" style={{ margin: 0 }}><span><b>Plan chosen: {s.chosen.name}.</b></span><button className="btn" onClick={() => { s.setPlanId(s.chosen!.id); setTab('variants'); }}>See its sowing list</button><Link className="btn pri" href="/rules">Next: check it against the rules →</Link></p>)}
      {tab === 'variants' ? <Variants onEdit={edit} /> : tab === 'mine' ? <Editor onCompare={() => setTab('compare')} /> : <Compare />}
    </div>
  );
}

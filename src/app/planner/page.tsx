'use client';
// Planner: suggested plans (with the sowing list and the reasons of the selected one), the comparison of any
// plans, and the agronomist's one custom plan. Every tab ends in the same action: choose a plan.
import { useStore } from '@/components/store';
import { Tabs, useQueryState } from '@/components/ui';
import { PLAN_YEARS } from '@/pilot/demo';
import Compare from './Compare';
import Editor from './Editor';
import Variants from './Variants';

type Tab = 'variants' | 'compare' | 'custom';
export default function PlannerPage() {
  const s = useStore();
  const [tab, setTab] = useQueryState<Tab>('tab', 'variants');
  const edit = () => { if (s.plan) s.startDraft(s.plan.id); setTab('custom'); };
  return (
    <div className="page">
      <div className="page-head">
        <h1>What to sow for the harvests of {PLAN_YEARS.join(' and ')}</h1>
        <Tabs label="Planner views" tabs={[{ id: 'variants', label: 'Suggested plans' }, { id: 'compare', label: 'Compare' }, { id: 'custom', label: 'Custom plan' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'variants' ? <Variants onEdit={edit} /> : tab === 'custom' ? <Editor /> : <Compare />}
    </div>
  );
}

'use client';
// Planner, second tab: any plans side by side on the same characteristics. There is no weighted score: the best
// value of each row is marked and the columns can be ordered by any one characteristic.
import { useMemo, useState } from 'react';
import { Scatter } from '@/components/Charts';
import { useScreen, useStore } from '@/components/store';
import { More, Panel, Select, Sw, Term, pct } from '@/components/ui';
import { planDiff } from '@/engine/explain';
import { isDominated } from '@/engine/search';
import type { Characteristics } from '@/engine/types';

interface RowDef { key: string; label: React.ReactNode; text: string; unit: string; get: (c: Characteristics) => number | null; better: 1 | -1; show?: (c: Characteristics) => string }
const ROWS: RowDef[] = [
  { key: 'mean', label: <><Term id="margin">Margin</Term> in a usual year</>, text: 'Margin in a usual year', unit: '€/ha', get: c => c.marginMean, better: 1 },
  { key: 'worst', label: <>Margin in the <Term id="worstFifth">worst year of five</Term></>, text: 'Margin in the worst year of five', unit: '€/ha', get: c => c.marginWorstFifth, better: 1 },
  { key: 'dry', label: <>Margin in a <Term id="drySeason">dry year</Term></>, text: 'Margin in a dry year', unit: '€/ha · NASA IMERG, POWER', get: c => c.marginDry, better: 1 },
  { key: 'bare', label: <Term id="bareDays">Days without crop cover</Term>, text: 'Days without crop cover', unit: 'a year · NASA HLS', get: c => c.bareDays.p50, better: -1 },
  { key: 'cac', label: 'Cereal after cereal', text: 'Cereal after cereal', unit: 'of area', get: c => c.cerealAfterCereal, better: -1, show: c => pct(c.cerealAfterCereal) },
  { key: 'leg', label: 'Legumes', text: 'Legumes', unit: 'of area', get: c => c.legumeShare, better: 1, show: c => pct(c.legumeShare) },
  { key: 'pay', label: 'Payments', text: 'Payments', unit: '€/ha', get: c => c.paymentsEurHa, better: 1 },
];

export default function Compare() {
  const s = useStore();
  const defaults = s.plans.filter(p => p.kind !== 'front').map(p => p.id);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [sort, setSort] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const ids = (picked ?? defaults).filter(id => s.plans.some(p => p.id === id));
  const cols = useMemo(() => {
    const c = s.plans.filter(p => ids.includes(p.id));
    const r = ROWS.find(x => x.key === sort);
    return r ? [...c].sort((a, b) => r.better * ((r.get(b.v.ch) ?? -1e9) - (r.get(a.v.ch) ?? -1e9))) : c;
  }, [s.plans, ids, sort]);
  const a = s.plans.find(p => p.id === (pair?.[0] ?? (s.plan?.id !== 'usual' ? s.plan?.id : cols.find(c => c.id !== 'usual')?.id))) ?? s.plans[1] ?? s.base;
  const b = s.plans.find(p => p.id === (pair?.[1] ?? 'usual')) ?? s.base;
  const diff = useMemo(() => (a && b ? planDiff(b.v, a.v, s.ws) : []), [a, b, s.ws]);
  useScreen('planner/compare', { plansCompared: cols.map(c => c.name), orderedBy: ROWS.find(r => r.key === sort)?.text ?? 'not ordered', chosen: s.chosen?.name ?? 'none yet', costAssumption: s.costFactor, table: Object.fromEntries(ROWS.map(r => [r.text, Object.fromEntries(cols.map(c => [c.name, r.get(c.v.ch)]))])), differenceShown: a && b ? { between: [a.name, b.name], fields: diff } : null });
  if (s.busy || !s.base || !a || !b) return <Panel><p className="muted">Searching for plans…</p></Panel>;
  const toggle = (id: string) => setPicked(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const all = s.plans.map(p => p.v.ch);
  const options = s.plans.map(p => ({ value: p.id, label: p.name }));
  const others = s.plans.filter(p => p.kind === 'front');

  return (
    <>
      <p className="lead">The same measures for every plan. There is no overall score on purpose: the best value in each row is underlined, and a click on a row orders the plans by it.</p>
      <Panel>
        <div className="scroll-x">
          <table>
            <thead><tr><th style={{ minWidth: 210 }}>Measure</th>{cols.map(c => <th key={c.id} className="n" style={{ whiteSpace: 'normal', minWidth: 84, color: 'var(--ink)' }}>{c.name}</th>)}</tr></thead>
            <tbody>
              {ROWS.map(r => { const vals = cols.map(c => r.get(c.v.ch)); const nums = vals.filter((v): v is number => v !== null); const best = nums.length ? (r.better > 0 ? Math.max(...nums) : Math.min(...nums)) : null; const tie = nums.every(v => v === best); return (
                <tr key={r.key} className={`click${sort === r.key ? ' sel' : ''}`} onClick={() => setSort(sort === r.key ? null : r.key)} title="Click to order the plans by this row">
                  <td>{r.label} <small>{r.unit}</small></td>
                  {cols.map((c, i) => <td key={c.id} className={`n${vals[i] !== null && vals[i] === best && !tie ? ' best' : ''}`}>{vals[i] === null ? '—' : r.show ? r.show(c.v.ch) : vals[i]}</td>)}
                </tr>); })}
              <tr><td>Farm rules</td>{cols.map(c => { const bad = [...new Set(c.v.ch.rules.filter(r => !r.ok && r.kind !== 'incentive').map(r => r.title.split(' — ')[1] ?? r.title))]; return <td key={c.id} className={`n ${bad.length ? 'bad' : ''}`}>{bad.length ? `fails ${bad.join(', ')}` : 'pass'}</td>; })}</tr>
              <tr><td><Term id="nonDominated">Is this plan beaten on every measure?</Term></td>{cols.map(c => <td key={c.id} className="n">{isDominated(c.v.ch, all.filter(x => x !== c.v.ch)) ? 'yes' : 'no'}</td>)}</tr>
              <tr><td />{cols.map(c => <td key={c.id} className="n">{s.chosen?.id === c.id ? <b className="ok">chosen</b> : <button className="btn sm" onClick={e => { e.stopPropagation(); s.choose(c.id); s.setPlanId(c.id); }}>Choose</button>}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <More label="Show or hide plans">
            <div className="row">{s.plans.filter(p => p.kind !== 'front').map(p => <label key={p.id} className="chk"><input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}</label>)}</div>
            {others.length > 0 && <><p className="small muted">{others.length} more plans from the search that no other plan beats:</p><div className="row">{others.map(p => <label key={p.id} className="chk"><input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}</label>)}</div></>}
          </More>
          <More label="Test the cost assumption">
            <label className="lbl" htmlFor="cost">Variable costs of all crops: {s.costFactor === 1 ? 'as set' : `${s.costFactor > 1 ? '+' : '−'}${Math.round(Math.abs(s.costFactor - 1) * 100)} %`}</label>
            <input id="cost" type="range" min={0.8} max={1.3} step={0.05} value={s.costFactor} onChange={e => s.setCostFactor(+e.target.value)} style={{ maxWidth: 420 }} />
            <div className="ramp-t" style={{ maxWidth: 420 }}><span>−20 %</span><span>as set</span><span>+30 %</span></div>
            <p className="note">Costs are illustrative: no open source gives per-crop costs for Lithuania. Move the slider to see whether the order of the plans survives a cost error; the plans are searched again.</p>
          </More>
        </div>
      </Panel>

      <div className="cols">
        <Panel title="Where two plans differ" right={<><Select small label="First plan" value={a.id} onChange={id => setPair([id, b.id])} options={options} /><span className="muted small">against</span><Select small label="Second plan" value={b.id} onChange={id => setPair([a.id, id])} options={options} /></>}>
          {diff.length === 0 ? <p className="muted">These two plans put the same crops on every field.</p> : (
            <div className="scroll-x"><table>
              <thead><tr><th>Field</th><th>{a.name}</th><th>What it changes there</th></tr></thead>
              <tbody>{diff.map(d => <tr key={d.fieldId} className={`click${s.field === d.fieldId ? ' sel' : ''}`} onClick={() => s.setField(d.fieldId)}><td><b>{d.fieldId}</b></td><td>{d.b}<div className="muted small">instead of {d.a}</div></td><td>{d.reason}</td></tr>)}</tbody>
            </table></div>)}
        </Panel>
        <Panel title="Money against bare soil" sub="every plan is a dot">
          <Scatter dots={s.plans.map(x => ({ id: x.id, x: x.v.ch.bareDays.p50, y: x.v.ch.marginMean, kind: x.kind === 'front' ? 'variant' : x.kind, label: `${x.name}: ${x.v.ch.marginMean} €/ha, ${x.v.ch.bareDays.p50} days without cover` }))} xLabel="days without crop cover a year" yLabel="margin, €/ha" selected={s.planId} onSelect={s.setPlanId} />
          <div className="legend"><span><Sw c="#2f6b3c" />best for one measure</span><span><Sw c="#8fb39a" />other plans</span><span><Sw c="#17231c" />usual practice</span><span><Sw c="#a8497a" />your plans</span></div>
          <p className="note" style={{ marginTop: 6 }}>One plan’s own spread between years is about {s.plan ? s.plan.v.ch.bareDays.p75 - s.plan.v.ch.bareDays.p25 : 40} days, so small differences here do not matter.</p>
        </Panel>
      </div>
    </>
  );
}

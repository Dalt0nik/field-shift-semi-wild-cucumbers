'use client';
// Planner, third tab: the agronomist builds their own plan. Every crop is shown with its status and the reason
// before it is picked; the whole farm is re-checked and re-measured after every change (challenge R6, R8).
import { useMemo, useState } from 'react';
import { cropColor } from '@/components/colors';
import MiniMap from '@/components/MiniMap';
import { useScreen, useStore } from '@/components/store';
import { More, Panel, Pill, Select, Sw, Term } from '@/components/ui';
import { DECISION_YEAR, PLAN_YEARS } from '@/pilot/demo';
import { pickCrop, selectionOf, yearChoices } from '@/engine/editor';
import { catchBefore } from '@/engine/plan';
import { CROPS, cropLabel } from '@/pilot/regional';
import { YearTabs } from './Variants';

const ICON = { ok: '✓', warn: '!', no: '✕' } as const;
const TONE = { ok: 'ok', warn: 'warn', no: 'bad' } as const;

export default function Editor({ onCompare }: { onCompare: () => void }) {
  const s = useStore();
  const fields = s.fields;
  const mine = s.plans.filter(p => p.kind === 'mine');
  const p = s.plan?.kind === 'mine' ? s.plan : mine[mine.length - 1] ?? null;
  const sel = useMemo(() => (p ? selectionOf(p.v.options) : null), [p]);
  const starters = s.plans.filter(x => x.kind === 'baseline' || x.kind === 'tagged');
  const [from, setFrom] = useState('usual');
  const f = fields.find(x => x.id === s.field)!;
  const choices = p && sel ? PLAN_YEARS.map((_, i) => yearChoices(s.ws, f.id, sel, i)) : [];
  useScreen('planner/mine', p ? { plan: p.name, selectedField: f.id, choicesForSelectedField: choices.map(c => ({ year: c.year, locked: c.locked ? c.lockReason : false, chosen: CROPS[c.chosen].name, options: c.items.map(i => ({ crop: CROPS[i.crop].name, status: i.status === 'ok' ? 'fits' : i.status === 'warn' ? 'allowed with a warning' : 'not possible', reasons: i.notes })) })), liveCheck: { margin: p.v.ch.marginMean, badSeasons: p.v.ch.marginWorstFifth, daysWithoutCoverWeightedByErosiveRain: p.v.ch.bareErosive.p50, daysWithoutLivingCover: p.v.ch.bareDays.p50, bareInLeachingSeason: p.v.ch.bareLeaching, humusBalance: p.v.ch.humus, rulesFailed: p.v.ch.rules.filter(r => !r.ok && r.kind !== 'incentive').map(r => r.title + ' ' + r.year) } } : { state: 'no own plan yet; the screen offers to start from usual practice or a suggested variant' });

  if (s.busy) return <Panel><p className="muted">Searching for plan variants…</p></Panel>;
  if (!p || !sel) return (
    <Panel title="Build your own plan">
      <p className="lead">Start from a plan, then change crops field by field. Each crop is checked before you pick it, and your plan is measured exactly like the suggested ones.</p>
      <div className="row" style={{ marginTop: 12 }}><span className="muted">Start from</span><Select label="Plan to start from" value={starters.some(x => x.id === from) ? from : 'usual'} onChange={setFrom} options={starters.map(x => ({ value: x.id, label: x.name }))} /><button className="btn pri" onClick={() => s.addMyPlan(from)}>Start my plan</button></div>
    </Panel>
  );

  const set = (i: number, crop: string, catchBefore?: boolean) => s.updateMyPlan(p.id, pickCrop(s.ws, sel, f.id, i, crop, catchBefore));
  const ch = p.v.ch, base = s.base!.v.ch;
  const failed = [...new Set(ch.rules.filter(r => !r.ok && r.kind !== 'incentive').map(r => (r.title.split(' — ')[1] ?? r.title) + ' ' + r.year))];
  const d = (a: number, b: number, unit: string) => (a === b ? 'same as usual practice' : (a > b ? '+' : '−') + Math.abs(a - b) + ' ' + unit + ' against usual practice');

  return (
    <>
      <div className="row">
        {mine.length > 1 ? <Select label="My plan" value={p.id} onChange={s.setPlanId} options={mine.map(x => ({ value: x.id, label: x.name }))} /> : <b>{p.name}</b>}
        <span className="muted small">{p.sub}</span>
        <span className="sp" />
        <YearTabs />
        <button className="btn sm" onClick={() => s.addMyPlan(p.id)}>Duplicate</button>
        <button className="btn sm" onClick={() => s.removeMyPlan(p.id)}>Delete</button>
      </div>

      <div className="facts">
        <div><span>Farm rules</span><b className={failed.length ? 'bad' : 'ok'}>{failed.length ? 'fails' : 'pass'}</b><small>{failed.length ? failed.join(', ') : 'all checks of both years'}</small></div>
        <div><span><Term id="margin">Margin</Term> in a usual year</span><b>{ch.marginMean} €/ha</b><small>{d(ch.marginMean, base.marginMean, '€/ha')}</small></div>
        <div><span><Term id="worstFifth">Worst year of five</Term></span><b>{ch.marginWorstFifth} €/ha</b><small>{d(ch.marginWorstFifth, base.marginWorstFifth, '€/ha')}</small></div>
        <div><span><Term id="soilDays">Days without cover</Term>, by erosive rain</span><b>{ch.bareErosive.p50} days</b><small>{d(ch.bareErosive.p50, base.bareErosive.p50, 'days')}</small></div>
        <div><span><Term id="humus">Humus balance</Term></span><b>{ch.humus > 0 ? '+' : ''}{ch.humus} kg C/ha</b><small>{d(ch.humus, base.humus, 'kg')}</small></div>
        <div style={{ alignContent: 'center', gap: 6 }}>{s.chosen?.id === p.id ? <b className="ok">Your chosen plan</b> : <button className="btn pri" onClick={() => s.choose(p.id)}>Choose this plan</button>}<button className="link small" onClick={onCompare}>compare with other plans</button></div>
      </div>

      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        <Panel title="1 · Pick a field">
          <div><MiniMap fill={Object.fromEntries(p.v.options.map(o => [o.fieldId, cropColor(o.crops[s.yearIdx])]))} selected={s.field} onSelect={s.setField} labels /></div>
          <div style={{ marginTop: 10 }}><More label="All fields of this plan"><div className="fieldlist">
            {p.v.options.map(o => (
              <button key={o.fieldId} className={o.fieldId === s.field ? 'sel' : ''} onClick={() => s.setField(o.fieldId)}>
                <b>{o.fieldId}</b>
                <span className="seq">{o.crops.map((c, i) => <span key={i} className={o.fixed[i] ? 'muted' : ''}><Sw c={cropColor(c)} />{catchBefore(o, i) ? 'Catch crop, then ' : ''}{catchBefore(o, i) ? CROPS[c].name.toLowerCase() : CROPS[c].name}</span>)}</span>
              </button>))}
          </div></More></div>
          {p.adjusted && p.adjusted.length > 0 && <p className="note">The set-up changed: {p.adjusted.join(', ')} fell back to the nearest admissible crops.</p>}
        </Panel>

        <Panel title={'2 · Choose the crop of ' + f.id} sub={f.areaHa.toFixed(1) + ' ha · ' + [DECISION_YEAR - 1, DECISION_YEAR].map(y => cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')).join(' → ')}>
          {choices.map((c, i) => {
            if (i !== s.yearIdx) return null;
            const possible = c.items.filter(it => it.status !== 'no'), not = c.items.filter(it => it.status === 'no');
            return (
              <div key={c.year}>
                <div className="row" style={{ marginBottom: 4 }}><b>Harvest {c.year}</b>{c.locked && <Pill>{c.lockReason}</Pill>}</div>
                {c.locked ? <p><Sw c={cropColor(c.chosen)} />{CROPS[c.chosen].name}</p> : (
                  <div className="optlist">
                    {possible.map(it => (
                      <button key={it.crop} className={it.crop === c.chosen ? 'opt cur' : 'opt'} onClick={() => set(i, it.crop)} aria-pressed={it.crop === c.chosen}>
                        <b className={TONE[it.status]}>{ICON[it.status]}</b>
                        <span><Sw c={cropColor(it.crop)} />{CROPS[it.crop].name}</span>
                        <small>{it.notes[0] ?? ''}</small>
                      </button>))}
                    {c.items.find(it => it.crop === c.chosen)?.catchPossible && (
                      <label className="chk" style={{ padding: '8px 8px 0' }}><input type="checkbox" checked={c.catchBefore} onChange={e => set(i, c.chosen, e.target.checked)} /><Term id="catchCrop">Catch crop</Term>&nbsp;over the winter before it</label>)}
                    {not.length > 0 && (
                      <div style={{ padding: '8px 8px 0' }}>
                        <More label={not.length + ' crops are not possible here, and why'}>
                          {not.map(it => <p key={it.crop} className="small"><b className="bad">✕</b> <b>{CROPS[it.crop].name}</b>: {it.notes[0]}</p>)}
                        </More>
                      </div>)}
                  </div>)}
              </div>);
          })}
          <p className="note" style={{ marginTop: 10 }}><b className="ok">✓</b> fits · <b className="warn">!</b> allowed, with a warning</p>
        </Panel>
      </div>
    </>
  );
}

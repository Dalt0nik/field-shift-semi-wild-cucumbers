'use client';
// Planner, first tab: usual practice next to the best plan for each characteristic (challenge R2, R3), and the
// selected plan as a sowing list with its reasons. No ranking and no weights: the agronomist chooses.
import Link from 'next/link';
import { useMemo } from 'react';
import { SeasonBars } from '@/components/Charts';
import { cropColor } from '@/components/colors';
import MiniMap from '@/components/MiniMap';
import { useScreen, useStore, type PlanItem } from '@/components/store';
import Timeline, { planRows } from '@/components/Timeline';
import { Check, More, Panel, Pill, Sw, Tabs, Term, pct } from '@/components/ui';
import { DECISION_DATE, PLAN_YEARS, fields } from '@/pilot/demo';
import { fiveAnswers } from '@/engine/explain';
import { CROPS } from '@/pilot/regional';
import { consequences } from '@/engine/search';

export const YearTabs = () => { const s = useStore(); return <Tabs label="Plan year shown" tabs={PLAN_YEARS.map((y, i) => ({ id: String(i), label: `Harvest ${y}` }))} value={String(s.yearIdx)} onChange={v => s.setYearIdx(+v)} />; };
/** Fields on which a plan sows something else than usual practice (in any plan year). */
export const changedFields = (p: PlanItem, base: PlanItem) => p.v.options.filter((o, i) => o.crops.join() !== base.v.options[i].crops.join() || o.catchAfter.join() !== base.v.options[i].catchAfter.join()).map(o => o.fieldId);

export default function Variants({ onEdit }: { onEdit: () => void }) {
  const s = useStore();
  const cards = s.plans.filter(p => p.kind === 'baseline' || p.kind === 'tagged');
  const p = s.plan, base = s.base;
  const five = useMemo(() => (p && base ? fiveAnswers(p.v, base.v, s.ws) : null), [p, base, s.ws]);
  const open = fields.filter(f => !s.current[f.id]);
  const f = fields.find(x => x.id === s.field)!;
  const opt = p?.v.options.find(o => o.fieldId === f.id);
  const cons = p && opt ? consequences(s.ctx, f, opt) : null;
  useScreen('planner/variants', p && base ? { cardsShown: cards.map(c => ({ name: c.name, marginUsualYear: c.v.ch.marginMean, marginWorstYearOfFive: c.v.ch.marginWorstFifth, daysWithoutCover: c.v.ch.bareDays.p50, cerealAfterCereal: c.v.ch.cerealAfterCereal, differsFromUsualPracticeOn: changedFields(c, base) })), selected: p.name, chosen: s.chosen?.name ?? 'none yet',
    sowingListOfSelected: p.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map((c, i) => `${PLAN_YEARS[i]} ${CROPS[c].name}${o.fixed[i] ? ' (already sown)' : ''}`) })), why: five?.why, marginBySeason: p.v.ch.marginSeries } : { state: 'searching for plans' });
  if (!p || !base || !five || !opt || !cons) return <Panel><p className="muted">Searching for plans that pass the farm rules…</p></Panel>;

  const m = cards.map(c => c.v.ch.marginMean), cc = cards.map(c => c.v.ch.cerealAfterCereal);
  // the best value of each measure among the cards is marked, as in the comparison table
  const top = { m: Math.max(...m), w: Math.max(...cards.map(c => c.v.ch.marginWorstFifth)), b: Math.min(...cards.map(c => c.v.ch.bareDays.p50)), c: Math.min(...cc) };
  const mark = (on: boolean) => (on ? 'bestv' : undefined);
  const spread = Math.round(((Math.max(...m) - Math.min(...m)) / Math.min(...m)) * 100);
  const ch = p.v.ch, isBase = p.id === base.id;
  const wins = ch.marginSeries.filter((x, i) => x.margin > base.v.ch.marginSeries[i].margin).length;
  const cell = (i: number, o: (typeof p.v.options)[number], bo: (typeof p.v.options)[number]) => {
    const diff = !isBase && (o.crops[i] !== bo.crops[i] || (i > 0 && o.catchAfter[i - 1] !== bo.catchAfter[i - 1]));
    return <td key={i} className={o.fixed[i] ? 'muted' : ''}><Sw c={cropColor(o.crops[i])} />{diff ? <b>{CROPS[o.crops[i]].name}</b> : CROPS[o.crops[i]].name}{i > 0 && o.catchAfter[i - 1] ? <small> after a catch crop</small> : null}{i === 0 && o.fixed[i] && s.current[o.fieldId] ? <small> · already sown</small> : null}</td>;
  };

  return (
    <>
      <p className="lead">{fields.length - open.length} of {fields.length} fields are already sown, so the plans differ only on {open.map(x => x.id).join(', ')} in {PLAN_YEARS[0]} and on every field in {PLAN_YEARS[1]}. All of them earn similar money (within {spread} %): choose by what matters to you, a bad year, bare soil or rotation. Pick a card, then press “Choose this plan”.</p>
      <div className="row"><span className="muted small">Maps show</span><YearTabs /><span className="muted small">Only fields sown differently from usual practice are coloured; the best value of each measure is underlined.</span></div>
      <div className="cards">
        {cards.map(c => { const changed = changedFields(c, base); const fill = Object.fromEntries(c.v.options.map((o, i) => [o.fieldId, c.kind === 'baseline' || o.crops[s.yearIdx] !== base.v.options[i].crops[s.yearIdx] ? cropColor(o.crops[s.yearIdx]) : '#ffffff'])); return (
          <button key={c.id} className={`card${c.id === p.id ? ' on' : ''}${c.kind === 'baseline' ? ' base' : ''}`} onClick={() => s.setPlanId(c.id)} aria-pressed={c.id === p.id}>
            {s.chosen?.id === c.id && <span className="chosen-mark">✓ chosen</span>}
            <strong>{c.name}</strong>
            <MiniMap fill={fill} />
            <small>{c.kind === 'baseline' ? 'the reference' : `differs on ${changed.length} fields`}</small>
            <span className="kpi"><span className={mark(c.v.ch.marginMean === top.m)}>{c.v.ch.marginMean}</span><small>€/ha, usual year</small></span>
            <span className="stat"><span>Worst year of five</span><b className={mark(c.v.ch.marginWorstFifth === top.w)}>{c.v.ch.marginWorstFifth} €/ha</b></span>
            <span className="stat"><span>Days without cover<i className="src">NASA</i></span><b className={mark(c.v.ch.bareDays.p50 === top.b)}>{c.v.ch.bareDays.p50}</b></span>
            <span className="stat"><span>Cereal after cereal</span><b className={mark(c.v.ch.cerealAfterCereal === top.c && cc.filter(x => x === top.c).length < 3)}>{pct(c.v.ch.cerealAfterCereal)}</b></span>
            {!c.v.ch.feasible && <Pill tone="bad">fails a farm rule</Pill>}
          </button>); })}
      </div>
      <p className="note"><b>From NASA satellites:</b> how each field yields against its neighbours (<Term id="fieldIndex">field index</Term>), <Term id="bareDays">days without crop cover</Term>, which past years were dry and which had a <Term id="wetHarvest">wet harvest</Term>. <b>From local data:</b> yields, prices, rules and your own sowing. <Term id="margin">Margin</Term> rests on illustrative costs, so compare the plans with each other.</p>

      <Panel title={p.name} sub={p.sub}
        right={<>{s.chosen?.id === p.id ? <><Pill tone="ok">your chosen plan</Pill><button className="link small" onClick={() => s.choose(null)}>undo</button></> : <button className="btn pri" onClick={() => s.choose(p.id)}>Choose this plan</button>}<button className="btn" onClick={onEdit}>Change it field by field</button><Link className="btn" href="/rules">Check the rules</Link></>}>
        {s.chosen?.id === p.id && <p className="done"><span><b>Plan chosen.</b> This is your sowing list.</span><Link className="btn pri" href="/rules">Next: check it against the rules →</Link></p>}
        <div className="scroll-x">
          <table>
            <thead><tr><th>Sowing list</th><th className="n">ha</th>{PLAN_YEARS.map(y => <th key={y}>Harvest {y}</th>)}</tr></thead>
            <tbody>{p.v.options.map((o, i) => { const fx = fields[i]; return (
              <tr key={o.fieldId} className={`click${s.field === o.fieldId ? ' sel' : ''}`} onClick={() => s.setField(o.fieldId)}>
                <td><b>{o.fieldId}</b></td><td className="n">{fx.areaHa.toFixed(1)}</td>{PLAN_YEARS.map((_, yi) => cell(yi, o, base.v.options[i]))}
              </tr>); })}</tbody>
          </table>
        </div>
        {!isBase && <p className="note" style={{ marginTop: 6 }}>Bold: sown differently from usual practice.</p>}
        <p style={{ margin: '12px 0 10px', maxWidth: '95ch' }}><b>Why this plan.</b> {five.why.replace(/ \([^)]*\)\.$/, '.')}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <More label="Evidence, benefits, gaps and risks">
            <p style={{ maxWidth: '95ch' }}><b>NASA data used.</b> HLS satellite images for days without cover; GPM IMERG rain and POWER temperature to tell dry and wet years apart.</p>
            {(['evidence', 'benefits', 'gaps', 'risks'] as const).map(k => <p key={k} style={{ maxWidth: '95ch' }}><b>{k[0].toUpperCase() + k.slice(1)}.</b> {five[k]}</p>)}
          </More>
          <More label="How it would have done in each past season">
            <SeasonBars series={ch.marginSeries} compare={isBase ? undefined : base.v.ch.marginSeries} />
            <div className="legend"><span><Sw c="#d08a2e" /><Term id="drySeason">dry season</Term></span><span><Sw c="#2b6f8e" /><Term id="wetHarvest">wet harvest</Term></span><span><Sw c="#7d8b80" />ordinary season</span>{!isBase && <span>▬ usual practice</span>}</div>
            <p className="note">Margin in €/ha if that season came again. Dry and wet seasons are told apart with NASA GPM IMERG rain and NASA POWER temperature.{!isBase && ` This plan earns more than usual practice in ${wins} of ${ch.marginSeries.length} seasons.`} Eight seasons in ten fall between {ch.marginP10} and {ch.marginP90} €/ha.</p>
          </More>
          <More label="On the field timelines, and what it closes later">
            <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, p.v.options)} from={2025} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
            <div className="legend"><span><i className="sw" style={{ background: '#c79a1e', opacity: 0.62 }} />past</span><span><i className="sw" style={{ background: '#c79a1e', borderWidth: 2, borderColor: '#17231c' }} />planned</span><span><i className="sw" style={{ background: '#73c2a0', height: 5 }} />catch crop over winter</span></div>
            <p className="small"><b>{f.id} in {cons.year}</b> (click a field to change): still possible {cons.open.length ? cons.open.map(x => CROPS[x].name.toLowerCase()).join(', ') : 'nothing in the crop set'}.{cons.closed.length > 0 && <> Closed by this choice: {cons.closed.slice(0, 3).map(x => `${CROPS[x.crop].name.toLowerCase()} (${x.reasons[0]})`).join('; ')}.</>}</p>
            {opt.warnings.length > 0 && <Check>{opt.warnings.join('; ')}.</Check>}
          </More>
        </div>
      </Panel>
    </>
  );
}

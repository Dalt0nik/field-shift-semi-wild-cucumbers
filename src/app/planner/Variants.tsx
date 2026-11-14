'use client';
// Planner, first tab: the typical local plan next to the best plan for each characteristic (challenge R2, R3), and the
// selected plan as a sowing list and on the field timelines. Every card carries the soil health score. The plans are not ranked:
// the agronomist chooses.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cropColor } from '@/components/colors';
import MiniMap from '@/components/MiniMap';
import { SoilBlock } from '@/components/Soil';
import { useScreen, useStore, type PlanItem } from '@/components/store';
import Timeline, { planRows } from '@/components/Timeline';
import { Panel, Pill, Sw, Tabs, Term } from '@/components/ui';
import { DECISION_DATE, PLAN_YEARS } from '@/pilot/demo';
import { fiveAnswers } from '@/engine/explain';
import { catchBefore, optionKey } from '@/engine/plan';
import { CROPS } from '@/pilot/regional';

/** The EU flag next to "Best for soil": the soil angle of the project points at the EU soil law. Twelve stars in a
 *  circle on blue, drawn small. Hover or click opens a short note on the law with a link to its text; information
 *  only, no claim of compliance. Source: context/challenge.md, Positioning (Directive (EU) 2025/2360, primary). */
const STAR = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.4 : r; return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join(' ');
const EuFlag = () => (
  <svg className="eu-flag" viewBox="0 0 27 18" width="21" height="14" aria-hidden>
    <rect width="27" height="18" fill="#003399" />
    {Array.from({ length: 12 }, (_, k) => { const a = (k * Math.PI) / 6; return <polygon key={k} points={STAR(13.5 + 6 * Math.sin(a), 9 - 6 * Math.cos(a), 1.1)} fill="#FFCC00" />; })}
  </svg>
);
function EuLaw() {
  const [open, setOpen] = useState(false);
  return (
    <span className="eu-law" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="eu-btn" aria-expanded={open} aria-label="EU Soil Monitoring Law" onClick={() => setOpen(!open)}><EuFlag /></button>
      {open && (
        <span className="eu-pop" role="dialog" aria-label="EU Soil Monitoring Law">
          <span className="eu-box">
            <b>EU Soil Monitoring Law (2025)</b>
            Every EU country must monitor the health of its soils, erosion included, and its erosion estimate must take into account plant cover and the crops grown. Countries put it into their own law by December 2028. Of all the plans found, this one has the highest soil health score.
            <a href="https://eur-lex.europa.eu/eli/dir/2025/2360/oj/eng" target="_blank" rel="noreferrer">Read the directive (EUR-Lex) ↗</a>
          </span>
        </span>)}
    </span>
  );
}
export const YearTabs =() => { const s = useStore(); return <Tabs label="Plan year shown" tabs={PLAN_YEARS.map((y, i) => ({ id: String(i), label: `Harvest ${y}` }))} value={String(s.yearIdx)} onChange={v => s.setYearIdx(+v)} />; };
/** Fields on which a plan sows something else than the typical local plan (in any plan year). */
export const changedFields = (p: PlanItem, base: PlanItem) => p.v.options.filter((o, i) => optionKey(o) !== optionKey(base.v.options[i])).map(o => o.fieldId);

export default function Variants({ onEdit }: { onEdit: () => void }) {
  const s = useStore();
  const fields = s.fields;
  const cards = s.plans.filter(p => p.kind !== 'front');
  const p = s.plan, base = s.base;
  const five = useMemo(() => (p && base ? fiveAnswers(p.v, base.v, s.ws) : null), [p, base, s.ws]);
  const sown = fields.filter(f => s.current[f.id] && CROPS[s.current[f.id]!].season !== 'perennial');
  const soilOf = (c: PlanItem) => ({ soilHealthScore: c.v.ch.soilScore, daysWithoutCoverWeightedByErosiveRain: c.v.ch.bareErosive.p50, daysWithoutLivingCover: c.v.ch.bareDays.p50, bareInLeachingSeason: c.v.ch.bareLeaching, humusBalanceKgCPerHa: c.v.ch.humus, cropFamiliesPerYear: c.v.ch.familiesPerYear, cerealAfterCereal: c.v.ch.cerealAfterCereal, harvestOnWetSoilHa: c.v.ch.wetHarvestHa });
  useScreen('planner/variants', p && base ? { cardsShown: cards.map(c => ({ name: c.name, marginUsualYear: c.v.ch.marginMean, marginWorstYearOfFive: c.v.ch.marginWorstFifth, soil: soilOf(c), differsFromUsualPracticeOn: changedFields(c, base) })), selected: p.name, chosen: s.chosen?.name ?? 'none yet',
    sowingListOfSelected: p.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map((c, i) => `${PLAN_YEARS[i]} ${catchBefore(o, i) ? 'catch crop, then ' : ''}${CROPS[c].name}${o.fixed[i] ? ' (fixed)' : ''}`) })), why: five?.why, marginBySeason: p.v.ch.marginSeries } : { state: 'searching for plans' });
  if (!p || !base || !five) return <Panel><p className="muted">Searching for plans that pass the EU farm rules…</p></Panel>;

  // the best value of each measure among the cards is marked, as in the comparison table
  const top = { m: Math.max(...cards.map(c => c.v.ch.marginMean)), w: Math.max(...cards.map(c => c.v.ch.marginWorstFifth)), s: Math.max(...cards.map(c => c.v.ch.soilScore?.total ?? 0)) };
  const mark = (on: boolean) => (on ? 'bestv' : undefined);
  const isBase = p.id === base.id;
  const cell = (i: number, o: (typeof p.v.options)[number], bo: (typeof p.v.options)[number]) => {
    const diff = !isBase && (o.crops[i] !== bo.crops[i] || catchBefore(o, i) !== catchBefore(bo, i));
    const name = `${catchBefore(o, i) ? 'Catch crop, then ' : ''}${catchBefore(o, i) ? CROPS[o.crops[i]].name.toLowerCase() : CROPS[o.crops[i]].name}`;
    return <td key={i} className={o.fixed[i] ? 'muted' : ''}><Sw c={cropColor(o.crops[i])} />{diff ? <b>{name}</b> : name}{i === 0 && o.fixed[i] && s.current[o.fieldId] ? <small> · {CROPS[o.crops[i]].season === 'perennial' ? 'stays' : 'already sown'}</small> : null}</td>;
  };

  return (
    <>
      <p className="lead">Each card is the best plan for one goal. Click a card to choose it.{sown.length > 0 && <> {sown.length} of {fields.length} fields are already sown for {PLAN_YEARS[0]}.</>}</p>
      <div className="row"><YearTabs /><span className="muted small">Only fields sown differently from the typical local plan are coloured; the best value of each measure is underlined.</span></div>
      <div className="cards">
        {cards.map(c => { const changed = changedFields(c, base); const fill = Object.fromEntries(c.v.options.map((o, i) => [o.fieldId, c.kind === 'baseline' || o.crops[s.yearIdx] !== base.v.options[i].crops[s.yearIdx] || catchBefore(o, s.yearIdx) !== catchBefore(base.v.options[i], s.yearIdx) ? cropColor(o.crops[s.yearIdx]) : '#ffffff']));
          const soilBest = c.v.tags.includes('best: soil');
          return (
          <div key={c.id} role="button" tabIndex={0} className={`card${c.id === p.id ? ' on' : ''}${c.kind === 'baseline' ? ' base' : ''}${soilBest ? ' soil-best' : ''}`} onClick={() => s.setPlanId(c.id)} title="Click to choose this plan" onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); s.setPlanId(c.id); } }} aria-pressed={c.id === p.id}>
            {s.chosen?.id === c.id && <span className="chosen-mark">✓ chosen</span>}
            <strong>{c.name}{soilBest && <EuLaw />}</strong>
            <MiniMap fill={fill} />
            <small>{c.kind === 'baseline' ? c.sub : `differs on ${changed.length} field${changed.length === 1 ? '' : 's'}`}</small>
            <span className="kpi"><span className={mark(c.v.ch.marginMean === top.m)}>{c.v.ch.marginMean}</span><small>€/ha, usual year</small></span>
            <span className="stat"><span><Term id="worstFifth">Worst year of five</Term></span><b className={mark(c.v.ch.marginWorstFifth === top.w)}>{c.v.ch.marginWorstFifth} €/ha</b></span>
            <SoilBlock c={c.v.ch} best={top.s} />
            {!c.v.ch.feasible && <Pill tone="bad">fails an EU farm rule</Pill>}
          </div>); })}
      </div>
      <dl className="srcnote">
        <dt>NASA satellites</dt><dd><Term id="hls">Soil cover</Term> · <Term id="imerg">erosive rain</Term> · <Term id="fieldIndex">field yields</Term> · <Term id="drySeason">dry years</Term> · <Term id="wetHarvest">wet harvests</Term></dd>
        <dt>Local data</dt><dd>Yields · prices · your entries</dd>
        <dt>EU farm rules</dt><dd><Term id="gaec7">Crop rotation</Term> · <Term id="gaec6">winter cover</Term> · <Term id="gaec5">erosion-sensitive land</Term> · <Term id="payments">payments</Term> · <Link className="link" href="/rules">see how this plan does</Link></dd>
      </dl>

      <Panel title={p.name} sub={p.sub}
        right={<button className="btn" onClick={onEdit}>Change it field by field</button>}>
        <div className="scroll-x">
          <table>
            <thead><tr><th>Sowing list</th><th className="n">ha</th>{PLAN_YEARS.map(y => <th key={y}>Harvest {y}</th>)}</tr></thead>
            <tbody>{p.v.options.map((o, i) => { const fx = fields[i]; return (
              <tr key={o.fieldId} className={`click${s.field === o.fieldId ? ' sel' : ''}`} onClick={() => s.setField(o.fieldId)}>
                <td><b>{o.fieldId}</b></td><td className="n">{fx.areaHa.toFixed(1)}</td>{PLAN_YEARS.map((_, yi) => cell(yi, o, base.v.options[i]))}
              </tr>); })}</tbody>
          </table>
        </div>
        {!isBase && <p className="note" style={{ marginTop: 6 }}>Bold: sown differently from the typical local plan.</p>}
        <p className="lbl" style={{ marginTop: 16 }}>On the field timelines</p>
        <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, p.v.options)} from={PLAN_YEARS[0] - 2} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
        <div className="legend"><span><i className="sw" style={{ background: '#c79a1e', opacity: 0.62 }} />past</span><span><i className="sw" style={{ background: '#c79a1e', borderWidth: 2, borderColor: '#17231c' }} />planned</span><span><i className="sw" style={{ background: '#73c2a0', height: 5 }} /><Term id="catchCrop">catch crop</Term>&nbsp;over winter</span></div>
      </Panel>
    </>
  );
}

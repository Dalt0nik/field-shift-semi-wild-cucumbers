'use client';
// Planner, first tab: the typical local plan next to the best plan for each characteristic (challenge R2, R3), and the
// selected plan as a sowing list with its reasons. Every card carries the soil-protection block. No ranking and no
// weights: the agronomist chooses.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SeasonBars } from '@/components/Charts';
import { cropColor } from '@/components/colors';
import MiniMap from '@/components/MiniMap';
import { SoilBlock, SoilTable } from '@/components/Soil';
import { useScreen, useStore, type PlanItem } from '@/components/store';
import Timeline, { planRows } from '@/components/Timeline';
import { Check, More, Panel, Pill, Sw, Tabs, Term } from '@/components/ui';
import { DECISION_DATE, PLAN_YEARS } from '@/pilot/demo';
import { fiveAnswers } from '@/engine/explain';
import { catchBefore, optionKey } from '@/engine/plan';
import { CROPS } from '@/pilot/regional';
import { consequences } from '@/engine/search';

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
            Every EU country must monitor the health of its soils, erosion included, and its erosion estimate must take into account plant cover and the crops grown. Countries put it into their own law by December 2028. Of all the plans found, this one protects the soil best, judged first on how well it keeps the soil covered.
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
  const cards = s.plans.filter(p => p.kind === 'baseline' || p.kind === 'tagged');
  const p = s.plan, base = s.base;
  const five = useMemo(() => (p && base ? fiveAnswers(p.v, base.v, s.ws) : null), [p, base, s.ws]);
  const sown = fields.filter(f => s.current[f.id] && CROPS[s.current[f.id]!].season !== 'perennial');
  const f = fields.find(x => x.id === s.field)!;
  const opt = p?.v.options.find(o => o.fieldId === f.id);
  const cons = p && opt ? consequences(s.ctx, f, opt) : null;
  const soilOf = (c: PlanItem) => ({ daysWithoutCoverWeightedByErosiveRain: c.v.ch.bareErosive.p50, daysWithoutLivingCover: c.v.ch.bareDays.p50, bareInLeachingSeason: c.v.ch.bareLeaching, humusBalanceKgCPerHa: c.v.ch.humus, cropFamiliesPerYear: c.v.ch.familiesPerYear, cerealAfterCereal: c.v.ch.cerealAfterCereal, harvestOnWetSoilHa: c.v.ch.wetHarvestHa });
  useScreen('planner/variants', p && base ? { cardsShown: cards.map(c => ({ name: c.name, marginUsualYear: c.v.ch.marginMean, marginWorstYearOfFive: c.v.ch.marginWorstFifth, soil: soilOf(c), differsFromUsualPracticeOn: changedFields(c, base) })), selected: p.name, chosen: s.chosen?.name ?? 'none yet',
    sowingListOfSelected: p.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map((c, i) => `${PLAN_YEARS[i]} ${catchBefore(o, i) ? 'catch crop, then ' : ''}${CROPS[c].name}${o.fixed[i] ? ' (fixed)' : ''}`) })), why: five?.why, marginBySeason: p.v.ch.marginSeries } : { state: 'searching for plans' });
  // for the Best-for-soil plan: the plan that keeps at least half of its gain over the typical local plan at the highest margin
  const cheaper = useMemo(() => {
    if (!p || !base || !p.v.tags.includes('best: soil') || !s.found) return null;
    const gain = base.v.ch.bareErosive.p50 - p.v.ch.bareErosive.p50; if (gain < 2) return null;
    const target = base.v.ch.bareErosive.p50 - Math.ceil(gain / 2);
    const cand = s.found.variants.filter(v => v.ch.bareErosive.p50 <= target).sort((a, b) => b.ch.marginMean - a.ch.marginMean)[0];
    return cand && cand.id !== p.id && cand.ch.marginMean > p.v.ch.marginMean + 10 ? { s1e: cand.ch.bareErosive.p50, margin: cand.ch.marginMean } : null;
  }, [p, base, s.found]);
  if (!p || !base || !five || !opt || !cons) return <Panel><p className="muted">Searching for plans that pass the farm rules…</p></Panel>;

  // the best value of each measure among the cards is marked, as in the comparison table
  const top = { m: Math.max(...cards.map(c => c.v.ch.marginMean)), w: Math.max(...cards.map(c => c.v.ch.marginWorstFifth)), e: Math.min(...cards.map(c => c.v.ch.bareErosive.p50)), d: Math.min(...cards.map(c => c.v.ch.bareDays.p50)), c: Math.min(...cards.map(c => c.v.ch.cerealAfterCereal)) };
  const mark = (on: boolean) => (on ? 'bestv' : undefined);
  const ch = p.v.ch, isBase = p.id === base.id;
  const topMargin = s.plans.find(x => x.v.tags.includes('best: margin, usual season')) ?? null;
  const steepHa = fields.reduce((t, x) => t + x.erosionShare * x.areaHa, 0);
  const wins = ch.marginSeries.filter((x, i) => x.margin > base.v.ch.marginSeries[i].margin).length;
  const cell = (i: number, o: (typeof p.v.options)[number], bo: (typeof p.v.options)[number]) => {
    const diff = !isBase && (o.crops[i] !== bo.crops[i] || catchBefore(o, i) !== catchBefore(bo, i));
    const name = `${catchBefore(o, i) ? 'Catch crop, then ' : ''}${catchBefore(o, i) ? CROPS[o.crops[i]].name.toLowerCase() : CROPS[o.crops[i]].name}`;
    return <td key={i} className={o.fixed[i] ? 'muted' : ''}><Sw c={cropColor(o.crops[i])} />{diff ? <b>{name}</b> : name}{i === 0 && o.fixed[i] && s.current[o.fieldId] ? <small> · {CROPS[o.crops[i]].season === 'perennial' ? 'stays' : 'already sown'}</small> : null}</td>;
  };

  return (
    <>
      <p className="lead">Each card is the best plan for one measure. Pick one, then press “Choose this plan”.{sown.length > 0 && <> {sown.length} of {fields.length} fields are already sown for {PLAN_YEARS[0]}.</>}</p>
      <div className="row"><YearTabs /><span className="muted small">Only fields sown differently from the typical local plan are coloured; the best value of each measure is underlined.</span></div>
      <div className="cards">
        {cards.map(c => { const changed = changedFields(c, base); const fill = Object.fromEntries(c.v.options.map((o, i) => [o.fieldId, c.kind === 'baseline' || o.crops[s.yearIdx] !== base.v.options[i].crops[s.yearIdx] || catchBefore(o, s.yearIdx) !== catchBefore(base.v.options[i], s.yearIdx) ? cropColor(o.crops[s.yearIdx]) : '#ffffff']));
          const soilBest = c.v.tags.includes('best: soil');
          return (
          <div key={c.id} role="button" tabIndex={0} className={`card${c.id === p.id ? ' on' : ''}${c.kind === 'baseline' ? ' base' : ''}${soilBest ? ' soil-best' : ''}`} onClick={() => s.setPlanId(c.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); s.setPlanId(c.id); } }} aria-pressed={c.id === p.id}>
            {s.chosen?.id === c.id && <span className="chosen-mark">✓ chosen</span>}
            <strong>{c.name}{soilBest && <EuLaw />}</strong>
            <MiniMap fill={fill} />
            <small>{c.kind === 'baseline' ? c.sub : `differs on ${changed.length} fields`}</small>
            <span className="kpi"><span className={mark(c.v.ch.marginMean === top.m)}>{c.v.ch.marginMean}</span><small>€/ha, usual year</small></span>
            <span className="stat"><span><Term id="worstFifth">Worst year of five</Term></span><b className={mark(c.v.ch.marginWorstFifth === top.w)}>{c.v.ch.marginWorstFifth} €/ha</b></span>
            <SoilBlock c={c.v.ch} best={top} />
            {!c.v.ch.feasible && <Pill tone="bad">fails a farm rule</Pill>}
          </div>); })}
      </div>
      <p className="note"><b>From NASA satellites:</b> how long each crop sequence leaves the soil without cover (<Term id="hls">HLS</Term>) and when rain is erosive (<Term id="imerg">GPM IMERG</Term>), how each field yields against its neighbours (<Term id="fieldIndex">field index</Term>), which past years were dry and which had a <Term id="wetHarvest">wet harvest</Term>. <b>From local data:</b> yields, prices, rules and your own entries. <Term id="margin">Margin</Term> rests on illustrative costs, so compare the plans with each other.</p>

      <Panel title={p.name} sub={p.sub}
        right={<>{s.chosen?.id === p.id ? <><Pill tone="ok">your chosen plan</Pill><button className="link small" onClick={() => s.choose(null)}>undo</button></> : <button className="btn pri" onClick={() => s.choose(p.id)}>Choose this plan</button>}<button className="btn" onClick={onEdit}>Change it field by field</button><Link className="btn" href="/rules">Check the rules</Link></>}>
        {s.chosen?.id === p.id && <p className="done"><span><b>Plan chosen.</b> This is your sowing list.</span></p>}
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
        <p style={{ margin: '12px 0 10px', maxWidth: '95ch' }}><b>Why this plan.</b> {five.why.replace(/ \([^)]*\)\.$/, '.')}</p>
        <SoilTable plan={p} base={base} top={topMargin} steepHa={steepHa} strawLeft={s.strawLeft} setStrawLeft={s.setStrawLeft} cheaper={cheaper} />
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <More label="Evidence, benefits, gaps and risks">
            <p style={{ maxWidth: '95ch' }}><b>NASA data used.</b> <Term id="hls">HLS</Term> satellite images for soil cover and the <Term id="fieldIndex">field index</Term>; <Term id="imerg">GPM IMERG</Term> rain for <Term id="erosivity">erosive rain</Term>, the <Term id="leaching">leaching season</Term> and <Term id="wetHarvest">wet harvests</Term>; <Term id="power">POWER</Term> temperature to tell <Term id="drySeason">dry years</Term> apart.</p>
            {(['evidence', 'benefits', 'gaps', 'risks'] as const).map(k => <p key={k} style={{ maxWidth: '95ch' }}><b>{k[0].toUpperCase() + k.slice(1)}.</b> {five[k]}</p>)}
          </More>
          <More label="How it would have done in each past season">
            <SeasonBars series={ch.marginSeries} compare={isBase ? undefined : base.v.ch.marginSeries} />
            <div className="legend"><span><Sw c="#d08a2e" /><Term id="drySeason">dry season</Term></span><span><Sw c="#2b6f8e" /><Term id="wetHarvest">wet harvest</Term></span><span><Sw c="#7d8b80" />ordinary season</span>{!isBase && <span>▬ the typical local plan</span>}</div>
            <p className="note">Margin in €/ha <Term id="replay">if that season came again</Term>. Dry and wet seasons are told apart with NASA <Term id="imerg">GPM IMERG</Term> rain and NASA <Term id="power">POWER</Term> temperature.{!isBase && ` This plan earns more than the typical local plan in ${wins} of ${ch.marginSeries.length} seasons.`} <Term id="p10p90">Eight seasons in ten</Term> fall between {ch.marginP10} and {ch.marginP90} €/ha.</p>
          </More>
          <More label="On the field timelines, and what it closes later">
            <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, p.v.options)} from={PLAN_YEARS[0] - 2} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
            <div className="legend"><span><i className="sw" style={{ background: '#c79a1e', opacity: 0.62 }} />past</span><span><i className="sw" style={{ background: '#c79a1e', borderWidth: 2, borderColor: '#17231c' }} />planned</span><span><i className="sw" style={{ background: '#73c2a0', height: 5 }} /><Term id="catchCrop">catch crop</Term>&nbsp;over winter</span></div>
            <p className="small"><b>{f.id} in {cons.year}</b> (click a field to change): still possible {cons.open.length ? cons.open.map(x => CROPS[x].name.toLowerCase()).join(', ') : 'nothing in the crop set'}.{cons.closed.length > 0 && <> Closed by this choice: {cons.closed.slice(0, 3).map(x => `${CROPS[x.crop].name.toLowerCase()} (${x.reasons[0]})`).join('; ')}.</>}</p>
            {opt.warnings.length > 0 && <Check>{opt.warnings.join('; ')}.</Check>}
          </More>
        </div>
      </Panel>
    </>
  );
}

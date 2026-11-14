'use client';
// Checks: the farm rules applied to any plan. One line per rule, a name and a result; the legal text and the
// numbers are one click away.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { cropColor } from '@/components/colors';
import { useScreen, useStore } from '@/components/store';
import { More, Pill, Select, Sw, Tabs, Term } from '@/components/ui';
import { PLAN_YEARS, fields } from '@/pilot/demo';
import { CROPS } from '@/pilot/regional';
import { GAEC5_MIN_SHARE, RULESET } from '@/pilot/rules';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });

export default function ChecksPage() {
  const s = useStore();
  const p = s.plan;
  const fill = useMemo(() => (p ? Object.fromEntries(p.v.options.map(o => [o.fieldId, cropColor(o.crops[s.yearIdx])])) : {}), [p, s.yearIdx]);
  const steep = fields.filter(f => f.erosionShare > GAEC5_MIN_SHARE);
  const rootOnSteep = p ? p.v.options.filter(o => steep.some(f => f.id === o.fieldId) && o.crops.some(c => CROPS[c].rootCrop)) : [];
  const legend = p ? [...new Set(p.v.options.map(o => o.crops[s.yearIdx]))] : [];
  const lines = RULESET.rules.filter(r => r.kind !== 'incentive' ? r.id !== 'gaec2' : true).map(info => {
    const rs = p ? p.v.ch.rules.filter(r => r.id === info.id) : [];
    if (info.layer === 'erosion') return { info, ok: rootOnSteep.length === 0, status: rootOnSteep.length ? 'fails' : 'passes', details: [`${steep.length} fields touch the layer (${steep.map(f => f.id).join(', ')}). Root crops planned there: ${rootOnSteep.length ? rootOnSteep.map(o => o.fieldId).join(', ') : 'none, they are not offered on these fields'}.`] };
    const ok = rs.every(r => r.ok), some = rs.some(r => r.ok);
    return { info, ok, status: info.kind === 'incentive' ? (ok ? 'earned' : some ? `earned in ${rs.filter(r => r.ok).map(r => r.year).join(', ')}` : 'not earned') : ok ? 'passes' : `fails in ${rs.filter(r => !r.ok).map(r => r.year).join(', ')}`, details: rs.map(r => `${r.year}: ${r.detail}`) };
  });
  const failed = lines.filter(l => !l.ok && l.info.kind !== 'incentive');
  useScreen('rules', { plan: p?.name, mapShowsCropsOf: PLAN_YEARS[s.yearIdx], checks: lines.map(l => ({ rule: l.info.name, status: l.status, whatTheRuleSays: l.info.summary, numbers: l.details })) });

  return (
    <div className="split right" style={{ ['--side' as string]: '400px' }}>
      <div className="mapbox">
        <FarmMap fill={fill} showErosion showPeat selected={s.field} onSelect={s.setField} />
        <div className="maplegend">
          <div className="legend">{legend.map(c => <span key={c}><Sw c={cropColor(c)} />{CROPS[c].name}</span>)}</div>
          <div className="legend"><span><Sw c="#b5452c" />erosion-sensitive land</span><span><Sw c="#3b2a4a" />peat soil</span></div>
        </div>
      </div>
      <aside className="dock">
        <h1>Plan checks</h1>
        {s.chosen && s.chosen.id === s.planId && <p className="small ok"><b>Your chosen plan.</b></p>}
        <div className="row">
          <Select label="Plan to check" value={s.planId} onChange={s.setPlanId} options={s.plans.map(x => ({ value: x.id, label: x.name }))} />
          <Tabs label="Crops on the map" tabs={PLAN_YEARS.map((y, i) => ({ id: String(i), label: String(y) }))} value={String(s.yearIdx)} onChange={v => s.setYearIdx(+v)} />
        </div>
        {!p ? <p className="muted">Searching for plans…</p> : <>
          <p className="lead">{failed.length ? <span className="bad"><b>This plan fails {failed.map(l => l.info.name.toLowerCase()).join(' and ')}.</b></span> : <><b>This plan passes every rule.</b></>}</p>
          {([['Rules', lines.filter(l => l.info.kind !== 'incentive')], ['Extra payment, optional', lines.filter(l => l.info.kind === 'incentive')]] as const).map(([title, ls]) => ls.length > 0 && (
            <div key={title}>
              <span className="lbl">{title === 'Rules' ? title : <><Term id="eco">Extra payment</Term>, optional</>}</span>
              {ls.map(l => (
                <div key={l.info.id} style={{ borderTop: '1px solid var(--line)', padding: '9px 0', display: 'grid', gap: 4 }}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><b>{l.info.name}</b><Pill tone={l.ok ? 'ok' : l.info.kind === 'incentive' ? 'warn' : 'bad'}>{l.status}</Pill></div>
                  <More label="The rule and the numbers"><p className="small muted">{l.info.summary}</p>{l.details.map(d => <p key={d} className="small">{d}</p>)}</More>
                </div>))}
            </div>))}
          <div><Link className="btn" href="/planner">← Back to the sowing list</Link></div>
          <More label="Where these rules come from">
            <p className="small">{RULESET.acts}. {RULESET.penalty} Payments in this plan: {p.v.ch.paymentsEurHa} €/ha a year.</p>
            <p className="check"><b>Check on the farm:</b> the winter-cover check counts unploughed stubble, so it holds only if that stubble stays until spring.</p>
          </More>
        </>}
      </aside>
    </div>
  );
}

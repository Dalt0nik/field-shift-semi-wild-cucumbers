'use client';
// EU rules: the EU farm rules applied to the chosen plan. One line per rule: its plain name (hover: what the rule says, and
// the EU standard and Lithuanian order in the source line), pass or fail, and the plan's own values. Then the EU
// payments of the plan, part by part, as the margin counts them.
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cropColor } from '@/components/colors';
import { useScreen, useStore } from '@/components/store';
import { Pill, Sw, Tabs, Term } from '@/components/ui';
import { PLAN_YEARS, fields } from '@/pilot/demo';
import { CROPS } from '@/pilot/regional';
import { GAEC5_MIN_SHARE, RULESET } from '@/pilot/rules';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });

/** Winter cover is checked in the winter before a harvest; the other rules in the harvest year. */
const yearLabel = (id: string, y: number) => (id === 'gaec6' ? `Winter ${y - 1}/${String(y).slice(2)}` : String(y));
const TERM: Record<string, string> = { gaec5: 'gaec5', gaec6: 'gaec6', gaec7: 'gaec7', eco_rotation: 'ecoRotation' };

export default function ChecksPage() {
  const s = useStore();
  const p = s.chosen;
  const fill = useMemo(() => (p ? Object.fromEntries(p.v.options.map(o => [o.fieldId, cropColor(o.crops[s.yearIdx])])) : {}), [p, s.yearIdx]);
  const steep = fields.filter(f => f.erosionShare > GAEC5_MIN_SHARE);
  const rootOnSteep = p ? p.v.options.filter(o => steep.some(f => f.id === o.fieldId) && o.crops.some(c => CROPS[c].rootCrop)) : [];
  const legend = p ? [...new Set(p.v.options.map(o => o.crops[s.yearIdx]))] : [];
  const lines = RULESET.rules.filter(r => r.id !== 'gaec2').map(info => {
    const rs = p ? p.v.ch.rules.filter(r => r.id === info.id) : [];
    if (info.layer === 'erosion') return { info, ok: rootOnSteep.length === 0, status: rootOnSteep.length ? 'fails' : 'passes', values: [`${steep.length} of ${fields.length} fields touch it (${steep.map(f => f.id).join(', ')}); root crops planned there: ${rootOnSteep.length ? rootOnSteep.map(o => o.fieldId).join(', ') : 'none'}`] };
    const ok = rs.every(r => r.ok), some = rs.some(r => r.ok);
    return { info, ok, status: info.kind === 'incentive' ? (ok ? 'earned' : some ? `earned in ${rs.filter(r => r.ok).map(r => r.year).join(', ')}` : 'not earned') : ok ? 'passes' : `fails in ${rs.filter(r => !r.ok).map(r => r.year).join(', ')}`, values: rs.map(r => `${yearLabel(r.id, r.year)}: ${r.value}`) };
  });
  const failed = lines.filter(l => !l.ok && l.info.kind !== 'incentive');
  const pay = p?.v.ch.paymentParts;
  const payRows: [string, number][] = pay ? [['Basic support', pay.basic], ['Top-up on the first 50 ha', pay.topUp], ['Legumes', pay.legumes], ['Catch crops', pay.catchCrops], ['Rotation payment', pay.rotation], ...(pay.cut ? [['Cut for a broken rule', pay.cut] as [string, number]] : [])] : [];
  useScreen('rules', { plan: p?.name, mapShowsCropsOf: PLAN_YEARS[s.yearIdx], checks: lines.map(l => ({ rule: l.info.name, status: l.status, whatTheRuleSays: l.info.summary, values: l.values })), paymentsEurHaAYear: p ? { ...Object.fromEntries(payRows), total: p.v.ch.paymentsEurHa } : null });

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
        <h1><Term id="farmRules">EU farm rules</Term></h1>
        {!p ? <p className="muted">Searching for plans…</p> : <>
          <div className="row">
            <Tabs label="Crops on the map" tabs={PLAN_YEARS.map((y, i) => ({ id: String(i), label: String(y) }))} value={String(s.yearIdx)} onChange={v => s.setYearIdx(+v)} />
          </div>
          <p className="lead">{failed.length ? <span className="bad"><b>This plan fails {failed.map(l => l.info.name.toLowerCase()).join(' and ')}.</b></span> : <><b>This plan passes every EU farm rule.</b></>}</p>
          {([['Rules', lines.filter(l => l.info.kind !== 'incentive')], ['Extra payment, optional', lines.filter(l => l.info.kind === 'incentive')]] as const).map(([title, ls]) => ls.length > 0 && (
            <div key={title}>
              {title !== 'Rules' && <span className="lbl">{title}</span>}
              {ls.map(l => (
                <div key={l.info.id} style={{ borderTop: '1px solid var(--line)', padding: '9px 0', display: 'grid', gap: 4 }}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><b><Term id={TERM[l.info.id]}>{l.info.name}</Term></b><Pill tone={l.ok ? 'ok' : l.info.kind === 'incentive' ? 'warn' : 'bad'}>{l.status}</Pill></div>
                  {l.values.map(v => <span key={v} className="small muted">{v}</span>)}
                </div>))}
            </div>))}
          <div>
            <span className="lbl"><Term id="payments">EU payments</Term>, € per ha a year</span>
            <table>
              <tbody>
                {payRows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="n">{v}</td></tr>)}
                <tr><td><b>Total, in the margin</b></td><td className="n"><b>{p.v.ch.paymentsEurHa}</b></td></tr>
              </tbody>
            </table>
          </div>
        </>}
      </aside>
    </div>
  );
}

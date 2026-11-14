'use client';
// Planner, second tab: the suggested plans and the custom plan side by side on the same characteristics. The plans are
// not ranked: the best value of each row is marked and the columns can be ordered by any one characteristic.
import { useMemo, useState } from 'react';
import { SoilHelpButton } from '@/components/Soil';
import { humusClass } from '@/pilot/soil';
import { useScreen, useStore } from '@/components/store';
import { Panel, Term, pct } from '@/components/ui';
import { isDominated } from '@/engine/search';
import type { Characteristics } from '@/engine/types';

interface RowDef { key: string; label: React.ReactNode; text: string; unit: string; get: (c: Characteristics) => number | null; better: 1 | -1; show?: (c: Characteristics) => string }
const ROWS: RowDef[] = [
  { key: 'mean', label: <><Term id="margin">Margin</Term> in a usual year</>, text: 'Margin in a usual year', unit: '€/ha', get: c => c.marginMean, better: 1 },
  { key: 'worst', label: <>Margin in the <Term id="worstFifth">worst year of five</Term></>, text: 'Margin in the worst year of five', unit: '€/ha', get: c => c.marginWorstFifth, better: 1 },
  { key: 'dry', label: <>Margin in a <Term id="drySeason">dry year</Term></>, text: 'Margin in a dry year', unit: '€/ha · NASA IMERG, POWER', get: c => c.marginDry, better: 1 },
  { key: 'score', label: <Term id="soilScore">Soil health score</Term>, text: 'Soil health score', unit: 'points of 100', get: c => c.soilScore?.total ?? null, better: 1 },
  { key: 'soil', label: <Term id="soilDays">Days of bare soil under heavy rain</Term>, text: 'Days of bare soil under heavy rain', unit: 'a year · NASA HLS × IMERG', get: c => c.bareErosive.p50, better: -1 },
  { key: 'bare', label: <Term id="bareDays">Days without green cover</Term>, text: 'Days without green cover', unit: 'a year · NASA HLS', get: c => c.bareDays.p50, better: -1 },
  { key: 'leach', label: <>Bare soil in the <Term id="leaching">leaching season</Term></>, text: 'Bare soil in the leaching season', unit: 'days · NASA HLS × IMERG', get: c => c.bareLeaching, better: -1 },
  { key: 'fam', label: <Term id="cropFamilies">Crop groups</Term>, text: 'Crop groups in each plan year', unit: 'in each plan year', get: c => c.familiesPerYear.reduce((t, v) => t + v, 0) / c.familiesPerYear.length, better: 1, show: c => c.familiesPerYear.join(' / ') },
  { key: 'cac', label: <Term id="cerealAfterCereal">Cereal after cereal</Term>, text: 'Cereal after cereal', unit: 'of area', get: c => c.cerealAfterCereal, better: -1, show: c => pct(c.cerealAfterCereal) },
  { key: 'leg', label: 'Legumes', text: 'Legumes', unit: 'of area', get: c => c.legumeShare, better: 1, show: c => pct(c.legumeShare) },
  { key: 'wet', label: <Term id="wetSoilHarvest">Harvest on wet soil</Term>, text: 'Harvest on wet soil', unit: 'ha a year · NASA IMERG, POWER', get: c => c.wetHarvestHa, better: -1 },
  { key: 'humus', label: <Term id="humus">Humus balance</Term>, text: 'Humus balance', unit: 'kg humus-C/ha', get: c => c.humus, better: 1, show: c => `${c.humus > 0 ? '+' : ''}${c.humus} ${humusClass(c.humus)}` },
  { key: 'pay', label: 'Payments', text: 'Payments', unit: '€/ha', get: c => c.paymentsEurHa, better: 1 },
];

export default function Compare() {
  const s = useStore();
  const [sort, setSort] = useState<string | null>(null);
  const cols = useMemo(() => {
    const c = s.plans.filter(p => p.kind !== 'front');
    const r = ROWS.find(x => x.key === sort);
    return r ? [...c].sort((a, b) => r.better * ((r.get(b.v.ch) ?? -1e9) - (r.get(a.v.ch) ?? -1e9))) : c;
  }, [s.plans, sort]);
  useScreen('planner/compare', { plansCompared: cols.map(c => c.name), orderedBy: ROWS.find(r => r.key === sort)?.text ?? 'not ordered', chosen: s.chosen?.name, table: Object.fromEntries(ROWS.map(r => [r.text, Object.fromEntries(cols.map(c => [c.name, r.get(c.v.ch)]))])) });
  if (s.busy || !s.base) return <Panel><p className="muted">Searching for plans…</p></Panel>;
  const all = s.plans.map(p => p.v.ch);

  return (
    <>
      <p className="lead">The same measures for every plan, money first, then soil health <SoilHelpButton />. The plans are not ranked: the best value in each row is underlined, and a click on a row orders the plans by it.</p>
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
              <tr><td>EU farm rules</td>{cols.map(c => { const bad = [...new Set(c.v.ch.rules.filter(r => !r.ok && r.kind !== 'incentive').map(r => r.title.split(' — ')[1] ?? r.title))]; return <td key={c.id} className={`n ${bad.length ? 'bad' : ''}`}>{bad.length ? `fails ${bad.join(', ')}` : 'pass'}</td>; })}</tr>
              <tr><td><Term id="nonDominated">Is this plan beaten on every measure?</Term></td>{cols.map(c => <td key={c.id} className="n">{isDominated(c.v.ch, all.filter(x => x !== c.v.ch)) ? 'yes' : 'no'}</td>)}</tr>
              <tr><td />{cols.map(c => <td key={c.id} className="n">{s.chosen?.id === c.id ? <b className="ok">chosen</b> : <button className="btn sm" onClick={e => { e.stopPropagation(); s.setPlanId(c.id); }}>Choose</button>}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

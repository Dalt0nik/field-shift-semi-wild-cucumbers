'use client';
// Crops: what the farm can grow and what must not be planned. Limits are hard: never traded against money.
import Link from 'next/link';
import { useState } from 'react';
import { cropColor } from '@/components/colors';
import { useScreen, useStore } from '@/components/store';
import { Panel, Select, Sw, Term } from '@/components/ui';
import { DEFAULT_CROP_SET, PLAN_YEARS, fields } from '@/pilot/demo';
import { CROPS, PLANNABLE } from '@/pilot/regional';
import { GAEC5_MIN_SHARE, RULESET } from '@/pilot/rules';
import type { CropId } from '@/engine/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (v: string | null) => (v ? MONTHS[+v.slice(0, 2) - 1] : '?');
const OFFERED: CropId[] = [...PLANNABLE.filter(c => DEFAULT_CROP_SET.includes(c) || ['maize_grain', 'winter_rye', 'spring_rapeseed'].includes(c)), 'perennial_grasses'];

export default function CropsPage() {
  const s = useStore();
  const [banField, setBanField] = useState(fields[0].id);
  const [banCrop, setBanCrop] = useState<CropId>('winter_rapeseed');
  const sown = fields.filter(f => s.current[f.id]);
  const steep = fields.filter(f => f.erosionShare > GAEC5_MIN_SHARE);
  const bans = Object.entries(s.excluded).flatMap(([f, cs]) => cs.map(c => [f, c] as const));
  const banOptions = s.cropSet.filter(c => CROPS[c].season !== 'perennial').map(c => ({ value: c, label: CROPS[c].name, color: cropColor(c) }));
  useScreen('settings', { cropsTicked: s.cropSet.map(c => CROPS[c].name), catchCrops: s.catchCrops, userBans: bans.map(([f, c]) => `${CROPS[c].name} on ${f}`), rules: RULESET.rules.map(r => `${r.name}: ${r.summary}`) });

  return (
    <div className="page">
      <div className="page-head"><h1>Crops and limits</h1><p className="lead">Tick the crops the farm can grow. The plans use only these.</p></div>
      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <Panel title="Crops the farm can grow">
          <table>
            <thead><tr><th /><th>Crop</th><th>Sown</th><th>Harvested</th></tr></thead>
            <tbody>{OFFERED.map(id => { const c = CROPS[id]; return (
              <tr key={id}>
                <td style={{ width: 28 }}><input type="checkbox" checked={s.cropSet.includes(id)} onChange={() => s.toggleCrop(id)} aria-label={`Grow ${c.name}`} /></td>
                <td><Sw c={cropColor(id)} />{c.name}</td>
                <td className="muted nw">{c.season === 'perennial' ? 'stays' : mon(c.sowing.from)}</td>
                <td className="muted nw">{c.season === 'perennial' ? '' : mon(c.harvest.to)}</td>
              </tr>); })}
              <tr><td><input type="checkbox" checked={s.catchCrops} onChange={e => s.setCatchCrops(e.target.checked)} aria-label="Use catch crops" /></td><td><Sw c={cropColor('catch')} /><Term id="catchCrop">Catch crops</Term></td><td colSpan={2} className="muted">over winter</td></tr>
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 8 }}>Sowing and harvest months from the regional crop guides; exact windows are used in the plans.</p>
        </Panel>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <Panel title="Limits" sub="a plan that breaks one is never shown">
            <table>
              <tbody>
                <tr><td className="nw"><b>Already in the ground</b></td><td>{sown.length ? `${sown.map(f => f.id).join(', ')} ${sown.length > 1 ? 'keep their crop' : 'keeps its crop'} for ${PLAN_YEARS[0]}` : `nothing is sown for ${PLAN_YEARS[0]} yet`}</td><td /></tr>
                {steep.length > 0 && <tr><td className="nw"><b>From the rules</b></td><td>Sugar beet and other root crops are not offered on {steep.length} of {fields.length} fields: part of each is erosion-sensitive land</td><td /></tr>}
                {bans.map(([f, c]) => <tr key={f + c}><td className="nw"><b>Your ban</b></td><td>No {CROPS[c].name.toLowerCase()} on {f}</td><td className="n"><button className="link" onClick={() => s.setBan(f, c, false)}>remove</button></td></tr>)}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted small">Optional, ban a crop on a field:</span>
              <Select small label="Field" value={banField} onChange={setBanField} options={fields.map(f => ({ value: f.id, label: f.id }))} />
              <Select small label="Crop" value={banOptions.some(o => o.value === banCrop) ? banCrop : banOptions[0].value} onChange={setBanCrop} options={banOptions} />
              <button className="btn sm" onClick={() => s.setBan(banField, banCrop, true)}>Add</button>
            </div>
          </Panel>
          <div><Link className="btn pri" href="/planner">Next: see the plans →</Link></div>
        </div>
      </div>
    </div>
  );
}

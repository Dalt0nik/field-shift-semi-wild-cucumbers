'use client';
// Fields: what grows on each field now (the agronomist's entry) and the timeline of every field with its free slots.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { cropColor } from '@/components/colors';
import { useScreen, useStore } from '@/components/store';
import Timeline, { planRows } from '@/components/Timeline';
import { Check, More, Panel, Pill, Select, Sw, Tabs, Term, pct, useQueryState } from '@/components/ui';
import { DECISION_DATE, PLAN_YEARS, fields, products } from '@/pilot/demo';
import { occupancyFor } from '@/engine/plan';
import { CROPS, cropLabel } from '@/pilot/regional';
import type { CropId } from '@/engine/types';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
const NOW: CropId[] = ['winter_wheat', 'winter_rapeseed', 'winter_barley', 'triticale', 'perennial_grasses'];
const NOW_OPTIONS = [{ value: '', label: 'Nothing sown yet' }, ...NOW.map(c => ({ value: c, label: CROPS[c].name, color: cropColor(c) }))];
const day = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function FieldsPage() {
  const s = useStore();
  const [tab, setTab] = useQueryState<'fields' | 'timelines'>('tab', 'fields');
  const fill = useMemo(() => Object.fromEntries(fields.map(f => [f.id, s.current[f.id] ? cropColor(s.current[f.id]) : '#ffffff'])), [s.current]);
  const f = fields.find(x => x.id === s.field)!;
  const fp = products.fields[s.field];
  const sown = fields.filter(x => s.current[x.id]);
  const freeFrom = (id: string) => { const c = s.current[id]; if (!c) return `free for spring ${PLAN_YEARS[0]} sowing`; if (CROPS[c].season === 'perennial') return 'stays in grass'; const h = occupancyFor(c, PLAN_YEARS[0], 'current')?.harvest; return h ? `sown; free again after its harvest, ${day(h)}` : '—'; };
  useScreen(`organization/${tab}`, { selectedField: f.id, growingNow: Object.fromEntries(fields.map(x => [x.id, s.current[x.id] ? CROPS[s.current[x.id]!].name : 'nothing sown'])), satelliteHintForSelected: fp.autumn2026 });
  const tabs = <Tabs label="Fields views" tabs={[{ id: 'fields', label: 'What grows now' }, { id: 'timelines', label: 'Field timelines' }]} value={tab} onChange={setTab} />;

  if (tab === 'timelines') return (
    <div className="page">
      <div className="page-head"><h1>Fields</h1>{tabs}</div>
      <Panel title="Every field is a timeline" sub={`plan to the harvest of ${PLAN_YEARS[PLAN_YEARS.length - 1]}`}>
        <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, null)} from={2024} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i className="sw" style={{ background: '#c79a1e', opacity: 0.62 }} />past crop</span>
          <span><i className="sw" style={{ background: '#c79a1e' }} />in the ground now</span>
          <span><i className="sw" style={{ border: '1.5px dashed #2f6b3c', background: 'none' }} /><Term id="slot">free slot</Term>&nbsp;for the plan to fill</span>
        </div>
      </Panel>
      <p className="note">Fields with a winter crop in the ground open again after the {PLAN_YEARS[0]} harvest; the others are free today. The 2024 crop is known only as a declaration class.</p>
    </div>
  );

  return (
    <div className="split" style={{ ['--side' as string]: '440px' }}>
      <aside className="dock">
        <div className="page-head"><h1>Fields</h1>{tabs}</div>
        <p className="lead">Confirm what is in the ground today. {sown.length} fields are sown for {PLAN_YEARS[0]} and stay fixed. {fields.length - sown.length} are free ({fields.filter(x => !s.current[x.id]).map(x => x.id).join(', ')}): the plan fills these first.</p>
        <div><Link className="btn pri" href="/scenes">Next: what the satellites see →</Link></div>
        <div className="scroll-x">
          <table>
            <thead><tr><th>Field</th><th>Harvested 2026</th><th>Growing now</th></tr></thead>
            <tbody>{fields.map(x => (
              <tr key={x.id} className={`click${x.id === s.field ? ' sel' : ''}`} onClick={() => s.setField(x.id)}>
                <td className="nw"><b>{x.id}</b> <small>{x.areaHa.toFixed(1)} ha</small></td>
                <td><Sw c={cropColor(x.history[2026]?.crop)} />{cropLabel(x.history[2026]?.crop)}</td>
                <td><Select small label={`Growing now on ${x.id}`} value={s.current[x.id] ?? ''} options={NOW_OPTIONS} onChange={v => s.setCurrent(x.id, v || null)} /></td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="note">No open data know this autumn’s sowing, so it is your entry (demo presets here).</p>
      </aside>
      <div className="mapbox">
        <FarmMap fill={fill} selected={s.field} onSelect={s.setField} />
        <div className="mapcard">
          <h3>{f.id} <small>{f.areaHa.toFixed(1)} ha · {freeFrom(f.id)}</small></h3>
          <p className="small">{[2024, 2025, 2026].map(y => cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')).join(' → ')}</p>
          <p className="small"><Pill tone={fp.autumn2026.winterCropSuggested ? 'ok' : undefined}>{fp.autumn2026.winterCropSuggested ? 'NASA satellite hint: a winter crop is sown' : 'NASA satellite hint: no sign of sowing'}</Pill></p>
          <More label="More about this field">
            <dl className="kv">
              <dt>Autumn greenness</dt><dd><Term id="ndvi">NDVI</Term> {fp.autumn2026.minNdviAugOct?.toFixed(2)} → {fp.autumn2026.lateNdvi?.toFixed(2)}</dd>
              <dt>Soil</dt><dd>{f.soilType ?? 'unknown'}, texture {f.soilTexture ?? 'unknown'}</dd>
              <dt>Relief</dt><dd>slope {fp.terrain.slopePct} %, {Math.abs(fp.terrain.relHeight500m)} m {fp.terrain.relHeight500m > 0 ? 'above' : 'below'} surroundings</dd>
              <dt>Rule layers</dt><dd>{pct(f.erosionShare)} erosion-sensitive, {pct(f.peatShare)} peat</dd>
            </dl>
            <Check>the satellite hint was right for three fields in four in our test, so it only pre-fills your entry.</Check>
          </More>
        </div>
        <div className="maplegend"><span><Sw c="#c79a1e" />sown for {PLAN_YEARS[0]} (colour = crop)</span><span><Sw c="#ffffff" />free now</span></div>
      </div>
    </div>
  );
}

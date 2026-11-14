'use client';
// Fields: stage 2, what is on each field on the decision day (the agronomist's entry, pre-filled from the declared
// crops and checked against what NASA HLS saw before that day), and the timeline of every field with its free slots.
// Nothing here names a date: what is standing, what is harvested and what can already be sown follow the decision day.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { cropColor } from '@/components/colors';
import { useScreen, useStore } from '@/components/store';
import Timeline, { planRows } from '@/components/Timeline';
import { Check, More, Panel, Pill, Select, Sw, Tabs, Term, pct, useQueryState } from '@/components/ui';
import { DECISION_DATE, DECISION_YEAR, PLAN_YEARS, fieldIndex, niceDate, products, sowableBy, standing } from '@/pilot/demo';
import { AUTUMN_HINT, SPRING_HINT, autumnHint, springHint } from '@/pilot/satellite';
import { fieldFactor } from '@/engine/characteristics';
import { CROPS, PLANNABLE, cropLabel } from '@/pilot/regional';
import type { CropId } from '@/engine/types';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
const Y = DECISION_YEAR, NEXT = PLAN_YEARS[0];
// stage 2 choices: the crop of this year (any crop of the reference), and what is already sown for the next harvest
// (only crops whose sowing has started by the decision day; grass can always stay)
const YEAR_OPTIONS = [...PLANNABLE, 'perennial_grasses'].map(c => ({ value: c, label: CROPS[c].name, color: cropColor(c) }));
const SOWABLE: CropId[] = [...sowableBy(), 'perennial_grasses'];
const NEXT_OPTIONS = [{ value: '', label: 'Nothing sown yet' }, ...SOWABLE.map(c => ({ value: c, label: CROPS[c].name, color: cropColor(c) }))];
const SOWING_STARTED = sowableBy().length > 0;
const short = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const WINTER_LIKE = (c: string | null | undefined) => !!c && (CROPS[c]?.season === 'winter' || CROPS[c]?.season === 'perennial');

export default function FieldsPage() {
  const s = useStore();
  const fields = s.fields;
  const [tab, setTab] = useQueryState<'fields' | 'timelines'>('tab', 'fields');
  const cropNow = (id: string) => fields.find(x => x.id === id)!.history[Y]?.crop ?? null;
  const sownNext = fields.filter(x => s.current[x.id] && CROPS[s.current[x.id]!].season !== 'perennial');
  const fill = useMemo(() => Object.fromEntries(fields.map(f => [f.id, sownNext.length ? (s.current[f.id] ? cropColor(s.current[f.id]) : '#ffffff') : cropColor(f.history[Y]?.crop)])), [fields, s.current, sownNext.length]);
  const f = fields.find(x => x.id === s.field)!;
  const fp = products.fields[s.field];
  const fi = fieldIndex.fields[s.field];
  const idx = (c: CropId) => fieldFactor(s.ctx, s.field, c);
  const signedPct = (v: number) => `${v >= 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 100))} %`;
  const status = (id: string): string => {
    const cur = s.current[id];
    if (cur && CROPS[cur].season !== 'perennial') return `sown for ${NEXT}`;
    const st = standing(cropNow(id));
    return st.state === 'stays' ? 'stays in grass' : st.state === 'standing' ? `stands until about ${short(st.from!)}` : st.state === 'harvest' ? `harvest under way, to ${short(st.to!)}` : st.state === 'harvested' ? `harvested, free for ${NEXT}` : 'crop unknown';
  };
  const count = (state: string) => fields.filter(x => !(s.current[x.id] && CROPS[s.current[x.id]!].season !== 'perennial') && standing(cropNow(x.id)).state === state).length;
  const spring = springHint(f.id), autumn = autumnHint(f.id);
  const agrees = spring.overwintered === null || !cropNow(f.id) ? null : spring.overwintered === WINTER_LIKE(cropNow(f.id));
  useScreen(`organization/${tab}`, { decisionDay: DECISION_DATE, selectedField: f.id, cropOfThisYear: Object.fromEntries(fields.map(x => [x.id, `${cropLabel(cropNow(x.id))}: ${status(x.id)}`])), sownForNextHarvest: Object.fromEntries(fields.map(x => [x.id, s.current[x.id] ? CROPS[s.current[x.id]!].name : 'nothing yet'])),
    satelliteHintForSelected: { earlySpringGreenness: spring.maxNdvi, suggestsWinterCropOrGrass: spring.overwintered, agreesWithEntry: agrees, accuracy: SPRING_HINT.accuracy, autumnHint: autumn.winterCropSuggested === null ? 'not yet observed on the decision day' : autumn },
    fieldIndexForSelected: fi ? { seasons: fi.k, percentileAmongNeighbours: fi.percentile, winterWheat: +idx('winter_wheat').toFixed(3), rapeseed: +idx('winter_rapeseed').toFixed(3), legumes: +idx('faba_bean').toFixed(3) } : null });
  const tabs = <Tabs label="Fields views" tabs={[{ id: 'fields', label: `On the fields now` }, { id: 'timelines', label: 'Field timelines' }]} value={tab} onChange={setTab} />;

  if (tab === 'timelines') return (
    <div className="page">
      <div className="page-head"><h1>Fields</h1>{tabs}</div>
      <Panel title="Every field is a timeline" sub={`plan to the harvest of ${PLAN_YEARS[PLAN_YEARS.length - 1]}`}>
        <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, null)} from={Y - 2} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i className="sw" style={{ background: '#c79a1e', opacity: 0.62 }} />crop of a past harvest or of {Y}</span>
          {sownNext.length > 0 && <span><i className="sw" style={{ background: '#c79a1e' }} />sown for {NEXT}</span>}
          <span><i className="sw" style={{ border: '1.5px dashed #2f6b3c', background: 'none' }} /><Term id="slot">free slot</Term>&nbsp;for the plan to fill</span>
        </div>
      </Panel>
      <p className="note">{sownNext.length > 0 ? `Fields that are sown for ${NEXT} open again after that harvest; the others are free from the harvest of their ${Y} crop.` : `Every field is free from the harvest of its ${Y} crop; a field in grass stays in grass.`}{fields.every(x => !x.history[Y - 2]?.crop) ? ` The ${Y - 2} crop is known only as a declaration class.` : ''}</p>
    </div>
  );

  return (
    <div className="split" style={{ ['--side' as string]: '470px' }}>
      <aside className="dock">
        <div className="page-head"><h1>Fields</h1>{tabs}</div>
        <p className="lead">Confirm what is on each field on {niceDate(DECISION_DATE)}: {[[count('standing'), 'still standing'], [count('harvest'), 'being harvested'], [count('harvested'), 'harvested'], [count('stays'), 'in grass']].filter(([n]) => n).map(([n, t]) => `${n} ${t}`).join(', ')}. {sownNext.length ? `${sownNext.length} fields are already sown for ${NEXT} and stay fixed; the plan fills the others.` : `Nothing is sown for ${NEXT} yet, so the plan decides every field.`}</p>
        <div><Link className="btn pri" href="/scenes">Next: what the satellites see →</Link></div>
        <div className="scroll-x">
          <table style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup><col style={{ width: 88 }} /><col /><col /></colgroup>
            <thead><tr><th>Field</th><th>Crop of {Y}</th><th>{SOWING_STARTED ? `Sown for ${NEXT}` : 'Today'}</th></tr></thead>
            <tbody>{fields.map(x => (
              <tr key={x.id} className={`click${x.id === s.field ? ' sel' : ''}`} onClick={() => s.setField(x.id)}>
                <td className="nw"><b>{x.id}</b> <small>{x.areaHa.toFixed(1)} ha</small></td>
                <td><Select small block label={`Crop of ${Y} on ${x.id}`} value={cropNow(x.id) ?? ''} options={cropNow(x.id) ? YEAR_OPTIONS : [{ value: '', label: 'Unknown' }, ...YEAR_OPTIONS]} onChange={v => v && s.confirmCrop(x.id, v)} /></td>
                <td className="small">{SOWING_STARTED ? <Select small block label={`Sown for ${NEXT} on ${x.id}`} value={s.current[x.id] ?? ''} options={NEXT_OPTIONS} onChange={v => s.setCurrent(x.id, v || null)} /> : status(x.id)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="note">The crops of {Y} are pre-filled from the paying agency’s {Y} layer; no open data know your fields better than you, so the entry is yours.{SOWING_STARTED ? ` What is sown for ${NEXT} is a demo preset.` : ''}</p>
      </aside>
      <div className="mapbox">
        <FarmMap fill={fill} selected={s.field} onSelect={s.setField} />
        <div className="mapcard">
          <h3>{f.id} <small>{f.areaHa.toFixed(1)} ha · {status(f.id)}</small></h3>
          <p className="small">{[Y - 2, Y - 1, Y].map(y => cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')).join(' → ')}</p>
          <p className="small"><Term id="fieldIndex">Yield against neighbours</Term> (NASA HLS): {fi && fi.k ? <><b>{signedPct(idx('winter_wheat'))}</b> wheat, <b>{signedPct(idx('winter_rapeseed'))}</b> rapeseed, <b>{signedPct(idx('faba_bean'))}</b> legumes</> : 'no season with a comparable crop: counted as the district'}</p>
          {spring.overwintered !== null && <p className="small" title={SPRING_HINT.accuracy}><b>NASA satellite, early spring {Y}:</b> {spring.overwintered ? 'green, so a winter crop or grass' : 'bare, so a spring-sown crop'}. {agrees === false ? <Pill tone="warn">differs from the entry: check</Pill> : agrees ? <Pill tone="ok">agrees with the entry</Pill> : null}</p>}
          {autumn.winterCropSuggested !== null && <p className="small" title={AUTUMN_HINT.accuracy}><b>NASA satellite, autumn {Y}:</b> {autumn.winterCropSuggested ? <Pill tone="ok">a winter crop is sown</Pill> : 'no sign of sowing'}</p>}
          <More label="More about this field">
            <dl className="kv">
              <dt>Early spring {Y}</dt><dd><Term id="ndvi">NDVI</Term> {spring.maxNdvi?.toFixed(2) ?? 'no clear view'}, 16 March – 15 April</dd>
              {autumn.winterCropSuggested !== null && <><dt>Autumn {Y}</dt><dd>NDVI {autumn.minNdvi?.toFixed(2)} → {autumn.lateNdvi?.toFixed(2)}</dd></>}
              <dt>Among neighbours</dt><dd>{fi && fi.k ? `${Object.entries(fi.percentile).map(([y, p]) => `${y}: ${p}th`).join(', ')} percentile of fields with the same crop within ${fieldIndex.radiusM / 1000} km; reliability ${fi.reliability.toFixed(2)}` : 'no comparable season'}</dd>
              <dt>Soil</dt><dd>{f.soilType ?? 'unknown'}, texture {f.soilTexture ?? 'unknown'}</dd>
              <dt>Relief</dt><dd>slope {fp.terrain.slopePct} %, {Math.abs(fp.terrain.relHeight500m)} m {fp.terrain.relHeight500m > 0 ? 'above' : 'below'} surroundings</dd>
              <dt>Rule layers</dt><dd>{pct(f.erosionShare)} erosion-sensitive, {pct(f.peatShare)} peat</dd>
            </dl>
            <Check>the satellite hint only supports your entry. {SPRING_HINT.accuracy}</Check>
            <Check>the field index is calibrated on district yields, not on this field’s own harvests; it is capped at ±20 %.</Check>
          </More>
        </div>
        <div className="maplegend">{sownNext.length ? <><span><Sw c="#c79a1e" />sown for {NEXT} (colour = crop)</span><span><Sw c="#ffffff" />free</span></> : <span><Sw c="#c79a1e" />colour = crop of {Y}</span>}</div>
      </div>
    </div>
  );
}

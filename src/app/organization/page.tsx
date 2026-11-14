'use client';
// Fields: stage 2, what is on each field on the decision day (the agronomist's entry, pre-filled from the declared
// crops and checked against what NASA HLS saw before that day), and the timeline of every field with its free slots.
// Nothing here names a date: what is standing, what is harvested and what can already be sown follow the decision day.
import dynamic from 'next/dynamic';
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
// where the previous crop is on the decision day (from its harvest window in the crop guides, not observed), one
// marker per state, the same in the summary, the table and the card
type State = 'done' | 'part' | 'wait' | 'grass' | 'sown' | 'unknown';
const STATES: State[] = ['done', 'part', 'wait', 'grass', 'sown', 'unknown'];
const STATE_LABEL: Record<State, string> = { done: 'Harvested', part: 'Being harvested', wait: 'Not yet harvested', grass: 'Grass, stays', sown: `Sown for ${NEXT}`, unknown: 'Crop unknown' };
const Dot = ({ s }: { s: State }) => <i className={`dot is-${s}`} aria-hidden />;

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
  const stateOf = (id: string): State => {
    const cur = s.current[id];
    if (cur && CROPS[cur].season !== 'perennial') return 'sown';
    return ({ stays: 'grass', standing: 'wait', harvest: 'part', harvested: 'done', unknown: 'unknown' } as const)[standing(cropNow(id)).state];
  };
  // when the field is free for the next crop: the end of the harvest window
  const freeOf = (id: string): string => {
    const st = stateOf(id), to = standing(cropNow(id)).to;
    return st === 'done' ? 'now' : st === 'part' || st === 'wait' ? `by ${short(to!)}` : st === 'grass' ? 'stays in grass' : st === 'sown' ? `after the ${NEXT} harvest` : '—';
  };
  const count = (st: State) => fields.filter(x => stateOf(x.id) === st).length;
  const spring = springHint(f.id), autumn = autumnHint(f.id);
  const agrees = spring.overwintered === null || !cropNow(f.id) ? null : spring.overwintered === WINTER_LIKE(cropNow(f.id));
  useScreen(`organization/${tab}`, { decisionDay: DECISION_DATE, selectedField: f.id, previousCrop: Object.fromEntries(fields.map(x => [x.id, `${cropLabel(cropNow(x.id))}: ${STATE_LABEL[stateOf(x.id)].toLowerCase()}, free for the next crop ${freeOf(x.id)}`])), sownForNextHarvest: Object.fromEntries(fields.map(x => [x.id, s.current[x.id] ? CROPS[s.current[x.id]!].name : 'nothing yet'])),
    satelliteHintForSelected: { earlySpringGreenness: spring.maxNdvi, suggestsWinterCropOrGrass: spring.overwintered, agreesWithEntry: agrees, accuracy: SPRING_HINT.accuracy, autumnHint: autumn.winterCropSuggested === null ? 'not yet observed on the decision day' : autumn },
    fieldIndexForSelected: fi ? { seasons: fi.k, percentileAmongNeighbours: fi.percentile, winterWheat: +idx('winter_wheat').toFixed(3), rapeseed: +idx('winter_rapeseed').toFixed(3), legumes: +idx('faba_bean').toFixed(3) } : null });
  const tabs = <Tabs label="Fields views" tabs={[{ id: 'fields', label: 'Previous season' }, { id: 'timelines', label: 'Field timelines' }]} value={tab} onChange={setTab} />;

  if (tab === 'timelines') return (
    <div className="page fit">
      <div className="page-head"><h1>Fields</h1>{tabs}</div>
      <Panel title="Every field is a timeline" sub={`the plan covers the harvests of ${PLAN_YEARS.join(' and ')}`}>
        <div className="legend" style={{ marginBottom: 10 }}>
          <span><i className="sw tl-key" />crop in the field, with its sowing and harvest windows at the ends</span>
          {sownNext.length > 0 && <span><i className="sw" style={{ background: '#c79a1e' }} />sown for {NEXT}</span>}
          <span><i className="sw" style={{ border: '1.5px dashed #2f6b3c', background: 'none' }} /><Term id="slot">free slot</Term>&nbsp;for the plan to fill</span>
        </div>
        <div className="scroll-x"><Timeline rows={planRows(fields, s.setup, null)} from={Y - 2} to={PLAN_YEARS[PLAN_YEARS.length - 1]} decision={DECISION_DATE} selected={s.field} onSelect={s.setField} /></div>
      </Panel>
    </div>
  );

  return (
    <div className="split" style={{ ['--side' as string]: '470px' }}>
      <aside className="dock">
        <div className="page-head"><h1>Fields</h1>{tabs}</div>
        <div>
          <span className="lbl">On {niceDate(DECISION_DATE)}</span>
          <table className="mini"><tbody>{STATES.filter(k => count(k)).map(k => <tr key={k}><td><Dot s={k} />{STATE_LABEL[k]}</td><td className="n">{count(k)} {count(k) === 1 ? 'field' : 'fields'}</td></tr>)}</tbody></table>
        </div>
        <div className="scroll-x">
          <table style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup><col style={{ width: 88 }} /><col /><col /></colgroup>
            <thead><tr><th>Field</th><th>Previous crop</th><th>{SOWING_STARTED ? `Sown for ${NEXT}` : 'Free for the next crop'}</th></tr></thead>
            <tbody>{fields.map(x => (
              <tr key={x.id} className={`click${x.id === s.field ? ' sel' : ''}`} onClick={() => s.setField(x.id)}>
                <td className="nw"><b>{x.id}</b> <small>{x.areaHa.toFixed(1)} ha</small></td>
                <td><Select small block label={`Previous crop on ${x.id}`} value={cropNow(x.id) ?? ''} options={cropNow(x.id) ? YEAR_OPTIONS : [{ value: '', label: 'Unknown' }, ...YEAR_OPTIONS]} onChange={v => v && s.confirmCrop(x.id, v)} /></td>
                <td className="nw">{SOWING_STARTED ? <Select small block label={`Sown for ${NEXT} on ${x.id}`} value={s.current[x.id] ?? ''} options={NEXT_OPTIONS} onChange={v => s.setCurrent(x.id, v || null)} /> : <><Dot s={stateOf(x.id)} />{freeOf(x.id)}</>}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="note">Pre-filled from the {Y} crop declarations. Correct a crop if it is wrong.{SOWING_STARTED ? ` What is sown for ${NEXT} is a demo preset.` : ''}</p>
      </aside>
      <div className="mapbox">
        <FarmMap fill={fill} selected={s.field} onSelect={s.setField} />
        <div className="mapcard">
          <h3>{f.id} <small>{f.areaHa.toFixed(1)} ha · {STATE_LABEL[stateOf(f.id)].toLowerCase()}</small></h3>
          <p className="small">{[Y - 2, Y - 1, Y].map(y => cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')).join(' → ')}</p>
          <p className="small"><Term id="fieldIndex">Yield against neighbours</Term>: {fi && fi.k ? <><b>{signedPct(idx('winter_wheat'))}</b> wheat, <b>{signedPct(idx('winter_rapeseed'))}</b> rapeseed, <b>{signedPct(idx('faba_bean'))}</b> legumes</> : 'not known, counted as average'}</p>
          {spring.overwintered !== null && <p className="small"><b>Satellite, early spring {Y}:</b> {spring.overwintered ? 'green, so a winter crop or grass' : 'bare, so a spring-sown crop'}. {agrees === false ? <Pill tone="warn">differs from the entry: check</Pill> : agrees ? <Pill tone="ok">agrees with the entry</Pill> : null}</p>}
          {autumn.winterCropSuggested !== null && <p className="small"><b>Satellite, autumn {Y}:</b> {autumn.winterCropSuggested ? <Pill tone="ok">a winter crop is sown</Pill> : 'no sign of sowing'}</p>}
          <More label="More about this field">
            <dl className="kv">
              <dt>Slope</dt><dd>{fp.terrain.slopePct} %, {Math.abs(fp.terrain.relHeight500m)} m {fp.terrain.relHeight500m > 0 ? 'above' : 'below'} the land around</dd>
              <dt>Erosion-sensitive</dt><dd>{pct(f.erosionShare)} of the field</dd>
              {f.peatShare > 0 && <><dt>Peat soil</dt><dd>{pct(f.peatShare)} of the field</dd></>}
            </dl>
            <Check>the satellite hint can be wrong; what you know of the field comes first.</Check>
          </More>
        </div>
        <div className="maplegend">{sownNext.length ? <><span><Sw c="#c79a1e" />sown for {NEXT} (colour = crop)</span><span><Sw c="#ffffff" />free</span></> : <span><Sw c="#c79a1e" />colour = crop of {Y}</span>}</div>
      </div>
    </div>
  );
}

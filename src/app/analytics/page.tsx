'use client';
// Analytics: what the plan characteristics are built from. Seasons (when fields are bare, which months are
// risky), risk zones with a "what if" on season frequency, and the evidence behind each characteristic.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Intervals, NdviProfile, WaterBalance } from '@/components/Charts';
import { cropColor, rampCss, rampFor } from '@/components/colors';
import { grid, layerImage } from '@/components/grid';
import { ErosivityChart, ErosivityLegend, SoilHelpButton, soilCheck } from '@/components/Soil';
import { useScreen, useStore } from '@/components/store';
import { Check, More, Panel, Select, Sw, Tabs, Term, pct, useQueryState } from '@/components/ui';
import hazardsJson from '@/data/hazards.json';
import { DECISION_DATE, DECISION_YEAR, PLAN_YEARS, coverModel, fieldIndex, fields, niceDate, products, weather } from '@/pilot/demo';
import { bareCalendar, seasonCover, series } from '@/pilot/satellite';
import { soilClimate, soilParams } from '@/pilot/soil';
import { coverDays } from '@/engine/characteristics';
import { partsOf } from '@/engine/editor';
import { CROPS, cropLabel } from '@/pilot/regional';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
const hazards = hazardsJson as any;
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quant = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
type Tab = 'bare' | 'weather' | 'zones' | 'method';
type Zone = 'erosion' | 'low' | 'dry';

function cropMonths(id: string): (string | null)[] {
  const c = CROPS[id]; const out: (string | null)[] = Array(12).fill(null);
  if (!c?.sowing.from || !c.harvest.to || !c.harvest.from) return out;
  const s0 = +c.sowing.from.slice(0, 2) - 1, s1 = +c.sowing.to!.slice(0, 2) - 1, h0 = +c.harvest.from.slice(0, 2) - 1, h1 = +c.harvest.to.slice(0, 2) - 1;
  for (let m = (s1 + 1) % 12; m !== h0; m = (m + 1) % 12) out[m] = 'grow';
  for (let m = s0; m <= s1; m++) out[m] = 'sow';
  for (let m = h0; m <= h1; m++) out[m] = 'harvest';
  return out;
}

function Seasons({ part }: { part: 'bare' | 'weather' }) {
  const s = useStore();
  // the crops of the selected plan: the calendar under the hazards shows when they are sown and harvested
  const crops = [...new Set((s.plan?.v.options ?? []).flatMap(o => o.crops))].filter(c => CROPS[c].season !== 'perennial').slice(0, 6);
  const hz = (id: string, m: number) => Math.round((hazards.hazards.find((h: any) => h.id === id)?.byMonth[m] ?? 0) * 100);
  return (
    <>
      {part === 'bare' && <Panel title="When are the fields bare?" sub={<>share of the years 2016–{DECISION_YEAR} in which the field was mostly bare, by half-month · NASA <Term id="hls">HLS</Term>, as seen up to {niceDate(DECISION_DATE)}</>}>
        <div className="scroll-x">
          <table className="heat">
            <thead><tr><th>Field</th>{M.map((m, i) => <th key={i} className="c" colSpan={2}>{m}</th>)}<th className="n"><Term id="bareDays">Days without cover</Term> a year</th></tr></thead>
            <tbody>{fields.map(f => { const cal = bareCalendar(f.id); const tot = seasonCover(f.id).filter(x => x.total != null).map(x => x.total as number); return (
              <tr key={f.id} className={`click${s.field === f.id ? ' sel' : ''}`} onClick={() => s.setField(f.id)}>
                <td className="lab"><b>{f.id}</b></td>
                {cal.map(c => <td key={c.halfMonth} className={`cell${c.bareShare === null ? ' nodata' : ''}`} style={c.bareShare === null ? undefined : { background: `rgb(${rampFor('spring_bare').rgb(c.bareShare).join(',')})` }} title={c.bareShare === null ? 'no clear view (cloud, snow, low sun)' : `bare in ${Math.round(c.bareShare * 100)} % of ${c.yearsObserved} observed years`} />)}
                <td className="lab n">{tot.length ? Math.round(quant(tot, 0.5)) : '—'}</td>
              </tr>); })}</tbody>
          </table>
        </div>
        <div className="legend" style={{ marginTop: 10 }}><span><Sw c="#1a7d3a" />never bare</span><span><Sw c="#ffffbf" />half the years</span><span><Sw c="#a6611a" />always bare</span><span><i className="sw nodata" style={{ background: 'repeating-linear-gradient(45deg,#cfd8cc 0 3px,#f3f6f1 3px 6px)' }} />no clear view in winter</span></div>
        <div style={{ marginTop: 8 }}><Check>stubble is not visible to the satellite, so a field shown bare in autumn may be covered by stubble.</Check></div>
      </Panel>}
      {part === 'bare' && <div className="cols">
        <Panel title="When does bare soil erode?" sub={<>NASA <Term id="imerg">GPM IMERG</Term>, {soilClimate.period}</>} right={<SoilHelpButton />}>
          <ErosivityChart /><ErosivityLegend />
          <p className="note" style={{ marginTop: 8 }}>Bars: the share of the year’s <Term id="erosivity">erosive rain</Term> in each half-month, July to June. June to August carry {Math.round(soilClimate.erosivity.summary[soilClimate.erosivity.base].junToAug * 100)} %, December to February {Math.round(soilClimate.erosivity.summary[soilClimate.erosivity.base].decToFeb * 100)} %. Lines: how bare the soil is under four crop sequences (NASA HLS, 1 700 declared fields). The plan measure multiplies the two: the numbers in the legend are days without cover a year, weighted by erosive rain.</p>
        </Panel>
        <Panel title="When does bare soil lose nitrate?" sub={<>NASA GPM IMERG and <Term id="power">POWER</Term>, {soilClimate.period}</>}>
          <ErosivityChart leaching /><ErosivityLegend leaching />
          <p className="note" style={{ marginTop: 8 }}>Bars: the share of the <Term id="leaching">leaching season</Term>’s water surplus (rain above evaporative demand, September to February: {soilClimate.leaching.seasonSurplusMm} mm in a median season). The numbers in the legend are days of bare soil in that season. A green autumn, a catch crop or an early-sown winter crop, is what lowers it.</p>
        </Panel>
      </div>}

      {part === 'weather' && <Panel title="Which months are risky here?" sub={`share of the years ${hazards.period} with the event · NASA GPM IMERG rain, NASA POWER temperature`}>
        <div className="scroll-x">
          <table className="heat">
            <thead><tr><th>Hazard</th>{M.map((m, i) => <th key={i} className="c">{m}</th>)}</tr></thead>
            <tbody>
              {hazards.hazards.map((h: any) => (
                <tr key={h.id}><td className="lab" title={h.definition}>{h.label}</td>
                  {h.byMonth.map((v: number | null, i: number) => <td key={i} className="cell" style={v ? { background: `rgba(181,69,44,${0.1 + v * 0.8})`, color: v > 0.45 ? '#fff' : 'inherit' } : undefined} title={v === null ? 'not counted in this month' : `${Math.round(v * 100)} % of years`}>{v ? Math.round(v * 100) : ''}</td>)}
                </tr>))}
              {crops.map((id, n) => { const cm = cropMonths(id); return (
                <tr key={id}><td className="lab" style={n === 0 ? { paddingTop: 14 } : undefined}><Sw c={cropColor(id)} />{CROPS[id].name}</td>
                  {cm.map((v, i) => <td key={i} className={`cell${v === 'grow' ? ' grow' : v ? ' key' : ''}`} style={n === 0 ? { borderTop: '8px solid #fff' } : undefined}>{v === 'grow' ? '' : v === 'harvest' ? 'harv' : v ?? ''}</td>)}
                </tr>); })}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>Numbers are per cent of years. Below them, the sowing (sow) and harvest (harv) months of the crops of “{s.plan?.name ?? 'the selected plan'}” : a risky month under one of them is a vulnerable season. Frost of −2 °C came in April in {hz('frost', 3)} % of years, when spring crops emerge; heavy rain came in July in {hz('heavyRain', 6)} % of years, at cereal harvest.</p>
        <div style={{ marginTop: 6 }}><Check>weather comes from one grid cell (10–50 km), the same for every field; thresholds are working values.</Check></div>
      </Panel>}
    </>
  );
}

function Zones({ head }: { head: React.ReactNode }) {
  const s = useStore();
  const [zone, setZone] = useQueryState<Zone>('view', 'erosion');
  const [k, setK] = useState(1);
  const [low, setLow] = useState<string | null>(null);
  useEffect(() => { setLow(layerImage('rel_height', true)); }, []);
  const shown = s.plans.filter(p => p.kind !== 'front');
  const parts = useMemo(() => (s.plan ? partsOf(s.ws, s.plan.v.options) : []), [s.plan, s.ws]);
  const fill = useMemo(() => {
    const o: Record<string, string> = {};
    fields.forEach((f, i) => {
      if (zone === 'erosion') o[f.id] = '#ffffff';
      else if (zone === 'dry') { const c = s.plan?.v.options[i]?.crops[s.yearIdx]; const season = c ? CROPS[c].season : 'spring'; o[f.id] = season === 'spring' ? '#d08a2e' : season === 'winter' ? '#ecdcae' : '#8dbb6a'; }
    });
    return o;
  }, [zone, s.plan, s.yearIdx]);
  const weighted = (series: { margin: number; type: string }[]) => { let a = 0, b = 0; for (const x of series) { const w = x.type === 'dry' ? k : 1; a += w * x.margin; b += w; } return Math.round(a / b); };
  const steepHa = fields.reduce((a, f) => a + f.erosionShare * f.areaHa, 0);
  const onSteep = (v: number) => Math.round(v / steepHa);
  const maxSlopes = Math.max(1, ...shown.map(p => onSteep(p.v.ch.bareOnSlopes)));
  const frost = hazards.hazards.find((h: any) => h.id === 'frost').byMonth;
  const steep = fields.filter(f => f.erosionShare > 0.005).sort((a, b) => b.erosionShare - a.erosionShare);
  useScreen('analytics/zones', { view: zone, selectedPlan: s.plan?.name, drySeasonsMultiplier: k,
    bareOnErosionSensitiveByPlan: Object.fromEntries(shown.map(p => [p.name, p.v.ch.bareOnSlopes])), fieldBareOnErosionLand: Object.fromEntries(fields.map((f, i) => [f.id, parts[i] ? Math.round(parts[i]!.bareSlopes) : null])),
    marginIfDrySeasonsMoreOften: Object.fromEntries(shown.map(p => [p.name, weighted(p.v.ch.marginSeries)])) });

  return (
    <div className="split right" style={{ ['--side' as string]: '400px' }}>
      <div className="mapbox">
        <FarmMap fill={zone === 'low' ? {} : fill} fillOpacity={zone === 'erosion' ? 0.55 : 0.75} raster={zone === 'low' && low ? { url: low, bounds: grid.bounds } : null} showErosion={zone === 'erosion'} selected={s.field} onSelect={s.setField} />
        <div className="maplegend">
          {zone === 'erosion' && <span><Sw c="#b5452c" />erosion-sensitive land (official layer)</span>}
          {zone === 'low' && <div style={{ width: 220 }}><div className="ramp" style={{ background: rampCss('rel_height') }} /><div className="ramp-t">{rampFor('rel_height').ticks.map(t => <span key={t}>{t}</span>)}</div></div>}
          {zone === 'dry' && <><span><Sw c="#d08a2e" />spring-sown in {PLAN_YEARS[s.yearIdx]}: most exposed</span><span><Sw c="#ecdcae" />winter crop</span><span><Sw c="#8dbb6a" />grass</span></>}
        </div>
      </div>
      <aside className="dock">
        {head}
        <Select block label="Risk view" value={zone} onChange={setZone} options={[{ value: 'erosion', label: 'Erosion-sensitive land' }, { value: 'low', label: 'Low spots and late frost' }, { value: 'dry', label: 'Dry seasons' }]} />
        {zone === 'erosion' && <>
          <p className="lead">Bare soil erodes most on the {steepHa.toFixed(0)} ha of erosion-sensitive land (red). How long each plan leaves that land without cover, counted by how erosive the rain is:</p>
          <table>
            <thead><tr><th>Plan</th><th className="n"><Term id="soilDays">Days without cover</Term> a year</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>{shown.map(p => (
              <tr key={p.id} className={`click${p.id === s.planId ? ' sel' : ''}`} onClick={() => s.setPlanId(p.id)}>
                <td>{p.name}</td><td className="n"><b>{onSteep(p.v.ch.bareOnSlopes)}</b></td><td><span className="bar"><i style={{ width: `${(onSteep(p.v.ch.bareOnSlopes) / maxSlopes) * 100}%`, background: 'var(--dry)' }} /></span></td>
              </tr>))}</tbody>
          </table>
          <More label={`${steep.length} fields have such land`}>
            <table><tbody>{steep.map(f => <tr key={f.id} className={`click${s.field === f.id ? ' sel' : ''}`} onClick={() => s.setField(f.id)}><td><b>{f.id}</b></td><td className="n">{(f.erosionShare * f.areaHa).toFixed(1)} ha</td><td className="n">{pct(f.erosionShare)} of the field</td></tr>)}</tbody></table>
          </More>
          {fields.filter(x => s.current[x.id] && x.erosionShare > 0.005).length > steep.length / 2 && <p className="note">The plans differ little here: most of this land is already sown for {PLAN_YEARS[0]}.</p>}
          <Check>gullies and drains are not visible at 30 m. Plough across the slope; walk the red zones after heavy rain.</Check>
        </>}
        {zone === 'low' && <>
          <p className="lead">Fields below their surroundings collect cold air and stay wet longer in spring (<Term id="nasadem">NASADEM</Term>).</p>
          <table>
            <thead><tr><th>Field</th><th className="n">Against surroundings</th><th className="n">Slope</th></tr></thead>
            <tbody>{[...fields].sort((a, b) => products.fields[a.id].terrain.relHeight500m - products.fields[b.id].terrain.relHeight500m).slice(0, 6).map(f => { const t = products.fields[f.id].terrain; return (
              <tr key={f.id} className={`click${s.field === f.id ? ' sel' : ''}`} onClick={() => s.setField(f.id)}><td><b>{f.id}</b></td><td className="n">{t.relHeight500m > 0 ? '+' : ''}{t.relHeight500m} m</td><td className="n">{t.slopePct} %</td></tr>); })}</tbody>
          </table>
          <p className="small">Frost of −2 °C came in April in <b>{Math.round(frost[3] * 100)} %</b> of years and in May in <b>{Math.round(frost[4] * 100)} %</b>.</p>
          <Check>the weather cell is about 50 km wide and cannot tell a hollow from a hilltop. Low spots are a place to look, not a frost map.</Check>
        </>}
        {zone === 'dry' && <>
          <p className="lead"><Term id="drySeason">Dry seasons</Term>: the lowest fifth of the May–July <Term id="waterBalance">water balance</Term> ({weather.dryYears.join(', ')}).</p>
          <WaterBalance years={weather.years} />
          <div>
            <label className="lbl" htmlFor="dryk">What if dry years came more often? Now: {k === 1 ? 'as in the past (one year in five)' : `${k}× as often`}</label>
            <input id="dryk" type="range" min={1} max={3} step={0.5} value={k} onChange={e => setK(+e.target.value)} />
            <div className="ramp-t"><span>as in the past</span><span>2×</span><span>3× as often</span></div>
          </div>
          <table>
            <thead><tr><th>Plan, margin in €/ha</th><th className="n">As in the past</th><th className="n">{k === 1 ? 'Move the slider' : `Dry years ${k}× as often`}</th></tr></thead>
            <tbody>{shown.map(p => { const w = weighted(p.v.ch.marginSeries); return (
              <tr key={p.id} className={`click${p.id === s.planId ? ' sel' : ''}`} onClick={() => s.setPlanId(p.id)}><td>{p.name}</td><td className="n">{p.v.ch.marginMean}</td><td className="n">{k === 1 ? '—' : <><b>{w}</b><span className="bad"> {w - p.v.ch.marginMean}</span></>}</td></tr>); })}</tbody>
          </table>
          <p className="note">The slider re-weights past seasons; it does not model a new climate.</p>
        </>}
      </aside>
    </div>
  );
}

function Evidence() {
  const s = useStore();
  const [year, setYear] = useState(String(DECISION_YEAR));
  const f = s.fields.find(x => x.id === s.field)!;
  const soil = soilParams();
  const stay = soilCheck.variants.filter(v => v.basePlanRank === 1).length;
  // greenness of the last four years, as seen up to the decision day
  const ndvi = useMemo(() => Object.fromEntries(Object.entries(series(f.id)).filter(([k]) => +k.slice(0, 4) >= DECISION_YEAR - 3)), [f.id]);
  const yields = useMemo(() => s.cropSet.filter(c => s.ws.pre.normal[c] && s.ws.pre.revenueYield[c] && c !== 'sugar_beet').map(c => {
    const n = s.ws.pre.normal[c], ys = s.ws.pre.revenueYield[c].map(r => r / n.priceEurT);
    return { label: CROPS[c].name, color: cropColor(c), lo: quant(ys, 0.1), mid: n.yieldTHa, hi: quant(ys, 0.9) };
  }), [s.cropSet, s.ws]);
  const seq = ['mid>august', 'mid>september', 'mid>spring_early>green_autumn', 'mid>spring_early>open_autumn', 'late>spring_late', 'grass>grass'];
  return (
    <>
      <Panel title="How each number of a plan is built, and how it was checked">
        <div className="scroll-x">
          <table>
            <thead><tr><th>Measure of a plan</th><th>Built from</th><th>How it was checked</th></tr></thead>
            <tbody>
              <tr><td><b><Term id="margin">Margin</Term></b>, usual and <Term id="worstFifth">bad seasons</Term></td><td>District yields, prices, 2025 payment rates, <Term id="replay">replayed</Term> through {s.ctx.replay.firstSeason}–{s.ctx.replay.lastSeason}</td><td>Yield ranges held the real yield in 80 % of 3 319 cases.</td></tr>
              <tr><td><b><Term id="fieldIndex">Field index</Term></b> in the margin</td><td>NASA <Term id="hls">HLS</Term> season peak <Term id="ndvi">NDVI</Term> of each field against neighbours with the same crop, seasons {fieldIndex.seasons.join(', ')}; district yields for the conversion</td><td>A field keeps its place for years (r 0.31–0.40 up to 5 years apart); predicted 2026 from earlier seasons with r 0.52 on 1 075 fields.</td></tr>
              <tr><td><b>Margin in a <Term id="wetHarvest">wet harvest</Term></b></td><td>NASA <Term id="imerg">GPM IMERG</Term> rain 20 Jul – 31 Aug; elevator drying tariffs and buyer price lists 2025</td><td>Drying 7.5 € per tonne per % moisture is a published tariff; the extra moisture and the feed share are estimates.</td></tr>
              <tr><td><b>Margin in <Term id="drySeason">dry seasons</Term></b></td><td>NASA <Term id="imerg">GPM IMERG</Term> rain, NASA <Term id="power">POWER</Term> temperature</td><td>In dry seasons spring cereals yielded 16 % below normal.</td></tr>
              <tr><td><b><Term id="soilDays">Soil without cover</Term></b>, weighted by erosive rain</td><td>NASA <Term id="hls">HLS</Term>, 30 m, 1 700 declared fields, by half-month; NASA <Term id="imerg">GPM IMERG</Term> half-hourly rain {soilClimate.period}</td><td>With equal weights it equals the plain days (unit test). The Best-for-soil plan stays first of {soilCheck.plans} under {stay} of {soilCheck.variants.length} other ways to compute the weights.</td></tr>
              <tr><td><b><Term id="bareDays">Days without living cover</Term></b></td><td>NASA <Term id="hls">HLS</Term>, 30 m, 1 700 declared fields</td><td>Cover curves follow the declared crops: {Math.min(...seq.slice(0, 5).map(k => coverModel.model[k]?.total[1] ?? 999))} to {Math.max(...seq.map(k => coverModel.model[k]?.total[1] ?? 0))} bare days by crop sequence.</td></tr>
              <tr><td><b>The same on erosion-sensitive land</b></td><td>Official layer with the HLS cover model and the IMERG weights</td><td>NASADEM slope alone was rejected: 36 % agreement with the official layer.</td></tr>
              <tr><td><b>Bare soil in the <Term id="leaching">leaching season</Term></b>; <Term id="wetSoilHarvest">harvest on wet soil</Term></td><td>NASA HLS cover; NASA GPM IMERG rain and NASA <Term id="power">POWER</Term> temperature</td><td>Not validated: they show exposure, not leached nitrogen or compaction.</td></tr>
              <tr><td><b><Term id="humus">Humus balance</Term></b></td><td>Coefficients of the VDLUFA method, yields as in the margin</td><td>An accounting indicator: it compares plans and does not predict measured soil carbon.</td></tr>
              <tr><td><b>Cereal after cereal</b>, legumes, crop families</td><td>Crop guides (LAMMC), field history</td><td>Yield effects are from literature, not local trials.</td></tr>
              <tr><td><b>Rules and payments</b></td><td>EU farm-payment conditions as they apply in Lithuania</td><td>Thresholds checked against the acts.</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="cols">
        <Panel title={`Greenness through the year · ${f.id}`} right={<><Select small label="Field" value={s.field} onChange={s.setField} options={fields.map(x => ({ value: x.id, label: x.id }))} /><Select small label="Year" value={year} onChange={setYear} options={[DECISION_YEAR - 2, DECISION_YEAR - 1, DECISION_YEAR].map(y => ({ value: String(y), label: String(y) }))} /></>}>
          <NdviProfile ndvi={ndvi} year={+year} />
          <div className="legend"><span><Sw c="#17231c" />{year}: {cropLabel(f.history[+year]?.crop ?? f.history[+year]?.cropClass)}</span><span><Sw c="#c6dcb4" />range of the other years</span>{+year === DECISION_YEAR && <span>seen up to {niceDate(DECISION_DATE)}</span>}</div>
        </Panel>
        <Panel title="Yield ranges the replay uses" sub="t/ha · low season · normal · high season">
          <Intervals rows={yields} unit="t/ha" />
          <div style={{ marginTop: 8 }}><Check>these are district averages; each field’s yield is this times its field index (Fields screen).</Check></div>
        </Panel>
      </div>
      <Panel>
        <div style={{ display: 'grid', gap: 10 }}>
          <More label="Tested and not used">
            <ul className="plain">
              <li><b>Satellite soil moisture</b> (SMAP) and three other drought indicators: no link to district yields.</li>
              <li><b>“Green in autumn = winter crop”</b>: right for three fields in four, so it only pre-fills the entry.</li>
              <li><b>Crop residue from the satellite</b>: could not separate stubble from ploughed soil.</li>
              <li><b>NASA elevation model for the slope rule</b>: disagrees with the official layer.</li>
              <li><b>A field-level yield model</b>: no field yields exist to check it against.</li>
            </ul>
          </More>
          <More label="Days without cover by crop sequence">
            <div className="scroll-x"><table>
              <thead><tr><th>After a crop harvested</th><th>Next crop sown</th><th className="n">Fields</th><th className="n">Days without living cover</th><th className="n">Weighted by erosive rain</th><th className="n">In the leaching season</th></tr></thead>
              <tbody>{seq.map(key => { const m = coverModel.model[key]; const [p, n, c] = key.split('>'); return m && (
                <tr key={key}><td>{({ mid: 'July–August', late: 'September–October', grass: 'grass' } as any)[p]}</td><td>{({ august: 'August (winter rapeseed)', september: 'September (winter cereals)', spring_early: 'April', spring_late: 'May (maize, beet)', grass: 'stays grass' } as any)[n]}{c === 'green_autumn' ? ', after a catch crop' : c === 'open_autumn' ? ', open autumn' : ''}</td><td className="n">{m.n}</td><td className="n">{m.total[1]} <span className="muted">({m.total[0]}–{m.total[2]})</span></td><td className="n"><b>{Math.round(coverDays(m.half.mean, soil).s1e)}</b></td><td className="n">{Math.round(coverDays(m.half.mean, soil).s5)}</td></tr>); })}</tbody>
            </table></div>
          </More>
        </div>
      </Panel>
    </>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useQueryState<Tab>('tab', 'bare');
  const s = useStore();
  const head = <><div className="page-head"><h1>Analytics</h1><Tabs label="Analytics views" tabs={[{ id: 'bare', label: 'Bare soil' }, { id: 'weather', label: 'Weather risk' }, { id: 'zones', label: 'Risk zones' }, { id: 'method', label: 'Method' }]} value={tab} onChange={setTab} /></div><div><Link className="btn pri" href="/settings">Next: crops and limits →</Link></div></>;
  useScreen(tab === 'zones' ? null : `analytics/${tab}`, tab === 'bare' ? { selectedField: s.field, bareDaysLastSeason: Object.fromEntries(fields.map(f => [f.id, seasonCover(f.id).at(-1)?.total ?? null])), erosiveRainShareByMonthJanToDec: soilClimate.erosivity.byMonth, leachingSeasonSurplusMm: soilClimate.leaching.seasonSurplusMm }
    : tab === 'weather' ? { hazardsByMonthShareOfYears: Object.fromEntries(hazards.hazards.map((h: any) => [h.label, h.byMonth])), cropCalendarOfPlan: s.plan?.name } : { selectedField: s.field });
  if (tab === 'zones') return <Zones head={head} />;
  return <div className="page">{head}{tab === 'method' ? <Evidence /> : <Seasons part={tab === 'weather' ? 'weather' : 'bare'} />}</div>;
}

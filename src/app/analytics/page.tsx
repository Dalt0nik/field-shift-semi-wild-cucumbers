'use client';
// Analytics: what the NASA data show about the farm. Bare soil (when fields are bare, when bare soil erodes or
// loses nitrate), weather risk for the selected plan's crops, and risk zones with a "what if" on dry seasons.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { WaterBalance } from '@/components/Charts';
import { rampCss, rampFor } from '@/components/colors';
import { grid, layerImage } from '@/components/grid';
import { MonthRisk, SoilHelpButton } from '@/components/Soil';
import { useScreen, useStore } from '@/components/store';
import { Check, Panel, Select, Sw, Tabs, Term, pct, useQueryState } from '@/components/ui';
import { DryMargin } from '@/components/DryMargin';
import { WeatherRisk, weatherClashes } from '@/components/WeatherRisk';
import hazardsJson from '@/data/hazards.json';
import { DECISION_DATE, DECISION_YEAR, PLAN_YEARS, fields, niceDate, products, weather } from '@/pilot/demo';
import { bareCalendar, seasonCover } from '@/pilot/satellite';
import { soilClimate } from '@/pilot/soil';
import { partsOf } from '@/engine/editor';
import { CROPS } from '@/pilot/regional';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
const hazards = hazardsJson as any;
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quant = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
type Tab = 'bare' | 'weather' | 'zones';
type Zone = 'erosion' | 'low' | 'dry';

// the crops of the selected plan (no grass): Weather risk shows when they are sown and harvested
const planCrops = (s: ReturnType<typeof useStore>) => [...new Set((s.plan?.v.options ?? []).flatMap(o => o.crops))].filter(c => CROPS[c].season !== 'perennial').slice(0, 6);

function Seasons({ part }: { part: 'bare' | 'weather' }) {
  const s = useStore();
  const crops = planCrops(s);
  return (
    <>
      {part === 'bare' && <Panel title="When are the fields bare?" sub={<>share of the years 2016–{DECISION_YEAR} in which the field was mostly bare, by half-month · NASA <Term id="hls">HLS</Term>, as seen up to {niceDate(DECISION_DATE)}</>}>
        <p className="lead">Bare soil is what heavy rain washes away and what drainage water strips of nitrate; green plants hold both. The fewer bare weeks, especially in summer and autumn, the better.</p>
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
      {part === 'bare' && <div className="cols" style={{ alignItems: 'stretch' }}>
        <Panel title="When does bare soil erode?" sub={<>NASA <Term id="imerg">GPM IMERG</Term>, {soilClimate.period}</>} right={<SoilHelpButton />}>
          <MonthRisk kind="erosion" />
          <p className="note" style={{ marginTop: 8 }}><Term id="erosivity">Heavy rain</Term> washes bare soil off the field. It comes mostly in summer, right after the cereal harvest. Each bar: how much of the year’s heavy rain falls on bare soil in that month. Lower is better.</p>
        </Panel>
        <Panel title="When does bare soil lose nitrate?" sub={<>NASA GPM IMERG and <Term id="power">POWER</Term>, {soilClimate.period}</>}>
          <MonthRisk kind="nitrate" />
          <p className="note" style={{ marginTop: 8 }}>From September to February more rain falls than dries up, and water drains through the soil taking nitrate with it (the <Term id="leaching">leaching season</Term>). A green autumn holds it back.</p>
        </Panel>
      </div>}

      {part === 'weather' && <WeatherRisk crops={crops} planName={s.plan?.name ?? 'the selected plan'} source={<>years {hazards.period} · NASA <Term id="imerg">GPM IMERG</Term> rain, NASA <Term id="power">POWER</Term> temperature</>} />}
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
  const steep = [...fields].sort((a, b) => b.erosionShare * b.areaHa - a.erosionShare * a.areaHa); // all fields, most erosion-sensitive hectares first
  useScreen('analytics/zones', { view: zone, selectedPlan: s.plan?.name, drySeasonsMultiplier: k,
    erosionSensitiveHa: Math.round(steepHa * 10) / 10, fieldBareOnErosionLand: Object.fromEntries(fields.map((f, i) => [f.id, parts[i] ? Math.round(parts[i]!.bareSlopes) : null])),
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
          <p className="lead">Bare soil erodes most on the {steepHa.toFixed(0)} ha of erosion-sensitive land (red).</p>
          <table>
            <thead><tr><th>Field</th><th className="n">Erosion-sensitive land</th><th className="n">Share of the field</th></tr></thead>
            <tbody>{steep.map(f => <tr key={f.id} className={`click${s.field === f.id ? ' sel' : ''}`} onClick={() => s.setField(f.id)}><td><b>{f.id}</b></td><td className="n">{f.erosionShare > 0.005 ? `${(f.erosionShare * f.areaHa).toFixed(1)} ha` : 'none'}</td><td className="n">{f.erosionShare > 0.005 ? pct(f.erosionShare) : '—'}</td></tr>)}</tbody>
          </table>
        </>}
        {zone === 'low' && <>
          <p className="lead">Fields below their surroundings collect cold air and stay wet longer in spring (<Term id="nasadem">NASADEM</Term>).</p>
          <table>
            <thead><tr><th>Field</th><th className="n">Against surroundings</th><th className="n">Slope</th></tr></thead>
            <tbody>{[...fields].sort((a, b) => products.fields[a.id].terrain.relHeight500m - products.fields[b.id].terrain.relHeight500m).map(f => { const t = products.fields[f.id].terrain; return (
              <tr key={f.id} className={`click${s.field === f.id ? ' sel' : ''}`} onClick={() => s.setField(f.id)}><td><b>{f.id}</b></td><td className="n">{t.relHeight500m > 0 ? '+' : ''}{t.relHeight500m} m</td><td className="n">{t.slopePct} %</td></tr>); })}</tbody>
          </table>
        </>}
        {zone === 'dry' && <>
          <p className="lead"><Term id="drySeason">Dry seasons</Term>: the lowest fifth of the May–July <Term id="waterBalance">water balance</Term> ({weather.dryYears.join(', ')}).</p>
          <WaterBalance years={weather.years} />
          <div>
            {/* two fixed single lines above the slider, so it never moves when the value changes */}
            <label className="lbl dry-q" htmlFor="dryk">What if dry years came more often?</label>
            <div className="dry-now">Now: <b>{k === 1 ? 'as in the past (1 year in 5)' : `${k}× as often`}</b></div>
            <input id="dryk" type="range" min={1} max={3} step={0.5} value={k} onChange={e => setK(+e.target.value)} />
            <div className="ramp-t"><span>as in the past</span><span>2×</span><span>3× as often</span></div>
          </div>
          <h3 className="db-title">What each plan <Term id="margin">earns</Term></h3>
          <DryMargin k={k} rows={shown.map(p => ({ id: p.id, name: p.name, past: p.v.ch.marginMean, dry: weighted(p.v.ch.marginSeries), selected: p.id === s.planId }))} />
          <p className="note">The slider re-weights past seasons; it does not model a new climate.</p>
        </>}
      </aside>
    </div>
  );
}

export default function AnalyticsPage() {
  const [asked, setTab] = useQueryState<Tab>('tab', 'bare');
  const tab: Tab = asked === 'weather' || asked === 'zones' ? asked : 'bare'; // an old link to ?tab=method opens Bare soil
  const s = useStore();
  const head = <><div className="page-head"><h1>Analytics</h1><Tabs label="Analytics views" tabs={[{ id: 'bare', label: 'Bare soil' }, { id: 'weather', label: 'Weather risk' }, { id: 'zones', label: 'Risk zones' }]} value={tab} onChange={setTab} /></div></>;
  useScreen(tab === 'zones' ? null : `analytics/${tab}`, tab === 'bare' ? { selectedField: s.field, bareDaysLastSeason: Object.fromEntries(fields.map(f => [f.id, seasonCover(f.id).at(-1)?.total ?? null])), erosiveRainShareByMonthJanToDec: soilClimate.erosivity.byMonth, leachingSeasonSurplusMm: soilClimate.leaching.seasonSurplusMm }
    : tab === 'weather' ? { selectedPlan: s.plan?.name, thingsToWatch: weatherClashes(planCrops(s)), hazardsByMonthShareOfYears: Object.fromEntries(hazards.hazards.map((h: any) => [h.label, h.byMonth])) } : {});
  if (tab === 'zones') return <Zones head={head} />;
  return <div className="page">{head}<Seasons part={tab === 'weather' ? 'weather' : 'bare'} /></div>;
}

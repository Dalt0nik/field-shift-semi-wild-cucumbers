'use client';
// Soil protection in the interface: the block on every plan card, the table of all six measures for the selected
// plan, the chart that shows how the headline is calculated, and the "?" panel that explains every number with its
// source. No overall score and no weights: six measures, each in its own unit.
import { coverDays } from '@/engine/characteristics';
import type { Characteristics } from '@/engine/types';
import soilCheckJson from '@/data/soil-check.json';
import { DECISION_DATE, PLAN_YEARS, coverModel, niceDate } from '@/pilot/demo';
import { CROPS } from '@/pilot/regional';
import { HUMUS_BYPRODUCT, HUMUS_CATCH_CROP, HUMUS_CROP, SOIL_SOURCES, humusClass, soilClimate, soilParams } from '@/pilot/soil';
import type { PlanItem } from './store';
import { Term, pct, useQueryState } from './ui';

export const soilCheck = soilCheckJson as unknown as { decisionDate: string; base: string; plans: number; bestForSoil: { s1e: number; margin: number }; usual: { s1e: number; margin: number }; lowerBound: number; frontier: { s1e: number; margin: number }[];
  variants: { key: string; junToAug: number; decToFeb: number; basePlanRank: number; of: number; rho: number; bestDiffersOnFields: number }[] };

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;
const E = soilClimate.erosivity, BASE = E.summary[E.base], P0 = soilParams();
const p100 = (v: number) => Math.round(v * 100);

/** The "?" control: opens the panel that explains the soil numbers. The open state is in the URL (?help=soil). */
export function SoilHelpButton({ text, quiet }: { text?: string; quiet?: boolean }) {
  const [, setHelp] = useQueryState<string>('help', '');
  // quiet: the text itself opens the panel, underlined like an explained term (the heading of every plan card)
  return text
    ? <button type="button" className={quiet ? 'quiet-link' : 'link small'} title={quiet ? 'How the soil numbers are calculated' : undefined} onClick={e => { e.stopPropagation(); setHelp('soil'); }}>{text}</button>
    : <button type="button" className="help" aria-label="How the soil numbers are calculated" title="How the soil numbers are calculated" onClick={e => { e.stopPropagation(); setHelp('soil'); }}>?</button>;
}

/** Price of a plan's soil protection against another plan: days and euros, nothing weighted. */
export function priceOf(p: Characteristics, other: Characteristics): string {
  return `${signed(p.bareErosive.p50 - other.bareErosive.p50)} days, ${signed(p.marginMean - other.marginMean)} €/ha a year`;
}

/** Soil block of a plan card: the headline (S1e), the plain days (S1) and the rotation (S3). */
export function SoilBlock({ c, best }: { c: Characteristics; best: { e: number; d: number; c: number } }) {
  const mark = (on: boolean) => (on ? 'bestv' : undefined);
  return (
    <span className="soil">
      <span className="soil-h"><SoilHelpButton text="Soil protection" quiet /></span>
      <span className="kpi soil-kpi"><span className={mark(c.bareErosive.p50 === best.e)}>{c.bareErosive.p50}</span><small><Term id="soilDays">days of bare soil under heavy rain</Term> <i className="src">NASA</i></small></span>
      <span className="stat"><span><Term id="bareDays">Days without green cover</Term></span><b className={mark(c.bareDays.p50 === best.d)}>{c.bareDays.p50}</b></span>
      <span className="stat"><span><Term id="cropFamilies">Crop groups</Term>, {PLAN_YEARS.join(' · ')}</span><b>{c.familiesPerYear.join(' · ')}</b></span>
      <span className="stat"><span><Term id="cerealAfterCereal">Cereal after cereal</Term></span><b className={mark(c.cerealAfterCereal === best.c)}>{pct(c.cerealAfterCereal)}</b></span>
    </span>
  );
}

/** All six soil measures of the selected plan next to the typical local plan. */
export function SoilTable({ plan, base, top, steepHa, strawLeft, setStrawLeft, cheaper }: { plan: PlanItem; base: PlanItem; top: PlanItem | null; steepHa: number; strawLeft: boolean; setStrawLeft: (b: boolean) => void; cheaper: { s1e: number; margin: number } | null }) {
  const c = plan.v.ch, b = base.v.ch, isBase = plan.id === base.id;
  const onSteep = (v: number) => (steepHa ? Math.round(v / steepHa) : 0);
  // label: the name with its explained term, where the vocabulary has one
  const rows: { name: string; label?: React.ReactNode; unit: string; get: (x: Characteristics) => string; data: React.ReactNode }[] = [
    { name: 'Days of bare soil under heavy rain', label: <Term id="soilDays">Days of bare soil under heavy rain</Term>, unit: 'a year', get: x => String(x.bareErosive.p50), data: <>NASA <Term id="hls">HLS</Term> × NASA <Term id="imerg">GPM IMERG</Term></> },
    { name: 'Days without green cover', label: <Term id="bareDays">Days without green cover</Term>, unit: 'a year', get: x => String(x.bareDays.p50), data: 'NASA HLS' },
    { name: 'The same on erosion-sensitive land', unit: 'weighted days a year', get: x => String(onSteep(x.bareOnSlopes)), data: 'NASA HLS × IMERG, official layer' },
    { name: 'Crop diversity', unit: `crop groups ${PLAN_YEARS.join(' / ')} · legumes · cereal after cereal`, get: x => `${x.familiesPerYear.join(' / ')} · ${pct(x.legumeShare)} · ${pct(x.cerealAfterCereal)}`, data: 'crop plan' },
    { name: 'Harvest on wet soil', label: <Term id="wetSoilHarvest">Harvest on wet soil</Term>, unit: 'ha a year', get: x => (x.wetHarvestHa ? x.wetHarvestHa.toFixed(1) : '0'), data: <>NASA GPM IMERG, NASA <Term id="power">POWER</Term></> },
    { name: 'Bare soil in the leaching season', label: <>Bare soil in the <Term id="leaching">leaching season</Term></>, unit: 'days, Sep–Feb', get: x => String(x.bareLeaching), data: 'NASA HLS × IMERG, POWER' },
    { name: 'Humus balance', label: <Term id="humus">Humus balance</Term>, unit: 'kg humus-C per ha a year', get: x => `${signed(x.humus)} · ${humusClass(x.humus)}`, data: <label className="chk small" style={{ fontSize: 'inherit' }}><input type="checkbox" checked={strawLeft} onChange={e => setStrawLeft(e.target.checked)} />straw left on the field</label> },
  ];
  return (
    <div className="soilbox">
      <div className="row" style={{ justifyContent: 'space-between' }}><h3>Soil protection of this plan</h3><SoilHelpButton text="How these numbers are calculated, and their sources" /></div>
      <div className="scroll-x">
        <table>
          <thead><tr><th>Measure</th><th className="n">{isBase ? 'Typical local plan' : 'This plan'}</th>{!isBase && <th className="n">Typical local plan</th>}<th>Built from</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.name}><td>{i === 0 ? <b>{r.label ?? r.name}</b> : r.label ?? r.name} <small>{r.unit}</small></td><td className="n">{i === 0 ? <b>{r.get(c)}</b> : r.get(c)}</td>{!isBase && <td className="n muted">{r.get(b)}</td>}<td className="small muted">{r.data}</td></tr>))}</tbody>
        </table>
      </div>
      {!isBase && <p className="small" style={{ marginTop: 8 }}><b>The price.</b> Against the typical local plan: {priceOf(c, b)}.{top && top.id !== plan.id && <> Against the highest-margin plan: {priceOf(c, top.v.ch)}.</>}{cheaper && <> Most of the gain costs less: a plan with {cheaper.s1e} days earns {cheaper.margin} €/ha (see Compare).</>}</p>}
      <p className="note" style={{ marginTop: 6 }}>Six measures, no overall score. Typical values of two satellite seasons, not a forecast: one plan’s own spread between years is about {c.bareErosive.p75 - c.bareErosive.p25} days. Stubble counts as bare; tillage is not visible from space.</p>
    </div>
  );
}

const SEQ: { key: string; label: string; color: string }[] = [
  { key: 'mid>september', label: 'cereal, then winter cereal', color: '#8a5a2b' },
  { key: 'mid>august', label: 'cereal, then winter rapeseed', color: '#c9a500' },
  { key: 'mid>spring_early', label: 'cereal, then spring crop', color: '#7d8b80' },
  { key: 'mid>spring_early>green_autumn', label: 'the same after a green autumn (catch crop)', color: '#2f6b3c' },
];
/** How the headline is calculated: the share of erosive rain in each half-month (bars) and how bare the soil is
 *  under four crop sequences (lines). The measure multiplies the two and adds up. */
export function ErosivityChart({ leaching = false }: { leaching?: boolean }) {
  const W = 560, H = 200, pl = 30, pr = 30, pb = 22, pt = 8;
  const w = leaching ? soilClimate.leaching.shares : P0.erosivity, max = Math.max(...w) * 1.1;
  const x = (i: number) => pl + (i / 24) * (W - pl - pr), bw = (W - pl - pr) / 24;
  const yS = (v: number) => pt + (H - pb - pt) * (1 - v / max), yB = (v: number) => pt + (H - pb - pt) * (1 - v);
  const obs: number[] = coverModel.observedShare ?? [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={leaching ? 'Share of the autumn and winter water surplus by half-month, and bare soil by crop sequence' : 'Share of the yearly erosive rain by half-month, and bare soil by crop sequence'}>
      {obs.map((o, i) => o < 0.2 && <rect key={'b' + i} x={x(i)} y={pt} width={bw} height={H - pb - pt} fill="#eef1ec" />)}
      {w.map((v, i) => <rect key={i} x={x(i) + 1.5} width={bw - 3} y={yS(v)} height={H - pb - yS(v)} fill={leaching ? '#9fc3d6' : '#e2b9a7'}><title>{`${soilClimate.halfMonths[i]}: ${(v * 100).toFixed(1)} % of the ${leaching ? 'season’s water surplus' : 'yearly erosive rain'}`}</title></rect>)}
      <line x1={pl} x2={W - pr} y1={H - pb} y2={H - pb} stroke="#17231c" />
      {'JASONDJFMAMJ'.split('').map((m, i) => <text key={i} x={x(i * 2 + 1)} y={H - 6} textAnchor="middle" className="tick">{m}</text>)}
      <text x={pl - 4} y={yS(max / 1.1) + 4} textAnchor="end" className="tick">{(max / 1.1 * 100).toFixed(0)}%</text>
      <text x={pl - 4} y={H - pb} textAnchor="end" className="tick">0</text>
      <text x={W - pr + 4} y={yB(1) + 8} className="tick">bare</text><text x={W - pr + 4} y={yB(0)} className="tick">green</text>
      {SEQ.map(s => { const m = coverModel.model[s.key]; return m && <path key={s.key} d={'M' + m.half.mean.map((v: number, i: number) => `${(x(i) + bw / 2).toFixed(1)},${yB(v).toFixed(1)}`).join('L')} fill="none" stroke={s.color} strokeWidth="2.2"><title>{s.label}</title></path>; })}
    </svg>
  );
}
export function ErosivityLegend({ leaching = false }: { leaching?: boolean }) {
  return (
    <div className="legend">
      <span><i className="sw" style={{ background: leaching ? '#9fc3d6' : '#e2b9a7' }} />{leaching ? 'share of the water surplus' : 'share of the year’s erosive rain'}</span>
      {SEQ.map(s => { const m = coverModel.model[s.key]; if (!m) return null; const d = coverDays(m.half.mean, P0); return <span key={s.key}><i className="sw" style={{ background: s.color, height: 3 }} />{s.label}: <b>&nbsp;{Math.round(leaching ? d.s5 : d.s1e)}</b></span>; })}
      <span><i className="sw" style={{ background: '#eef1ec' }} />no clear satellite view</span>
    </div>
  );
}

const Src = ({ ids }: { ids: string[] }) => <span className="srcs">{ids.map(id => { const s = SOIL_SOURCES[id]; return s.url ? <a key={id} href={s.url} target="_blank" rel="noreferrer" title={`${s.label}${s.note ? ` (${s.note})` : ''}`}>{id === 'ours' ? 'our tests' : s.label.split(',')[0].split(' (')[0]}<i className={`st ${s.status}`}>{s.status}</i></a> : <span key={id} title={s.label}>our tests<i className="st calculation">calculation</i></span>; })}</span>;
function Measure({ id, name, what, children }: { id: string; name: string; what: string; children: React.ReactNode }) {
  return <section className="measure" id={`soil-${id}`}><h3>{name}</h3><p>{what}</p><dl className="kv how">{children}</dl></section>;
}

/** The "?" panel. Every number is read from the data files, so it stays right when they are rebuilt. */
export function SoilHelp() {
  const [help, setHelp] = useQueryState<string>('help', '');
  if (help !== 'soil') return null;
  const m = coverModel.model, seqDays = Object.entries<any>(m).filter(([k]) => !k.includes('autumn')).map(([, v]) => Math.round(coverDays(v.half.mean, P0).s1e));
  const wet = Object.entries(soilClimate.harvest.crops).filter(([, h]) => h.typicallyWet), dryWin = Object.entries(soilClimate.harvest.crops).filter(([, h]) => !h.typicallyWet).map(([, h]) => h.wetYearsShare);
  const stay = soilCheck.variants.filter(v => v.basePlanRank === 1).length, worst = Math.max(...soilCheck.variants.map(v => v.basePlanRank));
  const wheat = CROPS.winter_wheat ? Math.round(57.3 * HUMUS_BYPRODUCT.winter_wheat.ratio * HUMUS_BYPRODUCT.winter_wheat.perDt) : 0;
  const st = E.storms;
  return (
    <>
      <div className="scrim" onClick={() => setHelp('')} />
      <aside className="drawer wide" aria-label="How the soil numbers are calculated">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>Soil protection: how the numbers are calculated</h2><button className="btn sm" onClick={() => setHelp('')}>Close</button></div>
        <p style={{ marginTop: 10 }}>Soil is best protected when it is covered, has living roots, carries a varied rotation and is disturbed little: the four soil-health principles of <Src ids={['nrcs']} />. Every plan is measured on the first three, from NASA satellite data and the crop plan. The fourth, tillage, cannot be seen from space, so it is not scored. There is <b>no overall soil score and no weights</b>: six measures, each in its own unit. “Best for soil” is the plan with the lowest first measure; ties go to the lower second measure on erosion-sensitive land, then to less cereal after cereal.</p>

        <Measure id="s1e" name="1 · Days of bare soil under heavy rain" what="How long the soil lies without living plant cover in a year, each half-month counted by its share of the year’s erosive rain. The headline of the soil block.">
          <dt>Calculation</dt><dd>For each of the 24 half-months from July to June: bare fraction × that half-month’s share of the yearly rainfall erosivity × 365. Summed, averaged over the plan years, weighted by field area. Bare fraction = 1 − green cover; green cover is <Term id="ndvi">NDVI</Term> rescaled between bare soil ({coverModel.ndvi_soil.toFixed(2)}) and full cover ({coverModel.ndvi_full.toFixed(2)}) <Src ids={['fvc']} />.</dd>
          <dt>Data</dt><dd><b>NASA <Term id="hls">HLS</Term></b> (Landsat + Sentinel-2, 30 m): cover curves of about 1 700 declared Lithuanian fields in the seasons {coverModel.seasons.join(' and ')}, grouped into {Object.keys(m).length} crop sequences. <b>NASA <Term id="imerg">GPM IMERG</Term></b>, half-hourly rain at the farm, {soilClimate.period}: storms of {E.thresholdMm} mm or more, erosivity = storm energy × highest 30-minute intensity; precipitation that IMERG marks as frozen is left out.</dd>
          <dd><ErosivityChart /><ErosivityLegend /></dd>
          <dt>What we found</dt><dd>June to August carry <b>{p100(BASE.junToAug)} %</b> of the year’s erosive rain, December to February {p100(BASE.decToFeb)} %. The half-months the satellite cannot see (16 November – 31 January) carry {p100(BASE.blindHalfMonths)} %. By crop sequence the measure runs from {Math.min(...seqDays)} days (grass) to {Math.max(...seqDays)}. Summer rain is {BASE.summerToWinter} times as erosive as winter rain here; the JRC maps give almost 4 times for the EU on average <Src ids={['esdac']} />.</dd>
          <dt>What we checked</dt><dd>With equal shares the measure equals the plain days without cover (a unit test). The best plan found ({soilCheck.bestForSoil.s1e} days) sits on the exact lower bound of {soilCheck.lowerBound}. With the shares computed {soilCheck.variants.length} other ways (daily rain instead of storms, two other exponents, warm-season rain counted double, snow counted as rain, shares smoothed) the plan shown as Best for soil stays first of {soilCheck.plans} plans in {stay} and is never below place {worst}.</dd>
          <dt>Limits</dt><dd>It is not an erosion rate in tonnes: it compares plans on the part of erosion that the crop plan decides. Stubble and residues are invisible to the satellite and count as bare. Winter keeps the last autumn state. IMERG underestimates intense rain <Src ids={['fenta']} />, so only shares are used; they rest on {st?.storms ?? '—'} storms, and the 15 largest carry {st ? p100(st.top15Share) : '—'} %. Snowmelt erosion is not represented.</dd>
          <dt>Why this way</dt><dd>Erosion models weight crop cover by the timing of erosive rain, in 15-day steps <Src ids={['rusle']} />; the JRC computed a cover factor per parcel the same way from Sentinel-2 <Src ids={['jrc']} />. The EU Soil Monitoring Law makes the soil erosion rate a descriptor and asks that its estimates consider vegetation cover and crop type <Src ids={['law']} />. Monitoring asks whether a field was bare; this asks how bare it will be under each plan, before sowing.</dd>
        </Measure>

        <Measure id="s1" name="2 · Days without green cover" what="The same without the rain weighting: every half-month counts the same.">
          <dt>Data</dt><dd>NASA HLS cover curves, as above <Src ids={['ours']} />. HLS sees green plants only, so “living cover” and “living roots” are one number here.</dd>
        </Measure>

        <Measure id="s2" name="3 · The same on erosion-sensitive land" what="The weighted days of measure 1 on the parts of fields inside the official erosion-sensitive layer.">
          <dt>Data</dt><dd>NASA HLS and IMERG as above; the layer of the paying agency (NMA, GAAB 5: slopes above 12 %). Shown on Analytics, Risk zones.</dd>
          <dt>What we checked</dt><dd>Slope from <Term id="nasadem">NASADEM</Term> was tried and rejected: it agreed with the official layer on 36 % of the cropland it marked steep <Src ids={['ours']} />.</dd>
        </Measure>

        <Measure id="s3" name="4 · Crop diversity" what="Crop families on the farm in each plan year (cereal, oilseed, legume, row crop, grass), the share of legumes, and the share of area where a cereal follows a cereal.">
          <dt>Data</dt><dd>The crop plan and the regional crop reference.</dd>
          <dt>Evidence</dt><dd>A meta-analysis of crop rotations found more soil carbon, nitrogen and microbial biomass when crops were added to a rotation <Src ids={['mcdaniel']} />. A cereal after a cereal lowers the yield of the second one; the margin already counts that.</dd>
        </Measure>

        <Measure id="s4" name="5 · Harvest on wet soil" what="Hectares a year of crops whose harvest window is typically wet. A warning sign for compaction, not a measurement.">
          <dt>Calculation</dt><dd>Rain minus <Term id="et">evaporative demand</Term> summed over the crop’s harvest window, for each year {soilClimate.period}; the window is typically wet when the median is above zero.</dd>
          <dt>Data</dt><dd><b>NASA GPM IMERG</b> rain and <b>NASA <Term id="power">POWER</Term></b> temperature at the farm; harvest windows of the crop reference.</dd>
          <dt>What we found</dt><dd>Typically wet here: {wet.map(([id, h]) => `${CROPS[id]?.name.toLowerCase() ?? id} (wet in ${p100(h.wetYearsShare)} % of years)`).join(', ')}. Cereal, rapeseed and legume windows were wet in {p100(Math.min(...dryWin))}–{p100(Math.max(...dryWin))} % of years, so they are not counted.</dd>
          <dt>Limits</dt><dd>Heavy machines on wet soil compact the subsoil <Src ids={['arvidsson']} />, but nothing here measures compaction, and the proxy is not validated.</dd>
        </Measure>

        <Measure id="s5" name="6 · Bare soil in the leaching season" what="Days without living cover from September to February, counted more heavily when water drains through the soil.">
          <dt>Calculation</dt><dd>Bare fraction × that half-month’s share of the season’s water surplus × {soilClimate.leaching.days} days. Water surplus = rain above evaporative demand, median of {soilClimate.period}: {soilClimate.leaching.seasonSurplusMm} mm a season, almost all from October on.</dd>
          <dt>Data</dt><dd>NASA HLS cover curves; NASA GPM IMERG rain and NASA POWER temperature.</dd>
          <dt>Evidence</dt><dd>Bare draining soil loses nitrate. In a global meta-analysis (238 observations from 28 studies) non-legume cover crops cut nitrate leaching by 56 % on average <Src ids={['thapa']} />.</dd>
          <dt>Limits</dt><dd>It shows exposure, not kilograms of nitrogen: how much nitrogen each crop leaves behind is not counted.</dd>
        </Measure>

        <Measure id="s6" name="7 · Humus balance" what="An accounting of the organic matter each crop takes from the soil or gives to it. It compares plans; it does not predict measured soil carbon.">
          <dt>Calculation</dt><dd>Per field and year: the crop’s coefficient + the straw left on the field + a catch crop, in kg humus-C per hectare. Cereals and rapeseed {HUMUS_CROP.winter_wheat}, grain legumes +{HUMUS_CROP.faba_bean}, sugar beet {HUMUS_CROP.sugar_beet}, grass +{HUMUS_CROP.perennial_grasses}; straw {HUMUS_BYPRODUCT.winter_wheat.perDt} kg per 100 kg (winter wheat at 5.7 t/ha: +{wheat}); a catch crop +{HUMUS_CATCH_CROP}. Between −75 and +100 the worksheet calls a balance “balanced”.</dd>
          <dt>Data</dt><dd>Coefficients of the German VDLUFA method as printed in the advisory worksheet of LfL Bayern (values for conventional farming) <Src ids={['lfl']} />; yields as in the margin. Straw is assumed left on the field; the switch is in the soil table of the plan.</dd>
          <dt>Limits</dt><dd>Grass and catch crops are counted at 75 % and 70 % of the worksheet value, because their growth is not known. On 14 Swiss long-term sites humus balances did not predict the measured carbon trend <Src ids={['rainford']} />.</dd>
        </Measure>

        <section className="measure"><h3>Not measured</h3><p>Tillage, fertiliser balance, pH, measured soil carbon and contamination need farm records or soil samples. A residue index from HLS could not tell stubble from ploughed soil in our test <Src ids={['ours']} />. Erosion in tonnes per hectare needs slope at field scale, which NASADEM does not give.</p></section>
        <section className="measure"><h3>Sources and how far each was checked</h3>
          <p className="small muted">primary = read in the original · abstract = only the abstract or the publisher’s summary was read, so no number is quoted from it · calculation = ours. The set-up behind “what we checked”: decision day {niceDate(soilCheck.decisionDate)}{soilCheck.decisionDate !== DECISION_DATE ? ' (computed for another day than the one shown now)' : ''}.</p>
          <ul className="plain">{Object.values(SOIL_SOURCES).map(s => <li key={s.id}>{s.url ? <a className="link" style={{ fontWeight: 400 }} href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label} <i className={`st ${s.status}`}>{s.status}</i>{s.note ? <span className="muted"> — {s.note}</span> : null}</li>)}</ul>
        </section>
      </aside>
    </>
  );
}

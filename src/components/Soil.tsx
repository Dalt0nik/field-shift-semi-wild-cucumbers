'use client';
// Soil in the interface: the soil health score on every plan card, the charts of bare soil against erosive rain (Analytics), and the panel that explains in
// plain words how the score is counted, with its sources.
import { coverDays } from '@/engine/characteristics';
import { SOIL_TIE_POINTS, soilBand, type SoilBand } from '@/engine/soil-score';
import type { Characteristics } from '@/engine/types';
import soilCheckJson from '@/data/soil-check.json';
import { coverModel } from '@/pilot/demo';
import { SOIL_SOURCES, soilClimate, soilParams } from '@/pilot/soil';
import { farmerTransitions } from '@/pilot/farmers';
import { useStore } from './store';
import { Term, pct, useQueryState } from './ui';

export const soilCheck = soilCheckJson as unknown as { decisionDate: string; base: string; plans: number; fewestBareSoil: { s1e: number; margin: number }; usual: { s1e: number; margin: number }; lowerBound: number; frontier: { s1e: number; margin: number }[];
  variants: { key: string; junToAug: number; decToFeb: number; basePlanRank: number; of: number; rho: number; bestDiffersOnFields: number }[] };

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;
const P0 = soilParams();

/** The "?" control: opens the panel that explains the soil numbers. The open state is in the URL (?help=soil). */
export function SoilHelpButton({ text, quiet }: { text?: string; quiet?: boolean }) {
  const [, setHelp] = useQueryState<string>('help', '');
  // quiet: the text itself opens the panel, underlined like an explained term (the heading of every plan card)
  return text
    ? <button type="button" className={quiet ? 'quiet-link' : 'link small'} title={quiet ? 'How the score is counted' : undefined} onClick={e => { e.stopPropagation(); setHelp('soil'); }}>{text}</button>
    : <button type="button" className="help" aria-label="How the soil health score is counted" title="How the soil health score is counted" onClick={e => { e.stopPropagation(); setHelp('soil'); }}>?</button>;
}

const BAND_LABEL: Record<SoilBand, string> = { low: 'Low', medium: 'Medium', high: 'High' };
/** The band of a score as a small coloured tag: low (like the weakest farms nearby), medium, high (close to the best plan found). */
export const Band = ({ points }: { points: number }) => { const b = soilBand(points); return <i className={`band is-${b}`}>{BAND_LABEL[b]}</i>; };

/** Soil block of a plan card: the soil health score with its band, and the points of its three parts. */
export function SoilBlock({ c, best }: { c: Characteristics; best: number }) {
  const s = c.soilScore;
  if (!s) return null;
  return (
    <span className="soil">
      <span className="soil-h"><SoilHelpButton text="Soil health score" quiet /></span>
      <span className="kpi soil-kpi"><span className={s.total === best ? 'bestv' : undefined}>{s.total}</span><span className="of">/ 100</span><Band points={s.total} /></span>
      <span className="stat"><span><Term id="soilCover">Soil cover</Term> <i className="src">NASA</i></span><b>{s.cover}</b></span>
      <span className="stat"><span><Term id="cropVariety">Crop variety</Term></span><b>{s.variety}</b></span>
      <span className="stat"><span><Term id="organicMatter">Organic matter</Term></span><b>{s.organic}</b></span>
    </span>
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

/** The sources of the score, in the order of the panel. */
const SCORE_SOURCES = ['law', 'fao', 'hls', 'imerg', 'rusle', 'lfl', 'jrcci', 'cornell'];

/** The panel behind "Soil health score": how the score is counted, in plain words, with the numbers of the plan on
 *  screen. The open state is in the URL (?help=soil). Every source is in src/pilot/soil.ts with its status. */
export function SoilHelp() {
  const [help, setHelp] = useQueryState<string>('help', '');
  const s = useStore();
  if (help !== 'soil') return null;
  const p = s.plan, c = p?.v.ch, sc = c?.soilScore;
  return (
    <>
      <div className="scrim" onClick={() => setHelp('')} />
      <aside className="drawer wide" aria-label="How the soil health score is counted">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>Soil health score</h2><button className="btn sm" onClick={() => setHelp('')}>Close</button></div>
        <p style={{ marginTop: 10 }}>The score says how well a crop plan looks after the soil over the two plan years. It runs from 0 to 100, and <b>bigger is better</b>. It compares the plans for this farm. It is not a test of the soil itself.</p>
        <p className="small bands"><span><Band points={20} /> below 40: like the weakest farms nearby</span><span><Band points={50} /> 40 to 60: in between</span><span><Band points={80} /> 60 and more: close to the best plan found</span></p>

        {p && c && sc && (
          <section className="measure">
            <h3>The plan on screen: {p.name}</h3>
            <table>
              <thead><tr><th>Part</th><th>What was counted</th><th className="n">Points</th></tr></thead>
              <tbody>
                <tr><td>Soil cover</td><td>{c.bareErosive.p50} days of bare soil under heavy rain a year</td><td className="n"><b>{sc.cover}</b></td></tr>
                <tr><td>Crop variety</td><td>cereal after cereal on {pct(c.cerealAfterCereal)} of the farm; {c.familiesPerYear.join(' and ')} crop groups</td><td className="n"><b>{sc.variety}</b></td></tr>
                <tr><td>Organic matter</td><td>humus balance {signed(c.humus)} kg per hectare a year</td><td className="n"><b>{sc.organic}</b></td></tr>
                <tr className="score-row"><td><b>Soil health score</b></td><td>the average of the three</td><td className="n"><b>{sc.total}</b><Band points={sc.total} /></td></tr>
              </tbody>
            </table>
          </section>)}

        <section className="measure">
          <h3>1 · Soil cover</h3>
          <p>Rain washes bare soil away, and heavy summer storms do most of the damage. We count the days in a year when a field has no green plants on it. A bare day in July, when storms are strongest here, counts several times more than a bare day in January. Fewer such days give more points.</p>
          <p className="src-line">Seen from space: how green each field is (NASA HLS satellite images) and when heavy rain falls here (NASA GPM IMERG).</p>
        </section>
        <section className="measure">
          <h3>2 · Crop variety</h3>
          <p>Growing the same kind of crop again and again builds up diseases, pests and weeds. Two things are counted, half of the points each: how much of the farm has a cereal right after another cereal (less is better), and how many crop groups the farm grows each year: cereals, oilseeds, legumes, root crops, grass (more is better).</p>
          <p className="src-line">Read from the crop plan itself.</p>
        </section>
        <section className="measure">
          <h3>3 · Organic matter</h3>
          <p>Roots, straw and other residues feed the soil. Cereals and rapeseed take more than they give. Legumes, grass, catch crops and straw left on the field give more than they take. The humus balance adds this up for the whole plan. A higher balance gives more points.</p>
          <p className="src-line">Published values per crop from the German humus balance method (VDLUFA).</p>
        </section>
        <section className="measure">
          <h3>From three parts to one score</h3>
          <p>Each part gets 0 to 100 points. <b>0</b> is the weakest tenth of farms around here, worked out from what farms within {farmerTransitions.radiusKm} km sow. <b>100</b> is the best plan found for this farm. The score is the plain average of the three parts: each counts the same. No rulebook says which part matters more for the soil, so none gets extra weight.</p>
          <p><b>Best for soil</b> is the plan with the highest score. When several plans are within {SOIL_TIE_POINTS} points of the top, the one that earns the most is shown: a few points are too small a difference to matter.</p>
        </section>
        <section className="measure">
          <h3>What the score cannot tell</h3>
          <ul className="plain">
            <li>It does not measure your soil. No samples were taken: it scores the plan.</li>
            <li>Ploughing, fertiliser and lime are not in it. They cannot be seen from a crop plan or from space.</li>
            <li>Stubble and straw on the field count as bare soil, because the satellite sees only green plants.</li>
            <li>The numbers are typical for the last two seasons, not a forecast for one year.</li>
          </ul>
          <p className="small">The table under each plan also shows days without green cover, bare soil on erosion-sensitive land and in the leaching season, and harvest on wet soil. They are not in the score: they repeat soil cover or are rough warning signs.</p>
        </section>
        <section className="measure">
          <h3>Sources</h3>
          <p className="small sources">{SCORE_SOURCES.map(id => SOIL_SOURCES[id]).map(x => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.label}>{x.short ?? x.label} ↗</a>)}</p>
        </section>
      </aside>
    </>
  );
}

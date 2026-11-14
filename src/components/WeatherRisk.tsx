'use client';
// Analytics, Weather risk, for a farmer. On top, the weather at the farm by month: how many years in 10 each kind of
// bad weather came. Below, on the same half-month grid, the sowing, harvest and winter of the selected plan's crops;
// every window that meets bad weather is outlined (stronger when it happens more often). Clicking a window says what
// can go wrong and how often. Half-months, so a window from 25 April to 10 May shows on both sides of the border.
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import hazardsJson from '@/data/hazards.json';
import { CROPS } from '@/pilot/regional';
import { cropColor } from './colors';
import { Panel, Sw, useQueryState } from './ui';

type Hazard = { id: string; label: string; definition: string; byMonth: (number | null)[] };
const HAZARDS = (hazardsJson as unknown as { hazards: Hazard[] }).hazards;
const byId = (id: string) => HAZARDS.find(h => h.id === id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RISKY = 0.3; // a window meets bad weather when it came in at least 3 years of 10
const OFTEN = 0.6; // from 6 years of 10 the outline is strong

// the weather rows in plain words
const SHORT: Record<string, string> = { frost: 'Frost (−2 °C)', deepCold: 'Hard frost (−20 °C)', heat: 'Heat (30 °C, 3+ days)', dry: 'Dry month', heavyRain: 'Downpour (20 mm a day)', wetSpell: 'Rainy spell (10+ wet days)' };

// which weather hurts at which moment, and what it does
type Stage = 'sow' | 'harvest' | 'winter';
const HURTS: { stage: Stage; hazard: string; what: string; why: string; only?: 'spring' | 'winter' }[] = [
  { stage: 'sow', hazard: 'frost', what: 'frost (−2 °C)', why: 'it can kill young plants', only: 'spring' },
  { stage: 'sow', hazard: 'wetSpell', what: 'long rainy spells', why: 'fields may be too wet to sow' },
  { stage: 'sow', hazard: 'dry', what: 'a dry month', why: 'seeds may come up unevenly' },
  { stage: 'harvest', hazard: 'wetSpell', what: 'long rainy spells', why: 'harvest is delayed and grain has to be dried' },
  { stage: 'harvest', hazard: 'heavyRain', what: 'downpours (20 mm in a day)', why: 'crops lodge and the harvest waits' },
  { stage: 'winter', hazard: 'deepCold', what: 'hard frost (−20 °C)', why: 'winter crops can die where there is no snow', only: 'winter' },
];
const STAGE_WORD: Record<Stage, string> = { sow: 'sowing', harvest: 'harvest', winter: 'winter' };
const STAGE_LABEL: Record<Stage, string> = { sow: 'Sow', harvest: 'Harvest', winter: 'Winter' };

/** "MM-DD" → half-month 0..23 */
const half = (d: string) => (+d.slice(0, 2) - 1) * 2 + (+d.slice(3, 5) > 15 ? 1 : 0);
/** half-months from a to b, wrapping over the new year */
const span = (a: number, b: number) => { const out: number[] = []; for (let h = a; ; h = (h + 1) % 24) { out.push(h); if (h === b) break; } return out; };
const niceDay = (d: string) => `${+d.slice(3, 5)} ${MONTHS[+d.slice(0, 2) - 1]}`;
const range = (a: string, b: string) => (a.slice(0, 2) === b.slice(0, 2) ? `${+a.slice(3, 5)}–${niceDay(b)}` : `${niceDay(a)} – ${niceDay(b)}`);
const tenths = (v: number) => Math.max(1, Math.round(v * 10));

type Risk = { hazard: string; what: string; why: string; month: number; share: number };
type Window = { key: string; crop: string; stage: Stage; halves: number[]; text: string; risks: Risk[] };

function windowsOf(id: string): Window[] {
  const c = CROPS[id];
  if (!c?.sowing.from || !c.sowing.to || !c.harvest.from || !c.harvest.to) return [];
  const ws: Omit<Window, 'risks'>[] = [
    { key: `${id}.sow`, crop: id, stage: 'sow', halves: span(half(c.sowing.from), half(c.sowing.to)), text: range(c.sowing.from, c.sowing.to) },
    { key: `${id}.harvest`, crop: id, stage: 'harvest', halves: span(half(c.harvest.from), half(c.harvest.to)), text: range(c.harvest.from, c.harvest.to) },
  ];
  if (c.season === 'winter') ws.push({ key: `${id}.winter`, crop: id, stage: 'winter', halves: [22, 23, 0, 1, 2, 3], text: 'December – February' });
  return ws.map(w => {
    const months = [...new Set(w.halves.map(x => x >> 1))];
    const risks = HURTS.filter(r => r.stage === w.stage && (!r.only || c.season === r.only)).flatMap(r => {
      const h = byId(r.hazard); if (!h) return [];
      const [month, share] = months.map(m => [m, h.byMonth[m] ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
      return share >= RISKY ? [{ hazard: r.hazard, what: r.what, why: r.why, month, share }] : [];
    }).sort((a, b) => b.share - a.share);
    return { ...w, risks };
  });
}
const worstOf = (w: Window) => w.risks[0]?.share ?? 0;
/** a window that wraps over the new year is drawn in pieces */
const runsOf = (halves: number[]) => { const runs: number[][] = []; for (const h of halves) { const last = runs.at(-1); if (last && h === last.at(-1)! + 1) last.push(h); else runs.push([h]); } return runs; };

/** One row of the shared grid: a label and 24 half-month cells. */
function Row({ label, children, cls = '' }: { label: ReactNode; children: ReactNode; cls?: string }) {
  return (
    <div className={`wx-row ${cls}`} role="row">
      <span className="wx-lab" role="rowheader">{label}</span>
      <span className="wx-track" role="cell">{Array.from({ length: 24 }, (_, h) => <i key={h} className={`wx-h${h % 2 ? ' odd' : ''}`} style={{ gridColumn: h + 1 }} />)}{children}</span>
    </div>
  );
}
const MonthHead = ({ on }: { on?: Set<number> }) => <div className="wx-row wx-months" role="row"><span role="columnheader" />{MONTHS.map((m, i) => <span key={m} role="columnheader" className={`wx-m${on?.has(i) ? ' on' : ''}`}>{m.slice(0, 3)}</span>)}</div>;
/** The picked window as a band down the whole calendar, one piece per run (a winter window wraps over the new year). */
const Band = ({ w }: { w?: Window }) => <>{w && runsOf(w.halves).map((r, i) => (
  <span key={`${w.key}${i}`} className="wx-band" aria-hidden style={{ left: `calc(var(--lab) + (100% - var(--lab)) * ${r[0] / 24})`, width: `calc((100% - var(--lab)) * ${r.length / 24})` }} />))}</>;

/** "What can go wrong" for one window, as a popup next to it; closes on Escape, a click outside, scrolling or ×. */
function WindowPopup({ w, onClose }: { w: Window; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current, a = document.querySelector<HTMLElement>(`[data-win="${w.key}"]`);
    if (!b || !a) return;
    const r = a.getBoundingClientRect(), h = b.offsetHeight, wd = b.offsetWidth;
    const up = r.bottom + 8 + h > window.innerHeight - 8 && r.top - 8 - h >= 8;
    b.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - wd - 8))}px`;
    b.style.top = `${up ? r.top - 8 - h : r.bottom + 8}px`;
    b.style.visibility = 'visible';
    b.focus();
  }, [w.key]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const out = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest('[data-win]')) onClose(); };
    window.addEventListener('keydown', key); window.addEventListener('mousedown', out); window.addEventListener('scroll', onClose, true); window.addEventListener('resize', onClose);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', out); window.removeEventListener('scroll', onClose, true); window.removeEventListener('resize', onClose); };
  }, [onClose]);
  return (
    <div ref={box} className="wx-pop" role="dialog" aria-label={`What can go wrong: ${CROPS[w.crop].name}, ${STAGE_WORD[w.stage]}`} tabIndex={-1}>
      <div className="wx-pop-h"><h3>{CROPS[w.crop].name}, {STAGE_WORD[w.stage]}</h3><button type="button" className="wx-x" aria-label="Close" onClick={onClose}>×</button></div>
      <small>{w.text} · what can go wrong</small>
      <ul>{w.risks.map(r => (
        <li key={r.what}>
          <span className="wx-n"><b>{tenths(r.share)}</b> in 10 years</span>
          <span>{r.what.charAt(0).toUpperCase() + r.what.slice(1)} in {MONTHS[r.month]}: {r.why}.</span>
        </li>))}</ul>
    </div>
  );
}

export function WeatherRisk({ crops, planName, source }: { crops: string[]; planName: string; source: ReactNode }) {
  const windows = crops.flatMap(windowsOf);
  const risky = windows.filter(w => w.risks.length);
  const [pickKey, setPick] = useQueryState<string>('pick', '');
  const pick = windows.find(w => w.key === pickKey && w.risks.length);
  const rows = [...new Set(windows.map(w => w.crop))];
  // a stable close for the popup's listeners (setPick changes with every render)
  const setRef = useRef(setPick); setRef.current = setPick;
  const close = useCallback(() => setRef.current(''), []);
  // the months the picked window touches; the weather that makes it risky is ringed, the rest of the year fades
  const onMonths = pick ? new Set(pick.halves.map(h => h >> 1)) : undefined;
  const hit = (id: string, m: number) => !!pick?.risks.some(r => r.hazard === id && r.month === m);

  return (
    <>
      <Panel title="The weather at the farm" sub={source}>
        <div className="scroll-x"><div className={`wx-cal${pick ? ' picking' : ''}`} role="table" aria-label="How many years in 10 each kind of bad weather came, by month">
          <Band w={pick} />
          <MonthHead on={onMonths} />
          {HAZARDS.map(h => (
            <Row key={h.id} label={<span title={h.definition}>{SHORT[h.id] ?? h.label}</span>} cls={pick?.risks.some(r => r.hazard === h.id) ? 'on' : ''}>
              {h.byMonth.map((v, m) => v ? <span key={m} className={`wx-cell${hit(h.id, m) ? ' hit' : onMonths && !onMonths.has(m) ? ' dim' : ''}`} style={{ gridColumn: `${2 * m + 1} / ${2 * m + 3}`, background: `rgba(181,69,44,${0.08 + v * 0.85})`, color: v >= 0.45 ? '#fff' : 'var(--ink)' }} title={`${MONTHS[m]}: ${tenths(v)} in 10 years`}>{tenths(v)}</span> : null)}
            </Row>))}
        </div></div>
        <p className="note" style={{ marginTop: 8 }}>The number: in how many years of 10 it happened in that month (2001–2025). Darker is more often.</p>
      </Panel>

      <Panel title="When can the weather hurt your crops?" sub={<>the crops of “{planName}” · click an outlined window</>}>
        <div className="scroll-x"><div className={`wx-cal${pick ? ' picking' : ''}`} role="table" aria-label="Sowing, harvest and winter of the plan's crops by half-month">
          <Band w={pick} />
          <MonthHead on={onMonths} />
          {rows.map(id => (
            <Row key={id} label={<><Sw c={cropColor(id)} />{CROPS[id].name}</>}>
              {windows.filter(w => w.crop === id && (w.stage !== 'winter' || w.risks.length)).flatMap(w => {
                const runs = runsOf(w.halves), labelled = runs.reduce((a, r, i) => (r.length > runs[a].length ? i : a), 0);
                const bad = w.risks.length > 0, strong = worstOf(w) >= OFTEN;
                return runs.map((r, i) => (
                  <button key={`${w.key}${i}`} type="button" disabled={!bad} aria-pressed={pick?.key === w.key} aria-haspopup={bad ? 'dialog' : undefined} data-win={i === labelled ? w.key : undefined}
                    className={`wx-win ${w.stage}${bad ? (strong ? ' bad strong' : ' bad') : ''}${pick?.key === w.key ? ' on' : ''}`}
                    style={{ gridColumn: `${r[0] + 1} / ${r.at(-1)! + 2}` }} onClick={() => setPick(pick?.key === w.key ? '' : w.key)}
                    title={`${CROPS[id].name}, ${STAGE_WORD[w.stage]}: ${w.text}`}>
                    {i === labelled && STAGE_LABEL[w.stage]}
                  </button>));
              })}
            </Row>))}
        </div></div>
        <div className="legend"><span><i className="sw wx-sw sow" />sowing</span><span><i className="sw wx-sw harvest" />harvest</span><span><i className="sw wx-sw winter" />winter</span><span><i className="sw wx-sw bad strong" />bad weather in 6+ years of 10</span><span><i className="sw wx-sw bad" />in 3–5 years of 10</span></div>

        {pick && <WindowPopup w={pick} onClose={close} />}
        {!risky.length && <p className="lead">No common weather trouble at sowing or harvest for these crops.</p>}
      </Panel>
    </>
  );
}

/** The risky windows as data for the assistant. */
export const weatherClashes = (crops: string[]) => crops.flatMap(windowsOf).filter(w => w.risks.length)
  .map(w => ({ crop: CROPS[w.crop].name, when: `${STAGE_WORD[w.stage]}, ${w.text}`, risks: w.risks.map(r => ({ weather: r.what, month: MONTHS[r.month], yearsInTen: tenths(r.share), effect: r.why })) }));

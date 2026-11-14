'use client';
// Assistant as a support-style chat in the corner of every screen. It is sent where the user is (screen, what the
// screen shows and why it is built that way, what is selected) together with the plan data, so "this", "here" and
// "this number" can be answered. It explains; it does not choose.
import { useEffect, useRef, useState } from 'react';
import { catchBefore } from '@/engine/plan';
import { DECISION_DATE, PLAN_DATA, PLAN_YEARS, farm, products, weather } from '@/pilot/demo';
import { CROPS, cropLabel } from '@/pilot/regional';
import { autumnHint, seasonCover, springHint } from '@/pilot/satellite';
import { soilClimate } from '@/pilot/soil';
import { soilCheck } from './Soil';
import { SCREENS } from './screens';
import { useStore } from './store';

interface Msg { role: 'user' | 'assistant'; content: string; error?: boolean; screen?: string }

export default function Chat() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open]);
  const note = SCREENS[s.screenKey] ?? SCREENS.map;

  function context(): string {
    const fields = s.fields;
    const p = s.plan, base = s.base, f = fields.find(x => x.id === s.field)!, fp = products.fields[f.id];
    const E = soilClimate.erosivity, autumn = autumnHint(f.id);
    const ch = (c: any) => c && ({ soilHealthScore: c.soilScore, marginUsualSeason: c.marginMean, margin10to90: [c.marginP10, c.marginP90], marginBadSeasons: c.marginWorstFifth, marginDrySeasons: c.marginDry, marginOrdinarySeasons: c.marginNormal, soil: { daysWithoutCoverWeightedByErosiveRain: c.bareErosive, daysWithoutLivingCover: c.bareDays, weightedDaysOnErosionSensitiveLandHaDays: c.bareOnSlopes, bareDaysInLeachingSeason: c.bareLeaching, cropFamiliesPerYear: c.familiesPerYear, harvestOnWetSoilHa: c.wetHarvestHa, humusBalanceKgCPerHa: c.humus, strawLeftOnField: c.humusStrawLeft }, cerealAfterCerealShare: c.cerealAfterCereal, legumeShare: c.legumeShare, largestCropShare: c.largestCropShare, paymentsEurHa: c.paymentsEurHa, worstSeasons: c.worstSeasons, rules: c.rules.map((r: any) => ({ rule: r.title, year: r.year, ok: r.ok, detail: r.detail })) });
    return JSON.stringify({
      currentScreen: { name: note.title, whatItShows: note.shows, whyItIsBuiltThisWay: note.why, stateOnScreen: s.screenState() },
      farm: { name: farm.name, note: farm.note, fields: fields.length, ha: farm.totalHa, decisionDay: DECISION_DATE, planHarvestYears: PLAN_YEARS, dataThePlanUsesAllFromBeforeTheDecisionDay: PLAN_DATA.map(d => `${d.label} (to ${d.until})`) },
      setup: { cropSet: s.cropSet.map(c => CROPS[c].name), catchCropsAllowed: s.catchCrops, costFactor: s.costFactor, userBans: s.excluded, cropOfThisYear: Object.fromEntries(fields.map(x => [x.id, cropLabel(x.history[+DECISION_DATE.slice(0, 4)]?.crop)])), sownForTheFirstPlanYear: Object.fromEntries(fields.map(x => [x.id, s.current[x.id] ? CROPS[s.current[x.id]!].name : 'nothing yet'])) },
      selectedPlan: p && { name: p.name, kind: p.kind, description: p.sub, characteristics: ch(p.v.ch), fields: p.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map((c, i) => `${PLAN_YEARS[i]} ${CROPS[c].name}${catchBefore(o, i) ? ' after a catch crop' : ''}${o.fixed[i] ? ' (fixed)' : ''}`), warnings: o.warnings })) },
      usualPractice: base && { characteristics: ch(base.v.ch), fields: base.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map(c => CROPS[c].name) })) },
      otherPlans: s.plans.filter(x => x.kind !== 'front' && x.id !== p?.id && x.id !== 'usual').map(x => ({ name: x.name, soilHealthScore: x.v.ch.soilScore?.total, marginUsualSeason: x.v.ch.marginMean, marginBadSeasons: x.v.ch.marginWorstFifth, daysWithoutCoverWeightedByErosiveRain: x.v.ch.bareErosive.p50, daysWithoutLivingCover: x.v.ch.bareDays.p50, bareDaysInLeachingSeason: x.v.ch.bareLeaching, humusBalanceKgCPerHa: x.v.ch.humus, cerealAfterCerealShare: x.v.ch.cerealAfterCereal })),
      soilClimateAtTheFarm: { erosiveRainShareByMonthJanToDec: E.byMonth, juneToAugustShare: E.summary[E.base].junToAug, decemberToFebruaryShare: E.summary[E.base].decToFeb, shareInHalfMonthsTheSatelliteCannotSee: E.summary[E.base].blindHalfMonths, stormsCounted: E.storms?.storms, leachingSeasonSurplusMm: soilClimate.leaching.seasonSurplusMm, typicallyWetHarvestWindows: Object.entries(soilClimate.harvest.crops).filter(([, h]) => h.typicallyWet).map(([c]) => c),
        check: { plansCompared: soilCheck.plans, planWithFewestBareSoilDaysStaysFirstUnderOtherRainWeightings: `${soilCheck.variants.filter(v => v.basePlanRank === 1).length} of ${soilCheck.variants.length}`, exactLowerBoundDays: soilCheck.lowerBound } },
      selectedField: { id: f.id, ha: f.areaHa, history: Object.fromEntries(Object.entries(f.history).map(([y, h]) => [y, cropLabel(h.crop ?? h.cropClass)])), soil: `${f.soilType}, texture ${f.soilTexture}`, erosionSensitiveShare: f.erosionShare, peatShare: f.peatShare, terrain: fp.terrain, earlySpringSatelliteHint: springHint(f.id), autumnSatelliteHint: autumn.winterCropSuggested === null ? 'not observed yet on the decision day' : autumn, daysWithoutCoverBySeason: seasonCover(f.id).slice(-4),
        notAdmittedCrops: s.ws.fields.find(x => x.field.id === f.id)?.rejected.slice(0, 12).map(r => ({ crop: CROPS[r.crop].name, year: r.year, reason: r.reasons[0] })) },
      weather: { dryYears: weather.dryYears, wetHarvestYears: weather.wetHarvestYears, trend: weather.trend },
    });
  }

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q.trim(), screen: note.title }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next.filter(m => !m.error).map(({ role, content }) => ({ role, content })), context: context() }) });
      const j = await r.json();
      setMsgs([...next, j.text ? { role: 'assistant', content: j.text } : { role: 'assistant', content: j.error ?? 'No answer.', error: true }]);
    } catch { setMsgs([...next, { role: 'assistant', content: 'The assistant could not be reached.', error: true }]); }
    setBusy(false);
  }

  if (!open) return (
    <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open the assistant">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M4 5h16v11H10l-6 4V5Z" /></svg>Ask
    </button>
  );
  return (
    <section className="chat-win" aria-label="Assistant">
      <header className="chat-h">
        <div style={{ flex: 1, minWidth: 0 }}><b>Ask about this screen</b><small>You are on {note.title}</small></div>
        <button className="btn sm" onClick={() => setOpen(false)} aria-label="Close the assistant">Close</button>
      </header>
      <div className="chat-msgs">
        {msgs.length === 0 && (
          <>
            <p className="muted">I explain what is on the screen, where a number comes from and why the tool works this way. I do not choose a plan for you.</p>
            <div className="chat-sug">{note.ask.map(q => <button key={q} className="btn" onClick={() => ask(q)}>{q}</button>)}</div>
          </>
        )}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}${m.error ? ' err' : ''}`}>{m.content}</div>)}
        {busy && <div className="msg bot muted">Looking at {note.title}…</div>}
        {msgs.length > 0 && !busy && <div className="chat-sug">{note.ask.filter(q => !msgs.some(m => m.content === q)).slice(0, 2).map(q => <button key={q} className="btn sm" onClick={() => ask(q)}>{q}</button>)}</div>}
        <div ref={end} />
      </div>
      <form className="chat-ask" onSubmit={e => { e.preventDefault(); ask(text); }}>
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} placeholder="Ask about what you see…" aria-label="Question" />
        <button className="btn pri" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  );
}

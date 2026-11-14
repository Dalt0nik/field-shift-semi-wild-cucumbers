'use client';
// Assistant as a support-style chat in the corner of every screen. It is sent where the user is (screen, what the
// screen shows and why it is built that way, what is selected) together with the plan data, so "this", "here" and
// "this number" can be answered. It explains; it does not choose.
import { useEffect, useRef, useState } from 'react';
import { DECISION_DATE, PLAN_YEARS, farm, fields, products, weather } from '@/pilot/demo';
import { CROPS, cropLabel } from '@/pilot/regional';
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
    const p = s.plan, base = s.base, f = fields.find(x => x.id === s.field)!, fp = products.fields[f.id];
    const ch = (c: any) => c && ({ marginUsualSeason: c.marginMean, margin10to90: [c.marginP10, c.marginP90], marginBadSeasons: c.marginWorstFifth, marginDrySeasons: c.marginDry, marginOrdinarySeasons: c.marginNormal, bareSoilDays: c.bareDays, bareDaysNovFeb: c.bareDaysWinter, bareOnErosionSensitiveHaDays: c.bareOnSlopes, cerealAfterCerealShare: c.cerealAfterCereal, legumeShare: c.legumeShare, largestCropShare: c.largestCropShare, paymentsEurHa: c.paymentsEurHa, worstSeasons: c.worstSeasons, rules: c.rules.map((r: any) => ({ rule: r.title, year: r.year, ok: r.ok, detail: r.detail })) });
    return JSON.stringify({
      currentScreen: { name: note.title, whatItShows: note.shows, whyItIsBuiltThisWay: note.why, stateOnScreen: s.screenState() },
      farm: { name: farm.name, note: farm.note, fields: fields.length, ha: farm.totalHa, decisionDay: DECISION_DATE, planHarvestYears: PLAN_YEARS },
      setup: { cropSet: s.cropSet.map(c => CROPS[c].name), catchCropsAllowed: s.catchCrops, costFactor: s.costFactor, userBans: s.excluded, inTheGroundNow: Object.fromEntries(fields.map(x => [x.id, s.current[x.id] ? CROPS[s.current[x.id]!].name : 'nothing sown'])) },
      selectedPlan: p && { name: p.name, kind: p.kind, description: p.sub, characteristics: ch(p.v.ch), fields: p.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map((c, i) => `${PLAN_YEARS[i]} ${CROPS[c].name}${i > 0 && o.catchAfter[i - 1] ? ' after a catch crop' : ''}${o.fixed[i] ? ' (fixed)' : ''}`), warnings: o.warnings })) },
      usualPractice: base && { characteristics: ch(base.v.ch), fields: base.v.options.map(o => ({ field: o.fieldId, crops: o.crops.map(c => CROPS[c].name) })) },
      otherPlans: s.plans.filter(x => x.kind !== 'front' && x.id !== p?.id && x.id !== 'usual').map(x => ({ name: x.name, marginUsualSeason: x.v.ch.marginMean, marginBadSeasons: x.v.ch.marginWorstFifth, bareSoilDays: x.v.ch.bareDays.p50, cerealAfterCerealShare: x.v.ch.cerealAfterCereal })),
      selectedField: { id: f.id, ha: f.areaHa, history: Object.fromEntries(Object.entries(f.history).map(([y, h]) => [y, cropLabel(h.crop ?? h.cropClass)])), soil: `${f.soilType}, texture ${f.soilTexture}`, erosionSensitiveShare: f.erosionShare, peatShare: f.peatShare, terrain: fp.terrain, autumn2026SatelliteHint: fp.autumn2026, bareDaysBySeason: fp.seasons.slice(-4),
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

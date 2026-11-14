'use client';
// Application frame: brand and farm on top, the screens on the left in the order of the work, the assistant in
// the corner. The frame names no rule: the rules live on one screen (Checks). The NASA data come before the plan.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { DECISION_DATE, farm, fields } from '@/pilot/demo';
import Chat from './Chat';
import { GLOSSARY } from './glossary';
import { SoilHelp } from './Soil';
import { useStore } from './store';

const I = (d: string) => <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
type Item = { href: string; label: string; hint: string; icon: ReactNode } | { group: string };
const NAV: Item[] = [
  { group: 'Farm' },
  { href: '/map', label: 'Map', hint: 'The fields of the farm', icon: I('M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14') },
  { href: '/organization', label: 'Fields', hint: 'What grows now, field timelines', icon: I('M4 20V8l8-4 8 4v12M4 20h16M9 20v-6h6v6') },
  { group: 'NASA data' },
  { href: '/scenes', label: 'Satellite', hint: 'Satellite layers as numbers per field', icon: I('M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5') },
  { href: '/analytics', label: 'Analytics', hint: 'Bare soil and erosive rain, weather risk, risk zones, method', icon: I('M4 20V4m0 16h16M8 16l4-5 3 3 5-7') },
  { group: 'Plan' },
  { href: '/settings', label: 'Crops', hint: 'Crops the farm can grow, limits', icon: I('M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M14 4v4M8 10v4M16 16v4') },
  { href: '/planner', label: 'Planner', hint: 'Suggested plans, your own plan, comparison', icon: I('M12 21V10m0 0c0-3 2-6 6-7 0 4-2 7-6 7Zm0 3c0-3-2-5-6-6 0 4 2 6 6 6Z') },
  { href: '/rules', label: 'Checks', hint: 'Rule checks of a plan', icon: I('M5 12l4 4L19 6M4 20h16') },
];
const date = new Date(DECISION_DATE + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const s = useStore();
  return (
    <div className="app">
      <header className="top">
        <Link href="/map" className="brand">Field Shift</Link>
        <div className="farm" title={farm.note}>
          <b>Demo farm near Vilkaviškis</b>
          <small>{fields.length} fields · {farm.totalHa.toFixed(0)} ha</small>
        </div>
        <span className="sp" />
        {s.chosen && <Link href="/planner" className="meta hide-narrow">Chosen plan: <b>{s.chosen.name}</b></Link>}
        <span className="meta" title="The demo replays the decision of this day. The plan uses only data from before it.">Decision day <b>{date}</b></span>
        <button className="link" onClick={() => s.setGlossary(!s.glossary)} aria-expanded={s.glossary}>Glossary</button>
      </header>
      <nav className="nav" aria-label="Screens">
        {NAV.map((n, i) => 'group' in n ? <span key={i} className="grp">{n.group}</span>
          : <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? 'on' : ''} title={n.hint} aria-current={path.startsWith(n.href) ? 'page' : undefined}>{n.icon}<span>{n.label}</span></Link>)}
      </nav>
      <main className="main"><Suspense fallback={null}>{children}</Suspense></main>
      <Chat />
      <Suspense fallback={null}><SoilHelp /></Suspense>
      {s.glossary && (
        <>
          <div className="scrim" onClick={() => s.setGlossary(false)} />
          <aside className="drawer" aria-label="Glossary">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Glossary</h2><button className="btn sm" onClick={() => s.setGlossary(false)}>Close</button></div>
            <dl>{Object.entries(GLOSSARY).map(([k, g]) => <div key={k}><dt>{g.term}</dt><dd>{g.text}</dd></div>)}</dl>
          </aside>
        </>
      )}
    </div>
  );
}

'use client';
// Small building blocks: panel, tabs, dropdown, explained term, "check on the farm" line, state kept in the URL.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from './glossary';

export function Panel({ title, sub, right, children, className = '' }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && <header className="panel-h">{title && <h2>{title}</h2>}{sub && <small>{sub}</small>}{right && <span className="right">{right}</span>}</header>}
      {children}
    </section>
  );
}

export const Sw = ({ c }: { c: string }) => <i className="sw" style={{ background: c }} />;
export const Pill = ({ tone, children, title }: { tone?: 'ok' | 'bad' | 'warn'; children: ReactNode; title?: string }) => <span className={`pill ${tone ?? ''}`} title={title}>{children}</span>;

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label?: string }) {
  return <div className="tabs" role="tablist" aria-label={label}>{tabs.map(t => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}

/** A term with its plain-language explanation (challenge R7): underlined in the text, explained on hover or keyboard
 * focus. This is the only place the vocabulary of glossary.ts is shown. The explanation is drawn on top of the page
 * and placed from its measured size, so no panel, table or window edge cuts it off. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const g = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLSpanElement>(null), tip = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  useLayoutEffect(() => {
    const t = tip.current;
    if (!open || !el.current || !t) return;
    const r = el.current.getBoundingClientRect(), h = t.offsetHeight, w = t.offsetWidth;
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h >= 8;
    t.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    t.style.top = `${up ? r.top - 6 - h : r.bottom + 6}px`;
    t.style.visibility = 'visible';
    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [open]);
  if (!g) return <>{children}</>;
  return (
    <span ref={el} className="term" tabIndex={0} aria-describedby={open ? tipId : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      {children ?? g.term}
      {open && createPortal(<span ref={tip} id={tipId} role="tooltip" className="tip"><b>{g.term}</b>{g.text}{g.source && <small>Source: {g.source}</small>}</span>, document.body)}
    </span>
  );
}

/** What the agronomist should verify on the ground (challenge R8). One quiet line, not an alert box. */
export const Check = ({ children }: { children: ReactNode }) => <p className="check"><b>Check on the farm:</b> {children}</p>;

/** Secondary material stays one click away, so the screen carries one job. */
export const More = ({ label, children }: { label: string; children: ReactNode }) => <details className="more"><summary>{label}</summary><div>{children}</div></details>;

export interface Option<T extends string> { value: T; label: string; color?: string }
/** Dropdown in the design system (a native select cannot be styled). Keyboard: arrows, Enter, Escape. */
export function Select<T extends string>({ value, options, onChange, label, small, block }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; small?: boolean; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const cur = options.find(o => o.value === value);
  const show = () => {
    const r = btn.current!.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 220 && r.top > below;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 260)), minWidth: r.width, maxHeight: Math.max(140, (up ? r.top : below) - 14), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    setAct(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true);
  };
  const pick = (v: T) => { setOpen(false); if (v !== value) onChange(v); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    // a scroll or resize of the window itself has no node as its target
    const inside = (el: HTMLElement | null, t: EventTarget | null) => t instanceof Node && !!el?.contains(t);
    const away = (e: Event) => { if (!inside(pop.current, e.target) && !inside(btn.current, e.target)) setOpen(false); };
    const hide = (e: Event) => { if (!inside(pop.current, e.target)) setOpen(false); };
    document.addEventListener('mousedown', away); window.addEventListener('resize', hide); window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  }, [open]);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) show(); else setAct(a => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); }
    if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); pick(options[act].value); }
  };
  return (
    <>
      <button ref={btn} type="button" className={`dd${small ? ' sm' : ''}${block ? ' block' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={e => { e.stopPropagation(); if (open) setOpen(false); else show(); }} onKeyDown={key}>
        {cur?.color && <Sw c={cur.color} />}<span className="dd-v">{cur?.label ?? '—'}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {open && createPortal(
        <div ref={pop} className="dd-pop" role="listbox" aria-label={label} style={pos}>
          {options.map((o, i) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={`dd-opt${i === act ? ' act' : ''}${o.value === value ? ' cur' : ''}`} onMouseEnter={() => setAct(i)} onMouseDown={e => { e.preventDefault(); pick(o.value); }}>
              {o.color && <Sw c={o.color} />}{o.label}
            </button>))}
        </div>, document.body)}
    </>
  );
}

/** Tab-like state kept in the URL (?key=value), so every state of the app has an address. */
export function useQueryState<T extends string>(key: string, def: T): [T, (v: T) => void] {
  const sp = useSearchParams(), router = useRouter(), path = usePathname();
  const v = (sp.get(key) as T | null) ?? def;
  const set = (nv: T) => { const p = new URLSearchParams(sp.toString()); if (nv === def) p.delete(key); else p.set(key, nv); const q = p.toString(); router.replace(q ? `${path}?${q}` : path, { scroll: false }); };
  return [v, set];
}

export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)} %`;

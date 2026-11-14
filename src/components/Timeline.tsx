'use client';
// "A field is a timeline of slots": one row per field, occupied gaps as blocks, free slots as dashed boxes.
import { baseTimeline, catchBefore, occupancyFor, slots, type PlanSetup } from '@/engine/plan';
import { CLASS_INFO, cropLabel, CROPS } from '@/pilot/regional';
import type { FieldInfo, FieldOption, Occupancy, Slot } from '@/engine/types';
import { cropColor } from './colors';

export interface Row { id: string; areaHa: number; occ: Occupancy[]; slots?: Slot[]; catches?: { from: string; to: string }[] }
interface Props { rows: Row[]; from: number; to: number; decision: string; selected?: string | null; onSelect?: (id: string) => void }

const day = (s: string) => Date.parse(s + 'T00:00:00Z') / 864e5;
const MONTHS = 'JFMAMJJASOND';
/** Where the sowing window ends and the harvest window starts inside a crop's bar, as shares of the bar. A crop
 *  harvested in the same weeks as the next one is sown then overlaps it only with these pale ends. */
function windows(o: Occupancy): [number, number] | null {
  const c = CROPS[o.crop] ?? CROPS[CLASS_INFO[o.crop]?.members[0] ?? ''];
  if (!c || c.season === 'perennial' || !c.sowing.to || !c.harvest.from) return null;
  const a = day(o.sow), b = day(o.harvest), len = b - a;
  const sowEnd = day(`${o.sow.slice(0, 4)}-${c.sowing.to}`), harvestFrom = day(`${o.harvest.slice(0, 4)}-${c.harvest.from}`);
  return len > 0 && sowEnd >= a && harvestFrom <= b && sowEnd < harvestFrom ? [(sowEnd - a) / len, (harvestFrom - a) / len] : null;
}

/** Rows for the timeline: history and what grows now, plus either the free slots (no plan) or the crops of a plan. */
export function planRows(fields: FieldInfo[], setup: PlanSetup, options: FieldOption[] | null): Row[] {
  return fields.map(f => {
    const occ: Occupancy[] = baseTimeline(f, setup);
    const catches: { from: string; to: string }[] = [];
    const o = options?.find(x => x.fieldId === f.id);
    if (o) o.crops.forEach((id, i) => {
      if (i === 0 && setup.current[f.id]) return;
      const oc = occupancyFor(id, setup.planYears[i], 'plan'); if (oc) occ.push(oc);
      if (catchBefore(o, i)) catches.push({ from: `${setup.planYears[i] - 1}-08-25`, to: `${setup.planYears[i]}-03-01` });
    });
    return { id: f.id, areaHa: f.areaHa, occ, catches, slots: o ? undefined : slots(f, occ, setup) };
  });
}

export default function Timeline({ rows, from, to, decision, selected, onSelect }: Props) {
  const d0 = day(`${from}-01-01`), d1 = day(`${to}-12-31`);
  const x = (s: string) => `${Math.max(0, Math.min(100, ((day(s) - d0) / (d1 - d0)) * 100))}%`;
  const w = (a: string, b: string) => `${Math.max(0.4, ((Math.min(day(b), d1) - Math.max(day(a), d0)) / (d1 - d0)) * 100)}%`;
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // a name is shown on every bar with room for a few letters, cut short with "…" where the bar is shorter (the
  // tooltip always has the whole name); the track is about 900 px wide at 1280 px
  const fits = (a: string, b: string, _name: string, share = 1) => ((Math.min(day(b), d1) - Math.max(day(a), d0)) / (d1 - d0)) * 900 * share > 34;
  const nameOf = (crop: string) => CROPS[crop]?.name ?? cropLabel(crop).replace(' (class)', '');
  return (
    <div className="tl" role="table" aria-label="Field timelines">
      <div className="tl-row tl-head">
        <div className="tl-name" />
        <div className="tl-track">
          {years.map(y => <span key={y} className="tl-year" style={{ left: x(`${y}-01-01`) }}>{y}</span>)}
          {years.flatMap(y => [...MONTHS].map((m, i) => <span key={`${y}-${i}`} className="tl-month" style={{ left: x(`${y}-${String(i + 1).padStart(2, '0')}-01`) }}>{m}</span>))}
          <span className="tl-now" style={{ left: x(decision) }}><i>decision day</i></span>
        </div>
      </div>
      {rows.map(r => (
        <div key={r.id} className={`tl-row${selected === r.id ? ' is-selected' : ''}`} role="row" onClick={() => onSelect?.(r.id)}>
          <div className="tl-name"><b>{r.id}</b><span>{r.areaHa.toFixed(1)} ha</span></div>
          <div className="tl-track">
            {years.map(y => <span key={y} className="tl-grid" style={{ left: x(`${y}-01-01`) }} />)}
            {r.slots?.map((s, i) => <span key={'s' + i} className="tl-slot" style={{ left: x(s.from), width: w(s.from, s.to) }} title={`Free slot ${s.from} to ${s.to}`} />)}
            {r.occ.filter(o => day(o.harvest) > d0).map(o => {
              // grass is a whole calendar year in the history; it ends where the next crop's sowing starts (ploughed up)
              if (CROPS[o.crop]?.season !== 'perennial' && CROPS[CLASS_INFO[o.crop]?.members[0] ?? '']?.season !== 'perennial') return o;
              const next = r.occ.filter(n => n.sow > o.sow && n.sow < o.harvest).map(n => n.sow).sort()[0];
              return next ? { ...o, harvest: next } : o;
            }).map((o, i) => {
              // the ends are see-through, so two windows that overlap show both crops
              const win = windows(o), c = cropColor(o.crop), pale = `color-mix(in srgb, ${c} 38%, transparent)`;
              const bg = win ? `linear-gradient(90deg, ${pale} 0 ${win[0] * 100}%, ${c} ${win[0] * 100}% ${win[1] * 100}%, ${pale} ${win[1] * 100}%)` : c;
              return (
                <span key={i} className={`tl-occ src-${o.source}${win ? ' win' : ''}`} style={{ left: x(o.sow), width: w(o.sow, o.harvest), background: bg }}
                  title={`${cropLabel(o.crop)}, sown from ${o.sow}, harvested by ${o.harvest}${o.note ? ` (${o.note})` : ''}${o.source === 'current' ? ', in the ground now' : o.source === 'plan' ? ', planned' : ''}`}>
                  {/* the name starts where the solid part starts, and only if it fits there */}
                  {fits(o.sow, o.harvest, nameOf(o.crop), win ? win[1] - win[0] : 1) && <em style={win ? { marginLeft: `${win[0] * 100}%`, width: `${(win[1] - win[0]) * 100}%` } : undefined}>{nameOf(o.crop)}</em>}
                </span>
              );
            })}
            {r.catches?.map((c, i) => <span key={'c' + i} className="tl-catch" style={{ left: x(c.from), width: w(c.from, c.to) }} title="Catch crop" />)}
            <span className="tl-nowline" style={{ left: x(decision) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

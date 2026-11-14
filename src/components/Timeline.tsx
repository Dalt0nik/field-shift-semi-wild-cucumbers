'use client';
// "A field is a timeline of slots": one row per field, occupied gaps as blocks, free slots as dashed boxes.
import { baseTimeline, catchBefore, occupancyFor, slots, type PlanSetup } from '@/engine/plan';
import { cropLabel, CROPS } from '@/pilot/regional';
import type { FieldInfo, FieldOption, Occupancy, Slot } from '@/engine/types';
import { cropColor } from './colors';

export interface Row { id: string; areaHa: number; occ: Occupancy[]; slots?: Slot[]; catches?: { from: string; to: string }[] }
interface Props { rows: Row[]; from: number; to: number; decision: string; selected?: string | null; onSelect?: (id: string) => void }

const day = (s: string) => Date.parse(s + 'T00:00:00Z') / 864e5;

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
  // a label is shown only where the bar is long enough to hold it (the tooltip always has the name)
  const fits = (a: string, b: string, name: string) => ((Math.min(day(b), d1) - Math.max(day(a), d0)) / (d1 - d0)) * 760 > name.length * 6.6 + 10;
  return (
    <div className="tl" role="table" aria-label="Field timelines">
      <div className="tl-row tl-head">
        <div className="tl-name" />
        <div className="tl-track">
          {years.map(y => <span key={y} className="tl-year" style={{ left: x(`${y}-01-01`) }}>{y}</span>)}
          <span className="tl-now" style={{ left: x(decision) }}><i>decision day</i></span>
        </div>
      </div>
      {rows.map(r => (
        <div key={r.id} className={`tl-row${selected === r.id ? ' is-selected' : ''}`} role="row" onClick={() => onSelect?.(r.id)}>
          <div className="tl-name"><b>{r.id}</b><span>{r.areaHa.toFixed(1)} ha</span></div>
          <div className="tl-track">
            {years.map(y => <span key={y} className="tl-grid" style={{ left: x(`${y}-01-01`) }} />)}
            {r.slots?.map((s, i) => <span key={'s' + i} className="tl-slot" style={{ left: x(s.from), width: w(s.from, s.to) }} title={`Free slot ${s.from} to ${s.to}`} />)}
            {r.occ.filter(o => day(o.harvest) > d0).map((o, i) => (
              <span key={i} className={`tl-occ src-${o.source}`} style={{ left: x(o.sow), width: w(o.sow, o.harvest), background: cropColor(o.crop) }}
                title={`${cropLabel(o.crop)}, ${o.sow} to ${o.harvest}${o.note ? ` (${o.note})` : ''}${o.source === 'current' ? ', in the ground now' : o.source === 'plan' ? ', planned' : ''}`}>
                {fits(o.sow, o.harvest, CROPS[o.crop]?.name ?? cropLabel(o.crop)) && <em>{CROPS[o.crop]?.name ?? cropLabel(o.crop)}</em>}
              </span>
            ))}
            {r.catches?.map((c, i) => <span key={'c' + i} className="tl-catch" style={{ left: x(c.from), width: w(c.from, c.to) }} title="Catch crop" />)}
            <span className="tl-nowline" style={{ left: x(decision) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

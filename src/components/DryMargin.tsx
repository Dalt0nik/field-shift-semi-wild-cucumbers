'use client';
// Analytics, Risk zones, dry seasons, for a farmer: one bar per plan, what it earns per hectare. Move the slider and
// the bars shrink; a pale ghost keeps the length they had, so the loss is what you see disappear. No axis, no gridlines.

export type DryRow = { id: string; name: string; past: number; dry: number; selected: boolean };

export function DryMargin({ rows, k }: { rows: DryRow[]; k: number }) {
  const moved = k > 1;
  const max = Math.max(1, ...rows.map(r => r.past));
  const w = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  return (
    <div className="db">
      {rows.map(r => (
        <div key={r.id} className={`db-row${r.selected ? ' sel' : ''}`}>
          <span className="db-name">{r.name}{r.selected && <small> · your plan</small>}</span>
          <span className="db-track">
            {moved && <i className="db-ghost" style={{ width: w(r.past) }} />}
            <i className="db-bar" style={{ width: w(moved ? r.dry : r.past) }} />
            <b className="db-val" style={{ left: w(moved ? r.dry : r.past) }}>{moved ? r.dry : r.past} €</b>
          </span>
        </div>))}
    </div>
  );
}

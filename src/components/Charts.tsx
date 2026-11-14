'use client';
// Small SVG charts in the design system.
import { SEASON_COLOR } from './colors';

const INK = '#17231c';

export function SeasonBars({ series, compare, height = 170 }: { series: { season: string; margin: number; type: string }[]; compare?: { season: string; margin: number }[]; height?: number }) {
  const W = 560, pad = 30, all = [...series.map(s => s.margin), ...(compare?.map(s => s.margin) ?? []), 0];
  const lo = Math.min(...all), hi = Math.max(...all), y = (v: number) => pad / 2 + (height - pad * 1.4) * (1 - (v - lo) / (hi - lo || 1));
  const bw = (W - pad) / series.length;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label="Margin by replayed season">
      <line x1={pad} x2={W} y1={y(0)} y2={y(0)} stroke={INK} />
      {[lo, hi].map((v, i) => <text key={i} x={pad - 4} y={y(v) + 4} textAnchor="end" className="tick">{Math.round(v)}</text>)}
      {series.map((s, i) => (
        <g key={s.season}>
          <rect x={pad + i * bw + 2} width={bw - 4} y={Math.min(y(s.margin), y(0))} height={Math.abs(y(s.margin) - y(0))} fill={SEASON_COLOR[s.type] ?? SEASON_COLOR.normal}><title>{`${s.season}: ${s.margin} €/ha (${s.type === 'dry' ? 'dry season' : s.type === 'wetHarvest' ? 'wet harvest' : 'ordinary season'})`}</title></rect>
          {compare && <line x1={pad + i * bw + 1} x2={pad + (i + 1) * bw - 1} y1={y(compare[i].margin)} y2={y(compare[i].margin)} stroke={INK} strokeWidth="2" />}
          {i % 3 === 0 && <text x={pad + i * bw + bw / 2} y={height - 3} textAnchor="middle" className="tick">{s.season}</text>}
        </g>
      ))}
    </svg>
  );
}

export function WaterBalance({ years }: { years: { year: number; waterBalanceMayJul: number; type: string }[] }) {
  const W = 560, H = 150, pad = 32, ys = years.filter(y => y.year <= 2025);
  const lo = Math.min(...ys.map(y => y.waterBalanceMayJul)), hi = Math.max(...ys.map(y => y.waterBalanceMayJul), 0);
  const y = (v: number) => 10 + (H - 34) * (1 - (v - lo) / (hi - lo)), bw = (W - pad) / ys.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="May to July water balance by year">
      <line x1={pad} x2={W} y1={y(0)} y2={y(0)} stroke={INK} />
      {[lo, 0].map((v, i) => <text key={i} x={pad - 4} y={y(v) + 4} textAnchor="end" className="tick">{Math.round(v)}</text>)}
      {ys.map((d, i) => (
        <g key={d.year}>
          <rect x={pad + i * bw + 2} width={bw - 4} y={Math.min(y(d.waterBalanceMayJul), y(0))} height={Math.abs(y(d.waterBalanceMayJul) - y(0))} fill={d.type === 'dry' ? SEASON_COLOR.dry : '#9fb8c4'}><title>{`${d.year}: ${d.waterBalanceMayJul} mm`}</title></rect>
          {(d.type === 'dry' || (i % 5 === 0 && ys[i + 1]?.type !== 'dry' && ys[i - 1]?.type !== 'dry')) && <text x={pad + i * bw + bw / 2} y={H - 4} textAnchor="middle" className={`tick${d.type === 'dry' ? ' strong' : ''}`}>{String(d.year).slice(2)}</text>}
        </g>
      ))}
    </svg>
  );
}

export interface Dot { id: string; x: number; y: number; kind: 'variant' | 'baseline' | 'tagged' | 'mine'; label?: string }
export function Scatter({ dots, xLabel, yLabel, selected, onSelect }: { dots: Dot[]; xLabel: string; yLabel: string; selected: string | null; onSelect: (id: string) => void }) {
  const W = 560, H = 250, pl = 46, pb = 34;
  const xs = dots.map(d => d.x), ys = dots.map(d => d.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (v: number) => pl + 12 + (W - pl - 30) * ((v - x0) / (x1 - x0 || 1)), py = (v: number) => 20 + (H - pb - 34) * (1 - (v - y0) / (y1 - y0 || 1));
  const order = { variant: 0, tagged: 1, baseline: 2, mine: 3 };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <line x1={pl} x2={W} y1={H - pb} y2={H - pb} stroke={INK} /><line x1={pl} x2={pl} y1={6} y2={H - pb} stroke={INK} />
      <text x={W - 4} y={H - 6} textAnchor="end" className="axis">{xLabel}</text>
      <text x={pl + 6} y={13} className="axis">{yLabel}</text>
      {[x0, x1].map((v, i) => <text key={'x' + i} x={px(v)} y={H - pb + 16} textAnchor="middle" className="tick">{Math.round(v)}</text>)}
      {[y0, y1].map((v, i) => <text key={'y' + i} x={pl - 5} y={py(v) + 4} textAnchor="end" className="tick">{Math.round(v)}</text>)}
      {[...dots].sort((a, b) => order[a.kind] - order[b.kind]).map(d => {
        const sel = selected === d.id, cx = px(d.x), cy = py(d.y);
        return (
          <g key={d.id} onClick={() => onSelect(d.id)} className="dot" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onSelect(d.id)}>
            {sel && <circle cx={cx} cy={cy} r={12} fill="#f0cf1a" />}
            {d.kind === 'baseline' ? <rect x={cx - 6} y={cy - 6} width={12} height={12} fill={INK} />
              : d.kind === 'mine' ? <path d={`M${cx},${cy - 8}L${cx + 7},${cy + 6}L${cx - 7},${cy + 6}Z`} fill="#a8497a" stroke="#fff" />
                : <circle cx={cx} cy={cy} r={d.kind === 'tagged' ? 6 : 4} fill={d.kind === 'tagged' ? '#2f6b3c' : '#8fb39a'} stroke="#fff" />}
            <title>{d.label ?? d.id}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Half-month NDVI of one field: the chosen year as points over the range of the other observed years. */
export function NdviProfile({ ndvi, year }: { ndvi: Record<string, number>; year: number }) {
  const W = 560, H = 190, pl = 34, pb = 22;
  const slot = (k: string) => (+k.slice(4, 6) - 1) * 2 + (k[6] === 'b' ? 1 : 0);
  const others: number[][] = Array.from({ length: 24 }, () => []);
  const cur: (number | null)[] = Array(24).fill(null);
  for (const [k, v] of Object.entries(ndvi)) { const y = +k.slice(0, 4); if (y === year) cur[slot(k)] = v; else others[slot(k)].push(v); }
  const x = (i: number) => pl + ((i + 0.5) / 24) * (W - pl - 6), y = (v: number) => 8 + (H - pb - 14) * (1 - v);
  const band = others.map((a, i) => (a.length ? { i, lo: Math.min(...a), hi: Math.max(...a) } : null)).filter(Boolean) as { i: number; lo: number; hi: number }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`NDVI of the field through ${year}`}>
      {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="#cfd8cc" /><text x={pl - 5} y={y(v) + 3} textAnchor="end" className="tick">{v.toFixed(2)}</text></g>)}
      {'JFMAMJJASOND'.split('').map((m, i) => <text key={i} x={x(i * 2 + 0.5)} y={H - 6} textAnchor="middle" className="tick">{m}</text>)}
      {band.length > 1 && <path d={'M' + band.map(b => `${x(b.i)},${y(b.hi)}`).join('L') + 'L' + [...band].reverse().map(b => `${x(b.i)},${y(b.lo)}`).join('L') + 'Z'} fill="#8dbb6a" opacity=".4" />}
      {cur.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={INK}><title>{`${year}, half-month ${i + 1}: NDVI ${v}`}</title></circle>)}
    </svg>
  );
}

/** Interval bars: low, typical and high value per row on one scale. */
export function Intervals({ rows, unit }: { rows: { label: string; color: string; lo: number; mid: number; hi: number; note?: string }[]; unit: string }) {
  const max = Math.max(...rows.map(r => r.hi)) * 1.05;
  return (
    <div style={{ display: 'grid', gap: 6, fontSize: '0.87rem' }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 150px) minmax(60px, 1fr) auto', gap: 10, alignItems: 'center' }} title={r.note}>
          <span><i className="sw" style={{ background: r.color }} />{r.label}</span>
          <span style={{ position: 'relative', height: 12, background: '#eef1ec' }}>
            <i style={{ position: 'absolute', top: 0, bottom: 0, left: `${(r.lo / max) * 100}%`, width: `${((r.hi - r.lo) / max) * 100}%`, background: r.color, border: '1px solid rgba(23,35,28,.45)' }} />
            <i style={{ position: 'absolute', top: -3, bottom: -3, left: `${(r.mid / max) * 100}%`, width: 2, background: INK }} />
          </span>
          <span className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.lo.toFixed(1)} · <b style={{ color: INK }}>{r.mid.toFixed(1)}</b> · {r.hi.toFixed(1)} {unit}</span>
        </div>
      ))}
    </div>
  );
}

'use client';
// Small SVG charts in the design system.
import { SEASON_COLOR } from './colors';

const INK = '#17231c';

export function WaterBalance({ years }: { years: { year: number; waterBalanceMayJul: number; type: string }[] }) {
  const W = 560, H = 150, pad = 32, ys = years.filter(y => y.type !== 'current');
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

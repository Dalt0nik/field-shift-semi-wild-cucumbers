'use client';
// A small static map of the farm for plan cards and the plan editor: fields coloured by the crop of a plan,
// neighbouring declared fields as pale context.
import { farm } from '@/pilot/demo';
import neighbours from '@/data/neighbours.json';

const [w, s, e, n] = farm.bbox as number[];
const k = Math.cos(((s + n) / 2) * Math.PI / 180);
const padX = (e - w) * 0.1, padY = (n - s) * 0.1;
const X = (lon: number) => (lon - (w - padX)) * k * 20000, Y = (lat: number) => (n + padY - lat) * 20000;
const W = X(e + padX), H = Y(s - padY);
const ring = (r: number[][]) => 'M' + r.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L') + 'Z';
const path = (g: any): string => (g.type === 'Polygon' ? g.coordinates.map(ring).join('') : g.coordinates.map((poly: number[][][]) => poly.map(ring).join('')).join(''));
const NB: string = (neighbours as any).features.features.map((f: any) => path(f.geometry)).join('');
const FIELDS: { id: string; d: string; cx: number; cy: number }[] = farm.fields.features.map((f: any) => ({ id: f.properties.id, d: path(f.geometry), cx: X(f.properties.lon), cy: Y(f.properties.lat) }));

export default function MiniMap({ fill, selected, onSelect, labels = false }: { fill: Record<string, string>; selected?: string | null; onSelect?: (id: string) => void; labels?: boolean }) {
  return (
    <svg className="mini" viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} role="img" aria-label="Fields of the farm coloured by the crop of this plan" style={{ background: '#eef1ec' }}>
      <path d={NB} fill="#e2e8df" stroke="#f6f8f4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {FIELDS.map(f => (
        <path key={f.id} d={f.d} fill={fill[f.id] ?? '#c9cfc6'} stroke="#17231c" strokeWidth="1.2" vectorEffect="non-scaling-stroke" onClick={onSelect ? ev => { ev.stopPropagation(); onSelect(f.id); } : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}><title>{f.id}</title></path>
      ))}
      {FIELDS.map(f => selected === f.id && <path key={'h' + f.id} d={f.d} fill="none" stroke="#17231c" strokeWidth="3.5" vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
      {labels && FIELDS.map(f => <text key={f.id} x={f.cx} y={f.cy + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#17231c" stroke="#fff" strokeWidth="2.5" paintOrder="stroke" pointerEvents="none">{f.id}</text>)}
    </svg>
  );
}

'use client';
// Scenes: a NASA layer turned into numbers per field. All layers share one 30 m grid (challenge R10), so any two
// can be compared and read at the same pixel.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cropColor, rampCss, rampFor } from '@/components/colors';
import { cellAt, cellField, fieldStats, grid, layerById, layerImage } from '@/components/grid';
import { useScreen, useStore } from '@/components/store';
import { Check, Select, Sw, Tabs, Term, useQueryState } from '@/components/ui';
import { fields, weather } from '@/pilot/demo';
import { cropLabel } from '@/pilot/regional';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
const w26 = (weather.years as any[]).find(y => y.year === 2026) ?? (weather.years as any[])[weather.years.length - 1];
const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined || Number.isNaN(v) ? '—' : unit === 'NDVI' ? v.toFixed(2) : unit === 'share of years' ? `${Math.round(v * 100)} %` : `${v.toFixed(1)} ${unit}`);
const LAYERS = grid.layers.map(l => ({ value: l.id, label: l.label }));
const Legend = ({ id }: { id: string }) => <div><div className="ramp" style={{ background: rampCss(id) }} /><div className="ramp-t">{rampFor(id).ticks.map(t => <span key={t}>{t}</span>)}</div></div>;

export default function ScenesPage() {
  const s = useStore();
  const [tab, setTab] = useQueryState<'scene' | 'compare'>('tab', 'scene');
  const [layer, setLayer] = useState('ndvi_peak_2026');
  const [a, setA] = useState('ndvi_peak_2025');
  const [b, setB] = useState('ndvi_peak_2026');
  const [clip, setClip] = useState(true);
  const [pt, setPt] = useState<[number, number] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => { setImgs({ scene: layerImage(layer, clip), a: layerImage(a, clip), b: layerImage(b, clip) }); }, [layer, a, b, clip]);
  const L = layerById(layer);
  const stats = useMemo(() => fieldStats(layer), [layer]);
  const spreadCut = L.unit === 'NDVI' ? 0.25 : L.unit === '%' ? 6 : L.unit === 'm' ? 5 : 0.5;
  const idx = pt ? cellAt(pt[0], pt[1]) : -1;
  const fld = fields.find(f => f.id === (idx >= 0 ? cellField()[idx] : null));
  useScreen(`scenes/${tab}`, tab === 'scene'
    ? { layer: L.label, source: L.source, period: L.period, selectedField: s.field, perField: stats.map(x => ({ field: x.id, median: +x.median.toFixed(2), low: +x.p10.toFixed(2), high: +x.p90.toFixed(2) })) }
    : { sceneA: layerById(a).label, sceneB: layerById(b).label, inspectedPixel: idx >= 0 ? { field: fld?.id ?? 'outside the farm', values: Object.fromEntries(grid.layers.map(l => [l.label, l.values[idx]])), coarseCell: { rainMayJul2026mm: w26.rainMayJul, waterBalanceMayJul2026mm: w26.waterBalanceMayJul, lateFrostDays2026: w26.frostDays } } : 'none yet' });
  const tabs = <Tabs label="Scene views" tabs={[{ id: 'scene', label: 'One layer' }, { id: 'compare', label: 'Compare two' }]} value={tab} onChange={setTab} />;

  if (tab === 'compare') return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', height: '100%', minHeight: 520 }}>
      <div className="row" style={{ padding: '12px 16px', background: 'var(--sheet)', borderBottom: '1.5px solid var(--ink)' }}>
        <h1 style={{ fontSize: '1.45rem' }}>Satellite</h1>{tabs}
        <span className="muted small">Click a pixel to read every layer at that point.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', minHeight: 0 }}>
        {([['a', a, setA], ['b', b, setB]] as const).map(([k, id, set]) => (
          <div key={k} className="mapbox" style={{ borderLeft: k === 'b' ? '1.5px solid var(--ink)' : undefined, minHeight: 300 }}>
            <FarmMap syncGroup="compare" raster={imgs[k] ? { url: imgs[k], bounds: grid.bounds } : null} selected={s.field} onSelect={s.setField} onPoint={(x, y) => setPt([x, y])} marker={pt} />
            <div className="mapcard" style={{ width: 'min(270px, calc(100% - 24px))' }}>
              <Select block label={`Layer ${k.toUpperCase()}`} value={id} onChange={set} options={LAYERS} />
              <Legend id={id} />
            </div>
            {k === 'b' && pt && (
              <div className="mapcard bl" style={{ width: 'min(340px, calc(100% - 24px))' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><h3>Pixel{fld ? ` on ${fld.id}` : ''}</h3><button className="link small" onClick={() => setPt(null)}>close</button></div>
                {idx < 0 ? <p className="muted">Outside the grid.</p> : (
                  <table><tbody>
                    {grid.layers.map(l => <tr key={l.id}><td>{l.id === a || l.id === b ? <b>{l.label}</b> : l.label}</td><td className="n">{fmt(l.values[idx], l.unit)}</td></tr>)}
                    <tr><td>Rain May–Jul 2026 <small>(<Term id="cellValue">10 km cell</Term>)</small></td><td className="n">{w26.rainMayJul} mm</td></tr>
                    <tr><td><Term id="waterBalance">Water balance</Term> <small>(cell)</small></td><td className="n">{w26.waterBalanceMayJul} mm</td></tr>
                  </tbody></table>)}
              </div>)}
          </div>))}
      </div>
    </div>
  );

  return (
    <div className="split" style={{ ['--side' as string]: '300px' }}>
      <aside className="dock">
        <div className="page-head"><h1>Satellite</h1>{tabs}</div>
        <p className="lead">What NASA satellites see on the farm: one layer on the map, and the same layer as a number per field.</p>
        <div><Link className="btn pri" href="/analytics">Next: bare soil and weather risk →</Link></div>
        <div><span className="lbl">Layer</span><Select block label="Layer" value={layer} onChange={setLayer} options={LAYERS} /></div>
        <Legend id={layer} />
        <p className="small muted">{L.source}{L.period ? ` · ${L.period}` : ''}</p>
        <label className="chk"><input type="checkbox" checked={clip} onChange={e => setClip(e.target.checked)} />Only inside my fields</label>
      </aside>
      <div style={{ display: 'grid', gridTemplateRows: 'minmax(260px, 1fr) auto', minHeight: 0, minWidth: 0 }}>
        <div className="mapbox"><FarmMap raster={imgs.scene ? { url: imgs.scene, bounds: grid.bounds } : null} selected={s.field} onSelect={s.setField} /></div>
        <div style={{ background: 'var(--sheet)', borderTop: '1.5px solid var(--ink)', padding: '10px 16px 64px', maxHeight: '40vh', overflow: 'auto' }}>
          <table>
            <thead><tr><th>Field</th><th>Crop 2026</th><th className="n">Typical value</th><th className="n">Range inside the field</th><th /></tr></thead>
            <tbody>{stats.map(st => { const f = fields.find(x => x.id === st.id)!; return (
              <tr key={st.id} className={`click${s.field === st.id ? ' sel' : ''}`} onClick={() => s.setField(st.id)}>
                <td><b>{st.id}</b></td><td className="nw"><Sw c={cropColor(f.history[2026]?.crop)} />{cropLabel(f.history[2026]?.crop)}</td>
                <td className="n"><b>{fmt(st.median, L.unit)}</b></td><td className="n">{fmt(st.p10, L.unit)} – {fmt(st.p90, L.unit)}</td>
                <td className="warn small">{st.p90 - st.p10 > spreadCut ? 'uneven inside the field' : ''}</td>
              </tr>); })}</tbody>
          </table>
          <div style={{ marginTop: 8 }}><Check>an uneven field (wet spot, sandy patch, lodging) is worth a walk; 30 m pixels do not show the cause.</Check></div>
        </div>
      </div>
    </div>
  );
}

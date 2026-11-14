'use client';
// Map: where a farm starts. All declared fields around the farm, and how a user would assemble their own holding.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cropColor } from '@/components/colors';
import type { Neighbour } from '@/components/FarmMap';
import { useScreen, useStore } from '@/components/store';
import { Sw } from '@/components/ui';
import neighbours from '@/data/neighbours.json';
import { DECISION_YEAR, farm } from '@/pilot/demo';
import { cropLabel } from '@/pilot/regional';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });
/** Show or hide a map layer: an open eye when shown, a crossed eye when hidden. */
const Eye = ({ on, set, what }: { on: boolean; set: (v: boolean) => void; what: string }) => (
  <button type="button" className="eye" aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${what} on the map`} title={on ? 'Hide on the map' : 'Show on the map'} onClick={() => set(!on)}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{!on && <path d="M4 4l16 16" />}
    </svg>
  </button>
);

export default function MapPage() {
  const s = useStore();
  const fields = s.fields;
  const year = '2025'; // one year for the whole map: the year of the open declarations in src/data/neighbours.json
  const [declared, setDeclared] = useState(true);
  const [ruleLayers, setRuleLayers] = useState(false);
  const [nb, setNb] = useState<Neighbour | null>(null);
  const [card, setCard] = useState(false);
  const [asked, setAsked] = useState(false);

  const cropOf = (f: (typeof fields)[number]) => f.history[+year]?.crop ?? f.history[+year]?.cropClass ?? null;
  const fill = useMemo(() => Object.fromEntries(fields.map(f => [f.id, cropColor(cropOf(f))])), [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const farmLegend = useMemo(() => [...new Set(fields.map(cropOf).filter(Boolean) as string[])], [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherLegend = useMemo(() => [...new Set((neighbours as any).features.features.map((x: any) => x.properties.cropClass).filter(Boolean) as string[])].filter(c => !farmLegend.includes(c)), [farmLegend]);
  const f = fields.find(x => x.id === s.field)!;
  useScreen('map', { cropYearShown: year, layersOn: { declaredFields: declared, ruleLayers }, cardOpenFor: card ? (nb ? `neighbouring declared field ${nb.nmaId}` : `farm field ${f.id}`) : null });

  return (
    <div className="split" style={{ ['--side' as string]: '350px' }}>
      <aside className="dock">
        <h1>Your farm</h1>
        <p className="lead">{fields.length} fields, {farm.totalHa.toFixed(0)} ha, outlined in black and coloured by the crop of the {year} harvest. Click a field to see what grew on it.</p>
        {/* each map layer is a section: its switch and its legend, the legend always shown so nothing jumps */}
        <section className="dock-sec">
          <div className="sec-h"><h2>Neighbours’ crops, harvest {year}</h2><Eye on={declared} set={setDeclared} what="the crops of the neighbouring fields" /></div>
          <div className="legend" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
            {[...farmLegend, ...otherLegend].map(id => <span key={id}><Sw c={cropColor(id)} />{cropLabel(id).replace(' (class)', '')}</span>)}
          </div>
          <small className="src-line">Source: crop declarations {year}, National Paying Agency (NMA)</small>
        </section>
        <section className="dock-sec">
          <div className="sec-h"><h2>Risk zones</h2><Eye on={ruleLayers} set={setRuleLayers} what="the risk zones" /></div>
          <div className="legend" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}><span><Sw c="rgba(181,69,44,0.8)" />Erosion-sensitive land</span><span><Sw c="rgba(59,42,74,0.55)" />Peat soil</span></div>
          <small className="src-line">Source: maps of the National Paying Agency (NMA)</small>
        </section>
      </aside>
      <div className="mapbox">
        <span className="map-note">In this demo, adding fields to the farm is switched off.</span>
        <FarmMap fill={fill} selected={nb ? null : s.field} onSelect={id => { s.setField(id); setCard(true); setAsked(false); }} neighbours={declared ? 'class' : 'outline'}
          selectedNeighbour={nb?.nmaId ?? null} onSelectNeighbour={p => { setNb(p); setAsked(false); if (p) setCard(true); }} showErosion={ruleLayers} showPeat={ruleLayers} />
        {card && (nb ? (
          <div className="mapcard">
            <h3>Declared field {nb.nmaId}</h3>
            <dl className="kv">
              <dt>Crop 2025</dt><dd><Sw c={cropColor(nb.cropClass)} />{nb.cropClass ? cropLabel(nb.cropClass).replace(' (class)', '') : nb.classEn ?? 'not a crop'}</dd>
              <dt>Area</dt><dd>{nb.areaHa.toFixed(1)} ha</dd>
            </dl>
            {asked ? <p className="demo">Switched off in the demo. In the product the field joins your farm and its satellite history is computed, about a minute per field.</p>
              : <div className="row"><button className="btn pri" onClick={() => setAsked(true)}>Add to my farm</button><button className="btn" onClick={() => { setNb(null); setCard(false); }}>Close</button></div>}
          </div>
        ) : (
          <div className="mapcard">
            <h3>{f.id} <small>{f.areaHa.toFixed(1)} ha · in the farm</small></h3>
            <dl className="kv">
              {[DECISION_YEAR, DECISION_YEAR - 1, DECISION_YEAR - 2].map(y => <span key={y} style={{ display: 'contents' }}><dt>{y}</dt><dd><Sw c={cropColor(f.history[y]?.crop ?? f.history[y]?.cropClass)} />{cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')}</dd></span>)}
            </dl>
            <div className="row"><Link className="btn pri" href="/organization">Confirm this field</Link><button className="btn" onClick={() => setCard(false)}>Close</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

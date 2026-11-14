'use client';
// Map: where a farm starts. All declared fields around the farm, and how a user would assemble their own holding.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cropColor } from '@/components/colors';
import type { Neighbour } from '@/components/FarmMap';
import { useScreen, useStore } from '@/components/store';
import { More, Sw } from '@/components/ui';
import neighbours from '@/data/neighbours.json';
import { farm, fields } from '@/pilot/demo';
import { cropLabel } from '@/pilot/regional';

const FarmMap = dynamic(() => import('@/components/FarmMap'), { ssr: false });

export default function MapPage() {
  const s = useStore();
  const year = '2025'; // one year for the whole map: the last full set of open declarations
  const [declared, setDeclared] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [ruleLayers, setRuleLayers] = useState(false);
  const [nb, setNb] = useState<Neighbour | null>(null);
  const [card, setCard] = useState(false);
  const [asked, setAsked] = useState(false);

  const cropOf = (f: (typeof fields)[number]) => f.history[+year]?.crop ?? f.history[+year]?.cropClass ?? null;
  const fill = useMemo(() => Object.fromEntries(fields.map(f => [f.id, cropColor(cropOf(f))])), [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const farmLegend = useMemo(() => [...new Set(fields.map(cropOf).filter(Boolean) as string[])], [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherLegend = useMemo(() => [...new Set((neighbours as any).features.features.map((x: any) => x.properties.cropClass).filter(Boolean) as string[])].filter(c => !farmLegend.includes(c)), [farmLegend]);
  const f = fields.find(x => x.id === s.field)!;
  useScreen('map', { cropYearShown: year, layersOn: { declaredFields: declared, satelliteImage: satellite, ruleLayers }, cardOpenFor: card ? (nb ? `neighbouring declared field ${nb.nmaId}` : `farm field ${f.id}`) : null });

  return (
    <div className="split" style={{ ['--side' as string]: '310px' }}>
      <aside className="dock">
        <h1>Your farm</h1>
        <p className="lead">{fields.length} fields, {farm.totalHa.toFixed(0)} ha, outlined in black and coloured by the crop of 2025. Click a field to see what grew on it.</p>
        <div style={{ display: 'grid', gap: 7 }}>
          <label className="chk"><input type="checkbox" checked={declared} onChange={e => setDeclared(e.target.checked)} />Neighbouring declared fields, 2025</label>
          <label className="chk"><input type="checkbox" checked={satellite} onChange={e => setSatellite(e.target.checked)} />Satellite image, autumn 2026</label>
          <label className="chk"><input type="checkbox" checked={ruleLayers} onChange={e => setRuleLayers(e.target.checked)} />Rule layers</label>
        </div>
        <More label="Crop colours">
          <div className="legend" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
            {[...farmLegend, ...(declared ? otherLegend : [])].map(id => <span key={id}><Sw c={cropColor(id)} />{cropLabel(id).replace(' (class)', '')}</span>)}
            {ruleLayers && <><span><Sw c="#b5452c" />Erosion-sensitive</span><span><Sw c="#3b2a4a" />Peat soil</span></>}
          </div>
        </More>
        <More label="How do I add my own farm?">
          <ol className="plain" style={{ paddingLeft: '1.3em' }}>
            <li>Find your fields: all declared fields of Lithuania are here (paying agency, 1.16 million in 2025).</li>
            <li>Click a field and add it to your farm. Open data carry no owner, so you assemble your own holding; a boundary can also be drawn or corrected by hand.</li>
            <li>Confirm what grows now on the <Link className="link" href="/organization">Fields</Link> screen: declarations lag a year.</li>
          </ol>
          <p className="demo">In this demo the farm is preloaded: {fields.length} real neighbouring fields, {farm.totalHa.toFixed(0)} ha. Adding and drawing are switched off because satellite products are computed only for these fields.</p>
        </More>
        <div><Link className="btn pri" href="/organization">Next: confirm what is sown →</Link></div>
      </aside>
      <div className="mapbox">
        <FarmMap fill={fill} selected={nb ? null : s.field} onSelect={id => { s.setField(id); setCard(true); setAsked(false); }} satellite={satellite} neighbours={declared ? 'class' : 'outline'}
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
              {[2026, 2025, 2024].map(y => <span key={y} style={{ display: 'contents' }}><dt>{y}</dt><dd><Sw c={cropColor(f.history[y]?.crop ?? f.history[y]?.cropClass)} />{cropLabel(f.history[y]?.crop ?? f.history[y]?.cropClass).replace(' (class)', '')}</dd></span>)}
            </dl>
            <div className="row"><Link className="btn pri" href="/organization">What grows now</Link><button className="btn" onClick={() => setCard(false)}>Close</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
// The map of every screen. Basemap: OpenFreeMap "positron" (OpenStreetMap data, no key); if it cannot be loaded
// the map falls back to a plain background and still works. On top: rasters drawn by the app from the 30 m grid,
// and vector layers from the pipeline.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { farm, products } from '@/pilot/demo';
import layers from '@/data/farm-layers.json';
import neighbours from '@/data/neighbours.json';
import { CROP_COLOR } from './colors';

export interface Raster { url: string; bounds: number[] }
export interface Neighbour { nmaId: string; cropClass: string | null; classEn: string | null; areaHa: number }
export interface FarmMapProps {
  fill?: Record<string, string>;
  fillOpacity?: number;
  selected?: string | null;
  onSelect?: (id: string) => void;
  raster?: Raster | null;
  showErosion?: boolean;
  showPeat?: boolean;
  neighbours?: 'off' | 'outline' | 'class';
  selectedNeighbour?: string | null;
  onSelectNeighbour?: (p: Neighbour | null) => void;
  onPoint?: (lng: number, lat: number) => void;
  marker?: [number, number] | null;
  /** maps that share one group id move together */
  syncGroup?: string;
}

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
const BLANK = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9eee6' } }] };
let stylePromise: Promise<any> | null = null;
const basemap = () => (stylePromise ??= fetch(BASEMAP, { signal: AbortSignal.timeout(6000) }).then(r => (r.ok ? r.json() : BLANK)).catch(() => BLANK));

const groups = new Map<string, Set<maplibregl.Map>>();
let syncing = false;
const corners = (b: number[]): [[number, number], [number, number], [number, number], [number, number]] => [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]];
const classExpr = (): any => { const e: any[] = ['match', ['coalesce', ['get', 'cropClass'], '']]; for (const [k, c] of Object.entries(CROP_COLOR)) e.push(k, c); e.push('#d5dbd2'); return e; };

export default function FarmMap(props: FarmMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const mark = useRef<maplibregl.Marker | null>(null);
  const latest = useRef(props); latest.current = props;

  const apply = () => {
    const m = map.current; if (!m || !ready.current) return;
    const p = latest.current;
    const vis = (id: string, on: boolean) => m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    if (p.raster) {
      const src = m.getSource('raster') as maplibregl.ImageSource | undefined;
      if (src) src.updateImage({ url: p.raster.url, coordinates: corners(p.raster.bounds) });
      else {
        m.addSource('raster', { type: 'image', url: p.raster.url, coordinates: corners(p.raster.bounds) });
        m.addLayer({ id: 'raster', type: 'raster', source: 'raster', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest', 'raster-opacity': 0.92 } }, 'nb-fill');
      }
    }
    if (m.getLayer('raster')) vis('raster', !!p.raster);
    const nb = p.neighbours ?? 'outline';
    vis('nb-fill', nb !== 'off'); vis('nb-line', nb !== 'off');
    m.setPaintProperty('nb-fill', 'fill-color', nb === 'class' ? classExpr() : '#ffffff');
    m.setPaintProperty('nb-fill', 'fill-opacity', nb === 'class' ? 0.6 : 0);
    m.setPaintProperty('nb-line', 'line-color', ['case', ['==', ['get', 'nmaId'], p.selectedNeighbour ?? ''], '#17231c', nb === 'class' ? '#ffffff' : '#9aa79e'] as any);
    m.setPaintProperty('nb-line', 'line-width', ['case', ['==', ['get', 'nmaId'], p.selectedNeighbour ?? ''], 3, nb === 'class' ? 1 : 0.7] as any);
    vis('erosion', !!p.showErosion); vis('peat', !!p.showPeat);
    const expr: any[] = ['match', ['get', 'id']];
    for (const [id, c] of Object.entries(p.fill ?? {})) expr.push(id, c);
    expr.push('rgba(0,0,0,0)');
    m.setPaintProperty('fields-fill', 'fill-color', (Object.keys(p.fill ?? {}).length ? expr : 'rgba(0,0,0,0)') as any);
    m.setPaintProperty('fields-fill', 'fill-opacity', p.fillOpacity ?? 0.82);
    m.setFilter('fields-halo', ['==', ['get', 'id'], p.selected ?? '']); m.setFilter('fields-sel', ['==', ['get', 'id'], p.selected ?? '']);
    if (p.marker) { mark.current ??= new maplibregl.Marker({ color: '#17231c', scale: 0.7 }); mark.current.setLngLat(p.marker).addTo(m); } else mark.current?.remove();
  };

  useEffect(() => {
    let dead = false;
    let m: maplibregl.Map | null = null;
    const g = latest.current.syncGroup;
    basemap().then(style => {
      if (dead || !el.current) return;
      const ob = products.overlayBounds as number[];
      m = new maplibregl.Map({
        container: el.current, attributionControl: false, style: structuredClone(style), dragRotate: false, minZoom: 9,
        bounds: farm.bbox as [number, number, number, number], fitBoundsOptions: { padding: 36 }, maxBounds: [[ob[0] - 0.4, ob[1] - 0.25], [ob[2] + 0.4, ob[3] + 0.25]],
      });
      map.current = m;
      const mm = m;
      mm.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      if (g) {
        (groups.get(g) ?? groups.set(g, new Set()).get(g)!).add(mm);
        mm.on('move', () => { if (syncing) return; syncing = true; for (const o of groups.get(g) ?? []) if (o !== mm) o.jumpTo({ center: mm.getCenter(), zoom: mm.getZoom() }); syncing = false; });
      }
      mm.on('load', () => {
        // data layers go under the place names of the basemap, outlines on top
        const firstLabel = mm.getStyle().layers.find(l => l.type === 'symbol')?.id;
        mm.addSource('nb', { type: 'geojson', data: (neighbours as any).features });
        mm.addLayer({ id: 'nb-fill', type: 'fill', source: 'nb', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0 } }, firstLabel);
        mm.addLayer({ id: 'nb-line', type: 'line', source: 'nb', paint: { 'line-color': '#9aa79e', 'line-width': 0.7 } }, firstLabel);
        mm.addSource('fields', { type: 'geojson', data: farm.fields });
        mm.addSource('erosion', { type: 'geojson', data: (layers as any).erosion });
        mm.addSource('peat', { type: 'geojson', data: (layers as any).peat });
        mm.addLayer({ id: 'fields-fill', type: 'fill', source: 'fields', paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.82 } }, firstLabel);
        mm.addLayer({ id: 'peat', type: 'fill', source: 'peat', paint: { 'fill-color': '#3b2a4a', 'fill-opacity': 0.55 } }, firstLabel);
        mm.addLayer({ id: 'erosion', type: 'fill', source: 'erosion', paint: { 'fill-color': '#b5452c', 'fill-opacity': 0.8 } }, firstLabel);
        mm.addLayer({ id: 'fields-line', type: 'line', source: 'fields', paint: { 'line-color': '#17231c', 'line-width': 1.6 } });
        // the selected field: a heavy ink outline on a white halo (yellow would read as rapeseed)
        mm.addLayer({ id: 'fields-halo', type: 'line', source: 'fields', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 9 } });
        mm.addLayer({ id: 'fields-sel', type: 'line', source: 'fields', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#17231c', 'line-width': 4.5 } });
        for (const f of farm.fields.features) {
          const d = document.createElement('button');
          d.className = 'map-label'; d.textContent = f.properties.id; d.onclick = e => { e.stopPropagation(); latest.current.onSelectNeighbour?.(null); latest.current.onSelect?.(f.properties.id); };
          new maplibregl.Marker({ element: d }).setLngLat([f.properties.lon, f.properties.lat]).addTo(mm);
        }
        mm.on('click', (ev: maplibregl.MapMouseEvent) => {
          const p = latest.current;
          p.onPoint?.(ev.lngLat.lng, ev.lngLat.lat);
          const own = mm.queryRenderedFeatures(ev.point, { layers: ['fields-fill'] })[0];
          if (own) { p.onSelectNeighbour?.(null); p.onSelect?.(own.properties.id); return; }
          if ((p.neighbours ?? 'outline') === 'off' || !p.onSelectNeighbour) return;
          const nbf = mm.queryRenderedFeatures(ev.point, { layers: ['nb-fill'] })[0];
          p.onSelectNeighbour(nbf ? (nbf.properties as Neighbour) : null);
        });
        mm.on('mousemove', (ev: maplibregl.MapMouseEvent) => {
          const p = latest.current;
          const hit = mm.queryRenderedFeatures(ev.point, { layers: p.onSelectNeighbour && (p.neighbours ?? 'outline') !== 'off' ? ['fields-fill', 'nb-fill'] : ['fields-fill'] }).length > 0;
          mm.getCanvas().style.cursor = p.onPoint ? 'crosshair' : hit ? 'pointer' : '';
        });
        ready.current = true; apply();
      });
    });
    return () => { dead = true; if (m) { if (g) groups.get(g)?.delete(m); m.remove(); } mark.current = null; map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(apply);
  return (
    <>
      <div ref={el} className="map" aria-label="Map of the farm" />
      <div className="mapattr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · fields: NMA (CC-BY-4.0) · imagery: NASA HLS</div>
    </>
  );
}

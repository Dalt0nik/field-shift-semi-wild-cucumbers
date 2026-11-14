// Crop colours: one hue family per crop family, so a timeline reads at a glance.
export const CROP_COLOR: Record<string, string> = {
  winter_wheat: '#c79a1e', spring_wheat: '#dcbf63', winter_barley: '#a8802f', spring_barley: '#c9a86a', triticale: '#b39256', winter_rye: '#9c8a5e', oats: '#d8c9a0',
  winter_cereals: '#c79a1e', spring_cereals: '#dcbf63',
  winter_rapeseed: '#f0cf1a', spring_rapeseed: '#f3e06d', rapeseed: '#f0cf1a',
  peas: '#5fae8e', faba_bean: '#1f5f4a', grain_legumes: '#5fae8e',
  maize_grain: '#d9772b', maize: '#d9772b', sugar_beet: '#a8497a', buckwheat: '#c58f8f',
  perennial_grasses: '#8dbb6a', permanent_grassland: '#8dbb6a', grassland_up_to_5y: '#8dbb6a', fallow: '#b9b2a3',
  catch: '#b7e0d0',
};
export const cropColor = (id: string | null | undefined) => (id && CROP_COLOR[id]) || '#c9cfc6';
export const SEASON_COLOR: Record<string, string> = { dry: '#d08a2e', wetHarvest: '#2b6f8e', normal: '#7d8b80', current: '#7d8b80' };

type Stop = [number, [number, number, number]];
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops: [number, string][]): (v: number) => [number, number, number] {
  const s: Stop[] = stops.map(([t, c]) => [t, hex(c)]);
  return v => {
    if (v <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) if (v <= s[i][0]) { const k = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]); return [0, 1, 2].map(j => Math.round(s[i - 1][1][j] + (s[i][1][j] - s[i - 1][1][j]) * k)) as [number, number, number]; }
    return s[s.length - 1][1];
  };
}
/** Colour ramps of the scene layers: value range, stops and the labels of the legend. */
export const RAMPS: Record<string, { min: number; max: number; stops: [number, string][]; rgb: (v: number) => [number, number, number]; ticks: string[] }> = {};
const def = (id: string, min: number, max: number, stops: [number, string][], ticks: string[]) => { RAMPS[id] = { min, max, stops, rgb: ramp(stops), ticks }; };
def('ndvi', 0.1, 0.9, [[0.1, '#a6611a'], [0.3, '#dfc27d'], [0.5, '#f1e9a6'], [0.7, '#80cd6a'], [0.9, '#1a7d3a']], ['0.1 bare', '0.5', '0.9 dense green']);
def('spring_bare', 0, 1, [[0, '#1a7d3a'], [0.35, '#a6d96a'], [0.6, '#ffffbf'], [0.8, '#fdae61'], [1, '#a6611a']], ['never', 'half the years', 'always']);
def('slope', 0, 15, [[0, '#f7fbff'], [4, '#c6dbef'], [8, '#6baed6'], [12, '#fdae6b'], [15, '#e6550d']], ['0 %', '8 %', '15 %+']);
def('rel_height', -8, 8, [[-8, '#2b6f8e'], [-3, '#8fbfd4'], [0, '#f3f6f1'], [3, '#dfc27d'], [8, '#8a5a2b']], ['−8 m (low spot)', '0', '+8 m']);
export const rampFor = (layerId: string) => RAMPS[layerId.startsWith('ndvi') ? 'ndvi' : layerId];
export const rampCss = (layerId: string) => { const r = rampFor(layerId); return `linear-gradient(90deg, ${r.stops.map(([t, c]) => `${c} ${((t - r.min) / (r.max - r.min)) * 100}%`).join(', ')})`; };

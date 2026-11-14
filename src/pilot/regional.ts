// Regional package for Lithuania (framework module "Regional package").
// Base: src/data/regional-lt.json, generated from the reviewed crop reference pipeline/inputs/crops.yaml (LAMMC guides).
// Windows that the reference leaves empty are filled here and marked: 'observed' = read from NASA HLS cover curves of
// declared fields 2025-2026, 'estimate' = team estimate, not from a source.
import raw from '../data/regional-lt.json';
import type { Crop, CropId, Status } from '../engine/types';

type Win = { from: string; to: string; latest?: string; status: Status };
const SOWING_FILL: Record<CropId, Win> = {
  spring_wheat: { from: '04-05', to: '04-25', status: 'estimate' },
  oats: { from: '04-05', to: '04-25', status: 'estimate' },
  peas: { from: '04-01', to: '04-20', status: 'estimate' },
  faba_bean: { from: '04-01', to: '04-20', status: 'estimate' },
  winter_barley: { from: '09-05', to: '09-20', status: 'estimate' },
  triticale: { from: '09-05', to: '09-25', status: 'estimate' },
};
const HARVEST_FILL: Record<CropId, Win> = {
  spring_barley: { from: '08-01', to: '08-20', status: 'observed' },
  spring_wheat: { from: '08-05', to: '08-25', status: 'observed' },
  oats: { from: '08-16', to: '09-10', status: 'observed' },
  winter_barley: { from: '07-10', to: '07-31', status: 'observed' },
  triticale: { from: '07-25', to: '08-20', status: 'observed' },
  winter_rye: { from: '07-25', to: '08-20', status: 'observed' },
};
const FAMILY: Record<string, Crop['family']> = { cereals: 'cereal', brassicas: 'oilseed', legumes: 'legume', row_crops: 'row', perennial_grasses: 'grass' };
const HARVEST_TIMING: Record<CropId, Crop['harvestTiming']> = { winter_rapeseed: 'early', winter_barley: 'early', faba_bean: 'late', maize_grain: 'late', maize_silage: 'late', sugar_beet: 'late', buckwheat: 'late', potato: 'late', perennial_grasses: 'grass', clover: 'grass' };
const SOWING_TIMING: Record<CropId, Crop['sowingTiming']> = { winter_rapeseed: 'august', maize_grain: 'spring_late', maize_silage: 'spring_late', sugar_beet: 'spring_late', buckwheat: 'spring_late', potato: 'spring_late', perennial_grasses: 'grass', clover: 'grass' };

const src = raw as unknown as { crops: Record<string, any>; groups: Record<string, string[]>; meta: any };
export const GROUPS: Record<string, string[]> = src.groups;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function build(c: any): Crop {
  const sFill = SOWING_FILL[c.id], hFill = HARVEST_FILL[c.id];
  const family = (c.groups as string[]).map(g => FAMILY[g]).find(Boolean) ?? 'other';
  const sowing = c.sowing.from ? { from: c.sowing.from, to: c.sowing.to, latest: c.sowing.latest, status: 'primary' as Status }
    : sFill ? { from: sFill.from, to: sFill.to, latest: null, status: sFill.status } : { from: null, to: null, latest: null, status: 'unknown' as Status };
  const harvest = c.harvest.from && c.harvest.to ? { from: c.harvest.from, to: c.harvest.to, status: c.harvest.status as Status }
    : hFill ? { from: hFill.from, to: hFill.to, status: hFill.status } : { from: null, to: null, status: 'unknown' as Status };
  return {
    id: c.id, name: cap(c.name), nameLt: c.nameLt, season: c.season, groups: c.groups, family,
    sowing, harvest, previous: c.previous,
    returnInterval: c.returnInterval && c.returnInterval.min ? { min: c.returnInterval.min, scope: c.returnInterval.scope } : null,
    harvestTiming: HARVEST_TIMING[c.id] ?? 'mid',
    sowingTiming: SOWING_TIMING[c.id] ?? (c.season === 'winter' ? 'september' : 'spring_early'),
    rootCrop: (c.groups as string[]).includes('root_crops') || c.id === 'potato',
    legume: (c.groups as string[]).includes('legumes'),
  };
}
export const CROPS: Record<CropId, Crop> = Object.fromEntries(Object.values(src.crops).map((c: any) => [c.id, build(c)]));
export const crop = (id: CropId): Crop => { const c = CROPS[id]; if (!c) throw new Error('unknown crop ' + id); return c; };

/** Does a crop match a reference used in the rules: a crop id, a group id or 'self'? */
export function matches(cropId: CropId, ref: string): boolean {
  if (cropId === ref) return true;
  const g = GROUPS[ref];
  if (g) return g.includes(cropId);
  const c = CROPS[cropId];
  return !!c && c.groups.includes(ref);
}

/** Crops of the regional package that can be planned: both windows known (possibly as flagged estimates). */
export const PLANNABLE: CropId[] = Object.values(CROPS).filter(c => c.season !== 'perennial' && c.sowing.from && c.harvest.to).map(c => c.id);

/** Classes of the open declarations (history without species) mapped to a representative family and timing. */
export const CLASS_INFO: Record<string, { family: Crop['family']; harvestTiming: Crop['harvestTiming']; members: CropId[]; label: string }> = {
  winter_cereals: { family: 'cereal', harvestTiming: 'mid', members: ['winter_wheat', 'winter_barley', 'triticale', 'winter_rye'], label: 'winter cereals (class)' },
  spring_cereals: { family: 'cereal', harvestTiming: 'mid', members: ['spring_wheat', 'spring_barley'], label: 'spring cereals (class)' },
  rapeseed: { family: 'oilseed', harvestTiming: 'early', members: ['winter_rapeseed', 'spring_rapeseed'], label: 'rapeseed (class)' },
  grain_legumes: { family: 'legume', harvestTiming: 'mid', members: ['peas', 'faba_bean'], label: 'grain legumes (class)' },
  oats: { family: 'cereal', harvestTiming: 'mid', members: ['oats'], label: 'oats' },
  maize: { family: 'row', harvestTiming: 'late', members: ['maize_grain', 'maize_silage'], label: 'maize (class)' },
  perennial_grasses: { family: 'grass', harvestTiming: 'grass', members: ['perennial_grasses'], label: 'perennial grasses' },
  permanent_grassland: { family: 'grass', harvestTiming: 'grass', members: ['perennial_grasses'], label: 'permanent grassland' },
  grassland_up_to_5y: { family: 'grass', harvestTiming: 'grass', members: ['perennial_grasses'], label: 'grassland up to 5 years' },
  fallow: { family: 'other', harvestTiming: 'mid', members: [], label: 'fallow' },
};
export const cropLabel = (id: string | null | undefined): string => (!id ? 'unknown' : CROPS[id]?.name ?? cap(CLASS_INFO[id]?.label ?? id.replace(/_/g, ' ')));

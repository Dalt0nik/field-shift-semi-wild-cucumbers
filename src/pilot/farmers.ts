// The statistical farmer of the pilot region: what farms within 15 km of the pilot sowed after each crop class in the
// NMA declarations 2024 -> 2025 (src/data/farmer-transitions.json, built by pipeline/26_farmer_transitions.ts), read
// as the FarmerModel the engine uses for "Usual practice". Method: docs/usual-practice.md.
import transitionsJson from '../data/farmer-transitions.json';
import { CLASS_INFO, CROPS } from './regional';
import type { FarmerModel } from '../engine/characteristics';
import type { CropId } from '../engine/types';

export const farmerTransitions = transitionsJson as unknown as {
  years: number[]; dataUntil: string; radiusKm: number; kappaHa: number; iou: number; shareYears: number[];
  municipality: { code: string; name: string };
  matched: { fields: number; ha: number; fieldsInRadius: number; haInRadius: number; pilotFieldsExcluded: number };
  p: Record<string, Record<string, number>>; share: Record<string, Record<CropId, number>>;
};

/** Class of the declaration table for a crop of the reference. */
function classOfCrop(id: string): string {
  const c = CROPS[id];
  if (c.season === 'perennial') return 'perennial_grass';
  if (id === 'oats') return 'oats';
  if (id === 'sugar_beet') return 'sugar_beet';
  if (id.startsWith('maize')) return 'maize';
  if (c.family === 'cereal') return c.season === 'winter' ? 'winter_cereals' : 'spring_cereals';
  if (c.family === 'oilseed') return 'rapeseed';
  if (c.family === 'legume') return 'pulses';
  return 'other';
}
/** Class of the declaration table for a history class of the farm file (declarations carry classes, not species). */
const HISTORY_CLASS: Record<string, string> = {
  winter_cereals: 'winter_cereals', spring_cereals: 'spring_cereals', rapeseed: 'rapeseed', grain_legumes: 'pulses', oats: 'oats',
  maize: 'maize', perennial_grasses: 'perennial_grass', permanent_grassland: 'grass_gt5', grassland_up_to_5y: 'grass_lt5', fallow: 'fallow',
};

export const FARMER_MODEL: FarmerModel = {
  classOf: { ...Object.fromEntries(Object.keys(CLASS_INFO).map(id => [id, HISTORY_CLASS[id] ?? 'other'])), ...Object.fromEntries(Object.keys(CROPS).map(id => [id, classOfCrop(id)])) },
  p: farmerTransitions.p,
  share: farmerTransitions.share,
  farms: 2000,
  seed: 20261114,
};

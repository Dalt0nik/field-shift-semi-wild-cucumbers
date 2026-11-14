// Pilot money constants (Lithuania) for the money steps that the engine takes as parameters:
// the crop groups of the field index (NASA HLS) and the wet-harvest loss (NASA GPM IMERG).
import type { WetHarvestParams } from '../engine/characteristics';
import type { CropId } from '../engine/types';

/** Crop group of the field index: beta of the group converts the field's NDVI difference into a share of yield
 *  (src/data/field-index.json). Crops without a group (sugar beet, grass, maize, buckwheat) keep the district yield. */
export const FIELD_GROUP: Record<CropId, string> = {
  winter_wheat: 'winter_cereals', winter_barley: 'winter_cereals', triticale: 'winter_cereals', winter_rye: 'winter_cereals',
  spring_wheat: 'spring_cereals', spring_barley: 'spring_cereals', oats: 'spring_cereals',
  winter_rapeseed: 'rapeseed', spring_rapeseed: 'rapeseed',
  peas: 'legumes', faba_bean: 'legumes',
};

/** Wet harvest: harvest rain (NASA GPM IMERG, 20 Jul - 31 Aug, at the farm) in the top fifth of 2001-2025.
 *  - Drying tariff 7.5 EUR per tonne per percentage point, oilseed rape 8.0: elevator price lists 2025 (Jonavos grūdai
 *    7.49-8.89, RKJ 7.19 / 7.99, Kagro 6-7; 7-9 across Lithuania, LRT). Primary.
 *  - Extra moisture +2.5 percentage points over an ordinary season: first 2025 deliveries at Šakiai 17.7 % against the
 *    14 % base (drg.lt). Estimate.
 *  - A quarter of the wheat sold as feed at 15 % less: 2025 wheat in the north mostly class III-IV (kasvyksta.lt);
 *    feed vs food wheat 10-18 % in buyer price lists (Dariaus Agro, Roquette Amilina). Estimate. */
export const WET_HARVEST: WetHarvestParams = {
  rankFrom: 0.8, extraMoisturePct: 2.5, dryingEurPerTPct: 7.5, dryingOilseedEurPerTPct: 8.0,
  feedCrops: ['winter_wheat', 'spring_wheat'], feedShare: 0.25, feedDiscount: 0.15,
};

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

/** Farm-level costs that the crops' variable costs (seed, fertiliser, plant protection, fuel, drying) leave out, EUR per
 *  ha of utilised agricultural area a year: Lithuanian FADN (ŪADT), specialist cereal and oilseed farms (TF15, "Javų,
 *  rapsų"), 572 farms, 62.67 ha on average, 2024 (ŽŪDC, "Ūkių veiklos rezultatai 2024", tables 12 and 24). Primary.
 *  Energy is left out (it is in the variable costs). Family labour is not paid here: the margin is the farm net income
 *  (FADN "farm net income"), what is left for the family's work, own land and capital. */
export const FARM_COSTS = {
  machineryAndBuildings: 63, // 3 947 EUR / 62.67 ha: upkeep and repair of machinery and buildings
  contractWork: 24, // 1 478
  otherOverheads: 60, // 3 779: insurance, accounting, other
  depreciation: 204, // 12 775
  rent: 59, // 3 670: rent paid per ha of UAA (51 % of UAA rented, 116 EUR per rented ha)
  wages: 49, // 3 098
  interest: 26, // 1 616
  landTax: 6, // 374
  source: 'ŽŪDC, Ūkių veiklos rezultatai 2024 (Lithuanian FADN), type of farming "Javų, rapsų" (TF15), tables 12 and 24',
};
export const FARM_COSTS_EUR_HA = FARM_COSTS.machineryAndBuildings + FARM_COSTS.contractWork + FARM_COSTS.otherOverheads + FARM_COSTS.depreciation
  + FARM_COSTS.rent + FARM_COSTS.wages + FARM_COSTS.interest + FARM_COSTS.landTax; // 491

/** Redistributive income support (perskirstomoji išmoka), EUR/ha by band of declared hectares, 2025 rates of order
 *  3D-596: first 10 ha, second 10, third 10, 31-50 ha; nothing above 50 ha. Primary (context/legal of the team repo). */
export const REDISTRIBUTIVE_2025: { upToHa: number; eurHa: number }[] = [
  { upToHa: 10, eurHa: 75.18 }, { upToHa: 20, eurHa: 81.42 }, { upToHa: 30, eurHa: 95.23 }, { upToHa: 50, eurHa: 108.45 },
];
/** Redistributive payment of a holding of `ha` hectares, spread over all its hectares (EUR/ha). */
export function redistributivePerHa(ha: number): number {
  let eur = 0, from = 0;
  for (const b of REDISTRIBUTIVE_2025) { eur += Math.max(0, Math.min(ha, b.upToHa) - from) * b.eurHa; from = b.upToHa; }
  return ha > 0 ? eur / ha : 0;
}

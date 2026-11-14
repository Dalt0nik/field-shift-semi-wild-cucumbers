// Soil protection, pilot side (Lithuania): the climate behind the soil measures, the humus coefficients and the
// sources of every number. The engine (src/engine/characteristics.ts) only does the arithmetic.
import climateJson from '../data/soil-climate.json';
import type { HumusParams, SoilParams } from '../engine/characteristics';
import type { CropId } from '../engine/types';

export const soilClimate = climateJson as unknown as {
  period: string; dataUntil: string; halfMonths: string[];
  erosivity: { base: string; thresholdMm: number; shares: Record<string, number[]>; byMonth: number[]; erosiveDaysPerYear: number;
    summary: Record<string, { mayToSep: number; junToAug: number; decToFeb: number; summerToWinter: number; blindHalfMonths: number }>;
    storms: { storms: number; stormsPerYear: number; meanAnnualEI30: number; frozenShareOfPrecipitation: number; top15Share: number; junToAugShareByYear: { p10: number; median: number; p90: number } } | null };
  leaching: { days: number; shares: number[]; seasonSurplusMm: number; medianSurplusMm: { halfMonth: string; mm: number }[] };
  harvest: { crops: Record<string, { from: string; to: string; medianBalanceMm: number; wetYearsShare: number; medianRainMm: number; typicallyWet: boolean; windowStatus: string }> };
};

/** Humus balance (S6): coefficients of the VDLUFA method as printed in the advisory worksheet of the Bavarian State
 *  Research Centre for Agriculture: LfL, "Humusbilanz-Methode zur Optimierung von Bodenfruchtbarkeit und Umweltwirkung
 *  in Bayern", Stand 11/2014, worksheet 1 (pages 2-3), which rests on VDLUFA Standpunkt "Humusbilanzierung" (April 2014).
 *  Read in the original on 14 Nov 2026. Unit: humus equivalents, 1 HÄ = 1 kg humus-C, per hectare and year.
 *  Choices, all written down here:
 *  - The worksheet's values for conventional farming are used (the VDLUFA "middle" values). The lower VDLUFA values
 *    were not read in the original, so they are not used.
 *  - Cereals and oilseeds: -400. Grain legumes: +160 (by-products included). Sugar beet: -1300. Grain maize: -800.
 *  - By-product left on the field: dt of by-product per dt of main product (column F) x 7 HÄ per dt of straw
 *    (column H; beet leaves 1.3).
 *  - Perennial grass: +800 per main-use year, counted at 75 % (footnote 1: in full only above 50 t/ha fresh yield,
 *    which the app does not know).
 *  - Catch crop: stubble-sown phacelia group, +100 plus 190 dt/ha of green mass x 0.8 HÄ per dt = 252, counted at
 *    70 % (footnote 3: in full only when the stand reached 80 % ground cover, which the app does not know).
 *  - Buckwheat has no row of its own in the worksheet: it is counted as a cereal and marked. */
export const HUMUS_SOURCE = 'LfL Bayern, Humusbilanz-Methode (Stand 11/2014), worksheet 1, after VDLUFA Standpunkt Humusbilanzierung (2014)';
const CEREAL = -400, STRAW = 7;
export const HUMUS_CROP: Record<CropId, number> = {
  winter_wheat: CEREAL, spring_wheat: CEREAL, winter_barley: CEREAL, spring_barley: CEREAL, triticale: CEREAL, winter_rye: CEREAL, oats: CEREAL,
  winter_rapeseed: -400, spring_rapeseed: -400, peas: 160, faba_bean: 160, lupin: 160,
  maize_grain: -800, maize_silage: -800, sugar_beet: -1300, potato: -1000,
  perennial_grasses: 600, clover: 600, buckwheat: CEREAL,
};
/** Crops without a row of their own in the worksheet. */
export const HUMUS_NO_OWN_ROW: CropId[] = ['buckwheat'];
export const HUMUS_BYPRODUCT: Record<CropId, { ratio: number; perDt: number }> = {
  winter_wheat: { ratio: 0.8, perDt: STRAW }, spring_wheat: { ratio: 0.8, perDt: STRAW }, winter_barley: { ratio: 0.7, perDt: STRAW }, spring_barley: { ratio: 0.8, perDt: STRAW },
  triticale: { ratio: 0.9, perDt: STRAW }, winter_rye: { ratio: 0.9, perDt: STRAW }, oats: { ratio: 1.1, perDt: STRAW },
  winter_rapeseed: { ratio: 1.7, perDt: STRAW }, spring_rapeseed: { ratio: 1.7, perDt: STRAW }, maize_grain: { ratio: 1.0, perDt: STRAW },
  sugar_beet: { ratio: 0.7, perDt: 1.3 },
};
export const HUMUS_CATCH_CROP = Math.round(0.7 * (100 + 190 * 0.8)); // 176
/** Classes of the worksheet for conventional farming (page 7), kg humus-C per hectare and year. */
export const humusClass = (v: number): string => (v < -200 ? 'very low' : v < -75 ? 'low' : v <= 100 ? 'balanced' : v <= 300 ? 'high' : 'very high');

export function humusParams(strawLeft: boolean): HumusParams {
  return { crop: HUMUS_CROP, byProduct: HUMUS_BYPRODUCT, catchCrop: HUMUS_CATCH_CROP, strawLeft };
}

/** The soil climate as the engine takes it. `erosivity` picks a set of shares (default: the base of soil-climate.json). */
export function soilParams(strawLeft = true, erosivity: string = soilClimate.erosivity.base): SoilParams {
  const w = soilClimate.erosivity.shares[erosivity];
  if (!w) throw new Error(`no erosivity shares "${erosivity}" in soil-climate.json`);
  return {
    erosivity: w, leaching: soilClimate.leaching.shares, leachingDays: soilClimate.leaching.days,
    wetHarvest: Object.fromEntries(Object.entries(soilClimate.harvest.crops).map(([id, h]) => [id, h.typicallyWet])),
    humus: humusParams(strawLeft),
  };
}

/** Sources of the soil block. Status: primary = read in the original; abstract = only the abstract or the publisher's
 *  summary was read; calculation = ours. A number from a source appears in the app only when the status is primary. */
export interface SoilSource { id: string; label: string; url: string; status: 'primary' | 'abstract' | 'calculation'; note?: string; /** the short name the panel of the score shows */ short?: string }
export const SOIL_SOURCES: Record<string, SoilSource> = {
  law: { id: 'law', label: 'Directive (EU) 2025/2360 on soil monitoring and resilience: soil health is assessed per aspect of soil degradation; Annex I names erosion and loss of organic carbon, Annex II asks erosion estimates to consider rainfall erosivity, vegetation cover, crop type and cover crops', url: 'https://eur-lex.europa.eu/eli/dir/2025/2360/oj/eng', status: 'primary', short: 'EU Soil Monitoring Law' },
  fao: { id: 'fao', label: 'FAO, Conservation Agriculture principles: permanent soil cover and species diversification (at least three crops)', url: 'https://www.fao.org/conservation-agriculture/overview/conservation-agriculture-principles/en', status: 'primary', short: 'FAO, Conservation Agriculture' },
  hls: { id: 'hls', label: 'NASA Harmonized Landsat and Sentinel-2 (HLS), 30 m: how green each field is', url: 'https://www.earthdata.nasa.gov/data/projects/hls', status: 'primary', short: 'NASA HLS satellite images' },
  imerg: { id: 'imerg', label: 'NASA GPM IMERG, half-hourly rain: when heavy rain falls at the farm', url: 'https://gpm.nasa.gov/data/imerg', status: 'primary', short: 'NASA GPM IMERG rain' },
  jrcci: { id: 'jrcci', label: 'Nardo, Saisana, Saltelli & Tarantola 2005, Tools for Composite Indicators Building, JRC EUR 21682 EN: no agreed method exists to weight indicators; equal weights when there are no grounds for others', url: 'https://knowledge4policy.ec.europa.eu/sites/default/files/eur_21682_en_1.pdf', status: 'primary', short: 'EU guide on combined scores (JRC)' },
  cornell: { id: 'cornell', label: 'Cornell Comprehensive Assessment of Soil Health, manual: 0-100 scores against a reference set, colour bands at 40 and 60, an unweighted average as the overall score', url: 'https://www.css.cornell.edu/extension/soil-health/manual.pdf', status: 'primary', short: 'Cornell soil health test' },
  nrcs: { id: 'nrcs', label: 'USDA NRCS, Principles for high-functioning soils (factsheet)', url: 'https://www.nrcs.usda.gov/sites/default/files/2023-07/NRCS-Principles-for-High-Functioning-Soils-Factsheet.pdf', status: 'abstract', note: 'the four principles are named in the factsheet listing; the file itself did not open on 14 Nov' },
  rusle: { id: 'rusle', label: 'RUSLE cover-management factor: soil-loss ratios in 15-day steps, each weighted by its share of the yearly erosivity (USDA NRCS guide chapter after Renard et al. 1997, Agriculture Handbook 703)', url: 'https://efotg.sc.egov.usda.gov/references/Agency/OK/RUSLE_Chap4_C_Factors.pdf', status: 'primary', short: 'Erosion formula RUSLE (USDA)' },
  jrc: { id: 'jrc', label: 'Matthews, Verstraeten, Borrelli & Panagos 2023, a field-parcel cover factor from Sentinel-2 cover, erosivity and declared parcels, Int. Soil and Water Conservation Research 11:43–59', url: 'https://www.sciencedirect.com/science/article/pii/S2095633922000788', status: 'abstract' },
  esdac: { id: 'esdac', label: 'JRC ESDAC, monthly rainfall erosivity in Europe (after Ballabio et al. 2017)', url: 'https://esdac.jrc.ec.europa.eu/themes/monthly-erosivity', status: 'primary', note: 'the dataset page was read; the maps need a request form and were not downloaded' },
  richardson: { id: 'richardson', label: 'Richardson, Foster & Wright 1983, erosion index from daily rainfall, Trans. ASAE 26:153–156', url: 'https://publishup.uni-potsdam.de/opus4-ubp/files/1558/elsenbeer_etal_1993.pdf', status: 'abstract', note: 'known through later papers that apply it' },
  fenta: { id: 'fenta', label: 'Fenta et al. 2023, IMERG-only erosivity underestimates gauge erosivity, J. Hydrology (doi 10.1016/j.jhydrol.2023.129555)', url: 'https://doi.org/10.1016/j.jhydrol.2023.129555', status: 'abstract' },
  fvc: { id: 'fvc', label: 'Gutman & Ignatov 1998, green vegetation fraction from NDVI, Int. J. Remote Sensing 19:1533–1543', url: 'https://lcluc.umd.edu/documents/gutman-g-and-ignatov-1998-derivation-green-vegetation-fraction-noaaavhrr-use-numerical', status: 'abstract' },
  mcdaniel: { id: 'mcdaniel', label: 'McDaniel, Tiemann & Grandy 2014, crop diversity and soil organic matter, a meta-analysis, Ecological Applications 24:560–570', url: 'https://scholars.unh.edu/faculty_pubs/1665', status: 'abstract', note: 'an erratum of 2022 was not checked, so no number is quoted' },
  arvidsson: { id: 'arvidsson', label: 'Arvidsson et al. 2003, subsoil compaction by heavy sugar-beet harvesters III, risk assessment with a soil-water model, Soil & Tillage Research 73', url: 'https://research.wur.nl/en/publications/subsoil-compaction-caused-by-heavy-sugarbeet-harvesters-in-southe/', status: 'abstract' },
  thapa: { id: 'thapa', label: 'Thapa, Mirsky & Tully 2018, cover crops reduce nitrate leaching, a global meta-analysis, J. Environ. Qual. 47:1400–1411', url: 'https://doi.org/10.2134/jeq2018.03.0107', status: 'primary' },
  lfl: { id: 'lfl', label: 'LfL Bayern 2014, Humusbilanz-Methode, worksheet with the VDLUFA coefficients', url: 'https://www.lfl.bayern.de/mam/cms07/iab/dateien/humusbilanz_beratung_bleistift-version_nov_2014_2.pdf', status: 'primary', short: 'Humus balance method (VDLUFA, LfL Bayern)' },
  rainford: { id: 'rainford', label: 'Rainford et al. 2024, humus balances against measured soil carbon at 14 Swiss long-term sites, European J. Soil Science', url: 'https://irf.fhnw.ch/entities/publication/9b049d0e-f997-45fe-82a3-8aa915b58ada/full?back=true', status: 'abstract' },
  ours: { id: 'ours', label: 'Our tests on Lithuanian data, 13–14 Nov 2026 (cover model from NASA HLS on 1 700 declared fields; residue and slope tests)', url: '', status: 'calculation' },
};

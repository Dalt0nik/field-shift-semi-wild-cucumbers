// Domain types of the Field Shift engine. The logic follows the application framework (seven stages):
// a field is a timeline of slots; variants are built first (stages 1-5) and then evaluated on all data (stage 6).

export type CropId = string;
export type Status = 'primary' | 'estimate' | 'observed' | 'unknown';

export interface CropRule { ref: string; severity: 'hard' | 'soft' | 'info'; reason: string }

export interface Crop {
  id: CropId;
  name: string;
  nameLt: string;
  season: 'winter' | 'spring' | 'perennial' | 'catch';
  groups: string[];
  /** family used for preceding-crop effects and "cereal after cereal" */
  family: 'cereal' | 'oilseed' | 'legume' | 'row' | 'grass' | 'other';
  sowing: { from: string | null; to: string | null; latest: string | null; status: Status };
  harvest: { from: string | null; to: string | null; status: Status };
  previous: { good: CropRule[]; bad: CropRule[] };
  returnInterval: { min: number | null; scope: string } | null;
  /** harvest timing class for the cover model: early / mid / late */
  harvestTiming: 'early' | 'mid' | 'late' | 'grass';
  /** sowing timing class for the cover model */
  sowingTiming: 'august' | 'september' | 'spring_early' | 'spring_late' | 'grass';
  rootCrop: boolean;
  legume: boolean;
}

/** One occupied gap on a field timeline. Dates are ISO days. */
export interface Occupancy {
  crop: CropId;
  sow: string;
  harvest: string;
  harvestYear: number;
  source: 'history' | 'current' | 'plan';
  kind: 'main' | 'catch';
  note?: string;
}

export interface FieldInfo {
  id: string;
  areaHa: number;
  erosionShare: number;
  peatShare: number;
  soilTexture: string | null;
  soilType: string | null;
  /** crops of past harvest years (species if known, else a class id) */
  history: Record<number, { crop: CropId | null; cropClass?: string | null; source: string }>;
}

export interface Slot { fieldId: string; from: string; to: string; after: Occupancy | null }

export interface CandidateCheck { ok: boolean; unknown?: boolean; reasons: string[]; warnings: string[] }

/** A choice for one field over the plan horizon: the main crop of each plan year and an optional catch crop. */
export interface FieldOption {
  fieldId: string;
  /** main crop per plan harvest year, in order */
  crops: CropId[];
  /** catch crop sown after the harvest of plan year i (before the crop of year i+1) */
  catchAfter: boolean[];
  /** catch crop sown before the crop of the first plan year, after the harvest of the crop that stands on the
   *  decision day (possible only while that autumn's catch-crop sowing is still ahead) */
  catchFirst?: boolean;
  /** which years were fixed by what already grows on the field */
  fixed: boolean[];
  warnings: string[];
}

export interface Variant { id: string; label?: string; options: FieldOption[]; origin: string }

export interface RuleResult { id: string; title: string; year: number; ok: boolean; value: string; detail: string; kind: 'prohibition' | 'payment_condition' | 'incentive' }

export interface Range { p25: number; p50: number; p75: number }

export interface Characteristics {
  /** EUR/ha per year, over replayed seasons */
  marginMean: number;
  marginP10: number;
  marginP90: number;
  /** mean of the worst fifth of replayed seasons */
  marginWorstFifth: number;
  marginDry: number | null;
  marginDryN: number;
  marginWetHarvest: number | null;
  marginWetHarvestN: number;
  marginNormal: number | null;
  worstSeasons: { season: string; margin: number; type: string }[];
  marginSeries: { season: string; margin: number; type: string }[];
  /** S1e, the soil headline: days without living cover per hectare and year, each half-month weighted by its share
   *  of the yearly rainfall erosivity (NASA HLS cover x NASA GPM IMERG erosivity) */
  bareErosive: Range;
  /** S1: days without living cover per hectare and year, every half-month weighted equally (NASA HLS cover model) */
  bareDays: Range;
  bareDaysWinter: number;
  /** S2: ha x erosion-weighted days without cover on land inside the official erosion-sensitive layer, per year */
  bareOnSlopes: number;
  /** S5: days without living cover in the leaching season (1 Sep - 28 Feb), weighted by the water surplus */
  bareLeaching: number;
  /** S3: crop families (cereal, oilseed, legume, row, grass) on the farm in each plan year */
  familiesPerYear: number[];
  /** S4: hectares per plan year harvested in a window that is typically wet */
  wetHarvestHa: number;
  /** S6: humus balance, kg humus-C per hectare and year (VDLUFA coefficients; an accounting indicator) */
  humus: number;
  /** the straw assumption behind S6 */
  humusStrawLeft: boolean;
  /** share of area-years with a cereal after a cereal */
  cerealAfterCereal: number;
  legumeShare: number;
  largestCropShare: number;
  cropsPerYear: number[];
  paymentsEurHa: number;
  ecoRotationEligible: boolean[];
  softWarnings: number;
  rules: RuleResult[];
  feasible: boolean;
}

export interface EvaluatedVariant extends Variant { ch: Characteristics; nonDominated?: boolean; tags: string[] }

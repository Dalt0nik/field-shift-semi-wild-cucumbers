// Farm rules of the pilot: EU conditionality (GAEC standards, Regulation (EU) 2021/2115) with the thresholds that
// apply in Lithuania, where the standards are called GAAB (geros agrarinės ir aplinkosaugos būklės standartai).
// A rule = applicability -> check over field timelines -> consequence (prohibition / payment condition / incentive).
// Strict mode is on: payment conditions act as prohibitions.
// Thresholds are checked against the acts: ŽŪM orders 3D-107 (GAAB), 3D-92 (eco-schemes), 3D-596 (payment rates 2025).
import { crop } from './regional';
import type { CropId, RuleResult } from '../engine/types';

export const PAYMENTS_2025 = {
  basic: 79.09, // EUR/ha, basic income support (3D-596)
  ecoRotation: 48.05, // EUR/ha, eco-scheme "Augalų kaita" (crop rotation), up to 300 ha
  ecoCatchCrop: 42.23, // EUR/ha, eco-scheme "Tarpiniai pasėliai" (undersown and stubble catch crops)
  coupledProtein: 40.84, // EUR/ha, coupled support for protein crops
  act: 'ŽŪM order 3D-596, rates for 2025',
};

export interface YearState {
  year: number;
  /** area by main crop, ha */
  area: Map<CropId, number>;
  arableHa: number;
  /** ha where the main crop differs from the previous year's main crop */
  changedHa: number;
  /** ha with a catch crop sown after the previous harvest */
  catchHa: number;
  /** ha where the same crop stands for a 4th year in a row */
  fourthYearHa: number;
  /** ha where the crop repeats the previous year's crop */
  repeatedHa: number;
  /** ha covered in the winter before this harvest (15 Nov - 1 Mar): winter crops, grass, catch crops */
  winterGreenHa: number;
  /** ha of spring-sown crops that rely on unploughed stubble to count as covered */
  winterStubbleHa: number;
  /** ha after beet or potatoes, exempt from the winter-cover requirement */
  winterExemptHa: number;
  /** ha by crop where a perennial crop stays on the field from the year before (counted in area and repeatedHa) */
  stay?: Map<CropId, number>;
}

const pct = (v: number) => `${(v * 100).toFixed(0)} %`;

/** GAEC 7 (3D-107, p. 10): crop rotation. One of three routes is enough. Applies to farms with > 10 ha of arable land. */
export function gaec7(s: YearState): RuleResult {
  const shares = [...s.area.values()].map(a => a / s.arableHa).sort((a, b) => b - a);
  const change = s.changedHa / s.arableHa, catchShare = s.catchHa / s.arableHa;
  const routeChange = change >= 0.35 && s.fourthYearHa === 0;
  const routeCatch = catchShare >= 0.35;
  const routeDivers = s.arableHa > 30 ? shares.length >= 3 && shares[0] <= 0.75 && shares[0] + (shares[1] ?? 0) <= 0.95 : shares.length >= 2 && shares[0] <= 0.75;
  const ok = s.arableHa <= 10 || routeChange || routeCatch || routeDivers;
  const routes = [routeChange && 'crop change', routeCatch && 'catch crops', routeDivers && 'diversification'].filter(Boolean).join(', ');
  return { id: 'gaec7', title: 'GAEC 7 — crop rotation', year: s.year, ok, kind: 'payment_condition', value: ok ? `met by: ${routes}` : 'not met',
    detail: `Crop changes on ${pct(change)} of arable land (need 35 %, no crop for a 4th year); catch crops on ${pct(catchShare)} (need 35 %); ${shares.length} crops, largest ${pct(shares[0] ?? 0)}, two largest ${pct((shares[0] ?? 0) + (shares[1] ?? 0))} (need 3 crops, ≤ 75 %, ≤ 95 %).` };
}

/** GAEC 6 (3D-107, p. 9): from 15 Nov to 1 Mar crops, stubble or plant residues on >= 65 % of arable land (> 50 ha) or 50 %.
 *  Unploughed stubble counts (p. 9.2), and every hectare is a growing crop, an exempt area or stubble, so this check
 *  cannot fail on crop choice: it does not filter variants. What it reports is how much stubble has to stay unploughed. */
export function gaec6(s: YearState, eligibleHa: number): RuleResult {
  const need = eligibleHa > 50 ? 0.65 : 0.5;
  const base = s.arableHa; // areas after beet and potatoes stay in the base but are exempt, so they count as met
  const green = (s.winterGreenHa + s.winterExemptHa) / base, withStubble = (s.winterGreenHa + s.winterExemptHa + s.winterStubbleHa) / base;
  const ok = withStubble >= need;
  const maxPlough = Math.max(0, base * (1 - need));
  return { id: 'gaec6', title: 'GAEC 6 — winter soil cover', year: s.year, ok, kind: 'payment_condition', value: green >= need ? `${pct(green)} under crops` : `${pct(green)} under crops; holds only if stubble stays`,
    detail: `Winter ${s.year - 1}/${String(s.year).slice(2)}: growing crops on ${pct(green)} of arable land; with unploughed stubble ${pct(withStubble)} (need ${pct(need)}). At most ${maxPlough.toFixed(0)} ha may be ploughed before 1 March${green >= need ? '' : `; ${(base * need - s.winterGreenHa - s.winterExemptHa).toFixed(0)} ha of stubble must stay unploughed`}.` };
}

/** Legumes on at least this share of the area under the eco-scheme "Augalų kaita" (3D-92, p. 43.4, as amended by 3D-145 of 2026). */
export const ECO_LEGUME_MIN = 0.1;

/** Eco-scheme "Augalų kaita" (3D-92, p. 42-43) on the area the farmer declares under it: >= 4 crops, legumes on >= 10 %
 *  of it, main crop <= 50 %, no crop twice in a row on a field. The farmer chooses that area, so fields where a perennial
 *  crop stays (grass kept for years) are left out of it, and the payment is made on the rest. */
export function ecoRotation(s: YearState): RuleResult {
  const stay = s.stay ?? new Map<CropId, number>();
  const stayHa = [...stay.values()].reduce((t, v) => t + v, 0);
  const ha = s.arableHa - stayHa, repeated = s.repeatedHa - stayHa;
  const shares = [...s.area.entries()].map(([c, a]) => [c, (a - (stay.get(c) ?? 0)) / ha] as const).filter(([, v]) => v > 1e-9).sort((a, b) => b[1] - a[1]);
  const legume = shares.filter(([c]) => crop(c).legume).reduce((t, [, v]) => t + v, 0);
  const ok = ha > 0 && shares.length >= 4 && legume >= ECO_LEGUME_MIN && shares[0][1] <= 0.5 && repeated <= 1e-9;
  const miss = [shares.length < 4 && `${shares.length} crops (need 4)`, legume < ECO_LEGUME_MIN && (legume > 0 ? `legumes on ${pct(legume)} (need 10 %)` : 'no legume'), shares[0] && shares[0][1] > 0.5 && `main crop ${pct(shares[0][1])} (max 50 %)`, repeated > 1e-9 && `${repeated.toFixed(0)} ha repeat last year's crop`].filter(Boolean).join('; ');
  const kept = stayHa > 0 ? ` Grass that stays (${stayHa.toFixed(0)} ha) is left out of the scheme area.` : '';
  return { id: 'eco_rotation', title: 'Eco-scheme "Crop rotation" (Augalų kaita)', year: s.year, ok, kind: 'incentive', value: ok ? `+${PAYMENTS_2025.ecoRotation} EUR/ha on ${ha.toFixed(0)} ha` : 'not eligible',
    detail: (ok ? `${shares.length} crops, legumes on ${pct(legume)}, main crop ${pct(shares[0][1])}, no crop repeated on a field.` : `Not eligible: ${miss}.`) + kept,
    paidShare: s.arableHa > 0 ? ha / s.arableHa : 0 };
}

/** GAEC 5 (3D-107, p. 8): no root or tuber crops on erosion-sensitive areas (official layer of slopes > 12 %). */
export const GAEC5_MIN_SHARE = 0.005;
export function gaec5Forbids(cropId: CropId, erosionShare: number): boolean {
  return crop(cropId).rootCrop && erosionShare > GAEC5_MIN_SHARE;
}

/** What the interface shows about the rules: a plain name and a one-line summary per rule. The screens render this
 *  list, so no screen spells out a rule itself and the rules stay a quiet part of the interface. */
export interface RuleInfo { id: string; code: string; name: string; summary: string; kind: 'prohibition' | 'payment_condition' | 'incentive'; layer?: 'erosion' | 'peat' }
export const RULESET: { acts: string; penalty: string; rules: RuleInfo[] } = {
  acts: 'EU farm-payment conditions (CAP 2023–2027) as they apply in Lithuania: orders 3D-107 and 3D-92, payment rates of 2025',
  penalty: 'Breaking a payment condition usually cuts payments by 3 %; an intentional breach by 15 % or more.',
  rules: [
    { id: 'gaec5', code: 'GAEC 5', name: 'Erosion-sensitive land', summary: 'No root or tuber crops on fields that touch the official erosion-sensitive layer.', kind: 'prohibition', layer: 'erosion' },
    { id: 'gaec6', code: 'GAEC 6', name: 'Winter soil cover', summary: 'Crops, stubble or residues on 65 % of arable land from 15 November to 1 March (50 % up to 50 ha).', kind: 'payment_condition' },
    { id: 'gaec7', code: 'GAEC 7', name: 'Crop rotation', summary: 'One of: crop change on 35 % of arable land, catch crops on 35 %, or three crops with the largest at most 75 %.', kind: 'payment_condition' },
    { id: 'eco_rotation', code: 'eco-scheme', name: 'Rotation payment', summary: `Four crops, legumes on a tenth of the area, main crop at most half, no crop repeated on a field: +${PAYMENTS_2025.ecoRotation} €/ha.`, kind: 'incentive' },
    { id: 'gaec2', code: 'GAEC 2', name: 'Peat and wetland', summary: 'Peat soils are shown for information; their tillage limits are not encoded in the demo.', kind: 'payment_condition', layer: 'peat' },
  ],
};

# Soil protection

How the engine measures what a crop plan does for the soil, how one plan becomes "Best for soil", and where every number comes from. Code: `src/engine/characteristics.ts` (the arithmetic), `src/pilot/soil.ts` (climate, coefficients, sources), `src/components/Soil.tsx` (card block, table, "?" panel). Data: `src/data/cover-model.json`, `src/data/soil-climate.json`, `src/data/soil-check.json`.

## 1. Idea

- **Measured, not assumed.** The farm rules count what is declared. NASA HLS measures what covers the soil, NASA GPM IMERG measures when rain is erosive. Every plan is measured before sowing.
- **A European frame.** The EU Soil Monitoring Law (Directive (EU) 2025/2360) assesses soil health by aspect of soil degradation. A crop plan changes two that we measure: erosion (its Annex II asks erosion estimates to consider rainfall erosivity, vegetation cover, crop type and cover crops) and loss of organic carbon. FAO's Conservation Agriculture principles add soil cover and species diversification. Disturbance by tillage cannot be seen from space or from a crop plan, and the app says so.
- **One soil health score, with its parts visible** (section 6). Since 15 Nov 2026 the cards show one number, 0–100, bigger is better, in place of four separate soil numbers. It is the equal-weight average of three aspects. The six measures of section 2 stay in the table of the selected plan and in Compare.
- **None of them is an erosion rate, a leached amount or measured carbon.** They compare plans on the part that the crop plan decides.

## 2. The measures

Half-month arrays have 24 values; index 0 is 1–15 July, index 23 is 16–30 June (the cover-model year). `b[h]` is the bare fraction of half-month h: 1 − green cover, where green cover is NDVI rescaled between bare soil (0.197) and full cover (0.922).

| ID | Characteristic | Definition | Unit | Data |
|---|---|---|---|---|
| S1e | `bareErosive` (headline, search axis) | Σh `b[h]` × `w[h]` × 365; `w[h]` = share of the yearly rainfall erosivity in half-month h | days per ha and year | NASA HLS × NASA GPM IMERG |
| S1 | `bareDays` | Σh `b[h]` × 365 / 24 | days per ha and year | NASA HLS |
| S2 | `bareOnSlopes` | S1e × share of the field inside the official erosion-sensitive layer, summed over fields | ha × days a year (screens divide by the hectares of that land) | HLS × IMERG, NMA layer |
| S3 | `familiesPerYear`, `legumeShare`, `cerealAfterCereal` | Crop families on the farm in each plan year; share of legume area; share of area where a cereal follows a cereal | count, share | crop plan, crop reference |
| S4 | `wetHarvestHa` | Hectares per plan year of crops whose harvest window is typically wet | ha a year | IMERG, POWER |
| S5 | `bareLeaching` | Σh `b[h]` × `d[h]` × 181; `d[h]` = share of the water surplus of 1 Sep – 28 Feb in half-month h | days per ha and year | HLS × IMERG, POWER |
| S6 | `humus` | Per field and year: crop coefficient + by-product left on the field + catch crop | kg humus-C per ha and year | VDLUFA coefficients, yields as in the margin |

All are means over the plan years, weighted by field area. `coverDays(half, soil)` computes S1, S1e and S5 for one field-year; `humusOf` computes S6; `optionPart` adds the field parts; `characteristics` divides by the farm area.

**Typical value and range.** The typical value of S1 and S1e comes from the mean half-month curve of the crop sequence (`half.mean`), so that it is exact for any set of weights. The low and high values (`p25`, `p75`) keep the distance of the quartiles over fields from their median (`total`, `erosive` in the cover model). The range is the spread of fields and seasons, not an error bar.

**With equal shares S1e equals S1.** `tests/soil.test.ts` checks it for every sequence and for whole plans.

## 3. Cover model — `src/data/cover-model.json`

Built by `pipeline/47_cover_model.ts` from NASA HLS half-month NDVI of about 1 700 declared Lithuanian fields, seasons 2024–25 and 2025–26 (to 30 June 2026). Each field-season is a curve of 24 bare fractions; curves are grouped by (harvest timing of the preceding crop) > (sowing timing of the next crop), 31 sequences. For spring-sown next crops the group is split by whether the field was green in autumn (max NDVI 16 Sep – 31 Oct ≥ 0.5): the model of a catch crop.

| Key | Content |
|---|---|
| `model.<sequence>.half.mean` | Mean bare fraction by half-month (what the engine sums) |
| `model.<sequence>.half.p25`, `p50`, `p75` | Quartiles by half-month (display) |
| `model.<sequence>.total`, `autumn`, `winter`, `spring` | Quartiles over fields of the plain bare days (unchanged from the prototype, experiment C6) |
| `model.<sequence>.erosive`, `leaching` | Quartiles over fields of S1e and S5 with the farm's weights |
| `model.<sequence>.bySeason` | Means of S1, S1e, S5 in each of the two seasons |
| `observedShare` | Share of field-seasons with a clear view in each half-month |
| `dataUntil` | Last day of the data: 2026-06-30 |

Gaps are filled as in C6: December–February keep the last autumn state, other gaps take the mean of the neighbours. A sequence without an entry of its own takes a similar one (`bareFor`: the same with "mid" harvest timing, then the general entry).

## 4. Soil climate — `src/data/soil-climate.json`

Built by `pipeline/46_soil_climate.ts`, years 2001–2025, one grid cell for the whole farm.

**Erosivity shares** (`erosivity.shares`, the base is named in `erosivity.base`):

| Set | Method |
|---|---|
| `storms` (base) | NASA GPM IMERG V07 half-hourly rain (`pipeline/44_imerg_halfhourly.ts`). Storms are separated by 6 h with less than 1.27 mm; a storm counts from 12.7 mm; EI30 = storm energy × highest 30-minute intensity, unit energy 0.29 (1 − 0.72 e^(−0.05 i)) MJ/ha per mm. Half-hours that IMERG marks as probably frozen (`probabilityLiquidPrecipitation` < 50 %) are not rain |
| `stormsWithSnow`, `stormsSmoothed` | The same with frozen precipitation kept; the same smoothed over three half-months |
| `daily` | IMERG daily rain from NASA POWER: P^1.81 on days with at least 12.7 mm (daily model of Richardson, Foster & Wright 1983) |
| `dailyB15`, `dailyB20`, `dailyWarm2` | Exponent 1.5 and 2.0; April–September counted double |

Only shares are used. IMERG underestimates intense rain: the mean annual EI30 it gives here is 203 MJ mm/(ha h), well below published values for the region.

**Leaching shares** (`leaching.shares`): median over the seasons of max(0, IMERG rain − Hargreaves ET0) per half-month from 1 September to 28 February, normalised; 168 mm in a median season, nothing in September.

**Harvest windows** (`harvest.crops`): IMERG rain − ET0 summed over the harvest window of the crop reference, by year; "typically wet" when the median is above zero.

## 5. Humus coefficients — `src/pilot/soil.ts`

From the advisory worksheet of LfL Bayern (Stand 11/2014), which prints the coefficients of the VDLUFA method (Standpunkt Humusbilanzierung, 2014). Values for conventional farming, kg humus-C per ha and year:

| Crop | Coefficient | By-product left on the field |
|---|---|---|
| Cereals, rapeseed | −400 | straw: ratio to grain 0.7–1.1 (rapeseed 1.7) × 7 per dt |
| Grain legumes | +160 | included |
| Grain maize | −800 | straw: 1.0 × 7 per dt |
| Sugar beet | −1 300 | leaves: 0.7 × 1.3 per dt |
| Perennial grass | +600 | 800 × 75 % (yield unknown; footnote 1 of the worksheet) |
| Catch crop | +176 | (100 + 190 dt/ha × 0.8) × 70 % (stand unknown; footnote 3) |

Classes for conventional farming: below −200 very low, to −76 low, −75 to +100 balanced, to +300 high, above very high. The straw switch (`strawLeft`) is in the soil table of the Planner.

## 6. Soil health score and Best for soil — `src/engine/soil-score.ts`

Decided by the owner on 14–15 Nov 2026; the research behind it is `research/characteristics/soil-protection/soil-score.md` and the brief `proposals/soil-health-score.md` of the team repository.

| Step | Rule | Why |
|---|---|---|
| Aspects | **Cover**: S1e, days of bare soil under heavy rain. **Variety**: cereal after cereal and crop groups per year (S3), half each. **Organic matter**: S6, humus balance | One measure per aspect, so that bare soil is not counted three times (S1, S2 and S5 repeat S1e; S4 is an unvalidated proxy and 0 ha on the pilot) |
| Scale of each measure | 0 = the weakest tenth of the local farms (`SOIL_ZERO_SHARE`; the statistical farms behind the typical local plan, [usual-practice.md](usual-practice.md)); 100 = the best value among the plans found, the typical plan included. Linear in between, cut at 0 and 100 (`soilScale`) | Cornell's soil health test scores each indicator against a reference set of soils; here the reference set is what farms around actually sow. The typical plan gets a real score, not 0 |
| Weights | Equal for the three aspects (`SOIL_WEIGHTS`) | No source sets weights between soil measures (JRC, *Tools for Composite Indicators Building*, 2005: "No agreed methodology exists to weight individual indicators"; equal weights are the default "when there are no statistical or empirical grounds for choosing a different scheme"). Cornell's overall score is "the unweighted average of all individual indicator scores" |
| Score | Whole points; the total is the rounded mean of the unrounded aspects (`soilScore`) | |
| Bands | Below 40 low, 40 to 60 medium, from 60 high (`soilBand`) | The cut points of the Cornell report (its five colours folded into three). On this scale "high" means close to the best plan found, "low" means like the weakest local farms |
| Best for soil | The highest score; plans within 3 points of the top (`SOIL_TIE_POINTS`) count as equal and the highest margin among them wins (`bestForSoil`) | A point or two is less than the measures can tell apart: one plan's own bare-soil days spread by about 35 between years |

- The score is attached to the characteristics by the search (`ch.soilScore`) and, for the agronomist's own plans, by the store with the scale of the search (`SearchResult.soilScale`).
- **Robustness.** `tests/soil.test.ts` checks that with any aspect counted double or half the Best-for-soil plan stays within 5 points of the top.
- **Limits.** The weights are a stated judgement. The scale is relative to this farm, this decision day and this crop set: it compares plans and is not a measurement of the soil. Humus is an accounting, cover is measured. Tillage is not in it. The search does not push for humus directly: its soil axis is still S1e (`AXES`), so the best score is the best among the plans the search keeps.
- **Before the score** Best for soil was the plan with the fewest S1e days (`fewestBareSoil`); the check of the rain weighting (`pipeline/92_soil_sensitivity.ts`, `src/data/soil-check.json`) still follows that plan.

Reference values, 1 August 2026 (`npx tsx pipeline/90_engine_check.ts` prints the plans; the scale: cover 160 → 139 days, cereal after cereal 51 % → 0, crop groups 3 → 4, humus −66 → +70 kg C/ha):

| Plan | Score | Cover | Variety | Organic matter | Margin, €/ha |
|---|---|---|---|---|---|
| Typical local plan | 26 (low) | 19 | 39 | 21 | 307 |
| Highest margin · Best in a bad year | 82 (high) | 57 | 100 | 88 | 430 |
| Balanced | 93 (high) | 86 | 100 | 93 | 419 |
| Best for soil | 97 (high) | 90 | 100 | 100 | 392 |
| Fewest bare-soil days (Best for soil before the score) | 94 (high) | 100 | 95 | 86 | 327 |

Cards of the Planner: Typical local plan · Highest margin · Best in a bad year · Best for soil · Balanced (cards of the same plan are merged). Cereal after cereal stays a search axis (`AXES`).

## 7. Catch crop before the first plan year

`catchFirstFits`: a catch crop can be planned for the autumn of the decision day when (1) catch crops are allowed, (2) nothing is sown yet for the first plan year, (3) the crop of the decision year is harvested by 5 September, (4) the next crop is spring-sown, and (5) the decision day is not later than 5 September. `FieldOption.catchFirst` carries it; `catchBefore(option, i)` answers for any plan year.

## 8. Pilot reference values

Decision day 1 August 2026, default crop set (`pipeline/90_engine_check.ts`, `pipeline/92_soil_sensitivity.ts`):

| Plan | Margin, €/ha | S1e | S1 | S5 | S6 | Cereal after cereal |
|---|---|---|---|---|---|---|
| Usual practice (typical statistical farm, [usual-practice.md](usual-practice.md)) | 307 | 156 | 185 | 101 | −38 | 36 % |
| Highest margin | 430 | 148 | 171 | 88 | +54 | 0 % |
| Best in a bad year (the same plan) | 430 | 148 | 171 | 88 | +54 | 0 % |
| Best for soil (highest soil health score, section 6) | 392 | 141 | 164 | 81 | +70 | 0 % |
| Fewest bare-soil days (Best for soil before the score) | 327 | 139 | 161 | 76 | +51 | 5 % |
| Balanced | 419 | 142 | 166 | 85 | +61 | 0 % |

- Usual practice was the hand-written wheat and rapeseed habit until 14 November 2026: 984 €/ha, S1e 151, S1 171, S5 91, S6 −29, 23 %. It is now the typical farm drawn from the declarations around the pilot. Against it, Best for soil has 15 fewer erosion-weighted days and 71 more points of the soil health score at +85 €/ha; the plan with the fewest bare-soil days has 17 fewer days at +20 €/ha. Margins are farm net income ([money.md](money.md), section 7a).
- Exact lower bound of S1e (the best option of every field, rules ignored): 138.5. The search finds 139.
- Price of soil protection along the non-dominated set (highest margin at each S1e): 148 → 430, 146 → 429, 145 → 428, 144 → 421, 142 → 419, 141 → 392, 140 → 369, 139 → 329 (the plan with the fewest bare-soil days by the old tie rule, on erosion-sensitive land: 327). The Best-for-soil card is the plan at 141 days and 392 €/ha.
- Erosivity at the farm: June–August 54 % of the year, December–February 13 %, the half-months without clear satellite views (16 Nov – 31 Jan) 8 %; 264 storms, the 15 largest carry 31 %.
- By sequence, S1e: cereal then winter cereal 164, cereal then winter rapeseed 145, cereal then spring crop 184 (174 after a green autumn), grass 105.
- Sensitivity: with the six other sets of shares the plan with the fewest bare-soil days stays first of 16 plans in four, second in one (`stormsSmoothed`) and third in one (`dailyWarm2`).
- S4 is 0 ha for every plan of the default crop set: only sugar beet and grain maize have typically wet windows.

## 9. Sources

Listed with their status in `SOIL_SOURCES` (`src/pilot/soil.ts`). The panel of the score shows a short list of them as links (the EU Soil Monitoring Law, FAO Conservation Agriculture, NASA HLS, NASA GPM IMERG, RUSLE, the humus balance method, the JRC guide on composite indicators, the Cornell soil health test); the adopted wording of the directive and the JRC and Cornell texts were read for the score on 14 Nov 2026 (research file `soil-score.md` of the team repository). Status: primary = read in the original; abstract = only the abstract or the publisher's summary was read, so no number is quoted from it; calculation = ours. Read in the original: Directive (EU) 2025/2360; the USDA NRCS guide chapter on the RUSLE cover-management factor; the ESDAC page on monthly erosivity; Thapa, Mirsky & Tully 2018; the LfL worksheet.

## 10. Updating

| Change | Do |
|---|---|
| Weather years, crop harvest windows | `npx tsx pipeline/46_soil_climate.ts`, then `47_cover_model.ts` (its quartiles use the weights) |
| HLS field series or the sequence table | `npx tsx pipeline/47_cover_model.ts` (needs the local series, see `pipeline/README.md`) |
| Decision day, crop set, erosivity base | `npx tsx pipeline/92_soil_sensitivity.ts` (rewrites `soil-check.json`; `npm test` fails while it is stale) |
| Humus coefficients | `src/pilot/soil.ts`, with the source |

After a change: `npm test`, `npx tsx pipeline/90_engine_check.ts`, `npm run shots`.

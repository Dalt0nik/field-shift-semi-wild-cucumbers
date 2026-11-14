# Money engine

How the engine computes the money of a crop plan: the margin of every field in every replayed past season, the farm series, and the money characteristics that the search and the screens use. Code: `src/engine/characteristics.ts`; pilot constants: `src/pilot/economics.ts`, `src/pilot/demo.ts`, `src/pilot/rules.ts`; data: `src/data/`.

## 1. Idea

A plan is replayed through past seasons (`REPLAY` in `src/pilot/demo.ts`: 2006–2024; the last season and the years of the normal levels follow the decision day, so that only published yields and prices are used).

- **Levels are today's.** Each replayed season applies its relative deviations of yield and price to today's normal levels. The deviations of every crop average 1 over the replayed seasons, so the replay keeps that level: the yield trend is in the normal level already and is not counted a second time.
- **The margin is the farm net income.** Besides the crops' variable costs, every season carries the costs of running the farm (overheads, depreciation, rent, wages, interest) of an average Lithuanian cereal farm and the redistributive payment of a holding of this size (section 7a). They are the same for every plan, so they set the level and never the order of plans.
- **One season for all crops.** Every crop of the plan goes through the same season, so the crops of a plan keep their joint good and bad years.
- **Result.** The engine produces one farm margin per season. All money characteristics are read from that series.

## 2. Formula

For field f, plan year t with crop c after preceding crop p, and replayed season s:

```
Y(f,c,s) = Ynorm(c) × FI(f,c) × dY(c,s) × PC(c,p) × SF(c,p)       yield, t/ha
R(f,c,s) = Y(f,c,s) × Pnorm(c) × dP(c,s)                          revenue, €/ha
M(f,t,s) = R(f,c,s) − WH(f,c,s) + payments(f,t) − costs(c,t)      margin, €/ha

M(f,s)   = mean of M(f,t,s) over the plan years
F(s)     = Σf M(f,s) × area(f) / farm area + rotation eco-scheme bonus + farm payments − farm costs
```

| Term | Meaning | Code |
|---|---|---|
| Ynorm, Pnorm | Normal yield and price: mean over `REPLAY.normalYieldYears` and `REPLAY.normalPriceYears` | `prepare` → `normal` |
| dY, dP | Deviation of season s: value of s divided by the mean of the seasons before it (up to five, at least `MIN_PREV_SEASONS` = 3); where a crop has no deviation, the mean deviation of its family in that season. Each series is then divided by its mean over the replayed seasons (dY and dP separately, so their covariance stays) | `prepare` → `yieldDev`, `revenue` |
| farm costs, farm payments | Per ha a year, the same for every plan: Lithuanian FADN 2024 costs beyond the variable costs (491 €/ha) and the redistributive payment (46 €/ha for 102 ha) | `ctx.farmLevel`, `FARM_COSTS`, `redistributivePerHa` |
| FI | Field index: the field's usual yield against neighbouring fields of the same crop group (NASA HLS) | `fieldFactor` |
| PC | Preceding-crop factor, cereals only: after a cereal 0.93, after oilseed 1.02, after a legume 1.06, else 1 | `precropFactor` |
| SF | Late-sowing factor: the yield lost when the crop can be sown only after the preceding harvest (section 7b); 1 for a crop already in the ground | `sowingFactor` |
| WH | Wet-harvest loss in seasons with a rainy harvest (NASA GPM IMERG) | `wetHarvestLoss` |
| payments, costs | 2025 payment rates; illustrative variable costs per crop, plus the catch-crop cost when a catch crop precedes the crop | `optionPart`, `PAYMENTS_2025`, `CATCH_CROP_COST` |

## 3. Normal levels and season deviations — `prepare(ctx)`

For every crop of the crop set and every replayed season, `prepare` builds:

| Output | Content |
|---|---|
| `normal[c]` | `yieldTHa`, `priceEurT`, `costEurHa` (× `costFactor`), `seasonsUsed` (seasons with the crop's own yield and price deviation), `seasonsFilled` (seasons that borrowed the family's deviation) |
| `yieldDev[c][s]` | dY |
| `revenue[c][s]` | Ynorm × dY × Pnorm × dP: revenue at district level with the season's yield and price |
| `revenueYield[c][s]` | Ynorm × dY × Pnorm: the same at the normal price, used to compare season types without price effects |
| `types[s]` | Season type from `weather.json`: `dry`, `wetHarvest` or `normal` |
| `wet[s]` | True when the wet-harvest loss applies in season s (section 5) |

Inputs:
- `economics.json`: `crops.<crop>.yieldTHa`, `priceEurT` by year, `costEurHa`;
- `weather.json`: `years[].type` and `years[].harvestRainRank`.

## 4. Field index — `fieldFactor(ctx, fieldId, crop)`

```
FI(f,c) = clamp(1 + beta[group(c)] × dShrunk(f), cap[0], cap[1])
```

The parts:
- `group(c)` comes from `FIELD_GROUP` in `src/pilot/economics.ts`:

  | Group | Crops |
  |---|---|
  | `winter_cereals` | winter wheat, winter barley, triticale, winter rye |
  | `spring_cereals` | spring wheat, spring barley, oats |
  | `rapeseed` | winter and spring oilseed rape |
  | `legumes` | peas, faba bean |

  A crop without a group has FI = 1.
- `beta`, `cap` and `fields[f].dShrunk` come from `src/data/field-index.json`. A field missing from the file has FI = 1.
- `dShrunk` is the field's mean difference of season peak NDVI from its neighbours with the same crop group, multiplied by its reliability.
- Only seasons whose peak window (1 April – 31 July) had closed by the decision day are used: `fieldIndexAt(date)` in `src/pilot/demo.ts` recomputes `k`, `reliability` and `dShrunk` from the seasons that are left. On 1 August 2026 all four seasons count.

`field-index.json` (copy of `pipeline/inputs/field-index.json`, see `pipeline/README.md`):

| Key | Content |
|---|---|
| `beta` | Share of yield per 1.0 NDVI, per group |
| `beta90` | 90 % interval of each beta |
| `rho`, `cap`, `radiusM`, `seasons` | Single-season reliability, cap of FI, neighbourhood radius in metres, seasons used |
| `fields.<id>.d` | Difference from the neighbours' median peak NDVI, per season |
| `fields.<id>.percentile` | Place of the field among its neighbours, per season |
| `fields.<id>.k` | Number of seasons |
| `fields.<id>.reliability` | k × rho / (1 + (k − 1) × rho) |
| `fields.<id>.dShrunk` | Mean of `d` × `reliability` |

**Peak NDVI** is the 90th percentile of clear NDVI from 1 April to 31 July in NASA HLS (HLSL30 + HLSS30, 30 m, Fmask bits 1–4 masked), averaged over the field shrunk by 20 m.

The Fields screen shows FI per group and the percentiles. Plan comparisons name FI where it is at least ±3 %.

## 5. Wet-harvest loss — `wetHarvestLoss(params, crop, tonnes, revenue)`

**When it applies.** Season s is a wet harvest when `harvestRainRank` of s is at least `WET_HARVEST.rankFrom` (0.8): the rank of NASA GPM IMERG rain from 20 July to 31 August at the farm among 2001–2025.

**Formula.** For cereals, oilseeds and legumes (not perennial), with Y and R as in section 2:

```
WH = Y × extraMoisturePct × tariff + [c in feedCrops] × R × feedShare × feedDiscount
tariff = dryingOilseedEurPerTPct for oilseeds, dryingEurPerTPct otherwise
```

`WET_HARVEST` in `src/pilot/economics.ts`, with its sources in the comment:

| Parameter | Value |
|---|---|
| `rankFrom` | 0.8 |
| `extraMoisturePct` | 2.5 percentage points |
| `dryingEurPerTPct` | 7.5 € per tonne per point |
| `dryingOilseedEurPerTPct` | 8.0 € per tonne per point |
| `feedCrops` | winter and spring wheat |
| `feedShare` | 0.25 |
| `feedDiscount` | 0.15 |

Drying in ordinary seasons is not modelled separately: it is part of the variable costs.

## 6. Field margin — `optionPart(pre, field, option)`

For one field option (a crop per plan year, with catch-crop flags):

| Output | Content |
|---|---|
| `margin[s]` | € for the whole field, mean of the plan years, at the season's prices |
| `marginYield[s]` | The same at normal prices (WH from the normal-price revenue) |
| `payments` | € per year: basic support, coupled protein support for annual legumes, catch-crop eco-scheme |
| `bare`, `bareErosive`, `bareWinter`, `bareSlopes`, `bareLeaching`, `wetHarvest`, `humus`, `cerealAfterCereal`, `legume` | The non-money parts of the option ([soil.md](soil.md)) |

A catch crop can precede the crop of any plan year, the first one included while its sowing is still ahead of the decision day (`catchBefore`, `FieldOption.catchFirst`); it costs `CATCH_CROP_COST` and earns the catch-crop eco-scheme.

Field parts add up over fields, so the search evaluates a plan by summing precomputed parts.

## 7. Farm series and characteristics — `characteristics(pre, options, parts)`

```
F(s)  = Σ margin[s] / farm area + ecoBonus + farm payments − farm costs − cut
ecoBonus = PAYMENTS_2025.ecoRotation × mean over the plan years of (scheme area / arable area if the scheme is met, else 0)
cut   = PAYMENT_CUT × (all payments per ha) × (plan years with a broken payment condition) / (plan years)
```

**A broken payment condition costs money, it is not a ban.** Breaking GAEC 6 or GAEC 7 cuts all the farm's payments of that year, usually by 3 % when it is not intentional (`PAYMENT_CUT` in `src/pilot/rules.ts`; 15 % or more when intentional). The search never suggests such a plan: a breach built into a plan on purpose is closer to intentional, and on the pilot farm no plan breaks either rule (20 000 random admissible plans and the most profitable plan with the rules ignored all pass, 15 November 2026). The cut therefore reaches only the typical local plan and the custom plan, and only if they break a rule.

| Characteristic | Definition |
|---|---|
| `marginMean` | Mean of F(s) |
| `marginP10`, `marginP90` | Quantiles with linear interpolation at position (n − 1) × p |
| `marginWorstFifth` | Mean of the worst round(n / 5) seasons |
| `worstSeasons` | The three worst seasons with their margins |
| `marginDry`, `marginWetHarvest`, `marginNormal` | Mean over seasons of that type, from `marginYield` (normal prices) |
| `marginSeries` | F(s) with the season type, for charts |
| `paymentsEurHa` | Payments per ha and year, eco-schemes included, after the cut |
| `paymentParts` | The same split into basic support, the redistributive top-up, coupled support for legumes, the catch-crop eco-scheme, the rotation eco-scheme and the cut; shown on the EU rules screen |

The search (`src/engine/search.ts`) compares plans on `AXES`: `marginMean`, `marginWorstFifth`, days without cover weighted by erosive rain (`bareErosive`, [soil.md](soil.md)) and cereal after cereal.

## 8. Switching steps off

`Context.moneySteps` switches single steps off, for checks and sensitivity runs:

```ts
search({ ...makeContext(), moneySteps: { fieldIndex: false } });                  // every field as the district
search({ ...makeContext(), moneySteps: { fieldIndex: false, wetHarvest: false } }); // replay without both steps
```

When `fieldIndex` or `wetHarvest` is absent from the context, the step is off. `costFactor` scales all variable costs (`pipeline/91_cost_sensitivity.ts`).

## 7a. Farm costs and farm payments — `ctx.farmLevel`

The crops' variable costs (seed, fertiliser, plant protection, fuel, drying) leave out what it costs to run the farm. Without it the margin is a gross margin of 750–990 €/ha, which no Lithuanian cereal farm earns. `ctx.farmLevel` adds, per ha and year, the same in every season and for every plan:

| Item | €/ha | Lithuanian FADN 2024, cereal and oilseed farms (TF15, 572 farms, 62.67 ha) |
|---|---|---|
| Machinery and buildings upkeep | 63 | table 24: 3 947 € per farm |
| Contract work | 24 | 1 478 |
| Other overheads (insurance, other) | 60 | 3 779 |
| Depreciation | 204 | 12 775 |
| Rent paid (51 % of the land rented, 116 € per rented ha) | 59 | 3 670 |
| Wages paid | 49 | 3 098 |
| Interest paid | 26 | 1 616 |
| Land tax | 6 | table 12: 374 |
| **Farm costs** | **491** | `FARM_COSTS_EUR_HA` |
| Redistributive payment (3D-596: 75.18 / 81.42 / 95.23 / 108.45 €/ha for ha 1–10 / 11–20 / 21–30 / 31–50) | +46 | `redistributivePerHa(101.96 ha)` |

Source: ŽŪDC, *Ūkių veiklos rezultatai 2024* (Lithuanian FADN), type of farming "Javų, rapsų". Energy is not taken again: it is in the variable costs. Family labour is not paid: the margin is the FADN farm net income, what is left for the family's work, its own land and capital. Farms of 100–250 thousand € economic size (182 ha, all types) carry 496 €/ha of the same items.

Check against the same accounts: TF15 farms earned a farm net income of 152 €/ha in 2024, a year of low prices. Usual practice replayed in season 2024 gives −7 €/ha; the model leaves out the eco-schemes it does not plan (55 €/ha in TF15), other subsidies (41) and other and livestock output (45 €/ha), together about 140 €/ha.

`moneySteps.farmLevel = false` switches the step off (gross margin), as the money-step tests do.

## 7b. Late sowing and the rotation eco-scheme

**Late sowing — `sowingFactor(ctx, prev, crop)`.** A crop sown right after the preceding harvest is sown late when that harvest is late. The harvest of the preceding crop falls on any day of its harvest window with equal chance; the field is sown `PREP_DAYS` (10) days later, not before the crop's own sowing window opens; the yield follows the pilot's points of yield against sowing day (`LATE_SOWING` in `src/pilot/economics.ts`), linear between them. A crop already in the ground (a fixed plan year) keeps factor 1.

| Crop | Points (sowing day → share of the yield of a 20 August sowing) | Source |
|---|---|---|
| Winter oilseed rape | 20 Aug 1.00 · 30 Aug 0.98 · 10 Sep 0.72 | Field trial of Aleksandras Stulginskis University, harvests 2009 and 2010, varieties 'Sunday' and 'Kronos', mean of both (Pupalienė, Velička, Butkevičienė 2013, *Rural Development*, figure 1). The LAMMC crop guide (IKOK, žieminiai rapsai, 2024) agrees: 10 days after 20–25 August cost 1.0–2.0 t/ha |

Winter rapeseed after winter wheat (harvest 25 July – 31 August) keeps 0.95 of its yield; after winter barley (harvest by 31 July) 1.00. No other crop has points yet.

**Rotation eco-scheme on the scheme area.** Order 3D-92 (p. 42–43) pays "Augalų kaita" on the area the farmer declares under it. The engine leaves fields where a perennial crop stays out of that area (grass kept for years cannot meet "no crop twice in a row") and checks the conditions on the rest: at least 4 crops, legumes on at least 10 % (p. 43.4, as amended in 2026), the main crop at most 50 %, no crop repeated on a field. The payment is made on the scheme area only (`RuleResult.paidShare`).

## 9. Pilot reference values

Two set-ups of the demo farm. The money steps were first checked on the decision day **14 November 2026**, when 75 of 102 ha carried a winter crop; `tests/money.test.ts` keeps that set-up (`makeSetup({ decisionDate: '2026-11-14' })`). The demo now runs on **1 August 2026**, with every field open (`npx tsx pipeline/90_engine_check.ts 2026-08-01 2026-11-14` prints both).

| | Usual season | Bad seasons | Wet harvest |
|---|---|---|---|
| 14 Nov · Old usual practice, both steps off, gross | 801 | 330 | 726 |
| 14 Nov · Old usual practice, wet harvest only, gross | 779 | 314 | 615 |
| 14 Nov · Old usual practice, both steps, gross | 817 | 338 | 649 |
| 14 Nov · Old usual practice, both steps, farm net income | 372 | −107 | 204 |
| 1 Aug · Usual practice (typical statistical farm) | 307 | −132 | 164 |
| 1 Aug · Highest margin (also best in a bad year) | 430 | −54 | 260 |
| 1 Aug · Balanced plan | 419 | −65 | 244 |

All values in €/ha. "Old usual practice" is the plan of the hand-written wheat and rapeseed habit that usual practice was until 14 November 2026. `tests/money.test.ts` keeps it as a fixed plan, so the money steps are checked on the same plan as before. Usual practice is now the typical farm drawn from the declarations around the pilot ([usual-practice.md](usual-practice.md)); 1 August rows are farm net income with both money steps, late sowing and the eco-scheme on its scheme area. Before late sowing and the scheme area (14 November 2026) they read 319 / −129 / 156, 440 / −81 / 259 and 398 / −89 / 224. Before the replay was scaled and before the farm costs (14 November 2026) the same rows read 857 / 379 / 654, 988 / 444 / 763 and 955 / 451 / 744: gross margins, and about 90 €/ha too high.

Single values:
- FI(F12, winter wheat) = 0.813.
- FI(F5, winter oilseed rape) = 1.115.
- FI(F11, any crop) = 1.
- Wet-harvest seasons: 2006, 2007, 2010, 2011.
- WH of winter wheat at 5.73 t/ha and 1 456 €/ha = 162 €/ha.
- Field F2, faba bean then winter wheat, season 2006: 63.5 €/ha (faba bean in the 2006 drought: 0.25 of its usual yield; it was 445.7 when a missing deviation counted as an ordinary season).
- `tests/money-replay.test.ts`: every crop's yield deviations average 1; the rolling forecast of district revenue for the harvests 2014–2025, with the app's information lag, is unbiased within 3 % (it was +12 % before the deviations were scaled).

## 10. Updating the inputs

| Input | How it is updated |
|---|---|
| Yields, prices, costs, season types, harvest-rain rank | `pipeline/40_weather_economics.ts` → `economics.json`, `weather.json` |
| Field index | Replace `pipeline/inputs/field-index.json` and copy it to `src/data/` |
| Rates and parameters | `PAYMENTS_2025` in `src/pilot/rules.ts`; `WET_HARVEST` and `FIELD_GROUP` in `src/pilot/economics.ts`; `REPLAY` in `src/pilot/demo.ts` |

After a change, run `npm test` and `npx tsx pipeline/90_engine_check.ts` (it also compares the search with exact bounds: the highest margin and the lowest erosion-weighted days of the best option of every field).

# Money engine

How the engine computes the money of a crop plan: the margin of every field in every replayed past season, the farm series, and the money characteristics that the search and the screens use. Code: `src/engine/characteristics.ts`; pilot constants: `src/pilot/economics.ts`, `src/pilot/demo.ts`, `src/pilot/rules.ts`; data: `src/data/`.

## 1. Idea

A plan is replayed through past seasons (`REPLAY` in `src/pilot/demo.ts`: 2006–2024).

- **Levels are today's.** Each replayed season applies its relative deviations of yield and price to today's normal levels.
- **One season for all crops.** Every crop of the plan goes through the same season, so the crops of a plan keep their joint good and bad years.
- **Result.** The engine produces one farm margin per season. All money characteristics are read from that series.

## 2. Formula

For field f, plan year t with crop c after preceding crop p, and replayed season s:

```
Y(f,c,s) = Ynorm(c) × FI(f,c) × dY(c,s) × PC(c,p)                 yield, t/ha
R(f,c,s) = Y(f,c,s) × Pnorm(c) × dP(c,s)                          revenue, €/ha
M(f,t,s) = R(f,c,s) − WH(f,c,s) + payments(f,t) − costs(c,t)      margin, €/ha

M(f,s)   = mean of M(f,t,s) over the plan years
F(s)     = Σf M(f,s) × area(f) / farm area + rotation eco-scheme bonus
```

| Term | Meaning | Code |
|---|---|---|
| Ynorm, Pnorm | Normal yield and price: mean over `REPLAY.normalYieldYears` and `REPLAY.normalPriceYears` | `prepare` → `normal` |
| dY, dP | Deviation of season s: value of s divided by the mean of the five seasons before it; 1 if any of the six values is missing | `prepare` → `yieldDev`, `revenue` |
| FI | Field index: the field's usual yield against neighbouring fields of the same crop group (NASA HLS) | `fieldFactor` |
| PC | Preceding-crop factor, cereals only: after a cereal 0.93, after oilseed 1.02, after a legume 1.06, else 1 | `precropFactor` |
| WH | Wet-harvest loss in seasons with a rainy harvest (NASA GPM IMERG) | `wetHarvestLoss` |
| payments, costs | 2025 payment rates; illustrative variable costs per crop, plus the catch-crop cost when a catch crop precedes the crop | `optionPart`, `PAYMENTS_2025`, `CATCH_CROP_COST` |

## 3. Normal levels and season deviations — `prepare(ctx)`

For every crop of the crop set and every replayed season, `prepare` builds:

| Output | Content |
|---|---|
| `normal[c]` | `yieldTHa`, `priceEurT`, `costEurHa` (× `costFactor`), `seasonsUsed` |
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
| `bare`, `bareWinter`, `bareSlopes`, `cerealAfterCereal`, `legume` | The non-money parts of the option |

Field parts add up over fields, so the search evaluates a plan by summing precomputed parts.

## 7. Farm series and characteristics — `characteristics(pre, options, parts)`

```
F(s)  = Σ margin[s] / farm area + ecoBonus
ecoBonus = PAYMENTS_2025.ecoRotation × share of plan years in which the farm meets the rotation eco-scheme
```

| Characteristic | Definition |
|---|---|
| `marginMean` | Mean of F(s) |
| `marginP10`, `marginP90` | Quantiles with linear interpolation at position (n − 1) × p |
| `marginWorstFifth` | Mean of the worst round(n / 5) seasons |
| `worstSeasons` | The three worst seasons with their margins |
| `marginDry`, `marginWetHarvest`, `marginNormal` | Mean over seasons of that type, from `marginYield` (normal prices) |
| `marginSeries` | F(s) with the season type, for charts |
| `paymentsEurHa` | Payments per ha and year, eco-scheme included |

The search (`src/engine/search.ts`) compares plans on `AXES`: `marginMean`, `marginWorstFifth`, bare-soil days and cereal after cereal.

## 8. Switching steps off

`Context.moneySteps` switches single steps off, for checks and sensitivity runs:

```ts
search({ ...makeContext(), moneySteps: { fieldIndex: false } });                  // every field as the district
search({ ...makeContext(), moneySteps: { fieldIndex: false, wetHarvest: false } }); // replay without both steps
```

When `fieldIndex` or `wetHarvest` is absent from the context, the step is off. `costFactor` scales all variable costs (`pipeline/91_cost_sensitivity.ts`).

## 9. Pilot reference values

`tests/money.test.ts` and `pipeline/90_engine_check.ts` on the demo farm:

| | Usual season | Bad seasons | Wet harvest |
|---|---|---|---|
| Usual practice, both steps off | 910 | 400 | 792 |
| Usual practice, wet harvest only | 887 | 383 | 676 |
| Usual practice, both steps | 929 | 409 | 711 |
| Balanced plan, both steps | 963 | 449 | 750 |

All values in €/ha.

Single values:
- FI(F12, winter wheat) = 0.813.
- FI(F5, winter oilseed rape) = 1.115.
- FI(F11, any crop) = 1.
- Wet-harvest seasons: 2006, 2007, 2010, 2011.
- WH of winter wheat at 5.73 t/ha and 1 456 €/ha = 162 €/ha.
- Field F2, faba bean then winter wheat, season 2006: 445.7 €/ha.

## 10. Updating the inputs

| Input | How it is updated |
|---|---|
| Yields, prices, costs, season types, harvest-rain rank | `pipeline/40_weather_economics.ts` → `economics.json`, `weather.json` |
| Field index | Replace `pipeline/inputs/field-index.json` and copy it to `src/data/` |
| Rates and parameters | `PAYMENTS_2025` in `src/pilot/rules.ts`; `WET_HARVEST` and `FIELD_GROUP` in `src/pilot/economics.ts`; `REPLAY` in `src/pilot/demo.ts` |

After a change, run `npm test` and `npx tsx pipeline/90_engine_check.ts`.

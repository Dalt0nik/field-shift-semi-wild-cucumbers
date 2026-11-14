# Usual practice

How the engine builds the **Usual practice** plan, the reference every other plan is compared with: a typical farm of the area, drawn from what farms around the pilot actually sow. Code: `typicalFarm()` in `src/engine/search.ts`. Pilot model: `src/pilot/farmers.ts`. Data: `src/data/farmer-transitions.json`, built by `pipeline/26_farmer_transitions.ts`. The brief behind it is `proposals/statistical-baseline.md` of the team repository.

Until 14 November 2026 usual practice was three hand-written preference lists (the "wheat and rapeseed habit"). Those lists had no source and could never choose a legume.

## 1. The transition table

| | |
|---|---|
| Data | NMA (*Nacionalinė mokėjimo agentūra*) field declarations 2024 and 2025, via Fields of the World (CC-BY-4.0) |
| Fields | Declared fields of 2025 of at least 0.3 ha whose centre lies within 15 km of the pilot farm, the 12 pilot fields excluded. Each is matched to the 2024 field it overlaps most, if IoU ≥ 0.5 |
| Weight | Area of the 2025 field |
| Classes | Declaration classes: winter cereals, spring cereals, oats, rapeseed, pulses (*ankštiniai javai*, labelled "Early cereals" in the English column of the files), sugar beet, maize, buckwheat, fallow, grassland < 5 and > 5 years, perennial grasses, other |
| Shrinkage | `p(j | i) = (A_local(i → j) + κ · p_national(j | i)) / (A_local(i) + κ)`, κ = 300 ha. A class seen on 3 000 ha locally is 91 % local, one seen on 100 ha is 25 % local. The national table is `pipeline/inputs/transitions-national-2024-2025.csv`, from the same declarations |
| Class → crop | Sown areas of the municipality (*Vilkaviškio r. sav.*, Statistics Lithuania S9R088, `pipeline/inputs/areas.csv`), mean of 2023–2025 |

**What the build found** (calculation, `pipeline/26_farmer_transitions.ts`):
- 9 942 fields and 30 449 ha lie within 15 km; 9 173 fields and 28 676 ha of them matched (92 %).
- Farms around the pilot sow **more rapeseed and fewer legumes** than the national average:

| After | Local, 15 km | National |
|---|---|---|
| winter cereals | rapeseed 39 %, winter cereals 31 %, spring cereals 11 %, pulses 7 %, oats 4 % | rapeseed 29 %, winter cereals 23 %, pulses 15 %, spring cereals 13 %, oats 6 % |
| rapeseed | winter cereals 96 % | winter cereals 94 % |
| pulses | winter cereals 85 %, rapeseed 10 % | winter cereals 86 %, rapeseed 4 % |

Winter cereals split 93 % winter wheat, 5 % triticale, 2 % winter barley. Spring cereals split 87 % spring wheat, 13 % spring barley. Pulses split 60 % faba bean, 40 % peas.

## 2. Probability of a field option

The admissible options of a field come from stage 4 (`fieldOptions`). For each of them:

```
P(option) ∝ Π over the open plan years  p(crop | crop of the year before)
p(crop | prev) = p(class(crop) | class(prev)) × share(crop in its class), renormalised over the annual crops of the crop set
```

- The year before the first plan year is the field's crop of the decision year. History known only as a class is read as that class.
- Years that are fixed (a crop already in the ground, perennial grass that stays) have probability 1.
- Options with a catch crop get probability 0: the declarations carry no catch crops.
- Probability that falls on classes outside the crop set (maize, buckwheat, grassland, fallow, other) is dropped: the statistical farmer chooses among the crops this plan may choose from.
- **Kept mass** of a field is the share of the farmer probability that falls on options still open on the decision day. A field where no option has any probability gets every option without a catch crop with equal probability.

## 3. The typical farm

1. 2 000 statistical farms are drawn with a fixed seed, each field independently: the declarations carry no holding id.
2. Only farms that pass the farm rules are kept (`rulesFor(...).feasible`, as in the search), up to 40 000 draws. If fewer than 200 pass, the failing drawn farms are kept too and `farmers.rulesPassed` is false.
3. Every kept farm is measured with `characteristics()`, like any plan.
4. **Usual practice is the kept farm nearest to the median** on the four comparison axes, each divided by its interquartile range.

The most likely option on every field is not used: after winter cereals it would put rapeseed on every such field, a one-crop farm that nobody runs.

`SearchResult.farmers` keeps:
- the band of the statistical farms per axis (10th, 50th and 90th percentile, all values);
- the kept mass per field.

`shareBeaten(band, axis, characteristics)` says what share of the statistical farms a plan beats on one axis. The interface does not show the band yet. `pipeline/90_engine_check.ts` prints it.

## 4. Reference values

`npx tsx pipeline/90_engine_check.ts 2026-08-01 2026-11-14`; €/ha a year, margins as farm net income ([money.md](money.md), section 7a):

| | Margin | Bad seasons | S1e, days | Cereal after cereal |
|---|---|---|---|---|
| 1 Aug · usual practice (typical farm) | 307 | −132 | 156 | 36 % |
| 1 Aug · statistical farms, 10th / 50th / 90th percentile | 208 / 303 / 356 | −187 / −136 / −114 | 153 / 156 / 160 | 23 / 37 / 51 % |
| 14 Nov · usual practice (typical farm) | 276 | −148 | 155 | 38 % |
| 14 Nov · the old hand-written habit | 372 | −107 | 151 | 29 % |

How the old habit compares:
- It beat every statistical farm on margin: it always sowed rapeseed where the interval allowed and never sowed spring cereals after winter cereals.
- Its 14 Nov plan stays in `tests/money.test.ts`, where it checks the money steps.

On 1 August the highest-margin plan beats 100 % of the statistical farms on all four axes. Best for soil beats 68 % on margin and 100 % on soil.

The choices behind the table move the typical farm little (prototype of 14 Nov, gross margins before the fixes of 14 November):
- three other seeds: 852–860 €/ha;
- the local table only: 856;
- a 30 km radius: 861;
- the national table only: 824.

Which crops the card shows on single fields depends on the seed; its numbers do not.

## 5. Limits

- **One pair of years** (2024 → 2025), with that year's prices and weather.
- **Coarse classes.** Wheat, barley, rye and triticale are one class, and so are peas and beans. The split by the municipality's areas assumes that a crop's place in the rotation does not depend on which member of the class it is.
- **No holding id.** Fields of a statistical farm are drawn independently, so machinery, labour and a farm's own rotation logic are lost. The farm rules are enforced by rejection only.
- **The average farm of the area, not this farm.** The pilot fields grew faba bean (F1) and peas (F6) in 2026, more legumes than the average farm.
- **Catch crops are unknown,** so the statistical farmer sows none.

## 6. Updating

- After new declarations: put `lt-<year>.parquet` in `pipeline/local/` (or set `LT_DECLARATIONS_2024` / `LT_DECLARATIONS`), move `YEARS` in `pipeline/26_farmer_transitions.ts`, and run it. `PLAN_DATA` in `src/pilot/demo.ts` takes the last day of the data from the file.
- Then run `npm test`, `npx tsx pipeline/90_engine_check.ts` and `npx tsx pipeline/92_soil_sensitivity.ts` (it stores the usual-practice numbers the soil "?" panel quotes).

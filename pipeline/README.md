# Data pipeline

TypeScript scripts that build `src/data/` and `public/overlays/` from NASA and Lithuanian sources. Run with `npx tsx pipeline/<script>`, in order. Earth Engine needs `GEE_KEY` in `.env` (initialised without `project=`).

| Script | Output | Sources | Needs |
|---|---|---|---|
| `10_regional_package.ts` | `regional-lt.json` | `inputs/crops.yaml` (LAMMC crop guides) | — |
| `20_farm.ts` | `farm.json`, `farm-layers.json` | `inputs/farm_98984.geojson`; NMA area-monitoring layers (crops 2025–2026, erosion-sensitive land, peat); Dirv_DR10LT soil map | network |
| `25_neighbours.ts` | `neighbours.json` | NMA declarations 2025 (Parquet, see below) | local Parquet |
| `30_farm_products.ts` | `products.json`, `public/overlays/*.png` | NASA HLS L30 + S30, NASADEM (Earth Engine); `inputs/cover-model.json` | `GEE_KEY` |
| `35_scene_grid.ts` | `scene-grid.json` | NASA HLS L30 + S30, NASADEM, resampled to one 30 m grid | `GEE_KEY` |
| `40_weather_economics.ts` | `weather.json`, `economics.json` | NASA POWER daily API (GPM IMERG rain, MERRA-2 temperature); `inputs/yields.csv`, `prices.csv`, `areas.csv` | network |
| `44_imerg_halfhourly.ts` | `cache/farm_imerg_30min.json` | NASA GPM IMERG V07 half-hourly rain and liquid-phase probability at the farm, 2001–2025 (Earth Engine `NASA/GPM_L3/IMERG_V07`) | `GEE_KEY` |
| `45_hazards.ts` | `hazards.json` | the POWER download cached by `40_` | cache |
| `46_soil_climate.ts` | `soil-climate.json` | the downloads cached by `40_` and `44_`: share of the yearly erosive rain by half-month (storm EI30 from half-hourly IMERG; a daily-rain version and sensitivity variants), share of the leaching-season water surplus, typically wet harvest windows | cache |
| `47_cover_model.ts` | `inputs/cover-model.json` and its copy `cover-model.json` | NASA HLS half-month series of about 1 700 declared fields (local, see below); `soil-climate.json` | local series |
| `90_engine_check.ts` | console | engine smoke check on any decision days; exact bounds of the search; stability over seeds | — |
| `91_cost_sensitivity.ts` | console | sensitivity of the comparison to costs | — |
| `92_soil_sensitivity.ts` | console, `soil-check.json` | sensitivity of the Best-for-soil plan to how the erosivity shares are computed; the price of soil protection along the non-dominated set | — |

`src/data/cover-model.json` is a copy of `inputs/cover-model.json`; `src/data/field-index.json` is a copy of `inputs/field-index.json`. `src/data/farm-hls.json` is written by `30_farm_products.ts` (the half-month NDVI series of the 12 fields; the app cuts them at the decision day).

Order for the soil data: `40_` → `44_` → `46_` → `47_` → `92_`. Without the half-hourly cache `46_` falls back to the daily-rain shares as the base.

## Prepared inputs

These files are committed in `inputs/`. They were prepared once, by hand or with one-off scripts, and are not rebuilt by this pipeline.

| File | What it is | How it was made |
|---|---|---|
| `crops.yaml` | Crop reference for Lithuania: sowing and harvest windows, preceding-crop rules, return intervals, each with its source | Compiled from the crop guides and reviewed by hand |
| `farm_98984.geojson` | The pilot farm: 12 neighbouring declared fields around field 98984 (NMA declarations 2025) | A script that picks a cluster of neighbouring declared fields |
| `cover-model.json` | Bare-soil-equivalent days and half-month bare fractions by crop sequence, from NASA HLS cover curves of about 1 700 declared fields, seasons 2024–25 and 2025–26 | `47_cover_model.ts` of this pipeline, from the HLS field series of the prototype (local data, below). It stops if the rebuilt totals differ from the committed ones |
| `yields.csv` | Municipal crop yields, Statistics Lithuania table S9R086 | Downloaded from the SDMX service of Statistics Lithuania |
| `prices.csv` | Crop prices, Eurostat `apri_ap_crpouta`, deflated with HICP | Downloaded from the Eurostat API and deflated |
| `areas.csv` | Sown and harvested area, Statistics Lithuania S9R088 and S9R089 | Downloaded from the SDMX service of Statistics Lithuania |
| `field-index.json` | Field index of the 12 pilot fields: season peak NDVI from NASA HLS against the neighbouring fields of the same crop group within 8 km (2021, 2024–2026), the calibration β per crop group and the reliability ρ | A one-off analysis in Python: samples of declared fields across Lithuania and around the farm (NMA declarations 2024–2025, EuroCrops LT 2021, NMA layer `Heterogeniskumas_2026`), HLS season peaks through Earth Engine, calibration on municipal yields (S9R086) |

## Local files that are never committed

- `pipeline/cache/`: downloads of the scripts (HLS series per field, the POWER daily series, the IMERG half-hourly series).
- The HLS field series behind the cover model (`hls/*.json`, 14 MB, and `sample_fields.csv`): half-month NDVI of about 1 700 declared fields, downloaded once through Earth Engine in the prototype round. Put them in `pipeline/local/cover/` or set `COVER_DATA` to their folder; `47_cover_model.ts` reads them from there.
- `lt-2025.parquet` (630 MB), the NMA declarations of 2025 as published by Fields of the World: put it in `pipeline/local/` or set `LT_DECLARATIONS` to its path. Only `25_neighbours.ts` needs it.

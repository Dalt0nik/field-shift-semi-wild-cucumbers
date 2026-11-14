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
| `45_hazards.ts` | `hazards.json` | the POWER download cached by `40_` | cache |
| `90_engine_check.ts`, `91_cost_sensitivity.ts` | console | engine smoke check; sensitivity of the comparison to costs | — |

`src/data/cover-model.json` is a copy of `inputs/cover-model.json`; `src/data/field-index.json` is a copy of `inputs/field-index.json`.

## Prepared inputs

These files are committed in `inputs/`. They were prepared once, by hand or with one-off scripts, and are not rebuilt by this pipeline.

| File | What it is | How it was made |
|---|---|---|
| `crops.yaml` | Crop reference for Lithuania: sowing and harvest windows, preceding-crop rules, return intervals, each with its source | Compiled from the crop guides and reviewed by hand |
| `farm_98984.geojson` | The pilot farm: 12 neighbouring declared fields around field 98984 (NMA declarations 2025) | A script that picks a cluster of neighbouring declared fields |
| `cover-model.json` | Bare-soil-equivalent days by crop sequence, from NASA HLS cover curves of about 1 700 declared fields, seasons 2024–25 and 2025–26 | A script that builds the model from HLS cover curves of declared fields |
| `yields.csv` | Municipal crop yields, Statistics Lithuania table S9R086 | Downloaded from the SDMX service of Statistics Lithuania |
| `prices.csv` | Crop prices, Eurostat `apri_ap_crpouta`, deflated with HICP | Downloaded from the Eurostat API and deflated |
| `areas.csv` | Sown and harvested area, Statistics Lithuania S9R088 and S9R089 | Downloaded from the SDMX service of Statistics Lithuania |
| `field-index.json` | Field index of the 12 pilot fields: season peak NDVI from NASA HLS against the neighbouring fields of the same crop group within 8 km (2021, 2024–2026), the calibration β per crop group and the reliability ρ | A one-off analysis in Python: samples of declared fields across Lithuania and around the farm (NMA declarations 2024–2025, EuroCrops LT 2021, NMA layer `Heterogeniskumas_2026`), HLS season peaks through Earth Engine, calibration on municipal yields (S9R086) |

## Local files that are never committed

- `pipeline/cache/`: downloads of the scripts (HLS series per field, the POWER daily series).
- `lt-2025.parquet` (630 MB), the NMA declarations of 2025 as published by Fields of the World: put it in `pipeline/local/` or set `LT_DECLARATIONS` to its path. Only `25_neighbours.ts` needs it.

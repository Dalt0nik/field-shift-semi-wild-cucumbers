# Field Shift

Crop-rotation decision support built on NASA Earth observation data, for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data". Piloted on 12 real declared fields in Lithuania (102 ha near Vilkaviškis).

The application shows what NASA satellites see on the farm (soil cover from HLS, rain from GPM IMERG, temperature from NASA POWER, relief from NASADEM), turns it into numbers per field, and uses those numbers to compare crop plans for the next two harvests. It does not choose for the agronomist: it shows the plans, what differs between them and why.

## Run

```bash
npm install
npm run dev        # http://localhost:3002
npm test           # engine unit tests (vitest)
npm run build      # production build; needs a Node server because of the assistant route
npm run shots      # screenshots of every state at 1100, 1280 and 1600 px, and a fit report (needs npm run dev)
```

TypeScript on Node 24, Next.js 16, React 19, MapLibre GL. The engine runs in the browser; the search for plans runs in a Web Worker. The only server code is `/api/assistant`.

Copy `.env.example` to `.env`. `GEE_KEY` is needed only to rebuild the data (`pipeline/`); `ANTHROPIC_API_KEY` only for the assistant chat. Every screen works without both.

## Layout

| Path | Contents |
|---|---|
| `src/engine/` | The planning logic, independent of the interface: `plan.ts` (field timelines, free slots, candidate crops), `search.ts` (search for farm plans, comparison), `characteristics.ts` (what each plan is measured on), `editor.ts` (the agronomist's own plan), `explain.ts` (plain-language reading of a plan) |
| `src/pilot/` | Everything bound to the Lithuanian pilot: `regional.ts` (crop reference), `rules.ts` (EU farm-payment conditions with the thresholds that apply in Lithuania, payment rates), `demo.ts` (the farm, the plan set-up, the replayed seasons) |
| `src/data/` | Inputs of the pilot farm, all built by `pipeline/` |
| `src/app/` | One folder per screen, `api/assistant/route.ts`, `globals.css` (the design system) |
| `src/components/` | Frame, store, map, timeline, charts, 30 m grid, glossary, chat, small building blocks (`ui.tsx`) |
| `pipeline/` | Scripts that build `src/data` from NASA and Lithuanian sources: [pipeline/README.md](pipeline/README.md) |
| `tests/` | Unit tests of the engine and of the plan editor |
| `scripts/shots.mjs` | Screenshots of every state and the fit report (`screenshots/`, not committed) |

## Screens

| Group | Screen | What it does |
|---|---|---|
| Farm | Map | Declared fields around the farm, satellite image, the farm's fields |
| Farm | Fields | What grows now (editable), with a satellite hint for autumn sowing; field timelines and free slots |
| NASA data | Satellite | One layer as 30 m pixels and numbers per field; two layers side by side with a pixel inspector |
| NASA data | Analytics | When fields are bare (HLS); which months are risky (IMERG, POWER); risk zones; the method behind each number |
| Plan | Crops | Crops the farm can grow, catch crops, limits |
| Plan | Planner | Suggested plans, comparison, the agronomist's own plan, "Choose this plan" and the sowing list |
| Plan | Checks | The farm rules applied to a plan |

Tabs and views are in the URL (`/planner?tab=compare`, `/analytics?tab=zones&view=dry`), so every state can be linked and photographed.

## What is real and what is not

- Real: field boundaries, crops 2024–2026, satellite series, weather, yields, prices, payment rates, the erosion-sensitive and peat layers.
- Preset: which crops are in the ground on 14 November 2026 and the crop set.
- Illustrative: variable costs per crop (no open source exists for Lithuania); preceding-crop yield factors (literature).
- The farm is 12 neighbouring declared fields, not one real holding: open declarations carry no farm identifier.
- The application is limited to the preloaded farm: drawing arbitrary fields is not supported.

## Data and licences

The sources of every data file are listed per script in [pipeline/README.md](pipeline/README.md). Two inputs committed here come from services that carry no explicit licence text: the erosion-sensitive and peat layers of the Lithuanian paying agency (in `src/data/farm.json`, `src/data/farm-layers.json`) and the soil map of the National Land Service (soil fields in `src/data/farm.json`).

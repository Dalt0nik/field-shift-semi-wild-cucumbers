# Instructions for agents and the team

## Repository

- This is the application code of Field Shift. Start with [README.md](README.md); the data build is in [pipeline/README.md](pipeline/README.md).
- Write in English. Keep Lithuanian names and terms in the original, in parentheses, at least on first use.
- `src/engine/` holds logic only. Anything bound to the Lithuanian pilot (crop reference, rule thresholds, payment rates, the farm, years) belongs in `src/pilot/` or `src/data/`.
- Downloads stay in `pipeline/cache/` and `pipeline/local/` and are never committed. `.env` is never committed.

## Commits

- Commit messages and pull-request descriptions carry **no** "Co-Authored-By: Claude" trailer and no "Generated with Claude Code" line, whatever the tool's default is.
- Do not commit or push unless the owner asks.

## Focus

- The centre of the application is the NASA satellite data: what they show on the farm and how they change the plan. Keep the NASA source of a number with it, as a small source line in its explanation, not in the text of the screen.
- The farm rules stay quiet: one Checks screen, plain rule names, no legal text in the frame, and no wording that suggests a rule set is chosen or loaded.

## The decision day

- The demo replays one decision day: `DECISION_DATE` in `src/pilot/demo.ts`. Nothing else may name a date of the demo: derive it (plan years, what is in the ground, texts, which satellite data count as known).
- The plan uses only data from before the decision day. A new dataset behind the plan gets a line in `PLAN_DATA` with its last day; data observed later may be shown only with the label "after the decision day — not used by the plan".
- After touching anything date-bound: `npm test` (it runs the engine on nine days), and look at the app on a second day with `npm run check:day -- 2026-11-14`.

## Soil numbers

- Every soil number has a definition, data and a source with its status in `src/pilot/soil.ts` and in the "?" panel (`src/components/Soil.tsx`); the specification is [docs/soil.md](docs/soil.md). A number from a publication appears in the app only after the publication was read in the original.
- No composite soil score, no weights between the measures, no tonnes per hectare. Do not write "erosion rate" for the app's own measure, "compliant with the Soil Monitoring Law", "sustainability score" or "first in the world".

## Interface

- One design system: `src/app/globals.css` and `src/components/ui.tsx`. No native dropdowns.
- Everything must fit at the regular desktop width, 1280 px. Other widths are not checked and not photographed, unless the owner asks.
- `npm run shots` runs once at the end of a working session, not after each fix: it is slow. A single fix is checked in the running app.
- Write for a farmer who is wary of technology and dashboards. On screen: plain words, no product names (HLS, IMERG), no indices (NDVI), no codes (soil classes), no results of our tests or accuracy figures; those stay in `docs/`, the "?" panel of the soil numbers and the assistant. An explanation of a term is plain too: no other technical term inside it, the data named only in its small source line (`source` in `glossary.ts`). Apply this to every screen you touch.
- There is no glossary screen. A term of the vocabulary (`src/components/glossary.ts`) is explained where it stands: wrap its first mention in each panel, card, table or note in `<Term>` (`src/components/ui.tsx`), which underlines it and shows the explanation on hover or focus.
- Every state has an address (tabs and views are in the URL).

## Google Earth Engine

- The key path comes from `GEE_KEY` in `.env` (template: `.env.example`); the key itself stays outside any repository.
- Authorise without `project=`. With an explicit project it fails with `Caller does not have required permission to use project`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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

- The centre of the application is the NASA satellite data: what they show on the farm and how they change the plan. Name the NASA source where its number is used.
- The farm rules stay quiet: one Checks screen, plain rule names, no legal text in the frame, and no wording that suggests a rule set is chosen or loaded.

## Interface

- One design system: `src/app/globals.css` and `src/components/ui.tsx`. No native dropdowns.
- Everything must fit at 1280 px and narrower: run `npm run shots` and look at the pictures before saying it works.
- Every state has an address (tabs and views are in the URL).

## Google Earth Engine

- The key path comes from `GEE_KEY` in `.env` (template: `.env.example`); the key itself stays outside any repository.
- Authorise without `project=`. With an explicit project it fails with `Caller does not have required permission to use project`.

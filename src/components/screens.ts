// What each screen shows and why it is built that way. One source for three uses: the assistant knows where the
// user is and can explain the reasoning behind the screen; the chat offers questions that fit the screen; and the
// notes are a compact record of the design decisions of this experiment.
// Dates and years come from the decision day of the demo (src/pilot/demo.ts), so the notes stay true when it moves.
import { DECISION_DATE, DECISION_YEAR, PLAN_YEARS, REPLAY, niceDate } from '@/pilot/demo';

export interface ScreenNote { title: string; shows: string; why: string; ask: string[] }
const Y = DECISION_YEAR, DAY = niceDate(DECISION_DATE), H = PLAN_YEARS.join(' and ');

export const SCREENS: Record<string, ScreenNote> = {
  map: {
    title: 'Map',
    shows: `A map of all declared fields around the farm (paying agency declarations of 2025, coloured by crop class), the fields of the organization with a dark outline, and optional layers: a NASA HLS satellite image and the official rule layers (erosion-sensitive land, peat). Clicking a field opens a card with its crops of ${Y - 2}–${Y} and area. A layer observed after the decision day (${DAY}) carries the label “after the decision day — not used by the plan”.`,
    why: 'A plan must cover the whole farm, because some rules are checked across all fields together. Open declarations carry no owner, so the user assembles their own holding from declared fields or draws a boundary. Open data lag about a year, which is why the map shows last year’s declarations. In the demo the farm is preloaded and adding fields is switched off, because satellite products are precomputed only for these 12 fields. The demo replays the decision of one day, so later satellite data may be shown but never used.',
    ask: ['How would I add my own farm here?', 'Why does the map show last year’s crops?', 'What are the red and purple areas?'],
  },
  'organization/fields': {
    title: 'Fields · On the fields now',
    shows: `The fields of the farm on the decision day, ${DAY}: the crop of ${Y} on each field (a dropdown, pre-filled from the paying agency’s layer), whether it still stands, is being harvested or is harvested, and, once winter sowing has started, what is already sown for ${PLAN_YEARS[0]}. A card shows the selected field: its history, how it yields against its neighbours, and what NASA HLS saw on it before the decision day.`,
    why: 'What is on the fields on the decision day decides which fields are free and when; no open source knows it, so the agronomist confirms it. The satellite only supports the entry: early-spring greenness (NASA HLS) tells a winter crop or grass from a spring-sown crop, and in our test on about 1 350 declared fields it was right for 65–85 % of fields, which is not good enough to decide. Fields that are already sown for the next harvest are fixed in every plan; everything else is open.',
    ask: ['Why do I have to confirm the crops myself?', 'How reliable is the satellite hint?', 'What happens if I change a crop here?'],
  },
  'organization/timelines': {
    title: 'Fields · Field timelines',
    shows: `One row per field on a time axis ${Y - 2}–${PLAN_YEARS[PLAN_YEARS.length - 1]}: past crops, the crop of ${Y}, anything already sown for ${PLAN_YEARS[0]}, the decision day as a line, and dashed boxes for the free slots that the plan must fill.`,
    why: 'A field is planned as a timeline of slots, not as one crop per year: winter crops, spring crops and catch crops are all just occupied intervals. A crop is a candidate for a slot only if its sowing window fits after the previous harvest and after the decision day, and it is harvested before the next crop.',
    ask: ['What is a free slot?', 'When does each field become free?', 'Where do the past crops come from?'],
  },
  settings: {
    title: 'Crops and limits',
    shows: 'The crops the farm can grow with their sowing and harvest months (tick to include), a switch for catch crops, the limits (fields already in the ground, crops banned on a field by the user, restrictions coming from rules).',
    why: 'Constraints are hard: a plan that breaks one is never shown and they are never traded against money. The crop set reflects machinery, storage and contracts, which the tool does not model. The rules are the EU farm-payment conditions as they apply in Lithuania. Costs are illustrative because no open per-crop cost source exists for Lithuania, so a slider shows whether the comparison survives a cost error.',
    ask: ['What changes if I untick a crop?', 'Why are limits never traded off against money?', 'Where do the sowing months come from?'],
  },
  'scenes/scene': {
    title: 'Satellite · One layer',
    shows: 'One satellite or terrain layer drawn as 30 m pixels over the farm, with a table of numbers per field (median, low and high value, number of pixels). Layers: NDVI at peak season of two years, NDVI of a later autumn, how often a pixel is bare in early spring, slope, height relative to the surroundings. A layer observed after the decision day is labelled so and is not used by the plan.',
    why: 'NASA data enter the plan through products, not directly: a layer becomes a number per field. All layers are resampled to one 30 m grid (the HLS grid), so they can be compared at the same pixel. A large spread inside a field is a reason to walk there; 30 m pixels do not show the cause.',
    ask: ['What does NDVI tell me about a field?', 'Why 30 m pixels?', 'What does a high spread inside a field mean?'],
  },
  'scenes/compare': {
    title: 'Satellite · Compare two',
    shows: 'Two layers side by side with linked views. Clicking a pixel opens an inspector with the value of every layer at that point, plus the coarse weather values (rain, water balance, frost) of the cell that covers it.',
    why: 'Weather layers are coarse (one cell of 10–50 km), so they have the same value for every field of the farm; the inspector says so instead of pretending to field-level detail. Fine layers (30 m) show differences inside and between fields.',
    ask: ['Why is the rain value the same for all my fields?', 'What can I learn from comparing two years?', 'Which layers are fine and which are coarse?'],
  },
  'analytics/bare': {
    title: 'Analytics · Bare soil and rain',
    shows: `A calendar: for each field and half-month, in what share of the years 2016–${Y} the field was mostly bare (NASA HLS, as seen up to the decision day), and the usual number of days without living cover a year. Below it two charts for the farm: when in the year rain is erosive (NASA GPM IMERG) and when water drains through the soil (IMERG and POWER), each with the bare-soil curves of four crop sequences.`,
    why: 'The challenge asks to show when fields are typically bare. Bare soil is what erodes and loses nitrogen, and it is the one thing the satellite measures directly per field. But a bare day in July, under summer storms, is not a bare day in January: so the plan measure weighs each half-month by its share of the year’s erosive rain, the way erosion models weight crop cover. Winter months have almost no clear satellite views, so they are hatched rather than guessed; they carry little of the erosive rain. Stubble is not visible to the satellite.',
    ask: ['How is “bare” decided from the satellite?', 'Why weigh bare days by erosive rain?', 'Why are winter months hatched?'],
  },
  'analytics/weather': {
    title: 'Analytics · Weather risk',
    shows: 'A calendar: for each month, in what share of the years 2001–2025 a weather hazard occurred at the farm (frost, deep cold, heat, dry month, heavy rain, wet spell), and under it the sowing and harvest months of the crops of the selected plan.',
    why: 'The challenge asks which seasons make crops vulnerable. Rain comes from NASA GPM IMERG and temperature from NASA POWER; both are one coarse cell, the same for every field. A hazard month under a sowing or harvest month is a vulnerable season. Thresholds are working values to be set with an agronomist.',
    ask: ['Which months are most risky for spring crops here?', 'Why is the weather the same for all my fields?', 'How were the thresholds chosen?'],
  },
  'analytics/zones': {
    title: 'Analytics · Risk zones',
    shows: 'A map with one of three views: erosion-sensitive land (official layer) with how long each plan leaves it without cover, counted by erosive rain; low spots where cold air and water collect (NASADEM); dry seasons, with a chart of the May–July water balance by year and a slider that makes dry seasons more frequent to see how each plan’s margin responds.',
    why: 'Erosion uses the paying agency’s official layer because NASADEM slope agreed with it on only 36 % of the cropland it marked steeper than 12 %. The “what if” re-weights past seasons in the replay; it does not invent a new climate. Dry seasons type the past seasons; they do not forecast yield.',
    ask: ['Why not use the NASA elevation model for erosion?', 'What does the dry-season slider actually change?', 'How is a dry season defined?'],
  },
  'analytics/method': {
    title: 'Analytics · Method',
    shows: 'How each characteristic of a plan is built and how it was checked on Lithuanian data, the soil measures included; the NDVI season profile of a field; the yield ranges the replay uses; the days without cover by crop sequence; and the methods that were tested and not used.',
    why: 'Every characteristic was kept only after a check on real data, and methods that failed are listed rather than hidden: soil-moisture products showed no link to yields, autumn greenness is only a hint, crop residue could not be told from ploughed soil, a field-level yield model cannot be verified without field yields.',
    ask: ['How was the margin range checked?', 'How were the soil numbers checked?', 'How far can I trust these yields for my farm?'],
  },
  rules: {
    title: 'Plan checks',
    shows: 'The rule checks of the selected plan, one line per rule with pass or fail; the text of the rule and the numbers behind it open on a click. The map shows the plan’s crops and the rule layers.',
    why: 'Rules are a filter and a part of income, not the goal: they bound what can be planned, the choice inside the bounds is the agronomist’s. They are the EU farm-payment conditions as they apply in Lithuania and follow three templates (sequence on a field, farm share over a period, applicability). Strict mode treats payment conditions as prohibitions. For Lithuania the winter-cover rule counts unploughed stubble, so it limits autumn ploughing rather than crop choice. The rule counts what is declared; the soil block of the Planner measures what actually covers the soil.',
    ask: ['Why does the winter-cover rule pass here?', 'Which rule can change what I sow?', 'What does strict mode mean?'],
  },
  'planner/variants': {
    title: 'Planner · Suggested plans',
    shows: `Cards for usual practice and for the best plan found for each measure: highest margin, best in the worst year of five, best for soil, balanced. Every card shows money and a soil-protection block (days without cover weighted by erosive rain, days without living cover, crop families, cereal after cereal); the Best-for-soil card adds its price in days and €/ha against usual practice and against the highest margin. A “?” opens how the soil numbers are calculated, with sources. On the small maps only the fields sown differently from usual practice are coloured. Below the cards: the selected plan as a sowing list for the harvests of ${H}, why it was suggested, all six soil measures next to usual practice with a switch for the straw assumption, and, one click away, evidence, gaps and risks, how it would have done in each past season ${REPLAY.firstSeason}–${REPLAY.lastSeason}, and the plan on the field timelines. A button chooses the plan.`,
    why: 'The system does not rank the plans and has no priority weights: it shows the best plan for each measure and lets the agronomist choose. Soil protection is measured, not assumed: the farm rules count what is declared, the satellite measures what covers the soil, so every plan is measured on three of the four soil-health principles (cover, living roots, diversity) from NASA data, with six numbers and no overall score. Tillage cannot be seen from space, and the screen says so. The search keeps only plans that pass the farm rules and that no other plan beats on all four comparison measures at once. Usual practice is shown because the challenge asks to compare with the existing rotation. Money is a replay of past seasons, so the spread is visible. A crop chosen now closes some crops later through return intervals.',
    ask: ['Why is there no single recommended plan?', 'What does the Best-for-soil plan cost, and why?', 'How are the soil numbers calculated?'],
  },
  'planner/mine': {
    title: 'Planner · My own plan',
    shows: 'The agronomist’s own plan. A list of fields with their crops, a small map, and for the selected field every crop of the crop set with a mark (fits, allowed with a warning, not admissible) and the reason, and a catch crop before a spring crop where it still fits. A live check at the top re-measures the whole farm after each change: rules, money, days without cover weighted by erosive rain, humus balance.',
    why: 'The tool supports the agronomist’s decision and does not replace it: an own plan is measured with exactly the same characteristics as the suggested variants, and every option is checked against sowing windows, preceding crops, return intervals and the rules before it is picked.',
    ask: ['Why is this crop not allowed on this field?', 'What do the warnings mean?', 'How is my plan measured?'],
  },
  'planner/compare': {
    title: 'Planner · Compare',
    shows: 'A table of plans on the same measures, money first and then the soil measures, with the best value in each row marked and a Choose button per plan; the fields on which two plans differ, with what the difference changes; a chart of all plans (margin against days without cover weighted by erosive rain), which shows the price of soil protection; and a slider that tests the cost assumption.',
    why: 'There is no weighted score on purpose: weights hide the trade-off and suggest precision the data do not have. The agronomist orders the plans by any one characteristic. The chart shows that the first days of extra cover cost little and the last ones cost a lot, so the plan with the very lowest number is not the only reasonable choice for the soil. A plan that is beaten on all four comparison characteristics may still be right for reasons the tool does not see.',
    ask: ['Why is there no overall score?', 'What does “beaten by another plan” mean?', 'Which differences here are too small to matter?'],
  },
};

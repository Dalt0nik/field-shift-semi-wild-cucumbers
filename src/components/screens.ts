// What each screen shows and why it is built that way. One source for three uses: the assistant knows where the
// user is and can explain the reasoning behind the screen; the chat offers questions that fit the screen; and the
// notes are a compact record of the design decisions of this experiment.
// Dates and years come from the decision day of the demo (src/pilot/demo.ts), so the notes stay true when it moves.
import { DECISION_DATE, DECISION_YEAR, PLAN_YEARS, niceDate } from '@/pilot/demo';

export interface ScreenNote { title: string; shows: string; why: string; ask: string[] }
const Y = DECISION_YEAR, DAY = niceDate(DECISION_DATE), H = PLAN_YEARS.join(' and ');

export const SCREENS: Record<string, ScreenNote> = {
  map: {
    title: 'Map',
    shows: `A map of all declared fields around the farm (paying agency declarations of 2025, coloured by crop class), the fields of the organization with a dark outline, and an optional layer with the official risk zones (erosion-sensitive land, peat). The side panel has one section per layer, "Neighbours’ crops, harvest 2025" and "Risk zones", each with an eye icon that shows or hides it (the first one only the neighbours; the farm keeps its colours), its legend and its data source, and a note that adding fields is switched off in the demo. Clicking a field opens a card with its crops of ${Y - 2}–${Y} and area. What the NASA data show about the fields is on the Analytics screen.`,
    why: 'A plan must cover the whole farm, because some rules are checked across all fields together. Open declarations carry no owner, so the user assembles their own holding from declared fields or draws a boundary. Open data lag about a year, which is why the map shows last year’s declarations. In the demo the farm is preloaded and adding fields is switched off, because satellite products are precomputed only for these 12 fields. The demo replays the decision of one day, so later satellite data may be shown but never used.',
    ask: ['How would I add my own farm here?', 'Why does the map show last year’s crops?', 'What are the red and purple areas?'],
  },
  'organization/fields': {
    title: 'Fields · Previous season',
    shows: `The previous season on each field of the farm, seen on the decision day, ${DAY}: a short count of fields that are harvested, being harvested, not yet harvested or in grass; a table with the previous crop of each field (the crop of ${Y}, a dropdown pre-filled from the paying agency’s crop monitoring) and when the field is free for the next crop (the end of the crop’s usual harvest window, not an observation), or, once winter sowing has started, what is already sown for ${PLAN_YEARS[0]}. A card shows the selected field: its last three crops, how it yields against its neighbours, and what the satellite saw on it in early spring; "More about this field" has slope, erosion-sensitive land and peat.`,
    why: 'What is on the fields on the decision day decides which fields are free and when; no open source knows it, so the agronomist confirms it. The satellite only supports the entry: early-spring greenness (NASA HLS) tells a winter crop or grass from a spring-sown crop, and in our test on about 1 350 declared fields it was right for 65–85 % of fields, which is not good enough to decide. Fields that are already sown for the next harvest are fixed in every plan; everything else is open.',
    ask: ['Why do I have to confirm the crops myself?', 'How reliable is the satellite hint?', 'What happens if I change a crop here?'],
  },
  'organization/timelines': {
    title: 'Fields · Field timelines',
    shows: `One row per field on a time axis ${Y - 2}–${PLAN_YEARS[PLAN_YEARS.length - 1]} with years and months: past crops, the crop of ${Y}, anything already sown for ${PLAN_YEARS[0]}, the decision day as a line, and dashed boxes for the free slots that the plan must fill (the harvests of ${PLAN_YEARS.join(' and ')}). Each crop bar runs from the start of its sowing window to the end of its harvest window; the two windows are the pale ends, so where one crop is harvested in the weeks the next is sown, only the pale ends overlap.`,
    why: 'A field is planned as a timeline of slots, not as one crop per year: winter crops, spring crops and catch crops are all just occupied intervals. A crop is a candidate for a slot only if its sowing window fits after the previous harvest and after the decision day, and it is harvested before the next crop.',
    ask: ['What is a free slot?', 'When does each field become free?', 'Where do the past crops come from?'],
  },
  settings: {
    title: 'Crops and limits',
    shows: 'The crops the farm can grow with their sowing and harvest months (tick to include), a switch for catch crops, the limits (fields already in the ground, crops banned on a field by the user, restrictions coming from rules).',
    why: 'Constraints are hard: a plan that breaks one is never shown and they are never traded against money. The crop set reflects machinery, storage and contracts, which the tool does not model. The rules are the EU farm-payment conditions as they apply in Lithuania. Costs are illustrative because no open per-crop cost source exists for Lithuania, so a slider shows whether the comparison survives a cost error.',
    ask: ['What changes if I untick a crop?', 'Why are limits never traded off against money?', 'Where do the sowing months come from?'],
  },
  'analytics/bare': {
    title: 'Analytics · Bare soil and rain',
    shows: `A calendar: for each field and half-month, in what share of the years 2016–${Y} the field was mostly bare (NASA HLS, as seen up to the decision day), and the usual number of days without living cover a year. Below it two month charts for a field left bare from the cereal harvest to spring sowing, in per cent: the share of the year’s heavy (erosive) rain that falls on bare soil (NASA GPM IMERG erosivity × HLS cover), and the share of the autumn-winter drainage water that drains through bare soil (IMERG and POWER). The months add up to the yearly share. The worst months are named and highlighted; hovering a month gives its share, how much of the rain comes in that month and how bare the field is then; a line says how far a catch crop in autumn lowers the yearly share. These are the plan's soil measures divided by 365 (or by the days of the leaching season): split by month, a "days" unit would exceed the month's length. The four-sequence chart behind the measure is in the "?" panel.`,
    why: 'The challenge asks to show when fields are typically bare. Bare soil is what erodes and loses nitrogen, and it is the one thing the satellite measures directly per field. But a bare day in July, under summer storms, is not a bare day in January: so the plan measure weighs each half-month by its share of the year’s erosive rain, the way erosion models weight crop cover. Winter months have almost no clear satellite views, so they are hatched rather than guessed; they carry little of the erosive rain. Stubble is not visible to the satellite.',
    ask: ['How is “bare” decided from the satellite?', 'Why weigh bare days by erosive rain?', 'Why are winter months hatched?'],
  },
  'analytics/weather': {
    title: 'Analytics · Weather risk',
    shows: 'Two panels on one half-month grid. "The weather at the farm": for each month, in how many years of 10 (2001–2025) frost, hard frost, heat, a dry month, a downpour and a rainy spell came. "When can the weather hurt your crops?": the sowing, harvest and (for winter crops) winter windows of the crops of the selected plan, by half-month, so a window across a month border shows on both sides. A window that meets bad weather in at least 3 years of 10 is outlined (solid from 6 years of 10, dashed below) and can be clicked; a popup next to it then says, for that crop and moment, how many years in 10 each kind of weather came and what it does (e.g. frost at April sowing can kill young plants).',
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
    shows: `Cards for the typical local plan and for the best plan found for each measure: highest margin, best in the worst year of five, best for soil, balanced. Every card shows money and the soil health score (0–100, bigger is better, with a band low / medium / high) with the points of its three parts: soil cover, crop variety, organic matter. The Best-for-soil card is green and carries an EU flag with a note on the EU Soil Monitoring Law. “Soil health score” opens a panel that explains in plain words how the score is counted, with sources. On the small maps only the fields sown differently from the typical local plan are coloured. Below the cards: the selected plan as a sowing list for the harvests of ${H} (crops sown differently from the typical local plan in bold) and the same plan on the field timelines, past seasons and planned ones, with catch crops over winter. A click on a card chooses that plan; a button opens it in the Custom plan tab to change it field by field. A small list under the cards names the sources: NASA satellites and local data.`,
    why: 'The system does not rank the plans and has no priority weights: it shows the best plan for each measure and lets the agronomist choose. Soil protection is measured, not assumed: the farm rules count what is declared, the satellite measures what covers the soil, so every plan gets a soil health score: the average of three parts that count the same, soil cover (bare soil under heavy rain, from NASA HLS and GPM IMERG), crop variety and organic matter (humus balance). Each part is scaled from the weakest tenth of local farms (0) to the best plan found (100). No source says which part matters more, so the weights are equal and stated. Best for soil is the highest score; plans within 3 points of the top count as equal and the highest margin among them wins. Tillage cannot be seen from space, and the panel says so. The search keeps only plans that pass the farm rules and that no other plan beats on all four comparison measures at once. Typical local plan is shown because the challenge asks to compare with the existing rotation; it is a typical farm of the area, drawn from what farms around the pilot sowed after each crop in the field declarations, not a habit the team wrote down. Money is a replay of past seasons, so the spread is visible. A crop chosen now closes some crops later through return intervals.',
    ask: ['Why is there no single recommended plan?', 'What does the Best-for-soil plan cost, and why?', 'How are the soil numbers calculated?'],
  },
  'planner/custom': {
    title: 'Planner · Custom plan',
    shows: 'The custom plan: one copy of the typical local plan or a suggested plan that the agronomist changes field by field. Save puts it as a card next to the suggested plans and as a column in Compare; Delete removes it. A list of fields with their crops, a small map, and for the selected field every crop of the crop set with a mark (fits, allowed with a warning, not admissible) and the reason, and a catch crop before a spring crop where it still fits. A live check at the top re-measures the whole farm after each change: rules, money, days without cover weighted by erosive rain, humus balance.',
    why: 'The tool supports the agronomist’s decision and does not replace it: the custom plan is measured with exactly the same characteristics as the suggested plans, and every option is checked against sowing windows, preceding crops, return intervals and the rules before it is picked.',
    ask: ['Why is this crop not allowed on this field?', 'What do the warnings mean?', 'How is the custom plan measured?'],
  },
  'planner/compare': {
    title: 'Planner · Compare',
    shows: 'A table of the suggested plans, the typical local plan and the custom plan (once started) on the same measures, money first and then the soil measures, with the best value in each row marked, a click on a row ordering the plans by it, and a Choose button per plan (choosing a plan is the same as selecting it).',
    why: 'There is no weighted score on purpose: weights hide the trade-off and suggest precision the data do not have. The agronomist orders the plans by any one characteristic. A plan that is beaten on all four comparison characteristics may still be right for reasons the tool does not see.',
    ask: ['How is the soil health score counted?', 'What does “beaten by another plan” mean?', 'Which differences here are too small to matter?'],
  },
};

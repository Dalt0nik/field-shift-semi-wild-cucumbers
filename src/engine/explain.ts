// Plain-language reading of a plan, assembled from the engine's own numbers (challenge R3: why it was suggested,
// evidence, benefits, gaps, risks). Nothing here is generated text: every sentence is a template filled from stage 6.
import { fieldFactor, type OptionPart } from './characteristics';
import type { Workspace } from './editor';
import { CROPS, cropLabel } from '../pilot/regional';
import type { EvaluatedVariant } from './types';

const TAG_WHY: Record<string, string> = {
  'best: margin, usual season': 'It has the highest margin in a usual season among the admissible variants that were found.',
  'best: margin, bad seasons': 'It keeps the highest margin in the worst fifth of past seasons.',
  'best: bare soil': 'It leaves the soil bare for the fewest days.',
  'best: cereal after cereal': 'It has the smallest area where a cereal follows a cereal.',
  balanced: 'It is not the best on any one measure, but it is never the worst: its weakest measure is better than the weakest measure of any other plan.',
  'current practice': 'It continues the wheat and rapeseed habit of the region on every field that is still open. It is shown for comparison, as the challenge asks.',
};
const signed = (v: number, unit: string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)} ${unit}`;
const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / (a.length || 1);

export interface FiveAnswers { why: string; evidence: string; benefits: string; gaps: string; risks: string }

export function fiveAnswers(v: EvaluatedVariant, base: EvaluatedVariant, ws: Workspace): FiveAnswers {
  const years = ws.ctx.setup.planYears;
  const diff = v.options.filter((o, i) => o.crops.join() !== base.options[i].crops.join() || o.catchAfter.join() !== base.options[i].catchAfter.join());
  const moves = diff.slice(0, 3).map(o => `${o.fieldId}: ${o.crops.map((c, i) => `${years[i]} ${CROPS[c].name}${i > 0 && o.catchAfter[i - 1] ? ' after a catch crop' : ''}`).filter((_, i) => !o.fixed[i]).join(', ')}`);
  const why = v.id === base.id ? TAG_WHY['current practice']
    : `${v.tags.map(t => TAG_WHY[t]).filter(Boolean).join(' ') || (v.origin === 'agronomist' ? 'This is your own plan; the system only checks and measures it.' : 'One of the variants that no other variant beats on all four comparison characteristics at once.')} It differs from usual practice on ${diff.length} of ${v.options.length} fields${moves.length ? ` (${moves.join('; ')}${diff.length > 3 ? '; …' : ''})` : ''}.`;
  const estCrops = [...new Set(v.options.flatMap(o => o.crops))].filter(c => CROPS[c].sowing.status !== 'primary' || CROPS[c].harvest.status !== 'primary').map(c => CROPS[c].name);
  const d = (a: number, b: number) => Math.round(a - b);
  const benefits = v.id === base.id ? `Familiar crops and machinery. Margin ${v.ch.marginMean} €/ha in a usual season, ${v.ch.bareDays.p50} bare-soil days a year.`
    : [`Usual-season margin ${signed(d(v.ch.marginMean, base.ch.marginMean), '€/ha')} against usual practice`, `worst-fifth margin ${signed(d(v.ch.marginWorstFifth, base.ch.marginWorstFifth), '€/ha')}`,
      `bare soil ${signed(d(v.ch.bareDays.p50, base.ch.bareDays.p50), 'days a year')}`, `cereal after cereal ${Math.round(v.ch.cerealAfterCereal * 100)} % of area (usual practice ${Math.round(base.ch.cerealAfterCereal * 100)} %)`,
      `payments ${v.ch.paymentsEurHa} €/ha`].join('; ') + '.';
  const dry = v.ch.marginDry !== null && v.ch.marginNormal !== null ? `In dry seasons the margin at normal prices was ${v.ch.marginDry} €/ha against ${v.ch.marginNormal} in ordinary ones (${v.ch.marginDryN} seasons).` : '';
  const failed = v.ch.rules.filter(r => !r.ok && r.kind !== 'incentive');
  return {
    why,
    evidence: `Margin: each crop replayed through the seasons ${ws.pre.seasons[0]}–${ws.pre.seasons[ws.pre.seasons.length - 1]} (municipal yields of Statistics Lithuania, Eurostat prices, 2025 payment rates). Field index: each field against its neighbours with the same crop, from NASA HLS season peak greenness 2021–2026. Season types: NASA GPM IMERG rain and NASA POWER temperature; in wet-harvest seasons extra drying and feed-grade wheat are taken off. Bare soil: NASA HLS cover curves of 1 700 declared fields, by crop sequence. Rules: orders 3D-107 and 3D-92.`,
    benefits,
    gaps: `Variable costs are illustrative, not this farm's. Yields are municipal averages times the field index, which is calibrated on districts, not on this farm's harvests. Wet-harvest moisture and feed share are estimates. Stubble and residues are not visible to the satellite.${estCrops.length ? ` Sowing or harvest windows are estimates for: ${estCrops.join(', ')}.` : ''} Pests and diseases enter only as "cereal after cereal".`,
    risks: `${failed.length ? `Fails ${[...new Set(failed.map(r => r.title))].join(' and ')}: payments are at risk. ` : ''}Worst replayed seasons: ${v.ch.worstSeasons.map(s => `${s.season} (${s.margin} €/ha)`).join(', ')}. ${dry} ${v.ch.softWarnings ? `${v.ch.softWarnings} agronomic warning${v.ch.softWarnings > 1 ? 's' : ''} (late sowing, short intervals) to check on the farm.` : ''}`.trim(),
  };
}

export interface FieldDiff { fieldId: string; areaHa: number; a: string; b: string; reason: string }
const describe = (o: { crops: string[]; catchAfter: boolean[]; fixed: boolean[] }, years: number[]) => o.crops.map((c, i) => `${years[i]} ${cropLabel(c)}${i > 0 && o.catchAfter[i - 1] ? ' + catch crop' : ''}`).join(' → ');

/** Where two plans differ, field by field, and what the difference changes on that field (from the field-level parts of stage 6). */
export function planDiff(a: EvaluatedVariant, b: EvaluatedVariant, ws: Workspace): FieldDiff[] {
  const years = ws.ctx.setup.planYears;
  const part = (fi: number, o: EvaluatedVariant['options'][number]): OptionPart | null => { const k = ws.fields[fi].options.findIndex(x => x.crops.join() === o.crops.join() && x.catchAfter.join() === o.catchAfter.join()); return k < 0 ? null : ws.fields[fi].parts[k]; };
  const out: FieldDiff[] = [];
  a.options.forEach((oa, fi) => {
    const ob = b.options[fi];
    if (oa.crops.join() === ob.crops.join() && oa.catchAfter.join() === ob.catchAfter.join()) return;
    const f = ws.fields[fi].field, pa = part(fi, oa), pb = part(fi, ob);
    const bits: string[] = [];
    if (pa && pb) {
      const dm = Math.round((mean(pb.margin) - mean(pa.margin)) / f.areaHa), dw = Math.round((Math.min(...pb.margin) - Math.min(...pa.margin)) / f.areaHa), db = Math.round((pb.bare[1] - pa.bare[1]) / f.areaHa);
      if (Math.abs(dm) >= 5) bits.push(`${signed(dm, '€/ha')} in a usual season`);
      if (Math.abs(dw) >= 10) bits.push(`${signed(dw, '€/ha')} in the worst season`);
      if (Math.abs(db) >= 3) bits.push(`${signed(db, 'bare days')}`);
      if (pa.cerealAfterCereal > 0 !== pb.cerealAfterCereal > 0) bits.push(pb.cerealAfterCereal > 0 ? 'adds a cereal after a cereal' : 'avoids a cereal after a cereal');
      if (pa.legume > 0 !== pb.legume > 0) bits.push(pb.legume > 0 ? 'adds a legume' : 'drops the legume');
      const last = ob.crops[ob.crops.length - 1], fiB = fieldFactor(ws.ctx, f.id, last);
      if (Math.abs(fiB - 1) >= 0.03) bits.push(`the field yields ${signed(Math.round((fiB - 1) * 100), '%')} against its neighbours for ${cropLabel(last).toLowerCase()} (NASA HLS)`);
    }
    out.push({ fieldId: f.id, areaHa: f.areaHa, a: describe(oa, years), b: describe(ob, years), reason: bits.join('; ') || 'about the same on this field' });
  });
  return out;
}

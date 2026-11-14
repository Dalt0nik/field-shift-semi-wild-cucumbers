// The satellite products of the screens are computed from the HLS series cut at the decision day.
import { describe, expect, it } from 'vitest';
import { products, fields } from '@/pilot/demo';
import { autumnHint, bareCalendar, knownOn, seasonCover, series, springHint } from '@/pilot/satellite';

describe('HLS series as known on a day', () => {
  it('with the whole record it reproduces the products built by the pipeline', () => {
    for (const f of fields) {
      const p = products.fields[f.id];
      expect(bareCalendar(f.id, '2026-12-31')).toEqual(p.calendar);
      expect(seasonCover(f.id, '2026-12-31')).toEqual(p.seasons);
      const a = autumnHint(f.id, '2026-12-31');
      expect(a.winterCropSuggested).toBe(p.autumn2026.winterCropSuggested);
      expect(a.minNdvi).toBe(p.autumn2026.minNdviAugOct); expect(a.lateNdvi).toBe(p.autumn2026.lateNdvi);
    }
  });
  it('holds nothing observed after the day', () => {
    for (const f of fields) {
      for (const k of Object.keys(series(f.id, '2026-08-01'))) expect(k <= '202607b').toBe(true);
      expect(autumnHint(f.id, '2026-08-01').winterCropSuggested).toBe(null);
      expect(seasonCover(f.id, '2026-08-01').at(-1)!.season).toBe('2025/26');
      expect(seasonCover(f.id, '2026-06-01').at(-1)!.season).toBe('2024/25');
    }
    expect(knownOn('202607b', '2026-08-01')).toBe(true);
    expect(knownOn('202608a', '2026-08-01')).toBe(false);
    expect(knownOn('202611a', '2026-11-14')).toBe(true); // downloaded on 13 Nov: the composite holds nothing later
  });
  it('the early-spring hint agrees with the declared crop on at least 10 of the 12 fields', () => {
    const winter = ['winter_wheat', 'winter_rapeseed', 'winter_barley', 'triticale', 'perennial_grasses'];
    const agree = fields.filter(f => { const h = springHint(f.id, '2026-08-01'); const c = f.history[2026]?.crop; return h.overwintered !== null && !!c && h.overwintered === winter.includes(c); });
    expect(agree.length).toBeGreaterThanOrEqual(10);
  });
});

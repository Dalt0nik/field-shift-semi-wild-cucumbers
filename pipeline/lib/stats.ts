// Small statistics helpers used by the experiments (no dependencies).
export const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / (a.length || NaN);
export function pearson(x: number[], y: number[]): number {
  const n = x.length; if (n < 3) return NaN;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
export function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1;
  }
  return r;
}
export const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));
export function quantile(a: number[], p: number): number {
  const s = [...a].filter(v => isFinite(v)).sort((x, y) => x - y); if (!s.length) return NaN;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export const median = (a: number[]) => quantile(a, 0.5);
// Area under the ROC curve: probability that a positive case has a higher score than a negative one.
export function auc(score: number[], positive: boolean[]): number {
  const r = ranks(score); let np = 0, sum = 0;
  for (let i = 0; i < r.length; i++) if (positive[i]) { np++; sum += r[i]; }
  const nn = r.length - np; if (!np || !nn) return NaN;
  return (sum - np * (np + 1) / 2) / (np * nn);
}
// Deterministic pseudo-random generator (mulberry32) for bootstraps and sampling.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

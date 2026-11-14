// Earth Engine for Node: service-account auth (key path from GEE_KEY in .env or the environment),
// promise wrappers and a small concurrency pool. Nothing from the key is printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eeDefault from '@google/earthengine';

export const ee: any = eeDefault;
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..'); // repository root
export const CACHE = path.join(ROOT, 'pipeline', 'cache'); // downloads, not committed
export const OUT = path.join(ROOT, 'src', 'data');
/** Small inputs prepared outside this repository and committed here (pipeline/README.md says where each comes from). */
export const INPUTS = path.join(ROOT, 'pipeline', 'inputs');
/** Large local inputs that are never committed (the declarations Parquet). */
export const LOCAL = path.join(ROOT, 'pipeline', 'local');

function keyPath(): string {
  if (process.env.GEE_KEY) return process.env.GEE_KEY;
  const envFile = path.join(ROOT, '.env');
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*GEE_KEY\s*=\s*(.+)\s*$/);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  throw new Error('GEE_KEY not set');
}

export async function initEE(): Promise<void> {
  const key = JSON.parse(fs.readFileSync(keyPath(), 'utf8'));
  await new Promise<void>((res, rej) =>
    ee.data.authenticateViaPrivateKey(key, () => res(), (e: any) => rej(new Error(String(e)))));
  // No explicit project (AGENTS.md): the service account cannot use serviceusage on its project.
  await new Promise<void>((res, rej) => ee.initialize(null, null, () => res(), (e: any) => rej(new Error(String(e)))));
}

export function evaluate<T = any>(obj: any): Promise<T> {
  return new Promise((res, rej) => obj.evaluate((v: T, err: any) => (err ? rej(new Error(String(err))) : res(v))));
}

export async function retry<T>(fn: () => Promise<T>, tries = 4, label = ''): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const wait = 2000 * 2 ** i;
      if (label) console.error(`  retry ${i + 1}/${tries} ${label}: ${String(e).slice(0, 140)}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw last;
}

export async function pool<I, O>(items: I[], n: number, fn: (it: I, i: number) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// --- tiny CSV helpers (no dependencies) ---
export function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.length);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const c = l.split(',');
    const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = c[i] ?? ''));
    return o;
  });
}
export function writeCsv(file: string, rows: Record<string, any>[], cols?: string[]): void {
  if (!rows.length) { fs.writeFileSync(file, ''); return; }
  const head = cols ?? Object.keys(rows[0]);
  const fmt = (v: any) => (v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : String(v));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, head.join(',') + '\n' + rows.map(r => head.map(h => fmt(r[h])).join(',')).join('\n') + '\n');
}

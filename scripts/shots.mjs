// Screenshots of every state of the app at several window widths, plus a fit report: elements that stick out of
// the window or of their panel, bars that overflow, pages that scroll sideways.
// Usage: npm run dev (in another terminal), then  node scripts/shots.mjs [width ...]     default widths 1100 1280 1600
// Output: screenshots/<width>/NN-name.png and screenshots/fit-report.md. Uses the installed Chrome or Edge.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:3002';
const OUT = path.resolve('screenshots');
const widths = process.argv.slice(2).map(Number).filter(Boolean);
const WIDTHS = widths.length ? widths : [1100, 1280, 1600];
const BROWSERS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = process.env.CHROME ?? BROWSERS.find(p => fs.existsSync(p));
if (!exe) throw new Error('No Chrome or Edge found; set CHROME to the browser executable');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (page, sel, text) => page.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => !text || e.textContent.trim().startsWith(text)); if (!el) return false; el.click(); return true; }, sel, text);
const plans = page => page.waitForFunction(() => !/Searching for plans/.test(document.querySelector('.main')?.textContent ?? '') && (!!document.querySelector('.card, .dd, .facts') || !document.querySelector('.page')), { timeout: 30000 }).then(() => sleep(2500)).catch(() => {});
const mapReady = page => page.waitForSelector('.map-label', { timeout: 20000 }).then(() => sleep(2500)).catch(() => {});

// every state: where to go, what to wait for, what to do before the picture
const STATES = [
  { name: 'map', url: '/map', map: true },
  { name: 'map-field-card', url: '/map', map: true, act: p => click(p, '.map-label', 'F3') },
  { name: 'map-layers-and-help', url: '/map', map: true, act: async p => { for (const t of ['Satellite image', 'Rule layers']) await click(p, 'label.chk', t); await click(p, 'details.more summary', 'How do I add'); } },
  { name: 'fields-now', url: '/organization', map: true },
  { name: 'fields-now-dropdown-open', url: '/organization', map: true, act: async p => { await click(p, 'tbody tr:nth-child(2) .dd'); } },
  { name: 'fields-timelines', url: '/organization?tab=timelines' },
  { name: 'crops-and-limits', url: '/settings' },
  { name: 'crops-ban-dropdown-open', url: '/settings', viewport: true, act: async p => { await p.evaluate(() => document.querySelectorAll('.dd')[1]?.click()); } },
  { name: 'planner-suggested', url: '/planner', plans: true },
  { name: 'planner-suggested-2028-chosen', url: '/planner', plans: true, act: async p => { await click(p, '.tabs button', 'Harvest 2028'); await click(p, '.card', 'Least cereal'); await click(p, '.btn', 'Choose this plan'); } },
  { name: 'planner-suggested-all-open', url: '/planner', plans: true, act: p => p.evaluate(() => document.querySelectorAll('details.more').forEach(d => (d.open = true))) },
  { name: 'planner-compare', url: '/planner?tab=compare', plans: true },
  { name: 'planner-mine-empty', url: '/planner?tab=mine', plans: true },
  { name: 'planner-mine-editing', url: '/planner?tab=mine', plans: true, act: async p => { await click(p, '.btn', 'Start my plan'); await sleep(400); await p.evaluate(() => { const t = [...document.querySelectorAll('svg.mini path title')].find(x => x.textContent === 'F2'); t?.parentElement?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); } },
  { name: 'checks', url: '/rules', map: true, plans: true },
  { name: 'checks-numbers-open', url: '/rules', map: true, plans: true, act: p => p.evaluate(() => document.querySelectorAll('details.more').forEach(d => (d.open = true))) },
  { name: 'satellite-layer', url: '/scenes', map: true },
  { name: 'satellite-compare-pixel', url: '/scenes?tab=compare', map: true, act: async p => { const box = await (await p.$$('.mapbox'))[1].boundingBox(); await p.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.6); } },
  { name: 'analytics-bare-soil', url: '/analytics' },
  { name: 'analytics-weather-risk', url: '/analytics?tab=weather', plans: true },
  { name: 'analytics-zones-erosion', url: '/analytics?tab=zones', map: true, plans: true },
  { name: 'analytics-zones-low', url: '/analytics?tab=zones&view=low', map: true, plans: true },
  { name: 'analytics-zones-dry', url: '/analytics?tab=zones&view=dry', map: true, plans: true, act: p => p.evaluate(() => { const r = document.querySelector('#dryk'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '2'); r.dispatchEvent(new Event('input', { bubbles: true })); }) },
  { name: 'analytics-method', url: '/analytics?tab=method' },
  { name: 'assistant-open', url: '/planner', plans: true, viewport: true, act: p => click(p, '.chat-fab') },
  { name: 'glossary-open', url: '/planner', plans: true, viewport: true, act: p => click(p, '.top .link', 'Glossary') },
];

// what does not fit: measured in the page, so it does not depend on anyone looking at the picture
const fit = () => {
  const out = new Set(); const vw = innerWidth;
  const desc = el => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 28)}"`;
  if (document.documentElement.scrollWidth > vw + 1) out.add(`window scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const top = document.querySelector('.top'); if (top && top.scrollWidth > top.clientWidth + 1) out.add(`top bar content is ${top.scrollWidth - top.clientWidth}px wider than the bar`);
  const main = document.querySelector('.main'); if (main && main.scrollWidth > main.clientWidth + 1) out.add(`main area scrolls sideways by ${main.scrollWidth - main.clientWidth}px`);
  for (const el of document.querySelectorAll('.main *, .top *, .chat-win *, .drawer *')) {
    if (el.closest('.scroll-x, .map, .tabs, svg, .tl, .dd-pop')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (r.right > vw + 1) out.add(`${desc(el)} sticks out of the window by ${Math.round(r.right - vw)}px`);
    const box = el.closest('.panel, .dock, .mapcard, .card, .chat-win, .facts'); if (!box || box === el) continue;
    const b = box.getBoundingClientRect();
    if (r.right > b.right + 1.5) out.add(`${desc(el)} sticks out of its ${box.className.split(' ')[0]} by ${Math.round(r.right - b.right)}px`);
  }
  for (const el of document.querySelectorAll('.scroll-x, .tabs')) if (el.scrollWidth > el.clientWidth + 1) out.add(`${el.className.split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 24)}" scrolls sideways (${el.scrollWidth - el.clientWidth}px hidden)`);
  for (const el of document.querySelectorAll('.mapcard, .maplegend, .chat-win, .chat-fab')) { const r = el.getBoundingClientRect(); for (const o of document.querySelectorAll('.mapcard, .maplegend, .chat-win, .chat-fab, .maplibregl-ctrl-group')) { if (o === el || o.contains(el) || el.contains(o)) continue; const q = o.getBoundingClientRect(); if (r.left < q.right - 2 && q.left < r.right - 2 && r.top < q.bottom - 2 && q.top < r.bottom - 2) out.add(`${el.className.split(' ')[0]} overlaps ${o.className.split(' ')[0]}`); } }
  return [...out].slice(0, 14);
};

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const report = [`# Fit report\n\nGenerated ${new Date().toISOString().slice(0, 16)} by scripts/shots.mjs against ${BASE}. A state with no line under it fits.\n`];
for (const w of WIDTHS) {
  const dir = path.join(OUT, String(w)); fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: Math.round(w * 0.62), deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  report.push(`\n## ${w} px wide\n`);
  let n = 0, bad = 0;
  for (const st of STATES) {
   try {
    errors.length = 0;
    await page.goto(BASE + st.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('.page-head, .dock, .panel', { timeout: 20000 }).catch(() => {});
    if (!st.map) await sleep(700);
    if (st.map) await mapReady(page);
    if (st.plans) await plans(page);
    if (st.act) { await st.act(page); await sleep(st.map ? 1200 : 500); }
    const issues = await page.evaluate(fit);
    // pages that scroll inside the frame are photographed whole
    const tall = !st.viewport && await page.evaluate(() => { const m = document.querySelector('.main'); return !!m && m.scrollHeight > m.clientHeight + 4 && !document.querySelector('.main > .split'); });
    if (tall) await page.addStyleTag({ content: '.app{height:auto!important;min-height:100vh}.main{overflow:visible!important}.chat-fab{position:absolute!important;bottom:18px!important}.app{position:relative}' });
    const file = path.join(dir, `${String(++n).padStart(2, '0')}-${st.name}.png`);
    await page.screenshot({ path: file, fullPage: tall });
    if (issues.length || errors.length) { bad++; report.push(`- **${st.name}**${issues.map(i => `\n  - ${i}`).join('')}${errors.map(e => `\n  - script error: ${e}`).join('')}`); }
    process.stdout.write(`${w} ${st.name}${issues.length ? ` (${issues.length} fit issues)` : ''}\n`);
   } catch (e) {
    // one state that cannot be photographed (a sleeping machine, a crashed tab) must not lose the rest
    bad++; n = Math.max(n, STATES.indexOf(st) + 1);
    report.push(`- **${st.name}**\n  - not captured: ${String(e).slice(0, 140)}`);
    process.stdout.write(`${w} ${st.name} NOT CAPTURED\n`);
   }
  }
  report.push(bad ? '' : '- every state fits');
  await page.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, `fit-report-${w}.md`), report.join('\n') + '\n');
}
await browser.close().catch(() => {});
fs.writeFileSync(path.join(OUT, 'fit-report.md'), report.join('\n') + '\n');
console.log('written', path.join(OUT, 'fit-report.md'));

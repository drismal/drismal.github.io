// Acceptance checks (section 9) — Playwright, 1280×800, against the built dist/.
// Usage: npm run build && node tests/acceptance.mjs [outDir]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const out = process.argv[2] ?? join(here, 'out');
await mkdir(out, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(import.meta.url)(join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const root = `http://127.0.0.1:${server.address().port}/index.html?adapter=none&test=1&dpr=1&particles=${process.env.PARTICLES ?? 60000}`;
const base = root + '&night=0';   // day unless a check asks for night (the schedule may say otherwise)

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

// mean darkness along rays (0 = background, 1 = ink) as a function of r/R
const radial = (angles, r0, r1, steps) => page.evaluate(([angles, r0, r1, steps]) => {
  const st = window.divergence.state, cv = document.querySelector('canvas');
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
  const k = cv.width / st.W, img = g.getImageData(0, 0, c2.width, c2.height).data;
  const lum = (x, y) => { const i = (Math.round(y * k) * c2.width + Math.round(x * k)) * 4; return (img[i] + img[i + 1] + img[i + 2]) / 765; };
  const bgL = lum(8, 8);
  const res = [];
  for (let s = 0; s <= steps; s++) {
    const x = r0 + (r1 - r0) * s / steps;
    let acc = 0;
    for (const a of angles) acc += (bgL - lum(st.cx + st.R * x * Math.cos(a), st.cy + st.R * x * Math.sin(a))) / (bgL - 0.067);
    res.push([x, acc / angles.length]);
  }
  return res;
}, [angles, r0, r1, steps]);

const calloutBoxes = () => page.evaluate(() => {
  const st = window.divergence.state;
  return [...document.querySelectorAll('#callouts > g')].filter((g) => g.style.display !== 'none').map((g) => {
    const ts = [...g.querySelectorAll('text')];
    const bb = ts.map((t) => t.getBBox()).filter((b) => b.width > 0);
    if (!bb.length) return null;
    const x0 = Math.min(...bb.map((b) => b.x)), y0 = Math.min(...bb.map((b) => b.y));
    const x1 = Math.max(...bb.map((b) => b.x + b.width)), y1 = Math.max(...bb.map((b) => b.y + b.height));
    const qx = Math.max(x0, Math.min(st.cx, x1)), qy = Math.max(y0, Math.min(st.cy, y1));
    return { x0, y0, x1, y1, distR: Math.hypot(qx - st.cx, qy - st.cy) / st.R };
  }).filter(Boolean);
});

await page.goto(base);
await wait(4000);

// 1–2. rest: double ring, sharp inner edge, peak darkness ~1.04 R, ~0 by 1.10 R
await shot('1_rest');
const angles = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);
const prof = await radial(angles, 0.96, 1.16, 40);
const peak = prof.reduce((m, p) => (p[1] > m[1] ? p : m));
const at110 = prof.find((p) => p[0] >= 1.10)[1], at098 = prof.find((p) => p[0] >= 0.98)[1];
check('rest: profile peak near 1.04 R', peak[0] >= 1.02 && peak[0] <= 1.06, `peak ${peak[1].toFixed(2)} at r/R=${peak[0].toFixed(3)}`);
check('rest: almost nothing at 1.10 R and inside', at110 < 0.15 && at098 < 0.05, `@1.10R=${at110.toFixed(3)} @0.98R=${at098.toFixed(3)}`);
const inside = (await radial(angles, 0.5, 0.9, 4)).map((p) => p[1]);
check('rest: inside == background', Math.max(...inside.map(Math.abs)) < 0.03, `max ${Math.max(...inside).toFixed(3)}`);
await wait(5000);
await shot('1_rest_plus5s');

// 3–4. level 2 at 315° (upper right): ridges, spike, marker, callout outside the ring
const sector = [(-45 - 20) * Math.PI / 180, (-45) * Math.PI / 180, (-45 + 20) * Math.PI / 180];
const opposite = sector.map((a) => a + Math.PI);
const bandAt = async (ang) => (await radial(ang, 1.07, 1.13, 6)).reduce((s, p) => s + p[1], 0) / 7;
// extra darkness of the event sector over the opposite sector, measured in the same frame
const band = async () => (await bandAt(sector)) - (await bandAt(opposite));
const ridgeBase = await band();
const id2 = await page.evaluate(() => window.divergence.trigger(2, 315, 0));
await wait(3500);
await shot('3_level2');
const ridgeOn = (await band()) - ridgeBase;
let boxes = await calloutBoxes();
check('level 2: ridges darken the sector', ridgeOn > 0.1, `extra darkness 1.07–1.13R = ${ridgeOn.toFixed(3)} (ring alone ${ridgeBase.toFixed(3)})`);
check('callout text entirely outside the ring', boxes.length === 1 && boxes[0].distR > 1.2, boxes.map((b) => `dist ${b.distR.toFixed(2)} R`).join(', '));
const tip = await page.evaluate(() => {
  const g = [...document.querySelectorAll('#callouts > g')].find((x) => x.style.display !== 'none');
  const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.querySelector('g').getAttribute('transform'));
  const st = window.divergence.state, s = window.divergence.bus.slots.find((x) => x.phase !== 'free');
  const r = 1.04 + s.spike * s.energy;
  return { mx: +m[1], my: +m[2], ex: st.cx + st.R * r * Math.cos(s.theta), ey: st.cy + st.R * r * Math.sin(s.theta) };
});
check('marker sits on the spike tip', Math.hypot(tip.mx - tip.ex, tip.my - tip.ey) < 4, `offset ${Math.hypot(tip.mx - tip.ex, tip.my - tip.ey).toFixed(1)} px`);

// 5. settle: 6 s after the end the ridges have (almost) gone
await page.evaluate((id) => window.divergence.end(id), id2);
await wait(6000);
await shot('5_level2_plus6s');
const ridgeOff = (await band()) - ridgeBase;
check('6 s after the end ridges are almost gone', ridgeOff < ridgeOn * 0.25, `${ridgeOn.toFixed(3)} → ${ridgeOff.toFixed(3)}`);

// 6. level 3: eclipse, many needles
await page.evaluate(() => { window.divergence.clear(); window.divergence.trigger(3, 200, 0); });
await wait(4000);
await shot('6_level3');
const disturbed = (await radial(Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2), 1.12, 1.12, 0));
check('level 3: eclipse active', (await page.evaluate(() => window.divergence.state.eclipse)) > 0.9, `eclipse=${(await page.evaluate(() => window.divergence.state.eclipse)).toFixed(2)}`);
void disturbed;

// 7. four events: callouts do not overlap and stay on screen
await page.evaluate(() => {
  const d = window.divergence; d.clear();
  d.trigger(1, 30, 0); d.trigger(2, 140, 0); d.trigger(1, 230, 0); d.trigger(2, 320, 0);
});
await wait(4000);
await shot('7_four_events');
boxes = await calloutBoxes();
let overlaps = 0;
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const a = boxes[i], b = boxes[j];
  if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlaps++;
}
const offscreen = boxes.filter((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > 1280 || b.y1 > 800).length;
check('4 callouts: no overlaps, on screen, outside ring', boxes.length === 4 && !overlaps && !offscreen && boxes.every((b) => b.distR > 1.2),
  `n=${boxes.length} overlaps=${overlaps} offscreen=${offscreen} minDist=${Math.min(...boxes.map((b) => b.distR)).toFixed(2)}R`);

// 8. night
await page.evaluate(() => { window.divergence.setNight(true); });
await page.goto(root + '&night=1');
await wait(3000);
await page.evaluate(() => window.divergence.trigger(2, 60, 0));
await wait(3500);
await shot('8_night');
const bgNight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('night: inverted background', /rgb\((\d), \1, \1\)/.test(bgNight), bgNight);

// 9. memory: 60 s of rapid events, heap after GC must not grow
const cdp = await page.context().newCDPSession(page);
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return page.evaluate(() => performance.memory.usedJSHeapSize); };
await page.evaluate(() => { window.divergence.setNight(false); window.divergence.clear(); });
const h0 = await heap();
await page.evaluate(() => { window.__flood = setInterval(() => window.divergence.trigger(1 + Math.floor(Math.random() * 3), Math.random() * 360, 1500 + Math.random() * 2500), 700); });
await wait(Number(process.env.SOAK_MS ?? 60000));
await page.evaluate(() => clearInterval(window.__flood));
await wait(9000);
const h1 = await heap();
check('memory: no heap growth after event flood', h1 < h0 * 1.15 + 2e6, `${(h0 / 1e6).toFixed(1)} MB → ${(h1 / 1e6).toFixed(1)} MB`);
const fps = await page.evaluate(() => window.divergence.state.fps);
console.log(`fps in this (software-rendered) browser: ${fps}`);

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${out}`);
process.exit(failed ? 1 : 0);

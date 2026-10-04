// Navigation-only fixture: Gantry geometry stands in for an owner track in
// intercepted loopback responses. Source release flags remain disabled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.WEEK2_EVIDENCE_DIR || path.join(root, 'docs/stardust/evidence/week2'));
await mkdir(out, { recursive: true });
const fallback = pathToFileURL('C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href;
const pw = await import(process.env.PLAYWRIGHT_MODULE || fallback).catch(() => import('playwright'));
const port = 4380 + Math.floor(Math.random() * 300);
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/projects/Space-Shooter/`;
const server = spawn(process.execPath, ['scripts/preview-stardust.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'ignore' });
let browser;
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); console.log(`ok ${++checks} - ${label}`); };
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('https://**/*', route => route.abort());
  const open = Date.parse('2026-10-06T15:00:00-07:00');
  const closeW1 = Date.parse('2026-10-06T19:00:00-07:00');
  await context.addInitScript(({ open }) => { window.__week2Now = open; Date.now = () => window.__week2Now; }, { open });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base);
  await page.waitForSelector('#weekly-card:not([hidden])');
  check(await page.textContent('#network-title') === 'Fly the full network', 'disabled rollout leaves existing modes available');
  check(!(await page.isDisabled('#starmap-start-btn')), 'disabled retirement does not remove network play');
  check(await page.isVisible('#weekly-controls-notice'), 'phone shows keyboard/controller recommendation');
  await page.screenshot({ path: path.join(out, 'phone-disabled-release.png'), fullPage: true });

  const source = await readFile(path.join(root, 'projects/Space-Shooter/tracks/weeklyRollout.js'), 'utf8');
  const fixture = source.replaceAll('enabled: false', 'enabled: true')
    .replace("title: 'Owner track pending'", "title: 'Navigation test fixture'")
    .replace('track: null', `track: ${JSON.stringify(WEEKLY_EVENTS[0].track)}`);
  await context.route(`${origin}/projects/Space-Shooter/tracks/weeklyRollout.js`, route => route.fulfill({ contentType: 'text/javascript', body: fixture }));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('weekly-title')?.textContent.includes('Navigation test fixture'));
  check(!(await page.isDisabled('#weekly-btn')), 'Week 2 is flyable at 3 PM in an approved-track fixture');
  check(await page.isVisible('#weekly-overlap-link'), 'Gantry remains selectable during the four-hour overlap');
  check(await page.isDisabled('#starmap-start-btn'), 'legacy network cannot start');
  check(!(await page.isVisible('.dogfight-card')) && !(await page.isVisible('#custom-track-card')), 'Week 2-only navigation hides other modes');
  await page.locator('#weekly-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'phone-week2-overlap-fixture.png'), fullPage: true });
  const oldBest = 'retained-week1-history';
  await page.evaluate(value => localStorage.setItem('week2-history-fixture', value), oldBest);
  await page.click('#weekly-overlap-link');
  await page.waitForFunction(() => document.getElementById('weekly-btn')?.textContent.includes('Fly week 1'));
  check(!(await page.isDisabled('#weekly-btn')), 'Gantry can still launch before 7 PM');
  await page.evaluate(time => { window.__week2Now = time; }, closeW1);
  await page.waitForFunction(() => document.getElementById('weekly-btn')?.disabled);
  check((await page.textContent('#weekly-note')).includes('Legacy / retired'), 'Gantry retires precisely at 7 PM');
  check(await page.evaluate(() => localStorage.getItem('week2-history-fixture')) === oldBest, 'retirement preserves browser history');
  await page.locator('#weekly-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'phone-gantry-retired-fixture.png'), fullPage: true });
  await page.goto(base + 'dogfight/');
  await page.waitForURL(base);
  check(page.url() === base, 'direct Dogfight URL returns to the current weekly hangar');
  check(errors.length === 0, `no browser exceptions: ${errors.join('; ')}`);
  console.log(`PASS ${checks} navigation checks; fixture geometry is not a selected Week 2 track.`);
} finally {
  await browser?.close();
  server.kill();
}

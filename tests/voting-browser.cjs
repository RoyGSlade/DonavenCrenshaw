'use strict';
// Invoked by the Hub's isolated PostgreSQL integration fixture, not a live site.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
exports.browserQa = async function ({ base, users, prisma, siteOrigin, check }) {
  const site = path.resolve(__dirname, '..');
  const output = process.env.POLL_QA_OUTPUT || path.join(site, 'output', 'voting-qa');
  await fs.mkdir(output, { recursive: true });
  const built = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: site, env: { ...process.env, SITE_BASE: '/', HUB_URL: base }, encoding: 'utf8' });
  await fs.writeFile(path.join(output, 'browser-site-build.txt'), `${built.stdout}\n${built.stderr}`);
  assert.equal(built.status, 0, built.stderr);
  const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
  const siteServer = http.createServer(async (req, res) => {
    try {
      const route = new URL(req.url, siteOrigin).pathname;
      const file = path.resolve(site, 'public', `.${route.endsWith('/') ? route + 'index.html' : route}`);
      if (!file.startsWith(path.resolve(site, 'public') + path.sep)) { res.writeHead(404).end(); return; }
      const bytes = await fs.readFile(file); res.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => siteServer.listen(Number(new URL(siteOrigin).port), '127.0.0.1', r));
  const { chromium } = require(process.env.POLL_PLAYWRIGHT || 'playwright');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const contexts = [];
    async function pageFor(user, width = 390, route = 'community/') {
      const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 }); contexts.push(context);
      await context.route('**/*', route => /^http:\/\/127\.0\.0\.1:\d+\//.test(route.request().url()) ? route.continue() : route.abort());
      if (user) await context.addCookies([{ name: 'token', value: users[user].cookie.slice(6), url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${siteOrigin}/${route}`); await page.waitForFunction(() => !/^(Loading|Checking)/.test(document.querySelector('#voting-status').textContent));
      return { page, errors };
    }
    let browserPoll;
    const title = 'Synthetic browser review — fixture only';
    const attack = '<img src=x onerror="window.fixtureExecuted=true">';
    const owner = await pageFor('owner',390,'community/manage/');
    await check('real mobile owner UI saves private draft, reviews and explicitly opens', async () => {
      await owner.page.locator('#voting-admin').waitFor({ state: 'visible' });
      await owner.page.locator('#poll-title').fill(title);
      await owner.page.locator('#poll-description').fill('Synthetic fixture. These are not actual development commitments.');
      await owner.page.locator('#poll-options').fill(`Fixture priority C\n${attack}`);
      await owner.page.getByRole('button', { name: 'Save private draft' }).click();
      const card = owner.page.locator('#voting-admin-polls article').filter({ hasText: title });
      await card.waitFor(); assert.match(await card.textContent(), /DRAFT/);
      const guestDraft = await pageFor(); assert.equal(await guestDraft.page.locator('#voting-polls').getByText(title).count(), 0);
      owner.page.once('dialog', dialog => dialog.accept()); await card.getByRole('button', { name: 'Open this poll' }).click();
      await card.getByText('OPEN', { exact:true }).waitFor();
      await owner.page.goto(`${siteOrigin}/community/`);
      const open = owner.page.locator('#voting-polls article').filter({ hasText: title }); await open.waitFor();
      browserPoll = await open.getAttribute('data-poll-id');
      assert.equal(await prisma.priorityBallot.count({ where: { pollId: browserPoll } }), 0);
      await owner.page.screenshot({ path: path.join(output, 'owner-phone.png'), fullPage: true });
    });
    const voter = await pageFor('mod');
    await check('phone ballot requires final confirmation; labels stay text and one vote persists on reload', async () => {
      const card = voter.page.locator('#voting-polls article').filter({ hasText: title });
      const confirmation = card.locator('.voting-confirm');
      assert.ok(await confirmation.evaluate(el => {
        const label = el.getBoundingClientRect(), text = el.querySelector('span').getBoundingClientRect();
        return label.height < 100 && text.width > 150 && text.right <= label.right + 1;
      }), 'the complete final-vote confirmation must be visible on the phone');
      await card.scrollIntoViewIfNeeded();
      await voter.page.screenshot({ path: path.join(output, 'ballot-phone.png') });
      await card.getByLabel('Fixture priority C', { exact: true }).check();
      await card.getByRole('button', { name: 'Confirm my one vote' }).click();
      assert.equal(await prisma.priorityBallot.count({ where: { pollId: browserPoll } }), 0);
      await card.getByLabel('I understand my confirmed vote is final for this poll.').check();
      await card.getByRole('button', { name: 'Confirm my one vote' }).focus(); await voter.page.keyboard.press('Enter');
      await voter.page.getByText('Your vote is recorded. Thank you.', { exact: true }).waitFor();
      assert.equal(await prisma.priorityBallot.count({ where: { pollId: browserPoll } }), 1);
      await voter.page.reload(); await voter.page.getByText('Your confirmed vote: Fixture priority C. This choice is final for this poll.', { exact: true }).waitFor();
      assert.equal(await voter.page.locator('#voting-polls img').count(), 0);
      assert.equal(await voter.page.evaluate(() => window.fixtureExecuted), undefined);
      await voter.page.screenshot({ path: path.join(output, 'vote-confirmed-phone.png'), fullPage: true });
    });
    const guest = await pageFor(undefined, 1440);
    await check('guest results contain no private choice or draft; 320/390/1440 layouts fit and controls have labels', async () => {
      const card = guest.page.locator('#voting-polls article').filter({ hasText: title });
      assert.equal(await card.getByRole('radio').count(), 0);
      assert.equal(await guest.page.locator('#voting-admin').isVisible(), false);
      assert.ok(!(await card.textContent()).includes('Your confirmed vote:'));
      for (const width of [320, 390, 1440]) {
        await owner.page.setViewportSize({ width, height: 844 });
        assert.ok(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `owner overflow at ${width}`);
        await guest.page.setViewportSize({ width, height: 844 });
        assert.ok(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `guest overflow at ${width}`);
      }
      await guest.page.screenshot({ path: path.join(output, 'results-desktop.png'), fullPage: true });
      for (const sample of [owner, voter, guest]) assert.deepEqual(sample.errors, []);
    });
    await check('browser expired session fails without saving or claiming success', async () => {
      const bob = await pageFor('bob'); const card = bob.page.locator('#voting-polls article').filter({ hasText: title });
      await card.getByLabel('Fixture priority C', { exact: true }).check();
      await card.getByLabel('I understand my confirmed vote is final for this poll.').check();
      await bob.page.context().clearCookies();
      await card.getByRole('button', { name: 'Confirm my one vote' }).click();
      await card.getByRole('status').waitFor();
      await bob.page.getByText('Your session ended. Sign in again to vote.', { exact: false }).waitFor();
      assert.equal(await card.getByRole('link', { name: 'Sign in', exact: false }).count(), 1);
      assert.equal(await prisma.priorityBallot.count({ where: { pollId: browserPoll, userId: users.bob.id } }), 0);
    });
    for (const context of contexts) await context.close();
    console.log(`Browser evidence: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(r => siteServer.close(r));
  }
};

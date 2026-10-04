import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ejs from 'ejs';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEK2_DRAFT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';

const template = readFileSync(new URL('../src/layouts/stardust-weekly.ejs', import.meta.url), 'utf8');
function render(event, siteRoot) {
  return ejs.render(template, { components: { head:'', nav:'', footer:'' }, siteRoot,
    data: { weekly: { ...event, state:'upcoming', gameUrl:'games/stardust/', opensText:'Opening pending', closesText:'Closing pending',
      layout:'fixture.svg', layoutWidth:400, layoutHeight:300, shards:8 } } });
}
test('actual weekly layout keeps the sole Week1 exception and pending code delivery explicit', () => {
  for (const base of ['/', '/DonavenCrenshaw/']) {
    const html = render(WEEKLY_EVENTS[0], base);
    assert.match(html, /Week 1 uses the approved exception for eligible accepted finishes/);
    assert.match(html, /Challenger/);
    assert.match(html, /Pending early-access entitlement to Stardust: Planetfall/);
    assert.match(html, /Codes will be delivered later/);
    assert.doesNotMatch(html, /Awards are paused|Week 2 awards require|nothin wrong with silver/);
    assert.ok(html.includes(`href="${base}games/stardust/"`));
  }
});
test('actual Week2 layout describes strict verification, exact podium titles and a pending named hull', () => {
  const html = render(WEEK2_DRAFT, '/');
  assert.match(html, /Week 2 awards require server replay verification or review/);
  assert.match(html, /nothin wrong with silver/);
  assert.match(html, /hell you could be fifth/);
  assert.match(html, /Week 2 Hero/);
  assert.match(html, /An existing hull variant named after the winner, prepared after final results/);
  assert.doesNotMatch(html, /Planetfall|Week 1 has the owner-approved verification exception|Codes will be delivered/);
});

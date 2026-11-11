// Helpers for browser tests of the round-2 hangar (voyage/hangar*, voyage/ui/):
// sign a captain's licence with the dice, and open a station. Dev-only, never shipped.
// The hangar is a place now (stations, not tabs): see voyage/hangarStations.js for the ids.

/**
 * Sign the captain's licence that opens for a new player (after the intro): a name, then the die
 * for each stat (reduced motion makes each roll land at once), then sign.
 */
export async function signOnCaptain(page, name, { tutorial = false } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Round 2: a new save opens on the story's intro. These checks skip the tutorial
  // (everything opens) unless they ask for it; the licence follows either way.
  await page.locator('#hg-licence:visible, .sy-intro').first().waitFor();
  if (await page.locator('.sy-intro').count()) {
    if (tutorial) { await page.locator('.sy-begin').click(); await page.locator('.sy-intro-skip').click(); }
    else await page.locator('.sy-intro-skipall').click();
  }
  await page.locator('#hg-licence').waitFor();
  await page.locator('#vy-name').fill(name);
  const roll = page.locator('#hg-roll');
  for (let i = 0; i < 12 && await roll.isEnabled(); i++) {
    await roll.click();
    await page.waitForFunction(() => !/Rolling/.test(document.getElementById('hg-roll')?.textContent || ''));
  }
  await page.locator('#hg-sign').click();
  await page.locator('#pane-captain h2', { hasText: name }).waitFor();
}

/** Open a hangar station (closing any open one first); view picks a station's sub view ('ledger', 'crew'). */
export async function openStation(page, id, view = null) {
  const sheet = page.locator('#hg-sheet');
  if (await sheet.isVisible() && (await sheet.getAttribute('data-open-station')) !== id) await page.locator('#hg-sheet-close').click();
  if (!(await sheet.isVisible())) await page.locator(`[data-station="${id}"]`).dispatchEvent('click');
  await page.locator(`#hg-sheet[data-open-station="${id}"]`).waitFor();
  if (view) await page.locator(`#hg-sheet-tabs [data-view="${view}"]`).click();
}

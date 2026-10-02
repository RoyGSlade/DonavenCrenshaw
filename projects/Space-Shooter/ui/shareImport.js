// Copying another pilot's setup from a leaderboard link (systems/shareImport.js has
// the rules). ?import=ship&from=<pilot> opens the garage with their ship as a new
// design; ?import=settings&from=<pilot> shows what their flight settings would change
// and applies them only on a click, with an Undo. The link is cleared from the address
// bar first, so a reload never asks again.
import { runtimeConfig } from '../runtime-config.js';
import { flightSettings } from '../systems/flightSettings.js';
import { whenAccountSynced } from '../systems/hubSyncLive.js';
import { importedShipName } from '../systems/shipShare.js';
import {
  parseImportParams, withoutImportParams, fetchShared, describeSettingsChange, applyImportedSettings, undoImportedSettings,
} from '../systems/shareImport.js';
import { toast } from './hud.js';

const WHY = {
  ship: {
    missing: (from) => `${from} is not sharing a ship right now, so there is nothing to copy.`,
    invalid: () => 'That ship could not be read, so nothing changed.',
  },
  settings: {
    missing: (from) => `${from} is not sharing flight settings right now, so there is nothing to copy.`,
    invalid: () => 'Those settings could not be read, so nothing changed.',
  },
};
const OFFLINE = 'Could not reach the leaderboard server. Your ship and settings are untouched; try the link again in a minute.';

function say(request, result) {
  if (result.status === 'offline') return OFFLINE;
  return WHY[request.kind][result.status](request.from);
}

let dialog = null;
function settingsDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'share-import';
  dialog.className = 'share-import';
  dialog.setAttribute('aria-labelledby', 'share-import-title');
  dialog.innerHTML = `<form method="dialog" class="share-import-body">
 <p class="eyebrow">STARDUST / COPY SETTINGS</p>
 <h2 id="share-import-title"></h2>
 <p class="share-import-lead"></p>
 <ul class="share-import-changes" aria-label="What will change"></ul>
 <p class="share-import-note"></p>
 <div class="share-import-actions"></div>
</form>`;
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  // Keys typed in the prompt are not flight controls.
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  return dialog;
}

function button(text, onClick, { primary = false } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (primary) b.className = 'primary';
  b.addEventListener('click', onClick);
  return b;
}

// What applying would change, as "Camera: Track view → Behind the ship" rows.
function changeList(rows) {
  const list = dialog.querySelector('.share-import-changes');
  list.replaceChildren(...rows.map(({ label, from, to }) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const change = document.createElement('b');
    change.textContent = from ? `${from} → ${to}` : to;
    li.append(name, change);
    return li;
  }));
}

function showSettings(from, shared) {
  const box = settingsDialog();
  const name = shared.pilot.displayName || from;
  const rows = describeSettingsChange(flightSettings(), shared.next);
  const actions = box.querySelector('.share-import-actions');
  const set = (cls, text) => { box.querySelector(cls).textContent = text; };
  const close = () => box.close();
  set('#share-import-title', `Use ${name}'s flight settings?`);
  changeList(rows);
  if (!rows.length) {
    set('.share-import-lead', 'These settings already match yours, so there is nothing to change.');
    set('.share-import-note', '');
    actions.replaceChildren(button('Close', close, { primary: true }));
  } else {
    set('.share-import-lead', `${rows.length === 1 ? 'This 1 setting' : `These ${rows.length} settings`} would change on this device. Nothing is applied until you press Apply.`);
    set('.share-import-note', 'Your ship, times and account stay as they are. After applying you can undo it in one click.');
    actions.replaceChildren(
      button('Cancel', close),
      button('Apply settings', () => {
        if (!applyImportedSettings({ code: shared.code, from })) { toast('Those settings could not be applied. Nothing changed.', 3500); close(); return; }
        set('#share-import-title', 'Settings applied');
        set('.share-import-lead', `You are now using ${name}'s settings. Changed your mind?`);
        set('.share-import-note', 'Undo puts back exactly what you had before. It is also under Controls & settings.');
        changeList([]);
        actions.replaceChildren(
          button('Undo', () => {
            const undone = undoImportedSettings();
            toast(undone ? 'Your previous settings are back.' : 'Nothing to undo.', 3000);
            close();
          }),
          button('Done', close, { primary: true }),
        );
        actions.querySelector('.primary')?.focus();
      }, { primary: true }),
    );
  }
  if (!box.open) {
    box.showModal();
    window.dispatchEvent(new Event('stardust:clear-input'));
  }
  actions.querySelector('.primary')?.focus();
}

/** Run once at start: act on an import link in the address bar, if there is one. */
export async function initShareImport() {
  const request = parseImportParams(location.search);
  if (!request) return;
  try { history.replaceState(history.state, '', withoutImportParams(location.href)); } catch { /* a sandboxed frame: the prompt still works, a reload would ask again */ }
  toast(`Looking up ${request.from}'s ${request.kind}…`, 2500);
  const result = await fetchShared(request.kind, request.from, { backendBaseUrl: runtimeConfig.backendBaseUrl });
  if (result.status !== 'ok') { toast(say(request, result), 5000); return; }
  if (request.kind === 'ship') {
    // The garage takes it from here: a new design, an Equip button and a Keep my ship button.
    window.dispatchEvent(new CustomEvent('stardust:import-ship', {
      detail: { appearance: result.appearance, name: importedShipName(result.appearance.family, request.from), from: request.from, pilot: result.pilot },
    }));
    return;
  }
  // The account's own copy of the settings can land during the first sync; let it finish first.
  await whenAccountSynced();
  showSettings(request.from, result);
}

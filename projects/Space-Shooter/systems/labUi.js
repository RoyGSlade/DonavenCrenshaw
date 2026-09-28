// The playtest lab's screens: pick the rules in the hangar, see plainly that
// nothing is saved, and copy a short report at the end of the run.
import { LAB_OPTIONS, labQuery, labLabel, labReport, startLabLog } from './lab.js';

const byId = (id) => document.getElementById(id);

function el(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}

function picker(lab) {
  const form = el('form');
  form.className = 'lab-panel';
  form.setAttribute('aria-label', 'Playtest lab rules');
  for (const [key, options] of Object.entries(LAB_OPTIONS)) {
    const label = el('label');
    label.append(el('span', key[0].toUpperCase() + key.slice(1)));
    const select = el('select');
    select.name = key;
    for (const [value, [name]] of Object.entries(options)) {
      const option = el('option', name);
      option.value = value;
      option.selected = lab[key] === value;
      select.append(option);
    }
    const detail = el('small', options[lab[key]][1]);
    select.addEventListener('change', () => { detail.textContent = options[select.value][1]; });
    label.append(select, detail);
    form.append(label);
  }
  const apply = el('button', 'Use these rules');
  apply.type = 'submit';
  form.append(apply);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = Object.fromEntries(Object.keys(LAB_OPTIONS).map((key) => [key, form.elements[key].value]));
    const url = new URL(location.href);
    url.searchParams.set('lab', labQuery(next));
    location.assign(url.href);
  });
  return form;
}

async function copy(text, status) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied. Paste it wherever you send playtest notes.';
  } catch {
    status.textContent = 'Select the report above and copy it.';
  }
}

export function initLab(lab) {
  const log = startLabLog();
  const chip = byId('connection-status');
  if (chip) chip.textContent = 'PLAYTEST LAB · TIMES NOT SAVED';
  const note = byId('leaderboard-note');
  if (note) {
    note.replaceChildren(
      el('strong', 'Playtest lab. '),
      `Rules: ${labLabel(lab)}. Times here are never saved or compared with the leaderboard.`,
      picker(lab),
    );
    note.hidden = false;
  }

  window.addEventListener('stardust:runStart', () => log.reset());
  window.addEventListener('stardust:levelComplete', (event) => {
    const { level, elapsedMs } = event.detail || {};
    if (Number.isFinite(elapsedMs)) log.circuit(level, elapsedMs);
  });
  window.addEventListener('roadmap:runComplete', (event) => {
    const out = byId('starmap-end-save');
    if (!out) return;
    const report = labReport(lab, log.data, event.detail?.totalMs);
    const pre = el('pre', report);
    pre.className = 'lab-report';
    pre.tabIndex = 0;
    const status = el('span');
    status.setAttribute('role', 'status');
    const button = el('button', 'Copy playtest report');
    button.type = 'button';
    button.addEventListener('click', () => copy(report, status));
    out.replaceChildren(el('p', 'Playtest lab run, not saved.'), pre, button, status);
    out.hidden = false;
  });
}

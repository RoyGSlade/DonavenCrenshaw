// The datapad's pages (round 3, basics lane): Captain (stats with what each
// does, the skill tree, spend points anywhere), Pack (credits, gear worn and
// carried, equip here), Jobs (what you are doing, step by step; who is hiring;
// what you have done) and Map (a plan of where you are). Draw only; every
// write goes through the store. All words through textContent.
import { STATS, ITEMS, GIVERS, REP_MAX, MAX_REP_REWARDS, UNLOCK_NAMES, CURRENCY, TREES, SKILLS, ROLL_SKILLS } from '../data.js';
import { unspentPoints, spentPoints, canLearn, rollLevel } from '../character.js';
import { HANGAR_DATA } from '../hangarData.js';
import { money, itemName, repBand } from '../economy.js';
import { statCard, HOW_CHECKS_WORK } from '../story/stats.js';
import { createSkillTree } from '../ui/skillTree.js';
import { iconFor, castPortrait, itemArt } from '../ui/assets.js';
import { RESPEC } from '../hangarSkills.js';
import { GEAR, SLOTS, gearOf, equip, unequip, loadout } from '../shops/shop.js';
import { QUESTS } from '../quests/data/quests/index.js';
import { QUEST_GIVERS } from '../quests/data/givers.js';
import { SECTORS } from '../quests/data/sectors.js';
import { giverOffers, whereText } from '../quests/offers.js';
import { BADGES_DATA } from '../quests/data/badges.js';
import { currentTrack } from './steps.js';
import { BASICS_DATA } from './data.js';
import { icon, stepMark, ITEM_ICONS } from './icons.js';
import { lookFor } from './marks.js';

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k === 'on') for (const [e, f] of Object.entries(v)) node.addEventListener(e, f);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) node.append(c);
  return node;
}
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const NAP = BASICS_DATA.nap;
const fillText = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** "Want points back? Nap at your bunk and pick which: 10 credits a point." (free in the tutorial) */
export function napLine(save, tutorial) {
  const cost = tutorial && RESPEC.freeInTutorial ? NAP.padFree : `${money(RESPEC.feePerPoint)} a point`;
  return fillText(NAP.padLine, { cost });
}

// --- Captain: who you are, what your stats do, and the whole skill tree --------------
export function createCaptainPage({ root, store, toast, tutorialOn, reducedMotion, bus, openLicence }) {
  const side = el('div', { class: 'dp-cap-side' });
  const treeHost = el('div', { class: 'dp-cap-tree ui-tree-host' });
  const detail = el('div', { class: 'dp-cap-detail' });
  const head = el('div', { class: 'dp-cap-points' });
  const tree = createSkillTree({
    root: treeHost, detailRoot: detail, headRoot: head, store, toast, tutorialOn, reducedMotion,
    respec: false, respecNote: (save) => napLine(save, tutorialOn(save)),
    fit: true,
    onLearned: (id) => bus?.emit('hangar:learned', { skill: id }),
  });

  // Phones: every skill by name under the tree (the tree there shows nodes and ranks only, so
  // nothing is clipped or overlaps at 390); tap one to see it in the skill card.
  function skillList(c) {
    return el('div', { class: 'dp-skill-list' }, TREES.map((t) => el('section', { class: 'dp-skill-tree', style: `--tree:${HANGAR_DATA.skillTree.colours[t.id] || '#81e6df'}` },
      el('h4', { text: t.name }),
      el('div', { class: 'dp-skill-chips' }, SKILLS.filter((sk) => sk.trees[0] === t.id).map((sk) => {
        const rank = c.skills?.[sk.id] || 0;
        const can = canLearn(c, sk.id).ok;
        return el('button', { type: 'button', class: `dp-skill-chip${rank ? ' is-learned' : ''}${can ? ' is-ready' : ''}${tree.selected === sk.id ? ' is-selected' : ''}`, 'data-skill-chip': sk.id,
          on: { click: () => { tree.select(sk.id); render(); } } }, el('span', { text: sk.name }), el('b', { text: `${rank}/${sk.max}` }));
      })))));
  }

  function render(save = store.get()) {
    const c = save.character;
    if (!c) {
      fill(root, el('div', { class: 'dp-empty' },
        el('p', { class: 'ui-eyebrow', text: 'NO CAPTAIN YET' }),
        el('h2', { text: 'Nobody to show yet.' }),
        el('p', { text: 'Sign the captain\'s licence first: a face, a name and five rolls of the die.' }),
        el('button', { type: 'button', class: 'ui-btn primary', text: 'Open the licence', on: { click: openLicence } })));
      return;
    }
    const face = castPortrait(c.look.portrait);
    fill(side,
      el('div', { class: 'vy-captain dp-cap-who' },
        face ? el('img', { class: 'vy-badge vy-badge-face', src: face, alt: '', style: `border-color:${c.look.color}` })
          : el('div', { class: 'vy-badge', style: `background:${c.look.color}`, 'aria-hidden': 'true', text: initials(c.name) }),
        el('div', {}, el('p', { class: 'ui-eyebrow', text: `CAPTAIN${c.deaths ? ` · ${c.deaths} DEATH${c.deaths === 1 ? '' : 'S'}` : ''}` }), el('h2', { text: c.name }))),
      el('h3', { class: 'dp-h', text: 'STATS · ROLLED ONCE' }),
      el('ul', { class: 'dp-stats' }, STATS.map((s) => {
        const card = statCard(s.id, c.stats[s.id]);
        const art = iconFor(s.id);
        return el('li', { class: 'dp-stat', dataset: { stat: s.id } },
          art ? el('img', { src: art, alt: '' }) : el('i'),
          el('div', {}, el('strong', { text: s.name }), el('small', { text: card?.line || s.blurb }), card ? el('small', { class: 'dp-odds', text: card.bonus ? `${card.bonus} on attempts · ${card.odds.replace(/^Your odds[^:]*: /, '')}` : card.now }) : null),
          el('b', { 'data-stat': s.id, text: String(c.stats[s.id]) }));
      })),
      // The eight skills a d20 roll adds (levels 1-9).
      el('h3', { class: 'dp-h', text: 'SKILLS · d20 + LEVEL' }),
      el('ul', { class: 'dp-levels' }, ROLL_SKILLS.map((k) => el('li', { dataset: { skill: k.id }, title: k.blurb }, el('span', { text: k.name }), el('b', { text: String(rollLevel(c, k.id)) })))),
      el('details', { class: 'ui-how' }, el('summary', { text: 'How rolls work' }), el('ul', { class: 'vy-list' }, HOW_CHECKS_WORK.map((t) => el('li', { text: t })))));
    tree.render(save);
    fill(root,
      side,
      el('div', { class: 'dp-cap-mid' }, head, treeHost, skillList(c)),
      el('div', { class: 'dp-cap-right' },
        detail,
        el('div', { class: 'dp-points-row' },
          el('span', {}, 'Unspent ', el('b', { text: String(unspentPoints(c)) })),
          el('span', {}, 'Spent ', el('b', { text: String(spentPoints(c)) })),
          el('span', {}, 'Permanent ', el('b', { 'data-points': 'permanent', text: String(c.permanent) }))),
        el('p', { class: 'dp-nap-note', 'data-nap-note': '' }, icon('bunk', 'dp-inline-icon'), el('span', { text: napLine(save, tutorialOn(save)) }))));
  }
  return { render, tree };
}

// --- Pack: credits, what you wear, what you carry -----------------------------------
const SLOT_NAMES = { armour: 'Armour', weapon: 'Sidearm' };
export function createPackPage({ root, store, toast }) {
  function wear(fnResult, line) {
    if (!fnResult.ok) { toast(fnResult.reason); return; }
    store.update(() => fnResult.save);
    if (line) toast(line);
  }
  function itemCell(id, count, extra = null) {
    const art = itemArt(id);
    return el('li', { class: 'dp-item', 'data-item': id },
      art ? el('img', { src: art, alt: '' }) : el('i', { class: 'dp-item-blank' }, icon(ITEM_ICONS[id] || 'pack', 'dp-item-glyph')),
      el('span', {}, el('strong', { text: itemName(id) }), extra ? el('small', { text: extra }) : null),
      el('b', { text: count > 1 ? `×${count}` : '' }));
  }
  function render(save = store.get()) {
    const worn = gearOf(save);
    const kit = loadout(save);
    const owned = (id) => (save.items?.[id] || 0) > 0;
    const slots = SLOTS.map((slot) => {
      const now = worn[slot];
      const choices = Object.keys(GEAR).filter((id) => GEAR[id].slot === slot && owned(id) && id !== now);
      return el('li', { class: 'dp-slot', dataset: { slot } },
        el('p', { class: 'ui-eyebrow', text: SLOT_NAMES[slot].toUpperCase() }),
        el('strong', { text: now ? itemName(now) : slot === 'weapon' ? 'Standard sidearm' : 'Nothing worn' }),
        el('small', { text: now ? GEAR[now].text : slot === 'weapon' ? 'Mel\'s loaner. It shoots where you point it, mostly.' : 'Mel sells armour at her locker.' }),
        el('div', { class: 'dp-slot-actions' },
          ...choices.map((id) => el('button', { type: 'button', class: 'ui-btn', 'data-wear': id, text: `Wear ${itemName(id)}`, on: { click: () => wear(equip(store.get(), id), `${itemName(id)} on.`) } })),
          now ? el('button', { type: 'button', class: 'ui-btn', 'data-unwear': slot, text: 'Take off', on: { click: () => wear(unequip(store.get(), slot), `${itemName(now)} off.`) } }) : null));
    });
    const tools = kit.tools.map((id) => itemCell(id, 1, GEAR[id].text));
    const carried = ITEMS.filter((i) => owned(i.id) && !GEAR[i.id]).map((i) => itemCell(i.id, save.items[i.id]));
    const spare = Object.keys(GEAR).filter((id) => owned(id) && GEAR[id].slot !== 'tool' && !Object.values(worn).includes(id)).map((id) => itemCell(id, 1, `${GEAR[id].text} · not worn`));
    const unknown = Object.keys(save.items || {}).filter((id) => save.items[id] > 0 && !ITEMS.some((i) => i.id === id)).map((id) => itemCell(id, save.items[id]));
    fill(root,
      el('div', { class: 'dp-pack-left' },
        el('div', { class: 'dp-money' },
          iconFor('credits') ? el('img', { src: iconFor('credits'), alt: '' }) : null,
          el('div', {}, el('p', { class: 'ui-eyebrow', text: CURRENCY.name.toUpperCase() }), el('p', { class: 'vy-money', 'data-money': '', text: money(save.money) }))),
        el('h3', { class: 'dp-h', text: 'WORN' }),
        el('ul', { class: 'dp-slots' }, slots),
        el('p', { class: 'ui-note', text: `On foot: ${kit.weapon.name || 'Sidearm'}, +${kit.footHp} health${kit.footSpeed ? `, ${kit.footSpeed > 0 ? '+' : ''}${Math.round(kit.footSpeed * 100)}% speed` : ''}. Buying stays at Mel's locker.` })),
      el('div', { class: 'dp-pack-right' },
        el('h3', { class: 'dp-h', text: 'TOOLS' }),
        tools.length ? el('ul', { class: 'dp-items' }, tools) : el('p', { class: 'ui-note', text: 'No tools yet. Edna and Mel both sell the kind that open doors.' }),
        el('h3', { class: 'dp-h', text: 'CARRIED' }),
        carried.length + spare.length + unknown.length ? el('ul', { class: 'dp-items', 'aria-label': 'Carried' }, [...spare, ...carried, ...unknown]) : el('p', { class: 'ui-note', text: 'Nothing in your pack yet. Jobs pay in parts as well as credits.' })));
  }
  return { render };
}

// --- Jobs: what you are doing now, step by step; who is hiring; what you've done ----
export function stepList(track, { compact = false } = {}) {
  return el('ol', { class: `dp-steps${compact ? ' is-compact' : ''}`, dataset: { track: track.kind } }, track.steps.map((s) => el('li', { class: `dp-step is-${s.state}`, dataset: { step: s.id } },
    stepMark(s.state, 'dp-step-mark is-art') || el('i', { class: 'dp-step-mark', 'aria-hidden': 'true' }, s.state === 'done' ? icon('tick', 'dp-tick') : null),
    el('span', {}, el('span', { class: 'dp-step-text', text: s.text }), s.where ? el('small', { text: s.where }) : null),
    el('span', { class: 'dp-sr', text: s.state === 'done' ? ' (done)' : s.state === 'now' ? ' (now)' : s.state === 'skipped' ? ' (skipped)' : '' }))));
}

// onContinue(): pick the job in progress back up (it plays in the world, round 3).
export function createJobsPage({ root, store, onContinue = () => {} }) {
  function render(save = store.get()) {
    const track = currentTrack(save);
    const now = track
      ? el('section', { class: 'dp-now', 'data-now': track.kind },
        el('p', { class: 'ui-eyebrow', text: track.kind === 'tutorial' ? BASICS_DATA.tracker.tutorialEyebrow : `${BASICS_DATA.tracker.jobEyebrow} · ${(QUEST_GIVERS[track.giver]?.short || '').toUpperCase()}` }),
        el('h2', { text: track.title }),
        stepList(track),
        track.kind === 'job' ? el('button', { type: 'button', class: 'ui-btn primary', id: 'dp-jobs-continue', text: BASICS_DATA.tracker.resume, on: { click: () => onContinue() } }) : null)
      : el('section', { class: 'dp-now is-empty' },
        el('p', { class: 'ui-eyebrow', text: 'NOTHING ON' }),
        el('h2', { text: 'No job running.' }),
        el('p', { class: 'ui-note', text: 'The job board by the bunk has three people who are hiring.' }));
    const done = Object.entries(save.quests?.done || {}).filter(([id]) => QUESTS[id]);
    const badges = (save.account?.unlocks || []).filter((u) => u.startsWith('badge:')).map((u) => BADGES_DATA.badges[u.slice(6)]?.name).filter(Boolean);
    fill(root,
      el('div', { class: 'dp-jobs-left' },
        now,
        el('h3', { class: 'dp-h', text: 'WHO YOU WORK FOR' }),
        el('ul', { class: 'dp-reps' }, GIVERS.map((g) => {
          const rep = save.rep?.[g.id] || 0;
          const prize = MAX_REP_REWARDS[g.id];
          return el('li', { class: 'dp-rep' },
            el('strong', { text: g.name }),
            el('span', { 'data-rep': g.id, text: `${rep} / ${REP_MAX} · ${repBand(rep)}` }),
            el('div', { class: 'vy-bar', role: 'progressbar', 'aria-label': `${g.name} rep`, 'aria-valuemin': '0', 'aria-valuemax': String(REP_MAX), 'aria-valuenow': String(rep) }, el('i', { style: `width:${(rep / REP_MAX) * 100}%` })),
            prize ? el('small', { text: `${save.account?.maxRep?.[g.id] ? 'Earned' : `At ${REP_MAX}`}: +${prize.permanent} permanent skill points, ${prize.unlocks.map((u) => UNLOCK_NAMES[u] || u).join(', ')}` }) : null);
        }))),
      el('div', { class: 'dp-jobs-right' },
        // Jobs you haven't taken are in the world: this says where to go, it does not start them.
        el('h3', { class: 'dp-h', text: 'WHERE THE WORK IS' }),
        el('ul', { class: 'dp-offers' }, Object.keys(QUEST_GIVERS).map((gid) => {
          const list = giverOffers(gid, save);
          return el('li', { class: 'dp-offer-giver', dataset: { giver: gid } },
            el('strong', { text: QUEST_GIVERS[gid].name }),
            el('small', { class: 'dp-offer-where', text: `Find them: ${whereText(gid)}` }),
            el('ul', { class: 'dp-offer-jobs' }, list.map((o) => el('li', { class: `dp-offer${o.ok ? '' : ' is-closed'}`, dataset: { offer: o.id } },
              el('span', { text: o.quest.title }),
              el('small', { text: o.ok ? `${o.pay || 'parts and favours'}${o.deadly ? ' · Deadly' : ''}${o.last ? ` · last time ${o.last.result === 'success' ? 'done' : 'failed'}` : ''}` : o.reasons[0] })))));
        })),
        el('h3', { class: 'dp-h', text: 'DONE' }),
        done.length ? el('ul', { class: 'vy-list', 'data-jobs': '' }, done.map(([id, d]) => el('li', { 'data-job': id }, el('span', { text: `${QUESTS[id].title}: ${d.result === 'success' ? 'done' : 'failed'} (${d.outcome})` }), el('b', { text: `${d.times}×` }))))
          : el('p', { class: 'ui-note', text: 'No jobs finished yet.' }),
        badges.length ? el('p', { class: 'ui-note', text: `Badges: ${badges.join(', ')}` }) : null));
  }
  return { render };
}

// --- Map: a plan of the room you're in, with what's where ---------------------------
export function createMapPage({ root, world, stationInfo = () => null }) {
  const canvas = el('canvas', { class: 'dp-map-canvas', 'aria-hidden': 'true' });
  const legend = el('ul', { class: 'dp-legend' });
  const title = el('h2', {});
  const where = el('p', { class: 'ui-eyebrow' });
  fill(root, el('div', { class: 'dp-map-left' }, canvas), el('div', { class: 'dp-map-right' }, where, title, legend));

  function render() {
    const w = world();
    const map = w?.map;
    if (!map) return;
    where.textContent = 'YOU ARE HERE';
    title.textContent = map.name;
    // clientWidth ignores the pad's opening transform (getBoundingClientRect would not).
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.max(200, Math.round(canvas.clientWidth || 600)), H = Math.max(160, Math.round(canvas.clientHeight || 400));
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = Math.min((W - 24) / map.w, (H - 24) / map.h);
    const ox = (W - map.w * s) / 2, oy = (H - map.h * s) / 2;
    const T = map.tile * s;
    // Floor and walls, as plain shapes.
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      const cell = map.cells[y][x];
      if (!cell || cell === 'void') continue;
      ctx.fillStyle = cell === 'wall' || cell === 'window' ? '#3d566a' : cell === 'hazard' ? '#3a3524' : '#1a2b3b';
      ctx.fillRect(ox + x * T, oy + y * T, T + 0.5, T + 0.5);
    }
    // Props (dim), then what you can use (accent), doors, people, you.
    for (const p of map.props) {
      if (p.layer === 'floor') continue;
      ctx.fillStyle = '#263b4d';
      ctx.fillRect(ox + p.x * s, oy + p.y * s, p.w * s, p.h * s);
    }
    const items = [];
    const labels = [];
    const seen = new Set();
    const aim = w.objectiveAim?.();
    for (const it of map.interacts) {
      if (it.kind === 'npc') continue;
      const station = it.station || (it.kind === 'station' ? it.id : null);
      const look = lookFor(it.kind, station);
      const info = station ? stationInfo(station) : null;
      const door = it.kind === 'door' ? map.doors.find((d) => d.id === it.id) : null;
      const name = info?.name || (door ? door.label : String(it.label || '').split(':')[0]);
      const key = station || `${it.kind}:${it.id}`;
      ctx.fillStyle = look.accent;
      ctx.globalAlpha = info?.locked ? 0.4 : 1;
      if (door) ctx.fillRect(ox + door.x * s, oy + door.y * s, Math.max(4, door.w * s), Math.max(4, door.h * s));
      else { ctx.beginPath(); ctx.arc(ox + it.x * s, oy + it.y * s, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ name, accent: look.accent, kind: door ? 'door' : 'use', locked: info?.locked, icon: look.icon });
        const lx = door ? ox + (door.x + door.w / 2) * s : ox + it.x * s, ly = door ? oy + (door.y + door.h / 2) * s : oy + it.y * s;
        labels.push({ x: lx, y: ly, name, accent: look.accent, locked: info?.locked });
      }
    }
    for (const n of map.npcs) {
      const at = w.npcAt?.(n.id) || n;
      ctx.fillStyle = '#81e6df';
      ctx.beginPath(); ctx.arc(ox + at.x * s, oy + at.y * s, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (aim) {
      ctx.strokeStyle = BASICS_DATA.marks.objective; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ox + aim.x * s, oy + aim.y * s, 10, 0, Math.PI * 2); ctx.stroke();
    }
    // Names on the plan, on a dark tag, kept inside the canvas and clear of each other.
    ctx.font = `700 ${W < 520 ? 10 : 12}px Inter, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    const placed = [];
    for (const l of labels) {
      const tw = ctx.measureText(l.name).width + 12;
      let x = Math.max(4, Math.min(W - tw - 4, l.x - tw / 2)), y = Math.max(12, Math.min(H - 12, l.y - 16));
      for (let i = 0; i < 6; i++) {
        const hit = placed.find((p) => x < p.x + p.w && x + tw > p.x && Math.abs(y - p.y) < 20);
        if (!hit) break;
        y = hit.y + 21;
      }
      placed.push({ x, y, w: tw });
      ctx.globalAlpha = l.locked ? 0.6 : 1;
      ctx.fillStyle = '#050b12e6';
      ctx.fillRect(x, y - 10, tw, 20);
      ctx.fillStyle = l.accent;
      ctx.fillRect(x, y - 10, 3, 20);
      ctx.fillStyle = '#eaf4f5';
      ctx.fillText(l.name, x + 8, y + 1);
      ctx.globalAlpha = 1;
    }
    const me = w.player;
    if (me) {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#05080d'; ctx.lineWidth = 2;
      ctx.save(); ctx.translate(ox + me.x * s, oy + me.y * s); ctx.rotate(me.angle);
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
    legend.replaceChildren(
      el('li', { class: 'dp-legend-me' }, el('i', { class: 'dp-legend-dot', style: '--accent:#fff' }), el('span', { text: 'You' })),
      ...(aim ? [el('li', {}, el('i', { class: 'dp-legend-dot is-ring', style: `--accent:${BASICS_DATA.marks.objective}` }), el('span', { text: `Next: ${aim.label || 'objective'}` }))] : []),
      ...items.map((i) => el('li', { class: i.locked ? 'is-locked' : null, style: `--accent:${i.accent}` }, icon(i.icon, 'dp-legend-icon'), el('span', { text: `${i.name}${i.locked ? ' (not open yet)' : ''}` }))));
  }
  return { render };
}

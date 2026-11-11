// The on-foot layer, wired up: one call gives a page (the hangar, the story's
// tutorial director, the preview) the walking world plus the mining, puzzle,
// shooting and space-hop layers, all emitting the contract's events
// (ROUND2-CONTRACT.md section 4).
//
//   const onfoot = createOnFoot({ root, store, bus: storyBus, hooks, mapId: 'hangar' })
//   bus: the story bus ({ emit, on }); onfoot emits on it and follows story:objective.
//   hooks (all optional):
//     openStation(id)       the hangar lane's station screens (contract station ids)
//     talk(who, context)    after met:<who> is emitted: show that person's idle line if no
//                           tutorial step took the talk (story's idleLine). Return a promise.
//                           Without it (and without a bus) the preview's stand-in lines play.
//     isUnlocked(id)        story's isUnlocked(save, id): gates the helm's targets (explore:<id>)
//     tutorial()            true while the tutorial runs: minigames then grant nothing (the director pays)
//     allow(target)         false blocks an interaction (the director gates tutorial steps)
//     sound(id)             real sound effects (ids: events.js SOUNDS); default: small synth blips
//   onfoot.mine() · puzzle(id) · practice() · fight(setup) · questFight(enemy, seed) · flyTo(target) · helm()
import { createWorld } from './world.js';
import { playMining } from './miningView.js';
import { playPuzzle } from './puzzleView.js';
import { playHack } from './hackView.js';
import { activityMods, hasAccess, accessReason } from './rules/activity.js';
import { missing } from '../economy.js';
import { skillById } from '../character.js';
import { createTalk } from './talk.js';
import { createSfx } from './sfx.js';
import { createEmitter, TUTORIAL_EVENTS, metEvent } from './events.js';
import { STAND_IN } from './standInLines.js';
import { footStats, questFightSetup } from './rules/shooter.js';
import { flyHop } from '../explore/hop.js';
import { PLACES, GIVER_PLACE } from '../explore/rules.js';
import { SECTOR_MAP } from '../maps/index.js';
import { shipTierArt } from '../art.js';
import { visualTier } from '../upgrades.js';
import { effect, skillBonus } from '../character.js';
import { createEl } from './dom.js';

// The tutorial's hop targets, in the order the legs open them.
export const TARGETS_IN_ORDER = Object.freeze(SECTOR_MAP.places.map(p => p.id));

// Npcs who lead the way during a tutorial step (data: step id -> who walks where).
const LEADS = Object.freeze({ ralph: { npc: 'ralph', to: 'scrap' } });

export function createOnFoot({ root, store = null, bus = null, hooks = {}, mapId = 'hangar', spawn = 'default', reducedMotion = () => false, unlocked = [] } = {}) {
  const emit = createEmitter({ bus, sink: hooks.emit || null });
  const sound = createSfx({ play: hooks.sound || null });
  const talkBox = createTalk(root);
  const toastNode = createEl('div', { class: 'of-toast', role: 'status', 'aria-live': 'polite' });
  root.append(toastNode);
  let toastTimer = 0;
  const toast = (text) => { toastNode.textContent = text; toastNode.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3400); };

  // The player's own ship picture: core's tier art for the upgrades they have.
  const shipImages = new Map();
  let world = null;
  const shipArt = () => {
    const tier = store ? visualTier(store.get()) : 0;
    let img = shipImages.get(tier);
    if (!img) { img = new Image(); img.onload = () => world?.redraw(); img.src = shipTierArt(tier); shipImages.set(tier, img); }
    return img.complete && img.naturalWidth ? img : null;
  };

  const save = () => store?.get() || null;
  const captain = () => save()?.character || null;
  const fx = tag => (captain() ? effect(captain(), tag) : 0);
  const mods = (activity) => activityMods(captain(), activity, { levels: hooks.skillLevels || undefined });
  const stats = () => footStats(captain(), { effect, skillBonus, mods: mods('foot') });

  // Gates on doors and interacts (map data): an access id from a skill level
  // ("needs Slicer 2"), a core requirement, or a lock you can hack open.
  function gate(def) {
    if (!def) return null;
    if (def.access && !hasAccess(captain(), def.access, { levels: hooks.skillLevels || undefined })) return { reason: accessReason(def.access, { levels: hooks.skillLevels || undefined, skillName: id => skillById(id)?.name || id }) };
    if (def.requires && store) { const why = missing(save(), def.requires); if (why.length) return { reason: why[0] }; }
    if (def.lock?.hack) return { reason: 'Locked', hack: def.lock.hack };
    return null;
  }

  async function hack(target) {
    const r = await playHack(root, { title: target.label || 'Lock', difficulty: target.level || 1, seed: Date.now() % 100000, mods: mods('hack'), sound, reducedMotion });
    emit(TUTORIAL_EVENTS.hacked, { id: target.id, success: r.success, level: target.level || 1 });
    if (r.success && target.reward && !save()?.flags?.[`hack-${target.id}`]) {
      store?.grant({ ...(inTutorial() ? {} : target.reward), flags: { [`hack-${target.id}`]: 1 } });
      toast(target.rewardText || 'Cracked it.');
    } else if (r.success) toast('Lock open.');
    return r;
  }
  const inTutorial = () => Boolean(hooks.tutorial?.());
  const grant = (reward) => (store && reward && !inTutorial() ? store.grant(reward) : null);

  async function talk(who, context = {}) {
    sound('talk');
    emit(metEvent(who), {});
    if (hooks.talk) await hooks.talk(who, context);
    else if (!bus) await talkBox.show(STAND_IN[who] || [{ who, text: '…' }]);
  }

  async function mine(opts = {}) {
    const r = await playMining(root, { title: opts.title || 'Ore seam', seed: opts.seed || Date.now() % 100000, speed: 1 + fx('mine.speed'), mods: mods('mine'), sound, reducedMotion });
    const g = grant(r.reward);
    if (g && r.ore) toast(`+${r.ore} ore in the hold`);
    emit(TUTORIAL_EVENTS.mined, { ore: r.ore });
    return r;
  }

  async function puzzle(id = 'lockbox', opts = {}) {
    const c = captain();
    const r = await playPuzzle(root, { id, title: opts.title, hintBonus: fx('hint') + (mods('puzzle').hintSooner || 0), freeHint: c?.stats?.wis === 6, sound });
    if (r.solved) { world.unlock(id); emit(TUTORIAL_EVENTS.solved, { puzzle: id }); }
    return r;
  }

  // Mel's range: still targets, then two drones that come at you. Knock them all down.
  async function practice() {
    const zone = world.map.zones.find(z => z.id === 'range');
    const T = world.map.tile;
    const [bx, by] = zone ? [zone.x / T, zone.y / T] : [14, 10];
    const r = await world.fight({
      enemies: [
        { type: 'target', at: [bx + 4.6, by + 0.4] },
        { type: 'target', at: [bx + 5.1, by + 2.6] },
        { type: 'target', at: [bx + 2.6, by + 3.3] },
        { type: 'drone', at: [bx + 5.3, by + 1.4], hp: 12 },
      ],
      player: { ...stats(), hp: Math.max(stats().hp, 90) },
      seed: 7,
    });
    // tutorial:shot fires when the range is finished (every target down), not on a knock-down.
    if (r.outcome === 'win') emit(TUTORIAL_EVENTS.shot, { hits: r.hits, shots: r.shots });
    emit(TUTORIAL_EVENTS.fight, { outcome: r.outcome, hits: r.hits, shots: r.shots, kills: r.kills, practice: true });
    toast(r.outcome === 'win' ? `Range clear. ${r.hits} hits from ${r.shots} shots.` : 'Knocked flat. The range resets; try again.');
    return r;
  }

  /** A live on-foot fight (quests). setup: from questFightSetup(enemy, seed) or hand-made. */
  async function fight(setup) {
    const r = await world.fight({ ...setup, player: { ...stats(), ...(setup.player || {}) } });
    emit(TUTORIAL_EVENTS.fight, { outcome: r.outcome, hits: r.hits, shots: r.shots, kills: r.kills });
    return r;
  }

  /** Fly to a sector place (dustfall, alpha, beacon), dock, and walk into the giver's place. */
  async function flyTo(target) {
    const place = PLACES[target];
    if (!place || target === 'home') throw new Error(`No place ${target}`);
    world.pause();
    world.el.hidden = true;
    emit(TUTORIAL_EVENTS.launched, { target });
    const visited = Object.keys(save()?.flags || {}).filter(k => k.startsWith('poi-')).map(k => k.slice(4));
    const r = await flyHop(root, {
      to: target, shipArt, visited, reducedMotion, sound, scanRange: 1 + fx('scan.range'),
      onPoi: (poi) => {
        emit(TUTORIAL_EVENTS.poi, { id: poi.id });
        if (store) store.grant({ ...(inTutorial() ? {} : poi.reward || {}), flags: { [`poi-${poi.id}`]: 1 } });
      },
    });
    world.el.hidden = false;
    world.resume();
    if (r.arrived) {
      emit(TUTORIAL_EVENTS.exploreArrived, { target });
      if (place.map) world.go(place.map, 'from-dock');
    }
    return r;
  }

  // The helm (or the hangar's launch hatch): pick where to fly. Story's unlocks decide what's open.
  function helm() {
    const open = TARGETS_IN_ORDER.filter(id => (hooks.isUnlocked ? hooks.isUnlocked(`explore:${id}`) : true));
    return new Promise((resolve) => {
      const panel = createEl('section', { class: 'of-panel of-helm', role: 'dialog', 'aria-label': 'Set a course' },
        createEl('p', { class: 'of-eyebrow', text: 'HELM · SET A COURSE' }));
      const close = (value) => { panel.remove(); resolve(value); };
      for (const id of TARGETS_IN_ORDER) {
        const p = PLACES[id];
        const giver = p.giver ? `${p.giver[0].toUpperCase()}${p.giver.slice(1)}` : '';
        const b = createEl('button', { type: 'button', class: 'of-course', disabled: !open.includes(id), dataset: { target: id } },
          createEl('b', { text: p.name }), createEl('span', { text: open.includes(id) ? `${giver ? `${giver} is here. ` : ''}${Math.round(Math.hypot(p.x - PLACES.home.x, p.y - PLACES.home.y))} km` : 'No reason to go yet' }));
        b.addEventListener('click', () => close(id));
        panel.append(b);
      }
      if (!open.length) panel.append(createEl('p', { class: 'of-help', text: 'Nowhere to be yet. Somebody in the hangar will give you a reason.' }));
      const stay = createEl('button', { type: 'button', text: 'Stay docked' });
      stay.addEventListener('click', () => close(null));
      panel.append(stay);
      root.append(panel);
      panel.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }).then(id => (id ? flyTo(id) : null));
  }

  async function interact(target) {
    if (hooks.allow && hooks.allow(target) === false) return null;
    const shut = target.kind === 'hack' && target.door ? null : gate(target);
    if (shut && !shut.hack) { toast(`${target.label}: ${shut.reason}.`); sound('jam'); return null; }
    if (shut?.hack) return hack({ ...target, level: shut.hack });
    switch (target.kind) {
      case 'hack': return hack(target);
      case 'npc': return talk(target.id, { map: world.map.id });
      case 'station': {
        if (hooks.openStation) return hooks.openStation(target.id);
        toast(`${target.label}: the hangar's ${target.id} screen opens here.`);
        return null;
      }
      case 'mine': return mine({ title: target.label?.split(':')[0] });
      case 'puzzle': return puzzle(target.id, { title: target.label });
      case 'range': return practice();
      case 'ship': return target.id === 'helm' ? helm() : null;
      case 'repair': return talkBox.show(STAND_IN.repair);
      case 'console': return talkBox.show(STAND_IN[target.id] || STAND_IN.console.map(l => ({ ...l, name: target.label })));
      default: return null;
    }
  }

  world = createWorld({
    root, mapId, spawn, emit, shipArt, reducedMotion, unlocked, sound,
    hooks: {
      interact,
      locked: (door) => { toast(`${door.label}: ${door.gate?.reason || 'locked'}.`); sound('jam'); },
      gate,
      entered: (map) => hooks.entered?.(map),
    },
  });

  // Follow the story's objective: a marker on its station, a line on screen, and leads.
  const offs = [];
  if (bus?.on) {
    offs.push(bus.on('story:objective', (o) => {
      world.setObjective(o ? { text: o.text, station: o.station || null, npc: null } : null);
      const lead = o && LEADS[o.step];
      if (lead) world.leadTo(lead.npc, lead.to);
    }));
  }

  return {
    world, emit, talk, mine, puzzle, hack, practice, fight, flyTo, helm, toast, sound, gate, mods,
    questFight: (enemy, seed) => fight(questFightSetup(enemy, seed)),
    destroy() { for (const off of offs) off?.(); world.destroy(); toastNode.remove(); },
  };
}

export { GIVER_PLACE };

// The trainer screen (Donaven 2026-11-19), drawn from the pure modules (trainer.js, books.js, gallery.js setup). It uses the skills menu look: a rail
// of the eight skills, each with its own colour and emblem; picking one tints the whole page, so you always see which skill you are in. Each skill
// shows its own training: a shooting gallery, a book, the gym's replay, or (navigation) a slot marked coming. Plain DOM; nothing here keeps state.
import { ROLL_SKILLS } from '../data.js';
import { xpToNext } from './progress.js';
import { unspent } from './picker.js';
import { renderPicker } from './extrasView.js';
import { GYM } from './gym.js';
import { RAIL, SKILL_COLOURS, trainingOf, lessonsFor, gallerySetup, canStart, leftThisHour, galleryLeft, GALLERY_CAP_XP, gymGamesFor, sectorStatus } from './trainer.js';
import { spreadWord } from './gallery.js';
import { renderBook } from './booksView.js';
import { SHOOTING_BASE } from './setup.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); } el.append(...kids.filter(Boolean)); return el; };
const NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));
const emblem = (skill, lit) => new URL(`../ui/skills/emblem-${skill}-${lit ? 'lit' : 'dim'}.webp`, import.meta.url).href;
const button = (text, onClick, attrs = {}) => { const b = h('button', { type: 'button', ...attrs, text }); b.addEventListener('click', onClick); return b; };
const KIND_WORD = { gallery: 'Shooting gallery', book: 'Read and answer', replay: 'Gym replay', sectors: 'Perihelion sectors' };

/** The three shooting paths as drawn pieces: each shrinks or grows with its points, so the loadout shows what the points do. */
function loadoutStrip(setup) {
  const maxMag = SHOOTING_BASE.magazine + 9;
  const bloomTop = SHOOTING_BASE.spread;
  return h('div', { class: 'tr-kit', role: 'list', 'aria-label': 'Your shooting kit' },
    h('div', { class: 'tr-kit-item', role: 'listitem', 'data-path': 'reload' }, h('span', { text: 'Reload' }), h('i', { class: 'tr-bar' }, h('u', { style: `width:${Math.round((100 * setup.reloadSeconds) / SHOOTING_BASE.reload)}%` })), h('b', { text: `${setup.reloadSeconds} s` })),
    h('div', { class: 'tr-kit-item', role: 'listitem', 'data-path': 'ammo' }, h('span', { text: 'Magazine' }), h('i', { class: 'tr-pips' }, ...Array.from({ length: maxMag }, (_, i) => h('u', { class: i < setup.magazine ? 'on' : '' }))), h('b', { text: `${setup.magazine} rounds` })),
    h('div', { class: 'tr-kit-item', role: 'listitem', 'data-path': 'spray' }, h('span', { text: 'Spread' }), h('i', { class: 'tr-ring' }, h('u', { style: `--r:${Math.max(0.12, setup.spread / bloomTop).toFixed(3)}` })), h('b', { text: `${spreadWord(setup.spread)} at rest` })));
}

/**
 * ctx: { state (the workbench state), selected, now, lesson, book: { page, order, answered }, replayLeft... }.
 * handlers: { onSelect(skill), onLesson(n), onStart(), onAnswer(position), onNext(), onReplay(id), onPoints(skill, points), onClose() }.
 */
export function renderTrainer(root, ctx, handlers) {
  const { state, selected, now, lesson = 1, book = { page: null, order: [], answered: null } } = ctx;
  const skill = selected, colour = SKILL_COLOURS[skill], level = state.progress.levels[skill], into = state.progress.xp[skill], need = xpToNext(level);
  const kind = trainingOf(skill);
  const left = kind === 'gallery' ? galleryLeft(state.gymLog, now) : leftThisHour(state.gymLog, skill, now);
  const pts = unspent(skill, state.progress.points[skill], level);
  const points = state.progress.points[skill] || {};

  const rail = h('nav', { class: 'tr-rail', 'aria-label': 'Skills', role: 'listbox' });
  for (const id of RAIL) {
    const on = id === skill, lv = state.progress.levels[id];
    const b = h('button', { type: 'button', class: `tr-skill${on ? ' is-sel' : ''}`, role: 'option', 'aria-selected': String(on), 'data-skill': id, style: `--sk:${SKILL_COLOURS[id]}`, title: `${NAME[id]}: ${KIND_WORD[trainingOf(id)]}` },
      h('img', { class: 'tr-emblem', src: emblem(id, on), alt: '', width: 40, height: 40, draggable: 'false' }), h('b', { text: NAME[id] }), h('span', { text: `Lv ${lv}` }));
    b.addEventListener('click', () => handlers.onSelect(id));
    rail.append(b);
  }

  const hero = h('div', { class: 'tr-hero' },
    h('img', { class: 'tr-emblem-big', src: emblem(skill, true), alt: '', width: 96, height: 96, draggable: 'false' }),
    h('div', { class: 'tr-hero-text' },
      h('h3', { text: NAME[skill] }),
      h('p', { class: 'tr-level', text: `Level ${level}${Number.isFinite(need) ? ` · ${into} of ${need} XP` : ' · top level'}` }),
      h('i', { class: 'ex-bar tr-xp' }, h('u', { style: `width:${Number.isFinite(need) ? Math.round((100 * into) / need) : 100}%` })),
      h('p', { class: 'tr-kind', text: `${KIND_WORD[kind]} · training pays XP, never skill points` })));

  const wallet = h('p', { class: 'tr-wallet', id: 'gm-wallet', role: 'status', text: kind === 'book' || kind === 'sectors' ? `${state.credits} credits · ${kind === 'book' ? 'pages' : 'sectors'} are free` : `${state.credits} credits · the gym still pays ${left} of ${kind === 'gallery' ? GALLERY_CAP_XP : GYM.capXp} ${NAME[skill]} XP this hour` });

  const train = h('div', { class: 'tr-train', 'data-kind': kind });
  if (kind === 'gallery') {
    const lessons = lessonsFor(level);
    const setup = gallerySetup({ level, points, lesson });
    const can = canStart(skill, { credits: state.credits, log: state.gymLog, now });
    train.append(
      h('h4', { class: 'tr-h', text: 'Shooting gallery' }),
      h('p', { class: 'rp-help', text: 'Targets slide left and right and pop up. Hit them before the clock runs out. Bullseyes, accuracy and finishing under par each add XP.' }),
      h('div', { class: 'tr-lessons', role: 'group', 'aria-label': 'Lesson' }, ...lessons.map((l) => {
        const b = button(`${l.id} ${l.name}`, () => handlers.onLesson(l.id), { class: `tr-lesson${l.id === lesson ? ' is-on' : ''}`, 'data-lesson': String(l.id), 'aria-pressed': String(l.id === lesson), disabled: !l.open, title: l.open ? `${l.targets} targets, ${l.time} s, par ${l.par} s` : `Opens at shooting level ${l.unlockLevel}` });
        if (!l.open) b.append(h('small', { text: `level ${l.unlockLevel}` }));
        return b;
      })),
      loadoutStrip(setup),
      h('p', { class: 'rp-help', text: 'Spend skill points below: a faster reload shortens the bar, a bigger magazine adds rounds, a narrower spray shrinks the ring.' }),
      button(`Start the round (${GYM.cost} credits)`, handlers.onStart, { class: 'primary ui-btn tr-start', disabled: !can.ok, title: can.reason }));
    if (!can.ok) train.append(h('p', { class: 'bk-note is-warn', text: can.reason }));
  } else if (kind === 'book') {
    renderBook(train, { skill, page: book.page, order: book.order, answered: book.answered, level, learnedMap: state.learned, learned: book.page ? Boolean(state.learned?.[book.page.id]) : false, canAnswer: { ok: true, reason: '' } }, { onAnswer: handlers.onAnswer, onNext: handlers.onNext });
    train.append(h('p', { class: 'rp-help tr-fee', text: 'Pages are free. Each pays its XP once, the first time you answer it right.' }));
  } else {
    if (kind === 'sectors') {
      train.append(h('h4', { class: 'tr-h', text: 'Perihelion: plot the burn' }),
        h('p', { class: 'rp-help', text: 'Five sectors, opened in order (a star opens the next). Each star pays 2 XP, once. Free to fly.' }),
        h('ul', { class: 'tr-sectors' }, ...sectorStatus(state.navProgress).map((x) => h('li', { class: `tr-sector${x.unlocked ? '' : ' is-locked'}`, 'data-sector': String(x.index) },
          h('b', { text: `${x.number}. ${x.name}` }),
          h('span', { class: 'tr-stars', 'aria-label': `${x.stars} of 3 stars` }, ...[1, 2, 3].map((n) => h('span', { class: n <= x.stars ? 'on' : '', text: '★' }))),
          h('small', { text: x.unlocked ? (x.bestTurns != null ? `best ${x.bestTurns} turns, ${Math.round(x.bestFuel)} fuel` : 'not flown yet') : 'locked: earn a star on the sector before' }),
          button(x.stars ? 'Fly again' : 'Fly', () => handlers.onSector(x.index), { class: 'tr-fly', 'data-sector': String(x.index), disabled: !x.unlocked })))));
    } else {
      const games = gymGamesFor(skill);
      train.append(h('h4', { class: 'tr-h', text: 'Gym replay' }),
        games.length ? h('ul', { class: 'gm-list' }, ...games.map((g) => {
          const can = canStart(skill, { credits: state.credits, log: state.gymLog, now });
          return h('li', { class: 'gm-card', 'data-game': g.id }, h('b', { text: g.name }),
            h('span', { class: 'gm-skill', text: `${g.skill}, always a Steady roll, with the points you have spent` }),
            h('span', { text: `A win pays a quarter of the field XP. ${left} of ${GYM.capXp} XP left this hour.` }),
            h('div', { class: 'gm-row' }, button(`Train (${GYM.cost} credits)`, () => handlers.onReplay(g.id), { class: 'wb-train', 'data-game': g.id, disabled: state.credits < GYM.cost, title: state.credits < GYM.cost ? can.reason : null })));
        })) : h('p', { class: 'rp-help', text: 'Nothing to replay yet.' }));
    }
  }

  const pointsBox = h('div', { class: 'tr-points-body' });
  renderPicker(pointsBox, { progress: state.progress, selected: skill, inGym: true }, handlers.onPoints);
  const details = h('details', { class: 'tr-points', open: ctx.pointsOpen ? true : null }, h('summary', { text: pts ? `Skill points: ${pts} to spend` : 'Skill points: all spent' }), pointsBox);
  details.addEventListener('toggle', () => handlers.onPointsToggle?.(details.open));

  root.replaceChildren(
    h('div', { class: 'tr-root', 'data-skill': skill, style: `--sk:${colour}` }, rail, hero, wallet, train, details,
      h('p', { class: 'rp-help wb-said', role: 'status', text: state.said }),
      h('div', { class: 'gm-row' }, button('Close', handlers.onClose))));
}

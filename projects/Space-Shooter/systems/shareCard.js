// The finish screen's Share button: draws a 1200x630 card for the run just flown
// (time, track, rank, pilot, their ship in its livery) and hands it to the
// browser's share sheet, or downloads it and copies the link.
//
// Nothing here runs until the pilot taps Share: finishScreen.js imports this file
// on click. Everything on the card is already public (the pilot's name and
// leaderboard place) or their own ship; it is drawn in the browser and goes nowhere
// but the share sheet or a download. The pure parts (wording, links, layout fit)
// are tested in tests/stardust-share-card.test.mjs; the picture is checked by eye
// in docs/stardust/evidence/card/. The hub draws a matching text-and-silhouette
// card for link previews (api/lib/shareCard.js in the hub repo): keep the two
// looking alike.
import { clock } from './hubRuns.js';

export const CARD_W = 1200;
export const CARD_H = 630;
export const CARD_URL_TEXT = 'donavencrenshaw.com/stardust';

const COLOR = { bg0: '#050a12', bg1: '#0c2133', cyan: '#47d8f5', gold: '#ffd173', text: '#eaf8ff', muted: '#8fb0bd', strip: '#030710', pillText: '#231808' };
// The vendored fonts, loaded under private names so they cannot clash with page fonts.
const MONO = "'SD Card Mono', Consolas, 'Courier New', monospace";
const DISPLAY = "'SD Card Display', Georgia, serif";
const SHIP_AT = { x: 940, y: 316, size: 470, tilt: 24 };

// --- Wording ---------------------------------------------------------------------------

const clean = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** A name that fits: whitespace tidied, long ones cut with an ellipsis. */
export function fitName(value, max = 24) {
  const chars = [...clean(value)];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

const shipClass = (family) => (family ? `${fitName(family, 18).toUpperCase()} CLASS` : 'STANDARD SHIP');

/**
 * Everything the card prints, from what the finish screen knows.
 *   kind        'weekly' | 'network'
 *   timeMs      the time on the card (the pilot's best when a ranked weekly, else the run)
 *   trackName   "Gantry Drop"; for the network, left empty ("Full network")
 *   kicker      the line top right, "WEEKLY TIME TRIAL · WEEK 1"
 *   rank        a confirmed leaderboard place, or null
 *   pilotName   null for a guest
 *   family      ship family name ("Needle"), or null for the standard ship
 */
export function cardModel({ kind = 'weekly', timeMs, trackName = '', kicker = '', rank = null, pilotName = null, family = null } = {}) {
  const track = kind === 'network' ? 'Full network' : (fitName(trackName, 40) || 'Weekly');
  const place = Number.isInteger(rank) && rank > 0 ? rank : null;
  return {
    kind,
    time: clock(timeMs),
    track: track.toUpperCase(),
    kicker: fitName(kicker, 34).toUpperCase(),
    pilot: fitName(pilotName, 24) || 'Guest',
    ship: shipClass(family),
    rankLabel: place ? `#${place} ON THE ${kind === 'weekly' ? 'WEEKLY' : 'LEADERBOARD'}` : '',
    rank: place,
  };
}

/** The message that goes with the card: "I flew 1:52.50 on Gantry Drop in Stardust (#3). Race my ghost." */
export function shareMessage({ kind = 'weekly', timeMs, trackName = '', rank = null, ghost = false } = {}) {
  const where = kind === 'network' ? 'the full network' : (fitName(trackName, 40) || 'the weekly');
  const place = Number.isInteger(rank) && rank > 0 ? ` (#${rank})` : '';
  return `I flew ${clock(timeMs)} on ${where} in Stardust${place}. ${ghost ? 'Race my ghost.' : 'Beat it.'}`;
}

// --- Links -------------------------------------------------------------------------------

const hubLink = (hubOrigin, path) => (hubOrigin ? `${String(hubOrigin).replace(/\/+$/, '')}${path}` : null);

/**
 * The address the card carries. A hub /s/ link unfurls with a picture and lands the
 * friend on the run; without one (a guest, a time the hub did not accept, a hub
 * that is asleep) it is the site's weekly page or the game, and the time is in
 * the message instead.
 *   via: 'hub-weekly' | 'hub-challenge' | 'weekly' | 'game'
 */
export function shareLink({ kind = 'weekly', eventId = null, username = null, challengeId = null, hubOrigin = null, weeklyUrl = '', gameUrl = '', ranked = false } = {}) {
  if (kind === 'weekly') {
    const hub = ranked && eventId && username ? hubLink(hubOrigin, `/s/w/${encodeURIComponent(eventId)}/${encodeURIComponent(username)}`) : null;
    if (hub) return { url: hub, via: 'hub-weekly' };
    return weeklyUrl ? { url: weeklyUrl, via: 'weekly' } : { url: gameUrl, via: 'game' };
  }
  const hub = challengeId ? hubLink(hubOrigin, `/s/c/${encodeURIComponent(challengeId)}`) : null;
  return hub ? { url: hub, via: 'hub-challenge' } : { url: gameUrl, via: 'game' };
}

/** A file name for the downloaded card: stardust-gantry-drop-1-52-50.png. */
export function cardFileName(model) {
  const slug = `${model.track}-${model.time}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `stardust-${slug}.png`;
}

// --- Drawing ----------------------------------------------------------------------------------

function seedOf(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}

/** The type size at which `text` fits `maxWidth` in the font set on ctx (measured, so a missing font still fits). */
export function fitFontSize(ctx, text, maxWidth, maxSize, fontOf) {
  ctx.font = fontOf(maxSize);
  const width = ctx.measureText(text).width;
  return width <= maxWidth ? maxSize : Math.max(12, Math.floor(maxSize * (maxWidth / width)));
}

function write(ctx, text, x, y, { size, fill, font = MONO, spacing = 0, align = 'left' }) {
  ctx.font = `700 ${size}px ${font}`;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  // letterSpacing is not in every browser; without it the text is just a little tighter.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/**
 * Paints the card on a 1200x630 context. `ship` is a canvas or image of the ship
 * (pointing up) or null for none. Same layout as the hub's preview card.
 */
export function drawCard(ctx, model, { ship = null } = {}) {
  const left = 64;
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, COLOR.bg0);
  bg.addColorStop(1, COLOR.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Stars, from the time and name so a card never changes between renders.
  let s = seedOf(`${model.pilot}${model.time}`) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(207,239,255,${(0.25 + next() * 0.55).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(Math.round(next() * CARD_W), Math.round(next() * (CARD_H - 70)), 0.6 + next() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // The glow behind the ship, then faint grid lines.
  const glow = ctx.createRadialGradient(SHIP_AT.x, SHIP_AT.y, 0, SHIP_AT.x, SHIP_AT.y, 320);
  glow.addColorStop(0, 'rgba(71,216,245,0.42)');
  glow.addColorStop(0.55, 'rgba(71,216,245,0.10)');
  glow.addColorStop(1, 'rgba(71,216,245,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(SHIP_AT.x - 320, SHIP_AT.y - 320, 640, 640);
  ctx.strokeStyle = 'rgba(71,216,245,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 11; i += 1) { ctx.beginPath(); ctx.moveTo(i * 120 + 0.5, 0); ctx.lineTo(i * 120 + 0.5, CARD_H); ctx.stroke(); }

  if (ship) {
    ctx.save();
    ctx.translate(SHIP_AT.x, SHIP_AT.y);
    ctx.rotate((SHIP_AT.tilt * Math.PI) / 180);
    const flame = ctx.createRadialGradient(0, SHIP_AT.size * 0.36, 0, 0, SHIP_AT.size * 0.36, SHIP_AT.size * 0.3);
    flame.addColorStop(0, 'rgba(217,251,255,0.9)');
    flame.addColorStop(0.4, 'rgba(71,216,245,0.55)');
    flame.addColorStop(1, 'rgba(71,216,245,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(0, SHIP_AT.size * 0.36, SHIP_AT.size * 0.07, SHIP_AT.size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'rgba(71,216,245,0.55)';
    ctx.shadowBlur = 36;
    ctx.drawImage(ship, -SHIP_AT.size / 2, -SHIP_AT.size / 2, SHIP_AT.size, SHIP_AT.size);
    ctx.restore();
  }

  // Edge accent and the wordmark.
  ctx.fillStyle = model.kind === 'weekly' ? COLOR.gold : COLOR.cyan;
  ctx.fillRect(0, 0, 8, CARD_H);
  write(ctx, 'STARDUST', left, 88, { size: 40, fill: COLOR.cyan, font: DISPLAY, spacing: 10 });
  if (model.kicker) write(ctx, model.kicker, CARD_W - 64, 84, { size: 20, fill: COLOR.muted, spacing: 3, align: 'right' });

  // The time, big, then the track, pilot and ship.
  const column = 690;
  const timeSize = fitFontSize(ctx, model.time, column, 150, (size) => `700 ${size}px ${MONO}`);
  const trackSize = fitFontSize(ctx, model.track, column, 50, (size) => `700 ${size}px ${DISPLAY}`);
  write(ctx, 'FINISH TIME', left, 152, { size: 22, fill: COLOR.muted, spacing: 5 });
  write(ctx, model.time, left - 6, 298, { size: timeSize, fill: COLOR.text, spacing: -4 });
  write(ctx, model.track, left, 376, { size: trackSize, fill: '#ffffff', font: DISPLAY, spacing: 2 });
  write(ctx, model.pilot, left, 434, { size: 30, fill: COLOR.text });
  write(ctx, model.ship, left, 471, { size: 21, fill: COLOR.cyan, spacing: 4 });
  if (model.rankLabel) {
    ctx.font = `700 24px ${MONO}`;
    const width = Math.round(ctx.measureText(model.rankLabel).width + 44);
    ctx.fillStyle = COLOR.gold;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(left, 490, width, 46, 23) : ctx.rect(left, 490, width, 46);
    ctx.fill();
    write(ctx, model.rankLabel, left + width / 2, 521, { size: 24, fill: COLOR.pillText, align: 'center' });
  }

  // The footer strip.
  ctx.fillStyle = 'rgba(3,7,16,0.86)';
  ctx.fillRect(0, CARD_H - 72, CARD_W, 72);
  ctx.fillStyle = 'rgba(71,216,245,0.55)';
  ctx.fillRect(0, CARD_H - 72, CARD_W, 2);
  write(ctx, 'BEAT IT', left, CARD_H - 27, { size: 24, fill: COLOR.gold, spacing: 3 });
  ctx.strokeStyle = COLOR.gold;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(left + 150, CARD_H - 44); ctx.lineTo(left + 168, CARD_H - 36); ctx.lineTo(left + 150, CARD_H - 28);
  ctx.moveTo(left + 134, CARD_H - 36); ctx.lineTo(left + 166, CARD_H - 36);
  ctx.stroke();
  write(ctx, CARD_URL_TEXT, CARD_W - 64, CARD_H - 27, { size: 24, fill: COLOR.cyan, align: 'right' });
}

// --- Loading what the card needs (only after the pilot taps Share) -----------------------------

let fonts = null;
const FONT_URLS = [
  ['SD Card Mono', new URL('../art/fonts/space-mono-700.woff2', import.meta.url).href, '700'],
  ['SD Card Display', new URL('../art/fonts/cinzel-latin.woff2', import.meta.url).href, '400 900'],
];

/** Loads the two vendored fonts once. A font that fails to load leaves its fallback stack, so the card still draws. */
export function loadCardFonts(env = globalThis) {
  fonts ||= Promise.all(FONT_URLS.map(async ([family, href, weight]) => {
    try {
      const face = new env.FontFace(family, `url(${href}) format('woff2')`, { weight });
      await face.load();
      env.document.fonts.add(face);
      return true;
    } catch { return false; }
  }));
  return fonts;
}

function loadImage(href) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not load.'));
    image.src = href;
  });
}

/**
 * The pilot's ship as a picture, in its livery: { image, family }. `appearance` is the
 * design the run was flown in (null for the standard ship). Part images load here,
 * not on the finish screen. A ship that cannot be drawn yields { image: null }; the
 * card then just has no ship.
 */
export async function loadCardShip(appearance) {
  try {
    const ships = await import('./shipAppearance.js');
    const design = appearance ? ships.cleanAppearance(appearance) : null;
    if (design) {
      await ships.loadShipKits();
      const resolved = ships.resolveAvailableAppearance(design);
      const style = ships.SHIP_STYLES.find((entry) => entry.id === resolved.family);
      return { image: ships.renderAppearance(resolved, null, 768), family: resolved.family === 'courier' ? 'Courier' : (style?.name || null) };
    }
    return { image: await loadImage(new URL('../art/player-ship.png', import.meta.url).href), family: null };
  } catch {
    return { image: null, family: null };
  }
}

/** Draws the card on a fresh canvas. */
export async function renderCard(model, { ship = null } = {}) {
  await loadCardFonts();
  const canvas = Object.assign(document.createElement('canvas'), { width: CARD_W, height: CARD_H });
  drawCard(canvas.getContext('2d'), model, { ship });
  return canvas;
}

// --- Sharing -------------------------------------------------------------------------------------

const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/png'));

async function copyText(text, env) {
  try {
    await env.navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

function download(blob, name, env) {
  const url = env.URL.createObjectURL(blob);
  const a = env.document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  env.document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => env.URL.revokeObjectURL(url), 10_000);
}

/**
 * Builds what a Share tap sends: the card as a File, the text and the link.
 * `ship` is the picture of the ship to draw (a canvas or image), or null.
 */
export async function prepareShare({ model, link, message, ship = null }, env = globalThis) {
  const canvas = await renderCard(model, { ship });
  const blob = await toBlob(canvas);
  const file = new env.File([blob], cardFileName(model), { type: 'image/png' });
  return { file, blob, text: `${message} ${link}`, link, title: 'Stardust', filename: file.name };
}

/**
 * From what the finish screen knows to a card ready to send. `info` (built by
 * runSaving.js) is the run: { kind, timeMs, trackName, kicker, rank, pilotName,
 * username, eventId, ranked, appearance, hubOrigin, weeklyUrl, gameUrl, challenge }.
 * `challenge` is an optional async function that makes a challenge link on the hub
 * and resolves to its id (or null); it runs only here, when the pilot asked to share.
 */
export async function assembleShare(info, deps = {}) {
  const { loadShip = loadCardShip, prepare = prepareShare, env = globalThis } = deps;
  const [ship, challengeId] = await Promise.all([
    loadShip(info.appearance),
    typeof info.challenge === 'function' ? Promise.resolve(info.challenge()).catch(() => null) : null,
  ]);
  const link = shareLink({ ...info, challengeId });
  const model = cardModel({ ...info, family: ship.family });
  const message = shareMessage({ ...info, ghost: link.via === 'hub-weekly' });
  return { ...(await prepare({ model, link: link.url, message, ship: ship.image }, env)), via: link.via };
}

/**
 * Sends a prepared card: the share sheet with the picture when the browser can
 * share files, otherwise a download of the PNG and the link copied. The link is
 * inside `text` as well, because several apps drop a separate url when a file is attached.
 * Resolves to 'shared' | 'cancelled' | 'blocked' | 'downloaded'. 'blocked' means the browser
 * wanted a fresher tap (Safari after a slow render): call again straight from a click.
 * `copied` on the result says whether the link reached the clipboard (downloads).
 */
export async function sendShare(prepared, env = globalThis) {
  const nav = env.navigator;
  const data = { files: [prepared.file], title: prepared.title, text: prepared.text };
  if (typeof nav?.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [prepared.file] })) {
    try {
      await nav.share(data);
      return { outcome: 'shared', copied: false };
    } catch (error) {
      if (error?.name === 'AbortError') return { outcome: 'cancelled', copied: false };
      if (error?.name === 'NotAllowedError') return { outcome: 'blocked', copied: false };
      // Any other failure: fall back to the download.
    }
  }
  download(prepared.blob, prepared.filename, env);
  return { outcome: 'downloaded', copied: await copyText(prepared.text, env) };
}

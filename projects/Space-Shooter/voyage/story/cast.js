// The cast: who speaks, where they stand, and what to call them on screen.
// The bible (voice, looks, history) is lhc-lanes/stardust/story/CAST.md.
// Ids are ROUND2-CONTRACT.md section 1. Portraits arrive from the cast lane;
// until then `portrait` is null and the caption shows initials. The quest
// givers' portraits already live in core's art map (voyage/art.js).
import { giverPortrait } from '../art.js';

export const CAST = Object.freeze({
  chibby: { name: 'Chibby', role: 'Your mechanic', station: 'pad', color: '#ffc46b' },
  ralph: { name: 'Ralph', role: "Chibby's dog (mostly)", station: 'kennel', color: '#9fe870', sound: true },
  mel: { name: 'Mel', role: 'Outfitter', station: 'locker', color: '#ff8fa3' },
  edna: { name: 'Edna', role: 'Tea, knitting, other things', station: 'backroom', color: '#b9a4ff' },
  hask: { name: 'Hask', role: 'Stationmaster, Alpha Relay', sector: 'alpha', color: '#81e6df', giver: true },
  vey: { name: 'Vey', role: 'Broker, Beacon Prime', sector: 'beacon', color: '#f4d35e', giver: true },
  garrity: { name: 'Garrity', role: 'Salvage boss, Dustfall', sector: 'dustfall', color: '#ffad72', giver: true },
  narrator: { name: 'Relay Night', role: 'Late-night lane radio', color: '#cfe8ff' },
});
export const CAST_IDS = Object.freeze(Object.keys(CAST));
export const HANGAR_CAST = Object.freeze(['chibby', 'ralph', 'mel', 'edna']);
export const GIVER_CAST = Object.freeze(['garrity', 'hask', 'vey']);

// Cast-lane portraits, filled in when they land (file names under voyage/art/cast/).
const PORTRAITS = Object.freeze({});

/** A portrait URL for a cast member, or null (show initials). */
export function castPortrait(id) {
  if (CAST[id]?.giver) return giverPortrait(id);
  return PORTRAITS[id] ? new URL(`../art/cast/${PORTRAITS[id]}`, import.meta.url).href : null;
}

export const castName = (id) => CAST[id]?.name || id;

# Stardust soundtrack prompt pack

Copy each **Style prompt** into Suno Custom mode with **Instrumental** enabled. Paste the paired **Exclude** text into Advanced Options → Exclude when that field is available. Suno documents both controls; if the interface changes, keep “instrumental” and the exclusions in the main description. Prompts specify a musical direction, not a guaranteed duration, tempo, or loop: verify the rendered take and edit it in an audio editor before import. No artist names or imitation requests are used. [Suno: Custom Mode](https://help.suno.com/en/articles/3197377) and [Exclude](https://help.suno.com/en/articles/3161921) (official help, accessed 2026-09-26).

## Cue map

| ID / proposed file | Cue | Target |
| --- | --- | --- |
| `ST-MENU` → `stardust_menu_v01.wav` | Start/menu | restrained, welcoming loop |
| `ST-L1` → `stardust_alpha-relay_v01.wav` | Level 1: Alpha Relay | open, low-pressure motion |
| `ST-L2` → `stardust_beacon-prime_v01.wav` | Level 2: Beacon Prime | gravity and discovery |
| `ST-L3` → `stardust_dustfall-station_v01.wav` | Level 3: Dustfall Station | precision, industrial space |
| `ST-L4` → `stardust_nether-crossing_v01.wav` | Level 4: Nether Crossing | readable threat and evasion |
| `ST-L5` → `stardust_iron-veil_v01.wav` | Level 5: Iron Veil | mastery exam, layered pressure |
| `ST-SECRET` → `stardust_reverse-gate_v01.wav` | Reverse-gate discovery | familiar gate motif turned backward |
| `ST-WARDEN` → `stardust_warden_v01.wav` | Warden fight, phases 1–3 | one theme with escalating arrangement |
| `ST-RIDDLE` → `stardust_seal-riddle_v01.wav` | Timed seal | sparse, calm focus bed |
| `ST-WIN` → `stardust_warden-victory_v01.wav` | Secret victory | earned release, short resolve |

Imported 2026-09-26: all ten owner-supplied Suno MP3s are wired into the game. `projects/Space-Shooter/systems/music.js` is the runtime cue manifest; accepted files are under `assets/audio/stardust/`. The WAV names above remain a suggested future editing-master convention. Music waits for a gesture, crossfades over 800 ms, and retains the music slider's gain through transitions. Menu, sectors, secret eligibility, Warden, timed seal and victory select their own cues. Victory plays once (also used for normal network completion); other tracks repeat until their scene changes. Full tracks are preserved without loop edits, so musical loop seams still need listening review. Laser, impact, pickup and exact gate tones remain separate SFX. See [import and rights record](SOUNDTRACK-IMPORT.md).

## Copy/paste prompts

Use Custom mode, turn on Instrumental, and give each generation the exact title shown. The BPM is a target; generated audio may drift. Prompts ask for short sections with stable starts/ends so a human can select and edit a loop.

### `ST-MENU` — Stardust: Quiet Orbit

**Target:** 78 BPM · calm curiosity · menu loop, 45–75 seconds before edit.

**Style prompt**

> Instrumental game soundtrack for a physics-first deep-space racing game menu, 78 BPM, slow half-time pulse, spacious and quietly curious rather than sad. Warm analog synth bass, soft glassy arpeggio, restrained low toms, wide dark pads, and a small three-note rising motif with a clean held final note. Leave room for UI sounds; keep energy even, no dramatic build, no hard ending. Compose a stable 8-bar section that can be edited into a seamless loop. No vocals.

**Exclude:** vocals, speech, choir, loud drums, risers, impacts, cinematic booms, abrupt stop, distorted lead, artist imitation.

**Edit:** select a stable 8- or 16-bar span; match start/end waveform and ambience; add a short equal-power crossfade only if needed. Test the loop for clicks and audible harmonic jumps.

### `ST-L1` — Alpha Relay: Open Thrust

**Target:** 104 BPM · forward, spacious · Level 1 loop.

**Style prompt**

> Instrumental level music for Alpha Relay, an open asteroid course that teaches thrust, coasting, turning and braking. 104 BPM, light forward motion with generous negative space. Rounded bass ostinato, crisp but soft electronic ticks, airy synth chords, and a simple two-note idea that occasionally opens into a third note. Keep percussion sparse and hazards legible; optimistic through exploration, not triumphant. Stable repeating 8-bar bed, no vocal, no huge drops.

**Exclude:** vocals, speech, choir, dense percussion, aggressive distorted guitars, sirens, weapon sounds, giant risers, sudden ending, artist imitation.

**Edit:** loop a stable 8/16 bars; preserve low-frequency space for engines and collisions.

### `ST-L2` — Beacon Prime: Gravity Well

**Target:** 112 BPM · wonder with controlled tension · Level 2 loop.

**Style prompt**

> Instrumental space-game level cue for Beacon Prime, where a readable gravity well can be avoided or used for a slingshot. 112 BPM, controlled orbital momentum and curious scale. Rounded pulsing synth bass, a slow rotating arpeggio, soft metallic bell accents, restrained kick, and long notes that bend gently upward then settle. Make it feel inviting but slightly dangerous; no sudden hits that could mask gameplay cues. Stable 8-bar loop with a clear downbeat and no final cadence.

**Exclude:** vocals, speech, choir, frantic drums, horror stingers, impacts, sirens, huge orchestral hits, abrupt ending, artist imitation.

**Edit:** choose a stable loop whose bass pulse is metrically clear; avoid obvious melody changes across the seam.

### `ST-L3` — Dustfall Station: Narrow Drift

**Target:** 96 BPM · focused, industrial · Level 3 loop.

**Style prompt**

> Instrumental level cue for Dustfall Station, a derelict mining structure with tight corridors that reward braking and controlled drift. 96 BPM, focused industrial sci-fi without becoming a combat track. Muted metallic percussion, low warm synth sequence, occasional filtered clanks, narrow midrange pulses and distant airy tones. Keep the beat steady and the arrangement uncluttered so the player can concentrate on precision movement. Stable repeating 8-bar bed, no vocals, no dramatic transitions.

**Exclude:** vocals, speech, choir, heavy metal, industrial noise wall, random impacts, alarms, busy lead melody, risers, abrupt ending, artist imitation.

**Edit:** reduce or remove any sharp transient that resembles collision/SFX; loop a consistent section.

### `ST-L4` — Nether Crossing: Predictive Fire

**Target:** 120 BPM · alert, mobile · Level 4 loop.

**Style prompt**

> Instrumental game cue for Nether Crossing, the first level with predictive Sentinel drones and alternate routes. 120 BPM, alert and agile, built for evasion rather than aggression. Dry electronic kick, syncopated muted synth bass, short rising pulses, cool pads, and a restrained repeating three-note figure. Keep dynamics controlled, with a little forward push and clear space for enemy telegraphs. Stable 8-bar loop, no vocals, no hard drops or fake alarm sounds.

**Exclude:** vocals, speech, choir, sirens, alarm beeps, gunfire, explosions, relentless heavy drums, trailer impacts, abrupt ending, artist imitation.

**Edit:** keep attacks soft enough that telegraph SFX remain obvious; loop on a downbeat.

### `ST-L5` — Iron Veil: The Exam

**Target:** 126 BPM · tense mastery · Level 5 loop.

**Style prompt**

> Instrumental level cue for Iron Veil, the first mastery exam combining gravity, enemies, debris and tight routes. 126 BPM, confident momentum with layered tension, not a boss fanfare. Pulsing bass sequence, firm restrained drums, dark wide pads, and two interlocking synth patterns that add motion without crowding the center. Build intensity gradually over 16 bars, then return cleanly to the original loop energy. No vocals, no sudden stop, no giant cinematic hit.

**Exclude:** vocals, speech, choir, constant maximum intensity, sirens, weapon sounds, huge impacts, chaotic percussion, abrupt ending, artist imitation.

**Edit:** if the generated build will not loop cleanly, export a steady 8/16-bar bed and use the build only as a one-shot layer.

### `ST-SECRET` — Reverse Gate: The Other Side

**Target:** 72 BPM · uncanny recognition · short discovery cue, 12–20 seconds.

**Style prompt**

> Short instrumental secret-discovery cue for a hidden gate entered from the rear. 72 BPM, quiet uncanny recognition rather than horror. Begin with three clear, soft synth notes descending in the exact reverse contour of a simple ascending gate motif; then let a warm low pad bloom under a thin glass resonance. Keep the notes separated and exposed, with no chord wash hiding their order. One clean 4-bar phrase, gentle tail, no vocals. This is atmosphere only; the game’s exact puzzle signal will be authored separately.

**Exclude:** vocals, speech, choir, jump scare, reversed speech, harsh dissonance, alarm, impact, long noisy reverb, artist imitation.

**Edit:** retain the cue as a one-shot; author the real gate motif as deterministic game tones so the clue does not depend on this rendered performance.

### `ST-WARDEN` — Warden: Mirrored Gravity

**Target:** 132 BPM · ominous, kinetic · one theme with three phase edits.

**Style prompt**

> Instrumental secret-boss theme for the Warden in a physics-based space game, 132 BPM. Write one memorable, original four-note motif; establish it low and spacious, then transform the same motif across three connected sections: phase 1 sparse mirrored pulse, phase 2 denser percussion and a rising bass counterline for gravity reversal, phase 3 full but controlled layered synths for false gates. Keep the tempo and motif identity consistent so phase changes are readable. No vocals, no artist imitation, no abrupt ending.

**Exclude:** vocals, speech, choir, unrelated melodies between phases, sirens, gunfire, constant wall of sound, horror shrieks, trailer impacts, artist imitation.

**Edit:** make three clearly named stems or timeline regions from the same theme. If phase boundaries cannot be cut cleanly, keep one loop and use game-authored percussion/filters for transitions.

### `ST-RIDDLE` — Anomalous Seal: Four Echoes

**Target:** 60 BPM · calm concentration · 2-minute bed.

**Style prompt**

> Instrumental puzzle-room background for a two-minute sequence seal after a space-boss encounter. 60 BPM, calm concentration with quiet cosmic unease. Soft sustained pad, very sparse low pulses every few beats, faint high glass texture and plenty of silence for optional game-authored clue tones and interface sounds. Keep harmony steady, do not signal a specific answer, do not create a four-note sequence, no crescendo that obscures the timer. Seamless 8-bar loop, no vocals.

**Exclude:** vocals, speech, choir, melody with a four-note ordered pattern, ticking clock, alarm, percussion fills, impacts, rising urgency, abrupt ending, artist imitation.

**Edit:** loop the quietest stable phrase under the countdown. Puzzle tones and accessibility cues must be separate, deterministic game audio and must also have visible equivalents.

### `ST-WIN` — Warden Down: Safe Passage

**Target:** 88 BPM · relief and earned resolve · one-shot, 20–35 seconds.

**Style prompt**

> Short instrumental victory cue after defeating the hidden Warden and resolving its seal. 88 BPM, earned relief and forward-looking wonder, restrained rather than bombastic. Begin with a low suspended chord, bring back the Warden’s four-note motif transformed into a warm ascending resolution, then finish with a clear soft final chord and natural short tail. Small synth ensemble, gentle low percussion, no vocals, no extra battle sounds, no endless loop.

**Exclude:** vocals, speech, choir, fanfare brass, victory stingers, explosive impacts, long fade, abrupt cutoff, artist imitation.

**Edit:** one-shot, no loop; trim silence but preserve the resolved chord and short tail.

## Naming and import rule

For future edited masters, use `stardust_<cue-slug>_vNN.wav` alongside a source record containing the Suno song URL/ID, creation/download dates, plan state, prompt, Exclude text, edits and rights evidence. The current delivery consists of MP3 originals; converting them to WAV would not recover lossless source quality. Runtime copies live in `assets/audio/stardust/`, and originals remain in the supplied Downloads folder. Version any future replacement; do not silently overwrite a reviewed master. The [import ledger](SOUNDTRACK-IMPORT.md) retains current song IDs, hashes and the owner's paid-plan attestation.

Before shipping, listen on headphones and laptop speakers, test loop seams, check loudness against gameplay SFX, and play muted to verify no clue or required feedback exists only in the mix. Suno generations are candidates, not loop-ready deliverables by default.

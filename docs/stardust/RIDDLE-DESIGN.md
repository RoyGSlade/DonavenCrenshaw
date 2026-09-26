# Stardust hidden seal riddle

**Developer reference: contains spoilers for the implemented post-Warden seal.** This document records the puzzle's design rationale and original proposed copy. The running clue text and validation live in `engine/levels.js`, `systems/progression.js` and `ui/overlays.js`; those files are the current implementation. The ordinary game remains finishable without this discovery. Generated music sets mood but is never the only source of an answer.

## Player-facing text

Show the four fragments during the run, attached to the four echo marks at the indicated levels. Use the exact glyph label as the first word so the player can match lore to the seal even if color, sound, or shape perception differs.

| Level | Echo mark and clue fragment |
| --- | --- |
| 1 — Alpha Relay | **HORIZON** — “I watched the horizon. I was sealed first.” Pad ID `blue`; symbol `△`; label **Horizon**. |
| 2 — Beacon Prime | **FALLEN STAR** — “I followed the fallen star. I was sealed second.” Pad ID `green`; symbol `✦`; label **Fallen star**. |
| 3 — Dustfall Station | **HOME** — “I faced home. I was sealed third.” Pad ID `pink`; symbol `⌂`; label **Home**. |
| 4 — Nether Crossing | **SHADOW** — “I refused the light. I was sealed last.” Pad ID `purple`; symbol `◯`; label **Shadow**. |

At the secret room, show this full instruction before the timer starts:

> **THE FOUR ECHOES REMEMBER THE OUTBOUND JOURNEY. RETURN THEM IN REVERSE ORDER.**

The input pads are exactly `{id: 'blue', symbol: '△', label: 'Horizon'}`, `{id: 'green', symbol: '✦', label: 'Fallen star'}`, `{id: 'pink', symbol: '⌂', label: 'Home'}`, and `{id: 'purple', symbol: '◯', label: 'Shadow'}`. Color is redundant. The outbound order is Horizon → Fallen star → Home → Shadow; the only correct return sequence is:

> **PURPLE / SHADOW → PINK / HOME → GREEN / FALLEN STAR → BLUE / HORIZON**

This is a memory/order puzzle with all needed evidence surfaced in the same run. The ordinal fragments establish outbound order; “reverse” asks for the return trip. The glyphs and colors are redundant with the written labels. Do not silently change IDs, symbols, labels, clue order, or sequence in implementation.

## Runtime and accessibility contract

- Start a 120-second real-elapsed countdown only after the complete instruction and all four inputs are visible. It continues while the game is paused or the tab loses focus; state this before the attempt begins.
- Keep the full instruction and four clue fragments available in a readable journal/panel during the challenge. No player should have to remember an inaccessible prior screen.
- Show each input as a large button with text, unique silhouette, and focus state. Never distinguish answers by color alone. Use normal keyboard activation, visible focus, and a live announced status such as “2 of 4 entered.”
- Provide optional deterministic game-authored tones for each pad and for success/error. The answer remains completely solvable with master/music/SFX muted. Suno output is not a puzzle signal.
- Collect four pad selections without checking each one against the answer or revealing which position was wrong. After the fourth selection, evaluate the complete sequence. On a wrong complete order, visibly say the sequence was rejected, clear all four selections, and allow immediate retry while time remains; do not give per-press correctness feedback. On timeout, show the failure plainly. Failure sends the player back to the normal run; replaying the secret boss is required to reopen the seal. Clue knowledge remains available on the next attempt.
- On success, stop the timer, play the authored success cue if sound is enabled, and open a local victory/secret-unlocked state. Do not claim an account/platform achievement until the game has a verified account service and writes it successfully.

## Acceptance checks for implementation

1. With sound off and grayscale/color-vision simulation, a tester can read all fragments, inspect the same facts in the seal, enter the reverse sequence, and succeed.
2. Keyboard-only play can focus and activate every pad; focus, entered order, wrong input, remaining time, and success are clear without relying on color or audio.
3. The exact reverse sequence succeeds. Wrong sequences are checked only after four selections, reset as a whole without identifying the incorrect position, and can be retried before timeout.
4. Timer begins only after instructions are visible, runs on real elapsed time during pause/focus loss, and timeout follows the documented replay path.
5. No Suno file, music volume setting, or platform account is required for clue access, correctness, or local completion.

## Integration boundary

The arena, encrypted shard, exit gate, seal UI and local discovery storage are implemented. Account achievements and private server-held answer validation are not. This puzzle's answer and trigger conditions are already public in source, tests and repository history. See [the README's secret policy and Hub work](README.md#remaining-work) before creating the next puzzle; do not put undisclosed future answer tables into this public reference. Keep existing success local until a service independently validates an eligible reward.

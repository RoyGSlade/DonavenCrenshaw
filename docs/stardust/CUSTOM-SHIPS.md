# Dogfight custom ships

Choose Light, Medium or Heavy in the Dogfight lobby, then choose any RGB body and accent colors. The preview and flying ships use the same original canvas hull renderer, with three distinct silhouettes. Choices save locally in `stardust.dogfight.ship.v1`; malformed or unavailable storage falls back to Medium. This change applies to Dogfight, not solo sectors.

| Class | Hull | Top speed | Thrust / turn vs. Medium | Hull size |
| --- | ---: | ---: | ---: | ---: |
| Light | 80 | 18 | 125% / 125% | 88% |
| Medium | 100 | 15 | 100% / 100% | 100% |
| Heavy | 140 | 12 | 80% / 80% | 116% |

Medium retains the shared solo flight configuration. Class deltas adjust the same flight routine; weapons, boost cost, trap recharge and resource rules stay shared. Collision radii scale with hull size. These are initial playtest values, not a claim of competitive balance. At time expiry, the higher **percentage** of remaining hull wins; equally healthy Light and Heavy ships draw.

Create/join locks both loadouts for the room, including rematches. Leave the room to change ships. The relay accepts only an allowlisted class and two six-digit hex colors, sends both loadouts to both clients, and rejects snapshots that change the selected class/paint or invent extra maximum hull. The host remains the simulation authority for casual play. An older relay without loadouts produces a clear update message.

Health labels now sit above each moving ship, follow interpolated positions, stay upright while ships turn, and use that class's maximum hull. Labels hide for destroyed ships and when returning to the lobby. Cyan/orange pilot rings and YOU/P1/P2 labels identify pilots independently of their paint; paint does not make opponents indistinguishable. The top HUD retains the round timer.

Verification:

```powershell
node --test tests/stardust-ships.test.mjs
node scripts/test-stardust-ships-browser.mjs
```

Six focused checks cover paint sanitation, class movement/collision/health, projectile destruction, fair timeouts, invalid stats and frozen relay loadouts/rematches. The real two-browser check covers saved paint and preview, both clients' classes/colors, movement of HP labels, actual damage and victory, rematch reset, lobby unlock and phone sizing. It saves local screenshots under `output/stardust/custom-ships-*.png`. This is local browser evidence; physical controller, phone sensor and public internet validation are separate.

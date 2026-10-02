# Controller setup and settings

Open **Controls & settings → Controller** in the hangar or from paused flight.
Connect by USB or Bluetooth, focus the game, press a controller button, then
release it. The panel names the detected device and shows whether it is ready,
waiting for neutral, disconnected, unavailable, or exposed without standard
mapping. This is browser detection; it does not promise every controller works
on every OS/browser/connection.

**Automatic** uses a fresh button press to choose the active device instead of
letting an idle or virtual first pad mask another controller. Once activated,
other devices cannot steal that choice. Choose a device explicitly with the
dropdown (keyboard or D-pad left/right) to keep it selected. An explicit choice
stays local to this browser and waits for the chosen device on reconnect rather
than silently falling back. Menus, binding capture, touch takeover, solo and
Dogfight read the same selection.

**Start input test** shows raw axes, the tuned stick response, trigger pressure,
and held buttons. Menu actions are suspended during the test. Hold **B/Circle**
for one second, or use **End input test**, to leave it. Returning to menus waits
for release, so that press cannot also close settings. Closing settings, losing
focus, changing device or starting a binding capture ends the test.

| Setting | Default | Range | Effect |
| --- | --- | --- | --- |
| Stick deadzone | 20% | 0–45%, 1% steps | Ignores drift at or below the threshold. |
| Trigger deadzone | 8% | 0–30%, 1% steps | Ignores resting pressure on fire, trap and trigger-bound thrust/reverse. |
| Stick sensitivity | 1.00× | 0.50–2.00×, 0.05 steps | Changes the response curve for movement/turning; full travel remains 100%. |

At sensitivity 1, output outside the deadzone keeps the prior flight response.
The curve is `sign(axis) * abs(axis) ** (1 / sensitivity)` after the deadzone.
It does not increase full-lock turn speed or full throttle. **Reset tuning**
restores these three values. **Reset bindings** separately restores controller
buttons and stick layout. Tuning saves through the existing flight preferences
and settings codes; legacy codes leave it unchanged. Hardware IDs are excluded
from settings codes and account sync.

After focus loss, overlays, device changes or reconnect, flight still requires
neutral. The panel and flight warning name blocking controls and suggest raising
the appropriate deadzone when a released control registers drift. Nonstandard
devices have an honestly labeled raw axes/buttons test; their assumed standard
flight/menu mapping is disabled. Keyboard and touch remain usable.

The settings UI retains camera, auto fire, tilt, keys/mouse, HUD/layout editing,
sound, comfort and sharing. Flight preferences save immediately; sound/comfort
save with **Done**, as before. Category tabs support arrows, Home/End and normal
keyboard focus. Controller navigation adjusts sliders and device choice without
opening a native select popup. Phone layouts and reduced-motion preferences are
preserved.

For browser verification, run `scripts/test-stardust-controller-browser.mjs`
against a local preview, with `PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL` and optional
`STARDUST_TEST_URL` / `STARDUST_EVIDENCE_DIR`. It exercises synthetic Gamepad API
devices through the actual UI/input paths and blocks external requests/writes.
Physical controller compatibility and feel still require a hardware playtest.

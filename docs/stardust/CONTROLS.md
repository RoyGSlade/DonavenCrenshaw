# Stardust camera settings and bindings

Everything here lives in the pause panel's **Flight settings**, saved per device (`stardust.flight.v1`) and carried in share codes. Code: `systems/flightSettings.js` (storage, option lists, share code), `systems/keybinds.js` (bindings, pure), `engine/systems/camera.js`, `ui/settingsPanel.js`.

## Camera tab

| Setting | What it does | Steps | Default |
| --- | --- | --- | --- |
| Camera | Track view (screen keeps the track's orientation) or Behind ship (the view turns so the ship points up) | 2 | Track view |
| Field of view | How much track fits on screen, both cameras | 80 to 150 | 100 |
| Distance | Behind ship: how far down the screen the ship sits | 55% to 90% | 66% |
| Stiffness | 1 holds the camera still; lower lets it pull back and widen with speed | 0 to 1 | 0.25 |
| Swivel speed | Behind ship: how fast the view follows the ship's heading | 1 to 6 | 3 |
| Transition speed | How fast the view moves when the camera is switched | 1 to 4 | 2 |

The camera is drawing only: physics, inputs and replays do not depend on it. A wider field of view does show more track, the same for everyone who sets it.

## Keys tab

Two slots per action; a slot takes a key or a mouse button. Binding an input that is in use moves it from its old action. Esc always pauses and cancels a rebind; Backspace clears a slot. The mouse can be bound to actions (fire, boost and so on) and never steers.

Defaults: W/↑ thrust, S/↓ reverse, A/← and D/→ turn, Q and E strafe, Shift boost, X brake, Ctrl and left click fire, Space launch, C switch camera, M minimap, F fullscreen.

## Controller tab

One button per action, on the standard gamepad layout. Thrust and Reverse can be put on a button or an analog trigger as well as the stick. Sticks: "Left moves, right turns" (default) or "Left turns, right strafes". Menus always use the D-pad or left stick, A and B.

Defaults: A launch, Y boost toggle, LB boost hold, RB brake, RT fire, X switch camera, D-pad down minimap, Back pause, Start fullscreen.

## Not covered

Dogfight has its own input code and keeps the standard mapping.

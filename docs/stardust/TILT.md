# Stardust tilt steering

Status: **code-complete and unit-tested. The dogfight client and the main-game `tilt.js` module both ran
in headless Chromium with simulated sensor events. Not yet checked on a real phone over HTTPS.**
Nothing below proves how it feels in the hand. See "What only a real phone can verify" at the end.

Files:

- `projects/Space-Shooter/systems/tiltSteering.js` has the pure math: gravity to roll, the curve, the filter, calibration, and accelerometer sign detection. It has no DOM.
- `projects/Space-Shooter/systems/mobileControls.js` holds `createTiltController`. It wires the sensor events, permission, visibility handling, and config loading into that math.
- `projects/Space-Shooter/systems/tilt.js` holds the main game's controller instance. The dogfight client creates its own.
- `projects/Space-Shooter/systems/tilt-config.json` holds the tuning. It is fetched at runtime, and the defaults in `tiltSteering.js` mirror it (a test keeps them identical).
- Tests: `tests/stardust-tilt.test.mjs`, which is pure math, `tests/stardust-mobile-controls.test.mjs`, which covers the controller, and `tests/stardust-mobile-input.test.mjs`, which checks that tilt reaches `pumpInput`.

## Why the old tilt felt bad

The old code computed steering as `gamma·cos(screenAngle) + beta·sin(screenAngle)` from the Euler angles, set neutral from the first reading, reached full lock at 24°, used exponent 1.35, and applied a 65 ms low-pass.

1. **Euler angles are not a steering angle.** With the W3C Z-X'-Y'' convention, `gamma` is rotation about the device's own long axis:
   - Held upright, that axis is vertical, so gamma is yaw, not steering.
   - Held flat, gamma is pure tilt.
   - In between, the same wheel-style turn reads with a different size depending on how far back you hold the phone. Test: in landscape, a 10° turn read 9.4° at 20° back but 3.4° at 70° back.
   - Near upright, beta approaches ±90 and the Euler decomposition flips (gimbal lock), so readings jump.
2. **The screen-angle blend was fragile.** `cos`/`sin` of the angle just picks beta or gamma, so the pitch problem above changed sides whenever the phone rotated.
3. **Full lock at 24° with a power curve was twitchy.** Hand tremor alone moved the output.
4. **Neutral came from a random first sample.** That sample was often taken while the phone was still moving after the tap.

## Research summary

Each item is sourced or marked *from knowledge*.

### Sensor sources

- **W3C DeviceOrientation Event spec.** Euler angles are intrinsic Z-X'-Y'' with `R = Rz(alpha)·Rx(beta)·Ry(gamma)`. The spec gives the full matrix. At rest, `accelerationIncludingGravity` for a device lying face up is `{0, 0, 9.8}`, which points *up*, away from the ground. The device coordinate frame "does not change" when the screen rotates. `requestPermission()` needs a secure context and transient user activation, and without activation it rejects with `NotAllowedError`. The spec defines `interval` in milliseconds. [w3.org/TR/orientation-event](https://www.w3.org/TR/orientation-event/)
- **Gravity from orientation.** The up vector in device coordinates is the third row of R: `(-cos β sin γ, sin β, cos β cos γ)`. Alpha (heading) drops out, so browsers that send `alpha = null` because they have no compass work fine. A test checks this against an independently multiplied `Rz·Rx·Ry`. Once the angles are turned into a rotation matrix and gravity vector, the Euler discontinuities stop mattering, because the matrix is continuous. This is the standard fix and the core of this rebuild.
- **The accelerometer sign differs by platform.**
  - A 2014 W3C list thread reports Android following the spec (`z = +9.81` face up) and iOS reporting it inverted (`z = -9.81`). [public-geolocation 2014-11](https://lists.w3.org/Archives/Public/public-geolocation/2014Nov/0005.html)
  - A 2025 on-device iPhone report (iOS 18.7) found its formulas matched raw accelerometer data, but the write-up is ambiguous about the absolute sign. [paulgibeault PR #171](https://github.com/paulgibeault/paulgibeault.github.io/pull/171)
  - Other projects still list the iOS sign as an unverified assumption. [flux-hourglass #4](https://github.com/jeiel85/flux-hourglass-android/issues/4)
  - **Decision: detect the sign at runtime; do not assume it.** See "Gravity sign" below.
- **Chrome's `deviceorientation`.** Since Chrome 50 it is *relative*, "game" orientation from the rotation-vector sensors (fused, no magnetometer), which matches Safari. The absolute version is `deviceorientationabsolute`. [Chrome blog](https://developer.chrome.com/blog/device-orientation-changes)
  - *From knowledge:* this makes orientation-derived gravity gyro-fused and smooth. Raw `accelerationIncludingGravity` also picks up linear acceleration, such as jerking the phone. That is why both sources are supported and the preference is set in config.
- **Sensor rates.** Both events arrive at about 60 Hz on iPhone (measured at 59.8 Hz in PR #171). The same report found iOS gives `devicemotion.interval` in *seconds*, not the spec's milliseconds, and saw event streams stall for up to about 2 s. So this code timestamps readings with `performance.now()` itself and never trusts `interval`. It also sends steering back to 0 when readings go stale for 350 ms.

### Screen orientation

- **`screen.orientation.angle`** is 0, 90, 180 or 270. 90 means the content is rotated 90° clockwise relative to the natural orientation. [MDN ScreenOrientation.angle](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/angle)
- **On an iPhone, angle 90 means the top of the device points to the player's left.** That was measured on real hardware in PR #171, with `gamma ≈ -84` when held upright. This code's rotation agrees with that reading, and a test checks it.
- **Legacy `window.orientation`** uses -90, 0, 90 and 180. It is normalized so that -90 becomes 270.
- *From knowledge:* native Android racers remap sensor axes by display rotation, using `SensorManager.remapCoordinateSystem` with `Display.getRotation()`. That is the same step as `toScreenFrame` here.

### Permission and HTTPS

- **iOS 13+ needs permission.** `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()` are separate methods. Both return `"granted"` or `"denied"`, both need transient activation, and both work only over HTTPS. [MDN requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- **This code calls both synchronously inside the tap handler, before any `await`.** Either one being granted is enough.
- *From knowledge:* on iOS the two methods cover the same "Motion & Orientation Access" setting.
- PR #171 also found that iOS refuses motion permission inside sandboxed iframes. Stardust runs top-level, so this does not apply today.
- **Plain HTTP gets no sensors.** Sensor events are secure-context only, so a LAN `http://192.168…` link cannot use tilt. The UI says so and offers the steering buttons instead.

### How good tilt steering behaves

All of this section is *from knowledge*, based on Unity mobile racers, the Asphalt, Real Racing and Mario Kart Tour tilt modes, and RC transmitter "expo".

- **Steer by roll of the screen about its own normal**, the way you turn a steering wheel. Measure it against gravity projected into the screen plane. Do not use raw accelerometer X, whose strength depends on pitch, and do not use Euler gamma.
- **Offer a recenter action, and calibrate at the start of a race.** Most racers have "calibrate", and many auto-center when the race starts. Clamp the calibration so a bad capture cannot cause a permanent pull.
- **Use a small dead zone, a response curve, and a full lock of about 30–45°.** Beyond that range the wrist gets uncomfortable and the screen becomes unreadable. Curves that are softer near center (expo) are standard. A pure power curve has zero slope right after the dead zone, which adds to the dead zone and feels numb. RC-style expo, `(1-e)·u + e·u³`, keeps some linear slope.
- **Filter adaptively.** A fixed low-pass forces a trade between jitter and lag. The One Euro filter raises its cutoff as speed increases, so it smooths heavily while you hold still and adds little lag during a deliberate turn. (Casiez, Roussel & Vogel, CHI 2012, [gery.casiez.net/1euro](https://gery.casiez.net/1euro/), *from knowledge*)
- **Fade out when the phone is flat.** With the phone flat, gravity is almost entirely along the screen normal. Its projection into the screen plane is tiny, so the in-plane angle is mostly noise and can swing 180° from a 1° wobble.
- **Pause when the game is not visible.** On `visibilitychange` or `blur`, output 0 and drop filter history, so the ship does not lurch when the player comes back. This follows the Page Visibility API.

## Pipeline as built

```
devicemotion.accelerationIncludingGravity ─┐ (sign resolved)          preferred (config)
deviceorientation α,β,γ → gravityFromOrientation ─┘ fallback
    → up vector (device frame)
    → toScreenFrame(screenAngle)              0 / 90 / 180 / 270, exact quarter turns
    → roll = atan2(-x_s, y_s)                 + = clockwise as the player sees it = right
      pitch = atan2(|z_s|, hypot(x_s, y_s))   0 = upright, 90 = flat
      confidence = 1 − smoothstep(72°, 85°, pitch)
    → relative = angleDelta(roll, neutral)
    → One Euro filter (on degrees)
    → steeringResponse: dead zone 3°, full lock 40°, expo 0.35
    → × confidence → axis in [-1, 1]
```

**Pitch independence.** Say the phone is pitched back p and then turned r about the screen normal. The up vector in screen coordinates is `(-sin r·cos p, cos r·cos p, sin p)`, so `atan2(-x, y) = r` for any p below 90°. Tests confirm that 20°, 45° and 70° back give identical steering in portrait and in both landscapes. Real Chromium, fed a simulated hold, gave 0.4598 at 45° back and 0.4601 at 70° back.

**Gravity sign.** `createGravitySignResolver` votes on each motion sample:

- When orientation readings are live, it compares against orientation-derived gravity (dot product > 0.6 or < -0.6).
- Otherwise it relies on a physical fact: a player looking at the game has the screen's top above its bottom and/or the screen facing the sky (`y_s + 0.5·z_s` beyond ±0.35).

It locks after 4 consistent votes. Until then, orientation drives steering. One known weak case: a motion-only browser used by a player lying on their back with the phone overhead and screen facing down could lock the wrong sign. Orientation is available on current iOS and Android browsers, so the cross-check normally wins.

**Neutral and calibration.**

- Absolute roll 0 means the screen is level. That is a sane default, so steering works from the very first reading.
- `calibrate()` averages the next 300 ms of steady readings, using a circular mean weighted by confidence. It needs at least 3 samples.
- If the readings spread more than 8°, the window restarts. After 1.5 s it gives up and uses whatever it has.
- The result is clamped to ±25°.
- During calibration, steering keeps using the previous neutral, so recentering mid-race does not drop steering.
- The controller calibrates automatically when tilt is enabled. The game should also call `calibrateTiltControls()` at the start line. That call is **not wired yet**, because it belongs to the race-start code, which this change does not touch.

**Orientation change.**

- When the screen angle changes, neutral resets to 0, the filter resets, and output is held at 0 for 250 ms while the phone swings round.
- After that, a calibration window runs and captures the new comfortable hold.

**Blur and hidden tab.**

- The output goes to 0 and filter history is dropped. Neutral is kept, since gravity-based roll makes a kept neutral safe.
- While the tab is hidden, readings are ignored.
- If no reading arrives for 350 ms, output goes to 0.

## Constants (`tilt-config.json`) and why

| Key | Value | Why |
|---|---|---|
| `DEAD_ZONE_DEG` | 3 | After filtering, jitter is about ±0.3° standard deviation, and a relaxed grip drifts by about 1–2°. 3° absorbs both without feeling dead, because the expo curve has live slope right past it. |
| `FULL_LOCK_DEG` | 40 | The old 24° lock was twitchy. 40° sits inside a comfortable wrist roll and keeps the screen readable at full lock. Response: 10° → 0.13, 20° → 0.33, 30° → 0.61, 40° → 1. |
| `EXPO` | 0.35 | RC-style `(1-e)u + e·u³`. It is softer through the middle than linear, with no numb zone after the dead zone. Set 0 for linear or 1 for fully cubic. |
| `FILTER_MIN_CUTOFF_HZ` | 2.5 | At rest the time constant is about 64 ms, inside the 50–80 ms brief. Measured: 60 Hz jitter with standard deviation 0.91° drops to 0.32° (2.8× less). |
| `FILTER_BETA` | 0.015 | Cutoff rises by 1.5 Hz per 100°/s. A deliberate 25° step reaches 50% in about 17 ms and 90% in about 67 ms at 60 Hz. |
| `FILTER_DERIVATIVE_CUTOFF_HZ` | 1 | The One Euro paper's default. |
| `FLAT_FADE_START_DEG` / `END` | 72 / 85 | Full authority up to 72° back, so 70° holds are unaffected. Confidence is 0.56 at 78°, 0.14 at 82° and 0 at 85°. Past about 85°, in-plane gravity is under 9% of g and its angle is mostly noise. |
| `CALIBRATION_MS` | 300 | About 18 samples at 60 Hz. That is short enough to feel instant and long enough to average out tremor. |
| `CALIBRATION_MAX_MS` | 1500 | The window never hangs, even if the phone never holds steady. |
| `CALIBRATION_MAX_SPREAD_DEG` | 8 | A phone still swinging from the tap is not a neutral. |
| `CALIBRATION_CLAMP_DEG` | 25 | A calibration taken mid-turn, or with the phone on its side, can only bias steering this much. |
| `ORIENTATION_SETTLE_MS` | 250 | Mobile browsers take about 300 ms to animate a rotation, and readings during that time are meaningless. |
| `PREFERRED_SOURCE` | `"motion"` | As briefed: the accelerometer with sign detection. Set `"orientation"` to prefer the gyro-fused stream (see the tuning notes). |

The file is fetched with `fetch(new URL('./tilt-config.json', import.meta.url))` when the controller is created, without blocking the permission tap. Bad or missing values fall back to the defaults and are range-clamped. An explicit `config` passed to `createTiltController` takes priority over the file.

## Tuning on a phone

`getTiltDebug()` (main game) or `controller.getDebug()` (dogfight) returns `source`, `screenAngle`, `roll`, `neutral`, `confidence`, `axis`, `calibrating` and `motionSign`. It is additive and gameplay does not use it.

- **Too twitchy:** raise `FULL_LOCK_DEG` to 45 or `EXPO` to 0.5.
- **Too lazy:** lower `FULL_LOCK_DEG` to 32–35.
- **Jitter at rest:** lower `FILTER_MIN_CUTOFF_HZ` to 1.8.
- **Lag in fast flicks:** raise `FILTER_BETA` to 0.03.
- **Steering spikes when the player jerks the phone:** switch `PREFERRED_SOURCE` to `"orientation"`. The accelerometer includes linear acceleration; the fused orientation stream does not.

## What only a real phone can verify

These need a real phone over HTTPS. Use the public site or an HTTPS tunnel; the LAN HTTP link cannot use sensors.

1. **iOS permission.** Tapping Enable should show one prompt. Granting it should enable tilt, and denying it should keep the buttons usable. Then check what happens on the next Enable after a denial.
2. **The real `accelerationIncludingGravity` sign on iPhone and Android.** Check which sign locks (`getTiltDebug().motionSign`), and that turning right steers right in both landscapes and in portrait.
3. **Angle 90 vs 270 on Android Chrome and iOS Safari.** Rotate between the two landscapes mid-race: steering should hold at 0 briefly, then recenter on the new grip.
4. **Feel of the constants.** Check the dead zone, the 40° lock, the expo and the filter, both on the start line and mid-race after a Recenter.
5. **Accelerometer vs orientation.** Compare how much hand shake leaks into steering with `"motion"` versus `"orientation"`.
6. **Flat on a table and lying back.** With the phone flat on a table, the ship should go straight. Also check what happens when playing while lying back.
7. **Real-world stalls.** App-switch, lock and unlock, and notification shade: steering should not lurch when the player returns.

Headless Chromium only proved that the module loads and the config file is fetched (HTTP 200). It also proved that the landscape (90) and portrait (0) mapping, symmetry, flat fade, recenter and stale-to-zero behaviour work with *simulated* `deviceorientation` events. Chromium sent no `devicemotion` there, so the motion path is covered only by unit tests.

## Player settings (pause panel, touch devices only)

Three steppers under Flight settings, saved per device in `stardust.flight.v1` (`tilt`), applied on top of `tilt-config.json` through the controller's `setTuning`:

| Setting | Config value | Steps | Default |
| --- | --- | --- | --- |
| Tilt sensitivity | `EXPO` (the curve between dead zone and max tilt) | 1 to 7: 0.9, 0.65, 0.35, 0.15, 0, -0.3, -0.6 | 3 (0.35) |
| Max tilt | `FULL_LOCK_DEG` (tilt for a full turn) | 15, 20, 25, 30, 35, 40, 45, 50, 60° | 40° |
| Tilt dead zone | `DEAD_ZONE_DEG` | 0, 1, 2, 3, 4, 6, 8, 10, 12° | 3° |

A negative `EXPO` bends the curve the other way: quick off centre, gentle near full lock. The defaults equal the tuned config, so nothing changes until a player moves a setting. Not yet tried on a real phone.

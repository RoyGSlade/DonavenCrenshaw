# Home-network playtest — September 26, 2026

The running home-network game is **http://192.168.1.15:4174/projects/Space-Shooter/**. Both phones should use the home Wi-Fi, not guest Wi-Fi or cellular. The user confirmed that the real phone loads this link.

For solo play, select **Launch expedition**. For Dogfight, select **Dogfight 1v1**. One pilot creates a room; the other enters its eight-character code and joins. The relay address is automatic on the LAN page. The existing desktop preview at 127.0.0.1:4173 also connects to this same relay and shares its rooms.

Keep the laptop awake and connected to Ethernet. Keep the host player's game tab visible: hiding or stalling it interrupts the round. Leaving a match closes its room. A new round requires both pilots to select **Ready for rematch**.

## Phone controls

Refresh both phones after the mobile-control update; create a fresh Dogfight room. **GAS / REVERSE** are on the left. **FIRE / BRAKE / BOOST** are stacked from top to bottom on the right. In solo, tap **BOOST** after the countdown to launch from the portal; release and press again to boost during flight. Dogfight now uses the solo boost: hold to repeat every 0.25 seconds while flux or pips remain. Standard controllers share solo controls: left stick thrust/reverse/strafe, right stick turn, RT fire, LB/Y boost, RB brake. Gas and fire can be held together.

Use landscape for the wider view. **Fullscreen** requests the entire page, preserving the controls and current camera. Where fullscreen is unsupported, the UI explains the Home Screen fallback. Home Screen metadata and a standalone manifest are included; actual phone installation remains unverified.

**Tilt requires a trusted HTTPS game address.** The current HTTP home-network address cannot provide motion sensors. Left/right buttons remain available, and Enable tilt explains the requirement. Once HTTPS is available, tap **Enable tilt**, allow motion access, hold comfortably to calibrate, and use **Recenter** to reset straight ahead. Denied/missing sensors retain the steering buttons; stale sensor input becomes neutral. Physical phone steering direction, sensitivity and permission behavior still need the user's device check. See [MDN device orientation requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent).

## Restart after stopping the server

From the repository root in PowerShell:

```powershell
$env:STARDUST_LAN_IP='192.168.1.15'
npm.cmd run dev:dogfight
```

This address belongs to the active Ethernet interface on the current home network. If DHCP changes it, use the new assigned private IPv4 address and share the updated link. Starting without `STARDUST_LAN_IP` retains loopback-only mode.

LAN mode listens on IPv4 but accepts connections only via loopback or the selected LAN address, from that interface's local subnet. Only the exact LAN page origin is added to the WebSocket allowlist. Client plain WebSockets are allowed for the same host/port as an HTTP private-IP page; public and cross-site insecure relays remain rejected. No router forwarding, public tunnel or firewall relaxation was performed. The existing Windows TCP rule for this Node executable already allows access on the active Private network.

## Verification

- The user confirmed the page loads on the physical phone.
- Two emulated touch clients loaded the LAN URL, selected its relay automatically, created/joined one room, and received live snapshots. Simultaneous touch rotation and thrust moved the guest ship; disconnect returned the opponent to the lobby. No browser errors or failed assets. See `evidence/lan-browser.json`.
- The complete Node suite with the explicit LAN test enabled passed **89 checks**, zero failures, with two optional browser cases skipped in that run. This includes 18 Dogfight/relay/LAN checks and 13 shared-mobile/main-input checks.
- Both optional Dogfight browser cases passed independently: combat/rematch/stall/disconnect, and phone touch/simulated orientation/reverse/boost/fullscreen. Guest controls reached the host simulation.
- Root independently checked solo at 390×844, 844×390 and 667×320: correct button order, minimap clear of mission and gas, simultaneous gas/fire, portal launch through boost, whole-document fullscreen, and honest HTTP sensor fallback. A separate secure-localhost check used simulated sensor events to turn the actual ship both ways, recenter and stop stale steering. See `evidence/mobile-controls-root.json` and `mobile-layout-*.png`.
- Rerun that browser check with `node scripts/test-stardust-mobile-browser.mjs`; use `STARDUST_TEST_URL` for the LAN game, plus `PLAYWRIGHT_MODULE` and `BROWSER_CHANNEL` when required by the local runtime. Its sensor check also expects the preview on loopback port 4173.
- Actual phone-versus-phone match feel and latency are for the user's playtest; the emulated touch check does not replace it.

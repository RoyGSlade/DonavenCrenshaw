# Interactive Dogfight release — held for deployment

The user requested a PR handoff on September 27, 2026. **Do not merge or claim this build is live until the Linux Hub relay and website are released together.** The existing public website, API and relay were healthy when checked; the new release has not been deployed.

## What is included

- Shatterbelt: destructible crystals, explosive fuel pods and cover that changes during combat.
- Gravemaw: gravity wells and paired gates that preserve flight momentum.
- Stormworks: wreck corridors, directional streams and vents with visible warning/live cycles.
- Two-player duels and three-player free-for-all on all maps, including Classic; custom Light/Medium/Heavy hulls, paint and laser traps.
- Shared solo/Dogfight flight and controller behavior, mobile controls, eliminated-player spectating and unanimous rematches.
- Current public account tickets, saved solo runs, public relay selection, per-visitor connection limits and idle cleanup are preserved. Signed-in duels can record casual stats; three-player results never do.

## Release dependency and sequence

The companion Hub PR updates `ops/relay/Dockerfile`. The old image copies only the server and protocol; this version needs nine files, including shared flight rules and `movement-config.json`. Updating only the website or only its pinned relay SHA is insufficient.

Use the deployment note in the Hub PR from the Linux laptop running the existing stack. It contains the exact site SHA, image build, smoke test, maintenance window, relay-only restart and rollback commands. Do not run the whole-stack update script for this relay-only release.

1. Wait for both PRs' checks. Merge the Hub packaging PR and pull it on the Hub laptop. This alone does not restart production.
2. Save the existing relay image and site ref. Build the new image from the exact tested site SHA while the old relay keeps running, then smoke-test that image in an isolated container.
3. During a short maintenance window, stop the relay, merge this site PR, and wait for the successful Pages deployment. Start only the updated relay; active rooms close and all players must refresh.
4. Verify `https://relay.donavencrenshaw.com/health`, then open `https://donavencrenshaw.com/games/stardust/dogfight/` in fresh browsers. Verify all three arenas, two- and three-player joins, combat, an eliminated host still spectating, and unanimous rematches. Use two different networks for the final online acceptance.

The public API/database schema and Cloudflare routes need no change. The image remains pinned to a complete site commit and runs as a nonroot user.

## Verification and limits

The public-main integration passed 161 automated game checks with zero failures (seven optional browser/LAN checks skipped in that run). This includes existing Hub saved-run and duel-account regressions, plus a new signed-in FFA test for all three winning seats. The three existing duel browser cases, the three-map acceptance, and the three-client FFA case passed separately. Real FFA combat eliminated the host, continued through its spectator view, produced matching Violet victories and reset only after all three rematch votes. Browser QA stubs the public account session endpoint; it never sends gameplay test data to production accounts.

Structured data, 11 project-source contract tests, privacy/secret-pattern checks and the standalone build passed locally. A full local site link check could not pass without the three sibling project-source repositories; the Pages PR workflow checks out those sources and runs the full site verification. Its checks must be green before merge. CI also runs the Stardust test suite.

The companion Hub check copied the exact nine-file payload into an isolated directory and passed health plus all six map/mode room combinations. Its CI builds and tests the real Node 22 Docker image. Consult the PR checks for the final image result.

This is browser-hosted casual multiplayer. A hidden or stalled host interrupts the match, and any disconnect closes the room. Local browser automation does not prove physical phone/controller feel, human three-way balance, or latency across the internet. Public post-deploy acceptance remains the laptop handoff's final step.

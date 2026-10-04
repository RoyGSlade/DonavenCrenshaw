# Week 2 release candidate — CODEX-WEEK2-01

Card: `fc4059d1-90d1-47d0-925b-dacf6061891c`. Implementation is deliberately
disabled. The owner authors/selects the track; `WEEK2_DRAFT.track` is null.
The Relay Switchback handoff remains an unapproved draft outside this catalog.
The earlier request for two alternatives is superseded by the Oct 4 owner
handoff that the owner will build the track Monday.

## Timing awaiting Focus confirmation

The original card says Week 2 opens Tuesday Oct 6 at 7 PM Pacific. Its newer
Oct 4 Claude note records the owner-approved 3 PM opening, Gantry closing at
7 PM and a four-hour overlap. The delegated request also says “deadline Tue
7 PM.” The card has no due field or statement that this changes the launch.
Do not interpret that deadline as a launch change. Focus question `a1f45c71`
asks the owner whether 7 PM is a development deadline or a changed launch,
and whether the Oct 13 close remains 7 PM. Until answered, do not activate
retirement or release flags.

| Boundary in the disabled candidate | Pacific (PDT, UTC−07:00) | UTC |
| --- | --- | --- |
| First owner-track poll (FOCUS card owns scheduling) | Mon Oct 5, 8 AM | Oct 5, 15:00 |
| Last first-poll window / proposed Week 2 opening | Tue Oct 6, 3 PM | Oct 6, 22:00 |
| Gantry closes; overlap ends | Tue Oct 6, 7 PM | Oct 7, 02:00 |
| Week 1 finalization earliest, with existing 180-minute finish grace | Tue Oct 6, 10 PM | Oct 7, 05:00 |
| Proposed Week 2 close | Tue Oct 13, 7 PM | Oct 14, 02:00 |
| Week 2 finalization earliest | Tue Oct 13, 10 PM | Oct 14, 05:00 |

An opening at 3 PM and closing the following Tuesday at 7 PM is seven days
and four hours. The UI uses the explicit dates rather than claiming exactly
seven days.

## Owner and reviewer release checklist

1. Confirm the window in Focus. If the owner changes it, update all mirrored
   dates before activation, then repeat boundary tests. No retirement before
   the confirmed opening. Existing Gantry runs may finish within the existing
   grace period; new starts stop exactly at its close.
2. Receive the owner's track/title/version. Put its authored geometry in
   `projects/Space-Shooter/tracks/weeklyRollout.js`. Prove a whole lap can finish,
   score and replay exactly; review phone screenshots. The navigation test's
   intercepted Gantry geometry is only a test fixture and proves none of the
   selected track's playability. No owner track is selected by these PRs.
3. Bind the exact same owner-authored event geometry/version in the Hub's
   `api/games/stardust/replay/catalog.json`; its track is currently null. Set
   the Hub `weekly-02` time floor from verified track evidence, its display
   name and matching version. Keep one board for standard and custom ships.
   The Hub validator rejects rollout activation with a disabled event/board,
   a zero floor, mismatched dates, a pending track name or missing trusted
   replay geometry/version. The site also holds
   retirement when the catalog lacks an enabled track.
4. This integration candidate already includes site PR 30 (`056f4ac`) and
   Hub PR 19 (`0ea336e`), alongside site main `7fed706` (merged Claude PR 31).
   Preserve those account/community/F3 protections. All events are strict by
   default, including unannotated events, with the sole explicit Stardust
   Week 1 exception. Never globally mark timed runs as verified. Existing
   independent foundation PRs 32/20 remain unchanged; coordinate which exact
   candidate is reviewed before an owner merge.
5. Finish the Week 1 results page and review pending entitlement wording. The
   permanent `/stardust/weekly/week-1/` archive uses the Week 1 event regardless
   of the featured week. Its standings, awards, ghosts, local bests and account
   history remain available. Challenger goes to all eligible accepted
   finishers; Champion to first; the top three get pending Planetfall
   early-access entitlements. Codes are delivered later by the owner.
6. Run `npm run test:site`, `npm run test:stardust`, the full root build,
   `npm run verify:site` and `npm run check:privacy`. In Hub/api run `npm test`
   and every executable `test/integration/*.mjs` flow against a fresh migrated test database;
   do not omit the existing `hasSettings` contract. The new rollout flow needs
   `HUB_WEEK2_TEST_FIXTURE=1`, a loopback test database and UTC, like CI. Also
   run the preserved security flow in fresh `security_test` and the isolated
   priority-polls backend/browser fixture. `synthetic-proof.mjs` and
   `livery-preview.mjs` are fixture helpers, not pass/fail flows.
7. Review the exact site and Hub commit digests in a Focus approval. After
   approval, enable the site draft/rollout and Hub level/event/rollout together
   in reviewed commits. Rebuild the public pages at the confirmed opening so
   `/stardust/weekly/` and its banners feature Week 2. During overlap, Gantry
   remains selectable; after 7 PM it is archived. Retired circuits retain
   their board IDs/data. Dogfight and custom-track navigation/new launches
   are held during the Week 2-only window. Existing races are not deleted.
8. Owner merges and deploys after approval. Hub deployment uses the owner's
   established `scripts/update.sh` workflow. These draft PRs authorize no merge,
   deployment, live award run, scheduling change or production deletion.

## Week 2 rewards and delivery

First receives Week 2 Champion and a pending winner-named existing-hull
entitlement. Second receives **nothin wrong with silver**; third receives
**hell you could be fifth**. Week 2 Hero goes to every eligible pilot with
accepted finishes in the exact current versions of both Week 1 and Week 2,
including pilots outside the podium. Staff, banned users, rejected attempts
and another weekly/old-version run cannot substitute. Week 2 finalization
waits for all eligible accepted results to be reviewed or replayed.

The server now verifies actual standard/custom input recordings through its
pinned deterministic weekly physics. Operational capacity/timeout errors
preserve accepted provisional results and defer awards; simulation mismatches
reject results. Missing trusted owner geometry prevents activation. A safe
owner retry recomputes stored pending logs rather than trusting a human label;
the paired Hub checklist documents its read-only default and apply gate.

After finalization, export the public final event response and run:

```sh
node scripts/prepare-week2-winner-livery.mjs final-week2.json winner-livery.json
```

This prepares a portable existing-hull livery and name without granting or
publishing anything. The output refuses overwrite. The owner reviews the
winner and chosen hull family, approves delivery, and publishes/delivers it
through the established owner workflow. No new art, code or prize promise is
invented; Planetfall remains a Week 1 entitlement.

## Verification evidence

The added unit tests exercise disabled release, overlapping selection, exact
boundaries, site/Hub parity and finalized-winner livery round trips. The
browser script `scripts/test-stardust-week2-browser.mjs` runs 12 phone
navigation checks with all external HTTPS blocked, and screenshots disabled
release, overlap and Gantry retirement. It does not modify release config.
The Hub real-Postgres rollout flow checks 17 award invariants and historical
run retention alongside all five existing integration flows. The replay flow
checks 12 actual HTTP/worker/Prisma/CLI invariants using recorded standard and
custom laps. It executes the finalization CLI for deferred (exit 2), finalized
and already-finalized branches. The integration preserves PR 19's additive
migrations; Week 2 adds no schema migration or historical data deletion.

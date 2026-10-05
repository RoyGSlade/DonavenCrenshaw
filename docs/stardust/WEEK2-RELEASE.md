# Week 2 release candidate — CODEX-WEEK2-01

Card: `fc4059d1-90d1-47d0-925b-dacf6061891c`. Implementation is deliberately
disabled. The owner authors/selects the track; `WEEK2_DRAFT.track` is null.
The Relay Switchback handoff remains an unapproved draft outside this catalog.
The earlier request for two alternatives is superseded by the Oct 4 owner
handoff that the owner will build the track Monday.

## Timing from the owner's live Focus reply

The original card says Week 2 opens Tuesday Oct 6 at 7 PM Pacific. Its newer
Oct 4 Claude note records the owner-approved 3 PM opening, Gantry closing at
7 PM and a four-hour overlap. The delegated request also says “deadline Tue
7 PM.” The card has no due field or statement that this changes the launch.
Do not interpret that deadline as a launch change. Live Focus item
`a1f45c71-74a2-44b9-bf76-dfb03a5ae2b0` was answered October 4 at 17:04:41 UTC:
"No week 2 will close at 245pm and week 3 will open at 3pm this is what the
weekly releases will look like consistently". In the question's October 13
context, Week 2 closes Tuesday October 13 at 2:45 PM Pacific and Week 3 opens
at 3 PM. Preserve this recurring 2:45 close/3 PM open pattern in future weekly
candidates, using America/Los_Angeles civil time and the applicable UTC offset.
The reply does not explicitly change October 6's opening. The earlier recorded
owner-approved 3 PM opening and Gantry's 7 PM close remain separate evidence.
The meaning of the pasted development "Tue7PM" deadline remains ambiguous,
but October 13's close is resolved and must not be asked again. No release or
retirement is activated by this timing reconciliation.

| Boundary in the disabled candidate | Pacific (PDT, UTC−07:00) | UTC |
| --- | --- | --- |
| First owner-track poll (FOCUS card owns scheduling) | Mon Oct 5, 8 AM | Oct 5, 15:00 |
| Last first-poll window / proposed Week 2 opening | Tue Oct 6, 3 PM | Oct 6, 22:00 |
| Gantry closes; overlap ends | Tue Oct 6, 7 PM | Oct 7, 02:00 |
| Week 1 finalization earliest, with existing 180-minute finish grace | Tue Oct 6, 10 PM | Oct 7, 05:00 |
| Owner-resolved Week 2 close | Tue Oct 13, 2:45 PM | Oct 13, 21:45 |
| Next weekly opening pattern (Week 3, not activated here) | Tue Oct 13, 3 PM | Oct 13, 22:00 |
| Week 2 finalization earliest | Tue Oct 13, 5:45 PM | Oct 14, 00:45 |

An opening at 3 PM and closing the following Tuesday at 2:45 PM is six days,
23 hours and 45 minutes. The UI uses explicit dates. The 15-minute gap before
the next weekly opening is independent of the existing three-hour finish grace.

## Owner and reviewer release checklist

1. Keep the resolved October 13 close and future weekly cadence. If the owner
   changes the opening or another window boundary, update all mirrored dates
   before activation, then repeat boundary tests. No retirement before
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
4. This candidate is reconciled with latest site main
   `913dc9d1d395730f63e851a13482f3ac9a72cd8b` and Hub main
   `a4840844815587e01fb5ee8b658939bd683d781b`. Preserve live branded Google
   Workspace confirmation, confirmed-email voting without an IP cap, privacy
   copy and owner-selectable poll closing times alongside account/community/F3
   protections and merged Claude SEO/sponsor/BetterFingers work. Site PRs
   29/30/32 are closed; the old PR30 conflict gate is retired. All event awards
   remain strict by default except the sole explicit Stardust Week1 exception.
   Review the freshly tested exact draft33/Hub21 heads before an owner merge.
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

The owner's live development poll closes October 6 at 18:59:40 PDT
(October 7 01:59:40 UTC), approximately7 PM. That poll deadline is independent
of Week2's October6 15:00 PDT opening and does not change the weekly window.
No poll, email/provider secret, ingress or production configuration is changed
by this integration check; browser mail and poll tests use synthetic fixtures.

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

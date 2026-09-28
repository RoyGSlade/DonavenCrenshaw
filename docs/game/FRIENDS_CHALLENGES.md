# Friends, challenges and mastery: the hub contract

Phase 2 and 3 of `ENGAGEMENT-PHASE-PLAN.md`. This is what the site and the
Stardust game call on the hub for friends, friend boards, challenges, medals
and split history. It extends [HUB_CONTRACT.md](HUB_CONTRACT.md); everything
there (credentials, error shape, ignore unknown fields, never queue runs)
still applies.

Scope of the first release: the UI offers friend boards and challenges on the
**full network** board only. The API accepts any board.

## Decisions this contract encodes

- **Friends are mutual.** A request by exact username or invite link; the other
  pilot accepts or declines. Either side can unfriend; either side can block.
- **A challenge points at one fixed accepted run**: its time, board and board
  version, and (for full runs) its circuit splits. A later personal best does
  not move it. A board version change makes old challenges `outdated`.
- **Nothing is sent outside the site.** Sharing is a link the player copies or
  hands to the browser's share sheet. No email, no bot, no automatic Discord.
- **Times are casual.** Runs are checked for plausibility, not replayed. Never
  call a challenge result or medal "verified".

## Friends: `/api/friends` (signed in)

All bodies are JSON; errors are `{ "error": "<code>", "message": "..." }`.

```
GET /api/friends
200 {
  "friends":  [{ "username": "nova", "displayName": "Nova", "avatarUrl": null, "since": "2026-09-27T..." }],
  "incoming": [{ "id": "<requestId>", "username": "rook", "displayName": "Rook", "avatarUrl": null, "sentAt": "..." }],
  "outgoing": [{ "id": "<requestId>", "username": "vega", "displayName": "Vega", "sentAt": "..." }],
  "blocked":  [{ "username": "spam", "displayName": "Spam" }]
}

POST /api/friends/requests          { "username": "nova" }
201 { "status": "pending", "request": { "id": "...", "username": "nova", "displayName": "Nova", "sentAt": "..." } }
200 { "status": "friends", "friend": { ... } }      they had already asked you: now friends
400 bad_username | self      404 no_user      409 already_friends | already_requested | blocked (you blocked them)
409 friend_limit             429 too_many_requests

POST   /api/friends/requests/:id/accept    200 { "status": "friends", "friend": { ... } }
POST   /api/friends/requests/:id/decline   204
DELETE /api/friends/requests/:id           204   cancel your own request
DELETE /api/friends/:username              204   unfriend (idempotent)
POST   /api/friends/blocks  { "username" } 201 { "blocked": { "username", "displayName" } }
DELETE /api/friends/blocks/:username       204
```

Blocking removes the friendship and any requests both ways, hides the blocked
pilot's challenges from you and yours from them. A request to someone who has
blocked you looks sent (`201`, `request.id` is `null`) and never arrives.

**Invite link:** `https://donavencrenshaw.com/account/?friend=<username>`. The
account page shows "Add <username> as a friend?" with a button; it never sends
a request without the click. Signed-out visitors are asked to sign in first and
come back to the same link.

## Boards

```
GET /api/games/stardust/boards/full?scope=friends&limit=50      (signed in; 401 otherwise)
200 { "board": "full", "version": 1, "current": true, "scope": "friends",
      "entries": [{ "rank": 1, "username": "nova", "displayName": "Nova", "timeMs": 114692, "setAt": "...", "isMe": false }] }
```
Ranks are among you and your friends. You are included even with no friends.

```
GET /api/games/stardust/boards/full/around-me?span=3             (signed in)
200 { "board": "full", "version": 1, "total": 42,
      "me": { "rank": 17, "timeMs": 190000 } | null,
      "entries": [ ...up to span above and below you, same row shape with isMe... ],
      "next": { "rank": 16, "username": "vega", "displayName": "Vega", "timeMs": 188200, "gapMs": 1800 } | null }
```
`me` is `null` (and `entries` empty) until you have an accepted time. `next` is
the pilot directly above you.

## Runs with a challenge

Start a run against a challenge by adding its id:

```
POST /api/games/stardust/runs   { "board": "full", "version": 1, "build": "...", "challenge": "<challengeId>" }
201 { "runId": "...", ..., "challenge": { "id": "...", "targetMs": 114692, "splits": { "alpha-relay": 21000, ... } | null } }
404 unknown_challenge   410 challenge_expired   409 challenge_outdated | challenge_board
```
Only the full-network run carries the challenge; circuit runs are opened as usual.

**Finish** (accepted) responses gain these fields. All are optional; ignore any
you do not use.

```
"rankBefore": 21 | null,                 your rank on this board before this run
"friends": {                             present when you have at least one friend
  "rank": 2, "of": 5,
  "overtaken": [{ "username": "vega", "displayName": "Vega", "timeMs": 188200 }],   only on a new personal best
  "next": { "username": "nova", "displayName": "Nova", "timeMs": 114692, "gapMs": 3100 } | null
},
"medal": {                               present when the board has medal times for this version
  "earned": "gold" | "silver" | "bronze" | null,    for your best time on the board
  "improved": true,                                 this run earned a better medal than you had
  "next": { "medal": "silver", "timeMs": 150000, "gapMs": 4200 } | null
},
"challenge": {                           present when the run was started with a challenge
  "id": "...", "targetMs": 114692, "beaten": true, "firstBeat": true,
  "from": { "username": "nova", "displayName": "Nova" },    who sent the link
  "pilot": { "username": "nova", "displayName": "Nova" },   whose run is the target
  "canRechallenge": true                                    you may send this run back to "from"
}
```

## Challenges

```
POST /api/games/stardust/challenges   { "runId": "...", "to": "nova"?, "parent": "<challengeId>"? }
201 { "challenge": <ChallengeView> }
```
- `runId` must be an accepted run on the board's current version, owned by you
  or by a friend (a friend's run makes a "chase" link: `pilot` is the friend,
  `from` is you). Only your own runs can be addressed with `to`.
- `to` (optional) must be a friend, or the `from` of `parent` when you attempted
  `parent`. Addressed challenges appear in that pilot's inbox.
- 400 bad_run | not_accepted | not_yours; 404 unknown_run | no_user; 409 outdated
  | not_friends | blocked; 429 too_many_challenges (30 a day).
- Challenges expire 14 days after creation.

```
GET /api/games/stardust/challenges/:id          public; richer when signed in
200 {
  "id": "...", "board": "full", "boardName": "Full run", "version": 1,
  "status": "active" | "expired" | "outdated",
  "createdAt": "...", "expiresAt": "...",
  "target": { "timeMs": 114692, "splits": { "alpha-relay": 21000, ... } | null, "setAt": "...",
              "pilot": { "username": "nova", "displayName": "Nova" } },
  "from": { "username": "nova", "displayName": "Nova" },
  "to": { "username": "rook", "displayName": "Rook" } | null,
  "parentId": "..." | null,
  "attempts": [{ "username": "rook", "displayName": "Rook", "bestMs": 113900, "beaten": true }],   best 20
  "viewer": { "isCreator": false, "bestMs": 119000 | null, "beaten": false } | null                 null when signed out
}
404 unknown_challenge   also when you and the sender have blocked each other

GET /api/games/stardust/challenges?box=inbox|sent        (signed in)
200 { "challenges": [<ChallengeView without attempts>, ...] }    newest 20;
     inbox = addressed to you; sent = created by you (with "attemptsCount" and "beatenCount")
```

**Challenge link:** `https://donavencrenshaw.com/stardust/challenge/?c=<id>`.
Its Play button opens `games/stardust/?challenge=<id>`.

## Your progress (Phase 3)

`GET /api/games/stardust/me` bests gain `runId`, `splits` (full runs, from your
best run) and `medal`:

```
"bests": { "full": { "timeMs": 190000, "rank": 17, "version": 1, "runId": "...",
                     "splits": { "alpha-relay": 40100, ... } | null, "medal": "bronze" | null } }
```

`GET /api/games/stardust` boards gain `medals` when set for the current version:

```
{ "board": "full", "kind": "full", "version": 1, "name": "Full run",
  "medals": { "gold": 120000, "silver": 150000, "bronze": 210000 } | null }
```

Medal times are fixed per board **version** in the hub's `rules.json` and are
calibrated from real runs (`scripts/stardust-metrics.js --medals`). Until they
are set, `medals` is `null` and the UI shows none.

# Hub product idea: Dogfight 1v1 rankings

Give the Hub a **Dogfight 1v1** card with a player’s verified rating and global rank, win/loss record, recent match list, and a **Challenge a friend** action. Friend challenges should default to private, unranked matches; only eligible, server-verified ranked results update the card. Until that service exists, show no live rank, fabricated record, or “ranked” claim.

**Simple Elo is the starting candidate** for a 1v1 rating because it is easy to explain and test. The exact formula, placement matches, calibration, rank bands, ties, and reset policy remain undecided until V1 match data and player demand justify them. Any later 2v2 competition gets a separate rating.

Three decisions gate a real board:

- **Trust the result:** require authenticated accounts and server verification of the participants, ruleset/build, and outcome. V1’s host browser runs the match simulation but is player-controlled; neither its winner report nor a relayed snapshot can directly change a public rating. A trusted authority or independently verified replay model is needed first.
- **Handle bad connections and abuse:** set reconnect grace, explicit voluntary-forfeit behavior, and no-contest handling for host/relay failure. Detect result replay, win trading, repeated arranged matches, and disconnect abuse; provide a report and review path before rating changes go live.
- **Keep the product legible:** show only confirmed ranked 1v1 results, label the standings’ ruleset and update time, and keep casual friend challenges out of the public rating by default.

Dogfight V1 is implemented and locally verified with two browsers. It is a casual friend-match feature, not a ranking system. Public rank, account-backed records, and internet WSS configuration are future work; no account service or tunnel is part of this proposal.

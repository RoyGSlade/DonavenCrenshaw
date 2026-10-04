# Development votes review

`/voting/` uses existing Hub accounts. It shows only server-defined opened polls and public aggregate results; a signed-in viewer can see their own choice. An account-page and Support-page link make it discoverable. The owner/admin view creates private drafts with bounded options, then explicitly opens or closes them. No real poll is included in the static build or seeded by the Hub migration.

One final equal vote per account per poll is the conservative policy. Results advise development decisions, without promising a winning feature or date. GitHub sponsorship does not add weight; any future verified status is shown only to its owner. All content returned by Hub is inserted with DOM textContent. No auth, ballot or sponsor identity is put in browser storage. The Hub applies its own authorization and concurrency controls, independently of hidden UI.

The build uses existing `HUB_URL` and `SITE_BASE` settings. The Hub must receive the site's exact Origin in its CLIENT_URL allowlist. Its feature flag defaults to disabled, returning a clear unavailable message until an approved coordinated release. Source build assets include voting.js and voting.css. No external identity/OAuth feature is enabled.

`tests/voting-browser.cjs` is called by Hub's isolated `test/integration/priority-polls.cjs` with `POLL_BROWSER_QA` pointing here. It builds the actual site for a loopback API, blocks external requests, and exercises real owner draft/open, confirmation, final-choice persistence, guest/privacy boundaries, text-injection safety, expired-session feedback, and 320/390/1440 pixel layouts. `POLL_PLAYWRIGHT` can point to the installed Playwright module, and `POLL_QA_OUTPUT` controls screenshots. Browser fixtures explicitly label their options as synthetic.

Current implementation starts from site security commit 38b8fda; integrate only after the security task's final follow-up. Account layout, head, build asset list and shared stylesheet receive small additive hunks. Keep the security changes when resolving any future conflicts. Live release, real poll creation and sponsor permissions require separate approval.

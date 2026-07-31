# Implementation plan and six-Luna breakdown

The work was split into six bounded lanes so discovery, data, foundation, visual system, parent content, and branch content could proceed in parallel and converge behind one director-owned validation contract.

| Luna lane | Scope | Integrated result |
| --- | --- | --- |
| 1 — audit | Repository/content/route/evidence inventory | Audit, route map, gaps, and evidence register |
| 2 — data | Current schemas and strict validation | Site, branches, products, updates, support, redirects |
| 3 — foundation | Build, templates, navigation, redirect generation | Deterministic artifact and semantic shared shell |
| 4 — design | Parent and branch visual system | Responsive CSS, focus/reduced-motion behavior |
| 5 — parent | Homepage and parent utility pages | Current founder workspace, work/log/support/legal pages |
| 6 — branches | underplain, products, Systems, Infinite Ages | Truth-first branch and product pages |

The director then reconciled route conflicts, removed legacy public-data/runtime paths, reduced browser JavaScript, pruned and upgraded dependencies, consolidated workflows, expanded the redirect map, wrote the built-artifact verifier, fixed internal link semantics, reconciled public claims, and completed browser QA and documentation.

## Phase status

1. **Audit and authority resolution — complete.** New prompt wins over older Source Arcanum/Crenshaw Solutions language.
2. **Architecture and data contract — complete.** Parent plus three branches, strict current JSON, canonical route tree.
3. **Build and shared components — complete.** Current-only artifact, semantic head/nav/footer/layouts, no public data cache.
4. **Content migration — complete for available evidence.** Required pages exist; unsupported material is omitted or explicitly unresolved.
5. **Visual system — complete.** Responsive parent design and three distinct branch skins.
6. **Hardening — complete.** Redirect, link, semantics, privacy, credential-pattern, base-path, dependency, and console gates.
7. **Documentation — complete.** All requested planning/delivery artifacts and maintainers' runbooks.
8. **Deployment — intentionally pending.** The user requested completion of the rebuild, not a commit/push. Production remains unchanged until an intentional publish action.

## Acceptance contract

- All 17 required canonical routes exist.
- All 32 known legacy routes resolve to current canonical destinations.
- Source Arcanum is not a public current identity.
- Product status uses the allowed vocabulary and distinguishes evidence from intent.
- BetterFingers is not represented as released.
- Crenshaw Systems has no unsupported software catalog or invented commercial terms.
- Infinite Ages exposes only real artifacts and states its license gap.
- The build works at both `/` and `/SourceArcanum/`.
- Browser navigation, responsive layouts, keyboard access, and reduced motion work.
- Automated verification and zero-vulnerability audit pass before handoff.

## Safe next action

Review the rebuild diff and the unresolved-decision register, keep the unrelated `SECURITY.md` edit out of the rebuild commit unless intentionally resolved, then follow the deployment runbook.

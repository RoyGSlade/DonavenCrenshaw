# Security Policy

Source Arcanum ships small, local-first tools. There's no backend, no user database, and no telemetry to breach — but the release pipeline (installers, checksums, this site) is still real attack surface, and reports are taken seriously.

## Supported Projects & Versions

| Project | Status | Security Updates |
| --- | --- | --- |
| Source Arcanum (this site) | Active | Latest `main` only |
| [BetterFingers](https://github.com/RoyGSlade/BetterFingers) | Active (v1.0.x) | Latest release only |
| Everything else in the archive (prototype / concept / alpha status) | Pre-release | Best-effort, no SLA |

Older tagged releases are not patched retroactively. If a vulnerability affects a shipped installer, a new signed build supersedes it and the release notes say so explicitly.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for anything actively exploitable (RCE, credential exposure, supply-chain tampering, malicious file handling, etc.).

Instead:

1. Use GitHub's private vulnerability reporting: open the **Security** tab on the affected repo — [SourceArcanum](https://github.com/RoyGSlade/SourceArcanum/security) or [BetterFingers](https://github.com/RoyGSlade/BetterFingers/security) — and click **"Report a vulnerability."** This opens a private draft advisory that only the maintainer can see.
2. For low-severity, non-exploitable issues (a stale dependency, a broken link, an outdated hash on this site), a regular public issue is fine.

This is a one-person project, so response times are best-effort, not contractual — expect an acknowledgement within a few days. Confirmed issues get a fix or mitigation before anything is disclosed publicly. Declined reports get an explanation of why.

## Verifying What You Download

Every BetterFingers installer ships with a published SHA256 hash on its [release page](https://github.com/RoyGSlade/SourceArcanum/releases) and in its dossier on this site. If the hash you compute locally doesn't match, stop, don't run the installer, and report it — that mismatch is exactly what this policy exists to catch.
asset
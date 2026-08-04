# Security Policy

DonavenCrenshaw.com is a static presentation site. Project implementations and
their release artifacts remain in their owning repositories, so reports should
be filed against the repository that contains the affected code.

## Supported scope

| Repository | Current public scope |
| --- | --- |
| [DonavenCrenshaw](https://github.com/RoyGSlade/DonavenCrenshaw) | The current `main` branch and its website build/import workflow |
| [BetterFingers](https://github.com/RoyGSlade/BetterFingers) | Pre-release source on `main`; no tagged public release is claimed here |

Other concepts and prototypes receive best-effort review. No response-time or
remediation-time SLA is promised.

## Reporting a vulnerability

Do not open a public issue for an actively exploitable vulnerability, credential
exposure, or supply-chain concern. Use GitHub private vulnerability reporting
from the affected repository's **Security** tab. A low-severity dependency or
broken public link can be reported as a normal issue.

## Downloads and checksums

This site does not treat an old link, filename, screenshot, or historical hash
as current release evidence. Follow only a release link supplied by the owning
project's current `website/project.json`, then verify any checksum published on
that same release. If the owning repository does not publish a current release
and checksum, the website must not imply that one exists.

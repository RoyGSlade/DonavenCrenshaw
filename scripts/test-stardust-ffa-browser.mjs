/** Optional three-browser integration. Starts and closes its own ephemeral relay. */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
if (!process.env.PLAYWRIGHT_MODULE) {
  const bundled = path.join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules",
    "playwright",
    "index.mjs",
  );
  if (existsSync(bundled)) process.env.PLAYWRIGHT_MODULE = bundled;
}
process.env.STARDUST_FFA_BROWSER_TEST = "1";
process.env.BROWSER_CHANNEL ||= "msedge";
await import("../tests/stardust-ffa-browser.test.mjs");

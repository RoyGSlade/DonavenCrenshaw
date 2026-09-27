import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
if (!process.env.PLAYWRIGHT_MODULE) {
  const bundled = path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright", "index.mjs");
  if (existsSync(bundled)) process.env.PLAYWRIGHT_MODULE = bundled;
}
process.env.STARDUST_TRAP_BROWSER_TEST = "1";
await import("../tests/stardust-laser-traps-browser.test.mjs");

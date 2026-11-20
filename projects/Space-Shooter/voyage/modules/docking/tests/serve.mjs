// A tiny static server for this module's folder, so test.html and the browser test need nothing else.
//   node tests/serve.mjs            serves on http://127.0.0.1:8765/test.html  (PORT=1234 to change; Ctrl-C to stop)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

export function startServer({ port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x'), rel = decodeURIComponent(url.pathname === '/' ? '/test.html' : url.pathname);
      const file = path.resolve(ROOT, `.${rel}`);
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end('no'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer({ port: Number(process.env.PORT) || 8765 });
  console.log(`Docking test page: ${s.origin}/test.html`);
}

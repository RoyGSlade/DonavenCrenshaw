import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dist')) throw new Error('Usage: node scripts/preview-stardust.mjs [--dist]');
const useDist = args.includes('--dist');
const servedRoot = path.resolve(repoRoot, ...(useDist ? ['dist', 'stardust'] : []));
const canonicalServeRoot = await realpath(servedRoot).catch(() => null);
const portValue = process.env.PORT ?? '4173';
const port = Number(portValue);

if (!canonicalServeRoot) throw new Error(`Preview root does not exist: ${path.relative(repoRoot, servedRoot)}`);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer from 0 through 65535.');
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
]);

const routeRoots = [
  { url: '/projects/Space-Shooter/', disk: path.join(servedRoot, 'projects', 'Space-Shooter') },
  { url: '/assets/Images/sprites/', disk: path.join(servedRoot, 'assets', 'Images', 'sprites') },
  { url: '/assets/audio/', disk: path.join(servedRoot, 'assets', 'audio') },
];

function reject(res, statusCode = 404, message = 'Not found') {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(message);
}

function safePathFromRequest(req) {
  const requestTarget = req.url || '/';
  const rawPath = requestTarget.split(/[?#]/, 1)[0];
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) return null;

  let decodedPath;
  try { decodedPath = decodeURIComponent(rawPath); }
  catch { return null; }

  if (decodedPath.includes('\\') || /[\u0000-\u001f\u007f]/.test(decodedPath)) return null;
  const segments = decodedPath.split('/').slice(1);
  if (segments.some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  return decodedPath;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function locateFile(requestPath) {
  if (requestPath === '/projects/Space-Shooter') return { redirect: '/projects/Space-Shooter/' };
  if (requestPath === '/projects/Space-Shooter/dogfight') return { redirect: '/projects/Space-Shooter/dogfight/' };
  if (requestPath === '/projects/Space-Shooter/dogfight/') return {
    file: path.join(servedRoot, 'projects', 'Space-Shooter', 'dogfight', 'index.html'),
    allowedRoot: path.join(servedRoot, 'projects', 'Space-Shooter'),
  };
  for (const route of routeRoots) {
    if (requestPath === route.url && route.url.endsWith('/')) {
      if (!route.url.startsWith('/projects/')) return null;
      return { file: path.join(route.disk, 'index.html'), allowedRoot: route.disk };
    }
    if (!requestPath.startsWith(route.url)) continue;
    const tail = requestPath.slice(route.url.length);
    if (!tail || tail.endsWith('/')) return null;
    const candidate = path.resolve(route.disk, ...tail.split('/'));
    if (!inside(route.disk, candidate)) return null;
    return { file: candidate, allowedRoot: route.disk };
  }
  return null;
}

async function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reject(res, 405, 'Method not allowed');
  const requestPath = safePathFromRequest(req);
  if (!requestPath) return reject(res);
  if (requestPath === '/') {
    res.writeHead(302, { Location: '/projects/Space-Shooter/', 'Cache-Control': 'no-store' });
    return res.end();
  }

  let located;
  try { located = await locateFile(requestPath); }
  catch { return reject(res); }
  if (!located) return reject(res);
  if (located.redirect) {
    res.writeHead(308, { Location: located.redirect, 'Cache-Control': 'no-store' });
    return res.end();
  }

  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([
      realpath(located.allowedRoot),
      realpath(located.file),
    ]);
    if (!inside(canonicalServeRoot, canonicalRoot) || !inside(canonicalRoot, canonicalFile)) return reject(res);
    const info = await stat(canonicalFile);
    if (!info.isFile()) return reject(res);
    const contentType = mimeTypes.get(path.extname(canonicalFile).toLowerCase());
    if (!contentType) return reject(res, 415, 'Unsupported media type');
    const headers = {
      'Content-Type': contentType,
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    createReadStream(canonicalFile).on('error', () => res.destroy()).pipe(res);
  } catch {
    reject(res);
  }
}

const server = createServer((req, res) => { void serve(req, res); });
server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Stardust preview: http://127.0.0.1:${address.port}/projects/Space-Shooter/`);
  console.log(`Source: ${useDist ? 'dist/stardust' : 'repository files'}; loopback only.`);
});

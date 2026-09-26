import { runtimeConfig } from '../runtime-config.js';

export function validateBackendUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) throw new Error('Backend must use HTTPS, or HTTP loopback, without credentials/query/fragment.');
  return url.href.replace(/\/$/, '');
}
// A health probe only: local victories are never submitted as account results.
export async function checkBackend(config = runtimeConfig, fetchImpl = globalThis.fetch) {
  if (!config.backendBaseUrl) return { mode: 'local', available: false };
  let base;
  try { base = validateBackendUrl(config.backendBaseUrl); }
  catch { return { mode: 'local', available: false, reason: 'configuration' }; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(10000, Math.max(100, config.requestTimeoutMs || 2500)));
  try {
    const response = await fetchImpl(`${base}/v1/health`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Backend unavailable');
    const body = await response.json();
    if (body.service !== 'stardust' || body.version !== 1 || body.ok !== true) throw new Error('Unexpected backend');
    return { mode: 'connected', available: true };
  } catch { return { mode: 'local', available: false, reason: 'unavailable' }; }
  finally { clearTimeout(timer); }
}

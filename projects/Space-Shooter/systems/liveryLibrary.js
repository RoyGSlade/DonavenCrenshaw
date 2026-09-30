import { cleanAppearance } from './shipLivery.js';
import { runtimeConfig } from '../runtime-config.js';
const KEY = 'stardust.liveries.v2';
export function readLibrary() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(items)
      ? items
          .filter(
            (i) =>
              typeof i.name === 'string' &&
              typeof i.id === 'string' &&
              cleanAppearance(i.appearance),
          )
          .map((i) => ({ ...i, appearance: cleanAppearance(i.appearance) }))
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}
export function saveDesign(name, appearance) {
  const a = cleanAppearance(appearance);
  if (!a) throw new Error('Invalid design.');
  const items = readLibrary(),
    entry = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 60) || 'Untitled livery',
      appearance: a,
    };
  items.unshift(entry);
  const json = JSON.stringify(items.slice(0, 12));
  if (json.length > 3500000)
    throw new Error('Your design library is full. Remove a design to make room.');
  localStorage.setItem(KEY, json);
  changed();
  return entry;
}
export function removeDesign(id) {
  localStorage.setItem(KEY, JSON.stringify(readLibrary().filter((i) => i.id !== id)));
  changed();
}
/** The library changed through the garage (systems/hubSync.js saves it to the account). */
function changed() {
  try { globalThis.dispatchEvent?.(new CustomEvent('stardust:library-changed')); } catch { /* no window */ }
}
/** Replace the library with a list of designs (the account's, merged). Cleaned and capped like a read; no change event. */
export function writeLibrary(items) {
  try {
    const clean = (Array.isArray(items) ? items : [])
      .filter((i) => typeof i?.name === 'string' && typeof i?.id === 'string' && cleanAppearance(i.appearance))
      .map((i) => ({ ...i, appearance: cleanAppearance(i.appearance) }))
      .slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}
export function downloadDesign(name, appearance) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ format: 'stardust-livery', name, appearance }, null, 2)], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'stardust'}.livery.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readDesignFile(file) {
  if (!file || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a livery JSON file smaller than 2 MB.');
  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a valid livery file.');
  }
  const a = doc?.format === 'stardust-livery' && cleanAppearance(doc.appearance);
  if (!a) throw new Error('This livery format is invalid or unsupported.');
  return {
    name: typeof doc.name === 'string' ? doc.name.slice(0, 60) : 'Imported livery',
    appearance: a,
  };
}
let apiBase =
  runtimeConfig.liveryApiBaseUrl ||
  (['donavencrenshaw.com', 'www.donavencrenshaw.com'].includes(globalThis.location?.hostname)
    ? 'https://api.donavencrenshaw.com'
    : '');
export function getLiveryApi() {
  return apiBase;
}
export function setLiveryApi(value) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Use an HTTPS origin, or a localhost development API.');
  // Only local previews can switch servers; published pages use their configured Hub.
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname))
    throw new Error('The published game uses its own Hub.');
  apiBase = url.origin;
}
export async function liveryRequest(path, { method = 'GET', body } = {}) {
  if (!apiBase)
    throw new Error(
      'The local preview has no Hub connected. You can save and export designs here.',
    );
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 8000);
  try {
    const response = await fetch(`${apiBase}/api${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: abort.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.message ||
          data?.error ||
          (response.status === 401
            ? 'Sign in to publish or comment.'
            : 'The design service is unavailable.'),
      );
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError)
      throw new Error('The design service could not be reached. Your local design is safe.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

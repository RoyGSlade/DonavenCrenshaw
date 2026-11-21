// Small shared pieces of the scene 1 hands-on games (mop, lever): their stylesheet, loaded once wherever they are used.
export function ensureHandsOnStyle() {
  if (typeof document === 'undefined' || document.querySelector('link[data-handson]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./handson.css', import.meta.url).href; link.dataset.handson = '';
  document.head.append(link);
}

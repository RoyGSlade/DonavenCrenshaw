// A small conversation box for on-foot talk, used when the page gives no
// story `say` of its own. Story's director normally calls say(lineId); this
// shows { who, name, text, audio? } and waits for Next (E, Enter, Space, click).
import { createEl } from './dom.js';
import { castLook } from './draw.js';

export function createTalk(root) {
  let open = null;
  function show(lines) {
    if (open) open.close();
    const list = Array.isArray(lines) ? lines : [lines];
    let i = 0, finish, audio = null;
    const name = createEl('b', { class: 'of-talk-name' });
    const text = createEl('p', { class: 'of-talk-text' });
    const next = createEl('button', { type: 'button', class: 'primary', text: 'Next' });
    const box = createEl('section', { class: 'of-talk', role: 'dialog', 'aria-live': 'polite' }, name, text, next);
    root.append(box);
    const render = () => {
      const line = list[i];
      const look = castLook(line.who);
      name.textContent = line.name || look.name;
      name.style.color = look.color;
      text.textContent = line.text;
      next.textContent = i < list.length - 1 ? 'Next' : 'Done';
      audio?.pause();
      audio = null;
      if (line.audio) { try { audio = new Audio(line.audio); audio.play().catch(() => {}); } catch { audio = null; } }
    };
    const advance = () => { if (++i >= list.length) close(); else render(); };
    const onKey = (e) => { if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); advance(); } };
    function close() { removeEventListener('keydown', onKey, true); audio?.pause(); box.remove(); open = null; finish(); }
    next.addEventListener('click', advance);
    render();
    setTimeout(() => addEventListener('keydown', onKey, true), 120);
    next.focus({ preventScroll: true });
    open = { close };
    return new Promise((resolve) => { finish = resolve; });
  }
  return { show, get open() { return Boolean(open); } };
}

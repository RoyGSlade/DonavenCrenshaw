// One call for the page: the caption, the director and the intro, wired to
// the shared story bus. The hangar's boot calls this once the store exists:
//
//   import { mountStory } from './story/mount.js';
//   const story = mountStory({ store, root: document.body });
//
// Then the hangar, on-foot and exploration code emit their events on
// `storyBus` (ROUND2-CONTRACT.md section 4) and gate their UI with
// isUnlocked(save, id) from ./progress.js.
import { storyBus } from './bus.js';
import { createSay, browserAudio } from './say.js';
import { createDirector } from './director.js';
import { createCaption } from './caption.js';
import { playIntro } from './intro.js';
import { storyOf } from './progress.js';

/**
 * mountStory({ store, root, bus, reducedMotion, volume, muted, caption }) ->
 * { director, caption, bus, speak, stop }. caption: false when the page draws lines itself.
 */
export function mountStory({
  store, root = document.body, bus = storyBus,
  reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  volume = () => 1, muted = () => false, caption = true,
} = {}) {
  const speak = createSay({ bus, audio: browserAudio({ volume, muted }) });
  const director = createDirector({ store, bus, say: speak });
  const box = caption ? createCaption({ root, bus, reducedMotion, skippable: () => !storyOf(store.get()).finished }) : null;
  let playing = false;
  const off = bus.on('story:step', async ({ id }) => {
    if (id !== 'intro' || playing) return;
    playing = true;
    const out = await playIntro({ root, bus, speak, vars: { name: store.get().character?.name || '' }, reducedMotion, muted });
    playing = false;
    if (out.tutorial) director.skip();
    else bus.emit('intro:done', { skipped: out.skipped });
  });
  director.start();
  return {
    director, caption: box, bus, speak,
    stop() { off(); director.stop(); box?.destroy(); },
  };
}

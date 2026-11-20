// Sample screen module: reads ctx.context.guns, lets the player switch a gun to auto, and returns the change in effects.world (the host applies it).
// It can open a mini-game on top with ctx.play (never by importing one).
export function play(stage, ctx) {
  return new Promise((resolve) => {
    const guns = ctx.context?.guns || { port: { tracking: 'manual' } };
    const root = document.createElement('div');
    root.className = 'm-_sample-screen';
    root.innerHTML = '<p class="ss-help">Guns: pick one to switch to auto.</p><div class="ss-guns"></div><button type="button" class="ss-done">Done</button>';
    const list = root.querySelector('.ss-guns');
    let world = null;
    for (const [id, g] of Object.entries(guns)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ss-gun'; b.dataset.gun = id; b.textContent = `${id}: ${g.tracking}`;
      b.addEventListener('click', () => { world = { guns: { ...(world?.guns || {}), [id]: { tracking: 'auto' } } }; b.textContent = `${id}: auto`; });
      list.append(b);
    }
    root.querySelector('.ss-done').addEventListener('click', () => resolve({ done: true, success: Boolean(world), grade: world ? 100 : 0, effects: world ? { world } : undefined }));
    stage.replaceChildren(root);
  });
}

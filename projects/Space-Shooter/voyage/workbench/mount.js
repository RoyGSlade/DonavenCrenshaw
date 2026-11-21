// Mounts the workbench room on the page: its stylesheet, the always-on chip, and the controller. boot.js calls this once,
// only when the room is asked for (entry.js wantsWorkbench), and plugs the returned hooks into createOnFoot.
import { createWorkbench } from './index.js';

export function mountWorkbench(deps) {
  if (!document.querySelector('link[data-workbench]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./workbench.css', import.meta.url).href;
    link.dataset.workbench = '';
    document.head.append(link);
  }
  const hud = document.createElement('aside');
  hud.id = 'wb-hud';
  hud.className = 'wb-hud';
  hud.setAttribute('role', 'status');
  hud.setAttribute('aria-label', 'Test character');
  document.body.append(hud);
  document.body.classList.add('is-workbench');
  return createWorkbench({ ...deps, hud });
}

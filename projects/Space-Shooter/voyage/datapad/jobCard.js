// The job card (round 3, basics lane): a compact panel over the floor for the
// parts of a job that are not talk: the trip across the sector, a fight, a lock
// or riddle, a race, a random event, and the result with what it paid. The
// story beats play in the dialogue box instead (datapad/jobTalk.js). "Later"
// puts the job down; the tracker and the datapad pick it back up.
//
//   const card = createJobCard({ root, later, eyebrow, title, onChange, onLater })
//   card.show('part' | 'end' | null) · card.open
export function createJobCard({ root, later, eyebrow, title = () => '', onChange = () => {}, onLater = () => {} }) {
  let kind = null;
  function show(next) {
    const was = kind;
    kind = next || null;
    root.hidden = !kind;
    root.dataset.kind = kind || '';
    if (eyebrow) eyebrow.textContent = `${kind === 'end' ? 'JOB RESULT' : 'JOB'}${title() ? ` · ${title().toUpperCase()}` : ''}`;
    later.hidden = kind === 'end'; // the result has its own Done
    if (Boolean(was) !== Boolean(kind)) onChange(Boolean(kind));
    if (kind && !was) requestAnimationFrame(() => root.querySelector('button:not([disabled])')?.focus({ preventScroll: true }));
  }
  later.addEventListener('click', () => { show(null); onLater(); });
  return {
    show,
    get open() { return Boolean(kind); },
    get kind() { return kind; },
  };
}

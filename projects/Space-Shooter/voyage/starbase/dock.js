// Docking at the star base. The real docking game is the other lane's (minigames/docking*, branch claude/stardust-docking).
// Until it lands this stand-in resolves straight away with a clean, perfect dock, behind ONE function so swapping the real game in
// is one line: replace the body of dockAtBase with the call that opens the game and resolves with its result.
//
//   dockAtBase({ save, seed, root }) -> Promise<{ clean, grade 0..100, hullLost, timeS, standIn }>
export function dockAtBase() {
  return Promise.resolve({ clean: true, grade: 100, hullLost: 0, timeS: 0, standIn: true });
}

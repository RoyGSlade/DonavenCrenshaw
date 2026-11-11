// Wall autotiling for the interiors art (pure, so tests and Studio can use it).
// Picks the wall piece for a wall tile from the open floor around it (README in art/interiors:
// edges face the room, corners close a rectangle, outer corners stick into an L-shaped room).
export function wallPiece(open, r, c) {
  const N = open(r - 1, c), S = open(r + 1, c), W = open(r, c - 1), E = open(r, c + 1);
  if (S && !N && !E && !W) return 'edge-n';
  if (N && !S && !E && !W) return 'edge-s';
  if (E && !W && !N && !S) return 'edge-w';
  if (W && !E && !N && !S) return 'edge-e';
  if (S && E && !N && !W) return 'outer-se';
  if (S && W && !N && !E) return 'outer-sw';
  if (N && E && !S && !W) return 'outer-ne';
  if (N && W && !S && !E) return 'outer-nw';
  if (N && S) return 'edge-n'; // a thin divider between two rooms
  if (E && W) return 'edge-w';
  if (N || S || E || W) return 'edge-n';
  if (open(r + 1, c + 1)) return 'corner-nw';
  if (open(r + 1, c - 1)) return 'corner-ne';
  if (open(r - 1, c + 1)) return 'corner-sw';
  if (open(r - 1, c - 1)) return 'corner-se';
  return null; // deep inside the wall: drawn dark
}


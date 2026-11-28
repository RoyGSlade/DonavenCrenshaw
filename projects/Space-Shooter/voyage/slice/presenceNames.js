// "Tull is" / "Tull and Nessa are" (then "on the way."). Pure.
const NAMES = { tull: 'Tull', nessa: 'Nessa', pip: 'Pip', reck: 'Reck' };
export function castFor(ids) {
  const n = ids.map((id) => NAMES[id] || id);
  if (n.length <= 1) return `${n[0] || 'They'} ${n.length ? 'is' : 'are'}`;
  return `${n.slice(0, -1).join(', ')} and ${n.at(-1)} are`;
}

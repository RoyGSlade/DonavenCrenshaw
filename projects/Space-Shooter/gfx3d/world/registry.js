// Tracks every GPU resource the world creates so dispose() can free exactly
// those (and never the shared geometry/materials of GLB props, which belong to assets).
export class Registry {
  constructor() { this.geometries = new Set(); this.materials = new Set(); this.textures = new Set(); }
  geo(g) { this.geometries.add(g); return g; }
  mat(m) { this.materials.add(m); return m; }
  tex(t) { this.textures.add(t); return t; }
  /** Free everything; returns counts for tests and the debug overlay. */
  disposeAll() {
    const counts = { geometries: this.geometries.size, materials: this.materials.size, textures: this.textures.size };
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.clear(); this.materials.clear(); this.textures.clear();
    return counts;
  }
}

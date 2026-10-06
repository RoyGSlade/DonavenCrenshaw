"""Export Stardust ship (and prop) models to game-ready .glb files.  Run inside Blender:

    blender -b --python tools/3d/export_ships.py -- [options]

Normally you do not call this directly: `npm run assets:3d` (tools/3d/build.mjs)
regenerates hull-targets.json, runs this script, then rebuilds art/3d/manifest.json.

What it does for every model:
  1. opens the read-only source (.blend, or a raw .glb for drop-ins) - NOTHING is saved back;
  2. rotates it so the nose points +X with +Y up (three.js / glTF space) - the game's convention;
  3. decimates it to the triangle budget (Blender "collapse", UVs kept) and shrinks textures to <= 1024 px;
  4. centres it on the game hull and scales it so its footprint radius equals the game's hull radius
     (tools/3d/hull-targets.json, generated from engine/hull.js);
  5. writes <out>/ships|props/<name>.glb (webp textures) and retries with smaller textures / fewer
     triangles until the file is under the size budget (default 1.5 MB);
  6. writes a provenance report (tools/3d/export-report.json) that build.mjs merges into the manifest.

Options (after the `--`):
  --only a,b        export only these names (default: everything available)
  --skip a,b        leave these names alone (build.mjs passes the ones replaced by an owner drop-in)
  --out DIR         output root (default: <repo>/projects/Space-Shooter/art/3d)
  --sources DIR     folder holding the read-only Blender sources
                    (default: $STARDUST_ART_SOURCES or ~/Documents/ChatGPT/stardust/output)
  --incoming        also process drop-in files: tools/3d/incoming/{ships,props}/<name>.glb (+ optional <name>.json)
  --budget-mb N     size budget per ship file (default 1.5, decimal MB; props are capped at 1.0)
  --tex N           largest texture side (default 1024)
  --tris N          override the triangle target for every model
  --report FILE     where to write the report (default tools/3d/export-report.json)

Sidecar <name>.json for a drop-in (all optional):
  { "rotation": [0, 90, 0],      // degrees, three.js/glTF axes (what the viewer shows), applied first
    "tris": 20000, "tex": 1024, "pivot": "center" | "bottom", "scale": 1, "offset": [0, 0, 0],
    "fit": {"radius": 0.42} | {"length": 1} | {"width": 1} | {"height": 1} }
"""
import bpy, sys, os, json, math, hashlib, time, glob, shutil, subprocess, tempfile
import numpy as np
from mathutils import Matrix, Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ART3D = os.path.join(REPO, 'projects', 'Space-Shooter', 'art', '3d')


# ----------------------------------------------------------------------------- arguments
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = dict(only=None, skip=[], out=ART3D, sources=os.environ.get('STARDUST_ART_SOURCES', os.path.join(os.path.expanduser('~'), 'Documents', 'ChatGPT', 'stardust', 'output')),
             incoming=False, budget_mb=1.5, tex=1024, tris=None, report=os.path.join(HERE, 'export-report.json'))
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--incoming': o['incoming'] = True
        elif a in ('--only', '--skip', '--out', '--sources', '--report', '--budget-mb', '--tex', '--tris'):
            i += 1
            v = argv[i]
            key = a[2:].replace('-', '_')
            o[key] = v.split(',') if key in ('only', 'skip') else float(v) if key == 'budget_mb' else int(v) if key in ('tex', 'tris') else v
        else: raise SystemExit('unknown option ' + a)
        i += 1
    return o


# ----------------------------------------------------------------------------- what to export
# Each ship is a read-only source plus how to bring it into "nose +Y, up +Z" Blender space
# (the frame the 2D garage sprites were rendered in: strict overhead, nose up the page).
# `pre` is that rotation in degrees (XYZ), taken from scripts/build-stardust-meshy-parts.py.
FAMILIES = 'stardust-ship-families-20260930/approved-families-v3.blend'
MESHY = 'stardust-meshy-ships-20260930/source'
SHIPS = {
    # The standard ship. The 3D Courier is the garage Courier's four textured Meshy parts (body, wings,
    # cockpit, engines - variant 0 of each = the default build), already in nose +Y / up +Z.
    'courier': dict(kind='ship', source=f'{FAMILIES}', pre=(0, 0, 0), hull='courier', tris=30000, pivot='center',
                    objects=['Stardust_body-courier', 'Stardust_wings-courier', 'Stardust_cockpit-courier', 'Stardust_engines-courier'],
                    note='Garage Courier default build (courier:0-0-0-0). The only 3D model of the standard ship.'),
    # Needle / Manta / Wisp default builds (x:0-0-0-0) are the untouched all-zero Meshy sources.
    'needle': dict(kind='ship', source=f'{MESHY}/needle-source.blend', pre=(0, 0, 90), hull='needle', tris=30000, pivot='center',
                   note='Needle default build (needle:0-0-0-0): the original textured Meshy Twinspire source, 966,739 tris.'),
    'manta': dict(kind='ship', source=f'{MESHY}/manta-source.blend', pre=(0, 0, -90), hull='manta', tris=30000, pivot='center',
                  note='Manta default build (manta:0-0-0-0): the original textured Meshy source.'),
    'wisp': dict(kind='ship', source=f'{MESHY}/wisp-source.blend', pre=(-90, 0, 0), hull='wisp', tris=30000, pivot='center',
                 note='Wisp default build (wisp:0-0-0-0): the original textured Meshy Azure Wraith source.'),
}

# Props have no fixed hull; they are scaled to the sizes the game draws them at (cells). `fit` is the
# footprint rule the loader also uses for files that have not been through this script.
PROP_DEFAULTS = {
    'fuelStation': dict(fit={'radius': 1.0}, pivot='bottom'),
    'mine': dict(fit={'radius': 0.42}, pivot='center'),
    'asteroid': dict(fit={'radius': 1.0}, pivot='center'),
    'shard': dict(fit={'length': 0.95}, pivot='center'),
    'sentry': dict(fit={'radius': 0.5}, pivot='bottom'),
}


# ----------------------------------------------------------------------------- helpers
def display_path(src, opts):
    """A path safe to publish: relative to the sources folder or the repo, never an absolute personal path."""
    a = os.path.abspath(src)
    for base, prefix in ((os.path.abspath(opts['sources']), ''), (REPO, '')):
        if a.startswith(base + os.sep): return os.path.relpath(a, base).replace(os.sep, '/')
    return os.path.basename(a)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def log(*a):
    print('[export]', *a, flush=True)


def tri_count(obj):
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def world_vertices(obj):
    me = obj.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    m = np.array(obj.matrix_world, dtype=np.float64)
    return co @ m[:3, :3].T + m[:3, 3]


def three_euler_to_blender(deg):
    """A rotation given in three.js/glTF axes (degrees, XYZ order) as a Blender-space matrix."""
    r = Euler([math.radians(a) for a in deg], 'XYZ').to_matrix().to_4x4()
    c = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF (x,y,z) -> Blender (x,-z,y)
    return c @ r @ c.inverted()


def open_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)


def pick_meshes(spec, coll):
    names = spec.get('objects')
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and (names is None or o.name in names)]
    for o in objs:
        # The depsgraph only evaluates objects of the current scene that are visible; some sources keep their
        # parts in another scene or hidden, which would silently skip the decimate modifier.
        if o.name not in bpy.context.view_layer.objects: coll.objects.link(o)
        o.hide_viewport = False
        o.hide_render = False
        o.hide_set(False)
    bpy.context.view_layer.update()
    if names:
        missing = set(names) - {o.name for o in objs}
        if missing: raise RuntimeError('missing objects in source: ' + ', '.join(sorted(missing)))
    elif not objs:
        raise RuntimeError('no meshes in source')
    return objs


def decimated_copy(obj, ratio, collection):
    """A new mesh object with `ratio` of obj's triangles (Blender collapse; UVs and materials kept)."""
    if ratio >= 0.999:
        me = obj.data.copy()
    else:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        obj.modifiers.remove(mod)
    new = bpy.data.objects.new(obj.name + '_game', me)
    collection.objects.link(new)
    new.matrix_world = obj.matrix_world.copy()
    return new


def shrink_images(objs, cap):
    seen = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes: continue
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.name not in seen:
                    im = n.image
                    w, h = im.size
                    if max(w, h) > cap:
                        k = cap / max(w, h)
                        im.scale(max(1, int(round(w * k))), max(1, int(round(h * k))))
                    seen[im.name] = im
    return {k: list(v.size) for k, v in seen.items()}


def solve_scale(pts, centre_xy, hull_off, target_radius):
    """Uniform scale s so that max |s*(p - centre) + (hull_off, 0)| over the footprint == target_radius."""
    rel = pts[:, :2] - centre_xy
    lo, hi = 1e-6, 1e6
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        r = np.max(np.hypot(rel[:, 0] * mid + hull_off, rel[:, 1] * mid))
        if r > target_radius: hi = mid
        else: lo = mid
    return math.sqrt(lo * hi)


def optimize(raw, final):
    """Quantize/prune with gltf-transform (tools/3d/optimize.mjs) when node and the dev dependency exist; else keep the plain glb."""
    node = shutil.which('node')
    script = os.path.join(HERE, 'optimize.mjs')
    if node and os.path.isdir(os.path.join(REPO, 'node_modules', '@gltf-transform', 'functions')):
        r = subprocess.run([node, script, raw, final], cwd=REPO, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(final): return 'gltf-transform quantize (KHR_mesh_quantization)'
        log('   optimize failed, keeping the plain glb:', (r.stderr or r.stdout)[-300:])
    shutil.copyfile(raw, final)
    return 'none (node or @gltf-transform missing: run npm install)'


def export_glb(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
              export_image_format='WEBP', export_image_quality=80, export_jpeg_quality=80,
              export_image_webp_fallback=False, export_texcoords=True, export_normals=True, export_tangents=False,
              export_materials='EXPORT', export_cameras=False, export_animations=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props}
    bpy.ops.export_scene.gltf(**kw)


# ----------------------------------------------------------------------------- one model
def process(name, spec, opts, hulls):
    t0 = time.time()
    kind = spec['kind']
    src = spec['source_path']
    log(f'--- {kind} {name}  <- {src}')
    out_dir = os.path.join(opts['out'], 'ships' if kind == 'ship' else 'props')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, name + '.glb')
    budget = int(min(opts['budget_mb'], 1.0 if kind == 'prop' else 99) * 1_000_000)   # props get 1.0 MB, ships 1.5 MB
    tex_cap = int(spec.get('tex') or opts['tex'])
    tris_target = int(opts['tris'] or spec.get('tris') or 30000)

    attempts = []
    for attempt in range(6):
        open_source(src)
        scene = bpy.context.scene
        coll = bpy.data.collections.new('game_export')
        scene.collection.children.link(coll)
        srcs = pick_meshes(spec, coll)
        src_names = [o.name for o in srcs]
        total = sum(tri_count(o) for o in srcs)
        # Orientation: user rotation (drop-ins, three axes) or the family's `pre` (Blender axes), then nose +Y -> +X.
        if 'rotation' in spec: pre = three_euler_to_blender(spec['rotation'])
        else: pre = Euler([math.radians(a) for a in spec.get('pre', (0, 0, 0))], 'XYZ').to_matrix().to_4x4()
        face_x = Matrix.Rotation(-math.pi / 2, 4, 'Z') if 'rotation' not in spec else Matrix.Identity(4)
        # (A drop-in is assumed to already be in glTF convention - its `rotation` brings the nose to glTF +X.)
        base = face_x @ pre if 'rotation' not in spec else pre
        new = []
        for o in srcs:
            ratio = min(1.0, tris_target * (tri_count(o) / total) / max(1, tri_count(o)))
            n = decimated_copy(o, ratio, coll)
            n.matrix_world = base @ n.matrix_world
            new.append(n)
        bpy.context.view_layer.update()
        for n in new:  # bake the transform into the vertices so the .glb nodes are identity
            n.data.transform(n.matrix_world)
            n.matrix_world = Matrix.Identity(4)
            n.parent = None
            n.data.validate(clean_customdata=False)
            n.data.update()
            for p in n.data.polygons: p.use_smooth = True
        pts = np.vstack([world_vertices(n) for n in new])
        lo, hi = pts.min(axis=0), pts.max(axis=0)
        centre = (lo + hi) / 2
        fit = spec.get('fit')
        hull = hulls.get(spec['hull']) if spec.get('hull') else None
        if hull:
            hull_off = (hull['nose'] - hull['tail']) / 2        # hull centre ahead of the sprite centre
            s = solve_scale(pts, centre[:2], hull_off, hull['radius'])
        elif fit:
            ext = hi - lo
            if 'radius' in fit: s = fit['radius'] / float(np.max(np.hypot(pts[:, 0] - centre[0], pts[:, 1] - centre[1])))
            elif 'length' in fit: s = fit['length'] / ext[0]
            elif 'width' in fit: s = fit['width'] / ext[1]
            elif 'height' in fit: s = fit['height'] / ext[2]
            else: s = 1.0
            hull_off = 0.0
        else:
            s, hull_off = 1.0, 0.0
        s *= float(spec.get('scale', 1.0))
        ox, oy, oz = spec.get('offset', (0, 0, 0))                # three.js axes -> Blender (x, -z, y)
        zc = (lo[2] + hi[2]) / 2 if spec.get('pivot', 'center') == 'center' else lo[2]
        shift = Vector((centre[0], centre[1], zc))
        m = Matrix.Translation((hull_off + ox, -oz, oy)) @ Matrix.Scale(s, 4) @ Matrix.Translation(-shift)
        for n in new:
            n.data.transform(m)
            n.data.update()
        pts2 = np.vstack([world_vertices(n) for n in new])
        lo2, hi2 = pts2.min(axis=0), pts2.max(axis=0)
        tris_out = sum(tri_count(n) for n in new)
        textures = shrink_images(new, tex_cap)
        for o in list(bpy.data.objects):  # export only the game meshes: no stray cubes, lights, cameras or parts
            if o not in new: bpy.data.objects.remove(o, do_unlink=True)
        raw = os.path.join(tempfile.gettempdir(), f'stardust-{name}-raw.glb')
        export_glb(raw, new)
        post = optimize(raw, out_path)
        size = os.path.getsize(out_path)
        attempts.append(dict(tris=tris_out, tex=tex_cap, bytes=size, rawBytes=os.path.getsize(raw)))
        log(f'   attempt {attempt + 1}: {tris_out} tris, textures <= {tex_cap}px -> {size / 1000:.0f} KB (budget {budget / 1000:.0f} KB)')
        if size <= budget: break
        if tex_cap > 512: tex_cap = {1024: 768, 768: 512}.get(tex_cap, 512)
        else: tris_target = int(tris_target * 0.8)
    else:
        log('   WARNING: still over budget after retries')

    # In three.js space (glTF): x = X, y = Z(up), z = -Y(blender).  Report the footprint in game axes.
    foot = dict(length=float(hi2[0] - lo2[0]), width=float(hi2[1] - lo2[1]), height=float(hi2[2] - lo2[2]),
                min=[float(lo2[0]), float(lo2[2]), float(-hi2[1])], max=[float(hi2[0]), float(hi2[2]), float(-lo2[1])],
                radius=float(np.max(np.hypot(pts2[:, 0], pts2[:, 1]))))
    entry = dict(name=name, kind=kind, source=display_path(src, opts),
                 sourceSha256=sha256(src), sourceBytes=os.path.getsize(src), sourceTriangles=total,
                 sourceObjects=src_names, postProcess=post, note=spec.get('note', ''),
                 orientation=('rotation ' + str(spec['rotation']) + ' (three axes)') if 'rotation' in spec else
                 f"pre-rotation {list(spec.get('pre', (0, 0, 0)))} deg (Blender XYZ) so the nose points +Y, then -90 deg about Z so the nose points +X",
                 hull=spec.get('hull'), fit=fit, pivot=spec.get('pivot', 'center'), scaleApplied=s, footprint=foot,
                 triangles=tris_out, textures=textures, attempts=attempts, file=os.path.relpath(out_path, opts['out']).replace(os.sep, '/'),
                 bytes=os.path.getsize(out_path), sha256=sha256(out_path), seconds=round(time.time() - t0, 1))
    if hull:
        entry['hullTarget'] = hull
        entry['hullFit'] = dict(radiusRatio=foot['radius'] / hull['radius'], lengthRatio=foot['length'] / hull['length'], widthRatio=foot['width'] / hull['width'])
    return entry


# ----------------------------------------------------------------------------- main
def main():
    opts = parse_args()
    with open(os.path.join(HERE, 'hull-targets.json')) as f:
        hulls = json.load(f)['targets']
    jobs = []
    for name, spec in SHIPS.items():
        sp = os.path.join(opts['sources'], spec['source'])
        if name in opts['skip']:
            log(f'skip {name}: replaced by an owner drop-in')
            continue
        if not os.path.exists(sp):
            log(f'skip {name}: source not found ({sp})')
            continue
        jobs.append((name, dict(spec, source_path=sp)))
    if opts['incoming']:
        for kind, sub in (('ship', 'ships'), ('prop', 'props')):
            for f in sorted(glob.glob(os.path.join(HERE, 'incoming', sub, '*.glb'))):
                name = os.path.splitext(os.path.basename(f))[0]
                spec = dict(kind=kind, source_path=f, objects=None, pivot='center' if kind == 'ship' else PROP_DEFAULTS.get(name, {}).get('pivot', 'center'),
                            rotation=[0, 0, 0], note='Owner drop-in (tools/3d/incoming).')
                if kind == 'ship' and name in hulls: spec['hull'] = name
                elif kind == 'ship': spec['fit'] = {'radius': 0.6}
                else: spec['fit'] = PROP_DEFAULTS.get(name, {}).get('fit', {'radius': 0.5})
                side = os.path.join(os.path.dirname(f), name + '.json')
                if os.path.exists(side):
                    with open(side) as sf: extra = json.load(sf)
                    if isinstance(extra.get(name), dict): extra = extra[name]      # the viewer prints {"name": {...}}
                    spec.update({k: v for k, v in extra.items() if k in ('rotation', 'tris', 'tex', 'pivot', 'fit', 'scale', 'offset')})
                    if 'fit' in extra: spec.pop('hull', None)
                jobs.append((name, spec))
    if opts['only']:
        jobs = [j for j in jobs if j[0] in opts['only']]
    report = []
    for name, spec in jobs:
        try:
            report.append(process(name, spec, opts, hulls))
        except Exception as e:  # keep going: one bad model must not block the rest
            import traceback
            traceback.print_exc()
            report.append(dict(name=name, error=str(e)))
    with open(opts['report'], 'w') as f:
        json.dump(dict(blender=bpy.app.version_string, generated=time.strftime('%Y-%m-%dT%H:%M:%S'), models=report), f, indent=2)
    log('report ->', opts['report'])
    for r in report:
        if 'error' in r: log('FAILED', r['name'], r['error'])
        else: log(f"ok {r['name']}: {r['triangles']} tris, {r['bytes'] / 1024:.0f} KB, scale {r['scaleApplied']:.4f}")


main()

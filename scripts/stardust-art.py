#!/usr/bin/env python3
"""Stardust cast art: copy the cast lane's pictures into the game, small.

Reads ~/Desktop/lhc-lanes/stardust/cast/manifest.json (override: STARDUST_CAST_DIR) and writes
  projects/Space-Shooter/voyage/art/cast/<id>-<neutral|happy|annoyed>.webp   (256 px, q80, alpha kept)
  projects/Space-Shooter/voyage/onfoot/art/cast/<id>.webp                    (128 px, faces up, pivot at the centre)

Sprite pivot: the manifest's `pivot` (the body centre, not the bbox centre) is moved to the canvas
centre by padding the canvas, so the game's centred rotate-and-draw (onfoot/draw.js drawBody) spins
the body about its own middle with no code. `gameplay_px` then becomes the new canvas side; the
game draws a cast sprite at size 46 * CAST_LOOK.scale, so scale = side / 46. The table is printed.

Run with a PIL that has WebP, e.g. ~/Desktop/lhc-lanes/stardust/art/kauto/.venv/bin/python scripts/stardust-art.py
"""
import json, os, sys
from pathlib import Path
from PIL import Image

repo = Path(__file__).resolve().parent.parent
voyage = repo / 'projects/Space-Shooter/voyage'
src = Path(os.environ.get('STARDUST_CAST_DIR') or Path.home() / 'Desktop/lhc-lanes/stardust/cast')
manifest = json.loads((src / 'manifest.json').read_text())
PORTRAIT_PX, SPRITE_PX = 256, 128

(voyage / 'art/cast').mkdir(parents=True, exist_ok=True)
(voyage / 'onfoot/art/cast').mkdir(parents=True, exist_ok=True)
rows = []
for cid, c in manifest['characters'].items():
    for emotion, p in c['portraits'].items():
        im = Image.open(src / p['file']).convert('RGBA')
        im = im.resize((PORTRAIT_PX, PORTRAIT_PX), Image.LANCZOS)
        im.save(voyage / f'art/cast/{cid}-{emotion}.webp', 'WEBP', quality=80, method=6)
    s = c['sprite']
    im = Image.open(src / s['file']).convert('RGBA')
    n = im.width
    px, py = s['pivot'][0] * n, s['pivot'][1] * n
    # Pad so the pivot lands on the canvas centre.
    half = max(px, n - px, py, n - py)
    side = int(round(half * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, (int(round(side / 2 - px)), int(round(side / 2 - py))))
    out = SPRITE_PX
    canvas = canvas.resize((out, out), Image.LANCZOS)
    canvas.save(voyage / f'onfoot/art/cast/{cid}.webp', 'WEBP', quality=82, method=6)
    # The figure was gameplay_px / n of the old canvas; the new canvas is `side` source px wide.
    game_px = s['gameplay_px'] * side / n
    rows.append((cid, round(game_px, 1), round(game_px / 46, 3)))
print('id gameplay_px(new canvas) CAST_LOOK.scale (= px / 46)')
for r in rows:
    print(*r)

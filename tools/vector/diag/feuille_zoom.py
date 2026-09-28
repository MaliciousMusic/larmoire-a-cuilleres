"""Outil de diagnostic (voir ../README.md) : lancer depuis tools/vector/ : python diag/feuille_zoom.py …"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from vec import *
import feuilles as F
n = sys.argv[1]
x0, y0, x1, y1, z = map(int, sys.argv[2:7])
Z = np.load(WORK / "feuilles_full.npz")
full = Z[f"f_{n}"]
vis, det, inside = F.load_visible()
rgb = load_rgb(F.S.SRC)
H, W = full.shape
# fond : l'affiche (dans le cadre)
bg = np.full((y1 - y0, x1 - x0, 3), 245, np.uint8)
ys = slice(max(y0, 0), min(y1, 2481)); xs = slice(max(x0, 0), min(x1, 3508))
bg[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0] = (rgb[ys, xs] * 255).astype(np.uint8)
im = Image.fromarray(bg).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
a = np.asarray(im).copy()
gx0, gy0 = (x0 - F.EX0) * F.KF, (y0 - F.EY0) * F.KF
sub = full[gy0:gy0 + (y1 - y0) * F.KF, gx0:gx0 + (x1 - x0) * F.KF]
sub = np.asarray(Image.fromarray(sub.astype(np.uint8) * 255).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)) > 127
edge = sub & ~ndi.binary_erosion(sub, iterations=1)
a[edge] = (255, 255, 0)
solid = F.solid_of(n, vis, det)[gy0:gy0 + (y1 - y0) * F.KF, gx0:gx0 + (x1 - x0) * F.KF]
solid = np.asarray(Image.fromarray(solid.astype(np.uint8) * 255).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)) > 127
e2 = solid & ~ndi.binary_erosion(solid, iterations=1)
a[e2] = (255, 0, 0)
im = Image.fromarray(a)
d = ImageDraw.Draw(im)
for x in range((x0 // 10 + 1) * 10, x1, 10):
    if x % 50 == 0:
        d.text(((x - x0) * z + 1, 1), str(x), fill=(0, 0, 0))
for y in range((y0 // 10 + 1) * 10, y1, 10):
    if y % 50 == 0:
        d.text((1, (y - y0) * z + 1), str(y), fill=(0, 0, 0))
im.save(WORK / "fzoom.png")

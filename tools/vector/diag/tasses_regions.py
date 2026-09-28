"""Outil de diagnostic (voir ../README.md) : lancer depuis tools/vector/ : python diag/tasses_regions.py …"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sys
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
from vec import *
import tasses as T
w = T.load()
m = w > 0.5
row = np.nonzero(m[T.BAND])[0]
m2 = m.copy(); m2[T.BAND, row.min():row.max() + 1] = True
fill = ndi.binary_fill_holes(m2)
holes = fill & ~m2
lab, n = ndi.label(holes)
np.save(WORK / "t_lab.npy", lab)
rgb = (load_rgb(T.SRC)[:, T.X0:T.X1] * 255).astype(np.uint8)
x0, y0, x1, y1, z = map(int, sys.argv[1:6])
X0 = x0 - T.X0; X1 = x1 - T.X0
sub = rgb[y0:y1, X0:X1].copy()
L = lab[y0:y1, X0:X1]
ids = [i for i in np.unique(L) if i]
rng = np.random.default_rng(3)
for i in ids:
    c = rng.integers(0, 255, 3)
    msk = L == i
    sub[msk] = (0.5 * sub[msk] + 0.5 * c).astype(np.uint8)
im = Image.fromarray(sub).resize(((X1 - X0) * z, (y1 - y0) * z), Image.NEAREST)
d = ImageDraw.Draw(im)
for i in ids:
    msk = L == i
    if msk.sum() < 60:
        continue
    dist = ndi.distance_transform_edt(np.pad(msk, 1))[1:-1, 1:-1]
    iy, ix = np.unravel_index(np.argmax(dist), dist.shape)
    d.text((ix * z - 6, iy * z - 5), str(i), fill=(200, 0, 0))
for x in range((x0 // 20 + 1) * 20, x1, 20):
    d.text(((x - x0) * z, 0), str(x), fill=(0, 0, 160))
for y in range((y0 // 20 + 1) * 20, y1, 20):
    d.text((0, (y - y0) * z), str(y), fill=(0, 0, 160))
im.save(WORK / "t_reg_zoom.png")

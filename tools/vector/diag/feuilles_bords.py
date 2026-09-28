"""Diagnostic : bords réels / cachés de chaque feuille selon l'ordre d'empilement (repère affiche)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from vec import *
import feuilles as F


def margins(vis, n, inside):
    H, W = inside.shape
    i = F.ORDER.index(n)
    behind = np.zeros((H, W), bool)
    for m in F.ORDER[:i]:
        behind |= vis[m]
    anyleaf = np.zeros((H, W), bool)
    for m in F.ORDER:
        anyleaf |= vis[m]
    photo = inside & ~anyleaf
    photo = ndi.binary_opening(photo, iterations=3)  # pas les liserés entre aplats
    real_nb = ndi.binary_dilation(photo | behind, iterations=8)
    if n == "ecailles":
        M = ndi.binary_fill_holes(ndi.binary_closing(vis[n], iterations=6))
    else:
        M = ndi.binary_closing(vis[n], iterations=2)
    cs, _ = cv2.findContours(M.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=len)[:, 0, :]
    fx, fy = (F.FRAME_X - F.EX0) * F.KF, (F.FRAME_Y - F.EY0) * F.KF
    kinds = []
    for x, y in c:
        if x >= fx - 3 or y >= fy - 3:
            kinds.append("cadre")
        elif real_nb[y, x]:
            kinds.append("reel")
        else:
            kinds.append("cache")
    pts = np.stack([(c[:, 0] + 0.5) / F.KF + F.EX0, (c[:, 1] + 0.5) / F.KF + F.EY0], 1)
    return pts, kinds


if __name__ == "__main__":
    vis, det, inside = F.load_visible()
    H, W = inside.shape
    im = Image.new("RGB", (W // 2, H // 2), (250, 250, 250))
    d = ImageDraw.Draw(im)
    kc = {"reel": (0, 160, 0), "cache": (230, 0, 0), "cadre": (0, 0, 255)}
    for n in F.ORDER:
        pts, kinds = margins(vis, n, inside)
        for (x, y), k in zip(pts, kinds):
            X, Y = (x - F.EX0) * F.KF / 2, (y - F.EY0) * F.KF / 2
            d.point((X, Y), fill=kc[k])
        runs = []
        cur, start = kinds[0], 0
        for i, k in enumerate(kinds + [None]):
            if k != cur:
                runs.append((cur, start, i - 1))
                cur, start = k, i
        print(n)
        for k, a, b in runs:
            if b - a >= 10:
                print(f"   {k:6s} {tuple(np.round(pts[a]).astype(int))} -> {tuple(np.round(pts[b]).astype(int))}"
                      f"  ({(b - a + 1) / F.KF:.0f} px)")
    for x in range(2300, F.EX1, 100):
        X = (x - F.EX0) * F.KF // 2
        d.line([(X, 0), (X, im.height)], fill=(225, 225, 225))
        d.text((X + 2, 2), str(x), fill=(120, 120, 120))
    for y in range(1200, F.EY1, 100):
        Y = (y - F.EY0) * F.KF // 2
        d.line([(0, Y), (im.width, Y)], fill=(225, 225, 225))
        d.text((2, Y + 2), str(y), fill=(120, 120, 120))
    im.save(WORK / "feuilles_marges.png")

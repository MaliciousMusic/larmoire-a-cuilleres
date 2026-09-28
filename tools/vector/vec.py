"""Outils communs de vectorisation (L'Armoire à Cuillères).

- chargement des sources (CMJN -> RVB, JPEG tronqués tolérés)
- tracé potrace (port Python pur « potracer ») d'un masque agrandi k fois
- sérialisation compacte des chemins SVG (1 décimale, commandes relatives)
- rastérisation rapide des courbes (contrôle IoU) et rendu réel par Chrome sans tête
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
import potrace
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "tools" / "vector" / "_work"
OUT = ROOT / "assets" / "brand"
DATA = WORK / "data"
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"

for _d in (WORK, OUT, DATA):
    _d.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- chargement
def load_rgb(path) -> np.ndarray:
    """Image -> tableau float RVB [0,1] (CMJN converti, alpha composé sur blanc)."""
    im = Image.open(ROOT / path if not os.path.isabs(str(path)) else path)
    im.load()
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return np.asarray(im.convert("RGB")).astype(np.float64) / 255.0


def load_rgba(path) -> np.ndarray:
    im = Image.open(ROOT / path if not os.path.isabs(str(path)) else path)
    im.load()
    return np.asarray(im.convert("RGBA")).astype(np.float64) / 255.0


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def upscale(a: np.ndarray, k: float, interp=cv2.INTER_CUBIC) -> np.ndarray:
    if k == 1:
        return a.astype(np.float32)
    h, w = a.shape[:2]
    return cv2.resize(a.astype(np.float32), (int(round(w * k)), int(round(h * k))), interpolation=interp)


def save_gray(a: np.ndarray, name: str):
    """Enregistre un masque / une carte [0,1] dans _work pour inspection."""
    a = np.asarray(a)
    if a.dtype == bool:
        a = a.astype(np.uint8) * 255
    elif a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(a).save(WORK / name)


# --------------------------------------------------------------------------- potrace
class Curve:
    """Courbe fermée potrace : point de départ + segments en coordonnées finales."""

    __slots__ = ("start", "segs", "sign", "area")

    def __init__(self, start, segs, sign, area):
        self.start = start  # (x, y)
        self.segs = segs  # ('C', c1, c2, p) | ('L', p)
        self.sign = sign  # True : contour extérieur, False : trou
        self.area = area

    def transform(self, fn):
        segs = []
        for s in self.segs:
            if s[0] == "C":
                segs.append(("C", fn(s[1]), fn(s[2]), fn(s[3])))
            else:
                segs.append(("L", fn(s[1])))
        return Curve(fn(self.start), segs, self.sign, self.area)

    def points(self, n_per_bezier=8):
        """Polyligne aplatie (pour rastériser / mesurer)."""
        pts = [self.start]
        cur = self.start
        for s in self.segs:
            if s[0] == "C":
                p0, p1, p2, p3 = cur, s[1], s[2], s[3]
                for i in range(1, n_per_bezier + 1):
                    t = i / n_per_bezier
                    mt = 1 - t
                    pts.append((
                        mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                        mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
                    ))
                cur = p3
            else:
                pts.append(s[1])
                cur = s[1]
        return np.array(pts)

    def bbox(self):
        p = self.points(6)
        return (p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max())

    def signed_area(self):
        p = self.points(6)
        x, y = p[:, 0], p[:, 1]
        return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def trace(mask: np.ndarray, k: float = 1.0, offset=(0.0, 0.0), turdsize=None, alphamax=1.0,
          opttolerance=0.2, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY) -> list[Curve]:
    """Trace un masque booléen (True = encre), agrandi k fois par rapport au repère final.

    Les coordonnées renvoyées sont divisées par k et décalées de offset (repère final).
    opttolerance est exprimée en pixels du repère final (convertie en pixels du masque).
    """
    mask = np.ascontiguousarray(mask.astype(bool))
    if turdsize is None:
        turdsize = int(2 * k * k)
    bm = potrace.Bitmap(~mask)  # potracer inverse les booléens
    plist = bm.trace(turdsize=turdsize, turnpolicy=turnpolicy, alphamax=alphamax,
                     opticurve=True, opttolerance=opttolerance * k)
    ox, oy = offset

    def f(p):
        return (p.x / k + ox, p.y / k + oy)

    curves = []
    for c in plist:
        segs = []
        for s in c:
            if s.is_corner:
                segs.append(("L", f(s.c)))
                segs.append(("L", f(s.end_point)))
            else:
                segs.append(("C", f(s.c1), f(s.c2), f(s.end_point)))
        curves.append(Curve(f(c.start_point), segs, bool(c._path.sign), c._path.area / (k * k)))
    return curves


# --------------------------------------------------------------------------- sérialisation
PREC = 1  # décimales des coordonnées écrites (modifiable localement : with_prec)


def _fmt(v: int, prec: int = None) -> str:
    """Entier en unités de 10^-prec -> texte compact ('-.5', '12', '3.4', '.05')."""
    prec = PREC if prec is None else prec
    neg = v < 0
    v = abs(v)
    m = 10 ** prec
    ip, fp = divmod(v, m)
    if fp == 0:
        s = str(ip)
    else:
        frac = str(fp).rjust(prec, "0").rstrip("0")
        s = ("" if ip == 0 else str(ip)) + "." + frac
    return "-" + s if neg else s


def _join(nums) -> str:
    """Nombres séparés au plus court : pas d'espace devant un « - », ni devant un « .x » quand le nombre
    précédent a déjà un point décimal (« 1.5.5 » = 1.5 puis .5, grammaire des chemins SVG)."""
    out = []
    prev = ""
    for i, n in enumerate(nums):
        t = _fmt(n)
        if i and not (t[0] == "-" or (t[0] == "." and "." in prev)):
            out.append(" ")
        out.append(t)
        prev = t
    return "".join(out)


def _q(p):
    m = 10 ** PREC
    return (int(round(p[0] * m)), int(round(p[1] * m)))


class with_prec:
    """with with_prec(2): ... écrit les chemins avec 2 décimales."""

    def __init__(self, prec):
        self.prec = prec

    def __enter__(self):
        global PREC
        self.old = PREC
        PREC = self.prec

    def __exit__(self, *a):
        global PREC
        PREC = self.old


def curves_to_d(curves: list[Curve]) -> str:
    """Chemin SVG compact : m absolu relatif au point courant, c / l relatifs, z.

    Les coordonnées sont arrondies au dixième en absolu avant de prendre les écarts :
    aucune dérive d'arrondi.
    """
    parts = []
    cur = (0, 0)
    for cv in curves:
        s = _q(cv.start)
        parts.append("M" + _join([s[0], s[1]]) if not parts else "m" + _join([s[0] - cur[0], s[1] - cur[1]]))
        pos = s
        start = s
        last_cmd = None
        last_num = ""
        for seg in cv.segs:
            if seg[0] == "C":
                c1, c2, p = _q(seg[1]), _q(seg[2]), _q(seg[3])
                nums = [c1[0] - pos[0], c1[1] - pos[1], c2[0] - pos[0], c2[1] - pos[1], p[0] - pos[0], p[1] - pos[1]]
                if all(v == 0 for v in nums):
                    continue
                cmd = "c"
                pos = p
            else:
                p = _q(seg[1])
                nums = [p[0] - pos[0], p[1] - pos[1]]
                if nums == [0, 0]:
                    continue
                cmd = "l"
                pos = p
            body = _join(nums)
            if cmd == last_cmd:
                # même commande répétée : séparateur seulement s'il est nécessaire
                if body[0] == "-" or (body[0] == "." and "." in last_num):
                    parts.append(body)
                else:
                    parts.append(" " + body)
            else:
                parts.append(cmd + body)
                last_cmd = cmd
            last_num = _fmt(nums[-1])
        parts.append("z")
        cur = start  # après z, le point courant revient au début du sous-chemin
    return "".join(parts)


def poly_to_d(pts, closed=False) -> str:
    """Polyligne -> chemin compact (M puis l relatifs)."""
    q = [_q(p) for p in pts]
    out = ["M" + _join(list(q[0]))]
    nums = []
    for a, b in zip(q, q[1:]):
        if a == b:
            continue
        nums += [b[0] - a[0], b[1] - a[1]]
    if nums:
        out.append("l" + _join(nums))
    if closed:
        out.append("z")
    return "".join(out)


def parse_d(d: str) -> list:
    """Chemin produit par curves_to_d (M, m, c, l, z) -> liste de Curve (sign déduit de l'orientation)."""
    import re
    toks = re.findall(r"[MmCcLlZz]|-?(?:\d+\.?\d*|\.\d+)", d)
    curves = []
    i = 0
    cmd = None
    cur = (0.0, 0.0)
    start = None
    segs = []

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    while i < len(toks):
        t = toks[i]
        if t in "MmCcLlZz":
            cmd = t
            i += 1
            if cmd in "Zz":
                if start is not None:
                    curves.append((start, segs))
                cur = start
                start, segs = None, []
                continue
        if cmd in "Mm":
            x, y = num(), num()
            cur = (x, y) if cmd == "M" or cur is None else (cur[0] + x, cur[1] + y)
            start, segs = cur, []
            cmd = "l" if cmd == "m" else "L"
        elif cmd == "c":
            v = [num() for _ in range(6)]
            c1 = (cur[0] + v[0], cur[1] + v[1])
            c2 = (cur[0] + v[2], cur[1] + v[3])
            p = (cur[0] + v[4], cur[1] + v[5])
            segs.append(("C", c1, c2, p))
            cur = p
        elif cmd == "l":
            x, y = num(), num()
            p = (cur[0] + x, cur[1] + y)
            segs.append(("L", p))
            cur = p
        else:
            raise ValueError("commande non gérée : " + str(cmd))
    out = []
    for st, sg in curves:
        c = Curve(st, sg, True, 0.0)
        a = c.signed_area()
        out.append(Curve(st, sg, a > 0, abs(a)))
    return out


def curves_bbox(curves: list[Curve]):
    if not curves:
        return None
    b = np.array([c.bbox() for c in curves])
    return [round(float(b[:, 0].min()), 1), round(float(b[:, 1].min()), 1),
            round(float(b[:, 2].max()), 1), round(float(b[:, 3].max()), 1)]


def transform_curves(curves, M):
    """Applique une matrice affine 2x3 à des courbes."""
    M = np.asarray(M, dtype=float)

    def f(p):
        return (M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2], M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2])

    return [c.transform(f) for c in curves]


def fix_orientation(curves: list[Curve]) -> list[Curve]:
    """Oriente les contours extérieurs dans un sens et les trous dans l'autre (nonzero == evenodd)."""
    out = []
    for c in curves:
        a = c.signed_area()
        want_positive = c.sign
        if (a > 0) != want_positive:
            out.append(reverse_curve(c))
        else:
            out.append(c)
    return out


def reverse_curve(c: Curve) -> Curve:
    pts = [c.start]
    for s in c.segs:
        pts.append(s[-1])
    segs = []
    n = len(c.segs)
    for i in range(n - 1, -1, -1):
        s = c.segs[i]
        prev = pts[i]
        if s[0] == "C":
            segs.append(("C", s[2], s[1], prev))
        else:
            segs.append(("L", prev))
    return Curve(pts[-1], segs, c.sign, c.area)


# --------------------------------------------------------------------------- fusion de segments
def _bez(p0, p1, p2, p3, t):
    t = t[:, None]
    mt = 1 - t
    return mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3


def _fit_cubic(P, t0, t1):
    """Ajustement de Schneider : extrémités fixes, directions de tangentes t0 (au départ), t1 (à
    l'arrivée, orientée vers l'intérieur). Renvoie (c1, c2)."""
    p0, p3 = P[0], P[-1]
    d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    L = d[-1]
    if L == 0:
        return p0, p3
    u = d / L
    for _ in range(3):
        b0 = (1 - u) ** 3
        b1 = 3 * u * (1 - u) ** 2
        b2 = 3 * u * u * (1 - u)
        b3 = u ** 3
        A1 = t0[None, :] * b1[:, None]
        A2 = t1[None, :] * b2[:, None]
        C00 = (A1 * A1).sum()
        C01 = (A1 * A2).sum()
        C11 = (A2 * A2).sum()
        tmp = P - (p0 * (b0 + b1)[:, None] + p3 * (b2 + b3)[:, None])
        X0 = (A1 * tmp).sum()
        X1 = (A2 * tmp).sum()
        det = C00 * C11 - C01 * C01
        if abs(det) < 1e-12:
            a1 = a2 = L / 3
        else:
            a1 = (X0 * C11 - X1 * C01) / det
            a2 = (C00 * X1 - C01 * X0) / det
        if a1 < 1e-3 * L or a2 < 1e-3 * L:
            a1 = a2 = L / 3
        c1 = p0 + a1 * t0
        c2 = p3 + a2 * t1
        # reparamétrage (Newton) pour affiner u
        q = _bez(p0, c1, c2, p3, u)
        tt = u[:, None]
        dq = 3 * ((1 - tt) ** 2 * (c1 - p0) + 2 * (1 - tt) * tt * (c2 - c1) + tt ** 2 * (p3 - c2))
        ddq = 6 * ((1 - tt) * (c2 - 2 * c1 + p0) + tt * (p3 - 2 * c2 + c1))
        num = ((q - P) * dq).sum(1)
        den = (dq * dq).sum(1) + ((q - P) * ddq).sum(1)
        ok = np.abs(den) > 1e-9
        u = np.where(ok, u - np.where(ok, num / np.where(ok, den, 1), 0), u)
        u = np.clip(u, 0, 1)
        u[0], u[-1] = 0, 1
    return c1, c2


def _seg_points(p0, seg, n=10):
    t = np.linspace(0, 1, n + 1)[1:]
    if seg[0] == "C":
        return _bez(np.asarray(p0), np.asarray(seg[1]), np.asarray(seg[2]), np.asarray(seg[3]), t)
    return np.asarray(p0) + t[:, None] * (np.asarray(seg[1]) - np.asarray(p0))


def _hausdorff(A, B):
    """Distance de Hausdorff symétrique entre deux polylignes échantillonnées (points)."""
    d = np.hypot(A[:, None, 0] - B[None, :, 0], A[:, None, 1] - B[None, :, 1])
    return max(d.min(1).max(), d.min(0).max())


def merge_curve(c: "Curve", tol: float, max_run: int = 12) -> "Curve":
    """Fusionne des suites de segments de Bézier consécutifs (sans coin) en un seul cubique quand
    l'écart (Hausdorff) reste sous tol. Les coins (segments L) sont conservés."""
    segs = c.segs
    out = []
    pos = np.asarray(c.start, float)
    i = 0
    n = len(segs)
    while i < n:
        s = segs[i]
        if s[0] != "C":
            out.append(s)
            pos = np.asarray(s[1], float)
            i += 1
            continue
        best_j, best = i, s
        p0 = pos
        pts = [p0[None, :], _seg_points(p0, s)]
        cur = np.asarray(s[3], float)
        t0 = np.asarray(s[1], float) - p0
        if np.hypot(*t0) < 1e-9:
            t0 = np.asarray(s[2], float) - p0
        t0 = t0 / (np.hypot(*t0) or 1)
        j = i + 1
        while j < n and j - i < max_run and segs[j][0] == "C":
            sj = segs[j]
            pts.append(_seg_points(cur, sj))
            cur = np.asarray(sj[3], float)
            P = np.concatenate(pts)
            t1 = np.asarray(sj[2], float) - cur
            if np.hypot(*t1) < 1e-9:
                t1 = np.asarray(sj[1], float) - cur
            t1 = t1 / (np.hypot(*t1) or 1)
            c1, c2 = _fit_cubic(P, t0, t1)
            F = _bez(p0, c1, c2, cur, np.linspace(0, 1, 60))
            if _hausdorff(P, F) > tol:
                break
            best_j, best = j, ("C", tuple(c1), tuple(c2), tuple(cur))
            j += 1
        out.append(best)
        pos = np.asarray(best[-1], float)
        i = best_j + 1
    return Curve(c.start, out, c.sign, c.area)


def merge_curves(curves, tol):
    return [merge_curve(c, tol) for c in curves]


def _rdp_closed(P, eps):
    """Douglas-Peucker sur une polyligne fermée (P[0] != P[-1])."""
    n = len(P)
    if n < 4:
        return P
    # coupe au point le plus éloigné du premier : deux moitiés ouvertes
    d = np.hypot(*(P - P[0]).T)
    k = int(np.argmax(d))

    def rdp(Q):
        keep = np.zeros(len(Q), bool)
        keep[0] = keep[-1] = True
        stack = [(0, len(Q) - 1)]
        while stack:
            i, j = stack.pop()
            if j <= i + 1:
                continue
            a, b = Q[i], Q[j]
            ab = b - a
            L = np.hypot(*ab)
            seg = Q[i + 1:j]
            if L == 0:
                dd = np.hypot(*(seg - a).T)
            else:
                dd = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / L
            m = int(np.argmax(dd))
            if dd[m] > eps:
                keep[i + 1 + m] = True
                stack += [(i, i + 1 + m), (i + 1 + m, j)]
        return Q[keep]

    A = rdp(P[:k + 1])
    B = rdp(np.vstack([P[k:], P[:1]]))
    return np.vstack([A[:-1], B[:-1]])


def compact(curves, tol=0.3, merge_tol=None, small_area=0.0, small_tol=None):
    """Réduit le poids : fusion des Béziers (écart <= merge_tol) puis, courbe par courbe, remplacement par
    un polygone quand il est plus court à écrire et reste à moins de tol de la courbe. Les courbes d'aire
    < small_area (cellules de hachures, px²) acceptent small_tol."""
    if merge_tol is None:
        merge_tol = tol
    out = []
    for c in curves:
        t = small_tol if (small_tol is not None and c.area < small_area) else tol
        mt = small_tol if (small_tol is not None and c.area < small_area) else merge_tol
        m = merge_curve(c, mt) if mt > 0 else c
        dense = c.points(12)[:-1]
        poly = _rdp_closed(dense, t)
        if len(poly) >= 3:
            # un polygone de Douglas-Peucker est inscrit : il rétrécit les petites cellules (hachures plus
            # sombres). On le redimensionne autour de son centre pour garder l'aire de la courbe.
            def _area(P):
                x, y = P[:, 0], P[:, 1]
                return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
            a0, a1 = _area(dense), _area(poly)
            if a1 > 0 and 0.6 < a0 / a1 < 1.6:
                cen = poly.mean(axis=0)
                poly = cen + (poly - cen) * math.sqrt(a0 / a1)
            pc = Curve(tuple(poly[0]), [("L", tuple(p)) for p in poly[1:]] + [("L", tuple(poly[0]))],
                       c.sign, c.area)
            if len(curves_to_d([pc])) < len(curves_to_d([m])):
                out.append(pc)
                continue
        out.append(m)
    return out


# --------------------------------------------------------------------------- rastérisation / contrôle
def raster_curves(curves: list[Curve], shape, scale=1.0, offset=(0.0, 0.0)) -> np.ndarray:
    """Rastérise (pair-impair) des courbes dans un tableau de forme shape, avec antialiasing x4."""
    ss = 4
    h, w = shape
    polys = []
    for c in curves:
        p = c.points(10)
        p = (p - np.array(offset)) * scale * ss
        polys.append(np.round(p * 16).astype(np.int32))
    img = np.zeros((h * ss, w * ss), np.uint8)
    if polys:
        cv2.fillPoly(img, polys, 255, lineType=cv2.LINE_8, shift=4)
    img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
    return img.astype(np.float32) / 255.0


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a = a > 0.5
    b = b > 0.5
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 1.0


def overlay(ref: np.ndarray, got: np.ndarray, name: str):
    """Superposition : noir = accord, rouge = seulement source, bleu = seulement vecteur."""
    r = ref > 0.5
    g = got > 0.5
    img = np.full(r.shape + (3,), 255, np.uint8)
    img[r & g] = (0, 0, 0)
    img[r & ~g] = (230, 30, 30)
    img[~r & g] = (30, 90, 240)
    Image.fromarray(img).save(WORK / name)


def chrome_render(html_or_svg: Path, png: Path, w: int, h: int, scale: float = 1.0):
    """Rend une page (ou un SVG) avec Chrome sans tête -> PNG de w x h."""
    prof = Path(tempfile.gettempdir()) / "ac_chrome_profile"
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
           "--no-default-browser-check", f"--user-data-dir={prof}",
           f"--force-device-scale-factor={scale}", f"--window-size={w},{h}",
           "--default-background-color=00000000", "--allow-file-access-from-files",
           f"--screenshot={png}", Path(html_or_svg).resolve().as_uri()]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return png


def render_svg_file(svg: Path, png: Path, w: int, h: int, bg="#ffffff"):
    """Rend un fichier SVG à la taille w x h (le SVG est étiré à la boîte, viewBox conservée)."""
    html = WORK / (png.stem + "_wrap.html")
    html.write_text(
        f"<!doctype html><html><body style='margin:0;background:{bg}'>"
        f"<img src='{Path(svg).resolve().as_uri()}' style='display:block;width:{w}px;height:{h}px'>"
        f"</body></html>", encoding="utf-8")
    chrome_render(html, png, w, h)
    return png


def dump_json(obj, name):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def load_json(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def r1(v):
    return round(float(v), 1)

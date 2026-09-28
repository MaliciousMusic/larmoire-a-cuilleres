# -*- coding: utf-8 -*-
"""
Armoire Lettres - etape 1 : extraction des glyphes depuis les visuels scannes.

    python tools/font/extract.py

Produit dans tools/font/_work/ :
  - glyphs/<nom>.png   bitmap 1 px = 1 unite (UPM 1000), encre = noir
  - glyphs.json        metriques (ligne de base, approche, source) de chaque glyphe
  - sheets/*.png       planches de controle (instances, pieces, recompositions)

Principe
  Les affiches 2016-2018, la brocante, « HORAIRES ESTIVAUX » et le logo sont des
  rendus d'une meme police numerique (les lettres repetees sont identiques au pixel
  pres, le L du logo est le L de l'affiche de fevrier agrandi 1,36 x).  On convertit
  chaque source en carte de couverture d'encre (0..1), on segmente les lettres, on
  recale chaque occurrence sur l'affiche de fevrier (echelle + translation) puis on
  reechantillonne la meilleure occurrence directement dans la grille des unites de
  la police (bicubique, ~4 a 7 x) avant de seuiller a 50 %.  Les glyphes absents des
  sources sont recomposes a partir de traits decoupes dans les lettres reelles.
"""
import json
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFile
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

ImageFile.LOAD_TRUNCATED_IMAGES = True

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = HERE / "_work"
GLYPH_DIR = WORK / "glyphs"
SHEET_DIR = WORK / "sheets"

CAP = 700          # hauteur de capitale visee (unites)
UPM = 1000
CANVAS_TOP = 1150  # Y (unites) de la premiere ligne du canevas
CANVAS_BOT = -400  # Y de la derniere ligne
CANVAS_H = CANVAS_TOP - CANVAS_BOT
PAD = 60           # marge gauche/droite du canevas (unites)


def P(rel):
    return ROOT / rel


# --------------------------------------------------------------------------
# 1. Sources -> cartes de couverture d'encre (float32, 1 = encre)
# --------------------------------------------------------------------------
def _rgb(path):
    im = Image.open(path)
    im.load()
    return np.asarray(im.convert("RGB")).astype(np.float32)


def cov_gray_on_white(a, ink=87.6, paper=255.0):
    L = a.mean(axis=2)
    return np.clip((paper - L) / (paper - ink), 0, 1)


def cov_white_on_mint(a):
    # logo blanc sur menthe : le canal rouge separe le mieux (menthe R~101)
    return np.clip((a[:, :, 0] - 102.0) / (255.0 - 102.0), 0, 1)


def cov_blue_channel_on_white(a, ink_b):
    # orange (B~11) ou jaune (B~4) sur blanc
    return np.clip((255.0 - a[:, :, 2]) / (255.0 - ink_b), 0, 1)


def cov_cream_on_brown(a):
    L = a.mean(axis=2)
    return np.clip((L - 49.0) / (233.0 - 49.0), 0, 1)


SOURCES = {
    "fevrier": ("osint/site/brand/2016_11_Sans-titre-8.jpg", cov_gray_on_white),
    "mars": ("osint/site/brand/2018_03_Sans-titre-14-1.jpg", cov_gray_on_white),
    "logo": ("osint/site/_logo_cover_crop.png", cov_white_on_mint),
    "brocante": ("osint/site/affiches/2018_09_brocante-1-e1536222251251.jpg",
                 lambda a: cov_blue_channel_on_white(a, 11.3)),
    "estivaux": ("osint/site/affiches/2013_12_j.jpg",
                 lambda a: cov_blue_channel_on_white(a, 3.8)),
    "panneau": ("osint/insta/2026-09-22_DdmdbaDgHQz-6.jpg", cov_cream_on_brown),
}

_cov_cache = {}


def coverage(name):
    if name not in _cov_cache:
        rel, fn = SOURCES[name]
        _cov_cache[name] = fn(_rgb(P(rel))).astype(np.float32)
    return _cov_cache[name]


# --------------------------------------------------------------------------
# 2. Lignes de texte : segmentation en occurrences de lettres
# --------------------------------------------------------------------------
# box = (x0, y0, x1, y1) en pixels source ; text = lettres dans l'ordre (sans espaces)
LINES = {
    "fevrier": dict(src="fevrier", box=(340, 40, 2260, 260),
                    text="EN FEVRIER à L'ARMOIRE à CUILLERES"),
    "mars": dict(src="mars", box=(300, 40, 2240, 260),
                 text="EN MARS à L'ARMOIRE à CUILLERES"),
    "brocante": dict(src="brocante", box=(80, 1240, 1180, 1440),
                     text="BROCANTE DE LIVRES"),
    # S et T se touchent dans ESTIVAUX : coupe verticale manuelle
    "estivaux": dict(src="estivaux", box=(200, 180, 1060, 340),
                     text="HORAIRES ESTIVAUX", cuts=[(200 + 519, None)]),
}


def components(mask, min_area):
    lab, n = ndi.label(mask)
    objs = ndi.find_objects(lab)
    out = []
    for i, o in enumerate(objs):
        m = lab[o] == (i + 1)
        a = int(m.sum())
        if a >= min_area:
            out.append(dict(label=i + 1, sl=o, area=a,
                            x0=o[1].start, x1=o[1].stop, y0=o[0].start, y1=o[0].stop))
    return lab, out


def segment_line(spec, min_area=120):
    cov = coverage(spec["src"])
    x0, y0, x1, y1 = spec["box"]
    c = cov[y0:y1, x0:x1].copy()
    mask = c > 0.5
    for cx, _ in spec.get("cuts", []):
        mask[:, cx - x0] = False
    lab, comps = components(mask, min_area)
    comps.sort(key=lambda d: (d["x0"] + d["x1"]) / 2)
    # regroupe les composantes qui se recouvrent horizontalement (accents)
    groups = []
    for d in comps:
        if groups:
            g = groups[-1]
            gx0 = min(e["x0"] for e in g)
            gx1 = max(e["x1"] for e in g)
            ov = min(gx1, d["x1"]) - max(gx0, d["x0"])
            if ov > 0.5 * min(gx1 - gx0, d["x1"] - d["x0"]):
                g.append(d)
                continue
        groups.append([d])
    chars = [ch for ch in spec["text"] if ch != " "]
    if len(groups) != len(chars):
        raise RuntimeError("%s : %d groupes pour %d lettres" % (spec["src"], len(groups), len(chars)))
    inst = []
    for ch, g in zip(chars, groups):
        m = np.zeros_like(mask)
        for d in g:
            m |= lab == d["label"]
        ys, xs = np.nonzero(m)
        inst.append(dict(ch=ch, src=spec["src"],
                         x0=int(xs.min()) + x0, x1=int(xs.max()) + 1 + x0,
                         y0=int(ys.min()) + y0, y1=int(ys.max()) + 1 + y0,
                         _m=m, _off=(x0, y0)))
    return inst




# --------------------------------------------------------------------------
# 3. Metriques de ligne et recalage sur l'affiche de fevrier (reference)
# --------------------------------------------------------------------------
REF_LINE = "fevrier"


def line_metrics(inst):
    """ligne de base / ligne de capitale = medianes des bas / hauts des lettres
    distinctes (hors accents, apostrophe et à)."""
    seen = {}
    for d in inst:
        if d["ch"] in "'à,.":
            continue
        seen.setdefault(d["ch"], d)
    bots = sorted(d["y1"] for d in seen.values())
    tops = sorted(d["y0"] for d in seen.values())
    return float(np.median(bots)), float(np.median(tops))


def _warp_to(src_cov, M, shape):
    """echantillonne src_cov sur une grille 'shape' ; M (2x3) envoie la grille -> source"""
    return cv2.warpAffine(src_cov, M, (shape[1], shape[0]),
                          flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def register(tmpl, target, box, s0, s_span=0.06, s_step=0.005):
    """Recale le gabarit tmpl (couverture, repere gabarit) dans target[box].
    Renvoie (s, tx, ty, err) tels que x_target = s*x_tmpl + tx (coordonnees pixel)."""
    x0, y0, x1, y1 = box
    R = target[y0:y1, x0:x1].astype(np.float32)
    best = None
    for s in np.arange(s0 - s_span, s0 + s_span + 1e-9, s_step):
        h = int(math.ceil(tmpl.shape[0] * s)) + 2
        w = int(math.ceil(tmpl.shape[1] * s)) + 2
        if h >= R.shape[0] or w >= R.shape[1]:
            continue
        M = np.float32([[1 / s, 0, 0], [0, 1 / s, 0]])  # grille -> gabarit
        T = _warp_to(tmpl, M, (h, w))
        mk = cv2.dilate((T > 0.02).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32)
        res = cv2.matchTemplate(R, T, cv2.TM_SQDIFF, mask=mk)
        mv, _, ml, _ = cv2.minMaxLoc(res)
        err = mv / max(mk.sum(), 1)
        if best is None or err < best[3]:
            best = (s, ml[0] + x0, ml[1] + y0, err, res, ml)
    s, tx, ty, err, res, ml = best
    # affinage sous-pixel (parabole) de la translation
    def para(a, b, c):
        d = a - 2 * b + c
        return 0.0 if d <= 0 else 0.5 * (a - c) / d
    mx, my = ml
    dx = para(res[my, mx - 1], res[my, mx], res[my, mx + 1]) if 0 < mx < res.shape[1] - 1 else 0
    dy = para(res[my - 1, mx], res[my, mx], res[my + 1, mx]) if 0 < my < res.shape[0] - 1 else 0
    # affinage continu (s, tx, ty) par Nelder-Mead sur l'ecart quadratique
    from scipy.optimize import minimize
    tmpl_mask = cv2.dilate((tmpl > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0

    def cost(p):
        s_, tx_, ty_ = p
        M = np.float32([[s_, 0, tx_], [0, s_, ty_]])  # gabarit -> cible
        W = _warp_to(target, M, tmpl.shape)
        diff = (W - tmpl)[tmpl_mask]
        pen = 0.0 if abs(s_ - s0) <= s_span else 10.0 * (abs(s_ - s0) - s_span)
        return float((diff * diff).mean()) + pen
    p0 = np.array([s, tx + dx, ty + dy], dtype=np.float64)
    r = minimize(cost, p0, method="Nelder-Mead",
                 options=dict(xatol=1e-3, fatol=1e-7, initial_simplex=[p0, p0 + [0.01, 0, 0], p0 + [0, 0.5, 0], p0 + [0, 0, 0.5]]))
    s, tx, ty = r.x
    return float(s), float(tx), float(ty), float(r.fun)


def crop_instance(inst, margin=8):
    """gabarit (couverture masquee) d'une occurrence et son origine source"""
    cov = coverage(inst["src"])
    m, ox, oy = inst["_m"], inst["_off"][0], inst["_off"][1]
    x0, x1, y0, y1 = inst["x0"] - margin, inst["x1"] + margin, inst["y0"] - margin, inst["y1"] + margin
    sub = cov[y0:y1, x0:x1].copy()
    keep = np.zeros_like(sub, dtype=bool)
    mm = m[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    keep[:mm.shape[0], :mm.shape[1]] = mm
    keep = cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    return (sub * keep).astype(np.float32), x0, y0


# --------------------------------------------------------------------------
# 4. Reference fevrier, transformations de ligne, logo
# --------------------------------------------------------------------------
_line_cache = {}


def line_instances(name):
    if name not in _line_cache:
        _line_cache[name] = segment_line(LINES[name])
    return _line_cache[name]


def feb_ref(ch):
    for d in line_instances(REF_LINE):
        if d["ch"] == ch:
            return d
    raise KeyError(ch)


FEB_BASE, FEB_TOP = None, None
U = None  # unites par pixel de l'affiche de fevrier


def init_reference():
    global FEB_BASE, FEB_TOP, U
    FEB_BASE, FEB_TOP = line_metrics(line_instances(REF_LINE))
    U = CAP / (FEB_BASE - FEB_TOP)


class Xform:
    """repere fevrier (pixels source) -> repere cible : x_t = s*(x_f - ox) + tx"""

    def __init__(self, s, tx, ty, ox=0.0, oy=0.0):
        self.s, self.tx, self.ty, self.ox, self.oy = s, tx, ty, ox, oy

    def to_target(self, xf, yf):
        return self.s * (xf - self.ox) + self.tx, self.s * (yf - self.oy) + self.ty

    def to_feb(self, xt, yt):
        return (xt - self.tx) / self.s + self.ox, (yt - self.ty) / self.s + self.oy


def register_on_feb(ch, src, box, s0, s_span=0.04):
    tm, ox, oy = crop_instance(feb_ref(ch))
    s, tx, ty, err = register(tm, coverage(src), box, s0, s_span=s_span)
    return Xform(s, tx, ty, ox, oy), err, tm


_line_xf = {}


def line_xform(name):
    """echelle et ligne de base d'une ligne (autre que fevrier) par recalage des
    lettres communes ; renvoie Xform tel que y_cible = s*(y_f) + ty (ox=oy=0)"""
    if name in _line_xf:
        return _line_xf[name]
    feb_chars = {d["ch"] for d in line_instances(REF_LINE)}
    ss, bs = [], []
    for d in line_instances(name):
        if d["ch"] not in feb_chars or d["ch"] in "'à":
            continue
        g = 30
        box = (d["x0"] - g, d["y0"] - g, d["x1"] + g, d["y1"] + g)
        s0 = (d["y1"] - d["y0"]) / (feb_ref(d["ch"])["y1"] - feb_ref(d["ch"])["y0"])
        xf, err, _ = register_on_feb(d["ch"], LINES[name]["src"], box, s0, s_span=0.05)
        ss.append(xf.s)
        # ligne de base fevrier envoyee dans la cible
        bs.append(xf.to_target(0, FEB_BASE)[1])
    k = float(np.median(ss))
    b = float(np.median(bs))
    _line_xf[name] = Xform(k, 0.0, b - k * FEB_BASE)
    return _line_xf[name]


# Logo : lettres et zones approximatives (x0, y0, x1, y1) dans _logo_cover_crop.png
LOGO_LETTERS = [
    # nom, lettre-gabarit fevrier, zone
    ("C", "C", (610, 130, 710, 310)),
    ("U", "U", (690, 118, 790, 320)),
    ("I1", "I", (780, 118, 830, 320)),
    ("L1", "L", (815, 120, 912, 310)),
    ("L2", "L", (908, 120, 1006, 310)),
    ("E1", "E", (300, 245, 390, 410)),
    ("E2", "E", (660, 298, 745, 462)),
    ("E3", "E", (505, 320, 595, 480)),   # E du È
    ("R3", "R", (580, 280, 670, 480)),
    ("A", "A", (100, 70, 200, 262)),
    ("O", "O", (100, 240, 200, 420)),
    ("R1", "R", (190, 70, 260, 262)),
    ("M", "M", (245, 70, 385, 262)),
    ("I2", "I", (195, 245, 245, 420)),
    ("R2", "R", (235, 245, 310, 420)),
    ("S", "S", (730, 290, 845, 465)),
    ("Lsmall", "L", (0, 100, 85, 260)),
]
LOGO_SCALE = 1.356


def logo_registrations():
    out = {}
    for name, ch, (x0, y0, x1, y1) in LOGO_LETTERS:
        g = 30
        box = (max(0, x0 - g), max(0, y0 - g), min(1008, x1 + g), min(604, y1 + g))
        s0 = 1.08 if name == "Lsmall" else LOGO_SCALE
        xf, err, tm = register_on_feb(ch, "logo", box, s0, s_span=0.03)
        out[name] = dict(ch=ch, xf=xf, err=err, tm=tm)
    return out


def template_in_target(tm, xf, shape):
    """gabarit fevrier (repere crop) rendu dans le repere cible entier"""
    s = xf.s
    # cible (x,y) -> gabarit : x_tm = (x - tx)/s
    M = np.float32([[1 / s, 0, -xf.tx / s], [0, 1 / s, -xf.ty / s]])
    return _warp_to(tm, M, shape)


_logo_cache = {}


def logo_separation():
    """Attribue chaque pixel d'encre du logo a la lettre recalee la plus proche.
    Renvoie dict nom -> (couverture masquee pleine taille, Xform)."""
    if _logo_cache:
        return _logo_cache
    cov = coverage("logo")
    regs = logo_registrations()
    names = list(regs)
    big = np.full((len(names),) + cov.shape, 1e6, np.float32)
    for i, n in enumerate(names):
        T = template_in_target(regs[n]["tm"], regs[n]["xf"], cov.shape)
        B = T > 0.5
        big[i] = ndi.distance_transform_edt(~B)
    win = np.argmin(big, axis=0)
    dmin = np.min(big, axis=0)
    for i, n in enumerate(names):
        keep = (win == i) & (dmin < 7)
        others = np.delete(big, i, axis=0).min(axis=0)
        # zone de contact : proche de ce gabarit ET d'un autre -> reparee avec fevrier
        zone = (big[i] < 9) & (others < 9)
        zone = cv2.dilate(zone.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
        zone = cv2.GaussianBlur(zone, (0, 0), 1.5)
        _logo_cache[n] = dict(cov=cov * keep, zone=zone, xf=regs[n]["xf"], err=regs[n]["err"],
                              ch=regs[n]["ch"])
    return _logo_cache


# --------------------------------------------------------------------------
# 5. Reechantillonnage dans la grille des unites de la police
# --------------------------------------------------------------------------
def render_units(cov_src, xf, xref, width_units):
    """Echantillonne cov_src (repere cible) sur le canevas en unites.
    colonne c -> X = c - PAD ; ligne r -> Y = CANVAS_TOP - r ;
    X = (x_f - xref) * U, Y = (FEB_BASE - y_f) * U  (repere fevrier)."""
    a = xf.s / U
    bx = xf.s * (xref - PAD / U - xf.ox) + xf.tx
    by = xf.s * (FEB_BASE - CANVAS_TOP / U - xf.oy) + xf.ty
    M = np.float32([[a, 0, bx], [0, a, by]])
    return _warp_to(cov_src.astype(np.float32), M, (CANVAS_H, int(width_units) + 2 * PAD))


def masked_line_cov(inst, dil=4):
    """couverture de la source limitee a l'occurrence (composantes dilatees)"""
    cov = coverage(inst["src"])
    ox, oy = inst["_off"]
    m = inst["_m"]
    k = np.ones((2 * dil + 1, 2 * dil + 1), np.uint8)
    md = cv2.dilate(m.astype(np.uint8), k) > 0
    full = np.zeros(cov.shape, np.float32)
    h, w = md.shape
    full[oy:oy + h, ox:ox + w] = cov[oy:oy + h, ox:ox + w] * md
    return full


def render_line_instance(inst, line_name):
    """occurrence d'une ligne (fevrier, mars, brocante, estivaux) -> grille unites.
    Lettre presente a fevrier : recalage individuel sur la reference ; sinon
    transformation de ligne."""
    ch = inst["ch"]
    cov = masked_line_cov(inst)
    try:
        ref = feb_ref(ch)
    except KeyError:
        ref = None
    if ref is not None:
        g = 25
        box = (inst["x0"] - g, inst["y0"] - g, inst["x1"] + g, inst["y1"] + g)
        s0 = line_xform(line_name).s if line_name != REF_LINE else 1.0
        tm, ox, oy = crop_instance(ref)
        s, tx, ty, err = register(tm, cov, box, s0, s_span=0.02)
        xf = Xform(s, tx, ty, ox, oy)
        xref = ref["x0"]
        width = (ref["x1"] - ref["x0"]) * U
    else:
        lx = line_xform(line_name)
        xf = Xform(lx.s, 0.0, lx.ty)
        xref = inst["x0"] / lx.s
        width = (inst["x1"] - inst["x0"]) / lx.s * U
        err = float("nan")
    return render_units(cov, xf, xref, width + 40), xf, err


def render_logo_letter(name, repair=True):
    """lettre du logo dans la grille unites ; dans les zones ou elle touchait une
    voisine, on substitue le rendu de fevrier (meme glyphe, recale)."""
    sep = logo_separation()[name]
    ref = feb_ref(sep["ch"])
    width = (ref["x1"] - ref["x0"]) * U
    a = render_units(sep["cov"], sep["xf"], ref["x0"], width + 40)
    if repair and sep["zone"].max() > 0:
        z = np.clip(render_units(sep["zone"], sep["xf"], ref["x0"], width + 40), 0, 1)
        f = feb_average(sep["ch"])
        f = f[:, :a.shape[1]] if f.shape[1] >= a.shape[1] else np.pad(f, ((0, 0), (0, a.shape[1] - f.shape[1])))
        a = a * (1 - z) + f * z
    return a, sep["xf"], sep["err"]


_feb_avg = {}


def feb_average(ch):
    """moyenne des occurrences de fevrier et de mars (meme rendu, phases differentes)"""
    if ch not in _feb_avg:
        arrs = []
        for ln in ("fevrier", "mars"):
            for d in line_instances(ln):
                if d["ch"] == ch:
                    arrs.append(render_line_instance(d, ln)[0])
        _feb_avg[ch] = align_stack(arrs)
    return _feb_avg[ch]


def align_stack(arrs):
    """moyenne de rendus deja dans le meme repere (meme largeur de canevas)"""
    w = max(a.shape[1] for a in arrs)
    acc = np.zeros((CANVAS_H, w), np.float32)
    for a in arrs:
        acc[:, :a.shape[1]] += a
    return acc / len(arrs)


def binarize(cov_units, min_blob=250, min_hole=250, smooth=1.2):
    """seuil a 50 % apres un leger lissage (retire le crenelage JPEG), puis
    suppression des points isoles et des petits trous."""
    c = cv2.GaussianBlur(cov_units, (0, 0), smooth) if smooth else cov_units
    b = c > 0.5
    lab, n = ndi.label(b)
    if n:
        sizes = ndi.sum(b, lab, range(1, n + 1))
        for i, sz in enumerate(sizes):
            if sz < min_blob:
                b[lab == i + 1] = False
    holes = ndi.binary_fill_holes(b) & ~b
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, range(1, n + 1))
        for i, sz in enumerate(sizes):
            if sz < min_hole:
                b[lab == i + 1] = True
    return b


def ink_bbox(b):
    ys, xs = np.nonzero(b)
    return int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1


def stroke_width(b):
    """epaisseur de trait mediane (unites) : 2 x distance au bord le long du
    squelette, en ignorant les extremites et les jonctions."""
    dt = cv2.distanceTransform(b.astype(np.uint8), cv2.DIST_L2, 5)
    sk = skeletonize(b)
    # voisins dans le squelette
    nb = cv2.filter2D(sk.astype(np.uint8), -1, np.ones((3, 3), np.float32)) - sk
    core = sk & (nb == 2)
    vals = dt[core]
    if vals.size < 10:
        vals = dt[sk]
    return 2.0 * float(np.median(vals))


# --------------------------------------------------------------------------
# 6. Glyphes particuliers : À et È du logo, apostrophe du logo, virgule et point
# --------------------------------------------------------------------------
def render_affine(cov_src, O, ax, ay, theta, width_units):
    """Echantillonne une region source avec un repere incline : le point (X, Y)
    en unites correspond a O + X*ax*(cos t, sin t) + Y*ay*(sin t, -cos t)."""
    c, s = math.cos(theta), math.sin(theta)
    M = np.float32([
        [ax * c, -ay * s, O[0] - ax * c * PAD + ay * s * CANVAS_TOP],
        [ax * s, ay * c, O[1] - ax * s * PAD - ay * c * CANVAS_TOP],
    ])
    return _warp_to(cov_src.astype(np.float32), M, (CANVAS_H, int(width_units) + 2 * PAD))


def logo_line_frame(names):
    """(echelle logo/fevrier, ligne de base dans le logo) d'une ligne du logo"""
    sep = logo_separation()
    s = float(np.median([sep[n]["xf"].s for n in names]))
    b = float(np.median([sep[n]["xf"].to_target(0, FEB_BASE)[1] for n in names]))
    return s, b


def poly_mask(shape, poly):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly) * 8).astype(np.int32)], 1, shift=3)
    return m > 0


def logo_agrave_parts():
    """À du logo : accent (composante isolee) + A (sans l'accent du È qui le touche)"""
    cov = coverage("logo")
    x0, y0, x1, y1 = (498, 148, 584, 316)
    region = np.zeros(cov.shape, bool)
    region[y0:y1, x0:x1] = True
    # accent du È : bande diagonale entre les jambes du A, sous la barre
    e_acc = poly_mask(cov.shape, [(526.5, 276), (553, 276), (553, 309), (562, 309), (562, 332), (526.5, 332)])
    a_part = region & ~e_acc
    return cov * a_part, cov * (e_acc & (cov > 0))


def logo_egrave_accent():
    """Accent du È : partie visible + extremite cachee dans la jambe du À, completee
    par l'accent du À (meme plume) recale sur la partie visible."""
    from scipy.optimize import minimize
    cov = coverage("logo")
    _, vis = logo_agrave_parts()
    acc = np.zeros_like(cov)
    acc[150:196, 512:566] = cov[150:196, 512:566]
    lab, n = ndi.label(acc > 0.3)
    if n > 1:
        sizes = ndi.sum(acc > 0.3, lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        acc = acc * cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8))
    ys, xs = np.nonzero(acc > 0.5)
    cx, cy = xs.mean(), ys.mean()
    ys2, xs2 = np.nonzero(vis > 0.5)
    tx0, ty0 = xs2.mean(), ys2.mean()
    visible_zone = poly_mask(cov.shape, [(527.5, 270), (570, 270), (570, 340), (527.5, 340)])

    def warp(p):
        th, sc, tx, ty = p
        c, s = math.cos(th), math.sin(th)
        A = np.array([[c, -s], [s, c]]) * sc
        Ai = np.linalg.inv(A)
        M = np.zeros((2, 3), np.float32)
        M[:, :2] = Ai
        M[:, 2] = np.array([cx, cy]) - Ai @ np.array([tx, ty])
        return _warp_to(acc, M, cov.shape)

    def cost(p):
        W = warp(p)
        d = (W - vis)[visible_zone]
        return float((d * d).mean())
    best = None
    for th0 in np.radians([0, 6, 12, 18]):
        for sc0 in (1.0, 1.15, 1.3):
            r = minimize(cost, [th0, sc0, tx0 - 3, ty0 - 3], method="Nelder-Mead",
                         options=dict(xatol=1e-3, fatol=1e-8, maxiter=800))
            if best is None or r.fun < best.fun:
                best = r
    W = warp(best.x)
    full = np.where(visible_zone, vis, np.maximum(W, vis))
    return full, best


def special_glyphs():
    """renvoie dict nom -> couverture en unites (canevas) pour À, È, ’"""
    out = {}
    cov = coverage("logo")
    # À : ligne « À CUILL » du logo
    s, b = logo_line_frame(["C", "U", "L1", "L2"])
    a_cov, _ = logo_agrave_parts()
    ys, xs = np.nonzero(a_cov > 0.5)
    ax = s / U
    out["Agrave"] = render_affine(a_cov, (xs.min() - 2, b), ax, ax, 0.0, (xs.max() - xs.min() + 4) / ax + 40)
    # È : E particulier + accent reconstitue, ligne « ÈRES »
    s2, b2 = logo_line_frame(["E2", "R3"])
    e_cov = logo_separation()["E3"]["cov"]
    acc_cov, _ = logo_egrave_accent()
    both = np.maximum(e_cov, acc_cov)
    ys, xs = np.nonzero(both > 0.5)
    ax2 = s2 / U
    out["Egrave"] = render_affine(both, (xs.min() - 2, b2), ax2, ax2, 0.0, (xs.max() - xs.min() + 4) / ax2 + 40)
    # ’ : apostrophe du logo (ligne « L'ARM », L a 1,081)
    xf = logo_separation()["Lsmall"]["xf"]
    b3 = xf.to_target(0, FEB_BASE)[1]
    q = np.zeros_like(cov)
    q[110:180, 78:120] = cov[110:180, 78:120]
    ys, xs = np.nonzero(q > 0.5)
    ax3 = xf.s / U
    out["quoteright"] = render_affine(q, (xs.min() - 2, b3), ax3, ax3, 0.0, (xs.max() - xs.min() + 4) / ax3 + 40)
    return out


# Panneau (vinyle) : meme police condensee a ~72 % ; photo legerement inclinee
PANEL_LINES = {
    "etdonc": [("E", 1274, 1358, 1158, 1429), ("T", 1365, 1499, 1155, 1428), ("D", 1565, 1669, 1147, 1448),
               ("O", 1675, 1784, 1083, 1424), ("N", 1787, 1919, 1100, 1405), ("C", 1919, 2019, 1091, 1381)],
    "maison": [("F", 1085, 1174, 2256, 2546), ("A", 1178, 1268, 2219, 2534), ("I", 1278, 1317, 2244, 2545),
               ("T", 1319, 1453, 2254, 2534), ("M", 1517, 1648, 2227, 2541), ("A", 1648, 1740, 2197, 2517),
               ("I", 1751, 1785, 2209, 2507), ("S", 1785, 1926, 2192, 2523), ("O", 1925, 2036, 2176, 2530),
               ("N", 2040, 2173, 2198, 2513)],
}
PANEL_PUNCT = {"comma": ("etdonc", (2012, 1320, 2075, 1452)), "period": ("maison", (2166, 2422, 2227, 2497))}


def panel_frame(line, ref_dims):
    """echelles horizontale/verticale (px par unite), pente et ordonnee de la ligne de base"""
    rows = PANEL_LINES[line]
    ky = np.median([(y1 - y0) / ref_dims[c][1] for c, x0, x1, y0, y1 in rows])
    kx = np.median([(x1 - x0) / ref_dims[c][0] for c, x0, x1, y0, y1 in rows])
    pts = np.array([((x0 + x1) / 2, y1 + ky * ref_dims[c][2]) for c, x0, x1, y0, y1 in rows])
    slope, icpt = np.polyfit(pts[:, 0], pts[:, 1], 1)
    return float(kx), float(ky), float(slope), float(icpt)


def panel_punct(ref_dims):
    out = {}
    cov = coverage("panneau")
    for name, (line, (x0, y0, x1, y1)) in PANEL_PUNCT.items():
        kx, ky, slope, icpt = panel_frame(line, ref_dims)
        q = np.zeros_like(cov)
        q[y0:y1, x0:x1] = cov[y0:y1, x0:x1]
        lab, n = ndi.label(q > 0.5)
        sizes = ndi.sum(q > 0.5, lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        q = q * cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8))
        ys, xs = np.nonzero(q > 0.5)
        xl = xs.min() - 3
        th = math.atan(slope)
        out[name] = render_affine(q, (xl, slope * xl + icpt), kx, ky, th, (xs.max() - xs.min() + 6) / kx + 40)
        out[name + "_frame"] = (kx, ky, slope)
    return out


# --------------------------------------------------------------------------
# 7. Glyphes vectorises depuis les sources (choix de l'occurrence)
# --------------------------------------------------------------------------
# glyphe -> (description de la source pour le README, fonction de rendu)
SOURCE_PLAN = {
    "A": ("logo, « ARM » (contact avec le O réparé par février)", lambda: logo_avg(["A"])),
    "B": ("brocante, « BROCANTE »", lambda: line_char("brocante", "B")),
    "C": ("logo, « CUILL »", lambda: logo_avg(["C"])),
    "D": ("brocante, « DE »", lambda: line_char("brocante", "D")),
    "E": ("logo, « OIRE » + « ERES » (moyenne des deux)", lambda: logo_avg(["E1", "E2"])),
    "F": ("février, « FEVRIER »", lambda: feb_average("F")),
    "H": ("estivaux, « HORAIRES » (graisse -12 u, rendu plus gras)", lambda: line_char("estivaux", "H")),
    "I": ("logo, « OIRE » + « CUILL » (sommets réparés par février)", lambda: logo_avg(["I1", "I2"])),
    "L": ("logo, « CUILL » (moyenne des deux L)", lambda: logo_avg(["L1", "L2"])),
    "M": ("logo, « ARM »", lambda: logo_avg(["M"])),
    "N": ("février + mars, « EN »", lambda: feb_average("N")),
    "O": ("logo, « OIRE »", lambda: logo_avg(["O"])),
    "R": ("logo, « ARM » + « ERES » (moyenne)", lambda: logo_avg(["R1", "R3"])),
    "S": ("logo, « ERES »", lambda: logo_avg(["S"])),
    "T": ("brocante, « BROCANTE »", lambda: line_char("brocante", "T")),
    "U": ("logo, « CUILL »", lambda: logo_avg(["U"])),
    "V": ("février, « FEVRIER »", lambda: feb_average("V")),
    "X": ("estivaux, « ESTIVAUX » (graisse -12 u)", lambda: line_char("estivaux", "X")),
    "quotesingle": ("février + mars, « L'ARMOIRE »", lambda: feb_average("'")),
    "agrave": ("février + mars, « à » à une panse (4 occurrences)", lambda: feb_average("à")),
}
SPECIAL_PLAN = {
    "Agrave": "logo, « À CUILL » (A étroit à sommet arrondi, propre au À du logo)",
    "Egrave": "logo, « ÈRES » (E propre au È ; bout de l'accent caché par le pied du À, complété par l'accent du À)",
    "quoteright": "logo, apostrophe de « L’ARM »",
    "comma": "panneau, « DONC, » (vinyle condensé à 72 %, redressé)",
    "period": "panneau, « MAISON. » (vinyle condensé à 72 %, redressé)",
}
SRC_FILES = {
    "logo": "osint/site/_logo_cover_crop.png",
    "fevrier": "osint/site/brand/2016_11_Sans-titre-8.jpg",
    "mars": "osint/site/brand/2018_03_Sans-titre-14-1.jpg",
    "brocante": "osint/site/affiches/2018_09_brocante-1-e1536222251251.jpg",
    "estivaux": "osint/site/affiches/2013_12_j.jpg",
    "panneau": "osint/insta/2026-09-22_DdmdbaDgHQz-6.jpg",
}
# graisse : correction par source (unites, + = epaissir) mesuree a la transformee de distance
WEIGHT_FIX = {"H": -12.0, "X": -12.0}


def logo_avg(names):
    return align_stack([render_logo_letter(n)[0] for n in names])


def line_char(line, ch):
    arrs = [render_line_instance(d, line)[0] for d in line_instances(line) if d["ch"] == ch]
    return align_stack(arrs)


def offset_shape(b, delta):
    """epaissit (delta>0) ou amincit (delta<0) une forme de delta/2 par cote,
    via la distance signee (preserve la forme, arrondit a peine les angles)."""
    if abs(delta) < 0.5:
        return b
    inside = cv2.distanceTransform(b.astype(np.uint8), cv2.DIST_L2, 5)
    outside = cv2.distanceTransform((~b).astype(np.uint8), cv2.DIST_L2, 5)
    sd = inside - outside  # >0 dedans
    return sd > -delta / 2.0


def ref_dims(glyphs):
    """(largeur, hauteur, bas) des lettres de reference, pour le panneau"""
    out = {}
    for ch in "ETDONCFAIMSL":
        b = glyphs[ch]
        x0, x1, y0, y1 = ink_bbox(b)
        out[ch] = (x1 - x0, y1 - y0, CANVAS_TOP - y1)
    return out


def extract_sources():
    glyphs, srcinfo = {}, {}
    for name, (desc, fn) in SOURCE_PLAN.items():
        b = binarize(fn())
        if name in WEIGHT_FIX:
            b = binarize(offset_shape(b, WEIGHT_FIX[name]).astype(np.float32), smooth=1.0)
        glyphs[name] = b
        srcinfo[name] = desc
    sp = special_glyphs()
    for name in ("Agrave", "Egrave", "quoteright"):
        glyphs[name] = binarize(sp[name])
        srcinfo[name] = SPECIAL_PLAN[name]
    pp = panel_punct(ref_dims(glyphs))
    for name in ("comma", "period"):
        glyphs[name] = binarize(pp[name])
        srcinfo[name] = SPECIAL_PLAN[name]
    # ’ : garder la plus grande composante (le crop touche le A voisin)
    for name in ("quoteright", "comma", "period", "quotesingle"):
        glyphs[name] = largest_components(glyphs[name], 1)
    return glyphs, srcinfo


def largest_components(b, k):
    lab, n = ndi.label(b)
    if n <= k:
        return b
    sizes = ndi.sum(b, lab, range(1, n + 1))
    keep = np.argsort(sizes)[::-1][:k] + 1
    return np.isin(lab, keep)


# --------------------------------------------------------------------------
# 8. Boite a outils de recomposition (formes booleennes en unites, Y vers le haut)
# --------------------------------------------------------------------------
CW = 1500  # largeur du canevas standard (colonnes) ; X = colonne - PAD


def std(b):
    """glyphe -> canevas standard, bord gauche de l'encre en X = 0"""
    x0, x1, y0, y1 = ink_bbox(b)
    out = np.zeros((CANVAS_H, CW), bool)
    w = min(x1 - x0, CW - PAD)
    out[:, PAD:PAD + w] = b[:, x0:x0 + w]
    return out


def M3(a, b, c, d, e, f):
    return np.array([[a, b, c], [d, e, f], [0.0, 0.0, 1.0]])


def Tr(dx, dy):
    return M3(1, 0, dx, 0, 1, dy)


def Sc(sx, sy=None, cx=0.0, cy=0.0):
    sy = sx if sy is None else sy
    return Tr(cx, cy) @ M3(sx, 0, 0, 0, sy, 0) @ Tr(-cx, -cy)


def Rot(deg, cx=0.0, cy=0.0):
    """rotation anti-horaire (repere Y vers le haut)"""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return Tr(cx, cy) @ M3(c, -s, 0, s, c, 0) @ Tr(-cx, -cy)


def FlipX(cx=0.0):
    return Tr(cx, 0) @ M3(-1, 0, 0, 0, 1, 0) @ Tr(-cx, 0)


def FlipY(cy=0.0):
    return Tr(0, cy) @ M3(1, 0, 0, 0, -1, 0) @ Tr(0, -cy)


def aff(b, M):
    """applique la transformation affine M (3x3, unites) a la forme b"""
    Mi = np.linalg.inv(M)
    a, bb, e = Mi[0]
    c, d, f = Mi[1]
    P = np.float32([[a, -bb, -a * PAD + bb * CANVAS_TOP + e + PAD],
                    [-c, d, CANVAS_TOP + c * PAD - d * CANVAS_TOP - f]])
    out = cv2.warpAffine(b.astype(np.float32), P, (CW, CANVAS_H),
                         flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    return out > 0.5


def region(pts):
    return poly_mask((CANVAS_H, CW), [(x + PAD, CANVAS_TOP - y) for x, y in pts])


def box(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def keep(b, pts):
    return b & region(pts)


def drop(b, pts):
    return b & ~region(pts)


def union(*bs):
    r = bs[0].copy()
    for x in bs[1:]:
        r |= x
    return r


def thicken(b, delta):
    return offset_shape(b, delta)


def bend(b, sag, y0, y1):
    """courbe une forme verticale en arc : fleche 'sag' (unites, >0 vers la droite
    aux extremites) entre y0 et y1"""
    yc = (y0 + y1) / 2.0
    k = sag / ((y1 - y0) / 2.0) ** 2
    rows, cols = np.mgrid[0:CANVAS_H, 0:CW].astype(np.float32)
    Yp = CANVAS_TOP - rows
    map_x = cols - k * (Yp - yc) ** 2
    out = cv2.remap(b.astype(np.float32), map_x.astype(np.float32), rows, cv2.INTER_LINEAR)
    return out > 0.5


def center_x(b, Y, xmin=-PAD, xmax=CW - PAD):
    """abscisse moyenne de l'encre sur la ligne Y, entre xmin et xmax"""
    r = int(round(CANVAS_TOP - Y))
    lo, hi = max(0, int(round(xmin)) + PAD), min(CW, int(round(xmax)) + PAD)
    xs = np.nonzero(b[r, lo:hi])[0]
    if xs.size == 0:
        return None
    return float(xs.mean()) + lo - PAD


def span_y(b):
    x0, x1, y0, y1 = ink_bbox(b)
    return CANVAS_TOP - y1, CANVAS_TOP - y0  # (bas, haut) en Y


def finish(b, close=4, smooth=1.4):
    """soude les raccords (fermeture morphologique) et lisse au seuil"""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * close + 1, 2 * close + 1))
    b = cv2.morphologyEx(b.astype(np.uint8), cv2.MORPH_CLOSE, k) > 0
    return binarize(b.astype(np.float32), smooth=smooth)


def cut_under_bar(b, x0, x1, xl, xr):
    """supprime un fut sous une barre horizontale entre x0 et x1 : le bord inferieur
    de la barre y est interpole entre les colonnes xl (a gauche) et xr (a droite)."""
    def bottom(X):
        col = b[:, X + PAD]
        ys = np.nonzero(col)[0]
        # premiere interruption en descendant depuis le haut de la barre
        top = ys.min()
        r = top
        while r + 1 < CANVAS_H and col[r + 1]:
            r += 1
        return r
    rl, rr = bottom(xl), bottom(xr)
    out = b.copy()
    for X in range(x0, x1 + 1):
        t = (X - xl) / float(xr - xl)
        r = int(round(rl + t * (rr - rl)))
        out[r + 1:, X + PAD] = False
    return out


# --------------------------------------------------------------------------
# 9. Recettes de recomposition (glyphes absents des sources)
# --------------------------------------------------------------------------
# G : glyphes sources normalises (canevas standard) ; COMPOSED : glyphes recomposes
G = {}
COMPOSED = {}


def make_P():
    R = G["R"]
    return finish(drop(R, [(78, 318), (200, 318), (380, -140), (78, -140)]))


def make_K():
    H, V, R = G["H"], G["V"], G["R"]
    stem = thicken(keep(H, box(-20, -80, 63, 900)), 14)
    arm = keep(V, [(175, 250), (520, 250), (520, 800), (175, 800)])
    cx = center_x(arm, 262, 150, 400)
    arm = aff(arm, Tr(40 - cx, 300 - 262) @ Rot(-15, cx, 262))
    leg = keep(R, [(96, 322), (205, 322), (395, -140), (160, -140)])
    lx = center_x(leg, 300, 60, 260)
    leg = aff(leg, Tr(120 - lx, 395 - 300) @ Rot(9, lx, 300))
    return finish(union(stem, arm, leg))


def make_G():
    C, E, U = G["C"], G["E"], G["U"]
    bar = keep(E, box(66, 240, 300, 340))
    bar = aff(bar, Tr(125 - 66, 20) @ FlipX((66 + 262) / 2.0))
    bar = drop(bar, box(300, -100, 900, 900))
    vert = keep(U, box(230, 470, 360, 800))
    vx = center_x(vert, 600, 200, 360)
    vert = aff(vert, Tr(270 - vx, -(728 - 352)))
    return finish(union(C, bar, vert))


def make_J():
    U = G["U"]
    j = drop(U, box(-40, 238, 160, 900))
    cap = keep(U, box(-40, 575, 130, 900))
    cx_top = center_x(U, 245, -20, 140)
    cx_cap = center_x(cap, 640, -20, 140)
    cap = aff(cap, Tr(cx_top - cx_cap + 4, -(745 - 285)))
    j = union(j, cap)
    j = aff(j, Sc(0.84, 1.0))
    return finish(thicken(j, 9))


def make_Q():
    O, V, R = G["O"], G["V"], G["R"]
    up = keep(V, box(-30, 520, 110, 900))       # haut du bras gauche du V (fin naturelle)
    ux = center_x(up, 690, -30, 110)
    up = aff(up, Tr(158 - ux, 118 - 700) @ Rot(6, ux, 700))
    up = keep(up, box(-100, -40, 900, 900))
    lo = keep(R, [(150, 110), (360, 110), (360, -120), (150, -120)])  # pied de la jambe du R
    lx = center_x(lo, -20, 150, 360)
    lo = aff(lo, Tr(222 - lx, -118 - (-20)) @ Rot(-5, lx, -20))
    return finish(union(O, up, lo))


def arm_lines(Vs):
    """droites des axes des bras d'un V : x = a + b*y (gauche, droite)"""
    ys = np.arange(150, 560, 20)
    ax_ = center_x(Vs, 20, -100, 900)
    L = [(y, center_x(Vs, y, -100, ax_ + (y * 0.12))) for y in ys]
    Rr = [(y, center_x(Vs, y, ax_ + (y * 0.12), 900)) for y in ys]
    fl = np.polyfit([y for y, x in L], [x for y, x in L], 1)
    fr = np.polyfit([y for y, x in Rr], [x for y, x in Rr], 1)
    return fl, fr


def make_W():
    V = G["V"]
    Vs = thicken(aff(V, Sc(0.74, 1.0)), 12)
    fl, fr = arm_lines(Vs)
    # intersection des axes (sommet interne du V)
    yc = (fl[1] - fr[1]) / (fr[0] - fl[0])
    xc = fl[1] + fl[0] * yc
    ystar = 470.0                                  # sommet central du W (axe)
    D = (fr[1] + fr[0] * ystar) - (fl[1] + fl[0] * ystar)
    xsplit = lambda y: xc + 0.5 * ((fl[1] + fl[0] * y) + (fr[1] + fr[0] * y) - 2 * xc)
    ycut = ystar - 55
    V1 = drop(Vs, [(xsplit(ycut), ycut), (900, ycut), (900, 900), (xsplit(900), 900)])
    V2 = drop(Vs, [(-100, ycut), (xsplit(ycut), ycut), (xsplit(900), 900), (-100, 900)])
    V2 = aff(V2, Tr(D, 0))
    apex = keep(Vs, box(-100, -80, 900, yc + 105))
    xp = fr[1] + fr[0] * ystar
    cap = aff(apex, Tr(xp - xc, ystar - yc) @ Rot(180, xc, yc))
    return finish(union(V1, V2, cap))


def make_Y():
    Xg, R = G["X"], G["R"]
    top = keep(Xg, box(-60, 345, 600, 900))
    cx = center_x(Xg, 360, 40, 260)
    stem = thicken(keep(R, box(-30, -80, 71, 300)), 6)
    sx = center_x(stem, 100, -30, 80)
    stem = aff(stem, Tr(cx - sx, 50))
    return finish(union(top, stem))


def make_Z():
    T, V, L = G["T"], G["V"], G["L"]
    # diagonale : bras droit du V (sans extremites), incline a la pente du Z
    diag = keep(V, [(150, 70), (560, 70), (560, 600), (250, 600)])
    b0, t0 = center_x(diag, 90, 100, 400), center_x(diag, 580, 100, 560)
    ang = math.degrees(math.atan2(t0 - b0, 490))
    xb, yb, xt, yt = 52.0, 70.0, 300.0, 585.0      # axe voulu (bas-gauche -> haut-droit)
    target = math.degrees(math.atan2(xt - xb, yt - yb))
    diag = aff(diag, Tr(xb - b0, yb - 90) @ Rot(-(target - ang), b0, 90))
    # allonger : deuxieme copie decalee le long de l'axe pour couvrir toute la hauteur
    ux, uy = (xt - xb), (yt - yb)
    n = math.hypot(ux, uy)
    diag2 = aff(diag, Tr(ux / n * 160, uy / n * 160))
    diag = union(diag, diag2)
    slope = (xt - xb) / (yt - yb)                  # x par y le long de l'axe
    # barre du haut : barre du T sans le fut ; extremite droite coupee parallelement a la diagonale
    bar = cut_under_bar(keep(T, box(-40, 480, 600, 900)), 175, 300, 170, 305)
    xr = xt + 5
    bar = drop(bar, [(xr - slope * 100, 480), (900, 480), (900, 900), (xr + slope * 300, 900)])
    # barre du bas : pied du L, extremite gauche coupee parallelement a la diagonale
    foot = keep(L, box(112, -40, 420, 150))
    fx = 45.0
    foot = aff(foot, Tr(fx - 112 + 25, 0))
    foot = drop(foot, [(-100, -40), (fx + slope * (-40 - 70), -40), (fx + slope * (160 - 70), 160), (-100, 160)])
    # limiter la diagonale a la hauteur des barres
    diag = keep(diag, box(-100, 45, 900, 612))
    return finish(union(bar, diag, foot))


def center_y(b, Xv, ymin=-400, ymax=1150):
    c = int(round(Xv)) + PAD
    col = b[:, c]
    rows = np.nonzero(col)[0]
    Ys = CANVAS_TOP - rows
    Ys = Ys[(Ys >= ymin) & (Ys <= ymax)]
    return float(Ys.mean()) if Ys.size else None


def cut_side(b, y0, y1, side):
    """retire l'amorce d'une barre sur le cote d'un fut entre y0 et y1 : le bord du
    fut est interpole entre les lignes y0-10 et y1+10"""
    def edge(Y):
        r = int(round(CANVAS_TOP - Y))
        xs = np.nonzero(b[r])[0]
        return (xs.max() if side == "right" else xs.min())
    ea, eb = edge(y0 - 10), edge(y1 + 10)
    out = b.copy()
    for Y in range(int(y0), int(y1) + 1):
        t = (Y - (y0 - 10)) / float((y1 + 10) - (y0 - 10))
        e = int(round(ea + t * (eb - ea)))
        r = int(round(CANVAS_TOP - Y))
        if side == "right":
            out[r, e + 1:] = False
        else:
            out[r, :e] = False
    return out


def h_stem(side):
    H = G["H"]
    if side == "left":
        return cut_side(keep(H, box(-40, -80, 150, 900)), 232, 332, "right")
    return cut_side(keep(H, box(150, -80, 500, 900)), 232, 332, "left")


def t_bar():
    return cut_under_bar(keep(G["T"], box(-40, 480, 600, 900)), 175, 300, 170, 305)


def bar_piece(length, yc=300.0):
    """trait horizontal a deux extremites naturelles (bouts de la barre du T)"""
    bar = t_bar()
    x0, x1, _, _ = ink_bbox(bar)
    W = x1 - x0 - PAD * 0  # largeur en colonnes
    Wu = x1 - x0
    half = length / 2.0
    ov = 50
    left = keep(bar, box(-60, 300, half + ov / 2, 900))
    right = keep(bar, box(Wu - half - ov / 2, 300, 900, 900))
    right = aff(right, Tr(-(Wu - length), 0))
    ya = center_y(left, half - 5, 400)
    yb = center_y(right, half + 5, 400)
    right = aff(right, Tr(0, ya - yb))
    b = union(left, right)
    ym = center_y(b, half, 400)
    return aff(b, Tr(0, yc - ym))


def v_right_arm():
    V = G["V"]
    return keep(V, [(160, -40), (560, -40), (560, 800), (262, 800)])


def axis_of(b, y_lo, y_hi, xmin=-100, xmax=1000):
    ys = np.arange(y_lo, y_hi, 10)
    xs = [center_x(b, y, xmin, xmax) for y in ys]
    pts = [(y, x) for y, x in zip(ys, xs) if x is not None]
    f = np.polyfit([p[0] for p in pts], [p[1] for p in pts], 1)
    return f  # x = f[0]*y + f[1]


def place_stroke(piece, f, p_from, p_to, anchor_y_src, dest):
    """oriente un trait (axe x=f0*y+f1 dans la piece) selon le vecteur p_from->p_to
    et amene le point de l'axe a Y=anchor_y_src sur dest"""
    ang_src = math.degrees(math.atan(f[0]))                 # inclinaison / verticale
    dx, dy = p_to[0] - p_from[0], p_to[1] - p_from[1]
    ang_dst = math.degrees(math.atan2(dx, dy))
    ax = f[0] * anchor_y_src + f[1]
    return aff(piece, Tr(dest[0] - ax, dest[1] - anchor_y_src) @ Rot(-(ang_dst - ang_src), ax, anchor_y_src))


def grave():
    a = keep(G["Agrave"], box(-50, 478, 400, 900))
    x0, x1, y0, y1 = ink_bbox(a)
    return aff(a, Tr(-(x0 - PAD), 0))


def acute():
    g = grave()
    x0, x1, y0, y1 = ink_bbox(g)
    return aff(g, FlipX((x1 - x0) / 2.0))


def S_scaled(sx=0.78, sy=0.9):
    return aff(G["S"], Sc(sx, sy))


def mirror(b):
    x0, x1, y0, y1 = ink_bbox(b)
    return aff(b, FlipX((x0 + x1) / 2.0 - PAD))


# ---------------- chiffres ----------------
def make_zero():
    z = aff(G["O"], Tr(0, 20) @ Sc(0.80, 0.86))
    return finish(thicken(z, 11))


def make_one():
    st = thicken(h_stem("right"), 12)
    x0, x1, _, _ = ink_bbox(st)
    st = aff(st, Tr(-(x0 - PAD) + 90, 18))
    top = span_y(st)[1]
    cx = center_x(st, top - 30)
    fl = acute()
    fx0, fx1, fy0, fy1 = ink_bbox(fl)
    fl = aff(fl, Tr(0, 0) @ Rot(8, 0, 0))
    fb, ft = span_y(fl)
    fx = center_x(fl, ft - 25)
    fl = aff(fl, Tr(cx - fx - 18, top - ft - 22))
    return finish(union(st, fl))


def make_two():
    Z = mirror(S_scaled())
    top = keep(Z, box(-100, 340, 900, 900))
    arm = thicken(v_right_arm(), -22)
    f = axis_of(arm, 150, 560, 100, 600)
    arm = keep(arm, box(-100, 90, 900, 560))
    xr = center_x(Z, 380, 200, 600)
    arm = place_stroke(arm, f, (40, 60), (xr, 395), 520, (xr + 2, 392))
    arm = keep(arm, box(-100, 40, 900, 398))
    foot = keep(G["L"], box(112, -40, 420, 150))
    fx0 = ink_bbox(foot)[0] - PAD
    foot = aff(foot, Tr(40 - fx0, -6) @ Sc(1.0, 0.8, 112, 30))
    fb = axis_of(arm, 60, 200, -100, 600)
    foot = drop(foot, [(-100, -60), (fb[0] * -60 + fb[1] - 10, -60), (fb[0] * 200 + fb[1] - 10, 200), (-100, 200)])
    return finish(thicken(union(top, arm, foot), 12))


def s_low(sx=0.78, sy=0.9, ycut=345):
    """panse inferieure du S : depart de l'epine a gauche, panse droite, terminaison"""
    return keep(S_scaled(sx, sy), box(-100, -100, 900, ycut * sy))


def make_three():
    lo = s_low(0.80, 0.90, 350)
    up = aff(s_low(0.74, 0.86, 350), FlipY(0))
    ub, ut = span_y(up)
    lb, lt = span_y(lo)
    # la panse haute (retournee) se pose sur la basse ; pointes jointes a gauche
    up = aff(up, Tr(24, (lt - 8) - ub))
    s = union(lo, up)
    b, t = span_y(s)
    s = aff(s, Sc(1.0, 640.0 / (t - b), 0, b))
    return finish(thicken(s, 10))

def make_four():
    st = thicken(h_stem("right"), 10)
    x0, _, _, _ = ink_bbox(st)
    st = aff(st, Tr(-(x0 - PAD) + 215, 20))
    xv = center_x(st, 600)
    top = span_y(st)[1]
    bar = bar_piece(340, 215)
    arm = thicken(v_right_arm(), -8)
    f = axis_of(arm, 150, 560, 100, 600)
    arm = keep(arm, box(-100, 80, 900, 620))
    arm = place_stroke(arm, f, (30, 215), (xv - 10, top - 20), 600, (xv - 10, top - 30))
    arm = keep(arm, box(-100, 190, 900, top - 10))
    return finish(union(st, bar, arm))


def make_five():
    E = aff(G["E"], Sc(0.86, 1.0))
    top = keep(E, box(-100, 330, 900, 900))
    Ss = aff(S_scaled(0.8, 0.9), Tr(0, 0))
    low = keep(Ss, box(-100, -100, 900, 352))
    return finish(thicken(union(top, low), 10))


def make_six():
    C = aff(G["C"], Sc(0.95))
    C = drop(C, box(190, -100, 900, 160))
    Ss = S_scaled(0.78, 0.9)
    low = aff(keep(Ss, box(-100, -100, 900, 330)), Tr(0, 22))
    return finish(thicken(union(C, low), 8))


def make_nine():
    s = make_six()
    x0, x1, y0, y1 = ink_bbox(s)
    bot, top = span_y(s)
    r = aff(s, Rot(180, (x0 + x1) / 2.0 - PAD, (bot + top) / 2.0))
    return r


def make_eight():
    Ss = S_scaled(0.8, 0.9)
    # S sans ses terminaisons (elles seraient a l'interieur des boucles)
    Sn = drop(Ss, box(0.8 * 330, 0.9 * 430, 900, 900))
    Sn = drop(Sn, box(-100, -100, 0.8 * 115, 0.9 * 170))
    Z = aff(mirror(Sn), Rot(-2.0, 170, 300) @ Tr(5, 3))
    return finish(thicken(union(Sn, Z), 12))


def orient(piece, anchor, direction_deg, dest):
    """fait tourner un trait autour de 'anchor' (point de son axe) pour que son axe
    fasse 'direction_deg' avec la verticale (positif = penche a droite vers le haut),
    puis amene 'anchor' sur 'dest'"""
    bot, top = span_y(piece)
    f = axis_of(piece, bot + 60, top - 60, -100, 900)
    cur = math.degrees(math.atan(f[0]))
    return aff(piece, Tr(dest[0] - anchor[0], dest[1] - anchor[1]) @ Rot(-(direction_deg - cur), anchor[0], anchor[1]))


def make_seven():
    bar = t_bar()
    arm = v_right_arm()
    x0, x1, y0, y1 = ink_bbox(arm)
    bot, top = span_y(arm)
    arm = aff(arm, Rot(180, (x0 + x1) / 2.0 - PAD, (bot + top) / 2.0))
    bot, top = span_y(arm)
    f = axis_of(arm, bot + 60, top - 60, -100, 900)
    anchor = (f[0] * (bot + 30) + f[1], bot + 30)
    xt, yt = 322.0, 585.0
    xb, yb = 96.0, 36.0
    ang = math.degrees(math.atan2(xt - xb, yt - yb))
    arm = orient(arm, anchor, ang, (xb, yb))
    slope = (xt - xb) / (yt - yb)
    bar = drop(bar, [(xt + 22 - slope * 100, 480), (900, 480), (900, 900), (xt + 22 + slope * 300, 900)])
    arm = keep(arm, box(-100, -60, 900, 606))
    return finish(aff(union(bar, arm), Tr(0, 20)))


def make_hyphen():
    return finish(bar_piece(215, 290))


def make_endash():
    return finish(bar_piece(430, 290))


def chain_bars(n, piece_len=430, yc=290.0, overlap=40, cut=25):
    """long trait horizontal : n traits tires de la barre du T, raccordes bout a bout ;
    les fins naturelles interieures sont coupees (seules les deux extremites restent)"""
    out, x_end = None, 0.0
    for i in range(n):
        b = bar_piece(piece_len, yc)
        if i % 2:
            b = mirror(b)
        lo = cut if i > 0 else -100
        hi = piece_len - cut if i < n - 1 else piece_len + 100
        b = keep(b, box(lo, -500, hi, 1100))
        if out is None:
            out, x_end = b, (hi if i < n - 1 else piece_len)
            continue
        shift = (x_end - overlap) - cut
        b = aff(b, Tr(shift, 0))
        xj = x_end - overlap / 2.0
        dy = center_y(out, xj, yc - 150, yc + 150) - center_y(b, xj, yc - 150, yc + 150)
        b = aff(b, Tr(0, dy))
        out = union(out, b)
        x_end = shift + (hi if i < n - 1 else piece_len)
    return out


def make_emdash():
    return finish(chain_bars(2, 470, 290))


def long_stem():
    up = keep(h_stem("left"), box(-100, 150, 900, 900))
    lo = keep(h_stem("right"), box(-100, 150, 900, 900))
    x0, x1, y0, y1 = ink_bbox(lo)
    bot, top = span_y(lo)
    lo = aff(lo, Rot(180, (x0 + x1) / 2.0 - PAD, (bot + top) / 2.0))
    ux = center_x(up, 300)
    lb, lt = span_y(lo)
    lx = center_x(lo, lt - 40)
    lo = aff(lo, Tr(ux - lx, (150 + 60) - lt))
    return union(up, lo)


def make_parenleft():
    s = long_stem()
    bot, top = span_y(s)
    s = aff(s, Tr(0, -140 - bot) @ Sc(1.0, 0.96, 0, bot))
    bot, top = span_y(s)
    s = bend(thicken(s, 12), 95, bot, top)
    return finish(s)


def make_parenright():
    s = make_parenleft()
    return mirror(s)


def make_slash():
    arm = keep(v_right_arm(), box(-100, 140, 900, 900))
    bot, top = span_y(arm)
    ext = keep(arm, box(-100, 290, 900, 900))
    x0, x1, y0, y1 = ink_bbox(ext)
    eb, et = span_y(ext)
    ext = aff(ext, Rot(180, (x0 + x1) / 2.0 - PAD, (eb + et) / 2.0))
    eb, et = span_y(ext)
    ext = aff(ext, Tr(0, -140.0 - eb))
    ext = keep(ext, box(-100, -400, 900, bot + 80))
    ym = bot + 40
    dx = center_x(arm, ym) - center_x(ext, ym)
    ext = aff(ext, Tr(dx, 0))
    return finish(union(arm, ext))


def dot():
    return G["period"]


def make_exclam():
    I = aff(G["I"], Sc(0.92, 0.72))
    bot, top = span_y(I)
    I = aff(I, Tr(0, 700 - top))
    p = dot()
    px0, px1, _, _ = ink_bbox(p)
    ix0, ix1, _, _ = ink_bbox(I)
    p = aff(p, Tr((ix0 + ix1) / 2.0 - (px0 + px1) / 2.0 + 4, 0))
    return finish(union(I, p))


def make_question():
    Z = mirror(aff(G["S"], Sc(0.66)))
    b0, t0 = span_y(Z)
    Z = aff(Z, Tr(0, 700 - t0))
    b0, t0 = span_y(Z)
    x0, x1, _, _ = ink_bbox(Z)
    wz = x1 - x0
    hook = keep(Z, [(0.30 * wz, t0 - 0.62 * (t0 - b0)), (900, t0 - 0.62 * (t0 - b0)), (900, 900), (-100, 900),
                    (-100, t0 - 0.45 * (t0 - b0))])
    hook = thicken(hook, 14)
    hb, ht = span_y(hook)
    xe = center_x(hook, hb + 12, -100, 900)
    st = thicken(keep(h_stem("left"), box(-100, -100, 900, 300)), 10)
    sb, stp = span_y(st)
    sx = center_x(st, sb + 100)
    st = aff(st, Tr(xe - sx - 6, 235 - sb))
    st = keep(st, box(-100, -100, 900, hb + 40))
    p = dot()
    px0, px1, _, _ = ink_bbox(p)
    stx = center_x(st, 260)
    p = aff(p, Tr(stx - ((px0 + px1) / 2.0 - PAD) - 6, 0))
    return finish(union(hook, st, p))


def make_colon():
    p = dot()
    q = aff(p, Tr(8, 300))
    return finish(union(p, q))


def make_semicolon():
    c = G["comma"]
    p = aff(dot(), Tr(0, 300))
    cx0, cx1, _, _ = ink_bbox(c)
    px0, px1, _, _ = ink_bbox(p)
    p = aff(p, Tr((cx0 + cx1) / 2.0 - (px0 + px1) / 2.0 + 20, 0))
    return finish(union(c, p))


def make_quotedbl():
    q = G["quotesingle"]
    return finish(union(q, aff(q, Tr(125, 6) @ Rot(-3, 50, 450))))


def chevron(scale=0.78):
    a = aff(acute(), Sc(scale))
    g = aff(grave(), Sc(scale))
    ab, at_ = span_y(a)
    gb, gt = span_y(g)
    ax0, ax1, _, _ = ink_bbox(a)
    gx0, gx1, _, _ = ink_bbox(g)
    # "<" : haut = aigu (de la pointe vers le haut-droite), bas = grave (de la pointe vers le bas-droite)
    a = aff(a, Tr(-(ax0 - PAD), 300 - ab - 12))
    g = aff(g, Tr(-(gx0 - PAD) + 4, 300 - gt + 12))
    return union(a, g)


def make_guillemotleft():
    c = chevron()
    return finish(union(c, aff(c, Tr(128, 4))))


def make_guillemotright():
    return mirror(make_guillemotleft())


def make_plus():
    h = bar_piece(360, 300)
    v = aff(bar_piece(360, 300), Rot(90, 180, 300) @ Rot(3, 180, 300))
    return finish(union(h, v))


def small_o(sx=0.42, sy=0.40):
    return thicken(aff(G["O"], Sc(sx, sy)), 18)


def make_percent():
    o1 = small_o()
    x0, x1, _, _ = ink_bbox(o1)
    b1, t1 = span_y(o1)
    o1 = aff(o1, Tr(-(x0 - PAD), 690 - t1))
    o2 = small_o(0.44, 0.41)
    x0, x1, _, _ = ink_bbox(o2)
    b2, t2 = span_y(o2)
    o2 = aff(o2, Tr(-(x0 - PAD) + 262, 4 - b2))
    sl = thicken(keep(make_slash(), box(-100, -40, 900, 900)), -8)
    sb, st_ = span_y(sl)
    sl = aff(sl, Sc(0.86, 700.0 / (st_ - sb), 0, sb))
    sb, st_ = span_y(sl)
    sl = aff(sl, Tr(0, 2 - sb))
    xs = center_x(sl, 350)
    sl = aff(sl, Tr(205 - xs, 0))
    return finish(union(o1, o2, sl))


def make_euro():
    C = aff(G["C"], Sc(0.97) @ Tr(70, 0))
    b1 = bar_piece(250, 400)
    b2 = aff(bar_piece(230, 262), Tr(4, 0))
    return finish(union(C, b1, b2))


def make_numbersign():
    s1 = thicken(h_stem("left"), 8)
    s1 = aff(s1, Rot(-9, 30, 300) @ Sc(1.0, 0.95))
    s2 = aff(s1, Tr(190, 0))
    h1 = bar_piece(430, 430)
    h2 = aff(bar_piece(430, 205), Tr(-30, 0))
    s = union(aff(s1, Tr(60, 0)), aff(s2, Tr(60, 0)), h1, h2)
    return finish(s)


def orient_(piece, anchor, direction_deg, dest):
    bot, top = span_y(piece)
    f = axis_of(piece, bot + 40, top - 40, -100, 900)
    cur = math.degrees(math.atan(f[0]))
    return aff(piece, Tr(dest[0] - anchor[0], dest[1] - anchor[1]) @ Rot(-(direction_deg - cur), anchor[0], anchor[1]))


def make_ampersand():
    # cuvette basse : U penche et tasse ; boucle haute : petit O ; jambe : jambe du R
    Ub = thicken(aff(G["U"], Rot(-9, 170, 0) @ Sc(1.0, 0.55)), 11)
    Ub = keep(Ub, box(-100, -100, 900, 470))
    xl = center_x(Ub, 400, -100, 150)
    loop = small_o(0.58, 0.33)
    lx0, lx1, _, _ = ink_bbox(loop)
    lb, lt = span_y(loop)
    loop = aff(loop, Tr(xl - (lx0 - PAD) - 5, 420 - lb))
    lx0, lx1, _, _ = ink_bbox(loop)
    leg = keep(G["R"], [(96, 322), (205, 322), (395, -140), (160, -140)])
    gb, gt = span_y(leg)
    f = axis_of(leg, gb + 40, gt - 40, 60, 400)
    anchor = (f[0] * (gt - 20) + f[1], gt - 20)
    leg = orient_(leg, anchor, -33.0, ((lx1 - PAD) - 45, 450))
    leg = union(leg, aff(leg, Tr(0.65 * 110, -110)))
    leg = keep(leg, box(-100, -10, 900, 500))
    return finish(union(Ub, loop, thicken(leg, 6)))

def wrap_circle(bar, x_start, yc_bar, cx, cy, R, phi0_deg, sweep_deg):
    """enroule un trait horizontal (a partir de x_start, axe a y=yc_bar) sur un cercle
    de rayon R centre (cx, cy), depuis l'angle phi0 dans le sens anti-horaire sur
    'sweep' degres. L'epaisseur est conservee (radiale)."""
    rows, cols = np.mgrid[0:CANVAS_H, 0:CW].astype(np.float32)
    Xp = cols - PAD
    Yp = CANVAS_TOP - rows
    dx, dy = Xp - cx, Yp - cy
    r = np.sqrt(dx * dx + dy * dy)
    phi = np.degrees(np.arctan2(dy, dx))
    d = (phi - phi0_deg) % 360.0
    along = np.radians(d) * R
    valid = d <= sweep_deg
    Xs = x_start + along
    Ys = yc_bar + (r - R)
    map_x = np.where(valid, Xs + PAD, -10).astype(np.float32)
    map_y = np.where(valid, CANVAS_TOP - Ys, -10).astype(np.float32)
    out = cv2.remap(bar.astype(np.float32), map_x, map_y, cv2.INTER_LINEAR, borderValue=0)
    return out > 0.5


def make_at():
    long = thicken(chain_bars(4, 480, 300), -10)
    cx, cy, R = 330.0, 300.0, 300.0
    ring = wrap_circle(long, 10.0, 300.0, cx, cy, R, -35.0, 318.0)
    a = keep(G["agrave"], box(-100, -100, 900, 450))
    a = aff(a, Sc(0.70))
    ax0, ax1, _, _ = ink_bbox(a)
    ab, at_ = span_y(a)
    a = aff(a, Tr(cx - ((ax0 + ax1) / 2.0 - PAD) + 10, cy - (ab + at_) / 2.0 - 10))
    return finish(union(ring, thicken(a, 10)))



# ---------------- accents ----------------
def accent_top_point(a, which):
    """point d'attache haut d'un accent ('left' ou 'right' = extremite haute)"""
    b, t = span_y(a)
    x = center_x(a, t - 18)
    return x, t


def circumflex(scale=0.78):
    ac = aff(acute(), Sc(scale))
    gr = aff(grave(), Sc(scale))
    xa, ta = accent_top_point(ac, "right")
    xg, tg = accent_top_point(gr, "left")
    # sommet commun : l'aigu monte vers la droite, le grave redescend vers la droite
    gr = aff(gr, Tr(xa - xg + 22, ta - tg + 4))
    c = union(ac, gr)
    x0, x1, _, _ = ink_bbox(c)
    return aff(c, Tr(-(x0 - PAD), 0))


def dieresis(scale=0.62, gap=178):
    d = aff(dot(), Sc(scale))
    x0, x1, _, _ = ink_bbox(d)
    d = aff(d, Tr(-(x0 - PAD), 0))
    return union(d, aff(d, Tr(gap, 7)))


def cedilla():
    c = aff(G["comma"], Sc(0.74))
    x0, x1, _, _ = ink_bbox(c)
    return aff(c, Tr(-(x0 - PAD), 0))


def accent_piece(name):
    return {"grave": grave, "acute": acute, "circumflex": circumflex, "dieresis": dieresis}[name]()


def put_accent(base, acc, cx, bottom):
    """pose l'accent : centre horizontal cx, bas a Y=bottom"""
    x0, x1, _, _ = ink_bbox(acc)
    b, t = span_y(acc)
    return union(base, aff(acc, Tr(cx - ((x0 + x1) / 2.0 - PAD), bottom - b)))


def top_center(b):
    """centre horizontal (boite d'encre) et sommet d'un glyphe"""
    bot, top = span_y(b)
    x0, x1, _, _ = ink_bbox(b)
    return (x0 + x1) / 2.0 - PAD, top


E_BODY_TOP = 575  # sous l'accent du È (le E du È sert aussi a É, Ê, Ë)


def egrave_body():
    return keep(G["Egrave"], box(-100, -200, 900, E_BODY_TOP))


def accent_frame(glyph_name, body_top):
    """position de l'accent d'origine du logo (centre, bas)"""
    acc = keep(G[glyph_name], box(-100, body_top, 900, 1100))
    x0, x1, _, _ = ink_bbox(acc)
    b, t = span_y(acc)
    return (x0 + x1) / 2.0 - PAD, b


def make_accented(base_name, acc_name):
    if base_name == "E":
        cx, bottom = accent_frame("Egrave", E_BODY_TOP)
        base = egrave_body()
    else:
        base = G[base_name] if base_name in G else COMPOSED[base_name]
        cx, top = top_center(base)
        bottom = top + 38
        if base_name == "I":
            cx += 2
    acc = accent_piece(acc_name)
    if acc_name == "dieresis" and base_name == "I":
        acc = dieresis(scale=0.56, gap=128)   # fut etroit : trema resserre
    if acc_name == "dieresis" and base_name in ("A", "E"):
        bottom += 10
    return finish(put_accent(base, acc, cx, bottom), close=2)


def make_Ccedilla():
    C = G["C"]
    x0, x1, _, _ = ink_bbox(C)
    ce = cedilla()
    cb, ct = span_y(ce)
    cx0, cx1, _, _ = ink_bbox(ce)
    ce = aff(ce, Tr(((x0 + x1) / 2.0 - PAD) - ((cx0 + cx1) / 2.0 - PAD) + 12, 58 - ct))
    return finish(union(C, ce))


def make_OE():
    O = aff(G["O"], Sc(0.96, 0.90) @ Tr(0, 10))
    O = drop(O, box(262 * 0.96, -200, 900, 900))
    E = aff(G["E"], Sc(1.0, 1.06, 0, 30))
    xo = center_x(G["O"], 360, 200, 400) * 0.96
    E = aff(E, Tr(xo - 36, -2))
    return finish(union(O, E))


def make_AE():
    A = G["A"]
    A = drop(A, box(222, -200, 900, 900))
    E = aff(G["E"], Sc(1.0, 1.1, 0, 30))
    E = aff(E, Tr(214, 2))
    return finish(union(A, E))




def make_periodcentered():
    p = dot()
    b, t = span_y(p)
    return finish(aff(p, Tr(0, 300 - (b + t) / 2.0)))


def make_ellipsis():
    p = dot()
    return finish(union(p, aff(p, Tr(185, 4)), aff(p, Tr(372, -2))))


def make_quoteleft():
    q = G["quoteright"]
    x0, x1, _, _ = ink_bbox(q)
    b, t = span_y(q)
    return aff(q, Rot(180, (x0 + x1) / 2.0 - PAD, (b + t) / 2.0))


def make_quotedblright():
    q = G["quoteright"]
    return finish(union(q, aff(q, Tr(135, 4) @ Rot(-3, 60, 550))))


def make_quotedblleft():
    q = COMPOSED["quoteleft"]
    return finish(union(q, aff(q, Tr(135, -4) @ Rot(3, 60, 550))))


DIGIT_SCALE = 0.88   # hauteur mediane des chiffres ~560 u (0,8 capitale), cf. « LE 22 MAI » (affiche 2018)


def small_fig(b, s=DIGIT_SCALE):
    return aff(b, Sc(s, s, 0, 0))


# (nom, fonction, description pour le README) - l'ordre compte (Y avant Ÿ, etc.)
COMPOSE_PLAN = [
    ("P", make_P, "R du logo sans sa jambe (fût + panse)"),
    ("K", make_K, "fût gauche du H (estivaux), bras droit du V (février) incliné, jambe du R (logo)"),
    ("G", make_G, "C du logo + bras médian du E (logo, retourné) + sommet du fût droit du U (logo)"),
    ("J", make_J, "U du logo : fût droit et boucle, fût gauche raccourci et coiffé de son propre sommet"),
    ("Q", make_Q, "O du logo + queue : sommet du bras gauche du V (février) et pied de la jambe du R (logo)"),
    ("W", make_W, "deux V de février resserrés à 74 %, sommet central = pointe du V retournée"),
    ("Y", make_Y, "moitié haute du X (estivaux) + bas du fût du R (logo)"),
    ("Z", make_Z, "barre du T (brocante) + bras droit du V (février) incliné + pied du L (logo)"),
    ("zero", lambda: small_fig(make_zero()), "O du logo resserré (80 × 86 %)"),
    ("one", lambda: small_fig(make_one()), "fût droit du H (estivaux) + drapeau = accent du À retourné"),
    ("two", lambda: small_fig(make_two()), "haut du S du logo en miroir + bras du V (février) + pied du L (logo)"),
    ("three", lambda: small_fig(make_three()), "deux panses basses du S du logo, la haute retournée"),
    ("four", lambda: small_fig(make_four()), "fût droit du H + bras du V + trait tiré de la barre du T"),
    ("five", lambda: small_fig(make_five()), "haut du E (fût + bras) + panse basse du S (logo)"),
    ("six", lambda: small_fig(make_six()), "C du logo + panse basse du S (logo)"),
    ("seven", lambda: small_fig(make_seven()), "barre du T (brocante) + bras droit du V retourné"),
    ("eight", lambda: small_fig(make_eight()), "S du logo et son miroir croisés (sans terminaisons)"),
    ("nine", lambda: small_fig(make_nine()), "le 6 tourné de 180 degrés"),
    ("hyphen", make_hyphen, "deux bouts de la barre du T (brocante)"),
    ("endash", make_endash, "deux bouts de la barre du T (brocante)"),
    ("emdash", make_emdash, "deux traits d'union longs (barre du T) raccordés"),
    ("parenleft", make_parenleft, "fûts du H mis bout à bout et courbés"),
    ("parenright", make_parenright, "miroir de la parenthèse ouvrante"),
    ("slash", make_slash, "bras droit du V (février) prolongé par son propre sommet retourné"),
    ("exclam", make_exclam, "I de février raccourci + point (panneau)"),
    ("question", make_question, "haut du S en miroir + bas de fût du H + point"),
    ("colon", make_colon, "deux points du panneau"),
    ("semicolon", make_semicolon, "point + virgule du panneau"),
    ("quotedbl", make_quotedbl, "deux apostrophes droites de février"),
    ("guillemotleft", make_guillemotleft, "chevrons faits des accents du À (aigu + grave)"),
    ("guillemotright", make_guillemotright, "miroir de «"),
    ("plus", make_plus, "deux traits tirés de la barre du T"),
    ("percent", lambda: small_fig(make_percent(), 0.86), "deux petits O du logo + barre oblique"),
    ("Euro", lambda: small_fig(make_euro(), 0.90), "C du logo + deux traits tirés de la barre du T"),
    ("numbersign", make_numbersign, "fûts du H inclinés + traits de la barre du T"),
    ("ampersand", make_ampersand, "U du logo tassé et penché + petit O + jambe du R"),
    ("at", make_at, "tirets (barre du T) enroulés en anneau + panse du à"),
    ("periodcentered", make_periodcentered, "point du panneau remonté"),
    ("ellipsis", make_ellipsis, "trois points du panneau"),
    ("quoteleft", make_quoteleft, "apostrophe du logo tournée de 180 degrés"),
    ("quotedblright", make_quotedblright, "deux apostrophes du logo"),
    ("quotedblleft", make_quotedblleft, "deux apostrophes du logo tournées"),
    ("Acircumflex", lambda: make_accented("A", "circumflex"), "A du logo + circonflexe fait des accents du À"),
    ("Adieresis", lambda: make_accented("A", "dieresis"), "A du logo + tréma (points du panneau)"),
    ("Eacute", lambda: make_accented("E", "acute"), "E du È (logo) + accent du À en miroir"),
    ("Ecircumflex", lambda: make_accented("E", "circumflex"), "E du È (logo) + circonflexe"),
    ("Edieresis", lambda: make_accented("E", "dieresis"), "E du È (logo) + tréma"),
    ("Icircumflex", lambda: make_accented("I", "circumflex"), "I + circonflexe"),
    ("Idieresis", lambda: make_accented("I", "dieresis"), "I + tréma"),
    ("Ocircumflex", lambda: make_accented("O", "circumflex"), "O du logo + circonflexe"),
    ("Odieresis", lambda: make_accented("O", "dieresis"), "O du logo + tréma"),
    ("Ugrave", lambda: make_accented("U", "grave"), "U du logo + accent du À"),
    ("Ucircumflex", lambda: make_accented("U", "circumflex"), "U du logo + circonflexe"),
    ("Udieresis", lambda: make_accented("U", "dieresis"), "U du logo + tréma"),
    ("Ydieresis", lambda: make_accented("Y", "dieresis"), "Y recomposé + tréma"),
    ("Ccedilla", make_Ccedilla, "C du logo + cédille (virgule du panneau réduite)"),
    ("OE", make_OE, "O du logo + E du logo partageant le fût"),
    ("AE", make_AE, "A du logo + E du logo partageant le fût"),
]

# glyphes dont l'epaisseur est laissee telle quelle (futs gras voulus, taches)
WEIGHT_EXEMPT = {"I", "L", "exclam", "period", "comma", "colon", "semicolon", "ellipsis", "periodcentered",
                 "quotesingle", "quotedbl", "quoteright", "quoteleft", "quotedblright", "quotedblleft",
                 "Icircumflex", "Idieresis"}
WEIGHT_RANGE = (61.0, 75.0)   # unites ; mediane des lettres sources ~ 67


def normalize_weight(b):
    sw = stroke_width(b)
    lo, hi = WEIGHT_RANGE
    if sw < lo:
        return binarize(offset_shape(b, lo - sw).astype(np.float32), smooth=1.0), sw, lo - sw
    if sw > hi:
        return binarize(offset_shape(b, hi - sw).astype(np.float32), smooth=1.0), sw, hi - sw
    return b, sw, 0.0


# --------------------------------------------------------------------------
# 10. Approche : approches gauche/droite estimees sur les lignes des affiches
# --------------------------------------------------------------------------
CHAR_NAME = {"'": "quotesingle", "à": "agrave"}


def measure_spacing():
    """Moindres carres : ecart(a,b) = RSB(a) + LSB(b) + t_ligne (+ espace).
    Regularisation faible LSB ~ RSB. Renvoie (lsb, rsb, espace, suivi par ligne)."""
    rows = []
    for ln in ("fevrier", "mars", "brocante", "estivaux"):
        spec = LINES[ln]
        inst = line_instances(ln)
        k = 1.0 if ln == REF_LINE else line_xform(ln).s
        idx, prev, space = 0, None, False
        for ch in spec["text"]:
            if ch == " ":
                space = True
                continue
            d = inst[idx]
            idx += 1
            if prev is not None:
                gap_px = d["x0"] - prev["x1"]
                if gap_px > 1:  # lettres qui se touchent (coupe manuelle) : ignorees
                    rows.append((CHAR_NAME.get(prev["ch"], prev["ch"]), CHAR_NAME.get(d["ch"], d["ch"]),
                                 gap_px * U / k, ln, space))
            prev, space = d, False
    chars = sorted({r[0] for r in rows} | {r[1] for r in rows})
    lines = ["mars", "brocante", "estivaux"]
    ci = {c: i for i, c in enumerate(chars)}
    n = 2 * len(chars) + len(lines) + 1
    A, y = [], []
    for a, b, gap, ln, sp in rows:
        v = np.zeros(n)
        v[2 * ci[a] + 1] += 1          # RSB(a)
        v[2 * ci[b]] += 1              # LSB(b)
        if ln in lines:
            v[2 * len(chars) + lines.index(ln)] += 2 if sp else 1
        if sp:
            v[-1] += 1
        A.append(v)
        y.append(gap)
    for c in chars:  # LSB ~ RSB (faible), valeurs moderees (tres faible)
        v = np.zeros(n); v[2 * ci[c]] = 0.35; v[2 * ci[c] + 1] = -0.35
        A.append(v); y.append(0.0)
        for j in (0, 1):
            v = np.zeros(n); v[2 * ci[c] + j] = 0.05
            A.append(v); y.append(0.05 * 20.0)
    sol, *_ = np.linalg.lstsq(np.array(A), np.array(y), rcond=None)
    lsb = {c: float(sol[2 * ci[c]]) for c in chars}
    rsb = {c: float(sol[2 * ci[c] + 1]) for c in chars}
    track = {ln: float(sol[2 * len(chars) + i]) for i, ln in enumerate(lines)}
    resid = np.array(A)[:len(rows)] @ sol - np.array(y)[:len(rows)]
    return lsb, rsb, float(sol[-1]), track, float(np.sqrt((resid ** 2).mean())), rows


# approches des glyphes sans mesure : (source de l'approche gauche, de la droite) ou valeurs
SPACING_ANALOGY = {
    "P": ("R", "B"), "K": ("R", "X"), "G": ("C", "O"), "J": ("U", "U"), "Q": ("O", "O"),
    "W": ("V", "V"), "Y": ("V", "V"), "Z": ("T", "E"),
    "Agrave": ("A", "A"), "Acircumflex": ("A", "A"), "Adieresis": ("A", "A"),
    "Egrave": ("E", "E"), "Eacute": ("E", "E"), "Ecircumflex": ("E", "E"), "Edieresis": ("E", "E"),
    "Icircumflex": ("I", "I"), "Idieresis": ("I", "I"), "Ocircumflex": ("O", "O"), "Odieresis": ("O", "O"),
    "Ugrave": ("U", "U"), "Ucircumflex": ("U", "U"), "Udieresis": ("U", "U"), "Ydieresis": ("V", "V"),
    "Ccedilla": ("C", "C"), "OE": ("O", "E"), "AE": ("A", "E"), "quoteright": ("quotesingle", "quotesingle"),
    "quoteleft": ("quotesingle", "quotesingle"),
}
SPACING_FIXED = {
    "zero": (38, 38), "one": (55, 60), "two": (35, 35), "three": (35, 40), "four": (30, 35), "five": (38, 35),
    "six": (40, 35), "seven": (35, 30), "eight": (38, 38), "nine": (35, 40),
    "period": (18, 45), "comma": (12, 48), "colon": (35, 45), "semicolon": (28, 45), "exclam": (45, 50),
    "question": (35, 40), "ellipsis": (18, 45), "periodcentered": (40, 40),
    "hyphen": (35, 35), "endash": (30, 30), "emdash": (30, 30), "parenleft": (55, 18), "parenright": (18, 55),
    "slash": (10, 10), "quotedbl": (28, 28), "quotedblleft": (25, 30), "quotedblright": (25, 30),
    "guillemotleft": (30, 30), "guillemotright": (30, 30), "plus": (40, 40), "percent": (35, 35),
    "Euro": (25, 35), "numbersign": (25, 25), "ampersand": (30, 30), "at": (40, 40),
}
UNICODES = {
    "A": [0x41, 0x61], "B": [0x42, 0x62], "C": [0x43, 0x63], "D": [0x44, 0x64], "E": [0x45, 0x65],
    "F": [0x46, 0x66], "G": [0x47, 0x67], "H": [0x48, 0x68], "I": [0x49, 0x69], "J": [0x4A, 0x6A],
    "K": [0x4B, 0x6B], "L": [0x4C, 0x6C], "M": [0x4D, 0x6D], "N": [0x4E, 0x6E], "O": [0x4F, 0x6F],
    "P": [0x50, 0x70], "Q": [0x51, 0x71], "R": [0x52, 0x72], "S": [0x53, 0x73], "T": [0x54, 0x74],
    "U": [0x55, 0x75], "V": [0x56, 0x76], "W": [0x57, 0x77], "X": [0x58, 0x78], "Y": [0x59, 0x79],
    "Z": [0x5A, 0x7A],
    "agrave": [0xE0], "Agrave": [0xC0], "Acircumflex": [0xC2, 0xE2], "Adieresis": [0xC4, 0xE4],
    "Ccedilla": [0xC7, 0xE7], "Egrave": [0xC8, 0xE8], "Eacute": [0xC9, 0xE9], "Ecircumflex": [0xCA, 0xEA],
    "Edieresis": [0xCB, 0xEB], "Icircumflex": [0xCE, 0xEE], "Idieresis": [0xCF, 0xEF],
    "Ocircumflex": [0xD4, 0xF4], "Odieresis": [0xD6, 0xF6], "Ugrave": [0xD9, 0xF9],
    "Ucircumflex": [0xDB, 0xFB], "Udieresis": [0xDC, 0xFC], "Ydieresis": [0x178, 0xFF],
    "OE": [0x152, 0x153], "AE": [0xC6, 0xE6],
    "zero": [0x30], "one": [0x31], "two": [0x32], "three": [0x33], "four": [0x34], "five": [0x35],
    "six": [0x36], "seven": [0x37], "eight": [0x38], "nine": [0x39],
    "period": [0x2E], "comma": [0x2C], "semicolon": [0x3B], "colon": [0x3A], "exclam": [0x21],
    "question": [0x3F], "quotesingle": [0x27], "quoteright": [0x2019], "quoteleft": [0x2018],
    "quotedbl": [0x22], "quotedblleft": [0x201C], "quotedblright": [0x201D],
    "guillemotleft": [0xAB], "guillemotright": [0xBB], "hyphen": [0x2D, 0x2010, 0x2011], "endash": [0x2013],
    "emdash": [0x2014], "parenleft": [0x28], "parenright": [0x29], "ampersand": [0x26], "slash": [0x2F],
    "Euro": [0x20AC], "percent": [0x25], "plus": [0x2B], "at": [0x40], "numbersign": [0x23],
    "periodcentered": [0xB7], "ellipsis": [0x2026],
}


# --------------------------------------------------------------------------
# 11. Planche de controle et ecriture des resultats
# --------------------------------------------------------------------------
def source_crops():
    """recadrage d'origine (source, boite en px) de chaque glyphe source"""
    boxes = {n: ("logo", b) for n, ch, b in LOGO_LETTERS}
    crops = {}
    for g, key in (("A", "A"), ("C", "C"), ("E", "E1"), ("I", "I2"), ("L", "L1"), ("M", "M"), ("O", "O"),
                   ("R", "R3"), ("S", "S"), ("U", "U")):
        crops[g] = boxes[key]
    for ln, chars in (("fevrier", "FNV'à"), ("brocante", "BDT"), ("estivaux", "HX")):
        for d in line_instances(ln):
            name = CHAR_NAME.get(d["ch"], d["ch"])
            if d["ch"] in chars and name not in crops:
                crops[name] = (LINES[ln]["src"], (d["x0"] - 6, d["y0"] - 6, d["x1"] + 6, d["y1"] + 6))
    crops["Agrave"] = ("logo", (498, 148, 584, 316))
    crops["Egrave"] = ("logo", (505, 272, 598, 480))
    crops["quoteright"] = ("logo", (76, 108, 122, 182))
    crops["comma"] = ("panneau", (2012, 1320, 2075, 1452))
    crops["period"] = ("panneau", (2166, 2422, 2227, 2497))
    return crops


def sources_sheet(glyphs, path):
    crops = source_crops()
    names = [n for n in SOURCE_PLAN] + list(SPECIAL_PLAN)
    tw, th = 300, 260
    per_row = 5
    rows = (len(names) + per_row - 1) // per_row
    sheet = Image.new("RGB", (per_row * tw, rows * th), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    imgs = {}
    for i, n in enumerate(names):
        key, box = crops[n]
        if key not in imgs:
            im = Image.open(P(SOURCES[key][0]))
            im.load()
            imgs[key] = im.convert("RGB")
        c = imgs[key].crop(box)
        sc = 200.0 / max(c.height, 1)
        c = c.resize((max(1, int(c.width * sc)), 200), Image.LANCZOS)
        b = glyphs[n]
        x0, x1, y0, y1 = ink_bbox(b)
        g = Image.fromarray(np.where(b[y0:y1, x0:x1], 0, 255).astype(np.uint8)).convert("RGB")
        sg = 200.0 / max(g.height, 1)
        g = g.resize((max(1, int(g.width * sg)), 200), Image.LANCZOS)
        x, y = (i % per_row) * tw, (i // per_row) * th
        sheet.paste(c.crop((0, 0, min(c.width, 140), 200)), (x + 5, y + 30))
        sheet.paste(g.crop((0, 0, min(g.width, 140), 200)), (x + 150, y + 30))
        d.text((x + 5, y + 8), "%s  (%s)" % (n, key), fill=(90, 70, 60))
    sheet.save(path)


def png_name(n):
    """'Agrave' -> 'A_grave.png', 'agrave' -> 'agrave.png' (Windows ignore la casse)"""
    return "".join(c + "_" if c.isupper() else c for c in n) + ".png"


def contact_sheet(glyphs, names, path, per_row=12, scale=0.18):
    tw, th = int(700 * scale), int(1250 * scale)
    rows = (len(names) + per_row - 1) // per_row
    sheet = Image.new("L", (per_row * tw, rows * (th + 14)), 255)
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        b = glyphs[n]
        x0, x1, y0, y1 = ink_bbox(b)
        top = CANVAS_TOP - 1000
        im = Image.fromarray(np.where(b, 0, 255).astype(np.uint8))
        im = im.crop((x0 - 40, top, x0 - 40 + 700, top + 1250)).resize((tw, th), Image.LANCZOS)
        x, y = (i % per_row) * tw, (i // per_row) * (th + 14)
        sheet.paste(im, (x, y))
        d.line([(x, y + int(1000 * scale)), (x + tw - 4, y + int(1000 * scale))], fill=200)
        d.text((x + 2, y + th), n[:16], fill=0)
    sheet.save(path)


def main():
    t0 = __import__("time").time()
    GLYPH_DIR.mkdir(parents=True, exist_ok=True)
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    init_reference()
    print("reference fevrier : ligne de base %.1f px, capitale %.1f px, %.3f unites/px" % (FEB_BASE, FEB_TOP, U))
    src, srcinfo = extract_sources()
    print("glyphes vectorisables depuis les sources : %d (%.0f s)" % (len(src), __import__("time").time() - t0))
    G.clear()
    G.update({k: std(v) for k, v in src.items()})
    info = {k: dict(kind="source", source=v) for k, v in srcinfo.items()}
    weights = {}
    for name, fn, desc in COMPOSE_PLAN:
        b = fn()
        if name not in WEIGHT_EXEMPT:
            b, sw, dlt = normalize_weight(b)
        else:
            sw, dlt = stroke_width(b), 0.0
        COMPOSED[name] = std(b)
        info[name] = dict(kind="recompose", source=desc, weight_fix=round(dlt, 1))
        weights[name] = round(stroke_width(b) if dlt else sw, 1)
    print("glyphes recomposes : %d (%.0f s)" % (len(COMPOSE_PLAN), __import__("time").time() - t0))
    allg = dict(G)
    allg.update(COMPOSED)
    # approches
    lsb_m, rsb_m, space, track, rms, rows = measure_spacing()
    print("approche : espace %.0f u, suivi %s, residu %.1f u" % (space, {k: round(v) for k, v in track.items()}, rms))
    spacing = {}
    for n in allg:
        if n in lsb_m:
            spacing[n] = (lsb_m[n], rsb_m[n], "mesuree")
        elif n in SPACING_ANALOGY:
            a, b = SPACING_ANALOGY[n]
            spacing[n] = (lsb_m[a], rsb_m[b], "comme %s/%s" % (a, b))
        elif n in SPACING_FIXED:
            a, b = SPACING_FIXED[n]
            spacing[n] = (float(a), float(b), "fixee")
        else:
            spacing[n] = (20.0, 20.0, "defaut")
    # ecriture
    meta = {"upm": UPM, "cap_height": CAP, "baseline_ref_px": FEB_BASE, "units_per_px_fevrier": U,
            "space": round(space), "spacing_rms": round(rms, 1), "tracking": track, "glyphs": {}}
    for f in GLYPH_DIR.glob("*.png"):
        f.unlink()
    for n, b in allg.items():
        x0, x1, y0, y1 = ink_bbox(b)
        m = 20
        crop = b[y0 - m:y1 + m, x0 - m:x1 + m]
        Image.fromarray(np.where(crop, 0, 255).astype(np.uint8)).save(GLYPH_DIR / png_name(n))
        lsb, rsb, how = spacing[n]
        w = x1 - x0
        g = dict(info[n])
        g.update(dict(png=png_name(n), xmin=-m, ymax=CANVAS_TOP - (y0 - m), width=w,
                      yMin=CANVAS_TOP - y1, yMax=CANVAS_TOP - y0,
                      lsb=int(round(lsb)), rsb=int(round(rsb)), advance=int(round(lsb + w + rsb)),
                      spacing=how, stroke=weights.get(n, round(stroke_width(b), 1)),
                      unicodes=UNICODES.get(n, [])))
        meta["glyphs"][n] = g
    (WORK / "glyphs.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    order = [c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"] + \
        ["Agrave", "Acircumflex", "Adieresis", "Ccedilla", "Egrave", "Eacute", "Ecircumflex", "Edieresis",
         "Icircumflex", "Idieresis", "Ocircumflex", "Odieresis", "Ugrave", "Ucircumflex", "Udieresis",
         "Ydieresis", "OE", "AE", "agrave"] + \
        ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] + \
        [n for n, *_ in COMPOSE_PLAN if n in ("period", "comma") or UNICODES.get(n, [0])[0] < 0x41 or
         n in ("guillemotleft", "guillemotright", "Euro", "periodcentered", "ellipsis", "quoteleft",
               "quotedblleft", "quotedblright", "endash", "emdash")]
    order += [n for n in ("period", "comma", "quotesingle", "quoteright") if n not in order]
    order = [n for i, n in enumerate(order) if n in allg and n not in order[:i]]
    contact_sheet(allg, order, SHEET_DIR / "tous_les_glyphes.png")
    sources_sheet(allg, SHEET_DIR / "sources_utilisees.png")
    print("ecrit : %d glyphes dans %s (%.0f s)" % (len(allg), GLYPH_DIR, __import__("time").time() - t0))


if __name__ == "__main__" and "--probe" not in sys.argv:
    main()

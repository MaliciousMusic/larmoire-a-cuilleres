"""5b. Feuilles colorées : complétion des formes et des détails.

Composition (affiche 2013_11_Mallo_TestSite.jpg, repère = pixels de l'affiche, 3508x2481) : un bouquet qui
sort du coin inférieur droit ; pointes en haut à gauche, bases hors cadre en bas à droite. Empilement (du
fond vers l'avant), déduit des recouvrements :
    fuchsia < écailles < prune < turquoise < aqua < marine

Complétion d'une feuille :
- les bords RÉELS visibles (contre la photo, ou contre une feuille située derrière) sont gardés tels quels ;
- chaque tronçon caché (sous une feuille de devant) ou coupé par le cadre est remplacé par un tronçon
  inventé : spline de Catmull-Rom centripète passant par les points des bords réels (tous les 20 px, ce qui
  assure la continuité de tangente aux raccords) et par des points relevés à la main (GAPS) ;
- la partie inventée n'est acceptée que sous une feuille de devant ou hors cadre : la composition d'origine
  reste identique.
Détails blancs (tracés séparés) : nervures de la turquoise prolongées jusqu'à la base ; tirets de la plume
et de l'aqua recopiés (formes d'origine) dans les parties inventées ; mailles du filet recopiées sur leur
réseau dans la partie inventée de la bande.
"""
import math

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

from vec import *
import feuilles_seg as S

KF = S.KF
EX0, EY0, EX1, EY1 = 2200, 1150, 4050, 2800  # canevas étendu (repère affiche)
FRAME_X, FRAME_Y = 3508, 2481

ORDER = ["fuchsia", "ecailles", "prune", "turquoise", "aqua", "marine"]  # du fond vers l'avant
COLORS = {  # couleurs de la marque
    "turquoise": "#3FC7EE", "prune": "#6C2383", "fuchsia": "#E64AA8", "marine": "#13365E",
    "aqua": "#A6E6DC", "ecailles": "#5FC8EE",
}
DETAIL = "#FFFFFF"
LABELS = {
    "turquoise": "feuille turquoise à nervures", "prune": "plume prune à tirets", "fuchsia": "lame fuchsia",
    "ecailles": "bande d'écailles", "marine": "rameau marine", "aqua": "grande feuille aqua",
}

# identifiants publics (ordre de la consigne : a turquoise, b plume, c lame, d écailles, e rameau, f aqua)
IDS_JS = {"turquoise": "a", "prune": "b", "fuchsia": "c", "ecailles": "d", "marine": "e", "aqua": "f"}

# pointe (extrémité libre) et base (point d'attache = pivot) de chaque feuille, repère affiche
TIPS = {"turquoise": (2612, 1219), "prune": (2307, 1189), "fuchsia": (2281, 1377), "ecailles": (2453, 1978),
        "aqua": (2269, 2441), "marine": (2955, 2190)}
BASES = {"turquoise": (3866, 1690), "prune": (3968, 2100), "fuchsia": (3132, 2585), "ecailles": (3197, 1950),
         "aqua": (3748, 2392), "marine": (3800, 2066)}

# tronçons inventés : (début, fin, points) ; début/fin = extrémités (approchées) des bords réels encadrant
# le tronçon caché ; points dans le sens début -> fin
GAPS = {
    "turquoise": [((3506, 1349), (3506, 1712),
                   [(3600, 1400), (3690, 1466), (3770, 1545), (3830, 1622), (3866, 1690),
                    (3800, 1710), (3700, 1717), (3600, 1716)])],
    "prune": [((3102, 2020), (2900, 1453),
               [(3200, 2083), (3300, 2147), (3400, 2203), (3506, 2245), (3620, 2266), (3740, 2248),
                (3860, 2195), (3968, 2100), (3905, 1990), (3812, 1880), (3700, 1785), (3580, 1705),
                (3450, 1645), (3300, 1597), (3150, 1545), (3000, 1488)])],
    "fuchsia": [((2697, 1935), (2477, 1461),
                 [(2703, 1948), (2733, 1984), (2765, 2016), (2785, 2040), (2800, 2060), (2830, 2095),
                  (2870, 2140), (2915, 2190), (2965, 2250), (3015, 2320), (3060, 2400), (3092, 2480),
                  (3112, 2550), (3134, 2590), (3154, 2552), (3164, 2480), (3172, 2370), (3162, 2250),
                  (3134, 2130), (3100, 2010), (3050, 1905), (2968, 1795), (2872, 1700), (2770, 1622),
                  (2680, 1565), (2600, 1520), (2530, 1485)])],
    "aqua": [((2747, 2479), (3433, 2156),
              [(2860, 2530), (3000, 2575), (3150, 2600), (3300, 2605), (3450, 2585), (3580, 2540),
               (3680, 2472), (3748, 2392), (3702, 2300), (3620, 2228), (3540, 2183), (3480, 2163)])],
    "ecailles": [((2907, 1882), (3080, 2021),
                  [(3000, 1866), (3080, 1861), (3140, 1873), (3180, 1902), (3197, 1950), (3172, 1990),
                   (3130, 2008)])],
}

# rameau marine : tige prolongée jusqu'à la coupe (pivot), feuilles coupées complétées, deux feuilles ajoutées
MARINE = {
    "tige": [(3440, 2118), (3506, 2108), (3600, 2092), (3700, 2078), (3800, 2066)], "tige_demi": 8.0,
    "morceaux": [
        [(3224, 1797), (3350, 1850), (3450, 1905), (3506, 1962), (3536, 2012), (3534, 2058), (3505, 2098),
         (3470, 2105), (3420, 2070), (3330, 1990)],
        [(3303, 2432), (3400, 2340), (3478, 2262), (3506, 2226), (3526, 2180), (3520, 2140), (3490, 2122),
         (3450, 2140), (3380, 2260)],
    ],
    "ajouts": [((3640, 2088), (3548, 1845), 62.0, 0.42), ((3712, 2080), (3642, 2318), 52.0, 0.42)],
}


# --------------------------------------------------------------------------------------------- géométrie
def spline_closed(pts, n=24):
    """Catmull-Rom centripète fermée."""
    P = np.asarray(pts, float)
    m = len(P)
    out = []
    for i in range(m):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % m], P[(i + 2) % m]
        t0 = 0.0
        t1 = t0 + max(np.hypot(*(p1 - p0)), 1e-6) ** 0.5
        t2 = t1 + max(np.hypot(*(p2 - p1)), 1e-6) ** 0.5
        t3 = t2 + max(np.hypot(*(p3 - p2)), 1e-6) ** 0.5
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    return np.asarray(out)


def catmull_open(pts, n=12):
    P = np.asarray(pts, float)
    if len(P) < 3:
        return P
    Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return np.asarray(out)


def lens(B, T, w, belly=0.42, n=40):
    """Feuille en lentille pointue : deux arcs cubiques de B (base) à T (pointe)."""
    B, T = np.asarray(B, float), np.asarray(T, float)
    d = T - B
    L = np.hypot(*d)
    u = d / L
    nrm = np.array([-u[1], u[0]])
    c1 = B + u * L * (belly - 0.18) + nrm * w * 1.33
    c2 = B + u * L * (belly + 0.30) + nrm * w * 1.33
    c3 = B + u * L * (belly + 0.30) - nrm * w * 1.33
    c4 = B + u * L * (belly - 0.18) - nrm * w * 1.33
    t = np.linspace(0, 1, n)[:, None]
    up = (1 - t) ** 3 * B + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * T
    lo = (1 - t) ** 3 * T + 3 * (1 - t) ** 2 * t * c3 + 3 * (1 - t) * t * t * c4 + t ** 3 * B
    return np.vstack([up, lo[1:]])


def stroke_poly(pts, half):
    P = catmull_open(pts, 12)
    d = np.gradient(P, axis=0)
    d /= np.hypot(d[:, 0], d[:, 1])[:, None]
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    return np.vstack([P + nrm * half, (P - nrm * half)[::-1]])


def to_grid(pts):
    return (np.asarray(pts, float) - [EX0, EY0]) * KF


def to_src(pts_grid):
    return np.asarray(pts_grid, float) / KF + [EX0, EY0]


def fill_poly(pts, shape):
    m = np.zeros(shape, np.uint8)
    q = np.round((to_grid(pts) - 0.5) * 16).astype(np.int32)
    cv2.fillPoly(m, [q], 1, cv2.LINE_8, shift=4)
    return m > 0


def draw_polyline(mask, pts, width):
    m = mask.astype(np.uint8)
    q = np.round((to_grid(pts) - 0.5) * 16).astype(np.int32)
    cv2.polylines(m, [q], False, 1, max(1, int(round(width * KF))), cv2.LINE_AA, shift=4)
    return m > 0


# --------------------------------------------------------------------------------------------- données
def load_visible():
    """Masques visibles (grille étendue) nettoyés + détails blancs."""
    z = np.load(WORK / "feuilles_seg.npz")
    Hs, Ws = z["lab"].shape
    H, W = (EY1 - EY0) * KF, (EX1 - EX0) * KF
    ox, oy = (S.CX0 - EX0) * KF, (S.CY0 - EY0) * KF

    def place(a):
        out = np.zeros((H, W), bool)
        out[oy:oy + Hs, ox:ox + Ws] = a
        return out

    vis, det = {}, {}
    for n in ORDER:
        m = z[f"m_{n}"]
        if n != "ecailles":
            m = ndi.binary_opening(m, iterations=2)  # liserés CMJN le long des feuilles marine
        lab, k = ndi.label(m, structure=np.ones((3, 3)))
        sizes = ndi.sum(m, lab, range(1, k + 1))
        if n == "fuchsia":
            keep = [i + 1 for i in range(k) if sizes[i] >= 40]  # le corps + le rose vu à travers le filet
        elif n == "ecailles":
            keep = [i + 1 for i in range(k) if sizes[i] >= 200]
        else:
            keep = [i + 1 for i in range(k) if sizes[i] >= 300]  # >= 75 px² (bande de plume sous la tige)
        vis[n] = place(np.isin(lab, keep))
    for n in ("turquoise", "prune", "aqua"):
        det[n] = place(z[f"d_{n}"])
    # dernières lignes / colonnes de l'affiche (bord JPEG) : non fiables, traitées comme hors cadre
    inside = np.zeros((H, W), bool)
    inside[oy:oy + Hs - 3 * KF, ox:ox + Ws - 3 * KF] = True
    return vis, det, inside


def solid_of(n, vis, det):
    s = vis[n] | det.get(n, np.zeros_like(vis[n]))
    if n == "ecailles":
        return ndi.binary_fill_holes(ndi.binary_closing(s, iterations=6))
    # encoches de 1-2 px le long des bords (pixels mêlés : bord blanc de la tasse, nervure qui touche le bord) :
    # fermeture par un disque (un losange laisse passer les encoches en V)
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    return s | (cv2.morphologyEx(s.astype(np.uint8), cv2.MORPH_CLOSE, disk) > 0)


def classify_contour(n, vis, det, inside):
    """Contour extérieur de la partie visible et nature de chaque point (réel ou non)."""
    i = ORDER.index(n)
    H, W = inside.shape
    behind = np.zeros((H, W), bool)
    for m in ORDER[:i]:
        behind |= vis[m] | det.get(m, np.zeros((H, W), bool))
    anyleaf = np.zeros((H, W), bool)
    for m in ORDER:
        anyleaf |= vis[m] | det.get(m, np.zeros((H, W), bool))
    photo = ndi.binary_opening(inside & ~anyleaf, iterations=3)
    if n == "ecailles":
        behind = np.zeros((H, W), bool)  # filet ajouré : seul le fond compte
    real_nb = ndi.binary_dilation(photo | behind, iterations=8)
    solid = solid_of(n, vis, det)
    front = np.zeros((H, W), bool)
    for m in ORDER[i + 1:]:
        front |= vis[m] | det.get(m, np.zeros((H, W), bool))
    ys, xs = np.nonzero(solid)
    hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32))
    hm = np.zeros((H, W), np.uint8)
    cv2.fillPoly(hm, [hull[:, 0, :]], 1)
    M = solid | (ndi.binary_dilation(front, iterations=3) & (hm > 0))
    M = ndi.binary_fill_holes(ndi.binary_closing(M, iterations=2))
    cs, _ = cv2.findContours(M.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=len)[:, 0, :]
    fx, fy = (FRAME_X - EX0) * KF, (FRAME_Y - EY0) * KF
    near_solid = ndi.binary_dilation(solid, iterations=3)  # un bord réel borde la partie visible elle-même
    real = np.array([(x < fx - 3 and y < fy - 3 and real_nb[y, x] and near_solid[y, x]) for x, y in c])
    pts = to_src(np.stack([c[:, 0] + 0.5, c[:, 1] + 0.5], 1))
    # tronçons réels trop courts (< 12 px) : bruit, traités comme cachés
    N = len(real)
    lab, k = ndi.label(np.concatenate([real, real]))
    for j in range(1, k + 1):
        idx = np.nonzero(lab == j)[0]
        if len(idx) < 12 * KF and len(idx) < N:
            real[idx % N] = False
    return pts, real


def design_contour(n, vis, det, inside, step=20.0):
    pts, real = classify_contour(n, vis, det, inside)
    N = len(pts)
    skip = np.zeros(N, bool)
    inserts = {}
    for (start, end, inv) in GAPS.get(n, []):
        i_s = int(np.argmin(np.hypot(*(pts - start).T)))
        i_e = int(np.argmin(np.hypot(*(pts - end).T)))
        fwd = [(i_s + k) % N for k in range(1, (i_e - i_s) % N)]
        bwd = [(i_e + k) % N for k in range(1, (i_s - i_e) % N)]
        rf = real[fwd].mean() if fwd else 1
        rb = real[bwd].mean() if bwd else 1
        if rf <= rb:
            skip[fwd] = True
            inserts[i_s] = list(inv)
        else:
            skip[bwd] = True
            inserts[i_e] = list(inv)[::-1]
    seq = []
    acc = step
    prev = None
    for i in range(N):
        if i in inserts:
            seq.append(tuple(pts[i]))
            seq += [tuple(p) for p in inserts[i]]
            prev = None
            acc = 0
            continue
        if skip[i] or not real[i]:
            prev = None
            continue
        if prev is not None:
            acc += float(np.hypot(*(pts[i] - pts[prev])))
        if prev is None or acc >= step:
            seq.append(tuple(pts[i]))
            acc = 0
        prev = i
    clean = [seq[0]]
    for p in seq[1:]:
        if np.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 3:
            clean.append(p)
    return np.asarray(clean)


def complete_shapes(vis, det, inside, verbose=True):
    H, W = inside.shape
    solid = {n: solid_of(n, vis, det) for n in ORDER}
    full, report, designs = {}, {}, {}
    anyleaf = np.zeros((H, W), bool)
    for m in ORDER:
        anyleaf |= vis[m] | det.get(m, np.zeros((H, W), bool))
    # photo : grandes plages hors feuilles (les liserés CMJN / d'anticrénelage, minces, n'en sont pas)
    photo = ndi.binary_dilation(ndi.binary_opening(inside & ~anyleaf, iterations=3), iterations=2)
    for i, n in enumerate(ORDER):
        behind = np.zeros((H, W), bool)
        for m in ORDER[:i]:
            behind |= vis[m] | det.get(m, np.zeros((H, W), bool))
        if n == "ecailles":
            behind = ndi.binary_opening(behind, iterations=2)
        allowed = ~(photo | behind) | ~inside
        if n == "marine":
            D = fill_poly(stroke_poly(MARINE["tige"], MARINE["tige_demi"]), (H, W))
            for poly in MARINE["morceaux"]:
                D |= fill_poly(spline_closed(poly), (H, W))
            for (B, T, w, belly) in MARINE["ajouts"]:
                D |= fill_poly(lens(B, T, w, belly), (H, W))
            designs[n] = None
        else:
            seq = design_contour(n, vis, det, inside)
            designs[n] = seq
            D = fill_poly(spline_closed(seq, 16), (H, W))
        inv = D & allowed & ~solid[n]
        inv = ndi.binary_opening(inv, iterations=3)  # pas de copeaux le long des bords réels
        f = solid[n] | inv
        f = ndi.binary_closing(f, iterations=2) & (allowed | solid[n])  # rien de plus sur la photo
        f = ndi.binary_fill_holes(f)
        # lissage léger du contour (dentelures d'anticrénelage, pointes mêlées de blanc) : flou 0,75 px
        f = cv2.GaussianBlur(f.astype(np.float32), (0, 0), 1.5) > 0.5
        full[n] = f
        report[n] = int((D & ~allowed & ~ndi.binary_dilation(solid[n], iterations=4)).sum())
    if verbose:
        for n in ORDER:
            print(f"  {n:10s} : {report[n] / KF / KF:7.0f} px du tracé inventé refusés (hors feuilles de devant)")
    return full, designs, report


# --------------------------------------------------------------------------------------------- détails
def skeleton_paths(mask):
    """Composantes d'un masque de traits -> (polyligne ordonnée (repère affiche), demi-largeur, aire)."""
    dist = ndi.distance_transform_edt(mask)
    lab, k = ndi.label(mask, structure=np.ones((3, 3)))
    out = []
    for j, sl in enumerate(ndi.find_objects(lab)):
        comp = lab[sl] == j + 1
        sk = skeletonize(comp)
        ys, xs = np.nonzero(sk)
        if len(ys) < 2:
            continue
        idx = {(y, x): i for i, (y, x) in enumerate(zip(ys, xs))}
        nb = [[] for _ in ys]
        for i, (y, x) in enumerate(zip(ys, xs)):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if (dy or dx) and (y + dy, x + dx) in idx:
                        nb[i].append(idx[(y + dy, x + dx)])

        def bfs(s):
            prev = {s: None}
            order = [s]
            for u in order:
                for v in nb[u]:
                    if v not in prev:
                        prev[v] = u
                        order.append(v)
            return order[-1], prev

        a, _ = bfs(0)
        b, prev = bfs(a)
        path = []
        u = b
        while u is not None:
            path.append(u)
            u = prev[u]
        path = np.asarray(path)
        P = np.stack([xs[path] + sl[1].start + 0.5, ys[path] + sl[0].start + 0.5], 1)
        hw = float(np.median(dist[ys[path] + sl[0].start, xs[path] + sl[1].start])) / KF
        out.append((to_src(P), hw, float(comp.sum()) / KF / KF))
    return out


def vein_ends(det_v, full, side, window=70.0):
    """Extrémités des nervures coupées par le cadre : point, direction (unitaire) et demi-largeur.
    side = 'droite' (x = cadre) ou 'bas' (y = cadre). Chaque nervure est isolée dans une bande de
    `window` px le long du cadre, où les nervures ne se touchent plus."""
    sk = skeletonize(det_v)
    dist = ndi.distance_transform_edt(det_v)
    H, W = det_v.shape
    if side == "droite":
        gx0 = int((FRAME_X - window - EX0) * KF)
        band = np.zeros_like(sk)
        band[:, gx0:int((FRAME_X - EX0) * KF)] = True
    else:
        gy0 = int((FRAME_Y - window - EY0) * KF)
        band = np.zeros_like(sk)
        band[gy0:int((FRAME_Y - EY0) * KF), :] = True
    part = sk & band
    lab, k = ndi.label(part, structure=np.ones((3, 3)))
    ends = []
    for j in range(1, k + 1):
        ys, xs = np.nonzero(lab == j)
        P = to_src(np.stack([xs + 0.5, ys + 0.5], 1))
        if side == "droite":
            if P[:, 0].max() < FRAME_X - 9 or len(P) < 12:
                continue
            e = P[np.argmax(P[:, 0])]
        else:
            if P[:, 1].max() < FRAME_Y - 9 or len(P) < 12:
                continue
            e = P[np.argmax(P[:, 1])]
        # direction : moindres carrés sur les points de la nervure, orientée vers le cadre
        c = P.mean(axis=0)
        _, _, vt = np.linalg.svd(P - c)
        t = vt[0]
        if np.dot(e - c, t) < 0:
            t = -t
        hw = float(np.median(dist[ys, xs])) / KF
        ends.append((e, t, hw))
    return ends


def extend_turquoise(det_t, full_t):
    """Nervures de la turquoise : prolongées du cadre jusqu'à la base, en convergeant comme à la pointe."""
    out = det_t.copy()
    base = np.array(BASES["turquoise"], float)
    inner = ndi.binary_erosion(full_t, iterations=5 * KF)
    ends = vein_ends(det_t, full_t, "droite")
    mid = np.mean([e[0] for e in ends], axis=0)
    u = base - mid
    u /= np.hypot(*u)
    nrm = np.array([-u[1], u[0]])
    for P0, t0, hw in ends:
        off = float(np.dot(P0 - mid, nrm))
        B = base - u * 16 + nrm * off * 0.06  # les nervures se rejoignent juste avant la base
        L = np.hypot(*(B - P0))
        c1 = P0 + t0 * L * 0.38
        c2 = B - u * L * 0.30 + nrm * off * 0.10
        t = np.linspace(0, 1, 80)[:, None]
        curve = (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * B
        m = draw_polyline(np.zeros_like(out), np.vstack([P0 - t0 * 3, curve]), 2 * hw)
        out |= m & inner
    return out, len(ends)


def extend_aqua_veins(det_a, full_a):
    """Nervures de l'aqua coupées par le bas du cadre : prolongées (en s'incurvant légèrement vers la
    pointe, comme les nervures visibles) jusqu'à 12 px du bord de la feuille."""
    out = det_a.copy()
    inner = ndi.binary_erosion(full_a, iterations=12 * KF)
    ends = vein_ends(det_a, full_a, "bas", window=40.0)
    n = 0
    for P0, t0, hw in ends:
        pts = [P0 - t0 * 3]
        p, t = P0.copy(), t0.copy()
        for _ in range(400):
            # légère rotation vers la gauche (les nervures d'origine s'incurvent vers la pointe)
            a = math.radians(0.12)
            t = np.array([t[0] * math.cos(a) - t[1] * math.sin(a), t[0] * math.sin(a) + t[1] * math.cos(a)])
            p = p + t
            gx, gy = int((p[0] - EX0) * KF), int((p[1] - EY0) * KF)
            if not (0 <= gy < inner.shape[0] and 0 <= gx < inner.shape[1]) or not inner[gy, gx]:
                break
            pts.append(p.copy())
        if len(pts) > 3:
            out |= draw_polyline(np.zeros_like(out), np.asarray(pts), 2 * hw) & full_a
            n += 1
    return out, n


def copy_strokes(det_v, full, visible_area, spacing, rng, margin=26.0, pool=None, density=1.0):
    """Recopie de traits d'origine (tirets) sur un semis régulier dans les parties inventées d'une feuille.
    Un trait n'est placé que s'il tient entièrement hors de la zone visible et à distance du bord."""
    paths = skeleton_paths(det_v)
    strokes = [p for p in paths if len(p[0]) >= 4 and (pool is None or pool(p))]
    out = det_v.copy()
    inner = ndi.binary_erosion(full, iterations=int(margin * KF))
    vis_d = ndi.binary_dilation(visible_area, iterations=int(8 * KF))
    ys, xs = np.nonzero(inner & ~vis_d)
    if len(ys) == 0 or not strokes:
        return out, 0
    x0, x1 = xs.min() / KF + EX0, xs.max() / KF + EX0
    y0, y1 = ys.min() / KF + EY0, ys.max() / KF + EY0
    placed = [tuple(p[0].mean(axis=0)) for p in paths]
    count = 0
    row = 0
    y = y0
    while y <= y1:
        x = x0 + (spacing / 2 if row % 2 else 0)
        while x <= x1:
            if rng.random() <= density:
                cx = x + rng.uniform(-0.22, 0.22) * spacing
                cy = y + rng.uniform(-0.22, 0.22) * spacing
                gx, gy = int((cx - EX0) * KF), int((cy - EY0) * KF)
                if (0 <= gy < inner.shape[0] and 0 <= gx < inner.shape[1] and inner[gy, gx]
                        and not vis_d[gy, gx]
                        and min(math.hypot(cx - px, cy - py) for px, py in placed) > spacing * 0.7):
                    P, hw, _ = strokes[int(rng.integers(len(strokes)))]
                    Q = P - P.mean(axis=0) + [cx, cy]
                    m = draw_polyline(np.zeros_like(out), Q, 2 * hw)
                    if not (m & vis_d).any() and not (m & ~inner).any():
                        out |= m
                        placed.append((cx, cy))
                        count += 1
            x += spacing
        y += spacing * 0.87
        row += 1
    return out, count


def extend_net(net_v, band_full, band_vis):
    """Filet d'écailles : une maille d'origine recopiée sur le réseau des mailles dans la partie inventée,
    et fil de bordure le long du contour inventé."""
    cells = band_vis & ~net_v
    lab, k = ndi.label(cells)
    edge = band_vis & ~ndi.binary_erosion(band_vis, iterations=3)
    best = None
    for j, sl in enumerate(ndi.find_objects(lab)):
        comp = lab[sl] == j + 1
        a = comp.sum() / KF / KF
        if a < 300:
            continue
        sl2 = (slice(max(0, sl[0].start - 3), sl[0].stop + 3), slice(max(0, sl[1].start - 3), sl[1].stop + 3))
        if (ndi.binary_dilation(lab[sl2] == j + 1, iterations=2) & edge[sl2]).any():
            continue  # maille coupée par le bord de la bande
        if best is None or a > best[0]:
            cy, cx = ndi.center_of_mass(comp)
            best = (a, (cx + sl[1].start) / KF + EX0, (cy + sl[0].start) / KF + EY0, comp)
    a, mx, my, tmpl = best
    v1 = np.array([52.0, 29.0])  # réseau des mailles (mesuré sur les mailles de droite du filet)
    v2 = np.array([58.0, -30.0])
    inv = band_full & ~band_vis
    new_cells = np.zeros_like(net_v)
    th, tw = tmpl.shape
    for i in range(-8, 12):
        for j in range(-8, 12):
            c = np.array([mx, my]) + i * v1 + j * v2
            gx, gy = int(round((c[0] - EX0) * KF)), int(round((c[1] - EY0) * KF))
            y0, x0 = gy - th // 2, gx - tw // 2
            if y0 < 0 or x0 < 0 or y0 + th > inv.shape[0] or x0 + tw > inv.shape[1]:
                continue
            if not inv[y0:y0 + th, x0:x0 + tw][tmpl].any():
                continue
            new_cells[y0:y0 + th, x0:x0 + tw] |= tmpl
    # les mailles visibles coupées par la couture se prolongent de quelques px (pas de fil le long de
    # la couture)
    ext = ndi.binary_dilation(cells, iterations=int(5 * KF)) & inv
    thread = inv & ~new_cells & ~ext
    thread = ndi.binary_opening(thread, iterations=2)
    border = band_full & ~ndi.binary_erosion(band_full, iterations=int(4 * KF))
    return net_v | thread | (border & inv)


# --------------------------------------------------------------------------------------------- contrôles
def rgb_of(n):
    return np.array([int(COLORS[n][i:i + 2], 16) for i in (1, 3, 5)])


def compose(full, dets, frame_only=False):
    """Rendu raster de la composition complétée (grille étendue)."""
    H, W = next(iter(full.values())).shape
    img = np.full((H, W, 3), 250, np.uint8)
    for n in ORDER:
        if n == "ecailles":
            img[dets["ecailles"] & full[n]] = rgb_of(n)
        else:
            img[full[n]] = rgb_of(n)
            if n in dets:
                img[dets[n] & full[n]] = (255, 255, 255)
    return img


def diag(full, dets, name="feuilles_completion.png"):
    img = compose(full, dets)
    H, W = img.shape[:2]
    im = Image.fromarray(img).resize((W // 2, H // 2), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    fx, fy = (FRAME_X - EX0) * KF // 2, (FRAME_Y - EY0) * KF // 2
    d.rectangle([((S.CX0 - EX0) * KF // 2, (S.CY0 - EY0) * KF // 2), (fx, fy)], outline=(255, 0, 0))
    for n in ORDER:
        for P, col in ((BASES[n], (255, 0, 0)), (TIPS[n], (0, 130, 0))):
            X, Y = (P[0] - EX0) * KF / 2, (P[1] - EY0) * KF / 2
            d.ellipse([(X - 5, Y - 5), (X + 5, Y + 5)], outline=col, width=2)
    im.save(WORK / name)


def diag_separate(full, dets, name="feuilles_separees.png"):
    tiles = []
    for n in ORDER:
        f = full[n]
        ys, xs = np.nonzero(f)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sl = (slice(y0, y1), slice(x0, x1))
        img = np.full((y1 - y0, x1 - x0, 3), 250, np.uint8)
        if n == "ecailles":
            img[(dets[n] & f)[sl]] = rgb_of(n)
        else:
            img[f[sl]] = rgb_of(n)
            if n in dets:
                img[(dets[n] & f)[sl]] = (255, 255, 255)
        t = Image.fromarray(img)
        t.resize((t.width // 2, t.height // 2), Image.LANCZOS).save(WORK / f"feuille_{n}.png")
        tiles.append(t.resize((t.width // 4, t.height // 4), Image.LANCZOS))
    W = sum(t.width for t in tiles) + 10 * len(tiles)
    H = max(t.height for t in tiles)
    sheet = Image.new("RGB", (W, H), (200, 200, 200))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width + 10
    sheet.save(WORK / name)


def check_composition(full, dets, vis, det, inside):
    """La composition complétée, vue dans le cadre, doit rester celle de l'affiche."""
    img = compose(full, dets)
    H, W = inside.shape
    ref = np.zeros((H, W), np.int8) - 1
    got = np.zeros((H, W), np.int8) - 1
    for k, n in enumerate(ORDER):
        ref[vis[n] | (det[n] if n in det else False)] = k
    for k, n in enumerate(ORDER):
        m = dets["ecailles"] & full[n] if n == "ecailles" else full[n]
        got[m] = k
    zone = inside & (ref >= 0)
    ok = (ref == got) & zone
    return float(ok.sum() / zone.sum())


# --------------------------------------------------------------------------------------------- pipeline
def build_masks(verbose=True):
    vis, det, inside = load_visible()
    full, designs, report = complete_shapes(vis, det, inside, verbose)
    rng = np.random.default_rng(20131111)
    dets = {}
    dets["turquoise"], nv = extend_turquoise(det["turquoise"], full["turquoise"])
    dets["prune"], n1 = copy_strokes(det["prune"], full["prune"], vis["prune"] | det["prune"], 66.0, rng,
                                     pool=lambda p: p[0][:, 0].mean() > 2800)
    det_a, nva = extend_aqua_veins(det["aqua"], full["aqua"])
    dets["aqua"], n2 = copy_strokes(det_a, full["aqua"], vis["aqua"] | det_a, 70.0, rng,
                                    margin=22.0, pool=lambda p: p[2] < 700 and p[0][:, 0].mean() > 3000,
                                    density=0.8)
    band_vis = solid_of("ecailles", vis, det)
    dets["ecailles"] = extend_net(vis["ecailles"], full["ecailles"], band_vis)
    if verbose:
        print(f"  nervures prolongées : turquoise {nv}, aqua {nva} ; tirets ajoutés : prune {n1}, aqua {n2}")
        print(f"  composition dans le cadre identique à l'affiche : {check_composition(full, dets, vis, det, inside) * 100:.2f} % des pixels")
    return vis, det, inside, full, dets, designs


if __name__ == "__main__":
    vis, det, inside, full, dets, designs = build_masks()
    diag(full, dets)
    diag_separate(full, dets)
    np.savez_compressed(WORK / "feuilles_full.npz", **{f"f_{k}": v for k, v in full.items()},
                        **{f"d_{k}": v for k, v in dets.items()})

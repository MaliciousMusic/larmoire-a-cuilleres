"""3. Le râtelier : osint/site/brand/2013_11_Cuilleres-copie.png (1813x1300, dix cuillères au trait).

Séparation des cuillères qui se chevauchent :
1. squelette des traits (agrandis 2x), graphe, jonctions proches contractées (un croisement = un nœud) ;
2. arêtes appariées par continuité de direction : un contour qui en croise un autre continue tout droit ;
3. attribution des arêtes à une cuillère :
   - LASSOS : pour les contours de cuilleron qui traversent un chevauchement, une courbe-guide grossière
     (relevée à la main sur des zooms quadrillés) ; le plus court chemin sur le squelette qui colle au guide
     est attribué à la cuillère (une arête peut appartenir à deux cuillères quand les contours se confondent),
   - ZONES : zones exclusives prudentes (manche, cœur du cuilleron),
   - propagation le long des chaînes pour le reste, puis EPINGLES (corrections ponctuelles) ;
4. traits d'une cuillère = pixels d'encre à moins d'une demi-largeur (+ marge) de ses arêtes / lassos ;
5. RACCORDS : parties de contour cachées (sous les hachures d'une voisine) complétées par des courbes ;
6. silhouette = intérieur du contour (trous remplis après fermeture) ; tracé potrace 3x.
"""
import math
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from skimage.morphology import skeletonize

import skel
from vec import *

SRC = "osint/site/brand/2013_11_Cuilleres-copie.png"
KS = 2  # agrandissement pour le squelette / l'attribution
KT = 3  # agrandissement pour le tracé
LINE_LUMA = 0.217
N = 10

# zones exclusives (x0, y0, x1, y1) par cuillère (repère source), prudentes : bien à l'intérieur des parties
# qui n'appartiennent qu'à une cuillère
ZONES = {
    1: [(345, 195, 420, 800), (316, 795, 440, 866), (305, 960, 425, 1100)],
    2: [(452, 185, 605, 470), (485, 470, 563, 840), (475, 1000, 590, 1150)],
    3: [(605, 205, 718, 560), (628, 560, 700, 760), (605, 760, 695, 925), (630, 930, 695, 1000)],
    4: [(720, 195, 830, 790), (745, 960, 840, 1070)],
    5: [(845, 195, 940, 640), (870, 640, 930, 760), (870, 780, 935, 950)],
    6: [(955, 215, 1050, 410), (1000, 410, 1045, 840), (965, 880, 1025, 1075), (1025, 1030, 1075, 1080)],
    7: [(1075, 220, 1136, 760), (1048, 870, 1080, 960)],
    8: [(1150, 240, 1270, 375), (1170, 375, 1215, 860), (1185, 960, 1250, 1112)],
    9: [(1270, 265, 1332, 376), (1245, 376, 1347, 700), (1285, 700, 1330, 760), (1270, 880, 1365, 1030)],
    10: [(1352, 250, 1440, 640), (1390, 640, 1470, 720), (1400, 720, 1540, 935)],
}

# lassos : (cuillère, [(x, y), ...]) — guide le long d'un contour, du col gauche au col droit
LASSOS = [
    # 1 : jante extérieure (au « baiser » avec le 2, le trait de gauche)
    (1, [(365, 871), (335, 874), (315, 890), (304, 925), (302, 960), (306, 1005), (318, 1042), (337, 1072),
         (360, 1092), (382, 1097), (400, 1092), (420, 1070), (433, 1048), (440, 1025), (443, 1005), (443, 985),
         (446, 965), (448, 945), (445, 920), (437, 900), (422, 885), (405, 873), (390, 868)]),
    # 2 : contour du cuilleron (au « baiser » avec le 1, le trait de droite)
    (2, [(497, 897), (480, 903), (466, 914), (456, 930), (455, 950), (453, 970), (450, 990), (447, 1003),
         (450, 1025), (458, 1050), (470, 1080), (487, 1112), (505, 1137), (521, 1148), (537, 1140),
         (557, 1120), (572, 1090), (583, 1060), (594, 1030), (598, 1000), (599, 970), (597, 958), (595, 945),
         (590, 933), (583, 922), (574, 914), (563, 905), (552, 898)]),
    # 3 : contour extérieur du cuilleron
    (3, [(622, 757), (600, 770), (586, 800), (579, 840), (580, 880), (588, 915), (601, 945), (620, 970),
         (645, 983), (668, 982), (686, 968), (698, 950), (708, 925), (715, 900), (719, 880), (721, 860),
         (723, 836), (721, 818), (715, 800), (708, 788), (698, 776), (690, 770)]),
    # 3 : jante intérieure, flanc droit (dans la lentille, elle se confond avec la jante intérieure du 4)
    (3, [(705, 800), (710, 806), (713, 818), (716, 830), (716, 846), (713, 862), (711, 880), (709, 895),
         (707, 910), (704, 925), (698, 938), (690, 948), (681, 960), (672, 968)]),
    # 4 : jante extérieure puis jante intérieure
    (4, [(768, 812), (760, 820), (752, 826), (743, 831), (735, 836), (727, 841), (720, 848), (713, 855),
         (707, 862), (701, 872), (699, 885), (697, 900), (697, 930), (700, 960), (706, 990), (721, 1020), (741, 1045), (765, 1060), (790, 1064), (815, 1056), (840, 1032), (855, 1000),
         (862, 962), (863, 922), (858, 882), (846, 857), (826, 836), (807, 818), (795, 802)]),
    (4, [(772, 816), (765, 824), (757, 832), (749, 840), (741, 846), (733, 852), (726, 857), (719, 864),
         (714, 872), (711, 880), (709, 895), (706, 910), (705, 925), (706, 945), (708, 960), (712, 975),
         (717, 990), (733, 1015), (750, 1037), (775, 1050), (800, 1050), (822, 1040), (838, 1018), (848, 990),
         (852, 950), (850, 910), (842, 880), (830, 858), (812, 838), (797, 818)]),
    # 5 : contour du cuilleron
    (5, [(856, 746), (838, 755), (824, 770), (817, 795), (814, 830), (817, 870), (826, 905), (840, 932),
         (860, 953), (887, 965), (912, 962), (932, 948), (946, 926), (956, 900), (962, 870), (965, 835),
         (962, 800), (954, 772), (940, 752), (928, 745)]),
    # 6 : contour du cuilleron (à droite, le trait droit de la « lentille » formée avec le 8)
    (6, [(1018, 838), (995, 843), (975, 856), (960, 875), (952, 900), (950, 930), (952, 960), (962, 990),
         (975, 1020), (993, 1048), (1015, 1068), (1045, 1076), (1072, 1068), (1092, 1048), (1107, 1022),
         (1114, 997), (1119, 980), (1122, 955), (1121, 925), (1117, 903), (1104, 880), (1085, 860),
         (1074, 848)]),
    # 7 : contour extérieur, de la gauche du col jusqu'au bas (la suite passe sous les hachures du 8)
    (7, [(1100, 762), (1080, 772), (1058, 790), (1044, 812), (1042, 850), (1044, 900), (1050, 945),
         (1065, 975), (1090, 988), (1120, 991), (1142, 984)]),
    # 7 : côté droit, du col jusqu'aux hachures
    # 7 : flanc droit, trait intérieur (jusqu'au crochet en haut des hachures du 8)
    (7, [(1126, 766), (1130, 776), (1134, 786), (1142, 795), (1150, 804), (1158, 812), (1163, 822),
         (1167, 832), (1170, 845), (1172, 860), (1172, 870), (1170, 880), (1168, 893)]),
    # 7 : flanc droit, trait extérieur (longe le bord du manche du 8, puis descend jusqu'aux hachures)
    (7, [(1133, 770), (1140, 778), (1149, 784), (1157, 790), (1164, 800), (1170, 810), (1174, 820),
         (1178, 830), (1181, 845), (1182, 860), (1180, 875), (1178, 895), (1175, 915), (1170, 932),
         (1166, 944)]),
    # 8 : bas du bord gauche du manche (partagé avec le trait extérieur du 7)
    (8, [(1183, 790), (1183, 810), (1183, 830), (1182, 848), (1182, 862)]),
    # 7 : bord droit du sommet et du manche (le médaillon du 8 le chevauche)
    (7, [(1130, 222), (1145, 234), (1152, 242), (1155, 255), (1153, 270), (1152, 285), (1152, 300),
         (1150, 315), (1148, 327), (1145, 340), (1142, 355), (1140, 370), (1138, 385), (1135, 400),
         (1133, 417)]),
    # 9 : sommet, du bord gauche au bord droit (le bord droit se confond avec celui du 10 de y 290 à 400)
    # (le bord gauche passe sous l'anneau du médaillon du 8 : raccord ci-dessous)
    (9, [(1266, 281), (1270, 275), (1275, 268), (1283, 263), (1291, 261), (1298, 262), (1311, 267), (1322, 274), (1330, 280), (1334, 290), (1335, 305), (1337, 325),
         (1340, 345), (1345, 365), (1348, 385), (1347, 405), (1344, 421), (1341, 439), (1339, 460)]),
    # 10 : sommet, bord gauche
    (10, [(1367, 242), (1358, 247), (1350, 255), (1344, 262), (1340, 270), (1338, 280), (1339, 290),
          (1343, 305), (1347, 325), (1351, 345), (1351, 365), (1350, 385), (1354, 405), (1360, 418),
          (1368, 422)]),
    # 8 : contour du cuilleron (à gauche, le trait gauche de la « lentille »)
    (8, [(1182, 862), (1160, 868), (1140, 880), (1126, 897), (1117, 925), (1113, 955), (1113, 983),
         (1118, 1003), (1125, 1030), (1140, 1065), (1160, 1095), (1185, 1110), (1210, 1108), (1235, 1090),
         (1252, 1060), (1262, 1020), (1265, 980), (1262, 940), (1252, 905), (1235, 880), (1215, 865),
         (1203, 860)]),
]

# épingles : (x, y, cuillères) — l'arête la plus proche du point est attribuée à ces cuillères
EPINGLES = [
    (436, 1021, [1]), (441, 1028, [1]),  # sous le « baiser » 1/2 : la double jante du 1 qui part à gauche
]

# exclusions : (cuillère, polygone) — pixels retirés du masque de la cuillère (morceaux d'un trait épais
# voisin happés par un contour qui le traverse)
EXCLUSIONS = [
    (2, [(438, 918), (449.5, 918), (449.5, 956), (438, 956)]),  # croissant du 1 au « baiser »
    (6, [(1043, 823), (1070, 823), (1070, 842), (1043, 842)]),  # bande sombre du 7 au col du 6
]

# raccords : (cuillère, [(x, y), ...], épaisseur en px source) — contours cachés complétés
RACCORDS = [
    # 6 : l'épaule droite du cuilleron passe sous la bande sombre du 7
    (6, [(1040, 806), (1042, 818), (1046, 830), (1053, 839), (1062, 844), (1072, 847)], 2.5),
    # 7 : le bas du flanc droit passe sous les hachures du 8
    (7, [(1166, 944), (1160, 957), (1152, 970), (1143, 981)], 2.5),
    # 9 : le bord gauche du sommet passe sous l'anneau tressé du médaillon du 8
    (9, [(1266, 281), (1261, 297), (1256, 322), (1251, 348), (1248, 366), (1248, 378)], 2.5),
]

PAL = [(150, 150, 150), (230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180),
       (70, 200, 200), (240, 50, 230), (160, 130, 0), (0, 0, 128), (128, 0, 0)]


# --------------------------------------------------------------------------- graphe
def load():
    a = load_rgb(SRC)
    Y = luma(a)
    return np.clip((1 - Y) / (1 - LINE_LUMA), 0, 1)


def adaptive(ink, sigma=1.5, amax=1.5):
    """Seuil adaptatif : renforcement du contraste local (masque flou) pondéré par la densité d'encre.
    Les cellules gris clair des hachures (plus claires que leur voisinage) repassent sous 0,5 ; les traits
    isolés sur fond blanc (densité faible) ne bougent pas."""
    ink = ink.astype(np.float32)
    blur = cv2.GaussianBlur(ink, (0, 0), sigma)
    dens = cv2.GaussianBlur(ink, (0, 0), 3.0)
    a = amax * np.clip((dens - 0.35) / 0.3, 0, 1)
    return np.clip(ink + a * (ink - blur), 0, 1)


def graph(ink):
    big = upscale(ink, KS) > 0.5
    dist = ndi.distance_transform_edt(big)
    sk = skeletonize(big)
    nodes, edges = skel.skeleton_graph(sk)
    edges = skel.prune_spurs(nodes, edges, dist, factor=1.2, extra=2.0)
    nodes, edges = skel.contract_short_edges(nodes, edges, dist, factor=1.6, extra=2.0)
    edges = skel.prune_spurs(nodes, edges, dist, factor=1.2, extra=2.0)
    partner = skel.pair_edges(nodes, edges, dist, max_turn_deg=60.0)
    seqs = skel.chain_edge_seqs(edges, partner)
    return big, dist, nodes, edges, seqs, sk  # squelette brut (sans trou) pour les lassos


def edge_xy(e):
    p = np.asarray(e[2], float)
    return np.stack([(p[:, 1] + 0.5) / KS, (p[:, 0] + 0.5) / KS], 1)


# --------------------------------------------------------------------------- lassos
def catmull(pts, n=10):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    P = np.vstack([pts[0], pts, pts[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return np.asarray(out)


def lasso_path(sk, guide, sigma=6.0, reach=24):
    """Plus court chemin sur les pixels du squelette (grille KS) collant à la courbe-guide (repère source).
    Coût d'un pas = longueur x (1 + (écart au guide / sigma)^2) ; seuls les pixels à moins de `reach` du
    guide sont admis. Renvoie la liste des pixels (y, x) de la grille KS."""
    g = catmull(guide) * KS - 0.5
    h, w = sk.shape
    x0, y0 = int(max(0, g[:, 0].min() - reach - 4)), int(max(0, g[:, 1].min() - reach - 4))
    x1, y1 = int(min(w, g[:, 0].max() + reach + 5)), int(min(h, g[:, 1].max() + reach + 5))
    sub = sk[y0:y1, x0:x1]
    gm = np.zeros(sub.shape, np.uint8)
    q = np.round((g - [x0, y0]) * 16).astype(np.int32)
    cv2.polylines(gm, [q], False, 1, 1, cv2.LINE_8, shift=4)
    d = ndi.distance_transform_edt(gm == 0)
    ok = sub & (d <= reach)
    ys, xs = np.nonzero(ok)
    idx = -np.ones(sub.shape, np.int64)
    idx[ys, xs] = np.arange(len(ys))
    rows, cols, wts = [], [], []
    for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        yy, xx = ys + dy, xs + dx
        m = (yy < sub.shape[0]) & (xx >= 0) & (xx < sub.shape[1])
        m2 = m.copy()
        m2[m] = ok[yy[m], xx[m]]
        a = idx[ys[m2], xs[m2]]
        b = idx[yy[m2], xx[m2]]
        cost = math.hypot(dy, dx) * (1 + ((d[ys[m2], xs[m2]] + d[yy[m2], xx[m2]]) / 2 / sigma) ** 2)
        rows += [a, b]
        cols += [b, a]
        wts += [cost, cost]
    G = coo_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))),
                   shape=(len(ys), len(ys))).tocsr()

    def nearest(pt):
        dd = (xs - (pt[0] - x0)) ** 2 + (ys - (pt[1] - y0)) ** 2
        return int(np.argmin(dd))

    pts_k = np.asarray(guide, float) * KS - 0.5
    path = []
    for a_, b_ in zip(pts_k[:-1], pts_k[1:]):
        s_, t_ = nearest(a_), nearest(b_)
        dist_, pred = dijkstra(G, indices=s_, return_predecessors=True, directed=False)
        if not np.isfinite(dist_[t_]):
            print(f"  lasso : pas de chemin entre {np.round((a_ + .5) / KS)} et {np.round((b_ + .5) / KS)}")
            continue
        seg = []
        v = t_
        while v != s_ and v >= 0:
            seg.append(v)
            v = pred[v]
        seg.append(s_)
        path += seg[::-1]
    return [(int(ys[v] + y0), int(xs[v] + x0)) for v in path]


def run_lassos(sk_all):
    lasso_pix, paths = {}, []
    for sp, guide in LASSOS:
        path = lasso_path(sk_all, guide)
        paths.append((sp, path))
        for p in path:
            lasso_pix.setdefault(p, set()).add(sp)
    return lasso_pix, paths


# --------------------------------------------------------------------------- attribution
def assign(edges, seqs, lasso_pix):
    """owners[i] = ensemble de cuillères de l'arête i."""
    n = len(edges)
    owners = [set() for _ in range(n)]
    lengths = np.zeros(n)
    for i, e in enumerate(edges):
        xy = edge_xy(e)
        seg = np.hypot(*np.diff(xy, axis=0).T) if len(xy) > 1 else np.array([0.5])
        mid = (xy[1:] + xy[:-1]) / 2 if len(xy) > 1 else xy
        lengths[i] = seg.sum()
        best, bs = 0, 0.0
        for s, boxes in ZONES.items():
            inside = np.zeros(len(mid), bool)
            for (x0, y0, x1, y1) in boxes:
                inside |= (mid[:, 0] >= x0) & (mid[:, 0] <= x1) & (mid[:, 1] >= y0) & (mid[:, 1] <= y1)
            f = float(seg[inside].sum()) / max(1e-6, float(seg.sum()))
            if f > bs:
                best, bs = s, f
        if bs >= 0.5:
            owners[i] = {best}
    fixed = set()
    # lassos : une arête dont la moitié des pixels est sur le chemin d'un lasso appartient à sa cuillère
    for i, e in enumerate(edges):
        hits = {}
        for p in e[2]:
            for sp in lasso_pix.get(p, ()):
                hits[sp] = hits.get(sp, 0) + 1
        got = {sp for sp, c in hits.items() if c >= 0.5 * len(e[2])}
        if got:
            owners[i] = got
            fixed.add(i)
    # épingles
    for (x, y, ss) in EPINGLES:
        bi, bd = None, 1e9
        for i, e in enumerate(edges):
            xy = edge_xy(e)
            d = float(np.min(np.hypot(xy[:, 0] - x, xy[:, 1] - y)))
            if d < bd:
                bi, bd = i, d
        if bd > 6:
            print(f"  épingle ({x}, {y}) loin de toute arête ({bd:.1f} px)")
        owners[bi] = set(ss)
        fixed.add(bi)
    # propagation le long des chaînes (depuis les arêtes attribuées à une seule cuillère)
    for seq, closed in seqs:
        idx = [i for i, _ in seq]
        m = len(idx)
        if m == 1:
            continue
        cum = np.concatenate([[0], np.cumsum([lengths[i] for i in idx])])
        centers = (cum[:-1] + cum[1:]) / 2
        known = [k for k in range(m) if len(owners[idx[k]]) == 1]
        if not known:
            continue
        for k in range(m):
            if owners[idx[k]]:
                continue
            if closed:
                L = cum[-1]
                dd = [min(abs(centers[k] - centers[j]), L - abs(centers[k] - centers[j])) for j in known]
            else:
                dd = [abs(centers[k] - centers[j]) for j in known]
            j = known[int(np.argmin(dd))]
            owners[idx[k]] = set(owners[idx[j]])
    # arêtes isolées restantes : zone la plus proche
    for i, e in enumerate(edges):
        if owners[i]:
            continue
        c = edge_xy(e).mean(axis=0)
        best, bd = 0, 1e9
        for s, boxes in ZONES.items():
            for (x0, y0, x1, y1) in boxes:
                d = math.hypot(max(x0 - c[0], 0, c[0] - x1), max(y0 - c[1], 0, c[1] - y1))
                if d < bd:
                    best, bd = s, d
        owners[i] = {best}
    return owners, fixed


# --------------------------------------------------------------------------- masques
def node_owner_map(nodes, edges, owners, shape):
    """Carte (grille KS) : indice d'arête + 1 pour chaque pixel du squelette. Les pixels de nœud proches
    (<= 4 px) d'une arête la prennent ; plus loin (intérieur des gros nœuds fusionnés : grilles de
    hachures), ils prennent l'arête incidente la plus longue du propriétaire majoritaire du nœud."""
    lab = np.zeros(shape, np.int32)
    for i, e in enumerate(edges):
        p = np.asarray(e[2])
        lab[p[:, 0], p[:, 1]] = i + 1
    d, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
    near = lab[iy, ix]
    inc = {}
    for i, (a, b, path) in enumerate(edges):
        for n in (a, b):
            if n >= 0:
                inc.setdefault(n, []).append(i)
    lengths = [len(e[2]) for e in edges]
    for n, (cy, cx, pix) in nodes.items():
        p = np.asarray(pix)
        free = lab[p[:, 0], p[:, 1]] == 0
        if not free.any():
            continue
        q = p[free]
        rep = 0
        if n in inc:
            votes = {}
            for i in inc[n]:
                for sp in owners[i]:
                    votes[sp] = votes.get(sp, 0) + 1
            if votes:
                best = max(votes, key=votes.get)
                cands = [i for i in inc[n] if best in owners[i]]
                rep = max(cands, key=lambda i: lengths[i]) + 1
        close = d[q[:, 0], q[:, 1]] <= 4
        vals = np.where(close | (rep == 0), near[q[:, 0], q[:, 1]], rep)
        lab[q[:, 0], q[:, 1]] = vals
    return lab


def to_T(yx):
    """pixels (y, x) de la grille KS -> grille KT."""
    yx = np.asarray(yx, float)
    return np.round((yx + 0.5) * KT / KS - 0.5).astype(int)


def spoon_masks(ink, nodes, edges, owners, lasso_paths):
    hS, wS = ink.shape[0] * KS, ink.shape[1] * KS
    lab = node_owner_map(nodes, edges, owners, (hS, wS))
    inkT = upscale(ink, KT) > 0.5
    distT = ndi.distance_transform_edt(inkT)
    ys, xs = np.nonzero(lab)
    edge_idx = lab[ys, xs] - 1
    PT = to_T(np.stack([ys, xs], 1))
    PT[:, 0] = np.clip(PT[:, 0], 0, inkT.shape[0] - 1)
    PT[:, 1] = np.clip(PT[:, 1], 0, inkT.shape[1] - 1)
    extra = {}
    for sp, path in lasso_paths:
        if path:
            extra.setdefault(sp, []).append(to_T(path))
    masks = {}
    for sp in range(1, N + 1):
        sel = np.array([sp in owners[i] for i in edge_idx])
        pts = [PT[sel]] + extra.get(sp, [])
        P = np.concatenate(pts)
        P[:, 0] = np.clip(P[:, 0], 0, inkT.shape[0] - 1)
        P[:, 1] = np.clip(P[:, 1], 0, inkT.shape[1] - 1)
        if len(P) == 0:
            masks[sp] = np.zeros(inkT.shape, bool)
            continue
        y0, y1 = max(0, P[:, 0].min() - 40), min(inkT.shape[0], P[:, 0].max() + 41)
        x0, x1 = max(0, P[:, 1].min() - 40), min(inkT.shape[1], P[:, 1].max() + 41)
        skm = np.zeros((y1 - y0, x1 - x0), bool)
        skm[P[:, 0] - y0, P[:, 1] - x0] = True
        d, (iy, ix) = ndi.distance_transform_edt(~skm, return_indices=True)
        hw = distT[y0:y1, x0:x1][iy, ix]
        m = inkT[y0:y1, x0:x1] & (d <= hw + 2.0)
        full = np.zeros(inkT.shape, bool)
        full[y0:y1, x0:x1] = m
        masks[sp] = full
    # encre orpheline (bouts de trait élagués, taches) : à la cuillère du pixel attribué le plus proche
    union = np.zeros(inkT.shape, np.int16)
    for sp in range(1, N + 1):
        union[masks[sp] & (union == 0)] = sp
    orphan = inkT & (union == 0)
    if orphan.any():
        _, (iy, ix) = ndi.distance_transform_edt(union == 0, return_indices=True)
        near = union[iy, ix]
        # seulement si la tache touche (ou presque) des pixels attribués : sinon elle reste orpheline
        dd = ndi.distance_transform_edt(union == 0)
        for sp in range(1, N + 1):
            masks[sp] |= orphan & (near == sp) & (dd <= 6 * KT)
    return masks, inkT


def apply_exclusions(masks):
    for sp, poly in EXCLUSIONS:
        m = np.zeros(masks[sp].shape, np.uint8)
        q = np.round((np.asarray(poly, float) * KT - 0.5) * 16).astype(np.int32)
        cv2.fillPoly(m, [q], 1, cv2.LINE_8, shift=4)
        masks[sp] = masks[sp] & (m == 0)
    return masks


def draw_raccords(masks):
    for sp, pts, width in RACCORDS:
        c = catmull(pts, 12)
        m = masks[sp].astype(np.uint8)
        q = np.round((c * KT - 0.5) * 16).astype(np.int32)
        cv2.polylines(m, [q], False, 1, max(1, int(round(width * KT))), cv2.LINE_AA, shift=4)
        masks[sp] = m > 0
    return masks


def clean_masks(masks):
    """Écarte les débris : composantes du masque d'une cuillère qui ne touchent pas la silhouette de sa
    composante principale (morceaux de traits voisins happés aux croisements)."""
    out, dropped = {}, {}
    for sp, m in masks.items():
        lab, n = ndi.label(m, structure=np.ones((3, 3)))
        if n <= 1:
            out[sp], dropped[sp] = m, 0
            continue
        sizes = ndi.sum(m, lab, range(1, n + 1))
        main = lab == 1 + int(np.argmax(sizes))
        core = ndi.binary_dilation(silhouette(main), iterations=KT)
        keep_ids = [i for i in range(1, n + 1) if (core & (lab == i)).any()]
        keep = np.isin(lab, keep_ids)
        out[sp] = keep
        dropped[sp] = int((m & ~keep).sum())
    return out, dropped


def silhouette(mask, close_px=2):
    r = int(close_px * KT)
    m = ndi.binary_closing(np.pad(mask, r + 2), iterations=r)[r + 2:-(r + 2), r + 2:-(r + 2)]
    return ndi.binary_fill_holes(m | mask)


# --------------------------------------------------------------------------- contrôles visuels
def debug_edges(edges, owners, ink, name, box=None, zoom=1, label=False, fixed=()):
    h, w = ink.shape
    x0, y0, x1, y1 = box or (0, 0, w, h)
    sub = ink[y0:y1, x0:x1]
    img = np.full(((y1 - y0) * zoom, (x1 - x0) * zoom, 3), 255, np.uint8)
    img[upscale(sub, zoom) > 0.5] = (222, 222, 222)
    for i, (e, o) in enumerate(zip(edges, owners)):
        xy = edge_xy(e)
        if xy[:, 0].max() < x0 or xy[:, 0].min() > x1 or xy[:, 1].max() < y0 or xy[:, 1].min() > y1:
            continue
        q = np.round((xy - [x0, y0]) * zoom * 16).astype(np.int32)
        ol = sorted(o)
        col = PAL[ol[0]] if ol else PAL[0]
        cv2.polylines(img, [q], False, col, 1 if zoom == 1 else 2, cv2.LINE_AA, shift=4)
        if len(ol) > 1:
            cv2.polylines(img, [q], False, PAL[ol[1]], 1, cv2.LINE_8, shift=4)
    im = Image.fromarray(img)
    if label:
        d = ImageDraw.Draw(im)
        for i, e in enumerate(edges):
            xy = edge_xy(e)
            c = xy[len(xy) // 2]
            if x0 <= c[0] < x1 and y0 <= c[1] < y1 and len(xy) > 3:
                d.text(((c[0] - x0) * zoom + 2, (c[1] - y0) * zoom - 5), str(i),
                       fill=(255, 0, 0) if i in fixed else (0, 0, 0))
    im.save(WORK / name)


def debug_lassos(paths, ink, name):
    img = np.full(ink.shape + (3,), 255, np.uint8)
    img[ink > 0.5] = (205, 205, 205)
    a = np.asarray(Image.fromarray(img).resize((ink.shape[1] * KS, ink.shape[0] * KS), Image.NEAREST)).copy()
    for sp, path in paths:
        p = np.asarray(path)
        if len(p):
            a[p[:, 0], p[:, 1]] = PAL[sp]
    Image.fromarray(a).save(WORK / name)


def debug_one(sp, masks, sils, inkT, name, zoom=1.0, box=None):
    """noir = traits de la cuillère, gris = autres cuillères, rouge = encre orpheline, rose = silhouette,
    bleu = raccords (tracés en plus de l'encre)."""
    union = np.zeros(inkT.shape, bool)
    for s_ in masks:
        union |= masks[s_]
    m, sil = masks[sp], sils[sp]
    ys, xs = np.nonzero(m)
    y0, y1 = max(0, ys.min() - 30), min(inkT.shape[0], ys.max() + 31)
    x0, x1 = max(0, xs.min() - 30), min(inkT.shape[1], xs.max() + 31)
    if box:
        x0, y0, x1, y1 = [v * KT for v in box]
    img = np.full((y1 - y0, x1 - x0, 3), 255, np.uint8)
    sl = (slice(y0, y1), slice(x0, x1))
    img[sil[sl]] = (255, 215, 215)
    img[(inkT & union & ~m)[sl]] = (185, 185, 185)
    img[(inkT & ~union)[sl]] = (255, 0, 0)
    img[(m & inkT)[sl]] = (0, 0, 0)
    img[(m & ~inkT)[sl]] = (0, 90, 255)
    im = Image.fromarray(img)
    f = zoom / KT
    im = im.resize((int(im.width * f), int(im.height * f)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    step = 10 if box else 20
    for yy in range((y0 // KT // step + 1) * step, y1 // KT, step):
        d.text((1, (yy * KT - y0) * f), str(yy), fill=(0, 120, 0))
        if box:
            d.line([(0, (yy * KT - y0) * f), (im.width, (yy * KT - y0) * f)], fill=(170, 220, 170))
    for xx in range((x0 // KT // step + 1) * step, x1 // KT, step):
        d.text(((xx * KT - x0) * f, 1), str(xx), fill=(0, 120, 0))
        if box:
            d.line([((xx * KT - x0) * f, 0), ((xx * KT - x0) * f, im.height)], fill=(170, 220, 170))
    im.save(WORK / name)


def debug_sheet(masks, sils, name):
    tiles = []
    for sp in range(1, N + 1):
        m, s = masks[sp], sils[sp]
        ys, xs = np.nonzero(s | m)
        if len(ys) == 0:
            continue
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        img = np.full((y1 - y0, x1 - x0, 3), 255, np.uint8)
        img[s[y0:y1, x0:x1]] = (255, 225, 225)
        img[m[y0:y1, x0:x1]] = (40, 40, 40)
        tile = Image.fromarray(img)
        tiles.append(tile.resize((max(1, tile.width // KT), max(1, tile.height // KT)), Image.LANCZOS))
    W = sum(t.width for t in tiles) + 10 * len(tiles)
    H = max(t.height for t in tiles)
    sheet = Image.new("RGB", (W, H), (200, 230, 220))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width + 10
    sheet.save(WORK / name)


# --------------------------------------------------------------------------- pipeline
def separate(verbose=True):
    ink = load()
    big, dist, nodes, edges, seqs, sk_all = graph(ink)
    lasso_pix, lasso_paths = run_lassos(sk_all)
    owners, fixed = assign(edges, seqs, lasso_pix)
    masks, inkT = spoon_masks(ink, nodes, edges, owners, lasso_paths)
    masks = apply_exclusions(masks)
    # masques définitifs sur l'encre au seuil adaptatif (hachures ouvertes), restreints à chaque cuillère
    inkA = upscale(adaptive(ink), KT) > 0.5
    for sp in masks:
        masks[sp] = inkA & ndi.binary_dilation(masks[sp], iterations=2)
    inkT = inkA
    masks = draw_raccords(masks)
    masks, dropped = clean_masks(masks)
    sils = {sp: silhouette(masks[sp]) for sp in masks}
    if verbose:
        union = np.zeros(inkT.shape, bool)
        for sp in masks:
            union |= masks[sp]
        print("débris écartés (px à 3x) : " + ", ".join(f"{k}:{v}" for k, v in dropped.items() if v))
        print(f"{len(edges)} arêtes, {len(seqs)} chaînes ; encre non attribuée : "
              f"{100 * (inkT & ~union).sum() / inkT.sum():.3f} %")
    return dict(ink=ink, nodes=nodes, edges=edges, owners=owners, fixed=fixed, masks=masks, sils=sils,
                inkT=inkT, lasso_paths=lasso_paths)


LINE_COLOR = "#373837"  # gris-noir du dessin d'origine (55, 56, 55)


def register_cuillere(masks):
    """La grande cuillère (2020_04_cuillere_grand.png) est un extrait de la cuillère n° 2 du râtelier :
    transformation affine (ECC, pyramide de flous) de son repère (cuillere.json, repère « coins ») vers les
    pixels du râtelier (repère « coins »). Renvoie la matrice 2x3 et la corrélation."""
    sd = load_json("cuillere.json")
    a = load_rgba("osint/site/brand/2020_04_cuillere_grand.png")
    x0, y0 = sd["crop"]
    W0, H0 = sd["viewBox"][2], sd["viewBox"][3]
    ink_src = np.clip(a[..., 3] * (1 - luma(a[..., :3])) / 0.9, 0, 1)[y0:y0 + H0, x0:x0 + W0].astype(np.float32)
    ink = load().astype(np.float32)
    m2 = masks[2]
    m2s = cv2.resize(m2.astype(np.float32), (m2.shape[1] // KT, m2.shape[0] // KT), interpolation=cv2.INTER_AREA)
    ys, xs = np.nonzero(m2s > 0.5)
    X0, Y0, X1, Y1 = xs.min() - 10, ys.min() - 10, xs.max() + 11, ys.max() + 11
    tmpl = ink[Y0:Y1, X0:X1] * (cv2.GaussianBlur(m2s[Y0:Y1, X0:X1], (0, 0), 2) > 0.05)
    ys, xs = np.nonzero(tmpl > 0.5)
    ys2, xs2 = np.nonzero(ink_src > 0.5)
    sc = (ys.max() - ys.min()) / (ys2.max() - ys2.min())
    warp = np.array([[1 / sc, 0, xs2.mean() - xs.mean() / sc], [0, 1 / sc, ys2.mean() - ys.mean() / sc]], np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 2000, 1e-9)
    cc = 0.0
    for sig in (6, 3, 1.5, 0.8):
        cc, warp = cv2.findTransformECC(cv2.GaussianBlur(tmpl, (0, 0), sig), cv2.GaussianBlur(ink_src, (0, 0), sig),
                                        warp.copy(), cv2.MOTION_AFFINE, crit, None, 5)
    A = np.linalg.inv(np.vstack([warp, [0, 0, 1]]))[:2]  # grande cuillère (centres) -> gabarit (centres)
    A[0, 2] += X0
    A[1, 2] += Y0
    Mc = A.copy()
    Mc[:, 2] = A[:, 2] - 0.5 * A[:, :2].sum(axis=1) + 0.5  # repère « coins »
    return Mc, float(cc), sd


TOL_LINES = 0.2  # opttolerance potrace (px source)
COMPACT = 0.3  # écart maximal toléré par la compaction (px source)
SCALE = 0.5  # unités du repère publié = 2 px source (1 décimale = 0,2 px : nombres plus courts)
TURD = 0.5  # taches et trous plus petits que TURD px² (repère source) supprimés


def build(verbose=True, cache=False):
    cache_f = WORK / "rack_masks.npz"
    if cache and cache_f.exists():
        z = np.load(cache_f)
        masks = {sp: z[f"m{sp}"] for sp in range(1, N + 1)}
        sils = {sp: z[f"s{sp}"] for sp in range(1, N + 1)}
        inkT = z["ink"]
    else:
        R = separate(verbose)
        masks, sils, inkT = R["masks"], R["sils"], R["inkT"]
        np.savez_compressed(cache_f, ink=inkT, **{f"m{sp}": masks[sp] for sp in masks},
                            **{f"s{sp}": sils[sp] for sp in sils})
    # repère final : cadre serré de l'ensemble (marge 3 px), ramené à l'origine
    allm = np.zeros(inkT.shape, bool)
    for sp in masks:
        allm |= masks[sp] | sils[sp]
    ys, xs = np.nonzero(allm)
    ox, oy = math.floor(xs.min() / KT) - 3, math.floor(ys.min() / KT) - 3
    W = math.ceil(xs.max() / KT) - ox + 4
    H = math.ceil(ys.max() / KT) - oy + 4
    spoons = []
    prev_lines = np.zeros(inkT.shape, bool)
    svg_groups = []
    # raccords (parties cachées complétées) : dans la composition, la silhouette découpée d'une cuillère ne
    # préserve que les traits RÉELS des précédentes, de sorte qu'un raccord repasse sous la voisine
    rac = draw_raccords({sp: np.zeros(inkT.shape, bool) for sp in range(1, N + 1)})
    for sp in range(1, N + 1):
        m, sil = masks[sp], sils[sp]
        yy, xx = np.nonzero(sil | m)
        y0, y1 = max(0, yy.min() - 6), min(inkT.shape[0], yy.max() + 7)
        x0, x1 = max(0, xx.min() - 6), min(inkT.shape[1], xx.max() + 7)
        off = (x0 / KT - ox, y0 / KT - oy)
        lines = fix_orientation(trace(m[y0:y1, x0:x1], KT, offset=off, opttolerance=TOL_LINES,
                                      turdsize=int(TURD * KT * KT)))
        lines = compact(lines, COMPACT)
        # silhouette rentrée de 2/3 px : elle reste sous le contour
        fill_m = ndi.binary_erosion(sil, iterations=2)
        fill = [c for c in fix_orientation(trace(fill_m[y0:y1, x0:x1], KT, offset=off, opttolerance=0.4))
                if c.sign]
        fill = compact(fill, 1.0)
        # silhouette « découpée » pour la composition : elle ne masque pas les traits des cuillères
        # précédentes (le dessin d'origine montre les deux contours dans les chevauchements)
        cut_m = fill_m & ~ndi.binary_dilation(prev_lines, iterations=1)
        cut = compact(fix_orientation(trace(cut_m[y0:y1, x0:x1], KT, offset=off, opttolerance=0.4)), 0.5)
        prev_lines |= m & ~ndi.binary_dilation(rac[sp], iterations=KT)
        Sm = [[SCALE, 0, 0], [0, SCALE, 0]]
        extra = {}
        if sp == 2:
            # n° 2 = la grande cuillère : ses chemins sont reportés dans le râtelier (un seul tracé partagé)
            Mc, cc, sd = register_cuillere(masks)
            Mo = np.array([[SCALE, 0, -ox * SCALE], [0, SCALE, -oy * SCALE]]) @ np.vstack([Mc, [0, 0, 1]])
            lines = transform_curves(parse_d(sd["lines"]), Mo)
            fill = transform_curves(parse_d(sd["fill"]), Mo)
            extra["fromCuillere"] = [round(float(v), 5) for v in (Mo[0, 0], Mo[1, 0], Mo[0, 1], Mo[1, 1],
                                                                   Mo[0, 2], Mo[1, 2])]
            if verbose:
                print(f"  cuillère  2 : grande cuillère recalée (ECC {cc:.4f}, échelle "
                      f"{float(np.hypot(Mc[0, 0], Mc[1, 0])):.4f})")
        else:
            lines, fill = transform_curves(lines, Sm), transform_curves(fill, Sm)
        cut = transform_curves(cut, Sm)
        # point d'accroche : sommet du manche (point le plus haut de la silhouette)
        P = np.vstack([c.points(8) for c in fill])
        top = P[:, 1].min()
        near = P[P[:, 1] <= top + 1.0]
        hook = [r1(near[:, 0].mean()), r1(top)]
        d_lines, d_fill = curves_to_d(lines), curves_to_d(fill)
        bb = curves_bbox(fill + lines)
        spoons.append(dict({"id": f"cuillere-{sp}", "fill": d_fill, "lines": d_lines, "bbox": bb, "hook": hook},
                           **extra))
        svg_groups.append(
            f'<g id="cuillere-{sp}">\n<path class="c-fond" fill="#FFFFFF" d="{curves_to_d(cut)}"/>\n'
            f'<path class="c-trait" fill="{LINE_COLOR}" d="{d_lines}"/>\n</g>')
        if verbose:
            print(f"  cuillère {sp:2d} : {sum(len(c.segs) for c in lines):5d} segments de traits, "
                  f"cadre {bb}, accroche {hook}, {len(d_lines) + len(d_fill)} car.")
    data = {"viewBox": [0, 0, r1(W * SCALE), r1(H * SCALE)], "source": SRC, "origin": [ox, oy],
            "scale": SCALE, "lineColor": LINE_COLOR, "spoons": spoons}
    dump_json(data, "cuilleres.json")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r1(W * SCALE)} {r1(H * SCALE)}" width="{W}" height="{H}">\n'
           f"<title>L'Armoire à Cuillères — le râtelier</title>\n" + "\n".join(svg_groups) + "\n</svg>\n")
    (OUT / "cuilleres.svg").write_text(svg, encoding="utf-8")
    # contrôle : rendu Chrome comparé à la source
    render_svg_file(OUT / "cuilleres.svg", WORK / "cuilleres_chrome.png", W, H)
    src = load()[oy:oy + H, ox:ox + W]
    got = np.asarray(Image.open(WORK / "cuilleres_chrome.png").convert("L")).astype(float) / 255
    got_ink = np.clip((1 - got[:src.shape[0], :src.shape[1]]) / (1 - LINE_LUMA), 0, 1)
    diff = np.abs(got_ink - src)
    if verbose:
        print(f"  rendu Chrome vs source : écart moyen {diff.mean() * 255:.2f}/255, "
              f"pixels > 0,5 : {(diff > 0.5).mean() * 100:.2f} %, IoU 1x {iou(got_ink, src):.4f}")
    Image.fromarray((np.clip(diff * 2, 0, 1) * 255).astype(np.uint8)).save(WORK / "cuilleres_chrome_diff.png")
    return data


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "build":
        build(cache=len(args) > 1)
        sys.exit()
    R = separate()
    debug_edges(R["edges"], R["owners"], R["ink"], "rack_edges.png")
    debug_lassos(R["lasso_paths"], R["ink"], "rack_lassos.png")
    debug_sheet(R["masks"], R["sils"], "rack_spoons.png")
    if len(args) >= 5:
        x0, y0, x1, y1 = map(int, args[:4])
        z = float(args[4])
        debug_edges(R["edges"], R["owners"], R["ink"], "rack_edges_zoom.png", (x0, y0, x1, y1), int(z),
                    label=True, fixed=R["fixed"])
        if len(args) >= 6:
            debug_one(int(args[5]), R["masks"], R["sils"], R["inkT"], "rack_one_zoom.png", zoom=z,
                      box=(x0, y0, x1, y1))
    else:
        for sp in range(1, N + 1):
            debug_one(sp, R["masks"], R["sils"], R["inkT"], f"rack_s{sp}.png", zoom=1.5)

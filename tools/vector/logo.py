"""1. Le logo complet.

Lettrage : osint/site/_logo_cover_crop.png (1008x604, lettres blanches sur menthe #67E8CC, tiré de la
couverture Facebook 2018). Les lettres qui se touchent dans le dessin (A/O, R/I, R/R, M/R, A/accent du È,
U/E, I/S) sont séparées par de courtes lignes de coupe tracées à la main le long du contour naturel.

Cuillère : c'est le même dessin que osint/site/brand/2020_04_cuillere_grand.png (et que la cuillère n° 2
du râtelier). La transformation affine (ECC, corrélation 0,989, échelle 0,627, rotation nulle) est estimée
entre l'encre de la grande cuillère et celle du logo, puis les chemins de la grande cuillère (cuillere.json)
sont reportés dans le logo : plus fidèle que retracer une cuillère de 100 px de large dans un JPEG, et
cohérent avec l'ordre de tracé AC.BRAND.cuillere.strokes (matrice fromCuillere).

Sortie : _work/data/logo.json + assets/brand/logo.svg, logo-noir.svg, logo-blanc.svg, logo-teal.svg
"""
import cv2
import numpy as np
from scipy import ndimage as ndi

from vec import *

SRC = "osint/site/_logo_cover_crop.png"
K = 4
MINT = np.array([103, 232, 204]) / 255

# lettres dans l'ordre de lecture : (id, caractère, graines (x, y) dans la source)
LETTERS = [
    ("l-L1", "L", [(20, 180)]),
    ("l-apos", "’", [(99, 140)]),
    ("l-A1", "A", [(128, 150)]),
    ("l-R1", "R", [(208, 150)]),
    ("l-M", "M", [(362, 180)]),
    ("l-O", "O", [(122, 330)]),
    ("l-I1", "I", [(210, 330)]),
    ("l-R2", "R", [(241, 330)]),
    ("l-E1", "E", [(320, 330)]),
    ("l-A2", "À", [(538, 174), (518, 250)]),
    ("l-C", "C", [(628, 220)]),
    ("l-U", "U", [(707, 200)]),
    ("l-I2", "I", [(802, 220)]),
    ("l-L2", "L", [(835, 200)]),
    ("l-L3", "L", [(926, 200)]),
    ("l-E2", "È", [(538, 303), (524, 400)]),
    ("l-R3", "R", [(598, 380)]),
    ("l-E3", "E", [(676, 380)]),
    ("l-S", "S", [(748, 360)]),
]
# graines des accents (pour exposer l'accent seul dans les données)
ACCENTS = {"l-A2": (538, 174), "l-E2": (538, 303)}

# lignes de coupe (x, y) le long du contour naturel des lettres qui se touchent
CUTS = [
    [(121, 235), (142, 230)],  # jambe gauche du A / haut du O
    [(170, 235), (186, 244)],  # jambe droite du A / épaule du O
    [(200, 252.5), (219, 250.5)],  # fût du R / haut du I
    [(244, 241), (258, 236)],  # jambe du R / haut du R de OIRE
    [(284, 239), (298, 253)],  # fût gauche du M / panse du R de OIRE
    [(354, 252.5), (372, 256.5)],  # pied du M / barre du E de OIRE
    [(526, 283), (526, 309)],  # fût du A / accent du È (le long du fût)
    [(714, 307), (729, 312)],  # bas du U / barre du E
    [(792, 289), (814, 292)],  # pied du I / arc du S
]


def spoon_zone(Y):
    """Silhouette de la cuillère dans la couverture : traits sombres fermés + remplissage."""
    dark = Y < 120 / 255
    sp = ndi.binary_fill_holes(ndi.binary_closing(dark, iterations=3))
    return sp, dark


def segment_letters(white_big):
    """white_big : masque des lettres agrandi K fois. Renvoie {id: masque}."""
    barrier = np.zeros(white_big.shape, np.uint8)
    for (x0, y0), (x1, y1) in CUTS:
        v = np.array([x1 - x0, y1 - y0], float)
        v /= np.linalg.norm(v)
        a = (np.array([x0, y0]) - 2.5 * v) * K
        b = (np.array([x1, y1]) + 2.5 * v) * K
        cv2.line(barrier, tuple(np.round(a * 16).astype(int)), tuple(np.round(b * 16).astype(int)), 1, 2,
                 cv2.LINE_8, shift=4)
    cut = white_big & (barrier == 0)
    lab, n = ndi.label(cut)
    out = {}
    used = {}
    for lid, ch, seeds in LETTERS:
        m = np.zeros(cut.shape, bool)
        for (x, y) in seeds:
            v = lab[int(y * K), int(x * K)]
            if v == 0:
                raise SystemExit(f"graine hors lettre : {lid} {(x, y)}")
            if v in used and used[v] != lid:
                raise SystemExit(f"{lid} partage une composante avec {used[v]} : coupe manquante")
            used[v] = lid
            m |= lab == v
        out[lid] = m
    # composantes orphelines (miettes) : rattachées à la lettre la plus proche si assez grosses
    orphans = [v for v in range(1, n + 1) if v not in used]
    if orphans:
        sizes = ndi.sum(np.ones_like(lab), lab, orphans)
        for v, s in zip(orphans, sizes):
            if s < 8 * K * K:
                continue
            ys, xs = np.nonzero(lab == v)
            best, bd = None, 1e9
            for lid, m in out.items():
                d = ndi.distance_transform_edt(~m)[ys[0], xs[0]]
                if d < bd:
                    best, bd = lid, d
            out[best] |= lab == v
            print(f"  miette de {s / K / K:.0f} px rattachée à {best}")
    # on referme la coupe : chaque lettre reprend les pixels de la barrière qui la touchent
    for lid in out:
        grown = ndi.binary_dilation(out[lid], iterations=2) & white_big
        out[lid] = out[lid] | (grown & (barrier > 0))
    return out, lab


def register_spoon(Y, spoon_data):
    """Recale l'encre de la grande cuillère sur la cuillère du logo (ECC affine)."""
    import skel  # noqa: F401  (même dossier)
    a = load_rgba("osint/site/brand/2020_04_cuillere_grand.png")
    x0, y0 = spoon_data["crop"]
    W, H = spoon_data["viewBox"][2], spoon_data["viewBox"][3]
    ink_src = np.clip(a[..., 3] * (1 - luma(a[..., :3])) / 0.9, 0, 1)[y0:y0 + H, x0:x0 + W]
    # encre du logo : sombre par rapport au blanc (intérieur) ou au menthe (extérieur)
    ink_logo = np.clip((0.78 - Y) / (0.78 - 0.15), 0, 1)
    sp, dark = spoon_zone(Y)
    ys, xs = np.nonzero(dark & ndi.binary_dilation(sp, iterations=3))
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    sys_, sxs = np.nonzero(ink_src > 0.5)
    s = (by1 - by0) / (sys_.max() + 1 - sys_.min())
    tx = bx0 - sxs.min() * s
    ty = by0 - sys_.min() * s
    # gabarit : voisinage de la cuillère dans le logo ; warp : gabarit -> source (convention ECC)
    cx0, cy0 = max(0, bx0 - 15), max(0, by0 - 8)
    cx1, cy1 = min(Y.shape[1], bx1 + 15), min(Y.shape[0], by1 + 8)
    M0 = np.array([[1 / s, 0, (cx0 - tx) / s], [0, 1 / s, (cy0 - ty) / s]], np.float32)
    tmpl = cv2.GaussianBlur(ink_logo[cy0:cy1, cx0:cx1].astype(np.float32), (0, 0), 1.0)
    inp = cv2.GaussianBlur(ink_src.astype(np.float32), (0, 0), 1.0 / s)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 1000, 1e-8)
    cc, warp = cv2.findTransformECC(tmpl, inp, M0.copy(), cv2.MOTION_AFFINE, crit, None, 5)
    A = np.vstack([warp, [0, 0, 1]])
    Minv = np.linalg.inv(A)[:2]  # source -> gabarit
    Minv[0, 2] += cx0
    Minv[1, 2] += cy0  # -> logo
    return Minv, cc, ink_logo, sp


def build(verbose=True):
    rgb = load_rgb(SRC)
    Y = luma(rgb)
    Hs, Ws = Y.shape
    sp, dark = spoon_zone(Y)
    whiteness = np.clip((Y - luma(MINT[None, None, :])[0, 0]) / (1 - luma(MINT[None, None, :])[0, 0]), 0, 1)
    whiteness[ndi.binary_dilation(sp, iterations=2)] = 0
    white_big = upscale(whiteness, K) > 0.5
    masks, lab = segment_letters(white_big)
    save_segmentation(masks, white_big.shape)

    letters = []
    all_curves = []
    for lid, ch, seeds in LETTERS:
        cs = compact(fix_orientation(trace(masks[lid], K, opttolerance=0.2, turdsize=K * K)), 0.25)
        all_curves += cs
        entry = {"id": lid, "char": ch, "d": curves_to_d(cs), "bbox": curves_bbox(cs), "_curves": cs}
        if lid in ACCENTS:
            ax, ay = ACCENTS[lid]
            # sous-chemin de l'accent : la courbe extérieure qui contient la graine de l'accent
            acc = [c for c in cs if c.sign and _contains(c, (ax, ay))]
            entry["accent"] = curves_to_d(acc)
        letters.append(entry)

    r = raster_curves(all_curves, white_big.shape, scale=K)
    s_let = iou(r, white_big.astype(float))
    overlay(white_big, r, "logo_letters_overlay_x4.png")
    if verbose:
        print(f"logo : {len(letters)} lettres, {sum(len(c.segs) for c in all_curves)} segments, IoU x4 {s_let:.4f}")

    # cuillère recalée : l'encre et l'alpha de la grande cuillère sont rééchantillonnés dans le repère
    # du logo (grille K fois plus fine), puis tracés comme le reste
    sd = load_json("cuillere.json")
    M, cc, ink_logo, spz = register_spoon(Y, sd)
    sx = float(np.hypot(M[0, 0], M[1, 0]))
    sy = float(np.hypot(M[0, 1], M[1, 1]))
    rot = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
    if verbose:
        print(f"      cuillère recalée : ECC {cc:.4f}, échelle {sx:.4f} x {sy:.4f}, rotation {rot:.2f}°,"
              f" translation ({M[0, 2]:.1f}, {M[1, 2]:.1f})")
    # la cuillère du logo EST la grande cuillère : ses chemins (cuillere.json) sont reportés dans le logo par
    # la transformation estimée. M (ECC) relie des centres de pixels ; en repère « coins » :
    # l = A (s - 1/2) + t + 1/2
    Mc = M.copy()
    Mc[:, 2] = M[:, 2] - 0.5 * M[:, :2].sum(axis=1) + 0.5
    sp_lines = transform_curves(parse_d(sd["lines"]), Mc)
    sp_fill = transform_curves(parse_d(sd["fill"]), Mc)

    # contrôle de la cuillère : encre du logo (sombre) contre traits recalés
    r_sp = raster_curves(sp_lines, (Hs, Ws))
    zone = ndi.binary_dilation(spz, iterations=4)
    ref = (ink_logo > 0.5) & zone
    s_sp = iou(r_sp * zone, ref.astype(float))
    overlay(ref, r_sp * zone, "logo_spoon_overlay.png")
    if verbose:
        print(f"      cuillère : {sum(len(c.segs) for c in sp_lines)} segments, IoU (1x, contre le JPEG) {s_sp:.4f}")

    # repère final : cadre serré (marge 2) ramené à l'origine
    allc = all_curves + sp_fill + sp_lines
    bb = curves_bbox(allc)
    ox, oy = np.floor(bb[0]) - 2, np.floor(bb[1]) - 2
    Wv, Hv = int(np.ceil(bb[2] - ox + 2)), int(np.ceil(bb[3] - oy + 2))
    Tm = np.array([[1, 0, -ox], [0, 1, -oy]], float)
    for L in letters:
        cs = transform_curves(L.pop("_curves"), Tm)
        L["d"] = curves_to_d(cs)
        L["bbox"] = curves_bbox(cs)
        if "accent" in L:
            ax, ay = ACCENTS[L["id"]]
            acc = [c for c in cs if c.sign and _contains(c, (ax - ox, ay - oy))]
            L["accent"] = curves_to_d(acc)
            L["base"] = curves_to_d([c for c in cs if not any(c is a_ for a_ in acc)])
    sp_fill = transform_curves(sp_fill, Tm)
    sp_lines = transform_curves(sp_lines, Tm)
    spoon = {"fill": curves_to_d(sp_fill), "lines": curves_to_d(sp_lines), "bbox": curves_bbox(sp_fill)}
    # repère de la grande cuillère -> repère du logo (pour réutiliser cuillere.strokes dans le logo)
    Mlogo = Mc.copy()
    Mlogo[0, 2] -= ox
    Mlogo[1, 2] -= oy
    spoon["fromCuillere"] = [round(float(v), 5) for v in (Mlogo[0, 0], Mlogo[1, 0], Mlogo[0, 1], Mlogo[1, 1],
                                                           Mlogo[0, 2], Mlogo[1, 2])]
    data = {"viewBox": [0, 0, Wv, Hv], "source": SRC, "origin": [float(ox), float(oy)],
            "letters": letters, "spoon": spoon}
    dump_json(data, "logo.json")
    write_svgs(data)
    # rendu Chrome à l'échelle de la source, sur menthe, pour comparaison
    render_svg_file(OUT / "logo-blanc.svg", WORK / "logo_chrome.png", Wv, Hv, bg="#67E8CC")
    ref_img = (rgb[int(oy):int(oy) + Hv, int(ox):int(ox) + Wv] * 255).astype(np.uint8)
    from PIL import Image
    got = np.asarray(Image.open(WORK / "logo_chrome.png").convert("RGB"))[:ref_img.shape[0], :ref_img.shape[1]]
    diff = np.abs(got.astype(int) - ref_img.astype(int)).mean(axis=2)
    if verbose:
        print(f"      rendu Chrome vs source : écart moyen {diff.mean():.2f}/255, "
              f"pixels > 64 : {(diff > 64).mean() * 100:.2f} %")
    Image.fromarray(np.clip(diff * 3, 0, 255).astype(np.uint8)).save(WORK / "logo_chrome_diff.png")
    return data


LOGO_COLORS = {"teal": "#6AB8C6", "noir": "#1A1919", "blanc": "#FFFFFF"}


def svg_doc(data, letters_fill="currentColor", title="L'Armoire à Cuillères", with_ids=True):
    W, H = data["viewBox"][2], data["viewBox"][3]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"'
           f' role="img" aria-label="{title}">',
           f"<title>{title}</title>",
           f'<g id="lettrage" fill="{letters_fill}">']
    for L in data["letters"]:
        idattr = f' id="{L["id"]}"' if with_ids else ""
        out.append(f'<path{idattr} d="{L["d"]}"/>')
    out.append("</g>")
    sp = data["spoon"]
    out.append('<g id="cuillere">')
    out.append(f'<path class="c-fond" fill="#FFFFFF" d="{sp["fill"]}"/>')
    out.append(f'<path class="c-trait" fill="#1A1919" d="{sp["lines"]}"/>')
    out.append("</g>")
    out.append("</svg>")
    return "\n".join(out) + "\n"


def write_svgs(data):
    (OUT / "logo.svg").write_text(svg_doc(data), encoding="utf-8")
    for name, col in LOGO_COLORS.items():
        (OUT / f"logo-{name}.svg").write_text(svg_doc(data, col), encoding="utf-8")


def _contains(curve, pt):
    p = curve.points(8)
    return cv2.pointPolygonTest(p.astype(np.float32).reshape(-1, 1, 2), (float(pt[0]), float(pt[1])), False) >= 0


def save_segmentation(masks, shape):
    from PIL import Image
    h, w = shape
    img = np.full((h, w, 3), 245, np.uint8)
    rng = np.random.default_rng(11)
    for lid, m in masks.items():
        img[m] = rng.integers(40, 210, 3)
    Image.fromarray(img).resize((w // 2, h // 2), Image.BILINEAR).save(WORK / "logo_segmentation.png")


def check_logo2(data, verbose=True):
    """Recoupement : lettrage vectorisé contre le logo teal 2018 (osint/site/brand/2018_07_Logo2.png), après
    recalage affine (ECC). Écrit _work/logo_vs_logo2.png (noir = accord, rouge / bleu = écarts)."""
    W, H = data["viewBox"][2], data["viewBox"][3]
    cs = []
    for L in data["letters"]:
        cs += parse_d(L["d"])
    mine = raster_curves(cs, (H, W)).astype(np.float32)
    a = load_rgba("osint/site/brand/2018_07_Logo2.png")
    teal = np.array([106, 184, 198]) / 255
    lt = (a[..., 3] * (np.sqrt(((a[..., :3] - teal) ** 2).sum(-1)) < 0.25)).astype(np.float32)
    ys, xs = np.nonzero(lt > 0.5)
    sub = lt[ys.min() - 5:ys.max() + 6, xs.min() - 5:xs.max() + 6]
    my_ys, my_xs = np.nonzero(mine > 0.5)
    sc = (my_xs.max() - my_xs.min()) / (xs.max() - xs.min())
    big = cv2.resize(sub, (int(sub.shape[1] * sc), int(sub.shape[0] * sc)), interpolation=cv2.INTER_CUBIC)
    Hc, Wc = max(big.shape[0], H) + 40, max(big.shape[1], W) + 40
    A = np.zeros((Hc, Wc), np.float32)
    B = np.zeros((Hc, Wc), np.float32)
    A[20:20 + H, 20:20 + W] = mine
    oy, ox = 20 + my_ys.min() - int(5 * sc), 20 + my_xs.min() - int(5 * sc)
    B[oy:oy + big.shape[0], ox:ox + big.shape[1]] = big[:Hc - oy, :Wc - ox]
    warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 500, 1e-7)
    cc = 0.0
    for sig in (4, 2, 1):
        cc, warp = cv2.findTransformECC(cv2.GaussianBlur(A, (0, 0), sig), cv2.GaussianBlur(B, (0, 0), sig), warp,
                                        cv2.MOTION_AFFINE, crit, None, 5)
    Bw = cv2.warpAffine(B, warp, (Wc, Hc), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
    score = iou(A, Bw)
    a_, b_ = A > 0.5, Bw > 0.5
    img = np.full((Hc, Wc, 3), 255, np.uint8)
    img[a_ & b_] = (0, 0, 0)
    img[a_ & ~b_] = (230, 30, 30)
    img[~a_ & b_] = (30, 90, 240)
    from PIL import Image
    Image.fromarray(img).save(WORK / "logo_vs_logo2.png")
    if verbose:
        print(f"      recoupement avec 2018_07_Logo2.png : corrélation {cc:.4f}, IoU du lettrage {score:.4f}")
    return score


if __name__ == "__main__":
    check_logo2(build())

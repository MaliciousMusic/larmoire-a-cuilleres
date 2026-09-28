"""4. Les tasses empilées : osint/site/brand/2018_09_CouvFacebook2.jpg (3546x1313, CMJN -> RVB).

Dessin au trait blanc sur menthe #67E8CC, au centre du bandeau (x 930..2270). La bande claire du haut du
bandeau (y < 21) est un voile : le dessin s'y voit, lu avec le fond de la bande comme référence. Le dessin est
coupé par le bord supérieur de l'image (y = 0), où le repère commence.

Traits : « blancheur » = (luminance - menthe) / (blanc - menthe), agrandie 2x (bicubique), seuil 0,5 ;
potrace (alphamax 1, opttolerance 0,2) puis compaction (écart <= 0,35 px).
Silhouette : intérieur des contours (trous remplis) ; la coupure du haut est refermée le long du bord ;
les jours (fond visible dans les anses, entre les deux piles) sont évidés à partir de graines (JOURS).
Contrôle : affiche 2013_12_FFF.jpg (la pile de droite, en teal, plus petite).
"""
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from vec import *

SRC = "osint/site/brand/2018_09_CouvFacebook2.jpg"
X0, X1 = 930, 2270  # zone du dessin dans la source
BAND = 21  # bande claire en haut du bandeau : le dessin s'y voit en transparence, sur un fond plus clair
BAND_Y = 223.0 / 255  # luminance du fond dans la bande
K = 2
TOL = 0.25  # opttolerance potrace (px source)
COMPACT = 0.55  # écart maximal toléré par la compaction (px source)
SCALE = 0.5  # unités du repère publié = 2 px source (1 décimale = 0,2 px)
TURD = 0.5  # taches / trous plus petits que TURD px² supprimés
MINT_Y = 190.2 / 255
MINT = "#67E8CC"

# jours : graines (x, y) dans la source des régions fermées qui sont du fond (pas de la vaisselle)
JOURS = [
    (1200, 45),  # anse de la théière (entre l'anse et le corps)
    (1040, 370), (1100, 305),  # anse gauche de la 2e tasse
    (1070, 910),  # anse gauche de la tasse du bas
    (1580, 990),  # triangle entre les deux piles
    (1640, 640), (1620, 540), (1680, 575), (1702, 565), (1710, 590), (1690, 700),  # anse droite, 3e tasse
    (2045, 440),  # anse de la tasse du haut, pile de droite
    (2090, 715),  # anse de la 2e tasse, pile de droite
    (2045, 965),  # anse de la tasse du bas, pile de droite
]


def load():
    rgb = load_rgb(SRC)
    Y = luma(rgb)
    w = np.clip((Y - MINT_Y) / (1 - MINT_Y), 0, 1)
    w[:BAND] = np.clip((Y[:BAND] - BAND_Y) / (1 - BAND_Y), 0, 1)
    return w[:, X0:X1]


def silhouette_mask(w):
    """Silhouette au repère source (zone X0..X1)."""
    m = w > 0.5
    row = np.nonzero(m[0])[0]
    m2 = m.copy()
    m2[0, row.min():row.max() + 1] = True  # coupure du haut (bord de l'image) refermée
    fill = ndi.binary_fill_holes(m2)
    holes = fill & ~m2
    lab, n = ndi.label(holes)
    for (x, y) in JOURS:
        v = lab[y, x - X0]
        if v == 0:
            # graine sur un trait : région voisine la plus grande
            win = lab[y - 4:y + 5, x - X0 - 4:x - X0 + 5]
            vals, cnt = np.unique(win[win > 0], return_counts=True)
            if not len(vals):
                print(f"  graine de jour ({x}, {y}) hors région")
                continue
            v = vals[np.argmax(cnt)]
        fill[lab == v] = False
        # le trait qui borde le jour reste dans la silhouette (fill contient m2)
    return fill


def build(verbose=True):
    w = load()
    H0, W0 = w.shape
    big = upscale(w, K) > 0.5
    lab, n = ndi.label(big, structure=np.ones((3, 3)))
    sizes = ndi.sum(big, lab, range(1, n + 1))
    main = lab == 1 + int(np.argmax(sizes))
    # enveloppe du dessin : le corps de la théière est ouvert par le bord haut de l'image -> on referme
    # l'enveloppe le long de ce bord (sinon les roses isolées posées sur la théière seraient écartées)
    cols = np.nonzero(main[:int(3 * K)].any(axis=0))[0]
    pad = int(10 * K)
    mp = np.pad(main, pad)
    mp[pad, pad + cols.min():pad + cols.max() + 1] = True
    env = ndi.binary_fill_holes(ndi.binary_closing(mp, iterations=int(6 * K)))[pad:-pad, pad:-pad]
    keep = np.zeros(big.shape, bool)
    for i, sl in enumerate(ndi.find_objects(lab)):
        comp = lab[sl] == i + 1
        if (env[sl] & comp).sum() >= 0.5 * comp.sum():
            keep[sl] |= comp
    ys, xs = np.nonzero(keep)
    # repère final : x depuis le bord gauche du dessin (marge 2), y depuis la coupure du bandeau
    ox = X0 + int(np.floor(xs.min() / K)) - 2
    oy = 0
    Wv = X0 + int(np.ceil(xs.max() / K)) + 3 - ox
    Hv = int(np.ceil(ys.max() / K)) + 3 - oy
    off = (X0 - ox, -oy)
    lines = fix_orientation(trace(keep, K, offset=off, opttolerance=TOL, turdsize=int(TURD * K * K)))
    n_seg0 = sum(len(c.segs) for c in lines)
    lines = compact(lines, COMPACT, small_area=20.0, small_tol=0.6)
    sil = silhouette_mask(w)
    sil = ndi.binary_erosion(upscale(sil.astype(float), K) > 0.5, iterations=2)  # sous les traits
    fill = fix_orientation(trace(sil, K, offset=off, opttolerance=1.0))
    fill = compact(fill, 1.0)
    Sm = [[SCALE, 0, 0], [0, SCALE, 0]]
    lines, fill = transform_curves(lines, Sm), transform_curves(fill, Sm)
    d_lines, d_fill = curves_to_d(lines), curves_to_d(fill)
    if verbose:
        print(f"tasses : {len(lines)} courbes, {n_seg0} -> {sum(len(c.segs) for c in lines)} segments, "
              f"traits {len(d_lines)} car., silhouette {len(d_fill)} car. ; repère {Wv}x{Hv} depuis ({ox}, {oy})")
    data = {"viewBox": [0, 0, r1(Wv * SCALE), r1(Hv * SCALE)], "source": SRC, "origin": [ox, oy],
            "scale": SCALE, "ground": MINT,
            "lines": d_lines, "fill": d_fill, "bbox": curves_bbox(lines)}
    dump_json(data, "tasses.json")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r1(Wv * SCALE)} {r1(Hv * SCALE)}" width="{Wv}" height="{Hv}" '
           f'color="#FFFFFF">\n<title>L\'Armoire à Cuillères — les tasses</title>\n'
           f'<path class="t-fond" fill="{MINT}" fill-rule="evenodd" d="{d_fill}"/>\n'
           f'<path class="t-trait" fill="currentColor" d="{d_lines}"/>\n</svg>\n')
    (OUT / "tasses.svg").write_text(svg, encoding="utf-8")

    # contrôle : rendu Chrome sur menthe, comparé à la source
    render_svg_file(OUT / "tasses.svg", WORK / "tasses_chrome.png", Wv, Hv, bg=MINT)
    got = np.asarray(Image.open(WORK / "tasses_chrome.png").convert("RGB")).astype(float) / 255
    gw = np.clip((luma(got) - MINT_Y) / (1 - MINT_Y), 0, 1)
    ref = w[oy:oy + Hv, ox - X0:ox - X0 + Wv]
    gw = gw[:ref.shape[0], :ref.shape[1]]
    diff = np.abs(gw - ref)
    if verbose:
        print(f"  rendu Chrome vs source : écart moyen {diff.mean() * 255:.2f}/255, "
              f"pixels > 0,5 : {(diff > 0.5).mean() * 100:.2f} %, IoU {iou(gw, ref):.4f}")
    Image.fromarray((np.clip(diff * 2, 0, 1) * 255).astype(np.uint8)).save(WORK / "tasses_chrome_diff.png")
    # silhouette seule, pour contrôle
    render_png = WORK / "tasses_sil.png"
    sil_svg = WORK / "tasses_sil.svg"
    sil_svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r1(Wv * SCALE)} {r1(Hv * SCALE)}">'
                       f'<path fill="#3B2723" fill-rule="evenodd" d="{d_fill}"/>'
                       f'<path fill="#FFFFFF" d="{d_lines}"/></svg>', encoding="utf-8")
    render_svg_file(sil_svg, render_png, Wv // 2, Hv // 2, bg=MINT)
    return data


def check_fff(data, verbose=True):
    """Vérification : l'affiche 2013_12_FFF.jpg reprend la pile de droite (même dessin, en teal, plus petit).
    Le dessin de l'affiche est cherché (corrélation normalisée, plusieurs échelles) dans le rendu du vecteur ;
    superposition dans _work/tasses_vs_fff.png (noir = vecteur, teal = affiche, vert foncé = accord)."""
    from PIL import Image
    ref = load_rgb("osint/site/affiches/2013_12_FFF.jpg")
    ink = np.clip((0.93 - luma(ref)) / 0.35, 0, 1).astype(np.float32)
    ys, xs = np.nonzero(ink[192:400, 200:390] > 0.5)
    fy0, fy1, fx0, fx1 = 192 + ys.min(), 192 + ys.max() + 1, 200 + xs.min(), 200 + xs.max() + 1
    fff = ink[fy0:fy1, fx0:fx1]
    k = 0.3  # rendu du vecteur (unités publiées x 0,3)
    lines = transform_curves(parse_d(data["lines"]), [[k, 0, 0], [0, k, 0]])
    W, H = data["viewBox"][2], data["viewBox"][3]
    img = raster_curves(lines, (int(H * k) + 2, int(W * k) + 2)).astype(np.float32)
    imgb = cv2.GaussianBlur(img, (0, 0), 1.2)
    best = (-1, None, None, None)
    for sc in np.linspace(0.6, 1.6, 81):
        t = cv2.resize(fff, (int(fff.shape[1] * sc), int(fff.shape[0] * sc)), interpolation=cv2.INTER_CUBIC)
        if t.shape[0] >= img.shape[0] or t.shape[1] >= img.shape[1]:
            continue
        r = cv2.matchTemplate(imgb, cv2.GaussianBlur(t, (0, 0), 1.2), cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx > best[0]:
            best = (mx, sc, loc, t)
    score, sc, loc, t = best
    x, y = loc
    sub = img[y:y + t.shape[0], x:x + t.shape[1]]
    vis = np.full(t.shape + (3,), 255, np.uint8)
    a, b = sub > 0.4, t > 0.4
    vis[a] = (0, 0, 0)
    vis[b] = (106, 184, 198)
    vis[a & b] = (20, 110, 90)
    Image.fromarray(vis).resize((vis.shape[1] * 3, vis.shape[0] * 3), Image.NEAREST).save(WORK / "tasses_vs_fff.png")
    if verbose:
        print(f"  vérification avec 2013_12_FFF.jpg : la pile de l'affiche est retrouvée en x {x / k:.0f}..."
              f"{(x + t.shape[1]) / k:.0f} (pile de droite), corrélation normalisée {score:.3f}")
    return score


if __name__ == "__main__":
    check_fff(build())

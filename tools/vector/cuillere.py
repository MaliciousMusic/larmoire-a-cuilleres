"""2. La grande cuillère : osint/site/brand/2020_04_cuillere_grand.png (570x1089, RGBA).

Sortie : _work/data/cuillere.json (fill, lines, strokes, bbox, viewBox) + assets/brand/cuillere.svg
Repère : pixels de la source, recadrés sur la cuillère (marge 4 px).
"""
import sys

import numpy as np
from scipy import ndimage as ndi

import skel
from vec import *

SRC = "osint/site/brand/2020_04_cuillere_grand.png"
K = 4  # agrandissement de travail
TOL = 0.2  # opttolerance, en pixels source


def debug_strokes(strokes, ink, name, k=3):
    import cv2
    h, w = ink.shape
    img = np.full((h * k, w * k, 3), 255, np.uint8)
    img[upscale(ink, k) > 0.5] = (215, 215, 215)
    n = len(strokes)
    for i, s in enumerate(strokes):
        t = i / max(1, n - 1)
        col = (int(255 * t), 60, int(255 * (1 - t)))  # BGR : bleu (début) -> rouge (fin)
        q = np.round(np.asarray(s) * k * 16).astype(np.int32)
        cv2.polylines(img, [q], False, col, 2, cv2.LINE_AA, shift=4)
        x, y = np.asarray(s[0]) * k
        cv2.circle(img, (int(x), int(y)), 3, col, -1)
        cv2.putText(img, str(i), (int(x) + 3, int(y) - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, col, 1)
    Image.fromarray(img[..., ::-1]).save(WORK / name)


def build(verbose=True):
    a = load_rgba(SRC)
    al = a[..., 3]
    ink = al * (1 - luma(a[..., :3])) / 0.9  # 1 = trait plein
    ink = np.clip(ink, 0, 1)

    # tache parasite hors de la cuillère (x≈388, y≈296) : on ne garde que la composante principale
    lab, n = ndi.label(al > 0.02)
    sizes = ndi.sum(np.ones_like(al), lab, range(1, n + 1))
    main = lab == (1 + int(np.argmax(sizes)))
    main = ndi.binary_dilation(main, iterations=2)
    al = al * main
    ink = ink * main

    # recadrage (marge 4 px) : le repère final commence au coin du cadre
    ys, xs = np.nonzero(al > 0.02)
    x0, y0 = int(xs.min()) - 4, int(ys.min()) - 4
    x1, y1 = int(xs.max()) + 5, int(ys.max()) + 5
    al = al[y0:y1, x0:x1]
    ink = ink[y0:y1, x0:x1]
    H, W = al.shape

    big_ink = upscale(ink, K)
    big_al = upscale(al, K)
    lines_mask = big_ink > 0.5
    # silhouette rentrée de 1 px : elle reste sous le contour noir (pas de liseré blanc)
    fill_mask = ndi.binary_erosion(big_al > 0.5, iterations=K)

    lines = fix_orientation(trace(lines_mask, K, opttolerance=TOL, turdsize=K * K))
    lines = compact(lines, 0.25)
    fill = compact(fix_orientation(trace(fill_mask, K, opttolerance=0.3)), 0.5)
    fill = [c for c in fill if c.sign]  # silhouette pleine (pas de trou)

    # contrôle : rastérisation à K et IoU
    r_lines = raster_curves(lines, lines_mask.shape, scale=K)
    r_fill = raster_curves(fill, fill_mask.shape, scale=K)
    s1 = iou(r_lines, lines_mask.astype(float))
    s2 = iou(r_fill, fill_mask.astype(float))
    if verbose:
        print(f"cuillère : traits {len(lines)} courbes, {sum(len(c.segs) for c in lines)} segments, IoU {s1:.4f}")
        print(f"           silhouette {len(fill)} courbe(s), IoU {s2:.4f}")
    overlay(lines_mask, r_lines, "cuillere_overlay_x4.png")

    # squelette -> ordre de tracé
    strokes, info = skel.strokes_from_mask(ink > 0.5, ink, k=3, top_down=True, rdp_eps=1.4)
    if verbose:
        print(f"           squelette : {len(strokes)} traits, {sum(len(s) for s in strokes)} points, "
              f"largeur de masque conseillée {info['maskWidth']} (couverture {info['coverage']:.4f})")

    debug_strokes(strokes, ink, "cuillere_strokes.png")

    d_lines = curves_to_d(lines)
    d_fill = curves_to_d(fill)
    data = {
        "viewBox": [0, 0, W, H],
        "source": SRC,
        "crop": [x0, y0],
        "fill": d_fill,
        "lines": d_lines,
        "bbox": curves_bbox(fill),
        "strokes": [[[r1(x), r1(y)] for x, y in s] for s in strokes],
        "maskWidth": info["maskWidth"],
        "lineWidth": info["lineWidth"],
    }
    dump_json(data, "cuillere.json")

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
           f'<title>L\'Armoire à Cuillères — la cuillère</title>\n'
           f'<path class="c-fond" fill="#fff" d="{d_fill}"/>\n'
           f'<path class="c-trait" fill="#1a1919" d="{d_lines}"/>\n</svg>\n')
    (OUT / "cuillere.svg").write_text(svg, encoding="utf-8")

    # rendu Chrome à 2x pour contrôle visuel, comparé à la source
    render_svg_file(OUT / "cuillere.svg", WORK / "cuillere_chrome_x2.png", W * 2, H * 2, bg="#67E8CC")
    return data


if __name__ == "__main__":
    build()

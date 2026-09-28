"""5c. Feuilles : vectorisation des masques complétés, repères normalisés, sorties.

Entrée : _work/feuilles_full.npz (feuilles.py). Sorties : _work/data/feuilles.json + assets/brand/feuilles.svg

Repère de la composition : pixels de l'affiche, décalés de `origin` (le coin haut-gauche du dessin complété).
`frame` = le rectangle de l'affiche d'origine dans ce repère (la composition telle qu'elle était cadrée).
Repère normalisé d'une feuille : la base (pivot) en bas au centre (x = 0), la pointe vers le haut, hauteur
totale 100. `place` = matrice [a, b, c, d, e, f] (SVG) qui ramène le repère normalisé dans la composition.
"""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from vec import *
import feuilles as F

TOL_SHAPE = 0.5  # compaction des silhouettes (px affiche)
TOL_DETAIL = 0.3  # compaction des détails fins (nervures de 2-3 px)
# tolérance selon l'épaisseur des détails : tirets de la plume (5-6 px), fils du filet (8-10 px)
TOL_BY_LEAF = {"prune": 0.4, "ecailles": 0.45, "aqua": 0.3, "turquoise": 0.3}


def trace_mask(mask, tol, turd=2.0):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return []
    y0, y1 = max(0, ys.min() - 4), ys.max() + 5
    x0, x1 = max(0, xs.min() - 4), xs.max() + 5
    off = (x0 / F.KF + F.EX0, y0 / F.KF + F.EY0)
    cs = fix_orientation(trace(mask[y0:y1, x0:x1], F.KF, offset=off, opttolerance=0.3,
                               turdsize=int(turd * F.KF * F.KF)))
    return compact(cs, tol)


def components(mask, min_px=6.0):
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    out = []
    for j, sl in enumerate(ndi.find_objects(lab)):
        comp = np.zeros_like(mask)
        comp[sl] = lab[sl] == j + 1
        if comp.sum() / F.KF / F.KF >= min_px:
            out.append(comp)
    return out


def normal_frame(curves, base, tip):
    """Matrice composition -> normalisé : base en (0, yb), pointe vers le haut, hauteur 100."""
    base = np.asarray(base, float)
    tip = np.asarray(tip, float)
    v = tip - base
    ang = math.atan2(v[1], v[0])
    rot = -math.pi / 2 - ang  # la direction base->pointe devient (0, -1)
    rot = (rot + math.pi) % (2 * math.pi) - math.pi
    c, s = math.cos(rot), math.sin(rot)
    R = np.array([[c, -s], [s, c]])
    pts = np.vstack([cv.points(6) for cv in curves]) - base
    q = pts @ R.T
    ymin, ymax = q[:, 1].min(), q[:, 1].max()
    k = 100.0 / (ymax - ymin)
    # normalisé = k * R (p - base) + (0, -k * ymin)
    A = k * R
    t = -A @ base + np.array([0.0, -k * ymin])
    M = np.array([[A[0, 0], A[0, 1], t[0]], [A[1, 0], A[1, 1], t[1]]])
    return M, k, math.degrees(rot)


def apply(M, p):
    return (M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2], M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2])


def inverse(M):
    A = M[:, :2]
    Ai = np.linalg.inv(A)
    return np.hstack([Ai, (-Ai @ M[:, 2])[:, None]])


def d2(curves):
    """Repère normalisé (hauteur 100) : 2 décimales, soit ~0,1 à 0,2 px de l'affiche."""
    with with_prec(2):
        return curves_to_d(curves)


def build(verbose=True):
    Z = np.load(WORK / "feuilles_full.npz")
    full = {n: Z[f"f_{n}"] for n in F.ORDER}
    dets = {k[2:]: Z[k] for k in Z.files if k.startswith("d_")}
    items = {}
    allc = []
    for n in F.ORDER:
        if n == "ecailles":
            net = dets["ecailles"] & full[n]
            shape = trace_mask(net, TOL_BY_LEAF["ecailles"], turd=4.0)  # le filet lui-même (mailles = trous)
            band = trace_mask(full[n], TOL_SHAPE)
            det_list = []
        else:
            shape = trace_mask(full[n], TOL_SHAPE)
            band = None
            det_list = []
            if n in dets:
                comps = components(dets[n] & full[n])
                tip = np.asarray(F.TIPS[n], float)
                # du plus proche de la pointe au plus éloigné (ordre d'apparition pour une animation)
                keyed = []
                for cm in comps:
                    ys, xs = np.nonzero(cm)
                    c = np.array([xs.mean() / F.KF + F.EX0, ys.mean() / F.KF + F.EY0])
                    keyed.append((float(np.hypot(*(c - tip))), cm))
                keyed.sort(key=lambda t: t[0])
                det_list = [trace_mask(cm, TOL_BY_LEAF.get(n, TOL_DETAIL)) for _, cm in keyed]
                det_list = [d for d in det_list if d]
        items[n] = {"shape": shape, "band": band, "details": det_list}
        allc += shape
    # repère de la composition : cadre serré du dessin complété
    bb = curves_bbox(allc)
    ox, oy = math.floor(bb[0]) - 2, math.floor(bb[1]) - 2
    W, H = math.ceil(bb[2]) + 3 - ox, math.ceil(bb[3]) + 3 - oy
    T = np.array([[1, 0, -ox], [0, 1, -oy]], float)
    frame = [0, 0, F.FRAME_X - ox, F.FRAME_Y - oy]
    out_items = []
    svg_groups, svg_symbols = [], []
    for n in F.ORDER:
        it = items[n]
        base_c = apply(T, F.BASES[n])
        tip_c = apply(T, F.TIPS[n])
        shape_c = transform_curves(it["shape"], T)
        dets_c = [transform_curves(d, T) for d in it["details"]]
        M, k, rot = normal_frame(shape_c, base_c, tip_c)
        shape_n = transform_curves(shape_c, M)
        dets_n = [transform_curves(d, M) for d in dets_c]
        bbn = [round(v, 2) for v in np.array([c.bbox() for c in shape_n]).min(0)[:2].tolist() +
               np.array([c.bbox() for c in shape_n]).max(0)[2:].tolist()]
        half = max(abs(bbn[0]), abs(bbn[2]))
        half = math.ceil(half * 100) / 100
        pivot_n = [round(float(v), 2) for v in apply(M, base_c)]
        tip_n = [round(float(v), 2) for v in apply(M, tip_c)]
        P = inverse(M)  # normalisé -> composition
        entry = {
            "id": F.IDS_JS[n], "key": n, "label": F.LABELS[n], "fill": F.COLORS[n],
            "detailFill": F.DETAIL if dets_n else None,
            "d": d2(shape_n), "details": [d2(d) for d in dets_n],
            "viewBox": [-half, 0, round(2 * half, 2), 100], "pivot": pivot_n, "tip": tip_n, "bbox": bbn,
            "place": [round(float(v), 5) for v in (P[0, 0], P[1, 0], P[0, 1], P[1, 1], P[0, 2], P[1, 2])],
            "pivotComp": [r1(v) for v in base_c], "bboxComp": curves_bbox(shape_c),
            "angle": round(rot, 2), "scale": round(k, 5),
        }
        if it["band"]:
            band_n = transform_curves(transform_curves(it["band"], T), M)
            entry["band"] = d2(band_n)
        out_items.append(entry)
        # SVG : composition en clair (repère composition) + symboles normalisés
        gid = f"feuille-{n}"
        parts = [f'<g id="{gid}" data-pivot="{r1(base_c[0])} {r1(base_c[1])}">']
        parts.append(f'<path class="f-fond" fill="{F.COLORS[n]}" d="{curves_to_d(shape_c)}"/>')
        if dets_c:
            parts.append(f'<path class="f-detail" fill="{F.DETAIL}" d="{"".join(curves_to_d(d) for d in dets_c)}"/>')
        parts.append("</g>")
        svg_groups.append("\n".join(parts))
        sparts = [f'<symbol id="{gid}-seule" viewBox="{-half} 0 {round(2 * half, 2)} 100">']
        sparts.append(f'<path fill="{F.COLORS[n]}" d="{entry["d"]}"/>')
        if dets_n:
            sparts.append(f'<path fill="{F.DETAIL}" d="{"".join(entry["details"])}"/>')
        sparts.append("</symbol>")
        svg_symbols.append("\n".join(sparts))
        if verbose:
            nd = sum(len(x) for x in entry["details"])
            print(f"  {n:10s} : silhouette {len(entry['d']):5d} car., détails {len(entry['details']):3d} tracés "
                  f"{nd:6d} car. ; pivot {entry['pivotComp']} ; rotation {rot:7.2f}° ; échelle {k:.4f}")
    data = {"viewBox": [0, 0, W, H], "source": F.S.SRC, "origin": [ox, oy], "frame": frame,
            "order": [F.IDS_JS[n] for n in F.ORDER], "items": out_items}
    dump_json(data, "feuilles.json")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
           f"<title>L'Armoire à Cuillères — les feuilles</title>\n"
           f"<!-- composition de l'affiche 2013 (feuilles complétées) ; cadre d'origine : "
           f"x 0..{frame[2]}, y 0..{frame[3]} ; symboles #feuille-*-seule : chaque feuille seule, "
           f"base en bas au centre (pivot), hauteur 100 -->\n"
           f"<defs>\n" + "\n".join(svg_symbols) + "\n</defs>\n" + "\n".join(svg_groups) + "\n</svg>\n")
    (OUT / "feuilles.svg").write_text(svg, encoding="utf-8")
    # contrôles : rendu Chrome de la composition, recadré sur le cadre d'origine, comparé à la segmentation
    render_svg_file(OUT / "feuilles.svg", WORK / "feuilles_chrome.png", W, H, bg="#FAFAFA")
    return data


if __name__ == "__main__":
    build()

"""5a. Feuilles colorées : segmentation par couleur de osint/site/affiches/2013_11_Mallo_TestSite.jpg.

Les aplats sont des couleurs pures (écart-type nul dans le JPEG) : chaque pixel prend la couleur de
palette la plus proche (appartenance douce 1 - d/T, agrandie 2x en bicubique puis argmax) ; au-delà de T,
c'est la photo (la tasse), qui disparaît. Les blancs ne sont gardés que s'ils sont entourés par l'aplat
d'une feuille (le bord blanc de la tasse, vu à travers le filet d'écailles, est rejeté).

Sortie : _work/feuilles_seg.npz — masques visibles par feuille (repère 2x) + détails blancs par feuille.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from vec import *

SRC = "osint/site/affiches/2013_11_Mallo_TestSite.jpg"
CX0, CY0, CX1, CY1 = 2200, 1150, 3508, 2481  # zone des feuilles (bord droit et bas = cadre de l'affiche)
KF = 2  # agrandissement de travail
T = 70.0  # distance couleur maximale (RVB 0..255)

# couleurs mesurées dans l'affiche (écran) -> identifiants
PALETTE = {
    "turquoise": (75, 219, 254),  # feuille (a) ET filet d'écailles (d) : même couleur, séparés par position
    "prune": (108, 32, 143),
    "fuchsia": (255, 69, 255),
    "marine": (15, 57, 98),
    "aqua": (163, 241, 225),
    "blanc": (255, 255, 255),
}
NAMES = list(PALETTE)


def load_crop():
    rgb = load_rgb(SRC)[CY0:CY1, CX0:CX1] * 255
    return rgb


def segment(verbose=True):
    rgb = load_crop()
    H, W = rgb.shape[:2]
    soft = []
    for n in NAMES:
        d = np.sqrt(((rgb - np.array(PALETTE[n], float)) ** 2).sum(-1))
        soft.append(np.clip(1 - d / T, 0, 1))
    soft = np.stack(soft, -1)
    big = np.stack([upscale(soft[..., i], KF) for i in range(len(NAMES))], -1)
    lab = np.argmax(big, -1)
    lab[big.max(-1) < 0.5] = -1  # photo
    Hk, Wk = lab.shape

    masks = {n: lab == i for i, n in enumerate(NAMES)}
    # turquoise : feuille (a) = composante du haut ; écailles (d) = composantes du bas-gauche
    tq = masks.pop("turquoise")
    cl, nc = ndi.label(tq, structure=np.ones((3, 3)))
    sizes = ndi.sum(tq, cl, range(1, nc + 1))
    feuille_a = np.zeros_like(tq)
    ecailles = np.zeros_like(tq)
    for i, sl in enumerate(ndi.find_objects(cl)):
        cy = (sl[0].start + sl[0].stop) / 2 / KF + CY0
        if sizes[i] < 20:
            continue
        if cy < 1800:
            feuille_a |= cl == i + 1
        else:
            ecailles |= cl == i + 1
    masks["turquoise"] = feuille_a
    masks["ecailles"] = ecailles

    # blancs : chaque composante est attribuée à l'aplat qui l'entoure (anneau de 3 px) ; sinon rejetée
    wh = masks.pop("blanc")
    wl, nw = ndi.label(wh, structure=np.ones((3, 3)))
    details = {n: np.zeros_like(wh) for n in ("turquoise", "prune", "aqua")}
    rejected = 0
    for i, sl in enumerate(ndi.find_objects(wl)):
        sl2 = (slice(max(0, sl[0].start - 8), sl[0].stop + 8), slice(max(0, sl[1].start - 8), sl[1].stop + 8))
        comp = wl[sl2] == i + 1
        # anneau à distance 3..6 px : au-delà du liseré anti-crénelé (mélanges classés « photo »)
        ring = ndi.binary_dilation(comp, iterations=6) & ~ndi.binary_dilation(comp, iterations=3)
        votes = {}
        for n in ("turquoise", "prune", "aqua", "fuchsia", "marine", "ecailles"):
            votes[n] = int((masks[n][sl2] & ring).sum())
        other = int((ring & (lab[sl2] == -1)).sum())
        best = max(votes, key=votes.get)
        tot = sum(votes.values()) + other
        if best in details and votes[best] >= 0.8 * tot and comp.sum() >= 4:
            details[best][sl2] |= comp
        else:
            rejected += 1
    if verbose:
        for n, m in masks.items():
            print(f"  {n:10s} : {m.sum() / KF / KF:9.0f} px")
        for n, m in details.items():
            print(f"  détails {n:10s} : {ndi.label(m)[1]} traits, {m.sum() / KF / KF:.0f} px")
        print(f"  blancs rejetés (photo) : {rejected}")
    np.savez_compressed(WORK / "feuilles_seg.npz", **{f"m_{k}": v for k, v in masks.items()},
                        **{f"d_{k}": v for k, v in details.items()}, lab=lab)
    # diagnostic
    colors = {"turquoise": (63, 199, 238), "prune": (108, 35, 131), "fuchsia": (230, 74, 168),
              "marine": (19, 54, 94), "aqua": (166, 230, 220), "ecailles": (95, 200, 238)}
    img = np.full((Hk, Wk, 3), 235, np.uint8)
    for n, c in colors.items():
        img[masks[n]] = c
    for n in details:
        img[details[n]] = (255, 255, 255)
    Image.fromarray(img).resize((Wk // 2, Hk // 2), Image.LANCZOS).save(WORK / "feuilles_seg.png")
    return masks, details


if __name__ == "__main__":
    segment()

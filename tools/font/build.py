# -*- coding: utf-8 -*-
"""
Armoire Lettres - etape 2 : vectorisation et assemblage de la police.

    python tools/font/extract.py   # d'abord (produit _work/glyphs + glyphs.json)
    python tools/font/build.py

Produit assets/fonts/armoire-lettres.ttf et assets/fonts/armoire-lettres.woff2
(et _work/kerning.fea, _work/build_report.json).

  - potrace (alphamax 1, opttolerance 0.2) sur les bitmaps 1 px = 1 unite (soit
    ~4 a 7 x la resolution des sources) ;
  - courbes cubiques -> quadratiques TrueType avec cu2qu (erreur max 1 unite) ;
  - contours exterieurs dans le sens horaire, contre-formes dans le sens inverse ;
  - approches issues des affiches (voir extract.py), crenage optique calcule sur
    les enveloppes convexes des glyphes pour les paires a flancs ouverts.
"""
import json
import math
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import potrace
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = HERE / "_work"
OUT = ROOT / "assets" / "fonts"
FAMILY = "Armoire Lettres"
PSNAME = "ArmoireLettres-Regular"
VERSION = "1.000"

ALPHAMAX = 1.0
OPTTOLERANCE = 0.2
TURDSIZE = 40          # taches < 40 unites^2 ignorees
CU2QU_ERR = 1.0        # unites


# --------------------------------------------------------------------------
# Vectorisation
# --------------------------------------------------------------------------
def trace_png(path):
    ink = np.asarray(Image.open(path).convert("L")) < 128
    bm = potrace.Bitmap(~ink)  # le constructeur inverse : l'encre doit etre False ici
    plist = bm.trace(turdsize=TURDSIZE, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
                     alphamax=ALPHAMAX, opticurve=True, opttolerance=OPTTOLERANCE)
    contours = []
    for curve in plist:
        segs = []
        p0 = (curve.start_point.x, curve.start_point.y)
        cur = p0
        for s in curve:
            if s.is_corner:
                segs.append(("L", [cur, (s.c.x, s.c.y)]))
                segs.append(("L", [(s.c.x, s.c.y), (s.end_point.x, s.end_point.y)]))
            else:
                segs.append(("C", [cur, (s.c1.x, s.c1.y), (s.c2.x, s.c2.y), (s.end_point.x, s.end_point.y)]))
            cur = (s.end_point.x, s.end_point.y)
        contours.append(dict(outer=bool(curve._path.sign), segs=segs))
    return contours, ink.shape


def to_units(contours, xoff, ymax):
    """pixels (x droite, y bas) -> unites (X droite, Y haut)"""
    out = []
    for c in contours:
        segs = [(k, [(x + xoff, ymax - y) for x, y in pts]) for k, pts in c["segs"]]
        out.append(dict(outer=c["outer"], segs=segs))
    return out


def signed_area(segs):
    pts = []
    for k, p in segs:
        if k == "L":
            pts.append(p[0])
        else:
            for t in (0.0, 0.25, 0.5, 0.75):
                mt = 1 - t
                x = mt ** 3 * p[0][0] + 3 * mt * mt * t * p[1][0] + 3 * mt * t * t * p[2][0] + t ** 3 * p[3][0]
                y = mt ** 3 * p[0][1] + 3 * mt * mt * t * p[1][1] + 3 * mt * t * t * p[2][1] + t ** 3 * p[3][1]
                pts.append((x, y))
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2.0


def reverse_segs(segs):
    out = []
    for k, p in reversed(segs):
        out.append((k, list(reversed(p))))
    return out


def draw_glyph(contours):
    """contours (unites) -> glyphe TrueType ; exterieur horaire (aire < 0)"""
    ttpen = TTGlyphPen(None)
    pen = Cu2QuPen(ttpen, max_err=CU2QU_ERR, reverse_direction=False)
    for c in contours:
        segs = c["segs"]
        a = signed_area(segs)
        want_negative = c["outer"]
        if (a < 0) != want_negative:
            segs = reverse_segs(segs)
        # fusion des segments droits consecutifs colineaires (points superflus)
        start = segs[0][1][0]
        pen.moveTo(rnd(start))
        for k, p in segs:
            if k == "L":
                if rnd(p[1]) != rnd(p[0]):
                    pen.lineTo(rnd(p[1]))
            else:
                pen.curveTo(p[1], p[2], rnd(p[3]))
        pen.closePath()
    return ttpen.glyph()


def rnd(p):
    return (int(round(p[0])), int(round(p[1])))


# --------------------------------------------------------------------------
# Crenage optique (enveloppes convexes)
# --------------------------------------------------------------------------
BAND = 10
OPEN = {"A", "F", "J", "L", "P", "T", "V", "W", "Y",
        "Agrave", "Acircumflex", "Adieresis", "Ydieresis",
        "quotesingle", "quoteright", "quoteleft", "quotedbl", "quotedblleft", "quotedblright",
        "period", "comma", "ellipsis", "seven", "slash"}
KERN_MIN = 30          # seuil : on ne garde que les paires utiles
PAIR_GLYPHS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + [
    "Agrave", "Acircumflex", "Adieresis", "Ccedilla", "Egrave", "Eacute", "Ecircumflex", "Edieresis",
    "Icircumflex", "Idieresis", "Ocircumflex", "Odieresis", "Ugrave", "Ucircumflex", "Udieresis", "Ydieresis",
    "OE", "AE", "agrave", "quotesingle", "quoteright", "quoteleft", "quotedbl", "quotedblleft",
    "quotedblright", "period", "comma", "ellipsis", "hyphen", "one", "four", "seven", "zero", "slash"]


def profiles(png, meta):
    """profils gauche/droit bruts et d'enveloppe convexe, par bandes de Y (unites,
    X relatif au bord gauche de l'encre)"""
    ink = np.asarray(Image.open(png).convert("L")) < 128
    h, w = ink.shape
    # zone des capitales seulement : les accents au-dessus de 720 ne comptent pas
    rows_y = meta["ymax"] - np.arange(h)
    ink = ink & (rows_y <= 720)[:, None]
    ys, xs = np.nonzero(ink)
    pts = np.stack([xs, ys], axis=1).astype(np.int32)
    hull = cv2.convexHull(pts)
    hm = np.zeros_like(ink, np.uint8)
    cv2.fillPoly(hm, [hull.reshape(-1, 2)], 1)
    prof = {}
    for name, m in (("raw", ink), ("hull", hm > 0)):
        L, R = {}, {}
        for r0 in range(0, h, BAND):
            sub = m[r0:r0 + BAND]
            cols = np.nonzero(sub.any(axis=0))[0]
            if cols.size:
                Y = meta["ymax"] - (r0 + BAND / 2.0)
                yb = int(math.floor(Y / BAND))
                L[yb] = cols.min() + meta["xmin"]
                R[yb] = cols.max() + 1 + meta["xmin"]
        prof[name] = (L, R)
    return prof


def compute_kerning(glyphs, profs):
    pairs = {}
    names = [n for n in PAIR_GLYPHS if n in glyphs]
    for a in names:
        for b in names:
            if a not in OPEN and b not in OPEN:
                continue
            ga, gb = glyphs[a], glyphs[b]
            ra_h, lb_h = profs[a]["hull"][1], profs[b]["hull"][0]
            ra_r, lb_r = profs[a]["raw"][1], profs[b]["raw"][0]
            # b est place a l'avance de a ; X relatif au bord gauche de l'encre de a
            off = ga["width"] + ga["rsb"] + gb["lsb"]
            common = [y for y in ra_h if y in lb_h and 0 <= y * BAND <= 720]
            if len(common) < 4:
                continue
            gaps = [(lb_h[y] + off) - ra_h[y] for y in common]
            ref = ga["rsb"] + gb["lsb"]
            excess = float(np.mean(gaps)) - ref
            k = -0.5 * excess
            # garde-fou : jamais plus pres que 22 unites sur les profils bruts
            raw_common = [y for y in ra_r if y in lb_r]
            if raw_common:
                gmin = min((lb_r[y] + off) - ra_r[y] for y in raw_common)
                k = max(k, -(gmin - 22))
            k = int(5 * round(k / 5.0))
            if abs(k) >= KERN_MIN:
                pairs[(a, b)] = k
    # l'apostrophe apres L reste proche du logo (qui n'en a pas) : crenage modere
    for (a, b) in list(pairs):
        if a == "L" and b in ("quotesingle", "quoteright", "quotedbl", "quotedblright"):
            pairs[(a, b)] = max(pairs[(a, b)], -40)
    return pairs


# --------------------------------------------------------------------------
# Assemblage
# --------------------------------------------------------------------------
def build():
    t0 = time.time()
    meta = json.loads((WORK / "glyphs.json").read_text(encoding="utf-8"))
    G = meta["glyphs"]
    order = [".notdef", "space", "nbspace", "uni202F"] + sorted(
        G, key=lambda n: (min(G[n]["unicodes"]) if G[n]["unicodes"] else 0x10FFFF, n))
    glyf, hmtx, report = {}, {}, {}
    total_pts = 0
    for n in order:
        if n == ".notdef":
            pen = TTGlyphPen(None)
            for (x0, y0, x1, y1) in ((50, 0, 450, 700), (100, 50, 400, 650)):
                pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
                if x0 == 100:
                    pts = pts[::-1]
                pen.moveTo(pts[0])
                for p in pts[1:]:
                    pen.lineTo(p)
                pen.closePath()
            glyf[n] = pen.glyph()
            hmtx[n] = (500, 50)
            continue
        if n in ("space", "nbspace"):
            glyf[n] = TTGlyphPen(None).glyph()
            hmtx[n] = (meta["space"], 0)
            continue
        if n == "uni202F":  # espace fine insecable (« … »)
            glyf[n] = TTGlyphPen(None).glyph()
            hmtx[n] = (int(meta["space"] * 0.55), 0)
            continue
        g = G[n]
        contours, shape = trace_png(WORK / "glyphs" / g["png"])
        cu = to_units(contours, g["xmin"] + g["lsb"], g["ymax"])
        glyph = draw_glyph(cu)
        glyf[n] = glyph
        npts = sum(1 for _ in glyph.coordinates) if hasattr(glyph, "coordinates") else 0
        total_pts += npts
        xs = [c[0] for c in glyph.coordinates]
        ys = [c[1] for c in glyph.coordinates]
        xmin = min(xs) if xs else 0
        hmtx[n] = (g["advance"], xmin)
        report[n] = dict(points=npts, contours=len(cu), xMin=min(xs), xMax=max(xs), yMin=min(ys), yMax=max(ys),
                         advance=g["advance"])
    yMax = max(r["yMax"] for r in report.values())
    yMin = min(r["yMin"] for r in report.values())
    ascent, descent = 950, -250
    assert yMax <= ascent + 60 and yMin >= descent - 60, (yMax, yMin)

    cmap = {0x20: "space", 0xA0: "nbspace", 0x202F: "uni202F"}
    for n, g in G.items():
        for u in g["unicodes"]:
            cmap[u] = n

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyf)
    fb.setupHorizontalMetrics(hmtx)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=0)
    fb.setupNameTable({
        "copyright": "Lettrage de L'Armoire à Cuillères (Clermont-Ferrand), reconstruit d'après ses affiches 2013-2019, son logo et sa devanture.",
        "familyName": FAMILY,
        "styleName": "Regular",
        "uniqueFontIdentifier": "%s;ARMO;%s" % (VERSION, PSNAME),
        "fullName": FAMILY + " Regular",
        "version": "Version " + VERSION,
        "psName": PSNAME,
        "description": "Capitales au feutre vectorisées depuis les visuels de la boutique (logo, affiches, panneau peint). "
                       "Les minuscules renvoient aux capitales, sauf « à ».",
        "licenseDescription": "Usage réservé à L'Armoire à Cuillères.",
    })
    fb.setupOS2(
        version=4, sTypoAscender=ascent, sTypoDescender=descent, sTypoLineGap=0,
        usWinAscent=max(ascent, yMax + 10), usWinDescent=max(-descent, -yMin + 10),
        sxHeight=700, sCapHeight=700, usWeightClass=400, usWidthClass=5,
        fsSelection=0x40 | 0x80,  # REGULAR + USE_TYPO_METRICS
        achVendID="ARMO", fsType=0,
        ulUnicodeRange1=(1 << 0) | (1 << 1) | (1 << 2) | (1 << 31), ulUnicodeRange2=(1 << 1),
        ulCodePageRange1=(1 << 0),
        usDefaultChar=0, usBreakChar=0x20, usMaxContext=2,
        ySubscriptXSize=650, ySubscriptYSize=600, ySubscriptYOffset=75,
        ySuperscriptXSize=650, ySuperscriptYSize=600, ySuperscriptYOffset=350,
        yStrikeoutSize=60, yStrikeoutPosition=300,
    )
    fb.setupPost(underlinePosition=-110, underlineThickness=55, isFixedPitch=0)
    # gasp : lissage a toutes les tailles (police non hintee)
    gasp = newTable("gasp")
    gasp.version = 1
    gasp.gaspRange = {0xFFFF: 0x000F}
    fb.font["gasp"] = gasp
    # crenage
    profs = {n: profiles(WORK / "glyphs" / G[n]["png"], G[n]) for n in PAIR_GLYPHS if n in G}
    pairs = compute_kerning(G, profs)
    fea = ["languagesystem DFLT dflt;", "languagesystem latn dflt;", "", "feature kern {"]
    for (a, b), v in sorted(pairs.items()):
        fea.append("  pos %s %s %d;" % (a, b, v))
    fea.append("} kern;")
    fea_txt = "\n".join(fea) + "\n"
    (WORK / "kerning.fea").write_text(fea_txt, encoding="utf-8")
    fb.addOpenTypeFeatures(fea_txt)
    OUT.mkdir(parents=True, exist_ok=True)
    ttf = OUT / "armoire-lettres.ttf"
    fb.font["head"].fontRevision = float(VERSION)
    fb.save(str(ttf))
    f = TTFont(str(ttf))
    f.flavor = "woff2"
    f.save(str(OUT / "armoire-lettres.woff2"))
    rep = dict(glyphs=len(order), points=total_pts, yMax=yMax, yMin=yMin, kerning_pairs=len(pairs),
               per_glyph=report)
    (WORK / "build_report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    write_readme(meta, rep, len(pairs))
    print("glyphes %d, points %d (moy. %.0f), yMax %d, yMin %d, paires de crenage %d (%.0f s)" % (
        len(order), total_pts, total_pts / max(1, len(report)), yMax, yMin, len(pairs), time.time() - t0))
    print("ecrit :", ttf, "(%d o)" % ttf.stat().st_size, "et woff2 (%d o)" % (OUT / "armoire-lettres.woff2").stat().st_size)


# --------------------------------------------------------------------------
# README (genere depuis glyphs.json pour rester synchrone)
# --------------------------------------------------------------------------
LEGEND = [
    ("logo", "osint/site/_logo_cover_crop.png", "logo blanc sur menthe (bandeau Facebook 2018), lettres ≈ 170 px"),
    ("février", "osint/site/brand/2016_11_Sans-titre-8.jpg", "« EN FEVRIER à L'ARMOIRE à CUILLERES », lettres ≈ 123 px"),
    ("mars", "osint/site/brand/2018_03_Sans-titre-14-1.jpg", "« EN MARS à L'ARMOIRE à CUILLERES » (même rendu que février)"),
    ("brocante", "osint/site/affiches/2018_09_brocante-1-e1536222251251.jpg", "« BROCANTE DE LIVRES », lettres ≈ 115 px"),
    ("estivaux", "osint/site/affiches/2013_12_j.jpg", "« HORAIRES ESTIVAUX », lettres ≈ 98 px, rendu plus gras"),
    ("panneau", "osint/insta/2026-09-22_DdmdbaDgHQz-6.jpg", "panneau de la devanture, vinyle condensé à 72 %"),
]
SHAPE_REFS = ("Références de forme (lettres de 23 à 31 px, non tracées) : `osint/site/brand/2016_10_MENU.jpg` et "
              "`2016_10_MENU-A-IMPRIMER-PAGE-2.jpg` (G, P, J, W, K, parenthèses, trait d'union), "
              "`osint/site/affiches/2013_12_FFF.jpg` (J, Q), `2018_05_vacancs-e1525381191955.jpg` (Q, J, points, "
              "« 22 »). « SPEED BOOKING » (`2016_11_Speed-booking.jpg`) est composé dans une autre police (lettres "
              "toutes de même hauteur, dessin différent) : écarté. Les lignes du haut du panneau (« DORÉS ET / NOTRE "
              "CHOCOLAT / SÉLECTIONNÉ ») sont dans une capitale linéale étroite différente : écartées.")

KNOWN_ISSUES = [
    "H et X viennent de « HORAIRES ESTIVAUX » (jaune sur blanc, chroma JPEG sous-échantillonnée, rendu gras) : "
    "amincis de 12 u, ils sont un peu moins nets que les lettres du logo.",
    "Les glyphes recomposés (G J K P Q W Y Z, chiffres, ponctuation, & @ # %) sont des reconstructions plausibles "
    "guidées par des échantillons de 25-30 px, pas des copies des glyphes d'origine ; & et 3 sont les plus libres.",
    "Seuls À et È existent en capitale accentuée dans les sources (logo) ; ils sont repris tels quels : le À garde "
    "son A étroit à sommet arrondi, plus petit que les autres capitales (comme dans le logo), le È son E abaissé. "
    "É Ê Ë reprennent le E du È ; Â Ä, Î Ï, Ô Ö, Ù Û Ü, Ÿ utilisent la lettre courante.",
    "L'approche du logo est plus serrée que celle de la police (lettres jointives) : la police suit l'approche "
    "des affiches.",
    "Chiffres à ≈ 0,8 de la capitale d'après les « 22 » de l'affiche de 2018 (seul chiffre attesté).",
    "Police non hintée (lissage gasp) : prévue pour l'affichage, rendu doux sous 14 px.",
    "Crénage calculé automatiquement (enveloppes convexes) sans relecture paire par paire.",
    "Aux points où les lettres du logo se touchaient (A-O, R-M, I-R, I-S), le contour est complété par le rendu de "
    "l'affiche de février (même glyphe, résolution 1,36 × moindre).",
]


def glyph_label(n, g):
    if not g["unicodes"]:
        return n
    chars = [chr(u) for u in g["unicodes"]]
    main = chars[0]
    if main == "|":
        main = "\\|"
    if len(chars) > 1 and chars[1].islower():
        return "%s %s" % (main, chars[1])
    return main


def ext_names(rep, key):
    """caracteres qui atteignent l'extreme vertical 'key' (yMax ou yMin)"""
    per = rep["per_glyph"]
    v = max(g[key] for g in per.values()) if key == "yMax" else min(g[key] for g in per.values())
    meta = json.loads((WORK / "glyphs.json").read_text(encoding="utf-8"))["glyphs"]
    return ", ".join("« %s »" % (chr(meta[n]["unicodes"][0]) if meta[n]["unicodes"] else n)
                     for n in sorted(per) if per[n][key] == v)


def write_readme(meta, rep, npairs):
    G = meta["glyphs"]
    order = sorted(G, key=lambda n: (min(G[n]["unicodes"]) if G[n]["unicodes"] else 0x10FFFF, n))
    src = [n for n in order if G[n]["kind"] == "source"]
    rec = [n for n in order if G[n]["kind"] != "source"]
    L = []
    w = L.append
    w("# Armoire Lettres")
    w("")
    w("Police de capitales au feutre de L'Armoire à Cuillères (logo, affiches 2013-2019, enseigne), "
      "reconstruite depuis les visuels de la boutique. Les affiches, le logo et « HORAIRES ESTIVAUX » sont des "
      "rendus d'une même police numérique : chaque lettre présente y est vectorisée depuis sa meilleure occurrence "
      "(recalée sur l'affiche de février, rééchantillonnée ~4 à 7 × puis tracée avec potrace). Les glyphes absents "
      "sont recomposés à partir de traits découpés dans ces lettres réelles.")
    w("")
    w("- `assets/fonts/armoire-lettres.woff2` (web) et `armoire-lettres.ttf` — famille « Armoire Lettres », Regular.")
    w("- `tools/font/specimen.png`, `tools/font/comparaison.png` (source au-dessus, police en dessous).")
    w("- `tools/font/_work/` : bitmaps intermédiaires, planches de contrôle, `kerning.fea` (non publié).")
    w("")
    w("Reproduire (Python 3.11 + numpy, scipy, Pillow, opencv-python-headless, scikit-image, fontTools, brotli, potracer) :")
    w("")
    w("```")
    w("python tools/font/extract.py    # sources -> _work/glyphs/*.png + glyphs.json (~1 min)")
    w("python tools/font/build.py      # potrace + cu2qu + fontTools -> ttf, woff2, README")
    w("python tools/font/specimen.py   # specimen.png, comparaison.png, test Chrome (_work/chrome.png)")
    w("```")
    w("")
    w("## Emploi en CSS")
    w("")
    w("```css")
    w("@font-face {")
    w('  font-family: "Armoire Lettres";')
    w('  src: url("/assets/fonts/armoire-lettres.woff2") format("woff2"),')
    w('       url("/assets/fonts/armoire-lettres.ttf") format("truetype");')
    w("  font-weight: 400; font-style: normal; font-display: swap;")
    w("}")
    w('.titre { font-family: "Armoire Lettres", sans-serif; font-synthesis: none;')
    w("         line-height: 1.1; letter-spacing: 0.01em; }")
    w("```")
    w("")
    w("- Hauteur de capitale : **0,70 em** (`font-size = hauteur de capitale voulue / 0,7`). Les lettres "
      "varient de 0,61 em (E, T) à 0,76 em (O, R), comme l'original ; chiffres ≈ 0,56 em.")
    w("- Interlignage : `line-height: 1.1` pour les titres (1.15–1.2 sur plusieurs lignes avec accents "
      "circonflexes et Q/J/virgules) ; valeur `normal` = 1,2.")
    w("- Approche : l'approche d'origine est serrée (celle des affiches). `letter-spacing: 0` à `0.02em` en titre, "
      "`0.04em` sous 20 px. Pour imiter le logo (lettres qui se touchent) : `-0.03em`.")
    w("- Crénage : table GPOS (%d paires optiques : AV, AT, LT, L', TA, VA, LV, PA, T., V,…), active par défaut." % npairs)
    w("- Minuscules tapées = capitales, sauf « à » (le à à une panse des affiches). Éviter "
      "`text-transform: uppercase` (il changerait « à » en « À »).")
    w("")
    w("## Métriques")
    w("")
    w("UPM 1000 ; capitale 700 ; ascendante 950 / descendante −250 (hhea = typo, USE_TYPO_METRICS) ; "
      "win 950/250 ; plus haut point %d (%s), plus bas %d (%s) : rien n'est rogné. "
      "Espace mot %d (mesuré sur les affiches). %d glyphes, %d points au total. Épaisseur de trait "
      "(2 × distance au bord le long du squelette) : 57–82 u pour les lettres sources, les recompositions "
      "ramenées dans 61–75 u ; I et L gardent leur fût gras d'origine (≈ 92–96 u)." %
      (rep["yMax"], ext_names(rep, "yMax"), rep["yMin"], ext_names(rep, "yMin"),
       meta["space"], rep["glyphs"], rep["points"]))
    w("")
    w("## Sources")
    w("")
    for key, path, desc in LEGEND:
        w("- **%s** : `%s` — %s" % (key, path, desc))
    w("- " + SHAPE_REFS)
    w("")
    w("## Glyphe par glyphe")
    w("")
    w("Vectorisés depuis une source (%d) :" % len(src))
    w("")
    w("| glyphe | nom | source (fichier : voir légende) — mot | trait (u) |")
    w("|---|---|---|---|")
    for n in src:
        g = G[n]
        w("| %s | %s | %s | %s |" % (glyph_label(n, g), n, g["source"], g["stroke"]))
    w("")
    w("Recomposés (%d) :" % len(rec))
    w("")
    w("| glyphe | nom | recomposé à partir de… | trait (u) |")
    w("|---|---|---|---|")
    for n in rec:
        g = G[n]
        fix = (" (graisse %+.0f u)" % g["weight_fix"]) if g.get("weight_fix") else ""
        w("| %s | %s | %s%s | %s |" % (glyph_label(n, g), n, g["source"], fix, g["stroke"]))
    w("")
    w("Espace, espace insécable et espace fine insécable (U+202F, 0,55 espace) : sans dessin.")
    w("")
    w("## Défauts connus")
    w("")
    for line in KNOWN_ISSUES:
        w("- " + line)
    w("")
    (HERE / "README.md").write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    build()

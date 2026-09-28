# -*- coding: utf-8 -*-
"""
Armoire Lettres - etape 3 : specimen et planche de comparaison.

    python tools/font/specimen.py

  - tools/font/specimen.png    : alphabet complet + lignes de composition ;
  - tools/font/comparaison.png : pour chaque mot source, le recadrage d'origine
    au-dessus du meme mot compose avec la police, a la meme hauteur de capitale ;
  - tools/font/_work/test.html (+ capture Chrome _work/chrome.png si Chrome est la).

Le rendu utilise FreeType (Pillow) sur le TTF, glyphe par glyphe, avec les
avances du TTF et la table de crenage (GPOS) appliquee a la main.
"""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = HERE / "_work"
TTF = ROOT / "assets" / "fonts" / "armoire-lettres.ttf"
WOFF2 = ROOT / "assets" / "fonts" / "armoire-lettres.woff2"
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
LABEL_FONT = "C:/Windows/Fonts/segoeui.ttf"

INK = (58, 39, 35)       # chocolat
PAPER = (250, 247, 240)  # creme
GREY = (130, 120, 112)


class Typesetter:
    def __init__(self, path):
        self.tt = TTFont(str(path))
        self.cmap = self.tt.getBestCmap()
        self.hmtx = self.tt["hmtx"].metrics
        self.upm = self.tt["head"].unitsPerEm
        self.kern = {}
        gpos = self.tt["GPOS"].table
        for lookup in gpos.LookupList.Lookup:
            for st in lookup.SubTable:
                if st.Format != 1:
                    continue
                cov = st.Coverage.glyphs
                for i, first in enumerate(cov):
                    for pvr in st.PairSet[i].PairValueRecord:
                        v = pvr.Value1.XAdvance if pvr.Value1 is not None else 0
                        self.kern[(first, pvr.SecondGlyph)] = v or 0
        self.path = str(path)
        self._fonts = {}

    def font(self, size):
        if size not in self._fonts:
            self._fonts[size] = ImageFont.truetype(self.path, size)
        return self._fonts[size]

    def layout(self, text, size, tracking=0):
        """positions (unites) de chaque caractere"""
        pos, x, prev = [], 0.0, None
        for ch in text:
            gn = self.cmap.get(ord(ch))
            if gn is None:
                raise KeyError("caractere absent de la police : %r" % ch)
            if prev is not None:
                x += self.kern.get((prev, gn), 0)
            pos.append((ch, x))
            x += self.hmtx[gn][0] + tracking
            prev = gn
        return pos, x

    def draw(self, img, xy, text, cap_px, fill, tracking=0):
        """dessine 'text' avec la ligne de base en xy[1] ; hauteur de capitale cap_px"""
        size = int(round(cap_px * self.upm / 700.0))
        f = self.font(size)
        pos, w = self.layout(text, size, tracking)
        d = ImageDraw.Draw(img)
        s = size / float(self.upm)
        for ch, x in pos:
            d.text((xy[0] + x * s, xy[1]), ch, font=f, fill=fill, anchor="ls")
        return w * s

    def width(self, text, cap_px, tracking=0):
        size = int(round(cap_px * self.upm / 700.0))
        return self.layout(text, size, tracking)[1] * size / float(self.upm)


def label_font(size):
    try:
        return ImageFont.truetype(LABEL_FONT, size)
    except OSError:
        return ImageFont.load_default()


# --------------------------------------------------------------------------
def make_specimen(ts):
    W = 2400
    blocks = [
        ("Alphabet", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 118),
        ("Capitales accentuées et « à » des affiches", "ÀÂÄÇÈÉÊËÎÏÔÖÙÛÜŸŒÆ à", 118),
        ("Chiffres", "0123456789", 118),
        ("Ponctuation et signes", ". , ; : ! ? ' ’ \" « » - – — ( ) & / € % + @ #", 118),
        (None, None, 40),
        ("Composition", "L'ARMOIRE À CUILLÈRES", 150),
        (None, "CHOCOLATS GRANDS CRUS", 150),
        (None, "GÂTEAUX · BRUNCH DU DIMANCHE", 112),
        (None, "ICI ON AIME LE FAIT MAISON.", 112),
        (None, "MOKAYA · KEWANE · Z-CAFÉ · QUELQUES JOURS", 84),
        (None, "OUVERT · FERMÉ · 5,20 € · 11 RUE DES CHAUSSETIERS", 76),
        (None, "l'armoire à cuillères — minuscules tapées", 76),
    ]
    H = 140 + sum((cap * 1.95 if txt else cap) + (46 if lab else 0) for lab, txt, cap in blocks) + 80
    img = Image.new("RGB", (W, int(H)), PAPER)
    d = ImageDraw.Draw(img)
    lf, lf2 = label_font(34), label_font(26)
    d.text((80, 50), "Armoire Lettres — Regular", font=lf, fill=GREY)
    d.text((W - 80, 58), "tools/font/specimen.png · rendu FreeType du TTF, crénage appliqué", font=lf2,
           fill=GREY, anchor="ra")
    y = 140
    for lab, txt, cap in blocks:
        if lab:
            d.text((80, y), lab, font=lf2, fill=GREY)
            y += 46
        if not txt:
            y += cap
            continue
        base = y + cap * 1.30
        w = ts.width(txt, cap)
        if w > W - 160:
            cap = cap * (W - 160) / w
            base = y + cap * 1.30
        ts.draw(img, (80, base), txt, cap, INK)
        y += cap * 1.95
    img.save(HERE / "specimen.png")
    return img


# --------------------------------------------------------------------------
# Comparaison : recadrages d'origine (boite en px source, hauteur de capitale en px)
# --------------------------------------------------------------------------
SRC = {
    "fevrier": ("osint/site/brand/2016_11_Sans-titre-8.jpg", False),
    "mars": ("osint/site/brand/2018_03_Sans-titre-14-1.jpg", False),
    "logo": ("osint/site/_logo_cover_crop.png", True),
    "brocante": ("osint/site/affiches/2018_09_brocante-1-e1536222251251.jpg", False),
    "estivaux": ("osint/site/affiches/2013_12_j.jpg", False),
    "panneau": ("osint/insta/2026-09-22_DdmdbaDgHQz-6.jpg", True),
    "menu": ("osint/site/brand/2016_10_MENU.jpg", False),
    "menu2": ("osint/site/brand/2016_10_MENU-A-IMPRIMER-PAGE-2.jpg", False),
    "fff": ("osint/site/affiches/2013_12_FFF.jpg", False),
    "vacances": ("osint/site/affiches/2018_05_vacancs-e1525381191955.jpg", False),
}
# (source, mot compose, boite x0,y0,x1,y1, ligne de base y (px source), hauteur de capitale (px source), remarque)
WORDS = [
    ("fevrier", "EN", (350, 60, 490, 225), 203, 123, ""),
    ("fevrier", "FEVRIER", (515, 60, 915, 225), 203, 123, ""),
    ("fevrier", "L'ARMOIRE", (1050, 60, 1560, 225), 203, 123, ""),
    ("fevrier", "à", (940, 60, 1025, 225), 203, 123, "« à » minuscule"),
    ("fevrier", "CUILLERES", (1695, 60, 2240, 225), 203, 123, ""),
    ("mars", "MARS", (575, 60, 860, 225), 203, 123, ""),
    ("logo", "L’ARM", (0, 60, 385, 262), 250.4, 166.8, "logo : le L’ est plus petit (retouche du logo)"),
    ("logo", "OIRE", (105, 222, 385, 425), 406.4, 166.8, "logo"),
    ("logo", "À CUILL", (500, 118, 1008, 318), 303.5, 166.8, "logo : lettres serrées (approche négative)"),
    ("logo", "ÈRES", (505, 272, 850, 488), 459.5, 166.8, "logo"),
    ("brocante", "BROCANTE", (105, 1265, 612, 1412), 1395.1, 115.4, ""),
    ("brocante", "DE", (630, 1265, 760, 1412), 1395.1, 115.4, ""),
    ("brocante", "LIVRES", (780, 1265, 1130, 1412), 1395.1, 115.4, ""),
    ("estivaux", "HORAIRES", (225, 205, 600, 325), 313.3, 97.8, "« HORAIRES ESTIVAUX » : rendu plus gras"),
    ("estivaux", "ESTIVAUX", (615, 205, 1025, 325), 313.3, 97.8, ""),
    ("panneau", "ET DONC,", (1255, 1060, 2090, 1470), 1420, 313, "panneau : vinyle condensé à 72 %"),
    ("panneau", "FAIT MAISON.", (1060, 2160, 2240, 2560), 2527, 316, "panneau : vinyle condensé à 72 %"),
    ("menu", "LE GRAND (PETIT-)DEJ", (60, 22, 400, 78), 65, 31, "menu 2016 (lettres de 30 px) : G, P, J, parenthèses"),
    ("menu2", "DU WEEK-END", (100, 82, 290, 125), 116.5, 27, "menu 2016 : W, K, trait d'union"),
    ("fff", "JUSQU'EN DECEMBRE", (135, 138, 460, 190), 179, 30, "affiche 2013 : J, Q (lettres de 30 px)"),
    ("vacances", "QUELQUES JOURS...", (212, 86, 420, 126), 118, 24, "affiche 2018 : Q, J, points (24 px)"),
    ("vacances", "NOUS SERONS DE RETOUR LE 22 MAI", (58, 140, 425, 180), 172, 22, "affiche 2018 : chiffres 2"),
]


def load_src(key):
    rel, invert = SRC[key]
    im = Image.open(ROOT / rel).convert("RGB")
    return im, invert


def make_comparison(ts):
    CAP = 96
    W = 2400
    cache = {}
    rows = []
    for key, word, box, base, cap, note in WORDS:
        if key not in cache:
            cache[key] = load_src(key)
        im, invert = cache[key]
        crop = im.crop(box)
        s = CAP / float(cap)
        crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.LANCZOS)
        base_in_crop = (base - box[1]) * s
        rows.append((key, word, crop, base_in_crop, note))
    # mise en page sur deux colonnes
    col_w = (W - 3 * 60) // 2
    cells = []
    for key, word, crop, bic, note in rows:
        tw = ts.width(word, CAP)
        scale = min(1.0, (col_w - 20) / max(crop.width, tw))
        h = int((crop.height + CAP * 1.9 + 70) * scale) + 20
        cells.append((key, word, crop, bic, note, scale, h))
    # hauteurs de lignes
    lines = [cells[i:i + 2] for i in range(0, len(cells), 2)]
    H = 150 + sum(max(c[6] for c in ln) + 30 for ln in lines)
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    lf, lf2 = label_font(34), label_font(22)
    d.text((60, 40), "Armoire Lettres — comparaison : recadrage d'origine (haut) / même mot composé avec la police (bas), "
                     "même hauteur de capitale", font=lf, fill=GREY)
    y = 120
    for ln in lines:
        x = 60
        for key, word, crop, bic, note, scale, h in ln:
            cw = int(crop.width * scale)
            chh = int(crop.height * scale)
            c2 = crop.resize((max(1, cw), max(1, chh)), Image.LANCZOS)
            img.paste(c2, (x, y + 28))
            d.text((x, y), "%s — %s" % (key, note) if note else key, font=lf2, fill=GREY)
            # mot compose : meme ligne de base relative, meme hauteur de capitale
            cap_px = CAP * scale
            base_y = y + 28 + chh + int(cap_px * 1.35)
            ts.draw(img, (x, base_y), word, cap_px, INK)
            d.line([(x, base_y), (x + max(cw, int(ts.width(word, cap_px))), base_y)], fill=(215, 205, 195), width=1)
            x += col_w + 60
        y += max(c[6] for c in ln) + 30
    img.save(HERE / "comparaison.png")
    return img


# --------------------------------------------------------------------------
def chrome_check():
    """page HTML locale avec @font-face (woff2) et capture Chrome sans tete"""
    WORK.mkdir(exist_ok=True)
    rel = os.path.relpath(WOFF2, WORK).replace("\\", "/")
    html = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Armoire Lettres</title>
<style>
@font-face { font-family: "Armoire Lettres"; src: url("{REL}") format("woff2"); font-display: block; }
body { margin: 0; padding: 36px 48px; background: #faf7f0; color: #3a2723; font-family: "Armoire Lettres", monospace; }
h1 { font-size: 96px; line-height: 1.1; letter-spacing: 0.01em; margin: 0 0 18px; font-weight: 400; }
p { font-size: 54px; line-height: 1.15; margin: 0 0 12px; }
small { display: block; font: 16px/1.4 Segoe UI, sans-serif; color: #8a7d72; margin-top: 18px; }
.clip { display: inline-block; font-size: 80px; line-height: normal; overflow: hidden; outline: 2px solid #c9b8a8;
        margin-top: 10px; padding: 0 12px; }
</style></head><body>
<h1>L'ARMOIRE À CUILLÈRES</h1>
<p>Chocolats grands crus · gâteaux</p>
<p>« ICI ON AIME LE FAIT MAISON. »</p>
<p>OUVERT · FERMÉ · 5,20 € · 11 RUE DES CHAUSSETIERS</p>
<p>ÀÂÄÇÈÉÊËÎÏÔÖÙÛÜŸŒÆ 0123456789 &amp; @ # % + / ( ) ! ?</p>
<div class="clip">ÂÊÎÔÛ ÀÉÈÇ QJ,( Ÿ</div>
<small>woff2 : {REL}</small>
</body></html>""".replace("{REL}", rel)
    page = WORK / "test.html"
    page.write_text(html, encoding="utf-8")
    shot = WORK / "chrome.png"
    if not Path(CHROME).exists():
        print("Chrome absent : capture ignoree")
        return None
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
           "--window-size=1600,900", "--screenshot=" + str(shot), page.resolve().as_uri()]
    subprocess.run(cmd, check=False, capture_output=True, timeout=120)
    print("capture Chrome :", shot if shot.exists() else "echec")
    return shot


if __name__ == "__main__":
    ts = Typesetter(TTF)
    make_specimen(ts)
    make_comparison(ts)
    if "--no-chrome" not in sys.argv:
        chrome_check()
    print("ecrit :", HERE / "specimen.png", "et", HERE / "comparaison.png")

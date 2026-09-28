#!/usr/bin/env python3
"""Rapatrie les polices Google Fonts dans assets/fonts/ (hébergées sur le site : RGPD, aucun appel à Google).

Usage : python tools/fetch-fonts.py
Génère css/fonts.css et télécharge les fichiers .woff2 (sous-ensembles latin + latin étendu)
ainsi que les licences de chaque famille (SIL OFL ; Apache 2.0 pour Ultra).
Texte et interface : Poppins (la carte 2026 de la boutique) ; titres élégants et italiques : Playfair Display
(le vinyle « HORAIRES » de la vitrine, les affiches du brunch). La police du logo (Armoire Lettres) est
reconstruite à part (tools/font/) et déclarée à la fin de css/fonts.css.
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
CSS = ROOT / "css" / "fonts.css"
API = (
    "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400"
    "&family=Playfair+Display:ital,wght@0,400..800;1,400..800"
    "&display=swap"
)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
KEEP = {"latin", "latin-ext"}
LICENSES = {
    "poppins": "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt",
    "playfair-display": "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/OFL.txt",
}


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    FONTS.mkdir(parents=True, exist_ok=True)
    css = get(API)
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
    out = [
        "/* Polices hébergées sur le site (licences dans assets/fonts/LICENSE-*.txt).",
        "   Généré par tools/fetch-fonts.py : ne pas modifier à la main. */",
        "",
    ]
    total = 0
    seen = set()
    for subset, body in blocks:
        if subset not in KEEP:
            continue
        prop = lambda k: (re.search(rf"{k}:\s*([^;]+);", body) or [None, ""])[1].strip()
        family = prop("font-family").strip("'\"")
        weight = prop("font-weight")
        style = prop("font-style") or "normal"
        stretch = prop("font-stretch")
        rng = prop("unicode-range")
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        name = f"{slug(family)}-{style}-{weight.replace(' ', '-')}-{subset}.woff2"
        if name not in seen:
            data = get(url, binary=True)
            (FONTS / name).write_bytes(data)
            total += len(data)
            seen.add(name)
            print(f"{name:60s} {len(data) // 1024:4d} Ko")
        out += [
            "@font-face {",
            f"  font-family: '{family}';",
            f"  font-style: {style};",
            f"  font-weight: {weight};",
            *( [f"  font-stretch: {stretch};"] if stretch else [] ),
            "  font-display: swap;",
            f"  src: url('../assets/fonts/{name}') format('woff2');",
            f"  unicode-range: {rng};",
            "}",
            "",
        ]
    # la police du logo, reconstruite depuis leurs affiches (tools/font/) : hébergée ici aussi
    out += [
        "/* La police du logo, reconstruite depuis leurs affiches (tools/font/) */",
        "@font-face {",
        "  font-family: 'Armoire Lettres';",
        "  font-style: normal;",
        "  font-weight: 400;",
        "  font-display: block;",
        "  src: url('../assets/fonts/armoire-lettres.woff2') format('woff2');",
        "}",
        "",
    ]
    CSS.write_text("\n".join(out), encoding="utf-8")
    for key, url in LICENSES.items():
        try:
            (FONTS / f"LICENSE-{key}.txt").write_text(get(url), encoding="utf-8")
        except Exception as exc:  # licence introuvable : on le signale sans bloquer
            print(f"Licence {key} non récupérée : {exc}")
    print(f"Total polices : {total // 1024} Ko · {CSS.relative_to(ROOT)} écrit")


if __name__ == "__main__":
    main()

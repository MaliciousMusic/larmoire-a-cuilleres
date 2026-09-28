"""Assemble js/ac-brand.js (script classique, window.AC.BRAND) à partir de tools/vector/_work/data/*.json.

Usage : python tools/vector/build_js.py   (après logo.py, cuillere.py, cuilleres.py build, tasses.py,
feuilles_seg.py, feuilles.py, feuilles_out.py ; voir tools/vector/README.md)
"""
import json

from vec import DATA, ROOT, load_json

OUT_JS = ROOT / "js" / "ac-brand.js"


def _ints(v):
    """12.0 -> 12 (JSON plus court), récursivement."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, list):
        return [_ints(x) for x in v]
    if isinstance(v, dict):
        return {k: _ints(x) for k, x in v.items()}
    return v


def js(v):
    return json.dumps(_ints(v), ensure_ascii=False, separators=(",", ":"))


def main():
    logo = load_json("logo.json")
    cu = load_json("cuillere.json")
    rk = load_json("cuilleres.json")
    ta = load_json("tasses.json")
    fe = load_json("feuilles.json")

    L = []
    w = L.append
    w("/* ==========================================================================")
    w("   L'Armoire à Cuillères — éléments graphiques de la marque (window.AC.BRAND)")
    w("   Vectorisés depuis les fichiers d'origine (aucun redessin) : voir tools/vector/README.md.")
    w("   FICHIER GÉNÉRÉ par tools/vector/build_js.py — ne pas éditer à la main.")
    w("")
    w("   Conventions : chemins SVG (attribut d) exprimés dans le repère (viewBox) de l'élément : un M absolu")
    w("   puis des commandes relatives, arrondies au dixième (2 décimales dans les repères normalisés des")
    w("   feuilles, hauteur 100). Tous les chemins sont des surfaces à remplir (fill), jamais des contours")
    w("   (stroke). bbox = [x0, y0, x1, y1] ; viewBox = [x, y, largeur, hauteur].")
    w("")
    w("   logo      { viewBox, colors, letters:[{id, char, d, bbox, accent?, base?}], spoon:{fill, lines, bbox,")
    w("               fromCuillere} }  lettres dans l'ordre de lecture (l-L1 … l-S), couleur libre")
    w("               (currentColor dans les SVG) ; cuillère : fill blanc sous lines noir. La cuillère du logo")
    w("               est la grande cuillère : spoon.fill / spoon.lines sont calculés au premier accès en")
    w("               reportant cuillere.fill / cuillere.lines par la matrice SVG fromCuillere [a,b,c,d,e,f]")
    w("               (la même permet d'y rejouer cuillere.strokes). accent / base : l'accent seul et la lettre")
    w("               sans accent (À, È).")
    w("   mapPath(d, m) : utilitaire, reporte un chemin par une matrice SVG [a,b,c,d,e,f] (commandes absolues).")
    w("   cuillere  { viewBox, fill, lines, bbox, lineColor, strokes:[[[x,y],…],…], maskWidth, lineWidth }")
    w("               strokes = squelette regroupé en traits continus, dans l'ordre du tracé à la plume")
    w("               (haut du manche d'abord, cuilleron à la fin), chaque trait commençant par son point le plus")
    w("               haut ; un trait de largeur maskWidth qui suit strokes couvre 99,5 % des traits (masque).")
    w("               Attention : avec stroke-linecap round, un tiret de longueur nulle dessine quand même un")
    w("               point : cacher les traits pas encore commencés (voir lab/marque.html).")
    w("   cuilleres [10 × { id, viewBox, fill, lines, bbox, hook:[x,y] }] de gauche à droite, toutes dans le")
    w("               repère du râtelier (cuilleres.viewBox, cuilleres.lineColor ; 1 unité = 2 px du dessin")
    w("               d'origine). viewBox d'une cuillère = son cadre (dessin isolé) ; hook = point d'accroche")
    w("               (haut du manche). La n° 2 est la grande cuillère : fill / lines calculés au premier accès")
    w("               (fromCuillere).")
    w("   tasses    { viewBox, lines, fill, bbox, ground } (1 unité = 2 px du bandeau d'origine)")
    w("               lines = traits (blancs à l'origine : currentColor),")
    w("               fill = silhouette de la vaisselle (les jours des anses restent vides) ; ground = menthe.")
    w("   feuilles  { viewBox, frame, order, items:[{ id, key, label, fill, detailFill, d, details:[d…],")
    w("               band?, viewBox, pivot, tip, bbox, place, pivotComp, bboxComp, angle, scale }] }")
    w("               d, details, band, pivot, tip, bbox, viewBox : repère normalisé de la feuille (base = pivot")
    w("               en bas au centre, x = 0, pointe en haut, hauteur 100). place = matrice SVG [a,b,c,d,e,f]")
    w("               normalisé -> composition ; pivotComp / bboxComp : dans la composition (feuilles.viewBox).")
    w("               order = empilement du fond vers l'avant ; frame = cadre de l'affiche d'origine (la")
    w("               composition telle qu'elle était recadrée). d (écailles) = le filet lui-même, band = sa")
    w("               silhouette. details = tracés blancs séparés, du plus proche de la pointe au plus loin.")
    w("   ========================================================================== */")
    w("(function () {")
    w("  'use strict';")
    w("")
    w("  const AC = (window.AC = window.AC || {});")
    w("")
    w("  /* Reporte un chemin (M/m, C/c, L/l, Z/z) par la matrice [a, b, c, d, e, f] ; sortie en absolu. */")
    w("  function mapPath(d, m) {")
    w("    const tok = d.match(/[MmCcLlZz]|-?(?:\d+\.?\d*|\.\d+)/g) || [];")
    w("    const f = (v) => Math.round(v * 10) / 10;")
    w("    const P = (X, Y) => f(m[0] * X + m[2] * Y + m[4]) + ' ' + f(m[1] * X + m[3] * Y + m[5]);")
    w("    const out = [];")
    w("    let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0;")
    w("    const n = () => +tok[i++];")
    w("    while (i < tok.length) {")
    w("      const t = tok[i];")
    w("      if (/[A-Za-z]/.test(t)) {")
    w("        cmd = t;")
    w("        i++;")
    w("        if (cmd === 'z' || cmd === 'Z') { out.push('Z'); x = x0; y = y0; }")
    w("        continue;")
    w("      }")
    w("      const rel = cmd === cmd.toLowerCase();")
    w("      const bx = rel ? x : 0, by = rel ? y : 0;")
    w("      if (cmd === 'M' || cmd === 'm') {")
    w("        x = bx + n(); y = by + n(); x0 = x; y0 = y;")
    w("        out.push('M' + P(x, y));")
    w("        cmd = rel ? 'l' : 'L';")
    w("      } else if (cmd === 'L' || cmd === 'l') {")
    w("        x = bx + n(); y = by + n();")
    w("        out.push('L' + P(x, y));")
    w("      } else if (cmd === 'C' || cmd === 'c') {")
    w("        const v = [n(), n(), n(), n(), n(), n()];")
    w("        out.push('C' + P(bx + v[0], by + v[1]) + ' ' + P(bx + v[2], by + v[3]) + ' ' + P(bx + v[4], by + v[5]));")
    w("        x = bx + v[4]; y = by + v[5];")
    w("      } else {")
    w("        i++;")
    w("      }")
    w("    }")
    w("    return out.join('');")
    w("  }")
    w("")

    # ---------------------------------------------------------------- logo
    letters = []
    for Lt in logo["letters"]:
        e = {"id": Lt["id"], "char": Lt["char"], "d": Lt["d"], "bbox": Lt["bbox"]}
        if "accent" in Lt:
            # d = base + accent (chemins concaténés) : d est recomposé à l'exécution, pas stocké deux fois
            assert Lt["base"] + Lt["accent"] != "" and len(Lt["base"]) + len(Lt["accent"]) >= len(Lt["d"]) - 40
            e = {"id": Lt["id"], "char": Lt["char"], "bbox": Lt["bbox"], "base": Lt["base"], "accent": Lt["accent"]}
        letters.append(e)
    w("  const logo = {")
    w(f"    viewBox: {js(logo['viewBox'])},")
    w("    colors: { teal: '#6AB8C6', noir: '#1A1919', blanc: '#FFFFFF', menthe: '#67E8CC', chocolat: '#3B2723' },")
    w("    letters: [")
    for e in letters:
        w(f"      {js(e)},")
    w("    ],")
    sp = logo["spoon"]
    w(f"    spoon: {js({'bbox': sp['bbox'], 'fromCuillere': sp['fromCuillere']})},")
    w("  };")
    w("")

    # ---------------------------------------------------------------- cuillère
    w("  const cuillere = {")
    w(f"    viewBox: {js(cu['viewBox'])},")
    w(f"    bbox: {js(cu['bbox'])},")
    w("    lineColor: '#1A1919',")
    w(f"    maskWidth: {cu['maskWidth']},")
    w(f"    lineWidth: {cu['lineWidth']},")
    w(f"    fill: {js(cu['fill'])},")
    w(f"    lines: {js(cu['lines'])},")
    w("    strokes: [")
    for s in cu["strokes"]:
        w(f"      {js(s)},")
    w("    ],")
    w("  };")
    w("")

    # ---------------------------------------------------------------- râtelier
    w("  const cuilleres = [")
    derived = []
    for i, s in enumerate(rk["spoons"]):
        bb = s["bbox"]
        vb = [round(bb[0] - 2, 1), round(bb[1] - 2, 1), round(bb[2] - bb[0] + 4, 1), round(bb[3] - bb[1] + 4, 1)]
        e = {"id": s["id"], "viewBox": vb, "bbox": bb, "hook": s["hook"]}
        if "fromCuillere" in s:
            e["fromCuillere"] = s["fromCuillere"]
            derived.append(i)
        else:
            e["fill"] = s["fill"]
            e["lines"] = s["lines"]
        w(f"    {js(e)},")
    w("  ];")
    w(f"  cuilleres.viewBox = {js(rk['viewBox'])};")
    w(f"  cuilleres.lineColor = {js(rk['lineColor'])};")
    w("")

    # ---------------------------------------------------------------- tasses
    w("  const tasses = {")
    w(f"    viewBox: {js(ta['viewBox'])},")
    w(f"    bbox: {js(ta['bbox'])},")
    w(f"    ground: {js(ta['ground'])},")
    w(f"    fill: {js(ta['fill'])},")
    w(f"    lines: {js(ta['lines'])},")
    w("  };")
    w("")

    # ---------------------------------------------------------------- feuilles
    w("  const feuilles = {")
    w(f"    viewBox: {js(fe['viewBox'])},")
    w(f"    frame: {js(fe['frame'])},")
    w(f"    order: {js(fe['order'])},")
    w("    items: [")
    keys = ["id", "key", "label", "fill", "detailFill", "viewBox", "pivot", "tip", "bbox", "place", "pivotComp",
            "bboxComp", "angle", "scale", "d", "band", "details"]
    for it in fe["items"]:
        e = {k: it[k] for k in keys if k in it and it[k] is not None}
        w(f"      {js(e)},")
    w("    ],")
    w("  };")
    w("")
    w("  // lettres accentuées : d = lettre + accent")
    w("  logo.letters.forEach((l) => { if (l.d === undefined && l.base) l.d = l.base + l.accent; });")
    w("")
    w("  // la cuillère du logo = la grande cuillère reportée (calcul au premier accès, puis mémorisé)")
    w("  let spoonPaths = null;")
    w("  const getSpoon = () => spoonPaths || (spoonPaths = {")
    w("    fill: mapPath(cuillere.fill, logo.spoon.fromCuillere),")
    w("    lines: mapPath(cuillere.lines, logo.spoon.fromCuillere),")
    w("  });")
    w("  Object.defineProperty(logo.spoon, 'fill', { enumerable: true, get: () => getSpoon().fill });")
    w("  Object.defineProperty(logo.spoon, 'lines', { enumerable: true, get: () => getSpoon().lines });")
    w("")
    w("  // la cuillère n° 2 du râtelier est la grande cuillère (même dessin) : chemins reportés au premier accès")
    w("  cuilleres.forEach((c) => {")
    w("    if (!c.fromCuillere) return;")
    w("    let p = null;")
    w("    const get = () => p || (p = { fill: mapPath(cuillere.fill, c.fromCuillere), lines: mapPath(cuillere.lines, c.fromCuillere) });")
    w("    Object.defineProperty(c, 'fill', { enumerable: true, get: () => get().fill });")
    w("    Object.defineProperty(c, 'lines', { enumerable: true, get: () => get().lines });")
    w("  });")
    w("")
    w("  AC.BRAND = { logo, cuillere, cuilleres, tasses, feuilles, mapPath };")
    w("})();")
    text = "\n".join(L) + "\n"
    OUT_JS.write_text(text, encoding="utf-8")
    size = len(text.encode("utf-8"))
    parts = {
        "logo": sum(len(x.get("d", "")) + len(x.get("base", "")) + len(x.get("accent", "")) for x in letters),
        "cuillere": len(cu["fill"]) + len(cu["lines"]) + len(js(cu["strokes"])),
        "cuilleres": sum(len(s["fill"]) + len(s["lines"]) for s in rk["spoons"] if "fromCuillere" not in s),
        "tasses": len(ta["fill"]) + len(ta["lines"]),
        "feuilles": sum(len(it["d"]) + len(it.get("band") or "") + sum(len(d) for d in it["details"])
                        for it in fe["items"]),
    }
    print(f"js/ac-brand.js : {size / 1024:.1f} Ko")
    for k, v in parts.items():
        print(f"  {k:10s} {v / 1024:7.1f} Ko de chemins")


if __name__ == "__main__":
    main()

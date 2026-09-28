# Les données OpenStreetMap (ODbL) du quartier → js/ac-ville-donnees.js (window.AC_VILLE), en décimètres autour de la
# boutique (x vers l'est, y vers le sud), simplifiées. Lancé une fois (après tools/ville/osm.py) ; le site n'appelle aucun service.
import json, math, os, re, zlib

ICI = os.path.dirname(os.path.abspath(__file__))
PROJET = os.path.abspath(os.path.join(ICI, '..', '..'))
lire = lambda n: json.load(open(os.path.join(ICI, 'osm', n + '.json'), encoding='utf-8'))
poi, bat, rues, zones, arbres = lire('poi'), lire('batiments'), lire('rues'), lire('zones'), lire('arbres')
try:
    reperes = lire('reperes')
except Exception:
    reperes = {'elements': []}

# l'origine : le point de la boutique dans OSM (le café « L'Armoire à Cuillères »)
shop = next(e for e in poi['elements'] if e['type'] == 'node' and 'Armoire' in e.get('tags', {}).get('name', ''))
LAT0, LON0 = shop['lat'], shop['lon']
phi = math.radians(LAT0)
M_LAT = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
def proj(lat, lon):
    return ((lon - LON0) * M_LON, -(lat - LAT0) * M_LAT)  # mètres, y vers le sud

def dp(pts, tol):
    """Douglas-Peucker"""
    if len(pts) < 3: return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, -1
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x1 * y0 - y1 * x0) / L if L > 1e-6 else math.hypot(x - x0, y - y0)
        if d > dmax: imax, dmax = i, d
    if dmax > tol:
        a = dp(pts[:imax + 1], tol); b = dp(pts[imax:], tol)
        return a[:-1] + b
    return [pts[0], pts[-1]]

def anneau(pts, tol):
    """un contour fermé simplifié (au moins 3 points)"""
    if len(pts) > 3 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 3: return None
    # on coupe au point le plus loin du premier pour garder la forme
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[:far + 1], tol); b = dp(pts[far:] + [pts[0]], tol)
    r = a[:-1] + b[:-1]
    return r if len(r) >= 3 else None

def dm(v): return int(round(v * 10))
def chemin(anneaux=(), lignes=()):
    """d en décimètres, commandes relatives (compact)"""
    out = []
    for pts, ferme in [(a, True) for a in anneaux] + [(l, False) for l in lignes]:
        q = [(dm(x), dm(y)) for x, y in pts]
        s = f'M{q[0][0]} {q[0][1]}'
        px, py = q[0]
        seg = []
        for x, y in q[1:]:
            if (x, y) == (px, py): continue
            seg.append(f'{x - px} {y - py}'); px, py = x, y
        if not seg: continue
        s += 'l' + ' '.join(seg)
        if ferme: s += 'z'
        out.append(s)
    return re.sub(r' -', '-', ''.join(out))

def geom(e):
    return [proj(p['lat'], p['lon']) for p in e.get('geometry', []) if p]

def aire(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

def dedans(pt, pts):
    x, y = pt; c = False
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def relation_anneaux(e):
    """les contours extérieurs et intérieurs d'une relation multipolygone (membres déjà en géométrie)"""
    ext, inte = [], []
    morceaux = {'outer': [], 'inner': []}
    for m in e.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'): continue
        morceaux['inner' if m.get('role') == 'inner' else 'outer'].append([proj(p['lat'], p['lon']) for p in m['geometry'] if p])
    for role, lst in morceaux.items():
        # recoller les morceaux bout à bout
        restes = [l[:] for l in lst]
        while restes:
            cur = restes.pop(0)
            change = True
            while change and cur[0] != cur[-1]:
                change = False
                for i, l in enumerate(restes):
                    if l[0] == cur[-1]: cur += l[1:]; restes.pop(i); change = True; break
                    if l[-1] == cur[-1]: cur += l[::-1][1:]; restes.pop(i); change = True; break
            (ext if role == 'outer' else inte).append(cur)
    return ext, inte

# ---------- les bâtiments (rayon 190 m) ----------
TEINTES = 6
toits = [[] for _ in range(TEINTES)]
tous, cultes, faitages, boutique = [], [], [], None
nb = 0
for e in bat['elements']:
    t = e.get('tags', {})
    if e['type'] == 'way':
        ext, inte = [geom(e)], []
    else:
        ext, inte = relation_anneaux(e)
    ext = [anneau(a, 0.25) for a in ext]; ext = [a for a in ext if a and abs(aire(a)) > 4]
    inte = [anneau(a, 0.25) for a in inte]; inte = [a for a in inte if a and abs(aire(a)) > 2]
    if not ext: continue
    nb += 1
    culte = t.get('building') in ('cathedral', 'church', 'chapel') or t.get('amenity') == 'place_of_worship'
    if not culte and boutique is None and any(dedans((0, 0), a) for a in ext):
        boutique = ext[0]
    anneaux = ext + inte
    tous.extend(anneaux)
    if culte: cultes.extend(anneaux)
    else: toits[e['id'] % TEINTES].extend(anneaux)
    # le faîtage : l'axe long du bâtiment (analyse en composantes principales), s'il est à peu près rectangulaire
    a = ext[0]
    if len(a) >= 4 and abs(aire(a)) > 25 and not culte:
        cx = sum(p[0] for p in a) / len(a); cy = sum(p[1] for p in a) / len(a)
        sxx = sum((p[0] - cx) ** 2 for p in a); syy = sum((p[1] - cy) ** 2 for p in a); sxy = sum((p[0] - cx) * (p[1] - cy) for p in a)
        ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
        ux, uy = math.cos(ang), math.sin(ang)
        us = [(p[0] - cx) * ux + (p[1] - cy) * uy for p in a]; vs = [-(p[0] - cx) * uy + (p[1] - cy) * ux for p in a]
        L, W = max(us) - min(us), max(vs) - min(vs)
        if W > 0 and abs(aire(a)) / (L * W) > 0.72:
            m = (max(us) + min(us)) / 2; n = (max(vs) + min(vs)) / 2
            demi = max(0.0, (L - W * 0.55) / 2)
            ox, oy = cx + m * ux - n * uy, cy + m * uy + n * ux
            if demi > 0.8: faitages.append([(ox - ux * demi, oy - uy * demi), (ox + ux * demi, oy + uy * demi)])

# ---------- les rues (rayon 1000 m) ----------
CLASSES = {
    'grandes': {'primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'trunk_link', 'tertiary', 'tertiary_link'},
    'rues': {'residential', 'unclassified', 'living_street', 'busway', 'road'},
    'pietonnes': {'pedestrian'},
    'chemins': {'footway', 'path', 'steps', 'cycleway'},
}
lignes = {k: [] for k in CLASSES}
noms_rues = {}
for e in rues['elements']:
    t = e.get('tags', {})
    h = t.get('highway')
    if t.get('area') == 'yes': continue
    if t.get('footway') in ('sidewalk', 'crossing', 'traffic_island', 'access_aisle') or t.get('path') == 'sidewalk': continue
    cl = next((k for k, v in CLASSES.items() if h in v), None)
    if not cl: continue
    pts = geom(e)
    if len(pts) < 2: continue
    d0 = min(math.hypot(x, y) for x, y in pts)
    if cl == 'chemins' and d0 > 380: continue  # (les ruelles du vieux centre seulement)
    lignes[cl].append(dp(pts, 0.8))
    if t.get('name'): noms_rues.setdefault(t['name'], []).append(pts)
tram = []
for e in zones['elements']:
    if e.get('tags', {}).get('railway') == 'tram' and e['type'] == 'way':
        tram.append(dp(geom(e), 1.0))

# ---------- les zones : parcs, places, lieux de culte ----------
parcs, places = [], []
for e in zones['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node': continue
    if e['type'] == 'way':
        ext, inte = [geom(e)], []
    else:
        ext, inte = relation_anneaux(e)
    ext = [anneau(a, 0.6) for a in ext]; ext = [a for a in ext if a and abs(aire(a)) > 10 and a[0] != a[-1] or a and abs(aire(a)) > 10]
    inte = [anneau(a, 0.6) for a in inte]; inte = [a for a in inte if a]
    if not ext: continue
    if t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'park') or t.get('natural') in ('wood', 'scrub'):
        parcs.extend(ext + inte)
    elif t.get('place') == 'square' or t.get('highway') == 'pedestrian' or 'area:highway' in t:
        places.extend(ext + inte)

# ---------- les arbres (rayon 220 m) ----------
arb = []
for e in arbres['elements']:
    x, y = proj(e['lat'], e['lon'])
    arb += [dm(x), dm(y)]

# ---------- l'orientation : la rue des Chaussetiers devant la boutique ----------
best = None
for e in rues['elements']:
    if e.get('tags', {}).get('name') != 'Rue des Chaussetiers': continue
    pts = geom(e)
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy or 1e-9
        u = max(0, min(1, -(x1 * dx + y1 * dy) / L2))
        px, py = x1 + u * dx, y1 + u * dy
        d = math.hypot(px, py)
        if best is None or d < best[0]: best = (d, px, py, dx, dy)
_, px, py, dx, dy = best
# la normale, de la boutique vers la rue ; on tourne la carte pour qu'elle pointe vers le bas de l'écran (on regarde
# la vitrine depuis la rue, puis on s'élève et on bascule vers le sol : la rue en bas, l'immeuble au-dessus)
nx, ny = px, py
if math.hypot(nx, ny) < 0.5:
    nx, ny = -dy, dx
ang_n = math.degrees(math.atan2(ny, nx))
orientation = round(90 - ang_n, 1)

# ---------- les repères (étiquettes) ----------
def centre_de(ident):
    for src in (zones, bat, reperes):
        for e in src['elements']:
            if f"{e['type']}/{e['id']}" == ident:
                if e.get('center'): return proj(e['center']['lat'], e['center']['lon'])
                if e['type'] == 'way':
                    g = geom(e); return (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g))
                ext, _ = relation_anneaux(e)
                g = [p for a in ext for p in a]; return (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g))
    return None
CHOIX = [
    ('way/67517840', 'Cathédrale', 'culte'),
    ('relation/5615828', 'Place de Jaude', 'place'),
    ('relation/5143699', 'Place de la Victoire', 'place'),
    ('way/4245800', 'Jardin Lecoq', 'parc'),
    ('way/67358511', 'Notre-Dame-du-Port', 'culte'),
    ('way/32124235', 'Place Saint-Pierre', 'place'),
    ('way/67518352', 'Opéra', 'lieu'),
    ('way/27635216', 'Place Delille', 'place'),
    ('relation/6724254', 'Place de la Résistance', 'place'),
]
rep = []
for ident, nom, genre in CHOIX:
    c = centre_de(ident)
    if c and math.hypot(*c) < 1000: rep.append([dm(c[0]), dm(c[1]), nom, genre])
# la rue des Chaussetiers, son nom le long d'elle : le segment devant la boutique
rue_nom = [dm(px), dm(py), round(math.degrees(math.atan2(dy, dx)), 1)]


# ---------- le gros plan : les maisons à moins de 45 m, une par une (au décimètre), la façade de la boutique ----------
proches = []
for e in bat['elements']:
    t = e.get('tags', {})
    if e['type'] == 'way':
        ext = [geom(e)]
    else:
        ext, _ = relation_anneaux(e)
    for a in ext:
        if len(a) < 4 or min(math.hypot(x, y) for x, y in a) > 45: continue
        r = anneau(a, 0.06)
        if not r or abs(aire(r)) < 3: continue
        est = dedans((0, 0), r)
        proches.append({'p': [v for x, y in r for v in (dm(x), dm(y))], 'b': 1 if est else 0, 'i': e['id'] % 97})
# la façade : le côté du bâtiment de la boutique le plus proche de la rue (devant la boutique)
fac = None
if boutique:
    for i in range(len(boutique)):
        (x1, y1), (x2, y2) = boutique[i], boutique[(i + 1) % len(boutique)]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        d = math.hypot(mx - px, my - py) - 0.2 * math.hypot(x2 - x1, y2 - y1)
        if fac is None or d < fac[0]: fac = (d, x1, y1, x2, y2)

donnees = {
    'source': '© les contributeurs d’OpenStreetMap (ODbL)',
    'unite': 'dm',
    'orientation': orientation,
    'toits': [chemin(t) for t in toits],
    'ombres': chemin(tous),
    'cultes': chemin(cultes),
    'boutique': chemin([boutique]) if boutique else '',
    'faitages': chemin(lignes=faitages),
    'rues': {k: chemin(lignes=v) for k, v in lignes.items()},
    'tram': chemin(lignes=tram),
    'parcs': chemin(parcs),
    'places': chemin(places),
    'arbres': arb,
    'reperes': rep,
    'rue': rue_nom,
    'proches': proches,
    'facade': [dm(v) for v in fac[1:]] if fac else None,
}
js = ('/* Le quartier de L’Armoire à Cuillères, vu du dessus : les données d’OpenStreetMap (© les contributeurs\n'
      '   d’OpenStreetMap, licence ODbL), en décimètres autour de la boutique (x vers l’est, y vers le sud), simplifiées.\n'
      '   Produit une fois (outil hors du site) ; chargé seulement quand on remonte au-dessus de la devanture. */\n'
      'self.AC_VILLE = ' + json.dumps(donnees, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(os.path.join(PROJET, 'js', 'ac-ville-donnees.js'), 'w', encoding='utf-8', newline='\n').write(js)
print('proches', len(proches), 'facade', [dm(v) for v in fac[1:]] if fac else None, 'longueur', round(math.hypot(fac[3]-fac[1], fac[4]-fac[2]), 2) if fac else 0)
print('bâtiments', nb, '| cultes', len(cultes), '| faîtages', len(faitages), '| boutique', 'oui' if boutique else 'NON')
print('rues', {k: len(v) for k, v in lignes.items()}, '| tram', len(tram), '| parcs', len(parcs), '| places', len(places), '| arbres', len(arb) // 2)
print('orientation', orientation, '° | rue devant', [round(px, 1), round(py, 1)], '| repères', [r[2] for r in rep])
print('taille', len(js.encode('utf-8')) // 1024, 'Ko ; compresse ~', len(zlib.compress(js.encode('utf-8'), 9)) // 1024, 'Ko')

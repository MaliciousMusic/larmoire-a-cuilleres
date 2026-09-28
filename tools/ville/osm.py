# Récupère les données OpenStreetMap (ODbL) du quartier de L'Armoire à Cuillères, une fois, en cache sur disque.
# python tools/ville/osm.py  → tools/ville/osm/<nom>.json (non publié : .gitignore). Puis python tools/ville/prepare.py
import json, os, sys, time, urllib.parse, urllib.request

LAT, LON = 45.778325, 3.0841183
ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ICI, 'osm')
os.makedirs(OUT, exist_ok=True)
SERVEURS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
A = f'{LAT},{LON}'
REQUETES = {
    'poi': f'[out:json][timeout:60];(nwr(around:70,{A})["name"];nwr(around:70,{A})["addr:housenumber"];way(around:90,{A})["highway"];);out tags center;',
    'batiments': f'[out:json][timeout:90];(way(around:190,{A})["building"];relation(around:190,{A})["building"];way(around:190,{A})["building:part"];);out geom;',
    'rues': f'[out:json][timeout:120];(way(around:1000,{A})["highway"];);out geom;',
    'zones': f'[out:json][timeout:120];(nwr(around:1000,{A})["leisure"~"park|garden|playground"];nwr(around:1000,{A})["place"="square"];way(around:1000,{A})["highway"="pedestrian"]["area"="yes"];relation(around:1000,{A})["highway"="pedestrian"];way(around:1000,{A})["area:highway"];nwr(around:1000,{A})["landuse"~"grass|park|cemetery"];nwr(around:1000,{A})["amenity"="place_of_worship"];nwr(around:1000,{A})["natural"~"water|wood|scrub"];way(around:1000,{A})["railway"="tram"];);out geom;',
    'arbres': f'[out:json][timeout:60];(node(around:220,{A})["natural"="tree"];);out;',
    'reperes': f'[out:json][timeout:90];(nwr(around:1100,{A})["place"="square"]["name"];nwr(around:1100,{A})["tourism"~"attraction|museum"]["name"];nwr(around:1100,{A})["amenity"~"place_of_worship|townhall|theatre|marketplace"]["name"];nwr(around:1100,{A})["leisure"="park"]["name"];nwr(around:1100,{A})["railway"="station"]["name"];);out tags center;',
}

def requete(nom, q):
    chemin = os.path.join(OUT, nom + '.json')
    if os.path.exists(chemin) and os.path.getsize(chemin) > 200:
        return json.load(open(chemin, encoding='utf-8'))
    donnees = urllib.parse.urlencode({'data': q}).encode()
    for essai in range(8):
        for url in SERVEURS:
            try:
                req = urllib.request.Request(url, data=donnees, headers={'User-Agent': 'armoire-maquette/1.0 (extrait ponctuel, un seul passage)'})
                with urllib.request.urlopen(req, timeout=150) as r:
                    brut = r.read()
                d = json.loads(brut)
                if 'elements' in d:
                    open(chemin, 'wb').write(brut)
                    print(nom, 'ok', url, len(d['elements']), 'éléments', flush=True)
                    return d
            except Exception as e:
                print(nom, 'échec', url, str(e)[:80], flush=True)
        time.sleep(8 + essai * 6)
    raise SystemExit('impossible : ' + nom)

for nom, q in REQUETES.items():
    if len(sys.argv) > 1 and nom not in sys.argv[1:]:
        continue
    requete(nom, q)
print('fini')

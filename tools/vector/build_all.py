"""Reconstruit tous les éléments de marque vectorisés, dans l'ordre des dépendances.

Usage (depuis la racine du projet ou d'ailleurs) : python tools/vector/build_all.py [--vite]
  --vite : réutilise les masques du râtelier déjà séparés (_work/rack_masks.npz)

Durée : ~6 min (dont ~3 min pour la séparation des dix cuillères du râtelier).
"""
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

STEPS = [
    ("cuillere.py", []),  # 2. la grande cuillère (sert au logo et à la cuillère n° 2 du râtelier)
    ("logo.py", []),  # 1. le logo (lettrage + cuillère reportée)
    ("cuilleres.py", ["build"]),  # 3. le râtelier (séparation + tracé)
    ("tasses.py", []),  # 4. les tasses
    ("feuilles_seg.py", []),  # 5a. feuilles : segmentation par couleur
    ("feuilles.py", []),  # 5b. feuilles : complétion des formes et des détails
    ("feuilles_out.py", []),  # 5c. feuilles : tracé, repères normalisés, feuilles.svg
    ("build_js.py", []),  # js/ac-brand.js
]


def main():
    fast = "--vite" in sys.argv
    t0 = time.time()
    for script, args in STEPS:
        if script == "cuilleres.py" and fast:
            args = args + ["cache"]
        t = time.time()
        print(f"== {script} {' '.join(args)}", flush=True)
        subprocess.run([sys.executable, str(HERE / script)] + args, cwd=HERE, check=True)
        print(f"   ({time.time() - t:.0f} s)", flush=True)
    print(f"Terminé en {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()

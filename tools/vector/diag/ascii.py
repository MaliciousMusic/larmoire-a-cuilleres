"""Outil de diagnostic (voir ../README.md) : lancer depuis tools/vector/ : python diag/ascii.py …"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sys
import numpy as np
import cuilleres as C
ink = C.load()
x0, y0, x1, y1 = map(int, sys.argv[1:5])
print("     " + "".join(str((x // 10) % 10) if x % 10 == 0 else " " for x in range(x0, x1)))
for y in range(y0, y1):
    row = ink[y, x0:x1]
    print(f"{y:4d} " + "".join("#" if v > 0.5 else ("+" if v > 0.25 else ".") for v in row))

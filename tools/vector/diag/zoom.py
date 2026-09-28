"""Outil de diagnostic (voir ../README.md) : lancer depuis tools/vector/ : python diag/zoom.py …"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sys
import numpy as np
from vec import *
from PIL import Image, ImageDraw
src = sys.argv[1]
x0,y0,x1,y1,z = map(int, sys.argv[2:7])
name = sys.argv[7]
rgb=load_rgb(src)
im=Image.fromarray((rgb*255).astype(np.uint8))
c=im.crop((x0,y0,x1,y1)).resize(((x1-x0)*z,(y1-y0)*z),Image.BICUBIC if len(sys.argv)<9 else Image.NEAREST)
d=ImageDraw.Draw(c)
step = 5 if z >= 8 else 10
for x in range((x0//step+1)*step, x1, step):
    d.line([((x-x0)*z,0),((x-x0)*z,(y1-y0)*z)], fill=(255,0,0) if x%50==0 else (255,150,150), width=1)
    if x % 10 == 0: d.text(((x-x0)*z+2,2), str(x), fill=(200,0,0))
for y in range((y0//step+1)*step, y1, step):
    d.line([(0,(y-y0)*z),((x1-x0)*z,(y-y0)*z)], fill=(0,0,255) if y%50==0 else (150,150,255), width=1)
    if y % 10 == 0: d.text((2,(y-y0)*z+2), str(y), fill=(0,0,200))
c.save('_work/'+name)

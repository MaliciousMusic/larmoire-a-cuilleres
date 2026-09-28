"""Squelette d'un dessin au trait -> traits continus ordonnés (animation « à la plume »).

1. le masque des traits est agrandi k fois (bicubique puis seuil 0,5), puis squelettisé (skimage) ;
2. le squelette devient un graphe : extrémités, jonctions (grappes de pixels regroupées), arêtes ;
3. les ergots courts (artefacts aux coins et bouts de trait) sont élagués ;
4. aux jonctions, les arêtes sont appariées deux à deux par continuité de direction
   (la paire la plus « droite » d'abord) : on obtient des traits continus, ouverts ou fermés ;
5. lissage léger, Douglas-Peucker, coordonnées ramenées au repère source ;
6. tri de haut en bas, chaque trait commence par son extrémité la plus haute.
"""
from __future__ import annotations

import math

import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

from vec import upscale

NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _neighbors(sk, y, x):
    h, w = sk.shape
    for dy, dx in NB:
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w and sk[yy, xx]:
            yield yy, xx


def skeleton_graph(sk: np.ndarray):
    """Renvoie (nodes, edges). nodes: {id: (cy, cx, [pixels])}; edges: [ [n0, n1, [(y,x)...]] ]
    n = -1 pour une boucle isolée (sans nœud)."""
    sk = sk.astype(bool)
    deg = ndi.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - 1
    deg = np.where(sk, deg, 0)
    junction = sk & (deg >= 3)
    endpoint = sk & (deg == 1)
    jl, nj = ndi.label(junction, structure=np.ones((3, 3)))
    node_of = -np.ones(sk.shape, np.int64)
    nodes = {}
    for i, sl in enumerate(ndi.find_objects(jl)):
        ys, xs = np.nonzero(jl[sl] == i + 1)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        node_of[ys, xs] = i
        nodes[i] = (float(ys.mean()), float(xs.mean()), list(zip(ys.tolist(), xs.tolist())))
    nid = nj
    for y, x in zip(*np.nonzero(endpoint)):
        node_of[y, x] = nid
        nodes[nid] = (float(y), float(x), [(int(y), int(x))])
        nid += 1
    # isolés (deg 0) : on les ignore

    visited = np.zeros(sk.shape, bool)
    edges = []
    for n, (cy, cx, pix) in list(nodes.items()):
        for (py, px) in pix:
            for (qy, qx) in _neighbors(sk, py, px):
                if node_of[qy, qx] == n:
                    continue
                if node_of[qy, qx] >= 0:
                    # deux nœuds adjacents : arête courte
                    m = node_of[qy, qx]
                    if n < m:
                        edges.append([n, int(m), [(py, px), (qy, qx)]])
                    continue
                if visited[qy, qx]:
                    continue
                path = [(py, px), (qy, qx)]
                visited[qy, qx] = True
                prev = (py, px)
                cur = (qy, qx)
                end = None
                while True:
                    nxt = None
                    for (ry, rx) in _neighbors(sk, *cur):
                        if (ry, rx) == prev:
                            continue
                        if node_of[ry, rx] >= 0 and node_of[ry, rx] != -1:
                            if (ry, rx) in pix and len(path) <= 2:
                                continue
                            end = (ry, rx)
                            break
                        if not visited[ry, rx]:
                            nxt = (ry, rx)
                            break
                    if end is not None:
                        path.append(end)
                        edges.append([n, int(node_of[end]), path])
                        break
                    if nxt is None:
                        # cul-de-sac inattendu (ne devrait pas arriver) : on termine ici
                        edges.append([n, -2, path])
                        break
                    visited[nxt] = True
                    path.append(nxt)
                    prev, cur = cur, nxt
    # boucles isolées (tous les pixels de degré 2)
    rest = sk & ~visited & (node_of < 0)
    rl, nr = ndi.label(rest, structure=np.ones((3, 3)))
    for i in range(1, nr + 1):
        ys, xs = np.nonzero(rl == i)
        start = (int(ys[0]), int(xs[0]))
        path = [start]
        visited[start] = True
        prev = None
        cur = start
        while True:
            nxt = None
            for q in _neighbors(sk, *cur):
                if q != prev and not visited[q] and rl[q] == i:
                    nxt = q
                    break
            if nxt is None:
                break
            visited[nxt] = True
            path.append(nxt)
            prev, cur = cur, nxt
        path.append(start)
        edges.append([-1, -1, path])
    return nodes, edges


def _dir_at(path, from_start: bool, dist: float):
    """Direction (unitaire) de l'arête en partant de son extrémité, mesurée sur ~dist pixels."""
    pts = path if from_start else path[::-1]
    p0 = np.array(pts[0], float)
    q = None
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += math.hypot(b[0] - a[0], b[1] - a[1])
        q = np.array(b, float)
        if acc >= dist:
            break
    if q is None:
        return np.zeros(2)
    v = q - p0
    n = np.linalg.norm(v)
    return v / n if n else v


def _length(path):
    p = np.asarray(path, float)
    return float(np.sum(np.hypot(*np.diff(p, axis=0).T))) if len(p) > 1 else 0.0


def prune_spurs(nodes, edges, dist, factor=1.3, extra=2.0, rounds=3):
    """Supprime les arêtes nœud-jonction -> extrémité plus courtes que factor*demi-largeur + extra."""
    for _ in range(rounds):
        deg = {}
        for e in edges:
            for n in (e[0], e[1]):
                deg[n] = deg.get(n, 0) + 1
        keep = []
        removed = 0
        for e in edges:
            a, b, path = e
            if a == -1 and b == -1:
                keep.append(e)
                continue
            da, db = deg.get(a, 0), deg.get(b, 0)
            is_spur = (da >= 3 and db == 1) or (db >= 3 and da == 1)
            if is_spur:
                j = a if da >= 3 else b
                cy, cx = nodes[j][0], nodes[j][1]
                hw = float(dist[int(round(cy)), int(round(cx))])
                if _length(path) < factor * hw + extra:
                    removed += 1
                    continue
            keep.append(e)
        edges = keep
        if not removed:
            break
    return edges


def contract_short_edges(nodes, edges, dist, factor=1.5, extra=1.0):
    """Fusionne les jonctions reliées par une arête courte : un X épais donne souvent deux Y rapprochés
    reliés par un bout d'arête ; on en refait un seul nœud à 4 branches."""
    deg = {}
    for a, b, _ in edges:
        for n in (a, b):
            deg[n] = deg.get(n, 0) + 1
    parent = {n: n for n in nodes}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    keep = []
    dropped = []
    for e in edges:
        a, b, path = e
        if a >= 0 and b >= 0 and a != b and deg.get(a, 0) >= 3 and deg.get(b, 0) >= 3:
            hw = max(float(dist[int(round(nodes[a][0])), int(round(nodes[a][1]))]),
                     float(dist[int(round(nodes[b][0])), int(round(nodes[b][1]))]))
            if _length(path) <= factor * 2 * hw + extra:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[ra] = rb
                dropped.append((a, path))
                continue
        keep.append(e)
    groups = {}
    for n in nodes:
        groups.setdefault(find(n), []).append(n)
    dropped_pix = {}
    for a, path in dropped:
        dropped_pix.setdefault(find(a), []).extend(path)
    new_nodes = {}
    for r, members in groups.items():
        pix = [p for m in members for p in nodes[m][2]] + dropped_pix.get(r, [])
        new_nodes[r] = (float(np.mean([p[0] for p in pix])), float(np.mean([p[1] for p in pix])), pix)
    new_edges = [[find(a) if a >= 0 else a, find(b) if b >= 0 else b, path] for a, b, path in keep]
    return new_nodes, new_edges


def pair_edges(nodes, edges, dist, max_turn_deg=75.0):
    """Appariement des bouts d'arêtes à chaque nœud : {(arête, côté): (arête, côté)}."""
    ends = {}
    for i, (a, b, path) in enumerate(edges):
        if a >= 0:
            ends.setdefault(a, []).append((i, 0))
        if b >= 0:
            ends.setdefault(b, []).append((i, 1))
    partner = {}
    cos_lim = math.cos(math.radians(180 - max_turn_deg))
    for n, lst in ends.items():
        if len(lst) < 2:
            continue
        cy, cx = nodes[n][0], nodes[n][1]
        hw = float(dist[int(round(cy)), int(round(cx))])
        d = max(6.0, 3.0 * hw)
        dirs = [_dir_at(edges[i][2], side == 0, d) for i, side in lst]
        cand = []
        for u in range(len(lst)):
            for v in range(u + 1, len(lst)):
                if lst[u][0] == lst[v][0]:
                    continue
                cand.append((float(np.dot(dirs[u], dirs[v])), u, v))
        cand.sort()
        used = set()
        for c, u, v in cand:
            if u in used or v in used:
                continue
            if c > cos_lim and len(lst) > 2:
                continue
            used.add(u)
            used.add(v)
            partner[lst[u]] = lst[v]
            partner[lst[v]] = lst[u]
    return partner


def chain_edge_seqs(edges, partner):
    """Chaînes sous forme de suites [(arête, côté d'entrée)], plus un drapeau « fermée »."""
    done = set()
    seqs = []

    def walk(i, side_in):
        seq = []
        start = (i, side_in)
        closed = False
        while True:
            done.add(i)
            seq.append((i, side_in))
            nxt = partner.get((i, 1 - side_in))
            if nxt is None:
                break
            if nxt == start:
                closed = True
                break
            if nxt[0] in done:
                break
            i, side_in = nxt
        return seq, closed

    for i, (a, b, path) in enumerate(edges):
        if i in done:
            continue
        if a == -1 and b == -1:
            done.add(i)
            seqs.append(([(i, 0)], True))
            continue
        for side in (0, 1):
            if (i, side) not in partner:
                seqs.append(walk(i, side))
                break
    for i in range(len(edges)):
        if i not in done:
            seq, closed = walk(i, 0)
            seqs.append((seq, True))
    return seqs


def chain_edges(nodes, edges, dist, max_turn_deg=75.0):
    """Apparie les arêtes aux nœuds et renvoie des polylignes (listes de (y, x)) continues."""
    ends = {}  # nœud -> [(edge_idx, côté)] côté 0 = début du chemin, 1 = fin
    for i, (a, b, path) in enumerate(edges):
        if a >= 0:
            ends.setdefault(a, []).append((i, 0))
        if b >= 0:
            ends.setdefault(b, []).append((i, 1))
    partner = {}  # (edge, côté) -> (edge, côté)
    cos_lim = math.cos(math.radians(180 - max_turn_deg))
    for n, lst in ends.items():
        if len(lst) < 2:
            continue
        cy, cx = nodes[n][0], nodes[n][1]
        hw = float(dist[int(round(cy)), int(round(cx))])
        d = max(6.0, 3.0 * hw)
        dirs = [_dir_at(edges[i][2], side == 0, d) for i, side in lst]
        cand = []
        for u in range(len(lst)):
            for v in range(u + 1, len(lst)):
                if lst[u][0] == lst[v][0]:
                    continue  # boucle sur le même nœud : on la laisse fermée ailleurs
                c = float(np.dot(dirs[u], dirs[v]))  # -1 = parfaitement dans le prolongement
                cand.append((c, u, v))
        cand.sort()
        used = set()
        for c, u, v in cand:
            if u in used or v in used:
                continue
            if c > cos_lim and len(lst) > 2:
                continue  # à une vraie jonction, on ne poursuit que dans le prolongement
            used.add(u)
            used.add(v)
            partner[lst[u]] = lst[v]
            partner[lst[v]] = lst[u]

    done = set()
    strokes = []

    def walk(i, side_in):
        """Parcourt la chaîne en entrant dans l'arête i par son côté side_in."""
        pts = []
        closed = False
        start = (i, side_in)
        while True:
            done.add(i)
            path = edges[i][2] if side_in == 0 else edges[i][2][::-1]
            if pts:
                path = path[1:]
            pts.extend(path)
            out = (i, 1 - side_in)
            nxt = partner.get(out)
            if nxt is None:
                break
            if nxt == start:
                closed = True
                break
            if nxt[0] in done:
                break
            i, side_in = nxt
        return pts, closed

    # d'abord les chaînes ouvertes (depuis les bouts non appariés)
    for i, (a, b, path) in enumerate(edges):
        if i in done:
            continue
        if a == -1 and b == -1:
            done.add(i)
            strokes.append((path, True))
            continue
        for side in (0, 1):
            if (i, side) not in partner:
                pts, closed = walk(i, side)
                strokes.append((pts, closed))
                break
    # puis les cycles restants
    for i in range(len(edges)):
        if i not in done:
            pts, closed = walk(i, 0)
            strokes.append((pts, True))
    return strokes


def rdp(points: np.ndarray, eps: float) -> np.ndarray:
    if len(points) < 3:
        return points
    keep = np.zeros(len(points), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = points[i], points[j]
        ab = b - a
        L = np.hypot(*ab)
        seg = points[i + 1:j]
        if L == 0:
            dd = np.hypot(*(seg - a).T)
        else:
            dd = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / L
        m = int(np.argmax(dd))
        if dd[m] > eps:
            keep[i + 1 + m] = True
            stack.append((i, i + 1 + m))
            stack.append((i + 1 + m, j))
    return points[keep]


def smooth(pts: np.ndarray, closed: bool, win=5) -> np.ndarray:
    if len(pts) < win + 2:
        return pts
    ker = np.ones(win) / win
    if closed:
        ext = np.concatenate([pts[-win:], pts, pts[:win]])
        out = np.stack([np.convolve(ext[:, 0], ker, "same"), np.convolve(ext[:, 1], ker, "same")], 1)[win:-win]
        return out
    out = pts.copy()
    h = win // 2
    for c in range(2):
        v = np.convolve(np.pad(pts[:, c], h, mode="edge"), ker, "valid")
        out[:, c] = v
    out[0] = pts[0]
    out[-1] = pts[-1]
    return out


def orient_and_sort(strokes, top_down=True):
    """strokes: liste de (pts Nx2 en (x, y), closed). Le trait commence à son point le plus haut."""
    res = []
    for pts, closed in strokes:
        if closed:
            if len(pts) > 2 and np.allclose(pts[0], pts[-1]):
                pts = pts[:-1]
            i = int(np.argmin(pts[:, 1]))
            pts = np.concatenate([pts[i:], pts[:i]])
            # sens : on descend d'abord par la gauche (sens anti-horaire à l'écran)
            nxt = pts[min(3, len(pts) - 1)]
            prv = pts[-min(3, len(pts) - 1)]
            if nxt[0] > prv[0]:
                pts = np.concatenate([pts[:1], pts[1:][::-1]])
            pts = np.concatenate([pts, pts[:1]])
        else:
            if pts[-1][1] < pts[0][1]:
                pts = pts[::-1]
        res.append((pts, closed))
    res.sort(key=lambda s: (float(s[0][:, 1].min()), float(s[0][:, 0].min())))
    return res


def strokes_from_mask(mask: np.ndarray, ink: np.ndarray | None = None, k: int = 3, top_down=True,
                      rdp_eps=0.3, min_len=1.5, split_y=None, return_closed=False):
    """mask: traits (bool) au repère source ; ink: carte d'encre [0,1] (lissée par agrandissement)."""
    src = ink if ink is not None else mask.astype(float)
    big = upscale(src, k) > 0.5
    dist = ndi.distance_transform_edt(big)
    sk = skeletonize(big)
    nodes, edges = skeleton_graph(sk)
    edges = prune_spurs(nodes, edges, dist)
    chains = chain_edges(nodes, edges, dist)
    out = []
    for path, closed in chains:
        p = np.asarray(path, float)
        xy = np.stack([(p[:, 1] + 0.5) / k, (p[:, 0] + 0.5) / k], 1)
        if _length(xy) < min_len and not closed:
            continue
        xy = smooth(xy, closed, win=5 if len(xy) > 12 else 3)
        xy = rdp(xy, rdp_eps)
        out.append((xy, closed))

    if split_y is not None:
        out = _split_at_y(out, split_y)
    ordered = orient_and_sort(out, top_down)
    if split_y is not None:
        # manche d'abord, cuilleron ensuite
        ordered.sort(key=lambda s: (float(s[0][:, 1].mean()) >= split_y, float(s[0][:, 1].min())))

    # largeurs : trait médian et masque conseillé (couverture >= 99,5 %)
    hw = dist[sk] / k
    line_w = float(np.median(hw) * 2)
    cov_mask = big
    best = None
    for w in np.arange(1.0, 12.01, 0.5):
        canvas = np.zeros(big.shape, np.uint8)
        for pts, closed in ordered:
            q = np.round(pts * k * 16).astype(np.int32)
            cv2.polylines(canvas, [q], closed, 255, thickness=max(1, int(round(w * k))), lineType=cv2.LINE_8, shift=4)
        cov = float((canvas[cov_mask] > 0).mean())
        if cov >= 0.995:
            best = (float(w), cov)
            break
    if best is None:
        best = (12.0, cov)
    info = {"lineWidth": round(line_w, 2), "maskWidth": best[0], "coverage": best[1]}
    strokes = [s[0] for s in ordered]
    if return_closed:
        return strokes, [s[1] for s in ordered], info
    return strokes, info


def _split_at_y(strokes, y):
    """Coupe les traits qui traversent l'horizontale y (manche / cuilleron)."""
    res = []
    for pts, closed in strokes:
        above = pts[:, 1] < y
        if above.all() or (~above).all():
            res.append((pts, closed))
            continue
        if closed:
            # on fait tourner la boucle pour commencer à un changement de zone
            idx = np.nonzero(above[:-1] != above[1:])[0]
            s = int(idx[0]) + 1
            pts = np.concatenate([pts[s:], pts[1:s + 1]]) if np.allclose(pts[0], pts[-1]) else np.concatenate([pts[s:], pts[:s]])
            above = pts[:, 1] < y
        cur = [pts[0]]
        for a, b, ab, bb in zip(pts, pts[1:], above, above[1:]):
            if ab != bb:
                t = (y - a[1]) / (b[1] - a[1])
                m = a + t * (b - a)
                cur.append(m)
                if len(cur) > 1:
                    res.append((np.array(cur), False))
                cur = [m]
            cur.append(b)
        if len(cur) > 1:
            res.append((np.array(cur), False))
    return res

/* ==========================================================================
   L'Armoire à Cuillères — les gâteaux de la table du goûter, calculés pixel par pixel
   (même lumière que la vaisselle : AC.R). Chaque part est « développée » comme une photo :
     1. une carte de hauteur (mm) : le corps du gâteau (sa forme, sa croûte, ses fissures),
        puis les ingrédients posés dessus, chacun objet à part (bords nets, relief propre) ;
     2. un albédo (cuisson, marbrure, poudrage…) et une brillance par zone (coulis, chocolat
        fondu et fruits nappés brillants ; cacao, mie et croûte mats) ;
     3. AC.R.normals + AC.R.shade, avec l'occlusion des creux (AC.R.cavity) et les ombres
        propres des reliefs (AC.R.sunShadow) ;
     4. une vue très légèrement oblique, la même que la vaisselle : un point à z mm remonte de
        AC.R.TILT·z mm à l'écran. On voit donc un peu la tranche du côté bas (l'intérieur : mie,
        couches), ce qui fait lire l'épaisseur. Projection par colonnes avec tampon de hauteur
        (les reliefs se cachent les uns les autres), 3 sous-lignes par pixel pour lisser les arêtes ;
     5. l'ombre portée sur l'assiette (AC.R.castShadow, hauteur réelle du gâteau).
   Aucun motif de pores ni de trous : les mies sont denses et mates, les textures sont des
   grains, des traînées de couteau ou des variations de cuisson.

   API
     AC.Gateaux.liste                               → [{ id, nom, prix, taille: [w, h] (mm), hauteur (mm), desc }]
     AC.Gateaux.rendre(id, { seed, angle }, ppm)    → sprite { canvas, shadow, w, h, ax, ay } (mm)
        angle en radians (sens horaire, comme ctx.rotate) : le gâteau tourne, la lumière non.
        (ax, ay) : centre de gravité du pied du gâteau → à poser au centre de l'assiette.
        Mis en cache (id + ppm arrondi au 1/20 + graine + angle) ; déterministe.
     AC.Gateaux.miette(id, { seed, angle }, ppm)    → sprite des miettes (et du voile de cacao des
        fondants) à poser SOUS le gâteau, même point d'ancrage (reste dans un disque de 72 mm).
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});

  // vue presque zénithale, la même que la vaisselle : un point à z mm remonte de TILT·z mm à l'écran
  const pente = () => (AC.R.TILT != null ? AC.R.TILT : 0.16);
  const SOUS = 3; // sous-lignes par pixel dans la projection (anticrénelage des arêtes)
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  /* ---------- petits outils ---------- */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, x) => {
    let t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };
  // quart de rond : de combien un bord arrondi de rayon r descend à la distance t (mm) du bord
  const arrondi = (t, r) => {
    if (t >= r) return 0;
    const e = r - (t > 0 ? t : 0);
    return r - Math.sqrt(r * r - e * e);
  };

  // couleurs : sRGB '#rrggbb' → linéaire (mémorisé), opérations en place sur [r, g, b]
  const LIN = new Map();
  const C = (hex) => {
    let c = LIN.get(hex);
    if (!c) LIN.set(hex, (c = AC.R.lin(hex)));
    return c;
  };
  const copie = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; return o; };
  const vers = (o, c, t) => {
    if (t <= 0) return o;
    if (t > 1) t = 1;
    o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t;
    return o;
  };
  const fois = (o, f) => { o[0] *= f; o[1] *= f; o[2] *= f; return o; };
  const ecrire = (T, k, c) => { const j = k * 3; T.alb[j] = c[0]; T.alb[j + 1] = c[1]; T.alb[j + 2] = c[2]; };

  // hachage entier → [0, 1)
  function h32(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // atan2 rapide (erreur < 0,002 rad)
  function fatan2(y, x) {
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    const mx = ax > ay ? ax : ay, mn = ax > ay ? ay : ax;
    if (mx === 0) return 0;
    const a = mn / mx, s = a * a;
    let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
    if (ay > ax) r = 1.57079637 - r;
    if (x < 0) r = 3.14159274 - r;
    return y < 0 ? -r : r;
  }

  // bruit de valeur rapide (≈ 12 ns), pour les grains fins ; le simplex d'AC.noise2 pour les formes
  function bruitV(seed) {
    const r = AC.rng(seed);
    const P = new Uint16Array(512), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    return function (x, y) {
      const xf = Math.floor(x), yf = Math.floor(y);
      const fx = x - xf, fy = y - yf;
      const X = xf & 255, Y = yf & 255;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // table 1D interpolée d'une fonction (bords irréguliers d'une forme)
  function tabler(n, x0, x1, f) {
    const t = new Float32Array(n + 1), k = n / (x1 - x0);
    for (let i = 0; i <= n; i++) t[i] = f(x0 + i / k);
    return (x) => {
      let p = (x - x0) * k;
      if (p <= 0) return t[0];
      if (p >= n) return t[n];
      const i = p | 0;
      return t[i] + (t[i + 1] - t[i]) * (p - i);
    };
  }

  // tampons réutilisés d'un rendu à l'autre (moins de travail pour le ramasse-miettes)
  const POOL = new Map();
  function tampon(nom, Ctor, n) {
    let a = POOL.get(nom);
    if (!a || a.length < n) {
      a = new Ctor(Math.ceil(n * 1.25));
      POOL.set(nom, a);
    }
    return a.subarray(0, n);
  }

  /* ==========================================================================
     La toile : une grille à ppm pixels par mm, serrée autour du gâteau (plus la marge du haut
     pour la vue oblique), repère « monde » en mm (x → droite, y → bas), origine au point
     d'ancrage du gâteau. Le gâteau est décrit dans son repère local (u, v), tourné de `angle` :
     monde = rot(angle)·local. La lumière reste fixe.
     ========================================================================== */
  function Toile(ppm, box, angle, hmax, mg) {
    this.ppm = ppm;
    this.px = 1 / ppm;
    // bords calés sur la grille de pixels : l'ancrage tombe sur un pixel entier
    this.x0 = Math.floor((box[0] - 1.5) * ppm) / ppm;
    this.y0 = Math.floor((box[1] - 1.5 - pente() * hmax) * ppm) / ppm;
    this.W = Math.max(4, Math.ceil((box[2] + 1.5 - this.x0) * ppm));
    this.H = Math.max(4, Math.ceil((box[3] + 1.5 - this.y0) * ppm));
    // marges du sprite autour de la toile (px) : l'ombre portée déborde
    this.M = mg ? [mg.g, mg.h, mg.d, mg.b].map((m) => Math.max(0, Math.ceil(m * ppm))) : [0, 0, 0, 0];
    const N = (this.N = this.W * this.H);
    const z = (nom, C, n) => tampon('toile:' + nom, C, n).fill(0);
    this.h = z('h', Float32Array, N); // hauteur du dessus (mm)
    this.cov = z('cov', Float32Array, N); // couverture (pied du gâteau + flaques, miettes)
    this.base = z('base', Float32Array, N); // pied du corps seul (pour l'ombre portée)
    this.alb = z('alb', Float32Array, N * 3); // albédo linéaire
    this.spec = z('spec', Float32Array, N);
    this.gloss = z('gloss', Float32Array, N).fill(12);
    this.part = z('part', Uint8Array, N); // bord le plus proche (1, 2, 3… : faces du pied) ; 0 : pas de mur à part
    this.nx = z('nx', Float32Array, N); // normale sortante du pied (repère monde)
    this.ny = z('ny', Float32Array, N);
    this.fid = z('fid', Uint8Array, N); // quel fruit est là (pour montrer sa chair s'il est coupé)
    this.idCourant = 0;
    this.ca = Math.cos(angle);
    this.sa = Math.sin(angle);
  }

  // boîte de pixels (i0, j0, i1, j1) couvrant des points locaux, élargie de pad mm
  Toile.prototype.boite = function (pts, pad) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const [u, v] of pts) {
      const x = this.ca * u - this.sa * v, y = this.sa * u + this.ca * v;
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
    }
    return [
      Math.max(0, Math.floor((a - pad - this.x0) * this.ppm)),
      Math.max(0, Math.floor((b - pad - this.y0) * this.ppm)),
      Math.min(this.W - 1, Math.ceil((c + pad - this.x0) * this.ppm)),
      Math.min(this.H - 1, Math.ceil((d + pad - this.y0) * this.ppm)),
    ];
  };

  /* Le corps : forme.eval(u, v, o) donne o.d (distance signée au bord, mm, < 0 dedans), o.part
     (quel bord) et o.gu, o.gv (normale sortante locale) ; dessus(k, u, v, o) écrit hauteur,
     albédo, brillance du pixel k (o.t = distance au bord ≥ 0).
     champs : fonctions lentes f(u, v) (formes, couleurs, déformations) évaluées sur une grille
     grossière (~1 mm) puis interpolées : o.f[0], o.f[1]… dans dessus. Les `lisses` premiers
     (le relief) sont interpolés en bicubique (Catmull-Rom) : leurs pentes restent continues,
     donc la lumière ne dessine pas la grille ; les suivants (couleurs…) en bilinéaire. */
  Toile.prototype.corps = function (forme, dessus, champs, lisses = 1) {
    const { W, ppm, px, x0, y0, ca, sa } = this;
    const b = this.boite(forme.contour(), 2);
    const o = forme.o;
    const nf = champs ? champs.length : 0;
    const nl = Math.min(lisses, nf);
    const f = (o.f = new Float32Array(Math.max(1, nf)));
    top(null);
    const pas = Math.max(2, Math.round(ppm * 1.05)), ip = 1 / pas;
    const gi0 = b[0] - pas, gj0 = b[1] - pas; // une maille de marge (le bicubique lit ±1, +2)
    const gw = Math.floor((b[2] - b[0]) / pas) + 4, gh = Math.floor((b[3] - b[1]) / pas) + 4;
    const G = nf ? new Float32Array(gw * gh * nf) : null;
    if (nf) {
      for (let gj = 0; gj < gh; gj++) {
        const y = y0 + (gj0 + gj * pas + 0.5) * px;
        for (let gi = 0; gi < gw; gi++) {
          const x = x0 + (gi0 + gi * pas + 0.5) * px;
          const u = ca * x + sa * y, v = -sa * x + ca * y, q = (gj * gw + gi) * nf;
          for (let c = 0; c < nf; c++) G[q + c] = champs[c](u, v);
        }
      }
    }
    top('corps:champs');
    const lim = 0.75 * px, bande = 2.2 * px;
    const rg = gw * nf; // une rangée de la grille
    for (let j = b[1]; j <= b[3]; j++) {
      const y = y0 + (j + 0.5) * px;
      const gy = (j - gj0) * ip, gj = gy | 0, fy = gy - gj;
      // poids de Catmull-Rom en y
      const fy2 = fy * fy, fy3 = fy2 * fy;
      const ya = 0.5 * (-fy3 + 2 * fy2 - fy), yb = 0.5 * (3 * fy3 - 5 * fy2 + 2), yc = 0.5 * (-3 * fy3 + 4 * fy2 + fy), yd = 0.5 * (fy3 - fy2);
      for (let i = b[0]; i <= b[2]; i++) {
        const x = x0 + (i + 0.5) * px;
        const u = ca * x + sa * y, v = -sa * x + ca * y;
        forme.eval(u, v, o);
        if (o.d > lim) continue;
        const k = j * W + i;
        const c = clamp01(0.5 - o.d * ppm);
        this.cov[k] = c;
        this.base[k] = c;
        this.part[k] = o.d > -bande ? o.part : 0;
        this.nx[k] = ca * o.gu - sa * o.gv;
        this.ny[k] = sa * o.gu + ca * o.gv;
        if (nf) {
          const gx = (i - gi0) * ip, gi = gx | 0, fx = gx - gi;
          const q00 = (gj * gw + gi) * nf, q01 = q00 + nf, q10 = q00 + rg, q11 = q10 + nf;
          if (nl) {
            const fx2 = fx * fx, fx3 = fx2 * fx;
            const xa = 0.5 * (-fx3 + 2 * fx2 - fx), xb = 0.5 * (3 * fx3 - 5 * fx2 + 2), xc = 0.5 * (-3 * fx3 + 4 * fx2 + fx), xd = 0.5 * (fx3 - fx2);
            for (let cc = 0; cc < nl; cc++) {
              let acc = 0;
              for (let r = -1, q = q00 - rg - nf + cc; r <= 2; r++, q += rg) {
                const wy = r === -1 ? ya : r === 0 ? yb : r === 1 ? yc : yd;
                acc += wy * (G[q] * xa + G[q + nf] * xb + G[q + 2 * nf] * xc + G[q + 3 * nf] * xd);
              }
              f[cc] = acc;
            }
          }
          const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
          for (let cc = nl; cc < nf; cc++) f[cc] = G[q00 + cc] * w00 + G[q01 + cc] * w01 + G[q10 + cc] * w10 + G[q11 + cc] * w11;
        }
        o.t = o.d < 0 ? -o.d : 0;
        dessus(k, u, v, o);
      }
    }
  };

  /* Un objet posé : f(k, du, dv) pour chaque pixel du disque de rayon rad (mm) autour du point
     local (ou, ov) ; du, dv : position locale relative au centre. */
  Toile.prototype.objet = function (ou, ov, rad, f) {
    const { W, H, ppm, px, x0, y0, ca, sa } = this;
    const cx = ca * ou - sa * ov, cy = sa * ou + ca * ov;
    const i0 = Math.max(0, Math.floor((cx - rad - x0) * ppm)), i1 = Math.min(W - 1, Math.ceil((cx + rad - x0) * ppm));
    const j0 = Math.max(0, Math.floor((cy - rad - y0) * ppm)), j1 = Math.min(H - 1, Math.ceil((cy + rad - y0) * ppm));
    const r2 = rad * rad;
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + (j + 0.5) * px - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * px - cx;
        if (dx * dx + dy * dy > r2) continue;
        f(j * W + i, ca * dx + sa * dy, -sa * dx + ca * dy);
      }
    }
  };

  // hauteur du dessus au point local (u, v) ; moyenne sur une petite croix de rayon r si r > 0
  Toile.prototype.hA = function (u, v, r = 0) {
    const one = (uu, vv) => {
      const x = this.ca * uu - this.sa * vv, y = this.sa * uu + this.ca * vv;
      const i = Math.floor((x - this.x0) * this.ppm), j = Math.floor((y - this.y0) * this.ppm);
      if (i < 0 || j < 0 || i >= this.W || j >= this.H) return 0;
      return this.h[j * this.W + i];
    };
    if (!r) return one(u, v);
    return (one(u, v) * 2 + one(u + r, v) + one(u - r, v) + one(u, v + r) + one(u, v - r)) / 6;
  };

  /* Dépose un point d'objet : hauteur z (mm), couverture a (bord anticrénelé), albédo c,
     brillance sp/gl. Ce qui passe sous la surface existante reste caché (l'objet s'y enfonce) ;
     ce qui dépasse du pied du gâteau est coupé, sauf si dehors (flaque, miette sur l'assiette). */
  Toile.prototype.poser = function (k, z, a, c, sp, gl, garderMur, dehors) {
    if (a <= 0.002) return;
    const h0 = this.h[k], c0 = this.cov[k];
    const j = k * 3;
    if (c0 <= 0.002) {
      if (!dehors) return;
      this.h[k] = z;
      this.cov[k] = a;
      this.alb[j] = c[0]; this.alb[j + 1] = c[1]; this.alb[j + 2] = c[2];
      this.spec[k] = sp;
      this.gloss[k] = gl;
      this.part[k] = 0;
      this.nx[k] = 0; this.ny[k] = 0;
      this.fid[k] = this.idCourant;
      return;
    }
    if (z <= h0) return;
    if (a < 1) z = h0 + (z - h0) * a;
    this.h[k] = z;
    this.alb[j] += (c[0] - this.alb[j]) * a;
    this.alb[j + 1] += (c[1] - this.alb[j + 1]) * a;
    this.alb[j + 2] += (c[2] - this.alb[j + 2]) * a;
    this.spec[k] += (sp - this.spec[k]) * a;
    if (a > 0.5) this.gloss[k] = gl;
    if (!garderMur) this.part[k] = 0;
    if (dehors && a > c0) this.cov[k] = a;
    if (a > 0.5) this.fid[k] = this.idCourant;
  };

  /* ==========================================================================
     Développer : lumière du dessus, projection oblique, murs, assemblage, ombre portée
     ========================================================================== */
  // profilage facultatif : AC.Gateaux.profil = {} → temps cumulés par étape (ms)
  let tP = 0;
  const top = (nom) => {
    const P = AC.Gateaux && AC.Gateaux.profil;
    if (!P) return;
    const t = performance.now();
    if (nom) P[nom] = (P[nom] || 0) + (t - tP);
    tP = t;
  };

  function developper(T, rec, mur) {
    const R = AC.R;
    const { W, H, N, ppm } = T;
    const [MG, MH, MD, MB] = T.M;
    const SW = W + MG + MD, SH = H + MH + MB;
    const canvas = R.canvas(SW, SH);
    const sprite = { canvas, shadow: null, w: SW / ppm, h: SH / ppm, ax: -T.x0 + MG / ppm, ay: -T.y0 + MH / ppm };
    top(null);
    const cov = T.cov, nX = T.nx, nY = T.ny, hh = T.h, part = T.part;
    let vide = true;
    for (let i = 0; i < N; i++) if (cov[i] > 0.002) { vide = false; break; }
    if (vide) return sprite;

    // 1. le dessus, éclairé dans son repère (vu d'en haut)
    const soleil = R.sunShadow ? R.sunShadow(hh, W, H, ppm, rec.penombre || 1.1) : null;
    const creux = R.cavity ? creuxDouble(T, rec.creuxR || 1.4, rec.creuxF || 0.3, 4, rec.creuxL || 0.07) : null;
    top('creux+soleil');
    const Nn = R.normals(hh, W, H, ppm);
    top('normales');
    const dessus = R.shade({
      w: W, h: H, alb: T.alb, alpha: cov, N: Nn, spec: T.spec, gloss: T.gloss, ao: creux,
      wrap: rec.wrap != null ? rec.wrap : 0.3, sheen: rec.sheen || 0, shadow: soleil,
    }).data;
    top('lumiere');

    // 2. projection oblique : par colonne, de l'avant (bas) vers l'arrière, tampon de hauteur d'écran
    const kp = pente() * ppm, HS = H * SOUS;
    const src = tampon('src', Int32Array, W * HS).fill(-1); // point du dessus vu par chaque sous-ligne
    const zz = tampon('zz', Float32Array, W * HS); // < 0 : le dessus ; ≥ 0 : un mur, à cette hauteur (mm)
    const aMur = tampon('aMur', Int32Array, N).fill(-1); // pixel → rang dans la liste des murs
    const alS = tampon('alS', Float32Array, N); // couverture « latérale » de chaque point (bords gauche/droite)
    const murs = []; // pixels où l'on voit un mur « à part » (face coupée, côté)
    for (let i = 0; i < W; i++) {
      let yb = 1e9;
      for (let j = H - 1; j >= 0; j--) {
        const s = j * W + i, c = cov[s];
        if (c <= 0.004) continue;
        // bord avant ou arrière : la couverture raccourcit la colonne ; bord latéral : elle devient l'alpha
        // du dessus (silhouette lissée), et le mur n'est vu que si le point est au moins à moitié dans le
        // pied (sinon, d'une colonne à l'autre, les murs à moitié transparents feraient des rayures)
        let e0 = 0, e1 = 1, al = 1, murVu = true;
        if (c < 0.996) {
          const nx = nX[s], ny = nY[s];
          if (Math.abs(ny) > Math.abs(nx) + 0.05) { if (ny > 0) e1 = c; else e0 = 1 - c; }
          else { al = c; murVu = c >= 0.5; }
        }
        const d = hh[s] * kp;
        const a = j + e0 - d, b = j + e1 - d, bas = j + e1;
        const lim = yb < bas ? yb : bas;
        if (a >= lim) continue;
        alS[s] = al;
        let g0 = Math.ceil(a * SOUS - 0.5), g1 = Math.ceil(lim * SOUS - 0.5) - 1;
        if (g0 < 0) g0 = 0;
        if (g1 >= HS) g1 = HS - 1;
        const aPart = mur && part[s] > 0;
        for (let g = g0; g <= g1; g++) {
          const yc = (g + 0.5) / SOUS, o = g * W + i;
          if (yc < b) { src[o] = s; zz[o] = -1; }
          else if (murVu) {
            src[o] = s;
            zz[o] = (bas - yc) / kp;
            if (aPart) {
              const p = ((g / SOUS) | 0) * W + i;
              if (aMur[p] < 0) { aMur[p] = murs.length; murs.push(p); }
            }
          }
        }
        if (a < yb && murVu) yb = a; // un point à peine couvert ne cache rien derrière lui
      }
    }
    top('projection');

    // 3. les murs vus (faces coupées, côtés) : matière selon la hauteur, éclairés à part (liste compacte)
    let mc = null;
    const nm = murs.length;
    if (nm) {
      const wAlb = new Float32Array(nm * 3), wSp = new Float32Array(nm), wAo = new Float32Array(nm), wA = new Float32Array(nm);
      const wN = { nx: new Float32Array(nm), ny: new Float32Array(nm), nz: new Float32Array(nm) };
      const o = { c: [0, 0, 0], sp: 0, bu: 0, bz: 0 };
      const mid = SOUS >> 1;
      for (let m = 0; m < nm; m++) {
        const p = murs[m], r = (p / W) | 0, i = p - r * W;
        let s = -1, z = 0;
        for (let q = 0; q < SOUS; q++) {
          const g = (r * SOUS + q) * W + i, ss = src[g];
          if (ss >= 0 && zz[g] >= 0 && part[ss]) {
            s = ss; z = zz[g];
            if (q >= mid) break;
          }
        }
        if (s < 0) continue;
        const si = s % W, sj = (s - si) / W;
        const x = T.x0 + (si + 0.5) * T.px, y = T.y0 + (sj + 0.5) * T.px;
        const u = T.ca * x + T.sa * y, v = -T.sa * x + T.ca * y;
        o.sp = 0; o.bu = 0; o.bz = 0;
        if (!mur(u, v, z, part[s], hh[s], o, s)) continue;
        wAlb[m * 3] = o.c[0]; wAlb[m * 3 + 1] = o.c[1]; wAlb[m * 3 + 2] = o.c[2];
        wA[m] = 1;
        wSp[m] = o.sp;
        // normale : horizontale, sortante, un peu relevée ; bosselée par la texture du mur
        let nx = nX[s], ny = nY[s];
        const tx = -ny, ty = nx;
        nx += tx * o.bu; ny += ty * o.bu;
        const nz = 0.2 + o.bz;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        wN.nx[m] = nx / l; wN.ny[m] = ny / l; wN.nz[m] = nz / l;
        wAo[m] = 0.7 + 0.3 * sstep(0, 3.5, z); // le pied touche l'assiette
      }
      mc = R.shade({ w: nm, h: 1, alb: wAlb, alpha: wA, N: wN, spec: wSp, gloss: 18, ao: wAo, wrap: rec.wrapMur || 0.55 }).data;
    }
    top('murs');

    // 4. assemblage des sous-lignes (moyenne prémultipliée)
    const img = new ImageData(W, H), d = img.data;
    for (let r = 0; r < H; r++) {
      for (let i = 0; i < W; i++) {
        const p = r * W + i;
        const gA = r * SOUS * W + i;
        if (src[gA] < 0 && src[gA + W] < 0 && src[gA + 2 * W] < 0) continue; // (SOUS = 3)
        const m = aMur[p], m4 = m * 4, murOk = m >= 0 && mc[m4 + 3] > 0;
        let ar = 0, ag = 0, ab = 0, aa = 0;
        for (let q = 0; q < SOUS; q++) {
          const g = gA + q * W, s = src[g];
          if (s < 0) continue;
          const al = zz[g] >= 0 ? 1 : alS[s];
          if (murOk && zz[g] >= 0 && part[s]) {
            ar += mc[m4] * al; ag += mc[m4 + 1] * al; ab += mc[m4 + 2] * al;
          } else {
            const t4 = s * 4;
            ar += dessus[t4] * al; ag += dessus[t4 + 1] * al; ab += dessus[t4 + 2] * al;
          }
          aa += al;
        }
        if (aa <= 0) continue;
        const p4 = p * 4;
        d[p4] = ar / aa; d[p4 + 1] = ag / aa; d[p4 + 2] = ab / aa;
        d[p4 + 3] = (aa / SOUS) * 255;
      }
    }
    canvas.getContext('2d').putImageData(img, MG, MH);
    top('assemblage');

    // 5. l'ombre portée (hauteur réelle du gâteau), calculée à demi-résolution (elle est floue)
    if (rec.hauteur > 0.5) sprite.shadow = ombreDemi(T, SW, SH, rec.hauteur, rec.ombre || {});
    top('ombre');
    return sprite;
  }

  /* Occlusion des creux à deux échelles : fine (fissures, pied d'un flocon) en pleine résolution
     avec AC.R.cavity ; large (pied d'une noix, entre deux fruits) sur une grille deux fois plus
     grossière, puis interpolée. */
  function creuxDouble(T, r1, f1, r2, f2) {
    const R = AC.R, { W, H, N, ppm } = T, hh = T.h;
    const ao = R.cavity(hh, W, H, ppm, r1, f1);
    const W2 = (W + 1) >> 1, H2 = (H + 1) >> 1;
    const b = tampon('creux2', Float32Array, W2 * H2).fill(0);
    for (let j = 0; j < H; j++) {
      const jj = (j >> 1) * W2;
      for (let i = 0; i < W; i++) b[jj + (i >> 1)] += hh[j * W + i] * 0.25;
    }
    R.blur(b, W2, H2, r2 * ppm * 0.5);
    for (let j = 0; j < H; j++) {
      const gy = Math.min(H2 - 1.001, Math.max(0, (j - 0.5) * 0.5)), j0 = gy | 0, fy = gy - j0;
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (T.cov[k] <= 0.002) continue;
        const gx = Math.min(W2 - 1.001, Math.max(0, (i - 0.5) * 0.5)), i0 = gx | 0, fx = gx - i0;
        const q = j0 * W2 + i0;
        const bl = (b[q] * (1 - fx) + b[q + 1] * fx) * (1 - fy) + (b[q + W2] * (1 - fx) + b[q + W2 + 1] * fx) * fy;
        const c = bl - hh[k];
        if (c > 0) ao[k] *= Math.max(0, 1 - c * f2);
      }
    }
    return ao;
  }

  function ombreDemi(T, SW, SH, hauteur, om) {
    const R = AC.R, { W, H, ppm } = T, [MG, MH] = T.M;
    const W2 = (SW + 1) >> 1, H2 = (SH + 1) >> 1;
    const b2 = tampon('ombre', Float32Array, W2 * H2).fill(0), base = T.base;
    for (let j = 0; j < H; j++) {
      const jj = ((j + MH) >> 1) * W2;
      for (let i = 0; i < W; i++) {
        const v = base[j * W + i];
        if (v > 0) b2[jj + ((i + MG) >> 1)] += v * 0.25;
      }
    }
    const petite = R.castShadow(b2, W2, H2, ppm / 2, {
      height: hauteur, soft: om.soft != null ? om.soft : 0.5,
      opacity: om.opacity != null ? om.opacity : 0.4, contact: om.contact != null ? om.contact : 0.3,
    });
    const shadow = R.canvas(SW, SH), g = shadow.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(petite, 0, 0, W2 * 2, H2 * 2);
    return shadow;
  }

  // marges du sprite autour de la toile (mm) pour que l'ombre portée ne soit jamais coupée
  function marges(rec, hmax) {
    const R = AC.R, om = rec.ombre || {};
    const hgt = rec.hauteur || 0;
    const soft = om.soft != null ? om.soft : 0.5;
    const sig = 0.6 * hgt * soft;
    const ox = R.SHADOW_DIR[0] * hgt * 0.55, oy = R.SHADOW_DIR[1] * hgt * 0.55;
    const f = 2.4;
    return {
      g: Math.max(0, f * sig - ox - 1.5) + 0.5,
      d: Math.max(0, ox + f * sig - 1.5) + 1,
      h: Math.max(0, f * sig - oy - 1.5 - pente() * hmax) + 0.5,
      b: Math.max(0, oy + f * sig - 1.5) + 1,
    };
  }

  /* ==========================================================================
     Formes du pied (repère local, mm)
     ========================================================================== */

  /* Une part : secteur de disque de rayon R et de demi-angle demi, pointe à gauche, bissectrice
     vers +x, repère centré sur le centre de gravité. Bords légèrement irréguliers (fait main).
     o.x, o.y : repère de la pointe ; o.r : distance à la pointe ; o.th : angle ;
     o.d1, o.d2, o.d3 : distances intérieures aux faces coupées (haute, basse) et à l'arc. */
  function Part(R, demi, seed, irr = 0.3, irrArc = 0.7) {
    const g = (2 * R * Math.sin(demi)) / (3 * demi);
    const s = Math.sin(demi), c = Math.cos(demi);
    const nb = bruitV(seed * 7 + 3);
    const cut1 = tabler(Math.ceil(R) + 4, -2, R + 2, (x) => irr * nb(x * 0.09, 3.7));
    const cut2 = tabler(Math.ceil(R) + 4, -2, R + 2, (x) => irr * nb(x * 0.09, 11.3));
    const arc = tabler(400, -demi * 1.5, demi * 1.5, (th) => irrArc * (nb(th * R * 0.05, 19.1) + 0.5 * nb(th * R * 0.16, 27.3)));
    const o = { d: 0, part: 0, gu: 0, gv: 0, t: 0, x: 0, y: 0, r: 0, th: 0, d1: 0, d2: 0, d3: 0, f: null };
    return {
      R, demi, g, o,
      contour() {
        const p = [[-g - 1, 0]];
        for (let i = 0; i <= 8; i++) {
          const a = -demi + (2 * demi * i) / 8;
          p.push([(R + 1.5) * Math.cos(a) - g, (R + 1.5) * Math.sin(a)]);
        }
        return p;
      },
      eval(u, v, o) {
        const x = u + g, y = v;
        const r = Math.sqrt(x * x + y * y);
        // franchement dehors : inutile de calculer les bords irréguliers
        if (r - R > 3 || -x * s - y * c > 2 || -x * s + y * c > 2) { o.d = 9; return; }
        const th = fatan2(y, x);
        const d1 = -x * s - y * c + cut1(x);
        const d2 = -x * s + y * c + cut2(x);
        const d3 = r - R + arc(th);
        let d = d1, p = 1, gu = -s, gv = -c;
        if (d2 > d) { d = d2; p = 2; gu = -s; gv = c; }
        if (d3 > d) { d = d3; p = 3; gu = x / (r || 1); gv = y / (r || 1); }
        if (d1 > 0 && d2 > 0) { d = r; gu = x / (r || 1); gv = y / (r || 1); }
        o.d = d; o.part = p; o.gu = gu; o.gv = gv;
        o.x = x; o.y = y; o.r = r; o.th = th;
        o.d1 = -d1; o.d2 = -d2; o.d3 = -d3;
      },
      // point local à la distance a de la pointe, à la fraction f de la largeur (−1 : face haute, +1 : face basse)
      pt(a, f) {
        return [a - g, a * Math.tan(demi) * f];
      },
    };
  }

  /* Un disque irrégulier (cookie) */
  function Disque(R, seed, irr = 1.3) {
    const nb = bruitV(seed * 5 + 1);
    const rayon = tabler(720, -Math.PI, Math.PI, (th) =>
      R + irr * (nb(Math.cos(th) * 2.2 + 5, Math.sin(th) * 2.2 + 5) + 0.45 * nb(Math.cos(th) * 6 + 9, Math.sin(th) * 6 + 1)));
    const o = { d: 0, part: 0, gu: 0, gv: 0, t: 0, r: 0, th: 0, Rl: R, f: null };
    return {
      R, o,
      contour() {
        const p = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          p.push([(R + 3.5) * Math.cos(a), (R + 3.5) * Math.sin(a)]);
        }
        return p;
      },
      eval(u, v, o) {
        const r = Math.sqrt(u * u + v * v);
        if (r > R + 3.5) { o.d = 9; return; }
        const th = fatan2(v, u);
        const Rl = rayon(th);
        o.d = r - Rl; o.part = 0;
        o.gu = u / (r || 1); o.gv = v / (r || 1);
        o.r = r; o.th = th; o.Rl = Rl;
      },
    };
  }

  // maximum adouci (coins arrondis de rayon k)
  const smax = (a, b, k) => {
    const h = clamp01(0.5 - (0.5 * (b - a)) / k);
    return b + (a - b) * h + k * h * (1 - h);
  };

  /* Une tranche de cake couchée : trapèze (le moule s'évase vers le haut) coiffé du dôme du dessus,
     fendu au milieu. part 1 : semelle, 2 : côtés, 3 : dôme. */
  function Tranche(seed) {
    const Lb = 43, Lh = 47.5, yb = 26, yh = -19.5, fl = 9; // demi-largeurs, niveaux, flèche du dôme
    const cy = (Lh * Lh + yh * yh - (yh - fl) * (yh - fl)) / (2 * fl); // centre du cercle du dôme
    const Rd = Math.abs(yh - fl - cy);
    const sl = Math.atan2(Lh - Lb, yb - yh); // inclinaison des côtés
    const ns = [Math.cos(sl), Math.sin(sl)]; // normale sortante du côté droit (vers la droite, un peu vers le bas)
    const nb = bruitV(seed * 3 + 7);
    const fente = (1 + (seed % 5)) * 0.9 - 3; // la fente du dessus n'est pas toujours au milieu
    const o = { d: 0, part: 0, gu: 0, gv: 0, t: 0, db: 0, ds: 0, dd: 0, f: null };
    return {
      o,
      contour: () => [[-Lh - 2, yh - fl - 2], [Lh + 2, yh - fl - 2], [Lh + 2, yb + 2], [-Lh - 2, yb + 2]],
      eval(u, v, o) {
        const db = v - yb + 0.35 * nb(u * 0.1, 1.5); // semelle
        const au = Math.abs(u);
        const ds = (au - Lb) * ns[0] + (v - yb) * ns[1] + 0.4 * nb(v * 0.12, u > 0 ? 4.4 : 8.8); // côtés
        const rr = Math.sqrt(u * u + (v - cy) * (v - cy));
        let dd = rr - Rd + 0.5 * nb(u * 0.15, 13.1); // dôme
        dd += 3.4 * Math.exp(-((u - fente) * (u - fente)) / 9); // la fente du dessus
        const d = smax(smax(db, ds, 4), dd, 5);
        let p = 1, m = db;
        if (ds > m) { m = ds; p = 2; }
        if (dd > m) { m = dd; p = 3; }
        let gu = 0, gv = 1;
        if (p === 2) { gu = u > 0 ? ns[0] : -ns[0]; gv = ns[1]; }
        else if (p === 3) { gu = u / (rr || 1); gv = (v - cy) / (rr || 1); }
        o.d = d; o.part = p; o.gu = gu; o.gv = gv;
        o.db = -db; o.ds = -ds; o.dd = -dd;
      },
    };
  }

  /* Fissures : lignes de niveau zéro d'un bruit déformé (organiques, qui se ramifient), qui
     s'ouvrent ou se referment selon un champ de présence. Deux champs lents, à ajouter aux champs
     du corps (ils sont lisses : leur ligne zéro reste précise une fois interpolés) :
       F.ligne(u, v)    le bruit déformé dont la ligne zéro dessine les fissures
       F.troncons(u, v) où la fissure est ouverte (par tronçons, pointes effilées)
     puis, par pixel, F.eval(ligne, troncons, presence, largeur) → o.fis (0..1, dans la fissure),
     o.levre (bourrelet soulevé de part et d'autre), o.cote (−1 / +1, pour décaler les plaques). */
  function fissures(seed, periode, deform = 2.6, wmin = 0.06) {
    const n1 = AC.noise2(seed), n2 = AC.noise2(seed + 1), n3 = AC.noise2(seed + 2), nw = AC.noise2(seed + 3);
    const k = 1 / periode, dist = periode / 2.4;
    const o = { fis: 0, levre: 0, cote: 0, e: 9 };
    return {
      ligne(u, v) {
        const x = (u + deform * nw(u * 0.05 + 7.1, v * 0.05 - 3.3)) * k;
        const y = (v + deform * nw(u * 0.05 - 5.7, v * 0.05 + 9.2)) * k;
        return n1(x, y) + 0.3 * n2(x * 2.3 + 5.1, y * 2.3 - 1.7);
      },
      troncons: (u, v) => sstep(-0.25, 0.35, n3(u * k * 3.1 + 2.7, v * k * 3.1 - 4.4)),
      eval(n, seg, pres, larg) {
        const e = Math.abs(n) * dist; // distance approchée à la ligne (mm)
        o.e = e;
        o.cote = n > 0 ? 1 : -1;
        o.fis = 0;
        o.levre = 0;
        if (e > 5 || pres <= 0) return o;
        // une fente à peine ouverte ferait un trait de cheveu : en dessous de wmin, rien
        const w = larg * pres * seg;
        const ouvert = sstep(wmin, wmin * 1.6, w);
        if (ouvert <= 0) return o;
        o.fis = ouvert * (1 - sstep(w * 0.3, w * 1.3, e));
        o.levre = ouvert * pres * (0.35 + 0.65 * seg) * Math.exp(-e / 1.4) * (1 - o.fis);
        return o;
      },
    };
  }

  /* ==========================================================================
     Les ingrédients (objets posés : chacun son relief, ses bords nets)
     ========================================================================== */

  // un contour irrégulier : rayon selon l'angle (interpolé entre n sommets)
  function polyR(rnd, n, r, irr) {
    const rr = new Float32Array(n);
    for (let i = 0; i < n; i++) rr[i] = r * (1 - irr + 2 * irr * rnd());
    return (th) => {
      const a = ((((th % TAU) + TAU) % TAU) / TAU) * n;
      const i0 = Math.floor(a) % n, f = a - Math.floor(a);
      return rr[i0] * (1 - f) + rr[(i0 + 1) % n] * f;
    };
  }

  // fleur de sel : un flocon plat, translucide, qui scintille selon son inclinaison
  function flocon(T, u, v, rnd) {
    const r = rnd.range(0.7, 1.35), rot = rnd() * TAU;
    const pr = polyR(rnd, rnd.int(4, 5), r, 0.38);
    const tx = rnd.range(-0.5, 0.5), ty = rnd.range(-0.5, 0.5);
    const fa = rnd() * TAU, fx = Math.cos(fa), fy = Math.sin(fa);
    const z0 = T.hA(u, v) + 0.05;
    const c1 = C('#b8b3aa'), c2 = C('#dedad2'), col = [0, 0, 0], ppm = T.ppm;
    T.objet(u, v, r * 1.3 + 0.3, (k, du, dv) => {
      const sd = Math.sqrt(du * du + dv * dv) - pr(fatan2(dv, du) - rot);
      const a = clamp01(0.5 - sd * ppm);
      if (a <= 0) return;
      // translucide : le cristal laisse voir le brun dessous, ses arêtes accrochent la lumière
      const j = k * 3;
      col[0] = T.alb[j]; col[1] = T.alb[j + 1]; col[2] = T.alb[j + 2];
      vers(col, c1, 0.5);
      // deux facettes : l'une accroche un peu plus la lumière que l'autre
      const facette = du * fx + dv * fy > 0 ? 0.35 : 0.1;
      vers(col, c2, sstep(-0.05, -0.35, sd) * facette);
      T.poser(k, z0 + 0.18 + (du * tx + dv * ty) * 0.3, a, col, 0.6, 50);
    });
  }

  // semer de la fleur de sel sur une zone { tirer(rnd), ok(u, v, marge) }
  function semerSel(T, rnd, n, zone) {
    let pos = 0;
    for (let e = 0; e < n * 30 && pos < n; e++) {
      const [u, v] = zone.tirer(rnd);
      if (!zone.ok(u, v, 3)) continue;
      flocon(T, u, v, rnd);
      pos++;
      if (rnd() < 0.3) flocon(T, u + rnd.range(-1.8, 1.8), v + rnd.range(-1.8, 1.8), rnd);
    }
  }

  /* noisette : 'demi' (face coupée vers le haut), 'entiere' (grillée, peau par plaques) ou 'eclat' */
  function noisette(T, u, v, rnd, type, taille) {
    const ppm = T.ppm, rot = rnd() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    const nv = bruitV(rnd.int(1, 1e6));
    const a = taille / 2, b = taille * (type === 'entiere' ? 0.45 : 0.42);
    const peau = C('#6f4427'), peau2 = C('#94643c'), chair = C('#d4bc93'), chair2 = C('#bf9f6e'), grille = C('#b98c58');
    const col = [0, 0, 0], ch = [0, 0, 0];
    if (type === 'eclat') {
      const pr = polyR(rnd, rnd.int(5, 7), taille / 2, 0.32);
      const tx = rnd.range(-0.3, 0.3), ty = rnd.range(-0.3, 0.3);
      const z0 = T.hA(u, v, taille / 3) + rnd.range(0.3, 1.0);
      const peauBord = rnd() < 0.45;
      T.objet(u, v, taille * 0.8 + 0.4, (k, du, dv) => {
        const sd = Math.sqrt(du * du + dv * dv) - pr(fatan2(dv, du));
        const al = clamp01(0.5 - sd * ppm);
        if (al <= 0) return;
        const z = z0 + du * tx + dv * ty - 0.5 * sstep(-0.9, 0, sd); // facettes, arêtes adoucies
        copie(col, chair);
        vers(col, chair2, 0.5 + 0.5 * nv(du * 1.5, dv * 1.5));
        if (peauBord) vers(col, peau2, sstep(-0.7, -0.1, sd) * 0.8);
        T.poser(k, z, al, col, 0.06, 10);
      });
      return;
    }
    const enf = type === 'entiere' ? taille * 0.32 : taille * 0.1; // enfoncée dans la pâte
    const z0 = T.hA(u, v, taille / 3) - enf;
    const hh = type === 'entiere' ? taille * 0.8 : taille * 0.45;
    T.objet(u, v, a + 0.6, (k, du, dv) => {
      const x = cr * du + sr * dv, y = -sr * du + cr * dv;
      const bb = b * (1 - 0.16 * sstep(0, a, x)); // une pointe à un bout (+x)
      const irr = 1 + 0.07 * nv(x * 0.35 + 11, y * 0.35 - 7); // un contour de fruit, pas de pastille
      const q = ((x * x) / (a * a) + (y * y) / (bb * bb)) / (irr * irr);
      const sd = (Math.sqrt(q) - 1) * Math.min(a, bb);
      const al = clamp01(0.5 - sd * ppm);
      if (al <= 0) return;
      const qq = q < 1 ? q : 1;
      let z, sp;
      if (type === 'demi') {
        // la face coupée, plate et un peu rugueuse, bordée de peau sur les flancs arrondis
        z = z0 + hh * Math.min(1, 1.2 * Math.sqrt(1 - qq)) + 0.12 * nv(x * 2.4, y * 2.4);
        copie(ch, chair);
        vers(ch, chair2, clamp01(0.3 + 0.7 * nv(x * 1.3 + 4, y * 1.3)) * 0.55);
        vers(ch, grille, sstep(0.4, 0.8, qq) * 0.4);
        // le cœur de l'amande : une petite fente irrégulière, plus sombre
        const coeur = Math.exp(-(y * y) / (b * b * 0.02)) * sstep(0.7, 0.15, (x * x) / (a * a)) * (0.6 + 0.4 * nv(x * 3, 1.7));
        vers(ch, C('#a88453'), coeur * 0.55);
        vers(ch, grille, sstep(0.2, 0.6, nv(x * 0.9 - 3, y * 0.9 + 8)) * 0.55); // grillée par endroits
        vers(ch, peau2, sstep(0.45, 0.75, nv(x * 0.5 + 9, y * 0.5)) * 0.7); // un reste de peau
        copie(col, peau);
        vers(col, peau2, 0.5 + 0.5 * nv(x * 0.8, y * 0.8));
        vers(col, ch, sstep(0.95, 0.8, qq));
        sp = 0.04 + 0.12 * sstep(0.8, 0.95, qq);
      } else {
        z = z0 + hh * Math.sqrt(1 - qq) + 0.1 * nv(x * 2, y * 2);
        copie(col, peau);
        // grillée : la peau s'écaille par plaques, la chair dorée apparaît
        const pl = sstep(0.0, 0.45, nv(x * 0.45 + 7, y * 0.45 - 3) + 0.35 * nv(x * 1.3, y * 1.3));
        vers(col, grille, pl * 0.75);
        vers(col, peau2, 0.35 * (0.5 + 0.5 * nv(x * 1.1 + 2, y * 1.1)));
        vers(col, C('#b08a5c'), sstep(-0.55 * a, -0.95 * a, x) * 0.6); // le hile, à la base
        sp = 0.18 - pl * 0.1;
      }
      T.poser(k, z, al, col, sp, 24);
    });
  }

  // cerneau de noix : deux lobes ridés, un sillon au milieu
  function cerneau(T, u, v, rnd, taille) {
    const ppm = T.ppm, rot = rnd() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    const nv = bruitV(rnd.int(1, 1e6));
    const a = taille / 2, b = taille * 0.37;
    const z0 = T.hA(u, v, taille / 3) - 1.2;
    const clair = C('#b4814b'), fonce = C('#5c381c'), moyen = C('#8f5f32');
    const col = [0, 0, 0];
    T.objet(u, v, a + 0.8, (k, du, dv) => {
      const x = cr * du + sr * dv, y = -sr * du + cr * dv;
      // contour festonné (les lobes), une encoche à chaque bout
      const th = fatan2(y / b, x / a);
      const fest = 1 + 0.06 * Math.cos(th * 6 + 0.5) - 0.18 * Math.exp(-((Math.abs(th) - Math.PI) ** 2) * 8) - 0.12 * Math.exp(-(th * th) * 8);
      const q = ((x * x) / (a * a) + (y * y) / (b * b)) / (fest * fest);
      const sd = (Math.sqrt(q) - 1) * b;
      const al = clamp01(0.5 - sd * ppm);
      if (al <= 0) return;
      const qq = q < 1 ? q : 1;
      let z = 4.8 * Math.sqrt(1 - qq);
      const sillon = Math.exp(-(y * y) / 1.2);
      z *= 1 - 0.5 * sillon;
      // rides en travers des lobes, irrégulières
      const ride = Math.sin(x * 1.25 + 2.2 * nv(x * 0.25, y * 0.45) + Math.abs(y) * 0.5);
      z += 0.6 * ride * (1 - qq) * (1 - sillon) + 0.2 * nv(x * 1.3, y * 1.3);
      copie(col, moyen);
      vers(col, clair, clamp01(0.45 + 0.55 * ride) * 0.7);
      vers(col, fonce, sillon * 0.6 + clamp01(-ride) * 0.35 + sstep(0.75, 1, qq) * 0.35);
      T.poser(k, z0 + 1.2 + z, al, col, 0.14, 20);
    });
  }

  // pastille de chocolat (noir, lait, blanc) : un bouton bombé, brillant
  function pistole(T, u, v, rnd, sorte, r) {
    const ppm = T.ppm;
    const cols = { noir: ['#35201a', '#47291f'], lait: ['#6a3e25', '#7b4a2d'], blanc: ['#e3d6b9', '#ece2c9'] }[sorte];
    const c1 = C(cols[0]), c2 = C(cols[1]);
    const sp = sorte === 'blanc' ? 0.2 : 0.5, gl = sorte === 'blanc' ? 20 : 28;
    const pr = polyR(rnd, 7, r, sorte === 'blanc' ? 0.12 : 0.06);
    const hh = r * rnd.range(0.36, 0.46);
    const tip = [rnd.range(-0.3, 0.3) * r, rnd.range(-0.3, 0.3) * r];
    const z0 = T.hA(u, v, r / 2) - 0.4;
    const nv = bruitV(rnd.int(1, 1e6));
    const col = [0, 0, 0];
    T.objet(u, v, r * 1.25 + 0.5, (k, du, dv) => {
      const rl = pr(fatan2(dv, du));
      const sd = Math.sqrt(du * du + dv * dv) - rl;
      const al = clamp01(0.5 - sd * ppm);
      if (al <= 0) return;
      // dôme avec une petite pointe décentrée (la goutte du dosage)
      const q = Math.min(1, Math.hypot(du - tip[0] * 0.5, dv - tip[1] * 0.5) / rl);
      const z = z0 + hh * Math.pow(1 - q * q, 0.45) + 0.35 * Math.exp(-((du - tip[0]) ** 2 + (dv - tip[1]) ** 2) / (r * 0.3));
      copie(col, c1);
      vers(col, c2, 0.5 + 0.5 * nv(du * 0.9, dv * 0.9));
      T.poser(k, z, al, col, sp, gl);
    });
  }

  // un éclat de chocolat noir à demi fondu dans la pâte : plat, anguleux, bords adoucis, luisant
  function palet(T, u, v, rnd, r) {
    const ppm = T.ppm;
    const pr = polyR(rnd, rnd.int(5, 7), r, 0.3);
    const ex = rnd.range(0.55, 0.95), rot = rnd() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    const c1 = C('#2f1a12'), c2 = C('#46291c');
    const nv = bruitV(rnd.int(1, 1e6));
    const z0 = T.hA(u, v, r / 2);
    const hh = rnd.range(0.5, 1.1);
    const col = [0, 0, 0];
    T.objet(u, v, r * 1.35 + 0.5, (k, du, dv) => {
      const x = cr * du + sr * dv, y = (-sr * du + cr * dv) / ex;
      const sd = (Math.sqrt(x * x + y * y) - pr(fatan2(y, x))) * (0.5 + 0.5 * ex) + 0.35 * nv(du * 0.9, dv * 0.9);
      const al = clamp01(0.5 - sd * ppm);
      if (al <= 0) return;
      const z = z0 - 0.3 + hh * Math.sqrt(sstep(0, -1.2, sd)) + 0.1 * nv(du * 1.2 + 3, dv * 1.2);
      copie(col, c1);
      vers(col, c2, 0.5 + 0.5 * nv(du * 0.5 + 9, dv * 0.5));
      T.poser(k, z, al, col, 0.32, 30);
    });
  }

  /* ---- les fruits ---- */

  // une sphère (aplatie par fz) de rayon r, enfoncée de s mm ; teinte(x, y, q, col) colore et renvoie un relief
  function sphere(T, u, v, r, fz, s, sp, gl, teinte, zbase) {
    const ppm = T.ppm;
    const z0 = (zbase != null ? zbase : T.hA(u, v, r * 0.5)) - s + r * fz;
    const col = [0, 0, 0];
    T.objet(u, v, r + 0.8, (k, du, dv) => {
      const d = Math.sqrt(du * du + dv * dv);
      const al = clamp01(0.5 - (d - r) * ppm);
      if (al <= 0) return;
      const q = d < r ? d / r : 1;
      const z = z0 + r * fz * Math.sqrt(1 - q * q) + teinte(du, dv, q, col);
      T.poser(k, z, al, col, sp, gl, true);
    });
  }

  const FRUIT = { framboise: 1, mure: 2, myrtille: 3, groseille: 4, cerise: 5, creme: 6 };
  // la chair d'un fruit coupé par la tranche : [chair, cœur, peau] ; t = 0 en bas, 1 en haut du fruit
  const CHAIRS = {
    1: ['#ad2439', '#d8687a', '#86142a'], 2: ['#3a0f22', '#6c1b36', '#1a0a14'], 3: ['#b7b389', '#cbc79c', '#1d2440'],
    4: ['#b3162b', '#e25061', '#95102a'], 5: ['#680e1d', '#90202f', '#48060f'], 6: ['#efd88e', '#f5e6ae', '#e9d184'],
  };
  function chairCoupee(fid, t, o) {
    const c = CHAIRS[fid];
    if (!c) return false;
    copie(o.c, C(c[0]));
    vers(o.c, C(c[1]), (1 - Math.abs(2 * t - 1)) * 0.6);
    vers(o.c, C(c[2]), sstep(0.8, 1, t) * 0.9);
    o.sp = fid === 3 || fid === 6 ? 0.2 : 0.5;
    o.bz = 0.25;
    return true;
  }

  function myrtille(T, u, v, rnd, zb) {
    T.idCourant = FRUIT.myrtille;
    const r = rnd.range(4.4, 5.3);
    const nv = bruitV(rnd.int(1, 1e6));
    const cu = rnd.range(-0.45, 0.45) * r, cv = rnd.range(-0.45, 0.45) * r, rc = r * 0.3, ang = rnd() * TAU;
    const fonce = C('#1d2440'), pruine = C('#5f6f94'), coeur = C('#271c2c');
    sphere(T, u, v, r, 0.86, r * 0.35, 0.28, 22, (x, y, q, col) => {
      copie(col, fonce);
      // la pruine : un voile bleuté inégal, frotté par endroits
      vers(col, pruine, clamp01(0.5 + 0.8 * nv(x * 0.55, y * 0.55)) * 0.85);
      // la couronne (cinq sépales autour d'un creux)
      const dx = x - cu, dy = y - cv, dc = Math.hypot(dx, dy);
      let dz = 0;
      if (dc < rc * 1.6) {
        const a = fatan2(dy, dx) + ang;
        const et = rc * (0.75 + 0.3 * Math.cos(a * 5));
        const m = sstep(et, et * 0.5, dc);
        vers(col, coeur, m * 0.85);
        dz = -0.8 * m + 0.2 * sstep(et * 1.45, et, dc) * (1 - m);
      }
      return dz;
    }, zb);
    T.idCourant = 0;
  }

  function groseille(T, u, v, rnd, zb) {
    T.idCourant = FRUIT.groseille;
    const r = rnd.range(3.2, 4.0);
    const rouge = C('#a8102a'), clair = C('#dc3448'), point = C('#3a1a10');
    const pu = rnd.range(-0.5, 0.5) * r, pv = rnd.range(-0.5, 0.5) * r;
    sphere(T, u, v, r, 1, r * 0.3, 0.9, 70, (x, y, q, col) => {
      copie(col, rouge);
      // translucide : le côté opposé à la lumière s'éclaire par transparence
      vers(col, clair, clamp01(((x * 0.6 + y * 0.8) / r) * 0.8 + 0.1) * (1 - q * 0.5) * 0.55);
      vers(col, point, sstep(0.55, 0.25, Math.hypot(x - pu, y - pv)));
      return 0;
    }, zb);
    T.idCourant = 0;
  }

  // framboise ou mûre : un dôme couvert de drupéoles (des bosses, jamais des trous)
  function drupes(T, u, v, rnd, sorte, zb) {
    const mure = sorte === 'mure';
    T.idCourant = mure ? FRUIT.mure : FRUIT.framboise;
    const r = mure ? rnd.range(6.8, 7.8) : rnd.range(7.2, 8.4);
    const fz = mure ? 0.86 : 0.8;
    const creux = !mure && rnd() < 0.45; // framboise tête en bas : le creux du réceptacle, adouci
    const cols = mure ? [C('#1a0d18'), C('#3b1528'), C('#12080f')] : [C('#aa2238'), C('#c8445a'), C('#7c1428')];
    const n = mure ? 4.0 : 3.3; // drupéoles par rayon
    const sp = mure ? 0.8 : 0.4, gl = mure ? 60 : 30;
    const nv = bruitV(rnd.int(1, 1e6));
    const rot = rnd() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    const sd = rnd.int(1, 1e6);
    sphere(T, u, v, r, fz, r * 0.3, sp, gl, (x, y, q, col) => {
      // grille hexagonale posée sur le dôme, étirée vers les bords
      const k2 = 1 / Math.max(0.4, Math.sqrt(1 - q * q * 0.8));
      const xr = cr * x - sr * y, yr = sr * x + cr * y;
      const gx = ((xr * k2) / r) * n, gy = ((yr * k2) / r) * n;
      const row = Math.round(gy / 0.866);
      const c0 = Math.round(gx - (row & 1) * 0.5);
      let best = 9;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = row + dr, of = (rr & 1) * 0.5;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c0 + dc;
          const jx = 0.22 * (h32(rr, cc, sd) - 0.5), jy = 0.22 * (h32(cc, rr, sd + 1) - 0.5);
          const dx = gx - (cc + of + jx), dy = gy - (rr * 0.866 + jy);
          const dd = dx * dx + dy * dy;
          if (dd < best) best = dd;
        }
      }
      const bosse = Math.sqrt(Math.max(0, 1 - best / 0.34)); // 1 au centre d'une drupéole
      copie(col, cols[0]);
      vers(col, cols[1], bosse * 0.3 + 0.25 * nv(x * 0.7, y * 0.7));
      vers(col, cols[2], (1 - bosse) * 0.3);
      let dz = (bosse - 0.55) * (mure ? 0.95 : 0.8) * (1 - q * 0.5);
      if (creux) {
        const m = sstep(0.3, 0.1, q);
        dz -= 2.2 * m;
        vers(col, cols[2], m * 0.5);
      }
      return dz;
    }, zb);
    T.idCourant = 0;
  }

  function cerise(T, u, v, rnd, zb) {
    T.idCourant = FRUIT.cerise;
    const r = rnd.range(8.4, 9.6);
    const c1 = C('#560916'), c2 = C('#7e1224');
    const nv = bruitV(rnd.int(1, 1e6));
    const pu = rnd.range(-0.3, 0.3) * r, pv = rnd.range(-0.3, 0.3) * r;
    sphere(T, u, v, r, 0.92, r * 0.3, 1.0, 90, (x, y, q, col) => {
      copie(col, c1);
      vers(col, c2, clamp01(0.4 + 0.5 * nv(x * 0.3, y * 0.3)));
      return -1.2 * sstep(1.8, 0.3, Math.hypot(x - pu, y - pv)); // le creux de la queue
    }, zb);
    T.idCourant = 0;
  }

  // un point de crème pâtissière poché : dôme mou, petite pointe, brillant
  function pointCreme(T, u, v, rnd, r, zb) {
    const ppm = T.ppm;
    T.idCourant = FRUIT.creme;
    const pr = polyR(rnd, 6, r, 0.12);
    const c1 = C('#efd88e'), c2 = C('#f5e6ae');
    const nv = bruitV(rnd.int(1, 1e6));
    const tip = [rnd.range(-0.25, 0.25) * r, rnd.range(-0.25, 0.25) * r];
    const z0 = zb != null ? zb : T.hA(u, v, r / 2);
    const hh = r * rnd.range(0.55, 0.7);
    const col = [0, 0, 0];
    T.objet(u, v, r * 1.25 + 0.5, (k, du, dv) => {
      const rl = pr(fatan2(dv, du));
      const sd = Math.sqrt(du * du + dv * dv) - rl;
      const al = clamp01(0.5 - sd * ppm);
      if (al <= 0) return;
      const q = Math.min(1, Math.hypot(du - tip[0] * 0.4, dv - tip[1] * 0.4) / rl);
      const z = z0 + hh * Math.pow(1 - q * q, 0.7) + 1.3 * Math.exp(-((du - tip[0]) ** 2 + (dv - tip[1]) ** 2) / (r * 0.35)) + 0.1 * nv(du, dv);
      copie(col, c1);
      vers(col, c2, 0.5 + 0.5 * nv(du * 0.5 + 3, dv * 0.5));
      T.poser(k, z, al, col, 0.3, 24, true);
    });
    T.idCourant = 0;
  }

  // une petite fleur comestible (pensée, verveine) : 5 pétales à plat
  function fleur(T, u, v, rnd, zb) {
    const ppm = T.ppm, r = rnd.range(3.6, 4.4), rot = rnd() * TAU;
    const tons = [['#6f2a7a', '#9a4f93'], ['#b8466f', '#d9829d'], ['#eee3ea', '#f8f2f5']][rnd.int(0, 2)];
    const c1 = C(tons[0]), c2 = C(tons[1]), centre = C('#eec24a');
    const z0 = (zb != null ? zb : T.hA(u, v, 2)) + 0.6;
    const col = [0, 0, 0];
    T.objet(u, v, r + 0.5, (k, du, dv) => {
      const d = Math.sqrt(du * du + dv * dv), a = fatan2(dv, du) - rot;
      const rl = r * (0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)));
      const al = clamp01(0.5 - (d - rl) * ppm);
      if (al <= 0) return;
      copie(col, c1);
      vers(col, c2, sstep(0.3 * r, 0.9 * r, d) * 0.7);
      vers(col, centre, sstep(0.22 * r, 0.1 * r, d));
      T.poser(k, z0 + 0.5 * (1 - d / r) + 0.25 * Math.cos(a * 5) * (d / r), al, col, 0.12, 14);
    });
  }

  /* ==========================================================================
     Les recettes
     ========================================================================== */

  // tirage de points dans une part (distance a de la pointe dans [a0, a1], marge m aux bords)
  function zonePart(geo, a0, a1, m) {
    return {
      tirer(rnd) {
        const q = a0 / a1;
        const a = a1 * Math.sqrt(q * q + rnd() * (1 - q * q));
        return geo.pt(a, rnd.range(-1, 1));
      },
      ok(u, v, mm) {
        geo.eval(u, v, geo.o);
        const o = geo.o;
        return o.d1 > m + mm && o.d2 > m + mm && o.d3 > m + mm;
      },
    };
  }

  /* ---- fondants (noir pointe de sel, lait caramélisé) ---- */
  function fondant(P) {
    return {
      nom: P.nom, prix: P.prix, desc: P.desc, hauteur: P.H, hmax: P.H + 4,
      geo: (seed) => Part(P.R, P.demi, seed, 0.3, 0.8),
      ombre: { soft: 0.5, opacity: 0.42 },
      wrap: 0.26, penombre: 0.8, creuxF: 0.34,
      faire(T, geo, rnd, seed) {
        const nA = AC.noise2(seed + 101), nB = AC.noise2(seed + 202), nC = AC.noise2(seed + 303), nD = AC.noise2(seed + 404);
        const nF = bruitV(seed + 11), nG = bruitV(seed + 12);
        const fis = fissures(seed + 5, P.periode, 2.6, P.fenteMin);
        const K = P.col;
        const col = [0, 0, 0];
        // une fissure qui suit le rebord, sur une partie de l'arc
        const rimR = P.R - rnd.range(5.5, 9), rimA = rnd.range(-0.8, 0.1) * P.demi, rimB = rimA + rnd.range(0.6, 1.2) * P.demi;
        const champs = [
          // 0 le relief lent : ondulation large, moyenne, bosses de la croûte
          (u, v) => 0.9 * nA(u * 0.028, v * 0.028) + 0.4 * nB(u * 0.085, v * 0.085) + P.bosses * nC(u * 0.2, v * 0.2),
          (u, v) => fis.ligne(u, v), // 1, 2 les fissures
          (u, v) => fis.troncons(u, v),
          (u, v) => nA(u * 0.045 + 13, v * 0.045 - 4), // 3 couleur de la croûte
          (u, v) => sstep(P.presence[0], P.presence[1], nD(u * 0.03 + 3, v * 0.03 - 8)), // 4 où la croûte s'ouvre
          (u, v) => sstep(P.taches[0], P.taches[1], nC(u * P.taches[2] + 40, v * P.taches[2] + 17)), // 5 poches de chocolat
          (u, v) => sstep(-0.35, 0.5, nD(u * 0.034 - 21, v * 0.034 + 8)), // 6 le cacao tamisé
          (u, v) => 0.7 + 0.6 * (0.5 + 0.5 * nF(u * 0.22, v * 0.22)), // 7 largeur des fissures
          (u, v) => nF(u * 0.6 + 5, v * 0.6), // 8 teinte fine
        ];
        T.corps(geo, (k, u, v, o) => {
          const f = o.f;
          let h = P.H + f[0];
          h += P.rebord * sstep(16, 2.5, o.d3); // la croûte se soulève sur le pourtour
          h -= P.creux * sstep(46, 6, o.r); // le cœur retombe (côté pointe)
          const c = fis.eval(f[1], f[2], f[4], P.fente * f[7]);
          let fi = c.fis, levre = c.levre;
          if (o.th > rimA && o.th < rimB) {
            const bout = sstep(0, 0.15, (o.th - rimA) / P.demi) * sstep(0, 0.15, (rimB - o.th) / P.demi);
            const er = Math.abs(o.r - rimR - 1.3 * nF(o.th * 28, 2.5));
            const w = P.fente * 1.1 * bout;
            if (w > 0.02) {
              fi = Math.max(fi, 1 - sstep(w * 0.3, w * 1.3, er));
              levre = Math.max(levre, bout * Math.exp(-er / 1.4) * (1 - fi));
            }
          }
          h += P.plaques * f[4] * c.cote * clamp01(c.e / 3) + P.soulev * levre - P.prof * fi;
          h += P.grain * (nF(u * 1.4, v * 1.4) + 0.5 * nG(u * 3.1, v * 3.1)); // grain mat
          h -= arrondi(o.d1, 0.7) + arrondi(o.d2, 0.7) + arrondi(o.d3, P.epaule);
          T.h[k] = h;
          copie(col, K.croute);
          vers(col, K.croute2, clamp01(0.5 + 0.7 * f[3]));
          vers(col, K.bord, sstep(9, 1.5, o.d3) * 0.7);
          const tache = f[5] * sstep(3, 8, o.d3);
          vers(col, K.tache, tache * 0.75);
          fois(col, 1 + 0.07 * f[8] + P.crete * levre); // les lèvres soulevées, plus sèches
          vers(col, K.fente, fi * 0.95);
          let sp = P.spec * (1 - tache) + P.specTache * tache + 0.12 * fi;
          if (P.cacao > 0) {
            let m = P.cacao * f[6] * (0.62 + 0.38 * h32(k, seed, 77)) * (1 - 0.6 * fi);
            m *= 0.75 + 0.25 * sstep(12, 2, o.d3); // un peu plus sur le pourtour
            vers(col, K.cacao, m);
            sp *= 1 - m;
          }
          ecrire(T, k, col);
          T.spec[k] = sp;
          T.gloss[k] = P.gloss + 20 * tache;
        }, champs);
        if (P.sel) semerSel(T, rnd, rnd.int(P.sel[0], P.sel[1]), zonePart(geo, 16, P.R - 5, 3));
        // la tranche : mie dense, humide, presque truffée ; le côté : croûte sèche
        return (u, v, z, part, htop, o) => {
          const x = u + geo.g, y = v;
          if (part === 3) {
            const a = fatan2(y, x) * geo.R;
            copie(o.c, K.cote);
            vers(o.c, K.bord, sstep(htop - 4, htop - 0.5, z) * 0.8);
            fois(o.c, 1 + 0.1 * nF(a * 0.35, z * 0.9));
            o.sp = 0.04;
            o.bu = 0.3 * nF(a * 0.9 + 3, z * 0.9);
            o.bz = 0.3 * nG(a * 0.9, z * 0.9 + 5);
            return true;
          }
          const a = Math.sqrt(x * x + y * y);
          copie(o.c, K.mie);
          // le haut plus « gâteau », le cœur plus fondant ; une ligne de croûte au-dessus
          const lim = htop * (P.coeur + 0.08 * nF(a * 0.08, 3.3));
          vers(o.c, K.mie2, sstep(lim - 2.5, lim + 2.5, z) * 0.85 + 0.2 * nF(a * 0.07, z * 0.1));
          vers(o.c, K.croute, sstep(htop - 2.4, htop - 0.8, z));
          vers(o.c, K.cote, sstep(1.6, 0.3, z) * 0.6);
          const tr = nF(a * 0.45, z * 0.07); // traînées du couteau
          const grain = nG(a * 1.7, z * 1.7);
          const gras = sstep(lim + 1, lim - 3, z); // la partie fondante est plus lisse et brille un peu
          fois(o.c, 1 + 0.11 * tr + 0.07 * grain * (1 - 0.6 * gras));
          o.sp = 0.06 + 0.16 * gras + 0.08 * clamp01(-tr);
          o.bu = 0.3 * nG(a * 1.1 + 9, z * 0.35) + 0.14 * grain * (1 - 0.7 * gras);
          o.bz = 0.18 * nF(a * 1.4, z * 1.4 + 7);
          return true;
        };
      },
    };
  }

  const FONDANT_NOIR = {
    nom: 'Fondant chocolat noir, pointe de sel', prix: 5.5, desc: 'Dense, humide, voile de cacao et cristaux de fleur de sel.',
    R: 95, demi: 20 * DEG, H: 33,
    rebord: 1.6, creux: 1.3, epaule: 3.8, bosses: 0.3, grain: 0.07,
    periode: 24, presence: [-0.05, 0.35], fente: 0.7, fenteMin: 0.1, prof: 1.6, plaques: 0.3, soulev: 0.6, crete: 0.16,
    taches: [0.52, 0.7, 0.09], spec: 0.05, specTache: 0.1, gloss: 16, cacao: 0.7, sel: [5, 8], coeur: 0.55,
    col: {
      croute: C('#4a2c22'), croute2: C('#58372b'), bord: C('#5c3b2d'), tache: C('#2e1a15'), fente: C('#2a1611'),
      cacao: C('#7d4d39'), mie: C('#27140f'), mie2: C('#3a2219'), cote: C('#3b241c'),
    },
  };
  const FONDANT_LAIT = {
    nom: 'Fondant chocolat au lait caramélisé', prix: 5.5, desc: 'Plus doux, cœur fondant, fine croûte caramélisée.',
    R: 95, demi: 20 * DEG, H: 35,
    rebord: 1.4, creux: 1.1, epaule: 3.5, bosses: 0.12, grain: 0.028,
    periode: 28, presence: [0.15, 0.45], fente: 0.5, fenteMin: 0.2, prof: 1.1, plaques: 0.2, soulev: 0.35, crete: 0.08,
    taches: [0.74, 0.84, 0.14], spec: 0.2, specTache: 0.35, gloss: 30, cacao: 0, sel: null, coeur: 0.62,
    col: {
      croute: C('#9b6641'), croute2: C('#a97550'), bord: C('#8c5634'), tache: C('#6a3a21'), fente: C('#6a3c22'),
      cacao: C('#7a4b38'), mie: C('#8a5937'), mie2: C('#a87a52'), cote: C('#8c5a38'),
    },
  };

  /* ---- brownie noix-noisettes ---- */
  const brownie = {
    nom: 'Brownie noix & noisettes', prix: 5.5, desc: 'Croûte craquelée brillante, noisettes et cerneaux de noix.',
    hauteur: 29, hmax: 38,
    geo: (seed) => Part(78, 24 * DEG, seed, 0.35, 0.9),
    ombre: { soft: 0.5, opacity: 0.42 },
    wrap: 0.26, penombre: 0.9, creuxF: 0.34,
    faire(T, geo, rnd, seed) {
      const H0 = 29;
      const nA = AC.noise2(seed + 11), nB = AC.noise2(seed + 12), nC = AC.noise2(seed + 13);
      const nF = bruitV(seed + 14), nG = bruitV(seed + 15);
      const fis = fissures(seed + 16, 13, 1.6);
      const croute = C('#44291d'), plaque = C('#5a3a2b'), fente = C('#24130d'), bord = C('#4d2f22');
      const col = [0, 0, 0];
      // des bosses : noix cachées sous la croûte
      const bosses = [];
      for (let i = 0; i < 7; i++) {
        const [bu, bv] = geo.pt(rnd.range(18, 72), rnd.range(-0.8, 0.8));
        bosses.push([bu, bv, rnd.range(4, 7), rnd.range(0.8, 1.6)]);
      }
      const champs = [
        (u, v) => { // 0 relief : ondulations et bosses des noix cachées sous la croûte
          let s = 0.7 * nA(u * 0.035, v * 0.035) + 0.3 * nB(u * 0.1, v * 0.1);
          for (const [bu, bv, br, bh] of bosses) { const dd = ((u - bu) ** 2 + (v - bv) ** 2) / (br * br); if (dd < 4) s += bh * Math.exp(-dd); }
          return s;
        },
        (u, v) => fis.ligne(u, v), // 1, 2 les fissures
        (u, v) => fis.troncons(u, v),
        (u, v) => sstep(0.35, 0.6, 0.5 + 0.5 * nA(u * 0.06 + 9, v * 0.06 - 2)), // 3 la fine croûte brillante, par plaques
        (u, v) => sstep(-0.2, 0.3, nC(u * 0.04, v * 0.04)), // 4 présence des fissures
      ];
      T.corps(geo, (k, u, v, o) => {
        const f = o.f;
        let h = H0 + f[0] + 1.0 * sstep(10, 2, o.d3);
        const c = fis.eval(f[1], f[2], f[4], 0.3 + 0.2 * (0.5 + 0.5 * nF(u * 0.3, v * 0.3)));
        const brille = f[3] * (1 - c.fis);
        h += 0.35 * c.levre + 0.2 * brille - 0.9 * c.fis + 0.15 * f[4] * c.cote * clamp01(c.e / 2);
        h += 0.06 * nF(u * 1.6, v * 1.6) + 0.03 * nG(u * 3.4, v * 3.4);
        h -= arrondi(o.d1, 0.8) + arrondi(o.d2, 0.8) + arrondi(o.d3, 3);
        T.h[k] = h;
        copie(col, croute);
        vers(col, plaque, brille * 0.7 + c.levre * 0.3);
        vers(col, bord, sstep(7, 1, o.d3) * 0.5);
        fois(col, 1 + 0.1 * nF(u * 0.5, v * 0.5));
        vers(col, fente, c.fis);
        ecrire(T, k, col);
        T.spec[k] = 0.07 + 0.3 * brille + 0.1 * c.fis;
        T.gloss[k] = 16 + 30 * brille;
      }, champs);
      // les fruits secs : cerneaux, noisettes entières, moitiés, éclats
      const zone = zonePart(geo, 12, 74, 1.5);
      const posees = [];
      const libre = (u, v, r) => posees.every(([pu, pv, pr]) => (u - pu) ** 2 + (v - pv) ** 2 > (r + pr) ** 2 * 0.8);
      const semer = (n, r, f) => {
        for (let e = 0, m = 0; e < n * 40 && m < n; e++) {
          const [u, v] = zone.tirer(rnd);
          if (!zone.ok(u, v, r) || !libre(u, v, r)) continue;
          posees.push([u, v, r]);
          f(u, v);
          m++;
        }
      };
      semer(rnd.int(1, 2), 9, (u, v) => cerneau(T, u, v, rnd, rnd.range(16, 19)));
      semer(rnd.int(2, 3), 6, (u, v) => noisette(T, u, v, rnd, 'entiere', rnd.range(10, 12)));
      semer(rnd.int(3, 5), 5.5, (u, v) => noisette(T, u, v, rnd, 'demi', rnd.range(9.5, 11.5)));
      semer(rnd.int(6, 10), 2.4, (u, v) => noisette(T, u, v, rnd, 'eclat', rnd.range(2.6, 5)));
      const mie = C('#29160f'), mie2 = C('#382016'), cote = C('#39211a'), noix = C('#c9b288'), noixPeau = C('#7d5230');
      // quelques éclats de noisette pris dans la tranche
      const coupes = [];
      for (let i = 0, n = rnd.int(2, 3); i < n; i++) coupes.push([rnd.range(14, 70), rnd.range(6, 22), rnd.range(1.6, 2.6), rnd.range(1.2, 2)]);
      return (u, v, z, part, htop, o) => {
        const x = u + geo.g, y = v;
        if (part === 3) {
          const a = fatan2(y, x) * 78;
          copie(o.c, cote);
          vers(o.c, bord, sstep(htop - 3, htop, z) * 0.6);
          fois(o.c, 1 + 0.1 * nF(a * 0.4, z * 0.8));
          o.sp = 0.04; o.bu = 0.3 * nF(a * 0.9, z * 0.9); o.bz = 0.3 * nG(a * 0.9, z);
          return true;
        }
        const a = Math.sqrt(x * x + y * y);
        copie(o.c, mie);
        vers(o.c, mie2, 0.5 + 0.5 * nF(a * 0.1, z * 0.12));
        vers(o.c, croute, sstep(htop - 2, htop - 0.6, z));
        const tr = nF(a * 0.5, z * 0.08);
        fois(o.c, 1 + 0.1 * tr + 0.06 * nG(a * 1.8, z * 1.8));
        o.sp = 0.14 + 0.1 * clamp01(-tr);
        o.bu = 0.3 * nG(a * 1.2, z * 0.4); o.bz = 0.2 * nF(a * 1.5, z * 1.5);
        for (const [ca, cz, ra, rz] of coupes) {
          const q = ((a - ca) / ra) ** 2 + ((z - cz) / rz) ** 2;
          if (q < 1) {
            copie(o.c, noix);
            vers(o.c, noixPeau, sstep(0.55, 0.95, q) * 0.8);
            o.sp = 0.05; o.bu = 0; o.bz = 0.25 * (0.5 - q);
          }
        }
        return true;
      };
    },
  };

  /* ---- cheesecake citron vert : base biscuit, crème lissée, coulis, agrume ---- */
  const cheesecake = {
    nom: 'Cheesecake citron vert', prix: 5.5, desc: 'Base biscuit, crème citron vert, coulis de fruits rouges.',
    hauteur: 45, hmax: 50,
    geo: (seed) => Part(90, 21 * DEG, seed, 0.25, 0.5),
    ombre: { soft: 0.5, opacity: 0.38 },
    wrap: 0.36, sheen: 0.12, penombre: 1.2, creuxF: 0.25,
    extra: (geo) => { const [u, v] = geo.pt(66, 1); return [[u, v + 14], [u + 8, v + 12]]; },
    faire(T, geo, rnd, seed) {
      const Hb = 11, Hc = 45; // biscuit, dessus de la crème
      const nA = AC.noise2(seed + 21), nB = AC.noise2(seed + 22);
      const nF = bruitV(seed + 23), nG = bruitV(seed + 24);
      const creme = C('#eee8da'), creme2 = C('#f4efe4'), biscuit = C('#8c6139'), biscuit2 = C('#b48a58');
      const col = [0, 0, 0];
      // le sens des coups de spatule
      const sa = rnd.range(-0.5, 0.5) + Math.PI / 2, csa = Math.cos(sa), ssa = Math.sin(sa);
      const retrait = 1.6; // la crème est un peu en retrait du biscuit, à l'arrière et sur le pourtour
      const champs = [
        (u, v) => 0.5 * nA(u * 0.03, v * 0.03), // 0 ondulation
        (u, v) => { const s = csa * u + ssa * v, t = -ssa * u + csa * v; return 0.3 * Math.sin(t * 0.42 + 2.4 * nB(s * 0.018, t * 0.018)) * (0.45 + 0.55 * nB(s * 0.04 + 3, t * 0.04)); }, // 1 spatule
        (u, v) => 0.5 + 0.5 * nA(u * 0.05 + 7, v * 0.05), // 2 teinte
      ];
      const lisses = 2;
      T.corps(geo, (k, u, v, o) => {
        const f = o.f;
        const dc = Math.min(o.d1 - retrait - 0.4 * nF(o.r * 0.2, 1), o.d3 - retrait - 0.5 * nF(o.th * 40, 2), o.d2);
        if (dc > 0) {
          T.h[k] = Hc + f[0] + f[1] + 0.015 * nF(u * 1.2, v * 1.2) - arrondi(dc, 2.2);
          copie(col, creme);
          vers(col, creme2, f[2]);
          T.spec[k] = 0.14; T.gloss[k] = 14;
        } else {
          const gr = nG(u * 1.3, v * 1.3);
          T.h[k] = Hb + 0.4 * nF(u * 0.8, v * 0.8) + 0.25 * gr - arrondi(o.t, 0.8);
          copie(col, biscuit);
          vers(col, biscuit2, clamp01(gr * 1.2));
          T.spec[k] = 0.03; T.gloss[k] = 8;
        }
        ecrire(T, k, col);
      }, champs, lisses);

      // le coulis : une flaque versée vers l'arrière, une langue qui file vers la face basse et coule par-dessus
      const fl = rnd.range(56, 64); // où la coulure passe le bord (distance à la pointe)
      const [pu0, pv0] = geo.pt(fl + rnd.range(4, 10), rnd.range(-0.35, 0)); // centre de la flaque
      const [eu, ev] = geo.pt(fl, 1.02); // le bord (un peu au-delà : la langue passe par-dessus)
      const pa = rnd.range(12, 15), pb = rnd.range(8.5, 10.5), prot = rnd.range(-0.5, 0.5);
      const pcr = Math.cos(prot), psr = Math.sin(prot);
      const bord = tabler(256, -Math.PI, Math.PI, (th) => 1.7 * nA(Math.cos(th) * 1.1 + 17, Math.sin(th) * 1.1 - 9) + 0.35 * nB(Math.cos(th) * 2.2 + 5, Math.sin(th) * 2.2));
      const lx = eu - pu0, ly = ev - pv0, ll = lx * lx + ly * ly;
      const sdCoulis = (u, v) => {
        // la flaque : une ellipse au bord irrégulier
        const x = u - pu0, y = v - pv0;
        const xr = pcr * x + psr * y, yr = -psr * x + pcr * y;
        const q = Math.sqrt((xr * xr) / (pa * pa) + (yr * yr) / (pb * pb));
        const d1 = (q - 1) * pb * 0.9 - bord(fatan2(yr / pb, xr / pa)) * Math.min(1, q * q);
        // la langue : un filet qui s'amincit vers le bord
        const t = clamp01((x * lx + y * ly) / ll);
        const d2 = Math.hypot(x - lx * t, y - ly * t) - (4.6 - 1.6 * t);
        // union adoucie (k = 3 mm)
        const h = clamp01(0.5 + (0.5 * (d2 - d1)) / 3);
        return d2 + (d1 - d2) * h - 3 * h * (1 - h);
      };
      const rouge = C('#4c0817'), rougeFin = C('#8a1c32');
      const zc = Hc + 0.2;
      const cu = (pu0 + eu) / 2, cv = (pv0 + ev) / 2;
      T.objet(cu, cv, 34, (k, du, dv) => {
        const u = cu + du, v = cv + dv;
        const sd = sdCoulis(u, v);
        const al = clamp01(0.5 - sd * T.ppm);
        if (al <= 0 || T.cov[k] < 0.5) return;
        // tension de surface : bord bien arrondi, dessus presque plat, un peu bombé au milieu
        const ep = 1.8 * Math.sqrt(sstep(0, 3.2, -sd)) + 0.06 * nF(u * 0.2, v * 0.2) * sstep(1, 4, -sd);
        copie(col, rougeFin);
        vers(col, rouge, sstep(0.3, 2.4, -sd));
        T.poser(k, zc + ep, al, col, 1.5, 70, true);
      });
      // la flaque au pied de la coulure, sur l'assiette
      const nx = -Math.sin(21 * DEG), ny = Math.cos(21 * DEG); // normale de la face basse (repère local)
      const pu = eu + nx * 4.5, pv = ev + ny * 4.5;
      const pr = polyR(rnd, 7, 5.2, 0.2);
      T.objet(pu, pv, 9, (k, du, dv) => {
        const sd = Math.hypot(du * 0.85, dv * 1.1) - pr(fatan2(dv, du));
        const al = clamp01(0.5 - sd * T.ppm);
        if (al <= 0) return;
        copie(col, rougeFin);
        vers(col, rouge, sstep(0.3, 2.2, -sd));
        T.poser(k, 1.2 * sstep(0, 2, -sd) + 0.05, al, col, 1.4, 90, false, true);
      });

      // l'agrume posé sur la crème : demi-rondelle d'orange (le plus souvent) ou de citron vert
      const orange = rnd() < 0.75;
      const Rc = orange ? rnd.range(15.5, 17.5) : rnd.range(12, 13.5);
      let [au, av] = geo.pt(fl - rnd.range(26, 32), rnd.range(-0.25, 0.25));
      for (let e = 0; e < 30; e++) { // on le recule vers le large tant qu'il déborde
        geo.eval(au, av, geo.o);
        if (Math.min(geo.o.d1, geo.o.d2, geo.o.d3) > Rc + 2.5) break;
        [au, av] = geo.pt(fl - 22 + e * 1.5, rnd.range(-0.2, 0.2));
      }
      const rot = rnd.range(-0.7, 0.7) + (rnd() < 0.5 ? 0 : Math.PI);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const peau = C(orange ? '#d9781a' : '#4b7f2a'), zeste = C(orange ? '#e8912a' : '#6b9a35');
      const ziste = C(orange ? '#f4e5c6' : '#e9edcf'), chair = C(orange ? '#ee9624' : '#aec457'), chair2 = C(orange ? '#f6b74c' : '#cdd98a');
      const membrane = C(orange ? '#f5d9a2' : '#e2e8bf');
      const za = Hc + 0.3;
      const nseg = orange ? 5 : 4;
      T.objet(au, av, Rc + 1, (k, du, dv) => {
        const x = cr * du + sr * dv, y = -sr * du + cr * dv; // y ≥ 0 : la demi-rondelle
        const r = Math.sqrt(x * x + y * y);
        const sd = Math.max(r - Rc, -y - 0.2);
        const al = clamp01(0.5 - sd * T.ppm);
        if (al <= 0) return;
        const th = fatan2(y, x); // 0..π
        const ed = Rc - r;
        let z = za + 3 - 0.8 * sstep(Rc * 0.3, 0, ed) - 0.4 * sstep(1.5, 0, y);
        let sp = 0.6, gl = 55;
        if (ed < 1.3) { copie(col, peau); vers(col, zeste, 0.5 + 0.5 * nF(th * 30, ed * 2)); sp = 0.35; gl = 30; }
        else if (ed < 2.1) { copie(col, ziste); sp = 0.1; }
        else {
          const segF = (th / Math.PI) * nseg;
          const sf = segF - Math.floor(segF);
          const mem = Math.min(sf, 1 - sf) * ((r * Math.PI) / nseg);
          copie(col, chair);
          // les vésicules de jus : fines traînées radiales
          vers(col, chair2, clamp01(0.5 + 0.8 * nF(th * 60, r * 0.5)) * 0.7);
          vers(col, membrane, sstep(0.5, 0.12, mem) * 0.9 + sstep(3.2, 1.4, r));
          z += 0.22 * nG(th * 50, r * 0.8) - 0.3 * sstep(0.5, 0.1, mem);
        }
        T.poser(k, z, al, col, sp, gl);
      });
      // la tranche : crème en haut, biscuit en bas ; la coulure de coulis sur la face basse
      const drA = fl, drW = rnd.range(2.2, 2.6);
      const avoine = C('#c4a473'), grain = C('#5b3a1e'), cremeHaut = C('#f7f3ea'), cremeBas = C('#e2d9c2');
      return (u, v, z, part, htop, o) => {
        const x = u + geo.g, y = v;
        const a = part === 3 ? fatan2(y, x) * 90 : Math.sqrt(x * x + y * y);
        // la coulure : un filet brillant qui descend la face basse et s'élargit en goutte au pied
        let cou = 0, dd = 0, w = 1;
        if (part === 2) {
          const t = clamp01(1 - z / htop); // 0 en haut, 1 en bas
          w = drW * (1 + 0.35 * (1 - sstep(0, 0.25, t)) + 0.8 * sstep(0.68, 1, t));
          dd = Math.abs(a - drA);
          cou = clamp01((w - dd) * T.ppm + 0.5); // bord anticrénelé
          if (cou >= 1) {
            copie(o.c, rougeFin);
            vers(o.c, rouge, sstep(w, w * 0.35, dd));
            o.sp = 1.2;
            o.bu = ((a - drA) / w) * 0.9;
            o.bz = 0.55;
            return true;
          }
        }
        if (z < Hb + 0.3 * nF(a * 0.5, 3)) {
          copie(o.c, biscuit);
          const gr = nG(a * 1.4, z * 1.4);
          vers(o.c, biscuit2, clamp01(gr * 1.3));
          vers(o.c, avoine, sstep(0.45, 0.7, nF(a * 0.9 + 7, z * 1.1)) * 0.75); // flocons d'avoine
          vers(o.c, grain, sstep(0.5, 0.75, nG(a * 0.7 + 3, z * 0.9 + 4)) * 0.55);
          o.sp = 0.03; o.bu = 0.5 * gr; o.bz = 0.4 * nF(a * 1.3, z * 1.3);
        } else {
          copie(o.c, creme);
          vers(o.c, cremeHaut, sstep(Hb + 2, htop, z) * 0.5);
          vers(o.c, cremeBas, sstep(Hb + 2.5, Hb, z) * 0.6);
          fois(o.c, 1 + 0.03 * nF(a * 0.6, z * 0.6));
          o.sp = 0.06;
          o.bu = 0.08 * nG(a * 0.5, z * 0.5);
          o.bz = 0.06 * nF(a * 0.4, z * 0.4);
        }
        if (cou > 0) { // le bord de la coulure, fondu sur un pixel
          vers(o.c, rougeFin, cou);
          o.sp += (1.2 - o.sp) * cou;
          o.bz += (0.55 - o.bz) * cou;
        }
        return true;
      };
    },
  };

  /* ---- cookie : épais, bombé, doré, pépites noires et blanches, fleur de sel ---- */
  const cookie = {
    nom: 'Cookie pépites de chocolat', prix: 3.9, desc: 'Épais, fondant à cœur, chocolat noir, lait et blanc.',
    hauteur: 19, hmax: 26,
    geo: (seed) => Disque(47.5, seed, 1.4),
    ombre: { soft: 0.55, opacity: 0.4 },
    wrap: 0.28, penombre: 0.9, creuxF: 0.32,
    faire(T, geo, rnd, seed) {
      const He = 12.5, Hc = 19;
      const nA = AC.noise2(seed + 31), nB = AC.noise2(seed + 32), nC = AC.noise2(seed + 33);
      const nF = bruitV(seed + 34), nG = bruitV(seed + 35);
      const fis = fissures(seed + 36, 26, 3, 0.45);
      const pate = C('#dcbd84'), pate2 = C('#e6cc96'), dore = C('#c68d47'), brun = C('#a2662d'), creuxC = C('#dfc088');
      const col = [0, 0, 0];
      const champs = [
        // 0 le relief lent : le dôme, les mottes, les plis de la pâte qui a coulé en cuisant
        (u, v) => {
          const r = Math.sqrt(u * u + v * v), q = Math.min(1, r / 47.5);
          const m0 = nA(u * 0.05, v * 0.05), m1 = nB(u * 0.12, v * 0.12);
          return He + (Hc - He) * Math.pow(1 - q * q, 0.7) + 1.4 * m0 + 0.7 * m1 + 0.3 * nC(u * 0.25 + 7, v * 0.25) +
            0.4 * Math.sin(r * 0.95 + 2 * m0) * sstep(0.6, 0.88, q) * (0.5 + 0.5 * m1);
        },
        // 1 ce qui dore : le haut des mottes, une marbrure de cuisson
        (u, v) => 0.35 * clamp01(nA(u * 0.05, v * 0.05) + 0.3 * nB(u * 0.12, v * 0.12)) + 0.15 * (0.5 + 0.5 * nA(u * 0.2 + 3, v * 0.2 - 5)),
        (u, v) => fis.ligne(u, v), // 2, 3 les fissures
        (u, v) => fis.troncons(u, v),
        (u, v) => sstep(0.3, 0.6, nC(u * 0.035, v * 0.035)), // 4 présence des fissures
        (u, v) => 0.9 + 0.8 * (0.5 + 0.5 * nF(u * 0.2, v * 0.2)), // 5 largeur des fissures
        (u, v) => clamp01(0.5 + 0.6 * nF(u * 0.25, v * 0.25)) * 0.55, // 6 pâte plus ou moins claire
        (u, v) => sstep(0.3, 0.8, nG(u * 0.4 + 3, v * 0.4)), // 7 taches brunes
      ];
      T.corps(geo, (k, u, v, o) => {
        const f = o.f;
        const q = o.r / o.Rl;
        let h = f[0];
        const pres = f[4] * sstep(0.45, 0.9, q); // ça ne s'ouvre que vers le bord
        const c = fis.eval(f[2], f[3], pres, f[5]);
        h += 0.6 * c.levre - 2.2 * c.fis + 0.35 * pres * c.cote * clamp01(c.e / 3);
        h += 0.08 * nF(u * 1.3, v * 1.3) + 0.04 * nG(u * 3, v * 3);
        h -= arrondi(o.Rl - o.r, 6.5);
        T.h[k] = h;
        // cuisson : pâle au centre, doré vers le bord et sur les reliefs
        copie(col, pate);
        vers(col, pate2, f[6]);
        const cuit = sstep(0.45, 1.0, q) * 0.8 + f[1] + 0.25 * c.levre;
        vers(col, dore, clamp01(cuit));
        vers(col, brun, sstep(0.86, 1.02, q) * 0.65 + 0.25 * f[7] * sstep(0.4, 0.9, q));
        vers(col, creuxC, c.fis * 0.7);
        ecrire(T, k, col);
        T.spec[k] = 0.05 + 0.05 * cuit;
        T.gloss[k] = 12;
      }, champs);
      const zone = {
        tirer: (r) => { const a = r() * TAU, d = Math.sqrt(r()) * 40; return [Math.cos(a) * d, Math.sin(a) * d]; },
        ok: (u, v, mm) => Math.hypot(u, v) < 44 - mm,
      };
      // morceaux de chocolat fondus dans la pâte
      for (let i = 0, n = rnd.int(5, 8); i < n; i++) {
        const [u, v] = zone.tirer(rnd);
        if (zone.ok(u, v, 5)) palet(T, u, v, rnd, rnd.range(3.8, 6.5));
      }
      // le petit tas de pastilles au centre (noir, lait, blanc)
      const cx = rnd.range(-8, 8), cy = rnd.range(-8, 8);
      const sortes = ['noir', 'noir', 'lait', 'blanc', rnd() < 0.5 ? 'noir' : 'blanc'];
      for (let i = 0; i < sortes.length; i++) {
        const a = (i / sortes.length) * TAU + rnd.range(-0.4, 0.4), d = i === 0 ? 0 : rnd.range(7, 10.5);
        pistole(T, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd, sortes[i], sortes[i] === 'blanc' ? rnd.range(5.2, 6.4) : rnd.range(4.6, 5.8));
      }
      for (let i = 0, n = rnd.int(1, 3); i < n; i++) {
        const [u, v] = zone.tirer(rnd);
        if (Math.hypot(u - cx, v - cy) > 16) pistole(T, u, v, rnd, rnd.pick(['noir', 'lait', 'noir']), rnd.range(4.4, 5.6));
      }
      semerSel(T, rnd, rnd.int(5, 8), zone);
      return null; // pas de tranche : le bord du cookie est son propre dessus qui plonge
    },
  };

  /* ---- cake marbré : une tranche couchée, volutes chocolat / vanille, croûte dorée ---- */
  const cakeMarbre = {
    nom: 'Cake marbré chocolat', prix: 4.9, desc: 'Une tranche : volutes chocolat et vanille, croûte dorée.',
    hauteur: 15, hmax: 17,
    geo: (seed) => Tranche(seed),
    ombre: { soft: 0.6, opacity: 0.4 },
    wrap: 0.3, penombre: 0.8, creuxF: 0.3,
    faire(T, geo, rnd, seed) {
      const H0 = 15;
      const nA = AC.noise2(seed + 41), nB = AC.noise2(seed + 42), nC = AC.noise2(seed + 43);
      const nF = bruitV(seed + 44), nG = bruitV(seed + 45);
      const vanille = C('#e8c98a'), vanille2 = C('#efd69c'), choco = C('#6a4530'), choco2 = C('#7c5338');
      const croute = C('#8a4f24'), croute2 = C('#b67a3e'), crouteD = C('#6f3b1b'), maillard = C('#d3a563');
      const col = [0, 0, 0], ch = [0, 0, 0], cc = [0, 0, 0];
      const ox = rnd.range(-50, 50), oy = rnd.range(-50, 50), per = rnd.range(17, 21), ph = rnd() * TAU;
      const champs = [
        (u, v) => 0.2 * nA(u * 0.05, v * 0.05) + 0.05 * Math.sin(v * 1.9 + 3 * nB(u * 0.02, v * 0.02)), // 0 la coupe : planéité, traces du couteau
        // 1 la marbrure : des couches (le long du moule) que la lame a fait onduler en volutes
        (u, v) => {
          const U = u + ox, V = v + oy;
          const w1 = nA(U * 0.022, V * 0.03), w2 = nB(U * 0.06 + 3, V * 0.06), w3 = nC(U * 0.14 - 4, V * 0.14);
          const vv = v + 11 * w1 + 3.5 * w2 + 1.1 * w3 + 5 * Math.sin(u * 0.045 + w1 * 2.5);
          const p = (vv / per) * TAU + ph;
          return Math.sin(p) + 0.22 * Math.sin(p * 2.3 + 1.3 * w2) + 0.7 * nC(U * 0.02 + 7, V * 0.02) - 0.08;
        },
        (u, v) => 0.5 + 0.5 * nF(u * 0.3, v * 0.3), // 2 teinte vanille
        (u, v) => 0.5 + 0.5 * nG(u * 0.3, v * 0.3), // 3 teinte chocolat
        (u, v) => 0.06 + 0.3 * sstep(-0.2, 0.6, nB(u * 0.07 - 9, v * 0.07 + 2)), // 4 netteté de la lisière
        (u, v) => 2.8 + 0.6 * nF(u * 0.3, 2), // 5 épaisseur de la croûte du dôme
      ];
      T.corps(geo, (k, u, v, o) => {
        const f = o.f;
        // l'épaisseur de croûte selon le côté : dôme plus cuit, semelle et côtés plus fins
        const ec = o.part === 3 ? f[5] : o.part === 1 ? 1.5 : 1.7;
        const dcr = o.part === 3 ? o.dd : o.part === 1 ? o.db : o.ds;
        const t = Math.min(o.t, dcr);
        let h = H0 + f[0];
        const g1 = nF(u * 2, v * 2), g2 = nG(u * 4, v * 4);
        h += 0.045 * g1 + 0.03 * g2; // la mie, un grain très fin
        h -= arrondi(o.t, 1.1);
        if (t < ec) h += 0.25 * sstep(ec, 0, t); // la croûte, plus ferme, dépasse un peu
        T.h[k] = h;
        const m = sstep(-f[4], f[4], f[1] + 0.12 * nF(u * 0.9, v * 0.9)); // lisière nette ici, fondue là
        copie(col, vanille);
        vers(col, vanille2, f[2]);
        copie(ch, choco);
        vers(ch, choco2, f[3]);
        vers(col, ch, m);
        vers(col, C('#8d5f3b'), (1 - Math.abs(2 * m - 1)) * 0.3); // là où les pâtes se mêlent
        fois(col, 1 + 0.08 * g1 + 0.05 * g2); // le grain de la mie
        // croûte et zone de Maillard
        vers(col, maillard, sstep(ec + 2.2, ec, t) * 0.5 * (1 - m * 0.6));
        copie(cc, o.part === 3 ? croute : croute2);
        if (o.part === 3) vers(cc, crouteD, sstep(ec, 0, t) * 0.5);
        vers(col, cc, sstep(ec + 0.25, ec - 0.35, t));
        ecrire(T, k, col);
        T.spec[k] = t < ec ? 0.08 : 0.02;
        T.gloss[k] = 10;
      }, champs);
      return (u, v, z, part, htop, o) => {
        copie(o.c, part === 3 ? croute : croute2);
        if (part === 3) vers(o.c, crouteD, 0.35 + 0.3 * nF(u * 0.4, z));
        fois(o.c, 1 + 0.1 * nF(u * 0.5 + v * 0.5, z * 0.8));
        o.sp = 0.06;
        o.bu = 0.3 * nG((u + v) * 0.9, z * 0.9);
        o.bz = 0.3 * nF((u - v) * 0.8, z * 0.9);
        return true;
      };
    },
  };

  /* ---- tartes : fond sablé, rebord ; citron meringuée et fruits rouges ---- */
  function fondTarte(T, geo, seed, P, dessusInt, champs) {
    const nA = AC.noise2(seed + 51), nF = bruitV(seed + 52), nG = bruitV(seed + 53);
    const pate = C('#d19a55'), pate2 = C('#e2b36c'), pateD = C('#a8692f');
    const col = [0, 0, 0];
    T.corps(geo, (k, u, v, o) => {
      if (o.d3 < P.rebord) {
        // le rebord de pâte sablée, arrondi, un peu friable
        const t = o.d3;
        let h = P.Hr + 0.35 * nA(u * 0.08, v * 0.08) - arrondi(t, 2.2) - arrondi(P.rebord - t, 1.6) * 0.6;
        h += 0.12 * nF(u * 1.2, v * 1.2) + 0.06 * nG(u * 2.6, v * 2.6);
        h -= arrondi(o.d1, 0.8) + arrondi(o.d2, 0.8);
        T.h[k] = h;
        copie(col, pate);
        vers(col, pate2, clamp01(0.5 + 0.7 * nF(u * 0.35, v * 0.35)) * 0.7);
        vers(col, pateD, sstep(1.2, 0, t) * 0.55 + 0.3 * sstep(0.35, 0.8, nG(u * 0.5, v * 0.5)));
        ecrire(T, k, col);
        T.spec[k] = 0.04; T.gloss[k] = 10;
        return;
      }
      dessusInt(k, u, v, o, col);
    }, champs);
    return { pate, pate2, pateD, nF, nG };
  }

  const tarteCitron = {
    nom: 'Tarte citron meringuée', prix: 5.2, desc: 'Pâte sablée, crème citron, meringue italienne flambée.',
    hauteur: 38, hmax: 42,
    geo: (seed) => Part(100, 19 * DEG, seed, 0.3, 0.6),
    ombre: { soft: 0.5, opacity: 0.38 },
    wrap: 0.3, sheen: 0.06, penombre: 1.4, creuxF: 0.3, creuxR: 1.8,
    faire(T, geo, rnd, seed) {
      const P = { rebord: 5, Hr: 21 };
      const Hc = 17, Hm = 22.5; // crème citron, base de la meringue
      const nA = AC.noise2(seed + 61);
      const nF = bruitV(seed + 62);
      const mer = C('#f6f0e2'), toast1 = C('#ecd2a0'), toast2 = C('#cf9656'), toast3 = C('#93592a');
      const pt = fondTarte(T, geo, seed, P, (k, u, v, o, col) => {
        T.h[k] = Hm + o.f[0] + 0.06 * nF(u * 1.5, v * 1.5) - arrondi(o.d1, 1.4) - arrondi(o.d2, 1.4);
        copie(col, mer);
        vers(col, toast1, o.f[1] * 0.35);
        ecrire(T, k, col);
        T.spec[k] = 0.1; T.gloss[k] = 14;
      }, [(u, v) => 0.6 * nA(u * 0.05, v * 0.05), (u, v) => sstep(0.5, 0.9, nA(u * 0.09 + 3, v * 0.09))]);
      // la meringue pochée en flammes, du centre vers le bord, par rangées serrées
      const col = [0, 0, 0];
      const flammes = [];
      for (let rr = 16, rang = 0; rr < 92; rr += 15, rang++) {
        const larg = 2 * rr * Math.tan(19 * DEG);
        const n = Math.max(1, Math.round(larg / 14));
        const echelle = 0.7 + 0.3 * Math.min(1, rr / 50);
        const dec = rang % 2 ? 0.5 : 0; // les rangées se chevauchent en quinconce
        for (let i = 0; i < n; i++) {
          const fr = n === 1 ? rnd.range(-0.2, 0.2) : -1 + (2 * (i + 0.5 + dec * 0.4)) / (n + dec * 0.4) + rnd.range(-0.1, 0.1);
          const a = rr + rnd.range(-2, 2);
          const [u, v] = geo.pt(a, fr * 0.92);
          const L = rnd.range(21, 26) * echelle;
          const dir = Math.atan2(v, u + geo.g) + rnd.range(-0.22, 0.22); // vers l'extérieur
          flammes.push({
            u: u - Math.cos(dir) * L * 0.3, v: v - Math.sin(dir) * L * 0.3, L, dir,
            w0: rnd.range(6.2, 8) * echelle, hm: rnd.range(10.5, 14) * echelle, courbe: rnd.range(-0.016, 0.016),
            feu: rnd.range(0.75, 1.25), // certaines ont pris plus de chalumeau que d'autres
          });
        }
      }
      for (const F of flammes) {
        const cd = Math.cos(F.dir), sd = Math.sin(F.dir);
        const r1 = F.w0, r2 = 0.7, L = F.L;
        const bb = (r1 - r2) / L, aa = Math.sqrt(1 - bb * bb);
        const z0 = Hm - 1;
        const nv = bruitV(rnd.int(1, 1e6));
        const sc = (L - r1) / 2; // la flamme va de s = −r1 à s = L + r2 : on la cerne au plus juste
        T.objet(F.u + cd * sc, F.v + sd * sc, (L + r1) / 2 + r2 + 1 + Math.abs(F.courbe) * L * L, (k, du, dv) => {
          // repère de la flamme : s le long de l'axe (0 : tête ronde, L : pointe), l en travers
          const X = du + cd * sc, Y = dv + sd * sc;
          const s = cd * X + sd * Y;
          const l = -sd * X + cd * Y - F.courbe * s * s; // la pointe s'incurve
          const pl = Math.abs(l);
          // cône arrondi (deux cercles r1, r2 et leur enveloppe)
          const kk = -bb * pl + aa * s;
          let dist;
          if (kk < 0) dist = Math.sqrt(s * s + pl * pl) - r1;
          else if (kk > aa * L) dist = Math.sqrt((s - L) * (s - L) + pl * pl) - r2;
          else dist = pl * aa + s * bb - r1;
          const al = clamp01(0.5 - dist * T.ppm);
          if (al <= 0) return;
          const t = clamp01(s / L);
          const rl = r1 + (r2 - r1) * t;
          const dans = clamp01(-dist / rl);
          const prof = Math.sqrt(1 - (1 - dans) * (1 - dans));
          const crete = Math.exp(-(l * l) / (0.08 * rl * rl + 0.2)); // l'arête du pochage
          const haut = F.hm * (0.72 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.1)));
          const z = z0 + haut * Math.pow(prof, 0.8) + 1.2 * crete * prof;
          // flambage : la pointe et l'arête dorent jusqu'au brun, les creux et la tête restent blancs
          const pr6 = Math.pow(prof, 0.6);
          const tau = clamp01(F.feu * pr6 * (sstep(0.3, 0.95, t) * (0.55 + 0.45 * crete) + 0.45 * crete * t) + 0.06 * nv(du * 0.5 + 5, dv * 0.5));
          copie(col, mer);
          vers(col, toast1, sstep(0.08, 0.35, tau));
          vers(col, toast2, sstep(0.35, 0.7, tau));
          vers(col, toast3, sstep(0.72, 1, tau) * 0.75);
          T.poser(k, z, al, col, 0.12 + 0.2 * tau, 16 + 16 * tau, true);
        });
      }
      // au centre de la tarte (la pointe de la part) : quelques fruits rouges et une fleur
      const zb = Hm + 7;
      const [m1u, m1v] = geo.pt(rnd.range(13, 16), rnd.range(-0.25, 0.25));
      myrtille(T, m1u, m1v, rnd, zb);
      const [fu, fv] = geo.pt(rnd.range(21, 25), rnd.range(-0.45, 0.45));
      if (rnd() < 0.6) drupes(T, fu, fv, rnd, 'framboise', zb);
      else myrtille(T, fu, fv, rnd, zb);
      const [lu, lv] = geo.pt(rnd.range(27, 31), rnd.range(-0.4, 0.4));
      fleur(T, lu, lv, rnd, zb + 3);
      // la tranche : fond sablé, crème citron, meringue
      const citron = C('#efc332'), citron2 = C('#f4d257');
      return (u, v, z, part, htop, o, s) => {
        if (T.fid[s] && z > Hm) return chairCoupee(T.fid[s], clamp01((z - Hm) / Math.max(1, htop - Hm)), o);
        const x = u + geo.g, y = v;
        const a = part === 3 ? fatan2(y, x) * 100 : Math.sqrt(x * x + y * y);
        if (part === 3 || z < 3.2 + 0.3 * pt.nF(a * 0.4, 1)) {
          if (part === 3 && z > P.Hr - 0.5) { copie(o.c, mer); o.sp = 0.08; return true; }
          copie(o.c, pt.pate);
          vers(o.c, pt.pate2, clamp01(0.5 + 0.7 * pt.nF(a * 0.4, z * 0.5)) * 0.6);
          vers(o.c, pt.pateD, sstep(1.5, 0, z) * 0.5 + (part === 3 ? 0.25 : 0));
          o.sp = 0.03; o.bu = 0.45 * pt.nG(a * 1.1, z * 1.1); o.bz = 0.4 * pt.nF(a * 1.2, z * 1.3);
          return true;
        }
        if (z < Hc + 0.3 * pt.nF(a * 0.3, 5)) {
          copie(o.c, citron);
          vers(o.c, citron2, sstep(Hc - 4, Hc, z) * 0.5);
          o.sp = 0.3; o.bu = 0.05 * pt.nF(a * 0.3, z * 0.3); o.bz = 0.05;
          return true;
        }
        copie(o.c, mer);
        fois(o.c, 1 + 0.03 * pt.nG(a * 0.6, z * 0.6));
        o.sp = 0.06; o.bu = 0.1 * pt.nG(a * 0.4, z * 0.4); o.bz = 0.1 * pt.nF(a * 0.4, z * 0.4);
        return true;
      };
    },
  };

  const tarteFruits = {
    nom: 'Tarte aux fruits rouges', prix: 5.2, desc: 'Pâte sablée, crème pâtissière, fruits rouges nappés.',
    hauteur: 30, hmax: 36,
    geo: (seed) => Part(100, 19 * DEG, seed, 0.3, 0.7),
    ombre: { soft: 0.5, opacity: 0.4 },
    wrap: 0.34, penombre: 1.2, creuxF: 0.4, creuxR: 1.2,
    faire(T, geo, rnd, seed) {
      const P = { rebord: 6, Hr: 22 };
      const Hc = 18;
      const nA = AC.noise2(seed + 71), nF = bruitV(seed + 72);
      const creme = C('#eed78e'), creme2 = C('#f3e2a6');
      const pt = fondTarte(T, geo, seed, P, (k, u, v, o, col) => {
        T.h[k] = Hc + o.f[0] - arrondi(o.d1, 0.8) - arrondi(o.d2, 0.8);
        copie(col, creme);
        vers(col, creme2, 0.5 + 0.5 * nF(u * 0.3, v * 0.3));
        ecrire(T, k, col);
        T.spec[k] = 0.25; T.gloss[k] = 20;
      }, [(u, v) => 0.3 * nA(u * 0.06, v * 0.06)]);
      // les fruits, serrés : d'abord les gros, puis on comble avec les petits
      const zone = zonePart(geo, 5, 100 - P.rebord - 0.5, 0);
      const places = [];
      const sortes = [
        { f: 'cerise', r: 9, n: 1 },
        { f: 'framboise', r: 7.8, n: 5 },
        { f: 'mure', r: 7.3, n: 4 },
        { f: 'myrtille', r: 4.8, n: 14 },
        { f: 'groseille', r: 3.6, n: 40 },
      ];
      for (const so of sortes) {
        for (let e = 0, m = 0; e < so.n * 70 && m < so.n; e++) {
          const [u, v] = zone.tirer(rnd);
          if (!zone.ok(u, v, so.r * 0.45)) continue;
          if (!places.every(([pu, pv, pr]) => (u - pu) ** 2 + (v - pv) ** 2 > ((so.r + pr) * 0.82) ** 2)) continue;
          places.push([u, v, so.r, so.f]);
          m++;
        }
      }
      const zb = Hc + 0.5;
      for (const [u, v, , f] of places) {
        if (f === 'cerise') cerise(T, u, v, rnd, zb);
        else if (f === 'framboise' || f === 'mure') drupes(T, u, v, rnd, f, zb);
        else if (f === 'myrtille') myrtille(T, u, v, rnd, zb);
        else groseille(T, u, v, rnd, zb);
      }
      // quelques points de crème pâtissière pochés entre les fruits
      for (let i = 0, n = rnd.int(3, 4), e = 0; i < n && e < 200; e++) {
        const [u, v] = zone.tirer(rnd);
        if (!zone.ok(u, v, 5)) continue;
        pointCreme(T, u, v, rnd, rnd.range(5.2, 6.6), Hc + 3.5);
        i++;
      }
      return (u, v, z, part, htop, o, s) => {
        const x = u + geo.g, y = v;
        const a = part === 3 ? fatan2(y, x) * 100 : Math.sqrt(x * x + y * y);
        if (part === 3 || z < 3.5 + 0.3 * pt.nF(a * 0.4, 1)) {
          if (part === 3 && z > P.Hr) return false;
          copie(o.c, pt.pate);
          vers(o.c, pt.pate2, clamp01(0.5 + 0.7 * pt.nF(a * 0.4, z * 0.5)) * 0.6);
          vers(o.c, pt.pateD, sstep(1.5, 0, z) * 0.5 + (part === 3 ? 0.25 : 0));
          o.sp = 0.03; o.bu = 0.45 * pt.nG(a * 1.1, z * 1.1); o.bz = 0.4 * pt.nF(a * 1.2, z * 1.3);
          return true;
        }
        if (z < Hc) {
          copie(o.c, creme);
          vers(o.c, creme2, 0.3);
          o.sp = 0.2; o.bu = 0.04 * pt.nF(a * 0.3, z * 0.3);
          return true;
        }
        // au-dessus : un fruit coupé par le couteau montre sa chair
        return chairCoupee(T.fid[s], clamp01((z - Hc) / Math.max(1, htop - Hc)), o);
      };
    },
  };

  const RECETTES = {
    'fondant-noir': fondant(FONDANT_NOIR),
    'fondant-lait': fondant(FONDANT_LAIT),
    brownie,
    cheesecake,
    cookie,
    'cake-marbre': cakeMarbre,
    'tarte-citron': tarteCitron,
    'tarte-fruits-rouges': tarteFruits,
    // la formule enfant : une petite part de fondant au lait
    'petite-part': fondant(Object.assign({}, FONDANT_LAIT, {
      nom: 'Petite part (formule enfant)', prix: null, desc: 'Une petite part de fondant au chocolat au lait.',
      R: 66, demi: 19 * DEG, H: 29, periode: 22, epaule: 3,
    })),
  };
  RECETTES['petite-part'].formule = 'formule-enfant';

  /* ==========================================================================
     Construction d'un sprite
     ========================================================================== */
  function graine(id, seed) {
    return (Math.imul((seed >>> 0) || 1, 2654435761) ^ AC.hash(id)) >>> 0;
  }

  // boîte monde (mm) de points locaux tournés de angle
  function boiteMonde(pts, angle) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const [u, v] of pts) {
      const x = ca * u - sa * v, y = sa * u + ca * v;
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
    }
    return [a, b, c, d];
  }

  function construire(id, seed, angle, ppm) {
    const rec = RECETTES[id];
    const s0 = graine(id, seed);
    const rnd = AC.rng(s0);
    const geo = rec.geo(s0 & 0xffff);
    const pts = geo.contour().slice();
    if (rec.extra) pts.push(...rec.extra(geo));
    top(null);
    const hmax = rec.hmax || rec.hauteur;
    const T = new Toile(ppm, boiteMonde(pts, angle), angle, hmax, marges(rec, hmax));
    const mur = rec.faire(T, geo, rnd, s0 & 0xffffff);
    top('gateau:' + id);
    return developper(T, rec, mur);
  }

  /* ---- les miettes (et le voile de cacao) autour de la part, sur l'assiette ---- */
  const MIETTES = {
    'fondant-noir': { cols: ['#2e1a13', '#4a2c22'], n: [4, 7], cacao: 0.75 },
    'fondant-lait': { cols: ['#8a5a38', '#a8744b'], n: [3, 6], cacao: 0.3 },
    brownie: { cols: ['#2e1a12', '#d2bc94', '#4a2c20'], n: [4, 7], cacao: 0 },
    cheesecake: { cols: ['#8c6139', '#b48a58'], n: [3, 5], cacao: 0, coulis: true },
    cookie: { cols: ['#d8b67a', '#c28a45', '#2d1912'], n: [5, 8], cacao: 0 },
    'cake-marbre': { cols: ['#e8c98b', '#5c3825', '#b67a3e'], n: [4, 7], cacao: 0 },
    'tarte-citron': { cols: ['#d19a55', '#e2b36c'], n: [3, 6], cacao: 0 },
    'tarte-fruits-rouges': { cols: ['#d19a55', '#e2b36c'], n: [3, 6], cacao: 0 },
    'petite-part': { cols: ['#8a5a38', '#a8744b'], n: [2, 4], cacao: 0.2 },
  };
  const RZ = 72; // les miettes restent dans le creux d'une assiette de 20 cm

  function construireMiettes(id, seed, angle, ppm) {
    const R = AC.R, M = MIETTES[id] || MIETTES['fondant-lait'];
    const s0 = graine(id + ':miettes', seed);
    const rnd = AC.rng(s0);
    const geo = RECETTES[id].geo(graine(id, seed) & 0xffff); // la même forme que le gâteau (pour l'éviter)
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const dessous = (x, y, mm) => { geo.eval(ca * x + sa * y, -sa * x + ca * y, geo.o); return geo.o.d < mm; };
    // le sprite : un carré de ±(RZ + 8) mm autour du point d'ancrage
    const E = RZ + 8, px0 = Math.floor(-E * ppm), S = Math.ceil(2 * E * ppm);
    const canvas = R.canvas(S, S), shadow = R.canvas(S, S);
    const cx = canvas.getContext('2d'), sx = shadow.getContext('2d');
    const sprite = { canvas, shadow, w: S / ppm, h: S / ppm, ax: -px0 / ppm, ay: -px0 / ppm };

    // 1. le voile de cacao tamisé sur l'assiette : une couche plate de fins grains (pas de relief)
    if (M.cacao > 0) {
      const nA = AC.noise2(s0 + 1), nB = AC.noise2(s0 + 2);
      const ox = rnd.range(-30, 30), oy = rnd.range(-30, 30);
      const img = new ImageData(S, S), d = img.data;
      const c1 = [128, 73, 50], c2 = [102, 56, 38]; // cacao sur faïence, tel qu'on le voit (sRGB)
      const pas = 4, gw = Math.ceil(S / pas) + 2;
      const G = new Float32Array(gw * gw);
      for (let gj = 0; gj < gw; gj++) {
        for (let gi = 0; gi < gw; gi++) {
          const x = (px0 + gi * pas + 0.5) / ppm, y = (px0 + gj * pas + 0.5) / ppm;
          const r = Math.sqrt(x * x + y * y);
          if (r > RZ + 2) continue;
          const u = ca * x + sa * y, v = -sa * x + ca * y;
          const fl = nA((u + ox) * 0.028, (v + oy) * 0.028) + 0.45 * nB((u - oy) * 0.075, (v + ox) * 0.075);
          G[gj * gw + gi] = M.cacao * sstep(0.25, 0.8, fl) * sstep(RZ, RZ - 14, r);
        }
      }
      for (let j = 0; j < S; j++) {
        const gy = j / pas, gj = gy | 0, fy = gy - gj;
        for (let i = 0; i < S; i++) {
          const gx = i / pas, gi = gx | 0, fx = gx - gi, q = gj * gw + gi;
          const dens = (G[q] * (1 - fx) + G[q + 1] * fx) * (1 - fy) + (G[q + gw] * (1 - fx) + G[q + gw + 1] * fx) * fy;
          if (dens <= 0.01) continue;
          // des grains : chaque pixel est plus ou moins chargé (poudre tamisée), jamais une tache pleine
          const g = h32(i, j, s0);
          const a = dens * (g < dens * 0.9 ? 0.55 + 0.45 * h32(j, i, s0 + 3) : 0.12 * g);
          if (a <= 0.02) continue;
          const t = h32(i + 7, j, s0), o = (j * S + i) * 4;
          d[o] = c1[0] + (c2[0] - c1[0]) * t; d[o + 1] = c1[1] + (c2[1] - c1[1]) * t; d[o + 2] = c1[2] + (c2[2] - c1[2]) * t;
          d[o + 3] = Math.min(1, a) * 190;
        }
      }
      cx.putImageData(img, 0, 0);
    }

    // 2. les miettes : chacune sa petite toile, son relief, sa lumière, son ombre
    const n = rnd.int(M.n[0], M.n[1]);
    const col = [0, 0, 0];
    const poserMiette = (x, y, fabrique, hauteur) => {
      const T = new Toile(ppm, [x - 4, y - 4, x + 4, y + 4], 0, 4, { g: 2, h: 2, d: 3, b: 3 });
      fabrique(T);
      const sp = developper(T, { hauteur, hmax: 4, ombre: { soft: 1, opacity: 0.35, contact: 0.3 }, wrap: 0.35 }, null);
      // la toile est décalée : ses coordonnées monde partent de (x0, y0) comme le sprite des miettes
      const ox = Math.round((0 - sp.ax) * ppm - px0), oy = Math.round((0 - sp.ay) * ppm - px0);
      if (sp.shadow) sx.drawImage(sp.shadow, ox, oy);
      cx.drawImage(sp.canvas, ox, oy);
    };
    for (let i = 0, e = 0; i < n && e < 400; e++) {
      const a = rnd() * TAU, dd = rnd.range(30, RZ - 6);
      const x = Math.cos(a) * dd, y = Math.sin(a) * dd;
      if (dessous(x, y, 3)) continue;
      const nb = rnd() < 0.3 ? rnd.int(2, 3) : 1;
      for (let q = 0; q < nb; q++) {
        const xx = x + rnd.range(-3, 3) * q, yy = y + rnd.range(-3, 3) * q;
        const r = rnd.range(0.6, 1.8) * (q ? 0.7 : 1);
        const pr = polyR(rnd, rnd.int(5, 7), r, 0.35);
        const c1 = C(rnd.pick(M.cols));
        const hh = r * rnd.range(0.6, 1.0);
        const nv = bruitV(rnd.int(1, 1e6));
        poserMiette(xx, yy, (T) => {
          T.objet(xx, yy, r * 1.4 + 0.4, (k, du, dv) => {
            const sd = Math.sqrt(du * du + dv * dv) - pr(fatan2(dv, du));
            const al = clamp01(0.5 - sd * T.ppm);
            if (al <= 0) return;
            copie(col, c1);
            fois(col, 0.9 + 0.2 * nv(du * 2, dv * 2));
            T.base[k] = Math.max(T.base[k], al);
            T.poser(k, hh * Math.sqrt(clamp01(-sd / r + 0.15)) + 0.1 * nv(du * 3, dv * 3), al, col, 0.05, 10, false, true);
          });
        }, hh);
      }
      i++;
    }
    // une goutte de coulis échappée (cheesecake)
    if (M.coulis) {
      for (let e = 0; e < 50; e++) {
        const a = rnd() * TAU, dd = rnd.range(42, 62);
        const x = Math.cos(a) * dd, y = Math.sin(a) * dd;
        if (dessous(x, y, 8)) continue;
        const r = rnd.range(2.2, 3.2), rouge = C('#4c0817'), fin = C('#861a30');
        poserMiette(x, y, (T) => {
          T.objet(x, y, r + 1, (k, du, dv) => {
            const sd = Math.hypot(du, dv * 1.2) - r;
            const al = clamp01(0.5 - sd * T.ppm);
            if (al <= 0) return;
            copie(col, fin);
            vers(col, rouge, sstep(0.2, 1.5, -sd));
            T.poser(k, 0.9 * sstep(0, 1.4, -sd) + 0.05, al, col, 1.3, 90, false, true);
          });
        }, 0.4);
        break;
      }
    }
    return sprite;
  }

  /* ==========================================================================
     API
     ========================================================================== */
  let listeCache = null;
  const faireListe = () => Object.keys(RECETTES).map((id) => {
    const rec = RECETTES[id];
    const geo = rec.geo(1);
    // taille du pied à angle 0 (mm) : on balaie la forme au millimètre
    const o = geo.o;
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    const [x0, y0, x1, y1] = boiteMonde(geo.contour(), 0);
    for (let v = Math.floor(y0); v <= y1; v += 2) {
      for (let u = Math.floor(x0); u <= x1; u += 2) {
        geo.eval(u, v, o);
        if (o.d < 0) { a = Math.min(a, u); c = Math.max(c, u); b = Math.min(b, v); d = Math.max(d, v); }
      }
    }
    const e = { id, nom: rec.nom, prix: rec.prix, taille: [Math.round(c - a + 2), Math.round(d - b + 2)], hauteur: rec.hauteur, desc: rec.desc };
    if (rec.formule) e.formule = rec.formule;
    return e;
  });

  const quantifier = (ppm) => Math.max(0.5, Math.round(ppm * 20) / 20);

  AC.Gateaux = {
    /** [{ id, nom, prix, taille: [w, h] (mm, pied du gâteau à angle 0), hauteur (mm), desc }] */
    get liste() { return listeCache || (listeCache = faireListe()); },
    /** Inclinaison de la vue (mm d'écran par mm de hauteur), partagée avec la vaisselle */
    get PENTE() { return pente(); },
    /** Le gâteau seul, vu de dessus (très légèrement oblique), ombre portée comprise. */
    rendre(id, { seed = 1, angle = 0 } = {}, ppm = 4) {
      if (!RECETTES[id]) throw new Error('Gâteau inconnu : ' + id);
      const q = quantifier(ppm), an = Math.round(angle * 1000) / 1000;
      return AC.R.memo(`gateau:${id}:${q}:${seed}:${an}:${pente()}`, () => construire(id, seed, an, q));
    },
    /** Facultatif : un rendu minuscule et jeté, pour que le premier vrai rendu trouve le code déjà compilé. */
    prechauffer(id) {
      for (const i of id ? [id] : Object.keys(RECETTES)) construire(i, 1, 0, 0.9);
    },
    /** Miettes (et voile de cacao pour les fondants) à poser sous le gâteau, même ancrage. */
    miette(id, { seed = 1, angle = 0 } = {}, ppm = 4) {
      if (!RECETTES[id]) throw new Error('Gâteau inconnu : ' + id);
      const q = quantifier(ppm), an = Math.round(angle * 1000) / 1000;
      return AC.R.memo(`miettes:${id}:${q}:${seed}:${an}:${pente()}`, () => construireMiettes(id, seed, an, q));
    },
  };
})();

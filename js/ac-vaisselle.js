/* ==========================================================================
   L'Armoire à Cuillères — la vaisselle ancienne, la table et les boissons
   Calcul pixel par pixel (canvas 2D), vu de dessus, avec la lumière commune d'AC.R
   (fenêtre en haut à gauche). Tout est déterministe : même graine → même image.

   Repère : millimètres ; x vers la droite, y vers le bas, z vers l'œil.
   Les objets hauts (tasses, verres, théière) sont vus avec une légère parallaxe
   (AC.R.TILT : l'appareil est un peu du côté du spectateur, comme sur les photos
   Instagram) : on devine la paroi extérieure et son décor du côté bas.

   Sprites au format d'ac-rendu.js : { canvas, shadow, w, h, ax, ay } (+ quelques champs utiles).
   ppm = pixels par millimètre (≈ 2,2 × devicePixelRatio). Tout est mis en cache (AC.R.memo).

   AC.Vaisselle
     assiette({ motif: 'bleu'|'rose'|'brun'|'filet'|'blanche', d = 200, chantourne = true, seed, sol }, ppm) → sprite
         (+ .R, .puits { r, z } : le bassin, .haut) — faïence, décor imprimé « terre de fer » sous l'émail
     soucoupe({ motif, d = 140, chantourne = false, seed, sol }, ppm) → sprite
     tasse({ motif, style: 'tasse'|'bol'|'expresso'|'mug', d (défaut selon le style : 92, 118, 64, 86), seed, sol }, ppm)
         → { sprite, inner: { cx, cy, r, z }, clip: { cx, cy, r }, niveau(f) → { cx, cy, r, z }, forme, prof, tilt }
         inner : le disque de liquide (mm, repère du sprite) ; clip : l'ouverture (le bord cache le liquide au-delà) ;
         niveau(f) : le disque pour un remplissage f ∈ [0, 1] (pour l'animation du service)
     verre({ d = 78, style: 'gobelet'|'bocal', seed, boisson, niveau, sol }, ppm) → { sprite, inner } (vide sans boisson)
     theiere({ seed, motif = 'rose', matiere: 'porcelaine'|'fonte', d = 150, sol }, ppm) → sprite
     cuillere({ l = 125, seed, sol }, ppm) → sprite, cuilleron en bas (.bol : centre du cuilleron) ; sol = couleur de la
         table (l'argent la reflète)
     table({ bois: 'menthe'|'sauge'|'jaune'|'orange'|'#rrggbb', w, h, seed, lumiere = true }, ppm) → canvas opaque
     nappe({ w, h, seed, couleur, ourlet = true }, ppm) → canvas opaque (chemin de table en lin fleuri)
     rotin({ d = 330, seed }, ppm) → sprite
     ombreTournee(sprite, rot, ppm, haut) → { canvas, dx, dy, k } : l'ombre d'un sprite tourné (cuillère qui tourne)
     prechauffer(ids, ppm, fini) : calcule des boissons servies pendant les temps morts
   AC.Boissons
     CRUS { id: { nom, cacao, genre: 'blanc'|'lait'|'noir', couleur, brillance, mousse, texture } } ; THES { id: { nom, genre, couleur, opacite } }
     liste [ { id, nom, famille, froid, contenant: { type: 'tasse'|'verre', style, motif, soucoupe, … } } ] : toute la carte
     surface(id, { r = 40, seed }, ppm) → canvas (disque de rayon r mm, côté 2r mm ; .r, .ppm, .transp)
     dans(tasse, id, { seed, niveau }, ppm) → sprite : la boisson versée dans une tasse donnée
     servir(id, { seed, cuillere = true, soucoupe = true, niveau, sol }, ppm) → sprite (.inner : le disque de liquide,
         .tasse : position de la tasse) : tasse + soucoupe + cuillère posée, ou verre
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const R = AC.R;
  if (!R) throw new Error('ac-vaisselle.js : charger ac-rendu.js avant');

  /* ======================================================================
     1. Petits outils
     ====================================================================== */
  const TAU = Math.PI * 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, x) => {
    const t = (x - a) / (b - a);
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexLin = (hex) => R.lin(hex);
  const q20 = (ppm) => Math.round(ppm * 20) / 20; // ppm arrondi (clés de cache)
  const TILT = () => (R.TILT != null ? R.TILT : 0.2);

  /* atan2 rapide (erreur < 0,002 rad) */
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

  /* hachage entier → [0, 1) */
  function hash2(i, j, s) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function canvas(w, h, lecture) {
    const c = R.canvas(w, h);
    c.__g = c.getContext('2d', lecture ? { willReadFrequently: true } : undefined);
    return c;
  }

  /* ---------- bruit : tuiles périodiques 256×256 (gradient de Perlin, octaves) ----------
     Les tuiles sont partagées (quelques variantes) ; chaque objet s'y promène avec un décalage
     tiré de sa graine (ofs) : pas de recalcul par graine. */
  const TN = 256, TM = 255;
  const TUILES = new Map();
  function tuile(variante, per = 8, oct = 1, gain = 0.5) {
    const seed = 1013 + (variante & 7) * 7919;
    const key = seed + ':' + per + ':' + oct + ':' + gain;
    let T = TUILES.get(key);
    if (T) return T;
    T = new Float32Array(TN * TN);
    let amp = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const p = Math.min(TN, per << o);
      const rr = AC.rng((Math.imul(seed | 0, 7919) + o * 104729 + 17) >>> 0);
      const gx = new Float32Array(p * p), gy = new Float32Array(p * p);
      for (let i = 0; i < p * p; i++) {
        const a = rr() * TAU;
        gx[i] = Math.cos(a);
        gy[i] = Math.sin(a);
      }
      const cell = TN / p;
      for (let y = 0; y < TN; y++) {
        const fy = y / cell, iy = Math.floor(fy), ty = fy - iy, iy1 = (iy + 1) % p;
        const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        for (let x = 0; x < TN; x++) {
          const fx = x / cell, ix = Math.floor(fx), tx = fx - ix, ix1 = (ix + 1) % p;
          const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
          const a0 = iy * p + ix, a1 = iy * p + ix1, b0 = iy1 * p + ix, b1 = iy1 * p + ix1;
          const n00 = gx[a0] * tx + gy[a0] * ty;
          const n10 = gx[a1] * (tx - 1) + gy[a1] * ty;
          const n01 = gx[b0] * tx + gy[b0] * (ty - 1);
          const n11 = gx[b1] * (tx - 1) + gy[b1] * (ty - 1);
          const u = n00 + sx * (n10 - n00), v = n01 + sx * (n11 - n01);
          T[y * TN + x] += amp * (u + sy * (v - u)) * 1.45;
        }
      }
      norm += amp;
      amp *= gain;
    }
    for (let i = 0; i < T.length; i++) T[i] /= norm;
    TUILES.set(key, T);
    return T;
  }
  /* décalage (texels) propre à une graine et à un usage */
  const ofs = (seed, k) => [hash2(seed, k, 1) * 256, hash2(seed, k, 2) * 256];

  /* ImageData réutilisés par taille (ils sont recopiés dans un canvas aussitôt éclairés) */
  const IMGS = new Map();
  function imageData(w, h, nom) {
    const key = nom + ':' + w + 'x' + h;
    let im = IMGS.get(key);
    if (!im) {
      if (IMGS.size > 24) IMGS.clear();
      im = new ImageData(w, h);
      IMGS.set(key, im);
    } else im.data.fill(0);
    return im;
  }

  /* ---------- réserve de tampons (évite le ramasse-miettes : les calculs sont séquentiels) ---------- */
  const RESERVE = new Map();
  function tampon(nom, n, T = Float32Array, zero = true) {
    let b = RESERVE.get(nom);
    if (!b || b.length < n || !(b instanceof T)) {
      b = new T(Math.ceil(n * 1.15));
      RESERVE.set(nom, b);
    }
    const v = b.subarray(0, n);
    if (zero) v.fill(0);
    return v;
  }

  /* échantillon bilinéaire (coordonnées en texels, répétition) */
  function tx(T, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = xi & TM, y0 = (yi & TM) << 8, x1 = (x0 + 1) & TM, y1 = ((yi + 1) & TM) << 8;
    const a = T[y0 | x0], b = T[y0 | x1], c = T[y1 | x0], d = T[y1 | x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* sRGB 8 bits → linéaire */
  const LIN8 = new Float32Array(256), LN8 = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    LIN8[i] = Math.pow(i / 255, 2.2);
    LN8[i] = Math.log(LIN8[i] + 0.002);
  }

  /* ---------- linéaire → sRGB 8 bits (table indexée en racine : précise dans les noirs) ---------- */
  const ENC_N = 4096;
  const ENC = new Uint8ClampedArray(ENC_N + 1);
  for (let i = 0; i <= ENC_N; i++) {
    let v = 2 * (i / ENC_N) * (i / ENC_N); // v ∈ [0, 2]
    if (v > 0.9) v = 0.9 + 0.1 * (1 - Math.exp(-(v - 0.9) / 0.1)); // épaule douce des reflets
    ENC[i] = Math.round(Math.pow(v, 1 / 2.2) * 255);
  }
  const enc = (v) => (v <= 0 ? 0 : v >= 2 ? 255 : ENC[(Math.sqrt(v * 0.5) * ENC_N) | 0]);

  /* ======================================================================
     2. Lumière : la même qu'AC.R.shade (diffus enveloppant, ambiance froide, lumière chaude),
        plus les reflets de l'environnement : la fenêtre (croisillons), la pièce, la table.
     ====================================================================== */
  const ENV = R.ENV || (() => {
    const W0 = R.L;
    let ux = -W0[1], uy = W0[0];
    const ul = Math.hypot(ux, uy);
    ux /= ul; uy /= ul;
    const vx = -W0[2] * uy, vy = W0[2] * ux, vz = W0[0] * uy - W0[1] * ux;
    return {
      W0, ux, uy, vx, vy, vz,
      U: 0.47, V0: -0.52, V1: 0.66, // la porte-fenêtre dans le plan tangent (≈ ±25° × 17°…78° d'élévation)
      BAR: 0.02, TRAV: 0.1, // meneau (u = 0) et traverse (v = TRAV)
      SKY: 7.5, STREET: 3.2, // luminance du haut (ciel) et du bas (façades de la rue)
      WALL: [0.42, 0.39, 0.33], CEIL: [0.26, 0.25, 0.23], SOL: [0.3, 0.26, 0.21],
    };
  })();

  /** Rayonnement vu dans la direction (rx, ry, rz) (unitaire), pour une rugosité donnée → out[0..2] (linéaire).
      (Le même qu'AC.R.env, défini dans ac-rendu.js ; copie locale si celui-ci manque.) */
  const envRad = R.env || envRadLocal;
  function envRadLocal(rx, ry, rz, rough, sol, out) {
    const E = ENV;
    // la pièce : murs crème, plafond plus sombre ; sous l'horizon : la table
    if (rz >= 0) {
      const t = rz;
      out[0] = E.WALL[0] + (E.CEIL[0] - E.WALL[0]) * t;
      out[1] = E.WALL[1] + (E.CEIL[1] - E.WALL[1]) * t;
      out[2] = E.WALL[2] + (E.CEIL[2] - E.WALL[2]) * t;
    } else {
      const s = sol || E.SOL, t = rz < -0.25 ? 1 : -rz * 4;
      out[0] = E.WALL[0] + (s[0] * 0.5 - E.WALL[0]) * t;
      out[1] = E.WALL[1] + (s[1] * 0.5 - E.WALL[1]) * t;
      out[2] = E.WALL[2] + (s[2] * 0.5 - E.WALL[2]) * t;
    }
    const d = rx * E.W0[0] + ry * E.W0[1] + rz * E.W0[2];
    if (d > 0.3) {
      const id = 1 / d;
      const u = (rx * E.ux + ry * E.uy) * id;
      const v = (rx * E.vx + ry * E.vy + rz * E.vz) * id;
      const e = 0.012 + rough * 0.55;
      const au = u < 0 ? -u : u;
      if (au < E.U + e && v > E.V0 - e && v < E.V1 + e) {
        let m = sstep(-e, e, E.U - au) * sstep(-e, e, v - E.V0) * sstep(-e, e, E.V1 - v);
        if (m > 0) {
          if (rough < 0.35) {
            const eb = e * 0.7, kb = 1 - rough * 2.8;
            const bu = 1 - sstep(E.BAR - eb, E.BAR + eb, au);
            const dv = v - E.TRAV, bv = 1 - sstep(E.BAR - eb, E.BAR + eb, dv < 0 ? -dv : dv);
            m *= 1 - kb * 0.85 * (bu > bv ? bu : bv);
          }
          const L = (E.STREET + (E.SKY - E.STREET) * sstep(E.V0, E.V1 * 0.8, v)) * (1 - 0.72 * (rough > 1 ? 1 : rough));
          const W = R.WARM;
          out[0] += m * L * W[0];
          out[1] += m * L * W[1];
          out[2] += m * L * W[2];
        }
      }
      // halo autour de la baie (tableaux, rideau, mur éclairé)
      const q = 1 + (u * u + (v - 0.05) * (v - 0.05)) * 1.1;
      const g = (0.35 + rough * 0.6) / (q * q);
      out[0] += g; out[1] += g * 0.96; out[2] += g * 0.9;
    }
    return out;
  }

  /** Direction de l'œil (projection oblique : l'œil est un peu vers le bas de l'image) */
  function oeil() {
    const t = TILT(), n = Math.hypot(t, 1);
    return [0, t / n, 1 / n];
  }

  /**
   * Éclaire une zone w×h. Tableaux (longueur w*h, ou ×3 pour alb) :
   *   alb (linéaire), alpha, nx/ny/nz, et en option :
   *   ao (occlusion, 1 = dégagé), vis (ombre portée sur la lumière directe, 1 = au soleil),
   *   f0 (réflectance à incidence normale : 0,04 émail, 0,02 liquide ; nombre ou tableau),
   *   rough (0 miroir … 1 mat ; nombre ou tableau), met (métal 0..1, tableau ou nombre),
   *   env (facteur des reflets 0..1, tableau ou nombre), sol (couleur linéaire de la table, pour les reflets)
   * → ImageData
   */
  function eclairer(o) {
    const { w, h, alb, alpha, nx, ny, nz } = o;
    const img = o.img || new ImageData(w, h), d = img.data;
    const L0 = R.L[0], L1 = R.L[1], L2 = R.L[2];
    const WA = R.WARM, FI = R.FILL, A = R.AMBIENT;
    const wrap = o.wrap != null ? o.wrap : 0.25, iw = 1 / (1 + wrap);
    const V = oeil(), Vy = V[1], Vz = V[2];
    const ao = o.ao || null, vis = o.vis || null, add = o.add || null;
    const f0a = typeof o.f0 === 'object' ? o.f0 : null, f0n = f0a ? 0 : o.f0 != null ? o.f0 : 0.04;
    const rga = typeof o.rough === 'object' ? o.rough : null, rgn = rga ? 0 : o.rough != null ? o.rough : 0.1;
    const mea = typeof o.met === 'object' ? o.met : null, men = mea ? 0 : o.met || 0;
    const eva = typeof o.env === 'object' ? o.env : null, evn = eva ? 0 : o.env != null ? o.env : 1;
    const E = ENV, sol = o.sol || E.SOL;
    const Wx = E.W0[0], Wy = E.W0[1], Wz = E.W0[2], Ux = E.ux, Uy = E.uy, Xv = E.vx, Yv = E.vy, Zv = E.vz;
    const EU = E.U, EV0 = E.V0, EV1 = E.V1, BAR = E.BAR, TRAV = E.TRAV, SKY = E.SKY, STR = E.STREET;
    const w0 = E.WALL[0], w1 = E.WALL[1], w2 = E.WALL[2];
    const dc0 = E.CEIL[0] - w0, dc1 = E.CEIL[1] - w1, dc2 = E.CEIL[2] - w2;
    const ds0 = sol[0] * 0.5 - w0, ds1 = sol[1] * 0.5 - w1, ds2 = sol[2] * 0.5 - w2;
    const kd0 = WA[0] * 0.82, kd1 = WA[1] * 0.82, kd2 = WA[2] * 0.82;
    const ka0 = A * FI[0], ka1 = A * FI[1], ka2 = A * FI[2];
    const vSky = 1 / (EV1 * 0.8 - EV0);
    for (let i = 0, n = w * h; i < n; i++) {
      const a = alpha ? alpha[i] : 1;
      if (a <= 0.002) continue;
      const Nx = nx[i], Ny = ny[i], Nz = nz[i];
      let diff = (Nx * L0 + Ny * L1 + Nz * L2 + wrap) * iw;
      if (diff < 0) diff = 0;
      const oc = ao ? ao[i] : 1;
      if (vis) diff *= vis[i];
      // reflet : direction miroir de l'œil
      const ndv = Ny * Vy + Nz * Vz;
      const rx = 2 * ndv * Nx, ry = 2 * ndv * Ny - Vy, rz = 2 * ndv * Nz - Vz;
      const rough = rga ? rga[i] : rgn;
      // la pièce, la table sous l'horizon
      let e0, e1, e2;
      if (rz >= 0) {
        e0 = w0 + dc0 * rz; e1 = w1 + dc1 * rz; e2 = w2 + dc2 * rz;
      } else {
        const t = rz < -0.25 ? 1 : -rz * 4;
        e0 = w0 + ds0 * t; e1 = w1 + ds1 * t; e2 = w2 + ds2 * t;
      }
      // la porte-fenêtre
      const dd = rx * Wx + ry * Wy + rz * Wz;
      if (dd > 0.3) {
        const idd = 1 / dd;
        const u = (rx * Ux + ry * Uy) * idd;
        const v = (rx * Xv + ry * Yv + rz * Zv) * idd;
        const e = 0.012 + rough * 0.55, ie = 0.5 / e;
        const au = u < 0 ? -u : u;
        if (au < EU + e && v > EV0 - e && v < EV1 + e) {
          let t1 = (EU - au + e) * ie; t1 = t1 >= 1 ? 1 : t1 * t1 * (3 - 2 * t1);
          let t2 = (v - EV0 + e) * ie; t2 = t2 >= 1 ? 1 : t2 <= 0 ? 0 : t2 * t2 * (3 - 2 * t2);
          let t3 = (EV1 - v + e) * ie; t3 = t3 >= 1 ? 1 : t3 <= 0 ? 0 : t3 * t3 * (3 - 2 * t3);
          let m = t1 * t2 * t3;
          if (m > 0) {
            if (rough < 0.35) {
              const eb = e * 0.7, ib = 0.5 / eb;
              let bu = (au - BAR + eb) * ib; bu = bu <= 0 ? 1 : bu >= 1 ? 0 : 1 - bu * bu * (3 - 2 * bu);
              const dv0 = v - TRAV, dv = dv0 < 0 ? -dv0 : dv0;
              let bv = (dv - BAR + eb) * ib; bv = bv <= 0 ? 1 : bv >= 1 ? 0 : 1 - bv * bv * (3 - 2 * bv);
              m *= 1 - (1 - rough * 2.8) * 0.85 * (bu > bv ? bu : bv);
            }
            let sk = (v - EV0) * vSky;
            sk = sk <= 0 ? 0 : sk >= 1 ? 1 : sk * sk * (3 - 2 * sk);
            const Lw = m * (STR + (SKY - STR) * sk) * (1 - 0.72 * (rough > 1 ? 1 : rough));
            e0 += Lw * WA[0]; e1 += Lw * WA[1]; e2 += Lw * WA[2];
          }
        }
        const q = 1 + (u * u + (v - 0.05) * (v - 0.05)) * 1.1;
        const g = (0.35 + rough * 0.6) / (q * q);
        e0 += g; e1 += g * 0.96; e2 += g * 0.9;
      }
      const f0 = f0a ? f0a[i] : f0n;
      const met = mea ? mea[i] : men;
      const ek = (eva ? eva[i] : evn) * (0.35 + 0.65 * oc);
      const c1 = ndv > 0 ? 1 - ndv : 1, r1 = 1 - rough;
      const c5 = c1 * c1 * c1 * c1 * c1 * r1 * r1;
      const fs = f0 + (1 - f0) * c5, kdl = diff * oc, kam = 0.55 + 0.45 * oc, dm = (1 - met) * (1 - fs * (1 - met));
      const j = i * 3, k = i * 4;
      const al0 = alb[j], al1 = alb[j + 1], al2 = alb[j + 2];
      let v0 = al0 * dm * (kdl * kd0 + ka0 * kam) + (fs + (al0 + (1 - al0) * c5 - fs) * met) * e0 * ek;
      let v1 = al1 * dm * (kdl * kd1 + ka1 * kam) + (fs + (al1 + (1 - al1) * c5 - fs) * met) * e1 * ek;
      let v2 = al2 * dm * (kdl * kd2 + ka2 * kam) + (fs + (al2 + (1 - al2) * c5 - fs) * met) * e2 * ek;
      if (add) { v0 += add[j]; v1 += add[j + 1]; v2 += add[j + 2]; }
      d[k] = v0 <= 0 ? 0 : v0 >= 2 ? 255 : ENC[(Math.sqrt(v0 * 0.5) * ENC_N) | 0];
      d[k + 1] = v1 <= 0 ? 0 : v1 >= 2 ? 255 : ENC[(Math.sqrt(v1 * 0.5) * ENC_N) | 0];
      d[k + 2] = v2 <= 0 ? 0 : v2 >= 2 ? 255 : ENC[(Math.sqrt(v2 * 0.5) * ENC_N) | 0];
      d[k + 3] = a * 255 + 0.5;
    }
    return img;
  }
  /* ======================================================================
     3. Zones de travail, ombres, sprites
     ====================================================================== */
  /** Un cadre : la boîte de l'objet (mm, autour de l'ancre) + marges pour l'ombre portée */
  function cadre(ppm, bx0, by0, bx1, by1, haut, soft = 1) {
    const off = haut * 0.55, sx = R.SHADOW_DIR[0] * off, sy = R.SHADOW_DIR[1] * off;
    const sig = haut * 0.6 * soft;
    const mL = Math.max(1.5, 1.7 * sig - sx), mT = Math.max(1.5, 1.7 * sig - sy);
    const mR = sx + 1.9 * sig + 1.5, mB = sy + 1.9 * sig + 1.5;
    const px0 = Math.round(mL * ppm), py0 = Math.round(mT * ppm);
    const w = Math.ceil((bx1 - bx0) * ppm) + 1, h = Math.ceil((by1 - by0) * ppm) + 1;
    const W = px0 + w + Math.ceil(mR * ppm), H = py0 + h + Math.ceil(mB * ppm);
    return {
      ppm, bx0, by0, w, h, px0, py0, W, H, haut, soft,
      ax: px0 / ppm - bx0, ay: py0 / ppm - by0,
      // coordonnées mm du centre du pixel (i, j) de la zone de travail
      X: (i) => bx0 + (i + 0.5) / ppm,
      Y: (j) => by0 + (j + 0.5) / ppm,
    };
  }

  /** Ombre portée (AC.R.castShadow) calculée en basse résolution puis agrandie */
  function ombrePortee(alpha, w, h, px0, py0, W, H, ppm, opts) {
    const cible = opts.ppmS || (opts.height > 30 ? 1.0 : 1.3);
    const k = Math.max(1, Math.floor(ppm / cible));
    const w2 = Math.ceil(W / k), h2 = Math.ceil(H / k);
    const a2 = new Float32Array(w2 * h2);
    const inv = 1 / (k * k);
    for (let j = 0; j < h; j++) {
      const yy = (((j + py0) / k) | 0) * w2;
      for (let i = 0; i < w; i++) {
        const v = alpha[j * w + i];
        if (v > 0) a2[yy + (((i + px0) / k) | 0)] += v * inv;
      }
    }
    const small = R.castShadow(a2, w2, h2, ppm / k, opts);
    const c = R.canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, w2 * k, h2 * k);
    // pour composer vite : l'ombre en petit, et la silhouette (alpha basse résolution)
    c.petite = small;
    c.k = k;
    c.a2 = a2;
    c.w2 = w2;
    c.h2 = h2;
    return c;
  }

  /** Assemble un sprite : image éclairée de la zone + ombre */
  function sprite(fr, img, alpha, ombreOpts, extra) {
    const c = R.canvas(fr.W, fr.H);
    c.getContext('2d').putImageData(img, fr.px0, fr.py0);
    const sh = ombreOpts ? ombrePortee(alpha, fr.w, fr.h, fr.px0, fr.py0, fr.W, fr.H, fr.ppm, ombreOpts) : null;
    return Object.assign({ canvas: c, shadow: sh, w: fr.W / fr.ppm, h: fr.H / fr.ppm, ax: fr.ax, ay: fr.ay, ppm: fr.ppm }, extra || {});
  }

  /** Visibilité de la lumière directe sur un relief (ombres propres), marche vers la lumière */
  function ombresRelief(Hf, alpha, w, h, ppm, { dist = 12, pas = 10, doux = 0.6, base = 0 } = {}) {
    const vis = new Float32Array(w * h).fill(1);
    const L = R.L, kz = L[2] / Math.hypot(L[0], L[1]);
    const dx = L[0] / Math.hypot(L[0], L[1]), dy = L[1] / Math.hypot(L[0], L[1]);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const id = j * w + i;
        if (alpha && alpha[id] <= 0) continue;
        const h0 = Hf[id];
        let v = 1;
        for (let s = 1; s <= pas; s++) {
          const t = (dist * s * s) / (pas * pas); // mm, pas croissants
          const xi = (i + dx * t * ppm) | 0, yj = (j + dy * t * ppm) | 0;
          if (xi < 0 || yj < 0 || xi >= w || yj >= h) break;
          const hh = Hf[yj * w + xi] - base, ray = h0 - base + t * kz;
          if (hh > ray) {
            const occ = clamp01((hh - ray) / (doux + t * 0.18));
            if (1 - occ < v) v = 1 - occ;
            if (v <= 0) break;
          }
        }
        vis[id] = v;
      }
    }
    return vis;
  }

  /* ======================================================================
     4. Décors imprimés « terre de fer » : roses gravées, feuilles, boutons,
        fougères, volutes, vermiculé, dentelles. Dessinés en millimètres dans un
        canvas (Canvas 2D), puis lus comme une couverture d'encre sous l'émail.
     ====================================================================== */
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')';

  /* échantillonne une courbe de Catmull-Rom (ouverte) : n points par segment */
  function crPts(pts, n = 6) {
    const out = [];
    const m = pts.length;
    for (let i = 0; i < m - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(m - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[m - 1]);
    return out;
  }

  /* trait effilé le long d'une polyligne dense : largeur w0 → w1 (mm), profil en fuseau */
  function trait(g, P, w0, w1, fuseau = 0) {
    const n = P.length;
    if (n < 2) return;
    const Lf = [], Rt = [];
    for (let k = 0; k < n; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
      let tx_ = b[0] - a[0], ty_ = b[1] - a[1];
      const l = Math.hypot(tx_, ty_) || 1;
      tx_ /= l; ty_ /= l;
      const s = k / (n - 1);
      const wv = (lerp(w0, w1, s) + fuseau * Math.sin(Math.PI * s)) * 0.5;
      Lf.push([P[k][0] - ty_ * wv, P[k][1] + tx_ * wv]);
      Rt.push([P[k][0] + ty_ * wv, P[k][1] - tx_ * wv]);
    }
    g.beginPath();
    g.moveTo(Lf[0][0], Lf[0][1]);
    for (let k = 1; k < n; k++) g.lineTo(Lf[k][0], Lf[k][1]);
    for (let k = n - 1; k >= 0; k--) g.lineTo(Rt[k][0], Rt[k][1]);
    g.closePath();
    g.fill();
  }

  function polyStroke(g, P, lw) {
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(P[0][0], P[0][1]);
    for (let k = 1; k < P.length; k++) g.lineTo(P[k][0], P[k][1]);
    g.stroke();
  }

  function effacer(g, fn) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    fn();
    g.restore();
  }

  /**
   * Une feuille. st : { c: couleur du trait, cl: couleur du lavis (polychrome) ou null,
   *   mode: 'plein' (masse + nervures claires) | 'demi' (moitié ombrée) | 'contour', dent: dentelure 0..1, r: rng }
   */
  function feuille(g, st, x, y, ang, len, wid, mode) {
    const r = st.r;
    mode = mode || st.feuille || 'plein';
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const T = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
    const bend = r.range(-0.35, 0.35) * wid;
    const asym = r.range(-0.15, 0.15);
    const dent = st.dent || 0;
    const N = Math.max(8, Math.min(18, Math.round(len * 1.6)));
    const Lf = [], Rt = [], M = [];
    const pic = r.range(0.35, 0.45);
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      const mv = bend * 4 * s * (1 - s) + bend * 0.25 * s;
      const ws = s < pic ? Math.sin((s / pic) * Math.PI * 0.5) : Math.cos(((s - pic) / (1 - pic)) * Math.PI * 0.5);
      let wv = wid * 0.5 * Math.pow(ws, 0.8);
      const tooth = dent && s > 0.12 && s < 0.94 ? dent * wid * 0.09 * (k % 2 ? 1 : -0.6) : 0;
      M.push(T(s * len, mv));
      Lf.push(T(s * len, mv + wv * (1 + asym) + tooth));
      Rt.push(T(s * len, mv - wv * (1 - asym) - tooth));
    }
    const contour = () => {
      g.beginPath();
      g.moveTo(Lf[0][0], Lf[0][1]);
      for (let k = 1; k <= N; k++) g.lineTo(Lf[k][0], Lf[k][1]);
      for (let k = N; k >= 0; k--) g.lineTo(Rt[k][0], Rt[k][1]);
      g.closePath();
    };
    const demi = () => {
      g.beginPath();
      g.moveTo(M[0][0], M[0][1]);
      for (let k = 1; k <= N; k++) g.lineTo(M[k][0], M[k][1]);
      for (let k = N; k >= 0; k--) g.lineTo(Rt[k][0], Rt[k][1]);
      g.closePath();
    };
    const nerv = (lw) => {
      polyStroke(g, M.slice(0, N), lw);
      const nv = Math.max(2, Math.round(len / 3.2));
      for (let v = 1; v <= nv; v++) {
        const k = Math.round((v / (nv + 1)) * N * 0.9);
        const kk = Math.min(N, k + 2);
        g.beginPath();
        g.moveTo(M[k][0], M[k][1]);
        g.lineTo(lerp(M[kk][0], Lf[kk][0], 0.75), lerp(M[kk][1], Lf[kk][1], 0.75));
        g.moveTo(M[k][0], M[k][1]);
        g.lineTo(lerp(M[kk][0], Rt[kk][0], 0.75), lerp(M[kk][1], Rt[kk][1], 0.75));
        g.lineWidth = lw * 0.7;
        g.stroke();
      }
    };
    // hachures en plume : de la nervure vers le bord, inclinées vers la pointe
    const plume = (lw, a, pas) => {
      g.lineWidth = lw;
      g.strokeStyle = rgba(st.c, a);
      g.beginPath();
      const nh = Math.max(3, Math.round(len / pas));
      for (let q = 1; q < nh; q++) {
        const k = Math.round((q / nh) * N * 0.96);
        const k2 = Math.min(N, k + Math.max(1, Math.round(N * 0.08)));
        g.moveTo(M[k][0], M[k][1]);
        g.lineTo(lerp(M[k2][0], Lf[k2][0], 0.95), lerp(M[k2][1], Lf[k2][1], 0.95));
        g.moveTo(M[k][0], M[k][1]);
        g.lineTo(lerp(M[k2][0], Rt[k2][0], 0.95), lerp(M[k2][1], Rt[k2][1], 0.95));
      }
      g.stroke();
    };
    if (st.cl) {
      // polychrome : lavis puis trait
      g.fillStyle = rgba(st.cl, r.range(0.4, 0.55));
      contour(); g.fill();
      g.fillStyle = rgba(st.cl, 0.3);
      demi(); g.fill();
      g.strokeStyle = rgba(st.c, 0.75);
      g.lineWidth = 0.16;
      contour(); g.stroke();
      g.strokeStyle = rgba(st.c, 0.55);
      nerv(0.12);
      return;
    }
    const c = st.c;
    if (mode === 'plume') {
      g.fillStyle = rgba(c, 0.16);
      contour(); g.fill();
      g.strokeStyle = rgba(c, 0.95);
      polyStroke(g, M.slice(0, N), Math.max(0.1, wid * 0.06));
      plume(0.11, 0.9, 0.42);
      g.strokeStyle = rgba(c, 0.85);
      polyStroke(g, Lf, 0.12);
      g.fillStyle = rgba(c, 0.55);
      demi(); g.fill();
    } else if (mode === 'plein') {
      g.fillStyle = rgba(c, r.range(0.78, 0.92));
      contour(); g.fill();
      effacer(g, () => {
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        nerv(Math.max(0.12, wid * 0.07));
      });
    } else if (mode === 'demi') {
      g.fillStyle = rgba(c, 0.28);
      contour(); g.fill();
      g.fillStyle = rgba(c, 0.85);
      demi(); g.fill();
      g.strokeStyle = rgba(c, 0.9);
      g.lineWidth = 0.18;
      contour(); g.stroke();
    } else {
      g.fillStyle = rgba(c, 0.14);
      contour(); g.fill();
      g.strokeStyle = rgba(c, 0.9);
      g.lineWidth = 0.2;
      contour(); g.stroke();
      nerv(0.13);
    }
  }

  /** Rose vue de face. Mono : masse d'encre et volutes des pétales réservées en clair (gravure) ;
      polychrome (st.cf) : lavis rose, cœur plus soutenu, traits sépia. */
  function rose(g, st, x, y, rr, ang) {
    const r = st.r;
    const ph1 = r() * TAU, ph2 = r() * TAU;
    const n1 = r.int(5, 7);
    const sil = () => {
      g.beginPath();
      for (let k = 0; k <= 48; k++) {
        const t = (k / 48) * TAU;
        const rad = rr * (1 + 0.075 * Math.sin(n1 * t + ph1) + 0.04 * Math.sin((n1 + 3) * t + ph2));
        const px = x + Math.cos(t + ang) * rad, py = y + Math.sin(t + ang) * rad;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
    };
    // arcs de pétales : couronnes concentriques d'arcs décalés
    const arcs = (lw, fn) => {
      const rings = [
        [0.8, n1, 0.9],
        [0.58, n1 - 1, 0.95],
        [0.38, 4, 1.05],
      ];
      for (let q = 0; q < rings.length; q++) {
        const [rad, n, span] = rings[q];
        const off = r() * TAU;
        for (let k = 0; k < n; k++) {
          const a0 = ang + off + (k / n) * TAU;
          const sp = (TAU / n) * span * r.range(0.8, 1.05);
          const rk = rr * rad * r.range(0.92, 1.06);
          g.lineWidth = lw * (q === 0 ? 1 : 0.85);
          g.beginPath();
          // un arc de pétale légèrement ourlé (le bord se retourne)
          for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            const a = a0 + (t - 0.5) * sp;
            const bulge = 1 + 0.1 * Math.sin(Math.PI * t);
            const px = x + Math.cos(a) * rk * bulge, py = y + Math.sin(a) * rk * bulge;
            s ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          fn();
        }
      }
      // cœur : spirale
      g.lineWidth = lw * 0.8;
      g.beginPath();
      const turns = r.range(1.4, 2.1), a00 = r() * TAU;
      for (let s = 0; s <= 30; s++) {
        const t = s / 30;
        const a = a00 + t * turns * TAU;
        const rad = rr * (0.06 + 0.24 * t);
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        s ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      fn();
    };
    if (st.cf) {
      // polychrome
      g.fillStyle = rgba(st.cf, r.range(0.5, 0.62));
      sil(); g.fill();
      g.fillStyle = rgba(st.cf, 0.45);
      g.beginPath(); g.arc(x, y, rr * 0.55, 0, TAU); g.fill();
      g.fillStyle = rgba(st.c, 0.35);
      g.beginPath(); g.arc(x + rr * 0.05, y + rr * 0.08, rr * 0.22, 0, TAU); g.fill();
      g.strokeStyle = rgba(st.c, 0.8);
      arcs(Math.max(0.13, rr * 0.035), () => g.stroke());
      g.strokeStyle = rgba(st.c, 0.55);
      g.lineWidth = 0.14;
      sil(); g.stroke();
      // un petit reflet réservé (le haut à gauche des pétales)
      effacer(g, () => {
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = rr * 0.06;
        g.beginPath();
        g.arc(x, y, rr * 0.72, Math.PI * 1.05, Math.PI * 1.45);
        g.stroke();
      });
      return;
    }
    if (rr < 2.6 || st.roseMasse) {
      // petite rose : masse d'encre, volutes réservées
      g.fillStyle = rgba(st.c, r.range(0.84, 0.94));
      sil(); g.fill();
      effacer(g, () => {
        g.strokeStyle = 'rgba(0,0,0,0.92)';
        arcs(Math.max(0.12, rr * 0.055), () => g.stroke());
      });
      g.fillStyle = rgba(st.c, 0.6);
      g.beginPath(); g.arc(x + rr * 0.03, y + rr * 0.04, rr * 0.13, 0, TAU); g.fill();
      return;
    }
    // grande rose gravée : contours des pétales, hachures parallèles aux bords, cœur sombre
    g.fillStyle = rgba(st.c, 0.2);
    sil(); g.fill();
    const couronnes = [[1.0, 0.5, n1], [0.66, 0.3, n1 - 1], [0.42, 0.16, 4]];
    for (let q = 0; q < couronnes.length; q++) {
      const [ro, ri, n] = couronnes[q];
      const off = r() * TAU;
      for (let k = 0; k < n; k++) {
        const a0 = ang + off + (k / n) * TAU + r.range(-0.15, 0.15);
        const sp = (TAU / n) * r.range(0.95, 1.2);
        const rk = rr * ro * r.range(0.9, 1.03);
        // bord du pétale (ourlé)
        g.strokeStyle = rgba(st.c, 0.95);
        g.lineWidth = Math.max(0.12, rr * 0.035) * (q ? 0.9 : 1);
        g.beginPath();
        for (let s = 0; s <= 12; s++) {
          const t = s / 12, a = a0 + (t - 0.5) * sp;
          const rad = rk * (1 + 0.09 * Math.sin(Math.PI * t) - 0.05 * Math.sin(TAU * t));
          const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
          s ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
        // hachures : arcs de plus en plus courts vers la base du pétale
        g.strokeStyle = rgba(st.c, 0.8);
        g.lineWidth = Math.max(0.09, rr * 0.022);
        const nh = Math.max(2, Math.round(((ro - ri) * rr) / 0.45));
        g.beginPath();
        for (let hh = 1; hh <= nh; hh++) {
          const f = hh / (nh + 1);
          const rad = rk * (1 - f * (1 - ri / ro));
          const sp2 = sp * (0.35 + 0.45 * f) * r.range(0.8, 1.1);
          const ac = a0 + r.range(-0.1, 0.1) * sp;
          for (let s = 0; s <= 6; s++) {
            const a = ac + (s / 6 - 0.5) * sp2;
            const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
            s ? g.lineTo(px, py) : g.moveTo(px, py);
          }
        }
        g.stroke();
      }
    }
    // cœur
    g.fillStyle = rgba(st.c, 0.92);
    g.beginPath(); g.arc(x, y, rr * 0.2, 0, TAU); g.fill();
    effacer(g, () => {
      g.strokeStyle = 'rgba(0,0,0,0.9)';
      g.lineWidth = Math.max(0.09, rr * 0.03);
      g.beginPath();
      const a00 = r() * TAU;
      for (let s = 0; s <= 16; s++) {
        const t = s / 16, a = a00 + t * 1.6 * TAU, rad = rr * (0.03 + 0.14 * t);
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        s ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    });
  }

  /** Bouton de rose : goutte + sépales */
  function bouton(g, st, x, y, ang, len) {
    const r = st.r;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const T = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
    const w = len * r.range(0.36, 0.46);
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = (k / 16) * TAU;
      const u = len * (0.5 - 0.5 * Math.cos(t)) ;
      const v = Math.sin(t) * w * 0.5 * Math.pow(Math.sin(Math.PI * (0.5 - 0.5 * Math.cos(t))), 0.3) * (1 - 0.35 * (0.5 - 0.5 * Math.cos(t)));
      pts.push(T(u, v));
    }
    g.fillStyle = st.cf ? rgba(st.cf, 0.6) : rgba(st.c, 0.88);
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fill();
    if (st.cf) {
      g.strokeStyle = rgba(st.c, 0.75);
      g.lineWidth = 0.13;
      g.stroke();
    } else {
      effacer(g, () => {
        g.strokeStyle = 'rgba(0,0,0,0.9)';
        g.lineWidth = Math.max(0.1, len * 0.06);
        g.beginPath();
        const a = T(len * 0.3, -w * 0.12), b = T(len * 0.75, w * 0.05);
        g.moveTo(a[0], a[1]);
        g.quadraticCurveTo(...T(len * 0.55, w * 0.25), b[0], b[1]);
        g.stroke();
      });
    }
    // sépales
    const sf = { c: st.c, cl: st.cl, r, feuille: 'plein' };
    feuille(g, sf, x, y, ang + 0.45, len * 0.62, len * 0.16, 'plein');
    feuille(g, sf, x, y, ang - 0.4, len * 0.55, len * 0.15, 'plein');
  }

  /** Petite fleur à cinq pétales */
  function fleurette(g, st, x, y, rad, ang) {
    const r = st.r, n = 5;
    for (let k = 0; k < n; k++) {
      const a = ang + (k / n) * TAU + r.range(-0.12, 0.12);
      const cx = x + Math.cos(a) * rad * 0.55, cy = y + Math.sin(a) * rad * 0.55;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.scale(1, 0.68);
      g.beginPath();
      g.arc(0, 0, rad * 0.47, 0, TAU);
      g.restore();
      if (st.cf) {
        g.fillStyle = rgba(st.cb || st.cf, 0.55);
        g.fill();
        g.strokeStyle = rgba(st.c, 0.6);
        g.lineWidth = 0.1;
        g.stroke();
      } else {
        g.fillStyle = rgba(st.c, 0.62);
        g.fill();
        g.strokeStyle = rgba(st.c, 0.95);
        g.lineWidth = Math.max(0.09, rad * 0.08);
        g.stroke();
      }
    }
    g.fillStyle = st.cf ? rgba(st.c, 0.75) : rgba(st.c, 0.95);
    g.beginPath();
    g.arc(x, y, rad * 0.2, 0, TAU);
    g.fill();
  }

  /** Volute (C-scroll) : spirale effilée qui s'enroule en bout */
  function volute(g, st, x, y, size, ang, sens, lw) {
    const r = st.r;
    const P = [];
    const tours = r.range(1.05, 1.45);
    for (let k = 0; k <= 28; k++) {
      const t = k / 28;
      const a = ang + sens * t * tours * TAU;
      const rad = size * (1 - 0.82 * t);
      P.push([x + Math.cos(a) * rad - Math.cos(ang) * size, y + Math.sin(a) * rad - Math.sin(ang) * size]);
    }
    g.fillStyle = rgba(st.c, 0.9);
    trait(g, P, lw * 0.4, lw * 0.25, lw * 1.1);
    // petite boule au cœur
    const e = P[P.length - 1];
    g.beginPath();
    g.arc(e[0], e[1], lw * 0.55, 0, TAU);
    g.fill();
  }

  /** Fougère : tige courbe et folioles alternées qui décroissent */
  function fougere(g, st, x, y, ang, len, courbe) {
    const r = st.r;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const a = ang + courbe * t;
      pts.push(k === 0 ? [x, y] : [pts[k - 1][0] + Math.cos(a) * len / 5, pts[k - 1][1] + Math.sin(a) * len / 5]);
    }
    const P = crPts(pts, 5);
    g.fillStyle = rgba(st.c, 0.85);
    trait(g, P, 0.28, 0.08);
    const n = Math.max(4, Math.round(len / 1.6));
    const sf = { c: st.c, cl: st.cl, r, feuille: 'plein' };
    for (let k = 1; k < n; k++) {
      const s = k / n;
      const p = P[Math.min(P.length - 2, Math.round(s * (P.length - 1)))];
      const q = P[Math.min(P.length - 1, Math.round(s * (P.length - 1)) + 1)];
      const ta = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const side = k % 2 ? 1 : -1;
      const ll = len * 0.22 * (1 - s * 0.75);
      feuille(g, sf, p[0], p[1], ta + side * r.range(0.6, 0.9), ll, ll * 0.42, st.cl ? 'plein' : 'plein');
    }
  }

  /** Brindille : tige fine, petites feuilles et baies/boutons au bout */
  function brindille(g, st, x, y, ang, len) {
    const r = st.r;
    const pts = [[x, y]];
    let a = ang;
    for (let k = 1; k <= 4; k++) {
      a += r.range(-0.35, 0.35);
      pts.push([pts[k - 1][0] + Math.cos(a) * len / 4, pts[k - 1][1] + Math.sin(a) * len / 4]);
    }
    const P = crPts(pts, 5);
    g.fillStyle = rgba(st.c, 0.85);
    trait(g, P, 0.22, 0.07);
    const sf = { c: st.c, cl: st.cl, r, feuille: 'plein' };
    for (let k = 3; k < P.length - 2; k += 4) {
      const p = P[k], q = P[k + 1];
      const ta = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const side = (k >> 2) % 2 ? 1 : -1;
      feuille(g, sf, p[0], p[1], ta + side * r.range(0.5, 0.95), len * r.range(0.16, 0.24), len * 0.08);
    }
    const e = P[P.length - 1];
    if (r() < 0.55) bouton(g, st, e[0], e[1], a, len * 0.2);
    else {
      g.fillStyle = st.cf ? rgba(st.cf, 0.7) : rgba(st.c, 0.9);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(e[0] + r.range(-1, 1) * len * 0.06, e[1] + r.range(-1, 1) * len * 0.06, len * r.range(0.025, 0.04), 0, TAU);
        g.fill();
      }
    }
  }

  /**
   * Gerbe disposée sur un anneau (l'aile d'une assiette) : coordonnées polaires autour de (0, 0).
   * rho : rayon du milieu, th : angle du milieu, span : demi-ouverture (rad), large : demi-largeur radiale (mm)
   */
  function gerbe(g, st, rho, th, span, large, echelle = 1) {
    const r = st.r;
    const Pp = (rad, a) => [Math.cos(a) * rad, Math.sin(a) * rad];
    const tanA = (a, s) => a + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    // la tige principale : un arc ondulé le long de l'aile
    const nb = 7, tige = [];
    const rBase = rho + large * r.range(0.05, 0.35);
    for (let k = 0; k <= nb; k++) {
      const t = k / nb;
      const a = th + (t - 0.5) * 2 * span;
      tige.push(Pp(rBase + Math.sin(t * Math.PI * 2 + r() * 2) * large * 0.25, a));
    }
    const TP = crPts(tige, 6);
    g.fillStyle = rgba(st.ct || st.c, 0.85);
    trait(g, TP, 0.22 * echelle, 0.22 * echelle, 0.28 * echelle);
    const els = [];
    // petites feuilles alternées le long de la tige
    for (let q = 3; q < TP.length - 3; q += r.int(3, 5)) {
      const p = TP[q], p2 = TP[q + 1];
      const ta = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      const side = q % 2 ? 1 : -1;
      els.push(['feuille', p, large * r.range(0.35, 0.55), ta + side * r.range(0.5, 1.0)]);
    }
    // fleur principale
    const rr = large * r.range(0.62, 0.78);
    els.push(['rose', Pp(rho + r.range(-0.15, 0.15) * large, th + r.range(-0.12, 0.12) * span), rr]);
    // fleurs secondaires
    const nSec = r.int(1, 2);
    for (let k = 0; k < nSec; k++) {
      const s = k ? -1 : r.sign();
      const a = th + s * span * r.range(0.45, 0.62);
      els.push([r() < 0.6 ? 'rose' : 'fleurettes', Pp(rho + r.range(-0.4, 0.4) * large, a), rr * r.range(0.5, 0.68)]);
    }
    // boutons aux extrémités
    for (const s of [-1, 1]) {
      if (r() < 0.8) {
        const a = th + s * span * r.range(0.82, 1.02);
        const p = Pp(rho + r.range(-0.5, 0.5) * large, a);
        els.push(['bouton', p, rr * r.range(0.5, 0.7), tanA(a, s) + r.range(-0.5, 0.5)]);
      }
    }
    // feuilles le long de la tige et autour des fleurs
    const nF = Math.round(r.range(16, 24) * Math.min(1.3, echelle));
    for (let k = 0; k < nF; k++) {
      const t = r.range(-1, 1);
      const a = th + t * span * 0.98;
      const rad = rho + r.range(-1, 1) * large * 0.9;
      const p = Pp(rad, a);
      // orientée vers l'extérieur de la gerbe, un peu dans le sens de la tige
      const dir = Math.atan2(p[1] - Math.sin(th) * rho, p[0] - Math.cos(th) * rho) + r.range(-0.7, 0.7);
      els.push(['feuille', p, rr * r.range(0.6, 1.05), dir]);
    }
    // fougères / brindilles qui débordent
    const nB = r.int(2, 4);
    for (let k = 0; k < nB; k++) {
      const s = r.sign();
      const a = th + s * span * r.range(0.4, 0.95);
      const p = Pp(rho + r.range(-0.6, 0.6) * large, a);
      els.push([r() < 0.55 ? 'fougere' : 'brindille', p, large * r.range(0.9, 1.5), tanA(a, s) + r.range(-0.9, 0.9)]);
    }
    // ordre : feuilles et brindilles d'abord, fleurs par-dessus
    const ordre = { fougere: 0, brindille: 0, feuille: 1, bouton: 2, fleurettes: 3, rose: 4 };
    els.sort((a, b) => ordre[a[0]] - ordre[b[0]]);
    const sf = Object.assign({}, st, { c: st.cfeu || st.c, cl: st.cl });
    for (const e of els) {
      const [k, p, s, a] = e;
      if (k === 'rose') rose(g, st, p[0], p[1], s, r() * TAU);
      else if (k === 'fleurettes') {
        const n = r.int(2, 4);
        for (let i = 0; i < n; i++) fleurette(g, st, p[0] + r.range(-1, 1) * s * 0.6, p[1] + r.range(-1, 1) * s * 0.6, s * r.range(0.4, 0.55), r() * TAU);
      } else if (k === 'bouton') {
        g.fillStyle = rgba(st.ct || st.c, 0.8);
        trait(g, [[p[0] - Math.cos(a) * s * 0.9, p[1] - Math.sin(a) * s * 0.9], p], 0.16, 0.12);
        bouton(g, st, p[0], p[1], a, s);
      } else if (k === 'feuille') feuille(g, sf, p[0], p[1], a, s, s * r.range(0.34, 0.44), st.cl ? null : r() < 0.55 ? 'plume' : r() < 0.5 ? 'plein' : 'demi');
      else if (k === 'fougere') fougere(g, sf, p[0], p[1], a, s, r.range(-0.6, 0.6));
      else brindille(g, sf, p[0], p[1], a, s * 0.8);
    }
  }

  /** Petit bouquet lâche (centre des soucoupes, fond des tasses) : des tiges qui partent d'un nœud,
      une rose, des boutons, des feuilles le long des tiges — jamais en étoile */
  function bouquet(g, st, x, y, size, ang) {
    // une gerbe couchée en S : tige principale, rose au milieu, boutons aux bouts, rameaux latéraux
    const r = st.r;
    const sf = Object.assign({}, st, { c: st.cfeu || st.c });
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const T = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
    const L = size * 1.1, ond = size * r.range(0.08, 0.16) * r.sign();
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(T((t - 0.5) * L, Math.sin(t * TAU) * ond + r.range(-0.02, 0.02) * size));
    }
    const P = crPts(pts, 6);
    const at = (t) => P[Math.max(0, Math.min(P.length - 1, Math.round(t * (P.length - 1))))];
    const dirAt = (t) => {
      const a = at(t - 0.02), b = at(t + 0.02);
      return Math.atan2(b[1] - a[1], b[0] - a[0]);
    };
    g.fillStyle = rgba(st.ct || st.c, 0.85);
    trait(g, P, 0.3, 0.12, 0.1);
    // rameaux latéraux
    const nr = r.int(3, 4);
    const fins = [];
    for (let k = 0; k < nr; k++) {
      const t = 0.15 + (k / nr) * 0.7 + r.range(-0.05, 0.05);
      const p = at(t), a = dirAt(t) + (k % 2 ? 1 : -1) * r.range(0.6, 1.1);
      const l = size * r.range(0.3, 0.5);
      const q = [p, [p[0] + Math.cos(a) * l * 0.5, p[1] + Math.sin(a) * l * 0.5], [p[0] + Math.cos(a + 0.3) * l, p[1] + Math.sin(a + 0.3) * l]];
      const Q = crPts(q, 5);
      g.fillStyle = rgba(st.ct || st.c, 0.85);
      trait(g, Q, 0.2, 0.08);
      for (let s = 2; s < Q.length - 1; s += 3) {
        const pa = Q[s], pb = Q[s + 1];
        const ta = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        const lf = size * r.range(0.13, 0.2);
        feuille(g, sf, pa[0], pa[1], ta + r.sign() * r.range(0.5, 0.9), lf, lf * 0.4, st.cl ? null : r() < 0.6 ? 'plume' : 'plein');
      }
      fins.push([Q[Q.length - 1], a]);
    }
    // feuilles le long de la tige principale
    for (let t = 0.06; t < 0.95; t += r.range(0.07, 0.11)) {
      const p = at(t), a = dirAt(t) + r.sign() * r.range(0.5, 1.0);
      const lf = size * r.range(0.16, 0.26);
      feuille(g, sf, p[0], p[1], a, lf, lf * 0.42, st.cl ? null : r() < 0.55 ? 'plume' : r() < 0.5 ? 'plein' : 'demi');
    }
    // bouts des rameaux
    fins.forEach(([e, a], k) => {
      if (k % 2) bouton(g, st, e[0], e[1], a, size * r.range(0.13, 0.17));
      else for (let f = 0; f < 3; f++) fleurette(g, st, e[0] + r.range(-1, 1) * size * 0.06, e[1] + r.range(-1, 1) * size * 0.06, size * r.range(0.055, 0.075), r() * TAU);
    });
    // boutons aux deux bouts de la tige
    const e0 = at(0), e1 = at(1);
    bouton(g, st, e0[0], e0[1], dirAt(0.02) + Math.PI, size * 0.16);
    bouton(g, st, e1[0], e1[1], dirAt(0.98), size * 0.15);
    // les fleurs : une rose principale, une seconde plus petite
    const tm = r.range(0.4, 0.5), pm = at(tm), rr = size * r.range(0.2, 0.25);
    const t2 = tm + r.sign() * r.range(0.22, 0.28), p2 = at(t2);
    for (const [p, rad] of [[pm, rr], [p2, rr * 0.62]]) {
      const nf = r.int(3, 5), a0 = r() * TAU;
      for (let f = 0; f < nf; f++) {
        const aa = a0 + (f / nf) * TAU + r.range(-0.4, 0.4);
        const l = rad * r.range(1.1, 1.5);
        feuille(g, sf, p[0] + Math.cos(aa) * rad * 0.5, p[1] + Math.sin(aa) * rad * 0.5, aa, l, l * 0.42, st.cl ? null : r() < 0.55 ? 'plume' : 'plein');
      }
    }
    rose(g, st, p2[0], p2[1], rr * 0.62, r() * TAU);
    rose(g, st, pm[0], pm[1], rr, r() * TAU);
  }

  /** Remplissage vermiculé : des vers d'encre fins qui errent dans un anneau (rayon entre r0(θ) et r1(θ)) */
  function vermicule(g, st, bande, densite, lw, alpha) {
    const r = st.r;
    const { r0, r1, a0 = 0, a1 = TAU } = bande;
    const moy = (a) => 0.5 * (r0(a) + r1(a));
    const larg = (a) => 0.5 * (r1(a) - r0(a));
    const surf = ((a1 - a0) / TAU) * TAU * moy(0) * 2 * larg(0);
    const nVers = Math.round((surf * densite) / 14);
    g.strokeStyle = rgba(st.c, alpha);
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    for (let v = 0; v < nVers; v++) {
      let a = r.range(a0, a1), rad = moy(a) + r.range(-0.7, 0.7) * larg(a);
      let x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      let hd = r() * TAU, cv = 0;
      if (v && v % 60 === 0) {
        g.stroke(); // par paquets : un seul tracé pour soixante vers
        g.beginPath();
      }
      g.moveTo(x, y);
      const n = r.int(18, 46);
      for (let k = 0; k < n; k++) {
        cv += r.range(-0.55, 0.55);
        cv *= 0.8;
        hd += cv;
        // rester dans la bande : on revient vers le milieu
        const aa = fatan2(y, x), rr = Math.sqrt(x * x + y * y);
        const dn = (rr - moy(aa)) / larg(aa);
        if (dn > 0.75) hd += angleVers(hd, aa + Math.PI) * 0.5;
        else if (dn < -0.75) hd += angleVers(hd, aa) * 0.5;
        x += Math.cos(hd) * 0.42;
        y += Math.sin(hd) * 0.42;
        g.lineTo(x, y);
      }
    }
    g.stroke();
  }
  function angleVers(h, cible) {
    let d = (cible - h) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  /** Suit un bord (rayon e(θ)) à une distance « retrait » : polyligne fermée */
  function suitBord(edge, retrait, n = 720, a0 = 0, a1 = TAU) {
    const P = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      const rad = edge(a) - retrait;
      P.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    return P;
  }

  /* palettes d'encre (sRGB) */
  const ENCRES = {
    bleu: { c: [40, 64, 142], mono: true, bave: 0.3 },
    brun: { c: [142, 78, 40], mono: true, bave: 0.18 },
    rose: { c: [128, 72, 66], cf: [206, 128, 128], cb: [150, 164, 196], cl: [128, 156, 138], cfeu: [84, 110, 96], mono: false, bave: 0.12 },
  };
  const OR = [0.92, 0.66, 0.28]; // l'or (albédo linéaire du métal)

  /**
   * Décor d'une pièce plate (assiette, soucoupe) → { encre: canvas, or: canvas|null }
   * geo : { edge(θ), R, rw (bassin), rc (début de l'aile), type, lobes, phase, S (échelle) }
   */
  function decorPlat(fr, geo, motif, seed) {
    const ppm = fr.ppm;
    const cE = canvas(fr.w, fr.h, true), g = cE.__g;
    g.setTransform(ppm, 0, 0, ppm, -fr.bx0 * ppm, -fr.by0 * ppm);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let cO = null, go = null;
    const orIci = motif === 'rose' || motif === 'filet' || (motif === 'blanche' && geo.orBlanche);
    if (orIci) {
      cO = canvas(fr.w, fr.h, true);
      go = cO.__g;
      go.setTransform(ppm, 0, 0, ppm, -fr.bx0 * ppm, -fr.by0 * ppm);
      go.lineCap = 'round';
      go.lineJoin = 'round';
    }
    const r = AC.rng(seed ^ 0x5bd1e995);
    const S = geo.S, E = geo.edge;
    const soucoupe = geo.type === 'soucoupe';

    // --- l'or : liseré au bord (et filet intérieur)
    if (go) {
      go.strokeStyle = 'rgba(255,255,255,1)';
      const lw = motif === 'filet' ? r.range(1.2, 2.0) * S + 0.3 : r.range(1.0, 1.6) * S + 0.3;
      polyStroke(go, suitBord(E, lw * 0.5 + 0.35 * S), lw);
      if (motif === 'filet' || r() < 0.6) {
        go.lineWidth = r.range(0.35, 0.6) * S + 0.1;
        go.beginPath();
        const rin = soucoupe ? geo.rw + 1.2 * S : geo.rc + r.range(-0.5, 1.5) * S;
        go.arc(0, 0, rin, 0, TAU);
        go.stroke();
      }
      if (motif === 'filet' && r() < 0.5) {
        go.lineWidth = 0.35 * S;
        polyStroke(go, suitBord(E, lw + 1.6 * S), 0.35 * S + 0.1);
      }
    }
    if (motif === 'filet' || motif === 'blanche') return { encre: null, or: cO };

    const ink = ENCRES[motif] || ENCRES.bleu;
    const st = { c: ink.c, cf: ink.cf || null, cb: ink.cb || null, cl: ink.cl || null, cfeu: ink.cfeu || null, r, dent: 0.6 };

    // --- bande de bord (dentelle), sauf pour le motif rose qui a une guirlande légère
    const bIn = (motif === 'rose' ? 2.6 : 1.3) * S; // retrait du bord extérieur
    const bw = (soucoupe ? 7.0 : 9.0) * S * (motif === 'rose' ? 0.75 : 1);
    const nU = geo.lobes || (soucoupe ? 12 : 14);
    const ph = geo.lobes ? geo.phase : r() * TAU;
    if (ink.mono) {
      // filet de bord
      g.strokeStyle = rgba(st.c, 0.95);
      polyStroke(g, suitBord(E, 0.5 * S), 0.8 * S);
      // la « torsade » sur les nervures moulées : tirets serrés, inclinés
      const cordeIn = 1.35 * S, cordeW = 1.9 * S;
      const nT = Math.round((TAU * geo.R) / (0.75 * S));
      g.strokeStyle = rgba(st.c, 0.88);
      g.lineWidth = 0.32 * S;
      g.beginPath();
      for (let k = 0; k < nT; k++) {
        const a = (k / nT) * TAU + r.range(-0.002, 0.002);
        const e = E(a), l = cordeW * r.range(0.8, 1.05);
        const a2 = a + (0.55 * S) / e;
        g.moveTo(Math.cos(a) * (e - cordeIn), Math.sin(a) * (e - cordeIn));
        g.lineTo(Math.cos(a2) * (e - cordeIn - l), Math.sin(a2) * (e - cordeIn - l));
      }
      g.stroke();
      const b0 = cordeIn + cordeW + 0.5 * S; // la dentelle commence ici
      // fond vermiculé serré
      vermicule(g, st, { r0: (a) => E(a) - b0 - bw, r1: (a) => E(a) - b0 }, 2.6, 0.12 * S + 0.03, 0.62);
      // chaîne de petits motifs, rythmée par les festons
      const nC = Math.max(nU * 3, Math.round((TAU * (geo.R - b0 - bw * 0.5)) / (5.2 * S)));
      for (let k = 0; k < nC; k++) {
        const a = ph + ((k + 0.5) / nC) * TAU + r.range(-0.01, 0.01);
        const rad = E(a) - b0 - bw * r.range(0.4, 0.6);
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        const tg = a + Math.PI / 2;
        const genre = k % 3;
        if (genre === 0) {
          feuille(g, st, x, y, tg + r.range(-0.4, 0.4), bw * 0.5, bw * 0.2, 'plume');
          feuille(g, st, x, y, tg + Math.PI + r.range(-0.4, 0.4), bw * 0.44, bw * 0.18, 'plein');
          rose(g, st, x, y, bw * r.range(0.2, 0.25), r() * TAU);
        } else if (genre === 1) {
          for (let f = 0; f < 3; f++) feuille(g, st, x, y, a + Math.PI + r.range(-1.3, 1.3), bw * r.range(0.3, 0.42), bw * 0.14, r() < 0.5 ? 'plume' : 'plein');
          fleurette(g, st, x + Math.cos(a) * bw * 0.15, y + Math.sin(a) * bw * 0.15, bw * 0.16, r() * TAU);
        } else {
          volute(g, st, x, y, bw * 0.22, a + r.range(-0.5, 0.5), r.sign(), 0.26 * S);
          feuille(g, st, x, y, tg + r.range(-0.5, 0.5) + (r() < 0.5 ? Math.PI : 0), bw * 0.4, bw * 0.15, 'plume');
        }
      }
      // bord intérieur de la bande : petits festons et picots
      const nF = Math.round((TAU * (geo.R - b0 - bw)) / (2.4 * S));
      g.strokeStyle = rgba(st.c, 0.9);
      g.fillStyle = rgba(st.c, 0.9);
      g.lineWidth = 0.24 * S;
      for (let k = 0; k < nF; k++) {
        const a0 = (k / nF) * TAU, a1 = ((k + 1) / nF) * TAU, am = (a0 + a1) / 2;
        const r0 = E(a0) - b0 - bw, r1 = E(a1) - b0 - bw, rm = E(am) - b0 - bw - 0.9 * S;
        g.beginPath();
        g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        g.quadraticCurveTo(Math.cos(am) * rm, Math.sin(am) * rm, Math.cos(a1) * r1, Math.sin(a1) * r1);
        g.stroke();
        g.beginPath();
        g.moveTo(Math.cos(am) * (rm - 0.1 * S), Math.sin(am) * (rm - 0.1 * S));
        g.lineTo(Math.cos(am) * (rm - 1.0 * S), Math.sin(am) * (rm - 1.0 * S));
        g.stroke();
      }
      geo.bandeFin = b0 + bw + 1.2 * S;
    } else {
      // guirlande légère du motif rose : petites fleurs et feuilles le long du bord
      const nG = nU * 2;
      for (let k = 0; k < nG; k++) {
        const a = ph + ((k + 0.5) / nG) * TAU;
        const rad = E(a) - bIn - bw * 0.5;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        const tg = a + Math.PI / 2;
        const sf = Object.assign({}, st, { c: st.cfeu });
        feuille(g, sf, x, y, tg + r.range(-0.3, 0.3), bw * 0.55, bw * 0.2);
        feuille(g, sf, x, y, tg + Math.PI + r.range(-0.3, 0.3), bw * 0.45, bw * 0.18);
        if (k % 2) rose(g, st, x, y, bw * 0.28, r() * TAU);
        else fleurette(g, Object.assign({}, st, { cf: st.cb }), x, y, bw * 0.25, r() * TAU);
      }
    }

    // --- gerbes sur l'aile
    const aileIn = soucoupe ? geo.rw + 3 * S : geo.rc + 0.5 * S;
    const aileOut = geo.R - (geo.bandeFin || bIn + bw + 1.2 * S);
    const nG = soucoupe ? r.int(3, 4) : r.int(5, 6);
    const ph2 = r() * TAU;
    const large = (aileOut - aileIn) * 0.5;
    const rhoG = (aileOut + aileIn) * 0.5;
    for (let k = 0; k < nG; k++) {
      const th = ph2 + (k / nG) * TAU + r.range(-0.08, 0.08);
      const span = (TAU / nG) * r.range(0.36, 0.42);
      gerbe(g, st, rhoG, th, span, large * 0.92, S);
      // entre deux gerbes : des brindilles qui pendent de la bande
      const tb = th + (TAU / nG) * 0.5;
      for (let q = 0; q < 2; q++) {
        const tq = tb + r.range(-0.06, 0.06);
        const pb = [Math.cos(tq) * aileOut, Math.sin(tq) * aileOut];
        (q ? fougere : brindille)(g, st, pb[0], pb[1], tq + Math.PI + r.range(-0.6, 0.6), large * r.range(0.9, 1.5), r.range(-0.5, 0.5));
      }
    }
    // --- le bassin
    if (soucoupe) {
      // cerne du pied de tasse + petit bouquet au centre
      g.strokeStyle = rgba(st.c, 0.8);
      g.lineWidth = 0.35 * S;
      g.beginPath();
      g.arc(0, 0, geo.rw + 0.6 * S, 0, TAU);
      g.stroke();
      if (!geo.trou || geo.trou.r < geo.rw) bouquet(g, st, r.range(-1, 1) * S, r.range(-1, 1) * S, geo.rw * 0.95, r() * TAU);
    } else if (r() < 0.55) {
      // un bouquet lâche au centre
      bouquet(g, st, r.range(-3, 3) * S, r.range(-3, 3) * S, geo.rw * r.range(0.55, 0.7), r() * TAU);
    } else {
      // des brins qui plongent de l'aile dans le bassin
      for (let k = 0; k < 2; k++) {
        const a = r() * TAU;
        brindille(g, st, Math.cos(a) * geo.rc, Math.sin(a) * geo.rc, a + Math.PI + r.range(-0.5, 0.5), geo.rw * 0.5);
      }
    }
    return { encre: cE, or: cO };
  }

  /** Lit un canvas de décor → couverture (0..1) et couleur linéaire, avec bavure, marbrure, usure */
  function lireEncre(cE, fr, motif, seed) {
    const w = fr.w, h = fr.h, n = w * h;
    const d = cE.__g.getImageData(0, 0, w, h).data;
    const cov = tampon('encre.cov', n);
    const ink = ENCRES[motif] || ENCRES.bleu;
    const col = ink.mono ? null : tampon('encre.col', n * 3);
    const kb = ink.bave || 0;
    const w2 = (w + 1) >> 1, h2 = (h + 1) >> 1;
    const b = kb ? tampon('encre.bave', w2 * h2) : null;
    const L = LIN8;
    // passe 1 : couverture (et couleur), accumulation à demi-résolution pour la bavure
    for (let j = 0; j < h; j++) {
      const o = j * w, o2 = (j >> 1) * w2;
      for (let i = 0; i < w; i++) {
        const p = (o + i) * 4, a = d[p + 3];
        if (!a) continue;
        const v = a * (1 / 255);
        cov[o + i] = v;
        if (col) {
          const q = (o + i) * 3;
          col[q] = LN8[d[p]]; col[q + 1] = LN8[d[p + 1]]; col[q + 2] = LN8[d[p + 2]];
        }
        if (b) b[o2 + (i >> 1)] += v * 0.25;
      }
    }
    if (b) flou(b, w2, h2, (0.45 * fr.ppm) / 2);
    // passe 2 : bavure (le bleu « flow » qui file dans l'émail) et marbrure du report
    const T1 = tuile(1, 8, 4);
    const [ox, oy] = ofs(seed, 11);
    const k1 = 256 / 60, ip = 1 / fr.ppm;
    for (let j = 0; j < h; j++) {
      const y = (fr.by0 + (j + 0.5) * ip) * k1 + oy;
      const o = j * w, o2 = (j >> 1) * w2;
      for (let i = 0; i < w; i++) {
        let c = cov[o + i];
        if (b && (!col || c > 0)) {
          const bv = b[o2 + (i >> 1)] * kb;
          if (bv > 0.002) c += bv * (1 - c);
        }
        if (c <= 0) continue;
        const m = 0.9 + 0.2 * tx(T1, (fr.bx0 + (i + 0.5) * ip) * k1 + ox, y);
        c *= m;
        cov[o + i] = c > 1 ? 1 : c;
      }
    }
    return { cov, col };
  }

  /** Craquelures de l'émail (faïence ancienne) : un réseau de fissures très fines, teintées par le thé
      et le temps, dans le bassin ou sur toute la pièce. Une pièce sur trois n'en a pas. */
  function craquelures(fr, geo, seed) {
    const r = AC.rng(seed ^ 0x68e31da4);
    if (r() > 0.66) return null;
    const c = canvas(fr.w, fr.h, true), g = c.__g;
    g.setTransform(fr.ppm, 0, 0, fr.ppm, -fr.bx0 * fr.ppm, -fr.by0 * fr.ppm);
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 0.08 + 0.3 / fr.ppm;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const zone = r() < 0.55 ? geo.rw * 1.05 : geo.R * 0.9; // souvent seulement le bassin, où l'on coupe
    const n = Math.round((zone * zone) / r.range(22, 40));
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = zone * Math.sqrt(r());
      let x = Math.cos(a) * d, y = Math.sin(a) * d, h = r() * TAU;
      g.moveTo(x, y);
      const L = r.range(4, 16);
      for (let s = 0; s < L; s += 0.7) {
        h += r.range(-0.45, 0.45);
        x += Math.cos(h) * 0.7;
        y += Math.sin(h) * 0.7;
        if (x * x + y * y > zone * zone) break;
        g.lineTo(x, y);
      }
    }
    g.stroke();
    return g.getImageData(0, 0, fr.w, fr.h).data;
  }

  /* ======================================================================
     5. Faïence : assiettes et soucoupes
     ====================================================================== */
  const EMAIL = { assiette: '#F3ECDD', soucoupe: '#F5EFE3' };

  function geoPlat(type, o) {
    const r = AC.rng(o.seed ^ 0x2c1b3c6d);
    const Rr = o.d / 2;
    const soucoupe = type === 'soucoupe';
    const S = o.d / (soucoupe ? 140 : 200);
    const lobes = o.chantourne ? (soucoupe ? r.pick([12, 14, 16]) : r.pick([10, 12, 12, 14])) : 0;
    const prof = Rr * (soucoupe ? r.range(0.018, 0.024) : r.range(0.02, 0.028));
    const phase = r() * TAU;
    const dbl = r() < 0.5; // festons doubles (accolades)
    const N = 1024;
    const tab = new Float32Array(N + 1);
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * TAU;
      if (!lobes) { tab[k] = Rr; continue; }
      let f = (((a - phase) / TAU) * lobes) % 1;
      if (f < 0) f += 1;
      const gq = Math.abs(f - 0.5) * 2; // 0 au milieu du lobe, 1 au creux
      let s = Math.pow(gq, 2.3);
      if (dbl) s += 0.3 * Math.exp(-Math.pow((gq - 0.62) / 0.09, 2));
      tab[k] = Rr - prof * s;
    }
    const edge = (a) => {
      let t = (a / TAU) % 1;
      if (t < 0) t += 1;
      const x = t * N, i = x | 0, f = x - i;
      return tab[i] + (tab[i + 1] - tab[i]) * f;
    };
    return {
      type, R: Rr, S, lobes, phase, prof, edge, tab, N,
      rw: soucoupe ? Rr * 0.34 : Rr * r.range(0.54, 0.58),
      rc: soucoupe ? Rr * 0.4 : Rr * r.range(0.64, 0.67),
      filetMoule: !soucoupe && r() < 0.5,
      creux: !!lobes && r() < 0.8,
      orBlanche: false,
    };
  }

  /* Profil d'une pièce plate, séparé en deux : la partie radiale (bassin, chute, aile : dépend de la
     distance au centre) et la partie « bord » (bourrelet, arrondi, nervures : dépend de la distance
     au bord festonné). Les deux sont mises en tables pour aller vite. */
  function hRad(geo, rr) {
    const S = geo.S, Rr = geo.R;
    if (geo.type === 'soucoupe') {
      const rw = geo.rw;
      if (rr < rw) return 2.8 * S + 0.25 * S * (rr / rw) * (rr / rw);
      const t = Math.min(1.2, (rr - rw) / (Rr - rw));
      const dip = (rr - rw - 1.2 * S) / (0.9 * S);
      return 3.05 * S + 9.2 * S * Math.pow(t, 1.55) - 0.55 * S * Math.exp(-dip * dip);
    }
    const rw = geo.rw, rc = geo.rc;
    if (rr <= rw) return 2.6 * S + 0.35 * S * (rr / rw) * (rr / rw);
    if (rr <= rc) {
      const t = (rr - rw) / (rc - rw);
      return 2.95 * S + 5.6 * S * (t * t * (3 - 2 * t));
    }
    const v = Math.min(1.2, (rr - rc) / (Rr - rc));
    let h = 8.55 * S + 2.3 * S * v + 0.5 * S * v * v;
    if (geo.filetMoule) {
      const f = (rr - rc - 2.2 * S) / (0.6 * S);
      h += 0.28 * S * Math.exp(-f * f);
    }
    return h;
  }
  function hBord(geo, u) {
    const S = geo.S;
    let h = 0;
    if (geo.type === 'soucoupe') {
      if (u < 2.4 * S) {
        const k = Math.max(-1, u / (2.4 * S)), a = (k - 0.55) / 0.3;
        h += 0.55 * S * Math.exp(-a * a) - 1.9 * S * Math.pow(1 - k, 2.4);
      }
      return h;
    }
    if (u < 3 * S) {
      const k = Math.max(-1, u / (3 * S)), a = (k - 0.62) / 0.25;
      h += 0.75 * S * Math.exp(-a * a) - 2.1 * S * Math.pow(1 - k, 2.6);
    }
    if (geo.lobes && u < 6 * S) {
      const a1 = (u - 3.4 * S) / (0.45 * S), a2 = (u - 4.9 * S) / (0.4 * S);
      h += 0.17 * S * Math.exp(-a1 * a1) + 0.12 * S * Math.exp(-a2 * a2);
    }
    return h;
  }
  function tablesPlat(geo) {
    if (geo.tabR) return geo;
    const nR = Math.ceil((geo.R + 3) * 20) + 2;
    geo.tabR = new Float32Array(nR);
    for (let k = 0; k < nR; k++) geo.tabR[k] = hRad(geo, k / 20);
    // bord : u de -2 à 6·S mm, pas de 0,01 mm
    geo.u0 = -2;
    const nU = Math.ceil((6 * geo.S + 2) * 100) + 2;
    geo.tabU = new Float32Array(nU);
    for (let k = 0; k < nU; k++) geo.tabU[k] = hBord(geo, geo.u0 + k / 100);
    return geo;
  }
  /** Hauteur (mm) du dessus d'une pièce plate (requête ponctuelle) */
  function hauteurPlat(geo, rr, e, dN = 99) {
    tablesPlat(geo);
    return lutR(geo, rr) + lutU(geo, e - rr) + pli(geo, rr, dN);
  }
  function lutR(geo, rr) {
    const x = rr * 20, i = x | 0, T = geo.tabR;
    if (i >= T.length - 1) return T[T.length - 1];
    return T[i] + (T[i + 1] - T[i]) * (x - i);
  }
  function lutU(geo, u) {
    if (u >= 6 * geo.S) return 0;
    const x = (u - geo.u0) * 100;
    if (x <= 0) return geo.tabU[0] + (u - geo.u0) * 1.5;
    const i = x | 0, T = geo.tabU;
    return T[i] + (T[i + 1] - T[i]) * (x - i);
  }
  // creux moulé qui part de chaque échancrure du feston
  function pli(geo, rr, dN) {
    if (!geo.creux || dN > 4.5 * geo.S || rr < geo.rc) return 0;
    const v = (rr - geo.rc) / (geo.R - geo.rc), q = dN / (2.0 * geo.S);
    return -0.22 * geo.S * Math.exp(-q * q) * sstep(0.45, 0.97, v);
  }

  /* normales rapides (même convention qu'AC.R.normals, sans Math.hypot) */
  function normales(Hf, w, h, k, nom = 'N') {
    const n = w * h, nx = tampon(nom + 'x', n, Float32Array, false), ny = tampon(nom + 'y', n, Float32Array, false), nz = tampon(nom + 'z', n, Float32Array, false);
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y, ky = k / (y1 - y0 || 1);
      const r0 = y0 * w, r1 = y1 * w, rw = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
        const dx = (Hf[rw + x1] - Hf[rw + x0]) * (k / (x1 - x0 || 1));
        const dy = (Hf[r1 + x] - Hf[r0 + x]) * ky;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = rw + x;
        nx[i] = -dx * il;
        ny[i] = -dy * il;
        nz[i] = il;
      }
    }
    return { nx, ny, nz };
  }

  /* flou gaussien approché (trois boîtes), en place, sans fermeture : rapide sur les grands tableaux */
  function flou(a, w, h, sigma) {
    if (sigma < 0.35) return a;
    const wI = Math.sqrt((12 * sigma * sigma) / 3 + 1);
    let wl = Math.floor(wI);
    if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    const t = tampon('flou', a.length, Float32Array, false);
    for (let p = 0; p < 3; p++) {
      const r = Math.max(0, Math.round(((p < m ? wl : wl + 2) - 1) / 2));
      if (!r) continue;
      boite(a, t, w, h, r, 1, w);
      boite(t, a, h, w, r, w, 1);
    }
    return a;
  }
  // une passe de boîte le long des lignes (pas = 1, saut = w) ou des colonnes (pas = w, saut = 1)
  function boite(src, dst, n1, n2, r, pas, saut) {
    const iv = 1 / (r + r + 1);
    for (let l = 0; l < n2; l++) {
      const o = l * saut;
      const first = src[o], last = src[o + (n1 - 1) * pas];
      let acc = (r + 1) * first;
      for (let p = 1; p <= r; p++) acc += p < n1 ? src[o + p * pas] : last;
      for (let x = 0; x < n1; x++) {
        dst[o + x * pas] = acc * iv;
        const pa = x + r + 1, pr = x - r;
        acc += (pa < n1 ? src[o + pa * pas] : last) - (pr > 0 ? src[o + pr * pas] : first);
      }
    }
  }

  function faience(type, o, ppm) {
    const t0 = performance.now(), tm = {};
    const geo = tablesPlat(geoPlat(type, o));
    const Rr = geo.R, S = geo.S;
    const haut = type === 'soucoupe' ? 13 * S : 16 * S;
    const fr = cadre(ppm, -Rr - 1, -Rr - 1, Rr + 1, Rr + 1, haut, 0.8);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    const Hf = tampon('f.H', n), alpha = tampon('f.a', n);
    const rA = tampon('f.r', n, Float32Array, false), uA = tampon('f.u', n, Float32Array, false), nA = tampon('f.n', n, Float32Array, false);
    const rn = AC.rng(o.seed ^ 0x7f4a7c15);
    // relief : ondulations de fabrication (une seule lecture de bruit, 4 octaves de 110 à 14 mm)
    const Tw = tuile(2, 4, 2, 0.3);
    const [wx, wy] = ofs(o.seed, 3);
    const kw = 256 / 110;
    const lob = geo.lobes, lk = lob / TAU, TAB = geo.tab, NT = geo.N, kT = NT / TAU;
    const Rlim = Rr + 2 * ip + 0.6;
    const trI = o.trou ? o.trou.r - 4 * ip : 0;
    for (let j = 0; j < h; j++) {
      const y = fr.by0 + (j + 0.5) * ip;
      if (y > Rlim || y < -Rlim) continue;
      const xs = Math.sqrt(Rlim * Rlim - y * y);
      const i0 = Math.max(0, Math.floor((-xs - fr.bx0) * ppm - 1)), i1 = Math.min(w - 1, Math.ceil((xs - fr.bx0) * ppm + 1));
      let h0 = 1, h1 = 0; // le trou (sous la tasse) sur cette ligne
      if (trI > 0) {
        const dy = y - o.trou.y;
        if (dy * dy < trI * trI) {
          const dx = Math.sqrt(trI * trI - dy * dy);
          h0 = Math.ceil((o.trou.x - dx - fr.bx0) * ppm - 0.5);
          h1 = Math.floor((o.trou.x + dx - fr.bx0) * ppm - 0.5);
        }
      }
      for (let i = i0; i <= i1; i++) {
        if (i >= h0 && i <= h1) { i = h1; continue; }
        const x = fr.bx0 + (i + 0.5) * ip;
        const id = j * w + i;
        const rr = Math.sqrt(x * x + y * y);
        const a = lob ? fatan2(y, x) : 0;
        let e = Rr;
        if (lob) {
          let t = a * kT;
          if (t < 0) t += NT;
          const ti = t >= NT ? NT - 1 : t | 0;
          e = TAB[ti] + (TAB[ti + 1] - TAB[ti]) * (t - ti);
        }
        const u = e - rr;
        const al = u * ppm + 0.5;
        alpha[id] = al < 0 ? 0 : al > 1 ? 1 : al;
        let hv = lutR(geo, rr < e ? rr : e) + lutU(geo, u);
        if (lob && rr > geo.rc) {
          let f = (a - geo.phase) * lk;
          f -= Math.floor(f);
          hv += pli(geo, rr, (f < 0.5 ? f : 1 - f) * (TAU / lob) * rr);
        }
        const nw = tx(Tw, x * kw + wx, y * kw + wy);
        Hf[id] = hv + 0.2 * S * nw;
        rA[id] = rr;
        uA[id] = u;
        nA[id] = nw;
      }
    }
    const N = normales(Hf, w, h, ppm);
    let alphaR = alpha;
    if (o.trou) {
      // sous la tasse : rien à éclairer (l'ombre de la soucoupe garde toute sa silhouette)
      alphaR = tampon('f.aR', n, Float32Array, false);
      alphaR.set(alpha);
      const tr = o.trou, r2 = Math.pow(tr.r - 1.5 * ip, 2);
      for (let j = 0; j < h; j++) {
        const dy = fr.by0 + (j + 0.5) * ip - tr.y;
        if (dy * dy >= r2) continue;
        const dx = Math.sqrt(r2 - dy * dy);
        const i0 = Math.max(0, Math.ceil((tr.x - dx - fr.bx0) * ppm - 0.5)), i1 = Math.min(w - 1, Math.floor((tr.x + dx - fr.bx0) * ppm - 0.5));
        if (i1 >= i0) alphaR.fill(0, j * w + i0, j * w + i1 + 1);
      }
    }
    tm.relief = performance.now() - t0;
    // décor
    geo.trou = o.trou || null;
    const dec = decorPlat(fr, geo, o.motif, o.seed);
    tm.dessin = performance.now() - t0 - tm.relief;
    const encre = dec.encre ? lireEncre(dec.encre, fr, o.motif, o.seed) : null;
    const orD = dec.or ? dec.or.__g.getImageData(0, 0, w, h).data : null;
    const crq = type === 'assiette' ? craquelures(fr, geo, o.seed) : null;
    tm.encre = performance.now() - t0 - tm.relief - tm.dessin;
    // matière
    const alb = tampon('f.alb', n * 3, Float32Array, false), rough = tampon('f.rg', n, Float32Array, false);
    const met = tampon('f.met', n), ao = tampon('f.ao', n, Float32Array, false);
    const base = hexLin(EMAIL[type] || EMAIL.assiette);
    const bord = hexLin('#E6D6BA');
    const inkM = ENCRES[o.motif];
    const lnMono = inkM && inkM.mono ? inkM.c.map((v, c) => Math.log(Math.min(1, Math.pow(v / 255, 2.2) / base[c]))) : null;
    const lnBase = base.map(Math.log);
    const Tu = tuile(3, 16, 2);
    const [ux, uy] = ofs(o.seed, 6);
    const ku = 256 / 30;
    const t0c = 1 + rn.range(-0.012, 0.012), t1c = 1 + rn.range(-0.01, 0.01), t2c = 1 + rn.range(-0.03, 0.0);
    const soucoupe = type === 'soucoupe';
    const rwA = geo.rw, aoW = soucoupe ? 2 * S : 3 * S, aoC = soucoupe ? geo.rw + 0.5 * S : geo.rw, aoK = soucoupe ? 0.08 : 0.1;
    const cov = encre ? encre.cov : null, col = encre ? encre.col : null;
    for (let j = 0; j < h; j++) {
      const y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const id = j * w + i;
        if (alphaR[id] <= 0) continue;
        const rr = rA[id], u = uA[id], nz = nA[id];
        // émail : blanc cassé, un peu plus jaune au bord (émail mince), traces d'usage dans le bassin
        let c0 = base[0] * (t0c + 0.03 * nz), c1 = base[1] * (t1c + 0.03 * nz), c2 = base[2] * (t2c + 0.036 * nz);
        if (u < 1.6 * S) {
          const tb = sstep(1.6 * S, 0.2 * S, u) * 0.6;
          c0 += (bord[0] - c0) * tb; c1 += (bord[1] - c1) * tb; c2 += (bord[2] - c2) * tb;
        }
        let rg = 0.035;
        if (rr < rwA) {
          const x = fr.bx0 + (i + 0.5) * ip;
          const tu = tx(Tu, x * ku + ux, y * ku + uy) * 1.5;
          const us = tu > 0 ? 0.02 * (tu > 1 ? 1 : tu) : 0;
          c0 *= 1 - us; c1 *= 1 - us; c2 *= 1 - us * 1.3;
          rg += us * 3;
        }
        // encre (sous l'émail) : mélange soustractif, l'encre filtre la lumière
        if (cov) {
          const cv = cov[id];
          if (cv > 0) {
            if (lnMono) {
              c0 *= Math.exp(cv * lnMono[0]);
              c1 *= Math.exp(cv * lnMono[1]);
              c2 *= Math.exp(cv * lnMono[2]);
            } else {
              const k3 = id * 3;
              c0 *= Math.exp(cv * Math.min(0, col[k3] - lnBase[0]));
              c1 *= Math.exp(cv * Math.min(0, col[k3 + 1] - lnBase[1]));
              c2 *= Math.exp(cv * Math.min(0, col[k3 + 2] - lnBase[2]));
            }
          }
        }
        if (crq) {
          const a = crq[id * 4 + 3];
          if (a) {
            const kc = (a / 255) * 0.09;
            c0 *= 1 - kc * 0.75; c1 *= 1 - kc; c2 *= 1 - kc * 1.35; // un fil de thé brun-gris
          }
        }
        let m = 0;
        if (orD) {
          const og = orD[id * 4 + 3];
          if (og > 0) {
            // l'or s'use : lacunes sur l'arête
            const x = fr.bx0 + (i + 0.5) * ip;
            const usure = clamp01(0.75 + 1.1 * tx(Tw, x * 6.5 + uy, y * 6.5 + ux) + (u < 1.0 * S ? -0.15 : 0.25));
            m = (og / 255) * usure * 0.88;
            c0 += (OR[0] - c0) * m; c1 += (OR[1] - c1) * m; c2 += (OR[2] - c2) * m;
            rg += (0.24 - rg) * m;
          }
        }
        met[id] = m;
        alb[id * 3] = c0; alb[id * 3 + 1] = c1; alb[id * 3 + 2] = c2;
        rough[id] = rg;
        // occlusion douce au pied de la chute
        const q = (rr - aoC) / aoW;
        ao[id] = q > -3 && q < 3 ? 1 - aoK * Math.exp(-q * q) : 1;
      }
    }
    tm.matiere = performance.now() - t0 - tm.relief - tm.dessin - tm.encre;
    const img = eclairer({ img: imageData(w, h, 'f'), w, h, alb, alpha: alphaR, nx: N.nx, ny: N.ny, nz: N.nz, ao, f0: 0.045, rough, met, sol: o.sol ? hexLin(o.sol) : null });
    tm.lumiere = performance.now() - t0 - tm.relief - tm.dessin - tm.encre - tm.matiere;
    const spr = sprite(fr, img, alpha, { height: haut, soft: 0.8, opacity: 0.4, contact: 0.3 }, {
      d: o.d, R: Rr, geo, haut, // pour poser dessus
      puits: { r: geo.rw, z: hauteurPlat(geo, 0, Rr) }, // le creux central (mm)
    });
    tm.ombre = performance.now() - t0 - tm.relief - tm.dessin - tm.encre - tm.matiere - tm.lumiere;
    spr.t = tm;
    return spr;
  }

  /* ======================================================================
     6. Le tour du potier : solides de révolution en projection oblique.
        Écran (x, y) = (x, y − t·z) : ce qui est haut remonte vers le haut de l'image,
        et l'on voit la paroi extérieure du côté du spectateur (en bas).
        On empile des tranches horizontales (anneaux) du bas vers le haut :
        la dernière tranche qui couvre un pixel est la surface vue (z-buffer).
     ====================================================================== */

  /* interpolation cubique monotone (Fritsch-Carlson) de points [x, y] triés en x */
  function monotone(P) {
    const n = P.length, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        m[i] = k * a * d[i];
        m[i + 1] = k * b * d[i];
      }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const hh = xs[i + 1] - xs[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
    };
  }

  /**
   * Profil d'une pièce tournée → tables par tranche de hauteur dz :
   *   Ro, Ri (rayons extérieur / intérieur ; Ri = 0 : tranche pleine), dRo, dRi (pentes dρ/dz).
   * spec : { H, ext: [[z, ρ]…] profil extérieur, ep: [[z, e]…] épaisseur, zf: fond intérieur, rf: congé du fond }
   * La lèvre est un demi-cercle posé sur la paroi (bord épais arrondi).
   */
  function profil(spec) {
    const H = spec.H;
    const fo = monotone(spec.ext);
    const fe = typeof spec.ep === 'number' ? () => spec.ep : monotone(spec.ep);
    const zf = spec.zf, rf = spec.rf || 5;
    const lr0 = fe(H) * 0.5;
    const zc = H - lr0;
    const roC = fo(zc), riC = roC - fe(zc), rm = (roC + riC) / 2, lrr = (roC - riC) / 2;
    const riW = (z) => fo(z) - fe(z);
    const zr = zf + rf;
    // tranches : grossières dans le pied (caché), moyennes sur la paroi, fines dans la lèvre
    const dzP = spec.dzP || 0.9, dzM = spec.dzM || 0.4, dzL = spec.dzL || 0.07;
    const zs = [];
    for (let z = 0; z < zf - 0.3; z += dzP) zs.push(z);
    for (let z = zf - 0.3; z < zc - 0.5; z += dzM) zs.push(z);
    for (let z = zc - 0.5; z < H; z += dzL) zs.push(z);
    zs.push(H - 0.005);
    const K = zs.length;
    const Z = Float32Array.from(zs);
    const Ro = new Float32Array(K), Ri = new Float32Array(K), dRo = new Float32Array(K), dRi = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      const z = Z[k];
      let ro, ri;
      if (z > zc) {
        const q = z - zc, s = Math.sqrt(Math.max(0, lrr * lrr - q * q));
        ro = rm + s;
        ri = rm - s;
        if (s < 0.02) { ro = rm + 0.02; ri = rm - 0.02; }
      } else {
        ro = fo(z);
        if (z < zf) ri = 0;
        else if (z < zr) {
          const q = zr - z;
          ri = riW(z) - rf + Math.sqrt(Math.max(0, rf * rf - q * q));
        } else ri = riW(z);
      }
      Ro[k] = ro;
      Ri[k] = ri > 0 ? ri : 0;
    }
    // pentes analytiques (différences centrées fines sur les fonctions, pas sur les tables)
    const e = 0.05;
    const riF = (z) => (z < zf ? 0 : z < zr ? riW(z) - rf + Math.sqrt(Math.max(0, rf * rf - (zr - z) * (zr - z))) : riW(z));
    for (let k = 0; k < K; k++) {
      const z = Z[k];
      if (z > zc) { dRo[k] = 0; dRi[k] = 0; continue; }
      dRo[k] = (fo(Math.min(zc, z + e)) - fo(Math.max(0, z - e))) / (Math.min(zc, z + e) - Math.max(0, z - e));
      dRi[k] = z < zf ? 0 : (riF(Math.min(zc, z + e)) - riF(Math.max(zf, z - e))) / (Math.min(zc, z + e) - Math.max(zf, z - e));
    }
    let rmax = 0;
    for (let k = 0; k < K; k++) if (Ro[k] > rmax) rmax = Ro[k];
    return { H, K, Z, Ro, Ri, dRo, dRi, zc, rm, lr: lrr, zf, fo, fe, riW, riF, rmax };
  }

  /**
   * Rastérise un profil (tranches) dans un z-buffer. Axe en (cx, cy) mm, base à z0.
   * zb : Float32 (−1e9 = vide), kb : Int32 (index de tranche), part : Uint8 (id de la pièce)
   * Renvoie les étendues de silhouette par ligne (X) et par colonne (Yh, Yb) pour l'anticrénelage.
   */
  function tourner(prof, fr, t, bufs, opts = {}) {
    const { K, Z, Ro, Ri } = prof;
    const ppm = fr.ppm, ip = 1 / ppm, w = fr.w, h = fr.h;
    const { zb, kb, part } = bufs;
    const z0 = opts.z0 || 0, cx0 = opts.cx || 0, cy0 = opts.cy || 0, id0 = opts.id || 1;
    const dil = 0.8 * ip; // un pixel de plus au bord extérieur (couleur des pixels de bord)
    const X = new Float32Array(h).fill(-1);
    const bx = fr.bx0 - cx0;
    for (let k = 0; k < K; k++) {
      const ro = Ro[k], ri = Ri[k];
      if (ro <= 0) continue;
      const z = z0 + Z[k];
      const cy = cy0 - t * z;
      const roD = ro + dil, ro2 = ro * ro, roD2 = roD * roD, ri2 = ri * ri;
      const j0 = Math.max(0, Math.floor((cy - roD - fr.by0) * ppm)), j1 = Math.min(h - 1, Math.ceil((cy + roD - fr.by0) * ppm));
      for (let j = j0; j <= j1; j++) {
        const dy = fr.by0 + (j + 0.5) * ip - cy;
        const dy2 = dy * dy;
        if (dy2 >= roD2) continue;
        if (dy2 < ro2) {
          const xe = Math.sqrt(ro2 - dy2);
          if (xe > X[j]) X[j] = xe;
        }
        const xo = Math.sqrt(roD2 - dy2);
        const ia = Math.max(0, Math.ceil((-xo - bx) * ppm - 0.5)), ib = Math.min(w - 1, Math.floor((xo - bx) * ppm - 0.5));
        const row = j * w;
        if (ri2 > dy2) {
          const xi = Math.sqrt(ri2 - dy2);
          const ic = Math.min(ib, Math.floor((-xi - bx) * ppm - 0.5)), id = Math.max(ia, Math.ceil((xi - bx) * ppm - 0.5));
          for (let i = ia; i <= ic; i++) { zb[row + i] = z; kb[row + i] = k; part[row + i] = id0; }
          for (let i = id; i <= ib; i++) { zb[row + i] = z; kb[row + i] = k; part[row + i] = id0; }
        } else {
          for (let i = ia; i <= ib; i++) { zb[row + i] = z; kb[row + i] = k; part[row + i] = id0; }
        }
      }
    }
    // étendues verticales par colonne, tirées des étendues horizontales (interpolées entre lignes)
    const Yh = new Float32Array(w).fill(1e9), Yb = new Float32Array(w).fill(-1e9);
    let jt = 0, jb = h - 1;
    while (jt < h && X[jt] < 0) jt++;
    while (jb >= 0 && X[jb] < 0) jb--;
    for (let i = 0; i < w; i++) {
      const x = fr.bx0 + (i + 0.5) * ip - cx0, ax = x < 0 ? -x : x;
      let j = jt;
      while (j <= jb && X[j] < ax) j++;
      if (j > jb) continue;
      const yj = fr.by0 + (j + 0.5) * ip;
      const Xp = j > 0 && X[j - 1] >= 0 ? X[j - 1] : 0;
      Yh[i] = yj - ip * clamp01((X[j] - ax) / Math.max(1e-6, X[j] - Xp));
      let q = jb;
      while (q >= j && X[q] < ax) q--;
      const yq = fr.by0 + (q + 0.5) * ip;
      const Xn = q < h - 1 && X[q + 1] >= 0 ? X[q + 1] : 0;
      Yb[i] = yq + ip * clamp01((X[q] - ax) / Math.max(1e-6, X[q] - Xn));
    }
    return { X, Yh, Yb, cx: cx0 };
  }

  /** Couverture (alpha) de la silhouette d'un solide tourné, d'après ses étendues */
  function alphaTour(sil, fr, alpha) {
    const ppm = fr.ppm, ip = 1 / ppm, w = fr.w, h = fr.h;
    for (let j = 0; j < h; j++) {
      const Xj = sil.X[j];
      if (Xj < 0) continue;
      const y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const x = fr.bx0 + (i + 0.5) * ip - sil.cx;
        let sd = Xj - (x < 0 ? -x : x);
        if (sd < -ip) continue;
        const a1 = y - sil.Yh[i], a2 = sil.Yb[i] - y;
        if (a1 < sd) sd = a1;
        if (a2 < sd) sd = a2;
        const a = sd * ppm + 0.5;
        if (a > 0) {
          const id = j * w + i;
          const v = a > 1 ? 1 : a;
          if (v > alpha[id]) alpha[id] = v;
        }
      }
    }
  }

  /**
   * Tube le long d'une courbe 3D (anse, bec) : union de sphères, z-buffer et couverture.
   * pts : [[x, y, z, r]…] (mm, repère objet, r = rayon du tube)
   */
  function tube(pts, fr, t, bufs, idPart, sInfo) {
    const ppm = fr.ppm, ip = 1 / ppm, w = fr.w, h = fr.h;
    const { zb, kb, part, alpha } = bufs;
    const A = 1 + t * t;
    // rééchantillonnage serré (pas ≈ 0,3·r)
    const S = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.max(1, Math.ceil(l / (0.3 * Math.min(a[3], b[3]))));
      for (let q = 0; q < n; q++) {
        const u = q / n;
        S.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, (k + u) / (pts.length - 1)]);
      }
    }
    S.push([...pts[pts.length - 1], 1]);
    for (const [cx, cy, cz, r, s] of S) {
      const sx = cx, sy = cy - t * cz; // centre projeté
      const rr = r * Math.sqrt(A) + ip;
      const i0 = Math.max(0, Math.floor((sx - rr - fr.bx0) * ppm)), i1 = Math.min(w - 1, Math.ceil((sx + rr - fr.bx0) * ppm));
      const j0 = Math.max(0, Math.floor((sy - rr - fr.by0) * ppm)), j1 = Math.min(h - 1, Math.ceil((sy + rr - fr.by0) * ppm));
      const rD = r + 0.8 * ip;
      for (let j = j0; j <= j1; j++) {
        const Y = fr.by0 + (j + 0.5) * ip;
        const dy0 = Y - cy;
        for (let i = i0; i <= i1; i++) {
          const X = fr.bx0 + (i + 0.5) * ip;
          const dx = X - cx;
          // (dy0 + t z)² + (z − cz)² = r² − dx²  → A z² + B z + C = 0
          const B = 2 * (t * dy0 - cz), C = dy0 * dy0 + cz * cz - rD * rD + dx * dx;
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const z = (-B + Math.sqrt(disc)) / (2 * A);
          const id = j * w + i;
          // couverture : distance au contour projeté (≈ cercle)
          const ex = X - sx, ey = Y - sy;
          const cov = (r - Math.sqrt(ex * ex + (ey * ey) / A)) * ppm + 0.5;
          if (z > zb[id]) {
            zb[id] = z;
            kb[id] = -1;
            part[id] = idPart;
            if (sInfo) {
              sInfo.nx[id] = dx / rD;
              sInfo.ny[id] = (dy0 + t * z) / rD;
              sInfo.nz[id] = (z - cz) / rD;
              sInfo.s[id] = s;
            }
          }
          const c = cov > 1 ? 1 : cov;
          if (c > alpha[id]) alpha[id] = c;
        }
      }
    }
  }

  /* ---------- formes de tasses (mm, pour le diamètre nominal ; mises à l'échelle) ---------- */
  const FORMES = {
    tasse: { // tasse à chocolat ancienne : large, arrondie en bas, paroi presque droite
      d: 92, H: 60, zf: 6.5, rf: 7,
      ext: [[0, 29], [1.2, 29.6], [2.4, 29.2], [3.4, 30.6], [6, 35.4], [10, 39.4], [16, 42.2], [25, 43.8], [38, 44.8], [52, 45.5], [60, 46]],
      ep: [[0, 6], [8, 3.2], [30, 2.7], [52, 2.9], [60, 3.4]],
      anse: 'oreille', niveau: 0.85,
    },
    bol: { // bol à café au lait
      d: 118, H: 62, zf: 6, rf: 12,
      ext: [[0, 33], [1.5, 33.5], [3, 33], [4, 35], [9, 42.5], [17, 49.5], [28, 54], [42, 57], [55, 58.5], [62, 59]],
      ep: [[0, 6], [10, 3.4], [40, 3.0], [62, 3.6]],
      anse: null, niveau: 0.84,
    },
    expresso: { // petite tasse épaisse
      d: 64, H: 55, zf: 7, rf: 6,
      ext: [[0, 21], [1.5, 21.6], [3, 21.2], [4.5, 24], [8, 27.6], [13, 29.7], [22, 30.9], [36, 31.5], [48, 31.8], [55, 32]],
      ep: [[0, 7], [10, 4.4], [40, 4.0], [55, 4.6]],
      anse: 'boucle', niveau: 0.6,
    },
    mug: { // grand mug droit
      d: 86, H: 94, zf: 7, rf: 6,
      ext: [[0, 37.5], [2, 39.5], [5, 41.6], [10, 42.3], [50, 42.7], [94, 43]],
      ep: [[0, 7], [10, 4.2], [94, 4.4]],
      anse: 'mug', niveau: 0.86,
    },
  };

  function formeTasse(style, d) {
    const F = FORMES[style] || FORMES.tasse;
    const k = (d || F.d) / F.d;
    return {
      style, d: F.d * k, H: F.H * k, zf: F.zf * k, rf: F.rf * k, anse: F.anse, niveau: F.niveau, k,
      ext: F.ext.map(([z, r]) => [z * k, r * k]),
      ep: F.ep.map(([z, e]) => [z * k, e * Math.sqrt(k)]),
    };
  }

  /* anse vue de dessus, à droite : courbe dans le plan (x, z) collée à la paroi */
  function courbeAnse(forme, prof) {
    const H = forme.H, k = forme.k;
    const ro = (z) => prof.fo(z);
    let P;
    if (forme.anse === 'oreille') {
      const za = H * 0.8, zb = H * 0.3;
      P = [[ro(za) - 1.5, za, 3.4], [ro(za) + 7, za + 2.2, 3.6], [ro(za) + 16, za - 0.5, 3.5], [ro(za) + 21, za - 9, 3.3], [ro(zb) + 20, zb + 8, 3.1], [ro(zb) + 12, zb + 1, 3.0], [ro(zb) - 1.5, zb, 3.3]];
    } else if (forme.anse === 'boucle') {
      const za = H * 0.78, zb = H * 0.34;
      P = [[ro(za) - 1.5, za, 3.2], [ro(za) + 6, za + 1, 3.3], [ro(za) + 13, za - 5, 3.1], [ro(zb) + 12.5, zb + 5, 3.0], [ro(zb) + 6, zb, 3.0], [ro(zb) - 1.5, zb, 3.2]];
    } else {
      const za = H * 0.84, zb = H * 0.22;
      P = [[ro(za) - 2, za, 5], [ro(za) + 10, za + 1, 5.2], [ro(za) + 24, za - 8, 5], [ro(zb) + 25, zb + 12, 4.8], [ro(zb) + 12, zb, 4.8], [ro(zb) - 2, zb, 5]];
    }
    // lissage (Catmull-Rom) en 3D, y = 0
    const P2 = crPts(P.map((p) => [p[0], p[1]]), 6);
    const R2 = crPts(P.map((p) => [p[2] * k, 0]), 6);
    return P2.map((p, i) => [p[0], 0, p[1], R2[i][0] || 3 * k]);
  }

  /* ---------- décor d'une tasse : bandes déroulées (u = θ·R, v = profondeur sous la lèvre) ---------- */
  function decorTasse(forme, prof, motif, seed, ppmD) {
    const Rref = prof.fo(forme.H * 0.9);
    const C = TAU * Rref; // circonférence (mm)
    const Hd = forme.H;
    const W = Math.ceil(C * ppmD), Hp = Math.ceil(Hd * ppmD);
    const mk = () => {
      const c = canvas(W, Hp, true), g = c.__g;
      g.setTransform(ppmD, 0, 0, ppmD, 0, 0);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      return c;
    };
    const Hi = Math.ceil(8 * ppmD);
    const ext = mk(), int = canvas(W, Hi, true);
    int.__g.setTransform(ppmD, 0, 0, ppmD, 0, 0);
    int.__g.lineCap = 'round';
    int.__g.lineJoin = 'round';
    const r = AC.rng(seed ^ 0x3c6ef372);
    const ink = ENCRES[motif];
    // l'or : des filets horizontaux (v en mm sous la lèvre), calculés sans canvas
    const orLignes = motif === 'rose' || motif === 'filet' ? [[0, 0.9], [Hd - 5.2, Hd - 4.4]] : null;
    if (orLignes && (motif === 'filet' || r() < 0.7)) orLignes.push([3.2, 3.65]);
    // dessine une fonction f(g, du) deux fois (raccord de la bande)
    const deux = (g, u, f) => {
      f(0);
      if (u < 30) f(C);
      if (u > C - 30) f(-C);
    };
    if (ink) {
      const st = { c: ink.c, cf: ink.cf || null, cb: ink.cb || null, cl: ink.cl || null, cfeu: ink.cfeu || null, r, dent: 0.6 };
      const g = ext.__g;
      if (ink.mono) {
        // bord : filet + dentelle, puis gerbes pendantes
        g.fillStyle = rgba(st.c, 0.95);
        g.fillRect(0, 0, C, 0.9);
        const bw = 6.5;
        vermiculeLin(g, st, C, 1.6, 1.6 + bw, 2.4, 0.15, 0.6, C * 0.18, C * 0.82);
        const nC = Math.round(C / 5.5);
        for (let q = 0; q < nC; q++) {
          const u = (q + 0.5) * (C / nC), v = 1.6 + bw * r.range(0.4, 0.6);
          if (u < C * 0.18 || u > C * 0.82) continue; // seul le côté du spectateur se voit
          deux(g, u, (du) => {
            const kk = q % 3;
            if (kk === 0) {
              feuille(g, st, u + du, v, r.range(-0.4, 0.4), bw * 0.5, bw * 0.2, 'plume');
              feuille(g, st, u + du, v, Math.PI + r.range(-0.4, 0.4), bw * 0.44, bw * 0.18, 'plein');
              rose(g, st, u + du, v, bw * 0.24, r() * TAU);
            } else if (kk === 1) {
              for (let f = 0; f < 3; f++) feuille(g, st, u + du, v, Math.PI / 2 + r.range(-1.3, 1.3), bw * r.range(0.3, 0.42), bw * 0.14, r() < 0.5 ? 'plume' : 'plein');
              fleurette(g, st, u + du, v - bw * 0.15, bw * 0.16, r() * TAU);
            } else {
              volute(g, st, u + du, v, bw * 0.22, r() * TAU, r.sign(), 0.26);
              feuille(g, st, u + du, v, r.range(-0.5, 0.5), bw * 0.4, bw * 0.15, 'plume');
            }
          });
        }
        g.strokeStyle = rgba(st.c, 0.9);
        g.lineWidth = 0.24;
        const nF = Math.round(C / 2.4);
        for (let q = 0; q < nF; q++) {
          const u0 = (q / nF) * C, u1 = ((q + 1) / nF) * C, v0 = 1.6 + bw;
          g.beginPath();
          g.moveTo(u0, v0);
          g.quadraticCurveTo((u0 + u1) / 2, v0 + 0.9, u1, v0);
          g.stroke();
        }
        // gerbes sur le corps (en dessous)
        const nG = Math.max(3, Math.round(C / 70));
        for (let q = 0; q < nG; q++) {
          const u = (q + r.range(0.3, 0.7)) * (C / nG);
          const v = 1.6 + bw + 11 + r.range(-1, 2), a = r.range(-0.3, 0.3);
          if (u < C * 0.12 || u > C * 0.88) continue;
          deux(g, u, (du) => bouquet(g, st, u + du, v, 17, a));
        }
        // au fond du bol intérieur : bande fine
        const gi = int.__g;
        gi.fillStyle = rgba(st.c, 0.95);
        gi.fillRect(0, 0, C, 0.8);
        vermiculeLin(gi, st, C, 1.4, 5.2, 2.2, 0.14, 0.55);
        gi.strokeStyle = rgba(st.c, 0.85);
        gi.lineWidth = 0.22;
        for (let q = 0; q < nF; q++) {
          const u0 = (q / nF) * C, u1 = ((q + 1) / nF) * C;
          gi.beginPath();
          gi.moveTo(u0, 5.4);
          gi.quadraticCurveTo((u0 + u1) / 2, 6.3, u1, 5.4);
          gi.stroke();
        }
        for (let q = 0; q < Math.round(C / 9); q++) {
          const u = (q + 0.5) * 9;
          deux(gi, u, (du) => {
            feuille(gi, st, u + du, 3.3, r.range(-0.3, 0.3), 2.6, 1.0, 'plein');
            fleurette(gi, st, u + du + 2.4, 3.2, 0.9, r() * TAU);
          });
        }
      } else {
        // polychrome : bouquets fleuris espacés, petites fleurs semées
        const nG = Math.max(3, Math.round(C / 62));
        for (let q = 0; q < nG; q++) {
          const u = (q + r.range(0.35, 0.65)) * (C / nG);
          const v = 13 + r.range(-2, 2), a = r.range(-0.4, 0.4);
          if (u > C * 0.12 && u < C * 0.88) deux(g, u, (du) => bouquet(g, st, u + du, v, 19, a));
          const u2 = u + (C / nG) * 0.5;
          deux(g, u2, (du) => {
            fleurette(g, Object.assign({}, st, { cf: st.cb }), u2 + du, 9 + r.range(-2, 3), 1.6, r() * TAU);
            feuille(g, Object.assign({}, st, { c: st.cfeu }), u2 + du, 11, Math.PI / 2 + r.range(-0.5, 0.5), 3.2, 1.3);
          });
        }
        // intérieur : une guirlande légère sous la lèvre
        const gi = int.__g;
        for (let q = 0; q < Math.round(C / 11); q++) {
          const u = (q + 0.5) * 11;
          deux(gi, u, (du) => {
            feuille(gi, Object.assign({}, st, { c: st.cfeu }), u + du, 3.4, r.range(-0.4, 0.4), 3, 1.2);
            if (q % 2) rose(gi, st, u + du + 2, 3.2, 1.2, r() * TAU);
            else fleurette(gi, Object.assign({}, st, { cf: st.cb }), u + du + 2, 3.2, 1.1, r() * TAU);
          });
        }
      }
    }
    return { C, Rref, W, Hp, Hi, ppmD, ext: ink ? ext.__g.getImageData(0, 0, W, Hp).data : null, int: ink ? int.__g.getImageData(0, 0, W, Hi).data : null, or: orLignes, ink };
  }

  /* vermiculé dans une bande horizontale (u de 0 à C, v de v0 à v1) */
  function vermiculeLin(g, st, C, v0, v1, densite, lw, alpha, xa = 0, xb = C) {
    const r = st.r;
    const nVers = Math.round(((xb - xa) * (v1 - v0) * densite) / 14);
    const vm = (v0 + v1) / 2, lv = (v1 - v0) / 2;
    g.strokeStyle = rgba(st.c, alpha);
    g.lineWidth = lw;
    g.beginPath();
    for (let q = 0; q < nVers; q++) {
      let x = r.range(xa, xb), y = vm + r.range(-0.7, 0.7) * lv, hd = r() * TAU, cv = 0;
      if (q && q % 60 === 0) {
        g.stroke();
        g.beginPath();
      }
      g.moveTo(x, y);
      for (let k = 0, n = r.int(18, 40); k < n; k++) {
        cv = (cv + r.range(-0.55, 0.55)) * 0.8;
        hd += cv;
        const dn = (y - vm) / lv;
        if (dn > 0.75) hd += angleVers(hd, -Math.PI / 2) * 0.5;
        else if (dn < -0.75) hd += angleVers(hd, Math.PI / 2) * 0.5;
        x += Math.cos(hd) * 0.42;
        y += Math.sin(hd) * 0.42;
        g.lineTo(x, y);
      }
    }
    g.stroke();
  }

  /* décor du fond intérieur d'une tasse (vu à travers le thé) : petit bouquet, vue de dessus */
  function decorFond(fr, rFond, motif, seed, dy) {
    const ink = ENCRES[motif];
    if (!ink) return null;
    const c = canvas(fr.w, fr.h, true), g = c.__g;
    g.setTransform(fr.ppm, 0, 0, fr.ppm, -fr.bx0 * fr.ppm, -fr.by0 * fr.ppm);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const r = AC.rng(seed ^ 0x1b873593);
    const st = { c: ink.c, cf: ink.cf || null, cb: ink.cb || null, cl: ink.cl || null, cfeu: ink.cfeu || null, r, dent: 0.6 };
    bouquet(g, st, 0, dy || 0, rFond * 0.8, r() * TAU);
    return g.getImageData(0, 0, fr.w, fr.h).data;
  }

  const PORCELAINE = '#F7F2EA';

  /**
   * Rend une tasse (ou un bol) → { sprite, inner, clip, niveau(f), forme, prof }
   */
  function rendreTasse(o, ppm) {
    const t0 = performance.now(), tm = {};
    const t = TILT();
    const forme = formeTasse(o.style, o.d);
    const prof = profil({ H: forme.H, ext: forme.ext, ep: forme.ep, zf: forme.zf, rf: forme.rf, dzM: Math.max(0.28, Math.min(0.5, 1.7 / ppm)) });
    const anse = forme.anse ? courbeAnse(forme, prof) : null;
    const Rm = prof.rmax;
    let bx1 = Rm + 1;
    if (anse) for (const p of anse) bx1 = Math.max(bx1, p[0] + p[3] + 1);
    const fr = cadre(ppm, -Rm - 1, -Rm - t * forme.H - 1, bx1, Rm + 1, forme.H, 0.55);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    const zb = tampon('t.zb', n, Float32Array, false).fill(-1e9);
    const kb = tampon('t.kb', n, Int32Array, false);
    const part = tampon('t.part', n, Uint8Array);
    const alpha = tampon('t.a', n);
    const bufs = { zb, kb, part, alpha };
    const sil = tourner(prof, fr, t, bufs, { id: 1 });
    alphaTour(sil, fr, alpha);
    const hN = { nx: tampon('t.hx', n, Float32Array, false), ny: tampon('t.hy', n, Float32Array, false), nz: tampon('t.hz', n, Float32Array, false), s: tampon('t.hs', n, Float32Array, false) };
    if (anse) tube(anse, fr, t, bufs, 2, hN);
    // sous une boisson opaque (tasse servie) : l'intérieur caché n'est pas éclairé
    let alphaR = alpha;
    if (o.sous != null) {
      alphaR = tampon('t.aR', n, Float32Array, false);
      alphaR.set(alpha);
      const zl = forme.zf + (forme.H - 1.5 - forme.zf) * o.sous;
      const rl = prof.riF(zl) - 2 * ip, cyl = -t * zl;
      const rc = prof.rm - prof.lr * Math.sqrt(1 + t * t) - 2 * ip, cyc = -t * prof.zc;
      for (let j = 0; j < h; j++) {
        const Y = fr.by0 + (j + 0.5) * ip, d1 = Y - cyl, d2 = Y - cyc;
        if (d1 * d1 >= rl * rl || d2 * d2 >= rc * rc) continue;
        const dx = Math.min(Math.sqrt(rl * rl - d1 * d1), Math.sqrt(rc * rc - d2 * d2));
        const i0 = Math.max(0, Math.ceil((-dx - fr.bx0) * ppm - 0.5)), i1 = Math.min(w - 1, Math.floor((dx - fr.bx0) * ppm - 0.5));
        for (let i = i0; i <= i1; i++) if (zb[j * w + i] < zl && part[j * w + i] === 1) alphaR[j * w + i] = 0;
      }
    }
    tm.forme = performance.now() - t0;
    // décors
    const ppmD = Math.min(ppm, 5) * 0.62;
    const dec = decorTasse(forme, prof, o.motif, o.seed, ppmD);
    const fond = o.sous != null || o.style === 'expresso' || o.style === 'mug' ? null : decorFond(fr, prof.riW(forme.zf + forme.rf) - forme.rf * 0.3, o.motif, o.seed, -t * forme.zf);
    tm.decor = performance.now() - t0 - tm.forme;
    // matière et lumière
    const nx = tampon('t.nx', n, Float32Array, false), ny = tampon('t.ny', n, Float32Array, false), nz = tampon('t.nz', n, Float32Array, false);
    const alb = tampon('t.alb', n * 3, Float32Array, false), rough = tampon('t.rg', n, Float32Array, false);
    const met = tampon('t.met', n, Float32Array, false), ao = tampon('t.ao', n, Float32Array, false), vis = tampon('t.vis', n, Float32Array, false), env = tampon('t.env', n, Float32Array, false);
    const add = tampon('t.add', n * 3, Float32Array, false);
    const base = hexLin(o.blanc || PORCELAINE);
    const ink = dec.ink;
    const lnI = ink && ink.mono ? ink.c.map((v, c) => Math.log(Math.min(1, Math.pow(v / 255, 2.2) / base[c]))) : null;
    const lnB = base.map(Math.log);
    const { Ro, Ri, dRo, dRi, zc, rm, lr, H, zf } = prof;
    const riTop = rm - lr; // bord intérieur de la lèvre
    const Lx = R.L[0], Ly = R.L[1], Lz = R.L[2];
    const dW = dec.W, dH = dec.Hp, dHi = dec.Hi, ppd = dec.ppmD, kU = (dec.C * ppd) / TAU;
    const DE = dec.ext, DI = dec.int, OL = dec.or;
    const th0 = -Math.PI / 2; // la couture du décor, derrière (en haut)
    const solL = o.sol ? hexLin(o.sol) : [0.5, 0.45, 0.38];
    const solB = [solL[0] * 1.6, solL[1] * 1.6, solL[2] * 1.6], WB = R.WARM;
    const zOA = forme.H * 0.25, iZ = 1 / (H - zf);
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const id = j * w + i;
        if (alphaR[id] <= 0) continue;
        const pz = zb[id];
        if (pz < -1e8) { alpha[id] = 0; alphaR[id] = 0; continue; }
        const px = fr.bx0 + (i + 0.5) * ip, py = Y + t * pz;
        const rho = Math.sqrt(px * px + py * py) || 1e-6;
        const cth = px / rho, sth = py / rho;
        let Nx, Ny, Nz, surf; // surf : 0 extérieur, 1 intérieur, 2 lèvre, 3 fond, 4 anse
        const k = kb[id];
        if (part[id] === 2) {
          Nx = hN.nx[id]; Ny = hN.ny[id]; Nz = hN.nz[id];
          surf = 4;
        } else if (pz > zc) {
          let a = rho - rm, b = pz - zc;
          const l = Math.sqrt(a * a + b * b) || 1;
          a /= l; b /= l;
          Nx = a * cth; Ny = a * sth; Nz = b;
          surf = 2;
        } else if (Ri[k] > 0 && rho < (Ro[k] + Ri[k]) * 0.5) {
          const l = 1 / Math.sqrt(1 + dRi[k] * dRi[k]);
          Nx = -cth * l; Ny = -sth * l; Nz = dRi[k] * l;
          surf = 1;
        } else if (Ri[k] > 0 || rho > Ro[k] - 0.6) {
          const l = 1 / Math.sqrt(1 + dRo[k] * dRo[k]);
          Nx = cth * l; Ny = sth * l; Nz = -dRo[k] * l;
          surf = 0;
        } else {
          Nx = 0; Ny = 0; Nz = 1;
          surf = 3;
        }
        nx[id] = Nx; ny[id] = Ny; nz[id] = Nz;
        let c0 = base[0], c1 = base[1], c2 = base[2], rg = 0.03, m = 0, oc = 1, vv = 1, ev = 1, bounce = 0;
        let cov = 0, e0 = 0, e1 = 0, e2 = 0;
        if (surf <= 1) {
          // décor déroulé : u le long du tour, v sous la lèvre
          let u = ((fatan2(py, px) - th0) * kU) | 0;
          u %= dW;
          if (u < 0) u += dW;
          const v = ((H - pz) * ppd) | 0;
          const D = surf === 0 ? DE : DI, lim = surf === 0 ? dH : dHi;
          if (D && v >= 0 && v < lim) {
            const q = (v * dW + u) * 4, a = D[q + 3];
            if (a) { cov = a / 255; e0 = LN8[D[q]]; e1 = LN8[D[q + 1]]; e2 = LN8[D[q + 2]]; }
          }
          if (surf === 0) {
            if (OL) {
              const vm = H - pz;
              for (let q = 0; q < OL.length; q++) if (vm >= OL[q][0] && vm <= OL[q][1]) m = 0.85;
            }
            oc = 0.62 + 0.38 * sstep(0, zOA, pz);
            bounce = Nz < 0 ? -Nz * 0.5 : 0; // la table éclaire le bas de la paroi
          } else {
            oc = 0.78 + 0.22 * clamp01((pz - zf) * iZ);
            ev = 0.55;
            bounce = 0.55; // la porcelaine blanche se renvoie la lumière
          }
        } else if (surf === 2) {
          if (OL && Nz > 0.84) m = 0.85;
        } else if (surf === 3) {
          oc = 0.74;
          ev = 0.45;
          bounce = 0.6;
          if (fond) {
            const q = id * 4, a = fond[q + 3];
            if (a) { cov = a / 255; e0 = LN8[fond[q]]; e1 = LN8[fond[q + 1]]; e2 = LN8[fond[q + 2]]; }
          }
        } else if (OL && Nz > 0.9) m = 0.85; // l'anse : un filet d'or sur le dessus
        if (cov > 0) {
          if (lnI) {
            c0 *= Math.exp(cov * lnI[0]); c1 *= Math.exp(cov * lnI[1]); c2 *= Math.exp(cov * lnI[2]);
          } else {
            c0 *= Math.exp(cov * Math.min(0, e0 - lnB[0]));
            c1 *= Math.exp(cov * Math.min(0, e1 - lnB[1]));
            c2 *= Math.exp(cov * Math.min(0, e2 - lnB[2]));
          }
        }
        if (m > 0) {
          c0 += (OR[0] - c0) * m; c1 += (OR[1] - c1) * m; c2 += (OR[2] - c2) * m;
          rg = 0.22;
        }
        // l'ombre du bord sur l'intérieur (la lumière vient d'en haut à gauche)
        if (surf === 1 || surf === 3) {
          const s = (zc - pz) / Lz;
          const qx = px + Lx * s, qy = py + Ly * s;
          const dq = riTop - Math.sqrt(qx * qx + qy * qy), pw = 0.5 + (zc - pz) * 0.1;
          vv = sstep(-pw, pw, dq);
        }
        const j3 = id * 3;
        alb[j3] = c0; alb[j3 + 1] = c1; alb[j3 + 2] = c2;
        rough[id] = rg; met[id] = m; ao[id] = oc; vis[id] = vv; env[id] = ev;
        // lumière renvoyée (intérieur blanc, table sous la paroi)
        if (bounce > 0) {
          const kb2 = bounce * (1 - m) * (surf === 0 ? 0.16 : 0.2);
          const sc = surf === 0 ? solB : WB;
          add[j3] = c0 * kb2 * sc[0]; add[j3 + 1] = c1 * kb2 * sc[1]; add[j3 + 2] = c2 * kb2 * sc[2];
        } else { add[j3] = 0; add[j3 + 1] = 0; add[j3 + 2] = 0; }
      }
    }
    tm.matiere = performance.now() - t0 - tm.forme - tm.decor;
    const img = eclairer({ img: imageData(w, h, 't'), w, h, alb, alpha: alphaR, nx, ny, nz, ao, vis, env, add, f0: 0.045, rough, met, sol: o.sol ? hexLin(o.sol) : null });
    tm.lumiere = performance.now() - t0 - tm.forme - tm.decor - tm.matiere;
    const sp = sprite(fr, img, alpha, o.ombre === false ? null : { height: forme.H, soft: 0.55, opacity: 0.36, contact: 0.34 }, { H: forme.H, style: forme.style });
    tm.ombre = performance.now() - t0 - tm.forme - tm.decor - tm.matiere - tm.lumiere;
    sp.t = tm;
    // le disque de liquide pour un remplissage f (0..1 de la hauteur utile) : repère du sprite (mm)
    const niveau = (f) => {
      const z = zf + (forme.H - 1.5 - zf) * clamp01(f);
      return { cx: sp.ax, cy: sp.ay - t * z, r: Math.max(0, prof.riF(z)), z };
    };
    const inner = niveau(forme.niveau);
    const clip = { cx: sp.ax, cy: sp.ay - t * zc, r: rm - lr * Math.sqrt(1 + t * t) };
    return { sprite: sp, inner, clip, niveau, forme, prof, tilt: t };
  }

  /* ======================================================================
     7. Les boissons vues de dessus : un disque de liquide (rayon r mm), éclairé
        par la même lumière. Relief en millimètres au-dessus de la surface :
        ménisque au bord, remous de cuillère, couronne de micro-bulles, mousses,
        latte art, garnitures qui flottent (et font de l'ombre).
     ====================================================================== */

  /* Les douze grands crus : la couleur suit le cacao et le lait */
  const CRUS = {
    'blanc-ivoire': { nom: 'Blanc Ivoire', cacao: 33, genre: 'blanc', couleur: '#EDDCBE', brillance: 0.3, mousse: 0.9, texture: 'cremeux' },
    kewane: { nom: 'Kewane', cacao: 34, genre: 'lait', couleur: '#B7896A', brillance: 0.6, mousse: 1, texture: 'soyeux' },
    caramelia: { nom: 'Caramélia', cacao: 35, genre: 'lait', couleur: '#B67D52', brillance: 0.62, mousse: 0.95, texture: 'soyeux' },
    'elianza-lait': { nom: 'Elianza Lait', cacao: 35, genre: 'lait', couleur: '#A67455', brillance: 0.64, mousse: 0.95, texture: 'soyeux' },
    'vanuari-lait': { nom: 'Vanuari Lait', cacao: 39, genre: 'lait', couleur: '#98694C', brillance: 0.66, mousse: 0.9, texture: 'soyeux' },
    'z-caramel': { nom: 'Z-Caramel', cacao: 43, genre: 'lait', couleur: '#A2663A', brillance: 0.68, mousse: 0.85, texture: 'soyeux' },
    'elianza-noir': { nom: 'Elianza Noir', cacao: 55, genre: 'noir', couleur: '#6C412B', brillance: 0.78, mousse: 0.7, texture: 'epais' },
    'vanuari-noir': { nom: 'Vanuari Noir', cacao: 63, genre: 'noir', couleur: '#5C3524', brillance: 0.82, mousse: 0.62, texture: 'epais' },
    'z-cafe': { nom: 'Z-Café', cacao: 70, genre: 'noir', couleur: '#4D2D1D', brillance: 0.84, mousse: 0.55, texture: 'grains' },
    'mokaya-noir': { nom: 'Mokaya Noir', cacao: 75, genre: 'noir', couleur: '#452819', brillance: 0.86, mousse: 0.5, texture: 'epais' },
    'arcango-noir': { nom: 'Arcango Noir', cacao: 85, genre: 'noir', couleur: '#392115', brillance: 0.88, mousse: 0.45, texture: 'epais' },
    'noir-infini': { nom: 'Noir Infini', cacao: 99, genre: 'noir', couleur: '#2B170E', brillance: 0.9, mousse: 0.4, texture: 'epais' },
  };

  /* Les thés et infusions de la carte : teinte de l'infusion (sRGB), opacité, genre */
  const THES = {
    'montagne-bleue': { nom: 'Montagne Bleue', genre: 'thé noir', couleur: '#94461B', opacite: 0.78 },
    'blue-of-london': { nom: 'Blue of London', genre: 'thé noir, bergamote', couleur: '#A0521F', opacite: 0.74, petales: '#3E5DB0' },
    alizes: { nom: 'Thé des Alizés', genre: 'thé vert fruité', couleur: '#C5A246', opacite: 0.5 },
    fakirs: { nom: 'Thé des Fakirs', genre: 'thé noir épicé', couleur: '#853616', opacite: 0.82 },
    merveilleux: { nom: 'Thé Merveilleux', genre: 'thé noir gourmand', couleur: '#A3551F', opacite: 0.76 },
    limoncha: { nom: 'Limoncha', genre: 'infusion citronnelle, gingembre, curcuma', couleur: '#D8A42A', opacite: 0.6 },
    'mama-relax': { nom: 'Mama Relax', genre: 'infusion tilleul, verveine', couleur: '#C3B24A', opacite: 0.44, etiquette: true },
    herboriste: { nom: "L'Herboriste", genre: 'infusion verveine, menthe', couleur: '#B2AB45', opacite: 0.46, etiquette: true },
    'paris-for-you': { nom: 'Paris for You', genre: 'thé noir, fruits rouges', couleur: '#95381F', opacite: 0.78 },
    'louvre-jardin': { nom: 'Louvre côté Jardin', genre: 'thé vert, fleurs', couleur: '#CAAB52', opacite: 0.48 },
  };

  /** Recette de surface d'une boisson (ce qu'on voit du dessus) */
  function recette(id) {
    if (CRUS[id]) {
      const c = CRUS[id];
      return { type: 'choco', c: c.couleur, genre: c.genre, brill: c.brillance, mousse: c.mousse, grains: c.texture === 'grains', cremeux: c.texture === 'cremeux', epais: c.texture === 'epais' };
    }
    if (THES[id]) return Object.assign({ type: 'the' }, THES[id], { c: THES[id].couleur });
    const R_ = {
      soyeux: { type: 'choco', c: '#9E6E4E', genre: 'lait', brill: 0.62, mousse: 1.15 },
      intense: { type: 'choco', c: '#3F2417', genre: 'noir', brill: 0.9, mousse: 0.45, epais: true },
      praline: { type: 'choco', c: '#8A5A3B', genre: 'lait', brill: 0.66, mousse: 0.8, garn: ['noisettes'] },
      guimauve: { type: 'choco', c: '#7A4B30', genre: 'lait', brill: 0.7, mousse: 0.6, garn: ['guimauves'] },
      coco: { type: 'choco', c: '#734429', genre: 'lait', brill: 0.68, mousse: 0.6, garn: ['coco'] },
      frappe: { type: 'mousse', c: '#A77A57', grain: 1.4, garn: ['glacons:2'] },
      'mocha-glace': { type: 'marbre', c: '#6B4128', c2: '#E6D6C2', garn: ['glacons:3'] },
      espresso: { type: 'crema', c: '#B67A43', tigre: 1 },
      lungo: { type: 'crema', c: '#C39062', tigre: 0.5, clair: true },
      cappuccino: { type: 'mousse', c: '#F1E7D8', art: 'coeur', creme: '#A5693A', garn: ['poudre:cacao'] },
      latte: { type: 'mousse', c: '#F2E9DB', art: 'rosace', creme: '#B07A48' },
      viennois: { type: 'crema', c: '#6E4426', tigre: 0.3, garn: ['chantilly', 'eclats:cacao'] },
      mocha: { type: 'mousse', c: '#E9D6C0', art: 'tulipe', creme: '#7C4B2D', garn: ['poudre:cacao'] },
      chai: { type: 'mousse', c: '#D8B894', art: null, garn: ['poudre:cannelle', 'badiane'] },
      matcha: { type: 'mousse', c: '#BCC98F', art: 'coeur', creme: '#A6B872', artBlanc: true },
      'matcha-fraise': { type: 'mousse', c: '#AFC47C', art: null, grain: 1.2, dessous: '#E7879A', couche: 0.68 },
      'matcha-glace': { type: 'marbre', c: '#9EBB63', c2: '#F2EFE4', garn: ['glacons:3'] },
      'soda-cola': { type: 'clair', c: '#3A1B0E', opacite: 0.93, bulles: 1, garn: ['glacons:3', 'rondelle:citron'] },
      'soda-limonade': { type: 'clair', c: '#E9E8B8', opacite: 0.32, bulles: 1.2, garn: ['glacons:3', 'rondelle:citron'] },
      jus: { type: 'opaque', c: '#F09A2A', pulpe: 1, mousse: 0.5 },
      citronnade: { type: 'clair', c: '#F1E7A6', opacite: 0.62, trouble: 1, garn: ['glacons:3', 'rondelle:citron', 'menthe'] },
      'the-glace': { type: 'clair', c: '#B4561E', opacite: 0.8, garn: ['glacons:3', 'peche'] },
      sirop: { type: 'clair', c: '#C2182B', opacite: 0.78, garn: ['glacons:2'] },
      'lait-speculoos': { type: 'opaque', c: '#F4F0E8', lait: true, garn: ['eclats:speculoos', 'poudre:speculoos'] },
    };
    return R_[id] || null;
  }

  /* ---------- le latte art : un masque de mousse blanche sur la crème ---------- */
  function latteArt(g, kind, r, rng) {
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    const a = -Math.PI / 2 + rng.range(-0.25, 0.25); // l'axe du dessin (la pointe vers le bas)
    g.save();
    g.rotate(a + Math.PI / 2);
    if (kind === 'coeur') {
      const s = r * rng.range(0.55, 0.64);
      const heart = (k) => {
        g.beginPath();
        g.moveTo(0, s * 0.95 * k);
        g.bezierCurveTo(s * 1.25 * k, s * 0.2 * k, s * 0.95 * k, -s * 0.95 * k, 0.02 * s, -s * 0.42 * k);
        g.bezierCurveTo(-s * 0.95 * k, -s * 0.95 * k, -s * 1.25 * k, s * 0.2 * k, 0, s * 0.95 * k);
        g.closePath();
      };
      heart(1);
      g.fill();
      // les rides du cœur (le versé qu'on a fait onduler) : anneaux de crème
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 3; k++) {
        g.lineWidth = s * 0.05;
        heart(0.78 - k * 0.2);
        g.save();
        g.translate(0, -s * 0.12 * (k + 1));
        g.restore();
        g.stroke();
      }
      // le trait de la pointe
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.moveTo(0, -s * 0.5);
      g.lineTo(0, s * 0.9);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    } else if (kind === 'tulipe') {
      const s = r * 0.34;
      const coeur = (y, k) => {
        g.beginPath();
        g.moveTo(0, y + s * 0.8 * k);
        g.bezierCurveTo(s * 1.3 * k, y + s * 0.1 * k, s * 0.95 * k, y - s * 0.9 * k, 0, y - s * 0.35 * k);
        g.bezierCurveTo(-s * 0.95 * k, y - s * 0.9 * k, -s * 1.3 * k, y + s * 0.1 * k, 0, y + s * 0.8 * k);
        g.fill();
      };
      coeur(r * 0.36, 1.25);
      g.globalCompositeOperation = 'destination-out';
      coeur(r * 0.08, 1.12);
      g.globalCompositeOperation = 'source-over';
      coeur(r * 0.06, 1.0);
      g.globalCompositeOperation = 'destination-out';
      coeur(r * -0.18, 0.86);
      g.globalCompositeOperation = 'source-over';
      coeur(r * -0.2, 0.76);
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = r * 0.03;
      g.beginPath();
      g.moveTo(0, -r * 0.45);
      g.lineTo(0, r * 0.62);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    } else if (kind === 'rosace') {
      // rosace : feuilles en « U » emboîtées, de plus en plus petites vers la tête, un peu balancées
      const n = rng.int(9, 11), L = r * 1.36, y0 = L * 0.5, pas = (L * 0.84) / n;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const yk = y0 - k * pas;
        const wv = r * (0.8 - t * 0.55);
        const bras = pas * (2.2 - t * 0.9); // les bras remontent
        const ep = pas * 0.62;
        const sw = Math.sin(k * 1.7 + rng() * 0.5) * r * 0.035; // le balancement du versé
        g.beginPath();
        const N = 20;
        for (let s = 0; s <= N; s++) {
          const u = -1 + (2 * s) / N;
          const x = u * wv + sw, y = yk - bras * u * u - ep * 0.5 * (1 - Math.pow(Math.abs(u), 3));
          s ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        for (let s = N; s >= 0; s--) {
          const u = -1 + (2 * s) / N;
          const x = u * wv * 0.97 + sw, y = yk - bras * u * u + ep * 0.5 * (1 - Math.pow(Math.abs(u), 3));
          g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
      }
      // la tête : un petit cœur
      const yh = y0 - n * pas - r * 0.02;
      g.beginPath();
      g.ellipse(0, yh, r * 0.17, r * 0.13, 0, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = r * 0.03;
      g.beginPath();
      g.moveTo(0, yh - r * 0.1);
      g.quadraticCurveTo(r * 0.02, 0, 0, y0 + pas);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  /* ---------- garnitures : petits objets en relief posés dans les tampons ---------- */
  // P : { S, ppm, ip, c0 (centre px), H, alb, rough, f0, cov, obj }
  function poser(P, x0, y0, rad, fn) {
    // parcourt la boîte d'un objet (mm) ; fn(dx, dy, h) → hauteur au-dessus de la surface (mm) ou −1,
    // et règle P.m (matière). L'objet flotte : on l'assoit sur la surface mesurée en son centre
    // (sauf m.local : fn rend alors une hauteur absolue, à partir de h, la surface locale).
    const { S, ppm, ip, c0 } = P;
    const i0 = Math.max(0, Math.floor((x0 - rad) * ppm + c0)), i1 = Math.min(S - 1, Math.ceil((x0 + rad) * ppm + c0));
    const j0 = Math.max(0, Math.floor((y0 - rad) * ppm + c0)), j1 = Math.min(S - 1, Math.ceil((y0 + rad) * ppm + c0));
    const m = P.m;
    const ic = Math.max(0, Math.min(S - 1, Math.round(x0 * ppm + c0))), jc = Math.max(0, Math.min(S - 1, Math.round(y0 * ppm + c0)));
    const hb = m.local ? 0 : Math.max(0, P.H[jc * S + ic]);
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5 - c0) * ip - y0;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5 - c0) * ip - x0;
        const id = j * S + i;
        if (P.alpha[id] <= 0) continue;
        let hh = fn(x, y, P.H[id]);
        if (hh < 0) continue;
        hh += hb;
        if (hh <= P.H[id]) continue;
        P.H[id] = hh;
        const k3 = id * 3;
        P.alb[k3] = m.c[0]; P.alb[k3 + 1] = m.c[1]; P.alb[k3 + 2] = m.c[2];
        P.rough[id] = m.rough; P.f0[id] = m.f0; P.cov[id] = m.cov != null ? m.cov : 1; P.obj[id] = m.id || 1;
        if (m.add) P.glow[id] = m.add;
      }
    }
  }

  /* un polygone irrégulier (éclat) : distance radiale selon l'angle */
  function eclatForme(rng, n) {
    const R_ = [];
    for (let k = 0; k < n; k++) R_.push(rng.range(0.65, 1));
    return (a) => {
      let t = ((a / TAU) % 1 + 1) % 1 * n;
      const i = t | 0, f = t - i;
      return R_[i] + (R_[(i + 1) % n] - R_[i]) * f;
    };
  }

  function garnitures(P, rec, r, rng) {
    const L = hexLin;
    const liste = rec.garn || [];
    const mat = (c, rough, f0, extra) => Object.assign({ c: typeof c === 'string' ? L(c) : c, rough, f0 }, extra || {});
    for (const g of liste) {
      const [nom, arg] = g.split(':');
      if (nom === 'guimauves') {
        const n = rng.int(5, 7);
        const pos = [];
        for (let k = 0; k < n; k++) {
          let x, y, ok = false, essai = 0;
          while (!ok && essai++ < 40) {
            const a = rng() * TAU, d = r * Math.sqrt(rng()) * 0.5;
            x = Math.cos(a) * d; y = Math.sin(a) * d;
            ok = pos.every((p) => Math.hypot(p[0] - x, p[1] - y) > 12.5);
          }
          pos.push([x, y]);
          const rose_ = rng() < 0.4;
          const rw = rng.range(6.6, 8.2), rot = rng() * TAU;
          const cr = Math.cos(rot), sr = Math.sin(rot);
          // penchée : on voit un peu le flanc (ellipse allongée, dessus incliné)
          const pen = rng.range(0.2, 0.7), ax_ = rng() * TAU, pcx = Math.cos(ax_), pcy = Math.sin(ax_);
          const rh = rw * (1 + pen * 0.55);
          const haut = rng.range(5.2, 6.6), rb = 1.7;
          const cBase = L(rose_ ? '#EDC0C6' : '#EFE8DE'), cPied = L(AC.mix(rec.c, rose_ ? '#EDC0C6' : '#EFE8DE', 0.4));
          P.m = mat(cBase, 0.86, 0.02, { add: 0.03 });
          poser(P, x, y, rh + 1, (dx, dy) => {
            const u = (dx * cr + dy * sr) / rh, v = (-dx * sr + dy * cr) / rw;
            const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
            const q = Math.pow(au * au * au + av * av * av, 1 / 3); // cylindre penché : contour presque carré arrondi
            if (q > 1) return -1;
            const e = (1 - q) * rw; // distance au bord (mm)
            const bord = e < rb ? Math.sqrt(1 - Math.pow(1 - e / rb, 2)) : 1;
            const incl = pen * ((dx * pcx + dy * pcy) / rw) * 2.2;
            const grain = 0;
            P.m.c = e < 0.9 ? cPied : cBase; // le pied mouillé de chocolat
            return Math.max(0.05, haut * bord + incl * bord + grain);
          });
        }
      } else if (nom === 'noisettes' || nom === 'eclats') {
        const kind = nom === 'noisettes' ? 'noisette' : arg;
        const n = kind === 'noisette' ? rng.int(18, 26) : kind === 'cacao' ? rng.int(26, 38) : rng.int(24, 36);
        const cx = rng.range(-0.15, 0.15) * r, cy = rng.range(-0.15, 0.15) * r;
        const spread = kind === 'noisette' ? r * 0.36 : kind === 'cacao' ? r * 0.42 : r * 0.5;
        for (let k = 0; k < n; k++) {
          const a = rng() * TAU, d = spread * Math.pow(rng(), 0.75);
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
          const sz = kind === 'noisette' ? rng.range(2.2, 4.2) : kind === 'cacao' ? rng.range(0.8, 1.7) : rng.range(1.2, 3.0);
          const forme = eclatForme(rng, rng.int(5, 7));
          const haut = sz * (kind === 'noisette' ? 0.9 : 0.55);
          const coupe = kind === 'noisette' && rng() < 0.25;
          const col = kind === 'noisette' ? (coupe ? '#DDB679' : AC.mix('#B8742C', '#7E4717', rng())) : kind === 'cacao' ? AC.mix('#3A2116', '#57321E', rng()) : AC.mix('#C98B4E', '#A86A36', rng());
          P.m = mat(col, kind === 'noisette' ? (coupe ? 0.45 : 0.1) : kind === 'cacao' ? 0.35 : 0.8, kind === 'noisette' ? 0.05 : 0.03);
          // facettes : un plan incliné au hasard, arêtes vives
          const fa = rng() * TAU, fb = rng.range(0.15, 0.45), fcx = Math.cos(fa) * fb, fcy = Math.sin(fa) * fb;
          poser(P, x, y, sz + 0.5, (dx, dy) => {
            const q = Math.hypot(dx, dy) / (sz * forme(Math.atan2(dy, dx)));
            if (q > 1) return -1;
            const e = Math.min(1, (1 - q) * 3.2);
            return haut * e * (0.8 + 0.2 * Math.cos(dx * 2.1 - dy * 1.7)) + (dx * fcx + dy * fcy) * e;
          });
        }
      } else if (nom === 'coco') {
        const n = rng.int(300, 380);
        const cx = rng.range(-0.1, 0.1) * r, cy = rng.range(-0.1, 0.1) * r;
        for (let k = 0; k < n; k++) {
          const a = rng() * TAU, d = r * 0.42 * Math.pow(rng(), 0.9);
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
          const l = rng.range(1.6, 3.8), ang = rng() * TAU, courbe = rng.range(-0.9, 0.9), ep = rng.range(0.3, 0.5);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const haut = 0.3 + Math.pow(1 - d / (r * 0.42), 1.5) * 2.4 + rng() * 0.35; // un petit tas au milieu
          P.m = mat(AC.mix('#F6F1E7', '#EDE3D2', rng()), 0.8, 0.02, { add: 0.03 });
          poser(P, x, y, l / 2 + 0.6, (dx, dy) => {
            const u = dx * ca + dy * sa, v = -dx * sa + dy * ca - courbe * (u * u) / l;
            if (Math.abs(u) > l / 2) return -1;
            const q = Math.abs(v) / ep;
            if (q > 1) return -1;
            return haut + 0.25 * Math.sqrt(1 - q * q);
          });
        }
      } else if (nom === 'glacons') {
        const n = +arg || 3;
        const pos = [];
        for (let k = 0; k < n; k++) {
          let x, y, ok = false, essai = 0;
          const sz = rng.range(8.5, 10.5);
          while (!ok && essai++ < 60) {
            const a = rng() * TAU, d = (r - sz * 0.9) * Math.sqrt(rng());
            x = Math.cos(a) * d; y = Math.sin(a) * d;
            ok = pos.every((p) => Math.hypot(p[0] - x, p[1] - y) > sz * 1.7);
          }
          pos.push([x, y]);
          const rot = rng() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
          const haut = rng.range(2.2, 3.6), rb = 2.2;
          const liq = L(rec.c);
          const clairB = rec.type === 'clair' ? 1 : 0;
          const teinte = [liq[0] * 0.78 + 0.05, liq[1] * 0.78 + 0.055, liq[2] * 0.78 + 0.06];
          const laiteux = [0.74, 0.76, 0.78], arete = [0.88, 0.9, 0.92];
          P.m = mat(teinte.slice(), 0.03, 0.03, { cov: 0.9, id: 3, add: 0.03 });
          rng(); // (tirage conservé : les graines donnent les mêmes glaçons)
          poser(P, x, y, sz * 1.5, (dx, dy) => {
            const u0 = dx * cr + dy * sr, v0 = -dx * sr + dy * cr;
            const u = Math.abs(u0), v = Math.abs(v0);
            // carré arrondi
            const ex = Math.max(u - (sz - rb), 0), ey = Math.max(v - (sz - rb), 0);
            const e = Math.sqrt(ex * ex + ey * ey);
            if (e > rb || u > sz || v > sz) return -1;
            const bord = Math.min(sz - u, sz - v); // distance au bord du glaçon
            const coeur = Math.exp(-(u0 * u0 + v0 * v0) / (sz * sz * 0.16)) * 0.55;
            const ka = bord < 1.3 ? Math.pow(1 - bord / 1.3, 1.5) : 0;
            const m = P.m.c;
            m[0] = teinte[0] + (laiteux[0] - teinte[0]) * coeur * 0.75 + (arete[0] - teinte[0]) * ka * 0.7;
            m[1] = teinte[1] + (laiteux[1] - teinte[1]) * coeur * 0.75 + (arete[1] - teinte[1]) * ka * 0.7;
            m[2] = teinte[2] + (laiteux[2] - teinte[2]) * coeur * 0.75 + (arete[2] - teinte[2]) * ka * 0.7;
            P.m.cov = clairB ? 0.5 + 0.45 * Math.max(coeur, ka) : 0.9;
            return haut * Math.sqrt(1 - (e / rb) * (e / rb)) * (1 - 0.03 * (u + v) / sz);
          });
        }
      } else if (nom === 'rondelle') {
        const rr = rng.range(13, 15.5);
        const a = rng() * TAU, d = r * rng.range(0.25, 0.45);
        const x = Math.cos(a) * d, y = Math.sin(a) * d, rot = rng() * TAU;
        const nseg = rng.int(9, 11);
        const jaune = L('#F2CF3A'), blanc = L('#F5F0D9'), chair = L('#F0DE84');
        P.m = { c: jaune, rough: 0.2, f0: 0.04 };
        poser(P, x, y, rr + 0.5, (dx, dy) => {
          const q = Math.hypot(dx, dy);
          if (q > rr) return -1;
          const e = rr - q;
          const aa = Math.atan2(dy, dx) - rot;
          // matière selon l'anneau
          let c;
          if (e < 1.1) c = jaune;
          else if (e < 2.4) c = blanc;
          else {
            const s = ((aa / TAU) * nseg) % 1, sm = Math.abs((s < 0 ? s + 1 : s) - 0.5) * 2;
            const mem = sm > 0.9 || q < 1.6;
            c = mem ? blanc : chair;
            P.m.cov = mem ? 1 : 0.92;
          }
          P.m.c = c;
          return 1.3 + (e < 1.1 ? 0.25 : 0) + 0.05 * Math.sin(aa * nseg * 2);
        });
      } else if (nom === 'menthe') {
        for (let k = 0; k < 2; k++) {
          const a = rng() * TAU, d = r * rng.range(0.1, 0.4);
          const x = Math.cos(a) * d, y = Math.sin(a) * d, ang = rng() * TAU, l = rng.range(15, 20);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const vert = L('#4F8F3C'), clair = L('#7DB35A');
          P.m = { c: vert, rough: 0.3, f0: 0.04 };
          poser(P, x, y, l / 2 + 1, (dx, dy) => {
            const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
            const s = u / l + 0.5;
            if (s < 0 || s > 1) return -1;
            const wv = l * 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.8) * (1 + 0.06 * Math.sin(s * 60));
            if (Math.abs(v) > wv) return -1;
            const nerv = Math.abs(v) < 0.25 || Math.abs(Math.sin((u + Math.abs(v) * 0.9) * 1.3)) < 0.1;
            P.m.c = nerv ? clair : vert;
            return 1.9 + 0.35 * Math.cos(v * 0.9) + 0.08 * Math.sin(u * 2.3);
          });
        }
      } else if (nom === 'peche') {
        const a = rng() * TAU, d = r * rng.range(0.2, 0.4);
        const x = Math.cos(a) * d, y = Math.sin(a) * d, rot = rng() * TAU;
        const peau = L('#D8602C'), chair = L('#F4B052');
        P.m = { c: chair, rough: 0.18, f0: 0.04 };
        poser(P, x, y, 16, (dx, dy) => {
          const u = dx * Math.cos(rot) + dy * Math.sin(rot), v = -dx * Math.sin(rot) + dy * Math.cos(rot);
          // un quartier : entre deux arcs
          const q1 = Math.hypot(u, v + 9), q2 = Math.hypot(u, v + 16);
          if (q1 > 15 || q2 < 15.5) return -1;
          P.m.c = q1 > 13.8 ? peau : chair;
          return 1.6 + (15 - q1) * 0.12;
        });
      } else if (nom === 'badiane') {
        const x = rng.range(-0.25, 0.25) * r, y = rng.range(-0.25, 0.25) * r, rot = rng() * TAU;
        const brun = L('#6E3B22'), graine = L('#A4662F');
        const nb = 8;
        P.m = { c: brun, rough: 0.5, f0: 0.035 };
        poser(P, x, y, 11, (dx, dy) => {
          const q = Math.hypot(dx, dy);
          if (q > 10) return -1;
          const aa = Math.atan2(dy, dx) - rot;
          const s = ((aa / TAU) * nb) % 1, sm = Math.abs((s < 0 ? s + 1 : s) - 0.5) * 2; // 0 au milieu d'une branche
          const larg = 0.33 * (1 - Math.pow(q / 10, 2.2)) + 0.05;
          if (q > 1.2 && sm > larg * 2.4) return -1;
          const ouvert = sm < larg * 0.9 && q > 3 && q < 7.5;
          P.m.c = ouvert ? graine : brun;
          P.m.rough = ouvert ? 0.15 : 0.55;
          return 1.5 + 2.2 * (1 - q / 10) * (1 - sm / (larg * 2.4 + 0.01)) - (ouvert ? 0.6 : 0);
        });
      } else if (nom === 'chantilly') {
        // chantilly à la poche : une spirale qui monte en cône, cannelures de la douille
        const tours = 3.5, rMax = r * 0.62, haut = 18;
        const cx = rng.range(-1, 1), cy = rng.range(-1, 1), a0 = rng() * TAU;
        P.m = { c: L('#F3ECE1'), rough: 0.6, f0: 0.02, add: 0.035 };
        poser(P, cx, cy, rMax + 6, (dx, dy) => {
          const q = Math.sqrt(dx * dx + dy * dy);
          if (q > rMax + 5.6) return -1;
          const aa = fatan2(dy, dx) - a0;
          const f0_ = aa / TAU - Math.floor(aa / TAU);
          // le boudin de crème : pour chaque tour, distance au rayon de la spirale
          let best = -1;
          for (let k = 0; k <= tours + 1; k++) {
            const t = f0_ + k;
            if (t > tours) break;
            const rs = rMax * (1 - t / tours);
            const lb = 5.4 * (1 - 0.4 * t / tours);
            const d = q - rs;
            if (d > lb || d < -lb) continue;
            const s = d / lb, prof = Math.sqrt(1 - s * s);
            const cann = 1 - 0.1 * Math.abs(Math.cos(Math.asin(s) * 4 + t * 0.7)); // cannelures de la douille
            const hh = haut * Math.pow(t / tours, 0.8) + lb * 0.8 * prof * cann;
            if (hh > best) best = hh;
          }
          const qc = rMax * 0.16;
          if (q < qc) best = Math.max(best, haut + 3.5 * Math.sqrt(1 - (q / qc) * (q / qc)));
          return best;
        });
      } else if (nom === 'petales') {
        const bleu = L(rec.petales || '#3E5DB0');
        for (let k = 0; k < 7; k++) {
          const a = rng() * TAU, d = r * 0.8 * Math.sqrt(rng());
          const x = Math.cos(a) * d, y = Math.sin(a) * d, ang = rng() * TAU, l = rng.range(2.4, 4.2);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          P.m = { c: bleu, rough: 0.5, f0: 0.03 };
          poser(P, x, y, l, (dx, dy) => {
            const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
            const s = u / l + 0.5;
            if (s < 0 || s > 1) return -1;
            const wv = 0.55 * (0.4 + s) * (1 + 0.3 * Math.sin(s * 30));
            return Math.abs(v) > wv ? -1 : 0.3;
          });
        }
      }
    }
  }

  /**
   * Surface d'une boisson → canvas (2r × 2r mm, disque), avec .r, .ppm, .transp
   */
  function surfaceBoisson(id, r, seed, ppm) {
    const t0 = performance.now();
    const rec = recette(id);
    if (!rec) throw new Error('boisson inconnue : ' + id);
    const S = Math.ceil(2 * r * ppm) + 2, n = S * S, c0 = S / 2, ip = 1 / ppm;
    const rng = AC.rng(seed ^ AC.hash(id));
    const H = tampon('b.H', n), alpha = tampon('b.a', n);
    const alb = tampon('b.alb', n * 3, Float32Array, false), rough = tampon('b.rg', n, Float32Array, false), f0 = tampon('b.f0', n, Float32Array, false);
    const cov = tampon('b.cov', n, Float32Array, false), obj = tampon('b.obj', n, Uint8Array), glow = tampon('b.glow', n);
    const base = hexLin(rec.c);
    const T1 = tuile(4, 8, 3), T2 = tuile(5, 32, 2);
    const [o1x, o1y] = ofs(seed, 21), [o2x, o2y] = ofs(seed, 22);
    const k1 = 256 / (r * 1.4), k2 = 256 / 5;
    // --- remous laissés par la cuillère (quelques arcs de spirale)
    const remous = [];
    const nR = rec.type === 'choco' ? rng.int(2, 4) : rec.type === 'the' || rec.type === 'clair' ? 1 : rec.type === 'crema' ? 1 : 0;
    for (let k = 0; k < nR; k++) {
      remous.push({
        cx: rng.range(-0.2, 0.2) * r, cy: rng.range(-0.2, 0.2) * r,
        a0: rng() * TAU, len: rng.range(1.6, 3.6), r0: r * rng.range(0.25, 0.72), dr: r * rng.range(-0.07, 0.07),
        w: rng.range(1.6, 3.0) * (rec.epais ? 1.25 : 1), amp: rng.range(0.035, 0.08) * (rec.epais ? 1.5 : 1) * (rec.type === 'the' || rec.type === 'clair' ? 0.4 : 1),
        clair: rng.range(0.04, 0.1),
      });
      const s = remous[remous.length - 1];
      const ra = Math.max(0, Math.min(s.r0, s.r0 + s.dr * s.len) - 3.2 * s.w), rb = Math.max(s.r0, s.r0 + s.dr * s.len) + 3.2 * s.w;
      s.in2 = ra * ra;
      s.out2 = rb * rb;
    }
    // --- les motifs de mousse (latte art)
    let artD = null;
    if (rec.art) {
      const c = canvas(S, S, true), g = c.__g;
      g.setTransform(ppm, 0, 0, ppm, c0, c0);
      latteArt(g, rec.art, r, AC.rng(seed ^ 0x9e3779b9));
      const d = g.getImageData(0, 0, S, S).data;
      artD = tampon('b.art', n);
      for (let i = 0; i < n; i++) artD[i] = d[i * 4 + 3] / 255;
      flou(artD, S, S, 0.35 * ppm);
    }
    const foam = rec.type === 'choco' ? (rec.mousse || 0.8) * (rec.cremeux ? 1.4 : 1) : rec.type === 'jus' ? 0.5 : 0;
    const bandW = foam > 0 ? rng.range(1.4, 2.6) * foam + 0.4 : 0;
    const fcol = rec.type === 'choco' ? [Math.min(1, base[0] * 1.55 + 0.03), Math.min(1, base[1] * 1.5 + 0.025), Math.min(1, base[2] * 1.45 + 0.02)] : base;
    const creme = rec.creme ? hexLin(rec.creme) : null;
    const lisse = rec.type === 'choco' ? 0.16 - (rec.brill || 0.6) * 0.1 + (rec.cremeux ? 0.2 : 0) : rec.type === 'mousse' ? 0.58 : rec.type === 'crema' ? 0.3 : rec.type === 'opaque' ? (rec.lait ? 0.28 : 0.2) : rec.type === 'marbre' ? 0.22 : 0.02;
    const opac = rec.type === 'the' || rec.type === 'clair' ? rec.opacite : 1;
    const cremaSombre = hexLin('#5A2E13'), cremaClair = hexLin('#D9A76B');
    const TT = tuile(6, 8, 2, 0.4), kT = 256 / 34;
    const atg = rng() * Math.PI, ctg = Math.cos(atg), stg = Math.sin(atg);
    for (let j = 0; j < S; j++) {
      const y = (j + 0.5 - c0) * ip;
      for (let i = 0; i < S; i++) {
        const x = (i + 0.5 - c0) * ip;
        const id3 = j * S + i;
        const rho = Math.sqrt(x * x + y * y);
        const e = r - rho;
        const al = e * ppm + 0.5;
        if (al <= 0) { alpha[id3] = 0; continue; }
        alpha[id3] = al > 1 ? 1 : al;
        const nb = tx(T1, x * k1 + o1x, y * k1 + o1y), nf = tx(T2, x * k2 + o2x, y * k2 + o2y);
        // relief : ménisque (le liquide monte le long de la paroi)
        let hh = (rec.type === 'mousse' ? -0.35 : 0.5) * Math.exp(-(e > 0 ? e : 0) / (rec.type === 'mousse' ? 1.6 : 0.65));
        if (rec.type === 'mousse') hh += 1.4 * (1 - (rho / r) * (rho / r)); // la mousse bombe
        let c0_ = base[0], c1_ = base[1], c2_ = base[2], rg = lisse, cv = opac;
        // remous
        for (let q = 0; q < remous.length; q++) {
          const s = remous[q];
          const dx = x - s.cx, dy = y - s.cy;
          const rs2 = dx * dx + dy * dy;
          if (rs2 < s.in2 || rs2 > s.out2) continue;
          const rs = Math.sqrt(rs2);
          let dth = fatan2(dy, dx) - s.a0;
          dth -= Math.floor(dth / TAU) * TAU;
          if (dth > s.len) continue;
          const d = rs - (s.r0 + s.dr * dth);
          if (d > 3 * s.w || d < -3 * s.w) continue;
          const f = Math.sin((Math.PI * dth) / s.len);
          const g1 = Math.exp(-(d * d) / (s.w * s.w)), g2 = Math.exp(-((d + 1.3 * s.w) * (d + 1.3 * s.w)) / (s.w * s.w));
          hh += s.amp * f * (g1 - 0.45 * g2);
          const kl = 1 + s.clair * f * g1;
          c0_ *= kl; c1_ *= kl; c2_ *= kl;
        }
        // variations de couleur (lait mal mélangé, reflets de fond)
        const vb = 1 + 0.035 * nb;
        c0_ *= vb; c1_ *= vb; c2_ *= vb * 0.995;
        if (rec.type === 'choco') {
          // la mousse fine du bord
          if (bandW > 0 && e < bandW * 1.4) {
            const fm = sstep(bandW * (1.1 + 0.3 * nb), 0, e) * (0.75 + 0.25 * nf);
            c0_ += (fcol[0] - c0_) * fm * 0.55; c1_ += (fcol[1] - c1_) * fm * 0.55; c2_ += (fcol[2] - c2_) * fm * 0.55;
            rg += (0.4 - rg) * fm;
          }
        } else if (rec.type === 'mousse') {
          // micro-mousse : grain très fin
          const gr = 1 + 0.03 * nf * (rec.grain || 1);
          c0_ *= gr; c1_ *= gr; c2_ *= gr;
          hh += 0.03 * nf;
          if (artD) {
            const m = artD[id3];
            const cr = creme;
            if (rec.artBlanc) {
              // matcha : cœur de lait blanc sur vert
              const b = hexLin('#F5F1E6');
              c0_ = cr[0] + (b[0] - cr[0]) * m; c1_ = cr[1] + (b[1] - cr[1]) * m; c2_ = cr[2] + (b[2] - cr[2]) * m;
            } else {
              // anneau de crème au bord + dessin blanc
              const bord = sstep(r * 0.62, r * 0.9, rho) * (1 - m);
              const k = Math.max(1 - m, bord);
              c0_ += (cr[0] * (0.92 + 0.08 * nb) - c0_) * k; c1_ += (cr[1] * (0.92 + 0.08 * nb) - c1_) * k; c2_ += (cr[2] * (0.92 + 0.08 * nb) - c2_) * k;
              rg = 0.45 - 0.15 * k;
            }
            hh += 0.18 * m;
          } else if (creme) {
            const k = sstep(r * 0.55, r * 0.95, rho) * 0.5;
            c0_ += (creme[0] - c0_) * k; c1_ += (creme[1] - c1_) * k; c2_ += (creme[2] - c2_) * k;
          }
        } else if (rec.type === 'crema') {
          // crème tigrée : taches allongées plus sombres, bord plus foncé, cœur plus clair
          // taches allongées (tigrures) dans le sens de l'écoulement, qui tourne autour du point de chute
          const ax_ = x + r * 0.12, ay_ = y - r * 0.08, ra = Math.sqrt(ax_ * ax_ + ay_ * ay_) + 1e-3;
          const fl = tx(TT, (x * ctg + y * stg) * kT + o1x, (-x * stg + y * ctg) * kT * 1.6 + o1y);
          const tig = sstep(0.05, 0.45, fl) * (rec.tigre || 1) * 0.42;
          const bord = sstep(r * 0.6, r, rho);
          const coeur = 1 - sstep(0, r * 0.5, ra);
          let k = Math.min(0.85, tig + bord * 0.5);
          c0_ += (cremaSombre[0] - c0_) * k; c1_ += (cremaSombre[1] - c1_) * k; c2_ += (cremaSombre[2] - c2_) * k;
          k = coeur * 0.35 * (rec.clair ? 1.4 : 1);
          c0_ += (cremaClair[0] - c0_) * k; c1_ += (cremaClair[1] - c1_) * k; c2_ += (cremaClair[2] - c2_) * k;
          hh += 0.02 * nf;
        } else if (rec.type === 'marbre') {
          // lait versé, pas encore mélangé : de larges volutes enroulées autour du centre
          const th_ = fatan2(y, x), q_ = rho / r;
          const tw = th_ + 2.6 * (1 - q_) + 0.9 * tx(T1, x * k1 * 0.5 + o1y, y * k1 * 0.5 + o1x);
          const bande = Math.sin(tw * 2 + q_ * 5.5 + 0.8 * tx(T1, x * k1 + o1x, y * k1 + o1y));
          const m = sstep(-0.35, 0.55, bande) * (0.55 + 0.45 * q_);
          const c2c = hexLin(rec.c2);
          c0_ += (c2c[0] - c0_) * m; c1_ += (c2c[1] - c1_) * m; c2_ += (c2c[2] - c2_) * m;
        } else if (rec.type === 'opaque' && rec.pulpe) {
          const p = 1 + 0.06 * nf + 0.04 * nb;
          c0_ *= p; c1_ *= p; c2_ *= p;
          if (e < 2.2) { const fm = sstep(2.2, 0, e) * 0.6; c0_ += (0.95 - c0_) * fm * 0.4; c1_ += (0.72 - c1_) * fm * 0.4; c2_ += (0.4 - c2_) * fm * 0.4; }
        } else if (rec.type === 'the' || rec.type === 'clair') {
          // plus profond au centre : plus sombre et plus couvrant ; au bord, peu profond, la paroi blanche transparaît
          const prof = 1 - (rho / r) * (rho / r) * 0.35;
          cv = Math.min(1, opac * (0.8 + 0.25 * prof) * (0.55 + 0.45 * sstep(0, 3.5, e)));
          const kb_ = (1 - sstep(0, 2.8, e)) * 0.35;
          c0_ += (0.95 - c0_) * kb_; c1_ += (0.9 - c1_) * kb_; c2_ += (0.8 - c2_) * kb_;
          if (rec.trouble) { const tb = 1 + 0.05 * nb; c0_ *= tb; c1_ *= tb; c2_ *= tb; }
        }
        H[id3] = hh;
        const k3 = id3 * 3;
        alb[k3] = c0_; alb[k3 + 1] = c1_; alb[k3 + 2] = c2_;
        rough[id3] = rg; f0[id3] = 0.025; cov[id3] = cv;
      }
    }
    // --- micro-bulles : une couronne de toutes petites bulles au bord (jamais de gros trous)
    if (bandW > 0 || rec.bulles) {
      const bul = bandW > 0 ? bandW : 1.2;
      const nbul = Math.round(TAU * r * bul * (rec.bulles ? 3 : 9) * (rec.mousse || 1));
      const lum = rec.type === 'choco' ? fcol : [0.9, 0.9, 0.88];
      for (let q = 0; q < nbul; q++) {
        const e = bul * Math.pow(rng(), 1.7);
        const a = rng() * TAU;
        const rb = 0.05 + 0.2 * Math.pow(rng(), 3) + (e > bul * 0.7 ? 0.08 * rng() : 0);
        const bx = Math.cos(a) * (r - e - rb), by = Math.sin(a) * (r - e - rb);
        const ci = bx * ppm + c0, cj = by * ppm + c0, rp = rb * ppm + 0.7;
        const i0 = Math.max(0, Math.floor(ci - rp)), i1 = Math.min(S - 1, Math.ceil(ci + rp));
        const j0 = Math.max(0, Math.floor(cj - rp)), j1 = Math.min(S - 1, Math.ceil(cj + rp));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const dx = (i + 0.5 - ci) * ip, dy = (j + 0.5 - cj) * ip;
            const d2 = (dx * dx + dy * dy) / (rb * rb);
            if (d2 >= 1) continue;
            const id3 = j * S + i;
            const hb = rb * 0.85 * Math.sqrt(1 - d2) + (H[id3] > 0 ? 0 : 0);
            if (hb + 0.02 > H[id3] - 0.0) {
              H[id3] = Math.max(H[id3], hb);
              const k3 = id3 * 3, kk = 0.35;
              alb[k3] += (lum[0] - alb[k3]) * kk; alb[k3 + 1] += (lum[1] - alb[k3 + 1]) * kk; alb[k3 + 2] += (lum[2] - alb[k3 + 2]) * kk;
              rough[id3] = 0.15;
            }
          }
        }
      }
    }
    // --- grains de café très fins en suspension (Z-Café)
    if (rec.grains) {
      const nG = Math.round(r * r * 1.2);
      const sombre = hexLin('#1C0F08');
      for (let q = 0; q < nG; q++) {
        const a = rng() * TAU, d = r * 0.95 * Math.sqrt(rng());
        const i = Math.floor(Math.cos(a) * d * ppm + c0), j = Math.floor(Math.sin(a) * d * ppm + c0);
        const id3 = j * S + i, k = rng.range(0.25, 0.6);
        alb[id3 * 3] += (sombre[0] - alb[id3 * 3]) * k; alb[id3 * 3 + 1] += (sombre[1] - alb[id3 * 3 + 1]) * k; alb[id3 * 3 + 2] += (sombre[2] - alb[id3 * 3 + 2]) * k;
      }
    }
    // --- garnitures en relief
    const P = { S, ppm, ip, c0, H, alb, rough, f0, cov, obj, glow, alpha, m: null };
    if (rec.petales) (rec.garn = rec.garn || []).includes('petales') || rec.garn.push('petales');
    garnitures(P, rec, r, AC.rng(seed ^ 0x51ed270b));
    // --- poudres (cacao, cannelle, spéculoos) et filets de sauce, par-dessus
    for (const gg of rec.garn || []) {
      const [nom, arg] = gg.split(':');
      if (nom === 'poudre') {
        const col = hexLin(arg === 'cannelle' ? '#8E4A22' : arg === 'speculoos' ? '#A8683A' : '#4A2A1A');
        const cx = rng.range(-0.15, 0.15) * r, cy = rng.range(-0.15, 0.15) * r, rp = r * (arg === 'cannelle' ? 0.5 : 0.58);
        for (let j = 0; j < S; j++) {
          for (let i = 0; i < S; i++) {
            const id3 = j * S + i;
            if (alpha[id3] <= 0 || obj[id3] === 3) continue;
            const x = (i + 0.5 - c0) * ip - cx, y = (j + 0.5 - c0) * ip - cy;
            const dn = 1 - sstep(rp * 0.3, rp, Math.sqrt(x * x + y * y) * (1 + 0.15 * tx(T1, x * k1 * 2 + o1x, y * k1 * 2 + o1y)));
            if (dn <= 0) continue;
            const gr = hash2(i, j, seed) < dn * 0.85 ? 1 : 0.25;
            const k = dn * 0.6 * gr;
            const k3 = id3 * 3;
            alb[k3] += (col[0] - alb[k3]) * k; alb[k3 + 1] += (col[1] - alb[k3 + 1]) * k; alb[k3 + 2] += (col[2] - alb[k3 + 2]) * k;
            rough[id3] += (0.85 - rough[id3]) * dn;
          }
        }
      } else if (nom === 'filet') {
        // une spirale de sauce chocolat, brillante
        const col = hexLin('#2E170C'), a0 = rng() * TAU;
        const traits = [];
        for (let k = 0; k < 5; k++) traits.push({ a: a0 + (k < 3 ? 0 : Math.PI / 2 + rng.range(-0.2, 0.2)), o: (k < 3 ? k - 1 : k - 3.5) * r * 0.36 + rng.range(-2, 2), ph: rng() * TAU, am: rng.range(1.2, 2.4), ep: rng.range(0.55, 0.85) });
        P.m = { c: col, rough: 0.07, f0: 0.04, local: true };
        poser(P, 0, 0, r, (dx, dy, hc) => {
          let best = -1;
          for (const s of traits) {
            const ca = Math.cos(s.a), sa = Math.sin(s.a);
            const u = dx * ca + dy * sa, v = -dx * sa + dy * ca - s.o - s.am * Math.sin(u * 0.32 + s.ph);
            const ep = s.ep * (0.8 + 0.2 * Math.sin(u * 0.21 + s.ph * 2));
            if (v > ep || v < -ep) continue;
            const hh = hc + 0.12 + 0.35 * Math.sqrt(1 - (v / ep) * (v / ep));
            if (hh > best) best = hh;
          }
          return best;
        });
      }
    }
    // --- ombres propres (les garnitures sur le liquide), normales, lumière
    // ombres propres : l'outil commun R.sunShadow (ajouté pour les gâteaux), sinon une marche vers la lumière
    const vis = R.sunShadow ? R.sunShadow(H, S, S, ppm, 0.6) : ombresRelief(H, alpha, S, S, ppm, { dist: 8, pas: 8 });
    // creux (entre les tours de chantilly, au pied des guimauves) : occlusion
    const relief3D = (rec.garn || []).some((g) => /chantilly|guimauves|noisettes|coco|glacons|eclats|badiane/.test(g));
    const aoC = relief3D && R.cavity ? R.cavity(H, S, S, ppm, 1.4, 0.32) : null;
    const N = normales(H, S, S, ppm, 'bN');
    const add = tampon('b.add', n * 3, Float32Array, false);
    for (let i = 0; i < n; i++) {
      const gv = glow[i];
      add[i * 3] = gv ? alb[i * 3] * gv : 0; add[i * 3 + 1] = gv ? alb[i * 3 + 1] * gv : 0; add[i * 3 + 2] = gv ? alb[i * 3 + 2] * gv : 0;
    }
    const img = eclairer({ w: S, h: S, alb, alpha, nx: N.nx, ny: N.ny, nz: N.nz, vis, ao: aoC, add, f0, rough, env: 0.9 });
    // opacité (thés, sodas : on devine le fond)
    const d = img.data;
    for (let i = 0; i < n; i++) if (cov[i] < 1) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * cov[i]);
    const c = R.canvas(S, S);
    c.getContext('2d').putImageData(img, 0, 0);
    c.r = r;
    c.ppm = ppm;
    c.transp = opac < 1;
    c.rec = rec;
    c.t = performance.now() - t0;
    return c;
  }

  /* ======================================================================
     8. Verser : la boisson dans son contenant
     ====================================================================== */

  /** Ombre et occlusion sur le liquide dans une tasse : canvas (taille du sprite), noir translucide.
      La lumière vient d'en haut à gauche : le bord porte un croissant d'ombre sur le liquide. */
  function ombreLiquide(T, lv, W, Hh, ppm) {
    const prof = T.prof, t = T.tilt, sp = T.sprite;
    const zc = prof.zc, riTop = prof.rm - prof.lr;
    const Lx = R.L[0], Ly = R.L[1], Lz = R.L[2];
    const s = (zc - lv.z) / Lz;
    const ox = Lx * s, oy = Ly * s; // décalage du rayon jusqu'à la hauteur du bord
    const pw = 0.45 + (zc - lv.z) * 0.1;
    const x0 = Math.max(0, Math.floor((lv.cx - lv.r - 1) * ppm)), x1 = Math.min(W - 1, Math.ceil((lv.cx + lv.r + 1) * ppm));
    const y0 = Math.max(0, Math.floor((lv.cy - lv.r - 1) * ppm)), y1 = Math.min(Hh - 1, Math.ceil((lv.cy + lv.r + 1) * ppm));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const c = R.canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const S = R.SHADOW_COLOR;
    for (let j = 0; j < h; j++) {
      // repère de l'objet : y écran → y réel au niveau du liquide
      const py = (y0 + j + 0.5) / ppm - sp.ay + t * lv.z;
      for (let i = 0; i < w; i++) {
        const px = (x0 + i + 0.5) / ppm - sp.ax;
        const qx = px + ox, qy = py + oy;
        const dq = riTop - Math.sqrt(qx * qx + qy * qy);
        const vis = sstep(-pw, pw, dq);
        const rho = Math.sqrt(px * px + py * py);
        const ao = Math.exp(-Math.max(0, lv.r - rho) / 1.6) * 0.22; // le pied de la paroi
        const a = (1 - vis) * 0.6 + ao * (0.6 + 0.4 * vis);
        const k = (j * w + i) * 4;
        d[k] = S[0] * 0.6; d[k + 1] = S[1] * 0.6; d[k + 2] = S[2] * 0.6;
        d[k + 3] = Math.min(255, a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return { c, x0, y0 };
  }

  /** La boisson dans une tasse → sprite (canvas de la tasse + liquide), mêmes ancres et ombre */
  function verserTasse(T, id, opts, ppm) {
    const f = opts.niveau != null ? opts.niveau : T.forme.niveau;
    const lv = T.niveau(f);
    const tv = performance.now();
    const surf = surfaceMemo(id, lv.r, opts.seed || 1, ppm);
    const tsurf = performance.now() - tv;
    const sp = T.sprite, W = sp.canvas.width, Hh = sp.canvas.height;
    const c = R.canvas(W, Hh), g = c.getContext('2d');
    g.drawImage(sp.canvas, 0, 0);
    const L = R.canvas(W, Hh), gl = L.getContext('2d');
    gl.save();
    gl.beginPath();
    gl.arc(T.clip.cx * ppm, T.clip.cy * ppm, T.clip.r * ppm, 0, TAU);
    gl.clip();
    const S = surf.width;
    gl.drawImage(surf, lv.cx * ppm - S / 2, lv.cy * ppm - S / 2);
    gl.restore();
    const om = ombreLiquide(T, lv, W, Hh, ppm);
    gl.globalCompositeOperation = 'source-atop';
    gl.drawImage(om.c, om.x0, om.y0);
    g.drawImage(L, 0, 0);
    return Object.assign({}, sp, { canvas: c, niveau: lv, surface: surf, id, t: { surface: tsurf, verser: performance.now() - tv - tsurf } });
  }

  const surfaceMemo = (id, r, seed, ppm) => memoLimite(['vais:surface', id, Math.round(r * 10) / 10, seed, q20(ppm), TILT()].join('|'), () => surfaceBoisson(id, r, seed, ppm), 'vais:surface', 16);

  /* Cache borné pour les entrées lourdes (boissons servies : ~8 Mo de canvas chacune ; Safari iOS
     plafonne la mémoire totale des canvas). On retire les plus anciennes du cache commun AC.R.cache
     sans toucher à leurs canvas (une scène peut encore les afficher : le ramasse-miettes s'en charge). */
  function memoLimite(key, make, prefixe, max) {
    const had = R.cache.has(key);
    const v = R.memo(key, make);
    if (!had) {
      const cles = [];
      for (const k of R.cache.keys()) if (k.startsWith(prefixe)) cles.push(k);
      for (let i = 0; i < cles.length - max; i++) R.cache.delete(cles[i]);
    }
    return v;
  }

  /* ======================================================================
     9. La petite cuillère ancienne en argent (vue de dessus, cuilleron en bas)
        Manche ciselé comme la cuillère du logo : éventail au bout, cartouche de volutes,
        une rose, des myosotis, des feuilles ; perles au col. Argent patiné : noirci dans les creux.
     ====================================================================== */
  function reliefCiselure(g, k, rng, wAt) {
    // g : contexte en mm, repère (x, s) avec s vers le haut (s = distance à la pointe du cuilleron)
    // tout est dessiné en blanc (relief) ; l'intensité = hauteur relative
    const P = (x, s) => [x, -s];
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // filet de bord du manche (suit le contour)
    g.globalAlpha = 0.55;
    g.lineWidth = 0.55 * k;
    for (const sg of [-1, 1]) {
      g.beginPath();
      for (let s = 60 * k; s <= 123 * k; s += 0.8 * k) {
        const p = P(sg * (wAt(s) - 0.75 * k), s);
        s === 60 * k ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]);
      }
      g.stroke();
    }
    // nervure centrale de la tige
    g.globalAlpha = 0.6;
    g.lineWidth = 0.7 * k;
    g.beginPath();
    g.moveTo(...P(0, 49 * k));
    g.lineTo(...P(0, 84 * k));
    g.stroke();
    // perles du col
    g.globalAlpha = 0.9;
    for (let q = 0; q < 4; q++) {
      const p = P(0, (43.5 + q * 1.6) * k);
      g.beginPath();
      g.ellipse(p[0], p[1], 1.5 * k, 0.75 * k, 0, 0, TAU);
      g.fill();
    }
    // l'éventail (coquille) au bout
    g.globalAlpha = 0.85;
    const fs = 119.5 * k;
    for (let q = -4; q <= 4; q++) {
      const a = -Math.PI / 2 + q * 0.3;
      g.lineWidth = 0.55 * k;
      g.beginPath();
      const p0 = P(0, fs - 0.8 * k);
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p0[0] + Math.cos(a) * 5 * k, p0[1] + Math.sin(a) * 5 * k);
      g.stroke();
    }
    // cartouche : deux volutes en C qui se font face
    g.globalAlpha = 0.85;
    for (const sg of [-1, 1]) {
      const pts = [];
      for (let q = 0; q <= 26; q++) {
        const t = q / 26;
        const s = (98 + t * 18) * k;
        const x = sg * (wAt(s) - (1.6 + 1.6 * Math.sin(Math.PI * t)) * k);
        pts.push(P(x, s));
      }
      g.fillStyle = '#fff';
      trait(g, pts, 0.5 * k, 0.9 * k, 0.7 * k);
      // enroulement en bas
      const e = pts[0];
      g.lineWidth = 0.7 * k;
      g.beginPath();
      g.arc(e[0] - sg * 0.9 * k, e[1] - 0.6 * k, 1.1 * k, 0, TAU * 0.8);
      g.stroke();
    }
    // la rose au milieu du cartouche
    const pr = P(0, 106 * k);
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(pr[0], pr[1], 3.1 * k, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 0.7;
    g.lineWidth = 0.45 * k;
    g.beginPath();
    for (let q = 0; q <= 40; q++) {
      const t = q / 40, a = t * 2.6 * TAU, rad = (0.3 + 2.4 * t) * k;
      const x = pr[0] + Math.cos(a) * rad, y = pr[1] + Math.sin(a) * rad;
      q ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    // myosotis de part et d'autre, feuilles en dessous
    for (const sg of [-1, 1]) {
      const pf = P(sg * 3.6 * k, 99.5 * k);
      g.globalAlpha = 0.9;
      for (let q = 0; q < 5; q++) {
        const a = (q / 5) * TAU + rng() * 0.3;
        g.beginPath();
        g.arc(pf[0] + Math.cos(a) * 0.95 * k, pf[1] + Math.sin(a) * 0.95 * k, 0.75 * k, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 0.75;
      for (let q = 0; q < 3; q++) {
        const s0 = (88 + q * 3.2) * k;
        const pl = P(sg * 1.2 * k, s0);
        g.save();
        g.translate(pl[0], pl[1]);
        g.rotate(-Math.PI / 2 + sg * 0.55);
        g.beginPath();
        g.ellipse(2.2 * k, 0, 2.4 * k, 0.9 * k, 0, 0, TAU);
        g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  function rendreCuillere(o, ppm) {
    const t0 = performance.now();
    const l = o.l, k = l / 125;
    const rng = AC.rng(o.seed ^ 0x2545f491);
    // demi-largeur du manche selon s (mm) ; le cuilleron est une ellipse en œuf
    const wM = monotone([[33, 0.2], [37, 1.5], [41, 2.0], [44, 2.05], [55, 2.3], [70, 2.9], [85, 3.7], [97, 5.0], [105, 6.3], [112, 7.1], [117.5, 7.2], [121.5, 6.2], [124, 4.2], [125, 0.8]].map(([s, w]) => [s * k, w * k]));
    const wAt = (s) => (s < 33 * k || s > l ? 0 : wM(s));
    const sB = 20.5 * k, aB = 20.5 * k, bB = 12.8 * k;
    const bol = (s) => {
      const u = (s - sB) / aB;
      if (u <= -1 || u >= 1) return 0;
      return bB * Math.sqrt(1 - u * u) * (1 + 0.14 * (sB - s) / aB);
    };
    // hauteur de l'axe (mm) : le col se cambre, le bout du manche repose sur la table
    const zc = monotone([[33, 4.3], [38, 4.7], [44, 5.8], [52, 8.2], [60, 8.6], [75, 6.8], [95, 3.8], [110, 2.4], [125, 1.7]].map(([s, z]) => [s * k, z * k]));
    const fr = cadre(ppm, -15 * k, -l / 2 - 1, 15 * k, l / 2 + 1, 7 * k, 0.8);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    const Hf = tampon('c.H', n), alpha = tampon('c.a', n), zone = tampon('c.z', n, Uint8Array);
    // relief de ciselure : dessiné, puis adouci
    const cR = canvas(w, h, true), gR = cR.__g;
    gR.setTransform(ppm, 0, 0, ppm, -fr.bx0 * ppm, (l / 2 - fr.by0) * ppm);
    reliefCiselure(gR, k, rng, wAt);
    const dR = gR.getImageData(0, 0, w, h).data;
    const rel = tampon('c.rel', n);
    for (let i = 0; i < n; i++) rel[i] = dR[i * 4 + 3] / 255;
    flou(rel, w, h, 0.22 * k * ppm);
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      const s = l / 2 - Y;
      const wh = wAt(s), wb = bol(s), z = s > 32 * k ? zc(s) : 0;
      for (let i = 0; i < w; i++) {
        const x = fr.bx0 + (i + 0.5) * ip;
        const id = j * w + i;
        let hv = -1, a = 0;
        // le manche : dessus bombé
        if (wh > 0) {
          const d = wh - Math.abs(x);
          const aa = d * ppm + 0.5;
          if (aa > 0) {
            a = aa > 1 ? 1 : aa;
            const q = Math.min(1, Math.abs(x) / wh);
            hv = z + 1.4 * k * Math.sqrt(Math.max(0, 1 - q * q * q)) + rel[id] * 0.42 * k;
          }
        }
        // le cuilleron : creux, avec une petite lèvre
        if (wb > 0) {
          const u = (s - sB) / aB, v = x / (bB * (1 + 0.14 * (sB - s) / aB));
          const q = Math.sqrt(u * u + v * v);
          const d = (1 - q) * Math.min(aB, bB);
          const aa = d * ppm + 0.5;
          if (aa > 0) {
            const hb = 4.6 * k - 3.4 * k * Math.max(0, 1 - q * q) + 0.3 * k * Math.exp(-Math.pow((q - 0.95) / 0.04, 2));
            if (aa > a) a = aa > 1 ? 1 : aa;
            if (hb > hv) hv = hb;
          }
        }
        if (a > 0) {
          alpha[id] = a;
          Hf[id] = hv;
          zone[id] = s < 41 * k ? 2 : 1;
        } else Hf[id] = s > 36 * k ? z : 3 * k;
      }
    }
    // bords : prolonger vers le bas pour des normales douces
    const N = normales(Hf, w, h, ppm, 'cN');
    // patine : noirci dans les creux de la ciselure et au bord, poli sur les reliefs
    const cav = R.cavity ? R.cavity(Hf, w, h, ppm, 0.6, 0.9) : null;
    const alb = tampon('c.alb', n * 3, Float32Array, false), rough = tampon('c.rg', n, Float32Array, false), ao = tampon('c.ao', n, Float32Array, false);
    const argent = [0.93, 0.92, 0.88], noirci = [0.34, 0.3, 0.26];
    const Tp = tuile(7, 16, 2);
    const [px, py] = ofs(o.seed, 9);
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const id = j * w + i;
        if (alpha[id] <= 0) continue;
        const x = fr.bx0 + (i + 0.5) * ip;
        const cv = cav ? 1 - cav[id] : 0;
        const pat = clamp01(cv * 2.4 + 0.12 * (0.5 + 0.5 * tx(Tp, x * 9 + px, Y * 9 + py)));
        alb[id * 3] = lerp(argent[0], noirci[0], pat);
        alb[id * 3 + 1] = lerp(argent[1], noirci[1], pat);
        alb[id * 3 + 2] = lerp(argent[2], noirci[2], pat);
        rough[id] = 0.1 + pat * 0.3 + (zone[id] === 2 ? 0.03 : 0);
        ao[id] = 1 - pat * 0.4;
      }
    }
    const img = eclairer({ w, h, alb, alpha, nx: N.nx, ny: N.ny, nz: N.nz, ao, met: 1, rough, f0: 0.9, sol: o.sol ? hexLin(o.sol) : null });
    const sp = sprite(fr, img, alpha, { height: 7 * k, soft: 0.7, opacity: 0.34, contact: 0.4 }, { l, bol: { cy: l / 2 - sB } });
    sp.t = { tout: performance.now() - t0 };
    return sp;
  }

  /* ======================================================================
     11. Le verre : transparent. On compose à la main : la colonne de boisson vue à travers la
         paroi (côté spectateur), la surface vue par l'ouverture, les reflets de la paroi (Fresnel,
         très forts en incidence rasante), la lèvre de verre, une ombre claire.
     ====================================================================== */
  const VERRES = {
    gobelet: { d: 78, H: 92, zf: 9, rf: 3, ext: [[0, 31], [2, 32.4], [6, 33.1], [40, 35.4], [84, 38.4], [92, 39]], ep: [[0, 9], [10, 2.3], [92, 2.5]], niveau: 0.8 },
    bocal: { d: 80, H: 106, zf: 6, rf: 4, ext: [[0, 37], [3, 39.4], [8, 40], [84, 40], [90, 38.6], [95, 36.8], [106, 36.6]], ep: [[0, 6], [10, 2.6], [95, 2.6], [106, 3.2]], niveau: 0.74 },
  };

  function rendreVerre(o, ppm) {
    const t0 = performance.now();
    const t = TILT();
    const F = VERRES[o.style] || VERRES.gobelet;
    const k = (o.d || F.d) / F.d;
    const H = F.H * k;
    const prof = profil({ H, ext: F.ext.map(([z, r]) => [z * k, r * k]), ep: F.ep.map(([z, e]) => [z * k, e * Math.sqrt(k)]), zf: F.zf * k, rf: F.rf * k, dzM: Math.max(0.3, Math.min(0.5, 1.7 / ppm)) });
    const Rm = prof.rmax;
    const fr = cadre(ppm, -Rm - 1, -Rm - t * H - 1, Rm + 1, Rm + 1, H, 0.5);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    // le verre
    const zG = tampon('v.zg', n, Float32Array, false).fill(-1e9), kG = tampon('v.kg', n, Int32Array, false), pG = tampon('v.pg', n, Uint8Array);
    const alpha = tampon('v.a', n);
    const silG = tourner(prof, fr, t, { zb: zG, kb: kG, part: pG }, { id: 1 });
    alphaTour(silG, fr, alpha);
    // la boisson : colonne pleine (tranches) + surface
    const id = o.boisson || null;
    const rec = id ? recette(id) : null;
    const zl = prof.zf + (H - 2 - prof.zf) * (o.niveau != null ? o.niveau : F.niveau);
    let zL = null, surfD = null, S = 0, rl = 0;
    if (rec) {
      const Z = [], Ro = [], Ri = [];
      for (let z = prof.zf; z < zl; z += 0.45) { Z.push(z); Ro.push(prof.riF(z)); Ri.push(0); }
      Z.push(zl); Ro.push(prof.riF(zl)); Ri.push(0);
      const profL = { K: Z.length, Z: Float32Array.from(Z), Ro: Float32Array.from(Ro), Ri: Float32Array.from(Ri) };
      zL = tampon('v.zl', n, Float32Array, false).fill(-1e9);
      tourner(profL, fr, t, { zb: zL, kb: tampon('v.kl', n, Int32Array, false), part: tampon('v.pl', n, Uint8Array) }, { id: 1 });
      rl = prof.riF(zl);
      const sc = surfaceMemo(id, rl, o.bseed || 1, ppm);
      S = sc.width;
      surfD = sc.getContext('2d').getImageData(0, 0, S, S).data;
    }
    const img = new ImageData(w, h), d = img.data;
    const V_ = oeil(), Vy = V_[1], Vz = V_[2];
    const E = [0, 0, 0];
    const sol = o.sol ? hexLin(o.sol) : null;
    const { Ro, Ri, dRo, dRi, zc, rm, lr } = prof;
    // couleurs de la colonne (vue à travers la paroi)
    const cL = rec ? hexLin(rec.c) : null;
    const cL2 = rec && rec.dessous ? hexLin(rec.dessous) : null; // matcha fraise : le lait à la fraise en dessous
    const zCouche = prof.zf + (zl - prof.zf) * ((rec && rec.couche) || 0.55);
    const opaqueCol = rec ? (rec.type === 'clair' ? Math.min(1, rec.opacite + 0.12) : 1) : 0;
    const Lx = R.L[0], Ly = R.L[1], Lz = R.L[2];
    const teinte = [0.94, 0.975, 0.965];
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const q = j * w + i;
        const aG = alpha[q];
        if (aG <= 0) continue;
        const X = fr.bx0 + (i + 0.5) * ip;
        // 1) ce qu'il y a derrière le verre : la boisson (couleur linéaire lc, opacité la)
        let l0 = 0, l1 = 0, l2 = 0, la = 0;
        const hasL = zL && zL[q] > -1e8;
        const zg = zG[q];
        if (hasL) {
          const zq = zL[q];
          if (zq >= zl - 0.01) {
            // la surface, vue par l'ouverture
            const lx = X, ly = Y + t * zl;
            const si = Math.floor(lx * ppm + S / 2), sj = Math.floor(ly * ppm + S / 2);
            if (si >= 0 && sj >= 0 && si < S && sj < S) {
              const s4 = (sj * S + si) * 4;
              la = surfD[s4 + 3] / 255;
              l0 = LIN8[surfD[s4]]; l1 = LIN8[surfD[s4 + 1]]; l2 = LIN8[surfD[s4 + 2]];
            }
          } else {
            // le flanc de la colonne : plus sombre en bas, à l'ombre (côté spectateur)
            const c = cL2 && zq < zCouche ? cL2 : cL;
            const f = 0.5 + 0.3 * clamp01((zq - prof.zf) / (zl - prof.zf));
            const fondu = cL2 ? sstep(zCouche - 3, zCouche + 3, zq) : 1;
            const cc = cL2 ? [cL2[0] + (cL[0] - cL2[0]) * fondu, cL2[1] + (cL[1] - cL2[1]) * fondu, cL2[2] + (cL[2] - cL2[2]) * fondu] : c;
            l0 = cc[0] * f; l1 = cc[1] * f; l2 = cc[2] * f;
            la = opaqueCol;
            // quelques bulles contre la paroi (sodas)
            if (rec.bulles && hash2(i >> 1, j >> 1, 77) < 0.012) { l0 = l0 * 0.4 + 0.5; l1 = l1 * 0.4 + 0.5; l2 = l2 * 0.4 + 0.5; }
          }
        }
        // 2) le verre devant ?
        const glassDevant = zg > -1e8 && (!hasL || zg > zL[q] + 0.01);
        let cr = 0, cg = 0, cb = 0, A = la;
        if (glassDevant) {
          const px = X, py = Y + t * zg;
          const rho = Math.sqrt(px * px + py * py) || 1e-6;
          const cth = px / rho, sth = py / rho;
          const kk = kG[q];
          let Nx, Ny, Nz, levre = false;
          if (zg > zc) {
            let a = rho - rm, b = zg - zc;
            const l = Math.sqrt(a * a + b * b) || 1;
            a /= l; b /= l;
            Nx = a * cth; Ny = a * sth; Nz = b;
            levre = true;
          } else if (Ri[kk] > 0 && rho < (Ro[kk] + Ri[kk]) * 0.5) {
            const l = 1 / Math.sqrt(1 + dRi[kk] * dRi[kk]);
            Nx = -cth * l; Ny = -sth * l; Nz = dRi[kk] * l;
          } else {
            const l = 1 / Math.sqrt(1 + dRo[kk] * dRo[kk]);
            Nx = cth * l; Ny = sth * l; Nz = -dRo[kk] * l;
          }
          const ndv = Ny * Vy + Nz * Vz;
          const cv = ndv > 0 ? ndv : -ndv;
          const rx = 2 * ndv * Nx, ry = 2 * ndv * Ny - Vy, rz = 2 * ndv * Nz - Vz;
          envRad(rx, ry, rz, 0.02, sol, E);
          const c1 = 1 - cv, fres = 0.04 + 0.96 * c1 * c1 * c1 * c1 * c1;
          const tr = (1 - fres) * (levre ? 0.25 : 0.9);
          // un peu de lumière diffuse dans l'épaisseur (lèvre, bords)
          const ndl = Nx * Lx + Ny * Ly + Nz * Lz;
          const dif = (levre ? 0.55 : 0.05) * (0.45 + 0.55 * Math.max(0, ndl));
          cr = fres * E[0] + dif * 0.9 + tr * teinte[0] * la * l0;
          cg = fres * E[1] + dif * 0.95 + tr * teinte[1] * la * l1;
          cb = fres * E[2] + dif * 0.93 + tr * teinte[2] * la * l2;
          A = 1 - tr * (1 - la) - (levre ? 0 : 0.04);
          if (levre) A = Math.max(A, 0.82);
          A = clamp01(A);
          if (A > 0.001) { cr /= A; cg /= A; cb /= A; }
        } else {
          cr = l0; cg = l1; cb = l2;
          // le fond du verre, vu à travers un liquide clair
          if (zg > -1e8 && la < 1) {
            const extra = (1 - la) * 0.12;
            A = la + extra;
            if (A > 0.001) { cr = (l0 * la + 0.8 * extra) / A; cg = (l1 * la + 0.82 * extra) / A; cb = (l2 * la + 0.8 * extra) / A; }
          }
        }
        const p4 = q * 4;
        d[p4] = enc(cr); d[p4 + 1] = enc(cg); d[p4 + 2] = enc(cb);
        d[p4 + 3] = Math.round(clamp01(A) * aG * 255);
      }
    }
    // ombre : plus claire qu'un objet plein (le verre laisse passer la lumière)
    const aS = tampon('v.as', n, Float32Array, false);
    for (let q = 0; q < n; q++) aS[q] = alpha[q] * (d[q * 4 + 3] / 255 * 0.75 + 0.25);
    const c = R.canvas(fr.W, fr.H);
    c.getContext('2d').putImageData(img, fr.px0, fr.py0);
    const sh = ombrePortee(aS, w, h, fr.px0, fr.py0, fr.W, fr.H, ppm, { height: H, soft: 0.5, opacity: 0.3, contact: 0.3 });
    const sp = { canvas: c, shadow: sh, w: fr.W / ppm, h: fr.H / ppm, ax: fr.ax, ay: fr.ay, ppm, H, t: { tout: performance.now() - t0 } };
    const inner = { cx: sp.ax, cy: sp.ay - t * zl, r: prof.riF(zl), z: zl };
    return { sprite: sp, inner, prof, tilt: t };
  }

  /* ======================================================================
     10. Servir : assembler soucoupe, cuillère, tasse et boisson en un seul sprite.
         Les ombres tombent sur ce qui est dessous (la tasse sur la soucoupe et la cuillère).
     ====================================================================== */

  /** Ombre d'un sprite tourné : recalculée (elle part toujours vers le bas à droite) */
  function ombreTournee(sp, rot, haut, ppm, opts = {}) {
    const S = sp.shadow;
    if (!S || !S.a2) return null;
    const k = S.k, pk = ppm / k, w2 = S.w2, h2 = S.h2, a2 = S.a2;
    const axs = sp.ax * pk, ays = sp.ay * pk; // l'ancre, en pixels basse résolution
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const soft = opts.soft || 0.7, off = haut * 0.55 * pk, sig = haut * 0.6 * soft * pk;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of [[-axs, -ays], [w2 - axs, -ays], [-axs, h2 - ays], [w2 - axs, h2 - ays]]) {
      const X = x * cr - y * sr, Y = x * sr + y * cr;
      x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
    }
    x0 = Math.floor(x0 - 2 * sig); y0 = Math.floor(y0 - 2 * sig);
    x1 = Math.ceil(x1 + off + 2.5 * sig); y1 = Math.ceil(y1 + off + 2.5 * sig);
    const W = x1 - x0, H = y1 - y0;
    const out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const Y = y0 + j + 0.5;
      for (let i = 0; i < W; i++) {
        const X = x0 + i + 0.5;
        const u = (X * cr + Y * sr + axs) | 0, v = (-X * sr + Y * cr + ays) | 0;
        if (u >= 0 && v >= 0 && u < w2 && v < h2) out[j * W + i] = a2[v * w2 + u];
      }
    }
    const c = R.castShadow(out, W, H, pk, { height: haut, soft, opacity: opts.opacity || 0.34, contact: opts.contact || 0.4 });
    return { c, x0: x0 * k, y0: y0 * k, k }; // à dessiner en (ancre + x0, ancre + y0), agrandi k fois
  }

  /**
   * Compose des éléments : [{ sp, x, y, rot, haut }] (mm, relatifs au premier) → sprite.
   * Le premier élément est le socle (soucoupe) ; les suivants projettent leur ombre sur tout ce
   * qui a déjà été posé, et sur la table.
   */
  function composer(els, ppm) {
    // boîte englobante (mm)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const e of els) {
      const sp = e.sp, rot = e.rot || 0;
      const pts = [[-sp.ax, -sp.ay], [sp.w - sp.ax, -sp.ay], [-sp.ax, sp.h - sp.ay], [sp.w - sp.ax, sp.h - sp.ay]];
      for (const [px, py] of pts) {
        const X = e.x + px * Math.cos(rot) - py * Math.sin(rot), Y = e.y + px * Math.sin(rot) + py * Math.cos(rot);
        x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
      }
      if (rot) { const m = (e.haut || 6) * 1.6 + 4; x1 += m; y1 += m; }
    }
    const W = Math.ceil((x1 - x0) * ppm), H = Math.ceil((y1 - y0) * ppm);
    const C = R.canvas(W, H), g = C.getContext('2d');
    const SH = R.canvas(W, H), gs = SH.getContext('2d');
    const P = (x, y) => [(x - x0) * ppm, (y - y0) * ppm];
    els.forEach((e, k) => {
      const sp = e.sp, rot = e.rot || 0;
      const [px, py] = P(e.x, e.y);
      // l'ombre : sur la table (calque des ombres) et sur ce qui est déjà posé
      let sh = null;
      const S = sp.shadow;
      if (rot && S) {
        const o = ombreTournee(sp, rot, e.haut || 6, ppm);
        if (o) sh = (gg) => gg.drawImage(o.c, px + o.x0, py + o.y0, o.c.width * o.k, o.c.height * o.k);
      } else if (S && S.petite) sh = (gg) => gg.drawImage(S.petite, px - sp.ax * ppm, py - sp.ay * ppm, S.petite.width * S.k, S.petite.height * S.k);
      else if (S) sh = (gg) => gg.drawImage(S, px - sp.ax * ppm, py - sp.ay * ppm);
      if (sh) {
        sh(gs);
        if (k > 0) {
          g.save();
          g.globalCompositeOperation = 'source-atop';
          sh(g);
          g.restore();
        }
      }
      g.save();
      g.translate(px, py);
      if (rot) g.rotate(rot);
      g.drawImage(sp.canvas, -sp.ax * ppm, -sp.ay * ppm);
      g.restore();
    });
    return { canvas: C, shadow: SH, w: W / ppm, h: H / ppm, ax: -x0, ay: -y0, ppm };
  }

  /* ---------- la carte : toutes les boissons, avec leur contenant par défaut ---------- */
  const TASSE_FLEURIE = { type: 'tasse', style: 'tasse', motif: 'rose', soucoupe: 'rose', seed: 7 };
  const LISTE = [];
  (function () {
    const P = (id, nom, famille, contenant, extra) => LISTE.push(Object.assign({ id, nom, famille, contenant, froid: contenant.type === 'verre' }, extra || {}));
    Object.keys(CRUS).forEach((id) => P(id, CRUS[id].nom + ' ' + CRUS[id].cacao + ' %', 'grands-crus', TASSE_FLEURIE, { cacao: CRUS[id].cacao }));
    P('soyeux', 'Chocolat soyeux', 'classiques', { type: 'tasse', style: 'tasse', motif: 'bleu', soucoupe: 'bleu', chantourne: true, seed: 12 });
    P('intense', 'Chocolat intense', 'classiques', { type: 'tasse', style: 'tasse', motif: 'brun', soucoupe: 'brun', seed: 13 });
    P('praline', 'Praliné noisette', 'gourmets', { type: 'tasse', style: 'tasse', motif: 'rose', soucoupe: 'filet', seed: 14 });
    P('guimauve', 'Guimauve', 'gourmets', { type: 'tasse', style: 'tasse', motif: 'bleu', soucoupe: 'rose', seed: 15 });
    P('coco', 'Coco façon Bounty', 'gourmets', { type: 'tasse', style: 'tasse', motif: 'brun', soucoupe: 'bleu', seed: 16 });
    P('frappe', 'Chocolat frappé', 'glaces', { type: 'verre', style: 'bocal', seed: 17 });
    P('mocha-glace', 'Mocha glacé', 'glaces', { type: 'verre', style: 'gobelet', seed: 18 });
    P('espresso', 'Espresso', 'cafes', { type: 'tasse', style: 'expresso', motif: 'blanche', soucoupe: 'filet', dS: 112, seed: 19 });
    P('lungo', 'Lungo', 'cafes', { type: 'tasse', style: 'expresso', motif: 'filet', soucoupe: 'blanche', d: 70, dS: 118, seed: 20 });
    P('cappuccino', 'Cappuccino', 'cafes', { type: 'tasse', style: 'tasse', motif: 'filet', soucoupe: 'filet', seed: 21 });
    P('latte', 'Café latte', 'cafes', { type: 'tasse', style: 'bol', motif: 'bleu', soucoupe: null, seed: 22 });
    P('viennois', 'Café viennois', 'cafes', { type: 'tasse', style: 'tasse', motif: 'rose', soucoupe: 'bleu', seed: 23 });
    P('mocha', 'Mocha', 'cafes', { type: 'tasse', style: 'tasse', motif: 'brun', soucoupe: 'brun', chantourne: true, seed: 24 });
    P('chai', 'Chaï latte', 'specialites', { type: 'tasse', style: 'mug', motif: 'blanche', soucoupe: null, seed: 25 });
    P('matcha', 'Matcha latte', 'specialites', { type: 'tasse', style: 'tasse', motif: 'filet', soucoupe: 'blanche', seed: 26 });
    P('matcha-fraise', 'Matcha fraise', 'specialites', { type: 'verre', style: 'gobelet', seed: 27 });
    Object.keys(THES).forEach((id, k) => P(id, THES[id].nom, 'thes', { type: 'tasse', style: 'tasse', motif: k % 2 ? 'bleu' : 'rose', soucoupe: k % 3 ? 'rose' : 'bleu', seed: 30 + k }, { genre: THES[id].genre }));
    P('matcha-glace', 'Matcha glacé', 'fraiches', { type: 'verre', style: 'gobelet', seed: 41 });
    P('soda-cola', 'Soda (cola)', 'fraiches', { type: 'verre', style: 'gobelet', seed: 42 });
    P('soda-limonade', 'Soda (limonade)', 'fraiches', { type: 'verre', style: 'gobelet', seed: 43 });
    P('jus', "Jus d'orange", 'fraiches', { type: 'verre', style: 'gobelet', seed: 44 });
    P('citronnade', 'Citronnade maison', 'fraiches', { type: 'verre', style: 'bocal', seed: 45 });
    P('the-glace', 'Thé glacé maison', 'fraiches', { type: 'verre', style: 'gobelet', seed: 46 });
    P('sirop', "Sirop à l'eau (grenadine)", 'fraiches', { type: 'verre', style: 'gobelet', seed: 47 });
    P('lait-speculoos', 'Lait spéculoos', 'enfants', { type: 'verre', style: 'gobelet', seed: 48 });
  })();
  const PAR_ID = {};
  LISTE.forEach((it) => (PAR_ID[it.id] = it));

  /** Le fil et l'étiquette d'un sachet d'infusion (dessinés sur la tasse servie) */
  function etiquette(S, cupPos, T, lv, cup, Sc, ppm, rng) {
    const g = S.canvas.getContext('2d');
    const P = (x, y) => [(S.ax + x) * ppm, (S.ay + y) * ppm];
    const t = T.tilt;
    // point de départ dans le liquide, passage sur la lèvre (côté gauche, en bas), arrivée sur la soucoupe
    const a0 = Math.PI * rng.range(0.9, 1.04);
    const rL = T.prof.rm, zL = T.prof.H;
    const pl = [cupPos.x + Math.cos(a0) * rL, cupPos.y + Math.sin(a0) * rL - t * zL];
    const p0 = [cupPos.x + Math.cos(a0) * lv.r * 0.55, cupPos.y + Math.sin(a0) * lv.r * 0.55 - t * lv.z];
    const pe = [cupPos.x + Math.cos(a0) * (Sc.R * 0.78), cupPos.y + Math.sin(a0) * (Sc.R * 0.78) + 6];
    g.save();
    g.lineCap = 'round';
    // ombre du fil
    g.strokeStyle = 'rgba(40,28,20,0.18)';
    g.lineWidth = 0.9 * ppm;
    g.beginPath();
    g.moveTo(...P(pl[0] + 0.8, pl[1] + 1.2));
    g.quadraticCurveTo(...P((pl[0] + pe[0]) / 2 + 1.5, (pl[1] + pe[1]) / 2 + 3), ...P(pe[0] + 1, pe[1] + 1.4));
    g.stroke();
    g.strokeStyle = '#EEE8DA';
    g.lineWidth = 0.45 * ppm;
    g.beginPath();
    g.moveTo(...P(p0[0], p0[1]));
    g.quadraticCurveTo(...P((p0[0] + pl[0]) / 2, (p0[1] + pl[1]) / 2 - 1), ...P(pl[0], pl[1]));
    g.quadraticCurveTo(...P((pl[0] + pe[0]) / 2, (pl[1] + pe[1]) / 2 + 2), ...P(pe[0], pe[1]));
    g.stroke();
    // l'étiquette de papier (un peu de travers), avec son ombre
    const [ex, ey] = P(pe[0], pe[1]);
    g.translate(ex, ey);
    g.rotate(a0 - Math.PI / 2 + rng.range(-0.3, 0.3));
    const lw = 15 * ppm, lh = 19 * ppm;
    g.shadowColor = 'rgba(48,30,22,0.35)';
    g.shadowBlur = 2.2 * ppm;
    g.shadowOffsetX = 0.9 * ppm;
    g.shadowOffsetY = 1.3 * ppm;
    g.fillStyle = '#F4EFE3';
    g.beginPath();
    g.rect(-lw / 2, 0, lw, lh);
    g.fill();
    g.shadowColor = 'transparent';
    const gr = g.createLinearGradient(-lw / 2, 0, lw / 2, lh);
    gr.addColorStop(0, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(120,100,80,0.10)');
    g.fillStyle = gr;
    g.fillRect(-lw / 2, 0, lw, lh);
    g.strokeStyle = 'rgba(120,150,110,0.8)';
    g.lineWidth = 0.35 * ppm;
    g.strokeRect(-lw / 2 + 1.6 * ppm, 1.6 * ppm, lw - 3.2 * ppm, lh - 3.2 * ppm);
    // une petite feuille imprimée
    g.fillStyle = 'rgba(96,130,84,0.85)';
    g.beginPath();
    g.ellipse(0, lh * 0.55, 3.2 * ppm, 1.4 * ppm, -0.6, 0, TAU);
    g.fill();
    g.restore();
  }

  /** La boisson complète dans son contenant → sprite (.inner : le disque de liquide, mm) */
  function servir(id, o, ppm) {
    const t0 = performance.now();
    const it = PAR_ID[id];
    if (!it) throw new Error('boisson inconnue : ' + id);
    const c = Object.assign({}, it.contenant, o.contenant || {});
    const seed = o.seed != null ? o.seed : 1;
    const t = TILT();
    if (c.type === 'verre') {
      const G = V.verre({ style: c.style, seed: c.seed, sol: o.sol, boisson: id, bseed: seed }, ppm);
      const sp = Object.assign({}, G.sprite, { inner: G.inner, id, t: { tout: performance.now() - t0 } });
      return sp;
    }
    // une boisson opaque cache l'intérieur de la tasse : on ne l'éclaire pas
    const rec = recette(id) || {};
    const opaque = rec.type && rec.type !== 'the' && rec.type !== 'clair';
    const niv = o.niveau != null ? o.niveau : formeTasse(c.style, c.d).niveau;
    const tm = {};
    let tt = performance.now();
    const T = tasseMemo({ motif: c.motif, style: c.style, d: c.d, seed: c.seed, sol: o.sol, sous: opaque ? niv : null }, ppm);
    tm.tasse = performance.now() - tt; tt = performance.now();
    const cup = B.dans(T, id, { seed, niveau: o.niveau }, ppm);
    tm.boisson = performance.now() - tt; tt = performance.now();
    const els = [];
    let Sc = null;
    const soucoupe = o.soucoupe === false ? null : c.soucoupe;
    if (soucoupe) {
      // la soucoupe sous la tasse ne se voit pas : on ne l'éclaire pas
      let kM = 0;
      for (let q = 0; q < T.prof.K; q++) if (T.prof.Ro[q] > T.prof.Ro[kM]) kM = q;
      const zS0 = 2.8 * ((c.dS || 140) / 140);
      const trou = { x: 0, y: -t * (zS0 + T.prof.Z[kM]), r: T.prof.Ro[kM] - 1.2 };
      Sc = soucoupeMemo({ motif: soucoupe, d: c.dS || 140, seed: c.seed + 11, chantourne: !!c.chantourne, sol: o.sol, trou }, ppm);
      els.push({ sp: Sc, x: 0, y: 0 });
    }
    tm.soucoupe = performance.now() - tt; tt = performance.now();
    const zS = Sc ? Sc.puits.z : 0;
    const cupPos = { x: 0, y: -t * zS };
    const cuil = o.cuillere === false ? null : V.cuillere({ l: c.style === 'expresso' ? 100 : 118, seed: c.seed + 3, sol: o.sol }, ppm);
    if (cuil) {
      if (Sc) els.push({ sp: cuil, x: Sc.R * 0.16, y: Sc.R * 0.73, rot: Math.PI / 2 + 0.1, haut: 6 + zS * 1.6 });
      else els.push({ sp: cuil, x: T.forme.d * 0.08, y: T.forme.d * 0.5 + 12, rot: Math.PI / 2 + 0.22, haut: 6 });
    }
    tm.cuillere = performance.now() - tt; tt = performance.now();
    els.push({ sp: cup, x: cupPos.x, y: cupPos.y });
    if (!Sc) {
      // pas de soucoupe : la tasse est le socle
      const k = els.findIndex((e) => e.sp === cup);
      const [e] = els.splice(k, 1);
      els.unshift(e);
    }
    const S = composer(els, ppm);
    tm.composer = performance.now() - tt;
    const lv = cup.niveau;
    if (THES[id] && THES[id].etiquette && Sc) etiquette(S, cupPos, T, lv, cup, Sc, ppm, AC.rng(seed ^ 0x7a3d));
    S.inner = { cx: S.ax + cupPos.x + (lv.cx - cup.ax), cy: S.ay + cupPos.y + (lv.cy - cup.ay), r: lv.r, z: lv.z };
    S.tasse = { x: cupPos.x, y: cupPos.y, H: T.forme.H };
    S.id = id;
    S.t = Object.assign({ tout: performance.now() - t0 }, tm);
    return S;
  }

  /* ======================================================================
     12. La table : planches peintes (menthe, sauge, jaune, orange), le veinage qui
         transparaît sous la peinture, les joints en V, l'usure aux arêtes.
         Calcul par bandes de lignes (mémoire bornée), éclairage commun.
     ====================================================================== */
  const BOIS = { menthe: '#A1D4D5', sauge: '#B9CFBC', jaune: '#E2CC41', orange: '#E8743B' };

  function rendreTable(o, ppmF) {
    const t0 = performance.now();
    // la peinture est une surface douce : calcul plafonné à ~3 px/mm, puis agrandi (les rayures restent nettes)
    const ppm = Math.min(ppmF, o.ppmMax || 3.2);
    const W = Math.round(o.w * ppm), Hh = Math.round(o.h * ppm), ip = 1 / ppm;
    const rng = AC.rng(o.seed ^ 0x6a09e667);
    const peint = hexLin(BOIS[o.bois] || (o.bois && o.bois[0] === '#' ? o.bois : BOIS.menthe));
    const boisNu = hexLin('#B49C7C'), sousCouche = hexLin('#E9E4D6');
    // planches verticales
    const planches = [];
    let x = -rng.range(10, 60);
    while (x < o.w + 10) {
      const l = rng.range(95, 135);
      planches.push({ x0: x, x1: x + l, f: rng.range(0.55, 1.1), ph: rng() * 20, dv: rng.range(-0.025, 0.025), wa: rng.range(3, 9), use: rng.range(0.3, 1), noeud: rng() < 0.55 ? { x: x + rng.range(0.25, 0.75) * l, y: rng.range(0, o.h), r: rng.range(5, 11) } : null });
      x += l;
    }
    // par colonne : planche, position dans la planche, distance au joint
    const colP = new Int16Array(W), colU = new Float32Array(W), colD = new Float32Array(W);
    for (let i = 0, p = 0; i < W; i++) {
      const X = (i + 0.5) * ip;
      while (p < planches.length - 1 && X >= planches[p].x1) p++;
      colP[i] = p;
      colU[i] = X - planches[p].x0;
      colD[i] = Math.min(X - planches[p].x0, planches[p].x1 - X);
    }
    const Tw = tuile(8, 4, 3), Tb = tuile(9, 16, 2), Tu = tuile(10, 8, 3), Tf = tuile(11, 32, 2);
    const [ax, ay] = ofs(o.seed, 31), [bx, by] = ofs(o.seed, 32), [ux, uy] = ofs(o.seed, 33);
    const out = new ImageData(W, Hh), od = out.data;
    const BAND = 96;
    const sol = peint;
    const GW = new Float32Array((W >> 3) + 3), GF = new Float32Array((W >> 3) + 3), WARP = new Float32Array(W), FLAT = new Float32Array(W);
    for (let jb = 0; jb < Hh; jb += BAND) {
      const j0 = Math.max(0, jb - 1), j1 = Math.min(Hh, jb + BAND + 1), hb = j1 - j0, n = W * hb;
      const Hf = tampon('tb.H', n, Float32Array, false), alb = tampon('tb.alb', n * 3, Float32Array, false);
      const rough = tampon('tb.rg', n, Float32Array, false), ao = tampon('tb.ao', n, Float32Array, false);
      for (let j = j0; j < j1; j++) {
        const Y = (j + 0.5) * ip;
        const r0 = (j - j0) * W;
        // champs lents (ondulation du fil, planéité) : calculés tous les 8 pixels, interpolés
        for (let i = 0; i < W; i += 8) {
          const X = (i + 0.5) * ip, P = planches[colP[i]];
          GW[i >> 3] = tx(Tw, X * 0.9 + ax + P.ph * 7, Y * 0.35 + ay);
          GF[i >> 3] = tx(Tf, X * 0.25 + ux, Y * 0.25 + uy);
        }
        GW[(W >> 3) + 1] = GW[W >> 3];
        GF[(W >> 3) + 1] = GF[W >> 3];
        for (let i = 0; i < W; i++) {
          const q = i >> 3, f = (i & 7) / 8;
          WARP[i] = GW[q] + (GW[q + 1] - GW[q]) * f;
          FLAT[i] = GF[q] + (GF[q + 1] - GF[q]) * f;
        }
        // le fil ondule le long de la planche (bruit à basse fréquence le long de y)
        for (let i = 0; i < W; i++) {
          const X = (i + 0.5) * ip;
          const P = planches[colP[i]];
          const u = colU[i], dj = colD[i];
          const warp = P.wa * WARP[i];
          let gu = u + warp;
          // un nœud : les cernes s'écartent autour
          let stain = 0;
          if (P.noeud) {
            const dx = X - P.noeud.x, dy = (Y - P.noeud.y) * 0.35;
            const dn = Math.sqrt(dx * dx + dy * dy);
            if (dn < P.noeud.r * 4) {
              gu += (P.noeud.r * 2.2 * P.noeud.r) / (dn + P.noeud.r) * Math.sign(dx || 1) * 0.35;
              stain = Math.exp(-dn / (P.noeud.r * 0.9)) * 0.5;
            }
          }
          const rings = gu * P.f * 0.55 + P.ph;
          const fr_ = rings - Math.floor(rings);
          const late = fr_ < 0.18 ? Math.sin((fr_ / 0.18) * Math.PI) : 0; // bois d'été : fin et dur
          // coups de pinceau le long des planches
          const brush = tx(Tb, X * 2.6 + bx, Y * 0.12 + by);
          // joint en V et arêtes arrondies
          let hv = 0.018 * late + 0.006 * brush;
          if (dj < 3.2) {
            const q = dj / 3.2;
            hv -= 1.1 * Math.pow(1 - q, 2.4);
          }
          hv += 0.08 * FLAT[i]; // planéité imparfaite
          const id = r0 + i;
          Hf[id] = hv;
          // la peinture, et le bois qui transparaît
          const vb = 1 + P.dv + 0.02 * brush - 0.035 * late - stain * 0.1;
          let c0 = peint[0] * vb, c1 = peint[1] * vb, c2 = peint[2] * vb * (1 - stain * 0.25);
          // usure : aux arêtes des planches (ailleurs, le seuil n'est jamais atteint)
          let w_ = 0, us = 0;
          if (dj < 6) {
            us = tx(Tu, X * 1.3 + ux, Y * 1.3 + uy);
            const aret = Math.pow(1 - dj / 6, 1.5);
            w_ = sstep(0.78, 0.98, aret * 0.9 * P.use + us * 0.5 + 0.2 * tx(Tf, X * 4 + ax, Y * 4 + ay));
          }
          if (w_ > 0) {
            const sc = us > 0.1 ? sousCouche : boisNu;
            c0 += (sc[0] - c0) * w_; c1 += (sc[1] - c1) * w_; c2 += (sc[2] - c2) * w_;
          }
          // crasse dans les joints
          const cr = dj < 2 ? (1 - dj / 2) * 0.45 : 0;
          const k3 = id * 3;
          alb[k3] = c0 * (1 - cr); alb[k3 + 1] = c1 * (1 - cr); alb[k3 + 2] = c2 * (1 - cr * 0.9);
          rough[id] = 0.34 + 0.25 * w_;
          ao[id] = dj < 2.5 ? 0.55 + 0.45 * (dj / 2.5) : 1;
        }
      }
      const N = normales(Hf, W, hb, ppm, 'tbN');
      const img = eclairer({ w: W, h: hb, alb, alpha: null, nx: N.nx, ny: N.ny, nz: N.nz, ao, rough, f0: 0.035, sol, env: 0.6 });
      // la lumière de la fenêtre : un peu plus claire en haut à gauche
      const s = img.data;
      const ja = jb - j0, jz = Math.min(hb, ja + BAND);
      for (let j = ja; j < jz; j++) {
        const gj = j + j0;
        const vy = gj / Hh;
        for (let i = 0; i < W; i++) {
          const k = (j * W + i) * 4, ko = (gj * W + i) * 4;
          const g = o.lumiere === false ? 1 : 1.04 - 0.08 * ((i / W) * 0.55 + vy * 0.45);
          od[ko] = s[k] * g; od[ko + 1] = s[k + 1] * g; od[ko + 2] = s[k + 2] * g; od[ko + 3] = 255;
        }
      }
    }
    const cB = R.canvas(W, Hh);
    cB.getContext('2d').putImageData(out, 0, 0);
    const c = R.canvas(Math.round(o.w * ppmF), Math.round(o.h * ppmF));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cB, 0, 0, c.width, c.height);
    // quelques rayures fines, plus claires (la peinture griffée)
    g.save();
    g.scale(ppmF, ppmF);
    g.lineCap = 'round';
    const nr = Math.round((o.w * o.h) / 9000);
    for (let k = 0; k < nr; k++) {
      const x0 = rng() * o.w, y0 = rng() * o.h, a = rng.range(-0.5, 0.5) + (rng() < 0.5 ? Math.PI / 2 : 0), l = rng.range(8, 40);
      g.strokeStyle = 'rgba(255,255,250,' + rng.range(0.05, 0.12).toFixed(3) + ')';
      g.lineWidth = rng.range(0.15, 0.35);
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + Math.cos(a) * l * 0.5 + rng.range(-2, 2), y0 + Math.sin(a) * l * 0.5, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
      g.stroke();
    }
    g.restore();
    c.t = performance.now() - t0;
    c.ppm = ppmF;
    return c;
  }

  /* ======================================================================
     13. La nappe (chemin de table) : lin écru, tissage toile visible, grandes fleurs
         imprimées et délavées (aquarelle rose-beige, feuillages bleu-gris), plis doux, ourlet.
     ====================================================================== */
  function imprimeFleurs(g, w, h, rng) {
    // g en mm ; des fleurs à cinq ou six grands pétales, des rameaux de feuilles, des tiges
    const aqua = (fill, a, bord) => {
      g.globalAlpha = a;
      g.fillStyle = fill;
      g.fill();
      if (bord) {
        g.globalAlpha = a * 0.55;
        g.strokeStyle = bord;
        g.lineWidth = 1.1;
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const pal = [['#C9A48E', '#A77E6C'], ['#D3AFA5', '#AC8579'], ['#C4A385', '#9E7C60'], ['#B8B0B5', '#8C8290']];
    const bleu = ['#7E90A2', '#6C8095', '#8A9AA6'];
    const tige = (x, y, a, l, c) => {
      g.globalAlpha = 0.45;
      g.strokeStyle = c;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.3) * l * 0.5, y + Math.sin(a + 0.3) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
      g.globalAlpha = 1;
    };
    const feuilleA = (x, y, a, l, c) => {
      const wv = l * rng.range(0.22, 0.32);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(l * 0.3, -wv, l * 0.75, -wv * 0.8, l, 0);
      g.bezierCurveTo(l * 0.7, wv * 0.9, l * 0.3, wv, 0, 0);
      aqua(c, rng.range(0.35, 0.55), c);
      // nervure
      g.globalAlpha = 0.25;
      g.strokeStyle = '#4E5E6E';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(l * 0.9, 0);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    };
    const rameau = (x, y, a, l) => {
      const c = rng.pick(bleu);
      tige(x, y, a, l, '#5E6E7C');
      const n = rng.int(4, 7);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1), px = x + Math.cos(a) * l * t, py = y + Math.sin(a) * l * t;
        const s = k % 2 ? 1 : -1;
        feuilleA(px, py, a + s * rng.range(0.5, 0.9), l * rng.range(0.25, 0.38) * (1 - t * 0.4), c);
      }
      feuilleA(x + Math.cos(a) * l, y + Math.sin(a) * l, a, l * 0.3, c);
    };
    const fleur = (x, y, R_) => {
      const [c, cb] = rng.pick(pal);
      const n = rng.int(5, 6), a0 = rng() * TAU;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * TAU + rng.range(-0.2, 0.2);
        const l = R_ * rng.range(0.8, 1.05), wv = R_ * rng.range(0.5, 0.65);
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.moveTo(R_ * 0.08, 0);
        g.bezierCurveTo(l * 0.35, -wv * 0.9, l * 0.95, -wv * 0.75, l, -wv * 0.1);
        g.bezierCurveTo(l * 1.02, wv * 0.4, l * 0.5, wv * 0.95, R_ * 0.08, 0);
        aqua(c, rng.range(0.38, 0.52), cb);
        // stries du pétale, plus soutenues vers le cœur
        g.globalAlpha = 0.18;
        g.strokeStyle = cb;
        g.lineWidth = 0.8;
        for (let s = -2; s <= 2; s++) {
          g.beginPath();
          g.moveTo(R_ * 0.12, 0);
          g.quadraticCurveTo(l * 0.5, s * wv * 0.18, l * 0.85, s * wv * 0.28);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.restore();
      }
      // le cœur : une tache sombre et douce, quelques traits
      g.beginPath();
      g.arc(x, y, R_ * 0.16, 0, TAU);
      aqua('#5C6573', 0.45);
      g.globalAlpha = 0.3;
      g.strokeStyle = '#4A5260';
      g.lineWidth = 0.7;
      for (let k = 0; k < 10; k++) {
        const a = rng() * TAU, l = R_ * rng.range(0.18, 0.3);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    // semis : quelques grandes fleurs, des rameaux entre elles
    const aire = w * h, nF = Math.max(3, Math.round(aire / 15000));
    const pts = [];
    for (let k = 0; k < nF * 6 && pts.length < nF; k++) {
      const p = [rng.range(0.08, 0.92) * w, rng.range(0.05, 0.95) * h];
      if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 105)) pts.push(p);
    }
    for (const p of pts) {
      for (let k = 0; k < 3; k++) rameau(p[0] + rng.range(-40, 40), p[1] + rng.range(-40, 40), rng() * TAU, rng.range(70, 130));
    }
    for (const p of pts) {
      tige(p[0], p[1], rng() * TAU, rng.range(80, 140), '#6E7880');
      fleur(p[0], p[1], rng.range(34, 52));
      if (rng() < 0.6) fleur(p[0] + rng.range(-70, 70), p[1] + rng.range(-70, 70), rng.range(18, 28));
    }
  }

  function rendreNappe(o, ppmF) {
    const t0 = performance.now();
    const ppm = Math.min(ppmF, o.ppmMax || 3.6);
    const W = Math.round(o.w * ppm), Hh = Math.round(o.h * ppm), ip = 1 / ppm;
    const rng = AC.rng(o.seed ^ 0xbb67ae85);
    // l'impression, à basse résolution (aquarelle : c'est doux)
    const pk = Math.min(1.6, ppm * 0.4);
    const Wi = Math.ceil(o.w * pk) + 2, Hi = Math.ceil(o.h * pk) + 2;
    const cI = canvas(Wi, Hi, true), gi = cI.__g;
    gi.setTransform(pk, 0, 0, pk, 0, 0);
    gi.lineCap = 'round';
    gi.lineJoin = 'round';
    imprimeFleurs(gi, o.w, o.h, rng);
    const dI = gi.getImageData(0, 0, Wi, Hi).data;
    const lin = hexLin(o.couleur || '#DCD3C3');
    const Tp = tuile(13, 4, 2), Tt = tuile(14, 64, 1);
    const [nx0, ny0] = ofs(o.seed, 41), [px0, py0] = ofs(o.seed, 42);
    const per = o.trame || 1.25; // période du tissage (mm)
    const out = new ImageData(W, Hh), od = out.data;
    const BAND = 96;
    // plis doux : deux ou trois ondulations obliques très larges
    const plis = [];
    for (let k = 0; k < 3; k++) plis.push({ a: rng.range(-0.5, 0.5) + (rng() < 0.5 ? 0 : Math.PI / 2), f: rng.range(0.018, 0.035), ph: rng() * TAU, amp: rng.range(0.4, 1.0) });
    const ourlet = o.ourlet === false ? 0 : 13;
    const NP = plis.length, PS = new Float32Array(NP * W), PC = new Float32Array(NP * W), RS = new Float32Array(NP), RC = new Float32Array(NP);
    const HW = new Float32Array(W);
    for (let i = 0; i < W; i++) {
      const X = (i + 0.5) * ip;
      HW[i] = hash2(Math.floor(X / per), 0, 5);
      for (let q = 0; q < NP; q++) {
        const a = X * Math.cos(plis[q].a) * plis[q].f;
        PS[q * W + i] = Math.sin(a);
        PC[q * W + i] = Math.cos(a);
      }
    }
    for (let jb = 0; jb < Hh; jb += BAND) {
      const j0 = Math.max(0, jb - 1), j1 = Math.min(Hh, jb + BAND + 1), hb = j1 - j0, n = W * hb;
      const Hf = tampon('n.H', n, Float32Array, false), alb = tampon('n.alb', n * 3, Float32Array, false), ao = tampon('n.ao', n, Float32Array, false);
      for (let j = j0; j < j1; j++) {
        const Y = (j + 0.5) * ip;
        const r0 = (j - j0) * W;
        const tj = Math.floor(Y / per), fy = Y / per - tj;
        const hfL = hash2(0, tj, 6);
        for (let q = 0; q < NP; q++) {
          const P = plis[q], b = Y * Math.sin(P.a) * P.f + P.ph;
          RS[q] = P.amp * Math.sin(b);
          RC[q] = P.amp * Math.cos(b);
        }
        for (let i = 0; i < W; i++) {
          const X = (i + 0.5) * ip;
          const ti = Math.floor(X / per), fx = X / per - ti;
          // fils irréguliers : épaisseur et teinte propres à chaque fil, flammes le long du fil
          const hw = HW[i], hf = hfL;
          const epW = 0.78 + 0.3 * hw + 0.3 * tx(Tt, ti * 4.1, Y * 0.55 + ny0);
          const epF = 0.78 + 0.3 * hf + 0.3 * tx(Tt, X * 0.55 + nx0, tj * 4.1);
          const dW = Math.abs(fx - 0.5) * 2 / epW, dF = Math.abs(fy - 0.5) * 2 / epF;
          const pW = dW < 1 ? Math.sqrt(1 - dW * dW) : 0, pF = dF < 1 ? Math.sqrt(1 - dF * dF) : 0;
          const dessus = ((ti + tj) & 1) === 0; // armure toile : dessus/dessous en damier
          const hW = pW * (dessus ? 1 : 0.55) * (0.75 + 0.25 * Math.cos(fy * Math.PI * 2 - (dessus ? 0 : Math.PI)));
          const hF = pF * (dessus ? 0.55 : 1) * (0.75 + 0.25 * Math.cos(fx * Math.PI * 2 - (dessus ? Math.PI : 0)));
          const fil = hW > hF ? 0 : 1;
          const ht = Math.max(hW, hF);
          // plis : sin(a + b) = sin a cos b + cos a sin b, a par colonne, b par ligne
          let hp = 0;
          for (let q = 0, qo = 0; q < NP; q++, qo += W) hp += PS[qo + i] * RC[q] + PC[qo + i] * RS[q];
          hp += 0.6 * tx(Tp, X * 1.2 + px0, Y * 1.2 + py0);
          // ourlet : un pli franc près des bords
          let hq = 0;
          if (ourlet) {
            const de = Math.min(X, Y, o.w - X, o.h - Y);
            if (de < ourlet + 2) hq = 0.35 * Math.exp(-Math.pow((de - ourlet) / 0.9, 2)) + (de < ourlet ? 0.25 : 0);
          }
          const id = r0 + i;
          Hf[id] = hp + ht * 0.16 + hq;
          // couleur : lin chiné (fils plus ou moins clairs), impression absorbée par les fibres
          const vf = (fil ? 0.92 + 0.14 * hf : 0.92 + 0.14 * hw) * (0.97 + 0.06 * ht);
          let c0 = lin[0] * vf, c1 = lin[1] * vf, c2 = lin[2] * vf * 0.99;
          const ii = Math.min(Wi - 2, X * pk), jj = Math.min(Hi - 2, Y * pk);
          const i0 = ii | 0, j0_ = jj | 0, fu = ii - i0, fv = jj - j0_;
          const q00 = (j0_ * Wi + i0) * 4, q10 = q00 + 4, q01 = q00 + Wi * 4, q11 = q01 + 4;
          const w00 = (1 - fu) * (1 - fv) * dI[q00 + 3], w10 = fu * (1 - fv) * dI[q10 + 3], w01 = (1 - fu) * fv * dI[q01 + 3], w11 = fu * fv * dI[q11 + 3];
          const sa = w00 + w10 + w01 + w11;
          if (sa > 1) {
            const pa = sa / 255, is = 1 / sa;
            const pr = (w00 * dI[q00] + w10 * dI[q10] + w01 * dI[q01] + w11 * dI[q11]) * is;
            const pg = (w00 * dI[q00 + 1] + w10 * dI[q10 + 1] + w01 * dI[q01 + 1] + w11 * dI[q11 + 1]) * is;
            const pb = (w00 * dI[q00 + 2] + w10 * dI[q10 + 2] + w01 * dI[q01 + 2] + w11 * dI[q11 + 2]) * is;
            const k_ = Math.min(1, pa * (0.62 + 0.38 * ht)); // plus d'encre sur le dessus des fils
            c0 *= 1 - k_ + k_ * Math.min(1, LIN8[pr | 0] / lin[0]);
            c1 *= 1 - k_ + k_ * Math.min(1, LIN8[pg | 0] / lin[1]);
            c2 *= 1 - k_ + k_ * Math.min(1, LIN8[pb | 0] / lin[2]);
          }
          const k3 = id * 3;
          alb[k3] = c0; alb[k3 + 1] = c1; alb[k3 + 2] = c2;
          ao[id] = 0.86 + 0.14 * ht; // les creux entre les fils
        }
      }
      const N = normales(Hf, W, hb, ppm, 'nN');
      const img = eclairer({ w: W, h: hb, alb, alpha: null, nx: N.nx, ny: N.ny, nz: N.nz, ao, rough: 0.9, f0: 0.02, env: 0.4, wrap: 0.4 });
      const s = img.data;
      const ja = jb - j0, jz = Math.min(hb, ja + BAND);
      for (let j = ja; j < jz; j++) {
        const gj = j + j0;
        s.subarray ? od.set(s.subarray(j * W * 4, (j + 1) * W * 4), gj * W * 4) : 0;
      }
    }
    let c = R.canvas(W, Hh);
    c.getContext('2d').putImageData(out, 0, 0);
    if (ppm !== ppmF) {
      const c2 = R.canvas(Math.round(o.w * ppmF), Math.round(o.h * ppmF)), g2 = c2.getContext('2d');
      g2.imageSmoothingEnabled = true;
      g2.imageSmoothingQuality = 'high';
      g2.drawImage(c, 0, 0, c2.width, c2.height);
      c = c2;
    }
    c.t = performance.now() - t0;
    c.ppm = ppmF;
    return c;
  }

  /* ======================================================================
     14. Le set de table rond en rotin (jacinthe d'eau tressée) : une tresse à chevrons
         enroulée en spirale, brins fibreux, jours sombres entre les brins.
     ====================================================================== */
  function rendreRotin(o, ppm) {
    const t0 = performance.now();
    const Rr = o.d / 2, bw = o.tresse || 17;
    const fr = cadre(ppm, -Rr - 1, -Rr - 1, Rr + 1, Rr + 1, 8, 0.8);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    const Hf = tampon('r.H', n), alpha = tampon('r.a', n), alb = tampon('r.alb', n * 3, Float32Array, false), ao = tampon('r.ao', n, Float32Array, false);
    const pal = [hexLin('#C9A46C'), hexLin('#BD985F'), hexLin('#D1AF7A'), hexLin('#B38D59'), hexLin('#C6A675')];
    const segL = bw * 1.25, ang = 0.52, ca = Math.cos(ang), sa = Math.sin(ang);
    const Tf = tuile(15, 32, 2);
    const [fx0, fy0] = ofs(o.seed, 51);
    const r0 = 6;
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const X = fr.bx0 + (i + 0.5) * ip;
        const rho = Math.sqrt(X * X + Y * Y);
        const e = Rr - rho;
        const al = e * ppm + 0.5;
        if (al <= 0) continue;
        const id = j * w + i;
        alpha[id] = al > 1 ? 1 : al;
        const th = fatan2(Y, X);
        // anneaux de tresse concentriques ; chaque tour compte un nombre pair de maillons
        const sp = rho - r0;
        const ring = Math.floor(sp / bw);
        const v = (sp - ring * bw) / bw - 0.5; // en travers de la tresse (−0,5..0,5)
        const rm = r0 + (ring + 0.5) * bw;
        const nM = Math.max(4, 2 * Math.round((TAU * Math.max(rm, 6)) / segL));
        const segLr = (TAU * Math.max(rm, 6) * 2) / nM;
        const u = ((th + Math.PI) / TAU) * nM * segLr * 0.5 + (ring & 1) * segLr * 0.25; // le long de la tresse (mm)
        const sI = Math.floor(u / (segLr * 0.5));
        let best = -1, bs = 0, bd = 0;
        for (let q = sI - 1; q <= sI + 1; q++) {
          const uc = (q + 0.5) * segLr * 0.5;
          const du = u - uc, dv = v * bw;
          const sgn = q & 1 ? 1 : -1;
          const a1 = du * ca + dv * sa * sgn, a2 = -du * sa * sgn + dv * ca;
          const L = segLr * 0.6, Wd = bw * 0.46;
          const dd = (a1 * a1) / (L * L) + (a2 * a2) / (Wd * Wd);
          if (dd < 1) {
            const hb = 3.4 * Math.sqrt(1 - dd) + (q & 1 ? 0.25 : 0);
            if (hb > best) { best = hb; bs = q; bd = a2 / Wd; }
          }
        }
        const fib = tx(Tf, (X * 3 + fx0) * (1 + 0.1 * bd), (Y * 3 + fy0));
        let hv = best > 0 ? best + 0.18 * Math.sin(bd * 11 + (bs & 7)) + 0.12 * fib : 0.2;
        // bord extérieur arrondi
        if (e < 4) hv *= 0.55 + 0.45 * (e / 4);
        Hf[id] = hv + 2;
        const c = pal[(hash2(((bs % nM) + nM) % nM, ring, o.seed) * pal.length) | 0];
        const var_ = best > 0 ? 0.92 + 0.14 * hash2(bs, ring, 7) + 0.06 * fib : 0.42;
        alb[id * 3] = c[0] * var_; alb[id * 3 + 1] = c[1] * var_; alb[id * 3 + 2] = c[2] * var_;
        ao[id] = best > 0 ? 0.62 + 0.38 * Math.min(1, best / 2.2) : 0.45;
      }
    }
    const N = normales(Hf, w, h, ppm, 'rN');
    const img = eclairer({ w, h, alb, alpha, nx: N.nx, ny: N.ny, nz: N.nz, ao, rough: 0.55, f0: 0.03, env: 0.5, wrap: 0.35 });
    const sp = sprite(fr, img, alpha, { height: 8, soft: 0.8, opacity: 0.4, contact: 0.35 }, { d: o.d, R: Rr, haut: 8 });
    sp.t = { tout: performance.now() - t0 };
    return sp;
  }

  /* ======================================================================
     15. La théière vue de dessus : corps tourné, couvercle et bouton, bec à gauche,
         anse à droite ; porcelaine fleurie (bouquets sur l'épaule, filets d'or) ou fonte.
     ====================================================================== */
  function rendreTheiere(o, ppm) {
    const t0 = performance.now();
    const t = TILT();
    const k = (o.d || 150) / 150;
    const fonte = o.matiere === 'fonte';
    // un solide plein : corps, épaule, couvercle, bouton (z, ρ)
    const ext = [[0, 40], [2.5, 43], [10, 58], [22, 70], [36, 75], [50, 73.5], [62, 66], [72, 55], [78, 46], [80, 44.5], [80.6, 43], [81.8, 42.6], [84, 40], [88, 33], [91, 22], [92.5, 12], [93, 7], [94, 7.4], [97, 8.6], [100, 7.6], [102, 4.5], [103, 0.5]].map(([z, r]) => [z * k, r * k]);
    const fo = monotone(ext);
    const H = 103 * k, zCouv = 80.7 * k;
    const Z = [], Ro = [];
    for (let z = 0; z <= H; z += z < 76 * k ? 0.5 : 0.12) { Z.push(z); Ro.push(fo(z)); }
    const K = Z.length;
    const dRo = new Float32Array(K);
    for (let q = 0; q < K; q++) { const a = Math.max(0, q - 1), b = Math.min(K - 1, q + 1); dRo[q] = (Ro[b] - Ro[a]) / (Z[b] - Z[a]); }
    const prof = { K, Z: Float32Array.from(Z), Ro: Float32Array.from(Ro), Ri: new Float32Array(K), dRo };
    // bec (à gauche) et anse (à droite) : tubes
    const bec = crPts([[-68, 26, 11.5], [-80, 34, 9.5], [-92, 48, 7.5], [-101, 62, 6], [-108, 72, 5]].map(([x, z, r]) => [x * k, z * k]), 6).map((p, i, A) => [p[0], 0, p[1], (11.5 - 6.5 * (i / (A.length - 1))) * k]);
    const anse = crPts([[66, 64], [84, 66], [102, 56], [104, 36], [92, 20], [70, 16]].map(([x, z]) => [x * k, z * k]), 6).map((p) => [p[0], 0, p[1], 6.2 * k]);
    const Rm = 76 * k;
    const fr = cadre(ppm, -118 * k, -Rm - t * 60 * k - 2, 112 * k, Rm + 2, H, 0.55);
    const w = fr.w, h = fr.h, n = w * h, ip = 1 / ppm;
    const zb = tampon('th.zb', n, Float32Array, false).fill(-1e9), kb = tampon('th.kb', n, Int32Array, false), part = tampon('th.p', n, Uint8Array), alpha = tampon('th.a', n);
    const bufs = { zb, kb, part, alpha };
    const sil = tourner(prof, fr, t, bufs, { id: 1 });
    alphaTour(sil, fr, alpha);
    const hN = { nx: tampon('th.hx', n, Float32Array, false), ny: tampon('th.hy', n, Float32Array, false), nz: tampon('th.hz', n, Float32Array, false), s: tampon('th.hs', n, Float32Array, false) };
    tube(bec, fr, t, bufs, 2, hN);
    tube(anse, fr, t, bufs, 3, hN);
    // décor de l'épaule (vue de dessus, en coordonnées de l'objet)
    const motif = fonte ? null : o.motif || 'rose';
    const ink = motif ? ENCRES[motif] : null;
    let decD = null;
    if (ink) {
      const cD = canvas(w, h, true), g = cD.__g;
      g.setTransform(ppm, 0, 0, ppm, -fr.bx0 * ppm, -fr.by0 * ppm);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const r = AC.rng(o.seed ^ 0x3c6ef372);
      const st = { c: ink.c, cf: ink.cf || null, cb: ink.cb || null, cl: ink.cl || null, cfeu: ink.cfeu || null, r, dent: 0.6 };
      const nG = 5, ph = r() * TAU;
      for (let q = 0; q < nG; q++) gerbe(g, st, 58 * k, ph + (q / nG) * TAU, (TAU / nG) * 0.33, 9 * k, 1);
      bouquet(g, st, 0, 0, 24 * k, r() * TAU);
      decD = g.getImageData(0, 0, w, h).data;
    }
    const base = hexLin(fonte ? '#2B2623' : PORCELAINE);
    const lnB = base.map(Math.log);
    const nx = tampon('th.nx', n, Float32Array, false), ny = tampon('th.ny', n, Float32Array, false), nz = tampon('th.nz', n, Float32Array, false);
    const alb = tampon('th.alb', n * 3, Float32Array, false), rough = tampon('th.rg', n, Float32Array, false), met = tampon('th.m', n), ao = tampon('th.ao', n, Float32Array, false);
    const Tf = tuile(16, 16, 2);
    for (let j = 0; j < h; j++) {
      const Y = fr.by0 + (j + 0.5) * ip;
      for (let i = 0; i < w; i++) {
        const id = j * w + i;
        if (alpha[id] <= 0) continue;
        const pz = zb[id];
        if (pz < -1e8) { alpha[id] = 0; continue; }
        const px = fr.bx0 + (i + 0.5) * ip, py = Y + t * pz;
        let Nx, Ny, Nz;
        if (part[id] >= 2) { Nx = hN.nx[id]; Ny = hN.ny[id]; Nz = hN.nz[id]; }
        else {
          const rho = Math.sqrt(px * px + py * py) || 1e-6, q = kb[id];
          const l = 1 / Math.sqrt(1 + dRo[q] * dRo[q]);
          Nx = (px / rho) * l; Ny = (py / rho) * l; Nz = -dRo[q] * l;
          if (Nz < 0.05 && pz > H - 1) Nz = 1;
        }
        nx[id] = Nx; ny[id] = Ny; nz[id] = Nz;
        let c0 = base[0], c1 = base[1], c2 = base[2], rg = fonte ? 0.45 : 0.03, m = 0;
        if (fonte) {
          const f = 0.85 + 0.3 * tx(Tf, px * 8, py * 8);
          c0 *= f; c1 *= f; c2 *= f;
        } else {
          // filets d'or : bord du couvercle, bouton, bec, anse
          const onLid = part[id] === 1 && pz > zCouv - 0.8 * k && pz < zCouv + 1.2 * k;
          const onKnob = part[id] === 1 && pz > 93.5 * k;
          const onTube = part[id] >= 2 && Nz > 0.88;
          if (onLid || onKnob || onTube) m = 0.85;
          else if (decD && part[id] === 1) {
            // le décor est dessiné en coordonnées de l'objet : on lit au point (px, py)
            const di = Math.round((px - fr.bx0) * ppm - 0.5), dj = Math.round((py - fr.by0) * ppm - 0.5);
            if (di >= 0 && dj >= 0 && di < w && dj < h) {
              const q4 = (dj * w + di) * 4, a = decD[q4 + 3] / 255;
              if (a > 0) {
                c0 *= Math.exp(a * Math.min(0, LN8[decD[q4]] - lnB[0]));
                c1 *= Math.exp(a * Math.min(0, LN8[decD[q4 + 1]] - lnB[1]));
                c2 *= Math.exp(a * Math.min(0, LN8[decD[q4 + 2]] - lnB[2]));
              }
            }
          }
          if (m > 0) { c0 += (OR[0] - c0) * m; c1 += (OR[1] - c1) * m; c2 += (OR[2] - c2) * m; rg = 0.22; }
        }
        alb[id * 3] = c0; alb[id * 3 + 1] = c1; alb[id * 3 + 2] = c2;
        rough[id] = rg; met[id] = m;
        ao[id] = part[id] === 1 && Math.abs(pz - zCouv) < 1.2 * k ? 0.6 : 0.62 + 0.38 * sstep(0, 25 * k, pz);
      }
    }
    const img = eclairer({ w, h, alb, alpha, nx, ny, nz, ao, rough, met, f0: fonte ? 0.04 : 0.045, sol: o.sol ? hexLin(o.sol) : null });
    const sp = sprite(fr, img, alpha, { height: 75 * k, soft: 0.55, opacity: 0.36, contact: 0.34 }, { H });
    sp.t = { tout: performance.now() - t0 };
    return sp;
  }

  /* ======================================================================
     API publique (complétée plus bas)
     ====================================================================== */
  const V = (AC.Vaisselle = AC.Vaisselle || {});
  V.version = 1;

  V.assiette = function (opts = {}, ppm = 4) {
    const o = Object.assign({ motif: 'bleu', d: 200, chantourne: true, seed: 1 }, opts);
    const key = ['vais:assiette', o.motif, o.d, o.chantourne ? 1 : 0, o.seed, o.sol || '', q20(ppm), TILT()].join('|');
    return R.memo(key, () => faience('assiette', o, ppm));
  };

  function soucoupeMemo(opts, ppm) {
    const o = Object.assign({ motif: 'bleu', d: 140, chantourne: false, seed: 1 }, opts);
    const tr = o.trou ? [o.trou.x, o.trou.y, o.trou.r].map((v) => v.toFixed(1)).join(',') : '';
    const key = ['vais:soucoupe', o.motif, o.d, o.chantourne ? 1 : 0, o.seed, o.sol || '', tr, q20(ppm), TILT()].join('|');
    return R.memo(key, () => faience('soucoupe', o, ppm));
  }
  V.soucoupe = function (opts = {}, ppm = 4) {
    return soucoupeMemo(Object.assign({}, opts, { trou: null }), ppm);
  };

  /** Tasse (ou bol) vue de dessus, anse à droite.
      → { sprite, inner: {cx, cy, r} (disque du liquide, mm dans le repère du sprite), clip: {cx, cy, r}
          (cercle de découpe : l'ouverture, le bord cache le liquide au-delà), niveau(f) → {cx, cy, r, z} } */
  function tasseMemo(opts, ppm) {
    const o = Object.assign({ motif: 'rose', style: 'tasse', seed: 1 }, opts);
    if (o.sous == null) delete o.sous;
    const key = ['vais:tasse', o.motif, o.style, o.d || '', o.seed, o.sol || '', o.blanc || '', o.sous != null ? o.sous : '', q20(ppm), TILT()].join('|');
    return R.memo(key, () => rendreTasse(o, ppm));
  }
  V.tasse = function (opts = {}, ppm = 4) {
    return tasseMemo(Object.assign({}, opts, { sous: null }), ppm);
  };

  const B = (AC.Boissons = AC.Boissons || {});
  B.CRUS = CRUS;
  B.THES = THES;
  /** Le liquide vu de dessus : disque de rayon r mm → canvas (2r mm de côté, .r, .ppm) */
  B.surface = function (id, { r = 40, seed = 1 } = {}, ppm = 4) {
    return surfaceMemo(id, r, seed, ppm);
  };
  /** La boisson versée dans une tasse (résultat de V.tasse) → sprite */
  const DANS = new WeakMap(); // identifiant unique de chaque tasse (pour les clés de cache)
  let nDans = 0;
  B.dans = function (tasse, id, opts = {}, ppm = 4) {
    if (!DANS.has(tasse)) DANS.set(tasse, ++nDans);
    return memoLimite(['vais:dans', id, DANS.get(tasse), opts.niveau != null ? opts.niveau : '', opts.seed || 1, q20(ppm)].join('|'), () => verserTasse(tasse, id, opts, ppm), 'vais:dans', 12);
  };

  /** Petite cuillère ancienne en argent, manche ciselé (cuilleron en bas) → sprite (.bol : centre du cuilleron) */
  V.cuillere = function (opts = {}, ppm = 4) {
    const o = Object.assign({ l: 125, seed: 1 }, opts);
    const key = ['vais:cuillere', o.l, o.seed, o.sol || '', q20(ppm), TILT()].join('|');
    return R.memo(key, () => rendreCuillere(o, ppm));
  };

  /** Verre (gobelet ou bocal), vide ou avec une boisson (opts.boisson = id) → { sprite, inner } */
  V.verre = function (opts = {}, ppm = 4) {
    const o = Object.assign({ style: 'gobelet', seed: 1 }, opts);
    const key = ['vais:verre', o.style, o.d || '', o.seed, o.boisson || '', o.bseed || '', o.niveau != null ? o.niveau : '', o.sol || '', q20(ppm), TILT()].join('|');
    return memoLimite(key, () => rendreVerre(o, ppm), 'vais:verre', 12);
  };
  B.liste = LISTE;
  B.recette = recette;
  /** La boisson complète, dans son contenant (tasse + soucoupe + cuillère posée, ou verre) → sprite */
  B.servir = function (id, opts = {}, ppm = 4) {
    const o = Object.assign({ seed: 1 }, opts);
    const key = ['vais:servir', id, o.seed, o.cuillere === false ? 0 : 1, o.soucoupe === false ? 0 : 1, o.niveau != null ? o.niveau : '', o.sol || '', o.contenant ? JSON.stringify(o.contenant) : '', q20(ppm), TILT()].join('|');
    return memoLimite(key, () => servir(id, o, ppm), 'vais:servir', 12);
  };

  /** La table en planches peintes (w × h mm) → canvas opaque */
  V.table = function (opts = {}, ppm = 4) {
    const o = Object.assign({ bois: 'menthe', w: 400, h: 300, seed: 1 }, opts);
    const key = ['vais:table', o.bois, o.w, o.h, o.seed, o.lumiere === false ? 0 : 1, q20(ppm)].join('|');
    return R.memo(key, () => rendreTable(o, ppm));
  };
  /** La nappe (chemin de table) en lin fleuri (w × h mm) → canvas opaque */
  V.nappe = function (opts = {}, ppm = 4) {
    const o = Object.assign({ w: 380, h: 260, seed: 1 }, opts);
    const key = ['vais:nappe', o.w, o.h, o.seed, o.couleur || '', o.ourlet === false ? 0 : 1, q20(ppm)].join('|');
    return R.memo(key, () => rendreNappe(o, ppm));
  };
  /** Set de table rond en rotin tressé → sprite */
  V.rotin = function (opts = {}, ppm = 4) {
    const o = Object.assign({ d: 330, seed: 1 }, opts);
    const key = ['vais:rotin', o.d, o.seed, q20(ppm)].join('|');
    return R.memo(key, () => rendreRotin(o, ppm));
  };
  /** Petite théière vue de dessus (porcelaine fleurie, ou matiere: 'fonte') → sprite */
  V.theiere = function (opts = {}, ppm = 4) {
    const o = Object.assign({ seed: 1, motif: 'rose' }, opts);
    const key = ['vais:theiere', o.seed, o.motif, o.matiere || '', o.d || '', o.sol || '', q20(ppm), TILT()].join('|');
    return R.memo(key, () => rendreTheiere(o, ppm));
  };

  /**
   * Ombre d'un sprite tourné d'un angle rot (la cuillère qui tourne dans la tasse) : l'ombre part
   * toujours vers le bas à droite. → { canvas, dx, dy } : dessiner canvas en (x + dx, y + dy) px,
   * agrandi k fois (canvas.k), où (x, y) est la position de l'ancre du sprite. haut : hauteur (mm).
   * Exemple : const o = V.ombreTournee(cuil, a, ppm, 8);
   *           ctx.drawImage(o.canvas, x + o.dx, y + o.dy, o.canvas.width * o.k, o.canvas.height * o.k);
   *           ctx.save(); ctx.translate(x, y); ctx.rotate(a); R.draw(ctx, cuil, 0, 0, { shadow: false }); ctx.restore();
   */
  V.ombreTournee = function (sp, rot, ppm, haut = 8) {
    const q = Math.round((((rot % TAU) + TAU) % TAU) / (TAU / 180)); // un calcul tous les 2°
    const cle = 'vais:ombreT|' + (sp.canvas.__id || (sp.canvas.__id = Math.random().toString(36).slice(2))) + '|' + q + '|' + haut;
    return memoLimite(cle, () => {
      const o = ombreTournee(sp, (q * TAU) / 180, haut, ppm);
      return o ? { canvas: o.c, dx: o.x0, dy: o.y0, k: o.k } : null;
    }, 'vais:ombreT', 200);
  };

  /**
   * Précalcule des boissons servies pendant les temps morts (requestIdleCallback), une par tranche,
   * pour que le choix d'une boisson soit instantané. fini() est appelé à la fin.
   */
  V.prechauffer = function (ids, ppm, fini, opts = {}) {
    const file = ids.slice();
    const planifier = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 400 }) : setTimeout(f, 30));
    const etape = () => {
      const id = file.shift();
      if (id) {
        try { B.servir(id, Object.assign({ seed: 1 }, opts), ppm); } catch (e) { /* on continue */ }
      }
      if (file.length) planifier(etape);
      else if (fini) fini();
    };
    planifier(etape);
  };

  // outils internes exposés (pour les autres modules et la page de contrôle)
  V._ = { eclairer, envRad, cadre, sprite, ombrePortee, ombresRelief, tuile, tx, enc, fatan2, hash2, sstep, clamp01, lerp, hexLin, crPts, trait, feuille, rose, bouton, fleurette, volute, fougere, brindille, gerbe, bouquet, vermicule, rgba, canvas, ENCRES, OR, TILT };
})();

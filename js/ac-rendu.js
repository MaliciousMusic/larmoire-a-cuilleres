/* ==========================================================================
   L'Armoire à Cuillères — le rendu « à plat, vu de dessus » de la table du goûter
   Tout ce qui se pose sur la table (vaisselle, boissons, gâteaux) est calculé
   pixel par pixel dans un canvas, avec la même lumière : une fenêtre en haut à
   gauche, lumière chaude, ombres douces vers le bas à droite.

   Repère : millimètres, vu de dessus ; x vers la droite, y vers le bas, z vers l'œil.
   ppm = pixels par millimètre (≈ 2,2 × devicePixelRatio pour une tasse de 9 cm
   affichée à ~200 px de large).

   Un « sprite » : { canvas, shadow, w, h, ax, ay }
     canvas  : l'objet éclairé (RGBA, fond transparent)
     shadow  : son ombre portée (RGBA noir/brun, déjà floutée et décalée), ou null
     w, h    : taille en mm ;  ax, ay : position du centre de l'objet dans le canvas (mm)
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});

  const L = (() => { // vers la lumière
    const v = [-0.45, -0.55, 0.7];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();
  const H = (() => { // demi-vecteur lumière / œil (l'œil est au zénith)
    const v = [L[0], L[1], L[2] + 1];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();

  // table linéaire → sRGB (γ 2,2), interpolée par R.shade
  const SRGB_N = 8192, SRGB = new Float32Array(SRGB_N + 2);
  for (let i = 0; i <= SRGB_N + 1; i++) SRGB[i] = Math.pow(Math.min(1, i / SRGB_N), 1 / 2.2) * 255;

  const R = {
    L, H,
    WARM: [1.0, 0.955, 0.885], // teinte de la lumière (multiplie l'albédo)
    FILL: [0.93, 0.95, 1.0], // teinte de l'ambiance (un peu froide, la rue)
    AMBIENT: 0.38,
    /** Ombre portée par défaut : décalage vers le bas à droite, en mm par mm de hauteur */
    SHADOW_DIR: [0.62, 0.78],
    SHADOW_COLOR: [48, 30, 22],

    /** Un canvas de w × h pixels (arrondis) */
    canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      return c;
    },

    /** ppm conseillé pour un objet de `mm` millimètres affiché à `px` pixels CSS */
    ppmFor(mm, px) {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      return (px * dpr) / mm;
    },

    /** fBm à partir d'un bruit simplex seedé (AC.noise2(seed)) → environ [-1, 1] */
    fbm(noise, x, y, oct = 4, lac = 2.0, gain = 0.5) {
      let a = 1, f = 1, s = 0, n = 0;
      for (let i = 0; i < oct; i++) {
        s += a * noise(x * f, y * f);
        n += a;
        a *= gain;
        f *= lac;
      }
      return s / n;
    },

    /** Relief (hauteur en mm, Float32Array w*h) → normales (3 Float32Array). k : pixels par mm */
    normals(Hf, w, h, k) {
      const nx = new Float32Array(w * h), ny = new Float32Array(w * h), nz = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
        for (let x = 0; x < w; x++) {
          const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
          const dx = ((Hf[y * w + x1] - Hf[y * w + x0]) * k) / (x1 - x0 || 1);
          const dy = ((Hf[y1 * w + x] - Hf[y0 * w + x]) * k) / (y1 - y0 || 1);
          const i = y * w + x;
          const l = Math.sqrt(dx * dx + dy * dy + 1); // (= Math.hypot(dx, dy, 1), 7× plus rapide)
          nx[i] = -dx / l;
          ny[i] = -dy / l;
          nz[i] = 1 / l;
        }
      }
      return { nx, ny, nz };
    },

    /**
     * Éclaire un objet. Toutes les entrées sont des tableaux w*h :
     *   alb   : Float32Array w*h*3, albédo linéaire [0..1] (r, g, b entrelacés)
     *   alpha : Float32Array w*h (0..1)
     *   N     : { nx, ny, nz } (sinon : plat, face à l'œil)
     *   spec  : force du reflet (nombre ou Float32Array), gloss : exposant (nombre ou tableau)
     *   ao    : occlusion ambiante (tableau 0..1, 1 = dégagé) ; wrap : lumière enveloppante (0..1)
     *   shadow: (facultatif) ombre propre, tableau 0..1 (1 = au soleil) : n'éteint que la lumière
     *           directe et le reflet, pas l'ambiance (voir R.sunShadow)
     * Renvoie un ImageData prêt à poser.
     */
    shade({ w, h, alb, alpha, N, spec = 0, gloss = 30, ao = null, wrap = 0.25, sheen = 0, shadow = null }) {
      // (boucle écrite « à plat » : variables locales, canaux déroulés, sRGB par table ;
      //  même calcul qu'avant à ±2/255 près, ~10× plus rapide tant que le JIT n'a pas chauffé)
      const img = new ImageData(w, h);
      const d = img.data;
      const W = R.WARM, F = R.FILL, A = R.AMBIENT;
      const W0 = W[0] * 0.82, W1 = W[1] * 0.82, W2 = W[2] * 0.82, F0 = A * F[0], F1 = A * F[1], F2 = A * F[2];
      const specArr = typeof spec !== 'number', glossArr = typeof gloss !== 'number';
      const specN = specArr ? 0 : spec, glossN = glossArr ? 0 : gloss;
      const NX = N ? N.nx : null, NY = N ? N.ny : null, NZ = N ? N.nz : null;
      const L0 = L[0], L1 = L[1], L2 = L[2], H0 = H[0], H1 = H[1], H2 = H[2];
      const iw = 1 / (1 + wrap), S = SRGB, SN = SRGB_N;
      for (let i = 0, n = w * h; i < n; i++) {
        const a = alpha ? alpha[i] : 1;
        if (a <= 0.001) continue;
        let nx = 0, ny = 0, nz = 1;
        if (NX) { nx = NX[i]; ny = NY[i]; nz = NZ[i]; }
        const ndl = nx * L0 + ny * L1 + nz * L2;
        const sh = shadow ? shadow[i] : 1;
        let diff = (ndl + wrap) * iw;
        if (diff < 0) diff = 0;
        diff *= sh;
        const o = ao ? ao[i] : 1;
        const s = (specArr ? spec[i] : specN) * sh;
        let sp = 0;
        if (s > 0 && ndl > 0) {
          const g = glossArr ? gloss[i] : glossN;
          let ndh = nx * H0 + ny * H1 + nz * H2;
          if (ndh < 0) ndh = 0;
          sp = s * Math.pow(ndh, g);
        }
        // un voile de bord (tissu, sucre glace, mousse) : plus clair quand la surface se détourne
        const rim = sheen ? sheen * (1 - nz) * (1 - nz) : 0;
        const amb = 0.55 + 0.45 * o, dif = diff * o;
        const j = i * 3, k = i * 4;
        // linéaire → sRGB (table interpolée)
        let x = (alb[j] * (dif * W0 + F0 * amb + rim) + sp * W[0]) * SN;
        let xi = x <= 0 ? 0 : x >= SN ? SN : x | 0;
        d[k] = x <= 0 ? 0 : x >= SN ? 255 : S[xi] + (S[xi + 1] - S[xi]) * (x - xi);
        x = (alb[j + 1] * (dif * W1 + F1 * amb + rim) + sp * W[1]) * SN;
        xi = x <= 0 ? 0 : x >= SN ? SN : x | 0;
        d[k + 1] = x <= 0 ? 0 : x >= SN ? 255 : S[xi] + (S[xi + 1] - S[xi]) * (x - xi);
        x = (alb[j + 2] * (dif * W2 + F2 * amb + rim) + sp * W[2]) * SN;
        xi = x <= 0 ? 0 : x >= SN ? SN : x | 0;
        d[k + 2] = x <= 0 ? 0 : x >= SN ? 255 : S[xi] + (S[xi + 1] - S[xi]) * (x - xi);
        d[k + 3] = a * 255;
      }
      return img;
    },

    /** sRGB '#rrggbb' → linéaire [r, g, b] */
    lin(hex) {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
    },

    /** Flou gaussien approché (trois flous boîte) d'un tableau w*h, en place. r en pixels */
    blur(a, w, h, r) {
      if (r < 0.5) return a;
      const t = new Float32Array(a.length);
      const boxes = (() => { // rayons de trois boîtes équivalentes à un gaussien de sigma r
        const wIdeal = Math.sqrt((12 * r * r) / 3 + 1);
        let wl = Math.floor(wIdeal);
        if (wl % 2 === 0) wl--;
        const wu = wl + 2;
        const m = Math.round((12 * r * r - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
        return [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2);
      })();
      // (mêmes opérations dans le même ordre qu'une boîte glissante ligne par ligne puis colonne
      //  par colonne : résultat identique au bit près ; les colonnes avancent ensemble, en mémoire)
      const passH = (src, dst, br) => {
        const iarr = 1 / (br + br + 1), last = w - 1;
        for (let o = 0; o < h; o++) {
          const row = o * w;
          let acc = 0;
          for (let p = -br; p <= br; p++) acc += src[row + (p < 0 ? 0 : p > last ? last : p)];
          for (let p = 0; p < w; p++) {
            dst[row + p] = acc * iarr;
            const pa = p + br + 1, pb = p - br;
            acc += src[row + (pa > last ? last : pa)] - src[row + (pb < 0 ? 0 : pb)];
          }
        }
      };
      const col = new Float64Array(w);
      const passV = (src, dst, br) => {
        const iarr = 1 / (br + br + 1), last = h - 1;
        col.fill(0);
        for (let p = -br; p <= br; p++) {
          const row = (p < 0 ? 0 : p > last ? last : p) * w;
          for (let o = 0; o < w; o++) col[o] += src[row + o];
        }
        for (let p = 0; p < h; p++) {
          const pa = p + br + 1, pb = p - br;
          const ra = (pa > last ? last : pa) * w, rb = (pb < 0 ? 0 : pb) * w, rp = p * w;
          for (let o = 0; o < w; o++) {
            dst[rp + o] = col[o] * iarr;
            col[o] += src[ra + o] - src[rb + o];
          }
        }
      };
      for (const br of boxes) {
        const b = Math.max(0, Math.round(br));
        passH(a, t, b);
        passV(t, a, b);
      }
      return a;
    },

    /**
     * Ombre portée à partir de l'alpha d'un objet : hauteur (mm) → décalage et flou.
     * Renvoie un canvas de même taille, à poser SOUS l'objet (même origine).
     */
    castShadow(alpha, w, h, ppm, { height = 8, soft = 1, opacity = 0.42, contact = 0.25 } = {}) {
      const dx = R.SHADOW_DIR[0] * height * 0.55 * ppm, dy = R.SHADOW_DIR[1] * height * 0.55 * ppm;
      const far = new Float32Array(w * h), near = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const sy = Math.round(y - dy);
        const syn = Math.round(y - dy * 0.15);
        for (let x = 0; x < w; x++) {
          const sx = Math.round(x - dx), sxn = Math.round(x - dx * 0.15);
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) far[y * w + x] = alpha[sy * w + sx];
          if (sxn >= 0 && syn >= 0 && sxn < w && syn < h) near[y * w + x] = alpha[syn * w + sxn];
        }
      }
      R.blur(far, w, h, height * 0.6 * soft * ppm);
      R.blur(near, w, h, Math.max(0.6, height * 0.08 * ppm));
      const c = R.canvas(w, h), ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h), d = img.data;
      const S = R.SHADOW_COLOR;
      for (let i = 0; i < w * h; i++) {
        const v = Math.min(1, far[i] * opacity + near[i] * contact);
        d[i * 4] = S[0]; d[i * 4 + 1] = S[1]; d[i * 4 + 2] = S[2]; d[i * 4 + 3] = v * 255;
      }
      ctx.putImageData(img, 0, 0);
      return c;
    },

    /**
     * Ombres propres d'un relief (ajout « gâteaux ») : ce que les bosses cachent du soleil de la fenêtre
     * (une noisette sur un brownie, les pointes d'une meringue, une framboise sur la crème).
     * Hf : hauteurs en mm (w*h) ; k : pixels par mm ; soft : pénombre, en mm de relief caché.
     * Balayage ligne à ligne depuis la lumière, O(w*h). Renvoie un Float32Array 0..1 (1 = au soleil),
     * à passer à R.shade({ shadow }).
     */
    sunShadow(Hf, w, h, k, soft = 1) {
      const lxy = Math.hypot(L[0], L[1]) || 1e-6;
      const dx = L[0] / lxy, dy = L[1] / lxy, rise = L[2] / lxy; // vers la lumière, pente du rayon
      const out = new Float32Array(w * h).fill(1);
      const S = new Float32Array(w * h); // « plafond » du rayon qui vient de la lumière
      const byRows = Math.abs(dy) >= Math.abs(dx);
      const n1 = byRows ? h : w, n2 = byRows ? w : h;
      const t = 1 / Math.abs(byRows ? dy : dx); // px parcourus vers la lumière pour une ligne
      const off = (byRows ? dx : dy) * t; // décalage latéral correspondant
      const drop = (t / k) * rise; // le rayon descend d'autant (mm) d'une ligne à l'autre
      const sgn = (byRows ? dy : dx) < 0 ? -1 : 1; // la ligne amont est à -1 si la lumière vient du côté 0
      const idx = byRows ? (a, b) => a * w + b : (a, b) => b * w + a;
      const inv = soft > 0 ? 1 / soft : 1e6;
      for (let s = 0; s < n1; s++) {
        const a = sgn < 0 ? s : n1 - 1 - s, up = a + sgn;
        for (let b = 0; b < n2; b++) {
          const i = idx(a, b), hv = Hf[i];
          let c = hv;
          if (s > 0) {
            const p = b + off, p0 = Math.floor(p), f = p - p0;
            if (p0 >= 0 && p0 + 1 < n2) {
              const u = S[idx(up, p0)] * (1 - f) + S[idx(up, p0 + 1)] * f - drop;
              if (u > c) c = u;
            }
          }
          S[i] = c;
          if (c > hv) {
            const x = Math.min(1, (c - hv) * inv);
            out[i] = 1 - x * x * (3 - 2 * x);
          }
        }
      }
      return out;
    },

    /**
     * Occlusion ambiante « des creux » (ajout « gâteaux ») : plus sombre là où les alentours sont plus
     * hauts (fissures, pied d'un fruit, entre deux pointes de meringue). r : rayon d'analyse (mm),
     * strength : assombrissement par mm de creux. Renvoie un Float32Array 0..1 (1 = dégagé) pour R.shade({ ao }).
     */
    cavity(Hf, w, h, k, r = 1.5, strength = 0.3) {
      const b = Float32Array.from(Hf);
      R.blur(b, w, h, r * k);
      const ao = new Float32Array(w * h);
      for (let i = 0, n = w * h; i < n; i++) {
        const c = b[i] - Hf[i];
        ao[i] = c > 0 ? Math.max(0, 1 - c * strength) : 1;
      }
      return ao;
    },

    /** Pose un sprite dans un contexte 2D, centré sur (x, y) en pixels, à l'échelle s (1 = taille native) */
    draw(ctx, sp, x, y, { s = 1, rot = 0, shadow = true, alpha = 1 } = {}) {
      if (!sp) return;
      const ppm = sp.canvas.width / sp.w;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.globalAlpha = alpha;
      const ox = -sp.ax * ppm, oy = -sp.ay * ppm;
      if (shadow && sp.shadow) ctx.drawImage(sp.shadow, ox, oy);
      ctx.drawImage(sp.canvas, ox, oy);
      ctx.restore();
    },

    /** Cache mémoire des sprites (clé → sprite) */
    cache: new Map(),
    memo(key, make) {
      if (R.cache.has(key)) return R.cache.get(key);
      const sp = make();
      R.cache.set(key, sp);
      return sp;
    },
  };

  AC.R = R;
})();

/* --------------------------------------------------------------------------
   Ajouts « vaisselle » (non cassants) : deux conventions communes.
   • R.TILT : parallaxe de la vue. L'appareil est un peu du côté du spectateur, comme sur les
     photos Instagram : un point à la hauteur z (mm) apparaît remonté de TILT·z vers le haut de
     l'image ; on devine alors la paroi extérieure des objets hauts (tasses, verres) côté bas.
     0 = vue orthographique pure. Les assiettes et gâteaux bas n'en sont presque pas affectés.
   • R.ENV / R.env() : l'environnement qui se reflète dans les matières brillantes (émail,
     argent, or, liquides) : la porte-fenêtre à croisillons en haut à gauche (dans l'axe de R.L),
     les murs crème, le plafond, et la table sous l'horizon. R.env(rx, ry, rz, rugosité, sol, out)
     rend le rayonnement linéaire vu dans la direction unitaire (rx, ry, rz) (z vers l'œil).
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  const R = window.AC && window.AC.R;
  if (!R) return;
  if (R.TILT == null) R.TILT = 0.2;
  if (R.ENV) return;
  const W0 = R.L;
  let ux = -W0[1], uy = W0[0];
  const ul = Math.hypot(ux, uy);
  ux /= ul; uy /= ul;
  const E = (R.ENV = {
    W0, ux, uy, vx: -W0[2] * uy, vy: W0[2] * ux, vz: W0[0] * uy - W0[1] * ux,
    U: 0.47, V0: -0.52, V1: 0.66, // la baie dans le plan tangent à l'axe de la lumière (≈ ±25° × 17°…78° d'élévation)
    BAR: 0.02, TRAV: 0.1, // meneau (u = 0) et traverse (v = TRAV)
    SKY: 7.5, STREET: 3.2, // luminance du haut (le ciel) et du bas (les façades de la rue)
    WALL: [0.42, 0.39, 0.33], CEIL: [0.26, 0.25, 0.23], SOL: [0.3, 0.26, 0.21],
  });
  const ss = (a, b, x) => {
    const t = (x - a) / (b - a);
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  };
  R.env = function (rx, ry, rz, rough, sol, out) {
    out = out || [0, 0, 0];
    if (rz >= 0) {
      out[0] = E.WALL[0] + (E.CEIL[0] - E.WALL[0]) * rz;
      out[1] = E.WALL[1] + (E.CEIL[1] - E.WALL[1]) * rz;
      out[2] = E.WALL[2] + (E.CEIL[2] - E.WALL[2]) * rz;
    } else {
      const s = sol || E.SOL, t = rz < -0.25 ? 1 : -rz * 4;
      out[0] = E.WALL[0] + (s[0] * 0.5 - E.WALL[0]) * t;
      out[1] = E.WALL[1] + (s[1] * 0.5 - E.WALL[1]) * t;
      out[2] = E.WALL[2] + (s[2] * 0.5 - E.WALL[2]) * t;
    }
    const d = rx * E.W0[0] + ry * E.W0[1] + rz * E.W0[2];
    if (d > 0.3) {
      const u = (rx * E.ux + ry * E.uy) / d, v = (rx * E.vx + ry * E.vy + rz * E.vz) / d;
      const e = 0.012 + rough * 0.55, au = Math.abs(u);
      if (au < E.U + e && v > E.V0 - e && v < E.V1 + e) {
        let m = ss(-e, e, E.U - au) * ss(-e, e, v - E.V0) * ss(-e, e, E.V1 - v);
        if (m > 0 && rough < 0.35) {
          const eb = e * 0.7;
          const bu = 1 - ss(E.BAR - eb, E.BAR + eb, au), bv = 1 - ss(E.BAR - eb, E.BAR + eb, Math.abs(v - E.TRAV));
          m *= 1 - (1 - rough * 2.8) * 0.85 * Math.max(bu, bv);
        }
        const L = m * (E.STREET + (E.SKY - E.STREET) * ss(E.V0, E.V1 * 0.8, v)) * (1 - 0.72 * Math.min(1, rough));
        out[0] += L * R.WARM[0]; out[1] += L * R.WARM[1]; out[2] += L * R.WARM[2];
      }
      const q = 1 + (u * u + (v - 0.05) * (v - 0.05)) * 1.1, g = (0.35 + rough * 0.6) / (q * q);
      out[0] += g; out[1] += g * 0.96; out[2] += g * 0.9;
    }
    return out;
  };
})();

(function() {
  "use strict";
  const N = 96, B = .9, H = 2 * B / N;
  const TRUNC = 3 * H, BEHIND_D = 3 * H, FREE_FRONT = 1.5 * H;
  const RW = .86;
  const ORBIT = 1.5, FOV = 72 * Math.PI / 180, TANF = Math.tan(FOV / 2), PIX = 200;
  const T = 40, STEP = 9 * Math.PI / 180, A0 = Math.PI / 2;
  const RING = 12, REFRESH = 4;
  const VIEW = 1.62;
  const FREE = 0, SURF = 1, BEH = 2, UNK = 3;
  const COL = {
    free: "#f0efec",
    surf: "#2a78d6",
    beh: "#1baf7a",
    unk: "#eb6834",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    base: "#c3c2b7",
    surface: "#fcfcfb"
  };
  const LAB_RGB = [ [ 240, 239, 236 ], [ 42, 120, 214 ], [ 27, 175, 122 ], [ 235, 104, 52 ] ];
  const len = (x, y) => Math.hypot(x, y);
  function box(px, py, cx, cy, bx, by, r) {
    const dx = Math.abs(px - cx) - bx + r, dy = Math.abs(py - cy) - by + r;
    return len(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  }
  const circ = (px, py, cx, cy, r) => len(px - cx, py - cy) - r;
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * .25;
  };
  const SHAPES = {
    bus: (x, y) => Math.min(box(x, y, .1, .06, .48, .2, .05), box(x, y, -.48, -.04, .16, .1, .04), circ(x, y, -.32, -.17, .1), circ(x, y, .36, -.17, .1)),
    cup: (x, y) => Math.max(box(x, y, .04, 0, .4, .32, .06), -box(x, y, -.16, 0, .42, .21, .04)),
    duck: (x, y) => {
      const body = (len((x + .05) / .48, (y + .16) / .27) - 1) * .27;
      return Math.min(smin(body, circ(x, y, .27, .22, .17), .12), box(x, y, .5, .21, .1, .035, .02));
    }
  };
  function cam(a, r) {
    const cx = r * Math.cos(a), cy = r * Math.sin(a), fx = -Math.cos(a), fy = -Math.sin(a);
    return {
      cx: cx,
      cy: cy,
      fx: fx,
      fy: fy,
      rx: fy,
      ry: -fx,
      a: a
    };
  }
  const streamCam = t => cam(A0 - t * STEP, ORBIT);
  const ringCam = k => cam(A0 + (k + .5) * (2 * Math.PI / RING), ORBIT);
  function trace(sdf, c, safety) {
    const depth = new Float32Array(PIX);
    for (let i = 0; i < PIX; i++) {
      const xi = (i + .5) / PIX * 2 - 1;
      let dx = c.fx + xi * TANF * c.rx, dy = c.fy + xi * TANF * c.ry;
      const n = len(dx, dy);
      dx /= n;
      dy /= n;
      let t = .2;
      for (let s = 0; s < 160 && t < 3.5; s++) {
        const d = sdf(c.cx + t * dx, c.cy + t * dy);
        if (d < .001) {
          depth[i] = t * (dx * c.fx + dy * c.fy);
          break;
        }
        t += d * safety;
      }
    }
    return depth;
  }
  function project(c, x, y) {
    const dx = x - c.cx, dy = y - c.cy, z = dx * c.fx + dy * c.fy;
    if (z <= .05) return null;
    const u = Math.floor(((dx * c.rx + dy * c.ry) / (z * TANF) + 1) / 2 * PIX);
    return u < 0 || u >= PIX ? null : [ u, z ];
  }
  const dilate1 = m => m.map(((v, i) => v || i > 0 && m[i - 1] || i < m.length - 1 && m[i + 1]));
  const cx = i => -B + (i + .5) * H;
  const inDisk = k => Math.hypot(cx(k % N), cx(Math.floor(k / N))) <= RW;
  function newGrid() {
    const g = {
      tsdf: new Float32Array(N * N),
      w: new Float32Array(N * N),
      free: new Uint8Array(N * N),
      beh: new Uint8Array(N * N),
      seen: new Uint8Array(N * N)
    };
    for (let k = 0; k < N * N; k++) if (!inDisk(k)) g.free[k] = g.seen[k] = 1;
    return g;
  }
  function integrate(g, c, depth) {
    const mask = Array.from(depth, (d => d > 0)), maskD = dilate1(mask);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = project(c, cx(i), cx(j));
      if (!p) continue;
      const k = j * N + i, [u, z] = p;
      g.seen[k] = 1;
      if (!maskD[u]) {
        g.free[k] = 1;
        continue;
      }
      if (!mask[u]) continue;
      const s = depth[u] - z;
      if (s > FREE_FRONT) g.free[k] = 1;
      if (Math.abs(s) <= TRUNC) {
        g.tsdf[k] = (g.tsdf[k] * g.w[k] + s / TRUNC) / (g.w[k] + 1);
        g.w[k] += 1;
      } else if (s > TRUNC && g.w[k] > 0) {
        g.tsdf[k] = (g.tsdf[k] * g.w[k] + 1) / (g.w[k] + 1);
        g.w[k] += 1;
      } else if (s < -TRUNC && s >= -(TRUNC + BEHIND_D)) g.beh[k] = 1;
    }
  }
  function labels(g) {
    const L = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const surf = g.w[k] > 0 && Math.abs(g.tsdf[k]) < 1;
      L[k] = surf ? SURF : g.free[k] ? FREE : g.beh[k] ? BEH : UNK;
    }
    return L;
  }
  function surfaceSamples(sdf) {
    const pts = [], M = 240, h = 2 * B / M;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -B + (i + .5) * h, y = -B + (j + .5) * h, d = sdf(x, y);
      if (Math.abs(d) < h * .5) pts.push([ x, y ]);
    }
    return pts;
  }
  function coverage(L, pts) {
    let n = 0;
    for (const [x, y] of pts) {
      const i = Math.floor((x + B) / H), j = Math.floor((y + B) / H);
      let hit = false;
      for (let b = -1; b <= 1 && !hit; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N && L[jj * N + ii] === SURF) {
          hit = true;
          break;
        }
      }
      n += hit;
    }
    return pts.length ? n / pts.length : 0;
  }
  function guessSdf(sdf, unseen) {
    const m = .1 * unseen, a = .08 * unseen;
    return (x, y) => sdf(x, y) - m + a * (Math.sin(4.1 * x + 1.3) * Math.cos(3.3 * y - .7) + .5 * Math.sin(7.3 * y + 2 * x));
  }
  function carve(L, gsdf) {
    const sils = [];
    for (let k = 0; k < RING; k++) {
      const c = ringCam(k);
      sils.push({
        c: c,
        sil: dilate1(Array.from(trace(gsdf, c, .7), (d => d > 0)))
      });
    }
    const near = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (L[j * N + i] !== SURF) continue;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N) near[jj * N + ii] = 1;
      }
    }
    const occ = new Uint8Array(N * N), carved = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (L[k] === FREE) continue;
      let out = false;
      if (!near[k] && L[k] !== SURF) for (const {c: c, sil: sil} of sils) {
        const p = project(c, cx(i), cx(j));
        if (p && !sil[p[0]]) {
          out = true;
          break;
        }
      }
      if (out) carved[k] = 1; else occ[k] = 1;
    }
    return {
      occ: occ,
      carved: carved,
      sils: sils
    };
  }
  function signedDist(occ) {
    const D = new Float32Array(N * N), R = 4;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, o = occ[k];
      let best = Infinity;
      for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
        const ii = i + a, jj = j + b;
        const other = ii < 0 || jj < 0 || ii >= N || jj >= N ? 0 : occ[jj * N + ii];
        if (other !== o) best = Math.min(best, Math.hypot(a, b));
      }
      const d = Math.min(best, R + 1) - .5;
      D[k] = Math.max(-1, Math.min(1, (o ? -d : d) * H / TRUNC));
    }
    return D;
  }
  function blur(src, sigma) {
    const r = Math.ceil(3 * sigma), w = [];
    for (let a = -r; a <= r; a++) w.push(Math.exp(-a * a / (2 * sigma * sigma)));
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0;
      for (let a = -r; a <= r; a++) {
        const ii = i + a;
        if (ii >= 0 && ii < N) s += w[a + r] * src[j * N + ii];
      }
      tmp[j * N + i] = s;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0;
      for (let b = -r; b <= r; b++) {
        const jj = j + b;
        if (jj >= 0 && jj < N) s += w[b + r] * tmp[jj * N + i];
      }
      out[j * N + i] = s;
    }
    return out;
  }
  function compose(g, L, dg) {
    const D = new Float32Array(N * N);
    if (!dg) {
      for (let k = 0; k < N * N; k++) D[k] = L[k] === SURF ? g.tsdf[k] : L[k] === BEH || L[k] === UNK && g.seen[k] ? -1 : 1;
      return D;
    }
    const m = new Float32Array(N * N), mr = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) if (L[k] === SURF && Math.abs(dg[k]) < 1) {
      m[k] = Math.max(0, 1 - Math.abs(g.tsdf[k]));
      mr[k] = m[k] * (g.tsdf[k] - dg[k]);
    }
    const bm = blur(m, 3), bmr = blur(mr, 3);
    const dist = chebyshev(L, 9);
    for (let k = 0; k < N * N; k++) {
      const wo = Math.min(g.w[k] / 2, 1);
      if (L[k] === FREE) D[k] = 1; else if (L[k] === SURF) D[k] = wo * g.tsdf[k] + (1 - wo) * dg[k]; else if (L[k] === BEH) D[k] = Math.min(dg[k], -1 / 3.5); else D[k] = dg[k] + (isFinite(dist[k]) ? bmr[k] / (bm[k] + .05) * Math.exp(-dist[k] / 6) : 0);
      D[k] = Math.max(-1, Math.min(1, D[k]));
    }
    return D;
  }
  function chebyshev(L, maxd) {
    const d = new Float32Array(N * N).fill(Infinity);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (L[j * N + i] !== SURF) continue;
      for (let b = -maxd; b <= maxd; b++) for (let a = -maxd; a <= maxd; a++) {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const k = jj * N + ii, v = Math.max(Math.abs(a), Math.abs(b));
        if (v < d[k]) d[k] = v;
      }
    }
    return d;
  }
  function contour(D, L) {
    const segs = [];
    const P = (i, j, i2, j2) => {
      const a = D[j * N + i], b = D[j2 * N + i2], t = a / (a - b);
      return [ cx(i) + (cx(i2) - cx(i)) * t, cx(j) + (cx(j2) - cx(j)) * t ];
    };
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const v0 = D[j * N + i] < 0, v1 = D[j * N + i + 1] < 0, v2 = D[(j + 1) * N + i + 1] < 0, v3 = D[(j + 1) * N + i] < 0;
      const code = v0 | v1 << 1 | v2 << 2 | v3 << 3;
      if (code === 0 || code === 15) continue;
      const e = {
        b: () => P(i, j, i + 1, j),
        r: () => P(i + 1, j, i + 1, j + 1),
        t: () => P(i, j + 1, i + 1, j + 1),
        l: () => P(i, j, i, j + 1)
      };
      const T = {
        1: [ "l", "b" ],
        2: [ "b", "r" ],
        3: [ "l", "r" ],
        4: [ "r", "t" ],
        5: [ "l", "t", "b", "r" ],
        6: [ "b", "t" ],
        7: [ "l", "t" ],
        8: [ "t", "l" ],
        9: [ "t", "b" ],
        10: [ "b", "l", "r", "t" ],
        11: [ "t", "r" ],
        12: [ "r", "l" ],
        13: [ "r", "b" ],
        14: [ "b", "l" ]
      }[code];
      for (let s = 0; s < T.length; s += 2) {
        const p = e[T[s]](), q = e[T[s + 1]]();
        const mi = Math.min(N - 1, Math.max(0, Math.round(((p[0] + q[0]) / 2 + B) / H - .5)));
        const mj = Math.min(N - 1, Math.max(0, Math.round(((p[1] + q[1]) / 2 + B) / H - .5)));
        segs.push({
          p: p,
          q: q,
          gen: L[mj * N + mi] === UNK
        });
      }
    }
    return segs;
  }
  function chamfer(segs, sdf, pts) {
    if (!segs.length) return NaN;
    const mids = segs.map((s => [ (s.p[0] + s.q[0]) / 2, (s.p[1] + s.q[1]) / 2 ]));
    let acc = 0;
    for (const [x, y] of mids) acc += Math.abs(sdf(x, y));
    let comp = 0, n = 0;
    for (let k = 0; k < pts.length; k += 3) {
      let best = Infinity;
      const [x, y] = pts[k];
      for (const m of mids) best = Math.min(best, (m[0] - x) ** 2 + (m[1] - y) ** 2);
      comp += Math.sqrt(best);
      n++;
    }
    return (acc / mids.length + comp / n) / 2;
  }
  function simulate(shape, t, mode) {
    const sdf = SHAPES[shape], pts = surfaceSamples(sdf), g = newGrid();
    const r = Math.floor(t / REFRESH) * REFRESH;
    let snap = null, depthNow = null;
    for (let s = 0; s <= t; s++) {
      const c = streamCam(s), depth = trace(sdf, c, 1);
      integrate(g, c, depth);
      if (s === r) snap = labels(g);
      if (s === t) depthNow = depth;
    }
    const L = labels(g);
    let comp = null;
    if (mode === "guess") {
      const unseen = 1 - coverage(snap, pts), gs = guessSdf(sdf, unseen), cv = carve(snap, gs);
      comp = {
        r: r,
        unseen: unseen,
        gsdf: gs,
        ...cv,
        dg: signedDist(cv.occ)
      };
    }
    const D = compose(g, L, comp && comp.dg), segs = contour(D, L);
    const counts = [ 0, 0, 0, 0 ];
    for (let k = 0; k < N * N; k++) counts[L[k]]++;
    return {
      sdf: sdf,
      pts: pts,
      g: g,
      L: L,
      comp: comp,
      D: D,
      segs: segs,
      depthNow: depthNow,
      counts: counts,
      t: t,
      err: chamfer(segs, sdf, pts)
    };
  }
  function hatch(ctx) {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const x = c.getContext("2d");
    x.fillStyle = COL.free;
    x.fillRect(0, 0, 8, 8);
    x.strokeStyle = "rgba(235,104,52,0.55)";
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(-2, 10);
    x.lineTo(10, -2);
    x.moveTo(-2, 2);
    x.lineTo(2, -2);
    x.moveTo(6, 10);
    x.lineTo(10, 6);
    x.stroke();
    return ctx.createPattern(c, "repeat");
  }
  function makeToy(root) {
    const canvas = root.querySelector("canvas.toy-canvas"), strip = root.querySelector("canvas.toy-strip");
    const ctx = canvas.getContext("2d"), sctx = strip.getContext("2d");
    const tip = root.querySelector(".toy-tip");
    const st = {
      shape: "bus",
      t: 7,
      stage: "compose",
      mode: "guess",
      gt: true,
      playing: false,
      sim: null
    };
    const off = document.createElement("canvas");
    off.width = off.height = N;
    const octx = off.getContext("2d"), img = octx.createImageData(N, N);
    let size = 560, pat = null;
    function resize() {
      const w = Math.min(root.querySelector(".toy-stage").clientWidth, 620), dpr = window.devicePixelRatio || 1;
      size = w;
      canvas.style.width = canvas.style.height = w + "px";
      canvas.width = canvas.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      strip.style.width = w + "px";
      strip.width = Math.round(w * dpr);
      strip.height = Math.round(18 * dpr);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pat = hatch(ctx);
      draw();
    }
    const S = x => (x + VIEW) / (2 * VIEW) * size, Sy = y => (VIEW - y) / (2 * VIEW) * size;
    function line(pts, close) {
      ctx.beginPath();
      pts.forEach((([x, y], k) => k ? ctx.lineTo(S(x), Sy(y)) : ctx.moveTo(S(x), Sy(y))));
      if (close) ctx.closePath();
    }
    function outline(sdf, dash, color, width) {
      const segs = contour(Float32Array.from({
        length: N * N
      }, ((_, k) => sdf(cx(k % N), cx(Math.floor(k / N))))), new Uint8Array(N * N));
      ctx.save();
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const s of segs) {
        ctx.moveTo(S(s.p[0]), Sy(s.p[1]));
        ctx.lineTo(S(s.q[0]), Sy(s.q[1]));
      }
      ctx.stroke();
      ctx.restore();
    }
    function camGlyph(c, fill, stroke, r) {
      ctx.beginPath();
      ctx.arc(S(c.cx), Sy(c.cy), r, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
    function frustum(c, depth, color) {
      const far = 2.6, l = [ c.fx - TANF * c.rx, c.fy - TANF * c.ry ], r = [ c.fx + TANF * c.rx, c.fy + TANF * c.ry ];
      ctx.save();
      ctx.globalAlpha = .08;
      ctx.fillStyle = color;
      line([ [ c.cx, c.cy ], [ c.cx + far * l[0], c.cy + far * l[1] ], [ c.cx + far * r[0], c.cy + far * r[1] ] ], true);
      ctx.fill();
      ctx.restore();
      if (!depth) return;
      ctx.fillStyle = color;
      for (let i = 0; i < PIX; i += 2) {
        if (!(depth[i] > 0)) continue;
        const xi = (i + .5) / PIX * 2 - 1, dx = c.fx + xi * TANF * c.rx, dy = c.fy + xi * TANF * c.ry;
        ctx.fillRect(S(c.cx + depth[i] * dx) - 1.5, Sy(c.cy + depth[i] * dy) - 1.5, 3, 3);
      }
    }
    function draw() {
      const sim = st.sim;
      if (!sim) return;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = COL.surface;
      ctx.fillRect(0, 0, size, size);
      const stage = st.stage, faded = stage === "compose" || stage === "observe";
      for (let k = 0; k < N * N; k++) {
        let lab = sim.L[k];
        if (stage === "observe") lab = FREE;
        if (stage === "complete" && sim.comp && sim.comp.carved[k] && lab !== FREE) lab = -1;
        const rgb = !inDisk(k) ? [ 252, 252, 251 ] : lab < 0 ? LAB_RGB[FREE] : LAB_RGB[lab], a = faded && lab !== FREE ? .28 : 1;
        const j = N - 1 - Math.floor(k / N), i = k % N, o = (j * N + i) * 4;
        img.data[o] = Math.round(rgb[0] * a + 240 * (1 - a));
        img.data[o + 1] = Math.round(rgb[1] * a + 239 * (1 - a));
        img.data[o + 2] = Math.round(rgb[2] * a + 236 * (1 - a));
        img.data[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, S(-B), Sy(B), S(B) - S(-B), Sy(-B) - Sy(B));
      if (stage === "complete" && sim.comp) {
        ctx.fillStyle = pat;
        const cw = (S(B) - S(-B)) / N;
        for (let k = 0; k < N * N; k++) if (sim.comp.carved[k] && sim.L[k] !== FREE) ctx.fillRect(S(-B) + k % N * cw, Sy(B) + (N - 1 - Math.floor(k / N)) * cw, cw + .5, cw + .5);
      }
      ctx.beginPath();
      ctx.arc(S(0), Sy(0), RW / (2 * VIEW) * size, 0, 2 * Math.PI);
      ctx.strokeStyle = COL.base;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(S(0), Sy(0), ORBIT / (2 * VIEW) * size, 0, 2 * Math.PI);
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (stage === "complete" && sim.comp) {
        for (const {c: c} of sim.comp.sils) {
          ctx.save();
          ctx.translate(S(c.cx), Sy(c.cy));
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = COL.surface;
          ctx.strokeStyle = COL.unk;
          ctx.lineWidth = 2;
          ctx.fillRect(-5, -5, 10, 10);
          ctx.strokeRect(-5, -5, 10, 10);
          ctx.restore();
        }
        outline(sim.comp.gsdf, [ 5, 4 ], COL.unk, 1.6);
      }
      for (let s = 0; s < st.t; s++) camGlyph(streamCam(s), COL.surf, COL.surface, 4);
      const cnow = streamCam(st.t);
      if (stage === "observe" || stage === "evidence") frustum(cnow, sim.depthNow, COL.surf);
      camGlyph(cnow, COL.ink, COL.surface, 6);
      if (st.gt) outline(sim.sdf, [ 2, 3 ], COL.ink2, 1.2);
      if (stage === "compose") {
        ctx.lineCap = "round";
        ctx.lineWidth = 3.5;
        for (const gen of [ false, true ]) {
          ctx.strokeStyle = gen ? COL.unk : COL.surf;
          ctx.setLineDash(gen ? [ 6, 3 ] : []);
          ctx.beginPath();
          for (const s of sim.segs) if (s.gen === gen) {
            ctx.moveTo(S(s.p[0]), Sy(s.p[1]));
            ctx.lineTo(S(s.q[0]), Sy(s.q[1]));
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      sctx.clearRect(0, 0, size, 18);
      const d = sim.depthNow, wpx = size / PIX;
      for (let i = 0; i < PIX; i++) {
        const v = d[i] > 0 ? Math.round(40 + 150 * Math.min(1, Math.max(0, (d[i] - 1) / 1.2))) : 252;
        sctx.fillStyle = `rgb(${v},${v},${d[i] > 0 ? Math.min(255, v + 25) : 251})`;
        sctx.fillRect(i * wpx, 0, wpx + .5, 18);
      }
      readout();
    }
    function readout() {
      const sim = st.sim, c = sim.counts, hull = c[1] + c[2] + c[3];
      const q = s => root.querySelector(s);
      q(".ro-frame").textContent = `${st.t} / ${T - 1}`;
      q(".ro-unknown").textContent = `${(100 * c[3] / Math.max(1, hull)).toFixed(0)} %`;
      q(".ro-refresh").textContent = sim.comp ? `frame ${sim.comp.r}` : "none";
      q(".ro-err").textContent = isFinite(sim.err) ? (100 * sim.err).toFixed(2) : "–";
      const ng = sim.segs.filter((s => s.gen)).length;
      q(".ro-gen").textContent = sim.segs.length ? `${(100 * ng / sim.segs.length).toFixed(0)} %` : "–";
    }
    function recompute() {
      st.sim = simulate(st.shape, st.t, st.mode);
      draw();
    }
    const slider = root.querySelector(".toy-frame");
    slider.max = T - 1;
    slider.value = st.t;
    slider.addEventListener("input", (() => {
      st.t = +slider.value;
      recompute();
    }));
    root.querySelectorAll("[data-stage]").forEach((b => b.addEventListener("click", (() => {
      st.stage = b.dataset.stage;
      root.querySelectorAll("[data-stage]").forEach((x => x.setAttribute("aria-pressed", x === b)));
      root.querySelectorAll("[data-stage-note]").forEach((n => n.hidden = n.dataset.stageNote !== st.stage));
      draw();
    }))));
    root.querySelector(".toy-shape").addEventListener("change", (e => {
      st.shape = e.target.value;
      recompute();
    }));
    root.querySelector(".toy-mode").addEventListener("change", (e => {
      st.mode = e.target.value;
      recompute();
    }));
    root.querySelector(".toy-gt").addEventListener("change", (e => {
      st.gt = e.target.checked;
      draw();
    }));
    const play = root.querySelector(".toy-play");
    let timer = null;
    play.addEventListener("click", (() => {
      st.playing = !st.playing;
      play.textContent = st.playing ? "Pause" : "Play";
      play.setAttribute("aria-pressed", st.playing);
      if (st.playing) {
        if (st.t >= T - 1) {
          st.t = 0;
          slider.value = 0;
          recompute();
        }
        timer = setInterval((() => {
          if (st.t >= T - 1) {
            play.click();
            return;
          }
          st.t += 1;
          slider.value = st.t;
          recompute();
        }), 260);
      } else clearInterval(timer);
    }));
    canvas.addEventListener("mousemove", (e => {
      const rc = canvas.getBoundingClientRect(), x = (e.clientX - rc.left) / size * 2 * VIEW - VIEW, y = VIEW - (e.clientY - rc.top) / size * 2 * VIEW;
      const i = Math.floor((x + B) / H), j = Math.floor((y + B) / H);
      if (i < 0 || j < 0 || i >= N || j >= N || !st.sim) {
        tip.hidden = true;
        return;
      }
      const k = j * N + i, sim = st.sim, name = [ "free", "surface", "behind", "unknown" ][sim.L[k]];
      let extra = sim.L[k] === SURF ? ` · TSDF ${sim.g.tsdf[k].toFixed(2)}, ${sim.g.w[k]} frames` : "";
      if (sim.comp && sim.L[k] === UNK) extra = sim.comp.carved[k] ? " · carved away by the ring" : " · kept by the completion";
      tip.textContent = `${name}${extra}`;
      tip.hidden = false;
      const tx = e.clientX - rc.left, tw = tip.offsetWidth;
      tip.style.left = (tx + 14 + tw <= rc.width ? tx + 14 : Math.max(0, tx - 14 - tw)) + "px";
      tip.style.top = e.clientY - rc.top + 10 + "px";
    }));
    canvas.addEventListener("mouseleave", (() => tip.hidden = true));
    window.addEventListener("resize", resize);
    recompute();
    resize();
  }
  window.FGToy = {
    mount: el => makeToy(el)
  };
})();

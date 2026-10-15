(function() {
  "use strict";
  const D = window.FG_DATA || {};
  const A = window.FGAsset || (p => p);
  const CAP = [ 0, 3, 7, 15, 31, 55, 79 ];
  const NAMES = {
    school_bus1: "school bus",
    alarm: "alarm clock",
    grandmother: "grandmother",
    sofa: "sofa"
  };
  const VIEW = {
    school_bus1: {
      az: .55,
      el: .32
    },
    alarm: {
      az: -1.2,
      el: .25
    },
    grandmother: {
      az: -1.1,
      el: .2
    },
    sofa: {
      az: -.6,
      el: .4
    }
  };
  const pad2 = n => String(n).padStart(2, "0"), pad3 = n => String(n).padStart(3, "0");
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [ ...r.querySelectorAll(s) ];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const capAt = t => CAP.filter((f => f <= t)).pop();
  function press(group, btn) {
    $$("button", group).forEach((b => b.setAttribute("aria-pressed", String(b === btn))));
  }
  function lazy(el, fn) {
    const io = new IntersectionObserver((es => {
      if (es[0].isIntersecting) {
        io.disconnect();
        fn();
      }
    }), {
      rootMargin: "300px"
    });
    io.observe(el);
  }
  const hasGL = (() => {
    try {
      return !!document.createElement("canvas").getContext("webgl");
    } catch (e) {
      return false;
    }
  })();
  function viewerOr(el, orbit) {
    if (!hasGL || !window.THREE) {
      el.dataset.error = "WebGL is not available in this browser";
      return null;
    }
    if (window.FG_PACK && typeof DecompressionStream !== "function") {
      el.dataset.error = "The 3D view needs a newer browser";
      return null;
    }
    return new FGView.Viewer(el, orbit);
  }
  function frameOrbit(orbit, obj) {
    FGView.frameObject(orbit, D[obj].bbox);
    orbit.set(VIEW[obj]);
  }
  (function teaser() {
    const st = {
      obj: "school_bus1",
      t: 0,
      mode: "src",
      playing: false,
      out: null
    };
    const img = $("#ts-img"), slider = $("#ts-slider"), strip = $("#ts-strip"), play = $("#ts-play");
    const orbit = new FGView.Orbit;
    if (!reduced) FGView.autoRotate(orbit);
    const viewer = viewerOr($("#ts-viewer"), orbit);
    const cache = {};
    function preload(obj) {
      for (let t = 0; t < 80; t++) {
        const k = `${obj}/${t}`;
        if (!cache[k]) {
          cache[k] = new Image;
          cache[k].src = A(`assets/frames/${obj}/${pad3(t)}.jpg`);
        }
      }
    }
    function buildStrip() {
      strip.replaceChildren();
      for (let t = 0; t < 80; t += 4) {
        const im = document.createElement("img");
        im.src = A(`assets/frames/${st.obj}/${pad3(t)}.jpg`);
        im.alt = "";
        im.dataset.t = t;
        im.addEventListener("click", (() => {
          stop();
          set(t);
        }));
        strip.appendChild(im);
      }
    }
    function set(t) {
      st.t = t;
      slider.value = t;
      $("#ts-frame").textContent = t;
      img.src = A(`assets/frames/${st.obj}/${pad3(t)}.jpg`);
      $$("img", strip).forEach((im => {
        const k = +im.dataset.t;
        im.classList.toggle("seen", k <= t);
        im.classList.toggle("now", k <= t && t < k + 4);
      }));
      const f = capAt(t);
      if (f !== st.out) {
        st.out = f;
        $("#ts-out").textContent = f;
        if (viewer) viewer.show(`${st.obj}_f${pad2(f)}_comp`);
        const g = D[st.obj].meshes[f].generated_share;
        $("#ts-gen").textContent = `${Math.round(100 * g)} %`;
        $("#ts-gen-bar").style.width = `${100 * g}%`;
      }
    }
    function setObj(obj) {
      st.obj = obj;
      st.out = null;
      preload(obj);
      buildStrip();
      frameOrbit(orbit, obj);
      set(st.t);
    }
    slider.addEventListener("input", (() => {
      stop();
      set(+slider.value);
    }));
    $("#ts-obj").addEventListener("change", (e => setObj(e.target.value)));
    $$("[data-ts-mode]").forEach((b => b.addEventListener("click", (() => {
      st.mode = b.dataset.tsMode;
      press(b.parentElement, b);
      if (viewer) viewer.setMode(st.mode);
    }))));
    let timer = null;
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      play.textContent = "Play";
      play.setAttribute("aria-pressed", "false");
    }
    function start() {
      if (st.t >= 79) set(0);
      play.textContent = "Pause";
      play.setAttribute("aria-pressed", "true");
      timer = setInterval((() => {
        if (st.t >= 79) return stop();
        set(st.t + 1);
      }), 140);
    }
    play.addEventListener("click", (() => timer ? stop() : start()));
    if (viewer) viewer.setMode("src");
    setObj("school_bus1");
    const q = new URLSearchParams(location.search);
    if (q.has("t")) set(Math.max(0, Math.min(79, Math.round(+q.get("t")) || 0))); else if (!reduced) setTimeout(start, 600);
  })();
  (function() {
    const at = new URLSearchParams(location.search).get("at");
    const e = at && document.getElementById(at);
    if (e) setTimeout((() => e.scrollIntoView({
      behavior: "instant"
    })), 700);
  })();
  $$("#ov-svg .node").forEach((n => {
    const go = () => document.getElementById(n.dataset.goto).scrollIntoView({
      behavior: reduced ? "auto" : "smooth"
    });
    n.addEventListener("click", go);
    n.addEventListener("keydown", (e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    }));
  }));
  lazy($("#toy-root"), (() => FGToy.mount($("#toy-root"))));
  (function slices() {
    const st = {
      obj: "school_bus1",
      plane: "yz",
      f: 7
    }, box = $("#sl-frames");
    for (const f of CAP) {
      const b = document.createElement("button"), lg = document.createElement("span");
      lg.className = "lg";
      lg.textContent = "after frame ";
      b.append(lg, document.createTextNode(String(f)));
      b.dataset.f = f;
      b.setAttribute("aria-label", `after frame ${f}`);
      b.setAttribute("aria-pressed", String(f === st.f));
      b.addEventListener("click", (() => {
        st.f = f;
        press(box, b);
        show();
      }));
      box.appendChild(b);
    }
    const fmt = n => n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : `${Math.round(n / 1e3)} k`;
    function show() {
      $("#sl-img").src = A(`assets/slices/${st.obj}_${st.plane}_f${pad2(st.f)}.png`);
      const L = D[st.obj].labels[String(st.f)];
      $("#sl-stat").textContent = `Whole 256³ grid after frame ${st.f}: ${fmt(L.UNKNOWN)} unknown, ${fmt(L.SURFACE)} surface and ` + `${fmt(L.BEHIND)} behind voxels; the rest is free.`;
    }
    $("#sl-obj").addEventListener("change", (e => {
      st.obj = e.target.value;
      show();
    }));
    $$("[data-plane]").forEach((b => b.addEventListener("click", (() => {
      st.plane = b.dataset.plane;
      press(b.parentElement, b);
      show();
    }))));
    show();
  })();
  (function ring() {
    const st = {
      obj: "school_bus1",
      k: 1,
      kind: "rgb"
    }, slider = $("#rg-slider");
    function show() {
      const gens = D[st.obj].gens, info = D[st.obj].gen_info, g = gens[st.k], gi = info.find((x => x.gen_id === g.gen)).info;
      $("#rg-img").src = A(`assets/ring/${st.obj}_g${pad2(g.gen)}${st.kind === "sil" ? "_sil.png" : ".jpg"}`);
      $("#rg-stat").textContent = `Completion ${st.k + 1} of ${gens.length}, at frame ${g.frame}, from ${gi.n_views} input ` + `frame${gi.n_views > 1 ? "s" : ""}: its silhouettes carve ${Math.round(100 * gi.carved_share)} % of the space not yet known to be free.`;
    }
    function setObj(obj) {
      st.obj = obj;
      slider.max = D[obj].gens.length - 1;
      st.k = Math.min(st.k, +slider.max);
      slider.value = st.k;
      show();
      uChart();
    }
    slider.addEventListener("input", (() => {
      st.k = +slider.value;
      show();
    }));
    $("#rg-obj").addEventListener("change", (e => setObj(e.target.value)));
    $$("[data-ring]").forEach((b => b.addEventListener("click", (() => {
      st.kind = b.dataset.ring;
      press(b.parentElement, b);
      show();
    }))));
    function uChart() {
      const U = D[st.obj].U, xs = U.map(((_, i) => i)), gens = D[st.obj].gens.map((g => g.frame));
      $("#u-obj-name").textContent = NAMES[st.obj];
      FGCharts.lineChart($("#u-chart"), {
        x: xs,
        xTicks: [ 0, 7, 15, 31, 55, 79 ],
        xLabel: "frame",
        height: 240,
        noDots: true,
        zero: true,
        aria: "Unknown voxels over the stream",
        series: [ {
          key: "U",
          name: "unknown voxels",
          color: "#eb6834",
          values: U.map((u => u / 1e6))
        } ],
        fmt: (v, tick) => tick ? v ? `${v} M` : "0" : `${v.toFixed(2)} M`,
        lowerBetter: true,
        markers: gens.map((f => ({
          x: f
        }))),
        tipExtra: x => gens.includes(x) ? " · completion refresh" : ""
      });
    }
    setObj("school_bus1");
  })();
  lazy($("#cmp-card"), (function compose() {
    const st = {
      obj: "school_bus1",
      f: 7
    }, orbit = new FGView.Orbit;
    const v = {
      obs: viewerOr($("#cp-obs"), orbit),
      hull: viewerOr($("#cp-hull"), orbit),
      comp: viewerOr($("#cp-comp"), orbit)
    };
    if (v.obs) v.obs.setMode("src");
    if (v.comp) v.comp.setMode("src");
    let tok = 0;
    function show() {
      const keys = [ "obs", "hull", "comp" ].map((k => `${st.obj}_f${pad2(st.f)}_${k}`)), mine = ++tok;
      [ "obs", "hull", "comp" ].forEach(((k, i) => v[k] && v[k].show(keys[i])));
      if (!v.obs && !v.hull && !v.comp) return;
      Promise.all(keys.map((k => FGView.getMesh(k)))).then((gs => {
        if (mine !== tok) return;
        const lo = [ Infinity, Infinity, Infinity ], hi = [ -Infinity, -Infinity, -Infinity ];
        for (const g of gs) {
          if (!g.boundingBox) g.computeBoundingBox();
          const b = g.boundingBox;
          [ b.min.x, b.min.y, b.min.z ].forEach(((x, a) => lo[a] = Math.min(lo[a], x)));
          [ b.max.x, b.max.y, b.max.z ].forEach(((x, a) => hi[a] = Math.max(hi[a], x)));
        }
        FGView.frameObject(orbit, [ lo, hi ]);
      })).catch((() => {}));
    }
    $("#cp-obj").addEventListener("change", (e => {
      st.obj = e.target.value;
      orbit.set(VIEW[st.obj]);
      show();
    }));
    $$("[data-cf]").forEach((b => b.addEventListener("click", (() => {
      st.f = +b.dataset.cf;
      press(b.parentElement, b);
      show();
    }))));
    frameOrbit(orbit, st.obj);
    show();
  }));
  const SERIES = [ {
    key: "fg",
    name: "FuseGen, LaCT completion",
    label: "FuseGen",
    color: "#2a78d6",
    cd: [ .0504, .0283, .0263, .0241 ],
    psnr: [ 16.08, 19.28, 20.07, 21.2 ],
    lpips: [ .155, .114, .1, .083 ]
  }, {
    key: "fgs",
    name: "FuseGen, SAM 3D completion",
    color: "#4a3aa7",
    cd: [ .0529, .0342, .0313, .0243 ],
    psnr: [ 15.93, 18.98, 20.03, 21.21 ],
    lpips: [ .156, .119, .098, .081 ]
  }, {
    key: "s3d",
    name: "Stream3D",
    color: "#e34948",
    cd: [ .072, .0402, .0384, .0424 ],
    psnr: [ 15.17, 16.64, 17.44, 16.89 ],
    lpips: [ .168, .15, .129, .134 ]
  }, {
    key: "mv",
    name: "MVSAM3D, 8 views",
    color: "#eda100",
    cd: [ .0769, .0427, .0391, .0388 ],
    psnr: [ 14.98, 16.97, 17.04, 17.02 ],
    lpips: [ .175, .139, .131, .135 ]
  }, {
    key: "sv",
    name: "SAM 3D, single view",
    color: "#008300",
    cd: [ .0673, .0482, .0469, .0537 ],
    psnr: [ 15, 16.51, 16.36, 16.47 ],
    lpips: [ .172, .133, .136, .147 ]
  }, {
    key: "lr",
    name: "Latent refinement",
    color: "#e87ba4",
    cd: [ .0782, .0436, .0393, .0327 ],
    psnr: [ 14.09, 15.47, 16.13, 16.95 ],
    lpips: [ .183, .158, .152, .138 ]
  } ];
  const COLOR = Object.fromEntries(SERIES.map((s => [ s.key, s.color ])));
  const METRIC = {
    psnr: {
      fmt: (v, tick) => tick ? String(v) : `${v.toFixed(2)} dB`,
      lower: false,
      head: "PSNR (dB)"
    },
    cd: {
      fmt: (v, tick, dec) => tick ? v.toFixed(dec ?? 2) : v.toFixed(4),
      lower: true,
      head: "median Chamfer"
    },
    lpips: {
      fmt: (v, tick, dec) => tick ? v.toFixed(dec ?? 2) : v.toFixed(3),
      lower: true,
      head: "LPIPS"
    }
  };
  (function horizons() {
    const st = {
      metric: "psnr",
      hidden: new Set
    }, host = $("#hz-chart"), legend = $("#hz-legend");
    for (const s of SERIES) {
      const b = document.createElement("button");
      b.setAttribute("aria-pressed", "true");
      const i = document.createElement("i");
      i.style.background = s.color;
      b.append(i, document.createTextNode(s.name));
      b.addEventListener("click", (() => {
        if (st.hidden.has(s.key)) st.hidden.delete(s.key); else if (st.hidden.size < SERIES.length - 1) st.hidden.add(s.key);
        b.setAttribute("aria-pressed", String(!st.hidden.has(s.key)));
        draw();
      }));
      legend.appendChild(b);
    }
    function draw() {
      const M = METRIC[st.metric];
      FGCharts.lineChart(host, {
        x: [ 7, 31, 55, 79 ],
        xFmt: v => `frame ${v}`,
        xLabel: "scored frame",
        aria: `${M.head} over the stream`,
        height: 320,
        series: SERIES.map((s => ({
          key: s.key,
          name: s.name,
          label: s.label,
          color: s.color,
          values: s[st.metric]
        }))),
        fmt: M.fmt,
        lowerBetter: M.lower,
        hidden: st.hidden,
        endLabel: st.hidden.has("fg") ? null : "fg"
      });
      table();
    }
    function table() {
      const M = METRIC[st.metric], t = document.createElement("table");
      t.className = "res";
      const hr = t.createTHead().insertRow();
      for (const h of [ `Method (${M.head})`, "frame 7", "frame 31", "frame 55", "frame 79" ]) {
        const th = document.createElement("th");
        th.textContent = h;
        hr.appendChild(th);
      }
      const body = t.createTBody();
      for (const s of SERIES) {
        const r = body.insertRow();
        if (s.key.startsWith("fg")) r.className = "ours";
        r.insertCell().textContent = s.name;
        s[st.metric].forEach((v => r.insertCell().textContent = M.fmt(v)));
      }
      $("#hz-table").replaceChildren(t);
    }
    $$("[data-metric]").forEach((b => b.addEventListener("click", (() => {
      st.metric = b.dataset.metric;
      press(b.parentElement, b);
      draw();
    }))));
    $("#hz-table-btn").addEventListener("click", (e => {
      const tb = $("#hz-table");
      tb.hidden = !tb.hidden;
      e.target.setAttribute("aria-expanded", String(!tb.hidden));
      e.target.textContent = tb.hidden ? "Show table" : "Hide table";
    }));
    draw();
  })();
  FGCharts.barChart($("#cost-chart"), {
    aria: "Seconds per new frame",
    fmt: (v, tick) => tick ? `${v} s` : `${v.toFixed(2)} s`,
    rows: [ {
      name: "FuseGen, LaCT completion",
      value: .32,
      color: COLOR.fg,
      ours: true
    }, {
      name: "Latent refinement",
      value: .45,
      color: COLOR.lr
    }, {
      name: "FuseGen, SAM 3D completion",
      value: .79,
      color: COLOR.fgs,
      ours: true
    }, {
      name: "SAM 3D, single view",
      value: 4.99,
      color: COLOR.sv
    }, {
      name: "MVSAM3D, 8 views",
      value: 14.39,
      color: COLOR.mv
    }, {
      name: "Stream3D",
      value: 15.12,
      color: COLOR.s3d
    } ]
  });
  (function qual() {
    const Q = D._qual, grid = $("#ql-grid"), box = $("#ql-objs");
    if (!Q || !grid) return;
    const COLS = {
      gt: "Ground truth",
      latent: "Latent refinement",
      stream3d: "Stream3D",
      fusegen: "FuseGen (ours)"
    };
    const SHORT = {
      gt: "GT",
      latent: "Latent",
      stream3d: "Stream3D",
      fusegen: "Ours"
    };
    function show(obj) {
      grid.replaceChildren();
      const cell = (cls, txt) => {
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = txt;
        grid.appendChild(d);
      };
      cell("ql-h", "");
      for (const c of Q.cols) {
        cell("ql-h" + (c === "fusegen" ? " ours" : ""), COLS[c]);
        grid.lastChild.dataset.short = SHORT[c];
      }
      for (const f of Q.frames) {
        cell("ql-r", `frame ${f}`);
        for (const c of Q.cols) {
          const im = document.createElement("img");
          im.src = A(c === "gt" ? `assets/qual/${obj}_gt.jpg` : `assets/qual/${obj}_${c}_f${pad2(f)}.jpg`);
          im.alt = `${COLS[c]}, ${NAMES[obj]}, frame ${f}`;
          im.loading = "lazy";
          grid.appendChild(im);
        }
      }
    }
    for (const obj of Q.objs) {
      const b = document.createElement("button");
      b.textContent = NAMES[obj];
      b.setAttribute("aria-pressed", String(obj === "school_bus1"));
      b.addEventListener("click", (() => {
        press(box, b);
        show(obj);
      }));
      box.appendChild(b);
    }
    show("school_bus1");
  })();
})();

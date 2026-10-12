(function() {
  "use strict";
  const SRC_RGB = {
    obs: [ 42, 120, 214 ],
    gen: [ 235, 104, 52 ]
  };
  const lin = c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
  const cache = {};
  function loadScript(src) {
    return new Promise(((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("cannot load " + src));
      document.head.appendChild(s);
    }));
  }
  function decode(str, Type) {
    const bin = atob(str), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  }
  async function unpack(b64) {
    const bin = atob(b64), z = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) z[i] = bin.charCodeAt(i);
    const buf = await new Response(new Blob([ z ]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const dv = new DataView(buf);
    if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== "FGM1") throw new Error("bad mesh pack");
    const nv = dv.getUint32(4, true), nf = dv.getUint32(8, true), flags = dv.getUint32(12, true);
    const lo = [ 0, 1, 2 ].map((a => dv.getFloat32(16 + 4 * a, true))), hi = [ 0, 1, 2 ].map((a => dv.getFloat32(28 + 4 * a, true)));
    let off = 40;
    const d16 = new Uint16Array(buf.slice(off, off + 6 * nv));
    off += 6 * nv;
    const pos = new Float32Array(3 * nv);
    for (let a = 0; a < 3; a++) {
      let q = 0;
      const sc = (hi[a] - lo[a]) / 65535;
      for (let v = 0; v < nv; v++) {
        q = q + d16[a * nv + v] & 65535;
        pos[3 * v + a] = lo[a] + q * sc;
      }
    }
    let col = null, src = null;
    if (flags & 1) {
      const d8 = new Uint8Array(buf, off, 3 * nv);
      off += 3 * nv;
      col = new Uint8Array(3 * nv);
      for (let a = 0; a < 3; a++) {
        let c = 0;
        for (let v = 0; v < nv; v++) {
          c = c + d8[a * nv + v] & 255;
          col[3 * v + a] = c;
        }
      }
    }
    if (flags & 2) {
      src = new Uint8Array(buf.slice(off, off + nv));
      off += nv;
    }
    const wide = nv >= 65536, codes = wide ? new Uint32Array(buf.slice(off, off + 12 * nf)) : new Uint16Array(buf.slice(off, off + 6 * nf));
    const idx = wide ? new Uint32Array(3 * nf) : new Uint16Array(3 * nf);
    let next = 0;
    for (let k = 0; k < 3 * nf; k++) {
      const c = codes[k];
      idx[k] = next - c;
      if (c === 0) next++;
    }
    return {
      nv: nv,
      pos: pos,
      idx: idx,
      col: col,
      src: src
    };
  }
  function build(m) {
    const g = new THREE.BufferGeometry;
    g.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeVertexNormals();
    if (m.col) {
      const app = new Float32Array(3 * m.nv);
      for (let k = 0; k < app.length; k++) app[k] = lin(m.col[k] / 255);
      g.userData.app = new THREE.BufferAttribute(app, 3);
    }
    if (m.src) {
      const src = new Float32Array(3 * m.nv);
      let ng = 0;
      for (let v = 0; v < m.nv; v++) {
        const c = m.src[v] ? SRC_RGB.gen : SRC_RGB.obs;
        ng += m.src[v];
        for (let a = 0; a < 3; a++) src[3 * v + a] = lin(c[a] / 255);
      }
      g.userData.src = new THREE.BufferAttribute(src, 3);
      g.userData.genShare = ng / m.nv;
    }
    return g;
  }
  function getMesh(key) {
    if (!cache[key] && window.FG_PACK) {
      if (!window.FG_PACK[key]) return Promise.reject(new Error("missing mesh " + key));
      cache[key] = unpack(window.FG_PACK[key]).then(build);
    }
    if (!cache[key]) cache[key] = loadScript(`assets/meshes/${key}.js`).then((() => {
      const r = window.FG_MESHES[key];
      delete window.FG_MESHES[key];
      const q = decode(r.p, Uint16Array), pos = new Float32Array(r.nv * 3);
      for (let v = 0; v < r.nv; v++) for (let a = 0; a < 3; a++) pos[3 * v + a] = r.lo[a] + q[3 * v + a] / 65535 * (r.hi[a] - r.lo[a]);
      const g = new THREE.BufferGeometry;
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setIndex(new THREE.BufferAttribute(decode(r.i, r.i32 ? Uint32Array : Uint16Array), 1));
      g.computeVertexNormals();
      if (r.c) {
        const c8 = decode(r.c, Uint8Array), app = new Float32Array(r.nv * 3);
        for (let k = 0; k < c8.length; k++) app[k] = lin(c8[k] / 255);
        g.userData.app = new THREE.BufferAttribute(app, 3);
      }
      if (r.s) {
        const s8 = decode(r.s, Uint8Array), src = new Float32Array(r.nv * 3);
        let ng = 0;
        for (let v = 0; v < r.nv; v++) {
          const c = s8[v] ? SRC_RGB.gen : SRC_RGB.obs;
          ng += s8[v];
          for (let a = 0; a < 3; a++) src[3 * v + a] = lin(c[a] / 255);
        }
        g.userData.src = new THREE.BufferAttribute(src, 3);
        g.userData.genShare = ng / r.nv;
      }
      return g;
    }));
    return cache[key];
  }
  class Orbit {
    constructor(o = {}) {
      this.az = o.az ?? -.9;
      this.el = o.el ?? .35;
      this.dist = o.dist ?? 2.2;
      this.target = o.target || [ 0, 0, 0 ];
      this.views = new Set;
      this.auto = o.auto ?? false;
      this.idle = 0;
    }
    set(o) {
      Object.assign(this, o);
      this.changed();
    }
    changed() {
      this.views.forEach((v => v.requestRender()));
    }
    attach(el) {
      let drag = null, engaged = false;
      el.addEventListener("pointerdown", (e => {
        drag = [ e.clientX, e.clientY ];
        engaged = true;
        this.auto = false;
        el.setPointerCapture(e.pointerId);
        el.classList.add("dragging");
      }));
      el.addEventListener("pointermove", (e => {
        if (!drag) return;
        this.az -= (e.clientX - drag[0]) * .008;
        this.el = Math.max(-1.45, Math.min(1.45, this.el + (e.clientY - drag[1]) * .008));
        drag = [ e.clientX, e.clientY ];
        this.changed();
      }));
      const up = () => {
        drag = null;
        el.classList.remove("dragging");
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", (() => engaged = false));
      el.addEventListener("wheel", (e => {
        if (!engaged) return;
        e.preventDefault();
        this.dist = Math.max(.4, Math.min(8, this.dist * Math.exp(e.deltaY * .001)));
        this.changed();
      }), {
        passive: false
      });
    }
  }
  class Viewer {
    constructor(el, orbit) {
      this.el = el;
      this.orbit = orbit || new Orbit;
      this.orbit.views.add(this);
      const r = this.renderer = new THREE.WebGLRenderer({
        antialias: true
      });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.outputEncoding = THREE.sRGBEncoding;
      r.setClearColor(16579835, 1);
      el.appendChild(r.domElement);
      this.scene = new THREE.Scene;
      this.camera = new THREE.PerspectiveCamera(30, 1, .01, 50);
      this.camera.up.set(0, 0, 1);
      this.scene.add(new THREE.HemisphereLight(16777215, 7828847, .95));
      const head = new THREE.DirectionalLight(16777215, .75);
      head.position.set(.3, .6, 1);
      this.camera.add(head);
      this.scene.add(this.camera);
      this.matColor = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: .85,
        metalness: 0
      });
      this.matFlat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#eb6834").convertSRGBToLinear(),
        roughness: .8,
        metalness: 0
      });
      this.mesh = null;
      this.mode = "app";
      this.token = 0;
      this.visible = true;
      this.orbit.attach(r.domElement);
      new ResizeObserver((() => this.resize())).observe(el);
      new IntersectionObserver((es => {
        this.visible = es[0].isIntersecting;
        if (this.visible) this.requestRender();
      })).observe(el);
      this.resize();
    }
    resize() {
      const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight || w);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.requestRender();
    }
    async show(key) {
      const tok = ++this.token;
      this.el.classList.add("loading");
      let g;
      try {
        g = await getMesh(key);
      } catch (e) {
        this.el.classList.remove("loading");
        this.el.dataset.error = e.message;
        return;
      }
      if (tok !== this.token) return;
      this.el.classList.remove("loading");
      if (this.mesh) this.scene.remove(this.mesh);
      this.mesh = new THREE.Mesh(g, g.userData.app ? this.matColor : this.matFlat);
      this.applyMode();
      this.scene.add(this.mesh);
      this.requestRender();
      return g;
    }
    setMode(mode) {
      this.mode = mode;
      this.applyMode();
      this.requestRender();
    }
    applyMode() {
      if (!this.mesh) return;
      const g = this.mesh.geometry, a = this.mode === "src" && g.userData.src ? g.userData.src : g.userData.app;
      if (a) {
        g.setAttribute("color", a);
        this.mesh.material = this.matColor;
      } else this.mesh.material = this.matFlat;
    }
    requestRender() {
      if (this.pending || !this.visible) return;
      this.pending = true;
      requestAnimationFrame((() => {
        this.pending = false;
        this.render();
      }));
    }
    render() {
      const o = this.orbit, c = this.camera, t = o.target;
      c.position.set(t[0] + o.dist * Math.cos(o.el) * Math.cos(o.az), t[1] + o.dist * Math.cos(o.el) * Math.sin(o.az), t[2] + o.dist * Math.sin(o.el));
      c.lookAt(t[0], t[1], t[2]);
      this.renderer.render(this.scene, c);
    }
  }
  let last = 0;
  const autos = new Set;
  function tick(ts) {
    const dt = Math.min(.05, (ts - last) / 1e3);
    last = ts;
    autos.forEach((o => {
      if (o.auto && [ ...o.views ].some((v => v.visible))) {
        o.az += dt * .35;
        o.changed();
      }
    }));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function frameObject(orbit, bbox) {
    const lo = bbox[0], hi = bbox[1], c = lo.map(((v, i) => (v + hi[i]) / 2));
    const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    orbit.set({
      target: c,
      dist: r / Math.sin(15 * Math.PI / 180) * 1.02
    });
  }
  window.FGView = {
    Orbit: Orbit,
    Viewer: Viewer,
    getMesh: getMesh,
    frameObject: frameObject,
    autoRotate: o => {
      o.auto = true;
      autos.add(o);
    }
  };
})();

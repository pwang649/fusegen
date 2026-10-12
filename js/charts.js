(function() {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const SURF = "#fcfcfb";
  const NARROW = 520;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, cls, anchor) {
    const t = el("text", {
      x: x,
      y: y,
      class: cls,
      "text-anchor": anchor || "start"
    }, parent);
    t.textContent = str;
    return t;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, step0 = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [ 1, 2, 5, 10 ].map((m => m * mag)).find((s => s >= step0)) || step0;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
    for (let v = a; v <= b + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function tipEl(host) {
    let t = host.querySelector(".chart-tip");
    if (!t) {
      t = document.createElement("div");
      t.className = "chart-tip";
      t.hidden = true;
      host.appendChild(t);
    }
    return t;
  }
  function tipRows(tip, head, rows) {
    tip.replaceChildren();
    const h = document.createElement("div");
    h.className = "hd";
    h.textContent = head;
    tip.appendChild(h);
    for (const r of rows) {
      const d = document.createElement("div");
      d.className = "row";
      const i = document.createElement("i");
      i.style.background = r.color;
      const b = document.createElement("b");
      b.textContent = r.value;
      const s = document.createElement("span");
      s.textContent = r.name;
      d.append(i, b, s);
      tip.appendChild(d);
    }
  }
  function place(tip, host, x, y) {
    const w = host.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, x + 14), Math.max(0, w - tw)) + "px";
    tip.style.top = y + "px";
  }
  function watch(host, draw) {
    host._draw = draw;
    if (host._ro) return;
    let w = host.clientWidth, pending = false;
    host._ro = new ResizeObserver((() => {
      if (host.clientWidth === w || pending) return;
      pending = true;
      requestAnimationFrame((() => {
        pending = false;
        w = host.clientWidth;
        host._draw();
      }));
    }));
    host._ro.observe(host);
  }
  function lineChart(host, opt) {
    const draw = () => {
      host.querySelectorAll("svg").forEach((s => s.remove()));
      const W = Math.max(240, host.clientWidth), Hh = opt.height || 300, narrow = W < NARROW;
      const showXLabel = opt.xLabel && (!opt.xFmt || narrow);
      const m = {
        l: 52,
        r: opt.endLabel && !narrow ? 118 : 18,
        t: opt.endLabel && narrow ? 26 : 14,
        b: showXLabel ? 42 : 30
      };
      const svg = el("svg", {
        viewBox: `0 0 ${W} ${Hh}`,
        role: "img",
        "aria-label": opt.aria || "chart"
      });
      host.prepend(svg);
      const vis = opt.series.filter((s => !(opt.hidden && opt.hidden.has(s.key))));
      const all = vis.flatMap((s => s.values)).filter((v => v != null));
      if (!all.length) return;
      let lo = Math.min(...all), hi = Math.max(...all);
      if (opt.zero) lo = 0;
      const pad = (hi - lo) * .08 || 1;
      const ticks = niceTicks(opt.zero ? 0 : lo - pad, hi + pad, 5);
      const y0 = ticks[0], y1 = ticks[ticks.length - 1];
      const dec = Math.max(0, Math.ceil(-Math.log10(ticks[1] - ticks[0]) - 1e-9));
      const xs = opt.x, xmin = xs[0], xmax = xs[xs.length - 1], ins = opt.xFmt ? 26 : 8;
      const X = v => m.l + ins + (v - xmin) / (xmax - xmin) * (W - m.l - m.r - 2 * ins);
      const Y = v => Hh - m.b - (v - y0) / (y1 - y0) * (Hh - m.t - m.b);
      for (const tk of ticks) {
        el("line", {
          x1: m.l,
          x2: W - m.r,
          y1: Y(tk),
          y2: Y(tk),
          class: tk === y0 ? "basel" : "gridl"
        }, svg);
        text(svg, m.l - 8, Y(tk) + 4, opt.fmt(tk, true, dec), "tick", "end");
      }
      const xt = opt.xTicks || xs;
      for (const v of xt) text(svg, X(v), Hh - m.b + 18, opt.xFmt && !narrow ? opt.xFmt(v) : String(v), "tick", "middle");
      if (showXLabel) text(svg, (m.l + W - m.r) / 2, Hh - 6, opt.xLabel, "axis-l", "middle");
      for (const s of vis) {
        const d = s.values.map(((v, i) => v == null ? null : `${X(xs[i])},${Y(v)}`)).filter(Boolean).join(" L");
        el("path", {
          d: "M" + d,
          fill: "none",
          stroke: s.color,
          "stroke-width": 2,
          "stroke-linejoin": "round",
          "stroke-linecap": "round"
        }, svg);
        if (!opt.noDots) s.values.forEach(((v, i) => v != null && el("circle", {
          cx: X(xs[i]),
          cy: Y(v),
          r: 4,
          fill: s.color,
          stroke: SURF,
          "stroke-width": 2
        }, svg)));
      }
      if (opt.markers) for (const mk of opt.markers) {
        const s = vis[0];
        const i = xs.indexOf(mk.x);
        if (i < 0) continue;
        el("circle", {
          cx: X(mk.x),
          cy: Y(s.values[i]),
          r: 4.5,
          fill: "#0b0b0b",
          stroke: SURF,
          "stroke-width": 2
        }, svg);
      }
      if (opt.endLabel) {
        const s = vis.find((q => q.key === opt.endLabel));
        if (s) {
          const v = s.values[s.values.length - 1], str = `${s.label || s.name} ${opt.fmt(v)}`;
          if (narrow) {
            const others = vis.filter((q => q !== s)).map((q => Y(q.values[q.values.length - 1])));
            const yv = Y(v), roomAbove = yv - 12 - 13 >= 2, roomBelow = yv + 20 <= Hh - m.b - 4;
            const clashAbove = others.some((o => o < yv && yv - o < 22)), clashBelow = others.some((o => o > yv && o - yv < 26));
            let below = opt.lowerBetter;
            if (below && (!roomBelow || clashBelow) && roomAbove && !clashAbove) below = false; else if (!below && (!roomAbove || clashAbove) && roomBelow && !clashBelow) below = true;
            text(svg, X(xmax), below ? yv + 20 : yv - 12, str, "dlabel", "end");
          } else text(svg, X(xmax) + 10, Y(v) + 4, str, "dlabel");
        }
      }
      const tip = tipEl(host), xh = el("line", {
        y1: m.t,
        y2: Hh - m.b,
        class: "xhair",
        visibility: "hidden"
      }, svg);
      const hit = el("rect", {
        x: m.l - 10,
        y: 0,
        width: W - m.l - m.r + 20,
        height: Hh,
        fill: "transparent"
      }, svg);
      const show = (px, py) => {
        let bi = 0, bd = Infinity;
        xs.forEach(((v, i) => {
          const d = Math.abs(X(v) - px);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }));
        xh.setAttribute("x1", X(xs[bi]));
        xh.setAttribute("x2", X(xs[bi]));
        xh.setAttribute("visibility", "visible");
        const rows = vis.filter((s => s.values[bi] != null)).map((s => ({
          name: s.name,
          color: s.color,
          v: s.values[bi],
          value: opt.fmt(s.values[bi])
        })));
        rows.sort(((a, b) => opt.lowerBetter ? a.v - b.v : b.v - a.v));
        const extra = opt.tipExtra ? opt.tipExtra(xs[bi]) : "";
        tipRows(tip, (opt.tipHead ? opt.tipHead(xs[bi]) : `frame ${xs[bi]}`) + extra, rows);
        tip.hidden = false;
        const r = svg.getBoundingClientRect(), sc = r.width / W;
        place(tip, host, X(xs[bi]) * sc, Math.max(0, py * sc - 20));
      };
      const hide = () => {
        tip.hidden = true;
        xh.setAttribute("visibility", "hidden");
      };
      const loc = e => {
        const r = svg.getBoundingClientRect(), sc = W / r.width;
        return [ (e.clientX - r.left) * sc, (e.clientY - r.top) * sc ];
      };
      hit.addEventListener("pointermove", (e => {
        if (e.pointerType === "mouse") show(...loc(e));
      }));
      hit.addEventListener("pointerdown", (e => show(...loc(e))));
      hit.addEventListener("pointerleave", (e => {
        if (e.pointerType === "mouse") hide();
      }));
      if (!host._outside) {
        host._outside = e => {
          if (!host.contains(e.target)) host._hide && host._hide();
        };
        document.addEventListener("pointerdown", host._outside);
      }
      host._hide = hide;
    };
    draw();
    watch(host, draw);
    return {
      redraw: draw
    };
  }
  function barChart(host, opt) {
    const draw = () => {
      host.querySelectorAll("svg").forEach((s => s.remove()));
      const W = Math.max(240, host.clientWidth), bar = 18, stack = W < NARROW, gap = stack ? 34 : 14;
      const labelW = stack ? 8 : Math.min(230, W * .36);
      const m = {
        l: labelW,
        r: 62,
        t: stack ? 16 : 6,
        b: 26
      }, Hh = m.t + m.b + opt.rows.length * (bar + gap);
      const svg = el("svg", {
        viewBox: `0 0 ${W} ${Hh}`,
        role: "img",
        "aria-label": opt.aria || "bar chart"
      });
      host.prepend(svg);
      const max = opt.max || Math.max(...opt.rows.map((r => r.value)));
      const ticks = niceTicks(0, max, 4), X = v => m.l + v / ticks[ticks.length - 1] * (W - m.l - m.r);
      for (const tk of ticks) {
        el("line", {
          x1: X(tk),
          x2: X(tk),
          y1: m.t,
          y2: Hh - m.b,
          class: tk === 0 ? "basel" : "gridl"
        }, svg);
        text(svg, X(tk), Hh - m.b + 17, opt.fmt(tk, true), "tick", "middle");
      }
      const tip = tipEl(host);
      opt.rows.forEach(((r, i) => {
        const y = m.t + i * (bar + gap) + (stack ? gap - 8 : gap / 2), w = Math.max(2, X(r.value) - X(0)), rr = Math.min(4, w / 2);
        if (stack) text(svg, m.l, y - 6, r.name, r.ours ? "dlabel" : "dlabel2", "start"); else text(svg, m.l - 10, y + bar / 2 + 4, r.name, r.ours ? "dlabel" : "dlabel2", "end");
        const g = el("g", {
          tabindex: 0
        }, svg);
        el("path", {
          d: `M${X(0)},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${bar - 2 * rr} a${rr},${rr} 0 0 1 -${rr},${rr} h-${w - rr} z`,
          fill: r.color
        }, g);
        el("rect", {
          x: X(0),
          y: y - (stack ? 20 : gap / 2),
          width: W - m.l,
          height: bar + (stack ? 24 : gap),
          fill: "transparent"
        }, g);
        text(svg, X(0) + w + 8, y + bar / 2 + 4, opt.fmt(r.value), r.ours ? "dlabel" : "dlabel2");
        const on = () => {
          tipRows(tip, r.name, [ {
            name: "s per new frame",
            color: r.color,
            value: opt.fmt(r.value)
          } ]);
          tip.hidden = false;
          const rc = svg.getBoundingClientRect(), sc = rc.width / W;
          place(tip, host, (X(0) + w) * sc, (y - 6) * sc);
        };
        g.addEventListener("pointermove", on);
        g.addEventListener("pointerdown", on);
        g.addEventListener("focus", on);
        g.addEventListener("pointerleave", (e => {
          if (e.pointerType === "mouse") tip.hidden = true;
        }));
        g.addEventListener("blur", (() => tip.hidden = true));
      }));
    };
    draw();
    watch(host, draw);
  }
  window.FGCharts = {
    lineChart: lineChart,
    barChart: barChart
  };
})();

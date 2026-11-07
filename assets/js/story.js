/* Thesis in five scenes: an illustrative 20 s loop beside the thesis text.
   1 Clean the signal · 2 Measure the rhythm · 3 Summarise 180 days · 4 One row per person ·
   5 Test on unseen people. Inline SVG + vanilla JS, no libraries. Each scene ends on the frame
   the next one starts from, so the cut between scenes is invisible. Pauses off-screen, when the tab is
   hidden, and on hover/focus; the dots jump to a scene. Reduced motion: a static storyboard. */
(function () {
  'use strict';
  var fig = document.querySelector('[data-story]');
  if (!fig) return;
  var NS = 'http://www.w3.org/2000/svg', W = 480, H = 320, SCENE = 4, N = 5, LOOP = SCENE * N;
  var SCENES = [
    ['Clean the signal', '249.3 M → 101.3 M windows'],
    ['Measure the rhythm', '27 PRV indices'],
    ['Summarise 180 days', 'day & night · 11 statistics'],
    ['One row per person', '344 people × 594 features'],
    ['Test on unseen people', '+0.30 ROC-AUC over age + sex']
  ];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- maths & easing (strong ease-out for arrivals, ease-in-out for moves) ----
  function c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(L, a, b) { return c01((L - a) / (b - a)); }
  function eo(t) { return 1 - Math.pow(1 - t, 4); }
  function eio(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
  function ppg(p) { return g(p, 0.2, 0.055) + 0.42 * g(p, 0.43, 0.075) - 0.06 * g(p, 0.33, 0.02); }
  function out(L) { return 1 - eio(seg(L, 3.6, 3.95)); } // exits are shorter than entrances

  // ---- the signal (shared by scenes 1-2) ----
  var X0 = 12, X1 = 468, BASE = 205, AMP = 100, P = 46, OFF = 10, BURSTS = [[118, 178], [298, 348]];
  function burst(x, pad) {
    for (var i = 0; i < BURSTS.length; i++) if (x > BURSTS[i][0] - pad && x < BURSTS[i][1] + pad) return BURSTS[i];
    return null;
  }
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
  var RAW = '', CLEAN = '', GAPS = '', pen = false;
  for (var x = X0; x <= X1; x += 2) {
    var v = ppg(((x + OFF) % P) / P), b = burst(x, 0), n = rnd() * 0.12 + 0.08 * Math.sin(x / 41);
    if (b) n += Math.sin(Math.PI * (x - b[0]) / (b[1] - b[0])) * (0.9 * Math.sin(x * 0.6) + 0.7 * rnd() + 0.5 * Math.sin(x * 0.23));
    RAW += (x > X0 ? 'L' : 'M') + x + ' ' + (BASE - (v * 0.8 + n) * AMP).toFixed(1);
    if (burst(x, 3)) { pen = false; continue; }
    CLEAN += (pen ? 'L' : 'M') + x + ' ' + (BASE - v * AMP).toFixed(1);
    pen = true;
  }
  BURSTS.forEach(function (b) { GAPS += 'M' + (b[0] - 3) + ' ' + BASE + 'H' + (b[1] + 3); });
  var PEAKS = [];
  for (var k = 0; k * P < X1 + P; k++) {
    var px = k * P + 0.2 * P - OFF;
    if (px > X0 + 2 && px < X1 - 2 && !burst(px, 14)) PEAKS.push([px, BASE - ppg(0.2) * AMP]);
  }

  // ---- one stage = one SVG with all five scenes; render(t) draws the frame at time t ----
  function stage(svg) {
    function el(name, a, parent) {
      var e = document.createElementNS(NS, name);
      for (var key in a) e.setAttribute(key, a[key]);
      (parent || svg).appendChild(e);
      return e;
    }
    function txt(s, a, parent) { var t = el('text', a, parent); t.textContent = s; return t; }
    function op(e, o) { e.style.opacity = o.toFixed(3); }
    var G = SCENES.map(function () { return el('g', { 'class': 'st-scene' }); });

    // Scene 1: raw grey -> scan band -> clean orange pulses with a dot on each beat
    var s1 = G[0];
    var uid = 'st' + (stage.n = (stage.n || 0) + 1), defs = el('defs', {}, s1);
    var clipR = el('rect', { x: 0, y: 0, width: 0, height: H }, el('clipPath', { id: uid + 'd' }, defs));
    var clipT = el('rect', { x: 0, y: 0, width: W, height: H }, el('clipPath', { id: uid + 't' }, defs));
    var todo = el('g', { 'clip-path': 'url(#' + uid + 't)' }, s1), done = el('g', { 'clip-path': 'url(#' + uid + 'd)' }, s1);
    var raw = el('path', { 'class': 'st-raw', d: RAW, pathLength: 1 }, todo);
    el('path', { 'class': 'st-gap', d: GAPS }, done);
    el('path', { 'class': 'st-clean', d: CLEAN }, done);
    var band = el('rect', { 'class': 'st-band', y: 40, width: 34, height: 200, rx: 8 }, s1);
    var dots1 = PEAKS.map(function (p) { return el('circle', { 'class': 'st-dot', cx: p[0], cy: p[1], r: 4 }, s1); });

    // Scene 2: same frame, then inter-beat intervals, then index chips gather into "27"
    var s2 = G[1], trace2 = el('g', {}, s2);
    el('path', { 'class': 'st-gap', d: GAPS }, trace2);
    el('path', { 'class': 'st-clean', d: CLEAN }, trace2);
    PEAKS.forEach(function (p) { el('circle', { 'class': 'st-dot', cx: p[0], cy: p[1], r: 4 }, trace2); });
    var ticks = [];
    for (var i = 1; i < PEAKS.length; i++) {
      if (PEAKS[i][0] - PEAKS[i - 1][0] > P * 1.5) continue; // no interval across a rejected window
      var y = PEAKS[i][1] - 14, a = PEAKS[i - 1][0] + 4, z = PEAKS[i][0] - 4;
      ticks.push(el('path', { 'class': 'st-tick', d: 'M' + a + ' ' + (y + 4) + 'V' + y + 'H' + z + 'V' + (y + 4), pathLength: 1 }, s2));
    }
    var chips = ['RMSSD', 'SDNN', 'LF/HF', 'SD1/SD2', 'Entropy'].map(function (s) {
      var c = el('g', { 'class': 'st-chip' }, s2);
      return { g: c, r: el('rect', { rx: 6, height: 26 }, c), t: txt(s, { 'class': 'st-t', y: 0 }, c), x: 0, y: 0, w: 0 };
    });
    var badge = el('g', {}, s2);
    el('circle', { 'class': 'st-badge', cx: 240, cy: 150, r: 38 }, badge);
    txt('27', { 'class': 'st-big', x: 240, y: 150 }, badge);

    // Scene 3: 180 day cells (day half light, night half dark) -> one distribution -> 11 ticks
    var s3 = G[2], cells = [], CW = 20, CH = 12, CX = (W - (18 * 23 - 3)) / 2, CY = 44;
    for (var d = 0; d < 180; d++) {
      var cx = CX + (d % 18) * 23, cy = CY + Math.floor(d / 18) * 16, cg = el('g', {}, s3);
      cells.push({ g: cg, day: el('rect', { 'class': 'st-day', x: cx, y: cy, width: CW / 2, height: CH }, cg), night: el('rect', { 'class': 'st-night', x: cx + CW / 2, y: cy, width: CW / 2, height: CH }, cg) });
    }
    var CB = 214, curveD = '';
    for (var cxp = 56; cxp <= 424; cxp += 4) {
      var u = (cxp - 56) / 368, dens = Math.pow(u, 1.6) * Math.pow(1 - u, 3.2) / 0.0388;
      curveD += (cxp > 56 ? 'L' : 'M') + cxp + ' ' + (CB - dens * 150).toFixed(1);
    }
    var axis = el('path', { 'class': 'st-axis', d: 'M48 ' + CB + 'H432' }, s3);
    var curve = el('path', { 'class': 'st-curve', d: curveD, pathLength: 1 }, s3);
    var stTicks = [0.1, 0.17, 0.25, 0.31, 0.36, 0.42, 0.5, 0.58, 0.66, 0.75, 0.86].map(function (q) {
      var tx = 56 + q * 368;
      return el('line', { 'class': 'st-sticks', x1: tx, x2: tx, y1: CB, y2: CB }, s3);
    });
    var lab3 = el('g', {}, s3);
    txt('mean · median · q10–q90 · SD', { 'class': 'st-t', x: 240, y: CB + 34 }, lab3);
    txt('IQR · CV · skew · kurtosis', { 'class': 'st-t', x: 240, y: CB + 54 }, lab3);

    // Scenes 4-5 share the matrix: 24 rows imply all 344 people; each row is 594 feature cells
    function matrix(parent, cls) {
      var rows = [];
      for (var r = 0; r < 24; r++) rows.push(el('line', { 'class': cls, x1: 40, x2: 440, y1: 104 + r * 5.2, y2: 104 + r * 5.2 }, parent));
      return rows;
    }
    var s4 = G[3], rows4 = matrix(s4, 'st-row');
    var more = el('g', {}, s4);
    [0, 1, 2].forEach(function (j) { el('circle', { 'class': 'st-more', cx: 240, cy: 236 + j * 8, r: 1.8 }, more); });
    var formula = txt('27 × 2 × 11 = 594', { 'class': 'st-mid', x: 240, y: 62 }, s4);

    var s5 = G[4], rows5 = matrix(s5, 'st-row');
    var models = [['Logistic', 'Regression'], ['Random', 'Forest'], ['XGBoost', ''], ['SVM', '']].map(function (m, j) {
      var mx = 75 + j * 110, mg = el('g', {}, s5);
      var dot = el('circle', { 'class': 'st-model', cx: mx, cy: 26, r: 5 }, mg);
      txt(m[0], { 'class': 'st-t', x: mx, y: 50 }, mg);
      if (m[1]) txt(m[1], { 'class': 'st-t', x: mx, y: 66 }, mg);
      return { g: mg, dot: dot };
    });
    var BX = 60, BW = 360, bar = el('g', {}, s5);
    el('line', { 'class': 'st-axis', x1: BX, x2: BX + BW, y1: 270, y2: 270 }, bar);
    el('line', { 'class': 'st-axis', x1: BX, x2: BX, y1: 262, y2: 278 }, bar);
    var fill = el('rect', { 'class': 'st-fill', x: BX, y: 264, width: 0, height: 12 }, bar);
    var res = txt('+0.30', { 'class': 'st-res', x: BX, y: 248 }, bar);
    var note = txt('prodromal: no added value', { 'class': 'st-note', x: BX, y: 302 }, bar);

    // chips are laid out from their measured text width (text keeps a constant screen size)
    function layout() {
      var w = svg.getBoundingClientRect().width || W;
      svg.style.setProperty('--u', (W / w).toFixed(3));
      var was = G[1].style.display; G[1].style.display = '';
      var widths = chips.map(function (c) { return c.t.getBBox().width + 18; }), gap = 8;
      G[1].style.display = was;
      var total = widths.reduce(function (s, v) { return s + v; }, 0) + gap * (chips.length - 1);
      var perRow = total > W - 24 ? 3 : chips.length, rowsN = Math.ceil(chips.length / perRow);
      for (var r = 0; r < rowsN; r++) {
        var idx = chips.slice(r * perRow, r * perRow + perRow), ws = widths.slice(r * perRow, r * perRow + perRow);
        var rw = ws.reduce(function (s, v) { return s + v; }, 0) + gap * (ws.length - 1), cx = (W - rw) / 2;
        idx.forEach(function (c, j) {
          c.w = ws[j]; c.x = cx; c.y = 254 - (rowsN - 1) * 18 + r * 36;
          c.r.setAttribute('width', c.w.toFixed(1)); c.r.setAttribute('x', 0); c.r.setAttribute('y', -13);
          c.t.setAttribute('x', (c.w / 2).toFixed(1)); cx += c.w + gap;
        });
      }
    }

    function render(t) {
      var s = Math.min(N - 1, Math.floor(t / SCENE)), L = t - s * SCENE;
      G.forEach(function (gr, j) { gr.style.display = j === s ? '' : 'none'; });
      var o;
      if (s === 0) {
        raw.style.strokeDashoffset = (1 - eio(seg(L, 0, 1.1))).toFixed(3);
        var e = eio(seg(L, 1.1, 2.5)), bx = lerp(-40, W + 10, e), edge = Math.max(0, Math.min(W, bx + 17));
        band.setAttribute('x', bx.toFixed(1)); op(band, L > 1.1 && L < 2.5 ? 1 : 0);
        clipR.setAttribute('width', edge.toFixed(1));
        clipT.setAttribute('x', edge.toFixed(1)); clipT.setAttribute('width', (W - edge).toFixed(1));
        dots1.forEach(function (dot, i) { var p = eo(seg(L, 2.5 + i * 0.07, 2.85 + i * 0.07)); op(dot, p); dot.setAttribute('r', (2.6 + 1.4 * p).toFixed(2)); });
      } else if (s === 1) {
        op(trace2, 1 - 0.85 * eio(seg(L, 1.2, 1.7)));
        ticks.forEach(function (tk, i) {
          tk.style.strokeDashoffset = (1 - eo(seg(L, 0.1 + i * 0.07, 0.45 + i * 0.07))).toFixed(3);
          op(tk, 1 - eio(seg(L, 1.2, 1.7)));
        });
        chips.forEach(function (c, i) {
          var a = eo(seg(L, 1.4 + i * 0.08, 1.8 + i * 0.08)), m = eio(seg(L, 2.4 + i * 0.05, 3.0 + i * 0.05));
          var x0 = c.x + c.w / 2, y0 = c.y;
          var cx = lerp(x0, 240, m), cy = lerp(y0 + (1 - a) * 8, 150, m), sc = lerp(0.94 + 0.06 * a, 0.6, m);
          c.g.setAttribute('transform', 'translate(' + (cx - c.w / 2 * sc).toFixed(1) + ' ' + cy.toFixed(1) + ') scale(' + sc.toFixed(3) + ')');
          op(c.g, a * (1 - m));
          c.g.classList.toggle('is-on', L < 2.4 && i === Math.min(chips.length - 1, Math.floor((L - 1.4) / 0.08)));
        });
        o = eo(seg(L, 2.8, 3.3));
        badge.setAttribute('transform', 'translate(240 150) scale(' + (0.9 + 0.1 * o).toFixed(3) + ') translate(-240 -150)');
        op(badge, o * out(L));
      } else if (s === 2) {
        var fade = 1 - 0.88 * eio(seg(L, 1.6, 2.2));
        cells.forEach(function (c, i) {
          var at = 0.1 + i * (1.25 / 180), a = eo(seg(L, at, at + 0.2));
          op(c.g, a * fade); c.day.classList.toggle('is-on', L > at && L < at + 0.3);
        });
        op(axis, eo(seg(L, 1.6, 2.0)) * out(L));
        curve.style.strokeDashoffset = (1 - eio(seg(L, 1.7, 2.6))).toFixed(3); op(curve, out(L));
        stTicks.forEach(function (tk, i) { tk.setAttribute('y1', (CB - 14 * eo(seg(L, 2.5 + i * 0.04, 2.85 + i * 0.04))).toFixed(1)); op(tk, out(L)); });
        op(lab3, eo(seg(L, 2.9, 3.3)) * out(L));
        cells.forEach(function (c) { if (L > 3.6) op(c.g, 0.12 * out(L)); });
      } else if (s === 3) {
        rows4.forEach(function (r, i) {
          var at = 0.1 + i * 0.07, a = eo(seg(L, at, at + 0.4));
          r.setAttribute('transform', 'translate(' + (40 * (1 - a)).toFixed(1) + ' 0)'); op(r, a);
          r.classList.toggle('is-on', L < 2.0 && i === Math.min(23, Math.floor((L - 0.1) / 0.07)));
        });
        op(more, eo(seg(L, 2.0, 2.4)) * out(L));
        o = eo(seg(L, 2.3, 2.8));
        formula.setAttribute('transform', 'translate(0 ' + (6 * (1 - o)).toFixed(1) + ')'); op(formula, o * out(L));
      } else {
        var all = out(L);
        models.forEach(function (m, j) { op(m.g, eo(seg(L, 0.1 + j * 0.08, 0.5 + j * 0.08)) * all); });
        var fold = L >= 0.6 && L < 2.2 ? Math.floor((L - 0.6) / 0.4) : -1;
        rows5.forEach(function (r, i) { r.classList.toggle('is-test', fold >= 0 && i % 4 === fold); op(r, all); });
        models.forEach(function (m, j) { m.dot.classList.toggle('is-on', j === fold || L >= 2.2); });
        var f = eo(seg(L, 2.3, 3.1));
        fill.setAttribute('width', (BW * 0.75 * f).toFixed(1));
        res.setAttribute('x', (BX + BW * 0.75 * f).toFixed(1)); op(res, seg(L, 2.6, 3.0));
        op(note, eo(seg(L, 2.9, 3.3)) * all); op(bar, eo(seg(L, 2.1, 2.4)) * all);
      }
      return s;
    }
    layout();
    return { render: render, layout: layout };
  }

  // ---- reduced motion: a static storyboard, the last frame of each scene ----
  if (reduce) {
    var board = document.createElement('ol');
    board.className = 'story-board';
    SCENES.forEach(function (sc, i) {
      var li = document.createElement('li');
      li.innerHTML = '<p class="story-cap"><b>' + sc[0] + '</b><span>' + sc[1] + '</span></p>';
      var sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('viewBox', '0 0 ' + W + ' ' + H); sv.setAttribute('class', 'story-svg'); sv.setAttribute('aria-hidden', 'true');
      li.appendChild(sv); board.appendChild(li);
    });
    fig.querySelector('.story-play').after(board);
    board.querySelectorAll('svg').forEach(function (sv, i) { stage(sv).render(i * SCENE + 3.55); });
    fig.classList.add('is-static');
    return;
  }

  // ---- motion ----
  var svg = fig.querySelector('.story-svg'), st = stage(svg);
  var label = fig.querySelector('[data-story-label]'), figure = fig.querySelector('[data-story-fig]');
  var dots = Array.prototype.slice.call(fig.querySelectorAll('[data-scene]'));
  var t = 0, last = 0, running = false, visible = false, held = false, shown = -1;
  function paint() {
    var s = st.render(t);
    if (s !== shown) {
      shown = s; label.textContent = SCENES[s][0]; figure.textContent = SCENES[s][1];
      dots.forEach(function (d, i) { d.setAttribute('aria-current', i === s ? 'step' : 'false'); });
    }
    var bar = dots[s].firstElementChild;
    if (bar) bar.style.transform = 'scaleX(' + ((t - s * SCENE) / SCENE).toFixed(3) + ')';
  }
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!document.hidden && !held) { t = (t + dt) % LOOP; paint(); }
    requestAnimationFrame(frame);
  }
  function sync() {
    var want = visible;
    if (want && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    if (!want) running = false;
  }
  fig.addEventListener('pointerenter', function () { held = true; fig.classList.add('is-held'); });
  fig.addEventListener('pointerleave', function () { held = fig.contains(document.activeElement); fig.classList.toggle('is-held', held); });
  fig.addEventListener('focusin', function () { held = true; fig.classList.add('is-held'); });
  fig.addEventListener('focusout', function (e) { if (!fig.contains(e.relatedTarget)) { held = fig.matches(':hover'); fig.classList.toggle('is-held', held); } });
  dots.forEach(function (d, i) { d.addEventListener('click', function () { t = i * SCENE + 0.001; paint(); }); });
  window.addEventListener('resize', function () { st.layout(); paint(); });
  paint();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }, { threshold: 0.2 }).observe(fig);
  } else { visible = true; sync(); }
})();

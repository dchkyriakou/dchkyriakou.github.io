/* "Raw wrist signal in, clean beats out": illustrative 8 s loop beside the thesis.
   Grey raw trace draws in, a scan band turns it into clean orange pulses (windows with
   motion bursts are left empty, as rejected), dots pop on each beat, a counter reads the
   total. Pauses off-screen; reduced motion shows the final frame. No libraries. */
(function () {
  'use strict';
  var fig = document.querySelector('[data-beats]');
  if (!fig) return;
  var svg = fig.querySelector('svg');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 640, H = 240, BASE = 170, AMP = 105, P = 62, OFF = 14;
  var BURSTS = [[170, 250], [420, 486]];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
  function ppg(p) { return g(p, 0.2, 0.055) + 0.42 * g(p, 0.43, 0.075) - 0.06 * g(p, 0.33, 0.02); }
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
  function inBurst(x, pad) {
    for (var i = 0; i < BURSTS.length; i++) if (x > BURSTS[i][0] - (pad || 0) && x < BURSTS[i][1] + (pad || 0)) return BURSTS[i];
    return null;
  }

  // ---- build the paths once ----
  var raw = '', clean = '', gaps = '', pen = false;
  for (var x = 0; x <= W; x += 2) {
    var ph = ((x + OFF) % P) / P, v = ppg(ph);
    var b = inBurst(x), noise = rnd() * 0.12 + 0.08 * Math.sin(x / 47);
    if (b) {
      var k = Math.sin(Math.PI * (x - b[0]) / (b[1] - b[0]));
      noise += k * (0.9 * Math.sin(x * 0.55) + 0.7 * rnd() + 0.5 * Math.sin(x * 0.21));
    }
    raw += (x ? 'L' : 'M') + x + ' ' + (BASE - (v * 0.8 + noise) * AMP).toFixed(1);
    if (inBurst(x, 4)) { pen = false; continue; }
    clean += (pen ? 'L' : 'M') + x + ' ' + (BASE - v * AMP).toFixed(1);
    pen = true;
  }
  BURSTS.forEach(function (b) { gaps += 'M' + (b[0] - 4) + ' ' + BASE + 'H' + (b[1] + 4); });

  var peaks = [];
  for (var n = 0; n * P < W + P; n++) {
    var px = n * P + 0.2 * P - OFF;
    if (px > 3 && px < W - 3 && !inBurst(px, 4)) peaks.push(px); // every peak the clean trace shows
  }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    (parent || svg).appendChild(e);
    return e;
  }
  var defs = el('defs', {});
  var cpDone = el('clipPath', { id: 'bt-done' }, defs), rDone = el('rect', { x: 0, y: 0, width: 0, height: H }, cpDone);
  var cpTodo = el('clipPath', { id: 'bt-todo' }, defs), rTodo = el('rect', { x: 0, y: 0, width: W, height: H }, cpTodo);
  var stage = el('g', { 'class': 'bt-stage' });
  var gTodo = el('g', { 'clip-path': 'url(#bt-todo)' }, stage);
  var pRaw = el('path', { 'class': 'bt-raw', d: raw, pathLength: 1 }, gTodo);
  var gDone = el('g', { 'clip-path': 'url(#bt-done)' }, stage);
  el('path', { 'class': 'bt-gap', d: gaps }, gDone);
  el('path', { 'class': 'bt-clean', d: clean }, gDone);
  var band = el('rect', { 'class': 'bt-band', x: -60, y: 0, width: 44, height: H, rx: 10 }, stage);
  var dots = peaks.map(function (px) {
    var ph = ((px + OFF) % P) / P;
    return el('circle', { 'class': 'bt-dot', cx: px.toFixed(1), cy: (BASE - ppg(ph) * AMP).toFixed(1), r: 0 }, stage);
  });
  var counter = fig.querySelector('[data-beats-count]');

  // ---- timeline (seconds) ----
  var T_DRAW = 2.4, T_SCAN = 4.8, T_DOTS = 6.0, T_HOLD = 7.5, T_END = 8.0;
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function pop(t) { // ease-out-back: 0 -> slight overshoot -> 1
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var c1 = 1.70158, c3 = c1 + 1, u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  // keep dots about 4.6 px on screen at any width (radius is in viewBox units)
  var R = 4.6;
  function sizeDots() { var w = svg.getBoundingClientRect().width || W; R = 4.6 * Math.min(2, Math.max(1, W / w)); }
  sizeDots();
  window.addEventListener('resize', function () { sizeDots(); if (reduce) render(T_HOLD); });
  var shown = -1;
  function render(t) {
    pRaw.style.strokeDashoffset = String(1 - ease(clamp01(t / T_DRAW)));
    var s = ease(clamp01((t - T_DRAW) / (T_SCAN - T_DRAW)));
    var bx = -60 + s * (W + 80), edge = Math.max(0, Math.min(W, bx + 22));
    band.setAttribute('x', bx.toFixed(1));
    band.style.opacity = t > T_DRAW && t < T_SCAN ? '1' : '0';
    rDone.setAttribute('width', edge.toFixed(1));
    rTodo.setAttribute('x', edge.toFixed(1));
    rTodo.setAttribute('width', (W - edge).toFixed(1));
    var k = (t - T_SCAN) / (T_DOTS - T_SCAN) * dots.length, count = 0;
    dots.forEach(function (d, i) {
      var p = clamp01((k - i) / 1.6);
      d.setAttribute('r', (R * pop(p)).toFixed(2));
      if (p > 0) count++;
    });
    if (count !== shown) { shown = count; counter.textContent = String(count); }
    stage.style.opacity = t > T_HOLD ? String(1 - clamp01((t - T_HOLD) / (T_END - T_HOLD))) : '1';
  }

  if (reduce) { render(T_HOLD); return; }

  var t = 0, last = 0, running = false;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!document.hidden) { t = (t + dt) % T_END; render(t); }
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function stop() { running = false; }
  render(0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) start(); else stop(); }, { threshold: 0.15 }).observe(fig);
  } else { start(); }
})();

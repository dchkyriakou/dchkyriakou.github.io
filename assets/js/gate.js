/* Thesis signal-quality gate. Illustrative trace; the figures are the thesis's own
   (249.3 M candidate windows -> 101.3 M clean, +0.298..0.323 ROC-AUC).
   No intermediate per-stage counts are shown, because the thesis summary does not give them. */
(function () {
  'use strict';

  var gate = document.getElementById('gate');
  if (!gate) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  var STAGES = ['motion', 'shape', 'template', 'buffer'];
  var LABELS = { motion: 'Motion', shape: 'Shape', template: 'Template', buffer: 'Buffer' };
  // Ten 30-second windows; four survive all stages (40%, close to the thesis's 40.6%).
  var TYPES = ['clean', 'motion', 'buffer', 'clean', 'shape', 'template', 'clean', 'motion', 'buffer', 'clean'];
  var KEPT_ALL = TYPES.filter(function (t) { return t === 'clean'; }).length;

  var svg = gate.querySelector('.gate-svg');
  var gWin = svg.querySelector('.gate-windows');
  var gTr = svg.querySelector('.gate-traces');
  var countEl = gate.querySelector('[data-gate="windows"]');
  var countLabel = gate.querySelector('[data-gate="windows-label"]');
  var traceCount = gate.querySelector('[data-gate="trace-count"]');
  var result = gate.querySelector('[data-gate="result"]');
  var live = gate.querySelector('[data-gate="live"]');
  var buttons = {};
  gate.querySelectorAll('[data-stage-btn]').forEach(function (b) { buttons[b.dataset.stageBtn] = b; });

  var active = new Set();
  var shown = 249.3;
  var windows = [];
  var glint = null;
  var clip = null;

  function ppg(p) {
    if (window.__ppg) return window.__ppg(p);
    function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
    return g(p, 0.2, 0.055) + 0.42 * g(p, 0.43, 0.075);
  }
  function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  /* Signal value (roughly -1..1.6) for a window type at local position u (0..1) and beat phase */
  function sample(type, u, x, period, rand, beat) {
    var ph = (x % period) / period;
    var n = (rand() - 0.5);
    switch (type) {
      case 'motion':
        return 0.35 * ppg(ph) + 0.9 * Math.sin(u * 9.5) + 0.5 * Math.sin(u * 23 + 1) + n * 0.7;
      case 'buffer':
        return ppg(ph) + 0.75 * Math.exp(-u * 3.2) * Math.sin(u * 14) + n * 0.12;
      case 'shape':
        return 0.85 * g(ph, 0.3, 0.16) + 0.7 * g(ph, 0.62, 0.05) - 0.3 * g(ph, 0.85, 0.05) + n * 0.1;
      case 'template':
        return beat.amp * ppg(((x + beat.shift) % period) / period) + n * 0.1;
      default:
        return ppg(ph) + n * 0.05;
    }
  }

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function build() {
    var W = svg.clientWidth || 1200, H = svg.clientHeight || 220;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    gWin.textContent = ''; gTr.textContent = '';
    windows = [];
    var ww = W / TYPES.length;
    var period = Math.max(16, ww / 3.4);
    var base = H * 0.66, scale = H * 0.36;
    var rand = rng(7);
    var glintD = '';

    var defs = el('defs', {});
    var cp = el('clipPath', { id: 'gate-clip' });
    clip = el('rect', { x: 0, y: 0, width: reduce || gate.dataset.drawn ? W : 0, height: H });
    cp.appendChild(clip); defs.appendChild(cp); gWin.appendChild(defs);
    gTr.setAttribute('clip-path', 'url(#gate-clip)');

    TYPES.forEach(function (type, i) {
      var x0 = i * ww;
      var rect = el('rect', { x: x0.toFixed(1), y: 0, width: (ww + 0.5).toFixed(1), height: H, 'class': 'gate-window' + (i % 2 ? ' is-alt' : '') });
      gWin.appendChild(rect);
      var tag = null;
      if (ww >= 80 && type !== 'clean') {
        tag = el('text', { x: (x0 + 10).toFixed(1), y: 22, 'class': 'gate-tag' });
        tag.textContent = LABELS[type];
        gWin.appendChild(tag);
      }
      var d = '', beat = { amp: 1, shift: 0 }, lastBeat = -1;
      for (var x = x0; x <= x0 + ww + 0.01; x += 2) {
        var bi = Math.floor(x / period);
        if (bi !== lastBeat) {
          lastBeat = bi;
          beat = { amp: 0.35 + rand() * 1.1, shift: (rand() - 0.5) * period * 0.5 };
        }
        var u = (x - x0) / ww;
        var v = sample(type, u, x, period, rand, beat);
        var y = Math.max(4, Math.min(H - 4, base - v * scale));
        d += (x === x0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      var path = el('path', { d: d, 'class': 'gate-trace' });
      gTr.appendChild(path);
      if (type === 'clean') glintD += d;
      windows.push({ type: type, rect: rect, path: path, tag: tag });
    });

    glint = el('path', { d: glintD, 'class': 'gate-glint', pathLength: 1 });
    gTr.appendChild(glint);
    apply(false);
  }

  function rejectedBy(type) { return type !== 'clean' && active.has(type); }

  function tweenCount(to) {
    if (reduce) { shown = to; countEl.textContent = to.toFixed(1) + ' M'; return; }
    var from = shown, start = performance.now(), dur = 1300;
    (function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      shown = from + (to - from) * e;
      countEl.textContent = shown.toFixed(1) + ' M';
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  function apply(announce) {
    var kept = 0;
    windows.forEach(function (w) {
      var r = rejectedBy(w.type);
      w.rect.classList.toggle('is-rejected', r);
      w.path.classList.toggle('is-rejected', r);
      if (w.tag) w.tag.classList.toggle('is-on', r);
      if (!r) kept++;
    });
    STAGES.forEach(function (s) {
      var on = active.has(s);
      buttons[s].setAttribute('aria-pressed', String(on));
      buttons[s].querySelector('.gs-state').textContent = on ? 'On' : 'Off';
    });
    var all = active.size === STAGES.length;
    traceCount.textContent = 'This trace: ' + kept + ' of ' + windows.length + ' windows kept';
    gate.classList.toggle('is-clean', all);
    result.classList.toggle('is-on', all);

    if (all) {
      tweenCount(101.3);
      countLabel.textContent = '101,310,466 clean windows: 40.64% of the candidates';
    } else {
      if (shown !== 249.3) tweenCount(249.3);
      countLabel.textContent = active.size
        ? '249,275,571 candidate 30-second windows · ' + active.size + ' of 4 stages on'
        : '249,275,571 candidate 30-second windows';
    }
    if (announce && live) {
      live.textContent = all
        ? 'All four stages on: 249.3 million candidate windows reduced to 101.3 million clean windows. Result: plus 0.30 ROC-AUC over age and sex.'
        : active.size + ' of 4 stages on. In this illustrative trace, ' + kept + ' of ' + windows.length + ' windows kept.';
    }
  }

  Object.keys(buttons).forEach(function (s) {
    buttons[s].addEventListener('click', function () {
      if (active.has(s)) active.delete(s); else active.add(s);
      apply(true);
    });
  });

  var runTimer = [];
  function clearRun() { runTimer.forEach(clearTimeout); runTimer = []; }
  gate.querySelector('[data-gate-run]').addEventListener('click', function () {
    clearRun();
    var todo = STAGES.filter(function (s) { return !active.has(s); });
    todo.forEach(function (s, i) {
      runTimer.push(setTimeout(function () { active.add(s); apply(i === todo.length - 1); }, reduce ? 0 : i * 420));
    });
  });
  gate.querySelector('[data-gate-reset]').addEventListener('click', function () {
    clearRun(); active.clear(); apply(true);
  });

  // Draw the raw trace in when the instrument first comes into view.
  function drawIn() {
    if (gate.dataset.drawn) return;
    gate.dataset.drawn = '1';
    var W = svg.viewBox.baseVal.width, start = performance.now(), dur = 1600;
    (function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      clip.setAttribute('width', (W * e).toFixed(1));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  build();
  if (reduce || !('IntersectionObserver' in window)) {
    gate.dataset.drawn = '1';
    clip.setAttribute('width', svg.viewBox.baseVal.width);
  } else {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); drawIn(); }
    }, { threshold: 0.35 });
    io.observe(svg);
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = svg.clientWidth;
      if (Math.abs(w - svg.viewBox.baseVal.width) > 2) build();
    }, 150);
  });
})();

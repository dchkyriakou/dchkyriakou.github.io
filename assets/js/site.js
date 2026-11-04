/* Dimitrios Kyriakou — portfolio behaviour. Vanilla, no dependencies.
   One orange pulse line runs through the page: it draws and beats in the
   hero, collapses into Thessaloniki on the map and becomes the route, then
   reappears as the noisy trace the thesis gate cleans (gate.js). */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var wide = window.matchMedia('(min-width: 900px)');
  var hasIO = 'IntersectionObserver' in window;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* Shared PPG beat shape: systolic peak, dicrotic notch, diastolic wave. 0..1 phase -> 0..1 height */
  function ppg(phase) {
    function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
    return g(phase, 0.2, 0.055) + 0.42 * g(phase, 0.43, 0.075) - 0.06 * g(phase, 0.33, 0.02);
  }
  window.__ppg = ppg; // shared with gate.js

  /* ---------------- Entrances ---------------- */
  function setupReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], .chapter-card--inline'));
    if (!hasIO) return;
    var counters = new Map();
    items.forEach(function (el) {
      var group = el.closest('[data-reveal-group]') || el.parentElement;
      var n = counters.get(group) || 0;
      el.style.setProperty('--i', String(Math.min(n, 6)));
      counters.set(group, n + 1);
    });
    root.classList.add('reveal-on');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- Hero intro ---------------- */
  function startIntro() {
    var go = function () {
      if (root.classList.contains('intro')) return;
      // two frames so the hidden state is painted before transitions start
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        root.classList.add('intro');
        if (!reduce) setTimeout(function () { root.classList.add('pulse-live'); }, 2100);
      }); });
    };
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 700); })]).then(go);
    } else { go(); }
  }

  /* ---------------- Hero pulse line ---------------- */
  var heroPulse = (function () {
    var wrap = document.querySelector('.pulse--hero');
    if (!wrap) return null;
    var svg = wrap.querySelector('svg');
    var base = wrap.querySelector('.pulse-base');
    var glint = wrap.querySelector('.pulse-glint');
    base.setAttribute('pathLength', '1000');
    glint.setAttribute('pathLength', '1000');
    var w = 0, h = 0, amp = 1;

    function build() {
      w = wrap.clientWidth; h = wrap.clientHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var period = clamp(w / 7, 120, 210);
      var baseY = h * 0.78, height = h * 0.66 * amp;
      var offset = period * 0.35;
      var d = '';
      for (var x = 0; x <= w; x += 3) {
        var ph = (((x + offset) % period) + period) % period / period;
        var y = baseY - ppg(ph) * height;
        d += (x === 0 ? 'M' : 'L') + x + ' ' + y.toFixed(1);
      }
      base.setAttribute('d', d);
      glint.setAttribute('d', d);
    }
    function setAmp(a) {
      a = Math.round(a * 50) / 50;
      if (a === amp) return;
      amp = a; build();
    }
    build();
    return { build: build, setAmp: setAmp };
  })();

  /* ---------------- Ticker: marquee on narrow screens ---------------- */
  function setupTicker() {
    var ticker = document.querySelector('.ticker');
    if (!ticker) return;

    var track = ticker.querySelector('.ticker-track');
    var marqueeOn = false;
    function setMarquee() {
      var want = !reduce && window.innerWidth < 1100;
      if (want === marqueeOn) return;
      marqueeOn = want;
      ticker.classList.toggle('is-marquee', want);
      track.querySelectorAll('[data-clone]').forEach(function (c) { c.remove(); });
      if (want) {
        Array.prototype.slice.call(track.children).forEach(function (li) {
          var c = li.cloneNode(true);
          c.setAttribute('aria-hidden', 'true'); c.setAttribute('data-clone', '');
          track.appendChild(c);
        });
      }
    }
    setMarquee();
    window.addEventListener('resize', setMarquee);
    // Tap to pause / resume the moving ticker (WCAG 2.2.2); hover and focus pause it in CSS.
    ticker.addEventListener('click', function () { if (marqueeOn) ticker.classList.toggle('is-paused'); });

  }

  /* ---------------- Map scene ---------------- */
  var map = (function () {
    var scene = document.querySelector('.mapscene');
    if (!scene) return null;
    var LON0 = -130, LAT0 = 74, STEP = 2, W = 145;
    var P = {
      thessaloniki: [40.64, 22.94],
      'college-station': [30.63, -96.33],
      shanghai: [31.23, 121.47]
    };
    function proj(lat, lon) { return [(lon - LON0) / STEP, (LAT0 - lat) / STEP]; }
    function toVec(lat, lon) {
      var a = lat * Math.PI / 180, b = lon * Math.PI / 180;
      return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
    }
    function greatCircle(p1, p2, n) {
      var v1 = toVec(p1[0], p1[1]), v2 = toVec(p2[0], p2[1]);
      var dot = clamp(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2], -1, 1);
      var om = Math.acos(dot), so = Math.sin(om);
      var d = '';
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so;
        var x = k1 * v1[0] + k2 * v2[0], y = k1 * v1[1] + k2 * v2[1], z = k1 * v1[2] + k2 * v2[2];
        var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
        var lon = Math.atan2(y, x) * 180 / Math.PI;
        var q = proj(lat, lon);
        d += (i ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2);
      }
      return d;
    }

    var svg = scene.querySelector('.map-overlay');
    var arcCS = svg.querySelector('.map-arc--cs');
    var arcSH = svg.querySelector('.map-arc--sh');
    var pulse = svg.querySelector('.map-pulse');
    var head = svg.querySelector('.map-head');
    arcCS.setAttribute('d', greatCircle(P.thessaloniki, P['college-station'], 80));
    arcSH.setAttribute('d', greatCircle(P.thessaloniki, P.shanghai, 80));
    var lenCS = arcCS.getTotalLength(), lenSH = arcSH.getTotalLength();
    // Arcs keep a 2.5px stroke at any map size (stroke-width in map units).
    function sizeStroke() {
      var px = svg.getBoundingClientRect().width || 1;
      svg.style.setProperty('--arc-w', (2.5 * W / px).toFixed(3));
    }
    sizeStroke();
    window.addEventListener('resize', sizeStroke);

    var pins = {};
    svg.querySelectorAll('.map-pin').forEach(function (g) {
      var key = g.dataset.pin, q = proj(P[key][0], P[key][1]);
      g.setAttribute('transform', 'translate(' + q[0].toFixed(2) + ' ' + q[1].toFixed(2) + ')');
      pins[key] = g;
    });
    var labels = {};
    scene.querySelectorAll('.map-label').forEach(function (l) { labels[l.dataset.label] = l; });
    var steps = {};
    scene.querySelectorAll('.map-legend [data-step]').forEach(function (l) { steps[l.dataset.step] = l; });
    var TH = proj(P.thessaloniki[0], P.thessaloniki[1]);

    // The hero's pulse line, at map scale, collapsing into Thessaloniki.
    function pulsePath(t) {
      var amp = 4.2 * (1 - t), d = '', period = 14;
      for (var x = 0; x <= W; x += 0.75) {
        var ph = (((x - TH[0]) % period) + period) % period / period;
        var px = TH[0] + (x - TH[0]) * (1 - t);
        var py = TH[1] + 1.2 - ppg(ph) * amp;
        d += (x ? 'L' : 'M') + px.toFixed(2) + ' ' + py.toFixed(2);
      }
      return d;
    }

    var last = -1;
    function render(p) {
      p = Math.round(p * 400) / 400;
      if (p === last) return;
      last = p;
      var collapse = easeInOut(seg(p, 0.02, 0.22));
      var a1 = easeInOut(seg(p, 0.24, 0.52));
      var a2 = easeInOut(seg(p, 0.56, 0.84));

      pulse.setAttribute('d', pulsePath(collapse));
      pulse.style.opacity = collapse >= 1 ? '0' : '1';
      arcCS.style.strokeDashoffset = String(1 - a1);
      arcSH.style.strokeDashoffset = String(1 - a2);

      var place = 'thessaloniki';
      if (a1 > 0.999) place = 'college-station';
      if (a2 > 0.999) place = 'shanghai';

      // travelling head on whichever arc is drawing
      var arc = null, frac = 0, len = 0;
      if (a1 > 0 && a1 < 1) { arc = arcCS; frac = a1; len = lenCS; }
      else if (a2 > 0 && a2 < 1) { arc = arcSH; frac = a2; len = lenSH; }
      if (arc) {
        var pt = arc.getPointAtLength(len * frac);
        head.setAttribute('cx', pt.x.toFixed(2)); head.setAttribute('cy', pt.y.toFixed(2));
        head.style.opacity = '1';
      } else { head.style.opacity = '0'; }

      var on = { thessaloniki: collapse > 0.85, 'college-station': a1 > 0.999, shanghai: a2 > 0.999 };
      Object.keys(pins).forEach(function (k) {
        pins[k].classList.toggle('is-on', on[k]);
        pins[k].classList.toggle('is-here', on[k] && k === place);
        labels[k].classList.toggle('is-on', on[k]);
        steps[k].classList.toggle('is-here', on[k] && k === place);
      });
      steps.thessaloniki.style.setProperty('--fill', collapse.toFixed(3));
      steps['college-station'].style.setProperty('--fill', a1.toFixed(3));
      steps.shanghai.style.setProperty('--fill', a2.toFixed(3));
    }

    function update() {
      if (reduce) { render(1); return; }
      var r = scene.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      render(clamp(-r.top / total, 0, 1));
    }
    return { update: update };
  })();

  /* ---------------- Stage: chapter cards and photos with a clip-path wipe ---------------- */
  var stage = (function () {
    var el = document.querySelector('.stage');
    if (!el) return null;
    var items = {};
    el.querySelectorAll('.stage-item').forEach(function (f) { items[f.dataset.key] = f; });
    var markers = Array.prototype.slice.call(document.querySelectorAll('.column [data-stage]'));
    var current = 'card-shanghai';

    function activate(key) {
      if (key === current || !items[key]) return;
      var prev = items[current], next = items[key];
      current = key;
      Object.keys(items).forEach(function (k) {
        if (items[k] !== prev && items[k] !== next) items[k].classList.remove('is-active', 'is-leaving', 'is-entering');
      });
      prev.classList.remove('is-active', 'is-entering');
      if (!reduce) prev.classList.add('is-leaving');
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(clearLeaving, 1200); // in case animationend never fires
      next.classList.remove('is-leaving', 'is-entering');
      if (!reduce) { void next.offsetWidth; next.classList.add('is-entering'); }
      next.classList.add('is-active');
      var img = next.querySelector('img[loading="lazy"]');
      if (img) img.loading = 'eager';
    }
    var leaveTimer = null;
    function clearLeaving() {
      Object.keys(items).forEach(function (k) {
        if (k !== current) items[k].classList.remove('is-leaving');
      });
    }
    el.addEventListener('animationend', function (e) {
      if (e.animationName === 'wipe') clearLeaving();
    });

    function update() {
      if (!wide.matches) return;
      var line = window.innerHeight * 0.55;
      var winner = markers[0];
      for (var i = 0; i < markers.length; i++) {
        if (markers[i].getBoundingClientRect().top <= line) winner = markers[i];
      }
      if (winner) activate(winner.dataset.stage);
    }
    return { update: update };
  })();

  /* ---------------- Scroll loop ---------------- */
  var progressBar = document.querySelector('.progress span');
  var portrait = document.querySelector('.hero-portrait-inner');
  var hero = document.querySelector('.hero');
  var ticking = false;

  function onFrame() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;
    if (progressBar) progressBar.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : '0');

    if (hero && !reduce) {
      var hh = hero.offsetHeight;
      if (y < hh * 1.2) {
        if (portrait) portrait.style.setProperty('--parallax', (y * 0.12).toFixed(1) + 'px');
        if (heroPulse) heroPulse.setAmp(1 - clamp(y / (hh * 0.85), 0, 1));
      }
    }
    if (map) map.update();
    if (stage) stage.update();
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }

  /* ---------------- Tilt (medals) ---------------- */
  function setupTilt() {
    if (reduce || !finePointer) return;
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------------- Magnetic buttons ---------------- */
  function setupMagnetic() {
    if (reduce || !finePointer) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.magnetic'));
    var pending = null;
    window.addEventListener('pointermove', function (e) {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        buttons.forEach(function (b) {
          var r = b.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var dx = e.clientX - cx, dy = e.clientY - cy;
          var reach = 70;
          var inside = Math.abs(dx) < r.width / 2 + reach && Math.abs(dy) < r.height / 2 + reach;
          b.style.setProperty('--mx', inside ? clamp(dx * 0.28, -14, 14).toFixed(1) + 'px' : '0px');
          b.style.setProperty('--my', inside ? clamp(dy * 0.35, -10, 10).toFixed(1) + 'px' : '0px');
        });
      });
    }, { passive: true });
  }

  /* ---------------- WebGL (lazy, desktop only, motion allowed) ---------------- */
  function loadGL() {
    if (reduce || !wide.matches || !document.querySelector('.hero-gl, [data-km]')) return;
    if (navigator.connection && navigator.connection.saveData) return;
    var ok = false;
    try {
      var c = document.createElement('canvas');
      var ctx = c.getContext('webgl2') || c.getContext('webgl');
      ok = !!ctx;
      var lose = ctx && ctx.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) { ok = false; }
    if (!ok) return;
    var go = function () {
      import('./gl.js').then(function (m) { m.init(); }).catch(function () { /* keep the static fallbacks */ });
    };
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
    if (document.readyState === 'complete') idle(go, { timeout: 1500 });
    else window.addEventListener('load', function () { idle(go, { timeout: 1500 }); });
  }

  /* Links elsewhere on the page that point into the knowledge map */
  function setupKmLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-km-select]');
      if (!a) return;
      var id = a.getAttribute('data-km-select');
      var km = document.querySelector('[data-km]');
      if (!km) return;
      if (km.classList.contains('has-gl')) {
        km.dispatchEvent(new CustomEvent('km:select', { detail: { type: 'domain', id: id } }));
      } else {
        var d = km.querySelector('.km-domain[data-domain="' + id + '"]');
        if (d) d.open = true;
      }
    });
  }

  /* Expand / collapse all engineering-decision cards */
  function setupDecisions() {
    var btn = document.querySelector('[data-decisions-toggle]');
    if (!btn) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll('.decision'));
    function sync() {
      var all = cards.every(function (d) { return d.open; });
      btn.textContent = all ? 'Collapse all' : 'Expand all';
      btn.setAttribute('aria-expanded', String(all));
    }
    btn.addEventListener('click', function () {
      var open = !cards.every(function (d) { return d.open; });
      cards.forEach(function (d) { d.open = open; });
      sync();
    });
    cards.forEach(function (d) { d.addEventListener('toggle', sync); });
    function openFromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      var el = id && document.getElementById(id);
      if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ block: 'start' }); }
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  }

  /* Compact Download CV that docks after the hero and steps aside at the contact section */
  function setupCvDock() {
    var dock = document.querySelector('.cv-dock');
    var heroEl = document.querySelector('.hero');
    var contact = document.querySelector('#contact');
    if (!dock || !heroEl || !hasIO) return;
    var pastHero = false, atContact = false;
    function sync() {
      var on = pastHero && !atContact;
      dock.classList.toggle('is-shown', on);
      if (on) dock.removeAttribute('inert'); else dock.setAttribute('inert', '');
    }
    sync();
    new IntersectionObserver(function (es) { pastHero = !es[0].isIntersecting; sync(); }).observe(heroEl);
    if (contact) new IntersectionObserver(function (es) { atContact = es[0].isIntersecting; sync(); }, { threshold: 0.05 }).observe(contact);
  }

  /* ---------------- Boot ---------------- */
  setupReveals();
  setupTicker();
  setupTilt();
  setupMagnetic();
  startIntro();
  setupKmLinks();
  setupDecisions();
  setupCvDock();
  loadGL();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { if (heroPulse) heroPulse.build(); request(); });
  onFrame();
})();

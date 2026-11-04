/* Dimitrios Kyriakou — portfolio behaviour. Vanilla, no dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var wide = window.matchMedia('(min-width: 900px)');
  var hasIO = 'IntersectionObserver' in window;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* Shared PPG beat shape (also used by gate.js): systolic peak, dicrotic notch, diastolic wave */
  window.__ppg = function (phase) {
    function g(x, m, s) { return Math.exp(-((x - m) * (x - m)) / (2 * s * s)); }
    return g(phase, 0.2, 0.055) + 0.42 * g(phase, 0.43, 0.075) - 0.06 * g(phase, 0.33, 0.02);
  };

  /* ---------------- Entrances: staggered per group, once ---------------- */
  function setupReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
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
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('intro'); }); });
    };
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 700); })]).then(go);
    } else { go(); }
  }

  /* ---------------- Scroll: progress bar + portrait parallax ---------------- */
  var progressBar = document.querySelector('.progress span');
  var portrait = document.querySelector('.hero-portrait-inner');
  var hero = document.querySelector('.hero');
  var ticking = false;
  function onFrame() {
    ticking = false;
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : '0');
    if (hero && portrait && !reduce && y < hero.offsetHeight * 1.2) {
      portrait.style.setProperty('--parallax', (y * 0.12).toFixed(1) + 'px');
    }
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }

  /* ---------------- Magnetic Download CV ---------------- */
  function setupMagnetic() {
    if (reduce || !finePointer) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.magnetic'));
    if (!buttons.length) return;
    var pending = null;
    window.addEventListener('pointermove', function (e) {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        buttons.forEach(function (b) {
          var r = b.getBoundingClientRect();
          var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          var inside = Math.abs(dx) < r.width / 2 + 70 && Math.abs(dy) < r.height / 2 + 70;
          b.style.setProperty('--mx', inside ? clamp(dx * 0.28, -14, 14).toFixed(1) + 'px' : '0px');
          b.style.setProperty('--my', inside ? clamp(dy * 0.35, -10, 10).toFixed(1) + 'px' : '0px');
        });
      });
    }, { passive: true });
  }

  /* ---------------- WebGL hero (lazy, desktop only, motion allowed) ---------------- */
  function loadGL() {
    if (reduce || !wide.matches || !document.querySelector('.hero-gl')) return;
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
      import('./gl.js').then(function (m) { m.init(); }).catch(function () { /* keep the static still */ });
    };
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
    if (document.readyState === 'complete') idle(go, { timeout: 1500 });
    else window.addEventListener('load', function () { idle(go, { timeout: 1500 }); });
  }

  /* ---------------- Decision cards: expand all, open on deep link ---------------- */
  function setupDecisions() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.decision'));
    if (!cards.length) return;
    var btn = document.querySelector('[data-decisions-toggle]');
    function sync() {
      if (!btn) return;
      var all = cards.every(function (d) { return d.open; });
      btn.textContent = all ? 'Collapse all' : 'Expand all';
      btn.setAttribute('aria-expanded', String(all));
    }
    if (btn) btn.addEventListener('click', function () {
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

  /* ---------------- Compact Download CV docked after the hero ---------------- */
  function setupCvDock() {
    var dock = document.querySelector('.cv-dock');
    var contact = document.querySelector('#contact');
    if (!dock || !hero || !hasIO) return;
    var pastHero = false, atContact = false;
    function sync() {
      var on = pastHero && !atContact;
      dock.classList.toggle('is-shown', on);
      if (on) dock.removeAttribute('inert'); else dock.setAttribute('inert', '');
    }
    sync();
    new IntersectionObserver(function (es) { pastHero = !es[0].isIntersecting; sync(); }).observe(hero);
    if (contact) new IntersectionObserver(function (es) { atContact = es[0].isIntersecting; sync(); }, { threshold: 0.05 }).observe(contact);
  }

  /* ---------------- Boot ---------------- */
  setupReveals();
  setupMagnetic();
  setupDecisions();
  setupCvDock();
  startIntro();
  loadGL();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  onFrame();
})();

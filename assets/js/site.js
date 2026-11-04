/* Dimitrios Kyriakou — portfolio behaviour. Vanilla, no dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasIO = 'IntersectionObserver' in window;

  /* ---------- Entrances: staggered per group, once ---------- */
  function setupReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!hasIO || !items.length) return;

    // Stagger index within the nearest group (or the parent element).
    var counters = new Map();
    items.forEach(function (el) {
      var group = el.closest('[data-reveal-group]') || el.parentElement;
      var n = counters.get(group) || 0;
      el.style.setProperty('--i', String(Math.min(n, 5)));
      counters.set(group, n + 1);
    });

    root.classList.add('reveal-on');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px', threshold: 0 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Stage: the fixed photograph follows the reading column ---------- */
  var CAPTIONS = {
    'portrait': 'Thessaloniki, Greece',
    'poster': 'Poster session, GRIPS Summer 2025',
    'talk': 'Presenting at GRIPS 2025',
    'closing': 'GRIPS 2025 closing ceremony',
    'college-station': 'Optical Biosensing Lab, Texas A&M',
    'pitch': 'Pitching at Texas A&M Engineering'
  };

  function setupStage() {
    var stage = document.querySelector('.stage');
    if (!stage || !hasIO) return;

    var figures = {};
    stage.querySelectorAll('.stage-item').forEach(function (f) { figures[f.dataset.key] = f; });
    var caption = stage.querySelector('[data-caption]');
    var stops = stage.querySelectorAll('.route [data-place]');
    var markers = Array.prototype.slice.call(document.querySelectorAll('.column [data-stage]'));
    var current = 'portrait';
    var wide = window.matchMedia('(min-width: 900px)');

    function placeOf(el) {
      var p = el.closest('[data-place]');
      return p ? p.dataset.place : null;
    }

    function activate(marker) {
      var key = marker.dataset.stage;
      if (key === current || !figures[key]) return;
      current = key;
      Object.keys(figures).forEach(function (k) {
        figures[k].classList.toggle('is-active', k === key);
      });
      if (caption && CAPTIONS[key]) caption.textContent = CAPTIONS[key];
      var place = placeOf(marker);
      stops.forEach(function (s) { s.classList.toggle('is-here', s.dataset.place === place); });
    }

    // The current marker is the last one (in reading order) whose top has
    // crossed the middle of the viewport. Nested markers therefore win over
    // their parent, and gaps between markers never fall back.
    var ticking = false;
    function update() {
      ticking = false;
      if (!wide.matches) return;
      var line = window.innerHeight * 0.5;
      var winner = markers[0];
      for (var i = 0; i < markers.length; i++) {
        if (markers[i].getBoundingClientRect().top <= line) winner = markers[i];
      }
      if (winner) activate(winner);
    }
    function request() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  setupReveals();
  setupStage();
})();

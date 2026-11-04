/* WebGL layer: one shared Three.js renderer for the two places 3D earns its keep,
   the hero spectrogram and the knowledge map. The single canvas is moved into
   whichever view is most on screen; rendering stops when neither is visible or
   the tab is hidden. Loaded lazily (desktop, motion allowed, WebGL available). */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color,
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Points,
  ShaderMaterial, Vector2, Vector3, Raycaster
} from '../vendor/three.custom.min.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const ORANGE = new Color('#ff5b14');
const INK = new Color('#eef2f4');
const FIELD = new Color('#0c1a24');

/* ------------------------------------------------------------------ */
/* Shared renderer + view manager                                      */
/* ------------------------------------------------------------------ */
function createManager() {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  const canvas = renderer.domElement;
  canvas.className = 'gl-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const views = [];
  let active = null;
  let running = false;
  let last = performance.now();
  const visible = new Map();

  function size() {
    if (!active) return;
    const r = active.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    active.camera.aspect = w / h;
    active.camera.updateProjectionMatrix();
    if (active.resize) active.resize(w, h);
  }

  function attach(view) {
    if (active === view) return;
    if (active && active.detach) active.detach();
    active = view;
    canvas.classList.remove('is-live');
    view.host.insertBefore(canvas, view.host.firstChild);
    size();
    renderer.setClearColor(view.clear || FIELD, view.clearAlpha == null ? 1 : view.clearAlpha);
    if (view.attach) view.attach();
    renderer.render(view.scene, view.camera);
    requestAnimationFrame(() => canvas.classList.add('is-live'));
  }

  function pick() {
    let best = null, area = 0;
    visible.forEach((a, v) => { if (a > area) { area = a; best = v; } });
    if (best) { attach(best); start(); } else { stop(); }
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = views.find((x) => x.host === en.target);
      if (!v) return;
      const a = en.isIntersecting ? en.intersectionRect.width * en.intersectionRect.height : 0;
      if (a > 0) visible.set(v, a); else visible.delete(v);
    });
    pick();
  }, { threshold: [0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.9, 1] });

  const ro = new ResizeObserver(() => size());

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (active && !document.hidden) {
      active.update(dt, now / 1000);
      renderer.render(active.scene, active.camera);
    }
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function stop() { running = false; }

  return {
    renderer,
    add(view) { views.push(view); io.observe(view.host); ro.observe(view.host); },
  };
}

/* Soft round points with per-point colour, size and alpha. */
function pointMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: DPR } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      varying vec3 vColor; varying float vAlpha;
      uniform float uScale;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float far = clamp((-mv.z - 9.0) / 8.0, 0.0, 1.0);
        vAlpha = aAlpha * (1.0 - far * 0.6);
        gl_PointSize = aSize * uScale * (14.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.36, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.28;
        float a = max(core, halo) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
}

/* Deterministic random */
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

/* ------------------------------------------------------------------ */
/* Knowledge map                                                       */
/* ------------------------------------------------------------------ */
function createKnowledgeMap(root) {
  const host = root.querySelector('.km-stage');
  const labelsEl = root.querySelector('.km-labels');
  const panel = root.querySelector('.km-panel');
  const legend = root.querySelector('.km-legend');

  // ---- read the graph from the accessible accordion ----
  const domains = [...root.querySelectorAll('.km-domain')].map((d) => ({
    id: d.dataset.domain, label: d.dataset.label,
    courses: [...d.querySelectorAll('.km-courses li')].map((li) => ({
      id: li.dataset.id, label: li.querySelector('span').textContent, grade: li.dataset.grade || null,
    })),
  }));
  const projects = [...root.querySelectorAll('.km-projects-data li')].map((li) => ({
    id: li.dataset.id, label: li.dataset.label, domain: li.dataset.domain, href: li.dataset.href,
    uses: li.dataset.uses.split(' ').filter(Boolean), evidence: li.textContent.trim(),
  }));

  // ---- layout: domains on a sphere, courses around their domain, projects between ----
  const rand = rng(11);
  const R = 5.1;
  const nodes = []; // {kind, id, label, domain, grade, pos, size, color, project?}
  const byId = {};
  const centers = {};
  domains.forEach((d, i) => {
    const k = i + 0.5, n = domains.length;
    const phi = Math.acos(1 - (2 * k) / n), theta = Math.PI * (1 + Math.sqrt(5)) * k;
    const c = new Vector3(Math.cos(theta) * Math.sin(phi), Math.cos(phi) * 0.82, Math.sin(theta) * Math.sin(phi)).multiplyScalar(R);
    centers[d.id] = c;
    d.courses.forEach((cs) => {
      const v = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.7 + rand() * 1.1);
      const g = cs.grade ? parseFloat(cs.grade) : 0;
      const node = { kind: 'course', id: cs.id, label: cs.label, grade: cs.grade, domain: d.id,
        pos: c.clone().add(v), size: g >= 10 ? 22 : g ? 18 : 14 };
      nodes.push(node); byId[cs.id] = node;
    });
  });
  projects.forEach((p) => {
    const ds = [...new Set(p.uses.map((u) => byId[u] && byId[u].domain).filter(Boolean).concat(p.domain))];
    const avg = new Vector3();
    ds.forEach((d) => avg.add(centers[d]));
    avg.divideScalar(ds.length);
    const len = avg.length();
    const pos = avg.clone().normalize().multiplyScalar(Math.max(2.2, Math.min(len * 0.9 + 1.2, R * 0.85)));
    pos.add(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6));
    const node = { kind: 'project', id: p.id, label: p.label, domain: p.domain, pos, size: 36, project: p };
    nodes.push(node); byId[p.id] = node;
  });

  // ---- geometry ----
  const N = nodes.length;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N), alp = new Float32Array(N);
  const alphaTarget = new Float32Array(N).fill(1);
  const COURSE = new Color('#c8d3da'), GRADED = new Color('#ffffff');
  nodes.forEach((n, i) => {
    n.index = i;
    pos.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
    const c = n.kind === 'project' ? ORANGE : (n.grade && parseFloat(n.grade) >= 9.5 ? GRADED : COURSE);
    col.set([c.r, c.g, c.b], i * 3);
    siz[i] = n.size; alp[i] = 1;
  });
  const pGeo = new BufferGeometry();
  pGeo.setAttribute('position', new BufferAttribute(pos, 3));
  pGeo.setAttribute('aColor', new BufferAttribute(col, 3));
  pGeo.setAttribute('aSize', new BufferAttribute(siz, 1));
  pGeo.setAttribute('aAlpha', new BufferAttribute(alp, 1));
  const points = new Points(pGeo, pointMaterial());

  // edges: course -> domain hub, project -> course used
  const edges = [];
  nodes.forEach((n) => { if (n.kind === 'course') edges.push({ a: n.pos, b: centers[n.domain], kind: 'hub', from: n, to: null, domain: n.domain }); });
  projects.forEach((p) => p.uses.forEach((u) => { if (byId[u]) edges.push({ a: byId[p.id].pos, b: byId[u].pos, kind: 'use', from: byId[p.id], to: byId[u] }); }));
  const ePos = new Float32Array(edges.length * 6), eCol = new Float32Array(edges.length * 8);
  const HUB = new Color('#5f7889');
  edges.forEach((e, i) => {
    ePos.set([e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z], i * 6);
    const c = e.kind === 'use' ? ORANGE : HUB;
    const a = e.kind === 'use' ? 0.32 : 0.42;
    eCol.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], i * 8);
  });
  const eGeo = new BufferGeometry();
  eGeo.setAttribute('position', new BufferAttribute(ePos, 3));
  eGeo.setAttribute('color', new BufferAttribute(eCol, 4));
  const lines = new LineSegments(eGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  const edgeBase = edges.map((e) => (e.kind === 'use' ? 0.32 : 0.42));
  const edgeTarget = edgeBase.slice();
  const edgeNow = edgeBase.slice();

  const hubPos = new Float32Array(domains.length * 3);
  domains.forEach((d, i) => hubPos.set([centers[d.id].x, centers[d.id].y, centers[d.id].z], i * 3));
  const hubGeo = new BufferGeometry();
  hubGeo.setAttribute('position', new BufferAttribute(hubPos, 3));
  hubGeo.setAttribute('aColor', new BufferAttribute(new Float32Array(domains.length * 3).fill(0.42), 3));
  hubGeo.setAttribute('aSize', new BufferAttribute(new Float32Array(domains.length).fill(10), 1));
  hubGeo.setAttribute('aAlpha', new BufferAttribute(new Float32Array(domains.length).fill(1), 1));
  const hubs = new Points(hubGeo, pointMaterial());

  const group = new Group();
  group.add(lines, hubs, points);
  const scene = new Scene();
  scene.add(group);
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.3, 13.6);
  camera.lookAt(0, 0, 0);

  // ---- HTML labels (domains + projects), projected each frame ----
  const labelFor = [];
  domains.forEach((d) => {
    const el = document.createElement('span');
    el.className = 'km-label km-label--domain';
    el.textContent = d.label;
    labelsEl.appendChild(el);
    labelFor.push({ el, pos: centers[d.id], domain: d.id });
  });
  projects.forEach((p) => {
    const el = document.createElement('span');
    el.className = 'km-label km-label--project';
    el.textContent = p.label;
    labelsEl.appendChild(el);
    labelFor.push({ el, pos: byId[p.id].pos, project: p.id });
  });
  const tip = document.createElement('span');
  tip.className = 'km-label km-label--tip';
  labelsEl.appendChild(tip);

  // ---- legend buttons (keyboard path into the map) ----
  domains.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'km-chip'; b.dataset.domain = d.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span>${d.label}</span><span class="km-chip-n">${d.courses.length}</span>`;
    b.addEventListener('click', () => select({ type: 'domain', id: d.id }));
    legend.appendChild(b);
  });

  // ---- highlight + selection ----
  let hoverIdx = -1;
  let selection = null;

  function related(sel) {
    const set = new Set();
    if (!sel) return null;
    if (sel.type === 'domain') {
      nodes.forEach((n) => { if (n.domain === sel.id && n.kind === 'course') set.add(n.index); });
      projects.forEach((p) => { if (p.domain === sel.id || p.uses.some((u) => byId[u] && byId[u].domain === sel.id)) set.add(byId[p.id].index); });
    } else {
      const n = byId[sel.id];
      set.add(n.index);
      if (n.kind === 'project') n.project.uses.forEach((u) => byId[u] && set.add(byId[u].index));
      else {
        nodes.forEach((m) => { if (m.domain === n.domain && m.kind === 'course') set.add(m.index); });
        projects.forEach((p) => { if (p.uses.includes(n.id)) set.add(byId[p.id].index); });
      }
    }
    return set;
  }

  function applyFocus() {
    const sel = hoverIdx >= 0 ? { type: 'node', id: nodes[hoverIdx].id } : selection;
    const set = related(sel);
    nodes.forEach((n, i) => { alphaTarget[i] = !set || set.has(i) ? 1 : 0.14; });
    edges.forEach((e, i) => {
      if (!set) { edgeTarget[i] = edgeBase[i]; return; }
      const on = e.kind === 'use' ? set.has(e.from.index) && set.has(e.to.index) : set.has(e.from.index);
      edgeTarget[i] = on ? (e.kind === 'use' ? 0.85 : 0.6) : 0.04;
    });
    labelFor.forEach((l) => {
      const dim = set && ((l.domain && !(sel.type === 'domain' ? sel.id === l.domain : [...set].some((i) => nodes[i].domain === l.domain)))
        || (l.project && !set.has(byId[l.project].index)));
      l.el.classList.toggle('is-dim', !!dim);
    });
  }

  function gradeText(g) { return g ? `${g} / 10` : 'Completed'; }
  function btn(type, id, text) { return `<button type="button" class="km-link" data-select-type="${type}" data-select-id="${id}">${text}</button>`; }

  function renderPanel() {
    if (!selection) {
      const graded = nodes.filter((n) => n.grade && parseFloat(n.grade) >= 9.5).length;
      panel.innerHTML = `<p class="km-panel-kicker">${domains.length} domains · ${nodes.filter((n) => n.kind === 'course').length} courses · ${projects.length} projects</p>
        <h3 class="km-panel-title">Pick a domain or a point</h3>
        <p class="km-panel-text">Orange points are projects; their lines run to the courses they drew on. Brighter points are courses graded 9.5 or higher (${graded} of them).</p>`;
      return;
    }
    if (selection.type === 'domain') {
      const d = domains.find((x) => x.id === selection.id);
      const ps = projects.filter((p) => p.domain === d.id || p.uses.some((u) => byId[u] && byId[u].domain === d.id));
      panel.innerHTML = `<p class="km-panel-kicker">Domain</p>
        <h3 class="km-panel-title">${d.label}</h3>
        <ul class="km-panel-list">${d.courses.map((c) => `<li>${btn('node', c.id, c.label)}<span class="km-grade">${c.grade || ''}</span></li>`).join('')}</ul>
        ${ps.length ? `<p class="km-panel-sub">Used in</p><ul class="km-panel-list">${ps.map((p) => `<li>${btn('node', p.id, p.label)}</li>`).join('')}</ul>` : ''}`;
    } else {
      const n = byId[selection.id];
      if (n.kind === 'project') {
        const p = n.project;
        panel.innerHTML = `<p class="km-panel-kicker">Project</p>
          <h3 class="km-panel-title">${p.label}</h3>
          <p class="km-panel-text">${p.evidence}</p>
          <p class="km-panel-sub">Drew on</p>
          <ul class="km-panel-list">${p.uses.map((u) => `<li>${btn('node', u, byId[u].label)}<span class="km-grade">${byId[u].grade || ''}</span></li>`).join('')}</ul>
          <p><a class="km-go hover-link" href="${p.href}">Read more</a></p>`;
      } else {
        const d = domains.find((x) => x.id === n.domain);
        const ps = projects.filter((p) => p.uses.includes(n.id));
        panel.innerHTML = `<p class="km-panel-kicker">Course · ${btn('domain', d.id, d.label)}</p>
          <h3 class="km-panel-title">${n.label}</h3>
          <p class="km-panel-grade">${gradeText(n.grade)}</p>
          ${ps.length ? `<p class="km-panel-sub">Used in</p><ul class="km-panel-list">${ps.map((p) => `<li>${btn('node', p.id, p.label)}</li>`).join('')}</ul>` : ''}`;
      }
    }
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-select-type]');
    if (b) select({ type: b.dataset.selectType, id: b.dataset.selectId });
  });

  function select(sel) {
    selection = sel;
    legend.querySelectorAll('.km-chip').forEach((c) => {
      const on = !!sel && ((sel.type === 'domain' && c.dataset.domain === sel.id) || (sel.type === 'node' && byId[sel.id] && byId[sel.id].kind === 'course' && byId[sel.id].domain === c.dataset.domain));
      c.setAttribute('aria-pressed', String(on));
    });
    renderPanel();
    applyFocus();
  }
  renderPanel();

  // ---- pointer: drag to rotate, hover, click ----
  let rotY = 0.6, rotX = -0.12, velY = 0, velX = 0, dragging = false, moved = 0;
  let lastX = 0, lastY = 0;
  const ndc = new Vector2(-9, -9);
  const ray = new Raycaster();
  ray.params.Points.threshold = 0.32;

  host.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    host.setPointerCapture(e.pointerId); host.classList.add('is-dragging');
  });
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    velY = dx * 0.0055; velX = dy * 0.0045;
    rotY += velY; rotX = Math.max(-0.7, Math.min(0.7, rotX + velX));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; host.classList.remove('is-dragging');
    try { host.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    if (moved < 6) { // a tap / click
      if (hoverIdx >= 0) select({ type: 'node', id: nodes[hoverIdx].id });
      else select(null);
    }
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('pointerleave', () => { ndc.set(-9, -9); });

  // external selection (role paths link here)
  root.addEventListener('km:select', (e) => select(e.detail));

  // ---- per-frame ----
  const tmp = new Vector3();
  let w = 1, h = 1;
  function update(dt) {
    if (!dragging) {
      velY *= 0.94; velX *= 0.9;
      rotY += velY + (selection || hoverIdx >= 0 ? 0 : dt * 0.06);
      rotX = Math.max(-0.7, Math.min(0.7, rotX + velX));
    }
    group.rotation.set(rotX, rotY, 0);
    group.updateMatrixWorld();

    // hover
    let hit = -1;
    if (ndc.x > -2) {
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(points);
      if (hits.length) hit = hits[0].index;
    }
    if (hit !== hoverIdx) {
      hoverIdx = hit;
      host.classList.toggle('is-hovering', hit >= 0);
      applyFocus();
    }

    // ease alphas
    const a = pGeo.attributes.aAlpha;
    for (let i = 0; i < N; i++) a.array[i] += (alphaTarget[i] - a.array[i]) * Math.min(1, dt * 10);
    a.needsUpdate = true;
    const c = eGeo.attributes.color;
    for (let i = 0; i < edges.length; i++) {
      edgeNow[i] += (edgeTarget[i] - edgeNow[i]) * Math.min(1, dt * 10);
      c.array[i * 8 + 3] = edgeNow[i]; c.array[i * 8 + 7] = edgeNow[i];
    }
    c.needsUpdate = true;

    // labels
    labelFor.forEach((l) => {
      tmp.copy(l.pos).applyMatrix4(group.matrixWorld);
      const depth = tmp.z;
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${l.project ? 'translate(-50%, 70%)' : 'translate(-50%, -190%)'}`;
      l.el.style.opacity = String(Math.max(0.25, Math.min(1, 0.62 + depth / 9)));
    });
    if (hoverIdx >= 0) {
      const n = nodes[hoverIdx];
      tmp.copy(n.pos).applyMatrix4(group.matrixWorld).project(camera);
      tip.textContent = n.kind === 'course' ? (n.grade ? `${n.label} · ${n.grade}` : n.label) : n.label;
      tip.style.transform = `translate3d(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, 18px)`;
      tip.classList.add('is-on');
    } else tip.classList.remove('is-on');
  }

  root.classList.add('has-gl');
  return {
    host, scene, camera, update, clear: FIELD, clearAlpha: 0,
    resize(W, H) { w = W; h = H; },
  };
}


/* ------------------------------------------------------------------ */
/* Hero: live waterfall spectrogram of a simulated wrist pulse          */
/* A short-time Fourier transform runs on a synthetic PPG signal; each  */
/* new spectrum enters at the front and recedes. The heart-rate band is */
/* traced in orange.                                                    */
/* ------------------------------------------------------------------ */
function createHero(host) {
  const FS = 32;             // samples per second
  const N = 256;             // 8 s analysis window
  const HOP = 6;             // ~0.19 s between spectra
  const B = 104;             // frequency bins shown
  const F0 = 0.5, F1 = 4.0;  // Hz
  const ROWS = 92;
  const DZ = 0.12, WIDTH = 12;

  // window + DFT tables for the displayed bins only
  const hann = new Float32Array(N);
  for (let n = 0; n < N; n++) hann[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
  const freqs = new Float32Array(B);
  for (let k = 0; k < B; k++) freqs[k] = F0 + ((F1 - F0) * k) / (B - 1);
  const cosT = new Float32Array(B * N), sinT = new Float32Array(B * N);
  for (let k = 0; k < B; k++) for (let n = 0; n < N; n++) {
    const a = (2 * Math.PI * freqs[k] * n) / FS;
    cosT[k * N + n] = Math.cos(a); sinT[k * N + n] = Math.sin(a);
  }

  // synthetic PPG
  const ppgShape = (window.__ppg) || ((p) => Math.exp(-((p - 0.2) ** 2) / 0.006) + 0.42 * Math.exp(-((p - 0.43) ** 2) / 0.011));
  const buf = new Float32Array(N);
  let t = 0, phase = 0, sampleAcc = 0, hopCount = 0, noiseSeed = 7;
  const noise = () => ((noiseSeed = (noiseSeed * 16807) % 2147483647) / 2147483647 - 0.5);
  function hr(time) { return 1.18 + 0.1 * Math.sin((2 * Math.PI * time) / 40) + 0.04 * Math.sin((2 * Math.PI * time) / 11); }
  function nextSample() {
    const dt = 1 / FS;
    t += dt;
    phase = (phase + hr(t) * dt) % 1;
    const resp = 1 + 0.18 * Math.sin(2 * Math.PI * 0.25 * t);
    const wander = 0.06 * Math.sin(2 * Math.PI * 0.07 * t);
    buf.copyWithin(0, 1);
    buf[N - 1] = ppgShape(phase) * resp + wander + noise() * 0.06;
  }

  // spectra ring (rows of normalised magnitude) + the heart rate at each row
  const rows = [];
  const rowHR = [];
  let peakDb = -20;
  function spectrum() {
    let mean = 0;
    for (let n = 0; n < N; n++) mean += buf[n];
    mean /= N;
    const out = new Float32Array(B);
    let rowMax = -200;
    for (let k = 0; k < B; k++) {
      let re = 0, im = 0;
      const o = k * N;
      for (let n = 0; n < N; n++) {
        const v = (buf[n] - mean) * hann[n];
        re += v * cosT[o + n]; im -= v * sinT[o + n];
      }
      const db = 20 * Math.log10(Math.sqrt(re * re + im * im) + 1e-4);
      out[k] = db; if (db > rowMax) rowMax = db;
    }
    peakDb += (rowMax - peakDb) * 0.08;
    for (let k = 0; k < B; k++) out[k] = Math.max(0, Math.min(1, (out[k] - (peakDb - 42)) / 42));
    rows.unshift(out); rowHR.unshift(hr(t));
    if (rows.length > ROWS) { rows.pop(); rowHR.pop(); }
  }
  // warm up so the first frame already shows a full terrain
  for (let i = 0; i < N; i++) nextSample();
  for (let r = 0; r < ROWS; r++) { for (let h = 0; h < HOP; h++) nextSample(); spectrum(); }

  // geometry: one polyline per row (as segments) + the orange heart-rate ridge
  const SEG = ROWS * (B - 1);
  const lPos = new Float32Array(SEG * 6), lCol = new Float32Array(SEG * 8);
  const lGeo = new BufferGeometry();
  lGeo.setAttribute('position', new BufferAttribute(lPos, 3));
  lGeo.setAttribute('color', new BufferAttribute(lCol, 4));
  const lines = new LineSegments(lGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  const rPos = new Float32Array((ROWS - 1) * 6), rCol = new Float32Array((ROWS - 1) * 8);
  const rGeo = new BufferGeometry();
  rGeo.setAttribute('position', new BufferAttribute(rPos, 3));
  rGeo.setAttribute('color', new BufferAttribute(rCol, 4));
  const ridge = new LineSegments(rGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  const dots = new Points(new BufferGeometry(), pointMaterial());
  const dPos = new Float32Array(4 * 3), dCol = new Float32Array(4 * 3), dSize = new Float32Array(4), dAlpha = new Float32Array(4);
  dots.geometry.setAttribute('position', new BufferAttribute(dPos, 3));
  dots.geometry.setAttribute('aColor', new BufferAttribute(dCol, 3));
  dots.geometry.setAttribute('aSize', new BufferAttribute(dSize, 1));
  dots.geometry.setAttribute('aAlpha', new BufferAttribute(dAlpha, 1));

  const LOW = new Color('#28404f'), HIGH = new Color('#d6dee3');
  const xOf = (k) => -WIDTH / 2 + (WIDTH * k) / (B - 1);
  const H = 1.9;

  function rebuild() {
    let si = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r], z = -r * DZ;
      const depth = 1 - r / ROWS;
      const f0 = rowHR[r];
      for (let k = 0; k < B - 1; k++) {
        for (let e = 0; e < 2; e++) {
          const kk = k + e, m = row[kk];
          const o = si * 6 + e * 3, oc = si * 8 + e * 4;
          lPos[o] = xOf(kk); lPos[o + 1] = m * m * H; lPos[o + 2] = z;
          const near = Math.exp(-(((freqs[kk] - f0) / 0.16) ** 2)) * Math.min(1, m * 1.4);
          const cr = LOW.r + (HIGH.r - LOW.r) * m, cg = LOW.g + (HIGH.g - LOW.g) * m, cb = LOW.b + (HIGH.b - LOW.b) * m;
          lCol[oc] = cr + (ORANGE.r - cr) * near;
          lCol[oc + 1] = cg + (ORANGE.g - cg) * near;
          lCol[oc + 2] = cb + (ORANGE.b - cb) * near;
          lCol[oc + 3] = depth * depth * (0.25 + 0.75 * m);
        }
        si++;
      }
    }
    // ridge: peak inside 0.7-2.0 Hz for each row
    const peakX = [], peakY = [];
    for (let r = 0; r < rows.length; r++) {
      let best = 0, bk = 0;
      for (let k = 0; k < B; k++) if (freqs[k] > 0.7 && freqs[k] < 2.0 && rows[r][k] > best) { best = rows[r][k]; bk = k; }
      peakX.push(xOf(bk)); peakY.push(best * best * H + 0.02);
    }
    for (let r = 0; r < rows.length - 1; r++) {
      rPos.set([peakX[r], peakY[r], -r * DZ, peakX[r + 1], peakY[r + 1], -(r + 1) * DZ], r * 6);
      const a1 = (1 - r / ROWS) ** 1.5, a2 = (1 - (r + 1) / ROWS) ** 1.5;
      rCol.set([ORANGE.r, ORANGE.g, ORANGE.b, a1, ORANGE.r, ORANGE.g, ORANGE.b, a2], r * 8);
    }
    // glowing markers on the newest spectrum: fundamental + two harmonics
    const f0 = rowHR[0];
    [1, 2, 3].forEach((h, i) => {
      const k = Math.round(((f0 * h - F0) / (F1 - F0)) * (B - 1));
      const valid = k >= 0 && k < B;
      const m = valid ? rows[0][k] : 0;
      dPos.set([valid ? xOf(k) : 0, m * m * H, 0], i * 3);
      const c = i === 0 ? ORANGE : HIGH;
      dCol.set([c.r, c.g, c.b], i * 3);
      dSize[i] = 9; dAlpha[i] = valid && i === 0 ? 1 : 0;
    });
    lGeo.attributes.position.needsUpdate = true; lGeo.attributes.color.needsUpdate = true;
    rGeo.attributes.position.needsUpdate = true; rGeo.attributes.color.needsUpdate = true;
    ['position', 'aColor', 'aSize', 'aAlpha'].forEach((a) => { dots.geometry.attributes[a].needsUpdate = true; });
  }
  rebuild();

  const terrain = new Group();
  terrain.add(lines, ridge, dots);
  terrain.position.set(4.3, -1.0, 1.2);
  const scene = new Scene();
  scene.add(terrain);
  const camera = new PerspectiveCamera(40, 1, 0.1, 80);
  const look = new Vector3(0.4, -0.6, -4.5);
  const pointer = new Vector2(0, 0), eased = new Vector2(0, 0);
  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  let clock = 0;
  function update(dt) {
    clock += dt;
    sampleAcc += dt * FS;
    let added = false;
    while (sampleAcc >= 1) {
      sampleAcc -= 1; nextSample();
      if (++hopCount >= HOP) { hopCount = 0; spectrum(); added = true; }
    }
    if (added) rebuild();
    // fractional row offset makes the scroll continuous between spectra
    lines.position.z = ridge.position.z = dots.position.z = -((hopCount + sampleAcc) / HOP) * DZ;
    eased.lerp(pointer, Math.min(1, dt * 2.5));
    camera.position.set(
      Math.sin(clock * 0.07) * 0.5 + eased.x * 0.7,
      3.1 + Math.sin(clock * 0.05) * 0.2 - eased.y * 0.3,
      6.4
    );
    camera.lookAt(look);
  }
  update(0);

  return {
    host, scene, camera, update, clear: FIELD, clearAlpha: 0,
    attach() { host.classList.add('gl-active'); },
    detach() { host.classList.remove('gl-active'); },
  };
}

/* ------------------------------------------------------------------ */
export function init() {
  const views = [];
  const heroHost = document.querySelector('.hero-gl');
  if (heroHost) views.push(createHero(heroHost));
  const km = document.querySelector('[data-km]');
  if (km) views.push(createKnowledgeMap(km));
  if (!views.length) return;
  const m = createManager();
  views.forEach((v) => m.add(v));
  document.documentElement.classList.add('gl-on');
}

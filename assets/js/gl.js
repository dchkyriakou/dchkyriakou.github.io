/* WebGL layer for the hero spectrogram. One renderer; rendering stops when the
   hero is off screen or the tab is hidden. Loaded lazily (desktop, motion
   allowed, WebGL available); a still rendered from this scene is the fallback. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color,
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Points,
  ShaderMaterial, Vector2, Vector3
} from '../vendor/three.custom.min.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const ORANGE = new Color('#ff5b14');
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
          lCol[oc + 3] = depth * depth * (0.18 + 0.5 * m);
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
      rCol.set([ORANGE.r, ORANGE.g, ORANGE.b, a1 * 0.75, ORANGE.r, ORANGE.g, ORANGE.b, a2 * 0.75], r * 8);
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
  if (!views.length) return;
  const m = createManager();
  views.forEach((v) => m.add(v));
  document.documentElement.classList.add('gl-on');
}

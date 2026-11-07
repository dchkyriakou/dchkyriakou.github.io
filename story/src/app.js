/* Engineering Human Potential: the 3D layer of /story/.
   One renderer, one scene, one camera. A single glowing thread morphs from chapter to chapter;
   a point cloud becomes the circuit board, wrist, body, brain, thesis grids, sea, room and stars.
   Everything is procedural. Scroll position (smoothed by Lenis) drives a continuous station value;
   each chapter holds while its text is read. Text stays in the HTML; the canvas is decorative. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Line, Points,
  ShaderMaterial, Mesh, PlaneGeometry, MeshBasicMaterial, TextureLoader, SRGBColorSpace, Color,
  Vector3, AdditiveBlending,
} from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const LIGHT = matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1100px)').matches;
const NL = LIGHT ? 360 : 720;        // thread vertices
const NC = LIGHT ? 1500 : 4200;      // cloud points
const DPR = Math.min(window.devicePixelRatio || 1, LIGHT ? 1.5 : 2);
const ORANGE = new Color('#ff5b14');
const DIMC = new Color('#7f97a6');

// ---------- maths ----------
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const gs = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
const ppg = (p) => gs(p, 0.2, 0.055) + 0.42 * gs(p, 0.43, 0.075) - 0.06 * gs(p, 0.33, 0.02);
const ecg = (p) => 0.12 * gs(p, 0.16, 0.03) - 0.14 * gs(p, 0.3, 0.009) + gs(p, 0.33, 0.012) - 0.26 * gs(p, 0.36, 0.01) + 0.28 * gs(p, 0.58, 0.05);
const fr = (x) => x - Math.floor(x);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rs = () => rnd() * 2 - 1;

// ---------- world layout: one station per chapter along a gentle path ----------
const C = Array.from({ length: 9 }, (_, k) => [k * 18, Math.sin(k * 1.3) * 2.2, -k * 7]);
// camera: distance, yaw, pitch, look offset
const CAM = [
  [11, 0, 0.05, [0, 0, 0]],
  [11.5, -0.28, 0.42, [0, 0, 0]],
  [9.5, 0.4, 0.18, [0, 0, 0]],
  [12, -0.22, 0.06, [0, 0.35, 0]],
  [10, 0.32, 0.14, [0, 0, 0]],
  [11.5, 0, 0.03, [0, 0.2, 0]],
  [11.5, -0.18, 0.16, [0, 0, 0]],
  [12.5, 0.6, 0.3, [0, 0, 0]],
  [12, 0, 0.03, [0, 0, 0]],
];

// ---------- path sampler (circuit, room): polylines joined by invisible jumps ----------
function sampler(lines, jump = 0.25) {
  const pts = [], vis = [], cum = [0];
  lines.forEach((pl, li) => pl.forEach((p, i) => {
    if (pts.length) {
      const q = pts[pts.length - 1], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      cum.push(cum[cum.length - 1] + (i === 0 ? jump : d)); vis.push(i !== 0);
    }
    pts.push(p);
  }));
  const L = cum[cum.length - 1];
  return (u, out) => {
    const d = u * L;
    let j = 1; while (j < cum.length - 1 && cum[j] < d) j++;
    const a = pts[j - 1], b = pts[j], t = (d - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); out[3] = vis[j - 1] ? 1 : 0;
    return out;
  };
}
const CIRCUIT = [[-6.5, -1.2, 0], [-3.8, -1.2, 0], [-3.8, 0.7, 0], [-1.2, 0.7, 0], [-1.2, -0.5, 0], [1.4, -0.5, 0], [1.4, 1.5, 0], [3.9, 1.5, 0], [3.9, 0.1, 0], [6.5, 0.1, 0]];
CIRCUIT.forEach((p) => { p[0] *= 0.78; });
const circuit = sampler([CIRCUIT]);
const fy = -1.5, cy = 1.6, rx = 2.6, rz = 2;
const room = sampler([
  [[-rx, fy, rz], [rx, fy, rz], [rx, fy, -rz], [-rx, fy, -rz], [-rx, fy, rz], [-rx, cy, rz], [rx, cy, rz], [rx, cy, -rz], [-rx, cy, -rz], [-rx, cy, rz]],
  [[rx, fy, rz], [rx, cy, rz]], [[rx, fy, -rz], [rx, cy, -rz]], [[-rx, fy, -rz], [-rx, cy, -rz]],
  [[0.3, fy, -rz], [0.3, 0.6, -rz], [1.4, 0.6, -rz], [1.4, fy, -rz]],
  [[-rx, 0, -1], [-rx, 0, 0.7], [-rx, 0.95, 0.7], [-rx, 0.95, -1], [-rx, 0, -1]],
], 0.3);

// ---------- body targets (Texas) ----------
const SRC = [-4.6, 0.6, 0];
let HERO_Y = -2.6, HORIZON_Y = -2.4;
const TGT = [[0, 1.75, 0.43], [0, 3.2, 0.45], [1.62, -0.05, 0.3]]; // chest, forehead, finger

// ---------- thesis sub-stages ----------
const TB = [0, 0.12, 0.26, 0.42, 0.6, 0.74, 0.87, 1.0001];
const stageOf = (s) => { let j = 0; while (j < 6 && s >= TB[j + 1]) j++; return [j, clamp((s - TB[j]) / (TB[j + 1] - TB[j]))]; };
const BASE_Y = -1.6;
const distH = (x) => { const u = clamp((x + 4) / 8); return 3.0 * Math.pow(u, 1.6) * Math.pow(1 - u, 3.2) / 0.0388 / 3.2; };
const QUANT = [0.1, 0.17, 0.25, 0.31, 0.36, 0.42, 0.5, 0.58, 0.66, 0.75, 0.86];
const NOISE = Float32Array.from({ length: NL }, () => rs());
const BURST = (u) => sstep(0.24, 0.27, u) * (1 - sstep(0.34, 0.37, u)) + sstep(0.61, 0.64, u) * (1 - sstep(0.71, 0.74, u));

// ---------- thread shapes: write x, y, z, alpha for vertex i (u in 0..1) ----------
const T = [0, 0, 0, 0];
function thesisLine(j, l, u, i, t) {
  const x = (u - 0.5) * 9;
  const clean = -0.4 + ppg(fr(u * 7 + 0.1)) * 1.5;
  const flat = BASE_Y;
  if (j === 0) {
    const n = 1 - sstep(0.45, 1, l), b = BURST(u);
    T[0] = x; T[1] = clean + n * (NOISE[i] * 0.22 + b * (Math.sin(u * 190) * 0.9 + NOISE[i] * 0.6)); T[2] = 0; T[3] = lerp(1, 0.25, b * (1 - n));
  } else if (j === 1) { T[0] = x; T[1] = clean; T[2] = 0; T[3] = 1 - 0.75 * BURST(u); }
  else if (j === 2) { const m = sstep(0, 0.3, l); T[0] = x; T[1] = lerp(clean, flat, m); T[2] = 0; T[3] = lerp(1 - 0.75 * BURST(u), 0.35, m); }
  else if (j === 3) { const m = sstep(0.55, 0.85, l); T[0] = x; T[1] = lerp(flat, flat + distH(x), m); T[2] = 0; T[3] = lerp(0.35, 1, m); }
  else if (j === 4) { const m = sstep(0, 0.25, l); T[0] = x; T[1] = lerp(flat + distH(x), flat, m); T[2] = 0; T[3] = lerp(1, 0.22, m); }
  else if (j === 5) { T[0] = x; T[1] = flat; T[2] = 0; T[3] = 0.22; }
  else {
    const m = sstep(0, 0.2, l), grow = sstep(0.15, 0.7, l), bx = -4 + u * 8 * 0.75 * grow;
    T[0] = lerp(x, bx, m); T[1] = lerp(flat, -2.35, m); T[2] = 0; T[3] = lerp(0.22, 1, m);
  }
}
function lineShape(k, u, i, s, t, out) {
  switch (k) {
    case 0: { const x = portrait ? (u - 0.5) * 15 : lerp(-3.2, 6.8, u), beat = Math.exp(-fr(t / 1.05) / 0.11);
      out[0] = x; out[1] = ecg(fr(x / 3.2 + 0.3)) * 1.5 * (1 + 0.22 * beat) + HERO_Y; out[2] = 0; out[3] = sstep(0, 0.06, u) * sstep(1, 0.94, u); break; }
    case 1: circuit(u, out); break;
    case 2: { const a = u * Math.PI * 2 * 2.5 + t * 0.3, r = 1.32 + 0.38 * ppg(fr(u * 9 - t * 1.1));
      out[0] = (u - 0.5) * 5.2; out[1] = r * Math.cos(a) * 0.95; out[2] = r * Math.sin(a) * 0.75; out[3] = sstep(0, 0.04, u) * sstep(1, 0.96, u); break; }
    case 3: { const b = Math.min(2, Math.floor(u * 3)), v = u * 3 - b, tg = TGT[b];
      const w = (1 - v) * 0.25 * ppg(fr(v * 4 - t * 0.9));
      out[0] = lerp(SRC[0], tg[0], v); out[1] = lerp(SRC[1], tg[1], v) + Math.sin(Math.PI * v) * 0.9 + w; out[2] = lerp(SRC[2], tg[2], v) + Math.sin(Math.PI * v) * 0.6;
      out[3] = v < 0.012 || v > 0.988 ? 0 : 1; break; }
    case 4: { const a = u * Math.PI * 2 + t * 0.22, r = 2.55 + 0.17 * Math.sin(a * 14 + t * 3) + 0.08 * Math.sin(a * 31 - t * 5);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r, y = 0.14 * Math.sin(a * 9 + t * 2);
      out[0] = px; out[1] = y + pz * 0.34; out[2] = pz * 0.94; out[3] = 1; break; }
    case 5: { const [j, l] = stageOf(s); thesisLine(j, l, u, i, t); out[0] = T[0]; out[1] = T[1]; out[2] = T[2]; out[3] = T[3]; break; }
    case 6: { const x = (u - 0.5) * 10, m = sstep(0.4, 0.6, s);
      const yE = 0.1 + ecg(fr(x / 1.15 + t * 1.6)) * 1.7, yS = -1.0 + 0.35 * Math.sin(x * 0.9 + t * 1.2) + 0.15 * Math.sin(x * 2.1 - t * 1.7);
      out[0] = x; out[1] = lerp(yE, yS, m); out[2] = 0; out[3] = sstep(0, 0.05, u) * sstep(1, 0.95, u); break; }
    case 7: { const r = sstep(0, 0.75, s); if (u <= r) room(u, out); else { room(r, out); out[3] = 0; } break; }
    default: { const x = (u - 0.5) * 28, env = 0.4 + 0.6 * Math.exp(-fr(t / 3.5) / 0.5);
      out[0] = x; out[1] = HORIZON_Y + (Math.abs(x) < 2 ? ecg((x + 2) / 4) * 0.9 * env : 0); out[2] = -1; out[3] = sstep(0, 0.08, u) * sstep(1, 0.92, u); }
  }
  return out;
}

// ---------- clouds: static shapes precomputed in local space ----------
function mk() { return { p: new Float32Array(NC * 3), h: new Float32Array(NC), a: new Float32Array(NC) }; }
function dust(sh, i, sx = 14, sy = 7, sz = 6, a = 0.22) { sh.p.set([rs() * sx, rs() * sy, rs() * sz - 2], i * 3); sh.a[i] = a + rnd() * a; sh.h[i] = 0; }
function onEllipsoid(c, r, warp) { let x = rs(), y = rs(), z = rs(), n = Math.hypot(x, y, z) || 1; x /= n; y /= n; z /= n; const f = warp ? warp(x, y, z) : 1; return [c[0] + x * r[0] * f, c[1] + y * r[1] * f, c[2] + z * r[2] * f]; }
function onCapsule(a, b, r) { const v = rnd(), ang = rnd() * Math.PI * 2, rr = r * (0.85 + 0.15 * rnd()); return [lerp(a[0], b[0], v) + Math.cos(ang) * rr, lerp(a[1], b[1], v) + Math.sin(ang) * rr * 0.35, lerp(a[2], b[2], v) + Math.sin(ang) * rr]; }
const CL = [];
// 0 hero dust, 1 circuit board lattice, 2 wrist, 3 body, 4 brain, 6 sea (dynamic), 7 room floor, 8 stars
CL[0] = mk(); for (let i = 0; i < NC; i++) dust(CL[0], i);
CL[1] = mk(); { const cols = 34, rows = 18; for (let i = 0; i < NC; i++) { if (i < cols * rows) { CL[1].p.set([-7.5 + (i % cols) * 0.45, -3.8 + Math.floor(i / cols) * 0.45, -1.2], i * 3); CL[1].a[i] = 0.2; } else dust(CL[1], i, 14, 7, 6, 0.12); } }
CL[2] = mk(); for (let i = 0; i < NC; i++) { if (i < NC * 0.72) { const x = rs() * 2.8, a = rnd() * Math.PI * 2, sc = 1 - 0.13 * (x / 2.8); CL[2].p.set([x, Math.cos(a) * 0.95 * sc, Math.sin(a) * 0.7 * sc], i * 3); CL[2].a[i] = 0.5; } else dust(CL[2], i, 14, 7, 6, 0.12); }
CL[3] = mk(); {
  const parts = [
    [0.12, () => onEllipsoid([0, 3.05, 0], [0.46, 0.55, 0.48])], [0.03, () => onCapsule([0, 2.45, 0], [0, 2.75, 0], 0.17)],
    [0.3, () => onEllipsoid([0, 1.45, 0], [0.8, 1.05, 0.42])], [0.07, () => onEllipsoid([0, 0.2, 0], [0.62, 0.4, 0.38])],
    [0.045, () => onCapsule([0.95, 2.35, 0], [1.25, 1.05, 0.05], 0.16)], [0.045, () => onCapsule([-0.95, 2.35, 0], [-1.25, 1.05, 0.05], 0.16)],
    [0.04, () => onCapsule([1.25, 1.05, 0.05], [1.6, 0.0, 0.28], 0.13)], [0.04, () => onCapsule([-1.25, 1.05, 0.05], [-1.6, 0.0, 0.28], 0.13)],
    [0.075, () => onCapsule([0.33, 0.05, 0], [0.4, -1.55, 0], 0.22)], [0.075, () => onCapsule([-0.33, 0.05, 0], [-0.4, -1.55, 0], 0.22)],
    [0.055, () => onCapsule([0.4, -1.55, 0], [0.42, -3.0, 0], 0.16)], [0.055, () => onCapsule([-0.4, -1.55, 0], [-0.42, -3.0, 0], 0.16)],
  ];
  const tot = parts.reduce((s, p) => s + p[0], 0);
  for (let i = 0; i < NC; i++) {
    if (i < NC * 0.86) { let r = rnd() * tot, k = 0; while (r > parts[k][0]) { r -= parts[k][0]; k++; } CL[3].p.set(parts[k][1](), i * 3); CL[3].a[i] = 0.5; }
    else dust(CL[3], i, 14, 7, 6, 0.12);
  }
}
CL[4] = mk(); for (let i = 0; i < NC; i++) {
  if (i < NC * 0.78) { const s = i % 2 ? 1 : -1; CL[4].p.set(onEllipsoid([s * 0.62, 0, 0], [0.95, 1.05, 1.5], (x, y, z) => (1 + 0.07 * Math.sin(x * 9 + z * 7) * Math.sin(y * 11 - z * 5)) * (x * s < -0.55 ? 0.9 : 1)), i * 3); CL[4].a[i] = 0.5; }
  else if (i < NC * 0.86) { CL[4].p.set(onEllipsoid([0, -0.78, -1.05], [0.8, 0.38, 0.45]), i * 3); CL[4].a[i] = 0.45; }
  else dust(CL[4], i, 14, 7, 6, 0.12);
}
CL[7] = mk(); { const cols = 22, rows = 18; for (let i = 0; i < NC; i++) { if (i < cols * rows) { CL[7].p.set([-3.7 + (i % cols) * 0.35, fy - 0.02, -3 + Math.floor(i / cols) * 0.35], i * 3); CL[7].a[i] = 0.24; } else dust(CL[7], i, 14, 7, 6, 0.1); } }
CL[8] = mk(); for (let i = 0; i < NC; i++) { CL[8].p.set([rs() * 30, rs() * 9 + 2, -8 - rnd() * 20], i * 3); CL[8].a[i] = 0.15 + rnd() * 0.3; }
// sea grid (k6) and thesis layouts (k5)
const SEA = new Float32Array(NC * 2); { const cols = Math.round(Math.sqrt(NC * 2.2)); for (let i = 0; i < NC; i++) { SEA[i * 2] = -9 + (i % cols) / cols * 18; SEA[i * 2 + 1] = -6 + Math.floor(i / cols) / Math.ceil(NC / cols) * 9; } }
const TH = { cl: new Float32Array(NC * 3), dy: new Float32Array(NC * 3), dya: new Float32Array(NC), ds: new Float32Array(NC * 3), mx: new Float32Array(NC * 3), row: new Uint8Array(NC), cid: new Uint8Array(NC), day: new Uint16Array(NC) };
{
  const cdf = []; let acc = 0; for (let x = -4; x <= 4.0001; x += 0.02) { acc += distH(x); cdf.push([x, acc]); }
  for (let i = 0; i < NC; i++) {
    const cid = i % 27; TH.cid[i] = cid;
    { const ang = rnd() * 6.2832, rr = Math.sqrt(rnd()) * 0.14; TH.cl.set([-4 + (cid % 9) * 1.0 + Math.cos(ang) * rr, 0.7 + Math.floor(cid / 9) * 0.85 + Math.sin(ang) * rr, rs() * 0.08], i * 3); }
    const cell = i % 360, d = cell >> 1, half = cell & 1; TH.day[i] = d;
    TH.dy.set([-4.25 + (d % 18) * 0.5 + (half ? 0.11 : -0.11) + rs() * 0.06, 2.3 - Math.floor(d / 18) * 0.42 + rs() * 0.12, 0], i * 3);
    TH.dya[i] = half ? 0.28 : 0.9;
    const target = rnd() * acc; let k = 0; while (k < cdf.length - 1 && cdf[k][1] < target) k++; const x = cdf[k][0];
    TH.ds.set([x, BASE_Y + rnd() * distH(x), rs() * 0.1], i * 3);
    const row = i % 24; TH.row[i] = row;
    TH.mx.set([-4.2 + (Math.floor(i / 24) / Math.ceil(NC / 24)) * 8.4, 2.4 - row * 0.19, 0], i * 3);
  }
}
const DUST5 = mk(); for (let i = 0; i < NC; i++) dust(DUST5, i, 9, 4, 3, 0.18);

// ---------- cloud evaluation for station k ----------
const P3 = [0, 0, 0];
function cloudPoint(k, i, s, t, out) { // out: [x,y,z,heat,alpha]
  if (k === 6) {
    const m = sstep(0.4, 0.6, s), sx = SEA[i * 2], sz = SEA[i * 2 + 1];
    const yS = -1.6 + 0.3 * Math.sin(sx * 0.7 + t * 1.1 + sz * 0.4) + 0.12 * Math.sin(sx * 1.9 - t * 1.6);
    const d = CL[0].p;
    out[0] = lerp(d[i * 3], sx, m); out[1] = lerp(d[i * 3 + 1], yS, m); out[2] = lerp(d[i * 3 + 2], sz, m);
    out[3] = 0; out[4] = lerp(CL[0].a[i], 0.5 * (1 - (sz + 6) / 12), m); return out;
  }
  if (k === 5) {
    const [j, l] = stageOf(s), dd = DUST5.p;
    const at = (arr) => { P3[0] = arr[i * 3]; P3[1] = arr[i * 3 + 1]; P3[2] = arr[i * 3 + 2]; return P3; };
    let x, y, z, h = 0, a;
    if (j < 2) { x = dd[i * 3]; y = dd[i * 3 + 1]; z = dd[i * 3 + 2]; a = DUST5.a[i]; }
    else if (j === 2) { const st = TH.cid[i] / 27 * 0.6, e = sstep(st, st + 0.18, l); at(TH.cl); x = lerp(dd[i * 3], P3[0], e); y = lerp(dd[i * 3 + 1], P3[1], e); z = lerp(dd[i * 3 + 2], P3[2], e); h = e * (1 - sstep(st + 0.18, st + 0.4, l)); a = lerp(DUST5.a[i], LIGHT ? 0.55 : 0.32, e); }
    else if (j === 3) {
      const st = TH.day[i] / 180 * 0.4, e = sstep(st, st + 0.12, l), c = sstep(0.55, 0.85, l);
      const ax = TH.cl[i * 3], ay = TH.cl[i * 3 + 1], az = TH.cl[i * 3 + 2]; at(TH.dy);
      x = lerp(ax, P3[0], e); y = lerp(ay, P3[1], e); z = lerp(az, P3[2], e);
      x = lerp(x, TH.ds[i * 3], c); y = lerp(y, TH.ds[i * 3 + 1], c); z = lerp(z, TH.ds[i * 3 + 2], c);
      a = lerp(lerp(LIGHT ? 0.55 : 0.32, TH.dya[i], e), 0.6, c); h = e * (1 - sstep(st + 0.12, st + 0.25, l)) * (1 - c);
    } else if (j === 4) {
      const st = TH.row[i] / 24 * 0.6, e = sstep(st, st + 0.2, l); at(TH.mx);
      x = lerp(TH.ds[i * 3], P3[0] - (1 - e) * 2.5, e); y = lerp(TH.ds[i * 3 + 1], P3[1], e); z = lerp(TH.ds[i * 3 + 2], 0, e); a = lerp(0.6, 0.55, e); h = e * (1 - sstep(st + 0.2, st + 0.32, l));
    } else {
      at(TH.mx); x = P3[0]; y = P3[1]; z = 0;
      const fold = j === 5 ? Math.floor(clamp(l / 0.85) * 4) % 4 : -1;
      h = fold >= 0 && l < 0.85 && TH.row[i] % 4 === fold ? 0.85 : 0; a = j === 6 ? lerp(0.55, 0.22, sstep(0, 0.3, l)) : 0.55;
      if (j === 6 && i % 3 === 0) {
        const grow = sstep(0.15, 0.7, l), m = sstep(0, 0.25, l), v = fr(Math.sin(i * 12.9898) * 43758.5453), w = fr(Math.sin(i * 78.233) * 24634.6345);
        x = lerp(x, -4 + v * 6 * grow, m); y = lerp(y, -2.65 + w * 0.55, m); h = m; a = lerp(0.55, 0.75, m);
      }
    }
    out[0] = x; out[1] = y; out[2] = z; out[3] = h; out[4] = a; return out;
  }
  const sh = CL[k];
  let x = sh.p[i * 3], y = sh.p[i * 3 + 1], z = sh.p[i * 3 + 2];
  if (k === 4) { const ang = t * 0.12, c = Math.cos(ang), sn = Math.sin(ang); const nx = x * c - z * sn; z = x * sn + z * c; x = nx; }
  out[0] = x; out[1] = y; out[2] = z; out[3] = sh.h[i]; out[4] = sh.a[i]; return out;
}

// ---------- markers (glowing points) ----------
const MAXM = 24;
function markers(k, s, t, push) {
  if (k === 1) CIRCUIT.slice(1, -1).forEach((p, i) => push(p[0], p[1], p[2], 9, 0.85 * (0.6 + 0.4 * Math.sin(t * 2 + i))));
  if (k === 3) TGT.forEach((p, i) => push(p[0], p[1], p[2], 22 + 8 * Math.sin(t * 3 + i * 2), 1));
  if (k === 5) {
    const [j, l] = stageOf(s);
    if (j === 1) { for (let b = 0; b < 7; b++) { const u = (b + 0.1) / 7, x = (u - 0.5) * 9; if (BURST(u) > 0.2) continue; push(x, -0.4 + 1.5, 0, 12, sstep(b / 7 * 0.6, b / 7 * 0.6 + 0.15, l)); } }
    if (j === 3) QUANT.forEach((q, n) => push(-4 + q * 8, BASE_Y, 0, 7, sstep(0.7 + n * 0.02, 0.8 + n * 0.02, l)));
    if (j >= 5) { const fold = j === 5 ? Math.floor(clamp(l / 0.85) * 4) % 4 : 9; [-3, -1, 1, 3].forEach((x, n) => push(x, 3.15, 0, fold === n || j === 6 || l >= 0.85 ? 16 : 10, j === 6 ? 0.7 : fold === n || l >= 0.85 ? 1 : 0.4)); }
    if (j === 6) { const grow = sstep(0.15, 0.7, l); push(-4 + 8 * 0.75 * grow, -2.35, 0, 14, sstep(0.1, 0.2, l)); }
  }
}

// ---------- photos (textured planes) ----------
const PHOTOS = [
  { src: 'assets/img/iftp-team.webp', k: 3, from: -1, to: 0.5, pos: [3.4, 1.6, -1.2], w: 3.2 },
  { src: 'assets/img/tamu-poster.webp', k: 3, from: 0.5, to: 2, pos: [3.4, 1.6, -1.2], w: 3.2 },
  { src: 'assets/img/grips-poster.webp', k: 4, from: 0.1, to: 2, pos: [3.1, 0.4, -1.2], w: 2.2 },
  { src: 'assets/img/tkd-podium.webp', k: 6, from: -1, to: 0.45, pos: [3.6, 0.9, -1.2], w: 2.3 },
  { src: 'assets/img/sailing-crew.webp', k: 6, from: 0.45, to: 2, pos: [3.6, 0.9, -1.2], w: 2.3 },
];
const PORTRAIT_PHOTO = [0, -0.3, 3];
if (LIGHT) PHOTOS.forEach((p) => { p.w *= 0.85; });

// ---------- three.js setup ----------
const canvas = document.querySelector('.scene');
const renderer = new WebGLRenderer({ canvas, antialias: !LIGHT, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setClearColor(new Color('#071118'), 1);
const scene = new Scene();
const camera = new PerspectiveCamera(40, 1, 0.1, 200);

const lineGeo = new BufferGeometry();
const lPos = new Float32Array(NL * 3), lA = new Float32Array(NL), lU = Float32Array.from({ length: NL }, (_, i) => i / (NL - 1));
lineGeo.setAttribute('position', new BufferAttribute(lPos, 3));
lineGeo.setAttribute('aAlpha', new BufferAttribute(lA, 1));
lineGeo.setAttribute('aU', new BufferAttribute(lU, 1));
const U = { uHead: { value: 0 }, uScale: { value: DPR }, uTime: { value: 0 } };
const lineMat = new ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
  vertexShader: `attribute float aAlpha; attribute float aU; uniform float uHead; varying float vA; varying float vH;
    void main(){ float d=aU-uHead; vH=exp(-d*d/0.0009); vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying float vA; varying float vH;
    void main(){ vec3 c=mix(vec3(1.,.36,.08), vec3(1.,.88,.78), vH*.7); gl_FragColor=vec4(c, vA*(.9+.1*vH)); }`,
});
const glowMat = new ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
  vertexShader: `attribute float aAlpha; attribute float aU; uniform float uHead; uniform float uScale; varying float vA; varying float vH;
    void main(){ float d=aU-uHead; vH=exp(-d*d/0.0009); vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.);
      gl_PointSize=uScale*(26.+60.*vH)*(1./-mv.z); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; varying float vH;
    void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); a*=a; gl_FragColor=vec4(vec3(1.,.4,.12), a*vA*(.08+.3*vH)); }`,
});
const glowPts = new Points(lineGeo, glowMat), threadLine = new Line(lineGeo, lineMat);
glowPts.frustumCulled = threadLine.frustumCulled = false; // geometry moves every frame
scene.add(glowPts, threadLine);

const cGeo = new BufferGeometry();
const cPos = new Float32Array(NC * 3), cH = new Float32Array(NC), cA = new Float32Array(NC);
cGeo.setAttribute('position', new BufferAttribute(cPos, 3));
cGeo.setAttribute('aHeat', new BufferAttribute(cH, 1));
cGeo.setAttribute('aAlpha', new BufferAttribute(cA, 1));
const cMat = new ShaderMaterial({
  uniforms: { uScale: U.uScale, uDim: { value: DIMC }, uHot: { value: ORANGE }, uSize: { value: LIGHT ? 9 : 7 } },
  transparent: true, depthWrite: false, blending: AdditiveBlending,
  vertexShader: `attribute float aHeat; attribute float aAlpha; uniform float uScale; uniform float uSize; varying float vH; varying float vA;
    void main(){ vH=aHeat; vec4 mv=modelViewMatrix*vec4(position,1.); float far=clamp((-mv.z-8.)/30.,0.,1.); vA=aAlpha*(1.-far*.75);
      gl_PointSize=uScale*uSize*(1.+aHeat*.8)*(10./-mv.z); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uDim; uniform vec3 uHot; varying float vH; varying float vA;
    void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.15,d); if(a<.01) discard; gl_FragColor=vec4(mix(uDim,uHot,vH), a*vA); }`,
});
const cloudPts = new Points(cGeo, cMat); cloudPts.frustumCulled = false; scene.add(cloudPts);

const mGeo = new BufferGeometry();
const mPos = new Float32Array(MAXM * 3), mS = new Float32Array(MAXM), mA = new Float32Array(MAXM);
mGeo.setAttribute('position', new BufferAttribute(mPos, 3));
mGeo.setAttribute('aSize', new BufferAttribute(mS, 1));
mGeo.setAttribute('aAlpha', new BufferAttribute(mA, 1));
const mMat = new ShaderMaterial({
  uniforms: { uScale: U.uScale }, transparent: true, depthWrite: false, blending: AdditiveBlending,
  vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
    void main(){ vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uScale*aSize*(10./-mv.z); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float core=smoothstep(.22,.12,d); float halo=smoothstep(.5,0.,d)*.45;
    float a=max(core,halo)*vA; if(a<.01) discard; gl_FragColor=vec4(mix(vec3(1.,.36,.08),vec3(1.,.9,.8),core*.6), a); }`,
});
const markPts = new Points(mGeo, mMat); markPts.frustumCulled = false; scene.add(markPts);

const loader = new TextureLoader();
const planes = PHOTOS.map((ph) => {
  const mat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
  mesh.visible = false; scene.add(mesh);
  loader.load(ph.src, (tex) => { tex.colorSpace = SRGBColorSpace; mat.map = tex; mat.needsUpdate = true; ph.ar = tex.image.height / tex.image.width; });
  return mesh;
});

// ---------- scroll → station ----------
const sections = Array.from(document.querySelectorAll('[data-station]'));
const cards = sections.map((s) => s.querySelector('.card'));
const traits = Array.from(document.querySelectorAll('[data-trait]'));
const indexLinks = Array.from(document.querySelectorAll('[data-go]'));
const steps = Array.from(document.querySelectorAll('.steps li'));
let mids = [];
function measure() { const y0 = window.scrollY; mids = sections.map((s) => { const r = s.getBoundingClientRect(); return r.top + y0 + r.height / 2; }); }
function stationAt(y) {
  if (y <= mids[0]) return 0; if (y >= mids[8]) return 8;
  let k = 0; while (y > mids[k + 1]) k++; return k + (y - mids[k]) / (mids[k + 1] - mids[k]);
}
const subOf = (q, k) => clamp((q - (k - 0.25)) / 0.5);

const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
indexLinks.forEach((a) => a.addEventListener('click', (e) => {
  const k = +a.dataset.go; if (!mids.length) return;
  e.preventDefault(); lenis.scrollTo(mids[k] - window.innerHeight / 2, { duration: 1.4 }); history.replaceState(null, '', a.getAttribute('href'));
}));

// card entrances: children rise once, staggered (emil: ease-out, 60-80 ms stagger)
cards.forEach((card, k) => {
  if (k === 0) return;
  gsap.from(card.children, { y: 16, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.07, scrollTrigger: { trigger: sections[k], start: 'top 75%', once: true } });
});

// ---------- per-frame ----------
const O = [0, 0, 0, 0], O2 = [0, 0, 0, 0], Q = [0, 0, 0, 0, 0], Q2 = [0, 0, 0, 0, 0];
const camPos = new Vector3(), lookAt = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3();
const pointer = { x: 0, y: 0, ex: 0, ey: 0 };
if (!LIGHT) window.addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });
let W = 1, H = 1, portrait = false, lastIdx = -1, lastStep = -1;

function resize() {
  W = window.innerWidth; H = window.innerHeight; portrait = W < 900; HERO_Y = portrait ? 0.4 : -0.6; HORIZON_Y = portrait ? 0.6 : -2.4;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  if (portrait) camera.setViewOffset(W, H, 0, H * 0.2, W, H); else camera.setViewOffset(W, H, -W * 0.21, 0, W, H);
  camera.updateProjectionMatrix();
  measure();
}

function camFor(k, s, outPos, outLook) {
  let [d, yaw, pitch, lk] = CAM[k];
  if (k === 7) yaw = lerp(0.6, -0.55, s);
  if (portrait) d *= 1.25 * Math.pow(Math.max(0.45, W / H), -0.45) * (k === 5 ? 1.6 : 1); else d *= 1.5;
  outLook.set(C[k][0] + lk[0], C[k][1] + lk[1], C[k][2] + lk[2]);
  outPos.set(outLook.x + d * Math.sin(yaw) * Math.cos(pitch), outLook.y + d * Math.sin(pitch), outLook.z + d * Math.cos(yaw) * Math.cos(pitch));
}

function frame(time) {
  if (document.hidden || !mids.length) return;
  const t = time; U.uTime.value = t; U.uHead.value = fr(t / 2.6);
  const q = stationAt(window.scrollY + H / 2);
  const k0 = Math.min(7, Math.floor(q)), f = sstep(0.25, 0.75, q - k0), k1 = k0 + 1;
  const s0 = subOf(q, k0), s1 = subOf(q, k1);

  // thread
  const c0 = C[k0], c1 = C[k1];
  for (let i = 0; i < NL; i++) {
    const u = lU[i];
    if (f < 1) lineShape(k0, u, i, s0, t, O);
    if (f > 0) lineShape(k1, u, i, s1, t, O2);
    const a = f <= 0 ? O : f >= 1 ? O2 : null;
    if (a) { const c = a === O ? c0 : c1; lPos[i * 3] = a[0] + c[0]; lPos[i * 3 + 1] = a[1] + c[1]; lPos[i * 3 + 2] = a[2] + c[2]; lA[i] = a[3]; }
    else {
      lPos[i * 3] = lerp(O[0] + c0[0], O2[0] + c1[0], f); lPos[i * 3 + 1] = lerp(O[1] + c0[1], O2[1] + c1[1], f);
      lPos[i * 3 + 2] = lerp(O[2] + c0[2], O2[2] + c1[2], f); lA[i] = lerp(O[3], O2[3], f);
    }
  }
  lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.aAlpha.needsUpdate = true;

  // cloud
  for (let i = 0; i < NC; i++) {
    if (f < 1) cloudPoint(k0, i, s0, t, Q);
    if (f > 0) cloudPoint(k1, i, s1, t, Q2);
    if (f <= 0) { cPos[i * 3] = Q[0] + c0[0]; cPos[i * 3 + 1] = Q[1] + c0[1]; cPos[i * 3 + 2] = Q[2] + c0[2]; cH[i] = Q[3]; cA[i] = Q[4]; }
    else if (f >= 1) { cPos[i * 3] = Q2[0] + c1[0]; cPos[i * 3 + 1] = Q2[1] + c1[1]; cPos[i * 3 + 2] = Q2[2] + c1[2]; cH[i] = Q2[3]; cA[i] = Q2[4]; }
    else {
      cPos[i * 3] = lerp(Q[0] + c0[0], Q2[0] + c1[0], f); cPos[i * 3 + 1] = lerp(Q[1] + c0[1], Q2[1] + c1[1], f);
      cPos[i * 3 + 2] = lerp(Q[2] + c0[2], Q2[2] + c1[2], f); cH[i] = lerp(Q[3], Q2[3], f); cA[i] = lerp(Q[4], Q2[4], f);
    }
  }
  cGeo.attributes.position.needsUpdate = true; cGeo.attributes.aHeat.needsUpdate = true; cGeo.attributes.aAlpha.needsUpdate = true;

  // markers
  let n = 0;
  const push = (w, c) => (x, y, z, size, a) => { if (n >= MAXM) return; mPos.set([x + c[0], y + c[1], z + c[2]], n * 3); mS[n] = size; mA[n] = a * w; n++; };
  if (f < 1) markers(k0, s0, t, push(1 - f, c0));
  if (f > 0) markers(k1, s1, t, push(f, c1));
  for (let i = n; i < MAXM; i++) mA[i] = 0;
  mGeo.attributes.position.needsUpdate = true; mGeo.attributes.aSize.needsUpdate = true; mGeo.attributes.aAlpha.needsUpdate = true;

  // camera (ease-in-out between stations, rest at each)
  camFor(k0, s0, tmpA, lookAt); camFor(k1, s1, tmpB, camPos); // tmpA/B = positions, lookAt/camPos = look targets
  lookAt.lerp(camPos, f);
  pointer.ex += (pointer.x - pointer.ex) * 0.05; pointer.ey += (pointer.y - pointer.ey) * 0.05;
  camera.position.copy(tmpA.lerp(tmpB, f));
  camera.position.x += pointer.ex * 0.8 + Math.sin(t * 0.13) * 0.25; camera.position.y += -pointer.ey * 0.5 + Math.sin(t * 0.11) * 0.12;
  camera.lookAt(lookAt);

  // photos
  PHOTOS.forEach((ph, j) => {
    const m = planes[j], w = ph.k === k0 ? 1 - f : ph.k === k1 ? f : 0;
    const s = ph.k === k0 ? s0 : s1;
    const win = sstep(ph.from - 0.08, ph.from + 0.04, s) * (1 - sstep(ph.to - 0.04, ph.to + 0.08, s));
    const o = w * win * (m.material.map ? 1 : 0);
    m.visible = o > 0.01; m.material.opacity = o * 0.96;
    if (m.visible) {
      const c = C[ph.k];
      const pp = portrait ? PORTRAIT_PHOTO : ph.pos;
      m.position.set(c[0] + pp[0], c[1] + pp[1] + Math.sin(t * 0.5 + j) * 0.06 + (1 - win) * -0.25, c[2] + pp[2]);
      m.scale.set(ph.w, ph.w * (ph.ar || 0.75), 1);
      m.quaternion.copy(camera.quaternion);
    }
  });

  renderer.render(scene, camera);

  // HTML state
  cards.forEach((c, k) => { c.style.opacity = (k === 0 ? 1 - sstep(0.3, 0.55, q) : 1 - sstep(0.32, 0.5, Math.abs(q - k))).toFixed(3); });
  traits.forEach((li, k) => li.classList.toggle('is-earned', q >= k + 1 + 0.2));
  const idx = Math.round(q);
  if (idx !== lastIdx) { lastIdx = idx; indexLinks.forEach((a) => a.setAttribute('aria-current', +a.dataset.go === idx ? 'step' : 'false')); }
  const st = q > 4.6 && q < 5.5 ? stageOf(subOf(q, 5))[0] : -1;
  if (st !== lastStep) { lastStep = st; steps.forEach((li, j) => li.classList.toggle('is-on', j === st)); }
}

resize();
window.addEventListener('resize', resize);
document.fonts && document.fonts.ready.then(measure);
window.addEventListener('load', measure);
new ResizeObserver(measure).observe(document.querySelector('main'));
gsap.ticker.add((time) => { lenis.raf(time * 1000); frame(time); });
gsap.ticker.lagSmoothing(0);
requestAnimationFrame(() => requestAnimationFrame(() => { canvas.classList.add('is-live'); root.classList.add('gl-live'); }));
root.classList.add('story-ready');

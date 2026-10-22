// 1D cross-shore replica of shore.html cs_swe for #702 swash retuning (issue thread).
// Usage: import { runSim, evalTrace }; ~25 s per 46 s config. Eval with settle>=20
// (skips the warm-start transient) and several windows — single-window traces lie.
// Terrain / eikonal / warm-start are EXTRACTED verbatim from shore.html so the
// replica cannot drift from the real model.
import { readFileSync } from 'fs';
const SRC = readFileSync(new URL('../public/demos/shore.html', import.meta.url), 'utf8');
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const head = cut('const qs = new URLSearchParams', '\n// ---- JS mirrors');
const mirrors = cut('function hash1(', '\nconst cam = {');
const f = new Function(`
const location = { search: '' };
const matchMedia = () => ({ matches: false });
const innerWidth = 1600, innerHeight = 1000;
${head}
${mirrors}
return { SEED, SLOPE, XS0, G, SX0, SX1, SZ0, SZ1, SDX, NX, NZ, NC, NSUB, SW, CHOP, CHOPN,
  TX0, TX1, TXS, TZ0, TZS, NTX, NTZ, NTT, ttJS, terrain, xsCurve, etaA, kDepth };
`)();

const SWL = f.SW.map(o => ({ ...o }));
const { SEED, SLOPE, G, SX0, SX1, SDX, NX, SW, TX0, TXS, TZ0, TZS, NTX, NTZ, NTT, ttJS, terrain, xsCurve } = f;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
const swellA = (a, w, d0) => { const c = Math.min(G / w, Math.sqrt(G * Math.max(d0, 0.15))); return a * Math.max(1, Math.min(3, Math.pow((G / w) / Math.max(c, 0.4), 0.75))) };
const prof = (phi, m) => Math.sin(phi) - 0.5 * m * Math.sin(2 * phi);
function ttAt(ci, x, z) {
  const fx0 = Math.max(0, Math.min(NTX - 1, (x - TX0) / TXS)), fz0 = Math.max(0, Math.min(NTZ - 1, (z - TZ0) / TZS));
  const i = Math.floor(fx0), j = Math.floor(fz0), tx = fx0 - i, tz = fz0 - j;
  const iu = Math.min(i + 1, NTX - 1), ju = Math.min(j + 1, NTZ - 1), b = ci * NTT;
  const a00 = ttJS[b + i * NTZ + j], a10 = ttJS[b + iu * NTZ + j], a01 = ttJS[b + i * NTZ + ju], a11 = ttJS[b + iu * NTZ + ju];
  return (a00 + (a10 - a00) * tx) + ((a01 + (a11 - a01) * tx) - (a00 + (a10 - a00) * tx)) * tz;
}
function etaSwellD(x, z, d0, T) {
  const m = Math.max(0, Math.min(0.8, 1.15 - d0 * 0.95));
  let e = 0;
  SWL.forEach((s, ci) => { e += swellA(s.A, s.w, d0) * prof(s.w * (T - ttAt(ci, x, z)), m) });
  return e;
}

export function runSim(p, seconds, nz = 64) {
  if (p.A0) SWL[0].A = p.A0; if (p.A1) SWL[1].A = p.A1; if (p.A2) SWL[2].A = p.A2;
  const zs = Array.from({ length: nz }, (_, j) => -60 + j * (120 / (nz - 1)));
  const N = NX * nz;
  const h = new Float32Array(N), u = new Float32Array(N), v = new Float32Array(N);
  const hB = [new Float32Array(N), new Float32Array(N)];
  const bed = new Float32Array(N);
  for (let i = 0; i < NX; i++) for (let j = 0; j < nz; j++) {
    const x = SX0 + i * SDX, z = zs[j];
    bed[i * nz + j] = terrain(x, z);
    h[i * nz + j] = Math.max(etaSwellD(x, z, Math.max(0.05, -bed[i * nz + j]), 0) - bed[i * nz + j], 0);
  }
  const dt = (1 / 60) / p.nsub, out = [];
  let T = 0;
  const NS = Math.round(seconds * 60);
  for (let fr = 0; fr < NS; fr++) {
    for (let s = 0; s < p.nsub; s++) {
      const hn = hB[s & 1];
      for (let i = 0; i < NX; i++) {
        const im = Math.max(0, i - 1), ip = Math.min(NX - 1, i + 1);
        const x = SX0 + i * SDX;
        for (let j = 0; j < nz; j++) {
          const jm = (j - 1 + nz) % nz, jp = (j + 1) % nz;
          const c = i * nz + j, L = im * nz + j, R = ip * nz + j, D = i * nz + jm, U = i * nz + jp;
          let uu = u[c], vv = v[c];
          uu -= G * dt * ((bed[R] + h[R]) - (bed[L] + h[L])) / (2 * SDX);
          vv -= G * dt * ((bed[U] + h[U]) - (bed[D] + h[D])) / (2 * SDX);
          const fr2 = 0.012 + p.fr * Math.exp(-Math.max(h[c], 0) / (p.h0 || 0.10));
          const fk = Math.max(0, 1 - fr2 * dt);
          uu *= fk; vv *= fk;
          const dLoc = Math.max(0.05, -bed[c]);
          const celer2 = Math.sqrt(G * Math.max(h[c], 0));
          const spd = Math.hypot(uu, vv);
          const cap = celer2 * (p.bore || 1);
          if (celer2 > 0.05 && spd > cap) { const k2 = cap / spd; uu *= k2; vv *= k2 }
          const uRf = 0.5 * (uu + u[R]), uLf = 0.5 * (uu + u[L]);
          const FxR = uRf * (uRf >= 0 ? h[c] : h[R]), FxL = uLf * (uLf >= 0 ? h[L] : h[c]);
          const vUf = 0.5 * (vv + v[U]), vDf = 0.5 * (vv + v[D]);
          const FzU = vUf * (vUf >= 0 ? h[c] : h[U]), FzD = vDf * (vDf >= 0 ? h[D] : h[c]);
          let hNew = h[c] - dt * ((FxR - FxL) / SDX + (FzU - FzD) / SDX);
          const lap = h[L] + h[R] + h[D] + h[U] - 4 * h[c];
          hNew += p.nu * Math.min(1, dt * 60) * lap;
          hNew += p.nz * Math.min(1, dt * 60) * (h[D] + h[U] - 2 * h[c]);
          if (hNew < 0) { hNew = 0; uu *= 0.5; vv *= 0.5 }
          if (x < SX0 + 18) {
            const k3 = smoothstep(SX0 + 18, SX0 + 1, x) * p.sponge * Math.min(1, dt * 60);
            const dA = Math.max(etaSwellD(x, zs[j], Math.max(0.05, -bed[c]), T) - bed[c], 0);
            hNew = hNew + (dA - hNew) * k3;
          }
          hn[c] = hNew;
          u[c] = uu; v[c] = vv;
        }
      }
      T += dt;
      hB[0].set(hn); const tmp = hB[0]; hB[0] = hB[1]; hB[1] = tmp; h.set(hB[1]);
    }
    if (fr % p.record === 0) {
      const runs = [];
      for (let j = 0; j < nz; j++) {
        let lastX = null;
        for (let i = 0; i < NX; i++) if (h[i * nz + j] > 0.02) lastX = SX0 + i * SDX;
        runs.push(lastX === null ? null : lastX - xsCurve(zs[j]));
      }
      const valid = runs.filter(r => r !== null);
      out.push({ t: T, run: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0, cols: runs });
    }
  }
  return out;
}

export function evalTrace(rec, { traceSec = 16, bigSec = 40, settle = 0 } = {}) {
  const tStart = settle || rec[0].t;
  const pts = rec.filter(s => s.t - tStart > 2 && s.t - tStart <= traceSec + 2);
  const runsRaw = pts.map(s => s.run), ts = pts.map(s => s.t);
  if (runsRaw.length < 12) return { oscillate: false };
  const sm1 = runsRaw.map((_, i) => { const w = runsRaw.slice(Math.max(0, i - 1), i + 2); return w.reduce((a, b) => a + b, 0) / w.length });
  const mn = Math.min(...sm1), mx = Math.max(...sm1);
  let peaks = 0;
  for (let i = 2; i < sm1.length - 2; i++) if (sm1[i] >= sm1[i - 1] && sm1[i] > sm1[i - 2] && sm1[i] >= sm1[i + 1] && sm1[i] > sm1[i + 2] && sm1[i] - mn > 0.35) peaks++;
  const sw = runsRaw.map((_, i) => { const w = runsRaw.slice(Math.max(0, i - 2), i + 3); return w.reduce((a, b) => a + b, 0) / w.length });
  const peakIdx = [];
  for (let q = 2; q < sw.length - 2; q++) if (sw[q] >= sw[q - 1] && sw[q] > sw[q - 2] && sw[q] >= sw[q + 1] && sw[q] > sw[q + 2]) peakIdx.push(q);
  let best = null;
  for (let k = 0; k < peakIdx.length; k++) {
    const q = peakIdx[k];
    const lo0 = k > 0 ? peakIdx[k - 1] : 0, hi0 = k < peakIdx.length - 1 ? peakIdx[k + 1] : sw.length - 1;
    let a = lo0, b = hi0;
    for (let i = lo0; i <= q; i++) if (sw[i] < sw[a]) a = i;
    for (let i = q; i <= hi0; i++) if (sw[i] < sw[b]) b = i;
    const rise = sw[q] - sw[a], fall = sw[q] - sw[b];
    if (rise < 0.2 || fall < 0.2) continue;
    const cand = { vUp: rise / Math.max(0.1, ts[q] - ts[a]), vDn: fall / Math.max(0.1, ts[b] - ts[q]) };
    if (!best || cand.vUp / cand.vDn > best.vUp / best.vDn) best = cand;
  }
  const oscillate = peaks >= 1 && mx - mn > 0.9;
  const asym = !!best && best.vUp > best.vDn * 1.15 && best.vUp > 0.03;
  let ema = pts[0].run, sawBig = false;
  for (const s of rec) {
    if (s.t - tStart < 2) continue;
    if (s.t - tStart > bigSec + 2) break;
    ema += (s.run - ema) * 0.02;
    if (s.t - tStart > 2 && s.run > ema + 0.3) sawBig = true;
  }
  let dzs = 0, cnt = 0;
  for (const s of rec) {
    if (s.t - tStart < 4) continue;
    let prev = null;
    for (const r of s.cols) { if (r === null) { prev = null; continue } if (prev !== null) { dzs += Math.abs(r - prev); cnt++ } prev = r }
  }
  const dz = cnt ? dzs / cnt : 99;
  return { oscillate, peaks, range: +(mx - mn).toFixed(2), asym, vUp: best && +best.vUp.toFixed(2), vDn: best && +best.vDn.toFixed(2), ratio: best && +(best.vUp / best.vDn).toFixed(2), sawBig, dz: +dz.toFixed(2), run: +(runsRaw.reduce((a, b) => a + b, 0) / runsRaw.length).toFixed(2) };
}

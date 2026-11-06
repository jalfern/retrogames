// comet-retighten — pull the spread fork/keyhole legs back toward the traced
// reference line now that the #542 world (x3) outgrew the #513 spread need.
// Batch attract every control point toward the reference embedded in the live
// bbox, backtracking whenever a load-bearing gate (min radius, wall
// self-crossing, road non-fusion) would break; then polish point-by-point.
// Emits the accepted deltas as TIGHTEN entries for track.js.
import { REFERENCES, normalize, resample } from '../src/games/CometDrift/reference.js'
import { COURSES, WALL_CEIL, KERB_R } from '../src/games/CometDrift/track.js'

const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t; const t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
const SEG = 26
function poly(control) {
    const pts = []; const n = control.length
    for (let i = 0; i < n; i++) {
        const p0 = control[(i - 1 + n) % n]; const p1 = control[i]; const p2 = control[(i + 1) % n]; const p3 = control[(i + 2) % n]
        for (let j = 0; j < SEG; j++) {
            const t = j / SEG
            pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) })
        }
    }
    const N = pts.length
    for (let i = 0; i < N; i++) {
        const p = pts[i]; const q = pts[(i + 1) % N]; const o = pts[(i - 1 + N) % N]
        p.a = Math.atan2(q.y - o.y, q.x - o.x); p.d = Math.hypot(q.x - p.x, q.y - p.y)
    }
    let s = 0
    for (let i = 0; i < N; i++) {
        const p = pts[i]; p.s = s; s += p.d
        let da = pts[(i + 1) % N].a - p.a
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da -= Math.PI * 2
        p.k = da / Math.max(1, p.d)
    }
    pts.len = s
    return pts
}
const ccw = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
const HALF = WALL_CEIL + 16
const MINSEP = 2 * KERB_R + 24
function scan(pts) {
    let mr = Infinity; let cross = 0; let sep = Infinity
    for (let i = 0; i < pts.length; i++) {
        const k = Math.abs(pts[i].k); if (k > 1e-9) { const r = 1 / k; if (r < mr) mr = r }
    }
    for (let i = 0; i < pts.length; i += 2) {
        const A = pts[i]
        for (let j = 0; j < pts.length; j += 2) {
            if (i === j) continue
            let arc = Math.abs(pts[j].s - A.s); arc = Math.min(arc, pts.len - arc)
            if (arc < 750) continue
            const d = Math.hypot(pts[j].x - A.x, pts[j].y - A.y)
            if (d < sep) sep = d
            if (d > HALF * 2 + 40) continue
            const ax = Math.cos(A.a + Math.PI / 2); const ay = Math.sin(A.a + Math.PI / 2)
            const bx = Math.cos(pts[j].a + Math.PI / 2); const by = Math.sin(pts[j].a + Math.PI / 2)
            const x1 = A.x - ax * HALF; const y1 = A.y - ay * HALF; const x2 = A.x + ax * HALF; const y2 = A.y + ay * HALF
            const x3 = pts[j].x - bx * HALF; const y3 = pts[j].y - by * HALF; const x4 = pts[j].x + bx * HALF; const y4 = pts[j].y + by * HALF
            if (ccw(x1, y1, x2, y2, x3, y3) * ccw(x1, y1, x2, y2, x4, y4) < 0 &&
                ccw(x3, y3, x4, y4, x1, y1) * ccw(x3, y3, x4, y4, x2, y2) < 0) cross++
        }
    }
    return { mr, cross, sep }
}
function worstAvg(pts, R240) {
    const G = resample(normalize(pts.map((p) => [p.x, p.y])), 240)
    const near = (p, Q) => { let d = Infinity; for (const q of Q) { const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < d) d = dd } return d }
    let worst = 0; let sum = 0
    for (const p of R240) { const d = near(p, G); if (d > worst) worst = d; sum += d }
    let worstG = 0
    for (const g of G) { const d = near(g, R240); if (d > worstG) worstG = d }
    return { worst: Math.max(worst, worstG), avg: sum / R240.length }
}
function refEmbed(pts, ref, n = 600) {
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
    const sc = Math.max(x1 - x0, y1 - y0) || 1
    return resample(ref, n).map(([x, y]) => [x0 + x * sc, y0 + y * sc])
}
const attract = (control, R, g) => control.map((q) => {
    let bx = q[0]; let by = q[1]; let bd = Infinity
    for (const [rx, ry] of R) { const d = Math.hypot(rx - q[0], ry - q[1]); if (d < bd) { bd = d; bx = rx; by = ry } }
    if (bd < 2) return [...q]
    return [q[0] + (bx - q[0]) * g, q[1] + (by - q[1]) * g]
})
const lerpC = (a, b, t) => a.map((q, i) => [q[0] + (b[i][0] - q[0]) * t, q[1] + (b[i][1] - q[1]) * t])
const J = (w) => w.worst + 10 * w.avg
const good = (s) => s.mr >= 97 && s.cross === 0 && s.sep >= MINSEP

for (const id of ['sandbank', 'corkscomb']) {
    const c = COURSES.find((x) => x.id === id)
    const ref = REFERENCES[id].pts
    const R240 = resample(normalize(ref), 240)
    let control = c.control.map((p) => [...p])
    let pts = poly(control)
    let met = worstAvg(pts, R240)
    if (!good(scan(pts))) throw new Error(`${id} base fails gates`)
    let best = control.map((p) => [...p]); let bestJ = J(met)
    let gain = 0.30
    // phase 1: batch attraction with backtracking
    for (let pass = 0; pass < 120; pass++) {
        if (gain < 0.004) break
        const R = refEmbed(pts, ref)
        const full = attract(control, R, gain)
        let t = 1
        let cp = poly(full); let cs = scan(cp)
        while (!good(cs) && t > 1 / 64) { t *= 0.5; cp = poly(lerpC(control, full, t)); cs = scan(cp) }
        if (!good(cs)) { gain *= 0.5; continue }
        const cm = worstAvg(cp, R240)
        if (J(cm) < J(met) - 1e-9) {
            control = lerpC(control, full, t); pts = cp; met = cm
            if (J(met) < bestJ) { bestJ = J(met); best = control.map((p) => [...p]) }
            if (t === 1) gain = Math.min(gain * 1.15, 0.4)
        } else {
            gain *= 0.55
        }
    }
    // phase 2: per-point polish (one control point at a time, probe gains)
    for (let sweep = 0; sweep < 10; sweep++) {
        let moved = false
        const R = refEmbed(poly(control), ref)
        for (let ci = 0; ci < control.length; ci++) {
            const q = control[ci]
            let bx = q[0]; let by = q[1]; let bd = Infinity
            for (const [rx, ry] of R) { const d = Math.hypot(rx - q[0], ry - q[1]); if (d < bd) { bd = d; bx = rx; by = ry } }
            if (bd < 2) continue
            for (const g of [0.35, 0.18, 0.09]) {
                const cand = control.map((o, oi) => oi === ci ? [o[0] + (bx - o[0]) * g, o[1] + (by - o[1]) * g] : o)
                const cp = poly(cand)
                if (!good(scan(cp))) continue
                const cm = worstAvg(cp, R240)
                if (J(cm) < J(met) - 1e-9) {
                    control = cand; met = cm; moved = true
                    if (J(met) < bestJ) { bestJ = J(met); best = control.map((p) => [...p]) }
                    break
                }
            }
        }
        if (!moved) break
    }
    const fin = poly(best)
    const fm = worstAvg(fin, R240)
    const fs = scan(fin)
    const res = []
    for (let ci = 0; ci < best.length; ci++) {
        const dx = Math.round(best[ci][0] - c.control[ci][0]); const dy = Math.round(best[ci][1] - c.control[ci][1])
        if (dx || dy) res.push(`[${ci},${dx},${dy}]`)
    }
    console.log(`${id}: worst ${(worstAvg(poly(c.control), R240).worst * 100).toFixed(1)}% -> ${(fm.worst * 100).toFixed(1)}% | avg ${(worstAvg(poly(c.control), R240).avg * 100).toFixed(2)}% -> ${(fm.avg * 100).toFixed(2)}% | minR ${fs.mr.toFixed(0)} sep ${fs.sep.toFixed(0)}`)
    console.log(`  TIGHTEN+ ${id}: [${res.join(', ')}]`)
}

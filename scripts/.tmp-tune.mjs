import { REFERENCES } from '../src/games/CometDrift/reference.js'

const SEG = 26
const S = 2160; const P = 200
const ROAD_R = 80; const WALL_R = 132
const HALF = WALL_R + 16

function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t; const t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
function buildPoints(control) {
    const pts = []
    const n = control.length
    for (let i = 0; i < n; i++) {
        const p0 = control[(i - 1 + n) % n]; const p1 = control[i]
        const p2 = control[(i + 1) % n]; const p3 = control[(i + 2) % n]
        for (let j = 0; j < SEG; j++) {
            const t = j / SEG
            pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) })
        }
    }
    let s = 0
    const N = pts.length
    for (let i = 0; i < N; i++) {
        const p = pts[i]; const q = pts[(i + 1) % N]; const o = pts[(i - 1 + N) % N]
        p.i = i
        p.a = Math.atan2(q.y - o.y, q.x - o.x)
        p.d = Math.hypot(q.x - p.x, q.y - p.y)
    }
    for (let i = 0; i < N; i++) {
        const p = pts[i]
        p.s = s
        s += p.d
        let da = pts[(i + 1) % N].a - p.a
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da += Math.PI * 2
        p.k = da / Math.max(1, p.d)
    }
    return { pts, len: s, N }
}
const ccw = (px, py, qx, qy, rx, ry) => (rx - px) * (qy - py) - (qx - px) * (ry - py)
function crossings(pts, N, len) {
    let c = 0
    for (let i = 0; i < N; i += 2) {
        for (let j = 0; j < N; j += 2) {
            if (i === j) continue
            let arc = Math.abs(pts[j].s - pts[i].s)
            arc = Math.min(arc, len - arc)
            if (arc < 750) continue
            const A = pts[i]; const B = pts[j]
            if (Math.hypot(A.x - B.x, A.y - B.y) > HALF * 2 + 40) continue
            const ax = Math.cos(A.a + Math.PI / 2); const ay = Math.sin(A.a + Math.PI / 2)
            const bx = Math.cos(B.a + Math.PI / 2); const by = Math.sin(B.a + Math.PI / 2)
            const x1 = A.x - ax * HALF; const y1 = A.y - ay * HALF; const x2 = A.x + ax * HALF; const y2 = A.y + ay * HALF
            const x3 = B.x - bx * HALF; const y3 = B.y - by * HALF; const x4 = B.x + bx * HALF; const y4 = B.y + by * HALF
            if (ccw(x1, y1, x2, y2, x3, y3) * ccw(x1, y1, x2, y2, x4, y4) < 0 &&
                ccw(x3, y3, x4, y4, x1, y1) * ccw(x3, y3, x4, y4, x2, y2) < 0) c++
        }
    }
    return c
}
function normalize(pts) {
    let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const sc = Math.max(x1 - x0, y1 - y0) || 1
    return pts.map(([x, y]) => [(x - x0) / sc, (y - y0) / sc])
}
function resample(pts, n) {
    const m = pts.length; const seg = []; let total = 0
    for (let i = 0; i < m; i++) { const a = pts[i]; const b = pts[(i + 1) % m]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(d); total += d }
    const out = []
    for (let k = 0; k < n; k++) {
        let target = (total * k) / n; let i = 0
        while (target > seg[i] && i < m - 1) { target -= seg[i]; i++ }
        const a = pts[i]; const b = pts[(i + 1) % m]; const f = seg[i] ? target / seg[i] : 0
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    }
    return out
}
function shapeDistance(a, b) {
    const A = resample(normalize(a), 180); const B = resample(normalize(b), 180)
    const near = (p, Q) => { let d = 1e9; for (const q of Q) { const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < d) d = dd } return d }
    let s = 0
    for (const p of A) s += near(p, B)
    for (const p of B) s += near(p, A)
    return s / (A.length + B.length)
}
function shoelace(ctrl) {
    let a2 = 0
    for (let i = 0; i < ctrl.length; i++) {
        const a = ctrl[i]; const b = ctrl[(i + 1) % ctrl.length]
        a2 += a[0] * b[1] - b[0] * a[1]
    }
    return a2 / 2
}
// shoelace sign of the existing CCW gulch (y-down world)
const GULCH = [
    [1250, 1795], [1450, 1765], [1640, 1650], [1790, 1490], [1840, 1290], [1810, 1080],
    [1700, 860], [1500, 680], [1250, 570], [980, 520], [730, 560], [560, 720],
    [505, 930], [540, 1150], [600, 1360], [700, 1540], [850, 1680], [1010, 1760],
]
console.log('gulch shoelace', shoelace(GULCH).toFixed(0))

function mapRef(ref, wantCCW) {
    let pts = ref.pts.map(([x, y]) => [P + x * S, P + y * S])
    if ((shoelace(pts) > 0) !== (shoelace(GULCH) > 0)) pts = pts.reverse()
    // rotate so index 0 is closest to bottom-centre (start/finish on the straight)
    let bi = 0; let bd = 1e9
    const tx = S / 2 + P; const ty = P + S * 0.98
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; bi = i } })
    pts = pts.slice(bi).concat(pts.slice(0, bi))
    return pts
}

function report(name, ctrl, ref) {
    const { pts, len, N } = buildPoints(ctrl)
    const world = pts.map((p) => [p.x, p.y])
    let minR = Infinity
    for (const p of pts) { const k = Math.abs(p.k); if (k > 1e-9 && 1 / k < minR) minR = 1 / k }
    const cr = crossings(pts, N, len)
    const d = Math.min(shapeDistance(world, ref.pts), shapeDistance(world, ref.pts.map(([x, y]) => [1 - x, y])))
    // long gentle sweeper availability
    let bb = 0; let cur = 0
    for (const p of pts) { const k = Math.abs(p.k); if (k > 1 / 1100 && k < 1 / 240) { cur++; if (cur > bb) bb = cur } else cur = 0 }
    console.log(`${name}: shape ${(d * 100).toFixed(2)}%  minR ${minR.toFixed(0)}  crossings ${cr}  sweeperRun ${bb}  len ${len.toFixed(0)}`)
    return { d, minR, cr, bb }
}

const SB = mapRef(REFERENCES.sandbank, true)
const CK = mapRef(REFERENCES.corkscomb, true)

function worstPair(pts, N, len) {
    let worst = null
    for (let i = 0; i < N; i += 2) {
        for (let j = i + 2; j < N; j += 2) {
            let arc = Math.abs(pts[j].s - pts[i].s)
            arc = Math.min(arc, len - arc)
            if (arc < 750) continue
            const A = pts[i]; const B = pts[j]
            const d = Math.hypot(A.x - B.x, A.y - B.y)
            if (d < HALF * 2 + 40 && (!worst || d < worst.d)) worst = { d, i, j }
        }
    }
    return worst
}

function tune(name, ctrl0, ref) {
    const n = ctrl0.length
    let ctrl = ctrl0.map((p) => [...p])
    let lastRep = 0
    for (let it = 0; it < 2500; it++) {
        const { pts, len, N } = buildPoints(ctrl)
        const wp = worstPair(pts, N, len)
        let minR = Infinity; let wi = -1
        pts.forEach((p, i) => { const k = Math.abs(p.k); if (k > 1e-9 && 1 / k < minR) { minR = 1 / k; wi = i } })
        if (wp && wp.d < HALF * 2 + 40 && minR >= 61) {
            const A = pts[wp.i]; const B = pts[wp.j]
            const dx = (A.x - B.x) / (wp.d || 1); const dy = (A.y - B.y) / (wp.d || 1)
            const need = ((HALF * 2 + 40) - wp.d) / 2 + 3
            const ci = Math.round(wp.i / SEG) % n; const cj = Math.round(wp.j / SEG) % n
            ctrl[ci] = [ctrl[ci][0] + dx * need, ctrl[ci][1] + dy * need]
            ctrl[cj] = [ctrl[cj][0] - dx * need, ctrl[cj][1] - dy * need]
            continue
        }
        if (minR >= 61 && !wp) { report(`${name} FINAL it${it}`, ctrl, ref); return ctrl }
        if (minR < 61) {
            const c = Math.round(wi / SEG) % n
            for (const cc of [(c - 1 + n) % n, c, (c + 1) % n]) {
                const a = ctrl[(cc - 1 + n) % n]; const b = ctrl[(cc + 1) % n]
                ctrl[cc] = [ctrl[cc][0] * 0.5 + (a[0] + b[0]) * 0.25, ctrl[cc][1] * 0.5 + (a[1] + b[1]) * 0.25]
            }
        }
        if (it - lastRep > 250) { lastRep = it; report(`${name} it${it}`, ctrl, ref) }
    }
    report(`${name} FINAL`, ctrl, ref)
    return ctrl
}

const sb = tune('sandbank', SB, REFERENCES.sandbank)
const ck = tune('corkscomb', CK, REFERENCES.corkscomb)
console.log(JSON.stringify(sb.map((p) => p.map((v) => Math.round(v)))))
console.log(JSON.stringify(ck.map((p) => p.map((v) => Math.round(v)))))

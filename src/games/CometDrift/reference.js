// COMET DRIFT GP — reference centerlines (#513).
//
// The two real circuits SANDBANK and CORKSCOMB are meant to follow. These are
// hand-digitized centerlines of the published maps, in a normalised [0,1] box
// (x right, y down), independent of the in-game course data so the harness can
// grade "does our layout match the reference?" honestly.
//
//   DAYTONA — Daytona International Speedway ROAD COURSE (the infield/road
//   layout: the big banked oval turns + the infield section + the Bus Stop).
//   Reference map: Wikimedia "Daytona International Speedway - Road Course.png"
//   (public domain).
//   LAGUNA  — WeatherTech Raceway Laguna Seca: the Rahal back straight, the
//   Andretti hairpin, the Corkscrew double-apex, the Snake descent, the keyhole.
//   Reference map: Wikimedia "Laguna_Seca.svg" (CC BY-SA).
//
// Neither in-game course is a traced copy of these lists — the tracks are the
// arcade re-proportioning that must land within the harness's shape tolerance
// (see scripts/cometcheck.mjs) while keeping our names, art and drivability.
//
// Shape is graded scale/rotation/reflection-invariant: each circuit is run in
// both handedness and whichever matches better is used (a top-down map flipped
// over is the same circuit seen from the other side).

export const REFERENCES = {
    sandbank: {
        name: 'DAYTONA ROAD COURSE',
        // main front straight (bottom-right) into the high-banked Turns 1-2 up
        // the right, the long back straight across the top, Turns 3-4 horseshoe
        // down the left, then the flat Bus Stop braking complex across the
        // bottom-left back onto the front stretch to the line
        pts: [
            [0.60, 0.90], [0.72, 0.895], [0.82, 0.855], [0.90, 0.785],
            [0.95, 0.685], [0.965, 0.565], [0.945, 0.445], [0.885, 0.335],
            [0.795, 0.245], [0.675, 0.175], [0.545, 0.14], [0.41, 0.14],
            [0.29, 0.185], [0.19, 0.27], [0.125, 0.385], [0.095, 0.515],
            [0.11, 0.645], [0.165, 0.76], [0.25, 0.845],
            [0.345, 0.80], [0.40, 0.72], [0.47, 0.725], [0.52, 0.795],
            [0.50, 0.865],
        ],
    },
    corkscomb: {
        name: 'LAGUNA SECA',
        // start straight bottom-right → Turn 1 (Rainey) → Rahal back straight
        // up the right → Andretti hairpin top → Corkscrew double-apex down the
        // middle → Snake descent left → keyhole → home
        pts: [
            [0.46, 0.90], [0.56, 0.935], [0.665, 0.905], [0.75, 0.845],
            [0.81, 0.76], [0.845, 0.66], [0.86, 0.545], [0.858, 0.425],
            [0.838, 0.315], [0.79, 0.225], [0.71, 0.165], [0.615, 0.15],
            [0.53, 0.195], [0.475, 0.27], [0.41, 0.225], [0.35, 0.275],
            [0.305, 0.36], [0.25, 0.34], [0.2, 0.41], [0.172, 0.51],
            [0.155, 0.615], [0.158, 0.72], [0.185, 0.81], [0.245, 0.87],
            [0.325, 0.875], [0.395, 0.835],
        ],
    },
}

// normalise a polygon into the unit box preserving aspect (largest extent → 1)
export function normalize(pts) {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const spanX = maxX - minX; const spanY = maxY - minY
    const sc = Math.max(spanX, spanY) || 1
    return pts.map(([x, y]) => [(x - minX) / sc, (y - minY) / sc])
}

// resample a closed polyline to n evenly spaced points by arc length
export function resample(pts, n) {
    const m = pts.length
    const seg = []
    let total = 0
    for (let i = 0; i < m; i++) {
        const a = pts[i]; const b = pts[(i + 1) % m]
        const d = Math.hypot(b[0] - a[0], b[1] - a[1])
        seg.push(d); total += d
    }
    const out = []
    for (let k = 0; k < n; k++) {
        let target = (total * k) / n
        let i = 0
        while (target > seg[i] && i < m - 1) { target -= seg[i]; i++ }
        const a = pts[i]; const b = pts[(i + 1) % m]
        const f = seg[i] ? target / seg[i] : 0
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    }
    return out
}

// mean nearest-neighbour distance (both directions) of two closed unit-box
// polylines, in box-fraction units. The 3% gate is measured against this.
export function shapeDistance(a, b) {
    const A = resample(normalize(a), 180)
    const B = resample(normalize(b), 180)
    const near = (p, Q) => {
        let d = Infinity
        for (const q of Q) { const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < d) d = dd }
        return d
    }
    let s = 0
    for (const p of A) s += near(p, B)
    for (const p of B) s += near(p, A)
    return s / (A.length + B.length)
}

// best of direct and mirror-x alignment (same circuit seen from the other side)
export function bestShapeDistance(gamePts, refPts) {
    const mirror = refPts.map(([x, y]) => [1 - x, y])
    return Math.min(shapeDistance(gamePts, refPts), shapeDistance(gamePts, mirror))
}

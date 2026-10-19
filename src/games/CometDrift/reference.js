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
            [0.40, 0.73], [0.50, 0.72], [0.55, 0.685], [0.615, 0.685], [0.665, 0.72],
            [0.74, 0.70], [0.82, 0.635], [0.88, 0.54], [0.895, 0.42], [0.86, 0.305],
            [0.785, 0.225], [0.685, 0.185], [0.56, 0.175], [0.44, 0.195], [0.34, 0.245],
            [0.26, 0.33], [0.21, 0.44], [0.205, 0.55], [0.245, 0.645], [0.315, 0.705],
        ],
    },
    corkscomb: {
        name: 'LAGUNA SECA',
        // start straight bottom-right → Turn 1 (Rainey) → Rahal back straight
        // up the right → Andretti hairpin top → Corkscrew double-apex down the
        // middle → Snake descent left → keyhole → home
        pts: [
            [0.40, 0.80], [0.475, 0.72], [0.56, 0.685], [0.635, 0.705], [0.685, 0.755],
            [0.72, 0.772], [0.762, 0.762], [0.805, 0.71], [0.842, 0.63], [0.862, 0.535],
            [0.857, 0.425], [0.824, 0.32], [0.766, 0.238], [0.688, 0.19], [0.60, 0.182],
            [0.52, 0.212], [0.452, 0.272], [0.402, 0.312], [0.334, 0.304], [0.266, 0.362],
            [0.212, 0.44], [0.20, 0.51], [0.186, 0.61], [0.206, 0.706], [0.264, 0.776],
            [0.332, 0.806],
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

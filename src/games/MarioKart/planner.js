// SUPER MARIO KART — the autopilot. Same input contract as the player,
// same pure sim under it: scripts/kartcheck.mjs proves THIS wins the
// whole 5-lap GP from last place, and the attract demo in index.jsx is
// this exact brain driving the exact same machine, tick for tick.
// It steers with a speed-scaled look-ahead, brakes off the curvature
// ahead, clips the apex, and spends items like a rude neighbour:
// shell at whoever is in front, banana at the entrance of a corner,
// mushroom the instant it lands.

import { TRACK } from './track.js'

const T = TRACK
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

export function decide(g) {
    const k = g.karts[0]
    const inp = { u: true, d: false, l: false, r: false, drift: false, item: false }
    if (g.phase !== 'race' || k.finished) { inp.u = false; return inp }

    const look = 3 + Math.round(k.v * 2.4)
    const t = T.pts[(k.idx + look) % T.N]
    const kmax = T.aheadK((k.idx + look) % T.N, look + 8)
    let lat = -Math.sign(t.k) * Math.min(85, Math.abs(t.k) * 7.2e4)
    // traffic: if a rival sits on the chosen line just ahead, shift the line
    // to the open side — start last, pass everyone, that is the whole race
    for (const o of g.karts) {
        if (o === k) continue
        const dx = o.x - k.x; const dy = o.y - k.y
        const ahead = dx * Math.cos(k.a) + dy * Math.sin(k.a)
        if (ahead > 20 && ahead < 320) {
            const side = dx * -Math.sin(k.a) + dy * Math.cos(k.a)
            if (Math.abs(side - lat) < 70) lat = side >= 0 ? lat - 105 : lat + 105
        }
    }
    // peels on the line: see them, step around them — the harness proves
    // the whole race is still winnable with every cap in place
    for (const b of g.bananas) {
        const dx = b.x - k.x; const dy = b.y - k.y
        const ahead = dx * Math.cos(k.a) + dy * Math.sin(k.a)
        if (ahead > 15 && ahead < 300) {
            const side = dx * -Math.sin(k.a) + dy * Math.cos(k.a)
            if (Math.abs(side - lat) < 60) lat = side >= 0 ? lat - 110 : lat + 110
        }
    }
    lat = Math.max(-130, Math.min(130, lat))
    const tx = t.x + Math.cos(t.a + Math.PI / 2) * lat
    const ty = t.y + Math.sin(t.a + Math.PI / 2) * lat
    const da = wrap(Math.atan2(ty - k.y, tx - k.x) - k.a)
    if (da < -0.015) inp.l = true
    if (da > 0.015) inp.r = true

    const vmax = Math.min(9.2, 0.0465 / Math.max(kmax, 8e-4))
    if (k.v > vmax * 1.25) { inp.d = true; inp.u = false }
    else if (k.v > vmax) inp.u = false

    if (Math.abs(da) > 0.19 && k.v > 5.2) inp.drift = true

    if (k.item) {
        if (k.item === 'mushroom') inp.item = true
        else if (k.item === 'shell') {
            for (const o of g.karts) {
                if (o === k || o.finished) continue
                const dd = Math.hypot(o.x - k.x, o.y - k.y)
                if (dd < 1200 && Math.abs(wrap(Math.atan2(o.y - k.y, o.x - k.x) - k.a)) < 0.35) { inp.item = true; break }
            }
        } else if (k.item === 'banana' && kmax > 0.0022) inp.item = true
    }
    return inp
}

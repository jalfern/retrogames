// HOMEBODY — all look, generated in code (no assets).
//
// The Sims (PC, 2000) seen from above: warm suburban greens, wood floors and
// striped wallpaper, chunky readable furniture, little people with a spinning
// mood gem over their heads, and a blue-bar needs panel on the right. Textures
// (grass grain, plank seams, wallpaper stripes) are baked once into offscreen
// layers at module load — pure drawing, nothing here touches the sim.

import {
    W, H, TILE, COLS, ROWS, LOT_Y, PANEL_X, MAP, relLevel,
    tileX, tileY, CATALOG, DEF, NEEDS, WIN_CONTENT, RED_AT, wingGeom,   // #2689: wing geometry for the bake, the ghost and the glow
    CAT_TABS, tabCards,   // #2222: the catalog's category shelves
    SPEED_MULT,   // #2227: the speed dial
    petMood, PET_FEED_T,   // #2200: Miso's mood row + the lingering bowl
    YARN_PLAY_T,   // #2256: the yarn session's stage time
    GIFT_LAND_T,   // #2240: the set-down basket's stage time
    ICE_HOLD_T, ICE_DRIPS,   // #2508 item 3: the eat beat — how long the cone rides in hand, and its drip ticks
    nightLevel,   // #2264: one night curve for the tint, the steam and the plate halo
    NEIGH_WARM_AT,   // #2599: cross-warmth — the rung that deepens each neighbour's chat
    goSayTarget,   // #2688: the promised ear — the view derives the errand the same way the sim resolves it
    TEND_HOURS, wingSets,   // #2705: the purpose view reads the sun-law's own constant and the room's own floor
    archetypeOf, PAGES_INSIGHT, PLAYS_DELIGHT,   // #2736: rooms with a personality — the badge asks the room's own furniture · #2743: and how far the next pay is
    GARDEN, EXT_ROOM,   // #2721: the room card prices the NEXT kit, and the jar rides beside it
    JAR_CAP,   // #2729: the panel's jar row reads the fund's own cap
} from './sim.js'

// #2599 item 1: the pair's own hues — Fern-green and Ivy-plum, the two guests'
// dress colours, so a line between THEM reads as theirs at a glance.
export const PAIR_HUES = ['#4fae5f', '#a3579b']

// #2688 feel pass — the GO-SAY promise told in motion (#2683's tails 2 & 6).
// Pure view math on the errand the sim already runs: the ring tightens as the
// walker nears, gold dots walk the remaining route, and the ear the word is
// addressed to knows it's coming once the errand is EAR_REACT tiles away.
// Nothing here decides anything — sim.js never hears of these words.
export const EAR_REACT = 4          // tiles — the target wakes to the approach at this range
export const PROMISE_TIGHTEN = 8    // tiles — the ring starts closing this far out
export const LOST_RING_T = 1.3      // real seconds the dead ring flickers before it's gone

// one hue per promised ear: the guests wear their dress colours (PAIR_HUES),
// Pip wears her star gold — the same identities the BONDS panel paints.
export const EAR_HUES = { fern: PAIR_HUES[0], ivy: PAIR_HUES[1], kid: '#ffd24a' }

export function promiseTell(s) {
    const p = s.people && s.people.find((q) => q.goal && q.goal.kind === 'gosay')
    if (!p) return null
    const v = goSayTarget(s, p.goal.k)
    if (!v) return null
    const d = Math.abs(p.r - v.r) + Math.abs(p.c - v.c)
    const tight = Math.max(0, Math.min(1, 1 - d / PROMISE_TIGHTEN))
    const trail = (p.path || []).map((cell, i, a) => ({ r: cell.r, c: cell.c, k: a.length > 1 ? i / (a.length - 1) : 1 }))
    return { d, tight, trail, hue: EAR_HUES[p.goal.k] || '#ffd24a', vx: v.x, vy: v.y }
}

// the ear knows (#2688 tail 6): the target answers the approach with a hue wink.
export function earReact(s) {
    const t = promiseTell(s)
    if (!t || t.d > EAR_REACT) return null
    return { x: t.vx, y: t.vy, hue: t.hue }
}

// #2618 item 1: the stroll stride — the pair's walk sell. Both guests mid-path
// is a pair WALKING TOGETHER, not two sprites translating: the bob deepens past
// the solo walk's 1.6 and each turns toward the other mid-route (chatting while
// strolling, like the original's conversation ambles). Pure view math: it reads
// only the two guests' paths, decides nothing, and answers null outside a lap.
export const STRIDE_BOB = 2.2
export function pairStride(a, b) {
    if (!a || !b || !a.path || !a.path.length || !b.path || !b.path.length) return null
    return { aFace: b.x >= a.x ? 1 : -1, bFace: a.x >= b.x ? 1 : -1 }
}

// #2618 item 3: the route tell — the fire tick names the road before feet hit
// it. The first steps of the lead's path, as pixel centres; the painter rides
// the fire tick and fades them on the real clock. Draw-only.
export function strollTrail(path, n = 3) {
    if (!path || !path.length) return []
    return path.slice(0, n).map((c) => ({ x: tileX(c.c) + TILE / 2, y: tileY(c.r) + TILE / 2 }))
}

// #2618 item 3: the tell that paints the trail — small teal dots on the first
// cells of the route, shrinking and fading as the lap walks them off. The pair's
// teal, alternating with the light leaf of #2599's sparkles. k = time remaining.
export function drawStrollTrail(ctx, dots, k) {
    if (!dots || !dots.length || k <= 0) return
    ctx.globalAlpha = Math.min(1, k)
    dots.forEach((d, i) => {
        const s = 2.4 - i * 0.5
        ctx.fillStyle = i % 2 ? '#7fd0c0' : '#3aa08a'
        ctx.beginPath(); ctx.arc(d.x, d.y, s, 0, 7); ctx.fill()
    })
    ctx.globalAlpha = 1
}

const P = {
    grass: '#69a23f', grass2: '#5d9236', grass3: '#77b04a',
    path: '#c9b48a', path2: '#bda87e',
    floor: '#c89a62', floor2: '#bd8d55', floorSeam: '#9a6f3f',
    wall: '#7c5030', wallTop: '#96653f', wallLine: '#5f3c22',
    paper: '#e8d9ae', paperStripe: '#d9c18c',
    ink: '#3c2a17', ink2: '#5d4426',
    barBg: '#2a3448', barBlue: '#3f7fd1', barGreen: '#57b45c', barRed: '#e23b2e', barAmber: '#e8a13a',
    panel: '#1c2436', panelEdge: '#41527a',
    sky: '#a8d4ee',
}

// deterministic texture rng (decoration only)
let _s = 0x5eed80d1
const rnd = () => { _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0; return _s / 4294967296 }

let groundLayer = null
export function groundCanvas() {
    if (groundLayer) return groundLayer
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const ch = MAP[r][c]
            const x = tileX(c), y = tileY(r)
            if (ch === '.') {
                g.fillStyle = P.grass; g.fillRect(x, y, TILE, TILE)
                for (let i = 0; i < 7; i++) {
                    g.fillStyle = rnd() < 0.5 ? P.grass2 : P.grass3
                    g.fillRect(x + Math.floor(rnd() * TILE), y + Math.floor(rnd() * TILE), 2, 1)
                }
            } else if (ch === 'p') {
                g.fillStyle = P.path; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.path2
                for (let i = 0; i < 4; i++) g.fillRect(x + 2 + (i % 2) * 14, y + 4 + Math.floor(i / 2) * 14, 12, 10)
            } else if (ch === 'F' || ch === 'D') {
                g.fillStyle = P.floor; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.floorSeam
                g.fillRect(x, y, TILE, 1)
                g.fillRect(x + (r % 2 ? 10 : 22), y, 1, TILE)
                for (let i = 0; i < 3; i++) if (rnd() < 0.5) g.fillRect(x + Math.floor(rnd() * TILE), y + 8 + Math.floor(rnd() * 20), 3, 1)
            } else {
                // wall: brick-ish band with lighter cap
                g.fillStyle = P.wall; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.wallTop; g.fillRect(x, y, TILE, 8)
                g.fillStyle = P.wallLine
                g.fillRect(x, y + 8, TILE, 1)
                g.fillRect(x + (r % 2 ? 8 : 20), y + 8, 1, TILE - 8)
                g.fillRect(x, y + 20, TILE, 1)
            }
        }
    }
    // wallpaper strip just inside the house north edge
    for (let c = 2; c <= 10; c++) {
        const x = tileX(c)
        g.fillStyle = P.paper; g.fillRect(x, tileY(1) + TILE - 8, TILE, 8)
        g.fillStyle = P.paperStripe
        for (let i = 0; i < 4; i++) g.fillRect(x + 3 + i * 8, tileY(1) + TILE - 8, 2, 8)
    }
    groundLayer = cv
    return cv
}

export function drawGround(ctx, s) {
    ctx.drawImage(groundCanvas(), 0, 0)
    if (s && s.ext) for (const w of s.wings) ctx.drawImage(wingCanvas(wingGeom(w)), 0, 0)   // #2689: every wing in its build order
}

// -------------------------------------------------------- spare room bake ----
// The #1806 expansion overlay: the same plank/brick styles the main ground bake
// uses, painted at the wing cells, so the new wing looks native — plus a
// swung-open door in the shared wall, two east-wall windows and a
// wallpaper strip along the new north wall. Static geometry, baked once per
// wing site (#2689: anchors and the garden cottage share one bake, cached by
// id+row so a chosen row costs one bake).
const wingLayers = new Map()
function wingCanvas(geom) {
    const key = `${geom.id}:${geom.r0 ?? -1}`
    let cv = wingLayers.get(key)
    if (cv) return cv
    cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    const bakeWall = (x, y, r) => {
        g.fillStyle = P.wall; g.fillRect(x, y, TILE, TILE)
        g.fillStyle = P.wallTop; g.fillRect(x, y, TILE, 8)
        g.fillStyle = P.wallLine
        g.fillRect(x, y + 8, TILE, 1)
        g.fillRect(x + (r % 2 ? 8 : 20), y + 8, 1, TILE - 8)
        g.fillRect(x, y + 20, TILE, 1)
    }
    const bakeFloor = (x, y, r) => {
        g.fillStyle = P.floor; g.fillRect(x, y, TILE, TILE)
        g.fillStyle = P.floorSeam
        g.fillRect(x, y, TILE, 1)
        g.fillRect(x + (r % 2 ? 10 : 22), y, 1, TILE)
    }
    for (const [r, c] of geom.walls) bakeWall(tileX(c), tileY(r), r)
    for (const [r, c] of geom.floor) bakeFloor(tileX(c), tileY(r), r)
    // doorway in the shared wall: planked threshold, slab swung into the room
    {
        const [dr, dc] = geom.door
        const x = tileX(dc), y = tileY(dr)
        bakeFloor(x, y, dr)
        g.fillStyle = P.wallLine; g.fillRect(x, y, 1, TILE); g.fillRect(x + TILE - 1, y, 1, TILE)
        g.fillStyle = '#7a4a28'; g.fillRect(x + 22, y + 3, 4, 26)
        g.fillStyle = '#5f3c22'; g.fillRect(x + 22, y + 3, 4, 1); g.fillRect(x + 22, y + 28, 4, 1)
        g.fillStyle = '#ffd24a'; g.fillRect(x + 23, y + 7, 2, 2)
    }
    // windows in the east wall (from the wing's own windows — the single source
    // the night-lit pass lights up after dusk)
    for (const [r, c] of geom.windows) {
        const x = tileX(c), y = tileY(r)
        bakeWall(x, y, r)
        g.fillStyle = '#5f3c22'; g.fillRect(x + 4, y + 8, 20, 14)
        g.fillStyle = '#a8d4ee'; g.fillRect(x + 6, y + 10, 16, 10)
        g.fillStyle = '#5f3c22'
        g.fillRect(x + 13, y + 10, 2, 10); g.fillRect(x + 6, y + 14, 16, 2)
        g.fillStyle = '#96653f'; g.fillRect(x + 3, y + 22, 22, 2)
        g.fillStyle = 'rgba(255,240,170,0.35)'; g.fillRect(x + 7, y + 11, 5, 2)
    }
    if (geom.id === 'east') {
        // wallpaper strip along the room's north wall, matching the house's own
        for (const c of [12, 13, 14]) {
            const x = tileX(c)
            g.fillStyle = P.paper; g.fillRect(x, tileY(geom.r0) + TILE - 8, TILE, 8)
            g.fillStyle = P.paperStripe
            for (let i = 0; i < 4; i++) g.fillRect(x + 3 + i * 8, tileY(geom.r0) + TILE - 8, 2, 8)
        }
    } else {
        // #2689 the garden cottage: a potting bench along the north wall — clay
        // pots and a green row, so the room reads garden the moment it stands
        for (const c of [0, 1, 3]) {
            const x = tileX(c), y = tileY(9)
            g.fillStyle = '#96653f'; g.fillRect(x + 2, y + 4, TILE - 4, 8)
            g.fillStyle = '#7a4a28'; g.fillRect(x + 2, y + 12, TILE - 4, 2)
            g.fillStyle = '#5d8a3c'; g.fillRect(x + 6, y - 2, 6, 6); g.fillRect(x + 18, y, 5, 4)
            g.fillStyle = '#c96a3c'; g.fillRect(x + 5, y + 4, 8, 4)
        }
        // #2704 tail 6: the room arrives lived-in — a produce crate and a
        // watering can by the bench's south end, so the garden looks WORKED
        // the day it stands, not furnished-that-nobody-uses. Draw-only, like
        // the bench: it blocks nothing and the hash never hears of it.
        {
            const x = tileX(0), y = tileY(10)
            g.fillStyle = '#8a6134'; g.fillRect(x + 5, y + 7, 12, 10)          // crate
            g.fillStyle = '#a8794a'; g.fillRect(x + 5, y + 7, 12, 2); g.fillRect(x + 5, y + 12, 12, 1)
            g.fillStyle = '#5d8a3c'; g.fillRect(x + 7, y + 5, 4, 3); g.fillRect(x + 12, y + 4, 3, 4)   // greens peeking over the rim
            const x2 = tileX(1)
            g.fillStyle = '#4a7a8c'; g.fillRect(x2 + 6, y + 9, 9, 7)            // watering can
            g.fillStyle = '#4a7a8c'; g.fillRect(x2 + 2, y + 7, 5, 2)            // spout
            g.fillStyle = '#38606f'; g.fillRect(x2 + 8, y + 6, 5, 1.6)          // handle
        }
    }
    wingLayers.set(key, cv)
    return cv
}

// ---------------------------------------------------------------- gate ------
export function drawGate(ctx, _t) {
    const x = tileX(5), y = tileY(12)
    ctx.fillStyle = '#8a6134'; ctx.fillRect(x + 4, y + 4, 6, 24); ctx.fillRect(x + 22, y + 4, 6, 24)
    ctx.fillStyle = '#a8794a'; ctx.fillRect(x + 4, y + 8, 24, 4); ctx.fillRect(x + 4, y + 18, 24, 4)
    ctx.fillStyle = '#d8c79a'
    ctx.beginPath(); ctx.arc(x + 24, y + 14, 1.6, 0, 7); ctx.fill()
}

// ------------------------------------------------------------ furniture ----
export function drawItemAt(ctx, id, x, y, t, night = 0) {
    switch (id) {
        case 'petkit': {
            // adoption card: drafting paper, a cat silhouette in gold
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#ffd24a'
            // ears + head
            ctx.beginPath(); ctx.moveTo(x + 11, y + 10); ctx.lineTo(x + 13, y + 6); ctx.lineTo(x + 15, y + 10); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(x + 17, y + 10); ctx.lineTo(x + 19, y + 6); ctx.lineTo(x + 21, y + 10); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(x + 16, y + 14, 5, 0, Math.PI * 2); ctx.fill()
            // body + curled tail
            ctx.beginPath(); ctx.ellipse(x + 16, y + 23, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 24, y + 22, 3, -Math.PI / 2, Math.PI); ctx.stroke()
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
        case 'kidkit': {
            // adoption card: drafting paper, a small figure in gold with a star
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#ffd24a'
            ctx.beginPath(); ctx.arc(x + 16, y + 11, 3.6, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.moveTo(x + 12, y + 15); ctx.lineTo(x + 20, y + 15); ctx.lineTo(x + 18.5, y + 24); ctx.lineTo(x + 13.5, y + 24); ctx.closePath(); ctx.fill()
            ctx.fillRect(x + 9, y + 16, 2.6, 6); ctx.fillRect(x + 20.4, y + 16, 2.6, 6)
            star(ctx, x + 24, y + 10, 3.2, '#ffd24a')
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
        case 'roomkit': {
            // blueprint card: brick Cottage with gold roof on drafting paper
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#96653f'; ctx.fillRect(x + 8, y + 14, 16, 11)
            ctx.fillStyle = '#c9873f'
            ctx.beginPath(); ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 4, y + 14); ctx.lineTo(x + 28, y + 14); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 14, y + 18, 5, 7)
            ctx.fillStyle = '#a8d4ee'; ctx.fillRect(x + 9, y + 16, 4, 4)
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
        case 'bed': {
            ctx.fillStyle = '#7a4a28'; ctx.fillRect(x + 2, y + 2, 28, 28)
            ctx.fillStyle = '#d8e6f0'; ctx.fillRect(x + 5, y + 5, 22, 8)
            ctx.fillStyle = '#4f7fc4'; ctx.fillRect(x + 5, y + 13, 22, 16)
            ctx.fillStyle = '#5d8fd6'; ctx.fillRect(x + 5, y + 13, 22, 3)
            ctx.fillStyle = '#3c5f92'; ctx.fillRect(x + 5, y + 24, 22, 2)
            break
        }
        case 'canopy': {
            // #2272: four walnut posts, gold finials, a wine canopy with a
            // scalloped hem, rose quilt — reads bedroom at a glance.
            ctx.fillStyle = '#4a2f1b'
            ctx.fillRect(x + 2, y + 1, 3, 29); ctx.fillRect(x + 27, y + 1, 3, 29)
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 2, y, 3, 2); ctx.fillRect(x + 27, y, 3, 2)
            ctx.fillStyle = '#7e3b5e'; ctx.fillRect(x + 2, y + 1, 28, 6)
            ctx.fillStyle = '#9c4a74'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3 + i * 7, y + 7, 5, 2)
            ctx.fillStyle = '#efe4d0'; ctx.fillRect(x + 5, y + 12, 22, 8)
            ctx.fillStyle = '#fff7e6'; ctx.fillRect(x + 7, y + 13, 8, 5)
            ctx.fillStyle = '#a34a68'; ctx.fillRect(x + 5, y + 19, 22, 10)
            ctx.fillStyle = '#c25e80'; ctx.fillRect(x + 5, y + 19, 22, 2)
            ctx.fillStyle = '#7e3350'; ctx.fillRect(x + 5, y + 26, 22, 1)
            break
        }
        case 'fridge': {
            ctx.fillStyle = '#e8eef2'; ctx.fillRect(x + 6, y + 3, 20, 26)
            ctx.fillStyle = '#c2cdd6'; ctx.fillRect(x + 6, y + 12, 20, 2)
            ctx.fillStyle = '#8a99a8'; ctx.fillRect(x + 20, y + 6, 2, 5); ctx.fillRect(x + 20, y + 16, 2, 5)
            break
        }
        case 'stove': {
            ctx.fillStyle = '#c9cdd4'; ctx.fillRect(x + 5, y + 5, 22, 22)
            ctx.fillStyle = '#5c626c'
            ctx.beginPath(); ctx.arc(x + 11, y + 11, 3.4, 0, 7); ctx.fill()
            ctx.beginPath(); ctx.arc(x + 21, y + 11, 3.4, 0, 7); ctx.fill()
            ctx.fillStyle = '#8f96a2'; ctx.fillRect(x + 8, y + 19, 16, 6)
            if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x + 10, y + 20, 3, 3) }
            break
        }
        case 'toilet': {
            ctx.fillStyle = '#f0f4f7'; ctx.fillRect(x + 9, y + 4, 14, 10)
            ctx.beginPath(); ctx.ellipse(x + 16, y + 20, 8, 8, 0, 0, 7); ctx.fillStyle = '#f0f4f7'; ctx.fill()
            ctx.fillStyle = '#c2cdd6'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 20, 5, 5, 0, 0, 7); ctx.fill()
            break
        }
        case 'tv': {
            ctx.fillStyle = '#4c3a26'; ctx.fillRect(x + 3, y + 6, 26, 20)
            const flick = Math.floor(t * 6) % 3
            ctx.fillStyle = ['#3f6ad1', '#57a0d8', '#7fc6e8'][flick]
            ctx.fillRect(x + 6, y + 9, 20, 12)
            ctx.fillStyle = '#d8ecf8'; ctx.fillRect(x + 8 + flick * 5, y + 11, 4, 3)
            ctx.fillStyle = '#2c2115'; ctx.fillRect(x + 12, y + 26, 8, 3)
            break
        }
        case 'radio': {
            ctx.fillStyle = '#8a5a30'; ctx.fillRect(x + 6, y + 8, 20, 16)
            ctx.fillStyle = '#5f3c22'; ctx.fillRect(x + 9, y + 11, 8, 10)
            for (let i = 0; i < 3; i++) { ctx.fillStyle = '#d8c79a'; ctx.fillRect(x + 19, y + 12 + i * 4, 4, 2) }
            const w = Math.floor(t * 8) % 3
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 19, y + 12 + w * 4, 4, 2)
            break
        }
        case 'phone': {
            ctx.fillStyle = '#d8606a'; ctx.fillRect(x + 9, y + 6, 14, 14)
            ctx.fillStyle = '#b04048'; ctx.fillRect(x + 11, y + 16, 10, 4)
            ctx.strokeStyle = '#5f3c22'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 16, y + 20); ctx.quadraticCurveTo(x + 22, y + 24, x + 20, y + 28); ctx.stroke()
            break
        }
        case 'shower': {
            ctx.fillStyle = '#cfe3ee'; ctx.fillRect(x + 4, y + 4, 24, 24)
            ctx.fillStyle = '#a8c8dc'; ctx.fillRect(x + 4, y + 4, 24, 3)
            ctx.fillStyle = '#7fb2cc'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 7 + i * 5, y + 9, 2, 6 + (i % 2) * 3)
            break
        }
        case 'sofa': {
            ctx.fillStyle = '#8c4f6f'; ctx.fillRect(x + 3, y + 4, 26, 24)
            ctx.fillStyle = '#a8628a'; ctx.fillRect(x + 6, y + 8, 20, 14)
            ctx.fillStyle = '#7a3f5e'; ctx.fillRect(x + 3, y + 4, 26, 5)
            ctx.fillStyle = '#c47aa6'; ctx.fillRect(x + 8, y + 11, 6, 8); ctx.fillRect(x + 18, y + 11, 6, 8)
            break
        }
        case 'plant': {
            ctx.fillStyle = '#a05c36'; ctx.fillRect(x + 11, y + 19, 10, 9)
            ctx.fillStyle = '#3f7d38'
            for (let i = 0; i < 5; i++) {
                const a = -1.57 + (i - 2) * 0.5 + Math.sin(t * 1.2 + i) * 0.04
                ctx.beginPath()
                ctx.ellipse(x + 16 + Math.cos(a) * 7, y + 14 + Math.sin(a) * 7, 5, 2.6, a, 0, 7)
                ctx.fill()
            }
            ctx.fillStyle = '#57a04a'
            ctx.beginPath(); ctx.arc(x + 16, y + 12, 4, 0, 7); ctx.fill()
            break
        }
        case 'rug': {
            ctx.fillStyle = '#7d4f8c'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 13, 10, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#9a6cab'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 9, 6.6, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#c49ad4'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 4.4, 3, 0, 0, 7); ctx.fill()
            break
        }
        case 'lamp': {
            ctx.fillStyle = '#5d4426'; ctx.fillRect(x + 15, y + 10, 3, 18)
            ctx.fillStyle = '#d8c79a'; ctx.fillRect(x + 10, y + 4, 12, 8)
            ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + 12, y + 8, 8, 3)
            break
        }
        case 'mail': {
            ctx.fillStyle = '#5d4426'; ctx.fillRect(x + 14, y + 12, 4, 16)
            ctx.fillStyle = '#3f7fd1'; ctx.fillRect(x + 8, y + 4, 16, 11)
            ctx.fillStyle = '#2c5aa0'; ctx.fillRect(x + 8, y + 4, 16, 3)
            ctx.fillStyle = '#e8eef2'; ctx.fillRect(x + 21, y + 7, 2, 4)
            break
        }
        case 'paper': {
            // #2238: two sheets tossed on the gravel — cream newsprint, dark
            // masthead, grey text rows, folded twice.
            ctx.fillStyle = '#e2dbc6'; ctx.fillRect(x + 6, y + 11, 22, 5)
            ctx.fillStyle = '#efe9d8'; ctx.fillRect(x + 4, y + 13, 24, 13)
            ctx.fillStyle = '#4a4034'; ctx.fillRect(x + 7, y + 15, 18, 3)
            ctx.fillStyle = '#8d8571'
            ctx.fillRect(x + 7, y + 20, 8, 1); ctx.fillRect(x + 17, y + 20, 8, 1)
            ctx.fillRect(x + 7, y + 22, 6, 1); ctx.fillRect(x + 15, y + 22, 10, 1)
            ctx.fillStyle = '#d9d2bc'; ctx.fillRect(x + 4, y + 18, 24, 1)
            break
        }
        case 'meal': {
            // #2244: a home plate set on the floor — cream dish, a hot mound
            // (gold crust, green greens, a red tomato), and three steam curls
            // that rise, drift and dissolve on the clock.
            // #2264: the steam keeps night hours like the wing-glow law — the
            // night palette dims it and drags its rise; and a warm plate on a
            // dark lot breathes a faint halo so supper at dusk still reads WARM.
            const k = 1 - night / 0.42 * 0.72
            if (night > 0.12) {
                ctx.fillStyle = `rgba(255,200,120,${(night * 0.34).toFixed(3)})`
                ctx.beginPath(); ctx.ellipse(x + 16, y + 21, 15, 8, 0, 0, 7); ctx.fill()
            }
            ctx.fillStyle = '#efe9d8'; ctx.beginPath(); ctx.ellipse(x + 16, y + 23, 11, 5.5, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#d9d2bc'; ctx.beginPath(); ctx.ellipse(x + 16, y + 22, 8, 3.8, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#e0a23c'; ctx.beginPath(); ctx.arc(x + 14, y + 20, 3.6, 0, 7); ctx.fill()
            ctx.fillStyle = '#7fb24a'; ctx.beginPath(); ctx.arc(x + 19.5, y + 21, 2.8, 0, 7); ctx.fill()
            ctx.fillStyle = '#c94f43'; ctx.beginPath(); ctx.arc(x + 16.5, y + 18, 1.9, 0, 7); ctx.fill()
            ctx.lineWidth = 1.4
            for (let i = 0; i < 3; i++) {
                const ph = t * 1.4 * k + i * 1.9
                const rise = ph % 1
                ctx.strokeStyle = `rgba(239,233,216,${(0.7 * (1 - rise) * k).toFixed(3)})`
                ctx.beginPath()
                ctx.moveTo(x + 12 + i * 4, y + 15 - rise * 9)
                ctx.quadraticCurveTo(x + 13.5 + i * 4, y + 11 - rise * 9, x + 11.5 + i * 4 + Math.sin(ph * 2) * 2, y + 7 - rise * 9)
                ctx.stroke()
            }
            break
        }
        case 'bin': {
            // #2303: the lot's wheelie bin — deep green body, darker lid with a
            // raised lip, two wheels and a hint of ribs. Full and honest: it is
            // the same bin at the gate and at the curb; the law moves it, not
            // the paint (the cell it stands on rides the hash).
            ctx.fillStyle = '#2f5e3a'
            ctx.fillRect(x + 8, y + 8, 16, 17)
            ctx.fillStyle = '#26492f'
            ctx.fillRect(x + 8, y + 5, 16, 4)          // lid
            ctx.fillRect(x + 10, y + 4, 12, 2)          // lid lip
            ctx.fillStyle = '#3d7a4b'
            ctx.fillRect(x + 10, y + 10, 12, 2)         // rib
            ctx.fillRect(x + 10, y + 18, 12, 2)         // rib
            ctx.fillStyle = '#1d1f24'
            ctx.fillRect(x + 10, y + 25, 4, 3)          // wheels
            ctx.fillRect(x + 18, y + 25, 4, 3)
            ctx.fillStyle = '#57472f'
            ctx.fillRect(x + 6, y + 8, 2, 8)            // handle side
            break
        }
        case 'yarn': {
            // #2256: the cat's ball — a coral wound ball with crossing wraps,
            // a loose thread trailing on the boards, and a shadow of its own.
            ctx.fillStyle = '#c94f6d'
            ctx.beginPath(); ctx.arc(x + 16, y + 23, 6, 0, 7); ctx.fill()
            ctx.strokeStyle = '#e07a92'; ctx.lineWidth = 1.4
            ctx.beginPath(); ctx.arc(x + 15, y + 22, 4.2, 0.4, 2.6); ctx.stroke()
            ctx.beginPath(); ctx.arc(x + 17.5, y + 24.5, 3.4, 3.2, 5.6); ctx.stroke()
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x + 21, y + 26)
            ctx.quadraticCurveTo(x + 26, y + 27, x + 27, y + 24 + Math.sin(t * 2) * 1.2)
            ctx.stroke()
            ctx.fillStyle = 'rgba(30,20,10,0.16)'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 30, 7, 2, 0, 0, 7); ctx.fill()
            break
        }
        case 'cone': {
            // #2503: the soft-serve standing at the curb — a waffle cone with
            // crosshatch, pastel twin swirls and a cherry gleaming on top.
            // It keeps a shadow of its own (decor skips the generic one).
            ctx.fillStyle = '#b07a3f'
            ctx.beginPath(); ctx.moveTo(x + 11, y + 16); ctx.lineTo(x + 21, y + 16); ctx.lineTo(x + 16, y + 28); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = '#8a5c2a'; ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x + 12.4, y + 19); ctx.lineTo(x + 19.6, y + 19)
            ctx.moveTo(x + 13.4, y + 22); ctx.lineTo(x + 18.6, y + 22)
            ctx.moveTo(x + 14.4, y + 25); ctx.lineTo(x + 17.6, y + 25)
            ctx.stroke()
            ctx.fillStyle = '#ffe9f0'
            ctx.beginPath(); ctx.arc(x + 16, y + 13.5, 5.4, 0, 7); ctx.fill()
            ctx.fillStyle = '#ffc9dd'
            ctx.beginPath(); ctx.arc(x + 16, y + 9.5, 4.2, 0, 7); ctx.fill()
            ctx.fillStyle = '#c94f43'
            ctx.beginPath(); ctx.arc(x + 16, y + 5.4, 2.1, 0, 7); ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.fillRect(x + 15, y + 4.4, 1, 1)          // the cherry's gleam
            ctx.fillStyle = 'rgba(30,20,10,0.16)'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 29.5, 6.5, 2, 0, 0, 7); ctx.fill()
            break
        }
        case 'alarm': {
            // #2520: the tin on the shelf — dome siren, a blinking LED, a whip
            // antenna. At night its red gains a halo: the lot watches back.
            ctx.fillStyle = '#6d6f78'
            ctx.fillRect(x + 9, y + 18, 14, 8)
            ctx.fillStyle = '#4d4f57'
            ctx.fillRect(x + 9, y + 24, 14, 2)
            ctx.fillStyle = '#c0392b'
            ctx.beginPath(); ctx.arc(x + 16, y + 18, 3.6, Math.PI, 0); ctx.fill()      // the dome
            const pulse = 0.5 + 0.5 * Math.sin(t * 4)
            ctx.fillStyle = `rgba(255,72,55,${(0.35 + 0.65 * pulse).toFixed(3)})`
            ctx.beginPath(); ctx.arc(x + 12.6, y + 21.4, 1.6, 0, 7); ctx.fill()        // the LED
            if (night > 0) {
                ctx.fillStyle = `rgba(255,72,55,${((0.08 + 0.14 * pulse) * night).toFixed(3)})`
                ctx.beginPath(); ctx.arc(x + 12.6, y + 21.4, 5 + pulse * 3, 0, 7); ctx.fill()
            }
            ctx.strokeStyle = '#9a9ca6'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 22, y + 18); ctx.lineTo(x + 26, y + 10 + Math.sin(t * 3) * 0.6); ctx.stroke()   // whip antenna, alive in the wind
            ctx.fillStyle = '#d8dade'
            ctx.beginPath(); ctx.arc(x + 26, y + 9.2, 1.2, 0, 7); ctx.fill()
            ctx.fillStyle = 'rgba(30,20,10,0.16)'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 27.5, 7.5, 2, 0, 0, 7); ctx.fill()   // decor keeps its own shadow
            break
        }
        default: break
    }
    // soft ground shadow under solids
    if (!DEF[id]?.decor) {
        ctx.fillStyle = 'rgba(30,20,10,0.18)'
        ctx.beginPath(); ctx.ellipse(x + 16, y + 30, 12, 3, 0, 0, 7); ctx.fill()
    }
}

export function drawItem(ctx, it, t, night = 0) {
    drawItemAt(ctx, it.id, tileX(it.c), tileY(it.r), t, night)
    // #2256: the session staging — while playT runs the ball rolls in place,
    // the loose thread whipping; fades on the last second like the bowl does.
    if (it.id === 'yarn' && it.playT > 0) {
        const x = tileX(it.c), y = tileY(it.r)
        const k = Math.min(1, it.playT)
        ctx.save()
        ctx.globalAlpha = 0.85 * k
        ctx.translate(x + 16, y + 23)
        ctx.rotate(Math.sin(t * 9) * 0.5)
        ctx.strokeStyle = '#e07a92'; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0.8, 2.9); ctx.stroke()
        ctx.restore()
        ctx.save()
        ctx.globalAlpha = 0.9 * k
        ctx.fillStyle = '#ffd24a'
        for (const [px, py] of [[-9, -6], [8, -9], [0, -12]]) {
            ctx.fillRect(x + 16 + px + Math.sin(t * 5 + px) * 2, y + 23 + py - (1 - k) * 6, 2, 2)
        }
        ctx.restore()
    }
}

// --------------------------------------------------------------- people ----
// #2076: the quarrel and the cold war now stage themselves ON the residents.
// fx 'spat' — a storm puff with a gold bolt rides over the head and the body
// shakes itself away from its partner; fx 'cold' — a lasting sullen lean the
// other way, eyes averted, while the grudge holds. `lean` is the direction to
// recoil (−1 left, +1 right), computed by the caller from the partner's side.
// #2240: THE SET-DOWN. A gift basket Ivy carried in now sits on the ground
// where it landed — woven pixels in the carried-basket palette (#2143), one
// soft hop and squash at the moment it drops, greens + tomato over the rim,
// and at FAMILY a small amber honey jar with a gold lid beside it. Fades on
// the last 0.8 s of giftFx. Painted on the people's depth line.
export function drawGroundGift(ctx, g) {
    const at = g.giftAt
    if (!at) return
    const k = Math.max(0, Math.min(1, g.giftFx / GIFT_LAND_T))
    const u = 1 - k
    const bounce = u < 0.32 ? Math.abs(Math.sin((u / 0.32) * Math.PI)) * 6 * (1 - u / 0.32) : 0
    const squash = u < 0.16 ? 1 - 0.22 * Math.sin((u / 0.16) * Math.PI) : 1
    const x = Math.round(at.x), y = Math.round(at.y - bounce)
    ctx.globalAlpha = Math.min(1, g.giftFx / 0.8)
    ctx.fillStyle = 'rgba(30,20,10,0.22)'
    ctx.beginPath(); ctx.ellipse(at.x, at.y + 9, 8, 2.6, 0, 0, 7); ctx.fill()
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + (1 - squash) * 0.8, squash)
    ctx.fillStyle = '#c9995c'
    ctx.fillRect(-7, 0, 14, 8)
    ctx.fillStyle = '#8a6238'
    ctx.fillRect(-7, 0, 14, 1); ctx.fillRect(-7, 4, 14, 1); ctx.fillRect(-1, 0, 1, 8)
    ctx.fillStyle = '#4fae5f'
    ctx.fillRect(-6, -4, 4, 4); ctx.fillRect(2, -3, 4, 3)
    ctx.fillStyle = '#d1483f'
    ctx.beginPath(); ctx.arc(0.5, -2, 2, 0, 7); ctx.fill()
    ctx.restore()
    if (g.giftHoney) {
        const hx = x + 11, hy = y + 2
        ctx.fillStyle = '#e8a13a'; ctx.fillRect(hx - 3, hy - 5, 6, 7)
        ctx.fillStyle = '#c9821f'; ctx.fillRect(hx - 3, hy + 1, 6, 1)
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(hx - 3.5, hy - 7, 7, 2)
        ctx.fillStyle = 'rgba(255,233,168,0.8)'; ctx.fillRect(hx - 2, hy - 4, 1, 3)
    }
    ctx.globalAlpha = 1
}

export function drawPerson(ctx, p, t, active, fx = null, lean = 0, stride = null) {
    // #2618 item 1: stride while strolling together (deepens the solo walk's 1.6);
    // arriving, the pair settles facing each other on the same view flag.
    const bob = stride ? Math.sin(p.walkPhase) * STRIDE_BOB : p.path && p.path.length ? Math.sin(p.walkPhase) * 1.6 : Math.sin(t * 2 + p.x) * 0.6
    const x = Math.round(p.x), y = Math.round(p.y)
    const fainted = p.faintT > 0
    // shadow
    ctx.fillStyle = 'rgba(30,20,10,0.22)'
    ctx.beginPath(); ctx.ellipse(x, y + 11, 7, 2.4, 0, 0, 7); ctx.fill()
    if (fainted) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2)
        body(ctx, p, t, 0)
        ctx.restore()
        // dizzy stars
        for (let i = 0; i < 3; i++) {
            const a = t * 3 + i * 2.1
            star(ctx, x + Math.cos(a) * 10, y - 10 + Math.sin(a) * 3, 2.4, '#ffd24a')
        }
        return
    }
    const leanA = fx === 'spat' ? lean * 0.14 + Math.sin(t * 22 + p.x) * 0.035 : fx === 'cold' ? lean * 0.07 : 0
    if (leanA) { ctx.save(); ctx.translate(x, y + 11); ctx.rotate(leanA); ctx.translate(-x, -(y + 11)) }
    body(ctx, p, t, bob, fx, lean, stride)
    if (leanA) ctx.restore()
    // #2143: Ivy of FRIENDS+ arrives with the market basket — woven pixels,
    // greens and a tomato on top; it swings on the walk, rests when she hangs.
    if (p.gift) {
        const bx = x + 8, fy = y + 4
        const swing = p.path && p.path.length ? Math.sin(p.walkPhase * 2) * 0.12 : 0
        ctx.save(); ctx.translate(bx, fy); ctx.rotate(swing)
        ctx.fillStyle = '#c9995c'
        ctx.fillRect(-5, 0, 10, 6)
        ctx.fillStyle = '#8a6238'
        ctx.fillRect(-5, 0, 10, 1)
        ctx.fillRect(-5, 3, 10, 1)
        ctx.fillRect(-1, 0, 1, 6)
        ctx.fillStyle = '#4fae5f'
        ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(1, -2, 3, 2)
        ctx.fillStyle = '#d1483f'
        ctx.beginPath(); ctx.arc(0.5, -1.5, 1.6, 0, 7); ctx.fill()
        ctx.restore()
    }
    // #2508 item 3: the eat beat — the cone bought at the curb rides home in
    // the hand, pastel and dripping, until the world-clock countdown licks it
    // away (view-only staging, the p.gift doctrine at treat scale).
    if (p.coneHold > 0) drawHeldCone(ctx, x + 8, y - 2 + bob * 0.5, p.coneHold, t)
    // #2520: the sneak — a snap-brim fedora pulled low over the eyes; on a
    // dark-coat silhouette the lot learns him at a glance (drawn over the
    // hair the body painter laid, so the brim sits where a hat sits).
    if (p.sneak) {
        const hy = y - 15 + (p.path && p.path.length ? Math.sin(p.walkPhase) * 1.6 : Math.sin(t * 2 + p.x) * 0.6)
        ctx.fillStyle = '#221b2c'
        ctx.beginPath(); ctx.ellipse(x, hy + 2.6, 8.4, 2.1, 0, 0, 7); ctx.fill()   // the brim
        ctx.fillRect(x - 4.4, hy - 3.6, 8.8, 6.2)                                     // the crown
        ctx.fillStyle = '#5a4a6e'
        ctx.fillRect(x - 4.4, hy - 0.4, 8.8, 1.5)                                     // the band
        ctx.fillStyle = 'rgba(10,8,14,0.55)'
        ctx.fillRect(x - 5.4, hy + 4.6, 10.8, 2.4)                                    // the shadow the brim casts
    }
    // #2076: the spat tell — a little storm cloud throwing a bolt over this head
    if (fx === 'spat') {
        const cy = y - 34 + Math.sin(t * 3 + p.x) * 1
        ctx.fillStyle = '#66707f'
        ctx.beginPath()
        ctx.arc(x - 4, cy + 0.5, 4.2, 0, 7); ctx.arc(x + 2, cy - 1.5, 3.6, 0, 7); ctx.arc(x + 6, cy + 1, 3, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#3c2a17'
        ctx.fillRect(x - 6, cy + 3.4, 12, 1)
        ctx.fillStyle = '#ffd24a'
        ctx.beginPath()
        ctx.moveTo(x + 2, cy + 4); ctx.lineTo(x - 1, cy + 9); ctx.lineTo(x + 1.5, cy + 9); ctx.lineTo(x - 0.5, cy + 13.5)
        ctx.lineTo(x + 4.5, cy + 7.5); ctx.lineTo(x + 2, cy + 7.5)
        ctx.closePath(); ctx.fill()
    }
    // mood gem — a spinning kite above the head (ours, not theirs)
    const m = p.mood > 0.7 ? 2 : p.mood > 0.4 ? 1 : 0
    const col = ['#e23b2e', '#e8a13a', '#4ec24f'][m]
    const gx = x, gy = y - 22 + Math.sin(t * 2.4 + p.y) * 1.4
    const sw = 3.4 + Math.abs(Math.sin(t * 2.2)) * 2.6
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(gx, gy - 5.4); ctx.lineTo(gx + sw, gy); ctx.lineTo(gx, gy + 5.4); ctx.lineTo(gx - sw, gy)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(gx - 1, gy - 3, 1.6, 3)
    // alarm pulse: a need just crossed red — ripple the gem
    if (p.alarmT > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 18)
        ctx.strokeStyle = `rgba(255,90,70,${((0.4 + 0.5 * pulse) * Math.min(1, p.alarmT)).toFixed(3)})`
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(gx, gy, 7 + pulse * 2.5, 0, 7); ctx.stroke()
    }
    // working tie peek / interaction ring
    if (p.use) {
        const frac = Math.min(1, p.use.t / (p.use.def.sleep ? 20 : p.use.dur))
        ctx.strokeStyle = active ? '#ffd24a' : '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(x, y + 14, 9, -1.57, -1.57 + frac * 6.283); ctx.stroke()
        if (p.use.def.sleep) {
            ctx.fillStyle = '#cfe0f2'
            ctx.font = 'bold 9px monospace'
            ctx.fillText('z', x + 8 + (Math.floor(t * 2) % 2) * 2, y - 14 - (Math.floor(t * 2) % 2) * 2)
        }
    }
    if (active) {
        ctx.strokeStyle = 'rgba(255,210,74,0.9)'; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.ellipse(x, y + 11, 9, 3.4, 0, 0, 7); ctx.stroke()
    }
}

function body(ctx, p, t, bob, fx = null, lean = 0, stride = null) {
    const x = Math.round(p.x), y = Math.round(p.y)
    const leg = p.path && p.path.length ? Math.sin(p.walkPhase * 2) * 3 : 0
    // legs
    ctx.fillStyle = '#3c2a17'
    ctx.fillRect(x - 4, y + 2 + Math.max(0, leg), 3, 9 - Math.max(0, leg))
    ctx.fillRect(x + 1, y + 2 + Math.max(0, -leg), 3, 9 - Math.max(0, -leg))
    // torso
    ctx.fillStyle = p.hue
    ctx.fillRect(x - 5, y - 6 + bob, 10, 10)
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fillRect(x - 5, y + 1 + bob, 10, 2)
    // arms — fx 'wave' (#2599 item 2): the meet-up greeting — the host's arm
    // goes up and pumps, a hand on top; everyone else keeps arms at rest.
    ctx.fillStyle = p.hue
    ctx.fillRect(x - 7, y - 5 + bob - leg * 0.5, 2, 7)
    if (fx === 'wave') {
        const pump = Math.sin(t * 14) > 0 ? 0 : 2
        ctx.fillRect(x + 5, y - 9 + bob - pump, 2, 5)
        ctx.fillStyle = '#e8c29a'
        ctx.fillRect(x + 5, y - 11 + bob - pump, 2, 2)
    } else ctx.fillRect(x + 5, y - 5 + bob + leg * 0.5, 2, 7)
    // head
    ctx.fillStyle = '#e8c29a'
    ctx.beginPath(); ctx.arc(x, y - 11 + bob, 5.4, 0, 7); ctx.fill()
    // hair
    ctx.fillStyle = p.name === 'Fern' ? '#2f7d3a' : p.name === 'Mira' ? '#7a4a28' : p.name === 'Ivy' ? '#5d3b63' : '#3c2a17'
    ctx.beginPath(); ctx.arc(x, y - 12.4 + bob, 5.4, Math.PI, 0); ctx.fill()
    // eyes — on a cold war they turn away from the partner (#2076); on a stroll
    // they turn TOWARD it (#2618 item 1) — mid-route the pair talks faces.
    ctx.fillStyle = '#241a10'
    const ex = (stride ? stride.face * 1.4 : p.face >= 0 ? 1.4 : -1.4) + (fx === 'cold' ? lean * 1.1 : 0)
    ctx.fillRect(x - 2 + ex, y - 12 + bob, 1.4, 1.6)
    ctx.fillRect(x + 1 + ex, y - 12 + bob, 1.4, 1.6)
    // #2076: mid-spat the brows knife down toward the partner
    if (fx === 'spat') {
        ctx.fillStyle = '#5a2018'
        ctx.fillRect(x - 3 + ex, y - 14.4 + bob, 3, 1)
        ctx.fillRect(x + 1 + ex, y - 13.8 + bob, 3, 1)
    }
}

function star(ctx, x, y, r, col) {
    ctx.fillStyle = col
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
        const a = -1.57 + i * 2.513
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
        ctx.lineTo(x + Math.cos(a + 0.626) * r * 0.45, y + Math.sin(a + 0.626) * r * 0.45)
    }
    ctx.closePath(); ctx.fill()
}

// ----------------------------------------------------------------- night ---
// --------------------------------------------------------------- pet (#2197) --
// Miso — a tabby loaf with a life of her own: stripe-backed walk with a
// swaying tail, a sleeping comma with rising Zzz, and pink purr sparks while
// someone coos at her. One sprite for every state; flip by facing.
export function drawPet(ctx, p, t, prowl) {
    const x = p.x, y = p.y
    ctx.save(); ctx.translate(x, y); ctx.scale(p.face, 1)
    if (p.asleep) {
        // the loaf: a low mound, ears pricked, tail curling around the front
        ctx.fillStyle = '#d98e4a'
        ctx.beginPath(); ctx.ellipse(0, -5, 11, 6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(-8, -9, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#b56f31'
        ctx.beginPath(); ctx.moveTo(-11, -12); ctx.lineTo(-9.5, -15.5); ctx.lineTo(-8, -12); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(-6, -12.5); ctx.lineTo(-4.5, -15.5); ctx.lineTo(-3, -12); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = '#8a5626'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(9, -4, 3.5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke()
        ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(-10.5, -9); ctx.lineTo(-8, -9); ctx.stroke()   // closed eye
        ctx.fillStyle = '#b56f31'
        ctx.fillRect(-2, -8, 3, 1.5); ctx.fillRect(3, -7, 3, 1.5)                    // stripes
    } else {
        const step = Math.sin(p.walkPhase * 2) * 1.5
        const moving = p.path && p.path.length
        const playing = p.playT > 0
        // #2256 sprite states: the bat (front paws alternating while a session
        // stages), the sit (settled on the boards after a while without a path)
        // and the dawn stretch (forelegs down, rump high). View-only timers —
        // none of it rides the hash.
        const stretching = p.stretchT > 0
        const sitting = !moving && !playing && !stretching && p.sitT > 1.2
        if (sitting) {
            // upright sit: chest tall, tail curled over the toes
            ctx.fillStyle = '#d98e4a'
            ctx.beginPath(); ctx.ellipse(0, -8, 6, 7, 0, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(1, -17, 4.2, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#b56f31'
            ctx.beginPath(); ctx.moveTo(-2, -19.5); ctx.lineTo(-1, -23); ctx.lineTo(0.5, -19.8); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(2.5, -19.8); ctx.lineTo(3.5, -23); ctx.lineTo(4.5, -19.5); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = '#d98e4a'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(5, -3); ctx.quadraticCurveTo(9, -1, 6, 1); ctx.stroke()
            ctx.fillStyle = '#241305'
            ctx.fillRect(2, -18, 1.5, 1.5)
            ctx.fillStyle = '#b56f31'
            ctx.fillRect(-3, -11, 3, 1.5); ctx.fillRect(-2, -7, 3, 1.5)
        } else {
        // legs: two-pixel pistons while the path runs
        ctx.fillStyle = '#8a5626'
        const l1 = moving ? Math.round(step) : 0, l2 = moving ? -l1 : 0
        ctx.fillRect(-6, -4, 2, 4 + l1); ctx.fillRect(-1, -4, 2, 4 + l2)
        ctx.fillRect(4, -4, 2, 4 + l2)
        if (stretching) {
            // forelegs flat forward, rump up — the whole-hallway stretch
            ctx.fillStyle = '#d98e4a'
            ctx.beginPath(); ctx.ellipse(-2, -10, 9, 4, -0.35, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(7, -6.5, 4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#8a5626'
            ctx.fillRect(8, -4, 2, 4); ctx.fillRect(11, -3, 3, 3)
        } else {
            // body + head
            ctx.fillStyle = '#d98e4a'
            ctx.beginPath(); ctx.ellipse(0, -8, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(8, -11, 4, 0, Math.PI * 2); ctx.fill()
            if (playing) {
                // bat: one forepaw mid-swipe, head low over the ball
                ctx.fillStyle = '#8a5626'
                const sw = Math.sin(p.playT * 13) > 0 ? 1 : -1
                ctx.fillRect(10, -9 + sw * 2, 4, 2)
                ctx.fillStyle = '#d98e4a'
                ctx.beginPath(); ctx.arc(9, -9.5, 3.4, 0, Math.PI * 2); ctx.fill()
            }
        }
        // ears
        ctx.fillStyle = '#b56f31'
        ctx.beginPath(); ctx.moveTo(5.5, -13.5); ctx.lineTo(6.5, -17); ctx.lineTo(8, -13.8); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(9, -13.8); ctx.lineTo(10.5, -17); ctx.lineTo(11.5, -13.5); ctx.closePath(); ctx.fill()
        // tail: a sine wave off the back
        ctx.strokeStyle = '#d98e4a'; ctx.lineWidth = 2
        const sway = Math.sin(t * 3 + p.walkPhase) * 2.5
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-13, -12 + sway, -12, -17 + sway); ctx.stroke()
        // stripes + eye
        ctx.fillStyle = '#b56f31'
        ctx.fillRect(-3, -11, 3, 1.5); ctx.fillRect(1, -11.5, 3, 1.5)
        ctx.fillStyle = '#241305'
        ctx.fillRect(9, -12, 1.5, 1.5)
        }
    }
    ctx.restore()
    if (p.purrT > 0) {
        // pink sparks lifting off the head on the real clock
        const k = p.purrT / 1.4
        ctx.globalAlpha = Math.min(1, p.purrT)
        ctx.fillStyle = '#ff9fc4'
        for (const [px, py] of [[-5, 0], [0, -2], [5, 0]]) ctx.fillRect(x + px - 1, y - 20 - (1 - k) * 8 + py, 2, 2)
        ctx.globalAlpha = 1
    }
    if (p.feedT > 0) {
        // #2200: the kibble moment — a shallow bowl at the eat spot with three
        // crumbs that get eaten down as the seconds run, then the lot is clean.
        const k = p.feedT / PET_FEED_T
        ctx.globalAlpha = Math.min(1, p.feedT)
        ctx.fillStyle = '#4a3220'
        ctx.beginPath(); ctx.ellipse(x, y + 7, 5.5, 2.4, 0, 0, 7); ctx.fill()
        ctx.fillStyle = '#8a5626'
        ctx.beginPath(); ctx.ellipse(x, y + 6.2, 4.2, 1.6, 0, 0, 7); ctx.fill()
        ctx.fillStyle = '#5b3a1e'
        for (let i = 0; i < Math.ceil(k * 3); i++) ctx.fillRect(x - 3 + i * 2.6, y + 5.4, 1.6, 1.4)
        ctx.globalAlpha = 1
    }
    if (p.asleep && Math.floor(t) % 2 === 0) {
        ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
        ctx.fillText('z', x + 8, y - 14 - (t % 1) * 3)
    }
    if (prowl) {   // #2532: night eyes — two small amber glints while the cat works the dark (view-only, rides nothing)
        ctx.fillStyle = '#ffb347'
        ctx.beginPath(); ctx.arc(x + 9 * (p.face || 1), y - 12, 1.4, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 6 * (p.face || 1), y - 12.5, 1.2, 0, Math.PI * 2); ctx.fill()
    }
}

// ---------------------------------------------------------------- kid (#2203) --
// Pip — a small person, drawn small on purpose: big head, short quick steps,
// a daypack that bounces. Walking scamper, a curled-up bedtime bundle with
// Zzz, tear-arcs while the cry law has them wailing, and gold sparkle-bounces
// when someone tumbles in to play. Same palette family as the residents.
export function drawKid(ctx, p, t) {
    const x = Math.round(p.x), y = Math.round(p.y)
    // shadow
    ctx.fillStyle = 'rgba(30,20,10,0.20)'
    ctx.beginPath(); ctx.ellipse(x, y + 8, 5.5, 2, 0, 0, 7); ctx.fill()
    if (p.asleep) {
        // the bedtime bundle: curled on the floorboards, pack as a pillow
        ctx.fillStyle = '#8a6238'
        ctx.beginPath(); ctx.ellipse(x - 2, y + 1, 8, 4.4, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#e8a13a'
        ctx.beginPath(); ctx.ellipse(x + 3, y - 1, 6, 4, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#3b6ea8'
        ctx.beginPath(); ctx.ellipse(x - 9, y + 1, 3.4, 2.6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#e8c29a'
        ctx.beginPath(); ctx.arc(x + 8, y - 3, 4.4, 0, 7); ctx.fill()
        ctx.fillStyle = '#c9995c'
        ctx.beginPath(); ctx.arc(x + 8, y - 4.4, 4.4, Math.PI, 0); ctx.fill()
        ctx.fillStyle = '#241a10'
        ctx.fillRect(x + 9, y - 3.4, 1.8, 1)
        if (Math.floor(t) % 2 === 0) {
            ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
            ctx.fillText('z', x + 12, y - 8 - (t % 1) * 3)
        }
        return
    }
    const moving = p.path && p.path.length
    const bob = moving ? Math.abs(Math.sin(p.walkPhase * 2)) * -1.6 : Math.sin(t * 3 + p.x) * 0.5
    const leg = moving ? Math.sin(p.walkPhase * 2) * 2.6 : 0
    ctx.save(); ctx.translate(x, y); ctx.scale(p.face, 1)
    // legs — quick little pistons
    ctx.fillStyle = '#8a6238'
    ctx.fillRect(-3, 1 + Math.max(0, leg), 2.4, 7 - Math.max(0, leg))
    ctx.fillRect(0.6, 1 + Math.max(0, -leg), 2.4, 7 - Math.max(0, -leg))
    ctx.fillStyle = '#3c2a17'
    ctx.fillRect(-3, 7 + Math.max(0, leg), 2.6, 1.4); ctx.fillRect(0.6, 7 + Math.max(0, -leg), 2.6, 1.4)
    // daypack behind the torso — it bounces on the scamper
    ctx.fillStyle = '#3b6ea8'
    ctx.fillRect(-7, -5 + bob + (moving ? Math.sin(p.walkPhase * 2) * 0.8 : 0), 4, 7)
    ctx.fillStyle = '#2c5aa0'
    ctx.fillRect(-7, -3 + bob, 4, 1.4)
    // torso
    ctx.fillStyle = '#e8a13a'
    ctx.fillRect(-4.4, -6 + bob, 9, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(-4.4, 0 + bob, 9, 1.6)
    // arms
    ctx.fillStyle = '#e8a13a'
    ctx.fillRect(-6, -5 + bob - leg * 0.6, 2, 6)
    ctx.fillRect(4, -5 + bob + leg * 0.6, 2, 6)
    ctx.fillStyle = '#e8c29a'
    ctx.fillRect(-6, 0.4 + bob - leg * 0.6, 2, 1.6); ctx.fillRect(4, 0.4 + bob + leg * 0.6, 2, 1.6)
    // big head, flaxen fringe
    ctx.fillStyle = '#e8c29a'
    ctx.beginPath(); ctx.arc(0, -11.4 + bob, 6, 0, 7); ctx.fill()
    ctx.fillStyle = '#c9995c'
    ctx.beginPath(); ctx.arc(0, -12.8 + bob, 6, Math.PI, 0); ctx.fill()
    ctx.fillRect(-6, -13.4 + bob, 12, 2)
    // eyes — wide and bright, or scrunched shut mid-wail
    ctx.fillStyle = '#241a10'
    const crying = p.cryT > 2.6
    if (crying) {
        ctx.fillRect(-3.4, -11.6 + bob, 2.4, 1)
        ctx.fillRect(1, -11.6 + bob, 2.4, 1)
        ctx.beginPath(); ctx.arc(0, -8.6 + bob, 1.6, 0, Math.PI); ctx.fill()
    } else {
        const ex = 1.2
        ctx.fillRect(-2.6 + ex, -11.8 + bob, 1.6, 1.8)
        ctx.fillRect(1 + ex, -11.8 + bob, 1.6, 1.8)
    }
    ctx.restore()
    // tears — two blue arcs while the wail lasts
    if (crying) {
        const k = (p.cryT - 2.6) / 0.6
        ctx.globalAlpha = Math.max(0, Math.min(1, k))
        ctx.fillStyle = '#7fb6e8'
        const drop = ((t * 14) % 6)
        ctx.beginPath(); ctx.arc(x - 4, y - 10 + drop, 1.2, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 4.4, y - 10 + ((drop + 3) % 6), 1.2, 0, 7); ctx.fill()
        ctx.globalAlpha = 1
    }
    // giggle sparkles — gold stars bouncing off the head after play
    if (p.giggleT > 0) {
        const k = p.giggleT / 1.4
        ctx.globalAlpha = Math.min(1, p.giggleT)
        for (const [px, ph] of [[-6, 0], [0, 0.5], [6, 0.2]]) star(ctx, x + px, y - 20 - (1 - k) * 9 + ph * 2, 2, '#ffd24a')
        ctx.globalAlpha = 1
    }
    // #2508 item 3: the kid's cone rides the same beat — the curb glyph at
    // kid scale, on her facing side, drip and all.
    if (p.coneHold > 0) drawHeldCone(ctx, x + 7 * p.face, y - 4 + bob * 0.5, p.coneHold, t, 0.72)
}

// #2264: the tint curve is one source with the steam/glow law — nightLevel
// lives in sim.js (pure, gateable) and this pass paints exactly what it says.
export function nightTint(ctx, hour, ext, wings = null, sleepers = null) {
    const a = nightLevel(hour)
    if (a <= 0) return
    ctx.fillStyle = `rgba(24,32,72,${a.toFixed(3)})`
    ctx.fillRect(0, 0, W, H)
    // lit windows along the south wall by night
    if (a > 0.2) {
        for (const wc of [3, 5, 7, 9]) {
            const x = tileX(wc), y = tileY(8)
            ctx.fillStyle = `rgba(255,224,138,${(a * 0.9).toFixed(3)})`
            ctx.fillRect(x + 6, y + 12, 20, 14)
            ctx.fillStyle = `rgba(120,86,34,${(a * 0.5).toFixed(3)})`
            ctx.fillRect(x + 15, y + 12, 2, 14)
        }
        // #1814: the wing glows too once it stands — warm panes over the
        // baked sky-blue glass, same mullions, selling "someone moved in".
        // #2689: every standing wing glows, east or garden.
        if (ext) {
            const wlist = (wings && wings.length ? wings : [{ id: 'east', r0: 2 }]).map(wingGeom)
            for (const wg of wlist) {
                // #2705 tail 3: a room that LODGES runs deeper amber — the
                // lodging law asks its own geometry question (a sleeper inside
                // the wing's floor cells), and the panes answer with it. The
                // tell cools at waking on its own: the sleeper's use clears.
                const occ = wingLodged(wg, sleepers)
                for (const [wr, wc] of wg.windows) {
                    const x = tileX(wc), y = tileY(wr)
                    ctx.fillStyle = occ ? `rgba(255,186,84,${Math.min(1, a * 1.05).toFixed(3)})` : `rgba(255,224,138,${(a * 0.9).toFixed(3)})`
                    ctx.fillRect(x + 6, y + 10, 16, 10)
                    ctx.fillStyle = `rgba(120,86,34,${(a * 0.5).toFixed(3)})`
                    ctx.fillRect(x + 13, y + 10, 2, 10); ctx.fillRect(x + 6, y + 14, 16, 2)
                    if (occ) {                                   // a soft glow halo on the lodged room's glass
                        ctx.fillStyle = `rgba(255,186,84,${(a * 0.22).toFixed(3)})`
                        ctx.fillRect(x + 3, y + 7, 22, 16)
                    }
                }
            }
        }
    }
}

// #2688 handoff 3 — the garden's potting bench keeps a lamp after dusk. The
// wings' panes lit (#1814/#2689) but the garden room stayed dark furniture;
// a small warm pool under the bench ties the two rooms together at night.
// Pure derivation from the wing geometry + the one night curve; day, or a lot
// without the garden, paints nothing.
export function gardenLamp(s) {
    if (!s || !s.ext || !s.wings) return null
    const wg = s.wings.map(wingGeom).find((w) => w.id === 'garden')
    if (!wg || nightLevel(s.hour) <= 0.2) return null   // same dusk floor as the lit panes
    return { r: 9, c: 1 }   // the bake paints the bench along the garden's north wall (cols 0–3)
}

export function drawGardenLamp(ctx, s) {
    const l = gardenLamp(s)
    if (!l) return
    const a = nightLevel(s.hour)
    const lx = tileX(l.c) + TILE / 2, ly = tileY(l.r) + 20
    ctx.fillStyle = `rgba(255,214,120,${(a * 0.45).toFixed(3)})`
    ctx.beginPath(); ctx.ellipse(lx, ly, 26, 9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = `rgba(255,240,170,${(a * 0.95).toFixed(3)})`
    ctx.fillRect(lx - 2, ly - 18, 4, 5)   // the little lamp above the pots
}

// #2705 purpose view pass — the ledgers #2695 keeps are now SEEN mid-game.
// Every tell derives purely from state the sim already records (tend / herbs
// / night sleepers): no law, no rng, no new clock, and the hash never hears
// of any of it — the #2076 view-only doctrine.

export const HAMPER_CAP = 4   // the sprite caps; the ledger keeps counting

// The ripeness ramp 0..1 — the sun-law ledger read at a glance. Only the
// garden room tends; east wings answer 0.
export function ripenessOf(w) {
    if (!w || w.id !== 'garden') return 0
    return Math.max(0, Math.min(1, (w.tend || 0) / TEND_HOURS))
}

// The harvest hamper at the garden door — the food gets a place in the world
// before it reaches the hunger bar. It sits on the doorstep cell's garden
// side (door (8,2) → (9,2)), draw-only like the crate: nobody is fenced in.
export function hamperLoad(s) {
    if (!s || !s.ext || !s.wings) return null
    const wg = s.wings.find((w) => w.id === 'garden')
    if (!wg || !(wg.herbs > 0)) return null
    return { r: 9, c: 2, n: Math.min(wg.herbs, HAMPER_CAP) }
}

// Cells where a resident is asleep THROUGH the night — the lodging law's own
// sleepers (use.night, set at dusk by the sleep law), read so the panes can
// name the room that lodges. Day naps never light the occupied variant.
export function sleepingCells(s) {
    if (!s || !s.people) return []
    return s.people.filter((p) => p.use && p.use.night && p.use.def && p.use.def.sleep).map((p) => ({ r: p.r, c: p.c }))
}

// Which wing the night's sleepers stand inside — the SAME geometry question
// the lodging law asks (#2695: the bed's cell inside wingSets(geom).floor),
// asked of the view so the panes can name the room. Per-wing: a sleeper in
// the east wing lodges the east wing, never the garden.
export function wingLodged(wg, sleepers) {
    return !!(wg && sleepers && sleepers.length
        && sleepers.some((sl) => wingSets(wg).floor.has(`${sl.r},${sl.c}`)))
}

// A half-ripened garden under a closed sky WAITS — the growing gold goes
// quiet under the tint and a cool glint takes over, so waiting and growing
// read differently at a glance (the ring-vs-die pattern, #2688). Night floor
// matches the lit panes' dusk; a spent or empty bed shows nothing.
export function moonlitWait(s) {
    if (!s || !s.ext || !s.wings) return false
    const wg = s.wings.find((w) => w.id === 'garden')
    if (!wg || nightLevel(s.hour) <= 0.2) return false
    const t = wg.tend || 0
    return t > 0 && t < TEND_HOURS
}

// #2713 tail 4 (#2705 tail 4): what each room earned reads at a glance on the
// PAUSE sheet, not just mid-game. The sheet is the player's rest screen, so it
// carries the rooms' tallies — "SPARE ROOM — lodged 3", "HERBS 2" — as pip
// rows. Pure derivation of the wing records #2695 keeps: no law, no rng, no
// new state, and the hash never hears of it (view-only doctrine, #2076). A
// lot with no wings answers null so every other help screen — and this game's
// bare-lot sheet — stays byte-for-byte unchanged (the guide-slot doctrine).
// The overlay stays generic: the WORDS are authored here, in the game.
export function pauseLedger(s) {
    if (!s || !s.wings || !s.wings.length) return null
    const rows = []
    for (const w of s.wings) {
        rows.push(w.id === 'garden'
            ? { text: `HERBS ${w.herbs || 0}`, n: w.herbs || 0, color: '#7ec850' }                        // the harvest green of the glints (#2695)
            : { text: `SPARE ROOM — lodged ${w.sleptWell || 0}`, n: w.sleptWell || 0, color: '#a8d4ee' })  // the moonlit pane blue (#2705)
        // #2736: personality rows appear only once the room has actually
        // been paid out — a room merely named by its furniture wears the
        // door badge, not a tally; a room that has paid shows its earnings.
        if ((w.insights || 0) > 0) rows.push({ text: `STUDY — insights ${w.insights}`, n: w.insights, color: '#d9b23c' })     // the study's reading-lamp amber
        if ((w.delights || 0) > 0) rows.push({ text: `PLAYROOM — giggles ${w.delights}`, n: w.delights, color: '#ffd24a' })    // the giggle star gold (drawKid)
    }
    return { title: 'THE HOUSE PROVIDES', rows }
}

// #2736: the room reads its name at the door. Pure derivation (the #2076
// view-only doctrine — painter and probe ask ONE function): each standing wing
// that furniture has named gets its badge at its own doorstep; the bedroom
// needs no badge — the lodged pane already burns amber for it (#2705).
export function roomBadges(s) {
    if (!s || !s.ext || !s.wings) return []
    const out = []
    for (const w of s.wings) {
        const a = archetypeOf(s, w)
        if (a !== 'study' && a !== 'playroom') continue
        const d = wingGeom(w).door
        // #2743: the badge shows the pay COMING — p is the ripeness toward
        // this room's next payout (#2705's ramp pattern), n what it has banked.
        out.push({
            r: d[0], c: d[1], kind: a,
            p: Math.min(1, (a === 'study' ? w.pages || 0 : w.plays || 0) / (a === 'study' ? PAGES_INSIGHT : PLAYS_DELIGHT)),
            n: a === 'study' ? w.insights || 0 : w.delights || 0,
        })
    }
    return out
}

// Drawn over the furniture so the badge reads IN FRONT of whatever stands in
// the doorway: a study carries an open book (cream pages, the lamp amber of
// its ledger row); a playroom carries the giggle star in its ledger gold.
export function drawRoomBadges(ctx, s) {
    for (const b of roomBadges(s)) {
        const x = tileX(b.c), y = tileY(b.r)
        if (b.kind === 'study') {
            ctx.fillStyle = '#d9b23c'                                              // the book's cover, lamp amber
            ctx.fillRect(x + 5, y + 2, 14, 9)
            ctx.fillStyle = '#efe6c8'                                              // the open pages
            ctx.fillRect(x + 7, y + 4, 5, 5); ctx.fillRect(x + 13, y + 4, 4, 5)
            ctx.fillStyle = '#5a4212'                                              // the spine
            ctx.fillRect(x + 12, y + 2, 1, 9)
        } else {
            ctx.fillStyle = '#ffd24a'                                              // the giggle star, room gold
            ctx.fillRect(x + 10, y + 2, 3, 9)
            ctx.fillRect(x + 7, y + 5, 9, 3)
            ctx.fillStyle = '#fff3b0'
            ctx.fillRect(x + 11, y + 5, 1, 3)
        }
        // #2743: the progress ramp under the glyph — a dark track always,
        // filled in the badge's own colour per finished page/play, so the
        // payoff is seen COMING (the ripeness-ramp pattern, #2705).
        // #2752: the track is 0.72-dark and 3 px tall — the drive's live
        // 390-px leg proved a 2 px / 55% line averages into the plank tan
        // under the phone compositor's blur (rampTrack 0 at k≈0.6); a phone
        // player must read the ramp too, not just the desktop painter.
        ctx.fillStyle = 'rgba(24,16,6,0.72)'
        ctx.fillRect(x + 5, y + 12, 14, 3)
        if (b.p > 0) {
            ctx.fillStyle = b.kind === 'study' ? '#d9b23c' : '#ffd24a'
            ctx.fillRect(x + 5, y + 12, Math.max(2, Math.round(14 * b.p)), 3)
        }
    }
}

// Ground-level paints, run right after drawGround: the bed sits under the
// furniture, the hamper at the door. Daylight shows the turned soil, a slow
// gold creep keyed to ripeness, and sprouts thickening toward the harvest;
// night dims the same gold under the tint while the silver glint (drawn
// later, over the tint) names the wait.
export function drawPurposeView(ctx, s) {
    const wg = s && s.ext && s.wings && s.wings.find((w) => w.id === 'garden')
    if (wg) {
        const bx = tileX(2), by = tileY(10), bw = TILE * 2
        ctx.fillStyle = 'rgba(72,48,26,0.72)'                        // turned soil, the bed
        ctx.fillRect(bx + 3, by + 14, bw - 6, 12)
        const r = ripenessOf(wg)
        if (r > 0) {
            ctx.fillStyle = 'rgba(217,178,60,0.85)'                   // the gold creep east across the bed
            ctx.fillRect(bx + 3, by + 14, (bw - 6) * r, 12)
            const n = 1 + Math.floor(r * 4)                           // vines densify
            ctx.fillStyle = r > 0.75 ? '#ffd24a' : '#7ec850'          // gold tips near the harvest
            for (let i = 0; i < n; i++) ctx.fillRect(bx + 5 + i * 12, by + 11, 2, 4)
        }
    }
    const hb = hamperLoad(s)
    if (hb) {
        const x = tileX(hb.c), y = tileY(hb.r)
        ctx.fillStyle = '#6d4c26'; ctx.fillRect(x + 9, y + 16, 14, 9)                // hamper body
        ctx.fillStyle = '#8a6134'; ctx.fillRect(x + 9, y + 16, 14, 2)                // rim
        for (let i = 0; i < hb.n; i++) {                                              // sprigs over the rim
            ctx.fillStyle = i === hb.n - 1 ? '#8fd060' : '#5d8a3c'
            ctx.fillRect(x + 11 + i * 3, y + 12 - (i % 2), 2, 5)
        }
    }
}

// Over the night tint: pale silver glints on a bed that waits for morning.
// The sine is paint-phase only (real seconds in, view-phase out) — the sim
// clock it decorates is the sun-law, frozen at night by its own rule.
export function drawMoonlitWait(ctx, s, sec = 0) {
    if (!moonlitWait(s)) return
    const a = nightLevel(s.hour)
    const bx = tileX(2), by = tileY(10)
    for (let i = 0; i < 3; i++) {
        const tw = 0.16 + 0.12 * Math.sin(sec * 2.1 + i * 2.1)
        ctx.fillStyle = `rgba(214,228,255,${(a * tw).toFixed(3)})`
        ctx.fillRect(bx + 6 + i * 18, by + 16, 2, 2)
    }
}

// ------------------------------------------------------------------ HUD ----
const NEED_ICON = { hunger: 'fork', energy: 'moon', fun: 'star', social: 'chat', bladder: 'drop' }

function needColor(v) {
    return v > 0.55 ? P.barGreen : v > 0.25 ? P.barAmber : P.barRed
}

// #2470 — residentRows(s): the needs panel's per-resident layout as DATA
// (the same pattern #2240 set with bondRows — painter and hit-test read one
// source, so paint and tap can never drift). A resident with queued orders
// gets a row of QCELL chips under their bars; without, the row is not
// reserved (the panel stays as tight as it always was for idle households).
export const QCELL = { cw: 19, ch: 14, gap: 3 }

export function residentRows(s, collapse = null) {
    const rows = []
    let y = LOT_Y + 26
    for (const p of s.people) {
        const barsY0 = y + 16
        // #2474: the NOW cell — the errand actually running, shown ahead of the
        // pending chips with a thin drain bar (The Sims drew a depleting timer on
        // the head of its action queue). View-only: stateHash never sees it.
        const row = { p, nameY: y, barsY0, queueY: p.queue.length ? barsY0 + NEEDS.length * 10 + 2 : null, now: p.queue.length ? chipProgress(p) : null }
        // #2474 item 4: the collapse beat — a row whose chips just left the list
        // keeps its reserved space (and paints its shrinking ghosts) while the
        // fade plays, so “the list moved” is SEEN before the panel reflows.
        const fade = p.queue.length ? null : (collapse && collapse.get(pIndex(s, p))) || null
        if (fade) { row.fade = fade; row.queueY = barsY0 + NEEDS.length * 10 + 2 }
        y = barsY0 + NEEDS.length * 10 + 8 + (row.queueY !== null ? 18 : 0)
        row.nextY = y
        rows.push(row)
    }
    return rows
}

function pIndex(s, p) {
    for (let i = 0; i < s.people.length; i++) if (s.people[i] === p) return i
    return -1
}

// #2474: queueGlyphFor(id) — the chip glyph as a function of the event id, so
// the painter and the shell's per-glyph timbre (QUEUE_TIMBRE) read ONE source.
export function queueGlyphFor(id) {
    if (id === 'walk') return 'arrow'
    if (id === 'work' || id === 'mail') return 'case'
    if (id === 'gosay') return 'gosay'   // #2704 tail 3: the errand that WALKS over wears its own chip — a bubble-on-legs, distinct from the chat glyph of a word spoken sitting down
    const d = DEF[id]
    return (d && d.need && NEED_ICON[d.need]) || 'star'
}

// #2474: chipProgress(p) — how far along the resident's RUNNING errand is, or
// null when nothing is in flight for the player (an AI wander shows no NOW
// cell: the chips are the player's list, free will never takes the panel).
// Interaction → t/dur (sleep has no visible deadline → a static marker).
// Walk → the steps spent against the length stamped at issue (p.walkN0).
export function chipProgress(p) {
    if (!p || p.faintT > 0 || p.owner !== 'human') return null
    if (p.use) {
        const frac = p.use.def && p.use.def.sleep ? 0 : Math.min(1, p.use.t / (p.use.dur || 1))
        return { frac, glyph: queueGlyphFor(p.use.it.id), id: p.use.it.id }
    }
    if (p.path && p.path.length && p.walkN0) {
        const id = p.goal && p.goal.kind === 'use' ? p.goal.it.id : p.goal && p.goal.kind === 'gosay' ? 'gosay' : 'walk'   // #2683: the walk chip names a promised word
        return { frac: Math.max(0, 1 - p.path.length / p.walkN0), glyph: queueGlyphFor(id), id }
    }
    return null
}

// the queue chips' glyph: the panel's own need icons for object orders;
// the work case for the mail; an arrow for a plain walk.
function queueGlyph(o) {
    return queueGlyphFor(o.kind === 'use' ? o.it.id : o.kind)
}

export function queueHit(s, px, py) {
    const rows = residentRows(s)
    for (let pi = 0; pi < rows.length; pi++) {
        const row = rows[pi]
        if (row.queueY === null) continue
        if (py < row.queueY || py > row.queueY + QCELL.ch) continue
        // #2474: a NOW cell occupies the first slot when an errand is running —
        // it is a tell, not a button (running orders are not cancellable), so a
        // tap there is inert and the pending chips shift right by one cell.
        const off = row.now ? QCELL.cw + QCELL.gap : 0
        const n = row.p.queue.length
        const x0 = PANEL_X + 26 + off
        if (px < x0 || px > x0 + n * (QCELL.cw + QCELL.gap) - QCELL.gap) continue
        const qi = Math.floor((px - x0) / (QCELL.cw + QCELL.gap))
        if (px - x0 - qi * (QCELL.cw + QCELL.gap) > QCELL.cw) continue
        if (qi >= n) continue
        return { pi, qi }
    }
    return null
}

// #2474 item 2: chipName(id) — the one source for a chip's spoken name.
// CATALOG objects ride DEF; the mail and a plain walk carry their own words.
export function chipName(id) {
    if (id === 'walk') return 'WALK'
    if (id === 'work' || id === 'mail') return 'WORK'
    const d = DEF[id]
    return (d && d.name ? d.name : String(id)).toUpperCase()
}

// #2474 item 2: chipHover(s, px, py) — the name-reveal hit route. It reads the
// queueHit geometry AND the NOW cell (the tell is a button for NAMES only, never
// for cancels). The shell decides the gesture: a mouse hover reveals instantly,
// a held thumb reveals after the long-press clock — so touch and mouse share one
// geometry and neither collides with the cancel-by-chip law (#2470, pinned).
export function chipHover(s, px, py) {
    const rows = residentRows(s)
    for (let pi = 0; pi < rows.length; pi++) {
        const row = rows[pi]
        if (row.queueY === null) continue
        if (py < row.queueY || py > row.queueY + QCELL.ch) continue
        if (row.now && px >= PANEL_X + 26 && px <= PANEL_X + 26 + QCELL.cw) {
            return { pi, qi: -1, glyph: row.now.glyph, name: chipName(row.now.id) }
        }
    }
    const qh = queueHit(s, px, py)
    if (!qh) return null
    const o = rows[qh.pi].p.queue[qh.qi]
    return { pi: qh.pi, qi: qh.qi, glyph: queueGlyph(o), name: chipName(o.kind === 'use' ? o.it.id : o.kind) }
}

// #2474 item 4: the collapse register (shell-owned Map<personIndex, entry>).
// The shell snapshots each resident's pending glyphs around its world steps;
// glyphs that LEFT the list (cancel, issue, drop — any honest exit) are handed
// here and paint as shrinking ghosts while the row holds its space. The sim
// owns the law and hashes; the register lives outside s, byte-safe by design.
// k is the per-world-step clock: at the dial's fast gears the world really
// runs quicker, and the beat hurries with it.
export const COLLAPSE_FRAMES = 12

export function chipCollapse(s, cache) {
    if (!s || !cache) return
    for (const [k, en] of cache) {
        en.t -= 1
        if (en.t <= 0) cache.delete(k)
    }
}

export function chipCollapseArm(cache, pi, glyphs, rest) {
    if (!cache || !glyphs.length) return
    cache.set(pi, { glyphs, rest, t: COLLAPSE_FRAMES })
}

export function drawPanel(ctx, s, t, collapse = null, hoverName = null) {
    ctx.fillStyle = P.panel; ctx.fillRect(PANEL_X, LOT_Y, W - PANEL_X - 4, H - LOT_Y - 8)
    ctx.strokeStyle = P.panelEdge; ctx.lineWidth = 2
    ctx.strokeRect(PANEL_X + 1, LOT_Y + 1, W - PANEL_X - 6, H - LOT_Y - 10)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 10px monospace'
    ctx.fillText('HOUSEHOLD', PANEL_X + 10, LOT_Y + 8)
    for (const row of residentRows(s, collapse)) {
        const p = row.p
        const isActive = s.people[s.active] === p
        ctx.fillStyle = p.hue
        ctx.beginPath(); ctx.arc(PANEL_X + 16, row.nameY + 6, 6, 0, 7); ctx.fill()
        ctx.fillStyle = isActive ? '#ffd24a' : '#8fa2c8'
        ctx.font = 'bold 10px monospace'
        ctx.fillText(p.name.toUpperCase() + (p.working ? ' · AT WORK' : ''), PANEL_X + 28, row.nameY + 1)
        let y = row.barsY0
        for (const n of NEEDS) {
            needIcon(ctx, PANEL_X + 14, y + 4, NEED_ICON[n], needColor(p.needs[n]))
            ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 26, y, 64, 7)
            ctx.fillStyle = needColor(p.needs[n]); ctx.fillRect(PANEL_X + 27, y + 1, Math.max(2, 62 * p.needs[n]), 5)
            if (p.needs[n] <= 0.12 && Math.floor(t * 3) % 2 === 0) {
                ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 1
                ctx.strokeRect(PANEL_X + 26.5, y - 0.5, 64, 7)
            }
            ctx.fillStyle = p.needs[n] <= RED_AT ? '#ff8a7c' : '#cfe0f2'
            ctx.font = 'bold 7px monospace'; ctx.textAlign = 'right'
            ctx.fillText(String(Math.round(p.needs[n] * 100)), PANEL_X + 100, y - 1)
            ctx.textAlign = 'left'
            y += 10
        }
        if (row.queueY !== null) {
            // #2470: the queue chips — pending orders in the list, head of
            // line first, the panel's own icon language. Tapping a chip cancels
            // that order (queueHit shares this exact geometry).
            // #2474: a NOW cell leads the row while an errand runs — gold-rimmed
            // with a thin bar that drains as the interaction/walk spends itself.
            const off = row.now ? QCELL.cw + QCELL.gap : 0
            if (row.now) {
                const nx = PANEL_X + 26
                ctx.fillStyle = '#232f4a'; ctx.fillRect(nx, row.queueY, QCELL.cw, QCELL.ch)
                ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
                ctx.strokeRect(nx + 0.5, row.queueY + 0.5, QCELL.cw - 1, QCELL.ch - 1)
                needIcon(ctx, nx + QCELL.cw / 2, row.queueY + QCELL.ch / 2, row.now.glyph, '#ffd24a')
                const left = Math.max(0, (QCELL.cw - 4) * (1 - row.now.frac))
                if (left > 0) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(nx + 2, row.queueY + QCELL.ch - 3, left, 2) }
            }
            for (let i = 0; i < p.queue.length; i++) {
                const x = PANEL_X + 26 + off + i * (QCELL.cw + QCELL.gap)
                ctx.fillStyle = '#1a2336'; ctx.fillRect(x, row.queueY, QCELL.cw, QCELL.ch)
                ctx.strokeStyle = i === 0 ? '#c9a23f' : '#31405e'; ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, row.queueY + 0.5, QCELL.cw - 1, QCELL.ch - 1)
                needIcon(ctx, x + QCELL.cw / 2, row.queueY + QCELL.ch / 2, queueGlyph(p.queue[i]), i === 0 ? '#ffd24a' : '#8fa2c8')
            }
            // #2474 item 4: ghosts of the chips that just left the list, shrinking
            // into the vacated tail while the row holds its space — “the list
            // moved.” Only the positions beyond the new head count ghost (an emptied
            // row ghosts fully; a middle-cancel reads as the honest left-shift).
            if (row.fade) {
                const k = Math.max(0, row.fade.t / COLLAPSE_FRAMES)
                const gone = row.fade.glyphs.length
                for (let i = row.fade.rest; i < gone; i++) {
                    const gx = PANEL_X + 26 + i * (QCELL.cw + QCELL.gap)
                    const bx = gx + (QCELL.cw - QCELL.cw * k) / 2
                    const by = row.queueY + (QCELL.ch - QCELL.ch * k) / 2
                    ctx.globalAlpha = k
                    ctx.fillStyle = '#232f4a'
                    ctx.fillRect(bx, by, QCELL.cw * k, QCELL.ch * k)
                    if (k > 0.5) needIcon(ctx, bx + QCELL.cw * k / 2, by + QCELL.ch * k / 2, row.fade.glyphs[i], '#7488ad')
                    ctx.globalAlpha = 1
                }
            }
            // #2474 item 2: the name reveal — the chip the pointer rests on (or a
            // held thumb) says its own word under the row, teaching the glyph set.
            if (hoverName && hoverName.pi === s.people.indexOf(p)) {
                ctx.fillStyle = '#8fa2c8'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
                ctx.fillText(hoverName.name, PANEL_X + 26, row.queueY + QCELL.ch + 1)
            }
        }
    }
    const rowsAll = residentRows(s)
    let y = rowsAll.length ? rowsAll[rowsAll.length - 1].nextY : LOT_Y + 26
    // BONDS (#1817): heart = the two residents, leaf = Fern; four pips per
    // bond, filled by level. The FAMILY pip pulses — earned is shown.
    const by = y + 2
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'
    ctx.fillText('BONDS', PANEL_X + 12, by)
    // #2070: a grudge runs the household heart ash-dark — the panel shows the
    // chill until the pair makes up (the spark comes back with the level).
    // #2240: rows + FAMILY pulses derive from bondRows(s) so the painter and
    // the phone-scale probe (bondsPix) can never drift apart.
    for (const row of bondRows(s)) {
        bondRow(ctx, row.x, row.y, row.glyph, row.col, row.lv, row.label)
        if (row.pulse && Math.floor(t * 2.5) % 2 === 0) {
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
            ctx.strokeRect(row.x + 3 * 8 + 0.5, row.y + 0.5, 5, 5)
        }
        if (row.warm && Math.floor(t * 2.5) % 2 === 0) {
            // #2599 item 4: cross-warmth sparkle — a teal diamond (the NEIGH
            // strand's colour) breathing beside the row the law touches.
            ctx.fillStyle = '#3aa08a'
            const dx = row.x + 82, dy = row.y + 3.5
            ctx.beginPath(); ctx.moveTo(dx, dy - 3); ctx.lineTo(dx + 3, dy); ctx.lineTo(dx, dy + 3); ctx.lineTo(dx - 3, dy); ctx.closePath(); ctx.fill()
        }
        if (row.strolling) {
            // #2618 item 5: the lap teaches itself from the panel — two teal foot
            // pips walking in step beside the NEIGH row while a lap is in flight
            // (the ash-teal tell at the cold end, the walk at the warm one).
            const step = Math.floor(t * 4) % 2
            ctx.fillStyle = '#7fd0c0'
            ctx.fillRect(row.x + 54, row.y + 2 - step, 2.4, 3.4)
            ctx.fillStyle = '#3aa08a'
            ctx.fillRect(row.x + 58, row.y + 2 + step, 2.4, 3.4)
        }
    }
    // #2729: the jar row — the fund reads live under Pip's BONDS row, so the
    // money the round pays is seen filling without ever opening the catalog.
    const jr = jarRow(s)
    if (jr) {
        bondRow(ctx, jr.x, jr.y, jr.glyph, jr.col, jr.lv, jr.label)
        ctx.fillStyle = '#f2c14e'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(`${s.jar}/${JAR_CAP}`, jr.x + 68, jr.y + 2)   // the honest count, amber like the fund
        if (jr.pulse && Math.floor(t * 2.5) % 2 === 0) {
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
            ctx.strokeRect(jr.x + 3 * 8 + 0.5, jr.y + 0.5, 5, 5)
        }
    }
    const mood = petMood(s)
    if (mood !== null) {
        const py = by + (s.kid ? (jr ? 96 : 82) : 68)   // #2588: the NEIGH row moved the cat's seat down one · #2729: so does the JAR row
        bondRow(ctx, PANEL_X + 12, py, 'paw', '#d98e4a', Math.round(mood * 4), 'MISO')
        if (mood <= RED_AT && Math.floor(t * 3) % 2 === 0) {
            ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 1
            ctx.strokeRect(PANEL_X + 12 + 13.5, py + 0.5, 4 * 8, 7)
        }
    }
    // speed dial (#2227): the original's clock control, sitting above the wish
    // meter — four gears, the chosen one gold; the pause pip pulses while the
    // world stands still. DIAL is shared with speedHit() so the tap route can
    // never drift from what's painted, and generous 19×14 cells keep it legal
    // thumbs on a phone (the same lesson the #2222 tab row learned).
    ctx.lineWidth = 1
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('SPEED', DIAL.x, DIAL.y - 11)
    for (let i = 0; i < SPEED_MULT.length; i++) {
        const x = DIAL.x + i * (DIAL.cw + DIAL.gap)
        const on = s.speed === i
        ctx.fillStyle = on ? '#2c3c5e' : '#1a2336'
        ctx.fillRect(x, DIAL.y, DIAL.cw, DIAL.ch)
        ctx.strokeStyle = on ? (i === 0 && Math.floor(t * 2.5) % 2 === 0 ? '#8c6a2e' : '#ffd24a') : '#31405e'
        ctx.strokeRect(x + 0.5, DIAL.y + 0.5, DIAL.cw - 1, DIAL.ch - 1)
        ctx.fillStyle = on ? '#ffd24a' : '#7186ad'
        if (i === 0) {
            ctx.fillRect(x + 6, DIAL.y + 3, 2, DIAL.ch - 6)
            ctx.fillRect(x + 11, DIAL.y + 3, 2, DIAL.ch - 6)
        } else {
            const tw = 5 * i - 1
            const ox = x + (DIAL.cw - tw) / 2
            ctx.beginPath()
            for (let k = 0; k < i; k++) {
                const bx = ox + k * 5
                ctx.moveTo(bx, DIAL.y + 3.5)
                ctx.lineTo(bx + 4, DIAL.y + DIAL.ch / 2)
                ctx.lineTo(bx, DIAL.y + DIAL.ch - 3.5)
                ctx.closePath()
            }
            ctx.fill()
        }
    }
    // lifetime wish meter
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'
    ctx.fillText('LIFETIME WISH', PANEL_X + 12, H - 92)
    ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 12, H - 80, 90, 9)
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(PANEL_X + 13, H - 79, 88 * Math.min(1, s.content / WIN_CONTENT), 7)
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 8px monospace'
    ctx.fillText(`${Math.floor(s.content)}/${WIN_CONTENT}`, PANEL_X + 62, H - 78)
}

// #2227 — dial geometry shared by draw and hit-test; speedHit -> gear 0..3, -1 off.
export const DIAL = { x: PANEL_X + 12, y: H - 124, cw: 19, ch: 14, gap: 4 }

export function speedHit(px, py) {
    if (px < DIAL.x || px > DIAL.x + SPEED_MULT.length * (DIAL.cw + DIAL.gap) - DIAL.gap) return -1
    if (py < DIAL.y || py > DIAL.y + DIAL.ch) return -1
    const i = Math.floor((px - DIAL.x) / (DIAL.cw + DIAL.gap))
    if (i < 0 || i >= SPEED_MULT.length) return -1
    if (px - DIAL.x - i * (DIAL.cw + DIAL.gap) > DIAL.cw) return -1
    return i
}

function needIcon(ctx, x, y, kind, col) {
    ctx.fillStyle = col
    switch (kind) {
        case 'fork':
            ctx.fillRect(x - 1, y - 4, 1.4, 8)
            ctx.fillRect(x - 4, y - 4, 1.2, 4); ctx.fillRect(x + 2.4, y - 4, 1.2, 4)
            break
        case 'moon':
            ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill()
            ctx.fillStyle = P.barBg; ctx.beginPath(); ctx.arc(x + 2.4, y - 1, 3.4, 0, 7); ctx.fill()
            break
        case 'star': star(ctx, x, y, 4, col); break
        case 'chat':
            ctx.fillRect(x - 4, y - 4, 8, 6)
            ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x - 2, y + 5); ctx.lineTo(x + 1, y + 2); ctx.closePath(); ctx.fill()
            break
        case 'gosay':   // #2704 tail 3: the chat bubble grows legs — "this word walks over", not "sits and talks"
            ctx.fillRect(x - 4, y - 5.5, 8, 5.5)
            ctx.fillRect(x - 3, y + 0.5, 1.6, 3.5)   // two striding legs, one lifted mid-step
            ctx.fillRect(x + 1.4, y + 0.5, 1.6, 2.4)
            break
        case 'drop':
            ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x + 4.6, y + 1, x, y + 4.6); ctx.quadraticCurveTo(x - 4.6, y + 1, x, y - 5); ctx.fill()
            break
        case 'case':   // #2470: the work order — a briefcase
            ctx.fillRect(x - 4.5, y - 1.5, 9, 6)
            ctx.fillRect(x - 2.2, y - 4, 1.3, 2.6); ctx.fillRect(x + 0.9, y - 4, 1.3, 2.6)
            ctx.fillRect(x - 2.2, y - 4, 4.4, 1.3)
            break
        case 'arrow':   // #2470: a plain walk — a chunky right arrow
            ctx.beginPath()
            ctx.moveTo(x - 4, y - 1.4); ctx.lineTo(x + 0.6, y - 1.4); ctx.lineTo(x + 0.6, y - 4)
            ctx.lineTo(x + 4.6, y); ctx.lineTo(x + 0.6, y + 4); ctx.lineTo(x + 0.6, y + 1.4); ctx.lineTo(x - 4, y + 1.4)
            ctx.closePath(); ctx.fill()
            break
        default: break
    }
}

// #1817 — bond row: a glyph (heart/leaf), four level pips, target label.
// #2240 — bondRows(s): the panel's bond-line layout as DATA (painter and the
// phone-scale legibility probe read the same numbers; drift between the two is
// how legibility gates start lying). `pulse` = FAMILY gold blink on pip 4.
export function bondRows(s) {
    const by = LOT_Y + 26 + s.people.length * 74 + 2
    const rows = [
        { key: 'house', glyph: 'heart', col: s.grudge ? '#8c3b34' : '#e2574c', lv: relLevel(s.rel.house), label: 'HOUSE', x: PANEL_X + 12, y: by + 12, pulse: relLevel(s.rel.house) === 3 },
        // #2599 item 4: `warm` marks the rows the cross-warmth law touches —
        // at rung NEIGH_WARM_AT+ each neighbour chats 25% deeper with the
        // household, and the panel says so (view-only, derived like `pulse`).
        { key: 'fern', glyph: 'leaf', col: '#4fae5f', lv: relLevel(s.rel.fern), label: 'FERN', x: PANEL_X + 12, y: by + 26, pulse: relLevel(s.rel.fern) === 3, warm: relLevel(s.rel.neigh) >= NEIGH_WARM_AT },
        { key: 'ivy', glyph: 'flower', col: '#a3579b', lv: relLevel(s.rel.ivy), label: 'IVY', x: PANEL_X + 12, y: by + 40, pulse: relLevel(s.rel.ivy) === 3, warm: relLevel(s.rel.neigh) >= NEIGH_WARM_AT },
        // #2588: the third-party rung — twin leaves, the neighbours' own row.
        // Teal: far enough from Fern-green and Ivy-plum to read as a pair's
        // own colour (and from every other row hue in the phone-scale probe).
        // #2604: ash-teal while the pair's own grudge holds — the HOUSE row's
        // grudge-ash pattern, mirrored on the web's third strand.
        // #2618 item 5: `strolling` marks a lap in flight — either guest carries
        // a path. View-only, derived like `warm`; the panel teaches the walk law
        // from the row the law belongs to.
        { key: 'neigh', glyph: 'twin', col: s.neiGrudge ? '#2c6b5b' : '#3aa08a', lv: relLevel(s.rel.neigh), label: 'NEIGH', x: PANEL_X + 12, y: by + 54, pulse: relLevel(s.rel.neigh) === 3, strolling: !!(s.visitor && s.visitor.path && s.visitor.path.length || s.ivy && s.ivy.path && s.ivy.path.length) },
    ]
    if (s.kid) rows.push({ key: 'kid', glyph: 'star', col: '#ffd24a', lv: relLevel(s.rel.kid), label: 'PIP', x: PANEL_X + 12, y: by + 68, pulse: false })
    return rows
}

// #2729 — THE JAR READS ON ITS OWN. #2721 pays Pip's round into the fund at the
// gate, but until the catalog opens the fill was invisible — a phone player who
// never buys anything never learns the cottage is being saved for. The row rides
// the BONDS vocabulary (amber jar glyph, four pips at the quartiles of JAR_CAP,
// a live n/cap read) directly under Pip's own row, since the round is hers.
// It appears with Pip and retires when the cottage stands — the fund has no
// purpose after the hammer. Pure view data (like bondRows): painter and the
// phone-scale probe (bondsPix.jar) read the same numbers, and the sim never
// hears of it — the jar itself already rides stateHash.
export function jarRow(s) {
    if (!s.kid || s.wings.some((w) => w.id === 'garden')) return null
    const by = LOT_Y + 26 + s.people.length * 74 + 2
    return {
        key: 'jar', glyph: 'jar', col: '#e8a13a',
        lv: s.jar >= JAR_CAP ? 4 : Math.floor((s.jar / JAR_CAP) * 4),
        label: 'JAR', x: PANEL_X + 12, y: by + 82,
        pulse: s.jar >= JAR_CAP,   // a full jar blinks the FAMILY ring — the kit is buyable NOW
    }
}

function bondRow(ctx, x, y, glyph, col, lv, label) {
    if (glyph === 'heart') {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(x + 4, y + 1.5, 2.6, Math.PI, 0)
        ctx.arc(x + 8, y + 1.5, 2.6, Math.PI, 0)
        ctx.lineTo(x + 6, y + 6.5)
        ctx.closePath(); ctx.fill()
    } else if (glyph === 'leaf') {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.ellipse(x + 6, y + 2, 2.4, 4, -Math.PI / 4, 0, 7)
        ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 7.5, y + 3.5); ctx.lineTo(x + 10, y + 6); ctx.stroke()
    } else if (glyph === 'star') {
        // #2203: Pip's BONDS glyph — a five-point gold star
        star(ctx, x + 5.5, y + 3, 4.4, col)
    } else if (glyph === 'twin') {
        // #2588: the neighbours' BONDS glyph — two mirrored leaves, leaning in
        ctx.fillStyle = col
        ctx.beginPath(); ctx.ellipse(x + 4.4, y + 2.4, 1.9, 3.2, Math.PI / 4, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.ellipse(x + 7.6, y + 3.4, 1.9, 3.2, -Math.PI / 4, 0, 7); ctx.fill()
    } else if (glyph === 'paw') {
        // #2200: Miso's BONDS glyph — three toes over a broad pad
        ctx.fillStyle = col
        for (const [dx, dy] of [[-3, 0.4], [0, -1], [3, 0.4]]) { ctx.beginPath(); ctx.arc(x + 5.5 + dx, y + 1.2 + dy, 1.15, 0, 7); ctx.fill() }
        ctx.beginPath(); ctx.ellipse(x + 5.5, y + 4.6, 2.7, 2.1, 0, 0, 7); ctx.fill()
    } else if (glyph === 'jar') {
        // #2729: the garden fund — an amber preserve jar with a gold lid, the
        // honey-jar family (drawGroundGift) shrunk to row size.
        ctx.fillStyle = col
        ctx.fillRect(x + 1.5, y + 0.5, 8.5, 6.5)
        ctx.fillStyle = 'rgba(255,233,168,0.8)'; ctx.fillRect(x + 2.8, y + 1.8, 1.4, 3.4)   // shine
        ctx.fillStyle = '#c9821f'; ctx.fillRect(x + 1.5, y + 4.2, 8.5, 1)                     // preserve line
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 0.5, y - 1, 10.5, 2)                      // lid
    } else {
        ctx.fillStyle = col
        for (const [dx, dy] of [[0, -2.3], [2.3, 0], [0, 2.3], [-2.3, 0]]) { ctx.beginPath(); ctx.arc(x + 5 + dx, y + 3 + dy, 1.9, 0, 7); ctx.fill() }
        ctx.fillStyle = '#ffd24a'
        ctx.beginPath(); ctx.arc(x + 5, y + 3, 1.3, 0, 7); ctx.fill()
    }
    for (let i = 0; i < 4; i++) {
        const px = x + 14 + i * 8
        if (i < lv) { ctx.fillStyle = col; ctx.fillRect(px, y + 1, 6, 6) }
        else {
            ctx.fillStyle = P.barBg; ctx.fillRect(px, y + 1, 6, 6)
            ctx.strokeStyle = '#33405e'; ctx.lineWidth = 1
            ctx.strokeRect(px + 0.5, y + 1.5, 5, 5)
        }
    }
    ctx.fillStyle = '#8fa2c8'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'
    ctx.fillText(label, x + 50, y + 2)
}

export function drawTopBar(ctx, s) {
    ctx.fillStyle = 'rgba(18,24,38,0.88)'
    ctx.fillRect(0, 0, W, LOT_Y - 4)
    ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('HOMEBODY', 10, 18)
    const hh = Math.floor(s.hour) % 24
    const mm = Math.floor((s.hour % 1) * 60)
    ctx.fillStyle = '#dfe8f5'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`DAY ${s.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 180, 18)
    ctx.fillStyle = '#7fe08a'
    ctx.fillText(`§${s.money}`, 340, 18)
    ctx.fillStyle = s.build ? '#ffd24a' : '#8fa2c8'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(s.build ? 'BUY MODE — tap floor to place · B to leave' : 'B / ⚒ : BUY MODE', 420, 18)
}

// -------------------------------------------------------------- catalog ----
export const TRAY_H = 56
// tray geometry shared by draw + hit-test. #2222: cards are sized to the
// widest shelf (6) — flipping shelves beats the old 35px wall of sixteen.
const TAB_H = 13
const CARD_Y = 17     // card row top, below the tab row
// #2272: shelves hold different counts now (HOME carries the Canopy Bed) —
// cards fill the tray whichever shelf is open, so a seventh card never runs
// off the panel edge.
const shelfCW = (n) => Math.max(48, Math.floor((PANEL_X - 12 - (n - 1) * 4) / n))

export function drawCatalog(ctx, s) {
    const y = H - TRAY_H
    ctx.fillStyle = 'rgba(20,26,40,0.92)'; ctx.fillRect(0, y, PANEL_X, TRAY_H)
    ctx.strokeStyle = P.panelEdge; ctx.strokeRect(0.5, y + 0.5, PANEL_X - 1, TRAY_H - 1)
    // shelf tabs — the original's catalog chrome: four tabs, one open shelf
    const tw = Math.floor((PANEL_X - 12) / CAT_TABS.length)
    CAT_TABS.forEach((t, i) => {
        const x = 6 + i * tw
        const on = s.tab === i
        ctx.fillStyle = on ? '#2c3c5e' : '#1a2336'
        ctx.fillRect(x, y + 2, tw - 4, TAB_H)
        if (on) { ctx.strokeStyle = '#ffd24a'; ctx.strokeRect(x + 0.5, y + 2.5, tw - 5, TAB_H - 1) }
        ctx.fillStyle = on ? '#ffd24a' : '#7186ad'
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(t.id, x + (tw - 4) / 2, y + 2 + TAB_H / 2 + 0.5)
    })
    const cards = tabCards(s)
    const cw = shelfCW(cards.length), gap = 4
    cards.forEach((gi, k) => {
        const d = CATALOG[gi]
        const x = 6 + k * (cw + gap)
        const cy = y + CARD_Y
        // #2721: the room card buys the NEXT kit — the east wing from the till,
        // the garden cottage from Pip's round money — so the price line reads
        // the honest purse for what the card will actually raise, and a full
        // jar shows as full.
        const kit = d.room ? (s.ext >= 1 ? GARDEN : EXT_ROOM) : null
        const cost = kit ? kit.price : d.price
        const fund = kit && kit.id === 'garden' ? s.jar : 0
        const afford = s.money + fund >= cost
        ctx.fillStyle = gi === s.sel ? '#3a4c74' : '#232d44'
        ctx.fillRect(x, cy, cw, TRAY_H - CARD_Y - 4)
        ctx.strokeStyle = gi === s.sel ? '#ffd24a' : afford ? '#41527a' : '#31405e'
        ctx.strokeRect(x + 0.5, cy + 0.5, cw - 1, TRAY_H - CARD_Y - 5)
        ctx.globalAlpha = afford ? 1 : 0.45
        drawItemAt(ctx, d.id, x + cw / 2 - 16, cy + 1, 0)
        ctx.globalAlpha = 1
        ctx.fillStyle = afford ? '#cfe0ff' : '#5f7095'
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(kit && kit.id === 'garden' ? `§${cost} JAR ${s.jar}/${cost}` : `§${cost}`, x + cw / 2, cy + TRAY_H - CARD_Y - 16)
        ctx.fillStyle = '#7186ad'; ctx.textAlign = 'left'
        ctx.fillText(String(k + 1), x + 3, cy + 2)   // digit badges — per shelf, every card
    })
    ctx.globalAlpha = 1
}

// tap a shelf tab -> its index, or -1
export function tabHit(px, py) {
    const y = H - TRAY_H
    if (py < y + 2 || py > y + 2 + TAB_H) return -1
    const tw = Math.floor((PANEL_X - 12) / CAT_TABS.length)
    const i = Math.floor((px - 6) / tw)
    return i >= 0 && i < CAT_TABS.length ? i : -1
}

export function catalogHit(px, py, s) {
    if (py < H - TRAY_H + CARD_Y) return -1
    const cards = tabCards(s)
    const cw = shelfCW(cards.length), gap = 4
    const k = Math.floor((px - 6) / (cw + gap))
    if (k >= cards.length) return -1
    if (k < 0 || px - 6 - k * (cw + gap) > cw) return -1
    return cards[k]
}

// -------------------------------------------------------------- cursor ----
export function drawBuildCursor(ctx, s, ok) {
    const x = tileX(s.cursor.c), y = tileY(s.cursor.r)
    ctx.strokeStyle = ok ? '#7fe08a' : '#ff6a5c'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2)
    if (ok) {
        ctx.globalAlpha = 0.55
        drawItemAt(ctx, CATALOG[s.sel].id, x, y, 0)
        ctx.globalAlpha = 1
    }
}

// #2689: the kit's site preview. While the Spare Room card is held, the whole
// future wing shows as a ghost where the hammer would fall: planks washed
// green (or red when refused), walls hatched, the punched door ticked. The
// ghost is pure view — it reads state, never writes it.
export function drawWingGhost(ctx, geom, ok) {
    const col = ok ? '#7fe08a' : '#ff6a5c'
    ctx.globalAlpha = 0.14
    ctx.fillStyle = col
    for (const [r, c] of geom.floor) ctx.fillRect(tileX(c) + 2, tileY(r) + 2, TILE - 4, TILE - 4)
    ctx.globalAlpha = 0.22
    for (const [r, c] of geom.walls) ctx.fillRect(tileX(c) + 1, tileY(r) + 1, TILE - 2, TILE - 2)
    ctx.globalAlpha = 1
    ctx.strokeStyle = col
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    const cells = [...geom.walls, ...geom.floor, geom.door]
    const r0 = Math.min(...cells.map(([r]) => r))
    const r1 = Math.max(...cells.map(([r]) => r))
    const c0 = Math.min(...cells.map(([, c]) => c))
    const c1 = Math.max(...cells.map(([, c]) => c))
    ctx.strokeRect(tileX(c0) + 1, tileY(r0) + 1, (c1 - c0 + 1) * TILE - 2, (r1 - r0 + 1) * TILE - 2)
    ctx.setLineDash([])
    ctx.fillStyle = col
    ctx.fillRect(tileX(geom.door[1]) + TILE / 2 - 3, tileY(geom.door[0]) + TILE / 2 - 3, 6, 6)
}

// -------------------------------------------------------------- say -------
// #2135: the spoken-word bubble — the original showed dialogue over the
// speakers, not just in a log. A cream plate with a tail, wrapped to two
// lines, fading on the real clock. Sits in world space so it rides the jolt.
export function drawSay(ctx, b) {
    const a = Math.min(1, b.life / 0.8)
    ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const lines = []; let cur = ''
    for (const w of b.text.split(' ')) {
        const t = cur ? cur + ' ' + w : w
        if (ctx.measureText(t).width > 150 && cur) { lines.push(cur); cur = w } else cur = t
    }
    if (cur) lines.push(cur)
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
    const bh = lines.length * 12 + 9
    const x = Math.max(4, Math.min(W - bw - 4, b.x - bw / 2))
    let y = b.y - 34 - bh
    if (y < 6) y = b.y + 24
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(248,244,230,0.93)'
    rr(ctx, x, y, bw, bh, 5); ctx.fill()
    const tx = Math.max(x + 8, Math.min(x + bw - 8, b.x))
    if (b.hues) {
        // #2599 item 1: a pair line wears the pair — the rim runs Fern-green on
        // the left half and Ivy-plum on the right, and TWO tinted tails replace
        // the single one: two voices, one line.
        ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, bw / 2 + 2, bh + 4); ctx.clip()
        ctx.strokeStyle = b.hues[0]; ctx.lineWidth = 1.5
        rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 5); ctx.stroke()
        ctx.restore()
        ctx.save(); ctx.beginPath(); ctx.rect(x + bw / 2, y - 2, bw / 2 + 2, bh + 4); ctx.clip()
        ctx.strokeStyle = b.hues[1]; ctx.lineWidth = 1.5
        rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 5); ctx.stroke()
        ctx.restore()
        ctx.fillStyle = b.hues[0]
        ctx.beginPath(); ctx.moveTo(tx - 12, y + bh - 1); ctx.lineTo(tx - 4, y + bh - 1); ctx.lineTo(tx - 8, y + bh + 6); ctx.closePath(); ctx.fill()
        ctx.fillStyle = b.hues[1]
        ctx.beginPath(); ctx.moveTo(tx + 4, y + bh - 1); ctx.lineTo(tx + 12, y + bh - 1); ctx.lineTo(tx + 8, y + bh + 6); ctx.closePath(); ctx.fill()
    } else {
        ctx.beginPath(); ctx.moveTo(tx - 4, y + bh - 1); ctx.lineTo(tx + 4, y + bh - 1); ctx.lineTo(tx, y + bh + 6); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = `rgba(122,92,44,${(0.8 * a).toFixed(3)})`; ctx.lineWidth = 1
        rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 5); ctx.stroke()
    }
    ctx.fillStyle = `rgba(60,42,23,${a.toFixed(3)})`
    lines.forEach((l, i) => ctx.fillText(l, x + bw / 2, y + 9 + i * 12 + 1))
    ctx.globalAlpha = 1
}

// -------------------------------------------------------------- thoughts ---
export function drawThoughts(ctx, s) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let y = LOT_Y + 8
    for (const th of s.thoughts) {
        const a = Math.min(1, th.t / 2)
        ctx.font = '10px monospace'
        const w = ctx.measureText(th.text).width + 14
        ctx.fillStyle = `rgba(248,244,230,${(0.88 * a).toFixed(3)})`
        rr(ctx, 12, y, Math.min(w, PANEL_X - 24), 15, 4); ctx.fill()
        ctx.fillStyle = `rgba(60,42,23,${a.toFixed(3)})`
        ctx.fillText(th.text, 19, y + 3)
        y += 19
    }
}
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

// ------------------------------------------------------ ice-cream truck (#2508 item 1) --
// The jingle finally has a body: a pastel soft-serve wagon that ROLLS in down
// the curb row and drives off when the stop is spent (the view's own state
// machine — the sim law stays untouched, the truck is draw-only, so it is
// non-solid by construction and nobody ever gets fenced in). East-facing cab:
// it arrives from the west, parks at the cone, and leaves the way the original
// does — down the street, jingle fading. `roll` > 0 while the wheels turn
// (spokes spin, parked wheels rest); parked it rides a two-frame bob.
// #2508 item 3: the eat beat — a bought cone rides in its buyer's hand for
// ICE_HOLD_T world seconds (sim.js counts; this paints; nothing else is asked).
// The curb glyph's palette at hand scale — waffle, pastel scoop, cherry — the
// last lick shrinking the scoop and one falling drop per drip tick, timed by
// the same arithmetic sim.js uses to count the drips (one law, one source).
export function drawHeldCone(ctx, x, y, hold, t, k = 1) {
    if (hold <= 0) return
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k)
    ctx.rotate(Math.sin(t * 7) * 0.06)                        // the wrist-turn of a thing being licked
    const lickK = Math.min(1, hold / 1.2)                     // the last licks take the scoop down
    ctx.fillStyle = '#b07a3f'
    ctx.beginPath(); ctx.moveTo(-2.6, 0); ctx.lineTo(2.6, 0); ctx.lineTo(0, 8.4); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#8a5c2a'; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(-1.7, 2.6); ctx.lineTo(1.7, 2.6); ctx.moveTo(-0.9, 5); ctx.lineTo(0.9, 5); ctx.stroke()
    ctx.fillStyle = '#ffe9f0'
    ctx.beginPath(); ctx.arc(0, -2.4, 3.6 * lickK, 0, 7); ctx.fill()
    ctx.fillStyle = '#ffc9dd'
    ctx.beginPath(); ctx.arc(-0.9, -3.8, 2.1 * lickK, 0, 7); ctx.fill()
    if (lickK > 0.55) {
        ctx.fillStyle = '#c94f43'
        ctx.beginPath(); ctx.arc(0, -5.6, 1.1, 0, 7); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillRect(-0.5, -6.4, 1, 1)                       // the cherry's gleam
    }
    const elapsed = ICE_HOLD_T - hold
    for (let i = 0; i < ICE_DRIPS; i++) {
        const u = elapsed - ICE_HOLD_T * (i + 1) / (ICE_DRIPS + 1)
        if (u >= 0 && u <= 0.9) {
            ctx.globalAlpha = 1 - u / 0.9
            ctx.fillStyle = '#cfe8ff'
            ctx.beginPath(); ctx.arc(0.6, 8.4 + u * 12, 1.1, 0, 7); ctx.fill()
            ctx.globalAlpha = 1
        }
    }
    ctx.restore()
}

export const TRUCK_W = 96
export function drawIceTruck(ctx, x, y, t, roll) {
    const bob = roll > 0 ? 0 : Math.sin(t * 3.5) > 0 ? 0 : -1   // parked: the engine hum lifts it a pixel
    const yy = y + bob
    ctx.fillStyle = 'rgba(30,20,10,0.16)'                       // shadow stays on the asphalt, not on the bob
    ctx.beginPath(); ctx.ellipse(x + TRUCK_W / 2, y + 44, 44, 4, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#8fdcc6'                                   // pastel mint body, white roof, pink stripe — the original's ice-cream palette
    ctx.fillRect(x + 4, yy + 12, TRUCK_W - 8, 26)
    ctx.fillStyle = '#f4f1e6'
    ctx.fillRect(x + 4, yy + 12, TRUCK_W - 8, 5)
    ctx.fillStyle = '#ffc9dd'
    ctx.fillRect(x + 4, yy + 26, TRUCK_W - 26, 4)
    ctx.fillStyle = '#bdeedd'
    ctx.fillRect(x + 62, yy + 12, 26, 15)                      // cab glass house, east end
    ctx.fillStyle = '#7a6f5d'
    ctx.fillRect(x + 66, yy + 15, 8, 9)                        // the driver, a silhouette with a cap
    ctx.fillStyle = '#e8e4d4'
    ctx.fillRect(x + 65, yy + 14, 10, 2)
    ctx.fillStyle = '#f4f1e6'                                  // serving window with a striped awning
    ctx.fillRect(x + 12, yy + 16, 20, 10)
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#ff9dbf' : '#fff'
        ctx.fillRect(x + 10 + i * 6, yy + 13, 6, 3)
    }
    ctx.fillStyle = '#fff'                                     // roof sign, and on it a tiny cone
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 24, yy + 2, 30, 10, 3) : ctx.rect(x + 24, yy + 2, 30, 10); ctx.fill()
    ctx.fillStyle = '#b07a3f'
    ctx.beginPath(); ctx.moveTo(x + 36, yy + 6); ctx.lineTo(x + 42, yy + 6); ctx.lineTo(x + 39, yy + 11); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#ffe9f0'
    ctx.beginPath(); ctx.arc(x + 39, yy + 5, 2.4, 0, 7); ctx.fill()
    ctx.fillStyle = '#c94f43'
    ctx.beginPath(); ctx.arc(x + 39, yy + 3, 1.1, 0, 7); ctx.fill()
    ctx.fillStyle = '#4a4038'                                  // wheels; spokes spin while the truck rolls
    for (const wx of [x + 22, x + 72]) {
        ctx.beginPath(); ctx.arc(wx, yy + 38, 6.5, 0, 7); ctx.fill()
        ctx.fillStyle = '#9a9ca6'
        ctx.beginPath(); ctx.arc(wx, yy + 38, 2.4, 0, 7); ctx.fill()
        if (roll > 0) {
            ctx.strokeStyle = '#d8dade'; ctx.lineWidth = 1.4
            const a = t * roll * 9
            ctx.beginPath()
            ctx.moveTo(wx - Math.cos(a) * 5, yy + 38 - Math.sin(a) * 5)
            ctx.lineTo(wx + Math.cos(a) * 5, yy + 38 + Math.sin(a) * 5)
            ctx.stroke()
        }
        ctx.fillStyle = '#4a4038'
    }
    ctx.fillStyle = '#ffd24a'
    ctx.fillRect(x + TRUCK_W - 6, yy + 30, 3, 3)              // a headlight wink at the horizon it's chasing
}

// #2508 item 5: the curb gets a crowd — one or two neighbourhood kids pad to
// the truck while it parks (The Sims, PC 2000: the young ones run out with
// money in hand when the jingle comes; ours sell the hot afternoon without
// ever touching the law). Draw-only by construction: no sim entity, no need,
// no payout, no path — the cone stays the sim's single curb citizen. Count
// and palettes are arithmetic off the day (the icePassHour doctrine: no rng
// in the view, so every seed and every replay shows the same kids). The
// crowd anchors to the truck's PARKED spot, not its live x — when the stop
// is spent the truck rolls east and the kids jog WEST home, and the diverge
// is the picture. `flee` 0..1 drives that dash and the fade into the heat.
export const crowdKids = (day) => 1 + (day % 2)   // quiet afternoon, busy Saturday-by-parity
const KID_PAL = [
    { shirt: '#ffd24a', shorts: '#7a9ec9', skin: '#e8b98a', hair: '#6b4a2b' },
    { shirt: '#a4c8f0', shorts: '#8a5c2a', skin: '#c98d5e', hair: '#3a2f26' },
    { shirt: '#ff9dbf', shorts: '#5a6b8a', skin: '#f0cfa8', hair: '#d9b23c' },
]
export function drawCurbKids(ctx, px, y, t, day, flee) {
    const n = crowdKids(day)
    for (let i = 0; i < n; i++) {
        const p = KID_PAL[(day + i * 2) % KID_PAL.length]
        const kx = px + (i ? 44 : 18) - flee * 110            // one at the counter, one a step back
        const bob = Math.abs(Math.sin(t * (4.2 + i * 1.7))) * (flee > 0 ? 2.6 : 1.6)   // the impatient hop
        const ky = y + 44 - bob                               // feet on the asphalt line the truck's shadow rides
        ctx.save()
        ctx.globalAlpha = 1 - flee * flee
        ctx.fillStyle = 'rgba(30,20,10,0.16)'
        ctx.beginPath(); ctx.ellipse(kx, y + 44, 5, 1.5, 0, 0, 7); ctx.fill()
        ctx.fillStyle = p.skin
        ctx.fillRect(kx - 1.6, ky - 6, 1.4, 6)              // legs
        ctx.fillRect(kx + 0.4, ky - 6, 1.4, 6)
        ctx.fillStyle = p.shorts
        ctx.fillRect(kx - 2.2, ky - 9.4, 4.4, 3.8)
        ctx.fillStyle = p.shirt
        ctx.fillRect(kx - 2.6, ky - 17, 5.2, 8)             // little torso
        const wave = Math.sin(t * 6 + i * 2) > 0 ? -1 : 0   // the arm pump at the counter
        ctx.fillStyle = p.skin
        ctx.fillRect(kx - 3.8, ky - 16, 1.4, 5)             // trailing arm
        ctx.fillRect(kx + 2.4, ky - 20 + wave, 1.4, 5)      // the arm raised at the serving window
        ctx.fillStyle = p.skin
        ctx.fillRect(kx - 2, ky - 21, 4, 4)                 // head — at counter height on the parked body
        ctx.fillStyle = p.hair
        ctx.fillRect(kx - 2.4, ky - 22.4, 4.8, 2)           // hair cap
        ctx.fillRect(kx - 2.4, ky - 21, 1, 2.4)             // a side tuft
        ctx.restore()
    }
}

// --------------------------------------------------------------- atmo -----
export function drawClouds(ctx, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    for (let i = 0; i < 3; i++) {
        const cx = ((t * 6 + i * 230) % (W + 120)) - 60
        const cy = 70 + i * 120
        ctx.beginPath(); ctx.ellipse(cx, cy, 34, 12, 0, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx + 22, cy + 4, 22, 9, 0, 0, 7); ctx.fill()
    }
}

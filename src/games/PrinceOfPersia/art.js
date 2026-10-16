// PRINCE OF PERSIA — every pixel generated in code (Stage 2: the look and the
// animation). Blue-grey cut stone with mortar grain; floors read as ledges with
// a lit top and a dark front face; torches flicker and tint the wall warm, and
// rooms without one sink into shadow; palace levels are pale stone with pillars,
// arched windows and tapestries. The prince is most of a floor tall, driven by
// a pose table: an 8-frame run on two-segment legs with real knee bends, plus
// separate start / skid / turn / jump-crouch / land / hang / climb / careful /
// drink / draw / sheathe poses. Deaths carry weight per cause — impaled bodies
// stay on the spikes, jaws slice, long falls crumple, the sword cuts you down.
// Guards rank at a glance: turban colour by skill, the fat guard's wide frame,
// the skeleton all bone, Jaffar in robes and a tall hat. No assets, no random.

import { RW, H, T, GROUND, SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, DROP, EXITPLATE, TORCH, EXIT, SWORD, POTION, MIRROR, BRIDGE } from './levels.js'
import { CFG, chompDown, clockText, GUARD_STYLE } from './sim.js'

export const VW = RW * T
export const VH = H * T

// per-guard look: turban, tunic, trim, skin, sword metal — colour by skill.
export const PALETTES = {
    green: { turban: '#2e6b46', cloth: '#2a5038', trim: '#70a080', skin: '#c89878', sword: '#c8ccd8' },
    red: { turban: '#a82828', cloth: '#7a2020', trim: '#d06050', skin: '#c0906c', sword: '#d8dce8' },
    fat: { turban: '#8a5a2a', cloth: '#6a4420', trim: '#d0a860', skin: '#d8a880', sword: '#dce2ee', wide: 1.55 },
    fibula: { cloth: '#8a5a2a', trim: '#d0a860', skin: '#d8a880', sword: '#dce2ee' },
    skeleton: { cloth: '#c9c9bb', trim: '#9a9a8c', skin: '#eceada', sword: '#b0b8c8', bone: true },
    shadow: { cloth: '#16161f', trim: '#3a3a4e', skin: '#5a5a6a', sword: '#525a6a' },
    jaffar: { turban: '#3a1050', cloth: '#5a1f72', trim: '#d24ad2', skin: '#c89878', sword: '#e0d0ff', robe: true, hat: true },
}
export const guardLook = (type, boss) => PALETTES[type] || PALETTES[boss ? 'jaffar' : 'green'] || PALETTES.green

// Stage 7: the door-frame silhouette. An escort still in the next room reads
// as a dark shape in the arch at the screen edge — you see it coming through
// the doorway a beat before its feet reach your floor. Pure function of the
// sim state (same state, same answer — the harness pins it).
export const DOOR_ZONE = 3
export function escortSilhouettes(g) {
    const out = []
    const c0 = g.room * RW
    const left = c0, right = c0 + RW - 1
    for (const gd of g.guards) {
        if (gd.dead || !gd.follow || Math.floor(gd.y / T) !== GROUND) continue
        const col = Math.floor(gd.x / T)
        if (col < c0 && col >= c0 - DOOR_ZONE) out.push({ id: gd.id, doorCol: left, side: -1, type: gd.type, boss: !!gd.boss })
        else if (col > right && col <= right + DOOR_ZONE) out.push({ id: gd.id, doorCol: right, side: 1, type: gd.type, boss: !!gd.boss })
    }
    return out
}

const hash = (n) => {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
}
const shade = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40)
    return `rgb(${r},${g},${b})`
}
// per-channel mix toward a second colour — lets stone get *warmer* on the lit
// side and *cooler* in shadow, not just lighter/darker (Stage 6: deeper colour)
const mix = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t)
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t)
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t)
    return `rgb(${r},${g},${bl})`
}
// a lit bevel along the top/left and a shadow bevel along the bottom/right —
// the cheap trick that makes a flat fill read as a cut block catching light.
function bevel(ctx, x, y, w, h, light, dark) {
    ctx.fillStyle = light
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h)
    ctx.fillStyle = dark
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h)
}
// deterministic speckle — mineral grain, so stone never reads as a flat fill
function grain(ctx, x, y, w, h, seed, n) {
    for (let i = 0; i < n; i++) {
        const px = x + Math.floor(hash(seed * 3.1 + i * 7.7) * (w - 1))
        const py = y + Math.floor(hash(seed * 5.3 + i * 13.1) * (h - 1))
        ctx.fillStyle = hash(seed + i * 2.9) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
        ctx.fillRect(px, py, 2, 1)
    }
}
// one cut brick: jittered chromatic tone, a directional key gradient, grain, a
// bevel, and an occasional hairline crack. The lit corner warms, the far corner
// cools — so a wall of these never reads as one flat grey field.
function brickFace(ctx, x, y, w, h, seed, base) {
    const warmSide = hash(seed * 1.3) > 0.42
    ctx.fillStyle = mix(base, warmSide ? '#6c5c74' : '#2b3150', 0.16 + hash(seed * 2.7) * 0.14)
    ctx.fillRect(x, y, w, h)
    const dir = ctx.createLinearGradient(x, y, x + w, y + h)
    dir.addColorStop(0, 'rgba(255,232,192,0.10)')
    dir.addColorStop(1, 'rgba(8,8,26,0.20)')
    ctx.fillStyle = dir
    ctx.fillRect(x, y, w, h)
    grain(ctx, x, y, w, h, seed, Math.max(4, Math.floor((w * h) / 60)))
    bevel(ctx, x, y, w, h, 'rgba(255,244,214,0.16)', 'rgba(0,0,14,0.32)')
    if (hash(seed * 1.7) > 0.8 && h > 8) {
        ctx.strokeStyle = 'rgba(0,0,0,0.30)'
        ctx.lineWidth = 1
        ctx.beginPath()
        const cx = x + 2 + Math.floor(hash(seed * 2.3) * Math.max(1, w - 5))
        ctx.moveTo(cx, y + 1)
        ctx.lineTo(cx + Math.round(hash(seed * 4.1) * 4 - 2), y + h - 1)
        ctx.stroke()
    }
}

// ---- Stage 6: the light model (pure, so popcheck can pin it) ----------------
// One fixed key light (upper-left) gives every surface the same direction to lean
// toward. On top of it, each wall torch throws a warm pool whose pull falls off
// smoothly to nothing at TORCH_RADIUS. The room's brightness at any point is the
// ambient plus whichever pools reach it — never a flat wash — so light pools
// around sconces and sinks into shadow at the edges and corners.
export const LIGHT_DIR = { x: -0.55, y: -0.82 }        // key direction (points up-left)
export const LIGHT_AMBIENT = 0.18                       // an unlit corner stays dark, not black
export const TORCH_RADIUS = 176                         // px: a sconce's warm reach

export function torchGlow(distPx) {
    if (distPx >= TORCH_RADIUS) return 0
    const t = 1 - distPx / TORCH_RADIUS
    return t * t * (3 - 2 * t)                          // smoothstep: firm core, soft edge
}
// brightness at pixel (x,y) from the given torch pixel-centres [ [x,y], … ].
// `amb` lets a small/dim screen (lite mode) lift the floor so a torchless room
// stays readable; the deep desktop mood keeps LIGHT_AMBIENT.
export function lightAt(x, y, keyPx, amb = LIGHT_AMBIENT, moonPx = []) {
    let l = amb
    for (let i = 0; i < keyPx.length; i++) {
        const dx = x - keyPx[i][0], dy = y - keyPx[i][1]
        l += torchGlow(Math.sqrt(dx * dx + dy * dy))
    }
    for (let i = 0; i < moonPx.length; i++) {
        const dx = x - moonPx[i][0], dy = y - moonPx[i][1]
        l += MOON_STRENGTH * coolGlow(Math.sqrt(dx * dx + dy * dy))
    }
    return l > 1 ? 1 : l
}
// how much darkness veil to lay at (x,y) — the inverse of the pools, capped so
// unlit stone reads deep blue rather than pure black
export function darkAlpha(x, y, keyPx, amb = LIGHT_AMBIENT) {
    const a = 0.66 * (1 - lightAt(x, y, keyPx, amb))
    return a < 0 ? 0 : a > 0.66 ? 0.66 : a
}
// directional shading of a surface whose outward normal is (nx,ny): + faces the
// key, − faces away. This is what makes brick, pillar and shoulder read 3-D.
export function facet(nx, ny) {
    const m = Math.hypot(nx, ny) || 1
    return (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y) / m
}

// ---- Stage 8: colour temperature, floor bounce, phone readability ------------
// Stage 6 lit the room by *brightness*; Stage 8 separates how much light lands
// somewhere from how *warm* it is. Where a flame reaches, light is amber; where
// only ambient does, it is cold violet-blue. That warm-fire / cool-dark split is
// the next step on the colour spine and it is pure, so popcheck can pin it.
export const LIGHT_AMBIENT_LITE = 0.27          // the floor a phone screen gets
export const HUD_LINE = 22                      // px: the band the HUD text lives in

// the flame's own contribution at (x,y), independent of ambient — the numerator
// of the colour temperature and the pulse the pools breathe with.
export function torchSum(x, y, keyPx) {
    let s = 0
    for (let i = 0; i < keyPx.length; i++) {
        const dx = x - keyPx[i][0], dy = y - keyPx[i][1]
        s += torchGlow(Math.sqrt(dx * dx + dy * dy))
    }
    return s
}
// colour temperature 0 (cold ambient) → 1 (deep in a flame pool): the flame's
// share of the light, so two distant sconces read cooler than one you stand in.
export function tempAt(x, y, keyPx, amb = LIGHT_AMBIENT, moonPx = []) {
    const s = torchSum(x, y, keyPx)
    return s / (s + amb + MOON_DILUTE * MOON_STRENGTH * coolAt(x, y, moonPx))
}
// warm bounce thrown back off the flagstones by the sconces overhead: a 1-D pull
// on horizontal distance, so the floor directly under a torch glows and grounds
// the flame rather than floating on a flat dark band.
export function bounceAt(x, keyPx) {
    let s = 0
    for (let i = 0; i < keyPx.length; i++) {
        const dx = Math.abs(x - keyPx[i][0])
        const t = 1 - dx / (TORCH_RADIUS * 0.9)
        if (t > 0) s += t * t * (3 - 2 * t)
    }
    return s > 1 ? 1 : s
}
// the additive bloom must not wash out the HUD text: pools fade to nothing by the
// top of the band, so `poolVisibleAt` gates how much of a pool paints at a y.
export function poolVisibleAt(y) {
    if (y >= HUD_LINE) return 1
    if (y <= 0) return 0.1
    return 0.1 + (y / HUD_LINE) * 0.9
}
// lite mode lifts the ambient floor only, never the pools — mood on desktop,
// readability on a small dim phone.
export const ambientFor = (lite) => (lite ? LIGHT_AMBIENT_LITE : LIGHT_AMBIENT)

// ---- Stage 9: moonlight as a cool key, stone-band bounce, rim hue, prop light --
// Stage 8 split warm-fire from cool-dark by hue. Stage 9 makes the *source* of the
// cool light explicit: arched palace windows throw a cold key, so the palace reads
// moonlit while the dungeon reads firelit. A flame and a window are both "light", but
// only the flame is warm — so cool light dilutes warmth in tempAt (as ambient does)
// and brightens in lightAt, without ever heating a surface. All pure + exported.
export const MOON_RADIUS = TORCH_RADIUS * 1.15   // px: a window's wider, colder reach
export const MOON_STRENGTH = 0.7                 // a window is a soft key, never a flare
// the cool twin of torchGlow: firm core, smoothstep edge, but cold.
export function coolGlow(distPx) {
    if (distPx >= MOON_RADIUS) return 0
    const t = 1 - distPx / MOON_RADIUS
    return t * t * (3 - 2 * t)
}
// how much moonlight lands at (x,y) from the given window pixel-centres.
export function coolAt(x, y, moonPx) {
    let s = 0
    for (let i = 0; i < moonPx.length; i++) {
        const dx = x - moonPx[i][0], dy = y - moonPx[i][1]
        s += coolGlow(Math.sqrt(dx * dx + dy * dy))
    }
    return s > 1 ? 1 : s
}
// arched windows in a palace deco band, as cool key sources (pixel-centres of the
// panes the moon shines through). Pure function of the deco + the band's first col.
export function moonSources(decos, base) {
    const out = []
    for (let rm = 0; rm < (decos || []).length; rm++) {
        const d = decos[rm]
        if (d && d.window != null) {
            const px = base + rm * RW * T + d.window * T + 16
            out.push([px, paneKeyY(d), hash(Math.round((px - 16) / T) * 2.7 + 5)])
        }
    }
    return out
}
// rim hue of a lit figure by colour temperature: the cool end is pushed toward
// violet (b > r > g), the warm end to amber-white — a wider split than Stage 8 so
// warm/cool reads at arm's length. Rim-only, so a white tunic never muddies.
export function rimColor(temp) {
    const t = temp < 0 ? 0 : temp > 1 ? 1 : temp
    return {
        r: Math.round(150 + t * 105),
        g: Math.round(120 + t * 50),
        b: Math.round(240 - t * 148),
    }
}
// the warm bounce quantised to the flagstone the point stands on, so the lit floor
// breaks into per-tile highlights (stone) instead of one soft glow blob.
export function bandAt(x, keyPx, tile = T) {
    const cx = Math.floor(x / tile) * tile + tile / 2
    return bounceAt(cx, keyPx)
}
// how bright a prop reads in a given light — a floor that keeps unlit props visible
// but lets lit ones catch the flame. Bounded so a flask never blows out.
export function propShade(warm) {
    return 0.55 + warm * 0.45
}

// ---- Stage 10: warm-dominant overlap, seeded sky, cool shafts, stepped lips -----
// Stage 9 made cool light a second source; Stage 10 makes the two sources *interact*
// like real light (QA #341). A body caught between a torch and a window greyed out,
// every window was the same violet, the moon threw no shaft onto the floor, lit steps
// read as a flat band, and the violet rim could tint bone. Each fix is pure + pinned.
//
// Warm dominance: moonlight still dilutes warmth (the S9 proof stands) but *softly*,
// so the flame-adjacent side of a body near both sources stays amber instead of
// pulling to neutral grey. MOON_DILUTE<1 thins the cool term in the temperature
// denominator; the default-empty-moon path is untouched, so every S8/S9 value holds.
export const MOON_DILUTE = 0.55                  // how hard cool light cools warmth (<1 = soft)
// a per-window sky, deterministic from the window's column: a cool key shifting from
// deep indigo to pale moon-blue that breathes its own intensity — a palace with a
// sky, not a stencil. Blue stays dominant so it never reads warm. Same seed → tint.
export function moonTint(seed) {
    const s = seed - Math.floor(seed)
    return {
        r: Math.round(120 + s * 70),
        g: Math.round(150 + s * 40),
        b: 255,
        s: 0.78 + s * 0.22,
    }
}
// the moon's cool bounce off the flagstones under a window — the shaft's foot,
// quantised to the tile so the cool floor breaks into stone like the warm band.
export function coolBandAt(x, moonPx, tile = T) {
    const cx = Math.floor(x / tile) * tile + tile / 2
    let s = 0
    for (let i = 0; i < moonPx.length; i++) {
        const dx = Math.abs(cx - moonPx[i][0])
        const t = 1 - dx / (MOON_RADIUS * 0.7)
        if (t > 0) s += t * t * (3 - 2 * t)
    }
    return s > 1 ? 1 : s
}
// how strongly the rim light may tint a figure: bone and the prince's pale tunic sit
// at temp 0 in dark corners where the rim hue is violet — damp the rim on pale
// palettes so skeleton and tunic stay bone-white, never purple. Non-pale is unchanged
// (identical to the Stage 8/9 inline alpha), so the clothed cast is byte-for-byte.
export function rimAlpha(pale, warm, temp = 0) {
    const base = 0.12 + warm * 0.22
    // the pale damp only holds in the dark; deep in a flame pool (high temp) the
    // amber is strong enough to read on bone/tunic, so the damp releases with the
    // colour temperature — a tunic under a torch still catches amber (#343-7).
    const damp = 0.32 + Math.min(0.55, Math.max(0, temp) * 0.55)
    const a = pale ? base * damp : base
    return Math.round(a * 1000) / 1000
}

// ---- Stage 11: the palace breathes — temporal sky, shaft motes, arch veil ------
// Stage 10 gave every window its own frozen sky. Stage 11 sets that sky in slow
// motion and lets the moon shaft carry dust, so a palace level is alive rather than
// a still frame (QA #343-4/5). It also stops the mirror's light veil from boxing
// past its arched glass (#343-1), gives props the same two-source rim the bodies
// get (#343-6), and derives the window's key height from the deco instead of baking
// y=60 (#343-2). All pure + exported, deterministic — sin-hash only, no randomness.
//
// A window's key height is derived from its deco row, not hard-wired: a level that
// raises or drops a pane moves the cool key with it so the shaft stays lit.
export const WINDOW_ROW_PX = T                   // one floor step a pane can be raised/dropped
export function paneKeyY(d) {
    return 60 + (d && d.windowRow ? d.windowRow * WINDOW_ROW_PX : 0)
}
// the vertical offset of a pane from the canonical row, shared by the wall paint and
// the cool key so the drawn window and the light it throws never disagree.
export const paneShift = (d) => paneKeyY(d) - 60

// a slow cloud crossing a pane: a fractional position across the sky that wraps,
// with a soft density that is 0 at the edges and peaks mid-crossing — a cloud
// passes, then clear sky again. Deterministic in tick + seed (#343-4).
export const SKY_DRIFT = 0.0007                 // pane-widths per tick: barely perceptible
export function cloudCross(tick, seed = 0) {
    let p = (tick * SKY_DRIFT + seed * 0.37) % 1
    if (p < 0) p += 1
    return Math.sin(p * Math.PI)                 // 0 → 1 → 0 across one crossing
}
// a fixed star field inside one pane (fractional coords), each with its own twinkle
// phase. Positions are hash-pinned to the seed, so the same window keeps its stars.
export function starField(seed = 0, n = 4) {
    const out = []
    for (let i = 0; i < n; i++) {
        out.push({
            fx: 0.12 + hash(seed * 4.7 + i * 1.9) * 0.76,
            fy: 0.10 + hash(seed * 7.3 + i * 3.1) * 0.55,
            ph: hash(seed * 2.9 + i * 5.7),
        })
    }
    return out
}
// a star's twinkle: never fully dark, a soft pulse, so the sky shimmers, not strobes.
export function skyTwinkle(tick, ph = 0) {
    return 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(tick * 0.05 + ph * Math.PI * 2))
}
// dust motes drifting down the moon shaft: slow, seeded, fading as they near the
// floor. Returns lateral offset (px), fractional height down the shaft, and alpha.
export const SHAFT_MOTES = 5                    // motes per window shaft
export function shaftMotes(tick, seed = 0, count = SHAFT_MOTES) {
    const out = []
    for (let i = 0; i < count; i++) {
        const base = hash(seed * 3.7 + i * 8.3)
        const y = (base + tick * 0.0016 + hash(seed + i) * 0.3) % 1   // slow fall, wraps
        const a = Math.sin(y * Math.PI)                                  // soft in and out
        out.push({
            dx: (hash(seed * 5.1 + i * 2.7) - 0.5) * 24,               // shaft half-width
            y,
            a: a * (0.4 + hash(seed * 1.7 + i * 6.1) * 0.4),
        })
    }
    return out
}
// trace the arched silhouette of a prop (rounded top over straight jambs) so a light
// veil clipped to it follows the glass instead of boxing onto the frame (#343-1).
export function archPath(ctx, x, base, w, h) {
    ctx.beginPath()
    ctx.moveTo(x - w, base)
    ctx.lineTo(x - w, base - h + w)
    ctx.arc(x, base - h + w, w, Math.PI, 0)
    ctx.lineTo(x + w, base)
    ctx.closePath()
}

// ---- pose tables --------------------------------------------------------------
// One frame = joint targets, angles measured from straight-down, + toward the
// facing direction. Legs are two-segment: thigh (t) + knee bend (k). The run
// table is a full 8-frame cycle; guards and the prince share the vocabulary.
const RUN_T = [0.55, 0.38, 0.05, -0.28, -0.52, -0.30, 0.06, 0.34]
const RUN_K = [0.08, 0.12, 0.42, 0.95, 1.15, 0.65, 0.18, 0.05]
const ARM_R = [-0.42, -0.25, 0.0, 0.28, 0.42, 0.25, 0.0, -0.28]
const runFrame = (k, sp) => ({
    lean: 0.12 * sp, bob: -Math.abs(Math.sin(k / 8 * Math.PI * 2)) * (sp > 0.6 ? 3 : 1.5),
    hip: 26 - (sp > 0.6 ? 1.5 : 0), tA: RUN_T[k] * sp, kA: RUN_K[k] * sp,
    tB: RUN_T[(k + 4) % 8] * sp, kB: RUN_K[(k + 4) % 8] * sp, armB: ARM_R[k] * sp,
})

export const POSES = {
    idle: [{ lean: 0, bob: 0, hip: 26, tA: 0.10, kA: 0.05, tB: -0.10, kB: 0.05, armB: -0.25 }],
    walk: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => runFrame(k, 0.55)),
    run: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => runFrame(k, 1)),
    careful: [
        { lean: 0.1, bob: 0, hip: 24, tA: 0.42, kA: 0.22, tB: -0.05, kB: 0.10, armB: -0.6 },
        { lean: 0.12, bob: -1, hip: 23, tA: 0.5, kA: 0.3, tB: 0.1, kB: 0.25, armB: -0.85 },
        { lean: 0.1, bob: 0, hip: 24, tA: 0.05, kA: 0.15, tB: -0.3, kB: 0.5, armB: -0.7 },
        { lean: 0.08, bob: -1, hip: 23, tA: 0.2, kA: 0.35, tB: -0.1, kB: 0.2, armB: -0.95 },
    ],
    start: [
        { lean: 0.22, bob: 0, hip: 25, tA: 0.15, kA: 0.2, tB: -0.35, kB: 0.55, armB: -0.1 },
        { lean: 0.26, bob: -1, hip: 24, tA: 0.45, kA: 0.3, tB: -0.5, kB: 0.7, armB: 0.15 },
        { lean: 0.18, bob: 0, hip: 25, tA: 0.55, kA: 0.15, tB: -0.3, kB: 0.4, armB: 0.3 },
    ],
    skid: [
        { lean: -0.26, bob: 0, hip: 25, tA: 0.42, kA: 0.15, tB: -0.5, kB: 0.75, armB: 0.5 },
        { lean: -0.2, bob: -1, hip: 24, tA: 0.3, kA: 0.1, tB: -0.4, kB: 0.6, armB: 0.4 },
    ],
    turn: [
        { lean: -0.08, bob: -1, hip: 25, tA: 0.15, kA: 0.25, tB: -0.15, kB: 0.25, armB: 0.1 },
        { lean: 0.06, bob: 0, hip: 24, tA: 0.25, kA: 0.3, tB: -0.2, kB: 0.3, armB: -0.15 },
    ],
    crouch: [{ lean: 0.1, bob: 0, hip: 15, tA: 0.3, kA: 1.15, tB: -0.3, kB: 1.15, armB: -0.15 }],
    jump: [
        { lean: 0.12, bob: -2, hip: 18, tA: 0.3, kA: 1.25, tB: -0.35, kB: 1.1, armB: 0.55 },
        { lean: 0.1, bob: 0, hip: 24, tA: 0.4, kA: 0.7, tB: -0.45, kB: 0.85, armB: 0.45 },
    ],
    fall: [{ lean: 0.06, bob: 0, hip: 24, tA: 0.28, kA: 0.5, tB: -0.32, kB: 0.7, armB: 0.75 }],
    land: [
        { lean: 0.16, bob: 2, hip: 17, tA: 0.34, kA: 1.05, tB: -0.34, kB: 1.0, armB: 0.3 },
        { lean: 0.08, bob: 0, hip: 22, tA: 0.2, kA: 0.5, tB: -0.22, kB: 0.45, armB: 0.1 },
    ],
    hang: [
        { lean: -0.05, bob: 0, hip: 14, tA: 0.3, kA: 0.45, tB: -0.12, kB: 0.3, armB: -0.25 },
        { lean: 0.04, bob: 1.5, hip: 12, tA: 0.22, kA: 0.5, tB: -0.2, kB: 0.35, armB: -0.18 },
    ],
    climb: [
        { lean: 0.2, bob: 0, hip: 14, tA: 0.5, kA: 1.2, tB: -0.2, kB: 0.9, armB: -0.5 },
        { lean: 0.3, bob: -3, hip: 12, tA: 0.7, kA: 1.35, tB: 0.1, kB: 1.0, armB: -0.75 },
        { lean: 0.22, bob: -6, hip: 11, tA: 0.4, kA: 1.1, tB: -0.3, kB: 0.8, armB: -0.6 },
        { lean: 0.12, bob: -9, hip: 16, tA: 0.2, kA: 0.7, tB: -0.4, kB: 0.6, armB: -0.35 },
    ],
    shimmy: [
        { lean: -0.02, bob: 0, hip: 13, tA: 0.35, kA: 0.5, tB: -0.15, kB: 0.35, armB: -0.2 },
        { lean: 0.05, bob: 1, hip: 12, tA: 0.2, kA: 0.4, tB: -0.25, kB: 0.45, armB: -0.3 },
    ],
    block: [{ lean: -0.06, bob: 0, hip: 24, tA: 0.18, kA: 0.25, tB: -0.22, kB: 0.35, armB: -1.3 }],
    ready: [{ lean: 0.04, bob: 0, hip: 25, tA: 0.2, kA: 0.2, tB: -0.24, kB: 0.3, armB: -0.55 }],
    windup: [{ lean: -0.22, bob: -1, hip: 25, tA: 0.12, kA: 0.2, tB: -0.3, kB: 0.4, armB: -1.9 }],
    strike: [
        { lean: 0.1, bob: 0, hip: 24, tA: 0.25, kA: 0.2, tB: -0.35, kB: 0.4, armB: -1.2 },
        { lean: 0.34, bob: 0, hip: 23, tA: 0.5, kA: 0.15, tB: -0.5, kB: 0.5, armB: 0.35 },
        { lean: 0.24, bob: 0, hip: 24, tA: 0.4, kA: 0.2, tB: -0.42, kB: 0.45, armB: 0.15 },
    ],
    recoil: [{ lean: -0.3, bob: 1, hip: 25, tA: 0.1, kA: 0.3, tB: -0.4, kB: 0.6, armB: 0.8 }],
    attack: [
        { lean: -0.12, bob: 0, hip: 25, tA: 0.15, kA: 0.2, tB: -0.3, kB: 0.4, armB: -1.05 },
        { lean: 0.3, bob: 0, hip: 23, tA: 0.55, kA: 0.15, tB: -0.55, kB: 0.55, armB: 0.45 },
        { lean: 0.22, bob: 0, hip: 24, tA: 0.42, kA: 0.2, tB: -0.44, kB: 0.45, armB: 0.2 },
        { lean: 0.08, bob: 0, hip: 25, tA: 0.22, kA: 0.2, tB: -0.26, kB: 0.3, armB: -0.2 },
    ],
    drink: [
        { lean: -0.1, bob: 0, hip: 25, tA: 0.12, kA: 0.15, tB: -0.16, kB: 0.2, armB: -0.3 },
        { lean: -0.22, bob: 0, hip: 25, tA: 0.1, kA: 0.12, tB: -0.14, kB: 0.18, armB: -0.2 },
        { lean: 0.08, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.18, kB: 0.22, armB: -0.5 },
    ],
    draw: [
        { lean: -0.12, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.2, kB: 0.25, armB: 0.9 },
        { lean: 0.05, bob: 0, hip: 25, tA: 0.18, kA: 0.2, tB: -0.22, kB: 0.3, armB: -0.6 },
    ],
    sheathe: [
        { lean: 0.05, bob: 0, hip: 25, tA: 0.16, kA: 0.2, tB: -0.2, kB: 0.25, armB: -0.4 },
        { lean: -0.08, bob: 0, hip: 25, tA: 0.14, kA: 0.18, tB: -0.18, kB: 0.22, armB: 0.75 },
    ],
    // --- deaths, one per cause (weight, not a generic topple) --------------
    die_impale: [
        { lean: 0.9, bob: -7, hip: 20, tA: 0.25, kA: 0.55, tB: -0.1, kB: 0.45, armB: 0.95 },
        { lean: 1.05, bob: -6, hip: 19, tA: 0.3, kA: 0.6, tB: -0.05, kB: 0.5, armB: 1.05 },
        { lean: 1.0, bob: -6.5, hip: 19, tA: 0.28, kA: 0.58, tB: -0.08, kB: 0.48, armB: 1.0 },
    ],
    die_slice: [
        { lean: 0.18, bob: 0, hip: 22, tA: 0.55, kA: 0.3, tB: -0.55, kB: 0.3, armB: 0.6 },
        { lean: 0.3, bob: 1, hip: 20, tA: 0.7, kA: 0.4, tB: -0.7, kB: 0.4, armB: 0.8 },
    ],
    die_crumple: [
        { lean: 0.5, bob: 1, hip: 16, tA: 0.6, kA: 1.2, tB: -0.3, kB: 1.0, armB: 0.5 },
        { lean: 0.85, bob: 3, hip: 8, tA: 0.95, kA: 1.5, tB: 0.2, kB: 1.2, armB: 1.1 },
        { lean: 0.95, bob: 4, hip: 6, tA: 1.05, kA: 1.55, tB: 0.35, kB: 1.25, armB: 1.3 },
    ],
    die_cut: [
        { lean: -0.25, bob: 0, hip: 14, tA: 0.35, kA: 1.2, tB: -0.25, kB: 1.15, armB: 0.6 },
        { lean: -0.8, bob: 2, hip: 9, tA: 0.5, kA: 1.3, tB: -0.1, kB: 1.1, armB: 1.0 },
        { lean: -1.25, bob: 3, hip: 6, tA: 0.6, kA: 1.3, tB: 0.1, kB: 1.1, armB: 1.25 },
    ],
    die_poison: [
        { lean: -0.15, bob: 0, hip: 20, tA: 0.2, kA: 0.8, tB: -0.25, kB: 0.7, armB: 1.35 },
        { lean: -0.4, bob: 2, hip: 12, tA: 0.4, kA: 1.3, tB: -0.2, kB: 1.1, armB: 1.5 },
        { lean: -0.55, bob: 3, hip: 8, tA: 0.5, kA: 1.4, tB: -0.1, kB: 1.15, armB: 1.55 },
    ],
    die_shadow: [
        { lean: 0.1, bob: 0, hip: 22, tA: 0.3, kA: 0.6, tB: -0.3, kB: 0.55, armB: 0.7 },
        { lean: 0.3, bob: 2, hip: 14, tA: 0.55, kA: 1.1, tB: -0.2, kB: 0.9, armB: 1.0 },
        { lean: 0.5, bob: 4, hip: 7, tA: 0.8, kA: 1.4, tB: 0.1, kB: 1.2, armB: 1.3 },
    ],
}
export const RUN_FRAMES = POSES.run.length
export const DEATH_ANIMS = { spikes: 'die_impale', chomper: 'die_slice', fall: 'die_crumple', sword: 'die_cut', poison: 'die_poison', shadow: 'die_shadow' }

export function poseOf(name, k = 0) {
    const list = POSES[name] || POSES.idle
    return list[((k % list.length) + list.length) % list.length]
}

// ---- tiles --------------------------------------------------------------------
function floorLedge(ctx, x, y, top, front, crack, seed) {
    // a lit wearing-surface, a shaded front face hung below it, and a cast
    // shadow the lip throws onto the wall behind — this is what reads as depth.
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(x + 1, y + 4, T, 3)
    brickFace(ctx, x, y, T, 4, seed || 1, top)
    const face = ctx.createLinearGradient(0, y + 4, 0, y + T)
    face.addColorStop(0, mix(front, '#6a5a72', 0.18))
    face.addColorStop(1, mix(front, '#141428', 0.22))
    ctx.fillStyle = face
    ctx.fillRect(x, y + 4, T, T - 4)
    grain(ctx, x, y + 5, T, T - 5, (seed || 1) * 7.3, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(x, y + 4, T, 3)
    ctx.fillStyle = 'rgba(255,236,200,0.08)'
    ctx.fillRect(x, y + T - 1, T, 1)
    if (crack) {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + 13, y + 12)
        ctx.moveTo(x + 21, y + 3); ctx.lineTo(x + 17, y + 13)
        ctx.stroke()
    }
}

function stone(ctx, c, r, code, g) {
    const x = c * T, y = r * T
    const seed = c * 31 + r * 7
    if (code === SOLID) {
        // running-bond masonry: a cool violet-blue mortar bed, alternately offset
        // perpends each chromatically jittered, bevelled and grained, and a lit top
        // course — the wall catches the key light along its joints. No flat fields.
        ctx.fillStyle = '#181830'
        ctx.fillRect(x, y, T, T)
        ctx.fillStyle = 'rgba(120,120,170,0.10)'
        ctx.fillRect(x, y, T, 1)
        const off = (r & 1) ? Math.floor(T / 2) : 0
        brickFace(ctx, x + 1, y + 1, off ? off - 2 : T - 2, T - 3, seed + 1, '#3e3e58')
        if (off) brickFace(ctx, x + off + 1, y + 1, T - off - 2, T - 3, seed + 2, '#3e3e58')
    } else if (code === PLATFORM) {
        floorLedge(ctx, x, y, '#73738f', '#484862', false, seed)
    } else if (code === LOOSE) {
        floorLedge(ctx, x, y, '#82705a', '#574734', true, seed)
    } else if (code === SPIKE) {
        ctx.fillStyle = '#12121f'
        ctx.fillRect(x, y + T - 6, T, 6)
        grain(ctx, x, y + T - 6, T, 6, seed, 4)
        for (let i = 0; i < 4; i++) {
            const sx = x + 2 + i * 8
            ctx.fillStyle = '#59606e'
            ctx.beginPath()
            ctx.moveTo(sx, y + T - 5); ctx.lineTo(sx + 3, y + T - 23); ctx.lineTo(sx + 6, y + T - 5)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#d6dcea'
            ctx.beginPath()
            ctx.moveTo(sx + 1, y + T - 5); ctx.lineTo(sx + 3, y + T - 22); ctx.lineTo(sx + 3, y + T - 5)
            ctx.closePath(); ctx.fill()
        }
    } else if (code === RAISE) {
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 3, y + T - 10, T - 6, 10)
        bevel(ctx, x + 3, y + T - 10, T - 6, 10, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.30)')
        ctx.fillStyle = '#e8b04a'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 4)
        ctx.fillStyle = '#fff0b0'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 1)
    } else if (code === DROP) {
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 3, y + T - 10, T - 6, 10)
        bevel(ctx, x + 3, y + T - 10, T - 6, 10, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.30)')
        ctx.fillStyle = '#c04040'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 4)
        ctx.fillStyle = '#ff9090'
        ctx.fillRect(x + 6, y + T - 9, T - 12, 1)
    } else if (code === EXITPLATE) {
        const pressed = g.exitOpen
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(x + 2, y + T - 8, T - 4, 8)
        bevel(ctx, x + 2, y + T - 8, T - 4, 8, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.30)')
        ctx.fillStyle = pressed ? '#e8d060' : '#8a8aa0'
        ctx.fillRect(x + 5, y + T - (pressed ? 4 : 7), T - 10, 3)
        if (pressed) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(x + 5, y + T - 4, T - 10, 1) }
    } else if (code === EXIT) {
        ctx.fillStyle = '#12121c'
        ctx.fillRect(x + 2, y - T, T - 4, T * 2)
        const door = g.exitOpen ? '#e8d060' : '#4a3a22'
        ctx.fillStyle = door
        ctx.fillRect(x + 4, y - T + 4, T - 8, T * 2 - 6)
        ctx.fillStyle = 'rgba(0,0,0,0.30)'
        ctx.fillRect(x + 4 + (T - 8) / 2 - 1, y - T + 4, 2, T * 2 - 6)
        ctx.fillStyle = g.exitOpen ? '#fff0b0' : '#6a5230'
        ctx.fillRect(x + 4, y - T + 4, T - 8, 2)
        if (g.exitOpen) {
            ctx.fillStyle = 'rgba(255,220,120,0.25)'
            ctx.fillRect(x + 4, y - T + 4, T - 8, T * 2 - 6)
        }
        ctx.fillStyle = '#2e2e42'
        ctx.fillRect(x + 2, y - T, T - 4, 4)
        ctx.fillStyle = '#545468'
        ctx.fillRect(x + 2, y - T, T - 4, 1)
    }
}

// ---- palace dressing: courses of pale stone, light, pillars, arched windows --
function palaceWall(ctx, c0, decos, tick) {
    for (let rm = 0; rm < decos.length; rm++) {
        const base = (c0 / RW + rm) * RW * T
        const d = decos[rm]
        // pale ashlar wall with mortar coursing and per-block tone, cool at the
        // top warming toward the floor
        const wallGrad = ctx.createLinearGradient(0, 24, 0, VH)
        wallGrad.addColorStop(0, '#7c8178')
        wallGrad.addColorStop(1, '#a49a80')
        ctx.fillStyle = wallGrad
        ctx.fillRect(base, 24, RW * T, VH - 24)
        for (let ry = 24; ry < VH - 12; ry += 16) {
            ctx.fillStyle = 'rgba(0,0,0,0.16)'
            ctx.fillRect(base, ry, RW * T, 1)
            ctx.fillStyle = 'rgba(255,255,255,0.10)'
            ctx.fillRect(base, ry + 1, RW * T, 1)
            const jog = (((ry - 24) / 16) | 0) & 1
            for (let bx = (jog ? 16 : 0); bx < RW * T; bx += 32) {
                ctx.fillStyle = 'rgba(0,0,0,0.14)'
                ctx.fillRect(base + bx, ry, 1, 16)
                ctx.fillStyle = `rgba(0,0,0,${(0.05 + hash(rm * 9 + bx + ry) * 0.08).toFixed(2)})`
                ctx.fillRect(base + bx + 1, ry + 1, 30, 15)
            }
        }
        // a single directional key wash across the wall: lit toward the upper-left,
        // falling into shade toward the lower-right, so the palace shares the
        // dungeon's light direction
        const keyWash = ctx.createLinearGradient(base, 24, base + RW * T, VH)
        keyWash.addColorStop(0, 'rgba(255,238,200,0.10)')
        keyWash.addColorStop(1, 'rgba(10,10,28,0.20)')
        ctx.fillStyle = keyWash
        ctx.fillRect(base, 24, RW * T, VH - 24)
        // a gilded string course and a tiled floor line ground the wall
        ctx.fillStyle = '#c8a050'
        ctx.fillRect(base, 96, RW * T, 2)
        ctx.fillStyle = '#6e6e5c'
        ctx.fillRect(base, VH - 12, RW * T, 12)
        for (let tx = 0; tx < RW * T; tx += 20) {
            ctx.fillStyle = tx % 40 ? '#5e5e4c' : '#7a7a66'
            ctx.fillRect(base + tx, VH - 12, 19, 12)
            ctx.fillStyle = 'rgba(255,236,200,0.08)'
            ctx.fillRect(base + tx, VH - 12, 19, 1)
        }
        // fluted pillar: the cylinder is lit on its key-facing side and falls to
        // shade on the far side, with a warm gold band at the capital
        const px = base + d.pillar * T
        ctx.fillStyle = '#6e6e5c'
        ctx.fillRect(px - 10, 20, 20, 8)
        ctx.fillRect(px - 10, VH - 12, 20, 8)
        const col = ctx.createLinearGradient(px - 7, 0, px + 7, 0)
        col.addColorStop(0, mix('#8f8f7a', '#d8c898', 0.5))
        col.addColorStop(0.5, '#8f8f7a')
        col.addColorStop(1, mix('#8f8f7a', '#2c2c3c', 0.55))
        ctx.fillStyle = col
        ctx.fillRect(px - 7, 24, 14, VH - 24 - 8)
        ctx.fillStyle = '#b8ab86'
        ctx.fillRect(px - 7, 24, 5, VH - 24 - 8)
        ctx.fillStyle = '#4c4c3c'
        ctx.fillRect(px + 4, 24, 3, VH - 24 - 8)
        for (let fl = 30; fl < VH - 16; fl += 10) {
            ctx.fillStyle = 'rgba(0,0,0,0.20)'
            ctx.fillRect(px - 3, fl, 1, 7)
            ctx.fillStyle = 'rgba(255,238,200,0.10)'
            ctx.fillRect(px - 2, fl, 1, 7)
            ctx.fillRect(px + 1, fl, 1, 7)
        }
        ctx.fillStyle = '#e0cc88'
        ctx.fillRect(px - 10, 26, 20, 2)
        // arched window with a moonlit sky pane. Its height comes from the deco row
        // (paneShift), so a level that raises/drops the window moves the frame and
        // the light key together (#343-2). The sky itself breathes: hash-pinned stars
        // twinkle and a faint cloud drifts across the pane (#343-4). Same seed as
        // moonSources, so the stars belong to this window and never reshuffle.
        const wx = base + d.window * T + 8
        const wy = paneShift(d)
        const pseed = hash(Math.round((wx + 8 - 16) / T) * 2.7 + 5)
        ctx.save()
        ctx.translate(0, wy)
        ctx.fillStyle = '#5c5c4a'
        ctx.fillRect(wx - 3, 40, 22, 46)
        ctx.fillStyle = '#1b1f33'
        ctx.beginPath()
        ctx.moveTo(wx, 84); ctx.lineTo(wx, 44)
        ctx.arc(wx + 8, 44, 8, Math.PI, 0)
        ctx.lineTo(wx + 16, 84)
        ctx.closePath()
        ctx.fill()
        const moon = 0.4 + 0.2 * Math.sin(tick * 0.02 + rm)
        ctx.fillStyle = `rgba(120,140,220,${moon.toFixed(2)})`
        ctx.fillRect(wx + 2, 60, 12, 22)
        // a cloud crossing the pane, denser mid-transit, clipped to the glass column
        ctx.save()
        ctx.beginPath(); ctx.rect(wx + 2, 44, 12, 40); ctx.clip()
        const cp = cloudCross(tick, pseed)
        if (cp > 0.02) {
            const cxp = wx - 4 + cp * 24
            ctx.fillStyle = `rgba(150,165,205,${(cp * 0.16).toFixed(3)})`
            ctx.fillRect(cxp - 6, 52 + Math.round(hash(pseed) * 8), 12, 6)
        }
        ctx.restore()
        // stars above the moon glow, each twinkling on its own phase
        for (const st of starField(pseed)) {
            const sx = wx + 2 + Math.round(st.fx * 11)
            const sy = 46 + Math.round(st.fy * 12)
            ctx.fillStyle = `rgba(220,228,255,${(skyTwinkle(tick, st.ph) * 0.7).toFixed(2)})`
            ctx.fillRect(sx, sy, 1, 1)
        }
        ctx.fillStyle = '#c8a050'
        ctx.fillRect(wx + 7, 40, 2, 44)
        ctx.restore()
        // tapestry with a woven motif and a fringed, swaying hem
        const tx = base + d.tapestry * T + 4
        ctx.fillStyle = '#3f1830'
        ctx.fillRect(tx - 2, 28, 28, 54)
        ctx.fillStyle = '#5a2540'
        ctx.fillRect(tx, 30, 24, 52)
        ctx.fillStyle = '#7a3558'
        ctx.fillRect(tx + 3, 34, 18, 44)
        ctx.fillStyle = '#c8a050'
        ctx.fillRect(tx + 8, 42, 8, 20)
        ctx.fillStyle = '#e8d060'
        ctx.fillRect(tx + 10, 46, 4, 12)
        ctx.fillStyle = '#3f1830'
        ctx.fillRect(tx - 2, 28, 28, 3)
        ctx.fillStyle = '#5a2540'
        for (let i = 0; i < 3; i++) ctx.fillRect(tx + 3 + i * 8, 82, 4, 6 + Math.sin(tick * 0.1 + i + rm) * 1.5)
    }
}

// a torch's warm bloom, added over the (already darkened) scene: a hot core and a
// wide soft halo whose radius breathes with the flame — the source of the light
// pools. Composited additively so stone under it glows rather than being veiled.
function lightPool(ctx, x, y, fl) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.rect(x - TORCH_RADIUS, HUD_LINE, TORCH_RADIUS * 2, VH - HUD_LINE)
    ctx.clip()                            // bloom stays below the HUD band (S8)
    const r = 78 + fl * 12
    const outer = ctx.createRadialGradient(x, y, 6, x, y, r)
    outer.addColorStop(0, 'rgba(255,176,84,0.30)')
    outer.addColorStop(0.5, 'rgba(255,140,60,0.12)')
    outer.addColorStop(1, 'rgba(255,120,50,0)')
    ctx.fillStyle = outer
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    const core = ctx.createRadialGradient(x, y, 1, x, y, 34 + fl * 6)
    core.addColorStop(0, 'rgba(255,232,168,0.55)')
    core.addColorStop(1, 'rgba(255,180,90,0)')
    ctx.fillStyle = core
    ctx.fillRect(x - 44, y - 44, 88, 88)
    ctx.restore()
}

// a window's cold bloom: the moon's key, wide and blue, composited additively like
// the flame pools so palace stone under a window reads moonlit, not firelit. Its hue
// and strength come from the window's own seeded sky (moonTint), so a row of windows
// reads as different skies, not one stencil. Clipped below the HUD like warm pools.
function coolPool(ctx, x, y, fl, seed = 0) {
    const tint = moonTint(seed)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.rect(x - MOON_RADIUS, HUD_LINE, MOON_RADIUS * 2, VH - HUD_LINE)
    ctx.clip()
    const r = 120 + fl * 10
    const a = tint.s
    const outer = ctx.createRadialGradient(x, y, 8, x, y, r)
    outer.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${(0.20 * a).toFixed(3)})`)
    outer.addColorStop(0.5, `rgba(${Math.max(0, tint.r - 40)},${Math.max(0, tint.g - 40)},${Math.min(255, tint.b - 35)},${(0.08 * a).toFixed(3)})`)
    outer.addColorStop(1, `rgba(${Math.max(0, tint.r - 60)},${Math.max(0, tint.g - 60)},${Math.min(255, tint.b - 55)},0)`)
    ctx.fillStyle = outer
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.restore()
}

// a soft contact shadow that grounds whoever stands on the floor
function groundShadow(ctx, x, y, w) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, 0.32)
    const gr = ctx.createRadialGradient(0, 0, 1, 0, 0, w)
    gr.addColorStop(0, 'rgba(0,0,0,0.32)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(0, 0, w, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
}

function drawTorch(ctx, c, r, tick) {
    const x = c * T + T / 2, y = r * T + 10
    const fl = Math.sin(tick * 0.31 + c * 3) + Math.sin(tick * 0.17 + r)
    ctx.fillStyle = '#6a4a22'
    ctx.fillRect(x - 2, y, 4, 14)
    ctx.fillStyle = '#3a2a12'
    ctx.fillRect(x - 4, y + 10, 8, 5)
    ctx.fillStyle = '#e07020'
    ctx.beginPath()
    ctx.ellipse(x, y - 4 - fl, 5, 8 + fl * 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd050'
    ctx.beginPath()
    ctx.ellipse(x, y - 3 - fl, 2.5, 4.5 + fl, 0, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 3; i++) {
        const sp = (tick * 0.7 + i * 13) % 30
        ctx.fillStyle = `rgba(255,${Math.max(0, 140 - sp * 3)},60,${Math.max(0, 0.5 - sp / 60).toFixed(2)})`
        ctx.fillRect(x - 3 + ((hash(c * 5 + i) - 0.5) * 8), y - 10 - sp, 2, 2)
    }
}

// ---- portcullis over a gate column: bars lift into the ceiling ---------------
// Drawn from the SAME number blocks() consults (g.gateOpen). A gate the sim
// treats as passable (open >= CFG.gateOpen) is drawn with its bars lifted clear
// above the prince's head; one it treats as solid hangs all the way to the
// floor. gateBottom() is the pure geometry popcheck pins against blocks().
export const GATE_CLEAR = CFG.PH + 4          // headroom a lifted gate must clear
export function gateBottom(lowRow, open) {
    const span = (lowRow + 1) * T
    if (open < CFG.gateOpen) return span      // shut: the bars meet the floor
    const lift = (open - CFG.gateOpen) / (1 - CFG.gateOpen)
    return (span - GATE_CLEAR) * (1 - lift)
}
export const gateDrawOpen = (open) => open >= CFG.gateOpen

function drawGate(ctx, c, lowRow, open) {
    const bottom = gateBottom(lowRow, open)
    if (bottom < 3) return
    const x = c * T
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 0, T, bottom)
    ctx.clip()
    const run = lowRow * T + T
    for (let i = 0; i < 3; i++) {
        const bx = x + 4 + i * 10
        ctx.fillStyle = '#16161f'
        ctx.fillRect(bx - 1, 0, 6, run)
        ctx.fillStyle = '#3c3c50'
        ctx.fillRect(bx, 0, 2, run)
        ctx.fillStyle = '#545468'
        ctx.fillRect(bx, 0, 1, run)
    }
    const wy = bottom - 4
    ctx.fillStyle = '#16161f'
    ctx.fillRect(x + 2, wy, T - 4, 5)
    ctx.fillStyle = '#4a4a60'
    ctx.fillRect(x + 2, wy, T - 4, 2)
    ctx.fillStyle = '#d8b040'
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 10, wy - 1, 2, 2)
    ctx.restore()
}

// ---- chomper jaws: teeth rise from the floor, a blade drops from the ceiling -
function drawChomp(ctx, ch, tick) {
    const down = chompDown({ tick }, ch)
    const ph = (tick + ch.phase) % CFG.chompPeriod
    let k = 0
    if (ph >= CFG.chompWait) k = Math.min(1, (ph - CFG.chompWait) / CFG.chompDrop)
    if (down && ph >= CFG.chompWait + CFG.chompDrop) k = 1
    if (k <= 0) return
    const x = ch.c * T, y = ch.r * T
    ctx.fillStyle = '#9aa2b0'
    const th = (T - 4) * k
    for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * 8
        ctx.beginPath()
        ctx.moveTo(sx, y + T)
        ctx.lineTo(sx + 3, y + T - 6 - th)
        ctx.lineTo(sx + 6, y + T)
        ctx.fill()
    }
    const bh = (ch.r * T) * k * 0.9
    ctx.fillStyle = '#7f8794'
    for (let i = 0; i < 4; i++) {
        const sx = x + 2 + i * 8
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx + 3, bh)
        ctx.lineTo(sx + 6, 0)
        ctx.fill()
    }
}

// ---- flasks and the sword on the floor ----------------------------------------
const FLASK_INK = { r: '#e04040', '+': '#ff6050', b: '#4080e0', f: '#80d0ff', u: '#c060e0' }
// props catch the room's light too: a cool veil sinks an unlit prop into the dark,
// a warm rim highlight on the lit side grounds it in the flame. Pure brightness
// (propShade) + sign of the light side, so light is consistent across the scene.
function propLight(ctx, x, y, w, h, light) {
    const warm = light ? light.warm : 0.5
    const cool = light && light.cool != null ? light.cool : 0
    const sh = propShade(warm)
    ctx.save()
    // an arched prop clips its veil to the glass, so the corners stop hanging onto
    // the frame (the mirror passes an arch; rectangular props keep the flat box).
    if (light && light.arch) archPath(ctx, x, y, light.arch.w, light.arch.h)
    else ctx.beginPath(), ctx.rect(x - w, y - h, w * 2, h)
    ctx.clip()
    const side = light && light.side ? light.side : 0
    const coolSide = light && light.coolSide != null ? light.coolSide : 0
    const veil = ctx.createLinearGradient(x - w, 0, x + w, 0)
    const darkSide = side >= 0 ? -1 : 1
    veil.addColorStop(0, `rgba(6,10,30,${((1 - sh) * (darkSide < 0 ? 0.6 : 0.2)).toFixed(3)})`)
    veil.addColorStop(1, `rgba(6,10,30,${((1 - sh) * (darkSide > 0 ? 0.6 : 0.2)).toFixed(3)})`)
    ctx.fillStyle = veil
    ctx.fillRect(x - w, y - h, w * 2, h)
    // two-source props (QA #343-6): near both fire and window a prop carries a warm
    // rim on the flame side AND a cool rim on the window side, matching the two-
    // source bodies. Single-source props keep exactly their former single rim.
    if (warm > 0.35 && side !== 0) {
        ctx.fillStyle = `rgba(255,180,90,${((warm - 0.35) * 0.5).toFixed(3)})`
        ctx.fillRect(x + (side > 0 ? w * 0.5 : -w * 0.5) - 1, y - h, 2, h)
    }
    if (cool > 0.22 && coolSide !== 0) {
        ctx.fillStyle = `rgba(150,175,255,${((cool - 0.22) * 0.5).toFixed(3)})`
        ctx.fillRect(x + (coolSide > 0 ? w * 0.5 : -w * 0.5) - 1, y - h, 2, h)
    }
    ctx.restore()
}

function drawFlask(ctx, pot, tick, light) {
    const x = (pot.c + 0.5) * T, y = (pot.r + 1) * T
    const bob = Math.sin(tick * 0.1 + pot.c) * 1
    ctx.fillStyle = '#2a2a3c'
    ctx.fillRect(x - 7, y - 12 + bob, 14, 12)
    ctx.fillStyle = FLASK_INK[pot.type] || '#e04040'
    ctx.beginPath()
    ctx.moveTo(x, y - 14 + bob)
    ctx.lineTo(x + 6, y - 2 + bob)
    ctx.lineTo(x - 6, y - 2 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c8ccd8'
    ctx.fillRect(x - 2, y - 18 + bob, 4, 5)
    propLight(ctx, x, y + bob, 8, 18, light)
}

function drawSwordPickup(ctx, sw, tick, light) {
    const x = (sw.c + 0.5) * T, y = (sw.r + 1) * T
    const gl = 0.6 + 0.4 * Math.sin(tick * 0.12)
    ctx.strokeStyle = `rgba(240,244,255,${gl.toFixed(2)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 10, y - 4)
    ctx.lineTo(x + 10, y - 12)
    ctx.stroke()
    ctx.strokeStyle = '#d8b040'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 8, y - 10)
    ctx.lineTo(x - 4, y - 4)
    ctx.stroke()
    propLight(ctx, x, y, 12, 14, light)
}

// ---- the magic mirror: arched gold frame, rippling glass ---------------------
function drawMirror(ctx, m, tick, light) {
    const x = (m.c + 0.5) * T, base = (m.r + 1) * T
    ctx.fillStyle = '#6a5220'
    ctx.beginPath()
    ctx.moveTo(x - 13, base)
    ctx.lineTo(x - 13, base - 64)
    ctx.arc(x, base - 64, 13, Math.PI, 0)
    ctx.lineTo(x + 13, base)
    ctx.closePath()
    ctx.fill()
    const grad = ctx.createLinearGradient(x - 9, base - 74, x + 9, base)
    grad.addColorStop(0, '#3a4a6e')
    grad.addColorStop(0.5, '#7a92c8')
    grad.addColorStop(1, '#26304a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - 9, base - 2)
    ctx.lineTo(x - 9, base - 64)
    ctx.arc(x, base - 64, 9, Math.PI, 0)
    ctx.lineTo(x + 9, base - 2)
    ctx.closePath()
    ctx.fill()
    const sh = ((tick * 0.6) % 90) - 20
    ctx.strokeStyle = 'rgba(220,230,255,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 8, base - 6 - sh)
    ctx.lineTo(x + 2, base - 16 - sh)
    ctx.moveTo(x - 8, base - 14 - sh)
    ctx.lineTo(x + 6, base - 28 - sh)
    ctx.stroke()
    propLight(ctx, x, base, 13, 40, { ...(light || {}), arch: { w: 9, h: 72 } })
    ctx.fillStyle = '#e8d060'
    ctx.fillRect(x - 2, base - 82, 4, 5)
}

// ---- the princess's mouse -------------------------------------------------------
function drawMouse(ctx, m, tick) {
    const x = m.x, y = m.y
    const hop = Math.abs(Math.sin(tick * 0.35)) * 2
    ctx.fillStyle = '#9a9aa8'
    ctx.beginPath()
    ctx.ellipse(x, y - 5 - hop, 8, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 6 * m.dir, y - 7 - hop, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 4 * m.dir, y - 11 - hop, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#9a9aa8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - 8 * m.dir, y - 6 - hop)
    ctx.quadraticCurveTo(x - 14 * m.dir, y - 10 - hop + Math.sin(tick * 0.3) * 2, x - 16 * m.dir, y - 4 - hop)
    ctx.stroke()
    ctx.fillStyle = '#1a1a26'
    ctx.beginPath()
    ctx.arc(x + 7.5 * m.dir, y - 7.5 - hop, 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#d0d0dc'
    ctx.lineWidth = 0.7
    for (const wy of [-8, -6]) {
        ctx.beginPath(); ctx.moveTo(x + 8 * m.dir, y + wy - hop); ctx.lineTo(x + 12 * m.dir, y + wy - 1 - hop); ctx.stroke()
    }
}

// ---- figure -------------------------------------------------------------------
// origin = feet (x, y). Two-segment legs: thigh from the hip, shin from the
// knee. Angles: 0 = straight down, + toward the facing direction.
function limb(ctx, x, y, ang, len, w, col) {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(ang) * len, y + Math.cos(ang) * len)
    ctx.stroke()
}

function leg2(ctx, hx, hy, t, k, len, w, col) {
    const kx = hx + Math.sin(t) * len
    const ky = hy + Math.cos(t) * len
    limb(ctx, hx, hy, t, len, w, col)
    limb(ctx, kx, ky, t - k, len, w - 1, col)
    ctx.fillStyle = col
    ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3)
}

function figure(ctx, st, p, opts) {
    const f = p.facing
    const t = opts.tick
    const skin = opts.skin, cloth = opts.cloth, trim = opts.trim
    const pose = opts.pose || poseOf(st, opts.frame || 0)
    const wide = opts.wide || 1
    const hip = pose.hip
    const head = hip + 24
    const thigh = hip * 0.55
    const armLen = 15
    const bob = pose.bob + (opts.dieBob || 0)
    const lean = pose.lean + (opts.dieLean || 0)
    let swordOut = opts.sword
    if (p.hang) swordOut = false
    if (opts.die > 0 && st.startsWith('die')) swordOut = false
    // light this body receives from the room: `warm` = how near a torch is
    // (0 cool … 1 hot); `s` = the local side the light falls on (the geometry is
    // mirrored by facing, so convert the world light side back to local space).
    const warm = opts.warm != null ? opts.warm : 0.5
    const temp = opts.temp != null ? opts.temp : warm
    const s = (opts.litSide != null ? opts.litSide : f) * f
    const pale = !!(opts.bone || opts.pale)

    ctx.save()
    ctx.translate(p.x, p.y + bob)
    ctx.scale(f, 1)
    ctx.rotate(lean)

    // far leg first (shaded), near leg after the torso
    leg2(ctx, 0, -hip, pose.tB, pose.kB, thigh, 5, shade(cloth))
    if (opts.robe) {
        const sway = Math.sin(t * 0.18) * 3
        ctx.fillStyle = cloth
        ctx.beginPath()
        ctx.moveTo(-6 * wide, -hip)
        ctx.lineTo(-10 * wide, 2 + sway)
        ctx.lineTo(10 * wide, 2 - sway)
        ctx.lineTo(6 * wide, -hip)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = trim
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-10 * wide, 2 + sway); ctx.lineTo(10 * wide, 2 - sway)
        ctx.stroke()
    }
    leg2(ctx, 0, -hip, pose.tA, pose.kA, thigh, 5, cloth)

    // torso (the fat guard gets a belly), trim sash across it
    ctx.strokeStyle = cloth
    ctx.lineWidth = 9 * wide
    ctx.beginPath()
    ctx.moveTo(0, -hip)
    ctx.lineTo(2, -head + 10)
    ctx.stroke()
    if (wide > 1) {
        ctx.fillStyle = cloth
        ctx.beginPath()
        ctx.ellipse(1, -hip + 4, 8 * wide, 9, 0, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.strokeStyle = trim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-3, -hip - 4)
    ctx.lineTo(5, -hip - 10)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-3, -hip - 2)
    ctx.lineTo(5, -hip - 8)
    ctx.stroke()

    // torso shading: a rim light down whichever side the nearest torch is on and a
    // cool shadow up the other, so the body reads as a lit cylinder. The rim's hue
    // follows the colour temperature — amber under a sconce, cool blue in the dark
    // — while its strength follows the light's brightness.
    const rim = rimColor(temp)
    ctx.strokeStyle = `rgba(${rim.r},${rim.g},${rim.b},${rimAlpha(pale, warm, temp).toFixed(3)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s * 3, -hip - 2)
    ctx.lineTo(s * 5, -head + 11)
    ctx.stroke()
    ctx.strokeStyle = `rgba(6,10,${Math.round(44 + (1 - temp) * 40)},${(0.18 + (1 - warm) * 0.12).toFixed(3)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-s * 2, -hip - 1)
    ctx.lineTo(0, -head + 11)
    ctx.stroke()
    if (temp > 0.5) {
        ctx.strokeStyle = `rgba(255,160,72,${((temp - 0.5) * 0.44 * warm).toFixed(3)})`
        ctx.lineWidth = 4 * wide
        ctx.beginPath()
        ctx.moveTo(s * 2, -hip)
        ctx.lineTo(s * 3, -head + 11)
        ctx.stroke()
    }

    // back arm
    limb(ctx, 2, -head + 12, pose.armB, armLen, 4, shade(cloth))

    // head: skin + turban (wrapped, with a tail); skeletons get a bone skull
    if (opts.bone) {
        ctx.fillStyle = skin
        ctx.beginPath()
        ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#2a2a30'
        ctx.fillRect(1, -head + 2, 3, 3)
        ctx.fillRect(6, -head + 2, 3, 3)
        ctx.fillRect(3, -head + 7, 4, 2)
        ctx.strokeStyle = '#9a9a8c'
        ctx.lineWidth = 2
        for (let i = 0; i < 3; i++) {
            ctx.beginPath()
            ctx.moveTo(-3, -hip - 2 - i * 5)
            ctx.lineTo(6, -hip - 2 - i * 5)
            ctx.stroke()
        }
    } else {
        ctx.fillStyle = skin
        ctx.beginPath()
        ctx.arc(3, -head + 4, 6.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = opts.turban || trim
        ctx.fillRect(-4, -head + 1, 13, 4)
        ctx.beginPath()
        ctx.arc(3, -head + 2, 6.5, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(-2, -head - 2, 10, 3)
        ctx.strokeStyle = opts.turban || trim
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(-4, -head + 3)
        ctx.quadraticCurveTo(-12, -head + 6 + Math.sin(t * 0.2) * 2, -14, -head + 12)
        ctx.stroke()
        // face lighting: lit brow toward the light (amber near flame, cool in the
        // dark), shade on the far side, an eye.
        ctx.fillStyle = `rgba(${Math.round(180 + temp * 75)},${Math.round(190 + temp * 40)},${Math.round(240 - temp * 120)},${(0.12 + warm * 0.14).toFixed(3)})`
        ctx.fillRect(s > 0 ? 4 : -8, -head + 1, 4, 1)
        ctx.fillStyle = `rgba(4,6,${Math.round(26 + (1 - temp) * 22)},${(0.16 + (1 - warm) * 0.12).toFixed(3)})`
        ctx.fillRect(s > 0 ? -2 : 4, -head + 2, 2, 6)
        ctx.fillStyle = '#2a2018'
        ctx.fillRect(s > 0 ? 5 : -6.5, -head + 4, 1.5, 1.5)
    }
    if (opts.hat) {
        ctx.fillStyle = '#1a1026'
        ctx.beginPath()
        ctx.moveTo(-3, -head - 1)
        ctx.lineTo(3, -head - 19)
        ctx.lineTo(9, -head - 1)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#d24ad2'
        ctx.fillRect(-1, -head - 4, 8, 2)
    }

    // sword arm: sheathed at the hip, drawing, or a timing arc through a strike
    const shY = -head + 12
    if (!swordOut) {
        if (opts.sheath) {
            ctx.strokeStyle = '#6a6a80'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.moveTo(-2, -hip + 2)
            ctx.lineTo(-12, -hip + 14)
            ctx.stroke()
            limb(ctx, 2, shY, st === 'sheathe' ? 1.1 : pose.armB, armLen * 0.8, 4, skin)
        }
        ctx.restore()
        return
    }
    let swing = 0
    if (opts.swing > 0) {
        const k = 1 - opts.swing / CFG.strikeDur
        swing = k < 0.3 ? 0.9 * (k / 0.3) : 0.9 - 2.1 * Math.min(1, (k - 0.3) / 0.35)
    }
    if (st === 'windup') swing = -0.9
    if (st === 'strike') swing = pose.armB > 0 ? 1.3 : 0.4
    const swordAng = (st === 'block' ? -1.5 : -0.9) + swing
    let armA = st === 'block' ? -1.3 : pose.armB
    if (st === 'draw') armA = pose.armB > 0.5 ? -0.1 : 0.9
    ctx.strokeStyle = opts.swing > 0 ? '#ffffff' : shade(cloth)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(2, shY)
    const hxp = 2 + Math.sin(armA + 0.9) * 12
    const hyp = shY - Math.cos(armA + 0.9) * 12 + 4
    ctx.lineTo(hxp, hyp)
    ctx.stroke()
    const biting = opts.swing > 0 && opts.swing <= CFG.strikeDur - CFG.strikeHit0
    ctx.strokeStyle = biting ? '#fff8d8' : (opts.swordMetal || '#c8ccd8')
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hxp, hyp)
    ctx.lineTo(hxp + Math.sin(swordAng) * 26, hyp - Math.cos(swordAng) * 26)
    ctx.stroke()
    ctx.fillStyle = '#d8b040'
    ctx.fillRect(hxp - 2, hyp - 2, 4, 4)
    ctx.restore()
}

// ---- the scene -----------------------------------------------------------------
export function drawScene(ctx, g, opts = {}) {
    const { attract = false, lite = false } = opts
    const amb = ambientFor(lite)
    const dark = lite ? 0.62 : 1            // lite pulls the whole veil up for phones
    const tick = g.tick
    const grad = ctx.createLinearGradient(0, 0, 0, VH)
    grad.addColorStop(0, '#0b0b16')
    grad.addColorStop(1, '#16162a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, VW, VH)

    const lvl = g.level
    const camX = g.room * RW * T
    ctx.save()
    if (g.shake > 0) ctx.translate((hash(tick * 3) - 0.5) * g.shake, (hash(tick * 7) - 0.5) * g.shake)
    ctx.save()
    ctx.translate(-camX, 0)
    if (g.p.flip > 0) {
        ctx.translate(camX + VW / 2, VH / 2)
        ctx.rotate(Math.PI)
        ctx.translate(-(camX + VW / 2), -VH / 2)
    }

    if (lvl.theme === 'palace') palaceWall(ctx, g.room * RW, lvl.deco.slice(g.room, g.room + 1), tick)

    const c0 = g.room * RW, c1 = c0 + RW
    for (let r = 0; r < H; r++) for (let c = c0; c < c1; c++) {
        const code = lvl.grid[r * lvl.W + c]
        if (code === 0 || code === TORCH) continue
        if (code === GATE) continue
        if (code === LOOSE && g.fallen[r * lvl.W + c]) continue
        if (code === SOLID && lvl.chomps.some((ch) => ch.c === c && ch.r === r)) {
            stone(ctx, c, r, SOLID, g)
            drawChomp(ctx, { ...lvl.chomps.find((ch) => ch.c === c && ch.r === r), r }, tick)
            continue
        }
        stone(ctx, c, r, code, g)
    }
    for (let c = c0; c < c1; c++) {
        let lowRow = -1
        for (let r = 0; r < H; r++) if (lvl.grid[r * lvl.W + c] === GATE) lowRow = r
        if (lowRow >= 0) drawGate(ctx, c, lowRow, g.gateOpen[g.room])
    }
    for (const k in g.loose) {
        if (g.fallen[k]) continue
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        ctx.save()
        ctx.translate((hash(tick * 5 + Number(k)) - 0.5) * 3, (hash(tick * 11 + Number(k)) - 0.5) * 2)
        stone(ctx, c, r, LOOSE, g)
        ctx.restore()
    }
    for (const k in g.fallen) {
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        const x = c * T, y = (r + 1) * T
        ctx.fillStyle = '#4c4c60'
        ctx.beginPath()
        ctx.moveTo(x + 2, y)
        ctx.lineTo(x + 9, y - 7)
        ctx.lineTo(x + 18, y - 4)
        ctx.lineTo(x + 28, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#34344a'
        ctx.fillRect(x + 8, y - 3, 10, 3)
    }
    // torches standing in this room, as pixel centres — the light sources the
    // pools and the figures below are lit by. Pure per-torch: no flat room wash.
    const torchPx = []
    for (let r = 0; r < H; r++) for (let c = c0; c < c1; c++) {
        if (lvl.grid[r * lvl.W + c] === TORCH) torchPx.push([c * T + T / 2, r * T + 12])
    }
    // arched windows in the rooms this band crosses — the cool moon keys. A palace
    // reads moonlit (cool keys + cold pools); the dungeon never has them, so it
    // stays firelit. Empty off-palace, so every other room is unchanged.
    const moonPx = lvl.theme === 'palace'
        ? moonSources(lvl.deco.slice(Math.floor(c0 / RW), Math.ceil(c1 / RW)), Math.floor(c0 / RW) * RW * T)
        : []
    // centre-weighted shadow: the room sinks into darkness toward its edges, and a
    // room without a single torch sinks deeper — but the light itself, where it
    // comes at all, arrives per-torch (the pools below), never as a flat wash.
    const litRoom = torchPx.length > 0
    const vCore = (litRoom ? 0.10 : 0.30) * dark
    const vEdge = (litRoom ? 0.50 : 0.62) * dark
    const vg = ctx.createRadialGradient(c0 * T + VW / 2, VH * 0.44, VW * 0.18, c0 * T + VW / 2, VH * 0.44, VW * 0.72)
    vg.addColorStop(0, `rgba(4,6,22,${vCore.toFixed(3)})`)
    vg.addColorStop(1, `rgba(4,6,22,${vEdge.toFixed(3)})`)
    ctx.fillStyle = vg
    ctx.fillRect(c0 * T, 0, RW * T, VH)
    // warm bounce off the flagstones under each sconce — painted as a per-tile BAND
    // (bandAt quantised to the flagstone), so the ground catches light as stone,
    // one lit tile per step, rather than floating on one soft glow blob.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const fy = GROUND * T + 4
    const reach = Math.ceil(TORCH_RADIUS * 0.9 / T)
    for (const tp of torchPx) {
        const tc = Math.round((tp[0] - T / 2) / T)
        for (let k = -reach; k <= reach; k++) {
            const c = tc + k
            if (c < c0 || c >= c1) continue
            const b = bandAt(c * T + T / 2, torchPx)
            if (b <= 0.02) continue
            ctx.fillStyle = `rgba(255,150,70,${(b * 0.11).toFixed(3)})`
            ctx.fillRect(c * T + 1, fy - 5, T - 2, 10)
            // lit front-lip: the top 2px of each lit step catches more flame, so the
            // band reads as stepped stone (a lip per flagstone) not one flat glow.
            ctx.fillStyle = `rgba(255,190,120,${(b * 0.16).toFixed(3)})`
            ctx.fillRect(c * T + 1, fy - 5, T - 2, 2)
        }
    }
    ctx.restore()
    // sconce flames + their warm pools (additive: stone under them glows)
    for (const tp of torchPx) {
        const c = Math.round((tp[0] - T / 2) / T), r = Math.round((tp[1] - 12) / T)
        drawTorch(ctx, c, r, tick)
        lightPool(ctx, tp[0], tp[1], Math.sin(tick * 0.2 + c))
    }
    // windows' cold pools (additive cool keys, so fire-vs-moon is the room language),
    // each window tinted by its own seeded sky. Under every window the moon lays a
    // faint cool shaft down to the floor and a quantised cool band across the stone
    // (coolBandAt), mirroring the warm bounce — so the shaft reads as light *cast*
    // from the pane, not a bloom centred on it. Windows never sit in the HUD band,
    // so the shaft is already clear of it.
    for (const mp of moonPx) coolPool(ctx, mp[0], mp[1], Math.sin(tick * 0.04), mp[2] || 0)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const creach = Math.ceil(MOON_RADIUS * 0.7 / T)
    for (const mp of moonPx) {
        const tint = moonTint(mp[2] || 0)
        const sg = ctx.createLinearGradient(0, mp[1], 0, fy)
        sg.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${(0.10 * tint.s).toFixed(3)})`)
        sg.addColorStop(1, `rgba(${Math.max(0, tint.r - 50)},${Math.max(0, tint.g - 50)},${Math.min(255, tint.b - 40)},0)`)
        ctx.fillStyle = sg
        ctx.fillRect(mp[0] - 14, mp[1], 28, fy - mp[1])
        // dust motes drifting down the shaft — slow, seeded, fading toward the floor
        // (QA #343-5): the moonlit hall shimmers rather than sitting perfectly still.
        const mh = fy - mp[1]
        for (const mo of shaftMotes(tick, mp[2] || 0)) {
            const my = mp[1] + mo.y * mh
            if (my < HUD_LINE || my > fy) continue
            ctx.fillStyle = `rgba(${Math.min(255, tint.r + 60)},${Math.min(255, tint.g + 60)},255,${(mo.a * tint.s * 0.5).toFixed(3)})`
            ctx.fillRect(mp[0] + mo.dx, my, 1.5, 1.5)
        }
        const mc = Math.round(mp[0] / T)
        for (let k = -creach; k <= creach; k++) {
            const c = mc + k
            if (c < c0 || c >= c1) continue
            const b = coolBandAt(c * T + T / 2, moonPx)
            if (b <= 0.02) continue
            ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${(b * 0.09 * tint.s).toFixed(3)})`
            ctx.fillRect(c * T + 1, fy - 5, T - 2, 10)
            ctx.fillStyle = `rgba(${Math.min(255, tint.r + 40)},${Math.min(255, tint.g + 40)},255,${(b * 0.13 * tint.s).toFixed(3)})`
            ctx.fillRect(c * T + 1, fy - 5, T - 2, 2)
        }
    }
    ctx.restore()
    // how much light lands on a figure, from which side, and how warm that light
    // is (cold where only ambient reaches, amber under a sconce, cool at a window)
    const atLight = (x, y) => {
        let best = 0, side = null
        for (const tp of torchPx) {
            const dx = tp[0] - x, w = torchGlow(Math.hypot(dx, tp[1] - y))
            if (w > best) { best = w; side = dx >= 0 ? 1 : -1 }
        }
        if (side == null) {
            for (const mp of moonPx) {
                if (coolGlow(Math.hypot(mp[0] - x, mp[1] - y)) > 0.05) { side = mp[0] >= x ? 1 : -1; break }
            }
        }
        // the cool channel, so props can carry a window-side rim as well as a
        // flame-side one (two-source props, #343-6): strongest window + its side.
        let cbest = 0, cside = 0
        for (const mp of moonPx) {
            const cg = coolGlow(Math.hypot(mp[0] - x, mp[1] - y))
            if (cg > cbest) { cbest = cg; cside = mp[0] >= x ? 1 : -1 }
        }
        return { warm: lightAt(x, y, torchPx, amb, moonPx), side, temp: tempAt(x, y, torchPx, amb, moonPx), cool: cbest, coolSide: cside }
    }

    if (!g.sword && lvl.sword) drawSwordPickup(ctx, lvl.sword, tick, atLight((lvl.sword.c + 0.5) * T, (lvl.sword.r + 1) * T))
    for (const pot of g.pots) if (!pot.taken) drawFlask(ctx, pot, tick, atLight((pot.c + 0.5) * T, (pot.r + 1) * T))

    // planks the eyes could not see, once the feet found them
    for (const k in g.bridgeSeen) {
        const c = Number(k % lvl.W), r = Number((k - c) / lvl.W)
        const x = c * T, y = (r + 1) * T
        ctx.fillStyle = '#5a4a34'
        ctx.fillRect(x, y - 4, T, 4)
        ctx.fillStyle = '#3c3022'
        ctx.fillRect(x + 6, y - 3, 2, 2)
        ctx.fillRect(x + 22, y - 3, 2, 2)
    }
    // the magic mirror (and its far side, shimmering faintly)
    if (lvl.mirror && lvl.mirror.room === g.room) drawMirror(ctx, lvl.mirror, tick, atLight((lvl.mirror.c + 0.5) * T, (lvl.mirror.r + 1) * T))
    if (lvl.mirrorTo && lvl.mirrorTo.room === g.room && !g.mirrorUsed) {
        ctx.fillStyle = 'rgba(120,146,200,0.12)'
        ctx.fillRect(lvl.mirrorTo.c * T, (lvl.mirrorTo.r - 2) * T, T, T * 3)
    }
    // the princess's mouse, hurrying to the button
    if (g.mouse && g.mouse.room === g.room) drawMouse(ctx, g.mouse, tick)

    // the shadow — your own silhouette, repeating you a little too late
    if (g.shadow && (!g.shadow.dead || g.shadow.dieT < 72)) {
        const s = g.shadow
        const sc = Math.floor(s.x / T)
        if (sc >= c0 - 1 && sc < c1 + 1) {
            ctx.save()
            if (s.dead) ctx.globalAlpha = Math.max(0, 1 - s.dieT / 72)
            const glow = ctx.createRadialGradient(s.x, s.y - 24, 2, s.x, s.y - 24, 30)
            glow.addColorStop(0, 'rgba(80,60,140,0.25)')
            glow.addColorStop(1, 'rgba(80,60,140,0)')
            ctx.fillStyle = glow
            ctx.fillRect(s.x - 30, s.y - 54, 60, 60)
            const sframe = s.anim.startsWith('die') ? Math.min(2, Math.floor(s.dieT / 12)) : Math.floor(tick * 0.42)
            figure(ctx, s.anim, { x: s.x, y: s.y, facing: s.facing, onGround: s.onGround, hang: null, crouch: false },
                {
                    tick, frame: sframe, skin: '#2e2e3e', cloth: '#14141e', trim: '#32324a',
                    turban: '#1e1e2c', sword: false, sheath: false, swing: 0, hurt: 0,
                    die: s.dead ? s.dieT : 0, prog: 0,
                })
            if (!s.dead) {
                ctx.fillStyle = '#9090e0'
                ctx.fillRect(s.x + s.facing * 3 - 1, s.y - CFG.PH + 4, 2, 2)
                ctx.fillRect(s.x + s.facing * 7 - 1, s.y - CFG.PH + 4, 2, 2)
            }
            ctx.restore()
        }
    }

    // princess in the doorway once the boss has fallen
    if (lvl.needBoss && g.guards.every((q) => !q.boss || q.dead) && lvl.exit && lvl.exit.room === g.room) {
        const px = lvl.exit.c * T + 8
        const py = (lvl.exit.r + 1) * T
        const pl = atLight(px - 14, py)
        figure(ctx, 'idle', { x: px - 14, y: py, facing: 1, onGround: true, hang: null, crouch: false },
            { tick, skin: '#e0b090', cloth: '#b04a8a', trim: '#e8d060', sword: false, swing: 0, hurt: 0, die: 0, prog: 0, warm: pl.warm, litSide: pl.side, temp: pl.temp })
    }

    // guards
    for (const gd of g.guards) {
        if (gd.dead || gd.room !== g.room) continue
        const look = guardLook(gd.type, gd.boss)
        const style = GUARD_STYLE[gd.type] || GUARD_STYLE.green
        const st = gd.wind > 0 ? (gd.wind > gd.windT - CFG.guardHit0 ? 'windup' : 'strike')
            : gd.recoil > 0 ? 'recoil' : gd.engaged ? 'ready' : gd.anim === 'advance' ? 'walk' : 'patrol'
        const swing = gd.wind > 0 && gd.wind <= gd.windT - CFG.guardHit0 ? style.windT - gd.wind : 0
        const frame = gd.wind > 0 ? Math.floor((gd.windT - gd.wind) / 6) : Math.floor(tick / 8)
        groundShadow(ctx, gd.x, gd.y + 1, 15 * (look.wide || 1))
        const gl = atLight(gd.x, gd.y)
        figure(ctx, st === 'patrol' ? 'walk' : st, { x: gd.x, y: gd.y, facing: gd.dir || -1, onGround: true, hang: null, crouch: false },
            {
                tick: tick + gd.id * 13, frame, skin: look.skin, cloth: look.cloth, trim: look.trim,
                turban: look.turban, bone: look.bone, wide: look.wide || 1,
                swordMetal: look.sword, robe: look.robe, hat: look.hat,
                sword: true, sheath: false, swing, hurt: gd.hurtT, die: 0, prog: 0,
                warm: gl.warm, litSide: gl.side, temp: gl.temp,
            })
        if (gd.wind > 0 && gd.wind % 6 < 3) {
            ctx.fillStyle = '#ff5050'
            ctx.beginPath()
            ctx.arc(gd.x, gd.y - CFG.PH - 6, 2.5, 0, Math.PI * 2)
            ctx.fill()
        }
        if (gd.engaged) {
            const w = 26
            ctx.fillStyle = '#20202e'
            ctx.fillRect(gd.x - w / 2, gd.y - CFG.PH - 14, w, 3)
            ctx.fillStyle = gd.boss ? '#d040d0' : (look.turban || '#c04040')
            ctx.fillRect(gd.x - w / 2, gd.y - CFG.PH - 14, w * (gd.hp / gd.maxHp), 3)
        }
    }

    // escorts still one room away: a shape filling the arch behind you — the
    // doorway you came through, no longer empty
    for (const sil of escortSilhouettes(g)) {
        const look = guardLook(sil.type, sil.boss)
        const dx = sil.doorCol * T
        const archTop = (GROUND - 2) * T
        ctx.save()
        ctx.beginPath()
        ctx.rect(dx + 2, archTop, T - 4, 2 * T + 2)
        ctx.clip()
        ctx.fillStyle = 'rgba(2,3,10,0.92)'
        ctx.fillRect(dx, archTop, T, 2 * T + 2)
        figure(ctx, 'walk', { x: sil.doorCol * T + T / 2, y: GROUND * T, facing: -sil.side, onGround: true, hang: null, crouch: false },
            {
                tick: tick + sil.id * 13, frame: Math.floor(tick / 9), skin: '#0d0d16', cloth: '#10101c', trim: '#22223a',
                turban: mix(look.turban || '#2e6b46', '#08080f', 0.72), sword: false, sheath: false,
                swing: 0, hurt: 0, die: 0, prog: 0, warm: 0, litSide: sil.side,
            })
        ctx.restore()
        ctx.strokeStyle = 'rgba(4,5,14,0.9)'
        ctx.lineWidth = 2
        ctx.strokeRect(dx + 1.5, archTop + 0.5, T - 3, 2 * T + 1)
    }

    // the prince
    if (g.status !== 'lost' && !(g.status === 'dying' && g.p.dieT % 8 < 4 && g.p.anim !== 'die_impale')) {
        const p = g.p
        const dying = g.status === 'dying'
        const st = p.anim || 'idle'
        const gaitFrame = st === 'run' ? Math.floor(tick * 0.42)
            : st === 'walk' ? Math.floor(tick * 0.26)
                : st === 'careful' ? Math.floor(tick * 0.14)
                    : st === 'climb' ? Math.min(POSES.climb.length - 1, Math.floor((p.climb / CFG.climbT) * POSES.climb.length))
                        : st === 'hang' || st === 'shimmy' ? Math.floor(tick * 0.07)
                            : Math.floor(tick * 0.25)
        const pl = atLight(p.x, p.y)
        const opts = {
            tick, skin: '#e0b898', cloth: '#e8e8f0', trim: '#c03028', pale: true,
            sword: g.sword && (p.atk > 0 || p.block || p.duelDrawn),
            sheath: g.sword && !(p.atk > 0 || p.block || p.duelDrawn),
            swing: p.atk, hurt: p.hurtT, die: dying ? p.dieT : 0,
            prog: p.climb / CFG.climbT, crouch: p.crouch,
            frame: st.startsWith('die') ? Math.min(2, Math.floor(p.dieT / 12)) : gaitFrame,
            warm: pl.warm, litSide: pl.side, temp: pl.temp,
        }
        if (p.onGround) {
            const sc2 = Math.floor(p.x / T), sr2 = Math.floor(p.y / T) + 1
            if (sr2 < lvl.H && lvl.grid[sr2 * lvl.W + sc2] !== 0) groundShadow(ctx, p.x, p.y + 1, 15)
        }
        if (st === 'die_slice') {
            // the jaws' mark: two halves parting where the blade met
            const gap = 2 + p.dieT * 0.12
            for (const half of [0, 1]) {
                ctx.save()
                ctx.beginPath()
                ctx.rect(p.x + (half ? 1 : -40), 0, 40, VH)
                ctx.clip()
                const q = { ...p, x: p.x + (half ? gap : -gap) }
                figure(ctx, 'die_slice', q, { ...opts, dieLean: half ? 0.12 : -0.05 })
                ctx.restore()
            }
            ctx.fillStyle = '#8a1818'
            ctx.fillRect(p.x - 3, p.y - 34 + p.dieT * 0.2, 6, Math.min(20, p.dieT * 0.5))
        } else {
            figure(ctx, st, p, opts)
        }
        if (st === 'die_impale') {
            ctx.fillStyle = '#8a1818'
            ctx.fillRect(p.x + 2, p.y - 26, 4, 8)
            for (let i = 0; i < 3; i++) {
                const d = (p.dieT + i * 9) % 26
                ctx.fillRect(p.x + 3 + (i - 1) * 2, p.y - 18 + d, 2, 3)
            }
        }
        if (st === 'die_cut') {
            for (let i = 0; i < 2; i++) {
                const d = (p.dieT + i * 7) % 20
                ctx.fillStyle = '#8a1818'
                ctx.fillRect(p.x - 6 + i * 8, p.y - 22 + d, 2, 3)
            }
        }
        if (p.lev > 0 && tick % 6 < 3) {
            ctx.fillStyle = 'rgba(120,220,255,0.5)'
            ctx.fillRect(p.x - 10, p.y - 2 + Math.sin(tick * 0.3) * 2, 20, 2)
        }
        if (p.hang) {
            ctx.fillStyle = '#e0b898'
            const hy = p.hang.r * T
            ctx.fillRect(p.x + (p.hang.side > 0 ? CFG.HW - 2 : -CFG.HW - 2) - 2, hy - 2, 4, 4)
        }
    }

    ctx.restore()
    ctx.restore()

    drawHUD(ctx, g, attract)
}

// ---- HUD: health as little flasks, bottom-left; guard's flasks bottom-right --
function flasks(ctx, x, y, n, max, dir) {
    for (let i = 0; i < max; i++) {
        const fx = x + dir * i * 13
        ctx.fillStyle = '#20202e'
        ctx.fillRect(fx - 5, y, 10, 10)
        ctx.fillStyle = i < n ? '#e04040' : '#3a2230'
        ctx.beginPath()
        ctx.moveTo(fx, y - 2)
        ctx.lineTo(fx + 4, y + 8)
        ctx.lineTo(fx - 4, y + 8)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#c8ccd8'
        ctx.fillRect(fx - 1, y - 5, 2, 3)
    }
}

function drawHUD(ctx, g, attract) {
    const scrim = ctx.createLinearGradient(0, 0, 0, HUD_LINE)
    scrim.addColorStop(0, 'rgba(3,3,9,0.86)')
    scrim.addColorStop(1, 'rgba(9,9,18,0.52)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, VW, 22)
    ctx.strokeStyle = '#2e2e46'
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(VW, 22); ctx.stroke()
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8ab0'
    if (g.level) ctx.fillText(`ROOM ${g.room + 1}/${g.level.nRooms}`, 10, 14)
    if (g.sword) { ctx.fillStyle = '#c8ccd8'; ctx.fillText('⚔', 74, 15) }
    ctx.textAlign = 'center'
    ctx.fillStyle = '#8a8ab0'
    ctx.fillText(g.level ? g.level.name : '', VW / 2, 14)
    ctx.textAlign = 'right'
    const secs = Math.ceil(g.clock / 60)
    ctx.fillStyle = secs <= 300 && Math.floor(g.tick / 15) % 2 === 0 ? '#ff5050' : '#e8d060'
    ctx.fillText(clockText(g), VW - 10, 14)

    const p = g.p
    if (p) flasks(ctx, 12, VH - 14, p.hp, p.maxHP, 1)
    const gd = g.guards.find((q) => !q.dead && q.room === g.room && q.engaged)
    if (gd) flasks(ctx, VW - 12, VH - 14, gd.hp, gd.maxHp, -1)
    if (g.p && g.p.lev > 0) { ctx.fillStyle = '#80d0ff'; ctx.textAlign = 'right'; ctx.fillText('SLOW-FALL', VW - 10, VH - 22) }
    if (g.p && g.p.flip > 0) { ctx.fillStyle = '#c060e0'; ctx.textAlign = 'right'; ctx.fillText('UPSIDE-DOWN', VW - 10, VH - 22) }
    if (g.cpReached && g.level && g.level.checkpoint) { ctx.fillStyle = '#80e0a0'; ctx.textAlign = 'left'; ctx.fillText('CHECKPOINT', 10, 34) }
    void attract
}

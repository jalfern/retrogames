// Q*BERT — "Obsidian & Orchid" reimagined skin (#3096). A museum-vault
// re-imagining: the vitrine pyramid stands in dark indigo fog on a plinth,
// drifting amber motes, a glow, pale-mint stencil text on a dark plate, and a
// new hero. The classic look (art.js) is byte-frozen and stays the default;
// this file is the ONLY place the alternate palette lives. No rule, geometry,
// timing, or physics changes — every sprite is painted through the same
// pinned pose/coil/ball/disc/arch models in art.js.
//
// Swapping skins never touches the sim: index.jsx routes ALL canvas paint
// through the painter object this module exports.

import {
    HW, HH, CUBE_SIDE, BERT_GEO, BALL_R, BALL_W, BALL_H, BALL_BOT, ballScale,
    DISC_R, DISC_RY, discHalfW, COILS, COIL_W, COIL_H, coilX, coilY,
    tunnelArch, cubeTopCol, cubeDarkCol, text5 as classicText5, textWidth,
} from './art.js'
import { TUNNEL } from './sim.js'

// ------------------------------------------------------------------ palette
export const SKIN_IDS = ['classic', 'reimagined']

export const skinFromLocation = () => {
    try {
        const q = new URLSearchParams(window.location.search).get('style')
        if (q && SKIN_IDS.includes(q)) return q
        const stored = window.localStorage.getItem('qbert.skin')
        if (stored && SKIN_IDS.includes(stored)) return stored
    } catch { /* private mode, no URL — classic */ }
    return 'classic'
}
export const rememberSkin = (skin) => { try { window.localStorage.setItem('qbert.skin', skin) } catch { /* fine */ } }

// Classic-chrome colors, kept identical so the classic PAINTER below renders
// byte-for-byte what index.jsx always did (the sim never changes, only the
// painter and its colors).
export const CLASSIC_CHROME = {
    active: '#f8f8f8', inactive: '#6a6a6a', round: '#f8d800', left: '#58d8f8',
    toast: '#f8d800', player: '#58d8f8', clear: '#58f878',
    popBright: '#f8f8f8', popFade: '#787878',
    balloon: '#f8f8f8', balloonText: '#101010',
    flash: '248,128,0', death: '#f88000', lure: '#00c850',
}

// Obsidian & Orchid chrome: pale-mint stencil on dark plate, amber accents.
export const REIMAGINED_CHROME = {
    active: '#d9fff0', inactive: '#5f8a74', round: '#f2c46b', left: '#9ae6cf',
    toast: '#f2c46b', player: '#7ddba4', clear: '#7dffc8',
    popBright: '#e6fff5', popFade: '#55c8a0',
    balloon: '#f2c46b', balloonText: '#241508',
    flash: '242,180,80', death: '#ff8a3d', lure: '#3dff9e',
}

// ---------------------------------------------------------------- primitives
const SPR = new Map()
const sprite = (key, w, h, draw) => {
    if (SPR.has(key)) return SPR.get(key)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    draw(g, w, h)
    SPR.set(key, c)
    return c
}
const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h) }

// Classic painters: byte-identical wrappers around art.js (the sim and the
// classic skin stay exactly as they were). Reused to build CLASSIC_PAINTER.
export const CLASSIC_PAINTER = {
    paintPlate: () => {},
    paintBg: (ctx, w, h, _tick) => CLASSIC_BG(ctx, w, h),
    cubeSprite: ({ mode, color, checker }) => CLASSIC_CUBE(cubeTopCol(mode, color, checker), cubeDarkCol(mode, color, checker)),
    bertSprite: (frame, facing) => CLASSIC_BERT(frame, facing),
    ballSprite: (frame) => CLASSIC_BALL(frame),
    discSprite: (phase) => CLASSIC_DISC(phase),
    coilySprite: (frame) => CLASSIC_COILY(frame),
    runnerSprite: (kind, frame) => CLASSIC_RUNNER(kind, frame),
    slickSprite: () => CLASSIC_SLICK(),
    tunnelSprite: (side) => CLASSIC_TUNNEL(side),
    text5: (ctx, str, x, y, color, scale = 1) => classicText5(ctx, str, x, y, color, scale),
    textWidth: (str, scale = 1) => textWidth(str, scale),
    lifeGlyph: (ctx, x, y) => CLASSIC_GLYPH(ctx, x, y),
    chrome: CLASSIC_CHROME,
}

// Wired in-module by index.jsx? No — art.js painters are imported lazily here
// through the CLASSIC_PAINTER references above. This block is a static import
// to avoid a circular dependency (art.js never imports reimagined.js).
import {
    cubeSprite as CLASSIC_CUBE, bertSprite as CLASSIC_BERT, ballSprite as CLASSIC_BALL,
    discSprite as CLASSIC_DISC, coilySprite as CLASSIC_COILY, runnerSprite as CLASSIC_RUNNER,
    slickSprite as CLASSIC_SLICK, tunnelSprite as CLASSIC_TUNNEL, paintBg as CLASSIC_BG,
    lifeGlyph as CLASSIC_GLYPH,
} from './art.js'

// ----------------------------------------------------------- reimagined art
// The museum-vault gradient, drifting amber motes, indigo fog bands and a
// vignette are drawn EVERY frame (the tick drives the drift), deliberately
// re-rendered rather than cached.
export const REIMAGINED_PAL = {
    glassRim: '#d8a7ff', glassHi: '#b9ffe6', glassSideL: '#241543', glassSideR: '#160f2e',
    glassSideDark: '#0e0919',
    mint: '#7dffc8', mintPale: '#eafff6', amber: '#f2c46b', amberDk: '#6b4a1e',
    magenta: '#e85cd0', magentaDk: '#3a1040',
    obsidian: '#1b1233', obsidianHi: '#2c2248', obsidianDk: '#0e0919',
    ember: '#ffb347', emberDeep: '#8a4a18', emberHi: '#ffe2a0',
    fog: '#6040a0', floor: '#0d0718', vignette: '#05020c',
    plate: 'rgba(9,5,18,0.5)', plateEdge: 'rgba(216,167,255,0.3)',
}

// Fixed mote seeds (the vault's air): x/y/speed/amp, derived from a stable LCG.
const MOTES = []
{
    let s = 31337
    for (let i = 0; i < 14; i++) {
        s = (s * 1103515245 + 12345) >>> 0; const ax = (s >>> 8) % 256
        s = (s * 1103515245 + 12345) >>> 0; const ay = 28 + (s >>> 8) % 158
        s = (s * 1103515245 + 12345) >>> 0; const sp = 0.12 + ((s >>> 8) % 100) / 480
        s = (s * 1103515245 + 12345) >>> 0; const ph = (s >>> 8) % 628 / 100
        MOTES.push({ ax, ay, sp, ph })
    }
}

export function paintPlate(ctx, w, _h) {
    ctx.fillStyle = 'rgba(9,5,18,0.66)'
    ctx.fillRect(0, 0, w, 22)
    ctx.fillStyle = 'rgba(216,167,255,0.5)'
    ctx.fillRect(0, 22, w, 1)
}

export function paintBg(ctx, w, h, tick = 0) {
    const grd = ctx.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#0a0518')
    grd.addColorStop(0.55, '#160c30')
    grd.addColorStop(1, '#241038')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, w, h)

    // fog bands: wide, drifting, translucent indigo
    for (const [y, a, hh] of [[26, 0.09, 18], [118, 0.07, 26], [182, 0.09, 20]]) {
        const wob = Math.sin(tick * 0.016 + y) * 6
        ctx.fillStyle = `rgba(96,64,160,${a})`
        ctx.fillRect(0, y + wob, w, hh)
    }

    // drifting amber motes
    for (let i = 0; i < MOTES.length; i++) {
        const m = MOTES[i]
        const x = (m.ax + tick * m.sp * 2) % w
        const y = m.ay + Math.sin(tick * 0.03 + m.ph) * 6
        const a = 0.35 + 0.45 * Math.sin(tick * 0.06 + m.ph * 2)
        const big = i % 4 === 0
        ctx.fillStyle = `rgba(255,196,107,${Math.max(0.22, a).toFixed(3)})`
        ctx.fillRect(Math.round(x), Math.round(y), big ? 2 : 1, big ? 2 : 1)
    }

    // obsidian plinth + glowing floor edge
    ctx.fillStyle = REIMAGINED_PAL.floor
    ctx.fillRect(0, 186, w, h - 186)
    ctx.fillStyle = 'rgba(242,196,107,0.85)'
    ctx.fillRect(0, 185, w, 1)

    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, 42, w / 2, h / 2, 158)
    vg.addColorStop(0, 'rgba(5,2,12,0)')
    vg.addColorStop(1, 'rgba(5,2,12,0.5)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)
}

// glass-vitrine cube. Sides are the vault's obsidian-purple glass; the top
// diamond and mint highlight use the same mode/color/checker semantics the
// classic painter resolves inside art.js — only the palette moves.
function vaultTopCol(mode, color, checker) {
    if (mode === 1) {
        if (color === 1) return REIMAGINED_PAL.mint
        return checker ? '#d8a7ff' : REIMAGINED_PAL.amber
    }
    const CYCLE = ['#3a2bb8', REIMAGINED_PAL.mint, REIMAGINED_PAL.amber, '#e85cd0', '#2bb88a']
    return CYCLE[color % 5]
}

export function cubeSprite({ mode, color, checker }) {
    const top = vaultTopCol(mode, color, checker)
    const key = `glass-${top}`
    return sprite(key, HW * 2, HH * 2 + CUBE_SIDE, (g) => {
        // sides: obsidian-purple glass with orchid hatch cuts
        g.fillStyle = REIMAGINED_PAL.glassSideL
        g.beginPath()
        g.moveTo(0, HH); g.lineTo(HW, HH * 2); g.lineTo(HW, HH * 2 + CUBE_SIDE); g.lineTo(0, HH + CUBE_SIDE)
        g.closePath(); g.fill()
        g.fillStyle = REIMAGINED_PAL.glassSideR
        g.beginPath()
        g.moveTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(HW, HH * 2 + CUBE_SIDE); g.lineTo(HW * 2, HH + CUBE_SIDE)
        g.closePath(); g.fill()
        // hatch cuts on the left face
        g.strokeStyle = 'rgba(216,167,255,0.42)'
        g.lineWidth = 1
        for (let i = 0; i < 3; i++) {
            const x = 2 + i * 4
            const y = HH + (x / HW) * (HH - 2) + 1
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 5); g.stroke()
        }
        // top diamond
        g.fillStyle = top
        g.beginPath()
        g.moveTo(HW, 0); g.lineTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(0, HH)
        g.closePath(); g.fill()
        // mint highlight
        px(g, HW - 6, HH - 2, 8, 1, REIMAGINED_PAL.glassHi)
        // orchid rim
        g.strokeStyle = REIMAGINED_PAL.glassRim
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(HW + 0.5, 0.5); g.lineTo(HW * 2 - 0.5, HH + 0.5); g.lineTo(HW + 0.5, HH * 2 + 0.5); g.lineTo(0.5, HH + 0.5)
        g.closePath(); g.stroke()
    })
}

// Pointy-obsidian scout: one big mint eye, a tapered horn, a violet glass
// body with an orchid rim, and obsidian feet with mint caps. Same 7-frame
// BERT_GEO pose data as the classic painter.
export function bertSprite(frame, facing) {
    const f = ((frame % 7) + 7) % 7
    return sprite(`scout-${f}-${facing}`, 18, 20, (g) => {
        const { fy, bh, splay } = BERT_GEO[f]
        const bt = fy - bh
        const MINT = REIMAGINED_PAL.mint
        const MINT_HI = REIMAGINED_PAL.mintPale
        const VIOLET = '#a06ad0'
        const VIOLET_HI = '#c9a8e8'
        const OBS = REIMAGINED_PAL.obsidian
        const OBS_HI = REIMAGINED_PAL.obsidianHi
        const DARK = '#0a0714'
        const ORCHID = REIMAGINED_PAL.glassRim
        const FACE = facing > 0 ? 1 : -1

        // tapered horn straight up: orchid base, mint tip
        px(g, 7, 2, 4, 2, ORCHID)
        px(g, 8, 0, 2, 2, MINT)

        // obsidian head with one big mint eye — the centerpiece
        px(g, 4, 3, 10, 5, OBS)
        px(g, 4, 3, 10, 1, OBS_HI)
        if (f === 6) {
            px(g, 6, 4, 6, 4, '#2f5a47')
            px(g, 8, 5, 2, 1, '#0a0714'); px(g, 6, 5, 1, 1, '#0a0714'); px(g, 10, 5, 1, 1, '#0a0714')
            px(g, 8, 7, 1, 1, '#0a0714')
        } else {
            px(g, 6, 4, 6, 4, MINT)
            px(g, FACE > 0 ? 9 : 6, 5, 2, 2, '#050310')
            px(g, 6, 4, 6, 1, MINT_HI)
        }

        // neck: only when the compressed body drops below the head
        if (bt > 8) px(g, 7, 8, 4, Math.max(1, bt - 8), OBS)

        // violet glass body with an orchid left rim — the facet cut
        const lowerY = bt + Math.floor(bh * 0.45)
        px(g, 3 - splay, bt, 12 + splay * 2, Math.max(2, lowerY - bt), VIOLET)
        px(g, 2 - splay, lowerY, 14 + splay * 2, Math.max(2, fy - lowerY), VIOLET)
        px(g, 2 - splay, bt, 12 + splay * 2, 1, VIOLET_HI)
        px(g, 2 - splay, lowerY, 2, Math.max(2, fy - lowerY), ORCHID)

        // small mint chest core — the jewel of the glass
        px(g, 7 - splay, lowerY + 1, 4, Math.max(2, fy - lowerY - 2), MINT)

        // obsidian feet with mint caps
        px(g, 2 - splay, fy, 6, 2, DARK)
        px(g, 11 + splay, fy, 6, 2, DARK)
        px(g, 2 - splay, fy, 6, 1, MINT)
        px(g, 11 + splay, fy, 6, 1, MINT)

        // little arms — obsidian stubs at the shoulder line
        px(g, 1 - splay, bt + 2, 2, 3, OBS)
        px(g, 15 + splay, bt + 2, 2, 3, OBS)

        // tiny orchid beak toward facing
        const snz = FACE > 0 ? 14 : 1
        px(g, snz, bt + 3, 3, 2, ORCHID)
        px(g, FACE > 0 ? 16 : 0, bt + 3, 2, 1, MINT)
    })
}

// warm orb with an inner glow; same squash-at-impact model (ballScale, BALL_R).
export function ballSprite(frame) {
    const f = ((frame % 8) + 8) % 8
    return sprite(`orb-${f}`, BALL_W, BALL_H, (g) => {
        const cx = BALL_W / 2
        const { sy, sx } = ballScale(f)
        const rx = BALL_R * sx, ry = BALL_R * sy
        const cy = BALL_BOT - ry
        g.shadowColor = 'rgba(255,178,70,0.85)'
        g.shadowBlur = 3
        g.fillStyle = REIMAGINED_PAL.emberDeep
        g.beginPath(); g.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.fill()
        g.fillStyle = REIMAGINED_PAL.ember
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
        g.shadowBlur = 0
        if (ry > 2) {
            g.fillStyle = REIMAGINED_PAL.emberHi
            g.beginPath(); g.ellipse(cx - rx * 0.25, cy - ry * 0.4, Math.max(1, rx * 0.4), Math.max(1, ry * 0.35), 0, 0, Math.PI * 2); g.fill()
        }
    })
}

// magenta halo + mint core; same spinning-width model (discHalfW).
export function discSprite(phase) {
    const f = ((phase % 8) + 8) % 8
    return sprite(`halo-${f}`, DISC_R * 2, DISC_RY * 2 + 2, (g) => {
        const cx = DISC_R, cy = DISC_RY + 1
        const rx = Math.max(1, discHalfW(f))
        g.shadowColor = 'rgba(232,92,208,0.8)'
        g.shadowBlur = 5
        g.fillStyle = REIMAGINED_PAL.magentaDk
        g.beginPath(); g.ellipse(cx, cy, rx, DISC_RY + 1, 0, 0, Math.PI * 2); g.fill()
        g.shadowBlur = 0
        g.fillStyle = REIMAGINED_PAL.magenta
        g.beginPath(); g.ellipse(cx, cy, rx, DISC_RY, 0, 0, Math.PI * 2); g.fill()
        if (rx > 2) {
            g.fillStyle = REIMAGINED_PAL.mintPale
            g.beginPath(); g.ellipse(cx, cy - 1, Math.max(1, rx * 0.62), Math.max(1, DISC_RY - 2), 0, 0, Math.PI * 2); g.fill()
        }
        px(g, cx - 1, cy - 2, 2, 4, REIMAGINED_PAL.mint)
    })
}

// 5 glowing ember orbs, same coil positions and the same wiggle model.
export function coilySprite(frame) {
    return sprite(`ember-${frame}`, 22, 22, (g) => {
        const rx = COIL_W / 2, ry = COIL_H / 2
        for (let i = 0; i < COILS; i++) {
            const cx = 11 + coilX(i, frame)
            const cy = coilY(i)
            g.shadowColor = 'rgba(255,150,60,0.75)'
            g.shadowBlur = 3
            g.fillStyle = '#3d1408'
            g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
            g.shadowBlur = 0
            g.fillStyle = '#ff7a2a'
            g.beginPath(); g.ellipse(cx, cy - 0.5, rx - 1, ry - 0.5, 0, 0, Math.PI * 2); g.fill()
            px(g, cx - 1.5, cy - 0.5, 3, 1, REIMAGINED_PAL.emberHi) // the ember's hot heart
        }
        // head orb with two tiny embers and a flicking tongue
        g.shadowColor = 'rgba(255,150,60,0.8)'
        g.shadowBlur = 4
        px(g, 8, 0, 8, 6, '#ff9540')
        g.shadowBlur = 0
        px(g, 8, 0, 8, 1, REIMAGINED_PAL.emberDeep)
        px(g, 9, 1, 2, 2, '#2a0d08'); px(g, 13, 1, 2, 2, '#2a0d08')
        const tl = 1 + (frame % 2)
        px(g, 12, 5, 1, tl, '#ffb347')
        if (tl > 1) { px(g, 11, 5 + tl, 1, 1, '#ff9540'); px(g, 13, 5 + tl, 1, 1, '#ff9540') }
    })
}

// obsidian shard + mint glint (ugg) / orchid glint (wrongway).
export function runnerSprite(kind, frame) {
    const glint = kind === 'ugg' ? REIMAGINED_PAL.mint : '#e88aff'
    return sprite(`shard-${kind}-${frame}`, 22, 12, (g) => {
        px(g, 0, 4, 22, 5, REIMAGINED_PAL.obsidian)   // the shard body
        px(g, 2, 3, 18, 1, REIMAGINED_PAL.obsidianHi) // top highlight
        px(g, 0, 9, 22, 1, REIMAGINED_PAL.obsidianDk) // the sharp underside
        const fx = kind === 'ugg' ? 17 : 1
        px(g, fx, 2, 4, 4, REIMAGINED_PAL.obsidianHi)
        px(g, fx + 1, 3, 1, 1, glint)                 // the glint
        const lo = frame % 2
        px(g, 3 + lo * 2, 9, 2, 2, REIMAGINED_PAL.obsidianDk)
        px(g, 9 - lo * 2, 9, 2, 2, REIMAGINED_PAL.obsidianDk)
        px(g, 15 + lo * 2, 9, 2, 2, REIMAGINED_PAL.obsidianDk)
    })
}

// translucent glass hull with facet lines
export function slickSprite() {
    return sprite('glass-hull', HW * 2, HH * 2, (g) => {
        g.fillStyle = 'rgba(36,26,61,0.88)'
        g.beginPath()
        g.moveTo(HW, 0); g.lineTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(0, HH)
        g.closePath(); g.fill()
        g.strokeStyle = 'rgba(216,167,255,0.75)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(HW, 0); g.lineTo(HW, HH * 2)
        g.moveTo(0, HH); g.lineTo(HW * 2, HH)
        g.stroke()
        px(g, HW - 5, HH - 2, 7, 1, REIMAGINED_PAL.glassHi)
        px(g, HW + 1, HH + 1, 5, 1, '#8a6bd0')
    })
}

// amber portal arches (same TUNNEL spans, same pure arch profile)
export function tunnelSprite(side) {
    const t = side < 0 ? TUNNEL.left : TUNNEL.right
    const w = t.x1 - t.x0, h = t.y1 - t.y0
    return sprite(`portal-${side}`, w, h, (g) => {
        px(g, 0, 0, w, h, '#3a2b14')
        // rim highlight: crown + outer jamb in amber
        const outer = side < 0 ? 0 : w - 2
        px(g, 0, 0, w, 1, '#f2c46b')
        px(g, outer, 0, 2, h - 1, '#f2c46b')
        // amber mouth: a glowing keystone opening, arch profile as pure as classic
        const arch = tunnelArch(w, h)
        for (let y = 1; y < h; y++) {
            const [a, b] = arch[y]
            px(g, a, y, b - a, 1, '#0c0504')
        }
        // a sliver of amber glow deep in the portal
        px(g, (w - 8) / 2, h - 5, 8, 1, '#f2c46b')
    })
}

// pale-mint stencil text with a soft glow (same FONT, same geometry)
export function text5(ctx, str, x, y, color, scale = 1) {
    ctx.save()
    ctx.shadowColor = color + '66'
    ctx.shadowBlur = 2
    classicText5(ctx, str, x, y, color, scale)
    ctx.restore()
    classicText5(ctx, str, x, y, color, scale) // crisp pass on top of the glow
}

// glowing vial life glyph
export function lifeGlyph(ctx, x, y) {
    px(ctx, x + 1, y + 1, 5, 2, '#3d2c12')      // cap
    px(ctx, x + 1, y + 3, 5, 6, REIMAGINED_PAL.amber)   // amber liquid
    px(ctx, x + 1, y + 3, 5, 1, '#fff0d0')      // glass highlight
    px(ctx, x + 2, y + 4, 1, 4, '#ffd28a')      // inner glow stripe
    px(ctx, x + 1, y + 8, 5, 1, REIMAGINED_PAL.amberDk) // base
}

// --------------------------------------------------------- the painter set
export const REIMAGINED = {
    paintPlate,
    paintBg,
    cubeSprite,
    bertSprite,
    ballSprite,
    discSprite,
    coilySprite,
    runnerSprite,
    slickSprite,
    tunnelSprite,
    text5,
    textWidth: (str, scale = 1) => textWidth(str, scale),
    lifeGlyph,
    chrome: REIMAGINED_CHROME,
}

export const PAINTERS = { classic: CLASSIC_PAINTER, reimagined: REIMAGINED }

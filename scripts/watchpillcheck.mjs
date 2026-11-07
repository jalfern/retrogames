// watchpillcheck — #1653 part 1, browser-free: the WATCH pill/toast never
// falls into the #437 chrome column on a phone, and the two top-right game
// HUD corners the QA issue named (LunarLander ALT/HORIZ, MarioKart place)
// keep measurable margins off the pill.
//
// #1622 keeps Chrome dead on this studio host, so "capture at 390x844 and
// eyeball it" is not a thing here. What IS provable: every pill wrapper rides
// the same safe-area insets as GameChrome (PAUSE lives at 12px + var(--sat),
// ~29px tall — the band CometDrift's scene.js already pins as CHROME_BAND
// 46), the toast default clears the pill and clamps to the viewport, and the
// HUD-corner geometry for LL/Kart can be re-derived at Node from constants
// parsed straight out of the shipped source (the pins below). Computed
// margins, not eyeballed ones. The "does it look nice" capture stays the QA
// lane's job on a healthy node (#1650 lineage) — everything here is law.
import { Report } from './lib/harness.mjs'
import { readFileSync, readdirSync } from 'node:fs'

const rep = new Report('WATCH pill/toast chrome law (#1653 p1, browser-free)')
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const REM = 16

// ---- shared law -------------------------------------------------------------
const PILL_W = 112, PILL_H = 44         // WatchButton's fixed size (pinned below; #1656 44pt solid pill)
const CHROME_INSET = 0.75 * REM        // #437 corner inset (GameChrome literals, pinned)
const CHROME_H = 29                    // ~29px chrome button (CometDrift scene.js, pinned)
const GAP = 8                          // thumb gap between stacked tappable chrome
const BAND = 46                        // CometDrift CHROME_BAND (pinned below)
const TOAST_H1 = 24, TOAST_H2 = 38    // one/two wrapped lines of the banner (py-1 + border + 13px lines)
const MONO_ADV = 0.58                  // conservative monospace advance (em); real UI mono ≥ 0.6
const TRACK = 0.1                      // tracking-widest = 0.1em

// Viewports: portrait + its landscape rotation. sat/sab from device reality
// (iPhone 12/13: 47 top / 34 home indicator; 14 Pro: 59/34; Pixel-ish: 24).
// In landscape the notch moves SIDEWAYS: top inset drops to 0 and the same
// inset lands on sal/sar (modelled symmetric — the honest worst case).
const DEVICES = [
    { name: 'se', w: 375, h: 667, sat: 0, sab: 0 },
    { name: 'iphone12', w: 390, h: 844, sat: 47, sab: 34 },
    { name: 'iphone14pro', w: 393, h: 852, sat: 59, sab: 34 },
    { name: 'pixel', w: 412, h: 915, sat: 24, sab: 24 },
]
const VPS = DEVICES.flatMap((d) => [
    { ...d, mode: 'portrait' },
    { name: `${d.name}-land`, w: d.h, h: d.w, sat: 0, sab: d.sat > 0 ? 0 : d.sat,
      sal: d.sat > 0 ? Math.min(d.sat, 59) : 0, sar: d.sat > 0 ? Math.min(d.sat, 59) : 0, mode: 'landscape' },
])

const intersect = (a, b) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0

// #437 corner chrome at a viewport (fixed-position, viewport-anchored).
const pauseRect = (vp) => ({ x: vp.w - CHROME_INSET - (vp.sar || 0) - 62, y: CHROME_INSET + vp.sat, w: 62, h: CHROME_H })
const feedbackRect = (vp) => ({ x: CHROME_INSET + (vp.sal || 0), y: 2.75 * REM + vp.sat, w: 86, h: CHROME_H })

// ---- pins: the law cannot drift silently --------------------------------------
const btn = read('../src/components/WatchButton.jsx')
rep.check('pin: WatchButton size 112x44 matches model',
    btn.includes('minWidth: 112, height: 44'))
rep.check('pin: toast default rides --sat',
    /style=\{\{ top: 'calc\(6\.75rem \+ var\(--sat, 0px\)\)'/.test(btn))
rep.check('pin: toast clamps to 94vw and wraps (no nowrap)',
    btn.includes('max-w-[94vw]') && btn.includes('whitespace-normal') && !btn.includes('whitespace-nowrap'))
const TOAST_TEXT = 'WATCHING — THE PROVEN ROUTE · ANY INPUT TAKES OVER'
rep.check('pin: toast text unchanged (watchcheck contract)', btn.includes(TOAST_TEXT))
const chrome = read('../src/components/GameChrome.jsx')
rep.check('pin: PAUSE stays at 0.75rem + --sat/--sar (model still holds)',
    /top: 'calc\(0\.75rem \+ var\(--sat, 0px\)\)', right: 'calc\(0\.75rem \+ var\(--sar, 0px\)\)'/.test(chrome))
const comet = read('../src/games/CometDriftHD/scene.js')
rep.check('pin: CometDrift CHROME_BAND 46 unchanged (shared chrome law)',
    comet.includes('CHROME_BAND = 46'))

// The banner's real width at 11px mono + tracking-widest + px-3 padding.
const toastTextW = TOAST_TEXT.length * 11 * (MONO_ADV + TRACK) + 24
rep.info('banner real width ≈', `${Math.round(toastTextW)}px at text-[11px] (clamped to 94vw)`)
rep.check('pin: banner at its 50-char length overflows a 360px viewport unwrapped — clamp is load-bearing',
    toastTextW > 360 * 0.94)

// ---- per-game pill + toast ----------------------------------------------------
// style literal → rem offset + required inset var.
const OFF = (s, key) => {
    const m = s.match(new RegExp(`${key}: 'calc\\(([\\d.]+)rem \\+ var\\(--([a-z]{3}), 0px\\)\\)'`))
    return m ? { base: parseFloat(m[1]) * REM, has: m[2] } : null
}

const games = readdirSync(new URL('../src/games/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => read(`../src/games/${d.name}/index.jsx`).includes('WatchButton on='))
    .map((d) => d.name)
rep.check('shelf: every watching title still renders the pill', games.length >= 40, `${games.length} games`)

const REQUIRED_INSET = { top: 'sat', right: 'sar', bottom: 'sab', left: 'sal' }
// #1663: a DOCKED pill sits inside an in-flow chrome band (Zork's status strip)
// — not a float — so there is no PAUSE column to clear and no vertical inset to
// ride. The exemption is pinned positively (dock + --sar must be present) so it
// can never rot into a silent hole.
const DOCKED = ['Zork']
let worstChromeGap = Infinity, worstChromeGame = ''
for (const g of games) {
    const src = read(`../src/games/${g}/index.jsx`)
    if (DOCKED.includes(g)) {
        rep.check(`${g}: docked pill sits in the strip wrapper (in-flow, --sar still rides)`,
            /<div className="relative">[\s\S]{0,1300}WatchButton on=/.test(src)
            && /right: 'calc\(0\.5rem \+ var\(--sar, 0px\)\)'/.test(src))
        continue
    }
    const i = src.indexOf('WatchButton on=')
    const before = src.slice(Math.max(0, i - 600), i).split('\n')
    const wrapper = before.reverse().find((l) => l.includes('style={{')) || ''
    const top = OFF(wrapper, 'top'), bottom = OFF(wrapper, 'bottom')
    const right = OFF(wrapper, 'right'), left = OFF(wrapper, 'left')
    if (!rep.check(`${g}: pill wrapper has a parsed edge style`, wrapper.includes('style={{'))) continue
    // the wrapper must anchor on one vertical and one horizontal edge, and EVERY
    // anchor must ride its inset. (A mutant that drops --sat must land in the
    // failed branch — silently skipping an unparseable edge was a hole in the
    // first version of this gate.)
    const anchorsOk = Boolean(top || bottom) && Boolean(left || right)
    const insetsOk = anchorsOk && [['top', top], ['bottom', bottom], ['right', right], ['left', left]]
        .filter(([, v]) => v)
        .every(([k, v]) => v.has === REQUIRED_INSET[k])
    rep.check(`${g}: pill anchors one vertical + one horizontal edge, each riding its safe-area inset`,
        insetsOk, wrapper.trim().slice(0, 110))
    if (!insetsOk) continue

    for (const vp of VPS) {
        const pill = right
            ? { x: vp.w - right.base - (vp.sar || 0) - PILL_W, y: vp.sat + top.base, w: PILL_W, h: PILL_H }
            : { x: left.base + (vp.sal || 0), y: vp.h - (bottom.base + (vp.sab || 0)) - PILL_H, w: PILL_W, h: PILL_H }
        // fits the viewport
        if (!(pill.x >= 0 && pill.y >= vp.sat && pill.x + pill.w <= vp.w && pill.y + pill.h <= vp.h)) {
            rep.check(`${g}: pill inside ${vp.name}`, false, JSON.stringify(pill))
        }
        if (right) {
            const pz = pauseRect(vp)
            const gap = pill.y - (pz.y + pz.h)
            if (gap < worstChromeGap) { worstChromeGap = gap; worstChromeGame = `${g}/${vp.name}` }
            if (intersect(pill, pz)) rep.check(`${g}: pill clears PAUSE on ${vp.name}`, false, `gap ${gap}`)
        }
    }
    rep.info(`${g} ok`, `${vpSummary()}`)
}
// top-right pills all clear PAUSE with a thumb gap on every modelled viewport
rep.check(`all top-right pills clear PAUSE with ≥${GAP}px gap (worst ${worstChromeGap}px, ${worstChromeGame})`,
    worstChromeGap >= GAP)

function vpSummary() { return `${VPS.length} viewports` }

// ---- toast: explicit overrides must ride --sat; default clears the column ----
for (const g of games) {
    const src = read(`../src/games/${g}/index.jsx`)
    const line = src.split('\n').find((l) => l.includes('<WatchToast'))
    if (!line) continue // some titles toast via their own UI; nothing to pin here
    const clsTop = line.match(/top-\[calc\(([\d.]+)rem \+ var\(--sat/)
    const styTop = line.match(/style=\{\{[^}]*top: 'calc\(([\d.]+)rem \+ var\(--sat/)
    if (clsTop || styTop) {
        rep.check(`${g}: explicit toast top rides --sat`, true, `${(clsTop || styTop)[1]}rem`)
        // explicit overrides must still clear PAUSE + the feedback row
        const y = parseFloat((clsTop || styTop)[1]) * REM
        rep.check(`${g}: toast override clears the chrome band`, y >= BAND + GAP, `${y}px ≥ ${BAND + GAP}px`)
    } else {
        rep.check(`${g}: toast carries no stale top-* class (component law default)`,
            !/\btop-\d/.test(line))
    }
    // the game's own pill, for toast-vs-pill clearance
    const pi = src.indexOf('WatchButton on=')
    const pw = pi >= 0 ? src.slice(Math.max(0, pi - 600), pi).split('\n').reverse().find((l) => l.includes('style={{')) || '' : ''
    const pTop = OFF(pw, 'top'), pBottom = OFF(pw, 'bottom')
    for (const vp of VPS) {
        const y = (clsTop || styTop ? parseFloat((clsTop || styTop)[1]) * REM : 6.75 * REM) + vp.sat
        const bandW = Math.min(toastTextW, vp.w * 0.94)
        const h = toastTextW > vp.w * 0.94 ? TOAST_H2 : TOAST_H1
        const toast = { x: (vp.w - bandW) / 2, y, w: bandW, h }
        if (intersect(toast, pauseRect(vp))) rep.check(`${g}: toast clears PAUSE on ${vp.name}`, false)
        if (intersect(toast, feedbackRect(vp))) rep.check(`${g}: toast clears FEEDBACK on ${vp.name}`, false)
        if (toast.y + toast.h > vp.h) rep.check(`${g}: toast inside ${vp.name}`, false)
        if (pTop) {
            const pill = { x: vp.w - 0.75 * REM - (vp.sar || 0) - PILL_W, y: vp.sat + pTop.base, w: PILL_W, h: PILL_H }
            if (intersect(toast, pill)) rep.check(`${g}: toast clears its pill on ${vp.name}`, false, `toast y ${y} vs pill y ${pill.y}`)
        }
        void pBottom
    }
}

// ---- named HUD corners (the exact crowding #1653 flagged) ---------------------
// LunarLander: right-column readouts ALT(y16)/HORIZ(y40) in a 512x384 stage,
// aspect box centred in the root, HUD text rows (~24px) below it; the canvas
// flex-shrinks no further than its intrinsic height (384).
const llIdx = read('../src/games/LunarLander/index.jsx')
const llSim = read('../src/games/LunarLander/sim.js')
const llWrap = llIdx.slice(0, llIdx.indexOf('WatchButton on=')).split('\n').reverse().find((l) => l.includes('style={{')) || ''
const llPillTop = (OFF(llWrap, 'top') || { base: 3.5 * REM }).base
rep.check('pin: LL stage 512x384 + right-column readouts unchanged',
    llSim.includes('export const W = 512') && llSim.includes('export const H = 384') &&
    llIdx.includes('aspect-[512/384]') && /readout\('ALT'.*W - 10, 16/.test(llIdx) && /readout\('HORIZ'.*W - 10, 40/.test(llIdx))
const LL_BANDS = [[8, 32], [30, 58]]   // canvas-unit glyph bands incl. glow/descender
const ROWS = 24
let llWorst = Infinity
for (const vp of VPS) {
    const stageW = Math.min(vp.w, 900)
    const natural = stageW * 384 / 512
    const h = natural <= vp.h - ROWS ? natural : Math.max(vp.h - ROWS, 384)
    const top = (vp.h - (h + ROWS)) / 2
    const ys = h / 384
    const pill = { x: vp.w - 0.75 * REM - (vp.sar || 0) - PILL_W, y: vp.sat + llPillTop, w: PILL_W, h: PILL_H }
    for (const [b0, b1] of LL_BANDS) {
        const hud = { x: (vp.w - stageW) / 2 + (512 - 10 - 40) * (stageW / 512), y: top + b0 * ys, w: 50, h: (b1 - b0) * ys }
        if (intersect(hud, pill)) rep.check(`LunarLander HUD clears pill on ${vp.name}`, false, JSON.stringify({ hud, pill }))
        const vertGap = hud.y + hud.h <= pill.y ? pill.y - (hud.y + hud.h) : hud.y - (pill.y + pill.h)
        if (hud.x + hud.w > pill.x && vertGap < llWorst) llWorst = vertGap
    }
}
rep.check(`LunarLander ALT/HORIZ keep ≥4px off the pill everywhere (worst ${llWorst.toFixed(1)}px)`, llWorst >= 4)

// MarioKart: place text at canvas (W-10-w, y22), 20px bold mono; backing
// store adapts host aspect, CSS object-contain letterboxes into the viewport.
const mk = read('../src/games/MarioKart/index.jsx')
rep.check('pin: Kart adaptive backing + right-edge place text unchanged',
    mk.includes('LAND_W_MAX = 512') && mk.includes('PORT_W = 256') && mk.includes('PORT_H_MAX = 576') &&
    mk.includes("ctx.fillText(ps, W - 10 - ctx.measureText(ps).width, 22)"))
let mkWorst = Infinity
for (const vp of VPS) {
    let W, H
    if (vp.w / vp.h >= 1) { H = 224; W = Math.max(256, Math.min(512, Math.round(224 * vp.w / vp.h))) }
    else { W = 256; H = Math.min(576, Math.max(224, Math.round(256 * vp.h / vp.w))) }
    const s = Math.min(vp.w / W, vp.h / H)
    const yoff = (vp.h - H * s) / 2
    const pill = { x: vp.w - 0.75 * REM - (vp.sar || 0) - PILL_W, y: vp.sat + 3.5 * REM, w: PILL_W, h: PILL_H }
    const hud = { x: (vp.w - W * s) / 2 + (W - 48) * s, y: yoff + 4 * s, w: 38 * s, h: 23 * s }
    const vertGap = hud.y + hud.h <= pill.y ? pill.y - (hud.y + hud.h) : hud.y - (pill.y + pill.h)
    if (intersect(hud, pill)) rep.check(`MarioKart place text clears pill on ${vp.name}`, false, JSON.stringify({ hud, pill }))
    if (hud.x + hud.w > pill.x && vertGap < mkWorst) mkWorst = vertGap
}
rep.check(`MarioKart place keeps ≥4px off the pill everywhere (worst ${mkWorst.toFixed(1)}px)`, mkWorst >= 4)
rep.info('landscape note', 'LL/Kart margins are 4–14px in landscape by this model — the "looks nice" capture stays a QA job on a healthy node (#1650 lineage)')

// ---- registration audit ---------------------------------------------------------
for (const [f, why] of [['../package.json', 'npm alias'], ['./checks.mjs', 'CORE table'], ['../.github/workflows/ci.yml', 'static job']]) {
    rep.check(`registration: watchpillcheck in ${why}`, read(f).includes('watchpillcheck'))
}

rep.exit()

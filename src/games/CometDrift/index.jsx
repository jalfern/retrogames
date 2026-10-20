import { useEffect, useRef, useState, useCallback } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, decide, stateHash, fmtTime, CFG, LAPS, TIERS, rivalBoostFx } from './sim'
import { TRACK, SCENERY, TEX, TEX_S, COURSE, COURSES, selectCourse, surfaceAt } from './track.js'
import { paletteFor, KART, buildGround, buildSky, buildSprites, minimapPath, sunLayout, rivalViewFx } from './art.js'
import { drawText } from './font.js'
import { engineVoice, driftScrape, sandWhoosh } from './engineSfx.js'
import { padState, steerPedals, smoothSteer, STEER_PIPELINE } from '../../utils/padState'
import { rumble } from '../../components/gamepadMap'

// =====================================================================
// COMET DRIFT GP — SUNSET GULCH, polished (#435). The canvas source is
// ADAPTIVE: it re-solves to the viewport's own aspect (height-anchored in
// landscape, width-anchored in portrait), so the race fills a phone screen
// instead of sitting in it as a letterboxed strip. The camera is low and
// fast with a high horizon; boosts punch the field of view; the HUD is a
// carved instrument cluster mounted in the sky band, never over the road.
// The sim is pure (sim.js); the attract demo is the autopilot's own proven
// 4-lap win. No assets; every pixel and note is synthesized here.
// =====================================================================

// adaptive source bounds (keep the per-frame raster loop bounded on phones)
const LAND_H = 176
const LAND_W_MIN = 256
const LAND_W_MAX = 384
const PORT_W = 256
const PORT_H_MAX = 448
const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

const T = TRACK

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const ABGR = (h) => { const [r, g, b] = hexRGB(h); return 0xff000000 | (b << 16) | (g << 8) | r }

// the dust the canyon kicks up, lifted straight from the apron palette —
// re-anchored whenever the SELECTED course re-tints the world (#493)
let DUST_C = 0
let HAZE = [0, 0, 0]

export default function CometDrift() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const [padOn, setPadOn] = useState(false)
    const pausedRef = useRef(false)
    const gameRef = useRef(null)
    const screenRef = useRef('attract')
    const keysRef = useRef({})
    const tapRef = useRef(null)

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        const host = canvas.parentElement
        let ctx = canvas.getContext('2d')

        // ---- adaptive layout: the source canvas matches the viewport aspect.
        // Landscape anchors on height (a short wide strip would be a lie);
        // portrait anchors on width and grows down, capped for raster cost.
        let W = LAND_W_MAX
        let H = LAND_H
        let HORIZON = Math.round(H * 0.4)
        // #518: Mode 7 keeps its flat ground, but crests and dips are faked
        // with a small horizon bob — uphill (looking up) slides the horizon
        // down the frame, a hilltop view lets it settle back. Smoothed so the
        // line glides over a crest instead of stepping with the point index.
        let HZ = HORIZON
        let horizonSm = HORIZON
        let u = 1
        let hs = 1
        let kscale = 1
        let frame = null
        let px = null
        let map = minimapPath(58, 50)
        const relayout = () => {
            const r = host.getBoundingClientRect()
            const aspect = r.width / Math.max(1, r.height)
            if (aspect >= 1) {
                H = LAND_H
                W = Math.max(LAND_W_MIN, Math.min(LAND_W_MAX, Math.round(LAND_H * aspect)))
            } else {
                W = PORT_W
                H = Math.min(PORT_H_MAX, Math.round(PORT_W / Math.max(0.5, aspect)))
            }
            canvas.width = W; canvas.height = H
            ctx = canvas.getContext('2d')
            ctx.imageSmoothingEnabled = false
            HORIZON = Math.round(H * 0.4)
            HZ = HORIZON; horizonSm = HORIZON
            u = H / 176
            // the HUD scales with the SHORTER axis so it never explodes in
            // portrait, where u runs away with the height
            hs = Math.min(u, W / 256)
            kscale = Math.min(u, W / 240)
            frame = ctx.createImageData(W, H)
            px = new Uint32Array(frame.data.buffer)
            map = minimapPath(Math.round(58 * hs), Math.round(50 * hs))
        }
        relayout()
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => relayout()) : null
        if (ro) ro.observe(host)
        const onWinResize = () => relayout()
        window.addEventListener('resize', onWinResize)

        // per-course look (#493): the ground texture is baked per circuit and
        // cached by course id; the sky/dust/haze constants re-anchor to the
        // selected palette every time the selector moves.
        const sky = buildSky()
        const S = buildSprites()
        const groundCache = {}
        const archCache = {}
        const sceneryCache = {}
        let gnd = null
        let OUT_C = 0
        let FAR_C = 0
        let NEAR_C = 0
        let SUN_C = 0
        let GLOW_C = 0
        let GLINT_C = 0
        let APRON_C = '#000000'
        let SKY_TOP = [0, 0, 0]
        let SKY_MID = [0, 0, 0]
        let SKY_LOW = [0, 0, 0]
        let sunLift = 30
        const applyCourse = (id) => {
            selectCourse(id)
            const pal = paletteFor(COURSE.palette)
            DUST_C = ABGR(pal.apronMid)
            HAZE = hexRGB(pal.skyLow)
            OUT_C = ABGR(pal.apronMid)
            FAR_C = ABGR(pal.mesaFar)
            NEAR_C = ABGR(pal.mesaNear)
            SUN_C = ABGR(pal.sun)
            GLOW_C = ABGR(pal.sunGlow)
            GLINT_C = ABGR(pal.glint)
            APRON_C = pal.apron
            SKY_TOP = hexRGB(pal.skyTop)
            SKY_MID = hexRGB(pal.skyMid)
            SKY_LOW = hexRGB(pal.skyLow)
            sunLift = COURSE.palette === 'noon' ? 74 : 30
            if (!groundCache[COURSE.id]) groundCache[COURSE.id] = new Uint32Array(buildGround(pal).data.buffer)
            gnd = groundCache[COURSE.id]
            map = minimapPath(Math.round(58 * hs), Math.round(50 * hs))
        }
        applyCourse(COURSE.id)

        const g = makeGame(0)
        gameRef.current = g
        const keys = keysRef.current
        const st = { screen: 'attract', endT: 0, plan: true }
        screenRef.current = 'attract'

        const BEST_KEY = 'arcade.comet.bestLap'
        const TOP_KEY = 'arcade.comet.topLaps'
        const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }
        st.best = readBest()
        const readTop = () => {
            try {
                const t = JSON.parse(localStorage.getItem(TOP_KEY) || '[]')
                return Array.isArray(t) ? t.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b).slice(0, 3) : []
            } catch { return [] }
        }
        st.top = readTop()

        let raf = 0; let acc = 0; let last = performance.now()
        let camA = g.karts[0].a
        let shake = 0
        let prevPlace = g.karts[0].place
        // boost feel: the FOV punch lerps toward its target so each tier
        // landing kicks the world back instead of snapping it
        let fovK = 0
        const BASE_PP = 540
        const BASE_BACK = 88
        const CAM_H = 46

        const sfx = (evs, live) => {
            if (!live) return
            // #440 item 5: the pack's gold releases pop a quieter distant
            // sweep — attenuated by the gap to the player, nearest two only
            // so a three-wide release never stacks into a wall of noise.
            const P0 = g.karts[0]
            const distant = []
            for (const ev of evs) {
                if (ev.e === 'count') audioController.playTone(660, 0.12, 'square', 0.12)
                if (ev.e === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.14)
                if (ev.e === 'boost' && ev.who === 'COMET') {
                    audioController.playSweep(300 + ev.tier * 190, 1150 + ev.tier * 170, 0.34 + ev.tier * 0.14, 'square', 0.11 + ev.tier * 0.02)
                    shake = Math.max(shake, 4 + ev.tier * 3)
                }
                if (ev.e === 'boost' && ev.who !== 'COMET') {
                    const K = g.karts.find((k) => k.name === ev.who)
                    if (K) distant.push({ fx: rivalBoostFx(Math.hypot(K.x - P0.x, K.y - P0.y), ev.tier), tier: ev.tier })
                }
                if (ev.e === 'tier' && ev.who === 'COMET') audioController.playSweep(560 + ev.tier * 210, 960 + ev.tier * 280, 0.08, 'square', 0.07)
                if (ev.e === 'spin' && ev.who === 'COMET') { audioController.playNoise(0.35, 0.18); shake = 26; rumble(300, 1) }
                if (ev.e === 'bump' && ev.who === 'COMET') { audioController.playNoise(0.12, 0.15); shake = 10; rumble(100, 0.4) }
                if (ev.e === 'lap' && ev.who === 'COMET') { audioController.playTone(880, 0.1, 'square', 0.12); audioController.playTone(1320, 0.1, 'square', 0.08) }
                if (ev.e === 'end') { if (ev.place === 1) audioController.playFanfare(); else audioController.playDeath() }
            }
            distant.sort((a, b) => b.fx.vol - a.fx.vol)
            for (const d of distant.slice(0, 2)) {
                if (d.fx.vol < 0.004) break
                audioController.playSweep(d.fx.lo, d.fx.hi, d.fx.dur, d.fx.far ? 'triangle' : 'square', d.fx.vol)
            }
        }

        // #440 item 6: the engine bed is a voice, not a metronome. engineVoice
        // (engineSfx.js) is the pure law — pitch rides speed + boost tier and
        // wobbles on two slow sines, the pop period is continuous (no
        // round(v) gear-step) — while driftScrape adds a kerb crackle under
        // held drifts and sandWhoosh a low bed off-road. Phases accumulate
        // here; the laws stay pure so cometcheck can gate them.
        let engAcc = 0; let scrapeAcc = 0; let whooshAcc = 0
        const engine = (live) => {
            if (!live || g.phase !== 'race') { engAcc = 0; scrapeAcc = 0; whooshAcc = 0; return }
            const P = g.karts[0]
            const e = engineVoice(P.v, P.boostT > 0 ? P.boostTier : -1, g.tick)
            if (!e) return
            engAcc += 1 / e.period
            if (engAcc >= 1) { engAcc -= 1; audioController.playTone(e.freq, 0.035, 'square', e.vol) }
            const sc = driftScrape(P.driftT, P.v)
            if (sc) { scrapeAcc += 1 / sc.period; if (scrapeAcc >= 1) { scrapeAcc -= 1; audioController.playFilteredNoise(sc.dur, sc.vol, sc.freq) } } else scrapeAcc = 0
            const ws = sandWhoosh(P.offroad, P.v)
            if (ws) { whooshAcc += 1 / ws.period; if (whooshAcc >= 1) { whooshAcc -= 1; audioController.playFilteredNoise(ws.dur, ws.vol, ws.freq) } } else whooshAcc = 0
        }

        const project = (wx, wy) => {
            const dx = wx - g.karts[0].x; const dy = wy - g.karts[0].y
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            return { f: dx * ca + dy * sa, l: dx * -sa + dy * ca }
        }

        const raster = () => {
            const p = g.karts[0]
            const bobTarget = Math.max(-6, Math.min(6, (p.grade || 0) * 46 + (p.h || 0) * 0.035))
            horizonSm += (bobTarget - horizonSm) * 0.18
            HZ = HORIZON + Math.round(horizonSm)
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const pp = BASE_PP * (1 + fovK)
            const back = BASE_BACK * (1 + fovK * 1.7)
            const cx = p.x - ca * back; const cy = p.y - sa * back
            const aN = ((camA / (Math.PI * 2)) * 512) % 512
            const gN = ((camA / (Math.PI * 2)) * 512) % 512
            const cA = ((camA / (Math.PI * 2)) * 256 * 1.6 + g.tick * 0.03) % 256
            const sun = sunLayout(camA, W, pp, u, HZ, sunLift)
            const sunX = sun.visible ? sun.sunX : W + 4096
            const sunY = sun.sunY
            for (let y = 0; y < HZ; y++) {
                const t = y / Math.max(1, HZ)
                let sr, sg, sb
                if (t < 0.55) { const w = t / 0.55; sr = SKY_TOP[0] + (SKY_MID[0] - SKY_TOP[0]) * w; sg = SKY_TOP[1] + (SKY_MID[1] - SKY_TOP[1]) * w; sb = SKY_TOP[2] + (SKY_MID[2] - SKY_TOP[2]) * w }
                else { const w = (t - 0.55) / 0.45; sr = SKY_MID[0] + (SKY_LOW[0] - SKY_MID[0]) * w; sg = SKY_MID[1] + (SKY_LOW[1] - SKY_MID[1]) * w; sb = SKY_MID[2] + (SKY_LOW[2] - SKY_MID[2]) * w }
                const row = (sr | 0) | ((sg | 0) << 8) | ((sb | 0) << 16) | 0xff000000
                let o = y * W
                for (let x = 0; x < W; x++) {
                    const nh = sky.near[(x + gN | 0) & 511] * u
                    if (y > HZ - nh) { px[o++] = y > HZ - nh + Math.round(3 * u) ? NEAR_C : FAR_C; continue }
                    const fh = sky.far[(x + aN * 0.62 | 0) & 511] * u
                    if (y > HZ - fh) { px[o++] = FAR_C; continue }
                    const dxS = x - sunX; const dyS = y - sunY
                    const d2 = dxS * dxS + dyS * dyS
                    if (d2 < 260 * u * u) { px[o++] = SUN_C; continue }
                    if (d2 < 620 * u * u) { px[o++] = GLOW_C; continue }
                    if (y < HZ - 6 && sky.glint[((y * 256) + ((x + cA) & 255)) | 0]) { px[o++] = GLINT_C; continue }
                    px[o++] = row
                }
            }
            for (let y = HZ; y < H; y++) {
                const dd = (CAM_H * pp) / (y - HZ + 0.6)
                const dl = dd / pp
                const fr = dd > 1700 ? Math.min(0.8, (dd - 1700) / 1250) : 0
                const cosd = ca * dd; const sind = sa * dd
                let wx = cx + cosd + sa * (W / 2) * dl
                let wy = cy + sind - ca * (W / 2) * dl
                const stepX = -sa * dl; const stepY = ca * dl
                let o = y * W
                if (fr > 0) {
                    for (let x = 0; x < W; x++) {
                        const tx = (wx * TEX_S) | 0; const ty = (wy * TEX_S) | 0
                        const c = (tx < 0 || ty < 0 || tx >= TEX || ty >= TEX) ? OUT_C : gnd[ty * TEX + tx]
                        const r = c & 255; const gg = (c >> 8) & 255; const b = (c >> 16) & 255
                        px[o++] = ((r + (HAZE[0] - r) * fr) | 0) | (((gg + (HAZE[1] - gg) * fr) | 0) << 8) | (((b + (HAZE[2] - b) * fr) | 0) << 16) | 0xff000000
                        wx += stepX; wy += stepY
                    }
                } else {
                    for (let x = 0; x < W; x++) {
                        const tx = (wx * TEX_S) | 0; const ty = (wy * TEX_S) | 0
                        px[o++] = (tx < 0 || ty < 0 || tx >= TEX || ty >= TEX) ? OUT_C : gnd[ty * TEX + tx]
                        wx += stepX; wy += stepY
                    }
                }
            }
            ctx.putImageData(frame, 0, 0)
        }

        // the natural sandstone arch that marks the line — each circuit's
        // landmark grew there; the keystone carries the course name (#493)
        const archFor = (name) => {
            if (archCache[name]) return archCache[name]
            const pal = paletteFor(COURSE.palette)
            const c = document.createElement('canvas'); c.width = 300; c.height = 170
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            const leg = (lx) => {
                x.fillStyle = pal.rockMid; x.fillRect(lx, 40, 44, 130)
                x.fillStyle = pal.rimLit; x.fillRect(lx, 40, 44, 5)
                x.fillStyle = pal.rockDark; x.fillRect(lx + 30, 40, 14, 130)
                x.fillStyle = pal.crack
                for (let i = 0; i < 5; i++) x.fillRect(lx + 4 + (i * 17) % 36, 52 + i * 24, 2, 14)
                x.strokeStyle = pal.outline; x.lineWidth = 2; x.strokeRect(lx, 40, 44, 130)
            }
            leg(8); leg(248)
            // the span: a weathered arching band with a darker underside
            x.fillStyle = pal.rockMid
            x.beginPath()
            x.moveTo(8, 52); x.quadraticCurveTo(150, -18, 292, 52); x.lineTo(292, 76); x.quadraticCurveTo(150, 10, 8, 76)
            x.closePath(); x.fill()
            x.strokeStyle = pal.outline; x.lineWidth = 2; x.stroke()
            x.fillStyle = pal.rimLit
            x.beginPath()
            x.moveTo(8, 52); x.quadraticCurveTo(150, -18, 292, 52); x.lineTo(292, 58); x.quadraticCurveTo(150, -12, 8, 58)
            x.closePath(); x.fill()
            // the keystone
            x.fillStyle = pal.rockLight; x.fillRect(138, 12, 24, 26)
            x.strokeStyle = pal.outline; x.lineWidth = 1.6; x.strokeRect(138, 12, 24, 26)
            x.fillStyle = pal.bone; drawText(x, name, 150, 30, pal.bone, 2, 'center')
            archCache[name] = c
            return c
        }
        const S_cactus = () => {
            if (sceneryCache.cactus) return sceneryCache.cactus
            const c = document.createElement('canvas'); c.width = 46; c.height = 90
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            const pal = paletteFor(COURSE.palette)
            x.fillStyle = pal.cactus; x.fillRect(19, 12, 8, 74)
            x.fillStyle = pal.cactusLt; x.fillRect(19, 12, 3, 74)
            x.fillStyle = pal.cactus; x.fillRect(6, 34, 8, 26); x.fillRect(6, 34, 21, 8)
            x.fillRect(32, 46, 8, 22); x.fillRect(19, 46, 21, 8)
            x.strokeStyle = pal.outline; x.lineWidth = 1.5
            x.strokeRect(19, 12, 8, 74)
            sceneryCache.cactus = c
            return c
        }
        const S_hoodoo = () => {
            if (sceneryCache.hoodoo) return sceneryCache.hoodoo
            const c = document.createElement('canvas'); c.width = 90; c.height = 150
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            const pal = paletteFor(COURSE.palette)
            x.fillStyle = pal.hoodoo
            x.beginPath(); x.moveTo(24, 150); x.lineTo(36, 34); x.lineTo(56, 40); x.lineTo(64, 150); x.closePath(); x.fill()
            x.fillStyle = pal.rockDark
            x.beginPath(); x.moveTo(56, 40); x.lineTo(64, 150); x.lineTo(48, 150); x.closePath(); x.fill()
            x.fillStyle = pal.hoodooCap
            x.beginPath(); x.moveTo(22, 40); x.lineTo(36, 24); x.lineTo(60, 30); x.lineTo(70, 44); x.closePath(); x.fill()
            x.strokeStyle = pal.outline; x.lineWidth = 1.5; x.stroke()
            x.fillStyle = pal.crack; x.fillRect(40, 60, 2, 18); x.fillRect(48, 92, 2, 16)
            sceneryCache.hoodoo = c
            return c
        }

        const drawSprites = () => {
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
            const items = []
            for (const k of g.karts.slice(1)) {
                const sf = k.steerVis < 0 ? 0 : k.steerVis > 0 ? 2 : 1
                items.push({ x: k.x, y: k.y, a: k.a, img: S[k.color][sf][(k.anim >> 2) & 1], w: KART.w, h: KART.h, o: k })
            }
            for (const sc of SCENERY) {
                const img = sc.kind === 'cactus' ? S_cactus() : S_hoodoo()
                items.push({ x: sc.x, y: sc.y, a: 0, img, w: sc.kind === 'cactus' ? 46 : 90, h: sc.kind === 'cactus' ? 90 : 150 })
            }
            const s0 = T.pts[0]
            items.push({ x: s0.x, y: s0.y, a: 0, img: archFor(COURSE.short), w: 300, h: 170 })
            items.sort((a, b) => {
                const fa = project(a.x, a.y).f; const fb = project(b.x, b.y).f
                return fb - fa
            })
            for (const it of items) {
                const pr = project(it.x, it.y)
                if (pr.f < 30 || pr.f > 2600) continue
                const s = BASE_PP / pr.f
                const sy = HZ + CAM_H * s
                const sx = W / 2 + pr.l * s
                let w = Math.min(W * 2, it.w * s * 0.9); let h = Math.min(H * 1.6, it.h * s * 0.9)
                if (sx + w < 0 || sx - w > W) continue
                // #440 item 2: a rival that covers the view darkens and shrinks
                // so the road ahead stays readable during contact racing.
                const rv = it.o ? rivalViewFx(h, H) : { s: 1, alpha: 1 }
                w *= rv.s; h *= rv.s
                ctx.globalAlpha = 0.22 * rv.alpha
                ctx.fillStyle = '#000'
                ctx.fillRect(sx - w / 2, sy - 3 * s, w, 6 * s)
                ctx.globalAlpha = rv.alpha
                ctx.save()
                ctx.translate(sx, sy - h / 2)
                if (it.o) ctx.rotate(it.o.a - camA)
                ctx.drawImage(it.img, -w / 2, -h / 2, w, h)
                if (it.o && it.o.braking && h > 10) {
                    // brake lights: twin red lamps in the tail, haloed when the
                    // pack is close enough to matter (#426)
                    const ps = w / KART.w
                    ctx.fillStyle = 'rgba(255,64,32,0.32)'
                    ctx.fillRect(-w / 2 + 21 * ps, -h / 2 + 43 * ps, 13 * ps, 8 * ps)
                    ctx.fillRect(-w / 2 + 42 * ps, -h / 2 + 43 * ps, 13 * ps, 8 * ps)
                    ctx.fillStyle = '#ff2818'
                    ctx.fillRect(-w / 2 + 24 * ps, -h / 2 + 45 * ps, 7 * ps, 4 * ps)
                    ctx.fillRect(-w / 2 + 45 * ps, -h / 2 + 45 * ps, 7 * ps, 4 * ps)
                }
                ctx.restore()
            }
            ctx.restore()
            const P = g.karts[0]
            const tilt = P.spinT > 0 ? g.tick * 0.32 : P.steerVis * 0.18 + (P.driftT ? P.steerVis * 0.24 : 0)
            const bounce = P.offroad && P.v > 1 ? (g.tick >> 1) % 2 : 0
            const pw = Math.round(KART.w * 1.3 * kscale)
            const ph = Math.round(pw * KART.h / KART.w)
            ctx.save()
            ctx.translate(W / 2, H - Math.round(12 * kscale) + bounce)
            ctx.rotate(tilt)
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-pw * 0.44, -3, pw * 0.88, Math.round(6 * kscale))
            const sf = P.steerVis < 0 ? 0 : P.steerVis > 0 ? 2 : 1
            const rf = P.v > 0.4 ? (P.anim >> 2) & 1 : 0
            ctx.drawImage(S.comet[sf][rf], -pw / 2, -ph, pw, ph)
            if (P.braking) {
                const ps = pw / KART.w
                ctx.fillStyle = 'rgba(255,64,32,0.32)'
                ctx.fillRect(-pw / 2 + 21 * ps, -ph + 43 * ps, 13 * ps, 8 * ps)
                ctx.fillRect(-pw / 2 + 42 * ps, -ph + 43 * ps, 13 * ps, 8 * ps)
                ctx.fillStyle = '#ff2818'
                ctx.fillRect(-pw / 2 + 24 * ps, -ph + 45 * ps, 7 * ps, 4 * ps)
                ctx.fillRect(-pw / 2 + 45 * ps, -ph + 45 * ps, 7 * ps, 4 * ps)
            }
            if (P.boostT > 0) {
                // the tier ladder, written in flame: short blue, violet, then
                // the long gold comet
                const hot = P.boostTier >= 2 ? '#58f8f8' : P.boostTier === 1 ? '#b888f8' : '#58b8f8'
                const fl = Math.round((10 + P.boostTier * 9) * kscale)
                ctx.fillStyle = (g.tick >> 1) % 2 ? hot : '#f8d800'
                ctx.fillRect(-pw * 0.34, -6, Math.round(12 * kscale), fl)
                ctx.fillRect(pw * 0.34 - Math.round(12 * kscale), -6, Math.round(12 * kscale), fl - ((g.tick >> 1) % 3))
            }
            ctx.restore()
        }

        // renderer-only FX (particles, streaks): jitter is a pure function of
        // the tick, never Math.random, so replays match.
        const fx = { sparks: [], dust: [] }
        const jit = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }
        const stepFx = (P) => {
            if (P.driftT > 0 && P.v > 1) {
                const dir = P.steerVis || 1
                for (let i = 0; i < 2; i++) {
                    const side = i ? 1 : -1
                    fx.sparks.push({ x: W / 2 + side * 26 * kscale, y: H - 8 * kscale,
                        vx: -dir * (0.3 + jit(g.tick + i) * 0.7) + side * 0.7,
                        vy: 0.5 + jit(g.tick * 1.7 + i) * 1.3, life: 12 })
                    // the canyons signature: held drifts kick apron dust
                    fx.dust.push({ x: W / 2 + side * (20 + jit(g.tick * 2.3 + i) * 14) * kscale, y: H - (6 + jit(g.tick + i * 5) * 8) * kscale,
                        vx: side * (0.4 + jit(g.tick * 1.1 + i) * 0.6), vy: -0.2 - jit(g.tick * 1.9 + i) * 0.5, life: 20, r: 3 })
                }
            } else if (P.spinT > 0) {
                for (let i = 0; i < 3; i++) fx.dust.push({ x: W / 2 + (jit(g.tick * 3.1 + i) - 0.5) * 44 * kscale,
                    y: H - 10 * kscale, vx: (jit(g.tick * 1.3 + i) - 0.5) * 1.3, vy: 0.2 + jit(g.tick * 2.1 + i) * 0.5, life: 18, r: 4 })
            }
            if (P.offroad && P.v > 2 && (g.tick & 1) === 0) fx.dust.push({ x: W / 2 + (jit(g.tick) - 0.5) * 30 * kscale, y: H - 6 * kscale, vx: 0, vy: -0.3, life: 14, r: 3 })
            for (const s of fx.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.life-- }
            fx.sparks = fx.sparks.filter((s) => s.life > 0 && s.y < H + 4)
            for (const d of fx.dust) { d.x += d.vx; d.y += d.vy; d.r += 0.22; d.life-- }
            fx.dust = fx.dust.filter((d) => d.life > 0)
            if (fx.sparks.length > 160) fx.sparks.splice(0, fx.sparks.length - 160)
            if (fx.dust.length > 160) fx.dust.splice(0, fx.dust.length - 160)
        }
        const drawFx = () => {
            const P = g.karts[0]
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
            for (const d of fx.dust) {
                ctx.globalAlpha = Math.max(0, d.life / 24) * 0.55
                ctx.fillStyle = APRON_C
                ctx.fillRect(d.x, d.y, d.r * u, d.r * u)
            }
            const tier = P.charge >= TIERS[2].t ? 2 : P.charge >= TIERS[1].t ? 1 : P.charge >= TIERS[0].t ? 0 : -1
            for (const s of fx.sparks) {
                ctx.globalAlpha = Math.max(0, s.life / 12)
                ctx.fillStyle = tier === 2 ? '#ffd840' : tier === 1 ? '#c088ff' : tier === 0 ? '#58c8ff' : s.life > 7 ? '#fff2a0' : '#f8b020'
                ctx.fillRect(s.x, s.y, 2, 2)
            }
            // edge streaks: the canyon walls smearing past at speed. Lines
            // live near the left/right borders and run downward, longer and
            // denser on boost — the speed sensation lives at the edges.
            if (P.boostT > 0 || P.v > 7.6) {
                const boost = P.boostT > 0
                const n = boost ? 12 : 7
                for (let i = 0; i < n; i++) {
                    const side = i % 2 ? 1 : -1
                    const x0 = W / 2 + side * (W * (0.36 + jit(i * 7.3 + (g.tick >> 2)) * 0.13))
                    const y0 = HZ + jit(i * 3.1 + g.tick) * (H - HZ) * 0.5
                    const len = (24 + (boost ? 44 : 14) + jit(i + g.tick * 0.7) * 18) * u
                    ctx.globalAlpha = 0.22 + 0.3 * jit(i + g.tick * 0.5)
                    ctx.strokeStyle = boost && P.boostTier >= 1 ? '#ffe8c0' : '#e8c8a0'
                    ctx.lineWidth = Math.max(1, u)
                    ctx.beginPath()
                    ctx.moveTo(x0, y0)
                    ctx.lineTo(x0 + side * len * 0.22, y0 + len)
                    ctx.stroke()
                }
                if (boost) {
                    // tiered tunnel vignette so each level reads differently
                    ctx.globalAlpha = 0.1 + P.boostTier * 0.05
                    ctx.fillStyle = P.boostTier >= 2 ? '#28104a' : P.boostTier === 1 ? '#241034' : '#1c0e26'
                    ctx.fillRect(0, 0, Math.round(W * 0.1), H)
                    ctx.fillRect(Math.round(W * 0.9), 0, Math.round(W * 0.1), H)
                }
            }
            ctx.globalAlpha = 1
            ctx.restore()
        }

        const panel = (x, y, w, h) => {
            ctx.fillStyle = 'rgba(26,11,15,0.84)'
            ctx.fillRect(x, y, w, h)
            ctx.fillStyle = 'rgba(120,74,52,0.9)'
            ctx.fillRect(x, y, w, 1)
            ctx.fillRect(x, y, 1, h)
            ctx.fillStyle = 'rgba(0,0,0,0.7)'
            ctx.fillRect(x, y + h - 1, w, 1)
            ctx.fillRect(x + w - 1, y, 1, h)
        }
        const dsz = (sz) => Math.max(1, Math.round(sz * hs / 5))

        const tierReached = (charge) => {
            let t = -1
            for (let i = 0; i < TIERS.length; i++) if (charge >= TIERS[i].t) t = i
            return t
        }

        const LIVERY_DOT = {
            comet: '#28c8e8', blaze: '#e02818', dusty: '#d8781c', nova: '#f0c020',
            rex: '#28a038', zeppa: '#9030c8', grizz: '#6a7058',
        }

        // the instrument cluster: everything lives in the sky band, so the
        // road below is never covered
        const drawHud = () => {
            const P = g.karts[0]
            // POS badge
            panel(2 * hs, 2 * hs, 34 * hs, 27 * hs)
            drawText(ctx, 'POS', Math.round(5 * hs), Math.round(11 * hs), '#b08460', dsz(8))
            const suff = ['ST', 'ND', 'RD', 'TH', 'TH', 'TH', 'TH'][P.place - 1]
            drawText(ctx, `${P.place}${suff}`, Math.round(5 * hs), Math.round(25 * hs), P.place === 1 ? '#ffd840' : '#f2e6d2', dsz(17))
            // speed + drift ladder under the badge
            panel(2 * hs, 31 * hs, 58 * hs, 28 * hs)
            drawText(ctx, `${Math.round(P.v * 19.5)} KM/H`, Math.round(5 * hs), Math.round(40 * hs), '#f2e6d2', dsz(9))
            ctx.fillStyle = '#3a2430'; ctx.fillRect(Math.round(5 * hs), Math.round(44 * hs), Math.round(52 * hs), Math.round(7 * hs))
            const barW = Math.round(P.v / (CFG.top + TIERS[Math.max(P.boostTier, 0)].over) * 52 * hs)
            ctx.fillStyle = P.boostT > 0 ? '#ffd840' : P.offroad ? '#f85820' : '#38d898'
            ctx.fillRect(Math.round(5 * hs), Math.round(44 * hs), Math.min(Math.round(52 * hs), barW), Math.round(7 * hs))
            // the drift ladder as chevrons, blue violet gold, brighter while
            // the current tier is being held
            for (let i = 0; i < 3; i++) {
                const held = P.driftT > 0 && tierReached(P.charge) >= i
                const pulse = held && tierReached(P.charge) === i && (g.tick >> 2) % 2 === 0
                ctx.fillStyle = held ? (pulse ? '#ffffff' : i === 2 ? '#ffd840' : i === 1 ? '#c088ff' : '#58c8ff') : '#3a2430'
                const cx = Math.round((11 + i * 8) * hs); const cy = Math.round(54 * hs)
                ctx.beginPath()
                ctx.moveTo(cx - 3 * hs, cy - 2 * hs); ctx.lineTo(cx, cy); ctx.lineTo(cx - 3 * hs, cy + 2 * hs)
                ctx.lineTo(cx - 1.5 * hs, cy); ctx.closePath(); ctx.fill()
            }
            // LAP plate, centre-top
            panel(Math.round((W - 78 * hs) / 2), Math.round(2 * hs), Math.round(78 * hs), Math.round(26 * hs))
            ctx.textAlign = 'center'
            drawText(ctx, 'LAP', Math.round(W / 2), Math.round(10 * hs), '#b08460', dsz(8), 'center')
            drawText(ctx, `${Math.min(P.lap + 1, LAPS)}/${LAPS}  ${fmtTime(Math.max(0, g.tick - P.lapStart))}`, Math.round(W / 2), Math.round(23 * hs), '#f2e6d2', dsz(11), 'center')
            drawText(ctx, COURSE.short, Math.round(W / 2), Math.round(37 * hs), '#b08460', dsz(7), 'center')
            ctx.textAlign = 'left'
            // minimap, right
            const mw = Math.round(58 * hs); const mh = Math.round(50 * hs)
            const mx = Math.round(W - mw - 2 * hs); const my = Math.round(2 * hs)
            panel(mx, my, mw, mh)
            ctx.strokeStyle = '#8a5c3c'; ctx.lineWidth = Math.max(1, Math.round(1.6 * hs))
            ctx.beginPath()
            for (let i = 0; i < map.pts.length; i++) {
                const [qx, qy] = map.pts[i]
                if (i === 0) ctx.moveTo(mx + qx, my + qy); else ctx.lineTo(mx + qx, my + qy)
            }
            ctx.closePath(); ctx.stroke()
            for (let i = g.karts.length - 1; i >= 0; i--) {
                const k = g.karts[i]
                const [qx, qy] = map.project(k.x, k.y)
                ctx.fillStyle = k.isPlayer ? '#28c8e8' : (LIVERY_DOT[k.color] || '#e8dcc4')
                const ds = Math.max(2, Math.round((k.isPlayer ? 4 : 3) * hs))
                ctx.fillRect(mx + qx - ds / 2, my + qy - ds / 2, ds, ds)
            }
            if (st.screen !== 'attract' && (g.phase === 'count' || (g.phase === 'race' && g.tick - P.lapStart < 40))) {
                ctx.textAlign = 'center'
                drawText(ctx, g.phase === 'race' ? 'GO!' : String(Math.ceil(g.count / 60)), W / 2, HZ + Math.round(34 * hs), g.phase === 'race' ? '#38e878' : '#f2e6d2', dsz(44), 'center')
                ctx.textAlign = 'left'
            }
        }

        // attract / end screens ride the same carved panels, strata-trimmed
        const strataBar = (y, w) => {
            const pal = paletteFor(COURSE.palette)
            const cols = [pal.rimLit, pal.rockMid, pal.rockDark]
            cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(Math.round((W - w) / 2), Math.round(y + i * 2 * hs), w, Math.max(1, Math.round(2 * hs))) })
        }
        const drawAttract = () => {
            ctx.fillStyle = 'rgba(20,8,12,0.62)'
            ctx.fillRect(0, Math.round(H * 0.18), W, Math.round(H * 0.6))
            strataBar(Math.round(H * 0.18), W)
            strataBar(Math.round(H * 0.78) - Math.round(6 * hs), W)
            ctx.textAlign = 'center'
            drawText(ctx, 'COMET', W / 2 + 2, Math.round(H * 0.33) + 2, '#7c2010', dsz(24), 'center')
            drawText(ctx, 'COMET', W / 2, Math.round(H * 0.33), '#f2e6d2', dsz(24), 'center')
            drawText(ctx, 'DRIFT GP', W / 2, Math.round(H * 0.33) + Math.round(24 * hs), '#ffd840', dsz(24), 'center')
            // course selector (#493): ←/→ cycles the circuit, the line label
            // names what you picked; every other key or a tap races it
            drawText(ctx, '<', Math.round(W / 2 - 92 * hs), Math.round(H * 0.47), '#8a5c3c', dsz(11), 'center')
            drawText(ctx, '>', Math.round(W / 2 + 88 * hs), Math.round(H * 0.47), '#8a5c3c', dsz(11), 'center')
            drawText(ctx, COURSE.name, W / 2, Math.round(H * 0.47), '#f2e6d2', dsz(11), 'center')
            const msgs = [COURSE.tagline, '< > PICK COURSE  X GAS  S BRAKE', 'HOLD SPACE / B THROUGH A BEND = TURBO', 'BLUE VIOLET GOLD - THE LADDER PAYS']
            drawText(ctx, msgs[Math.floor(g.tick / 120) % msgs.length], W / 2, Math.round(H * 0.55), '#f0b878', dsz(10), 'center')
            if (st.top.length) {
                for (let i = 0; i < st.top.length; i++) {
                    drawText(ctx, i === 0 ? `BEST  ${fmtTime(st.top[i])}` : ` #${i + 1}  ${fmtTime(st.top[i])}`, W / 2, Math.round(H * 0.62 + i * 9 * hs), i === 0 ? '#ffd840' : '#b090a8', dsz(8), 'center')
                }
            }
            if ((g.tick >> 5) % 2) {
                drawText(ctx, 'PRESS ANY KEY / TAP', W / 2, Math.round(H * 0.74), '#f2e6d2', dsz(10), 'center')
            }
            ctx.textAlign = 'left'
        }

        const drawEnd = () => {
            const P = g.karts[0]
            ctx.fillStyle = 'rgba(20,8,12,0.74)'; ctx.fillRect(0, Math.round(H * 0.2), W, Math.round(H * 0.52))
            strataBar(Math.round(H * 0.2), W)
            ctx.textAlign = 'center'
            drawText(ctx, g.end === 'win' ? `${COURSE.short} CHAMPION!` : `${P.place}TH PLACE`, W / 2, Math.round(H * 0.36), g.end === 'win' ? '#ffd840' : '#f85820', dsz(22), 'center')
            drawText(ctx, `TIME ${fmtTime(P.finishT || g.tick)}  BEST ${st.best ? fmtTime(st.best) : '--'}`, W / 2, Math.round(H * 0.45), '#f2e6d2', dsz(11), 'center')
            if (P.lapTimes.length) {
                drawText(ctx, 'SPLITS ' + P.lapTimes.map((t) => (t / 60).toFixed(1)).join(' '), W / 2, Math.round(H * 0.52), '#f0b878', dsz(8), 'center')
            }
            if ((g.tick >> 5) % 5 < 3) { drawText(ctx, 'TAP OR ANY KEY', W / 2, Math.round(H * 0.63), '#f2e6d2', dsz(11), 'center') }
            ctx.textAlign = 'left'
        }

        let steerSm = 0
        const tickWorld = (live) => {
            // #431: stick steering is curve+gain mapped and smoothed R/tick;
            // keyboard steering keeps its raw ±1.
            const p = padState
            const padLive = p.engaged || p.rt > 0.05 || p.lt > 0.05
            let inp
            if (st.plan) {
                inp = decide(g)
            } else if (padLive) {
                const s = steerPedals(p)
                steerSm = smoothSteer(steerSm, s.steer)
                inp = { steer: steerSm, thr: s.thr, brk: s.brk, drift: !!(keys.Space || keys.KeyR || keys.KeyC) }
            } else {
                steerSm = 0
                inp = { u: !!(keys.KeyX || keys.ArrowUp), d: !!(keys.KeyS || keys.ArrowDown), l: !!keys.ArrowLeft, r: !!keys.ArrowRight, drift: !!(keys.Space || keys.KeyZ || keys.KeyR || keys.KeyC) }
            }
            step(g, live ? inp : decide(g))
            const evs = g.events.splice(0)
            if (import.meta.env.DEV) {
                const log = (window.__cometLog ||= [])
                for (const ev of evs) log.push({ ...ev, t: g.tick })
                if (log.length > 2000) log.splice(0, log.length - 2000)
            }
            sfx(evs, live)
            engine(live)
            if (PplaceRose(evs, live)) audioController.playTone(990, 0.06, 'square', 0.08)
            if (live) {
                for (const ev of evs) {
                    if (ev.e === 'lap' && ev.who === 'COMET' && ev.t > 60) {
                        if (!st.best || ev.t < st.best) {
                            st.best = ev.t
                            try { localStorage.setItem(BEST_KEY, String(ev.t)) } catch { /* private mode */ }
                        }
                        st.top.push(ev.t); st.top.sort((a, b) => a - b); st.top = st.top.slice(0, 3)
                        try { localStorage.setItem(TOP_KEY, JSON.stringify(st.top)) } catch { /* private mode */ }
                    }
                }
            }
            if (!live && g.end) { st.endT++; if (st.endT > 240) { Object.assign(g, makeGame(0)); st.endT = 0 } }
            if (live && g.end) { st.screen = 'end'; screenRef.current = 'end'; st.endT = 0; setPadOn(false) }
        }
        const PplaceRose = (evs, live) => {
            if (!live) return false
            const rose = g.karts[0].place < prevPlace
            prevPlace = g.karts[0].place
            return rose
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, 250); last = now
            if (contractHoldsLoop()) { acc = 0 }
            else {
                while (acc >= 1000 / 60) {
                    acc -= 1000 / 60
                    if (!pausedRef.current) tickWorld(st.screen === 'race')
                    const P = g.karts[0]
                    // a held drift lags the camera: the view keeps pointing
                    // into the bend while the kart slides out of it
                    const want = P.a
                    let da = want - camA
                    while (da > Math.PI) da -= Math.PI * 2
                    while (da < -Math.PI) da += Math.PI * 2
                    camA += da * (P.driftT > 0 ? 0.055 : 0.12)
                    const fovTarget = P.boostT > 0 ? 0.05 + P.boostTier * 0.035 : 0
                    fovK += (fovTarget - fovK) * 0.08
                }
            }
            const shk = shake > 0 ? ((shake-- % 4) - 1.5) : 0
            stepFx(g.karts[0])
            ctx.save()
            ctx.translate(shk, 0)
            raster()
            drawFx()
            drawSprites()
            ctx.restore()
            drawHud()
            if (st.screen === 'attract') drawAttract()
            if (st.screen === 'end') drawEnd()
        }

        const resetTo = (screen) => {
            Object.assign(g, makeGame(0))
            st.screen = screen; screenRef.current = screen
            st.plan = screen === 'attract'
            st.endT = 0
            prevPlace = g.karts[0].place
            camA = g.karts[0].a
            setPadOn(screen === 'race')
        }

        const cycleCourse = (dir) => {
            const i = Math.max(0, COURSES.findIndex((c) => c.id === COURSE.id))
            applyCourse(COURSES[(i + dir + COURSES.length) % COURSES.length].id)
            Object.assign(g, makeGame(0))
            st.endT = 0
            prevPlace = g.karts[0].place
            camA = g.karts[0].a
            fx.sparks.length = 0; fx.dust.length = 0
            audioController.playTone(540 + dir * 120, 0.06, 'square', 0.07)
        }

        tapRef.current = () => {
            if (pausedRef.current) return
            if (st.screen === 'attract') { audioController.init(); resetTo('race') }
            else if (st.screen === 'end') resetTo('attract')
        }

        const kd = (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyX', 'KeyS', 'KeyZ', 'KeyR'].includes(e.code)) e.preventDefault()
            if (e.code === 'Question' || e.key === '?') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (pausedRef.current) return
            if (st.screen === 'attract') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { cycleCourse(e.code === 'ArrowRight' ? 1 : -1); return }
                audioController.init()
                resetTo('race')
                return
            }
            if (st.screen === 'end') {
                st.endT++
                if (st.endT > 20) resetTo('attract')
                return
            }
            keys[e.code] = true
        }
        const ku = (e) => { keys[e.code] = false }
        window.addEventListener('keydown', kd)
        window.addEventListener('keyup', ku)
        raf = requestAnimationFrame(loop)

        const unmount = mountDbg({
            title: 'COMET DRIFT GP',
            getState: () => {
                const P = g.karts[0]
                return [
                    `screen ${st.screen}  phase ${g.phase}  end ${g.end}  course ${COURSE.id}`,
                    `pos ${P.place}/${g.karts.length}  lap ${P.lap}/${LAPS}  v ${P.v.toFixed(2)}`,
                    `surf ${surfaceAt(P.x, P.y, P.hint).surf}  spin ${P.spinT}  boost ${P.boostT}/tier ${P.boostTier}`,
                    `drift ${P.driftT} charge ${P.charge}  view ${W}x${H}@${u.toFixed(2)}  tick ${g.tick}`,
                ]
            },
            actions: [
                { label: 'teleport to grid', run: () => { const P = g.karts[0]; const p = T.pts[2]; P.x = p.x; P.y = p.y; P.idx = 2; P.hint = 2; P.a = p.a; return 'ok' } },
                { label: 'gold turbo', run: () => { g.karts[0].boostT = 90; g.karts[0].boostTier = 2; return 'gold' } },
                { label: 'instant lap', run: () => { const P = g.karts[0]; P.lap = Math.min(LAPS - 1, P.lap + 1); return `lap ${P.lap}` } },
                { label: 'skip countdown', run: () => { g.count = 1; return 'go' } },
            ],
        })

        window.__cometTest = {
            game: () => g,
            keys,
            screen: () => st.screen,
            view: () => ({ w: W, h: H, horizon: HORIZON, horizonNow: HZ, scale: u }),
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            course: () => COURSE.id,
            courses: () => COURSES.map((c) => c.id),
            setCourse: (id) => { applyCourse(id); Object.assign(g, makeGame(0)); camA = g.karts[0].a; return COURSE.id },
            cycleCourse: (dir) => { cycleCourse(dir | 0); return COURSE.id },
            best: () => st.best,
            fx: () => {
                const P = g.karts[0]
                return { sparks: fx.sparks.length, dust: fx.dust.length,
                    frame: P.v > 0.4 ? ((P.anim >> 2) & 1) : 0, driftT: P.driftT, charge: P.charge, boostT: P.boostT, spinT: P.spinT, v: P.v }
            },
            forceSpin: () => { g.karts[0].spinT = 90; return g.karts[0].spinT },
            // bike-harness precedent (__bikeTest.setup): place the kart, keep
            // the rules the sim's. Seeds position/speed on a chosen track
            // point; every consequence still comes from real physics + real keys.
            setup: (o = {}) => {
                const P = g.karts[0]
                if (typeof o.i === 'number') {
                    const p = TRACK.pts[((o.i % TRACK.N) + TRACK.N) % TRACK.N]
                    P.x = p.x; P.y = p.y; P.a = p.a; P.idx = ((o.i % TRACK.N) + TRACK.N) % TRACK.N; P.hint = P.idx
                }
                if (typeof o.v === 'number') P.v = o.v
                if (typeof o.spinT === 'number') P.spinT = o.spinT
                if (o.go) { g.phase = 'race'; g.count = 0 }
                camA = P.a
                const s = surfaceAt(P.x, P.y, P.hint)
                return { x: P.x, y: P.y, v: P.v, surf: s.surf, lat: s.lat }
            },
            surf: () => surfaceAt(g.karts[0].x, g.karts[0].y, g.karts[0].hint).surf,
            pos: () => {
                const s = surfaceAt(g.karts[0].x, g.karts[0].y, g.karts[0].hint)
                return { surf: s.surf, lat: s.lat }
            },
        }

        exposeGame({
            id: 'comet-drift',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            steer: STEER_PIPELINE,
            reset: (seed) => {
                Object.assign(g, makeGame(seed))
                st.screen = 'race'; screenRef.current = 'race'
                st.plan = false
                st.endT = 0
                prevPlace = g.karts[0].place
                camA = g.karts[0].a
                setPadOn(false)
            },
            tick: (pad) => {
                if (g.end) { g.tick += 1; return }
                step(g, {
                    u: !!pad.up, d: !!pad.down, l: !!pad.left, r: !!pad.right,
                    a: !!pad.a, b: !!pad.b,
                    steer: typeof pad.x === 'number' && Math.abs(pad.x) > 0.08 ? pad.x : undefined,
                    thr: typeof pad.rt === 'number' && pad.rt > 0.05 ? pad.rt : undefined,
                    brk: typeof pad.lt === 'number' && pad.lt > 0.05 ? pad.lt : undefined,
                })
            },
            state: () => {
                const P = g.karts[0]
                return {
                    tick: g.tick, score: Math.round(P.lap * T.len + T.pts[P.idx].s), done: !!g.end,
                    course: COURSE.id,
                    place: P.place, lap: P.lap, phase: g.phase, v: Math.round(P.v * 100) / 100,
                    hash: stateHash(g),
                }
            },
            canvas: () => canvas,
            snapshot: () => JSON.parse(JSON.stringify(g)),
            restore: (s) => { Object.assign(g, s) },
        })

        return () => {
            cancelAnimationFrame(raf)
            if (ro) ro.disconnect()
            window.removeEventListener('resize', onWinResize)
            window.removeEventListener('keydown', kd)
            window.removeEventListener('keyup', ku)
            unmount()
            delete window.__cometTest
            unexposeGame()
        }
    }, [])

    return (
        <div
            className="relative flex flex-col items-center justify-center w-full h-full bg-black select-none"
            onPointerDown={() => tapRef.current && tapRef.current()}
        >
            <canvas ref={canvasRef} data-fit="source" width={LAND_W_MAX} height={LAND_H} className="block w-full h-full" style={{ imageRendering: 'pixelated', touchAction: 'none' }} />
            <VirtualControls visible={padOn && !paused && TOUCH} />
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'COMET DRIFT GP')} onResume={handleResume} />}
        </div>
    )
}

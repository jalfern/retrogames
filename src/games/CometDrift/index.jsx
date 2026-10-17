import { useEffect, useRef, useState, useCallback } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeFitCanvas } from '../../utils/fitCanvas'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, decide, stateHash, fmtTime, CFG, LAPS, TIERS } from './sim'
import { TRACK, TX, TY } from './track.js'
import { PALETTE, KART, buildGround, buildSky, buildSprites, minimapPath } from './art.js'
import { padState, steerPedals } from '../../utils/padState'

// =====================================================================
// COMET DRIFT GP — the arcade's original Mode 7 racer. SUNSET GULCH is
// ONE textured plane rotated and scaled under the camera scanline by
// scanline (the SNES trick, applied to a course of our own). The sim is
// pure (sim.js); the attract demo is the autopilot's own proven 4-lap
// win replayed tick for tick. No assets; every pixel and note is
// synthesized here.
// =====================================================================

const W = 256
const H = 224
const HORIZON = 84
const PLAY_H = 200
const CAM_H = 52
const PP = 520
const BACK = 92
const HAZE = [0xc8, 0x78, 0x48]
const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

const T = TRACK
const PW = Math.round(KART.w * 1.35)
const PH = Math.round(PW * KART.h / KART.w)
const PBOT = 34

const LIVERY_DOT = {
    comet: '#28c8e8', blaze: '#e02818', dusty: '#d8781c', nova: '#f0c020',
    rex: '#28a038', zeppa: '#9030c8', grizz: '#6a7058',
}

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
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        const fit = makeFitCanvas(canvas, canvas.parentElement)
        const ground = buildGround()
        const gnd = new Uint32Array(ground.data.buffer)
        const sky = buildSky()
        const S = buildSprites()
        const MAP = minimapPath(58, 54)
        const frame = ctx.createImageData(W, PLAY_H)
        const px = new Uint32Array(frame.data.buffer)
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

        const sfx = (evs, live) => {
            if (!live) return
            for (const ev of evs) {
                if (ev.e === 'count') audioController.playTone(660, 0.12, 'square', 0.12)
                if (ev.e === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.14)
                if (ev.e === 'boost') audioController.playSweep(320 + ev.tier * 160, 1100 + ev.tier * 150, 0.32 + ev.tier * 0.1, 'square', 0.11)
                if (ev.e === 'spin' && ev.who === 'PLAYER') { audioController.playNoise(0.35, 0.18); shake = 26 }
                if (ev.e === 'bump' && ev.who === 'PLAYER') { audioController.playNoise(0.12, 0.15); shake = 10 }
                if (ev.e === 'lap' && ev.who === 'PLAYER') { audioController.playTone(880, 0.1, 'square', 0.12); audioController.playTone(1320, 0.1, 'square', 0.08) }
                if (ev.e === 'end') { if (ev.place === 1) audioController.playFanfare(); else audioController.playDeath() }
            }
        }

        // the placeholder engine loop: a buzz whose pitch and rate ride the
        // speed — the only "music" this cartridge ships (per #419 scope).
        const engine = (live) => {
            if (!live || g.phase !== 'race') return
            const v = g.karts[0].v
            if (v < 0.5) return
            const period = Math.max(3, 15 - Math.round(v))
            if (g.tick % period === 0) audioController.playTone(58 + v * 13 + (g.karts[0].boostT > 0 ? 30 : 0), 0.035, 'square', 0.028)
        }

        const project = (wx, wy) => {
            const dx = wx - g.karts[0].x; const dy = wy - g.karts[0].y
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            return { f: dx * ca + dy * sa, l: dx * -sa + dy * ca }
        }

        const SUN_A = 0.6
        const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

        const raster = () => {
            const p = g.karts[0]
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const cx = p.x - ca * BACK; const cy = p.y - sa * BACK
            const aN = ((camA / (Math.PI * 2)) * 512) % 512
            const cA = ((camA / (Math.PI * 2)) * 256 * 1.6 + g.tick * 0.03) % 256
            const top = [0x24, 0x18, 0x40]; const mid = [0x7a, 0x35, 0x60]; const low = [0xe8, 0x78, 0x38]
            const sunX = W / 2 + wrapA(SUN_A - camA) * 170
            for (let y = 0; y < HORIZON; y++) {
                const t = y / HORIZON
                let sr, sg, sb
                if (t < 0.55) { const u = t / 0.55; sr = top[0] + (mid[0] - top[0]) * u; sg = top[1] + (mid[1] - top[1]) * u; sb = top[2] + (mid[2] - top[2]) * u }
                else { const u = (t - 0.55) / 0.45; sr = mid[0] + (low[0] - mid[0]) * u; sg = mid[1] + (low[1] - mid[1]) * u; sb = mid[2] + (low[2] - mid[2]) * u }
                const row = (sr | 0) | ((sg | 0) << 8) | ((sb | 0) << 16) | 0xff000000
                let o = y * W
                for (let x = 0; x < W; x++) {
                    const wx = (x + aN) & 511
                    const mh = sky.mtn[wx]
                    if (y > HORIZON - mh) { px[o++] = y > HORIZON - mh + 5 ? 0xff503044 : 0xff583858; continue }
                    const dyS = y - (HORIZON - 30); const dxS = x - sunX
                    const d2 = dxS * dxS + dyS * dyS
                    if (d2 < 150) { px[o++] = 0xff60d8ff; continue }
                    if (d2 < 380) { px[o++] = 0xff3898ff; continue }
                    if (y < 42 && sky.streak[((y * 256) + ((x + cA) & 255)) | 0]) { px[o++] = 0xff90b0e8; continue }
                    px[o++] = row
                }
            }
            for (let y = HORIZON; y < PLAY_H; y++) {
                const dd = (CAM_H * PP) / (y - HORIZON + 0.6)
                const dl = dd / PP
                const fr = dd > 1900 ? Math.min(0.82, (dd - 1900) / 1300) : 0
                const cosd = ca * dd; const sind = sa * dd
                let wx = cx + cosd + sa * 128 * dl
                let wy = cy + sind - ca * 128 * dl
                const stepX = -sa * dl; const stepY = ca * dl
                let o = y * W
                if (fr > 0) {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        const c = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x308858 : gnd[ty * TX + tx]
                        const r = c & 255; const gg = (c >> 8) & 255; const b = (c >> 16) & 255
                        px[o++] = ((r + (HAZE[0] - r) * fr) | 0) | (((gg + (HAZE[1] - gg) * fr) | 0) << 8) | (((b + (HAZE[2] - b) * fr) | 0) << 16) | 0xff000000
                        wx += stepX; wy += stepY
                    }
                } else {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        px[o++] = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x308858 : gnd[ty * TX + tx]
                        wx += stepX; wy += stepY
                    }
                }
            }
            ctx.putImageData(frame, 0, 0)
        }

        const drawSprites = () => {
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, PLAY_H); ctx.clip()
            const items = []
            for (const k of g.karts.slice(1)) {
                const sf = k.steerVis < 0 ? 0 : k.steerVis > 0 ? 2 : 1
                items.push({ x: k.x, y: k.y, a: k.a, img: S[k.color][sf][(k.anim >> 2) & 1], w: KART.w, h: KART.h, o: k })
            }
            for (const sc of TRACK_SCENERY) {
                const img = sc.kind === 'cactus' ? S_cactus : S_spire
                items.push({ x: sc.x, y: sc.y, a: 0, img, w: sc.kind === 'cactus' ? 46 : 90, h: sc.h })
            }
            const s0 = T.pts[0]
            items.push({ x: s0.x + 118, y: s0.y - 22, a: 0, img: S_gantry, w: 130, h: 130 })
            items.sort((a, b) => {
                const fa = project(a.x, a.y).f; const fb = project(b.x, b.y).f
                return fb - fa
            })
            for (const it of items) {
                const pr = project(it.x, it.y)
                if (pr.f < 30 || pr.f > 2600) continue
                const s = PP / pr.f
                const sy = HORIZON + CAM_H * s
                const sx = W / 2 + pr.l * s
                const w = Math.min(300, it.w * s * 0.9); const h = Math.min(320, it.h * s * 0.9)
                if (sx + w < 0 || sx - w > W) continue
                ctx.globalAlpha = 0.25
                ctx.fillStyle = '#000'
                ctx.fillRect(sx - w / 2, sy - 3 * s, w, 6 * s)
                ctx.globalAlpha = 1
                ctx.save()
                ctx.translate(sx, sy - h / 2)
                if (it.o) ctx.rotate(it.o.a - camA)
                ctx.drawImage(it.img, -w / 2, -h / 2, w, h)
                ctx.restore()
            }
            ctx.restore()
            const P = g.karts[0]
            const tilt = P.spinT > 0 ? g.tick * 0.32 : P.steerVis * 0.18 + (P.driftT ? P.steerVis * 0.22 : 0)
            const bounce = P.offroad && P.v > 1 ? (g.tick >> 1) % 2 : 0
            ctx.save()
            ctx.translate(W / 2, PLAY_H - 30 + bounce)
            ctx.rotate(tilt)
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-PW * 0.42, PBOT - 4, PW * 0.84, 7)
            const sf = P.steerVis < 0 ? 0 : P.steerVis > 0 ? 2 : 1
            const rf = P.v > 0.4 ? (P.anim >> 2) & 1 : 0
            ctx.drawImage(S.comet[sf][rf], -PW / 2, PBOT - PH, PW, PH)
            if (P.boostT > 0) {
                const hot = P.boostTier >= 2 ? '#58f8f8' : P.boostTier === 1 ? '#b888f8' : '#58b8f8'
                ctx.fillStyle = (g.tick >> 1) % 2 ? hot : '#f8d800'
                ctx.fillRect(-PW * 0.32, PBOT - 8, 11, 9 + (g.tick % 6)); ctx.fillRect(PW * 0.32 - 11, PBOT - 8, 11, 9 + ((g.tick + 3) % 6))
            }
            ctx.restore()
        }

        // one-off prop sprites, painted in the Gulch palette
        const S_cactus = (() => {
            const c = document.createElement('canvas'); c.width = 46; c.height = 90
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            x.fillStyle = PALETTE.cactus; x.fillRect(19, 12, 8, 74)
            x.fillStyle = PALETTE.cactusLt; x.fillRect(19, 12, 3, 74)
            x.fillStyle = PALETTE.cactus; x.fillRect(6, 34, 8, 26); x.fillRect(6, 34, 21, 8)
            x.fillRect(32, 46, 8, 22); x.fillRect(19, 46, 21, 8)
            x.strokeStyle = PALETTE.outline; x.lineWidth = 1.5
            x.strokeRect(19, 12, 8, 74)
            return c
        })()
        const S_spire = (() => {
            const c = document.createElement('canvas'); c.width = 90; c.height = 150
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            x.fillStyle = PALETTE.spire
            x.beginPath(); x.moveTo(20, 150); x.lineTo(38, 16); x.lineTo(52, 28); x.lineTo(66, 150); x.closePath(); x.fill()
            x.fillStyle = PALETTE.spireDark
            x.beginPath(); x.moveTo(52, 28); x.lineTo(66, 150); x.lineTo(46, 150); x.closePath(); x.fill()
            x.strokeStyle = PALETTE.outline; x.lineWidth = 1.5; x.stroke()
            return c
        })()
        const S_gantry = (() => {
            const c = document.createElement('canvas'); c.width = 130; c.height = 130
            const x = c.getContext('2d'); x.imageSmoothingEnabled = false
            x.fillStyle = PALETTE.cliff; x.fillRect(8, 20, 12, 110); x.fillRect(110, 20, 12, 110)
            x.fillStyle = PALETTE.roadShade; x.fillRect(4, 8, 122, 22)
            x.fillStyle = PALETTE.sun; x.font = 'bold 12px monospace'; x.fillText('GULCH', 34, 23)
            x.strokeStyle = PALETTE.outline; x.lineWidth = 2; x.strokeRect(4, 8, 122, 22)
            return c
        })()
        const TRACK_SCENERY = (() => {
            const list = []
            for (let i = 0; i < T.N; i += 8) {
                const p = T.pts[i]
                if (p.s < 320 || p.s > T.len - 260) continue
                const side = (i % 16 === 0) ? 1 : -1
                const off = T.WALL_R + 120 + ((i * 7) % 100)
                list.push({
                    x: p.x + Math.cos(p.a + Math.PI / 2) * side * off,
                    y: p.y + Math.sin(p.a + Math.PI / 2) * side * off,
                    kind: (i % 24 === 0) ? 'spire' : 'cactus',
                    h: (i % 24 === 0) ? 150 : 90,
                })
            }
            return list
        })()

        // renderer-only FX (particles, speed lines): jitter is a pure
        // function of the tick, never Math.random, so replays match.
        const fx = { sparks: [], dust: [] }
        const jit = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }
        const stepFx = (P) => {
            if (P.driftT > 0 && P.v > 1) {
                const dir = P.steerVis || 1
                for (let i = 0; i < 2; i++) {
                    const side = i ? 1 : -1
                    fx.sparks.push({ x: W / 2 + side * 26, y: PLAY_H - 8,
                        vx: -dir * (0.3 + jit(g.tick + i) * 0.7) + side * 0.7,
                        vy: 0.5 + jit(g.tick * 1.7 + i) * 1.3, life: 12 })
                }
            } else if (P.spinT > 0) {
                for (let i = 0; i < 3; i++) fx.dust.push({ x: W / 2 + (jit(g.tick * 3.1 + i) - 0.5) * 44,
                    y: PLAY_H - 10, vx: (jit(g.tick * 1.3 + i) - 0.5) * 1.3, vy: 0.2 + jit(g.tick * 2.1 + i) * 0.5, life: 18 })
            }
            for (const s of fx.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.life-- }
            fx.sparks = fx.sparks.filter((s) => s.life > 0 && s.y < PLAY_H + 4)
            for (const d of fx.dust) { d.x += d.vx; d.y += d.vy; d.life-- }
            fx.dust = fx.dust.filter((d) => d.life > 0)
            if (fx.sparks.length > 160) fx.sparks.splice(0, fx.sparks.length - 160)
            if (fx.dust.length > 120) fx.dust.splice(0, fx.dust.length - 120)
        }
        const drawFx = () => {
            const P = g.karts[0]
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, PLAY_H); ctx.clip()
            for (const d of fx.dust) {
                ctx.globalAlpha = Math.max(0, d.life / 24) * 0.6
                ctx.fillStyle = '#b09068'; ctx.fillRect(d.x, d.y, 3, 3)
            }
            const tier = P.charge >= TIERS[2].t ? 2 : P.charge >= TIERS[1].t ? 1 : P.charge >= TIERS[0].t ? 0 : -1
            for (const s of fx.sparks) {
                ctx.globalAlpha = Math.max(0, s.life / 12)
                ctx.fillStyle = tier === 2 ? '#ffd840' : tier === 1 ? '#c088ff' : tier === 0 ? '#58c8ff' : s.life > 7 ? '#fff2a0' : '#f8b020'
                ctx.fillRect(s.x, s.y, 2, 2)
            }
            // speed lines: vanishing-point dashes during boost or near top
            if (P.boostT > 0 || P.v > 7.9) {
                const n = P.boostT > 0 ? 14 : 8
                for (let i = 0; i < n; i++) {
                    const a = jit(i * 7.3 + (g.tick >> 2)) * Math.PI * 2
                    const r0 = 40 + jit(i * 3.1 + g.tick) * 60
                    const len = 14 + (P.boostT > 0 ? 26 : 12)
                    const cx0 = W / 2; const cy0 = HORIZON
                    ctx.globalAlpha = 0.25 + 0.35 * jit(i + g.tick * 0.7)
                    ctx.strokeStyle = '#ffe8c0'
                    ctx.lineWidth = 1
                    ctx.beginPath()
                    ctx.moveTo(cx0 + Math.cos(a) * r0, cy0 + Math.sin(a) * r0 * 0.7 + 30)
                    ctx.lineTo(cx0 + Math.cos(a) * (r0 + len), cy0 + Math.sin(a) * (r0 + len) * 0.7 + 30)
                    ctx.stroke()
                }
            }
            ctx.globalAlpha = 1
            ctx.restore()
        }

        const drawHud = () => {
            const P = g.karts[0]
            ctx.fillStyle = 'rgba(10,4,16,0.82)'
            ctx.fillRect(0, 0, 100, 34)
            ctx.fillStyle = '#f8f0e0'
            ctx.font = 'bold 12px monospace'
            ctx.fillText(`LAP ${Math.min(P.lap + 1, LAPS)}/${LAPS}`, 6, 15)
            ctx.fillText(fmtTime(Math.max(0, g.tick - P.lapStart)), 6, 29)
            const suff = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][P.place - 1]
            ctx.fillStyle = P.place === 1 ? '#ffd840' : '#f8f0e0'
            ctx.font = 'bold 20px monospace'
            const ps = `${P.place}${suff}`
            ctx.fillText(ps, 116, 24)
            // minimap: the Gulch outline + one dot per kart
            ctx.fillStyle = 'rgba(10,4,16,0.82)'
            ctx.fillRect(W - 62, 2, 60, 56)
            ctx.strokeStyle = '#8a7860'; ctx.lineWidth = 2
            ctx.beginPath()
            for (let i = 0; i < MAP.pts.length; i++) {
                const [mx, my] = MAP.pts[i]
                if (i === 0) ctx.moveTo(W - 62 + mx, 2 + my); else ctx.lineTo(W - 62 + mx, 2 + my)
            }
            ctx.closePath(); ctx.stroke()
            for (let i = g.karts.length - 1; i >= 0; i--) {
                const k = g.karts[i]
                const [mx, my] = MAP.project(k.x, k.y)
                ctx.fillStyle = LIVERY_DOT[k.color] || '#f8f8f8'
                ctx.fillRect(W - 64 + mx, my, k.isPlayer ? 4 : 3, k.isPlayer ? 4 : 3)
            }
            // the bottom instrument strip
            ctx.fillStyle = '#160c18'; ctx.fillRect(0, PLAY_H, W, H - PLAY_H)
            ctx.fillStyle = '#4a3450'; ctx.fillRect(0, PLAY_H, W, 2)
            ctx.fillStyle = '#f8f0e0'; ctx.font = 'bold 11px monospace'
            ctx.fillText(`${Math.round(P.v * 19.5)} KM/H`, 8, PLAY_H + 18)
            const barW = Math.round(P.v / (CFG.top + TIERS[Math.max(P.boostTier, 0)].over) * 74)
            ctx.fillStyle = '#2c1c30'; ctx.fillRect(72, PLAY_H + 9, 74, 8)
            ctx.fillStyle = P.boostT > 0 ? '#ffd840' : P.offroad ? '#f85820' : '#38d898'
            ctx.fillRect(72, PLAY_H + 9, Math.min(74, barW), 8)
            // the drift charge ladder: three pips, blue violet gold
            for (let i = 0; i < 3; i++) {
                const on = P.driftT > 0 && tierReached(P.charge) >= i
                ctx.fillStyle = on ? (i === 2 ? '#ffd840' : i === 1 ? '#c088ff' : '#58c8ff') : '#2c1c30'
                ctx.fillRect(152 + i * 12, PLAY_H + 9, 9, 8)
            }
            ctx.fillStyle = '#8a7860'; ctx.font = 'bold 9px monospace'
            ctx.fillText(`BEST ${st.best ? fmtTime(st.best) : '--:--'}`, 194, PLAY_H + 17)
            if (st.screen !== 'attract' && (g.phase === 'count' || (g.phase === 'race' && g.tick - P.lapStart < 40))) {
                ctx.textAlign = 'center'
                ctx.font = 'bold 48px monospace'
                ctx.fillStyle = g.phase === 'race' ? '#38e878' : '#f8f0e0'
                ctx.fillText(g.phase === 'race' ? 'GO!' : String(Math.ceil(g.count / 60)), W / 2, 124)
                ctx.textAlign = 'left'
            }
        }
        const tierReached = (charge) => {
            let t = -1
            for (let i = 0; i < TIERS.length; i++) if (charge >= TIERS[i].t) t = i
            return t
        }

        const drawAttract = () => {
            ctx.fillStyle = 'rgba(10,4,16,0.5)'
            ctx.fillRect(0, 32, W, 118)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#e03818'
            ctx.font = 'bold 25px monospace'
            ctx.fillText('COMET', W / 2 + 2, 58 + 2)
            ctx.fillStyle = '#f8f0e0'
            ctx.fillText('COMET', W / 2, 58)
            ctx.fillStyle = '#ffd840'
            ctx.fillText('DRIFT GP', W / 2, 84)
            const msgs = ['SUNSET GULCH - 4 LAPS', 'X GAS  S BRAKE  ←→ STEER', 'HOLD SPACE / B THROUGH A BEND = TURBO', 'autopilot demo (its own proven win)']
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = '#f0b878'
            ctx.fillText(msgs[Math.floor(g.tick / 120) % msgs.length], W / 2, 106)
            if (st.top.length) {
                ctx.font = 'bold 8px monospace'
                for (let i = 0; i < st.top.length; i++) {
                    ctx.fillStyle = i === 0 ? '#ffd840' : '#b090a8'
                    ctx.fillText(i === 0 ? `BEST  ${fmtTime(st.top[i])}` : ` #${i + 1}  ${fmtTime(st.top[i])}`, W / 2, 124 + i * 9)
                }
            }
            if ((g.tick >> 5) % 2) {
                ctx.font = 'bold 11px monospace'
                ctx.fillStyle = '#f8f0e0'
                ctx.fillText('PRESS ANY KEY / TAP', W / 2, 143)
            }
            ctx.textAlign = 'left'
        }

        const drawEnd = () => {
            const P = g.karts[0]
            ctx.fillStyle = 'rgba(10,4,24,0.72)'; ctx.fillRect(0, 32, W, 112)
            ctx.textAlign = 'center'
            ctx.font = 'bold 24px monospace'
            ctx.fillStyle = g.end === 'win' ? '#ffd840' : '#f85820'
            ctx.fillText(g.end === 'win' ? 'GULCH CHAMPION!' : `${P.place}TH PLACE`, W / 2, 66)
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = '#f8f0e0'
            ctx.fillText(`TIME ${fmtTime(P.finishT || g.tick)}  BEST ${st.best ? fmtTime(st.best) : '--'}`, W / 2, 88)
            if (P.lapTimes.length) {
                ctx.font = 'bold 8px monospace'
                ctx.fillStyle = '#f0b878'
                ctx.fillText('SPLITS ' + P.lapTimes.map((t) => (t / 60).toFixed(1)).join(' '), W / 2, 102)
            }
            if ((g.tick >> 5) % 2) { ctx.fillStyle = '#f8f0e0'; ctx.font = 'bold 12px monospace'; ctx.fillText('TAP OR ANY KEY', W / 2, 126) }
            ctx.textAlign = 'left'
        }

        const tickWorld = (live) => {
            const p = padState
            const padLive = p.engaged || p.rt > 0.05 || p.lt > 0.05
            let inp
            if (st.plan) {
                inp = decide(g)
            } else if (padLive) {
                const s = steerPedals(p)
                inp = { steer: s.steer, thr: s.thr, brk: s.brk, drift: !!(keys.Space || keys.KeyR || keys.KeyC) }
            } else {
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
                    if (ev.e === 'lap' && ev.who === 'PLAYER' && ev.t > 60) {
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
                    const want = g.karts[0].a
                    let da = want - camA
                    while (da > Math.PI) da -= Math.PI * 2
                    while (da < -Math.PI) da += Math.PI * 2
                    camA += da * 0.12
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
            fit.blit()
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
                    `screen ${st.screen}  phase ${g.phase}  end ${g.end}`,
                    `pos ${P.place}/${g.karts.length}  lap ${P.lap}/${LAPS}  v ${P.v.toFixed(2)}`,
                    `surf ${T.nearest(P.x, P.y, P.hint).surf}  spin ${P.spinT}  boost ${P.boostT}/tier ${P.boostTier}`,
                    `drift ${P.driftT} charge ${P.charge}  tick ${g.tick}`,
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
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            best: () => st.best,
            fx: () => {
                const P = g.karts[0]
                return { sparks: fx.sparks.length, dust: fx.dust.length,
                    frame: P.v > 0.4 ? ((P.anim >> 2) & 1) : 0, driftT: P.driftT, charge: P.charge, boostT: P.boostT, spinT: P.spinT, v: P.v }
            },
            forceSpin: () => { g.karts[0].spinT = 90; return g.karts[0].spinT },
        }

        exposeGame({
            id: 'comet-drift',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
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
            fit.destroy()
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
            <canvas ref={canvasRef} data-fit="source" width={W} height={H} className="block w-full h-full" style={{ imageRendering: 'pixelated', objectFit: 'contain', opacity: 0 }} />
            <VirtualControls visible={padOn && !paused && TOUCH} />
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'COMET DRIFT GP')} onResume={handleResume} />}
        </div>
    )
}

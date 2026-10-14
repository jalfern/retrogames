import { useEffect, useRef, useState, useCallback } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeGame, step, fmtTime, CFG } from './sim'
import { decide } from './planner'
import { TRACK, SCENERY, TX, TY } from './track.js'
import { buildGround, buildSky, buildSprites, KART } from './art.js'

// =====================================================================
// SUPER MARIO KART — the arcade's Mode 7 title. The ground is ONE 2048²
// texture built from track.js at boot, then sampled scanline by scanline
// under a rotating camera — the SNES trick that defined the console.
// The sim is pure (sim.js); the attract demo is the autopilot's own
// proven 5-lap win (planner.js), running tick for tick like the harness
// audited it. No assets; every pixel and note is synthesized here.
// =====================================================================

const W = 256
const H = 224
const HORIZON = 78
const PLAY_H = 200
const CAM_H = 55
const PP = 520
const BACK = 92
const FOG_C = [0xa8, 0xc8, 0xf8]
// The touchpad is for thumbs: on a desktop it used to sit over the page.
// A touch device answers one of these; a keyboard-and-mouse box, neither.
const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

const T = TRACK
// the player kart is drawn a touch bigger than the CPU pack; keep the new
// wider-than-tall aspect so it stays the same car, just closer
const PW = Math.round(KART.w * 1.35)
const PH = Math.round(PW * KART.h / KART.w)
const PBOT = 34   // the player kart's ground line, below the camera anchor

// ---- ground / sky / sprites now live in ./art.js (the SNES palette) ----


export default function MarioKart() {
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
        const ground = buildGround()
        const gnd = new Uint32Array(ground.data.buffer)
        const sky = buildSky()
        const S = buildSprites()
        const frame = ctx.createImageData(W, PLAY_H)
        const px = new Uint32Array(frame.data.buffer)
        const g = makeGame()
        gameRef.current = g
        const keys = keysRef.current
        const st = { screen: 'attract', endT: 0 }
        screenRef.current = 'attract'

        // best-lap persistence: the renderer's memory, never the sim's
        // (determinism in Node stays hash-for-hash; this only decorates)
        const BEST_KEY = 'arcade.kart.bestLap'
        const TOP_KEY = 'arcade.kart.topLaps'
        const GHOST_KEY = 'arcade.kart.ghost'
        const readBest = () => {
            try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 }
        }
        st.best = readBest()
        // top-3 lap table: the cabinet's memory, kept sorted and trimmed
        const readTop = () => {
            try {
                const t = JSON.parse(localStorage.getItem(TOP_KEY) || '[]')
                return Array.isArray(t) ? t.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b).slice(0, 3) : []
            } catch { return [] }
        }
        st.top = readTop()
        // the ghost: the certified GP line as a phantom — a second, pure
        // instance of the SAME machine stepped in lockstep, rendered
        // semi-transparent. It lives in its own world, so it can never
        // bump the player or be bumped, take items, or touch the sim that
        // decides who wins the real race.
        st.ghost = (() => { try { return localStorage.getItem(GHOST_KEY) === '1' } catch { return false } })()
        let gGhost = null

        let raf = 0; let acc = 0; let last = performance.now()
        let camA = g.karts[0].a
        let shake = 0

        const sfx = (evs, live) => {
            if (!live) return
            for (const ev of evs) {
                if (ev.e === 'count') audioController.playTone(660, 0.12, 'square', 0.12)
                if (ev.e === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.14)
                if (ev.e === 'pickup') audioController.playTone(ev.item === 'mushroom' ? 990 : 740, 0.08, 'square', 0.12)
                if (ev.e === 'shell') audioController.playSweep(1000, 220, 0.18, 'sawtooth', 0.12)
                if (ev.e === 'banana') audioController.playNoise(0.08, 0.1)
                if (ev.e === 'boost') audioController.playSweep(300, 1100, 0.4, 'square', 0.12)
                if (ev.e === 'dash') audioController.playSweep(500, 1400, 0.22, 'triangle', 0.1)
                if (ev.e === 'spin' && ev.who === 'PLAYER') { audioController.playNoise(0.35, 0.18); shake = 26 }
                if (ev.e === 'bump' && ev.who === 'PLAYER') { audioController.playNoise(0.12, 0.15); shake = 10 }
                if (ev.e === 'lap' && ev.who === 'PLAYER') { audioController.playTone(880, 0.1, 'square', 0.12); audioController.playTone(1320, 0.1, 'square', 0.08) }
                if (ev.e === 'end') { if (ev.place === 1) audioController.playFanfare(); else audioController.playDeath() }
            }
        }

        const project = (wx, wy) => {
            const dx = wx - g.karts[0].x; const dy = wy - g.karts[0].y
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const f = dx * ca + dy * sa
            const l = dx * -sa + dy * ca
            return { f, l }
        }

        const raster = () => {
            const p = g.karts[0]
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const cx = p.x - ca * BACK; const cy = p.y - sa * BACK
            const aN = ((camA / (Math.PI * 2)) * 512) % 512
            const cA = ((camA / (Math.PI * 2)) * 256 * 1.6 + g.tick * 0.04) % 256
            for (let y = 0; y < HORIZON; y++) {
                const t = y / HORIZON
                const sr = 0x20 + t * 0x88 | 0; const sg = 0x38 + t * 0x90 | 0; const sb = 0xf8
                const row = (sr) | (sg << 8) | (sb << 16) | 0xff000000
                let o = y * W
                for (let x = 0; x < W; x++) {
                    const mh = sky.mtn[(x + aN | 0) & 511]
                    if (y > HORIZON - mh) {
                        px[o++] = y > HORIZON - mh + 5 ? 0xffa87868 : 0xff906050
                        continue
                    }
                    if (y < 60 && sky.cloud[((y * 256) + ((x + cA) & 255)) | 0]) { px[o++] = 0xfff8f8f8; continue }
                    px[o++] = row
                }
            }
            for (let y = HORIZON; y < PLAY_H; y++) {
                const dd = (CAM_H * PP) / (y - HORIZON + 0.6)
                const dl = dd / PP
                const fr = dd > 2200 ? Math.min(0.8, (dd - 2200) / 1400) : 0
                const cosd = ca * dd; const sind = sa * dd
                let wx = cx + cosd + sa * 128 * dl
                let wy = cy + sind - ca * 128 * dl
                const stepX = -sa * dl; const stepY = ca * dl
                let o = y * W
                if (fr > 0) {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        const c = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x30a028 : gnd[ty * TX + tx]
                        const r = c & 255; const gg = (c >> 8) & 255; const b = (c >> 16) & 255
                        px[o++] = ((r + (FOG_C[0] - r) * fr) | 0) | (((gg + (FOG_C[1] - gg) * fr) | 0) << 8) | (((b + (FOG_C[2] - b) * fr) | 0) << 16) | 0xff000000
                        wx += stepX; wy += stepY
                    }
                } else {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        px[o++] = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x30a028 : gnd[ty * TX + tx]
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
            for (const k of g.karts.slice(1)) items.push({ x: k.x, y: k.y, a: k.a, img: S[k.color][((k.anim >> 2) + (k.row & 1)) & 1], w: KART.w, h: KART.h, o: k })
            // the ghost races in its own world and vanishes at its own
            // finish line — a finished phantom would freeze mid-track
            if (gGhost && !gGhost.end) {
                const G = gGhost.karts[0]
                items.push({ x: G.x, y: G.y, a: G.a, img: S.mario[0], w: KART.w, h: KART.h, o: G, ghost: true })
            }
            for (const b of g.bananas) items.push({ x: b.x, y: b.y, a: 0, img: S.banana, w: 26, h: 20 })
            for (const s of g.shells) items.push({ x: s.x, y: s.y, a: s.a, img: S.shell, w: 30, h: 26 })
            for (const b of g.boxes) if (!b.taken) items.push({ x: b.x, y: b.y, a: 0, img: S.box, w: 40, h: 40, bob: true })
            for (const sc of SCENERY) items.push({ x: sc.x, y: sc.y, a: 0, img: S[sc.kind === 'tree' ? 'tree' : 'stand'], w: sc.kind === 'tree' ? 70 : 110, h: sc.kind === 'tree' ? 96 : 74 })
            const s0 = T.pts[0]
            items.push({ x: s0.x + 120, y: s0.y - 25, a: 0, img: S.gantry, w: 120, h: 120 })
            for (const it of items) {
                const pr = project(it.x, it.y)
                if (pr.f < 30 || pr.f > 2600) continue
                const s = PP / pr.f
                const sy = HORIZON + CAM_H * s
                const sx = W / 2 + pr.l * s
                const w = Math.min(300, it.w * s * 0.9); const h = Math.min(320, it.h * s * 0.9)
                const bob = it.bob ? Math.sin(g.tick * 0.1 + it.x) * 3 * s : 0
                if (sx + w < 0 || sx - w > W) continue
                const ga = it.ghost ? 0.45 : 1
                ctx.globalAlpha = 0.25 * ga
                ctx.fillStyle = '#000'
                ctx.fillRect(sx - w / 2, sy - 3 * s, w, 6 * s)
                ctx.globalAlpha = ga
                ctx.save()
                ctx.translate(sx, sy - h / 2 + bob)
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
            ctx.drawImage(S.mario[P.v > 0.4 ? ((P.anim >> 2) & 1) : 0], -PW / 2, PBOT - PH, PW, PH)
            if (P.boostT > 0) {
                ctx.fillStyle = (g.tick >> 1) % 2 ? '#f8d800' : '#f85800'
                ctx.fillRect(-PW * 0.3, PBOT - 8, 12, 10 + (g.tick % 6)); ctx.fillRect(PW * 0.3 - 12, PBOT - 8, 12, 10 + ((g.tick + 3) % 6))
            }
            ctx.restore()
        }

        // ---- render-only FX: drift sparks + spin-out dust. Renderer
        // memory (like the camera and shake), never the sim — kartcheck
        // stays hash-for-hash. Jitter is a pure function of the tick, so a
        // replayed attract demo jitters identically (no Math.random). ----
        const fx = { sparks: [], dust: [], sparkTotal: 0 }
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
                fx.sparkTotal += 2
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
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, PLAY_H); ctx.clip()
            for (const d of fx.dust) {
                ctx.globalAlpha = Math.max(0, d.life / 24) * 0.6
                ctx.fillStyle = '#9a8a68'; ctx.fillRect(d.x, d.y, 3, 3)
            }
            for (const s of fx.sparks) {
                ctx.globalAlpha = Math.max(0, s.life / 12)
                ctx.fillStyle = s.life > 7 ? '#fff2a0' : s.life > 3 ? '#f8b020' : '#f85800'
                ctx.fillRect(s.x, s.y, 2, 2)
            }
            ctx.globalAlpha = 1
            ctx.restore()
        }

        const drawHud = () => {
            const P = g.karts[0]
            // on the start line the gantry's course banner runs straight
            // across this corner — a solid bar keeps the lap clock readable
            // over the world (SNES SMK's HUD bars work the same way)
            ctx.fillStyle = 'rgba(0,0,16,0.85)'
            ctx.fillRect(0, 0, 98, 32)
            ctx.fillStyle = '#000'
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText(`LAP ${Math.min(P.lap + 1, 5)}/5`, 6, 14)
            ctx.fillText(fmtTime(Math.max(0, g.tick - P.lapStart)), 6, 28)
            const suff = ['st', 'nd', 'rd', 'th', 'th'][P.place - 1]
            ctx.fillStyle = P.place === 1 ? '#f8d800' : '#f8f8f8'
            ctx.font = 'bold 20px monospace'
            const ps = `${P.place}${suff}`
            ctx.fillText(ps, W - 10 - ctx.measureText(ps).width, 22)
            ctx.fillStyle = '#101018'; ctx.fillRect(0, PLAY_H, W, H - PLAY_H)
            ctx.fillStyle = '#383848'; ctx.fillRect(0, PLAY_H, W, 2)
            ctx.strokeStyle = '#f8d800'; ctx.lineWidth = 2
            ctx.strokeRect(8, PLAY_H + 6, 34, 16)
            if (P.item) {
                const im = { banana: S.banana, shell: S.shell, mushroom: S.mushroom }[P.item]
                ctx.drawImage(im, 10, PLAY_H + 5, 30, 20)
            }
            ctx.fillStyle = '#f8f8f8'; ctx.font = 'bold 11px monospace'
            ctx.fillText(`${Math.round(P.v * 19.5)} KM/H`, 52, PLAY_H + 18)
            const barW = Math.round(P.v / (CFG.top + CFG.boostOver) * 84)
            ctx.fillStyle = '#282838'; ctx.fillRect(150, PLAY_H + 10, 84, 8)
            ctx.fillStyle = P.boostT > 0 ? '#f8d800' : P.offroad ? '#f85800' : '#20c020'
            ctx.fillRect(150, PLAY_H + 10, barW, 8)
            if (g.phase === 'count' || (g.phase === 'race' && g.tick - g.karts[0].lapStart < 40)) {
                ctx.textAlign = 'center'
                ctx.font = 'bold 48px monospace'
                ctx.fillStyle = g.phase === 'race' ? '#20e020' : '#f8f8f8'
                ctx.fillText(g.phase === 'race' ? 'GO!' : String(Math.ceil(g.count / 60)), W / 2, 120)
                ctx.textAlign = 'left'
            }
        }

        const drawAttract = () => {
            // the band covers the top-table rows too: the world under them
            // paints gold dash panels, so the BEST row would lose its gold
            // against a live track
            ctx.fillStyle = 'rgba(0,0,0,0.45)'
            ctx.fillRect(0, 30, W, 82)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#e02020'
            ctx.font = 'bold 26px monospace'
            ctx.fillText('SUPER', W / 2 + 2, 56 + 2)
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText('SUPER', W / 2, 56)
            ctx.fillStyle = '#f8d800'
            ctx.fillText('KART', W / 2, 84)
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = '#a8c8f8'
            ctx.fillText('MARIO CIRCUIT - 5 LAPS', W / 2, 98)
            // the cabinet's memory: a top-3 table, best in gold
            if (st.top.length) {
                ctx.font = 'bold 8px monospace'
                for (let i = 0; i < st.top.length; i++) {
                    ctx.fillStyle = i === 0 ? '#f8d800' : '#88a8d8'
                    ctx.fillText(i === 0 ? `BEST  ${fmtTime(st.top[i])}` : ` #${i + 1}  ${fmtTime(st.top[i])}`, W / 2, 109 + i * 9)
                }
            }
            if (st.ghost) {
                ctx.font = 'bold 8px monospace'
                ctx.fillStyle = '#f8d800'
                ctx.fillText('GHOST ON - the certified line', W / 2, 136)
            }
            if ((g.tick >> 5) % 2) {
                ctx.font = 'bold 11px monospace'
                ctx.fillStyle = '#f8f8f8'
                ctx.fillText('PRESS ANY KEY / TAP', W / 2, 145)
            }
            ctx.fillStyle = '#88a8d8'; ctx.font = '8px monospace'
            ctx.fillText('attract: autopilot demo (its own proven win)', W / 2, 159)
            ctx.textAlign = 'left'
        }

        const drawEnd = () => {
            const P = g.karts[0]
            ctx.fillStyle = 'rgba(0,0,20,0.7)'; ctx.fillRect(0, 30, W, 116)
            ctx.textAlign = 'center'
            ctx.font = 'bold 24px monospace'
            ctx.fillStyle = g.end === 'win' ? '#f8d800' : '#f85800'
            ctx.fillText(g.end === 'win' ? 'YOU WIN!' : `${P.place}TH PLACE`, W / 2, 66)
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText(`TIME ${fmtTime(P.finishT || g.tick)}  BEST ${st.best ? fmtTime(st.best) : '--'}`, W / 2, 88)
            if (P.lapTimes.length) {
                ctx.font = 'bold 8px monospace'
                ctx.fillStyle = '#a8c8f8'
                ctx.fillText('SPLITS ' + P.lapTimes.map((t) => (t / 60).toFixed(1)).join(' '), W / 2, 102)
            }
            ctx.font = 'bold 10px monospace'
            ctx.fillStyle = st.ghost ? '#f8d800' : '#8898b8'
            ctx.fillText(`GHOST [G]: ${st.ghost ? 'ON' : 'OFF'}`, W / 2, 118)
            if ((g.tick >> 5) % 2) { ctx.fillStyle = '#f8f8f8'; ctx.font = 'bold 12px monospace'; ctx.fillText('TAP OR ANY KEY', W / 2, 136) }
            ctx.textAlign = 'left'
        }

        const tickWorld = (live) => {
            const inp = st.plan
                ? decide(g)
                : { u: !!keys.ArrowUp, d: !!keys.ArrowDown, l: !!keys.ArrowLeft, r: !!keys.ArrowRight, drift: !!(keys.KeyX || keys.KeyC), item: !!keys.Space }
            step(g, live ? inp : decide(g))
            if (live && gGhost && !gGhost.end) step(gGhost, decide(gGhost))
            const evs = g.events.splice(0)
            if (import.meta.env.DEV) {
                const log = (window.__kartLog ||= [])
                for (const ev of evs) log.push({ ...ev, t: g.tick })
                if (log.length > 2000) log.splice(0, log.length - 2000)
            }
            sfx(evs, live)
            if (live) {
                for (const ev of evs) {
                    if (ev.e === 'lap' && ev.who === 'PLAYER' && ev.t > 60) {
                        if (!st.best || ev.t < st.best) {
                            st.best = ev.t
                            try { localStorage.setItem(BEST_KEY, String(ev.t)) } catch { /* private mode: session-only */ }
                        }
                        st.top.push(ev.t); st.top.sort((a, b) => a - b); st.top = st.top.slice(0, 3)
                        try { localStorage.setItem(TOP_KEY, JSON.stringify(st.top)) } catch { /* private mode */ }
                    }
                }
            }
            if (!live && g.end) { st.endT++; if (st.endT > 240) { Object.assign(g, makeGame()); st.endT = 0 } }
            if (live && g.end) { st.screen = 'end'; screenRef.current = 'end'; st.endT = 0; setPadOn(false) }
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, 250); last = now
            while (acc >= 1000 / 60) {
                acc -= 1000 / 60
                if (!pausedRef.current) tickWorld(st.screen === 'race')
                const want = g.karts[0].a
                let da = want - camA
                while (da > Math.PI) da -= Math.PI * 2
                while (da < -Math.PI) da += Math.PI * 2
                camA += da * 0.12
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
            Object.assign(g, makeGame())
            st.screen = screen; screenRef.current = screen
            st.endT = 0
            camA = g.karts[0].a
            // the pad would only cover the canvas on attract/end — withdraw
            // it there (the tap lands on the canvas itself, see tapRef)
            gGhost = screen === 'race' && st.ghost ? makeGame() : null
            setPadOn(screen === 'race')
        }

        // Phone players have no keys to press: a tap on the bare canvas is
        // the attract/end actuator while the pad is withdrawn.
        tapRef.current = () => {
            if (pausedRef.current) return
            if (st.screen === 'attract') { audioController.init(); resetTo('race') }
            else if (st.screen === 'end') resetTo('attract')
        }

        const kd = (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
            if (e.code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (pausedRef.current) return
            if (st.screen === 'attract') {
                audioController.init()
                resetTo('race')
                return
            }
            if (st.screen === 'end') {
                if (e.code === 'KeyG') {
                    st.ghost = !st.ghost
                    try { localStorage.setItem(GHOST_KEY, st.ghost ? '1' : '0') } catch { /* private mode */ }
                    return
                }
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
            title: 'SUPER MARIO KART',
            getState: () => {
                const P = g.karts[0]
                return [
                    `screen ${st.screen}  phase ${g.phase}  end ${g.end}`,
                    `pos ${P.place}  lap ${P.lap}/5  item ${P.item || '-'}  v ${P.v.toFixed(2)}`,
                    `surf ${T.nearest(P.x, P.y, P.hint).surf}  spin ${P.spinT}  boost ${P.boostT}`,
                    `bananas ${g.bananas.length}  shells ${g.shells.length}  tick ${g.tick}`,
                ]
            },
            actions: [
                { label: 'teleport to grid', run: () => { const P = g.karts[0]; const p = T.pts[4]; P.x = p.x; P.y = p.y; P.idx = 4; P.hint = 4; P.a = p.a; return 'ok' } },
                { label: 'give shell', run: () => { g.karts[0].item = 'shell'; return 'shell' } },
                { label: 'give banana', run: () => { g.karts[0].item = 'banana'; return 'banana' } },
                { label: 'boost', run: () => { g.karts[0].boostT = 90; return 'boost' } },
                { label: 'instant lap', run: () => { const P = g.karts[0]; P.lap = Math.min(5, P.lap + 1); return `lap ${P.lap}` } },
            ],
        })

        window.__kartTest = {
            game: () => g,
            ghostGame: () => gGhost,
            ghost: () => st.ghost,
            top: () => [...st.top],
            camAt: () => camA,
            keys,
            screen: () => st.screen,
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            best: () => st.best,
            fx: () => {
                const P = g.karts[0]
                return { sparks: fx.sparks.length, dust: fx.dust.length, sparkTotal: fx.sparkTotal,
                    frame: P.v > 0.4 ? ((P.anim >> 2) & 1) : 0, driftT: P.driftT, spinT: P.spinT, v: P.v }
            },
            forceSpin: () => { g.karts[0].spinT = 90; return g.karts[0].spinT },
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', kd)
            window.removeEventListener('keyup', ku)
            unmount()
            delete window.__kartTest
        }
    }, [])

    return (
        <div
            className="relative flex flex-col items-center justify-center w-full h-full bg-black select-none"
            onPointerDown={() => tapRef.current && tapRef.current()}
        >
            <canvas ref={canvasRef} width={W} height={H} className="block w-full h-full" style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
            <VirtualControls secondAction={{ label: 'B', code: 'KeyX' }} visible={padOn && !paused && TOUCH} />
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'SUPER MARIO KART')} onResume={handleResume} />}
        </div>
    )
}

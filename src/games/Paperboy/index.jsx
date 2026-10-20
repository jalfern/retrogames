// PAPERBOY — the arcade shell. Everything is drawn at runtime from the pure
// sim in ./sim.js: the road is a projected band-strip, the houses are boxes
// and triangles, the demo is the planner's OWN proven route replayed tick
// for tick through the real step(). Nothing is an asset.
//
// Layout: 1. proven route 2. projection + painters 3. fixed-timestep loop
// (250 ms catch-up cap — the heist lesson) 4. input 5. DEV hook + DebugKit
// 6. React + HUD. The projection is exactly what scripts/paperplay.mjs
// samples: a boy the sim says is at (x, s) must be PAINTED at proj(x, s).

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { W, H, CFG, PEDAL, G, makeGame, step, stateHash } from './sim.js'
import { STAGES, PALETTES } from './levels.js'
import { solveGame } from './planner.js'
import { PRESS, MESSAGES } from './attract.js'

const SIM_MS = 1000 / 60
const YB = 186                 // screen y of the boy (t = 0)
const Y0 = 74                  // horizon
const LOOK = 320               // how far ahead the road is drawn
const Z = 1.05                 // lateral px per sim unit at the boy

let proven = null
const provenRun = () => { if (!proven) proven = solveGame({}); return proven }

const kAt = (t) => 1 / (1 + 2.6 * t)
const yAt = (t) => YB - (YB - Y0) * (1 - kAt(t)) / (1 - kAt(1))
const proj = (x, dy) => {
    const t = Math.max(0, Math.min(1, dy / LOOK))
    const k = kAt(t) * Z
    return [128 + x * k, yAt(t), k]
}

// Blocky pixel clouds (the original's sky has puffs, not smears). Each is a
// few rects; they drift at two parallax speeds and wrap the canvas.
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({
    x: (i * 61 + 14) % 256, y: 10 + ((i * 29) % 36), s: 0.6 + ((i * 3) % 4) / 5, v: i % 2 ? 0.006 : 0.003,
}))

const PaperboyGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('paperboy.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.pbStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0
        const keys = { l: false, r: false, u: false, d: false }
        let lastDir = -1, throwQ = null
        const evLog = []

        const say = (m) => { toastMsg = m; toast = 130 }
        const part = []
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.4 + ((i * 7) % 10) / 5
                part.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 220) evLog.splice(0, evLog.length - 220)
            for (const e of evts) {
                if (e.type === 'deliver') {
                    audioController.playSweep(520 + 60 * Math.min(e.streak, 6), 980 + 80 * Math.min(e.streak, 6), 0.12, 'square', 0.06)
                    say(`+${e.pts}${e.streak > 1 ? ` x${e.streak}` : ''}`)
                    const [px, py] = proj(e.side * 70, e.s - gs.s)
                    burst(px, py, 8, '#ffe08a')
                } else if (e.type === 'miss') audioController.playTone(150, 0.07, 'square', 0.05)
                else if (e.type === 'lean') audioController.playTone(110, 0.05, 'square', 0.04)
                else if (e.type === 'empty') audioController.playTone(80, 0.06, 'triangle', 0.05)
                else if (e.type === 'throw') audioController.playSweep(700, 300, 0.08, 'triangle', 0.03)
                else if (e.type === 'crash') { audioController.playNoise(0.25, 0.1); shake = 7; say('CRASH!') }
                else if (e.type === 'scare') audioController.playSweep(900, 500, 0.14, 'sawtooth', 0.05)
                else if (e.type === 'lunge') audioController.playTone(220, 0.08, 'sawtooth', 0.03)
                else if (e.type === 'stageclear') {
                    audioController.playSweep(400, 1300, 0.5, 'square', 0.07)
                    say(`${STAGES[e.si].name} COMPLETE +${e.bonus}${e.perfect ? ' — PERFECT ROUTE' : ''}`)
                } else if (e.type === 'win') audioController.playSweep(500, 1800, 0.9, 'square', 0.08)
                else if (e.type === 'dead') audioController.playSweep(300, 50, 1.1, 'sawtooth', 0.1)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('paperboy.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = provenRun()
            if (gs.end || demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0 }
            doSim(run.script[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            const steer = keys.r ? 1 : keys.l ? -1 : 0
            if (steer) lastDir = steer
            const inp = { steer, pedal: keys.u ? 2 : keys.d ? 0 : 1, throw: throwQ }
            throwQ = null
            doSim(inp)
        }

        // ---------------------------------------------------------------- paint ----
        const quad = (yA, xA0, xA1, yB, xB0, xB1, col) => {
            ctx.fillStyle = col
            ctx.beginPath(); ctx.moveTo(xA0, yA); ctx.lineTo(xA1, yA); ctx.lineTo(xB1, yB); ctx.lineTo(xB0, yB); ctx.closePath(); ctx.fill()
        }

        const paint = () => {
            const P = PALETTES[STAGES[gs.si].theme]
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.86; if (shake < 0.4) shake = 0 }

            // sky, sun, clouds, treeline
            const grad = ctx.createLinearGradient(0, 0, 0, Y0 + 8)
            grad.addColorStop(0, P.skyTop); grad.addColorStop(1, P.skyBot)
            ctx.fillStyle = grad; ctx.fillRect(0, 0, W, Y0 + 8)
            ctx.fillStyle = P.sun
            ctx.beginPath(); ctx.arc(205, 26, 11, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = P.cloud
            ctx.globalAlpha = 0.9
            for (const c of CLOUDS) {
                const cx = ((c.x - gs.s * c.v) % (W + 60) + W + 60) % (W + 60) - 30
                ctx.fillRect(cx, c.y + 4 * c.s, 26 * c.s, 5 * c.s)
                ctx.fillRect(cx + 4 * c.s, c.y, 11 * c.s, 6 * c.s)
                ctx.fillRect(cx + 12 * c.s, c.y + c.s, 12 * c.s, 5 * c.s)
            }
            ctx.globalAlpha = 1
            // treeline: a hazed far band and a dark front band, gently bumpy
            ctx.fillStyle = P.hillFar
            ctx.beginPath(); ctx.moveTo(0, Y0 + 8)
            for (let x = 0; x <= W; x += 8) ctx.lineTo(x, Y0 + 2 - Math.sin(x * 0.11) * 2.4 - Math.sin(x * 0.031 + 2.1) * 1.6)
            ctx.lineTo(W, Y0 + 8); ctx.closePath(); ctx.fill()
            ctx.fillStyle = P.hill
            ctx.beginPath(); ctx.moveTo(0, Y0 + 8)
            for (let x = 0; x <= W; x += 8) ctx.lineTo(x, Y0 + 4 - Math.sin(x * 0.05 + 1.7) * 3.2 - Math.sin(x * 0.17) * 1.4)
            ctx.lineTo(W, Y0 + 8); ctx.closePath(); ctx.fill()

            ctx.save(); ctx.translate(sx, sy)
            // road strip: far to near quads (extend past the boy so the
            // foreground is road, not a void at the canvas foot). Flat grass,
            // flat path, flat asphalt like the 1989 original — the boundaries
            // are thin LINE strips, not alternating bands (#186).
            for (let dy = LOOK; dy > -34; dy -= 4) {
                const rA = projRoad(dy), rB = projRoad(dy - 4)
                const y0r = rA.y, k0 = rA.k, y1r = rB.y, k1 = rB.k
                ctx.fillStyle = P.grass
                ctx.fillRect(0, y1r, W, y0r - y1r + 1)
                quad(y0r, 128 - 66 * k0, 128 + 66 * k0, y1r, 128 - 66 * k1, 128 + 66 * k1, P.walk)
                quad(y0r, 128 - 56 * k0, 128 + 56 * k0, y1r, 128 - 56 * k1, 128 + 56 * k1, P.kerb)
                quad(y0r, 128 - 54 * k0, 128 + 54 * k0, y1r, 128 - 54 * k1, 128 + 54 * k1, P.road)
                quad(y0r, 128 - 51 * k0, 128 - 49.5 * k0, y1r, 128 - 51 * k1, 128 - 49.5 * k1, P.edge)
                quad(y0r, 128 + 49.5 * k0, 128 + 51 * k0, y1r, 128 + 49.5 * k1, 128 + 51 * k1, P.edge)
                if (Math.floor((gs.s + dy) / 40) % 2 === 0) quad(y0r, 128 - 1.2 * k0, 128 + 1.2 * k0, y1r, 128 - 1.2 * k1, 128 + 1.2 * k1, P.stripe)
                for (const c of STAGES[gs.si].crossings) {
                    const cd = c.s - gs.s
                    if (dy - 4 < cd && cd <= dy) quad(y0r, 128 - 70 * k0, 128 + 70 * k0, y1r, 128 - 70 * k1, 128 + 70 * k1, '#8f8f96')
                }
            }
            // aerial haze where the road meets the treeline
            const hz = ctx.createLinearGradient(0, Y0, 0, Y0 + 16)
            hz.addColorStop(0, P.haze); hz.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = hz; ctx.fillRect(0, Y0, W, 16)
            // houses + props (far to near so nearer paints over)
            const props = []
            const hsList = gs.houses
            for (const h of hsList) {
                const dy = h.s - gs.s
                if (dy > LOOK || dy < -20) continue
                props.push({ kind: 'house', dy, side: h.side, done: h.done, s: h.s })
            }
            for (const c of gs.crates) { const dy = c.s - gs.s; if (dy <= LOOK && dy > -20) props.push({ kind: 'crate', dy, x: c.x, w: c.w || CFG.crateW }) }
            for (const d of gs.dogs) {
                const dy = d.s0 - gs.s
                if (dy <= LOOK && dy > -20 && !d.gone) props.push({ kind: 'dog', dy, x: d.x })
            }
            for (const c of gs.crossings) {
                for (const t0 of c.launched) {
                    if (t0 > gs.tick) continue
                    const xc = c.from * (84 - (gs.tick - t0) * CFG.carSpd)
                    if (Math.abs(xc) > 84) continue
                    props.push({ kind: 'cart', dy: c.s - gs.s, x: xc })
                }
            }
            // kerb trees between houses, deterministic
            for (let ts = Math.floor(gs.s / 90) * 90; ts < gs.s + LOOK; ts += 90) {
                const dy = ts - gs.s
                if (dy < 6) continue
                const side = Math.floor(ts / 90) % 2 ? 1 : -1
                if (!hsList.some((h) => Math.abs(h.s - ts) < 46)) props.push({ kind: 'tree', dy, side })
            }
            props.sort((a, b) => b.dy - a.dy)
            for (const p of props) drawProp(p, P)

            // the boy
            const [bx, by] = proj(gs.x, 0)
            drawBoy(bx, by, screenRef.current === 'play' ? (keys.r ? 1 : keys.l ? -1 : 0) : Math.sin(gs.tick / 9), gs.stun > 0)

            // papers in flight
            ctx.fillStyle = '#f5f2e8'
            for (const f of gs.flights) {
                if (f.s - gs.s > LOOK || f.s - gs.s < -8) continue
                const [fx, fy, fk] = proj(f.x, f.s - gs.s)
                ctx.fillRect(fx - 2 * fk, fy - 4 * fk, 4 * fk + 1, 3 * fk + 1)
            }
            ctx.restore()

            for (let i = part.length - 1; i >= 0; i--) {
                const pa = part[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.08
                if (pa.t > 26 || pa.y > H) { part.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 26; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            ctx.globalAlpha = 1
        }
        const projRoad = (dy) => ({ y: yAt(Math.min(1, dy / LOOK)), k: kAt(Math.min(1, dy / LOOK)) * Z })

        const shadow = (cx, cy, rx, ry) => {
            ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'
            ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
            ctx.globalAlpha = 1
        }

        const drawProp = (p, P) => {
            if (p.kind === 'house') {
                const [hx, hy, k] = proj(p.side * 78, p.dy)
                const w = 34 * k, hh = 26 * k
                shadow(hx, hy + 1 * k, w * 0.58, 3 * k)
                const pal = P.wall[Math.abs(Math.round(p.s / 60)) % P.wall.length]
                const pal2 = P.wall2[Math.abs(Math.round(p.s / 60)) % P.wall2.length]
                ctx.fillStyle = pal
                ctx.fillRect(hx - w / 2, hy - hh, w, hh)
                ctx.fillStyle = pal2
                ctx.fillRect(hx - w / 2, hy - hh * 0.45, w / 3, hh * 0.45)
                ctx.fillStyle = P.roof
                ctx.beginPath(); ctx.moveTo(hx - w / 2 - 3 * k, hy - hh); ctx.lineTo(hx, hy - hh - 11 * k); ctx.lineTo(hx + w / 2 + 3 * k, hy - hh); ctx.closePath(); ctx.fill()
                ctx.fillStyle = P.door
                ctx.fillRect(hx - 3 * k + p.side * 5 * k, hy - 9 * k, 6 * k, 9 * k)
                ctx.fillStyle = P.win
                ctx.fillRect(hx - w * 0.32, hy - hh * 0.75, 5 * k, 5 * k)
                ctx.fillRect(hx + w * 0.12, hy - hh * 0.75, 5 * k, 5 * k)
                // the mailbox sits between the door and the road; its flag
                // rises the moment the doorstep is delivered
                const [mx, my, mk] = proj(p.side * 68, p.dy)
                ctx.fillStyle = P.door
                ctx.fillRect(mx - mk, my - 9 * mk, 2 * mk, 9 * mk)
                ctx.fillStyle = P.box
                ctx.fillRect(mx - 3.5 * mk, my - 13 * mk, 7 * mk, 5 * mk)
                if (p.done) { ctx.fillStyle = '#e8443a'; ctx.fillRect(mx + 2.5 * mk, my - 19 * mk, 1.5 * mk, 6 * mk) }
                else { ctx.fillStyle = P.kerb; ctx.fillRect(mx + 2.5 * mk, my - 13.5 * mk, 3.5 * mk, 1.5 * mk) }
            } else if (p.kind === 'tree') {
                const [tx, ty, k] = proj(p.side * 66, p.dy)
                shadow(tx, ty + 1 * k, 8 * k, 2.4 * k)
                ctx.fillStyle = P.trunk; ctx.fillRect(tx - 2 * k, ty - 16 * k, 4 * k, 16 * k)
                ctx.fillStyle = P.tree
                ctx.beginPath(); ctx.arc(tx, ty - 20 * k, 10 * k, 0, Math.PI * 2); ctx.fill()
            } else if (p.kind === 'crate') {
                const [cx, cy, k] = proj(p.x, p.dy)
                shadow(cx, cy + 1 * k, (p.w + 4) * k, 2.6 * k)
                ctx.fillStyle = '#8a8f98'
                ctx.fillRect(cx - (p.w + 4) * k, cy - 11 * k, (p.w + 4) * 2 * k, 11 * k)
                ctx.fillStyle = '#5a5f68'
                ctx.fillRect(cx - p.w * k, cy - 4 * k, p.w * 2 * k, 3 * k)
            } else if (p.kind === 'dog') {
                const [dx, dy, k] = proj(p.x, p.dy)
                shadow(dx, dy + 0.5 * k, 8 * k, 2 * k)
                ctx.fillStyle = '#a8712e'
                ctx.fillRect(dx - 7 * k, dy - 6 * k, 14 * k, 5 * k)
                ctx.fillRect(dx + (p.x >= 0 ? 5 : -9) * k, dy - 9 * k, 4 * k, 4 * k)
                ctx.fillStyle = '#6b4519'
                ctx.fillRect(dx - 6 * k, dy - 1 * k, 2 * k, 2 * k)
                ctx.fillRect(dx + 4 * k, dy - 1 * k, 2 * k, 2 * k)
            } else if (p.kind === 'cart') {
                const [cx, cy, k] = proj(p.x, p.dy)
                shadow(cx, cy + 1 * k, 14 * k, 3 * k)
                ctx.fillStyle = P.cart
                ctx.fillRect(cx - 14 * k, cy - 9 * k, 28 * k, 8 * k)
                ctx.fillStyle = '#20242c'
                ctx.fillRect(cx - 11 * k, cy - 12 * k, 10 * k, 4 * k)
                ctx.fillRect(cx - 12 * k, cy - 1 * k, 5 * k, 2 * k)
                ctx.fillRect(cx + 7 * k, cy - 1 * k, 5 * k, 2 * k)
            }
        }

        // The original rides from BEHIND: one wheel, the rider's back, the
        // handlebars hidden behind him. The profile view was the "bike is
        // sideways" bug (#186). Lean tilts the whole figure; the rider bobs
        // at pedal rate while the wheel stays planted.
        const drawBoy = (bx, by, lean, hurt) => {
            ctx.save(); ctx.translate(bx, by)
            if (hurt) ctx.rotate(Math.sin(gs.tick / 2) * 0.18)
            else ctx.rotate(lean * 0.12)
            shadow(0, 1, 7, 2)
            const bob = Math.sin(gs.tick * 0.09 * (gs.pedal + 1)) * 0.7
            // rear wheel, seen from behind: a vertical sliver
            ctx.fillStyle = '#1c2027'
            ctx.fillRect(-2, -8, 4, 9)
            ctx.fillStyle = '#c9ced6'
            ctx.fillRect(-1, -6, 2, 3)
            // red frame: fender plus the forks working out to each side
            ctx.fillStyle = '#e8443a'
            ctx.fillRect(-4.5, -9, 9, 2)
            ctx.fillRect(-5, -7, 2, 5)
            ctx.fillRect(3, -7, 2, 5)
            // rider, back view
            ctx.fillStyle = '#2e6fd8'
            ctx.fillRect(-4, -16 + bob, 8, 9)
            ctx.fillRect(-6, -15 + bob, 2, 6)
            ctx.fillRect(4, -15 + bob, 2, 6)
            ctx.fillStyle = '#e8b088'
            ctx.fillRect(-6, -10 + bob, 2, 2)
            ctx.fillRect(4, -10 + bob, 2, 2)
            ctx.fillRect(-3, -20 + bob, 6, 5)
            ctx.fillStyle = '#e8443a'
            ctx.fillRect(-3, -22 + bob, 6, 3)
            if (gs.papers > 0) { ctx.fillStyle = '#f5f2e8'; ctx.fillRect(-8, -13 + bob, 4, 4) }
            ctx.restore()
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const h = hudRef.current
            if (h.stage) h.stage.textContent = STAGES[gs.si].name
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.hiscore) h.hiscore.textContent = String(Math.max(gs.score, ...board().map((b) => b.score), 0)).padStart(6, '0')
            if (h.papers) h.papers.textContent = String(gs.papers)
            if (h.lives) h.lives.textContent = 'x' + gs.lives
            if (h.streak) h.streak.textContent = gs.streak > 1 ? `x${gs.streak}` : ''
            if (h.doors) h.doors.textContent = `${gs.delivered}/${gs.totalHouses}`
            if (h.prog) h.prog.style.width = `${Math.min(100, (gs.s / STAGES[gs.si].len) * 100)}%`
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft
                    while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
                }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame(0)
            evLog.length = 0; part.length = 0
            keys.l = keys.r = keys.u = keys.d = false
            throwQ = null; lastDir = -1
            setMode('play')
            say(STAGES[0].name.toUpperCase())
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') { keys.l = true; lastDir = -1 }
            if (e.code === 'ArrowRight') { keys.r = true; lastDir = 1 }
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') throwQ = lastDir
            if (e.code === 'KeyF' || e.code === 'KeyX') throwQ = 2
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = false }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${W * sc}px`
            canvas.style.height = `${H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__paperTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, si: gs.si, s: +gs.s.toFixed(2), x: +gs.x.toFixed(2),
                    pedal: gs.pedal, lives: gs.lives, score: gs.score, streak: gs.streak, papers: gs.papers,
                    delivered: gs.delivered, end: gs.end, keys: { ...keys }, lastDir,
                    houses: gs.houses.map((h) => ({ s: h.s, side: h.side, done: h.done })),
                    flights: gs.flights.map((f) => ({ x: +f.x.toFixed(1), s: +f.s.toFixed(1), fwd: !!f.fwd })),
                    dogs: gs.dogs.map((d) => ({ s0: d.s0, x: +d.x.toFixed(1), gone: d.gone })),
                    carts: gs.crossings.flatMap((c) => c.launched.filter((t0) => t0 <= gs.tick).map((t0) => ({ s: c.s, x: +(c.from * (84 - (gs.tick - t0) * CFG.carSpd)).toFixed(1) }))),
                    boy: (() => { const [bx, by] = proj(gs.x, 0); return { bx: +bx.toFixed(1), by: Math.round(by) } })(),
                    evLog: evLog.slice(-100),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                proj: (x, dy) => proj(x, dy),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.s !== undefined) gs.s = opts.s
                    if (opts.x !== undefined) gs.x = opts.x
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.papers !== undefined) gs.papers = opts.papers
                    if (opts.stun !== undefined) gs.stun = opts.stun
                    if (opts.inv !== undefined) gs.inv = opts.inv
                    if (opts.quiet) for (const c of gs.crossings) { c.launched.length = 0; c.nextL = gs.tick + 100000 }
                    if (opts.dogsOff) for (const d of gs.dogs) if (!d.gone && opts.dogsOff.includes(d.s0)) { d.gone = true; d.vx = 0 }
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'PAPERBOY',
                getState: () => [
                    `${STAGES[gs.si].name}  s=${gs.s.toFixed(0)}/${STAGES[gs.si].len}  doors ${gs.delivered}/${gs.totalHouses}  papers ${gs.papers}`,
                    `score ${gs.score}  streak x${gs.streak}  lives ${gs.lives}  pedal ${['crawl', 'cruise', 'mash'][gs.pedal]}  x ${gs.x.toFixed(1)}`,
                    `flights ${gs.flights.length}  dogs ${gs.dogs.map((d) => (d.gone ? 'x' : Math.round(d.x))).join(',')}  carts ${gs.crossings.flatMap((c) => c.launched.filter((t0) => t0 <= gs.tick).length)}`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}  G=${G}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const run = provenRun()
                            if (!run.ok) return `the planner itself is broken: ${run.why}`
                            const clone = JSON.parse(JSON.stringify(gs))
                            clone.events = []
                            // anchor to this stage's segment of the proven script;
                            // mid-route state (stuns/cheats) shifts s, so map by s
                            const rec = (run.receipts || []).find((x) => x.si === gs.si)
                            const from = rec ? rec.tStart + Math.round(gs.s / PEDAL[1]) : 0
                            let t = from, crashes = 0
                            while (!clone.end && t < run.script.length) {
                                step(clone, run.script[t])
                                for (const e of clone.events) if (e.type === 'crash') crashes++
                                clone.events.length = 0
                                t++
                            }
                            return clone.end === 'win' && crashes === 0
                                ? `WINNABLE with the proven script: ${clone.delivered}/${clone.totalHouses} doors, ${clone.papers} papers spare`
                                : `NOT winnable with the proven script from HERE: end=${clone.end} crashes=${crashes} — if you cheated the state, replay (the script assumes a clean route)`
                        },
                    },
                    { label: '+6 PAPERS', run: () => { gs.papers += 6; return 'bundle restocked' } },
                    { label: 'LEAN AT NEXT DOOR', run: () => {
                        const nxt = gs.houses.find((h) => !h.done && h.s > gs.s)
                        if (!nxt) return 'no doors ahead'
                        gs.x = nxt.side * 20
                        return `leaned ${nxt.side < 0 ? 'LEFT' : 'RIGHT'} toward s=${nxt.s} (now ${gs.s.toFixed(0)})`
                    } },
                    { label: 'WARP 200', run: () => { gs.s += 200; return 'jumped ahead (script no longer matches)' } },
                ],
            })
            let prevA = false, contractSeed = 0
            exposeGame({
                id: 'paperboy',
                buttons: ['left', 'right', 'up', 'down', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(0)
                    evLog.length = 0; part.length = 0
                    keys.l = keys.r = keys.u = keys.d = false
                    throwQ = null; lastDir = -1
                    prevA = false; demoAt = 0
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const steer = pad.right ? 1 : pad.left ? -1 : 0
                    if (steer) lastDir = steer
                    const thr = !!pad.a && !prevA
                    prevA = !!pad.a
                    doSim({ steer, pedal: pad.up ? 2 : pad.down ? 0 : 1, throw: thr ? lastDir : null })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, lives: gs.lives, delivered: gs.delivered,
                    missed: gs.missed, papers: gs.papers, streak: gs.streak, hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__paperTest) delete window.__paperTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('stage')} className="border border-lime-300/60 text-lime-200 px-2 py-0.5 rounded bg-black/40">MAPLE STREET</span>
                    <span className="text-amber-200">PAPERS <b ref={setHud('papers')}>29</b></span>
                    <span className="text-red-300">LIVES <b ref={setHud('lives')}>x3</b></span>
                    <span className="text-cyan-200">DOORS <b ref={setHud('doors')}>0/77</b></span>
                    <span ref={setHud('streak')} className="text-yellow-300 font-bold" />
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div className="absolute top-9 left-3 right-3 h-1 bg-white/10 rounded">
                    <div ref={setHud('prog')} className="h-1 bg-lime-400/80 rounded" style={{ width: '0%' }} />
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-2xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                        <h1 className="text-4xl font-black" style={{ color: '#ffd23e', textShadow: '3px 0 0 #e8443a, -3px 0 0 #2e6fd8, 0 10px 24px #000' }}>PAPERBOY</h1>
                        <p className="text-white font-mono font-bold mt-2 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'ROUTES COMPLETE' : 'OUT OF LIVES'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — every doorstep in town' : ''}</p>
                    <div className="bg-black/50 border border-amber-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PAPERBOY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default PaperboyGame

// PICK RUSH — the arcade shell and painter. The rules live in ./sim.js (pure,
// seeded); this file only draws it and wires input, audio, the pad, the pause
// screen and the harness hooks. Look: a night-shift sorting warehouse at the
// original's 426×240, `imageSmoothingEnabled = false` — hazard stripes, caged
// lamps, a rubber tread belt, sheet-metal bins and two gantry cranes.
//
// The renderer's ONLY spatial contract is `screen = world` (no camera): every
// sim coordinate lands on the canvas at the same number, which is what
// pickcheck samples to prove the drawn claw and cargo sit where the physics
// says they are, after every real keystroke.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    makeGame, step, autopilot,
    VIEW_W, VIEW_H, RAIL_Y, BELT_Y, BELT_END,
    BIN_TOP, FLOOR_Y, SHIFT_TICKS, FUSES,
    BINS, SHIFTS,
} from './sim.js'

const SIM_MS = 1000 / 60

// signature paint per kind — body cores are all mutually distinct so the
// harness can prove each cargo type is painted exactly where the sim puts it
const CORE = {
    crate: '#a06a34', can: '#e0a030', barrel: '#b8862f',
    bottle: '#ff5ce0', coil: '#43d67c', scrap: '#8b8f98',
}
const TAG = { crate: '#3fd8ff', can: '#ffb03a', barrel: '#ffb03a', bottle: '#ff4fd8', coil: '#5dff8f', scrap: '#ff5a4f' }
const BIN_TAG = ['#3fd8ff', '#ffb03a', '#ff4fd8', '#5dff8f', '#ff5a4f']
const ARM_SKIN = ['#7ec8ff', '#ffb347']
const ARM_DARK = ['#173042', '#3a2408']
const CABLE = '#cfd8e3'

const srand = (seed) => {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }
const capsule = (ctx, x1, y1, x2, y2, w, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

// pre-generated backdrop columns (deterministic; zero RNG at draw time)
const bgCache = {}
const bgSet = (key, count, fn) => {
    if (bgCache[key]) return bgCache[key]
    const out = []
    const rnd = srand(7717)
    for (let i = 0; i < count; i++) out.push(fn(rnd, i))
    return (bgCache[key] = out)
}

// one item sprite, centered on (x, y)
const drawItem = (ctx, kind, x, y, rot, tiny = false) => {
    const s = tiny ? 0.5 : 1
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    if (kind === 'crate') {
        ctx.fillStyle = '#6e4a26'; ctx.fillRect(-7, -6, 14, 12)
        ctx.fillStyle = CORE.crate; ctx.fillRect(-6, -5, 12, 10)
        ctx.strokeStyle = '#54371b'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(6, 5); ctx.moveTo(6, -5); ctx.lineTo(-6, 5); ctx.stroke()
        ctx.fillStyle = TAG.crate; ctx.fillRect(-2.5, -2.5, 5, 5)
        ctx.fillStyle = '#0a1622'; ctx.fillRect(-1.5, -1.5, 3, 3)
    } else if (kind === 'can') {
        ctx.fillStyle = '#8a6216'; ctx.fillRect(-5, -8, 10, 16)
        ctx.fillStyle = CORE.can; ctx.fillRect(-4.5, -7, 9, 14)
        ctx.fillStyle = 'rgba(255,235,190,0.5)'; ctx.fillRect(-4.5, -7, 2.5, 14)
        ctx.fillStyle = '#8a6216'; ctx.fillRect(-5, -4, 10, 2); ctx.fillRect(-5, 3, 10, 2)
        ctx.fillStyle = '#3a2808'; ctx.fillRect(-2, -8, 4, 1.5)
    } else if (kind === 'barrel') {
        ctx.rotate(rot || 0)
        ctx.fillStyle = '#7c5a1c'; circle(ctx, 0, 0, 7.5); ctx.fill()
        ctx.fillStyle = CORE.barrel; circle(ctx, 0, 0, 6.5); ctx.fill()
        ctx.strokeStyle = 'rgba(60,42,12,0.9)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = '#3a2808'
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2
            ctx.fillRect(Math.cos(a) * 5.5 - 1, Math.sin(a) * 5.5 - 1, 2, 2)
        }
        ctx.fillStyle = TAG.barrel; ctx.fillRect(-1.5, -1.5, 3, 3)
    } else if (kind === 'bottle') {
        ctx.fillStyle = '#8a2470'; ctx.fillRect(-3.5, -4, 7, 13)
        ctx.fillStyle = CORE.bottle; ctx.fillRect(-3, -3, 6, 11)
        ctx.fillStyle = '#8a2470'; ctx.fillRect(-1.5, -9, 3, 6)
        ctx.fillStyle = CORE.bottle; ctx.fillRect(-1, -8.5, 2, 5)
        ctx.fillStyle = '#e8d8b0'; ctx.fillRect(-1.5, -10, 3, 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-2.4, -1.5, 1.4, 7)
        ctx.fillStyle = '#fff'; ctx.fillRect(-3, 1, 6, 3)
        ctx.fillStyle = '#701858'; ctx.fillRect(-2, 2, 4, 1)
    } else if (kind === 'coil') {
        ctx.strokeStyle = '#1d6b3c'; ctx.lineWidth = 5
        circle(ctx, 0, 0, 5.5); ctx.stroke()
        ctx.strokeStyle = CORE.coil; ctx.lineWidth = 3.4
        circle(ctx, 0, 0, 5.5); ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1
        circle(ctx, 0, 0, 6.4); ctx.stroke()
        ctx.fillStyle = '#0c2415'; circle(ctx, 0, 0, 3); ctx.fill()
        ctx.fillStyle = TAG.coil; ctx.fillRect(-1.4, -7, 2.8, 2.4)
    } else {
        ctx.fillStyle = '#5c6068'; circle(ctx, 0, 0, 6.5); ctx.fill()
        ctx.fillStyle = CORE.scrap; circle(ctx, 0, 0, 5); ctx.fill()
        ctx.fillStyle = '#3a3d44'
        for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.fillRect(-1.6, -8, 3.2, 3); ctx.restore()
        }
        ctx.fillStyle = '#22242a'; circle(ctx, 0, 0, 1.8); ctx.fill()
        ctx.fillStyle = 'rgba(150,90,40,0.6)'; ctx.fillRect(1, -3, 2.6, 2.2)
    }
    ctx.restore()
}

const PICK_ATTRACT = [
    'CONVEYOR LIVE — SORT EVERY PIECE BEFORE THE WHISTLE',
    'A LOWERS THE CLAW — GRAB, HOIST, DROP IT IN ITS BIN',
    'ARROWS DRIVE THE GANTRY · DOWN FEATHERS A CARGO DROP',
    'GLASS BOTTLES ARE FRAGILE — SLAM DROPS SMASH THEM',
    'BARRELS ROLL — GRAB ONE OFF-AXIS AND THE CLAW SLIPS',
    'MISS THE END OF THE LINE: −50 AND YOUR COMBO DIES',
    'CLEAR THE QUOTA BEFORE THE SHIFT CLOCK RUNS DRY',
    'THREE BAD PLACES ON THE FLOOR AND YOU ARE FIRED',
    'P: TWO HUMANS ON ONE BELT · C: RACE THE FOREMAN (CPU)',
]

const PickRushGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const seatsRef = useRef(2)
    const humanSeat2Ref = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.pickrushStage = '1'
        canvas.width = VIEW_W * 2; canvas.height = VIEW_H * 2
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.scale(2, 2)

        let gs = makeGame(1337, 2)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0
        let shake = 0, flash = 0
        let musicZone = 0
        let contractSeed = 4242
        const parts = []
        const keys = { left: false, right: false, down: false }
        const keys2 = { left: false, right: false, down: false }
        let edgeA = false, edgeB = false, edge2A = false
        const evLog = []
        let overAt = 0

        const say = (msg, col = '#ffd23f') => {
            hudRef.current.toast && (hudRef.current.toast.textContent = msg)
            hudRef.current.toast && (hudRef.current.toast.style.color = col)
            hudRef.current.toastT = 90
        }

        // belt motor: one quiet band-passed noise loop whose pitch tracks belt
        // speed — the factory floor hum under everything else
        const hum = { src: null, gain: null, filter: null }
        const ensureHum = () => {
            if (hum.src || !audioController.ctx || audioController.muted) return
            const actx = audioController.ctx, sr = actx.sampleRate
            const buf = actx.createBuffer(1, sr, sr)
            const d = buf.getChannelData(0)
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
            const src = actx.createBufferSource(); src.buffer = buf; src.loop = true
            const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 160
            const gain = actx.createGain(); gain.gain.value = 0
            src.connect(filter); filter.connect(gain); gain.connect(actx.destination)
            src.start()
            hum.src = src; hum.gain = gain; hum.filter = filter
        }
        const setHum = (on, spd) => {
            if (!hum.gain) return
            const t = audioController.ctx.currentTime
            hum.gain.gain.setTargetAtTime(on && !audioController.muted ? 0.05 : 0, t, 0.12)
            hum.filter.frequency.setTargetAtTime(120 + spd * 110, t, 0.12)
        }

        const burst = (x, y, n, col, spd = 3, up = -1) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * spd
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, t: 0, col, g: 0.14 })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'grab') { audioController.playSweep(420, 760, 0.09, 'square', 0.05); burst(e.x, e.y, 3, '#cfd8e3', 1.4) }
                else if (e.type === 'release') audioController.playNoise(0.07, 0.05)
                else if (e.type === 'drop') {
                    audioController.playTone(660 + Math.min(6, e.combo) * 90, 0.07, 'square', 0.06)
                    audioController.playTone(990 + Math.min(6, e.combo) * 90, 0.12, 'square', 0.05, 0.07)
                    burst(e.x, BIN_TOP, 5, TAG[e.kind], 2)
                    if (e.combo >= 4) say(`COMBO ×${e.combo}`, '#ffd23f')
                }
                else if (e.type === 'miss') { audioController.playSweep(240, 120, 0.2, 'sawtooth', 0.06); shake = 4 }
                else if (e.type === 'wrong') { audioController.playTone(180, 0.12, 'square', 0.08); audioController.playTone(140, 0.18, 'square', 0.08, 0.1); shake = 6; flash = 8; burst(e.x, BIN_TOP, 8, '#ff5a4f', 2.4) }
                else if (e.type === 'break') {
                    audioController.playNoise(0.18, 0.09); audioController.playSweep(1600, 300, 0.22, 'triangle', 0.06)
                    shake = 7; flash = 10
                    for (let i = 0; i < 14; i++) {
                        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 1 + Math.random() * 3.4
                        parts.push({ x: e.x, y: BIN_TOP, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col: '#ff9dec', g: 0.2 })
                    }
                }
                else if (e.type === 'slip') { audioController.playSweep(900, 500, 0.1, 'sawtooth', 0.05); burst(e.x, e.y, 3, '#9aa4b0', 1.2) }
                else if (e.type === 'shift') {
                    audioController.playTone(523, 0.1, 'square', 0.07)
                    audioController.playTone(659, 0.1, 'square', 0.07, 0.11)
                    audioController.playTone(784, 0.2, 'square', 0.07, 0.22)
                    say(`SHIFT ${e.shift + 1} CLEAR — LINE SPEED UP`, '#5dff8f')
                }
                else if (e.type === 'fire') { audioController.playDeath(); shake = 9; flash = 12 }
                else if (e.type === 'win') { audioController.playFanfare(); say('CONTRACT COMPLETED!', '#ffd23f') }
            }
        }

        const finish = () => {
            const won = gs.end === 'win'
            overAt = performance.now()
            setEnd({
                won,
                score: gs.score,
                best: gs.bestCombo,
                shift: gs.shift + 1,
                reason: gs.endReason,
            })
            const board = (() => { try { return JSON.parse(localStorage.getItem('pickrush.board') || '[]') } catch { return [] } })()
            if (gs.score > 0) localStorage.setItem('pickrush.board', JSON.stringify([...board, { score: gs.score, shift: gs.shift + 1, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            setMode('over')
        }

        const livePads = () => {
            const p1 = { left: keys.left, right: keys.right, down: keys.down, a: edgeA, b: edgeB }
            const pads = [p1]
            if (gs.players > 1) {
                pads.push(humanSeat2Ref.current
                    ? { left: keys2.left, right: keys2.right, down: keys2.down, a: edge2A, b: false }
                    : autopilot(gs, 1))
            }
            return pads
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (demoAt > 90 && gs.end) { gs = makeGame(1337 + (demoAt % 97), 2); demoAt = 0 }
                step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
                handleEvents(gs.ev)
                demoAt++
                return
            }
            if (sc !== 'play') return
            step(gs, livePads())
            edgeA = false; edgeB = false; edge2A = false
            handleEvents(gs.ev)
            if (gs.end) finish()
        }

        // ---------------- painter ----------------
        const paintBack = (tick) => {
            const g = ctx.createLinearGradient(0, 0, 0, VIEW_H)
            g.addColorStop(0, '#0b1016'); g.addColorStop(0.55, '#131a24'); g.addColorStop(1, '#0d131b')
            ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H)

            // far wall: riveted panels
            ctx.strokeStyle = 'rgba(70,88,110,0.16)'; ctx.lineWidth = 1
            for (let x = 0; x < VIEW_W; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BELT_Y - 14); ctx.stroke() }
            ctx.fillStyle = 'rgba(160,180,205,0.10)'
            for (const p of bgSet('rivets', 44, (r) => [Math.floor(r() * VIEW_W), Math.floor(r() * (BELT_Y - 20))])) ctx.fillRect(p[0], p[1], 1.5, 1.5)

            // distant shelving with silhouetted stock
            for (const sh of bgSet('shelf', 3, (r) => [20 + Math.floor(r() * 340), 34 + Math.floor(r() * 26), 4 + Math.floor(r() * 4)])) {
                ctx.fillStyle = '#1a222e'; ctx.fillRect(sh[0], sh[1], sh[2] * 12, sh[3] > 5 ? 14 : 12)
                for (let k = 0; k < sh[2]; k++) {
                    const boxH = 5 + ((k * 7 + sh[0]) % 4)
                    ctx.fillStyle = ['#22303f', '#2a2a1e', '#1e2c26'][k % 3]
                    ctx.fillRect(sh[0] + 2 + k * 12, sh[1] - boxH + 2, 9, boxH)
                }
                ctx.fillStyle = '#232e3c'; ctx.fillRect(sh[0], sh[1] + 3, sh[2] * 12, 2)
            }

            // pipes with valves and a periodic steam puff
            ctx.strokeStyle = '#2c3a4a'; ctx.lineWidth = 5
            ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(VIEW_W, 18); ctx.stroke()
            ctx.strokeStyle = '#22303e'; ctx.lineWidth = 3
            ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(300, 24); ctx.stroke()
            for (const v of bgSet('valve', 4, (r) => [Math.floor(r() * VIEW_W), r()])) {
                ctx.fillStyle = '#3a4c60'; ctx.fillRect(v[0], 15, 5, 11)
                ctx.fillStyle = v[1] > 0.5 ? '#c8543c' : '#54b0c8'; circle(ctx, v[0] + 2.5, 14, 2.6); ctx.fill()
            }
            const steam = (tick * 0.7) % 260
            if (steam < 90) {
                ctx.globalAlpha = 0.16 * (1 - steam / 90)
                ctx.fillStyle = '#cfe0ee'
                for (let k = 0; k < 4; k++) circle(ctx, 300 + Math.sin(k * 2 + tick * 0.05) * 3, 12 - steam * 0.18 - k * 6, 3 + k * 2.4), ctx.fill()
                ctx.globalAlpha = 1
            }

            // caged lamps that sway and pool light onto the floor
            for (const L of bgSet('lamp', 3, (r) => [50 + Math.floor(r() * 320), r()])) {
                const sway = Math.sin(tick * 0.012 + L[1] * 9) * 2.4
                const lx = L[0] + sway, ly = 30
                ctx.strokeStyle = '#3a4c60'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(L[0], 0); ctx.lineTo(lx, ly); ctx.stroke()
                const pool = ctx.createRadialGradient(lx, ly + 6, 2, lx, ly + 6, 46)
                pool.addColorStop(0, 'rgba(255,214,130,0.20)'); pool.addColorStop(1, 'rgba(255,214,130,0)')
                ctx.fillStyle = pool
                ctx.beginPath(); ctx.moveTo(lx - 22, BELT_Y + 60); ctx.lineTo(lx - 6, ly + 8); ctx.lineTo(lx + 6, ly + 8); ctx.lineTo(lx + 22, BELT_Y + 60); ctx.closePath(); ctx.fill()
                ctx.fillStyle = '#1c2634'; ctx.beginPath(); ctx.moveTo(lx - 7, ly); ctx.lineTo(lx + 7, ly); ctx.lineTo(lx + 4, ly + 6); ctx.lineTo(lx - 4, ly + 6); ctx.closePath(); ctx.fill()
                const flick = 0.75 + 0.25 * Math.abs(Math.sin(tick * 0.11 + L[1] * 20))
                ctx.fillStyle = `rgba(255,216,140,${flick})`; circle(ctx, lx, ly + 6, 2.4); ctx.fill()
            }
        }

        const paintFloor = () => {
            ctx.fillStyle = '#141a22'; ctx.fillRect(0, BIN_TOP + 40, VIEW_W, VIEW_H - BIN_TOP - 40)
            ctx.fillStyle = '#1a222c'; ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y)
            // hazard stripe
            for (let x = -16; x < VIEW_W + 16; x += 12) {
                ctx.fillStyle = '#c8a11c'
                ctx.beginPath(); ctx.moveTo(x, FLOOR_Y); ctx.lineTo(x + 6, FLOOR_Y); ctx.lineTo(x + 12, VIEW_H); ctx.lineTo(x + 6, VIEW_H); ctx.closePath(); ctx.fill()
            }
            ctx.fillStyle = 'rgba(10,14,20,0.55)'; ctx.fillRect(0, FLOOR_Y + 3, VIEW_W, VIEW_H - FLOOR_Y - 3)
        }

        const paintBelt = (tick) => {
            // legs
            ctx.fillStyle = '#22303e'
            for (const lx of [40, 200, 360]) ctx.fillRect(lx, BELT_Y + 12, 7, BIN_TOP + 34 - BELT_Y)
            // frame
            ctx.fillStyle = '#31404f'; ctx.fillRect(-4, BELT_Y - 3, BELT_END + 8, 4)
            // rubber tread
            ctx.fillStyle = '#161c24'; ctx.fillRect(-4, BELT_Y, BELT_END + 8, 12)
            ctx.save(); ctx.beginPath(); ctx.rect(-4, BELT_Y, BELT_END + 8, 12); ctx.clip()
            ctx.strokeStyle = '#242e3a'; ctx.lineWidth = 3
            const off = gs.beltPos
            for (let x = -20; x < BELT_END + 20; x += 16) {
                ctx.beginPath(); ctx.moveTo(x + off, BELT_Y); ctx.lineTo(x + off + 7, BELT_Y + 12); ctx.stroke()
            }
            ctx.restore()
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(-4, BELT_Y, BELT_END + 8, 1.5)
            // end rollers
            for (const rx of [-1, BELT_END + 3]) {
                ctx.fillStyle = '#3a4c60'; circle(ctx, rx + 2, BELT_Y + 6, 7); ctx.fill()
                ctx.strokeStyle = '#22303e'; ctx.lineWidth = 2
                const ra = tick * 0.14
                ctx.beginPath(); ctx.moveTo(rx + 2 - Math.cos(ra) * 5, BELT_Y + 6 - Math.sin(ra) * 5); ctx.lineTo(rx + 2 + Math.cos(ra) * 5, BELT_Y + 6 + Math.sin(ra) * 5); ctx.stroke()
            }
            // end-of-line warning: strobe board + flags
            const danger = gs.items.some((it) => it.onBelt && it.carriedBy === -1 && it.x > 350)
            if (danger && tick % 30 < 15) {
                ctx.fillStyle = '#ffcf3f'
                for (let y = BELT_Y - 18; y < BELT_Y - 6; y += 4) ctx.fillRect(424, y, 3, 3)
            }
            ctx.fillStyle = danger ? (tick % 20 < 10 ? '#ff5a4f' : '#7c2f28') : '#33404e'
            ctx.fillRect(420, BELT_Y - 22, 6, 16)
            ctx.fillStyle = '#0d131b'; ctx.fillRect(421, BELT_Y - 20, 4, 5)
        }

        const paintBins = (tick) => {
            for (let i = 0; i < BINS.length; i++) {
                const b = BINS[i]
                const y = BIN_TOP
                // body with bevelled rim
                ctx.fillStyle = '#222c38'; ctx.fillRect(b.x, y, b.w, FLOOR_Y - y + 2)
                ctx.fillStyle = '#1a222c'; ctx.fillRect(b.x + 3, y + 6, b.w - 6, FLOOR_Y - y - 4)
                ctx.fillStyle = '#2e3c4c'; ctx.fillRect(b.x, y, b.w, 4)
                ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(b.x, y, 2, FLOOR_Y - y)
                // open mouth
                ctx.fillStyle = '#0a0f16'; ctx.fillRect(b.x + 4, y + 1, b.w - 8, 3)
                // landed stock silhouette (climbs with the fill)
                const fill = Math.min(10, gs.binFill[i])
                for (let k = 0; k < fill; k++) {
                    const bxp = b.x + 8 + (k % 3) * 18 + ((k * 13) % 6)
                    const byp = FLOOR_Y - 6 - Math.floor(k / 3) * 9
                    if (byp > y + 8) { ctx.fillStyle = 'rgba(40,52,66,0.9)'; ctx.fillRect(bxp, byp, 12, 8) }
                }
                // tag plate
                ctx.fillStyle = '#0d141d'; ctx.fillRect(b.x + 8, y + 24, b.w - 16, 12)
                ctx.strokeStyle = BIN_TAG[i]; ctx.lineWidth = 1; ctx.strokeRect(b.x + 8.5, y + 24.5, b.w - 17, 11)
                ctx.fillStyle = BIN_TAG[i]
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                ctx.fillText(b.label, b.x + b.w / 2, y + 33)
                // corner bolts
                ctx.fillStyle = '#48586c'
                ctx.fillRect(b.x + 2, y + 6, 2, 2); ctx.fillRect(b.x + b.w - 4, y + 6, 2, 2)
            }
            ctx.textAlign = 'left'
            void tick
        }

        const paintArm = (seat, tick) => {
            const arm = gs.arms[seat]
            const skin = ARM_SKIN[seat], dark = ARM_DARK[seat]
            const ry = seat === 0 ? RAIL_Y : RAIL_Y + 9
            const x = Math.round(arm.x)
            // cable with a slight whip when the arm moves
            const whip = Math.max(-4, Math.min(4, -arm.vx * 1.6))
            ctx.strokeStyle = seat === 0 ? CABLE : 'rgba(159,174,190,0.8)'; ctx.lineWidth = 1.6
            ctx.beginPath(); ctx.moveTo(x, ry + 4); ctx.quadraticCurveTo(x + whip, (ry + arm.tip) / 2, x, arm.tip - 8); ctx.stroke()
            // claw head + jaws
            const open = arm.held !== null || arm.clamp > 0 ? 1.6 : 5.2
            const wob = arm.mode === 'lowering' && gs.tick % 8 < 4 ? 0.8 : 0
            ctx.fillStyle = dark; ctx.fillRect(x - 4, arm.tip - 9, 8, 5)
            ctx.fillStyle = skin; ctx.fillRect(x - 3.4, arm.tip - 8, 6.8, 2)
            ctx.strokeStyle = skin; ctx.lineWidth = 2.4
            ctx.beginPath(); ctx.moveTo(x - 3, arm.tip - 4); ctx.lineTo(x - open - wob, arm.tip + 2); ctx.lineTo(x - open + 1, arm.tip + 7); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(x + 3, arm.tip - 4); ctx.lineTo(x + open + wob, arm.tip + 2); ctx.lineTo(x + open - 1, arm.tip + 7); ctx.stroke()
            // carried cargo hangs in the jaws
            if (arm.held !== null) {
                const it = gs.items.find((i2) => i2.id === arm.held)
                if (it) drawItem(ctx, it.kind, x, arm.tip + 9, it.rot)
            }
            // carriage on the rail: hazard-striped box with a beacon
            ctx.fillStyle = dark; ctx.fillRect(x - 11, ry - 8, 22, 13)
            ctx.fillStyle = skin; ctx.fillRect(x - 10, ry - 7, 20, 3)
            ctx.fillStyle = '#c8a11c'
            for (let sx = x - 9; sx < x + 9; sx += 6) ctx.fillRect(sx, ry - 2, 3, 5)
            const blink = (tick + seat * 17) % 40 < 20
            ctx.fillStyle = blink ? skin : dark; circle(ctx, x, ry - 10, 2); ctx.fill()
            // wheels
            ctx.fillStyle = '#0d131b'; ctx.fillRect(x - 12, ry + 4, 5, 3); ctx.fillRect(x + 7, ry + 4, 5, 3)
        }

        const paintRail = () => {
            for (const [ry, shade] of [[RAIL_Y, '#31404f'], [RAIL_Y + 9, '#2a3746']]) {
                ctx.fillStyle = '#22303e'; ctx.fillRect(0, ry - 12, VIEW_W, 4)
                ctx.fillStyle = shade; ctx.fillRect(0, ry - 8, VIEW_W, 8)
                ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, ry + 2, VIEW_W, 3)
                ctx.fillStyle = '#1a2634'
                for (let x = 8; x < VIEW_W; x += 26) ctx.fillRect(x, ry - 7, 2, 6)
                ctx.fillStyle = '#48586c'
                for (let x = 20; x < VIEW_W; x += 78) { ctx.fillRect(x, ry - 11, 3, 3) }
            }
        }

        const paintFx = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g
                if (p.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 26; ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.globalAlpha = 1
            // floating verdict labels
            for (let i = gs.fx.length - 1; i >= 0; i--) {
                const f = gs.fx[i]
                if (f.k > 46) { gs.fx.splice(i, 1); continue }
                ctx.globalAlpha = Math.max(0, 1 - f.k / 46)
                ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
                const col = f.t === 'ok' ? '#5dff8f' : f.t === 'shift' ? '#ffd23f' : '#ff5a4f'
                const yy = f.y - f.k * 0.4
                if (f.t === 'shift') {
                    ctx.globalAlpha = Math.min(1, f.k / 8)
                    ctx.fillStyle = 'rgba(10,14,20,0.8)'; ctx.fillRect(VIEW_W / 2 - 90, VIEW_H / 2 - 26, 180, 20)
                    ctx.fillStyle = col; ctx.font = 'bold 13px monospace'
                    ctx.fillText(f.msg, VIEW_W / 2, VIEW_H / 2 - 12)
                } else {
                    ctx.fillStyle = col; ctx.fillText(f.msg, f.x, yy)
                }
                ctx.globalAlpha = 1
            }
            ctx.textAlign = 'left'
        }

        const paintHud = (tick) => {
            ctx.fillStyle = 'rgba(8,12,18,0.72)'; ctx.fillRect(0, 0, VIEW_W, RAIL_Y - 12)
            ctx.font = 'bold 10px monospace'
            ctx.fillStyle = '#8fa8c0'; ctx.fillText('SCORE', 8, 10)
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px monospace'
            ctx.fillText(String(gs.score).padStart(6, '0'), 8, 22)
            // shift + clock
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px monospace'
            ctx.fillText(`SHIFT ${gs.shift + 1}`, VIEW_W / 2, 9)
            const left = 1 - gs.shiftTick / SHIFT_TICKS
            ctx.fillStyle = '#22303e'; ctx.fillRect(VIEW_W / 2 - 60, 12, 120, 4)
            ctx.fillStyle = left < 0.18 ? (tick % 20 < 10 ? '#ff5a4f' : '#7c2f28') : '#5dff8f'
            ctx.fillRect(VIEW_W / 2 - 60, 12, 120 * Math.max(0, left), 4)
            // quota gauge
            const q = SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].quota
            ctx.fillStyle = '#8fa8c0'; ctx.font = 'bold 8px monospace'
            ctx.fillText(`QUOTA ${gs.correct}/${q}`, VIEW_W / 2, 24)
            // fuse box
            ctx.textAlign = 'right'
            ctx.fillStyle = '#8fa8c0'; ctx.font = 'bold 8px monospace'
            ctx.fillText('FUSES', VIEW_W - 8, 9)
            for (let i = 0; i < FUSES; i++) {
                const alive = i >= gs.warnings
                const fx = VIEW_W - 12 - i * 11
                ctx.fillStyle = alive ? (gs.warnings === FUSES - 1 && tick % 24 < 12 ? '#ff9d4f' : '#5dff8f') : '#3a2020'
                circle(ctx, fx, 17, 3.4); ctx.fill()
                ctx.strokeStyle = '#0d131b'; ctx.lineWidth = 1; circle(ctx, fx, 17, 3.4); ctx.stroke()
                if (!alive) { ctx.strokeStyle = '#5c3030'; ctx.beginPath(); ctx.moveTo(fx - 2.4, 15); ctx.lineTo(fx + 2.4, 19); ctx.stroke() }
            }
            // combo
            if (gs.combo >= 2) {
                ctx.textAlign = 'left'
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px monospace'
                ctx.fillText(`×${gs.combo}`, 92, 22)
            }
            ctx.textAlign = 'left'
            void musicZone
        }

        const paintAttract = (tick) => {
            ctx.fillStyle = 'rgba(8,10,16,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            // sign box
            ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(VIEW_W / 2 - 120, 58 + bob, 240, 44)
            ctx.strokeStyle = '#c8a11c'; ctx.lineWidth = 2; ctx.strokeRect(VIEW_W / 2 - 120, 58 + bob, 240, 44)
            ctx.font = 'bold 26px monospace'
            ctx.fillStyle = '#ff8c1a'; ctx.fillText('PICK', VIEW_W / 2 - 34, 90 + bob)
            ctx.fillStyle = '#5dff8f'; ctx.fillText('RUSH', VIEW_W / 2 + 38, 90 + bob)
            ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#8fa8c0'
            ctx.fillText('NIGHT SHIFT SORTING CO. — EST. 19XX', VIEW_W / 2, 116 + bob)
            if (tick % 60 < 40) {
                ctx.font = 'bold 11px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', VIEW_W / 2, 150)
            }
            ctx.font = '9px monospace'; ctx.fillStyle = '#7ec8ff'
            const seats = humanSeat2Ref.current ? '2 HUMANS — ONE BELT' : 'RACE THE FOREMAN (CPU)'
            ctx.fillText(seats + ' — P / C ON THIS SCREEN', VIEW_W / 2, 168)
            const board = (() => { try { return JSON.parse(localStorage.getItem('pickrush.board') || '[]') } catch { return [] } })()
            if (board.length) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 9px monospace'
                ctx.fillText(`BEST SORT: ${board[0].score}`, VIEW_W / 2, 186)
            }
            ctx.textAlign = 'left'
        }

        const paintOver = (tick) => {
            ctx.fillStyle = 'rgba(8,10,16,0.78)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const won = gs.end === 'win'
            ctx.font = 'bold 22px monospace'
            ctx.fillStyle = won ? '#5dff8f' : '#ff5a4f'
            ctx.fillText(won ? 'CONTRACT COMPLETED' : "YOU'RE FIRED", VIEW_W / 2, 92)
            ctx.font = '10px monospace'; ctx.fillStyle = '#8fa8c0'
            ctx.fillText(gs.endReason, VIEW_W / 2, 110)
            ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#ffffff'
            ctx.fillText(`SCORE ${gs.score}`, VIEW_W / 2, 136)
            ctx.font = '9px monospace'; ctx.fillStyle = '#8fa8c0'
            ctx.fillText(`BEST COMBO ×${gs.bestCombo} — SHIFT ${gs.shift + 1} — PIECES ${gs.binFill.reduce((a, b) => a + b, 0)}`, VIEW_W / 2, 152)
            if (gs.players > 1) {
                const s2 = gs.arms[1].score || 0
                ctx.fillStyle = ARM_SKIN[1]
                ctx.fillText(humanSeat2Ref.current
                    ? `LINE CHIEF: ${gs.arms[0].score || 0} — TRAINEE: ${s2}`
                    : `FOREMAN ${gs.arms[1].score || 0}`, VIEW_W / 2, 168)
            }
            if (tick % 60 < 40) {
                ctx.font = 'bold 11px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY TO CLOCK BACK IN', VIEW_W / 2, 196)
            }
            ctx.textAlign = 'left'
        }

        const paint = () => {
            const tick = gs.tick
            const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            if (shake > 0) shake *= 0.84
            if (shake < 0.3) shake = 0
            ctx.save(); ctx.translate(sx, sy)
            paintBack(tick)
            paintFloor()
            paintBelt(tick)
            // items behind the claw? cargo under the belt line draws over bins
            for (const it of gs.items) {
                if (it.carriedBy !== -1) continue
                drawItem(ctx, it.kind, Math.round(it.x), Math.round(it.y), it.rot)
            }
            paintBins(tick)
            paintRail()
            for (let s = 0; s < gs.arms.length; s++) paintArm(s, tick)
            paintFx()
            ctx.restore()
            paintHud(tick)
            if (flash > 0) { ctx.fillStyle = `rgba(255,60,50,${flash / 40})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); flash-- }
            if (screenRef.current === 'attract') paintAttract(tick)
            if (screenRef.current === 'over') paintOver(tick)
            // toast
            if (hudRef.current.toastT > 0) { hudRef.current.toastT--; if (hudRef.current.toastT === 0 && hudRef.current.toast) hudRef.current.toast.textContent = '' }
            setHum(screenRef.current === 'play' || screenRef.current === 'attract', SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed)
            // live HUD text
            if (hudRef.current.seats) hudRef.current.seats.textContent = gs.players > 1 ? (humanSeat2Ref.current ? 'P1 vs P2' : 'P1 vs FOREMAN') : 'SOLO LINE'
            if (hudRef.current.speedTag) hudRef.current.speedTag.textContent = `×${SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed.toFixed(2)}`
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = now
            let dt = now - last
            last = now
            if (dt > 250) dt = 250
            acc += dt
            let n = 0
            while (acc >= SIM_MS && n < 8) {
                acc -= SIM_MS; n++
                if (!pausedRef.current && !contractHoldsLoop()) doSim()
            }
            paint()
        }

        const startPlay = () => {
            gs = makeGame((Math.random() * 2 ** 31) | 0, 2)
            parts.length = 0; gs.fx.length = 0
            setEnd(null)
            setMode('play')
            audioController.playTone(220, 0.08, 'square', 0.06)
            audioController.playTone(330, 0.12, 'square', 0.06, 0.09)
        }

        const onKeyDown = (e) => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
            if (e.code === 'Escape' || e.code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (pausedRef.current) return
            if (screenRef.current === 'attract') {
                if (e.code === 'KeyP') { humanSeat2Ref.current = true; return }
                if (e.code === 'KeyC') { humanSeat2Ref.current = false; return }
                startPlay()
                return
            }
            if (screenRef.current === 'over') {
                if (performance.now() - overAt < 600) return
                setMode('attract')
                gs = makeGame(1337, 2)
                return
            }
            if (e.code === 'ArrowLeft') keys.left = true
            if (e.code === 'ArrowRight') keys.right = true
            if (e.code === 'ArrowDown') keys.down = true
            if (e.code === 'Space' || e.code === 'KeyZ') { if (!e.repeat) edgeA = true }
            if (e.code === 'KeyB') { if (!e.repeat) edgeB = true }
            if (humanSeat2Ref.current) {
                if (e.code === 'KeyA') keys2.left = true
                if (e.code === 'KeyD') keys2.right = true
                if (e.code === 'KeyS') keys2.down = true
                if (e.code === 'KeyF' && !e.repeat) edge2A = true
            }
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (e.code === 'ArrowDown') keys.down = false
            if (e.code === 'KeyA') keys2.left = false
            if (e.code === 'KeyD') keys2.right = false
            if (e.code === 'KeyS') keys2.down = false
        }
        const onPointerDown = () => {
            if (screenRef.current === 'attract') startPlay()
            else if (screenRef.current === 'over' && performance.now() - overAt > 600) { setMode('attract'); gs = makeGame(1337, 2) }
        }

        // ---- contract (QA bots / replays / RL) ----
        const simState = () => ({
            tick: gs.tick,
            score: gs.score,
            done: !!gs.end,
            players: gs.players,
            seed: gs.seed,
            hash: gs.hash,
            shift: gs.shift,
            quota: SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].quota,
            correct: gs.correct,
            combo: gs.combo,
            fusesLeft: FUSES - gs.warnings,
            beltV: Math.round(1.05 * SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed * 1000) / 1000,
            pos: Math.round(gs.arms[0].x * 10) / 10,
            clawY: Math.round(gs.arms[0].tip * 10) / 10,
            carried: gs.arms[0].held !== null ? gs.items.find((i2) => i2.id === gs.arms[0].held)?.kind || 'x' : '',
            arm2Pos: gs.arms[1] ? Math.round(gs.arms[1].x * 10) / 10 : null,
            items: gs.items.map((it) => [it.kind, Math.round(it.x), Math.round(it.y), it.carriedBy, it.onBelt ? 1 : 0]),
            mode: screenRef.current,
            endReason: gs.endReason,
        })
        exposeGame({
            id: 'pick-rush',
            method: 'dpad',
            buttons: ['left', 'right', 'down', 'a', 'b'],
            players: 2,
            reset: (seed, players) => {
                contractSeed = seed >>> 0
                gs = makeGame(contractSeed, players || 1)
                parts.length = 0
                humanSeat2Ref.current = false
                setEnd(null)
                setMode('play')
            },
            tick: (pad, pads) => {
                if (screenRef.current !== 'play') {
                    screenRef.current = 'play'
                    setMode('play')
                }
                step(gs, pads && pads.length ? pads : [pad])
                handleEvents(gs.ev)
                if (gs.end && screenRef.current === 'play') finish()
            },
            state: simState,
            canvas: () => canvas,
            sources: () => [
                { kind: 'human' },
                { kind: humanSeat2Ref.current ? 'human' : 'cpu' },
            ],
        })

        // DEV hook
        if (import.meta.env.DEV) {
            window.__pickrushTest = {
                state: simState,
                hash: () => gs.hash,
                canvas: () => canvas,
                sim: () => gs,
                step: (n = 1, pad = {}) => { for (let i = 0; i < n; i++) step(gs, [pad]) },
                press: (code) => onKeyDown({ code, preventDefault() {}, repeat: false }),
                release: (code) => onKeyUp({ code }),
                CORE, BELT_Y, BIN_TOP, RAIL_Y, FLOOR_Y,
            }
            mountDbg({
                title: 'PICK RUSH',
                getState: () => [
                    `tick ${gs.tick} shift ${gs.shift} | score ${gs.score} quota ${gs.correct}/${SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].quota}`,
                    `arm ${Math.round(gs.arms[0].x)} tip ${Math.round(gs.arms[0].tip)} held ${gs.arms[0].held} combo ×${gs.combo} fuses ${FUSES - gs.warnings}`,
                    `items ${gs.items.length} | ${gs.end || 'running'} ${gs.endReason}`,
                ],
                actions: [
                    { label: 'spawn can', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'can', x: 200, y: BELT_Y - 8, vx: 0, vy: 0, rot: 0, onBelt: true, carriedBy: -1, fragile: false }); return 'can @200' } },
                    { label: 'spawn bottle', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'bottle', x: 200, y: BELT_Y - 9, vx: 0, vy: 0, rot: 0, onBelt: true, carriedBy: -1, fragile: true }); return 'bottle @200' } },
                    { label: 'drop into BIN[1]', run: () => { gs.arms[0].x = 141; return 'arm -> CAN bin' } },
                    { label: 'force win', run: () => { gs.correct = 99; gs.shiftTick = SHIFT_TICKS - 1; gs.shift = SHIFTS.length - 1; return 'quota armed' } },
                    { label: 'reset', run: () => { gs = makeGame(1337, 2); setMode('attract'); return 'rebooted' } },
                ],
            })
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointerDown)
        raf = requestAnimationFrame(loop)

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointerDown)
            if (hum.src) { try { hum.src.stop() } catch { /* already dead */ } }
            unexposeGame()
            unmountDbg()
            canvas.remove()
            delete window.__pickrushTest
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black select-none">
            <div ref={stageRef} className="relative w-full max-w-[900px] aspect-[426/240]" style={{ imageRendering: 'pixelated' }} />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[11px] tracking-widest" ref={setHud('toast')} style={{ color: '#ffd23f', textShadow: '0 1px 0 #000' }} />
            <div className="absolute bottom-1 left-2 font-mono text-[10px] text-cyan-200/60 pointer-events-none">
                <span ref={setHud('seats')}>P1 vs FOREMAN</span> · LINE <span ref={setHud('speedTag')}>×1.00</span>
            </div>
            {screen === 'attract' && (
                <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
                    <AttractMessage messages={PICK_ATTRACT} ms={2600} className="text-amber-200/80" />
                </div>
            )}
            {screen === 'over' && end && (
                <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
                    <p className="font-mono text-[11px] text-white/60">{end.won ? 'Promotion papers filed.' : 'The foreman jots it down. Next shift starts now.'}</p>
                </div>
            )}
            <VirtualControls secondAction={{ label: 'DROP', code: 'KeyB' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'PICK RUSH')} onResume={handleResume} />}
        </div>
    )
}

export default PickRushGame

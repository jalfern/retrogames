// MOMENTUM RUNNER — the arcade shell. Everything is drawn at runtime from the
// pure sim in ./sim.js: a futuristic neon look, rendered at 2x (960×540,
// ctx.scale(2,2)) so glow and lines stay sharp full-screen. The renderer's
// ONLY spatial contract is `screen = world - cam` with no vertical flip (the
// sim already uses screen-style y-down coords), which is exactly the transform
// scripts/runnerplay.mjs samples to prove the drawn hero sits where the
// physics says the body is, after every real keystroke.
//
// Layout: 1. proven script (attract demo = the autopilot's own winning route)
// 2. palette + zone painters 3. fixed-timestep loop 4. input 5. DEV hook
// 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    ZONES, groundY, maybeEnterLoop, makeGame, step, planRun, dronePos,
    FIXED_DT, VIEW_W, VIEW_H, BODY_R, RUN_TOP, VMAX,
} from './sim.js'

const SIM_MS = 1000 / 60
const JUMP_KEYS = ['Space', 'KeyZ', 'ArrowUp']
const HINTS = [
    'HOLD RIGHT — gravity is the engine; flat ground crawls',
    'JUMP the pits — release early to land short, hold to fly far',
    'the vertical loop only sticks if you enter FAST (v² ≥ 5·g·r)',
    'its apex holds the only rings that survive the far spike',
    'springs are the route over the wide pits — never jump them',
    'hit a hazard WITH rings and you stagger — without, you fall back to the beacon',
    'press DOWN while moving to ROLL — a ball keeps speed, loses steering',
    'sprint strips are floor boosts — ride them to carry more speed forward',
    'clear a sector fast and carry rings: the gate counts up both as a bonus',
    'drones guard the line — jump or roll THROUGH them, a grounded touch costs your rings',
]

// The hero's signature colour — deliberately NOT used by track, rings or
// background, so runnerplay's paint-check can prove the body is painted where
// the physics reports it without false positives from scenery.
const HERO = '#66f6ff'
// one original synth bed per sector (AudioController.MUSIC): the tempo IS the
// map — city sprints, the foundry drives, orbit floats.
const RUNNER_BEDS = ['runnerCity', 'runnerForge', 'runnerOrbit']
const PALETTE = [
    // ZONE 1 — NEON MEGACITY (GREEN HILL): night city, sky traffic, green-cyan neon
    { sky0: '#04081a', sky1: '#0c1b38', accent: '#3dffa2', ring: '#8dffd6',
        panel0: '#111c30', panel1: '#090f1e', seam: 'rgba(110,220,255,0.12)',
        spike: '#b8ffe2', window: '#54f2c0', glow: 'rgba(61,255,162,' },
    // ZONE 2 — MOLTEN FOUNDRY (EMBER GAUNTLET): furnaces, sparks, heat
    { sky0: '#160505', sky1: '#401306', accent: '#ff7a2e', ring: '#ffd27d',
        panel0: '#2a1214', panel1: '#16090b', seam: 'rgba(255,160,90,0.12)',
        spike: '#ffd9b0', window: '#ff9a4d', glow: 'rgba(255,122,46,' },
    // ZONE 3 — ORBIT (SKY LOOP): stars, a planet on the horizon, station struts
    { sky0: '#01020a', sky1: '#0b1233', accent: '#5b93ff', ring: '#a9c6ff',
        panel0: '#0e1630', panel1: '#070b1a', seam: 'rgba(130,180,255,0.12)',
        spike: '#cfe0ff', window: '#8fb4ff', glow: 'rgba(91,147,255,' },
]

// deterministic per-frame elements (no flicker, no RNG at draw time)
const srand = (seed) => {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }
const capsule = (ctx, x1, y1, x2, y2, w, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

// one background column set per (zone, layer); generated once, seeded
const bgCache = {}
const bgSet = (zone, layer, count, seed) => {
    const key = `${zone}:${layer}`
    if (bgCache[key]) return bgCache[key]
    const rnd = srand(zone * 7919 + seed)
    const out = []
    for (let i = 0; i < count; i++) out.push({ x: rnd() * 1600, w: 0.3 + rnd() * 0.7, h: 0.25 + rnd() * 0.75, v: rnd() })
    return (bgCache[key] = out)
}

// zone-specific deep parallax: far -> mid -> near, each anchored to a horizon
// that drifts with the camera; animated bits (traffic, sparks, pulses) run off
// the sim tick so the attract demo stays deterministic
const paintBack = (ctx, c, P, tick, zone) => {
    const horizon = (f, base) => base - c.y * f * 0.45
    if (zone === 0) {
        // far: a low moon + a dim distant skyline
        ctx.fillStyle = 'rgba(200,230,255,0.85)'
        circle(ctx, VIEW_W * 0.84 - c.x * 0.05, 44 - c.y * 0.03, 15); ctx.fill()
        ctx.fillStyle = 'rgba(140,180,220,0.25)'
        circle(ctx, VIEW_W * 0.84 - c.x * 0.05 - 5, 40 - c.y * 0.03, 5); ctx.fill()
        ctx.fillStyle = P.sky1
        for (const b of bgSet(zone, 'far', 26, 11)) {
            const sx = b.x - c.x * 0.14; if (sx < -60 || sx > VIEW_W + 60) continue
            const h = 30 + b.h * 90
            ctx.fillRect(sx, horizon(0.14, VIEW_H * 0.8) - h, 14 + b.w * 22, h)
        }
        // mid: neon towers with lit window grids and edge strips
        for (const b of bgSet(zone, 'mid', 14, 23)) {
            const sx = b.x - c.x * 0.3; if (sx < -70 || sx > VIEW_W + 70) continue
            const w = 26 + b.w * 44, h = 60 + b.h * 150
            const top = horizon(0.3, VIEW_H * 0.86) - h
            ctx.fillStyle = P.panel1; ctx.fillRect(sx, top, w, h)
            ctx.fillStyle = P.window; ctx.globalAlpha = 0.55
            for (let wy = top + 8; wy < top + h - 6; wy += 12)
                for (let wx = sx + 5; wx < sx + w - 5; wx += 11)
                    if (((wx * 7 + wy * 13) | 0) % 5 < 2) ctx.fillRect(wx, wy, 4, 5)
            ctx.globalAlpha = 1
            ctx.fillStyle = P.glow + '0.5)'
            ctx.fillRect(sx, top, 2, h)
        }
        // near: dark edges + sky traffic streaming past
        for (const b of bgSet(zone, 'near', 8, 37)) {
            const sx = b.x - c.x * 0.55; if (sx < -90 || sx > VIEW_W + 90) continue
            const h = 90 + b.h * 160
            ctx.fillStyle = P.sky0; ctx.globalAlpha = 0.9
            ctx.fillRect(sx, horizon(0.55, VIEW_H * 0.9) - h, 60 + b.w * 80, h)
            ctx.globalAlpha = 1
        }
        for (let i = 0; i < 5; i++) {
            const vx = ((tick * (0.9 + i * 0.23) + i * 340) % (VIEW_W + 160)) - 80
            const vy = 26 + ((i * 53) % 90) - c.y * 0.5
            ctx.strokeStyle = i % 2 ? 'rgba(141,255,214,0.7)' : 'rgba(255,140,90,0.6)'
            ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.moveTo(vx - 10, vy); ctx.lineTo(vx + 4, vy); ctx.stroke()
        }
    } else if (zone === 1) {
        // far: molten horizon band + smoke pillars
        const hg = ctx.createLinearGradient(0, horizon(0.14, VIEW_H * 0.7), 0, VIEW_H)
        hg.addColorStop(0, 'rgba(255,110,40,0.0)'); hg.addColorStop(1, 'rgba(255,90,30,0.35)')
        ctx.fillStyle = hg; ctx.fillRect(0, horizon(0.14, VIEW_H * 0.7), VIEW_W, VIEW_H)
        ctx.fillStyle = 'rgba(40,14,10,0.9)'
        for (const b of bgSet(zone, 'far', 10, 11)) {
            const sx = b.x - c.x * 0.14; if (sx < -60 || sx > VIEW_W + 60) continue
            const h = 50 + b.h * 110
            ctx.fillRect(sx, horizon(0.14, VIEW_H * 0.82) - h, 10 + b.w * 16, h)
            // slow smoke column
            ctx.globalAlpha = 0.18
            for (let k = 0; k < 4; k++) {
                const my = horizon(0.14, VIEW_H * 0.82) - h - 8 - k * 14 - (tick * 0.3 + k * 5) % 12
                ctx.beginPath(); ctx.arc(sx + 8 + Math.sin(tick * 0.02 + k) * 3, my, 5 + k * 2, 0, Math.PI * 2); ctx.fill()
            }
            ctx.globalAlpha = 1
        }
        // mid: furnace blocks with pulsing molten mouths
        for (const b of bgSet(zone, 'mid', 9, 23)) {
            const sx = b.x - c.x * 0.3; if (sx < -90 || sx > VIEW_W + 90) continue
            const w = 40 + b.w * 60, h = 50 + b.h * 110
            const top = horizon(0.3, VIEW_H * 0.88) - h
            ctx.fillStyle = P.panel1; ctx.fillRect(sx, top, w, h)
            const pulse = 0.55 + 0.45 * Math.sin(tick * 0.05 + b.x)
            ctx.fillStyle = P.glow + (0.35 + 0.4 * pulse) + ')'
            ctx.fillRect(sx + w * 0.2, top + h * 0.55, w * 0.6, h * 0.35)
            ctx.fillStyle = 'rgba(255,220,160,' + (0.5 + 0.4 * pulse) + ')'
            ctx.fillRect(sx + w * 0.35, top + h * 0.68, w * 0.3, h * 0.16)
        }
        // near: girders + rising sparks
        for (const b of bgSet(zone, 'near', 7, 37)) {
            const sx = b.x - c.x * 0.55; if (sx < -100 || sx > VIEW_W + 100) continue
            ctx.fillStyle = P.sky0; ctx.globalAlpha = 0.92
            ctx.fillRect(sx, horizon(0.55, VIEW_H * 0.92) - 120 - b.h * 60, 8 + b.w * 14, 200)
            ctx.globalAlpha = 1
        }
        ctx.fillStyle = '#ffcf8a'
        for (let i = 0; i < 26; i++) {
            const sp = bgSet(zone, 'spark', 26, 53)[i]
            const rise = (tick * (0.5 + sp.v) + sp.x * 7) % 150
            const sx = sp.x - c.x * 0.5 - (rise * 0.3)
            if (sx < -20 || sx > VIEW_W + 20) continue
            const sy = horizon(0.5, VIEW_H * 0.95) - rise
            ctx.globalAlpha = 0.7 * (1 - rise / 150)
            ctx.fillRect(sx, sy, 1.5, 1.5)
        }
        ctx.globalAlpha = 1
    } else {
        // orbit: stars, a planet on the horizon, station struts, debris
        for (const b of bgSet(zone, 'star', 60, 71)) {
            const sx = b.x - c.x * 0.06; if (sx < -10 || sx > VIEW_W + 10) continue
            const sy = b.v * VIEW_H * 0.7 - c.y * 0.04
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(tick * 0.03 + b.x))
            ctx.fillStyle = `rgba(210,225,255,${(0.3 + 0.6 * b.v) * tw})`
            ctx.fillRect(sx, sy, 1.4, 1.4)
        }
        const py = horizon(0.14, VIEW_H * 1.02)
        const pg = ctx.createRadialGradient(VIEW_W * 0.3 - c.x * 0.05, py - 120, 10, VIEW_W * 0.3 - c.x * 0.05, py - 120, 130)
        pg.addColorStop(0, '#28407c'); pg.addColorStop(0.7, '#18254e'); pg.addColorStop(1, '#0a1028')
        ctx.fillStyle = pg
        circle(ctx, VIEW_W * 0.3 - c.x * 0.05, py - 120, 130); ctx.fill()
        ctx.strokeStyle = 'rgba(140,180,255,0.35)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(VIEW_W * 0.3 - c.x * 0.05, py - 120, 132, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
        for (const b of bgSet(zone, 'mid', 7, 23)) {
            const sx = b.x - c.x * 0.3; if (sx < -120 || sx > VIEW_W + 120) continue
            const h = 60 + b.h * 140
            const top = horizon(0.3, VIEW_H * 0.9) - h
            ctx.fillStyle = P.panel1; ctx.fillRect(sx, top, 8 + b.w * 10, h)
            ctx.fillStyle = P.window; ctx.globalAlpha = 0.5
            for (let wy = top + 6; wy < top + h - 4; wy += 14) ctx.fillRect(sx + 1, wy, 3, 4)
            ctx.globalAlpha = 1
            ctx.fillStyle = P.panel1; ctx.fillRect(sx - 26, top + 10 + b.v * 30, 26, 10)
        }
        for (let i = 0; i < 6; i++) {
            const b = bgSet(zone, 'near', 6, 37)[i]
            const sx = b.x - c.x * 0.55; if (sx < -30 || sx > VIEW_W + 30) continue
            const sy = 60 + b.v * 140 - c.y * 0.5 + Math.sin(tick * 0.02 + i) * 6
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(tick * 0.01 + i)
            ctx.fillStyle = 'rgba(30,45,80,0.9)'; ctx.fillRect(-5, -3, 10, 6)
            ctx.strokeStyle = 'rgba(140,180,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-5, -3, 10, 6)
            ctx.restore()
        }
    }
}

let proven = null
const provenScript = () => {
    if (!proven) proven = planRun().script
    return proven
}

// per-zone vertical camera bounds so the loop apex and the spawn stay in frame
const CAM_Y = ZONES.map(z => {
    let top = Infinity, bot = -Infinity
    for (const s of z.segs) { top = Math.min(top, s[1], s[3]); bot = Math.max(bot, s[1], s[3]) }
    for (const L of (z.loops || [])) top = Math.min(top, L.cy - L.r)
    return { min: top - 60, max: Math.max(bot, z.deathY) - VIEW_H + 40 }
})
const CAM_X = ZONES.map(z => ({ min: z.segs[0][0] - 30, max: z.segs[z.segs.length - 1][2] - VIEW_W + 30 }))

const MomentumGame = () => {
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
    const hintRef = useRef(null)
    const board = () => { try { return JSON.parse(localStorage.getItem('runner.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.runnerStage = '1'
        canvas.width = VIEW_W * 2; canvas.height = VIEW_H * 2   // 2x: neon stays crisp full-screen
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.scale(2, 2)                                          // draw in the 480×270 sim space

        // cheap bloom: bright sources on a half-size plate, downscaled (blur),
        // composited back with 'lighter' — the neon halo
        const glowC = document.createElement('canvas'); glowC.width = VIEW_W; glowC.height = VIEW_H
        const gctx = glowC.getContext('2d')
        const smallC = document.createElement('canvas'); smallC.width = VIEW_W / 4; smallC.height = VIEW_H / 4
        const sctx = smallC.getContext('2d')
        sctx.imageSmoothingEnabled = true

        let gs = makeGame()
        let demoAt = 0, raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = '', shake = 0, wheelAng = 0
        let tallyAnim = null   // the goal count-up: { time, rings, t }
        let musicOn = false, musicZone = -1
        let contractSeed = 0
        let cprev = {}
        const keys = { left: false, right: false }
        let jumpEdge = false, jumpCut = false
        const dbg = { kp: 0 }
        const evLog = []
        const hist = []
        const parts = []
        const trail = []

        const cam = () => {
            const cx = CAM_X[gs.zone], cy = CAM_Y[gs.zone]
            const p = gs.p
            const lead = Math.min(30, ((Math.abs(p.s || p.vx || 0) / VMAX)) * 34)
            return {
                x: Math.max(cx.min, Math.min(cx.max, Math.round(p.x + lead - VIEW_W * 0.34))),
                y: Math.max(cy.min, Math.min(cy.max, Math.round(p.y - VIEW_H * 0.62))),
            }
        }
        const say = (m) => { toastMsg = m; toast = 90 }

        // the speed whoosh: ONE looping band-passed noise source whose gain and
        // centre frequency track velocity past the flat-run cap — the engine
        // note that tells you the slope is doing your work. Lazily built after
        // the AudioContext has been unlocked by the first real gesture.
        const whoosh = { src: null, gain: null, filter: null }
        const ensureWhoosh = () => {
            if (whoosh.src || !audioController.ctx || audioController.muted) return
            const actx = audioController.ctx, sr = actx.sampleRate
            const buf = actx.createBuffer(1, sr, sr)
            const d = buf.getChannelData(0)
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
            const src = actx.createBufferSource(); src.buffer = buf; src.loop = true
            const filter = actx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 300; filter.Q.value = 0.7
            const gain = actx.createGain(); gain.gain.value = 0
            src.connect(filter); filter.connect(gain); gain.connect(actx.destination)
            src.start()
            whoosh.src = src; whoosh.gain = gain; whoosh.filter = filter
        }
        const setWhoosh = (k) => {
            if (!whoosh.gain) return
            const a = audioController.muted ? 0 : Math.max(0, Math.min(1, k))
            const t = audioController.ctx.currentTime
            whoosh.gain.gain.setTargetAtTime(a * 0.12, t, 0.08)
            whoosh.filter.frequency.setTargetAtTime(250 + a * 2600, t, 0.08)
        }

        const burst = (x, y, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'ring') { audioController.playTone(1046 + Math.random() * 120, 0.06, 'square', 0.05); burst(e.x, gs.p.y - BODY_R, 3, '#ffd23f') }
                else if (e.type === 'jump') audioController.playSweep(360, 620, 0.12, 'square', 0.05)
                else if (e.type === 'land') { audioController.playNoise(0.06, 0.04); burst(gs.p.x, gs.p.y, 4, '#cfe0b0') }
                else if (e.type === 'spring') { audioController.playSweep(300, 1100, 0.24, 'sawtooth', 0.08); burst(e.x, gs.p.y, 8, '#ff9f43') }
                else if (e.type === 'loop') { audioController.playSweep(400, 1400, 0.5, 'square', 0.08); say('LOOP! +500') }
                else if (e.type === 'hit') { audioController.playNoise(0.16, 0.09); audioController.playSweep(240, 90, 0.2, 'sawtooth', 0.07); shake = 8; burst(gs.p.x, gs.p.y - BODY_R, 10, '#ff5a5a') }
                else if (e.type === 'drone') { audioController.playNoise(0.12, 0.08); audioController.playSweep(900, 200, 0.18, 'square', 0.06); burst(e.x, e.y, 12, '#7df9ff'); say('DRONE DOWN +200') }
                else if (e.type === 'crash') { audioController.playNoise(0.2, 0.1); shake = 10; say('TOO SLOW!') }
                else if (e.type === 'save') { audioController.playTone(880, 0.12, 'sine', 0.06); audioController.playTone(1320, 0.18, 'sine', 0.05); say('CHECKPOINT') }
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'respawn') { audioController.playSweep(220, 700, 0.4, 'triangle', 0.07); audioController.startMusic(RUNNER_BEDS[gs.zone]); say('BACK TO CHECKPOINT') }
                else if (e.type === 'tally') { tallyAnim = { time: e.time, rings: e.rings, t: 0 }; say(`SECTOR CLEAR +${e.time + e.rings}`); burst(gs.p.x, gs.p.y - BODY_R, 12, '#ffd23f') }
                else if (e.type === 'goal') { audioController.playSweep(660, 1760, 0.5, 'square', 0.09) }
            }
        }

        const finish = () => {
            const sc = gs.score
            audioController.playFanfare()
            setEnd({ score: sc, deaths: gs.deaths })
            if (sc > 0) localStorage.setItem('runner.board', JSON.stringify([...board(), { score: sc, deaths: gs.deaths, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                const script = provenScript()
                if (demoAt >= script.length) {
                    if (demoAt >= script.length + 130) { gs = makeGame(); demoAt = 0; evLog.length = 0 }
                    demoAt++
                    if (!gs.end) { step(gs, {}); maybeEnterLoop(gs) }
                    return
                }
                const inp = script[demoAt++]
                step(gs, inp); maybeEnterLoop(gs)
                handleEvents(gs.ev)
                if (gs.end === 'win') { demoAt = script.length; gs = makeGame() }
                return
            }
            if (sc !== 'play') return
            const before = gs.ev.length
            step(gs, { right: keys.right, left: keys.left, jumpEdge, jumpCut })
            maybeEnterLoop(gs)
            handleEvents(gs.ev.slice(before))
            jumpEdge = false; jumpCut = false
            hist.push([gs.tick, Math.round(gs.p.x), Math.round(gs.p.y), gs.p.mode, Math.round(gs.p.s), gs.rings, gs.deaths, gs.end ? 1 : 0])
            if (hist.length > 160) hist.shift()
            if (gs.end === 'win') finish()
        }

        // ---------------- painter ----------------
        let zoneCard = 0
        let lastZoneSeen = gs.zone
        const ZONE_TAG = ['SECTOR 01 // NEON MEGACITY', 'SECTOR 02 // MOLTEN FOUNDRY', 'SECTOR 03 // ORBITAL RING']
        const HERO_DARK = '#0c2733', HERO_EDGE = 'rgba(102,246,255,0.4)'

        const drawHero = (px, py) => {
            const p = gs.p
            ctx.save()
            ctx.translate(px, py)
            // tilts with the slope, rotates with the loop, noses with the air
            let rot
            if (p.mode === 'loop') rot = -p.phi
            else if (p.mode === 'air') rot = Math.max(-0.5, Math.min(0.5, p.vy * 0.0005))
            else rot = p.lastTheta || 0
            ctx.rotate(rot)
            if (p.invuln > 0 && gs.tick % 6 < 3) { ctx.restore(); return }
            const ph = wheelAng
            // local under-glow: keeps the neon halo but leaves the core's colour
            // exact, so the paint-check can prove the body is really here
            const hg = ctx.createRadialGradient(0, 0, 2, 0, 0, 16)
            hg.addColorStop(0, 'rgba(102,246,255,0.38)')
            hg.addColorStop(1, 'rgba(102,246,255,0)')
            ctx.fillStyle = hg; circle(ctx, 0, 0, 16); ctx.fill()
            if (p.mode === 'air' || p.rolling) {
                // curled into a glowing ball
                ctx.fillStyle = HERO_DARK; circle(ctx, 0, 0, BODY_R); ctx.fill()
                ctx.strokeStyle = HERO_EDGE; ctx.lineWidth = 1.5; circle(ctx, 0, 0, BODY_R); ctx.stroke()
                ctx.strokeStyle = HERO; ctx.lineWidth = 2
                for (let i = 0; i < 3; i++) {
                    const a = ph * 1.6 + i * (Math.PI * 2 / 3)
                    ctx.beginPath(); ctx.arc(0, 0, 6.5, a, a + 1.2); ctx.stroke()
                }
                ctx.fillStyle = HERO
                ctx.beginPath(); ctx.ellipse(2.6, -1.6, 3.2, 2, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#eaffff'; circle(ctx, 0, 0, 2.4); ctx.fill()
            } else {
                const spd = Math.abs(p.s || 0)
                const lean = 0.26 + (spd > RUN_TOP ? 0.24 : 0)   // full-sprint lean
                ctx.rotate(lean)
                const swA = Math.sin(ph), swB = Math.sin(ph + Math.PI)
                const liftA = Math.max(0, Math.cos(ph)) * 3, liftB = Math.max(0, Math.cos(ph + Math.PI)) * 3
                const hipX = -0.5, hipY = 4
                const leg = (fx, fy, col, shoe) => {
                    const kx = (hipX + fx) / 2 + 1.6, ky = (hipY + fy) / 2 - 0.5
                    capsule(ctx, hipX, hipY, kx, ky, 2.6, col)
                    capsule(ctx, kx, ky, fx, fy, 2.2, col)
                    capsule(ctx, fx, fy, fx + 2.2, fy, 1.8, shoe)
                }
                leg(hipX + swB * 5.2, 9 - liftB, '#081c26', 'rgba(102,246,255,0.55)')   // back leg
                capsule(ctx, hipX, hipY, 1.5, -5, 4.6, HERO_DARK)                        // torso
                capsule(ctx, hipX - 1, hipY - 0.5, 0.5, -4.5, 1.2, HERO_EDGE)
                leg(hipX + swA * 5.2, 9 - liftA, HERO_DARK, HERO)                        // front leg
                capsule(ctx, 1, -4.5, 1 + swB * 3.6, -2.2, 2, '#081c26')                 // arms
                capsule(ctx, 1, -4.5, 1 + swA * 3.6, -2.2, 2, HERO_DARK)
                ctx.fillStyle = HERO_DARK; circle(ctx, 3.4, -7.6, 2.8); ctx.fill()       // head
                ctx.strokeStyle = HERO_EDGE; ctx.lineWidth = 1; circle(ctx, 3.4, -7.6, 2.8); ctx.stroke()
                ctx.fillStyle = HERO                                                        // visor
                ctx.beginPath(); ctx.ellipse(4.3, -7.6, 1.9, 1.3, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#eaffff'; circle(ctx, 4.8, -7.9, 0.5); ctx.fill()
                ctx.fillStyle = HERO; circle(ctx, 0.8, -0.5, 3.2); ctx.fill()             // chest core
                ctx.fillStyle = '#eaffff'; circle(ctx, 0.8, -0.5, 1.2); ctx.fill()
                if (spd > RUN_TOP) {                                                       // sprint thruster
                    const fl = 5 + Math.sin(gs.tick * 0.6) * 2 + Math.min(4, (spd - RUN_TOP) * 0.01)
                    ctx.fillStyle = 'rgba(255,150,70,0.75)'
                    ctx.beginPath(); ctx.moveTo(-3.4, -2.4); ctx.lineTo(-3.4 - fl, -0.5); ctx.lineTo(-3.4, 1.4); ctx.closePath(); ctx.fill()
                    ctx.fillStyle = 'rgba(255,235,200,0.9)'
                    ctx.beginPath(); ctx.moveTo(-3.4, -1.4); ctx.lineTo(-3.4 - fl * 0.55, -0.5); ctx.lineTo(-3.4, 0.6); ctx.closePath(); ctx.fill()
                }
            }
            ctx.restore()
        }

        const paint = () => {
            const c = cam()
            const P = PALETTE[gs.zone]
            const z = ZONES[gs.zone]
            const p = gs.p
            const tick = gs.tick
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            if (shake > 0) shake *= 0.85
            const dx0 = c.x + sx, dy0 = c.y + sy

            const g = ctx.createLinearGradient(0, 0, 0, VIEW_H)
            g.addColorStop(0, P.sky0); g.addColorStop(1, P.sky1)
            ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            paintBack(ctx, c, P, tick, gs.zone)

            // ---- track as tech: metal panels, seams, glowing edge strip ----
            const bot = z.deathY - dy0
            for (const s of z.segs) {
                const [x1, y1, x2, y2] = s
                const px1 = x1 - dx0, px2 = x2 - dx0, py1 = y1 - dy0, py2 = y2 - dy0
                if (px2 < -30 || px1 > VIEW_W + 30) continue
                const botCl = Math.min(VIEW_H + 40, bot)
                ctx.beginPath()
                ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.lineTo(px2, botCl); ctx.lineTo(px1, botCl); ctx.closePath()
                const panel = ctx.createLinearGradient(0, Math.min(py1, py2), 0, botCl)
                panel.addColorStop(0, P.panel0); panel.addColorStop(1, P.panel1)
                ctx.fillStyle = panel; ctx.fill()
                const yAt = (wx) => y1 + (wx - x1) * (y2 - y1) / (x2 - x1)
                ctx.strokeStyle = P.seam; ctx.lineWidth = 1
                for (let wx = Math.ceil(x1 / 28) * 28; wx < x2; wx += 28) {
                    const wxs = wx - dx0, wys = yAt(wx) - dy0
                    ctx.beginPath(); ctx.moveTo(wxs, wys + 2); ctx.lineTo(wxs, Math.min(botCl, wys + 26)); ctx.stroke()
                    ctx.fillStyle = 'rgba(255,255,255,0.10)'
                    ctx.fillRect(wxs - 0.5, wys + 4, 1.5, 1.5)
                }
                ctx.strokeStyle = P.glow + '0.28)'; ctx.lineWidth = 5
                ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke()
                ctx.strokeStyle = P.accent; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke()
                ctx.strokeStyle = P.glow + '0.14)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(px1, py1 + 9); ctx.lineTo(px2, py2 + 9); ctx.stroke()
            }

            // ---- the loops: a glowing tube each, with energy pulses ----
            const loops = z.loops || []
            let frontLoop = null
            let loopFrontArc = null
            for (const L of loops) {
                const lx = L.cx - dx0, ly = L.cy - dy0
                ctx.strokeStyle = P.panel0; ctx.lineWidth = 13
                circle(ctx, lx, ly, L.r); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 9
                circle(ctx, lx, ly, L.r); ctx.stroke()
                ctx.strokeStyle = P.glow + '0.35)'; ctx.lineWidth = 4
                circle(ctx, lx, ly, L.r); ctx.stroke()
                ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6
                circle(ctx, lx, ly, L.r + 6.5); ctx.stroke()
                circle(ctx, lx, ly, L.r - 6.5); ctx.stroke()
                const rot = tick * 0.06
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2
                for (let i = 0; i < 6; i++) {
                    const a = rot + i * Math.PI / 3
                    ctx.beginPath(); ctx.arc(lx, ly, L.r, a, a + 0.35); ctx.stroke()
                }
            }
            if (p.mode === 'loop') { frontLoop = loops[gs.activeLoopIdx] || null; loopFrontArc = Math.PI / 2 - p.phi }

            // ---- spikes: pulsing energy barbs ----
            for (const sp of z.spikes) {
                for (let x = sp[0]; x <= sp[1]; x += 12) {
                    const gy = groundY(z, x); if (gy === null) continue
                    const px = x - dx0, py = gy - dy0
                    if (px < -20 || px > VIEW_W + 20) continue
                    const pulse = 0.7 + 0.3 * Math.sin(tick * 0.15 + x * 0.7)
                    ctx.fillStyle = P.spike
                    ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px, py - 14 * pulse); ctx.lineTo(px + 5, py); ctx.closePath(); ctx.fill()
                    ctx.fillStyle = P.glow + (0.5 * pulse).toFixed(3) + ')'
                    ctx.fillRect(px - 5, py - 1.5, 10, 1.5)
                }
            }

            // ---- checkpoint: holo-beacon ----
            if (z.ck > 0) {
                const gy = groundY(z, z.ck)
                if (gy !== null) {
                    const px = z.ck - dx0, py = gy - dy0
                    const on = gs.save.zone === gs.zone && gs.save.x === z.ck
                    ctx.fillStyle = P.panel0
                    ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py); ctx.lineTo(px + 4, py - 8); ctx.lineTo(px - 4, py - 8); ctx.closePath(); ctx.fill()
                    ctx.strokeStyle = on ? P.accent : 'rgba(120,130,160,0.8)'; ctx.lineWidth = 1.5; ctx.stroke()
                    const hgt = on ? 46 : 30
                    const bg2 = ctx.createLinearGradient(0, py - hgt, 0, py)
                    bg2.addColorStop(0, 'rgba(255,255,255,0)')
                    bg2.addColorStop(1, on ? P.glow + '0.55)' : 'rgba(120,130,160,0.25)')
                    ctx.fillStyle = bg2; ctx.fillRect(px - 3, py - hgt, 6, hgt)
                    for (let k = 0; k < 3; k++) {
                        const ry = py - 12 - ((tick * 0.4 + k * 14) % 40)
                        ctx.strokeStyle = on ? P.glow + '0.5)' : 'rgba(120,130,160,0.3)'
                        ctx.lineWidth = 1.5
                        ctx.beginPath(); ctx.ellipse(px, ry, 5 + k, 1.8, 0, 0, Math.PI * 2); ctx.stroke()
                    }
                }
            }

            // ---- goal: warp gate ----
            {
                const gy = groundY(z, z.goal)
                if (gy !== null) {
                    const px = z.goal - dx0, py = gy - dy0
                    ctx.strokeStyle = P.panel0; ctx.lineWidth = 6
                    ctx.beginPath(); ctx.ellipse(px + 10, py - 34, 20, 34, 0, 0, Math.PI * 2); ctx.stroke()
                    ctx.strokeStyle = P.accent; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.ellipse(px + 10, py - 34, 23, 37, 0, 0, Math.PI * 2); ctx.stroke()
                    const gg = ctx.createRadialGradient(px + 10, py - 34, 2, px + 10, py - 34, 22)
                    gg.addColorStop(0, '#eaffff'); gg.addColorStop(0.4, P.ring); gg.addColorStop(1, P.sky0)
                    ctx.fillStyle = gg
                    ctx.beginPath(); ctx.ellipse(px + 10, py - 34, 17, 31, 0, 0, Math.PI * 2); ctx.fill()
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1
                    for (let k = 0; k < 3; k++) {
                        const a0 = tick * 0.08 + k * 2.1
                        ctx.beginPath(); ctx.ellipse(px + 10, py - 34, 10 + k * 4, 20 + k * 5, 0, a0, a0 + 2.2); ctx.stroke()
                    }
                }
            }

            // ---- springs: jump pads that charge and flash ----
            for (const sp of z.springs) {
                const px = sp[0] - dx0, py = sp[1] - dy0
                if (px < -30 || px > VIEW_W + 30) continue
                const fired = tick - (gs.spent.get(sp) || -99)
                const flash = fired >= 0 && fired < 18
                ctx.fillStyle = P.panel0; ctx.fillRect(px - 11, py - 5, 22, 5)
                ctx.strokeStyle = flash ? '#ffffff' : P.accent; ctx.lineWidth = 1.5
                ctx.strokeRect(px - 11, py - 5, 22, 5)
                const lift = flash ? -6 : 0
                ctx.strokeStyle = flash ? '#ffffff' : P.accent; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(px - 7, py - 8 + lift); ctx.lineTo(px, py - 14 + lift); ctx.lineTo(px + 7, py - 8 + lift); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(px - 5, py - 12 + lift); ctx.lineTo(px, py - 17 + lift); ctx.lineTo(px + 5, py - 12 + lift); ctx.stroke()
            }

            // ---- boost pads: sprint strips that add speed along the slope ----
            for (const b of z.boosts) {
                const [bx1, bx2] = b
                const px1 = bx1 - dx0, px2 = bx2 - dx0
                if (px2 < -30 || px1 > VIEW_W + 30) continue
                const gy1 = groundY(z, bx1), gy2 = groundY(z, bx2)
                if (gy1 === null || gy2 === null) continue
                const py1 = gy1 - dy0, py2 = gy2 - dy0
                const span = bx2 - bx1
                ctx.fillStyle = P.glow + '0.16)'
                ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.lineTo(px2, py2 + 6); ctx.lineTo(px1, py1 + 6); ctx.closePath(); ctx.fill()
                ctx.strokeStyle = P.accent; ctx.lineWidth = 2
                for (let i = 0; i < 3; i++) {
                    const wx = bx1 + ((tick * 4 + i * (span / 3)) % span)
                    const wy = groundY(z, wx); if (wy === null) continue
                    const ax = wx - dx0, ay = wy - dy0
                    ctx.beginPath(); ctx.moveTo(ax - 5, ay - 5); ctx.lineTo(ax + 3, ay); ctx.lineTo(ax - 5, ay + 5); ctx.stroke()
                }
                ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke()
            }

            // ---- rings: spinning holo-rings that sparkle ----
            for (let i = 0; i < z.rings.length; i++) {
                if (gs.taken.has(i + gs.zone * 100)) continue
                const [rx, ry] = z.rings[i]
                const px = rx - dx0, py = ry - dy0 + Math.sin(tick / 12 + i) * 2
                if (px < -20 || px > VIEW_W + 20) continue
                const wob = Math.abs(Math.cos(tick / 9 + i))
                ctx.strokeStyle = P.ring; ctx.lineWidth = 3
                ctx.beginPath(); ctx.ellipse(px, py, 9 * wob + 1, 9, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.ellipse(px, py, 5 * wob, 5.5, 0, 0, Math.PI * 2); ctx.stroke()
                const sp2 = Math.sin(tick * 0.11 + i * 1.7)
                if (sp2 > 0.93) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1
                    const rr = 6 * (sp2 - 0.93) / 0.07
                    ctx.beginPath(); ctx.moveTo(px - rr, py); ctx.lineTo(px + rr, py); ctx.moveTo(px, py - rr); ctx.lineTo(px, py + rr); ctx.stroke()
                }
            }

            // ---- scatter: shed rings that fade back over ~3s ----
            for (const r of gs.scatter) {
                const px = r.x - dx0, py = r.y - dy0
                if (px < -20 || px > VIEW_W + 20) continue
                const life = Math.max(0, (r.until - tick) / 180)
                const blink = life < 0.35 ? (Math.sin(tick * 0.5) > 0 ? 1 : 0.25) : 1
                ctx.globalAlpha = 0.35 + 0.65 * life * blink
                ctx.strokeStyle = P.ring; ctx.lineWidth = 2.5
                ctx.beginPath(); ctx.ellipse(px, py, 8, 8, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.globalAlpha = 1
            }

            // ---- drones: ground patrols + hovers, rotors spin, body glows ----
            for (let i = 0; i < (z.drones || []).length; i++) {
                if (gs.droneDown.has(gs.zone * 100 + i)) continue
                const d = dronePos(gs, i)
                const px = d.x - dx0, py = d.y - dy0
                if (px < -20 || px > VIEW_W + 20) continue
                const rot = tick * 0.6
                ctx.fillStyle = P.panel0
                ctx.beginPath(); ctx.ellipse(px, py, 9, 6, 0, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = P.spike; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.ellipse(px, py, 9, 6, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.fillStyle = P.glow + '0.9)'
                ctx.beginPath(); ctx.arc(px, py - 1, 2.2, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.moveTo(px - 10 * Math.cos(rot), py - 8 - 2 * Math.sin(rot)); ctx.lineTo(px + 10 * Math.cos(rot), py - 8 + 2 * Math.sin(rot)); ctx.stroke()
            }

            // ---- afterimages, then the hero ----
            const spdNow = p.mode === 'air' ? Math.hypot(p.vx, p.vy) : Math.abs(p.s || 0)
            ensureWhoosh()
            setWhoosh(screenRef.current === 'play' && spdNow > RUN_TOP
                ? (spdNow - RUN_TOP) / (VMAX - RUN_TOP) : 0)
            const hpx = Math.round(p.x - dx0), hpy = Math.round(p.y - BODY_R - dy0)
            if (spdNow > RUN_TOP * 0.8 && p.mode === 'track') {
                trail.push({ x: hpx, y: hpy })
                if (trail.length > 6) trail.shift()
            } else if (trail.length) trail.shift()
            for (let i = 0; i < trail.length; i++) {
                ctx.globalAlpha = 0.05 + i * 0.02
                ctx.fillStyle = HERO
                circle(ctx, trail[i].x, trail[i].y, BODY_R * 0.8); ctx.fill()
            }
            ctx.globalAlpha = 1
            drawHero(hpx, hpy)

            // the active loop's near half goes OVER the hero — you go through it
            if (frontLoop && loopFrontArc !== null) {
                const lx = frontLoop.cx - dx0, ly = frontLoop.cy - dy0
                ctx.strokeStyle = P.glow + '0.85)'; ctx.lineWidth = 6
                ctx.beginPath(); ctx.arc(lx, ly, frontLoop.r, loopFrontArc - Math.PI / 2, loopFrontArc + Math.PI / 2); ctx.stroke()
                ctx.strokeStyle = P.accent; ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(lx, ly, frontLoop.r + 6.5, loopFrontArc - Math.PI / 2, loopFrontArc + Math.PI / 2); ctx.stroke()
                ctx.beginPath(); ctx.arc(lx, ly, frontLoop.r - 6.5, loopFrontArc - Math.PI / 2, loopFrontArc + Math.PI / 2); ctx.stroke()
            }

            // particles
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.15
                if (pa.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 26; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x - dx0, pa.y - dy0, 2, 2)
            }
            ctx.globalAlpha = 1

            // screen-wide speed lines near top speed
            if (spdNow > RUN_TOP) {
                const k = Math.min(1, (spdNow - RUN_TOP) / (VMAX - RUN_TOP))
                ctx.strokeStyle = `rgba(220,240,255,${(0.06 + 0.22 * k).toFixed(3)})`
                ctx.lineWidth = 1.5
                for (let i = 0; i < 9; i++) {
                    const yy = (i * 61 + 23) % VIEW_H
                    const len = 26 + k * 60 + (i % 3) * 14
                    const xx = VIEW_W - ((tick * (spdNow * 0.02) + i * 173) % (VIEW_W + len))
                    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + len, yy); ctx.stroke()
                }
            }

            // ---- bloom: bright sources -> downscale blur -> additive composite ----
            gctx.clearRect(0, 0, VIEW_W, VIEW_H)
            gctx.globalCompositeOperation = 'lighter'
            gctx.strokeStyle = P.accent; gctx.lineWidth = 2.5
            for (const s of z.segs) {
                const [x1, y1, x2, y2] = s
                const px1 = x1 - dx0, px2 = x2 - dx0, py1 = y1 - dy0, py2 = y2 - dy0
                if (px2 < -30 || px1 > VIEW_W + 30) continue
                gctx.beginPath(); gctx.moveTo(px1, py1); gctx.lineTo(px2, py2); gctx.stroke()
            }
            gctx.strokeStyle = P.ring; gctx.lineWidth = 3
            for (let i = 0; i < z.rings.length; i++) {
                if (gs.taken.has(i + gs.zone * 100)) continue
                const [rx, ry] = z.rings[i]
                const px = rx - dx0, py = ry - dy0 + Math.sin(tick / 12 + i) * 2
                if (px < -20 || px > VIEW_W + 20) continue
                gctx.beginPath(); gctx.ellipse(px, py, 9, 9, 0, 0, Math.PI * 2); gctx.stroke()
            }
            for (const L of (z.loops || [])) {
                gctx.strokeStyle = P.accent; gctx.lineWidth = 4
                gctx.beginPath(); gctx.arc(L.cx - dx0, L.cy - dy0, L.r, 0, Math.PI * 2); gctx.stroke()
            }
            gctx.fillStyle = P.spike
            for (const sp of z.spikes) {
                for (let x = sp[0]; x <= sp[1]; x += 12) {
                    const px = x - dx0; if (px < -20 || px > VIEW_W + 20) continue
                    const gy = groundY(z, x); if (gy === null) continue
                    gctx.fillRect(px - 4, gy - dy0 - 12, 8, 10)
                }
            }
            if (z.ck > 0 && gs.save.zone === gs.zone && gs.save.x === z.ck) {
                gctx.fillStyle = P.accent
                const gy = groundY(z, z.ck)
                if (gy !== null) gctx.fillRect(z.ck - 3 - dx0, gy - 40 - dy0, 6, 38)
            }
            gctx.fillStyle = P.ring
            {
                const gy = groundY(z, z.goal)
                if (gy !== null) { gctx.beginPath(); gctx.ellipse(z.goal + 10 - dx0, gy - 34 - dy0, 17, 31, 0, 0, Math.PI * 2); gctx.fill() }
            }
            gctx.globalCompositeOperation = 'source-over'
            sctx.clearRect(0, 0, smallC.width, smallC.height)
            sctx.drawImage(glowC, 0, 0, smallC.width, smallC.height)
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ctx.globalAlpha = 0.85
            ctx.drawImage(smallC, 0, 0, VIEW_W, VIEW_H)
            ctx.globalAlpha = 0.4
            ctx.drawImage(glowC, 0, 0, VIEW_W, VIEW_H)
            ctx.restore()

            // zone title card
            if (gs.zone !== lastZoneSeen) { lastZoneSeen = gs.zone; zoneCard = 120 }
            if (zoneCard > 0) {
                zoneCard--
                const a = zoneCard > 100 ? (120 - zoneCard) / 20 : zoneCard < 30 ? zoneCard / 30 : 1
                ctx.save()
                ctx.globalAlpha = Math.max(0, Math.min(1, a))
                ctx.textAlign = 'center'
                ctx.fillStyle = 'rgba(255,255,255,0.92)'
                ctx.font = '700 17px monospace'
                ctx.fillText(ZONE_TAG[gs.zone], VIEW_W / 2, 72)
                ctx.fillStyle = P.accent
                ctx.fillRect(VIEW_W / 2 - 70, 82, 140, 2)
                ctx.restore()
            }

            // goal tally: a count-up of the time + ring bonus
            if (tallyAnim) {
                tallyAnim.t++
                const k = Math.min(1, tallyAnim.t / 28)
                const dt = Math.round(tallyAnim.time * k)
                const dr = Math.round(tallyAnim.rings * k)
                ctx.save()
                ctx.textAlign = 'center'
                ctx.font = '700 15px monospace'
                ctx.fillStyle = 'rgba(255,255,255,0.95)'
                ctx.fillText(`TIME   +${dt}`, VIEW_W / 2, 104)
                ctx.fillStyle = P.accent
                ctx.fillText(`RINGS  +${dr}`, VIEW_W / 2, 122)
                ctx.restore()
                if (tallyAnim.t > 55) tallyAnim = null
            }

            if (shake < 0.4) shake = 0
            wheelAng += (spdNow * FIXED_DT) / BODY_R
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const p = gs.p
            const spd = Math.min(1, Math.abs(p.s) / VMAX)
            if (hud.rings) hud.rings.textContent = String(gs.rings).padStart(2, '0')
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.zone) hud.zone.textContent = ZONES[gs.zone].name
            if (hud.meter) hud.meter.style.width = `${(spd * 100).toFixed(0)}%`
            if (hud.meter) hud.meter.style.background = spd > 0.62 ? '#ff5a5a' : spd > 0.32 ? '#ffb14d' : '#5aff9a'
            if (hud.toast) { hud.toast.textContent = toastMsg; hud.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)   // world-second catch-up cap (heist lesson)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft
                    while (acc >= SIM_MS) { doSim(); acc -= SIM_MS }
                }
            }
            // bed lifecycle: plays only during a live run (attract has no
            // gesture yet, so it stays silent); switches with the sector.
            const wantMusic = screenRef.current === 'play' && !pausedRef.current && !gs.end
            if (wantMusic !== musicOn) {
                musicOn = wantMusic
                if (wantMusic) { musicZone = gs.zone; audioController.startMusic(RUNNER_BEDS[gs.zone]) }
                else audioController.stopMusic()
            } else if (musicOn && gs.zone !== musicZone) {
                musicZone = gs.zone
                audioController.startMusic(RUNNER_BEDS[gs.zone])
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame()
            evLog.length = 0; parts.length = 0; trail.length = 0
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        const onDown = (e) => {
            dbg.kp++
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.left = true
            if (e.code === 'ArrowRight') keys.right = true
            if (JUMP_KEYS.includes(e.code)) jumpEdge = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (JUMP_KEYS.includes(e.code) && gs.p.mode === 'air') jumpCut = true
        }
        const onBlur = () => { keys.left = keys.right = false }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') startPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / VIEW_W, r.height / VIEW_H)
            canvas.style.width = `${VIEW_W * sc}px`
            canvas.style.height = `${VIEW_H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // attract: one message at a time, cycled over the demo
        let hintIdx = 0
        const hintTimer = setInterval(() => {
            if (screenRef.current === 'attract' && hintRef.current) {
                hintIdx = (hintIdx + 1) % HINTS.length
                hintRef.current.textContent = HINTS[hintIdx]
            }
        }, 2600)

        if (import.meta.env.DEV) {
            window.__runnerTest = {
                probe: () => {
                    const p = gs.p, c = cam()
                    return {
                        screen: screenRef.current, tick: gs.tick, zone: gs.zone, zoneName: ZONES[gs.zone].name,
                        x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, mode: p.mode,
                        rolling: !!p.rolling,
                        vx: Math.round(p.vx || 0), vy: Math.round(p.vy || 0), s: Math.round(p.s || 0),
                        cam: c,
                        // THE screen pixel the hero is painted at (screen = world - cam)
                        at: { x: Math.round(p.x - c.x), y: Math.round(p.y - BODY_R - c.y) },
                        rings: gs.rings, score: gs.score, deaths: gs.deaths,
                        loopTaken: gs.loopTaken, phi: Math.round(p.phi * 100) / 100,
                        cut: !!p.cut,
                        save: { ...gs.save }, goal: ZONES[gs.zone].goal, end: gs.end,
                        invuln: p.invuln, speed: Math.round(Math.abs(p.s || 0)),
                        music: audioController._musicState(),
                        taken: [...gs.taken], evLog: evLog.slice(-80),
                        hist: hist.slice(-60), dbg: { ...dbg },
                    }
                },
                evLog, cam: () => cam(),
                start: startPlay,
                board: () => board(),
                // DEV rig: move the body (SETUP ONLY — physics, spikes, death,
                // the loop all still come from the real step() loop).
                teleport: (x) => {
                    if (screenRef.current !== 'play' || gs.end) return false
                    const z = ZONES[gs.zone], gy = groundY(z, x)
                    if (gy === null) return false
                    gs.p.x = x; gs.p.y = gy; gs.p.s = 0; gs.p.vx = 0; gs.p.vy = 0; gs.p.mode = 'track'
                    return true
                },
                setSpeed: (v) => { if (screenRef.current === 'play') gs.p.s = v },
                dbg,
            }
            mountDbg({
                title: 'MOMENTUM RUNNER',
                getState: () => {
                    const p = gs.p
                    return [
                        `${ZONES[gs.zone].name}  x ${p.x.toFixed(0)} y ${p.y.toFixed(0)}  ${p.mode}  s ${(p.s || 0).toFixed(0)}  vy ${(p.vy || 0).toFixed(0)}`,
                        `rings ${gs.rings}  score ${gs.score}  deaths ${gs.deaths}  inv ${p.invuln}  save z${gs.save.zone}@${gs.save.x}  loop ${gs.loopTaken ? 'TAKEN' : '-'}`,
                        `screen ${screenRef.current}  paused ${pausedRef.current}  tick ${gs.tick}`,
                    ]
                },
                actions: [
                    { label: 'PROGNOSIS', run: () => {
                        if (gs.end) return `already ${gs.end}`
                        const c = { ...gs, p: { ...gs.p }, save: { ...gs.save },
                            taken: new Set(gs.taken), spent: new Map(gs.spent), ev: [] }
                        const plan = planRun(c)
                        return plan.ok
                            ? `WINNABLE: autopilot wins from here in ${plan.script.length}t, ` +
                              `min gap margin ${Math.min(...plan.receipt.gaps.map(q => q.margin)).toFixed(0)}px`
                            : `NOT WINNABLE: ${(plan.receipt.warnings.join('; ') || `stuck after ${plan.script.length}t (end=${plan.end})`)}`
                    } },
                    { label: '+5 RINGS', run: () => { gs.rings += 5; return `rings ${gs.rings}` } },
                    { label: 'BOOST', run: () => {
                        if (gs.p.mode === 'air') gs.p.vx = Math.min(1150, gs.p.vx + 400)
                        else gs.p.s = Math.max(gs.p.s, 900)
                        return `s ${(gs.p.s || gs.p.vx).toFixed(0)}`
                    } },
                ],
            })
            exposeGame({
                id: 'momentum',
                buttons: ['left', 'right', 'up', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame()
                    evLog.length = 0
                    parts.length = 0
                    trail.length = 0
                    hist.length = 0
                    cprev = {}
                    keys.left = keys.right = false
                    jumpEdge = jumpCut = false
                    demoAt = 0
                    shake = 0
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const before = gs.ev.length
                    const aNow = !!pad.a || !!pad.up
                    step(gs, {
                        right: !!pad.right, left: !!pad.left,
                        jumpEdge: aNow && !(cprev.a || cprev.up),
                        jumpCut: !aNow && (cprev.a || cprev.up) && gs.p.mode === 'air',
                    })
                    maybeEnterLoop(gs)
                    handleEvents(gs.ev.slice(before))
                    cprev = { a: !!pad.a, up: !!pad.up }
                },
                state: () => {
                    const p = gs.p
                    const s = `${gs.tick}|${p.x.toFixed(2)},${p.y.toFixed(2)},${(p.s || 0).toFixed(2)},${p.mode}|` +
                        `${gs.zone}|${gs.rings}|${gs.score}|${gs.deaths}|${gs.loopTaken ? 1 : 0}|${gs.end || '-'}`
                    let h = 2166136261
                    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
                    return {
                        tick: gs.tick, score: gs.score, done: !!gs.end,
                        seed: contractSeed, zone: gs.zone, rings: gs.rings,
                        deaths: gs.deaths, hash: h >>> 0,
                    }
                },
                canvas: () => canvas,
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__runnerTest) delete window.__runnerTest; unmountDbg(); unexposeGame() }
            if (whoosh.src) { try { whoosh.src.stop() } catch { /* already stopped */ } }
            audioController.stopMusic()
            clearInterval(hintTimer)
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
                <div className="absolute top-2 left-3 flex items-center gap-2 font-mono text-xs">
                    <div className="skew-x-[-8deg] border border-cyan-300/70 bg-black/50 px-3 py-1" style={{ boxShadow: '0 0 12px rgba(102,246,255,0.25), inset 0 0 8px rgba(102,246,255,0.12)' }}>
                        <span className="block text-[8px] tracking-[0.25em] text-cyan-300/70">SECTOR</span>
                        <span ref={setHud('zone')} className="text-cyan-100 font-bold tracking-wider" />
                    </div>
                    <div className="skew-x-[-8deg] border border-amber-300/60 bg-black/50 px-3 py-1.5" style={{ boxShadow: '0 0 12px rgba(255,200,80,0.22)' }}>
                        <span className="text-amber-300 font-bold text-sm">◎ <span ref={setHud('rings')}>00</span></span>
                    </div>
                </div>
                <div className="absolute top-2 right-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 skew-x-[-8deg] border border-cyan-300/40 bg-black/50 px-3 py-1.5" style={{ boxShadow: '0 0 12px rgba(102,246,255,0.15)' }}>
                        <span className="text-[8px] tracking-[0.25em] text-cyan-200/70 font-mono">VELOCITY</span>
                        <div className="w-28 h-2.5 bg-black/60 overflow-hidden border border-cyan-300/30"><div ref={setHud('meter')} className="h-full" style={{ width: '0%' }} /></div>
                    </div>
                    <span className="text-2xl font-black text-white tracking-wider" style={{ textShadow: '0 0 14px rgba(102,246,255,0.8)' }}><span ref={setHud('score')}>00000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-[30%] text-center text-amber-200 font-mono font-bold text-2xl tracking-[0.3em] transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 16px #fa0' }} />
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-x-0 top-7 text-center pointer-events-none">
                        <h1 className="text-5xl font-black tracking-tight text-cyan-100" style={{ textShadow: '0 0 18px rgba(102,246,255,0.75), 0 4px 0 rgba(8,40,60,0.9), 0 10px 30px #000' }}>
                            MOMENTUM<span className="text-orange-400" style={{ textShadow: '0 0 18px rgba(255,140,60,0.8)' }}> RUNNER</span>
                        </h1>
                        <p className="text-cyan-300/80 font-mono mt-1 text-xs tracking-[0.3em]">SPEED IS THE ONLY CURRENCY · NEVER STOP</p>
                    </div>
                    <div className="absolute inset-x-0 bottom-5 text-center pointer-events-none px-8">
                        <p className="text-white font-mono font-bold text-sm animate-pulse tracking-widest">TAP / PRESS ANY KEY</p>
                        <p ref={hintRef} className="text-cyan-200/85 font-mono text-xs mt-2" style={{ textShadow: '0 0 8px rgba(102,246,255,0.5)' }}>{HINTS[0]}</p>
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1 text-amber-300">GOAL!</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.deaths} deaths</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">RUN LOG</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.deaths} deaths</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MOMENTUM RUNNER')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default MomentumGame

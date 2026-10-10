// MOMENTUM RUNNER — the arcade shell. Everything is drawn at runtime from the
// pure sim in ./sim.js: the sloped track is painted segment by segment, the
// loop is a stroked annulus, and the runner is a rotating wheel. The renderer's
// ONLY spatial contract is `screen = world - cam` with no vertical flip (the
// sim already uses screen-style y-down coords), which is exactly the transform
// scripts/runnerplay.mjs samples to prove the drawn wheel sits where the
// physics says the body is, after every real keystroke.
//
// Layout: 1. proven script (attract demo = the autopilot's own winning route)
// 2. palette + painter 3. fixed-timestep loop (250ms catch-up cap — the heist
// lesson) 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import {
    ZONES, groundY, maybeEnterLoop, makeGame, step, planRun,
    FIXED_DT, VIEW_W, VIEW_H, BODY_R, RUN_TOP, VMAX,
} from './sim.js'

const SIM_MS = 1000 / 60
const JUMP_KEYS = ['Space', 'KeyZ', 'ArrowUp']

const PALETTE = [
    { sky0: '#7ec0ff', sky1: '#d7f0ff', sun: '#fff2a8', hillBack: '#7fbf7f', hillFront: '#4f9f5f',
        grass: '#3fd05a', soil0: '#8a5a2a', soil1: '#5c3a1a', spike: '#d7e3ea', ring: '#ffd23f' },
    { sky0: '#2a0f16', sky1: '#8a3a1e', sun: '#ff7a3a', hillBack: '#5a2436', hillFront: '#7a3320',
        grass: '#d0532a', soil0: '#6a2c2a', soil1: '#3a1414', spike: '#ffe0b0', ring: '#ffd23f' },
    { sky0: '#0f1a3a', sky1: '#2b4180', sun: '#dfeaff', hillBack: '#243a72', hillFront: '#1b2b57',
        grass: '#5f7ad0', soil0: '#33406e', soil1: '#1c2445', spike: '#cfe0ff', ring: '#7dffd8' },
]

let proven = null
const provenScript = () => {
    if (!proven) proven = planRun().script
    return proven
}

// per-zone vertical camera bounds so the loop apex and the spawn stay in frame
const CAM_Y = ZONES.map(z => {
    let top = Infinity, bot = -Infinity
    for (const s of z.segs) { top = Math.min(top, s[1], s[3]); bot = Math.max(bot, s[1], s[3]) }
    if (z.loop) top = Math.min(top, z.loop.cy - z.loop.r)
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
    const board = () => { try { return JSON.parse(localStorage.getItem('runner.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.runnerStage = '1'
        canvas.width = VIEW_W; canvas.height = VIEW_H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame()
        let demoAt = 0, raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = '', shake = 0, wheelAng = 0
        const keys = { left: false, right: false }
        let jumpEdge = false, jumpCut = false
        const dbg = { kp: 0 }
        const evLog = []
        const hist = []
        const parts = []

        const cam = () => {
            const cx = CAM_X[gs.zone], cy = CAM_Y[gs.zone]
            const p = gs.p
            return {
                x: Math.max(cx.min, Math.min(cx.max, Math.round(p.x - VIEW_W * 0.34))),
                y: Math.max(cy.min, Math.min(cy.max, Math.round(p.y - VIEW_H * 0.62))),
            }
        }
        const say = (m) => { toastMsg = m; toast = 90 }

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
                else if (e.type === 'crash') { audioController.playNoise(0.2, 0.1); shake = 10; say('TOO SLOW!') }
                else if (e.type === 'save') { audioController.playTone(880, 0.12, 'sine', 0.06); audioController.playTone(1320, 0.18, 'sine', 0.05); say('CHECKPOINT') }
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'respawn') { audioController.playSweep(220, 700, 0.4, 'triangle', 0.07); say('BACK TO CHECKPOINT') }
                else if (e.type === 'goal') { audioController.playSweep(660, 1760, 0.5, 'square', 0.09) }
            }
        }

        const finish = () => {
            const sc = gs.score
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
        const paint = () => {
            const c = cam()
            const P = PALETTE[gs.zone]
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            if (shake > 0) shake *= 0.85
            const g = ctx.createLinearGradient(0, 0, 0, VIEW_H)
            g.addColorStop(0, P.sky0); g.addColorStop(1, P.sky1)
            ctx.fillStyle = g
            ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            // sun
            ctx.fillStyle = P.sun; ctx.globalAlpha = 0.9
            ctx.beginPath(); ctx.arc(VIEW_W * 0.82 - c.x * 0.02, 48, 22, 0, Math.PI * 2); ctx.fill()
            ctx.globalAlpha = 1
            // parallax hills
            const hill = (base, amp, f, col) => {
                ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, VIEW_H)
                for (let px = 0; px <= VIEW_W; px += 8) {
                    const wx = (px + c.x * f)
                    const yy = base - c.y * f * 0.4 + amp * Math.sin(wx * 0.006) + amp * 0.6 * Math.sin(wx * 0.013 + 1)
                    ctx.lineTo(px, yy)
                }
                ctx.lineTo(VIEW_W, VIEW_H); ctx.closePath(); ctx.fill()
            }
            hill(VIEW_H * 0.62, 26, 0.28, P.hillBack)
            hill(VIEW_H * 0.78, 34, 0.52, P.hillFront)
            // ground segments
            const dx0 = c.x + sx, dy0 = c.y + sy
            for (const s of ZONES[gs.zone].segs) {
                const [x1, y1, x2, y2] = s
                const px1 = x1 - dx0, px2 = x2 - dx0, py1 = y1 - dy0, py2 = y2 - dy0
                if (px2 < -20 || px1 > VIEW_W + 20) continue
                const bot = ZONES[gs.zone].deathY - dy0
                ctx.beginPath()
                ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.lineTo(px2, bot); ctx.lineTo(px1, bot); ctx.closePath()
                const soil = ctx.createLinearGradient(0, py1, 0, bot)
                soil.addColorStop(0, P.soil0); soil.addColorStop(1, P.soil1)
                ctx.fillStyle = soil; ctx.fill()
                ctx.strokeStyle = P.grass; ctx.lineWidth = 5
                ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(px1, py1 - 2); ctx.lineTo(px2, py2 - 2); ctx.stroke()
            }
            // loop annulus
            const L = ZONES[gs.zone].loop
            if (L) {
                const lx = L.cx - dx0, ly = L.cy - dy0
                ctx.save()
                ctx.strokeStyle = 'rgba(120,255,220,0.85)'; ctx.lineWidth = 7
                ctx.beginPath(); ctx.arc(lx, ly, L.r, 0, Math.PI * 2); ctx.stroke()
                ctx.strokeStyle = 'rgba(40,90,120,0.9)'; ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(lx, ly, L.r - 6, 0, Math.PI * 2); ctx.stroke()
                const rot = gs.tick * 0.05
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2
                for (let i = 0; i < 8; i++) {
                    const a = rot + i * Math.PI / 4
                    ctx.beginPath()
                    ctx.moveTo(lx + Math.cos(a) * (L.r - 5), ly + Math.sin(a) * (L.r - 5))
                    ctx.lineTo(lx + Math.cos(a) * (L.r + 3), ly + Math.sin(a) * (L.r + 3))
                    ctx.stroke()
                }
                ctx.restore()
            }
            // spikes
            for (const sp of ZONES[gs.zone].spikes) {
                for (let x = sp[0]; x <= sp[1]; x += 12) {
                    const gy = groundY(ZONES[gs.zone], x); if (gy === null) continue
                    const px = x - dx0, py = gy - dy0
                    if (px < -20 || px > VIEW_W + 20) continue
                    ctx.fillStyle = P.spike
                    ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px, py - 13); ctx.lineTo(px + 5, py); ctx.closePath(); ctx.fill()
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px - 5, py - 2, 10, 2)
                }
            }
            // checkpoint totem
            const z = ZONES[gs.zone]
            if (z.ck > 0) {
                const gy = groundY(z, z.ck)
                if (gy !== null) {
                    const px = z.ck - dx0, py = gy - dy0
                    const on = gs.save.zone === gs.zone && gs.save.x === z.ck
                    ctx.fillStyle = '#3a3f52'; ctx.fillRect(px - 2, py - 46, 4, 46)
                    ctx.fillStyle = on ? '#5aff9a' : '#5a6076'
                    ctx.beginPath(); ctx.moveTo(px + 2, py - 46); ctx.lineTo(px + 26, py - 40); ctx.lineTo(px + 2, py - 32); ctx.fill()
                }
            }
            // goal banner
            {
                const gy = groundY(z, z.goal)
                if (gy !== null) {
                    const px = z.goal - dx0, py = gy - dy0
                    ctx.fillStyle = '#e9edf5'; ctx.fillRect(px - 2, py - 66, 4, 66)
                    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
                        ctx.fillStyle = (i + k) % 2 ? '#111' : '#fff'
                        ctx.fillRect(px + 2 + i * 9, py - 64 + k * 8, 9, 8)
                    }
                }
            }
            // spring pads
            for (const sp of z.springs) {
                const px = sp[0] - dx0, py = sp[1] - dy0
                ctx.fillStyle = '#c0392b'; ctx.fillRect(px - 10, py - 6, 20, 6)
                ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 2
                ctx.beginPath()
                for (let i = 0; i < 3; i++) ctx.lineTo(px - 8 + i * 8, py - 6 - (i % 2 ? 6 : 0))
                ctx.stroke()
            }
            // rings
            for (let i = 0; i < z.rings.length; i++) {
                if (gs.taken.has(i + gs.zone * 100)) continue
                const [rx, ry] = z.rings[i]
                const px = rx - dx0, py = ry - dy0 + Math.sin(gs.tick / 12 + i) * 2
                const wob = Math.abs(Math.cos(gs.tick / 9 + i))
                ctx.strokeStyle = P.ring; ctx.lineWidth = 3
                ctx.beginPath(); ctx.ellipse(px, py, 9 * wob + 1, 9, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.ellipse(px, py, 5 * wob, 5, 0, 0, Math.PI * 2); ctx.stroke()
            }
            // speed streaks
            const p = gs.p
            if (Math.abs(p.s) > RUN_TOP + 30 && p.mode === 'track') {
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2
                for (let i = 0; i < 4; i++) {
                    const yy = p.y - 2 - i * 3 - dy0, xx = p.x - dx0
                    ctx.beginPath(); ctx.moveTo(xx - 12, yy); ctx.lineTo(xx - 12 - Math.min(30, Math.abs(p.s) * 0.04), yy); ctx.stroke()
                }
            }
            // the wheel
            {
                const px = Math.round(p.x - dx0), py = Math.round(p.y - BODY_R - dy0)
                const blink = p.invuln > 0 && gs.tick % 6 < 3
                if (!blink) {
                    const ang = wheelAng
                    ctx.save(); ctx.translate(px, py); ctx.rotate(ang)
                    ctx.fillStyle = '#ffcf3f'; ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 3
                    ctx.beginPath(); ctx.arc(0, 0, BODY_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
                    ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 2
                    for (let i = 0; i < 4; i++) {
                        const a = i * Math.PI / 2
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * BODY_R, Math.sin(a) * BODY_R); ctx.stroke()
                    }
                    ctx.restore()
                    // body above the wheel
                    ctx.fillStyle = '#e63b2e'
                    ctx.fillRect(px - 5, py - BODY_R - 12, 10, 11)
                    ctx.fillStyle = '#dfe6ee'
                    ctx.fillRect(px - 4, py - BODY_R - 16, 8, 6)
                    ctx.fillStyle = '#39d2ff'
                    ctx.fillRect(px + (p.s >= 0 ? 0 : -3), py - BODY_R - 15, 3, 3)
                }
            }
            // particles
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.15
                if (pa.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 26; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x - dx0, pa.y - dy0, 2, 2)
            }
            ctx.globalAlpha = 1
            if (shake < 0.4) shake = 0
            wheelAng += (p.s * FIXED_DT) / BODY_R
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
                acc += ft
                while (acc >= SIM_MS) { doSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame()
            evLog.length = 0; parts.length = 0
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

        if (import.meta.env.DEV) {
            window.__runnerTest = {
                probe: () => {
                    const p = gs.p, c = cam()
                    return {
                        screen: screenRef.current, tick: gs.tick, zone: gs.zone, zoneName: ZONES[gs.zone].name,
                        x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, mode: p.mode,
                        vx: Math.round(p.vx || 0), vy: Math.round(p.vy || 0), s: Math.round(p.s || 0),
                        cam: c,
                        // THE screen pixel the wheel is painted at (screen = world - cam)
                        at: { x: Math.round(p.x - c.x), y: Math.round(p.y - BODY_R - c.y) },
                        rings: gs.rings, score: gs.score, deaths: gs.deaths,
                        loopTaken: gs.loopTaken, phi: Math.round(p.phi * 100) / 100,
                        cut: !!p.cut,
                        save: { ...gs.save }, goal: ZONES[gs.zone].goal, end: gs.end,
                        invuln: p.invuln, speed: Math.round(Math.abs(p.s || 0)),
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
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__runnerTest) delete window.__runnerTest; unmountDbg() }
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
                    <span ref={setHud('zone')} className="border border-cyan-300/60 text-cyan-200 px-2 py-0.5 rounded bg-black/40" />
                    <span className="text-amber-300 text-sm font-bold">◎ <span ref={setHud('rings')}>00</span></span>
                    <div className="flex items-center gap-1">
                        <span className="text-[9px] text-white/70">SPEED</span>
                        <div className="w-24 h-2 bg-black/50 rounded overflow-hidden border border-white/20"><div ref={setHud('meter')} className="h-full" style={{ width: '0%' }} /></div>
                    </div>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>00000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-amber-200 font-mono font-bold text-2xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #fa0' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-orange-300" style={{ textShadow: '0 4px 0 #7a2b00, 0 10px 24px #000' }}>MOMENTUM RUNNER</h1>
                    <p className="text-cyan-50/90 font-mono mt-1 text-sm">speed is the only currency. never stop.</p>
                    <p className="text-white font-mono font-bold mt-5 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-cyan-100/80 font-mono text-xs mt-2 px-6">
                        RIGHT / D-pad right: build speed (flat running is deliberately too slow)<br />
                        SPACE / A: jump the pits — release early to land short, hold to fly far<br />
                        the vertical loop only sticks if you enter fast (v² ≥ 5·g·r); its apex holds the only rings that survive the far spike<br />
                        springs loft you over spring-pits; hit a hazard WITH rings and you stagger, without them you fall back to the totem<br />
                        this demo is the autopilot&apos;s own proven route, replayed tick for tick
                    </p>
                </div>
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

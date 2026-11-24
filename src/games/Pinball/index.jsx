// PINBALL — CABINET ONE (issue #3103, rung 1: shared table engine + table 1).
// Shell only: loop, scaling, attract, pause, pad, harness wiring. All rules and
// physics live in sim.js (pure, Node-auditable); look in art.js. Bar: MODERN —
// a lit, reflective cabinet you want to look at. Original art & audio, in code.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import {
    makeGame, stepGame, stateOf, stateHash, TABLE, W, H, BALL_R,
} from './sim.js'
import { PAL, SCORE_X, SCORE_Y, SCORE_DIGITS, drawSevenSeg, paintField, PRESS, MESSAGES } from './art.js'

const FIXED_DT = 1000 / 60

const sfxFor = (ev) => {
    const a = audioController
    switch (ev.type) {
        case 'flip': a.playNoise(0.03, 0.12); a.playTone(150, 0.03, 'triangle', 0.07); break
        case 'bumper': a.playTone(660, 0.05, 'square', 0.12); a.playNoise(0.04, 0.13); a.playTone(880, 0.04, 'square', 0.07, 0.03); break
        case 'sling': a.playTone(320, 0.05, 'square', 0.1); a.playNoise(0.03, 0.09); break
        case 'target': a.playSweep(520, 980, 0.09, 'square', 0.1); break
        case 'bank':
            a.playTone(523, 0.08, 'square', 0.1); a.playTone(659, 0.08, 'square', 0.1, 0.08)
            a.playTone(784, 0.12, 'square', 0.11, 0.16); a.playNoise(0.06, 0.1, 0.2); break
        case 'spinner': a.playTone(1500, 0.025, 'square', 0.05); break
        case 'kicker': a.playSweep(220, 660, 0.15, 'triangle', 0.12); break
        case 'plunge': a.playSweep(120, 700, 0.22, 'triangle', 0.14); break
        case 'drain': a.playSweep(420, 70, 0.35, 'sawtooth', 0.12); a.playNoise(0.15, 0.1); break
        case 'bonus':
            a.playTone(523, 0.05, 'square', 0.08); a.playTone(659, 0.05, 'square', 0.08, 0.06)
            a.playTone(784, 0.09, 'square', 0.09, 0.12); break
        case 'tiltwarn': a.playTone(220, 0.08, 'square', 0.09); break
        case 'tilt': a.playTone(180, 0.28, 'square', 0.13); break
        case 'nudge': a.playNoise(0.05, 0.07); break
        case 'ballstart': a.playTone(784, 0.06, 'square', 0.1); a.playTone(1046, 0.08, 'square', 0.1, 0.07); break
        case 'gameover':
            [392, 311, 262, 196].forEach((f, i) => a.playTone(f, 0.14, 'square', 0.1, i * 0.13)); break
        case 'start': a.playTone(392, 0.07, 'square', 0.1); a.playTone(523, 0.07, 'square', 0.1, 0.07); a.playTone(659, 0.1, 'square', 0.1, 0.14); break
        default: break
    }
}

const PinballGame = () => {
    const canvasRef = useRef(null)
    // #1473 seed pin: a filed report carries the seed, feedbackreplay opens
    // `/pinball?seed=N` — honor it at every human start, keep own RNG otherwise.
    const freshSeed = () => (seedFromQuery() ?? (Date.now() >>> 0))
    const gsRef = useRef(makeGame(freshSeed()))
    const keysRef = useRef({ left: false, right: false, a: false, down: false, b: false })
    const partsRef = useRef([])
    const flashRef = useRef({ bumpers: TABLE.bumpers.map(() => 0), slings: TABLE.slings.map(() => 0), targets: TABLE.targets.map(() => 0), bank: 0, spinner: 0, drain: 0, tilt: 0 })
    const msgRef = useRef({ text: '', t: 0 })
    const shakeRef = useRef(0)
    const trailRef = useRef([])
    const fieldRef = useRef(null)
    const screenRef = useRef('attract')
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    screenRef.current = screen

    const startPlay = useCallback(() => {
        gsRef.current = makeGame(freshSeed())
        partsRef.current = []
        trailRef.current = []
        msgRef.current = { text: '', t: 0 }
        screenRef.current = 'play'; setScreen('play')
        sfxFor({ type: 'start' })
    }, [])

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = W; cvs.height = H
        const ctx = cvs.getContext('2d')
        ctx.imageSmoothingEnabled = true
        if (!fieldRef.current) {
            const f = document.createElement('canvas')
            f.width = W; f.height = H
            paintField(f.getContext('2d'), W, H)
            fieldRef.current = f
        }

        const fit = () => {
            const par = cvs.parentElement
            if (!par) return
            const aw = par.clientWidth, ah = par.clientHeight
            const s = Math.min(aw / W, ah / H)
            cvs.style.width = `${Math.floor(W * s)}px`
            cvs.style.height = `${Math.floor(H * s)}px`
        }
        fit()
        window.addEventListener('resize', fit)

        const padNow = () => keysRef.current

        const spawn = (x, y, n, color, spd = 130) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = spd * (0.4 + Math.random() * 0.8)
                partsRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.3, color })
            }
        }
        const say = (text, ticks = 110) => { msgRef.current = { text, t: ticks } }

        const react = (gs) => {
            const fl = flashRef.current
            for (const ev of gs.events) {
                sfxFor(ev)
                if (ev.type === 'bumper') { fl.bumpers[ev.i] = 9; spawn(ev.x, ev.y, 10, PAL.hot, 190) }
                else if (ev.type === 'sling') { fl.slings[ev.i] = 7; spawn(ev.x, ev.y, 6, PAL.sling, 150) }
                else if (ev.type === 'target') { fl.targets[ev.i] = 8; spawn(ev.x, ev.y, 7, PAL.neon) }
                else if (ev.type === 'bank') { fl.bank = 40; shakeRef.current = Math.max(shakeRef.current, 5); say(`BANK CLEARED! MULT x${gs.mult}`, 130) }
                else if (ev.type === 'spinner') { fl.spinner = 6; spawn(ev.x, ev.y, 3, PAL.glow, 90) }
                else if (ev.type === 'kicker') { spawn(ev.x, ev.y, 12, PAL.lane, 220) }
                else if (ev.type === 'plunge') { spawn(TABLE.plunger.x, TABLE.plunger.restY, 8, PAL.chrome, 120) }
                else if (ev.type === 'drain') { shakeRef.current = 10; fl.drain = 24 }
                else if (ev.type === 'bonus') say(`BONUS +${ev.value}`, 120)
                else if (ev.type === 'tilt') { fl.tilt = 90; shakeRef.current = 14; say('TILT!', 140) }
                else if (ev.type === 'tiltwarn') say('CAREFUL…', 70)
                else if (ev.type === 'ballstart') say(`BALL ${TABLE.balls - gs.balls + 1}`, 90)
            }
            gs.events.length = 0
        }

        // ---------------------------------------------------------------- draw ----
        const drawTable = (gs) => {
            ctx.save()
            if (shakeRef.current > 0) {
                ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current)
                shakeRef.current = Math.max(0, shakeRef.current - 0.7)
            }
            ctx.drawImage(fieldRef.current, 0, 0)

            // cabinet rail + arc wall
            ctx.strokeStyle = PAL.wood; ctx.lineWidth = 10; ctx.lineCap = 'round'
            ctx.beginPath()
            const arc = TABLE.arc
            for (let i = 0; i <= arc.segs; i++) {
                const a = arc.from + (arc.to - arc.from) * (i / arc.segs)
                const x = arc.cx + Math.cos(a) * arc.rx, y = arc.cy + Math.sin(a) * arc.ry
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            }
            ctx.stroke()
            ctx.strokeStyle = PAL.woodHi; ctx.lineWidth = 3; ctx.stroke()

            // side walls / lane / aprons — neon-roped rubber look
            ctx.strokeStyle = PAL.chrome; ctx.lineWidth = 3
            for (const w of TABLE.walls) {
                ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke()
            }
            const og = TABLE.outlaneGuide
            ctx.beginPath(); ctx.moveTo(og.x1, og.y1); ctx.lineTo(og.x2, og.y2); ctx.stroke()

            // lane guide glow down the launch lane
            ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(gs.tick / 8)
            ctx.strokeStyle = PAL.lane; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(TABLE.plunger.x, 520); ctx.lineTo(TABLE.plunger.x, 210); ctx.stroke()
            ctx.restore()

            const fl = flashRef.current
            Object.keys(fl).forEach((k) => { if (Array.isArray(fl[k])) fl[k] = fl[k].map((v) => Math.max(0, v - 1)); else fl[k] = Math.max(0, fl[k] - 1) })

            // pop bumpers — ring, cap, lamp bloom on hit
            TABLE.bumpers.forEach((b, i) => {
                const glow = fl.bumpers[i]
                ctx.save()
                if (glow > 0) {
                    const rg = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + 26)
                    rg.addColorStop(0, `rgba(255,61,94,${0.5 * (glow / 9)})`); rg.addColorStop(1, 'rgba(255,61,94,0)')
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, 0, 7); ctx.fill()
                }
                ctx.strokeStyle = PAL.chrome; ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, 7); ctx.stroke()
                const cap = ctx.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, b.r)
                cap.addColorStop(0, glow > 0 ? '#ffffff' : '#ff8095'); cap.addColorStop(1, PAL.hot)
                ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
                ctx.restore()
            })

            // slingshots
            TABLE.slings.forEach((s, i) => {
                ctx.save()
                if (fl.slings[i] > 0) { ctx.shadowColor = PAL.sling; ctx.shadowBlur = 14 }
                ctx.strokeStyle = PAL.sling; ctx.lineWidth = 6; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke()
                ctx.restore()
            })

            // drop targets: up = glowing cyan bars, down = dark slots
            TABLE.targets.forEach((tp, i) => {
                const down = gs.targetDown[i]
                ctx.save()
                if (down) {
                    ctx.fillStyle = 'rgba(10,14,30,0.9)'
                    ctx.fillRect(tp.x1, TABLE.targetY - 3, tp.x2 - tp.x1, 6)
                } else {
                    if (fl.targets[i] > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 }
                    ctx.fillStyle = fl.bank > 0 ? '#9ff3ff' : PAL.neon
                    ctx.fillRect(tp.x1, TABLE.targetY - 3, tp.x2 - tp.x1, 6)
                    ctx.fillStyle = 'rgba(255,255,255,0.7)'
                    ctx.fillRect(tp.x1 + 2, TABLE.targetY - 2, 3, 4)
                }
                ctx.restore()
            })

            // spinner (outlane): tilts while ball passes through
            const sp = TABLE.spinner
            ctx.save()
            ctx.translate(24, (sp.yFrom + sp.yTo) / 2)
            ctx.rotate(gs.spinnerArm ? 0.4 : 0.4 + (gs.spinnerSpin / sp.pxPerTurn) * Math.PI * 2 + gs.spinnerTurns * 0.6)
            ctx.fillStyle = fl.spinner > 0 ? '#ffffff' : PAL.chrome
            ctx.fillRect(-2, -14, 4, 28)
            ctx.restore()
            // kicker mouth
            ctx.fillStyle = `rgba(255,176,46,${0.25 + 0.2 * Math.sin(gs.tick / 7)})`
            ctx.beginPath(); ctx.moveTo(10, 505); ctx.lineTo(44, 505); ctx.lineTo(26, 526); ctx.closePath(); ctx.fill()

            // flippers — chrome capsules
            const f = TABLE.flippers
            ;['L', 'R'].forEach((side) => {
                const px = side === 'L' ? f.L.px : f.R.px
                const a = gs.ang[side] * Math.PI / 180
                ctx.save()
                ctx.shadowColor = PAL.glow; ctx.shadowBlur = gs.angV[side] !== 0 ? 12 : 4
                ctx.strokeStyle = gs.tilt ? '#5a6478' : PAL.chrome
                ctx.lineWidth = f.halfW * 2; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(px, f.pivotY); ctx.lineTo(px + Math.cos(a) * f.len, f.pivotY + Math.sin(a) * f.len); ctx.stroke()
                ctx.fillStyle = PAL.woodHi; ctx.beginPath(); ctx.arc(px, f.pivotY, 5, 0, 7); ctx.fill()
                ctx.restore()
            })

            // plunger: spring + power meter
            const pPull = gs.launched ? 0 : gs.power
            ctx.strokeStyle = PAL.chrome; ctx.lineWidth = 4
            ctx.beginPath(); ctx.moveTo(TABLE.plunger.x, 564 + pPull * 14); ctx.lineTo(TABLE.plunger.x, 586 + pPull * 14); ctx.stroke()
            if (!gs.launched && gs.power > 0.02) {
                ctx.fillStyle = PAL.hot
                ctx.fillRect(300, 592 - 60 * gs.power, 6, 60 * gs.power)
            }

            // ball trail + ball
            trailRef.current.push({ x: gs.bx, y: gs.by })
            if (trailRef.current.length > 7) trailRef.current.shift()
            trailRef.current.forEach((p, i) => {
                const a = (i / trailRef.current.length) * 0.28
                ctx.fillStyle = `rgba(190,210,255,${a.toFixed(3)})`
                ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.5 + 0.5 * i / trailRef.current.length), 0, 7); ctx.fill()
            })
            const bg = ctx.createRadialGradient(gs.bx - 3, gs.by - 4, 1, gs.bx, gs.by, BALL_R)
            bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#aab8cf'); bg.addColorStop(1, '#39435a')
            ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(gs.bx, gs.by, BALL_R, 0, 7); ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,0.85)'
            ctx.beginPath(); ctx.arc(gs.bx - 3, gs.by - 4, 2.2, 0, 7); ctx.fill()

            // glossy sheen — the reflective MODERN bar
            const sheen = ctx.createRadialGradient(110, 120, 20, 110, 120, 260)
            sheen.addColorStop(0, 'rgba(255,255,255,0.07)'); sheen.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H)

            // particles
            partsRef.current = partsRef.current.filter((p) => p.life > 0)
            for (const p of partsRef.current) {
                p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vy += 300 / 60
                ctx.globalAlpha = Math.max(0, p.life)
                ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2)
            }
            ctx.globalAlpha = 1

            // HUD — 7-seg score centred (corner clearance law #2899 respected)
            ctx.fillStyle = 'rgba(4,6,16,0.72)'
            ctx.fillRect(SCORE_X - 12, SCORE_Y - 10, SCORE_DIGITS * 22 + 24, 44)
            const sc = String(Math.min(999999, gs.score)).padStart(SCORE_DIGITS, '0')
            for (let i = 0; i < SCORE_DIGITS; i++) drawSevenSeg(ctx, SCORE_X + i * 22, SCORE_Y, +sc[i], PAL.score, fl.drain > 0 && fl.drain % 2 === 0)
            // balls + mult lamps
            for (let i = 0; i < TABLE.balls; i++) {
                ctx.fillStyle = i < gs.balls ? PAL.glow : 'rgba(127,216,255,0.15)'
                ctx.beginPath(); ctx.arc(SCORE_X + SCORE_DIGITS * 22 + 10, SCORE_Y + 6 + i * 12, 4, 0, 7); ctx.fill()
            }
            ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
            ctx.fillStyle = gs.mult > 1 ? PAL.hot : 'rgba(255,61,94,0.25)'
            ctx.fillText(`BONUS x${gs.mult}`, 180, SCORE_Y + 40)
            if (gs.nudgeMeter > 0 && !gs.tilt) {
                ctx.fillStyle = 'rgba(255,176,46,0.8)'
                ctx.fillText('~ NUDGE ~', 180, SCORE_Y + 54)
            }
            if (fl.tilt > 0 && fl.tilt % 8 < 4) {
                ctx.fillStyle = PAL.hot; ctx.font = 'bold 26px monospace'
                ctx.fillText('TILT', 180, 360)
            }
            if (msgRef.current.t > 0) {
                msgRef.current.t -= 1
                ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 14px monospace'
                ctx.fillText(msgRef.current.text, 180, 388)
            }
            ctx.restore()
        }

        const drawAttract = (t) => {
            ctx.drawImage(fieldRef.current, 0, 0)
            // demo ball rolling along the top arc, back and forth — everything moves
            const a = Math.PI + (Math.sin(t / 700) * 0.5 + 0.5) * Math.PI
            const bx = TABLE.arc.cx + Math.cos(a) * TABLE.arc.rx
            const by = TABLE.arc.cy + Math.sin(a) * TABLE.arc.ry + BALL_R + 6
            const bg = ctx.createRadialGradient(bx - 3, by - 4, 1, bx, by, BALL_R)
            bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#39435a')
            ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, 7); ctx.fill()
            TABLE.bumpers.forEach((b, i) => {
                const pulse = 0.3 + 0.3 * Math.sin(t / 300 + i * 2)
                ctx.fillStyle = `rgba(255,61,94,${pulse.toFixed(2)})`
                ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
            })
            ctx.save()
            ctx.textAlign = 'center'
            ctx.font = 'bold 34px monospace'
            ctx.shadowColor = PAL.neon; ctx.shadowBlur = 16 + 6 * Math.sin(t / 350)
            ctx.fillStyle = '#e9fbff'
            ctx.fillText('PINBALL', 180, 270)
            ctx.font = 'bold 15px monospace'
            ctx.shadowColor = PAL.lane; ctx.shadowBlur = 8
            ctx.fillStyle = PAL.lane
            ctx.fillText('CABINET ONE', 180, 296)
            if (Math.floor(t / 500) % 2 === 0) {
                ctx.font = 'bold 12px monospace'
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 6
                ctx.fillStyle = '#fff'
                ctx.fillText(PRESS, 180, 340)
            }
            ctx.restore()
        }

        let raf = 0, prev = performance.now(), acc = 0
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(100, now - prev); prev = now
            const gs = gsRef.current
            if (screenRef.current === 'play' && !pausedRef.current && !contractHoldsLoop()) {
                acc += dt
                let steps = 0
                while (acc >= FIXED_DT && steps < 8) {
                    stepGame(gs, padNow()); acc -= FIXED_DT; steps++
                }
                react(gs)
                if (gs.done) { screenRef.current = 'over'; setScreen('over') }
            }
            ctx.clearRect(0, 0, W, H)
            if (screenRef.current === 'attract') drawAttract(now)
            else drawTable(gs)
        }
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------------- input ----
        const startable = () => screenRef.current === 'attract' || screenRef.current === 'over'
        const onKeyDown = (e) => {
            if (e.repeat) return
            if (e.code === 'Escape' || e.code === 'QuestionMark' || e.code === 'Backquote') {
                if (screenRef.current === 'play') setPaused((p) => !p)
                return
            }
            if (startable()) { if (!paused) startPlay(); return }
            if (paused) return
            const k = keysRef.current
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = true
            else if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = true
            else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { k.a = true; k.down = true }
            else if (e.code === 'KeyB' || e.code === 'ShiftLeft') k.b = true
            if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
        }
        const onKeyUp = (e) => {
            const k = keysRef.current
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = false
            else if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = false
            else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { k.a = false; k.down = false }
            else if (e.code === 'KeyB' || e.code === 'ShiftLeft') k.b = false
        }
        const onPointer = () => { if (startable() && !pausedRef.current) startPlay() }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        cvs.addEventListener('pointerdown', onPointer)

        // #1200 feedback report (production build too): the in-game report
        // button files live state so a report can be replayed at ?seed=N.
        exposeFeedbackState(() => ({ tick: gsRef.current.tick, score: gsRef.current.score, done: gsRef.current.done, seed: gsRef.current.seed }))

        if (import.meta.env.DEV) {
            window.__pinballTest = {
                state: () => stateOf(gsRef.current),
                hash: () => stateHash(gsRef.current),
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0); return stateOf(gsRef.current) },
                press: (code) => {
                    const k = keysRef.current
                    if (code === 'left') k.left = true; else if (code === 'right') k.right = true
                    else if (code === 'a' || code === 'down') { k.a = true; k.down = true }
                    else if (code === 'b') k.b = true
                },
                release: (code) => {
                    const k = keysRef.current
                    if (code === 'left') k.left = false; else if (code === 'right') k.right = false
                    else if (code === 'a' || code === 'down') { k.a = false; k.down = false }
                    else if (code === 'b') k.b = false
                },
                step: (n = 1) => { for (let i = 0; i < n; i++) stepGame(gsRef.current, keysRef.current); react(gsRef.current); return stateOf(gsRef.current) },
            }
            exposeGame({
                id: 'pinball',
                buttons: ['left', 'right', 'a', 'b', 'down'],
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0); screenRef.current = 'play'; setScreen('play'); return stateOf(gsRef.current) },
                tick: (pad) => { stepGame(gsRef.current, pad || {}); react(gsRef.current); return stateOf(gsRef.current) },
                state: () => stateOf(gsRef.current),
                canvas: () => canvasRef.current,
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', fit)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            cvs.removeEventListener('pointerdown', onPointer)
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__pinballTest) delete window.__pinballTest; unexposeGame() }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay])

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <canvas ref={canvasRef} className="rounded-lg shadow-[0_0_40px_rgba(49,225,255,0.15)]" />
            {screen === 'attract' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex flex-col items-center">
                    <AttractMessage className="text-cyan-200/85 mt-2" messages={MESSAGES} />
                </div>
            )}
            {screen === 'over' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <p className="font-mono text-2xl font-bold text-rose-300" style={{ textShadow: '0 0 12px rgba(255,61,94,0.8)' }}>GAME OVER</p>
                    <p className="font-mono text-sm text-amber-200">FINAL {String(gsRef.current.score).padStart(6, '0')}</p>
                    <p className="font-mono text-[11px] text-white/70">{PRESS}</p>
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PINBALL')} onResume={() => setPaused(false)} />}
            <VirtualControls visible={screen === 'play' && !paused} secondAction={{ label: 'NUDGE', code: 'KeyB' }} />
        </div>
    )
}

export default PinballGame

// PINBALL — the shared table engine with TWO cabinets (issue #3103 rungs 1-3,
// #3217 ball-ball, #3232 CABINET TWO + row-of-cabinets select).
// Shell only: loop, scaling, attract (row of cabinets), pause, pad, harness
// wiring. All rules and physics live in sim.js (pure, Node-auditable); look
// lives in art.js. Bar: MODERN — a lit, reflective cabinet you want to look
// at. Original art & audio, in code.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import {
    makeGame, stepGame, stateOf, stateHash, TABLE, TABLE_TWO, CABINETS, cabIndexOf, W, H, BALL_R,
} from './sim.js'
import { PAL, PAL_EMBER, SCORE_X, SCORE_Y, SCORE_DIGITS, drawSevenSeg, paintField, PRESS, MESSAGES, MESSAGES_EMBER, drawDMD, dmdIdle } from './art.js'

const FIXED_DT = 1000 / 60

// The row of cabinets: presentation metadata per cabinet. The SIM owns the
// table data; this file owns how each machine looks and talks.
const CABS = [
    { tb: TABLE, pal: PAL, tag: 'CABINET ONE', msgs: MESSAGES },
    { tb: TABLE_TWO, pal: PAL_EMBER, tag: 'EMBER RIDER', msgs: MESSAGES_EMBER },
]
// Mini-cabinet card geometry on the 360x600 attract field (#3232).
const CARD_W = 150, CARD_H = 250
const CARDS = [{ x: 18, y: 210 }, { x: 192, y: 210 }]

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
        case 'kickback': // #3250: solenoid snap + a harder, higher launch than the kicker
            a.playNoise(0.05, 0.16); a.playSweep(140, 920, 0.14, 'square', 0.13); a.playTone(880, 0.05, 'square', 0.07, 0.1); break
        case 'plunge': a.playSweep(120, 700, 0.22, 'triangle', 0.14); break
        case 'ratchet': a.playTone(160 + 460 * (ev.power || 0), 0.02, 'square', 0.06); a.playNoise(0.015, 0.05); break
        case 'drain': a.playSweep(420, 70, 0.35, 'sawtooth', 0.12); a.playNoise(0.15, 0.1); break
        case 'bonus':
            a.playTone(523, 0.05, 'square', 0.08); a.playTone(659, 0.05, 'square', 0.08, 0.06)
            a.playTone(784, 0.09, 'square', 0.09, 0.12); break
        case 'tiltwarn': a.playTone(220, 0.08, 'square', 0.09); break
        case 'tilt': a.playTone(180, 0.28, 'square', 0.13); break
        case 'nudge': a.playNoise(0.05, 0.07); break
        case 'ballstart': a.playTone(784, 0.06, 'square', 0.1); a.playTone(1046, 0.08, 'square', 0.1, 0.07); break
        // ---- rung 2 ----
        case 'ramp': a.playTone(980, 0.04, 'square', 0.09); break
        case 'rampset':
            a.playTone(587, 0.07, 'square', 0.1); a.playTone(740, 0.07, 'square', 0.1, 0.06)
            a.playTone(880, 0.1, 'square', 0.11, 0.12); break
        // lane rollovers step up a pitch ladder with the sweep: each of the
        // three LANE rollovers rings brighter than the last, so the descent
        // teaches its own progress by ear (#3178)
        case 'lane': a.playTone(1240 + 240 * (ev.i || 0), 0.035, 'square', 0.08); break
        case 'lanesweep':
            a.playTone(740, 0.06, 'square', 0.1); a.playTone(988, 0.1, 'square', 0.11, 0.05); break
        case 'lock': a.playTone(196, 0.12, 'square', 0.14); a.playNoise(0.06, 0.12, 0.15); break
        case 'multiball':
            [523, 659, 784, 1046].forEach((f, i) => a.playTone(f, 0.1, 'square', 0.11, i * 0.09))
            a.playSweep(180, 720, 0.3, 'sawtooth', 0.12); break
        case 'save': a.playSweep(330, 880, 0.22, 'triangle', 0.12); break
        case 'extraball': a.playTone(1318, 0.08, 'square', 0.1); a.playTone(1568, 0.12, 'square', 0.1, 0.08); break
        case 'extraballpaid':
            [784, 988, 1175].forEach((f, i) => a.playTone(f, 0.09, 'square', 0.1, i * 0.08)); break
        case 'packdrain': a.playNoise(0.08, 0.08); break
        case 'ballhit': // steel on steel (#3217): bright short clack, pitched by impact
            a.playTone(1750 + 650 * Math.min(1, (ev.v || 0) / 500), 0.035, 'triangle', 0.08);
            a.playTone(2600, 0.02, 'square', 0.05, 0.01); a.playNoise(0.012, 0.05); break
        case 'feed': a.playSweep(140, 420, 0.14, 'triangle', 0.08); break
        case 'gameover':
            [392, 311, 262, 196].forEach((f, i) => a.playTone(f, 0.14, 'square', 0.1, i * 0.13)); break
        // ---- rung 3 ----
        case 'curl': a.playSweep(300, 720, 0.16, 'triangle', 0.08); a.playNoise(0.04, 0.05); break
        case 'orbitarm': a.playTone(1180, 0.03, 'square', 0.07); break
        // magnet grab: a gentler triangle sweep + a breath of air, no sawtooth snarl —
        // it must not mask the chain it feeds into.
        case 'maggrab': a.playSweep(520, 220, 0.10, 'triangle', 0.07); a.playNoise(0.04, 0.05); break
        // orbit completion: a low kick under the triad — bigger than a lane rollover
        case 'orbit':
            a.playTone(196, 0.12, 'square', 0.09);
            [523, 659, 784].forEach((f, i) => a.playTone(f, 0.06, 'square', 0.1, i * 0.05 + 0.02))
            a.playNoise(0.04, 0.06); break
        // orbit set: low kick + triad — louder than the routine ramp set
        case 'orbitset':
            a.playTone(147, 0.15, 'square', 0.1);
            [587, 740, 880, 1175].forEach((f, i) => a.playTone(f, 0.08, 'square', 0.11, i * 0.07 + 0.02)); break
        // orbit lock: a low thump under the ring — chunky, not glassy
        case 'orbitlock':
            a.playTone(98, 0.16, 'sawtooth', 0.09)
            a.playTone(196, 0.12, 'square', 0.14); a.playSweep(900, 300, 0.18, 'sawtooth', 0.08); break
        case 'magfree':
            a.playSweep(320, 1568, 0.12, 'square', 0.09); a.playNoise(0.03, 0.06); break
        case 'magready': a.playTone(1568, 0.05, 'square', 0.05); break
        case 'start': a.playTone(392, 0.07, 'square', 0.1); a.playTone(523, 0.07, 'square', 0.1, 0.07); a.playTone(659, 0.1, 'square', 0.1, 0.14); break
        // cabinet select click (#3232): a dry relay tick, not a jingle
        case 'cabinet': a.playTone(460, 0.025, 'square', 0.07); a.playNoise(0.012, 0.05); break
        default: break
    }
}

const mkFlash = (tb) => ({
    bumpers: tb.bumpers.map(() => 0), slings: tb.slings.map(() => 0), targets: tb.targets.map(() => 0),
    bank: 0, spinner: 0, drain: 0, tilt: 0, ramp: 0, lane: tb.laneRollovers.map(() => 0), lock: 0, mb: 0,
    flash: 0, // #3178 tower-kick white-out
    orbit: 0, orbitArm: 0, mag: 0, magFree: 0,
    kb: 0, // #3250 kickback pop
})

const PinballGame = () => {
    const canvasRef = useRef(null)
    // #1473 seed pin: a filed report carries the seed, feedbackreplay opens
    // `/pinball?seed=N` — honor it at every human start, keep own RNG otherwise.
    const freshSeed = () => (seedFromQuery() ?? (Date.now() >>> 0))
    const cabRef = useRef(0)                    // selected cabinet (#3232), persists across games
    const [cabIdx, setCabIdx] = useState(0)
    const gsRef = useRef(makeGame(freshSeed()))
    const keysRef = useRef({ left: false, right: false, a: false, down: false, b: false })
    const partsRef = useRef([])
    const flashRef = useRef(mkFlash(TABLE))
    const shakeRef = useRef(0)
    const mbBedRef = useRef(false)
    const trailRef = useRef([])
    const ringsRef = useRef([])  // rung 3: expanding event rings (presentation only)
    const fieldsRef = useRef({}) // painted playfield canvas per cabinet id
    const screenRef = useRef('attract')
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    screenRef.current = screen

    const setCab = useCallback((i) => {
        const j = i ? 1 : 0
        if (j === cabRef.current) return
        cabRef.current = j; setCabIdx(j)
        sfxFor({ type: 'cabinet' })
    }, [])

    const startPlay = useCallback((cab = cabRef.current) => {
        cabRef.current = cab ? 1 : 0; setCabIdx(cabRef.current)
        const tb = CABS[cabRef.current].tb
        gsRef.current = makeGame(freshSeed(), cabRef.current)
        flashRef.current = mkFlash(tb)
        partsRef.current = []
        trailRef.current = []
        screenRef.current = 'play'; setScreen('play')
        sfxFor({ type: 'start' })
    }, [])

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = W; cvs.height = H
        const ctx = cvs.getContext('2d')
        ctx.imageSmoothingEnabled = true
        const fieldFor = (tb) => {
            if (!fieldsRef.current[tb.id]) {
                const f = document.createElement('canvas')
                f.width = W; f.height = H
                paintField(f.getContext('2d'), W, H, CABS[cabIndexOf(tb.id)].pal, tb)
                fieldsRef.current[tb.id] = f
            }
            return fieldsRef.current[tb.id]
        }
        fieldFor(TABLE); fieldFor(TABLE_TWO)

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

        const spawnRing = (x, y, color, max = 34, ticks = 16) => {
            ringsRef.current.push({ x, y, color, t: 0, ticks, max })
        }

        const spawn = (x, y, n, color, spd = 130) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = spd * (0.4 + Math.random() * 0.8)
                partsRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.3, color })
            }
        }

        const react = (gs) => {
            const fl = flashRef.current
            const tb = gs.table, pal = CABS[cabIndexOf(tb.id)].pal, v = tb.view
            for (const ev of gs.events) {
                sfxFor(ev)
                if (ev.type === 'bumper') { fl.bumpers[ev.i] = 9; spawn(ev.x, ev.y, 10, pal.hot, 190) }
                else if (ev.type === 'sling') { fl.slings[ev.i] = 7; spawn(ev.x, ev.y, 6, pal.sling, 150) }
                else if (ev.type === 'target') { fl.targets[ev.i] = 8; spawn(ev.x, ev.y, 7, pal.neon) }
                else if (ev.type === 'bank') { fl.bank = 40; shakeRef.current = Math.max(shakeRef.current, 5) }
                else if (ev.type === 'spinner') { fl.spinner = 6; spawn(ev.x, ev.y, 3, pal.glow, 90) }
                else if (ev.type === 'kicker') { spawn(ev.x, ev.y, 12, pal.lane, 220) }
                // #3250 kickback: the loudest rescue on the table — plunger pop,
                // ring, upward shower and a shake (it saves the ball from death)
                else if (ev.type === 'kickback') {
                    fl.kb = 18; shakeRef.current = Math.max(shakeRef.current, 8)
                    spawn(ev.x, ev.y, 16, pal.hot, 260)
                    spawnRing(ev.x, ev.y, pal.hot, 30, 16)
                }
                else if (ev.type === 'plunge') { spawn(tb.plunger.x, tb.plunger.restY, 8, pal.chrome, 120) }
                else if (ev.type === 'ratchet') { spawn(tb.plunger.x, 566 + (ev.power || 0) * 14, 2, pal.chrome, 60) }
                else if (ev.type === 'drain') { shakeRef.current = 10; fl.drain = 24 }
                else if (ev.type === 'tilt') { fl.tilt = 90; shakeRef.current = 14 }
                else if (ev.type === 'ramp') { fl.ramp = 8; spawn(ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'rampset') { fl.ramp = 20; shakeRef.current = Math.max(shakeRef.current, 3) }
                else if (ev.type === 'lane') { fl.lane[ev.i] = 8; spawn(v.laneCx, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'lanesweep') { shakeRef.current = Math.max(shakeRef.current, 3) }
                else if (ev.type === 'lock') { fl.lock = 16; shakeRef.current = Math.max(shakeRef.current, 4) }
                else if (ev.type === 'multiball') {
                    fl.mb = 90; fl.flash = 14; shakeRef.current = Math.max(shakeRef.current, 12)
                    // the tower mouth erupts: a ring + shower from each kick port so the
                    // pack-off lands on a 6-inch screen, not only at desk width (#3178)
                    for (const k of tb.mbKick) { spawnRing(k.x, k.y, pal.glow, 26, 14); spawn(k.x, k.y, 14, pal.glow, 220) }
                }
                // ---- rung 3 (messages are SIM state now — drawn by the DMD) ----
                else if (ev.type === 'curl') spawn(ev.x, ev.y, 4, pal.glow, 90)
                else if (ev.type === 'orbitarm') { fl.orbitArm = 8; spawn(ev.x, ev.y, 6, pal.lane, 100) }
                // orbit completion: a bigger punch than a lane rollover — ring + shower + shake
                else if (ev.type === 'orbit') {
                    fl.orbit = 20; shakeRef.current = Math.max(shakeRef.current, 6)
                    spawn(ev.x, ev.y, 18, pal.lane, 200)
                    spawnRing(ev.x, ev.y, pal.lane, 34, 16)
                }
                // orbit set: the set wave off the done pad — stronger than a ramp set
                else if (ev.type === 'orbitset') {
                    fl.orbit = 34; shakeRef.current = Math.max(shakeRef.current, 8)
                    spawn(tb.orbit.donePad.x, tb.orbit.donePad.y, 16, pal.lane, 180)
                    spawnRing(tb.orbit.donePad.x, tb.orbit.donePad.y, pal.hot, 40, 18)
                }
                // orbit lock: chunky ring + shower at the done pad
                else if (ev.type === 'orbitlock') {
                    fl.orbit = 28; shakeRef.current = Math.max(shakeRef.current, 7)
                    const dx = ev.x ?? tb.orbit.donePad.x, dy = ev.y ?? tb.orbit.donePad.y
                    spawn(dx, dy, 14, pal.hot, 180)
                    spawnRing(dx, dy, pal.hot, 36, 18)
                }
                else if (ev.type === 'maggrab') { fl.mag = 14; spawn(ev.x, ev.y, 8, pal.mag, 120) }
                // magfree snap deserves the same treatment as an orbit beat
                else if (ev.type === 'magfree') {
                    fl.magFree = 18; shakeRef.current = Math.max(shakeRef.current, 2)
                    spawn(ev.x, ev.y, 16, pal.mag, 190)
                    spawnRing(ev.x, ev.y, pal.mag, 30, 16)
                }
                else if (ev.type === 'magready') { fl.mag = 8 }
                else if (ev.type === 'ballhit') spawn(ev.x, ev.y, 5, pal.chrome, 150)
            }
            gs.events.length = 0
        }

        // ---------------------------------------------------------------- draw ----
        const drawTable = (gs) => {
            const tb = gs.table, pal = CABS[cabIndexOf(tb.id)].pal, v = tb.view
            ctx.save()
            if (shakeRef.current > 0) {
                ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current)
                shakeRef.current = Math.max(0, shakeRef.current - 0.7)
            }
            ctx.drawImage(fieldFor(tb), 0, 0)

            // cabinet rail + arc wall
            ctx.strokeStyle = pal.wood; ctx.lineWidth = 10; ctx.lineCap = 'round'
            ctx.beginPath()
            const arc = tb.arc
            for (let i = 0; i <= arc.segs; i++) {
                const a = arc.from + (arc.to - arc.from) * (i / arc.segs)
                const x = arc.cx + Math.cos(a) * arc.rx, y = arc.cy + Math.sin(a) * arc.ry
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            }
            ctx.stroke()
            ctx.strokeStyle = pal.woodHi; ctx.lineWidth = 3; ctx.stroke()

            // side walls / lane / aprons — neon-roped rubber look
            ctx.strokeStyle = pal.chrome; ctx.lineWidth = 3
            for (const w of tb.walls) {
                ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke()
            }
            const og = tb.outlaneGuide
            ctx.beginPath(); ctx.moveTo(og.x1, og.y1); ctx.lineTo(og.x2, og.y2); ctx.stroke()

            // lane guide glow down the launch lane
            ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(gs.tick / 8)
            ctx.strokeStyle = pal.lane; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(tb.plunger.x, 520); ctx.lineTo(tb.plunger.x, 210); ctx.stroke()
            ctx.restore()

            const fl = flashRef.current
            Object.keys(fl).forEach((k) => { if (Array.isArray(fl[k])) fl[k] = fl[k].map((x) => Math.max(0, x - 1)); else fl[k] = Math.max(0, fl[k] - 1) })

            // ---- rung 2: firelane lamp set + rollover rings + lock tower ----
            {
                const lit = gs.lockFlash > 0 || gs.mbFlash > 0
                // lane rope glow while the lane is armed (pulses when a lock is banked)
                ctx.save()
                ctx.globalAlpha = 0.22 + 0.18 * Math.sin(gs.tick / 9) + (lit ? 0.25 : 0)
                ctx.strokeStyle = pal.lane; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(v.laneCx, 200); ctx.lineTo(v.laneCx, 430); ctx.stroke()
                ctx.restore()
                // descending LANE rollovers
                tb.laneRollovers.forEach((lr, i) => {
                    const glow = fl.lane[i]
                    ctx.save()
                    ctx.strokeStyle = glow > 0 ? '#ffffff' : pal.lane
                    ctx.globalAlpha = glow > 0 ? 0.95 : 0.5
                    ctx.lineWidth = 2.5
                    ctx.beginPath(); ctx.arc(v.laneCx, lr.y, 7, 0, 7); ctx.stroke()
                    if (glow > 0) { ctx.shadowColor = pal.lane; ctx.shadowBlur = 14; ctx.stroke() }
                    ctx.restore()
                })
                // RAMP rollovers in the launch lane
                tb.rampRollovers.forEach((rr) => {
                    ctx.save()
                    ctx.strokeStyle = fl.ramp > 0 ? '#ffffff' : pal.lane
                    ctx.globalAlpha = fl.ramp > 0 ? 0.95 : 0.45
                    ctx.lineWidth = 2.5
                    ctx.beginPath(); ctx.arc(v.rampCx, rr.y, 7, 0, 7); ctx.stroke()
                    ctx.restore()
                })
                // lock tower — a chrome gate housing with three lock lamps
                ctx.save()
                const tg = ctx.createLinearGradient(v.towerX1, 0, v.towerX2, 0)
                tg.addColorStop(0, 'rgba(201,212,232,0.25)'); tg.addColorStop(0.5, 'rgba(201,212,232,0.08)'); tg.addColorStop(1, 'rgba(201,212,232,0.25)')
                ctx.fillStyle = tg
                ctx.beginPath(); ctx.moveTo(v.towerX1, v.lockBase); ctx.lineTo(v.towerX2, v.lockBase); ctx.lineTo(v.towerIn2, v.lockTop); ctx.lineTo(v.towerIn1, v.lockTop); ctx.closePath(); ctx.fill()
                ctx.strokeStyle = pal.chrome; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(v.towerX1, v.lockBase); ctx.lineTo(v.towerIn1, v.lockTop); ctx.lineTo(v.towerIn2, v.lockTop); ctx.lineTo(v.towerX2, v.lockBase); ctx.stroke()
                for (let i = 0; i < tb.lock.need; i++) {
                    const on = i < gs.locks
                    const pulse = on && (gs.tick >> 3) % 2 === 0
                    ctx.fillStyle = on ? (pulse ? '#ffffff' : pal.hot) : pal.hotOff
                    if (on) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 10 }
                    ctx.beginPath(); ctx.arc(v.lampX0 + i * v.lockLampStep, v.lampY, v.lockLampR, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                }
                if (fl.lock > 0) {
                    const rg = ctx.createRadialGradient(v.lockCx, v.lockGlowY, 4, v.lockCx, v.lockGlowY, 34)
                    rg.addColorStop(0, `rgba(${pal.hotRgb},${0.5 * (fl.lock / 16)})`); rg.addColorStop(1, `rgba(${pal.hotRgb},0)`)
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(v.lockCx, v.lockGlowY, 34, 0, 7); ctx.fill()
                }
                ctx.restore()
            }
            // ---- rung 3: orbit pads + bank lamps + magnet post ----
            {
                const armed = gs.pucks.some((p) => p.orbitArmed)
                const S = tb.orbit.ch.side
                // climbing-rail glow while a ball is armed for the wrap:
                // a thicker rail + 3 chevrons sweeping up the channel
                if (armed) {
                    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(gs.tick / 6)
                    ctx.strokeStyle = pal.lane; ctx.lineWidth = 3
                    ctx.beginPath(); ctx.moveTo(v.railCx, v.chBot); ctx.lineTo(v.railCx, v.chTop + 3); ctx.stroke()
                    ctx.restore()
                    ctx.save(); ctx.globalAlpha = 0.75; ctx.lineWidth = 2.5
                    ctx.strokeStyle = pal.lane
                    for (let i = 0; i < 3; i++) {
                        const yy = v.chBot - ((gs.tick * 2.2 + i * 85) % (v.chBot - v.chTop + 27))
                        if (yy < v.chTop + 3) continue
                        ctx.beginPath(); ctx.moveTo(v.railCx - v.chevSplay * S, yy); ctx.lineTo(v.railCx, yy - 12); ctx.lineTo(v.railCx + v.chevSplay * S, yy); ctx.stroke()
                    }
                    ctx.restore()
                }
                // arm pad — hot while armed
                ctx.save()
                const al = armed || fl.orbitArm > 0
                ctx.strokeStyle = al ? '#ffffff' : pal.lane
                ctx.globalAlpha = al ? 0.95 : 0.45
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(tb.orbit.armPad.x, tb.orbit.armPad.y, 8, 0, 7); ctx.stroke()
                if (al) { ctx.shadowColor = pal.lane; ctx.shadowBlur = 18; ctx.stroke() }
                ctx.restore()
                // done pad — hot while the set is lit / just scored
                ctx.save()
                const dl = gs.orbitLit || fl.orbit > 0
                ctx.strokeStyle = dl ? pal.hot : pal.lane
                ctx.globalAlpha = dl ? 0.95 : 0.45
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(tb.orbit.donePad.x, tb.orbit.donePad.y, 8, 0, 7); ctx.stroke()
                if (dl) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 18; ctx.stroke() }
                ctx.restore()
                // orbit bank lamps, seated under the DMD insert
                for (let i = 0; i < tb.orbit.need; i++) {
                    const on = gs.orbitLit || i < gs.orbitBank
                    const pulse = on && (gs.tick >> 3) % 2 === 0
                    ctx.fillStyle = on ? (pulse ? '#ffffff' : pal.hot) : pal.hotOff
                    if (on) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 8 }
                    ctx.beginPath(); ctx.arc(v.orbitLampX0 + i * 12, 276, 3, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                }
                // magnet post — halo pulses while armed; energy tether
                // and bloom while it holds a ball; dull when spent.
                {
                    const M = tb.magnet
                    const held = gs.magHold > 0
                    const charge = gs.magCharge > 0
                    ctx.save()
                    if (charge) {
                        ctx.globalAlpha = 0.14 + 0.1 * Math.sin(gs.tick / 5)
                        ctx.strokeStyle = pal.mag; ctx.lineWidth = 2
                        ctx.beginPath(); ctx.arc(M.x, M.y, M.field * (0.7 + 0.3 * Math.sin(gs.tick / 9)), 0, 7); ctx.stroke()
                    }
                    if (held) {
                        const rg = ctx.createRadialGradient(M.x, M.y, 4, M.x, M.y, 30)
                        rg.addColorStop(0, `rgba(${pal.magRgb},0.55)`); rg.addColorStop(1, `rgba(${pal.magRgb},0)`)
                        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(M.x, M.y, 30, 0, 7); ctx.fill()
                        const hp = gs.pucks.find((p) => p.magHeld)
                        if (hp) {
                            ctx.globalAlpha = 0.7; ctx.strokeStyle = pal.mag; ctx.lineWidth = 1.5
                            ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(hp.bx, hp.by); ctx.stroke()
                        }
                    }
                    ctx.globalAlpha = 1
                    if (fl.mag > 0) { ctx.shadowColor = pal.mag; ctx.shadowBlur = 16 }
                    ctx.fillStyle = charge ? pal.mag : pal.magOff
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                    ctx.strokeStyle = pal.chrome; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r + 2.5, 0, 7); ctx.stroke()
                    ctx.fillStyle = pal.chrome; ctx.beginPath(); ctx.arc(M.x, M.y, 2.5, 0, 7); ctx.fill()
                    ctx.restore()
                }
            }
            tb.bumpers.forEach((b, i) => {
                const glow = fl.bumpers[i]
                ctx.save()
                if (glow > 0) {
                    const rg = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + 26)
                    rg.addColorStop(0, `rgba(${pal.hotRgb},${0.5 * (glow / 9)})`); rg.addColorStop(1, `rgba(${pal.hotRgb},0)`)
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, 0, 7); ctx.fill()
                }
                ctx.strokeStyle = pal.chrome; ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, 7); ctx.stroke()
                const cap = ctx.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, b.r)
                cap.addColorStop(0, glow > 0 ? '#ffffff' : pal.capHi); cap.addColorStop(1, pal.hot)
                ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
                ctx.restore()
            })

            // slingshots
            tb.slings.forEach((s, i) => {
                ctx.save()
                if (fl.slings[i] > 0) { ctx.shadowColor = pal.sling; ctx.shadowBlur = 14 }
                ctx.strokeStyle = pal.sling; ctx.lineWidth = 6; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke()
                ctx.restore()
            })

            // drop targets: up = glowing bars, down = dark slots
            tb.targets.forEach((tp, i) => {
                const down = gs.targetDown[i]
                ctx.save()
                if (down) {
                    ctx.fillStyle = 'rgba(10,14,30,0.9)'
                    ctx.fillRect(tp.x1, tb.targetY - 3, tp.x2 - tp.x1, 6)
                } else {
                    if (fl.targets[i] > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 }
                    ctx.fillStyle = fl.bank > 0 ? '#9ff3ff' : pal.neon
                    ctx.fillRect(tp.x1, tb.targetY - 3, tp.x2 - tp.x1, 6)
                    ctx.fillStyle = 'rgba(255,255,255,0.7)'
                    ctx.fillRect(Math.min(tp.x1, tp.x2) + 2, tb.targetY - 2, 3, 4)
                }
                ctx.restore()
            })

            // rung 3: the DMD insert — text is SIM state (gs.msg); when idle
            // it crawls live status. Balls roll over it like glass over LEDs.
            drawDMD(ctx, {
                text: gs.msg.t > 0 ? gs.msg.text : '', t: gs.msg.t, T: gs.msg.T || 0, tick: gs.tick,
                idle: dmdIdle(gs.score, gs.mult, gs.balls, gs.locks, gs.orbitBank, gs.orbitLit, gs.magCharge)[Math.floor(gs.tick / 96) % 4],
            }, pal)

            // spinner (outlane): tilts while a ball passes through
            const p0 = gs.pucks[0] || { spin: 0, spinArm: true }
            const sp = tb.spinner
            ctx.save()
            ctx.translate(v.spinnerX, (sp.yFrom + sp.yTo) / 2)
            ctx.rotate(p0.spinArm ? 0.4 : 0.4 + (p0.spin / sp.pxPerTurn) * Math.PI * 2 + gs.spinnerTurns * 0.6)
            ctx.fillStyle = fl.spinner > 0 ? '#ffffff' : pal.chrome
            ctx.fillRect(-2, -14, 4, 28)
            ctx.restore()
            // kicker mouth
            ctx.fillStyle = `rgba(${pal.kickerRgb},${0.25 + 0.2 * Math.sin(gs.tick / 7)})`
            ctx.beginPath(); ctx.moveTo(v.outMouthX1, 505); ctx.lineTo(v.outMouthX2, 505); ctx.lineTo(v.outMouthTip, 526); ctx.closePath(); ctx.fill()

            // #3250 KICKBACK — chrome button in a rubber ring at the drain mouth,
            // armed-pulse while its one save per ball is live, plunger pop on fire.
            const KB = tb.kb
            const kbCx = (KB.x1 + KB.x2) / 2, kbCy = KB.yFrom - 3
            const kbArmed = !gs.kbUsed && gs.launched && !gs.done
            const kbLit = fl.kb > 0
            ctx.save()
            if (kbLit) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 }
            else if (kbArmed) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 8 + 5 * Math.sin(gs.tick / 6) }
            // plunger shaft pops up through the ring on fire
            if (kbLit) {
                ctx.fillStyle = pal.chrome
                ctx.fillRect(kbCx - 4, kbCy - (fl.kb / 18) * 10, 8, (fl.kb / 18) * 10 + 4)
            }
            // rubber ring
            ctx.strokeStyle = kbLit ? '#ffffff' : (kbArmed ? pal.hot : 'rgba(148,163,184,0.5)')
            ctx.lineWidth = 3
            ctx.beginPath(); ctx.arc(kbCx, kbCy, 7.5, 0, 7); ctx.stroke()
            // chrome face
            ctx.fillStyle = kbLit ? '#ffffff' : (kbArmed ? `rgba(${pal.hotRgb},${0.55 + 0.3 * Math.sin(gs.tick / 6)})` : 'rgba(148,163,184,0.35)')
            ctx.beginPath(); ctx.arc(kbCx, kbCy, 4.5, 0, 7); ctx.fill()
            ctx.restore()

            // flippers — chrome capsules
            const f = tb.flippers
            ;['L', 'R'].forEach((side) => {
                const px = side === 'L' ? f.L.px : f.R.px
                const a = gs.ang[side] * Math.PI / 180
                ctx.save()
                ctx.shadowColor = pal.glow; ctx.shadowBlur = gs.angV[side] !== 0 ? 12 : 4
                ctx.strokeStyle = gs.tilt ? '#5a6478' : pal.chrome
                ctx.lineWidth = f.halfW * 2; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(px, f.pivotY); ctx.lineTo(px + Math.cos(a) * f.len, f.pivotY + Math.sin(a) * f.len); ctx.stroke()
                ctx.fillStyle = pal.woodHi; ctx.beginPath(); ctx.arc(px, f.pivotY, 5, 0, 7); ctx.fill()
                ctx.restore()
            })

            // plunger: spring + power meter
            const pPull = gs.launched ? 0 : gs.power
            ctx.strokeStyle = pal.chrome; ctx.lineWidth = 4
            ctx.beginPath(); ctx.moveTo(tb.plunger.x, 564 + pPull * 14); ctx.lineTo(tb.plunger.x, 586 + pPull * 14); ctx.stroke()
            if (!gs.launched && gs.power > 0.02) {
                ctx.fillStyle = pal.hot
                ctx.fillRect(v.meterX, 592 - 60 * gs.power, 6, 60 * gs.power)
            }

            // trails + every live ball (MULTIBALL draws the whole pack)
            if (gs.pucks.length) {
                trailRef.current.push({ x: gs.pucks[0].bx, y: gs.pucks[0].by })
                if (trailRef.current.length > 7) trailRef.current.shift()
                trailRef.current.forEach((p, i) => {
                    const a = (i / trailRef.current.length) * 0.28
                    ctx.fillStyle = `rgba(${pal.trailRgb},${a.toFixed(3)})`
                    ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.5 + 0.5 * i / trailRef.current.length), 0, 7); ctx.fill()
                })
            } else trailRef.current.length = 0
            for (const p of gs.pucks) {
                const bg = ctx.createRadialGradient(p.bx - 3, p.by - 4, 1, p.bx, p.by, BALL_R)
                bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#aab8cf'); bg.addColorStop(1, '#39435a')
                ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.bx, p.by, BALL_R, 0, 7); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.beginPath(); ctx.arc(p.bx - 3, p.by - 4, 2.2, 0, 7); ctx.fill()
            }

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

            // rung 3: expanding event rings (orbit beats, mag snap)
            ringsRef.current = ringsRef.current.filter((r) => r.t < r.ticks)
            for (const r of ringsRef.current) {
                r.t += 1
                const p = r.t / r.ticks
                const rad = 6 + r.max * p
                ctx.globalAlpha = (1 - p) * 0.8
                ctx.strokeStyle = r.color
                ctx.lineWidth = 2.5
                ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke()
            }
            ctx.globalAlpha = 1

            // tower-kick white-out (#3178): the instant the pack is loose the whole
            // cabinet blinks — the MULTIBALL moment has to read at phone width
            if (fl.flash > 0) {
                ctx.fillStyle = `rgba(255,255,255,${(0.38 * fl.flash / 14).toFixed(3)})`
                ctx.fillRect(0, 0, W, H)
            }

            // HUD — 7-seg score centred (corner clearance law #2899 respected)
            ctx.fillStyle = 'rgba(4,6,16,0.72)'
            ctx.fillRect(SCORE_X - 12, SCORE_Y - 10, SCORE_DIGITS * 22 + 24, 44)
            const sc = String(Math.min(999999, gs.score)).padStart(SCORE_DIGITS, '0')
            for (let i = 0; i < SCORE_DIGITS; i++) drawSevenSeg(ctx, SCORE_X + i * 22, SCORE_Y, +sc[i], pal.score, fl.drain > 0 && fl.drain % 2 === 0)
            // balls + mult lamps
            const lampN = Math.max(tb.balls, Math.min(9, gs.balls))
            for (let i = 0; i < lampN; i++) {
                ctx.fillStyle = i < gs.balls ? pal.glow : pal.glowOff
                ctx.beginPath(); ctx.arc(SCORE_X + SCORE_DIGITS * 22 + 10, SCORE_Y + 6 + i * 12, 4, 0, 7); ctx.fill()
            }
            // rung 2: lock bank lamps + MULTIBALL banner
            for (let i = 0; i < tb.lock.need; i++) {
                ctx.fillStyle = i < gs.locks ? pal.hot : pal.hotOff
                ctx.beginPath(); ctx.arc(SCORE_X + SCORE_DIGITS * 22 + 26, SCORE_Y + 6 + i * 12, 4, 0, 7); ctx.fill()
            }
            if (gs.multiball && (gs.tick >> 4) % 2 === 0) {
                ctx.fillStyle = pal.hot; ctx.font = 'bold 13px monospace'
                ctx.fillText('MULTIBALL x2', 180, SCORE_Y + 54)
            }
            ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
            ctx.fillStyle = gs.mult > 1 ? pal.hot : pal.hotDim
            ctx.fillText(`BONUS x${gs.mult}`, 180, SCORE_Y + 40)
            if (gs.nudgeMeter > 0 && !gs.tilt) {
                ctx.fillStyle = 'rgba(255,176,46,0.8)'
                ctx.fillText('~ NUDGE ~', 180, SCORE_Y + 54)
            }
            if (fl.tilt > 0 && fl.tilt % 8 < 4) {
                ctx.fillStyle = pal.hot; ctx.font = 'bold 26px monospace'
                ctx.fillText('TILT', 180, 360)
            }
            ctx.restore()
        }

        // ---- attract: the ROW OF CABINETS (#3232) ----
        const drawAttract = (t) => {
            const sel = cabRef.current
            ctx.fillStyle = '#04060f'; ctx.fillRect(0, 0, W, H)
            // living preview: the selected playfield, dimmed, with the demo ball
            ctx.save(); ctx.globalAlpha = 0.24
            ctx.drawImage(fieldFor(CABS[sel].tb), 0, 0)
            ctx.restore()
            {
                const tb = CABS[sel].tb
                const a = Math.PI + (Math.sin(t / 700) * 0.5 + 0.5) * Math.PI
                const bx = tb.arc.cx + Math.cos(a) * tb.arc.rx
                const by = tb.arc.cy + Math.sin(a) * tb.arc.ry + BALL_R + 6
                ctx.save(); ctx.globalAlpha = 0.55
                const bg = ctx.createRadialGradient(bx - 3, by - 4, 1, bx, by, BALL_R)
                bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#39435a')
                ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, 7); ctx.fill()
                ctx.restore()
            }
            ctx.save(); ctx.textAlign = 'center'
            ctx.font = 'bold 34px monospace'
            ctx.shadowColor = PAL.neon; ctx.shadowBlur = 16 + 6 * Math.sin(t / 350)
            ctx.fillStyle = '#e9fbff'
            ctx.fillText('PINBALL', 180, 116)
            ctx.font = 'bold 13px monospace'
            ctx.shadowColor = PAL_EMBER.lane; ctx.shadowBlur = 8
            ctx.fillStyle = 'rgba(255,223,158,0.9)'
            ctx.fillText('PICK A CABINET', 180, 142)
            ctx.restore()
            // the cabinets: lit mini playfields, selected one lifted + roped
            for (let i = 0; i < CABS.length; i++) {
                const c = CABS[i], r = CARDS[i]
                const isSel = i === sel
                const bob = isSel ? -6 + Math.sin(t / 420) * 2 : 8
                ctx.save()
                ctx.translate(r.x + CARD_W / 2, r.y + CARD_H / 2 + bob)
                const s = isSel ? 1 : 0.88
                ctx.scale(s, s)
                ctx.globalAlpha = isSel ? 1 : 0.55
                ctx.fillStyle = 'rgba(4,6,16,0.92)'
                ctx.fillRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10)
                ctx.strokeStyle = isSel ? c.pal.lane : 'rgba(201,212,232,0.25)'
                ctx.lineWidth = isSel ? 2.5 : 1.5
                if (isSel) { ctx.shadowColor = c.pal.lane; ctx.shadowBlur = 14 }
                ctx.strokeRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10)
                ctx.shadowBlur = 0
                ctx.drawImage(fieldFor(c.tb), -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H)
                // marquee name plate on the card's crown
                ctx.fillStyle = 'rgba(4,6,16,0.85)'
                ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 20)
                ctx.strokeStyle = `rgba(${c.pal.hotRgb},0.5)`; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(-CARD_W / 2, -CARD_H / 2 + 20); ctx.lineTo(CARD_W / 2, -CARD_H / 2 + 20); ctx.stroke()
                ctx.fillStyle = c.pal.glow
                ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
                ctx.fillText(c.tag, 0, -CARD_H / 2 + 14)
                ctx.restore()
                // picker chevron above the selected card
                if (isSel) {
                    ctx.save()
                    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t / 260)
                    ctx.fillStyle = c.pal.lane
                    const px = r.x + CARD_W / 2, py = r.y - 20 + Math.sin(t / 420) * 2
                    ctx.beginPath(); ctx.moveTo(px - 8, py - 8); ctx.lineTo(px + 8, py - 8); ctx.lineTo(px, py + 2); ctx.closePath(); ctx.fill()
                    ctx.restore()
                }
            }
            ctx.save(); ctx.textAlign = 'center'
            if (Math.floor(t / 500) % 2 === 0) {
                ctx.font = 'bold 12px monospace'
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 6
                ctx.fillStyle = '#fff'
                ctx.fillText('◀ ▶ SWITCH · SPACE / TAP START', 180, 520)
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
            // rung 3: magnet-hold hum bed — quiet under the chain, never a drone
            if (screenRef.current === 'play' && !pausedRef.current && gs.magHold > 0) {
                audioController.startLoopVoice(80, 0.04)
                audioController.setLoopVoice(78, 0.035)
            } else {
                audioController.stopLoopVoice()
            }
            // #3178: MULTIBALL tension bed — runs while the pack is down. The
            // trigger is SIM state (gs.multiball), so the start/stop seam is
            // deterministic; pause, drain-home and game-over all cut it the same way.
            const bedOn = screenRef.current === 'play' && !pausedRef.current && gs.multiball
            if (bedOn && !mbBedRef.current) { audioController.startMusic('pinballMb'); audioController.setMusicLevel(0.55); mbBedRef.current = true }
            else if (!bedOn && mbBedRef.current) { audioController.stopMusic(); mbBedRef.current = false }
            ctx.clearRect(0, 0, W, H)
            if (screenRef.current === 'attract') drawAttract(now)
            else drawTable(gs)
        }
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------------- input ----
        const startable = () => screenRef.current === 'attract' || screenRef.current === 'over'
        const onKeyDown = (e) => {
            if (e.repeat) return
            if (e.code === 'Escape' || e.code === 'QuestionMark' || e.key === '?' || e.code === 'Backquote') {
                if (screenRef.current === 'play') setPaused((p) => !p)
                return
            }
            if (startable()) {
                // the row of cabinets answers the arrows first (#3232): in
                // attract they switch picks; at GAME OVER they step back to the
                // row. SPACE/tap keeps the original quick-retry on the same cab.
                if (screenRef.current === 'attract' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) { setCab(0); e.preventDefault(); return }
                if (screenRef.current === 'attract' && (e.code === 'ArrowRight' || e.code === 'KeyD')) { setCab(1); e.preventDefault(); return }
                if (screenRef.current === 'over' && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
                    if (e.code === 'ArrowLeft' || e.code === 'KeyA') setCab(0); else setCab(1)
                    screenRef.current = 'attract'; setScreen('attract'); e.preventDefault(); return
                }
                if (!paused) startPlay()
                return
            }
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
        const onPointer = (e) => {
            if (pausedRef.current || !startable()) return
            if (screenRef.current === 'over') { screenRef.current = 'attract'; setScreen('attract'); return }
            // tap a cabinet card to pick AND start it in one input (#3232)
            const rect = cvs.getBoundingClientRect()
            const px = (e.clientX - rect.left) * (W / rect.width)
            const py = (e.clientY - rect.top) * (H / rect.height)
            for (let i = 0; i < CARDS.length; i++) {
                const r = CARDS[i]
                if (px >= r.x - 8 && px <= r.x + CARD_W + 8 && py >= r.y - 26 && py <= r.y + CARD_H + 12) { cabRef.current = i; setCabIdx(i); startPlay(i); return }
            }
            startPlay()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        cvs.addEventListener('pointerdown', onPointer)

        // #1200 feedback report (production build too): the in-game report
        // button files live state so a report can be replayed at ?seed=N.
        exposeFeedbackState(() => ({ tick: gsRef.current.tick, score: gsRef.current.score, done: gsRef.current.done, seed: gsRef.current.seed, cab: gsRef.current.table.id }))

        if (import.meta.env.DEV) {
            window.__pinballTest = {
                state: () => ({ ...stateOf(gsRef.current), power: gsRef.current.power, screen: screenRef.current }),
                // dev rig: pick a cabinet without keys (#3232)
                setCab: (i) => { cabRef.current = i ? 1 : 0; setCabIdx(i); return { cab: CABS[cabRef.current].tb.id } },
                // dev rig: drop a ball straight into the firelane (visual QA of
                // the lamp set / tower / pack — the rules themselves are pinned
                // deterministically by pinballcheck in Node)
                laneDrop: () => {
                    const gs = gsRef.current
                    gs.pucks.push({ bx: gs.table.view.laneCx, by: 235, vx: 0, vy: 160, prevY: 235, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                // dev rig: feed the orbit channel / drop a ball into the magnet
                orbitFeed: () => {
                    const gs = gsRef.current
                    const bx = gs.table.view.railCx - 5 * gs.table.orbit.ch.side
                    gs.pucks.push({ bx, by: 498, vx: gs.table.kicker.vx, vy: gs.table.kicker.vy, prevY: 498, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                // dev rig: drop a ball fast down the kickback column (#3250,
                // visual QA of the pop; rules are pinned in Node by pinballcheck)
                kbDrop: () => {
                    const gs = gsRef.current
                    const KB = gs.table.kb
                    gs.pucks.push({ bx: (KB.x1 + KB.x2) / 2, by: KB.yFrom + 2, vx: 0, vy: 300, prevY: KB.yFrom + 2, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                magDrop: () => {
                    const gs = gsRef.current
                    gs.pucks.push({ bx: gs.table.magnet.x, by: gs.table.magnet.y - 40, vx: 0, vy: 60, prevY: gs.table.magnet.y - 40, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                hash: () => stateHash(gsRef.current),
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0, cabRef.current); return stateOf(gsRef.current) },
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
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0, cabRef.current); flashRef.current = mkFlash(CABS[cabRef.current].tb); screenRef.current = 'play'; setScreen('play'); return stateOf(gsRef.current) },
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
            audioController.stopLoopVoice()
            audioController.stopMusic() // #3178: never leak the multiball bed timer
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__pinballTest) delete window.__pinballTest; unexposeGame() }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay, setCab])

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <canvas ref={canvasRef} className="rounded-lg shadow-[0_0_40px_rgba(49,225,255,0.15)]" />
            {screen === 'attract' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex flex-col items-center">
                    <AttractMessage className="text-cyan-200/85 mt-2" messages={CABS[cabIdx].msgs} />
                </div>
            )}
            {screen === 'over' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <p className="font-mono text-2xl font-bold text-rose-300" style={{ textShadow: '0 0 12px rgba(255,61,94,0.8)' }}>GAME OVER</p>
                    <p className="font-mono text-sm text-amber-200">FINAL {String(gsRef.current.score).padStart(6, '0')}</p>
                    <p className="font-mono text-[11px] text-white/70">PICK A CABINET</p>
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PINBALL')} onResume={() => setPaused(false)} />}
            <VirtualControls visible={(screen === 'play' || screen === 'attract') && !paused} secondAction={{ label: 'NUDGE', code: 'KeyB' }} />
        </div>
    )
}

export default PinballGame

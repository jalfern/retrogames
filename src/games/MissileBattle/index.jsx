// MISSILE BATTLE — the arcade shell. Everything is drawn at runtime from the
// pure sim in ./sim.js: the falling warheads are the scripted saturation of
// ./waves.js, the reticle is the sim's aim, the blast that chains is the
// sim's blast, and the attract demo is the autopilot's OWN proven run
// replayed tick for tick through the real step().
//
// Layout: 1. proven script 2. painters 3. fixed-timestep loop (250 ms
// catch-up cap — the heist lesson) 4. input (arrows + Space + tap) 5. DEV
// hook + DebugKit 6. React + HUD. Pixel = sim unit at 1:1 on 256x224: the
// transform scripts/missileplay.mjs samples to prove the drawn interceptor
// sits where the physics says it is.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { W, H, CFG, makeGame, step, stateHash, SEAT_OF_CITY, SEAT_OF_BASE } from './sim.js'
import { plan, decide } from './planner.js'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { WAVES } from './waves.js'
import { PRESS, MESSAGES } from './attract.js'
import { exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(makeGame(0)).script
    return proven
}

// deterministic skyline — Math.random is a sim crime, and the renderer
// keeps the frame identical between the demo and the real run
const SKY = Array.from({ length: 40 }, (_, i) => 186 - (Math.sin(i * 2.7) * 4 + Math.sin(i * 0.9) * 3))
const STARS = Array.from({ length: 46 }, (_, i) => [(i * 97) % W, ((i * 61) % 150) + 4, 0.25 + ((i * 13) % 10) / 12])

// #2379 — blasts are MATERIAL, not one warm memory: the interceptor's
// white-hot flare, the chain pop's gold, the city plume's brick ember, the
// battery's violet spark and the rubble-puff dud all read differently.
const BLAST_HUE = { iv: '225,250,255', chain: '255,214,90', city: '255,104,66', base: '190,140,255', dud: '168,158,140' }

// #2473 sector identity: player one the cyan west, player two the amber east,
// the shared reserve a pale steel — readable at a glance, in the game's own
// night-sky palette rather than anyone else's.
const SEAT_RGB = { 1: '57,210,255', 2: '255,180,94', 0: '208,214,235' }
// #2510 item 5: the rescue beat's spark colour — the survivor's sector hue
const SEAT_HEX = { 1: '#39d2ff', 2: '#ffb45e' }

const MissileBattleGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const [watching, setWatching] = useState(false) // #1637 WATCH: the intercept solver takes the keys
    const watchingRef = useRef(false)
    const watchHeldRef = useRef(new Map()) // the solver's target reservations, live
    // #2473 — arcade 2P: solo (default, phone-honest) | coop (you + the
    // autopilot seat 2) | duo (two humans on one keyboard, one aim control,
    // alternating by turn — Jon's rule: no second touchpad, ever).
    const [mode, setModeUi] = useState('solo')
    const modeRef = useRef('solo')
    const cycleMode = () => {
        const next = modeRef.current === 'solo' ? 'coop' : modeRef.current === 'coop' ? 'duo' : 'solo'
        modeRef.current = next
        setModeUi(next)
        audioController.playTone(next === 'solo' ? 300 : next === 'coop' ? 420 : 560, 0.08, 'square', 0.05)
    }
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('missilebattle.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.mbStage = '1'
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
        // #2483 item 4: the crossed sector band strobes red when a seat
        // reaches over the line — the refusal is seen as well as heard.
        let denyFlash = 0, denyBand = -1
        // #2510 item 5: the rescue beat — a sector falls, its six tubes
        // re-light in the survivor's colour: the moment pulses for a beat,
        // the pips keep the handover for the rest of the war.
        let relight = 0, relightSeat = 0
        const keys = { l: false, r: false, u: false, d: false, f: false, fTap: false }
        const tap = { on: false, x: 128, y: 90 }
        const seatHeld = [new Map(), new Map()] // #2473 the CPU seat's own reservations
        const evLog = []
        const parts = []
        const trails = new Map()

        const say = (m) => { toastMsg = m; toast = 110 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.5 + ((i * 7) % 10) / 4
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 200) evLog.splice(0, evLog.length - 200)
            for (const e of evts) {
                if (e.type === 'ifire') audioController.playSweep(220, 880, 0.18, 'square', 0.04)
                else if (e.type === 'deny') audioController.playTone(90, 0.08, 'square', 0.05)
                else if (e.type === 'boom') { audioController.playNoise(0.08, 0.05); shake = Math.max(shake, 2) }
                else if (e.type === 'kill') {
                    audioController.playTone(e.chain ? 980 : 520, 0.05, 'square', 0.04)
                    // the kill spark carries its MATERIAL (#2379, ART.md variety)
                    const kcol = e.chain ? '#ffe27a' : e.kind === 'smart' ? '#ffd23e' : e.kind === 'bomber' ? '#7df6ff' : '#ffb37a'
                    burst(e.x, e.y, e.chain ? 10 : 6, kcol)
                    shake = Math.max(shake, e.chain ? 3 : 2)
                }
                else if (e.type === 'spent') { // the jink is used up — the bomb flashes naked
                    audioController.playTone(1240, 0.04, 'square', 0.03)
                    burst(e.x, e.y, 5, '#cdd3e0')
                }
                else if (e.type === 'split') audioController.playTone(340, 0.06, 'sawtooth', 0.03)
                else if (e.type === 'jink') audioController.playSweep(760, 240, 0.14, 'triangle', 0.035)
                else if (e.type === 'drop') audioController.playTone(180, 0.05, 'triangle', 0.03)
                else if (e.type === 'launch') audioController.playTone(e.kind === 'bomber' ? 140 : 240, 0.04, 'triangle', 0.02)
                else if (e.type === 'cityHit') { say('CITY LOST'); audioController.playSweep(220, 40, 0.5, 'sawtooth', 0.09); burst(e.x, CFG.groundY - 4, 16, '#ff5d5d'); shake = 7 }
                else if (e.type === 'baseHit') { say('BATTERY KNOCKED OUT'); audioController.playSweep(180, 50, 0.4, 'square', 0.08); shake = 6 }
                else if (e.type === 'denySeat') {
                    say(`NOT YOUR SECTOR — PLAYER ${e.seat}`)
                    // #2483 item 4: the arcade's alternating battery answers in
                    // the house two-tone (high ask, low no — the captain's idiom),
                    // not one flat buzz; the band you crossed strobes red.
                    audioController.playTone(320, 0.07, 'square', 0.06)
                    audioController.playTone(150, 0.14, 'square', 0.06)
                    denyFlash = 24; denyBand = e.x < W / 2 ? 0 : 1
                }
                else if (e.type === 'seatOut') {
                    say(`SECTOR ${e.seat} HAS FALLEN — PLAYER ${e.seat === 1 ? 2 : 1} MANS EVERY TUBE`)
                    audioController.playSweep(260, 30, 0.9, 'sawtooth', 0.1); shake = 8
                    // #2510 item 5: the rescue beat — the fallen sector's own
                    // tubes throw sparks in the SURVIVOR's colour as the
                    // handover lands; the pips keep it for the rest of the war.
                    relight = 36; relightSeat = e.seat
                    const surv = e.seat === 1 ? 2 : 1
                    gs.bases.forEach((b, bi) => {
                        if (b.alive && SEAT_OF_BASE[bi] === e.seat) burst(b.x, CFG.groundY - 8, 8, SEAT_HEX[surv])
                    })
                }
                else if (e.type === 'clear') {
                    say(e.pscore
                        ? `WAVE CLEAR — P1 ${e.pscore[0]} · P2 ${e.pscore[1]}`
                        : `WAVE CLEAR +${e.ammo * 5 + e.cities * 10}`)
                    audioController.playSweep(400, 1200, 0.4, 'square', 0.06)
                }
                else if (e.type === 'banner')
                    // #2510 item 1: the seat leaves the toast — the seat CARD
                    // (below) now ceremonies the player; the toast keeps the wave.
                    say(`${WAVES[e.wave].name} — WAVE ${e.wave + 1}`)
                else if (e.type === 'win') audioController.playSweep(400, 1600, 0.8, 'square', 0.08)
                else if (e.type === 'lose') audioController.playSweep(300, 60, 1.1, 'sawtooth', 0.1)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            // duo verdict: a sole sector still standing holds the sky; if both
            // held, the higher ledger does (the arcade's separate score columns)
            const winner = gs.twoP ? (gs.out[0] ? 2 : gs.out[1] ? 1 : (gs.pscore[0] >= gs.pscore[1] ? 1 : 2)) : 0
            setEnd({ win, score: sc, twoP: gs.twoP, pscore: gs.pscore.slice(), winner })
            if (win) localStorage.setItem('missilebattle.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
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
            if (gs.end || demoAt >= run.length) { gs = makeGame(0); demoAt = 0 }
            doSim(run[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            // #1637 WATCH: the same intercept solver missilecheck grades —
            // youngest-threat-first, battery ammo balanced, reservations held.
            if (watchingRef.current) { doSim(decide(gs, watchHeldRef.current)); keys.fTap = false; return }
            // #2473: an automated seat drives its own waves — the seat check
            // lives in the sim, so the autopilot stands down at the sector
            // line exactly like a human partner would.
            if (gs.twoP && gs.phase === 'play' && gs.cpu[gs.seat - 1]) {
                doSim(decide(gs, seatHeld[gs.seat - 1]))
                keys.fTap = false
                return
            }
            const inp = { l: keys.l, r: keys.r, u: keys.u, d: keys.d, fire: keys.f || keys.fTap }
            if (tap.on) { inp.aimTo = [tap.x, tap.y]; inp.fire = true; tap.on = false }
            doSim(inp)
            keys.fTap = false
        }

        // ---------------------------------------------------------------- paint ----
        const drawCity = (x, alive) => {
            if (alive) {
                ctx.fillStyle = '#39d2ff'
                ctx.fillRect(x - 8, CFG.groundY - 6, 16, 6)
                ctx.fillStyle = '#8fe8ff'
                ctx.beginPath(); ctx.arc(x, CFG.groundY - 6, 7, Math.PI, 0); ctx.fill()
                ctx.fillStyle = '#0a2233'
                ctx.fillRect(x - 5, CFG.groundY - 5, 2, 2); ctx.fillRect(x + 3, CFG.groundY - 5, 2, 2)
            } else {
                ctx.fillStyle = '#4d2b30'
                ctx.fillRect(x - 8, CFG.groundY - 3, 16, 3)
                ctx.fillStyle = '#6b3a3a'
                ctx.fillRect(x - 5, CFG.groundY - 5, 3, 2); ctx.fillRect(x + 2, CFG.groundY - 4, 4, 1)
            }
        }
        const drawBattery = (b, i) => {
            ctx.fillStyle = b.alive ? '#9d7bff' : '#4a3355'
            ctx.beginPath(); ctx.moveTo(b.x - 10, CFG.groundY); ctx.lineTo(b.x, CFG.groundY - 12); ctx.lineTo(b.x + 10, CFG.groundY); ctx.closePath(); ctx.fill()
            if (b.alive) {
                ctx.fillStyle = '#e8dcff'
                for (let k = 0; k < b.ammo; k++) ctx.fillRect(b.x - 9 + (k % 5) * 4, CFG.groundY - 3 - Math.floor(k / 5) * 3, 3, 2)
            }
            void i
        }
        const trailFor = (id, x, y, col) => {
            let tr = trails.get(id)
            if (!tr) { tr = { pts: [], col }; trails.set(id, tr) }
            tr.pts.push([x, y])
            if (tr.pts.length > 26) tr.pts.shift()
            return tr
        }

        const paint = () => {
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.86; if (shake < 0.4) shake = 0 }
            if (denyFlash > 0) denyFlash--
            if (relight > 0) relight--
            ctx.fillStyle = '#04040c'
            ctx.fillRect(0, 0, W, H)
            const tk = gs.tick
            for (const [x, y0, sp] of STARS) {
                ctx.fillStyle = sp > 0.8 ? '#7d8bbf' : '#333c63'
                ctx.fillRect(x, (y0 + (tk * sp * 0.08) % 150) % 154, 1.3, 1.3)
            }
            ctx.save(); ctx.translate(sx, sy)

            // ground skyline + cities + batteries
            ctx.fillStyle = '#101c2e'
            ctx.beginPath(); ctx.moveTo(0, H)
            SKY.forEach((y, i) => ctx.lineTo(i * (W / 39), y))
            ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#1c2c44'
            ctx.fillRect(0, CFG.groundY, W, H - CFG.groundY)
            for (const c of gs.cities) drawCity(c.x, c.alive)
            gs.bases.forEach((b, i) => drawBattery(b, i))
            // #2473 duo: the map is a border — cyan west, amber east, the
            // centre line pulsing in whoever's turn it is. Fallen sectors go
            // dark-red; idle tubes dim; every pip is ownership at a glance.
            if (gs.twoP) {
                ctx.fillStyle = 'rgba(57,210,255,0.45)'; ctx.fillRect(2, CFG.groundY + 3, 124, 2)
                ctx.fillStyle = 'rgba(255,180,94,0.45)'; ctx.fillRect(130, CFG.groundY + 3, W - 132, 2)
                if (gs.out[0]) { ctx.fillStyle = 'rgba(96,42,46,0.9)'; ctx.fillRect(2, CFG.groundY + 3, 124, 2) }
                if (gs.out[1]) { ctx.fillStyle = 'rgba(96,42,46,0.9)'; ctx.fillRect(130, CFG.groundY + 3, W - 132, 2) }
                // #2483 item 4: a reach across the line paints the crossed
                // sector's own band red in a quick strobe — ownership law, seen.
                if (denyFlash > 0) {
                    ctx.fillStyle = denyFlash % 6 > 2 ? 'rgba(255,64,64,0.9)' : 'rgba(255,64,64,0.35)'
                    if (denyBand === 0) ctx.fillRect(2, CFG.groundY + 3, 124, 2)
                    else ctx.fillRect(130, CFG.groundY + 3, W - 132, 2)
                }
                ctx.fillStyle = 'rgba(208,214,235,0.18)'
                for (let y = 36; y < CFG.groundY - 4; y += 9) ctx.fillRect(128, y, 1, 5)
                const pulse = 0.3 + 0.22 * Math.sin(tk * 0.2)
                ctx.fillStyle = `rgba(${SEAT_RGB[gs.seat] || '208,214,235'},${pulse.toFixed(3)})`
                for (let y = 36; y < CFG.groundY - 4; y += 9) ctx.fillRect(128, y, 1, 5)
                gs.cities.forEach((c, ci) => {
                    const rgb = SEAT_RGB[SEAT_OF_CITY[ci]]
                    ctx.fillStyle = c.alive ? `rgba(${rgb},0.9)` : `rgba(${rgb},0.3)`
                    ctx.fillRect(c.x - 1, CFG.groundY - 15, 2, 2)
                })
                // #2510 item 2: arcade sidewalls — a column of city lamps per
                // seat at the screen's outer edge; ownership reads without the
                // HUD, and each lamp dims as that seat's city dies.
                for (const s of [1, 2]) {
                    const wx = s === 1 ? 3 : W - 5
                    const rank = gs.cities.filter((c2, i2) => c2.alive && SEAT_OF_CITY[i2] === s).length
                    for (let k = 0; k < 3; k++) {
                        const rgb = SEAT_RGB[s]
                        ctx.fillStyle = k < rank ? `rgba(${rgb},0.9)` : `rgba(${rgb},0.2)`
                        ctx.fillRect(wx, CFG.groundY - 10 - k * 5, 2, 3)
                    }
                }
                gs.bases.forEach((b, i) => {
                    let own = SEAT_OF_BASE[i]
                    // #2510 item 5 (persistent): a fallen sector's tubes carry
                    // the SURVIVOR's colour — the handover is on the pip for
                    // the rest of the war, not just the moment it lands.
                    if (own > 0 && gs.out[own - 1]) own = own === 1 ? 2 : 1
                    const rgb = SEAT_RGB[own]
                    const on = b.alive && (SEAT_OF_BASE[i] === 0 || SEAT_OF_BASE[i] === gs.seat || gs.out[SEAT_OF_BASE[i] - 1])
                    ctx.fillStyle = `rgba(${rgb},${!b.alive ? 0.25 : on ? 0.95 : 0.4})`
                    ctx.fillRect(b.x - 1, CFG.groundY - 16, 2, 2)
                    if (!b.alive) {
                        ctx.strokeStyle = 'rgba(255,120,120,0.7)'
                        ctx.beginPath(); ctx.moveTo(b.x - 5, CFG.groundY - 12); ctx.lineTo(b.x + 5, CFG.groundY - 4); ctx.stroke()
                    }
                })
                // #2510 item 5 (the moment): the handover pulses — expanding
                // survivor-coloured rings over the fallen sector's own tubes.
                if (relight > 0) {
                    const surv = relightSeat === 1 ? 2 : 1
                    const a = relight / 36
                    gs.bases.forEach((b, bi) => {
                        if (SEAT_OF_BASE[bi] !== relightSeat) return
                        ctx.strokeStyle = `rgba(${SEAT_RGB[surv]},${(a * 0.9).toFixed(3)})`
                        ctx.beginPath(); ctx.arc(b.x, CFG.groundY - 6, 4 + (36 - relight) * 0.45, 0, Math.PI * 2); ctx.stroke()
                    })
                }
            }

            // enemy trails + heads (trails are renderer memory, not sim state)
            const liveIds = new Set()
            for (const e of gs.enemies) {
                liveIds.add(e.id)
                // a smart whose escapes are spent goes pale (#2379): the tell
                // that the streak WILL NOT come this time
                const spentVis = e.kind === 'smart' && e.dodgeLeft === 0
                const col = e.kind === 'bomber' ? '#59f2ff' : e.kind === 'smart' ? (spentVis ? '#b8bdc9' : '#ffd23e') : '#ff5d6c'
                const tr = trailFor(e.id, e.x, e.y, col)
                ctx.strokeStyle = col
                ctx.globalAlpha = spentVis ? 0.28 : 0.35
                ctx.beginPath()
                tr.pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
                ctx.stroke()
                ctx.globalAlpha = 1
                ctx.fillStyle = col
                if (e.kind === 'bomber') { ctx.fillRect(e.x - 6, e.y - 1, 12, 3); ctx.fillRect(e.x - 2, e.y - 3, 4, 2) }
                else if (e.kind === 'smart') {
                    ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, Math.PI * 2); ctx.fill()
                    if (e.dodgeT > 0) { // #2375 the jink streak — the escape reads on screen
                        // #2379 escalation: the veteran's streak is longer and
                        // hotter — you can SEE the bigger commitment coming off
                        const escBig = e.esc === CFG.dodgeEsc
                        ctx.globalAlpha = escBig ? 0.75 : 0.55
                        ctx.strokeStyle = escBig ? '#fff3a8' : col
                        const len = 4 + (e.esc ? e.esc.ticks * 0.55 : 8)
                        ctx.beginPath(); ctx.moveTo(e.x - e.dodgeDir * len, e.y + 1); ctx.lineTo(e.x - e.dodgeDir * 4, e.y + 1); ctx.stroke()
                        ctx.globalAlpha = 1
                    }
                    if (spentVis) { // the naked mark: an X where the dodge used to be
                        ctx.strokeStyle = '#ff8f8f'
                        ctx.beginPath()
                        ctx.moveTo(e.x - 4, e.y - 4); ctx.lineTo(e.x + 4, e.y + 4)
                        ctx.moveTo(e.x + 4, e.y - 4); ctx.lineTo(e.x - 4, e.y + 4)
                        ctx.stroke()
                    }
                }
                else ctx.fillRect(e.x - 1.5, e.y - 3, 3, 6)
            }
            for (const id of trails.keys()) if (!liveIds.has(id)) trails.delete(id)

            // interceptors + blasts
            for (const m of gs.intc) {
                // #2510 item 3: the autopilot's shots fly their sector's hue —
                // invisible labour made visible (a human shot stays house-white).
                const auto = gs.twoP && m.seat > 0 && gs.cpu[m.seat - 1]
                ctx.strokeStyle = auto ? `rgba(${SEAT_RGB[m.seat]},0.55)` : '#bfe9ff'
                ctx.globalAlpha = auto ? 0.6 : 0.5
                ctx.beginPath(); ctx.moveTo(m.x - m.vx * 5, m.y - m.vy * 5); ctx.lineTo(m.x, m.y); ctx.stroke()
                ctx.globalAlpha = 1
                ctx.fillStyle = auto ? SEAT_HEX[m.seat] : '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            }
            for (const b of gs.blasts) {
                const hue = BLAST_HUE[b.src] || BLAST_HUE.iv
                ctx.fillStyle = b.chain ? `rgba(${hue},${0.5 + 0.3 * Math.sin(tk)})` : `rgba(${hue},${0.55 + 0.3 * Math.sin(tk / 2)})`
                ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(0.5, b.r), 0, Math.PI * 2); ctx.fill()
            }

            // the reticle — where the next tap/Space will put a blast; in duo
            // it wears the colour of the seat holding the sky (#2473)
            if (screenRef.current === 'play') {
                const { x, y } = gs.aim
                ctx.strokeStyle = gs.twoP
                    ? (tk % 30 < 15 ? (gs.seat === 2 ? '#ffcf8f' : '#8fd8ff') : (gs.seat === 2 ? '#fff1d8' : '#d8f2ff'))
                    : (tk % 30 < 15 ? '#8fff9f' : '#d8ffd8')
                ctx.beginPath()
                ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 7, y)
                ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 7)
                ctx.stroke()
            }
            ctx.restore()

            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy
                if (pa.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 26; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            ctx.globalAlpha = 1
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const h = hudRef.current
            if (gs.twoP) {
                if (h.score) h.score.textContent = `1P ${String(gs.pscore[0]).padStart(6, '0')}  2P ${String(gs.pscore[1]).padStart(6, '0')}`
                if (h.wave) h.wave.textContent = `${gs.wave + 1}/3 · P${gs.seat}${gs.phase === 'banner' ? ' INCOMING' : ''}${gs.out[0] ? ' · S1✗' : ''}${gs.out[1] ? ' · S2✗' : ''}`
            } else {
                if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
                if (h.wave) h.wave.textContent = `${gs.wave + 1}/3 ${gs.phase === 'banner' ? 'INCOMING' : ''}`
            }
            if (h.hiscore) h.hiscore.textContent = String(Math.max(gs.score, ...board().map((b) => b.score), 0)).padStart(6, '0')
            if (h.cities) h.cities.textContent = String(gs.cities.filter((c) => c.alive).length)
            if (h.ammo) h.ammo.textContent = gs.bases.map((b) => (b.alive ? b.ammo : '—')).join(' ')
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
            // #2510 item 3: the AUTONOMOUS tag — visible labour while the
            // machine holds the sky, in the autopilot seat's own hue.
            if (h.auto) {
                const autoOn = screenRef.current === 'play' && gs.twoP && gs.cpu[gs.seat - 1] && gs.tick % 40 < 30
                h.auto.textContent = 'AUTONOMOUS'
                h.auto.style.color = `rgb(${SEAT_RGB[gs.seat] || '208,214,235'})`
                h.auto.style.opacity = autoOn ? '1' : '0'
            }
            // #2510 item 1: the seat card — the arcade's named turn flip, on
            // the first beat of every duo banner: seat word, sector, lit cities.
            if (h.card) {
                const cardOn = screenRef.current === 'play' && gs.twoP && gs.phase === 'banner' && gs.pT > CFG.bannerLen - 90
                h.card.style.opacity = cardOn ? '1' : '0'
                if (cardOn && h.card.dataset.seat !== `${gs.seat}`) {
                    h.card.dataset.seat = `${gs.seat}`
                    const hex = SEAT_HEX[gs.seat]
                    const lamps = gs.cities.map((c, i) => (SEAT_OF_CITY[i] === gs.seat
                        ? `<span style="display:inline-block;width:7px;height:7px;margin:0 3px;background:${c.alive ? hex : '#4d2b30'}${c.alive ? `;box-shadow:0 0 6px ${hex}` : ''}"></span>`
                        : '')).join('')
                    h.card.innerHTML = `<div style="font-size:22px;font-weight:900;letter-spacing:0.3em;color:${hex};text-shadow:0 0 16px #000">PLAYER ${gs.seat === 1 ? 'ONE' : 'TWO'}</div>`
                        + `<div style="font-size:10px;letter-spacing:0.5em;margin-top:4px;color:rgba(255,255,255,0.7)">${gs.seat === 1 ? 'WEST SECTOR' : 'EAST SECTOR'}</div>`
                        + `<div style="margin-top:8px">${lamps}</div>`
                }
            }
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
                    while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
                }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            const md = modeRef.current
            gs = makeGame(0, { twoP: md !== 'solo', cpu: md === 'coop' ? [false, true] : [false, false] })
            evLog.length = 0; parts.length = 0; trails.clear()
            seatHeld[0] = new Map(); seatHeld[1] = new Map()
            keys.l = keys.r = keys.u = keys.d = keys.f = keys.fTap = false
            tap.on = false
            watchingRef.current = false; setWatching(false); watchHeldRef.current = new Map() // #1637 a new run starts with the keys in your hand
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'KeyM') { cycleMode(); return } // #2473 SOLO → +CPU → 2 HUMAN (desktop keyboard option, Jon's rule)
                startPlay(); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            // #1637 WATCH: Y hands the sky to the solver; any driving key takes it back.
            if (isWatchKey(e)) { watchingRef.current = !watchingRef.current; setWatching(watchingRef.current); if (watchingRef.current) playWatchStart(); else playWatchStop(); return }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') { keys.f = true; if (!e.repeat) keys.fTap = true }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.f = false }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            // #1637 WATCH: an aim tap is the player driving — hand back first.
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
            const r = canvas.getBoundingClientRect()
            if (!r.width || !r.height) return
            tap.x = ((e.clientX - r.left) / r.width) * W
            tap.y = ((e.clientY - r.top) / r.height) * H
            tap.on = true
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
            window.__mbTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, wave: gs.wave, phase: gs.phase,
                    score: gs.score, end: gs.end, fired: gs.fired, firedBy: gs.firedBy, kills: gs.kills,
                    aim: { x: +gs.aim.x.toFixed(1), y: +gs.aim.y.toFixed(1) },
                    cities: gs.cities.map((c) => c.alive),
                    bases: gs.bases.map((b) => ({ ammo: b.ammo, alive: b.alive })),
                    enemies: gs.enemies.map((e) => ({ id: e.id, kind: e.kind, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10 })),
                    intc: gs.intc.map((m) => ({ id: m.id, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 })),
                    blasts: gs.blasts.length,
                    // #2473 duo probes: who holds the sky, the two ledgers
                    twoP: gs.twoP, seat: gs.seat, cpu: gs.cpu.slice(), pscore: gs.pscore.slice(), out: gs.out.slice(),
                    mode: modeRef.current,
                    board: board(), evLog: evLog.slice(-90),
                }),
                start: startPlay,
                watching: () => watchingRef.current, // #1637 watchcheck: is the solver firing?
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.wave !== undefined || opts.twoP !== undefined || opts.cpu !== undefined) {
                        // #2473: the harness can stage a duo board directly
                        gs = makeGame(opts.wave ?? gs.wave, { twoP: opts.twoP ?? gs.twoP, cpu: opts.cpu ?? gs.cpu })
                    }
                    if (opts.mode) { modeRef.current = opts.mode; setModeUi(opts.mode) } // rig: the M-wheel state without the keystrokes
                    // quiet = an empty SKY, not an empty script: an emptied
                    // queue reads as wave-clear on the first play tick, and
                    // freshWave ~4.3 s later wipes planted warheads and relits
                    // cities (#1174). This entry never reaches its launch tick.
                    if (opts.quiet) gs.queue = [{ t: Number.MAX_SAFE_INTEGER, kind: 'icbm', x0: 128, ti: -1, spd: Number.MAX_SAFE_INTEGER }]
                    if (opts.ammo) opts.ammo.forEach((a, i) => { if (gs.bases[i]) gs.bases[i].ammo = a })
                    if (opts.spawn) {
                        const s = opts.spawn
                        const spd = s.spd ?? 260
                        gs.enemies.push({
                            id: 9000 + Math.round(s.x * 7 + s.y), kind: s.kind ?? 'icbm',
                            x: s.x, px: s.x, y: s.y, vx: s.vx ?? 0,
                            vy: s.vy ?? (CFG.groundY - s.y) / spd,
                            ti: s.ti ?? 0, t: 0, alive: true, split: s.split ? { ...s.split, done: false } : null,
                            amp: s.amp ?? 0, drops: s.drops ? s.drops.map((d) => ({ ...d, done: false })) : null,
                            jinks: s.jinks ?? null,
                            spawnAt: gs.playT, score: CFG.score[s.kind ?? 'icbm'],
                        })
                    }
                    if (opts.killCity !== undefined && gs.cities[opts.killCity]) gs.cities[opts.killCity].alive = false
                    if (opts.cityAlive !== undefined && gs.cities[opts.cityAlive]) gs.cities[opts.cityAlive].alive = true
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'MISSILE BATTLE',
                getState: () => [
                    `${WAVES[gs.wave].name}  score ${gs.score}  phase ${gs.phase}  cities ${gs.cities.filter((c) => c.alive).length}/6`,
                    `batteries ${gs.bases.map((b) => (b.alive ? b.ammo : 'X')).join('/')}  fired ${gs.fired} [${gs.firedBy.join(',')}]  kills ${gs.kills}`,
                    `reticle ${gs.aim.x.toFixed(0)},${gs.aim.y.toFixed(0)}  in air: ${gs.enemies.map((e) => e.kind[0] + Math.round(e.x) + ',' + Math.round(e.y)).join(' ')}`,
                    `interceptors ${gs.intc.length}  blasts ${gs.blasts.length}  screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = structuredClone(gs)
                            sim.events = []
                            const held = new Map()
                            let t = 0
                            while (!sim.end && t < 20000) { step(sim, decide(sim, held)); t++ }
                            const cities = sim.cities.filter((c) => c.alive).length
                            const ammo = sim.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0)
                            return sim.end === 'win'
                                ? `WINNABLE from HERE: the autopilot replays this exact state to victory (${t} ticks ahead, ${cities} cities and ${ammo} interceptors left over)`
                                : `LOST from here: ${sim.end || 'the autopilot could not hold this board'} — cities ${cities}, ammo ${ammo}`
                        },
                    },
                    { label: '+10 EVERY BATTERY', run: () => { gs.bases.forEach((b) => { b.ammo += 10 }); return 'ammo +10 each' } },
                    { label: 'CLOUD SEED', run: () => {
                        for (let k = 0; k < 5; k++) gs.enemies.push({ id: 8000 + k, kind: 'icbm', x: 60 + k * 32, px: 60 + k * 32, y: 30 + k * 6, vx: (146 - 60 - k * 32) / 240, vy: (CFG.groundY - 30 - k * 6) / 240, ti: 2, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: gs.playT, score: CFG.score.icbm })
                        return 'five warheads converging on one city'
                    } },
                    { label: 'SMARTEST BOMB', run: () => { gs.enemies.push({ id: 8100, kind: 'smart', x: 128, px: 128, y: 20, vx: 0, vy: 0.6, ti: 3, t: 0, alive: true, split: { y: 118, n: 3, spd: 150, done: false }, amp: 13, drops: null, jinks: 2, spawnAt: gs.playT, score: CFG.score.smart }); return 'a veteran: it weaves, dodges twice, then sheds three near the deck' } },
                    { label: 'JINK PROOF', run: () => {
                        // the scripted earn-the-kill: round one is feinted, round two is yours
                        const e = { id: 8101, kind: 'smart', x: 200, px: 200, y: 60, vx: -0.3, vy: 0.5, ti: 1, t: 0, alive: true, split: null, amp: 12, drops: null, spawnAt: gs.playT, score: CFG.score.smart }
                        gs.enemies.push(e)
                        const tau = 72
                        const tx = e.px + e.vx * tau + Math.sin((e.t + tau) * 0.07) * e.amp
                        const ty = e.y + e.vy * tau
                        gs.intc.push({ id: 8102, x: 128, y: CFG.groundY + 8, tx, ty, vx: (tx - 128) / tau, vy: (ty - (CFG.groundY + 8)) / tau, eta: tau, t: 0, bat: 1 })
                        return 'watch the yellow bomb leave the blast point — then lead its escape'
                    } },
                ],
            })
            let prevA = false, contractSeed = 0
            exposeGame({
                watchSfx: watchSfxLog, // #1654 the shared handoff blip log
                id: 'missile-battle',
                buttons: ['left', 'right', 'up', 'down', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(0)
                    evLog.length = 0; parts.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.f = keys.fTap = false
                    tap.on = false
                    prevA = false; demoAt = 0
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const fire = !!pad.a && !prevA
                    prevA = !!pad.a
                    doSim({ l: !!pad.left, r: !!pad.right, u: !!pad.up, d: !!pad.down, fire })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, wave: gs.wave, phase: gs.phase,
                    // the reticle is live state: arrows steer it, and the #1130
                    // juice audit's motion channel cannot see an aim it is not
                    // told about (a steering game read as four dead buttons).
                    aim: [Math.round(gs.aim.x), Math.round(gs.aim.y)],
                    cities: gs.cities.filter((c) => c.alive).length,
                    ammo: gs.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0),
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        // #1473: production-safe feedback state, every build. MissileBattle waves
        // come from fixed tables (waves.js) and the sim is plain deterministic data —
        // zero Math.random in the whole title: {tick,score,done,wave}.
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.end != null, wave: gs.wave }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__mbTest) delete window.__mbTest; unexposeGame(); unmountDbg() }
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
                <div className="absolute flex items-center gap-3 text-white font-mono text-xs" style={{ top: 'calc(4.9rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <span ref={setHud('wave')} className="border border-red-300/60 text-red-200 px-2 py-0.5 rounded bg-black/40">1/3</span>
                    <span className="text-cyan-200">CITIES <b ref={setHud('cities')}>6</b></span>
                    <span ref={setHud('ammo')} className="text-violet-200/90 whitespace-nowrap">10 10 10</span>
                    <span className="ml-auto text-xl font-bold whitespace-nowrap" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
                {/* #2510 item 3: the machine signs its shift — a small tag by
                    the score column while the autopilot holds the sky. Absolute
                    so it never pushes the narrow-phone HUD into wrapping. */}
                <span ref={setHud('auto')} className="absolute text-[10px] font-bold tracking-widest border border-current rounded px-1 py-0.5 bg-black/40 transition-opacity duration-200" style={{ top: 'calc(6.6rem + var(--sat, 0px))', left: '50%', transform: 'translateX(-50%)', opacity: 0 }} />
                {/* #2510 item 1: the arcade flipped a named PLAYER card between
                    turns — the seat card ceremonies the hand-off on the banner:
                    the seat's colour, its word, its cities still lit. */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div ref={setHud('card')} className="bg-black/60 border border-white/25 rounded-lg px-8 py-5 text-center font-mono transition-opacity duration-200" style={{ opacity: 0 }} />
                </div>
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                        <h1 className="text-4xl font-black" style={{ color: '#ff7d5d', textShadow: '3px 0 0 #39d2ff, -3px 0 0 #ff3d6e, 0 10px 24px #000' }}>MISSILE BATTLE</h1>
                        <p className="text-white font-mono font-bold mt-3 animate-pulse">{PRESS}</p>
                        <span className="block text-white/70 font-mono text-xs mt-2 tracking-widest">
                            MODE <span style={{ color: mode === 'solo' ? '#8fd8ff' : mode === 'coop' ? '#c9b8ff' : '#ffcf8f' }}>
                                {mode === 'solo' ? 'SOLO' : mode === 'coop' ? 'YOU + CPU SEAT' : '2 HUMAN · ALTERNATING'}
                            </span> <span className="text-white/40">· M TO CHANGE</span>
                        </span>
                        <span className="block mt-2 text-xs text-white/50 tracking-widest">{WATCH_ATTRACT_HINT}</span>
                        <AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'DEFENSE HELD' : 'THE MAP WENT DARK'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — all three barrages broken' : ''}</p>
                    {end.twoP && (
                        <p className="mb-3 font-bold tracking-widest" style={{ color: end.winner === 1 ? '#8fd8ff' : '#ffcf8f' }}>
                            1P {end.pscore[0]} · 2P {end.pscore[1]} — PLAYER {end.winner} TOPS THE BOARD
                        </p>
                    )}
                    <div className="bg-black/50 border border-amber-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MISSILE BATTLE')} onResume={handleResume} />}
            {/* #1637 WATCH — the solver intercepts the storm; any input takes over. */}
            {play && watching && (
                <WatchToast className="absolute z-50" />
            )}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {play && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(7.4rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default MissileBattleGame

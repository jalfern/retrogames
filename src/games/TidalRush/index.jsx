// TIDAL RUSH — the cabinet. The bay lives in ./water.js (one Gerstner table),
// the race in ./sim.js (pure, seeded, 60 Hz, zero Math.random), the look in
// ./art.js; this file only paints, listens and makes noise: chase-cam over
// the GPU sea that IS the physics surface, spray off every carve, FOV kick,
// a leaning rider, and a synth engine that winds up with the throttle.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import Lobby from '../../components/Lobby'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { padState } from '../../utils/padState'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { createLobby, lobbyRole, relayFromQuery, seatModel } from '../../utils/lobby.js'
import { createLockStep, retryDelay } from '../../utils/lockstep.js'
import { makeGame, step, autoPad, attractPad, stateOf, stateHash, rankAt, LAPS, SIM_MS, DT, rainAt, RAIN_VIS, airPose } from './sim.js'
import { mixWater, mixHeight, frontW } from './water.js'
import { contractHoldsLoop } from '../../utils/gameContract'
import { SEATS, PAD_DELAY, HASH_EVERY, HOLD_MS, WATCH_CAP, RIDE_NAMES, toWire, fromWire, assembleSeatPads, hostSeed, createEvidence, podiumRows, podWire, podRows, createHist, inflateSh } from './net.js'
import { makeSea, makeSky, makeBuoy, buoyDim, makeSki, makeSpray, spraySpawn, sprayStep, sprayTint, wakeSpray, makeWake, wakePush, wakeStep, makeRain, rainSpawn, rainStep, makeLights, pushSea, boatSpots, makeBoat, makeBellBuoy, gullSpots, makeGull, gullFrame, makeSplashRings, ringStep } from './art.js'

const PRESS = 'PRESS ANY KEY OR TAP'
const MESSAGES = [
    'RED BUOY RIGHT · YELLOW BUOY LEFT',
    'CLEAN PASSES CHARGE THE SPRINT',
    'HIT A CREST · HOLD SPIN · BANK THE TRICK',
    'FULL-LOCK STEER OFF A CREST = BARREL ROLL',
    'BRAKE IN AIR = BACK FLIP · BRAKE + GAS = HANDSTAND',
    'STORM BAY: THE SWELL RE-ROLLS EVERY LAP',
    'A SQUALL CARRIES THE NEW SEA ACROSS THE BAY',
    'THREE LAPS · BEAT MAKO',
]

const freshSeed = () => (Date.now() ^ Math.round(performance.now() * 1024)) >>> 0

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`

const TidalRushGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [result, setResult] = useState(null)
    const [bay, setBay] = useState('sunny')            // 'sunny' | 'storm' — attract picker
    const [netUi, setNetUi] = useState(null)           // #3220 shared Lobby overlay state
    const [netMsg, setNetMsg] = useState('')           // desync / dropout banner (never silent)
    const netMsgRef = useRef('')
    const [netReport, setNetReport] = useState('')      // #3244: copyable desync evidence under the banner
    const [podium, setPodium] = useState(null)           // #3244 item 4: the room's finish sheet
    const bayRef = useRef('sunny')
    const previewRef = useRef(null)                     // effect republishes: reroll attract preview sim
    const startRaceRef = useRef(null)                   // effect republishes: tap-to-start
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const pickBay = useCallback((b) => {
        if (bayRef.current === b) return
        bayRef.current = b; setBay(b)
        if (previewRef.current) previewRef.current()
    }, [])

    // Pause must silence the loop voice; resume restarts it (the next simTick
    // re-winds it to the hull's speed) — otherwise the engine hums under the sheet.
    const setPause = useCallback((on) => {
        if (pausedRef.current === on) return
        pausedRef.current = on
        setPaused(on)
        if (on) audioController.stopLoopVoice()
        else audioController.startLoopVoice(52)
    }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        const canvas = document.createElement('canvas')
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        const renderer = new THREE.WebGLRenderer({
            canvas, antialias: !LITE, alpha: false, powerPreference: 'high-performance',
            preserveDrawingBuffer: !!import.meta.env.DEV,
        })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        // phone budget (the issue's SHORE weak-spot): ratio capped hard, never
        // a shadow map, one geometry-heavy mesh total.
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600)
        scene.add(camera)
        const lights = makeLights()
        const sunLight = lights[0]
        const hemiLight = lights[1]
        scene.add(...lights)
        const sky = makeSky()
        scene.add(sky)
        const sea = makeSea()
        scene.add(sea.mesh)

        const buoys = []
        let gs = makeGame(freshSeed(), bayRef.current)
        for (const g0 of gs.course.gates) {
            const b = makeBuoy(g0.color === 'red' ? 0xe4382b : 0xffc21f)
            b.position.set(g0.x, 0, g0.z)
            scene.add(b)
            buoys.push(b)
        }

        // the moorings (#3159): seeded props in the infield — sloops + a bell
        // buoy so the bay is lived-in. No colliders, no sim: pure decoration.
        const scenery = boatSpots(gs.course.seed).map((s) => {
            const g = s.bell ? makeBellBuoy() : makeBoat(s.hue)
            scene.add(g)
            return { ...s, g }
        })
        const bellSpot = scenery.find((s) => s.bell)
        let bellCool = 0
        let moorSeed = gs.course.seed

        // gulls (#3218): a flock wheels over that anchorage — same seed as the
        // fleet it circles. Decoration only; like the sloops, the sim never
        // sees the birds.
        let flock = gullSpots(moorSeed)
        const gullMeshes = flock.birds.map(() => {
            const g = makeGull()
            scene.add(g)
            return g
        })

        const skiMeshes = gs.crafts.map((c) => {
            const s = makeSki(c.color)
            scene.add(s.root)
            return s
        })

        const spray = makeSpray(LITE ? 380 : 700)
        scene.add(spray.pts)
        const wakes = gs.crafts.map(() => {
            const w = makeWake(LITE ? 30 : 44)
            scene.add(w.glowMesh)
            scene.add(w.mesh)
            return w
        })
        const rain = makeRain(LITE ? 240 : 420)
        scene.add(rain.pts)
        // #3280: pooled rings for the handstand landing flash
        const rings = makeSplashRings(LITE ? 2 : 3)
        rings.rings.forEach((r) => scene.add(r.mesh))
        let stormBlend = bayRef.current === 'storm' ? 1 : 0
        let rainVis = 0                     // smoothed rain at Kai's hull (#3191)

        const camPos = new THREE.Vector3(0, 6, -20)
        const _v3a = new THREE.Vector3()
        const _v3b = new THREE.Vector3()
        const _euler = new THREE.Euler()
        const _up = new THREE.Vector3(0, 1, 0)
        const _down = new THREE.Vector3(0, -1, 0)
        const _qy = new THREE.Quaternion()
        let skiJolt = gs.crafts.map(() => 0)
        let airT = gs.crafts.map(() => 0)
        // #3280: smoothed grab-pose weights per hull (flip rail / handstand bow)
        const grabW = gs.crafts.map(() => ({ f: 0, h: 0 }))
        let waveAmbT = 2.0
        let camInit = false
        let engineTick = 0
        let flashPop = 0
        let goFlash = 0
        // #3281: first-try coach flash — once per session per trick, the chip
        // teaches the move while the pop line screams the score
        let coachFlash = 0
        const coachShown = { flip: false, handstand: false }

        const keys = new Set()
        const padRef = { throttle: 0, steer: 0, brake: false, a: false, b: false }

        function readPad() {
            let steer = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
            let throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0
            if (padState.engaged) {
                steer = padState.x
                if (padState.y < -0.12) throttle = Math.max(throttle, -padState.y)
            }
            // physical gamepad axis rides the same analog line
            padRef.steer = Math.max(-1, Math.min(1, steer))
            padRef.throttle = throttle
            padRef.brake = keys.has('ArrowDown') || keys.has('KeyS')
            padRef.a = keys.has('Space')
            padRef.b = keys.has('ShiftLeft') || keys.has('ShiftRight')
            return padRef
        }

        // ------------------------------------------------------------- online ----
        // #3220 lockstep race on the #1039 shared lobby: ?net=host /
        // ?net=join&room=CODE / ?relay=ws(s)://host — the same join flow, code
        // and waiting room every multiplayer game uses. Seat i rides hull i:
        // KAI · MAKO · TUNDRA; open seats fly the seeded autopilot. Wire
        // semantics in ./net.js; sampling law in src/utils/lockstep.js;
        // N-peer roster law (#1705) rides ls.setPeers, GravelYard's precedent.
        const nq = new URLSearchParams(window.location.search)
        const netRole = lobbyRole(window.location.search)
        const relayUrl = relayFromQuery(window.location.search)
        const net = {
            active: !!netRole, role: netRole, phase: netRole ? 'idle' : 'off',
            slot: netRole === 'host' ? 0 : -1, code: '', joinHref: '',
            humans: [], racing: false, solo: false, podium: null, hold: null,
            // #3244 item 2 spectate: watch = I'm riding the room's truth (no
            // seat, no pads out); watchers = seats OTHER boxes watch (never
            // riders); hist = the host's pad ring for mid-race joiners.
            watch: false, watchers: new Set(), hist: createHist(), shBuf: null,
        }
        // mySeat doubles as my hull: seat i rides hull i, canonical on every box.
        const mySeat = () => (net.active && net.slot >= 0 ? net.slot : 0)
        let ws = null
        const makeTransport = (url) => {
            ws = new WebSocket(url)
            return {
                send: (s) => { try { if (ws && ws.readyState === 1) ws.send(s) } catch { /* gone */ } },
                onMessage: (cb) => { ws.onmessage = (ev) => cb(ev.data) },
                onClose: (cb) => { ws.onclose = () => cb() },
                close: () => { try { if (ws) ws.close() } catch { /* gone */ } },
            }
        }
        // per-seat pad mirrors holding EXACTLY the bytes each seat sent — both
        // boxes apply identical pads per hull, which is the whole determinism
        // claim (the sim consumes wire bits, never local analog).
        const mirrors = [new Map(), new Map(), new Map()]
        let stalledTicks = 0
        // #3244 item 5: per-boundary hash ring — when the referee bites, the
        // last rows (tick + my hash + every peer hash) show under the banner,
        // copyable, so a reported freeze carries evidence instead of vibes.
        const evidence = createEvidence()
        const ls = createLockStep({
            delay: PAD_DELAY,
            hashEvery: HASH_EVERY,
            send: (m) => {
                if (m.t === 'pad') mirrors[mySeat()].set(m.k, m.p)
                if (net.room) net.room.send(m.t, m)
            },
        })
        const pushNetUi = () => setNetUi(net.active ? {
            role: net.role, phase: net.phase, code: net.code, slot: net.slot,
            // watchers never show as riders (#3244 item 2) — the field a seat
            // fills is the field that races.
            seats: seatModel(SEATS, net.room ? net.room.slots.filter((s) => !net.watchers.has(s)) : (net.slot >= 0 && net.role !== 'watch' ? [net.slot] : [])),
            joinHref: net.joinHref,
            names: RIDE_NAMES,
        } : null)
        const netSay = (m) => { netMsgRef.current = m; setNetMsg(m) }

        // a seat dropped mid-race (#863 law — say so, never stall silently).
        // #3244 item 3 — survivable rejoin: the field HOLDS first. Lockstep
        // stalls every box at the same tick (the dropped seat's first missing
        // pad), so all seas are frozen at one identical state; if the flapper's
        // pads return within HOLD_MS the race simply continues with their hull
        // back — the roster never changed, so there is no state to catch up.
        // Pad replays (replayOwnPads) cover the in-flight pads the room lost
        // while a socket was down: pads are absolute per tick, so late arrival
        // is harmless — the gate just opens when they are all in.
        // Past the window the old takeover fires: the open seat goes back to
        // the seeded autopilot and the pad streams stay absolute, so the
        // remaining boxes keep hashing equal. Alone, the bay hands open seats
        // to the autopilot to finish.
        const seatGone = (seat) => {
            if (!net.racing) return
            if (!net.hold) net.hold = { seats: new Set(), at: Date.now() }
            net.hold.seats.add(seat)
            netSay('RIDER DOWN — HOLDING FOR THEM')
            pushNetUi()
        }
        const seatLost = (seat) => {
            if (!net.racing) return
            net.humans = net.humans.filter((s) => s !== seat)
            ls.setPeers(net.humans.filter((s) => s !== mySeat()))
            gs.crafts.forEach((c, i) => { if (!net.humans.includes(i)) c.human = false })
            net.solo = net.humans.length <= 1
            netSay(net.solo ? 'RIDER DROPPED — FINISHING SOLO' : 'RIDER DROPPED — THEIR SKI COASTS')
            pushNetUi()
        }
        // replayOwnPads re-sends my pads for the ticks around the stall the
        // room may have lost while a socket was down (the pump kept stamping
        // while stalled — those bytes left into the void). The window extends
        // PAD_DELAY+1 ticks BEHIND my tick too: a peer that kept running on
        // buffered pads is that far behind me at the wire-reopen, and its gate
        // waits on the ticks I already spent. Late pads are harmless — a tick
        // only ever runs once, on identical absolute bytes. Bounded: ~2D pads.
        const replayOwnPads = () => {
            if (!net.room) return
            for (const [k, p] of mirrors[mySeat()]) if (k >= gs.tick - PAD_DELAY - 1 && k <= gs.tick + PAD_DELAY) net.room.send('pad', { k, p })
        }

        const sfx = {
            pass: () => { audioController.playTone(880, 0.07, 'square', 0.10); audioController.playTone(1320, 0.09, 'square', 0.09, 0.07) },
            miss: () => audioController.playSweep(240, 110, 0.28, 'sawtooth', 0.12),
            trick: () => { audioController.playSweep(1250, 240, 0.2, 'triangle', 0.06); audioController.playNoise(0.1, 0.04); audioController.playTone(660, 0.07, 'square', 0.12); audioController.playTone(880, 0.07, 'square', 0.12, 0.08); audioController.playTone(1320, 0.14, 'square', 0.12, 0.16) },
            air: () => { audioController.playSweep(300, 980, 0.18, 'sine', 0.08); audioController.playNoise(0.16, 0.05) },
            splash: () => audioController.playNoise(0.22, 0.14),
            bump: () => audioController.playNoise(0.07, 0.12),
            lap: () => audioController.playTone(990, 0.12, 'triangle', 0.12),
            go: () => audioController.playSweep(440, 880, 0.3, 'square', 0.14),
            barrel: () => { audioController.playSweep(330, 990, 0.22, 'triangle', 0.11); audioController.playTone(1100, 0.1, 'square', 0.1, 0.14) },
            // #3276: a flip whooshes over the head; a handstand is a low, held hum
            flip: () => { audioController.playSweep(480, 1480, 0.26, 'sawtooth', 0.07); audioController.playTone(1560, 0.12, 'square', 0.1, 0.2) },
            handstand: () => { audioController.playTone(233, 0.14, 'triangle', 0.13); audioController.playSweep(233, 311, 0.2, 'triangle', 0.09) },
            // #3280: the grab is a short cloth creak; landings read by trick —
            // a flip slams deep, a handstand drives a tight column.
            grab: () => { audioController.playSweep(760, 430, 0.12, 'triangle', 0.05); audioController.playNoise(0.06, 0.03) },
            landFlip: () => { audioController.playSweep(210, 60, 0.3, 'sawtooth', 0.12); audioController.playNoise(0.3, 0.16) },
            swell: () => audioController.playSweep(90, 210, 0.9, 'sine', 0.16),
            rain: (on) => {
                // the band edge: a wind gust in, a lifting sweep out (#3191)
                if (on) { audioController.playSweep(540, 150, 0.7, 'sine', 0.08); audioController.playNoise(0.55, 0.05) }
                else audioController.playSweep(150, 480, 0.5, 'sine', 0.05)
            },
            airLand: () => { audioController.playSweep(1500, 320, 0.24, 'sine', 0.09); audioController.playNoise(0.14, 0.06) },
            // #3281: a deep inverted slam gets its own tail — a low, heavy trough
            landInverted: () => { audioController.playSweep(330, 88, 0.32, 'sawtooth', 0.11); audioController.playNoise(0.30, 0.15) },
            bell: () => { audioController.playTone(1568, 0.5, 'sine', 0.05); audioController.playTone(2349, 0.3, 'sine', 0.016, 0.02) },
            thunder: () => { audioController.playNoise(0.5, 0.12); audioController.playSweep(70, 38, 0.8, 'sawtooth', 0.1) },
            finish: (win) => {
                const base = win ? [523, 659, 784, 1047] : [392, 330, 262]
                base.forEach((f, i) => audioController.playTone(f, 0.16, 'square', 0.12, i * 0.13))
            },
        }

        let trickPop = ''
        const coachSay = (text) => {
            const hud = hudRef.current
            if (!hud.coach) return
            hud.coach.textContent = text
            hud.coach.style.opacity = 1
            coachFlash = 2.6
        }
        function drainEvents() {
            const mine = mySeat()
            for (const e of gs.events) {
                // #3220: hull-tagged events belong to that rider's cabinet;
                // untaged ones (swell, flash, frontDone) are the bay's own voice.
                if ('id' in e && e.id !== mine) continue
                const hud = hudRef.current
                if (e.type === 'pass') { sfx.pass(); flashPop = 1; if (hud.pop) { hud.pop.textContent = `CLEAN +100`; hud.pop.style.opacity = 1 } }
                if (e.type === 'miss') { sfx.miss(); flashPop = 1; trickPop = ''; if (hud.pop) { hud.pop.textContent = 'MISS — THROTTLE DOWN'; hud.pop.style.opacity = 1 } }
                if (e.type === 'trick') { sfx.trick(); trickPop = 'TRICK! +250'; if (hud.pop) { hud.pop.textContent = trickPop; hud.pop.style.opacity = 1 } }
                if (e.type === 'barrel') { sfx.barrel(); flashPop = 1; trickPop = 'BARREL ROLL +200'; if (hud.pop) { hud.pop.textContent = trickPop; hud.pop.style.opacity = 1 } }
                if (e.type === 'flip') { sfx.flip(); flashPop = 1; trickPop = 'BACK FLIP +300'; if (hud.pop) { hud.pop.textContent = trickPop; hud.pop.style.opacity = 1 } if (!coachShown.flip) { coachShown.flip = true; coachSay('FIRST BACK FLIP — BRAKE ALONE IN AIR') } }
                if (e.type === 'handstand') { sfx.handstand(); trickPop = `HANDSTAND ×${e.n} +${e.pts}`; if (hud.pop) { hud.pop.textContent = trickPop; hud.pop.style.opacity = 1 } if (!coachShown.handstand) { coachShown.handstand = true; coachSay('FIRST HANDSTAND — BRAKE + GAS TO HOLD') } }
                if (e.type === 'airbonus') {
                    // the hang-time pays — whoosh in, bank the air
                    sfx.airLand()
                    if (hud.pop) { hud.pop.textContent = `${trickPop || 'TRICK'} · +${e.pts} AIR`; hud.pop.style.opacity = 1 }
                    flashPop = 1
                }
                if (e.type === 'swell') { sfx.swell(); if (hud.pop) { hud.pop.textContent = `SQUALL INBOUND — LAP ${e.lap}`; hud.pop.style.opacity = 1 } }
                if (e.type === 'flash') sfx.thunder()
                if (e.type === 'rain') {
                    sfx.rain(e.on)
                    if (hud.pop && e.on) { hud.pop.textContent = 'IN THE SQUALL — HOLD YOUR LINE'; hud.pop.style.opacity = 1 }
                }
                if (e.type === 'air') sfx.air()
                if (e.type === 'splashes') sfx.splash()
                if (e.type === 'bump') sfx.bump()
                if (e.type === 'lap') sfx.lap()
                if (e.type === 'finish') {
                    sfx.finish(gs.rank === 1)
                    audioController.stopLoopVoice()
                    setResult({ place: gs.rank, t: gs.t, score: gs.score, tricks: gs.score >= 2000, stage: gs.stage })
                    setMode('over')
                }
            }
        }

        let prevGo = false
        let prevGrab = 'none'
        function simTick() {
            const playing = screenRef.current === 'play'
            const wasAir = gs.crafts.map((c) => c.airborne)
            if (net.racing && net.active) {
                // Wire law (#531): pump pads exactly D ahead, run tick k only
                // when every peer's pad for k has landed. While stalled the bay
                // keeps painting; after ~2 s the banner says why.
                const k = gs.tick
                ls.pumpTo(k + PAD_DELAY, () => toWire(readPad()))
                const alone = net.solo || net.humans.length <= 1
                // #3244 item 3: hold bookkeeping — a held seat whose pads are
                // flowing again at the stalled tick is back (pads are its proof
                // of life and of identity); the window expiring hands the ski
                // to the autopilot for good (the old takeover, unchanged).
                if (net.hold) {
                    for (const s of [...net.hold.seats]) { const m = mirrors[s]; if (m && m.has(gs.tick)) net.hold.seats.delete(s) }
                    if (net.hold.seats.size === 0) {
                        net.hold = null
                        replayOwnPads()
                        netSay('RIDER BACK — GO')
                    } else if (Date.now() - net.hold.at > HOLD_MS) {
                        const lostSeats = [...net.hold.seats]
                        net.hold = null
                        for (const s of lostSeats) seatLost(s)
                    }
                }
                if (!alone && !ls.ready(k)) {
                    stalledTicks++
                    if (stalledTicks === 120 && !net.hold) netSay('HOLD ON — SYNCING THE FIELD…')
                    return
                }
                if (stalledTicks > 0 && netMsgRef.current.startsWith('HOLD ON')) netSay('')
                stalledTicks = 0
                // hull 0 is fed from ITS own wire bytes (mine as host, the
                // host's as guest) — never local analog, or the boxes diverge.
                const padIn = fromWire(mirrors[0].get(k) || toWire({}))
                step(gs, padIn, assembleSeatPads(mirrors, k, net.humans))
                // #3244 item 2: the host rings every pad it applies, so a
                // watcher that arrives mid-race can replay the race to now.
                if (net.role === 'host') net.hist.record(k, mirrors)
                if (!alone && k % HASH_EVERY === 0) {
                    const h = stateHash(gs)
                    evidence.mine(k, h)
                    const r = ls.hash(k, h)
                    if (r && r.desync !== undefined) {
                        evidence.markBad(k, evidence.mismatchSlot(k), r.mine, r.theirs)
                        net.racing = false
                        pausedRef.current = true
                        netSay('SIMS DIVERGED — THE HOST RESTARTS THE BAY')
                        setNetReport(evidence.text(net.code, mySeat()))
                    }
                }
                // the world ends when every hull has crossed — stream pads until
                // then, so a peer never starves behind my finish screen.
                if (gs.crafts.every((c) => c.finished)) {
                    net.racing = false
                    // #3244 item 4: the race ends INTO a room moment — the sheet
                    // of every seat by finish time, identical on every cabinet
                    // (lockstep holds the same numbers); the host answers the
                    // room with its rows so guests read the authority, not a
                    // local sort, and the rematch button can light up.
                    net.podium = podiumRows(gs, net.humans)
                    setPodium(net.podium)
                    if (net.role === 'host' && net.room) {
                        net.room.send('pod', { rows: podWire(net.podium) })
                        net.room.setPhase('waiting')
                    }
                }
                if (playing) drainEvents()
            } else if (net.watch && net.active) {
                // #3244 item 2 — spectate: same seed, same sea, the same
                // absolute pads the riders applied. No seat, no pads out, no
                // referee in. The gate opens when every rider pad for k has
                // landed — a held field stalls the watcher too, which is how
                // it stays bit-identical to the race; pads that never return
                // (~10 s) mean that seat has left, and its ski coasts on, as
                // for a rider.
                const k = gs.tick
                const allIn = net.humans.every((s) => mirrors[s] && mirrors[s].has(k))
                if (!allIn) {
                    stalledTicks++
                    if (stalledTicks === 120) netSay('SYNCING THE FIELD…')
                    if (stalledTicks < 600) return
                    net.humans = net.humans.filter((s) => mirrors[s] && mirrors[s].has(k))
                    netSay('A RIDER LEFT — THEIR SKI COASTS')
                    stalledTicks = 0
                } else if (stalledTicks > 0) {
                    stalledTicks = 0
                    if (netMsgRef.current.startsWith('SYNCING')) netSay('')
                }
                step(gs, fromWire(mirrors[0].get(k) || toWire({})), assembleSeatPads(mirrors, k, net.humans))
                if (gs.crafts.every((c) => c.finished)) {
                    net.watch = false
                    if (!net.podium) { net.podium = podiumRows(gs, net.humans); setPodium(net.podium) }
                }
                if (playing) drainEvents()
            } else {
                step(gs, playing ? readPad() : attractPad(gs))
                if (playing) drainEvents()
            }
            if (!prevGo && gs.lightPhase >= 1 && playing) {
                sfx.go(); goFlash = 1.1
                // the start-line swell sting — the bay answering the light (#3135 gap)
                audioController.playSweep(55, 150, 0.7, 'sine', 0.13)
                const h = hudRef.current
                if (h.countText) h.countText.textContent = 'GO'
                if (h.count) h.count.style.opacity = 1
            }
            prevGo = gs.lightPhase >= 1
            if (playing) {
                // engine: one persistent sawtooth that winds up with the hull
                // (#3135) — no per-frame one-shots to machine-gun the bus
                engineTick += 1
                const p = gs.crafts[mySeat()]
                audioController.setLoopVoice(52 + p.speed * 7.5 + (p.boosting ? 40 : 0), 0.035 + Math.min(0.05, p.speed * 0.004))
                if (engineTick % 9 === 0 && p.speed > 5) audioController.playNoise(0.05, 0.022)
                // #3280: the catch of the rail as a grab starts (one creak per grab)
                if (p.grab !== 'none' && prevGrab === 'none') sfx.grab()
                prevGrab = p.grab
                // a quiet, periodic wave swell — the bay breathing under the ride
                waveAmbT -= DT
                if (waveAmbT <= 0) { waveAmbT = 2.2 + Math.random() * 1.1; audioController.ambNoise(0.55, 0.045) }
            }
            // spray: carve fans, landing slaps, stitched wake behind every hull
            gs.crafts.forEach((c) => {
                const sternX = c.x - Math.sin(c.heading) * 2.1
                const sternZ = c.z - Math.cos(c.heading) * 2.1
                if (!c.airborne && wasAir[c.id]) {
                    // landing spray reads BY TRICK (#3280): flat keeps today's
                    // wide short sheet; a FLIP adds corkscrew bursts offset to
                    // either rail (droplets inherit the wind); a HANDSTAND drives
                    // a narrow column + the ring flash where the nose came down.
                    // #3281: the inverted slam is also HEAVIER — a taller wider
                    // sheet, longer-life droplets, a deeper jolt and its own tail.
                    spraySpawn(spray, c.x, c.y + 0.2, c.z, 26, 3.4, 5.0, false)
                    spraySpawn(spray, c.x, c.y + 0.15, c.z, 10, 0.45, 6.4, false, 0.85)
                    if (c.lastLand === 'flip') {
                        const sx = Math.cos(c.heading), sz = -Math.sin(c.heading)
                        spraySpawn(spray, c.x + sx * 1.3, c.y + 0.5, c.z + sz * 1.3, 7, 1.2, 7.2, false)
                        spraySpawn(spray, c.x - sx * 1.3, c.y + 0.7, c.z - sz * 1.3, 7, 1.2, 6.0, false)
                        skiJolt[c.id] = 1.15
                        if (playing && c.id === mySeat()) sfx.landFlip()
                    } else if (c.lastLand === 'handstand') {
                        spraySpawn(spray, c.x, c.y + 0.3, c.z, 16, 0.7, 9.0, false)
                        rings.flash(c.x, c.y + 0.06, c.z)
                        spraySpawn(spray, c.x, c.y + 0.2, c.z, 18, 4.6, 7.2, false)
                        spraySpawn(spray, c.x, c.y + 0.15, c.z, 8, 0.7, 8.0, false, 1.0)
                        skiJolt[c.id] = 1.35
                        if (playing && c.id === mySeat()) sfx.landInverted()
                    } else {
                        skiJolt[c.id] = 1
                    }
                }
                if (!c.airborne && Math.abs(c.steer) > 0.55 && c.speed > 8 && gs.tick % 2 === 0) {
                    const sideX = c.x + Math.cos(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    const sideZ = c.z - Math.sin(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    spraySpawn(spray, sideX, c.y + 0.25, sideZ, 3, 0.9, 3.6, false)
                }
                // emit-time wake width — the spray arms (#3342) and the ribbon share it
                const wakeW = 0.55 + c.speed * 0.085 + (c.boosting ? 0.5 : 0)
                if (c.speed > 3 && gs.tick % 3 === 0) wakeSpray(spray, sternX, c.y + 0.05, sternZ, c.heading, wakeW)
                if (c.boosting && gs.tick % 2 === 0) spraySpawn(spray, sternX, c.y + 0.2, sternZ, 2, 0.5, 1.6, false)
                // ribbon wake: the solid WR64 streak — stitched stern points,
                // wider when fast, hottest when boosting
                if (c.speed > 4 && gs.tick % 2 === 0) {
                    wakePush(wakes[c.id], sternX, c.y, sternZ, c.heading, wakeW)
                }
            })
        }

        function draw() {
            const t = gs.t
            sea.mat.uniforms.uT.value = t
            sea.mat.uniforms.uCam.value.copy(camera.position)
            sky.position.copy(camera.position)

            // THE BRIDGE: this frame's ridden seas + live front → shader slots
            // (pushSea maps A/B/front) — drawn sea ≡ ridden sea, wave for wave
            // and across the squall.
            pushSea(sea.mat, gs)
            // weather: keyed to the LIVE sim (gs.stage), never to a separate
            // picker state — the sea, sky, HUD and rain all read the exact same
            // source the hull rides, even through time-stepped DEV hooks.
            // #3348: the same front-pass weather mix rainAt answers — when a
            // re-roll's squall crosses the hull the sky darkens AT THAT MOMENT
            // (sea first, sky with it), not at the GO of the re-roll.
            const wantStorm = rainAt(gs, gs.crafts[mySeat()].x, gs.crafts[mySeat()].z)
            stormBlend += (wantStorm - stormBlend) * (1 - Math.exp(-25 * DT))
            sea.mat.uniforms.uStorm.value = stormBlend
            sea.mat.uniforms.uFlash.value = gs.flash
            sea.mat.uniforms.uFogCol.value.setRGB(
                0.81 + (0.27 - 0.81) * stormBlend, 0.90 + (0.32 - 0.90) * stormBlend, 0.94 + (0.37 - 0.94) * stormBlend,
            )
            sky.userData.mat.uniforms.uStorm.value = stormBlend
            sky.userData.mat.uniforms.uFlash.value = gs.flash
            sunLight.intensity = 2.0 * (1 - stormBlend * 0.62) + gs.flash * 2.2
            hemiLight.intensity = 1.0 * (1 - stormBlend * 0.5) + gs.flash * 1.2

            // storm rain swaddles the camera — density follows the rain AT
            // KAI'S HULL: the band edge is where the weather actually starts
            // and stops, not the stage flag (#3191). Smoothed so the bay
            // picker still fades weather in, but the squall crosses in ~1 s.
            const rainHere = rainAt(gs, gs.crafts[mySeat()].x, gs.crafts[mySeat()].z)
            rainVis += (rainHere - rainVis) * (1 - Math.exp(-10 * DT))
            if (rainVis > 0.3) rainSpawn(rain, camera.position.x, camera.position.y, camera.position.z, Math.max(2, Math.round(rainVis * (LITE ? 5 : 8))))
            rainStep(rain, DT)
            rain.pts.visible = rainVis > 0.05
            rain.mat.opacity = 0.30 + 0.28 * rainVis

            buoys.forEach((b, i) => {
                const g0 = gs.course.gates[i]
                // gates dim in the rain (#3191): the squall you're riding hides
                // the markers you must read — colour toward the storm fog
                buoyDim(b, RAIN_VIS * rainAt(gs, g0.x, g0.z))
                // bob with the full Gerstner motion — height AND horizontal flow —
                // on the surface Kai actually rides: the two lap tables mixed by
                // the SAME front weight the shader applies (rung 3), and roll with
                // its surface normal (#3135) instead of a fake sine wobble
                const wb = frontW(g0.x, g0.z, gs.front)
                const w = mixWater(g0.x, g0.z, t, gs.seaCur, gs.seaTarget, wb)
                const eN = 0.6
                const hs = (px, pz) => mixHeight(px, pz, t, gs.seaCur, gs.seaTarget, wb)
                const nx = hs(g0.x - eN, g0.z) - hs(g0.x + eN, g0.z)
                const nz = hs(g0.x, g0.z - eN) - hs(g0.x, g0.z + eN)
                const nInv = 1 / Math.hypot(nx, 2 * eN, nz)
                _v3a.set(nx * nInv, Math.max(0.55, 2 * eN * nInv), nz * nInv).normalize()
                b.quaternion.setFromUnitVectors(_up, _v3a)
                b.position.set(g0.x + w.dx, w.y, g0.z + w.dz)
                b.userData.flag.rotation.y = Math.sin(t * 6 + i) * 0.35
            })

            // moorings (#3159): ride the same sea Kai rides, swing at their
            // anchors, dim storm-side like the gates. A new course seed
            // re-hitches the fleet to new spots — the bay changes with the course.
            if (gs.course.seed !== moorSeed) {
                moorSeed = gs.course.seed
                const spots = boatSpots(moorSeed)
                scenery.forEach((s, i) => {
                    s.x = spots[i].x; s.z = spots[i].z; s.yaw = spots[i].yaw; s.swing = spots[i].swing
                })
                flock = gullSpots(moorSeed)
            }
            scenery.forEach((s) => {
                const wb = frontW(s.x, s.z, gs.front)
                const w = mixWater(s.x, s.z, t, gs.seaCur, gs.seaTarget, wb)
                const hs = (px, pz) => mixHeight(px, pz, t, gs.seaCur, gs.seaTarget, wb)
                const eN = 0.6
                const nx = hs(s.x - eN, s.z) - hs(s.x + eN, s.z)
                const nz = hs(s.x, s.z - eN) - hs(s.x, s.z + eN)
                const nInv = 1 / Math.hypot(nx, 2 * eN, nz)
                _v3a.set(nx * nInv, Math.max(0.55, 2 * eN * nInv), nz * nInv).normalize()
                s.g.quaternion.setFromUnitVectors(_up, _v3a)
                    .multiply(_qy.setFromAxisAngle(_up, s.yaw + Math.sin(t * 0.35 + s.swing) * 0.25))
                // moored: the swell rolls and lifts the hull but the anchor holds
                // the station — only a fourth of the horizontal flow gets through
                s.g.position.set(s.x + w.dx * 0.4, w.y, s.z + w.dz * 0.4)
                if (s.g.userData.swayer) s.g.userData.swayer.rotation.y = Math.sin(t * 0.9 + s.swing) * 0.35
                buoyDim(s.g, RAIN_VIS * rainAt(gs, s.x, s.z))
            })
            // gulls (#3218): wheeling over the anchorage — flap, glide, bank
            // into the turn, dimmed in a squall like the gates
            flock.birds.forEach((bird, i) => {
                const gm = gullMeshes[i]
                gullFrame(gm, flock, bird, t)
                buoyDim(gm, RAIN_VIS * rainAt(gs, gm.position.x, gm.position.z))
            })
            bellCool = Math.max(0, bellCool - DT)
            if (bellCool === 0 && screenRef.current === 'play') {
                const k = gs.crafts[mySeat()]
                if (bellSpot && Math.hypot(k.x - bellSpot.x, k.z - bellSpot.z) < 16) { bellCool = 5; sfx.bell() }
            }

            gs.crafts.forEach((c, i) => {
                const m = skiMeshes[i]
                m.root.position.set(c.x, c.y, c.z)
                m.root.rotation.y = c.heading + (c.airborne ? c.spin : 0)
                // #3276: the pitch verbs ride the tilt group — flip over the bow
                // or nose-down inverted; the sky-dim below reads how deep upside-down Kai is.
                m.tilt.rotation.x = c.pitch + (c.airborne ? c.flipAng : 0)
                m.tilt.rotation.z = c.roll * 0.6
                m.lean.rotation.z = -c.lean
                m.flame.visible = c.boosting
                if (c.boosting) m.flame.scale.set(1, 1 + Math.sin(t * 40) * 0.25, 1)
                // head lag on landing: jolt the head pivot, decaying
                skiJolt[i] = Math.max(0, (skiJolt[i] || 0) - DT * 2.6)
                // #3281: the pose comes off the sim's own pitch verbs.
                // A flip winds deep (tuck 1.3); a hold is stretched (tuck 0.18)
                // — the pose says what the verb paid before the score prints.
                const pose = airPose(c)
                const tuckTarget = !c.airborne ? 0 : pose === 'hold' ? 0.18 : pose === 'flip' ? 1.3 : 1.0
                airT[i] = (airT[i] || 0) + (tuckTarget - (airT[i] || 0)) * (1 - Math.exp(-DT * (tuckTarget > (airT[i] || 0) ? 11 : 6)))
                const tuck = airT[i]
                const land = skiJolt[i]
                // #3351: the two moments. pop = the push off the crest (legs
                // extend, body springs up, head lags behind the rise); absorb =
                // the sink at touchdown (knees take the slap deep, torso and
                // head compress). Both are sim windows (#3280 cosmetic kind) —
                // hard landing absorbs hard, a kiss barely bends.
                const pop = c.pop, absorb = c.absorb
                if (m.lowerBody) {
                    // knees flex on the slap, tuck lifts the feet mid-air,
                    // pop kicks the legs out straight off the deck. #3357 item 1:
                    // the pop vanished at the chase cam (~9 m) on phone widths, so
                    // the knee extension and rise are pushed up (larger, not faster
                    // — the sim's decay window is untouched, gameplay unchanged).
                    m.lowerBody.rotation.x = -0.22 * land - 0.32 * Math.min(1.3, tuck) + 0.30 * pop - 0.34 * absorb
                    m.lowerBody.position.y = 0.85 + 0.15 * tuck - 0.10 * land + 0.15 * pop - 0.18 * absorb
                }
                // the torso absorbs the slap; the head rides the same jolt.
                // The wind-over squashes the torso; the hold stretches it.
                const wind = c.airborne ? Math.max(0, Math.min(1, c.flipAng / 2.2)) : 0
                const deep = c.airborne ? Math.max(0, Math.min(1, (-c.flipAng - 1.15) / 1.2)) : 0
                m.lean.position.y = -0.16 * land + 0.06 * pop - 0.12 * absorb
                m.lean.scale.y = 1 + 0.06 * deep - 0.06 * wind - 0.07 * absorb
                if (m.headPivot) {
                    // #3357 item 2: the head used to ride BOTH the legacy skiJolt
                    // sink (0.17) and the new absorb sink (0.12) on top of the torso
                    // (lean) that already sank by both — a hard slam punched the
                    // helmet ~0.68 into the frame, a double-dip. Now the BODY is the
                    // sink (knees + torso ride land+absorb above) and the head only
                    // lags a little on the same body signal; absorb reads as the
                    // helmet NOD (rotation.x), never a second downward punch.
                    m.headPivot.position.y = 1.62 - 0.06 * skiJolt[i] - 0.10 * tuck - 0.05 * pop
                    m.headPivot.rotation.x = skiJolt[i] * 0.5 + tuck * 0.55 + wind * 0.12 - 0.28 * pop + 0.34 * absorb
                }
                // arms track the bar grip through the local lean; #3280 blends
                // them off the bar into a GRAB while a pitch trick turns — flip
                // takes the rail beside the hip, handstand reaches down the bow.
                if (m.arms) {
                    const w = grabW[i]
                    const kG = 1 - Math.exp(-DT * 14)
                    w.f += ((c.grab === 'flip' ? 1 : 0) - w.f) * kG
                    w.h += ((c.grab === 'handstand' ? 1 : 0) - w.h) * kG
                    for (let a = 0; a < m.arms.length; a++) {
                        const arm = m.arms[a]
                        const side = a === 0 ? -1 : 1
                        _v3a.set(side * 0.30, 0.98, 1.05)
                        if (w.f > 0.01) _v3a.lerp(_v3b.set(side * 0.52, 0.62, 0.12), w.f)
                        if (w.h > 0.01) _v3a.lerp(_v3b.set(side * 0.3, 0.5, 1.72), w.h)
                        _v3a.applyEuler(_euler.set(0, 0, c.lean))
                        _v3b.copy(_v3a).sub(arm.shoulder)
                        arm.pivot.quaternion.setFromUnitVectors(_down, _v3b.normalize())
                    }
                }
            })

            // #3368: spray rides the same headroom law as the crest lines — cool the hue
            // and dim the alpha under storm, so the pool never saturates on whitecaps.
            const tint = sprayTint(stormBlend)
            spray.mat.color.setRGB(tint.r, tint.g, tint.b)
            spray.mat.opacity = tint.opacity
            sprayStep(spray, DT)
            ringStep(rings, DT)
            // #3368 item 3 — pile-up budget: additive is no cap, so a converging
            // pack rides 3 wakes at once. Per hull, step the crest + haze back
            // toward a calm level while any other hull is near (<7 m); the
            // pack still shows three lines, not one posterized sheet.
            const wakeBudgets = gs.crafts.map((c) => {
                let nearest = Infinity
                for (const o of gs.crafts) {
                    if (o.id === c.id) continue
                    const d = Math.hypot(o.x - c.x, o.z - c.z)
                    if (d < nearest) nearest = d
                }
                return nearest >= 7 ? 1 : (0.35 + 0.65 * (nearest / 7))
            })
            wakes.forEach((w, i) => wakeStep(w, DT, stormBlend, wakeBudgets[i]))

            // chase-cam: sit behind and low over the water, FOV rides speed.
            // #3220: it follows MY hull — guests ride MAKO/TUNDRA, the bay
            // belongs to whoever is at the bar.
            const p = gs.crafts[mySeat()]
            const fx = Math.sin(p.heading), fz = Math.cos(p.heading)
            const behind = 9.2 - Math.min(2, p.speed * 0.06)
            const cx = p.x - fx * behind, cz = p.z - fz * behind
            const waveY = mixHeight(cx, cz, t, gs.seaCur, gs.seaTarget, frontW(cx, cz, gs.front))
            const tx = cx
            const tz = cz
            const ty = Math.max(waveY + 2.6, p.y + 2.4)
            if (!camInit) { camPos.set(tx, ty, tz); camInit = true }
            const k = 1 - Math.exp(-4.2 * DT)
            camPos.x += (tx - camPos.x) * k
            camPos.y += (ty - camPos.y) * k
            camPos.z += (tz - camPos.z) * k
            if (p.speed > 12.5) {
                camPos.x += (Math.random() - 0.5) * 0.06
                camPos.y += (Math.random() - 0.5) * 0.05
            }
            camera.position.copy(camPos)
            camera.lookAt(p.x + fx * 5.5, p.y + 1.1, p.z + fz * 5.5)
            const wantFov = 60 + Math.min(14, p.speed * 0.85)
            camera.fov += (wantFov - camera.fov) * 0.06
            camera.updateProjectionMatrix()

            // HUD (DOM refs — no per-frame React)
            const hud = hudRef.current
            // #3276: deep upside-down dims the world — the sky goes away mid-handstand
            if (hud.invert) {
                const inv = p.airborne ? Math.max(0, Math.min(1, (-p.flipAng - 1.15) / 1.2)) : 0
                hud.invert.style.opacity = String(0.34 * inv)
            }
            if (hud.score) hud.score.firstChild.nodeValue = String(gs.crafts[mySeat()].score)
            if (hud.speed) hud.speed.firstChild.nodeValue = String(Math.round(p.speed * 3.6))
            if (hud.lap) hud.lap.textContent = `LAP ${Math.min(p.lap, LAPS)}/${LAPS}`
            if (hud.rank) hud.rank.textContent = `P${rankAt(gs, mySeat())}/${gs.crafts.length}`
            if (hud.clock) hud.clock.textContent = fmt(gs.t)
            if (hud.boost) hud.boost.style.width = `${Math.round(p.boost * 100)}%`
            if (hud.pen) hud.pen.style.opacity = p.penalty > 0 ? 1 : 0
            if (hud.air) hud.air.style.opacity = p.airborne ? 1 : 0
            // 3-light countdown, then the GO flash — dots lit by lightPhase
            const playingNow = screenRef.current === 'play'
            if (hud.count) {
                const inCountdown = playingNow && gs.lightPhase < 1
                for (let i = 0; i < 3; i++) {
                    const dot = hud['countDot' + i]
                    if (!dot) continue
                    const lit = inCountdown && gs.lightPhase * 3 > i + 0.25
                    dot.style.background = lit ? '#ff5f5f' : 'transparent'
                    dot.style.boxShadow = lit ? '0 0 14px rgba(255,95,95,0.9), 0 0 3px #fff' : 'none'
                }
                if (inCountdown) {
                    if (hud.countText) hud.countText.textContent = ''
                    hud.count.style.opacity = 1
                } else {
                    goFlash -= DT
                    // hide the GO once its flash is done — driven by the sim's
                    // lightPhase, not the display chain, so DEV/contract-driven
                    // races clear it too (it hung on screen through a squall before)
                    if (goFlash <= 0) hud.count.style.opacity = 0
                }
            }
            if (hud.bay) {
                hud.bay.textContent = stormBlend > 0.5
                    ? (gs.front ? `STORM BAY · SQUALL ${Math.round(Math.min(1, gs.front.prog / (2 * gs.front.h + gs.front.band)) * 100)}%` : `STORM BAY · SWELL ${Math.min(p.lap, LAPS)}/${LAPS}`)
                    : 'SUNNY BAY'
                hud.bay.style.color = stormBlend > 0.5 ? '#a9c0d2' : '#bfe9ff'
            }
            if (hud.pop) {
                flashPop -= DT
                if (flashPop <= 0) hud.pop.style.opacity = 0
            }
            if (hud.coach) {
                coachFlash -= DT
                if (coachFlash <= 0) hud.coach.style.opacity = 0
            }
            // next-gate hint: colour chip + side arrow + second-next preview
            const gi = p.judged.findIndex((j) => j === 0)
            if (gi >= 0 && hud.gate) {
                const g0 = gs.course.gates[gi]
                const g1 = gs.course.gates[gi + 1]
                const fmtGate = (g) => (g.color === 'red' ? 'RED RIGHT' : 'YELLOW LEFT')
                if (hud.gateNext) hud.gateNext.textContent = `▶ ${fmtGate(g0)}`
                if (hud.gateThen) hud.gateThen.textContent = g1 && !narrowUI ? `  ·  ${fmtGate(g1)}` : ''
                hud.gate.style.color = g0.color === 'red' ? '#ff8d80' : '#ffe08a'
            }
        }

        let raf = 0
        let last = performance.now()
        let acc = 0
        function loop(now) {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, 250)
            last = now
            const locked = import.meta.env.DEV && contractHoldsLoop()
            while (acc >= SIM_MS) {
                if (!pausedRef.current && !locked) simTick()
                acc -= SIM_MS
            }
            draw()
            renderer.render(scene, camera)
        }

        // #3365: phone widths (<480px CSS) — the shared chrome pills (ARCADE/
        // FEEDBACK stack left, speaker+PAUSE right) claim ~100px per side, so
        // the centre column keeps its next-gate banner to one line there: the
        // second-next preview yields (the buoys themselves show it in-world).
        let narrowUI = false
        function resize() {
            const w = wrap.clientWidth, h = wrap.clientHeight
            narrowUI = w < 480
            renderer.setSize(w, h, false)
            camera.aspect = w / Math.max(1, h)
            camera.updateProjectionMatrix()
        }
        resize()
        window.addEventListener('resize', resize)

        // --- input / screens ----------------------------------------------------
        let humanSeed = seedFromQuery() ?? freshSeed()
        const startRaceWith = (seed, bayName, online, humansArg) => {
            gs = makeGame(seed >>> 0, bayName)
            // #3244 item 2: watchers never ride — racing seats are < SEATS and
            // never a slot that announced itself with 'spec'. When the host's
            // 'go' carries the roster it is the authority: every rider freezes
            // the SAME humans list, or the overrides (and the sims) diverge.
            net.humans = online
                ? (humansArg ? humansArg.slice() : net.room.slots.filter((s) => s < SEATS && !net.watchers.has(s)))
                : []
            net.watch = false
            net.hold = null
            net.racing = !!online
            net.solo = online && net.humans.length <= 1
            // seats freeze at kickoff (the #1705 roster law): who rides which
            // hull is fixed for the whole race on every box.
            gs.crafts.forEach((c, i) => { c.human = online && net.humans.includes(i) })
            ls.reset()
            if (online) ls.setPeers(net.humans.filter((s) => s !== mySeat()))
            mirrors.forEach((m) => m.clear())
            evidence.reset()
            setNetReport('')
            stalledTicks = 0
            buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
            camInit = false
            prevGo = false
            goFlash = 0
            waveAmbT = 2.0
            skiJolt = gs.crafts.map(() => 0)
            airT = gs.crafts.map(() => 0)
            wakes.forEach((w) => { w.pts.length = 0 }); grabW.forEach((g) => { g.f = 0; g.h = 0 }); prevGrab = 'none'
            trickPop = ''
            coachFlash = 0
            coachShown.flip = false
            coachShown.handstand = false
            if (hudRef.current.coach) hudRef.current.coach.style.opacity = 0
            const h = hudRef.current
            if (h.count) h.count.style.opacity = 0
            if (h.countText) h.countText.textContent = ''
            audioController.startLoopVoice(52)
            setResult(null)
            net.podium = null
            net.hold = null
            setPodium(null)
            setMode('play')
        }
        const startRace = () => {
            humanSeed = seedFromQuery() ?? freshSeed()
            netSay('')
            startRaceWith(humanSeed, bayRef.current, false)
        }
        // kickoff (host's local start AND the guest's 'go' both land here):
        // one seed, one bay, one field — the room races the same water.
        const startOnline = (m) => {
            netSay('')
            pausedRef.current = false
            setPaused(false)
            if (net.role === 'watch') {
                // #3244 item 2: a watcher at kickoff needs no history — it can
                // spectate from tick 0 on the live wire alone.
                startRaceWith(m.seed >>> 0, m.bay === 'storm' ? 'storm' : 'sunny', false)
                net.humans = (net.room ? net.room.slots : []).filter((s) => s !== net.slot && s < SEATS && !net.watchers.has(s))
                gs.crafts.forEach((c, i) => { c.human = net.humans.includes(i) })
                net.watch = true
                netSay('SPECTATING — NO SEAT, ALL SEA')
                setMode('play')
                return
            }
            startRaceWith(m.seed >>> 0, m.bay === 'storm' ? 'storm' : 'sunny', true, m.humans || null)
        }
        // beginSpectate (#3244 item 2): the watcher now holds the race spine
        // (sv0) and, if it joined mid-race, every history chunk. Build the
        // game, inflate the pads into mirrors, fast-forward the deterministic
        // sim to the live tick — all synchronously, so the paint loop never
        // sees a half-built sea — then ride the live wire from here.
        const beginSpectate = () => {
            const b = net.shBuf
            if (!b || b.got.size < b.n) return
            startRaceWith(b.seed, b.bay, false)
            net.humans = b.humans
            // the riders' hulls must skip the autopilot rng here too, or the
            // watcher's sea drifts from the room's.
            gs.crafts.forEach((c, i) => { c.human = b.humans.includes(i) })
            for (let i = 0; i < b.n; i++) inflateSh({ i, hex: b.got.get(i) || '' }, mirrors)
            for (let k = 0; k < b.k && k < gs.tick + 4000; k++) {
                step(gs, fromWire(mirrors[0].get(k) || toWire({})), assembleSeatPads(mirrors, k, net.humans))
            }
            net.watch = true
            net.shBuf = null
            netSay('SPECTATING — NO SEAT, ALL SEA')
            setMode('play')
        }

        const endToMenu = () => {
            net.racing = false
            net.solo = false
            net.podium = null
            net.hold = null
            setPodium(null)
            if (net.role === 'host' && net.room) net.room.setPhase('waiting')
            audioController.stopLoopVoice()
            if (hudRef.current.coach) hudRef.current.coach.style.opacity = 0
            coachFlash = 0
            coachShown.flip = false
            coachShown.handstand = false
            setMode('attract')
        }
        // attract/over preview reroll when the picker changes bays
        previewRef.current = () => {
            gs = makeGame(freshSeed(), bayRef.current)
            buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
            wakes.forEach((w) => { w.pts.length = 0 }); grabW.forEach((g) => { g.f = 0; g.h = 0 }); prevGrab = 'none'
            camInit = false
            prevGo = false
        }
        startRaceRef.current = () => {
            if (net.active) {
                // #3244 item 4: from the podium the host calls the rematch — the
                // room re-races on a fresh seed; seated guests ride the 'go'
                // without re-entering a code. A guest steps back to the lobby.
                if (screenRef.current === 'over' && net.role !== 'host') { endToMenu(); return }
                if (net.role === 'host' && net.phase === 'waiting') net.lobby.start({ seed: hostSeed(), bay: bayRef.current, humans: net.room.slots.filter((s) => s < SEATS && !net.watchers.has(s)) })
                return
            }
            startRace()
        }

        if (net.active) {
            const lobby = createLobby({
                slug: 'tidal-rush',
                cap: WATCH_CAP,
                relay: relayUrl,
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (s) => {
                    // #3244 item 2: a watcher announces itself the moment it is
                    // in the room — every box then knows that seat never rides.
                    if (net.role === 'watch' && s.phase === 'waiting' && net.room) net.room.send('spec', {})
                    // #3244 item 3: a welcome that lands mid-race, same code and
                    // same seat, IS the rejoin — my seat was held for me. Ride
                    // straight back in (the waiting-room overlay never swallows a
                    // live bay) and replay the pads the field lost in transit.
                    if (net.racing && s.phase === 'waiting' && net.room && s.code === net.code && net.room.yourSlot === net.slot) {
                        net.room.setPhase('racing')
                        net.phase = 'racing'
                        replayOwnPads()
                        netSay('RE-SYNCED — BACK IN THE RACE')
                        pushNetUi()
                        return
                    }
                    net.phase = s.phase
                    net.code = s.code
                    if (s.slot >= 0) net.slot = s.slot
                    net.joinHref = s.joinHref
                    pushNetUi()
                },
                onRoster: () => { pushNetUi() },
                onJoin: () => pushNetUi(),
                onLeave: ({ slot }) => {
                    const s = slot | 0
                    // #3244 item 2: a watcher leaving changes nothing — it was
                    // never in the field.
                    if (net.watchers.delete(s)) { pushNetUi(); return }
                    seatGone(s); pushNetUi()
                },
                onDrop: () => {
                    // my own socket died mid-race: the field holds for me while
                    // I climb the backoff ladder (#546 law) and reclaim the same
                    // code — the welcome above rides me back into the race.
                    if (!net.racing || !net.code) return
                    netSay('SIGNAL LOST — RECONNECTING…')
                    let attempt = 0
                    const climb = () => {
                        if (!net.racing || net.phase === 'racing' || attempt >= 8) return
                        attempt++
                        net.room.connect(net.code, WATCH_CAP)
                        setTimeout(climb, retryDelay(attempt))
                    }
                    climb()
                },
                onStart: (m) => startOnline(m),
                on: {
                    // #3244 item 2 — spec: "I'm watching, not racing". Every box
                    // records the seat so kickoff rosters exclude it; the host —
                    // the only box holding the full pad ring — answers with the
                    // race's spine (sv0) and the history chunks (sh) that let the
                    // watcher fast-forward its own sim to the live tick.
                    spec: (m) => {
                        const s = m.s | 0
                        if (s === mySeat()) return
                        net.watchers.add(s)
                        if (net.role === 'host' && net.racing && net.room) {
                            net.room.send('sv0', { seed: gs.seed, bay: gs.stage, k: gs.tick, humans: net.humans })
                            for (const c of net.hist.chunks()) if (c.n) net.room.send('sh', c)
                        }
                        pushNetUi()
                    },
                    sv0: (m) => {
                        if (net.role !== 'watch' || net.watch) return
                        net.shBuf = {
                            seed: m.seed >>> 0, bay: m.bay === 'storm' ? 'storm' : 'sunny', k: m.k | 0,
                            humans: (m.humans || []).filter((s) => s !== net.slot && s < SEATS),
                            n: 0, got: new Map(),
                        }
                        if (!m.k) beginSpectate() // at the line already — no history to wait for
                    },
                    sh: (m) => {
                        if (net.role !== 'watch' || !net.shBuf || net.watch) return
                        net.shBuf.n = m.n | 0
                        net.shBuf.got.set(m.i | 0, m.hex || '')
                        if (net.shBuf.got.size >= net.shBuf.n) beginSpectate()
                    },
                    pad: (m) => {
                        const s = m.s | 0
                        if (mirrors[s]) mirrors[s].set(m.k | 0, m.p)
                        if (s !== mySeat()) ls.gotPad(m.k | 0, m.p, s)
                    },
                    hs: (m) => {
                        if (net.watch) return // the referee's table is for riders
                        const r = ls.gotHash(m.k | 0, m.h >>> 0, m.s | 0)
                        if (net.racing) evidence.peer(m.k | 0, m.h >>> 0, m.s | 0)
                        if (r && r.desync !== undefined && net.racing) {
                            evidence.markBad(m.k | 0, m.s | 0, r.mine, r.theirs)
                            net.racing = false
                            pausedRef.current = true
                            netSay('SIMS DIVERGED — THE HOST RESTARTS THE BAY')
                            setNetReport(evidence.text(net.code, mySeat()))
                        }
                    },
                    gone: () => { if (net.role === 'guest' || net.role === 'watch') { net.racing = false; net.watch = false; netSay('THE HOST SAILED HOME') } },
                    // #3244 item 4: the host's finish sheet — the guest's podium
                    // comes from the room, and its phase rides back to waiting so
                    // the lobby knows the bay is open for the rematch.
                    pod: (m) => {
                        if ((net.role !== 'guest' && net.role !== 'watch') || net.podium) return
                        net.podium = podRows(m.rows, RIDE_NAMES)
                        setPodium(net.podium)
                        if (net.room) net.room.setPhase('waiting')
                        pushNetUi()
                    },
                },
            })
            net.lobby = lobby
            net.room = lobby.room
            if (net.role === 'host') lobby.open()
            else lobby.join(nq.get('room'))
            pushNetUi()
        }

        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || e.code === 'Slash') {
                // the bay pauses; a live room doesn't — stepping out mid-
                // lockstep would starve the field of pads (pause is offline-only)
                if (screenRef.current === 'play' && !net.racing) setPause(!pausedRef.current)
                return
            }
            if (pausedRef.current) return
            keys.add(e.code)
            if (screenRef.current === 'attract' || screenRef.current === 'over') {
                // ◀ ▶ on the menu picks the bay instead of starting the race
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    const next = bayRef.current === 'sunny' ? 'storm' : 'sunny'
                    bayRef.current = next; setBay(next); previewRef.current()
                    return
                }
                if (net.active) {
                    // #3220/#3244: on a live room the host's key starts the ROOM —
                    // from the podium that same key is the REMATCH (fresh seed,
                    // guests ride the 'go', nobody re-enters a code). A guest's
                    // over-screen key steps back to the waiting room.
                    if (screenRef.current === 'over' && net.role !== 'host') { endToMenu(); return }
                    if (net.role === 'host' && net.phase === 'waiting') net.lobby.start({ seed: hostSeed(), bay: bayRef.current, humans: net.room.slots.filter((s) => s < SEATS && !net.watchers.has(s)) })
                    return
                }
                if (e.code !== 'Tab') startRace()
            }
        }
        const onKeyUp = (e) => keys.delete(e.code)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        // --- DEV hooks + contract ----------------------------------------------
        if (import.meta.env.DEV) {
            window.__tidalTest = {
                get state() { return stateOf(gs) },
                hash: () => stateHash(gs),
                press: (code) => { keys.add(code); if (screenRef.current !== 'play') startRace() },
                release: (code) => keys.delete(code),
                setPad: (o) => Object.assign(padRef, o),
                step: (n = 1) => { for (let i = 0; i < n; i++) simTick(); return stateOf(gs) },
                setMode: (m) => { if (m === 'play') startRace(); else setMode(m) },
                probe: () => ({ ...stateOf(gs), seed: gs.seed, screen: screenRef.current }),
                evidence: () => ({ rows: evidence.rows.length, text: evidence.text(net.code, mySeat()) }),
                autoDrive: (n = 60) => {
                    // DEV-only: drive Kai with the game's OWN autopilot through the
                    // live screen (used by tidaldrive to win a browser race fast)
                    for (let i = 0; i < n && !gs.done; i++) { step(gs, autoPad(gs)); drainEvents() }
                    return stateOf(gs)
                },
                pickBay: (b) => { bayRef.current = b === 'storm' ? 'storm' : 'sunny'; setBay(bayRef.current); if (screenRef.current !== 'play') previewRef.current() },
                prognose: () => {
                    // replay the pilot forward from LIVE state to see if Kai can still win
                    const snap = JSON.parse(JSON.stringify(gs))
                    let t = 0
                    while (!snap.done && t < 60 * 240) { step(snap, autoPad(snap)); t++ }
                    gs = snap ? JSON.parse(JSON.stringify(gs)) : gs
                    return { reachable: snap.done, rank: snap.rank }
                },
            }
            mountDbg({
                title: 'TIDAL RUSH',
                getState: () => stateOf(gs),
                actions: [
                    { label: 'FULL BOOST', run: () => { gs.crafts[0].boost = 1 } },
                    { label: 'CLEAR GATES', run: () => { gs.crafts[0].judged = gs.crafts[0].judged.map(() => 1) } },
                    { label: 'PROGNOSIS', run: () => window.__tidalTest.prognose() },
                ],
            })
            exposeGame({
                id: 'tidal-rush',
                buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y'],
                reset: (seed) => {
                    humanSeed = seed >>> 0
                    gs = makeGame(humanSeed, bayRef.current)
                    buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
                    wakes.forEach((w) => { w.pts.length = 0 }); grabW.forEach((g) => { g.f = 0; g.h = 0 }); prevGrab = 'none'
                    airT = gs.crafts.map(() => 0)
                    camInit = false
                    prevGo = false
                    setMode('play')
                    return stateOf(gs)
                },
                tick: (pad) => {
                    const sp = {
                        throttle: pad.up ? 1 : 0,
                        steer: typeof pad.x === 'number' && pad.x !== 0 ? pad.x : (pad.right ? 1 : 0) - (pad.left ? 1 : 0),
                        brake: !!pad.down,
                        a: !!pad.a,
                        b: !!pad.b,
                    }
                    if (screenRef.current !== 'play') step(gs, autoPad(gs))
                    else step(gs, sp)
                    drainEvents()
                    return stateOf(gs)
                },
                state: () => stateOf(gs),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = JSON.parse(JSON.stringify(s)); camInit = false; return stateOf(gs) },
            })
        }
        exposeFeedbackState(() => ({ seed: gs.seed, tick: gs.tick, score: gs.score, done: gs.done, rank: gs.rank, podium: net.podium }))

        let rafStarted = false
        if (!rafStarted) { rafStarted = true; raf = requestAnimationFrame(loop) }

        return () => {
            cancelAnimationFrame(raf)
            if (net.room) { try { net.room.reset() } catch { /* gone */ } }
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            previewRef.current = null
            startRaceRef.current = null
            if (import.meta.env.DEV) {
                delete window.__tidalTest
                unmountDbg()
                unexposeGame()
            }
            audioController.stopLoopVoice()
            unexposeFeedbackState()
            renderer.dispose()
            sea.mesh.geometry.dispose()
            sea.mat.dispose()
            spray.geo.dispose()
            spray.mat.dispose()
            wakes.forEach((w) => { w.geo.dispose(); w.mat.dispose(); w.glowGeo.dispose(); w.glowMat.dispose() })
            rings.geo.dispose()
            rings.rings.forEach((r) => r.mesh.material.dispose())
            rain.geo.dispose()
            rain.mat.dispose()
            canvas.remove()
        }
    }, [setMode, setPause])

    const play = screen === 'play'
    const entry = GAMES.find((g) => g.label === 'TIDAL RUSH')

    return (
        <div
            className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={() => {
                // tap-to-start on phones (the pad only lives on the play screen)
                if (pausedRef.current) return
                if (screenRef.current === 'attract' || screenRef.current === 'over') { if (startRaceRef.current) startRaceRef.current() }
            }}
        >
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none font-mono transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                {/* #3276 invert dim — the world goes quiet while Kai is upside down */}
                <div ref={setHud('invert')} className="absolute inset-0 bg-indigo-950" style={{ opacity: 0, transition: 'opacity 80ms' }} />
                <div className="absolute top-[4.75rem] left-3 bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5 text-cyan-50">
                    <div className="text-[9px] tracking-widest opacity-70">SCORE</div>
                    <div ref={setHud('score')} className="text-xl font-black text-yellow-200 leading-6">0</div>
                    <div ref={setHud('lap')} className="text-[11px] tracking-widest">LAP 1/3</div>
                </div>
                <div className="absolute top-2 left-0 right-0 flex flex-col items-center text-center">
                    <div ref={setHud('bay')} className="text-[10px] tracking-[0.35em] mb-1" style={{ color: '#bfe9ff' }}>SUNNY BAY</div>
                    <div ref={setHud('gate')} className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm font-bold tracking-widest">
                        <span ref={setHud('gateNext')} /><span ref={setHud('gateThen')} style={{ opacity: 0.6, fontWeight: 600 }} />
                    </div>
                    <div ref={setHud('pop')} className="mt-2 text-xl font-black text-cyan-200 transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 14px #08f, 2px 2px 0 #000' }} />
                    <div ref={setHud('air')} className="mt-1 text-xs tracking-[0.35em] text-yellow-200 transition-opacity duration-150" style={{ opacity: 0 }}>A I R</div>
                    <div ref={setHud('coach')} className="mt-2 text-[11px] font-mono tracking-widest text-amber-200 border border-amber-300/40 bg-black/70 rounded px-3 py-1 transition-opacity duration-300" style={{ opacity: 0 }} />
                </div>
                <div ref={setHud('count')} className="absolute top-[24%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 transition-opacity duration-150" style={{ opacity: 0 }}>
                    <div className="flex gap-3">
                        <span ref={setHud('countDot0')} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid #ff8d80', background: 'transparent', transition: 'background 120ms, box-shadow 120ms' }} />
                        <span ref={setHud('countDot1')} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid #ff8d80', background: 'transparent', transition: 'background 120ms, box-shadow 120ms' }} />
                        <span ref={setHud('countDot2')} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid #ff8d80', background: 'transparent', transition: 'background 120ms, box-shadow 120ms' }} />
                    </div>
                    <div ref={setHud('countText')} className="text-8xl font-black italic text-yellow-300" style={{ textShadow: '0 0 26px rgba(0,0,0,0.9), 4px 4px 0 #0a6' }} />
                </div>
                <div className="absolute top-[4.75rem] right-3 text-right text-cyan-50">
                    <div className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5">
                        <div className="text-[9px] tracking-widest opacity-70">SPEED</div>
                        <div ref={setHud('speed')} className="text-2xl font-black leading-6">0<span className="text-[10px]"> km/h</span></div>
                    </div>
                    <div ref={setHud('rank')} className="mt-1 bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm">P1/3</div>
                    <div ref={setHud('clock')} className="mt-1 bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm">0:00.0</div>
                </div>
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-56">
                    <div className="h-3 rounded bg-black/50 border border-cyan-300/30 overflow-hidden">
                        <div ref={setHud('boost')} className="h-full bg-gradient-to-r from-cyan-300 to-sky-500" style={{ width: '0%' }} />
                    </div>
                    <div className="text-center text-[9px] tracking-widest text-cyan-200/70 mt-1">SPRINT — hold BOOST · AIR: BRAKE FLIP / BRAKE+GAS HANDSTAND</div>
                    <div ref={setHud('pen')} className="text-center text-xs font-black tracking-widest text-red-300 mt-1 transition-opacity duration-200" style={{ opacity: 0 }}>WRONG SIDE — CHOKED</div>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-6xl font-black italic mb-2 text-white" style={{ textShadow: '4px 0 0 #0a7fb8, -4px 0 0 #ff5a3c, 0 12px 30px #000' }}>TIDAL RUSH</h1>
                    <div className="flex items-center gap-4 mb-2">
                        <button type="button" onClick={() => pickBay('sunny')} onPointerDown={(e) => e.stopPropagation()} className={`pointer-events-auto px-3 py-1 border rounded text-[11px] tracking-[0.3em] font-bold ${bay === 'sunny' ? 'border-yellow-300 text-yellow-200 bg-yellow-300/10' : 'border-cyan-300/25 text-cyan-200/45'}`}>SUNNY BAY</button>
                        <button type="button" onClick={() => pickBay('storm')} onPointerDown={(e) => e.stopPropagation()} className={`pointer-events-auto px-3 py-1 border rounded text-[11px] tracking-[0.3em] font-bold ${bay === 'storm' ? 'border-slate-100 text-slate-100 bg-slate-400/20' : 'border-cyan-300/25 text-cyan-200/45'}`}>STORM BAY</button>
                    </div>
                    <p className="text-[10px] tracking-[0.35em] text-cyan-200/55 mb-6">{bay === 'storm' ? 'THE SWELL RE-ROLLS EVERY LAP' : 'SLALOM UNDER SUN'} · 3 LAPS · ◀ ▶ TO PICK</p>
                    <AttractMessage className="mb-6 text-cyan-50/85" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-yellow-300">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && result && !(netUi && podium) && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${result.place === 1 ? 'text-yellow-300' : 'text-cyan-200'}`}>
                        {result.place === 1 ? (result.stage === 'storm' ? 'STORM MASTER' : 'BAY CHAMPION') : `P${result.place} — THE FIELD TOOK IT`}
                    </h2>
                    <p className="text-lg mb-3">{result.stage === 'storm' ? 'storm bay' : 'sunny bay'} · time {fmt(result.t)} · score {result.score}</p>
                    <p className="text-sm text-cyan-200/80 mb-4">{result.place === 1 ? (result.stage === 'storm' ? 'You read a sea that re-rolled under you. The bay never saw you coming.' : 'Mako never saw your wake.') : 'Cleaner gates charge more sprint — try the crests.'}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY · ◀ ▶ PICK BAY</p>
                </div>
            )}

            {/* #3244 item 4: the ROOM PODIUM — one finish sheet for the whole
                bay, every seat by finish time. The host calls the rematch from
                the line (any key / GO AGAIN); seated guests wait on the 'go'
                and never re-enter the code. */}
            {screen === 'over' && netUi && podium && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className="text-3xl font-black mb-1 text-yellow-300">ROOM PODIUM</h2>
                    <p className="text-xs text-cyan-300/70 mb-3">{`ROOM ${netUi.code || '····'} · ${netUi.phase === 'waiting' ? 'THE BAY IS SET' : 'COMING ABOUT…'}`}</p>
                    <div className="flex flex-col gap-1 w-72 max-w-full mb-4">
                        {podium.map((r, i) => (
                            <div key={r.seat} className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm font-bold ${i === 0 ? 'border-yellow-300/60 bg-yellow-300/10 text-yellow-200' : 'border-cyan-300/25 bg-cyan-300/5 text-cyan-100'}`}>
                                <span className="w-6 shrink-0">{`P${i + 1}`}</span>
                                <span className="flex-1 text-left">{r.name}</span>
                                <span className="tabular-nums">{fmt(r.t)}</span>
                                <span className="tabular-nums opacity-80">{r.score}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.seat === netUi.slot ? 'bg-yellow-300/25 text-yellow-100' : r.human ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/10 text-white/60'}`}>
                                    {r.seat === netUi.slot ? 'YOU' : r.human ? 'RIDER' : 'ACE'}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="animate-pulse font-bold text-yellow-300">
                        {netUi.role === 'host' ? 'ANY KEY — GO AGAIN · REMATCH THE ROOM' : 'WAITING FOR THE HOST TO CALL THE REMATCH…'}
                    </p>
                </div>
            )}

            {/* #3220: the shared waiting room sits over the idle bay — the
                attract keep streaming behind it like every other lobby game. */}
            {netUi && netUi.phase !== 'racing' && screen === 'attract' && (
                <Lobby
                    state={netUi}
                    title="OPEN BAY"
                    names={netUi.names}
                    startHint="PICK A BAY · PRESS ANY KEY TO SEND THE FIELD"
                    accent={{
                        text: 'text-cyan-50',
                        dim: 'text-cyan-300/70',
                        live: 'border-cyan-300/40 text-cyan-100',
                        codeGlow: { textShadow: '3px 0 0 #0a7fb8, -3px 0 0 #ff5a3c' },
                    }}
                />
            )}

            {/* #3220: live-room identity chip — which ski you ride, which bay you're in */}
            {netUi && (screen === 'play' || screen === 'over') && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none bg-black/45 border border-cyan-300/30 rounded px-2 py-0.5 text-[10px] tracking-[0.3em] text-cyan-100 font-mono">
                    {`ROOM ${netUi.code || '····'} · YOU: ${RIDE_NAMES[Math.max(0, netUi.slot)]}`}
                </div>
            )}

            {/* #3220: dropout/desync say — #863 law: never stall silently */}
            {netMsg && (
                <div className="absolute top-[38%] left-1/2 -translate-x-1/2 pointer-events-none bg-black/70 border border-red-300/50 rounded px-4 py-2 text-sm font-black tracking-[0.25em] text-red-200 font-mono">
                    {netMsg}
                </div>
            )}

            {/* #3244 item 5: the freeze carries its own receipts — the last
                hash boundaries (tick, my hash, each peer's) with the diverged
                row marked, copyable so a bug report has numbers, not vibes. */}
            {netReport && (
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 max-w-[92%] bg-black/85 border border-amber-300/40 rounded p-2 select-all">
                    <pre className="text-[9px] leading-[1.6] text-amber-100 font-mono whitespace-pre">{netReport}</pre>
                    <button
                        onClick={() => {
                            const btn = document.getElementById('tidal-copy')
                            const done = (okCopy) => { if (btn) btn.textContent = okCopy ? 'COPIED ✓' : 'SELECT + COPY' }
                            if (navigator.clipboard) navigator.clipboard.writeText(netReport).then(() => done(true), () => done(false))
                            else {
                                // http / older WebKit: park the text in a textarea the
                                // player can select even if programmatic copy fails.
                                const ta = document.createElement('textarea')
                                ta.value = netReport
                                document.body.appendChild(ta)
                                ta.select()
                                let okCopy = false
                                try { okCopy = document.execCommand('copy') } catch { okCopy = false }
                                ta.remove()
                                done(okCopy)
                            }
                        }}
                        className="mt-1 w-full bg-amber-300/15 border border-amber-300/40 rounded px-2 py-0.5 text-[10px] tracking-[0.25em] text-amber-100 font-mono"
                        id="tidal-copy"
                    >
                        COPY REPORT
                    </button>
                </div>
            )}

            {paused && <PauseOverlay game={entry} onResume={() => setPause(false)} />}
            <VirtualControls secondAction={{ label: 'BOOST', code: 'ShiftLeft' }} visible={play && !paused} />
        </div>
    )
}

export default TidalRushGame

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
import { createLockStep } from '../../utils/lockstep.js'
import { makeGame, step, autoPad, stateOf, stateHash, rankAt, LAPS, SIM_MS, DT, rainAt, RAIN_VIS } from './sim.js'
import { mixWater, mixHeight, frontW } from './water.js'
import { contractHoldsLoop } from '../../utils/gameContract'
import { SEATS, PAD_DELAY, HASH_EVERY, RIDE_NAMES, toWire, fromWire, assembleSeatPads, hostSeed, createEvidence } from './net.js'
import { makeSea, makeSky, makeBuoy, buoyDim, makeSki, makeSpray, spraySpawn, sprayStep, makeWake, wakePush, wakeStep, makeRain, rainSpawn, rainStep, makeLights, pushSea, boatSpots, makeBoat, makeBellBuoy, gullSpots, makeGull, gullFrame } from './art.js'

const PRESS = 'PRESS ANY KEY OR TAP'
const MESSAGES = [
    'RED BUOY RIGHT · YELLOW BUOY LEFT',
    'CLEAN PASSES CHARGE THE SPRINT',
    'HIT A CREST · HOLD SPIN · BANK THE TRICK',
    'FULL-LOCK STEER OFF A CREST = BARREL ROLL',
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
            scene.add(w.darkMesh)
            scene.add(w.mesh)
            return w
        })
        const rain = makeRain(LITE ? 240 : 420)
        scene.add(rain.pts)
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
        let waveAmbT = 2.0
        let camInit = false
        let engineTick = 0
        let flashPop = 0
        let goFlash = 0

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
            humans: [], racing: false, solo: false,
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
            seats: seatModel(SEATS, net.room ? net.room.slots : (net.slot >= 0 ? [net.slot] : [])),
            joinHref: net.joinHref,
            names: RIDE_NAMES,
        } : null)
        const netSay = (m) => { netMsgRef.current = m; setNetMsg(m) }

        // a seat dropped mid-race (#863 law — say so, never stall silently).
        // With peers left, their hull coasts on empty wire pads and the pad
        // streams stay absolute, so the remaining boxes keep hashing equal.
        // Alone, the bay hands open seats back to the autopilot to finish.
        const seatGone = (seat) => {
            if (!net.racing) return
            net.humans = net.humans.filter((s) => s !== seat)
            ls.setPeers(net.humans.filter((s) => s !== mySeat()))
            gs.crafts.forEach((c, i) => { if (!net.humans.includes(i)) c.human = false })
            net.solo = net.humans.length <= 1
            netSay(net.solo ? 'RIDER DROPPED — FINISHING SOLO' : 'RIDER DROPPED — THEIR SKI COASTS')
            pushNetUi()
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
            swell: () => audioController.playSweep(90, 210, 0.9, 'sine', 0.16),
            rain: (on) => {
                // the band edge: a wind gust in, a lifting sweep out (#3191)
                if (on) { audioController.playSweep(540, 150, 0.7, 'sine', 0.08); audioController.playNoise(0.55, 0.05) }
                else audioController.playSweep(150, 480, 0.5, 'sine', 0.05)
            },
            airLand: () => { audioController.playSweep(1500, 320, 0.24, 'sine', 0.09); audioController.playNoise(0.14, 0.06) },
            bell: () => { audioController.playTone(1568, 0.5, 'sine', 0.05); audioController.playTone(2349, 0.3, 'sine', 0.016, 0.02) },
            thunder: () => { audioController.playNoise(0.5, 0.12); audioController.playSweep(70, 38, 0.8, 'sawtooth', 0.1) },
            finish: (win) => {
                const base = win ? [523, 659, 784, 1047] : [392, 330, 262]
                base.forEach((f, i) => audioController.playTone(f, 0.16, 'square', 0.12, i * 0.13))
            },
        }

        let trickPop = ''
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
                if (!alone && !ls.ready(k)) {
                    stalledTicks++
                    if (stalledTicks === 120) netSay('HOLD ON — SYNCING THE FIELD…')
                    return
                }
                if (stalledTicks > 0 && netMsgRef.current.startsWith('HOLD ON')) netSay('')
                stalledTicks = 0
                // hull 0 is fed from ITS own wire bytes (mine as host, the
                // host's as guest) — never local analog, or the boxes diverge.
                const padIn = fromWire(mirrors[0].get(k) || toWire({}))
                step(gs, padIn, assembleSeatPads(mirrors, k, net.humans))
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
                    if (net.role === 'host' && net.room) net.room.setPhase('waiting')
                }
                if (playing) drainEvents()
            } else {
                step(gs, playing ? readPad() : autoPad(gs))
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
                // a quiet, periodic wave swell — the bay breathing under the ride
                waveAmbT -= DT
                if (waveAmbT <= 0) { waveAmbT = 2.2 + Math.random() * 1.1; audioController.ambNoise(0.55, 0.045) }
            }
            // spray: carve fans, landing slaps, stitched wake behind every hull
            gs.crafts.forEach((c) => {
                const sternX = c.x - Math.sin(c.heading) * 2.1
                const sternZ = c.z - Math.cos(c.heading) * 2.1
                if (!c.airborne && wasAir[c.id]) {
                    // splash: a wide short sheet of spray + long-life droplets
                    spraySpawn(spray, c.x, c.y + 0.2, c.z, 26, 3.4, 5.0, false)
                    spraySpawn(spray, c.x, c.y + 0.15, c.z, 10, 0.45, 6.4, false, 0.85)
                    skiJolt[c.id] = 1
                }
                if (!c.airborne && Math.abs(c.steer) > 0.55 && c.speed > 8 && gs.tick % 2 === 0) {
                    const sideX = c.x + Math.cos(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    const sideZ = c.z - Math.sin(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    spraySpawn(spray, sideX, c.y + 0.25, sideZ, 3, 0.9, 3.6, false)
                }
                if (c.speed > 3 && gs.tick % 3 === 0) spraySpawn(spray, sternX, c.y + 0.05, sternZ, 1, 0.7, 0.5, true)
                if (c.boosting && gs.tick % 2 === 0) spraySpawn(spray, sternX, c.y + 0.2, sternZ, 2, 0.5, 1.6, false)
                // ribbon wake: the solid WR64 streak — stitched stern points,
                // wider when fast, hottest when boosting
                if (c.speed > 4 && gs.tick % 2 === 0) {
                    wakePush(wakes[c.id], sternX, c.y, sternZ, c.heading, 0.55 + c.speed * 0.085 + (c.boosting ? 0.5 : 0))
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
            // source the hull rides, even through time-stepped DEV hooks
            const wantStorm = gs.stage === 'storm' ? 1 : 0
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
                m.tilt.rotation.x = c.pitch
                m.tilt.rotation.z = c.roll * 0.6
                m.lean.rotation.z = -c.lean
                m.flame.visible = c.boosting
                if (c.boosting) m.flame.scale.set(1, 1 + Math.sin(t * 40) * 0.25, 1)
                // head lag on landing: jolt the head pivot, decaying
                skiJolt[i] = Math.max(0, (skiJolt[i] || 0) - DT * 2.6)
                // airborne tuck, smoothed — rises fast on takeoff, eases down on
                // landing; separate from the jolt so the air reads differently
                const tuckTarget = c.airborne ? 1 : 0
                airT[i] = (airT[i] || 0) + (tuckTarget - (airT[i] || 0)) * (1 - Math.exp(-DT * (tuckTarget > (airT[i] || 0) ? 11 : 6)))
                const tuck = airT[i]
                const land = skiJolt[i]
                if (m.lowerBody) {
                    // knees flex on the slap, tuck lifts the feet mid-air
                    m.lowerBody.rotation.x = -0.22 * land - 0.32 * tuck
                    m.lowerBody.position.y = 0.85 + 0.15 * tuck - 0.10 * land
                }
                // the torso absorbs the slap; the head rides the same jolt
                m.lean.position.y = -0.16 * land
                if (m.headPivot) {
                    m.headPivot.position.y = 1.62 - 0.17 * skiJolt[i] - 0.10 * tuck
                    m.headPivot.rotation.x = skiJolt[i] * 0.5 + tuck * 0.55
                }
                // arms track the bar grip through the local lean
                if (m.arms) {
                    for (let a = 0; a < m.arms.length; a++) {
                        const arm = m.arms[a]
                        _v3a.set(a === 0 ? -0.30 : 0.30, 0.98, 1.05).applyEuler(_euler.set(0, 0, c.lean))
                        _v3b.copy(_v3a).sub(arm.shoulder)
                        arm.pivot.quaternion.setFromUnitVectors(_down, _v3b.normalize())
                    }
                }
            })

            sprayStep(spray, DT)
            wakes.forEach((w) => wakeStep(w, DT))

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
            // next-gate hint: colour chip + side arrow + second-next preview
            const gi = p.judged.findIndex((j) => j === 0)
            if (gi >= 0 && hud.gate) {
                const g0 = gs.course.gates[gi]
                const g1 = gs.course.gates[gi + 1]
                const fmtGate = (g) => (g.color === 'red' ? 'RED RIGHT' : 'YELLOW LEFT')
                if (hud.gateNext) hud.gateNext.textContent = `▶ ${fmtGate(g0)}`
                if (hud.gateThen) hud.gateThen.textContent = g1 ? `  ·  ${fmtGate(g1)}` : ''
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

        function resize() {
            const w = wrap.clientWidth, h = wrap.clientHeight
            renderer.setSize(w, h, false)
            camera.aspect = w / Math.max(1, h)
            camera.updateProjectionMatrix()
        }
        resize()
        window.addEventListener('resize', resize)

        // --- input / screens ----------------------------------------------------
        let humanSeed = seedFromQuery() ?? freshSeed()
        const startRaceWith = (seed, bayName, online) => {
            gs = makeGame(seed >>> 0, bayName)
            net.humans = online && net.room ? net.room.slots.slice() : []
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
            wakes.forEach((w) => { w.pts.length = 0 })
            trickPop = ''
            const h = hudRef.current
            if (h.count) h.count.style.opacity = 0
            if (h.countText) h.countText.textContent = ''
            audioController.startLoopVoice(52)
            setResult(null)
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
            startRaceWith(m.seed >>> 0, m.bay === 'storm' ? 'storm' : 'sunny', true)
        }
        const endToMenu = () => {
            net.racing = false
            net.solo = false
            if (net.role === 'host' && net.room) net.room.setPhase('waiting')
            audioController.stopLoopVoice()
            setMode('attract')
        }
        // attract/over preview reroll when the picker changes bays
        previewRef.current = () => {
            gs = makeGame(freshSeed(), bayRef.current)
            buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
            wakes.forEach((w) => { w.pts.length = 0 })
            camInit = false
            prevGo = false
        }
        startRaceRef.current = () => {
            if (net.active) {
                if (screenRef.current === 'over') endToMenu()
                else if (net.role === 'host' && net.phase === 'waiting') net.lobby.start({ seed: hostSeed(), bay: bayRef.current })
                return
            }
            startRace()
        }

        if (net.active) {
            const lobby = createLobby({
                slug: 'tidal-rush',
                cap: SEATS,
                relay: relayUrl,
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (s) => {
                    net.phase = s.phase
                    net.code = s.code
                    if (s.slot >= 0) net.slot = s.slot
                    net.joinHref = s.joinHref
                    pushNetUi()
                },
                onRoster: () => { pushNetUi() },
                onJoin: () => pushNetUi(),
                onLeave: ({ slot }) => { seatGone(slot | 0); pushNetUi() },
                onStart: (m) => startOnline(m),
                on: {
                    pad: (m) => {
                        const s = m.s | 0
                        if (mirrors[s]) mirrors[s].set(m.k | 0, m.p)
                        if (s !== mySeat()) ls.gotPad(m.k | 0, m.p, s)
                    },
                    hs: (m) => {
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
                    gone: () => { if (net.role === 'guest') { net.racing = false; netSay('THE HOST SAILED HOME') } },
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
                    // #3220: on a live room the host's key starts the ROOM;
                    // a guest's keys idle until the 'go' lands. The over screen
                    // steps back to the waiting room.
                    if (screenRef.current === 'over') { endToMenu(); return }
                    if (net.role === 'host' && net.phase === 'waiting') net.lobby.start({ seed: hostSeed(), bay: bayRef.current })
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
                    wakes.forEach((w) => { w.pts.length = 0 })
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
        exposeFeedbackState(() => ({ seed: gs.seed, tick: gs.tick, score: gs.score, done: gs.done, rank: gs.rank }))

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
            wakes.forEach((w) => { w.geo.dispose(); w.mat.dispose(); w.darkGeo.dispose(); w.darkMat.dispose() })
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
                <div className="absolute top-[4.75rem] left-3 bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5 text-cyan-50">
                    <div className="text-[9px] tracking-widest opacity-70">SCORE</div>
                    <div ref={setHud('score')} className="text-xl font-black text-yellow-200 leading-6">0</div>
                    <div ref={setHud('lap')} className="text-[11px] tracking-widest">LAP 1/3</div>
                </div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
                    <div ref={setHud('bay')} className="text-[10px] tracking-[0.35em] mb-1" style={{ color: '#bfe9ff' }}>SUNNY BAY</div>
                    <div ref={setHud('gate')} className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm font-bold tracking-widest">
                        <span ref={setHud('gateNext')} /><span ref={setHud('gateThen')} style={{ opacity: 0.6, fontWeight: 600 }} />
                    </div>
                    <div ref={setHud('pop')} className="mt-2 text-xl font-black text-cyan-200 transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 14px #08f, 2px 2px 0 #000' }} />
                    <div ref={setHud('air')} className="mt-1 text-xs tracking-[0.35em] text-yellow-200 transition-opacity duration-150" style={{ opacity: 0 }}>A I R</div>
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
                    <div className="text-center text-[9px] tracking-widest text-cyan-200/70 mt-1">SPRINT — hold BOOST</div>
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

            {screen === 'over' && result && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${result.place === 1 ? 'text-yellow-300' : 'text-cyan-200'}`}>
                        {result.place === 1 ? (result.stage === 'storm' ? 'STORM MASTER' : 'BAY CHAMPION') : `P${result.place} — THE FIELD TOOK IT`}
                    </h2>
                    <p className="text-lg mb-3">{result.stage === 'storm' ? 'storm bay' : 'sunny bay'} · time {fmt(result.t)} · score {result.score}</p>
                    <p className="text-sm text-cyan-200/80 mb-4">{result.place === 1 ? (result.stage === 'storm' ? 'You read a sea that re-rolled under you. The bay never saw you coming.' : 'Mako never saw your wake.') : 'Cleaner gates charge more sprint — try the crests.'}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY · ◀ ▶ PICK BAY</p>
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

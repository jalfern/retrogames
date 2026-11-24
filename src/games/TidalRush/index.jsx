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
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { padState } from '../../utils/padState'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { makeGame, step, autoPad, stateOf, stateHash, LAPS, SIM_MS, DT } from './sim.js'
import { heightAt, waterHeight, seaUniforms } from './water.js'
import { contractHoldsLoop } from '../../utils/gameContract'
import { makeSea, makeSky, makeBuoy, makeSki, makeSpray, spraySpawn, sprayStep, makeRain, rainSpawn, rainStep, makeLights } from './art.js'

const PRESS = 'PRESS ANY KEY OR TAP'
const MESSAGES = [
    'RED BUOY RIGHT · YELLOW BUOY LEFT',
    'CLEAN PASSES CHARGE THE SPRINT',
    'HIT A CREST · HOLD SPIN · BANK THE TRICK',
    'FULL-LOCK STEER OFF A CREST = BARREL ROLL',
    'STORM BAY: THE SWELL RE-ROLLS EVERY LAP',
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

        const skiMeshes = gs.crafts.map((c) => {
            const s = makeSki(c.color)
            scene.add(s.root)
            return s
        })

        const spray = makeSpray(LITE ? 380 : 700)
        scene.add(spray.pts)
        const rain = makeRain(LITE ? 240 : 420)
        scene.add(rain.pts)
        let stormBlend = bayRef.current === 'storm' ? 1 : 0

        const camPos = new THREE.Vector3(0, 6, -20)
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

        const sfx = {
            pass: () => { audioController.playTone(880, 0.07, 'square', 0.10); audioController.playTone(1320, 0.09, 'square', 0.09, 0.07) },
            miss: () => audioController.playSweep(240, 110, 0.28, 'sawtooth', 0.12),
            trick: () => { audioController.playTone(660, 0.07, 'square', 0.12); audioController.playTone(880, 0.07, 'square', 0.12, 0.08); audioController.playTone(1320, 0.14, 'square', 0.12, 0.16) },
            air: () => audioController.playSweep(260, 640, 0.18, 'sine', 0.07),
            splash: () => audioController.playNoise(0.22, 0.14),
            bump: () => audioController.playNoise(0.07, 0.12),
            lap: () => audioController.playTone(990, 0.12, 'triangle', 0.12),
            go: () => audioController.playSweep(440, 880, 0.3, 'square', 0.14),
            barrel: () => { audioController.playSweep(330, 990, 0.22, 'triangle', 0.11); audioController.playTone(1100, 0.1, 'square', 0.1, 0.14) },
            swell: () => audioController.playSweep(90, 210, 0.9, 'sine', 0.16),
            thunder: () => { audioController.playNoise(0.5, 0.12); audioController.playSweep(70, 38, 0.8, 'sawtooth', 0.1) },
            finish: (win) => {
                const base = win ? [523, 659, 784, 1047] : [392, 330, 262]
                base.forEach((f, i) => audioController.playTone(f, 0.16, 'square', 0.12, i * 0.13))
            },
        }

        function drainEvents() {
            for (const e of gs.events) {
                const hud = hudRef.current
                if (e.type === 'pass') { sfx.pass(); flashPop = 1; if (hud.pop) { hud.pop.textContent = `CLEAN +100`; hud.pop.style.opacity = 1 } }
                if (e.type === 'miss') { sfx.miss(); flashPop = 1; if (hud.pop) { hud.pop.textContent = 'MISS — THROTTLE DOWN'; hud.pop.style.opacity = 1 } }
                if (e.type === 'trick') { sfx.trick(); if (hud.pop) { hud.pop.textContent = 'TRICK! +250'; hud.pop.style.opacity = 1 } }
                if (e.type === 'barrel') { sfx.barrel(); flashPop = 1; if (hud.pop) { hud.pop.textContent = 'BARREL ROLL +200'; hud.pop.style.opacity = 1 } }
                if (e.type === 'swell') { sfx.swell(); if (hud.pop) { hud.pop.textContent = `SWELL SHIFT — LAP ${e.lap}`; hud.pop.style.opacity = 1 } }
                if (e.type === 'flash') sfx.thunder()
                if (e.type === 'air') sfx.air()
                if (e.type === 'splashes') sfx.splash()
                if (e.type === 'bump') sfx.bump()
                if (e.type === 'lap') sfx.lap()
                if (e.type === 'finish') {
                    sfx.finish(gs.rank === 1)
                    setResult({ place: gs.rank, t: gs.t, score: gs.score, tricks: gs.score >= 2000, stage: gs.stage })
                    setMode('over')
                }
            }
        }

        let prevGo = false
        function simTick() {
            const playing = screenRef.current === 'play'
            const pad = playing ? readPad() : autoPad(gs)
            const wasAir = gs.crafts.map((c) => c.airborne)
            step(gs, pad)
            if (!prevGo && gs.lightPhase >= 1 && playing) { sfx.go(); goFlash = 1.1; if (hudRef.current.count) { hudRef.current.count.textContent = 'GO'; hudRef.current.count.style.opacity = 1 } }
            prevGo = gs.lightPhase >= 1
            if (playing) {
                drainEvents()
                // engine: a sawtooth that winds up with the hull; hiss on the hull
                engineTick += 1
                const p = gs.crafts[0]
                if (engineTick % 7 === 0 && p.speed > 1) {
                    audioController.playTone(52 + p.speed * 7.5 + (p.boosting ? 40 : 0), 0.115, 'sawtooth', 0.045 + Math.min(0.05, p.throttle * 0.05))
                }
                if (engineTick % 9 === 0 && p.speed > 5) audioController.playNoise(0.05, 0.022)
            }
            // spray: carve fans, landing slaps, stitched wake behind every hull
            gs.crafts.forEach((c) => {
                const sternX = c.x - Math.sin(c.heading) * 2.1
                const sternZ = c.z - Math.cos(c.heading) * 2.1
                if (!c.airborne && wasAir[c.id]) spraySpawn(spray, c.x, c.y + 0.2, c.z, 22, 2.4, 4.2, false)
                if (!c.airborne && Math.abs(c.steer) > 0.55 && c.speed > 8 && gs.tick % 2 === 0) {
                    const sideX = c.x + Math.cos(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    const sideZ = c.z - Math.sin(c.heading) * (c.steer > 0 ? -0.8 : 0.8)
                    spraySpawn(spray, sideX, c.y + 0.25, sideZ, 3, 0.9, 3.6, false)
                }
                if (c.speed > 3 && gs.tick % 3 === 0) spraySpawn(spray, sternX, c.y + 0.05, sternZ, 1, 0.7, 0.5, true)
                if (c.boosting && gs.tick % 2 === 0) spraySpawn(spray, sternX, c.y + 0.2, sternZ, 2, 0.5, 1.6, false)
            })
        }

        function draw() {
            const t = gs.t
            sea.mat.uniforms.uT.value = t
            sea.mat.uniforms.uCam.value.copy(camera.position)
            sky.position.copy(camera.position)

            // THE BRIDGE: this frame's ridden sea table → shader uniforms. Same
            // numbers, same frame — drawn sea ≡ ridden sea, every swell.
            const su = seaUniforms(gs.seaCur)
            for (const k in su) {
                const u = sea.mat.uniforms[k]
                if (!u) continue
                if (Array.isArray(su[k])) { u.value.x = su[k][0]; u.value.y = su[k][1] }
                else u.value = su[k]
            }
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

            // storm rain swaddles the camera
            if (stormBlend > 0.4) rainSpawn(rain, camera.position.x, camera.position.y, camera.position.z, LITE ? 5 : 8)
            rainStep(rain, DT)
            rain.pts.visible = stormBlend > 0.2

            buoys.forEach((b, i) => {
                const g0 = gs.course.gates[i]
                // bob with the full Gerstner motion — height AND horizontal flow —
                // so each buoy stays glued to the drawn surface it rides (rung 2;
                // rung 1 bobbed in height only and slid off moving crests)
                const w = waterHeight(g0.x, g0.z, t, gs.seaCur)
                b.position.set(g0.x + w.dx, w.y, g0.z + w.dz)
                b.rotation.z = Math.sin(t * 1.7 + i * 2.1) * 0.12
                b.userData.flag.rotation.y = Math.sin(t * 6 + i) * 0.35
            })

            gs.crafts.forEach((c, i) => {
                const m = skiMeshes[i]
                m.root.position.set(c.x, c.y, c.z)
                m.root.rotation.y = c.heading + (c.airborne ? c.spin : 0)
                m.tilt.rotation.x = c.pitch
                m.tilt.rotation.z = c.roll * 0.6
                m.lean.rotation.z = -c.lean
                m.flame.visible = c.boosting
                if (c.boosting) m.flame.scale.set(1, 1 + Math.sin(t * 40) * 0.25, 1)
            })

            sprayStep(spray, DT)

            // chase-cam: sit behind and low over the water, FOV rides speed
            const p = gs.crafts[0]
            const fx = Math.sin(p.heading), fz = Math.cos(p.heading)
            const behind = 9.2 - Math.min(2, p.speed * 0.06)
            const waveY = heightAt(p.x - fx * behind, p.z - fz * behind, t, gs.seaCur)
            const tx = p.x - fx * behind
            const tz = p.z - fz * behind
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
            if (hud.speed) hud.speed.firstChild.nodeValue = String(Math.round(p.speed * 3.6))
            if (hud.lap) hud.lap.textContent = `LAP ${Math.min(p.lap, LAPS)}/${LAPS}`
            if (hud.rank) hud.rank.textContent = `P${gs.rank}/${gs.crafts.length}`
            if (hud.clock) hud.clock.textContent = fmt(gs.t)
            if (hud.boost) hud.boost.style.width = `${Math.round(p.boost * 100)}%`
            if (hud.pen) hud.pen.style.opacity = p.penalty > 0 ? 1 : 0
            if (hud.air) hud.air.style.opacity = p.airborne ? 1 : 0
            if (hud.count) { goFlash -= DT; if (goFlash <= 0 && prevGo) hud.count.style.opacity = 0 }
            if (hud.bay) {
                hud.bay.textContent = stormBlend > 0.5 ? `STORM BAY · SWELL ${Math.min(p.lap, LAPS)}/${LAPS}` : 'SUNNY BAY'
                hud.bay.style.color = stormBlend > 0.5 ? '#a9c0d2' : '#bfe9ff'
            }
            if (hud.pop) {
                flashPop -= DT
                if (flashPop <= 0) hud.pop.style.opacity = 0
            }
            // next-gate hint: colour chip + side arrow, the slalom's heartbeat
            const gi = p.judged.findIndex((j) => j === 0)
            if (gi >= 0 && hud.gate) {
                const g0 = gs.course.gates[gi]
                hud.gate.textContent = g0.color === 'red' ? '▶ RED RIGHT' : 'LEFT ◀ YELLOW'
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
        const startRace = () => {
            humanSeed = seedFromQuery() ?? freshSeed()
            gs = makeGame(humanSeed, bayRef.current)
            buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
            camInit = false
            prevGo = false
            setResult(null)
            setMode('play')
        }
        // attract/over preview reroll when the picker changes bays
        previewRef.current = () => {
            gs = makeGame(freshSeed(), bayRef.current)
            buoys.forEach((b, i) => b.position.set(gs.course.gates[i].x, 0, gs.course.gates[i].z))
            camInit = false
            prevGo = false
        }
        startRaceRef.current = startRace
        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || e.code === 'Slash') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
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
            unexposeFeedbackState()
            renderer.dispose()
            sea.mesh.geometry.dispose()
            sea.mat.dispose()
            spray.geo.dispose()
            spray.mat.dispose()
            rain.geo.dispose()
            rain.mat.dispose()
            canvas.remove()
        }
    }, [setMode])

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
                <div className="absolute top-2 left-3 bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5 text-cyan-50">
                    <div className="text-[9px] tracking-widest opacity-70">SCORE</div>
                    <div ref={setHud('score')} className="text-xl font-black text-yellow-200 leading-6">0</div>
                    <div ref={setHud('lap')} className="text-[11px] tracking-widest">LAP 1/3</div>
                </div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
                    <div ref={setHud('bay')} className="text-[10px] tracking-[0.35em] mb-1" style={{ color: '#bfe9ff' }}>SUNNY BAY</div>
                    <div ref={setHud('gate')} className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm font-bold tracking-widest" />
                    <div ref={setHud('pop')} className="mt-2 text-xl font-black text-cyan-200 transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 14px #08f, 2px 2px 0 #000' }} />
                    <div ref={setHud('air')} className="mt-1 text-xs tracking-[0.35em] text-yellow-200 transition-opacity duration-150" style={{ opacity: 0 }}>A I R</div>
                </div>
                <div ref={setHud('count')} className="absolute top-[32%] left-1/2 -translate-x-1/2 text-8xl font-black italic text-yellow-300 transition-opacity duration-150" style={{ opacity: 0, textShadow: '0 0 26px rgba(0,0,0,0.9), 4px 4px 0 #0a6' }} />
                <div className="absolute top-2 right-3 text-right">
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

            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            <VirtualControls secondAction={{ label: 'BOOST', code: 'ShiftLeft' }} visible={play && !paused} />
        </div>
    )
}

export default TidalRushGame

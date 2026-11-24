// MARBLE RUSH — the cabinet. The manifold lives in ./course.js, the marble in
// ./sim.js (pure, seeded, 60 Hz), the look in ./art.js; this file paints,
// listens and makes noise: a chase-cam over sky shelves, a chrome marble that
// reflects the shelf it runs, spark showers on every bumper, wind on the fall.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { padState } from '../../utils/padState'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, autoPad, stateOf, stateHash, courseFor, STAGE_COUNT, SIM_MS, DT } from './sim.js'
import { moverDeck, STAGES } from './course.js'
import { makeSky, makeEnv, makeClouds, buildStage, makeBumper, makeDeck, makeMarble, makeGoal, makeSparks, sparkSpawn, sparkStep, SKY_PALETTES } from './art.js'

const PRESS = 'PRESS ANY KEY OR TAP'
const MESSAGES = [
    'ONE STICK STEERS THE MARBLE',
    'BANKS HOLD YOU · SKEW HURTS YOU',
    'TOO FAST FOR A CURVE = THE SKY CATCHES YOU',
    'SWING BRIDGES BOARD AT THE RIGHT PHASE',
    'HIT THE LIP HOT TO FLY THE GAP',
    'GOLD SILVER BRONZE · FIVE SKY SHELVES',
]

const BEST_KEY = 'marble-rush-best-v1'
const loadBest = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(BEST_KEY) || '[]')
        return Array.isArray(raw) && raw.length === STAGE_COUNT ? raw : STAGES.map(() => null)
    } catch { return STAGES.map(() => null) }
}
const saveBest = (b) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)) } catch { /* private mode */ } }

const freshSeed = () => (Date.now() ^ Math.round(performance.now() * 1024)) >>> 0
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor(t * 100) % 100).padStart(2, '0')}`

const MEDAL_COL = { gold: '#ffd34d', silver: '#cfd8e6', bronze: '#d99a5b', none: '#7e8ba0' }

const MarbleRushGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [result, setResult] = useState(null)          // { kind:'clear'|'final'|'fall', ... }
    const [stageSel, setStageSel] = useState(0)
    const [best, setBest] = useState(loadBest)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const selRef = useRef(0)
    const bestRef = useRef(best)
    const resultRef = useRef(null)
    const startStageRef = useRef(null)
    const attractRef = useRef(null)
    const advanceFnRef = useRef(null)
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

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
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2000)
        scene.add(camera)

        let sky = null
        let clouds = null
        let stageArt = null
        let decks = []
        let bumpers = []
        let goal = null
        let env = null
        let stageIdxBuilt = -1
        let envStage = ''

        const marble = makeMarble(null)
        scene.add(marble.mesh, marble.shadow)
        const sparks = makeSparks(LITE ? 260 : 480)
        scene.add(sparks.pts)
        const lights = [
            new THREE.DirectionalLight(0xffffff, 2.1),
            new THREE.HemisphereLight(0xbfd8ff, 0x30281e, 1.05),
        ]
        lights[0].position.set(40, 60, 30)
        scene.add(...lights)

        let gs = makeGame(freshSeed(), 0)

        function buildStageArt(stageIdx) {
            if (stageIdxBuilt === stageIdx) return
            const course = courseFor(stageIdx)
            if (stageArt) {
                scene.remove(stageArt.group)
                stageArt.mesh.geometry.dispose()
                stageArt = null
            }
            for (const b of bumpers) scene.remove(b)
            for (const d of decks) scene.remove(d.group)
            if (goal) scene.remove(goal)
            bumpers = []
            decks = []
            const pal = SKY_PALETTES[course.sky] || SKY_PALETTES.day
            if (envStage !== course.sky) {
                if (env) env.dispose()
                env = makeEnv(renderer, pal)
                marble.mesh.material.envMap = env
                marble.mesh.material.needsUpdate = true
                scene.environment = env
                envStage = course.sky
            }
            if (!sky || SKY_PALETTES[course.sky] !== SKY_PALETTES[skyName]) {
                if (sky) { scene.remove(sky.mesh); sky.mesh.geometry.dispose(); sky.mat.dispose() }
                sky = makeSky(pal)
                skyName = course.sky
                scene.add(sky.mesh)
                if (clouds) { scene.remove(clouds.group) }
                clouds = makeClouds(stageIdx * 131 + 7, LITE ? 12 : 22)
                scene.add(clouds.group)
            }
            stageArt = buildStage(course)
            scene.add(stageArt.group)
            const bumperCol = new THREE.Color().setHSL(((course.hue + 140) % 360) / 360, 0.9, 0.6)
            for (const b0 of course.bumpers) {
                const bm = makeBumper(bumperCol)
                const p = course.pointOf(b0.s, b0.u)
                bm.position.set(p.x, p.y, p.z)
                scene.add(bm)
                bumpers.push(bm)
            }
            course.movers.forEach((m, mi) => {
                const d = makeDeck(course, mi)
                scene.add(d.group)
                decks.push(d)
            })
            goal = makeGoal()
            const gp = course.pointOf(course.len - 0.6, 0)
            goal.position.set(gp.x, gp.y, gp.z)
            goal.userData.l.position.set(-(course.halfWidthOf(course.len - 1) + 0.5), 2.2, 0)
            goal.userData.r.position.set(course.halfWidthOf(course.len - 1) + 0.5, 2.2, 0)
            goal.userData.banner.position.set(0, 4.4, 0)
            goal.rotation.y = course.headingOf(course.len - 0.6)
            scene.add(goal)
            stageIdxBuilt = stageIdx
        }

        const camPos = new THREE.Vector3(0, 5, -12)
        let camInit = false
        let flashPop = 0
        let goFlash = 0
        let humTick = 0
        let shake = 0
        let skyName = ''

        const keys = new Set()
        const padRef = { throttle: 0, steer: 0, brake: false, a: false, b: false }

        function readPad() {
            let steer = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
            let throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0
            if (padState.engaged) {
                steer = padState.x
                if (padState.y < -0.12) throttle = Math.max(throttle, -padState.y)
            }
            padRef.steer = Math.max(-1, Math.min(1, steer))
            padRef.throttle = throttle
            padRef.brake = keys.has('ArrowDown') || keys.has('KeyS')
            padRef.a = keys.has('Space')
            padRef.b = keys.has('ShiftLeft') || keys.has('ShiftRight')
            return padRef
        }

        const sfx = {
            go: () => audioController.playSweep(440, 880, 0.25, 'square', 0.13),
            bumper: () => { audioController.playTone(720, 0.06, 'square', 0.12); audioController.playTone(1080, 0.09, 'square', 0.1, 0.06) },
            jump: () => audioController.playSweep(240, 620, 0.22, 'sine', 0.09),
            land: () => { audioController.playNoise(0.09, 0.09); audioController.playTone(90, 0.09, 'sine', 0.12) },
            fall: () => audioController.playSweep(320, 60, 0.9, 'sawtooth', 0.12),
            finish: (medal) => {
                const seq = medal === 'gold' ? [523, 659, 784, 1047, 1319] : medal === 'none' ? [392, 440, 523] : [523, 659, 784]
                seq.forEach((f, i) => audioController.playTone(f, 0.15, 'square', 0.11, i * 0.11))
            },
            pick: () => audioController.playTone(560, 0.05, 'triangle', 0.08),
        }

        function drainEvents() {
            const hud = hudRef.current
            const showResult = (r) => { resultRef.current = r; setResult(r) }
            for (const e of gs.events) {
                if (e.type === 'go') { sfx.go(); goFlash = 1.2; if (hud.count) { hud.count.textContent = 'GO'; hud.count.style.opacity = 1 } }
                if (e.type === 'bumper') {
                    sfx.bumper(); flashPop = 1; shake = Math.min(0.5, shake + 0.22)
                    if (hud.pop) { hud.pop.textContent = 'BUMPER +50'; hud.pop.style.opacity = 1 }
                    const course = courseFor(gs.stageIdx)
                    const bi = course.bumpers.findIndex((b0) => Math.abs(b0.s - e.s) < 0.01)
                    const bm = bumpers[bi]
                    if (bm) bm.userData.ring.scale.setScalar(1.35)
                    const p = course.pointOf(e.s, 0)
                    sparkSpawn(sparks, p.x, p.y + 0.7, p.z, 18, 4.5, 5.5)
                }
                if (e.type === 'jump') { sfx.jump(); if (hud.pop) { hud.pop.textContent = 'SKY SHOT!'; hud.pop.style.opacity = 1 }; flashPop = 1 }
                if (e.type === 'land') { sfx.land(); shake = Math.min(0.4, shake + 0.14) }
                if (e.type === 'fall') sfx.fall()
                if (e.type === 'die') {
                    showResult({ kind: 'fall', t: gs.t, stage: gs.stageIdx + 1, name: courseFor(gs.stageIdx).name, score: gs.score })
                    setMode('over')
                }
                if (e.type === 'finish') {
                    sfx.finish(e.medal)
                    const idx = gs.stageIdx
                    const b = bestRef.current
                    if (b[idx] == null || gs.t < b[idx]) { b[idx] = Math.round(gs.t * 100) / 100; bestRef.current = b; setBest([...b]); saveBest(b) }
                    const unlocked = Math.min(STAGE_COUNT - 1, idx + 1)
                    if (selRef.current < unlocked) { selRef.current = unlocked; setStageSel(unlocked) }
                    if (idx + 1 >= STAGE_COUNT) {
                        showResult({ kind: 'final', medal: e.medal, t: gs.t, score: gs.score, best: bestRef.current })
                        setMode('over')
                    } else {
                        showResult({ kind: 'clear', medal: e.medal, t: gs.t, score: gs.score, next: idx + 1, name: courseFor(idx).name, best: bestRef.current[idx] })
                        setMode('over')
                    }
                }
            }
        }

        function startStage(idx) {
            gs = makeGame(seedFromQuery() ?? freshSeed(), idx)
            buildStageArt(idx)
            camInit = false
            goFlash = 0
            flashPop = 0
            setResult(null)
            resultRef.current = null
            setMode('play')
        }
        startStageRef.current = startStage

        function attractLoop() {
            gs = makeGame(freshSeed(), selRef.current)
            buildStageArt(selRef.current)
            camInit = false
        }
        attractRef.current = attractLoop

        function simTick() {
            const playing = screenRef.current === 'play'
            const pad = playing ? readPad() : autoPad(gs)
            step(gs, pad)
            if (!playing && gs.done) { attractLoop(); return }
            if (playing) {
                drainEvents()
                humTick += 1
                if (humTick % 6 === 0 && gs.v > 1.5 && !gs.falling) {
                    audioController.playTone(44 + gs.v * 6.2, 0.1, 'sawtooth', 0.028 + Math.min(0.035, gs.v * 0.0018))
                }
                if (humTick % 10 === 0 && gs.v > 12) audioController.playNoise(0.045, 0.016)
            }
        }

        function draw() {
            buildStageArt(gs.stageIdx)
            const course = courseFor(gs.stageIdx)

            // movers ride their analytic phase — same moverDeck the sim boards
            decks.forEach((d, mi) => {
                const dk = moverDeck(course, mi, gs.t + gs.mvPhase[mi])
                const p = course.pointOf(d.group.userData.sMid, dk.u)
                d.group.position.set(p.x, p.y, p.z)
            })

            // the marble: lifted along the banked surface normal, rolling spin
            const h = course.headingOf(gs.s)
            const bank = course.bankOf(gs.s)
            const p = course.pointOf(gs.s, gs.u, gs.y)
            const nx = -Math.cos(h) * Math.sin(bank)
            const ny = Math.cos(bank)
            const nz = Math.sin(h) * Math.sin(bank)
            const mr = 0.42
            marble.mesh.position.set(p.x + nx * mr, p.y + ny * mr, p.z + nz * mr)
            marble.mesh.rotation.y = gs.rolling * 0.9
            marble.mesh.rotation.x = h
            const fallFade = gs.falling ? Math.max(0, 1 + gs.y / 7) : 1
            marble.shadow.visible = !gs.falling && gs.y < 2.5
            marble.shadow.position.set(p.x, p.y + 0.03, p.z)
            marble.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, ny, nz))
            const sc = 1 + gs.y * 0.22
            marble.shadow.scale.set(sc, sc, sc)
            marble.shadow.material.opacity = 0.85 * fallFade
            marble.mesh.visible = fallFade > 0.02

            // bumper rings relax after their pop
            for (const bm of bumpers) {
                const s0 = bm.userData.ring.scale.x
                if (s0 > 1.001) bm.userData.ring.scale.setScalar(s0 + (1 - s0) * 0.18)
            }

            // chase-cam along the ribbon
            const look = course.pointOf(Math.min(course.len, gs.s + 6), gs.u * 0.55, gs.y + 1)
            const back = course.pointOf(Math.max(0, gs.s - 7.2), gs.u * 0.7, gs.y + 3.6)
            const tx = back.x + nx * 1.2
            const ty = back.y + 1.2 + gs.y * 0.55
            const tz = back.z + nz * 1.2
            if (!camInit) { camPos.set(tx, ty, tz); camInit = true }
            const k = 1 - Math.exp(-5.5 * DT)
            camPos.x += (tx - camPos.x) * k
            camPos.y += (ty - camPos.y) * k
            camPos.z += (tz - camPos.z) * k
            if (shake > 0) {
                shake -= DT
                camPos.x += (Math.random() - 0.5) * shake * 0.3
                camPos.y += (Math.random() - 0.5) * shake * 0.25
            }
            camera.position.copy(camPos)
            camera.lookAt(look.x, look.y, look.z)
            const wantFov = 56 + Math.min(14, gs.v * 0.8)
            camera.fov += (wantFov - camera.fov) * 0.08
            camera.updateProjectionMatrix()
            if (sky) sky.mesh.position.copy(camera.position)
            if (clouds) {
                clouds.group.position.set(camera.position.x, 0, camera.position.z)
                for (const c of clouds.puffs) c.sprite.position.x += c.v * DT
            }
            sparkStep(sparks, DT)

            // HUD (DOM refs — no per-frame React)
            const hud = hudRef.current
            if (hud.stage) hud.stage.textContent = `SHELF ${gs.stageIdx + 1}/${STAGE_COUNT} · ${course.name}`
            if (hud.clock) hud.clock.textContent = fmt(gs.t)
            if (hud.speed) hud.speed.firstChild.nodeValue = String(Math.round(gs.v * 3.6))
            if (hud.prog) hud.prog.style.width = `${Math.round((gs.s / course.len) * 100)}%`
            if (hud.best) hud.best.textContent = bestRef.current[gs.stageIdx] != null ? `BEST ${fmt(bestRef.current[gs.stageIdx])}` : `PAR ${fmt(course.par)}`
            if (hud.count) {
                if (gs.phase < 1 && screenRef.current === 'play') {
                    hud.count.textContent = String(3 - Math.floor(gs.phase * 3))
                    hud.count.style.opacity = 1
                } else if (goFlash > 0) {
                    goFlash -= DT
                    if (goFlash <= 0) hud.count.style.opacity = 0
                }
            }
            if (hud.pop) {
                flashPop -= DT
                if (flashPop <= 0) hud.pop.style.opacity = 0
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

        attractLoop()

        // --- input / screens -----------------------------------------------------
        const advance = () => {
            const r = resultRef.current
            if (screenRef.current !== 'over' || !r) return
            if (r.kind === 'clear') startStageRef.current && startStageRef.current(r.next)
            else if (r.kind === 'fall') startStageRef.current && startStageRef.current(gs.stageIdx)
            else { attractRef.current && attractRef.current(); setMode('attract') }
        }
        advanceFnRef.current = advance
        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || e.code === 'Slash') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (pausedRef.current) return
            keys.add(e.code)
            if (screenRef.current === 'attract') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    const d = e.code === 'ArrowRight' ? 1 : -1
                    const n = (selRef.current + d + STAGE_COUNT) % STAGE_COUNT
                    selRef.current = n
                    setStageSel(n)
                    attractLoop()
                    sfx.pick()
                    return
                }
                if (e.code !== 'Tab') startStage(selRef.current)
                return
            }
            if (screenRef.current === 'over') {
                if (e.code !== 'Tab') advance()
            }
        }
        const onKeyUp = (e) => keys.delete(e.code)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        // --- DEV hooks + contract ----------------------------------------------
        if (import.meta.env.DEV) {
            window.__marbleRushTest = {
                get state() { return stateOf(gs) },
                hash: () => stateHash(gs),
                press: (code) => { keys.add(code); if (screenRef.current === 'attract') startStage(selRef.current) },
                release: (code) => keys.delete(code),
                setPad: (o) => Object.assign(padRef, o),
                step: (n = 1) => { for (let i = 0; i < n; i++) simTick(); return stateOf(gs) },
                setMode: (m) => { if (m === 'play') startStage(selRef.current); else { attractLoop(); setMode('attract') } },
                setStage: (i) => { selRef.current = Math.max(0, Math.min(STAGE_COUNT - 1, i)); setStageSel(selRef.current); attractLoop() },
                probe: () => ({ ...stateOf(gs), seed: gs.seed, screen: screenRef.current }),
                prognose: () => {
                    const snap = JSON.parse(JSON.stringify(gs))
                    let g = 0
                    while (!snap.done && g < 60 * 120) { step(snap, autoPad(snap)); g++ }
                    return { reachable: !!snap.done && !snap.fail, t: Math.round(snap.t * 10) / 10 }
                },
            }
            mountDbg({
                title: 'MARBLE RUSH',
                getState: () => stateOf(gs),
                actions: [
                    { label: 'FULL SPEED', run: () => { gs.v = 20 } },
                    { label: 'SKIP AHEAD', run: () => { gs.s = Math.min(gs.len - 1, gs.s + 40) } },
                    { label: 'PROGNOSIS', run: () => window.__marbleRushTest.prognose() },
                ],
            })
            exposeGame({
                id: 'marble-rush',
                buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0, gs.stageIdx)
                    buildStageArt(gs.stageIdx)
                    camInit = false
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
                    if (typeof pad.y === 'number' && pad.y < -0.12) sp.throttle = Math.max(sp.throttle, -pad.y)
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
        exposeFeedbackState(() => ({ seed: gs.seed, tick: gs.tick, score: gs.score, done: gs.done, medal: gs.medal, stage: gs.stageIdx + 1 }))

        let rafStarted = false
        if (!rafStarted) { rafStarted = true; raf = requestAnimationFrame(loop) }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            startStageRef.current = null
            attractRef.current = null
            advanceFnRef.current = null
            if (import.meta.env.DEV) {
                delete window.__marbleRushTest
                unmountDbg()
                unexposeGame()
            }
            unexposeFeedbackState()
            renderer.dispose()
            if (stageArt) stageArt.mesh.geometry.dispose()
            sparks.geo.dispose()
            sparks.mat.dispose()
            marble.mesh.geometry.dispose()
            marble.shadow.geometry.dispose()
            if (env) env.dispose()
            canvas.remove()
        }
    }, [setMode])

    const play = screen === 'play'
    const entry = GAMES.find((g) => g.label === 'MARBLE RUSH')

    return (
        <div
            className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={() => {
                if (pausedRef.current) return
                if (screenRef.current === 'attract') startStageRef.current && startStageRef.current(selRef.current)
                else if (screenRef.current === 'over' && advanceFnRef.current) advanceFnRef.current()
            }}
        >
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none font-mono transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 bg-black/45 border border-sky-300/30 rounded px-3 py-1.5 text-sky-50">
                    <div ref={setHud('stage')} className="text-[11px] tracking-widest font-bold">SHELF 1/5</div>
                    <div ref={setHud('best')} className="text-[10px] tracking-widest text-amber-200/90">PAR</div>
                </div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
                    <div ref={setHud('pop')} className="text-xl font-black text-amber-200 transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 14px #f80, 2px 2px 0 #000' }} />
                </div>
                <div ref={setHud('count')} className="absolute top-[30%] left-1/2 -translate-x-1/2 text-8xl font-black italic text-white transition-opacity duration-150" style={{ opacity: 0, textShadow: '0 0 26px rgba(0,0,0,0.9), 4px 4px 0 #26c' }} />
                <div className="absolute top-2 right-3 text-right">
                    <div className="bg-black/45 border border-sky-300/30 rounded px-3 py-1.5">
                        <div className="text-[9px] tracking-widest opacity-70">SPEED</div>
                        <div ref={setHud('speed')} className="text-2xl font-black leading-6">0<span className="text-[10px]"> km/h</span></div>
                    </div>
                    <div ref={setHud('clock')} className="mt-1 bg-black/45 border border-sky-300/30 rounded px-3 py-1 text-sm">0:00.00</div>
                </div>
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64">
                    <div className="h-2.5 rounded bg-black/50 border border-sky-300/30 overflow-hidden">
                        <div ref={setHud('prog')} className="h-full bg-gradient-to-r from-sky-300 to-amber-300" style={{ width: '0%' }} />
                    </div>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-6xl font-black italic mb-2 text-white" style={{ textShadow: '4px 0 0 #2a7fd0, -4px 0 0 #ff9a3c, 0 12px 30px #000' }}>MARBLE RUSH</h1>
                    <p className="text-[10px] tracking-[0.35em] text-sky-200/60 mb-5">FIVE SHELVES HUNG IN THE SKY · ONE STICK · MEDALS FOR MERCY</p>
                    <div className="flex items-center gap-2 mb-6 text-[11px] tracking-[0.2em]">
                        <button type="button" onPointerDown={(e) => { e.stopPropagation(); selRef.current = (selRef.current + STAGE_COUNT - 1) % STAGE_COUNT; setStageSel(selRef.current); if (attractRef.current) attractRef.current() }} className="pointer-events-auto px-2 py-1 border border-sky-300/30 rounded text-sky-200/70">◀</button>
                        <span className="px-3 py-1 border border-amber-300/50 rounded text-amber-200 font-bold bg-amber-300/10">
                            {STAGES[stageSel].name} {best[stageSel] != null ? `· ${fmt(best[stageSel])}` : ''}
                        </span>
                        <button type="button" onPointerDown={(e) => { e.stopPropagation(); selRef.current = (selRef.current + 1) % STAGE_COUNT; setStageSel(selRef.current); if (attractRef.current) attractRef.current() }} className="pointer-events-auto px-2 py-1 border border-sky-300/30 rounded text-sky-200/70">▶</button>
                    </div>
                    <AttractMessage className="mb-6 text-sky-50/85" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-amber-300">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && result && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-sky-50 font-mono px-6">
                    {result.kind === 'fall' && (
                        <>
                            <h2 className="text-4xl font-black mb-1 text-rose-300">DOWN YOU GO</h2>
                            <p className="text-lg mb-3">{result.name} · died at {fmt(result.t)}</p>
                            <p className="text-sm text-sky-200/80 mb-4">Brake before the curve, board bridges when the deck is near center.</p>
                            <p className="animate-pulse font-bold">TAP / PRESS ANY KEY · RETRY</p>
                        </>
                    )}
                    {result.kind === 'clear' && (
                        <>
                            <h2 className="text-4xl font-black mb-1" style={{ color: MEDAL_COL[result.medal] }}>
                                {result.medal === 'none' ? 'SHELF CLEARED' : `${result.medal.toUpperCase()} MEDAL`}
                            </h2>
                            <p className="text-lg mb-1">{result.name} · {fmt(result.t)} {result.best != null && result.t <= result.best ? '· NEW BEST' : ''}</p>
                            <p className="text-sm text-sky-200/80 mb-4">Next: {STAGES[result.next].name} — {STAGES[result.next].medals[0]}s for gold</p>
                            <p className="animate-pulse font-bold">TAP / PRESS ANY KEY · ROLL ON</p>
                        </>
                    )}
                    {result.kind === 'final' && (
                        <>
                            <h2 className="text-4xl font-black mb-1 text-amber-300">ALL FIVE SHELVES</h2>
                            <p className="text-lg mb-1">Final score {result.score}</p>
                            <p className="text-sm mb-4 flex gap-3">
                                {result.best.map((b, i) => (
                                    <span key={i} className="text-sky-100/90">{i + 1}·{b != null ? fmt(b) : '—'}</span>
                                ))}
                            </p>
                            <p className="text-sm text-sky-200/80 mb-4">Gold is everywhere the shelf gets narrow. Go collect it.</p>
                            <p className="animate-pulse font-bold">TAP / PRESS ANY KEY · ATTRACT</p>
                        </>
                    )}
                </div>
            )}

            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default MarbleRushGame

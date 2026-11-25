// GRIND CITY — the cabinet. The park lives in ./park.js (one analytic surface
// the sim rides and the renderer triangulates), the rules in ./sim.js (pure,
// seeded, 60 Hz), the autopilot in ./planner.js, the look in ./art.js. This
// file only paints, listens and makes noise.

import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, stateOf, hashState, packIn, unpackIn, SCORE_GOAL } from './sim.js'
import { botPad, makeBot } from './planner.js'
import { STEP, bedVoices, landThud } from './music.js'
import { buildPark, buildSky, buildLetters, buildGems, buildRoofLine, buildSkater, poseSkater, buildParticles, buildSecretHint, emit, burst, stepParticles } from './art.js'
import { GEMS, RAILS } from './park.js'

const FIXED_DT = 1000 / 60
const DT = FIXED_DT / 1000
const freshSeed = () => (Date.now() ^ Math.round(performance.now() * 1024)) >>> 0
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

const PRESS = 'PRESS ANY KEY OR TAP'
const MESSAGES = [
    'RUN 01 · SCORE TARGET · S-K-A-T-E · THE GAP',
    'A = OLLIE · A IN THE AIR = GRAB · A ON LANDING = MANUAL',
    'B = PUMP THE TRANSITIONS — SPEED IS LIFE',
    'OLLIE ONTO A RAIL TO GRIND · STEER TO BALANCE',
    'EACH UNIQUE TRICK IN THE LINE RAISES THE MULTIPLIER',
    'BAIL AND THE LINE IS FORFEIT — BANK IT CLEAN',
    'GEMS +100 · CARRY SPEED UP THE SOUTH WALL — THE ROOF LINE PAYS',
]

const GrindCityGame = () => {
    const stageRef = useRef(null)
    const canvasRef = useRef(null)
    const [screen, setScreen] = useState('attract')      // attract | play | over
    const [paused, setPaused] = useState(false)
    const [mode, setMode] = useState('run')
    const [result, setResult] = useState(null)
    const pausedRef = useRef(false)
    const screenRef = useRef('attract')
    const modeRef = useRef('run')
    const keysRef = useRef({})
    // HUD element refs (written imperatively at 60 Hz; JSX attaches them)
    const hud = useRef({
        score: { current: null }, time: { current: null }, combo: { current: null },
        msg: { current: null }, mult: { current: null }, flash: { current: null },
        letters: { current: null }, gap: { current: null }, tgt: { current: null },
        gem: { current: null }, cut: { current: null }, callout: { current: null },
    }).current

    useEffect(() => {
        const canvas = canvasRef.current
        const stage = stageRef.current
        // preserveDrawingBuffer: the harness senses pixels through frame()/
        // drawImage — without the flag a WebGL canvas reads back black.
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.BasicShadowMap
        const scene = new THREE.Scene()
        scene.fog = new THREE.Fog(0xdfe8ef, 60, 200)
        const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600)

        buildSky(scene)
        buildPark(scene)
        const letterObjs = buildLetters(scene)
        const gemObjs = buildGems(scene)
        const roofLine = buildRoofLine(scene)
        const secretHint = buildSecretHint(scene)
        const rig = buildSkater(scene)
        const fx = buildParticles(scene)

        const sun = new THREE.DirectionalLight(0xfff3d6, 3.1)
        sun.position.set(-40, 55, 40)
        sun.castShadow = true
        sun.shadow.bias = -0.002
        sun.shadow.mapSize.set(1024, 1024)
        sun.shadow.camera.left = -60; sun.shadow.camera.right = 60
        sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60
        scene.add(sun)
        scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x9a8f7a, 1.35))

        let sim = makeGame(freshSeed(), 'run')
        sim.phase = 'play'          // attract: the autopilot rides behind the title
        let bot = makeBot()
        let attractMode = true
        let tickEvents = []
        let pumpCd = 0
        let lastSec = 999

        // ── run replay (#3225) ──────────────────────────────────────────────
        // The cabinet logs one packed input word per played tick. When a run
        // ends, the sim re-steps from the SAME seed with those words — sim.js
        // is deterministic (rng derives from state), so the replay is
        // byte-identical to the live line (grindcheck proves it).
        const REPLAY_MAX = 600   // last 10 s of the line
        const REPLAY_MIN = 120   // shorter than 2 s of skating: skip the replay
        let inputLog = []
        let replaySim = null, replayIdx = 0, replayAcc = 0, replayMode = false
        let pendingResult = null

        // camera: chase · fisheye action cam · replay cam — hard cuts between (#3225)
        let camMode = 'chase'
        let camCut = 0

        // music bed (#3167): ticks with the sim clock, so pause stops it and
        // the replay (which never runs simTick) stays silent. Attract is softer.
        let bedT = 0
        const CAM_FOV = { chase: 72, action: 96, replay: 92 }

        const pad = () => ({
            left: !!(keysRef.current.ArrowLeft || keysRef.current.KeyA),
            right: !!(keysRef.current.ArrowRight || keysRef.current.KeyD),
            up: !!(keysRef.current.ArrowUp || keysRef.current.KeyW),
            down: !!(keysRef.current.ArrowDown || keysRef.current.KeyS),
            a: !!keysRef.current.Space,
            b: !!(keysRef.current.ShiftLeft || keysRef.current.ShiftRight || keysRef.current.KeyB),
        })

        const clearReplay = () => {
            inputLog = []
            replaySim = null; replayIdx = 0; replayAcc = 0; replayMode = false
            pendingResult = null
            camMode = 'chase'; camCut = 0
        }

        const startGame = (m) => {
            modeRef.current = m
            clearReplay()
            sim = makeGame(seedFromQuery() ?? freshSeed(), m)
            sim.phase = 'play'
            bot = makeBot()
            attractMode = false
            screenRef.current = 'play'
            setScreen('play')
            setResult(null)
            audioController.playTone(660, 0.09, 'square', 0.09)
            audioController.playTone(880, 0.12, 'square', 0.09, 0.09)
        }

        const toAttract = () => {
            clearReplay()
            sim = makeGame(freshSeed(), 'run')
            sim.phase = 'play'
            bot = makeBot()
            attractMode = true
            screenRef.current = 'attract'
            setScreen('attract')
            setResult(null)
        }

        const cycleMode = (d) => {
            modeRef.current = modeRef.current === 'run' ? 'free' : 'run'
            setMode(modeRef.current)
            audioController.playTone(520 + d * 120, 0.05, 'square', 0.07)
        }

        // ── sound per sim event ─────────────────────────────────────────────
        const AC = audioController
        const sound = (e) => {
            if (e.startsWith('ollie')) AC.playTone(300 + Math.random() * 40, 0.07, 'square', 0.07)
            else if (e.startsWith('launch')) AC.playSweep(180, 420, 0.18, 'triangle', 0.09)
            else if (e.startsWith('grab')) AC.playSweep(500, 900, 0.1, 'triangle', 0.08)
            else if (e.startsWith('flip')) { AC.playNoise(0.12, 0.12); AC.playSweep(700, 300, 0.14, 'square', 0.06) }
            else if (e.startsWith('grind:start')) { AC.playTone(1500, 0.06, 'square', 0.06); AC.playNoise(0.08, 0.12) }
            else if (e === 'spark') AC.playNoise(0.05, 0.07)
            else if (e.startsWith('grind:end')) AC.playTone(900, 0.07, 'square', 0.05)
            else if (e.startsWith('manual:start')) AC.playTone(420, 0.04, 'triangle', 0.06)
            else if (e.startsWith('trick:Manual')) AC.playTone(620, 0.07, 'triangle', 0.08)
            else if (e.startsWith('trick:')) { AC.playTone(760, 0.06, 'square', 0.07); AC.playTone(980, 0.08, 'square', 0.06, 0.05) }
            else if (e.startsWith('land:')) {
                const v = parseFloat(e.split(':')[1]) || 3
                AC.playNoise(0.09, Math.min(0.28, 0.05 + v * 0.03))
                const th = landThud(v)   // more air in = heavier sound out (#3167)
                AC.playTone(th.f, th.d, 'sine', th.g)
            }
            else if (e.startsWith('bail')) { AC.playNoise(0.32, 0.3); AC.playSweep(300, 70, 0.3, 'sawtooth', 0.14) }
            else if (e.startsWith('bank')) { AC.playTone(520, 0.07, 'square', 0.08); AC.playTone(660, 0.07, 'square', 0.08, 0.06); AC.playTone(784, 0.12, 'square', 0.08, 0.12) }
            else if (e.startsWith('letter:')) AC.playTone(1046, 0.14, 'sine', 0.13)
            else if (e === 'gem') { AC.playTone(1318, 0.09, 'triangle', 0.1); AC.playTone(1760, 0.12, 'triangle', 0.08, 0.07) }
            else if (e === 'gems:all') [1046, 1318, 1568, 2093].forEach((f, i) => AC.playTone(f, 0.12, 'square', 0.1, i * 0.09))
            else if (e === 'secret') { AC.playSweep(300, 900, 0.35, 'triangle', 0.1); AC.playTone(1245, 0.2, 'sine', 0.09, 0.3) }
            else if (e.startsWith('goal:')) { AC.playTone(523, 0.1, 'square', 0.1); AC.playTone(659, 0.1, 'square', 0.1, 0.09); AC.playTone(784, 0.2, 'square', 0.1, 0.18) }
            else if (e === 'win') { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => AC.playTone(f, 0.14, 'square', 0.11, i * 0.11)) }
            else if (e === 'timeup') AC.playSweep(400, 120, 0.5, 'sawtooth', 0.12)
            else if (e === 'gap') AC.playSweep(600, 1400, 0.25, 'square', 0.09)
        }

        // ── HUD refs live at component level (`hud`) ──────────────────────
        const resize = () => {
            const w = stage.clientWidth, h = stage.clientHeight
            renderer.setSize(w, h, false)
            camera.aspect = w / Math.max(1, h)
            camera.updateProjectionMatrix()
        }
        resize()
        window.addEventListener('resize', resize)

        // ── input ───────────────────────────────────────────────────────────
        const onKeyDown = (ev) => {
            const c = ev.code
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(c)) ev.preventDefault()
            if (c === 'Escape' || c === 'Backquote' || c === 'Slash' && ev.shiftKey) {
                if (screenRef.current !== 'attract') {
                    pausedRef.current = !pausedRef.current
                    setPaused(pausedRef.current)
                }
                return
            }
            if (pausedRef.current) return
            if (screenRef.current === 'attract') {
                if (c === 'ArrowLeft' || c === 'ArrowRight') { cycleMode(c === 'ArrowRight' ? 1 : -1); return }
                if (c === 'Space' || c.startsWith('Arrow') || /^Key/.test(c)) { startGame(modeRef.current); return }
            } else if (screenRef.current === 'replay') {
                if (c === 'Space') finishOver()
                return
            } else if (screenRef.current === 'over') {
                if (c === 'Space') toAttract()
                return
            }
            keysRef.current[c] = true
        }
        const onKeyUp = (ev) => { keysRef.current[ev.code] = false }
        const onPointer = () => {
            if (pausedRef.current) return
            if (screenRef.current === 'attract') startGame(modeRef.current)
            else if (screenRef.current === 'replay') finishOver()
            else if (screenRef.current === 'over') toAttract()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointer)

        // ── the loop ────────────────────────────────────────────────────────
        let raf = 0
        let acc = 0
        let last = performance.now()
        let clock = 0
        let prevGemBits = 0   // gem-sparkle burst edge detector (#3233)
        let prevRoofGrind = false   // roof-grind callout edge detector (#3233 tail)
        let roofCalloutT = 0
        const camPos = new THREE.Vector3(6, 4, -38)
        const camLook = new THREE.Vector3()

        const finishOver = () => {
            const res = pendingResult
            clearReplay()
            screenRef.current = 'over'
            setResult(res)
            setScreen('over')
        }

        const startReplay = () => {
            replaySim = makeGame(sim.seed, sim.mode)
            replaySim.phase = 'play'
            replayIdx = Math.max(0, inputLog.length - REPLAY_MAX)
            replayAcc = 0
            replayMode = true
            screenRef.current = 'replay'
            setScreen('replay')
            camCut = 1   // hard cut into the replay cam
            AC.playSweep(900, 300, 0.25, 'triangle', 0.08)
            AC.playTone(220, 0.1, 'square', 0.05)
        }

        const checkEnd = () => {
            if (sim.phase !== 'over') return
            if (attractMode) { toAttract(); return }
            if (screenRef.current === 'over' || replayMode) return
            pendingResult = { score: sim.score, won: sim.won, goals: { ...sim.goalsDone }, best: sim.stats.bestChain, ...((j) => ({ gems: j.gems, gemTotal: j.gemTotal, gemsAll: j.gemsAll, secret: j.secret }))(stateOf(sim)) }
            if (inputLog.length >= REPLAY_MIN) startReplay()
            else finishOver()
        }

        const stepReplay = () => {
            if (!replaySim) { finishOver(); return }
            // half-speed while airborne — the classic slo-mo on airs
            replayAcc += replaySim.air ? 0.5 : 1
            while (replayAcc >= 1 && replayIdx < inputLog.length) {
                replayAcc -= 1
                step(replaySim, unpackIn(inputLog[replayIdx++]))
                replaySim.events.length = 0
            }
            if (replayIdx >= inputLog.length) finishOver()
        }

        const simTick = (inputOverride) => {
            const input = inputOverride || (attractMode ? botPad(stateOf(sim), bot) : pad())
            if (!attractMode && screenRef.current === 'play') inputLog.push(packIn(input))
            step(sim, input)
            tickEvents.push(...sim.events.splice(0, sim.events.length))
            checkEnd()
            // bed scheduling rides the same fixed step — paused screens and the
            // over screen never reach simTick with a live board, so it stops itself
            if (++bedT % STEP === 0 && (screenRef.current === 'play' || screenRef.current === 'attract')) {
                const vs = attractMode ? 0.6 : 1
                for (const n of bedVoices(bedT / STEP)) {
                    if (n.hat) AC.playNoise(n.d, n.g * vs)
                    else AC.playTone(n.f, n.d, n.type, n.g * vs)
                }
            }
        }

        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            acc += Math.min(now - last, 250)
            last = now
            while (acc >= FIXED_DT) {
                if (!pausedRef.current && !contractHoldsLoop()) (replayMode ? stepReplay() : simTick())
                acc -= FIXED_DT
                clock += DT
            }
            const st = stateOf(sim)
            const rst = replayMode && replaySim ? stateOf(replaySim) : null
            const vst = rst || st                 // what the eye follows this frame
            const actor = replayMode && replaySim ? replaySim : sim

            // sounds (the replay runs silent — classic)
            for (const e of tickEvents) {
                sound(e)
                if (e.startsWith('land:')) camCut = Math.max(camCut, 0.4)   // impact yank
            }
            tickEvents = []
            if (pad().b && (st.slope > 0.18 || st.grinding) && pumpCd <= 0 && screenRef.current === 'play') {
                AC.playTone(200 + st.speed * 20, 0.05, 'triangle', 0.05); pumpCd = 6
            }
            if (pumpCd > 0) pumpCd--
            if (screenRef.current === 'play' && st.timeLeft !== lastSec && st.timeLeft < 10 && st.timeLeft > 0) {
                lastSec = Math.ceil(st.timeLeft); AC.playTone(880, 0.05, 'square', 0.06)
            }

            // particles from state
            if (vst.grinding) {
                const fx0 = Math.cos(vst.heading), fz0 = Math.sin(vst.heading)
                emit(fx.sparks, vst.x - fx0 * 0.3, vst.y + 0.05, vst.z - fz0 * 0.3, -fx0, -fz0, 2)
            }
            if (!vst.air && vst.speed > 6 && Math.abs(vst.slope) > 0.35) {
                emit(fx.spray, vst.x, vst.y + 0.1, vst.z, -Math.sin(vst.heading), Math.cos(vst.heading), 1.5)
            }
            stepParticles(fx.sparks, DT); stepParticles(fx.spray, DT); stepParticles(fx.burst, DT)

            // letters: spin + hide collected (the replay watches them pop again)
            letterObjs.forEach((l, i) => {
                l.sp.rotation.y += 0.03
                const got = vst.letters['SKATE'[i]]
                const target = got ? 0.001 : 1
                const s0 = l.sp.scale.x + (target - l.sp.scale.x) * 0.2
                l.sp.scale.setScalar(s0)
                l.glow.intensity = got ? 0 : 0.6
            })

            // roof line (#3246 pass): UP marker bobs gently over the crest
            if (roofLine?.marker) roofLine.marker.position.y = roofLine.marker.userData.baseY + Math.sin(clock * 2.2) * 0.16

            // ── roof-grind callout (#3233 tail) ─────────────────────────────
            // The roof coping grind fires the same generic trick HUD text as
            // every other rail — mark the roof line with its own moment. Live
            // play only; the replay is silent and is not narrated.
            if (screenRef.current === 'play') {
                const g = actor.grind
                const isRoofGrind = !!(g && RAILS[g.ri] && RAILS[g.ri].id === 'roof')
                if (isRoofGrind && !prevRoofGrind) roofCalloutT = 1.1
                prevRoofGrind = isRoofGrind
                if (hud.callout.current) {
                    if (roofCalloutT > 0) {
                        roofCalloutT -= DT
                        hud.callout.current.textContent = 'ROOF GRIND!'
                        hud.callout.current.style.opacity = Math.min(1, roofCalloutT * 2.6).toFixed(3)
                        hud.callout.current.style.transform = `translate(-50%,0) scale(${1 + Math.max(0, roofCalloutT - 0.78) * 0.7})`
                    } else hud.callout.current.style.opacity = 0
                }
            }

            // secret-bowl foreshadowing (#3233 tail): slow, faint shimmer at the
            // western lip — the spot is hidden on purpose, but the east region
            // reads interesting. Fades out once the find is banked.
            if (secretHint) {
                const found = st.secret
                const breathe = Math.max(0, Math.sin(clock * 0.7 - 1.4))
                const targetO = found ? 0 : 0.12 + breathe * 0.36
                const m = secretHint.sprite.material
                m.opacity = m.opacity + (targetO - m.opacity) * 0.18
                secretHint.sprite.scale.setScalar(0.85 + breathe * 0.65)
                secretHint.sprite.position.y = secretHint.sprite.userData.baseY + Math.sin(clock * 1.3) * 0.07
            }

            // gems (#3246): spin + bob, shrink-pop when taken
            // #3233: idle 4-point-star glint per gem + a radial pickup burst
            const newBits = actor.gemBits
            for (let i = 0; i < GEMS.length; i++) {
                if ((newBits & (1 << i)) && !(prevGemBits & (1 << i))) {
                    const g = GEMS[i]
                    burst(fx.burst, g.x, g.y, g.z, 16)
                }
            }
            prevGemBits = newBits
            gemObjs.forEach((o, i) => {
                o.mesh.rotation.y += 0.06
                o.mesh.rotation.x += 0.02
                o.mesh.position.y = o.y + Math.sin(clock * 2.2 + o.phase) * 0.12
                o.glint.position.copy(o.mesh.position)
                const got = (actor.gemBits >> i) & 1
                const target = got ? 0.001 : 1
                const s0 = o.mesh.scale.x + (target - o.mesh.scale.x) * 0.25
                o.mesh.scale.setScalar(s0)
                // the glint: a 4-point star that breathes on its own cycle —
                // bright for a moment, fades back. No light, no per-gem cost.
                const breathe = Math.max(0, Math.sin(clock * 2.6 + o.phase * 1.7))
                const targetO = got ? 0 : 0.18 + breathe * 0.72
                const curO = o.glint.material.opacity
                o.glint.material.opacity = curO + (targetO - curO) * 0.22
                o.glint.scale.setScalar(0.55 + breathe * 0.75)
            })

            poseSkater(rig, actor, clock)

            // ── cameras: chase · fisheye action cam · replay cam (#3225) ────
            // Smoothing lives INSIDE a cam mode; crossing modes is a hard cut
            // (snap + white flash + FOV punch), the Tony Hawk transition grammar.
            const grabAir = actor.air && actor.airTrick && actor.airTrick.grab
            const wantAction = screenRef.current === 'play' && (vst.grinding || vst.manual || grabAir)
            const wantMode = replayMode ? 'replay' : wantAction ? 'action' : 'chase'
            if (wantMode !== camMode) { camMode = wantMode; camCut = 1 }
            camCut = Math.max(0, camCut - DT * 5)
            const hd = vst.heading
            const back = camMode === 'action' ? 1.9 : camMode === 'replay' ? 3.4 : attractMode ? 7.2 : 5.6
            const side = camMode === 'action' ? 2.7 : camMode === 'replay' ? 0.9 : 0
            const high = camMode === 'action' ? 0.9 : camMode === 'replay' ? 1.15 : 2.4
            const lead = camMode === 'action' ? 1.1 : camMode === 'replay' ? 2.2 : 3
            const sx = -Math.sin(hd), sz = Math.cos(hd)   // stage right of the board
            const tx = vst.x - Math.cos(hd) * back + sx * side
            const tz = vst.z - Math.sin(hd) * back + sz * side
            const ty = vst.y + high
            const lookY = vst.y + (camMode === 'action' ? 0.55 : 0.7)
            const k = camCut > 0.5 ? 1 : camMode === 'action' ? 0.3 : camMode === 'replay' ? 0.15 : 0.12
            camPos.lerp(new THREE.Vector3(tx, ty, tz), k)
            camLook.lerp(new THREE.Vector3(vst.x + Math.cos(hd) * lead + sx * side * 0.45, lookY, vst.z + Math.sin(hd) * lead + sz * side * 0.45), k * 1.5 > 1 ? 1 : k * 1.5)
            camera.position.copy(camPos)
            if (sim.camShake > 0.01) {
                camera.position.x += (Math.random() - 0.5) * sim.camShake * 0.5
                camera.position.y += (Math.random() - 0.5) * sim.camShake * 0.5
            }
            camera.lookAt(camLook)
            const fov = CAM_FOV[camMode] + camCut * 10
            if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix() }
            if (hud.cut.current) hud.cut.current.style.opacity = camCut > 0.01 ? (camCut * 0.26).toFixed(3) : 0
            renderer.render(scene, camera)

            // HUD (imperative — no React state churn at 60 Hz)
            if (hud.score.current) hud.score.current.textContent = st.score
            if (hud.time.current) hud.time.current.textContent = st.mode === 'run' ? fmt(st.timeLeft) : '∞'
            if (hud.combo.current) hud.combo.current.textContent = st.chain > 0 ? `${st.chainPts} PTS` : ''
            if (hud.mult.current) hud.mult.current.textContent = st.chain > 0 ? `x${Math.min(st.chain + 1, 10)}` : ''
            if (hud.msg.current) hud.msg.current.textContent = st.tick && sim.msgT > 0 ? sim.msg : ''
            if (hud.flash.current) {
                hud.flash.current.textContent = sim.bankFlashT > 0 ? `+${sim.bankFlashPts}` : ''
                hud.flash.current.style.opacity = sim.bankFlashT > 0 ? Math.min(1, sim.bankFlashT * 2) : 0
            }
            if (hud.letters.current) {
                hud.letters.current.querySelectorAll('b').forEach(b => { b.style.color = st.letters[b.textContent] ? '#ffd35e' : 'rgba(255,255,255,.22)' })
            }
            if (hud.gap.current) hud.gap.current.style.color = st.gapDone ? '#ffd35e' : 'rgba(255,255,255,.35)'
            if (hud.tgt.current) hud.tgt.current.style.color = st.goalsDone.score ? '#ffd35e' : (st.score >= SCORE_GOAL ? '#ffd35e' : 'rgba(255,255,255,.5)')
            if (hud.gem.current) {
                hud.gem.current.textContent = `\u25C6 GEMS ${st.gems}/${st.gemTotal}`
                hud.gem.current.style.color = st.gems > 0 ? '#7dffb0' : 'rgba(255,255,255,.35)'
            }
        }
        raf = requestAnimationFrame(frame)

        // #1473: every game files a feedback report — strict expression shape.
        exposeFeedbackState(() => ({
            tick: sim ? sim.tick : 0, score: sim ? sim.score : 0, done: sim ? !!sim.done : false,
            seed: sim ? sim.seed : 0, phase: sim ? sim.phase : 'menu', won: sim ? !!sim.won : false,
        }))

        // replay progress for harnesses: null | {i, n, pct}
        const replayProgress = () => replayMode
            ? { i: replayIdx, n: inputLog.length, pct: inputLog.length ? Math.round(100 * replayIdx / inputLog.length) : 100 }
            : null

        // ── DEV hooks + contract ────────────────────────────────────────────
        if (import.meta.env.DEV) {
            window.__grindTest = {
                state: () => ({ ...stateOf(sim), cam: camMode, replay: replayProgress(), screen: screenRef.current, bed: bedT }),
                press: (code) => { keysRef.current[code] = true },
                release: (code) => { keysRef.current[code] = false },
                start: () => startGame('run'),
            }
            mountDbg({
                title: 'GRIND CITY',
                getState: () => {
                    const st = stateOf(sim)
                    return [`phase=${st.phase} mode=${st.mode}`, `pos=${st.x},${st.y},${st.z} v=${st.speed} hd=${st.heading}`,
                        `score=${st.score} chain=${st.chainPts}x${st.mult} letters=${Object.keys(st.letters).length}/5`,
                        `gems=${st.gems}/${st.gemTotal} all=${st.gemsAll} secret=${st.secret}`,
                        `air=${st.air} grind=${st.grinding} bal=${st.grindBal} manual=${st.manual} t=${st.timeLeft}`]
                },
                actions: [
                    { label: 'fly gap', run: () => { sim.x = 4; sim.z = 3; sim.y = 1; sim.heading = Math.PI / 2; sim.speed = 8 } },
                    { label: 'rail', run: () => { sim.x = -11; sim.z = -2; sim.y = 1.4; sim.heading = 0; sim.speed = 7 } },
                    { label: 'pipe', run: () => { sim.x = -30; sim.z = 0; sim.y = -1; sim.heading = Math.PI; sim.speed = 8 } },
                    { label: 'roof', run: () => { sim.x = -15; sim.z = 6; sim.y = 0; sim.heading = Math.PI / 2; sim.speed = 10.5 } },
                    { label: 'secret', run: () => { sim.x = 26; sim.z = 6; sim.y = -1; sim.heading = 0; sim.speed = 3 } },
                    { label: 'roofgrind', run: () => { sim.x = -18; sim.z = 14.0; sim.y = 3.2; sim.heading = 0; sim.speed = 6.5; sim.air = true; sim.vy = 0; } },
                    { label: 'secretcue', run: () => { sim.x = 17.5; sim.z = 6; sim.y = 0; sim.heading = 0; sim.speed = 1.2 } },
                    { label: 'bail', run: () => { sim.airTrick = { t: 0, flip: 1, flipDir: 1, flipRot: 90, spin: 0, rot: 0 }; sim.vy = -14 } },
                ],
            })
            exposeGame({
                id: 'grind-city',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    clearReplay()
                    sim = makeGame(seed >>> 0, modeRef.current)
                    sim.phase = 'play'
                    bot = makeBot()
                    attractMode = false
                    screenRef.current = 'play'
                    setScreen('play')
                    return stateOf(sim)
                },
                tick: (p) => { simTick(p); return stateOf(sim) },
                state: () => ({ ...stateOf(sim), seed: sim.seed, hash: hashState(sim), attract: attractMode, cam: camMode, replay: replayProgress() }),
                canvas: () => canvas,
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointer)
            unexposeFeedbackState()
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame(); delete window.__grindTest }
            renderer.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hud holds stable ref boxes; the sim world is built once per mount
    }, [])

    const entry = GAMES.find((g) => g.label === 'GRIND CITY')

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black" ref={stageRef}>
            <canvas ref={canvasRef} className="block h-full w-full" />
            {/* HUD */}
            <div className="pointer-events-none absolute inset-0 select-none font-mono">
                <div ref={hud.cut} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
                {screen === 'play' && (
                    <>
                        <div ref={hud.time} className="absolute left-1/2 top-2 -translate-x-1/2 text-3xl font-bold text-white drop-shadow-[0_2px_0_rgba(0,0,0,.8)]" />
                        <div ref={hud.score} className="absolute bottom-3 left-3 text-4xl font-black italic text-[#ffd35e] drop-shadow-[0_3px_0_rgba(0,0,0,.85)]" />
                        <div ref={hud.mult} className="absolute bottom-16 left-3 text-xl font-black italic text-white drop-shadow-[0_2px_0_rgba(0,0,0,.85)]" />
                        <div ref={hud.combo} className="absolute bottom-11 left-3 text-sm font-bold tracking-widest text-white/90" />
                        <div ref={hud.flash} className="absolute bottom-24 left-1/2 -translate-x-1/2 text-5xl font-black italic text-[#7dffb0] drop-shadow-[0_3px_0_rgba(0,0,0,.85)] transition-opacity duration-150" style={{ opacity: 0 }} />
                        <div className="absolute left-3 top-16 space-y-1 text-xs tracking-widest text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]">
                            <div ref={hud.letters} className="font-bold tracking-[0.2em]">
                                <b className="text-lg">S</b>{' '}<b className="text-lg">K</b>{' '}<b className="text-lg">A</b>{' '}<b className="text-lg">T</b>{' '}<b className="text-lg">E</b>
                            </div>
                            <div ref={hud.gap} className="font-bold">◇ GAP OF THE DAY</div>
                            <div ref={hud.tgt} className="font-bold">◇ SCORE {SCORE_GOAL}</div>
                            <div ref={hud.gem} className="font-bold" />
                        </div>
                        <div ref={hud.msg} className="absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap text-lg font-bold italic tracking-wider text-[#ffe98a] drop-shadow-[0_2px_0_rgba(0,0,0,.85)]" />
                        <div ref={hud.callout} className="absolute left-1/2 top-[32%] whitespace-nowrap text-4xl font-black italic tracking-[0.18em] text-[#ffd35e] drop-shadow-[0_0_16px_rgba(242,169,60,.7)] drop-shadow-[0_3px_0_rgba(0,0,0,.9)]" style={{ opacity: 0 }} />
                    </>
                )}
                {screen === 'replay' && (
                    <div className="absolute inset-0 flex flex-col justify-between p-4">
                        <div className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(255,60,60,.9)]" />
                            <span className="text-2xl font-black italic tracking-[0.3em] text-white drop-shadow-[0_3px_0_rgba(0,0,0,.9)]">REPLAY</span>
                        </div>
                        <div className="text-center text-sm font-bold tracking-[0.4em] text-white/85 animate-pulse drop-shadow-[0_2px_0_rgba(0,0,0,.9)]">SPACE / TAP — SKIP</div>
                    </div>
                )}
                {screen === 'attract' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-6xl font-black italic tracking-tight text-[#ffd35e] drop-shadow-[0_4px_0_rgba(0,0,0,.9)]">GRIND CITY</div>
                        <div className="mt-1 text-sm tracking-[0.5em] text-white/80">ONE PARK · LONG LINES</div>
                        <div className="mt-8 flex gap-3 text-sm font-bold tracking-widest">
                            <span className={`rounded border px-3 py-1 ${mode === 'run' ? 'border-[#ffd35e] text-[#ffd35e]' : 'border-white/30 text-white/40'}`}>◀ RUN 01</span>
                            <span className={`rounded border px-3 py-1 ${mode === 'free' ? 'border-[#ffd35e] text-[#ffd35e]' : 'border-white/30 text-white/40'}`}>FREE SKATE ▶</span>
                        </div>
                        <div className="mt-10"><AttractMessage messages={[...MESSAGES, PRESS]} /></div>
                    </div>
                )}
                {screen === 'over' && result && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                        <div className="text-5xl font-black italic text-[#ffd35e] drop-shadow-[0_3px_0_rgba(0,0,0,.9)]">{result.won ? 'YOU RULE!' : 'RUN OVER'}</div>
                        <div className="mt-3 text-3xl font-bold text-white">{result.score} PTS</div>
                        <div className="mt-4 space-y-1 text-sm tracking-widest text-white/85">
                            <div>{result.goals.score ? '✔' : '✗'} SCORE TARGET {SCORE_GOAL}</div>
                            <div>{result.goals.letters ? '✔' : '✗'} COLLECT S-K-A-T-E</div>
                            <div>{result.goals.gap ? '✔' : '✗'} GAP OF THE DAY</div>
                            <div className={result.gemsAll ? 'font-bold text-[#7dffb0]' : ''}>{result.gemsAll ? '✔ GEM RUN — ALL GEMS' : `◇ GEMS ${result.gems}/${result.gemTotal}`}</div>
                            <div className={result.secret ? 'font-bold text-[#7dffb0]' : 'text-white/50'}>{result.secret ? '★ SECRET SPOT FOUND' : '★ SECRET SPOT · HIDDEN IN THE PARK'}</div>
                        </div>
                        {result.best > 0 && <div className="mt-3 text-xs tracking-widest text-white/60">BEST LINE {result.best}</div>}
                        <div className="mt-8 animate-pulse text-sm font-bold tracking-[0.4em] text-[#ffd35e]">SPACE — BACK TO THE PLAZA</div>
                    </div>
                )}
            </div>
            <VirtualControls secondAction={{ label: 'PUMP', code: 'ShiftLeft' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
        </div>
    )
}

export default GrindCityGame

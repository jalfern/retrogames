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
import { makeGame, step, stateOf, hashState, packIn, unpackIn, SCORE_GOAL, REPLAY_MAX, REPLAY_MIN, replayWorthy, betterLine, beatsLine, encodeLine, decodeLine, validBank } from './sim.js'
import { botPad, makeBot } from './planner.js'
import { makeSearchBot, searchPad } from './search.js'
import { STEP, bedVoices, landThud, ATTRACT_SFX } from './music.js'
import { buildPark, buildSky, buildLetters, buildGems, buildRoofLine, buildSkater, poseSkater, buildParticles, buildSecretHint, emit, burst, stepParticles } from './art.js'
import { GEMS, RAILS } from './park.js'

const FIXED_DT = 1000 / 60
const DT = FIXED_DT / 1000
const freshSeed = () => (Date.now() ^ Math.round(performance.now() * 1024)) >>> 0
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

const PRESS = 'PRESS ANY KEY OR TAP'
// #3233 tail: the replay's presentation-only speed toggle — 1× → 2× → 0.5× (F).
// Never touches the sim or the log; airborne slo-mo still stacks on top.
const cycleReplaySpeed = (s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1)
const MESSAGES = [
    'RUN 01 · SCORE TARGET · S-K-A-T-E · THE GAP',
    'A = OLLIE · HOLD IN AIR = GRAB · PRESS ON LANDING = MANUAL',
    'B = PUMP SLOPES · FLIP IN THE AIR · HOLD ON A RAIL = GRAB',
    'HOLD B ON A RAIL = FEEBLE / CROOKED · ARROW-KEY TO BALANCE',
    '↓+A AT A LIP = STALL · LEAN THE METER · PRESS A TO POP',
    'OLLIE ONTO A RAIL TO GRIND · STEER TO BALANCE',
    'EACH UNIQUE TRICK IN THE LINE RAISES THE MULTIPLIER',
    'BAIL AND THE LINE IS FORFEIT — BANK IT CLEAN',
    'GEMS +100 · CARRY SPEED UP THE SOUTH WALL — THE ROOF LINE PAYS',
    'A SHORT LINE WITH LETTERS STILL GETS ITS REPLAY',
]

const GrindCityGame = () => {
    const stageRef = useRef(null)
    const canvasRef = useRef(null)
    const [screen, setScreen] = useState('attract')      // attract | play | over
    const [paused, setPaused] = useState(false)
    const [mode, setMode] = useState('run')
    const [result, setResult] = useState(null)
    const [best, setBest] = useState(null)   // #3374: {score, letters, won} — attract card memory
    const [allTime, setAllTime] = useState(false)   // #3381: the chip's bank came from storage
    const [sharedPts, setSharedPts] = useState(null) // #3381: a ?line= guest line rides the attract
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
        manual: { current: null },
        speed: { current: null },
        near: { current: null },
        share: { current: null },
        shareChip: { current: null },
        shareFn: { current: null },
        styleChip: { current: null },
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

        // #3381 saved/shared runs — read the store and a ?line= deep link
        // before the first attract sim exists, so yesterday's record or a
        // friend's line is what rides behind the title on load. Both readers
        // are total: junk in the store or the URL falls back to a cold plaza.
        const STORE_KEY = 'grindcity.best.v1'
        let storedBank = null
        try {
            const raw = window.localStorage.getItem(STORE_KEY)
            if (raw) { const b = JSON.parse(raw); if (validBank(b)) storedBank = b }
        } catch { /* private mode or corrupt JSON — the plaza just starts cold */ }
        const sharedLine = decodeLine(new URLSearchParams(window.location.search).get('line'))
        let sharedIdx = 0
        let sharedMode = !!sharedLine
        if (sharedLine) setSharedPts(sharedLine.score)

        let sim = makeGame(sharedLine ? sharedLine.seed : (storedBank ? storedBank.seed : freshSeed()), 'run')
        sim.phase = 'play'          // attract: the autopilot rides behind the title
        // #3394 style v3 = THE THINKER: planner's recited line gains a fourth
        // rider that searches the real sim at every trick decision (?style=n
        // shifts the rotation origin — the QA drive leg rides v3 at once).
        const STYLE_N = 4
        const STYLE_NAMES = ['CLASSIC', 'FLIP', 'GRAB', 'THINKING']
        const makeAttractBot = (v) => (v === 3 ? makeSearchBot() : makeBot(v))
        const styleQ = parseInt(new URLSearchParams(window.location.search).get('style'), 10)
        const style0 = Number.isInteger(styleQ) && styleQ >= 0 && styleQ < STYLE_N ? styleQ : 0
        let bot = makeAttractBot(style0)
        let attractV = style0           // style rotation (#3233 item 4): classic → flip → grab → think
        let attractMode = true
        let tickEvents = []
        let pumpCd = 0
        let lastSec = 999
        // #3401 style tell: the attract corner names the rider, and the thinker
        // flashes each commit — the search was invisible except by its tricks.
        let stylePrevCommit = 0
        let styleFlashT = 0
        let lastInputByBot = false

        // ── run replay (#3225) ──────────────────────────────────────────────
        // The cabinet logs one packed input word per played tick. When a run
        // ends, the sim re-steps from the SAME seed with those words — sim.js
        // is deterministic (rng derives from state), so the replay is
        // byte-identical to the live line (grindcheck proves it).
        // REPLAY_MAX/REPLAY_MIN moved to sim.js (#3374) — the trigger law and
        // the cabinet now read one number, not two that can drift.
        let inputLog = []
        let replaySim = null, replayIdx = 0, replayAcc = 0, replayMode = false
        let pendingResult = null
        let replaySpeed = 1
        let replayNear = false   // #3374: replayed line was under the 2 s floor (letters saved it)
        let bestLine = null      // #3374: session memory of the best run, shown on attract
        let bestSeed = 0         // #3374: the seed + pad log of that run — attract re-rides them
        let bestLog = []
        let attractIdx = 0
        // #3381: all-time marker (the chip says so when the bank predates this
        // visit), the run-beat-the-record flag for the over card, and the
        // share-flash timer the frame loop decays.
        let allTimeV = false
        let shareFlashT = 0
        let shareText = ''
        let lastShareCode = null
        if (storedBank) {
            bestLine = { score: storedBank.score, letters: storedBank.letters, won: storedBank.won }
            bestSeed = storedBank.seed
            bestLog = storedBank.log.slice()
            allTimeV = true
            setBest(bestLine)
            setAllTime(true)
        }
        // #3325: the replay's presentation-only free cam — orbit the replay while it runs.
        // Never touches the sim or the log; arrows rotate, C toggles.
        let orbitOn = false
        let orbitA = 0.6

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
            replayNear = false
            orbitOn = false; orbitA = 0.6
            camMode = 'chase'; camCut = 0
            // #3381: any way in or out of skating ends the guest ride — a
            // shared line is only ever the load-time demo.
            sharedMode = false
            setSharedPts(null)
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
            // #3374: once the session has a best line, the plaza doesn't idle —
            // it re-rides that line (re-sim from the banked seed + pads, byte-
            // identical to how it was skated). No history yet? The planner's bot
            // keeps the attract it always had.
            attractIdx = 0
            sim = makeGame(bestLog.length ? bestSeed : freshSeed(), 'run')
            sim.phase = 'play'
            attractV = (attractV + 1) % STYLE_N   // each idle loop rides a different style
            bot = makeAttractBot(attractV)
            stylePrevCommit = 0; styleFlashT = 0
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
            // #3379: attract ducks its bed to 0.6 so the banked line sits under the title.
            // The trick/land/bail/win voices used to play at street gain over that ducked
            // bed, which made the best line's jingle louder in the lobby than in the game.
            // Read per call — attractMode flips between screens.
            const vs = attractMode ? ATTRACT_SFX : 1
            if (e.startsWith('ollie')) AC.playTone(300 + Math.random() * 40, 0.07, 'square', 0.07 * vs)
            else if (e.startsWith('launch')) AC.playSweep(180, 420, 0.18, 'triangle', 0.09 * vs)
            else if (e.startsWith('grab')) AC.playSweep(500, 900, 0.1, 'triangle', 0.08 * vs)
            else if (e.startsWith('flip')) { AC.playNoise(0.12, 0.12 * vs); AC.playSweep(700, 300, 0.14, 'square', 0.06 * vs) }
            else if (e.startsWith('grind:start')) { AC.playTone(1500, 0.06, 'square', 0.06 * vs); AC.playNoise(0.08, 0.12 * vs) }
            else if (e === 'stall') AC.playTone(240, 0.05, 'square', 0.06 * vs)   // tail locks into coping (#3289)
            else if (e === 'spark') AC.playNoise(0.05, 0.07 * vs)
            else if (e.startsWith('grind:end')) AC.playTone(900, 0.07, 'square', 0.05 * vs)
            else if (e.startsWith('manual:start')) AC.playTone(420, 0.04, 'triangle', 0.06 * vs)
            else if (e === 'manual180') AC.playSweep(560, 940, 0.12, 'triangle', 0.09 * vs)   // the 180 upgrade has its own voice (#3233 tail)
            else if (e.startsWith('trick:Manual')) AC.playTone(620, 0.07, 'triangle', 0.08 * vs)
            else if (e.startsWith('trick:')) { AC.playTone(760, 0.06, 'square', 0.07 * vs); AC.playTone(980, 0.08, 'square', 0.06 * vs, 0.05) }
            else if (e.startsWith('land:')) {
                const v = parseFloat(e.split(':')[1]) || 3
                AC.playNoise(0.09, Math.min(0.28, 0.05 + v * 0.03) * vs)
                const th = landThud(v)   // more air in = heavier sound out (#3167)
                AC.playTone(th.f, th.d, 'sine', th.g * vs)
            }
            else if (e.startsWith('bail')) { AC.playNoise(0.32, 0.3 * vs); AC.playSweep(300, 70, 0.3, 'sawtooth', 0.14 * vs) }
            else if (e.startsWith('bank')) { AC.playTone(520, 0.07, 'square', 0.08 * vs); AC.playTone(660, 0.07, 'square', 0.08 * vs, 0.06); AC.playTone(784, 0.12, 'square', 0.08 * vs, 0.12) }
            else if (e.startsWith('letter:')) AC.playTone(1046, 0.14, 'sine', 0.13 * vs)
            else if (e === 'gem') { AC.playTone(1318, 0.09, 'triangle', 0.1 * vs); AC.playTone(1760, 0.12, 'triangle', 0.08 * vs, 0.07) }
            else if (e === 'gems:all') [1046, 1318, 1568, 2093].forEach((f, i) => AC.playTone(f, 0.12, 'square', 0.1 * vs, i * 0.09))
            else if (e === 'secret') { AC.playSweep(300, 900, 0.35, 'triangle', 0.1 * vs); AC.playTone(1245, 0.2, 'sine', 0.09 * vs, 0.3) }
            else if (e.startsWith('goal:')) { AC.playTone(523, 0.1, 'square', 0.1 * vs); AC.playTone(659, 0.1, 'square', 0.1 * vs, 0.09); AC.playTone(784, 0.2, 'square', 0.1 * vs, 0.18) }
            else if (e === 'win') { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => AC.playTone(f, 0.14, 'square', 0.11 * vs, i * 0.11)) }
            else if (e === 'timeup') AC.playSweep(400, 120, 0.5, 'sawtooth', 0.12 * vs)
            else if (e === 'gap') AC.playSweep(600, 1400, 0.25, 'square', 0.09 * vs)
        }

        // #3381: copy a link that re-rides the banked line — one press off the
        // replay or the over card (S, or tapping the chip). The clipboard can
        // refuse (permissions, focus, insecure origin): say so, don't pretend.
        const shareLine = () => {
            const code = bestLog.length && bestLine
                ? encodeLine({ seed: bestSeed, log: bestLog, score: bestLine.score })
                : null
            if (!code) { shareText = bestLog.length ? 'LINE TOO LONG TO SHARE' : 'SKATE A LINE FIRST'; shareFlashT = 1.6; return }
            lastShareCode = code
            const url = `${window.location.origin}${window.location.pathname}?line=${code}`
            const done = (t) => { shareText = t; shareFlashT = 1.6 }
            AC.playTone(880, 0.08, 'triangle', 0.07)
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(() => done('LINE COPIED — SEND IT'), () => done('CLIPBOARD BLOCKED'))
                } else done('CLIPBOARD BLOCKED')
            } catch { done('CLIPBOARD BLOCKED') }
        }
        hud.shareFn.current = shareLine

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
                else if (c === 'KeyF') replaySpeed = cycleReplaySpeed(replaySpeed)
                else if (c === 'KeyC') orbitOn = !orbitOn
                else if (c === 'KeyS') shareLine()
                else if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD') keysRef.current[c] = true
                return
            } else if (screenRef.current === 'over') {
                if (c === 'Space') toAttract()
                else if (c === 'KeyS') shareLine()
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
        let prevManualName = null   // manual-chip upgrade edge → punch (#3233 tail)
        let manualPunch = 0
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
            replaySpeed = 1
            replayNear = inputLog.length < REPLAY_MIN   // #3374 — the banner tells the truth
            orbitOn = false; orbitA = 0.6
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
            pendingResult = { score: sim.score, won: sim.won, goals: { ...sim.goalsDone }, best: sim.stats.bestChain, allTime: false, ...((j) => ({ gems: j.gems, gemTotal: j.gemTotal, gemsAll: j.gemsAll, secret: j.secret }))(stateOf(sim)) }
            // #3374: every finished player run folds into the session best —
            // and when it *is* the best, the cabinet banks its seed + pad log so
            // the attract loop can re-ride it. (The log is the whole line: pads
            // are absolute from the run start, so re-sim needs all of it.)
            const lettersGot = Object.keys(sim.letters).length
            const cand = { score: sim.score, letters: lettersGot, won: !!sim.won }
            const prevBest = bestLine
            bestLine = betterLine(prevBest, cand)
            if (bestLine !== prevBest) {
                setBest(bestLine)
                // Only a full-window line earns the attract loop — a 1 s bail
                // replayed back-to-back behind the title would flicker, not
                // demo. The near-miss already taught its lesson on the replay
                // screen that followed the run itself.
                if (inputLog.length >= REPLAY_MIN) {
                    bestSeed = sim.seed
                    bestLog = inputLog.slice()
                    attractIdx = 0
                    // #3381: this visit just skated the best line, so the
                    // ALL-TIME marker waits for a later load. If the line also
                    // strictly beats the stored record it overwrites the store
                    // (survives the page) and earns the over-card badge.
                    allTimeV = false
                    setAllTime(false)
                    const storedRec = storedBank && { score: storedBank.score, letters: storedBank.letters, won: storedBank.won }
                    if (beatsLine(storedRec, cand)) {
                        storedBank = { v: 1, seed: bestSeed, log: bestLog, score: cand.score, letters: cand.letters, won: cand.won }
                        try { window.localStorage.setItem(STORE_KEY, JSON.stringify(storedBank)) } catch { /* no storage — the session remembers anyway */ }
                        if (pendingResult) pendingResult.allTime = true
                    }
                }
            }
            if (replayWorthy(inputLog.length, lettersGot)) startReplay()
            else finishOver()
        }

        const stepReplay = () => {
            if (!replaySim) { finishOver(); return }
            // half-speed while airborne — the classic slo-mo on airs
            // #3233 tail: F toggles 1×/2×/0.5× — presentation only, same words, same order
            replayAcc += (replaySim.air ? 0.5 : 1) * replaySpeed
            while (replayAcc >= 1 && replayIdx < inputLog.length) {
                replayAcc -= 1
                step(replaySim, unpackIn(inputLog[replayIdx++]))
                replaySim.events.length = 0
            }
            if (replayIdx >= inputLog.length) finishOver()
        }

        const simTick = (inputOverride) => {
            // attract input: the banked best line if the session has one (#3374),
            // else the planner. The banked line plays back exactly as ridden and
            // WRAPS at its own end — how the run ended (bail, clock, or a QA
            // shortened clock) isn't in the pads, so the wrap is driven by the
            // log length, not by the sim noticing it is over.
            let bankedPad = null
            if (attractMode) {
                if (sharedMode && sharedLine) {
                    // #3381 deep link: ride the guest line once, exactly as it
                    // was skated. When it ends the plaza keeps its own memory
                    // (banked best, else the bot) without a reload — a shared
                    // line is a demo, not a loop; the host's record still rides
                    // after the guest finishes.
                    if (sharedIdx >= sharedLine.log.length) {
                        sharedMode = false
                        setSharedPts(null)
                        sim = makeGame(bestLog.length ? bestSeed : freshSeed(), 'run')
                        sim.phase = 'play'; attractIdx = 0
                    } else bankedPad = unpackIn(sharedLine.log[sharedIdx++])
                } else if (bestLog.length) {
                    if (attractIdx >= bestLog.length) {
                        sim = makeGame(bestSeed, 'run'); sim.phase = 'play'; attractIdx = 0
                    }
                    bankedPad = unpackIn(bestLog[attractIdx++])
                }
            }
            const input = inputOverride || (attractMode
                ? (bankedPad || (bot.thinks ? searchPad(sim, bot) : botPad(stateOf(sim), bot)))
                : pad())
            lastInputByBot = attractMode && !bankedPad && !inputOverride
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

            // #3325: the replay free cam — hold arrows to swing the orbit,
            // C toggles. Presentation only: the sim is untouched either way.
            const orbit = replayMode && orbitOn
            if (orbit) {
                const l = keysRef.current.ArrowLeft || keysRef.current.KeyA
                const r = keysRef.current.ArrowRight || keysRef.current.KeyD
                if (l && !r) orbitA -= 2.4 * DT
                else if (r && !l) orbitA += 2.4 * DT
                camCut = 0
            }

            // ── cameras: chase · fisheye action cam · replay cam (#3225) ────
            // Smoothing lives INSIDE a cam mode; crossing modes is a hard cut
            // (snap + white flash + FOV punch), the Tony Hawk transition grammar.
            const grabAir = actor.air && actor.airTrick && actor.airTrick.grab
            const wantAction = screenRef.current === 'play' && (vst.grinding || vst.manual || grabAir || vst.stall || !!vst.railGrab)
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
            if (orbit) {
                // #3325 free cam: full orbit around the skater, no cut, no flash
                camPos.lerp(new THREE.Vector3(vst.x + Math.sin(orbitA) * 4.8, vst.y + 2.0, vst.z + Math.cos(orbitA) * 4.8), 0.3)
                camLook.lerp(new THREE.Vector3(vst.x, vst.y + 0.9, vst.z), 0.45)
            } else {
                camPos.lerp(new THREE.Vector3(tx, ty, tz), k)
                camLook.lerp(new THREE.Vector3(vst.x + Math.cos(hd) * lead + sx * side * 0.45, lookY, vst.z + Math.sin(hd) * lead + sz * side * 0.45), k * 1.5 > 1 ? 1 : k * 1.5)
            }
            camera.position.copy(camPos)
            if (!orbit && sim.camShake > 0.01) {
                camera.position.x += (Math.random() - 0.5) * sim.camShake * 0.5
                camera.position.y += (Math.random() - 0.5) * sim.camShake * 0.5
            }
            camera.lookAt(camLook)
            const fov = CAM_FOV[camMode] + (orbit ? 0 : camCut * 10)
            if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix() }
            if (hud.cut.current) hud.cut.current.style.opacity = orbit ? 0 : (camCut > 0.01 ? (camCut * 0.26).toFixed(3) : 0)
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
            // manual live tell (#3233 tail): name + honest growing value.
            // manualPts is the exact commit formula, so what ticks up is what pays.
            if (hud.manual.current) {
                const nm = st.manualName
                if (nm) {
                    if (prevManualName && prevManualName !== nm) manualPunch = 0.5
                    prevManualName = nm
                    hud.manual.current.textContent = `${nm} +${st.manualPts}`
                    hud.manual.current.style.color = nm === 'MANUAL 180' ? '#ffd35e' : '#ffffff'
                    hud.manual.current.style.opacity = 1
                } else {
                    prevManualName = null
                    hud.manual.current.style.opacity = 0
                }
                if (manualPunch > 0) manualPunch -= DT
                hud.manual.current.style.transform =
                    `translate(-50%,0) scale(${(1 + Math.max(0, manualPunch) * 0.7).toFixed(3)})`
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
            if (hud.speed.current) hud.speed.current.textContent = `SPEED ${replaySpeed}\u00d7${orbitOn ? ' \u27f3 ORBIT' : ''}`
            // #3374: a sub-2 s near-miss replay wears its own badge — the run was
            // short because letters, not time, is what earned it the replay.
            if (hud.near.current) hud.near.current.style.opacity = replayMode && replayNear ? 1 : 0
            // #3381 share flash — text is rewritten every lit frame so a screen
            // change mid-flash (replay → over) still lands its words.
            if (hud.share.current) {
                hud.share.current.textContent = shareFlashT > 0 ? shareText : ''
                hud.share.current.style.opacity = shareFlashT > 0 ? String(Math.min(1, shareFlashT)) : '0'
                if (shareFlashT > 0) shareFlashT -= DT
            }
            // #3401 style tell — the attract corner names its rider, and the
            // searcher flashes every commit (the thinking loop was invisible
            // except by its tricks). Honest chip: it only speaks while the BOT
            // rides — a banked best line or a shared line is the player's own.
            if (hud.styleChip.current) {
                if (bot.nCommit > stylePrevCommit) { stylePrevCommit = bot.nCommit; styleFlashT = 0.6 }
                if (styleFlashT > 0) styleFlashT -= DT
                const ridesBot = attractMode && lastInputByBot
                if (!ridesBot) {
                    hud.styleChip.current.style.opacity = 0
                } else {
                    const lit = styleFlashT > 0
                    hud.styleChip.current.textContent = lit
                        ? `LOOP ${attractV + 1}/${STYLE_N} · \u2713 COMMIT`
                        : `LOOP ${attractV + 1}/${STYLE_N} · ${STYLE_NAMES[attractV]}`
                    hud.styleChip.current.className = `absolute left-3 bottom-3 whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-black italic tracking-[0.2em] drop-shadow-[0_2px_0_rgba(0,0,0,.9)] ${
                        bot.thinks
                            ? lit ? 'border-[#7dffb0] bg-[#7dffb0]/20 text-[#7dffb0]' : 'border-[#7dffb0]/40 text-[#7dffb0]/90 animate-pulse'
                            : 'border-white/25 text-white/45'
                    }`
                    hud.styleChip.current.style.opacity = 1
                }
            }
        }
        raf = requestAnimationFrame(frame)

        // #1473: every game files a feedback report — strict expression shape.
        exposeFeedbackState(() => ({
            tick: sim ? sim.tick : 0, score: sim ? sim.score : 0, done: sim ? !!sim.done : false,
            seed: sim ? sim.seed : 0, phase: sim ? sim.phase : 'menu', won: sim ? !!sim.won : false,
        }))

        // replay progress for harnesses: null | {i, n, pct, near}
        const replayProgress = () => replayMode
            ? { i: replayIdx, n: inputLog.length, pct: inputLog.length ? Math.round(100 * replayIdx / inputLog.length) : 100, speed: replaySpeed, near: replayNear }
            : null

        // ── DEV hooks + contract ────────────────────────────────────────────
        if (import.meta.env.DEV) {
            window.__grindTest = {
                state: () => ({ ...stateOf(sim), cam: camMode, replay: replayProgress(), screen: screenRef.current, bed: bedT, sfxDuck: attractMode ? ATTRACT_SFX : 1, orbit: !!orbitOn, orbitA: Math.round(orbitA * 100) / 100, best: bestLine && { ...bestLine }, bestLog: bestLog.length, attractLine: attractMode && bestLog.length > 0, allTime: allTimeV, stored: storedBank ? storedBank.score : null, shared: sharedMode && sharedLine ? sharedLine.score : null, shareCode: lastShareCode, attractStyle: attractV, thinks: !!bot.thinks, nSearch: bot.nSearch || 0, nCommit: bot.nCommit || 0 }),
                press: (code) => { keysRef.current[code] = true },
                release: (code) => { keysRef.current[code] = false },
                start: () => startGame('run'),
                // DEV-only QA teleport (#3289 drive legs reach the coping/rail without
                // burning 10 s of real skating; the verbs still fire through real keys)
                teleport: (p) => { Object.assign(sim, p); sim.air = false },
            }
            mountDbg({
                title: 'GRIND CITY',
                getState: () => {
                    const st = stateOf(sim)
                    return [`phase=${st.phase} mode=${st.mode}`, `pos=${st.x},${st.y},${st.z} v=${st.speed} hd=${st.heading}`,
                        `score=${st.score} chain=${st.chainPts}x${st.mult} letters=${Object.keys(st.letters).length}/5`,
                        `gems=${st.gems}/${st.gemTotal} all=${st.gemsAll} secret=${st.secret}`,
                        `air=${st.air} grind=${st.grinding} bal=${st.grindBal} manual=${st.manual} t=${st.timeLeft}`,
                        `railGrab=${st.railGrab || '-'} stall=${st.stall} stallT=${st.stallT} stallBal=${st.stallBal}`]
                },
                actions: [
                    { label: 'fly gap', run: () => { sim.x = 4; sim.z = 3; sim.y = 1; sim.heading = Math.PI / 2; sim.speed = 8 } },
                    { label: 'rail', run: () => { sim.x = -11; sim.z = -2; sim.y = 1.4; sim.heading = 0; sim.speed = 7 } },
                    { label: 'pipe', run: () => { sim.x = -30; sim.z = 0; sim.y = -1; sim.heading = Math.PI; sim.speed = 8 } },
                    { label: 'lip', run: () => { sim.x = -24.6; sim.z = 0; sim.y = 0; sim.heading = Math.PI; sim.speed = 2 } },
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
                    bestLine = null; setBest(null)   // #3374: a harness session starts with no memory
                    bestSeed = 0; bestLog = []; attractIdx = 0
                    // #3381: forgetting is total — the all-time store, the chip
                    // marker, the guest line and the share code all go cold.
                    try { window.localStorage.removeItem(STORE_KEY) } catch { /* nothing to forget */ }
                    storedBank = null
                    allTimeV = false; setAllTime(false)
                    sharedMode = false; setSharedPts(null)
                    lastShareCode = null
                    sim = makeGame(seed >>> 0, modeRef.current)
                    sim.phase = 'play'
                    bot = makeBot()
                    attractMode = false
                    screenRef.current = 'play'
                    setScreen('play')
                    return stateOf(sim)
                },
                tick: (p) => { simTick(p); return stateOf(sim) },
                state: () => ({ ...stateOf(sim), seed: sim.seed, hash: hashState(sim), attract: attractMode, cam: camMode, replay: replayProgress(), sfxDuck: attractMode ? ATTRACT_SFX : 1, orbit: !!orbitOn, best: bestLine && { ...bestLine }, bestLog: bestLog.length, attractLine: attractMode && bestLog.length > 0, allTime: allTimeV, stored: storedBank ? storedBank.score : null, shared: sharedMode && sharedLine ? sharedLine.score : null, shareCode: lastShareCode, attractStyle: attractV, thinks: !!bot.thinks, nSearch: bot.nSearch || 0, nCommit: bot.nCommit || 0 }),
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
                        <div ref={hud.combo} className="absolute bottom-[3.75rem] left-3 text-sm font-bold tracking-widest text-white/90" />
                        <div ref={hud.flash} className="absolute bottom-24 left-1/2 -translate-x-1/2 text-5xl font-black italic text-[#7dffb0] drop-shadow-[0_3px_0_rgba(0,0,0,.85)] transition-opacity duration-150" style={{ opacity: 0 }} />
                        <div ref={hud.manual} className="absolute bottom-36 left-1/2 whitespace-nowrap text-2xl font-black italic tracking-wider text-white drop-shadow-[0_2px_0_rgba(0,0,0,.85)]" style={{ opacity: 0, transform: 'translate(-50%,0)' }} />
                        <div className="absolute left-3 top-16 space-y-1 text-xs tracking-widest text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]">
                            <div ref={hud.letters} className="font-bold tracking-[0.2em]">
                                <b className="text-lg">S</b>{' '}<b className="text-lg">K</b>{' '}<b className="text-lg">A</b>{' '}<b className="text-lg">T</b>{' '}<b className="text-lg">E</b>
                            </div>
                            <div ref={hud.gap} className="font-bold">◇ GAP OF THE DAY</div>
                            <div ref={hud.tgt} className="font-bold">◇ SCORE {SCORE_GOAL}</div>
                            <div ref={hud.gem} className="font-bold" />
                        </div>
                        {/* Goal/trick banner: below the checklist + inset on phones so it
                            never runs through S-K-A-T-E or off a narrow edge (#3233 tail). */}
                        <div ref={hud.msg} className="absolute inset-x-2 top-40 text-center whitespace-normal text-sm font-bold italic tracking-wider text-[#ffe98a] drop-shadow-[0_2px_0_rgba(0,0,0,.85)] sm:left-1/2 sm:right-auto sm:top-12 sm:-translate-x-1/2 sm:whitespace-nowrap sm:text-lg" />
                        <div ref={hud.callout} className="absolute left-1/2 top-[46%] whitespace-nowrap text-2xl font-black italic tracking-[0.18em] text-[#ffd35e] drop-shadow-[0_0_16px_rgba(242,169,60,.7)] drop-shadow-[0_3px_0_rgba(0,0,0,.9)] sm:top-[32%] sm:text-4xl" style={{ opacity: 0 }} />
                    </>
                )}
                {screen === 'replay' && (
                    <div className="absolute inset-0 flex flex-col justify-between p-4">
                        <div className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(255,60,60,.9)]" />
                            <span className="text-2xl font-black italic tracking-[0.3em] text-white drop-shadow-[0_3px_0_rgba(0,0,0,.9)]">REPLAY</span>
                        </div>
                        <div ref={hud.near} className="absolute left-1/2 top-[30%] -translate-x-1/2 whitespace-nowrap text-[13px] font-black italic tracking-[0.12em] text-[#7dffb0] drop-shadow-[0_3px_0_rgba(0,0,0,.9)] sm:text-xl sm:tracking-[0.2em]" style={{ opacity: 0 }}>NEAR MISS — LETTERS COUNT</div>
                        <div ref={hud.share} className="absolute left-1/2 top-[38%] -translate-x-1/2 whitespace-nowrap text-base font-black italic tracking-[0.2em] text-[#7dffb0] drop-shadow-[0_3px_0_rgba(0,0,0,.9)] sm:text-xl" style={{ opacity: 0 }} />
                        <div ref={hud.speed} className="absolute right-4 top-4 rounded border border-white/40 bg-black/50 px-3 py-1 text-lg font-black italic tracking-[0.2em] text-[#ffd35e] drop-shadow-[0_2px_0_rgba(0,0,0,.9)]" />
                        <span ref={hud.shareChip} onPointerDown={(e) => { e.stopPropagation(); if (hud.shareFn.current) hud.shareFn.current() }} className="pointer-events-auto absolute right-4 bottom-4 rounded border border-[#7dffb0]/50 bg-black/50 px-3 py-1 text-sm font-black italic tracking-[0.2em] text-[#7dffb0] drop-shadow-[0_2px_0_rgba(0,0,0,.9)]">SHARE — S</span>
                        {/* #3379: phones show TAP only (SPACE/F/C are physical keys) and the
                            row reserves room for the SHARE chip bottom-right — no ink collision. */}
                        <div className="pr-36 text-center text-sm font-bold tracking-[0.4em] text-white/85 animate-pulse drop-shadow-[0_2px_0_rgba(0,0,0,.9)] sm:pr-0"><span className="sm:hidden">TAP — SKIP</span><span className="hidden sm:inline">SPACE / TAP — SKIP · F — SPEED · C — ORBIT · S — SHARE</span></div>
                    </div>
                )}
                {screen === 'attract' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {/* #3401 rider chip — names the attract style, pulses +
                            flashes on commits while the searcher thinks. */}
                        {/* #3401 rider chip — names the attract style, pulses +
                            flashes on commits while the searcher thinks. Bottom-left:
                            the top-left corner belongs to the ARCADE/FEEDBACK chrome. */}
                        <div ref={hud.styleChip} data-q="attract-style" className="absolute left-3 bottom-3 rounded border border-white/25 px-2 py-0.5 text-[10px] font-black italic tracking-[0.2em] text-white/45 drop-shadow-[0_2px_0_rgba(0,0,0,.9)]" style={{ opacity: 0 }} />
                        <div className="text-6xl font-black italic tracking-tight text-[#ffd35e] drop-shadow-[0_4px_0_rgba(0,0,0,.9)]">GRIND CITY</div>
                        <div className="mt-1 text-sm tracking-[0.5em] text-white/80">ONE PARK · LONG LINES</div>
                        {best && (
                            <div className={`mt-3 max-w-[88vw] text-center text-sm font-bold tracking-[0.25em] drop-shadow-[0_2px_0_rgba(0,0,0,.9)] ${best.won ? 'text-[#ffd35e]' : 'text-white/85'}`}>
                                {allTime ? 'ALL-TIME BEST LINE' : 'BEST LINE'} {best.score} PTS · {best.letters}/5{best.won ? ' ★ GOALS' : ''}
                            </div>
                        )}
                        {sharedPts != null && (
                            <div className="mt-2 text-sm font-black italic tracking-[0.25em] text-[#7dffb0] drop-shadow-[0_2px_0_rgba(0,0,0,.9)]">SHARED LINE · {sharedPts} PTS</div>
                        )}
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
                        {result.allTime && <div className="mt-2 text-lg font-black italic tracking-[0.25em] text-[#7dffb0] drop-shadow-[0_2px_0_rgba(0,0,0,.9)] animate-pulse">NEW ALL-TIME LINE</div>}
                        <div ref={hud.share} className="mt-2 h-5 text-sm font-black italic tracking-[0.2em] text-[#7dffb0] drop-shadow-[0_2px_0_rgba(0,0,0,.9)]" style={{ opacity: 0 }} />
                        <div className="mt-6 animate-pulse text-sm font-bold tracking-[0.4em] text-[#ffd35e]">SPACE — BACK TO THE PLAZA · S — SHARE</div>
                    </div>
                )}
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
        </div>
    )
}

export default GrindCityGame

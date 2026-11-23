// CONTRA — the run-and-gun joins the arcade (Jon's #1530 commission).
// S1: the jungle. Konami arcade, 1987 — RETRO bar (docs/ART.md).
//
// Shell: one rAF loop with a fixed timestep, attract-first, '?' pause, pad
// (A = JUMP, B = FIRE), DEV hooks + the window.__game contract. All game
// truth lives in ./sim.js (pure, seeded); all pixels are generated in ./art.js;
// all sound is synthesized through audioController on the sim's event stream.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState, recordLiveTick, isRecording, armLiveCapture } from '../../utils/gameContract'
import { initAutoRecord, askConsent, beginRun, endRun } from '../../utils/autoRecord'
import { W, H, CFG, PLATFORMS, FALLS_LEDGES, makeGame, step, autopilot, stateHash, warpFalls, warpBoss, dropIn, releaseSeat, vineTheta, vineTip, loopK, arcadeLoop, LOOP_FX, loopVoice } from './sim.js'
import { drawBackground, drawFringe, drawGround, drawPlatform, drawPlayer, drawSoldier, drawTurret, drawBarrel, drawCapsule, drawCarrier, drawGunship, drawBullet, drawGrenade, drawSniper, drawGate, drawDepot, drawHud, drawCanyon, drawLedge, drawWater, drawGateStructure, drawDeathTumble, drawFireball, drawRappel, drawHeli, drawVine, drawLoopBanner, seatTagState } from './art.js'

const SIM_MS = 1000 / 60

// #2971 — the attract copy is touch-aware. A phone has no keys, and seat 2
// is keyboard-only by design (Jon's rule: no second on-screen pad) — the
// touch copy must say so, not teach WASD/F/G to a screen that can't press
// them. ?touch=1 forces the touch layout so the harness can pin it.
const URL_TOUCH = typeof window !== 'undefined' && /[?&]touch=1/.test(window.location.search)
const TOUCH = typeof window !== 'undefined' && (URL_TOUCH
    || (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window))
const MESSAGES_KEYBOARD = [
    'THE JUNGLE RUNS NORTH TO THE FALLS',
    'CAPSULES CARRY THE WHEEL — S M F L',
    'MACHINE GUN STREAMS · FIRE PIERCES · LASER RUNS HOT',
    'WATCH THE SCOPE GLINT — THE SNIPER TELLS YOU FIRST',
    'SHOOT THE CARRIER DOWN — ITS POD CARRIES THE WHEEL',
    'THE CORE SHINES WHEN IT IS OPEN — HIT IT THEN',
    'VINES SWING OVER THE FALLS — HOLD JUMP TO GRAB ONE',
    'BLUE TAKES THE SECOND SEAT — TWO GUNS, ONE JUNGLE',
    '2P DROP-IN: WASD MOVE · F JUMP · G FIRE',
    'STAND UP FROM THE BLUE SEAT — THE WINGMAN STEPS BACK IN',
    'CLEAR THE BASE AND STAGE 1 RETURNS — FASTER',
    'ONE HIT KILLS. BOTH SIDES.',
    'PRESS ANY KEY',
]
const MESSAGES_TOUCH = [
    'THE JUNGLE RUNS NORTH TO THE FALLS',
    'CAPSULES CARRY THE WHEEL — S M F L',
    'MACHINE GUN STREAMS · FIRE PIERCES · LASER RUNS HOT',
    'WATCH THE SCOPE GLINT — THE SNIPER TELLS YOU FIRST',
    'SHOOT THE CARRIER DOWN — ITS POD CARRIES THE WHEEL',
    'THE CORE SHINES WHEN IT IS OPEN — HIT IT THEN',
    'VINES SWING OVER THE FALLS — HOLD JUMP TO GRAB ONE',
    'THE WINGMAN HOLDS THE BLUE SEAT — TWO GUNS, ONE JUNGLE',
    'SEAT 2 IS KEYBOARD-ONLY — THE PHONE KEEPS THE CPU ALLY',
    'THE WINGMAN STEPS BACK IN ON THE KEYBOARD — NOT ON THIS SCREEN',
    'CLEAR THE BASE AND STAGE 1 RETURNS — FASTER',
    'ONE HIT KILLS. BOTH SIDES.',
    'TAP TO START',
]
const MESSAGES = TOUCH ? MESSAGES_TOUCH : MESSAGES_KEYBOARD

const sfx = {
    shot: () => audioController.playSweep(920, 540, 0.05, 'square', 0.05),
    spread: () => { audioController.playSweep(760, 420, 0.07, 'square', 0.06); audioController.playNoise(0.04, 0.05) },
    efire: (v = 1) => audioController.playSweep(500 * v, 300 * v, 0.05, 'square', 0.035),
    // the turret's crew-served gun gets its own heavier report (#2782.6)
    efireBig: (v = 1) => { audioController.playSweep(360 * v, 150 * v, 0.09, 'sawtooth', 0.045); audioController.playNoise(0.05, 0.03) },
    jump: () => audioController.playSweep(260, 520, 0.09, 'square', 0.05),
    boom: () => { audioController.playNoise(0.28, 0.12); audioController.playSweep(160, 40, 0.25, 'triangle', 0.09) },
    spark: () => audioController.playNoise(0.05, 0.03),
    // capsule: the rise plus a bass answer (the original's jingles answer low)
    pickup: () => { audioController.playSweep(320, 980, 0.18, 'triangle', 0.08); setTimeout(() => audioController.playTone(196, 0.16, 'triangle', 0.05), 90) },
    splash: () => audioController.playNoise(0.06, 0.025),
    respawn: () => audioController.playSweep(700, 220, 0.16, 'triangle', 0.06),
    gameover: () => audioController.playSweep(320, 60, 0.6, 'sawtooth', 0.08),
    // S4 co-op: the blue seat's voices — a warmer join chirp, a deeper fall
    p2join: () => { audioController.playSweep(440, 880, 0.12, 'square', 0.05); setTimeout(() => audioController.playTone(1100, 0.1, 'square', 0.04), 90) },
    // #2837 the release chirp: a falling answer to the join's rising one —
    // the wingman taking the seat back. #2842: the fall now gets a rising
    // reply — call-and-response, so a handover reads as a handoff, not a loss.
    p2gone: () => { audioController.playSweep(880, 330, 0.14, 'square', 0.045); setTimeout(() => audioController.playSweep(440, 880, 0.12, 'square', 0.04), 150) },
    // #2842 the two-second drop-out warning: soft, well under the gunfire.
    seatWarn: () => audioController.playTone(760, 0.035, 'square', 0.028),
    // #2842 the arriving seat's boots on the sand — a dry thud under the dust.
    land: () => audioController.playNoise(0.07, 0.025),
    pdown: () => audioController.playSweep(300, 90, 0.3, 'square', 0.07),
    p2down: () => audioController.playSweep(240, 70, 0.3, 'sawtooth', 0.07),
    // stage clear: a 4-note call answered by a bass line (ART.md bar 4 — the
    // original's fanfare is a call-and-response, not a plain triad)
    clear: () => {
        const call = [660, 880, 1046, 1318]
        call.forEach((f, i) => setTimeout(() => audioController.playTone(f, i === 3 ? 0.24 : 0.12, 'square', 0.07), i * 130))
        const bass = [165, 220, 262, 330]
        bass.forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.16, 'triangle', 0.05), 65 + i * 130))
    },
    // #2902 the loop-up call: the resume announces itself like the cabinet's
    // board — an ascending run (raised further each pass, via loopVoice), a
    // snare slap under the slam frame, and a low answer. The world is held
    // (LOOP_FX beats) while this plays: two quiet beats before the jungle moves.
    loopUp: (n) => {
        const v = loopVoice(n)
        audioController.playSweep(300 * v, 900 * v, 0.12, 'sawtooth', 0.05)
        ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audioController.playTone(f * v, i === 3 ? 0.22 : 0.1, 'square', 0.07), 140 + i * 100))
        setTimeout(() => { audioController.playNoise(0.18, 0.08); audioController.playSweep(150, 50, 0.22, 'triangle', 0.08) }, 140)
    },
    enter: () => audioController.playSweep(140, 340, 0.35, 'triangle', 0.07),
    drown: () => { audioController.playNoise(0.22, 0.09); audioController.playSweep(300, 70, 0.3, 'sine', 0.07) },
    cannon: (v = 1) => { audioController.playSweep(220 * v, 90 * v, 0.12, 'square', 0.07); audioController.playNoise(0.06, 0.05) },
    // S3: the wheel's voices + the new roster
    mshot: () => audioController.playSweep(840, 500, 0.03, 'square', 0.035),
    fshot: () => { audioController.playSweep(420, 180, 0.12, 'sawtooth', 0.045); audioController.playNoise(0.08, 0.03) },
    lshot: () => audioController.playSweep(1600, 420, 0.1, 'sawtooth', 0.05),
    sniper: (v = 1) => audioController.playSweep(1300 * v, 240 * v, 0.09, 'square', 0.055),
    throw: () => audioController.playSweep(300, 560, 0.09, 'triangle', 0.04),
    coreHit: () => { audioController.playTone(1180, 0.05, 'square', 0.06); audioController.playSweep(700, 1100, 0.06, 'sawtooth', 0.04) },
    unlock: () => audioController.playTone(980, 0.07, 'triangle', 0.05),
    door: () => audioController.playSweep(180, 120, 0.1, 'square', 0.05),
    // S3.5 arms depot: the slit gun's heavier bark and the payout arpeggio
    dfire: (v = 1) => { audioController.playSweep(200 * v, 80 * v, 0.11, 'square', 0.06); audioController.playNoise(0.05, 0.04) },
    volley: () => { [520, 660, 780, 1040].forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.1, 'triangle', 0.06), i * 70)) },
    // #2847 pod carriers: the courier's low engine wash, and the cargo thunk
    // as the pod leaves the hooks (ART.md bar 4 — a sound on every action).
    // #2852: the wash gains a ~6 Hz rotor beat (three delayed thumps) — the
    // cabinet's courier arrives with a chop, not a hum; and the pod's landing
    // gets a soft sand hiss of its own.
    flyin: () => { audioController.playSweep(90, 150, 0.5, 'sawtooth', 0.028); audioController.playSweep(140, 90, 0.5, 'sawtooth', 0.022); for (let i = 0; i < 3; i++) audioController.playTone(64, 0.05, 'triangle', 0.05, i * 0.16) },
    cargo: () => { audioController.playSweep(420, 180, 0.14, 'triangle', 0.06); audioController.playNoise(0.05, 0.03) },
    dust: () => { audioController.playNoise(0.07, 0.05); audioController.playSweep(200, 90, 0.08, 'triangle', 0.03) },
    roar: () => { audioController.playNoise(0.9, 0.14); audioController.playSweep(120, 30, 0.9, 'sawtooth', 0.1); setTimeout(() => audioController.playSweep(90, 25, 0.6, 'triangle', 0.09), 250) },
    // #2885 the vine's voices: the grab is a wet whip-catch, the fling a
    // rising whoosh — the carrier announces itself (ART.md bar 4).
    vine: () => { audioController.playSweep(240, 560, 0.09, 'triangle', 0.05); audioController.playNoise(0.03, 0.02) },
    unvine: () => audioController.playSweep(480, 1020, 0.14, 'square', 0.045),
    // #2917 the hangar sortie speaks: the door is a hydraulic RATCHET (five
    // delayed low thumps under a rising hiss — the cabinet's grinding bay),
    // the hull's lift-off is an engine chop, and the strafe is a fat dropping
    // report, pitched below the wall guns so the sky threat sounds heavier.
    hangar: () => { audioController.playNoise(0.35, 0.02); for (let i = 0; i < 5; i++) audioController.playTone(58 + i * 3, 0.05, 'square', 0.045, i * 0.07); audioController.playSweep(70, 120, 0.4, 'sawtooth', 0.03) },
    lift: () => { audioController.playSweep(120, 320, 0.28, 'sawtooth', 0.05); audioController.playSweep(80, 200, 0.3, 'triangle', 0.04) },
    gsfire: () => { audioController.playSweep(380, 120, 0.13, 'square', 0.055); audioController.playNoise(0.06, 0.035) },
}

export default function ContraGame () {
    const wrapRef = useRef(null)
    const [mode, setMode] = useState('attract')           // attract | play | over | clear
    const [paused, setPaused] = useState(false)
    const modeRef = useRef('attract')
    const pausedRef = useRef(false)
    modeRef.current = mode
    pausedRef.current = paused

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        const wrap = wrapRef.current
        // StrictMode law: the canvas is created inside the effect (JSX-mounted
        // canvases are detached by the simulated unmount's cleanup — the whole
        // screen goes black in dev and nobody notices until a screenshot).
        const canvas = document.createElement('canvas')
        canvas.className = 'block'
        canvas.style.imageRendering = 'pixelated'
        wrap.appendChild(canvas)
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let raf = 0
        let last = 0
        let acc = 0
        let gs = makeGame(1987)
        let screen = 'attract'
        let demoHold = 0
        let clearHold = 0
        let overAt = 0
        let shake = 0
        let hiscore = Number(localStorage.getItem('contra:hiscore') || 0)
        const part = [] // cosmetic particles — Math.random is law here, never in sim
        const fire = [] // expanding fireballs — sized by the boom's kind (#2782)
        const keys = { l: false, r: false, u: false, d: false, j: false, f: false }
        let jumpQ = false, fireQ = false
        // S4 seat 2 (desktop keyboard, drop-in): WASD move, F jump, G fire.
        // No second touchpad — the phone keeps the CPU ally (Jon's rule).
        const keys2 = { l: false, r: false, u: false, d: false, j: false, f: false }
        let jumpQ2 = false, fireQ2 = false
        let wasGround = true
        // #1712 S2 seat law for replay: pad LEVEL alone cannot carry the drop-in
        // ceremony (OS auto-repeat is blocked at the keyboard, so a re-claim is a
        // fresh keydown whose edge the pad stream can't show). The shell latches
        // every SUCCESSFUL dropIn at its keydown site and ships the bank ticks on
        // rules.seat2 (comma list — rules must stay primitives); the Node adapter
        // re-runs dropIn at each. Latching at the call site (not a post-step edge
        // check) is what survives the arcade-loop rebuild: a held seat across the
        // win still re-claims honestly when the friend presses again on stage 2.
        const seat2 = []
        // #2842 presentation state for the seat ceremony (never sim truth):
        // the ceremony chopper, the drop-out warning edge, the rope tracker.
        let heli = null
        let warnArmed = false, warnTick = 0, lastEnterT = 0
        // #2902 loop-presentation state (shell-only, never sim truth): the
        // banner clock, and the attract demo's one taught pass at loop 2.
        let loopFx = null
        let demoLoop = 0, demoUntil = 0

        const drain = () => {
            // #2902 sound escalation: enemy reports ride loopVoice(gs.loop) —
            // pitch keyed to the pass number, never rng, so loop 1 is byte-silent
            // against the pre-loop set (v=1) and every later pass answers higher.
            const v = loopVoice(gs.loop)
            for (const e of gs.ev) {
                if (e.type === 'efire' && e.big) sfx.efireBig(v)
                else if (e.type === 'shot' && e.k === 'machine') sfx.mshot()
                else if (e.type === 'efire') sfx.efire(v)
                else if (e.type === 'cannon') sfx.cannon(v)
                else if (e.type === 'sniper') sfx.sniper(v)
                else if (e.type === 'dfire') sfx.dfire(v)
                else if (sfx[e.type]) sfx[e.type]()
                if (e.type === 'p2join') heli = { x: gs.p2.x, t: 0 } // #2842 the bird comes with the drop
                if (e.type === 'boom') {
                    shake = Math.min(6, shake + 5)
                    fire.push({ x: e.x, y: e.y, t: 0, kind: e.kind || 'tnt' })
                    const n = e.kind === 'kill' ? 8 : e.kind === 'death' ? 12 : 16
                    for (let i = 0; i < n; i++) {
                        const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 2.4
                        part.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, t: 22 + Math.random() * 10, c: i % 3 })
                    }
                } else if (e.type === 'spark') {
                    for (let i = 0; i < 5; i++) part.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.6, t: 10 + Math.random() * 8, c: 2 })
                }
            }
            // shoreline splash: landing on the sand lip kicks droplets off the
            // water line just below (the sea is at the bottom edge, #2782.1);
            // in the canyon the same landing reads as torrent spray
            if (gs.p.dead === 0 && gs.p.onGround && !wasGround && gs.p.y >= CFG.ground - 0.5) {
                sfx.splash()
                for (let i = 0; i < 7; i++) {
                    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
                    const v = 0.9 + Math.random() * 1.5
                    part.push({ x: gs.p.x + (Math.random() - 0.5) * 12, y: gs.phase === 'jungle' ? CFG.ground + 8 : gs.p.y + 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 12 + Math.random() * 8, c: i % 2 ? 3 : 4 })
                }
            }
            wasGround = gs.p.onGround
            // #2842 ceremony lifecycle (cosmetic, but rides every sim tick —
            // harness `tick()` included — so the drop-in reads identically for
            // a bot-driven seat and a human one).
            if (gs.p2.enterT === 0 && lastEnterT > 0 && gs.p2.onGround) {
                // touchdown: the arriving seat's soles kick sand on the deck
                sfx.land()
                for (let i = 0; i < 7; i++) {
                    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8
                    const v = 0.5 + Math.random() * 1.1
                    part.push({ x: gs.p2.x + (Math.random() - 0.5) * 10, y: gs.p2.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, t: 10 + Math.random() * 7, c: 5 })
                }
            }
            lastEnterT = gs.p2.enterT
            const warn = seatTagState(gs) === 'warn'
            if (warn && !warnArmed) { warnArmed = true; warnTick = gs.tick; sfx.seatWarn() }
            else if (!warn) warnArmed = false
            if (warnArmed && gs.tick === warnTick + 60) sfx.seatWarn()
            if (heli) {
                if (gs.p2.enterT > 0) { heli.x = gs.p2.x; heli.t = 0 }
                else { heli.t += 1; heli.x += 2.6 }
                if (heli.t > 88 || heli.x > (gs.phase === 'jungle' ? gs.cam : 0) + W + 44) heli = null
            }
            gs.ev.length = 0
        }

        const simPad = () => {
            // Latch taps: a press shorter than one 16.7ms tick must not evaporate
            // between polls (the harness's press() is faster than the loop).
            const pad = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.j || jumpQ, b: keys.f || fireQ }
            jumpQ = fireQ = false
            return pad
        }

        const simPad2 = () => {
            const pad = { left: keys2.l, right: keys2.r, up: keys2.u, down: keys2.d, a: keys2.j || jumpQ2, b: keys2.f || fireQ2 }
            jumpQ2 = fireQ2 = false
            return pad
        }

        const startPlay = () => {
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0)
            part.length = 0
            fire.length = 0
            wasGround = true
            heli = null; warnArmed = false; lastEnterT = 0
            demoHold = 0
            loopFx = null; demoLoop = 0   // #2902: a fresh run starts at loop 1 — no banner owed
            // #1712: a new take starts quiet — no phantom claims carried on keys
            // still held from the last run; the banked pad matches the fresh sim.
            keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
            jumpQ2 = fireQ2 = false
            seat2.length = 0
            setMode('play'); screen = 'play'
        }

        // #1711 S2 consent, arcade-shaped: Contra's entry law is *any key takes
        // the seat* (#2837, checked with real keys) — so play never waits on the
        // paperwork. Consent gates RECORDING, never the game (autoRecord doctrine:
        // declined → plays exactly the same): the question goes up at the human's
        // first press, and beginRun() only ever ships bytes the stored grant
        // covers — a mid-take grant records from that tick, never before it.
        const humanStart = () => {
            startPlay()
            askConsent()
                .then((c) => { if (c && c.motion) beginRun() })
                .catch(() => {})
        }

        const endTo = (what) => {
            screen = what
            setMode(what)
            if (what === 'over') {
                overAt = performance.now()
                if (gs.score > hiscore) { hiscore = gs.score; localStorage.setItem('contra:hiscore', String(hiscore)) }
                endRun() // #1711: the take ends with the run (no-op when idle/declined) — and NOT on 'clear': #2958 law, one take spans the arcade loops
            }
        }

        // #2894 THE ARCADE LOOP — STAGE CLEAR is not the end. The gate blows,
        // the fanfare plays, and stage 1 comes back around at loop n's tempo
        // (#2884 gap: the cabinet loops stage 1 faster; the loop lives here at
        // the shell, the tempo lives in sim.js). Score carries; the shared pool
        // carries and pays the classic loop courtesy — surviving a pass buys ONE
        // spare life for the next (banked to LOOP_LIVES_MAX); the gun the run
        // carried carries too. Fresh spawn-grace at the drop.
        const startLoop = () => {
            gs = arcadeLoop(gs) // #1712: the carry is sim law now — shell, harness and the dataset adapter rebuild identically
            part.length = 0
            fire.length = 0
            wasGround = true
            heli = null; warnArmed = false; lastEnterT = 0
            // #1712: the hotter stage opens with a CPU wingman; a friend who held
            // the blue seat presses again to rappel back in (the standing re-drop
            // law) — keys2 goes quiet so the bank never carries the old run's
            // held keys into the new stage, and a re-claim latches as a new tick.
            keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
            jumpQ2 = fireQ2 = false
            setMode('play'); screen = 'play'
            // #2902 the resume speaks: slam the LOOP banner and hold the world
            // (two quiet beats) while it reads — a player who never saw the tag
            // cannot miss the interstitial.
            loopFx = { t: 0, n: gs.loop, k: gs.lk }
            sfx.loopUp(gs.loop)
        }

        // #2902: attract lifecycle. Reset = a fresh loop-1 demo seed; the loop
        // pass = the SAME run the demo just won, rebuilt at loop 2 with the
        // banner — teaching the mechanic before a player ever clears the gate.
        const attractReset = () => {
            demoLoop = 0; demoHold = 0
            gs = makeGame((gs.seed + 7) >>> 0)
            part.length = 0; fire.length = 0
            wasGround = true; heli = null
        }
        const attractLoop = () => {
            gs = arcadeLoop(gs) // #1712: the demo learns the same loop law the takes replay
            part.length = 0; fire.length = 0
            wasGround = true; heli = null; demoHold = 0
            demoLoop = 1; demoUntil = 900            // ~15 s of the hot stage, then attract again
            loopFx = { t: 0, n: gs.loop, k: gs.lk }
            sfx.loopUp(gs.loop)
        }

        const toBank = (p) => ({
            left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, a: !!p.a, b: !!p.b,
        })

        const stepSim = (pad) => {
            const p2 = simPad2()
            step(gs, pad, p2)
            drain()
            // #1712 S2: bank exactly what THIS tick consumed (attract demo ticks
            // never enter a take). The P2 drop-in needs no side channel: the
            // keyboard press that called dropIn IS the first pad-1 content the
            // bank carries, so the Node adapter re-applies the flip at the same
            // tick derivably from the stream (vs DD's rules.seat2At latch).
            if (screen === 'play' && isRecording() && !contractHoldsLoop()) recordLiveTick([toBank(pad), toBank(p2)])
            if (gs.end === 'win') { if (screen === 'play') { endTo('clear'); clearHold = 220 } }
            else if (gs.end === 'dead') { if (screen === 'play') endTo('over') }
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.5)
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const jungle = gs.phase === 'jungle'
            if (jungle) drawBackground(ctx, gs.cam, gs.tick, gs.loop)
            else drawCanyon(ctx, gs.camY, gs.tick)
            ctx.save()
            ctx.translate(-Math.round(gs.cam) + Math.round(sx), (jungle ? 0 : -Math.round(gs.camY)) + Math.round(sy))
            if (jungle) {
                drawGround(ctx, gs.cam, gs.tick)
                for (const pl of PLATFORMS) drawPlatform(ctx, pl)
                if (gs.depot && !gs.depot.dead) drawDepot(ctx, gs.depot, gs.tick)
                drawGate(ctx)
            } else {
                if (gs.phase === 'boss' && gs.boss) drawGateStructure(ctx, gs.boss, gs.tick)
                for (const pl of FALLS_LEDGES) drawLedge(ctx, pl)
                // #2885: the gorge's carriers sway over the climb
                for (const v of gs.vines) {
                    const rv = gs.p.vine === v.i ? gs.p.y - 22 : (gs.p2.vine === v.i ? gs.p2.y - 22 : null)
                    drawVine(ctx, v, vineTheta(gs, v.i), rv)
                }
            }
            for (const br of gs.barrels) if (!br.gone) drawBarrel(ctx, br)
            for (const t of gs.turrets) if (!t.dead) drawTurret(ctx, t)
            for (const sn of gs.snipers) if (!sn.dead && sn.awake) drawSniper(ctx, sn, gs.tick, gs.loop)
            for (const s of gs.soldiers) if (!s.dead && s.awake) drawSoldier(ctx, s, gs.tick, gs.loop)
            // #2847: the couriers run above the fight, pods under their bellies;
            // released cargo draws on the same deck as the volley capsules.
            for (const cr of gs.carriers) if (!cr.dead) drawCarrier(ctx, cr, gs.tick)
            // #2917: the gate's gunships patrol the arena sky above the fortress
            if (gs.boss) for (const sh of gs.gunships) drawGunship(ctx, sh, gs.tick)
            if (gs.capsule) drawCapsule(ctx, gs.capsule, gs.tick)
            for (const c of gs.vc) drawCapsule(ctx, c, gs.tick)
            for (const c of gs.pods) drawCapsule(ctx, c, gs.tick)
            for (const b of gs.pb) drawBullet(ctx, b, false)
            for (const b of gs.eb) { if (b.gr) drawGrenade(ctx, b); else drawBullet(ctx, b, true) }
            // S4: the blue seat draws at his own body, under the hero. #2837:
            // while the arrival descent runs, his rope paints ahead of him and
            // he doesn't flicker — you see him coming. #2842: the seat itself
            // rides with the clinging-rappel pose (drawPlayer's 6th flag).
            if (gs.p2.dead === 0 && !gs.p2.out && !(gs.end === 'dead')) {
                const rappelling = gs.p2.enterT > 0
                if (rappelling) drawRappel(ctx, gs.p2.x, (gs.phase === 'jungle' ? 0 : gs.camY) - 4, gs.p2.y)
                drawPlayer(ctx, gs.p2, gs.tick, true, rappelling, rappelling || gs.p2.vine >= 0)
            }
            else if (gs.p2.dead > 0) drawDeathTumble(ctx, gs.p2.x, gs.p2.y, Math.floor((CFG.respawnFreeze - gs.p2.dead) / 12) % 4, true)
            if (gs.p.dead === 0 && !(gs.end === 'dead')) drawPlayer(ctx, gs.p, gs.tick, false, false, gs.p.vine >= 0)
            else if (gs.p.dead > 0) drawDeathTumble(ctx, gs.p.x, gs.p.y, Math.floor((CFG.respawnFreeze - gs.p.dead) / 12) % 4)
            // expanding fireballs under the sparks (cosmetic, sized by kind)
            for (let i = fire.length - 1; i >= 0; i--) {
                if (!drawFireball(ctx, fire[i])) fire.splice(i, 1)
                else fire[i].t += 1
            }
            // particles (cosmetic layer)
            for (let i = part.length - 1; i >= 0; i--) {
                const q = part[i]
                q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.t -= 1
                if (q.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = q.c === 0 ? '#ffd23c' : q.c === 1 ? '#ff6a2a' : q.c === 2 ? '#d9dde2' : q.c === 3 ? '#7cc7ff' : q.c === 5 ? '#c9ae7c' : '#e8f6ff'
                ctx.fillRect(Math.round(q.x), Math.round(q.y), q.c === 2 ? 1 : 2, q.c === 2 ? 1 : 2)
            }
            ctx.restore()
            if (jungle) drawFringe(ctx, gs.cam)
            else drawWater(ctx, gs.tick)
            // #2842 the ceremony chopper rides ABOVE the canopy (the fringe is
            // a foreground layer — drawing the bird before it buried the bird),
            // and under the HUD. Pulls off right once the seat is down.
            if (heli) {
                ctx.save(); ctx.translate(-Math.round(gs.cam), jungle ? 0 : -Math.round(gs.camY))
                drawHeli(ctx, heli.x, (jungle ? 0 : gs.camY) + 26 + Math.sin(gs.tick / 7) * 1.2, gs.tick, heli.t > 56 ? 1 - (heli.t - 56) / 32 : 1)
                ctx.restore()
            }
            drawHud(ctx, gs, hiscore, loopFx, isRecording())
            // #2902 the LOOP banner rides above the world, under nothing.
            if (loopFx) drawLoopBanner(ctx, loopFx.n, loopFx.t, loopFx.k)

            ctx.textBaseline = 'top'
            if (screen === 'attract' && !loopFx && !demoLoop) {
                ctx.fillStyle = '#e23b2e'
                ctx.font = 'bold 30px "Courier New", monospace'
                ctx.fillText('CONTRA', 132, 40)
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText('OPERATION — JUNGLE AND BASE', 136, 76)
                // message rotation rides WORLD ticks, not paint frames: a slow
                // software-rendered page must not cycle attract copy at half speed
                const msg = Math.floor(gs.tick / 150) % MESSAGES.length
                ctx.font = 'bold 10px "Courier New", monospace'
                ctx.fillStyle = msg === MESSAGES.length - 1 && Math.floor(gs.tick / 24) % 2 === 0 ? '#ffffff' : '#cdeea8'
                const t = MESSAGES[msg]
                ctx.fillText(t, 192 - ctx.measureText(t).width / 2, 112)
                ctx.font = '8px "Courier New", monospace'
                ctx.fillStyle = '#7d8f6a'
                ctx.fillText('KONAMI-STYLE RUN & GUN — 1987 HOMAGE', 100, 128)
            } else if (screen === 'clear') {
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 16px "Courier New", monospace'
                ctx.fillText('STAGE CLEAR', 140, 92)
                ctx.fillStyle = '#cdeea8'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText('THE CORE IS DUST — THE BASE IS BROKEN', 96, 116)
                // #2894 the arcade never quits on you — it sends the stage back hotter
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText(`STAGE 1 STRIKES BACK — LOOP ${gs.loop + 1}`, 104, 132)
            } else if (screen === 'over') {
                ctx.fillStyle = '#e23b2e'
                ctx.font = 'bold 16px "Courier New", monospace'
                ctx.fillText('GAME OVER', 144, 96)
                ctx.fillStyle = '#cdeea8'
                ctx.font = '9px "Courier New", monospace'
                ctx.fillText(`SCORE ${gs.score}  HI ${hiscore}`, 150, 120)
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) acc = 0
                else {
                    acc += ft
                    while (acc >= SIM_MS) {
                        if (screen === 'play') {
                            // #2902: the LOOP banner holds the world still — the
                            // stage starts on the two beats AFTER the read.
                            if (loopFx) { loopFx.t += 1; if (loopFx.t >= LOOP_FX) loopFx = null }
                            else stepSim(simPad())
                        } else if (screen === 'attract') {
                            // #2902: the cabinet teaches its own loop — the demo
                            // now survives its endings (it used to stick on the
                            // last frame forever), runs one pass at LOOP 2 with
                            // the banner slamming over the jungle, then hands the
                            // attract copy back.
                            if (loopFx) { loopFx.t += 1; if (loopFx.t >= LOOP_FX) loopFx = null }
                            else if (!gs.end) {
                                stepSim(autopilot(gs))
                                if (demoLoop && gs.tick >= demoUntil) attractReset()
                            } else if (demoHold > 0) {
                                demoHold -= 1
                                if (demoHold === 0) {
                                    if (gs.end === 'win' && demoLoop === 0) attractLoop()
                                    else attractReset()
                                }
                            } else demoHold = 120
                        } else if (screen === 'clear') {
                            gs.tick += 1
                            if (--clearHold <= 0) startLoop()   // #2894 the arcade never sends you back to attract on a win — it loops
                        } else if (screen === 'over') {
                            gs.tick += 1
                        }
                        acc -= SIM_MS
                    }
                }
            }
            paint()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            if (screen === 'attract') { humanStart(); return }
            if (screen === 'over') { if (performance.now() - overAt > 900) endTo('attract'); return }
            if (screen === 'clear') return
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space' || e.code === 'KeyZ') { keys.j = true; jumpQ = true }
            if (e.code === 'KeyX' || e.code === 'KeyC') { keys.f = true; fireQ = true }
            // S4 seat 2 keys — and the drop-in law (#2837): the first touch of
            // a P2 key doesn't puppeteer the standing wingman — it calls for a
            // drop; the soldier rappels in at the hero's side (the join chirp
            // rides the sim's p2join event).
            const isP2 = e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyF' || e.code === 'KeyG'
            if (e.code === 'KeyA') keys2.l = true
            if (e.code === 'KeyD') keys2.r = true
            if (e.code === 'KeyW') keys2.u = true
            if (e.code === 'KeyS') keys2.d = true
            if (e.code === 'KeyF') { keys2.j = true; jumpQ2 = true }
            if (e.code === 'KeyG') { keys2.f = true; fireQ2 = true }
            if (isP2 && !gs.p2.human && !gs.p2.out && dropIn(gs)) seat2.push(gs.tick + 1) // #1712: bank tick of the ceremony — the next tick the loop banks after this press
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space' || e.code === 'KeyZ') keys.j = false
            if (e.code === 'KeyX' || e.code === 'KeyC') keys.f = false
            if (e.code === 'KeyA') keys2.l = false
            if (e.code === 'KeyD') keys2.r = false
            if (e.code === 'KeyW') keys2.u = false
            if (e.code === 'KeyS') keys2.d = false
            if (e.code === 'KeyF') keys2.j = false
            if (e.code === 'KeyG') keys2.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false; keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false }
        const onPointer = () => {
            if (screen === 'attract') { humanStart(); return }
            if (screen === 'over') { if (performance.now() - overAt > 900) endTo('attract') }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        // ---- capture spec (#1711 S2 + #1712) ----
        // One spec for both arms: armLiveCapture makes the live bank exist in
        // production (consent-gated via autoRecord), exposeGame re-arms the
        // byte-identical wiring in DEV. Seat kinds resolve at record-STOP
        // (recording.js evaluates function sources there): seat 0 is the thumb
        // by construction (#2058 — and Contra has no watch seat to lie about),
        // seat 1 carries whoever holds it — the wingman's brain is `cpu`, a
        // person who rappelled in is `human`.
        const recSpec = {
            id: 'contra',
            method: 'dpad',
            players: 2,
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => [{ kind: 'model' }, { kind: gs.p2.human ? 'human' : 'cpu' }],
            rules: () => (seat2.length ? { seat2: seat2.join(',') } : {}),
            reset: (seed) => {
                gs = makeGame(seed >>> 0)
                part.length = 0
                fire.length = 0
                loopFx = null; demoLoop = 0   // #2902: no banner owed on a harness reset
                keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false
                keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
                jumpQ = fireQ = jumpQ2 = fireQ2 = false
                wasGround = true; heli = null; warnArmed = false; lastEnterT = 0
                seat2.length = 0
                screen = 'play'
                setMode('play')
            },
            tick: (pad, all = [pad]) => {
                const p2 = all[1] || {}
                if (gs.end) { gs.tick += 1; drain(); return }
                step(gs, {
                    left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down,
                    a: !!pad.a, b: !!pad.b,
                }, {
                    left: !!p2.left, right: !!p2.right, up: !!p2.up, down: !!p2.down,
                    a: !!p2.a, b: !!p2.b,
                })
                drain()
            },
            state: () => ({
                tick: gs.tick, score: gs.score, done: gs.end !== null,
                seed: gs.seed, lives: gs.lives,
                x: Math.round(gs.p.x), y: Math.round(gs.p.y), weapon: gs.p.weapon,
                phase: gs.phase, core: gs.boss ? gs.boss.core : null,
                soldiersAlive: gs.soldiers.filter((s) => !s.dead).length,
                // #2814: one pool — `lives` above IS both seats' bank; the
                // seat's own bank no longer exists, only its standing state.
                allyWeapon: gs.p2.weapon, allyOut: gs.p2.out,
                carriers: gs.carriers.length, pods: gs.pods.length,
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            snapshot: () => JSON.parse(JSON.stringify(gs)),
            restore: (s) => { gs = s },
        }
        // #1711 S2: arm the live capture for every build (DEV re-arms the
        // identical wiring inside exposeGame); banking only happens while a
        // consented auto capture runs (autoRecord.js).
        initAutoRecord()
        armLiveCapture(recSpec)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${Math.floor(W * sc)}px`
            canvas.style.height = `${Math.floor(H * sc)}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__contraTest = {
                probe: () => ({
                    screen, tick: gs.tick, x: +gs.p.x.toFixed(2), y: +gs.p.y.toFixed(2), onGround: gs.p.onGround,
                    lives: gs.lives, score: gs.score, weapon: gs.p.weapon, end: gs.end, cam: Math.round(gs.cam),
                    loop: gs.loop, lk: +gs.lk.toFixed(3), seed: gs.seed,   // #2894 the arcade loop is observable
                    loopFx: loopFx ? { t: loopFx.t, n: loopFx.n, k: +loopFx.k.toFixed(3) } : null,   // #2902 the banner is observable
                    demoLoop,   // #2902 attract is teaching the loop right now
                    phase: gs.phase, camY: +gs.camY.toFixed(2),
                    core: gs.boss ? gs.boss.core : null,
                    coreOpen: gs.boss ? (gs.boss.coreT % CFG.coreCycle) < CFG.coreOpen : null,
                    soldiersAlive: gs.soldiers.filter((s) => !s.dead).length, turretsAlive: gs.turrets.filter((t) => !t.dead).length,
                    barrelsLeft: gs.barrels.filter((b) => !b.gone).length, pb: gs.pb.length, eb: gs.eb.length,
                    capsule: gs.capsule ? { x: +gs.capsule.x.toFixed(1), y: gs.capsule.y, kind: gs.capsule.kind || 'spread' } : null,
                    volley: gs.vc.length,
                    carriers: gs.carriers.length,
                    pods: gs.pods.map((c) => ({ x: +c.x.toFixed(1), y: +c.y.toFixed(1), kind: c.kind, r: c.recoil || 0, pf: c.puff || 0 })),
                    depot: gs.depot ? { hp: gs.depot.hp, dead: gs.depot.dead } : null,
                    gateGuns: gs.boss ? gs.boss.guns.map((g) => ({ hp: g.hp, dead: g.dead })) : null, // #2880
                    cascadeDying: gs.boss ? gs.boss.dying : null, // #2885 scripted finale countdown
                    sortie: { // #2917 the second air layer is observable
                        hulls: gs.gunships.map((s) => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), hp: s.hp, flash: s.flash })),
                        door: gs.boss ? gs.boss.hangar.open : 0, due: gs.boss ? gs.boss.hangar.launchAt : 0,
                        next: gs.sortieT, n: gs.sortieN,
                        aimed: gs.eb.filter((b) => b.gs).map((b) => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), vy: +b.vy.toFixed(2) })),
                    },
                    vine: { p: gs.p.vine, q: gs.p2.vine, tips: gs.vines.map((v) => { const tp = vineTip(gs, v.i); return { x: +tp.x.toFixed(1), y: +tp.y.toFixed(1) } }) },
                    snipersAlive: gs.snipers.filter((s) => !s.dead).length, nades: gs.eb.filter((b) => b.gr).length,
                    ally: { x: +gs.p2.x.toFixed(2), y: +gs.p2.y.toFixed(2), onGround: gs.p2.onGround, weapon: gs.p2.weapon, out: gs.p2.out, human: gs.p2.human, dead: gs.p2.dead, enter: gs.p2.enterT, idle: gs.p2.idle, padClaim: gs.p2.padClaim },
                    keys: { ...keys },
                    keys2: { ...keys2 },
                    msg: MESSAGES[Math.floor(gs.tick / 150) % MESSAGES.length],
                    touch: TOUCH,   // #2971: the touch-aware copy is observable
                    tumble: gs.p.dead > 0 ? Math.floor((CFG.respawnFreeze - gs.p.dead) / 12) % 4 : -1,
                }),
                start: startPlay,
                // #2902: reach the attract loop-teach on the harness's clock
                // (waiting 60 s for the demo to clear stage 1 by itself is not
                // a leg) — only ever fires from the attract screen.
                attractLoopNow: () => { if (screen !== 'attract' || gs.end) return false; attractLoop(); return true },
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.warp === 'falls') warpFalls(gs)
                    if (opts.warp === 'boss') warpBoss(gs)
                    if (opts.x !== undefined) gs.p.x = opts.x
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.weapon) gs.p.weapon = opts.weapon
                    if (opts.inv !== undefined) gs.p.inv = opts.inv
                    if (opts.coreOpen !== undefined && gs.boss) gs.boss.coreT = opts.coreOpen ? 0 : CFG.coreOpen + 20
                    if (opts.clearBoss && gs.boss) { gs.boss.guns.forEach((g) => { g.t = 1e9 }); gs.boss.doors.forEach((d) => { d.t = 1e9 }); gs.soldiers.length = 0 }
                    if (opts.loop !== undefined) { gs.loop = Math.max(1, opts.loop | 0); gs.lk = loopK(gs.loop) }   // #2894 aim the tempo from the harness
                    // #2880: stand a caved (or dented) near housing for the browser legs
                    if (opts.gunHp0 !== undefined && gs.boss) {
                        gs.boss.guns[0].hp = Math.max(0, opts.gunHp0)
                        if (gs.boss.guns[0].hp === 0) gs.boss.guns[0].dead = true
                    }
                    if (opts.capsuleNear) gs.capsule = { x: gs.p.x + 8, y: opts.capsuleY ?? gs.p.y - 14, vx: 0, kind: opts.capsuleKind || 'spread' }
                    // #2847: stand a courier off the hero's right for the browser legs
                    if (opts.carrierHere) gs.carriers.push({ x: gs.p.x + (opts.carrierDX ?? 120), y: opts.carrierY ?? 164, vx: CFG.carrierVx, hp: CFG.carrierHp, kind: opts.carrierKind || 'laser', dead: false })
                    // #2917: stand a gunship hull (still, at pin-point) for the
                    // pixel legs; sortieOff silences the schedule; hangarOpen pins
                    // the door mid-grind so the bay can be asserted on the canvas.
                    if (opts.sortieNow && gs.boss) {
                        gs.gunships.length = 0
                        gs.gunships.push({ x: opts.gsX ?? 250, y: opts.gsY ?? 60, ty: opts.gsY ?? 60, vx: opts.gsVx ?? 0, hp: CFG.gsHp, t: 1e9, n: 1, dead: false, flash: 0 })
                    }
                    if (opts.sortieOff) { gs.sortieT = 1e9; gs.gunships.length = 0 }
                    if (opts.hangarOpen !== undefined && gs.boss) { gs.boss.hangar.open = opts.hangarOpen; gs.boss.hangar.launchAt = 0; gs.sortieT = 1e9 }
                    if (opts.podHere) gs.pods.push({ x: gs.p.x + (opts.podDX ?? 40), y: CFG.ground - 2, vx: CFG.podVx, vy: 0, kind: opts.podKind || 'laser' })
                    // #2885: hide the canopy (pixel-baseline leg) or stand the hero
                    // airborne right on a swinging tip for the grab legs (vineAt
                    // picks which vine; vineAt0 = vine 0)
                    if (opts.vinesGone) { gs.vines.length = 0 }
                    if (opts.vineAt !== undefined || opts.vineAt0) {
                        if (gs.phase !== 'falls') warpFalls(gs)
                        const tp = vineTip(gs, opts.vineAt ?? 0)
                        gs.p.x = tp.x; gs.p.y = tp.y + 14; gs.p.vy = -1; gs.p.onGround = false
                    }
                    if (opts.kill) { gs.p.inv = 0; gs.eb.push({ x: gs.p.x + 2, y: gs.p.y - 14, vx: 0.1, vy: 0 }) }
                    if (opts.clearEnemies) for (const s of gs.soldiers) s.dead = true
                    // S4 co-op hooks for the browser legs
                    if (opts.allyHuman) gs.p2.human = true
                    if (opts.allyDrop) dropIn(gs)                 // #2837 ceremony arrival
                    if (opts.allyRelease) releaseSeat(gs)         // #2837 manual release
                    if (opts.allyX !== undefined) gs.p2.x = opts.allyX
                    if (opts.allyWeapon) gs.p2.weapon = opts.allyWeapon
                    if (opts.killAlly) { gs.p2.human = true; gs.p2.inv = 0; gs.eb.push({ x: gs.p2.x + 2, y: gs.p2.y - 14, vx: 0.1, vy: 0 }) }
                    if (opts.allyOut) { gs.p2.out = true }   // #2814: seats don't hold banks — the pin stands the seat down
                    return true
                },
            }
            mountDbg({
                title: 'CONTRA',
                getState: () => [
                    `x ${gs.p.x.toFixed(0)}/${CFG.worldW}  cam ${Math.round(gs.cam)}/${Math.round(gs.camY)}  y ${gs.p.y.toFixed(0)}  ground ${gs.p.onGround ? 1 : 0}  phase ${gs.phase}`,
                    `score ${gs.score}  lives ${gs.lives}  weapon ${gs.p.weapon}  inv ${gs.p.inv}  end ${gs.end || '-'}  loop ${gs.loop} k=${gs.lk.toFixed(2)}` + (gs.boss ? `  core ${gs.boss.core}/${CFG.coreHp} ${gs.boss.dying ? 'DYING' : (gs.boss.coreT % CFG.coreCycle) < CFG.coreOpen ? 'OPEN' : 'SHUT'}` : ''),
                    `ALLY ${gs.p2.out ? 'DOWN' : `x ${gs.p2.x.toFixed(0)}  y ${gs.p2.y.toFixed(0)}  ${gs.p2.human ? 'HUMAN' : 'CPU'}  ${gs.p2.weapon}`}  POOL ${gs.lives}`,
                    `soldiers ${gs.soldiers.filter((s) => !s.dead).length}/${gs.soldiers.length} alive  turrets ${gs.turrets.filter((t) => !t.dead).length}  snipers ${gs.snipers.filter((t) => !t.dead).length}  nades ${gs.eb.filter((b) => b.gr).length}  barrels ${gs.barrels.filter((b) => !b.gone).length}  bullets p/e ${gs.pb.length}/${gs.eb.length}`,
                    `SKY ${gs.carriers.length ? `carrier hp ${gs.carriers[0].hp} ${gs.carriers[0].kind}` : 'clear'}  pods ${gs.pods.length}  next courier t${gs.nextCarrier}`,
                    `SKY2 ${gs.gunships.length ? `GUNSHIP hp ${gs.gunships[0].hp} x${gs.gunships[0].x.toFixed(0)} y${gs.gunships[0].y.toFixed(0)}` : 'no sortie'}  hangar ${gs.boss ? (gs.boss.hangar.open > 0 ? `GRIND t${gs.boss.hangar.open}` : gs.boss.hangar.launchAt > 0 ? 'DUE' : 'shut') : '-'}  next sortie t${gs.sortieT > 1e8 ? 'off' : gs.sortieT}` ,   // #2917
                    `VINES ${gs.p.vine >= 0 ? `HERO RIDING #${gs.p.vine}` : gs.p2.vine >= 0 ? `ALLY RIDING #${gs.p2.vine}` : `${gs.vines.length} swaying`}  ${gs.boss && gs.boss.dying ? `CASCADE t${gs.boss.dying}` : ''}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.lives += 1; return 'extra life' } },
                    { label: 'SPREAD NOW', run: () => { gs.p.weapon = 'spread'; return 'spread gun racked' } },
                    { label: 'CYCLE WHEEL', run: () => { const w = ['rifle', 'spread', 'machine', 'fire', 'laser']; gs.p.weapon = w[(w.indexOf(gs.p.weapon) + 1) % w.length]; return 'weapon: ' + gs.p.weapon } },
                    { label: 'CAPSULE HERE', run: () => { gs.capsule = { x: gs.p.x + 24, y: gs.p.y - 14, vx: 0 }; return 'capsule inbound' } },
                    { label: 'CARRIER HERE', run: () => { if (gs.carriers.length) return 'a courier is already over the jungle'; gs.carriers.push({ x: gs.p.x + 120, y: 164, vx: CFG.carrierVx, hp: CFG.carrierHp, kind: 'laser', dead: false }); return 'gunship inbound — shoot it down' } },
                    { label: 'SORTIE NOW', run: () => { // #2917 the hangar, on demand
                        if (gs.phase !== 'boss') warpBoss(gs)
                        gs.boss.hangar.open = CFG.gsGrind; gs.boss.hangar.launchAt = gs.tick + CFG.gsTelegraph
                        gs.sortieN += 1; gs.ev.push({ type: 'hangar' })
                        return 'bay doors grinding — gunship due at the parapet' } },
                    { label: 'HULL DOWN', run: () => { if (!gs.gunships.length) return 'the sky is clear'; gs.gunships[0].hp = 1; return 'gunship at one round from the fireball' } },
                    { label: 'LOOP +1', run: () => { gs.loop += 1; gs.lk = loopK(gs.loop); return `stage 1 at loop ${gs.loop} — pressure x${gs.lk.toFixed(2)}` } },   // #2894
                    { label: 'P2: HUMAN SEAT', run: () => { if (gs.p2.out) return 'seat down — pool spent'; if (gs.p2.human) releaseSeat(gs); else dropIn(gs); return gs.p2.human ? 'human seat: the soldier rappels in (WASD/F/G)' : 'wingman back on the seat' } },
                    { label: 'TO WATERFALL', run: () => { warpFalls(gs); return 'into the canyon' } },
                    { label: 'TO THE GATE', run: () => { warpBoss(gs); return 'before the core' } },
                ],
            })
            exposeGame(recSpec) // #1712: the harness drives the same spec the phone banks
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.end != null, lives: gs.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            endRun() // #1711: an unmount mid-run ends the take (no-op when idle)
            if (import.meta.env.DEV) { if (window.__contraTest) delete window.__contraTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [])

    return (
        <div ref={wrapRef} className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CONTRA')} onResume={handleResume} />}
            <VirtualControls visible={mode === 'play' && !paused} secondAction={{ label: 'FIRE', code: 'KeyX' }} />
        </div>
    )
}

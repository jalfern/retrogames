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
import { audioController, MUSIC } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState, recordLiveTick, recordVoiceCmd, isRecording, armLiveCapture, hasAutoVoice } from '../../utils/gameContract'
import { initAutoRecord, askConsent, beginRun, endRun } from '../../utils/autoRecord'
import { askVoiceConsent, acquireListenBadge } from '../../utils/voiceCapture'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import { W, H, CFG, PLATFORMS, FALLS_LEDGES, makeGame, step, autopilot, stateHash, warpFalls, warpBoss, dropIn, releaseSeat, vineTheta, vineTip, loopK, arcadeLoop, LOOP_FX, loopVoice, applyCall, KONAMI, KONAMI_LIVES, konamiFeed, konamiArmed, contPhase, contBeat } from './sim.js'
import { parseCall, intentKey, intentLabel } from './voicecalls.js'
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
    'AIM UP · AIM DOWN · FOLLOW · HOLD · SPREAD — SHOUT IT',
    'DUCK UNDER THE FIRE — DOWN KNEELS, DOWN AGAIN LIES FLAT',
    'UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A — 30 UP',
    '30,000 POINTS BUYS ANOTHER LIFE — EVERY RUN',
    'THREE CONTINUES KEEP YOUR SCORE — ANSWER THE COUNT',
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
    'MIC GRANTED? THE WINGMAN TAKES SHOUTED ORDERS',
    'DOWN KNEELS, DOWN AGAIN LIES FLAT — CRAWL AND FIRE LOW',
    'UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A — 30 UP',
    '30,000 POINTS BUYS ANOTHER LIFE — EVERY RUN',
    'THREE CONTINUES KEEP YOUR SCORE — ANSWER THE COUNT',
    'ONE HIT KILLS. BOTH SIDES.',
    'TAP TO START',
]
const MESSAGES = TOUCH ? MESSAGES_TOUCH : MESSAGES_KEYBOARD

// #3042 THE CONTINUE — the cabinet's second chance. The 1987 machine does not
// end your game when the pool runs dry: you answer a countdown and rejoin, up
// to THREE times per game (coin + Start — the Konami law this shelf already
// carries via IronRing #1103). The window itself is sim law (contPhase in
// sim.js — world ticks, harness-pinned); the purse below is shell state — the
// credits the game sells, fresh at every attract start.
const CONTINUES_MAX = 3      // continues per game

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
    // #3042 the continue voices: the countdown ticks a dry slot-click once a
    // second, and the re-entry is a rising sting — the mirror of gameover's
    // fall, so the run reads as "back in", not "another life".
    contTick: () => audioController.playTone(880, 0.03, 'square', 0.03),
    // #3045 the ceremony: a coin clacks into the slot before the count (metallic
    // band — noise transient + two high pings, the playSweep-free coin box ring),
    // and the last seconds heat up past the digit tick (#3042's world-tick law,
    // rates from contBeat).
    coin: () => { audioController.playNoise(0.02, 0.09); setTimeout(() => { audioController.playTone(2093, 0.05, 'square', 0.03); audioController.playTone(1568, 0.07, 'triangle', 0.025) }, 60) },
    contHot: () => audioController.playTone(1175, 0.028, 'square', 0.038),
    contIn: () => { audioController.playSweep(220, 660, 0.2, 'square', 0.07); setTimeout(() => audioController.playTone(880, 0.14, 'square', 0.05), 160) },
    // S4 co-op: the blue seat's voices — a warmer join chirp, a deeper fall
    p2join: () => { audioController.playSweep(440, 880, 0.12, 'square', 0.05); setTimeout(() => audioController.playTone(1100, 0.1, 'square', 0.04), 90) },
    // #2837 the release chirp: a falling answer to the join's rising one —
    // the wingman taking the seat back. #2842: the fall now gets a rising
    // reply — call-and-response, so a handover reads as a handoff, not a loss.
    p2gone: () => { audioController.playSweep(880, 330, 0.14, 'square', 0.045); setTimeout(() => audioController.playSweep(440, 880, 0.12, 'square', 0.04), 150) },
    // #2842 the two-second drop-out warning: soft, well under the gunfire.
    seatWarn: () => audioController.playTone(760, 0.035, 'square', 0.028),
    // #3000 the radio answers: the ack is a clipped two-note honor (up, then
    // the order held); the refuse is one low, dry knock — heard-but-nothing-
    // to-obey, never an error shriek (the mic is doing its best over gunfire).
    callAck: () => { audioController.playSweep(620, 930, 0.06, 'square', 0.05); setTimeout(() => audioController.playTone(930, 0.08, 'square', 0.045), 70) },
    // #3019 the octave above the knee: phone speakers roll off hard below
    // ~250 Hz (small drivers cannot move the air), so #3016's gain raise on
    // the 180 Hz fundamental stayed inaudible under machine-gun fire on the
    // device most people play on. A 330 Hz triangle rides at slightly lower
    // gain — one dry knock still, semantics untouched, but its harmonic now
    // survives where the fundamental physically cannot.
    callNo: () => { audioController.playTone(180, 0.07, 'triangle', 0.08); audioController.playTone(330, 0.05, 'triangle', 0.055) },
    // #2842 the arriving seat's boots on the sand — a dry thud under the dust.
    land: () => audioController.playNoise(0.07, 0.025),
    // #3038 the duck: going low is a soft fabric dip (down two notes), standing
    // back up the mirror answer — quiet under the gunfire, but the ear keeps
    // score of the profile the way the eye does.
    duck: (post = 1) => post > 0
        ? audioController.playSweep(340 - 40 * post, 190 - 30 * post, 0.05, 'triangle', 0.035)
        : audioController.playSweep(220, 400, 0.05, 'triangle', 0.03),
    // #3037 the code landing: a rising five-note salute — short, gold, and
    // unmistakable. It rides the completing keypress itself, so the audio
    // context is already unlocked by that first press (autoplay law holds).
    konami: () => {
        [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audioController.playTone(f, i === 4 ? 0.22 : 0.08, 'square', 0.06), i * 70))
    },
    // #3041 the extend landing: three rising notes capped long — the cabinet's
    // 1UP call. Shorter than the Konami salute (it fires mid-run, under fire)
    // and unmistakably a reward: it rides the score tick, never rng.
    extra: () => {
        [659, 831, 1046].forEach((f, i) => setTimeout(() => audioController.playTone(f, i === 2 ? 0.24 : 0.07, 'square', 0.06), i * 60))
    },
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

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false; audioController.setMusicLevel(1) }, [])

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
        // #3042 CONTINUE state — shell-side like IronRing's credits (#1103):
        // contLeft is this game's purse, overT is the over screen's WORLD-tick
        // clock, armedRun carries the #3037 prize into continues (NES law:
        // "the cheat remains in effect when the player … uses a continue").
        let contLeft = CONTINUES_MAX
        let armedRun = false
        let overT = 0
        // #3045: the ceremony is observable — the shell counts the beats it
        // fires so the live leg can prove the coin clacked and the heat rose.
        const contBeats = { coin: 0, tick: 0, hot: 0 }
        // #3047 THE STAGE BED — the cabinet drives its march under the run.
        // bedNow is the bed the speakers are on; null is the game's honest
        // silence: attract (the #3018 silent-safe law), the over screen (the
        // coin and the digit beeps own it), the clear fanfare, the pad of the
        // loop interstitial. bedK is the heat the bed was voiced at, so even a
        // mid-run tempo retarget (DEV setup) re-voices. Presentation outside
        // the referee (the #3035 rollT law): zero gs.r, no hash surface —
        // every seed pin, twin law, autopilot sweep and PLAICRAFT byte stands.
        let bedNow = null
        let bedK = 1
        const setBed = (name) => {
            bedNow = name
            bedK = gs.lk
            audioController.startMusic(name)
            audioController.setMusicLevel(1)
            // the #2902 loopVoice precedent for the ears: hotter loop, faster
            // march — the tempo lifts with lk, the melody and grid do not move
            audioController.setMusicStep(MUSIC[name].step / bedK)
        }
        const stopBed = () => { bedNow = null; audioController.stopMusic() }
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
        // #3018 the attract teaches the radio: one scripted demo shout lands
        // ~10 s into the jungle — the wingman obeys (the sim's own order law),
        // the echo banner lands in the same band as the play echo (146..160),
        // five seconds, no sound (attract is silent-safe re autoplay). The
        // LOOP banner slams at 80..144 on the taught pass; the latch is held
        // through that pass, so the two never stack.
        const DEMO_CALL_FX = 300   // ~5 s — the teach arc
        let demoCallFx = null
        let demoShout = false
        // #3000 voice radio (#1711 S5): the shout channel. voiceCtl holds the
        // recognition handle + the refcounted LISTEN badge; callFx is the
        // banner echo (presentation only — decays on world ticks, never sim
        // truth). The orders themselves are sim state (gs.orderAim/Form).
        let callFx = null
        const CALL_FX = 110
        // #3037 THE KONAMI CODE — attract-screen typing, shell-side only:
        // kProg is fed through the pure sim detector (konamiFeed), the demo
        // sim never notices, and the prize enters the world at startPlay.
        // The completion press doubles as the start press — in this arcade the
        // any-key law IS the start button, so the last `A` takes the seat hot.
        let kProg = 0
        let kFx = null
        const K_FX = 150
        // #3041 the extend salute — rides the `extra` event the sim banks when
        // score crosses the mark. Presentation only: gold plate + heads-row flash.
        let extFx = null
        const EXT_FX = 150
        const K_GLYPH = { up: '↑', down: '↓', left: '←', right: '→', b: 'B', a: 'A' }
        const konamiToken = (code) => (
            code === 'ArrowUp' ? 'up'
                : code === 'ArrowDown' ? 'down'
                    : code === 'ArrowLeft' ? 'left'
                        : code === 'ArrowRight' ? 'right'
                            // NES seats: B is B's letter, A is the jump key. The
                            // letter keys A/B type the code on a keyboard (KeyA
                            // is only ever P2's left DURING play — at attract it
                            // is just the last note of the code), and the pad's
                            // B button dispatches KeyB while A dispatches Space.
                            : code === 'KeyB' ? 'b'
                                : (code === 'Space' || code === 'KeyZ' || code === 'KeyA') ? 'a' : null)
        // Feed one attract press to the detector:
        // 'held'  — typing the code: swallow this press, stay at attract
        // 'armed' — the press COMPLETED the sequence: start hot (30 lives)
        // 'start' — not typing: the any-key law takes the seat as always
        const attractPress = (code, repeat) => {
            const tok = repeat ? null : konamiToken(code)
            if (tok) {
                const np = konamiFeed(kProg, tok)
                if (konamiArmed(np)) { kProg = 0; kFx = { t: 0 }; sfx.konami(); return 'armed' }
                if (np > 0 || kProg > 0) { kProg = np; return 'held' }
            }
            kProg = 0
            return 'start'
        }
        const voiceCtl = { on: false, listen: null, badge: null }
        // #3003 the first-run radio teach card: one-time, localStorage-gated,
        // shown at the first RADIO LIVE grant. The card IS the one message at
        // that moment (the shout echo yields to it), then the banner takes the
        // word back for real shouts.
        let hintFx = null
        const HINT_FX = 400
        const HINT_KEY = 'contra:voice-hints'
        const hintSeen = () => { try { return !!localStorage.getItem(HINT_KEY) } catch { return true } }
        const armHint = () => {
            if (hintFx || hintSeen()) return false
            try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: still show */ }
            hintFx = { t: HINT_FX }
            return true
        }

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
                else if (e.type === 'duck') sfx.duck(e.post)   // #3038 the profile the body took
                else if (sfx[e.type]) sfx[e.type]()
                if (e.type === 'p2join') heli = { x: gs.p2.x, t: 0 } // #2842 the bird comes with the drop
                if (e.type === 'extra') extFx = { t: 0 }   // #3041 the bank owed a life — gold it
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

        const startPlay = (lives = 3, score = 0) => {
            // #3037: the Konami prize enters the world here and nowhere else —
            // consumed at the rebuild, so attract typing can never leak forward.
            // #3042: the CONTINUE carry enters the same way — score rides the
            // rebuild, default 0 keeps every pre-continue start byte-identical.
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0, 1, lives, score)
            part.length = 0
            fire.length = 0
            wasGround = true
            heli = null; warnArmed = false; lastEnterT = 0
            demoHold = 0
            loopFx = null; demoLoop = 0   // #2902: a fresh run starts at loop 1 — no banner owed
            extFx = null                  // #3041: a fresh run owes no extend salute
            // #1712: a new take starts quiet — no phantom claims carried on keys
            // still held from the last run; the banked pad matches the fresh sim.
            keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
            jumpQ2 = fireQ2 = false
            seat2.length = 0
            callFx = null   // #3000: fresh stage, fresh orders — the echo starts quiet too
            kProg = 0       // #3037: the typing was consumed by this start
            setMode('play'); screen = 'play'
            setBed('contra')   // #3047: the seat is taken — the march starts with it (attract stays silent by the #3018 autoplay law; the press that starts the run has already unlocked the audio)
        }

        // #1711 S2 consent, arcade-shaped: Contra's entry law is *any key takes
        // the seat* (#2837, checked with real keys) — so play never waits on the
        // paperwork. Consent gates RECORDING, never the game (autoRecord doctrine:
        // declined → plays exactly the same): the question goes up at the human's
        // first press, and beginRun() only ever ships bytes the stored grant
        // covers — a mid-take grant records from that tick, never before it.
        const humanStart = (lives = 3, score = 0, fresh = true) => {
            // #3042: a seat taken fresh at attract buys the purse whole again
            // (three continues); a paid continue (fresh = false) spends from it.
            // The armed flag rides the prize, not the typing — typing stays an
            // attract-only law (#3037 trap); the carry is a memory of the game.
            if (fresh) contLeft = CONTINUES_MAX
            armedRun = lives >= KONAMI_LIVES
            startPlay(lives, score)
            askConsent()
                .then((c) => {
                    if (c && c.motion) beginRun()
                    // #3000: the voice grant arms the shout channel too — the
                    // mic was already consented, so recognition rides from the
                    // first tick. No grant, no listen; the game plays the same.
                    if (c && c.voice && armVoice() && !hintFx) callFx = { t: CALL_FX, ok: true, text: 'RADIO LIVE — SHOUT ORDERS' }
                })
                .catch(() => {})
        }

        // #3042 THE PAID CONTINUE: the hero rejoins at stage 1, loop 1 with the
        // score he earned, the pool restored (an armed run returns at 30 — the
        // NES law documented for continues), and one continue spent. The wingman
        // is back on his post — a friend takes the blue seat again under the
        // #2837 claim law. Both prizes enter at makeGame; score and lives ride
        // stateHash, so a replay sees the carry and cannot lie about it.
        const continueRun = () => {
            if (contLeft <= 0) return
            contLeft -= 1
            sfx.contIn()
            humanStart(armedRun ? KONAMI_LIVES : 3, gs.score, false)
        }

        // ---- VOICE ORDERS (#3000, #1711 S5 voice lineage) ----
        // A shout is a call on the seat: the consent-gated mic path feeds the
        // SAME pure seam the harness drives (voicecalls.parseCall -> sim's
        // applyCall), so the mouth can only say what the grammar means and the
        // honest brain can keep. Words bank as intents (voiceCmd #1249, seat 1
        // — the seat they steer), never as fake pads (#2058: seat rows stay
        // human-only). The mic never stays hot past GAME OVER.
        const phraseHeard = (raw) => {
            const text = String(raw || '').trim()
            if (!text || screen !== 'play' || gs.end) return
            const intent = parseCall(text)
            const res = applyCall(gs, intent)
            const obeyed = !!(intent && res.ok)
            if (obeyed) sfx.callAck(); else sfx.callNo()
            callFx = { t: CALL_FX, ok: obeyed, text: intent ? intentLabel(intent) : 'NO CALL' }
            recordVoiceCmd({
                said: text.slice(0, 80),
                intent: intentKey(intent),
                ok: obeyed,
                ...(obeyed && intent.dir ? { dir: intent.dir } : {}),
                ...(!obeyed ? { why: res.why || 'NO CALL' } : {}),
                seat: 1, // the wingman's seat — the words steer him, not the thumb
            })
        }
        const disarmVoice = () => {
            if (voiceCtl.listen) voiceCtl.listen.stop()
            if (voiceCtl.badge) voiceCtl.badge()
            voiceCtl.listen = null; voiceCtl.badge = null
            voiceCtl.on = false
        }
        const armVoice = () => {
            if (voiceCtl.on || !speechSupported()) return false
            voiceCtl.badge = acquireListenBadge() // LISTEN ≠ REC (#1427): recognition, not recording
            voiceCtl.listen = startSpeechListen({
                onPhrase: phraseHeard,
                onError: (code) => {
                    if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
                        disarmVoice() // permission died mid-run — say it, don't go quiet
                        if (screen === 'play') { callFx = { t: CALL_FX, ok: false, text: 'NO MIC, NO RADIO' }; sfx.callNo() }
                    }
                },
            })
            voiceCtl.on = true
            // #3003: the first grant shows the one-time teach card instead of
            // the one-line echo — the card carries the message.
            if (armHint()) callFx = null
            return true
        }
        const voiceToggle = async () => {
            if (screen !== 'play') return
            if (voiceCtl.on) { disarmVoice(); callFx = { t: CALL_FX, ok: false, text: 'RADIO OFF' }; sfx.callNo(); return }
            if (!speechSupported()) { callFx = { t: CALL_FX, ok: false, text: 'NO RADIO HERE' }; sfx.callNo(); return }
            // #2985 one ask per person per device: the auto layer's live voice
            // session IS the stored grant — reuse it before the #1247 prompt.
            const consent = hasAutoVoice() ? { consent: true } : await askVoiceConsent({ fresh: true })
            if (screen !== 'play') return // moved on while the prompt was up
            if (!consent.consent) { callFx = { t: CALL_FX, ok: false, text: 'NO MIC, NO RADIO' }; sfx.callNo(); return }
            if (armVoice()) { if (!hintFx) callFx = { t: CALL_FX, ok: true, text: 'RADIO ON' }; sfx.callAck() }
            else { callFx = { t: CALL_FX, ok: false, text: 'NO RADIO HERE' }; sfx.callNo() }
        }

        const endTo = (what) => {
            screen = what
            setMode(what)
            stopBed()   // #3047: the march belongs to the run, not the screen it ends on — attract is silent-safe (#3018), the over screen is the coin's, the clear fanfare plays alone
            kProg = 0 // #3037: typing does not survive leaving the attract screen
            if (what === 'attract') kFx = null
            extFx = null   // #3041: a salute never survives the screen it was paid on
            if (what === 'over') {
                overAt = performance.now()
                overT = 0   // #3042: the CONTINUE clock starts with the sting
                contBeats.coin = contBeats.tick = contBeats.hot = 0   // #3045 fresh ceremony per death
                if (gs.score > hiscore) { hiscore = gs.score; localStorage.setItem('contra:hiscore', String(hiscore)) }
                endRun() // #1711: the take ends with the run (no-op when idle/declined) — and NOT on 'clear': #2958 law, one take spans the arcade loops
                disarmVoice() // #3000: the mic never stays hot on GAME OVER (#1249 law, Gauntlet precedent)
                callFx = null
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
            setBed('contra')   // #3047: the hot stage opens with the march lifted a notch by lk (loop-lifted, the loopVoice family)
        }

        // #2902: attract lifecycle. Reset = a fresh loop-1 demo seed; the loop
        // pass = the SAME run the demo just won, rebuilt at loop 2 with the
        // banner — teaching the mechanic before a player ever clears the gate.
        const attractReset = () => {
            demoLoop = 0; demoHold = 0
            gs = makeGame((gs.seed + 7) >>> 0)
            part.length = 0; fire.length = 0
            wasGround = true; heli = null
            // #3018: a fresh loop-1 demo re-arms the radio teach
            demoShout = false; demoCallFx = null
        }
        const attractLoop = () => {
            gs = arcadeLoop(gs) // #1712: the demo learns the same loop law the takes replay
            part.length = 0; fire.length = 0
            wasGround = true; heli = null; demoHold = 0
            demoLoop = 1; demoUntil = 900            // ~15 s of the hot stage, then attract again
            loopFx = { t: 0, n: gs.loop, k: gs.lk }
            sfx.loopUp(gs.loop)
            // #3018: the taught pass is the LOOP teach — the radio teach must
            // not stack on the banner, so the latch holds and the demo echo dies
            demoShout = true; demoCallFx = null
        }

        const toBank = (p) => ({
            left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, a: !!p.a, b: !!p.b,
        })

        const stepSim = (pad) => {
            const p2 = simPad2()
            step(gs, pad, p2)
            drain()
            if (callFx && --callFx.t <= 0) callFx = null // #3000 banner decay on WORLD ticks
            if (hintFx && --hintFx.t <= 0) hintFx = null // #3003 teach-card decay on WORLD ticks
            // #1712 S2: bank exactly what THIS tick consumed (attract demo ticks
            // never enter a take). The P2 drop-in needs no side channel: the
            // keyboard press that called dropIn IS the first pad-1 content the
            // bank carries, so the Node adapter re-applies the flip at the same
            // tick derivably from the stream (vs DD's rules.seat2At latch).
            if (screen === 'play' && isRecording() && !contractHoldsLoop()) recordLiveTick([toBank(pad), toBank(p2)])
            // #3047: the bed follows the stage, not the clock — jungle and the
            // waterfall share the march (the cabinet's section break is a camera
            // turn, not a song change), the fortress gets the variation-up, and
            // a heat retarget re-voices even mid-phase (loop k / DEV setup).
            if (screen === 'play') {
                const want = gs.phase === 'boss' ? 'contraGate' : 'contra'
                if (want !== bedNow || gs.lk !== bedK) setBed(want)
            }
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
                // #3003 the HOLD post — a subtle gold tick on the ground marks
                // the spot the wingman stands at (the post is the order; the
                // soldier standing on it is the result). Jungle only: the
                // torrent out-ranks the shout in the falls (sim law).
                if (gs.orderForm === 'hold' && gs.holdX > 0 && !gs.end) {
                    const hx = Math.round(gs.holdX)
                    if (hx > gs.cam - 8 && hx < gs.cam + 392) {
                        ctx.fillStyle = '#ffd23c'
                        ctx.fillRect(hx, 188, 1, 6)
                        ctx.fillRect(hx - 2, 186, 5, 2)
                    }
                }
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
            // #3000 the shouted sky shows on the airframe: a gold notch blinks
            // above the wingman while an AIM UP order holds his barrel high.
            if (gs.orderAim === 'up' && gs.p2.dead === 0 && !gs.p2.out && gs.tick % 30 < 20) {
                ctx.fillStyle = '#ffd23c'
                const mx = Math.round(gs.p2.x), my = Math.round(gs.p2.y) - 31
                ctx.fillRect(mx - 2, my + 1, 1, 1); ctx.fillRect(mx, my, 1, 1); ctx.fillRect(mx + 2, my + 1, 1, 1)
            }
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
            drawHud(ctx, gs, hiscore, loopFx || extFx, isRecording())   // #3041: the extend flashes the heads row too
            // #2902 the LOOP banner rides above the world, under nothing.
            if (loopFx) drawLoopBanner(ctx, loopFx.n, loopFx.t, loopFx.k)
            // #3000 the radio echo — one line at a time (ART.md bar 6), below
            // the HUD strip, over the fight: what the mic heard, or that the
            // words were nothing the wingman could obey.
            // #3003 the first-run teach card — the one message at the first
            // RADIO LIVE. Carried by the card, not the banner (ART bar 6).
            if (screen === 'play' && hintFx) {
                const fade = hintFx.t > HINT_FX - 12 ? (HINT_FX - hintFx.t) / 12 : Math.min(1, hintFx.t / 10)
                ctx.save()
                ctx.globalAlpha = Math.max(0, Math.min(1, fade))
                ctx.textBaseline = 'top'
                const lines = ['RADIO LIVE — SHOUT ORDERS', 'AIM UP · AIM DOWN · AIM LEVEL', 'FOLLOW · HOLD · SPREAD']
                ctx.font = 'bold 9px "Courier New", monospace'
                const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18
                const x = 192 - w / 2
                ctx.fillStyle = 'rgba(6,10,4,0.88)'
                ctx.fillRect(x, 146, w, 42)
                ctx.strokeStyle = '#ffd23c'
                ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, 146.5, w - 1, 41)
                ctx.fillStyle = '#ffd23c'
                ctx.fillText(lines[0], 192 - ctx.measureText(lines[0]).width / 2, 151)
                ctx.font = 'bold 8px "Courier New", monospace'
                ctx.fillStyle = '#cdeea8'
                ctx.fillText(lines[1], 192 - ctx.measureText(lines[1]).width / 2, 166)
                ctx.fillText(lines[2], 192 - ctx.measureText(lines[2]).width / 2, 179)
                ctx.restore()
            }
            const paintCallBanner = (fx, fxMax) => {
                const fade = fx.t > fxMax - 12 ? (fxMax - fx.t) / 12 : Math.min(1, fx.t / 10)
                ctx.save()
                ctx.globalAlpha = Math.max(0, Math.min(1, fade))
                ctx.textBaseline = 'top'
                ctx.font = 'bold 9px "Courier New", monospace'
                const bw = ctx.measureText(fx.text).width + 14
                ctx.fillStyle = 'rgba(6,10,4,0.80)'
                ctx.fillRect(192 - bw / 2, 146, bw, 14)
                ctx.strokeStyle = fx.ok ? '#ffd23c' : '#7d8f6a'
                ctx.strokeRect(192 - bw / 2 + 0.5, 146.5, bw - 1, 13)
                ctx.fillStyle = fx.ok ? '#ffd23c' : '#9aa88a'
                ctx.fillText(fx.text, 192 - bw / 2 + 7, 149)
                ctx.restore()
            }
            if (screen === 'play' && callFx && !hintFx) paintCallBanner(callFx, CALL_FX)
            // #3037: the salute for a hot start — gold on a dark plate, riding
            // a band its own (above the LOOP banner at 80..144 and the radio
            // echo at 146..160, below the HUD), fading on world ticks.
            if (screen === 'play' && kFx && !loopFx) {
                const fade = Math.max(0, Math.min(1, (K_FX - kFx.t) / 30))
                ctx.save()
                ctx.globalAlpha = fade
                ctx.font = 'bold 14px "Courier New", monospace'
                const ktxt = 'THIRTY UP!'
                const kw = ctx.measureText(ktxt).width + 16
                ctx.fillStyle = 'rgba(6,10,4,0.85)'
                ctx.fillRect(192 - kw / 2, 58, kw, 18)
                ctx.strokeStyle = '#ffd23c'
                ctx.lineWidth = 1
                ctx.strokeRect(192 - kw / 2 + 0.5, 58.5, kw - 1, 17)
                ctx.textBaseline = 'top'
                ctx.fillStyle = '#ffd23c'
                ctx.fillText(ktxt, 192 - kw / 2 + 8, 61)
                ctx.restore()
            }
            // #3018 the demo banner rides the same 146..160 band — the LOOP
            // banner (80..144) never stacks on it (latched through that pass).
            if (screen === 'attract' && demoCallFx && !loopFx && !demoLoop) paintCallBanner(demoCallFx, DEMO_CALL_FX)

            // #3041 the extend salute: the band the Konami salute rides, given
            // to the mid-run 1UP (the two can't coexist — the code lands at
            // attract, the extend lands in play; still guarded for honesty).
            if (screen === 'play' && extFx && !loopFx && !kFx) {
                const fade = Math.max(0, Math.min(1, (EXT_FX - extFx.t) / 30))
                ctx.save()
                ctx.globalAlpha = fade
                ctx.font = 'bold 14px "Courier New", monospace'
                const etxt = 'EXTRA LIFE!'
                const ew = ctx.measureText(etxt).width + 16
                ctx.fillStyle = 'rgba(6,10,4,0.85)'
                ctx.fillRect(192 - ew / 2, 58, ew, 18)
                ctx.strokeStyle = '#ffd23c'
                ctx.lineWidth = 1
                ctx.strokeRect(192 - ew / 2 + 0.5, 58.5, ew - 1, 17)
                ctx.textBaseline = 'top'
                ctx.fillStyle = '#ffd23c'
                ctx.fillText(etxt, 192 - ew / 2 + 8, 61)
                ctx.restore()
            }

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
                // #3037: the typing reads — every note landed so far glints gold
                if (kProg > 0) {
                    ctx.font = 'bold 12px "Courier New", monospace'
                    ctx.fillStyle = '#ffd23c'
                    const got = KONAMI.slice(0, kProg).map((k) => K_GLYPH[k]).join(' ')
                    ctx.fillText(got, 192 - ctx.measureText(got).width / 2, 96)
                }
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
                // #3042 THE COUNT: GAME OVER reads, then CONTINUE? holds the
                // window with the Konami digit 9…0 and the purse. The last two
                // seconds blink red-hot (IronRing #1103's warning family). With
                // the purse empty there is no count — only the book closes.
                if (contLeft > 0) {
                    const cw = contPhase(overT)
                    if (cw.phase === 'count') {
                        // #3045 the cabinet's full-screen call: CONTINUE? big and
                        // flashing, the digit gold beside it, the purse as the
                        // machine's own CREDIT row — small white digits, low,
                        // right-aligned. Heat: inside the last three digits the
                        // word snaps red twice as fast, matching contBeat.
                        const hot = cw.digit <= 2
                        const flip = Math.floor(overT / (cw.digit <= 3 ? 4 : 8)) % 2 === 0
                        ctx.font = 'bold 24px "Courier New", monospace'
                        ctx.fillStyle = hot ? (flip ? '#ff6a4d' : '#8a2318') : (flip ? '#ffd23c' : '#ffffff')
                        ctx.fillText('CONTINUE?', 106, 148)
                        ctx.fillStyle = '#ffd23c'
                        ctx.fillText(`${cw.digit}`, 256, 148)
                    }
                    ctx.fillStyle = '#cdeea8'
                    ctx.font = '9px "Courier New", monospace'
                    ctx.fillText(`ANY KEY · TAP — ${contLeft} CONTINUE${contLeft > 1 ? 'S' : ''} LEFT`, 102, 167)
                    ctx.fillStyle = '#ffffff'
                    ctx.font = 'bold 8px "Courier New", monospace'
                    const cr = `CREDIT ${contLeft}`
                    ctx.fillText(cr, 384 - ctx.measureText(cr).width - 6, 214)
                } else {
                    ctx.fillStyle = '#7d8f63'
                    ctx.font = 'bold 9px "Courier New", monospace'
                    ctx.fillText('NO CONTINUES', 150, 146)
                }
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
                            // #3037: the armed-run salute fades on world ticks
                            if (kFx) { kFx.t += 1; if (kFx.t >= K_FX) kFx = null }
                            // #3041: the extend salute fades on world ticks too
                            if (extFx) { extFx.t += 1; if (extFx.t >= EXT_FX) extFx = null }
                        } else if (screen === 'attract') {
                            // #2902: the cabinet teaches its own loop — the demo
                            // now survives its endings (it used to stick on the
                            // last frame forever), runs one pass at LOOP 2 with
                            // the banner slamming over the jungle, then hands the
                            // attract copy back.
                            if (loopFx) { loopFx.t += 1; if (loopFx.t >= LOOP_FX) loopFx = null }
                            else if (!gs.end) {
                                stepSim(autopilot(gs))
                                // #3018: one scripted demo shout, ~10 s in —
                                // the wingman obeys, the banner reads, then
                                // the teach completes and the demo returns to
                                // natural. No sound: attract is silent-safe.
                                if (!demoShout && gs.tick >= 600) {
                                    demoShout = true
                                    applyCall(gs, { kind: 'aim', dir: 'up' })
                                    demoCallFx = { t: DEMO_CALL_FX, text: 'AIM UP', ok: true }
                                }
                                if (demoCallFx && --demoCallFx.t <= 0) {
                                    demoCallFx = null
                                    gs.orderAim = 'level'; gs.orderForm = 'follow'
                                }
                                if (demoLoop && gs.tick >= demoUntil) attractReset()
                            } else if (demoHold > 0) {
                                // #3018: the banner keeps decaying through the
                                // end-of-demo hold (the world is held, the echo
                                // is presentation — it must not freeze frozen)
                                if (demoCallFx && --demoCallFx.t <= 0) demoCallFx = null
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
                            // #3042: the CONTINUE countdown runs on WORLD ticks.
                            // GAME OVER reads (CONT_READ), then the digit counts
                            // 9…0, one a second; when the window closes the
                            // machine returns to the title — continues left in
                            // the purse are forfeit, as on the cabinet.
                            if (contLeft > 0) {
                                overT += 1
                                const cw = contPhase(overT)
                                // #3045: coin-clack, digit tick, heat beeps — one
                                // pure beat law (contBeat) mapped onto sfx, all on
                                // world ticks like the window itself.
                                const beat = contBeat(overT)
                                if (beat === 'coin') { contBeats.coin += 1; sfx.coin() }
                                else if (beat === 'tick') { contBeats.tick += 1; sfx.contTick() }
                                else if (beat === 'hot') { contBeats.hot += 1; sfx.contHot() }
                                if (cw.phase === 'out') endTo('attract')
                            }
                        }
                        acc -= SIM_MS
                    }
                }
            }
            paint()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); audioController.setMusicLevel(pausedRef.current ? 0.15 : 1); return }   // #3047: the march steps back while the help reads
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            if (e.code === 'KeyV') { e.preventDefault(); voiceToggle(); return } // #3000 the crew radio
            if (screen === 'attract') {
                // #3037: the seat law holds — the run starts on this press. If
                // the press was the code's last note, it starts HOT (30); if it
                // is mid-code, it is swallowed like the arcade title swallows
                // arrows; otherwise it starts as it always did.
                const kr = attractPress(e.code, e.repeat)
                if (kr === 'held') return
                humanStart(kr === 'armed' ? KONAMI_LIVES : 3)
                return
            }
            if (screen === 'over') {
                // #3042: the any-key law answers the count — during the window
                // a press pays a continue and rejoins; after the digits, or with
                // the purse empty, the press returns to the title as it always did.
                if (performance.now() - overAt > 900) {
                    if (contLeft > 0 && contPhase(overT).phase !== 'out') continueRun()
                    else endTo('attract')
                }
                return
            }
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
        const onPointer = (e) => {
            if (screen === 'attract') {
                // #3037: a pad tap already spoke through its keydown (the code
                // is typed with the pad it has — arrows + B + A). Swallow the
                // pad's pointer so a mid-code tap does not double-start; a tap
                // anywhere else keeps the any-tap law verbatim.
                if (e.target && e.target.closest && e.target.closest('[data-vc]')) return
                humanStart(); return
            }
            if (screen === 'over') {
                // #3042: a tap answers the count exactly like a key (the pad is
                // stowed on this screen — Jon's one-pad law leaves the tap free).
                if (performance.now() - overAt > 900) {
                    if (contLeft > 0 && contPhase(overT).phase !== 'out') continueRun()
                    else endTo('attract')
                }
            }
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
            // #3000: one device mic covers the thumb seat, honest — seat 1 is
            // the wingman (CPU by law); a "voice" claimed for him would be a
            // wallhack, so the auto layer banks slot 0 only (Gauntlet's [0]).
            voice: { slots: [0] },
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => [{ kind: 'model' }, { kind: gs.p2.human ? 'human' : 'cpu' }],
            rules: () => (seat2.length ? { seat2: seat2.join(',') } : {}),
            reset: (seed) => {
                gs = makeGame(seed >>> 0)
                part.length = 0
                fire.length = 0
                loopFx = null; demoLoop = 0   // #2902: no banner owed on a harness reset
                extFx = null                  // #3041: nor an extend salute
                keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false
                keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
                jumpQ = fireQ = jumpQ2 = fireQ2 = false
                wasGround = true; heli = null; warnArmed = false; lastEnterT = 0
                seat2.length = 0
                callFx = null
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
                orderForm: gs.orderForm, orderAim: gs.orderAim,   // #3000 the shouted orders are contract-visible
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
                // #3047: the bed is observable — track, live step, held level,
                // and the shell's own bed memory (null = the honest silence).
                music: () => ({ ...audioController._musicState(), bed: bedNow, bedK: +bedK.toFixed(3) }),
                probe: () => ({
                    screen, tick: gs.tick, x: +gs.p.x.toFixed(2), y: +gs.p.y.toFixed(2), onGround: gs.p.onGround,
                    lives: gs.lives, score: gs.score, nextExt: gs.nextExt, weapon: gs.p.weapon, end: gs.end, cam: Math.round(gs.cam),   // #3041 the extend mark is observable
                    loop: gs.loop, lk: +gs.lk.toFixed(3), seed: gs.seed,   // #2894 the arcade loop is observable
                    loopFx: loopFx ? { t: loopFx.t, n: loopFx.n, k: +loopFx.k.toFixed(3) } : null,   // #2902 the banner is observable
                    extFx: extFx ? { t: extFx.t } : null,   // #3041 the extend salute is observable
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
                    call: { form: gs.orderForm, aim: gs.orderAim, holdX: +gs.holdX.toFixed(1), banner: callFx ? { t: callFx.t, text: callFx.text, ok: callFx.ok } : null, armed: voiceCtl.on, hint: hintFx ? { t: hintFx.t } : null, demo: demoCallFx ? { t: demoCallFx.t, text: demoCallFx.text } : null, demoShout },   // #3000 the shout channel is observable; #3018 the demo shout rides the same probe
                    keys: { ...keys },
                    keys2: { ...keys2 },
                    roll: gs.p.rollT, roll2: gs.p2.rollT,   // #3035 the somersault clock is observable
                    posture: gs.p.posture, posture2: gs.p2.posture,   // #3038 the ground profile too
                    konami: { prog: kProg, fx: kFx ? { t: kFx.t } : null },   // #3037 the code typing is observable
                    cont: { left: contLeft, t: overT, armed: armedRun, phase: contPhase(overT).phase, digit: contPhase(overT).digit, beats: { ...contBeats } },   // #3042 the purse and the count are observable; #3045 so is the ceremony
                    msg: MESSAGES[Math.floor(gs.tick / 150) % MESSAGES.length],
                    touch: TOUCH,   // #2971: the touch-aware copy is observable
                    tumble: gs.p.dead > 0 ? Math.floor((CFG.respawnFreeze - gs.p.dead) / 12) % 4 : -1,
                }),
                start: startPlay,
                // #3000 the shout path, driveable with no mic: `say` lands a
                // phrase exactly where recognition would land it (grammar ->
                // applyCall -> voiceCmd bank). `voiceArmed` answers the badge.
                say: (text) => { phraseHeard(text); return gs.orderAim + '/' + gs.orderForm },
                voiceArmed: () => voiceCtl.on,
                // #3003 the first-run teach card, drivable with no mic: same
                // honest gate as the real path (first grant, localStorage).
                hintNow: () => armHint(),
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
                    if (opts.score !== undefined) gs.score = opts.score   // #3041 stand the run just under the extend mark
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
                    if (opts.noContinue) contLeft = 0   // #3042: purse empty — the leg drives the title law at zero
                    if (opts.score !== undefined) gs.score = opts.score   // #3042: stage the bank, watch it carried through a paid continue
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
                    `screen ${screen}  paused ${pausedRef.current}  continues ${contLeft}  overT ${overT}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.lives += 1; return 'extra life' } },
                    { label: 'ARM EXTEND', run: () => { gs.score = gs.nextExt - 100; return `next kill at ${gs.nextExt} buys the life` } },   // #3041
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
                    { label: 'SHOUT: AIM UP', run: () => { if (screen !== 'play') return 'no run on screen'; phraseHeard('AIM UP'); return gs.orderAim === 'up' ? 'the wingman holds the sky' : 'order did not land' } },
                    { label: 'TO WATERFALL', run: () => { warpFalls(gs); return 'into the canyon' } },
                    { label: 'TO THE GATE', run: () => { warpBoss(gs); return 'before the core' } },
                ],
            })
            exposeGame(recSpec) // #1712: the harness drives the same spec the phone banks
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.end != null, lives: gs.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            audioController.stopMusic()   // #3047: the bed belongs to this mount, not the tab (the #2336 law)
            endRun() // #1711: an unmount mid-run ends the take (no-op when idle)
            disarmVoice() // #3000: no hot mic past the component, ever
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
            <VirtualControls visible={(mode === 'play' || mode === 'attract') && !paused} secondAction={mode === 'attract' ? { label: 'B', code: 'KeyB' } : { label: 'FIRE', code: 'KeyX' }} />
        </div>
    )
}

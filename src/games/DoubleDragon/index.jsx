// DOUBLE DRAGON — S1 "Walnuts Street" (Technōs arcade 1987, issue #2807).
// Shell plumbing per docs/GAME-SHELL.md: one loop, fixed timestep, attract
// first, '?' ops card, phone pad (JUMP / KICK / PUNCH), DEV + contract hooks.
// All rules live in sim.js; all look in art.js.

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState, recordLiveTick, armLiveCapture } from '../../utils/gameContract'
import { initAutoRecord, askConsent, beginRun, endRun, startBusy, setStartBusy } from '../../utils/autoRecord'
import { slotPad, slotActive, connectedSlots } from '../../utils/onePad'
import { rumble, rumbleSlot } from '../../components/gamepadMap'
import { p2Merge, p2Seat } from './p2pad.js'
import { W, H, makeGame, step, autopilot, stateHash, CFG, PROPS_DEPTH, enterStage2, INTRO, endIntro } from './sim.js'
import { drawBackground, drawBilly, drawJimmy, drawEnemy, drawPickup, drawProp, drawBarrel, drawProjectile, drawMarian, drawIntroMarian, PROPS, PROPS_YARD, drawHud, drawBanner, drawAttract, setLampLight, DRIP_T, drawJoinFx, JOIN_T } from './art.js'

const SIM_MS = 1000 / 60
const HS_KEY = 'double-dragon:hiscore'
// S4 (#2807, Jon's multiplayer rule): the arcade plays DOUBLE — Jimmy Lee
// fights beside Billy by default (CPU seat, so phones and the harness work).
// `?solo=1` declines the partner. A human takes the blue seat drop-in.
const coopOn = () => new URLSearchParams(window.location.search).get('solo') !== '1'
// #2891: the human start gets Technōs' opening movie (attract -> the crime ->
// Walnuts Street). The sim/contract/reset streams default to none; `?nointro=1`
// declines it on the cabinet too.
const introOn = () => new URLSearchParams(window.location.search).get('nointro') !== '1'

export default function DoubleDragon() {
    const wrapRef = useRef(null)
    const pausedRef = useRef(false)
    const [paused, setPaused] = useState(false)
    const [mode, setMode] = useState('attract')

    useEffect(() => {
        const wrap = wrapRef.current
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        canvas.style.imageRendering = 'pixelated'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0, { coop: coopOn() })
        let screen = 'attract'
        let raf = 0
        let last = 0
        let acc = 0
        let demoHold = 0
        let overAt = 0
        let shake = 0
        // #1712 S2: the tick the blue seat went HUMAN (-1 while it is the
        // CPU's). Rides the take's rules so a replay seats Jimmy at the exact
        // tick the drop-in law did — the seed alone cannot know when a friend
        // reached for WASD.
        let seat2At = -1
        // #2863 join juice: ticks left on the seat-drop flare/banner (shell
        // state only — juice never enters gs, so stateHash stays byte-stable).
        let joinFx = 0
        const part = []
        let takenSeen = false   // #2891: the movie's caption fired this run (probe/legs)
        const keys = { l: false, r: false, u: false, d: false, j: false, k: false, p: false }
        let jumpQ = false, kickQ = false, punchQ = false
        // S4 seat 2 keys — WASD walk · F punch · G kick · V jump. Like Contra S4,
        // the first touch of any of them hands the blue dragon to a human.
        const keys2 = { l: false, r: false, u: false, d: false, j: false, k: false, p: false }
        let jumpQ2 = false, kickQ2 = false, punchQ2 = false
        let hiscore = Number(localStorage.getItem(HS_KEY) || 0)

        const sfx = {
            whoosh: () => audioController.playNoise(0.05, 0.08),
            drip: () => audioController.playSweep(1250, 720, 0.05, 'sine', 0.045),
            hit: () => audioController.playTone(220, 0.08, 'square', 0.12),
            hitHard: () => { audioController.playTone(140, 0.14, 'square', 0.16); shake = Math.max(shake, 3) },
            ko: () => { audioController.playSweep(520, 90, 0.28, 'square', 0.14); shake = Math.max(shake, 4) },
            // #2882: the chain blip climbs with the multiplier — ×2 answers a
            // little higher than ×1's KO tail, ×4 rings the loudest of them all
            chain: () => {
                const m = gs.scoreFlash && gs.scoreFlash.m > 1 ? gs.scoreFlash.m : 2
                audioController.playTone(520 * m, 0.09, 'square', 0.12)
                audioController.playTone(780 * m, 0.1, 'square', 0.1, 0.08)
            },
            jump: () => audioController.playSweep(180, 420, 0.16, 'square', 0.10),
            land: () => audioController.playNoise(0.04, 0.05),
            pickup: () => { audioController.playTone(660, 0.07, 'square', 0.1); audioController.playTone(880, 0.07, 'square', 0.1, 0.07); audioController.playTone(1320, 0.1, 'square', 0.1, 0.14) },
            // #2833: the blue seat's voice — every seat-centric sound the sim
            // tags `_b` lands here detuned a few percent, so at an ear Billy
            // stays red and Jimmy stays blue without looking at the screen.
            whoosh_b: () => audioController.playFilteredNoise(0.05, 0.08, 700),
            hit_b: () => audioController.playTone(233, 0.08, 'square', 0.12),
            hit_hard_b: () => { audioController.playTone(156, 0.14, 'square', 0.16); shake = Math.max(shake, 3) },
            jump_b: () => audioController.playSweep(200, 460, 0.16, 'square', 0.10),
            land_b: () => audioController.playNoise(0.05, 0.045),
            pickup_b: () => { audioController.playTone(698, 0.07, 'square', 0.1); audioController.playTone(932, 0.07, 'square', 0.1, 0.07); audioController.playTone(1397, 0.1, 'square', 0.1, 0.14) },
            struggle_b: () => audioController.playNoise(0.03, 0.045),
            escape_b: () => audioController.playSweep(330, 740, 0.12, 'square', 0.12),
            throw_b: () => audioController.playSweep(980, 330, 0.12, 'triangle', 0.10),
            whip_b: () => { audioController.playNoise(0.06, 0.14); audioController.playSweep(1750, 330, 0.08, 'sawtooth', 0.08) },
            knife_hit_b: () => { audioController.playTone(196, 0.12, 'square', 0.16); shake = Math.max(shake, 3) },
            // #2857 cadence readability: the blue seat's bare jab is a SNAP, a
            // step up in pitch from the shared bite — technique vs power at an ear.
            // #2889 item 5 (phone mix): a square at 294 Hz puts its 3rd harmonic
            // at 882 Hz — a 2 Hz beat right under the pickup chime's 880 middle
            // note, and on a phone's thin midrange the bite and the reward smear
            // into one buzz when a player jabs across fresh steel. The bite keeps
            // its F#4 seat identity on a triangle (3rd harmonic −19 dB against
            // the fundamental where the square sat at −9.5), and the noise
            // transient steps up 0.02 -> 0.03 so the snap survives the softer wave.
            jab_b: () => { audioController.playTone(294, 0.05, 'triangle', 0.12); audioController.playNoise(0.03, 0.05) },
            // #2857 post-KO flair snaps — the red seat at the shoulder, the
            // blue one a minor third brighter, detuned like the rest of his voice.
            flair: () => audioController.playTone(880, 0.05, 'triangle', 0.07),
            flair_b: () => audioController.playTone(1175, 0.05, 'triangle', 0.07),
            grabbed: () => audioController.playTone(90, 0.16, 'sawtooth', 0.14),
            struggle: () => audioController.playNoise(0.03, 0.05),
            escape: () => audioController.playSweep(300, 700, 0.12, 'square', 0.12),
            die: () => { audioController.playSweep(400, 60, 0.5, 'sawtooth', 0.18); shake = Math.max(shake, 6) },
            // S4 co-op cues: the blue seat falling, a seat down but the run
            // alive, and the drop-in chime when a human takes the second dragon
            jimmy_die: () => { audioController.playSweep(360, 70, 0.45, 'sawtooth', 0.16); shake = Math.max(shake, 5) },
            seat_down: () => audioController.playSweep(300, 140, 0.22, 'triangle', 0.10),
            p2join: () => { audioController.playSweep(440, 880, 0.12, 'square', 0.05); audioController.playTone(1100, 0.1, 'square', 0.04, 0.1) },
            wave: () => audioController.playSweep(120, 240, 0.3, 'triangle', 0.12),
            chargewind: () => audioController.playFilteredNoise(0.5, 0.06, 240),
            charge: () => { audioController.playSweep(160, 70, 0.24, 'sawtooth', 0.14); shake = Math.max(shake, 2) },
            stomp: () => { audioController.playTone(70, 0.1, 'square', 0.18); shake = Math.max(shake, 3) },
            throw: () => audioController.playSweep(900, 300, 0.12, 'triangle', 0.10),
            whip: () => { audioController.playNoise(0.06, 0.14); audioController.playSweep(1600, 300, 0.08, 'sawtooth', 0.08) },
            knife_hit: () => { audioController.playTone(180, 0.12, 'square', 0.16); shake = Math.max(shake, 3) },
            blade_stick: () => { audioController.playTone(150, 0.05, 'triangle', 0.1); audioController.playTone(1150, 0.04, 'square', 0.04, 0.02) },
            barrel_hit: () => { audioController.playTone(110, 0.06, 'square', 0.12); shake = Math.max(shake, 2) },
            barrel_break: () => { audioController.playNoise(0.18, 0.16); audioController.playTone(70, 0.14, 'square', 0.14, 0.03); shake = Math.max(shake, 5) },
            // #2825: the yard's pine speaks a heavier tongue than the street's
            crate_hit: () => { audioController.playTone(88, 0.09, 'square', 0.15); audioController.playNoise(0.05, 0.07); shake = Math.max(shake, 3) },
            crate_break: () => {
                audioController.playNoise(0.24, 0.18)
                audioController.playTone(62, 0.18, 'square', 0.16, 0.03)
                audioController.playTone(148, 0.05, 'square', 0.08, 0.09)
                shake = Math.max(shake, 5)
            },
            // #2825: the duel's arrival sting — low, deliberate, a name on screen
            duel: () => { audioController.playSweep(220, 55, 0.45, 'sawtooth', 0.14); audioController.playTone(660, 0.1, 'square', 0.08, 0.5) },
            // S3 the hideout cues
            stage: () => { audioController.playSweep(160, 420, 0.3, 'square', 0.12); audioController.playTone(523, 0.12, 'square', 0.1, 0.24) },
            aim: () => {
                // #2825: the cast must be HEARD coming — a rising wind-up whoosh
                // under the blip, so a thumb-on-pad player knows to leave the lane
                audioController.playSweep(420, 1050, 0.28, 'triangle', 0.06)
                audioController.playFilteredNoise(0.3, 0.05, 900)
                audioController.playTone(980, 0.05, 'square', 0.05, 0.22)
            },
            goon_throw: () => {
                audioController.playSweep(1100, 400, 0.1, 'triangle', 0.09)
                // #2825: harder metallic ring on the cast — steel leaving the hand
                audioController.playTone(1560, 0.09, 'square', 0.07, 0.02)
                audioController.playNoise(0.04, 0.06, 0.05)
            },
            // #2948: the fetch pays a short gripper ring — the duel's steel is
            // back in hand and the aim can re-cock; deny it and that ring
            // belongs to the dragon's own pickup chime instead.
            goon_rearm: () => {
                audioController.playTone(1250, 0.06, 'triangle', 0.06)
                audioController.playTone(1860, 0.05, 'square', 0.05, 0.05)
            },
            // #2944: the carrier rotation is HEARD coming too. The whip's loop
            // creaks up (a low leather sweep — deliberately rougher timbre than
            // the cast's steel blip so the two threats tell apart at a glance
            // shut), its snap is a heavier crack than the dragons' own lash,
            // and a swung stick whistles wood where the bare fist whips air.
            goon_lashwind: () => {
                audioController.playSweep(240, 520, 0.22, 'sawtooth', 0.05)
                audioController.playFilteredNoise(0.25, 0.04, 500)
            },
            goon_lash: () => {
                audioController.playNoise(0.07, 0.16)
                audioController.playSweep(1900, 250, 0.07, 'sawtooth', 0.10)
            },
            goon_steel: () => {
                audioController.playSweep(500, 220, 0.08, 'triangle', 0.06)
                audioController.playTone(148, 0.05, 'square', 0.05, 0.02)
            },
            blade_wood: () => { audioController.playTone(120, 0.05, 'square', 0.12); shake = Math.max(shake, 2) },
            blade_hit: () => { audioController.playSweep(300, 60, 0.3, 'sawtooth', 0.16); shake = Math.max(shake, 4) },
            rope: () => audioController.playNoise(0.05, 0.08),
            rescue: () => {
                const notes = [659, 784, 988, 1319, 988, 1319, 1568]
                notes.forEach((f, i) => audioController.playTone(f, 0.13, 'square', 0.12, i * 0.11))
                shake = Math.max(shake, 3)
            },
            // #2891 the opening: Marian's cry over the street, and the sting the
            // gang leaves behind — the crime the whole run answers.
            scream: () => {
                audioController.playSweep(720, 1080, 0.14, 'sine', 0.09)
                audioController.playSweep(1080, 640, 0.2, 'sine', 0.08, 0.15)
            },
            taken: () => {
                audioController.playTone(392, 0.16, 'square', 0.12)
                audioController.playTone(311, 0.16, 'square', 0.12, 0.16)
                audioController.playTone(233, 0.3, 'square', 0.12, 0.32)
                shake = Math.max(shake, 4)
            },
            clear: () => {
                const notes = [523, 659, 784, 1046, 784, 1046]
                notes.forEach((f, i) => audioController.playTone(f, 0.12, 'square', 0.12, i * 0.12))
            },
        }

        // #2863: one join ritual for every way the seat changes hands — chime,
        // the friend's pad buzzing awake, and the flare/banner on Jimmy.
        const seatJoin = () => { sfx.p2join(); rumbleSlot(2, 150, 0.6); joinFx = JOIN_T }

        const sparks = (n, nearBilly, col) => {
            for (let i = 0; i < n; i++) {
                const bx = nearBilly ? gs.billy.x : gs.billy.x + (Math.random() - 0.5) * 30
                const by = (nearBilly ? gs.billy.y : gs.billy.y - 12) + (Math.random() - 0.5) * 8
                part.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.8, t: 12 + Math.floor(Math.random() * 10), c: col })
            }
        }

        const drain = () => {
            for (const ev of gs.events) {
                if (sfx[ev]) sfx[ev]()
                // #2863 rumble parity: the seat that swung feels it. Billy's
                // bites shake pad 1; the blue seat's hits and falls answer on
                // the friend's pad 2 motors — only once a human actually holds
                // the seat (the CPU's fists never buzz the phone's pocket).
                if (ev === 'hit') rumble(90, 0.35)
                else if (ev === 'hit_hard' || ev === 'knife_hit') rumble(160, 0.7)
                else if (ev === 'billy_die') rumble(400, 1)
                else if (gs.jimmy && gs.jimmy.human) {
                    if (ev === 'hit_b') rumbleSlot(2, 90, 0.35)
                    else if (ev === 'hit_hard_b' || ev === 'knife_hit_b') rumbleSlot(2, 160, 0.7)
                    else if (ev === 'jimmy_die') rumbleSlot(2, 400, 1)
                    else if (ev === 'seat_down') rumbleSlot(2, 250, 0.7)
                }
                if (ev === 'taken') takenSeen = true
                if (ev === 'hit') sparks(4, true, 1)
                else if (ev === 'hit_hard' || ev === 'ko') sparks(8, true, 0)
                else if (ev === 'stomp') sparks(6, true, 2)
                else if (ev === 'rescue') sparks(14, true, 1)
                // #2819 item 3: the cabinet showers staves outward when a barrel goes
                else if (ev === 'barrel_break' && gs.fx) {
                    const fx = gs.fx
                    gs.fx = null
                    for (let i = 0; i < 10; i++) {
                        part.push({
                            x: fx.x + (Math.random() - 0.5) * 12,
                            y: fx.y - 10 + (Math.random() - 0.5) * 8,
                            vx: (Math.random() - 0.5) * 3.2, vy: -Math.random() * 2.2 - 0.4,
                            t: 14 + Math.floor(Math.random() * 10), c: 3,
                        })
                    }
                }
                // #2857 grip-break juice: a white flash and a burst of seat-tinted
                // sparks where the freeing blow landed — the break reads on the
                // holder, not only as the blue escape sweep on the freed seat.
                else if ((ev === 'escape' || ev === 'escape_b') && gs.gripFx) {
                    const fx = gs.gripFx
                    gs.gripFx = null
                    part.push({ x: fx.x - 2, y: fx.y - 20, vx: 0, vy: 0, t: 3, c: 4, s: 5 })
                    const col = ev === 'escape_b' ? 5 : 1
                    for (let i = 0; i < 6; i++) {
                        part.push({
                            x: fx.x + (Math.random() - 0.5) * 10,
                            y: fx.y - 14 + (Math.random() - 0.5) * 10,
                            vx: (Math.random() - 0.5) * 2.8, vy: -Math.random() * 1.8 - 0.2,
                            t: 9 + Math.floor(Math.random() * 8), c: col,
                        })
                    }
                }
            }
            gs.events.length = 0
        }

        // #2810 item 4: Walnuts Street after dark breathes — a very quiet,
        // filtered-noise bed (distant crowd + wind) under the fists. Only ever
        // one burst in flight and never louder than a footprint.
        let ambienceAt = 0
        let dripCycle = -1
        const ambience = () => {
            if (pausedRef.current) return
            const t = gs.tick
            if (t - ambienceAt >= 112) {
                ambienceAt = t
                audioController.playFilteredNoise(1.8, 0.022, 320)
            }
            // #2877: the yard's leaking drum keeps time — one soft water blip
            // per fall, only while the drum is on screen, quieter than the bed.
            if (gs.stage === 2) {
                const c = Math.floor(t / DRIP_T)
                if (c !== dripCycle) {
                    dripCycle = c
                    const sx = PROPS_YARD[0].x - gs.camX
                    if (sx > -24 && sx < W + 24) sfx.drip()
                }
            } else dripCycle = -1
        }

        const simPad = () => {
            const pad = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.j || jumpQ, b: keys.k || kickQ, punch: keys.p || punchQ }
            jumpQ = kickQ = punchQ = false
            return pad
        }
        const simPad2 = () => {
            // #2860: the keyboard seat unions with slot 2 — a friend's own pad
            // or linked phone drives Jimmy with no keyboard at all.
            const pad = p2Merge(keys2, slotPad(2, 'dpad'))
            pad.a = pad.a || jumpQ2
            pad.b = pad.b || kickQ2
            pad.punch = pad.punch || punchQ2
            jumpQ2 = kickQ2 = punchQ2 = false
            return pad
        }

        const startPlay = (intro = introOn()) => {
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0, { coop: coopOn(), intro })
            gs.hi = hiscore
            part.length = 0
            demoHold = 0
            takenSeen = false
            seat2At = -1 // a fresh run hands the blue seat back to the CPU
            joinFx = 0
            setMode('play')
            screen = 'play'
        }

        // #1711 S2 consent gate: the question goes up BEFORE the first take's
        // seed-birth; decline still plays (autoRecord honest-degrades — the
        // recorder simply never opens), and beginRun() only ships bytes the
        // stored grant covers.
        const humanStart = () => {
            if (startBusy()) return
            setStartBusy(true)
            askConsent()
                .then(() => { startPlay(); beginRun() })
                .finally(() => setStartBusy(false))
        }

        const endTo = (what) => {
            screen = what
            setMode(what)
            if (what === 'over') {
                overAt = performance.now()
                if (gs.score > hiscore) { hiscore = gs.score; localStorage.setItem(HS_KEY, String(hiscore)) }
                endRun() // #1711: the take ends with the run (no-op when idle/declined)
            }
        }

        const stepSim = (pad) => {
            const p2 = simPad2()
            step(gs, pad, p2)
            drain()
            ambience()
            if (screen === 'play') {
                // #1712 S2: bank exactly what THIS tick consumed (attract demo
                // ticks never enter a take), and latch the drop-in tick for the
                // take's rules — replay seats Jimmy by it.
                recordLiveTick([toBank(pad), toBank(p2)])
                if (gs.jimmy && gs.jimmy.human && seat2At < 0) seat2At = gs.tick
                if (gs.mode === 'gameover' && screen === 'play') endTo('over')
            }
        }

        // #1712 S2 — the live-capture spec (same wiring as SOS/BombDefuse):
        // the shell banks THE PAD PAIR IT CONSUMED each play tick, so replay
        // needs no CPU re-run of Jimmy's personality — the drop-in moment
        // rides rules.seat2At (the sim's human flip is a law the seed cannot
        // know). method dpad: the pads are digital; boost is the punch.
        const toBank = (p) => ({
            left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down,
            a: !!p.a, b: !!p.b, boost: !!p.punch,
        })
        const recSpec = {
            id: 'double-dragon',
            method: 'dpad',
            players: coopOn() ? 2 : 1,
            buttons: ['a', 'b', 'boost'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b', 'boost'],
            sources: () => {
                const out = [{ kind: 'human' }]
                if (coopOn()) out.push(gs.jimmy && gs.jimmy.human ? { kind: 'human' } : { kind: 'cpu' })
                return out
            },
            rules: () => (coopOn() ? { seat2At } : {}),
            reset: (seed, players) => {
                // replay rebuilds the live run exactly — movie first if the
                // cabinet played it (the banked presses carry the same skip beat)
                gs = makeGame(seed >>> 0, { coop: (players | 0) >= 2, intro: introOn() })
                gs.hi = hiscore
                part.length = 0
                demoHold = 0
                takenSeen = false
                seat2At = -1
                keys.l = keys.r = keys.u = keys.d = keys.j = keys.k = keys.p = false
                keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.k = keys2.p = false
                jumpQ = kickQ = punchQ = jumpQ2 = kickQ2 = punchQ2 = false
                screen = 'play'
                setMode('play')
            },
            tick: (pad, pads) => {
                if (gs.mode === 'gameover') return
                const p1 = pads && pads[0] ? pads[0] : pad
                const p2 = (pads && pads[1]) || {}
                step(gs,
                    { left: !!p1.left, right: !!p1.right, up: !!p1.up, down: !!p1.down, a: !!p1.a, b: !!p1.b, punch: !!p1.boost },
                    { left: !!p2.left, right: !!p2.right, up: !!p2.up, down: !!p2.down, a: !!p2.a, b: !!p2.b, punch: !!p2.boost })
                drain()
                if (gs.mode === 'gameover' && screen === 'play') endTo('over')
            },
            state: () => ({ tick: gs.tick, score: gs.score, done: gs.mode === 'gameover', seed: gs.seed, hash: stateHash(gs) }),
            canvas: () => canvas,
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.4)
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            // #2877: the lamps are the yard's key light — tell the cast law
            // where the light is this frame (stage 2 only; street lamps are dead).
            setLampLight(gs.tick, gs.camX, gs.stage === 2)
            drawBackground(ctx, gs.camX, gs.tick, gs.stage)
            ctx.save()
            ctx.translate(Math.round(sx), Math.round(sy))
            // one depth-sorted army: nearest feet drawn last
            const beings = [...gs.enemies.map((e) => ({ y: e.y, kind: 'enemy', o: e })), { y: gs.billy.y, kind: 'billy', o: gs.billy }]
            if (gs.jimmy) beings.push({ y: gs.jimmy.y, kind: 'jimmy', o: gs.jimmy })
            for (const bar of gs.barrels) beings.push({ y: bar.y, kind: 'barrel', o: bar })
            if (gs.marian) beings.push({ y: gs.marian.y, kind: 'marian', o: gs.marian })
            if (gs.intro && gs.intro.marian) beings.push({ y: gs.intro.marian.y, kind: 'introMarian', o: gs.intro.marian })
            for (const p of gs.pickups) if (p.y < PROPS_DEPTH) beings.push({ y: p.y, kind: 'pick', o: p })
            beings.sort((a, b) => a.y - b.y)
            for (const q of beings) {
                if (q.kind === 'enemy') drawEnemy(ctx, q.o, gs.camX)
                else if (q.kind === 'billy') drawBilly(ctx, q.o, gs.camX, gs.barrels)
                else if (q.kind === 'jimmy') drawJimmy(ctx, q.o, gs.camX, gs.barrels)
                else if (q.kind === 'barrel') drawBarrel(ctx, q.o, gs.camX)
                else if (q.kind === 'marian') drawMarian(ctx, q.o, gs.camX, gs.tick)
                else if (q.kind === 'introMarian') drawIntroMarian(ctx, q.o, gs.camX, gs.tick)
                else drawPickup(ctx, q.o, gs.camX)
            }
            for (const pr of gs.projectiles) drawProjectile(ctx, pr, gs.camX)
            // particles (juice layer — Math.random law: never reaches state)
            for (let i = part.length - 1; i >= 0; i--) {
                const q = part[i]
                q.x += q.vx; q.y += q.vy; q.vy += 0.1; q.t -= 1
                if (q.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = q.c === 0 ? '#ffd23c' : q.c === 1 ? '#ff6a2a' : q.c === 3 ? '#a8763a' : q.c === 4 ? '#eef6ff' : q.c === 5 ? '#5a8ae8' : '#d9dde2'
                ctx.fillRect(Math.round(q.x - gs.camX), Math.round(q.y), q.s || 2, q.s || 2)
            }
            for (const p of (gs.stage === 2 ? PROPS_YARD : PROPS)) drawProp(ctx, p, gs.camX, gs.tick)
            ctx.restore()
            drawHud(ctx, gs, screen === 'play', connectedSlots() >= 2) // #2874: the key strip belongs to the street, not the demo; #2863: slot 2 awake = greet it
            if (screen === 'attract') drawAttract(ctx, Math.floor(gs.tick / 150), gs.tick)
            else drawBanner(ctx, gs)
            // #2863: the drop-in shout, over the street and under nothing else
            if (screen === 'play' && gs.jimmy) drawJoinFx(ctx, joinFx, Math.round(gs.jimmy.x - gs.camX), Math.round(gs.jimmy.y))
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
                        if (joinFx > 0) joinFx -= 1
                        if (screen === 'play') {
                            // #2860 drop-in: any live pad-2 input takes the blue
                            // seat, the same law the WASD keys obey, chime and all.
                            if (p2Seat(gs, slotActive(2))) seatJoin()
                            stepSim(simPad())
                        } else if (screen === 'attract') {
                            if (demoHold > 0) { demoHold -= 1; if (demoHold === 0) gs = makeGame((gs.seed + 7) >>> 0, { coop: coopOn() }) }
                            else { stepSim(autopilot(gs)); if (gs.mode !== 'play') demoHold = 120 }
                            gs.tick += 0 // attract demo world-ticks ride stepSim
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
            // #2891: any key lifts the curtain — and lands as a real input the
            // same instant (skip into gameplay, never eat the press).
            if (screen === 'play' && gs.intro && gs.intro.t > INTRO.grace) endIntro(gs)
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') { keys.j = true; jumpQ = true }
            if (e.code === 'KeyX') { keys.k = true; kickQ = true }
            if (e.code === 'KeyZ') { keys.p = true; punchQ = true }
            // S4 seat 2 — WASD walk · F punch · G kick · V jump. Drop-in law
            // (Contra S4): the first touch takes Jimmy out of the CPU's hands
            // for the rest of the run.
            const isP2 = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyV'].includes(e.code)
            if (isP2) e.preventDefault()
            // #2857 fix: the seat belongs to P2's keys only — Billy's arrows must
            // not steal the blue dragon from his CPU (the drop-in law names the
            // keys; the guard said everything). Exposed by the ropes-phase leg.
            if (isP2 && gs.jimmy && !gs.jimmy.human && !gs.jimmy.out) { gs.jimmy.human = true; seatJoin() }
            if (e.code === 'KeyA') keys2.l = true
            if (e.code === 'KeyD') keys2.r = true
            if (e.code === 'KeyW') keys2.u = true
            if (e.code === 'KeyS') keys2.d = true
            if (e.code === 'KeyV') { keys2.j = true; jumpQ2 = true }
            if (e.code === 'KeyG') { keys2.k = true; kickQ2 = true }
            if (e.code === 'KeyF') { keys2.p = true; punchQ2 = true }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.j = false
            if (e.code === 'KeyX') keys.k = false
            if (e.code === 'KeyZ') keys.p = false
            if (e.code === 'KeyA') keys2.l = false
            if (e.code === 'KeyD') keys2.r = false
            if (e.code === 'KeyW') keys2.u = false
            if (e.code === 'KeyS') keys2.d = false
            if (e.code === 'KeyV') keys2.j = false
            if (e.code === 'KeyG') keys2.k = false
            if (e.code === 'KeyF') keys2.p = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.j = keys.k = keys.p = keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.k = keys2.p = false }
        const onPointer = () => {
            if (screen === 'attract') { humanStart(); return }
            if (screen === 'over') { if (performance.now() - overAt > 900) endTo('attract'); return }
            if (screen === 'play' && gs.intro && gs.intro.t > INTRO.grace) endIntro(gs)
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)
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
            window.__ddTest = {
                probe: () => ({
                    screen, tick: gs.tick, x: +gs.billy.x.toFixed(2), y: gs.billy.y, z: +gs.billy.z.toFixed(2),
                    cam: Math.round(gs.camX * 100) / 100,   // #2877: pixel legs need the screen mapping
                    lives: gs.billy.lives, score: gs.score, weapon: gs.billy.weapon,
                    chain: gs.chain, chainT: gs.chainT,   // #2882: chain legs read the streak
                    flashM: gs.scoreFlash && gs.scoreFlash.m ? gs.scoreFlash.m : 1,
                    mode: gs.mode, waveIdx: gs.waveIdx, enemies: gs.enemies.length,
                    scoreFlash: gs.scoreFlash ? gs.scoreFlash.v : 0,
                    enemyKinds: gs.enemies.map((e) => e.kind + ':' + e.state).join(','),
                    billyState: gs.billy.state, camX: Math.round(gs.camX),
                    barrels: gs.barrels.length, projectiles: gs.projectiles.length,
                    pickups: gs.pickups.map((p) => p.kind).join(','),
                    stage: gs.stage,
                    marian: gs.marian ? (gs.marian.freed ? 'free' : 'tied:' + gs.marian.cuts) : 'none',
                    // #2891: the opening movie — legs watch the curtain rise,
                    // hold and caption, then confirm the street reopened clean.
                    intro: gs.intro ? gs.intro.t : -1,
                    introMarian: gs.intro ? (gs.intro.marian.grabbed ? 'held' : gs.intro.marian.scared ? 'fleeing' : 'walking') : 'none',
                    introLift: gs.intro ? gs.intro.marian.lift : -1,
                    introTaken: gs.intro && gs.intro.takenT > 0 ? 1 : takenSeen ? 2 : 0,
                    // #2897 tells for the polish legs: the flash beat, the bubble
                    // clock + Marian's screen spot, and the cast's death clocks.
                    introFlash: gs.intro ? gs.intro.flashT : -1,
                    introBubble: gs.intro ? gs.intro.marian.bubble : -1,
                    introMarianX: gs.intro ? Math.round(gs.intro.marian.x - gs.camX) : -1,
                    introMarianY: gs.intro ? Math.round(gs.intro.marian.y - (gs.intro.marian.grabbed ? gs.intro.marian.lift : 0)) : -1,
                    introGoons: gs.intro ? gs.intro.goons.map((e) => `${e.state}:${Math.round(e.x - gs.camX)}:${e.y}:${e.stateT}`).join(',') : '',
                    duel: gs.enemies.some((e) => e.kind === 'duel') ? 1 : 0,
                    casts: gs.enemies.filter((e) => e.hasKnife).length,
                    coop: gs.coop ? 1 : 0,
                    jimmy: gs.jimmy ? `${gs.jimmy.x.toFixed(0)}:${gs.jimmy.y}:${gs.jimmy.lives}:${gs.jimmy.human ? 'HUMAN' : 'CPU'}${gs.jimmy.out ? ':OUT' : ''}:${gs.jimmy.state}` : 'none',
                    jimmyZ: gs.jimmy ? +gs.jimmy.z.toFixed(2) : 0,
                    // #2857 juice tells for the harness legs
                    guard: gs.billy.guard, relief: gs.billy.relief, flourish: gs.billy.flourish,
                    // #2874 first-timer tells: knockdown beat, lives flash, key strip
                    knock: gs.billy.knock, livesFx: gs.livesFx ? `${gs.livesFx.tag}:${gs.livesFx.t}` : 'none',
                    tipT: gs.tipT,
                    jimmyGuard: gs.jimmy ? gs.jimmy.guard : -1,
                    jimmyRelief: gs.jimmy ? gs.jimmy.relief : -1,
                    jimmyFlourish: gs.jimmy ? gs.jimmy.flourish : -1,
                    gripFx: gs.gripFx ? 1 : 0,
                }),
                start: () => startPlay(false),   // harness straight to the street — no movie (#2891)
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.x !== undefined) gs.billy.x = opts.x
                    if (opts.lives !== undefined) gs.billy.lives = opts.lives
                    if (opts.inv !== undefined) gs.billy.inv = opts.inv
                    if (opts.weapon) gs.billy.weapon = opts.weapon
                    if (opts.spawnStick) gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: 'stick', bob: 0 })
                    if (opts.spawnWeapon) { gs.billy.weapon = null; gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: opts.spawnWeapon, bob: 0 }) }
                    if (opts.barrelAt) gs.barrels.push({ id: 99 + gs.barrels.length, x: opts.barrelAt[0], y: opts.barrelAt[1], hp: 3, shake: 0 })
                    if (opts.clearBarrels) gs.barrels.length = 0
                    if (opts.killBilly) { gs.billy.inv = 0; const e = { id: gs.nextId++, kind: 'williams', x: gs.billy.x + 8, y: gs.billy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 60, inv: 0, spinHit: false }; gs.enemies.push(e) }
                    if (opts.clearEnemies) gs.enemies.length = 0
                    if (opts.warp === 'abobo') {
                        gs.billy.x = 570
                        gs.waveIdx = 2; gs.waveActive = true; gs.camLock = true
                        gs.enemies.push({ id: gs.nextId++, kind: 'abobo', x: 640, y: 170, face: -1, hp: 14, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 40, inv: 0, spinHit: false })
                    }
                    if (opts.warp === 'hideout' && gs.stage === 1) {
                        enterStage2(gs)
                        gs.billy.y = 170
                    }
                    if (opts.warp === 'marian') {
                        if (gs.stage === 1) enterStage2(gs)
                        gs.waveIdx = 3; gs.waveActive = false; gs.camLock = false
                        gs.enemies.length = 0
                        gs.camX = 640
                        gs.billy.x = 894; gs.billy.y = gs.marian.y
                    }
                    if (opts.knifeGoon) {
                        gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: gs.billy.x + 70, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 20, attackCooldown: 999, inv: 0, spinHit: false })
                    }
                    if (opts.duel) {
                        gs.enemies.push({ id: gs.nextId++, kind: 'duel', x: gs.billy.x + 90, y: gs.billy.y, face: -1, hp: CFG.duelHp, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, knifeUser: true, castCooldown: 40, attackCooldown: 60, inv: 0, spinHit: false })
                    }
                    if (opts.marianFree && gs.marian) { gs.marian.freed = true; gs.marian.cuts = CFG.rescueCuts; gs.rescueT = CFG.rescueCheer }
                    // S4 co-op fixtures
                    if (opts.allyHuman !== undefined && gs.jimmy) gs.jimmy.human = !!opts.allyHuman
                    if (opts.allyX !== undefined && gs.jimmy) gs.jimmy.x = opts.allyX
                    if (opts.allyY !== undefined && gs.jimmy) gs.jimmy.y = opts.allyY
                    if (opts.allyLives !== undefined && gs.jimmy) gs.jimmy.lives = opts.allyLives
                    if (opts.allyInv !== undefined && gs.jimmy) gs.jimmy.inv = opts.allyInv
                    if (opts.killAlly && gs.jimmy) {
                        gs.jimmy.inv = 0; gs.jimmy.lives = 1
                        gs.jimmy.x = gs.camX + 100; gs.jimmy.y = 170
                        gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: gs.jimmy.x + 8, y: gs.jimmy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999, tgt: 'jimmy', attackCooldown: 60, inv: 0, spinHit: false })
                    }
                    if (opts.allyOut && gs.jimmy) { gs.jimmy.lives = 0; gs.jimmy.out = true; gs.jimmy.state = 'idle'; gs.jimmy.stateT = 0 }
                    // #2857: a thug gripping Billy while the CPU seat watches —
                    // the guardian-leg fixture. And steel still in the air on the
                    // ropes-phase doorstep — the guardian-blade QA fixture.
                    if (opts.allyGrip && gs.jimmy) {
                        const [gx, gy] = opts.allyGrip
                        const gid = gs.nextId++
                        gs.enemies.push({ id: gid, kind: 'amon', x: gx, y: gy, face: gx > gs.billy.x ? -1 : 1, hp: 6, state: 'grab', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999, tgt: 'billy', attackCooldown: 99999, inv: 0, spinHit: false, wob: 0 })
                        gs.billy.x = gx - 8; gs.billy.y = gy; gs.billy.inv = 999
                        gs.billy.state = 'grabbed'; gs.billy.grabFrom = gid; gs.billy.stateT = 0; gs.billy.presses = 0
                    }
                    if (opts.flyKnife && gs.jimmy) {
                        gs.projectiles.push({ id: gs.nextId++, x: gs.jimmy.x + 52, y: gs.jimmy.y, vx: -CFG.goonKnife.speed, spin: 0, side: 'goon' })
                    }
                    if (opts.makeSolo && gs.jimmy) { gs.coop = false; gs.jimmy = null }
                    // #2889 tells fixtures: relief on the blue seat (HUD tag
                    // blink), a fresh knockdown for the squash, the strut on the
                    // red seat for the back-step drift. Paint-watch legs only.
                    if (opts.allyRelief !== undefined && gs.jimmy) gs.jimmy.relief = opts.allyRelief
                    if (opts.billyFlourish !== undefined) gs.billy.flourish = opts.billyFlourish
                    if (opts.downThug) {
                        const [dx, dy] = opts.downThug
                        gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: dx, y: dy, face: -1, hp: 3, state: 'down', stateT: 0, anim: 26, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999, attackCooldown: 99999, inv: 0, spinHit: false, wob: 0, flash: 0 })
                    }
                    return true
                },
            }
            mountDbg({
                title: 'DOUBLE DRAGON',
                getState: () => [
                    `x ${gs.billy.x.toFixed(0)}/960  y ${gs.billy.y}  z ${gs.billy.z.toFixed(0)}  cam ${Math.round(gs.camX)}${gs.camLock ? ' LOCK' : ''}  stage ${gs.stage}  wave ${gs.waveIdx}/3${gs.marian ? `  marian ${gs.marian.freed ? 'FREE' : 'tied (' + gs.marian.cuts + '/' + CFG.rescueCuts + ')'}` : ''}`,
                    `score ${gs.score}  hi ${Math.max(hiscore, gs.hi)}  lives ${gs.billy.lives}  weapon ${gs.billy.weapon || '-'}  inv ${gs.billy.inv}  mode ${gs.mode}`,
                    gs.jimmy ? `JIMMY ${gs.jimmy.out ? 'DOWN (second wind at the next stage)' : `x ${gs.jimmy.x.toFixed(0)}  y ${gs.jimmy.y}  lives ${gs.jimmy.lives}  ${gs.jimmy.human ? 'HUMAN' : 'CPU'}  weapon ${gs.jimmy.weapon || '-'}`}` : 'SOLO — no partner',
                    `enemies ${gs.enemies.map((e) => `${e.kind} ${e.state}${e.hasStick ? '+stick' : ''}${e.hasKnife ? '+knife' : ''}(${e.hp})`).join(' | ') || 'none'}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                    `seat fx ${joinFx}  wake ${connectedSlots() >= 2}`, // #2863: join-juice + greeting probes
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.billy.lives += 1; return 'extra life' } },
                    { label: 'P2: HUMAN SEAT', run: () => { if (!gs.jimmy) return 'no partner this run (?solo=1)'; if (!gs.jimmy.human) { if (gs.jimmy.out) return 'blue seat is down'; gs.jimmy.human = true; seatJoin(); return 'blue seat: human (WASD FGV) — join fx fired' } gs.jimmy.human = false; return 'blue seat: CPU' } },
                    { label: 'TAKE A HIT (P2)', run: () => { if (!gs.jimmy) return 'no partner'; gs.jimmy.lives = 1; window.__ddTest.setup({ killAlly: true }); return 'a goon swings at Jimmy' } },
                    { label: 'GIVE STICK', run: () => { gs.billy.weapon = 'stick'; return 'stick in hand' } },
                    { label: 'GIVE KNIFE', run: () => { gs.billy.weapon = 'knife'; return 'steel in hand — PUNCH throws' } },
                    { label: 'GIVE WHIP', run: () => { gs.billy.weapon = 'whip'; return 'coil in hand — PUNCH lashes' } },
                    { label: 'SPAWN BARREL', run: () => { gs.barrels.push({ id: 90 + gs.barrels.length, x: gs.billy.x + 24, y: gs.billy.y, hp: 3, shake: 0 }); return 'a barrel rolls in' } },
                    { label: 'TO ABOBO', run: () => { window.__ddTest.setup({ warp: 'abobo' }); return 'before the giant' } },
                    { label: 'TO HIDEOUT', run: () => { window.__ddTest.setup({ warp: 'hideout' }); return 'stage 2 — the yard opens' } },
                    { label: 'TO MARIAN', run: () => { window.__ddTest.setup({ warp: 'marian' }); return 'the duel is won — the ropes await' } },
                    { label: 'TO THE DUEL', run: () => { window.__ddTest.setup({ warp: 'marian', duel: true }); return 'Williams himself steps into the light' } },
                    { label: 'FREE MARIAN', run: () => { window.__ddTest.setup({ warp: 'marian', marianFree: true }); return 'ropes cut — the cheer' } },
                    { label: 'SPAWN CASTER', run: () => { window.__ddTest.setup({ knifeGoon: true }); return 'a Williams fingers a knife' } },
                    { label: 'SPAWN GOON', run: () => { gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: gs.billy.x + 40, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 30, inv: 0, spinHit: false }); return 'a Williams arrives' } },
                    { label: 'CLEAR WAVE', run: () => { gs.enemies.length = 0; return 'street is clear' } },
                ],
            })
            exposeGame({
                id: 'double-dragon',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0, { coop: coopOn() })
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.j = keys.k = keys.p = false
                    keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.k = keys2.p = false
                    jumpQ = kickQ = punchQ = jumpQ2 = kickQ2 = punchQ2 = false
                    joinFx = 0
                    screen = 'play'
                    setMode('play')
                },
                tick: (pad) => {
                    step(gs, {
                        left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down,
                        a: !!pad.a, b: !!pad.b, punch: !!pad.punch,
                    }, {
                        left: !!pad.p2_left, right: !!pad.p2_right, up: !!pad.p2_up, down: !!pad.p2_down,
                        a: !!pad.p2_a, b: !!pad.p2_b, punch: !!pad.p2_punch,
                    })
                    drain()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.mode === 'gameover',
                    seed: gs.seed, lives: gs.billy.lives,
                    chain: gs.chain, chainT: gs.chainT,   // #2882: QA legs can read the streak
                    x: Math.round(gs.billy.x), y: gs.billy.y, z: Math.round(gs.billy.z),
                    billyState: gs.billy.state, weapon: gs.billy.weapon || '-',
                    waveIdx: gs.waveIdx, enemies: gs.enemies.length,
                    barrels: gs.barrels.length, projectiles: gs.projectiles.length,
                    stage: gs.stage,
                    marian: gs.marian ? (gs.marian.freed ? 2 : 1) : 0,
                    cleared: gs.cleared ? 1 : 0,
                    coop: gs.coop ? 1 : 0,
                    jimmyLives: gs.jimmy ? gs.jimmy.lives : 0,
                    jimmyHuman: gs.jimmy && gs.jimmy.human ? 1 : 0,
                    jimmyOut: gs.jimmy && gs.jimmy.out ? 1 : 0,
                    jimmyX: gs.jimmy ? Math.round(gs.jimmy.x) : 0,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.mode === 'gameover', lives: gs.billy.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            endRun() // #1711: an unmount mid-run ends the take (no-op when idle)
            if (import.meta.env.DEV) { if (window.__ddTest) delete window.__ddTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div ref={wrapRef} className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DOUBLE DRAGON')} onResume={handleResume} />}
            <VirtualControls
                visible={mode === 'play' && !paused}
                secondAction={{ label: 'KICK', code: 'KeyX' }}
                thirdAction={{ label: 'PUNCH', code: 'KeyZ' }}
            />
        </div>
    )
}

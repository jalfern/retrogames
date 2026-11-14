// HOMEBODY — the arcade shell over ./sim.js (rules) and ./art.js (look).
//
// An original people sim in the spirit of The Sims (Maxis, PC 2000) — its own
// IP, names and art. Command two residents on a little suburban lot: tap an
// object to order them (they pathfind and use it), juggle five needs against a
// clock you control — the speed dial (#2227) pauses, hurries and races it —
// work at the mailbox for §, buy furniture to raise the
// home's ambience, and bank 80 contentment to grant the lifetime wish.
// Ignore the household and it collapses.
//
// One useEffect owns the fixed-timestep loop; the contract hands the clock to a
// driver while it holds it. Attract runs the sim's own demo autopilot.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import {
    FIXED_DT, W, H, PANEL_X, TILE, LOT_X, LOT_Y, WIN_CONTENT,
    REL_NAMES,
    tileOf, CATALOG, NEEDS, SFX, EXT_ROOM,
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, sellAt, cellItem, targetsOf, walkable, manualMove, placeOk, buildRoom,
    adoptPet, adoptOk, PET,   // #2197: the cat counter
    adoptKid, adoptKidOk, KID,   // #2203: the child counter
    setSel, flipTab, selectTab, digitCard,   // #2222: catalog shelves
    SPEED_MULT, SPEED_NAMES, setSpeed, cycleSpeed, attractSpeed,   // #2227: the speed dial
    court, courtTarget,   // #2131: player-ordered romance commands
    courtHoldArm, courtTick, courtTap, HOLD_INSULT_MS,   // #2171: thumb court — one pad button, two orders
    scheduleMeals, MEAL_WINDOW, SPAT_CD,   // #2244: the meal bells — the F1 cheat re-seeds today's hours
    stateHash,
} from './sim.js'
import {
    drawGround, drawGate, drawItem, drawPerson, nightTint, drawPanel, drawTopBar,
    drawCatalog, catalogHit, tabHit, speedHit, drawBuildCursor, drawThoughts, drawClouds,   // #2227: speedHit — the dial's tap route
    drawPet,   // #2197: Miso
    drawKid,   // #2203: Pip
    drawSay,   // #2135: the spoken-word bubble over the pair
} from './art.js'

const SIM_MS = FIXED_DT
const MESSAGES = [
    'Two residents, five needs, one little house. You are the voice in their heads.',
    'Tap a fridge, a bed, the TV — they walk over and use it. Feed them, rest them.',
    'The mailbox pays the bills on workdays. § buys furniture to raise the home.',
    'Morning brings the paper — the boy sweeps past and today\'s edition waits on the step. Tap it for a laugh.',
    'THE BELLS RING THREE TIMES A DAY — a warm plate waits by the kitchen. Tap to eat; eat together and BONDS rise.',
    'Fern the neighbour wanders in by day — chat fills the blue bar.',
    'CHAT builds BONDS — Fern at FAMILY visits sooner and lingers. Neglect cools them.',
    'Ivy shops the market — chat grows HER bond too. At FRIENDS she brings a basket; FAMILY adds honey-money.',
    'Order the court on glass: tap ✓ for the kind word — hold ✓ on someone and the insult flies.',
    'Red needs flare tempers — a SPAT cracks BONDS. Fill both, side by side, to thaw.',
    'Bank §300, then B + R: hammer on a Spare Room and the lot grows.',
    'Buy mode has SHELVES — [ and ] flip HOME / FUN / DECOR / SPECIAL; tap a shelf name on the phone.',
    'THE CLOCK IS YOURS — keys 1-4 set the speed dial (|| ▶ ▶▶ ▶▶▶), or tap SPEED in the panel.',
    'SAY THE KIND THING — C coos, X cuts. The gold ring under a visitor shows who will hear you.',
    'Adopt a child for §150 — K opens the counter. Pip scampers, snackes, plays and tumbles.',
    'A lonely Pip cries and the whole house feels it. Nearby family, toys and a cozy corner keep the giggles coming.',
    'Bank 80 contentment and the lifetime wish comes true.',
]
const PRESS = 'TAP / PRESS ANY KEY TO MOVE IN'
// #2143: bond-key → name, for the toast lines (three points on the triangle now).
const BONDER = { house: 'HOUSEHOLD', fern: 'FERN', ivy: 'IVY', kid: 'PIP' }   // #2203: the child rows a bond too

const CUR = { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'] }
const MOVE_KEYS = new Set([...CUR.l, ...CUR.r, ...CUR.u, ...CUR.d])
const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter'])
const BUILD_KEYS = new Set(['KeyB'])
const COURT_KEYS = new Set(['KeyC', 'KeyX'])   // #2131: coo / insult
const SWITCH_KEYS = new Set(['KeyG', 'Tab'])
const ROOM_KEYS = new Set(['KeyR'])
const PET_KEYS = new Set(['KeyP'])   // #2197: pounce on the adoption card
const KID_KEYS = new Set(['KeyK'])   // #2203: key K to the child counter
const KEY_SET = new Set([...MOVE_KEYS, ...ACTION_KEYS, ...BUILD_KEYS, ...COURT_KEYS, ...SWITCH_KEYS, ...ROOM_KEYS, ...PET_KEYS, ...KID_KEYS, ...'123456789'])

const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

const HomebodyGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [endInfo, setEndInfo] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 batch 17: the attract brain runs the street
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const watchingRef = useRef(false)
    const overAtRef = useRef(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        let canvas = null, ctx = null
        let raf = 0, last = 0, acc = 0
        let gs = null, demoG = null
        let seed = 20261023
        let particles = [], shake = 0
        const refuses = []   // #1823: red ghost-cell flashes on refused placements
        // #2135: the spoken-word bubble — quoted lines lift over the pair, not just the log.
        const sayB = { text: '', x: 0, y: 0, life: 0 }
        const showSay = (s2, e) => { const t = s2.thoughts[0]; if (t) { sayB.text = t.text; sayB.x = e.x ?? W / 2; sayB.y = e.y ?? H / 2; sayB.life = 4.2 } }
        let toastMsg = '', toast = 0
        const prev = { left: false, right: false, up: false, down: false, a: false, b: false, pdown: false }
        const heldKeys = { left: false, right: false, up: false, down: false }
        let actQueued = false, buildQueued = false, switchQueued = false
        let tabQueued = 0         // #2222: [ / ] pending shelf flip
        let specialPick = null    // #2197/#2203: R/K ids route through the shelf now
        let courtQueued = null    // #2131: 'coo' | 'insult' pending from C/X
        let digitPick = -1        // #2222: digit picks within the open shelf
        let speedPick = null      // #2227: digits 1-4 outside buy mode set the dial
        let speedCycled = 0       // #2227: , / . cycle the dial in every mode
        const say = (m) => { toastMsg = m; toast = 120 }
        const speedBlip = (n, up) => {
            if (n === 0) audioController.playTone(200, 0.09, 'square', 0.05)
            else if (up) audioController.playSweep(440, 880, 0.12, 'square', 0.05)
            else audioController.playSweep(660, 330, 0.12, 'square', 0.05)
        }

        const buildCanvas = () => {
            if (canvas) canvas.remove()
            canvas = document.createElement('canvas')
            canvas.width = W; canvas.height = H
            canvas.className = 'block'
            canvas.style.imageRendering = 'pixelated'
            canvas.style.touchAction = 'none'
            wrap.appendChild(canvas)
            ctx = canvas.getContext('2d')
            ctx.imageSmoothingEnabled = false
            resize()
        }

        // ------------------------------------------------------------ audio ----
        const handleEvents = (s, live) => {
            while (s.events.length) {
                const e = s.events.shift()
                switch (e.t) {
                    case 'satisfied': {
                        const fx = SFX[e.need] || SFX.hunger
                        fx.seq.forEach((m, i) => audioController.playTone(fx.f * m, 0.09, fx.type, 0.05, i * 0.07))
                        if (fx.noise) audioController.playFilteredNoise(fx.noise, 0.08, 1400)
                        if (live) burst(e.x ?? W / 2, e.y ?? H / 2, 6, '#ffe6a8', 2.2, 'flash')
                        break
                    }
                    case 'content': audioController.playTone(880, 0.05, 'triangle', 0.03); if (live) sparkles(); break
                    case 'redcross':
                        audioController.playTone(300, 0.06, 'square', 0.05, 0)
                        audioController.playTone(230, 0.1, 'square', 0.05, 0.08)
                        if (live) say(`${e.name.toUpperCase()} NEEDS ${e.need.toUpperCase()}`)
                        break
                    case 'place': audioController.playTone(200, 0.09, 'square', 0.06); if (live) burst(tilePx(e.c), tilePy(e.r) + 16, 8, '#c9b48a', 2.6); break
                    case 'sell': audioController.playSweep(420, 180, 0.12, 'square', 0.05); break
                    case 'work-go': audioController.playSweep(260, 620, 0.3, 'square', 0.06); if (live) say(`${e.name.toUpperCase()} LEAVES FOR WORK`); break
                    case 'pay': audioController.playTone(880, 0.06, 'triangle', 0.05); audioController.playTone(1175, 0.06, 'triangle', 0.05); audioController.playTone(1568, 0.1, 'triangle', 0.05); if (live) say(`PAYDAY  §${e.pay}`); break
                    case 'visit':   // #2143: two neighbours now — each gets her own ring
                        if (e.name === 'Ivy') {
                            audioController.playTone(587, 0.14, 'sine', 0.06); setTimeout(() => audioController.playTone(988, 0.18, 'sine', 0.06), 150)
                            if (live) say('IVY AT THE GATE')
                        } else {
                            audioController.playTone(660, 0.14, 'sine', 0.06); setTimeout(() => audioController.playTone(880, 0.18, 'sine', 0.06), 150)
                            if (live) say('THE NEIGHBOUR RINGS')
                        }
                        break
                    case 'visit-end': audioController.playSweep(520, 300, 0.2, 'sine', 0.04); break
                    case 'paper':   // #2238: the route arrives — newsprint flutter and a chalk-bright drop on the step
                        audioController.playNoise(0.14, 0.05); audioController.playTone(330, 0.05, 'triangle', 0.03)
                        if (live) { say('THE PAPER BOY SWEEPS PAST'); burst(tilePx(e.c), tilePy(e.r) + 14, 6, '#efe9d8', 2) }
                        break
                    case 'meal':   // #2244: the bell rings — brass strike and a cream steam puff at the plate
                        audioController.playTone(1046, 0.16, 'sine', 0.055)
                        setTimeout(() => audioController.playTone(1318, 0.22, 'sine', 0.055), 170)
                        if (live) { say(`${e.name} BELL — FOOD ON THE COUNTER`); burst(tilePx(e.c), tilePy(e.r) + 10, 6, '#efe9d8', 1.8) }
                        break
                    case 'meal-shared':   // #2244: the whole table came — warm chord and hearts over the kitchen
                        audioController.playTone(523, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(659, 0.07, 'triangle', 0.05), 90)
                        setTimeout(() => audioController.playTone(784, 0.14, 'triangle', 0.05), 180)
                        if (live) { say('SHARED TABLE ♥'); heartBurst(e.x, e.y - 12) }
                        break
                    case 'meal-cold':   // #2244: nobody came to the table — a soft, sad low
                        audioController.playSweep(392, 262, 0.24, 'triangle', 0.04)
                        if (live) say('THE MEAL WENT COLD')
                        break
                    case 'gift':   // #2143: the market basket lands — warm arpeggio, gold glints
                        audioController.playTone(523, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(659, 0.07, 'triangle', 0.05), 90)
                        setTimeout(() => audioController.playTone(880, 0.14, 'triangle', 0.05), 180)
                        if (live) { say(e.money ? `IVY BRINGS A GIFT — §${e.money}` : 'IVY BRINGS A GIFT ♥'); sparkles() }
                        break
                    case 'rel-up':
                        audioController.playTone(659, 0.07, 'sine', 0.05)
                        setTimeout(() => audioController.playTone(988, 0.14, 'sine', 0.05), 90)
                        if (live) { say(`BOND RISES — ${BONDER[e.k] || 'HOUSEHOLD'}: ${REL_NAMES[e.level]}`); sparkles() }
                        break
                    case 'rel-down': // #2070: the ladder runs both ways now
                        audioController.playSweep(560, 300, 0.25, 'square', 0.05)
                        if (live) say(`BOND FALLS — ${BONDER[e.k] || 'HOUSEHOLD'}: ${REL_NAMES[e.level]}`)
                        break
                    case 'spat': // #2070: the crack — sour dissonance, red sparks, a jolt
                        audioController.playTone(233, 0.09, 'sawtooth', 0.06)
                        setTimeout(() => audioController.playTone(220, 0.16, 'sawtooth', 0.06), 100)
                        shake = 6
                        if (live) { say('OTTO AND MIRA SPAT!'); burst(e.x, e.y, 12, '#e23b2e', 3.0); showSay(s, e) }
                        break
                    case 'grudge-cool': // #2135: the cold war speaks — a low, sour murmur
                        audioController.playTone(196, 0.16, 'triangle', 0.04)
                        setTimeout(() => audioController.playTone(185, 0.22, 'triangle', 0.04), 130)
                        if (live) showSay(s, e)
                        break
                    case 'makeup': // #2070: the thaw — a warm major chord, pink hearts
                        audioController.playTone(523, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(659, 0.07, 'triangle', 0.05), 90)
                        setTimeout(() => audioController.playTone(784, 0.14, 'triangle', 0.05), 180)
                        if (live) { say('MADE UP ♥'); heartBurst(e.x, e.y - 12); showSay(s, e) }   // #2076: hearts, named by the BONDS glyph
                        break
                    case 'chat': // #2135: the neighbours talk ON screen now — a soft murmur, then the bubble
                        audioController.playTone(e.k === 'ivy' ? 494 : 523, 0.05, 'sine', 0.03)
                        setTimeout(() => audioController.playTone(e.k === 'ivy' ? 392 : 415, 0.07, 'sine', 0.03), 70)
                        if (live) showSay(s, e)
                        break
                    case 'coo': // #2131: the compliment — a warm two-note and gold glints
                        audioController.playTone(659, 0.06, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(831, 0.12, 'triangle', 0.05), 80)
                        if (live) { say(e.k === 'fern' ? 'A WORD FOR FERN ♥' : e.k === 'ivy' ? 'A WORD FOR IVY ♥' : e.k === 'kid' ? 'A WORD FOR PIP ♥' : 'A WORD FOR YOUR BETTER HALF ♥'); burst(e.x, e.y - 10, 5, '#ffe6a8', 2.2, 'flash'); showSay(s, e) }
                        break
                    case 'affection': // #2131: the FAMILY tier pays in hearts — full chord
                        audioController.playTone(523, 0.07, 'sine', 0.05)
                        setTimeout(() => audioController.playTone(659, 0.07, 'sine', 0.05), 80)
                        setTimeout(() => audioController.playTone(784, 0.07, 'sine', 0.05), 160)
                        setTimeout(() => audioController.playTone(1047, 0.16, 'sine', 0.05), 240)
                        if (live) { say('AFFECTION ♥ FAMILY'); heartBurst(e.x, e.y - 12); showSay(s, e) }
                        break
                    case 'insult': // #2131: the cruel word — sour fall, cold flicker, the grudge sets
                        audioController.playSweep(400, 180, 0.22, 'sawtooth', 0.06)
                        if (live) { say(e.k === 'fern' ? 'YOU CUT FERN WITH WORDS' : 'YOU INSULTED YOUR BETTER HALF'); burst(e.x, e.y, 8, '#7a92c9', 2.6); showSay(s, e) }
                        break
                    case 'faint': audioController.playNoise(0.3, 0.1); audioController.playSweep(300, 60, 0.5, 'sawtooth', 0.09); shake = 10; if (live) { say(`${e.name.toUpperCase()} COLLAPSED!`); burst(e.x, e.y, 16, '#e23b2e', 3.4) } break
                    case 'wake': audioController.playSweep(440, 760, 0.2, 'triangle', 0.05); break
                    case 'day': audioController.playTone(1245, 0.06, 'sine', 0.03); setTimeout(() => audioController.playTone(1568, 0.09, 'sine', 0.03), 90); if (live && s.day > 1) say(`DAY ${s.day}`); break
                    case 'room':
                        for (let i = 0; i < 3; i++) audioController.playTone(150 - i * 14, 0.07, 'square', 0.08, i * 0.11)
                        setTimeout(() => audioController.playSweep(240, 520, 0.3, 'triangle', 0.06), 340)
                        if (live) { say('SPARE ROOM BUILT — THE LOT GROWS'); burst(LOT_X + 13 * TILE, LOT_Y + 4 * TILE, 14, '#c9b48a', 2.8) }
                        break
                    case 'room-see':
                        audioController.playTone(740, 0.06, 'triangle', 0.04)
                        setTimeout(() => audioController.playTone(988, 0.09, 'triangle', 0.04), 90)
                        if (live) { say(`${e.name.toUpperCase()} MOVES IN`); burst(LOT_X + 13 * TILE, LOT_Y + 5 * TILE, 8, '#ffd24a', 2.2) }
                        break
                    case 'pet':   // #2197: the adoption bell — twin chirps and a gold burst at the gate
                        audioController.playSweep(880, 1245, 0.12, 'triangle', 0.05)
                        setTimeout(() => audioController.playSweep(988, 1480, 0.14, 'triangle', 0.05), 120)
                        if (live) { say('MISO MOVES IN'); burst(e.x, e.y, 10, '#ffd24a', 2.4) }
                        break
                    case 'pet-coo':   // a soft two-note purr-chime and pink sparks
                        audioController.playTone(1319, 0.05, 'sine', 0.035)
                        setTimeout(() => audioController.playTone(1568, 0.07, 'sine', 0.03), 70)
                        if (live) burst(e.x, e.y - 8, 4, '#ff9fc4', 1.8)
                        break
                    case 'pet-eat':   // tiny kibble crunches
                        audioController.playTone(660, 0.04, 'square', 0.05)
                        setTimeout(() => audioController.playTone(520, 0.05, 'square', 0.05), 70)
                        if (live) burst(e.x, e.y + 5, 3, '#8a5626', 1.2)   // #2200: the crumbs fly
                        break
                    case 'cat-meet':   // #2200: a curious hello — rising chirp, pink dot
                        audioController.playSweep(700, 1050, 0.1, 'triangle', 0.04)
                        setTimeout(() => audioController.playTone(1245, 0.06, 'sine', 0.03), 110)
                        if (live) burst(e.x, e.y - 6, 3, '#ff9fc4', 1.6)
                        break
                    case 'kid':   // #2203: the agency bell — a bright rising triad and a gold burst at the gate
                        audioController.playTone(659, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(831, 0.07, 'triangle', 0.05), 90)
                        setTimeout(() => audioController.playTone(1047, 0.14, 'triangle', 0.05), 180)
                        if (live) { say('PIP MOVES IN'); burst(e.x, e.y, 12, '#ffd24a', 2.6) }
                        break
                    case 'kid-tumble':   // #2203: the giggle arpeggio — three rising notes, silly tempo
                        audioController.playTone(587, 0.05, 'triangle', 0.045)
                        setTimeout(() => audioController.playTone(740, 0.05, 'triangle', 0.045), 60)
                        setTimeout(() => audioController.playTone(988, 0.08, 'triangle', 0.045), 120)
                        if (live) burst(e.x, e.y - 8, 5, '#ffe6a8', 2.0)
                        break
                    case 'kid-play':   // #2203: a music-box twinkle at the fun things
                        audioController.playTone(1047, 0.06, 'sine', 0.04)
                        setTimeout(() => audioController.playTone(1319, 0.06, 'sine', 0.04), 80)
                        setTimeout(() => audioController.playTone(1568, 0.1, 'sine', 0.04), 160)
                        break
                    case 'kid-eat':   // #2203: a bigger crunch than the kibble — an apple
                        audioController.playFilteredNoise(0.06, 0.04, 1400)
                        setTimeout(() => audioController.playFilteredNoise(0.05, 0.03, 1100), 80)
                        break
                    case 'kid-cry':   // #2203: the wail — a rising-falling saw that nobody ignores
                        audioController.playSweep(660, 990, 0.16, 'sawtooth', 0.045)
                        setTimeout(() => audioController.playSweep(990, 620, 0.22, 'sawtooth', 0.045), 170)
                        if (live) { say('PIP IS CRYING'); burst(e.x, e.y - 12, 4, '#7fd0ff', 1.6) }
                        break
                    case 'step': // #1823: the ground answers the foot — plank creak, crisp gravel, soft lawn
                        if (e.surf === 'floor') audioController.playSweep(175, 118, 0.06, 'triangle', 0.022)
                        else if (e.surf === 'path') audioController.playFilteredNoise(0.045, 0.02, 1800)
                        else audioController.playFilteredNoise(0.05, 0.012, 550)
                        break
                    case 'refuse': // #1823: the ghost cell burns red where the order died
                        audioController.playTone(140, 0.07, 'square', 0.06)
                        audioController.playTone(110, 0.12, 'square', 0.06, 0.09)
                        if (live) refuses.push({ r: e.r, c: e.c, life: 36 })
                        break
                    default: break
                }
            }
        }
        const tilePx = (c) => LOT_X + c * TILE + TILE / 2
        const tilePy = (r) => LOT_Y + r * TILE + TILE / 2

        const burst = (x, y, n, col, spd = 3, kind = 'dot') => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * 6.28, v = spd * (0.4 + Math.random())
                particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 22 + Math.random() * 14, max: 36, col, size: 1.6 + Math.random() * 2.4, kind })
            }
        }
        const sparkles = () => {
            const x = PANEL_X + 56, y = H - 76
            for (let i = 0; i < 5; i++) particles.push({ x: x + (Math.random() - 0.5) * 40, y: y - Math.random() * 8, vx: 0, vy: -0.6, life: 22, max: 22, col: '#ffd24a', size: 1.8, kind: 'flash' })
        }
        // #2076: the make-up pays hearts, not the generic contentment sparkle —
        // the BONDS glyph vocabulary names the beat (pink already in the palette).
        const heartBurst = (x, y) => {
            for (let i = 0; i < 6; i++) {
                const a = Math.random() * 6.28
                particles.push({ x: x + (Math.random() - 0.5) * 12, y: y - 6 - Math.random() * 6, vx: Math.cos(a) * 1.1, vy: -0.9 - Math.random() * 1.1, life: 28 + Math.random() * 10, max: 38, col: i % 2 ? '#ff8fb3' : '#e2574c', size: 2 + Math.random() * 1.4, kind: 'heart' })
            }
        }

        const finish = (s) => {
            if (s.done !== 'win' && s.done !== 'lose') return
            // #1637 batch 17: the street ended under the prover — release the
            // seat silently (a finish is not a hand-back blip; racer rule).
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); s.demo = false }
            overAtRef.current = performance.now()
            if (s.done === 'win') {
                audioController.playSweep(523, 1046, 0.5, 'square', 0.08)
                setTimeout(() => audioController.playSweep(659, 1318, 0.5, 'square', 0.08), 220)
            } else {
                audioController.playSweep(330, 82, 0.7, 'sawtooth', 0.1)
            }
            setEndInfo({ end: s.done, why: s.endMsg, content: s.content, day: s.day, money: s.money })
            setSc('over')
        }

        // ---------------------------------------------------------- pointer ----
        const pointerPx = (px, py) => {
            if (!gs || gs.done || screenRef.current !== 'play' || pausedRef.current) return
            const dd = speedHit(px, py)   // #2227: the dial is always tappable — the pad route to the gears, above every other hit
            if (dd >= 0) { const pv = gs.speed; if (setSpeed(gs, dd)) speedBlip(dd, dd > pv); return }
            if (gs.build) {
                const tb = tabHit(px, py)   // #2222: tap a shelf name to flip
                if (tb >= 0) { if (selectTab(gs, tb)) audioController.playTone(500 + tb * 70, 0.05, 'square', 0.04); return }
                const i = catalogHit(px, py, gs)
                if (i >= 0) { setSel(gs, i); audioController.playTone(640, 0.04, 'square', 0.04); return }
                const t = tileOf(px, py)
                if (!t) return
                const occ = cellItem(gs, t.r, t.c)
                if (occ && occ.id !== 'mail') { sellAt(gs, t.r, t.c); return }
                gs.cursor = t
                place(gs, t.r, t.c)
                return
            }
            const p = gs.people[gs.active]
            // tap a person to switch
            for (const q of gs.people) {
                if (Math.hypot(q.x - px, q.y - py) < 18) {
                    if (gs.people.indexOf(q) !== gs.active) {
                        gs.active = gs.people.indexOf(q)
                        audioController.playTone(760, 0.05, 'triangle', 0.04)
                        say(`${q.name.toUpperCase()} IS YOUR RESIDENT NOW`)
                    }
                    return
                }
            }
            const t = tileOf(px, py)
            if (!t) return
            const it = cellItem(gs, t.r, t.c)
            if (it) {
                if (it.id === 'mail') { if (cmdWork(gs, p)) return; say(p.workedToday ? 'NOT WORK TODAY — IT IS THE WEEKEND' : 'CLOCK IN DURING WORK HOURS'); return }
                if (cmdUse(gs, p, it)) { audioController.playTone(560, 0.04, 'triangle', 0.03); return }
                say('CANNOT REACH THAT')
                return
            }
            // an object whose use-spot was tapped?
            let near = null, bd = 1
            for (const o of gs.items) {
                for (const tg of targetsOf(gs, o)) {
                    const d = Math.hypot(tilePx(tg.c) - px, tilePy(tg.r) - py)
                    if (d < 22 && d < bd + 22) { bd = d; near = o }
                }
            }
            if (near && near.id !== 'mail' && cmdUse(gs, p, near)) { audioController.playTone(560, 0.04, 'triangle', 0.03); return }
            if (near && near.id === 'mail' && cmdWork(gs, p)) return
            if (walkable(gs, t.r, t.c)) cmdWalk(gs, p, t.r, t.c)
        }

        // one tick of player input
        const drivePad = (pad) => {
            if (!gs || gs.done) { prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = !!(pad.pointer && pad.pointer.down); return }
            const p = gs.people[gs.active]
            const dx = (pad.right || heldKeys.right ? 1 : 0) - (pad.left || heldKeys.left ? 1 : 0)
            const dy = (pad.down || heldKeys.down ? 1 : 0) - (pad.up || heldKeys.up ? 1 : 0)
            if ((dx || dy) && !gs.build) manualMove(gs, p, dx, dy, SIM_MS / 1000)
            if (gs.build && (dx || dy)) {
                gs.cursor = { r: Math.max(0, Math.min(12, gs.cursor.r + dy)), c: Math.max(0, Math.min(15, gs.cursor.c + dx)) }
            }
            if (pad.b && !prev.b) { gs.build = !gs.build; audioController.playSweep(gs.build ? 320 : 620, gs.build ? 620 : 320, 0.14, 'square', 0.05) }
            const pdown = !!(pad.pointer && pad.pointer.down)
            if (pdown && !prev.pdown) pointerPx(pad.pointer.x * W, pad.pointer.y * H)
            if (pad.a && !prev.a) {
                if (gs.build) {
                    if (cellItem(gs, gs.cursor.r, gs.cursor.c) && cellItem(gs, gs.cursor.r, gs.cursor.c).id !== 'mail') sellAt(gs, gs.cursor.r, gs.cursor.c)
                    else place(gs, gs.cursor.r, gs.cursor.c)
                } else if (!tryUse(gs, p)) {
                    // #2131: A/Space where no object is near but a person is — the
                    // empty press rides the compliment. A press that used to say
                    // nothing still says nothing unless someone is within reach.
                    // #2171: the compliment no longer lands at press — the pad has
                    // no third button, so the cruel variant rides the same key by
                    // duration: release is the coo (courtTap in onUp), holding
                    // past HOLD_INSULT_MS hurls the insult mid-hold (courtTick).
                    if (!courtHoldArm(gs)) say('NOTHING IN REACH — TAP SOMETHING')
                }
            }
            if (courtQueued && !gs.build) {
                court(gs, courtQueued)   // #2131: C coo / X insult — sound + sparks ride the event queue
                courtQueued = null
            }
            if (switchQueued) { gs.active = (gs.active + 1) % gs.people.length; switchQueued = false; audioController.playTone(720, 0.05, 'triangle', 0.04) }
            if (tabQueued && gs.build) { flipTab(gs, tabQueued); audioController.playTone(gs.tab % 2 ? 460 : 580, 0.05, 'square', 0.04) }   // #2222: shelves flip on the pad route too
            tabQueued = 0
            if (digitPick >= 0) { if (gs.build) { const i = digitCard(gs, digitPick); if (i >= 0) { setSel(gs, i); audioController.playTone(640, 0.04, 'square', 0.04) } } digitPick = -1 }
            if (specialPick) { if (gs.build) { const i = CATALOG.findIndex((d) => d.id === specialPick); if (i >= 0) { setSel(gs, i); audioController.playTone(640, 0.04, 'square', 0.04) } } specialPick = null }
            prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = pdown
        }

        // ------------------------------------------------------------- paint ----
        const paintScene = (g, live) => {
            ctx.clearRect(0, 0, W, H)
            const sx = shake ? (Math.random() - 0.5) * shake : 0
            const sy = shake ? (Math.random() - 0.5) * shake : 0
            ctx.save(); ctx.translate(sx, sy)
            drawGround(ctx, g)
            drawGate(ctx, g.sec)
            drawClouds(ctx, g.sec)
            for (const it of g.items) drawItem(ctx, it, g.sec)
            const order = [...g.people.map((p) => ({ p, v: p.y })), ...(g.visitor ? [{ p: g.visitor, v: g.visitor.y }] : []), ...(g.ivy ? [{ p: g.ivy, v: g.ivy.y }] : []), ...(g.pet ? [{ p: g.pet, v: g.pet.y }] : []), ...(g.kid ? [{ p: g.kid, v: g.kid.y }] : [])].sort((a, b) => a.v - b.v)   // #2143: both neighbours share the lot; #2197: so does the cat; #2203: and the child
            for (const o of order) {
                if (g.pet && o.p === g.pet) { drawPet(ctx, o.p, g.sec); continue }   // #2197: its own sprite, same depth line
                if (g.kid && o.p === g.kid) { drawKid(ctx, o.p, g.sec); continue }   // #2203: Pip on the same depth line
                // #2076: the pair argues and sulks ON screen — storm puff at the
                // crack, a lasting away-lean through the cold war (residents only).
                let fx = null, lean = 0
                const ri = g.people.indexOf(o.p)
                if (ri >= 0 && g.grudge) {
                    fx = g.spatFx > 0 ? 'spat' : 'cold'
                    const other = g.people[ri === 0 ? 1 : 0]
                    lean = o.p.x <= other.x ? -1 : 1
                }
                drawPerson(ctx, o.p, g.sec, g.people[g.active] === o.p, fx, lean)
            }
            if (g.cooFx > 0 && g.cooAt) {
                // #2131: the warm tell — a pixel heart (FAMILY) or gold glint lifts
                // off the pair's midpoint and fades on the real clock.
                const k = g.cooFx / 2.6
                const hx = g.cooAt.x, hy = g.cooAt.y - 18 - (1 - k) * 9
                ctx.globalAlpha = Math.min(1, g.cooFx)
                if (g.cooDeep) {
                    ctx.fillStyle = '#ff7fa8'
                    const px = 2
                    for (const [cx, cy] of [[0, 0], [1, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) ctx.fillRect(hx + (cx - 2) * px, hy + (cy - 1) * px, px, px)
                } else {
                    ctx.fillStyle = '#ffd76a'
                    ctx.fillRect(hx - 1, hy - 4, 2, 8)
                    ctx.fillRect(hx - 4, hy - 1, 8, 2)
                }
                ctx.globalAlpha = 1
            }
            if (live && !g.build && g.cmdCd <= 0) {
                // #2135: the reach tell — a gold ring under whoever C/X (or a held A)
                // will address, so the word is legible BEFORE it is spoken.
                const t = courtTarget(g)
                if (t) {
                    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(g.sec * 5)
                    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.ellipse(t.p.x, t.p.y + 9, 13, 4.5, 0, 0, Math.PI * 2); ctx.stroke()
                    ctx.globalAlpha = 1
                }
            }
            if (live && g.holdT >= 0) {
                // #2171: the heat tell — angry ticks climb over the addressed
                // person's head while A is held; a closed arc is a word mid-flight.
                const t = courtTarget(g)
                if (t) {
                    const k = Math.min(1, g.holdT / HOLD_INSULT_MS)
                    ctx.globalAlpha = 0.45 + 0.55 * k
                    ctx.fillStyle = '#e23b2e'
                    const n = 3 + Math.round(k * 5)
                    for (let i = 0; i < n; i++) {
                        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.45
                        ctx.fillRect(Math.round(t.p.x + Math.cos(a) * 12) - 1, Math.round(t.p.y - 16 + Math.sin(a) * 8) - 1, 2, 2)
                    }
                    ctx.globalAlpha = 1
                }
            }
            if (sayB.life > 0) drawSay(ctx, sayB)   // #2135: the spoken line rides above the pair
            if (live && g.build) drawBuildCursor(ctx, g, placeOk(g, g.cursor.r, g.cursor.c))
            for (const f of refuses) {   // #1823: refused cell — red fill pulsing out
                const k = f.life / 36
                ctx.globalAlpha = 0.45 * k
                ctx.fillStyle = '#e23b2e'
                ctx.fillRect(LOT_X + f.c * TILE + 1, LOT_Y + f.r * TILE + 1, TILE - 2, TILE - 2)
                ctx.globalAlpha = k
                ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 2
                ctx.strokeRect(LOT_X + f.c * TILE + 1, LOT_Y + f.r * TILE + 1, TILE - 2, TILE - 2)
                ctx.globalAlpha = 1
            }
            ctx.restore()
            nightTint(ctx, g.hour, g.ext)
            drawTopBar(ctx, g)
            drawPanel(ctx, g, g.sec)
            drawThoughts(ctx, g)
            if (g.build) drawCatalog(ctx, g)
            if (g.fastT > 0) {
                ctx.fillStyle = 'rgba(18,24,38,0.5)'
                ctx.fillRect(0, H / 2 - 26, W, 52)
                ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                ctx.fillText('· · · AT WORK · · ·', W / 2, H / 2)
            }
            if (toast > 0 && live) banner(ctx, toastMsg)
            stepParticlesDraw(sx, sy)   // #2149: last layer — a make-up at the centre column had its hearts buried under the MADE UP card for their whole life; keep riding the shake offset the save-block used to carry
        }

        const stepParticlesDraw = (ox = 0, oy = 0) => {
            for (const pt of particles) {
                ctx.globalAlpha = Math.max(0, pt.life / pt.max)
                if (pt.kind === 'flash') {
                    ctx.fillStyle = pt.col
                    ctx.fillRect(pt.x + ox, pt.y + oy, pt.size * 1.6, pt.size * 1.6)
                } else if (pt.kind === 'heart') {
                    // #2076: the BONDS heart, tiny — two lobes and a point
                    const s = pt.size
                    ctx.fillStyle = pt.col
                    ctx.beginPath()
                    ctx.arc(pt.x + ox - s * 0.45, pt.y + oy - s * 0.25, s * 0.5, Math.PI, 0)
                    ctx.arc(pt.x + ox + s * 0.45, pt.y + oy - s * 0.25, s * 0.5, Math.PI, 0)
                    ctx.lineTo(pt.x + ox, pt.y + oy + s * 0.75)
                    ctx.closePath(); ctx.fill()
                } else {
                    ctx.fillStyle = pt.col
                    ctx.beginPath(); ctx.arc(pt.x + ox, pt.y + oy, pt.size, 0, 7); ctx.fill()
                }
            }
            ctx.globalAlpha = 1
        }

        const banner = (c, text, small = false) => {
            c.textAlign = 'center'; c.textBaseline = 'middle'
            const y = H / 2 - 90
            c.font = `bold ${small ? 14 : 20}px monospace`
            const w = c.measureText(text).width + 34
            c.fillStyle = 'rgba(28,36,54,0.88)'
            c.fillRect(W / 2 - w / 2, y - 14, w, 30)
            c.strokeStyle = '#ffd24a'; c.lineWidth = 1
            c.strokeRect(W / 2 - w / 2 + 0.5, y - 13.5, w - 1, 29)
            c.fillStyle = '#ffe9a8'; c.fillText(text, W / 2, y + 1)
        }

        const paintAttract = () => {
            if (!canvas) return
            paintScene(demoG, false)
        }

        // -------------------------------------------------------------- loop ----
        const stepParticles = (dtMs = 16) => {
            for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.kind === 'flash' ? 0.02 : 0.14; pt.life-- }
            particles = particles.filter((pt) => pt.life > 0)
            for (const f of refuses) f.life--
            for (let i = refuses.length - 1; i >= 0; i--) if (refuses[i].life <= 0) refuses.splice(i, 1)
            if (shake > 0) shake = Math.max(0, shake - 0.6)
            if (toast > 0) toast--
            // #2238 fix: this line read `ft`, a const that lives inside frame()
            // — once ANY banner lit sayB, every frame threw and the canvas froze
            // while the banner (undecaying) lived forever. Found by the paper
            // banner; the landmine predates it (#2135). Take the frame's dt.
            if (sayB.life > 0) sayB.life = Math.max(0, sayB.life - dtMs / 1000)   // #2135: real-clock fade, like the toast
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            // #2227: the dial answers even while the world stands still — these
            // consumptions sit ABOVE the step multiplier on purpose; swallow them
            // below it and pause would eat the very keys meant to release it.
            if (gs && screenRef.current === 'play') {
                if (speedPick !== null) {
                    const pv = gs.speed
                    const v = Math.max(0, Math.min(SPEED_MULT.length - 1, speedPick - 1))
                    if (setSpeed(gs, v)) speedBlip(v, v > pv)
                    speedPick = null
                }
                if (speedCycled) {
                    const pv = gs.speed
                    if (cycleSpeed(gs, speedCycled)) speedBlip(gs.speed, gs.speed > pv)
                    speedCycled = 0
                }
            }
            acc += ft
            while (acc >= SIM_MS) {
                acc -= SIM_MS
                // #2227: the gear buys extra WORLD steps per frame tick — one
                // driver, one fixed dt; gear 0 (pause) simply buys none.
                const steps = SPEED_MULT[screenRef.current === 'attract' ? (demoG ? demoG.speed : 1) : (gs ? gs.speed : 1)]
                for (let sp = 0; sp < steps; sp++) {
                if (screenRef.current === 'attract') {
                    autoStep(demoG, SIM_MS / 1000)
                    handleEvents(demoG, false)
                    // #2227: the marquee teaches the dial — the demo hurries the
                    // morning chores stretch and eases back, the panel pip riding
                    // along. No cue tone here: attract runs before the audio unlock.
                    const want = attractSpeed(demoG)
                    if (want !== demoG.speed) demoG.speed = want
                    if (demoG.done) demoG = freshDemo()
                } else if (screenRef.current === 'play' && gs && !gs.done) {
                    if (!contractHoldsLoop()) {
                        // #1637 batch 17 WATCH: the seat is autoStep — bot + advance,
                        // the exact call the attract demo runs and peoplecheck's
                        // WINNABLE section grants the wish with. It re-decides from
                        // LIVE state every tick; drivePad rests while it holds.
                        const actA = actQueued, buildB = buildQueued
                        actQueued = false; buildQueued = false
                        if (watchingRef.current) autoStep(gs, SIM_MS / 1000)
                        else {
                            drivePad({ left: heldKeys.left, right: heldKeys.right, up: heldKeys.up, down: heldKeys.down, a: actA, b: buildB })
                            advance(gs, SIM_MS / 1000)
                        }
                        // #2171: the thumb-court clock — a held A that outlives the
                        // threshold hurls the insult now, whatever seat drives the street.
                        const hc = courtTick(gs, SIM_MS)
                        if (hc && hc.refused) say('NOT SO FAST — LET IT LAND')
                        handleEvents(gs, true)
                        finish(gs)
                    }
                }
                }
                stepParticles(ft)
            }
            if (screenRef.current === 'attract') paintAttract()
            else if (gs) paintScene(gs, screenRef.current === 'play')
        }

        // ------------------------------------------------------------- start ----
        const freshDemo = () => { const d = newRun((Date.now() >>> 5) ^ 0x5eed); return d }

        const startPlay = (sd) => {
            if (sd !== undefined) seed = sd >>> 0
            else {
                // #1473: honor ?seed=N so a filed report replays this exact street
                const pin = seedFromQuery()
                if (pin != null) seed = pin >>> 0
            }
            watchingRef.current = false; setWatching(false) // #1637 a new street starts in your hands
            gs = newRun(seed)
            particles = []; shake = 0; toast = 0; refuses.length = 0
            sayB.life = 0   // #2135: no stale bubble across streets
            prev.left = prev.right = prev.up = prev.down = prev.a = prev.b = prev.pdown = false
            actQueued = buildQueued = switchQueued = false; digitPick = -1; courtQueued = null
            tabQueued = 0; specialPick = null   // #2222
            speedPick = null; speedCycled = 0   // #2227: a new street moves in at normal
            setEndInfo(null)
            setSc('play')
            audioController.playSweep(262, 523, 0.24, 'square', 0.07)
        }

        // -------------------------------------------------------------- input ----
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question' || code === 'Escape' || code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (e.code === 'Tab') e.preventDefault()
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                // #1637: Y from the marquee starts the run AND seats the prover.
                if (isWatchKey(e)) { startPlay(); watchingRef.current = true; setWatching(true); playWatchStart(); return }
                startPlay(); return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'Enter' || e.code === 'KeyR') { seed = nextSeed(seed); startPlay() }
                else setSc('attract')
                return
            }
            if (pausedRef.current || sc !== 'play') return
            // #1637 batch 17: Y seats the attract autopilot (KeyY is free here —
            // this game has no vi-keys); any driving key hands the street back,
            // shared blips both ways. Releasing clears s.demo so the autonomy
            // stops with the seat — it is the seat's, not the house's.
            if (isWatchKey(e)) {
                e.preventDefault()
                watchingRef.current = !watchingRef.current; setWatching(watchingRef.current)
                if (watchingRef.current) playWatchStart()
                else { if (gs) gs.demo = false; playWatchStop() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); if (gs) gs.demo = false; playWatchStop() }
            if (CUR.l.includes(e.code)) heldKeys.left = true
            if (CUR.r.includes(e.code)) heldKeys.right = true
            if (CUR.u.includes(e.code)) heldKeys.up = true
            if (CUR.d.includes(e.code)) heldKeys.down = true
            if (ACTION_KEYS.has(e.code)) actQueued = true
            if (BUILD_KEYS.has(e.code)) buildQueued = true
            if (COURT_KEYS.has(e.code)) courtQueued = e.code === 'KeyC' ? 'coo' : 'insult'   // #2131
            if (SWITCH_KEYS.has(e.code)) switchQueued = true
            if (ROOM_KEYS.has(e.code)) specialPick = 'roomkit'   // #2222: counter keys ride setSel so the shelf follows
            if (PET_KEYS.has(e.code)) specialPick = 'petkit'   // #2197
            if (KID_KEYS.has(e.code)) specialPick = 'kidkit'   // #2203
            if (/^Digit[1-9]$/.test(e.code)) digitPick = parseInt(e.code.slice(5), 10)   // #2222: digits pick within the open shelf
            if (e.code === 'BracketLeft') tabQueued = -1   // #2222: flip shelves
            if (e.code === 'BracketRight') tabQueued = 1
            if (e.code === 'Comma') speedCycled = -1   // #2227: , / . walk the dial down/up in every mode
            if (e.code === 'Period') speedCycled = 1
            // #2227: the original's number-key binding — outside buy mode the
            // digits drive the dial; inside, they keep the #2222 card law.
            if (/^Digit[1-4]$/.test(e.code) && gs && !gs.build) speedPick = parseInt(e.code.slice(5), 10)
        }
        const onUp = (e) => {
            if (CUR.l.includes(e.code)) heldKeys.left = false
            if (CUR.r.includes(e.code)) heldKeys.right = false
            if (CUR.u.includes(e.code)) heldKeys.up = false
            if (CUR.d.includes(e.code)) heldKeys.down = false
            // #2171: the tap half of the thumb court — let go before the heat
            // peaks and the press lands as the compliment. A release with no
            // armed hold says nothing (courtTap returns null), so random keys
            // and the death screen stay quiet.
            if (ACTION_KEYS.has(e.code) && gs && screenRef.current === 'play' && !pausedRef.current && !gs.done && gs.speed > 0) {   // #2227: a paused world takes no orders
                const t = courtTap(gs)
                if (t && t.refused) say('NOT SO FAST — LET IT LAND')
            }
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                setSc('attract'); return
            }
            if (sc !== 'play' || pausedRef.current || !canvas || e.target !== canvas) return
            // #1637: a tap on the lot means you want the wheel — hand back.
            // (The WATCH pill stopPropagations its press; this is the canvas.)
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); if (gs) gs.demo = false; playWatchStop(); return }
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            pointerPx((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H)
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            if (!canvas) return
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min((r.width - 8) / W, (r.height - 8) / H)
            canvas.style.width = `${Math.max(1, Math.floor(W * s))}px`
            canvas.style.height = `${Math.max(1, Math.floor(H * s))}px`
        }
        window.addEventListener('resize', resize)

        demoG = freshDemo()
        buildCanvas()
        raf = requestAnimationFrame(frame)
        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({
            tick: gs ? gs.tick : 0,
            score: gs ? gs.content : 0,
            done: gs ? gs.done || false : false,
            seed: gs ? gs.seed : seed,
            money: gs ? gs.money : 0,
            day: gs ? gs.day : 1,
        }))

        // ------------------------------------------------------------ hooks ----
        function state() {
            return {
                tick: gs.tick, score: gs.content, done: gs.done || false, seed: gs.seed,
                speed: gs.speed,   // #2227: the dial is part of the contract view too
                money: gs.money, content: gs.content, day: gs.day, hour: Math.round(gs.hour * 10) / 10,
                items: gs.items.length, visitors: (gs.visitor ? 1 : 0) + (gs.ivy ? 1 : 0), ext: gs.ext,   // #2143: the lot can hold two neighbours
                hero: [Math.round(gs.people[gs.active].x), Math.round(gs.people[gs.active].y)], cursor: [gs.cursor.r, gs.cursor.c],
                needs: Object.fromEntries(gs.people.map((p) => [p.name, Object.fromEntries(NEEDS.map((n) => [n, Math.round(p.needs[n] * 100) / 100]))])),
                hash: stateHash(gs),
            }
        }

        if (import.meta.env.DEV) {
            window.__homebodyTest = {
                probe: () => gs ? ({
                    screen: screenRef.current, tick: gs.tick, done: gs.done, content: gs.content, money: gs.money,
                    day: gs.day, hour: Math.round(gs.hour * 10) / 10, build: gs.build, sel: gs.sel, tab: gs.tab,   // #2222: the open shelf
                    speed: gs.speed, speedName: SPEED_NAMES[gs.speed],   // #2227: the dial
                    demo: gs.demo,
                    people: gs.people.map((p) => ({ name: p.name, x: Math.round(p.x), y: Math.round(p.y), needs: { ...p.needs }, working: p.working, fainted: p.faintT > 0, mealTaken: p.mealTaken })),
                    items: gs.items.map((it) => ({ id: it.id, r: it.r, c: it.c })),
                    ext: gs.ext,
                    rel: { house: gs.rel.house, fern: gs.rel.fern, ivy: gs.rel.ivy },   // #2143: third meter
                    spats: gs.spats, grudge: gs.grudge, spatFx: Math.round(gs.spatFx * 10) / 10,   // #2070/#2076
                    cmdCd: Math.round(gs.cmdCd * 10) / 10, cooFx: Math.round(gs.cooFx * 10) / 10, cooDeep: !!gs.cooDeep,   // #2131
                    courtKind: (() => { const t = courtTarget(gs); return t ? t.k : null })(), active: gs.active,
                    holdT: Math.round(gs.holdT), courtArmed: gs.holdT >= 0,   // #2171: the thumb court
                    visitor: gs.visitor ? gs.visitor.name : null,
                    ivy: gs.ivy ? { name: gs.ivy.name, gift: !!gs.ivy.gift, state: gs.ivy.state, x: Math.round(gs.ivy.x), y: Math.round(gs.ivy.y) } : null,   // #2143
                    pet: gs.pet ? { name: gs.pet.name, r: gs.pet.r, c: gs.pet.c, state: gs.pet.state, asleep: gs.pet.asleep, needs: { ...gs.pet.needs }, cd: Math.round(gs.pet.cd * 10) / 10, x: Math.round(gs.pet.x), y: Math.round(gs.pet.y) } : null,   // #2197
                    kid: gs.kid ? { name: gs.kid.name, r: gs.kid.r, c: gs.kid.c, state: gs.kid.state, asleep: gs.kid.asleep, needs: { ...gs.kid.needs }, cd: Math.round(gs.kid.cd * 10) / 10, x: Math.round(gs.kid.x), y: Math.round(gs.kid.y) } : null,   // #2203
                    paper: gs.paper ? { r: gs.paper.r, c: gs.paper.c } : null, paperDay: gs.paperDay,   // #2238: the route
                    meal: gs.meal ? { r: gs.meal.r, c: gs.meal.c, name: gs.mealName } : null, mealDay: gs.mealDay, mealSlot: gs.mealSlot, mealSerial: gs.mealSerial, mealEaten: gs.mealEaten.length,   // #2244: the bells
                }) : { screen: screenRef.current, seed },
                // #1637 watchcheck pilot drives these.
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                start: (sd) => startPlay(sd),
                tap: (px, py) => pointerPx(px, py),
                press: (code) => onDown({ code, preventDefault: () => {} }),
                release: (code) => onUp({ code }),   // #2171: the release half of the thumb-court gesture
                room: () => (gs ? buildRoom(gs) : false),
                adopt: () => (gs ? adoptPet(gs) : false),   // #2197: the counter, straight
                adoptOk: () => (gs ? adoptOk(gs) : false),
                kid: () => (gs ? adoptKid(gs) : false),   // #2203: the child counter, straight
                kidOk: () => (gs ? adoptKidOk(gs) : false),
                win: () => { if (gs) { gs.content = WIN_CONTENT; gs.done = 'win'; gs.endMsg = 'forced' } },
                collapseAll: () => { if (gs) for (const p of gs.people) p.faintT = 2 },
                money: (v) => { if (gs) gs.money = v },
                select: (i) => { if (gs) setSel(gs, i) },   // #2222: the shelf follows the pick
                bond: (k, v) => { if (gs && gs.rel[k] !== undefined) gs.rel[k] = v },
                ringIvy: () => { if (gs) { gs.ivyAfter = Math.min(gs.ivyAfter, Math.floor(gs.hour)); gs.ivyGap = 0 } return 'Ivy rings soon' },   // #2143
                ringMeal: () => { if (gs) { if (gs.meal) { gs.items = gs.items.filter((x) => x !== gs.meal); gs.meal = null; gs.mealEaten = [] } if (gs.mealSlot >= 3) { gs.mealSlot = 0; scheduleMeals(gs) } const sl = gs.mealSlot; gs.mealAfter[sl] = Math.max(Math.floor(gs.hour), gs.hour - MEAL_WINDOW + 0.05) } return 'a bell is due' },   // #2244: ring any bell now (scenario setup, like ringIvy) — retires whatever plate sits so the taps order the fresh one, and the window opens wide even if the clock passed the slot
                ivyHome: () => { if (gs && gs.ivy) { gs.ivy.state = 'leaving'; gs.ivy.path = null } },   // #2143: rig the next visit (scenario setup, like park/foul)
                // #2070: rig the spat scenario — park the pair beside each
                // other, both in the red; `thaw` lifts their tempers up.
                foul: () => { if (gs) { const [a, b] = gs.people; a.r = 3; a.c = 3; b.r = 3; b.c = 4; b.path = null; for (const p of gs.people) { for (const n of NEEDS) p.needs[n] = 0.3; p.working = false; p.faintT = 0 } gs.grudge = 0; gs.spatCd = 0; gs.spats = 0 } },   // the rigged spat counts as the run's first — earlier organic barbs in a long drive are clock noise, not the law
                park: () => { if (gs) { const [a, b] = gs.people; a.r = 3; a.c = 3; a.path = null; b.r = 3; b.c = 4; b.path = null; a.x = LOT_X + 3 * TILE + TILE / 2; a.y = LOT_Y + 3 * TILE + TILE / 2; b.x = LOT_X + 4 * TILE + TILE / 2; b.y = LOT_Y + 3 * TILE + TILE / 2; for (const p of gs.people) { p.use = null; p.goal = null; p.working = false; p.faintT = 0; for (const n of NEEDS) p.needs[n] = 0.5 } gs.visitor = null; gs.ivy = null; gs.cmdCd = 0; gs.spats = 0; gs.spatCd = SPAT_CD } },   // #2131/#2143/#2149: adjacency, idle for real, tempers NEUTRAL (mood 1: no organic spat, no instant make-up — the law itself is pinned in peoplecheck), nobody else to address, cooldown ready — and the SPRITES land where the logic was parked (#2149: cells without pixels left the pair standing apart, so make-up hearts burst at the stale midpoint, where the MADE UP toast card paints over them). #2244: the spat counter and its cooldown re-arm too — a long drive may have collected organic barbs upstream, and the gates downstream assert the rigged one is the run's first
                thaw: () => { if (gs) for (const p of gs.people) for (const n of NEEDS) p.needs[n] = 0.9 },
                stand: (who, r, c) => { if (gs) { const p = gs.people[who]; p.r = r; p.c = c; p.path = null; p.use = null; p.goal = null; p.working = false; p.x = LOT_X + c * TILE + TILE / 2; p.y = LOT_Y + r * TILE + TILE / 2 } },   // #2171: park() seats the pair by the radio — the thumb-court drive needs a cell with a clear hand
                hearts: () => particles.filter((pt) => pt.kind === 'heart').length,   // #2076: the make-up paid hearts?
                hash: () => (gs ? stateHash(gs) : 0),
            }
            exposeGame({
                id: 'homebody',
                method: 'pointer',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reads: ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'pointer'],
                reset: (sd) => { seed = (sd >>> 0) || 1; startPlay(seed); return state() },
                tick: (pad) => {
                    if (gs && !gs.done) {
                        drivePad(pad || {})
                        advance(gs, SIM_MS / 1000)
                        handleEvents(gs, false)
                        finish(gs)
                    }
                },
                state,
                canvas: () => canvas,
            })
            mountDbg({
                title: 'HOMEBODY',
                getState: () => gs ? [
                    `d${gs.day} ${gs.hour.toFixed(1)}h §${gs.money} wish ${gs.content}/${WIN_CONTENT} items=${gs.items.length} build=${gs.build}${gs.visitor ? ' Fern!' : ''}${gs.ivy ? ` Ivy${gs.ivy.gift ? '🧺' : ''}!` : ''}${gs.pet ? ' 🐈 Miso' : ''}${gs.kid ? ' ★ Pip' : ''} ⏱${SPEED_NAMES[gs.speed]}`,   // #2227: the dial reads here
                    gs.people.map((p) => `${p.name}:${NEEDS.map((n) => Math.round(p.needs[n] * 100)).join('/')}${p.working ? ' @work' : ''}${p.faintT > 0 ? ' FAINT' : ''}`).join('  '),
                ] : ['attract'],
                actions: [
                    { label: 'GIVE §500', run: () => { if (gs) gs.money += 500; return 'rent money' } },
                    { label: 'BUILD ROOM', run: () => { if (gs && !gs.ext) { gs.money = Math.max(gs.money, EXT_ROOM.price); buildRoom(gs) } return gs && gs.ext ? 'spare room up — the lot grew' : 'already built / no sim' } },
                    { label: 'ADOPT CAT', run: () => { if (gs && !gs.pet) { gs.money = Math.max(gs.money, PET.price); adoptPet(gs) } return gs && gs.pet ? 'Miso trots in through the gate' : 'already home / no sim' } },   // #2197
                    { label: 'ADOPT KID', run: () => { if (gs && !gs.kid) { gs.money = Math.max(gs.money, KID.price); adoptKid(gs) } return gs && gs.kid ? 'Pip moves in through the gate' : 'already home / no sim' } },   // #2203
                    { label: 'GRANT WISH', run: () => { if (gs) { gs.content = WIN_CONTENT } return 'wish banked — next content tick wins' } },
                    { label: 'RING FERN', run: () => { if (gs) { gs.visitAfter = Math.min(gs.visitAfter, Math.floor(gs.hour)); gs.visitGap = 0 } return 'the bell rings soon' } },
                    { label: 'RING IVY', run: () => { if (gs) { gs.ivyAfter = Math.min(gs.ivyAfter, Math.floor(gs.hour)); gs.ivyGap = 0 } return 'Ivy swings by soon' } },   // #2143
                { label: 'DROP PAPER', run: () => { if (gs) { gs.paperDay = -1; gs.paperAfter = Math.min(gs.paperAfter, Math.floor(gs.hour)) } return gs ? 'the route is due — news hits the step' : 'no sim' } },   // #2238
                { label: 'DROP MEAL', run: () => { if (gs) { if (gs.mealSlot >= 3) { gs.mealSlot = 0; scheduleMeals(gs) } const sl = gs.mealSlot; if (gs.hour < gs.mealAfter[sl]) gs.mealAfter[sl] = Math.floor(gs.hour) } return gs ? 'the bell is due — food hits the kitchen (unless one is already out)' : 'no sim' } },   // #2244
                    { label: 'DIAL PAUSE', run: () => { if (gs) setSpeed(gs, 0); return gs ? `dial ${SPEED_NAMES[gs.speed]} — the world stands still` : 'no sim' } },   // #2227
                    { label: 'DIAL FASTEST', run: () => { if (gs) setSpeed(gs, 3); return gs ? `dial ${SPEED_NAMES[gs.speed]} — the world hurries` : 'no sim' } },   // #2227
                    { label: 'NEW SEED', run: () => { seed = nextSeed(seed); startPlay(); return `reseeded ${seed}` } },
                ],
            })
        }

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__homebodyTest) delete window.__homebodyTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            if (canvas) canvas.remove()
        }
    }, [])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/45 flex flex-col items-center justify-end pb-24 text-center px-6 pointer-events-none">
                    <h1 className="text-5xl font-black mb-2 tracking-wide" style={{ color: '#ffd24a', textShadow: '3px 3px 0 #2c5aa0, 0 8px 22px #000' }}>HOMEBODY</h1>
                    <p className="font-mono text-[11px] text-sky-100/70 mb-4 tracking-widest">A LITTLE SUBURBAN LIFE SIM</p>
                    <AttractMessage className="mb-4 text-amber-50/85" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                    <p className="font-mono text-[11px] font-bold tracking-widest text-amber-100/60 mt-3">{WATCH_ATTRACT_HINT}</p>
                </div>
            )}

            {screen === 'over' && endInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${endInfo.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`} style={{ textShadow: '2px 2px 0 #000' }}>
                        {endInfo.end === 'win' ? 'LIFETIME WISH GRANTED' : 'THE HOUSEHOLD FELL APART'}
                    </h2>
                    <p className="text-base mb-1">{endInfo.end === 'win' ? 'A happy, humming little home — yours.' : endInfo.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">day {endInfo.day} · content {endInfo.content} · §{endInfo.money}</p>
                    <p className="text-sm text-amber-100/80 mb-4">R moves into a new lot · any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {/* #1637 batch 17 — the attract brain tends the street; any input takes over. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'HOMEBODY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '⚒', code: 'KeyB' }} />
        </div>
    )
}

export default HomebodyGame

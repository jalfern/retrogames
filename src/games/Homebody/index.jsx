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
    wingPick, GARDEN, eastWing, DEFAULT_ANCHOR, wingGeom, wingSets,   // #2689: the kit's site law, for the ghost, the button and the view · #2752: the drive rig asks the standing wing for its floorboards
    archetypeOf,   // #2736: rooms with a personality — the probe reads the room's own name
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork,   // #2470: tryUse moved to tryUseOrQueue below
    cmdQueue, queueCancel, queuePromote, orderBusy, tryUseOrQueue,   // #2470: the action queue — append while busy, cancel by chip; #2474 item 3: promote by pull
    WORK_START, WORK_END,   // #2470: the mail order is only queued while the window is honestly open
    place, sellAt, cellItem, targetsOf, walkable, manualMove, placeOk, buildRoom, buildRoomOk,
    adoptPet, adoptOk, PET,   // #2197: the cat counter
    adoptKid, adoptKidOk, KID,   // #2203: the child counter
    setSel, flipTab, selectTab, digitCard,   // #2222: catalog shelves
    SPEED_MULT, SPEED_NAMES, setSpeed, cycleSpeed, attractSpeed,   // #2227: the speed dial
    court, courtTarget,   // #2131: player-ordered romance commands
    courtReach, courtPickSet,   // #2235: choose your court target — tap a shared-ring person
    cmdGoSay, goSayTarget, COURT_REACH,   // #2683: go-say — tap someone far and the word walks over
    farCycle,   // #2708 tail 5: the desktop far-tap — T cycles the ear, C says it
    courtHoldArm, courtTick, courtTap, HOLD_INSULT_MS,   // #2171: thumb court — one pad button, two orders
    scheduleMeals, MEAL_WINDOW, SPAT_CD,   // #2244: the meal bells — the F1 cheat re-seeds today's hours
    MEAL_TIMBRE, sharedChord, nightLevel,   // #2264: per-bell motifs, the rotating table chord, one night curve
    ringTruck, ICE_TIMBRE, ICE_ENDINGS, CONE_PRICE, coneOrderOk,   // #2503: the ice-cream truck — the jingle table, the price, the order gate, the F1/harness ring (ICE_ENDINGS: #2508 item 2, the call varies)
    ringSneak, SNEAK_CREEP, SNEAK_SIREN, SNEAK_TAKE_SFX,   // #2520: the sneak — creep motif, siren, thunk, the F1/harness ring
    ringProwl, PROWL_PADS, PROWL_HOME_SFX,   // #2532: Miso's even-night prowl — soft pads, the home chirp, the F1/harness ring
    DEF, yarnOrderOk,   // #2256: the yarn ball — cat-only piece, honest refusal on tap
    binOrderOk,   // #2303: the bin — the lot's chore, honest refusal out of season
    NEED_HINT,   // #2253: the amber prompt names the fix
    VISIT_TIMBRE, REL_EDGES,   // #2240: each neighbour owns a call motif + entrance footfalls; FAMILY tier for scenario legs
    QUEUE_TIMBRE, QUEUE_TIMBRE_FALLBACK,   // #2474: per-glyph append timbres — the chip you hear names the errand
    stateHash,
} from './sim.js'
import {
    drawGround, drawGate, drawItem, drawPerson, nightTint, drawPanel, drawTopBar,
    drawIceTruck, TRUCK_W,   // #2508 item 1: the truck gets wheels — the view-side arrival and drive-off
    drawCurbKids, crowdKids,   // #2508 item 5: the crowd at the truck — draw-only kids, day-arithmetic count
    drawCatalog, catalogHit, tabHit, speedHit, drawBuildCursor, drawWingGhost, drawThoughts, drawClouds,   // #2227: speedHit — the dial's tap route; #2689: drawWingGhost — the kit's site preview
    drawPet,   // #2197: Miso
    drawKid,   // #2203: Pip
    drawSay,   // #2135: the spoken-word bubble over the pair
    PAIR_HUES,   // #2599: the pair's own hues for pair-spoken bubbles
    promiseTell, earReact, drawGardenLamp, LOST_RING_T,   // #2688: the promise told in motion + the garden's night lamp
    drawPurposeView, sleepingCells, drawMoonlitWait,   // #2705: the purpose view — ripeness bed, harvest hamper, lodged panes, moonlit wait
    drawRoomBadges, roomBadges,   // #2736: rooms with a personality — the study book / playroom star at the door · #2743: the probe asks the same derivation
    pauseLedger,   // #2713 tail 4: the rooms' tallies read on the pause sheet
    pairStride, strollTrail, drawStrollTrail,   // #2618: the stroll stride, the route tell, the walk sell
    drawGroundGift, bondRows, jarRow,   // #2240: the set-down basket + the BONDS rows as data · #2729: the jar row too
    queueHit,   // #2470: the queue chips' tap route (shares the painter's geometry)
    QCELL,   // #2474 item 3: the chip pitch — the drag threshold derives from it
    queueGlyphFor,   // #2474: the chip glyph from an event id — one source for paint and timbre
    chipHover,   // #2474 item 2: the name-reveal hit route (mouse hover + held thumb)
    chipCollapse, chipCollapseArm, COLLAPSE_FRAMES,   // #2474 item 4: the row-collapse beat (view-only register)
} from './art.js'

const SIM_MS = FIXED_DT
const MESSAGES = [
    'Two residents, five needs, one little house. You are the voice in their heads.',
    'Tap a fridge, a bed, the TV — they walk over and use it. Feed them, rest them.',
    'When a resident turns AMBER, the lot says what they need — tap the named object before the red alarm.',
    'The mailbox pays the bills on workdays. § buys furniture to raise the home.',
    'THE LOT GROWS TWICE — Spare Room kit one rises on the east lawn (point at a row to choose where); Pip\'s morning paper round fills the garden jar, and a full jar raises the cottage out back.',
    'Morning brings the paper — the boy sweeps past and today\'s edition waits on the step. Tap it for a laugh.',
    'THE BELLS RING THREE TIMES A DAY — a warm plate waits by the kitchen. Tap to eat; eat together and BONDS rise.',
    'GARBAGE DAY EVERY THIRD DAY — the eve says WHEEL IT OUT, dawn sends the truck. Miss the curb and the lot gets skipped.',
    'THE ICE CREAM MAN PASSES EVERY AFTERNOON — when the jingle comes, a cone waits at the curb (§2 from the till). Tap it before the truck moves on.',
    'THE SNEAK WALKS ODD NIGHTS AT ELEVEN — odd nights at 23:00 a dark coat tries the gate for a loose ornament (a plant, a rug, a lamp). A Burglar Alarm (§90, SPECIAL) turns him at the post.',
    'MISO PROWLS EVEN NIGHTS AT ELEVEN — on even days the cat slips out at 23:00, walks the lot and is home by midnight. Her prowl pays purrs, never pennies.',
    'Fern the neighbour wanders in by day — chat fills the blue bar.',
    'CHAT builds BONDS — Fern at FAMILY visits sooner and lingers. Neglect cools them.',
    'Ivy shops the market — chat grows HER bond too. At FRIENDS she brings a basket; FAMILY adds honey-money.',
    'FERN AND IVY MIND THEIR OWN BUSINESS — a shared afternoon climbs their NEIGH bond, and friends chat deeper.',
    'WHILE THEY TALK THE PAIR WANDERS THE LOT — a long chat takes laps of the lawn; follow it if you want an ear.',
    'A guest WATCHED but never HEARD sours — leave one neighbour waiting too long and the pair SPAT. Absence cools it, meeting again mends it.',
    'Order the court on glass: tap ✓ for the kind word — hold ✓ on someone and the insult flies.',
    'Red needs flare tempers — a SPAT cracks BONDS. Fill both, side by side, to thaw.',
    'Bank §300, then B + R: hammer on a Spare Room and the lot grows.',
    'Buy mode has SHELVES — [ and ] flip HOME / FUN / DECOR / SPECIAL; tap a shelf name on the phone.',
    'THE CLOCK IS YOURS — keys 1-4 set the speed dial (|| ▶ ▶▶ ▶▶▶), or tap SPEED in the panel.',
    'SAY THE KIND THING — C coos, X cuts. The gold ring under a visitor shows who will hear you.',
    'WHEN THE RING IS CROWDED — tap a person in reach. They hear your next words until they step away.',
    'SOMEONE ACROSS THE LOT — tap Fern, Ivy or Pip from afar: your resident walks it over and says the kind thing on arrival.',
    'Adopt a child for §150 — K opens the counter. Pip scampers, snackes, plays and tumbles.',
    'A lonely Pip cries and the whole house feels it. Nearby family, toys and a cozy corner keep the giggles coming.',
    'MISO WANTS A GAME — buy the Yarn Ball (§60, FUN shelf) and tap it: your resident dangles, the tabby pounces, BONDS climb.',
    'Bank 80 contentment and the lifetime wish comes true.',
]
// #2599 item 3: the attract sells the pair on its OWN copy beat — the index of
// the NEIGH marquee line, derived from the text so a reordered marquee can never
// silently drift the hook away from the copy it stages.
const NEIGH_MARQUEE = MESSAGES.findIndex((m) => m.startsWith('FERN AND IVY'))
// #2618 item 4: the same trick on the WALK line — deriving the index from the
// copy keeps the staging glued to the sentence it sells.
const STROLL_MARQUEE = MESSAGES.findIndex((m) => m.startsWith('WHILE THEY TALK'))
const PRESS = 'TAP / PRESS ANY KEY TO MOVE IN'
// #2143: bond-key → name, for the toast lines (three points on the triangle now).
const BONDER = { house: 'HOUSEHOLD', fern: 'FERN', ivy: 'IVY', kid: 'PIP', neigh: 'NEIGHBOURS' }   // #2203: the child rows a bond; #2588: so do the neighbours between themselves

const CUR = { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'] }
const MOVE_KEYS = new Set([...CUR.l, ...CUR.r, ...CUR.u, ...CUR.d])
const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter'])
const BUILD_KEYS = new Set(['KeyB'])
const COURT_KEYS = new Set(['KeyC', 'KeyX'])   // #2131: coo / insult
const SWITCH_KEYS = new Set(['KeyG', 'Tab'])
const EAR_KEYS = new Set(['KeyT'])   // #2708 tail 5: cycle the ear the keyboard addresses (Tab stays the resident switch)
const ROOM_KEYS = new Set(['KeyR'])
const PET_KEYS = new Set(['KeyP'])   // #2197: pounce on the adoption card
const KID_KEYS = new Set(['KeyK'])   // #2203: key K to the child counter
const KEY_SET = new Set([...MOVE_KEYS, ...ACTION_KEYS, ...BUILD_KEYS, ...COURT_KEYS, ...SWITCH_KEYS, ...EAR_KEYS, ...ROOM_KEYS, ...PET_KEYS, ...KID_KEYS, ...'123456789'])

const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

const HomebodyGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    // #2713 tail 4: the pause sheet's ledger row-set, snapshotted the moment
    // '?' seats the sheet — a paused world doesn't tick, so the snapshot IS the
    // live truth (the tick guard early-returns while pausedRef holds).
    const [ledgerSnap, setLedgerSnap] = useState(null)
    const [endInfo, setEndInfo] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 batch 17: the attract brain runs the street
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const watchingRef = useRef(false)
    const overAtRef = useRef(0)
    const marqueeIx = useRef(0)   // #2599 item 3: the attract copy line currently on screen

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        let canvas = null, ctx = null
        let raf = 0, last = 0, acc = 0
        let gs = null, demoG = null
        let neighBeatRung = null   // #2599 item 3: the demo run whose gate Ivy was rung into, if any
        let seed = 20261023
        let particles = [], shake = 0
        const refuses = []   // #1823: red ghost-cell flashes on refused placements
        // #2135: the spoken-word bubble — quoted lines lift over the pair, not just the log.
        const sayB = { text: '', x: 0, y: 0, life: 0, hues: null }
    const lostRing = { x: 0, y: 0, t: 0 }   // #2688 tail 2: the ring dying — grey flicker where an errand folded
        const showSay = (s2, e) => { const t = s2.thoughts[0]; if (t) { sayB.text = t.text; sayB.x = e.x ?? W / 2; sayB.y = e.y ?? H / 2; sayB.life = 4.2; sayB.hues = e.t === 'neigh' || e.who === 'neigh' ? PAIR_HUES : null } }   // #2599: pair lines wear the pair
        let neighSulks = 0   // #2599 handoff 1: storm-puff window over the pair at the crack (real seconds, view-only)
        let neighWave = 0, neighPrevD = 99   // #2599 item 2: meet-up greeting beat + last frame's pair ring distance (view-only; the sim never hears of it)
        let stridePrevWalk = false   // #2618 item 2: last painted frame had BOTH guests mid-path (view-only)
        let neighArrive = 0         // #2618 item 2: the settle beat after a lap lands — faces hold on each other
        let strollFx = 0, strollDots = null   // #2618 item 3: the route tell — first cells of the lead's path, riding the fire tick
        let strollBeatRung = null   // #2618 item 4: the demo run whose STROLL beat rang Ivy, if any
        let toastMsg = '', toast = 0
        // #2474 items 2+4: the view-only chip layer. collapseCache arms the row-
        // collapse ghosts (Map<personIndex, {glyphs, rest, t}>); hoverReveal is the
        // name the pointer rests on (mouse) or a thumb held past HOLD_NAME_MS over
        // the inert NOW cell (pending chips keep cancel-at-press — items 2+3 must
        // not collide with the pinned #2470 law). None of this touches the sim.
        const collapseCache = new Map()
        let qPrevSnap = null   // #2474 item 4: last frame's pending-glyph lists, to spot the ones that left
        const HOLD_NAME_MS = 420
        let mouseHover = null
        let pressName = null   // { x, y, t0, revealed } — the held-thumb clock
        let hoverReveal = null
        let kitPreview = null   // #2704 tail 5: geometry of the wing the pointer is merely HOverING on a kit card — the ghost arrives before the pick
        const prev = { left: false, right: false, up: false, down: false, a: false, b: false, pdown: false }
        const heldKeys = { left: false, right: false, up: false, down: false }
        let actQueued = false, buildQueued = false, switchQueued = false
        let tabQueued = 0         // #2222: [ / ] pending shelf flip
        let specialPick = null    // #2197/#2203: R/K ids route through the shelf now
        let courtQueued = null    // #2131: 'coo' | 'insult' pending from C/X
        let earHint = null        // #2708 tail 5: the ear KeyT last chose ('' between presses) — view state, the sim never hears of it
        let digitPick = -1        // #2222: digit picks within the open shelf
        let speedPick = null      // #2227: digits 1-4 outside buy mode set the dial
        let speedCycled = 0       // #2227: , / . cycle the dial in every mode
        // #2508 item 1: the jingle now has a body — the truck ROLLS in along the
        // curb row (~2 s), parks at the cone, and drives off east when the stop is
        // spent (~4 s, past the last sale to the window's end). View-only: the sim
        // law is untouched and the truck is draw-only, so it is non-solid by
        // construction — nobody ever gets fenced in. Timed in sim-seconds like every
        // other sprite (pause freezes the roll); the paint tick polls cone presence,
        // so restores and any missed event still self-heal into the drive-off.
        const ICE_TRUCK_IN_S = 2, ICE_TRUCK_OUT_S = 4
        const ICE_TRUCK_Y = H - 46   // on the street below the fence — nearest thing to the camera, so it paints last
        const iceTruck = { phase: 'off', px: 0, from: 0, parked: 0, t0: 0, jingle: 'A' }
        // #2508 item 5: while the truck parks, a small CROWD of neighbourhood
        // kids gathers at the counter (the original's hot-afternoon tell). The
        // crowd is paint and probe state only — no sim entity, no payout, no
        // path. It arms when the wheels stop (including the restore snap-park),
        // jogs home west when the truck rolls east, and rides sim-seconds so
        // pause freezes it with the truck.
        const ICE_KID_FLEE_S = 1.6
        const iceCrowd = { phase: 'off', t0: 0, day: 0 }
        // #2508 item 2: the call varies and SWELLS — iceVol reads the truck's live
        // progress toward its curb spot, so early notes are round-the-corner quiet
        // and the bar that lands at the curb plays full. Distance-based, view-only.
        const ICE_VOL_FAR = 0.022, ICE_VOL_NEAR = 0.06
        const iceVol = () => {
            if (iceTruck.phase !== 'in') return ICE_VOL_NEAR   // parked/at rest: the curb is right here
            const span = iceTruck.parked + TRUCK_W + 8
            const k = span > 0 ? Math.max(0, Math.min(1, (iceTruck.px + TRUCK_W + 8) / span)) : 1
            return ICE_VOL_FAR + (ICE_VOL_NEAR - ICE_VOL_FAR) * k
        }
        const iceTruckRollOut = (sim) => {
            if (iceTruck.phase === 'in' || iceTruck.phase === 'parked') { iceTruck.from = iceTruck.px; iceTruck.t0 = sim ? sim.sec : 0; iceTruck.phase = 'out' }
        }
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
                    case 'amber':   // #2253: the worried colour — one gentle line, naming the fix, while the need is still saveable
                        audioController.playTone(500, 0.07, 'triangle', 0.04)
                        if (live) say(`${e.name.toUpperCase()} IS ${e.need.toUpperCase()} — ${NEED_HINT[e.need].toUpperCase()}`)
                        break
                    case 'place': audioController.playTone(200, 0.09, 'square', 0.06); if (live) burst(tilePx(e.c), tilePy(e.r) + 16, 8, '#c9b48a', 2.6); break
                    case 'sell': audioController.playSweep(420, 180, 0.12, 'square', 0.05); break
                    // #2470: the queue speaks — every append, cancel, honest drop and
                    // full-list refusal lands with its own sound and line.
                    case 'queued': {
                        // #2474: per-glyph append — the panel's own icon language,
                        // audible (QUEUE_TIMBRE played verbatim, #2240 pattern)
                        const qtb = QUEUE_TIMBRE[queueGlyphFor(e.id)] || QUEUE_TIMBRE_FALLBACK
                        qtb.forEach(([f, d, ms]) => { if (ms) setTimeout(() => audioController.playTone(f, d, 'triangle', 0.03), ms); else audioController.playTone(f, d, 'triangle', 0.03) })
                        if (live) say(`QUEUED ${DEF[e.id] ? DEF[e.id].name.toUpperCase() : e.id === 'work' ? 'WORK' : e.id === 'walk' ? 'WALK' : String(e.id).toUpperCase()}`)
                        break
                    }
                    case 'queue-cancel': audioController.playTone(320, 0.05, 'square', 0.03); if (live) say('ORDER CANCELLED'); break
                    case 'queue-promote':   // #2474 item 3: the chip you pulled left steps up to the front of the line
                        audioController.playTone(520, 0.04, 'triangle', 0.04)
                        audioController.playTone(780, 0.05, 'triangle', 0.04, 0.055)
                        if (live) say(`${DEF[e.id] ? DEF[e.id].name.toUpperCase() : e.id === 'work' ? 'WORK' : e.id === 'walk' ? 'WALK' : String(e.id).toUpperCase()} ORDERED NEXT`)
                        break
                    case 'queue-drop':
                        audioController.playTone(240, 0.08, 'sawtooth', 0.04)
                        if (live) say(`${e.name.toUpperCase()} CAN NO LONGER DO THAT`)
                        break
                    case 'queue-full':
                        audioController.playTone(210, 0.06, 'square', 0.05)
                        audioController.playTone(180, 0.09, 'square', 0.05, 0.08)
                        if (live) say('THREE DEEP — THAT IS THE LINE')
                        break
                    case 'work-go': audioController.playSweep(260, 620, 0.3, 'square', 0.06); if (live) say(`${e.name.toUpperCase()} LEAVES FOR WORK`); break
                    case 'pay': audioController.playTone(880, 0.06, 'triangle', 0.05); audioController.playTone(1175, 0.06, 'triangle', 0.05); audioController.playTone(1568, 0.1, 'triangle', 0.05); if (live) say(`PAYDAY  §${e.pay}`); break
                    case 'visit':   // #2143/#2240: each neighbour owns a motif — her call AND her footfalls
                        {
                            const tb = VISIT_TIMBRE[e.name] || VISIT_TIMBRE.Fern
                            tb.call.forEach(([f, d, ms]) => { if (ms) setTimeout(() => audioController.playTone(f, d, 'sine', 0.06), ms); else audioController.playTone(f, d, 'sine', 0.06) })
                            tb.steps.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'triangle', 0.03), ms))
                            if (live) say(e.name === 'Ivy' ? 'IVY AT THE GATE' : 'THE NEIGHBOUR RINGS')
                        }
                        break
                    case 'visit-end': audioController.playSweep(520, 300, 0.2, 'sine', 0.04); break
                    case 'paper':   // #2238: the route arrives — newsprint flutter and a chalk-bright drop on the step
                        audioController.playNoise(0.14, 0.05); audioController.playTone(330, 0.05, 'triangle', 0.03)
                        if (live) { say('THE PAPER BOY SWEEPS PAST'); burst(tilePx(e.c), tilePy(e.r) + 14, 6, '#efe9d8', 2) }
                        break
                    case 'meal': {   // #2244/#2264: the bell rings — each bell owns its motif (#2240's VISIT_TIMBRE pattern), cream steam puff at the plate
                        const tb = MEAL_TIMBRE[e.slot] || MEAL_TIMBRE[0]
                        tb.call.forEach(([f, d, ms]) => { if (ms) setTimeout(() => audioController.playTone(f, d, 'sine', 0.055), ms); else audioController.playTone(f, d, 'sine', 0.055) })
                        if (live) { say(`${e.name} BELL — FOOD ON THE COUNTER`); burst(tilePx(e.c), tilePy(e.r) + 10, 6, '#efe9d8', 1.8) }
                        break
                    }
                    case 'meal-shared': {   // #2244/#2264: the whole table came — the chord rotates by plate, hearts over the eater cluster (the sim anchors x/y where the forks landed)
                        const ch = sharedChord(e.serial)
                        ch.forEach(([f, d], i) => setTimeout(() => audioController.playTone(f, d, 'triangle', 0.05), i * 90))
                        if (live) { say('SHARED TABLE ♥'); heartBurst(e.x, e.y - 12) }
                        break
                    }
                    case 'meal-cold':   // #2244/#2264: nobody came to the table — a soft, sad low, and the cold is SEEN: a grey puff settles on the spot, crumbs where the plate was (the storm-puff doctrine)
                        audioController.playSweep(392, 262, 0.24, 'triangle', 0.04)
                        if (live) { say('THE MEAL WENT COLD'); burst(tilePx(e.c), tilePy(e.r) + 12, 7, '#9a958a', 1.4); burst(tilePx(e.c), tilePy(e.r) + 20, 4, '#d9d2bc', 0.8) }
                        break
                    case 'bin-eve':   // #2303: the eve announces itself — the lot keeps its rhythm
                        audioController.playTone(392, 0.06, 'square', 0.035)
                        setTimeout(() => audioController.playTone(330, 0.1, 'square', 0.035), 110)
                        if (live) say('GARBAGE TOMORROW — WHEEL OUT THE BIN')
                        break
                    case 'bin-out':   // #2303: the chore lands — two low thumps and a rumble on the gravel
                        audioController.playTone(140, 0.06, 'triangle', 0.05)
                        audioController.playTone(110, 0.09, 'triangle', 0.045, 0.07)
                        audioController.playFilteredNoise(0.08, 0.03, 300)
                        if (live) say(`${e.name.toUpperCase()} WHEELS THE BIN OUT`)
                        break
                    case 'garbage-collected':   // #2303: the truck takes it — bright ding, gold glints at the curb
                        audioController.playTone(988, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(1318, 0.16, 'triangle', 0.05), 100)
                        if (live) { say('THE TRUCK TAKES IT — CLEAN LOT'); burst(e.x, e.y - 6, 8, '#ffd24a', 2) }
                        break
                    case 'garbage-skipped':   // #2303: the truck drove past — the miss is SEEN: grey puff at the empty curb (the cold-plate doctrine)
                        audioController.playSweep(330, 196, 0.3, 'triangle', 0.04)
                        if (live) { say('THE TRUCK PASSED US BY'); burst(tilePx(e.c), tilePy(e.r) + 10, 7, '#9a958a', 1.4) }
                        break
                    case 'ice-truck': {   // #2503: the jingle rolls down the street — a music-box motif plays the table verbatim, pastel glints at the curb
                        // #2508 item 2: the call varies per pass (two ending bars on alternating
                        // passes) and each note's gain rides iceVol — quiet round the corner,
                        // swelling toward the curb. iceSerial was stamped before the event fired,
                        // so +1 puts the street's very first pass on ending A.
                        ICE_TIMBRE.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'triangle', iceVol()), ms))
                        iceTruck.jingle = (s.iceSerial + 1) % 2 === 0 ? 'A' : 'B'
                        ICE_ENDINGS[iceTruck.jingle === 'A' ? 0 : 1].forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'triangle', iceVol()), ms))
                        iceTruck.parked = LOT_X + e.c * TILE - 44   // #2508 item 1: the body follows the jingle — wheels up at the west edge, roll in to the cone
                        iceTruck.from = iceTruck.px = -(TRUCK_W + 8); iceTruck.t0 = s.sec; iceTruck.phase = 'in'
                        if (live) { say('THE ICE CREAM MAN COMES'); burst(tilePx(e.c), tilePy(e.r) + 8, 8, '#ffd9e8', 2) }
                        break
                    }
                    case 'ice-cream':   // #2503: the cone changed hands — a bright pop and a heart where it was caught
                        audioController.playTone(1046, 0.06, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(1318, 0.12, 'triangle', 0.05), 70)
                        iceTruckRollOut(s)   // #2508 item 1: one cone per stop — the stop is spent, the truck drives off empty (its own words, now its own wheels)
                        if (live) { say(`${e.name.toUpperCase()} GOT A CONE ♥`); heartBurst(e.x, e.y - 12) }
                        break
                    case 'kid-ice':   // #2503: the child beat the melting clock — the giggle climbs an octave higher than the adult's pop
                        audioController.playTone(1318, 0.05, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(1568, 0.05, 'triangle', 0.05), 60)
                        setTimeout(() => audioController.playTone(2093, 0.14, 'triangle', 0.05), 120)
                        iceTruckRollOut(s)   // #2508 item 1: same law for the kid's catch — the truck leaves when its tray is empty
                        if (live) { say(`${e.name.toUpperCase()} CHASED THE TRUCK DOWN ♥`); heartBurst(e.x, e.y - 12) }
                        break
                    case 'ice-drip':   // #2508 item 3: a melt tick — the cone in hand loses a drop (the countdown's arithmetic, not a rule)
                        audioController.playTone(1760, 0.035, 'sine', 0.022)
                        if (live) burst(e.x, e.y - 10, 2, '#cfe8ff', 1)
                        break
                    case 'ice-gone':   // #2503: the truck moved on — a falling jingle tail and a pastel puff at the empty curb (the cold-plate doctrine, at ice-cream scale)
                        audioController.playSweep(880, 523, 0.28, 'triangle', 0.04)
                        iceTruckRollOut(s)   // #2508 item 1: the window closed on unsold cones — it still rolls, it no longer vanishes
                        if (live) { say('THE TRUCK MOVED ON'); burst(tilePx(e.c), tilePy(e.r) + 8, 6, '#ffd9e8', 1.4) }
                        break
                    case 'sneak-in': {   // #2520: boots on the gravel — three falling low steps, near-silent. The lot sleeps; the view keeps watch.
                        SNEAK_CREEP.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'triangle', 0.03), ms))
                        if (live) { say('SOMEONE IS ON THE LOT'); burst(tilePx(e.c), tilePy(e.r) + 10, 6, '#3c3348', 1.6) }
                        break
                    }
                    case 'sneak-take':   // #2520: an armful leaving — a low thunk, a short shake, and the banner names what the lot lost
                        SNEAK_TAKE_SFX.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'square', 0.05), ms))
                        if (live) { shake = 4; say(`THE SNEAK TOOK THE ${(DEF[e.id]?.name || e.id).toUpperCase()}`); burst(tilePx(e.c), tilePy(e.r) + 8, 8, '#7a2e28', 2.2) }
                        break
                    case 'sneak-empty':   // #2520: nothing loose, nothing lifted — a dry little shrug of a note
                        audioController.playTone(196, 0.12, 'triangle', 0.03)
                        if (live) say('HE FOUND NOTHING TO TAKE')
                        break
                    case 'sneak-scared': {   // #2520: the answer — the tin siren wakes the street and the dark coat turns at the gate post
                        SNEAK_SIREN.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'square', 0.05), ms))
                        if (live) { say('THE ALARM SCARES HIM OFF'); burst(tilePx(5), tilePy(12) + 10, 8, '#ff5a46', 2) }
                        break
                    }
                    case 'sneak-gone':   // #2520: the night keeps its secret — a soft falling sweep as he melts past the gate
                        audioController.playSweep(262, 147, 0.34, 'triangle', 0.03)
                        if (live) say('THE LOT SLEEPS ON')
                        break
                    case 'prowl-out':   // #2532: even nights the cat keeps the lot — three soft pads and an amber watch
                        PROWL_PADS.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'sine', 0.025), ms))
                        if (live) { say('MISO IS OUT ON THE LOT'); burst(tilePx(e.c), tilePy(e.r) + 8, 5, '#ffb347', 1.6) }
                        break
                    case 'prowl-home':   // #2532: home by midnight — the little way home, up two notes, into the loaf
                        PROWL_HOME_SFX.forEach(([f, d, ms]) => setTimeout(() => audioController.playTone(f, d, 'sine', 0.03), ms))
                        if (live) say('MISO IS HOME FOR THE NIGHT')
                        break
                    case 'gift':   // #2143: the market basket lands — warm arpeggio, gold glints
                        audioController.playTone(523, 0.07, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(659, 0.07, 'triangle', 0.05), 90)
                        setTimeout(() => audioController.playTone(880, 0.14, 'triangle', 0.05), 180)
                        if (live) { say(e.money ? `IVY BRINGS A GIFT — §${e.money}` : 'IVY BRINGS A GIFT ♥'); sparkles() }
                        break
                    case 'gift-land':   // #2240: the basket is SET DOWN — a soft low thunk, distinct from every bell here, plus a dust puff
                        audioController.playTone(150, 0.07, 'triangle', 0.05)
                        audioController.playTone(95, 0.12, 'triangle', 0.045, 0.06)
                        audioController.playFilteredNoise(0.05, 0.025, 420)
                        if (live) { burst(e.x, e.y + 6, 5, '#c9b48a', 1.6); if (e.honey) say('IVY LEFT HONEY BY THE TILL') }
                        break
                    case 'route': {   // #2721: Pip's round comes home — a coin pair and gold pips at the gate
                        audioController.playTone(880, 0.05, 'square', 0.045)
                        setTimeout(() => audioController.playTone(1319, 0.09, 'square', 0.045), 70)
                        if (live) { say(`PIP'S ROUND — §${e.cash} INTO THE GARDEN JAR (${e.jar}/${GARDEN.price})`); burst(tilePx(5), tilePy(12) + 8, 5, '#ffd24a', 1.9) }
                        break
                    }
                    case 'harvest': {   // #2695: the garden ripens — green-and-gold glints at the south door, plucky triad
                        audioController.playTone(587, 0.06, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(784, 0.06, 'triangle', 0.05), 80)
                        setTimeout(() => audioController.playTone(988, 0.12, 'triangle', 0.05), 160)
                        if (live) { say(`THE GARDEN RIPENS — HERBS ${gs.wings.reduce((a, w) => a + (w.herbs || 0), 0)}`); burst(tilePx(e.c), tilePy(e.r) + 8, 6, '#7ec850', 1.8) }
                        break
                    }
                    case 'lodged':   // #2695: morning in the wing — a soft sunrise pair, no burst (the joy is quiet)
                        audioController.playTone(392, 0.08, 'sine', 0.04)
                        setTimeout(() => audioController.playTone(523, 0.16, 'sine', 0.04), 110)
                        if (live) say(`${e.name.toUpperCase()} SLEPT WELL IN THE WING`)
                        break
                    case 'studied': {   // #2736: the study pays — two thoughtful plucks, lamp amber on the book
                        audioController.playTone(494, 0.07, 'triangle', 0.045)
                        setTimeout(() => audioController.playTone(659, 0.14, 'triangle', 0.045), 90)
                        if (live) { say(`THE ${(e.room || 'study').toUpperCase()} PAYS — INSIGHTS ${gs.wings.reduce((a, w) => a + (w.insights || 0), 0)}`); burst(tilePx(e.c) + 8, tilePy(e.r) + 8, 5, '#d9b23c', 1.8) }   // #2743: the banner names the room that paid
                        break
                    }
                    case 'kid-laugh':   // #2736: the playroom pays — the giggle arpeggio at the room's own toy, star gold
                        audioController.playTone(659, 0.05, 'triangle', 0.045)
                        setTimeout(() => audioController.playTone(880, 0.05, 'triangle', 0.045), 55)
                        setTimeout(() => audioController.playTone(1175, 0.09, 'triangle', 0.045), 110)
                        if (live) { say(`THE ${(e.room || 'playroom').toUpperCase()} GIGGLES — DELIGHTS ${gs.wings.reduce((a, w) => a + (w.delights || 0), 0)}`); burst(e.x, e.y - 8, 6, '#ffd24a', 2.2) }   // #2743: the banner names the room that paid
                        break
                    case 'room-named': {   // #2743: the room puts on its name — a bright discovery pair at the doorstep, sparkles in the badge's colour
                        audioController.playTone(523, 0.06, 'sine', 0.05)
                        setTimeout(() => audioController.playTone(784, 0.14, 'sine', 0.05), 90)
                        if (live) { say(`THIS ROOM IS A ${e.kind.toUpperCase()}`); burst(LOT_X + e.c * TILE + 8, LOT_Y + e.r * TILE + 8, 6, e.kind === 'study' ? '#d9b23c' : '#ffd24a', 2.0) }
                        break
                    }
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
                        if (e.who === 'neigh') neighSulks = 2.4   // #2599 handoff 1: the guests' crack gets the #2076 puff too
                        if (live) { say(e.who === 'neigh' ? 'FERN AND IVY SPAT!' : 'OTTO AND MIRA SPAT!'); burst(e.x, e.y, 12, '#e23b2e', 3.0); showSay(s, e) }   // #2604: the pair's crack names the pair
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
                        if (live) { say(e.who === 'neigh' ? 'THE NEIGHBOURS MADE UP ♥' : 'MADE UP ♥'); if (e.who === 'neigh') pairSparkle(e.x, e.y - 12); else heartBurst(e.x, e.y - 12); showSay(s, e) }   // #2076: hearts, named by the BONDS glyph; #2604: pair reunions name themselves; #2599 handoff 3: pair reunions sparkle twin-leaf teal
                        break
                    case 'mediate': // #2672: the kid broke it up — two soft notes, a small pair sparkle, the line in pair hues
                        audioController.playTone(659, 0.08, 'triangle', 0.04)
                        setTimeout(() => audioController.playTone(880, 0.12, 'triangle', 0.04), 110)
                        if (live) { say(`${e.med === 'kid' ? 'PIP' : 'MISO'} BROKE IT UP ♥`); pairSparkle(e.x, e.y - 12); showSay(s, e) }
                        break
                    case 'chat': // #2135: the neighbours talk ON screen now — a soft murmur, then the bubble
                        audioController.playTone(e.k === 'ivy' ? 494 : 523, 0.05, 'sine', 0.03)
                        setTimeout(() => audioController.playTone(e.k === 'ivy' ? 392 : 415, 0.07, 'sine', 0.03), 70)
                        if (live) showSay(s, e)
                        break
                    case 'neigh': // #2588: two guests, two voices — a warmer pair-murmur and a bubble
                        audioController.playTone(587, 0.05, 'triangle', 0.03)
                        setTimeout(() => audioController.playTone(440, 0.08, 'triangle', 0.03), 70)
                        if (live) showSay(s, e)
                        break
                    case 'neigh-stroll': // #2611: the pair takes its gossip for a lap — teal pips, soft two-note
                        audioController.playTone(330, 0.05, 'triangle', 0.02)
                        setTimeout(() => audioController.playTone(392, 0.07, 'triangle', 0.02), 90)
                        if (live) { say('FERN AND IVY TAKE A WALK'); burst(e.x, e.y, 4, '#4fae5f', 1.8) }
                        // #2618 item 3: the route, named before feet hit it — the
                        // first cells of Fern's path light as fading teal dots for
                        // the walk's first breath (draw-only, both streets).
                        strollDots = strollTrail(s.visitor && s.visitor.path)
                        strollFx = 2.5
                        break
                    case 'coo': // #2131: the compliment — a warm two-note and gold glints
                        audioController.playTone(659, 0.06, 'triangle', 0.05)
                        setTimeout(() => audioController.playTone(831, 0.12, 'triangle', 0.05), 80)
                        if (live) { say(e.k === 'fern' ? 'A WORD FOR FERN ♥' : e.k === 'ivy' ? 'A WORD FOR IVY ♥' : e.k === 'kid' ? 'A WORD FOR PIP ♥' : 'A WORD FOR YOUR BETTER HALF ♥'); burst(e.x, e.y - 10, 5, '#ffe6a8', 2.2, 'flash'); showSay(s, e) }
                        break
                    case 'go-say': // #2683: the fire itself rings through the coo event; an errand that lost its ear is felt honestly
                        if (e.stage === 'lost') {
                            audioController.playSweep(420, 300, 0.12, 'triangle', 0.04)
                            if (live) say(`${e.name.toUpperCase()} — THE WORD WILL HAVE TO WAIT`)
                            const q = s.people.find((pp) => pp.name === e.name)   // #2688 tail 2: the ring dies where the errand folded
                            if (live && q) { lostRing.x = q.x; lostRing.y = q.y; lostRing.t = LOST_RING_T }
                        }
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
                        if (live) { say(e.w === 'garden' ? 'GARDEN ROOM BUILT — THE BACK LAWN FILLS IN' : 'SPARE ROOM BUILT — THE LOT GROWS'); burst(e.w === 'garden' ? LOT_X + 2 * TILE : LOT_X + 13 * TILE, e.w === 'garden' ? LOT_Y + 9 * TILE : LOT_Y + 4 * TILE, 14, '#c9b48a', 2.8) }
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
                    case 'pet-play':   // #2256: the yarn session — three bat-flips and a pink twinkle
                        audioController.playSweep(620, 900, 0.06, 'triangle', 0.045)
                        setTimeout(() => audioController.playSweep(760, 1050, 0.06, 'triangle', 0.045), 90)
                        setTimeout(() => audioController.playSweep(900, 1245, 0.07, 'triangle', 0.04), 190)
                        if (live) burst(e.x, e.y - 6, 5, '#ff9fc4', 1.8)
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
        // #2599 handoff 3: pair reunions tell from household ones at a glance —
        // twin teal leaves (the NEIGH glyph in flight) where hearts would rise.
        const pairSparkle = (x, y) => {
            for (let i = 0; i < 6; i++) {
                const a = Math.random() * 6.28
                particles.push({ x: x + (Math.random() - 0.5) * 12, y: y - 6 - Math.random() * 6, vx: Math.cos(a) * 1.1, vy: -0.9 - Math.random() * 1.1, life: 28 + Math.random() * 10, max: 38, col: i % 2 ? '#3aa08a' : '#7fd0c0', size: 2.2 + Math.random() * 1.2, kind: 'leaf' })
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
        // #2474 item 3: DRAG-TO-FRONT (The Sims 1, pull a queued chip to the
        // head). Pressing a chip ARMS it; the tap spends itself on LIFT — no
        // travel means the historic cancel, pulling the chip left past one
        // chip-pitch promotes it to next-in-line instead. qi 0 has no front to
        // pull to, so its press still rides the plain cancel.
        let chipDrag = null   // { pi, qi, x0, y0, moved }
        const chipLift = () => {
            if (!chipDrag) return
            const qh = chipDrag
            chipDrag = null
            if (qh.moved || !gs || gs.done || pausedRef.current || screenRef.current !== 'play') return
            queueCancel(gs, gs.people[qh.pi], qh.qi)
        }
        const chipDragMove = (px, py) => {
            if (!chipDrag || chipDrag.moved) return
            const dx = px - chipDrag.x0, dy = py - chipDrag.y0
            // Jon #2495 option B: the chip must reach the HEAD slot (the row's
            // first chip cell, pitch-shifted by the chip's index), with a slop
            // so a slipping thumb-tap never promotes by accident.
            const headEdge = chipDrag.x0 - chipDrag.qi * (QCELL.cw + QCELL.gap) + QCELL.cw
            if (px <= headEdge && dx <= -(QCELL.cw + QCELL.gap) / 2 && Math.abs(dx) >= Math.abs(dy)) {
                chipDrag.moved = true
                if (chipDrag.qi > 0 && gs && !gs.done) queuePromote(gs, gs.people[chipDrag.pi], chipDrag.qi)
            }
        }
        const pointerPx = (px, py) => {
            if (!gs || gs.done || screenRef.current !== 'play' || pausedRef.current) return
            const dd = speedHit(px, py)   // #2227: the dial is always tappable — the pad route to the gears, above every other hit
            if (dd >= 0) { const pv = gs.speed; if (setSpeed(gs, dd)) speedBlip(dd, dd > pv); return }
            const qh = queueHit(gs, px, py)   // #2470: the queue chips sit in the panel column — a chip tap cancels that order and spends the tap
            if (qh) {
                if (qh.qi === 0) { queueCancel(gs, gs.people[qh.pi], qh.qi); return }   // the head chip has no front to pull to
                chipDrag = { pi: qh.pi, qi: qh.qi, x0: px, y0: py, moved: false }
                return
            }
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
            // #2235: choose your court target. When others share your reach ring,
            // a tap on one of them makes that person the preferred addressee — the
            // word you order from the ring goes to them until they leave the ring
            // (sim.js courtTick owns the expiry). Only the contested crowd case
            // spends the tap; solo taps keep the switch and walk idioms untouched.
            for (const c of courtReach(gs)) {
                if (Math.hypot(c.p.x - px, c.p.y - py) < 18 && courtPickSet(gs, c.k)) {
                    audioController.playTone(880, 0.05, 'triangle', 0.04)
                    say(`${c.p.name.toUpperCase()} WILL HEAR YOU`)
                    return
                }
            }
            // #2683: choose WHICH TWO share the ring — a tap on Fern, Ivy or Pip
            // from across the lot sends your resident walking and the coo lands
            // the tick they meet (sim.js goSayArrive owns the arrival law). A
            // busy resident lists it like any errand (#2470); same-ring taps keep
            // the historic pick/walk idioms untouched.
            for (const kk of ['fern', 'ivy', 'kid']) {
                const v = goSayTarget(gs, kk)
                if (!v || Math.hypot(v.x - px, v.y - py) >= 18) continue
                if (Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= COURT_REACH) break   // in reach: the old idioms keep the tap
                if (p.owner === 'human' && orderBusy(gs, p)) {
                    if (cmdQueue(gs, p, { kind: 'gosay', k: kk })) {
                        audioController.playTone(740, 0.05, 'triangle', 0.04)
                        say(`${v.name.toUpperCase()} WILL HEAR IT LATER — LISTED`)
                        return
                    }
                    break   // queue full — the queue-full event speaks its own line
                }
                if (cmdGoSay(gs, p, kk)) {
                    audioController.playTone(740, 0.05, 'triangle', 0.04)
                    say(`WALKING IT OVER — ${v.name.toUpperCase()} WILL HEAR YOU`)
                    return
                }
                say('CANNOT REACH THAT')
                return
            }
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
                if (it.id === 'mail') {
                    if (cmdWork(gs, p)) return
                    // #2470: busy but the window is open and the day is theirs — the
                    // clock-in waits on the list instead of being lost to the tap.
                    if (p.owner === 'human' && orderBusy(gs, p) && !p.workedToday && p.worksOn === gs.day % 2 && gs.hour >= WORK_START && gs.hour < WORK_END - 1
                        && cmdQueue(gs, p, { kind: 'work' })) return
                    say(p.workedToday ? 'NOT WORK TODAY — IT IS THE WEEKEND' : 'CLOCK IN DURING WORK HOURS'); return
                }
                if (DEF[it.id] && DEF[it.id].catOnly) {   // #2256: the ball answers honestly without a cat
                    if (!gs.pet) say('NO CAT ON THE LOT'); else if (!yarnOrderOk(gs)) say('MISO IS NOT FEELING IT'); else { /* falls through to cmdUse */ }
                    if (!yarnOrderOk(gs)) return
                }
                if (DEF[it.id] && DEF[it.id].binOnly) {   // #2303: the bin answers honestly out of season
                    if (!binOrderOk(gs)) {
                        say(gs.binAt === 'curb' ? 'THE BIN IS AT THE CURB'
                            : (gs.day + 1 === gs.collectionDay ? 'WHEEL IT OUT THIS EVENING — BEFORE DARK' : 'NO COLLECTION TONIGHT — THE TRUCK KEEPS ITS RHYTHM'))
                        return
                    }
                }
                if (DEF[it.id] && DEF[it.id].truckOnly) {   // #2503: the cone answers honestly — no truck, or no money for the treat
                    if (!coneOrderOk(gs)) { say(gs.cone ? `THE TILL IS SHORT OF §${CONE_PRICE} FOR A CONE` : 'THE TRUCK IS NOT ON THE STREET'); return }
                }
                if (p.owner === 'human' && orderBusy(gs, p)) {   // #2470: an errand in flight keeps flying — this tap joins the list (queue-full speaks its own line)
                    cmdQueue(gs, p, { kind: 'use', it })
                    return
                }
                if (cmdUse(gs, p, it)) { audioController.playTone(560, 0.04, 'triangle', 0.03); say(`✓ ${it.id === 'mail' ? 'WORK' : (it.name || 'OBJECT').toUpperCase()}`); return }   // #2253: the tap answers back
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
            if (near && near.id !== 'mail') {
                if (p.owner === 'human' && orderBusy(gs, p)) { cmdQueue(gs, p, { kind: 'use', it: near }); return }   // #2470: busy — the spot-tap joins the list
                if (cmdUse(gs, p, near)) { audioController.playTone(560, 0.04, 'triangle', 0.03); return }
            }
            if (near && near.id === 'mail') {
                if (cmdWork(gs, p)) return
                if (p.owner === 'human' && orderBusy(gs, p) && !p.workedToday && p.worksOn === gs.day % 2 && gs.hour >= WORK_START && gs.hour < WORK_END - 1
                    && cmdQueue(gs, p, { kind: 'work' })) return   // #2470: clock in as soon as they're free
                return
            }
            if (walkable(gs, t.r, t.c)) {
                if (p.owner === 'human' && orderBusy(gs, p)) { cmdQueue(gs, p, { kind: 'walk', r: t.r, c: t.c }); return }   // #2470: busy — the walk joins the list
                cmdWalk(gs, p, t.r, t.c)
            }
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
            else if (pdown && chipDrag) chipDragMove(pad.pointer.x * W, pad.pointer.y * H)   // #2474 item 3: the pad publishes the thumb's moves too
            else if (!pdown && prev.pdown) chipLift()   // #2474 item 3: pad lift settles the armed chip like the canvas one
            if (pad.a && !prev.a) {
                if (gs.build) {
                    if (cellItem(gs, gs.cursor.r, gs.cursor.c) && cellItem(gs, gs.cursor.r, gs.cursor.c).id !== 'mail') sellAt(gs, gs.cursor.r, gs.cursor.c)
                    else place(gs, gs.cursor.r, gs.cursor.c)
                } else if (!tryUseOrQueue(gs, p)) {   // #2470: A rides the queue law — idle issues, busy appends the nearest
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
                // #2708 tail 5: C with a hinted ear is the keyboard far-tap —
                // the pointer's own three legs: pick inside the ring (the #2235
                // idiom lands the coo on the chosen ear), list when the hand is
                // busy (#2470), walk the word over when it's free (#2683). An
                // ear that left the lot since the press falls back to plain C.
                const k = courtQueued === 'coo' ? earHint : null
                earHint = null
                const v = k ? goSayTarget(gs, k) : null
                if (v && Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= COURT_REACH) { courtPickSet(gs, k); court(gs, 'coo') }
                else if (v && p.owner === 'human' && orderBusy(gs, p)) { if (cmdQueue(gs, p, { kind: 'gosay', k })) audioController.playTone(740, 0.05, 'triangle', 0.04) }
                else if (v && cmdGoSay(gs, p, k)) audioController.playTone(740, 0.05, 'triangle', 0.04)
                else court(gs, courtQueued)   // #2131: C coo / X insult — sound + sparks ride the event queue
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
            drawPurposeView(ctx, g)   // #2705: the garden's bed + the hamper at its door, ground level under the furniture
            drawGate(ctx, g.sec)
            drawClouds(ctx, g.sec)
            // #2508 item 1: the truck's paint tick — poll cone presence so a restore
            // or any missed exit event still ends in a drive-off, never a vanish.
            if (g.cone) {
                if (iceTruck.phase === 'off' || iceTruck.phase === 'out') {   // a cone is standing with no truck (restore path) — snap-park it
                    iceTruck.parked = LOT_X + g.cone.c * TILE - 44
                    iceTruck.px = iceTruck.from = iceTruck.parked; iceTruck.phase = 'parked'
                }
            } else if (iceTruck.phase === 'in' || iceTruck.phase === 'parked') {
                iceTruckRollOut(g)
            }
            if (iceTruck.phase === 'in') {
                let k = (g.sec - iceTruck.t0) / ICE_TRUCK_IN_S
                if (!(k >= 0)) k = 1   // a sim restart mid-roll leaves t0 on the dead clock — finish the slide instead of flinging the truck west
                else k = Math.min(1, k)
                iceTruck.px = iceTruck.from + (iceTruck.parked - iceTruck.from) * k
                if (k >= 1) { iceTruck.px = iceTruck.parked; iceTruck.phase = 'parked' }
            } else if (iceTruck.phase === 'out') {
                let k = (g.sec - iceTruck.t0) / ICE_TRUCK_OUT_S
                if (!(k >= 0)) k = 1   // #2508: same law for the drive-off (homebodydrive caught x = -2342 on a rewound clock)
                else k = Math.min(1, k)
                iceTruck.px = iceTruck.from + (W + TRUCK_W + 8 - iceTruck.from) * k
                if (k >= 1) iceTruck.phase = 'off'
            }
            // #2508 item 5: the crowd arms when the wheels stop (the park and the
            // restore snap-park both land here) and runs home the moment the truck
            // does — same rewound-clock guard the drive-off earned.
            if (iceCrowd.phase === 'off' && iceTruck.phase === 'parked') { iceCrowd.phase = 'gather'; iceCrowd.t0 = g.sec; iceCrowd.day = g.day }
            if (iceCrowd.phase === 'gather' && (iceTruck.phase === 'out' || iceTruck.phase === 'off')) { iceCrowd.phase = 'flee'; iceCrowd.t0 = g.sec }
            if (iceCrowd.phase === 'flee') { const fk = (g.sec - iceCrowd.t0) / ICE_KID_FLEE_S; if (!(fk >= 0) || fk >= 1) iceCrowd.phase = 'off' }
            for (const it of g.items) drawItem(ctx, it, g.sec, nightLevel(g.hour))   // #2264: the meal sprite keeps night hours (steam dim/slow, warm halo)
            drawRoomBadges(ctx, g)   // #2736: a named room wears its badge at the door, over the furniture
            // #2618: the pair's walk sell, painted per frame (view-only — the
            // sim never hears of any of it). Mid-lap both guests stride toward
            // each other; when the lap lands they settle facing one another for
            // half a second — choosing the hang, starting the conversation.
            let ps = null
            if (g.visitor && g.ivy && !g.neiGrudge) {
                ps = pairStride(g.visitor, g.ivy)
                // The pair lands unevenly — Fern reaches the spot a beat before
                // Ivy's trail catches up. The settle fires when the LAST walker
                // stops, so the flag survives a half-landed pair.
                const walkN = (g.visitor.path && g.visitor.path.length ? 1 : 0) + (g.ivy.path && g.ivy.path.length ? 1 : 0)
                if (walkN === 2) stridePrevWalk = true
                else if (walkN === 0 && stridePrevWalk && g.visitor.state === 'hang' && g.ivy.state === 'hang') {
                    stridePrevWalk = false
                    neighArrive = 0.5
                    // live only: the attract paints through here before the audio unlock.
                    if (live) audioController.playTone(523, 0.09, 'sine', 0.02)   // one soft note — the lap came home
                }
                if (!ps && neighArrive > 0) ps = { aFace: g.ivy.x >= g.visitor.x ? 1 : -1, bFace: g.visitor.x >= g.ivy.x ? 1 : -1 }
            } else stridePrevWalk = false
            const order = [...g.people.map((p) => ({ p, v: p.y })), ...(g.visitor ? [{ p: g.visitor, v: g.visitor.y }] : []), ...(g.ivy ? [{ p: g.ivy, v: g.ivy.y }] : []), ...(g.pet ? [{ p: g.pet, v: g.pet.y }] : []), ...(g.kid ? [{ p: g.kid, v: g.kid.y }] : []), ...(g.sneak ? [{ p: g.sneak, v: g.sneak.y }] : []), ...(g.giftFx > 0 && g.giftAt ? [{ p: { x: g.giftAt.x, y: g.giftAt.y }, giftLanded: true }] : [])].sort((a, b) => a.v - b.v)   // #2143: both neighbours share the lot; #2197: so does the cat; #2203: and the child; #2520: and the sneak; #2240: so the set-down basket rides the depth line
            for (const o of order) {
                if (o.giftLanded) { drawGroundGift(ctx, g); continue }   // #2240
                if (g.pet && o.p === g.pet) { drawPet(ctx, o.p, g.sec, !!g.prowl); continue }   // #2197: its own sprite, same depth line; #2532: prowl adds the night-eyes
                if (g.kid && o.p === g.kid) { drawKid(ctx, o.p, g.sec); continue }   // #2203: Pip on the same depth line
                // #2076: the pair argues and sulks ON screen — storm puff at the
                // crack, a lasting away-lean through the cold war (residents only).
                // #2599 handoff 1: the guests borrow the idiom — while the pair's
                // own cold war holds (neiGrudge), Fern and Ivy lean apart too, with
                // a puff for the first moments after the crack. Paint only; the
                // pair's pathing stays honest (the meet-up law stays frozen by law).
                let fx = null, lean = 0
                const ri = g.people.indexOf(o.p)
                if (ri >= 0 && g.grudge) {
                    fx = g.spatFx > 0 ? 'spat' : 'cold'
                    const other = g.people[ri === 0 ? 1 : 0]
                    lean = o.p.x <= other.x ? -1 : 1
                } else if (ri < 0 && g.neiGrudge && g.visitor && g.ivy && (o.p === g.visitor || o.p === g.ivy)) {
                    fx = neighSulks > 0 ? 'spat' : 'cold'
                    const other = o.p === g.visitor ? g.ivy : g.visitor
                    lean = o.p.x <= other.x ? -1 : 1
                } else if (ri < 0 && neighWave > 0 && g.visitor && o.p === g.visitor) {
                    fx = 'wave'   // #2599 item 2: the street's host greets the arriving pair — Fern waves (the grudge branches above outrank the beat)
                }
                drawPerson(ctx, o.p, g.sec, g.people[g.active] === o.p, fx, lean,
                    ps ? (o.p === g.visitor ? { face: ps.aFace } : o.p === g.ivy ? { face: ps.bFace } : null) : null)   // #2618 item 1: the pair strides facing each other; #2618 item 2: settles facing on arrival
            }
            if (strollFx > 0) drawStrollTrail(ctx, strollDots, strollFx / 2.5)   // #2618 item 3: the route, fading behind the first steps
            // #2508 item 1: the truck paints after everyone — it is the nearest
            // thing to the camera, so it laps the fence, the gate and the residents cleanly.
            if (iceTruck.phase !== 'off') drawIceTruck(ctx, iceTruck.px, ICE_TRUCK_Y, g.sec, iceTruck.phase === 'parked' ? 0 : 1)
            // #2508 item 5: the crowd paints with the truck and anchors to its
            // PARKED spot — when the stop is spent, the truck leaves east and the
            // kids jog west; two directions, one goodbye.
            if (iceCrowd.phase !== 'off') {
                const fk = iceCrowd.phase === 'flee' ? Math.max(0, Math.min(1, (g.sec - iceCrowd.t0) / ICE_KID_FLEE_S)) : 0
                drawCurbKids(ctx, iceTruck.parked, ICE_TRUCK_Y, g.sec, iceCrowd.day, fk)
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
            if (live && !g.build) {
                // #2683: the promised ear — while a go-say errand walks toward a
                // person, a dotted gold ring trails them across the lot.
                // #2688 tails 2 & 6: the tell now MOVES — dots walk the remaining
                // route, the ring tightens as the errand nears, and the ear
                // answers with a hue wink once the walker is close enough to see.
                const pt = promiseTell(g)
                if (pt) {
                    for (const [i, tc] of pt.trail.entries()) {
                        if ((i + Math.floor(g.sec * 6)) % 3) continue   // one dot in three lit — the march
                        ctx.globalAlpha = 0.55 - tc.k * 0.35
                        ctx.fillStyle = '#ffd24a'
                        ctx.fillRect(LOT_X + tc.c * TILE + TILE / 2 - 1, LOT_Y + tc.r * TILE + TILE / 2 - 1, 2, 2)
                    }
                    ctx.globalAlpha = 0.3 + 0.22 * Math.sin(g.sec * 3) + pt.tight * 0.3
                    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5 + pt.tight
                    ctx.setLineDash([4, 3])
                    ctx.beginPath(); ctx.ellipse(pt.vx, pt.vy + 9, 15 - 5 * pt.tight, 5.5 - 1.5 * pt.tight, 0, 0, Math.PI * 2); ctx.stroke()
                    ctx.setLineDash([]); ctx.globalAlpha = 1
                }
                const er = earReact(g)
                if (er) {
                    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(g.sec * 7)
                    ctx.fillStyle = er.hue
                    ctx.fillRect(Math.round(er.x) - 1, Math.round(er.y) - 21, 2, 2)   // the ear knows
                    ctx.globalAlpha = 1
                }
            }
            if (live && lostRing.t > 0) {
                // #2688 tail 2: an errand that lost its ear — the ring dies where
                // the walker folded, grey and flickering, then fades out.
                const k = lostRing.t / LOST_RING_T
                ctx.globalAlpha = k * (0.28 + 0.3 * Math.abs(Math.sin(g.sec * 16)))
                ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.5
                ctx.setLineDash([3, 3])
                ctx.beginPath(); ctx.ellipse(lostRing.x, lostRing.y + 9, 15, 5.5, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.setLineDash([]); ctx.globalAlpha = 1
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
            if (live && g.build) {
                drawBuildCursor(ctx, g, placeOk(g, g.cursor.r, g.cursor.c))
                // #2689: hold the Spare Room kit and the whole future wing shows
                // where the hammer would fall — the row you point at is the row
                // the room takes.
                if (CATALOG[g.sel] && CATALOG[g.sel].room) drawWingGhost(ctx, wingPick(g, g.cursor.r, g.cursor.c), placeOk(g, g.cursor.r, g.cursor.c))
                else if (kitPreview) drawWingGhost(ctx, kitPreview, buildRoomOk(g, kitPreview))   // #2704 tail 5: hovering the kit card previews the wing at its default site — the choose-a-row beat sells itself before R
            }
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
            nightTint(ctx, g.hour, g.ext, g.wings, sleepingCells(g))   // #2705 tail 3: a room that lodges glows deeper
            drawGardenLamp(ctx, g)   // #2688 handoff 3: the garden's bench keeps a lamp after dusk
            drawMoonlitWait(ctx, g, g.sec)   // #2705 tail 5: the silver glint of a bed waiting for morning
            drawTopBar(ctx, g)
            drawPanel(ctx, g, g.sec, live ? collapseCache : null, live ? hoverReveal : null)
            drawThoughts(ctx, g)
            // #2253: a fresh order rings its target — the player sees the tap
            // landed the moment it registers, not seconds later at the fridge.
            if (live && g.orderPing.t > 0) {
                const pu = 0.55 + 0.45 * Math.sin(g.sec * 9)
                ctx.strokeStyle = `rgba(72,214,200,${(0.5 + 0.4 * pu).toFixed(3)})`
                ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(g.orderPing.x, g.orderPing.y, 9 + 3 * pu, 0, 7); ctx.stroke()
                ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
                ctx.fillStyle = 'rgba(28,36,54,0.8)'
                const pw = ctx.measureText(g.orderPing.label).width + 8
                ctx.fillRect(g.orderPing.x - pw / 2, g.orderPing.y - 24, pw, 11)
                ctx.fillStyle = '#8ef0e4'
                ctx.fillText(g.orderPing.label, g.orderPing.x, g.orderPing.y - 14)
            }
            // #2708 tail 5: the ear the keyboard is holding — a gold ring on the
            // chosen resident while the hint stands (view-only; the law runs when
            // C fires, exactly the pointer's far-tap legs).
            if (live && earHint) {
                const v = goSayTarget(g, earHint)
                if (v) {
                    const pu = 0.5 + 0.5 * Math.sin(g.sec * 7)
                    ctx.strokeStyle = `rgba(255,210,74,${(0.45 + 0.4 * pu).toFixed(3)})`
                    ctx.lineWidth = 2
                    ctx.beginPath(); ctx.arc(v.x, v.y, 12 + 2 * pu, 0, 7); ctx.stroke()
                }
            }
            if (g.build) drawCatalog(ctx, g)
            if (g.fastT > 0) {
                ctx.fillStyle = 'rgba(18,24,38,0.5)'
                ctx.fillRect(0, H / 2 - 26, W, 52)
                ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                ctx.fillText('· · · AT WORK · · ·', W / 2, H / 2)
            }
            // #2209: the paused tell — gear || stops the world clock, and with it
            // every mid-screen motion, so "why is nobody moving?" used to hide in a
            // 19px pip. A veil + breathing || ghost answers at a glance; it rides
            // performance.now because the world clock it announces is frozen.
            if (live && g.speed === 0 && !g.build) {
                ctx.fillStyle = 'rgba(10,14,24,0.30)'
                // #2275: the veil announces a frozen world on the LOT, but it painted
                // 0,0,W,H AFTER drawPanel — washing the panel's gold speed pip (the very
                // gear that says "you are paused") below legibility, and the top bar too.
                // Keep it to the scene column: left of the panel, below the top bar.
                ctx.fillRect(0, LOT_Y - 4, PANEL_X, H - (LOT_Y - 4))
                const pu = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3)
                ctx.globalAlpha = 0.38 + 0.27 * pu
                ctx.fillStyle = '#eef3ff'
                ctx.fillRect(W / 2 - 8, H / 2 - 11, 5, 22)
                ctx.fillRect(W / 2 + 3, H / 2 - 11, 5, 22)
                ctx.globalAlpha = 1
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
                } else if (pt.kind === 'leaf') {
                    // #2599 handoff 3: the NEIGH glyph in flight — two mirrored leaves
                    const s = pt.size
                    ctx.fillStyle = pt.col
                    ctx.beginPath(); ctx.ellipse(pt.x + ox - s * 0.5, pt.y + oy, s * 0.42, s * 0.8, Math.PI / 4, 0, 7); ctx.fill()
                    ctx.beginPath(); ctx.ellipse(pt.x + ox + s * 0.5, pt.y + oy, s * 0.42, s * 0.8, -Math.PI / 4, 0, 7); ctx.fill()
                } else {
                    ctx.fillStyle = pt.col
                    ctx.beginPath(); ctx.arc(pt.x + ox, pt.y + oy, pt.size, 0, 7); ctx.fill()
                }
            }
            ctx.globalAlpha = 1
        }

        const banner = (c, text, small = false) => {
            c.textAlign = 'center'; c.textBaseline = 'middle'
            // #2253: the card used to ride at H/2-90 — straight through the roof
            // line of the rooms, over the residents at exactly the moment the
            // player is watching them. It now sits on the front lawn, below the
            // house row, where nothing living is.
            const y = 348
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
            if (neighSulks > 0) neighSulks = Math.max(0, neighSulks - dtMs / 1000)   // #2599 handoff 1: the guests' puff fades on the real clock (the world may be frozen in buy mode)
            if (lostRing.t > 0) lostRing.t = Math.max(0, lostRing.t - dtMs / 1000)   // #2688: the dead ring flickers out on the real clock, like every other tell
            if (neighArrive > 0) neighArrive = Math.max(0, neighArrive - dtMs / 1000)   // #2618 item 2: the settle lives on the real clock, like the puff
            if (strollFx > 0) strollFx = Math.max(0, strollFx - dtMs / 1000)   // #2618 item 3: the route tell fades with the lap's first breath
            // #2599 item 2: the meet-up greeting — Ivy's meet-walk arrives beside
            // Fern and Fern waves. Honest view-side arrival: the ring distance
            // crossing from outside to inside (mirror of sim.js NEIGH_REACH), only
            // while both guests are on the lot, unclaimed, and the cold war is off.
            if (gs && gs.visitor && gs.ivy && !gs.neiGrudge && !gs.visitor.claim && !gs.ivy.claim) {
                const d0 = Math.abs(gs.visitor.r - gs.ivy.r) + Math.abs(gs.visitor.c - gs.ivy.c)
                if (neighPrevD > 2 && d0 <= 2) {
                    neighWave = 1.1
                    audioController.playTone(784, 0.06, 'triangle', 0.03)
                    burst((gs.visitor.x + gs.ivy.x) / 2, gs.visitor.y - 12, 3, '#7fd0c0', 1.6, 'flash')
                }
                neighPrevD = d0
            } else neighPrevD = 99   // an empty lot or a cold war re-arms the beat for the next arrival
            if (neighWave > 0) neighWave = Math.max(0, neighWave - dtMs / 1000)   // #2599 item 2: the wave lives on the real clock, like the puff
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            // #2474 item 2: the held-thumb name clock — a finger resting on the
            // inert NOW cell past HOLD_NAME_MS reads the errand's name (in pixels).
            // Pending chips answer the press with cancel (#2470 law), so touch names
            // ride the free surface; the mouse rides hover, which never taps at all.
            if (pressName && !pressName.revealed && screenRef.current === 'play' && !pausedRef.current && performance.now() - pressName.t0 >= HOLD_NAME_MS) {
                const hv = chipHover(gs, pressName.x, pressName.y)
                if (hv && hv.qi === -1) hoverReveal = pressName.revealed = hv
            }
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
                    // #2599 item 3: sell the copy with the picture — while the NEIGH
                    // marquee line is the one on screen and Fern hangs at an empty
                    // gate, ring Ivy into the demo (the #2143 ringIvy clock law on the
                    // attract's own sim). Once per demo run; the #2240 noon fallback
                    // keeps its floor; nothing here moves the economy.
                    if (demoG && !neighBeatRung && marqueeIx.current === NEIGH_MARQUEE
                        && demoG.visitor && demoG.visitor.state === 'hang' && !demoG.ivy && demoG.hour < 19) {
                        neighBeatRung = demoG
                        demoG.ivyAfter = Math.min(demoG.ivyAfter, Math.floor(demoG.hour)); demoG.ivyGap = 0
                    }
                    // #2618 item 4: the WALK copy sells the walk — on the stroll
                    // marquee beat, ring Ivy into the demo while Fern hangs (same
                    // clock law, its own once-per-run guard), so the 12 s bank
                    // starts under the line that teaches it and a lap lands inside
                    // the demo window instead of blinking past unseen.
                    if (demoG && !strollBeatRung && marqueeIx.current === STROLL_MARQUEE
                        && demoG.visitor && demoG.visitor.state === 'hang' && !demoG.ivy && demoG.hour < 19) {
                        strollBeatRung = demoG
                        demoG.ivyAfter = Math.min(demoG.ivyAfter, Math.floor(demoG.hour)); demoG.ivyGap = 0
                    }
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
                // #2474 item 4: this frame's end carries a shorter list than the last
                // frame's end — chips left the line (a pointer cancel lands BETWEEN
                // frames, the pump issues mid-frame) — arm the collapse beat.
                const qNow = gs ? gs.people.map((p) => p.queue.map((o) => queueGlyphFor(o.kind === 'use' ? o.it.id : o.kind))) : null
                if (qNow && qPrevSnap) {
                    for (let pi = 0; pi < qNow.length; pi++) {
                        if (qNow[pi].length < qPrevSnap[pi].length) chipCollapseArm(collapseCache, pi, qPrevSnap[pi], qNow[pi].length)
                    }
                }
                qPrevSnap = qNow
                if (gs) chipCollapse(gs, collapseCache)   // #2474 item 4: ghosts decay on the world clock
                stepParticles(ft)
            }
            if (screenRef.current === 'attract') paintAttract()
            else if (gs) paintScene(gs, screenRef.current === 'play')
        }

        // ------------------------------------------------------------- start ----
        const freshDemo = () => { neighBeatRung = null; strollBeatRung = null; stridePrevWalk = false; neighArrive = 0; strollFx = 0; strollDots = null; const d = newRun((Date.now() >>> 5) ^ 0x5eed); return d }

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
            neighSulks = 0   // #2599: nor a stale pair-puff
            neighWave = 0; neighPrevD = 99   // #2599 item 2: nor a stale greeting
            stridePrevWalk = false; neighArrive = 0; strollFx = 0; strollDots = null   // #2618: nor a stale stride, settle, or route tell
            lostRing.t = 0   // #2688: nor a stale dead ring
            prev.left = prev.right = prev.up = prev.down = prev.a = prev.b = prev.pdown = false
            actQueued = buildQueued = switchQueued = false; digitPick = -1; courtQueued = null; earHint = null
            tabQueued = 0; specialPick = null   // #2222
            speedPick = null; speedCycled = 0   // #2227: a new street moves in at normal
            collapseCache.clear(); hoverReveal = null; mouseHover = null; pressName = null; qPrevSnap = null   // #2474: no ghosts or stale names across streets
            setEndInfo(null)
            setSc('play')
            audioController.playSweep(262, 523, 0.24, 'square', 0.07)
        }

        // -------------------------------------------------------------- input ----
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question' || code === 'Escape' || code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); setLedgerSnap(pausedRef.current ? pauseLedger(gs) : null) }
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
            if (EAR_KEYS.has(e.code) && gs) {
                // #2708 tail 5: T walks the addressable ears — Fern, Ivy, Pip,
                // skipping whoever can't hear (home, leaving, asleep). The gold
                // ring holds on the chosen ear until C spends it (painter below);
                // C then runs the pointer's own far-tap legs (the pump).
                earHint = farCycle(gs, earHint)
                if (earHint) {
                    const v = goSayTarget(gs, earHint)
                    gs.orderPing.x = v.x; gs.orderPing.y = v.y; gs.orderPing.t = 1.6
                    gs.orderPing.label = `SAY IT TO — ${v.name.toUpperCase()}`
                    audioController.playTone(660, 0.05, 'triangle', 0.04)
                } else say('NO EAR ON THE LOT TO HEAR')
            }
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
            const pxx = (e.clientX - r.left) / r.width * W
            const pyy = (e.clientY - r.top) / r.height * H
            pressName = { x: pxx, y: pyy, t0: performance.now(), revealed: false }   // #2474 item 2: the thumb clock starts with the press
            pointerPx(pxx, pyy)
        }
        // #2474 item 2: the name reveal — a mouse resting on a chip reads it; the
        // watch pill stopPropagation()s its own presses, e.target is this canvas.
        const onMove = (e) => {
            if (screenRef.current !== 'play' || pausedRef.current || !canvas || e.target !== canvas || watchingRef.current) { mouseHover = null; kitPreview = null; return }
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            const mx = (e.clientX - r.left) / r.width * W, my = (e.clientY - r.top) / r.height * H
            if (chipDrag) { chipDragMove(mx, my); return }   // #2474 item 3: an armed chip rides the thumb, touch included
            if (e.pointerType === 'touch') return   // a thumb ends where it last tapped — hover is the mouse's idiom
            mouseHover = chipHover(gs, mx, my)
            hoverReveal = mouseHover
            // #2704 tail 5: a mouse resting on the Spare Room kit card previews
            // the future wing at its default site (the same law `place` falls
            // back to) — the buyer sees WHAT the card buys before picking it.
            kitPreview = null
            if (gs.build && !(CATALOG[gs.sel] && CATALOG[gs.sel].room)) {
                const hi = catalogHit(mx, my, gs)
                if (hi >= 0 && CATALOG[hi] && CATALOG[hi].room) kitPreview = gs.ext >= 1 ? GARDEN : eastWing(DEFAULT_ANCHOR)
            }
        }
        const onLift = () => {
            // #2474: the thumb clock ends with the lift; its revealed name goes
            // with it (mouse names live and die by onMove, not by the clock).
            chipLift()   // #2474 item 3: the armed chip settles — no travel means the historic cancel
            if (pressName && pressName.revealed) hoverReveal = null
            pressName = null
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onLift)
        window.addEventListener('pointercancel', onLift)

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
                wings: gs.wings.map((w) => (w.id === 'garden' ? 'garden' : `east${w.r0}`)),   // #2689: which rooms stand, and where the east one landed
                purpose: gs.wings.map((w) => `${w.id === 'garden' ? 'garden' : 'east'}:${w.herbs || 0}:${w.sleptWell || 0}:${w.insights || 0}:${w.delights || 0}`),   // #2695: and what each room has earned; #2736: the personality tallies ride the same view
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
                    wings: gs.wings.map((w) => (w.id === 'garden' ? 'garden' : `east${w.r0}`)),   // #2689: the harness reads which rooms stand and where
                    purpose: gs.wings.map((w) => `${w.id}:${w.herbs || 0}:${w.sleptWell || 0}:${Math.round((w.tend || 0) * 100) / 100}:${w.lodgeDay ?? -1}:${w.insights || 0}:${w.delights || 0}:${archetypeOf(gs, w) || '-'}`),   // #2695: and what each room is earning, live; #2736: personality tallies + the room's own name appended (positional readers unaffected)
                    rel: { house: gs.rel.house, fern: gs.rel.fern, ivy: gs.rel.ivy, neigh: gs.rel.neigh },   // #2143: third meter; #2588: the pair's own rung joins the view
                    spats: gs.spats, grudge: gs.grudge, spatFx: Math.round(gs.spatFx * 10) / 10,   // #2070/#2076
                    neiSpats: gs.neiSpats, neiGrudge: gs.neiGrudge, neiIgnore: Math.round(gs.neiIgnore),   // #2604: the pair's own quarrel ledger, visible to harness and panel-debug
                    neiMediated: gs.neiMediated, neiMending: gs.neiMending,   // #2672: the mediation flag and the mending lane read here
                    cmdCd: Math.round(gs.cmdCd * 10) / 10, cooFx: Math.round(gs.cooFx * 10) / 10, cooDeep: !!gs.cooDeep,   // #2131
                    courtKind: (() => { const t = courtTarget(gs); return t ? t.k : null })(), active: gs.active,
                    courtPick: gs.courtPick,   // #2235: the preferred addressee (null = nearest law)
                    goSay: (() => { const q = gs.people.find((p) => p.goal && p.goal.kind === 'gosay'); return q ? `${q.name}->${q.goal.k}` : null })(),   // #2683: the promise in flight — who is walking it to whom
                    holdT: Math.round(gs.holdT), courtArmed: gs.holdT >= 0,   // #2171: the thumb court
                    visitor: gs.visitor ? gs.visitor.name : null,
                    ivy: gs.ivy ? { name: gs.ivy.name, gift: !!gs.ivy.gift, state: gs.ivy.state, x: Math.round(gs.ivy.x), y: Math.round(gs.ivy.y) } : null,   // #2143
                    sneak: gs.sneak ? { state: gs.sneak.state, x: Math.round(gs.sneak.x), y: Math.round(gs.sneak.y) } : null,   // #2520: the prowler reads here — the drive proves the sprite lands where the sim says
                    prowl: gs.prowl ? { state: gs.prowl.state, x: Math.round(gs.pet.x), y: Math.round(gs.pet.y) } : null,   // #2532: the cat on the prowl reads here (her feet carry it)
                    prowlLedger: { night: gs.prowlNight, serial: gs.prowlSerial },   // #2532: the parity stamp and the visit counter
                    sneakLedger: { night: gs.sneakNight, scare: gs.scareDay, serial: gs.sneakSerial, lost: gs.lost, alarm: gs.items.some((it) => it.id === 'alarm') },   // #2520: one-night law, scare stamp, till ledger, alarm placement — all in one readout
                    giftFx: Math.round(gs.giftFx * 10) / 10, giftHoney: !!gs.giftHoney, demoIvy: gs.demoIvy,   // #2240: the set-down + the attract's ring
                    pet: gs.pet ? { name: gs.pet.name, r: gs.pet.r, c: gs.pet.c, state: gs.pet.state, asleep: gs.pet.asleep, needs: { ...gs.pet.needs }, cd: Math.round(gs.pet.cd * 10) / 10, x: Math.round(gs.pet.x), y: Math.round(gs.pet.y) } : null,   // #2197
                    kid: gs.kid ? { name: gs.kid.name, r: gs.kid.r, c: gs.kid.c, state: gs.kid.state, asleep: gs.kid.asleep, needs: { ...gs.kid.needs }, cd: Math.round(gs.kid.cd * 10) / 10, x: Math.round(gs.kid.x), y: Math.round(gs.kid.y) } : null,   // #2203
                    paper: gs.paper ? { r: gs.paper.r, c: gs.paper.c } : null, paperDay: gs.paperDay,   // #2238: the route
                    cone: gs.cone ? { r: gs.cone.r, c: gs.cone.c } : null, iceSerial: gs.iceSerial, iceDay: gs.iceDay, treats: gs.treats,   // #2503: the truck's stop and the cone ledger
                    truckView: { phase: iceTruck.phase, x: Math.round(iceTruck.px), jingle: iceTruck.jingle, crowd: { phase: iceCrowd.phase, n: iceCrowd.phase === 'off' ? 0 : crowdKids(iceCrowd.day) } },   // #2508 item 1: the view-side truck — QA reads the slide (phase 'off'/'in'/'parked'/'out') here; item 2: which ending bar this pass rang ('A'/'B'); item 5: the curb crowd (phase 'off'/'gather'/'flee', size off the day)
                    heldTreats: [...gs.people, gs.kid].filter(Boolean).map((e) => ({ name: e.name, hold: Math.round(e.coneHold * 10) / 10, drips: e.coneDrips })),   // #2508 item 3: the eat beat — who holds a cone, how much hold is left, how many drips fell
                    meal: gs.meal ? { r: gs.meal.r, c: gs.meal.c, name: gs.mealName } : null, mealDay: gs.mealDay, mealSlot: gs.mealSlot, mealSerial: gs.mealSerial, mealEaten: gs.mealEaten.length,   // #2244: the bells
                    queues: gs.people.map((p) => p.queue.map((o) => (o.kind === 'use' ? o.it.id : o.kind))),   // #2470: the pending lists, head first
                    collapse: gs.people.map((_, pi) => (collapseCache.has(pi) ? COLLAPSE_FRAMES : 0)),   // #2474 item 4: which rows are ghosting (QA-visible, view-only)
                    hoverName: hoverReveal ? hoverReveal.name : null,   // #2474 item 2: the name the pointer is reading (QA-visible)
                }) : { screen: screenRef.current, seed },
                // #1637 watchcheck pilot drives these.
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                start: (sd) => startPlay(sd),
                tap: (px, py) => { pointerPx(px, py); chipLift() },   // #2474 item 3: a harness tap is the whole press-and-release — the historic cancel survives
                drag: (fx, fy, tx, ty) => { pointerPx(fx, fy); chipDragMove(tx, ty); chipLift() },   // #2474 item 3: press at (fx,fy), pull to (tx,ty), release — the drag-to-front route
                press: (code) => onDown({ code, preventDefault: () => {} }),
                release: (code) => onUp({ code }),   // #2171: the release half of the thumb-court gesture
                room: () => (gs ? buildRoom(gs) : false),
                wingToy: () => (gs ? (() => {   // #2752 scenario rig — the issue's own suggestion: place a Bookshelf once a spare room stands. Stands the east wing on a bare lot, banks the till, and puts the shelf on the first unnamed wing's floorboards through the real place() law (canPlace + keepsOpen + price); the drive's 390-px badges leg then asks the paint about the room this furnishing names. (The attract clause's surplus path is peoplecheck-proven in node; the phone leg only needs a named wing.)
                    if (!gs.ext) { gs.money = Math.max(gs.money, EXT_ROOM.price); if (!buildRoom(gs, eastWing(DEFAULT_ANCHOR))) return false }
                    gs.money = Math.max(gs.money, DEF.book.price)
                    for (const w of gs.wings) {
                        if (archetypeOf(gs, w)) continue
                        const gw = wingGeom(w), set = wingSets(gw)
                        for (const [r, c] of gw.floor) {
                            if (`${r},${c}` === set.door || cellItem(gs, r, c)) continue
                            const keep = gs.sel
                            setSel(gs, CATALOG.findIndex((d) => d.id === 'book'))   // #2222: the shelf follows the pick
                            const ok = place(gs, r, c)
                            setSel(gs, keep)
                            if (ok) return { r, c, kind: archetypeOf(gs, w) }
                        }
                    }
                    return false
                })() : false),
                adopt: () => (gs ? adoptPet(gs) : false),   // #2197: the counter, straight
                adoptOk: () => (gs ? adoptOk(gs) : false),
                kid: () => (gs ? adoptKid(gs) : false),   // #2203: the child counter, straight
                kidOk: () => (gs ? adoptKidOk(gs) : false),
                win: () => { if (gs) { gs.content = WIN_CONTENT; gs.done = 'win'; gs.endMsg = 'forced' } },
                collapseAll: () => { if (gs) for (const p of gs.people) p.faintT = 2 },
                money: (v) => { if (gs) gs.money = v },
                jar: (v) => { if (gs) gs.jar = v },   // #2729: stage the fund for the panel read (shots, drive setup)
                hour: (h) => { if (gs) gs.hour = h },   // #2672: scenario-clock rewind — the drive's late legs (sneak/prowl) run past the visitors' dusk, and a mediation leg needs the pair still on the lot
                select: (i) => { if (gs) setSel(gs, i) },   // #2222: the shelf follows the pick
                bond: (k, v) => { if (gs && gs.rel[k] !== undefined) gs.rel[k] = v },
                attractIvy: () => (demoG ? { ivy: !!demoG.ivy, demoIvy: demoG.demoIvy, hour: +demoG.hour.toFixed(1), rungFx: demoG.ivy ? demoG.ivy.state : null } : null),   // #2240: the attract's own sim is demoG, not gs
                ringIvy: () => { if (gs) { gs.ivyAfter = Math.min(gs.ivyAfter, Math.floor(gs.hour)); gs.ivyGap = 0 } return 'Ivy rings soon' },   // #2143
                ivyFamily: () => { if (gs) { gs.rel.ivy = Math.max(gs.rel.ivy, REL_EDGES[2] + 5); if (gs.ivy) gs.ivy.honey = true } return 'FAMILY' },   // #2240: the top tier for scenario legs (basket + honey + gold pulse) — a visitor already inside re-declares her jar
                ringMeal: () => { if (gs) { if (gs.meal) { gs.items = gs.items.filter((x) => x !== gs.meal); gs.meal = null; gs.mealEaten = [] } if (gs.mealSlot >= 3) { gs.mealSlot = 0; scheduleMeals(gs) } const sl = gs.mealSlot; gs.mealAfter[sl] = Math.max(Math.floor(gs.hour), gs.hour - MEAL_WINDOW + 0.05) } return 'a bell is due' },   // #2244: ring any bell now (scenario setup, like ringIvy) — retires whatever plate sits so the taps order the fresh one, and the window opens wide even if the clock passed the slot
                ringTruck: () => (gs ? ringTruck(gs) : 'no sim'),   // #2503: call the ice-cream man now (sim-owned scenario setup — retires whatever cone stands and opens a stop at the hour)
                ringSneak: () => (gs ? ringSneak(gs) : 'no sim'),   // #2520: send the sneak now (sim-owned scenario setup — retires any prowler and opens the window at the hour, alarm or not)
                ringProwl: () => (gs ? ringProwl(gs) : 'no sim'),   // #2532: open the flap now (harness/F1 only — the parity law never reads it)
                ivyHome: () => { if (gs && gs.ivy) { gs.ivy.state = 'leaving'; gs.ivy.path = null } },   // #2143: rig the next visit (scenario setup, like park/foul)
                pairCold: (cd) => { if (gs) { const seat = (o, r, c, hue) => { o.r = r; o.c = c; o.x = LOT_X + c * TILE + TILE / 2; o.y = LOT_Y + r * TILE + TILE / 2; o.path = null; o.state = 'hang'; o.t = 0; o.hue = hue; o.face = 1; o.walkPhase = 0; o.chatT = 0; o.hangUntil = 9999; o.neighT = 0 }; gs.visitAfter = 99; gs.ivyAfter = 99; gs.ivyGap = 0; if (!gs.visitor) gs.visitor = { name: 'Fern' }; if (!gs.ivy) gs.ivy = { name: 'Ivy', gift: false }; seat(gs.visitor, 3, 5, '#4fae5f'); seat(gs.ivy, 3, 7, '#a3579b'); for (const p of gs.people) { p.queue.length = 0; p.owner = null; p.working = false } gs.neiGrudge = 1; gs.neiMurrs = 0; gs.neiMurmurCd = cd ?? 0; gs.neiMediated = 0; gs.neiMending = 0; sayB.life = 0 } return 'pair cold' },   // #2599 handoff 2 scenario rig: the pair seated apart and cold, the murmur clock armed — scenario setup like park/foul/ringIvy. #2672: a rig-set war is a FRESH war — stale mediation/mending flags from earlier legs would contradict it
                hangPair: () => { if (gs) { const seat = (o, r, c, hue) => { o.r = r; o.c = c; o.x = LOT_X + c * TILE + TILE / 2; o.y = LOT_Y + r * TILE + TILE / 2; o.path = null; o.state = 'hang'; o.t = 0; o.hue = hue; o.face = 1; o.walkPhase = 0; o.chatT = 0; o.hangUntil = 9999; o.neighT = 0 }; gs.visitAfter = 99; gs.ivyAfter = 99; gs.ivyGap = 0; if (!gs.visitor) gs.visitor = { name: 'Fern' }; if (!gs.ivy) gs.ivy = { name: 'Ivy', gift: false }; seat(gs.visitor, 3, 5, '#4fae5f'); seat(gs.ivy, 3, 7, '#a3579b'); gs.neiGrudge = 0; gs.neiMending = 0; gs.neiStroll = 0; gs.neiIgnore = 0; gs.neiWalk = 0; gs.visitor.claim = null; gs.ivy.claim = null; gs.visitor.repathT = 0; gs.ivy.repathT = 0; gs.visitor.neighT = 0; gs.ivy.neighT = 0; const q = [[gs.people[0], 6, 8], [gs.people[1], 1, 1]]; for (const [p, r, c] of q) { p.r = r; p.c = c; p.x = LOT_X + c * TILE + TILE / 2; p.y = LOT_Y + r * TILE + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; p.queue.length = 0; p.owner = null; for (const n of NEEDS) p.needs[n] = 1 }   // needs topped FULL — the autonomy scan engages under 0.55 and would otherwise chase the pair mid-lap; a full tank outlasts the drive
                    stridePrevWalk = false; neighArrive = 0; strollFx = 0; strollDots = null } return 'pair hanging — the lap banks from zero' },   // #2618 scenario rig: pair seated warm and mobile, residents parked off every route's halo, the bank zeroed — the drive leg for the stroll view pass
                holdResidents: () => { if (gs) { const q = [[gs.people[0], 6, 8], [gs.people[1], 1, 1]]; for (const [p, r, c] of q) { p.r = r; p.c = c; p.x = LOT_X + c * TILE + TILE / 2; p.y = LOT_Y + r * TILE + TILE / 2; p.path = null; p.goal = null; p.use = null; p.working = false; p.faintT = 0; p.queue.length = 0; p.owner = null; for (const n of NEEDS) p.needs[n] = 1 } if (gs.visitor) gs.visitor.claim = null; if (gs.ivy) gs.ivy.claim = null } return 'residents held off the routes' },   // #2618 drive leg: keeps the household out of the pair's claim halo between polls (the harness equivalent of peoplecheck's per-tick park)
                strollView: () => (gs ? ({ stride: !!(gs.visitor && gs.ivy && pairStride(gs.visitor, gs.ivy)), walking: !!(gs.visitor && gs.visitor.path && gs.visitor.path.length), dots: strollFx > 0 && strollDots ? strollDots.length : 0, fx: Math.round(strollFx * 10) / 10, arrive: Math.round(neighArrive * 100) / 100, pips: !!(gs.visitor && gs.visitor.path && gs.visitor.path.length || gs.ivy && gs.ivy.path && gs.ivy.path.length), bank: Math.round(gs.neiStroll * 10) / 10, grudge: gs.neiGrudge }) : null),   // #2618: the view-pass state as data for the drive
                // #2070: rig the spat scenario — park the pair beside each
                // other, both in the red; `thaw` lifts their tempers up.
                foul: () => { if (gs) { const [a, b] = gs.people; a.r = 3; a.c = 3; b.r = 3; b.c = 4; b.path = null; for (const p of gs.people) { for (const n of NEEDS) p.needs[n] = 0.3; p.working = false; p.faintT = 0 } gs.grudge = 0; gs.spatCd = 0; gs.spats = 0; for (const p of gs.people) { p.queue.length = 0; p.owner = null } } },   // the rigged spat counts as the run's first — earlier organic barbs in a long drive are clock noise, not the law
                park: () => { if (gs) { const [a, b] = gs.people; a.r = 3; a.c = 3; a.path = null; b.r = 3; b.c = 4; b.path = null; a.x = LOT_X + 3 * TILE + TILE / 2; a.y = LOT_Y + 3 * TILE + TILE / 2; b.x = LOT_X + 4 * TILE + TILE / 2; b.y = LOT_Y + 3 * TILE + TILE / 2; for (const p of gs.people) { p.use = null; p.goal = null; p.working = false; p.faintT = 0; p.queue.length = 0; p.owner = null; for (const n of NEEDS) p.needs[n] = 0.5 } gs.visitor = null; gs.ivy = null; gs.cmdCd = 0; gs.spats = 0; gs.spatCd = SPAT_CD; for (const p of gs.people) p.queue.length = 0 } },   // #2131/#2143/#2149: adjacency, idle for real, tempers NEUTRAL (mood 1: no organic spat, no instant make-up — the law itself is pinned in peoplecheck), nobody else to address, cooldown ready — and the SPRITES land where the logic was parked (#2149: cells without pixels left the pair standing apart, so make-up hearts burst at the stale midpoint, where the MADE UP toast card paints over them). #2244: the spat counter and its cooldown re-arm too — a long drive may have collected organic barbs upstream, and the gates downstream assert the rigged one is the run's first. #2470: the queues are wiped too — a parked household starts clean
                thaw: () => { if (gs) for (const p of gs.people) for (const n of NEEDS) p.needs[n] = 0.9 },
                stand: (who, r, c) => { if (gs) { const p = gs.people[who]; p.r = r; p.c = c; p.path = null; p.use = null; p.goal = null; p.working = false; p.queue.length = 0; p.owner = null; p.x = LOT_X + c * TILE + TILE / 2; p.y = LOT_Y + r * TILE + TILE / 2 } },   // #2171: park() seats the pair by the radio — the thumb-court drive needs a cell with a clear hand  (#2470: the queue is part of being parked for real)
                clearQueues: () => { if (gs) for (const p of gs.people) { p.queue.length = 0; p.owner = null } return 'lists wiped' },   // #2470: scenario-boundary flush — a gate that measures a FRESH single tap starts with empty lists
                hearts: () => particles.filter((pt) => pt.kind === 'heart').length,   // #2076: the make-up paid hearts?
                leaves: () => particles.filter((pt) => pt.kind === 'leaf').length,   // #2672: did the mediation sparkle the pair leaf?
                promiseFar: () => { if (!gs) return null; gs.visitAfter = 99; gs.ivyAfter = 99; if (!gs.visitor) gs.visitor = { name: 'Fern' }; const v = gs.visitor; v.r = 3; v.c = 5; v.x = LOT_X + 5 * TILE + TILE / 2; v.y = LOT_Y + 3 * TILE + TILE / 2; v.path = null; v.state = 'hang'; v.t = 0; v.hue = '#4fae5f'; v.face = 1; v.walkPhase = 0; v.chatT = 0; v.hangUntil = 9999; const p = gs.people[0]; p.r = 12; p.c = 5; p.x = LOT_X + 5 * TILE + TILE / 2; p.y = LOT_Y + 12 * TILE + TILE / 2; p.path = null; p.goal = null; p.use = null; p.queue.length = 0; p.owner = null; p.working = false; p.faintT = 0; gs.active = 0; gs.cmdCd = 0; gs.holdT = -1; gs.courtPick = null; gs.grudge = 0; gs.spatCd = 0; gs.rel.fern = 0; sayB.life = 0; return { vx: v.x, vy: v.y, hx: p.x, hy: p.y } },   // #2683 scenario rig: the lot divided — Fern seated by the sofa, the commanded resident parked at the gate, promise state cleared; the drive's far-tap leg rides a real pointer click into pointerPx
                parkFar: () => { if (gs && gs.visitor) { const v = gs.visitor; v.r = 3; v.c = 5; v.x = LOT_X + 5 * TILE + TILE / 2; v.y = LOT_Y + 3 * TILE + TILE / 2; v.path = null; v.state = 'hang'; v.repathT = 9999; v.hangUntil = 9999 } return !!gs.visitor },   // #2683: hold the promised ear on her sofa cell while the drive watches the walk (a rig-set repathT outranks the hang-wander law's re-arm)
                standMed: (kind, r, c) => { const m = gs ? (kind === 'kid' ? gs.kid : gs.pet) : null; if (!m) return false; m.r = r; m.c = c; m.x = LOT_X + c * TILE + TILE / 2; m.y = LOT_Y + r * TILE + TILE / 2; m.path = null; m.wanderT = 9999; m.play = false; for (const n of Object.keys(m.needs)) m.needs[n] = 1; return true },   // #2672: seat a mediator mid-cold-war, held still (the drive-leg twin of peoplecheck's stand)
                medCells: () => gs ? ({ fv: gs.visitor ? [gs.visitor.r, gs.visitor.c, gs.visitor.state] : null, iv: gs.ivy ? [gs.ivy.r, gs.ivy.c, gs.ivy.state] : null, pet: gs.pet ? [gs.pet.r, gs.pet.c, gs.pet.asleep, gs.pet.state] : null, hour: Math.round(gs.hour * 10) / 10, grudge: gs.neiGrudge, med: gs.neiMediated, tick: gs.tick, done: gs.done, prowl: !!gs.prowl, sneak: !!gs.sneak, build: gs.build, content: gs.content, screen: gs.screen }) : null,   // #2672 debug read: the cells and states the mediation law actually sees (#2674: build/content/screen — a won or buried run freezes advance() and blinds the leg)
                // #2240: the SET-DOWN, counted on the live canvas at the landing
                // cell — greens + tomato are the basket's own signature (the floor's
                // plank tan deliberately does NOT match them), honey amber only ever
                // rides the FAMILY tier. Local rects; nothing else red/green lives on
                // a kitchen floor cell.
                giftPix: () => {
                    if (!canvas || !gs || !gs.giftAt || gs.giftFx <= 0) return null
                    const d = ctx.getImageData(0, 0, W, H).data
                    const x = Math.round(gs.giftAt.x), y = Math.round(gs.giftAt.y)
                    let weave = 0, greens = 0, tomato = 0, honey = 0
                    for (let yy = y - 10; yy <= y + 10; yy++) for (let xx = x - 12; xx <= x + 18; xx++) {
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                        const i = (yy * W + xx) * 4
                        const r = d[i], gg = d[i + 1], b = d[i + 2]
                        if (Math.abs(r - 0x8a) < 22 && Math.abs(gg - 0x62) < 22 && Math.abs(b - 0x38) < 22) weave++
                        else if (Math.abs(r - 0x4f) < 28 && Math.abs(gg - 0xae) < 28 && Math.abs(b - 0x5f) < 28) greens++
                        else if (Math.abs(r - 0xd1) < 26 && gg < 110 && b < 100) tomato++
                        else if (Math.abs(r - 0xe8) < 24 && Math.abs(gg - 0xa1) < 26 && Math.abs(b - 0x3a) < 26) honey++
                    }
                    return { weave, greens, tomato, honey, x, y, t: Math.round(gs.giftFx * 10) / 10 }
                },
                // #2240: BONDS AT PHONE SCALE — papersplay's method (#2080/#2133):
                // resample the live canvas at its CSS scale (the compositor's own
                // bilinear path) and count what survives the blur: each bond row's
                // glyph ink (own hue per row), the 7px label ink, filled pips, the
                // FAMILY gold pulse cell — plus how many separated label BANDS the
                // column resolves (three rows must stay three rows at phone size).
                bondsPix: () => {
                    if (!canvas || !gs) return null
                    const rect = canvas.getBoundingClientRect()
                    const k = Math.min(1, rect.width / canvas.width)
                    const ow = Math.max(8, Math.round(W * k)), oh = Math.max(8, Math.round(H * k))
                    const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh
                    const cc = cv.getContext('2d'); cc.imageSmoothingEnabled = true
                    cc.drawImage(canvas, 0, 0, ow, oh)
                    const D = cc.getImageData(0, 0, ow, oh).data
                    const at = (d, i) => i + 2 < d.length
                    const count = (x0, y0, x1, y1, pred) => {
                        let n = 0
                        for (let yy = Math.floor(y0 * k); yy < Math.ceil(y1 * k); yy++) for (let xx = Math.floor(x0 * k); xx < Math.ceil(x1 * k); xx++) {
                            const i = (yy * ow + xx) * 4
                            if (at(D, i) && pred(D, i)) n++
                        }
                        return n
                    }
                    const hueOf = (hex, tol) => {
                        const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16)
                        return (d, i) => Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < tol
                    }
                    const labelHue = hueOf('#8fa2c8', 90)
                    const rows = bondRows(gs).filter((r) => r.key !== 'kid').map((r) => ({
                        label: r.label,
                        glyph: count(r.x, r.y, r.x + 12, r.y + 8, hueOf(r.col, 60)),
                        labelInk: count(r.x + 50, r.y, r.x + 96, r.y + 8, labelHue),
                        pips: count(r.x + 14, r.y, r.x + 46, r.y + 8, hueOf(r.col, 60)),
                        gold: count(r.x + 23, r.y - 1, r.x + 31, r.y + 7, hueOf('#ffd24a', 70)),
                    }))
                    let bands = 0, prevBand = false
                    const yTop = LOT_Y + 26 + gs.people.length * 74 + 12 - 2
                    const yBot = yTop + 3 * 14 + 12   // #2588: four base bond rows now (house/fern/ivy/neigh)
                    for (let yy = Math.floor(yTop * k); yy < Math.ceil(yBot * k); yy++) {
                        let ink = false
                        for (let xx = Math.floor((PANEL_X + 62) * k); xx < Math.ceil((PANEL_X + 108) * k); xx++) {
                            const i = (yy * ow + xx) * 4
                            if (at(D, i) && labelHue(D, i)) { ink = true; break }
                        }
                        if (ink && !prevBand) bands++
                        prevBand = ink
                    }
                    // #2729: the JAR row at phone scale — same method as the bond
                    // rows (glyph ink, filled pips, label ink + the amber count),
                    // derived from jarRow so the probe can't aim at a stale seat.
                    const jr = jarRow(gs)
                    const jar = jr ? {
                        glyph: count(jr.x, jr.y - 1, jr.x + 12, jr.y + 8, hueOf(jr.col, 60)),
                        pips: count(jr.x + 14, jr.y, jr.x + 46, jr.y + 8, hueOf(jr.col, 60)),
                        labelInk: count(jr.x + 50, jr.y, jr.x + 68, jr.y + 8, labelHue),
                        countInk: count(jr.x + 68, jr.y, jr.x + 92, jr.y + 8, hueOf('#f2c14e', 90)),
                    } : null
                    // #2743: the door badges at phone scale — same compositor method
                    // as the jar row (#2729): aim at roomBadges(gs), the one derivation
                    // the painter uses, so the probe can't chase a stale seat. Checks
                    // the ~14px glyph survives the blur and the ramp track paints.
                    const rb = roomBadges(gs).map((b) => {
                        const bx = LOT_X + b.c * TILE, by = LOT_Y + b.r * TILE
                        const hue = hueOf(b.kind === 'study' ? '#d9b23c' : '#ffd24a', 70)
                        return {
                            kind: b.kind, p: +b.p.toFixed(3), n: b.n,
                            glyph: count(bx + 5, by + 2, bx + 19, by + 11, hue),
                            rampTrack: count(bx + 5, by + 12, bx + 19, by + 15, (d, i) => at(d, i) && d[i] < 90 && d[i + 1] < 70 && d[i + 2] < 40),
                            rampFill: b.p > 0 ? count(bx + 5, by + 12, bx + 5 + Math.ceil(14 * b.p), by + 15, hue) : 0,
                        }
                    })
                    return { k: +k.toFixed(3), rows, bands, jar, badges: rb }
                },
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
                    `d${gs.day} ${gs.hour.toFixed(1)}h §${gs.money} jar=${gs.jar}/${GARDEN.price} wish ${gs.content}/${WIN_CONTENT} items=${gs.items.length} build=${gs.build}${gs.visitor ? ' Fern!' : ''}${gs.ivy ? ` Ivy${gs.ivy.gift ? '🧺' : ''}!` : ''}${gs.pet ? ' 🐈 Miso' : ''}${gs.kid ? ' ★ Pip' : ''} ⏱${SPEED_NAMES[gs.speed]}`,   // #2227: the dial reads here · #2721: so does the garden jar
                    gs.people.map((p) => `${p.name}:${NEEDS.map((n) => Math.round(p.needs[n] * 100)).join('/')}${p.working ? ' @work' : ''}${p.faintT > 0 ? ' FAINT' : ''}`).join('  '),
                ] : ['attract'],
                actions: [
                    { label: 'GIVE §500', run: () => { if (gs) gs.money += 500; return 'rent money' } },
                    { label: 'BUILD ROOM', run: () => { if (!gs) return 'no sim'; if (gs.ext >= 2) return 'the lot is full — two rooms stand'; gs.money = Math.max(gs.money, GARDEN.price); const ok = buildRoom(gs, gs.ext >= 1 ? GARDEN : eastWing(DEFAULT_ANCHOR)); return ok ? (gs.ext === 2 ? 'garden room up — two rooms on the lot' : 'spare room up — the lot grew') : 'somewhere in the way' } },   // #2689: the button raises the next wing, wherever the law lets it
                    { label: 'FILL JAR', run: () => { if (gs) gs.jar = GARDEN.price; return gs ? `the garden jar reads ${gs.jar}/${GARDEN.price} — kit two buys` : 'no sim' } },   // #2721: the kit-two fund, for the eye
                    { label: 'SEND ROUND', run: () => { if (!gs) return 'no sim'; if (!gs.kid) return 'no child on the lot — the round needs Pip'; gs.routeDay = -1; return `the round re-arms — jar ${gs.jar}/${GARDEN.price}, next 07:00 it pays` } },   // #2721
                    { label: 'ADOPT CAT', run: () => { if (gs && !gs.pet) { gs.money = Math.max(gs.money, PET.price); adoptPet(gs) } return gs && gs.pet ? 'Miso trots in through the gate' : 'already home / no sim' } },   // #2197
                    { label: 'ADOPT KID', run: () => { if (gs && !gs.kid) { gs.money = Math.max(gs.money, KID.price); adoptKid(gs) } return gs && gs.kid ? 'Pip moves in through the gate' : 'already home / no sim' } },   // #2203
                    { label: 'GRANT WISH', run: () => { if (gs) { gs.content = WIN_CONTENT } return 'wish banked — next content tick wins' } },
                    { label: 'RING FERN', run: () => { if (gs) { gs.visitAfter = Math.min(gs.visitAfter, Math.floor(gs.hour)); gs.visitGap = 0 } return 'the bell rings soon' } },
                    { label: 'RING IVY', run: () => { if (gs) { gs.ivyAfter = Math.min(gs.ivyAfter, Math.floor(gs.hour)); gs.ivyGap = 0 } return 'Ivy swings by soon' } },   // #2143
                { label: 'DROP PAPER', run: () => { if (gs) { gs.paperDay = -1; gs.paperAfter = Math.min(gs.paperAfter, Math.floor(gs.hour)) } return gs ? 'the route is due — news hits the step' : 'no sim' } },   // #2238
                { label: 'DROP MEAL', run: () => { if (gs) { if (gs.mealSlot >= 3) { gs.mealSlot = 0; scheduleMeals(gs) } const sl = gs.mealSlot; if (gs.hour < gs.mealAfter[sl]) gs.mealAfter[sl] = Math.floor(gs.hour) } return gs ? 'the bell is due — food hits the kitchen (unless one is already out)' : 'no sim' } },   // #2244
                { label: 'RING TRUCK', run: () => (gs ? ringTruck(gs) : 'no sim') },   // #2503: the jingle lands now — a cone hits the curb (retires any cone standing)
                { label: 'RING SNEAK', run: () => (gs ? ringSneak(gs) : 'no sim') },   // #2520: boots now — the sneak tries the gate at once (the alarm still answers if it stands)
                { label: 'RING PROWL', run: () => (gs ? ringProwl(gs) : 'no sim') },   // #2532: the flap now — Miso takes the lot at once, parity or not (no cat: honest refusal)
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
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onLift)
            window.removeEventListener('pointercancel', onLift)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            if (canvas) canvas.remove()
        }
    }, [])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false; setLedgerSnap(null) }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/45 flex flex-col items-center justify-end pb-24 text-center px-6 pointer-events-none">
                    <h1 className="text-5xl font-black mb-2 tracking-wide" style={{ color: '#ffd24a', textShadow: '3px 3px 0 #2c5aa0, 0 8px 22px #000' }}>HOMEBODY</h1>
                    <p className="font-mono text-[11px] text-sky-100/70 mb-4 tracking-widest">A LITTLE SUBURBAN LIFE SIM</p>
                    <AttractMessage className="mb-4 text-amber-50/85" messages={MESSAGES} onIndex={(i) => { marqueeIx.current = i }} />
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
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'HOMEBODY')} ledger={ledgerSnap} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '⚒', code: 'KeyB' }} />
        </div>
    )
}

export default HomebodyGame

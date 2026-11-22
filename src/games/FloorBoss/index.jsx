// FLOOR BOSS — the arcade shell and painter. The shift rules live in ./sim.js
// (pure, seeded); this file draws it and wires input, audio, the pad, the
// pause screen and the harness hooks.
//
// Look: a control-room blueprint of a night shift — deep navy floor with a
// pale survey grid, amber hazard-stripe walls, a conveyor with running
// chevrons, orange pallet racks, teal hauler plates with a single amber eye,
// and a green shipping pad that pulses when a truck seals. Rush hour bathes
// the whole floor in amber. Vector title: drawn at screen resolution.
//
// The renderer's spatial contract is screen = grid × TILE + origin, so the
// harness can prove every painted robot sits where the sim says.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog } from '../../utils/watch'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, recordLiveTick, armLiveCapture } from '../../utils/gameContract'
import { initAutoRecord, askConsent, beginRun, endRun, startBusy, setStartBusy } from '../../utils/autoRecord'
import { W, H, TILE, GX, GY, CHIPS, orderRect, applyTap } from './taps.js'
import { createEpisode, saveEpisode, episodeStats } from '../../utils/robot/episode.js'
import { MANIFEST_REV } from '../../utils/robot/assets.js'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell, setTool,
    toggleAuto, hireRobot, nextShift, rungPrice, rushNow,
    COLS, ROWS, SHIFT, STRIKES, RACK_COST, ROBOT_COST, RACK_CAP, STOW_PAY,
    BAY_CELL, OUT_CELLS, ARM_CELL, ARM_REACH, MAX_ROBOTS, REPAIR_TICKS, cornerEscapes, laneEscapes, kneeEscapes, swingMarkers, flowMarks, flowHeat, liveKnees, liveTails, liveRights,
} from './sim.js'

const SIM_MS = 1000 / 60
// W/H/TILE/GX/GY + the tap geometry (#1712) live in taps.js — the shell and
// the dataset replay share ONE definition of what a canvas point means.
const PX = (x) => GX + x * TILE
const PY = (y) => GY + y * TILE

const KIND_COLOR = { crate: '#b98a4a', can: '#9fb8c8', coil: '#c07a3e' }

const ITEM_DRAW = {
    // top-down cargo, drawn centered — crate / tin / copper coil
    crate: (ctx, x, y, s = 1) => {
        ctx.fillStyle = '#8a6434'; ctx.fillRect(x - 5 * s, y - 5 * s, 10 * s, 10 * s)
        ctx.fillStyle = '#b98a4a'; ctx.fillRect(x - 4.4 * s, y - 4.4 * s, 8.8 * s, 8.8 * s)
        ctx.strokeStyle = '#e8d9b8'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x, y - 4.4 * s); ctx.lineTo(x, y + 4.4 * s); ctx.stroke()
    },
    can: (ctx, x, y, s = 1) => {
        ctx.fillStyle = '#6e8494'; ctx.beginPath(); ctx.arc(x, y, 4.4 * s, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#c8d8e4'; ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#3e5568'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(x, y, 4.4 * s, 0, Math.PI * 2); ctx.stroke()
    },
    coil: (ctx, x, y, s = 1) => {
        ctx.strokeStyle = '#a05f28'; ctx.lineWidth = 2.6 * s
        ctx.beginPath(); ctx.arc(x, y, 3.6 * s, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = '#e0954e'; ctx.lineWidth = 1.4 * s
        ctx.beginPath(); ctx.arc(x, y, 3.6 * s, 0.5, 3.6); ctx.stroke()
    },
}
const drawItem = (ctx, kind, x, y, s = 1) => (ITEM_DRAW[kind] || ITEM_DRAW.crate)(ctx, x, y, s)

const FB_ATTRACT = [
    'RUN THE NIGHT SHIFT — THE FLOOR IS YOURS',
    'CLICK A BOT, THEN CLICK A RACK TO DISPATCH IT',
    'CLICK BROKEN BOTS REPEATEDLY TO TURBO-REPAIR',
    'JAMMED AISLES: CLICK ONE BOT TO BACK IT OFF',
    'BUILD RACKS ($60) AND HIRE ROBOTS ($150) FROM THE TOP BAR',
    'THROUGHPUT IS ALSO YOUR BUDGET — EVERY RACK AND BOT COMES OUT OF IT',
    'AUTO ROUTES THE BOTS — YOUR JOB IS TRIAGE: FIX, UNJAM, BUILD, CALL TRUCKS',
    'B CYCLES THE BUILD TOOL · F TOGGLES AUTO-DISPATCH',
    'THE SERVO SELF-STOWS WHEN BOTS ARE ALL BUSY',
    'PACKED ORDERS STAGE ON THE PAD — TAP THE DOCK TO CALL THE TRUCK EARLY',
    'FULL TRAILERS EARN FREIGHT — FAR POSTS PAY MORE, THE ROAD COSTS PICKUPS',
    'RUSH HOUR PAYS 1.5x — RUSH ORDERS ALSO RUN COLD',
    'THREE EXPIRED ORDERS AND THE BOSS ENDS YOUR SHIFT',
    'CLEAR THE QUOTA AND THE NEXT SHIFT RUNS HOTTER — HOW LONG CAN YOU LAST?', // ladder (#2346)
]

const FloorBossGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const [watching, setWatching] = useState(false) // #1637 WATCH: the proven floor manager runs the shift
    const watchingRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.floorbossStage = '1'
        canvas.width = W * 2; canvas.height = H * 2
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.scale(2, 2)

        let gs = makeGame(1337)
        let raf = 0, last = 0, acc = 0
        const ap = createAutopilot()
        const apM = createAutopilot(1) // #2555: seat M — the model manager for duel mode
        let duelMode = false
        let demoSeed = 1337
        let contractSeed = 4242
        const parts = []
        let shake = 0, flash = 0
        const keys = { left: false, right: false, up: false, down: false }
        let edgeA = false, edgeB = false
        // #1712 S2: canvas taps queue and apply at the tick that consumes them,
        // so the banked stream and the sim advance by the same sequence (live ==
        // replay, drain-one-per-tick). watchUsed: a shift where the brain ever
        // took the floor is never labeled a human's hands (autoRecord sources
        // resolve at finish — the conservative stamp keeps model hands out of
        // train; honest gap in the README).
        const tapQueue = []
        let watchUsed = false
        let overAt = 0
        let episode = null

        // ---- polish animation state (#1278) — renderer-only, never touches the
        // sim, so hashes are untouched. #1911 moved the TRUCK into the sim (it is
        // the load-out pipe now); what stays painter-local is the decoration:
        // trails, arcs and the pulse phase.
        // #1877: painter clocks advance in WORLD ticks (gs.tick), not display
        // frames — software-rendered Chrome paints at 10-15 fps and the truck's
        // back-in/park/drive-off wall-clock gates flaked on main for it. The
        // catch-up clamp (8 ticks/frame) keeps a stalled tab from teleporting.
        let lastPaintTick = 0
        const botAnim = new Map() // bot id -> { dir, turn, sway, trail }
        // #2700 manners polish — renderer-only, hashes untouched (same law as #1877):
        const duckSlide = new Map() // bot id -> { ox, oy, t0 } — a duck steps the body into the bay over one cadence, it does not blink
        let duckTaughtOn = null // the game instance whose first duck has been named (new makeGame resets per identity; shiftstart re-names per night)
        let duckTeach = null // { x, y, from, until } — the GIVE WAY plate on a shift's first duck
        const givenAt = new Map() // "x,y" -> tick — the moment a rival crossed a vacated cell: that bay reads GIVEN
        const ATTRACT_SEEDS = [55, 74, 107, 126, 148] // #2760 re-measured after the tail law: the #2738 window seeds (1/20/22/26/31) went cold — counterweight routing reshuffles the congestion that produces courtesy, and four of those loops no longer duck inside the minute. Seeds 1–240 re-swept; these five win AND show their first courtesy at 5324/5220/5172/4827/4593 — mid-band, far from both window edges, inside the same 36–96s span a visitor watches
        const orderEnter = new Map() // order id -> slide-in ticks left
        const arcItems = [] // transfer ghosts { x0,y0,x1,y1,k,n?,kind,servo? } — bay handoff + servo carry (#1877)
        let armTip = { x: 0, y: 0 }
        let grip = 1 // gripper spread: 1 open, 0 closed
        let diamondA = 0 // last-drawn reach-diamond alpha (harness eye on the pulse, #1877)
        let gripSway = 0, gripShud = 0 // docked-gripper idle motion, paint-time only (#1877 item 3)
        let escGrowAt = -999, escLast = 0 // escrow chip blinks only right after money lands (#1877 freight context)
        let humT = 60 // 60 bpm floor hum while bots move

        const beginEpisode = (duel = false) => {
            try {
                // #2555: the duel finally uses the second slot the #1144 episode
                // format always pinned — two seats, two sources.
                episode = createEpisode({ gameId: 'floor-boss', method: 'dpad', seed: gs.seed >>> 0, players: duel ? 2 : 1, sources: duel ? ['human', 'model'] : ['human'], task: duel ? 'floor-boss-duel' : 'floor-boss-shift', assets: MANIFEST_REV })
            } catch { episode = null }
        }
        const recordTick = (pad, padM = null) => {
            if (!episode) return
            try {
                const p = pad || { left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB }
                const seat = [{ left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, a: !!p.a, b: !!p.b }]
                if (padM) seat.push({ left: !!padM.left, right: !!padM.right, up: !!padM.up, down: !!padM.down, a: !!padM.a, b: !!padM.b }) // #2555: slot 1 is the model's own hands
                episode.addTick(seat, null, stateHash(gs))
            } catch { episode = null }
        }
        const closeEpisode = (won) => {
            if (!episode) return
            try { saveEpisode(episode.finish({ success: won, score: gs.score, finalHash: stateHash(gs) })) } catch { /* storage */ }
            episode = null
        }

        // HUD chip click zones + geometry: imported from taps.js (#1712) so the
        // painter, the banked tap and the Node replay share one truth.

        const burst = (x, y, n, col, spd = 2, up = -0.6) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * spd
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, t: 0, col, g: 0.1 })
            }
        }

        const handleEvents = (evts, tick) => {
            for (const e of evts) {
                switch (e.type) {
                    case 'order': audioController.playTone(300, 0.05, 'square', 0.04); break
                    case 'armload': audioController.playTone(520, 0.05, 'triangle', 0.05); break
                    case 'armswing': audioController.playSweep(240, 420, 0.14, 'triangle', 0.045); // #1877: the carry rides the same ghost-arc
                        // painter the bay handoff uses, timed to the swing so the cargo
                        // visibly travels the gantry's sweep instead of just landing
                        if (gs.arm.held && gs.arm.target) arcItems.push({ x0: armTip.x, y0: armTip.y + 4, x1: PX(gs.arm.target.x) + 13, y1: PY(gs.arm.target.y) + 3, k: 0, n: gs.arm.swingT0 || 44, kind: gs.arm.held, servo: true }); break
                    case 'armstow': audioController.playTone(560, 0.05, 'square', 0.05); audioController.playTone(840, 0.07, 'square', 0.04, 0.06); burst(PX(e.x) + 13, PY(e.y) + 13, 4, '#7ec8ff', 1.2); fx('SERVO', '#7ec8ff', PX(e.x) + 13, PY(e.y) + 4); if (e.s >= 0) tillFx(e.s, `+${STOW_PAY} RACK`); break // #2561 item 2
                    case 'pick': audioController.playSweep(440, 760, 0.07, 'square', 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 3, '#ffe9a8', 1); break
                    case 'bay': audioController.playSweep(320, 560, 0.07, 'triangle', 0.05); arcItems.push({ x0: armTip.x, y0: armTip.y + 4, x1: PX(e.x) + 13, y1: PY(e.y) + 3, k: 0, kind: e.k }); break
                    case 'stow': audioController.playTone(620, 0.05, 'square', 0.05); audioController.playTone(930, 0.07, 'square', 0.04, 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 4, '#9fe8b4', 1.2); if (e.s >= 0) tillFx(e.s, `+${STOW_PAY} RACK`); break // #2561 item 2: the credit names itself on the till it lands
                    case 'deliver': audioController.playTone(740, 0.06, 'square', 0.05); break
                    case 'ship': {
                        // #1921 freight line: pack no longer rings the till — it BOOKS
                        // the money onto the parcel. Blue hold chip; the register sound
                        // moves to the freight event, when the trailer actually hauls.
                        audioController.playTone(494, 0.07, 'triangle', 0.05)
                        fx(`HOLD +${e.pay}`, '#7ec8ff', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y))
                        burst(PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) + 13, 4, '#7ec8ff', 1.2)
                        break
                    }
                    case 'late': audioController.playTone(400, 0.09, 'sawtooth', 0.06); audioController.playTone(300, 0.12, 'sawtooth', 0.05, 0.09); fx(`HOLD +${e.pay} LATE`, '#ffd23f', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y)); break
                    // freight line (#1921): the till rings at the trailer, and full
                    // trailers ring louder — money follows freight
                    case 'freight': {
                        audioController.playTone(523, 0.08, 'square', 0.07)
                        audioController.playTone(659, 0.08, 'square', 0.07, 0.09)
                        audioController.playTone(784, 0.14, 'square', 0.07, 0.18)
                        fx(`+${e.pay}`, '#5dff8f', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y))
                        burst(PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) + 13, 6, '#9fe8b4', 1.8)
                        break
                    }
                    case 'bonus': {
                        audioController.playTone(660, 0.07, 'triangle', 0.06); audioController.playTone(880, 0.09, 'triangle', 0.06, 0.08); audioController.playTone(1175, 0.12, 'triangle', 0.05, 0.17)
                        fx(`FREIGHT +${e.amt}`, '#ffd23f', PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) - 26)
                        if (gs.duel) { // #2561 item 2: the drive-off pays each seat's till — name each share
                            if (e.s0 > 0) tillFx(0, `+${e.s0} FREIGHT`)
                            if (e.s1 > 0) tillFx(1, `+${e.s1} FREIGHT`)
                        }
                        if (e.heavy) fx(`HEAVY x${e.heavy}`, '#9ad7ff', PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) - 38) // heavy freight names itself on the till (#1931)
                        burst(PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) + 13, 8, '#ffd23f', 2)
                        break
                    }
                    // load-out (#1911): the dock speaks in truck sounds
                    case 'truckin': audioController.playTone(180, 0.07, 'square', 0.05); audioController.playTone(180, 0.07, 'square', 0.05, 0.14); fx('TRUCK IN', '#7ec8ff', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y) - 12); if (e.fee) fx(`EXPRESS −${e.fee}`, '#ff9a4f', PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) - 12); break
                    case 'loadout': {
                        audioController.playNoise(0.05, 0.05); audioController.playTone(220, 0.05, 'square', 0.04)
                        if (e.w === 2) audioController.playTone(70, 0.1, 'square', 0.08) // heavy freight thuds onto the flatbed (#1931)
                        const p = gs.pad.length ? OUT_CELLS[gs.pad.length % 2] : OUT_CELLS[0]
                        arcItems.push({ x0: PX(p.x) + 13, y0: PY(p.y) + 10, x1: gs.truck.x + 20, y1: 420, k: 0, n: 14, kind: 'crate' })
                        break
                    }
                    case 'truckout': audioController.playTone(150, 0.12, 'sawtooth', 0.07); audioController.playTone(200, 0.12, 'sawtooth', 0.06, 0.1); fx(e.tap ? 'SENT!' : e.far === 2 ? `LONG HAUL OUT x${e.carry || 1}` : e.far === 1 ? `REGIONAL OUT x${e.carry || 1}` : `HAUL OUT x${e.carry || 1}`, e.far === 2 ? '#b07aff' : e.far === 1 ? '#ff9a4f' : '#ffd23f', PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) - 12); break
                    case 'expire': audioController.playSweep(340, 160, 0.22, 'sawtooth', 0.08); shake = 6; flash = 7; fx('EXPIRED', '#ff5a4f', W / 2, 200); break
                    case 'quota': audioController.playFanfare(); fx('QUOTA CLEARED', '#5dff8f', W / 2, 190); break
                    case 'jam': audioController.playTone(140, 0.12, 'square', 0.08); audioController.playTone(110, 0.1, 'square', 0.06, 0.12); audioController.playNoise(0.06, 0.05); fx('JAM!', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'jamclear': audioController.playSweep(220, 480, 0.09, 'square', 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 3, '#7ec8ff', 1.2); break
                    case 'jamauto': audioController.playSweep(200, 380, 0.12, 'square', 0.04); break
                    case 'duck': { // #2692 DUCK & PASS — a cart taking the bay reads quiet and cyan: courtesy, not alarm
                        audioController.playSweep(620, 380, 0.06, 'triangle', 0.035); burst(PX(e.fx) + 13, PY(e.fy) + 13, 3, '#78dceb', 1.1)
                        // #2700: a duck is a STEER, not a teleport — slide the body into
                        // the shoulder over one cadence (ease-out), and give the backpedal
                        // the swing impulse a 180° flip never triggers through dir-change.
                        const db = gs.robots.find((b) => b.yield && b.yield.fx === e.fx && b.yield.fy === e.fy && b.x === e.x && b.y === e.y)
                        if (db) {
                            duckSlide.set(db.id, { ox: e.fx - e.x, oy: e.fy - e.y, t0: gs.tick })
                            const an = botAnim.get(db.id)
                            if (an && (((db.dir - an.dir) % 4 + 4) % 4) === 2) an.sway = 1
                        }
                        // #2700 TEACH THE COURTESY: the first duck of a shift names itself
                        // once — like the reach diamond taught patience (#1877) and
                        // refusals teach plugs (#2627), the give-way reads as law
                        // grammar, not decoration.
                        if (duckTaughtOn !== gs) {
                            duckTaughtOn = gs
                            duckTeach = { x: e.x, y: e.y, from: gs.tick, until: gs.tick + 150 }
                            audioController.playTone(660, 0.05, 'triangle', 0.04); audioController.playTone(880, 0.07, 'triangle', 0.04, 0.07)
                            fx('GIVE WAY', '#78dceb', PX(e.x) + 13, PY(e.y) + 20)
                        }
                        if (gs.duel && e.s >= 0) fx(`BAY: ${e.s === 1 ? 'MODEL' : 'YOU'}`, e.s === 1 ? '#57c7ff' : '#ffd23f', PX(e.x) + 13, PY(e.y) + 8)
                        break;
                    }
                    case 'turbo': audioController.playTone(900 + Math.random() * 300, 0.03, 'square', 0.03); repairPulse.set(`${e.x},${e.y}`, gs.tick); break
                    case 'break': audioController.playNoise(0.18, 0.09); audioController.playSweep(300, 90, 0.24, 'sawtooth', 0.07); shake = 7; fx('BREAKDOWN', '#ff5a4f', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'repaired': audioController.playSweep(400, 900, 0.14, 'triangle', 0.06); burst(PX(e.x) + 13, PY(e.y) + 13, 5, '#7ec8ff', 1.5); break
                    case 'build': audioController.playTone(180, 0.1, 'square', 0.07); burst(PX(e.x) + 13, PY(e.y) + 13, 5, '#e0954e', 1.5); spendFlash = e.s === 1 // #2561 item 3: seat M's buys must read as M's — model colors, model credit
                        ? { label: `MODEL BUILDS — RACK −$${RACK_COST} OFF ITS NIGHT`, until: gs.tick + 180, col: '#57c7ff' }
                        : { label: `RACK −$${RACK_COST} — SPEND COMES OUT OF THROUGHPUT`, until: gs.tick + 180 }; break
                    case 'hire': audioController.playTone(480, 0.07, 'square', 0.06); audioController.playTone(600, 0.1, 'square', 0.05, 0.08); spendFlash = e.s === 1 // #2561 item 3
                        ? { label: `MODEL HIRES — BOT −$${ROBOT_COST} OFF ITS NIGHT`, until: gs.tick + 180, col: '#57c7ff' }
                        : { label: `BOT −$${ROBOT_COST} — SPEND COMES OUT OF THROUGHPUT`, until: gs.tick + 180 }; break
                    case 'poor': audioController.playTone(120, 0.12, 'square', 0.06); fx('NO BUDGET', '#ff9a4f', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'refuse': audioController.playTone(110, 0.1, 'square', 0.05); break
                    case 'aisle': {
                        audioController.playSweep(240, 120, 0.12, 'square', 0.05); fx(e.why === 'pocket' ? 'DEAD-END AISLE' : e.why === 'rack' ? 'STRANDED A RACK' : e.why === 'lane' ? 'NO PASSING LANE' : e.why === 'corner' ? 'NO CORNER STACK' : e.why === 'knee' ? 'NO KNEE — RACKED THE SWING' : 'NO SERVICE LANE', '#ffd23f', PX(e.x) + 13, PY(e.y) + 8) // #2546, #2614, #2627, #2711
                        // #2711 KNEE refusal — the click sat in the swing of a turn
                        // the floor drives. No provable plug exists (demolition is
                        // not a verb and the elbow itself is not the offense — the
                        // diagonal is), so the lesson is the cell plus what the law
                        // can prove about it (#2711 s2 TEACH THE KNEE): kneeEscapes
                        // names the bends the click blocks (amber — the law's own
                        // grammar) and the beside-place cells that are legal clicks
                        // in their own right (green — the honest fix is beside the
                        // swing, never in it; monotonicity says no plug frees one).
                        if (e.why === 'knee') {
                            const esc = kneeEscapes(gs, e.x, e.y)
                            kneeMark = { x: e.x, y: e.y, bends: esc.bends, alts: esc.alts, from: gs.tick, until: gs.tick + 150 }
                            if (esc.alts.length) {
                                audioController.playTone(520, 0.05, 'triangle', 0.04); audioController.playTone(780, 0.07, 'triangle', 0.04, 0.07)
                                fx('RACK BESIDE — KEEP THE SWING CLEAR', '#5dff8f', PX(e.x) + 13, PY(e.y) + 20)
                            } else {
                                fx('SWING STAYS OPEN', '#5dff8f', PX(e.x) + 13, PY(e.y) + 20)
                            }
                        }
                        // #2627 s2 TEACH THE ELBOW: a corner refusal shows its honest
                        // exit — the mouths that would spur the elbow light up green,
                        // so the fifth law self-teaches like the reach diamond taught
                        // patience (#1877). Re-deriving at drain time is exact: the
                        // refusal landed no rack (#1917), so the floor is exactly
                        // the board the refused click saw.
                        // #2622 TEACH THE LANE: the same green lesson on a lane
                        // refusal — laneEscapes names the mouths that would spur the
                        // aisle into a legal dead-end; the bay the law wished for is
                        // already walled by the time the banner fires, so the lesson
                        // shows the plug it can prove (and says LEAVE A BAY when even
                        // the mouths are traps).
                        if (e.why === 'corner' || e.why === 'lane') {
                            const esc = e.why === 'corner' ? cornerEscapes(gs, e.x, e.y) : laneEscapes(gs, e.x, e.y)
                            elbowTeach = { cells: esc, from: gs.tick, until: gs.tick + 150 } // from: a restart resets gs.tick; a stale lesson must not follow the player into a new floor
                            if (esc.length) {
                                audioController.playTone(520, 0.05, 'triangle', 0.04); audioController.playTone(780, 0.07, 'triangle', 0.04, 0.07)
                                fx('SPUR IT — PLUG A MOUTH', '#5dff8f', PX(e.x) + 13, PY(e.y) + 20)
                            } else {
                                fx(e.why === 'corner' ? 'LEAVE THE ELBOW FREE' : 'LEAVE A BAY', '#5dff8f', PX(e.x) + 13, PY(e.y) + 20)
                            }
                        }
                        // #2622 item 4 DUEL REFUSAL SEAT STAMP — mid-duel the clock
                        // runs and both managers share the floor: a banner that does
                        // not say WHOSE click died reads as an accusation against
                        // you. In duel, the refusal names its seat in the seat's own
                        // colour beneath the amber law (events stay out of stateHash,
                        // #1373 — this is chrome, the law stays sim truth).
                        if (gs.duel && (e.why === 'lane' || e.why === 'corner' || e.why === 'knee')) {
                            fx(`${e.why === 'lane' ? 'LANE' : e.why === 'knee' ? 'KNEE' : 'ELBOW'}: ${e.s === 1 ? 'MODEL' : 'YOU'}`,
                                e.s === 1 ? '#57c7ff' : '#ffd23f', PX(e.x) + 13, PY(e.y) + 8) // same anchor as the law — the #2254 lane stack raises it above the banner and the tail, one line per message
                        }
                        break
                    }
                    case 'dispatch': audioController.playSweep(500, 700, 0.05, 'square', 0.04); break
                    case 'select': audioController.playTone(660, 0.03, 'sine', 0.04); break
                    case 'prio': audioController.playTone(820, 0.05, 'triangle', 0.05); break
                    case 'auto': audioController.playTone(e.on ? 700 : 420, 0.05, 'square', 0.04); break
                    case 'overflow': audioController.playNoise(0.08, 0.04); if (tick % 3 === 0) fx('BELT FULL', '#ff9a4f', PX(1) + 13, PY(1)); break
                    case 'rush': audioController.playSweep(420, 880, 0.3, 'sawtooth', 0.06); audioController.playSweep(880, 420, 0.3, 'sawtooth', 0.05, 0.3); fx('RUSH HOUR', '#ffd23f', W / 2, 170); break
                    // #2352: the sim stamps the clock-in — the painter takes the stamp
                    // and slams the rung onto the floor (paintClockIn).
                    case 'shiftstart': clockIn = { shift: e.shift, quota: e.quota, until: gs.tick + 130 }; duckTaughtOn = null; break // #2700: a new night names the courtesy again
                    default: break
                }
            }
        }

        // #2561: a credit landing on the twin till must name itself — the seat's
        // color, anchored under the till (house credit has no seat chip to name).
        // It also arms the seat chip's growth blink (#2561 item 2).
        const tillGrowAt = [-9999, -9999]
        const tillFx = (seat, msg) => {
            if (!gs.duel || seat < 0 || seat > 1) return
            tillGrowAt[seat] = gs.tick
            fx(`${msg} ${seat === 0 ? 'YOU' : 'MODEL'}`, seat === 0 ? '#ffd23f' : '#57c7ff', 436, 44)
        }
        const fx = (msg, col, x, y) => {
            // #2254 item 2: dock messages all anchored at the same spot overprinted
            // into a smear. Stack them one per lane above the anchor (lane frees when
            // the message fades), so a busy dock reads as a list, not a pile.
            const key = Math.round(x / 24)
            let lane = 0
            for (const f of gs.fx) if (f.laneKey === key && f.k <= 50) lane = Math.max(lane, f.lane + 1)
            gs.fx.push({ msg, col, x, y: y - lane * 11, k: 0, lane, laneKey: key })
        }
        // #2254 item 4: a turbo-repair click must visibly count — a pulse ring per
        // click at the bot, painter-only like the rest of the fx.
        const repairPulse = new Map() // "x,y" -> tick of the last turbo click
        let spendFlash = null // { label, until } — #2254 item 3: buying reads as a cost
        let elbowTeach = null // { cells, until } — #2627 s2 / #2622: a corner or lane refusal lights its honest plugs
        let kneeMark = null // { x, y, until } — #2711: a knee refusal keep-clears its cell
        let clockIn = null // { shift, quota, until } — #2352: the night number slams in on advance

        const finish = () => {
            const won = gs.end === 'win'
            overAt = performance.now()
            watchingRef.current = false; setWatching(false) // #1637 the shift ends in your hands
            setEnd({ won, kind: gs.end, score: gs.score, shipped: gs.shipped, expired: gs.expired, stows: gs.stows, reason: gs.endReason })
            const board = (() => { try { return JSON.parse(localStorage.getItem('floorboss.board') || '[]') } catch { return [] } })()
            if (gs.score > 0) localStorage.setItem('floorboss.board', JSON.stringify([...board, { score: gs.score, shift: gs.shift, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8))) // #2352: entries remember how deep the run climbed
            // #2352: the ladder itself is a scoreboard — remember the deepest rung any
            // run reached, so the board reads "how deep did you get", not just points.
            if (gs.shift > 1) { const deep = +(localStorage.getItem('floorboss.deep') || 0); if (gs.shift > deep) localStorage.setItem('floorboss.deep', String(gs.shift)) }
            if (gs.ducks > 0) { const mb = +(localStorage.getItem('floorboss.bays') || 0); if (gs.ducks > mb) localStorage.setItem('floorboss.bays', String(gs.ducks)) } // #2700: manners are countable — the smoothest floor keeps the board tally
            // #2958 CAREER TAKES: a CLEARED night is a door, not an ending — the
            // take stays open so clocking into the next shift banks on as ONE take
            // (same seed, same rng stream; the ladder's shift bits ride stateHash
            // across the seam, #2346 law). Only a LOST night ends the take here;
            // a won one ends at the over-screen's attract exit (closeTake) or at
            // unmount. Replay: plaicraft-dataset clocks nextShift at the seam
            // because rows past a win can only mean the player clocked in.
            if (!won) closeEpisode(false)
            if (won) audioController.playFanfare(); else audioController.playDeath()
            setMode('over')
            if (!won) endRun() // #1711/1712: a lost run ends its take here (no-op when idle/declined)
            tapQueue.length = 0 // #1712: no tap banks until the pad is back on a live floor
        }
        // #2958: the take ends at the REAL end — a lost whistle (finish), a
        // cleared night left behind for the attract, or unmount. Call while gs
        // still holds the state the take's last row proved.
        const closeTake = () => { const won = gs.end === 'win'; closeEpisode(won); endRun() }

        const livePad = () => ({ left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB })

        // #2700: ducks are earned by traffic, and traffic peaks late on a shift —
        // measured across 4000 seeds, the first autopilot duck lands at tick 3780+
        // (congestion builds as the floor expands). A cold clock-in almost never
        // shows the courtesy, so the attract demo clocks in mid-heat: fixed seeds
        // × fixed autopilot = every loop the same hot floor, ducks a few seconds
        // after a visitor arrives — and the first live duck names itself (the
        // GIVE WAY teach stays armed through the warm-up).
        const warmAttract = () => {
            while (gs.tick < 3600 && !gs.end) step(gs, [ap(gs)])
            gs.ev.length = 0 // no minute of stale events bursts into the painter
            duckSlide.clear(); givenAt.clear(); botAnim.clear(); elbowTeach = null; duckTeach = null; kneeMark = null
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (gs.end) { gs = makeGame(ATTRACT_SEEDS[++demoSeed % ATTRACT_SEEDS.length]); beginEpisode(); warmAttract() }
                step(gs, [ap(gs)])
                handleEvents(gs.ev, gs.tick)
                return
            }
            if (sc !== 'play') return
            // #1637 WATCH: seat the quota-proven autopilot (it drives ONLY the
            // pad — cursor + PICK/TOOL — and triages the live floor, so seating
            // or releasing mid-shift resumes from exactly where the floor stands;
            // floorbosscheck grades this same manager to quota).
            // #1712 S2: the pointer bank rides the next tick the loop runs
            // (taps apply at click time, onCanvasClick — replay mirrors:
            // apply-before-step, identical state at every checkpoint).
            let tapPad = null
            if (tapQueue.length && !gs.end) {
                const tap = tapQueue.shift()
                // onePad's pointer channel is 0..1 canvas space (#420) — bank the
                // normalized point; replay rebuilds pixels from it (deterministic).
                tapPad = { x: tap.px / W, y: tap.py / H, down: true }
            }
            const pad = watchingRef.current && !gs.end ? ap(gs) : livePad()
            if (tapPad) pad.pointer = tapPad
            const mpad = duelMode && !gs.end ? apM(gs) : null // #2555: seat M drives its own slot beside you
            step(gs, mpad ? [pad, mpad] : [pad])
            recordTick(pad, mpad)
            // #1712 S2: bank exactly what THIS tick consumed (attract ticks never
            // enter a take; post-over ticks do only when the player clocks into
            // the next shift — career takes, #2958 — and never while the over
            // screen holds the floor).
            recordLiveTick(mpad ? [pad, mpad] : [pad])
            edgeA = false; edgeB = false
            handleEvents(gs.ev, gs.tick)
            // the floor hums at 60 bpm while bots work — gain scales with how
            // many robots are on duty (soft machinery, not a metronome)
            if (--humT <= 0) {
                humT = 60
                if (!gs.end) {
                    const active = gs.robots.filter((b) => !b.broken && (b.moveT > 0 || b.pickT > 0 || b.task.kind !== 'idle')).length
                    if (active) {
                        const v = 0.005 + 0.004 * Math.min(4, active)
                        audioController.playTone(62, 0.5, 'sine', v)
                        audioController.playTone(65.5, 0.5, 'sine', v * 0.7)
                    }
                }
            }
            if (gs.end) finish()
        }

        // ---------- painter ----------
        const paintFloor = () => {
            ctx.fillStyle = '#0d1722'; ctx.fillRect(GX, GY, COLS * TILE, ROWS * TILE)
            ctx.strokeStyle = 'rgba(76,120,150,0.14)'; ctx.lineWidth = 1
            for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(GX + x * TILE + 0.5, GY); ctx.lineTo(GX + x * TILE + 0.5, GY + ROWS * TILE); ctx.stroke() }
            for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(GX, GY + y * TILE + 0.5); ctx.lineTo(GX + COLS * TILE, GY + y * TILE + 0.5); ctx.stroke() }
        }

        const paintWalls = () => {
            // hazard stripes around the perimeter
            const dash = 10
            const drawStripe = (x, y, w, h) => {
                ctx.save()
                ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
                ctx.fillStyle = '#171310'; ctx.fillRect(x, y, w, h)
                ctx.strokeStyle = '#c9971f'; ctx.lineWidth = 3.2
                for (let i = -h; i < w + h; i += dash) {
                    ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke()
                }
                ctx.restore()
            }
            drawStripe(0, 0, W - 104, GY - 34)
            drawStripe(GX, GY + ROWS * TILE, W - 104, H - (GY + ROWS * TILE) - 2)
            drawStripe(GX - 8, 10, 8, H - 12)
            drawStripe(GX + COLS * TILE, GY - 34, 8, ROWS * TILE + 36)
        }

        const paintConveyor = (tick) => {
            const y = PY(CONV_ROW_Y())
            ctx.fillStyle = '#1a2731'; ctx.fillRect(PX(0), y, (CONV_X1N + 1) * TILE, TILE)
            ctx.strokeStyle = '#2d4254'; ctx.lineWidth = 1
            ctx.strokeRect(PX(0) + 0.5, y + 0.5, (CONV_X1N + 1) * TILE - 1, TILE - 1)
            // 2.5D rig: a lighter top rail and darker under-belt give the deck depth
            ctx.fillStyle = '#24384a'; ctx.fillRect(PX(0), y - 3, (CONV_X1N + 1) * TILE, 3)
            ctx.fillStyle = '#0c151d'; ctx.fillRect(PX(0), y + TILE, (CONV_X1N + 1) * TILE, 3)
            ctx.fillStyle = '#3a556c'
            ctx.beginPath(); ctx.arc(PX(CONV_X1N + 1) - 3, y + TILE / 2, 2.6, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(PX(1) + TILE - 3, y + TILE / 2, 2.6, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = 'rgba(126,200,255,0.35)'; ctx.lineWidth = 1.6
            const off = (tick * 0.8) % 13
            for (let cx = PX(0) + off; cx < PX(CONV_X1N + 1); cx += 13) {
                ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(cx + 5, y + TILE / 2); ctx.lineTo(cx, y + TILE - 7); ctx.stroke()
            }
            // intake door
            const glow = tick % 50 < 28
            ctx.fillStyle = glow ? '#ff6a3c' : '#7c2f18'
            ctx.beginPath(); ctx.moveTo(GX + 2, y + 4); ctx.lineTo(GX + 12, y + TILE / 2); ctx.lineTo(GX + 2, y + TILE - 4); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#0d1722'; ctx.fillRect(GX + 12, y + 2, 5, TILE - 4)
        }
        const CONV_ROW_Y = () => 1
        const CONV_X1N = 15

        const paintArm = (tick) => {
            const bx = PX(ARM_CELL.x) + TILE / 2, by = PY(ARM_CELL.y) + TILE / 2
            // reach diamond — the gantry's honest footprint while planning racks,
            // lit brighter while the servo is carrying (#1872), and gently pulsing
            // while cargo sits loaded-and-waiting so the patience rule teaches
            // itself before the swing even starts (#1877)
            diamondA = 0
            const loadedWait = gs.arm.held && gs.arm.swing === 0
            if (gs.tool === 'rack' || gs.arm.swing > 0 || loadedWait) {
                diamondA = gs.arm.swing > 0 ? 0.5 : gs.tool === 'rack' ? 0.26 : 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(gs.arm.heldT * 0.22))
                ctx.save()
                ctx.strokeStyle = gs.arm.swing > 0 ? 'rgba(126,200,255,0.5)' : `rgba(255,210,63,${diamondA.toFixed(3)})`
                ctx.lineWidth = 1.2
                ctx.setLineDash([3, 4])
                ctx.beginPath()
                ctx.moveTo(bx, by - ARM_REACH * TILE); ctx.lineTo(bx + ARM_REACH * TILE, by)
                ctx.lineTo(bx, by + ARM_REACH * TILE); ctx.lineTo(bx - ARM_REACH * TILE, by)
                ctx.closePath(); ctx.stroke()
                ctx.setLineDash([])
                ctx.restore()
            }
            ctx.fillStyle = '#3a4a58'; ctx.beginPath(); ctx.arc(bx, by + 2, 9, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#5f7280'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill()
            if (gs.arm.swing > 0 && gs.arm.target) {
                // gantry in motion: the boom rotates toward the rack and the
                // sleeve telescopes out; the drop lands the tick the swing ends
                const tx = PX(gs.arm.target.x) + TILE / 2, ty = PY(gs.arm.target.y) + TILE / 2
                const prog = gs.arm.swingT0 ? Math.max(0, Math.min(1, 1 - gs.arm.swing / gs.arm.swingT0)) : 1
                const ext = Math.min(1, prog / 0.8)
                const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy) || 1
                const ux = dx / len, uy = dy / len
                const reach = 22 + ext * Math.max(0, len - 22)
                const exx = bx + ux * 12, eyy = by + uy * 12
                const hx = bx + ux * reach, hy = by + uy * reach
                armTip = { x: hx, y: hy }
                ctx.strokeStyle = '#8fa3b0'; ctx.lineWidth = 4
                ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(exx, eyy); ctx.stroke()
                ctx.strokeStyle = '#aabecb'; ctx.lineWidth = 3
                ctx.beginPath(); ctx.moveTo(exx, eyy); ctx.lineTo(hx, hy); ctx.stroke()
                ctx.fillStyle = '#c9d4dc'; ctx.beginPath(); ctx.arc(exx, eyy, 3, 0, Math.PI * 2); ctx.fill()
                // guide + target bracket
                ctx.strokeStyle = 'rgba(126,200,255,0.35)'; ctx.lineWidth = 1
                ctx.setLineDash([2, 4])
                ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke()
                ctx.setLineDash([])
                const bp = tick % 20 < 10 ? 4 : 6
                ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 1.4
                for (const [cx, cy, sx, sy] of [[tx - TILE / 2, ty - TILE / 2, 1, 1], [tx + TILE / 2, ty - TILE / 2, -1, 1], [tx - TILE / 2, ty + TILE / 2, 1, -1], [tx + TILE / 2, ty + TILE / 2, -1, -1]]) {
                    ctx.beginPath(); ctx.moveTo(cx + bp * sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + bp * sy); ctx.stroke()
                }
                if (gs.arm.held) drawItem(ctx, gs.arm.held, hx + ux * 4, hy + uy * 4, 0.9)
                ctx.fillStyle = '#7ec8ff'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'
                ctx.fillText('SERVO', bx, by + 22); ctx.textAlign = 'left'
            } else {
                // two-link arm reaches toward the bay when loaded, rests otherwise;
                // it dips toward the waiting bot through the BAY_TICKS handoff
                const pose = gs.arm.pose
                const restA = -2.2, workA = -0.9
                const handing = gs.robots.some((bb) => bb.task.kind === 'toArm' && bb.pickT > 0)
                // #1877 item 3 — docked, the machine is never dead-still: a slow
                // wrist sway sells live hydraulics at rest, and a fast micro-shudder
                // along the forearm sells the strain while loaded cargo runs the
                // patience clock. Both ride the paint tick (world-seconds law);
                // nothing touches gs, so the sim hash stays honest (#1877 check).
                const loadedHold = gs.arm.held && gs.arm.swing === 0
                const sway = gs.arm.held || handing ? 0 : Math.sin(tick * 0.04) * 0.035
                const shud = loadedHold ? Math.sin(tick * 2.3) * 0.7 : 0
                gripSway = sway; gripShud = shud
                const ang = restA + (workA - restA) * pose + (handing ? 0.22 : 0) + sway
                const L1 = 16, L2 = 14
                const ex = bx + Math.cos(ang) * L1, ey = by + Math.sin(ang) * L1
                const a2 = ang + 1.1 - pose * 0.7
                const hx = ex + Math.cos(a2) * (L2 + shud), hy = ey + Math.sin(a2) * (L2 + shud)
                armTip = { x: hx, y: hy }
                ctx.strokeStyle = '#8fa3b0'; ctx.lineWidth = 4
                ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke()
                ctx.fillStyle = '#c9d4dc'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill()
                // gripper — closes when loaded, opens when the transfer lands
                grip += ((gs.arm.held ? 0 : 1) - grip) * 0.25
                const sp = 2 + grip * 3
                ctx.strokeStyle = gs.arm.held ? '#ffd23f' : '#7e8c96'; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(hx - 3, hy - 2); ctx.lineTo(hx - 3 - sp, hy + 3); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(hx + 3, hy - 2); ctx.lineTo(hx + 3 + sp, hy + 3); ctx.stroke()
                if (gs.arm.held) drawItem(ctx, gs.arm.held, hx, hy + 5, 0.9)
            }
            ctx.fillStyle = gs.arm.swing > 0 ? '#7ec8ff' : '#ffd23f'; ctx.beginPath(); ctx.arc(bx, by - 8, 1.8 + Math.sin(tick * 0.1) * 0.5, 0, Math.PI * 2); ctx.fill()
        }

        const paintOutbound = (tick) => {
            for (const o of OUT_CELLS) {
                ctx.fillStyle = '#16301f'; ctx.fillRect(PX(o.x), PY(o.y), TILE, TILE)
                ctx.strokeStyle = 'rgba(93,255,143,0.5)'; ctx.lineWidth = 1.5
                ctx.strokeRect(PX(o.x) + 2, PY(o.y) + 2, TILE - 4, TILE - 4)
            }
            // staging — items stacked at the pad
            gs.staging.slice(0, 8).forEach((k, i) => {
                drawItem(ctx, k, PX(OUT_CELLS[0].x) + 7 + (i % 2) * 12, PY(OUT_CELLS[0].y) + 8 + Math.floor(i / 2) * 11, 0.75)
            })
            const pulse = gs.shipped && tick % 40 < 12
            ctx.fillStyle = pulse ? 'rgba(93,255,143,0.25)' : 'rgba(93,255,143,0.08)'
            ctx.fillRect(PX(OUT_CELLS[0].x) - 4, PY(OUT_CELLS[0].y) + TILE + 2, TILE * 2 + 8, 10)
            ctx.fillStyle = '#7ee0a0'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
            ctx.fillText('SHIPPING', PX(OUT_CELLS[0].x) + TILE, PY(OUT_CELLS[0].y) + TILE + 10)
            ctx.textAlign = 'left'
        }

        const paintRacks = () => {
            for (const r of gs.racks) {
                const x = PX(r.x), y = PY(r.y)
                // 2.5D: drop shadow + a lighter top face reads as box height
                ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 3, y + 4, TILE - 2, TILE - 2)
                ctx.fillStyle = '#20303c'; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
                ctx.fillStyle = '#2b4152'; ctx.fillRect(x + 1, y + 1, TILE - 2, 5)
                // #2555: owner tint on the frame — green is yours, cyan is the
                // model's, the classic orange is the house's legacy racks.
                ctx.strokeStyle = r.owner === 0 ? '#5dff8f' : r.owner === 1 ? '#57c7ff' : '#c96a1f'; ctx.lineWidth = 2
                ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4)
                // shelf lips
                ctx.strokeStyle = 'rgba(224,149,78,0.55)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(x + 3, y + TILE / 2); ctx.lineTo(x + TILE - 3, y + TILE / 2); ctx.stroke()
                r.items.forEach((k, i) => {
                    drawItem(ctx, k, x + 8 + (i % 2) * 10, y + 8 + Math.floor(i / 2) * 10, 0.72)
                })
                if (r.items.length >= RACK_CAP) { ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1) }
            }
        }

        const paintSwing = () => {
            // #2627 s3 SWING PAINT — faint amber keep-clear paint on live
            // elbows (see sim.js): the cell where a cart parks mid-pick while
            // traffic swings past. The yard-paint grammar made glanceable —
            // box + quarter turn-arc arm-centre to arm-centre through B, the
            // cart's path. Amber = the law colour (refusal banners, reach
            // diamond); hard elbows (both arms see through traffic) paint
            // stronger, the double-sightline case doctrine paints hardest.
            // Painter-only, deterministic — pure geometry of the board, no
            // rng, no tick animation (a painted floor does not pulse).
            for (const m of swingMarkers(gs)) {
                const x = PX(m.x), y = PY(m.y), cx = x + TILE / 2, cy = y + TILE / 2
                ctx.fillStyle = `rgba(255,210,63,${m.h ? 0.085 : 0.05})`
                ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
                const [a1, a2] = m.arms
                ctx.strokeStyle = `rgba(255,210,63,${m.h ? 0.3 : 0.16})`; ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(cx + a1[0] * TILE, cy + a1[1] * TILE)
                ctx.quadraticCurveTo(cx, cy, cx + a2[0] * TILE, cy + a2[1] * TILE)
                ctx.stroke()
            }
        }
        const paintFlow = () => {
            // #2622 item 3 TWO-WAY TRAFFIC, READABLE — cyan flow arrows at both
            // mouths of every legal two-way aisle (flowMarks in sim.js): a tight
            // run of 1..4 with open mouths at both ends. Spurred dead-ends and
            // bayed aisles stay bare — one-way by choice, and the bay cell is
            // its own mark. Aisle tint + arrows, never on rack faces; the elbow
            // service cells are excluded — the corner keeps the amber keep-clear
            // box for itself (#2627 s3): law paint outranks traffic paint, and
            // an elbow is not a through-lane. Cyan = traffic colour (the bots'
            // own livery); width is the aisle's own truth — a committed 4-cell
            // lane paints brightest, a stub dimmest. Painter-only, deterministic:
            // pure geometry of the board, no rng, no pulse.
            const elbows = new Set(swingMarkers(gs).map((m) => `${m.x},${m.y}`))
            for (const m of flowMarks(gs)) {
                const alpha = 0.04 + 0.03 * m.flow
                for (const c of m.cells) {
                    if (elbows.has(`${c.x},${c.y}`)) continue // the corner's amber box owns this cell
                    ctx.fillStyle = `rgba(46,168,184,${alpha})`
                    ctx.fillRect(PX(c.x) + 3, PY(c.y) + 3, TILE - 6, TILE - 6)
                }
                ctx.strokeStyle = `rgba(120,220,235,${0.28 + 0.09 * m.flow})`; ctx.lineWidth = 2
                for (const [mi, mouth] of m.mouths.entries()) {
                    const cx = PX(mouth.x) + TILE / 2, cy = PY(mouth.y) + TILE / 2
                    const s = mi === 0 ? 1 : -1 // arrowhead points INTO the aisle from each mouth
                    const ax = m.axis === 'h' ? s : 0, ay = m.axis === 'h' ? 0 : s
                    const px = m.axis === 'h' ? 0 : s, py = m.axis === 'h' ? s : 0
                    ctx.beginPath()
                    ctx.moveTo(cx + ax * -5 + px * 4, cy + ay * -5 + py * 4)
                    ctx.lineTo(cx + ax * 4, cy + ay * 4)
                    ctx.lineTo(cx + ax * -5 - px * 4, cy + ay * -5 - py * 4)
                    ctx.stroke()
                }
            }
        }
        const paintHeat = (tick) => {
            // #2680 LIVE TRAFFIC HEAT — cells burn with the routes their bots
            // drive (flowHeat in sim.js): one orange cell-tint per bot routed
            // through it, brighter per claim; a cell TWO routes share is the
            // jam's prologue (the occupancy law serialises it, the jam law
            // freezes it), so it pulses a hot core on the tick clock. Orange
            // sits beside the grammar without wearing its colours: cyan is the
            // aisle's legality, amber is the law, this is the floor's own
            // exertion. Pure paint over a pure query, deterministic — the only
            // animation is the convergence pulse, riding gs.tick like every
            // lesson frame; nothing here writes state.
            for (const c of flowHeat(gs)) {
                const x = PX(c.x), y = PY(c.y)
                const a = c.n >= 3 ? 0.16 : c.n === 2 ? 0.1 : 0.05
                ctx.fillStyle = `rgba(255,120,40,${a})`
                ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
                if (c.n >= 2) {
                    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.2)
                    ctx.fillStyle = `rgba(255,86,26,${0.22 + 0.22 * pulse})`
                    ctx.fillRect(x + TILE / 2 - 3, y + TILE / 2 - 3, 6, 6)
                }
            }
        }
        const paintYield = (tick) => {
            // #2692 DUCK & PASS — the cart that gave the aisle wears the courtesy:
            // a dashed cyan ring (cyan is the traffic's own livery, #2622/#2680 —
            // amber stays the law colour, orange stays exertion) and the lane cell
            // it vacated glows softly where it used to stand: the road reads where
            // traffic made way. Painter-only, deterministic — the pulse rides
            // gs.tick like every lesson frame; nothing here writes state.
            for (const b of gs.robots) {
                if (!b.yield) continue
                const pulse = 0.5 + 0.5 * Math.sin(tick * 0.25 + b.id)
                const ox = PX(b.yield.fx), oy = PY(b.yield.fy)
                ctx.fillStyle = `rgba(46,168,184,${0.06 + 0.05 * pulse})`
                ctx.fillRect(ox + 3, oy + 3, TILE - 6, TILE - 6)
                // #2700 GIVEN: a hold is directional courtesy — the instant a rival
                // crosses the vacated cell, that bay stamps who gave way to whom.
                const vk = `${b.yield.fx},${b.yield.fy}`
                if (gs.robots.some((r) => r.id !== b.id && !r.broken && r.x === b.yield.fx && r.y === b.yield.fy)) givenAt.set(vk, tick)
                if (tick - (givenAt.get(vk) ?? -999) < 36) {
                    ctx.fillStyle = '#7fe9f5'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('GIVEN', ox + TILE / 2, oy + TILE - 4); ctx.textAlign = 'left'
                }
                const s2 = duckSlide.get(b.id) // the ring rides the slide until the body settles (paintRobots consumes it at rest)
                const so = s2 ? Math.max(0, 1 - (tick - s2.t0) / 14) : 0
                const cx = PX(b.x) + TILE / 2 + (s2 ? s2.ox * TILE * so : 0), cy = PY(b.y) + TILE / 2 + (s2 ? s2.oy * TILE * so : 0)
                ctx.strokeStyle = `rgba(120,220,235,${0.5 + 0.35 * pulse})`; ctx.lineWidth = 2
                ctx.setLineDash([3, 3])
                ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.46, 0, Math.PI * 2); ctx.stroke()
                ctx.setLineDash([])
                // #2700 shoulder chevron — points OUT of the aisle, the way this cart
                // pulled off; mid-duel the glance says which side opens.
                const ddx = b.x - b.yield.fx, ddy = b.y - b.yield.fy
                const ang = Math.atan2(ddy, ddx)
                ctx.strokeStyle = `rgba(127,233,245,${0.55 + 0.3 * pulse})`; ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(cx + Math.cos(ang - 2.45) * 6.5, cy + Math.sin(ang - 2.45) * 6.5); ctx.lineTo(cx + Math.cos(ang) * 11.5, cy + Math.sin(ang) * 11.5)
                ctx.moveTo(cx + Math.cos(ang + 2.45) * 6.5, cy + Math.sin(ang + 2.45) * 6.5); ctx.lineTo(cx + Math.cos(ang) * 11.5, cy + Math.sin(ang) * 11.5)
                ctx.stroke()
            }
            // #2700 TEACH THE COURTESY — the first duck of a shift names itself once:
            // a dashed cyan frame on the bay cell with the GIVE WAY tail, fading over
            // ~2.5 world seconds (the green plug-lesson idiom, courtesy's own colour).
            if (duckTeach) {
                if (tick < duckTeach.from || tick > duckTeach.until) duckTeach = null
                else {
                    const k = (duckTeach.until - tick) / 150
                    const tp = 0.5 + 0.5 * Math.sin(tick * 0.22)
                    const x = PX(duckTeach.x), y = PY(duckTeach.y)
                    ctx.strokeStyle = `rgba(120,220,235,${(0.5 + 0.35 * tp) * k})`; ctx.lineWidth = 2
                    ctx.setLineDash([4, 3]); ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); ctx.setLineDash([])
                    ctx.fillStyle = `rgba(127,233,245,${0.9 * k})`; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('GIVE WAY', x + TILE / 2, y - 3); ctx.textAlign = 'left'
                }
            }
            for (const [k, t0] of givenAt) if (tick - t0 > 36) givenAt.delete(k)
        }
        const paintTeach = (tick) => {
            // #2627 s2 TEACH THE ELBOW — a corner refusal lights the honest exits:
            // dashed green frames on the mouths that would spur the elbow (plugging
            // either turns the two-way choke into a legal dead-end spur, #2546).
            // Painter-only: the law and the refusal stay sim truth; this is the
            // lesson, drawn where the refusal happened, fading over 2.5 world
            // seconds. Deterministic (rides the paint tick, never Math.random).
            if (!elbowTeach) return
            if (tick < (elbowTeach.from || 0) || tick > elbowTeach.until) { elbowTeach = null; return }
            const k = (elbowTeach.until - tick) / 150 // the whole lesson fades out
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.22)
            for (const m of elbowTeach.cells) {
                const x = PX(m.x), y = PY(m.y)
                ctx.fillStyle = `rgba(93,255,143,${(0.1 + 0.12 * pulse) * k})`
                ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6)
                ctx.strokeStyle = `rgba(93,255,143,${(0.45 + 0.4 * pulse) * k})`; ctx.lineWidth = 2
                ctx.setLineDash([4, 3]); ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); ctx.setLineDash([])
            }
            if (elbowTeach.cells.length) {
                ctx.fillStyle = `rgba(93,255,143,${0.85 * k})`; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'
                for (const m of elbowTeach.cells) ctx.fillText('PLUG', PX(m.x) + TILE / 2, PY(m.y) + TILE - 5)
                ctx.textAlign = 'left'
            }
        }

        const paintKnee = (tick) => {
            // #2711 NO KNEE keep-clear — the refused click sat in the swing of a
            // turn. Amber stays the law colour (#2622 grammar): a pulsing dashed
            // box on the cell with the quarter swing arc across its inner corner,
            // fading over 2.5 world seconds like the elbow lesson. #2711 s2 adds
            // what the law can prove: the BENDS the click blocks (dashed amber
            // elbows, each with a quarter arc centred on its inner vertex opening
            // toward the swing cell — the turn's own sweep line) and the honest
            // beside-place ALTS in the lesson green (#2627 s2 idiom: dashed frame
            // + word, HERE — rack here instead, the swing stays clear). Rides the
            // paint tick, deterministic — painter-only, the refusal itself is sim truth.
            if (!kneeMark) return
            if (tick < (kneeMark.from || 0) || tick > kneeMark.until) { kneeMark = null; return }
            const k = (kneeMark.until - tick) / 150
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.22)
            const x = PX(kneeMark.x), y = PY(kneeMark.y)
            ctx.fillStyle = `rgba(255,210,63,${(0.1 + 0.12 * pulse) * k})`
            ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6)
            ctx.strokeStyle = `rgba(255,210,63,${(0.45 + 0.4 * pulse) * k})`; ctx.lineWidth = 2
            ctx.setLineDash([4, 3]); ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); ctx.setLineDash([])
            ctx.strokeStyle = `rgba(255,210,63,${0.7 * k})`; ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.arc(x, y, TILE * 0.9, 0, Math.PI / 2); ctx.stroke()
            ctx.fillStyle = `rgba(255,210,63,${0.85 * k})`; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'
            ctx.fillText('SWING', x + TILE / 2, y + TILE - 5)
            for (const bd of kneeMark.bends || []) {
                const bx = PX(bd.x), by = PY(bd.y)
                ctx.fillStyle = `rgba(255,210,63,${0.07 * k})`
                ctx.fillRect(bx + 3, by + 3, TILE - 6, TILE - 6)
                ctx.strokeStyle = `rgba(255,210,63,${(0.3 + 0.3 * pulse) * k})`; ctx.lineWidth = 1.5
                ctx.setLineDash([4, 3]); ctx.strokeRect(bx + 2, by + 2, TILE - 4, TILE - 4); ctx.setLineDash([])
                // the sweep line: quarter arc centred on the elbow's inner vertex,
                // spanning the 90° that faces the swing cell (dIn+dOut diagonal)
                const vx = bx + ((bd.in[0] + bd.out[0]) > 0 ? TILE : 0)
                const vy = by + ((bd.in[1] + bd.out[1]) > 0 ? TILE : 0)
                const ak = Math.atan2(bd.in[1] + bd.out[1], bd.in[0] + bd.out[0])
                ctx.strokeStyle = `rgba(255,210,63,${0.6 * k})`; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.arc(vx, vy, TILE * 0.9, ak - Math.PI / 4, ak + Math.PI / 4); ctx.stroke()
            }
            for (const a of kneeMark.alts || []) {
                const ax = PX(a.x), ay = PY(a.y)
                ctx.fillStyle = `rgba(93,255,143,${(0.1 + 0.12 * pulse) * k})`
                ctx.fillRect(ax + 3, ay + 3, TILE - 6, TILE - 6)
                ctx.strokeStyle = `rgba(93,255,143,${(0.45 + 0.4 * pulse) * k})`; ctx.lineWidth = 2
                ctx.setLineDash([4, 3]); ctx.strokeRect(ax + 2, ay + 2, TILE - 4, TILE - 4); ctx.setLineDash([])
                ctx.fillStyle = `rgba(93,255,143,${0.85 * k})`; ctx.font = 'bold 6px monospace'
                ctx.fillText('HERE', ax + TILE / 2, ay + TILE - 5)
            }
            ctx.textAlign = 'left'
        }

        const paintRobots = (tick) => {
            for (const b of gs.robots) {
                const x = PX(b.x) + TILE / 2, y = PY(b.y) + TILE / 2
                // personality: a rotational impulse when heading changes (sway),
                // and a deterministic shudder while a JAM brake holds the bot
                let anim = botAnim.get(b.id)
                if (!anim) { anim = { dir: b.face, turn: 0, sway: 0, trail: [] }; botAnim.set(b.id, anim) }
                if (anim.dir !== b.face) {
                    // #2732: the body pivots on FACING changes — reversing keeps
                    // the bearing (the cart drives backwards without rotating).
                    const d = ((b.face - anim.dir) % 4 + 4) % 4
                    anim.turn = d === 1 ? 1 : d === 3 ? -1 : 0
                    anim.dir = b.face
                }
                if (anim.turn) { anim.turn *= 0.85; if (Math.abs(anim.turn) < 0.05) anim.turn = 0 }
                if (anim.sway) { anim.sway *= 0.8; if (Math.abs(anim.sway) < 0.04) anim.sway = 0 } // #2700: the backpedal's swing settles
                // #2700 duck slide: the body steers into the bay (ease-out over one
                // cadence, riding gs.tick like every other painter clock, #1877 law).
                let psx = 0, psy = 0
                const sl = duckSlide.get(b.id)
                if (sl) {
                    const k = (tick - sl.t0) / 14
                    if (k >= 1 || k < 0) duckSlide.delete(b.id)
                    else { const es = 1 - (1 - k) * (1 - k); psx = sl.ox * TILE * (1 - es); psy = sl.oy * TILE * (1 - es) }
                }
                const jx = b.jam ? Math.sin(tick * 1.31 + b.id * 9.7) * 0.9 : 0
                const jy = b.jam ? Math.cos(tick * 1.73 + b.id * 5.3) * 0.6 : 0
                const bx = x + jx + psx, by = y + jy + psy
                ctx.fillStyle = 'rgba(0,0,0,0.3)'
                ctx.beginPath(); ctx.ellipse(bx, by + 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill()
                const body = b.broken ? '#5e4a44' : b.jam ? '#c98a2f' : '#2ea8b8'
                const edge = b.broken ? '#3a2c28' : b.jam ? '#7c5217' : '#1c6c78'
                ctx.save()
                ctx.translate(bx, by)
                ctx.rotate(anim.turn * 0.16 + anim.sway * 0.12) // #2700: a flipped-back duck swings as it shoulders off the line
                ctx.fillStyle = edge; ctx.fillRect(-9, -8, 18, 16)
                ctx.fillStyle = body; ctx.fillRect(-8, -7, 16, 14)
                ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-8, -7, 16, 3)
                // #2254 item 1: a bright rim so haulers never read as dark crates
                if (!b.broken && !b.jam) { ctx.strokeStyle = '#7fe9f5'; ctx.lineWidth = 1; ctx.strokeRect(-8.5, -7.5, 17, 15) }
                // wheel nubs
                ctx.fillStyle = '#12262e'
                ctx.fillRect(-10, -6, 2, 5); ctx.fillRect(8, -6, 2, 5)
                ctx.fillRect(-10, 1, 2, 5); ctx.fillRect(8, 1, 2, 5)
                ctx.restore()
                // amber eye toward facing (#2732: the eye rides the body —
                // backpedalling drives off without swinging the head)
                const d = [[0, -2], [2.5, 0], [0, 2], [-2.5, 0]][b.face % 4]
                ctx.fillStyle = b.broken ? '#ff5a4f' : tick % 100 < 5 ? '#fff2a0' : '#ffc23f'
                ctx.beginPath(); ctx.arc(bx + d[0], by - 1 + d[1], 2, 0, Math.PI * 2); ctx.fill()
                // status glyphs
                if (b.broken) {
                    ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(bx - 4, by - 12); ctx.lineTo(bx + 2, by - 12); ctx.stroke()
                    ctx.fillStyle = '#ff5a4f'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('🔧', bx + 6, by - 9); ctx.textAlign = 'left'
                } else if (b.jam) {
                    ctx.fillStyle = tick % 24 < 12 ? '#ffd23f' : '#ff9a4f'
                    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('JAM', bx, by - 11); ctx.textAlign = 'left'
                }
                if (gs.sel === b.id) {
                    // #2254 item 4: a selected bot must read instantly — bold pulsing
                    // corner brackets, plus a dashed route line to whatever it is
                    // heading for, so dispatch shows where the bot is going.
                    const bp = 4 + (tick % 30 < 15 ? 2 : 0)
                    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2
                    for (const [cx, cy, sx, sy] of [[bx - 12, by - 11, 1, 1], [bx + 12, by - 11, -1, 1], [bx - 12, by + 11, 1, -1], [bx + 12, by + 11, -1, -1]]) {
                        ctx.beginPath(); ctx.moveTo(cx + bp * sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + bp * sy); ctx.stroke()
                    }
                    const t = b.task
                    let tx = null, ty = null
                    if ((t.kind === 'toRack' || t.kind === 'toStock') && t.rx != null) { tx = PX(t.rx) + TILE / 2; ty = PY(t.ry) + TILE / 2 }
                    else if (t.kind === 'toArm') { tx = PX(ARM_CELL.x) + TILE / 2; ty = PY(ARM_CELL.y) + TILE / 2 }
                    else if (t.kind === 'toOut') { tx = PX(OUT_CELLS[0].x) + TILE / 2; ty = PY(OUT_CELLS[0].y) + TILE / 2 }
                    if (tx != null) {
                        const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy) || 1
                        if (len > 30) { // start outside the body so the bot's own cell reads clean
                            ctx.strokeStyle = 'rgba(255,210,63,0.55)'; ctx.lineWidth = 1.5
                            ctx.setLineDash([4, 4]); ctx.lineDashOffset = -(tick % 8)
                            ctx.beginPath(); ctx.moveTo(bx + (dx / len) * 14, by + (dy / len) * 14); ctx.lineTo(tx, ty); ctx.stroke()
                            ctx.setLineDash([]); ctx.lineDashOffset = 0
                            ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, Math.PI * 2); ctx.fill()
                        }
                    }
                }
                if (b.broken) {
                    // #2254 item 4: repair progress is a ring around the bot — it fills
                    // as the idle clock runs, and every turbo click lands a pulse
                    const prog = Math.max(0, Math.min(1, 1 - b.repair / REPAIR_TICKS))
                    ctx.strokeStyle = 'rgba(255,90,79,0.45)'; ctx.lineWidth = 2.4
                    ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.stroke()
                    ctx.strokeStyle = '#5dff8f'
                    ctx.beginPath(); ctx.arc(bx, by, 13, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke()
                    const pulseAt = repairPulse.get(`${b.x},${b.y}`)
                    if (pulseAt != null) {
                        const pk = tick - pulseAt
                        if (pk > 20) repairPulse.delete(`${b.x},${b.y}`)
                        else {
                            ctx.globalAlpha = 1 - pk / 20
                            ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 2
                            ctx.beginPath(); ctx.arc(bx, by, 10 + pk * 0.5, 0, Math.PI * 2); ctx.stroke()
                            ctx.globalAlpha = 1
                        }
                    }
                }
                if (b.carry) {
                    // #2711: a loaded cart shows its body — the amber nose sits on
                    // the FACING edge (the side whose diagonals knee law sweeps,
                    // #2732), so the swing that cannot pass a rack corner is
                    // visible at a glance even while the cart reverses.
                    const nv = [[0, -1], [1, 0], [0, 1], [-1, 0]][b.face] || [0, -1]
                    ctx.fillStyle = 'rgba(255,210,63,0.4)'
                    ctx.fillRect(bx + nv[0] * 10 - 3, by + nv[1] * 10 - 3, 6, 6)
                    // #2760: and the body now has the other end too — a steel
                    // counterweight nub on the edge OPPOSITE the facing, the side
                    // whose diagonals the tail law sweeps. Amber stays the law
                    // colour, steel is just mass: the backswing that re-routes a
                    // plan (or triggers repath-on-land) is readable at a glance.
                    ctx.fillStyle = 'rgba(150,170,192,0.55)'
                    ctx.fillRect(bx - nv[0] * 10 - 3, by - nv[1] * 10 - 3, 6, 6)
                    drawItem(ctx, b.carry, bx, by - 14 + Math.sin(tick * 0.12) * 1, 0.85)
                }
            }
        }

        const paintCursor = (tick) => {
            if (screenRef.current !== 'play') return
            const x = PX(gs.cursor.x), y = PY(gs.cursor.y)
            const pulse = 0.55 + Math.sin(tick * 0.18) * 0.3
            ctx.strokeStyle = `rgba(255,210,63,${pulse})`; ctx.lineWidth = 2
            const c = 7
            for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [TILE, 0, -1, 1], [0, TILE, 1, -1], [TILE, TILE, -1, -1]]) {
                ctx.beginPath()
                ctx.moveTo(x + ox + c * sx, y + oy)
                ctx.lineTo(x + ox, y + oy)
                ctx.lineTo(x + ox, y + oy + c * sy)
                ctx.stroke()
            }
            if (gs.tool === 'rack') {
                ctx.globalAlpha = 0.5
                ctx.strokeStyle = '#c96a1f'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4)
                ctx.globalAlpha = 1
            } else if (gs.tool === 'hire') {
                ctx.globalAlpha = 0.6; ctx.fillStyle = '#2ea8b8'
                ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12)
                ctx.globalAlpha = 1
            }
        }

        // #2555: the duel marks — seat M steers a cyan bracket beside yours,
        // and every hired bot wears its employer's dot (the house fleet wears
        // none; those plates are classic).
        const paintDuel = (tick) => {
            if (!gs.duel || screenRef.current !== 'play') return
            for (const b of gs.robots) {
                if (b.owner < 0) continue
                ctx.fillStyle = b.owner === 0 ? '#5dff8f' : '#57c7ff'
                ctx.beginPath(); ctx.arc(PX(b.x) + 5, PY(b.y) + 5, 2.4, 0, Math.PI * 2); ctx.fill()
            }
            const mx = PX(gs.m.cursor.x), my = PY(gs.m.cursor.y)
            const pulse = 0.55 + Math.cos(tick * 0.18) * 0.3
            ctx.strokeStyle = `rgba(87,199,255,${pulse})`; ctx.lineWidth = 2
            const c = 7
            for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [TILE, 0, -1, 1], [0, TILE, 1, -1], [TILE, TILE, -1, -1]]) {
                ctx.beginPath()
                ctx.moveTo(mx + ox + c * sx, my + oy)
                ctx.lineTo(mx + ox, my + oy)
                ctx.lineTo(mx + ox, my + oy + c * sy)
                ctx.stroke()
            }
            if (gs.m.tool === 'rack') { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#57c7ff'; ctx.strokeRect(mx + 2, my + 2, TILE - 4, TILE - 4); ctx.globalAlpha = 1 }
        }

        const paintParticles = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g
                if (p.t > 24) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 24; ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.globalAlpha = 1
            for (let i = gs.fx.length - 1; i >= 0; i--) {
                const f = gs.fx[i]
                if (f.k > 50) { gs.fx.splice(i, 1); continue }
                const a = Math.max(0, 1 - f.k / 50)
                ctx.globalAlpha = a
                ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
                // #2254 item 1: bare glyphs on the dark floor were unreadable — every
                // floating message now rides a dark plate that fades with it.
                const tw = ctx.measureText(f.msg).width
                ctx.fillStyle = 'rgba(4,8,12,0.78)'
                ctx.fillRect(f.x - tw / 2 - 3, f.y - f.k * 0.35 - 9, tw + 6, 12)
                ctx.fillStyle = f.col
                ctx.fillText(f.msg, f.x, f.y - f.k * 0.35)
                ctx.globalAlpha = 1
            }
            ctx.textAlign = 'left'
        }

        const chip = (key, label, active, col) => {
            const r = CHIPS[key]
            ctx.fillStyle = active ? 'rgba(255,210,63,0.16)' : 'rgba(10,16,22,0.85)'
            ctx.fillRect(r.x, r.y, r.w, r.h)
            ctx.strokeStyle = active ? '#ffd23f' : col || '#3a5468'; ctx.lineWidth = 1.2
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
            ctx.fillStyle = active ? '#ffd23f' : col || '#9fc0d8'
            ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
            ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 3)
            ctx.textAlign = 'left'
        }

        const paintHud = (tick) => {
            ctx.fillStyle = 'rgba(8,12,18,0.92)'; ctx.fillRect(0, 0, W, 36)
            ctx.fillStyle = 'rgba(126,200,255,0.12)'; ctx.fillRect(0, 35, W, 1)
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 9px monospace'
            ctx.fillText('THROUGHPUT', 10, 11)
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace'
            ctx.fillText(String(gs.score).padStart(4, '0'), 10, 28)
            ctx.fillStyle = '#a8c8dc'; ctx.font = 'bold 9px monospace'
            // #2346: the bar tracks THIS shift's earnings against THIS shift's quota
            ctx.fillText(`QUOTA ${gs.params.quota}`, 72, 28)
            // quota bar
            ctx.fillStyle = '#14212c'; ctx.fillRect(72, 8, 120, 8)
            const pct = Math.max(0, Math.min(1, (gs.score - gs.shiftBase) / gs.params.quota))
            ctx.fillStyle = pct >= 1 ? '#5dff8f' : '#3d9fd8'
            ctx.fillRect(72, 8, 120 * pct, 8)
            // strike lamps
            for (let i = 0; i < STRIKES; i++) {
                ctx.fillStyle = i < gs.strikes ? '#ff5a4f' : '#2c3a44'
                ctx.beginPath(); ctx.arc(210 + i * 14, 12, 4.5, 0, Math.PI * 2); ctx.fill()
            }
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 8px monospace'
            ctx.fillText('EXPIRED', 204, 28)
            // freight line (#1921): escrow is money the pack booked but the dock
            // hasn't shipped — it only becomes THROUGHPUT when the trailer hauls.
            // #1877 freight context: blink only while money is actively landing
            // (within the last 2 world-seconds of growth), steady otherwise — a
            // fixed-phase blink shouts even when the number has sat still for a minute.
            if (gs.escrow > escLast) escGrowAt = tick // also syncs downward moves (payout, reset) so the next growth reads
            escLast = gs.escrow
            if (gs.escrow > 0) {
                const growWin = tick - escGrowAt < 120
                ctx.fillStyle = growWin ? (tick % 50 < 34 ? '#7ec8ff' : '#3d5f78') : '#5d94b6'
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left'
                ctx.fillText(`ESCROW ${gs.escrow}`, 372, 22)
            }
            if (gs.duel) {
                // #2555 twin till — the manager scoreboard rides beside escrow;
                // the leading seat burns bright, the trailer stays steady dim.
                // #2561 item 2: the leader also BLINKS for 2 world-seconds after
                // credit lands on it — the ESCROW chip blink law (#1877), so a
                // growth that names itself on the floor also rings on the chip.
                const [h, mm] = gs.credits
                const lead = h === mm ? -1 : (h > mm ? 0 : 1)
                const chipCol = (seat, hot, cold) => lead === seat
                    ? (tick - tillGrowAt[seat] < 120 && tick % 50 >= 34 ? cold : hot)
                    : cold
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left'
                ctx.fillStyle = chipCol(0, '#ffd23f', '#8f7f45')
                ctx.fillText(`YOU ${h}`, 436, 12)
                ctx.fillStyle = chipCol(1, '#57c7ff', '#3f6f88')
                ctx.fillText(`MODEL ${mm}`, 436, 26)
            }
            // shift clock
            const left = Math.max(0, Math.ceil((SHIFT - gs.tick) / 60))
            ctx.fillStyle = left < 30 && tick % 20 < 10 ? '#ff5a4f' : '#e8e0d0'
            ctx.font = 'bold 13px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 300, 23)
            ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#cfe6f5'
            ctx.fillText(`SHIFT ${gs.shift}`, 300, 9) // #2346: the ladder number rides the clock
            if (gs.cleared > 0) { // banked nights, steady green tally by the clock
                ctx.fillStyle = '#5dff8f'; ctx.textAlign = 'right'
                ctx.fillText(`✓${gs.cleared}`, 466, 23)
                ctx.textAlign = 'center'
            }
            // rush lamp — a rotating beacon glow while the wave is on
            const rush = rushNow(gs)
            if (rush) {
                ctx.save()
                ctx.translate(346, 17)
                ctx.rotate(tick * 0.25)
                ctx.fillStyle = 'rgba(255,210,63,0.22)'
                for (let i = 0; i < 2; i++) {
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 17, i * Math.PI, i * Math.PI + 0.9); ctx.closePath(); ctx.fill()
                }
                ctx.restore()
            }
            ctx.fillStyle = rush ? (tick % 30 < 16 ? '#ffd23f' : '#8a6a17') : '#243038'
            ctx.beginPath(); ctx.arc(346, 17, 7, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 8px monospace'
            ctx.fillText('RUSH', 346, 30)
            ctx.textAlign = 'left'
            chip('auto', gs.auto ? 'AUTO ✓' : 'AUTO', gs.auto, '#5dff8f')
            chip('rack', `RACK $${RACK_COST}`, gs.tool === 'rack', '#e0954e')
            chip('hire', `BOT $${ROBOT_COST}`, gs.tool === 'hire', '#7ec8ff')
        }

        const paintOrders = () => {
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 10px monospace'
            ctx.fillText('ORDERS', 694, 38)
            const open = gs.orders.slice(0, 5)
            open.forEach((o, i) => {
                const r = orderRect(i)
                const late = o.due - gs.tick < 540
                // new cards slide in from the right; danger-band cards shudder
                let enter = orderEnter.get(o.id)
                if (enter == null) { enter = 14; orderEnter.set(o.id, enter) }
                else if (enter > 0) orderEnter.set(o.id, enter - 1)
                const rx = r.x + (enter > 0 ? (enter / 14) * 46 : 0) + (late ? ((gs.tick % 8) < 4 ? 1.4 : -1.4) : 0)
                ctx.fillStyle = 'rgba(16,26,36,0.9)'
                ctx.fillRect(rx, r.y, r.w, r.h)
                ctx.strokeStyle = o.prio ? '#ffd23f' : late ? (gs.tick % 30 < 16 ? '#ff5a4f' : '#5c2f28') : '#2d4254'
                ctx.lineWidth = 1.3
                ctx.strokeRect(rx + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
                o.items.slice(0, 3).forEach((k, j) => drawItem(ctx, k, rx + 16 + j * 22, r.y + 20, 1))
                const span = o.due - (o.items.length === 1 ? 1800 : 2400)
                const frac = Math.max(0, Math.min(1, (o.due - gs.tick) / (o.due - span)))
                ctx.fillStyle = '#14212c'; ctx.fillRect(rx + 6, r.y + r.h - 14, r.w - 12, 5)
                ctx.fillStyle = late ? '#ff5a4f' : '#3d9fd8'
                ctx.fillRect(rx + 6, r.y + r.h - 14, (r.w - 12) * frac, 5)
                ctx.fillStyle = o.prio ? '#ffd23f' : '#cfe6f5'
                ctx.font = 'bold 8px monospace'
                ctx.fillText(o.prio ? 'PRIORITY' : `#${o.id}`, rx + 6, r.y + r.h - 4)
            })
            if (orderEnter.size > 40) for (const id of [...orderEnter.keys()]) if (!gs.orders.some((o) => o.id === id)) orderEnter.delete(id)
        }

        const paintFooter = () => {
            const y = 446
            ctx.fillStyle = 'rgba(8,12,18,0.88)'; ctx.fillRect(0, y, W - 104, H - y)
            gs.robots.forEach((b, i) => {
                const x = 12 + i * 140
                ctx.fillStyle = '#a8c8dc'; ctx.font = 'bold 9px monospace'
                ctx.fillText(`BOT ${i + 1}`, x, y + 14)
                ctx.fillStyle = '#14212c'; ctx.fillRect(x + 34, y + 7, 60, 7)
                ctx.fillStyle = b.wear > 75 ? '#ff5a4f' : b.wear > 45 ? '#ffd23f' : '#3d9fd8'
                ctx.fillRect(x + 34, y + 7, (60 * b.wear) / 100, 7)
                ctx.fillStyle = b.broken ? '#ff5a4f' : b.jam ? '#ffd23f' : '#7ee0a0'
                ctx.fillText(b.broken ? 'DOWN' : b.jam ? 'JAM' : b.carry ? b.carry.toUpperCase() : b.task === 'idle' ? 'IDLE' : 'MOVING', x + 100, y + 14)
            })
            // #2254 item 3: a purchase dropped THROUGHPUT with no explanation — the
            // spend lands in the footer for 3 world-seconds, spelled out.
            if (spendFlash && gs.tick < spendFlash.until) {
                ctx.fillStyle = spendFlash.col || '#ffd23f'; ctx.font = 'bold 10px monospace' // #2561 item 3: model buys flash in model cyan
                ctx.fillText(spendFlash.label, 12, y + 28)
            } else spendFlash = null
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 9px monospace'
            ctx.fillText('AUTO ROUTES THE BOTS — BREAKDOWNS, JAMS, BUILDING AND PAD CALLS ARE YOURS', 12, y + 40)
            ctx.fillStyle = '#b8d4e8'; ctx.font = 'bold 9px monospace'
            ctx.fillText('CLICK BOT THEN RACK = DISPATCH · CLICK DOWN BOT = TURBO FIX · CLICK JAM = BACK OFF', 12, y + 52)
            ctx.fillStyle = '#9fc0d8'; ctx.font = 'bold 8px monospace'
            ctx.fillText('SPEND COMES OUT OF THROUGHPUT — RACK $60 · BOT $150 · SIMREADY MANIFEST: ' + MANIFEST_REV, 12, y + 64)
            const st = episodeStats()
            if (st.saved) { ctx.fillStyle = '#8fb8d0'; ctx.textAlign = 'right'; ctx.fillText(`PLAICRAFT EPISODES STORED: ${st.saved} (${st.won} won)`, W - 112, y + 64); ctx.textAlign = 'left' }
        }

        const paintRushWash = (tick) => {
            if (!rushNow(gs)) return
            ctx.fillStyle = `rgba(255,180,40,${0.05 + (tick % 40 < 20 ? 0.03 : 0)})`
            ctx.fillRect(GX, GY, COLS * TILE, ROWS * TILE)
        }

        const paintRushScan = (tick) => {
            if (!rushNow(gs)) return
            const sy = GY + ((tick * 1.5) % (ROWS * TILE))
            ctx.fillStyle = 'rgba(255,190,60,0.05)'; ctx.fillRect(GX, sy - 2, COLS * TILE, 5)
            ctx.fillStyle = 'rgba(255,210,90,0.14)'; ctx.fillRect(GX, sy, COLS * TILE, 1)
        }

        // #2352 clock-in ceremony: the rung SLAMS onto the floor the way rush hour
        // bathes it — a NIGHT n wash, the quota repriced, the carry-over said out
        // loud (what persists and what the bay wipes), and the rung's price so each
        // night's tightening is legible at the desk, not just felt on the floor.
        const paintClockIn = () => {
            if (!clockIn || gs.tick >= clockIn.until) { clockIn = null; return }
            const life = clockIn.until - gs.tick
            const slam = Math.min(1, (130 - life) / 14)
            const alpha = Math.min(1, slam * 1.6) * Math.min(1, life / 25)
            ctx.fillStyle = `rgba(30,42,80,${0.34 * Math.min(1, slam * 2)})`
            ctx.fillRect(GX, GY, COLS * TILE, ROWS * TILE)
            ctx.save()
            ctx.translate(W / 2, 150)
            const scale = 1 + (1 - slam) * (1 - slam) * 1.6
            ctx.scale(scale, scale)
            ctx.textAlign = 'center'
            ctx.font = 'bold 44px monospace'
            ctx.fillStyle = `rgba(255,210,63,${alpha})`
            ctx.fillText(`NIGHT ${clockIn.shift}`, 0, 0)
            ctx.restore()
            ctx.textAlign = 'center'
            ctx.fillStyle = `rgba(8,14,20,${0.82 * Math.min(1, slam * 2)})`
            ctx.fillRect(W / 2 - 190, 170, 380, 58)
            ctx.strokeStyle = `rgba(126,200,255,${0.5 * alpha})`; ctx.lineWidth = 1.5
            ctx.strokeRect(W / 2 - 190.5, 169.5, 381, 59)
            ctx.font = 'bold 14px monospace'; ctx.fillStyle = `rgba(255,255,255,${alpha})`
            ctx.fillText(`QUOTA ${clockIn.quota}`, W / 2, 190)
            ctx.font = 'bold 8px monospace'; ctx.fillStyle = `rgba(159,232,180,${alpha})`
            ctx.fillText('BOTS MAINTAINED · STRIKES WIPED · FREIGHT STAYS', W / 2, 207)
            const price = rungPrice(clockIn.shift)
            ctx.fillStyle = `rgba(255,154,79,${alpha})`
            ctx.fillText(`WIRE +${price.wire}% · DEADLINES −${price.due}% · WEAR −${price.wear}`, W / 2, 221)
            ctx.textAlign = 'left'
        }

        // The dock's truck (#1911): position, mode and load are SIM truth now
        // (gs.truck) — the painter just draws it. Staged parcels squat on the
        // green pad until a trailer backs in and takes them box by box.
        const paintTruck = (tick) => {
            const tr = gs.truck
            for (let i = 0; i < gs.pad.length; i++) {
                const p = gs.pad[i]
                const c = OUT_CELLS[i % 2]
                const cx = PX(c.x) + 13, cy = PY(c.y) + (i < 2 ? 13 : 1)
                for (let b = 0; b < p.n; b++) drawItem(ctx, 'crate', cx + (b - (p.n - 1) / 2) * 7, cy, 0.62)
                // freight tiers (#1927): the tag colors the parcel's route —
                // LOCAL rides plain (the baseline earns no label), far posts
                // announce their multiplier before the truck ever arrives
                if (p.d > 0) {
                    const col = p.d === 2 ? '#b07aff' : '#ff9a4f'
                    ctx.fillStyle = col
                    ctx.fillRect(cx - (p.n * 7) / 2 - 1, cy + 5, p.n * 7 + 2, 2)
                    ctx.font = 'bold 6px monospace'
                    ctx.fillText(`x${p.d + 1}`, cx + (p.n * 7) / 2 + 2, cy + 5)
                }
                // load weight (#1931): the freight class rides tagged too —
                // heavies wear a steel bar across the crates + an H badge,
                // standard a plain grey bar (light rides bare, same no-label
                // law as LOCAL earns no distance tag)
                if (p.w > 0) {
                    ctx.fillStyle = p.w === 2 ? '#9ad7ff' : '#8f99a6'
                    ctx.fillRect(cx - (p.n * 7) / 2 - 1, cy - 5, p.n * 7 + 2, 2)
                    if (p.w === 2) { ctx.font = 'bold 6px monospace'; ctx.fillText('H', cx - (p.n * 7) / 2 - 7, cy + 5) }
                }
            }
            if (tr.mode === 'out' && tr.away > 0) {
                // the road is the cost (#1927): the dock counts the trip home in
                // world seconds so the manager can price a late-shift send
                ctx.fillStyle = '#ff9a4f'; ctx.font = 'bold 7px monospace'
                ctx.fillText(`ON THE ROAD ${Math.ceil(tr.away / 60)}s`, PX(OUT_CELLS[0].x) + 2, PY(OUT_CELLS[0].y) + 30)
            }
            if (tr.mode === 'out') return
            const x = tr.x, ty = 414
            ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2, ty + 20, 68, 4)
            // trailer
            ctx.fillStyle = '#243342'; ctx.fillRect(x, ty, 46, 18)
            ctx.fillStyle = '#d8cfc0'; ctx.fillRect(x + 2, ty + 2, 42, 14)
            // cargo: one slot per box actually loaded (#1911 — the trailer
            // never lies about what it is carrying; past four slots it prints
            // the exact remainder instead of silently saturating)
            ctx.fillStyle = '#171310'
            for (let i = 0; i < Math.min(tr.carry, 4); i++) ctx.fillRect(x + 6 + i * 9, ty + 4, 6, 10)
            if (tr.carry > 4) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 6px monospace'
                ctx.fillText(`+${tr.carry - 4}`, x + 32, ty + 12)
            }
            ctx.fillStyle = '#c9971f'; ctx.fillRect(x, ty + 2, 3, 14) // rear hazard stripe
            // cab
            ctx.fillStyle = '#b3541e'; ctx.fillRect(x + 48, ty + 2, 14, 16)
            ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x + 50, ty + 4, 10, 5)
            // wheels
            ctx.fillStyle = '#0a0f14'
            for (const wx of [x + 5, x + 34, x + 51]) ctx.fillRect(wx, ty + 18, 6, 4)
            if (tr.mode === 'back') { ctx.fillStyle = '#ff5a4f'; ctx.fillRect(x - 1, ty + 3, 2, 4); ctx.fillRect(x - 1, ty + 11, 2, 4) }
            if (tr.mode === 'leave') {
                ctx.fillStyle = '#fff2a0'; ctx.fillRect(x + 62, ty + 4, 2, 4); ctx.fillRect(x + 62, ty + 12, 2, 4)
                ctx.fillStyle = 'rgba(255,242,160,0.10)'
                ctx.beginPath(); ctx.moveTo(x + 64, ty + 5); ctx.lineTo(x + 92, ty - 3); ctx.lineTo(x + 92, ty + 25); ctx.lineTo(x + 64, ty + 14); ctx.closePath(); ctx.fill()
            }
            if (tr.mode === 'park') {
                ctx.fillStyle = `rgba(93,255,143,${0.22 + 0.14 * Math.sin(tick * 0.2)})`
                ctx.fillRect(PX(23) - 4, ty - 6, TILE * 2 + 8, 4)
            }
        }

        // the arm->bot / gantry->rack transfer: a ghost item tracing the arc
        const paintArcs = (dt) => {
            for (let i = arcItems.length - 1; i >= 0; i--) {
                const a = arcItems[i]; a.k += dt
                const n = a.n || 15
                if (a.k > n) { arcItems.splice(i, 1); continue }
                const t = a.k / n
                ctx.globalAlpha = 1 - t * 0.55
                drawItem(ctx, a.kind, a.x0 + (a.x1 - a.x0) * t, a.y0 + (a.y1 - a.y0) * t - Math.sin(t * Math.PI) * 10, 0.85)
            }
            if (arcItems.length) ctx.globalAlpha = 1
        }

        // first 15 s: spotlight the selected bot (or bot 1) with a ghost trail
        // so click-select-dispatch teaches itself without attract lines
        const paintTutorial = (tick) => {
            // #2346: the division-of-labour lesson is a first-night lesson — a
            // returning manager on shift 2 does not need it again.
            if (screenRef.current !== 'play' || gs.tick > 900 || gs.shift > 1) return
            // #2254 item 3: the player's job was unclear — AUTO looks like it runs
            // the whole shift. For the first 15 s the floor states the division:
            // auto routes the bots, the manager handles everything else.
            ctx.fillStyle = 'rgba(4,8,12,0.8)'
            ctx.fillRect(GX + COLS * TILE / 2 - 214, GY + 2, 428, 34)
            ctx.strokeStyle = 'rgba(255,210,63,0.5)'; ctx.lineWidth = 1
            ctx.strokeRect(GX + COLS * TILE / 2 - 214, GY + 2, 428, 34)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px monospace'
            ctx.fillText('AUTO-DISPATCH ROUTES THE BOTS — YOU RUN THE FLOOR', GX + COLS * TILE / 2, GY + 15)
            ctx.fillStyle = '#cfe6f5'; ctx.font = 'bold 9px monospace'
            ctx.fillText('FIX DOWN BOTS · CLEAR JAMS · BUY RACKS AND BOTS · TAP THE PAD TO CALL THE TRUCK', GX + COLS * TILE / 2, GY + 29)
            ctx.textAlign = 'left'
            const bot = gs.sel != null ? gs.robots.find((b) => b.id === gs.sel) : null
            const target = bot || gs.robots.find((b) => !b.broken)
            if (!target) return
            const anim = botAnim.get(target.id)
            const x = PX(target.x) + TILE / 2, y = PY(target.y) + TILE / 2
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.15)
            const g = ctx.createRadialGradient(x, y, 4, x, y, 24 + pulse * 4)
            g.addColorStop(0, 'rgba(255,210,63,0.15)')
            g.addColorStop(1, 'rgba(255,210,63,0)')
            ctx.fillStyle = g
            ctx.beginPath(); ctx.arc(x, y, 28 + pulse * 4, 0, Math.PI * 2); ctx.fill()
            if (bot && anim) {
                const lastT = anim.trail[anim.trail.length - 1]
                // record only new positions — an idle bot must not smear a
                // static amber blob over itself
                if (tick % 3 === 0 && (!lastT || lastT.x !== x || lastT.y !== y)) {
                    anim.trail.push({ x, y, t: tick }); if (anim.trail.length > 20) anim.trail.shift()
                }
                for (let i = anim.trail.length - 1; i >= 0; i--) if (tick - anim.trail[i].t > 90) anim.trail.splice(i, 1)
                const n = anim.trail.length
                anim.trail.forEach((p, i) => {
                    ctx.globalAlpha = Math.max(0, 1 - (tick - p.t) / 90) * ((i + 1) / n) * 0.3
                    ctx.fillStyle = '#ffd23f'
                    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill()
                })
                ctx.globalAlpha = 1
            }
        }

        const paintAttract = (tick) => {
            ctx.fillStyle = 'rgba(6,10,14,0.66)'; ctx.fillRect(0, 0, W, H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            ctx.fillStyle = 'rgba(8,14,20,0.9)'; ctx.fillRect(W / 2 - 170, 90 + bob, 340, 64)
            ctx.strokeStyle = '#c96a1f'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 170, 90 + bob, 340, 64)
            ctx.font = 'bold 28px monospace'
            ctx.fillStyle = '#e0954e'; ctx.fillText('FLOOR', W / 2 - 46, 128 + bob)
            ctx.fillStyle = '#ffd23f'; ctx.fillText('BOSS', W / 2 + 44, 128 + bob)
            ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#7e9cb0'
            ctx.fillText('AUTONOMOUS WAREHOUSE MANAGEMENT · NIGHT SHIFT', W / 2, 146 + bob)
            if (tick % 60 < 40) {
                ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', W / 2, 184)
            }
            const board = (() => { try { return JSON.parse(localStorage.getItem('floorboss.board') || '[]') } catch { return [] } })()
            if (board.length) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 9px monospace'
                const deep = Math.max(1, ...board.map((e) => e.shift || 1), +(localStorage.getItem('floorboss.deep') || 0)) // #2352: the ladder is the scoreboard
                const manners = +(localStorage.getItem('floorboss.bays') || 0) // #2700: the smoothest floor gets named too
                ctx.fillText(`BEST RUN: ${board[0].score}${deep > 1 ? ` · DEEPEST SHIFT ${deep}` : ''}${manners > 0 ? ` · BAYS ${manners}` : ''}`, W / 2, 206) // #2346: runs now span the ladder
            }
            // #2555: the duel door — cyan chip, tappable or D
            ctx.fillStyle = 'rgba(87,199,255,0.10)'; ctx.fillRect(W / 2 - 110, 236, 220, 24)
            ctx.strokeStyle = '#57c7ff'; ctx.lineWidth = 1.2; ctx.strokeRect(W / 2 - 110.5, 236.5, 221, 23)
            ctx.fillStyle = '#9fdcff'; ctx.font = 'bold 9px monospace'
            ctx.fillText('D — DUEL THE MODEL · TWO SEATS ONE FLOOR', W / 2, 251)
            // #2700: shop-window grammar card — the give-way is part of the floor's
            // law now, and the demo floor ducks too (measured seeds, warm clock-in).
            ctx.fillStyle = 'rgba(120,220,235,0.08)'; ctx.fillRect(W / 2 - 110, 266, 220, 16)
            ctx.strokeStyle = 'rgba(120,220,235,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - 110.5, 266.5, 221, 15)
            ctx.fillStyle = '#9fdcff'; ctx.font = 'bold 8px monospace'
            ctx.fillText('GIVE WAY — CARTS DUCK INTO BAYS AND PASS', W / 2, 277)
            ctx.textAlign = 'left'
        }

        const paintOver = (tick) => {
            ctx.fillStyle = 'rgba(6,10,14,0.8)'; ctx.fillRect(0, 0, W, H)
            ctx.textAlign = 'center'
            const won = gs.end === 'win'
            ctx.font = 'bold 20px monospace'
            ctx.fillStyle = won ? '#5dff8f' : '#ff5a4f'
            // #2346: name the rung the night died or climbed
            ctx.fillText(won ? (gs.shift === 1 ? 'QUOTA CLEARED' : `SHIFT ${gs.shift} CLEARED`)
                : gs.end === 'fired' ? "YOU'RE FIRED" : 'BELOW QUOTA', W / 2, 130)
            ctx.font = '8px monospace'; ctx.fillStyle = '#7e9cb0'
            ctx.fillText(gs.endReason, W / 2, 150)
            ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#ffffff'
            ctx.fillText(`THROUGHPUT ${gs.score}`, W / 2, 190)
            if (gs.duel && gs.duelWinner != null) {
                // #2555: the verdict — richest production till takes the night.
                const [h, mm] = gs.credits
                ctx.font = 'bold 12px monospace'
                ctx.fillStyle = gs.duelWinner === 0 ? '#ffd23f' : gs.duelWinner === 1 ? '#57c7ff' : '#cfe6f5'
                ctx.fillText(gs.duelWinner === 'TIE' ? `MANAGER OF THE NIGHT — DEAD HEAT ${h}` : `MANAGER OF THE NIGHT: ${gs.duelWinner === 0 ? 'YOU' : 'MODEL'} ${gs.duelWinner === 0 ? h : mm} over ${gs.duelWinner === 0 ? mm : h}`, W / 2, 170)
            }
            ctx.font = '8px monospace'; ctx.fillStyle = '#9fc0d8'
            ctx.fillText(`NIGHTS BANKED ${gs.cleared} · CAREER ${gs.score}`, W / 2, 210)
            ctx.fillText(`SHIPPED ${gs.shipped} · STOWS ${gs.stows} · EXPIRED ${gs.expired}/${STRIKES}`, W / 2, 226)
            ctx.fillStyle = gs.ducks > 0 ? '#7fe9f5' : '#5b7688' // #2700: manners countable on the whistle — courtesy rides the sheet even when it earns nothing
            ctx.fillText(gs.ducks > 0 ? `BAYS TAKEN ${gs.ducks} — THE FLOOR REMEMBERS` : 'BAYS TAKEN 0', W / 2, 254)
            // #1921: the freight ledger — what the trailers earned, cost and left behind
            ctx.fillStyle = '#7e9cb0'
            ctx.fillText(`FREIGHT +${gs.freight} · EXPRESS −${gs.fees}${gs.escrow ? ` · ${gs.escrow} STRANDED ON THE PAD` : ' · PAD CLEAN'}`, W / 2, 242)
            if (tick % 60 < 40) {
                ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffffff'
                // #2346: a cleared night promises the ladder; a lost one the attract
                ctx.fillText(won ? `PRESS ANY KEY FOR SHIFT ${gs.shift + 1} — QUOTA ${gs.params.quota + 200}` : 'PRESS ANY KEY', W / 2, 266)
            }
            ctx.textAlign = 'left'
        }

        const paint = () => {
            const tick = gs.tick
            const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            if (shake > 0) shake *= 0.84
            if (shake < 0.3) shake = 0
            ctx.fillStyle = '#060a0e'; ctx.fillRect(0, 0, W, H)
            ctx.save(); ctx.translate(sx, sy)
            const worldDt = Math.max(1, Math.min(8, gs.tick - lastPaintTick))
            lastPaintTick = gs.tick
            paintFloor()
            paintWalls()
            paintConveyor(tick)
            paintOutbound(tick)
            paintRacks()
            paintFlow()
            paintHeat(tick) // #2680: traffic heat rides the grammar — under the amber law paint, above the cyan legality tint
            paintSwing()
            paintTeach(tick)
            paintKnee(tick) // #2711: the knee refusal keep-clear rides the lesson layer
            paintArm(tick)
            paintRobots(tick)
            paintYield(tick) // #2692: courtesy ring + vacated-lane glow paint over the cart, under the arcs
            paintArcs(worldDt)
            paintTutorial(tick)
            paintCursor(tick)
            // #2561 item 4: ownership must survive the whole bot lifecycle — the
            // fx plates (BREAKDOWN over a broken bot, JAM, pickup bursts) bury the
            // employer dots when duel marks paint first, so dots paint on top of
            // effects instead of under them.
            paintParticles()
            paintDuel(tick)
            paintRushWash(tick)
            paintRushScan(tick)
            paintTruck(tick)
            ctx.restore()
            paintHud(tick)
            paintOrders()
            paintFooter()
            if (flash > 0) { ctx.fillStyle = `rgba(255,60,50,${flash / 40})`; ctx.fillRect(0, 0, W, H); flash-- }
            if (screenRef.current === 'play' && clockIn) paintClockIn()
            if (screenRef.current === 'attract') paintAttract(tick)
            if (screenRef.current === 'over') paintOver(tick)
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = now
            let dt = now - last
            last = now
            if (dt > 250) dt = 250
            acc += dt
            let n = 0
            while (acc >= SIM_MS && n < 8) {
                acc -= SIM_MS; n++
                if (!pausedRef.current && !contractHoldsLoop()) doSim()
            }
            paint()
        }

        const startPlay = (duel = false) => {
            // #1473: honor ?seed=N so a filed report replays this exact shift
            const pin = seedFromQuery()
            duelMode = duel // #2555: D at the attract seats the model manager beside you
            tapQueue.length = 0 // #1712: a fresh floor starts with no pending taps
            watchUsed = false // ...and gives the brain its clean slate
            gs = makeGame(pin != null ? pin >>> 0 : (Math.random() * 2 ** 31) | 0, { duel })
            parts.length = 0
            setEnd(null)
            clockIn = null // #2352: a fresh run gets no stale ceremony
            watchingRef.current = false; setWatching(false) // #1637 a new shift starts in your hands
            setMode('play')
            beginEpisode(duel)
            audioController.playTone(262, 0.08, 'square', 0.06)
            audioController.playTone(392, 0.08, 'square', 0.06, 0.09)
            audioController.playTone(523, 0.12, 'square', 0.06, 0.18)
        }

        // #1711 S2 consent gate: the question goes up BEFORE the first take's
        // seed-birth; decline still plays (autoRecord honest-degrades — the
        // recorder simply never opens), and beginRun() only ships bytes the
        // stored grant covers. humanSeats:false — this game labels its seats
        // honestly itself (watch/duel stamps below), Rally's precedent (#2058).
        const humanStart = (duel = false) => {
            if (startBusy()) return
            setStartBusy(true)
            askConsent()
                .then(() => { startPlay(duel); beginRun({ humanSeats: false }) })
                .finally(() => setStartBusy(false))
        }

        // #2346 shift ladder: a cleared night clocks into the next one — the
        // floor persists (hires, racks, freight), the params tighten, and the
        // promise the over screen already made ("NEXT SHIFT") becomes the law.
        const advanceShift = () => {
            if (!nextShift(gs)) return false
            parts.length = 0
            setEnd(null)
            watchingRef.current = false; setWatching(false)
            setMode('play')
            handleEvents(gs.ev, gs.tick) // #2352: the painter reacts to the sim's shiftstart stamp
            audioController.playTone(330, 0.08, 'square', 0.06)
            audioController.playTone(494, 0.08, 'square', 0.06, 0.09)
            audioController.playTone(659, 0.12, 'square', 0.06, 0.18)
            return true
        }

        const toGrid = (ev) => {
            const r = canvas.getBoundingClientRect()
            const px = ((ev.clientX - r.left) / r.width) * W
            const py = ((ev.clientY - r.top) / r.height) * H
            return { px, py, gx: Math.floor((px - GX) / TILE), gy: Math.floor((py - GY) / TILE) }
        }

        const onCanvasClick = (ev) => {
            if (screenRef.current !== 'play' || pausedRef.current) return
            // #1637 WATCH: a click on the floor is the player managing — hand back first.
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
            // #1712 S2: the tap applies NOW (feels instant, its fx drain before
            // the next step like they always did) and BANKS onto the next tick's
            // pad as pointer{down} — replay re-applies it before that same step,
            // so state at every checkpoint matches what this thumb produced.
            const { px, py } = toGrid(ev)
            applyTap(gs, px, py)
            handleEvents(gs.ev, gs.tick)
            tapQueue.push({ px, py })
        }

        const onKeyDown = (e) => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
            if (e.code === 'Escape' || e.code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (pausedRef.current) return
            if (screenRef.current === 'attract') { humanStart(e.code === 'KeyD'); return } // #2555: D seats the model manager; #1711: the gate asks first
            if (screenRef.current === 'over') {
                if (performance.now() - overAt < 600) return
                if (advanceShift()) return // #2346: a cleared night clocks into the next
                closeTake() // #2958: walking away from a cleared night ends the career take (no-op once lost)
                setMode('attract')
                gs = makeGame(ATTRACT_SEEDS[++demoSeed % ATTRACT_SEEDS.length]); warmAttract() // #2700: the shop window always opens on a hot floor
                return
            }
            // #1637 WATCH: Y seats the proven floor manager; any driving key or
            // click takes the shift back (F/R/H are manager verbs — they drive).
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (!gs.end) { watchingRef.current = true; setWatching(true); playWatchStart(); watchUsed = true } // #1712: a brain-steered shift is never labeled a human's
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true
            if (e.code === 'ArrowRight') keys.right = true
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true
            if (e.code === 'Space' || e.code === 'KeyZ') { if (!e.repeat) edgeA = true }
            if (e.code === 'KeyB') { if (!e.repeat) edgeB = true }
            if (e.code === 'KeyF') toggleAuto(gs)
            if (e.code === 'KeyR') setTool(gs, 'rack')
            if (e.code === 'KeyH') hireRobot(gs)
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false
        }
        const onPointerDown = (ev) => {
            if (screenRef.current === 'attract') {
                // #2555: the DUEL chip is a tappable door — seat M (the model
                // manager) joins at either input, no second pad needed.
                const r = canvas.getBoundingClientRect()
                const px = ((ev.clientX - r.left) / r.width) * W
                const py = ((ev.clientY - r.top) / r.height) * H
                if (px >= W / 2 - 110 && px <= W / 2 + 110 && py >= 236 && py <= 260) { humanStart(true); return } // #1711: consent first, then the duel
                humanStart(); return
            }
            if (screenRef.current === 'over' && performance.now() - overAt > 600) {
                if (advanceShift()) return // #2346: tap clocks into the next night
                closeTake() // #2958: leaving a cleared night for the attract ends the career take
                setMode('attract'); gs = makeGame(ATTRACT_SEEDS[++demoSeed % ATTRACT_SEEDS.length]); warmAttract(); return // #2700: back to the shop window, back to a hot floor
            }
            onCanvasClick(ev)
        }

        // ---- contract (QA bots / replays / RL) ----
        const simState = () => {
            const s = state(gs)
            return { ...s, mode: screenRef.current }
        }
        // ---- capture spec (#1711 S2 + #1712) ----
        // One spec for both arms: armLiveCapture makes the live bank exist in
        // production (consent-gated via autoRecord), exposeGame re-arms the
        // byte-identical wiring in DEV. Seats label themselves honestly: seat 0
        // is the thumb UNLESS the brain ever took the shift (watchUsed — the
        // conservative stamp), seat 1 in a duel is the MODEL's own hands.
        const recSpec = {
            id: 'floor-boss',
            method: 'dpad',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            get players() { return duelMode ? 2 : 1 },
            sources: () => {
                const out = [{ kind: watchUsed ? 'model' : 'human' }]
                if (duelMode) out.push({ kind: 'model' }) // seat M — #2555's model manager
                return out
            },
            rules: () => ({ duel: duelMode }),
            reset: (seed, players = 1) => {
                contractSeed = seed >>> 0
                duelMode = (players | 0) >= 2 // #1712: a duel take rebuilds with its seats
                closeTake() // #2958: a rebuild ends any open career take where its floor stood (no-op when idle)
                tapQueue.length = 0
                watchUsed = false
                gs = makeGame(contractSeed, { duel: duelMode })
                parts.length = 0
                setEnd(null)
                setMode('play')
                return state(gs)
            },
            tick: (pad, all = [pad]) => {
                if (screenRef.current !== 'play') { screenRef.current = 'play'; setMode('play') }
                // #2346: pad A on a cleared night clocks into the next shift —
                // the ladder is contract-drivable (QA bots / replays / RL).
                if (gs.end === 'win' && pad && pad.a) {
                    nextShift(gs)
                    parts.length = 0
                    setEnd(null)
                    return state(gs)
                }
                step(gs, gs.duel && all.length >= 2 ? [pad || {}, all[1] || {}] : [pad || {}])
                handleEvents(gs.ev, gs.tick)
                if (gs.end && screenRef.current === 'play') finish()
                return state(gs)
            },
            state: simState,
            canvas: () => canvas,
            // no snapshot/restore: the seeded rng is a closure (#391 family)
        }
        // #1711 S2: arm the live capture for every build (DEV re-arms the
        // identical wiring inside exposeGame); banking only happens while a
        // consented auto capture runs (autoRecord.js).
        initAutoRecord()
        armLiveCapture(recSpec)
        exposeGame(recSpec)

        // DEV hook
        if (import.meta.env.DEV) {
            window.__floorbossTest = {
                state: simState,
                hash: () => stateHash(gs),
                canvas: () => canvas,
                sim: () => gs,
                step: (n = 1, pad = {}, useM = false, pump = false) => { for (let i = 0; i < n; i++) { step(gs, useM && duelMode ? [pad, apM(gs)] : [pad]); if (pump) { handleEvents(gs.ev, gs.tick); gs.ev.length = 0 } } }, // #2555: useM fast-forwards a duel through the model's own manager; #2561: pump drives the painter ceremony (fx/till) that the rAF chain would otherwise skip while FF starves paint
                click: (x, y) => clickCell(gs, x, y),
                press: (code) => onKeyDown({ code, preventDefault() {}, repeat: false }),
                release: (code) => onKeyUp({ code }),
                // ship a covered order on the next tick (harness: proves the truck cycle)
                shipNow: (seat = 0) => {
                    const o = gs.orders.find((x) => !x.shipped && !x.expired)
                    if (!o) return null
                    for (const k of o.items) {
                        gs.staging.push(k)
                        if (gs.duel) gs.stOwn.push(seat) // #2561: the duel ledger needs a shipper — the harness says who staged it
                    }
                    gs.packT = 1
                    return o.id
                },
                truck: () => ({ ...gs.truck }),
                // #2346 harness eyes on the ladder
                shiftInfo: () => ({ shift: gs.shift, quota: gs.params.quota, cleared: gs.cleared, earned: gs.score - gs.shiftBase, params: { ...gs.params } }),
                nextShift: () => nextShift(gs),
                pad: () => gs.pad.map((p) => p.n), // #1911 harness eye on the staged parcels
                padDest: () => gs.pad.map((p) => p.d || 0), // #1927 eye on the destination classes
                padWeight: () => gs.pad.map((p) => p.w || 0), // #1931 eye on the weight classes
                ledger: () => ({ escrow: gs.escrow, paid: gs.paid, freight: gs.freight, fees: gs.fees }), // #1921 harness eye on the freight line
                // #1872 harness eyes on the gantry
                arm: () => ({ held: gs.arm.held, swing: gs.arm.swing, swingT0: gs.arm.swingT0, target: gs.arm.target ? { ...gs.arm.target } : null, heldT: gs.arm.heldT, reach: ARM_REACH }),
                // #1877 eyes on the servo presentation ghosts (renderer-only state)
                servoFx: () => ({ arcs: arcItems.filter((a) => a.servo).length, diamond: diamondA, dmode: gs.arm.swing > 0 ? 'swing' : gs.tool === 'rack' ? 'rack' : gs.arm.held ? 'pulse' : 'off', tool: gs.tool, sway: gripSway, shud: gripShud }),
                // #2627 s3 eye on the swing paint — live elbows the painter marks (renderer-only query, sim untouched)
                swing: () => swingMarkers(gs).map((m) => ({ x: m.x, y: m.y, h: m.h })),
                flow: () => flowMarks(gs).map((m) => ({ axis: m.axis, n: m.flow, cells: m.cells.map((c) => `${c.x},${c.y}`).join('|') })), // #2622 item 3: the two-way grammar, readable to QA
                heat: () => flowHeat(gs).map((c) => ({ x: c.x, y: c.y, n: c.n })), // #2680: live traffic heat — route claims per cell, readable to QA
                knees: () => liveKnees(gs).map((m) => ({ x: m.x, y: m.y, i: m.in, o: m.out, k: `${m.kx},${m.ky}` })), // #2711: knee-blocked turns on the live floor — QA eye
                tails: () => liveTails(gs).map((m) => ({ x: m.x, y: m.y, i: m.in, o: m.out, t: `${m.tx},${m.ty}` })), // #2760: tail-blocked turns on the live floor — the counterweight diagonal a rack owns; QA eye
                swingBodies: () => liveRights(gs), // #2783: loaded pivots facing a BODY in their swing — the residual turn-rights audit reads it per floor; QA eye
                kneeTeach: (x, y) => kneeEscapes(gs, x, y), // #2711 s2: the lesson a refused click gets — bends + honest beside-places, QA eye
                yields: () => gs.robots.filter((b) => b.yield).map((b) => ({ id: b.id, x: b.x, y: b.y, fx: b.yield.fx, fy: b.yield.fy, t: b.yield.t })), // #2692: carts holding shoulders — the pull-off, readable to QA
                ducks: () => gs.ducks, // #2692: the shift's duck tally
                duckTeach: () => (duckTeach ? { x: duckTeach.x, y: duckTeach.y, k: (duckTeach.until - gs.tick) / 150 } : null), // #2700 DEV eye: the GIVE WAY plate is live (play gates sample it atomically with pixels)
                given: () => [...givenAt.keys()], // #2700 DEV eye: cells that just stamped GIVEN
                // #2561 eyes on the twin-till ceremony (renderer-only state): when
                // each seat's chip last armed its growth blink, and the live spend
                // flash (label + color) so the browser gate can name model buys.
                tillFx: () => ({ grow: tillGrowAt.slice(), flash: spendFlash ? { label: spendFlash.label, col: spendFlash.col || '#ffd23f' } : null }),
                // #1637 watchcheck pilot drives these.
                watching: () => watchingRef.current,
                probe: () => ({ tick: gs.tick, score: gs.score, escrow: gs.escrow, freight: gs.freight, fees: gs.fees, shipped: gs.shipped, stows: gs.stows, racks: gs.racks.length, end: gs.end, away: gs.truck.away, far: gs.truck.far, padDest: gs.pad.map((p) => p.d || 0), padWeight: gs.pad.map((p) => p.w || 0), heavy: gs.truck.grid.reduce((s, r) => s + r[2], 0), duel: gs.duel ? { tills: gs.credits.slice(0, 2), house: gs.credits[2], spent: gs.spent, winner: gs.duelWinner, rackOwners: gs.racks.map((r) => r.owner), botOwners: gs.robots.map((b) => b.owner) } : null }), // away/far/padDest #1927, padWeight/heavy #1931, duel eyes #2555
                watchSfx: watchSfxLog,
                GX, GY, TILE, W, H,
            }
            mountDbg({
                title: 'FLOOR BOSS',
                getState: () => [
                    `shift ${gs.shift} | tick ${gs.tick}/${SHIFT} | earned ${gs.score - gs.shiftBase}/${gs.params.quota} strikes ${gs.strikes}/${STRIKES} | ${gs.end || 'running'} ${gs.endReason}`,
                    `banked ${gs.cleared} | score ${gs.score} | flow ${gs.params.orderBase} due x${gs.params.dueMult} wear −${gs.params.wearCut} | shipped ${gs.shipped} staging [${gs.staging.join('')}] escrow ${gs.escrow} paid ${gs.paid} freight +${gs.freight} express −${gs.fees} | stows ${gs.stows} arm ${gs.arm.held || '-'} servo ${gs.arm.swing > 0 ? `swing→${gs.arm.target.x},${gs.arm.target.y} (${gs.arm.swing})` : `wait ${gs.arm.heldT}`} auto ${gs.auto ? 'on' : 'off'} tool ${gs.tool || '-'}`,
                    `road ${gs.truck.away} far ${gs.truck.far} tiers [${gs.truck.tiers.join('')}] pad [${gs.pad.map((p) => `${p.n}x${(p.d || 0) + 1}${(p.w || 0) > 0 ? `w${(p.w || 0) + 1}` : ''}`).join(' ')}] heavy ${gs.truck.grid.reduce((s, r) => s + r[2], 0)}`, // #1927 freight tiers, #1931 weight classes
                    gs.robots.map((b, i) => `bot${i + 1} (${b.x},${b.y}) ${b.task.kind}${b.carry ? ' ' + b.carry : ''}${b.broken ? ' DOWN' : ''}${b.jam ? ' JAM' : ''}${b.yield ? ' BAY' : ''} wear ${Math.round((b.wear / b.wearMax) * 100)}%`).join(' | '),
                ],
                actions: [
                    { label: '+$200 budget', run: () => { gs.score += 200; return '+200' } },
                    { label: 'hire robot', run: () => (hireRobot(gs) ? 'hired' : 'hire refused') },
                    { label: 'break bot 1', run: () => { const b = gs.robots[0]; b.broken = true; b.repair = 600; return 'bot1 down' } },
                    { label: 'force jam', run: () => { if (gs.robots.length > 1) { gs.robots[0].jam = true; gs.robots[1].jam = true; return 'jam armed' } return 'need 2 bots' } },
                    { label: 'spawn order', run: () => { gs.orderT = 0; return 'order due' } },
                    { label: 'fill staging', run: () => { gs.staging.push('crate', 'can', 'coil'); return 'staging stocked' } },
                    { label: 'force quota', run: () => { gs.score = gs.shiftBase + gs.params.quota; return 'quota armed' } }, // #2346: arms THIS shift's rung
                    { label: 'clear shift', run: () => { gs.score = gs.shiftBase + gs.params.quota; gs.tick = SHIFT; return `shift ${gs.shift} quota at the whistle` } }, // #2346: lands the win screen next tick
                    { label: 'next shift', run: () => (nextShift(gs) ? `shift ${gs.shift} clocked in (quota ${gs.params.quota})` : 'not cleared yet') }, // #2346
                    { label: 'reset', run: () => { gs = makeGame(1337); setMode('attract'); return 'rebooted' } },
                ],
            })
        }

        warmAttract() // #2700: the first shop-window loop is hot too — the mount demo ducks while you watch (fixed seed × fixed autopilot = the same floor every visit)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointerDown)
        raf = requestAnimationFrame(loop)
        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: !!gs.end, seed: gs.seed, shift: gs.shift })) // shift additive #2346

        return () => {
            unexposeFeedbackState()
            endRun() // #1711: an unmount mid-run ends the take (no-op when idle)
            tapQueue.length = 0 // #1712: a dead mount carries no pending taps
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointerDown)
            unexposeGame()
            unmountDbg()
            canvas.remove()
            delete window.__floorbossTest
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black select-none">
            <div ref={stageRef} className="relative w-full max-w-[800px] aspect-[800/520]">
                {/* #2254 item 5: the attract lines anchored to the wrapper, not the
                    letterboxed canvas, and sat over the footer. Inside the stage they
                    scale with the canvas; % heights keep them above the footer band
                    (the canvas footer starts at 446/520 ≈ 14% from the bottom). */}
                {screen === 'attract' && (
                    <div className="absolute bottom-[20%] inset-x-0 flex justify-center pointer-events-none z-10">
                        <AttractMessage messages={FB_ATTRACT} ms={2600} className="text-cyan-200/80" />
                    </div>
                )}
                {/* #1663 discoverability: the watch line is static, never cycles away. */}
                {screen === 'attract' && (
                    <div className="absolute bottom-[15%] inset-x-0 flex justify-center pointer-events-none z-10 font-mono text-[10px] tracking-widest text-cyan-200/70">
                        PRESS Y TO WATCH THE PROVEN SHIFT
                    </div>
                )}
            </div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[11px] tracking-widest" ref={setHud('toast')} style={{ color: '#ffd23f', textShadow: '0 1px 0 #000' }} />
            {screen === 'over' && end && (
                <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
                    <p className="font-mono text-[11px] text-white/60">
                        {end.won ? 'The dock seals warm and the chargers glow green.' : end.kind === 'fired' ? 'Three cold orders. The warehouse lights go out behind you.' : 'Close, but the quota is the quota. Back tomorrow at dusk.'}
                    </p>
                </div>
            )}
            {/* #1624 WATCH — the floor runs the proven shift. Bottom-left: the
                top bar chips and the order rail own the canvas's right side. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'play' && !paused && (
                <div className="absolute pointer-events-auto z-50" style={{ bottom: 'calc(12.5rem + var(--sab, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            <VirtualControls secondAction={{ label: 'TOOL', code: 'KeyB' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'FLOOR BOSS')} onResume={handleResume} />}
        </div>
    )
}

export default FloorBossGame

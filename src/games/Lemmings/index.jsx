// LEMMINGS-LITE — the arcade shell: renderer, input, HUD. Decides NOTHING
// about the game: `sim.js` does, in a module plain Node imports — and the
// attract demo is literally a REPLAY of the solver's own winning script from
// `lemcheck` (deterministic replay, on screen, before you ever press a key).
//
// Input: arrows drive the assignment cursor, 1-6 (or the B button) pick the
// skill, Space/click/A apply it to the nearest lemming — the issue's
// one-click assignment, on a phone with just the virtual pad.
//
// Layout: 1. boot/solver cache 2. canvas art (all runtime, no assets)
// 3. fixed-timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { currentPad, setPointer, pointerGesture } from '../../utils/onePad'
import { makeFitCanvas } from '../../utils/fitCanvas'
import { LEVELS, buildLevel } from './levels.js'
import { LAYOUT } from './layout.js'
import { PRESS, MESSAGES, certifyDemoFloat } from './attract.js'
import { makeGame, step, solve, assign, nearestLemming, stateHash, SKILLS, SKILL_NAME, SKILL_KEY, CFG, W, H, DIRT, STEEL, WATER, PLANK, FIXED_DT, defaultSkill } from './sim.js'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'

const TS = 8                                   // internal pixels per tile
const CW = W * TS
const CH = H * TS
const FF_SPEED = 3                             // fast-forward: world seconds per real second

const planCache = new Map()
const planFor = (idx) => {
    if (!planCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        planCache.set(idx, solve(makeGame(meta, grid)).cmds)
    }
    return planCache.get(idx)
}

// #3892: the demo float grants are certified at plan time against the replay
// world (attract.js certifyDemoFloat) — same cache discipline as the plans.
const floatCache = new Map()
const floatFor = (idx) => {
    if (!floatCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        floatCache.set(idx, certifyDemoFloat(meta, grid, planFor(idx), { maxGrants: DEMO_FLOATS }))
    }
    return floatCache.get(idx)
}

const speck = (x, y) => ((x * 7349 + y * 8453) % 7) / 7

const LEM_COLORS = {
    body: '#3fae4a', head: '#ffd9a0', hair: '#8a3b12', pants: '#2a5f9e',
}

// #3844 OH NO! — the original screams over every death; this is the cry made
// visible. Hand-drawn 5×7 bitmap glyphs (white with a black outline reads on
// any ground a corpse may lie on), popped at the death spot on the world clock.
const OHNO_GLYPHS = {
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '###.#', '#.###', '#..##', '#...#', '#...#'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}
const OHNO_WORD = ['O', 'H', ' ', 'N', 'O', '!'].map((ch, i) => ({ ch, x: i * 6 }))
const OHNO_W = 31                                         // 5 px glyphs + 1 px tracking
const OHNO_LIFE = 48                                      // world ticks a cry lingers
const DEMO_FLOATS = 2                                     // #3853 canopies the attract demo spends per level cycle

const LemGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 WATCH: sim.js solve() assigns the skills
    const watchingRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    // #3879 SOUND: mute lives here, per-game — persisted so the player's choice
    // survives a revisit, and REMOVED on exit (unmount restores unmuted) so a
    // quiet LemmingsSession never leaks silence onto the next title.
    const [muted, setMutedState] = useState(() => {
        try { return localStorage.getItem('lemmings.muted') === '1' } catch { return false }
    })
    const mutedRef = useRef(false)
    const toggleMuted = useCallback(() => {
        const on = !mutedRef.current
        mutedRef.current = on
        setMutedState(on)
        audioController.setMuted(on)
        try { localStorage.setItem('lemmings.muted', on ? '1' : '0') } catch { /* private mode: the choice just doesn't persist */ }
        if (!on) audioController.playTone(660, 0.05, 'square', 0.06) // the click that says you're audible again
    }, [])

    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('lemmings.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.lemStage = '1'
        canvas.dataset.fit = 'source'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        canvas.style.opacity = '0'            // the fit display canvas paints on top
        wrap.appendChild(canvas)
        // #432: sizing from a ResizeObserver on the wrapper (the shared fitCanvas
        // shell), not window.resize — on iOS the wrapper box is stale right after
        // rotation or the URL bar moving, and the observer gets the fresh one.
        const fit = makeFitCanvas(canvas, wrap)
        if (fit.display) fit.display.style.touchAction = 'none'
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let levelIdx = 0
        let meta = null, grid = null, gs = null
        let plan = [], planI = 0
        let floatPlan = []                          // #3892 certified demo float grants [{tick,id,air}]
        let demoFloats = 0                            // #3853 canopies spent by the attract demo this cycle
        let raf = 0, last = 0, acc = 0
        let runCmds = []                          // player-command log of the live run
        let watchScript = null                    // #1637 the solver's commands for the WATCH seat
        const splashes = []                       // #3828 drown splashes: {x,y,t}
        const cries = []                          // #3844 OH NO! sprites: {x,y,t}
        const chips = []                          // #3879 splinters/nail-dust: {x,y,vx,vy,t,life,dark,big}
        const squash = {}                         // #3879 landing squash: lemming id → world ticks left
        const SQUASH_LIFE = 6
        // #3879: wood one tick old — a blast's events arrive after the grid has
        // already cleared, so splinters spawn exactly at the cells that WERE wood.
        const woodMask = () => {
            const m = new Uint8Array(W * H)
            for (let i = 0; i < W * H; i++) m[i] = gs.grid[i] === PLANK ? 1 : 0
            return m
        }
        const splinterBlast = (bx, by, wm) => {
            if (!wm) return
            const cx = Math.floor(bx), cy = Math.floor(by)
            let cells = 0
            for (let y = Math.max(0, cy - 2); y <= Math.min(H - 1, cy + 2); y++) {
                for (let x = Math.max(0, cx - 2); x <= Math.min(W - 1, cx + 2); x++) {
                    if (wm[y * W + x] !== 1 || gs.grid[y * W + x] === PLANK) continue   // splinter only cleared WOOD
                    if (++cells > 9) return                                               // a big blast still reads calm
                    for (let k = 0; k < 3; k++) {
                        const r = speck(x + k, y + 3 * k)
                        if (chips.length > 64) chips.shift()
                        chips.push({ x: x + 0.15 + r * 0.7, y: y + 0.25, vx: (r - 0.5) * 1.1, vy: -0.18 - r * 0.38, t: 0, life: 13 + Math.floor(r * 8), dark: r < 0.5, big: k === 0 })
                    }
                }
            }
        }
        const splinterLay = (ex, ey) => {
            // nail-dust: two pale flecks shake loose where a plank lands
            for (let k = 0; k < 2; k++) {
                const r = speck(Math.floor(ex) + k, Math.floor(ey))
                chips.push({ x: ex + (k ? 0.3 : -0.3), y: ey + 0.35 + r * 0.3, vx: k ? 0.1 : -0.1, vy: 0.04 + r * 0.05, t: 0, life: 8, dark: k === 1, big: false })
            }
        }
        const cursor = { x: 8, y: 18 }
        let selected = 'climb'
        const keys = new Set()
        // #432: the shared press-preview-release gesture (onePad.pointerGesture):
        // the finger writes the one pad's pointer, this loop steps the gesture.
        const gest = { pd: false, aim: null }
        let pressId = null                        // the pointer id holding the press
        let ffHeld = false                        // the panel's FF button is down
        let ffId = null                           // the pointer id holding FF (a slide-off release still releases it)
        // A stale press must never commit later: when the run it belongs to is
        // gone (level reload, pause, blur) the gesture is aborted and the one
        // pad's pointer lifted, so a release after the fact finds no press.
        const abortGesture = () => {
            pressId = null
            gest.pd = false
            gest.aim = null
            setPointer(0, 0, false)
        }

        const loadLevel = (idx, freshScore) => {
            levelIdx = idx % LEVELS.length
            const built = buildLevel(levelIdx)
            meta = built.meta; grid = built.grid
            gs = makeGame(meta, grid)
            if (freshScore) gs.score = 0
            plan = planFor(levelIdx); planI = 0
            floatPlan = floatFor(levelIdx)          // #3892 parachute grants, certified for this board
            demoFloats = 0                            // #3853 each demo cycle may show its own parachute
            runCmds = []
            cursor.x = meta.spawn.x; cursor.y = meta.spawn.y - 1
            selected = defaultSkill(meta)
            watchScript = null                            // #1637 a new level starts in your hands
            splashes.length = 0                       // #3828 no ghost splashes across boards
            cries.length = 0                          // #3844 nor ghost wails
            chips.length = 0                          // #3879 nor ghost splinters
            for (const k of Object.keys(squash)) delete squash[k]   // #3879 nor stale squashes
            watchingRef.current = false; setWatching(false)
            abortGesture()                        // no press from the previous run survives into this one
        }
        loadLevel(0, true)

        const nextPlan = () => plan.find((c, i) => i >= planI && c.tick >= gs.tick)

        // #1637 WATCH — seat sim.js's own solver at the LIVE board. PROGNOSIS
        // already proves the pattern: clone the live state (terrain damage and
        // all), ask solve() for the win path, decline honestly when the oracle
        // sees none. The sim is deterministic (lemcheck replays the solver's own
        // script to an identical hash), so applying the clone's commands at their
        // ticks on the live board reproduces the win line exactly.
        const seatWatcher = () => {
            if (!gs || gs.end || screenRef.current !== 'play') return false
            const g2 = makeGame(meta, gs.grid)
            Object.assign(g2, {
                tick: gs.tick, t: gs.t, exited: gs.exited, dead: gs.dead,
                spawned: gs.spawned, skills: { ...gs.skills },
            })
            g2.lemmings = structuredClone(gs.lemmings)
            const r = solve(g2)
            if (!r.win) return false
            watchScript = r.cmds.filter(c => c.tick >= gs.tick)
            return true
        }

        // #3827 FLOATER: deploying a parachute is a swoosh — a falling pitch,
        // the canopy catching air.
        // #3879: the original gives every skill its own voice; five of the six
        // used to share one rising ladder blip. One texture per skill — the
        // block plants, the bomb hisses, the climber grunts, the digger rumbles,
        // the builder knocks wood — all quiet enough to sit under the swarm.
        const skillSfx = (s) => {
            if (s === 'float') audioController.playSweep(880, 392, 0.28, 'triangle', 0.08)
            else if (s === 'block') { audioController.playTone(150, 0.09, 'triangle', 0.09); audioController.playNoise(0.04, 0.02) }
            else if (s === 'bomb') { audioController.playNoise(0.22, 0.018); audioController.playSweep(500, 320, 0.2, 'sine', 0.045) }
            else if (s === 'climb') audioController.playSweep(300, 560, 0.14, 'sawtooth', 0.05)
            else if (s === 'dig') { audioController.playNoise(0.12, 0.05); audioController.playTone(110, 0.06, 'square', 0.05) }
            else if (s === 'build') { audioController.playTone(260, 0.05, 'square', 0.06); audioController.playNoise(0.03, 0.02) }
            else audioController.playTone(520, 0.07, 'square', 0.07)
        }

        // #3844 OH NO! — the original screams over EVERY death. Two syllables:
        // a short worried "OH" and a long, falling "NO!" — sawtooth for the
        // human-voice rasp, per-cause stings still layering on top.
        const ohCry = () => {
            audioController.playSweep(430, 350, 0.16, 'sawtooth', 0.075, null, 0)
            audioController.playSweep(340, 105, 0.42, 'sawtooth', 0.09, null, 0.15)
        }

        const pushCry = (x, y) => {
            if (cries.length >= 4) cries.shift()   // under crowding the oldest recycles
            cries.push({ x, y, t: 0 })
        }

        const handleEvents = (evts, wm) => {
            let deaths = 0
            for (const e of evts) {
                if (e.type === 'exit') { audioController.playSweep(660, 1320, 0.22, 'square', 0.08); audioController.playTone(1760, 0.1, 'square', 0.05) }
                else if (e.type === 'assign') skillSfx(e.skill)
                else if (e.type === 'blast') {
                    audioController.playNoise(0.5, 0.16); audioController.playSweep(220, 50, 0.5, 'sawtooth', 0.1)
                    splinterBlast(e.x, e.y, wm)       // #3879: wood flashes into chips where the blast took planks
                }
                // #3844: every death (fall, drown, bomb) counts one scream and
                // pops an OH NO! on the corpse. A batch dies = one cry.
                else if (e.type === 'splat') { audioController.playSweep(360, 60, 0.22, 'sawtooth', 0.09); deaths++; pushCry(e.x, e.y) }
                else if (e.type === 'drown') {
                    // #3828: the original's wet, descending "blub" — a soft
                    // splash followed by a sinking tone, not a harsh splat.
                    audioController.playNoise(0.14, 0.05)
                    audioController.playSweep(300, 70, 0.4, 'sine', 0.07)
                    const L = gs.lemmings.find((l) => l.id === e.id)
                    if (L) splashes.push({ x: L.x, y: L.y, t: 0 })
                    deaths++; pushCry(e.x, e.y)
                }
                else if (e.type === 'boom') { deaths++; pushCry(e.x, e.y) }
                else if (e.type === 'dig') audioController.playNoise(0.06, 0.03)
                // #3863: wood on wood — the plank's landing knock, a short hammer
                // strike (mid square) layered over a grit tick, never a thud.
                else if (e.type === 'plank') { audioController.playTone(190, 0.05, 'square', 0.06); audioController.playNoise(0.03, 0.02); splinterLay(e.x, e.y) }
                else if (e.type === 'land') { audioController.playTone(120, 0.05, 'triangle', 0.04); squash[e.id] = SQUASH_LIFE }   // #3879 knees bend on touchdown
                else if (e.type === 'landsoft') { audioController.playTone(200, 0.07, 'sine', 0.035); squash[e.id] = SQUASH_LIFE }
                else if (e.type === 'step') audioController.playTone(220, 0.03, 'triangle', 0.025)
                else if (e.type === 'crest') audioController.playTone(880, 0.07, 'sine', 0.05)
                else if (e.type === 'climbblock') audioController.playSweep(300, 620, 0.12, 'triangle', 0.05)
                else if (e.type === 'wake') audioController.playSweep(620, 300, 0.14, 'square', 0.05)
                else if (e.type === 'turn') audioController.playTone(90, 0.02, 'triangle', 0.015)
                else if (e.type === 'spawn') audioController.playTone(330, 0.05, 'square', 0.04)
                else if (e.type === 'win') audioController.playSweep(392, 1568, 0.7, 'square', 0.1)
                else if (e.type === 'lose' || e.type === 'time') audioController.playDeath()
            }
            if (deaths) ohCry()
        }

        const finish = () => {
            watchScript = null                                  // #1637 the run ends in your hands
            watchingRef.current = false; setWatching(false)
            const won = gs.win
            const entry = { score: gs.score, out: gs.exited, level: meta.name, date: new Date().toISOString().slice(2, 10) }
            if (won || gs.exited > 0) localStorage.setItem('lemmings.board', JSON.stringify([...board(), entry].sort((a, b) => b.score - a.score).slice(0, 8)))
            setEnd({
                score: gs.score, out: gs.exited, need: meta.need, won,
                cause: won ? (levelIdx >= LEVELS.length - 1 ? 'EVERY LEDGE CROSSED' : 'LEVEL CLEARED') : 'THE COUNT WASN T MET',
                last: won && levelIdx >= LEVELS.length - 1,
            })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const applySkill = (sx, sy) => {
            const L = nearestLemming(gs, sx, sy)
            if (!L) { audioController.playTone(140, 0.06, 'sawtooth', 0.05); return }
            if (assign(gs, L.id, selected)) {
                runCmds.push({ tick: gs.tick, id: L.id, skill: selected })
                skillSfx(selected)
            } else audioController.playTone(140, 0.06, 'sawtooth', 0.05)
        }

        // #432: the shared pointer gesture, driven by THE one pad's pointer.
        // The reach is POINTER_HIT_PX screen px in the shared targeting, so the
        // pick is the same thumb-size at any zoom (stageScale = screen px per
        // world tile, from the fit display's live size).
        const stageScale = () => {
            const el = fit.display || canvas
            const w = el && el.clientWidth ? el.clientWidth : CW
            return w / W
        }
        const liveCands = () => gs.lemmings.filter(L => L.live).map(L => ({ x: L.x, y: L.y - 0.5, id: L.id }))
        const commitAssign = (a) => {
            if (!a) return                        // release on nothing: nothing
            if (assign(gs, a.id, selected)) {
                runCmds.push({ tick: gs.tick, id: a.id, skill: selected })
                skillSfx(selected)
            } else audioController.playTone(140, 0.06, 'sawtooth', 0.05)
        }
        const stepGesture = (p) => pointerGesture(gest, p, liveCands(), p.x * W, p.y * H, stageScale(), commitAssign)

        const doSim = () => {
            // #3828 splash rings are cosmetic but ride the WORLD clock, so FF
            // and slow-mo animate them with the sim (never setTimeout — AGENTS).
            for (let i = splashes.length - 1; i >= 0; i--) { if (++splashes[i].t > 30) splashes.splice(i, 1) }
            for (let i = cries.length - 1; i >= 0; i--) { if (++cries[i].t > OHNO_LIFE) cries.splice(i, 1) }
            // #3879 chips arc on the WORLD clock like splashes (gravity, then gone);
            // squashed landings hold a beat and relax.
            for (let i = chips.length - 1; i >= 0; i--) { const c = chips[i]; c.t++; c.x += c.vx; c.y += c.vy; c.vy += 0.035; if (c.t > c.life) chips.splice(i, 1) }
            for (const k of Object.keys(squash)) { if (--squash[k] <= 0) delete squash[k] }
            const wm = woodMask()               // #3879 wood as it stands BEFORE this tick's step
            if (screenRef.current === 'attract') {
                // attract = the solver's proven script, replayed on screen.
                // #3892 PHASE: apply stamp T at g.tick===T — the same phase
                // solve() verified and a human keypress has (assign between the
                // steps; the step advancing to T+1 moves the body). The old
                // `+ 1` fired every command a tick early, desyncing the demo
                // from the proven line — THE DOOR visibly drowned two walkers
                // the oracle never claimed.
                const c = plan.find(cc => cc.tick === gs.tick)
                if (c) assign(gs, c.id, c.skill)
                // #3853 attract-parachute, #3892 honest edition: the solver never
                // needs floaters, so the replay showed four skills while the game
                // offers five. The demo now spends the level's OWN float charges on
                // candidates CERTIFIED at plan time (attract.js certifyDemoFloat):
                // each grant replayed against the script with win/exited/dead
                // demanded identical. Where an airborne body certifies (SPIRE's
                // descent, DOOR's post-bomb drop) the canopy is shown DEPLOYING
                // mid-fall — the original's attract did exactly this; where only a
                // walker certifies, the canopy rides on show and the world is
                // proven unmoved. The pre-#3892 demo caught its air from the
                // desync itself (crowds tossed over lips the solver actually
                // held); an honest board may not promise a deploy it cannot
                // deliver, so every grant is now proven, never hoped.
                // startPlay() rebuilds the level fresh, so demo floats never eat
                // into the player's supply. Exact tick only, and the counter
                // advances whether the grant lands or is refused — retrying late
                // would put a chute on a body in a state that was never certified.
                while (demoFloats < floatPlan.length && gs.tick === floatPlan[demoFloats].tick) {
                    if (assign(gs, floatPlan[demoFloats].id, 'float')) skillSfx('float')
                    demoFloats++
                }
                handleEvents(step(gs).events, wm)
                if (gs.end) loadLevel((levelIdx + 1) % LEVELS.length, true)
            } else if (screenRef.current === 'play') {
                const sp = 11 * FIXED_DT
                if (keys.has('ArrowLeft')) cursor.x = Math.max(0.5, cursor.x - sp)
                if (keys.has('ArrowRight')) cursor.x = Math.min(W - 0.5, cursor.x + sp)
                if (keys.has('ArrowUp')) cursor.y = Math.max(2, cursor.y - sp)
                if (keys.has('ArrowDown')) cursor.y = Math.min(H - 1, cursor.y + sp)
                if (watchingRef.current && watchScript) {
                    // #1637/#3892 same stamp rule as attract's replay: apply
                    // stamp T at g.tick===T — the proven line, live, in the
                    // exact phase the solver verified it in.
                    const c = watchScript.find(cc => cc.tick === gs.tick)
                    if (c) assign(gs, c.id, c.skill)
                }
                handleEvents(step(gs, { x: cursor.x, y: cursor.y }).events, wm)
                if (gs.end) finish()
            }
        }

        // #3879 SOUND: the bed follows the game, transitions only (no per-frame
        // bus spam — the controller's own law). Attract rides it low (the
        // original's attract had its soundtrack on), play takes it to full,
        // pause and the over screen take it out — the win sweep / death
        // fanfare own the end beats. Desired level is memoized, so steady
        // states pay nothing; stopMusic on the event side (win/lose) does NOT
        // re-arm, because no transition happened — the fanfare stays clean.
        let musicWanted = null
        const syncMusic = () => {
            const sc = screenRef.current
            const want = sc === 'attract' ? 0.45
                : sc === 'play' && !pausedRef.current ? 1
                    : null
            if (want === musicWanted) return
            musicWanted = want
            if (want == null) audioController.stopMusic()
            else { audioController.startMusic('lemmings'); audioController.setMusicLevel(want) }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            syncMusic() // #3879: runs even while paused — the pause IS a transition
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            // #432: the one pad, one gesture — the finger (or a scripted
            // __game.step) writes the pointer's down / x / y, and the shared
            // press-preview-release gesture steps here: press previews, a slide
            // re-targets, the release assigns. CYCLE is gone (the panel picks).
            if (!pausedRef.current && screenRef.current === 'play' && !contractHoldsLoop()) {
                stepGesture(currentPad('pointer').pointer)
            }
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft * (ffHeld ? FF_SPEED : 1)
                    while (acc >= FIXED_DT * 1000) { doSim(); acc -= FIXED_DT * 1000 }
                }
            }
            paint()
            syncHud()
            fit.blit()
        }

        // ---------- painter ----------
        const paint = () => {
            // sky: full-canvas gradient, a sun, parallax ridges and fluffy
            // clouds — all drawn behind the rock. The Amiga original sells
            // depth with layered hills and a bright sky; a flat fill reads as
            // a test fixture.
            const sky = ctx.createLinearGradient(0, 0, 0, CH)
            sky.addColorStop(0, '#3f8fca')
            sky.addColorStop(0.5, '#7ec8e3')
            sky.addColorStop(1, '#cdeaf4')
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, CW, CH)
            ctx.fillStyle = 'rgba(255,252,235,0.30)'
            ctx.beginPath(); ctx.arc(322, 44, 30, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = 'rgba(255,252,235,0.9)'
            ctx.beginPath(); ctx.arc(322, 44, 15, 0, Math.PI * 2); ctx.fill()
            const ridge = (base, amp, col) => {
                ctx.fillStyle = col
                ctx.beginPath()
                ctx.moveTo(0, CH)
                for (let x = 0; x <= CW; x += 12) {
                    const y = base + Math.sin(x * 0.045 + base) * amp + Math.sin(x * 0.017) * amp * 0.6
                    ctx.lineTo(x, y)
                }
                ctx.lineTo(CW, CH); ctx.closePath(); ctx.fill()
            }
            ridge(150, 11, 'rgba(120,160,168,0.5)')
            ridge(168, 13, 'rgba(84,126,136,0.65)')
            const cloud = (cx, cy, s) => {
                ctx.fillStyle = 'rgba(255,255,255,0.92)'
                for (const [dx, dy, w, h] of [[-13, 2, 24, 8], [3, -3, 20, 9], [-1, 4, 28, 7]]) {
                    ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, w * s, h * s, 0, 0, Math.PI * 2); ctx.fill()
                }
            }
            cloud(86, 54, 1); cloud(214, 84, 1.25); cloud(300, 96, 0.9)

            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === 0) continue
                    const px = x * TS, py = y * TS
                    if (t === WATER) {
                        // #3828 the pond: layered blue with a sunlit surface. The
                        // row under open sky is the surface — a bright, rippling
                        // band that shifts with the clock so the water reads as
                        // water even in a still screenshot.
                        const surf = y === 0 || gs.grid[(y - 1) * W + x] !== WATER
                        ctx.fillStyle = surf ? '#2f7fb8' : '#1d5b8c'
                        ctx.fillRect(px, py, TS, TS)
                        if (surf) {
                            const ph = Math.floor(gs.tick / 14) + x
                            ctx.fillStyle = ph % 3 === 0 ? '#8ad9f2' : ph % 3 === 1 ? '#5cb8e0' : '#43a4d2'
                            ctx.fillRect(px, py, TS, 2)
                            ctx.fillStyle = 'rgba(13,48,74,0.35)'
                            ctx.fillRect(px + 1, py + TS - 3, TS - 2, 1)
                        } else {
                            ctx.fillStyle = 'rgba(10,36,58,0.4)'
                            ctx.fillRect(px + 2, py + 2 + (x % 2) * 2, 3, 1)
                        }
                        continue
                    }
                    if (t === PLANK) {
                        // #3863 BUILDER's wood: warmer and paler than dirt so
                        // "placed" reads against geology at a glance — board
                        // grain, a sunlit walking lip when open sky sits above,
                        // iron nails at the ends.
                        // #3879 LOOK: the road LEANS into the descent. A plank
                        // whose nearest downhill neighbour is within reach keeps
                        // its flat tread (that is where feet land — the grid still
                        // speaks whole cells) and drops a nose over its downhill
                        // edge, nosing-to-nosing onto the next board like the
                        // original's planks riding the stair. The road steps two
                        // cells at a time on SPIRE's face, so the lean reaches
                        // two columns. Overhang beyond the cell is tucked under
                        // whatever the scan paints there afterwards (terrain or
                        // the next board); a sky gap keeps the nose visible.
                        const plankAt = (ix, iy) => ix >= 0 && ix < W && iy >= 0 && iy < H && gs.grid[iy * W + ix] === PLANK
                        const leanR = plankAt(x + 1, y + 1) || plankAt(x + 2, y + 1) || plankAt(x + 2, y + 2)
                        const leanL = plankAt(x - 1, y + 1) || plankAt(x - 2, y + 1) || plankAt(x - 2, y + 2)
                        const lean = leanR && !leanL ? 1 : leanL && !leanR ? -1 : 0
                        const NOSE = [0, 0, 0, 0, 0, 1, 2, 4]        // per-column drop at the downhill end
                        const noseCols = 2                            // columns reaching past the downhill edge
                        const N = TS + noseCols
                        const topCol = (ox) => {
                            const j = lean > 0 ? ox : N - 1 - ox
                            return j < TS ? NOSE[j] : NOSE[TS - 1] + (j - (TS - 1))
                        }
                        if (lean === 0) {
                            ctx.fillStyle = '#a8722f'; ctx.fillRect(px, py, TS, TS)
                            ctx.fillStyle = '#c89050'
                            ctx.fillRect(px, py + 1, TS, 2); ctx.fillRect(px, py + 5, TS, 2)
                            ctx.fillStyle = '#7c4a18'
                            ctx.fillRect(px, py + 4, TS, 1)
                            ctx.fillStyle = '#4b2e0d'
                            ctx.fillRect(px + 1, py + 3, 1, 1); ctx.fillRect(px + TS - 2, py + 3, 1, 1)
                        } else {
                            for (let ox = 0; ox < N; ox++) {
                                const col = lean > 0 ? px + ox : px + (N - 1) - ox
                                const t0 = topCol(ox)
                                ctx.fillStyle = '#a8722f'; ctx.fillRect(col, py + t0, 1, TS)              // full board thickness follows the lean
                                ctx.fillStyle = '#c89050'
                                ctx.fillRect(col, py + t0 + 1, 1, 2); ctx.fillRect(col, py + t0 + 5, 1, 2)
                                ctx.fillStyle = '#7c4a18'; ctx.fillRect(col, py + t0 + 4, 1, 1)
                            }
                            ctx.fillStyle = '#4b2e0d'
                            ctx.fillRect(px + (lean > 0 ? 1 : N - 2), py + topCol(lean > 0 ? 1 : N - 2) + 3, 1, 1)
                            ctx.fillStyle = '#59371a'                                                       // dark end line at the nose tip
                            ctx.fillRect(px + (lean > 0 ? N - 1 : 0), py + NOSE[TS - 1] + noseCols, 1, TS - noseCols)
                        }
                        if (y > 0 && gs.grid[(y - 1) * W + x] !== PLANK) {
                            ctx.fillStyle = '#e6c17c'
                            if (lean === 0) ctx.fillRect(px, py, TS, 1)
                            else for (let ox = 0; ox < N; ox++) ctx.fillRect(px + (lean > 0 ? ox : N - 1 - ox), py + topCol(ox), 1, 1)   // lip rides the slope
                        }
                    } else if (t === DIRT) {
                        ctx.fillStyle = '#7a4a22'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = speck(x, y) > 0.5 ? '#8d5a2c' : '#68391a'
                        ctx.fillRect(px + 1, py + 2, 2, 2); ctx.fillRect(px + 5, py + 5, 2, 1)
                        if (y > 0 && gs.grid[(y - 1) * W + x] === 0) {
                            ctx.fillStyle = '#59b25d'; ctx.fillRect(px, py, TS, 2)
                            ctx.fillStyle = '#6fce72'
                            ctx.fillRect(px + 1, py, 1, 3); ctx.fillRect(px + 5, py, 1, 4); ctx.fillRect(px + 7, py, 1, 3)
                        }
                    } else {
                        // steel = unbreakable rock: the dark cool bedrock the dirt
                        // sits on (and the plug the bomb cannot open). Variegated
                        // stone, not a metal road.
                        ctx.fillStyle = '#5d6b78'; ctx.fillRect(px, py, TS, TS)
                        if (y > 0 && gs.grid[(y - 1) * W + x] !== STEEL) { ctx.fillStyle = '#8b98a2'; ctx.fillRect(px, py, TS, 2) }
                        const r = speck(x, y)
                        if (r > 0.5) { ctx.fillStyle = '#6a7983'; ctx.fillRect(px + 1 + Math.floor(r * 4), py + 2 + Math.floor(r * 3), 2, 2) }
                        else if (r < 0.22) { ctx.fillStyle = '#454f59'; ctx.fillRect(px + 1 + Math.floor(r * 26), py + 3 + Math.floor(r * 6), 2, 1) }
                    }
                }
            }

            // spawn cave + exit door
            ctx.fillStyle = '#241608'
            ctx.fillRect(meta.spawn.x * TS - 3, (meta.spawn.y - 1) * TS, TS + 6, TS + 2)
            const ex = Math.round(meta.exit.x * TS), ey = Math.round(meta.exit.y * TS - TS)
            ctx.fillStyle = '#0e2412'
            ctx.fillRect(ex, ey, TS, TS * 2 - 1)
            ctx.fillStyle = '#59e05e'
            ctx.fillRect(ex, ey, TS, 2)                       // glowing lip
            ctx.fillRect(ex, ey + 2, 2, TS * 2 - 3)           // side glow
            ctx.fillRect(ex + TS - 2, ey + 2, 2, TS * 2 - 3)
            ctx.fillStyle = 'rgba(89,224,94,0.35)'
            ctx.fillRect(ex + 2, ey + 3, TS - 4, TS * 2 - 6)  // inner light

            // lemmings
            for (const L of gs.lemmings) {
                if (!L.live && L.state !== 'dead') continue
                const px = Math.round(L.x * TS - 3), py = Math.round(L.y * TS - (L.state === 'dead' ? 3 : 8))
                if (L.state === 'dead') {
                    // #3828: drowned lemmings sink — no grey corpse left sitting
                    // on the pond; the splash ring already marked where.
                    const gx = Math.min(W - 1, Math.max(0, Math.floor(L.x)))
                    const gy = Math.min(H - 1, Math.max(0, Math.floor(L.y)))
                    if (gs.grid[gy * W + gx] === WATER) continue
                    ctx.fillStyle = '#8d97a3'; ctx.fillRect(px - 1, py + 5, 8, 3)
                    continue
                }
                if (L.state === 'bomb' && Math.floor(gs.tick / 6) % 2 === 0) {
                    ctx.fillStyle = '#e23b3b'; ctx.fillRect(px - 1, py - 1, 8, 9)
                    ctx.fillStyle = Math.floor(gs.tick / 3) % 2 ? '#ffd83d' : '#ff8c42'   // #3879 fuse spark spits
                    ctx.fillRect(px + 3, py - 2, 1, 1)
                }
                // #3879 LOOK: the little brown figures — a hair cap (fringe, a
                // side strand at the back, a flick that flutters mid-stride) and
                // a four-frame walk: the body bobs a pixel off the ground while
                // a foot swings. Landing squash flattens the whole figure for a
                // beat (knees, then relax) on the WORLD clock.
                const walking = L.state === 'walk'
                const ph = Math.floor(gs.tick / 6 + L.id) % 4
                const flat = (squash[L.id] || 0) > 0
                const bob = walking && !flat && (ph === 1 || ph === 3) ? -1 : 0
                const d = L.dir > 0 ? 1 : -1
                const hy = py + bob + (flat ? 2 : 0)
                ctx.fillStyle = LEM_COLORS.head; ctx.fillRect(px + 1, hy, 5, 3)
                ctx.fillStyle = LEM_COLORS.hair
                ctx.fillRect(px + 1, hy, 5, 1)                                             // fringe
                ctx.fillRect(d > 0 ? px + 1 : px + 5, hy + 1, 1, 1)                      // strand at the back
                ctx.fillRect(d > 0 ? px : px + 6, hy + 1 + (walking ? ph % 2 : 1), 1, 1)  // flick, flutters on the stride
                ctx.fillStyle = '#1b2a3a'                     // two eyes, offset toward the facing
                const eo = L.dir > 0 ? 1 : 0
                ctx.fillRect(px + 2 + eo, hy + 1, 1, 1); ctx.fillRect(px + 4 + eo, hy + 1, 1, 1)
                const crouch = L.state === 'dig' ? 1 : 0
                ctx.fillStyle = LEM_COLORS.body
                ctx.fillRect(px + 1, py + 3 + bob + (flat ? 1 : 0) + crouch, 5, flat ? 2 : 3 - crouch)
                ctx.fillStyle = LEM_COLORS.pants
                if (flat) {
                    ctx.fillRect(px, py + 6, 2, 1); ctx.fillRect(px + 5, py + 6, 2, 1)  // knees splayed on touchdown
                } else if (walking) {
                    const lead = d > 0 ? px + 4 : px + 1          // leading/trailing foot columns
                    const trail = d > 0 ? px + 1 : px + 4
                    if (ph === 1) { ctx.fillRect(lead + d, py + 6, 2, 1); ctx.fillRect(trail - d, py + 6, 2, 2) }    // stride: feet reach out past the body
                    else if (ph === 3) { ctx.fillRect(lead - d, py + 6, 2, 2); ctx.fillRect(trail + d, py + 6, 2, 1) }   // recovery: feet pull in under it
                    else { ctx.fillRect(px + 1, py + 6, 2, 2); ctx.fillRect(px + 4, py + 6, 2, 2) }
                } else if (L.state === 'fall') {
                    ctx.fillRect(px, py + 6, 1, 2); ctx.fillRect(px + 6, py + 6, 1, 2)  // legs dangle loose
                } else if (L.state === 'dig') {
                    ctx.fillRect(px + 1, py + 6, 2, 1); ctx.fillRect(px + 4, py + 6, 2, 1)  // braced short legs
                } else {
                    ctx.fillRect(px + 1, py + 6, 2, 2); ctx.fillRect(px + 4, py + 6, 2, 1)
                }
                if (L.state === 'block') { ctx.fillStyle = LEM_COLORS.body; ctx.fillRect(px - 3, py + 3, 3, 1); ctx.fillRect(px + 6, py + 3, 3, 1) }
                if (L.state === 'climb') {
                    ctx.fillStyle = LEM_COLORS.head
                    ctx.fillRect(px + (d > 0 ? 5 : -1), py - 2, 2, 3)                                        // leading arm up
                    ctx.fillRect(px + (d > 0 ? -1 : 5), py + (Math.floor(gs.tick / 5 + L.id) % 2 ? 1 : 2), 2, 2)   // other arm pumps
                }
                if (L.state === 'dig') {
                    // #3879 the dig pose: crouched body, shovel pumping into the
                    // chewed row and back — a bite every four ticks.
                    ctx.fillStyle = LAYOUT.badge.digger
                    ctx.fillRect(px + (d > 0 ? 6 : -3), py + 4 + (Math.floor(gs.tick / 4 + L.id) % 2), 3, 2)
                } else if (L.digger && L.state !== 'bomb') { ctx.fillStyle = LAYOUT.badge.digger; ctx.fillRect(px + (d > 0 ? 6 : -3), py + 3, 3, 2) }
                // #422 item 4: a life-badge on flagged lemmings, so a climber is
                // still recognisable after it crests and goes back to walking.
                // #470: two pixels thick — at 1 px the gold hairline vanished
                // into the hair row and a clump looked like nobody had a skill.
                // #3863 BUILDER: the original carries its planks overhead —
                // a board across the shoulders, tilting with direction, so the
                // wood-hauler in the crowd is recognisable before a single plank
                // is laid. (The plank itself is the game's, drawn by the painter.)
                if (L.builder && L.state !== 'bomb') {
                    const tilt = Math.floor(gs.tick / 10 + L.id) % 2
                    ctx.fillStyle = '#c89050'
                    ctx.fillRect(px - 4, py - 4 + tilt, 14, 2)
                    ctx.fillStyle = '#7c4a18'
                    ctx.fillRect(px - 4, py - 2 + tilt, 1, 1); ctx.fillRect(px + 9, py - 2 + tilt, 1, 1)
                }
                if (L.climber && L.state !== 'bomb') { ctx.fillStyle = LAYOUT.badge.climber; ctx.fillRect(px, py - 2, 7, 2) }
                // #3827 FLOATER: the original rides its parachute even while
                // walking — you always know who carries one. Striped canopy,
                // 2-frame sway, shroud lines to the shoulders.
                if (L.floater && L.state !== 'bomb') {
                    // #3879: the canopy rocks on a three-step drift (−1,0,+1)
                    // instead of a hard two-frame jitter, and dips with a landing
                    // squash before springing back.
                    const cy = py - 8 + (flat ? 2 : 0)
                    const sway = [0, 1, 0, -1][Math.floor(gs.tick / 5 + L.id) % 4]
                    ctx.fillStyle = '#efe9d8'
                    ctx.fillRect(px - 3 + sway, cy, 12, 2)
                    ctx.fillStyle = '#d83a3a'
                    ctx.fillRect(px - 1 + sway, cy, 2, 2)
                    ctx.fillRect(px + 3 + sway, cy, 2, 2)
                    ctx.fillStyle = 'rgba(239,233,216,0.7)'
                    ctx.fillRect(px - 2 + sway, cy + 2, 1, 3)
                    ctx.fillRect(px + 7 + sway, cy + 2, 1, 3)
                }
            }

            // #470: the grant flash — the lemming that JUST received a skill
            // gets a bright expanding ring, so "count dropped" always shows
            // WHO it dropped for, even inside a spawn clump.
            for (const L of gs.lemmings) {
                if (!L.live || L.flashT <= 0) continue
                const f = L.flashT / CFG.flash
                const rx = Math.round(L.x * TS), ry = Math.round((L.y - 0.5) * TS)
                ctx.strokeStyle = `rgba(255,216,61,${(0.25 + 0.75 * f).toFixed(2)})`
                ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(rx, ry, 8 + (1 - f) * 7, 0, Math.PI * 2); ctx.stroke()
            }

            // #3828 drown splashes: an expanding cyan ring with foam flecks,
            // so "who the pond took" reads at a glance even in a busy crowd.
            for (const s of splashes) {
                const f = 1 - s.t / 30
                const rx = Math.round(s.x * TS), ry = Math.round((s.y - 0.5) * TS)
                ctx.strokeStyle = `rgba(138,217,242,${(0.85 * f).toFixed(2)})`
                ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(rx, ry, 3 + (1 - f) * 10, 0, Math.PI * 2); ctx.stroke()
                ctx.fillStyle = `rgba(240,250,255,${(0.9 * f).toFixed(2)})`
                ctx.fillRect(rx - 4, ry - 1, 2, 2); ctx.fillRect(rx + 3, ry - 2, 2, 2); ctx.fillRect(rx - 1, ry - 4, 2, 2)
            }

            // #3844 OH NO! sprites — the wail made visible. Pops at the death
            // spot (event coords), rises a few pixels and fades on the WORLD
            // clock, so FF animates it with the sim exactly like the splashes.
            for (const c of cries) {
                const k = c.t / OHNO_LIFE
                const rise = Math.round(6 * k)
                const a = k < 0.7 ? 1 : (1 - k) / 0.3
                const bx = Math.max(1, Math.min(CW - OHNO_W - 1, Math.round(c.x * TS) - (OHNO_W >> 1)))
                const by = Math.max(1, Math.round(c.y * TS) - 15 - rise)
                ctx.globalAlpha = Math.max(0, Math.min(1, a))
                for (let pass = 0; pass < 2; pass++) {            // outline, then face
                    ctx.fillStyle = pass === 0 ? '#141019' : '#fff6de'
                    for (const gl of OHNO_WORD) {
                        const rows = OHNO_GLYPHS[gl.ch]
                        for (let r = 0; r < 7; r++) {
                            for (let q = 0; q < 5; q++) {
                                if (rows[r][q] !== '#') continue
                                if (pass === 1) ctx.fillRect(bx + gl.x + q, by + r, 1, 1)
                                else {
                                    ctx.fillRect(bx + gl.x + q - 1, by + r, 1, 1)
                                    ctx.fillRect(bx + gl.x + q + 1, by + r, 1, 1)
                                    ctx.fillRect(bx + gl.x + q, by + r - 1, 1, 1)
                                    ctx.fillRect(bx + gl.x + q, by + r + 1, 1, 1)
                                }
                            }
                        }
                    }
                }
                ctx.globalAlpha = 1
            }

            // #3879 splinters & nail-dust: two-tone tan chips arcing out of
            // wood the blast cleared, pale flecks where a plank lands.
            for (const c of chips) {
                const a = 1 - c.t / c.life
                ctx.globalAlpha = Math.max(0, Math.min(1, a))
                ctx.fillStyle = c.dark ? '#7c4a18' : '#c89050'
                ctx.fillRect(Math.round(c.x * TS), Math.round(c.y * TS), c.big ? 2 : 1, c.big ? 2 : 1)
            }
            ctx.globalAlpha = 1

            // cursor (play) or autopilot ghost (attract): in attract the box
            // sits on the live body the solver script is about to command
            const playing = screenRef.current === 'play'
            const pc = nextPlan()
            const ghost = pc && gs.lemmings.find(l => l.id === pc.id && l.live)
            const cx = playing ? cursor.x : (ghost ? ghost.x : cursor.x)
            const cy = playing ? cursor.y : (ghost ? ghost.y - 1 : cursor.y)
            const skill = playing ? selected : (pc?.skill || 'climb')
            ctx.strokeStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.45)'
            ctx.lineWidth = 1
            ctx.setLineDash([3, 2])
            ctx.strokeRect(Math.round(cx * TS - 9.5), Math.round(cy * TS - 13.5), 19, 21)
            ctx.setLineDash([])
            ctx.fillStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.6)'
            ctx.font = '7px monospace'
            ctx.fillText(SKILL_NAME[skill][0], Math.round(cx * TS - 2), Math.round(cy * TS + 12))

            // #422 item 4: the hover ring — WHICH lemming Space/tap would pick
            // right now. Same pick function applySkill uses, so the ring never
            // lies about the target.
            if (playing && !gest.aim) {
                const hov = nearestLemming(gs, cursor.x, cursor.y)
                if (hov) {
                    ctx.strokeStyle = 'rgba(255,216,61,0.75)'
                    ctx.lineWidth = 1
                    ctx.beginPath(); ctx.arc(Math.round(hov.x * TS), Math.round((hov.y - 0.5) * TS), 8, 0, Math.PI * 2); ctx.stroke()
                }
            }

            // #432: press, preview, release — the ring on the lemming that WILL
            // get the skill. Drawn last (above everything the finger covers) and
            // sized to read around a thumb that is still on the target.
            if (playing && gest.aim) {
                const L = gs.lemmings[gest.aim.id]
                if (L && L.live) {
                    const rx = Math.round(L.x * TS)
                    const ry = Math.round((L.y - 0.5) * TS)
                    ctx.strokeStyle = '#ffd83d'
                    ctx.lineWidth = 2
                    ctx.setLineDash([4, 3])
                    ctx.beginPath(); ctx.arc(rx, ry, 11 + Math.sin(gs.tick / 4) * 1.5, 0, Math.PI * 2); ctx.stroke()
                    ctx.setLineDash([])
                    ctx.fillStyle = '#ffd83d'
                    ctx.font = 'bold 8px monospace'
                    ctx.fillText(SKILL_NAME[selected][0], rx - 2, ry + 3)
                }
            }
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.time) hud.time.style.width = `${Math.max(0, 100 * (1 - gs.t / meta.time))}%`
            if (hud.out) hud.out.textContent = `${gs.exited}/${meta.need}`
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.left) hud.left.textContent = `${LAYOUT.hud.pre}${gs.spawned - gs.exited - gs.dead}${LAYOUT.hud.mid}${gs.dead}`
            for (const s of SKILLS) {
                const el = hud['sk_' + s]
                if (el) {
                    el.textContent = String(gs.skills[s])
                    el.style.opacity = gs.skills[s] > 0 ? '1' : '0.25'
                }
                const btn = document.querySelector(`[data-lem-skill="${s}"]`)
                if (btn) btn.style.borderColor = selected === s && screenRef.current === 'play' ? '#fcd34d' : ''
            }
            if (hud.lvl) hud.lvl.textContent = `${levelIdx + 1}. ${meta.name}`
        }

        // ---------- input ----------
        const startPlay = () => {
            // #1473: honor ?seed=N so a filed report's seed reopens the level it was
            // filed from (this game has zero runtime randomness — levels are fixed
            // data — so seed == starting level index, matching reset(seed)'s semantics).
            const pin = seedFromQuery()
            loadLevel(pin != null ? pin : 0, true)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const selectSkill = (s) => {
            if (screenRef.current !== 'play' || pausedRef.current) return
            selected = s
            audioController.playTone(520 + SKILLS.indexOf(selected) * 90, 0.05, 'square', 0.05)
        }
        const togglePause = () => {
            if (screenRef.current !== 'play') return
            pausedRef.current = !pausedRef.current
            if (pausedRef.current) { ffHeld = false; ffId = null; abortGesture() }  // the panel unmounts while paused
            setPaused(pausedRef.current)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                togglePause()
                return
            }
            // #3879: M mutes/unmutes on every screen — it works while paused,
            // which is exactly when the player reaches for it.
            if (code === 'KeyM') { toggleMuted(); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current > 900) setMode('attract')
                return
            }
            if (pausedRef.current) return
            // #1637 WATCH: Y seats the solver at any live board it can still win;
            // if the oracle sees no path from here it declines honestly (no blip).
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (seatWatcher()) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (SKILL_KEY[e.code]) { selectSkill(SKILL_KEY[e.code]); return }
            if (e.code === 'Space' || e.code === 'KeyZ') { applySkill(cursor.x, cursor.y); return }
            keys.add(e.code)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => { keys.clear(); ffHeld = false; ffId = null; abortGesture() }
        // #432: the panel's taps, delegated into THIS closure — the panel is
        // static JSX (a render can't call effect-local handlers or read the
        // effect-local `selected`), so the buttons carry data attributes and
        // one window-level handler does the work.
        const panelBtn = (e) => e.target.closest && e.target.closest('[data-lem-panel] button')
        const onPanelDown = (e) => {
            const b = panelBtn(e)
            if (!b) return
            e.preventDefault()
            if (b.dataset.lemSkill) selectSkill(b.dataset.lemSkill)
            else if (b.dataset.lemPause) togglePause()
            else if (b.dataset.lemFf) { ffHeld = true; ffId = e.pointerId }
        }
        const onPanelEnd = (e) => {
            // Release by pointer id, not by release target: the finger may lift
            // off the button after sliding away, and 3× must not stick.
            if (e.pointerId === ffId) { ffHeld = false; ffId = null }
        }
        // #432: the finger points at the DISPLAYED (fit) canvas — the one the
        // player sees — and writes THE one pad's pointer (normalized 0..1). The
        // shared gesture in the loop does the press / slide / release.
        const stagePoint = (e) => {
            const el = fit.display || canvas
            const r = el.getBoundingClientRect()
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
        }
        const onMove = (e) => {
            if (screenRef.current !== 'play' || pressId !== null) return
            const p = stagePoint(e)
            if (!p) return
            cursor.x = Math.max(0.5, Math.min(W - 0.5, p.x * W))
            cursor.y = Math.max(2, Math.min(H - 1, p.y * H))
        }
        const onStageDown = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() } // #1637 a thumb on the hill takes the wheel
            if (e.target.closest && e.target.closest('[data-lem-panel]')) return   // the panel owns its taps
            const p = stagePoint(e)
            if (!p) return
            pressId = e.pointerId
            setPointer(p.x, p.y, true)
        }
        const onStageMove = (e) => {
            if (e.pointerId !== pressId) return
            const p = stagePoint(e)
            if (p) setPointer(p.x, p.y, true)
        }
        const endPress = (e) => {
            if (e.pointerId !== pressId) return
            pressId = null
            setPointer(0, 0, false)
        }
        // #3879: honour the persisted choice before the first note — setMuted
        // is safe with no AudioContext yet (it only sets the flag; init picks
        // the bus up muted). Read storage directly, not the render's state.
        try { if (localStorage.getItem('lemmings.muted') === '1') { mutedRef.current = true; audioController.setMuted(true) } } catch { /* private mode: start audible */ }

        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onStageDown)
        window.addEventListener('pointerdown', onPanelDown)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointermove', onStageMove)
        window.addEventListener('pointerup', endPress)
        window.addEventListener('pointercancel', endPress)
        window.addEventListener('pointerup', onPanelEnd)
        window.addEventListener('pointercancel', onPanelEnd)

        // #432/#1748: the rotate prompt is the shared RotateHint chrome (#1147) —
        // its card sits dead-center and the game's own duplicate banner stacked
        // right over its dismiss button, so the banner is gone.

        raf = requestAnimationFrame(frame)

        // ---------- DEV hook: read-only probe + solver hint ----------
        if (import.meta.env.DEV) {
            window.__lemTest = {
                probe: () => ({
                    screen: screenRef.current, t: gs.t, tick: gs.tick, level: levelIdx, name: meta.name,
                    cursor: { ...cursor }, selected,
                    aim: gest.aim ? { id: gest.aim.id, skill: selected } : null,
                    skills: { ...gs.skills },
                    spawned: gs.spawned, exited: gs.exited, dead: gs.dead, drowned: gs.drowned, need: meta.need,
                    end: gs.end, win: gs.win, score: gs.score, hash: stateHash(gs),
                    cmds: runCmds.length, gcmds: gs.cmds.length, board: board(), // #1637 gcmds = solver-line assignments too
                    lemmings: gs.lemmings.map(L => ({ id: L.id, x: L.x, y: L.y, state: L.state, dir: L.dir, climber: L.climber, digger: L.digger, floater: L.floater, builder: L.builder, flash: L.flashT, live: L.live })),
                    planks: (() => { let n = 0; for (let i = 0; i < gs.grid.length; i++) if (gs.grid[i] === PLANK) n++; return n })(),   // #3863 wood on the board
                }),
                // The next move the PROVEN solver makes at this point in the
                // replay — as the live position of that live lemming. Read-only:
                // the driver still has to aim and press with real inputs.
                hint: () => {
                    const c = plan.find(cc => cc.tick >= gs.tick)
                    if (!c) return null
                    const L = gs.lemmings.find(l => l.id === c.id)
                    if (!L || !L.live) return null
                    return { x: L.x, y: L.y, skill: c.skill, id: L.id, inPlan: true }
                },
                start: startPlay,
                watching: () => watchingRef.current, // #1637 WATCH probes
                watchSfx: watchSfxLog,
                give: (skill, n = 1) => { gs.skills[skill] += n; return gs.skills[skill] },
                teleport: (id) => {
                    const L = gs.lemmings.find(l => l.id === id && l.live)
                    if (!L) return false
                    L.x = meta.exit.x; L.y = meta.exit.y - 1; L.vy = 0; L.state = 'fall'; L.fallDist = 0
                    return true
                },
                kill: (id) => {
                    const L = gs.lemmings.find(l => l.id === id && l.live)
                    if (!L) return false
                    L.live = false; L.state = 'dead'; gs.dead++
                    return true
                },
                // #3863: stamps wood on the board (renderer-proof hook, the same
                // DEV-cheat family as teleport/kill — the mechanics themselves are
                // pinned honestly in lemcheck's BUILDER section).
                stamp: (x, y) => {
                    if (x < 0 || x >= W || y < 0 || y >= H) return false
                    gs.grid[y * W + x] = PLANK
                    return true
                },
                cries: () => cries.map(c => ({ x: c.x, y: c.y, t: c.t })),   // #3844 OH NO! sprites live on screen
                // #3879: wood cells (for the slope-nose pixel probes) and the
                // live splinter buffer, same DEV-cheat family as stamp/kill.
                woods: () => { const out = []; for (let i = 0; i < W * H; i++) if (gs.grid[i] === PLANK) out.push([i % W, (i - (i % W)) / W]); return out },
                chipsN: () => chips.length,
                squashIds: () => Object.keys(squash).map(Number),
                // #3879: the harness hears the bed through the shared
                // verification hook (the __popTest.musicState precedent).
                musicState: () => audioController._musicState(),
                muteState: () => ({ game: mutedRef.current, global: audioController.muted }),
            }
            exposeGame({
                id: 'lemmings',
                method: 'pointer',
                reads: ['pointer'],
                buttons: [],
                reset: (seed) => {
                    loadLevel((seed >>> 0) % LEVELS.length, true)
                    keys.clear()
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    // #432 pointer: the scripted pad IS the finger — the same
                    // shared press-preview-release gesture the touch path runs,
                    // so a tap (down this tick, up the next) previews, then assigns.
                    stepGesture(pad.pointer)
                    const wm = woodMask()       // #3879 same before-the-step wood mask as doSim
                    handleEvents(step(gs, { x: cursor.x, y: cursor.y }).events, wm)
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: !!gs.end,
                    seed: levelIdx, level: meta.name, exited: gs.exited, dead: gs.dead, spawned: gs.spawned,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
            })

            // F1 surgery panel: live state + the question Jon asked the
            // hard way: "can this level STILL be won from exactly here?"
            // Clones the live game (terrain damage included) and asks the
            // real solver. Solver-no means "no path the oracle can see",
            // which for a human is already bad news worth showing.
            mountDbg({
                title: 'LEMMINGS',
                getState: () => {
                    if (!gs) return ['(no level mounted yet)']
                    const rows = [
                        `need ${gs.exited}/${meta.need}  dead ${gs.dead}  live ${gs.lemmings.filter(l => l.live).length}  spawn ${gs.spawned}/${meta.spawnCount}`,
                        `stock blk${gs.skills.block} bmb${gs.skills.bomb} clm${gs.skills.climb} dig${gs.skills.dig} flt${gs.skills.float} bld${gs.skills.build}  tick ${gs.tick}  end ${gs.end || '-'}`,
                    ]
                    for (const L of gs.lemmings.filter(l => l.live).slice(0, 10)) {
                        rows.push(`#${L.id} ${L.state}${L.climber ? 'C' : ''}${L.digger ? 'D' : ''}${L.builder ? 'B' : ''} (${L.x.toFixed(1)},${L.y.toFixed(0)})`)
                    }
                    return rows
                },
                actions: [
                    { label: 'PROGNOSIS', run: () => {
                        if (!gs) return 'no level'
                        const g2 = makeGame(meta, gs.grid)
                        Object.assign(g2, {
                            tick: gs.tick, t: gs.t, exited: gs.exited, dead: gs.dead,
                            spawned: gs.spawned, skills: { ...gs.skills },
                        })
                        g2.lemmings = structuredClone(gs.lemmings)
                        const r = solve(g2)
                        return r.win ? `win path exists (${r.exited}/${meta.need})` : `NO PATH — can save only ${r.exited}/${meta.need}`
                    } },
                    { label: '+BLOCKER', run: () => { gs.skills.block++ } },
                    { label: '+BOMBER', run: () => { gs.skills.bomb++ } },
                    { label: '+CLIMBER', run: () => { gs.skills.climb++ } },
                    { label: '+DIGGER', run: () => { gs.skills.dig++ } },
                    { label: '+FLOATER', run: () => { gs.skills.float++ } },
                    { label: '+BUILDER CARGO', run: () => { gs.skills.build += 12 } },
                    { label: 'KILL A CLIMBER', run: () => {
                        const L = gs.lemmings.find(l => l.live && (l.climber || l.state === 'climb')) || gs.lemmings.find(l => l.live)
                        if (!L) return 'none live'
                        L.live = false; L.state = 'dead'; gs.dead++
                        return `#${L.id}`
                    } },
                    { label: 'TELEPORT #0 OUT', run: () => window.__lemTest.teleport(0) ? 'sent' : 'no live #0' },
                ],
            })
        }

        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: !!gs.end, seed: levelIdx, level: meta.name }))

        return () => {
            unexposeFeedbackState()
            audioController.stopMusic() // #3879: the bed belongs to this title only
            audioController.setMuted(false) // …and so does its mute — leave no silence behind
            if (import.meta.env.DEV && window.__lemTest) delete window.__lemTest
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onStageDown)
            window.removeEventListener('pointerdown', onPanelDown)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointermove', onStageMove)
            window.removeEventListener('pointerup', endPress)
            window.removeEventListener('pointercancel', endPress)
            window.removeEventListener('pointerup', onPanelEnd)
            window.removeEventListener('pointercancel', onPanelEnd)
            fit.destroy()
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode, toggleMuted])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            {/* #422 item 3 / #3132: the skill panel is DOCKED, not floated — but
                at the TOP edge now: the bottom edge is the VirtualControls pad
                zone (SSX #894 law), so the stage reserves its height up top and
                the bar never fights the pad for the same pixels. */}
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center"
                style={{ top: play ? LAYOUT.panelReserve : 0 }} />

            {/* #1637 WATCH — Y seats sim.js's solver; any input takes over.
                The pill docks ABOVE the skill panel + pad band (the panel owns
                the bottom edge here), still riding the safe-area insets. */}
            {play && watching && <WatchToast className="absolute z-50" />}
            {play && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ bottom: 'calc(12rem + var(--sab, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-20 left-3 right-3 flex items-center gap-3 text-amber-50 font-mono text-xs">
                    <span id="lem-lvl" ref={setHud('lvl')} className="font-bold tracking-widest text-sm" />
                    <div className="w-28 h-2.5 bg-black/50 rounded overflow-hidden border border-black/50">
                        <div ref={setHud('time')} className="h-full" style={{ background: 'linear-gradient(90deg,#ffd83d,#e23b3b)', width: '100%' }} />
                    </div>
                    <span>OUT <span ref={setHud('out')} className="font-bold text-green-300" /></span>
                    <span className="opacity-80" ref={setHud('left')} />
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>00000</span>
                    </span>
                </div>
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
                    <div className="absolute z-[70] left-1/2 -translate-x-1/2 pointer-events-auto" style={{ bottom: '24%' }}>
                        <AttractWatchButton />
                    </div>
                    <div className="absolute inset-x-0 top-8 text-center pointer-events-none">
                        <h1 className="text-5xl font-black text-green-300" style={{ textShadow: '0 4px 0 #1d4a1d, 0 10px 24px #000' }}>LEMMINGS-LITE</h1>
                        <p className="text-white font-mono font-bold mt-8 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-amber-100/90 mt-2 px-8" messages={MESSAGES} />
                        <span className="block mt-2 text-green-200/80 font-mono font-bold tracking-wider">{WATCH_ATTRACT_HINT}</span>
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.out}/{end.need} saved{end.last ? ' · ALL LEDGES CROSSED' : ''}</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-green-300 font-bold mb-1 tracking-widest">SURVIVOR LEDGER</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.level}</span><span>{r.out} out · {r.score}</span><span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'LEMMINGS-LITE')} onResume={handleResume} mute={{ on: muted, toggle: toggleMuted }} />}
            <VirtualControls visible={play && !paused} />

            {/* #432 / #3132: the original's skill panel — counts + PAUSE/FF —
                docks at the TOP edge: the bottom edge is the VirtualControls pad
                zone, and `full` (#3118 grant) would bury every skill button under
                the clusters. Static markup: the effect delegates the taps (the
                handlers live in the loop's closure) and paints the selection
                highlight on the button. */}
            {play && !paused && (
                <div
                    data-lem-panel
                    className="absolute left-0 right-0 z-50 flex items-start justify-center gap-1.5 px-2 pointer-events-auto font-mono"
                    style={{ top: 'calc(0.5rem + env(safe-area-inset-top))' }}
                >
                    {SKILLS.map((s) => (
                        <button
                            key={s}
                            data-lem-skill={s}
                            className="bg-black/60 border border-amber-200/30 rounded px-2 py-1 text-center leading-tight select-none"
                        >
                            <div className="text-[10px] text-amber-100/80 whitespace-nowrap">{SKILL_NAME[s]}</div>
                            <div ref={setHud('sk_' + s)} className="text-base font-bold text-amber-50" />
                        </button>
                    ))}
                    <button
                        data-lem-pause="1"
                        className="bg-black/60 border border-amber-200/30 rounded px-2.5 py-1 text-[11px] font-bold text-amber-50 leading-tight select-none"
                    >
                        PAUSE
                    </button>
                    <button
                        data-lem-ff="1"
                        className="bg-black/60 border border-amber-200/30 rounded px-2.5 py-1 text-[11px] font-bold text-amber-50 leading-tight select-none"
                    >
                        FF
                    </button>
                </div>
            )}

        </div>
    )
}

export default LemGame

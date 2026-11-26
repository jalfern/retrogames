// BOULDER DASH — the arcade shell: renderer, input, HUD. It decides NOTHING
// about the game: `sim.js` does, in a module plain Node imports, and
// `scripts/dashcheck.mjs` proves every cave winnable before this file is ever
// opened. The attract demo is literally a REPLAY of the planner's own proven
// route (dashcheck asserts that replay is deterministic and wins).
//
// Input is arrows (the pad's D-pad) — one cell per tap, a held key auto-steps.
// The CA ticks at CFG.caHz (a classic Boulder Dash pace), NOT 60/s, so the
// single-player arcade rhythm is the grid, not the frame rate.
//
// Layout: 1. plan cache 2. canvas art (all runtime, no assets) 3. fixed-
// timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { GAMES } from '../../config/games'
import { PRESS, MESSAGES } from './attract.js'
import { audioController } from '../../utils/AudioController'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { LEVELS, buildLevel } from './levels.js'
import { makeGame, planRun, planStep, step, playerMove, stateHash, CFG, W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, FIRE, AMO_HEAD, AMO_BODY, PUSHWALL } from './sim.js'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'

const TS = 16
const CW = W * TS
const CH = H * TS
const CA_MS = 1000 / CFG.caHz
const MOVE_STEP = 3                       // CA ticks between held-key auto-steps
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

const planCache = new Map()
const planFor = (idx) => {
    if (!planCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        planCache.set(idx, planRun(makeGame(meta, grid)).cmds)
    }
    return planCache.get(idx)
}

const speck = (x, y) => ((x * 7349 + y * 8453 + x * y * 31) % 11) / 11

const DashGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const [watching, setWatching] = useState(false) // #1637 WATCH: mirrors the seat flag for the chrome
    const watchingRef = useRef(false)

    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('boulderdash.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.dashStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let levelIdx = 0
        let contractSeed = 0
        let meta = null, grid = null, gs = null
        let plan = [], raf = 0, last = 0, acc = 0
        let runMoves = 0
        let lastMoveTick = -99
        const held = []                                   // ordered held arrow codes
        // #2374 polish (renderer only — the sim never sees any of this):
        // dustSet marks the seam cells for the readability tint; trail holds
        // cellIndex -> strength for the fly's fading comet; alarmed fires the
        // distant chirp once per level when the fly first enters the corridor.
        let dustSet = new Set()
        // #2417 polish (renderer/audio only — sim untouched): lidSet tints the
        // pocket-lid cells green, boltDir gives each pushwall the way it gives
        // (painted as an arrow), amoBorn remembers the tick each slime head
        // spawned so it can flash on that generation (fed by 'amoeba' events).
        let lidSet = new Set()
        const boltDir = new Map()
        const amoBorn = new Map()
        const TRAIL_LIFE = 10
        const trail = new Map()
        let alarmed = false
        // #2438 polish (renderer/audio only — sim untouched): the amoeba FAMILY
        // finally reads per variant. turnFlash marks amoTurn corner cells for a
        // strong one-shot; forkBlip marks fork points where a new finger is born;
        // trailB is the butterfly's COOLER comet (the amber comet belongs to the
        // firefly); visePairs holds the closing corridor cells the telegraph
        // shades, recomputed each CA tick; the counters are DEV-probe receipts.
        const turnFlash = new Map()
        const forkFlash = new Map()
        const trailB = new Map()
        let visePairs = []          // [ [y, xFrom, xTo, alpha], … ] air between two wave fronts
        let viseHot = false
        let lastTurnSfx = -99, lastDropSfx = -99, lastForkSfx = -99, lastFlapSfx = -99, lastDroneSfx = -99
        let turnSeen = 0, forkSeen = 0, dropHeard = 0, flapHeard = 0, dronesHeard = 0, ferrySeen = 0, doneSeen = 0
        let slideSeen = 0   // #2468 receipts: the rumbled ticks of a wall walking its lane
        // #3599 art pass (renderer only — sim untouched): the digger gets era
        // motion. Legs pedal ONLY while actually moving (they used to cycle on
        // raw tick, pedalling on air while standing still), the body faces the
        // way you went, and a pick arm swings when a dig event fires.
        let pPrev = { x: -1, y: -1 }   // player cell at the last CA tick
        let pFace = 1                  // 1 right, -1 left
        let pMoveUntil = -1           // gs.tick until which the step cycle runs
        let pDigUntil = -1            // gs.tick until which the pick is swung
        let tubesSet = new Set()
        let pillarSet = new Set()

        const loadLevel = (idx, freshScore) => {
            levelIdx = idx % LEVELS.length
            const built = buildLevel(levelIdx)
            meta = built.meta; grid = built.grid
            gs = makeGame(meta, grid)
            if (freshScore) gs.score = 0
            plan = planFor(levelIdx)
            runMoves = 0; lastMoveTick = -99
            held.length = 0
            dustSet = new Set((meta.dust || []).map(([x, y]) => y * W + x))
            lidSet = new Set((meta.lids || []).map(([x, y]) => y * W + x))
            boltDir.clear(); (meta.bolts || []).forEach(([x, y, d]) => boltDir.set(y * W + x, d))
            amoBorn.clear()
            trail.clear(); alarmed = false
            pPrev = { x: -1, y: -1 }; pFace = 1; pMoveUntil = -1; pDigUntil = -1   // #3599: fresh cave, fresh digger
            turnFlash.clear(); forkFlash.clear(); trailB.clear()
            visePairs = []; viseHot = false
            lastTurnSfx = lastDropSfx = lastForkSfx = lastFlapSfx = lastDroneSfx = -99
            turnSeen = forkSeen = dropHeard = flapHeard = dronesHeard = ferrySeen = doneSeen = 0
            tubesSet = new Set((meta.tubes || []).map(([x, y]) => y * W + x))
            pillarSet = new Set((meta.pillar || []).map(([x, y]) => y * W + x))
        }
        loadLevel(0, true)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'gem') { audioController.playSweep(880, 1760, 0.14, 'square', 0.08); audioController.playTone(2093, 0.08, 'square', 0.04) }
                else if (e.type === 'dig') audioController.playNoise(0.05, 0.04)
                else if (e.type === 'fell') audioController.playTone(150, 0.05, 'triangle', 0.04)
                else if (e.type === 'gemlost') audioController.playSweep(500, 200, 0.2, 'sawtooth', 0.07)
                else if (e.type === 'ignite' || e.type === 'spread') audioController.playNoise(0.08, 0.06)
                // #2417 vault audio: push/crush used to share fell/dig's range.
                // A bolt now sounds like a BOLT — a sub-bass thud below every
                // rock noise plus a short metallic ring nothing else owns.
                else if (e.type === 'push') { audioController.playTone(55, 0.07, 'triangle', 0.05); audioController.playTone(1245, 0.05, 'square', 0.018); audioController.playNoise(0.03, 0.02) }
                // #2468: a sliding wall RUMBLES — a low stone grind distinct from
                // the shove's thunk, so the player can hear their bolt walking
                // away down the corridor they cannot yet see.
                else if (e.type === 'slide') { slideSeen++; audioController.playTone(41, 0.06, 'sawtooth', 0.035); audioController.playNoise(0.05, 0.025) }
                else if (e.type === 'crush') { audioController.playNoise(0.1, 0.08); audioController.playTone(46, 0.12, 'triangle', 0.07); audioController.playTone(980, 0.09, 'square', 0.022) }
                else if (e.type === 'amoeba') {
                    audioController.playTone(170 + ((e.x * 7 + e.y * 13) % 60), 0.03, 'sine', 0.022)
                    amoBorn.set(e.y * W + e.x, gs.tick)   // painter: flash fresh heads (#2417)
                }
                // #2438 family tells. The sim already emits these receipts; the
                // painter/audio surface them so the CREATURES read apart, not just
                // the hashes. Each carries its wave, so the flashes land exactly on
                // the fresh cells the pass grew (amoGen === amoPass marks them).
                else if (e.type === 'amoTurn') {
                    turnSeen++
                    const flashFresh = () => {
                        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                            const j = (e.y + dy) * W + (e.x + dx)
                            if (gs.grid[j] === AMO_HEAD && gs.amoWave[j] === e.w && gs.amoGen[j] === gs.amoPass) turnFlash.set(j, gs.tick)
                        }
                        turnFlash.set(e.y * W + e.x, gs.tick)
                    }
                    flashFresh()
                    if (gs.tick - lastTurnSfx >= 4) {       // chains of corners glide, never machine-gun
                        lastTurnSfx = gs.tick
                        audioController.playSweep(300, 430, 0.07, 'triangle', 0.035)
                    }
                }
                else if (e.type === 'amoDrop') {
                    if (gs.tick - lastDropSfx >= 8) {       // the FIRST pour of a shaft-run thunks
                        lastDropSfx = gs.tick
                        dropHeard++
                        audioController.playTone(70, 0.09, 'triangle', 0.06)
                        audioController.playNoise(0.04, 0.03)
                    }
                }
                else if (e.type === 'amoFork') {
                    forkSeen++
                    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                        const j = (e.y + dy) * W + (e.x + dx)
                        if (gs.grid[j] === AMO_HEAD && gs.amoWave[j] === e.w && gs.amoGen[j] === gs.amoPass) forkFlash.set(j, gs.tick)
                    }
                    if (gs.tick - lastForkSfx >= 4) {       // a new finger being born gets a blip
                        lastForkSfx = gs.tick
                        audioController.playSweep(520, 780, 0.09, 'sine', 0.03)
                    }
                }
                else if (e.type === 'drift') {
                    if (gs.tick - lastFlapSfx >= 5) {       // the butterfly's wingbeat, quieter than any firefly cue
                        lastFlapSfx = gs.tick
                        flapHeard++
                        audioController.playTone(640 + 70 * (e.dir | 0), 0.025, 'sine', 0.02)
                        audioController.playTone(880 + 70 * (e.dir | 0), 0.03, 'sine', 0.015)
                    }
                }
                else if (e.type === 'grab') {         // #2463: the transport takes a gem — a bright pickup pluck
                    ferrySeen++
                    audioController.playSweep(700, 1100, 0.08, 'triangle', 0.04)
                }
                else if (e.type === 'ferryDrop') {    // cargo lands: a heavy, welcome thunk
                    audioController.playSweep(500, 180, 0.12, 'triangle', 0.05)
                    audioController.playTone(980, 0.06, 'sine', 0.03)
                }
                else if (e.type === 'carryDone') {    // the burdened fly perishes at the pad
                    doneSeen++
                    audioController.playSweep(320, 90, 0.22, 'sine', 0.03)
                }
                else if (e.type === 'dissolve') audioController.playSweep(1200, 300, 0.18, 'sawtooth', 0.05)
                else if (e.type === 'locked') audioController.playTone(160, 0.08, 'sawtooth', 0.06)
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'win') audioController.playFanfare()
                else if (e.type === 'time') audioController.playSweep(320, 80, 0.5, 'square', 0.09)
            }
        }

        const finish = () => {
            const won = gs.win
            const entry = { score: gs.score, gems: gs.have, level: meta.name, date: new Date().toISOString().slice(2, 10) }
            if (won || gs.score > 0) localStorage.setItem('boulderdash.board', JSON.stringify([...board(), entry].sort((a, b) => b.score - a.score).slice(0, 8)))
            // #2438: a flutter-named cause for the no-ignite critter — 'COOKED'
            // belongs to the firefly; the butterfly EATES you, it does not burn.
            const allFlutter = gs.flies.length > 0 && gs.flies.every((f) => f.ignites === 0)
            const causeNames = { boulder: 'BURIED', pushwall: 'FLATTENED', amoeba: 'ENGULFED', fire: 'INCINERATED', fly: allFlutter ? 'EATEN' : 'COOKED' }
            const cause = won ? (levelIdx >= LEVELS.length - 1 ? 'EVERY CAVE CRACKED' : 'CAVE CLEARED') : gs.end === 'time' ? 'THE CLOCK RAN OUT' : (causeNames[gs.deathCause] || 'BURIED')
            setEnd({ score: gs.score, gems: gs.have, need: meta.need, won, cause, last: won && levelIdx >= LEVELS.length - 1 })
            overAtRef.current = performance.now()
            // #1637 WATCH: the exit door (or the grave) ends the route — the
            // seat releases silently, like the racer's finish flag.
            if (watchingRef.current) { watchingRef.current = false; setWatching(false) }
            setMode('over')
        }

        const movePlayer = (dir) => {
            const before = gs.events.length
            const okd = playerMove(gs, dir)
            if (okd) runMoves++
            lastMoveTick = gs.tick
            // player events were appended to gs.events before step() clears them
            const got = gs.events.slice(before)
            for (const e of got) if (e.type === 'dig') pDigUntil = gs.tick + 2   // #3599: the arm answers the soil breaking
            handleEvents(got)
        }

        // #2374 juice, per CA tick: the fly drags a fading amber comet so its
        // patrol lane is telegraphed while the corridor still reads as dark rock,
        // and the first corridor entry of a level chirps a distant warning (the
        // seam flicker alone was easy to miss). Both watch only gs — the sim is
        // untouched. Attract runs them too, so the demo teaches the mechanic.
        const trailAndCue = () => {
            for (const [i, s] of trail) { if (s <= 1) trail.delete(i); else trail.set(i, s - 1) }
            for (const [i, s] of trailB) { if (s <= 1) trailB.delete(i); else trailB.set(i, s - 1) }
            // #3599: read the digger's step from real cell changes, not the clock.
            const pp = gs.player
            if (pp.x !== pPrev.x || pp.y !== pPrev.y) {
                if (pp.x !== pPrev.x && pPrev.x >= 0) pFace = pp.x > pPrev.x ? 1 : -1
                pMoveUntil = gs.tick + 2
                pPrev = { x: pp.x, y: pp.y }
            }
            for (const f of gs.flies) {
                if (f.drift && f.digs === 0) trailB.set(f.y * W + f.x, TRAIL_LIFE)   // #2438: the butterfly drags a cooler comet
                else trail.set(f.y * W + f.x, TRAIL_LIFE)
                if (!alarmed && f.y === 8 && f.x >= 17) {
                    alarmed = true
                    audioController.playSweep(1560, 1040, 0.16, 'square', 0.03)
                    audioController.playTone(780, 0.12, 'triangle', 0.03)
                }
            }
            // #2438 vise telegraph: while two wave FRONTS sit within 4 cells the
            // closing lane shades green before you stand in it, and one low
            // rising drone says "the vise is moving" (once per closing).
            const fronts = []
            for (let i = 0; i < gs.grid.length; i++) {
                if (gs.grid[i] === AMO_HEAD && gs.amoGen[i] === gs.amoPass) {
                    fronts.push({ i, w: gs.amoWave[i], x: i % W, y: (i - (i % W)) / W })
                }
            }
            const pairs = []
            let close = null
            for (let a = 0; a < fronts.length; a++) {
                for (let b = a + 1; b < fronts.length; b++) {
                    const p = fronts[a], q = fronts[b]
                    if (p.w === q.w) continue
                    if (p.y === q.y || p.x === q.x) {
                        const gap = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))
                        if (gap <= 8) pairs.push({
                            x1: Math.min(p.x, q.x), x2: Math.max(p.x, q.x),
                            y1: Math.min(p.y, q.y), y2: Math.max(p.y, q.y),
                            alpha: Math.min(0.22, 0.05 + (8 - gap) * 0.025),
                        })
                    }
                    if (!close && Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 4) close = [p, q]
                }
            }
            visePairs = pairs
            viseHot = !!close
            if (close && gs.tick - lastDroneSfx >= 24) {
                lastDroneSfx = gs.tick
                dronesHeard++
                audioController.playSweep(90, 150, 0.5, 'sawtooth', 0.03)
            }
        }

        const doSim = () => {
            if (screenRef.current === 'attract') {
                const c = plan.find(cc => cc.tick === gs.tick)
                if (c) playerMove(gs, c.dir)
                handleEvents(step(gs).events)
                if (gs.end) loadLevel((levelIdx + 1) % LEVELS.length, true)
            } else if (screenRef.current === 'play') {
                if (watchingRef.current && !gs.end) {
                    // #1637 WATCH: the prover digs — planStep is reactive against
                    // the live cave (honest from any position), one arrow every
                    // CFG.moveEvery CA ticks: the same script dashcheck wins
                    // every cave with.
                    if (gs.tick % CFG.moveEvery === 0) {
                        const d = planStep(gs)
                        if (d) movePlayer(d)
                    }
                } else {
                    const dir = held.length && ARROWS.includes(held[held.length - 1]) ? held[held.length - 1] : null
                    if (dir && gs.tick - lastMoveTick >= MOVE_STEP) movePlayer(dir)
                }
                const ev = step(gs).events
                handleEvents(ev)
                if (gs.end) finish()
            }
            if (gs) trailAndCue()
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else { acc += ft; while (acc >= CA_MS) { doSim(); acc -= CA_MS } }
            }
            paint()
            syncHud()
        }

        // ---------- painter ----------
        // #2417 contrast rim (the original outlines the amoeba): a dark 1px
        // border ONLY against non-amoeba neighbours — the wave reads as one
        // outlined creature, not a tile grid, at any corridor lighting.
        const amoebaOutline = (px, py, x, y) => {
            const am = (tt) => tt === AMO_HEAD || tt === AMO_BODY
            ctx.fillStyle = '#0b3a12'
            if (!am(gs.grid[(y - 1) * W + x])) ctx.fillRect(px, py, TS, 1)
            if (!am(gs.grid[(y + 1) * W + x])) ctx.fillRect(px, py + TS - 1, TS, 1)
            if (!am(gs.grid[y * W + x - 1])) ctx.fillRect(px, py, 1, TS)
            if (!am(gs.grid[y * W + x + 1])) ctx.fillRect(px + TS - 1, py, 1, TS)
        }

        const paint = () => {
            ctx.fillStyle = '#241a12'
            ctx.fillRect(0, 0, CW, CH)

            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === 0) continue
                    const px = x * TS, py = y * TS
                    if (t === DIRT) {
                        ctx.fillStyle = speck(x, y) > 0.5 ? '#9a5a28' : '#834a20'
                        ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#6d3c18'
                        ctx.fillRect(px + 2, py + 3, 2, 2); ctx.fillRect(px + 10, py + 9, 3, 2)
                        if (gs.grid[(y - 1) * W + x] === 0) { ctx.fillStyle = '#3f7d3a'; ctx.fillRect(px, py, TS, 2) }
                        // #2374 readability: the dust-seam cells carry a dry gold
                        // sparkle so the bored-open door reads before it ignites.
                        if (dustSet.has(y * W + x)) {
                            ctx.fillStyle = 'rgba(255,190,80,0.22)'; ctx.fillRect(px, py, TS, TS)
                            ctx.fillStyle = '#ffe08a'
                            ctx.fillRect(px + 3, py + 4, 2, 2); ctx.fillRect(px + 9, py + 2, 2, 2); ctx.fillRect(px + 11, py + 11, 2, 2)
                        }
                        // #2417 pocket telegraph: green grains seep through the
                        // lid cells — the slime below is honest foreshadowing,
                        // painted from meta.lids (dashcheck pins them to the lid).
                        if (lidSet.has(y * W + x)) {
                            ctx.fillStyle = 'rgba(96,224,96,0.15)'; ctx.fillRect(px, py, TS, TS)
                            ctx.fillStyle = '#6fbf5a'
                            ctx.fillRect(px + 4, py + 5, 2, 2); ctx.fillRect(px + 10, py + 9, 2, 2); ctx.fillRect(px + 7, py + 12, 2, 1)
                        }
                        // #2438: the tube mouth below the harvest lane carries a
                        // cool teal seam so the climb route reads before it's dug;
                        // the fork pillar carries warm stone grain — "wrap me".
                        if (tubesSet.has(y * W + x)) {
                            ctx.fillStyle = 'rgba(120,220,255,0.2)'; ctx.fillRect(px, py, TS, TS)
                            ctx.fillStyle = '#bfeaff'
                            ctx.fillRect(px + 4, py + 3, 2, 2); ctx.fillRect(px + 10, py + 7, 2, 2); ctx.fillRect(px + 6, py + 12, 2, 2)
                        }
                        if (pillarSet.has(y * W + x)) {
                            ctx.fillStyle = 'rgba(200,170,120,0.18)'; ctx.fillRect(px, py, TS, TS)
                            ctx.fillStyle = '#c8aa78'
                            ctx.fillRect(px + 2, py + 4, 3, 2); ctx.fillRect(px + 9, py + 2, 2, 2); ctx.fillRect(px + 7, py + 10, 3, 2)
                        }
                    } else if (t === STEEL) {
                        ctx.fillStyle = '#5b6b7a'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#8595a4'; ctx.fillRect(px, py, TS, 3); ctx.fillRect(px, py, 3, TS)
                        ctx.fillStyle = '#3d4a57'; ctx.fillRect(px + 4, py + 4, 2, 2); ctx.fillRect(px + 10, py + 10, 2, 2)
                    } else if (t === BOULDER) {
                        ctx.fillStyle = '#6f7d8a'; ctx.beginPath(); ctx.arc(px + 8, py + 8, 7, 0, Math.PI * 2); ctx.fill()
                        ctx.fillStyle = '#8a99a6'; ctx.beginPath(); ctx.arc(px + 6, py + 6, 2, 0, Math.PI * 2); ctx.fill()
                    } else if (t === DIAMOND) {
                        ctx.fillStyle = '#3a5a6a'; ctx.fillRect(px, py, TS, TS)
                        const g = ctx; g.fillStyle = gs.tick % 20 < 10 ? '#7fe7ff' : '#bff6ff'
                        g.beginPath(); g.moveTo(px + 8, py + 2); g.lineTo(px + 13, py + 8); g.lineTo(px + 8, py + 14); g.lineTo(px + 3, py + 8); g.closePath(); g.fill()
                        g.fillStyle = '#ffffff'; g.fillRect(px + 7, py + 6, 2, 2)
                    } else if (t === FIRE) {
                        const f = gs.burn[y * W + x]
                        ctx.fillStyle = '#3a1206'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = f > CFG.burn * 0.6 ? '#ffd23f' : '#ff7a1a'
                        ctx.fillRect(px + 2, py + 4, 12, 10)
                        ctx.fillStyle = '#ffec9a'
                        ctx.fillRect(px + 5 + (gs.tick % 3), py + 6, 4, 5)
                    } else if (t === AMO_HEAD) {
                        // the wave front — a bright, wobbling green blob (BD II)
                        ctx.fillStyle = '#1f8f2c'; ctx.fillRect(px, py, TS, TS)
                        const wob = (gs.tick + x + y) % 3
                        ctx.fillStyle = '#66e04a'
                        ctx.beginPath(); ctx.arc(px + 8 + wob - 1, py + 8 + (wob === 1 ? 1 : -1), 6, 0, Math.PI * 2); ctx.fill()
                        ctx.fillStyle = '#b6ff8e'; ctx.fillRect(px + 5 + wob, py + 4, 3, 3)
                        // #2417 birth flash: a head the tick it spawns lights up
                        // pale-white for a few CA ticks — the wave's direction
                        // reads as motion, not just colour, in lit corridors too.
                        const born = amoBorn.get(y * W + x)
                        if (born !== undefined && gs.tick - born <= 3) {
                            ctx.fillStyle = 'rgba(235,255,205,0.55)'; ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2)
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 7, py + 7, 2, 2)
                        }
                        // #2438 per-variant HEAD tells — the family finally reads
                        // apart in a quiet cave (the sim stamps amoVar/amoHead;
                        // classic keeps its #2411 look untouched).
                        if (gs.amoExt) {
                            const v = gs.amoVar[y * W + x], k = gs.amoHead[y * W + x]
                            if (v === 1 && k >= 0) {        // two-phase: leading-edge notch on the heading side
                                ctx.fillStyle = '#0d4f16'
                                if (k === 0) { ctx.fillRect(px + TS - 3, py + 2, 3, TS - 4); ctx.fillStyle = '#a5f078'; ctx.fillRect(px + TS - 5, py + 7, 2, 2) }
                                else if (k === 2) { ctx.fillRect(px, py + 2, 3, TS - 4); ctx.fillStyle = '#a5f078'; ctx.fillRect(px + 3, py + 7, 2, 2) }
                                else if (k === 1) { ctx.fillRect(px + 2, py + TS - 3, TS - 4, 3); ctx.fillStyle = '#a5f078'; ctx.fillRect(px + 7, py + TS - 5, 2, 2) }
                                else { ctx.fillRect(px + 2, py, TS - 4, 3); ctx.fillStyle = '#a5f078'; ctx.fillRect(px + 7, py + 3, 2, 2) }
                            } else if (v === 2) {            // dropper: drip shading at its base — down is its offer
                                ctx.fillStyle = '#0d4f16'
                                ctx.fillRect(px + 3, py + TS - 4, 3, 4); ctx.fillRect(px + 10, py + TS - 3, 3, 3)
                                ctx.fillStyle = '#8ee06a'; ctx.fillRect(px + 2, py + TS - 2, TS - 4, 1)
                            } else if (v === 3) {            // fork: a pale cross node — this head can plant fingers
                                ctx.fillStyle = '#d9ffae'
                                ctx.fillRect(px + 7, py + 3, 2, TS - 6); ctx.fillRect(px + 3, py + 7, TS - 6, 2)
                            }
                        }
                        const tf = turnFlash.get(y * W + x)
                        if (tf !== undefined && gs.tick - tf <= 4) {   // corner one-shot: legible at a glance on a phone
                            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2
                            ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4)
                        }
                        const ff = forkFlash.get(y * W + x)
                        if (ff !== undefined && gs.tick - ff <= 4) {   // a finger just being born
                            ctx.fillStyle = 'rgba(210,255,170,0.6)'
                            ctx.fillRect(px + 4, py + 4, TS - 8, TS - 8)
                        }
                        amoebaOutline(px, py, x, y)
                    } else if (t === AMO_BODY) {
                        ctx.fillStyle = '#187024'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#2ea83e'
                        ctx.fillRect(px + 2, py + 3, 4, 4); ctx.fillRect(px + 9, py + 8, 4, 4)
                        ctx.fillStyle = '#0f4c18'; ctx.fillRect(px + 8, py + 2, 3, 3); ctx.fillRect(px + 3, py + 11, 3, 2)
                        amoebaOutline(px, py, x, y)
                    } else if (t === PUSHWALL) {
                        // a brick bolt: warm iron banding + rivets, unmistakable
                        // against cold steel and brown dirt at a glance.
                        ctx.fillStyle = '#8a5a26'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#b07c38'; ctx.fillRect(px, py, TS, 3); ctx.fillRect(px, py, 3, TS)
                        ctx.fillStyle = '#5c3a14'; ctx.fillRect(px + 2, py + 8, TS - 4, 2); ctx.fillRect(px + 8, py + 2, 2, 6)
                        ctx.fillStyle = '#e0b06a'; ctx.fillRect(px + 3, py + 3, 2, 2); ctx.fillRect(px + 11, py + 3, 2, 2); ctx.fillRect(px + 3, py + 11, 2, 2); ctx.fillRect(px + 11, py + 11, 2, 2)
                        // #2417 direction cue: an embossed arrow on the side the
                        // bolt gives (meta.bolts tells the truth; dashcheck pins
                        // the marks to the grid, so the hint can never lie).
                        const bd = boltDir.get(y * W + x)
                        if (bd === 'E' || bd === 'W') {
                            const m = (a) => (bd === 'E' ? a : TS - a)   // mirror around the cell centre
                            ctx.fillStyle = '#3a2208'
                            ctx.beginPath(); ctx.moveTo(px + m(10), py + 3); ctx.lineTo(px + m(15), py + 8); ctx.lineTo(px + m(10), py + 13); ctx.closePath(); ctx.fill()
                            ctx.fillRect(px + Math.min(m(10), m(4)), py + 7, 7, 2)
                            ctx.fillStyle = '#f0c884'
                            ctx.fillRect(px + m(12), py + 7, 1, 2)        // highlight step on the arrowhead
                        }
                    }
                }
            }

            // #2438 vise telegraph: shade the AIR between two closing fronts —
            // a lane the vise is eating is a lane you must not stand in, and it
            // reads before you commit to it. Alpha rises as the gap narrows.
            for (const p of visePairs) {
                ctx.fillStyle = `rgba(96,224,96,${p.alpha.toFixed(3)})`
                for (let yy = p.y1; yy <= p.y2; yy++) {
                    for (let xx = p.x1 + 1; xx <= p.x2 - 1; xx++) {
                        if (gs.grid[yy * W + xx] === EMPTY) ctx.fillRect(xx * TS + 2, yy * TS + 2, TS - 4, TS - 4)
                    }
                }
            }

            // #2374 trail: the fly's last TRAIL_LIFE cells as a fading amber
            // comet — the patrol lane becomes readable motion, not just a sprite.
            for (const [i, s] of trail) {
                const tx = (i % W) * TS, ty = ((i - (i % W)) / W) * TS
                ctx.fillStyle = `rgba(255,214,110,${Math.min(0.3, s * 0.035).toFixed(3)})`
                ctx.fillRect(tx + 3, ty + 3, TS - 6, TS - 6)
            }
            // #2438: the butterfly's comet is COOLER than the firefly's — a
            // player learns "flaps, does not burn" from the trail colour alone.
            for (const [i, s] of trailB) {
                const tx = (i % W) * TS, ty = ((i - (i % W)) / W) * TS
                ctx.fillStyle = `rgba(150,225,255,${Math.min(0.28, s * 0.032).toFixed(3)})`
                ctx.fillRect(tx + 4, ty + 4, TS - 8, TS - 8)
            }

            // exit door + spawn marker. #2875: a NEWcomer dug straight past the
            // open door — only the tiny HUD word turned green. When the quota is
            // met the door now FLASHES on the CA's own beat (8-tick period) and
            // wears a one-cell halo, so it reads from across the cave. Attract
            // paints through the same block, so the demo teaches the door too.
            const ex = meta.exit.x * TS, ey = meta.exit.y * TS
            const open = gs.have >= meta.need
            if (open) {
                const pulse = gs.tick % 8 < 4
                ctx.fillStyle = pulse ? 'rgba(89,224,94,0.5)' : 'rgba(89,224,94,0.26)'
                ctx.fillRect(ex - TS + 4, ey - TS + 4, TS * 3 - 8, TS * 3 - 8)
                ctx.fillStyle = pulse ? '#59e05e' : '#2c5f2e'
                ctx.fillRect(ex + 2, ey + 1, TS - 4, TS - 2)
                ctx.fillStyle = pulse ? '#1d3a1d' : '#a6ffab'
                ctx.beginPath(); ctx.arc(ex + TS - 5, ey + 8, 1.6, 0, Math.PI * 2); ctx.fill()
            } else {
                ctx.fillStyle = '#3a2a1a'; ctx.fillRect(ex + 2, ey + 1, TS - 4, TS - 2)
                ctx.fillStyle = '#7a6a4a'
                ctx.beginPath(); ctx.arc(ex + TS - 5, ey + 8, 1.6, 0, Math.PI * 2); ctx.fill()
            }

            // the flies — a bright dart trailing its glow. #2438: the butterfly
            // reads APART from the firefly — ice-blue body, a wing pair that
            // beats on a 2-frame phase, no ember nose (it does not burn).
            for (const f of gs.flies) {
                const fx = f.x * TS, fy = f.y * TS
                if (f.drift && f.digs === 0) {
                    const spread = gs.tick % 2 ? 6 : 3
                    ctx.fillStyle = 'rgba(160,230,255,0.3)'; ctx.fillRect(fx - 2, fy - 2, TS + 4, TS + 4)
                    ctx.fillStyle = '#cfeeff'                       // wings (N-S spread, flapping)
                    ctx.beginPath(); ctx.moveTo(fx + 8, fy + 8); ctx.lineTo(fx + 8 - spread, fy + 8 - spread); ctx.lineTo(fx + 8 + spread, fy + 8 - spread); ctx.closePath(); ctx.fill()
                    ctx.beginPath(); ctx.moveTo(fx + 8, fy + 8); ctx.lineTo(fx + 8 - spread, fy + 8 + spread); ctx.lineTo(fx + 8 + spread, fy + 8 + spread); ctx.closePath(); ctx.fill()
                    ctx.fillStyle = '#7fd4f0'; ctx.beginPath(); ctx.arc(fx + 8, fy + 8, 3, 0, Math.PI * 2); ctx.fill()
                } else {
                    ctx.fillStyle = 'rgba(255,240,120,0.35)'; ctx.fillRect(fx - 2, fy - 2, TS + 4, TS + 4)
                    ctx.fillStyle = '#fff27a'; ctx.beginPath(); ctx.arc(fx + 8, fy + 8, 4, 0, Math.PI * 2); ctx.fill()
                    ctx.fillStyle = '#ff8a00'; ctx.fillRect(fx + (f.dir === 1 ? 11 : 2), fy + 7, 3, 2)
                }
                // #2463: a burdened transport visibly carries — a diamond clutched
                // under the body. The load is the mechanic; the player must see it.
                if (f.carry) {
                    ctx.fillStyle = '#bffcff'
                    ctx.beginPath(); ctx.moveTo(fx + 8, fy + 11); ctx.lineTo(fx + 5.5, fy + 13.5); ctx.lineTo(fx + 8, fy + 16); ctx.lineTo(fx + 10.5, fy + 13.5); ctx.closePath(); ctx.fill()
                    ctx.fillStyle = '#4aa8d8'; ctx.fillRect(fx + 7, fy + 12.5, 2, 2)
                }
            }

            // the digger — #3599 art pass: a 1984 miner, not a colour stack.
            // Shaded overalls with straps, a face that looks where you walk, a
            // pick that swings when soil breaks, and a two-frame step earned by
            // real cell changes — feet stay planted when the cave holds still.
            const p = gs.player
            if (p.alive) {
                const px = p.x * TS, py = p.y * TS
                const f = pFace
                const moving = gs.tick <= pMoveUntil
                const swinging = gs.tick <= pDigUntil
                ctx.fillStyle = '#8a5c1a'; ctx.fillRect(px + 3, py + 1, 10, 2)             // brim
                ctx.fillStyle = '#d99b35'; ctx.fillRect(px + 4, py, 8, 2)                  // crown
                ctx.fillStyle = '#ffd9a0'; ctx.fillRect(px + 4, py + 2, 8, 5)              // head
                ctx.fillStyle = '#3a2a1a'; ctx.fillRect(px + (f > 0 ? 9 : 6), py + 4, 1, 1)   // eye
                ctx.fillStyle = '#d8c08a'; ctx.fillRect(px + 3, py + 7, 10, 2)            // shirt
                ctx.fillStyle = '#2a5f9e'; ctx.fillRect(px + 4, py + 8, 8, 5)             // overalls
                ctx.fillStyle = f > 0 ? '#1d4573' : '#3d7ac2'                              // far side shade, near side light
                ctx.fillRect(px + (f > 0 ? 4 : 11), py + 8, 1, 5)
                ctx.fillStyle = '#2a5f9e'; ctx.fillRect(px + 5, py + 7, 1, 1); ctx.fillRect(px + 10, py + 7, 1, 1)  // straps
                const ax = px + (f > 0 ? 12 : 3)                                           // arm column
                ctx.fillStyle = '#ffd9a0'
                if (swinging) {
                    const up = gs.tick % 2 === 0
                    ctx.fillRect(ax, py + (up ? 6 : 8), 2, 3)                             // arm up / strike
                    ctx.fillStyle = '#8a5c1a'; ctx.fillRect(ax + (f > 0 ? 1 : -1), py + (up ? 3 : 5), 1, 4)   // handle
                    ctx.fillStyle = '#9aa7b2'; ctx.fillRect(ax + (f > 0 ? 1 : -2), py + (up ? 2 : 4), 3, 2)   // steel head
                    ctx.fillStyle = '#c8d2da'; ctx.fillRect(ax + (f > 0 ? 3 : -2), py + (up ? 2 : 4), 1, 2)   // glint
                } else {
                    ctx.fillRect(ax, py + 9, 2, 3)                                        // arm at rest
                }
                ctx.fillStyle = '#1d4573'
                if (moving) {
                    const step = gs.tick % 2
                    ctx.fillRect(px + 4, py + 13, 3, 2 + step); ctx.fillRect(px + 9, py + 13, 3, 3 - step)     // stride
                    ctx.fillStyle = '#4a3018'
                    ctx.fillRect(px + 4, py + 14 + step, 3, 1); ctx.fillRect(px + 9, py + 15 - step, 3, 1)     // boots
                } else {
                    ctx.fillRect(px + 4, py + 13, 3, 3); ctx.fillRect(px + 9, py + 13, 3, 3)                   // planted
                    ctx.fillStyle = '#4a3018'
                    ctx.fillRect(px + 4, py + 15, 3, 1); ctx.fillRect(px + 9, py + 15, 3, 1)
                }
            }
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.time) hud.time.style.width = `${Math.max(0, 100 * (1 - gs.tick / meta.timeTicks))}%`
            if (hud.timeSec) hud.timeSec.textContent = String(Math.max(0, Math.ceil((meta.timeTicks - gs.tick) / CFG.caHz)))
            if (hud.gems) hud.gems.textContent = `${gs.have}/${meta.need}`
            if (hud.score) hud.score.textContent = String(gs.score).padStart(6, '0')
            if (hud.lvl) hud.lvl.textContent = `${levelIdx + 1}. ${meta.name}`
            if (hud.exit) hud.exit.style.color = gs.have >= meta.need ? '#59e05e' : '#c9a24a'
        }

        // ---------- input ----------
        const startPlay = () => {
            loadLevel(0, true)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            // #1637 WATCH: Y seats the proven digger (planStep drives the real
            // playerMove on the CA's own cadence); any driving key hands the
            // wheel back and the player continues from exactly there.
            if (isWatchKey(e)) { watchingRef.current = !watchingRef.current; setWatching(watchingRef.current); if (watchingRef.current) playWatchStart(); else playWatchStop(); return }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (ARROWS.includes(e.code)) {
                if (!held.includes(e.code)) held.push(e.code)
                movePlayer(e.code)                            // instant first step on a tap
            }
        }
        const onUp = (e) => { const i = held.indexOf(e.code); if (i >= 0) held.splice(i, 1) }
        const onBlur = () => held.length = 0
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && e.target === canvas) {
                // #1637 WATCH: a tap on the cave is the player digging — the
                // seat hands back before the tap drives.
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                const r = canvas.getBoundingClientRect()
                const tx = (e.clientX - r.left) / r.width * W, ty = (e.clientY - r.top) / r.height * H
                const dx = tx - (gs.player.x + 0.5), dy = ty - (gs.player.y + 0.5)
                if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                else movePlayer(dy > 0 ? 'ArrowDown' : 'ArrowUp')
            }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / CW, r.height / CH)
            canvas.style.width = `${CW * sc}px`
            canvas.style.height = `${CH * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // ---------- DEV hook: read-only probe + planner hint ----------
        if (import.meta.env.DEV) {
            window.__dashTest = {
                probe: () => {
                    let boulders = 0, gems = 0, fires = 0, slime = 0, bolts = 0, heads = 0
                    const headDirs = new Set()
                    const kinds = [0, 0, 0, 0]
                    const boltAt = []
                    for (let i = 0; i < gs.grid.length; i++) {
                        if (gs.grid[i] === BOULDER) boulders++
                        else if (gs.grid[i] === DIAMOND) gems++
                        else if (gs.grid[i] === FIRE) fires++
                        else if (gs.grid[i] === AMO_HEAD || gs.grid[i] === AMO_BODY) slime++
                        else if (gs.grid[i] === PUSHWALL) { bolts++; boltAt.push([i % W, (i - (i % W)) / W]) }
                        if (gs.grid[i] === AMO_HEAD) { heads++; headDirs.add(gs.amoHead[i]); kinds[gs.amoExt ? gs.amoVar[i] : 0]++ }
                    }
                    return {
                        screen: screenRef.current, tick: gs.tick, t: gs.tick / CFG.caHz, level: levelIdx, name: meta.name,
                        player: { ...gs.player }, have: gs.have, need: meta.need, score: gs.score,
                        end: gs.end, win: gs.win, hash: stateHash(gs), moves: runMoves,
                        exit: { ...gs.exit, open: gs.have >= meta.need },
                        boulders, gems, fires, slime, bolts, boltAt, flies: gs.flies.map(f => ({ ...f })), board: board(),
                        // #2374 polish observability (DEV-only): comet length and
                        // whether the corridor-entry chirp has fired this level.
                        trail: trail.size, alarmed,
                        // #2444 the forking blob, live: front count + heading spread.
                        heads, headDirs: [...headDirs],
                        // #2453 the butterfly, live: flap count + is-it-a-butterfly.
                        flaps: gs.flies.reduce((n, f) => n + (f.flaps || 0), 0),
                        butterfly: gs.flies.some((f) => f.drift === 1 && f.digs === 0),
                        // #2463 the transports, live: cargo aloft, deliveries landed.
                        carries: gs.flies.reduce((n, f) => n + (f.carry || 0), 0),
                        ferryDrops: ferrySeen, transportsDone: doneSeen,
                        // #2438 polish observability (DEV-only): the juice the sim
                        // cannot see — telegraph state, sfx receipts (cumulative, so
                        // a one-shot tone observed at any later tick still counts)
                        // and the live head counts per variant the family tells key on.
                        viseHot, viseLanes: visePairs.length,
                        turnBlips: turnSeen, forkBlips: forkSeen, dropThunks: dropHeard, flapToots: flapHeard, drones: dronesHeard,
                        coolTrail: trailB.size, wingPhase: gs.tick % 2,
                        tubes: tubesSet.size, pillar: pillarSet.size,
                        amoKinds: kinds,
                        // #2468 the slide, live: rumble receipts + which walls
                        // still carry momentum ([x, y, dir, live]).
                        slides: slideSeen,
                        mom: [...gs.wallMom.entries()].map(([i, m]) => [i % W, (i - (i % W)) / W, m.dir, m.live ? 1 : 0]),
                    }
                },
                // the next arrow the PROVEN planner would press from here — the
                // driver still has to press a real arrow to make it happen.
                hint: () => planStep(gs) || null,
                // #1637 WATCH probes: is the prover digging, did it blip.
                watching: () => watchingRef.current && screenRef.current === 'play',
                watchSfx: watchSfxLog,
                // DEV-only rig for the death test: it only LOOSENS a boulder two
                // tiles overhead (like Lemmings' __marioTest.teleport positions a
                // body). The crush itself is computed by the real gravity CA on
                // the real loop — the driver then restarts with a real key.
                crush: () => {
                    if (!gs || screenRef.current !== 'play' || gs.player.y - 2 < 1) return false
                    gs.grid[(gs.player.y - 2) * W + gs.player.x] = BOULDER
                    gs.grid[(gs.player.y - 1) * W + gs.player.x] = EMPTY
                    return true
                },
                start: startPlay,
            }
            // AGENTS.md rule 4: the DEV-only F1 surgery kit. Live state lines +
            // the planner's prognosis re-run against the MUTATED cave: "can this
            // still be brought home from here?" — the puzzle-game diagnosis.
            mountDbg({
                title: 'BOULDER DASH',
                getState: () => {
                    const p = window.__dashTest.probe()
                    const hint = planStep(gs) || 'no route!'
                    return [
                        `cave ${levelIdx + 1} ${meta.name} tick ${p.tick} have ${p.have}/${p.need} score ${p.score}`,
                        `player ${p.player.x},${p.player.y} alive=${p.player.alive} end=${p.end || '-'}`,
                        `grid: slime=${p.slime} bolts=${p.bolts} boulders=${p.boulders} gems=${p.gems} fire=${p.fires}`,
                        `planner prognosis: ${hint}`,
                    ]
                },
                actions: [
                    { label: 'loosen a rock overhead', run: () => { window.__dashTest.crush() } },
                ],
            })
            exposeGame({
                id: 'boulder-dash',
                buttons: ['left', 'right', 'up', 'down', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    loadLevel(contractSeed % LEVELS.length, true)
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const heldDirs = [[pad.up, 'ArrowUp'], [pad.down, 'ArrowDown'], [pad.left, 'ArrowLeft'], [pad.right, 'ArrowRight']].filter((d) => d[0])
                    if (heldDirs.length && gs.tick - lastMoveTick >= MOVE_STEP) movePlayer(heldDirs[heldDirs.length - 1][1])
                    handleEvents(step(gs).events)
                    trailAndCue()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, level: levelIdx, have: gs.have, win: gs.win,
                    player: { x: gs.player.x, y: gs.player.y, alive: gs.player.alive },
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => structuredClone(gs),
                restore: (s) => { gs = s },
            })
        }

        // #1473: production-safe feedback state, every build. BoulderDash caves are
        // hand-authored grids and the sim states it plainly ("There is no RNG") —
        // zero Math.random in the whole title — so no per-run seed exists:
        // {tick,score,done,gold}.
        exposeFeedbackState(() => ({ tick: gs ? gs.tick : 0, score: gs ? gs.score : 0, done: !!gs && gs.end != null, gold: gs ? gs.have : 0 }))

        return () => {
            unmountDbg()
            unexposeFeedbackState()
            if (import.meta.env.DEV) { delete window.__dashTest; unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                {/* #2875: the strip used to span the viewport — the fixed ARCADE
                    button sat on the level name and PAUSE covered the score.
                    The HUD now starts clear of the chrome cluster (ARCADE ends
                    ≈4.25rem; PAUSE+mute end ≈7.75rem) so no button ever lands
                    on HUD text at any aspect ratio. */}
                <div className="absolute top-2 flex items-center gap-3 text-amber-50 font-mono text-xs" style={{ left: 'calc(5.5rem + var(--sal, 0px))', right: 'calc(8.25rem + var(--sar, 0px))' }}>
                    <span id="dash-lvl" ref={setHud('lvl')} className="font-bold tracking-widest text-sm" />
                    <span className="font-bold tracking-widest text-[10px] opacity-80">TIME</span>
                    <div className="w-28 h-2.5 bg-black/50 rounded overflow-hidden border border-black/50">
                        <div ref={setHud('time')} className="h-full" style={{ background: 'linear-gradient(90deg,#59e05e,#ffd83d,#e23b3b)', width: '100%' }} />
                    </div>
                    {/* #2875: the bar had no label and no number — a newcomer
                        couldn't tell it was a countdown until it ran out. */}
                    <span ref={setHud('timeSec')} className="font-bold tabular-nums -ml-1" />
                    <span>GEMS <span ref={setHud('gems')} className="font-bold text-cyan-300" /></span>
                    <span ref={setHud('exit')}>EXIT</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>000000</span>
                    </span>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-5xl font-black text-amber-300 mb-6" style={{ textShadow: '0 4px 0 #7a3b12, 0 10px 24px #000' }}>BOULDER DASH</h1>
                    <AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                    {/* #1654: the discoverable WATCH line, before the first Y press. */}
                    <div className="mt-4 text-amber-100/60 font-mono text-xs tracking-widest">{WATCH_ATTRACT_HINT}</div>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.gems}/{end.need} gems{end.last ? ' · EVERY CAVE CRACKED' : ''}</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-cyan-300 font-bold mb-1 tracking-widest">DEEP DIGGERS</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.level}</span><span>{r.gems} gems · {r.score}</span><span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'BOULDER DASH')} onResume={handleResume} />}
            {/* #1637 WATCH — the proven digger clears the cave. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {/* #2875 — the in-play pill covered the start chamber (bottom-left
                sat right on the spawn cells) for the whole run. It now HIDES
                while a human drives: seating is the attract pill, the PAUSE
                overlay's WATCH row (#1656 paths), or Y; the pill reappears
                docked at the fleet chrome convention (3.5rem under PAUSE) as
                the ◼ TAKE switch while the prover digs. */}
            {screen === 'play' && !paused && watching && (
                <div className="absolute pointer-events-auto z-50" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on />
                </div>
            )}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default DashGame

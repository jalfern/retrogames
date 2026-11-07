// TETRIS — the arcade shell over ./sim.js (the pure, audited simulation) and
// ./planner.js (the autopilot that scripts the attract demo). 256x240, the
// NES frame: the well at center-left, SCORE/TOP/LINES/LEVEL/NEXT panel on the
// right, marquee art column at the far edge. Keyboard and touch share one code
// path; the sim owns gravity, DAS and scoring — this file only paints and
// listens. Verify with `npm run tetrischeck` (Node, no browser).

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { MESSAGES, PRESS } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { fitFill } from '../../utils/fitCanvas'
import { newGame, step, cellsOf, stateHash, PIECE_NAMES, SPAWN_X, SPAWN_Y, FIXED_DT, resting } from './sim.js'
import { choosePlan, driveInput, nextDemoLevel, DEMO_LEVELS } from './planner.js'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { musicStep } from './music.js'
import { blockTile, text5, artColumn } from './art.js'

const SIM_MS = FIXED_DT
const W = 256, H = 240
const CELL = 8
const FX = 88, FY = 48
const DEMO_SEED = 20261013

const TetrisGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [finalInfo, setFinalInfo] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 WATCH: tetrischeck's planner stacks the well
    const watchingRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const lastLevelRef = useRef(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const canvas = document.createElement('canvas')
        canvas.dataset.tetrisStage = '1'
        canvas.width = W
        canvas.height = H
        canvas.className = 'block'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = null
        let demo = null, demoMem = {}, demoPlan = null
        let playPlan = null, playMem = {} // #1637 the watcher's per-piece plan + stuck watchdog
        let demoLevel = DEMO_LEVELS[0]
        let raf = 0, last = 0, acc = 0
        let seedCounter = (Date.now() >>> 0) ^ 0x5eed
        const keys = { left: false, right: false, down: false, rot: false }
        let lockFlash = { cells: null, t: 0 }
        let wasResting = false
        let toast = 0, toastMsg = ''
        let scoreFlash = 0
        let topScore = 0
        try { topScore = Number(localStorage.getItem('arcade.tetris.top') || 0) || 0 } catch { /* private mode */ }

        const say = (m) => { toastMsg = m; toast = 120 }

        const handleEvents = (s, audible) => {
            while (s.events.length) {
                const e = s.events.shift()
                if (e.t === 'lock') lockFlash = { cells: e.cells, t: 9 }
                if (!audible) continue
                if (e.t === 'rot') audioController.playTone(620, 0.04, 'square', 0.05)
                else if (e.t === 'lock') audioController.playNoise(0.035, 0.1)
                else if (e.t === 'cleared') {
                    // The shift just landed after the NES flash window: the
                    // rows are gone, the score lands, the tempo steps up.
                    scoreFlash = 20
                    audioController.playSweep(260 + e.n * 90, 620 + e.n * 160, 0.16 + e.n * 0.05, 'square', 0.08)
                    if (e.n === 4) {
                        say('TETRIS!')
                        setTimeout(() => audioController.playTone(1319, 0.06, 'square', 0.07), 60)
                        setTimeout(() => audioController.playTone(1760, 0.09, 'square', 0.07), 120)
                    }
                    audioController.setMusicStep(musicStep(s.level))
                } else if (e.t === 'level') {
                    audioController.playTone(880, 0.09, 'square', 0.07)
                    setTimeout(() => audioController.playTone(1175, 0.14, 'square', 0.07), 90)
                } else if (e.t === 'over') {
                    audioController.playDeath()
                }
            }
        }

        const finish = (s) => {
            if (!s.over) return
            watchingRef.current = false; setWatching(false) // #1637 the run ends in your hands
            if (s.score > topScore) {
                topScore = s.score
                try { localStorage.setItem('arcade.tetris.top', String(topScore)) } catch { /* private mode */ }
            }
            overAtRef.current = performance.now()
            setFinalInfo({ score: s.score, lines: s.lines, level: s.level, top: topScore })
            setSc('over')
        }

        const startPlay = (level, seed) => {
            lastLevelRef.current = level
            watchingRef.current = false; setWatching(false) // #1637 a new well starts in your hands
            playPlan = null; playMem = {}
            seedCounter = (seedCounter * 1103515245 + 12345) >>> 0
            // #737: honor ?seed=N so a filed feedback report's seed replays this exact world.
            const pin = seed === undefined ? seedFromQuery() : null
            gs = newGame(level, (pin != null ? pin : seed === undefined ? seedCounter : seed) >>> 0)
            lockFlash = { cells: null, t: 0 }
            wasResting = false
            setFinalInfo(null)
            setSc('play')
            audioController.startMusic('tetris')
            audioController.setMusicStep(musicStep(level))
        }

        const buildDemo = (level = DEMO_LEVELS[0]) => {
            demo = newGame(level, DEMO_SEED)
            demoMem = {}
            demoPlan = choosePlan(demo)
        }

        // ------------------------------------------------------------ paint ----
        const fieldXY = (r, c) => [FX + c * CELL, FY + r * CELL]

        const paintField = (s, ghost) => {
            ctx.fillStyle = '#000'
            ctx.fillRect(FX - 2, FY - 2, 10 * CELL + 4, 20 * CELL + 4)
            ctx.strokeStyle = '#f8f8f8'
            ctx.strokeRect(FX - 2.5, FY - 2.5, 10 * CELL + 5, 20 * CELL + 5)
            ctx.strokeStyle = '#0058f8'
            ctx.strokeRect(FX - 4.5, FY - 4.5, 10 * CELL + 9, 20 * CELL + 9)
            for (let r = 0; r < 20; r++) {
                for (let c = 0; c < 10; c++) {
                    const id = s.board[r * 10 + c]
                    if (id) {
                        const [x, y] = fieldXY(r, c)
                        ctx.drawImage(blockTile(id), x, y, CELL, CELL)
                    }
                }
            }
            if (s.clearing) {
                // The NES pre-shift flash: the full rows blink white while the
                // board is frozen. The sim owns the timer; this only blinks.
                const on = Math.floor(s.tick / 4) % 2 === 0
                ctx.fillStyle = on ? 'rgba(248,248,248,0.9)' : 'rgba(248,248,248,0.35)'
                for (const r of s.clearing.rows) ctx.fillRect(FX, FY + r * CELL, 10 * CELL, CELL)
            }
            if (lockFlash.cells && lockFlash.t > 0) {
                ctx.fillStyle = lockFlash.t > 4 ? 'rgba(248,248,248,0.95)' : 'rgba(248,248,248,0.5)'
                for (const [r, c] of lockFlash.cells) {
                    if (r < 0 || r >= 20) continue
                    ctx.fillRect(FX + c * CELL, FY + r * CELL, CELL, CELL)
                }
                lockFlash.t--
            }
            if (!s.over && s.cur) {
                for (const [r, c] of cellsOf(s.cur.type, s.cur.rot, s.cur.x, s.cur.y)) {
                    if (r < 0 || r >= 20) continue
                    const [x, y] = fieldXY(r, c)
                    ctx.drawImage(blockTile(s.cur.type + 1), x, y, CELL, CELL)
                }
            }
            void ghost
        }

        const paintPanel = (s) => {
            const X = 176
            const pad = (n, w) => String(n).padStart(w, '0')
            text5(ctx, 'SCORE', X, FY, '#0058f8', 1)
            text5(ctx, pad(s.score, 6), X, FY + 8, scoreFlash > 0 && scoreFlash % 4 < 2 ? '#f8d800' : '#f8f8f8', 2)
            text5(ctx, 'TOP', X, FY + 26, '#0058f8', 1)
            text5(ctx, pad(Math.max(topScore, s.score), 6), X, FY + 34, '#f8f8f8', 2)
            text5(ctx, 'LINES', X, FY + 52, '#0058f8', 1)
            text5(ctx, pad(s.lines, 5), X, FY + 60, '#f8f8f8', 2)
            text5(ctx, 'LEVEL', X, FY + 78, '#0058f8', 1)
            text5(ctx, pad(s.level, 3), X, FY + 86, '#f8f8f8', 2)
            text5(ctx, 'NEXT', X, FY + 104, '#0058f8', 1)
            ctx.strokeStyle = '#f8f8f8'
            ctx.strokeRect(X - 0.5, FY + 112 - 0.5, 41, 41)
            if (s.next !== undefined && s.next !== null) {
                const cells = cellsOf(s.next, 0, SPAWN_X, SPAWN_Y)
                let minC = 9, maxC = 0, minR = 9
                for (const [r, c] of cells) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r) }
                const wpx = (maxC - minC + 1) * CELL, hpx = (2 - minR + 1) * CELL
                const ox = X + 20 - wpx / 2, oy = FY + 112 + 20 - hpx / 2
                for (const [r, c] of cells) {
                    ctx.drawImage(blockTile(s.next + 1), ox + (c - minC) * CELL, oy + (r - minR) * CELL, CELL, CELL)
                }
            }
            text5(ctx, 'A:TURN', X, FY + 160, '#787878', 1)
            text5(ctx, 'DOWN:DROP', X, FY + 168, '#787878', 1)
        }

        const paint = () => {
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, W, H)
            const s = screenRef.current === 'attract' ? demo : gs
            if (!s) return
            const t = s.tick
            artColumn(ctx, 240, 0, H, t)
            artColumn(ctx, 0, 0, H, t + 24)
            text5(ctx, 'TETRIS', FX + (10 * CELL - textW('TETRIS', 3)) / 2, 12, '#00e8f8', 3)
            text5(ctx, '20 ROWS  7 PIECES  NO MERCY', FX, 34, '#787878', 1)
            paintField(s)
            paintPanel(s)
            if (toast > 0) {
                ctx.fillStyle = `rgba(248,216,0,${Math.min(1, toast / 30)})`
                text5(ctx, toastMsg, FX + (10 * CELL - textW(toastMsg, 2)) / 2, FY + 70, `rgba(248,216,0,${Math.min(1, toast / 30)})`, 2)
                toast--
            }
            if (scoreFlash > 0) scoreFlash--
        }

        const textW = (str, scale) => String(str).length * 4 * scale - scale

        // ----------------------------------------------------------- frame ----
        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 }
            else {
                acc += ft
                while (acc >= SIM_MS) {
                    acc -= SIM_MS
                    if (screenRef.current === 'attract' && demo) {
                        step(demo, driveInput(demo, demoPlan, demoMem))
                        if (demo.over) { demoLevel = nextDemoLevel(demoLevel); buildDemo(demoLevel) }
                        else if (demoPlan && demo.locks !== demoMem.lastLocks && !demo.clearing) { demoMem = { lastLocks: demo.locks }; demoPlan = choosePlan(demo) }
                        handleEvents(demo, false)
                    } else if (screenRef.current === 'play' && gs && !gs.over) {
                        const pad = watchingRef.current ? driveInput(gs, playPlan, playMem) : { ...keys }
                        step(gs, pad)
                        recordLiveTick([{ left: pad.left, right: pad.right, down: pad.down, a: pad.rot }])
                        // #1637 the same re-plan the attract demo runs: a new
                        // piece means a new decision, taken from LIVE state.
                        if (watchingRef.current && playPlan && gs.locks !== playMem.lastLocks && !gs.clearing) { playMem = { lastLocks: gs.locks }; playPlan = choosePlan(gs) }
                        const rest = resting(gs)
                        if (rest && !wasResting) audioController.playTone(140, 0.03, 'square', 0.05)
                        wasResting = rest
                        handleEvents(gs, true)
                        finish(gs)
                    }
                }
            }
            paint()
        }

        // ------------------------------------------------------------ input ----
        const ROT_KEYS = new Set(['ArrowUp', 'KeyX', 'Space', 'Enter'])
        const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown'])
        const startLevelFor = (code) => {
            const d = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : null
            return d !== null && d !== '' && /^[0-9]$/.test(d) ? Number(d) : null
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (MOVE_KEYS.has(code) || ROT_KEYS.has(code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                const lvl = startLevelFor(code)
                startPlay(lvl === null ? 0 : lvl)
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                if (code === 'Enter' || code === 'KeyR' || code === 'Space') { startPlay(lastLevelRef.current); return }
                setSc('attract'); return
            }
            if (pausedRef.current) return
            // #1637 WATCH: Y seats the planner at any live well state (it
            // re-decides from the board every lock); any driving key takes over.
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (gs && !gs.over) { watchingRef.current = true; setWatching(true); playWatchStart(); playPlan = choosePlan(gs); playMem = {} }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (code === 'ArrowLeft') keys.left = true
            else if (code === 'ArrowRight') keys.right = true
            else if (code === 'ArrowDown') keys.down = true
            else if (ROT_KEYS.has(code)) keys.rot = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.left = false
            else if (e.code === 'ArrowRight') keys.right = false
            else if (e.code === 'ArrowDown') keys.down = false
            else if (ROT_KEYS.has(e.code)) keys.rot = false
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                startPlay(lastLevelRef.current)
                return
            }
            // #1637 a touch on the well means you want the wheel (the WATCH
            // pill stopPropagations its press; the pad's keys take over too).
            if (sc === 'play' && watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
        }

        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = fitFill(W, H, r.width - 8, r.height - 60)
            canvas.style.width = `${W * s}px`
            canvas.style.height = `${H * s}px`
        }
        window.addEventListener('resize', resize)

        buildDemo()
        resize()
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------- DEV hook ----
        // #1200: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: !!gs.over, seed: gs.seed, x: gs.cur ? gs.cur.x : -1, y: gs.cur ? gs.cur.y : -1 }))

        if (import.meta.env.DEV) {
            window.__tetrisTest = {
                probe: () => {
                    const s = screenRef.current === 'attract' ? demo : gs
                    return {
                        screen: screenRef.current,
                        level: s.level, startLevel: s.startLevel, score: s.score, lines: s.lines,
                        over: s.over, tick: s.tick, locks: s.locks,
                        clearing: s.clearing ? { rows: s.clearing.rows, t: s.clearing.t } : null,
                        next: PIECE_NAMES[s.next], cur: s.cur ? {
                            type: PIECE_NAMES[s.cur.type], rot: s.cur.rot, x: s.cur.x, y: s.cur.y,
                            cells: cellsOf(s.cur.type, s.cur.rot, s.cur.x, s.cur.y),
                        } : null,
                        hash: stateHash(s), topScore,
                        musicStep: audioController.music && audioController.music.playing ? audioController.music.stepDur : null,
                    }
                },
                start: (lvl = 0, sd) => startPlay(lvl, sd),
                watching: () => watchingRef.current, // #1637 watchcheck pilot drives these
                watchSfx: watchSfxLog,
                seedClear: (banked = 0) => {
                    if (!gs || gs.over || screenRef.current !== 'play') return 'no live well'
                    gs.board.fill(0)
                    gs.lines = banked
                    for (let c = 0; c <= 5; c++) gs.board[19 * 10 + c] = 1
                    gs.board[18 * 10 + 0] = 2 // marker: must ride the shift down one row
                    gs.cur = { type: 5, rot: 0, x: 6, y: 0 } // horizontal I over cols 6-9
                    gs.next = 2
                    gs.g = 0
                    return 'row 19 waiting for the I (cols 6-9), marker at 18,0'
                },
                seedWatch: () => {
                    // #1637 watchcheck seed: like seedClear but the I sits at SPAWN,
                    // so only SLIDING (thinking) can reach the gap — an idle watcher
                    // drops it onto row 18 and never clears a row. Prover-only.
                    if (!gs || gs.over || screenRef.current !== 'play') return 'no live well'
                    gs.board.fill(0)
                    for (let c = 0; c <= 5; c++) gs.board[19 * 10 + c] = 1
                    gs.board[18 * 10 + 0] = 2
                    gs.cur = { type: 5, rot: 0, x: SPAWN_X, y: SPAWN_Y }
                    gs.next = 2
                    gs.g = 0
                    return 'row 19 needs cols 6-9; the I sits at spawn — only a slide clears it'
                },
                hash: () => (gs ? stateHash(gs) : 0),
            }
            mountDbg({
                title: 'TETRIS',
                getState: () => gs ? [
                    `level=${gs.level} lines=${gs.lines} score=${gs.score} locks=${gs.locks} tick=${gs.tick} over=${gs.over}`,
                    `cur=${PIECE_NAMES[gs.cur.type]} r${gs.cur.rot} @${gs.cur.x},${gs.cur.y} next=${PIECE_NAMES[gs.next]} rng=${gs.rng}`,
                ] : ['no game'],
                actions: [
                    { label: 'L0', run: () => { startPlay(0); return 'level 0' } },
                    { label: 'L9', run: () => { startPlay(9); return 'level 9' } },
                    { label: 'L18', run: () => { startPlay(18); return 'level 18' } },
                    { label: 'FILL ROWS', run: () => {
                        if (!gs || gs.over || screenRef.current !== 'play') return 'no live well'
                        for (let r = 14; r < 20; r++) for (let c = 0; c < 9; c++) gs.board[r * 10 + c] = 2
                        return 'rows 14-19 nine wide, waiting for column 9'
                    } },
                ],
            })
            exposeGame({
                id: 'tetris',
                buttons: ['left', 'right', 'down', 'a'],
                reset: (seed) => {
                    startPlay(0, seed >>> 0)
                    keys.left = keys.right = keys.down = keys.rot = false
                    lockFlash = { cells: null, t: 0 }
                    wasResting = false; toast = 0; scoreFlash = 0
                },
                tick: (pad) => {
                    if (gs.over) { gs.tick += 1; return }
                    step(gs, { left: !!pad.left, right: !!pad.right, down: !!pad.down, rot: !!pad.a })
                    handleEvents(gs, false)
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: !!gs.over,
                    seed: gs.seed, level: gs.level, lines: gs.lines, locks: gs.locks,
                    px: gs.cur ? gs.cur.x : -1, py: gs.cur ? gs.cur.y : -1, rot: gs.cur ? gs.cur.rot : 0,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify({ ...gs, board: Array.from(gs.board) })),
                restore: (s) => { gs = { ...s, board: Uint8Array.from(s.board) } },
            })
        }

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__tetrisTest) delete window.__tetrisTest; unmountDbg(); unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            audioController.stopMusic()
            canvas.remove()
        }
    }, [])

    const handleResume = () => { setPaused(false); pausedRef.current = false }
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <AttractMessage className="mb-6 text-cyan-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-cyan-300">{PRESS}</p>
                    <p className="mt-3 font-mono text-[11px] tracking-widest text-emerald-300/90">{WATCH_ATTRACT_HINT}</p>
                </div>
            )}

            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}

            {/* #1637 WATCH — the prover stacks the well; any input takes over. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            {screen === 'over' && finalInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-100 font-mono px-6">
                    <h2 className="text-4xl font-black mb-2 text-red-400" style={{ textShadow: '3px 3px 0 #000' }}>GAME OVER</h2>
                    <p className="text-lg">{String(finalInfo.score).padStart(6, '0')} &middot; {finalInfo.lines} lines &middot; level {String(finalInfo.level).padStart(2, '0')}</p>
                    <p className="text-sm text-cyan-300/80 mb-4">TOP {String(finalInfo.top).padStart(6, '0')}</p>
                    <p className="text-sm text-cyan-100/80 mb-2">ENTER / R runs it back at level {lastLevelRef.current}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'TETRIS')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default TetrisGame

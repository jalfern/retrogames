import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { attractFrame, DIM } from './attract.js'
import { OPENING_VERSE, ONE_UP_STING, GAME_OVER_STING, freqOf } from './tunes.js'
import {
    CELL, COLS, W, HOME_ROW, RIVER_TOP, RIVER_BOT, MEDIAN_ROW, ROAD_TOP, ROAD_BOT, START_ROW,
    TIME_LIMIT, HOP_ANIM, DIE_ANIM, DIVE_CYCLE, ROW_FREEZE, SCORE_WRAP,
    makeRun, tickFrogger, hop as simHop, supportAt as simSupportAt, spansOf, surfaced, houseAt, deathStyle, bankEdgeX, stateHash,
} from './sim.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'

const FroggerGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // #1637 b25 — the seat. React mirrors of the sim flags drive the shared
    // chrome (pill, toast, attract ▶ WATCH); gs.watching is the engine flag.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // FIXED INTERNAL RESOLUTION: 13 columns of 20px, 12 play rows + HUD strip
        // (rows, configs and the whole tick rule set live in ./sim.js — #1637 b25
        // lifted them so froggercheck proves the driver against shipped physics).
        const HUD_H = 26
        const ROWS = 12
        const H = HUD_H + ROWS * CELL

        canvas.width = W
        canvas.height = H
        ctx.imageSmoothingEnabled = false

        const rowMid = r => HUD_H + r * CELL + CELL / 2

        // ---------- world + seed (#1473 seed-param, batch 15) ----------
        // Lane dive offsets and the bonus fly house are the engine's only dice;
        // makeRun puts them on one seeded stream regenerated at every human
        // start, so ?seed=N replays the exact traffic.
        let seed = Math.floor(Math.random() * 1000000)
        let gs = makeRun(seed, { attract: true })
        let gameOverShown = false // the defeat sting plays once per run, not per frame
        let attractTick = 0
        let hiScore = Number(localStorage.getItem('frogger.hi') || 0)

        // ------------------------------------------------------------------
        // sounds (the tick returns events; the shell keeps the audio, the sim
        // stays pure so Node can replay it)
        // ------------------------------------------------------------------
        const playHop = row => audioController.playTone(340 + (START_ROW - row) * 18, 0.05, 'square', 0.06)
        const playDie = cause => {
            if (cause === 'off') {
                // off the board: a dry descending thud, no water splash (#1508)
                audioController.playSweep(420, 90, 0.22, 'square', 0.14)
            } else if (cause === 'wall') {
                // a head-on bump into a filled home: a flat bonk, no splash
                audioController.playTone(160, 0.14, 'square', 0.13)
            } else {
                audioController.playSweep(320, 60, 0.35, 'sawtooth', 0.15)
                audioController.playNoise(0.25, 0.15)
            }
        }
        const playHome = (fly, bonus, lady) => {
            audioController.playSweep(330, 660, 0.2, 'square', 0.1)
            if (fly) audioController.playTone(1568, 0.1, 'square', 0.1)
            // #3676 gap 0 — the arcade pays the unused-time bonus as its own
            // rising triad, distinct from the plain home chime.
            if (bonus > 0) {
                audioController.playTone(880, 0.05, 'square', 0.07)
                audioController.playTone(1174, 0.05, 'square', 0.07)
                audioController.playTone(1760, 0.09, 'square', 0.07)
            }
            // #3692 §Scoring — delivering the lady frog (200): a bright two-
            // note sparkle over the home chime, the run's sweetest sound.
            if (lady) {
                audioController.playTone(1760, 0.06, 'square', 0.09)
                audioController.playTone(2217, 0.1, 'square', 0.09)
            }
        }
        // #3692 — finding her on a log: a rising two-octave chirp (distinct
        // from home/hop/enter); #3703 — the 1981 cabinet tunes (opening verse,
        // one-up sting, game-over sting): original note tables (./tunes.js),
        // played through AudioController, pinned by froggercheck.
        const playLadyPick = () => audioController.playSweep(880, 1760, 0.12, 'square', 0.09)
        const playTune = (table, type = 'square') => {
            for (const e of table) audioController.playTone(freqOf(e.midi), e.dur, type, e.vol, e.at)
        }
        const playOpeningVerse = () => playTune(OPENING_VERSE)
        const playOneUp = () => playTune(ONE_UP_STING)
        const playGameOver = () => playTune(GAME_OVER_STING)
        // #3676 gap 0 — row-entry bleep: a short chirp that climbs with the
        // row, riding the same octave curve as the hop tone but brighter.
        const playEnter = row => audioController.playTone(520 + (START_ROW - row) * 34, 0.09, 'square', 0.09)
        const playHandoff = () => audioController.playSweep(660, 220, 0.3, 'triangle', 0.12)

        const seat = () => {
            gs.watching = true
            setWatching(true)
            playWatchStart()
        }
        const release = (blip = true) => {
            gs.watching = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        const startGame = (players = 1) => {
            // every human start regenerates the seed (?seed=N wins) — the
            // attract demo never spends the run's traffic (#1473)
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            gs = makeRun(seed, { players })
            if (players === 2) gs.banner = 120 // PLAYER 1 opens the duel
            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands
            setWatching(false)
            gameOverShown = false
            playOpeningVerse() // the run begins — the opening verse, not a blip
        }

        const handleKeyDown = e => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault()
            }

            // WATCH (b24 law): Y toggles the crossing planner. On attract/game
            // over it starts a fresh run AND seats — the plan runs from tick 0.
            if (isWatchKey(e)) {
                if (gs.attract || gs.over) { startGame(); seat(); return }
                if (gs.watching) release(); else seat()
                return
            }
            // #3676 gap 0 — `2` at attract/game-over opens the alternating
            // duel (desktop/same-device; the phone keeps the one-pad 1P run).
            if (gs.attract) { startGame(e.code === 'Digit2' ? 2 : 1); return }
            if (gs.over) { startGame(e.code === 'Digit2' ? 2 : 1); return }
            if (e.repeat) return

            if (gs.watching && isTakeoverKey(e)) release()
            const dir = e.code === 'ArrowUp' ? [0, -1]
                : e.code === 'Space' ? [0, -1]
                    : e.code === 'ArrowDown' ? [0, 1]
                        : e.code === 'ArrowLeft' ? [-1, 0]
                            : e.code === 'ArrowRight' ? [1, 0] : null
            if (dir) {
                const r = simHop(gs, dir[0], dir[1])
                if (r?.kind === 'hopped') playHop(r.row)
                else if (r?.kind === 'died') playDie(r.cause)
                // #3692 — forward the full home payout (bonus + lady): the
                // keydown path used to drop the time-bonus triad's arguments.
                else if (r?.kind === 'home') playHome(r.fly, r.bonus, r.lady)
                if (gs.oneUp) { gs.oneUp = false; playOneUp() }
            }
        }

        const resize = () => {
            if (!containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            if (width === 0 || height === 0) return
            const scale = Math.min(width / W, height / H)
            canvas.style.width = `${Math.floor(W * scale)}px`
            canvas.style.height = `${Math.floor(H * scale)}px`
        }

        // ------------------------------------------------------------------
        // EVENTS — hop() stamps these; the shell turns them into sound and
        // the hi-score write. The physics lives in sim.js.
        // ------------------------------------------------------------------
        const applyEvents = ev => {
            if (ev.hopped) playHop(ev.hopped)
            if (ev.enter) playEnter(ev.enter)
            if (ev.died) playDie(ev.died)
            if (ev.home) playHome(ev.fly, ev.bonus, ev.lady)
            if (ev.ladyPick) playLadyPick()
            // #3692 §Scoring — the bonus-frog jingle, consumed wherever the
            // score crossed 20k (loop tick or a keydown hop).
            if (gs.oneUp) { gs.oneUp = false; playOneUp() }
            if (ev.handoff) playHandoff()
            if (ev.beep) audioController.playTone(1000, 0.04, 'square', 0.08)
            if (ev.level) audioController.playSweep(440, 1320, 0.6, 'square', 0.12)
            if (ev.over && !gs.attract) {
                // the sim re-emits ev.over on every tick once the run ends —
                // the sting plays once per run
                if (!gameOverShown) { gameOverShown = true; playGameOver() }
                const top = Math.max(gs.scores[gs.player - 1], gs.players === 2 ? Math.max(...gs.scores) : 0)
                if (top > hiScore) {
                    hiScore = top
                    localStorage.setItem('frogger.hi', String(hiScore))
                }
                if (gs.watching) release(false) // the run ends in your hands (silent)
            }
        }

        if (import.meta.env.DEV) {
            window.__froggerTest = {
                state: () => ({
                    attract: gs.attract, over: gs.over, score: gs.score, lives: gs.lives, level: gs.level,
                    row: gs.frog.row, x: gs.frog.x, frogState: gs.frog.state, time: gs.timeLeft,
                    riding: gs.frog.riding, atHouse: houseAt(gs.frog.x) >= 0 && !gs.houses[houseAt(gs.frog.x)].filled,
                    players: gs.players, player: gs.player, scores: [...gs.scores], winner: gs.winner, freeze: gs.freeze,
                    lady: !!gs.lady, ladyLane: gs.lady ? gs.lady.lane : -1, carry: !!gs.frog.lady, oneUp: gs.oneUp,
                }),
                // Read-only "may I step up right now?" — the same predicates the
                // engine applies on landing. A harness reads; only keys act.
                canHopUp: () => gs.frog.state === 'alive' && simSupportAt(gs, Math.max(0, gs.frog.row - 1), gs.frog.x),
                riverSafe: dx => {
                    if (gs.frog.state !== 'alive' || gs.frog.row < RIVER_TOP || gs.frog.row > RIVER_BOT) return false
                    const nx = gs.frog.x + dx * CELL
                    return nx > CELL / 2 && nx < W - CELL / 2 && simSupportAt(gs, gs.frog.row, nx)
                },
                hop: (dx, dy) => simHop(gs, dx, dy),
                start: startGame,
                // #1637 b25 — the watch contract the pilot drives against.
                watching: () => gs.watching,
                watchSfx: watchSfxLog,
                probe: () => ({
                    tick: gs.tickN, score: gs.score, level: gs.level, lives: gs.lives,
                    row: gs.frog.row, x: gs.frog.x, frogState: gs.frog.state,
                    homes: gs.houses.filter(h => h.filled).length,
                    attract: gs.attract, over: gs.over,
                    players: gs.players, player: gs.player, scores: [...gs.scores], winner: gs.winner, freeze: gs.freeze,
                }),
            }
        }

        const handlePointerDown = () => {
            if (gs.attract || gs.over) {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))
            } else if (gs.watching) {
                // A tap DURING a watched crossing is a takeover (the contract).
                release()
            }
        }

        const init = () => {
            resize()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('resize', resize)
            canvas.addEventListener('pointerdown', handlePointerDown)
            canvas.focus()
            animationFrameId = requestAnimationFrame(loop)
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = timestamp => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                // QA contract: while __game.step() drives the sim, the rAF loop
                // yields the clock so scripted ticks stay deterministic.
                if (!contractHoldsLoop()) {
                    accumulator += frameTime
                    while (accumulator >= FIXED_DT) {
                        applyEvents(tickFrogger(gs))
                        accumulator -= FIXED_DT
                    }
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        init()

        // QA contract (#377): deterministic reset/tick/state so bots and
        // replays drive this crossing like every other title. The pad steps
        // through tickFrogger's humanHop — the same entry a keypress uses.
        exposeGame({
            id: 'frogger',
            buttons: ['up', 'down', 'left', 'right', 'a'],
            reset: (s) => {
                seed = s >>> 0
                gs = makeRun(seed)
                release(false)
                setAttractUi(false)
            },
            tick: (pad) => {
                const dx = pad.left ? -1 : pad.right ? 1 : 0
                const dy = (pad.up || pad.a) ? -1 : pad.down ? 1 : 0
                applyEvents(tickFrogger(gs, dx || dy ? { dx, dy } : null))
            },
            state: () => ({
                tick: gs.tickN,
                score: gs.score,
                done: gs.over,
                seed: seed,
                lives: gs.lives,
                level: gs.level,
                row: gs.frog.row,
                x: Math.round(gs.frog.x),
                homes: gs.houses.filter(h => h.filled).length,
                players: gs.players, player: gs.player, scores: [...gs.scores], winner: gs.winner,
                lady: !!gs.lady, carry: !!gs.frog.lady,
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: gs.rand is a closure that cannot JSON
            // round-trip (#391 — optional half of the contract).
        })

        // ------------------------------------------------------------------
        // DRAWING
        // ------------------------------------------------------------------
        // #3692 — tintable so the lady frog (§Gameplay "brightly colored
        // female frog") is our own original pink sprite, not a recolour of an
        // original asset: same construction language as the player's frog.
        const drawFrog = (x, y, s, body = '#5adb5a', shade = '#2f9e3f') => {
            ctx.fillStyle = body
            ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 8 * s)
            ctx.fillStyle = shade
            ctx.fillRect(x - 8 * s, y - 2 * s, 2 * s, 5 * s)
            ctx.fillRect(x + 6 * s, y - 2 * s, 2 * s, 5 * s)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x - 4 * s, y - 6 * s, 3 * s, 3 * s)
            ctx.fillRect(x + 1 * s, y - 6 * s, 3 * s, 3 * s)
            ctx.fillStyle = '#000000'
            ctx.fillRect(x - 3 * s, y - 5 * s, s + 1, s + 1)
            ctx.fillRect(x + 2 * s, y - 5 * s, s + 1, s + 1)
        }

        const drawCar = (x, w, h, color) => {
            ctx.fillStyle = color
            ctx.fillRect(x, h - 15, w, 13)
            ctx.fillStyle = '#111118'
            if (w > CELL * 1.5) {
                ctx.fillRect(x + 3, h - 13, 7, 8)
                ctx.fillStyle = color
                ctx.fillRect(x + 12, h - 17, w - 14, 15)
                ctx.fillStyle = '#111118'
                ctx.fillRect(x + w - 10, h - 14, 7, 8)
            } else {
                ctx.fillRect(x + w / 2 - 4, h - 13, 8, 8)
            }
            ctx.fillStyle = '#000000'
            ctx.fillRect(x + 3, h - 2, 5, 3)
            ctx.fillRect(x + w - 8, h - 2, 5, 3)
        }

        const drawLog = (x, w, h) => {
            ctx.fillStyle = '#7a4a1f'
            ctx.fillRect(x, h - 13, w, 12)
            ctx.fillStyle = '#5b3413'
            ctx.fillRect(x, h - 13, 3, 12)
            ctx.fillRect(x + w - 3, h - 13, 3, 12)
            ctx.fillStyle = '#9c6b33'
            for (let i = x + 6; i < x + w - 6; i += 9) ctx.fillRect(i, h - 9, 4, 1)
        }

        const drawTurtles = (x, w, h, up) => {
            if (!up) {
                ctx.fillStyle = 'rgba(255,255,255,0.45)'
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath()
                    ctx.arc(x + CELL / 2 + i * CELL, h - 6 + ((i % 2) * 3), 2, 0, Math.PI * 2)
                    ctx.fill()
                }
                return
            }
            const n = Math.round(w / CELL)
            for (let i = 0; i < n; i++) {
                const cx = x + CELL / 2 + i * CELL
                ctx.fillStyle = '#2f8f3f'
                ctx.beginPath()
                ctx.arc(cx, h - 7, 8, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = '#175a24'
                ctx.beginPath()
                ctx.arc(cx, h - 7, 5, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = '#79c96f'
                ctx.fillRect(cx - 1, h - 16, 2, 3)
            }
        }

        const HOUSE_COUNT = 5

        const draw = () => {
            const frog = gs.frog
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, H)

            // ---- homes row ----
            ctx.fillStyle = '#0b3d13'
            ctx.fillRect(0, rowMid(HOME_ROW) - CELL / 2, W, CELL)
            for (let i = 0; i < HOUSE_COUNT; i++) {
                const hx = [1, 4, 6, 8, 11][i] * CELL
                ctx.fillStyle = '#02160a'
                ctx.fillRect(hx + 1, rowMid(HOME_ROW) - CELL / 2 + 1, CELL - 2, CELL - 2)
                if (gs.houses[i].filled) {
                    drawFrog(hx + CELL / 2, rowMid(HOME_ROW) - 1, 0.8)
                } else if (gs.houses[i].fly && !gs.attract) {
                    ctx.fillStyle = '#ffe14d'
                    ctx.fillRect(hx + CELL / 2 - 2, rowMid(HOME_ROW) - 2, 4, 3)
                    ctx.fillStyle = '#ffffff'
                    ctx.fillRect(hx + CELL / 2 - 4, rowMid(HOME_ROW) - 4, 2, 2)
                }
            }

            // ---- river ----
            for (let r = RIVER_TOP; r <= RIVER_BOT; r++) {
                const y = rowMid(r)
                ctx.fillStyle = r % 2 ? '#12406e' : '#103758'
                ctx.fillRect(0, y - CELL / 2, W, CELL)
                ctx.fillStyle = 'rgba(255,255,255,0.07)'
                for (let i = 0; i < COLS; i++) ctx.fillRect(i * CELL + ((r * 7 + i * 11) % 12), y - 2 + (i % 3) * 4, 8, 1)
            }
            gs.riverLanes.forEach((lane, i) => {
                const y = rowMid(RIVER_TOP + i)
                spansOf(lane).forEach(s => {
                    if (s.x > W || s.x + s.w < 0) return
                    if (lane.kind === 'log') drawLog(s.x, s.w, y + CELL / 2)
                    else drawTurtles(s.x, s.w, y + CELL / 2, surfaced(lane))
                })
                // #3692 — the lady frog rides her log (drawn on top of it; the
                // player's frog may overlap her, as on the cabinet).
                if (gs.lady && gs.lady.lane === i) {
                    const sp = spansOf(lane)[gs.lady.idx]
                    if (sp && sp.x + sp.w > 0 && sp.x < W)
                        drawFrog(sp.x + sp.w / 2, y + CELL / 2 - 10, 0.5, '#ff8fc4', '#d1468f')
                }
            })

            // ---- median ----
            ctx.fillStyle = '#2c2c2c'
            ctx.fillRect(0, rowMid(MEDIAN_ROW) - CELL / 2, W, CELL)
            ctx.fillStyle = '#1e7a33'
            ctx.fillRect(0, rowMid(MEDIAN_ROW) - CELL / 2, W, 3)
            ctx.fillRect(0, rowMid(MEDIAN_ROW) + CELL / 2 - 3, W, 3)

            // ---- road ----
            for (let r = ROAD_TOP; r <= ROAD_BOT; r++) {
                const y = rowMid(r)
                ctx.fillStyle = '#232327'
                ctx.fillRect(0, y - CELL / 2, W, CELL)
                ctx.strokeStyle = '#4a4a52'
                ctx.setLineDash([6, 8])
                ctx.beginPath()
                ctx.moveTo(0, y + CELL / 2)
                ctx.lineTo(W, y + CELL / 2)
                ctx.stroke()
                ctx.setLineDash([])
            }
            const carColors = { 6: '#d8d8d8', 7: '#e0483f', 9: '#4f8fe0', 10: '#e0a03f' }
            Object.keys(gs.roadLanes).forEach(r => {
                const lane = gs.roadLanes[r]
                const y = rowMid(Number(r))
                spansOf(lane).forEach(s => {
                    if (s.x > W || s.x + s.w < 0) return
                    drawCar(s.x, s.w, y + CELL / 2, carColors[r] || '#cccccc')
                })
            })

            // ---- start strip ----
            ctx.fillStyle = '#1c3f1c'
            ctx.fillRect(0, rowMid(START_ROW) - CELL / 2, W, CELL)
            ctx.fillStyle = '#2f6b2f'
            for (let i = 0; i < COLS; i++) ctx.fillRect(i * CELL + 4, rowMid(START_ROW) - 2, 10, 3)

            // ---- frog ----
            let fx = frog.x
            let fy = rowMid(frog.row)
            if (frog.animT > 0 && frog.state === 'alive') {
                const p = 1 - frog.animT / HOP_ANIM
                fx = frog.prevX + (frog.x - frog.prevX) * p
                fy = rowMid(frog.prevRow) + (rowMid(frog.row) - rowMid(frog.prevRow)) * p - Math.sin(p * Math.PI) * 8
            }
            if (frog.state === 'alive' || frog.state === 'home') {
                if (frog.state === 'home') {
                    drawFrog([1, 4, 6, 8, 11][frog.homeCol] * CELL + CELL / 2, rowMid(HOME_ROW) - 1, 0.8)
                } else if (gs.freeze > 0) {
                    // #3676 — the row-entry spin while the field holds still.
                    ctx.save()
                    ctx.translate(fx, fy)
                    ctx.rotate((1 - gs.freeze / ROW_FREEZE) * Math.PI * 2)
                    drawFrog(0, 0, 1)
                    ctx.restore()
                } else {
                    drawFrog(fx, fy, 1)
                }
            } else if (frog.state === 'dying') {
                const p = 1 - frog.deadT / DIE_ANIM
                const st = deathStyle(frog.cause)
                ctx.lineWidth = 2
                if (st.kind === 'squash') {
                    ctx.fillStyle = st.color
                    ctx.fillRect(frog.x - 12 * p - 2, frog.row === 0 ? 0 : rowMid(frog.row) - 3, 24 * p + 4, 6)
                } else if (st.kind === 'splat') {
                    // off-board carry-off: a warm X that bursts at the bank edge
                    // — distinct from the water ring (#1508). The frog rides a log
                    // past the edge, so frog.x is off-canvas — clamp the burst to
                    // the shoreline so it is actually visible (#3703).
                    const yy = frog.row === 0 ? HUD_H + 6 : rowMid(frog.row)
                    const sx = bankEdgeX(frog.x)
                    const s = 4 + 9 * p
                    ctx.strokeStyle = st.color
                    ctx.beginPath()
                    ctx.moveTo(sx - s, yy - s); ctx.lineTo(sx + s, yy + s)
                    ctx.moveTo(sx + s, yy - s); ctx.lineTo(sx - s, yy + s)
                    ctx.stroke()
                } else {
                    ctx.strokeStyle = st.color
                    ctx.beginPath()
                    ctx.arc(frog.x, rowMid(frog.row), 3 + 10 * p, 0, Math.PI * 2)
                    ctx.stroke()
                }
            }

            // #3692 — she hitches a ride: pink rider on the carrier's back
            // (gone the moment the frog dies — resetFrog drops frog.lady).
            if (frog.state === 'alive' && frog.lady)
                drawFrog(fx, fy - 8, 0.45, '#ff8fc4', '#d1468f')

            // ---- HUD ----
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, HUD_H)
            ctx.font = 'bold 8px monospace'
            ctx.textAlign = 'left'
            if (gs.players === 2) {
                // #3676 — duel HUD: both scores shown at all times (the
                // alternating arcade's law); the active seat's line is bright.
                // #3692 §Scoring — five digits: the cabinet keeps only the last
                // five once 99,990 rolls over.
                const pad5 = n => String(Math.max(0, n) % SCORE_WRAP).padStart(5, '0')
                ctx.fillStyle = gs.player === 1 ? '#ffffff' : '#6f6f6f'
                ctx.fillText(`P1 ${pad5(gs.scores[0])}`, 6, 9)
                ctx.fillStyle = gs.player === 2 ? '#ffffff' : '#6f6f6f'
                ctx.fillText(`P2 ${pad5(gs.scores[1])}`, 6, 21)
                ctx.fillStyle = '#a9a9a9'
                ctx.fillText('HI', 78, 9)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(pad5(Math.max(gs.scores[0], gs.scores[1], hiScore)), 92, 9)
                ctx.fillStyle = '#a9a9a9'
                ctx.fillText('LV', 78, 21)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(String(gs.level), 92, 21)
            } else {
                ctx.fillStyle = '#a9a9a9'
                ctx.fillText('SCORE', 6, 9)
                ctx.fillText('HI-SCORE', 6, 21)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(String(gs.score % SCORE_WRAP).padStart(5, '0'), 40, 9)
                ctx.fillText(String(Math.max(gs.score, hiScore) % SCORE_WRAP).padStart(5, '0'), 60, 21)
                ctx.fillStyle = '#a9a9a9'
                ctx.fillText('LEVEL', 110, 9)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(String(gs.level), 142, 9)
            }
            ctx.fillStyle = '#a9a9a9'
            ctx.fillText('TIME', 110, 21)
            const tw = 104
            ctx.fillStyle = '#333333'
            ctx.fillRect(138, 15, tw, 5)
            const frac = Math.max(0, gs.timeLeft / TIME_LIMIT)
            ctx.fillStyle = frac < 0.25 ? '#e0483f' : '#ffe14d'
            ctx.fillRect(138, 15, tw * frac, 5)
            // #3692 — lives right-aligned: the bonus frog at 20k (§Scoring)
            // would otherwise push a fourth icon off the frame edge.
            const livesX0 = Math.min(206, W - 8 - (gs.lives - 1) * 17)
            for (let i = 0; i < gs.lives; i++) drawFrog(livesX0 + i * 17, 7, 0.4)

            if (gs.levelFlash > 0 && Math.floor(gs.levelFlash / 15) % 2 === 0) {
                ctx.fillStyle = '#ffe14d'
                ctx.font = 'bold 10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(`LEVEL ${gs.level - 1} COMPLETE  +1000`, W / 2, rowMid(MEDIAN_ROW) + 3)
            }
            // #3676 — seat banner at a 2P handoff (and at duel start).
            if (gs.banner > 0 && !gs.attract && !gs.over && Math.floor(gs.banner / 20) % 2 === 0) {
                ctx.fillStyle = '#ffe14d'
                ctx.font = 'bold 14px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(`PLAYER ${gs.player}`, W / 2, rowMid(MEDIAN_ROW) + 3)
            }

            if (gs.attract) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, HUD_H, W, H - HUD_H)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, W, H, HUD_H)) {
                    ctx.font = `bold ${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
            } else if (gs.over) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, HUD_H, W, H - HUD_H)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#e0483f'
                ctx.font = 'bold 20px monospace'
                ctx.fillText('GAME OVER', W / 2, H / 2 - 14)
                ctx.fillStyle = '#ffffff'
                ctx.font = 'bold 9px monospace'
                if (gs.players === 2) {
                    // #3676 — the duel's verdict: both scores, highest wins (0 = draw).
                    const pad5 = n => String(Math.max(0, n) % SCORE_WRAP).padStart(5, '0')
                    ctx.fillText(`P1 ${pad5(gs.scores[0])}   P2 ${pad5(gs.scores[1])}   LEVEL ${gs.level}`, W / 2, H / 2 + 6)
                    ctx.fillStyle = '#ffe14d'
                    ctx.fillText(gs.winner === 0 ? "IT'S A DRAW" : `PLAYER ${gs.winner} WINS`, W / 2, H / 2 + 22)
                    if (Math.floor(Date.now() / 500) % 2 === 0) {
                        ctx.fillStyle = '#ffe14d'
                        ctx.fillText('TAP OR PRESS ANY KEY', W / 2, H / 2 + 40)
                    }
                } else {
                    ctx.fillText(`SCORE ${gs.score}   LEVEL ${gs.level}`, W / 2, H / 2 + 6)
                    if (Math.floor(Date.now() / 500) % 2 === 0) {
                        ctx.fillStyle = '#ffe14d'
                        ctx.fillText('TAP OR PRESS ANY KEY', W / 2, H / 2 + 28)
                    }
                }
            }
        }

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, seed: seed, lives: gs.lives, level: gs.level,
        }))

        mountDbg({
            title: 'FROGGER',
            getState: () => [
                `score ${gs.score}  level ${gs.level}  lives ${gs.lives}  time ${gs.timeLeft}  over ${gs.over}`,
                `frog ${Math.round(gs.frog.x)},${gs.frog.row} state ${gs.frog.state} riding ${gs.frog.riding}`,
                `houses ${gs.houses.map(h => (h.filled ? 'F' : h.fly ? 'f' : '.')).join('')}  fly bonus live ${gs.houses.some(h => h.fly)}`,
                `seed ${seed}  tick ${gs.tickN}  watching ${gs.watching}`,
                `2P ${gs.players === 2}  seat P${gs.player}  scores ${gs.scores.join('/')}  winner ${gs.winner}  freeze ${gs.freeze}`,
            ],
            actions: [
                { label: 'Hop up', run: () => simHop(gs, 0, -1) },
                { label: 'Force game over', run: () => { gs.lives = 1; gs.frog.state = 'alive'; simHop(gs, 0, 0); gs.timeLeft = 1; } },
                { label: 'Start 2P duel', run: () => startGame(2) },
                { label: 'Kill P1 seat (handoff)', run: () => { if (gs.players === 2 && gs.player === 1) { gs.lives = 1; gs.frog.state = 'alive'; gs.frog.cause = 'wall'; gs.frog.deadT = 2 } } },
            ],
        })

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handlePointerDown)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__froggerTest) delete window.__froggerTest
            unexposeGame()
            unexposeFeedbackState()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[420px] h-full max-h-[460px] flex items-center justify-center border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'FROGGER')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. bottom:'24%' is the
                    harness-pinned clear-band-above-the-pad law (watchphonecheck) — do not "improve"
                    this without changing that check first (#3436). */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b25 — the planner crosses the roads and river; any key, pad push or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls visible={!paused} />
        </div>
    )
}

export default FroggerGame

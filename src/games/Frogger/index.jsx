import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { attractFrame, DIM } from './attract.js'
import {
    CELL, COLS, W, HOME_ROW, RIVER_TOP, RIVER_BOT, MEDIAN_ROW, ROAD_TOP, ROAD_BOT, START_ROW,
    TIME_LIMIT, HOP_ANIM, DIE_ANIM, DIVE_CYCLE,
    makeRun, tickFrogger, hop as simHop, supportAt as simSupportAt, spansOf, surfaced, houseAt, deathStyle, stateHash,
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
            } else {
                audioController.playSweep(320, 60, 0.35, 'sawtooth', 0.15)
                audioController.playNoise(0.25, 0.15)
            }
        }
        const playHome = fly => {
            audioController.playSweep(330, 660, 0.2, 'square', 0.1)
            if (fly) audioController.playTone(1568, 0.1, 'square', 0.1)
        }

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

        const startGame = () => {
            // every human start regenerates the seed (?seed=N wins) — the
            // attract demo never spends the run's traffic (#1473)
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            gs = makeRun(seed)
            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands
            setWatching(false)
            audioController.playSweep(220, 440, 0.15, 'square', 0.1)
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
            if (gs.attract) { startGame(); return }
            if (gs.over) { startGame(); return }
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
                else if (r?.kind === 'home') playHome(r.fly)
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
            if (ev.died) playDie(ev.died)
            if (ev.home) playHome(ev.fly)
            if (ev.beep) audioController.playTone(1000, 0.04, 'square', 0.08)
            if (ev.level) audioController.playSweep(440, 1320, 0.6, 'square', 0.12)
            if (ev.over && !gs.attract) {
                if (gs.score > hiScore) {
                    hiScore = gs.score
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
                    riding: gs.frog.riding, atHouse: houseAt(gs.frog.x) >= 0 && !gs.houses[houseAt(gs.frog.x)].filled
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
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: gs.rand is a closure that cannot JSON
            // round-trip (#391 — optional half of the contract).
        })

        // ------------------------------------------------------------------
        // DRAWING
        // ------------------------------------------------------------------
        const drawFrog = (x, y, s) => {
            ctx.fillStyle = '#5adb5a'
            ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 8 * s)
            ctx.fillStyle = '#2f9e3f'
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
                    // off-board: a warm X that bursts — distinct from the water ring (#1508)
                    const yy = frog.row === 0 ? HUD_H + 6 : rowMid(frog.row)
                    const s = 4 + 9 * p
                    ctx.strokeStyle = st.color
                    ctx.beginPath()
                    ctx.moveTo(frog.x - s, yy - s); ctx.lineTo(frog.x + s, yy + s)
                    ctx.moveTo(frog.x + s, yy - s); ctx.lineTo(frog.x - s, yy + s)
                    ctx.stroke()
                } else {
                    ctx.strokeStyle = st.color
                    ctx.beginPath()
                    ctx.arc(frog.x, rowMid(frog.row), 3 + 10 * p, 0, Math.PI * 2)
                    ctx.stroke()
                }
            }

            // ---- HUD ----
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, HUD_H)
            ctx.font = 'bold 8px monospace'
            ctx.textAlign = 'left'
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('SCORE', 6, 9)
            ctx.fillText('HI-SCORE', 6, 21)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(String(gs.score).padStart(6, '0'), 40, 9)
            ctx.fillText(String(Math.max(gs.score, hiScore)).padStart(6, '0'), 60, 21)
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('LEVEL', 110, 9)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(String(gs.level), 142, 9)
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('TIME', 110, 21)
            const tw = 104
            ctx.fillStyle = '#333333'
            ctx.fillRect(138, 15, tw, 5)
            const frac = Math.max(0, gs.timeLeft / TIME_LIMIT)
            ctx.fillStyle = frac < 0.25 ? '#e0483f' : '#ffe14d'
            ctx.fillRect(138, 15, tw * frac, 5)
            for (let i = 0; i < gs.lives; i++) drawFrog(206 + i * 17, 7, 0.4)

            if (gs.levelFlash > 0 && Math.floor(gs.levelFlash / 15) % 2 === 0) {
                ctx.fillStyle = '#ffe14d'
                ctx.font = 'bold 10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(`LEVEL ${gs.level - 1} COMPLETE  +1000`, W / 2, rowMid(MEDIAN_ROW) + 3)
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
                ctx.fillText(`SCORE ${gs.score}   LEVEL ${gs.level}`, W / 2, H / 2 + 6)
                if (Math.floor(Date.now() / 500) % 2 === 0) {
                    ctx.fillStyle = '#ffe14d'
                    ctx.fillText('TAP OR PRESS ANY KEY', W / 2, H / 2 + 28)
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
            ],
            actions: [
                { label: 'Hop up', run: () => simHop(gs, 0, -1) },
                { label: 'Force game over', run: () => { gs.lives = 1; gs.frog.state = 'alive'; simHop(gs, 0, 0); gs.timeLeft = 1; } },
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
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '10%' }}>
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

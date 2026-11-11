import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { serveBall, paddleStart, tickPong, BASE_SPEED, PADDLE_HEIGHT } from './sim.js'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'

// PONG (#1473 batch 16) — the Feb port had no terminal, no restart and dice
// off Math.random. Restored: one seeded stream per run (serve dir/angle,
// paddle starts, paddle-hit spin), play-to-quit terminal (`q`/Escape, per the
// 1972 machine having no enforced cap), fresh-score starts from any key,
// click or tap, report {tick,score,done,seed,opp} and the QA contract.
// #1637 batch 24 — the per-tick rules lifted into sim.js (tickPong) so the
// harness proves the SHIPPED physics, and the seat: Y hands the left paddle
// to watchStep, the predictive intercept driver pongcheck sweeps 5-0 across
// seeds. Reactive (Rogue law): seats anywhere, steer takes over, re-seat
// re-plans from the live state, quit releases with the match.
const PongGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const [watching, setWatching] = React.useState(false)
    const [screen, setScreen] = React.useState('attract')

    // Resume callback
    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // Game state — the shape IS sim.js's gs (tickPong mutates it in
        // place; the rand stream rides along so a scored point's re-serve
        // draws from the same seeded dice).
        const state = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            left: { y: 0, score: 0 },
            right: { y: 0, score: 0 },
            width: 0,
            height: 0,
            over: false,
            watching: false,
            rand: null,
        }

        // #1473: one seeded stream per run. seed is regenerated at every
        // human start; ?seed=N pins it (the reported seed replays the match).
        let seed = Math.floor(Math.random() * 1000000)
        state.rand = seedRng(seed)
        let tickN = 0
        let hitN = 0
        let isAttractMode = true
        const resetBall = () => {
            state.ball = serveBall(state.rand, state.width, state.height)
            // Randomize paddle positions (on the run's stream)
            state.left.y = paddleStart(state.rand, state.height)
            state.right.y = paddleStart(state.rand, state.height)
        }

        // Fresh match: score zero, stream regenerated honoring ?seed=N.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            state.rand = seedRng(seed)
            state.left.score = 0
            state.right.score = 0
            state.over = false
            hitN = 0
            release(false) // a fresh match starts under your own feet
            isAttractMode = false
            setScreen('play')
            resetBall()
        }

        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                state.width = width
                state.height = height

                // Only reset ball if it's off screen or initialized at 0,0
                if (state.ball.x === 0 && state.ball.y === 0) {
                    resetBall()
                }
            }
        }

        // INPUT
        let attractTick = 0
        const keys = { ArrowUp: false, ArrowDown: false }

        // #1637 b24 — the seat. watchStep is reactive against live state
        // (Rogue law), so the seat is honest from any rally state: seat
        // anywhere, steer to take over, re-seat re-plans from here.
        const seat = () => {
            state.watching = true
            setWatching(true)
            playWatchStart()
        }
        const release = (blip = true) => {
            state.watching = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            // WATCH (b24): Y toggles the proven driver. On attract/quit it
            // starts a fresh match AND seats — the route exists from tick 0.
            if (isWatchKey(e)) {
                if (isAttractMode || state.over) { startRun(); seat(); return }
                if (state.watching) release(); else seat()
                return
            }
            if (state.over) { startRun(); return }
            if (isAttractMode) { startRun(); return }
            // play-to-quit terminal (#1473): the machine had no cap, so a quit
            // press ends the match honestly and the score stays visible.
            if (e.code === 'KeyQ' || e.code === 'Escape') {
                state.over = true
                release(false) // the match ended — the guide ends with it, silent
                setScreen('over')
                audioController.playTone(160, 0.25, 'sawtooth')
                return
            }
            if (state.watching && isTakeoverKey(e)) release()
            if (keys[e.code] !== undefined) keys[e.code] = true
        }

        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        // Phones: any tap starts a fresh match (tap-to-start) or restarts after quit.
        // A tap DURING a watched rally is a takeover (the watch contract).
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (state.over || isAttractMode) startRun()
            else if (state.watching) release()
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)
        resize() // Initial sizing

        const update = () => {
            tickN++
            if (state.over) return
            const ev = tickPong(state, { up: keys.ArrowUp, down: keys.ArrowDown })
            if (ev.wall) audioController.playTone(300, 0.05, 'square')
            if (ev.hitL || ev.hitR) audioController.playTone(400, 0.1, 'square')
            if (ev.scored) audioController.playTone(200, 0.2, 'sawtooth')
            if (ev.hitL) hitN++ // proof of interception for the pilot (b24)
        }

        const draw = () => {
            // Clear background (Black)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, state.width, state.height)

            ctx.fillStyle = '#ffffff'

            // Draw Paddles
            ctx.fillRect(20, state.left.y, 10, PADDLE_HEIGHT)
            ctx.fillRect(state.width - 20 - 10, state.right.y, 10, PADDLE_HEIGHT)

            // Draw Ball
            ctx.fillRect(state.ball.x, state.ball.y, 8, 8)

            // Draw Net (Optional dashed line)
            ctx.beginPath()
            ctx.setLineDash([10, 15])
            ctx.moveTo(state.width / 2, 0)
            ctx.lineTo(state.width / 2, state.height)
            ctx.strokeStyle = '#333333' // Very subtle net (dark grey)
            ctx.stroke()

            // Score numerals — the original's big faint digits, kept on screen
            // through the quit screen like the table kept showing them.
            ctx.textAlign = 'center'
            if (isAttractMode) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, state.width, state.height)
                for (const l of attractFrame(attractTick, state.width, state.height)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                // #1656 discoverability, drawn here (not in attract.js) the way
                // GravelYard does it — the rule-6 audit owns the cycling lines.
                ctx.font = '11px monospace'
                ctx.fillStyle = '#7dd39a'
                ctx.fillText(WATCH_ATTRACT_HINT, state.width / 2, state.height * 0.66)
            } else {
                // Game Score
                ctx.font = '40px monospace'
                ctx.fillStyle = '#333333'
                ctx.fillText(state.left.score, state.width / 4, 50)
                ctx.fillText(state.right.score, 3 * state.width / 4, 50)
                if (state.over && Math.floor(tickN / 30) % 2 === 0) {
                    ctx.font = '16px monospace'
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText('MATCH OVER  YOU WIN', state.width / 2, state.height / 2)
                    ctx.font = '12px monospace'
                    ctx.fillText('PRESS ANY KEY TO PLAY AGAIN', state.width / 2, state.height / 2 + 24)
                }
            }
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                accumulator += frameTime
                while (accumulator >= FIXED_DT) {
                    update()
                    accumulator -= FIXED_DT
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        // QA contract (#377): deterministic reset/tick/state so bots and
        // replays drive this table like every other title.
        exposeGame({
            id: 'pong',
            buttons: ['up', 'down'],
            reset: (s) => {
                seed = s >>> 0
                state.rand = seedRng(seed)
                state.left.score = 0
                state.right.score = 0
                state.over = false
                hitN = 0
                release(false)
                isAttractMode = false
                setScreen('play')
                keys.ArrowUp = keys.ArrowDown = false
                if (state.width > 0) resetBall()
            },
            tick: (pad) => {
                if (state.over) { tickN += 1; return }
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                update()
            },
            state: () => ({
                tick: tickN,
                score: state.left.score,
                done: state.over,
                seed: seed,
                opp: state.right.score,
                ballX: Math.round(state.ball.x),
                ballY: Math.round(state.ball.y),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded rand closure cannot JSON
            // round-trip (#391 — optional half of the contract).
        })

        // #1637 b24 — DEV probes: seat state + the shared blip log, and a
        // rally probe the watchcheck pilot advances against.
        if (import.meta.env.DEV) {
            window.__pongTest = {
                watching: () => state.watching,
                watchSfx: watchSfxLog,
                start: startRun,
                probe: () => ({
                    tick: tickN,
                    hits: hitN,
                    score: state.left.score,
                    opp: state.right.score,
                    ballX: Math.round(state.ball.x),
                    ballY: Math.round(state.ball.y),
                    leftY: Math.round(state.left.y),
                    rightY: Math.round(state.right.y),
                    dl: Math.round(Math.abs(state.left.y + PADDLE_HEIGHT / 2 - (state.ball.y + 4))),
                }),
            }
        }

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score: state.left.score, done: state.over, seed: seed, opp: state.right.score,
        }))

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeGame()
            unexposeFeedbackState()
            if (import.meta.env.DEV) delete window.__pongTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PONG')} onResume={handleResume} />}
                {watching && screen !== 'attract' && <WatchToast className="absolute z-50" />}
                {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
                {screen === 'attract' && (
                    <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                        <AttractWatchButton />
                    </div>
                )}
                {screen === 'play' && !paused && (
                    <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} disabled={false} />
                    </div>
                )}
            </div>
            <VirtualControls />
        </div>
    )
}

export default PongGame

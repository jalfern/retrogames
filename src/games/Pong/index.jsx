import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { serveBall, paddleStart, paddleSpin, BASE_SPEED, AI_SPEED, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_SIZE, PADDLE_OFFSET } from './sim.js'

// PONG (#1473 batch 16) — the Feb port had no terminal, no restart and dice
// off Math.random. Restored: one seeded stream per run (serve dir/angle,
// paddle starts, paddle-hit spin), play-to-quit terminal (`q`/Escape, per the
// 1972 machine having no enforced cap), fresh-score starts from any key,
// click or tap, report {tick,score,done,seed,opp} and the QA contract.
const PongGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

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

        // Game state
        let state = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            leftPaddle: { y: 0, score: 0 },
            rightPaddle: { y: 0, score: 0 },
            width: 0,
            height: 0
        }

        // #1473: one seeded stream per run. seed is regenerated at every
        // human start; ?seed=N pins it (the reported seed replays the match).
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let tickN = 0
        let isAttractMode = true
        let over = false
        const resetBall = () => {
            state.ball = serveBall(rand, state.width, state.height)
            // Randomize paddle positions (on the run's stream)
            state.leftPaddle.y = paddleStart(rand, state.height)
            state.rightPaddle.y = paddleStart(rand, state.height)
        }

        // Fresh match: score zero, stream regenerated honoring ?seed=N.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            state.leftPaddle.score = 0
            state.rightPaddle.score = 0
            over = false
            isAttractMode = false
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

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (over) { startRun(); return }
            if (isAttractMode) { startRun(); return }
            // play-to-quit terminal (#1473): the machine had no cap, so a quit
            // press ends the match honestly and the score stays visible.
            if (e.code === 'KeyQ' || e.code === 'Escape') {
                over = true
                audioController.playTone(160, 0.25, 'sawtooth')
                return
            }
            if (keys[e.code] !== undefined) keys[e.code] = true
        }

        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        // Phones: any tap starts a fresh match (tap-to-start) or restarts after quit.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (over || isAttractMode) startRun()
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)
        resize() // Initial sizing

        const update = () => {
            tickN++
            if (over) return

            // Move ball
            state.ball.x += state.ball.dx
            state.ball.y += state.ball.dy

            // Wall collisions (Top/Bottom)
            if (state.ball.y <= 0 || state.ball.y + BALL_SIZE >= state.height) {
                state.ball.dy *= -1
                audioController.playTone(300, 0.05, 'square')
            }

            // AI Logic (Simple tracking)
            // Left Paddle
            if (isAttractMode) {
                const leftCenter = state.leftPaddle.y + PADDLE_HEIGHT / 2
                if (leftCenter < state.ball.y - 10) {
                    state.leftPaddle.y += AI_SPEED
                } else if (leftCenter > state.ball.y + 10) {
                    state.leftPaddle.y -= AI_SPEED
                }
            } else {
                // Manual Control
                if (keys.ArrowUp) state.leftPaddle.y -= BASE_SPEED * 1.5
                if (keys.ArrowDown) state.leftPaddle.y += BASE_SPEED * 1.5
            }

            // Right Paddle
            const rightCenter = state.rightPaddle.y + PADDLE_HEIGHT / 2
            if (rightCenter < state.ball.y - 10) {
                state.rightPaddle.y += AI_SPEED
            } else if (rightCenter > state.ball.y + 10) {
                state.rightPaddle.y -= AI_SPEED
            }

            // Clamp paddles
            state.leftPaddle.y = Math.max(0, Math.min(state.height - PADDLE_HEIGHT, state.leftPaddle.y))
            state.rightPaddle.y = Math.max(0, Math.min(state.height - PADDLE_HEIGHT, state.rightPaddle.y))

            // Paddle Collisions
            // Left
            if (
                state.ball.x <= PADDLE_OFFSET + PADDLE_WIDTH &&
                state.ball.x >= PADDLE_OFFSET &&
                state.ball.y + BALL_SIZE >= state.leftPaddle.y &&
                state.ball.y <= state.leftPaddle.y + PADDLE_HEIGHT
            ) {
                state.ball.dx *= -1.05 // Slight speed up
                state.ball.x = PADDLE_OFFSET + PADDLE_WIDTH + 1 // Push out to avoid sticking
                // Add slight vertical randomness to prevent loops (seeded spin)
                state.ball.dy += paddleSpin(rand)
                audioController.playTone(400, 0.1, 'square')
            }

            // Right
            if (
                state.ball.x + BALL_SIZE >= state.width - PADDLE_OFFSET - PADDLE_WIDTH &&
                state.ball.x + BALL_SIZE <= state.width - PADDLE_OFFSET &&
                state.ball.y + BALL_SIZE >= state.rightPaddle.y &&
                state.ball.y <= state.rightPaddle.y + PADDLE_HEIGHT
            ) {
                state.ball.dx *= -1.05
                state.ball.x = state.width - PADDLE_OFFSET - PADDLE_WIDTH - BALL_SIZE - 1
                state.ball.dy += paddleSpin(rand) // seeded spin
                audioController.playTone(400, 0.1, 'square')
            }

            // Scoring (Ball goes off screen)
            if (state.ball.x < 0) {
                state.rightPaddle.score++
                resetBall()
                audioController.playTone(200, 0.2, 'sawtooth')
            } else if (state.ball.x > state.width) {
                state.leftPaddle.score++
                resetBall()
                audioController.playTone(200, 0.2, 'sawtooth')
            }
        }

        const draw = () => {
            // Clear background (Black)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, state.width, state.height)

            ctx.fillStyle = '#ffffff'

            // Draw Paddles
            ctx.fillRect(PADDLE_OFFSET, state.leftPaddle.y, PADDLE_WIDTH, PADDLE_HEIGHT)
            ctx.fillRect(state.width - PADDLE_OFFSET - PADDLE_WIDTH, state.rightPaddle.y, PADDLE_WIDTH, PADDLE_HEIGHT)

            // Draw Ball
            ctx.fillRect(state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE)

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
            } else {
                // Game Score
                ctx.font = '40px monospace'
                ctx.fillStyle = '#333333'
                ctx.fillText(state.leftPaddle.score, state.width / 4, 50)
                ctx.fillText(state.rightPaddle.score, 3 * state.width / 4, 50)
                if (over && Math.floor(tickN / 30) % 2 === 0) {
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
                rand = seedRng(seed)
                state.leftPaddle.score = 0
                state.rightPaddle.score = 0
                over = false
                isAttractMode = false
                keys.ArrowUp = keys.ArrowDown = false
                if (state.width > 0) resetBall()
            },
            tick: (pad) => {
                if (over) { tickN += 1; return }
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                update()
            },
            state: () => ({
                tick: tickN,
                score: state.leftPaddle.score,
                done: over,
                seed: seed,
                opp: state.rightPaddle.score,
                ballX: Math.round(state.ball.x),
                ballY: Math.round(state.ball.y),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded rand closure cannot JSON
            // round-trip (#391 — optional half of the contract).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score: state.leftPaddle.score, done: over, seed: seed, opp: state.rightPaddle.score,
        }))

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeGame()
            unexposeFeedbackState()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PONG')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default PongGame

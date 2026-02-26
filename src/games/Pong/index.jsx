import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

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

        // Game constants
        const PADDLE_WIDTH = 10
        const PADDLE_HEIGHT = 80
        const BALL_SIZE = 8
        const PADDLE_OFFSET = 20
        const BASE_SPEED = 4
        const AI_SPEED = 3.5

        // Game state
        let state = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            leftPaddle: { y: 0, score: 0 },
            rightPaddle: { y: 0, score: 0 },
            width: 0,
            height: 0
        }

        const resetBall = () => {
            state.ball = {
                x: state.width / 2,
                y: state.height / 2,
                dx: (Math.random() > 0.5 ? 1 : -1) * BASE_SPEED,
                dy: (Math.random() * 2 - 1) * BASE_SPEED
            }
            // Randomize paddle positions
            const maxPaddleY = state.height - PADDLE_HEIGHT
            state.leftPaddle.y = Math.random() * maxPaddleY
            state.rightPaddle.y = Math.random() * maxPaddleY
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
        let isAttractMode = true
        const keys = { ArrowUp: false, ArrowDown: false }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode) {
                isAttractMode = false;
                // Reset score? Maybe
            }
            if (keys[e.code] !== undefined) keys[e.code] = true
        }

        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        resize() // Initial sizing

        const update = () => {
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
                // Add slight vertical randomness to prevent loops
                state.ball.dy += (Math.random() * 4 - 2) // Increased spin
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
                state.ball.dy += (Math.random() * 4 - 2) // Increased spin
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

            // Draw minimal score (optional, keep it clean)
            ctx.font = '40px monospace'
            ctx.textAlign = 'center'
            if (isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.fillText("PRESS ARROW KEYS TO START", state.width / 2, state.height / 2)
                ctx.fillText("ATTRACT MODE", state.width / 2, state.height / 2 - 50)
            } else {
                // Game Score
                ctx.fillStyle = '#333333'
                ctx.fillText(state.leftPaddle.score, state.width / 4, 50)
                ctx.fillText(state.rightPaddle.score, 3 * state.width / 4, 50)
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

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
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

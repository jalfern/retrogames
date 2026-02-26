import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const SpaceInvadersGame = () => {
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

        // Constants
        const PLAYER_WIDTH = 30
        const PLAYER_HEIGHT = 15
        const INVADER_WIDTH = 25
        const INVADER_HEIGHT = 20
        const BASE_SPEED = 2
        const BULLET_SPEED = 5
        const INVADER_SPEED = 1

        // Game State
        let state = {
            width: 0,
            height: 0,
            player: { x: 0, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, bullets: [], cooldown: 0 },
            invaders: [], // {x, y, active}
            invaderDir: 1, // 1 for right, -1 for left
            enemyBullets: [],
            score: 0
        }

        // Initialize logic
        const initGame = () => {
            state.player.x = state.width / 2 - PLAYER_WIDTH / 2

            // Create grid of invaders
            state.invaders = []
            const rows = 4
            const cols = 8
            const startX = state.width * 0.1
            const startY = 50

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    state.invaders.push({
                        x: startX + c * (INVADER_WIDTH + 15),
                        y: startY + r * (INVADER_HEIGHT + 15),
                        width: INVADER_WIDTH,
                        height: INVADER_HEIGHT,
                        active: true
                    })
                }
            }
            state.invaderDir = 1
            state.enemyBullets = []
            state.player.bullets = []
        }

        let initialized = false
        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                if (width === 0 || height === 0) return
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                state.width = width
                state.height = height
                if (!initialized) {
                    initGame()
                    initialized = true
                }
            }
        }

        // INPUT
        let isAttractMode = true
        const keys = { ArrowLeft: false, ArrowRight: false, Space: false }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode) {
                isAttractMode = false
                initGame() // Optional: restart on take over
            }
            if (keys[e.code] !== undefined) keys[e.code] = true
            if (e.code === 'Space' && !isAttractMode) {
                // Manual Fire
                if (state.player.cooldown <= 0) {
                    state.player.bullets.push({
                        x: state.player.x + PLAYER_WIDTH / 2 - 2,
                        y: state.height - PLAYER_HEIGHT - 10,
                        w: 4, h: 10
                    })
                    state.player.cooldown = 40
                    audioController.playTone(800, 0.05, 'square', 0.1)
                }
            }
        }

        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        resize()

        const update = () => {
            let moveDir = 0

            if (isAttractMode) {
                // --- PLAYER AI ---
                // 1. Dodge: Check for incoming bullets
                // Find closest dangerous bullet
                const dangerousBullet = state.enemyBullets
                    .filter(b => b.y > state.height - 200 && Math.abs(b.x - (state.player.x + PLAYER_WIDTH / 2)) < 50)
                    .sort((a, b) => b.y - a.y)[0] // closest to bottom

                if (dangerousBullet) {
                    // Move away from bullet
                    if (dangerousBullet.x > state.player.x + PLAYER_WIDTH / 2) {
                        moveDir = -1 // Left
                    } else {
                        moveDir = 1 // Right
                    }
                } else {
                    // 2. Attack: Track nearest active invader column
                    const activeInvaders = state.invaders.filter(i => i.active)
                    if (activeInvaders.length > 0) {
                        const targetX = activeInvaders[Math.floor(Date.now() / 1000) % activeInvaders.length].x
                        if (targetX > state.player.x + PLAYER_WIDTH / 2 + 10) moveDir = 1
                        else if (targetX < state.player.x + PLAYER_WIDTH / 2 - 10) moveDir = -1
                    }
                }

                // AI Shooting
                if (state.player.cooldown <= 0) {
                    const center = state.player.x + PLAYER_WIDTH / 2
                    const aligned = state.invaders.some(i => i.active && Math.abs(i.x + INVADER_WIDTH / 2 - center) < 15)
                    if (aligned) {
                        state.player.bullets.push({
                            x: state.player.x + PLAYER_WIDTH / 2 - 2,
                            y: state.height - PLAYER_HEIGHT - 10,
                            w: 4, h: 10
                        })
                        state.player.cooldown = 40
                        audioController.playTone(800, 0.05, 'square', 0.1)
                    }
                }

            } else {
                // --- MANUAL CONTROL ---
                if (keys.ArrowLeft) moveDir = -1
                if (keys.ArrowRight) moveDir = 1
            }

            // Apply Movement
            state.player.x += moveDir * BASE_SPEED
            // Clamp
            state.player.x = Math.max(10, Math.min(state.width - PLAYER_WIDTH - 10, state.player.x))

            // Cooldown logic
            if (state.player.cooldown > 0) state.player.cooldown--

            // Note: Manual shooting is handled in handleKeyDown for semi-auto feel, 
            // or we could add continuous fire here if Space is held.
            // Space Invaders usually is semi-auto (one shot at a time often, or slow fire).
            // Let's stick to keydown for manual fire.

            // --- UPDATE ENTITIES ---

            // Player Bullets
            state.player.bullets.forEach(b => b.y -= BULLET_SPEED)
            state.player.bullets = state.player.bullets.filter(b => b.y > 0)

            // Enemy Bullets
            state.enemyBullets.forEach(b => b.y += BULLET_SPEED)
            state.enemyBullets = state.enemyBullets.filter(b => b.y < state.height)

            // Invaders Movement
            let hitEdge = false
            // Find bounds
            const activeInvaders = state.invaders.filter(i => i.active)
            if (activeInvaders.length === 0) {
                // Reset if won
                initGame()
                return
            }

            const minX = Math.min(...activeInvaders.map(i => i.x))
            const maxX = Math.max(...activeInvaders.map(i => i.x + i.width))

            if ((maxX >= state.width - 20 && state.invaderDir === 1) ||
                (minX <= 20 && state.invaderDir === -1)) {
                state.invaderDir *= -1
                // Move down
                state.invaders.forEach(i => i.y += 20)

                // Reset if too low (Game Over scenario -> restart)
                if (Math.max(...activeInvaders.map(i => i.y)) > state.height - 100) {
                    initGame()
                    return
                }
            } else {
                state.invaders.forEach(i => i.x += state.invaderDir * INVADER_SPEED)
            }

            // Invader Shooting
            if (Math.random() < 0.02 && activeInvaders.length > 0) {
                const shooter = activeInvaders[Math.floor(Math.random() * activeInvaders.length)]
                state.enemyBullets.push({
                    x: shooter.x + INVADER_WIDTH / 2 - 2,
                    y: shooter.y + INVADER_HEIGHT,
                    w: 4, h: 10
                })
            }

            // --- COLLISIONS ---

            // Player Bullets hitting Invaders
            state.player.bullets.forEach((b, bIdx) => {
                state.invaders.forEach(inv => {
                    if (!inv.active) return
                    if (b.x < inv.x + inv.width &&
                        b.x + b.w > inv.x &&
                        b.y < inv.y + inv.height &&
                        b.y + b.h > inv.y) {
                        inv.active = false
                        // Remove bullet (hacky splice)
                        b.y = -100
                        audioController.playNoise(0.1, 0.1)
                    }
                })
            })

            // Enemy Bullets hitting Player
            state.enemyBullets.forEach(b => {
                if (b.x < state.player.x + state.player.width &&
                    b.x + b.w > state.player.x &&
                    b.y < state.height - 20 && // Assuming player Y fixed near bottom
                    b.y + b.h > state.height - 20 - state.player.height) {
                    // Player hit -> restart
                    initGame()
                    audioController.playNoise(0.5, 0.3)
                }
            })
        }

        const draw = () => {
            // Clear
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, state.width, state.height)

            ctx.fillStyle = '#00ff00' // Classic Green for Player

            // Player
            ctx.fillRect(state.player.x, state.height - PLAYER_HEIGHT - 20, state.player.width, state.player.height)
            // Player "cannon"
            ctx.fillRect(state.player.x + state.player.width / 2 - 2, state.height - PLAYER_HEIGHT - 25, 4, 5)

            // Invaders
            ctx.fillStyle = '#ffffff' // White Invaders
            state.invaders.forEach(i => {
                if (i.active) {
                    // Simple alien shape (rectangle with gaps?)
                    // Just rectangle for minimalism
                    ctx.fillRect(i.x, i.y, i.width, i.height)
                    // Eyes (Black)
                    ctx.clearRect(i.x + 5, i.y + 5, 4, 4)
                    ctx.clearRect(i.x + i.width - 9, i.y + 5, 4, 4)
                }
            })

            // Bullets
            ctx.fillStyle = '#00ff00' // Green Player Bullets
            state.player.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h))

            // Enemy Bullets
            // Enemy Bullets
            ctx.fillStyle = '#ff0000' // Red Enemy Bullets
            state.enemyBullets.forEach(b => {
                // Cross shape or zig zag? Just simple rect
                ctx.fillRect(b.x, b.y, b.w, b.h)
            })

            if (isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", state.width / 2, state.height / 2)
                ctx.fillText("ATTRACT MODE", state.width / 2, state.height / 2 - 40)
            }
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!initialized) {
                resize()
            }
            if (!pausedRef.current && initialized) {
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
                <canvas ref={canvasRef} className="block w-full h-full" style={{ background: 'black' }} />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SPACE INVADERS')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default SpaceInvadersGame

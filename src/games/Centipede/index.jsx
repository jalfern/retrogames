import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const CentipedeGame = () => {
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

        // Game Constants
        const CELL_SIZE = 16
        const COLS = 30
        const ROWS = 30
        const PLAYER_SPEED = 4
        const BULLET_SPEED = 8
        const CENTIPEDE_SPEED = 2

        let state = {
            width: 0,
            height: 0,
            player: { x: 0, y: 0, w: 16, h: 16, dead: false },
            bullets: [],
            mushrooms: [], // {x, y, health}
            centipedes: [], // Array of Segments {x, y, vx, vy, head}
            score: 0,
            frame: 0
        }

        const init = () => {
            // Player Start
            state.player.x = state.width / 2
            state.player.y = state.height - 30

            // Random Mushrooms
            state.mushrooms = []
            for (let i = 0; i < 40; i++) {
                const mx = Math.floor(Math.random() * (state.width / CELL_SIZE)) * CELL_SIZE
                const my = Math.floor(Math.random() * (state.height / CELL_SIZE - 5)) * CELL_SIZE + 50
                state.mushrooms.push({ x: mx, y: my, health: 3 })
            }

            // Spawn Centipede (1 Head + 9 Body)
            spawnCentipede()
        }

        const spawnCentipede = () => {
            state.centipedes = []
            // Head
            state.centipedes.push({ x: state.width / 2, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: true })
            // Body
            for (let i = 1; i < 10; i++) {
                state.centipedes.push({ x: state.width / 2 - i * CELL_SIZE, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: false })
            }
        }

        let initialized = false
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
                if (!initialized) {
                    init()
                    initialized = true
                }
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // Input
        let isAttractMode = true
        let keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Space: false }
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
                // Reset keys
                Object.keys(keys).forEach(k => keys[k] = false)
            }
            if (keys[e.code] !== undefined) keys[e.code] = true
            if (e.code === 'Space') {
                if (state.player.dead) init();
                else fireBullet();
            }
        }
        const handleUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleUp)

        const fireBullet = () => {
            if (state.bullets.length < 3) { // Limit bullets
                state.bullets.push({
                    x: state.player.x + 8,
                    y: state.player.y,
                    vx: 0,
                    vy: -BULLET_SPEED
                })
                audioController.playTone(600, 0.05, 'square')
            }
        }

        const update = () => {
            state.frame++
            if (state.player.dead) {
                if (isAttractMode && state.frame % 120 === 0) init() // Auto restart in attract mode
                return
            }

            // --- AI LOGIC ---
            if (isAttractMode) {
                // Find lowest centipede
                let target = null
                let maxY = -1
                state.centipedes.forEach(c => {
                    if (c.y > maxY) {
                        maxY = c.y
                        target = c
                    }
                })

                if (target) {
                    const dx = target.x - state.player.x
                    if (Math.abs(dx) > 4) {
                        if (dx > 0) { keys.ArrowRight = true; keys.ArrowLeft = false }
                        else { keys.ArrowLeft = true; keys.ArrowRight = false }
                    } else {
                        keys.ArrowRight = false; keys.ArrowLeft = false
                        // Fire
                        if (state.frame % 10 === 0) fireBullet()
                    }
                }
            }

            // Player Move
            if (keys.ArrowLeft) state.player.x -= PLAYER_SPEED
            if (keys.ArrowRight) state.player.x += PLAYER_SPEED
            if (keys.ArrowUp) state.player.y -= PLAYER_SPEED
            if (keys.ArrowDown) state.player.y += PLAYER_SPEED

            // Clamp Player to bottom area
            const safeZone = state.height - 150
            if (state.player.y < safeZone) state.player.y = safeZone
            if (state.player.y > state.height - 16) state.player.y = state.height - 16
            if (state.player.x < 0) state.player.x = 0
            if (state.player.x > state.width - 16) state.player.x = state.width - 16

            // Bullets
            state.bullets.forEach((b, i) => {
                b.y += b.vy

                // Hit Mushroom?
                let hitMushroom = -1
                state.mushrooms.forEach((m, mi) => {
                    if (Math.abs(b.x - (m.x + 8)) < 8 && Math.abs(b.y - (m.y + 8)) < 8) {
                        hitMushroom = mi
                    }
                })

                if (hitMushroom !== -1) {
                    state.mushrooms[hitMushroom].health--
                    if (state.mushrooms[hitMushroom].health <= 0) {
                        state.mushrooms.splice(hitMushroom, 1)
                        audioController.playNoise(0.1, 0.1)
                    } else {
                        audioController.playTone(200, 0.05, 'triangle')
                    }
                    state.bullets.splice(i, 1)
                    return
                }

                // Hit Centipede?
                let hitSeg = -1
                state.centipedes.forEach((c, ci) => {
                    if (Math.abs(b.x - (c.x + 8)) < 12 && Math.abs(b.y - (c.y + 8)) < 12) {
                        hitSeg = ci
                    }
                })

                if (hitSeg !== -1) {
                    // Kill Segment
                    const seg = state.centipedes[hitSeg]
                    // Create Mushroom at death spot
                    state.mushrooms.push({ x: Math.floor(seg.x / CELL_SIZE) * CELL_SIZE, y: Math.floor(seg.y / CELL_SIZE) * CELL_SIZE, health: 3 })

                    // Split: The segment BEHIND becomes a new head
                    // Actually, if we hit a middle segment, the one BEHIND it in array (which is physically behind?) 
                    // No, usually drawing order.
                    // Simple Logic: Hit segment dies. Next segment becomes head.

                    state.centipedes.splice(hitSeg, 1)

                    // If chaos, just make everything head? No, keep it simple.
                    // Identify new heads?
                    // Just let them flow.

                    audioController.playNoise(0.2, 0.3)
                    state.bullets.splice(i, 1)
                    return
                }

                if (b.y < 0) state.bullets.splice(i, 1)
            })

            // Centipede Logic
            // We need to look ahead for mushrooms
            state.centipedes.forEach(c => {
                // Move
                c.x += c.vx
                c.y += c.vy

                // Turn/Drop Logic
                let hitSide = (c.x < 0 || c.x > state.width - 16)
                let hitShroom = state.mushrooms.some(m => Math.abs(c.x - m.x) < 10 && Math.abs(c.y - m.y) < 10)

                if (hitSide || hitShroom) {
                    // If just hit, drop down
                    if (c.vy === 0) { // Only if moving horizontally
                        c.vy = CELL_SIZE / 8 // Start drop
                        // c.vx = 0? No, usually descend then flip.
                        // Simplified: Instant drop and reverse
                        c.y += CELL_SIZE
                        c.vx = -c.vx
                        // Unstuck from wall
                        if (c.x < 0) c.x = 0
                        if (c.x > state.width - 16) c.x = state.width - 16
                        c.vy = 0
                    }
                }

                // Collision with Player
                if (Math.abs(c.x - state.player.x) < 12 && Math.abs(c.y - state.player.y) < 12) {
                    state.player.dead = true
                    audioController.playSweep(800, 200, 1.0, 'sawtooth')
                }
            })

            if (state.centipedes.length === 0) {
                spawnCentipede() // Next level
                audioController.playSweep(400, 800, 0.5, 'sine')
            }
        }

        const draw = () => {
            // Bg
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, state.width, state.height)

            // Mushrooms
            ctx.fillStyle = 'white'
            state.mushrooms.forEach(m => {
                // Determine look based on health
                if (m.health === 3) {
                    ctx.fillRect(m.x + 2, m.y + 2, 12, 12)
                    ctx.fillStyle = 'black'; ctx.fillRect(m.x + 6, m.y + 6, 4, 4); ctx.fillStyle = 'white'
                } else if (m.health === 2) {
                    ctx.fillRect(m.x + 4, m.y + 4, 8, 8)
                } else {
                    ctx.fillRect(m.x + 6, m.y + 6, 4, 4)
                }
            })

            // Centipede
            state.centipedes.forEach(c => {
                ctx.fillStyle = 'white'
                // Circle
                ctx.beginPath()
                ctx.arc(c.x + 8, c.y + 8, 7, 0, Math.PI * 2)
                ctx.fill()
                // Eyes if head
                if (c.head || true) { // Draw eyes on all for creep factor
                    ctx.fillStyle = 'black'
                    ctx.fillRect(c.x + 4, c.y + 4, 2, 2)
                    ctx.fillRect(c.x + 10, c.y + 4, 2, 2)
                }
                // Legs
                ctx.strokeStyle = 'white'
                if (Math.floor(Date.now() / 100) % 2 === 0) {
                    ctx.beginPath(); ctx.moveTo(c.x, c.y + 8); ctx.lineTo(c.x - 4, c.y + 12); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(c.x + 16, c.y + 8); ctx.lineTo(c.x + 20, c.y + 12); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.moveTo(c.x, c.y + 8); ctx.lineTo(c.x - 4, c.y + 4); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(c.x + 16, c.y + 8); ctx.lineTo(c.x + 20, c.y + 4); ctx.stroke();
                }
            })

            // Bullets
            ctx.fillStyle = 'white'
            state.bullets.forEach(b => {
                ctx.fillRect(b.x, b.y, 2, 8)
            })

            // Player (Ship)
            if (!state.player.dead) {
                ctx.fillStyle = 'white'
                // Triangle
                ctx.beginPath()
                ctx.moveTo(state.player.x + 8, state.player.y)
                ctx.lineTo(state.player.x + 16, state.player.y + 16)
                ctx.lineTo(state.player.x, state.player.y + 16)
                ctx.fill()
            }

            // UI
            ctx.fillStyle = 'white'
            ctx.font = '14px monospace'
            ctx.fillText("CENTIPEDE", 10, 20)
            if (state.player.dead) {
                ctx.fillText("PRESS SPACE", state.width / 2 - 40, state.height / 2)
            }

            if (isAttractMode && !state.player.dead) {
                ctx.fillStyle = 'white'
                ctx.textAlign = 'center'
                ctx.fillText("ATTRACT MODE", state.width / 2, state.height / 2 - 20)
                ctx.fillText("PRESS ANY KEY", state.width / 2, state.height / 2 + 20)
                ctx.textAlign = 'start'
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
            window.removeEventListener('keyup', handleUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CENTIPEDE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default CentipedeGame

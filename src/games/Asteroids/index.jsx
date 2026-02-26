import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const AsteroidsGame = () => {
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
        const SHIP_SIZE = 20
        const BULLET_SPEED = 6
        const ROTATION_SPEED = 0.08
        const ACCELERATION = 0.1
        const FRICTION = 0.99

        // State
        let state = {
            width: 0,
            height: 0,
            ship: {
                x: 0, y: 0,
                vx: 0, vy: 0,
                angle: 0,
                cooldown: 0
            },
            asteroids: [],
            bullets: [],
            particles: [],
            isAttractMode: true
        }

        // Input State
        const keys = {
            ArrowUp: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        }

        const createAsteroid = (x, y, size) => {
            const vertices = []
            const numVertices = 8 + Math.random() * 4
            for (let i = 0; i < numVertices; i++) {
                const angle = (i / numVertices) * Math.PI * 2
                const r = size * (0.8 + Math.random() * 0.4)
                vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
            }
            return {
                x: x || Math.random() * state.width,
                y: y || Math.random() * state.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size,
                vertices
            }
        }

        const initGame = () => {
            state.ship.x = state.width / 2
            state.ship.y = state.height / 2
            state.ship.vx = 0
            state.ship.vy = 0
            state.ship.angle = -Math.PI / 2 // Point up by default

            state.asteroids = []
            for (let i = 0; i < 6; i++) {
                state.asteroids.push(createAsteroid(null, null, 40))
            }
            state.bullets = []
            state.particles = []
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
                    initGame()
                    initialized = true
                }
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // Input Handling
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = true
                state.isAttractMode = false
            }
        }
        const handleKeyUp = (e) => {
            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = false
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        const spawnParticles = (x, y, count = 5) => {
            for (let i = 0; i < count; i++) {
                state.particles.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    life: 1.0
                })
            }
        }

        const update = () => {
            // --- AI Logic (Attract Mode) ---
            if (state.isAttractMode) {
                // Find nearest asteroid
                let nearest = null
                let minDist = Infinity

                state.asteroids.forEach(a => {
                    const dx = a.x - state.ship.x
                    const dy = a.y - state.ship.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < minDist) {
                        minDist = dist
                        nearest = a
                    }
                })

                if (nearest) {
                    // Aim
                    const targetAngle = Math.atan2(nearest.y - state.ship.y, nearest.x - state.ship.x)
                    let diff = targetAngle - state.ship.angle
                    // Normalize angle
                    while (diff > Math.PI) diff -= Math.PI * 2
                    while (diff < -Math.PI) diff += Math.PI * 2

                    if (Math.abs(diff) < ROTATION_SPEED) {
                        state.ship.angle = targetAngle
                        // Shoot if aligned
                        if (state.ship.cooldown <= 0 && minDist < 300) {
                            state.bullets.push({
                                x: state.ship.x + Math.cos(state.ship.angle) * SHIP_SIZE,
                                y: state.ship.y + Math.sin(state.ship.angle) * SHIP_SIZE,
                                vx: Math.cos(state.ship.angle) * BULLET_SPEED,
                                vy: Math.sin(state.ship.angle) * BULLET_SPEED,
                                life: 60
                            })
                            state.ship.cooldown = 15
                            audioController.playTone(800 - Math.random() * 200, 0.05, 'sawtooth', 0.1)
                            // Recoil
                            state.ship.vx -= Math.cos(state.ship.angle) * 0.1
                            state.ship.vy -= Math.sin(state.ship.angle) * 0.1
                        }
                    } else {
                        state.ship.angle += Math.sign(diff) * ROTATION_SPEED
                    }

                    // Move towards center if too far edge, or keep distance from asteroid
                    if (minDist > 200) {
                        state.ship.vx += Math.cos(state.ship.angle) * ACCELERATION * 0.5
                        state.ship.vy += Math.sin(state.ship.angle) * ACCELERATION * 0.5
                    }
                } else {
                    if (Math.random() < 0.01) initGame() // Respawn if empty
                }
            } else {
                // --- Manual Control ---
                if (keys.ArrowLeft) state.ship.angle -= ROTATION_SPEED
                if (keys.ArrowRight) state.ship.angle += ROTATION_SPEED
                if (keys.ArrowUp) {
                    state.ship.vx += Math.cos(state.ship.angle) * ACCELERATION
                    state.ship.vy += Math.sin(state.ship.angle) * ACCELERATION
                    // Thruster particles?
                    if (Math.random() > 0.5) {
                        state.particles.push({
                            x: state.ship.x - Math.cos(state.ship.angle) * SHIP_SIZE,
                            y: state.ship.y - Math.sin(state.ship.angle) * SHIP_SIZE,
                            vx: -Math.cos(state.ship.angle) + (Math.random() - 0.5),
                            vy: -Math.sin(state.ship.angle) + (Math.random() - 0.5),
                            life: 0.5
                        })
                    }
                }
                if (keys.Space && state.ship.cooldown <= 0) {
                    state.bullets.push({
                        x: state.ship.x + Math.cos(state.ship.angle) * SHIP_SIZE,
                        y: state.ship.y + Math.sin(state.ship.angle) * SHIP_SIZE,
                        vx: Math.cos(state.ship.angle) * BULLET_SPEED,
                        vy: Math.sin(state.ship.angle) * BULLET_SPEED,
                        life: 60
                    })
                    state.ship.cooldown = 15
                    audioController.playTone(800 - Math.random() * 200, 0.05, 'sawtooth', 0.1)
                    // Recoil
                    state.ship.vx -= Math.cos(state.ship.angle) * 0.1
                    state.ship.vy -= Math.sin(state.ship.angle) * 0.1
                }
            }

            if (state.ship.cooldown > 0) state.ship.cooldown--

            // Physics
            state.ship.x += state.ship.vx
            state.ship.y += state.ship.vy
            state.ship.vx *= FRICTION
            state.ship.vy *= FRICTION

            // Wrap Ship
            if (state.ship.x < 0) state.ship.x = state.width
            if (state.ship.x > state.width) state.ship.x = 0
            if (state.ship.y < 0) state.ship.y = state.height
            if (state.ship.y > state.height) state.ship.y = 0

            // Bullets
            state.bullets.forEach(b => {
                b.x += b.vx
                b.y += b.vy
                b.life--
            })
            state.bullets = state.bullets.filter(b => b.life > 0)

            // Asteroids
            state.asteroids.forEach(a => {
                a.x += a.vx
                a.y += a.vy

                // Wrap
                if (a.x < -a.size) a.x = state.width + a.size
                if (a.x > state.width + a.size) a.x = -a.size
                if (a.y < -a.size) a.y = state.height + a.size
                if (a.y > state.height + a.size) a.y = -a.size
            })

            // Particles
            state.particles.forEach(p => {
                p.x += p.vx
                p.y += p.vy
                p.life -= 0.02
            })
            state.particles = state.particles.filter(p => p.life > 0)

            // Collisions
            state.bullets.forEach(b => {
                state.asteroids.forEach(a => {
                    const dx = b.x - a.x
                    const dy = b.y - a.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < a.size) {
                        // Hit
                        b.life = 0
                        a.hit = true

                        // Split?
                        if (a.size > 15) {
                            state.asteroids.push(createAsteroid(a.x, a.y, a.size / 2))
                            state.asteroids.push(createAsteroid(a.x, a.y, a.size / 2))
                        }

                        // Particle FX
                        spawnParticles(a.x, a.y)
                        audioController.playNoise(0.1, 0.1)
                    }
                })
            })

            // Clean up hit asteroids
            state.asteroids = state.asteroids.filter(a => !a.hit)
        }

        const draw = () => {
            // Clear (Black)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, state.width, state.height)

            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5

            // Draw Ship
            ctx.save()
            ctx.translate(state.ship.x, state.ship.y)
            ctx.rotate(state.ship.angle)
            ctx.beginPath()
            ctx.moveTo(SHIP_SIZE, 0)
            ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2)
            ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2)
            ctx.closePath()
            ctx.stroke()
            ctx.restore()

            // Draw Asteroids
            state.asteroids.forEach(a => {
                ctx.save()
                ctx.translate(a.x, a.y)
                ctx.beginPath()
                a.vertices.forEach((v, i) => {
                    if (i === 0) ctx.moveTo(v.x, v.y)
                    else ctx.lineTo(v.x, v.y)
                })
                ctx.closePath()
                ctx.stroke()
                ctx.restore()
            })

            // Draw Bullets
            ctx.fillStyle = '#ffffff'
            state.bullets.forEach(b => {
                ctx.fillRect(b.x - 1, b.y - 1, 3, 3)
            })

            // Draw Particles
            state.particles.forEach(p => {
                ctx.globalAlpha = p.life
                ctx.fillRect(p.x, p.y, 2, 2)
                ctx.globalAlpha = 1.0
            })

            // UI
            if (state.isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", state.width / 2, state.height - 50)
                ctx.fillText("ATTRACT MODE", state.width / 2, 50)
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
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ASTEROIDS')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default AsteroidsGame

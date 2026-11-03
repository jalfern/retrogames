import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { SHIP_SIZE, BULLET_SPEED, ROTATION_SPEED, ACCELERATION, FRICTION, START_LIVES, RESPAWN_DELAY, INVULN_TICKS, scoreForSize, makeAsteroid, spawnWave, livesForScore } from './sim.js'

// ASTEROIDS (#1473 batch 16) — the Feb port had no score, no lives and no
// terminal: the ship could not die and the field never refilled. Restored to
// the 1979 arcade law: 20/50/100 per rock size, 3 lives + one bonus life every
// 10,000, respawn grace, wave regen, GAME OVER with restart from any key,
// click or tap — and every die (shape, velocity, position) on one seeded
// stream honoring ?seed=N.
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

        // #1473 run state: one seeded stream; arcade score/lives/wave; honest
        // terminal at 0 lives (over). Respawn: dark for RESPAWN_DELAY ticks,
        // then a blinking INVULN_TICKS grace.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let tickN = 0
        let score = 0
        let lives = START_LIVES
        let bonusLives = 0
        let wave = 1
        let over = false
        let respawnAt = -1        // tick the ship returns from, -1 = alive
        let invulnUntil = 0

        const resetShip = () => {
            state.ship.x = state.width / 2
            state.ship.y = state.height / 2
            state.ship.vx = 0
            state.ship.vy = 0
            state.ship.angle = -Math.PI / 2 // Point up by default
        }

        const initGame = () => {
            resetShip()
            respawnAt = -1
            invulnUntil = 0
            state.asteroids = spawnWave(rand, wave, state.width, state.height)
            state.bullets = []
            state.particles = []
        }

        // Fresh run: seed regenerated (?seed=N wins), whole board rebuilt.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            score = 0
            lives = START_LIVES
            bonusLives = 0
            wave = 1
            over = false
            state.isAttractMode = false
            initGame()
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
        const keys = {
            ArrowUp: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        }
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (over || state.isAttractMode) { startRun(); return }
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = true
            }
        }
        const handleKeyUp = (e) => {
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = false
            }
        }
        // Phones: any tap starts or restarts the run.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (over || state.isAttractMode) startRun()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        const spawnParticles = (x, y, count = 5) => {
            for (let i = 0; i < count; i++) {
                state.particles.push({
                    x, y,
                    vx: (rand() - 0.5) * 2,
                    vy: (rand() - 0.5) * 2,
                    life: 1.0
                })
            }
        }

        const shipAlive = () => respawnAt < 0

        const killShip = () => {
            spawnParticles(state.ship.x, state.ship.y, 14)
            audioController.playNoise(0.4, 0.4)
            lives--
            if (lives <= 0) {
                lives = 0
                over = true
            } else {
                respawnAt = tickN + RESPAWN_DELAY
            }
        }

        const update = () => {
            tickN++
            if (over) return

            // Respawn handling: dark pause, then return at center with grace.
            if (!shipAlive() && tickN >= respawnAt) {
                resetShip()
                respawnAt = -1
                invulnUntil = tickN + INVULN_TICKS
            }

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
                            audioController.playTone(800 - rand() * 200, 0.05, 'sawtooth', 0.1)
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
                    if (rand() < 0.01) initGame() // Respawn field if empty
                }
            } else if (shipAlive()) {
                // --- Manual Control ---
                if (keys.ArrowLeft) state.ship.angle -= ROTATION_SPEED
                if (keys.ArrowRight) state.ship.angle += ROTATION_SPEED
                if (keys.ArrowUp) {
                    state.ship.vx += Math.cos(state.ship.angle) * ACCELERATION
                    state.ship.vy += Math.sin(state.ship.angle) * ACCELERATION
                    // Thruster particles (on the run's stream)
                    if (rand() > 0.5) {
                        state.particles.push({
                            x: state.ship.x - Math.cos(state.ship.angle) * SHIP_SIZE,
                            y: state.ship.y - Math.sin(state.ship.angle) * SHIP_SIZE,
                            vx: -Math.cos(state.ship.angle) + (rand() - 0.5),
                            vy: -Math.sin(state.ship.angle) + (rand() - 0.5),
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
                    audioController.playTone(800 - rand() * 200, 0.05, 'sawtooth', 0.1)
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

            // Collisions: bullets vs rocks — arcade table 20/50/100 by size,
            // big rocks split into two mediums, mediums into two smalls.
            state.bullets.forEach(b => {
                state.asteroids.forEach(a => {
                    const dx = b.x - a.x
                    const dy = b.y - a.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < a.size) {
                        // Hit
                        b.life = 0
                        a.hit = true
                        score += scoreForSize(a.size)
                        const earned = livesForScore(score)
                        if (earned > bonusLives) { lives += earned - bonusLives; bonusLives = earned }

                        // Split?
                        if (a.size > 15) {
                            state.asteroids.push(makeAsteroid(rand, a.x, a.y, a.size / 2, state.width, state.height))
                            state.asteroids.push(makeAsteroid(rand, a.x, a.y, a.size / 2, state.width, state.height))
                        }

                        // Particle FX
                        spawnParticles(a.x, a.y)
                        audioController.playNoise(0.1, 0.1)
                    }
                })
            })

            // Clean up hit asteroids
            state.asteroids = state.asteroids.filter(a => !a.hit)

            // Ship vs rocks (1979 law — the pre-batch ship could not die).
            if (shipAlive() && tickN >= invulnUntil && !state.isAttractMode) {
                for (const a of state.asteroids) {
                    const dx = a.x - state.ship.x
                    const dy = a.y - state.ship.y
                    if (Math.sqrt(dx * dx + dy * dy) < a.size + SHIP_SIZE * 0.4) {
                        killShip()
                        break
                    }
                }
            }

            // Wave clear: the field empties → next wave (arcade refill).
            if (!state.isAttractMode && !over && state.asteroids.length === 0) {
                wave++
                state.asteroids = spawnWave(rand, wave, state.width, state.height)
                audioController.playSweep(300, 900, 0.5, 'sine')
            }
        }

        const draw = () => {
            // Clear (Black)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, state.width, state.height)

            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5

            // Draw Ship (hidden while dark; blinks through the respawn grace)
            const invulnBlink = tickN < invulnUntil && Math.floor(tickN / 6) % 2 === 0
            if (shipAlive() && !invulnBlink) {
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
            }

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

            // HUD — score left, wave center, spare ships right (the arcade's
            // row of bow-ships, drawn as small triangles).
            if (!state.isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '14px monospace'
                ctx.textAlign = 'left'
                ctx.fillText(`SCORE ${score}`, 10, 20)
                ctx.textAlign = 'center'
                ctx.fillText(`WAVE ${wave}`, state.width / 2, 20)
                for (let i = 0; i < Math.max(0, lives - 1); i++) {
                    const bx = state.width - 18 - i * 16
                    ctx.beginPath()
                    ctx.moveTo(bx, 10)
                    ctx.lineTo(bx - 6, 20)
                    ctx.lineTo(bx + 6, 20)
                    ctx.closePath()
                    ctx.stroke()
                }
            }

            // UI
            if (state.isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", state.width / 2, state.height - 50)
                ctx.fillText("ATTRACT MODE", state.width / 2, 50)
            }
            if (over) {
                ctx.fillStyle = '#ffffff'
                ctx.textAlign = 'center'
                ctx.font = '22px monospace'
                ctx.fillText('GAME OVER', state.width / 2, state.height / 2 - 8)
                ctx.font = '14px monospace'
                ctx.fillText(`FINAL SCORE ${score}`, state.width / 2, state.height / 2 + 14)
                if (Math.floor(tickN / 30) % 2 === 0) {
                    ctx.font = '12px monospace'
                    ctx.fillText('PRESS ANY KEY TO PLAY AGAIN', state.width / 2, state.height / 2 + 36)
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

        // QA contract (#377)
        exposeGame({
            id: 'asteroids',
            buttons: ['left', 'right', 'up', 'a'],
            reset: (s) => {
                seed = s >>> 0
                rand = seedRng(seed)
                score = 0
                lives = START_LIVES
                bonusLives = 0
                wave = 1
                over = false
                state.isAttractMode = false
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.Space = false
                if (state.width > 0) initGame()
            },
            tick: (pad) => {
                if (over) { tickN += 1; return }
                keys.ArrowLeft = !!pad.left
                keys.ArrowRight = !!pad.right
                keys.ArrowUp = !!pad.up
                keys.Space = !!pad.a
                update()
            },
            state: () => ({
                tick: tickN, score, done: over, seed, lives, wave,
                shipX: Math.round(state.ship.x), shipY: Math.round(state.ship.y),
                rocks: state.asteroids.length,
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: rand closure is not JSON-serializable (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score, done: over, seed, lives, wave,
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
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ASTEROIDS')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default AsteroidsGame

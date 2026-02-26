import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const DefenderGame = () => {
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

        // GAME CONSTANTS
        const WORLD_WIDTH = 4000
        const MINIMAP_HEIGHT = 50
        const GROUND_HEIGHT = 50
        const PLAYER_SPEED = 0.5
        const PLAYER_MAX_SPEED = 8
        const LASER_SPEED = 20

        // GAME STATE
        let cameraX = 0
        let gameTime = 0
        let isAttractMode = true

        // INPUT
        const keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        }

        // ENTITIES
        let player = {
            x: 200,
            y: 300,
            vx: 3, // Initial velocity so game "starts" moving
            vy: 0,
            facing: 1, // 1 or -1
            cooldown: 0
        }

        let lasers = []
        let particles = []
        let enemies = []

        // TERRAIN GENERATION
        // Simple heightmap
        const terrain = []
        const generateTerrain = (width, height) => {
            let y = height - 100
            for (let x = 0; x < width; x += 10) {
                terrain.push({ x, y })
                y += (Math.random() - 0.5) * 40
                if (y > height - 20) y = height - 20
                if (y < height - 200) y = height - 200
            }
            terrain.push({ x: width, y: height - 100 })
        }

        // SPAWN ENEMIES
        const spawnEnemies = (h) => {
            const height = h || window.innerHeight
            for (let i = 0; i < 15; i++) {
                enemies.push({
                    x: Math.random() * WORLD_WIDTH,
                    y: Math.random() * (height - 200) + 50,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    type: 'lander'
                })
            }
        }

        // INIT
        const init = () => {
            resize()
            if (containerRef.current) {
                generateTerrain(WORLD_WIDTH, containerRef.current.getBoundingClientRect().height)
                spawnEnemies(containerRef.current.getBoundingClientRect().height)
            } else {
                generateTerrain(WORLD_WIDTH, window.innerHeight)
                spawnEnemies(window.innerHeight)
            }

            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
            window.addEventListener('resize', resize)

            // Force focus
            canvas.focus()

            // Start Loop
            animationFrameId = requestAnimationFrame(loop)
        }

        let viewWidth = 0, viewHeight = 0
        const resize = () => {
            if (!canvas || !ctx || !containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            viewWidth = width
            viewHeight = height

            ctx.imageSmoothingEnabled = false
            ctx.shadowBlur = 4
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
        }

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
                Object.keys(keys).forEach(k => keys[k] = false)
            }
            if (e.code === 'Space') keys.Space = true
            if (e.code === 'ArrowUp' || e.key === 'w') keys.ArrowUp = true
            if (e.code === 'ArrowDown' || e.key === 's') keys.ArrowDown = true
            if (e.code === 'ArrowLeft' || e.key === 'a') keys.ArrowLeft = true
            if (e.code === 'ArrowRight' || e.key === 'd') keys.ArrowRight = true
        }

        const handleKeyUp = (e) => {
            if (e.code === 'Space') keys.Space = false
            if (e.code === 'ArrowUp' || e.key === 'w') keys.ArrowUp = false
            if (e.code === 'ArrowDown' || e.key === 's') keys.ArrowDown = false
            if (e.code === 'ArrowLeft' || e.key === 'a') keys.ArrowLeft = false
            if (e.code === 'ArrowRight' || e.key === 'd') keys.ArrowRight = false
        }

        const update = () => {
            // --- AI LOGIC ---
            if (isAttractMode) {
                // Find nearest enemy
                let target = null
                let minDist = Infinity
                enemies.forEach(e => {
                    const dist = Math.abs(e.x - player.x)
                    if (dist < minDist) {
                        minDist = dist
                        target = e
                    }
                })

                if (target) {
                    const dx = target.x - player.x
                    const dy = target.y - player.y

                    // Horizontal Move
                    if (dx > 0) { keys.ArrowRight = true; keys.ArrowLeft = false }
                    else { keys.ArrowLeft = true; keys.ArrowRight = false }

                    // Vertical Move
                    if (dy > 10) { keys.ArrowDown = true; keys.ArrowUp = false }
                    else if (dy < -10) { keys.ArrowUp = true; keys.ArrowDown = false }
                    else { keys.ArrowUp = false; keys.ArrowDown = false }

                    // Shoot
                    // If facing target and aligned
                    if ((dx > 0 && player.facing === 1) || (dx < 0 && player.facing === -1)) {
                        if (Math.abs(dy) < 50 && Math.random() < 0.1) keys.Space = true
                        else keys.Space = false
                    }
                } else {
                    // Patrol
                    keys.ArrowRight = true
                    keys.ArrowLeft = false
                }
            }

            // Player Physics
            if (keys.ArrowLeft) player.vx -= PLAYER_SPEED
            if (keys.ArrowRight) player.vx += PLAYER_SPEED
            if (keys.ArrowUp) player.vy -= PLAYER_SPEED
            if (keys.ArrowDown) player.vy += PLAYER_SPEED

            // Friction
            player.vx *= 0.98
            player.vy *= 0.95

            // Max Speed
            if (player.vx > PLAYER_MAX_SPEED) player.vx = PLAYER_MAX_SPEED
            if (player.vx < -PLAYER_MAX_SPEED) player.vx = -PLAYER_MAX_SPEED
            if (player.vy > PLAYER_MAX_SPEED) player.vy = PLAYER_MAX_SPEED
            if (player.vy < -PLAYER_MAX_SPEED) player.vy = -PLAYER_MAX_SPEED

            // Movement
            player.x += player.vx
            player.y += player.vy

            // Boundaries
            if (player.x < 0) player.x = 0
            if (player.x > WORLD_WIDTH) player.x = WORLD_WIDTH
            if (player.y < MINIMAP_HEIGHT + 20) player.y = MINIMAP_HEIGHT + 20
            if (player.y > viewHeight - 20) player.y = viewHeight - 20

            // Facing
            if (keys.ArrowLeft) player.facing = -1
            if (keys.ArrowRight) player.facing = 1

            // Camera Follow
            cameraX = player.x - viewWidth / 2
            if (cameraX < 0) cameraX = 0
            if (cameraX > WORLD_WIDTH - viewWidth) cameraX = WORLD_WIDTH - viewWidth

            // Shooting
            if (keys.Space && player.cooldown <= 0) {
                lasers.push({
                    x: player.x + (player.facing === 1 ? 20 : -20),
                    y: player.y,
                    vx: player.facing * LASER_SPEED,
                    life: 60
                })
                player.cooldown = 10
                audioController.playTone(400, 0.05, 'square', 0.1) // Pew
            }
            if (player.cooldown > 0) player.cooldown--

            // Entities
            lasers.forEach(l => {
                l.x += l.vx
                l.life--
            })
            lasers = lasers.filter(l => l.life > 0)

            enemies.forEach(e => {
                e.x += e.vx
                e.y += e.vy

                // Bounce
                if (e.y < MINIMAP_HEIGHT || e.y > viewHeight - 50) e.vy *= -1
                if (e.x < 0 || e.x > WORLD_WIDTH) e.vx *= -1

                // Random jitter
                if (Math.random() < 0.02) e.vy = (Math.random() - 0.5) * 2
            })

            // Collision
            lasers.forEach(l => {
                enemies.forEach(e => {
                    if (Math.abs(l.x - e.x) < 20 && Math.abs(l.y - e.y) < 20) {
                        e.dead = true
                        l.life = 0
                        // Explosion particles
                        for (let i = 0; i < 10; i++) {
                            particles.push({
                                x: e.x, y: e.y,
                                vx: (Math.random() - 0.5) * 10,
                                vy: (Math.random() - 0.5) * 10,
                                life: 30
                            })
                        }
                        audioController.playTone(150, 0.1, 'sawtooth', 0.2) // Boom
                    }
                })
            })
            enemies = enemies.filter(e => !e.dead)

            // Particles
            particles.forEach(p => {
                p.x += p.vx
                p.y += p.vy
                p.life--
            })
            particles = particles.filter(p => p.life > 0)
        }

        const draw = () => {
            // Background
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            // --- MAIN VIEW ---
            ctx.save()
            ctx.translate(-cameraX, 0)

            // Stars (Static parallax?)
            // Just random white dots for now, scrolling slower
            // Actually, static world stars:
            // Stars (Dynamic Twinkle)
            ctx.fillStyle = 'white'
            for (let i = 0; i < 100; i++) {
                // deterministic stars based on i, but with twinkle
                if ((Date.now() + i * 100) % 1000 < 200) continue; // Twinkle effect (skip drawing sometimes)

                const sx = (i * 137) % WORLD_WIDTH
                const sy = (i * 53) % viewHeight

                // Parallax scrolling (slower than foreground)
                let parallaxX = sx - cameraX * 0.5
                if (parallaxX < 0) parallaxX += WORLD_WIDTH
                if (parallaxX > viewWidth) parallaxX -= WORLD_WIDTH

                if (parallaxX >= 0 && parallaxX <= viewWidth) {
                    ctx.fillRect(parallaxX, sy, 2, 2)
                }
            }

            // Terrain
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(0, viewHeight)
            terrain.forEach(p => ctx.lineTo(p.x, p.y))
            ctx.lineTo(WORLD_WIDTH, viewHeight)
            ctx.stroke()

            // Player
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.save()
            ctx.translate(player.x, player.y)
            ctx.scale(player.facing, 1)
            ctx.beginPath()
            // Simple ship shape
            ctx.moveTo(10, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.lineTo(10, 0)
            ctx.moveTo(-10, -5); ctx.lineTo(-15, 0); ctx.lineTo(-10, 5) // Thruster
            ctx.moveTo(0, -3); ctx.lineTo(0, -8) // Top fin
            ctx.stroke()

            // Thrust flame
            if ((player.facing === 1 && keys.ArrowRight) || (player.facing === -1 && keys.ArrowLeft)) {
                ctx.beginPath()
                ctx.moveTo(-15, 0)
                ctx.lineTo(-25 - Math.random() * 10, 0)
                ctx.strokeStyle = Math.random() > 0.5 ? 'white' : 'gray'
                ctx.stroke()
            }
            ctx.restore()

            // Lasers
            ctx.strokeStyle = 'white' // Colorful lasers? Grayscale requested.
            // Actually defender has colorful lasers. But user asked for greyscale.
            ctx.lineWidth = 2
            ctx.beginPath()
            lasers.forEach(l => {
                ctx.moveTo(l.x, l.y)
                ctx.lineTo(l.x + 40 * (l.vx > 0 ? 1 : -1), l.y)
            })
            ctx.stroke()

            // Enemies
            ctx.strokeStyle = '#cccccc'
            enemies.forEach(e => {
                ctx.save()
                ctx.translate(e.x, e.y)
                ctx.beginPath()
                // Lander shape
                ctx.rect(-10, -10, 20, 20)
                ctx.moveTo(-10, 10); ctx.lineTo(-10, 5); ctx.lineTo(10, 5); ctx.lineTo(10, 10)
                ctx.moveTo(-5, 0); ctx.lineTo(5, 0)
                ctx.stroke()
                ctx.restore()
            })

            // Particles
            ctx.fillStyle = 'white'
            particles.forEach(p => ctx.fillRect(p.x, p.y, 2, 2))

            ctx.restore()

            // --- SCANNER (MINIMAP) ---
            // Top of screen
            const scannerScale = viewWidth / WORLD_WIDTH
            const scannerH = MINIMAP_HEIGHT

            // Frame
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, viewWidth, scannerH)
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(0, scannerH); ctx.lineTo(viewWidth, scannerH)
            ctx.stroke()

            // Terrain on Scanner
            ctx.strokeStyle = '#666666'
            ctx.lineWidth = 1
            ctx.beginPath()
            terrain.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x * scannerScale, p.y * (scannerH / viewHeight * 0.5) + scannerH / 2)
                else ctx.lineTo(p.x * scannerScale, p.y * 0.15 + 10)
            })
            ctx.stroke()

            // Entities on Scanner
            // Player
            ctx.fillStyle = 'white'
            ctx.fillRect(player.x * scannerScale, player.y * 0.15 + 10, 4, 4)

            // Enemies
            ctx.fillStyle = '#aaaaaa'
            enemies.forEach(e => {
                ctx.fillRect(e.x * scannerScale, e.y * 0.15 + 10, 2, 2)
            })

            // Camera Box
            ctx.strokeStyle = 'white'
            ctx.strokeRect(cameraX * scannerScale, 2, viewWidth * scannerScale, scannerH - 4)

            if (isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", viewWidth / 2, viewHeight / 2)
                ctx.fillText("ATTRACT MODE", viewWidth / 2, viewHeight / 2 - 40)
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
        init()

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
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DEFENDER')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default DefenderGame

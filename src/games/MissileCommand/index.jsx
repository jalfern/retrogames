import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const MissileCommandGame = () => {
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

        // CONSTANTS
        const SCREEN_WIDTH = 800
        const SCREEN_HEIGHT = 600
        const GROUND_Y = 550
        const MISSILE_SPEED_PLAYER = 15
        const MISSILE_SPEED_ENEMY_BASE = 1
        const EXPLOSION_RADIUS_MAX = 40
        const EXPLOSION_SPEED = 1

        // GAME STATE
        let score = 0
        let wave = 1
        let missilesLeftInWave = 10
        let spawning = true
        let spawnTimer = 0
        let gameOver = false
        let gameState = 'playing' // playing, waveEnd, gameOver
        let isAttractMode = true

        // INPUT STATE
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        // ENTITIES
        // Cities: 6 total
        const cities = [
            { x: 120, y: GROUND_Y, alive: true },
            { x: 200, y: GROUND_Y, alive: true },
            { x: 280, y: GROUND_Y, alive: true },
            { x: 520, y: GROUND_Y, alive: true },
            { x: 600, y: GROUND_Y, alive: true },
            { x: 680, y: GROUND_Y, alive: true }
        ]

        // Silos: 3 total
        const silos = [
            { x: 40, y: GROUND_Y - 20, ammo: 10, alive: true },
            { x: 400, y: GROUND_Y - 20, ammo: 10, alive: true },
            { x: 760, y: GROUND_Y - 20, ammo: 10, alive: true }
        ]

        let playerMissiles = []
        let enemyMissiles = []
        let explosions = []
        let crosshair = { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 }

        // MOUSE INPUT
        const handleMouseMove = (e) => {
            if (pausedRef.current) return
            if (isAttractMode) isAttractMode = false
            const rect = canvas.getBoundingClientRect()
            const scaleX = SCREEN_WIDTH / rect.width
            const scaleY = SCREEN_HEIGHT / rect.height
            crosshair.x = (e.clientX - rect.left) * scaleX
            crosshair.y = (e.clientY - rect.top) * scaleY
        }

        const handleClick = () => {
            if (pausedRef.current) return
            if (isAttractMode) {
                isAttractMode = false
                return
            }
            if (gameOver || gameState !== 'playing') return

            // Find nearest silo with ammo
            let bestSilo = null
            let minDist = Infinity

            silos.forEach(silo => {
                if (silo.alive && silo.ammo > 0) {
                    const dist = Math.abs(silo.x - crosshair.x)
                    if (dist < minDist) {
                        minDist = dist
                        bestSilo = silo
                    }
                }
            })

            if (bestSilo) {
                bestSilo.ammo--
                fireMissile(bestSilo.x, bestSilo.y, crosshair.x, crosshair.y)
            } else {
                // Out of ammo sound?
            }
        }

        const fireMissile = (sx, sy, tx, ty) => {
            playerMissiles.push({
                x: sx, y: sy,
                startX: sx, startY: sy,
                targetX: tx, targetY: ty,
                speed: MISSILE_SPEED_PLAYER,
                color: '#00ffff'
            })
            audioController.playTone(600, 0.05, 'triangle') // Pew
        }

        const spawnExplosion = (x, y) => {
            explosions.push({
                x, y,
                radius: 1,
                growing: true,
                color: Math.random() > 0.5 ? '#ffffff' : '#ff0000'
            })
            audioController.playTone(100, 0.2, 'noise', 0.5) // Boom
        }

        const startWave = () => {
            missilesLeftInWave = 10 + (wave * 2)
            spawning = true
            gameState = 'playing'
            // Restock ammo? Original creates bonus points then restocks.
            // For simplicity: Reload all alive silos logic happens at end of wave
        }

        const nextWave = () => {
            wave++
            gameState = 'waveEnd'
            // Calculate Bonus
            let bonus = 0
            cities.forEach(c => { if (c.alive) bonus += 100 })
            silos.forEach(s => { if (s.alive) bonus += s.ammo * 50; s.ammo = 10; }) // Reload
            score += bonus

            // Check revive city logic (every N points usually) - skipped for now

            setTimeout(() => {
                if (!gameOver) startWave()
            }, 3000)
        }

        const checkGameOver = () => {
            if (cities.every(c => !c.alive)) {
                gameOver = true
                gameState = 'gameOver'
            }
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (keys.hasOwnProperty(e.code)) keys[e.code] = true
            if (e.code === 'Space') handleClick() // Fire
        }

        const handleKeyUp = (e) => {
            if (keys.hasOwnProperty(e.code)) keys[e.code] = false
        }

        const init = () => {
            console.log("Missile Command Init")
            resize()

            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)

            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mousedown', handleClick)
            window.addEventListener('resize', resize)

            // cleanup needs to remove keydown too, effectively done in return but logic structure is init-return separate here.
            // Actually `init` is called once. The return of useEffect is where cleanup is.
            // I should assign handleKeyDown to a variable accessible in cleanup?
            // `init` defines `handleKeyDown` locally.
            // I should move `handleKeyDown` out of `init` or modify cleanup.
            // Let's attach to window in `init` but we need to reference it in cleanup.
            // Better: Move handleKeyDown to main scope and attach/detach in useEffect explicitly. Use a ref to hold valid cleanup.

            // The `init` function is weirdly structure.
            // Let's just add it to window in `init` but we need to remove it.
            // `init` is inside useEffect. `handleKeyDown` needs to be defined in useEffect scope.
            // I will inject `handleKeyDown` definition before `init`.
            animationFrameId = requestAnimationFrame(loop)
        }

        const resize =() => {
            if (!canvas || !ctx || !containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = false
        }

        const update = () => {
            if (gameState === 'gameOver') return

            // --- AI LOGIC (ATTRACT MODE) ---
            if (isAttractMode && gameState === 'playing' && !gameOver) {
                // Try to intercept
                let targetMissile = null
                let minHeight = Infinity

                // Target lowest missile
                enemyMissiles.forEach(m => {
                    if (m.y < GROUND_Y && m.y < minHeight) {
                        targetMissile = m
                        minHeight = m.y
                    }
                })

                if (targetMissile) {
                    // Ideal intercept point? Just aim a bit ahead
                    const leadX = targetMissile.x + Math.cos(Math.atan2(targetMissile.targetY - targetMissile.startX, targetMissile.targetX - targetMissile.startX)) * 50
                    const leadY = targetMissile.y + Math.sin(Math.atan2(targetMissile.targetY - targetMissile.startY, targetMissile.targetX - targetMissile.startX)) * 50

                    // Move crosshair
                    const dx = leadX - crosshair.x
                    const dy = leadY - crosshair.y
                    crosshair.x += dx * 0.1
                    crosshair.y += dy * 0.1

                    // Fire?
                    if (Math.random() < 0.05 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                        // AI Fire
                        let bestSilo = null
                        let maxAmmo = -1
                        silos.forEach(silo => {
                            if (silo.alive && silo.ammo > maxAmmo) {
                                maxAmmo = silo.ammo
                                bestSilo = silo
                            }
                        })
                        if (bestSilo && bestSilo.ammo > 0) {
                            bestSilo.ammo--
                            fireMissile(bestSilo.x, bestSilo.y, crosshair.x, crosshair.y)
                        }
                    }
                } else {
                    // Wander crosshair
                    crosshair.x += (Math.sin(Date.now() * 0.001) * SCREEN_WIDTH / 2 + SCREEN_WIDTH / 2 - crosshair.x) * 0.01
                    crosshair.y += (SCREEN_HEIGHT / 2 - crosshair.y) * 0.01
                }
            }

            // KEYBOARD AIMING
            if (gameState === 'playing' && !pausedRef.current && !isAttractMode) {
                const AIM_SPEED = 8
                if (keys.ArrowLeft) crosshair.x -= AIM_SPEED
                if (keys.ArrowRight) crosshair.x += AIM_SPEED
                if (keys.ArrowUp) crosshair.y -= AIM_SPEED
                if (keys.ArrowDown) crosshair.y += AIM_SPEED

                // Clamp
                if (crosshair.x < 0) crosshair.x = 0
                if (crosshair.x > SCREEN_WIDTH) crosshair.x = SCREEN_WIDTH
                if (crosshair.y < 0) crosshair.y = 0
                if (crosshair.y > GROUND_Y) crosshair.y = GROUND_Y
            }


            // --- SPAWNING ---
            if (spawning && gameState === 'playing') {
                spawnTimer--
                if (spawnTimer <= 0) {
                    if (missilesLeftInWave > 0) {
                        // Pick Target
                        const targets = [...cities, ...silos].filter(t => t.alive)
                        if (targets.length > 0) {
                            const target = targets[Math.floor(Math.random() * targets.length)]
                            enemyMissiles.push({
                                x: Math.random() * SCREEN_WIDTH,
                                y: 0,
                                startX: Math.random() * SCREEN_WIDTH, startY: 0,
                                targetX: target.x,
                                targetY: target.y,
                                speed: MISSILE_SPEED_ENEMY_BASE + (wave * 0.1),
                                color: '#ff0000',
                                active: true
                            })
                            missilesLeftInWave--
                            spawnTimer = Math.max(10, 100 - (wave * 5)) // Spawn rate increases
                        }
                    } else {
                        spawning = false
                    }
                }
            }

            // End Wave Check
            if (!spawning && enemyMissiles.length === 0 && explosions.length === 0 && gameState === 'playing') {
                nextWave()
            }

            // --- UPDATE PLAYER MISSILES ---
            playerMissiles.forEach(m => {
                const dx = m.targetX - m.x
                const dy = m.targetY - m.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < m.speed) {
                    // Reached Target
                    spawnExplosion(m.targetX, m.targetY)
                    m.dead = true
                } else {
                    const angle = Math.atan2(dy, dx)
                    m.x += Math.cos(angle) * m.speed
                    m.y += Math.sin(angle) * m.speed
                }
            })
            playerMissiles = playerMissiles.filter(m => !m.dead)

            // --- UPDATE ENEMY MISSILES ---
            enemyMissiles.forEach(m => {
                const dx = m.targetX - m.x
                const dy = m.targetY - m.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < m.speed) {
                    // Hit Target
                    spawnExplosion(m.targetX, m.targetY); // Semicolon added
                    m.dead = true; // Semicolon added

                    // Destroy Logic
                    // Check specific collision with structures
                    // Simple check: distance to any live target
                    [...cities, ...silos].forEach(t => {
                        if (t.alive && Math.abs(t.x - m.targetX) < 20) {
                            // Actually, let explosion logic kill them? 
                            // Or direct hit logic.
                            // Original: Direct hit destroys, explosion destroys.
                        }
                    })
                    // Let the explosion created by the enemy missile do the destruction
                } else {
                    const angle = Math.atan2(dy, dx)
                    m.x += Math.cos(angle) * m.speed
                    m.y += Math.sin(angle) * m.speed
                }
            })
            // Filter dead later

            // --- EXPLOSIONS ---
            explosions.forEach(e => {
                if (e.growing) {
                    e.radius += EXPLOSION_SPEED
                    if (e.radius >= EXPLOSION_RADIUS_MAX) e.growing = false
                } else {
                    e.radius -= EXPLOSION_SPEED
                    if (e.radius <= 0) e.dead = true
                }

                // Collision with Enemies
                enemyMissiles.forEach(m => {
                    const dx = m.x - e.x
                    const dy = m.y - e.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < e.radius) {
                        m.dead = true
                        score += 25
                        // Chain reaction? Maybe just one explosion per enemy
                        // spawnExplosion(m.x, m.y) // Makes it too easy?
                    }
                })

                // Collision with Structures
                // If explosion center is close to structure (Enemy warhead hit)
                // Actually, standard Missile Command: Enemy warhead creates explosion. 
                // Any structure touching that explosion dies.
                const targets = [...cities, ...silos]
                targets.forEach(t => {
                    if (t.alive) {
                        const dx = t.x - e.x
                        const dy = t.y - e.y // Structure y is center of base
                        if (Math.sqrt(dx * dx + dy * dy) < e.radius) {
                            t.alive = false
                            checkGameOver()
                        }
                    }
                })
            })
            explosions = explosions.filter(e => !e.dead)
            enemyMissiles = enemyMissiles.filter(m => !m.dead)

        }

        const draw = () => {
            // Scale
            const dpr = window.devicePixelRatio || 1
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY) * 0.95

            const transX = (canvas.width / dpr - SCREEN_WIDTH * scale) / 2
            const transY = (canvas.height / dpr - SCREEN_HEIGHT * scale) / 2

            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            ctx.save()
            ctx.translate(transX, transY)
            ctx.scale(scale, scale)

            // Clip
            ctx.beginPath()
            ctx.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            ctx.clip()

            // Ground
            ctx.fillStyle = '#ffff00' // Yellow ground line
            ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 5)

            // Cities
            ctx.fillStyle = '#0000ff' // Blue cities
            cities.forEach(c => {
                if (c.alive) {
                    // Simple City Shape
                    ctx.beginPath()
                    ctx.moveTo(c.x - 15, GROUND_Y)
                    ctx.lineTo(c.x - 15, GROUND_Y - 10)
                    ctx.lineTo(c.x - 5, GROUND_Y - 10)
                    ctx.lineTo(c.x, GROUND_Y - 20)
                    ctx.lineTo(c.x + 5, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y)
                    ctx.fill()
                }
            })

            // Silos
            ctx.fillStyle = '#aaaaaa'
            silos.forEach(s => {
                if (s.alive) {
                    // Pyramid
                    ctx.beginPath()
                    ctx.moveTo(s.x - 20, GROUND_Y)
                    ctx.lineTo(s.x, GROUND_Y - 30) // Top
                    ctx.lineTo(s.x + 20, GROUND_Y)
                    ctx.fill()

                    // Ammo
                    ctx.fillStyle = '#ffffff'
                    // Draw missiles inside
                    for (let i = 0; i < s.ammo; i++) {
                        let row = 0
                        let col = i
                        if (i > 3) { row = 1; col = i - 4 }
                        if (i > 7) { row = 2; col = i - 8 }
                        // Just visualize roughly
                        ctx.fillRect(s.x - 12 + (col * 6), GROUND_Y - 10 + (row * 4), 4, 4)
                    }
                    ctx.fillStyle = '#aaaaaa' // Restore color
                }
            })

            // Player Missiles
            playerMissiles.forEach(m => {
                ctx.strokeStyle = '#0000ff' // Blue trail
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                // Warhead
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)

                // Target Marker (X)
                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 1
                const tx = m.targetX, ty = m.targetY
                ctx.beginPath()
                ctx.moveTo(tx - 3, ty - 3); ctx.lineTo(tx + 3, ty + 3)
                ctx.moveTo(tx + 3, ty - 3); ctx.lineTo(tx - 3, ty + 3)
                ctx.stroke()
            })

            // Enemy Missiles
            enemyMissiles.forEach(m => {
                ctx.strokeStyle = '#ff0000' // Red trail
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                // Warhead
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            })

            // Explosions
            explosions.forEach(e => {
                ctx.fillStyle = e.color
                ctx.beginPath()
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2)
                ctx.fill()
            })

            // Crosshair
            ctx.strokeStyle = '#ff00ff'
            ctx.lineWidth = 2
            const cx = crosshair.x, cy = crosshair.y
            ctx.beginPath()
            ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy)
            ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10)
            ctx.stroke()

            // UI
            ctx.fillStyle = '#ff0000'
            ctx.font = '24px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`SCORE: ${score}`, SCREEN_WIDTH / 2, 30)
            ctx.fillStyle = '#0000ff'
            ctx.fillText(`WAVE: ${wave}`, SCREEN_WIDTH / 2, 60)

            if (isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '30px monospace'
                ctx.fillText("CLICK TO START", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.fillText("ATTRACT MODE", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 40)
            }

            if (gameState === 'waveEnd') {
                ctx.fillStyle = '#00ff00'
                ctx.font = '40px monospace'
                ctx.fillText(`WAVE COMPLETE`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.font = '20px monospace'
                ctx.fillText(`BONUS POINTS`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40)
            }

            if (gameState === 'gameOver') {
                ctx.fillStyle = '#ff0000'
                ctx.font = '60px monospace'
                ctx.fillText(`THE END`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
            }

            ctx.restore()
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
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleClick)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[4/3] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full cursor-none" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MISSILE COMMAND')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default MissileCommandGame

import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { CELL_SIZE, START_LIVES, INVULN_TICKS, scoreForSegment, MUSHROOM_POINTS, mushroomField } from './sim.js'

// CENTIPEDE (#1473 batch 16) — the Feb port's score was dead, one touch was
// instant hard-reset, cut bodies never grew heads, and the mushroom field
// scattered off Math.random. Restored to the 1981 arcade law: body 10 / head
// 100 / mushroom 1; the segment behind every cut becomes a new head; three
// lives — death respawns the zapper at the bottom and restarts the centipede
// from the top while the field persists; GAME OVER at zero lives restarts
// from any key, click or tap; the field is seeded and honors ?seed=N.
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
        const PLAYER_SPEED = 4
        const BULLET_SPEED = 8
        const CENTIPEDE_SPEED = 2

        let state = {
            width: 0,
            height: 0,
            player: { x: 0, y: 0, w: 16, h: 16 },
            bullets: [],
            mushrooms: [], // {x, y, health}
            centipedes: [], // Array of Segments {x, y, vx, vy, head}
            score: 0,
            frame: 0
        }

        // #1473 run state: seeded field, arcade lives loop, honest terminal.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let tickN = 0
        let lives = START_LIVES
        let over = false
        let respawnAt = -1       // tick the zapper returns, -1 = alive
        let invulnUntil = 0

        const spawnCentipede = () => {
            state.centipedes = []
            // Head
            state.centipedes.push({ x: state.width / 2, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: true })
            // Body
            for (let i = 1; i < 10; i++) {
                state.centipedes.push({ x: state.width / 2 - i * CELL_SIZE, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: false })
            }
        }

        const resetPlayer = () => {
            state.player.x = state.width / 2
            state.player.y = state.height - 30
            respawnAt = -1
            invulnUntil = tickN + INVULN_TICKS
        }

        const init = () => {
            // Fresh board: zapper + seeded mushroom field + a centipede on top
            respawnAt = -1
            invulnUntil = 0
            state.player.x = state.width / 2
            state.player.y = state.height - 30
            state.mushrooms = mushroomField(rand, state.width, state.height)
            spawnCentipede()
        }

        // Fresh run: seed regenerated (?seed=N wins), score and lives reset.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            state.score = 0
            lives = START_LIVES
            over = false
            isAttractMode = false
            init()
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
        let attractTick = 0
        let keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Space: false }
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (over || isAttractMode) { startRun(); return }
            if (keys[e.code] !== undefined) keys[e.code] = true
            if (e.code === 'Space') fireBullet()
        }
        const handleUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }
        // Phones: any tap starts or restarts the run.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (over || isAttractMode) startRun()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        const fireBullet = () => {
            if (respawnAt >= 0 || over) return
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

        const playerAlive = () => respawnAt < 0

        const killPlayer = () => {
            audioController.playSweep(800, 200, 1.0, 'sawtooth')
            if (isAttractMode) { respawnAt = tickN + 60; return }
            lives--
            if (lives <= 0) {
                lives = 0
                over = true
            } else {
                respawnAt = tickN + 60
            }
        }

        const update = () => {
            state.frame++
            tickN++
            if (over) return

            // Respawn: back to the bottom pad, centipede restarts on top,
            // mushrooms persist (arcade death — not a hard reset).
            if (!playerAlive() && tickN >= respawnAt) {
                resetPlayer()
                spawnCentipede()
            }

            // --- AI LOGIC ---
            if (isAttractMode && playerAlive()) {
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
            if (playerAlive()) {
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
            }

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
                        state.score += MUSHROOM_POINTS // arcade: 1 pt per mushroom
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
                    // Kill the segment: it turns into a mushroom where it fell,
                    // and the arcade table pays 100 for the head, 10 for body.
                    const seg = state.centipedes[hitSeg]
                    state.score += scoreForSegment(seg.head)
                    state.mushrooms.push({ x: Math.floor(seg.x / CELL_SIZE) * CELL_SIZE, y: Math.floor(seg.y / CELL_SIZE) * CELL_SIZE, health: 3 })

                    // The segment behind the gap becomes a new head — the
                    // arcade's chain rule (the pre-batch code punted on it).
                    state.centipedes.splice(hitSeg, 1)
                    if (state.centipedes[hitSeg]) state.centipedes[hitSeg].head = true

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

                // Collision with Player (honors the respawn grace)
                if (playerAlive() && tickN >= invulnUntil && Math.abs(c.x - state.player.x) < 12 && Math.abs(c.y - state.player.y) < 12) {
                    killPlayer()
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
                if (c.head) { // heads earn their eyes now that cuts spawn heads
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

            // Player (Ship) — hidden dark, blinks through the invuln grace
            const blink = tickN < invulnUntil && Math.floor(tickN / 6) % 2 === 0
            if (playerAlive() && !blink) {
                ctx.fillStyle = 'white'
                // Triangle
                ctx.beginPath()
                ctx.moveTo(state.player.x + 8, state.player.y)
                ctx.lineTo(state.player.x + 16, state.player.y + 16)
                ctx.lineTo(state.player.x, state.player.y + 16)
                ctx.fill()
            }

            // UI — title + score right, spare lives bottom-left (arcade layout)
            ctx.fillStyle = 'white'
            ctx.font = '14px monospace'
            ctx.textAlign = 'left'
            ctx.fillText("CENTIPEDE", 10, 20)
            if (!isAttractMode) {
                ctx.textAlign = 'right'
                ctx.fillText(`SCORE ${state.score}`, state.width - 10, 20)
                ctx.textAlign = 'left'
                for (let i = 0; i < Math.max(0, lives - 1); i++) {
                    ctx.beginPath()
                    ctx.arc(16 + i * 18, state.height - 12, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            if (over) {
                ctx.fillStyle = '#ffffff'
                ctx.textAlign = 'center'
                ctx.font = '22px monospace'
                ctx.fillText('GAME OVER', state.width / 2, state.height / 2 - 8)
                ctx.font = '14px monospace'
                ctx.fillText(`FINAL SCORE ${state.score}`, state.width / 2, state.height / 2 + 14)
                if (Math.floor(tickN / 30) % 2 === 0) {
                    ctx.font = '12px monospace'
                    ctx.fillText('PRESS ANY KEY TO PLAY AGAIN', state.width / 2, state.height / 2 + 36)
                }
            }

            if (isAttractMode) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, state.width, state.height)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, state.width, state.height)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
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

        // QA contract (#377)
        exposeGame({
            id: 'centipede',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                seed = s >>> 0
                rand = seedRng(seed)
                state.score = 0
                lives = START_LIVES
                over = false
                isAttractMode = false
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
                if (state.width > 0) init()
            },
            tick: (pad) => {
                if (over) { tickN += 1; return }
                keys.ArrowLeft = !!pad.left
                keys.ArrowRight = !!pad.right
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                if (pad.a) fireBullet()
                update()
            },
            state: () => ({
                tick: tickN, score: state.score, done: over, seed: seed, lives,
                segments: state.centipedes.length,
                heads: state.centipedes.filter(c => c.head).length,
                mushrooms: state.mushrooms.length,
                playerX: Math.round(state.player.x),
                playerY: Math.round(state.player.y),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: rand closure is not JSON-serializable (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score: state.score, done: over, seed: seed, lives,
        }))

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleUp)
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
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CENTIPEDE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default CentipedeGame

import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { createSim, ROOMS, COLORS, GW, GH, PLAYER_SPEED, R, WALL_T, SIDE_GAP_Y, SIDE_GAP_H } from './sim.js'

const AdventureGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        let viewWidth = 0, viewHeight = 0

        // =============================================
        // RUN STATE (#1473 batch 18)
        // The whole world lives in sim.js on one seeded mulberry32 stream;
        // every human start re-rolls the seed unless ?seed=N pins it.
        // =============================================
        let seed = 1979
        let sim = createSim(seedRng(seed))
        let isAttractMode = true
        let dropQueued = false
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        // Attract wander runs on its own fixed stream: pre-start draws must
        // never consume the pinned game stream.
        const attractRand = seedRng(1979)
        let attractDir = { x: 0, y: 0 }
        let attractTimer = 0

        const terminal = () => sim.won || sim.dead

        const startRun = (forcedSeed) => {
            seed = forcedSeed !== undefined && forcedSeed !== null
                ? forcedSeed >>> 0
                : (seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))
            sim = createSim(seedRng(seed))
            isAttractMode = false
            dropQueued = false
            Object.keys(keys).forEach((k) => { keys[k] = false })
        }

        // =============================================
        // RESIZE
        // =============================================
        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                viewWidth = width
                viewHeight = height
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // =============================================
        // INPUT
        // =============================================
        const handleKeyDown = (e) => {            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode) {
                startRun()
            }
            if (terminal()) {
                startRun()
                return
            }
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = true
                e.preventDefault()
            }
            // Drop item
            if (e.code === 'Space') {
                dropQueued = true
                e.preventDefault()
            }
        }
        const handleKeyUp = (e) => {
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = false
            }
        }
        // Any tap starts (attract) or restarts (terminal) — phone parity (#1473).
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (isAttractMode || terminal()) startRun()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        // =============================================
        // SIM TICK — attract AI drives dx/dy as floats; keys as ±speed.
        // Sound events are produced by the pure sim and played here.
        // =============================================
        const playEvents = () => {
            for (const ev of sim.events) {
                if (ev === 'pickup') audioController.playTone(600, 0.05, 'square')
                else if (ev === 'gate') audioController.playSweep(200, 600, 0.3, 'square')
                else if (ev === 'slay') { audioController.playNoise(0.2, 0.3); audioController.playSweep(800, 200, 0.3, 'sawtooth') }
                else if (ev === 'death') { audioController.playNoise(0.4, 0.5); audioController.playSweep(500, 50, 0.5, 'sawtooth') }
                else if (ev === 'steal') audioController.playTone(900, 0.04, 'triangle')
                else if (ev === 'bridge') audioController.playNoise(0.1, 0.25)
                else if (ev === 'secret') { audioController.playSweep(300, 900, 0.5, 'triangle'); audioController.playTone(1200, 0.1, 'square') }
                else if (ev === 'win') audioController.playSweep(400, 1200, 1.0, 'square')
            }
            sim.events.length = 0
        }

        const update = () => {
            let dx = 0, dy = 0
            if (isAttractMode) {
                // AI: wander around
                attractTimer--
                if (attractTimer <= 0) {
                    attractDir = { x: (attractRand() - 0.5) * 2, y: (attractRand() - 0.5) * 2 }
                    attractTimer = 60 + Math.floor(attractRand() * 120)
                }
                dx = attractDir.x * PLAYER_SPEED * 0.5
                dy = attractDir.y * PLAYER_SPEED * 0.5
            } else {
                if (keys.ArrowUp) dy = -PLAYER_SPEED
                if (keys.ArrowDown) dy = PLAYER_SPEED
                if (keys.ArrowLeft) dx = -PLAYER_SPEED
                if (keys.ArrowRight) dx = PLAYER_SPEED
            }
            sim.step({ dx, dy, drop: dropQueued })
            dropQueued = false
            playEvents()
        }

        // =============================================
        // DRAWING
        // =============================================
        const drawRoom = (room) => {
            ctx.fillStyle = room.bg
            ctx.fillRect(0, 0, GW, GH)

            // Draw walls
            ctx.fillStyle = room.bg === COLORS.black ? '#222222' : darken(room.bg)
            for (const wall of room.walls) {
                ctx.fillStyle = room.bg === COLORS.black ? '#333333' : darken(room.bg)
                ctx.fillRect(wall.x, wall.y, wall.w, wall.h)
            }

            // Draw gate (portcullis)
            if (room.gate) {
                if (!sim.gateOpen[room.gateKey]) {
                    ctx.fillStyle = room.gateColor
                    // Portcullis bars
                    for (let gx = 60; gx < 100; gx += 6) {
                        ctx.fillRect(gx, 0, 2, 28)
                    }
                    for (let gy = 4; gy < 28; gy += 6) {
                        ctx.fillRect(58, gy, 44, 2)
                    }
                } else {
                    // Open gate — just the frame
                    ctx.strokeStyle = room.gateColor
                    ctx.lineWidth = 2
                    ctx.strokeRect(58, 0, 44, 6)
                }
            }

            // The secret door: a sealed barrier until the dot rite, then a
            // blinking gap (the original's rapidly flashing barrier)
            if (room.id === R.DRAGON_LAIR || room.id === R.SECRET) {
                const doorX = room.id === R.DRAGON_LAIR ? 0 : GW - WALL_T
                if (!sim.secretOpen) {
                    ctx.fillStyle = room.bg === COLORS.black ? '#333333' : darken(room.bg)
                    ctx.fillRect(doorX, SIDE_GAP_Y, WALL_T, SIDE_GAP_H)
                } else if (sim.tick % 10 < 5) {
                    ctx.fillStyle = COLORS.cyan
                    ctx.fillRect(doorX, SIDE_GAP_Y, WALL_T, 2)
                    ctx.fillRect(doorX, SIDE_GAP_Y + SIDE_GAP_H - 2, WALL_T, 2)
                }
            }
        }

        const darken = (hex) => {
            const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40)
            const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40)
            const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40)
            return `rgb(${r},${g},${b})`
        }

        const drawPlayer = () => {
            const player = sim.player
            if (sim.dead) {
                // Death flash
                if (sim.tick % 8 < 4) {
                    ctx.fillStyle = COLORS.red
                    ctx.fillRect(player.x - 2, player.y - 2, player.w + 4, player.h + 4)
                }
                return
            }

            // The player is a simple square (like the original)
            ctx.fillStyle = COLORS.yellow
            ctx.fillRect(player.x, player.y, player.w, player.h)
            // Small arrow showing facing direction (cosmetic)
        }

        const drawItem = (item) => {
            if (item.room !== sim.room || item.carried) return

            ctx.fillStyle = item.color

            if (item.id === 'sword') {
                // Sword shape: blade + handle
                ctx.fillRect(item.x + 2, item.y, 2, 14)
                ctx.fillRect(item.x, item.y + 10, 6, 2)
                ctx.fillStyle = '#a08000'
                ctx.fillRect(item.x + 1, item.y + 12, 4, 4)
            } else if (item.id.endsWith('Key')) {
                // Key shape
                ctx.fillRect(item.x + 2, item.y, 4, 8)
                ctx.fillRect(item.x, item.y, 8, 3)
                ctx.fillRect(item.x + 2, item.y + 8, 2, 6)
                ctx.fillRect(item.x + 4, item.y + 10, 3, 2)
                ctx.fillRect(item.x + 4, item.y + 13, 2, 2)
            } else if (item.id === 'chalice') {
                // Chalice / goblet shape
                ctx.fillRect(item.x + 2, item.y, 6, 3)
                ctx.fillRect(item.x + 3, item.y + 3, 4, 2)
                ctx.fillRect(item.x + 4, item.y + 5, 2, 5)
                ctx.fillRect(item.x + 2, item.y + 10, 6, 2)
                // Sparkle
                if (sim.tick % 20 < 10) {
                    ctx.fillStyle = COLORS.white
                    ctx.fillRect(item.x + 3, item.y + 1, 1, 1)
                }
            } else if (item.id === 'bridge') {
                // Bridge: horizontal plank
                ctx.fillRect(item.x, item.y, item.w, 2)
                ctx.fillRect(item.x, item.y + item.h - 2, item.w, 2)
                ctx.fillRect(item.x, item.y, 2, item.h)
                ctx.fillRect(item.x + item.w - 2, item.y, 2, item.h)
            } else if (item.id === 'magnet') {
                // Magnet: U shape
                ctx.fillRect(item.x, item.y, 3, item.h)
                ctx.fillRect(item.x + item.w - 3, item.y, 3, item.h)
                ctx.fillRect(item.x, item.y, item.w, 3)
                ctx.fillStyle = COLORS.red
                ctx.fillRect(item.x, item.y + item.h - 3, 3, 3)
                ctx.fillRect(item.x + item.w - 3, item.y + item.h - 3, 3, 3)
            } else if (item.id === 'dot') {
                // The gray dot: one pixel, visible only loose in the sealed
                // Red Maze — the original dot is invisible in most rooms
                // (and invisible while carried)
                if (sim.room !== R.RED_LAB_1 && sim.room !== R.RED_LAB_2) return
                ctx.fillStyle = COLORS.grey
                ctx.fillRect(item.x, item.y, 1, 1)
            } else {
                ctx.fillRect(item.x, item.y, item.w, item.h)
            }
        }

        const drawDragon = (dragon) => {
            if (dragon.room !== sim.room) return
            if (!dragon.alive) {
                // Dead dragon — sideways, faded
                ctx.globalAlpha = 0.4
                ctx.fillStyle = dragon.color
                ctx.fillRect(dragon.x - 8, dragon.y + 4, 24, 6)
                ctx.globalAlpha = 1
                return
            }

            ctx.fillStyle = dragon.color
            const dx = dragon.x, dy = dragon.y

            // Body
            ctx.fillRect(dx, dy, 12, 16)

            // Head (with mouth)
            if (dragon.mouthOpen) {
                // Open mouth — top jaw
                ctx.fillRect(dx + 10, dy - 2, 10, 5)
                // Bottom jaw
                ctx.fillRect(dx + 10, dy + 6, 10, 5)
                // Teeth
                ctx.fillStyle = COLORS.white
                ctx.fillRect(dx + 16, dy + 3, 2, 2)
                ctx.fillRect(dx + 16, dy + 6, 2, 2)
                ctx.fillStyle = dragon.color
            } else {
                // Closed mouth
                ctx.fillRect(dx + 10, dy + 2, 8, 6)
            }

            // Eye
            ctx.fillStyle = COLORS.white
            ctx.fillRect(dx + 12, dy + 1, 2, 2)
            ctx.fillStyle = COLORS.black
            ctx.fillRect(dx + 13, dy + 1, 1, 1)

            // Legs
            ctx.fillStyle = dragon.color
            ctx.fillRect(dx + 1, dy + 16, 3, 5)
            ctx.fillRect(dx + 8, dy + 16, 3, 5)

            // Tail
            ctx.fillRect(dx - 6, dy + 10, 6, 3)
            ctx.fillRect(dx - 8, dy + 8, 3, 3)

            // Wings (flap)
            if (sim.tick % 20 < 10) {
                ctx.fillRect(dx + 2, dy - 6, 8, 4)
            } else {
                ctx.fillRect(dx + 2, dy - 4, 8, 3)
            }
        }

        const drawBat = () => {
            if (sim.bat.room !== sim.room) return

            ctx.fillStyle = COLORS.purple
            const bx = sim.bat.x, by = sim.bat.y

            // Body
            ctx.fillRect(bx + 3, by + 3, 4, 5)

            // Wings (flap animation)
            if (sim.tick % 12 < 6) {
                ctx.fillRect(bx, by, 3, 6)
                ctx.fillRect(bx + 7, by, 3, 6)
            } else {
                ctx.fillRect(bx, by + 3, 3, 4)
                ctx.fillRect(bx + 7, by + 3, 3, 4)
            }

            // Eyes
            ctx.fillStyle = COLORS.white
            ctx.fillRect(bx + 3, by + 3, 1, 1)
            ctx.fillRect(bx + 6, by + 3, 1, 1)
        }

        const draw = () => {
            ctx.fillStyle = COLORS.black
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            const scale = Math.min(viewWidth / GW, viewHeight / GH) * 0.95
            const offsetX = (viewWidth - GW * scale) / 2
            const offsetY = (viewHeight - GH * scale) / 2

            ctx.save()
            ctx.translate(offsetX, offsetY)
            ctx.scale(scale, scale)

            // Room background & walls
            drawRoom(ROOMS[sim.room])

            // Items in this room
            for (const item of sim.items) {
                drawItem(item)
            }

            // Carried item (draw at player position)
            if (sim.carrying) {
                const item = sim.items.find((i) => i.id === sim.carrying)
                if (item) {
                    const savedRoom = item.room
                    item.room = sim.room  // force draw
                    item.carried = false
                    drawItem(item)
                    item.room = savedRoom
                    item.carried = true
                }
            }

            // Dragons
            for (const dragon of sim.dragons) {
                drawDragon(dragon)
            }

            // Bat
            drawBat()

            // Player
            drawPlayer()

            // The creator's room — "Created by Warren Robinett", the text
            // changing color continuously, per the original easter egg
            if (sim.room === R.SECRET && !isAttractMode) {
                const cols = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.cyan, COLORS.purple, COLORS.white]
                ctx.fillStyle = cols[Math.floor(sim.tick / 15) % cols.length]
                ctx.font = '8px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('Created by', GW / 2, GH / 2 - 8)
                ctx.fillText('Warren Robinett', GW / 2, GH / 2 + 4)
            }

            // UI overlays
            if (isAttractMode) {
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, GW, GH)
                ctx.textAlign = 'center'
                ctx.fillStyle = COLORS.yellow
                ctx.font = '10px monospace'
                ctx.fillText('ADVENTURE', GW / 2, GH * 0.30)
                for (const l of attractFrame(sim.tick, GW, GH)) {
                    ctx.fillStyle = l.col
                    ctx.font = `${l.size}px monospace`
                    ctx.fillText(l.text, l.x, l.y)
                }
            }

            if (sim.won) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = COLORS.yellow
                ctx.font = '10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('YOU WON!', GW / 2, GH / 2 - 10)
                ctx.fillStyle = COLORS.white
                ctx.font = '7px monospace'
                ctx.fillText('CHALICE RETURNED', GW / 2, GH / 2 + 6)
                ctx.fillText('PRESS ANY KEY', GW / 2, GH / 2 + 20)
            }

            if (sim.dead && sim.deathTimer <= 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = COLORS.red
                ctx.font = '10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('SLAIN BY DRAGON', GW / 2, GH / 2 - 6)
                ctx.fillStyle = COLORS.white
                ctx.font = '7px monospace'
                ctx.fillText('PRESS ANY KEY', GW / 2, GH / 2 + 10)
            }

            // Room name HUD
            if (!isAttractMode && !sim.won) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, 0, GW, 10)
                ctx.fillStyle = COLORS.white
                ctx.font = '6px monospace'
                ctx.textAlign = 'left'
                ctx.fillText(ROOMS[sim.room].name, 4, 7)
                if (sim.carrying) {
                    ctx.textAlign = 'right'
                    const item = sim.items.find((i) => i.id === sim.carrying)
                    ctx.fillText(item ? item.name : '', GW - 4, 7)
                }
            }

            ctx.restore()
        }

        // =============================================
        // GAME LOOP
        // =============================================
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

        // QA contract (#377) — scripted drives get the seeded world too.
        exposeGame({
            id: 'adventure',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                startRun(s >>> 0)
            },
            tick: (pad) => {
                if (isAttractMode) startRun()
                if (sim.won) return
                if (sim.dead && sim.deathTimer <= 0) return
                keys.ArrowLeft = !!pad.left
                keys.ArrowRight = !!pad.right
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                dropQueued = dropQueued || !!pad.a
                update()
            },
            state: () => ({
                tick: sim.tick,
                score: sim.score,
                done: sim.won || (sim.dead && sim.deathTimer <= 0),
                seed,
                room: sim.room,
                carrying: sim.carrying,
                lives: null, // the 1993 cart has no lives — one bite kills (#1473 honesty)
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded rand closure is not JSON-serializable (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: sim.tick,
            score: sim.score,
            done: sim.won || (sim.dead && sim.deathTimer <= 0),
            seed: seed,
            room: sim.room,
            carrying: sim.carrying,
        }))

        return () => {
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
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
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ADVENTURE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default AdventureGame

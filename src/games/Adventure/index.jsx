import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { makeRoute, watchVoice } from './route.js'
import { createSim, ROOMS, COLORS, GW, GH, PLAYER_SPEED, R, WALL_T, SIDE_GAP_Y, SIDE_GAP_H, GATE_ZONE, ROOM_WIPE_TICKS, VARIANTS, DEFAULT_VARIANT, stateHash } from './sim.js'

const AdventureGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const [watching, setWatching] = React.useState(false) // #1637 WATCH: route.js drives the quest
    const watchingRef = useRef(false)
    const [uiMode, setUiMode] = React.useState('attract') // gates the watch pill (play) / pill pair (attract)

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
        let watcher = null // #1637 the seated route (route.js — the drivers adventurecheck wins with)
        let declineMsg = null // #1845 — the honest decline taught on canvas (~1.5s)
        let declineTtl = 0
        const voiceLog = [] // #1845 — seat-voice receipt, harness-observed
        let uiModeVal = 'attract'
        const showUi = (m) => { if (uiModeVal !== m) { uiModeVal = m; setUiMode(m) } }
        // #1572 item 3 — SELECT GAME: the cart boots to its variant screen.
        // The attract shows the number (dot matrix, big); left/right cycles
        // the pick, any other key or a tap starts on it. ?variant=N pins the
        // pick the way ?seed=N pins the world.
        const N_VARIANTS = Object.keys(VARIANTS).length
        const qv = parseInt(new URLSearchParams(window.location.search).get('variant'), 10)
        let variant = qv >= 1 && qv <= N_VARIANTS ? qv : DEFAULT_VARIANT
        const makeAttractSim = () => createSim(seedRng(1979), variant)
        const setVariant = (v) => {
            variant = ((v - 1 + N_VARIANTS) % N_VARIANTS) + 1
            if (isAttractMode) sim = makeAttractSim()  // the demo shows the picked variant
        }
        let sim = makeAttractSim()
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
            sim = createSim(seedRng(seed), variant)
            isAttractMode = false
            dropQueued = false
            watcher = null // #1637: the old route ends with the old run
            declineMsg = null; declineTtl = 0; voiceLog.length = 0 // #1845: new run, clean slate
            if (watchingRef.current) { watchingRef.current = false; setWatching(false) }
            showUi('play')
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

            // #1637 WATCH: Y seats route.js at any live state (the guide
            // re-decides every tick); any driving key takes over; Y toggles.
            if (isWatchKey(e)) {
                if (isAttractMode || terminal()) startRun()
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); watcher = null; playWatchStop() }
                else if (!(sim.won || sim.dead)) {
                    watcher = makeRoute(sim)
                    watchingRef.current = true; setWatching(true); playWatchStart()
                    // #1845: the cart's own voice stacked after the shared blip —
                    // script carts sing one note, the shuffle's adaptive route another.
                    const v = watchVoice(sim)
                    audioController.playTone(v.tone, 0.09, 'square', 0.05, 0.15)
                    voiceLog.push(`${v.driver}:${sim.variant}`)
                }
                e.preventDefault()
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) {
                watchingRef.current = false; setWatching(false); watcher = null; playWatchStop()
            }

            if (isAttractMode) {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    setVariant(variant + (e.code === 'ArrowRight' ? 1 : -1))
                    e.preventDefault()
                    return
                }
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
            if (declineTtl > 0 && --declineTtl === 0) declineMsg = null // #1845 ~1.5s of lesson
            // #1637: a run that ends in the player's (or the dragon's) hands
            // releases the guide silently — the route already said its piece.
            if (watchingRef.current && (sim.won || sim.dead)) { watchingRef.current = false; setWatching(false); watcher = null }
            if (sim.won || (sim.dead && sim.deathTimer <= 0)) showUi('over')
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
                let w = null
                if (watchingRef.current && watcher) {
                    const r = watcher.next()
                    if (r.done) {
                        // honest handback: the guide ran out of proven road
                        watchingRef.current = false; setWatching(false); watcher = null; playWatchStop()
                        // #1845 — teach the decline in the player's own language:
                        // the blip alone was trivia, the words are the lesson. A run
                        // that ended by winning or dying already spoke for itself.
                        if (!(sim.won || sim.dead)) { declineMsg = 'NO ROUTE FROM HERE'; declineTtl = 90 }
                    } else w = r.value || {}
                }
                if (w) {
                    dx = w.dx || 0
                    dy = w.dy || 0
                    if (w.drop) dropQueued = true
                } else {
                    if (keys.ArrowUp) dy = -PLAYER_SPEED
                    if (keys.ArrowDown) dy = PLAYER_SPEED
                    if (keys.ArrowLeft) dx = -PLAYER_SPEED
                    if (keys.ArrowRight) dx = PLAYER_SPEED
                }
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
                    // #1572 gate-rite affordance: a threshold mat below the
                    // portcullis marks where dropping the key opens the gate.
                    // Quiet at rest; while the player stands there carrying the
                    // matching key it glints (blinking white tick) — the rite
                    // is one Space away. Teaches the verb without a manual.
                    const glint = sim.afford === room.gateKey
                    ctx.globalAlpha = glint ? 0.9 : 0.25
                    ctx.fillStyle = room.gateColor
                    ctx.fillRect(56, 30, 48, 8)
                    if (glint && sim.tick % 14 < 7) {
                        ctx.fillStyle = COLORS.white
                        ctx.fillRect(56, 30, 48, 2)
                    }
                    ctx.globalAlpha = 1
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
                // A quiet twinkle on the resting cup (the chalice is always the
                // brightest thing in its room).
                if (sim.tick % 20 < 10) {
                    ctx.fillStyle = COLORS.white
                    ctx.fillRect(item.x + 3, item.y + 1, 1, 1)
                }
                // #1588: the goal item sparkles harder in hand — a white/yellow
                // star that alternates while carried (sim.sparkle is true only
                // when the chalice is being held). Palette law: only COLORS.white
                // and COLORS.yellow, no new hues.
                if (sim.sparkle) {
                    if (sim.tick % 16 < 8) {
                        ctx.fillStyle = COLORS.white
                        ctx.fillRect(item.x + 4, item.y - 2, 2, 8)
                        ctx.fillRect(item.x + 1, item.y + 1, 8, 2)
                    } else {
                        ctx.fillStyle = COLORS.yellow
                        ctx.fillRect(item.x + 4, item.y - 1, 2, 6)
                        ctx.fillRect(item.x + 2, item.y + 1, 6, 2)
                    }
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

            // Head (with mouth). #1588: while the dragon hunts with its maw open
            // the jaws alternate on sim.chew — a 2-frame chew, not a frozen grin.
            // A calm/distant/slain dragon keeps the closed head drawn below.
            if (dragon.mouthOpen) {
                if (sim.chew) {
                    // Wide open — the bite frame: top jaw, bottom jaw, fangs.
                    ctx.fillRect(dx + 10, dy - 2, 10, 5)
                    ctx.fillRect(dx + 10, dy + 6, 10, 5)
                    ctx.fillStyle = COLORS.white
                    ctx.fillRect(dx + 16, dy + 3, 2, 2)
                    ctx.fillRect(dx + 16, dy + 6, 2, 2)
                    ctx.fillStyle = dragon.color
                } else {
                    // Snapped shut mid-chew: both jaws close onto the gap so the
                    // mouth visibly clamps as it chews.
                    ctx.fillRect(dx + 10, dy + 1, 10, 4)
                    ctx.fillRect(dx + 10, dy + 5, 10, 4)
                    ctx.fillStyle = COLORS.white
                    ctx.fillRect(dx + 16, dy + 4, 2, 2)
                    ctx.fillStyle = dragon.color
                }
            } else {
                // Closed mouth (not hunting)
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
                for (const l of attractFrame(sim.tick, GW, GH, variant)) {
                    ctx.fillStyle = l.col
                    ctx.font = `${l.size}px monospace`
                    ctx.fillText(l.text, l.x, l.y)
                }
                // #1654 — the discoverability line, in attract before the first Y.
                ctx.fillStyle = '#9fe39f'
                ctx.font = '6px monospace'
                ctx.fillText(WATCH_ATTRACT_HINT, GW / 2, GH - 5)
            }

            // #1845 — the honest decline, dot-matrix green like the attract hint.
            if (declineMsg && !isAttractMode && !(sim.won || sim.dead)) {
                ctx.fillStyle = '#9fe39f'
                ctx.font = '7px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(declineMsg, GW / 2, GH * 0.42)
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

            // #1588 room-change flash: the cart redraws a new room with a hard
            // burst. Sweep a bright band top-to-bottom and fade it across the wipe
            // window so crossing a doorway reads as a cut, not a slow dissolve.
            // Never in attract (there is no run to transition into). The phase is
            // tick-driven (no wall clock), so replays and screenshots are stable.
            if (sim.wipe && !isAttractMode) {
                const phase = (sim.tick - sim.wipeAt) / ROOM_WIPE_TICKS
                const band = 14
                const wy = phase * (GH + band) - band
                ctx.globalAlpha = 0.85 * (1 - phase)
                ctx.fillStyle = COLORS.white
                ctx.fillRect(0, wy, GW, band)
                ctx.globalAlpha = 1
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
                variant = DEFAULT_VARIANT   // harness replays run the classic cart
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
                hash: stateHash(sim), // #1591: the nightly softlock detector reads state().hash —
                                     // a live world must change it every tick (see sim.js stateHash)
                variant: sim.variant, // #1572 item 3: the live SELECT GAME pick
                room: sim.room,
                carrying: sim.carrying,
                afford: sim.afford, // #1572: key whose gate the player can open from here (null otherwise)
                // #1568: live position carrier — boredomaudit's POSITION_KEYS. Without
                // x/y the audit calls a sprinting world BLIND (motion is measured, not inferred).
                x: sim.player.x,
                y: sim.player.y,
                lives: null, // the 1993 cart has no lives — one bite kills (#1473 honesty)
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded rand closure is not JSON-serializable (#391).
        })

        // #1637 WATCH probes (harness-visible state of the seat)
        window.__advTest = {
            watching: () => watchingRef.current,
            watchSfx: watchSfxLog,
            watchVoiceLog: () => voiceLog.slice(), // #1845 seat-voice receipts
            declineMsg: () => declineMsg,           // #1845 canvas decline lesson
            probe: () => ({
                tick: sim.tick,
                room: sim.room,
                carrying: sim.carrying,
                x: sim.player.x,
                y: sim.player.y,
                score: sim.score,
                won: sim.won,
                dead: sim.dead,
            }),
            press: (code) => { keys[code] = true; setTimeout(() => { keys[code] = false }, 120) },
        }

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: sim.tick,
            score: sim.score,
            done: sim.won || (sim.dead && sim.deathTimer <= 0),
            seed: seed,
            room: sim.room,
            carrying: sim.carrying,
            x: sim.player.x, // #1568 motion carrier for the production report too
            y: sim.player.y,
        }))

        return () => {
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeGame()
            unexposeFeedbackState()
            delete window.__advTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {/* #1637 WATCH — route.js walks the quest; any input takes over. */}
                {uiMode === 'play' && watching && <WatchToast className="absolute z-50" />}
                {uiMode === 'play' && !paused && (
                    <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
                {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
                {uiMode === 'attract' && !paused && (
                    <div className="absolute z-[70] left-1/2 -translate-x-1/2 pointer-events-auto" style={{ bottom: '24%' }}>
                        <AttractWatchButton />
                    </div>
                )}
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ADVENTURE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default AdventureGame

import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const PitfallGame = () => {
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
        const SCREEN_WIDTH = 800 // Virtual Width
        const SCREEN_HEIGHT = 600
        const GROUND_Y = 450
        const UNDERGROUND_Y = 550
        const PLAYER_SPEED = 4
        const JUMP_FORCE = -12
        const GRAVITY = 0.5

        // GAME STATE
        let currentScreen = 0
        let roomType = 'ground' // Added state for background rendering
        let gameTime = 0
        let score = 2000
        let timeLeft = 20 * 60 // 20 minutes
        let lives = 3
        let gameOver = false
        let isAttractMode = true
        const gameConfig = GAMES.find(g => g.label === 'PITFALL')

        // INPUT
        const keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        }

        // PLAYER
        let player = {
            x: 50,
            y: GROUND_Y,
            w: 16,
            h: 32,
            vx: 0,
            vy: 0,
            state: 'idle', // idle, run, jump, climb, swing, dead
            onGround: true,
            onLadder: false,
            vine: null, // Attach to vine object
            vineCooldown: 0
        }

        // PALETTE
        const PALETTE = {
            g: '#228822', // Green (Shirt)
            w: '#DDDDDD', // White (Pants)
            s: '#FFCCAA', // Skin
            b: '#000000', // Black
            r: '#FF4400', // Red (Fire/Scorpion Tail)
            l: '#552200', // Log Brown
            y: '#FFD700', // Gold
            e: '#00AA00', // Snake Green
            h: '#FFFFFF', // White/Grey (Scorpion Body)
            n: '#331100'  // Dark Brown (Scorpion Legs)
        }

        const SPRITES = {
            harry_idle: [
                "  sss  ",
                "  sss  ",
                "  ggg  ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                "  www  ",
                "  w w  ",
                "  w w  "
            ],
            harry_run_0: [
                "  sss  ",
                "  sss  ",
                "  ggg  ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                "  www  ",
                " w   w ",
                "w     w"
            ],
            harry_run_1: [
                "  sss  ",
                "  sss  ",
                "  ggg  ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                "  www  ",
                "  w w  ",
                "  w w  "
            ],
            harry_run_2: [
                "  sss  ",
                "  sss  ",
                "  ggg  ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                "  www  ",
                "   w   ",
                "  w w  "
            ],
            harry_jump: [
                "  sss  ",
                "  sss  ",
                " ggggg ",
                " g.g.g ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                " w   w ",
                "w     w",
                "w     w"
            ],
            harry_climb: [
                "  sss  ",
                "  sss  ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                " w   w ",
                " w   w ",
                " w   w "
            ],
            harry_swing: [
                "   s   ",
                " sssss ",
                " ggggg ",
                " ggggg ",
                " ggggg ",
                "  www  ",
                "  www  ",
                "   w   ",
                "  w    ",
                " w     "
            ],
            log: [
                "  lll  ",
                " lllll ",
                "lllllll",
                " lllll ",
                "  lll  "
            ],
            scorpion: [
                "h     r",
                "hh   rr",
                "nhhhhhr",
                " n n n "
            ],
            snake: [
                "   e   ",
                "  e e  ",
                "  e e  ",
                " eeeee ",
                "e e e e"
            ],
            fire: [
                "  r  ",
                " rrr ",
                "rrrrr",
                " rrr "
            ],
            wall: [
                "bbbbbb",
                "b....b",
                "b....b",
                "b....b",
                "b....b",
                "bbbbbb"
            ],
            moneybag: [
                "  yy  ",
                " yyyyy ",
                "yyyyyyy",
                "yyyyyyy",
                " yyyyy "
            ],
            bar: [
                "yyyyyy",
                "yyyyyy",
                "yyyyyy"
            ],
            ring: [
                "  yy  ",
                " y  y ",
                " y  y ",
                "  yy  "
            ]
        }

        const drawSprite = (ctx, spriteKey, x, y, scale = 2, flipX = false) => {
            const sprite = SPRITES[spriteKey]
            if (!sprite) return

            const rows = sprite.length
            const cols = sprite[0].length

            ctx.save()
            // If flipX, translate to center of sprite position, scale -1, 1, then translate back?
            // Easier: iterate columns backwards

            for (let r = 0; r < rows; r++) {
                const rowStr = sprite[r]
                for (let c = 0; c < cols; c++) {
                    const char = rowStr[c]
                    if (char !== ' ' && char !== '.') {
                        const color = PALETTE[char] || '#FF00FF'
                        ctx.fillStyle = color

                        let drawX
                        if (flipX) {
                            // Flip around center. 
                            // If x is left edge, x + (cols - 1 - c) * scale ?
                            drawX = x + (cols - 1 - c) * scale
                        } else {
                            drawX = x + c * scale
                        }

                        ctx.fillRect(drawX, y + r * scale, scale, scale)
                    }
                }
            }
            ctx.restore()
        }

        // WORLD DEFINITION (LFSR)
        // Authentic Pitfall LFSR to generate 255 rooms
        // Seed: 0xC4 (196)

        const rightLFSR = (byte) => {
            // b0 = b3 + b4 + b5 + b7
            const bit = ((byte >> 3) & 1) ^ ((byte >> 4) & 1) ^ ((byte >> 5) & 1) ^ ((byte >> 7) & 1)
            return ((byte << 1) & 0xFF) | bit
        }

        const leftLFSR = (byte) => {
            // b7 = b4 + b5 + b6 + b0
            const bit = ((byte >> 4) & 1) ^ ((byte >> 5) & 1) ^ ((byte >> 6) & 1) ^ ((byte >> 0) & 1)
            return (byte >> 1) | (bit << 7)
        }

        // Cache for performance/lookup (optional, but good for debugging)
        const getRoomByte = (index) => {
            let byte = 0xC4 // Start Seed
            for (let i = 0; i < index; i++) {
                byte = rightLFSR(byte)
            }
            return byte
        }

        // ENTITIES (Active per screen)
        let activeObjects = []

        const loadScreen = (index) => {
            // Handle wrapping
            if (index < 0) index = 255
            if (index > 255) index = 0

            currentScreen = index
            const roomByte = getRoomByte(index)

            // DECODE ROOM BYTE
            // Bits 0-2: Object (Log, Fire, Snake, etc.)
            // Bits 3-5: Scene Type (Ground, Water, Pit, etc.)
            // Bi 6-7: Trees (Visuals only, ignored for now)

            const objBits = roomByte & 0x07
            const typeBits = (roomByte >> 3) & 0x07

            let type = 'ground'
            let objects = []

            // Scene Types (3-5)
            // 100 (4): Crocodiles
            // 101 (5): Treasure (overrides objects)
            // 110 (6): Tar Pit
            // Others mapped to simple holes/water for now?
            // Actually: 
            // 000-011: Ground/Holes? 
            // Let's use simplified mapping based on bit patterns usually seen:
            if (typeBits === 4) type = 'water' // Crocs
            else if (typeBits === 6) type = 'quicksand' // Tar
            else if (typeBits === 0 || typeBits === 1 || typeBits === 2 || typeBits === 3) {
                // Open holes logic in original is complex, often 'water' or 'pit'
                // Let's map Evens to Ground, Odds to Water for variety if not special?
                // Original: 1xx is usually hazard. 0xx usually safe.
                if (typeBits & 1) type = 'pit'
            }

            // Treasures (101 -> 5)
            const hasTreasure = (typeBits === 5)
            if (hasTreasure) {
                // If treasure, it overrides ground objects
                // Treasure value derived from room index? Or fixed?
                // Original has specific values. We'll random or fixed.
                const values = [2000, 3000, 4000, 5000]
                const val = values[index % 4]
                // Wall? Bit 7 controls wall position in underground, maybe wall active here?
                // Let's keep it simple: Treasure replaces hazard.
                type = 'ground'
                objects.push({ type: 'treasure', x: 600, value: val })
                // Walls often appear with treasure
                if (roomByte & 0x80) objects.push({ type: 'wall', x: 400 })
            } else {
                // Standard Ground Objects
                // 0: Logs
                if (objBits === 0) objects.push({ type: 'log', x: 750, count: 3 }) // 3 logs
                // 1: Fire
                if (objBits === 1) objects.push({ type: 'fire', x: 500 }) // Fire
                // 2: Snake
                if (objBits === 2) objects.push({ type: 'snake', x: 450 })
                // 3: Scorpion?
                if (objBits === 3) objects.push({ type: 'scorpion', x: 600 })
                // 4-7: Walls?
                if (objBits >= 4) objects.push({ type: 'wall', x: 400 })
            }

            // Ladders — use bit 6 of room byte
            if (roomByte & 0x40) objects.push({ type: 'ladder', x: 400 })

            // Vines — spawn in pit/water rooms to give player an alternative
            if (type === 'water' || type === 'pit') {
                objects.push({ type: 'vine', x: 400, pivotX: 400, pivotY: 80, length: 200, angle: Math.PI / 4, vAngle: 0 })
            }

            // Apply Types
            // If we have a pit/water but no crocs/vine, it's a hole 
            roomType = type // persist to global

            currentScreen = index

            // Deep copy not needed as we generate fresh
            activeObjects = objects

            // Initialize dynamic objects
            activeObjects.forEach(obj => {
                if (obj.type === 'log') {
                    obj.vx = -3
                }
                if (obj.type === 'vine') {
                    obj.angle = Math.PI / 4 // Start swing
                    obj.vAngle = 0
                    obj.pivotX = obj.x
                    obj.pivotY = 100 // Tree branch height
                }
            })

            // Underground Check (Player Y)
            // If player is underground, we skip 3 rooms when moving!
        }

        // INIT
        const init = () => {
            try {
                loadScreen(0)
                window.addEventListener('keydown', handleKeyDown)
                window.addEventListener('keyup', handleKeyUp)
                window.addEventListener('resize', resize)
                resize()
                // canvas.focus() // Removing focus() as it might scroll or cause unexpected behavior on load
                animationFrameId = requestAnimationFrame(loop)
            } catch (e) {
                console.error("Pitfall Init Failed:", e)
                // Fallback Error Display
                ctx.fillStyle = '#000000'
                ctx.fillRect(0, 0, canvas.width, canvas.height)
                ctx.fillStyle = '#FF0000'
                ctx.font = '16px monospace'
                ctx.textAlign = 'left'
                ctx.fillText(`ERROR: ${e.message}`, 20, 100)

                // Try to show stack trace line
                const stackLine = e.stack ? e.stack.split('\n')[1] : ''
                ctx.fillText(stackLine, 20, 130)
            }
        }

        const resize = () => {
            if (!canvas || !ctx || !containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            if (width === 0 || height === 0) {
                setTimeout(resize, 100)
                return
            }
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

            ctx.imageSmoothingEnabled = false
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault()
            }
            if (isAttractMode) {
                isAttractMode = false
                Object.keys(keys).forEach(k => keys[k] = false)
            }
            if (gameOver) {
                gameOver = false
                lives = 3
                score = 2000
                player.x = 50
                player.y = GROUND_Y
                player.vy = 0
                player.vx = 0
                player.onGround = true
                player.state = 'idle'
                player.vine = null
                loadScreen(0)
                Object.keys(keys).forEach(k => keys[k] = false)
                return
            }
            if (e.code === 'Space') keys.Space = true
            if (e.code === 'ArrowUp') keys.ArrowUp = true
            if (e.code === 'ArrowDown') keys.ArrowDown = true
            if (e.code === 'ArrowLeft') keys.ArrowLeft = true
            if (e.code === 'ArrowRight') keys.ArrowRight = true
        }

        const handleKeyUp = (e) => {
            if (e.code === 'Space') keys.Space = false
            if (e.code === 'ArrowUp') keys.ArrowUp = false
            if (e.code === 'ArrowDown') keys.ArrowDown = false
            if (e.code === 'ArrowLeft') keys.ArrowLeft = false
            if (e.code === 'ArrowRight') keys.ArrowRight = false
        }

        const update = () => {
            if (pausedRef.current) return
            if (gameOver) return

            const dpr = window.devicePixelRatio || 1
            // Physics Scale for implementation simplification
            // Map 0-800 to canvas width
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY)

            // --- AI LOGIC (ATTRACT MODE) ---
            if (isAttractMode) {
                // Run Right
                keys.ArrowRight = true
                keys.ArrowLeft = false
                keys.ArrowUp = false
                keys.ArrowDown = false
                keys.Space = false

                // Jump Hazards
                if (player.onGround) {
                    // Check for hazards ahead
                    let hazard = false

                    // Holes
                    if (roomType === 'water' || roomType === 'pit' || roomType === 'quicksand') {
                        if (player.x > 200 && player.x < 300) hazard = true
                    }

                    // Objects
                    activeObjects.forEach(obj => {
                        if ((obj.type === 'log' || obj.type === 'wall' || obj.type === 'croc') &&
                            obj.x > player.x && obj.x - player.x < 100) {
                            hazard = true
                        }
                    })

                    if (hazard) keys.Space = true
                }
            }

            // --- PLAYER MOVEMENT ---
            if (player.vineCooldown > 0) player.vineCooldown--

            if (player.state !== 'swing') {
                if (keys.ArrowLeft) player.vx = -PLAYER_SPEED
                else if (keys.ArrowRight) player.vx = PLAYER_SPEED
                else player.vx = 0
            }

            // Jump
            if (keys.Space && player.onGround && player.state !== 'climb') {
                player.vy = JUMP_FORCE
                player.onGround = false
                player.state = 'jump'
                audioController.playTone(200, 0.1, 'square')
            }

            // Gravity
            if (!player.onGround && player.state !== 'climb' && player.state !== 'swing') {
                player.vy += GRAVITY
            }

            // Apply Velocity
            player.x += player.vx
            player.y += player.vy

            // --- COLLISIONS & INTERACTIONS ---

            // Ground/Floor
            // Simple: Ground is always at GROUND_Y unless in a pit
            let groundLevel = GROUND_Y

            // Pit/Water logic
            const isHole = (roomType === 'water' || roomType === 'pit' || roomType === 'quicksand')
            const inHoleZone = (player.x > 300 && player.x < 500) // Jumpable hole width

            if (isHole && inHoleZone) {
                // Player walks/falls into the hole
                if (player.y >= GROUND_Y && player.vy >= 0 && !player.onLadder && player.state !== 'jump' && player.state !== 'swing') {
                    // Apply gravity — player falls through
                    player.onGround = false
                    player.state = 'jump'
                }
                // If jumping over the hole, don't land — let gravity handle it
            } else {
                // Solid ground
                if (player.y > GROUND_Y && player.vy >= 0 && !player.onLadder) {
                    player.y = GROUND_Y
                    player.vy = 0
                    player.onGround = true
                    if (player.vx !== 0) player.state = 'run'
                    else player.state = 'idle'
                }
            }

            if (player.y > 700) {
                lives--
                if (lives <= 0) {
                    gameOver = true
                    return
                }
                player.x = 50
                player.y = GROUND_Y
                player.vy = 0
                player.vx = 0
                player.onGround = true
                player.state = 'idle'
                player.vine = null
                score -= 100
                audioController.playTone(100, 0.3, 'sawtooth')
            }


            // Objects
            let onVine = false
            activeObjects.forEach(obj => {
                // LOGS
                if (obj.type === 'log') {
                    obj.x += obj.vx
                    if (obj.x < 0) obj.x = SCREEN_WIDTH // Wrap

                    // Collision
                    if (Math.abs(player.x - obj.x) < 20 && Math.abs(player.y - GROUND_Y) < 10) {
                        if (player.state !== 'jump') {
                            score -= 1 // Constant drain? Or single hit?
                            // Simple "Trip" effect could be just score loss for now
                            // In original: Rolling logs trip you, losing points.
                        }
                    }
                }

                // FATAL HAZARDS
                if (['fire', 'snake', 'scorpion'].includes(obj.type)) {
                    if (Math.abs(player.x - obj.x) < 15 && Math.abs(player.y - GROUND_Y) < 10 && player.state !== 'jump') {
                        lives--
                        if (lives <= 0) {
                            gameOver = true
                            return
                        }
                        player.x = 50
                        player.y = GROUND_Y
                        player.vy = 0
                        player.vx = 0
                        player.onGround = true
                        player.state = 'idle'
                        score -= 100
                        audioController.playSweep(400, 100, 0.3, 'sawtooth')
                    }
                }

                // LADDERS
                if (obj.type === 'ladder') {
                    if (Math.abs(player.x - obj.x) < 10) {
                        if (keys.ArrowUp || keys.ArrowDown) {
                            player.state = 'climb'
                            player.onLadder = true
                            player.vx = 0
                            player.x = obj.x // Snap
                            if (keys.ArrowUp) player.y -= 2
                            if (keys.ArrowDown) player.y += 2
                        }
                    }
                }

                // VINES
                if (obj.type === 'vine') {
                    // Pendulum physics
                    obj.angle += Math.sin(gameTime * 0.05) * 0.001 // Simplify swing for now: constant swing
                    // Actually, proper pendulum
                    // angularAcc = -g/L * sin(theta)
                    const g = 0.4
                    const L = obj.length
                    const acc = -g / 10 * Math.sin(obj.angle)
                    obj.vAngle += acc
                    obj.angle += obj.vAngle
                    obj.vAngle *= 0.99 // Damping

                    // Force Swing to keep it moving for gameplay
                    if (Math.abs(obj.angle) < 0.1 && Math.abs(obj.vAngle) < 0.001) obj.vAngle = 0.02

                    const tipX = obj.pivotX + Math.sin(obj.angle) * L
                    const tipY = obj.pivotY + Math.cos(obj.angle) * L

                    // Grab Vine
                    if (player.state !== 'swing' && player.vineCooldown <= 0) {
                        // Check collision with vine tip
                        if (Math.abs(player.x - tipX) < 40 && Math.abs(player.y - tipY) < 60 && !player.onGround) {
                            player.state = 'swing'
                            player.vine = obj
                            player.onGround = false
                            player.vy = 0
                            score += 100 // Bonus for catch
                        }
                    }
                }

                // TREASURE
                if (obj.type === 'treasure' && !obj.collected) {
                    if (Math.abs(player.x - obj.x) < 20 && Math.abs(player.y - GROUND_Y) < 10) {
                        obj.collected = true
                        score += obj.value
                        audioController.playTone(800, 0.1, 'sine')
                        audioController.playTone(1200, 0.1, 'sine')
                    }
                }
            })

            // Swinging State
            if (player.state === 'swing' && player.vine) {
                const v = player.vine
                const tipX = v.pivotX + Math.sin(v.angle) * v.length
                const tipY = v.pivotY + Math.cos(v.angle) * v.length
                player.x = tipX
                player.y = tipY

                if (keys.Space) {
                    // Jump off
                    player.state = 'jump'
                    // Launch with momentum plus a bit of extra kick
                    player.vx = player.vine.vAngle * 120
                    if (player.vx > 0 && player.vx < 4) player.vx = 4
                    if (player.vx < 0 && player.vx > -4) player.vx = -4

                    if (player.vx > 8) player.vx = 8
                    if (player.vx < -8) player.vx = -8
                    player.vy = -10 // Higher jump off
                    player.vine = null
                    player.vineCooldown = 60 // 1 second cooldown
                    audioController.playTone(200, 0.1, 'square')
                }
            }

            // Screen Switching
            if (player.x > SCREEN_WIDTH) {
                // Going Right
                let step = 1
                if (player.y > UNDERGROUND_Y - 20) step = 3 // Underground Shortcut
                loadScreen(currentScreen + step)
                player.x = 10
            } else if (player.x < 0) {
                // Going Left
                let step = 1
                if (player.y > UNDERGROUND_Y - 20) step = 3 // Underground Shortcut
                loadScreen(currentScreen - step)
                player.x = SCREEN_WIDTH - 10
            }

            gameTime++
            if (gameTime % 60 === 0) timeLeft--
            if (timeLeft <= 0) gameOver = true
        }

        const draw = () => {
            const dpr = window.devicePixelRatio || 1
            // Scaling
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY) * 0.9

            const transX = (canvas.width / dpr - SCREEN_WIDTH * scale) / 2
            const transY = (canvas.height / dpr - SCREEN_HEIGHT * scale) / 2

            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            ctx.save()
            ctx.translate(transX, transY)
            ctx.scale(scale, scale)

            // Mask Frame
            ctx.beginPath()
            ctx.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            ctx.clip()

            // --- BACKGROUND ---
            // Sky
            ctx.fillStyle = '#55AA55' // Atari Green (Light)
            ctx.fillRect(0, 0, SCREEN_WIDTH, 350)

            // Trees (Authentic "Scanline" style)
            // Trunks
            ctx.fillStyle = '#331100' // Dark Brown
            for (let x = 40; x < SCREEN_WIDTH; x += 160) { // Wider spacing
                ctx.fillRect(x, 60, 16, 290)
                // Branches (Horizontal lines)
                for (let y = 80; y < 250; y += 40) {
                    ctx.fillRect(x - 24, y, 64, 8)
                }
            }

            // Canopy Top
            ctx.fillStyle = '#115511' // Dark Grid Green
            ctx.fillRect(0, 0, SCREEN_WIDTH, 80)
            // Canopy Holes (Sky showing through)
            ctx.fillStyle = '#55AA55'
            for (let x = 20; x < SCREEN_WIDTH; x += 100) {
                ctx.fillRect(x, 40, 40, 20)
            }

            // Ground (Top)
            ctx.fillStyle = '#C8C800' // Yellowish Green
            ctx.fillRect(0, 350, SCREEN_WIDTH, 120)

            // Underground
            ctx.fillStyle = '#905000' // Reddish Brown

            ctx.fillRect(0, 470, SCREEN_WIDTH, 130)

            // Underground Wall Pattern (Brick)
            ctx.fillStyle = '#603000'
            for (let y = 480; y < 600; y += 20) {
                for (let x = 0; x < SCREEN_WIDTH; x += 40) {
                    if ((y / 20) % 2 === 0) ctx.fillRect(x, y, 4, 10)
                    else ctx.fillRect(x + 20, y, 4, 10)
                }
            }

            // --- CURRENT SCREEN FEATURES ---
            // const screen = screens[currentScreen]

            // Pit/Water Hole
            if (roomType !== 'ground') {
                // The hole cutout
                let holeColor = '#000000'
                if (roomType === 'water') holeColor = '#2244CC'
                if (roomType === 'pit') holeColor = '#000000'
                if (roomType === 'quicksand') holeColor = '#331100'

                ctx.fillStyle = holeColor
                ctx.fillRect(300, 352, 200, 118)

                // Water shine
                if (roomType === 'water') {
                    ctx.fillStyle = '#4466EE'
                    ctx.fillRect(310, 370, 20, 4)
                    ctx.fillRect(370, 400, 40, 4)
                }
            }

            // Objects
            activeObjects.forEach(obj => {
                if (obj.type === 'log') {
                    // Rotate logs?
                    drawSprite(ctx, 'log', obj.x - 14, GROUND_Y - 22, 3)
                }
                if (obj.type === 'treasure' && !obj.collected) {
                    // Randomize treasure sprite based on value/index
                    const tSprite = ['moneybag', 'bar', 'ring'][obj.value % 3] || 'moneybag'
                    drawSprite(ctx, tSprite, obj.x - 10, GROUND_Y - 25, 3)

                    ctx.fillStyle = '#FFFFFF'
                    ctx.font = '16px monospace'
                    ctx.fillText('$', obj.x + 5, GROUND_Y - 30)
                }
                if (obj.type === 'ladder') {
                    ctx.fillStyle = '#444444'
                    ctx.fillRect(obj.x - 10, 350, 20, 200) // Extends down
                    ctx.fillStyle = '#AAAAAA'
                    for (let y = 360; y < 550; y += 20) ctx.fillRect(obj.x - 8, y, 16, 2)
                }

                // Fire
                if (obj.type === 'fire') {
                    // Flicker
                    const s = (Math.floor(gameTime / 5) % 2 === 0) ? 'fire' : 'fire' // Add flip?
                    drawSprite(ctx, 'fire', obj.x, GROUND_Y - 20, 3)
                }

                // Snake
                if (obj.type === 'snake') {
                    drawSprite(ctx, 'snake', obj.x, GROUND_Y - 20, 3)
                }

                // Scorpion
                if (obj.type === 'scorpion') {
                    // Animate walk
                    const offset = Math.floor(gameTime / 10) % 2 === 0 ? 0 : 2
                    drawSprite(ctx, 'scorpion', obj.x, GROUND_Y - 20, 3)
                }

                // Wall
                if (obj.type === 'wall') {
                    ctx.fillStyle = '#883311' // Brick red
                    ctx.fillRect(obj.x, 350, 30, 120)
                    // Bricks
                    ctx.fillStyle = '#441100'
                    for (let i = 0; i < 5; i++) {
                        ctx.fillRect(obj.x + 5, 360 + i * 20, 20, 2)
                    }
                }

                // Croc (Static for now as mostly water)
                if (obj.type === 'croc') {
                    // Simple croc sprite shape
                    ctx.fillStyle = '#006600'
                    ctx.fillRect(obj.x, 360, 40, 10)
                    // Mouth
                    if (Math.floor(gameTime / 30) % 2 === 0) {
                        ctx.fillRect(obj.x + 30, 350, 10, 10) // Open
                    }
                }

                if (obj.type === 'vine') {
                    const tipX = obj.pivotX + Math.sin(obj.angle) * obj.length
                    const tipY = obj.pivotY + Math.cos(obj.angle) * obj.length
                    ctx.strokeStyle = '#DDDDDD' // White vine
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.moveTo(obj.pivotX, obj.pivotY)
                    ctx.lineTo(tipX, tipY)
                    ctx.stroke()
                }
            })

            // --- PLAYER ---
            if (player.state !== 'dead') {
                let pSprite = 'harry_idle'
                let flip = player.vx < 0

                if (player.state === 'run') {
                    const frame = Math.floor(gameTime / 5) % 3
                    pSprite = `harry_run_${frame}`
                }
                if (player.state === 'jump') pSprite = 'harry_jump'
                if (player.state === 'climb') pSprite = 'harry_climb'
                if (player.state === 'swing') pSprite = 'harry_swing'

                drawSprite(ctx, pSprite, player.x - 10, player.y - 38, 3, flip)
            }

            // --- UI ---
            // Top Bar
            ctx.fillStyle = '#000000' // Black Bar
            ctx.fillRect(0, 0, SCREEN_WIDTH, 50)

            ctx.fillStyle = '#D0D0D0' // Atari Grey Text
            ctx.font = '24px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`${score}`, 40, 35) // Score
            ctx.textAlign = 'center'
            // Time bar
            ctx.fillStyle = '#900000'
            ctx.fillRect(SCREEN_WIDTH / 2 - 60, 15, 120, 20) // Time bar bg
            ctx.fillStyle = '#FFFF00'
            const timeWidth = (timeLeft / (20 * 60)) * 120
            ctx.fillRect(SCREEN_WIDTH / 2 - 60, 15, timeWidth, 20)

            ctx.textAlign = 'right'
            ctx.fillStyle = '#D0D0D0'
            ctx.fillText(`LIVES: ${lives}`, SCREEN_WIDTH - 40, 35)

            if (gameOver) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)'
                ctx.fillRect(0, SCREEN_HEIGHT / 2 - 60, SCREEN_WIDTH, 120)
                ctx.fillStyle = '#FF0000'
                ctx.font = '40px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("GAME OVER", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.fillStyle = '#FFFFFF'
                ctx.font = '18px monospace'
                ctx.fillText("PRESS ANY KEY TO RESTART", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40)
            }

            if (isAttractMode) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.fillText("ATTRACT MODE (UPDATED)", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 40)
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
            accumulator += frameTime
            while (accumulator >= FIXED_DT) {
                update()
                accumulator -= FIXED_DT
            }
            draw()
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
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[4/3] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full bg-black" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PITFALL')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default PitfallGame

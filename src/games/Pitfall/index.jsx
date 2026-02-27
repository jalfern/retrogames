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
        const TOTAL_TREASURES = 32

        // GAME STATE
        let currentScreen = 0
        let roomType = 'ground'
        let gameTime = 0
        let score = 2000
        let timeLeft = 20 * 60
        let lives = 3
        let gameOver = false
        let isAttractMode = true
        let roomTreeBits = 0
        let holePattern = 'none'
        let undergroundWallSide = 'left'
        let tarPitPhase = 0
        let collectedTreasures = new Set()
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
            vine: null,
            vineCooldown: 0,
            knockbackCooldown: 0
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
            n: '#331100', // Dark Brown (Scorpion Legs)
            d: '#004400', // Dark Green (Croc)
            v: '#C0C0C0'  // Silver
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
            ],
            silver_bar: [
                "vvvvvv",
                "vvvvvv",
                "vvvvvv"
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
            if (index < 0) index = 255
            if (index > 255) index = 0
            currentScreen = index
            const roomByte = getRoomByte(index)

            const objBits = roomByte & 0x07
            const sceneBits = (roomByte >> 3) & 0x07
            roomTreeBits = (roomByte >> 6) & 0x03
            undergroundWallSide = (roomByte & 0x80) ? 'right' : 'left'

            let objects = []

            // Scene type (bits 3-5)
            switch (sceneBits) {
                case 0: // hole + ladder
                    roomType = 'pit'
                    holePattern = 'single'
                    objects.push({ type: 'ladder', x: 400 })
                    break
                case 1: // triple holes + ladder
                    roomType = 'pit'
                    holePattern = 'triple'
                    objects.push({ type: 'ladder', x: 400 })
                    break
                case 2: // croc pond
                    roomType = 'croc_pond'
                    holePattern = 'single'
                    objects.push({ type: 'croc', x: 330, mouthTimer: 0, mouthOpen: false })
                    objects.push({ type: 'croc', x: 400, mouthTimer: 50, mouthOpen: false })
                    objects.push({ type: 'croc', x: 470, mouthTimer: 100, mouthOpen: false })
                    break
                case 3: // tar pit
                    roomType = 'tar_pit'
                    holePattern = 'single'
                    tarPitPhase = 0
                    break
                case 4: // croc pit
                    roomType = 'croc_pit'
                    holePattern = 'single'
                    objects.push({ type: 'croc', x: 330, mouthTimer: 0, mouthOpen: false })
                    objects.push({ type: 'croc', x: 400, mouthTimer: 50, mouthOpen: false })
                    objects.push({ type: 'croc', x: 470, mouthTimer: 100, mouthOpen: false })
                    break
                case 5: { // treasure
                    roomType = 'ground'
                    holePattern = 'none'
                    let treasureCount = 0
                    let b = 0xC4
                    for (let i = 0; i < index; i++) {
                        if (((b >> 3) & 0x07) === 5) treasureCount++
                        b = rightLFSR(b)
                    }
                    const tTypes = [
                        { sprite: 'ring', value: 5000 },
                        { sprite: 'bar', value: 4000 },
                        { sprite: 'silver_bar', value: 3000 },
                        { sprite: 'moneybag', value: 2000 }
                    ]
                    const tt = tTypes[treasureCount % 4]
                    if (!collectedTreasures.has(index)) {
                        objects.push({ type: 'treasure', x: 600, value: tt.value, treasureSprite: tt.sprite })
                    }
                    break
                }
                default: // 6, 7 — solid ground
                    roomType = 'ground'
                    holePattern = 'none'
                    break
            }

            // Surface objects (bits 0-2) — only for non-treasure scenes
            if (sceneBits !== 5) {
                switch (objBits) {
                    case 0: objects.push({ type: 'log', x: 600, vx: -3, rolling: true }); break
                    case 1:
                        objects.push({ type: 'log', x: 500, vx: -3, rolling: true })
                        objects.push({ type: 'log', x: 580, vx: -3, rolling: true })
                        break
                    case 2:
                        objects.push({ type: 'log', x: 350, vx: -3, rolling: true })
                        objects.push({ type: 'log', x: 650, vx: -3, rolling: true })
                        break
                    case 3:
                        objects.push({ type: 'log', x: 300, vx: -3, rolling: true })
                        objects.push({ type: 'log', x: 500, vx: -3, rolling: true })
                        objects.push({ type: 'log', x: 700, vx: -3, rolling: true })
                        break
                    case 4: objects.push({ type: 'log', x: 500, vx: 0, rolling: false }); break
                    case 5:
                        objects.push({ type: 'log', x: 300, vx: 0, rolling: false })
                        objects.push({ type: 'log', x: 500, vx: 0, rolling: false })
                        objects.push({ type: 'log', x: 700, vx: 0, rolling: false })
                        break
                    case 6: objects.push({ type: 'fire', x: 500 }); break
                    case 7: objects.push({ type: 'snake', x: 450 }); break
                }
            }

            // Vines: present when objBits is 2, 3, 6, or 7
            if (objBits === 2 || objBits === 3 || objBits === 6 || objBits === 7) {
                objects.push({ type: 'vine', x: 400, pivotX: 400, pivotY: 100, length: 200, angle: Math.PI / 4, vAngle: 0 })
            }

            // Underground scorpion (scenes with holes/pits)
            if (sceneBits <= 4) {
                objects.push({ type: 'scorpion', x: 200 + (index % 4) * 120, vx: 2, underground: true })
            }

            activeObjects = objects
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
                collectedTreasures = new Set()
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
                    let hazard = false

                    // Holes, crocs, tar pits
                    if (['pit', 'croc_pond', 'croc_pit', 'tar_pit'].includes(roomType)) {
                        if (player.x > 200 && player.x < 300) hazard = true
                    }

                    // Objects ahead
                    activeObjects.forEach(obj => {
                        if (['log', 'fire', 'snake'].includes(obj.type) &&
                            obj.x > player.x && obj.x - player.x < 100) {
                            hazard = true
                        }
                    })

                    if (hazard) keys.Space = true
                }
            }

            // --- PRE-PASS: Update timers ---
            if (player.knockbackCooldown > 0) player.knockbackCooldown--
            activeObjects.forEach(obj => {
                if (obj.type === 'croc') {
                    obj.mouthTimer = (obj.mouthTimer + 1) % 150
                    obj.mouthOpen = obj.mouthTimer >= 90
                }
                if (obj.type === 'scorpion' && obj.underground) {
                    obj.x += obj.vx
                    if (obj.x > SCREEN_WIDTH - 30 || obj.x < 30) obj.vx = -obj.vx
                }
            })
            if (roomType === 'tar_pit') {
                tarPitPhase = (Math.sin(gameTime * 0.03) + 1) / 2
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
            const isHole = ['pit', 'croc_pond', 'croc_pit'].includes(roomType)
            let inHoleZone = false
            if (holePattern === 'single') {
                inHoleZone = (player.x > 300 && player.x < 500)
            } else if (holePattern === 'triple') {
                inHoleZone = (player.x > 180 && player.x < 300) ||
                             (player.x > 340 && player.x < 460) ||
                             (player.x > 500 && player.x < 620)
            }
            const groundMissing = isHole && inHoleZone

            if (!player.onLadder && player.state !== 'climb') {
                if (groundMissing) {
                    // Check if standing on a croc head (closed mouth = platform)
                    let onCrocHead = false
                    let crocDeath = false
                    if (roomType === 'croc_pond' || roomType === 'croc_pit') {
                        for (const obj of activeObjects) {
                            if (obj.type === 'croc' && Math.abs(player.x - obj.x) < 25) {
                                if (Math.abs(player.y - GROUND_Y) < 15) {
                                    if (obj.mouthOpen) { crocDeath = true; break }
                                    else { onCrocHead = true }
                                }
                            }
                        }
                    }

                    if (crocDeath) {
                        lives--
                        if (lives <= 0) { gameOver = true; return }
                        player.x = 50; player.y = GROUND_Y; player.vy = 0; player.vx = 0
                        player.onGround = true; player.state = 'idle'; score -= 100
                        audioController.playSweep(400, 100, 0.3, 'sawtooth')
                    } else if (onCrocHead && player.vy >= 0 && player.y >= GROUND_Y - 10) {
                        player.y = GROUND_Y; player.vy = 0; player.onGround = true
                        player.state = player.vx !== 0 ? 'run' : 'idle'
                    } else if (!onCrocHead && player.y >= GROUND_Y && player.onGround) {
                        player.onGround = false; player.state = 'jump'
                    }
                } else if (roomType === 'tar_pit' && tarPitPhase > 0.5 &&
                           player.x > 300 && player.x < 500 &&
                           Math.abs(player.y - GROUND_Y) < 10 &&
                           player.state !== 'jump' && player.state !== 'swing') {
                    // Tar pit kills when expanded
                    lives--
                    if (lives <= 0) { gameOver = true; return }
                    player.x = 50; player.y = GROUND_Y; player.vy = 0; player.vx = 0
                    player.onGround = true; player.state = 'idle'; score -= 100
                    audioController.playSweep(400, 100, 0.3, 'sawtooth')
                } else {
                    // Normal surface ground
                    if (player.y > GROUND_Y && player.y < UNDERGROUND_Y - 10 && player.vy >= 0) {
                        player.y = GROUND_Y; player.vy = 0; player.onGround = true
                        player.state = player.vx !== 0 ? 'run' : 'idle'
                    }
                }

                // Underground floor
                if (player.y > UNDERGROUND_Y && player.vy >= 0) {
                    player.y = UNDERGROUND_Y; player.vy = 0; player.onGround = true
                    player.state = player.vx !== 0 ? 'run' : 'idle'
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
            activeObjects.forEach(obj => {
                // LOGS — rolling or stationary, knockback on collision
                if (obj.type === 'log') {
                    if (obj.rolling) {
                        obj.x += obj.vx
                        if (obj.x < -20) obj.x = SCREEN_WIDTH + 20
                    }
                    if (player.knockbackCooldown <= 0 && Math.abs(player.x - obj.x) < 20 &&
                        Math.abs(player.y - GROUND_Y) < 10 && player.state !== 'jump') {
                        player.x += (player.x > obj.x) ? 30 : -30
                        player.x = Math.max(10, Math.min(SCREEN_WIDTH - 10, player.x))
                        score = Math.max(0, score - 100)
                        player.knockbackCooldown = 30
                        audioController.playTone(150, 0.1, 'square')
                    }
                }

                // FATAL SURFACE HAZARDS — fire and snake only
                if (['fire', 'snake'].includes(obj.type)) {
                    if (Math.abs(player.x - obj.x) < 15 && Math.abs(player.y - GROUND_Y) < 10 && player.state !== 'jump') {
                        lives--
                        if (lives <= 0) { gameOver = true; return }
                        player.x = 50; player.y = GROUND_Y; player.vy = 0; player.vx = 0
                        player.onGround = true; player.state = 'idle'; score -= 100
                        audioController.playSweep(400, 100, 0.3, 'sawtooth')
                    }
                }

                // UNDERGROUND SCORPIONS
                if (obj.type === 'scorpion' && obj.underground) {
                    if (player.y >= UNDERGROUND_Y - 10 && Math.abs(player.x - obj.x) < 15) {
                        lives--
                        if (lives <= 0) { gameOver = true; return }
                        player.x = 50; player.y = UNDERGROUND_Y; player.vy = 0; player.vx = 0
                        player.onGround = true; player.state = 'idle'; score -= 100
                        audioController.playSweep(400, 100, 0.3, 'sawtooth')
                    }
                }

                // LADDERS
                if (obj.type === 'ladder') {
                    if (Math.abs(player.x - obj.x) < 15) {
                        if (keys.ArrowDown || keys.ArrowUp) {
                            player.state = 'climb'
                            player.onLadder = true
                            player.onGround = false
                            player.vx = 0; player.vy = 0
                            player.x = obj.x
                            if (keys.ArrowUp) player.y -= 2
                            if (keys.ArrowDown) player.y += 2
                            if (player.y <= GROUND_Y) {
                                player.y = GROUND_Y; player.onLadder = false
                                player.onGround = true; player.state = 'idle'
                            }
                            if (player.y >= UNDERGROUND_Y) {
                                player.y = UNDERGROUND_Y; player.onLadder = false
                                player.onGround = true; player.state = 'idle'
                            }
                        }
                    } else if (player.onLadder) {
                        player.onLadder = false; player.onGround = false; player.state = 'jump'
                    }
                }

                // VINES
                if (obj.type === 'vine') {
                    const g = 0.4
                    const L = obj.length
                    const acc = -g / 10 * Math.sin(obj.angle)
                    obj.vAngle += acc
                    obj.angle += obj.vAngle
                    obj.vAngle *= 0.99
                    if (Math.abs(obj.angle) < 0.1 && Math.abs(obj.vAngle) < 0.001) obj.vAngle = 0.02

                    const tipX = obj.pivotX + Math.sin(obj.angle) * L
                    const tipY = obj.pivotY + Math.cos(obj.angle) * L

                    if (player.state !== 'swing' && player.vineCooldown <= 0) {
                        if (Math.abs(player.x - tipX) < 40 && Math.abs(player.y - tipY) < 60 && !player.onGround) {
                            player.state = 'swing'; player.vine = obj
                            player.onGround = false; player.vy = 0; score += 100
                        }
                    }
                }

                // TREASURE — track in Set
                if (obj.type === 'treasure' && !obj.collected) {
                    if (Math.abs(player.x - obj.x) < 20 && Math.abs(player.y - GROUND_Y) < 10) {
                        obj.collected = true
                        collectedTreasures.add(currentScreen)
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

            // Underground wall collision
            if (player.y >= UNDERGROUND_Y - 15) {
                const wallX = undergroundWallSide === 'left' ? 350 : 450
                if (player.x > wallX - 20 && player.x < wallX + 20) {
                    if (player.vx > 0 && player.x < wallX) { player.x = wallX - 20; player.vx = 0 }
                    else if (player.vx < 0 && player.x > wallX) { player.x = wallX + 20; player.vx = 0 }
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

            // Trees (4 patterns from roomTreeBits)
            ctx.fillStyle = '#331100'
            let treePositions
            switch (roomTreeBits) {
                case 0: treePositions = [120, 600]; break
                case 1: treePositions = [100, 380, 650]; break
                case 2: treePositions = [60, 250, 480, 700]; break
                case 3: treePositions = [350]; break
                default: treePositions = [120, 600]
            }
            treePositions.forEach(tx => {
                const tw = roomTreeBits === 3 ? 24 : 16
                const bw = roomTreeBits === 3 ? 80 : 64
                ctx.fillRect(tx, 60, tw, 290)
                for (let y = 80; y < 250; y += 40) {
                    ctx.fillRect(tx - bw / 2 + tw / 2, y, bw, 8)
                }
            })

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

            // Underground wall
            const wallX = undergroundWallSide === 'left' ? 350 : 450
            ctx.fillStyle = '#883311'
            ctx.fillRect(wallX - 15, 475, 30, 120)
            ctx.fillStyle = '#663300'
            for (let wi = 0; wi < 5; wi++) {
                ctx.fillRect(wallX - 12, 485 + wi * 22, 24, 2)
            }

            // Holes / Pits / Tar / Crocs
            if (roomType === 'tar_pit') {
                const baseW = 140
                const expandW = baseW + tarPitPhase * 60
                const cx = 400
                ctx.fillStyle = '#331100'
                ctx.fillRect(cx - expandW / 2, 352, expandW, 118)
                // Bubbles
                ctx.fillStyle = '#553300'
                const bp = Math.sin(gameTime * 0.1) * 0.5 + 0.5
                ctx.beginPath()
                ctx.arc(cx - 20, 390 + bp * 10, 4 + tarPitPhase * 3, 0, Math.PI * 2)
                ctx.fill()
                ctx.beginPath()
                ctx.arc(cx + 25, 410 - bp * 5, 3 + tarPitPhase * 2, 0, Math.PI * 2)
                ctx.fill()
            } else if (holePattern !== 'none') {
                let holeColor = '#000000'
                if (roomType === 'croc_pond' || roomType === 'croc_pit') holeColor = '#2244CC'

                ctx.fillStyle = holeColor
                if (holePattern === 'single') {
                    ctx.fillRect(300, 352, 200, 118)
                } else if (holePattern === 'triple') {
                    ctx.fillRect(180, 352, 120, 118)
                    ctx.fillRect(340, 352, 120, 118)
                    ctx.fillRect(500, 352, 120, 118)
                }

                // Water shine
                if (roomType === 'croc_pond' || roomType === 'croc_pit') {
                    ctx.fillStyle = '#4466EE'
                    ctx.fillRect(310, 370, 20, 4)
                    ctx.fillRect(370, 400, 40, 4)
                }
            }

            // Objects
            activeObjects.forEach(obj => {
                if (obj.type === 'log') {
                    drawSprite(ctx, 'log', obj.x - 14, GROUND_Y - 22, 3)
                    if (!obj.rolling) {
                        // Stationary log marker (moss)
                        ctx.fillStyle = '#005500'
                        ctx.fillRect(obj.x - 6, GROUND_Y - 22, 12, 2)
                    }
                }
                if (obj.type === 'treasure' && !obj.collected) {
                    const tSprite = obj.treasureSprite || 'moneybag'
                    drawSprite(ctx, tSprite, obj.x - 10, GROUND_Y - 25, 3)
                    ctx.fillStyle = '#FFFFFF'
                    ctx.font = '16px monospace'
                    ctx.fillText('$', obj.x + 5, GROUND_Y - 30)
                }
                if (obj.type === 'ladder') {
                    ctx.fillStyle = '#444444'
                    ctx.fillRect(obj.x - 10, 350, 20, 200)
                    ctx.fillStyle = '#AAAAAA'
                    for (let y = 360; y < 550; y += 20) ctx.fillRect(obj.x - 8, y, 16, 2)
                }
                if (obj.type === 'fire') {
                    drawSprite(ctx, 'fire', obj.x, GROUND_Y - 20, 3, Math.floor(gameTime / 8) % 2 === 0)
                }
                if (obj.type === 'snake') {
                    drawSprite(ctx, 'snake', obj.x, GROUND_Y - 20, 3)
                }
                // Scorpion — underground only
                if (obj.type === 'scorpion' && obj.underground) {
                    drawSprite(ctx, 'scorpion', obj.x, UNDERGROUND_Y - 18, 3, obj.vx < 0)
                }
                // Croc heads
                if (obj.type === 'croc') {
                    ctx.fillStyle = '#006600'
                    ctx.fillRect(obj.x - 20, GROUND_Y - 15, 40, 12)
                    // Eyes
                    ctx.fillStyle = '#FFFF00'
                    ctx.fillRect(obj.x - 15, GROUND_Y - 18, 4, 4)
                    ctx.fillRect(obj.x + 11, GROUND_Y - 18, 4, 4)
                    if (obj.mouthOpen) {
                        // Open jaw
                        ctx.fillStyle = '#FF0000'
                        ctx.fillRect(obj.x - 20, GROUND_Y - 25, 40, 10)
                        ctx.fillStyle = '#FFFFFF'
                        for (let t = obj.x - 18; t < obj.x + 18; t += 8) {
                            ctx.fillRect(t, GROUND_Y - 17, 3, 4)
                        }
                    } else {
                        // Closed snout
                        ctx.fillStyle = '#008800'
                        ctx.fillRect(obj.x - 20, GROUND_Y - 18, 40, 4)
                    }
                }
                if (obj.type === 'vine') {
                    const tipX = obj.pivotX + Math.sin(obj.angle) * obj.length
                    const tipY = obj.pivotY + Math.cos(obj.angle) * obj.length
                    ctx.strokeStyle = '#DDDDDD'
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

            ctx.fillStyle = '#FFD700'
            ctx.font = '12px monospace'
            ctx.fillText(`${collectedTreasures.size}/${TOTAL_TREASURES}`, SCREEN_WIDTH / 2, 45)

            ctx.textAlign = 'right'
            ctx.fillStyle = '#D0D0D0'
            ctx.font = '24px monospace'
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

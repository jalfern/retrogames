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
        const JUMP_FORCE = -10
        const GRAVITY = 0.65
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
            knockbackCooldown: 0,
            deathTimer: 0,
            deathFlash: false,
            isFalling: false
        }

        const killPlayer = (penalty = 100) => {
            if (player.state === 'dead') return
            player.state = 'dead'
            player.deathTimer = 90
            player.vx = 0
            player.vy = 0
            score = Math.max(0, score - penalty)
            // Dragnet-style death motif — descending notes
            audioController.playTone(440, 0.15, 'square')
            setTimeout(() => audioController.playTone(415, 0.15, 'square'), 180)
            setTimeout(() => audioController.playTone(370, 0.15, 'square'), 360)
            setTimeout(() => audioController.playTone(330, 0.2, 'square'), 540)
            setTimeout(() => audioController.playTone(262, 0.3, 'square'), 750)
        }

        // PALETTE — Atari 2600 TIA NTSC colors
        const PALETTE = {
            g: '#74B474', // $C8 Yellow-green (Harry's shirt)
            w: '#E08888', // $4A Pink/skin (Harry's legs)
            s: '#FFCCAA', // Skin tone (face/arms)
            b: '#000000', // $00 Black
            r: '#9C2020', // $42 Dark red (ring, accents)
            l: '#646410', // $12 Olive-brown (logs, trunks)
            y: '#FCFC68', // $1E Bright yellow
            e: '#6C9850', // $D6 Green (general)
            h: '#ECECEC', // $0E Near-white
            n: '#444400', // $10 Dark olive (BROWN-2)
            d: '#143800', // $D0 Very dark green (crocs)
            v: '#909090', // $06 Grey
            o: '#FCBC94', // $3E Peach-orange (fire)
            k: '#848424', // $14 Lighter olive (BROWN+2)
            t: '#345C1C', // $D2 Dark yellow-green (Harry's hat)
            u: '#386890'  // $A4 Blue/teal (sky, water)
        }

        const SPRITES = {
            harry_idle: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                "  wwww  ",
                " ww  ww ",
                " ww  ww ",
                " ww  ww ",
                " ww  ww ",
                " bb  bb ",
                " bb  bb ",
                "bb    bb"
            ],
            harry_run_0: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                "  wwww  ",
                " ww  ww ",
                " ww  ww ",
                " ww  ww ",
                " bb  bb ",
                " bb  bb ",
                "bb    bb",
                "bb    bb"
            ],
            harry_run_1: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                " wwwwww ",
                " ww  ww ",
                "ww    ww",
                "ww    ww",
                "bb    bb",
                "b      b",
                "b      b",
                "b      b"
            ],
            harry_run_2: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                "  wwww  ",
                " wwwwww ",
                "ww    ww",
                "w      w",
                "b      b",
                "        ",
                "        ",
                "        "
            ],
            harry_run_3: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                " wwwwww ",
                " ww  ww ",
                "ww    ww",
                "ww    ww",
                "bb    bb",
                "b      b",
                "b      b",
                "b      b"
            ],
            harry_jump: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                " sggggs ",
                "ssggggss",
                "sggggggs",
                "sggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                "  wwww  ",
                " ww  ww ",
                "ww    ww",
                "w      w",
                "b      b",
                "        ",
                "        ",
                "        "
            ],
            harry_climb: [
                " ss     ",
                " sstt   ",
                "  tttt  ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                " ggggggs",
                " ggggggs",
                " gggggg ",
                "  gggg  ",
                "  gggg  ",
                "  wwww  ",
                " ww  ww ",
                " ww  ww ",
                " ww  ww ",
                " bb  bb ",
                " bb  bb ",
                "bb    bb"
            ],
            harry_swing: [
                "     ss ",
                "   ssss ",
                "  ttttss",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  ",
                "  gggg  ",
                " gggggg ",
                "sgggggg ",
                "sggggg  ",
                " gggg   ",
                "  gggg  ",
                "  wwww  ",
                "  ww    ",
                " ww     ",
                " ww     ",
                " bb     ",
                "bb      ",
                "bb      "
            ],
            log: [
                "   lllll   ",
                "  lllllll  ",
                " lklllllkl ",
                "lkkllllllkl",
                "lklllllllkl",
                " lklllllkl ",
                "  lllllll  "
            ],
            log_1: [
                "   lllll   ",
                "  lllllll  ",
                " llllllkll ",
                "lllllllkkll",
                "llllllllkll",
                " llllllkll ",
                "  lllllll  "
            ],
            scorpion: [
                "hh          hh ",
                "hhh        hhh ",
                " hhh      hhh  ",
                "  hhhhhhhhhh   ",
                " hhhhhhhhhhhhh ",
                "  hh hh hh h   ",
                "  h  h  h  h   "
            ],
            scorpion_1: [
                " hh         hh ",
                " hhh       hhh ",
                "  hhh     hhh  ",
                "  hhhhhhhhhh   ",
                " hhhhhhhhhhhhh ",
                "   h hh hh h   ",
                "  h  h  h  h   "
            ],
            snake: [
                "    rr      ",
                "   vvvv     ",
                "   vb bv    ",
                "    vvvv    ",
                "   vv  vv   ",
                "   bb  bb   ",
                "  bbbbbbbb  ",
                " bb bb bb bb",
                "bb  bb  bb  "
            ],
            snake_1: [
                "   rr       ",
                "  vvvv      ",
                "  vb bv     ",
                "   vvvv     ",
                "    vv vv   ",
                "   bb  bb   ",
                "  bbbbbbbb  ",
                " bb bb bb bb",
                "  bb  bb  bb"
            ],
            fire: [
                "    o    ",
                "   ooo   ",
                "   ror   ",
                "  rrrrr  ",
                "  orror  ",
                " orrrrro ",
                " rrrrrrr ",
                "orrrrrrro",
                " rrrrrrr ",
                "  rrrrr  "
            ],
            fire_1: [
                "   o     ",
                "   oo    ",
                "  oror   ",
                "  rrrro  ",
                " orrror  ",
                " orrrrro ",
                "orrrrrrr ",
                "orrrrrrro",
                " rrrrrrr ",
                "  rrrrr  "
            ],
            moneybag: [
                "   bbbb  ",
                "  bblbb  ",
                " vvvvvvv ",
                "vvvvvvvvv",
                "vvvvvvvvv",
                "vvvvvvvvv",
                " vvvvvvv ",
                "  vvvvv  "
            ],
            bar: [
                " yyyyyyyy ",
                "yyyyyyyyyy",
                "yyyyyyyyyy",
                "yyyyyyyyyy",
                " yyyyyyyy "
            ],
            ring: [
                "   rrr   ",
                "  r   r  ",
                " r  h  r ",
                " r hhh r ",
                " r  h  r ",
                "  r   r  ",
                "   rrr   "
            ],
            silver_bar: [
                " vvvvvvvv ",
                "vvvvvvvvvv",
                "vvvvvvvvvv",
                "vvvvvvvvvv",
                " vvvvvvvv "
            ],
            croc_closed: [
                "  dddddddddddddd",
                " dyddddddddddddyd",
                " ddddddddddddddd ",
                "  ddddddddddddd  ",
                "   ddddddddddd   "
            ],
            croc_open: [
                " ddddddddddddddd ",
                "dhd d d d d d dhd ",
                " ddddddddddddddd ",
                "                  ",
                " ddddddddddddddd ",
                "dhd d d d d d dhd ",
                " ddddddddddddddd "
            ],
            harry_head: [
                "  tttt  ",
                " tttttt ",
                "  ssss  ",
                " sb  bs ",
                "  ssss  "
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
                    objects.push({ type: 'croc', x: 340, mouthTimer: 0, mouthOpen: false })
                    objects.push({ type: 'croc', x: 400, mouthTimer: 60, mouthOpen: false })
                    objects.push({ type: 'croc', x: 460, mouthTimer: 120, mouthOpen: false })
                    break
                case 3: // tar pit
                    roomType = 'tar_pit'
                    holePattern = 'single'
                    tarPitPhase = 0
                    break
                case 4: // croc pit
                    roomType = 'croc_pit'
                    holePattern = 'single'
                    objects.push({ type: 'croc', x: 340, mouthTimer: 0, mouthOpen: false })
                    objects.push({ type: 'croc', x: 400, mouthTimer: 60, mouthOpen: false })
                    objects.push({ type: 'croc', x: 460, mouthTimer: 120, mouthOpen: false })
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
                case 6: // quicksand
                    roomType = 'quicksand'
                    holePattern = 'none'
                    tarPitPhase = 0
                    break
                default: // 7 — solid ground
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
                objects.push({ type: 'vine', x: 400, pivotX: 400, pivotY: 80, length: 170, angle: Math.PI / 4, vAngle: 0 })
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
                timeLeft = 20 * 60
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

            // Death animation
            if (player.state === 'dead') {
                player.deathTimer--
                player.deathFlash = Math.floor(player.deathTimer / 4) % 2 === 0
                if (player.deathTimer <= 0) {
                    lives--
                    if (lives <= 0) { gameOver = true; return }
                    // Respawn dropping from trees (left side of screen)
                    player.x = 80
                    player.y = 150 // Start from canopy height
                    player.vy = 0; player.vx = 0
                    player.onGround = false
                    player.state = 'jump' // Falling state
                    player.vine = null
                    player.deathFlash = false
                    player.isFalling = false
                }
                gameTime++
                if (gameTime % 60 === 0) timeLeft--
                if (timeLeft <= 0) gameOver = true
                return
            }

            const dpr = window.devicePixelRatio || 1
            // Physics Scale for implementation simplification
            // Map 0-800 to canvas width
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY)

            // --- AI LOGIC (ATTRACT MODE) ---
            if (isAttractMode) {
                keys.ArrowRight = true
                keys.ArrowLeft = false
                keys.ArrowUp = false
                keys.ArrowDown = false
                keys.Space = false

                const isUnderground = player.y >= UNDERGROUND_Y - 15

                if (isUnderground) {
                    // Underground: navigate in the direction not blocked by the wall
                    // Wall on right = go left, wall on left = go right (3-screen shortcut)
                    const goRight = undergroundWallSide === 'left'
                    keys.ArrowRight = goRight
                    keys.ArrowLeft = !goRight

                    // Jump over scorpions
                    activeObjects.forEach(obj => {
                        if (obj.type === 'scorpion' && obj.underground) {
                            const dist = obj.x - player.x
                            if (goRight && dist > 0 && dist < 80 && player.onGround) {
                                keys.Space = true
                            }
                            if (!goRight && dist < 0 && dist > -80 && player.onGround) {
                                keys.Space = true
                            }
                        }
                    })
                } else {
                    // Surface: jump hazards, grab vines, navigate forward
                    const hasPit = ['pit', 'croc_pond', 'croc_pit', 'tar_pit', 'quicksand'].includes(roomType)
                    const hasVine = activeObjects.some(o => o.type === 'vine')

                    // If near a pit with no vine, just run right and fall through
                    // (underground is a shortcut anyway)
                    if (player.onGround) {
                        let hazard = false
                        let hazardDist = 999

                        // Objects ahead
                        activeObjects.forEach(obj => {
                            if (['log', 'fire', 'snake'].includes(obj.type)) {
                                const dist = obj.x - player.x
                                if (dist > 0 && dist < 100) {
                                    hazard = true
                                    hazardDist = Math.min(hazardDist, dist)
                                }
                            }
                        })

                        // Jump over surface hazards
                        if (hazard && hazardDist < 80) keys.Space = true

                        // Jump to grab vine when approaching pits with vine
                        if (hasPit && hasVine && player.x > 250 && player.x < 350) {
                            keys.Space = true
                        }
                    }
                }

                // Release from vine past the pit
                if (player.state === 'swing' && player.vine) {
                    if (player.vine.angle < -0.2 && player.x > 450) keys.Space = true
                }
            }

            // --- PRE-PASS: Update timers ---
            if (player.knockbackCooldown > 0) player.knockbackCooldown--
            activeObjects.forEach(obj => {
                if (obj.type === 'croc') {
                    obj.mouthTimer = (obj.mouthTimer + 1) % 180
                    obj.mouthOpen = obj.mouthTimer >= 140
                }
                if (obj.type === 'scorpion' && obj.underground) {
                    obj.x += obj.vx
                    if (obj.x > SCREEN_WIDTH - 30 || obj.x < 30) obj.vx = -obj.vx
                }
            })
            if (roomType === 'tar_pit' || roomType === 'quicksand') {
                // Asymmetric cycle: ~3s expand, ~2s retract, clear safe window
                const cyclePos = (gameTime % 300) / 300
                if (cyclePos < 0.6) {
                    tarPitPhase = cyclePos / 0.6
                } else {
                    tarPitPhase = 1.0 - (cyclePos - 0.6) / 0.4
                }
            }

            // --- PLAYER MOVEMENT ---
            if (player.vineCooldown > 0) player.vineCooldown--

            if (player.state !== 'swing') {
                if (keys.ArrowLeft) player.vx = -PLAYER_SPEED
                else if (keys.ArrowRight) player.vx = PLAYER_SPEED
                else player.vx = 0
            }

            // Jump (not allowed underground - must use ladder)
            if (keys.Space && player.onGround && player.state !== 'climb' && player.y <= GROUND_Y) {
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
                        killPlayer(100)
                    } else if (onCrocHead && player.vy >= 0 && player.y >= GROUND_Y - 10) {
                        player.y = GROUND_Y; player.vy = 0; player.onGround = true
                        player.state = player.vx !== 0 ? 'run' : 'idle'
                    } else if (!onCrocHead && player.y >= GROUND_Y && player.onGround) {
                        // Falling into pit — drop to underground
                        player.onGround = false
                        player.isFalling = true
                        player.vx = 0
                        player.vy = 2
                        score = Math.max(0, score - 100)
                        audioController.playSweep(300, 80, 0.2, 'sawtooth')
                    }
                } else if (roomType === 'tar_pit' && tarPitPhase > 0.5 &&
                           player.x > 300 && player.x < 500 &&
                           Math.abs(player.y - GROUND_Y) < 10 &&
                           player.state !== 'jump' && player.state !== 'swing') {
                    // Tar pit kills when expanded
                    killPlayer(100)
                } else if (roomType === 'quicksand' && tarPitPhase > 0.5 &&
                           player.x > 330 && player.x < 470 &&
                           Math.abs(player.y - GROUND_Y) < 10 &&
                           player.state !== 'jump' && player.state !== 'swing') {
                    // Quicksand kills when expanded
                    killPlayer(100)
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
                    player.isFalling = false
                }
            }

            if (player.y > 700) {
                killPlayer(100)
            }


            // Objects
            activeObjects.forEach(obj => {
                // LOGS — rolling or stationary, knockback on collision
                if (obj.type === 'log') {
                    if (obj.rolling) {
                        obj.x += obj.vx
                        if (obj.x < -20) obj.x = SCREEN_WIDTH + 20
                    }
                    // Continuous contact damage like original — drain points while touching
                    if (Math.abs(player.x - obj.x) < 18 &&
                        Math.abs(player.y - GROUND_Y) < 10 && player.state !== 'jump') {
                        if (gameTime % 8 === 0) {
                            score = Math.max(0, score - 10)
                        }
                        // Slight push but not hard knockback
                        if (player.knockbackCooldown <= 0) {
                            player.x += (player.x > obj.x) ? 8 : -8
                            player.knockbackCooldown = 10
                            audioController.playTone(120, 0.05, 'square')
                        }
                    }
                }

                // FATAL SURFACE HAZARDS — fire and snake only
                if (['fire', 'snake'].includes(obj.type)) {
                    if (Math.abs(player.x - obj.x) < 15 && Math.abs(player.y - GROUND_Y) < 10 && player.state !== 'jump') {
                        killPlayer(100)
                    }
                }

                // UNDERGROUND SCORPIONS
                if (obj.type === 'scorpion' && obj.underground) {
                    if (player.y >= UNDERGROUND_Y - 10 && Math.abs(player.x - obj.x) < 15) {
                        killPlayer(100)
                    }
                }

                // LADDERS
                if (obj.type === 'ladder') {
                    if (Math.abs(player.x - obj.x) < 15) {
                        if (keys.ArrowDown || keys.ArrowUp || player.onLadder) {
                            player.state = 'climb'
                            player.onLadder = true
                            player.onGround = false
                            player.vx = 0; player.vy = 0
                            player.x = obj.x
                            if (keys.ArrowUp) player.y -= 2
                            if (keys.ArrowDown) player.y += 2

                            // Allow stepping off the ladder with left/right
                            if (keys.ArrowLeft || keys.ArrowRight) {
                                const dir = keys.ArrowLeft ? -1 : 1
                                player.x = obj.x + dir * 50
                                player.onLadder = false
                                player.onGround = false
                                player.state = 'jump'
                                player.vy = 0
                            }

                            // Reached top — step off to solid ground beside the pit
                            if (player.y <= GROUND_Y) {
                                player.y = GROUND_Y; player.onLadder = false
                                player.onGround = true; player.state = 'idle'
                                // Move to solid ground (left side of pit)
                                player.x = 250
                            }
                            // Reached bottom — step off at underground floor
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
                    const g = 0.6
                    const L = obj.length
                    const acc = -g / L * Math.sin(obj.angle)
                    obj.vAngle += acc
                    obj.angle += obj.vAngle
                    obj.vAngle *= 0.995
                    if (Math.abs(obj.angle) < 0.05 && Math.abs(obj.vAngle) < 0.002) obj.vAngle = 0.03

                    const tipX = obj.pivotX + Math.sin(obj.angle) * L
                    const tipY = obj.pivotY + Math.cos(obj.angle) * L

                    if (player.state !== 'swing' && player.vineCooldown <= 0) {
                        if (Math.abs(player.x - tipX) < 40 && Math.abs(player.y - tipY) < 60 && !player.onGround) {
                            player.state = 'swing'; player.vine = obj
                            player.onGround = false; player.vy = 0; score += 100
                            // Tarzan yell — ascending warble
                            audioController.playSweep(200, 600, 0.15, 'sawtooth')
                            setTimeout(() => audioController.playSweep(400, 800, 0.12, 'sawtooth'), 150)
                            setTimeout(() => audioController.playSweep(300, 700, 0.1, 'sawtooth'), 300)
                        }
                    }
                }

                // TREASURE — track in Set
                if (obj.type === 'treasure' && !obj.collected) {
                    if (Math.abs(player.x - obj.x) < 20 && Math.abs(player.y - GROUND_Y) < 10) {
                        obj.collected = true
                        collectedTreasures.add(currentScreen)
                        score += obj.value
                        // Treasure fanfare — ascending notes
                        audioController.playTone(523, 0.08, 'square')
                        setTimeout(() => audioController.playTone(659, 0.08, 'square'), 80)
                        setTimeout(() => audioController.playTone(784, 0.08, 'square'), 160)
                        setTimeout(() => audioController.playTone(1047, 0.15, 'square'), 240)
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

                // Release vine with Down or Space (like original: joystick down to release)
                if (keys.ArrowDown || keys.Space) {
                    player.state = 'jump'
                    player.vx = player.vine.vAngle * 150
                    if (player.vx > 0 && player.vx < 4) player.vx = 4
                    if (player.vx < 0 && player.vx > -4) player.vx = -4
                    if (player.vx > 8) player.vx = 8
                    if (player.vx < -8) player.vx = -8
                    player.vy = -6
                    player.vine = null
                    player.vineCooldown = 45
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

            // --- BACKGROUND (Atari 2600 horizontal bands) ---
            // Sky — blue/teal ($A4)
            ctx.fillStyle = '#386890'
            ctx.fillRect(0, 50, SCREEN_WIDTH, 300)

            // Canopy — layered green like original playfield graphics
            // Dark green base ($D2)
            ctx.fillStyle = '#345C1C'
            ctx.fillRect(0, 50, SCREEN_WIDTH, 95)
            // Brighter green overlay ($D6)
            ctx.fillStyle = '#6C9850'
            ctx.fillRect(0, 52, SCREEN_WIDTH, 80)
            // Sky holes in canopy (per roomTreeBits for variety)
            ctx.fillStyle = '#386890'
            const holeSeeds = [
                [[60, 65, 35, 14], [220, 58, 50, 12], [500, 62, 40, 13], [700, 55, 30, 15]],
                [[130, 60, 45, 10], [370, 55, 55, 14], [620, 64, 35, 11]],
                [[80, 58, 28, 12], [260, 66, 40, 11], [460, 60, 60, 13], [710, 56, 25, 10]],
                [[160, 57, 50, 12], [420, 63, 35, 15], [570, 61, 45, 10], [760, 55, 30, 13]]
            ]
            const holes = holeSeeds[roomTreeBits] || holeSeeds[0]
            holes.forEach(([hx, hy, hw, hh]) => {
                ctx.fillRect(hx, hy, hw, hh)
            })
            // Irregular canopy bottom edge — hanging leaves/vines
            for (let cx = 0; cx < SCREEN_WIDTH; cx += 20) {
                const hang = 8 + Math.abs(Math.sin(cx * 0.07 + roomTreeBits) * 25)
                // Dark green hangings
                ctx.fillStyle = '#345C1C'
                ctx.fillRect(cx, 128, 20, hang + 6)
                // Brighter green hangings slightly shorter
                ctx.fillStyle = '#6C9850'
                ctx.fillRect(cx + 2, 128, 16, hang)
            }
            // Extra hanging vines from canopy for depth
            ctx.fillStyle = '#345C1C'
            for (let vx = 50; vx < SCREEN_WIDTH; vx += 120 + (roomTreeBits * 30)) {
                const vLen = 20 + (vx * 3 + roomTreeBits * 7) % 30
                ctx.fillRect(vx, 145, 3, vLen)
                ctx.fillRect(vx + 1, 145 + vLen - 4, 5, 4)
            }

            // Trunks — mirrored columns, olive-brown ($12)
            let trunkPairs
            switch (roomTreeBits) {
                case 0: trunkPairs = [[140, 660]]; break
                case 1: trunkPairs = [[100, 700], [300, 500]]; break
                case 2: trunkPairs = [[80, 720], [240, 560]]; break
                case 3: trunkPairs = [[200, 600]]; break
                default: trunkPairs = [[140, 660]]
            }
            trunkPairs.forEach(([lx, rx]) => {
                // Main trunks ($12 brown)
                ctx.fillStyle = '#646410'
                ctx.fillRect(lx, 100, 14, 260)
                ctx.fillRect(rx, 100, 14, 260)
                // Darker trunk edges for depth
                ctx.fillStyle = '#444400'
                ctx.fillRect(lx, 100, 3, 260)
                ctx.fillRect(rx + 11, 100, 3, 260)
                // Branch stubs from trunks
                for (let by = 160; by < 310; by += 45) {
                    ctx.fillStyle = '#646410'
                    // Left trunk branches extend left and right
                    ctx.fillRect(lx - 14, by, 42, 4)
                    ctx.fillRect(lx - 8, by - 2, 6, 3)
                    // Right trunk branches
                    ctx.fillRect(rx - 14, by + 15, 42, 4)
                    ctx.fillRect(rx + 14, by + 13, 6, 3)
                }
            })

            // Ground surface — thin green strip ($D6) with grass detail
            ctx.fillStyle = '#6C9850'
            ctx.fillRect(0, 348, SCREEN_WIDTH, 6)
            // Grass tufts
            ctx.fillStyle = '#345C1C'
            for (let gx = 0; gx < SCREEN_WIDTH; gx += 24) {
                const gh = 2 + (gx * 7 + roomTreeBits * 13) % 4
                ctx.fillRect(gx + 4, 348 - gh, 3, gh)
                ctx.fillRect(gx + 14, 348 - gh + 1, 2, gh - 1)
            }
            // Ground body — olive/khaki ($14 BROWN+2)
            ctx.fillStyle = '#848424'
            ctx.fillRect(0, 354, SCREEN_WIDTH, 116)
            // Ground dirt texture stripes
            ctx.fillStyle = '#646410'
            ctx.fillRect(0, 370, SCREEN_WIDTH, 2)
            ctx.fillRect(0, 400, SCREEN_WIDTH, 2)
            ctx.fillRect(0, 435, SCREEN_WIDTH, 2)

            // Underground — black background ($00)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 470, SCREEN_WIDTH, 130)
            // Underground ceiling — dark grey stripe
            ctx.fillStyle = '#404040'
            ctx.fillRect(0, 470, SCREEN_WIDTH, 3)
            // Underground floor — olive/khaki ($14)
            ctx.fillStyle = '#848424'
            ctx.fillRect(0, UNDERGROUND_Y, SCREEN_WIDTH, 6)
            // Floor detail
            ctx.fillStyle = '#646410'
            ctx.fillRect(0, UNDERGROUND_Y + 2, SCREEN_WIDTH, 2)

            // Underground brick pattern — grey ($06) and dark red ($42)
            for (let y = 476; y < UNDERGROUND_Y; y += 8) {
                const isEvenRow = ((y - 476) / 8) % 2 === 0
                for (let x = 0; x < SCREEN_WIDTH; x += 20) {
                    const bx = isEvenRow ? x : x + 10
                    ctx.fillStyle = '#808080'
                    ctx.fillRect(bx, y, 18, 3)
                    ctx.fillStyle = '#803020'
                    ctx.fillRect(bx, y + 3, 18, 3)
                    // Mortar lines
                    ctx.fillStyle = '#404040'
                    ctx.fillRect(bx + 18, y, 2, 6)
                }
            }

            // --- CURRENT SCREEN FEATURES ---

            // Underground wall — grey/red brick ($06/$42)
            const wallX = undergroundWallSide === 'left' ? 350 : 450
            ctx.fillStyle = '#909090'
            ctx.fillRect(wallX - 20, 472, 40, 78)
            // Brick lines
            ctx.fillStyle = '#9C2020'
            for (let wi = 0; wi < 6; wi++) {
                const wy = 478 + wi * 12
                ctx.fillRect(wallX - 18, wy, 36, 5)
            }

            // Holes / Pits / Tar / Crocs / Quicksand
            if (roomType === 'tar_pit') {
                // Tar pit — flat black ($00), like original
                const baseW = 140
                const expandW = baseW + tarPitPhase * 60
                const cx = 400
                ctx.fillStyle = '#000000'
                ctx.fillRect(cx - expandW / 2, 354, expandW, 116)
            } else if (roomType === 'quicksand') {
                // Quicksand — lighter sand patch that pulses
                const baseW = 120
                const expandW = baseW + tarPitPhase * 50
                const cx = 400
                ctx.fillStyle = '#BCBC76'
                ctx.fillRect(cx - expandW / 2, 354, expandW, 116)
                // Surface shimmer
                ctx.fillStyle = '#D4D490'
                ctx.fillRect(cx - expandW / 2 + 5, 356, expandW - 10, 3)
            } else if (holePattern !== 'none') {
                const isCrocWater = (roomType === 'croc_pond' || roomType === 'croc_pit')
                const holeColor = isCrocWater ? '#386890' : '#000000'
                ctx.fillStyle = holeColor
                if (holePattern === 'single') {
                    ctx.fillRect(300, 350, 200, 120)
                    if (isCrocWater) {
                        // Water wave shimmer
                        ctx.fillStyle = '#4A7CA8'
                        for (let wx = 305; wx < 495; wx += 18) {
                            const wy = 360 + Math.sin((wx + gameTime * 2) * 0.08) * 3
                            ctx.fillRect(wx, wy, 12, 2)
                        }
                    }
                } else if (holePattern === 'triple') {
                    ctx.fillRect(180, 350, 120, 120)
                    ctx.fillRect(340, 350, 120, 120)
                    ctx.fillRect(500, 350, 120, 120)
                }
            }

            // Objects
            activeObjects.forEach(obj => {
                if (obj.type === 'log') {
                    const logFrame = obj.rolling ? (Math.floor(gameTime / 6) % 2 === 0 ? 'log' : 'log_1') : 'log'
                    drawSprite(ctx, logFrame, obj.x - 16, GROUND_Y - 24, 3)
                }
                if (obj.type === 'treasure' && !obj.collected) {
                    const tSprite = obj.treasureSprite || 'moneybag'
                    drawSprite(ctx, tSprite, obj.x - 14, GROUND_Y - 28, 3)
                }
                if (obj.type === 'ladder') {
                    // Flat ladder — matches playfield color ($D6)
                    ctx.fillStyle = '#6C9850'
                    ctx.fillRect(obj.x - 12, 350, 4, 200)
                    ctx.fillRect(obj.x + 8, 350, 4, 200)
                    for (let ly = 360; ly < 550; ly += 20) {
                        ctx.fillRect(obj.x - 12, ly, 24, 3)
                    }
                }
                if (obj.type === 'fire') {
                    const fireFrame = Math.floor(gameTime / 6) % 2 === 0 ? 'fire' : 'fire_1'
                    drawSprite(ctx, fireFrame, obj.x - 13, GROUND_Y - 33, 3)
                }
                if (obj.type === 'snake') {
                    const snakeFrame = Math.floor(gameTime / 12) % 2 === 0 ? 'snake' : 'snake_1'
                    drawSprite(ctx, snakeFrame, obj.x - 16, GROUND_Y - 30, 3)
                }
                // Scorpion — underground only
                if (obj.type === 'scorpion' && obj.underground) {
                    const scorpFrame = Math.floor(gameTime / 8) % 2 === 0 ? 'scorpion' : 'scorpion_1'
                    drawSprite(ctx, scorpFrame, obj.x - 19, UNDERGROUND_Y - 24, 3, obj.vx < 0)
                }
                // Croc heads — sprite-based
                if (obj.type === 'croc') {
                    if (obj.mouthOpen) {
                        drawSprite(ctx, 'croc_open', obj.x - 27, GROUND_Y - 24, 3)
                    } else {
                        drawSprite(ctx, 'croc_closed', obj.x - 27, GROUND_Y - 18, 3)
                    }
                }
                if (obj.type === 'vine') {
                    // Vine — thick green rope like original TIA ball sprite
                    const tipX = obj.pivotX + Math.sin(obj.angle) * obj.length
                    const tipY = obj.pivotY + Math.cos(obj.angle) * obj.length
                    // Draw vine as thick segmented rope with slight curve
                    ctx.strokeStyle = '#6C9850' // Green, matching canopy ($D6)
                    ctx.lineWidth = 6
                    ctx.lineCap = 'round'
                    ctx.beginPath()
                    // Slight catenary curve via quadratic bezier
                    const midX = (obj.pivotX + tipX) / 2 + Math.sin(obj.angle) * 12
                    const midY = (obj.pivotY + tipY) / 2 + 8
                    ctx.moveTo(obj.pivotX, obj.pivotY)
                    ctx.quadraticCurveTo(midX, midY, tipX, tipY)
                    ctx.stroke()
                    // Darker vine texture lines
                    ctx.strokeStyle = '#345C1C'
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.moveTo(obj.pivotX, obj.pivotY)
                    ctx.quadraticCurveTo(midX, midY, tipX, tipY)
                    ctx.stroke()
                    // Knot/grip at the tip where Harry grabs
                    ctx.fillStyle = '#646410'
                    ctx.beginPath()
                    ctx.arc(tipX, tipY, 5, 0, Math.PI * 2)
                    ctx.fill()
                }
            })

            // --- PLAYER ---
            if (player.state === 'dead') {
                // Flash Harry during death animation
                if (player.deathFlash) {
                    drawSprite(ctx, 'harry_idle', player.x - 12, player.y - 60, 3, false)
                }
            } else {
                let pSprite = 'harry_idle'
                let flip = player.vx < 0

                if (player.state === 'run') {
                    const frame = Math.floor(gameTime / 4) % 4
                    pSprite = `harry_run_${frame}`
                }
                if (player.state === 'jump') pSprite = 'harry_jump'
                if (player.state === 'climb') pSprite = 'harry_climb'
                if (player.state === 'swing') pSprite = 'harry_swing'

                drawSprite(ctx, pSprite, player.x - 12, player.y - 60, 3, flip)
            }

            // --- UI ---
            // Top Bar
            ctx.fillStyle = '#000000' // Black Bar
            ctx.fillRect(0, 0, SCREEN_WIDTH, 50)

            ctx.fillStyle = '#ECECEC' // Atari white ($0E)
            ctx.font = '24px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`${score.toString().padStart(6, '0')}`, 40, 35)
            ctx.textAlign = 'center'
            // Timer — MM:SS countdown
            const mins = Math.floor(timeLeft / 60)
            const secs = timeLeft % 60
            ctx.fillStyle = '#ECECEC'
            ctx.font = '20px monospace'
            ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, SCREEN_WIDTH / 2, 30)

            ctx.fillStyle = '#FCFC68' // Atari yellow ($1E)
            ctx.font = '12px monospace'
            ctx.fillText(`${collectedTreasures.size}/${TOTAL_TREASURES}`, SCREEN_WIDTH / 2, 45)
            // Room number (subtle)
            ctx.fillStyle = '#404040'
            ctx.font = '10px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`R${currentScreen}`, 6, 12)

            // Lives — small Harry head icons
            ctx.textAlign = 'right'
            for (let li = 0; li < lives; li++) {
                drawSprite(ctx, 'harry_head', SCREEN_WIDTH - 100 + li * 28, 10, 2)
            }

            if (gameOver) {
                ctx.fillStyle = 'rgba(0,0,0,0.75)'
                ctx.fillRect(0, SCREEN_HEIGHT / 2 - 80, SCREEN_WIDTH, 160)
                ctx.fillStyle = '#9C2020'
                ctx.font = 'bold 36px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("GAME OVER", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 30)
                ctx.fillStyle = '#FCFC68'
                ctx.font = '18px monospace'
                ctx.fillText(`SCORE: ${score.toString().padStart(6, '0')}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 10)
                ctx.fillStyle = '#6C9850'
                ctx.font = '14px monospace'
                ctx.fillText(`TREASURES: ${collectedTreasures.size} / ${TOTAL_TREASURES}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 35)
                if (Math.floor(gameTime / 30) % 2 === 0) {
                    ctx.fillStyle = '#ECECEC'
                    ctx.font = '14px monospace'
                    ctx.fillText("PRESS ANY KEY TO RESTART", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 65)
                }
            }

            if (isAttractMode) {
                // Semi-transparent backdrop for readability
                ctx.fillStyle = 'rgba(0,0,0,0.55)'
                ctx.fillRect(SCREEN_WIDTH / 2 - 200, SCREEN_HEIGHT / 2 - 85, 400, 145)
                // Title
                ctx.fillStyle = '#FCFC68'
                ctx.font = 'bold 42px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PITFALL!", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 42)
                // Subtitle
                ctx.fillStyle = '#6C9850'
                ctx.font = '12px monospace'
                ctx.fillText("PITFALL HARRY'S JUNGLE ADVENTURE", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 14)
                // Author credit (like original cartridge)
                ctx.fillStyle = '#909090'
                ctx.font = '10px monospace'
                ctx.fillText("DESIGNED BY DAVID CRANE", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 6)
                // Start prompt — flash
                if (Math.floor(gameTime / 30) % 2 === 0) {
                    ctx.fillStyle = '#ECECEC'
                    ctx.font = '16px monospace'
                    ctx.fillText("PRESS ANY KEY", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40)
                }
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

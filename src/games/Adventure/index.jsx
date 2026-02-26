import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

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

        // =============================================
        // GAME WORLD - fixed coordinate system
        // =============================================
        const GW = 160  // Atari 2600 resolution (approx)
        const GH = 192

        let viewWidth = 0, viewHeight = 0

        // =============================================
        // COLORS (Atari 2600 palette)
        // =============================================
        const COLORS = {
            black: '#000000',
            yellow: '#ffff00',    // gold castle / chalice
            gold: '#c8a000',
            tan: '#e8a060',
            green: '#00a800',
            darkGreen: '#005800',
            red: '#d03030',
            darkRed: '#881818',
            blue: '#3030d0',
            darkBlue: '#181888',
            purple: '#a848a8',
            orange: '#e87000',
            grey: '#888888',
            white: '#ffffff',
            cyan: '#00e8e8',
        }

        // =============================================
        // ROOM DEFINITIONS
        // =============================================
        // Each room: { id, name, color, walls[], exits: {up, down, left, right} }
        // Walls are rects that block movement: { x, y, w, h }
        // Standard room has walls around the edge with gaps for exits

        const makeWalls = (openTop, openBot, openLeft, openRight) => {
            const walls = []
            const T = 4  // wall thickness
            const gapL = 60  // gap position/size for top/bottom
            const gapW = 40
            const sideGapY = 70
            const sideGapH = 50

            // Top wall
            if (!openTop) {
                walls.push({ x: 0, y: 0, w: GW, h: T })
            } else {
                walls.push({ x: 0, y: 0, w: gapL, h: T })
                walls.push({ x: gapL + gapW, y: 0, w: GW - gapL - gapW, h: T })
            }
            // Bottom wall
            if (!openBot) {
                walls.push({ x: 0, y: GH - T, w: GW, h: T })
            } else {
                walls.push({ x: 0, y: GH - T, w: gapL, h: T })
                walls.push({ x: gapL + gapW, y: GH - T, w: GW - gapL - gapW, h: T })
            }
            // Left wall
            if (!openLeft) {
                walls.push({ x: 0, y: 0, w: T, h: GH })
            } else {
                walls.push({ x: 0, y: 0, w: T, h: sideGapY })
                walls.push({ x: 0, y: sideGapY + sideGapH, w: T, h: GH - sideGapY - sideGapH })
            }
            // Right wall
            if (!openRight) {
                walls.push({ x: GW - T, y: 0, w: T, h: GH })
            } else {
                walls.push({ x: GW - T, y: 0, w: T, h: sideGapY })
                walls.push({ x: GW - T, y: sideGapY + sideGapH, w: T, h: GH - sideGapY - sideGapH })
            }
            return walls
        }

        // Castle gate (portcullis) - a special wall that opens with the matching key
        const makeCastleWalls = (color) => {
            const walls = makeWalls(false, true, false, false)
            return walls
        }

        const makeLabyrinthWalls = (variant) => {
            const base = makeWalls(true, true, false, false)
            // Add internal maze walls
            if (variant === 1) {
                base.push({ x: 30, y: 30, w: 4, h: 80 })
                base.push({ x: 30, y: 30, w: 60, h: 4 })
                base.push({ x: 90, y: 30, w: 4, h: 50 })
                base.push({ x: 60, y: 80, w: 70, h: 4 })
                base.push({ x: 126, y: 30, w: 4, h: 54 })
                base.push({ x: 30, y: 130, w: 100, h: 4 })
                base.push({ x: 60, y: 110, w: 4, h: 20 })
                base.push({ x: 90, y: 100, w: 4, h: 30 })
                base.push({ x: 30, y: 155, w: 40, h: 4 })
                base.push({ x: 100, y: 150, w: 30, h: 4 })
            } else if (variant === 2) {
                base.push({ x: 20, y: 40, w: 4, h: 110 })
                base.push({ x: 20, y: 40, w: 50, h: 4 })
                base.push({ x: 70, y: 40, w: 4, h: 40 })
                base.push({ x: 40, y: 80, w: 30, h: 4 })
                base.push({ x: 40, y: 80, w: 4, h: 50 })
                base.push({ x: 90, y: 30, w: 4, h: 130 })
                base.push({ x: 90, y: 60, w: 50, h: 4 })
                base.push({ x: 110, y: 90, w: 4, h: 60 })
                base.push({ x: 110, y: 90, w: 30, h: 4 })
                base.push({ x: 60, y: 130, w: 30, h: 4 })
                base.push({ x: 120, y: 140, w: 4, h: 40 })
            } else {
                base.push({ x: 30, y: 50, w: 100, h: 4 })
                base.push({ x: 30, y: 50, w: 4, h: 60 })
                base.push({ x: 126, y: 50, w: 4, h: 60 })
                base.push({ x: 50, y: 80, w: 60, h: 4 })
                base.push({ x: 50, y: 80, w: 4, h: 40 })
                base.push({ x: 106, y: 80, w: 4, h: 40 })
                base.push({ x: 70, y: 100, w: 20, h: 4 })
                base.push({ x: 30, y: 130, w: 100, h: 4 })
                base.push({ x: 60, y: 150, w: 4, h: 30 })
                base.push({ x: 96, y: 150, w: 4, h: 30 })
            }
            return base
        }

        // Room IDs
        const R = {
            GOLD_CASTLE: 0,
            GOLD_FOYER: 1,
            OVERWORLD_1: 2,
            OVERWORLD_2: 3,
            OVERWORLD_3: 4,
            OVERWORLD_4: 5,
            OVERWORLD_5: 6,
            BLUE_LAB_1: 7,
            BLUE_LAB_2: 8,
            BLUE_LAB_3: 9,
            BLACK_CASTLE: 10,
            BLACK_FOYER: 11,
            RED_LAB_1: 12,
            RED_LAB_2: 13,
            WHITE_CASTLE: 14,
            WHITE_FOYER: 15,
            DRAGON_LAIR: 16,
            SECRET: 17,
        }

        const rooms = [
            // 0: Gold Castle (exterior/gate)
            { id: R.GOLD_CASTLE, name: 'Gold Castle', bg: COLORS.gold, walls: makeWalls(false, true, false, false), gate: true, gateColor: COLORS.yellow, gateKey: 'goldKey' },
            // 1: Gold Foyer (inside gold castle)
            { id: R.GOLD_FOYER, name: 'Gold Foyer', bg: '#484800', walls: makeWalls(true, false, false, false) },
            // 2-6: Overworld rooms (open areas)
            { id: R.OVERWORLD_1, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, true) },
            { id: R.OVERWORLD_2, name: 'Overworld', bg: COLORS.green, walls: makeWalls(true, true, true, true) },
            { id: R.OVERWORLD_3, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, true) },
            { id: R.OVERWORLD_4, name: 'Overworld', bg: COLORS.green, walls: makeWalls(true, true, false, true) },
            { id: R.OVERWORLD_5, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, false) },
            // 7-9: Blue Labyrinth
            { id: R.BLUE_LAB_1, name: 'Blue Labyrinth', bg: COLORS.darkBlue, walls: makeLabyrinthWalls(1) },
            { id: R.BLUE_LAB_2, name: 'Blue Labyrinth', bg: '#101060', walls: makeLabyrinthWalls(2) },
            { id: R.BLUE_LAB_3, name: 'Blue Labyrinth', bg: COLORS.darkBlue, walls: makeLabyrinthWalls(3) },
            // 10: Black Castle
            { id: R.BLACK_CASTLE, name: 'Black Castle', bg: '#282828', walls: makeWalls(false, true, false, false), gate: true, gateColor: '#555555', gateKey: 'blackKey' },
            // 11: Black Foyer
            { id: R.BLACK_FOYER, name: 'Black Foyer', bg: '#181818', walls: makeWalls(true, false, false, false) },
            // 12-13: Red Labyrinth (inside black castle area)
            { id: R.RED_LAB_1, name: 'Red Maze', bg: COLORS.darkRed, walls: makeLabyrinthWalls(1) },
            { id: R.RED_LAB_2, name: 'Red Maze', bg: '#601010', walls: makeLabyrinthWalls(2) },
            // 14: White Castle
            { id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(false, true, false, false), gate: true, gateColor: '#ffffff', gateKey: 'whiteKey' },
            // 15: White Foyer
            { id: R.WHITE_FOYER, name: 'White Foyer', bg: '#a0a0a0', walls: makeWalls(true, false, false, false) },
            // 16: Dragon Lair
            { id: R.DRAGON_LAIR, name: 'Dragon Lair', bg: '#300030', walls: makeWalls(true, false, true, false) },
            // 17: Secret room (easter egg dot)
            { id: R.SECRET, name: '???', bg: '#000000', walls: makeWalls(false, false, true, false) },
        ]

        // Room connectivity: exits[roomId] = { up, down, left, right }
        const exits = {}
        exits[R.GOLD_CASTLE] =  { up: -1, down: R.OVERWORLD_1, left: -1, right: -1 }
        exits[R.GOLD_FOYER] =   { up: -1, down: -1, left: -1, right: -1 }  // only accessible through gate
        exits[R.OVERWORLD_1] =  { up: R.GOLD_CASTLE, down: R.OVERWORLD_2, left: R.OVERWORLD_5, right: R.OVERWORLD_4 }
        exits[R.OVERWORLD_2] =  { up: R.OVERWORLD_1, down: R.OVERWORLD_3, left: R.BLUE_LAB_1, right: R.OVERWORLD_4 }
        exits[R.OVERWORLD_3] =  { up: R.OVERWORLD_2, down: R.BLACK_CASTLE, left: R.BLUE_LAB_3, right: R.OVERWORLD_4 }
        exits[R.OVERWORLD_4] =  { up: R.OVERWORLD_1, down: R.OVERWORLD_3, left: R.OVERWORLD_2, right: R.WHITE_CASTLE }
        exits[R.OVERWORLD_5] =  { up: R.OVERWORLD_1, down: R.DRAGON_LAIR, left: R.BLUE_LAB_1, right: R.OVERWORLD_1 }
        exits[R.BLUE_LAB_1] =   { up: R.OVERWORLD_2, down: R.BLUE_LAB_2, left: -1, right: -1 }
        exits[R.BLUE_LAB_2] =   { up: R.BLUE_LAB_1, down: R.BLUE_LAB_3, left: -1, right: -1 }
        exits[R.BLUE_LAB_3] =   { up: R.BLUE_LAB_2, down: R.OVERWORLD_3, left: -1, right: -1 }
        exits[R.BLACK_CASTLE] = { up: -1, down: R.OVERWORLD_3, left: -1, right: -1 }
        exits[R.BLACK_FOYER] =  { up: -1, down: -1, left: -1, right: -1 }
        exits[R.RED_LAB_1] =    { up: R.BLACK_FOYER, down: R.RED_LAB_2, left: -1, right: -1 }
        exits[R.RED_LAB_2] =    { up: R.RED_LAB_1, down: R.BLACK_FOYER, left: -1, right: -1 }
        exits[R.WHITE_CASTLE] = { up: -1, down: R.OVERWORLD_4, left: -1, right: -1 }
        exits[R.WHITE_FOYER] =  { up: -1, down: -1, left: -1, right: -1 }
        exits[R.DRAGON_LAIR] =  { up: R.OVERWORLD_5, down: -1, left: R.SECRET, right: -1 }
        exits[R.SECRET] =       { up: -1, down: -1, left: -1, right: R.DRAGON_LAIR }

        // Castle inside connections (through gate)
        const castleInsides = {
            [R.GOLD_CASTLE]: R.GOLD_FOYER,
            [R.BLACK_CASTLE]: R.BLACK_FOYER,
            [R.WHITE_CASTLE]: R.WHITE_FOYER,
        }
        // From foyer, going down leads back out (gate up -> inside)
        exits[R.GOLD_FOYER].up = R.GOLD_CASTLE
        exits[R.BLACK_FOYER].up = R.BLACK_CASTLE
        exits[R.BLACK_FOYER].down = R.RED_LAB_1
        exits[R.WHITE_FOYER].up = R.WHITE_CASTLE

        // =============================================
        // ITEMS
        // =============================================
        const items = [
            { id: 'sword', name: 'Sword', room: R.GOLD_FOYER, x: 80, y: 100, w: 6, h: 20, color: COLORS.yellow, carried: false },
            { id: 'goldKey', name: 'Gold Key', room: R.OVERWORLD_4, x: 120, y: 90, w: 8, h: 14, color: COLORS.yellow, carried: false },
            { id: 'blackKey', name: 'Black Key', room: R.BLUE_LAB_2, x: 70, y: 100, w: 8, h: 14, color: '#555555', carried: false },
            { id: 'whiteKey', name: 'White Key', room: R.RED_LAB_1, x: 60, y: 80, w: 8, h: 14, color: COLORS.white, carried: false },
            { id: 'chalice', name: 'Chalice', room: R.WHITE_FOYER, x: 80, y: 100, w: 10, h: 16, color: COLORS.gold, carried: false },
            { id: 'bridge', name: 'Bridge', room: R.OVERWORLD_2, x: 100, y: 80, w: 28, h: 6, color: COLORS.purple, carried: false },
            { id: 'magnet', name: 'Magnet', room: R.BLACK_FOYER, x: 80, y: 90, w: 10, h: 12, color: COLORS.white, carried: false },
        ]

        // =============================================
        // DRAGONS
        // =============================================
        const dragons = [
            { id: 'yorgle', name: 'Yorgle', room: R.BLUE_LAB_1, x: 80, y: 60, color: COLORS.yellow, speed: 0.6, alive: true, mouthOpen: false, guardItem: 'chalice', fleesFrom: 'goldKey' },
            { id: 'grundle', name: 'Grundle', room: R.RED_LAB_2, x: 80, y: 90, color: COLORS.green, speed: 0.8, alive: true, mouthOpen: false, guardItem: 'blackKey', fleesFrom: null },
            { id: 'rhindle', name: 'Rhindle', room: R.DRAGON_LAIR, x: 80, y: 80, color: COLORS.red, speed: 1.0, alive: true, mouthOpen: false, guardItem: 'chalice', fleesFrom: null },
        ]

        // =============================================
        // BAT
        // =============================================
        let bat = {
            room: R.OVERWORLD_3, x: 90, y: 50,
            vx: 1.5, vy: 0.8,
            carrying: null, // item id
            swapTimer: 0,
        }

        // =============================================
        // PLAYER STATE
        // =============================================
        let player = { x: 80, y: 100, w: 6, h: 10 }
        let currentRoom = R.GOLD_CASTLE
        let carrying = null  // item id
        let gameWon = false
        let playerDead = false
        let deathTimer = 0
        let isAttractMode = true
        let tickCount = 0
        let attractDir = { x: 0, y: 0 }
        let attractTimer = 0

        // Gate states (open/closed)
        const gateOpen = { goldKey: false, blackKey: false, whiteKey: false }

        const PLAYER_SPEED = 1.8

        const resetGame = () => {
            player.x = 80
            player.y = 150
            currentRoom = R.GOLD_CASTLE
            carrying = null
            gameWon = false
            playerDead = false
            deathTimer = 0
            gateOpen.goldKey = false
            gateOpen.blackKey = false
            gateOpen.whiteKey = false

            items[0].room = R.GOLD_FOYER; items[0].x = 80; items[0].y = 100; items[0].carried = false
            items[1].room = R.OVERWORLD_4; items[1].x = 120; items[1].y = 90; items[1].carried = false
            items[2].room = R.BLUE_LAB_2; items[2].x = 70; items[2].y = 100; items[2].carried = false
            items[3].room = R.RED_LAB_1; items[3].x = 60; items[3].y = 80; items[3].carried = false
            items[4].room = R.WHITE_FOYER; items[4].x = 80; items[4].y = 100; items[4].carried = false
            items[5].room = R.OVERWORLD_2; items[5].x = 100; items[5].y = 80; items[5].carried = false
            items[6].room = R.BLACK_FOYER; items[6].x = 80; items[6].y = 90; items[6].carried = false

            dragons[0].room = R.BLUE_LAB_1; dragons[0].x = 80; dragons[0].y = 60; dragons[0].alive = true; dragons[0].mouthOpen = false
            dragons[1].room = R.RED_LAB_2; dragons[1].x = 80; dragons[1].y = 90; dragons[1].alive = true; dragons[1].mouthOpen = false
            dragons[2].room = R.DRAGON_LAIR; dragons[2].x = 80; dragons[2].y = 80; dragons[2].alive = true; dragons[2].mouthOpen = false

            bat.room = R.OVERWORLD_3; bat.x = 90; bat.y = 50; bat.carrying = null; bat.swapTimer = 0
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
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

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
                resetGame()
            }
            if (gameWon || playerDead) {
                resetGame()
                return
            }
            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = true
                e.preventDefault()
            }
            // Drop item
            if (e.code === 'Space') {
                if (carrying) {
                    const item = items.find(i => i.id === carrying)
                    if (item) {
                        item.carried = false
                        item.room = currentRoom
                        item.x = player.x
                        item.y = player.y + player.h + 2
                    }
                    carrying = null
                }
                e.preventDefault()
            }
        }
        const handleKeyUp = (e) => {
            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = false
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // =============================================
        // COLLISION
        // =============================================
        const rectsOverlap = (ax, ay, aw, ah, bx, by, bw, bh) => {
            return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
        }

        const collidesWithWalls = (room, x, y, w, h) => {
            for (const wall of room.walls) {
                if (rectsOverlap(x, y, w, h, wall.x, wall.y, wall.w, wall.h)) {
                    return true
                }
            }
            // Check gate
            if (room.gate && !gateOpen[room.gateKey]) {
                // Gate blocks the top opening
                if (rectsOverlap(x, y, w, h, 56, 0, 48, 30)) {
                    return true
                }
            }
            return false
        }

        // =============================================
        // ROOM TRANSITIONS
        // =============================================
        const tryTransition = () => {
            const room = rooms[currentRoom]
            const ex = exits[currentRoom]
            if (!ex) return

            // Top exit
            if (player.y < 0) {
                // Castle: going up through gate enters foyer
                if (room.gate && gateOpen[room.gateKey] && castleInsides[currentRoom] !== undefined) {
                    currentRoom = castleInsides[currentRoom]
                    player.y = GH - player.h - 8
                    return
                }
                if (ex.up >= 0) {
                    currentRoom = ex.up
                    player.y = GH - player.h - 8
                } else {
                    player.y = 0
                }
            }
            // Bottom exit
            if (player.y + player.h > GH) {
                if (ex.down >= 0) {
                    currentRoom = ex.down
                    player.y = 8
                } else {
                    player.y = GH - player.h
                }
            }
            // Left exit
            if (player.x < 0) {
                if (ex.left >= 0) {
                    currentRoom = ex.left
                    player.x = GW - player.w - 8
                } else {
                    player.x = 0
                }
            }
            // Right exit
            if (player.x + player.w > GW) {
                if (ex.right >= 0) {
                    currentRoom = ex.right
                    player.x = 8
                } else {
                    player.x = GW - player.w
                }
            }
        }

        // =============================================
        // UPDATE
        // =============================================
        const update = () => {
            if (gameWon || (playerDead && deathTimer <= 0)) return
            tickCount++

            if (playerDead) {
                deathTimer--
                return
            }

            // ---- PLAYER MOVEMENT ----
            let dx = 0, dy = 0
            if (isAttractMode) {
                // AI: wander around
                attractTimer--
                if (attractTimer <= 0) {
                    attractDir = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }
                    attractTimer = 60 + Math.floor(Math.random() * 120)
                }
                dx = attractDir.x * PLAYER_SPEED * 0.5
                dy = attractDir.y * PLAYER_SPEED * 0.5
            } else {
                if (keys.ArrowUp) dy = -PLAYER_SPEED
                if (keys.ArrowDown) dy = PLAYER_SPEED
                if (keys.ArrowLeft) dx = -PLAYER_SPEED
                if (keys.ArrowRight) dx = PLAYER_SPEED
            }

            const room = rooms[currentRoom]

            // Try X movement
            const newX = player.x + dx
            if (!collidesWithWalls(room, newX, player.y, player.w, player.h)) {
                player.x = newX
            }
            // Try Y movement
            const newY = player.y + dy
            if (!collidesWithWalls(room, player.x, newY, player.w, player.h)) {
                player.y = newY
            }

            // Bridge: allows passing through walls
            if (carrying === 'bridge') {
                player.x += dx * 0.3  // partial wall pass
                player.y += dy * 0.3
            }

            // Room transitions
            tryTransition()

            // Carried item follows player
            if (carrying) {
                const item = items.find(i => i.id === carrying)
                if (item) {
                    item.room = currentRoom
                    item.x = player.x
                    item.y = player.y + player.h
                }
            }

            // ---- ITEM PICKUP ----
            if (!carrying) {
                for (const item of items) {
                    if (item.room === currentRoom && !item.carried) {
                        if (rectsOverlap(player.x, player.y, player.w, player.h,
                            item.x, item.y, item.w, item.h)) {
                            carrying = item.id
                            item.carried = true
                            audioController.playTone(600, 0.05, 'square')
                            break
                        }
                    }
                }
            }

            // ---- GATE LOGIC ----
            for (const rm of rooms) {
                if (rm.gate) {
                    const key = items.find(i => i.id === rm.gateKey)
                    if (key && key.room === rm.id && !key.carried && !gateOpen[rm.gateKey]) {
                        // Key is in the castle room — check if near gate area
                        if (key.y < 60 && key.x > 40 && key.x < 120) {
                            gateOpen[rm.gateKey] = true
                            audioController.playSweep(200, 600, 0.3, 'square')
                        }
                    }
                }
            }

            // ---- DRAGON AI ----
            for (const dragon of dragons) {
                if (!dragon.alive) continue

                if (dragon.room === currentRoom) {
                    // Chase player
                    const ddx = player.x - dragon.x
                    const ddy = player.y - dragon.y
                    const dist = Math.sqrt(ddx * ddx + ddy * ddy)

                    // Check if player has sword
                    if (carrying === 'sword' && dist < 14) {
                        // Slay the dragon!
                        dragon.alive = false
                        audioController.playNoise(0.2, 0.3)
                        audioController.playSweep(800, 200, 0.3, 'sawtooth')
                        continue
                    }

                    // Flee from certain items
                    if (dragon.fleesFrom && carrying === dragon.fleesFrom) {
                        dragon.x -= (ddx / (dist || 1)) * dragon.speed
                        dragon.y -= (ddy / (dist || 1)) * dragon.speed
                    } else if (dist > 8) {
                        dragon.x += (ddx / (dist || 1)) * dragon.speed
                        dragon.y += (ddy / (dist || 1)) * dragon.speed

                        // Open mouth when close
                        dragon.mouthOpen = dist < 30
                    }

                    // Bite! — kill player
                    if (dist < 8 && dragon.mouthOpen) {
                        playerDead = true
                        deathTimer = 120
                        audioController.playNoise(0.4, 0.5)
                        audioController.playSweep(500, 50, 0.5, 'sawtooth')
                    }
                } else {
                    // Dragon wanders in its room
                    dragon.x += (Math.random() - 0.5) * dragon.speed
                    dragon.y += (Math.random() - 0.5) * dragon.speed
                    dragon.mouthOpen = false
                }

                // Clamp dragons to room bounds
                dragon.x = Math.max(10, Math.min(GW - 20, dragon.x))
                dragon.y = Math.max(10, Math.min(GH - 20, dragon.y))
            }

            // ---- BAT AI ----
            bat.x += bat.vx
            bat.y += bat.vy
            if (bat.x < 10 || bat.x > GW - 20) bat.vx *= -1
            if (bat.y < 10 || bat.y > GH - 20) bat.vy *= -1

            // Bat randomly changes direction
            if (Math.random() < 0.02) {
                bat.vx = (Math.random() - 0.5) * 3
                bat.vy = (Math.random() - 0.5) * 3
            }

            // Bat can roam between rooms
            if (bat.x < 2) { const ex = exits[bat.room]; if (ex && ex.left >= 0) { bat.room = ex.left; bat.x = GW - 20 } else bat.vx *= -1 }
            if (bat.x > GW - 8) { const ex = exits[bat.room]; if (ex && ex.right >= 0) { bat.room = ex.right; bat.x = 10 } else bat.vx *= -1 }
            if (bat.y < 2) { const ex = exits[bat.room]; if (ex && ex.up >= 0) { bat.room = ex.up; bat.y = GH - 20 } else bat.vy *= -1 }
            if (bat.y > GH - 8) { const ex = exits[bat.room]; if (ex && ex.down >= 0) { bat.room = ex.down; bat.y = 10 } else bat.vy *= -1 }

            bat.swapTimer--

            // Bat steals/swaps items
            if (bat.room === currentRoom && bat.swapTimer <= 0) {
                for (const item of items) {
                    if (item.room === currentRoom && !item.carried && item.id !== bat.carrying) {
                        if (rectsOverlap(bat.x, bat.y, 10, 10, item.x, item.y, item.w, item.h)) {
                            // Drop what bat is carrying
                            if (bat.carrying) {
                                const dropped = items.find(i => i.id === bat.carrying)
                                if (dropped) {
                                    dropped.room = currentRoom
                                    dropped.x = item.x
                                    dropped.y = item.y
                                    dropped.carried = false
                                }
                            }
                            bat.carrying = item.id
                            item.carried = true
                            bat.swapTimer = 180
                            audioController.playTone(900, 0.04, 'triangle')
                            break
                        }
                    }
                }
            }

            // Bat carries its item
            if (bat.carrying) {
                const item = items.find(i => i.id === bat.carrying)
                if (item) {
                    item.room = bat.room
                    item.x = bat.x
                    item.y = bat.y + 10
                }
            }

            // ---- WIN CONDITION ----
            // Bring the chalice to the Gold Castle
            if (currentRoom === R.GOLD_CASTLE && carrying === 'chalice') {
                gameWon = true
                audioController.playSweep(400, 1200, 1.0, 'square')
            }
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
                if (!gateOpen[room.gateKey]) {
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
        }

        const darken = (hex) => {
            const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40)
            const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40)
            const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40)
            return `rgb(${r},${g},${b})`
        }

        const drawPlayer = () => {
            if (playerDead) {
                // Death flash
                if (tickCount % 8 < 4) {
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
            if (item.room !== currentRoom || item.carried) return

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
                if (tickCount % 20 < 10) {
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
            } else {
                ctx.fillRect(item.x, item.y, item.w, item.h)
            }
        }

        const drawDragon = (dragon) => {
            if (dragon.room !== currentRoom) return
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
            if (tickCount % 20 < 10) {
                ctx.fillRect(dx + 2, dy - 6, 8, 4)
            } else {
                ctx.fillRect(dx + 2, dy - 4, 8, 3)
            }
        }

        const drawBat = () => {
            if (bat.room !== currentRoom) return

            ctx.fillStyle = COLORS.purple
            const bx = bat.x, by = bat.y

            // Body
            ctx.fillRect(bx + 3, by + 3, 4, 5)

            // Wings (flap animation)
            if (tickCount % 12 < 6) {
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
            drawRoom(rooms[currentRoom])

            // Items in this room
            for (const item of items) {
                drawItem(item)
            }

            // Carried item (draw at player position)
            if (carrying) {
                const item = items.find(i => i.id === carrying)
                if (item) {
                    const savedRoom = item.room
                    item.room = currentRoom  // force draw
                    item.carried = false
                    drawItem(item)
                    item.room = savedRoom
                    item.carried = true
                }
            }

            // Dragons
            for (const dragon of dragons) {
                drawDragon(dragon)
            }

            // Bat
            drawBat()

            // Player
            drawPlayer()

            // UI overlays
            if (isAttractMode) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = COLORS.yellow
                ctx.font = '10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('ADVENTURE', GW / 2, GH / 2 - 20)
                ctx.fillStyle = COLORS.white
                ctx.font = '7px monospace'
                ctx.fillText('PRESS ANY KEY', GW / 2, GH / 2)
                ctx.fillText('TO START', GW / 2, GH / 2 + 12)
            }

            if (gameWon) {
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

            if (playerDead && deathTimer <= 0) {
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
            if (!isAttractMode && !gameWon) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, 0, GW, 10)
                ctx.fillStyle = COLORS.white
                ctx.font = '6px monospace'
                ctx.textAlign = 'left'
                ctx.fillText(rooms[currentRoom].name, 4, 7)
                if (carrying) {
                    ctx.textAlign = 'right'
                    const item = items.find(i => i.id === carrying)
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
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ADVENTURE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default AdventureGame

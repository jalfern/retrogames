import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

// =====================================================================
// SUPER MARIO BROS  -  World 1-1 & 1-2
// Original engine. Sprites drawn with canvas primitives (no ripped art).
// =====================================================================

const TILE = 16
const VIEW_W = 256
const VIEW_H = 240
const ROWS = 15

// Tile ids
const EMPTY = 0
const GROUND = 1
const BRICK = 2
const QUESTION = 3
const SOLID = 4
const USED = 5
const PIPE = 6
const SOLID_SET = new Set([GROUND, BRICK, QUESTION, SOLID, USED, PIPE])

// Palette (NES-ish)
const C = {
    sky: '#5c94fc',
    skyUnder: '#000000',
    ground: '#c84c0c',
    groundDark: '#88400a',
    groundLight: '#e89058',
    brick: '#c84c0c',
    brickLine: '#6a2800',
    block: '#e8a000',
    blockDark: '#a05000',
    blockLight: '#fcd8a8',
    used: '#a04000',
    pipe: '#00a800',
    pipeDark: '#007000',
    pipeLight: '#58d854',
    coin: '#fcd800',
    coinDark: '#b07800',
    goomba: '#9c5a1c',
    goombaFoot: '#5c2e00',
    koopa: '#00a800',
    koopaShell: '#10a010',
    koopaShellDark: '#006000',
    koopaSkin: '#f8d878',
    shroom: '#e02020',
    shroomSpot: '#ffffff',
    shroomStem: '#f8d8b0',
    marioRed: '#e02020',
    marioSkin: '#f8b888',
    marioBlue: '#3030e0',
    marioShoe: '#6a2800',
    fireTop: '#ffffff',
    fireball: '#f83800',
    fireballCore: '#fcd8a8',
    flowerPetal: '#f87800',
    flowerPetal2: '#f8e0a0',
    flowerCenter: '#f83800',
    flowerStem: '#00a800',
    white: '#ffffff',
    black: '#000000',
    cloud: '#ffffff',
    bush: '#00a800',
    castle: '#c84c0c',
    flag: '#00a800',
}

// ---- Level builder ---------------------------------------------------
function buildLevel(def) {
    const cols = def.cols
    const grid = Array.from({ length: ROWS }, () => new Array(cols).fill(EMPTY))
    const api = {
        cols,
        set(c, r, t) { if (r >= 0 && r < ROWS && c >= 0 && c < cols) grid[r][c] = t },
        get(c, r) { return grid[r][c] },
        ground(c1, c2) { for (let c = c1; c <= c2; c++) { api.set(c, 13, GROUND); api.set(c, 14, GROUND) } },
        row(c1, c2, r, t) { for (let c = c1; c <= c2; c++) api.set(c, r, t) },
        pipe(c, h) { const top = 13 - h; for (let r = top; r <= 12; r++) { api.set(c, r, PIPE); api.set(c + 1, r, PIPE) } },
        stairUp(c, steps) { for (let i = 0; i < steps; i++) for (let r = 12 - i; r <= 12; r++) api.set(c + i, r, SOLID) },
        stairDown(c, steps) { for (let i = 0; i < steps; i++) for (let r = 12 - (steps - 1 - i); r <= 12; r++) api.set(c + i, r, SOLID) },
        wall(c, r1, r2) { for (let r = r1; r <= r2; r++) api.set(c, r, SOLID) },
    }
    def.build(api)
    return { cols, grid, ...def }
}

// World 1-1 (overworld)
const LEVEL_1 = buildLevel({
    id: '1-1', cols: 212, bg: 'sky', flagCol: 174, castleCol: 180,
    flowerCols: [16], shroomCols: [21, 22],
    build(a) {
        a.ground(0, 211)
        // pits
        for (const [c1, c2] of [[69, 70], [86, 88], [153, 154]])
            for (let c = c1; c <= c2; c++) { a.set(c, 13, EMPTY); a.set(c, 14, EMPTY) }
        // first ? block
        a.set(16, 9, QUESTION)
        // two-tier block cluster
        a.set(20, 9, BRICK); a.set(21, 9, QUESTION); a.set(22, 9, BRICK); a.set(23, 9, QUESTION); a.set(24, 9, BRICK)
        a.set(20, 5, BRICK); a.set(21, 5, BRICK); a.set(22, 5, QUESTION); a.set(23, 5, BRICK); a.set(24, 5, BRICK)
        // pipes
        a.pipe(28, 2); a.pipe(38, 3); a.pipe(46, 4); a.pipe(57, 4)
        // mid section
        a.set(78, 9, QUESTION)
        a.row(80, 87, 5, BRICK)
        a.set(91, 9, QUESTION)
        a.set(94, 9, BRICK); a.set(95, 9, QUESTION); a.set(96, 9, BRICK)
        a.pipe(101, 4)
        a.row(109, 113, 5, BRICK); a.set(111, 5, QUESTION)
        a.pipe(118, 2); a.pipe(129, 3)
        a.set(130, 9, BRICK); a.set(131, 9, QUESTION); a.set(132, 9, BRICK)
        a.set(168, 9, QUESTION); a.set(169, 9, BRICK)
        // final staircase
        a.stairUp(160, 8)
        // flagpole base
        a.set(174, 12, SOLID)
    },
    coinArcs: [
        { c: 20, r: 3 }, { c: 21, r: 3 }, { c: 22, r: 3 }, { c: 23, r: 3 }, { c: 24, r: 3 },
        { c: 81, r: 3 }, { c: 82, r: 3 }, { c: 83, r: 3 }, { c: 84, r: 3 }, { c: 85, r: 3 }, { c: 86, r: 3 },
        { c: 110, r: 3 }, { c: 111, r: 3 }, { c: 112, r: 3 },
    ],
    enemies: [
        { type: 'goomba', c: 19 }, { type: 'goomba', c: 26 }, { type: 'goomba', c: 41 },
        { type: 'goomba', c: 51 }, { type: 'goomba', c: 52 }, { type: 'goomba', c: 80 },
        { type: 'goomba', c: 82 }, { type: 'koopa', c: 97 }, { type: 'goomba', c: 108 },
        { type: 'goomba', c: 110 }, { type: 'goomba', c: 124 }, { type: 'goomba', c: 125 },
        { type: 'koopa', c: 134 },
    ],
    decor: { clouds: [8, 19, 27, 35, 44, 55, 67, 75, 83, 95, 108, 120, 133, 148], bushes: [3, 12, 23, 41, 60, 74, 92, 110, 130, 150],
        hills: [[1, 1], [15, 0], [24, 1], [40, 0], [52, 1], [70, 0], [82, 1], [100, 0], [118, 1], [138, 0], [150, 1], [168, 0]] },
})

// World 1-2 (underground)
const LEVEL_2 = buildLevel({
    id: '1-2', cols: 176, bg: 'under', exitCol: 168,
    shroomCols: [18, 104], flowerCols: [66],
    build(a) {
        a.ground(0, 175)
        for (const [c1, c2] of [[30, 31], [58, 59], [90, 91], [120, 121]])
            for (let c = c1; c <= c2; c++) { a.set(c, 13, EMPTY); a.set(c, 14, EMPTY) }
        // brick ceiling
        a.row(0, 175, 2, BRICK)
        // early blocks
        a.set(16, 9, QUESTION); a.set(17, 9, BRICK); a.set(18, 9, QUESTION)
        a.set(22, 9, BRICK); a.set(23, 9, QUESTION); a.set(24, 9, BRICK)
        a.row(22, 24, 5, BRICK)
        a.pipe(35, 2)
        // maze walls
        a.wall(60, 10, 12)      // low wall, jump over
        a.wall(120, 3, 8)       // hanging wall, run under
        // coin rooms
        a.row(40, 45, 5, BRICK)
        a.set(66, 8, QUESTION); a.set(67, 8, BRICK); a.set(68, 8, QUESTION)
        a.row(70, 78, 9, BRICK)
        a.row(100, 108, 5, BRICK)
        a.set(104, 5, QUESTION)
        a.pipe(128, 3)
        a.set(134, 9, QUESTION); a.set(140, 9, BRICK); a.set(141, 9, QUESTION); a.set(142, 9, BRICK)
        // exit pipe
        a.pipe(168, 3)
    },
    coinArcs: [
        { c: 41, r: 3 }, { c: 42, r: 3 }, { c: 43, r: 3 }, { c: 44, r: 3 },
        { c: 71, r: 7 }, { c: 72, r: 7 }, { c: 73, r: 7 }, { c: 74, r: 7 }, { c: 75, r: 7 },
        { c: 101, r: 3 }, { c: 102, r: 3 }, { c: 103, r: 3 }, { c: 105, r: 3 }, { c: 106, r: 3 }, { c: 107, r: 3 },
    ],
    enemies: [
        { type: 'goomba', c: 20 }, { type: 'koopa', c: 40 }, { type: 'goomba', c: 52 },
        { type: 'goomba', c: 53 }, { type: 'koopa', c: 66 }, { type: 'goomba', c: 72 },
        { type: 'koopa', c: 80 }, { type: 'goomba', c: 95 }, { type: 'goomba', c: 102 },
        { type: 'koopa', c: 112 }, { type: 'goomba', c: 130 }, { type: 'goomba', c: 131 },
        { type: 'koopa', c: 150 },
    ],
    decor: { clouds: [], bushes: [] },
})

const LEVELS = [LEVEL_1, LEVEL_2]

const SuperMarioGame = () => {
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

        // ---- physics constants ----
        const GRAVITY = 0.5
        const GRAVITY_HOLD = 0.27
        const MAX_FALL = 9
        const WALK_ACCEL = 0.09
        const RUN_ACCEL = 0.14
        const WALK_MAX = 1.9
        const RUN_MAX = 3.3
        const FRICTION = 0.86
        const JUMP_VEL = -7.7

        // ---- input ----
        const keys = { left: false, right: false, run: false, down: false, jump: false }
        let jumpLatch = false
        let fireLatch = false
        let firePressed = false
        let fireCooldown = 0

        // ---- game state ----
        let state = 'attract' // attract | play | dying | levelclear | gameover | win
        let levelIndex = 0
        let level = LEVELS[0]
        let score = 0, coins = 0, lives = 3
        let timer = 400, timerAcc = 0
        let tick = 0
        let transitionTimer = 0
        let cameraX = 0
        let introTimer = 0
        let flagPhase = ''
        let flagT = 0

        let mario = null
        let enemies = []
        let coinsArr = []
        let shrooms = []
        let fireballs = []
        let particles = []
        let popups = []

        const spawnMario = (power) => {
            const big = power && power !== 'small'
            return {
                x: 40, y: (13 * TILE) - (big ? 28 : 16), w: 12, h: big ? 28 : 16,
                vx: 0, vy: 0, onGround: false, big, power: power || 'small',
                facing: 1, invuln: 0, anim: 0, jumpPressed: false,
            }
        }

        const loadLevel = (idx, keepPower) => {
            levelIndex = idx
            level = LEVELS[idx]
            const power = keepPower && mario ? mario.power : 'small'
            mario = spawnMario(power)
            cameraX = 0
            timer = 400; timerAcc = 0
            enemies = (level.enemies || []).map(e => ({
                type: e.type,
                x: e.c * TILE, y: (13 * TILE) - (e.type === 'koopa' ? 24 : 16),
                w: 14, h: e.type === 'koopa' ? 24 : 16,
                vx: -0.6, vy: 0, alive: true, shell: false, still: false, anim: 0, squash: 0, flip: false, grace: 0,
            }))
            coinsArr = (level.coinArcs || []).map(cc => ({
                x: cc.c * TILE + 4, y: cc.r * TILE + 4, w: 8, h: 8, taken: false, anim: Math.random() * 6,
            }))
            shrooms = []
            fireballs = []
            particles = []
            popups = []
            fireCooldown = 0
            state = 'intro'
            introTimer = 110
        }

        const resetGame = () => {
            score = 0; coins = 0; lives = 3
            mario = spawnMario('small')
            loadLevel(0)
        }

        // ---- resize ----
        const resize = () => {
            if (!canvas || !containerRef.current) return
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
        }
        window.addEventListener('resize', resize)
        resize()

        // ---- input handlers ----
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const s = !pausedRef.current
                pausedRef.current = s; setPaused(s)
                return
            }
            if (pausedRef.current) return

            if (state === 'attract' || state === 'gameover' || state === 'win') {
                resetGame()
                audioController.init()
                e.preventDefault()
                return
            }

            const c = e.code
            if (c === 'ArrowLeft' || c === 'KeyA') keys.left = true
            else if (c === 'ArrowRight' || c === 'KeyD') keys.right = true
            else if (c === 'ArrowUp' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyX') keys.run = true
            else if (c === 'ArrowDown' || c === 'KeyS') keys.down = true
            else if (c === 'Space' || c === 'KeyZ' || c === 'ArrowUp') { keys.jump = true; if (!jumpLatch) { jumpLatch = true; mario && (mario.jumpPressed = true) } }
            else if (c === 'KeyF' || c === 'KeyB' || c === 'ControlLeft' || c === 'ControlRight') { if (!fireLatch) { fireLatch = true; firePressed = true } }

            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(c)) e.preventDefault()
        }
        const handleKeyUp = (e) => {
            const c = e.code
            if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false
            else if (c === 'ArrowRight' || c === 'KeyD') keys.right = false
            else if (c === 'ArrowUp' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyX') keys.run = false
            else if (c === 'ArrowDown' || c === 'KeyS') keys.down = false
            else if (c === 'Space' || c === 'KeyZ' || c === 'ArrowUp') { keys.jump = false; jumpLatch = false }
            else if (c === 'KeyF' || c === 'KeyB' || c === 'ControlLeft' || c === 'ControlRight') { fireLatch = false }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // ---- helpers ----
        const solidAt = (c, r) => {
            if (r < 0 || r >= ROWS || c < 0 || c >= level.cols) return false
            return SOLID_SET.has(level.grid[r][c])
        }
        const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

        const addScore = (n, x, y, label) => {
            score += n
            if (label) popups.push({ x, y, life: 40, text: label })
        }

        const breakBrick = (c, r) => {
            level.grid[r][c] = EMPTY
            for (let i = 0; i < 4; i++) {
                particles.push({
                    x: c * TILE + 4 + (i % 2) * 6, y: r * TILE + 4 + Math.floor(i / 2) * 6,
                    vx: (i % 2 ? 1.5 : -1.5), vy: -3 - Math.random() * 2, life: 40, color: C.brick,
                })
            }
            audioController.playNoise(0.12, 0.25)
        }

        const spawnPower = (c, r, kind) => {
            shrooms.push({ x: c * TILE + 2, y: r * TILE, w: 12, h: 14, vx: 0.8, vy: 0, emerging: 14, kind })
            audioController.playSweep(300, 900, 0.4, 'square', 0.12)
        }

        const bumpBlock = (c, r) => {
            const t = level.grid[r][c]
            if (t === QUESTION) {
                const isFlower = level.flowerCols && level.flowerCols.includes(c)
                const isShroom = level.shroomCols && level.shroomCols.includes(c)
                level.grid[r][c] = USED
                if (isFlower) spawnPower(c, r, 'flower')
                else if (isShroom) spawnPower(c, r, 'mushroom')
                else {
                    coins++; addScore(200, c * TILE, r * TILE - 8, '200')
                    audioController.playTone(988, 0.06, 'square', 0.12)
                    setTimeout(() => audioController.playTone(1319, 0.12, 'square', 0.12), 70)
                }
            } else if (t === BRICK) {
                if (mario.big) breakBrick(c, r)
                else audioController.playTone(180, 0.05, 'square', 0.1)
            } else {
                audioController.playTone(140, 0.04, 'square', 0.08)
            }
        }

        const grow = () => {
            if (mario.power !== 'small') return
            mario.power = 'big'; mario.big = true; mario.h = 28; mario.y -= 12; mario.invuln = 0
            audioController.playSweep(400, 1000, 0.5, 'square', 0.14)
            addScore(1000, mario.x, mario.y - 10, '')
        }

        const fireUp = () => {
            if (mario.power === 'small') { mario.y -= 12; mario.h = 28; mario.big = true }
            mario.power = 'fire'; mario.invuln = 0
            audioController.playSweep(500, 1200, 0.5, 'square', 0.14)
            addScore(1000, mario.x, mario.y - 10, '')
        }

        const hurt = () => {
            if (mario.invuln > 0) return
            if (mario.power !== 'small') {
                mario.power = 'small'; mario.big = false; mario.h = 16; mario.y += 12; mario.invuln = 90
                audioController.playSweep(600, 200, 0.4, 'sawtooth', 0.16)
            } else {
                die()
            }
        }

        const die = () => {
            if (state === 'dying') return
            state = 'dying'
            transitionTimer = 120
            mario.vy = -7; mario.vx = 0
            audioController.playDeath()
        }

        const levelClear = () => {
            if (state !== 'play') return
            state = 'levelclear'
            transitionTimer = 150
            addScore(Math.floor(timer) * 10, mario.x, mario.y - 10, '')
            audioController.playFanfare()
        }

        const advanceLevel = () => {
            addScore(Math.floor(timer) * 10, mario.x, mario.y - 10, '')
            audioController.playFanfare()
            if (levelIndex < LEVELS.length - 1) loadLevel(levelIndex + 1, true)
            else state = 'win'
        }

        // Iconic flagpole finish: slide down the pole, then walk into the castle.
        const startFlag = () => {
            if (state !== 'play') return
            state = 'flag'; flagPhase = 'slide'; flagT = 0
            audioController.stopMusic()
            mario.vx = 0; mario.vy = 0; mario.facing = -1
            mario.x = level.flagCol * TILE - 2
            mario.y = 5 * TILE  // grab the pole up high so the slide is visible
            audioController.playSweep(660, 1046, 0.5, 'square', 0.16)
        }

        // ---- collision vs grid ----
        const collideX = () => {
            const top = Math.floor(mario.y / TILE)
            const bot = Math.floor((mario.y + mario.h - 1) / TILE)
            if (mario.vx > 0) {
                const c = Math.floor((mario.x + mario.w) / TILE)
                for (let r = top; r <= bot; r++) if (solidAt(c, r)) { mario.x = c * TILE - mario.w; mario.vx = 0; break }
            } else if (mario.vx < 0) {
                const c = Math.floor(mario.x / TILE)
                for (let r = top; r <= bot; r++) if (solidAt(c, r)) { mario.x = (c + 1) * TILE; mario.vx = 0; break }
            }
            if (mario.x < 0) { mario.x = 0; mario.vx = 0 }
        }
        const collideY = () => {
            const left = Math.floor(mario.x / TILE)
            const right = Math.floor((mario.x + mario.w - 1) / TILE)
            if (mario.vy > 0) {
                const r = Math.floor((mario.y + mario.h) / TILE)
                for (let c = left; c <= right; c++) if (solidAt(c, r)) { mario.y = r * TILE - mario.h; mario.vy = 0; mario.onGround = true; break }
            } else if (mario.vy < 0) {
                const r = Math.floor(mario.y / TILE)
                for (let c = left; c <= right; c++) if (solidAt(c, r)) {
                    mario.y = (r + 1) * TILE; mario.vy = 0; bumpBlock(c, r); break
                }
            }
        }

        // ---- enemy tile collision ----
        const enemyCollide = (e) => {
            // gravity
            e.vy = Math.min(e.vy + GRAVITY, MAX_FALL)
            e.y += e.vy
            let r = Math.floor((e.y + e.h) / TILE)
            let cl = Math.floor(e.x / TILE), cr = Math.floor((e.x + e.w - 1) / TILE)
            for (let c = cl; c <= cr; c++) if (solidAt(c, r)) { e.y = r * TILE - e.h; e.vy = 0; break }
            // horizontal
            e.x += e.vx
            const mid = Math.floor((e.y + e.h / 2) / TILE)
            if (e.vx > 0) { const c = Math.floor((e.x + e.w) / TILE); if (solidAt(c, mid)) { e.x = c * TILE - e.w; e.vx *= -1 } }
            else if (e.vx < 0) { const c = Math.floor(e.x / TILE); if (solidAt(c, mid)) { e.x = (c + 1) * TILE; e.vx *= -1 } }
            if (e.x < 0) { e.x = 0; e.vx *= -1 }
        }

        // ---- UPDATE ----
        const update = () => {
            tick++
            if (state === 'attract' || state === 'gameover' || state === 'win') return

            if (state === 'intro') { if (--introTimer <= 0) { state = 'play'; audioController.startMusic(level.bg === 'under' ? 'underground' : 'overworld') } return }

            if (state === 'flag') {
                flagT++
                cameraX = Math.max(0, Math.min(mario.x - VIEW_W * 0.45, level.cols * TILE - VIEW_W))
                const baseY = (13 * TILE) - mario.h
                if (flagPhase === 'slide') {
                    if (mario.y < baseY) mario.y = Math.min(baseY, mario.y + 4)
                    else { flagPhase = 'walk'; flagT = 0; audioController.playTone(880, 0.12, 'square', 0.14) }
                } else {
                    mario.facing = 1; mario.x += 1.8; mario.anim += 2
                    if (flagT > 72 || mario.x > level.castleCol * TILE + 24) advanceLevel()
                }
                return
            }

            if (state === 'dying') {
                mario.vy = Math.min(mario.vy + 0.4, 10)
                mario.y += mario.vy
                transitionTimer--
                if (transitionTimer <= 0) {
                    lives--
                    if (lives > 0) loadLevel(levelIndex, false)
                    else { state = 'gameover'; audioController.stopMusic() }
                }
                return
            }

            if (state === 'levelclear') {
                transitionTimer--
                if (transitionTimer <= 0) {
                    if (levelIndex < LEVELS.length - 1) loadLevel(levelIndex + 1, true)
                    else state = 'win'
                }
                return
            }

            // timer
            timerAcc++
            if (timerAcc >= 24) { timerAcc = 0; timer--; if (timer <= 0) die() }

            // ---- Mario horizontal ----
            const accel = keys.run ? RUN_ACCEL : WALK_ACCEL
            const maxSpd = keys.run ? RUN_MAX : WALK_MAX
            if (keys.left) { mario.vx -= accel; mario.facing = -1 }
            else if (keys.right) { mario.vx += accel; mario.facing = 1 }
            else { mario.vx *= FRICTION; if (Math.abs(mario.vx) < 0.05) mario.vx = 0 }
            mario.vx = Math.max(-maxSpd, Math.min(maxSpd, mario.vx))

            // ---- Jump ----
            if (mario.jumpPressed && mario.onGround) {
                mario.vy = JUMP_VEL - Math.abs(mario.vx) * 0.18
                mario.onGround = false
                audioController.playSweep(300, 700, 0.18, 'square', 0.12)
            }
            mario.jumpPressed = false

            // gravity (variable height)
            const g = (keys.jump && mario.vy < 0) ? GRAVITY_HOLD : GRAVITY
            mario.vy = Math.min(mario.vy + g, MAX_FALL)

            // integrate + collide
            mario.onGround = false
            mario.x += mario.vx; collideX()
            mario.y += mario.vy; collideY()

            // fall in pit
            if (mario.y > VIEW_H + 40) { die(); return }

            // level bounds (left wall)
            if (mario.x < 0) mario.x = 0

            if (Math.abs(mario.vx) > 0.3 && mario.onGround) mario.anim += Math.abs(mario.vx)

            // skid when input opposes motion on the ground
            mario.skid = mario.onGround && Math.abs(mario.vx) > 1.2 &&
                ((keys.left && mario.vx > 0) || (keys.right && mario.vx < 0))
            if (mario.skid && tick % 4 === 0) {
                particles.push({ x: mario.x + mario.w / 2, y: mario.y + mario.h - 3, vx: -mario.facing * 0.6, vy: -0.4, life: 14, color: '#e8d8b0' })
            }

            if (mario.invuln > 0) mario.invuln--

            // ---- Coins ----
            for (const co of coinsArr) {
                if (co.taken) continue
                co.anim += 0.2
                if (overlap(mario, co)) {
                    co.taken = true; coins++; addScore(200, co.x, co.y - 6, '200')
                    audioController.playTone(988, 0.05, 'square', 0.12)
                    setTimeout(() => audioController.playTone(1319, 0.1, 'square', 0.12), 60)
                    if (coins % 100 === 0 && lives < 9) lives++
                }
            }

            // ---- Mushrooms ----
            for (const s of shrooms) {
                if (s.emerging > 0) { s.emerging--; s.y -= 1; continue }
                s.vy = Math.min(s.vy + GRAVITY, MAX_FALL)
                s.y += s.vy
                let r = Math.floor((s.y + s.h) / TILE)
                let cl = Math.floor(s.x / TILE), cr = Math.floor((s.x + s.w - 1) / TILE)
                for (let c = cl; c <= cr; c++) if (solidAt(c, r)) { s.y = r * TILE - s.h; s.vy = 0; break }
                s.x += s.vx
                const mid = Math.floor((s.y + s.h / 2) / TILE)
                if (s.vx > 0) { const c = Math.floor((s.x + s.w) / TILE); if (solidAt(c, mid)) { s.x = c * TILE - s.w; s.vx *= -1 } }
                else { const c = Math.floor(s.x / TILE); if (solidAt(c, mid)) { s.x = (c + 1) * TILE; s.vx *= -1 } }
                if (overlap(mario, s)) { s.taken = true; if (s.kind === 'flower') fireUp(); else grow() }
            }
            shrooms = shrooms.filter(s => !s.taken && s.y < VIEW_H + 40)

            // ---- Fireballs ----
            if (mario.power === 'fire' && firePressed && fireCooldown <= 0 && fireballs.length < 2) {
                fireballs.push({
                    x: mario.x + (mario.facing > 0 ? mario.w : -6), y: mario.y + (mario.big ? 12 : 6),
                    w: 8, h: 8, vx: mario.facing * 4.5, vy: -2, life: 150, anim: 0,
                })
                fireCooldown = 16
                audioController.playSweep(880, 240, 0.18, 'square', 0.14)
            }
            firePressed = false
            if (fireCooldown > 0) fireCooldown--
            for (const f of fireballs) {
                f.anim += 0.5
                f.vy = Math.min(f.vy + 0.4, 6)
                f.x += f.vx
                const midR = Math.floor((f.y + f.h / 2) / TILE)
                if (f.vx > 0) { const c = Math.floor((f.x + f.w) / TILE); if (solidAt(c, midR)) f.dead = true }
                else { const c = Math.floor(f.x / TILE); if (solidAt(c, midR)) f.dead = true }
                f.y += f.vy
                const bot = Math.floor((f.y + f.h) / TILE), topR = Math.floor(f.y / TILE)
                const cl = Math.floor(f.x / TILE), cr = Math.floor((f.x + f.w - 1) / TILE)
                if (f.vy > 0) { for (let c = cl; c <= cr; c++) if (solidAt(c, bot)) { f.y = bot * TILE - f.h; f.vy = -3.6; break } }
                else { for (let c = cl; c <= cr; c++) if (solidAt(c, topR)) { f.y = (topR + 1) * TILE; f.vy = 1; break } }
                if (f.x < cameraX - 24 || f.x > cameraX + VIEW_W + 24 || f.y > VIEW_H + 20) f.dead = true
                if (--f.life <= 0) f.dead = true
                for (const e of enemies) {
                    if (!e.alive || e.flip || e.squash) continue
                    if (overlap(f, e)) { e.flip = true; e.vy = -6; addScore(200, e.x, e.y - 8, '200'); audioController.playNoise(0.1, 0.18); f.dead = true }
                }
            }
            fireballs = fireballs.filter(f => !f.dead)

            // ---- Enemies ----
            for (const e of enemies) {
                if (!e.alive) continue
                if (e.flip) { e.vy -= 0.5; e.y += e.vy; if (e.y > VIEW_H + 30) e.alive = false; continue }
                if (e.squash > 0) { e.squash--; if (e.squash <= 0) e.alive = false; continue }
                // activate only when near camera
                if (e.x > cameraX + VIEW_W + 16) continue
                e.anim++
                enemyCollide(e)
                if (e.y > VIEW_H + 30) { e.alive = false; continue }

                if (overlap(mario, e)) {
                    const marioBottom = mario.y + mario.h
                    const stomping = mario.vy > 0 && marioBottom - e.y < 12
                    const kickDir = (mario.x + mario.w / 2 < e.x + e.w / 2) ? 4 : -4
                    if (e.type === 'goomba') {
                        if (stomping) {
                            e.squash = 24; e.vx = 0
                            mario.vy = keys.jump ? -6.5 : -4.5
                            addScore(100, e.x, e.y - 8, '100')
                            audioController.playTone(220, 0.08, 'square', 0.14)
                        } else hurt()
                    } else if (!e.shell) {
                        // walking koopa -> stomp into a shell
                        if (stomping) {
                            e.shell = true; e.still = true; e.vx = 0; e.h = 14; e.y += 10
                            mario.vy = keys.jump ? -6.5 : -4.5
                            addScore(100, e.x, e.y - 8, '100')
                            audioController.playTone(330, 0.08, 'square', 0.14)
                        } else hurt()
                    } else if (stomping) {
                        // land on a shell -> kick it
                        e.still = false; e.vx = kickDir; e.grace = 14
                        mario.vy = keys.jump ? -6.5 : -4.5
                        addScore(400, e.x, e.y - 8, '400')
                        audioController.playTone(500, 0.08, 'square', 0.14)
                    } else if (!e.still) {
                        // ran into a sliding shell
                        if (!(e.grace > 0)) hurt()
                    } else {
                        // bump a stationary shell -> send it sliding
                        e.still = false; e.vx = kickDir; e.grace = 14
                        addScore(400, e.x, e.y - 8, '400')
                        audioController.playTone(500, 0.08, 'square', 0.14)
                    }
                }
            }
            // moving shells wipe out other enemies
            for (const s of enemies) {
                if (!s.alive || !s.shell || s.still) continue
                if (s.grace > 0) s.grace--
                for (const o of enemies) {
                    if (o === s || !o.alive || o.flip || o.squash || o.shell) continue
                    if (overlap(s, o)) {
                        o.flip = true; o.vy = -6; addScore(200, o.x, o.y - 8, '200')
                        audioController.playNoise(0.1, 0.18)
                    }
                }
            }
            enemies = enemies.filter(e => e.alive)

            // ---- particles / popups ----
            for (const p of particles) { p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.life-- }
            particles = particles.filter(p => p.life > 0)
            for (const p of popups) { p.y -= 0.6; p.life-- }
            popups = popups.filter(p => p.life > 0)

            // ---- Level completion ----
            if (level.flagCol && mario.x + mario.w >= level.flagCol * TILE) {
                startFlag()
                return
            }
            if (level.exitCol && mario.x + mario.w >= level.exitCol * TILE && mario.onGround) {
                levelClear()
            }

            // ---- camera ----
            const target = mario.x - VIEW_W * 0.42
            cameraX = Math.max(0, Math.min(target, level.cols * TILE - VIEW_W))
        }

        // =================================================================
        // DRAWING
        // =================================================================
        const px = (x) => Math.round(x)

        const drawTile = (t, x, y, c, r) => {
            if (t === GROUND) {
                ctx.fillStyle = C.ground; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = C.groundLight; ctx.fillRect(x, y, TILE, 3)
                ctx.fillStyle = C.groundDark
                ctx.fillRect(x, y + 3, 1, TILE - 3); ctx.fillRect(x + 7, y + 6, 1, TILE - 6)
                ctx.fillRect(x + 3, y + 8, 4, 1); ctx.fillRect(x + 11, y + 11, 4, 1)
            } else if (t === BRICK) {
                ctx.fillStyle = C.brick; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = C.brickLine
                ctx.fillRect(x, y + 7, TILE, 1); ctx.fillRect(x, y + 15, TILE, 1)
                ctx.fillRect(x + 7, y, 1, 7); ctx.fillRect(x + 3, y + 8, 1, 7); ctx.fillRect(x + 11, y + 8, 1, 7)
                ctx.fillStyle = C.groundLight; ctx.fillRect(x, y, TILE, 1)
            } else if (t === QUESTION) {
                const bob = Math.sin(tick * 0.15) > 0 ? 0 : 1
                ctx.fillStyle = C.block; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = C.blockDark
                ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y + TILE - 1, TILE, 1)
                ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x + TILE - 1, y, 1, TILE)
                // rivets
                ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 13, y + 2, 1, 1)
                ctx.fillRect(x + 2, y + 13, 1, 1); ctx.fillRect(x + 13, y + 13, 1, 1)
                ctx.fillStyle = C.blockLight
                ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
                ctx.fillText('?', x + 8, y + 12 + bob)
            } else if (t === USED) {
                ctx.fillStyle = C.used; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = C.brickLine
                ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y + TILE - 1, TILE, 1)
                ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x + TILE - 1, y, 1, TILE)
            } else if (t === SOLID) {
                ctx.fillStyle = '#b06020'; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = '#e8a058'; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y, 2, TILE)
                ctx.fillStyle = '#6a2800'; ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x + TILE - 2, y, 2, TILE)
            } else if (t === PIPE) {
                const up = level.grid[r - 1] && level.grid[r - 1][c] === PIPE
                const rightIsPipe = level.grid[r][c + 1] === PIPE
                if (!up) {
                    // pipe top (rim)
                    ctx.fillStyle = C.pipe; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y, TILE + 2, 8)
                    ctx.fillStyle = C.pipeLight; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y, TILE + 2, 2)
                    ctx.fillStyle = C.pipeDark; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y + 6, TILE + 2, 2)
                    ctx.fillStyle = C.pipe; ctx.fillRect(x, y + 8, TILE, TILE - 8)
                    ctx.fillStyle = C.pipeLight; ctx.fillRect(x + 2, y + 8, 3, TILE - 8)
                    ctx.fillStyle = C.pipeDark; ctx.fillRect(x + TILE - 2, y + 8, 2, TILE - 8)
                } else {
                    ctx.fillStyle = C.pipe; ctx.fillRect(x, y, TILE, TILE)
                    ctx.fillStyle = C.pipeLight; ctx.fillRect(x + 2, y, 3, TILE)
                    ctx.fillStyle = C.pipeDark; ctx.fillRect(x + TILE - 2, y, 2, TILE)
                }
            }
        }

        const drawCloud = (x, y) => {
            ctx.fillStyle = C.cloud
            ctx.fillRect(x + 4, y, 24, 8)
            ctx.fillRect(x, y + 6, 36, 8)
            ctx.fillRect(x + 8, y - 4, 12, 8)
            ctx.fillRect(x + 20, y - 2, 10, 8)
        }
        const drawBush = (x, y) => {
            ctx.fillStyle = C.bush
            ctx.fillRect(x + 4, y, 24, 8)
            ctx.fillRect(x, y + 4, 36, 8)
            ctx.fillStyle = '#00d000'
            ctx.fillRect(x + 8, y + 2, 6, 4); ctx.fillRect(x + 20, y + 2, 6, 4)
        }

        const drawHill = (x, big) => {
            const g = 13 * TILE
            ctx.fillStyle = big ? '#00a800' : '#2fbf2f'
            if (big) {
                ctx.fillRect(x, g - 16, 64, 16)
                ctx.fillRect(x + 8, g - 32, 48, 16)
                ctx.fillRect(x + 20, g - 44, 24, 12)
                ctx.fillStyle = '#007000'
                ctx.fillRect(x + 22, g - 26, 4, 4); ctx.fillRect(x + 38, g - 26, 4, 4)
            } else {
                ctx.fillRect(x, g - 12, 32, 12)
                ctx.fillRect(x + 8, g - 22, 16, 10)
                ctx.fillStyle = '#1f9f1f'
                ctx.fillRect(x + 12, g - 18, 3, 3); ctx.fillRect(x + 20, g - 18, 3, 3)
            }
        }

        const drawFlag = (flagY) => {
            const fy = flagY == null ? 4 * TILE : flagY
            const fx = level.flagCol * TILE + 8
            ctx.fillStyle = '#d8d8d8'; ctx.fillRect(fx, 3 * TILE, 2, 10 * TILE)
            ctx.fillStyle = C.white; ctx.fillRect(fx - 2, 3 * TILE - 4, 6, 4)
            // flag
            ctx.fillStyle = C.flag
            ctx.beginPath()
            ctx.moveTo(fx, fy); ctx.lineTo(fx - 16, fy + 5); ctx.lineTo(fx, fy + 10)
            ctx.closePath(); ctx.fill()
        }
        const drawCastle = () => {
            const bx = level.castleCol * TILE, by = 8 * TILE
            ctx.fillStyle = C.castle
            ctx.fillRect(bx, by + 16, 64, 64)
            ctx.fillRect(bx + 8, by, 48, 24)
            ctx.fillRect(bx + 20, by - 16, 24, 20)
            // crenellations
            ctx.fillStyle = C.castle
            for (let i = 0; i < 4; i++) ctx.fillRect(bx + i * 16, by + 10, 8, 8)
            // door
            ctx.fillStyle = C.black; ctx.fillRect(bx + 24, by + 56, 16, 24)
            // windows
            ctx.fillStyle = C.black
            ctx.fillRect(bx + 12, by + 28, 8, 10); ctx.fillRect(bx + 44, by + 28, 8, 10)
            ctx.fillRect(bx + 28, by - 12, 8, 10)
        }

        const drawMario = () => {
            if (mario.invuln > 0 && Math.floor(tick / 3) % 2 === 0) return
            const { x, y, w, big, facing } = mario
            const run = Math.abs(mario.vx) > 0.4 && mario.onGround
            const skid = !!mario.skid
            const frame = skid ? 3 : (run ? Math.floor(mario.anim / 6) % 3 : 0)
            const jumping = !mario.onGround
            ctx.save()
            ctx.translate(px(x + w / 2), px(y))
            ctx.scale(facing, 1)
            ctx.translate(-w / 2, 0)
            const skin = C.marioSkin, shoe = C.marioShoe
            const fire = mario.power === 'fire'
            const red = fire ? C.fireTop : C.marioRed      // hat + shirt (top)
            const blue = fire ? C.marioRed : C.marioBlue    // overalls (bottom)
            if (big) {
                // hat
                ctx.fillStyle = red; ctx.fillRect(2, 0, 11, 4); ctx.fillRect(0, 3, 13, 2)
                // face
                ctx.fillStyle = skin; ctx.fillRect(2, 5, 9, 5)
                ctx.fillStyle = C.black; ctx.fillRect(8, 6, 1, 2) // eye
                ctx.fillStyle = red; ctx.fillRect(0, 6, 2, 3) // sideburn
                // shirt/arms
                ctx.fillStyle = red; ctx.fillRect(1, 10, 12, 8)
                // overalls
                ctx.fillStyle = blue; ctx.fillRect(3, 14, 8, 8); ctx.fillRect(2, 12, 3, 4); ctx.fillRect(9, 12, 3, 4)
                // arms (raise front arm when jumping)
                ctx.fillStyle = skin
                if (jumping) { ctx.fillRect(0, 12, 2, 5); ctx.fillRect(12, 5, 3, 5) }
                else { ctx.fillRect(0, 12, 2, 6); ctx.fillRect(12, 12, 2, 6) }
                // legs
                ctx.fillStyle = blue
                if (jumping) { ctx.fillRect(1, 20, 5, 4); ctx.fillRect(8, 20, 5, 4) }
                else if (frame === 3) { ctx.fillRect(1, 22, 6, 4); ctx.fillRect(9, 20, 4, 4) }
                else if (frame === 1) { ctx.fillRect(2, 22, 5, 4); ctx.fillRect(7, 20, 5, 4) }
                else if (frame === 2) { ctx.fillRect(1, 20, 5, 4); ctx.fillRect(8, 22, 5, 4) }
                else { ctx.fillRect(3, 22, 4, 4); ctx.fillRect(7, 22, 4, 4) }
                // shoes
                ctx.fillStyle = shoe
                if (jumping) { ctx.fillRect(0, 24, 6, 3); ctx.fillRect(8, 24, 6, 3) }
                else if (frame === 3) { ctx.fillRect(0, 25, 7, 3); ctx.fillRect(9, 23, 5, 3) }
                else if (frame === 1) { ctx.fillRect(1, 25, 7, 3); ctx.fillRect(7, 23, 6, 3) }
                else if (frame === 2) { ctx.fillRect(0, 23, 6, 3); ctx.fillRect(8, 25, 7, 3) }
                else { ctx.fillRect(2, 25, 5, 3); ctx.fillRect(7, 25, 5, 3) }
            } else {
                // small mario
                ctx.fillStyle = red; ctx.fillRect(2, 0, 8, 3); ctx.fillRect(0, 2, 11, 2) // hat
                ctx.fillStyle = skin; ctx.fillRect(2, 4, 7, 4) // face
                ctx.fillStyle = C.black; ctx.fillRect(6, 5, 1, 1) // eye
                ctx.fillStyle = red; ctx.fillRect(1, 8, 9, 4) // shirt
                ctx.fillStyle = blue; ctx.fillRect(2, 11, 7, 3) // shorts
                ctx.fillStyle = skin
                if (jumping) { ctx.fillRect(0, 9, 1, 3); ctx.fillRect(10, 6, 2, 3) } // front arm up
                else { ctx.fillRect(0, 9, 1, 3); ctx.fillRect(10, 9, 1, 3) } // arms
                ctx.fillStyle = shoe
                if (jumping) { ctx.fillRect(1, 14, 4, 2); ctx.fillRect(7, 14, 4, 2) }
                else if (frame === 3) { ctx.fillRect(0, 14, 5, 2); ctx.fillRect(8, 13, 4, 2) } // skid
                else if (frame === 1) { ctx.fillRect(0, 14, 5, 2); ctx.fillRect(8, 13, 4, 2) }
                else if (frame === 2) { ctx.fillRect(2, 13, 4, 2); ctx.fillRect(7, 14, 5, 2) }
                else { ctx.fillRect(2, 14, 3, 2); ctx.fillRect(7, 14, 3, 2) }
            }
            ctx.restore()
        }

        const drawGoomba = (e) => {
            const x = px(e.x), y = px(e.y)
            if (e.squash > 0) {
                ctx.fillStyle = C.goomba; ctx.fillRect(x, y + 10, 14, 6)
                return
            }
            const step = Math.floor(e.anim / 8) % 2
            ctx.fillStyle = C.goomba
            ctx.fillRect(x + 1, y, 12, 9)      // head
            ctx.fillRect(x, y + 6, 14, 4)      // body
            // eyes
            ctx.fillStyle = C.white; ctx.fillRect(x + 2, y + 3, 3, 4); ctx.fillRect(x + 9, y + 3, 3, 4)
            ctx.fillStyle = C.black; ctx.fillRect(x + 3, y + 4, 1, 2); ctx.fillRect(x + 10, y + 4, 1, 2)
            // feet
            ctx.fillStyle = C.goombaFoot
            if (step === 0) { ctx.fillRect(x, y + 10, 5, 4); ctx.fillRect(x + 9, y + 10, 5, 4) }
            else { ctx.fillRect(x + 1, y + 10, 5, 4); ctx.fillRect(x + 8, y + 10, 5, 4) }
        }

        const drawKoopa = (e) => {
            const x = px(e.x), y = px(e.y)
            if (e.shell) {
                ctx.fillStyle = C.koopaShell; ctx.fillRect(x + 1, y + 2, 13, 10)
                ctx.fillStyle = C.koopaShellDark; ctx.fillRect(x + 2, y + 2, 11, 2); ctx.fillRect(x + 1, y + 10, 13, 2)
                ctx.fillStyle = C.koopaSkin; ctx.fillRect(x + 3, y + 5, 8, 4)
                ctx.fillStyle = C.koopaShellDark; ctx.fillRect(x + 6, y + 5, 1, 4)
                return
            }
            const step = Math.floor(e.anim / 8) % 2
            const face = e.vx > 0 ? 1 : -1
            ctx.save(); ctx.translate(x + 7, y); ctx.scale(face, 1); ctx.translate(-7, 0)
            // shell
            ctx.fillStyle = C.koopaShell; ctx.fillRect(1, 8, 12, 10)
            ctx.fillStyle = C.koopaShellDark; ctx.fillRect(2, 8, 10, 2)
            ctx.fillStyle = C.koopaSkin; ctx.fillRect(4, 11, 6, 4)
            // head
            ctx.fillStyle = C.koopaSkin; ctx.fillRect(8, 0, 6, 7)
            ctx.fillStyle = C.black; ctx.fillRect(11, 2, 1, 2) // eye
            ctx.fillStyle = C.koopaShellDark; ctx.fillRect(8, 6, 4, 1)
            // feet
            ctx.fillStyle = C.koopaSkin
            if (step === 0) { ctx.fillRect(1, 18, 5, 3); ctx.fillRect(8, 18, 5, 3) }
            else { ctx.fillRect(2, 18, 5, 3); ctx.fillRect(7, 18, 5, 3) }
            ctx.restore()
        }

        const drawShroom = (s) => {
            const x = px(s.x), y = px(s.y)
            ctx.fillStyle = C.shroom; ctx.fillRect(x, y + 3, 12, 6); ctx.fillRect(x + 2, y, 8, 4)
            ctx.fillStyle = C.shroomSpot; ctx.fillRect(x + 1, y + 3, 3, 3); ctx.fillRect(x + 8, y + 3, 3, 3); ctx.fillRect(x + 4, y + 1, 3, 3)
            ctx.fillStyle = C.shroomStem; ctx.fillRect(x + 3, y + 9, 6, 5)
            ctx.fillStyle = C.black; ctx.fillRect(x + 4, y + 10, 1, 2); ctx.fillRect(x + 7, y + 10, 1, 2)
        }

        const drawFlower = (s) => {
            const x = px(s.x), y = px(s.y)
            const open = (tick % 20) < 10
            // stem
            ctx.fillStyle = C.flowerStem; ctx.fillRect(x + 5, y + 7, 2, 7)
            ctx.fillRect(x + 2, y + 10, 3, 2); ctx.fillRect(x + 7, y + 12, 3, 2)
            // petals
            ctx.fillStyle = C.flowerPetal
            ctx.fillRect(x + 2, y + 1, 8, 6)
            ctx.fillRect(x + (open ? 0 : 1), y + 3, 10, 3)
            ctx.fillStyle = C.flowerPetal2
            ctx.fillRect(x + 3, y + 2, 6, 4)
            // center
            ctx.fillStyle = C.flowerCenter; ctx.fillRect(x + 4, y + 3, 4, 3)
        }

        const drawFireball = (f) => {
            const x = px(f.x), y = px(f.y)
            const q = Math.floor(f.anim) % 4
            ctx.fillStyle = C.fireball
            ctx.fillRect(x + 1, y, 6, 8); ctx.fillRect(x, y + 1, 8, 6)
            ctx.fillStyle = C.fireballCore
            if (q < 2) { ctx.fillRect(x + 2, y + 2, 4, 4); ctx.fillRect(x + 3, y + 1, 2, 6) }
            else { ctx.fillRect(x + 2, y + 2, 2, 2); ctx.fillRect(x + 4, y + 4, 2, 2) }
        }

        const drawCoin = (co) => {
            const x = px(co.x), y = px(co.y)
            const f = Math.floor(co.anim) % 4
            const w = [6, 3, 1, 3][f]
            ctx.fillStyle = C.coin; ctx.fillRect(x + (6 - w) / 2, y, w, 8)
            ctx.fillStyle = C.coinDark; ctx.fillRect(x + (6 - w) / 2, y + 2, Math.max(1, w - 1), 4)
        }

        const drawHUD = () => {
            ctx.fillStyle = level.bg === 'under' ? C.white : C.white
            ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
            ctx.fillText('MARIO', 16, 14)
            ctx.fillText(String(score).padStart(6, '0'), 16, 26)
            // coin
            ctx.fillStyle = C.coin; ctx.fillRect(96, 18, 6, 8)
            ctx.fillStyle = level.bg === 'under' ? C.white : C.white
            ctx.fillText('x' + String(coins).padStart(2, '0'), 106, 26)
            ctx.textAlign = 'center'
            ctx.fillText('WORLD', 160, 14)
            ctx.fillText(level.id, 160, 26)
            ctx.textAlign = 'right'
            ctx.fillText('TIME', 240, 14)
            ctx.fillText(String(Math.max(0, timer)).padStart(3, '0'), 240, 26)
            // lives
            ctx.textAlign = 'left'
            ctx.fillStyle = C.marioRed; ctx.fillRect(150, 18, 6, 5)
            ctx.fillStyle = C.marioSkin; ctx.fillRect(151, 23, 4, 3)
            ctx.fillStyle = level.bg === 'under' ? C.white : C.white
            ctx.fillText('x' + lives, 160, 26)
        }

        const centerText = (lines) => {
            ctx.textAlign = 'center'
            let y = VIEW_H / 2 - (lines.length - 1) * 8
            for (const ln of lines) {
                ctx.fillStyle = ln.color || C.white
                ctx.font = ln.font || 'bold 10px monospace'
                ctx.fillText(ln.t, VIEW_W / 2, y)
                y += ln.gap || 16
            }
        }

        const draw = () => {
            const scale = Math.min(viewWidth / VIEW_W, viewHeight / VIEW_H)
            const ox = Math.floor((viewWidth - VIEW_W * scale) / 2)
            const oy = Math.floor((viewHeight - VIEW_H * scale) / 2)

            // Level intro card (authentic black "WORLD x-x" transition)
            if (state === 'intro') {
                ctx.fillStyle = C.black; ctx.fillRect(0, 0, viewWidth, viewHeight)
                ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale)
                ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.clip()
                ctx.textAlign = 'center'
                ctx.fillStyle = C.white; ctx.font = 'bold 16px monospace'
                ctx.fillText('WORLD ' + level.id, VIEW_W * 0.40, VIEW_H / 2 + 6)
                const hx = VIEW_W * 0.60, hy = VIEW_H / 2 - 9
                ctx.fillStyle = C.marioRed; ctx.fillRect(hx, hy, 16, 4); ctx.fillRect(hx + 2, hy + 3, 12, 2)
                ctx.fillStyle = C.marioSkin; ctx.fillRect(hx + 2, hy + 5, 12, 9)
                ctx.fillStyle = C.black; ctx.fillRect(hx + 10, hy + 7, 2, 2)
                ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.font = 'bold 15px monospace'
                ctx.fillText('x ' + lives, hx + 22, hy + 11)
                ctx.restore()
                return
            }

            // sky
            ctx.fillStyle = level.bg === 'under' ? C.skyUnder : C.sky
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            ctx.save()
            ctx.translate(ox, oy)
            ctx.scale(scale, scale)
            ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.clip()

            const cam = Math.floor(cameraX)

            // parallax decor (behind tiles): hills + clouds scroll slower than the ground
            if (level.decor) {
                if (level.decor.hills) level.decor.hills.forEach(([c, big]) => { const sx = c * TILE - cam * 0.6; if (sx > -96 && sx < VIEW_W) drawHill(sx, big) })
                if (level.decor.clouds) level.decor.clouds.forEach((c, i) => { const sx = c * TILE - cam * 0.4; const cy = 16 + (i % 3) * 12; if (sx > -48 && sx < VIEW_W) drawCloud(sx, cy) })
                for (const c of level.decor.bushes) { const sx = c * TILE - cam; if (sx > -40 && sx < VIEW_W) drawBush(sx, 12 * TILE) }
            }
            if (level.flagCol) {
                let flagY = 4 * TILE
                if (state === 'flag') {
                    const baseY = (13 * TILE) - mario.h
                    const p = flagPhase === 'slide' ? Math.max(0, Math.min(1, (mario.y - 4 * TILE) / (baseY - 4 * TILE))) : 1
                    flagY = 4 * TILE + p * ((12 * TILE) - 4 * TILE)
                }
                const sx = level.flagCol * TILE - cam
                if (sx > -20 && sx < VIEW_W + 40) { ctx.save(); ctx.translate(-cam, 0); drawFlag(flagY); ctx.restore() }
            }
            if (level.castleCol) { const sx = level.castleCol * TILE - cam; if (sx > -80 && sx < VIEW_W + 40) { ctx.save(); ctx.translate(-cam, 0); drawCastle(); ctx.restore() } }

            // tiles
            const c0 = Math.floor(cam / TILE)
            const c1 = Math.min(level.cols - 1, c0 + Math.ceil(VIEW_W / TILE) + 1)
            for (let c = c0; c <= c1; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const t = level.grid[r][c]
                    if (t !== EMPTY) drawTile(t, c * TILE - cam, r * TILE, c, r)
                }
            }

            // entities
            for (const co of coinsArr) if (!co.taken) drawCoin({ x: co.x - cam, y: co.y, anim: co.anim })
            for (const s of shrooms) { if (s.kind === 'flower') drawFlower({ x: s.x - cam, y: s.y }); else drawShroom({ x: s.x - cam, y: s.y }) }
            for (const f of fireballs) drawFireball({ x: f.x - cam, y: f.y, anim: f.anim })
            for (const e of enemies) {
                const sx = e.x - cam
                if (sx < -20 || sx > VIEW_W + 20) continue
                if (e.flip) { ctx.save(); ctx.translate(0, 0); ctx.scale(1, -1); drawKoopaOrGoomba(e, sx, -(e.y + e.h)); ctx.restore() }
                else if (e.type === 'goomba') drawGoomba({ ...e, x: sx })
                else drawKoopa({ ...e, x: sx })
            }
            for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(px(p.x - cam), px(p.y), 4, 4) }

            if (state !== 'gameover') drawMarioAt(mario, cam)

            // popups
            ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
            for (const p of popups) { ctx.fillStyle = C.white; ctx.fillText(p.text, px(p.x - cam), px(p.y)) }

            // HUD
            if (state === 'play' || state === 'levelclear' || state === 'dying' || state === 'flag') drawHUD()

            // overlays
            if (state === 'attract') {
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                centerText([
                    { t: 'SUPER MARIO BROS', color: C.marioRed, font: 'bold 20px monospace', gap: 26 },
                    { t: 'WORLD 1-1 & 1-2', color: C.white, font: 'bold 10px monospace', gap: 22 },
                    { t: 'PRESS ANY KEY TO START', color: (tick % 60 < 36) ? C.coin : C.white, font: 'bold 9px monospace' },
                ])
            } else if (state === 'gameover') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                centerText([
                    { t: 'GAME OVER', color: C.marioRed, font: 'bold 18px monospace', gap: 24 },
                    { t: 'SCORE ' + String(score).padStart(6, '0'), color: C.white, font: 'bold 10px monospace', gap: 22 },
                    { t: 'PRESS ANY KEY', color: (tick % 60 < 36) ? C.coin : C.white, font: 'bold 9px monospace' },
                ])
            } else if (state === 'win') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                centerText([
                    { t: 'THANK YOU MARIO!', color: C.coin, font: 'bold 16px monospace', gap: 22 },
                    { t: 'WORLDS 1-1 & 1-2 CLEARED', color: C.white, font: 'bold 10px monospace', gap: 22 },
                    { t: 'SCORE ' + String(score).padStart(6, '0'), color: C.white, font: 'bold 10px monospace', gap: 22 },
                    { t: 'PRESS ANY KEY', color: (tick % 60 < 36) ? C.coin : C.white, font: 'bold 9px monospace' },
                ])
            } else if (state === 'levelclear') {
                centerText([
                    { t: 'WORLD ' + level.id + ' CLEAR!', color: C.coin, font: 'bold 14px monospace' },
                ])
            } else if (state === 'dying') {
                centerText([{ t: 'OUCH!', color: C.marioRed, font: 'bold 14px monospace' }])
            }

            ctx.restore()
        }

        const drawMarioAt = (m, cam) => {
            const saved = m.x
            m.x = m.x - cam
            drawMario()
            m.x = saved
        }
        const drawKoopaOrGoomba = (e, sx, sy) => {
            if (e.type === 'goomba') drawGoomba({ ...e, x: sx, y: sy })
            else drawKoopa({ ...e, x: sx, y: sy })
        }

        // ---- loop ----
        let lastTime = 0, accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (ts) => {
            if (!lastTime) lastTime = ts
            const frame = Math.min(ts - lastTime, 100)
            lastTime = ts
            if (!pausedRef.current) {
                accumulator += frame
                while (accumulator >= FIXED_DT) { update(); accumulator -= FIXED_DT }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }

        // init
        mario = spawnMario('small')
        loadLevel(0)
        state = 'attract'
        animationFrameId = requestAnimationFrame(loop)

        // DEV-only visual-test hook (never present in production builds)
        if (import.meta.env.DEV) {
            window.__marioTest = {
                getState: () => ({ state, power: mario && mario.power, score, coins, lives, level: level.id, col: Math.round((mario ? mario.x : 0) / TILE) }),
                start: () => { if (state === 'attract' || state === 'gameover' || state === 'win') resetGame() },
                teleport: (col) => { if (!mario) return; mario.x = col * TILE; cameraX = Math.max(0, Math.min(mario.x - VIEW_W * 0.42, level.cols * TILE - VIEW_W)) },
                setPower: (p) => {
                    if (!mario) return
                    if (p === 'small') { if (mario.power !== 'small') mario.y += 12; mario.power = 'small'; mario.big = false; mario.h = 16 }
                    else if (p === 'big') { if (mario.power === 'small') mario.y -= 12; mario.power = 'big'; mario.big = true; mario.h = 28 }
                    else if (p === 'fire') { if (mario.power === 'small') mario.y -= 12; mario.power = 'fire'; mario.big = true; mario.h = 28 }
                },
                throwFire: () => { firePressed = true },
                startFlag: () => { if (state === 'intro') { state = 'play' } startFlag() },
                clearLevel: () => levelClear(),
                musicState: () => audioController._musicState(),
                musicPeak: () => audioController._peak(),
            }
        }

        return () => {
            audioController.stopMusic()
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[760px] aspect-[16/15] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-[#5c94fc]">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SUPER MARIO BROS')} onResume={handleResume} />}
            </div>
            <VirtualControls secondAction={{ code: 'KeyF', label: 'F' }} />
        </div>
    )
}

export default SuperMarioGame

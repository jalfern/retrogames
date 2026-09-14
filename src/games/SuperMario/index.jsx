import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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

const MENU = [
    { label: 'PLAY  ·  LATEST VERSION', hint: 'the current, polished build' },
    { label: 'PLAY  ·  ORIGINAL ONE-SHOT', hint: 'pristine first-pass from local Qwen 3.8' },
    { label: 'WATCH  ·  CPU AUTOPLAY', hint: 'the machine plays it perfectly (normal speed)' },
    { label: 'WATCH  ·  CPU LEARNS', hint: 'neural AI improves each generation' },
]

// Tile ids
const EMPTY = 0
const GROUND = 1
const BRICK = 2
const QUESTION = 3
const SOLID = 4
const USED = 5
const PIPE = 6
const SOLID_SET = new Set([GROUND, BRICK, QUESTION, SOLID, USED, PIPE])

// Piranha plant sprite / hitbox. The hitbox is only the part that has actually
// emerged (h shrinks to 0 when it is fully retracted), which is what makes
// standing on a pipe lip safe exactly when it should be.
const PLANT_W = 12
const PLANT_H = 26
// rise / glare / sink / hidden, in fixed-step frames (~3.2s full cycle)
const PLANT_RISE = 22, PLANT_OUT = 72, PLANT_SINK = 22, PLANT_GONE = 64

// Palette (NES-ish)
const C = {
    sky: '#5c94fc',
    skyUnder: '#050a28',
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
    plant: '#00a800',
    plantDark: '#006000',
    plantLight: '#58d854',
    plantJaw: '#f8b888',
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
    id: '1-1', cols: 212, bg: 'sky', flagCol: 174, castleCol: 180, warpCol: 57, downCol: 140,
    flowerCols: [16], shroomCols: [21, 22],
    // Piranha plants ride the pipes. Deliberately NOT on the warp pipe (57) or the
    // underground pipe (140) - both must stay enterable - nor on 28/38/118, so the
    // run-in stays forgiving and the pressure lands on the late pipe corridor.
    plants: [{ c: 46, delay: 0 }, { c: 101, delay: 40 }, { c: 129, delay: 95 }],
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
        a.pipe(118, 2); a.pipe(129, 3); a.pipe(140, 3)
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
    id: '1-2', cols: 176, bg: 'under', exitCol: 168, detour: true,
    shroomCols: [18, 104], flowerCols: [66],
    plants: [{ c: 35, delay: 20 }, { c: 128, delay: 70 }],   // exit pipe 168 stays clear
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
    decor: { clouds: [], bushes: [], torches: [6, 14, 24, 34, 46, 56, 68, 78, 92, 104, 116, 128, 140, 152, 162] },
})

// Hidden coin bonus room (entered via the gold warp pipe in 1-1)
const BONUS = buildLevel({
    id: 'BONUS', cols: 28, bg: 'under', bonus: true, exitCol: 24,
    build(a) {
        a.ground(0, 27)
        a.row(0, 27, 2, BRICK)          // ceiling
        a.wall(0, 3, 12)                // left wall
        a.wall(27, 3, 12)               // right wall
        // rows of ? blocks that pay coins when punched
        for (let c = 4; c <= 18; c += 2) a.set(c, 6, QUESTION)
        for (let c = 6; c <= 16; c += 2) a.set(c, 9, QUESTION)
        a.pipe(24, 2)                   // exit pipe
    },
    coinArcs: [
        { c: 5, r: 4 }, { c: 7, r: 4 }, { c: 9, r: 4 }, { c: 11, r: 4 }, { c: 13, r: 4 }, { c: 15, r: 4 },
        { c: 20, r: 11 }, { c: 21, r: 11 },
    ],
    enemies: [],
    decor: { torches: [3, 10, 17, 22] },
})

// Linear progression is just 1-1; LEVEL_2 (underground) and BONUS are
// pipe-reached detour rooms that warp you back into 1-1.
const LEVELS = [LEVEL_1]

const SuperMarioGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const navigate = useNavigate()
    const navigateRef = useRef(navigate)
    navigateRef.current = navigate
    const apiRef = useRef(null)
    const [ui, setUi] = React.useState({ screen: 'attract', sel: 0 })

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
        let state = 'attract' // attract | menu | play | dying | levelclear | gameover | win | intro | flag | warp
        let menuSel = 0       // highlighted options-menu row
        let mode = 'play'     // play | autopilot | evolve
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
        let warpT = 0
        let warpDir = 'in'   // 'in' descending into pipe | 'out' returning
        let warpDest = null        // room to load after descending
        let warpReturnDef = null   // room to return to after the detour
        let warpReturnCol = 0

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

        const loadRoom = (def, keepPower, startX, opts) => {
            opts = opts || {}
            if (opts.setIndex !== undefined) levelIndex = opts.setIndex
            level = def
            const power = keepPower && mario ? mario.power : 'small'
            mario = spawnMario(power)
            if (startX !== undefined) mario.x = startX
            cameraX = 0
            timer = 400; timerAcc = 0
            enemies = (def.enemies || []).map(e => ({
                type: e.type,
                x: e.c * TILE, y: (13 * TILE) - (e.type === 'koopa' ? 24 : 16),
                w: 14, h: e.type === 'koopa' ? 24 : 16,
                vx: -0.6, vy: 0, alive: true, shell: false, still: false, anim: 0, squash: 0, flip: false, grace: 0,
            }))
            // Piranha plants live in pipes: find the pipe top under each spawn column
            // rather than hard-coding a height, so moving a pipe cannot desync them.
            const pipeTopRow = (c) => {
                for (let r = 0; r < 13; r++) if (def.grid[r] && def.grid[r][c] === PIPE) return r
                return 13
            }
            for (const p of def.plants || []) {
                const top = pipeTopRow(p.c) * TILE
                enemies.push({
                    // centre the 12px plant in the 16px pipe mouth (was `TILE - PLANT_W/2`,
                    // which hung it 6px off the pipe's right shoulder)
                    type: 'plant', x: p.c * TILE + (TILE - PLANT_W) / 2, y: top, w: PLANT_W, h: 0,
                    vx: 0, vy: 0, alive: true, anim: 0, squash: 0, flip: false, grace: 0,
                    pipeTop: top, pipeCol: p.c, delay: p.delay || 0, t: 0, out: 0,
                })
            }
            coinsArr = (def.coinArcs || []).map(cc => ({
                x: cc.c * TILE + 4, y: cc.r * TILE + 4, w: 8, h: 8, taken: false, anim: Math.random() * 6,
            }))
            shrooms = []
            fireballs = []
            particles = []
            popups = []
            fireCooldown = 0
            state = opts.state || 'intro'
            introTimer = 110
        }

        const loadLevel = (idx, keepPower) => loadRoom(LEVELS[idx], keepPower, undefined, { setIndex: idx })

        // ---- warp pipes <-> detour rooms (bonus room, underground) ----
        const warpDown = (dest, returnDef, returnCol) => {
            state = 'warp'; warpDir = 'in'; warpT = 0
            mario.vx = 0
            warpDest = dest; warpReturnDef = returnDef; warpReturnCol = returnCol
            audioController.stopMusic()
            audioController.playSweep(600, 120, 0.5, 'square', 0.16)  // descend
        }
        const warpUp = () => {
            const idx = LEVELS.indexOf(warpReturnDef)
            loadRoom(warpReturnDef, true, warpReturnCol * TILE, { state: 'warp', setIndex: idx >= 0 ? idx : levelIndex })
            mario.y = VIEW_H + 20
            warpDir = 'out'; warpT = 0
            audioController.stopMusic()
            audioController.playSweep(120, 600, 0.5, 'square', 0.16)  // rise
        }
        const enterBonus = () => warpDown(BONUS, LEVEL_1, (level.warpCol + 3))
        const enterUnder = () => warpDown(LEVEL_2, LEVEL_1, 158)
        const completeLevel = () => {
            if (level.bonus || level.detour) warpUp()
            else levelClear()
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
        // ---- options menu ----
        const startPlay = (m) => { mode = m; audioController.init(); resetGame() }
        const startAutopilot = () => { apHold = 0; mode = 'autopilot'; audioController.init(); resetGame() }
        const chooseOption = (i) => {
            menuSel = i
            if (i === 0) startPlay('play')
            else if (i === 1) navigateRef.current('/mario-classic')
            else if (i === 2) startAutopilot()
            else if (i === 3) startEvolve()
        }

        const handleKeyDown = (e) => {
            const c = e.code
            // Options menu navigation
            if (state === 'menu') {
                if (c === 'Digit1' || c === 'Numpad1') { chooseOption(0); return }
                if (c === 'Digit2' || c === 'Numpad2') { chooseOption(1); return }
                if (c === 'Digit3' || c === 'Numpad3') { chooseOption(2); return }
                if (c === 'Digit4' || c === 'Numpad4') { chooseOption(3); return }
                if (c === 'ArrowUp') { menuSel = (menuSel + MENU.length - 1) % MENU.length; return }
                if (c === 'ArrowDown') { menuSel = (menuSel + 1) % MENU.length; return }
                if (c === 'Space' || c === 'Enter' || c === 'KeyZ') { chooseOption(menuSel); return }
                if (c === 'Escape' || c === 'Backspace') { state = 'attract'; return }
                return
            }
            // '?' at the title opens the Options menu; in-game it pauses.
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                if (state === 'attract') { state = 'menu'; audioController.init(); return }
                const s = !pausedRef.current
                pausedRef.current = s; setPaused(s)
                return
            }
            if (pausedRef.current) return

            if (state === 'attract' || state === 'gameover' || state === 'win') {
                // don't let a lone modifier (e.g. Shift on the way to '?') start the game
                if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(c)) return
                mode = 'play'; apHold = 0
                resetGame()
                audioController.init()
                e.preventDefault()
                return
            }

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

        const spark = (x, y, colors, n, spread) => {
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 * i) / n + Math.random() * 0.6
                const s = (spread || 2) + Math.random() * 1.6
                particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 18 + Math.random() * 12, max: 30, color: colors[i % colors.length], spark: true, g: 0.12 })
            }
        }

        // ---- autopilot: rule-based perfect-ish runner (drives `keys`) ----
        const groundAt = (c) => solidAt(c, 13) || solidAt(c, 14)
        let apHold = 0
        const autopilot = () => {
            const m = mario
            keys.left = false; keys.right = true; keys.run = true; keys.down = false
            const frontCol = Math.floor((m.x + m.w + 1) / TILE)
            const feetRow = Math.floor((m.y + m.h) / TILE)
            let wantJump = false
            let jumpHold = 16   // frames of held jump; short taps land sooner

            // pits / gaps: jump at the edge
            if (m.onGround && !groundAt(frontCol + 1)) wantJump = true
            // pipes / walls directly ahead
            if (solidAt(frontCol + 1, feetRow - 1) || solidAt(frontCol + 1, feetRow - 2)) wantJump = true

            // Piranha plants: do NOT stall. Standing still in 1-1 is a death sentence -
            // a goomba bounces off an upstream pipe and walks into a parked Mario.
            //
            // The commit distance is solved from the jump arc rather than tuned per Mario
            // size, because a fixed 46px worked while small and jammed Fire Mario face-first
            // into the pipe wall (his front hit the lip at feet=158, 14px below it, and he
            // spent the rest of the rise scraping the pipe straight into the plant). Solve
            // "how long to climb above the plant's head" with the real constants -
            // v0 = JUMP_VEL + |vx|*0.18, gravity GRAVITY_HOLD while rising - then take off
            // that many frames early. Taller pipes need a longer run-up, which no single
            // constant could cover: the 4-tile pipes need ~12 frames, the 2-tile ones ~8.
            // Burn it when we can, but note a fireball bounces ~1 tile (vy=-3.6, g=0.4) and
            // dies on the pipe wall, so a plant on a tall pipe is physically NOT burnable
            // from the ground - the jump is the only answer there.
            let plant = null
            let plantNear = false
            for (const e of enemies) {
                if (!e.alive || e.type !== 'plant' || e.flip) continue
                const dx = (e.x + e.w / 2) - (m.x + m.w / 2)
                if (dx > -12 && dx < 160 && (!plant || dx < plant.dx)) plant = { dx, e }
            }
            if (plant) {
                const e = plant.e
                if (m.power === 'fire' && plant.dx > 20 && plant.dx < 220) firePressed = true
                const near = e.pipeCol * TILE
                const head = e.pipeTop - PLANT_H * 0.9          // assume it is nearly up
                // rise needed to get the FEET 10px ABOVE that head. Note the sign: writing
                // `- 8` here asks the arc to stop 8px below the head, which clipped a plant
                // by 2px at col 101 while still clearing the shorter ones by luck.
                const climb = Math.max(18, (m.y + m.h) - head + 10)
                const v0 = 7.7 + Math.abs(m.vx) * 0.18
                const disc = v0 * v0 - 2 * 0.27 * climb
                const frames = disc > 0 ? (v0 - Math.sqrt(disc)) / 0.27 : 26
                const lead = frames * Math.max(2.2, Math.abs(m.vx)) + 2
                const dist = near - (m.x + m.w)
                if (dist < 150) plantNear = true
                // NOTE: walking the last stretch instead of running was tried and reverted.
                // It does fix col 46 (the 97px climb eats ~32px of runway at walk speed vs
                // ~54px at run speed, giving +10px clearance) but slowing every approach
                // re-times the entire level and Mario then dies at col 94 in both passes.
                // Height-per-pixel is the right lever; applying it globally is not.
                if (dist > 4 && dist < lead && m.onGround) { wantJump = true; jumpHold = 16 }
            }

            // Back up into a released power-up. Bumping a ? block while running right at
            // ~3.3px/frame means outrunning the thing you just released: the flower spends
            // ~30 frames emerging and then crawls right at 0.8, so it was still at col 18
            // on the ground when Mario reached col 26. Stopping is not enough either - a
            // goomba sits at col 18. Walking LEFT closes on the flower (it drifts right at
            // 0.8) AND retreats from the goomba (it only walks at 0.6), so it is strictly
            // safer than standing still. Never do this with a pit ahead.
            let backing = false
            const pitAhead = !groundAt(frontCol + 1) || !groundAt(frontCol + 2) || !groundAt(frontCol + 3)
            if (!pitAhead) {
                for (const s of shrooms) {
                    if (s.taken) continue
                    const dx = (s.x + s.w / 2) - (m.x + m.w / 2)
                    if (dx > -72 && dx < 26) { backing = true; keys.right = false; if (dx < -4) keys.left = true; break }
                }
            }
            if (backing) keys.run = false

            if (m.power !== 'fire') {
                // seek power-ups: bump the ? block DIRECTLY OVERHEAD. Not the one a tile
                // ahead - measured, the old `frontCol + 1` rule jumped at x=227, and the
                // head crossed the block's row at x=244 while the block's column starts at
                // x=256. Twelve pixels short, every single run, so the autopilot was never
                // Fire Mario and the "burn enemies" branch below never once executed.
                const q0 = Math.floor(m.x / TILE)
                const q1 = Math.floor((m.x + m.w - 1) / TILE)
                for (let c = q0; c <= q1; c++) {
                    if (level.grid[9] && level.grid[9][c] === QUESTION && m.onGround) { wantJump = true; break }
                }
                // grab a nearby power-up sitting above us
                for (const s of shrooms) {
                    if (s.taken) continue
                    const dx = s.x - m.x, dy = (s.y + s.h) - (m.y + m.h)
                    if (dx > -12 && dx < 40 && dy < -6 && m.onGround) { wantJump = true; break }
                }
                // hop over enemies while still small (best effort). Two constraints that
                // the original `dx > 4 && dx < 64` lacked, and together they are the whole
                // reason the autopilot was never Fire Mario: the col-18 goomba (x=288)
                // satisfied dx < 64 as soon as Mario hit x=224, so he took off four tiles
                // early and sailed over the ? block at col 16 (x 256..272) at the top of a
                // jump he never needed to take yet.
                //   - skip enemies that have not woken up: a goomba offscreen right is
                //     frozen, so there is no reason to burn a jump on it yet
                //   - 44px, not 64: still a comfortable stomp, but it now fires at x~249,
                //     which is exactly where the ? block rule wants to be
                for (const e of enemies) {
                    if (!e.alive || e.flip) continue
                    if (e.x > cameraX + VIEW_W) continue
                    const dx = e.x - m.x
                    if (dx > 4 && dx < 44 && Math.abs((e.y + e.h) - (m.y + m.h)) < 20 && m.onGround) {
                        wantJump = true
                        // A full hop travels ~110px. Hopping the goomba at col 41 that way
                        // landed Mario at x=687 when the col-46 plant pipe needs its take-off
                        // by x=672 - the hop ate the runway for the pipe jump, and big Mario's
                        // torso then clipped the plant 15px into the arc. A 4-frame TAP keeps
                        // the hop low so the landing moves upstream and the pipe keeps its
                        // run-up. (Taking the hop earlier instead was worse: dx<58 made him
                        // land on top of the goomba and die at col 45.)
                        if (plantNear) jumpHold = 1
                        break
                    }
                }
            } else {
                // Fire Mario: burn enemies ahead so nothing can touch us
                for (const e of enemies) {
                    if (!e.alive || e.flip) continue
                    const dx = e.x - m.x
                    if (dx > 22 && dx < 220 && Math.abs((e.y + e.h) - (m.y + m.h)) < 26) { firePressed = true; break }
                    if (dx > 0 && dx < 28 && m.onGround && Math.abs((e.y + e.h) - (m.y + m.h)) < 20) { wantJump = true }
                }
            }

            if (wantJump && m.onGround && apHold <= 0) { m.jumpPressed = true; keys.jump = true; apHold = jumpHold }
            else if (apHold > 0) { keys.jump = true; apHold-- }
            else keys.jump = false
        }

        // ---- neuroevolution (option 4): recurrent MLP controller + GA + turbo showcase ----
        const NI = 24, NH = 10, NO = 5           // inputs, recurrent hidden, outputs [left,right,run,jump,fire]
        const WLEN = NI * NH + NH * NH + NH + NH * NO + NO
        const POP = 24
        const EP_CAP = 1500
        const TURBO = 12                          // headless steps/frame while training (fast montage)
        const SHOWCASE_FROM_GEN = 6               // warm up headlessly, then slow down to show records
        const EVO_KEY = 'mario-evo-v3'
        let pop = [], fitArr = new Array(POP).fill(0)
        let genome = null, gen = 1, epIndex = 0, maxCol = 0, epSteps = 0, evoJumpHold = 0
        let bestEverFit = 0, bestEverWeights = null, bestCol = 0, evoBanner = 0, lastBestAtGen = 0
        let evoBonus = 0, evoH = new Float64Array(NH), evoShowcase = false, evoMuted = false
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
        const randWeights = () => { const w = new Float64Array(WLEN); for (let i = 0; i < WLEN; i++) w[i] = (Math.random() * 2 - 1) * 0.6; return w }
        const crossover = (a, b) => { const c = new Float64Array(WLEN); for (let i = 0; i < WLEN; i++) c[i] = Math.random() < 0.5 ? a[i] : b[i]; return c }
        const mutate = (w, sigma) => { for (let i = 0; i < WLEN; i++) if (Math.random() < 0.15) w[i] += (Math.random() * 2 - 1) * sigma; return w }
        const evoSigma = (g) => clamp(0.7 * Math.pow(0.985, g), 0.12, 0.7)
        const evoFitness = (won) => {
            let f = maxCol + coins * 10 + evoBonus + (won ? 6000 : 0)
            if (maxCol >= 145) f += 250        // past the col-140 pipe gauntlet
            if (maxCol >= 160) f += 500        // reached the staircase
            if (maxCol >= 170) f += 1000       // at the flag
            return f
        }
        const forwardNN = (w, inp, prevH) => {
            const bi = NI * NH, bh = bi + NH * NH, bo = bh + NH, ob = bo + NH * NO
            const hid = new Float64Array(NH)
            for (let k = 0; k < NH; k++) {
                let s = w[bh + k]
                for (let i = 0; i < NI; i++) s += w[k * NI + i] * inp[i]
                for (let j = 0; j < NH; j++) s += w[bi + k * NH + j] * prevH[j]
                hid[k] = Math.tanh(s)
            }
            const out = new Float64Array(NO)
            for (let o = 0; o < NO; o++) {
                let s = w[ob + o]
                for (let k = 0; k < NH; k++) s += w[bo + o * NH + k] * hid[k]
                out[o] = Math.tanh(s)
            }
            return { out, hid }
        }
        const evoSense = () => {
            const m = mario, inA = new Float64Array(NI)
            const fc = Math.floor((m.x + m.w) / TILE), fr = Math.floor((m.y + m.h) / TILE)
            const flagX = (level.flagCol || level.cols) * TILE
            inA[0] = m.onGround ? 1 : 0
            inA[1] = clamp(m.vy / MAX_FALL, -1, 1)
            inA[2] = clamp(m.vx / RUN_MAX, -1, 1)
            inA[3] = m.power === 'fire' ? 1 : m.power === 'big' ? 0.5 : 0
            inA[4] = groundAt(fc + 2) ? 1 : 0
            inA[5] = groundAt(fc + 4) ? 1 : 0
            inA[6] = groundAt(fc + 6) ? 1 : 0
            inA[7] = groundAt(fc + 8) ? 1 : 0
            let pit = 0; for (let d = 2; d <= 6; d++) if (!groundAt(fc + d)) { pit = 1; break }
            inA[8] = pit
            inA[9] = (solidAt(fc + 1, fr - 1) || solidAt(fc + 1, fr - 2)) ? 1 : 0
            inA[10] = (solidAt(fc + 2, fr - 1) || solidAt(fc + 2, fr - 2)) ? 1 : 0
            inA[11] = (solidAt(fc + 4, fr - 1) || solidAt(fc + 4, fr - 2)) ? 1 : 0
            let wh = 0; for (let r = fr - 1; r >= fr - 5 && solidAt(fc + 1, r); r--) wh++
            inA[12] = clamp(wh / 4, 0, 1)
            let ex = 1e9, ey = 0, evx = 0, ef = 0, above = 0
            for (const e of enemies) {
                if (!e.alive || e.flip) continue
                const dx = e.x - m.x
                if (dx > -10 && dx < ex) { ex = dx; ey = (e.y + e.h) - (m.y + m.h); evx = e.vx; ef = 1 }
                if (Math.abs(dx) < 12 && (e.y + e.h) <= m.y + 4) above = 1
            }
            inA[13] = ef
            inA[14] = ef ? clamp(1 - ex / 200, 0, 1) : 0
            inA[15] = ef ? clamp(ey / 80, -1, 1) : 0
            inA[16] = ef ? (evx < 0 ? 1 : -1) : 0
            inA[17] = above
            let cd = 1e9
            for (const cc of coinsArr) { if (cc.taken) continue; const dx = cc.x - m.x; if (dx > 0 && dx < cd) cd = dx }
            for (const s of shrooms) { if (s.taken) continue; const dx = s.x - m.x; if (dx > 0 && dx < cd) cd = dx }
            inA[18] = cd < 1e9 ? clamp(1 - cd / 200, 0, 1) : 0
            inA[19] = clamp(m.x / flagX, 0, 1)
            inA[20] = (ef && ex > 0 && ex < 44 && ey > -20 && ey < 24) ? 1 : 0
            // piranha plants. Three signals, because the useful one is a *window*, not a
            // distance: a running jump has to peak over the plant's head, so "a plant
            // exists somewhere within 10 tiles" is nearly useless to a net (it fires far
            // too early and the agent bounces into the pipe). LEAP peaks at the range
            // where the autopilot commits, which is hand-buildable AND evolvable.
            let pdx = 1e9, pout = 0
            for (const e of enemies) {
                if (!e.alive || e.type !== 'plant' || e.flip) continue
                const dx = e.x - m.x
                if (dx > -14 && dx < pdx) { pdx = dx; pout = e.out }
            }
            inA[21] = pdx < 1e9 ? clamp(1 - pdx / 160, 0, 1) : 0                       // presence
            inA[22] = pout                                                              // how far out of its pipe
            inA[23] = pdx < 1e9 ? Math.max(0, 1 - Math.abs(pdx - 44) / 40) : 0          // LEAP NOW (~2.75 tiles)
            return inA
        }
        const evolveDrive = () => {
            const m = mario
            const inp = evoSense()
            const r = forwardNN(genome, inp, evoH)
            evoH = r.hid
            const out = r.out
            keys.left = out[0] > 0.3
            keys.right = out[1] > 0.3 || !keys.left
            keys.run = out[2] > 0
            keys.down = false
            if (out[3] > 0 && m.onGround) {
                m.jumpPressed = true; keys.jump = true; evoJumpHold = 12
                // discourage pointless jumping (air-locking): only free to jump near a pit/wall/enemy/plant
                if (inp[8] === 0 && inp[9] === 0 && inp[20] === 0 && inp[17] === 0 && inp[22] < 0.3 && inp[23] === 0) evoBonus -= 0.3
            }
            else if (evoJumpHold > 0) { keys.jump = true; evoJumpHold-- }
            else keys.jump = false
            if (out[4] > 0 && m.power === 'fire') firePressed = true
            maxCol = Math.max(maxCol, Math.round(m.x / TILE))
            epSteps++
        }
        const startEpisode = (i) => {
            genome = pop[i]; maxCol = 0; epSteps = 0; evoJumpHold = 0; evoBonus = 0
            evoH = new Float64Array(NH); evoShowcase = false
            resetGame(); state = 'play'
        }
        const tournament = () => {
            let best = Math.floor(Math.random() * POP)
            for (let k = 0; k < 2; k++) { const c = Math.floor(Math.random() * POP); if (fitArr[c] > fitArr[best]) best = c }
            return best
        }
        const saveEvo = () => { try { localStorage.setItem(EVO_KEY, JSON.stringify({ gen, best: Array.from(bestEverWeights || pop[0]), fit: bestEverFit, col: bestCol })) } catch { /* ignore */ } }
        const evolveGen = () => {
            const order = [...Array(POP).keys()].sort((a, b) => fitArr[b] - fitArr[a])
            const next = [pop[order[0]].slice(), pop[order[1]].slice(), pop[order[2]].slice()]
            const stagn = gen - lastBestAtGen
            const sig = clamp(evoSigma(gen) + (stagn > 6 ? 0.3 : 0), 0.12, 0.9)
            const immigrants = stagn > 10 ? 4 : 0
            for (let k = 0; k < immigrants; k++) next.push(randWeights())
            while (next.length < POP) next.push(mutate(crossover(pop[tournament()], pop[tournament()]), sig))
            pop = next; gen++; epIndex = 0; evoBanner = 100
        }
        const endEpisode = () => {
            const won = state === 'win'
            const fit = evoFitness(won)
            fitArr[epIndex] = fit
            if (maxCol > bestCol) bestCol = maxCol
            const record = fit > bestEverFit
            if (record) { bestEverFit = fit; bestEverWeights = Array.from(genome); evoBanner = 120; lastBestAtGen = gen }
            // on a new record (once warm), replay it slowly at normal speed as a showcase
            if (record && !evoShowcase && gen >= SHOWCASE_FROM_GEN) {
                startEpisode(epIndex); evoShowcase = true; saveEvo(); return
            }
            evoShowcase = false
            epIndex++
            if (epIndex >= POP) evolveGen()
            startEpisode(epIndex)
            saveEvo()
        }
        // hand-designed "run right + jump when a pit/wall/enemy is directly ahead" seed,
        // so a fresh population already plays deep into the level before evolution refines it
        const seedGenome = (runW, jumpW, wallW, plantW) => {
            const w = new Float64Array(WLEN)
            const bh = NI * NH + NH * NH, bo = bh + NH, ob = bo + NH * NO
            w[8] = 3; w[9] = wallW; w[10] = wallW * 0.66; w[17] = 2.5; w[20] = 2.5   // pit, wall, enemy
            w[11] = wallW * 0.8                                                       // wall ~4 tiles: commit early
            w[22] = plantW; w[23] = plantW                                            // piranha out + leap window
            w[bh] = -1.5
            w[bo + 3 * NH] = jumpW; w[ob + 3] = -1                                    // jump <- danger
            w[ob + 1] = 2; w[ob + 0] = -2; w[ob + 2] = runW                           // right / no-left / run
            return w
        }
        const seedGenomes = () => [seedGenome(1.5, 3, 3, 3), seedGenome(2, 3.5, 3, 3.5), seedGenome(1.2, 2.5, 4, 2.5)]
        const startEvolve = () => {
            mode = 'evolve'; audioController.init(); audioController.startMusic('overworld')
            let saved = null
            try { saved = JSON.parse(localStorage.getItem(EVO_KEY) || 'null') } catch { /* ignore */ }
            if (saved && Array.isArray(saved.best) && saved.best.length === WLEN) {
                gen = saved.gen || 1; bestEverFit = saved.fit || 0; bestCol = saved.col || 0; bestEverWeights = saved.best.slice()
                pop = [Float64Array.from(saved.best)]
                while (pop.length < POP) pop.push(mutate(Float64Array.from(saved.best), 0.5))
            } else {
                gen = 1; bestEverFit = 0; bestCol = 0; bestEverWeights = null
                pop = seedGenomes()
                while (pop.length < POP) pop.push(randWeights())
            }
            fitArr = new Array(POP).fill(0); epIndex = 0; evoShowcase = false
            startEpisode(0)
        }
        const resetEvolve = () => { try { localStorage.removeItem(EVO_KEY) } catch { /* ignore */ }; startEvolve() }
        // fast, non-rendered training used only by the DEV hook to verify learning
        const evoTrain = (gens) => {
            const hist = []
            for (let g = 0; g < gens; g++) {
                for (let i = 0; i < POP; i++) {
                    genome = pop[i]; maxCol = 0; epSteps = 0; evoBonus = 0; evoJumpHold = 0; evoH = new Float64Array(NH)
                    loadRoom(LEVEL_1, false, undefined, { setIndex: 0 }); state = 'play'
                    while (epSteps < EP_CAP && state === 'play') { evolveDrive(); update() }
                    const fit = evoFitness(state === 'win')
                    fitArr[i] = fit
                    if (maxCol > bestCol) bestCol = maxCol
                    if (fit > bestEverFit) { bestEverFit = fit; bestEverWeights = Array.from(genome) }
                }
                hist.push(Math.round(bestEverFit))
                evolveGen()
            }
            return hist
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
            spark(mario.x + mario.w / 2, mario.y + mario.h / 2, ['#ffffff', '#fff0a0', '#ffd000'], 12, 1.6)
            audioController.playSweep(400, 1000, 0.5, 'square', 0.14)
            addScore(1000, mario.x, mario.y - 10, ''); if (mode === 'evolve') evoBonus += 250
        }

        const fireUp = () => {
            if (mario.power === 'small') { mario.y -= 12; mario.h = 28; mario.big = true }
            mario.power = 'fire'; mario.invuln = 0
            spark(mario.x + mario.w / 2, mario.y + mario.h / 2, ['#ffffff', '#ffe888', '#ff8000', '#ff4000'], 14, 2)
            audioController.playSweep(500, 1200, 0.5, 'square', 0.14)
            addScore(1000, mario.x, mario.y - 10, ''); if (mode === 'evolve') evoBonus += 250
        }

        const hurt = () => {
            if (mario.invuln > 0) return
            if (mario.power !== 'small') {
                mario.power = 'small'; mario.big = false; mario.h = 16; mario.y += 12; mario.invuln = 90
                spark(mario.x + mario.w / 2, mario.y + mario.h / 2, ['#ffffff', '#a0c0ff'], 10, 1.6)
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

        // ---- piranha plant motion ----
        // No gravity, no walking: it rides its pipe. `out` is 0..1 and drives both the
        // drawn sprite (clipped at the pipe lip) and the hitbox height, so a fully
        // retracted plant has h=0 and cannot touch anything standing on the pipe.
        const plantTick = (e) => {
            e.t++
            const CYCLE = PLANT_RISE + PLANT_OUT + PLANT_SINK + PLANT_GONE
            const cyc = (e.t + e.delay) % CYCLE
            let f = 0
            if (cyc < PLANT_RISE) f = cyc / PLANT_RISE
            else if (cyc < PLANT_RISE + PLANT_OUT) f = 1
            else if (cyc < PLANT_RISE + PLANT_OUT + PLANT_SINK) f = 1 - (cyc - PLANT_RISE - PLANT_OUT) / PLANT_SINK
            else f = 0
            e.out = f
            e.h = Math.round(PLANT_H * f)
            e.y = e.pipeTop - e.h
        }

        // ---- UPDATE ----
        const update = () => {
            tick++
            if (state === 'attract' || state === 'menu' || state === 'gameover' || state === 'win') return

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

            if (state === 'warp') {
                warpT++
                cameraX = Math.max(0, Math.min(mario.x - VIEW_W * 0.5, level.cols * TILE - VIEW_W))
                if (warpDir === 'in') {
                    mario.y += 4
                    if (warpT >= 34) { loadRoom(warpDest, true, 40, { state: 'play' }); audioController.startMusic(warpDest.bg === 'under' ? 'underground' : 'overworld') }
                } else {
                    const baseY = (13 * TILE) - mario.h
                    mario.y -= 4
                    if (mario.y <= baseY) { mario.y = baseY; state = 'play'; audioController.startMusic('overworld') }
                }
                return
            }

            if (state === 'dying') {
                mario.vy = Math.min(mario.vy + 0.4, 10)
                mario.y += mario.vy
                transitionTimer--
                if (transitionTimer <= 0) {
                    lives--
                    if (lives > 0) loadRoom(level, false, undefined, { setIndex: levelIndex })
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

            // autopilot / neuroevolution drive input instead of a human
            if (mode === 'autopilot') autopilot()
            else if (mode === 'evolve') evolveDrive()

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
                    if (overlap(f, e)) { e.flip = true; e.vy = -6; addScore(200, e.x, e.y - 8, '200'); if (mode === 'evolve') evoBonus += 40; spark(e.x + e.w / 2, e.y + e.h / 2, ['#fff0a0', '#ff8000', '#ff2000'], 9, 2.2); audioController.playNoise(0.1, 0.18); f.dead = true }
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
                if (e.type === 'plant') plantTick(e); else enemyCollide(e)
                if (e.y > VIEW_H + 30) { e.alive = false; continue }

                if (overlap(mario, e)) {
                    // Piranha plants are never stompable - there is no safe contact.
                    if (e.type === 'plant') { hurt(); continue }
                    const marioBottom = mario.y + mario.h
                    const stomping = mario.vy > 0 && marioBottom - e.y < 12
                    const kickDir = (mario.x + mario.w / 2 < e.x + e.w / 2) ? 4 : -4
                    if (e.type === 'goomba') {
                        if (stomping) {
                            e.squash = 24; e.vx = 0
                            mario.vy = keys.jump ? -6.5 : -4.5
                            addScore(100, e.x, e.y - 8, '100'); if (mode === 'evolve') evoBonus += 40
                            audioController.playTone(220, 0.08, 'square', 0.14)
                        } else hurt()
                    } else if (!e.shell) {
                        // walking koopa -> stomp into a shell
                        if (stomping) {
                            e.shell = true; e.still = true; e.vx = 0; e.h = 14; e.y += 10
                            mario.vy = keys.jump ? -6.5 : -4.5
                            addScore(100, e.x, e.y - 8, '100'); if (mode === 'evolve') evoBonus += 40
                            audioController.playTone(330, 0.08, 'square', 0.14)
                        } else hurt()
                    } else if (stomping) {
                        // land on a shell -> kick it
                        e.still = false; e.vx = kickDir; e.grace = 14
                        mario.vy = keys.jump ? -6.5 : -4.5
                        addScore(400, e.x, e.y - 8, '400'); if (mode === 'evolve') evoBonus += 40
                        audioController.playTone(500, 0.08, 'square', 0.14)
                    } else if (!e.still) {
                        // ran into a sliding shell
                        if (!(e.grace > 0)) hurt()
                    } else {
                        // bump a stationary shell -> send it sliding
                        e.still = false; e.vx = kickDir; e.grace = 14
                        addScore(400, e.x, e.y - 8, '400'); if (mode === 'evolve') evoBonus += 40
                        audioController.playTone(500, 0.08, 'square', 0.14)
                    }
                }
            }
            // moving shells wipe out other enemies
            for (const s of enemies) {
                if (!s.alive || !s.shell || s.still) continue
                if (s.grace > 0) s.grace--
                for (const o of enemies) {
                    if (o === s || !o.alive || o.flip || o.squash || o.shell || o.type === 'plant') continue
                    if (overlap(s, o)) {
                        o.flip = true; o.vy = -6; addScore(200, o.x, o.y - 8, '200'); if (mode === 'evolve') evoBonus += 40
                        audioController.playNoise(0.1, 0.18)
                    }
                }
            }
            enemies = enemies.filter(e => e.alive)

            // ---- particles / popups ----
            for (const p of particles) { p.vy += (p.g != null ? p.g : 0.3); p.x += p.vx; p.y += p.vy; p.life-- }
            particles = particles.filter(p => p.life > 0)
            for (const p of popups) { p.y -= 0.6; p.life-- }
            popups = popups.filter(p => p.life > 0)

            // ---- Level completion ----
            if (level.warpCol && mario.onGround && keys.down &&
                Math.abs((mario.x + mario.w / 2) - (level.warpCol * TILE + TILE)) < 18) {
                enterBonus()
                return
            }
            if (level.downCol && mario.onGround && keys.down &&
                Math.abs((mario.x + mario.w / 2) - (level.downCol * TILE + TILE)) < 18) {
                enterUnder()
                return
            }
            if (level.flagCol && mario.x + mario.w >= level.flagCol * TILE) {
                startFlag()
                return
            }
            if (level.exitCol && mario.onGround && mario.x + mario.w >= (level.exitCol - 1) * TILE) {
                completeLevel()
            }

            // ---- camera ----
            const target = mario.x - VIEW_W * 0.42
            cameraX = Math.max(0, Math.min(target, level.cols * TILE - VIEW_W))
        }

        // =================================================================
        // DRAWING
        // =================================================================
        const px = (x) => Math.round(x)

        const PAL_OVER = {
            ground: C.ground, groundDark: C.groundDark, groundLight: C.groundLight,
            brick: C.brick, brickLine: C.brickLine, block: C.block, blockDark: C.blockDark, blockLight: C.blockLight,
            used: C.used, pipe: C.pipe, pipeDark: C.pipeDark, pipeLight: C.pipeLight,
            solid: '#b06020', solidLight: '#e8a058', solidDark: '#6a2800',
        }
        const PAL_UNDER = {
            ground: '#1f3fae', groundDark: '#122a7a', groundLight: '#4f6fe0',
            brick: '#2647c0', brickLine: '#0f1f5a', block: C.block, blockDark: C.blockDark, blockLight: C.blockLight,
            used: '#16308f', pipe: '#0fb0a0', pipeDark: '#0a7d72', pipeLight: '#7ff0e0',
            solid: '#8a4ad0', solidLight: '#c088f0', solidDark: '#5a2a9a',
        }
        const drawTile = (t, x, y, c, r) => {
            const P = level.bg === 'under' ? PAL_UNDER : PAL_OVER
            if (t === GROUND) {
                ctx.fillStyle = P.ground; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = P.groundLight; ctx.fillRect(x, y, TILE, 3)
                ctx.fillStyle = P.groundDark
                ctx.fillRect(x, y + 3, 1, TILE - 3); ctx.fillRect(x + 7, y + 6, 1, TILE - 6)
                ctx.fillRect(x + 3, y + 8, 4, 1); ctx.fillRect(x + 11, y + 11, 4, 1)
            } else if (t === BRICK) {
                ctx.fillStyle = P.brick; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = P.brickLine
                ctx.fillRect(x, y + 7, TILE, 1); ctx.fillRect(x, y + 15, TILE, 1)
                ctx.fillRect(x + 7, y, 1, 7); ctx.fillRect(x + 3, y + 8, 1, 7); ctx.fillRect(x + 11, y + 8, 1, 7)
                ctx.fillStyle = P.groundLight; ctx.fillRect(x, y, TILE, 1)
            } else if (t === QUESTION) {
                const bob = Math.sin(tick * 0.15) > 0 ? 0 : 1
                ctx.fillStyle = P.block; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = P.blockDark
                ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y + TILE - 1, TILE, 1)
                ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x + TILE - 1, y, 1, TILE)
                ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 13, y + 2, 1, 1)
                ctx.fillRect(x + 2, y + 13, 1, 1); ctx.fillRect(x + 13, y + 13, 1, 1)
                ctx.fillStyle = P.blockLight
                ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
                ctx.fillText('?', x + 8, y + 12 + bob)
            } else if (t === USED) {
                ctx.fillStyle = P.used; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = P.brickLine
                ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y + TILE - 1, TILE, 1)
                ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x + TILE - 1, y, 1, TILE)
            } else if (t === SOLID) {
                ctx.fillStyle = P.solid; ctx.fillRect(x, y, TILE, TILE)
                ctx.fillStyle = P.solidLight; ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y, 2, TILE)
                ctx.fillStyle = P.solidDark; ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x + TILE - 2, y, 2, TILE)
            } else if (t === PIPE) {
                const isWarp = level.warpCol && (c === level.warpCol || c === level.warpCol + 1)
                const isUnder = level.downCol && (c === level.downCol || c === level.downCol + 1)
                const pc = isWarp ? '#e0a000' : isUnder ? '#5030c0' : P.pipe
                const pl = isWarp ? '#ffe888' : isUnder ? '#b89cff' : P.pipeLight
                const pd = isWarp ? '#8a5a00' : isUnder ? '#2a1870' : P.pipeDark
                const up = level.grid[r - 1] && level.grid[r - 1][c] === PIPE
                const rightIsPipe = level.grid[r][c + 1] === PIPE
                if (!up) {
                    ctx.fillStyle = pc; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y, TILE + 2, 8)
                    ctx.fillStyle = pl; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y, TILE + 2, 2)
                    ctx.fillStyle = pd; ctx.fillRect(x - (rightIsPipe ? 0 : 2), y + 6, TILE + 2, 2)
                    ctx.fillStyle = pc; ctx.fillRect(x, y + 8, TILE, TILE - 8)
                    ctx.fillStyle = pl; ctx.fillRect(x + 2, y + 8, 3, TILE - 8)
                    ctx.fillStyle = pd; ctx.fillRect(x + TILE - 2, y + 8, 2, TILE - 8)
                } else {
                    ctx.fillStyle = pc; ctx.fillRect(x, y, TILE, TILE)
                    ctx.fillStyle = pl; ctx.fillRect(x + 2, y, 3, TILE)
                    ctx.fillStyle = pd; ctx.fillRect(x + TILE - 2, y, 2, TILE)
                }
            }
        }

        // Flickering wall torch (underground ambiance)
        const drawTorch = (x, y) => {
            ctx.fillStyle = '#6a3a10'; ctx.fillRect(x + 3, y + 4, 3, 9) // handle
            const fl = Math.floor(tick / 5) % 2
            ctx.fillStyle = '#ff8000'; ctx.fillRect(x + 1, y, 7, 5)
            ctx.fillStyle = '#ffd000'; ctx.fillRect(x + 2 + fl, y + 1, 4, 3)
            ctx.fillStyle = '#fff0a0'; ctx.fillRect(x + 3, y + 2 + (fl ? 0 : 1), 2, 2)
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

        // Piranha plant: 12x26 sprite drawn from its animated top-left, clipped at the
        // pipe lip so it appears to rise out of the pipe head-first.
        const drawPlant = (sx, e, clipped) => {
            const x = px(sx), y = px(e.y)
            ctx.save()
            // clip to the pipe's exact column, so a plant can never be drawn overlapping
            // the pipe wall it is rising through
            if (clipped) { ctx.beginPath(); ctx.rect(px(e.pipeCol * TILE), 0, TILE, e.pipeTop); ctx.clip() }
            // stem
            ctx.fillStyle = C.plant; ctx.fillRect(x + 4, y + 10, 4, 16)
            ctx.fillStyle = C.plantLight; ctx.fillRect(x + 5, y + 11, 1, 15)
            ctx.fillStyle = C.plantDark; ctx.fillRect(x + 7, y + 11, 1, 15)
            // leaves
            ctx.fillStyle = C.plant
            ctx.fillRect(x + 1, y + 15, 4, 4); ctx.fillRect(x + 7, y + 19, 4, 4)
            ctx.fillStyle = C.plantDark
            ctx.fillRect(x + 1, y + 18, 4, 1); ctx.fillRect(x + 7, y + 22, 4, 1)
            // head
            ctx.fillStyle = C.plantDark; ctx.fillRect(x, y + 1, 12, 8)
            ctx.fillStyle = C.marioRed
            ctx.fillRect(x + 1, y, 10, 7); ctx.fillRect(x, y + 2, 12, 4)
            ctx.fillStyle = C.white; ctx.fillRect(x, y + 6, 12, 2)          // upper lip
            ctx.fillStyle = C.plantJaw; ctx.fillRect(x + 1, y + 8, 10, 3)   // jaw
            ctx.fillStyle = C.white                                          // teeth
            ctx.fillRect(x + 2, y + 8, 2, 2); ctx.fillRect(x + 8, y + 8, 2, 2)
            ctx.fillStyle = C.black                                          // eyes
            ctx.fillRect(x + 3, y + 3, 1, 2); ctx.fillRect(x + 8, y + 3, 1, 2)
            ctx.restore()
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

        // Mirror the engine's menu/attract screen into React so DOM buttons can render.
        const syncUi = () => {
            const s = state === 'attract' ? 'attract' : state === 'menu' ? 'menu' : state === 'gameover' || state === 'win' ? 'end' : 'none'
            setUi(prev => (prev.screen === s && prev.sel === menuSel) ? prev : { screen: s, sel: menuSel })
        }
        apiRef.current = {
            openMenu: () => { state = 'menu'; menuSel = 0; audioController.init(); syncUi() },
            choose: (i) => { chooseOption(i); syncUi() },
            back: () => { state = 'attract'; syncUi() },
        }

        const draw = () => {
            syncUi()
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
                for (const c of level.decor.bushes || []) { const sx = c * TILE - cam; if (sx > -40 && sx < VIEW_W) drawBush(sx, 12 * TILE) }
                if (level.decor.torches) for (const c of level.decor.torches) { const sx = c * TILE - cam; if (sx > -20 && sx < VIEW_W) drawTorch(sx, 3 * TILE) }
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

            // warp pipe hint (bobbing down-arrow above the gold pipe)
            if (level.warpCol && (state === 'play' || state === 'intro')) {
                const sx = level.warpCol * TILE + TILE - cam
                if (sx > -20 && sx < VIEW_W + 40) {
                    const ay = 9 * TILE - 15 + Math.sin(tick * 0.12) * 3
                    ctx.fillStyle = '#ffe888'
                    ctx.beginPath(); ctx.moveTo(sx - 5, ay); ctx.lineTo(sx + 5, ay); ctx.lineTo(sx, ay + 8); ctx.closePath(); ctx.fill()
                }
            }
            // underground pipe hint (bobbing down-arrow above the purple pipe)
            if (level.downCol && (state === 'play' || state === 'intro')) {
                const sx = level.downCol * TILE + TILE - cam
                if (sx > -20 && sx < VIEW_W + 40) {
                    const ay = 10 * TILE - 15 + Math.sin(tick * 0.12) * 3
                    ctx.fillStyle = '#c9b3ff'
                    ctx.beginPath(); ctx.moveTo(sx - 5, ay); ctx.lineTo(sx + 5, ay); ctx.lineTo(sx, ay + 8); ctx.closePath(); ctx.fill()
                }
            }

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
                if (e.type === 'plant') {
                    if (e.out <= 0 && !e.flip) continue
                    if (e.flip) { ctx.save(); ctx.scale(1, -1); drawPlant(sx, { ...e, y: -(e.y + PLANT_H) }, false); ctx.restore() }
                    else drawPlant(sx, e, true)
                    continue
                }
                if (e.flip) { ctx.save(); ctx.translate(0, 0); ctx.scale(1, -1); drawKoopaOrGoomba(e, sx, -(e.y + e.h)); ctx.restore() }
                else if (e.type === 'goomba') drawGoomba({ ...e, x: sx })
                else drawKoopa({ ...e, x: sx })
            }
            for (const p of particles) {
                const cx = px(p.x - cam), cy = px(p.y)
                if (p.spark) {
                    const s = p.life > 16 ? 4 : p.life > 8 ? 3 : 2
                    ctx.globalAlpha = Math.min(1, p.life / 9)
                    ctx.fillStyle = p.color
                    ctx.fillRect(cx - s / 2, cy - s / 2, s, s)
                    ctx.fillRect(cx - 0.5, cy - s, 1, s * 2)
                    ctx.fillRect(cx - s, cy - 0.5, s * 2, 1)
                    ctx.globalAlpha = 1
                } else {
                    ctx.fillStyle = p.color; ctx.fillRect(cx, cy, 4, 4)
                }
            }

            if (state !== 'gameover') drawMarioAt(mario, cam)

            // popups
            ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
            for (const p of popups) { ctx.fillStyle = C.white; ctx.fillText(p.text, px(p.x - cam), px(p.y)) }

            // HUD (evolve mode swaps the score bar for its own status bar)
            const showHud = state === 'play' || state === 'levelclear' || state === 'dying' || state === 'flag' || state === 'warp'
            if (showHud && mode !== 'evolve') drawHUD()

            // evolution HUD
            if (mode === 'evolve') {
                ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(0, 0, VIEW_W, 15)
                ctx.textAlign = 'left'; ctx.fillStyle = C.coin; ctx.font = 'bold 7px monospace'
                ctx.fillText('GEN ' + gen, 4, 10)
                ctx.fillText('BEST ' + Math.round(bestEverFit), 36, 10)
                const tx = 92, tw = 108, cols = level.cols || 1
                ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(tx, 6, tw, 5)
                ctx.fillStyle = C.coin; ctx.fillRect(tx, 6, Math.min(tw, tw * maxCol / cols), 5)
                const bx = tx + Math.min(tw, tw * bestCol / cols)
                ctx.fillStyle = '#ff5a5a'; ctx.fillRect(bx - 1, 3, 2, 11)
                ctx.textAlign = 'right'; ctx.fillStyle = evoShowcase ? '#7ff07f' : 'rgba(255,255,255,0.7)'
                ctx.fillText(evoShowcase ? '▶ SHOWCASE' : '»»' + (epIndex + 1) + '/' + POP, VIEW_W - 4, 10)
                if (evoBanner > 0) {
                    evoBanner--
                    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, VIEW_H / 2 - 14, VIEW_W, 28)
                    ctx.textAlign = 'center'; ctx.fillStyle = evoShowcase ? '#7ff07f' : C.coin; ctx.font = 'bold 15px monospace'
                    ctx.fillText(evoShowcase ? '★ NEW RECORD' : 'GENERATION ' + gen, VIEW_W / 2, VIEW_H / 2 + 5)
                }
            }

            // overlays
            if (state === 'attract') {
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                centerText([
                    { t: 'SUPER MARIO BROS', color: C.marioRed, font: 'bold 20px monospace', gap: 26 },
                    { t: 'WORLD 1-1 & 1-2', color: C.white, font: 'bold 10px monospace', gap: 22 },
                    { t: 'PRESS ANY KEY TO START', color: (tick % 60 < 36) ? C.coin : C.white, font: 'bold 9px monospace', gap: 16 },
                    { t: 'TAP OPTIONS (TOP-RIGHT) · OR PRESS ?', color: 'rgba(255,255,255,0.7)', font: 'bold 8px monospace' },
                ])
            } else if (state === 'menu') {
                // backdrop + title only; the interactive rows are DOM buttons (touch-friendly)
                ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                ctx.textAlign = 'center'
                ctx.fillStyle = C.coin; ctx.font = 'bold 16px monospace'
                ctx.fillText('OPTIONS', VIEW_W / 2, 34)
                ctx.fillStyle = C.white; ctx.font = 'bold 8px monospace'
                ctx.fillText('SUPER MARIO BROS', VIEW_W / 2, 47)
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
                if (mode === 'evolve') {
                    const over = () => state === 'dying' || state === 'win' || state === 'gameover' || epSteps > EP_CAP
                    if (over()) {
                        endEpisode()
                    } else {
                        // fast montage is silent; record showcases play at normal speed with sound
                        const wantMute = !evoShowcase
                        if (wantMute && !audioController.muted) { audioController.setMuted(true); evoMuted = true }
                        else if (!wantMute && evoMuted) { audioController.setMuted(false); evoMuted = false }
                        const steps = evoShowcase ? 1 : TURBO
                        for (let s = 0; s < steps; s++) { evolveDrive(); update(); if (over()) break }
                    }
                } else {
                    if (evoMuted) { audioController.setMuted(false); evoMuted = false }
                    accumulator += frame
                    while (accumulator >= FIXED_DT) { update(); accumulator -= FIXED_DT }
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }

        // init
        mario = spawnMario('small')
        loadLevel(0)
        state = 'attract'
        if (new URLSearchParams(window.location.search).get('menu') === '1') { state = 'menu'; menuSel = 0 }
        animationFrameId = requestAnimationFrame(loop)

        // DEV-only visual-test hook (never present in production builds)
        if (import.meta.env.DEV) {
            window.__marioTest = {
                getState: () => ({ state, power: mario && mario.power, score, coins, lives, level: level.id, col: Math.round((mario ? mario.x : 0) / TILE), x: mario ? Math.round(mario.x) : 0, y: mario ? Math.round(mario.y) : 0, h: mario ? mario.h : 0, w: mario ? mario.w : 0, big: mario ? !!mario.big : false, mode, menuSel }),
                start: () => { if (state === 'attract' || state === 'gameover' || state === 'win') resetGame() },
                openMenu: () => { state = 'menu'; menuSel = 0 },
                choose: (i) => chooseOption(i),
                autoplay: () => startAutopilot(),
                evolve: () => startEvolve(),
                evoTrain: (g) => evoTrain(g || 5),
                evoBest: () => bestEverWeights ? Array.from(bestEverWeights) : null,
                evoProbe: (w) => {
                    const savePop = pop, saveGenome = genome
                    const g = w ? Float64Array.from(w) : randWeights()
                    pop = [g]; genome = g
                    maxCol = 0; epSteps = 0; evoBonus = 0; evoJumpHold = 0; evoH = new Float64Array(NH)
                    loadRoom(LEVEL_1, false, undefined, { setIndex: 0 }); state = 'play'
                    let jumps = 0; const trace = []
                    while (epSteps < 1500 && state === 'play') { evolveDrive(); if (mario.jumpPressed && mario.onGround) jumps++; update(); if (epSteps % 12 === 0 && epSteps > 120) trace.push([Math.round(mario.x / TILE), Math.round(mario.y), Math.round(mario.vy), mario.onGround ? 1 : 0]) }
                    const r = { maxCol, epSteps, state, jumps, trace: trace.slice(-24) }
                    pop = savePop; genome = saveGenome
                    return r
                },
                evoReset: () => resetEvolve(),
                evoState: () => ({ mode, gen, bestFit: Math.round(bestEverFit), bestCol, col: maxCol, epIndex, showcase: evoShowcase, pop: pop.length, NI, NH, NO, WLEN }),
                // teleport(col[, standRow]) - col only keeps the current height (drops
                // onto whatever is below). Pass standRow = the solid row to stand ON to
                // place Mario precisely, e.g. on top of a 4-tile pipe at row 9.
                teleport: (col, standRow) => {
                    if (!mario) return
                    mario.x = col * TILE
                    if (standRow !== undefined) { mario.y = standRow * TILE - mario.h; mario.vy = 0 }
                    cameraX = Math.max(0, Math.min(mario.x - VIEW_W * 0.42, level.cols * TILE - VIEW_W))
                },
                setPower: (p) => {
                    if (!mario) return
                    if (p === 'small') { if (mario.power !== 'small') mario.y += 12; mario.power = 'small'; mario.big = false; mario.h = 16 }
                    else if (p === 'big') { if (mario.power === 'small') mario.y -= 12; mario.power = 'big'; mario.big = true; mario.h = 28 }
                    else if (p === 'fire') { if (mario.power === 'small') mario.y -= 12; mario.power = 'fire'; mario.big = true; mario.h = 28 }
                },
                throwFire: () => { firePressed = true },
                powerUp: () => { fireUp() },
                startFlag: () => { if (state === 'intro') { state = 'play' } startFlag() },
                clearLevel: () => { if (state === 'intro') state = 'play'; levelClear() },
                gotoLevel: (i) => { if (LEVELS[i]) loadLevel(i, true) },
                enterBonus: () => { if (state === 'intro') state = 'play'; enterBonus() },
                enterUnder: () => { if (state === 'intro') state = 'play'; enterUnder() },
                warpUp: () => { warpUp() },
                isDetour: () => !!(level && (level.bonus || level.detour)),
                plants: () => enemies.filter(e => e.type === 'plant').map(e => ({
                    col: Math.round(e.x / TILE), pipeCol: e.pipeCol, x: Math.round(e.x), w: e.w,
                    pipeTop: e.pipeTop, out: +e.out.toFixed(3),
                    h: e.h, y: Math.round(e.y), alive: e.alive, flip: !!e.flip, squash: e.squash,
                })),
                // power-ups currently on the field, so a check can prove the fire flower
                // at col 16 actually got bumped and collected
                powerups: () => shrooms.map(s => ({
                    kind: s.kind, col: +(s.x / TILE).toFixed(1), y: Math.round(s.y),
                    taken: !!s.taken, emerging: s.emerging,
                })),
                enemies: () => enemies.filter(e => e.type !== 'plant').map(e => ({
                    type: e.type, col: +(e.x / TILE).toFixed(1), y: Math.round(e.y),
                    shell: !!e.shell, still: !!e.still, flip: !!e.flip, squash: e.squash,
                    active: e.x <= cameraX + VIEW_W + 16,
                })),
                musicState: () => audioController._musicState(),
                musicPeak: () => audioController._peak(),
            }
        }

        return () => {
            apiRef.current = null
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

                {ui.screen === 'attract' && (
                    <button onClick={() => apiRef.current?.openMenu()}
                        className="absolute top-2 right-2 z-30 px-3 py-1.5 rounded-md bg-black/70 border border-yellow-400 text-yellow-300 font-mono font-bold text-xs tracking-wider active:scale-95 transition">
                        OPTIONS ▸
                    </button>
                )}

                {ui.screen === 'menu' && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 px-5 pt-16 pb-8">
                        {MENU.map((m, i) => (
                            <button key={m.label} onClick={() => apiRef.current?.choose(i)}
                                className={`w-full max-w-[440px] text-left px-4 py-2 rounded-md border font-mono transition active:scale-[0.98] ${i === ui.sel ? 'bg-yellow-400/20 border-yellow-400' : 'bg-white/5 border-white/20'}`}>
                                <div className={`text-[13px] font-bold ${i === ui.sel ? 'text-yellow-300' : 'text-white'}`}>{i + 1}. {m.label}</div>
                                <div className={`text-[10px] ${i === ui.sel ? 'text-yellow-100/90' : 'text-white/55'}`}>{m.hint}</div>
                            </button>
                        ))}
                        <button onClick={() => apiRef.current?.back()}
                            className="mt-1 px-4 py-1.5 rounded-md bg-white/10 border border-white/25 text-white/80 font-mono text-xs active:scale-95">
                            ◂ BACK
                        </button>
                        <div className="mt-1 text-[9px] font-mono text-white/45">tap an option · or keys 1–4 / arrows · ESC</div>
                    </div>
                )}

                {ui.screen === 'end' && (
                    <button onClick={() => apiRef.current?.choose(0)}
                        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-md bg-black/70 border border-yellow-400 text-yellow-300 font-mono font-bold text-sm tracking-wider active:scale-95 transition">
                        ▶ PLAY AGAIN
                    </button>
                )}

                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SUPER MARIO BROS')} onResume={handleResume} />}
            </div>
            {ui.screen === 'none' && <VirtualControls secondAction={{ code: 'KeyF', label: 'F' }} />}
        </div>
    )
}

export default SuperMarioGame

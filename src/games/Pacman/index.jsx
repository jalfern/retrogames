import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { press, release, currentPad } from '../../utils/onePad'
import { MAP, COLS, ROWS, CELL_SIZE, makePacman, stepPlayer, validMoves, bfsDir, safeMove, stepGhost, scaredSkin, makeFruitTracker, stepFruit, FRUIT_BLINK, fruitForRound, speedStage, watchHorizon, energizerTicks, mazeCleared, briefForRound, CLEAR_FREEZE, BRIEF_TICKS, intermissionFrame, fruitEatTones, makeTunnelRumble, stepTunnelRumble } from './move'
import { attractFrame, DIM } from './attract.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'

// Touch devices have no arrow keys — the attract prompt must say TAP, not keys (#420).
const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

const PacmanGame = () => {
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

        let isAttractMode = true
        let attractTick = 0

        // MAP DATA lives in ./move — the live copy is mutated as dots are eaten
        const map = MAP.map(row => [...row])

        // Entities
        const pacman = makePacman()
        const gs = { map, pacman, score: 0 }
        const fruitTr = makeFruitTracker() // bonus fruit (#1517)
        // #3677 item 1: tunnel-crawl rumble tracker (pure law in ./move)
        const rumbleTr = makeTunnelRumble()

        let ghosts = [
            { id: 1, x: 13, y: 11, color: '#ff0000', path: [], progress: 0, speed: 0.08, state: 'chase', type: 'blinky', penTimer: 0 },
            { id: 2, x: 13, y: 14, color: '#ffb8ff', path: [], progress: 0, speed: 0.075, state: 'pen', type: 'pinky', penTimer: 120 },
            { id: 3, x: 12, y: 14, color: '#00ffff', path: [], progress: 0, speed: 0.07, state: 'pen', type: 'inky', penTimer: 360 },
            { id: 4, x: 15, y: 14, color: '#ffb852', path: [], progress: 0, speed: 0.06, state: 'pen', type: 'clyde', penTimer: 600 }
        ]

        let gameOver = false
        let lives = 3
        let deaths = 0 // #3679 — cumulative captures, the probe counts what sampling can miss
        // #3661: round number drives the fruit kind and the energizer decay
        // (the speed ladder rides the score). Human start resets to 1; a
        // cleared maze advances it.
        let round = 1
        // #3667 item 1: round-clear phases — 'freeze' (maze flash) then, after
        // rounds 1 and 2, 'brief' (the chase short) before the ladder climbs.
        let phase = ''
        let phaseT = 0
        // #3667 item 3: stage-lift tell — a sweep + HUD pulse when the score
        // ladder climbs, so the speed-up is legible mid-play
        let lastStage = 0
        let stageFlash = 0

        // ---------- world + seed (#1473 seed-param, batch 15) ----------
        // Every gameplay die (ghost wander, inky coin flip, attract picks) draws
        // from one seeded mulberry32 stream; the seed regenerates at every human
        // start and ?seed=N replays the exact ghost script.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let tickN = 0

        const resetPositions = () => {
            Object.assign(pacman, makePacman())
            ghosts[0].x = 13; ghosts[0].y = 11; ghosts[0].state = 'chase'; ghosts[0].progress = 0; ghosts[0].penTimer = 0;
            ghosts[1].x = 13; ghosts[1].y = 14; ghosts[1].state = 'pen'; ghosts[1].progress = 0; ghosts[1].penTimer = 120;
            ghosts[2].x = 12; ghosts[2].y = 14; ghosts[2].state = 'pen'; ghosts[2].progress = 0; ghosts[2].penTimer = 360;
            ghosts[3].x = 15; ghosts[3].y = 14; ghosts[3].state = 'pen'; ghosts[3].progress = 0; ghosts[3].penTimer = 600;
        }

        const resetLevel = () => {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    map[r][c] = MAP[r][c]
                }
            }
            wallContours = null  // recompute on next draw
            resetPositions()
            // new stage, new fruit schedule (#1517); a death (resetPositions)
            // does NOT reset it — the arcade fruit timer rides through lives
            fruitTr.pellets = 0; fruitTr.dropped = 0; fruitTr.fruit = null
        }

        const resetGame = () => {
            let dotsLeft = false
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] === 2 || map[r][c] === 3) dotsLeft = true
                }
            }
            if (!dotsLeft) {
                round++ // #3661: a cleared maze is a new round — new fruit, shorter fright
                resetLevel()
                return
            }

            resetPositions()
            gameOver = false
            phase = ''; phaseT = 0
        }

        let viewWidth = 0, viewHeight = 0
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

        const update = () => {
            tickN++
            if (pausedRef.current) return
            // #3667 item 1: a round is lifting — the world stops stepping and
            // only the phase clock runs (WORLD ticks, dice-free: the seed
            // stream rides through the freeze/brief untouched).
            if (phase) {
                phaseT++
                if (phase === 'freeze' && phaseT >= CLEAR_FREEZE) {
                    if (briefForRound(round)) { phase = 'brief'; phaseT = 0 }
                    else { round++; resetLevel(); phase = ''; phaseT = 0 }
                } else if (phase === 'brief' && phaseT >= BRIEF_TICKS) {
                    round++ // the short ends — the ladder climbs
                    resetLevel()
                    phase = ''; phaseT = 0
                }
                return
            }
            if (gameOver) {
                if (rand() < 0.05) resetGame();
                return
            }

            if (pacman.poweredUp) {
                pacman.powerTimer--
                if (pacman.powerTimer <= 0) {
                    pacman.poweredUp = false
                    ghosts.forEach(g => { if (g.state === 'scared') g.state = 'chase' })
                }
            }

            // PACMAN AI (attract) — the human path is the arcade input rules in ./move
            if (isAttractMode && pacman.progress === 0) {
                const mapX = Math.round(pacman.x)
                const mapY = Math.round(pacman.y)
                const horizon = watchHorizon(speedStage(gs.score)) // #3679 — panic earlier as the ladder climbs
                let dangerGhost = ghosts.find(g => g.state === 'chase' && Math.sqrt(Math.pow(g.x - mapX, 2) + Math.pow(g.y - mapY, 2)) < horizon)
                if (dangerGhost) {
                    pacman.nextDir = safeMove(map, pacman, ghosts, mapX, mapY)
                } else {
                    const nearbyPower = bfsDir(map, mapX, mapY, 'power')
                    if (nearbyPower && !pacman.poweredUp) {
                        pacman.nextDir = nearbyPower
                    } else {
                        const nextDot = bfsDir(map, mapX, mapY, 'dot')
                        if (nextDot) pacman.nextDir = nextDot
                        else {
                            const moves = validMoves(map, mapX, mapY)
                            if (moves.length > 0) pacman.nextDir = moves[Math.floor(rand() * moves.length)]
                        }
                    }
                }
                pacman.dir = pacman.nextDir || pacman.dir
            }

            // #472: arcade input — a held diagonal keeps the heading and pre-turns
            // the other axis, a 180 is instant, and the turn starts up to CORNER px
            // before the tile centre. One pad per tick (see ./move).
            const op = isAttractMode ? null : currentPad('dpad')
            const held = []
            if (op) {
                if (op.up) held.push({ x: 0, y: -1 })
                if (op.down) held.push({ x: 0, y: 1 })
                if (op.left) held.push({ x: -1, y: 0 })
                if (op.right) held.push({ x: 1, y: 0 })
            }
            const eaten = stepPlayer(gs, held)
            if (eaten === 'dot') {
                audioController.playTone(300 + rand() * 200, 0.05, 'triangle', 0.1)
            } else if (eaten === 'power') {
                // #3661: from round 14 the pellet scores but nobody frightens —
                // stepPlayer already left poweredUp false, mirror that here.
                if (pacman.poweredUp) {
                    ghosts.forEach(g => { if (g.state === 'chase') g.state = 'scared' })
                    audioController.playSweep(600, 800, 0.5, 'sine', 0.1)
                }
            }

            // #3667 item 1: LIVE maze clear — the round lifts the moment the
            // last pellet or energizer goes (pre-#3667 the loop only noticed a
            // clear through a game over). Dice-free path: no rand draw here.
            if (mazeCleared(map)) {
                phase = 'freeze'
                phaseT = 0
                audioController.playSweep(300, 900, 0.4, 'triangle', 0.15)
                return
            }

            // BONUS FRUIT (#1517) — drops at the 70th/170th pellet, lives ~10 s
            // on the world timer; the KIND and its value follow the round
            // (#3661). The attract demo never drops fruit.
            if (!isAttractMode) {
                gs.score += stepFruit(fruitTr, eaten === 'dot' || eaten === 'power', pacman, {
                    eat: (kind) => {
                        // #3667 item 2: the arpeggio grows with the value
                        fruitEatTones(kind).forEach((f, i) =>
                            audioController.playTone(f, 0.09, 'square', 0.18, i * 0.07))
                    }
                }, round)
            }

            // GHOST AI — pure per-ghost step from ./move (seeded stream; see
            // move.js). Scoring, lives and the respawn stay here at the door.
            // gs (not a fresh literal) so the ghosts read the live score stage.
            ghosts.forEach(g => {
                stepGhost(g, gs, rand, {
                    eat: () => {
                        gs.score += 200
                        audioController.playTone(800, 0.1, 'square', 0.2)
                    },
                    hit: () => {
                        deaths++
                        lives--
                        if (lives <= 0) {
                            gameOver = true
                            lives = 3
                        }
                        audioController.playSweep(400, 100, 0.5, 'sawtooth', 0.2)
                        resetPositions()
                    }
                })
            })

            // #3677 item 1: tunnel-crawl audio — a low two-layer rumble pulses
            // while any ghost crawls the tunnel mouths (half speed is law in
            // ./move; this only makes it audible on a phone). Component-side
            // dressing: the sim, dice and round-1 identity are untouched.
            if (stepTunnelRumble(rumbleTr, ghosts)) {
                audioController.playFilteredNoise(0.5, 0.07, 320)
                audioController.playFilteredNoise(0.34, 0.045, 220, 0.18)
            }

            // #3667 item 3: stage-lift tell — when the score ladder climbs,
            // one rising sweep plus a HUD pulse (the speed change itself is
            // stepPlayer/stepGhost law; this only makes it visible+audible).
            const stNow = speedStage(gs.score)
            if (stNow !== lastStage) {
                if (stNow > lastStage) {
                    stageFlash = 30
                    audioController.playSweep(500 + stNow * 120, 1100 + stNow * 180, 0.25, 'triangle', 0.12)
                }
                lastStage = stNow
            }
            if (stageFlash > 0) stageFlash--
        }

        // Pre-compute wall contour loops once (recalculated on level reset)
        let wallContours = null

        const computeContours = () => {
            const S = CELL_SIZE
            const isWall = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && map[r][c] === 1

            // Collect all boundary edges as directed segments
            // Convention: wall is on the RIGHT side of the edge direction
            // Each edge has an index for O(1) used-tracking
            const edges = []
            const startMap = new Map() // "x,y" -> [{edge, idx}]

            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (!isWall(r, c)) continue
                    if (!isWall(r - 1, c)) {    // top: go right
                        const idx = edges.length
                        const e = { x1: c, y1: r, x2: c + 1, y2: r, dx: 1, dy: 0 }
                        edges.push(e)
                        const k = `${c},${r}`
                        if (!startMap.has(k)) startMap.set(k, [])
                        startMap.get(k).push({ edge: e, idx })
                    }
                    if (!isWall(r + 1, c)) {    // bottom: go left
                        const idx = edges.length
                        const e = { x1: c + 1, y1: r + 1, x2: c, y2: r + 1, dx: -1, dy: 0 }
                        edges.push(e)
                        const k = `${c + 1},${r + 1}`
                        if (!startMap.has(k)) startMap.set(k, [])
                        startMap.get(k).push({ edge: e, idx })
                    }
                    if (!isWall(r, c - 1)) {    // left: go up
                        const idx = edges.length
                        const e = { x1: c, y1: r + 1, x2: c, y2: r, dx: 0, dy: -1 }
                        edges.push(e)
                        const k = `${c},${r + 1}`
                        if (!startMap.has(k)) startMap.set(k, [])
                        startMap.get(k).push({ edge: e, idx })
                    }
                    if (!isWall(r, c + 1)) {    // right: go down
                        const idx = edges.length
                        const e = { x1: c + 1, y1: r, x2: c + 1, y2: r + 1, dx: 0, dy: 1 }
                        edges.push(e)
                        const k = `${c + 1},${r}`
                        if (!startMap.has(k)) startMap.set(k, [])
                        startMap.get(k).push({ edge: e, idx })
                    }
                }
            }

            // Chain into contour loops using right-hand turn priority
            // When arriving at a vertex from direction (dx,dy), the right-turn preference is:
            // turn right > go straight > turn left (to maintain consistent winding)
            const turnOrder = (inDx, inDy) => {
                // Given incoming direction, return outgoing directions in right-turn priority
                // Right turn from (1,0) is (0,1), from (0,1) is (-1,0), etc
                return [
                    { dx: -inDy, dy: inDx },   // right turn
                    { dx: inDx, dy: inDy },     // straight
                    { dx: inDy, dy: -inDx },    // left turn
                ]
            }

            const used = new Set()
            const contours = []

            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue
                const loop = []
                let curIdx = i
                let cur = edges[i]

                while (!used.has(curIdx)) {
                    used.add(curIdx)
                    loop.push(cur)

                    const endKey = `${cur.x2},${cur.y2}`
                    const candidates = startMap.get(endKey) || []
                    const preferred = turnOrder(cur.dx, cur.dy)

                    let found = false
                    for (const pref of preferred) {
                        for (const c of candidates) {
                            if (!used.has(c.idx) && c.edge.dx === pref.dx && c.edge.dy === pref.dy) {
                                cur = c.edge
                                curIdx = c.idx
                                found = true
                                break
                            }
                        }
                        if (found) break
                    }
                    if (!found) {
                        // Fallback: any unused edge
                        for (const c of candidates) {
                            if (!used.has(c.idx)) {
                                cur = c.edge
                                curIdx = c.idx
                                found = true
                                break
                            }
                        }
                    }
                    if (!found) break
                }

                if (loop.length >= 3) {
                    const vertices = loop.map(e => ({ x: e.x1 * S, y: e.y1 * S }))
                    contours.push(vertices)
                }
            }

            wallContours = contours
        }

        const drawWalls = (ctx, stroke) => {
            if (!wallContours) computeContours()

            const S = CELL_SIZE
            const R = S * 0.4 // corner radius

            const traceContours = () => {
                ctx.beginPath()
                for (const verts of wallContours) {
                    const n = verts.length
                    if (n < 3) continue

                    // Start at the midpoint of the first edge
                    const firstMid = {
                        x: (verts[0].x + verts[1].x) / 2,
                        y: (verts[0].y + verts[1].y) / 2
                    }
                    ctx.moveTo(firstMid.x, firstMid.y)

                    for (let i = 1; i <= n; i++) {
                        const curr = verts[i % n]
                        const next = verts[(i + 1) % n]
                        const mid = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 }
                        ctx.arcTo(curr.x, curr.y, mid.x, mid.y, R)
                        ctx.lineTo(mid.x, mid.y)
                    }
                    ctx.closePath()
                }
            }

            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            // Pass 1: Blue wall outline
            ctx.strokeStyle = stroke || '#2121ff'
            ctx.lineWidth = 3
            traceContours()
            ctx.stroke()

            // Pass 2: Cut out center for double-line effect
            ctx.save()
            ctx.globalCompositeOperation = 'destination-out'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = 1
            traceContours()
            ctx.stroke()
            ctx.restore()

            // Ghost house door
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] === 4) {
                        ctx.fillStyle = '#ffb8ff'
                        ctx.fillRect(c * S + 1, r * S + S * 0.4, S - 2, S * 0.2)
                    }
                }
            }
        }

        const drawGhost = (ctx, x, y, color, state, dir, powerTimer) => {
            ctx.save()
            ctx.translate(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
            if (state === 'dead') {
                // eyes-only ghost heading home: the pupils LOOK along the direction
                // of travel — the arcade's dead-ghost direction cue (#1517)
                const ex = dir?.x * 1.2 || 0
                const ey = dir?.y * 1.2 || 0
                ctx.fillStyle = 'white'
                ctx.beginPath()
                ctx.arc(-4, -2, 3, 0, Math.PI * 2); ctx.fill()
                ctx.arc(4, -2, 3, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'black'
                ctx.beginPath()
                ctx.arc(-4 + ex, -2 + ey, 1, 0, Math.PI * 2); ctx.fill()
                ctx.arc(4 + ex, -2 + ey, 1, 0, Math.PI * 2); ctx.fill()
                ctx.restore()
                return
            }
            const skin = state === 'scared' ? scaredSkin(powerTimer) : null
            if (state === 'scared') {
                ctx.fillStyle = skin === 'white' ? 'white' : '#2121ff'
                ctx.strokeStyle = skin === 'white' ? '#ff0000' : 'white'
            } else {
                ctx.fillStyle = color
                ctx.strokeStyle = 'white'
            }
            ctx.beginPath()
            ctx.arc(0, -2, 6, Math.PI, 0)
            ctx.lineTo(6, 6)
            ctx.lineTo(4, 5); ctx.lineTo(2, 6); ctx.lineTo(0, 5); ctx.lineTo(-2, 6); ctx.lineTo(-4, 5); ctx.lineTo(-6, 6)
            ctx.lineTo(-6, -2)
            ctx.fill()

            if (state === 'scared') {
                ctx.fillStyle = skin === 'white' ? 'black' : 'white'
                ctx.fillRect(-3, -2, 2, 2); ctx.fillRect(1, -2, 2, 2)
                ctx.beginPath();
                ctx.moveTo(-3, 2); ctx.lineTo(-1, 0); ctx.lineTo(1, 2); ctx.lineTo(3, 0);
                ctx.stroke()
            } else {
                ctx.fillStyle = 'white'
                ctx.beginPath()
                ctx.arc(-2.5, -3, 2.5, 0, Math.PI * 2); ctx.fill()
                ctx.arc(2.5, -3, 2.5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'black'
                let lx = dir?.x * 1.5 || 0
                let ly = dir?.y * 1.5 || 0
                ctx.beginPath()
                ctx.arc(-2.5 + lx, -3 + ly, 1.2, 0, Math.PI * 2); ctx.fill()
                ctx.arc(2.5 + lx, -3 + ly, 1.2, 0, Math.PI * 2); ctx.fill()
            }
            ctx.restore()
        }

        // Per-kind bonus fruit art (#3661) — original synth, one visual family:
        // cherry pair → strawberry → peach → galaxian → bell → key. Each sits
        // inside the ~14px cell around (fx, fy), blinking handled by the caller.
        const drawFruit = (ctx, fx, fy, kind) => {
            if (kind === 'strawberry') {
                ctx.fillStyle = '#ff3050'
                ctx.beginPath()
                ctx.moveTo(fx, fy + 6)
                ctx.quadraticCurveTo(fx - 6, fy + 1, fx - 4, fy - 3)
                ctx.quadraticCurveTo(fx, fy - 5.5, fx + 4, fy - 3)
                ctx.quadraticCurveTo(fx + 6, fy + 1, fx, fy + 6)
                ctx.fill()
                ctx.fillStyle = '#ffd8a0'
                for (const [sx, sy] of [[-2, -1], [1, 0], [-1, 2], [2.5, -2], [0, -3], [3, 1], [-3, 1]]) ctx.fillRect(fx + sx, fy + sy, 1, 1)
                ctx.fillStyle = '#30c030'
                ctx.beginPath(); ctx.ellipse(fx, fy - 4.5, 4.2, 1.6, 0, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = '#208020'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(fx, fy - 4.5); ctx.lineTo(fx + 1.5, fy - 7.5); ctx.stroke()
                return
            }
            if (kind === 'peach') {
                ctx.fillStyle = '#ffb060'
                ctx.beginPath(); ctx.arc(fx - 2, fy + 1, 4.2, 0, Math.PI * 2); ctx.fill()
                ctx.beginPath(); ctx.arc(fx + 2.4, fy + 1, 4.2, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = '#d07030'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(fx + 0.4, fy - 2.5); ctx.quadraticCurveTo(fx - 0.6, fy + 1, fx + 0.4, fy + 4.5); ctx.stroke()
                ctx.fillStyle = '#30c030'
                ctx.beginPath(); ctx.ellipse(fx + 3, fy - 5, 3, 1.4, -0.4, 0, Math.PI * 2); ctx.fill()
                return
            }
            if (kind === 'galaxian') {
                ctx.fillStyle = '#40a0ff'
                ctx.fillRect(fx - 6.5, fy - 1, 4, 3); ctx.fillRect(fx + 2.5, fy - 1, 4, 3)
                ctx.fillStyle = '#e8e8ff'
                ctx.beginPath(); ctx.moveTo(fx, fy - 6); ctx.lineTo(fx + 2.6, fy + 2); ctx.lineTo(fx - 2.6, fy + 2); ctx.closePath(); ctx.fill()
                ctx.fillStyle = '#ff3030'
                ctx.fillRect(fx - 1, fy - 6, 2, 2.5)
                return
            }
            if (kind === 'bell') {
                ctx.fillStyle = '#ffd23f'
                ctx.beginPath(); ctx.arc(fx, fy, 5.5, Math.PI, 0); ctx.lineTo(fx + 5.5, fy + 3.5); ctx.lineTo(fx - 5.5, fy + 3.5); ctx.closePath(); ctx.fill()
                ctx.fillStyle = '#c8901c'
                ctx.fillRect(fx - 6.5, fy + 3.5, 13, 1.8)
                ctx.beginPath(); ctx.arc(fx, fy + 5.8, 1.4, 0, Math.PI * 2); ctx.fill()
                return
            }
            if (kind === 'key') {
                ctx.strokeStyle = '#e8d060'; ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(fx - 3.2, fy, 2.6, 0, Math.PI * 2); ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(fx - 0.6, fy); ctx.lineTo(fx + 6, fy)
                ctx.moveTo(fx + 3.5, fy); ctx.lineTo(fx + 3.5, fy + 3)
                ctx.moveTo(fx + 6, fy); ctx.lineTo(fx + 6, fy + 3)
                ctx.stroke()
                return
            }
            // cherry (#1517) — two red orbs, joined stems, a leaf. Default kind.
            ctx.strokeStyle = '#00c000'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(fx - 4, fy + 2)
            ctx.quadraticCurveTo(fx - 1, fy - 7, fx + 2, fy - 8)
            ctx.moveTo(fx + 4, fy + 2)
            ctx.quadraticCurveTo(fx + 3, fy - 5, fx + 2, fy - 8)
            ctx.stroke()
            ctx.fillStyle = '#30d030'
            ctx.beginPath()
            ctx.ellipse(fx + 4, fy - 8, 3, 1.5, -0.4, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#ff2020'
            ctx.beginPath()
            ctx.arc(fx - 4, fy + 2, 3.5, 0, Math.PI * 2)
            ctx.arc(fx + 4, fy + 2, 3.5, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#ff9090'
            ctx.beginPath()
            ctx.arc(fx - 5, fy + 1, 1, 0, Math.PI * 2)
            ctx.arc(fx + 3, fy + 1, 1, 0, Math.PI * 2)
            ctx.fill()
        }

        // #3667 item 1: the intermission short — OUR Pac runs down OUR Blinky
        // on an open road, hops the tripped ghost and coasts off while he gets
        // up and chases again. Frame data is intermissionFrame(phaseT): pure,
        // tick-scripted, dice-free. Original art — our own glyphs, no original
        // sprites; the gag is wordless except one caption.
        const drawBrief = (ctx, w, h) => {
            ctx.fillStyle = '#04061c'
            ctx.fillRect(0, 0, w, h)
            const roadY = h * 0.54
            ctx.fillStyle = '#101a33'
            ctx.fillRect(0, roadY - 30, w, 60)
            ctx.fillStyle = '#42527a'
            for (let dx = 8; dx < w; dx += 36) ctx.fillRect(dx, roadY + 26, 18, 2)
            const f = intermissionFrame(phaseT)
            const bx = f.blinkyX * w
            // shadow + Pac first so the ghost reads on top during the leap-back
            ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.12 * (1 - f.hop)})`
            ctx.beginPath()
            ctx.ellipse(f.pacX * w, roadY - 4, 9 + f.hop * 5, 2.5, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#ffff00'
            const mo = 0.18 + 0.22 * Math.abs(Math.sin(phaseT / 5))
            ctx.beginPath()
            ctx.arc(f.pacX * w, roadY - 14 - f.hop * 30, CELL_SIZE / 2 + 6, mo, Math.PI * 2 - mo)
            ctx.lineTo(f.pacX * w, roadY - 14 - f.hop * 30)
            ctx.fill()
            ctx.save()
            ctx.translate(bx, roadY - 10 - (f.blinkyTilt ? 3 : 0))
            if (f.blinkyTilt) ctx.rotate(Math.PI / 2.4) // tripped — tumbling sideways
            ctx.scale(2.4, 2.4)
            drawGhost(ctx, -CELL_SIZE / 2, -CELL_SIZE / 2, '#ff0000', 'chase', { x: 1, y: 0 }, 0)
            ctx.restore()
            if (f.stars) { // tick-twinkled dazed stars, dice-free
                ctx.fillStyle = '#ffd54a'
                for (const [ox, oy] of [[-14, -22], [12, -28], [0, -34]]) {
                    ctx.fillRect(bx + ox - 1, roadY + oy - 3, 2, 7)
                    ctx.fillRect(bx + ox - 3, roadY + oy - 1, 7, 2)
                }
            }
            ctx.fillStyle = '#9aa4b2'
            ctx.font = '12px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`ROUND ${round} CLEARED — ROUND ${round + 1} IS FASTER`, w / 2, h - 22)
        }

        const draw = () => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            const mapWidth = COLS * CELL_SIZE
            const mapHeight = ROWS * CELL_SIZE
            const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.95

            ctx.save()
            ctx.translate((viewWidth - mapWidth * scale) / 2, (viewHeight - mapHeight * scale) / 2)
            ctx.scale(scale, scale)

            if (phase === 'brief') {
                drawBrief(ctx, mapWidth, mapHeight)
            } else {
            drawWalls(ctx, phase === 'freeze' && Math.floor(phaseT / 15) % 2 === 0 ? '#e8ecff' : null)

            // Dots
            ctx.fillStyle = '#ffffff'
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const x = c * CELL_SIZE
                    const y = r * CELL_SIZE
                    if (map[r][c] === 2) {
                        ctx.beginPath()
                        ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 1.7, 0, Math.PI * 2)
                        ctx.fill()
                    } else if (map[r][c] === 3) {
                        if (Date.now() % 400 < 200) {
                            ctx.beginPath()
                            ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 5, 0, Math.PI * 2)
                            ctx.fill()
                        }
                    }
                }
            }

            // Bonus fruit — original per-kind synth art (#3661): the round picks
            // the kind; one visual family, arcade-close. Blinks near expiry on
            // the WORLD timer, never the wall clock.
            if (fruitTr.fruit &&
                (fruitTr.fruit.timer > FRUIT_BLINK || Math.floor(fruitTr.fruit.timer / 10) % 2 === 0)) {
                const fx = fruitTr.fruit.x * CELL_SIZE + CELL_SIZE / 2
                const fy = fruitTr.fruit.y * CELL_SIZE + CELL_SIZE / 2
                drawFruit(ctx, fx, fy, fruitTr.fruit.kind || 'cherry')
            }

            // Draw Entities
            const px = (pacman.x + pacman.dir.x * pacman.progress) * CELL_SIZE + CELL_SIZE / 2
            const py = (pacman.y + pacman.dir.y * pacman.progress) * CELL_SIZE + CELL_SIZE / 2
            ctx.fillStyle = '#ffff00'
            ctx.beginPath()
            const mouthOpen = 0.2 * Math.sin(Date.now() / 50) + 0.2
            let angle = 0
            if (pacman.dir.x === 1) angle = 0
            if (pacman.dir.x === -1) angle = Math.PI
            if (pacman.dir.y === 1) angle = Math.PI / 2
            if (pacman.dir.y === -1) angle = -Math.PI / 2
            const pacRadius = CELL_SIZE / 2 + 1
            ctx.arc(px, py, pacRadius, angle + mouthOpen, angle + 2 * Math.PI - mouthOpen)
            ctx.lineTo(px, py)
            ctx.fill()

            ghosts.forEach(g => {
                const gx = (g.x + (g.nextDir?.x || 0) * g.progress) * CELL_SIZE
                const gy = (g.y + (g.nextDir?.y || 0) * g.progress) * CELL_SIZE
                drawGhost(ctx, gx, gy, g.color, g.state, g.nextDir || g.dir, pacman.powerTimer)
            })
            } // end !brief

            if (gameOver) {
                ctx.fillStyle = '#ff0000'
                ctx.font = '24px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("GAME OVER", COLS * CELL_SIZE / 2, ROWS * CELL_SIZE / 2)
            }

            if (isAttractMode && !phase) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE)
                // Arcade-style attract panel behind the glyphs: the message
                // sits on a dark slab, not mid-corridor over the ghost house.
                ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
                ctx.fillRect((mapWidth - 240) / 2, mapHeight / 2 - 38, 240, 54)
                ctx.strokeStyle = 'rgba(255, 210, 63, 0.45)'
                ctx.lineWidth = 1.5
                ctx.strokeRect((mapWidth - 240) / 2, mapHeight / 2 - 38, 240, 54)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, TOUCH)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
            }

            ctx.restore()

            // HUD (drawn in screen space, outside map transform)
            const hudY = (viewHeight - mapHeight * scale) / 2
            ctx.fillStyle = '#ffffff'
            ctx.font = '14px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE: ${gs.score}`, (viewWidth - mapWidth * scale) / 2, hudY - 6)
            ctx.textAlign = 'right'
            const hudRight = (viewWidth + mapWidth * scale) / 2
            for (let i = 0; i < lives; i++) {
                ctx.fillStyle = '#ffff00'
                ctx.beginPath()
                ctx.arc(hudRight - 10 - i * 18, hudY - 10, 6, 0.3, Math.PI * 2 - 0.3)
                ctx.lineTo(hudRight - 10 - i * 18, hudY - 10)
                ctx.fill()
            }
            // #3661: the arcade marks the round with the fruit at the bottom —
            // the icon of the kind this round will drop.
            const hudBottom = hudY + mapHeight * scale + 14
            const hudLeft = (viewWidth - mapWidth * scale) / 2
            ctx.textAlign = 'left'
            ctx.fillStyle = stageFlash > 0 ? '#ffe14a' : '#9aa4b2'
            // #3678: bell/key rounds (round 7+) lift the label + icon so a
            // first-timer can tell a bell from a key at arm's length on a
            // phone. Rounds 1-6 keep the exact 12px/icon-at-+78 floor — the
            // identity check pins that pixel floor unchanged.
            const legible = round >= 7
            if (legible) {
                ctx.font = `${stageFlash > 0 ? 20 : 18}px monospace`
                ctx.fillText(`ROUND ${round}`, hudLeft, hudBottom + 4)
                const labelW = ctx.measureText(`ROUND ${round}`).width
                const iconX = hudLeft + labelW + 16
                ctx.save()
                ctx.translate(iconX, hudBottom)
                ctx.scale(1.7, 1.7)
                drawFruit(ctx, 0, 0, fruitForRound(round).kind)
                ctx.restore()
            } else {
                ctx.font = `${stageFlash > 0 ? 14 : 12}px monospace`
                ctx.fillText(`ROUND ${round}`, hudLeft, hudBottom + 4)
                drawFruit(ctx, hudLeft + 78, hudBottom, fruitForRound(round).kind)
            }
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
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode || gameOver) {
                // every human start regenerates the seed (?seed=N wins) and
                // clears the run — the attract demo never spends the seed (#1473)
                seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
                rand = seedRng(seed)
                round = 1 // #3661: a human start begins the ladder at round 1
                phase = ''; phaseT = 0 // #3667: never start mid-brief
                lastStage = 0; stageFlash = 0
                resetLevel()
                gs.score = 0
                lives = 3
                gameOver = false
                isAttractMode = false
            }
            // #420: desktop keys write THE one pad (the touch d-pad does the same);
            // update() reads currentPad('dpad') — one pad per tick, one source.
            if (e.code === 'ArrowUp') press('up')
            if (e.code === 'ArrowDown') press('down')
            if (e.code === 'ArrowLeft') press('left')
            if (e.code === 'ArrowRight') press('right')
        }
        const handleKeyUp = (e) => {
            if (e.code === 'ArrowUp') release('up')
            if (e.code === 'ArrowDown') release('down')
            if (e.code === 'ArrowLeft') release('left')
            if (e.code === 'ArrowRight') release('right')
        }

        // Init Logic
        resize()
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('resize', resize)
        animationFrameId = requestAnimationFrame(loop)

        // production report carries the seed (#1473) and the progression (#3661)
        exposeFeedbackState(() => ({
            tick: tickN, score: gs.score, done: gameOver, seed: seed, lives: lives,
            round: round, stage: speedStage(gs.score),
        }))

        // DEV probe for the harness (#3661) — the mcsaucerdrive convention:
        // the live ladder state, so pixels can be checked against the sim.
        if (import.meta.env.DEV) {
            window.__pacTest = {
                probe: () => ({
                    tick: tickN, score: gs.score, done: gameOver, seed, lives, deaths,
                    round, stage: speedStage(gs.score),
                    pac: { x: pacman.x, y: pacman.y, p: pacman.progress, speed: pacman.speed,
                        // #3755: dir + attract so pacmandrive can map the drawn
                        // wedge onto the logical cell and prove attract vs play
                        dir: { x: pacman.dir.x, y: pacman.dir.y } },
                    attract: isAttractMode,
                    power: pacman.poweredUp ? pacman.powerTimer : 0,
                    fruit: fruitTr.fruit ? { x: fruitTr.fruit.x, y: fruitTr.fruit.y, kind: fruitTr.fruit.kind || 'cherry' } : null,
                    phase: phase, phaseT: phaseT, // #3667: the round-lift machine, visible to QA
                    ghosts: ghosts.map(g => ({ type: g.type, x: g.x, y: g.y, state: g.state })),
                }),
            }
        }

        mountDbg({
            title: 'PAC-MAN',
            getState: () => [
                `score ${gs.score}  lives ${lives}  power ${pacman.poweredUp ? pacman.powerTimer : '-'}  over ${gameOver}`,
                `pac ${pacman.x},${pacman.y} p${pacman.progress.toFixed(2)} dir ${pacman.dir.x},${pacman.dir.y} spd ${pacman.speed}`,
                `ghosts ${ghosts.map(g => `${g.type}:${g.x},${g.y}/${g.state}`).join(' ')}`,
                `fruit ${fruitTr.fruit ? `@${fruitTr.fruit.x},${fruitTr.fruit.y} t${fruitTr.fruit.timer} ${fruitTr.fruit.kind || 'cherry'}` : '-'} pellets ${fruitTr.pellets} dropped ${fruitTr.dropped}`,
                `round ${round}  stage ${speedStage(gs.score)}  energizer ${energizerTicks(round)}t  seed ${seed}  tick ${tickN}`,
            ],
            actions: [
                { label: 'Reset positions', run: () => resetPositions() },
                { label: 'Force game over', run: () => { gameOver = true } },
                // #3661 cheat hooks so QA can ride the ladder without the grind
                { label: 'Next round', run: () => { round++ } },
                { label: 'Round → 14', run: () => { round = 14 } },
                { label: 'Score → 5000', run: () => { gs.score = 5000 } },
                // #3667: ride the clear → freeze → brief → round++ machine without eating 240 dots
                { label: 'Clear maze', run: () => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] === 2 || map[r][c] === 3) map[r][c] = 0 } },
            ],
        })

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
            unexposeFeedbackState()
            unmountDbg()
            if (import.meta.env.DEV && window.__pacTest) delete window.__pacTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PAC-MAN')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default PacmanGame

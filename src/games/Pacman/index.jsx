import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { press, release, currentPad } from '../../utils/onePad'
import { MAP, COLS, ROWS, CELL_SIZE, makePacman, stepPlayer, validMoves, bfsDir, safeMove, stepGhost } from './move'
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

        let ghosts = [
            { id: 1, x: 13, y: 11, color: '#ff0000', path: [], progress: 0, speed: 0.08, state: 'chase', type: 'blinky', penTimer: 0 },
            { id: 2, x: 13, y: 14, color: '#ffb8ff', path: [], progress: 0, speed: 0.075, state: 'pen', type: 'pinky', penTimer: 120 },
            { id: 3, x: 12, y: 14, color: '#00ffff', path: [], progress: 0, speed: 0.07, state: 'pen', type: 'inky', penTimer: 360 },
            { id: 4, x: 15, y: 14, color: '#ffb852', path: [], progress: 0, speed: 0.06, state: 'pen', type: 'clyde', penTimer: 600 }
        ]

        let gameOver = false
        let lives = 3

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
        }

        const resetGame = () => {
            let dotsLeft = false
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] === 2 || map[r][c] === 3) dotsLeft = true
                }
            }
            if (!dotsLeft) {
                resetLevel()
                return
            }

            resetPositions()
            gameOver = false
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
                let dangerGhost = ghosts.find(g => g.state === 'chase' && Math.sqrt(Math.pow(g.x - mapX, 2) + Math.pow(g.y - mapY, 2)) < 8)
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
                ghosts.forEach(g => { if (g.state === 'chase') g.state = 'scared' })
                audioController.playSweep(600, 800, 0.5, 'sine', 0.1)
            }

            // GHOST AI — pure per-ghost step from ./move (seeded stream; see
            // move.js). Scoring, lives and the respawn stay here at the door.
            ghosts.forEach(g => {
                stepGhost(g, { map, pacman }, rand, {
                    eat: () => {
                        gs.score += 200
                        audioController.playTone(800, 0.1, 'square', 0.2)
                    },
                    hit: () => {
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

        const drawWalls = (ctx) => {
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
            ctx.strokeStyle = '#2121ff'
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

        const drawGhost = (ctx, x, y, color, state, dir) => {
            ctx.save()
            ctx.translate(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
            if (state === 'dead') {
                ctx.fillStyle = 'white'
                ctx.beginPath()
                ctx.arc(-4, -2, 3, 0, Math.PI * 2); ctx.fill()
                ctx.arc(4, -2, 3, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'black'
                ctx.beginPath()
                ctx.arc(-4, -2, 1, 0, Math.PI * 2); ctx.fill()
                ctx.arc(4, -2, 1, 0, Math.PI * 2); ctx.fill()
                ctx.restore()
                return
            }
            if (state === 'scared') {
                ctx.fillStyle = (Date.now() % 400 < 200) ? '#2121ff' : 'white'
                ctx.strokeStyle = (ctx.fillStyle === '#2121ff') ? 'white' : '#ff0000'
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
                ctx.fillStyle = (ctx.fillStyle === 'white') ? 'black' : 'white'
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

        const draw = () => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            const mapWidth = COLS * CELL_SIZE
            const mapHeight = ROWS * CELL_SIZE
            const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.95

            ctx.save()
            ctx.translate((viewWidth - mapWidth * scale) / 2, (viewHeight - mapHeight * scale) / 2)
            ctx.scale(scale, scale)

            drawWalls(ctx)

            // Dots
            ctx.fillStyle = '#ffffff'
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const x = c * CELL_SIZE
                    const y = r * CELL_SIZE
                    if (map[r][c] === 2) {
                        ctx.fillRect(x + CELL_SIZE / 2 - 1, y + CELL_SIZE / 2 - 1, 2, 2)
                    } else if (map[r][c] === 3) {
                        if (Date.now() % 400 < 200) {
                            ctx.beginPath()
                            ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 5, 0, Math.PI * 2)
                            ctx.fill()
                        }
                    }
                }
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
                drawGhost(ctx, gx, gy, g.color, g.state, g.nextDir || g.dir)
            })

            if (gameOver) {
                ctx.fillStyle = '#ff0000'
                ctx.font = '24px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("GAME OVER", COLS * CELL_SIZE / 2, ROWS * CELL_SIZE / 2)
            }

            if (isAttractMode) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE)
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

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score: gs.score, done: gameOver, seed: seed, lives: lives,
        }))

        mountDbg({
            title: 'PAC-MAN',
            getState: () => [
                `score ${gs.score}  lives ${lives}  power ${pacman.poweredUp ? pacman.powerTimer : '-'}  over ${gameOver}`,
                `pac ${pacman.x},${pacman.y} p${pacman.progress.toFixed(2)} dir ${pacman.dir.x},${pacman.dir.y}`,
                `ghosts ${ghosts.map(g => `${g.type}:${g.x},${g.y}/${g.state}`).join(' ')}`,
                `seed ${seed}  tick ${tickN}`,
            ],
            actions: [
                { label: 'Reset positions', run: () => resetPositions() },
                { label: 'Force game over', run: () => { gameOver = true } },
            ],
        })

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
            unexposeFeedbackState()
            unmountDbg()
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

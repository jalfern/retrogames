import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

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
        let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false }

        // MAP DATA (V3 - Block Based)
        // 0: Path, 1: Wall Block, 2: Dot, 3: Power, 4: Door
        const map = [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
            [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 0, 0, 4, 4, 0, 0, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0], // Ghost House
            [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], // Tunnel
            [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
            [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
            [1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1], // Pacman Start
            [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
            [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
            [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
            [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
            [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
            [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ]

        const CELL_SIZE = 16
        const ROWS = map.length
        const COLS = map[0].length

        // Entities
        let pacman = {
            x: 13.5, y: 23,
            dir: { x: -1, y: 0 },
            nextDir: { x: -1, y: 0 },
            progress: 0,
            speed: 0.15,
            poweredUp: false,
            powerTimer: 0
        }

        let ghosts = [
            { id: 1, x: 13, y: 11, color: '#ff0000', path: [], progress: 0, speed: 0.08, state: 'chase', type: 'blinky', penTimer: 0 },
            { id: 2, x: 13, y: 14, color: '#ffb8ff', path: [], progress: 0, speed: 0.075, state: 'pen', type: 'pinky', penTimer: 120 },
            { id: 3, x: 12, y: 14, color: '#00ffff', path: [], progress: 0, speed: 0.07, state: 'pen', type: 'inky', penTimer: 360 },
            { id: 4, x: 15, y: 14, color: '#ffb852', path: [], progress: 0, speed: 0.06, state: 'pen', type: 'clyde', penTimer: 600 }
        ]

        let gameOver = false
        let score = 0
        let lives = 3

        // --- AI UTILS ---
        const getValidMoves = (x, y) => {
            const moves = []
            if (y === 14) {
                if (x <= 1) { moves.push({ x: -1, y: 0 }); moves.push({ x: 1, y: 0 }); }
                else if (x >= COLS - 2) { moves.push({ x: 1, y: 0 }); moves.push({ x: -1, y: 0 }); }
            }
            if (x < COLS - 1 && map[y][x + 1] !== 1) moves.push({ x: 1, y: 0 })
            if (x > 0 && map[y][x - 1] !== 1) moves.push({ x: -1, y: 0 })
            if (y < ROWS - 1 && map[y + 1][x] !== 1 && map[y + 1][x] !== 4) moves.push({ x: 0, y: 1 })
            if (y > 0 && map[y - 1][x] !== 1) moves.push({ x: 0, y: -1 })
            return moves
        }

        const bfs = (startX, startY, targetType, targetPos = null) => {
            let queue = [{ x: startX, y: startY, path: [] }]
            let visited = new Set(`${startX},${startY}`)
            let iterations = 0;
            const MAX_ITER = 600;

            while (queue.length > 0 && iterations++ < MAX_ITER) {
                let curr = queue.shift()
                if (targetType === 'dot' && map[curr.y][curr.x] === 2) return curr.path[0]
                if (targetType === 'power' && map[curr.y][curr.x] === 3) return curr.path[0]
                if (targetType === 'pacman' && curr.x === Math.round(pacman.x) && curr.y === Math.round(pacman.y)) return curr.path[0]
                if (targetType === 'home' && curr.x === 13 && curr.y === 14) return curr.path[0]
                if (targetType === 'pos' && curr.x === targetPos.x && curr.y === targetPos.y) return curr.path[0]

                const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
                for (let d of dirs) {
                    let nx = curr.x + d.x, ny = curr.y + d.y
                    if (ny === 14 && (nx < 0 || nx >= COLS)) continue;
                    if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && map[ny][nx] !== 1 && !visited.has(`${nx},${ny}`)) {
                        visited.add(`${nx},${ny}`)
                        queue.push({ x: nx, y: ny, path: [...curr.path, d] })
                    }
                }
            }
            return null
        }

        const getNearestGhostDist = (x, y) => {
            let minDist = Infinity
            ghosts.forEach(g => {
                const dist = Math.sqrt(Math.pow(g.x - x, 2) + Math.pow(g.y - y, 2))
                if (dist < minDist) minDist = dist
            })
            return minDist
        }

        const getSafeMove = (x, y) => {
            const moves = getValidMoves(x, y)
            if (moves.length === 0) return { x: 0, y: 0 }
            let bestMove = null
            let maxScore = -Infinity
            moves.forEach(m => {
                const nx = x + m.x
                const ny = y + m.y
                const ghostDist = getNearestGhostDist(nx, ny)
                const isReverse = (m.x === -pacman.dir.x && m.y === -pacman.dir.y)
                const score = ghostDist - (isReverse ? 2 : 0)
                if (score > maxScore) { maxScore = score; bestMove = m }
            })
            return bestMove
        }

        const originalMap = map.map(row => [...row])

        const resetPositions = () => {
            pacman.x = 13.5; pacman.y = 23;
            pacman.dir = { x: -1, y: 0 }
            pacman.nextDir = { x: -1, y: 0 }
            pacman.progress = 0
            ghosts[0].x = 13; ghosts[0].y = 11; ghosts[0].state = 'chase'; ghosts[0].progress = 0; ghosts[0].penTimer = 0;
            ghosts[1].x = 13; ghosts[1].y = 14; ghosts[1].state = 'pen'; ghosts[1].progress = 0; ghosts[1].penTimer = 120;
            ghosts[2].x = 12; ghosts[2].y = 14; ghosts[2].state = 'pen'; ghosts[2].progress = 0; ghosts[2].penTimer = 360;
            ghosts[3].x = 15; ghosts[3].y = 14; ghosts[3].state = 'pen'; ghosts[3].progress = 0; ghosts[3].penTimer = 600;
            pacman.poweredUp = false
            pacman.powerTimer = 0
        }

        const resetLevel = () => {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    map[r][c] = originalMap[r][c]
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
            if (pausedRef.current) return
            if (gameOver) {
                if (Math.random() < 0.05) resetGame();
                return
            }

            if (pacman.poweredUp) {
                pacman.powerTimer--
                if (pacman.powerTimer <= 0) {
                    pacman.poweredUp = false
                    ghosts.forEach(g => { if (g.state === 'scared') g.state = 'chase' })
                }
            }

            // PACMAN AI
            if (pacman.progress === 0) {
                if (isAttractMode) {
                    const mapX = Math.round(pacman.x)
                    const mapY = Math.round(pacman.y)
                    let dangerGhost = ghosts.find(g => g.state === 'chase' && Math.sqrt(Math.pow(g.x - mapX, 2) + Math.pow(g.y - mapY, 2)) < 8)
                    if (dangerGhost) {
                        pacman.nextDir = getSafeMove(mapX, mapY)
                    } else {
                        const nearbyPower = bfs(mapX, mapY, 'power')
                        if (nearbyPower && !pacman.poweredUp) {
                            pacman.nextDir = nearbyPower
                        } else {
                            const nextDot = bfs(mapX, mapY, 'dot')
                            if (nextDot) pacman.nextDir = nextDot
                            else {
                                const moves = getValidMoves(mapX, mapY)
                                if (moves.length > 0) pacman.nextDir = moves[Math.floor(Math.random() * moves.length)]
                            }
                        }
                    }
                    pacman.dir = pacman.nextDir || pacman.dir
                } else {
                    // Manual Turn Logic
                    // Allow turning if valid
                    if (pacman.nextDir.x !== 0 || pacman.nextDir.y !== 0) {
                        const mapX = Math.round(pacman.x)
                        const mapY = Math.round(pacman.y)
                        const nextX = mapX + pacman.nextDir.x
                        const nextY = mapY + pacman.nextDir.y
                        if (nextY === 14 && (nextX < 0 || nextX >= COLS)) {
                            pacman.dir = pacman.nextDir
                        } else if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS && map[nextY][nextX] !== 1) {
                            pacman.dir = pacman.nextDir
                        }
                    }
                }
            }

            // Move Pacman
            if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
                // PREDICT COLLISION
                if (pacman.progress === 0) {
                    const mapX = Math.round(pacman.x)
                    const mapY = Math.round(pacman.y)
                    const nextX = mapX + pacman.dir.x
                    const nextY = mapY + pacman.dir.y
                    if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS && map[nextY][nextX] === 1) {
                        // Hit wall
                        pacman.dir = { x: 0, y: 0 }
                    }
                }

                if (pacman.dir.x !== 0 || pacman.dir.y !== 0) { // Check again after collision stop
                    pacman.progress += pacman.speed
                    if (pacman.progress >= 1) {
                        pacman.x += pacman.dir.x
                        pacman.y += pacman.dir.y
                        pacman.progress = 0
                        pacman.x = Math.round(pacman.x)
                        pacman.y = Math.round(pacman.y)
                        if (pacman.x <= -1) pacman.x = COLS - 1
                        else if (pacman.x >= COLS) pacman.x = 0
                        const mapX = Math.round(pacman.x)
                        const mapY = Math.round(pacman.y)
                        if (mapX >= 0 && mapX < COLS && mapY >= 0 && mapY < ROWS) {
                            const tile = map[mapY][mapX]
                            if (tile === 2) {
                                map[mapY][mapX] = 0
                                score += 10
                                audioController.playTone(300 + Math.random() * 200, 0.05, 'triangle', 0.1)
                            } else if (tile === 3) {
                                map[mapY][mapX] = 0
                                score += 50
                                pacman.poweredUp = true
                                pacman.powerTimer = 600
                                ghosts.forEach(g => { if (g.state === 'chase') g.state = 'scared' })
                                audioController.playSweep(600, 800, 0.5, 'sine', 0.1)
                            }
                        }
                    }
                }
            }

            // GHOST AI
            ghosts.forEach(g => {
                // Pen countdown
                if (g.state === 'pen') {
                    g.penTimer--
                    if (g.penTimer <= 0) {
                        g.state = 'exiting'
                    } else {
                        // Bounce up and down inside pen
                        if (g.progress === 0) {
                            if (!g.penBounceDir) g.penBounceDir = -1
                            const ny = Math.round(g.y) + g.penBounceDir
                            if (ny < 13 || ny > 15 || map[ny][Math.round(g.x)] === 1) {
                                g.penBounceDir *= -1
                            }
                            g.nextDir = { x: 0, y: g.penBounceDir }
                        }
                        g.progress += g.speed * 0.5
                        if (g.progress >= 1) {
                            g.y += g.nextDir.y
                            g.y = Math.round(g.y)
                            g.progress = 0
                        }
                        return
                    }
                }

                // Exiting pen — path to just above the door
                if (g.state === 'exiting') {
                    if (g.progress === 0) {
                        const gx = Math.round(g.x)
                        const gy = Math.round(g.y)
                        if (gy <= 11) {
                            // Made it out
                            g.state = 'chase'
                        } else {
                            // Path toward door exit: first align to col 13, then go up
                            if (gx < 13) g.nextDir = { x: 1, y: 0 }
                            else if (gx > 13) g.nextDir = { x: -1, y: 0 }
                            else g.nextDir = { x: 0, y: -1 }
                        }
                    }
                    if (g.state === 'exiting') {
                        g.progress += g.speed
                        if (g.progress >= 1) {
                            g.x += g.nextDir.x
                            g.y += g.nextDir.y
                            g.x = Math.round(g.x)
                            g.y = Math.round(g.y)
                            g.progress = 0
                        }
                        return
                    }
                }

                if (g.progress === 0) {
                    let move = null
                    if (g.state === 'dead') {
                        move = bfs(Math.round(g.x), Math.round(g.y), 'home')
                        if (!move) { g.state = 'pen'; g.penTimer = 120; }
                    } else if (g.state === 'scared') {
                        const moves = getValidMoves(Math.round(g.x), Math.round(g.y))
                        move = moves[Math.floor(Math.random() * moves.length)]
                    } else {
                        if (g.type === 'blinky') {
                            move = bfs(Math.round(g.x), Math.round(g.y), 'pacman')
                        } else if (g.type === 'pinky') {
                            const targetX = Math.round(pacman.x + pacman.dir.x * 4)
                            const targetY = Math.round(pacman.y + pacman.dir.y * 4)
                            const tx = Math.max(0, Math.min(COLS - 1, targetX))
                            const ty = Math.max(0, Math.min(ROWS - 1, targetY))
                            move = bfs(Math.round(g.x), Math.round(g.y), 'pos', { x: tx, y: ty })
                            if (!move) move = bfs(Math.round(g.x), Math.round(g.y), 'pacman')
                        } else {
                            if (Math.random() > 0.5) {
                                move = bfs(Math.round(g.x), Math.round(g.y), 'pacman')
                            } else {
                                const moves = getValidMoves(Math.round(g.x), Math.round(g.y))
                                if (moves.length > 0) move = moves[Math.floor(Math.random() * moves.length)]
                            }
                        }
                    }
                    if (move) g.nextDir = move
                    else {
                        const moves = getValidMoves(Math.round(g.x), Math.round(g.y))
                        if (moves.length > 0) g.nextDir = moves[Math.floor(Math.random() * moves.length)]
                    }
                }
                if (g.nextDir) {
                    let currentSpeed = g.speed
                    if (g.state === 'scared') currentSpeed *= 0.6
                    if (g.state === 'dead') currentSpeed *= 3.0
                    g.progress += currentSpeed
                    if (g.progress >= 1) {
                        g.x += g.nextDir.x
                        g.y += g.nextDir.y
                        g.progress = 0
                        g.x = Math.round(g.x)
                        g.y = Math.round(g.y)
                        if (g.x <= -1) g.x = COLS - 1
                        if (g.x >= COLS) g.x = 0
                    }
                }
                const dx = (g.x + (g.nextDir?.x || 0) * g.progress) - (pacman.x + pacman.dir.x * pacman.progress)
                const dy = (g.y + (g.nextDir?.y || 0) * g.progress) - (pacman.y + pacman.dir.y * pacman.progress)
                if (Math.sqrt(dx * dx + dy * dy) < 0.8) {
                    if (g.state === 'scared') {
                        g.state = 'dead'
                        score += 200
                        audioController.playTone(800, 0.1, 'square', 0.2)
                    } else if (g.state === 'chase') {
                        lives--
                        if (lives <= 0) {
                            gameOver = true
                            score = 0
                            lives = 3
                        }
                        audioController.playSweep(400, 100, 0.5, 'sawtooth', 0.2)
                        resetPositions()
                        return
                    }
                }
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
            const size = CELL_SIZE * 1.6
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
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ARROW KEYS TO START", COLS * CELL_SIZE / 2, ROWS * CELL_SIZE / 2)
                ctx.fillText("ATTRACT MODE", COLS * CELL_SIZE / 2, ROWS * CELL_SIZE / 2 - 30)
            }

            ctx.restore()

            // HUD (drawn in screen space, outside map transform)
            const hudY = (viewHeight - mapHeight * scale) / 2
            ctx.fillStyle = '#ffffff'
            ctx.font = '14px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE: ${score}`, (viewWidth - mapWidth * scale) / 2, hudY - 6)
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

            if (isAttractMode) {
                isAttractMode = false
                resetLevel()
            }
            if (gameOver) {
                resetLevel()
                gameOver = false
                score = 0
                lives = 3
            }
            if (e.code === 'ArrowUp') pacman.nextDir = { x: 0, y: -1 }
            if (e.code === 'ArrowDown') pacman.nextDir = { x: 0, y: 1 }
            if (e.code === 'ArrowLeft') pacman.nextDir = { x: -1, y: 0 }
            if (e.code === 'ArrowRight') pacman.nextDir = { x: 1, y: 0 }
        }

        // Init Logic
        resize()
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', resize)
        animationFrameId = requestAnimationFrame(loop)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
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

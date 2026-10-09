import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const FroggerGame = () => {
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

        // FIXED INTERNAL RESOLUTION: 13 columns of 20px, 12 play rows + HUD strip
        const CELL = 20
        const COLS = 13
        const W = COLS * CELL
        const HUD_H = 26
        const ROWS = 12
        const H = HUD_H + ROWS * CELL

        // Row map (top to bottom):
        // 0 = homes, 1-4 = river, 5 = median, 6-10 = road (8 is the rest lane), 11 = start
        const HOME_ROW = 0
        const RIVER_TOP = 1
        const RIVER_BOT = 4
        const MEDIAN_ROW = 5
        const ROAD_TOP = 6
        const ROAD_BOT = 10
        const START_ROW = 11

        const TIME_LIMIT = 30 * 60
        const HOP_ANIM = 9
        const DIE_ANIM = 55
        const HOME_ANIM = 45
        const DIVE_CYCLE = 4.5 * 60
        const DIVE_UP = 3.3 * 60

        canvas.width = W
        canvas.height = H
        ctx.imageSmoothingEnabled = false

        const mod = (v, c) => ((v % c) + c) % c
        const rowMid = r => HUD_H + r * CELL + CELL / 2

        // ------------------------------------------------------------------
        // LANES. Items live at continuous x; draw/hit-test through a modulo
        // of the lane's cycle length, so the traffic line never shows a hole.
        // ------------------------------------------------------------------
        const makeLane = ({ dir, speed, kind, widths, gap, phase = 0, dive = false }) => {
            const pattern = [...widths]
            let list = []
            let cycle = 0
            let guard = 0
            while (cycle < W + 4 * CELL && guard++ < 20) {
                list = list.concat(pattern)
                cycle = list.reduce((s, w) => s + (w + gap) * CELL, 0)
            }
            const maxW = Math.max(...list)
            const items = []
            let x = phase * CELL
            for (const w of list) {
                items.push({ x, w })
                x += (w + gap) * CELL
            }
            return { dir, speed, kind, items, cycle, maxW, dive, t: Math.floor(Math.random() * DIVE_CYCLE) }
        }

        const RIVER_CFG = [
            { dir: 1, speed: 0.6, kind: 'log', widths: [3], gap: 2.4 },
            { dir: -1, speed: 0.75, kind: 'turtle', widths: [2, 2], gap: 2.6, dive: true },
            { dir: 1, speed: 1.0, kind: 'log', widths: [2, 2], gap: 2.4 },
            { dir: -1, speed: 1.1, kind: 'log', widths: [1], gap: 2.7 }
        ]
        const ROAD_CFG = {
            6: { dir: 1, speed: 0.7, kind: 'truck', widths: [2], gap: 3.4 },
            7: { dir: 1, speed: 1.5, kind: 'car', widths: [1, 1], gap: 2.4 },
            9: { dir: -1, speed: 1.2, kind: 'car', widths: [1], gap: 2.3 },
            10: { dir: -1, speed: 0.95, kind: 'car', widths: [1, 1], gap: 3.1 }
        }

        const HOUSE_COLS = [1, 4, 6, 8, 11]

        let riverLanes = []
        let roadLanes = {}
        let houses = []
        let level = 1
        let score = 0
        let hiScore = Number(localStorage.getItem('frogger.hi') || 0)
        let lives = 3
        let timeLeft = TIME_LIMIT
        let isAttractMode = true
        let gameOverFlag = false
        let levelFlash = 0

        const frog = {
            x: 6 * CELL + CELL / 2,
            row: START_ROW,
            prevX: 6 * CELL + CELL / 2,
            prevRow: START_ROW,
            bestRow: START_ROW,
            riding: -1,
            state: 'alive', // alive | dying | home
            cause: '',
            animT: 0,
            deadT: 0,
            homeCol: -1
        }

        const demo = { tick: 0 }

        const speedMult = () => Math.min(1 + (level - 1) * 0.12, 1.8)

        const spansOf = lane => lane.items.map(it => ({
            x: mod(it.x, lane.cycle) - lane.maxW * CELL,
            w: it.w * CELL
        }))

        const laneFor = row => (row >= RIVER_TOP && row <= RIVER_BOT)
            ? riverLanes[row - RIVER_TOP]
            : (roadLanes[row] || null)

        const surfaced = lane => !lane.dive || mod(lane.t, DIVE_CYCLE) < DIVE_UP

        // "Can the frog stand at x in this row right now?" True on safe ground,
        // true on a clear road (the empty rest lane counts), true on a surfaced
        // float under the frog. False in water with nothing to ride.
        const supportAt = (row, x) => {
            if (row === MEDIAN_ROW || row === START_ROW) return true
            if (row === HOME_ROW) return false
            const lane = laneFor(row)
            if (!lane) return row >= ROAD_TOP && row <= ROAD_BOT
            if (row >= ROAD_TOP) return !spansOf(lane).some(s => x + 8 > s.x + 2 && x - 8 < s.x + s.w - 2)
            if (!surfaced(lane)) return false
            return spansOf(lane).some(s => x >= s.x - 4 && x <= s.x + s.w + 4)
        }

        const crushAt = (row, x) => {
            const lane = roadLanes[row]
            if (!lane) return false
            return spansOf(lane).some(s => x + 7 > s.x + 3 && x - 7 < s.x + s.w - 3)
        }

        const houseAt = x => {
            for (let i = 0; i < HOUSE_COLS.length; i++) {
                const cx = HOUSE_COLS[i] * CELL + CELL / 2
                if (Math.abs(x - cx) <= CELL * 0.6) return i
            }
            return -1
        }

        const buildWorld = () => {
            riverLanes = RIVER_CFG.map(makeLane)
            roadLanes = {}
            for (const r of Object.keys(ROAD_CFG)) roadLanes[r] = makeLane(ROAD_CFG[r])
            houses = HOUSE_COLS.map(() => ({ filled: false, fly: false }))
            const flyIdx = Math.floor(Math.random() * houses.length)
            houses[flyIdx].fly = true
        }

        const resetFrog = () => {
            frog.x = 6 * CELL + CELL / 2
            frog.row = START_ROW
            frog.prevX = frog.x
            frog.prevRow = START_ROW
            frog.bestRow = START_ROW
            frog.riding = -1
            frog.state = 'alive'
            frog.animT = 0
            frog.deadT = 0
            frog.homeCol = -1
            timeLeft = TIME_LIMIT
        }

        const resetGame = () => {
            level = 1
            score = 0
            lives = 3
            gameOverFlag = false
            buildWorld()
            resetFrog()
        }

        const die = cause => {
            if (frog.state !== 'alive') return
            frog.state = 'dying'
            frog.cause = cause
            frog.deadT = DIE_ANIM
            frog.riding = -1
            audioController.playSweep(320, 60, 0.35, 'sawtooth', 0.15)
            audioController.playNoise(0.25, 0.15)
        }

        const nextLife = () => {
            lives--
            if (lives <= 0) {
                gameOverFlag = true
                if (score > hiScore) {
                    hiScore = score
                    localStorage.setItem('frogger.hi', String(hiScore))
                }
            } else {
                resetFrog()
            }
        }

        const completeLevel = () => {
            score += 1000
            level++
            levelFlash = 120
            audioController.playSweep(440, 1320, 0.6, 'square', 0.12)
            buildWorld()
            resetFrog()
        }

        const enterHome = hi => {
            const h = houses[hi]
            if (h.filled) { die('wall'); return }
            h.filled = true
            score += 50
            if (h.fly) {
                score += 200
                h.fly = false
                audioController.playTone(1568, 0.1, 'square', 0.1)
            }
            frog.state = 'home'
            frog.deadT = HOME_ANIM
            frog.homeCol = hi
            frog.riding = -1
            audioController.playSweep(330, 660, 0.2, 'square', 0.1)
            if (houses.every(x => x.filled)) {
                frog.deadT = HOME_ANIM + 40
            } else {
                timeLeft = TIME_LIMIT
            }
        }

        // ------------------------------------------------------------------
        // HOP — one grid cell per press. Landing is resolved immediately;
        // animT only interpolates the sprite along the arc.
        // ------------------------------------------------------------------
        const hop = (dx, dy) => {
            if (frog.state !== 'alive') return
            const nx = frog.x + dx * CELL
            const nr = frog.row + dy
            if (dx !== 0 && (nx < CELL / 2 + 2 || nx > W - CELL / 2 - 2)) return
            const row = Math.max(HOME_ROW, Math.min(START_ROW, nr))

            frog.prevX = frog.x
            frog.prevRow = frog.row
            frog.x = nx
            frog.row = row
            frog.animT = HOP_ANIM
            audioController.playTone(340 + (START_ROW - row) * 18, 0.05, 'square', 0.06)

            if (dy < 0 && row < frog.bestRow) {
                frog.bestRow = row
                score += 10
            }
            frog.riding = -1

            if (row === HOME_ROW) {
                const hi = houseAt(nx)
                if (hi >= 0) enterHome(hi)
                else die('water')
            } else if (row >= RIVER_TOP && row <= RIVER_BOT) {
                if (supportAt(row, nx)) frog.riding = row - RIVER_TOP
                else die('water')
            }
            if (crushAt(row, nx)) die('car')
        }

        // ------------------------------------------------------------------
        // ATTRACT DEMO — plays by the same rules the player does.
        // ------------------------------------------------------------------
        const demoThink = () => {
            if (frog.state !== 'alive') return
            const r = frog.row
            const upClear = row => supportAt(row, frog.x)

            if (r === START_ROW || (r > ROAD_TOP && !roadLanes[r])) {
                if (upClear(r - 1)) hop(0, -1)
                else if (Math.random() < 0.25) hop(Math.random() < 0.5 ? -1 : 1, 0)
            } else if (r >= ROAD_TOP) {
                const lane = roadLanes[r]
                const incoming = lane && spansOf(lane).some(s =>
                    lane.dir === 1 ? (s.x + s.w >= frog.x - 4 * CELL && s.x < frog.x) : (s.x <= frog.x + 4 * CELL && s.x + s.w > frog.x))
                if (upClear(r - 1) && !incoming) hop(0, -1)
                else if (Math.random() < 0.3) hop(Math.random() < 0.5 ? -1 : 1, 0)
            } else if (r === MEDIAN_ROW) {
                if (supportAt(RIVER_BOT, frog.x)) hop(0, -1)
                else if (Math.random() < 0.3) {
                    const d = Math.random() < 0.5 ? -1 : 1
                    if (supportAt(RIVER_BOT, frog.x + d * CELL)) hop(d, 0)
                }
            } else {
                const lane = riverLanes[r - RIVER_TOP]
                const diving = lane.dive && DIVE_UP - mod(lane.t, DIVE_CYCLE) < 45
                const fwd = supportAt(r - 1, frog.x) || (r - 1 === HOME_ROW && houseAt(frog.x) >= 0 && !houses[houseAt(frog.x)].filled)
                if (fwd && !diving && supportAt(r, frog.x + CELL)) hop(1, -1)
                else if (fwd && !diving && supportAt(r, frog.x)) hop(0, -1)
                else if (diving) {
                    const d = Math.random() < 0.5 ? -1 : 1
                    const s = spansOf(lane).some(sp => frog.x + d * CELL >= sp.x + 2 && frog.x + d * CELL <= sp.x + sp.w - 2)
                    if (s && frog.x + d * CELL > CELL && frog.x + d * CELL < W - CELL) hop(d, 0)
                }
            }
        }

        // ------------------------------------------------------------------
        const update = () => {
            if (frog.animT > 0) frog.animT--
            const m = speedMult()
            riverLanes.forEach(lane => {
                lane.t++
                lane.items.forEach(it => { it.x += lane.dir * lane.speed * m })
            })
            Object.values(roadLanes).forEach(lane => {
                lane.items.forEach(it => { it.x += lane.dir * lane.speed * m })
            })
            if (levelFlash > 0) levelFlash--

            if (isAttractMode) {
                demo.tick++
                if (demo.tick >= 15) {
                    demo.tick = 0
                    demoThink()
                }
                if (frog.state === 'dying' && --frog.deadT <= 0) resetFrog()
                if (frog.state === 'home' && --frog.deadT <= 0) resetFrog()
                return
            }

            if (frog.state === 'alive') {
                if (frog.riding >= 0) {
                    const lane = riverLanes[frog.riding]
                    frog.x += lane.dir * lane.speed * m
                    if (!surfaced(lane)) die('water')
                }
                if (crushAt(frog.row, frog.x)) die('car')
                if (frog.x < CELL * 0.4 || frog.x > W - CELL * 0.4) die('off')
                timeLeft--
                if (timeLeft <= 0) die('time')
                else if (timeLeft < 5 * 60 && timeLeft % 60 === 0) audioController.playTone(1000, 0.04, 'square', 0.08)
            } else if (frog.state === 'dying') {
                if (gameOverFlag) return // frozen splat under the GAME OVER screen
                if (--frog.deadT <= 0) nextLife()
            } else if (frog.state === 'home') {
                if (--frog.deadT <= 0) {
                    if (houses.every(h => h.filled)) completeLevel()
                    else resetFrog()
                }
            }
        }

        // ------------------------------------------------------------------
        // DRAWING
        // ------------------------------------------------------------------
        const drawFrog = (x, y, s) => {
            ctx.fillStyle = '#5adb5a'
            ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 8 * s)
            ctx.fillStyle = '#2f9e3f'
            ctx.fillRect(x - 8 * s, y - 2 * s, 2 * s, 5 * s)
            ctx.fillRect(x + 6 * s, y - 2 * s, 2 * s, 5 * s)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x - 4 * s, y - 6 * s, 3 * s, 3 * s)
            ctx.fillRect(x + 1 * s, y - 6 * s, 3 * s, 3 * s)
            ctx.fillStyle = '#000000'
            ctx.fillRect(x - 3 * s, y - 5 * s, s + 1, s + 1)
            ctx.fillRect(x + 2 * s, y - 5 * s, s + 1, s + 1)
        }

        const drawCar = (x, w, h, color) => {
            ctx.fillStyle = color
            ctx.fillRect(x, h - 15, w, 13)
            ctx.fillStyle = '#111118'
            if (w > CELL * 1.5) {
                ctx.fillRect(x + 3, h - 13, 7, 8)
                ctx.fillStyle = color
                ctx.fillRect(x + 12, h - 17, w - 14, 15)
                ctx.fillStyle = '#111118'
                ctx.fillRect(x + w - 10, h - 14, 7, 8)
            } else {
                ctx.fillRect(x + w / 2 - 4, h - 13, 8, 8)
            }
            ctx.fillStyle = '#000000'
            ctx.fillRect(x + 3, h - 2, 5, 3)
            ctx.fillRect(x + w - 8, h - 2, 5, 3)
        }

        const drawLog = (x, w, h) => {
            ctx.fillStyle = '#7a4a1f'
            ctx.fillRect(x, h - 13, w, 12)
            ctx.fillStyle = '#5b3413'
            ctx.fillRect(x, h - 13, 3, 12)
            ctx.fillRect(x + w - 3, h - 13, 3, 12)
            ctx.fillStyle = '#9c6b33'
            for (let i = x + 6; i < x + w - 6; i += 9) ctx.fillRect(i, h - 9, 4, 1)
        }

        const drawTurtles = (x, w, h, up) => {
            if (!up) {
                ctx.fillStyle = 'rgba(255,255,255,0.45)'
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath()
                    ctx.arc(x + CELL / 2 + i * CELL, h - 6 + ((i % 2) * 3), 2, 0, Math.PI * 2)
                    ctx.fill()
                }
                return
            }
            const n = Math.round(w / CELL)
            for (let i = 0; i < n; i++) {
                const cx = x + CELL / 2 + i * CELL
                ctx.fillStyle = '#2f8f3f'
                ctx.beginPath()
                ctx.arc(cx, h - 7, 8, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = '#175a24'
                ctx.beginPath()
                ctx.arc(cx, h - 7, 5, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = '#79c96f'
                ctx.fillRect(cx - 1, h - 16, 2, 3)
            }
        }

        const draw = () => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, H)

            // ---- homes row ----
            ctx.fillStyle = '#0b3d13'
            ctx.fillRect(0, rowMid(HOME_ROW) - CELL / 2, W, CELL)
            for (let i = 0; i < HOUSE_COLS.length; i++) {
                const hx = HOUSE_COLS[i] * CELL
                ctx.fillStyle = '#02160a'
                ctx.fillRect(hx + 1, rowMid(HOME_ROW) - CELL / 2 + 1, CELL - 2, CELL - 2)
                if (houses[i].filled) {
                    drawFrog(hx + CELL / 2, rowMid(HOME_ROW) - 1, 0.8)
                } else if (houses[i].fly && !isAttractMode) {
                    ctx.fillStyle = '#ffe14d'
                    ctx.fillRect(hx + CELL / 2 - 2, rowMid(HOME_ROW) - 2, 4, 3)
                    ctx.fillStyle = '#ffffff'
                    ctx.fillRect(hx + CELL / 2 - 4, rowMid(HOME_ROW) - 4, 2, 2)
                }
            }

            // ---- river ----
            for (let r = RIVER_TOP; r <= RIVER_BOT; r++) {
                const y = rowMid(r)
                ctx.fillStyle = r % 2 ? '#12406e' : '#103758'
                ctx.fillRect(0, y - CELL / 2, W, CELL)
                ctx.fillStyle = 'rgba(255,255,255,0.07)'
                for (let i = 0; i < COLS; i++) ctx.fillRect(i * CELL + ((r * 7 + i * 11) % 12), y - 2 + (i % 3) * 4, 8, 1)
            }
            riverLanes.forEach((lane, i) => {
                const y = rowMid(RIVER_TOP + i)
                spansOf(lane).forEach(s => {
                    if (s.x > W || s.x + s.w < 0) return
                    if (lane.kind === 'log') drawLog(s.x, s.w, y + CELL / 2)
                    else drawTurtles(s.x, s.w, y + CELL / 2, surfaced(lane))
                })
            })

            // ---- median ----
            ctx.fillStyle = '#2c2c2c'
            ctx.fillRect(0, rowMid(MEDIAN_ROW) - CELL / 2, W, CELL)
            ctx.fillStyle = '#1e7a33'
            ctx.fillRect(0, rowMid(MEDIAN_ROW) - CELL / 2, W, 3)
            ctx.fillRect(0, rowMid(MEDIAN_ROW) + CELL / 2 - 3, W, 3)

            // ---- road ----
            for (let r = ROAD_TOP; r <= ROAD_BOT; r++) {
                const y = rowMid(r)
                ctx.fillStyle = '#232327'
                ctx.fillRect(0, y - CELL / 2, W, CELL)
                ctx.strokeStyle = '#4a4a52'
                ctx.setLineDash([6, 8])
                ctx.beginPath()
                ctx.moveTo(0, y + CELL / 2)
                ctx.lineTo(W, y + CELL / 2)
                ctx.stroke()
                ctx.setLineDash([])
            }
            const carColors = { 6: '#d8d8d8', 7: '#e0483f', 9: '#4f8fe0', 10: '#e0a03f' }
            Object.keys(roadLanes).forEach(r => {
                const lane = roadLanes[r]
                const y = rowMid(Number(r))
                spansOf(lane).forEach(s => {
                    if (s.x > W || s.x + s.w < 0) return
                    drawCar(s.x, s.w, y + CELL / 2, carColors[r] || '#cccccc')
                })
            })

            // ---- start strip ----
            ctx.fillStyle = '#1c3f1c'
            ctx.fillRect(0, rowMid(START_ROW) - CELL / 2, W, CELL)
            ctx.fillStyle = '#2f6b2f'
            for (let i = 0; i < COLS; i++) ctx.fillRect(i * CELL + 4, rowMid(START_ROW) - 2, 10, 3)

            // ---- frog ----
            let fx = frog.x
            let fy = rowMid(frog.row)
            if (frog.animT > 0 && frog.state === 'alive') {
                const p = 1 - frog.animT / HOP_ANIM
                fx = frog.prevX + (frog.x - frog.prevX) * p
                fy = rowMid(frog.prevRow) + (rowMid(frog.row) - rowMid(frog.prevRow)) * p - Math.sin(p * Math.PI) * 8
            }
            if (frog.state === 'alive' || frog.state === 'home') {
                if (frog.state === 'home') {
                    drawFrog(HOUSE_COLS[frog.homeCol] * CELL + CELL / 2, rowMid(HOME_ROW) - 1, 0.8)
                } else {
                    drawFrog(fx, fy, 1)
                }
            } else if (frog.state === 'dying') {
                const p = 1 - frog.deadT / DIE_ANIM
                if (frog.cause === 'car') {
                    ctx.fillStyle = '#5adb5a'
                    ctx.fillRect(frog.x - 12 * p - 2, frog.row === 0 ? 0 : rowMid(frog.row) - 3, 24 * p + 4, 6)
                } else {
                    ctx.strokeStyle = frog.cause === 'time' ? '#ffe14d' : 'rgba(160,210,255,0.9)'
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.arc(frog.x, rowMid(frog.row), 3 + 10 * p, 0, Math.PI * 2)
                    ctx.stroke()
                }
            }

            // ---- HUD ----
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, HUD_H)
            ctx.font = 'bold 8px monospace'
            ctx.textAlign = 'left'
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('SCORE', 6, 9)
            ctx.fillText('HI-SCORE', 6, 21)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(String(score).padStart(6, '0'), 40, 9)
            ctx.fillText(String(Math.max(score, hiScore)).padStart(6, '0'), 60, 21)
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('LEVEL', 110, 9)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(String(level), 142, 9)
            ctx.fillStyle = '#8f8f8f'
            ctx.fillText('TIME', 110, 21)
            const tw = 104
            ctx.fillStyle = '#333333'
            ctx.fillRect(138, 15, tw, 5)
            const frac = Math.max(0, timeLeft / TIME_LIMIT)
            ctx.fillStyle = frac < 0.25 ? '#e0483f' : '#ffe14d'
            ctx.fillRect(138, 15, tw * frac, 5)
            for (let i = 0; i < lives; i++) drawFrog(206 + i * 17, 7, 0.4)

            if (levelFlash > 0 && Math.floor(levelFlash / 15) % 2 === 0) {
                ctx.fillStyle = '#ffe14d'
                ctx.font = 'bold 10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(`LEVEL ${level - 1} COMPLETE  +1000`, W / 2, rowMid(MEDIAN_ROW) + 3)
            }

            if (isAttractMode) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)'
                ctx.fillRect(0, HUD_H, W, H - HUD_H)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#5adb5a'
                ctx.font = 'bold 26px monospace'
                ctx.fillText('FROGGER', W / 2, H / 2 - 34)
                ctx.fillStyle = '#ffffff'
                ctx.font = 'bold 9px monospace'
                ctx.fillText('GET ACROSS. DON\'T GET FLATTENED.', W / 2, H / 2 - 12)
                if (Math.floor(Date.now() / 500) % 2 === 0) {
                    ctx.fillStyle = '#ffe14d'
                    ctx.font = 'bold 11px monospace'
                    ctx.fillText('TAP OR PRESS ANY KEY', W / 2, H / 2 + 26)
                }
                ctx.fillStyle = '#8f8f8f'
                ctx.font = '8px monospace'
                ctx.fillText('HOP ON LOGS  -  AVOID THE TURTLES\' NAPS', W / 2, H / 2 + 48)
            } else if (gameOverFlag) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, HUD_H, W, H - HUD_H)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#e0483f'
                ctx.font = 'bold 20px monospace'
                ctx.fillText('GAME OVER', W / 2, H / 2 - 14)
                ctx.fillStyle = '#ffffff'
                ctx.font = 'bold 9px monospace'
                ctx.fillText(`SCORE ${score}   LEVEL ${level}`, W / 2, H / 2 + 6)
                if (Math.floor(Date.now() / 500) % 2 === 0) {
                    ctx.fillStyle = '#ffe14d'
                    ctx.fillText('TAP OR PRESS ANY KEY', W / 2, H / 2 + 28)
                }
            }
        }

        // ------------------------------------------------------------------
        const startGame = () => {
            isAttractMode = false
            resetGame()
            audioController.playSweep(220, 440, 0.15, 'square', 0.1)
        }

        const handleKeyDown = e => {
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
            if (isAttractMode) { startGame(); return }
            if (gameOverFlag) { startGame(); return }
            if (e.repeat) return

            if (e.code === 'ArrowUp' || e.code === 'Space') hop(0, -1)
            else if (e.code === 'ArrowDown') hop(0, 1)
            else if (e.code === 'ArrowLeft') hop(-1, 0)
            else if (e.code === 'ArrowRight') hop(1, 0)
        }

        const resize = () => {
            if (!containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            if (width === 0 || height === 0) return
            const scale = Math.min(width / W, height / H)
            canvas.style.width = `${Math.floor(W * scale)}px`
            canvas.style.height = `${Math.floor(H * scale)}px`
        }

        if (import.meta.env.DEV) {
            window.__froggerTest = {
                state: () => ({
                    attract: isAttractMode, over: gameOverFlag, score, lives, level,
                    row: frog.row, x: frog.x, frogState: frog.state, time: timeLeft,
                    riding: frog.riding, atHouse: houseAt(frog.x) >= 0 && !houses[houseAt(frog.x)].filled
                }),
                // Read-only "may I step up right now?" — the same predicates the
                // engine applies on landing. A harness reads; only keys act.
                canHopUp: () => frog.state === 'alive' && supportAt(Math.max(0, frog.row - 1), frog.x),
                riverSafe: dx => {
                    if (frog.state !== 'alive' || frog.row < RIVER_TOP || frog.row > RIVER_BOT) return false
                    const nx = frog.x + dx * CELL
                    return nx > CELL / 2 && nx < W - CELL / 2 && supportAt(frog.row, nx)
                },
                hop,
                start: startGame
            }
        }

        const handlePointerDown = () => {
            if (isAttractMode || gameOverFlag) {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))
            }
        }

        const init = () => {
            buildWorld()
            resetFrog()
            resize()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('resize', resize)
            canvas.addEventListener('pointerdown', handlePointerDown)
            canvas.focus()
            animationFrameId = requestAnimationFrame(loop)
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = timestamp => {
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
        init()

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handlePointerDown)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[420px] h-full max-h-[460px] flex items-center justify-center border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'FROGGER')} onResume={handleResume} />}
            </div>
            <VirtualControls visible={!paused} />
        </div>
    )
}

export default FroggerGame

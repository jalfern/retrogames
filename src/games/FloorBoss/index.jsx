// FLOOR BOSS — the arcade shell and painter. The shift rules live in ./sim.js
// (pure, seeded); this file draws it and wires input, audio, the pad, the
// pause screen and the harness hooks.
//
// Look: a control-room blueprint of a night shift — deep navy floor with a
// pale survey grid, amber hazard-stripe walls, a conveyor with running
// chevrons, orange pallet racks, teal hauler plates with a single amber eye,
// and a green shipping pad that pulses when a truck seals. Rush hour bathes
// the whole floor in amber. Vector title: drawn at screen resolution.
//
// The renderer's spatial contract is screen = grid × TILE + origin, so the
// harness can prove every painted robot sits where the sim says.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { createEpisode, saveEpisode, episodeStats } from '../../utils/robot/episode.js'
import { MANIFEST_REV } from '../../utils/robot/assets.js'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell, setTool,
    toggleAuto, clickOrder, hireRobot,
    COLS, ROWS, SHIFT, QUOTA, STRIKES, RACK_COST, ROBOT_COST, RACK_CAP,
    BAY_CELL, OUT_CELLS, ARM_CELL, MAX_ROBOTS,
} from './sim.js'

const SIM_MS = 1000 / 60
const W = 800, H = 520
const TILE = 26
const GX = 10, GY = 44
const PX = (x) => GX + x * TILE
const PY = (y) => GY + y * TILE

const KIND_COLOR = { crate: '#b98a4a', can: '#9fb8c8', coil: '#c07a3e' }

const ITEM_DRAW = {
    // top-down cargo, drawn centered — crate / tin / copper coil
    crate: (ctx, x, y, s = 1) => {
        ctx.fillStyle = '#8a6434'; ctx.fillRect(x - 5 * s, y - 5 * s, 10 * s, 10 * s)
        ctx.fillStyle = '#b98a4a'; ctx.fillRect(x - 4.4 * s, y - 4.4 * s, 8.8 * s, 8.8 * s)
        ctx.strokeStyle = '#e8d9b8'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x, y - 4.4 * s); ctx.lineTo(x, y + 4.4 * s); ctx.stroke()
    },
    can: (ctx, x, y, s = 1) => {
        ctx.fillStyle = '#6e8494'; ctx.beginPath(); ctx.arc(x, y, 4.4 * s, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#c8d8e4'; ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#3e5568'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(x, y, 4.4 * s, 0, Math.PI * 2); ctx.stroke()
    },
    coil: (ctx, x, y, s = 1) => {
        ctx.strokeStyle = '#a05f28'; ctx.lineWidth = 2.6 * s
        ctx.beginPath(); ctx.arc(x, y, 3.6 * s, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = '#e0954e'; ctx.lineWidth = 1.4 * s
        ctx.beginPath(); ctx.arc(x, y, 3.6 * s, 0.5, 3.6); ctx.stroke()
    },
}
const drawItem = (ctx, kind, x, y, s = 1) => (ITEM_DRAW[kind] || ITEM_DRAW.crate)(ctx, x, y, s)

const FB_ATTRACT = [
    'RUN THE NIGHT SHIFT — THE FLOOR IS YOURS',
    'CLICK A BOT, THEN CLICK A RACK TO DISPATCH IT',
    'CLICK BROKEN BOTS REPEATEDLY TO TURBO-REPAIR',
    'JAMMED AISLES: CLICK ONE BOT TO BACK IT OFF',
    'BUILD RACKS ($60) AND HIRE ROBOTS ($150) FROM THE TOP BAR',
    'B CYCLES THE BUILD TOOL · F TOGGLES AUTO-DISPATCH',
    'RUSH HOUR PAYS 1.5x — RUSH ORDERS ALSO RUN COLD',
    'THREE EXPIRED ORDERS AND THE BOSS ENDS YOUR SHIFT',
]

const FloorBossGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.floorbossStage = '1'
        canvas.width = W * 2; canvas.height = H * 2
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.scale(2, 2)

        let gs = makeGame(1337)
        let raf = 0, last = 0, acc = 0
        const ap = createAutopilot()
        let demoSeed = 1337
        let contractSeed = 4242
        const parts = []
        let shake = 0, flash = 0
        const keys = { left: false, right: false, up: false, down: false }
        let edgeA = false, edgeB = false
        let overAt = 0
        let episode = null

        const beginEpisode = () => {
            try {
                episode = createEpisode({ gameId: 'floor-boss', method: 'dpad', seed: gs.seed >>> 0, players: 1, sources: ['human'], task: 'floor-boss-shift', assets: MANIFEST_REV })
            } catch { episode = null }
        }
        const recordTick = () => {
            if (!episode) return
            try {
                episode.addTick([{ left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB }], null, stateHash(gs))
            } catch { episode = null }
        }
        const closeEpisode = (won) => {
            if (!episode) return
            try { saveEpisode(episode.finish({ success: won, score: gs.score, finalHash: stateHash(gs) })) } catch { /* storage */ }
            episode = null
        }

        // HUD chip click zones (canvas space)
        const CHIPS = {
            auto: { x: 512, y: 6, w: 54, h: 28 },
            rack: { x: 572, y: 6, w: 74, h: 28 },
            hire: { x: 652, y: 6, w: 78, h: 28 },
        }
        const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
        const orderRect = (i) => ({ x: 694, y: 46 + i * 74, w: 96, h: 66 })

        const burst = (x, y, n, col, spd = 2, up = -0.6) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * spd
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, t: 0, col, g: 0.1 })
            }
        }

        const handleEvents = (evts, tick) => {
            for (const e of evts) {
                switch (e.type) {
                    case 'order': audioController.playTone(300, 0.05, 'square', 0.04); break
                    case 'armload': audioController.playTone(520, 0.05, 'triangle', 0.05); break
                    case 'pick': audioController.playSweep(440, 760, 0.07, 'square', 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 3, '#ffe9a8', 1); break
                    case 'bay': audioController.playSweep(320, 560, 0.07, 'triangle', 0.05); break
                    case 'stow': audioController.playTone(620, 0.05, 'square', 0.05); audioController.playTone(930, 0.07, 'square', 0.04, 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 4, '#9fe8b4', 1.2); break
                    case 'deliver': audioController.playTone(740, 0.06, 'square', 0.05); break
                    case 'ship': {
                        audioController.playTone(523, 0.08, 'square', 0.07)
                        audioController.playTone(659, 0.08, 'square', 0.07, 0.09)
                        audioController.playTone(784, 0.14, 'square', 0.07, 0.18)
                        fx(`+${e.pay}`, '#5dff8f', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y))
                        burst(PX(OUT_CELLS[1].x) + 13, PY(OUT_CELLS[1].y) + 13, 6, '#9fe8b4', 1.8)
                        break
                    }
                    case 'late': audioController.playTone(400, 0.09, 'sawtooth', 0.06); audioController.playTone(300, 0.12, 'sawtooth', 0.05, 0.09); fx(`+${e.pay} LATE`, '#ffd23f', PX(OUT_CELLS[0].x) + 13, PY(OUT_CELLS[0].y)); break
                    case 'expire': audioController.playSweep(340, 160, 0.22, 'sawtooth', 0.08); shake = 6; flash = 7; fx('EXPIRED', '#ff5a4f', W / 2, 200); break
                    case 'quota': audioController.playFanfare(); fx('QUOTA CLEARED', '#5dff8f', W / 2, 190); break
                    case 'jam': audioController.playTone(140, 0.12, 'square', 0.08); audioController.playNoise(0.06, 0.05); fx('JAM!', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'jamclear': audioController.playSweep(220, 480, 0.09, 'square', 0.05); burst(PX(e.x) + 13, PY(e.y) + 13, 3, '#7ec8ff', 1.2); break
                    case 'jamauto': audioController.playSweep(200, 380, 0.12, 'square', 0.04); break
                    case 'turbo': audioController.playTone(900 + Math.random() * 300, 0.03, 'square', 0.03); break
                    case 'break': audioController.playNoise(0.18, 0.09); audioController.playSweep(300, 90, 0.24, 'sawtooth', 0.07); shake = 7; fx('BREAKDOWN', '#ff5a4f', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'repaired': audioController.playSweep(400, 900, 0.14, 'triangle', 0.06); burst(PX(e.x) + 13, PY(e.y) + 13, 5, '#7ec8ff', 1.5); break
                    case 'build': audioController.playTone(180, 0.1, 'square', 0.07); burst(PX(e.x) + 13, PY(e.y) + 13, 5, '#e0954e', 1.5); break
                    case 'hire': audioController.playTone(480, 0.07, 'square', 0.06); audioController.playTone(600, 0.1, 'square', 0.05, 0.08); break
                    case 'poor': audioController.playTone(120, 0.12, 'square', 0.06); fx('NO BUDGET', '#ff9a4f', PX(e.x) + 13, PY(e.y) + 8); break
                    case 'refuse': audioController.playTone(110, 0.1, 'square', 0.05); break
                    case 'dispatch': audioController.playSweep(500, 700, 0.05, 'square', 0.04); break
                    case 'select': audioController.playTone(660, 0.03, 'sine', 0.04); break
                    case 'prio': audioController.playTone(820, 0.05, 'triangle', 0.05); break
                    case 'auto': audioController.playTone(e.on ? 700 : 420, 0.05, 'square', 0.04); break
                    case 'overflow': audioController.playNoise(0.08, 0.04); if (tick % 3 === 0) fx('BELT FULL', '#ff9a4f', PX(1) + 13, PY(1)); break
                    case 'rush': audioController.playSweep(420, 880, 0.3, 'sawtooth', 0.06); audioController.playSweep(880, 420, 0.3, 'sawtooth', 0.05, 0.3); fx('RUSH HOUR', '#ffd23f', W / 2, 170); break
                    default: break
                }
            }
        }

        const fx = (msg, col, x, y) => { gs.fx.push({ msg, col, x, y, k: 0 }) }

        const finish = () => {
            const won = gs.end === 'win'
            overAt = performance.now()
            setEnd({ won, kind: gs.end, score: gs.score, shipped: gs.shipped, expired: gs.expired, stows: gs.stows, reason: gs.endReason })
            const board = (() => { try { return JSON.parse(localStorage.getItem('floorboss.board') || '[]') } catch { return [] } })()
            if (gs.score > 0) localStorage.setItem('floorboss.board', JSON.stringify([...board, { score: gs.score, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            closeEpisode(won)
            if (won) audioController.playFanfare(); else audioController.playDeath()
            setMode('over')
        }

        const livePad = () => ({ left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB })

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (gs.end) { gs = makeGame(1000 + (++demoSeed % 900)); beginEpisode() }
                step(gs, [ap(gs)])
                handleEvents(gs.ev, gs.tick)
                return
            }
            if (sc !== 'play') return
            step(gs, [livePad()])
            recordTick()
            edgeA = false; edgeB = false
            handleEvents(gs.ev, gs.tick)
            if (gs.end) finish()
        }

        // ---------- painter ----------
        const paintFloor = () => {
            ctx.fillStyle = '#0d1722'; ctx.fillRect(GX, GY, COLS * TILE, ROWS * TILE)
            ctx.strokeStyle = 'rgba(76,120,150,0.14)'; ctx.lineWidth = 1
            for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(GX + x * TILE + 0.5, GY); ctx.lineTo(GX + x * TILE + 0.5, GY + ROWS * TILE); ctx.stroke() }
            for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(GX, GY + y * TILE + 0.5); ctx.lineTo(GX + COLS * TILE, GY + y * TILE + 0.5); ctx.stroke() }
        }

        const paintWalls = () => {
            // hazard stripes around the perimeter
            const dash = 10
            const drawStripe = (x, y, w, h) => {
                ctx.save()
                ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
                ctx.fillStyle = '#171310'; ctx.fillRect(x, y, w, h)
                ctx.strokeStyle = '#c9971f'; ctx.lineWidth = 3.2
                for (let i = -h; i < w + h; i += dash) {
                    ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke()
                }
                ctx.restore()
            }
            drawStripe(0, 0, W - 104, GY - 34)
            drawStripe(GX, GY + ROWS * TILE, W - 104, H - (GY + ROWS * TILE) - 2)
            drawStripe(GX - 8, 10, 8, H - 12)
            drawStripe(GX + COLS * TILE, GY - 34, 8, ROWS * TILE + 36)
        }

        const paintConveyor = (tick) => {
            const y = PY(CONV_ROW_Y())
            ctx.fillStyle = '#1a2731'; ctx.fillRect(PX(0), y, (CONV_X1N + 1) * TILE, TILE)
            ctx.strokeStyle = '#2d4254'; ctx.lineWidth = 1
            ctx.strokeRect(PX(0) + 0.5, y + 0.5, (CONV_X1N + 1) * TILE - 1, TILE - 1)
            ctx.strokeStyle = 'rgba(126,200,255,0.35)'; ctx.lineWidth = 1.6
            const off = (tick * 0.8) % 13
            for (let cx = PX(0) + off; cx < PX(CONV_X1N + 1); cx += 13) {
                ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(cx + 5, y + TILE / 2); ctx.lineTo(cx, y + TILE - 7); ctx.stroke()
            }
            // intake door
            const glow = tick % 50 < 28
            ctx.fillStyle = glow ? '#ff6a3c' : '#7c2f18'
            ctx.beginPath(); ctx.moveTo(GX + 2, y + 4); ctx.lineTo(GX + 12, y + TILE / 2); ctx.lineTo(GX + 2, y + TILE - 4); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#0d1722'; ctx.fillRect(GX + 12, y + 2, 5, TILE - 4)
        }
        const CONV_ROW_Y = () => 1
        const CONV_X1N = 15

        const paintArm = (tick) => {
            const bx = PX(ARM_CELL.x) + TILE / 2, by = PY(ARM_CELL.y) + TILE / 2
            ctx.fillStyle = '#3a4a58'; ctx.beginPath(); ctx.arc(bx, by + 2, 9, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#5f7280'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill()
            // two-link arm reaches toward the bay when loaded, rests otherwise
            const pose = gs.arm.pose
            const restA = -2.2, workA = -0.9
            const ang = restA + (workA - restA) * pose
            const L1 = 16, L2 = 14
            const ex = bx + Math.cos(ang) * L1, ey = by + Math.sin(ang) * L1
            const hx = ex + Math.cos(ang + 1.1 - pose * 0.7) * L2, hy = ey + Math.sin(ang + 1.1 - pose * 0.7) * L2
            ctx.strokeStyle = '#8fa3b0'; ctx.lineWidth = 4
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke()
            ctx.fillStyle = '#c9d4dc'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill()
            // gripper
            ctx.strokeStyle = gs.arm.held ? '#ffd23f' : '#7e8c96'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(hx - 3, hy - 2); ctx.lineTo(hx - 5, hy + 3); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(hx + 3, hy - 2); ctx.lineTo(hx + 5, hy + 3); ctx.stroke()
            if (gs.arm.held) drawItem(ctx, gs.arm.held, hx, hy + 5, 0.9)
            ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(bx, by - 8, 1.8 + Math.sin(tick * 0.1) * 0.5, 0, Math.PI * 2); ctx.fill()
        }

        const paintOutbound = (tick) => {
            for (const o of OUT_CELLS) {
                ctx.fillStyle = '#16301f'; ctx.fillRect(PX(o.x), PY(o.y), TILE, TILE)
                ctx.strokeStyle = 'rgba(93,255,143,0.5)'; ctx.lineWidth = 1.5
                ctx.strokeRect(PX(o.x) + 2, PY(o.y) + 2, TILE - 4, TILE - 4)
            }
            // staging — items stacked at the pad
            gs.staging.slice(0, 8).forEach((k, i) => {
                drawItem(ctx, k, PX(OUT_CELLS[0].x) + 7 + (i % 2) * 12, PY(OUT_CELLS[0].y) + 8 + Math.floor(i / 2) * 11, 0.75)
            })
            const pulse = gs.shipped && tick % 40 < 12
            ctx.fillStyle = pulse ? 'rgba(93,255,143,0.25)' : 'rgba(93,255,143,0.08)'
            ctx.fillRect(PX(OUT_CELLS[0].x) - 4, PY(OUT_CELLS[0].y) + TILE + 2, TILE * 2 + 8, 10)
            ctx.fillStyle = '#7ee0a0'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
            ctx.fillText('SHIPPING', PX(OUT_CELLS[0].x) + TILE, PY(OUT_CELLS[0].y) + TILE + 10)
            ctx.textAlign = 'left'
        }

        const paintRacks = () => {
            for (const r of gs.racks) {
                const x = PX(r.x), y = PY(r.y)
                ctx.fillStyle = '#20303c'; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
                ctx.strokeStyle = '#c96a1f'; ctx.lineWidth = 2
                ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4)
                // shelf lips
                ctx.strokeStyle = 'rgba(224,149,78,0.55)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(x + 3, y + TILE / 2); ctx.lineTo(x + TILE - 3, y + TILE / 2); ctx.stroke()
                r.items.forEach((k, i) => {
                    drawItem(ctx, k, x + 8 + (i % 2) * 10, y + 8 + Math.floor(i / 2) * 10, 0.72)
                })
                if (r.items.length >= RACK_CAP) { ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1) }
            }
        }

        const paintRobots = (tick) => {
            for (const b of gs.robots) {
                const x = PX(b.x) + TILE / 2, y = PY(b.y) + TILE / 2
                ctx.fillStyle = 'rgba(0,0,0,0.3)'
                ctx.beginPath(); ctx.ellipse(x, y + 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill()
                const body = b.broken ? '#5e4a44' : b.jam ? '#c98a2f' : '#2ea8b8'
                const edge = b.broken ? '#3a2c28' : b.jam ? '#7c5217' : '#1c6c78'
                ctx.fillStyle = edge; ctx.fillRect(x - 9, y - 8, 18, 16)
                ctx.fillStyle = body; ctx.fillRect(x - 8, y - 7, 16, 14)
                ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 8, y - 7, 16, 3)
                // wheel nubs
                ctx.fillStyle = '#12262e'
                ctx.fillRect(x - 10, y - 6, 2, 5); ctx.fillRect(x + 8, y - 6, 2, 5)
                ctx.fillRect(x - 10, y + 1, 2, 5); ctx.fillRect(x + 8, y + 1, 2, 5)
                // amber eye toward heading
                const d = [[0, -2], [2.5, 0], [0, 2], [-2.5, 0]][b.dir % 4]
                ctx.fillStyle = b.broken ? '#ff5a4f' : tick % 100 < 5 ? '#fff2a0' : '#ffc23f'
                ctx.beginPath(); ctx.arc(x + d[0], y - 1 + d[1], 2, 0, Math.PI * 2); ctx.fill()
                // status glyphs
                if (b.broken) {
                    ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(x - 4, y - 12); ctx.lineTo(x + 2, y - 12); ctx.stroke()
                    ctx.fillStyle = '#ff5a4f'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('🔧', x + 6, y - 9); ctx.textAlign = 'left'
                } else if (b.jam) {
                    ctx.fillStyle = tick % 24 < 12 ? '#ffd23f' : '#ff9a4f'
                    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                    ctx.fillText('JAM', x, y - 11); ctx.textAlign = 'left'
                }
                if (gs.sel === b.id) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 11.5, y - 10.5, 23, 21) }
                if (b.carry) drawItem(ctx, b.carry, x, y - 14 + Math.sin(tick * 0.12) * 1, 0.85)
            }
        }

        const paintCursor = (tick) => {
            if (screenRef.current !== 'play') return
            const x = PX(gs.cursor.x), y = PY(gs.cursor.y)
            const pulse = 0.55 + Math.sin(tick * 0.18) * 0.3
            ctx.strokeStyle = `rgba(255,210,63,${pulse})`; ctx.lineWidth = 2
            const c = 7
            for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [TILE, 0, -1, 1], [0, TILE, 1, -1], [TILE, TILE, -1, -1]]) {
                ctx.beginPath()
                ctx.moveTo(x + ox + c * sx, y + oy)
                ctx.lineTo(x + ox, y + oy)
                ctx.lineTo(x + ox, y + oy + c * sy)
                ctx.stroke()
            }
            if (gs.tool === 'rack') {
                ctx.globalAlpha = 0.5
                ctx.strokeStyle = '#c96a1f'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4)
                ctx.globalAlpha = 1
            } else if (gs.tool === 'hire') {
                ctx.globalAlpha = 0.6; ctx.fillStyle = '#2ea8b8'
                ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12)
                ctx.globalAlpha = 1
            }
        }

        const paintParticles = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g
                if (p.t > 24) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 24; ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.globalAlpha = 1
            for (let i = gs.fx.length - 1; i >= 0; i--) {
                const f = gs.fx[i]
                if (f.k > 50) { gs.fx.splice(i, 1); continue }
                ctx.globalAlpha = Math.max(0, 1 - f.k / 50)
                ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
                ctx.fillStyle = f.col
                ctx.fillText(f.msg, f.x, f.y - f.k * 0.35)
                ctx.globalAlpha = 1
            }
            ctx.textAlign = 'left'
        }

        const chip = (key, label, active, col) => {
            const r = CHIPS[key]
            ctx.fillStyle = active ? 'rgba(255,210,63,0.16)' : 'rgba(10,16,22,0.85)'
            ctx.fillRect(r.x, r.y, r.w, r.h)
            ctx.strokeStyle = active ? '#ffd23f' : col || '#3a5468'; ctx.lineWidth = 1.2
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
            ctx.fillStyle = active ? '#ffd23f' : col || '#9fc0d8'
            ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
            ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 3)
            ctx.textAlign = 'left'
        }

        const paintHud = (tick) => {
            ctx.fillStyle = 'rgba(8,12,18,0.92)'; ctx.fillRect(0, 0, W, 36)
            ctx.fillStyle = 'rgba(126,200,255,0.12)'; ctx.fillRect(0, 35, W, 1)
            ctx.fillStyle = '#7e9cb0'; ctx.font = 'bold 8px monospace'
            ctx.fillText('THROUGHPUT', 10, 11)
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace'
            ctx.fillText(String(gs.score).padStart(4, '0'), 10, 28)
            ctx.fillStyle = '#5d7284'; ctx.font = 'bold 8px monospace'
            ctx.fillText(`QUOTA ${QUOTA}`, 72, 28)
            // quota bar
            ctx.fillStyle = '#14212c'; ctx.fillRect(72, 8, 120, 8)
            const pct = Math.max(0, Math.min(1, gs.score / QUOTA))
            ctx.fillStyle = pct >= 1 ? '#5dff8f' : '#3d9fd8'
            ctx.fillRect(72, 8, 120 * pct, 8)
            // strike lamps
            for (let i = 0; i < STRIKES; i++) {
                ctx.fillStyle = i < gs.strikes ? '#ff5a4f' : '#2c3a44'
                ctx.beginPath(); ctx.arc(210 + i * 14, 12, 4.5, 0, Math.PI * 2); ctx.fill()
            }
            ctx.fillStyle = '#7e9cb0'; ctx.font = 'bold 7px monospace'
            ctx.fillText('EXPIRED', 204, 28)
            // shift clock
            const left = Math.max(0, Math.ceil((SHIFT - gs.tick) / 60))
            ctx.fillStyle = left < 30 && tick % 20 < 10 ? '#ff5a4f' : '#e8e0d0'
            ctx.font = 'bold 13px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 300, 23)
            ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#7e9cb0'
            ctx.fillText('SHIFT', 300, 9)
            // rush lamp
            const rush = gs.tick % (2700 + 1200) >= 2700
            ctx.fillStyle = rush ? (tick % 30 < 16 ? '#ffd23f' : '#8a6a17') : '#243038'
            ctx.beginPath(); ctx.arc(346, 17, 7, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#7e9cb0'; ctx.font = 'bold 7px monospace'
            ctx.fillText('RUSH', 346, 30)
            ctx.textAlign = 'left'
            chip('auto', gs.auto ? 'AUTO ✓' : 'AUTO', gs.auto, '#5dff8f')
            chip('rack', `RACK $${RACK_COST}`, gs.tool === 'rack', '#e0954e')
            chip('hire', `BOT $${ROBOT_COST}`, gs.tool === 'hire', '#7ec8ff')
        }

        const paintOrders = () => {
            ctx.fillStyle = '#7e9cb0'; ctx.font = 'bold 8px monospace'
            ctx.fillText('ORDERS', 694, 38)
            const open = gs.orders.slice(0, 5)
            open.forEach((o, i) => {
                const r = orderRect(i)
                const late = o.due - gs.tick < 540
                ctx.fillStyle = 'rgba(16,26,36,0.9)'
                ctx.fillRect(r.x, r.y, r.w, r.h)
                ctx.strokeStyle = o.prio ? '#ffd23f' : late ? (gs.tick % 30 < 16 ? '#ff5a4f' : '#5c2f28') : '#2d4254'
                ctx.lineWidth = 1.3
                ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
                o.items.slice(0, 3).forEach((k, j) => drawItem(ctx, k, r.x + 16 + j * 22, r.y + 20, 1))
                const span = o.due - (o.items.length === 1 ? 1800 : 2400)
                const frac = Math.max(0, Math.min(1, (o.due - gs.tick) / (o.due - span)))
                ctx.fillStyle = '#14212c'; ctx.fillRect(r.x + 6, r.y + r.h - 14, r.w - 12, 5)
                ctx.fillStyle = late ? '#ff5a4f' : '#3d9fd8'
                ctx.fillRect(r.x + 6, r.y + r.h - 14, (r.w - 12) * frac, 5)
                ctx.fillStyle = o.prio ? '#ffd23f' : '#5d7284'
                ctx.font = 'bold 6px monospace'
                ctx.fillText(o.prio ? 'PRIORITY' : `#${o.id}`, r.x + 6, r.y + r.h - 4)
            })
        }

        const paintFooter = () => {
            const y = 446
            ctx.fillStyle = 'rgba(8,12,18,0.88)'; ctx.fillRect(0, y, W - 104, H - y)
            gs.robots.forEach((b, i) => {
                const x = 12 + i * 140
                ctx.fillStyle = '#5d7284'; ctx.font = 'bold 7px monospace'
                ctx.fillText(`BOT ${i + 1}`, x, y + 14)
                ctx.fillStyle = '#14212c'; ctx.fillRect(x + 30, y + 8, 60, 6)
                ctx.fillStyle = b.wear > 75 ? '#ff5a4f' : b.wear > 45 ? '#ffd23f' : '#3d9fd8'
                ctx.fillRect(x + 30, y + 8, (60 * b.wear) / 100, 6)
                ctx.fillStyle = b.broken ? '#ff5a4f' : b.jam ? '#ffd23f' : '#7ee0a0'
                ctx.fillText(b.broken ? 'DOWN' : b.jam ? 'JAM' : b.carry ? b.carry.toUpperCase() : b.task === 'idle' ? 'IDLE' : 'MOVING', x + 96, y + 14)
            })
            ctx.fillStyle = '#44586a'; ctx.font = '6.5px monospace'
            ctx.fillText('CLICK BOT THEN RACK = DISPATCH · CLICK DOWN BOT = TURBO FIX · CLICK JAM = BACK OFF · SIMREADY MANIFEST: ' + MANIFEST_REV, 12, y + 34)
            const st = episodeStats()
            if (st.saved) { ctx.fillStyle = '#3d5d72'; ctx.fillText(`PLAICRAFT EPISODES STORED: ${st.saved} (${st.won} won)`, 12, y + 44) }
        }

        const paintRushWash = (tick) => {
            if (gs.tick % (2700 + 1200) < 2700) return
            ctx.fillStyle = `rgba(255,180,40,${0.05 + (tick % 40 < 20 ? 0.03 : 0)})`
            ctx.fillRect(GX, GY, COLS * TILE, ROWS * TILE)
        }

        const paintAttract = (tick) => {
            ctx.fillStyle = 'rgba(6,10,14,0.66)'; ctx.fillRect(0, 0, W, H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            ctx.fillStyle = 'rgba(8,14,20,0.9)'; ctx.fillRect(W / 2 - 170, 90 + bob, 340, 64)
            ctx.strokeStyle = '#c96a1f'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 170, 90 + bob, 340, 64)
            ctx.font = 'bold 28px monospace'
            ctx.fillStyle = '#e0954e'; ctx.fillText('FLOOR', W / 2 - 46, 128 + bob)
            ctx.fillStyle = '#ffd23f'; ctx.fillText('BOSS', W / 2 + 44, 128 + bob)
            ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#7e9cb0'
            ctx.fillText('AUTONOMOUS WAREHOUSE MANAGEMENT · NIGHT SHIFT', W / 2, 146 + bob)
            if (tick % 60 < 40) {
                ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', W / 2, 184)
            }
            const board = (() => { try { return JSON.parse(localStorage.getItem('floorboss.board') || '[]') } catch { return [] } })()
            if (board.length) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 9px monospace'
                ctx.fillText(`BEST SHIFT: ${board[0].score}`, W / 2, 206)
            }
            ctx.textAlign = 'left'
        }

        const paintOver = (tick) => {
            ctx.fillStyle = 'rgba(6,10,14,0.8)'; ctx.fillRect(0, 0, W, H)
            ctx.textAlign = 'center'
            const won = gs.end === 'win'
            ctx.font = 'bold 20px monospace'
            ctx.fillStyle = won ? '#5dff8f' : '#ff5a4f'
            ctx.fillText(won ? 'QUOTA CLEARED' : gs.end === 'fired' ? "YOU'RE FIRED" : 'BELOW QUOTA', W / 2, 130)
            ctx.font = '8px monospace'; ctx.fillStyle = '#7e9cb0'
            ctx.fillText(gs.endReason, W / 2, 150)
            ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#ffffff'
            ctx.fillText(`THROUGHPUT ${gs.score}`, W / 2, 190)
            ctx.font = '8px monospace'; ctx.fillStyle = '#9fc0d8'
            ctx.fillText(`SHIPPED ${gs.shipped} · STOWS ${gs.stows} · EXPIRED ${gs.expired}/${STRIKES}`, W / 2, 210)
            if (tick % 60 < 40) {
                ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY FOR THE NEXT SHIFT', W / 2, 250)
            }
            ctx.textAlign = 'left'
        }

        const paint = () => {
            const tick = gs.tick
            const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            if (shake > 0) shake *= 0.84
            if (shake < 0.3) shake = 0
            ctx.fillStyle = '#060a0e'; ctx.fillRect(0, 0, W, H)
            ctx.save(); ctx.translate(sx, sy)
            paintFloor()
            paintWalls()
            paintConveyor(tick)
            paintOutbound(tick)
            paintRacks()
            paintArm(tick)
            paintRobots(tick)
            paintCursor(tick)
            paintParticles()
            paintRushWash(tick)
            ctx.restore()
            paintHud(tick)
            paintOrders()
            paintFooter()
            if (flash > 0) { ctx.fillStyle = `rgba(255,60,50,${flash / 40})`; ctx.fillRect(0, 0, W, H); flash-- }
            if (screenRef.current === 'attract') paintAttract(tick)
            if (screenRef.current === 'over') paintOver(tick)
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = now
            let dt = now - last
            last = now
            if (dt > 250) dt = 250
            acc += dt
            let n = 0
            while (acc >= SIM_MS && n < 8) {
                acc -= SIM_MS; n++
                if (!pausedRef.current && !contractHoldsLoop()) doSim()
            }
            paint()
        }

        const startPlay = () => {
            gs = makeGame((Math.random() * 2 ** 31) | 0)
            parts.length = 0
            setEnd(null)
            setMode('play')
            beginEpisode()
            audioController.playTone(262, 0.08, 'square', 0.06)
            audioController.playTone(392, 0.08, 'square', 0.06, 0.09)
            audioController.playTone(523, 0.12, 'square', 0.06, 0.18)
        }

        const toGrid = (ev) => {
            const r = canvas.getBoundingClientRect()
            const px = ((ev.clientX - r.left) / r.width) * W
            const py = ((ev.clientY - r.top) / r.height) * H
            return { px, py, gx: Math.floor((px - GX) / TILE), gy: Math.floor((py - GY) / TILE) }
        }

        const onCanvasClick = (ev) => {
            if (screenRef.current !== 'play' || pausedRef.current) return
            const { px, py, gx, gy } = toGrid(ev)
            if (inRect(CHIPS.auto, px, py)) { toggleAuto(gs); return }
            if (inRect(CHIPS.rack, px, py)) { setTool(gs, 'rack'); return }
            if (inRect(CHIPS.hire, px, py)) { hireRobot(gs); return }
            const open = gs.orders.slice(0, 5)
            for (let i = 0; i < open.length; i++) {
                if (inRect(orderRect(i), px, py)) { clickOrder(gs, open[i].id); return }
            }
            gs.cursor.x = Math.max(0, Math.min(COLS - 1, gx))
            gs.cursor.y = Math.max(0, Math.min(ROWS - 1, gy))
            clickCell(gs, gx, gy)
            handleEvents(gs.ev, gs.tick)
        }

        const onKeyDown = (e) => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
            if (e.code === 'Escape' || e.code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (pausedRef.current) return
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over') {
                if (performance.now() - overAt < 600) return
                setMode('attract')
                gs = makeGame(1337)
                return
            }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true
            if (e.code === 'ArrowRight') keys.right = true
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true
            if (e.code === 'Space' || e.code === 'KeyZ') { if (!e.repeat) edgeA = true }
            if (e.code === 'KeyB') { if (!e.repeat) edgeB = true }
            if (e.code === 'KeyF') toggleAuto(gs)
            if (e.code === 'KeyR') setTool(gs, 'rack')
            if (e.code === 'KeyH') hireRobot(gs)
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false
        }
        const onPointerDown = (ev) => {
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over' && performance.now() - overAt > 600) { setMode('attract'); gs = makeGame(1337); return }
            onCanvasClick(ev)
        }

        // ---- contract (QA bots / replays / RL) ----
        const simState = () => {
            const s = state(gs)
            return { ...s, mode: screenRef.current }
        }
        exposeGame({
            id: 'floor-boss',
            method: 'dpad',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            players: 1,
            reset: (seed) => {
                contractSeed = seed >>> 0
                gs = makeGame(contractSeed)
                parts.length = 0
                setEnd(null)
                setMode('play')
                return state(gs)
            },
            tick: (pad) => {
                if (screenRef.current !== 'play') { screenRef.current = 'play'; setMode('play') }
                step(gs, [pad || {}])
                handleEvents(gs.ev, gs.tick)
                if (gs.end && screenRef.current === 'play') finish()
                return state(gs)
            },
            state: simState,
            canvas: () => canvas,
            // no snapshot/restore: the seeded rng is a closure (#391 family)
        })

        // DEV hook
        if (import.meta.env.DEV) {
            window.__floorbossTest = {
                state: simState,
                hash: () => stateHash(gs),
                canvas: () => canvas,
                sim: () => gs,
                step: (n = 1, pad = {}) => { for (let i = 0; i < n; i++) step(gs, [pad]) },
                click: (x, y) => clickCell(gs, x, y),
                press: (code) => onKeyDown({ code, preventDefault() {}, repeat: false }),
                release: (code) => onKeyUp({ code }),
                GX, GY, TILE, W, H,
            }
            mountDbg({
                title: 'FLOOR BOSS',
                getState: () => [
                    `tick ${gs.tick}/${SHIFT} | score ${gs.score}/${QUOTA} strikes ${gs.strikes}/${STRIKES} | ${gs.end || 'running'} ${gs.endReason}`,
                    `shipped ${gs.shipped} stows ${gs.stows} staging [${gs.staging.join('')}] arm ${gs.arm.held || '-'} auto ${gs.auto ? 'on' : 'off'} tool ${gs.tool || '-'}`,
                    gs.robots.map((b, i) => `bot${i + 1} (${b.x},${b.y}) ${b.task.kind}${b.carry ? ' ' + b.carry : ''}${b.broken ? ' DOWN' : ''}${b.jam ? ' JAM' : ''} wear ${Math.round((b.wear / b.wearMax) * 100)}%`).join(' | '),
                ],
                actions: [
                    { label: '+$200 budget', run: () => { gs.score += 200; return '+200' } },
                    { label: 'hire robot', run: () => (hireRobot(gs) ? 'hired' : 'hire refused') },
                    { label: 'break bot 1', run: () => { const b = gs.robots[0]; b.broken = true; b.repair = 600; return 'bot1 down' } },
                    { label: 'force jam', run: () => { if (gs.robots.length > 1) { gs.robots[0].jam = true; gs.robots[1].jam = true; return 'jam armed' } return 'need 2 bots' } },
                    { label: 'spawn order', run: () => { gs.orderT = 0; return 'order due' } },
                    { label: 'fill staging', run: () => { gs.staging.push('crate', 'can', 'coil'); return 'staging stocked' } },
                    { label: 'force quota', run: () => { gs.score = QUOTA; return 'quota armed' } },
                    { label: 'reset', run: () => { gs = makeGame(1337); setMode('attract'); return 'rebooted' } },
                ],
            })
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointerDown)
        raf = requestAnimationFrame(loop)

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointerDown)
            unexposeGame()
            unmountDbg()
            canvas.remove()
            delete window.__floorbossTest
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black select-none">
            <div ref={stageRef} className="relative w-full max-w-[800px] aspect-[800/520]" />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[11px] tracking-widest" ref={setHud('toast')} style={{ color: '#ffd23f', textShadow: '0 1px 0 #000' }} />
            {screen === 'attract' && (
                <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
                    <AttractMessage messages={FB_ATTRACT} ms={2600} className="text-cyan-200/80" />
                </div>
            )}
            {screen === 'over' && end && (
                <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
                    <p className="font-mono text-[11px] text-white/60">
                        {end.won ? 'The dock seals warm and the chargers glow green.' : end.kind === 'fired' ? 'Three cold orders. The warehouse lights go out behind you.' : 'Close, but the quota is the quota. Back tomorrow at dusk.'}
                    </p>
                </div>
            )}
            <VirtualControls secondAction={{ label: 'TOOL', code: 'KeyB' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'FLOOR BOSS')} onResume={handleResume} />}
        </div>
    )
}

export default FloorBossGame

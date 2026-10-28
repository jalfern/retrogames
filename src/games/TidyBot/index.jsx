// TIDY BOT — the arcade shell and painter. The rules live in ./sim.js (pure,
// seeded); this file only draws it and wires input, audio, the pad, the pause
// screen and the harness hooks. Look: a dollhouse cutaway at 320×240 with
// `imageSmoothingEnabled = false` — sage kitchen tile, an oak dining floor,
// cream appliances whose doors really slide, and a little teal caretaker bot
// with a single amber eye.
//
// The renderer's ONLY spatial contract is `screen = world` (no camera): every
// sim coordinate lands on the canvas at the same number, which is what the
// harness samples to prove the drawn robot and cargo sit where the physics
// says they are, after every real keystroke.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    makeGame, step, autopilot, loadLevel, markChores, stateHash,
    VIEW_W, VIEW_H, WALL, COUNTER, STOVE, TABLE, PLANTS, DW, FR, LEVELS,
} from './sim.js'

const SIM_MS = 1000 / 60

const srand = (seed) => {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }
const bgCache = {}
const bgSet = (key, count, fn) => {
    if (bgCache[key]) return bgCache[key]
    const out = []
    const rnd = srand(9931)
    for (let i = 0; i < count; i++) out.push(fn(rnd, i))
    return (bgCache[key] = out)
}

// one household item, centered on (x, y) — cores all mutually distinct so the
// harness can prove each kind is painted exactly where the sim puts it
const drawItem = (ctx, kind, x, y, s = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    if (kind === 'plate') {
        ctx.fillStyle = '#8f9aa5'; circle(ctx, 0, 0, 6.5); ctx.fill()
        ctx.fillStyle = '#f2f0e6'; circle(ctx, 0, 0, 5.5); ctx.fill()
        ctx.strokeStyle = '#3f6fae'; ctx.lineWidth = 1; circle(ctx, 0, 0, 3.8); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle(ctx, -1.6, -1.6, 1.1); ctx.fill()
    } else if (kind === 'cup') {
        ctx.fillStyle = '#a8281e'; circle(ctx, 0, 0, 4.6); ctx.fill()
        ctx.fillStyle = '#e8442e'; circle(ctx, 0, 0, 3.6); ctx.fill()
        ctx.fillStyle = '#7c1c14'; circle(ctx, 0, 0, 2.1); ctx.fill()
        ctx.strokeStyle = '#a8281e'; ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(4.4, 0, 1.9, -Math.PI / 2, Math.PI / 2); ctx.stroke()
    } else if (kind === 'apple') {
        ctx.fillStyle = '#8c1c18'; circle(ctx, 0, 0.5, 4.8); ctx.fill()
        ctx.fillStyle = '#d8342a'; circle(ctx, 0, 0, 4.3); ctx.fill()
        ctx.fillStyle = '#5da83a'; ctx.beginPath(); ctx.ellipse(2.4, -3.4, 2.4, 1.3, -0.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#6c4a20'; ctx.fillRect(-0.6, -5.4, 1.2, 2.4)
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; circle(ctx, -1.5, -1.4, 1); ctx.fill()
    } else {
        ctx.fillStyle = '#2c5f9e'; ctx.fillRect(-3.5, -4.5, 7, 9.5)
        ctx.fillStyle = '#e8ecf2'; ctx.fillRect(-3.5, -4.5, 7, 3.4)
        ctx.fillStyle = '#2c5f9e'
        ctx.beginPath(); ctx.moveTo(-3.5, -4.5); ctx.lineTo(0, -6.6); ctx.lineTo(3.5, -4.5); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#d8b23a'; ctx.fillRect(-1.4, 0.4, 2.8, 2.6)
    }
    ctx.restore()
}

const TIDY_ATTRACT = [
    'A HOUSE ROBOT ON THE NIGHT CHORES — NOTHING LEFT UNTIDY',
    'A OPENS, PLACES, CLOSES — B TOSES, RETRIEVES, STARTS THE WASHER',
    'A CLOSED WASHER REFUSES CARGO — OPEN THE RACK FIRST',
    'CLOSE THE LOADED WASHER, THEN B TO START ITS CYCLE',
    'APPLES IN THE WASHER? WRONG STOW — RESCUE IT AND RE-STOW',
    'TOSS A PLATE ONTO THE TILES AND IT SHATTERS (−40)',
    'GENTLE PLACES PAY TIDY POINTS — THROWN JAMS PAY LESS',
    'EVERY LEVEL IS A MESSIER HOUSE — BEAT THE CLOCK FOR BONUS',
]

const TidyBotGame = () => {
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
        canvas.dataset.tidybotStage = '1'
        canvas.width = VIEW_W * 2; canvas.height = VIEW_H * 2
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.scale(2, 2)

        let gs = makeGame(1337, 1)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0
        let shake = 0, flash = 0
        let contractSeed = 4242
        const parts = []
        const keys = { left: false, right: false, up: false, down: false }
        let edgeA = false, edgeB = false
        const evLog = []
        let overAt = 0

        const burst = (x, y, n, col, spd = 3, up = -1) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * spd
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, t: 0, col, g: 0.14 })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'grab') { audioController.playSweep(500, 820, 0.08, 'square', 0.05); burst(e.x, e.y, 3, '#ffe9a8', 1.2) }
                else if (e.type === 'place') {
                    audioController.playTone(720, 0.06, 'square', 0.06)
                    audioController.playTone(1080, 0.1, 'square', 0.05, 0.06)
                    burst(e.x, e.y, 5, '#9fe8b4', 1.6)
                }
                else if (e.type === 'jam') { audioController.playTone(340, 0.07, 'square', 0.06); audioController.playNoise(0.05, 0.05); burst(e.x, e.y, 3, '#ffd23f', 1.4) }
                else if (e.type === 'wrong') { audioController.playTone(180, 0.14, 'sawtooth', 0.07); shake = 5; flash = 6 }
                else if (e.type === 'spill') { audioController.playNoise(0.1, 0.07); burst(e.x, e.y, 6, '#c8b89a', 2); shake = 3 }
                else if (e.type === 'break') {
                    audioController.playNoise(0.16, 0.09); audioController.playSweep(1500, 320, 0.2, 'triangle', 0.06)
                    shake = 7; flash = 9
                    for (let i = 0; i < 14; i++) {
                        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 1 + Math.random() * 3.2
                        parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col: '#e8eef4', g: 0.2 })
                    }
                }
                else if (e.type === 'open') audioController.playSweep(240, 460, 0.16, 'triangle', 0.05)
                else if (e.type === 'close') { audioController.playTone(150, 0.09, 'sine', 0.09); burst(e.x, e.y, 3, '#b8c2cc', 1.2) }
                else if (e.type === 'start') {
                    audioController.playSweep(120, 300, 0.3, 'triangle', 0.06)
                    audioController.playTone(660, 0.1, 'square', 0.05, 0.12)
                }
                else if (e.type === 'refuse' || e.type === 'clear') audioController.playTone(120, 0.14, 'square', 0.07)
                else if (e.type === 'retrieve') audioController.playSweep(760, 440, 0.09, 'square', 0.05)
                else if (e.type === 'throw') audioController.playSweep(300, 620, 0.09, 'sawtooth', 0.04)
                else if (e.type === 'level') {
                    audioController.playTone(523, 0.1, 'square', 0.07)
                    audioController.playTone(659, 0.1, 'square', 0.07, 0.11)
                    audioController.playTone(784, 0.2, 'square', 0.07, 0.22)
                }
                else if (e.type === 'levelgo') { banner(LEVELS[e.level].name, '#9fe8b4') }
                else if (e.type === 'win') { audioController.playFanfare() }
                else if (e.type === 'over') { audioController.playDeath(); shake = 8; flash = 10 }
            }
        }

        const banner = (msg, col = '#ffd23f') => {
            hudRef.current.toast && (hudRef.current.toast.textContent = msg)
            hudRef.current.toast && (hudRef.current.toast.style.color = col)
            hudRef.current.toastT = 110
        }

        const finish = () => {
            const won = gs.end === 'win'
            overAt = performance.now()
            setEnd({ won, score: gs.score, tidy: gs.tidies, breaks: gs.breaks, wrongs: gs.wrongs, spills: gs.spills, jams: gs.jams, reason: gs.endReason })
            const board = (() => { try { return JSON.parse(localStorage.getItem('tidybot.board') || '[]') } catch { return [] } })()
            if (gs.score > 0) localStorage.setItem('tidybot.board', JSON.stringify([...board, { score: gs.score, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            setMode('over')
        }

        const livePad = () => ({ left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB })

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (demoAt > 120 && gs.end) { gs = makeGame(1337 + (demoAt % 97), 1); demoAt = 0 }
                step(gs, [autopilot(gs)])
                handleEvents(gs.ev)
                demoAt++
                return
            }
            if (sc !== 'play') return
            step(gs, [livePad()])
            edgeA = false; edgeB = false
            handleEvents(gs.ev)
            if (gs.end) finish()
        }

        // ---------------- painter ----------------
        const paintRooms = () => {
            // kitchen: sage checker tile
            ctx.fillStyle = '#b9c2a4'; ctx.fillRect(WALL, WALL, VIEW_W - WALL * 2, VIEW_H - WALL * 2)
            for (let ty = WALL; ty < VIEW_H - WALL; ty += 16) {
                for (let tx = WALL; tx < VIEW_W - WALL; tx += 16) {
                    if (((tx + ty) / 16) % 2 === 0) continue
                    ctx.fillStyle = '#a7b191'; ctx.fillRect(tx, ty, 16, 16)
                }
            }
            // dining: oak planks (right half, below kitchen line)
            ctx.fillStyle = '#9a6a38'; ctx.fillRect(TABLE.x - 20, 100, VIEW_W - WALL - TABLE.x + 20, VIEW_H - WALL - 100)
            for (const p of bgSet('plank', 8, (r) => [TABLE.x - 20 + Math.floor(r() * 140), 104 + Math.floor(r() * 120)])) {
                ctx.fillStyle = 'rgba(120,80,40,0.5)'; ctx.fillRect(p[0], p[1], 24 + (p[1] % 3) * 6, 1)
                ctx.fillStyle = 'rgba(210,160,100,0.25)'; ctx.fillRect(p[0], p[1] + 2, 18, 1)
            }
            ctx.strokeStyle = 'rgba(90,60,30,0.55)'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(TABLE.x - 20, 100); ctx.lineTo(VIEW_W - WALL, 100); ctx.stroke()
            // grout glints
            ctx.fillStyle = 'rgba(255,255,255,0.10)'
            for (const g of bgSet('grout', 26, (r) => [WALL + Math.floor(r() * 28) * 8, WALL + Math.floor(r() * 26) * 8])) ctx.fillRect(g[0], g[1], 1, 1)
            // walls
            ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, 0, VIEW_W, WALL); ctx.fillRect(0, VIEW_H - WALL, VIEW_W, WALL)
            ctx.fillRect(0, 0, WALL, VIEW_H); ctx.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H)
            ctx.fillStyle = '#71492b'
            ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - WALL, VIEW_W, 3)
            ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - WALL, 0, 3, VIEW_H)
        }

        const paintCounter = () => {
            // counter with speckled laminate + steel sink
            ctx.fillStyle = '#7a6a52'; ctx.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h)
            ctx.fillStyle = '#d9d8cc'; ctx.fillRect(COUNTER.x + 1, COUNTER.y + 1, COUNTER.w - 2, COUNTER.h - 2)
            ctx.fillStyle = 'rgba(120,110,90,0.35)'
            for (const s of bgSet('lam', 50, (r) => [COUNTER.x + 2 + Math.floor(r() * (COUNTER.w - 4)), COUNTER.y + 2 + Math.floor(r() * (COUNTER.h - 4))])) ctx.fillRect(s[0], s[1], 1, 1)
            ctx.fillStyle = '#9fb2bd'; ctx.fillRect(122, COUNTER.y + 4, 30, COUNTER.h - 8)
            ctx.fillStyle = '#8aa0ad'; ctx.fillRect(124, COUNTER.y + 6, 26, COUNTER.h - 12)
            ctx.fillStyle = '#c9d6de'; ctx.fillRect(126, COUNTER.y + 7, 8, 2)
            ctx.fillStyle = '#66727c'; ctx.fillRect(136, COUNTER.y + 2, 2, 5)
            // stove
            ctx.fillStyle = '#4c565f'; ctx.fillRect(STOVE.x, STOVE.y, STOVE.w, STOVE.h)
            ctx.fillStyle = '#2e353c'; ctx.fillRect(STOVE.x + 2, STOVE.y + 2, STOVE.w - 4, STOVE.h - 4)
            for (const [ox, oy] of [[7, 6], [20, 6], [7, 15], [20, 15]]) {
                ctx.fillStyle = '#141a1f'; circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.fill()
                ctx.strokeStyle = '#59646e'; ctx.lineWidth = 1; circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.stroke()
            }
            // plants
            for (const p of PLANTS) {
                ctx.fillStyle = '#8a4a2c'; ctx.fillRect(p.x + 1, p.y + 5, p.w - 2, p.h - 5)
                ctx.fillStyle = '#3f7d3a'; circle(ctx, p.x + p.w / 2, p.y + 4, 5); ctx.fill()
                ctx.fillStyle = '#57993f'; circle(ctx, p.x + p.w / 2 - 2, p.y + 2, 2.6); ctx.fill()
            }
        }

        const paintContainer = (c, gs2, tick) => {
            const cc = c.id === 'dw' ? gs2.dw : gs2.fr
            // cavity + rack when open
            const openT = Math.min(1, cc.door)
            ctx.fillStyle = '#3a2c1e'; ctx.fillRect(c.x, c.y, c.w, c.h)
            ctx.fillStyle = c.id === 'dw' ? '#20303c' : '#dfe6de'
            ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4)
            ctx.strokeStyle = c.id === 'dw' ? 'rgba(140,170,190,0.4)' : 'rgba(150,160,150,0.6)'
            ctx.lineWidth = 1
            for (let ry = c.y + 8; ry < c.y + c.h - 4; ry += 8) { ctx.beginPath(); ctx.moveTo(c.x + 4, ry); ctx.lineTo(c.x + c.w - 4, ry); ctx.stroke() }
            // stowed items inside, small
            const inside = gs2.items.filter((it) => it.state === 'in' && it.cont === c.id)
            inside.forEach((it, i) => {
                const ix = c.x + 8 + (i % 3) * 10
                const iy = c.y + 8 + Math.floor(i / 3) * 11
                if (iy < c.y + c.h - 4) drawItem(ctx, it.kind, ix, iy, 0.7)
            })
            // door: slides down over the cavity front
            const dy = c.y + c.h - 2 - (c.h + c.doorLen - 4) * openT
            const dH = (c.h + c.doorLen - 4)
            const body = c.id === 'dw' ? '#b9c4cc' : '#ece6d4'
            const edge = c.id === 'dw' ? '#7e8c96' : '#b0a888'
            if (openT > 0.02) {
                const panelY = c.y + 2 + (c.h + c.doorLen - 4) * openT - (dH - (c.h - 4))
                const py = Math.max(c.y + 2, panelY)
                ctx.globalAlpha = 1
                if (openT >= 0.99) {
                    ctx.fillStyle = edge; ctx.fillRect(c.x, c.y + c.h, c.w, c.doorLen)
                    ctx.fillStyle = body; ctx.fillRect(c.x + 2, c.y + c.h + 2, c.w - 4, c.doorLen - 4)
                    ctx.fillStyle = '#5c6a74'; ctx.fillRect(c.x + c.w / 2 - 7, c.y + c.h + 3, 14, 2.4)
                } else {
                    ctx.fillStyle = edge; ctx.fillRect(c.x, py, c.w, Math.max(6, c.y + c.h - py))
                    ctx.fillStyle = body; ctx.fillRect(c.x + 2, py + 1, c.w - 4, Math.max(4, c.y + c.h - py - 2))
                }
                void dy
            } else {
                // closed face
                ctx.fillStyle = edge; ctx.fillRect(c.x, c.y, c.w, c.h)
                ctx.fillStyle = body; ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4)
                ctx.fillStyle = '#5c6a74'; ctx.fillRect(c.x + c.w / 2 - 7, c.y + 4, 14, 2.4)
                if (c.id === 'dw') {
                    // porthole + program LEDs; the running washer glows and spins
                    ctx.fillStyle = '#1c2c38'; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 8); ctx.fill()
                    if (gs2.dwRun) {
                        const spin = tick * 0.25
                        ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 1.4
                        for (let k = 0; k < 3; k++) {
                            ctx.beginPath()
                            ctx.arc(c.x + c.w / 2, c.y + c.h / 2 + 2, 5.4, spin + k * 2.1, spin + k * 2.1 + 1.4)
                            ctx.stroke()
                        }
                        const glow = ctx.createRadialGradient(c.x + c.w / 2, c.y + c.h / 2 + 2, 1, c.x + c.w / 2, c.y + c.h / 2 + 2, 12)
                        glow.addColorStop(0, 'rgba(126,200,255,0.35)'); glow.addColorStop(1, 'rgba(126,200,255,0)')
                        ctx.fillStyle = glow; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 12); ctx.fill()
                    }
                    for (let k = 0; k < 3; k++) {
                        ctx.fillStyle = gs2.dwRun && tick % 40 < 24 && k === 0 ? '#5dff8f' : gs2.dwRun ? '#2c6a44' : '#2c3a44'
                        ctx.fillRect(c.x + 4 + k * 4, c.y + c.h - 5, 2.4, 2.4)
                    }
                } else {
                    // fridge: ice cube badge
                    ctx.strokeStyle = '#9fc4d8'; ctx.lineWidth = 1
                    ctx.strokeRect(c.x + c.w - 12, c.y + c.h - 12, 7, 7)
                    ctx.beginPath(); ctx.moveTo(c.x + c.w - 8.5, c.y + c.h - 12); ctx.lineTo(c.x + c.w - 8.5, c.y + c.h - 5); ctx.stroke()
                }
            }
            // label tag, below the appliance so the HUD never eats it
            const ty = c.y + c.h + c.doorLen + 2
            ctx.fillStyle = 'rgba(10,8,6,0.55)'; ctx.fillRect(c.x + c.w / 2 - 13, ty, 26, 7)
            ctx.fillStyle = c.id === 'dw' ? '#7ec8ff' : '#a8e6b0'
            ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center'
            ctx.fillText(c.label, c.x + c.w / 2, ty + 5.6)
            ctx.textAlign = 'left'
        }

        const paintTable = () => {
            ctx.fillStyle = '#6e4423'; ctx.fillRect(TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.h + 4)
            ctx.fillStyle = '#8a5a30'; ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h)
            ctx.fillStyle = 'rgba(220,180,130,0.18)'
            for (const g of bgSet('tblgrain', 12, (r) => [TABLE.x + 3 + Math.floor(r() * (TABLE.w - 6)), TABLE.y + 3 + Math.floor(r() * (TABLE.h - 6))])) ctx.fillRect(g[0], g[1], 14, 1)
            // cloth
            ctx.fillStyle = '#c4453a'; ctx.fillRect(TABLE.x + 10, TABLE.y + 8, TABLE.w - 20, TABLE.h - 16)
            ctx.strokeStyle = 'rgba(255,240,230,0.35)'; ctx.lineWidth = 1
            ctx.strokeRect(TABLE.x + 13, TABLE.y + 11, TABLE.w - 26, TABLE.h - 22)
        }

        const drawRobotEye = (facing) => {
            const d = { up: [0, -1.4], down: [0, 1.4], left: [-1.4, 0], right: [1.4, 0] }[facing]
            return d
        }

        const paintRobot = (gs2, tick) => {
            const x = gs2.rx, y = gs2.ry
            const wob = gs2.walk % 16 < 8 ? 0.6 : -0.6
            // shadow
            ctx.fillStyle = 'rgba(0,0,0,0.22)'
            ctx.beginPath(); ctx.ellipse(x, y + 7, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill()
            // treads
            ctx.fillStyle = '#12262e'
            ctx.fillRect(x - 7, y - 6, 3, 12); ctx.fillRect(x + 4, y - 6, 3, 12)
            ctx.fillStyle = '#274652'
            const treadOff = (tick * 1.4) % 4
            for (let t = -6; t < 6; t += 4) {
                const ty = y + t + (treadOff % 4)
                ctx.fillRect(x - 7, ty, 3, 1.4); ctx.fillRect(x + 4, ty, 3, 1.4)
            }
            // chassis
            ctx.fillStyle = '#1d3d4a'; ctx.fillRect(x - 5, y - 5.5 + wob * 0.3, 10, 11)
            ctx.fillStyle = '#5fc8de'; ctx.fillRect(x - 4, y - 4.5 + wob * 0.3, 8, 9)
            ctx.fillStyle = '#8fe0ee'; ctx.fillRect(x - 4, y - 4.5 + wob * 0.3, 8, 2)
            // visor + eye (looks where it walks)
            const d = drawRobotEye(gs2.facing)
            ctx.fillStyle = '#0e2028'; ctx.fillRect(x - 3, y - 2.5 + wob * 0.3, 6, 3.4)
            ctx.fillStyle = tick % 90 < 6 ? '#fff2a0' : '#ffc23f'
            circle(ctx, x + d[0], y - 0.8 + d[1] + wob * 0.3, 1.3); ctx.fill()
            // antenna bob
            ctx.strokeStyle = '#2c5f6e'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 2.5, y - 5); ctx.lineTo(x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 9.5); ctx.stroke()
            ctx.fillStyle = '#ff6a5c'; circle(ctx, x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 10, 1.3); ctx.fill()
            // held item floats over the head with a bob
            const held = gs2.items.find((it) => it.state === 'held')
            if (held) {
                ctx.fillStyle = 'rgba(255,255,255,0.10)'
                circle(ctx, x, y - 16 + Math.sin(tick * 0.1) * 1, 5); ctx.fill()
                drawItem(ctx, held.kind, x, y - 16 + Math.sin(tick * 0.1) * 1, 0.9)
            }
        }

        const paintParticles = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g
                if (p.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 26; ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.globalAlpha = 1
            for (let i = gs.fx.length - 1; i >= 0; i--) {
                const f = gs.fx[i]
                if (f.k > 46) { gs.fx.splice(i, 1); continue }
                ctx.globalAlpha = Math.max(0, 1 - f.k / 46)
                ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
                ctx.fillStyle = f.t === 'ok' ? '#5dff8f' : f.t === 'jam' ? '#ffd23f' : '#ff5a4f'
                ctx.fillText(f.msg, f.x, f.y - f.k * 0.4)
                ctx.globalAlpha = 1
            }
            ctx.textAlign = 'left'
        }

        const paintHud = (gs2, tick) => {
            ctx.fillStyle = 'rgba(16,10,8,0.78)'; ctx.fillRect(0, 0, VIEW_W, 26)
            ctx.fillStyle = 'rgba(255,220,160,0.12)'; ctx.fillRect(0, 25, VIEW_W, 1)
            ctx.font = 'bold 8px monospace'
            ctx.fillStyle = '#c8a06a'; ctx.fillText('SCORE', 6, 8)
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace'
            ctx.fillText(String(gs2.score).padStart(5, '0'), 6, 19)
            // level + clock
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 7px monospace'
            ctx.fillText(`LEVEL ${gs2.level + 1}`, VIEW_W / 2, 8)
            const clockLeft = gs2.clock / LEVELS[Math.min(gs2.level, LEVELS.length - 1)]
            ctx.fillStyle = '#3a2c22'; ctx.fillRect(VIEW_W / 2 - 42, 11, 84, 4)
            ctx.fillStyle = clockLeft < 0.2 ? (tick % 20 < 10 ? '#ff5a4f' : '#7c2f28') : '#e8b04a'
            ctx.fillRect(VIEW_W / 2 - 42, 11, 84 * Math.max(0, clockLeft), 4)
            const m = Math.max(0, Math.ceil(gs2.clock / 60))
            ctx.fillStyle = '#f0e0c0'; ctx.font = 'bold 6px monospace'
            ctx.fillText(`${m}s`, VIEW_W / 2, 22)
            // chores — bottom-right corner, out of the main routes
            ctx.textAlign = 'left'
            ctx.font = '6px monospace'
            let cy = 176
            ctx.fillStyle = 'rgba(16,10,8,0.66)'
            ctx.fillRect(VIEW_W - 74, cy - 6, 70, gs2.chores.length * 8 + 4)
            for (const c of gs2.chores) {
                ctx.fillStyle = c.done ? '#5dff8f' : '#d8c8a8'
                ctx.fillText(`${c.done ? '✔' : '·'} ${c.label}`, VIEW_W - 70, cy)
                cy += 8
            }
            // tidy meter, in the HUD strip's right corner
            const roll = gs2.tidies + gs2.jams + gs2.wrongs + gs2.spills + gs2.breaks
            const pct = roll ? gs2.tidies / roll : 1
            ctx.fillStyle = 'rgba(16,10,8,0.66)'; ctx.fillRect(VIEW_W - 50, 4, 46, 10)
            ctx.fillStyle = '#c8a06a'; ctx.font = 'bold 5px monospace'
            ctx.fillText('TIDY', VIEW_W - 48, 9)
            ctx.fillStyle = '#3a2c22'; ctx.fillRect(VIEW_W - 48, 10, 40, 2.5)
            ctx.fillStyle = pct > 0.75 ? '#5dff8f' : pct > 0.45 ? '#ffd23f' : '#ff5a4f'
            ctx.fillRect(VIEW_W - 48, 10, 40 * pct, 2.5)
        }

        const paintAttract = (tick) => {
            ctx.fillStyle = 'rgba(12,8,5,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            ctx.fillStyle = 'rgba(20,14,9,0.88)'; ctx.fillRect(VIEW_W / 2 - 110, 46 + bob, 220, 46)
            ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = 2; ctx.strokeRect(VIEW_W / 2 - 110, 46 + bob, 220, 46)
            ctx.font = 'bold 22px monospace'
            ctx.fillStyle = '#5fc8de'; ctx.fillText('TIDY', VIEW_W / 2 - 36, 76 + bob)
            ctx.fillStyle = '#ffd23f'; ctx.fillText('BOT', VIEW_W / 2 + 30, 76 + bob)
            ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText('HOUSEHOLD CHORE SERVICE — 24/7', VIEW_W / 2, 88 + bob)
            if (tick % 60 < 40) {
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', VIEW_W / 2, 118)
            }
            const board = (() => { try { return JSON.parse(localStorage.getItem('tidybot.board') || '[]') } catch { return [] } })()
            if (board.length) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 8px monospace'
                ctx.fillText(`BEST ROUND: ${board[0].score}`, VIEW_W / 2, 136)
            }
            ctx.textAlign = 'left'
        }

        const paintOver = (tick) => {
            ctx.fillStyle = 'rgba(12,8,5,0.78)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const won = gs.end === 'win'
            ctx.font = 'bold 16px monospace'
            ctx.fillStyle = won ? '#5dff8f' : '#ff5a4f'
            ctx.fillText(won ? 'HOUSE SPOTLESS!' : 'THE HOUSE WINS', VIEW_W / 2, 84)
            ctx.font = '8px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText(gs.endReason, VIEW_W / 2, 100)
            ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#ffffff'
            ctx.fillText(`SCORE ${gs.score}`, VIEW_W / 2, 126)
            ctx.font = '7px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText(`TIDY ${gs.tidies} · JAMS ${gs.jams} · SPILLS ${gs.spills} · WRONG ${gs.wrongs} · SMASHED ${gs.breaks}`, VIEW_W / 2, 140)
            if (tick % 60 < 40) {
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY TO CLOCK BACK IN', VIEW_W / 2, 168)
            }
            ctx.textAlign = 'left'
        }

        const paint = () => {
            const tick = gs.tick
            const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            if (shake > 0) shake *= 0.84
            if (shake < 0.3) shake = 0
            ctx.save(); ctx.translate(sx, sy)
            paintRooms()
            paintTable()
            paintCounter()
            paintContainer(DW, gs, tick)
            paintContainer(FR, gs, tick)
            // flying cargo draws above furniture
            for (const it of gs.items) {
                if (it.state === 'loose') drawItem(ctx, it.kind, it.x, it.y)
                else if (it.state === 'fly') drawItem(ctx, it.kind, it.x, it.y)
            }
            paintRobot(gs, tick)
            paintParticles()
            ctx.restore()
            paintHud(gs, tick)
            if (flash > 0) { ctx.fillStyle = `rgba(255,60,50,${flash / 40})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); flash-- }
            if (screenRef.current === 'attract') paintAttract(tick)
            if (screenRef.current === 'over') paintOver(tick)
            if (hudRef.current.toastT > 0) { hudRef.current.toastT--; if (hudRef.current.toastT === 0 && hudRef.current.toast) hudRef.current.toast.textContent = '' }
            if (hudRef.current.levelTag) hudRef.current.levelTag.textContent = LEVELS[gs.level].name
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
            gs = makeGame((Math.random() * 2 ** 31) | 0, 1)
            parts.length = 0; gs.fx.length = 0
            setEnd(null)
            setMode('play')
            audioController.playTone(262, 0.08, 'square', 0.06)
            audioController.playTone(392, 0.08, 'square', 0.06, 0.09)
            audioController.playTone(523, 0.12, 'square', 0.06, 0.18)
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
                gs = makeGame(1337, 1)
                return
            }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true
            if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true
            if (e.code === 'Space' || e.code === 'KeyZ') { if (!e.repeat) edgeA = true }
            if (e.code === 'KeyB') { if (!e.repeat) edgeB = true }
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false
            if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false
        }
        const onPointerDown = () => {
            if (screenRef.current === 'attract') startPlay()
            else if (screenRef.current === 'over' && performance.now() - overAt > 600) { setMode('attract'); gs = makeGame(1337, 1) }
        }

        // ---- contract (QA bots / replays / RL) ----
        const simState = () => ({
            tick: gs.tick,
            score: gs.score,
            done: !!gs.end,
            players: 1,
            seed: gs.seed,
            hash: gs.hash,
            level: gs.level,
            clock: gs.clock,
            chores: gs.chores.map((c) => (c.done ? 1 : 0)),
            held: gs.held === null ? '' : gs.items.find((i2) => i2.id === gs.held)?.kind || 'x',
            pos: Math.round(gs.rx * 10) / 10,
            posY: Math.round(gs.ry * 10) / 10,
            dwDoor: Math.round(gs.dw.door * 100) / 100,
            frDoor: Math.round(gs.fr.door * 100) / 100,
            dwRun: gs.dwRun,
            tidy: gs.tidies,
            jams: gs.jams,
            spills: gs.spills,
            wrongs: gs.wrongs,
            breaks: gs.breaks,
            items: gs.items.map((it) => [it.kind, Math.round(it.x), Math.round(it.y), it.state, it.cont || '']),
            endReason: gs.endReason,
        })
        const testState = () => ({ ...simState(), mode: screenRef.current })
        exposeGame({
            id: 'tidy-bot',
            method: 'dpad',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            players: 1,
            reset: (seed) => {
                contractSeed = seed >>> 0
                gs = makeGame(contractSeed, 1)
                parts.length = 0
                setEnd(null)
                setMode('play')
            },
            tick: (pad) => {
                if (screenRef.current !== 'play') {
                    screenRef.current = 'play'
                    setMode('play')
                }
                step(gs, [pad])
                handleEvents(gs.ev)
                if (gs.end && screenRef.current === 'play') finish()
            },
            state: simState,
            canvas: () => canvas,
            snapshot: () => JSON.parse(JSON.stringify({
                seed: gs.seed, tick: gs.tick, score: gs.score, level: gs.level, clock: gs.clock,
                rx: gs.rx, ry: gs.ry, facing: gs.facing, walk: gs.walk, held: gs.held,
                dw: { door: gs.dw.door, target: gs.dw.target, cd: gs.dw.cd },
                fr: { door: gs.fr.door, target: gs.fr.target, cd: gs.fr.cd },
                dwRun: gs.dwRun, opened: { ...gs.opened }, breaks: gs.breaks, wrongs: gs.wrongs, spills: gs.spills, jams: gs.jams, tidies: gs.tidies,
                items: gs.items, auto: gs.auto, end: gs.end, endReason: gs.endReason, levelsDone: gs.levelsDone, timeBonusTotal: gs.timeBonusTotal,
            })),
            restore: (s) => {
                loadLevel(gs, s.level)
                Object.assign(gs, {
                    seed: s.seed >>> 0, tick: s.tick, score: s.score, clock: s.clock,
                    rx: s.rx, ry: s.ry, facing: s.facing, walk: s.walk, held: s.held,
                    dwRun: s.dwRun, opened: { dw: false, fr: false, ...(s.opened || {}) }, breaks: s.breaks, wrongs: s.wrongs, spills: s.spills, jams: s.jams, tidies: s.tidies,
                    end: s.end, endReason: s.endReason || '', levelsDone: s.levelsDone, timeBonusTotal: s.timeBonusTotal,
                })
                gs.dw.door = s.dw.door; gs.dw.target = s.dw.target; gs.dw.cd = s.dw.cd
                gs.fr.door = s.fr.door; gs.fr.target = s.fr.target; gs.fr.cd = s.fr.cd
                gs.auto = { ...s.auto }
                gs.items = s.items.map((it) => ({ ...it }))
                markChores(gs)
                gs.hash = stateHash(gs)
            },
        })

        // DEV hook
        if (import.meta.env.DEV) {
            window.__tidybotTest = {
                state: testState,
                hash: () => gs.hash,
                canvas: () => canvas,
                sim: () => gs,
                step: (n = 1, pad = {}) => { for (let i = 0; i < n; i++) step(gs, [pad]) },
                press: (code) => onKeyDown({ code, preventDefault() {}, repeat: false }),
                release: (code) => onKeyUp({ code }),
                DW, FR, TABLE, COUNTER, VIEW_W, VIEW_H,
            }
            mountDbg({
                title: 'TIDY BOT',
                getState: () => [
                    `tick ${gs.tick} level ${gs.level + 1} | score ${gs.score} clock ${Math.ceil(gs.clock / 60)}s`,
                    `pos ${Math.round(gs.rx)},${Math.round(gs.ry)} held ${gs.held ?? '-'} dw ${Math.round(gs.dw.door * 100)}% fr ${Math.round(gs.fr.door * 100)}% run ${gs.dwRun ? 'on' : 'off'}`,
                    `tidy ${gs.tidies} jam ${gs.jams} spill ${gs.spills} wrong ${gs.wrongs} break ${gs.breaks} | ${gs.end || 'running'} ${gs.endReason}`,
                ],
                actions: [
                    { label: 'open washer', run: () => { gs.dw.target = 1; return 'washer opening' } },
                    { label: 'open fridge', run: () => { gs.fr.target = 1; return 'fridge opening' } },
                    { label: 'spawn plate at bot', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'plate', x: gs.rx, y: gs.ry + 8, vx: 0, vy: 0, state: 'loose', cont: null }); return 'plate @ bot' } },
                    { label: 'apple into washer', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'apple', x: 0, y: 0, vx: 0, vy: 0, state: 'in', cont: 'dw' }); return 'wrong stow armed' } },
                    { label: 'force win', run: () => { for (const it of gs.items) if (it.state === 'loose' || it.state === 'held') it.state = 'gone'; gs.held = null; gs.dwRun = true; gs.dw.target = 0; gs.fr.target = 0; gs.dw.door = 0; gs.fr.door = 0; return 'house armed for clear' } },
                    { label: 'reset', run: () => { gs = makeGame(1337, 1); setMode('attract'); return 'rebooted' } },
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
            delete window.__tidybotTest
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black select-none">
            <div ref={stageRef} className="relative w-full max-w-[720px] aspect-[320/240]" style={{ imageRendering: 'pixelated' }} />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[11px] tracking-widest" ref={setHud('toast')} style={{ color: '#ffd23f', textShadow: '0 1px 0 #000' }} />
            <div className="absolute bottom-1 left-2 font-mono text-[10px] text-amber-200/60 pointer-events-none">
                <span ref={setHud('levelTag')}>KITCHEN / LIGHT DRIZZLE</span> · A: use · B: toss
            </div>
            {screen === 'attract' && (
                <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
                    <AttractMessage messages={TIDY_ATTRACT} ms={2600} className="text-amber-200/80" />
                </div>
            )}
            {screen === 'over' && end && (
                <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
                    <p className="font-mono text-[11px] text-white/60">{end.won ? 'The house signs the timesheet. Five stars.' : 'Dust bunnings everywhere. Try again at dawn.'}</p>
                </div>
            )}
            <VirtualControls secondAction={{ label: 'TOSS', code: 'KeyB' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'TIDY BOT')} onResume={handleResume} />}
        </div>
    )
}

export default TidyBotGame

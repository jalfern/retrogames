// BRITANNIA — the shell. The world itself is the real Ultima IV map, read
// out of ultima4.jsdos at runtime by ./britmap.js (see README). This file is
// loop + camera + lighting + input + HUD + contract; the land is Origin's,
// the pixels and rules here are ours (#1128, milestone 1).
//
// Layout: 1. tile cache (modern procedural + classic EGA-ish shades)
// 2. fixed-timestep sim step (walk/board/gates/day-night) 3. render
// (camera, tiles, gate glow, torchlight, HUD, attract, gate picker)
// 4. input (keys + pointer) 5. DEV hooks + DebugKit + contract
// 6. React shell.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { cycleAttract } from '../../utils/attractLines'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { zipRead, makeWorld, findStars, isSea, MAPW } from './britmap.js'

const SIM_MS = 1000 / 60
const TILE = 32
const VIEW_W = 1280
const VIEW_H = 720
const DAY = 7200
const WALK_CD = 7
const SHIP_CD = 5
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const ATTRACT = [
    'BRITANNIA — the land of the eight virtues',
    'The map is real: walk the Britain of Ultima IV, 1985',
    'Eight moongates stand across the land…',
    '…find them all, and the gates will know your name',
    'Cross the sea in a ship · ride the night by torchlight',
    'Press any key, or tap, to begin the pilgrimage',
]

// per-terrain base colors: 0 sea, 1 grass, 2 marsh, 3 rock, 4 hill, 5 forest,
// 6 heath, 7 plains, 8 coast/sand
const TERR = [
    ['#123a63', '#1a4c7e', '#25639b'],
    ['#27521f', '#316527', '#3d7a31'],
    ['#3d4a24', '#4a5a2c', '#586a37'],
    ['#4c4636', '#5d5744', '#6e6752'],
    ['#54564f', '#666a61', '#787d73'],
    ['#1c3d18', '#264f20', '#316229'],
    ['#46523a', '#556247', '#647354'],
    ['#6d7a3f', '#7f8d4c', '#92a15b'],
    ['#b7a267', '#c9b57a', '#dcc98e'],
]

const hash2 = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function buildTileCaches() {
    const modern = []
    for (let v = 0; v < 9; v++) {
        const c = document.createElement('canvas')
        c.width = TILE; c.height = TILE
        const x = c.getContext('2d')
        const [lo, mid, hi] = TERR[v]
        x.fillStyle = mid
        x.fillRect(0, 0, TILE, TILE)
        for (let py = 0; py < TILE; py += 2) {
            for (let px = 0; px < TILE; px += 2) {
                const n = hash2(px, py, v)
                if (n > 0.72) { x.fillStyle = hi; x.fillRect(px, py, 2, 2) }
                else if (n < 0.24) { x.fillStyle = lo; x.fillRect(px, py, 2, 2) }
            }
        }
        if (v === 5) {
            for (let i = 0; i < 4; i++) {
                const gx = 4 + Math.floor(hash2(i, v, 1) * 20)
                const gy = 4 + Math.floor(hash2(i, v, 2) * 20)
                x.fillStyle = '#12300f'
                x.beginPath(); x.arc(gx, gy, 3.4, 0, 7); x.fill()
                x.fillStyle = '#2c5a22'
                x.beginPath(); x.arc(gx - 1, gy - 1, 2, 0, 7); x.fill()
            }
        }
        if (v === 4) {
            x.strokeStyle = '#8b9186'
            x.lineWidth = 2
            x.beginPath(); x.moveTo(6, 26); x.lineTo(16, 6); x.lineTo(26, 24); x.stroke()
        }
        modern.push(c)
    }
    const classic = []
    const SHADE = ['#00007c', '#00a800', '#005400', '#6c6c6c', '#949494', '#00a800', '#545400', '#a8a800', '#d4c878']
    for (let v = 0; v < 9; v++) {
        const c = document.createElement('canvas')
        c.width = TILE; c.height = TILE
        const x = c.getContext('2d')
        x.fillStyle = SHADE[v]
        x.fillRect(0, 0, TILE, TILE)
        classic.push(c)
    }
    return { modern, classic }
}

const BritanniaGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('loading')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('loading')
    const pausedRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        let dead = false
        const canvas = document.createElement('canvas')
        canvas.width = VIEW_W; canvas.height = VIEW_H
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        const light = document.createElement('canvas')
        light.width = VIEW_W; light.height = VIEW_H
        const lx = light.getContext('2d')

        let world = null, gates = [], tiles = null
        let S = null
        const fresh = (seed = 0) => ({
            seed: seed >>> 0, tick: 0, x: gates[seed % Math.max(1, gates.length)]?.x ?? 93, y: gates[seed % Math.max(1, gates.length)]?.y ?? 67,
            ship: false, cd: 0, visited: gates.length ? new Set([0]) : new Set(),
            sel: 1, gate: -1, done: false, camX: 0, camY: 0,
        })

        const load = async () => {
            const res = await fetch(`${import.meta.env.BASE_URL}games/ultima4.jsdos`)
            const ab = await res.arrayBuffer()
            if (dead) return
            const zip = await zipRead(ab)
            if (dead) return
            world = makeWorld(zip['WORLD.MAP'])
            const st = findStars(world)
            gates = st.gates
            tiles = buildTileCaches()
            S = fresh(0)
            S.camX = S.x * TILE; S.camY = S.y * TILE
            setMode('attract')
        }
        load().catch(() => setMode('error'))

        const tod = () => (S.tick % DAY) / DAY
        const night = () => {
            const t = tod()
            if (t < 0.25) return 0
            if (t < 0.34) return (t - 0.25) / 0.09
            if (t < 0.72) return 1
            if (t < 0.81) return 1 - (t - 0.72) / 0.09
            return 0
        }

        const step = (pad) => {
            S.tick++
            // camera eases toward the player (world px)
            const wx = S.x * TILE, wy = S.y * TILE
            S.camX += (wx - S.camX) * 0.12
            S.camY += (wy - S.camY) * 0.12
            if (S.done) return
            if (S.gate >= 0) {
                const n = gates.length
                const rows = n - 1
                if (pad.up && S.sel > 0) { S.sel--; audioController.playTone(440, 0.04, 'square', 0.1) }
                if (pad.down && S.sel < rows - 1) { S.sel++; audioController.playTone(380, 0.04, 'square', 0.1) }
                for (let i = 0; i < 8; i++) {
                    if (pad['k' + (i + 1)] && i < n && i !== S.gate) { S.sel = i < S.gate ? i : i - 1; pad = { ...pad, a: true } }
                }
                if (pad.a) {
                    const dest = S.sel < S.gate ? S.sel : S.sel + 1
                    if (dest !== S.gate && dest < n) {
                        const g = gates[dest]
                        S.x = g.x; S.y = g.y; S.ship = false
                        S.visited.add(dest)
                        S.gate = -1
                        audioController.playSweep(200, 900, 0.5, 'sine', 0.22)
                        S.toast = 120; S.toastMsg = `The moon gate whirls thee to ${ROMAN[dest]}!`
                        if (S.visited.size >= gates.length) {
                            S.done = true
                            audioController.playSweep(400, 1200, 1.2, 'sine', 0.25)
                            setMode('end')
                        }
                    }
                }
                if (pad.b || pad.start) S.gate = -1
                return
            }
            if (S.cd > 0) { S.cd--; return }
            let dx = 0, dy = 0
            if (pad.left) dx = -1
            else if (pad.right) dx = 1
            else if (pad.up) dy = -1
            else if (pad.down) dy = 1
            if (!dx && !dy) return
            const nx = ((S.x + dx) % MAPW + MAPW) % MAPW
            const ny = ((S.y + dy) % MAPW + MAPW) % MAPW
            const v = world.get(nx, ny)
            if (S.ship) {
                if (!isSea(v)) {
                    S.ship = false; S.x = nx; S.y = ny; S.cd = SHIP_CD
                    audioController.playNoise(0.2, 0.12)
                    S.toast = 90; S.toastMsg = "Thou stepp'st ashore."
                } else { S.x = nx; S.y = ny; S.cd = SHIP_CD }
            } else if (isSea(v)) {
                S.ship = true; S.x = nx; S.y = ny; S.cd = SHIP_CD
                audioController.playSweep(140, 90, 0.5, 'sawtooth', 0.18)
                S.toast = 90; S.toastMsg = 'Aye, a ship! The open sea lies ahead.'
            } else {
                S.x = nx; S.y = ny; S.cd = WALK_CD
                if ((S.tick % 2) === 0) audioController.playTone(90 + (S.tick % 3) * 14, 0.03, 'triangle', 0.06)
            }
            if (!S.ship) {
                const gi = gates.findIndex(g => Math.abs(g.x - S.x) <= 1 && Math.abs(g.y - S.y) <= 1)
                if (gi >= 0 && !S.visited.has(gi)) { S.visited.add(gi); audioController.playSweep(600, 1100, 0.4, 'sine', 0.15) }
                if (gi >= 0 && gi !== S.gate) { S.gate = gi; S.sel = 0 }
            }
        }

        const drawTile = (tx, ty, sx, sy, t) => {
            const v = world.get(tx, ty)
            const sheet = classicOn ? tiles.classic : tiles.modern
            ctx.drawImage(sheet[v < 9 ? v : 8], sx, sy)
            if (v === 0 && !classicOn) {
                const ph = Math.floor(t / 14) % 2
                if (hash2(tx, ty, ph) > 0.82) {
                    ctx.fillStyle = 'rgba(190,225,255,0.5)'
                    ctx.fillRect(sx + 6, sy + 10 + ((tx + ty + ph) % 3) * 4, 12, 2)
                }
            }
        }

        let classicOn = false

        const draw = () => {
            const t = S.tick
            const n = night()
            const camX = S.camX - VIEW_W / 2, camY = S.camY - VIEW_H / 2
            const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE)
            const ox = -(((camX % TILE) + TILE) % TILE), oy = -(((camY % TILE) + TILE) % TILE)
            const cols = VIEW_W / TILE + 2, rows = VIEW_H / TILE + 2
            for (let ry = 0; ry < rows; ry++) {
                for (let rx = 0; rx < cols; rx++) {
                    drawTile(x0 + rx, y0 + ry, ox + rx * TILE, oy + ry * TILE, t)
                }
            }
            // gates: glowing swirls
            for (let i = 0; i < gates.length; i++) {
                const g = gates[i]
                const sx = g.x * TILE - camX, sy = g.y * TILE - camY
                if (sx < -40 || sy < -40 || sx > VIEW_W + 40 || sy > VIEW_H + 40) continue
                const pulse = 0.55 + 0.25 * Math.sin(t / 9 + i)
                ctx.fillStyle = `rgba(120,230,255,${pulse * (0.5 + 0.5 * n)})`
                ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 12 + 2 * Math.sin(t / 7 + i), 0, 7); ctx.fill()
                ctx.strokeStyle = `rgba(240,255,255,${0.5 + 0.4 * n})`
                ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 7, t / 12, t / 12 + 4.6); ctx.stroke()
            }
            // hero / ship
            const px = S.x * TILE - camX + 16, py = S.y * TILE - camY + 16
            const bob = Math.sin(t / 6) * 2
            if (S.ship) {
                ctx.save()
                ctx.translate(px, py + bob * 0.6)
                ctx.rotate(bob * 0.02)
                ctx.fillStyle = '#5a3b1e'
                ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(14, 6); ctx.lineTo(9, 13); ctx.lineTo(-9, 13); ctx.closePath(); ctx.fill()
                ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -12); ctx.stroke()
                ctx.fillStyle = '#e8e0c8'
                ctx.beginPath(); ctx.moveTo(1, -12); ctx.lineTo(12, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill()
                ctx.restore()
            } else {
                ctx.save()
                ctx.translate(px, py + Math.sin(t / 5) * (S.cd > 0 ? 1.2 : 0))
                ctx.fillStyle = '#7a2f2f'
                ctx.beginPath(); ctx.arc(0, -4, 7, Math.PI, 0); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill()
                ctx.fillStyle = '#e8c89a'
                ctx.beginPath(); ctx.arc(0, -5, 3.4, 0, 7); ctx.fill()
                ctx.fillStyle = '#3d1a1a'
                ctx.fillRect(-7, 8, 14, 3)
                ctx.restore()
            }
            // darkness + torchlight
            if (n > 0.02) {
                lx.clearRect(0, 0, VIEW_W, VIEW_H)
                lx.fillStyle = `rgba(6,10,30,${0.72 * n})`
                lx.fillRect(0, 0, VIEW_W, VIEW_H)
                lx.globalCompositeOperation = 'destination-out'
                const fl = 150 + Math.sin(t / 4) * 8 + Math.sin(t / 2.3) * 5
                const gr = lx.createRadialGradient(px, py, 10, px, py, fl)
                gr.addColorStop(0, 'rgba(0,0,0,1)')
                gr.addColorStop(1, 'rgba(0,0,0,0)')
                lx.fillStyle = gr
                lx.fillRect(px - fl, py - fl, fl * 2, fl * 2)
                lx.globalCompositeOperation = 'source-over'
                ctx.drawImage(light, 0, 0)
                const wg = ctx.createRadialGradient(px, py, 0, px, py, fl * 0.8)
                wg.addColorStop(0, `rgba(255,190,90,${0.16 * n})`)
                wg.addColorStop(1, 'rgba(255,190,90,0)')
                ctx.fillStyle = wg
                ctx.fillRect(px - fl, py - fl, fl * 2, fl * 2)
            }
            if (classicOn) {
                ctx.fillStyle = 'rgba(255,255,255,0.14)'
                ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            }
            drawHud(n)
        }

        const drawHud = (n) => {
            ctx.fillStyle = 'rgba(8,10,22,0.78)'
            ctx.fillRect(0, 0, VIEW_W, 46)
            ctx.fillStyle = '#e8d9a0'
            ctx.font = 'bold 20px monospace'
            ctx.fillText('BRITANNIA', 16, 30)
            ctx.font = '15px monospace'
            ctx.fillStyle = '#9fb4d8'
            ctx.fillText(`x:${S.x} y:${S.y}`, 180, 29)
            ctx.fillText(S.ship ? 'SHIP' : 'FOOT', 300, 29)
            const hrs = Math.floor(tod() * 24)
            ctx.fillText(`${String(hrs).padStart(2, '0')}:00 ${n > 0.5 ? 'NIGHT' : 'DAY'}`, 380, 29)
            ctx.fillStyle = '#7fe8ff'
            ctx.fillText(`MOONGATES ${S.visited.size}/${gates.length}`, 540, 29)
            ctx.fillStyle = '#6a7b9a'
            ctx.fillText('C classic · ? help', VIEW_W - 210, 29)
            if (S.toast > 0) {
                S.toast--
                ctx.font = '18px monospace'
                const w = ctx.measureText(S.toastMsg).width
                ctx.fillStyle = 'rgba(8,10,22,0.8)'
                ctx.fillRect(VIEW_W / 2 - w / 2 - 14, VIEW_H - 86, w + 28, 34)
                ctx.fillStyle = '#ffe9a8'
                ctx.fillText(S.toastMsg, VIEW_W / 2 - w / 2, VIEW_H - 63)
            }
        }

        const drawGateMenu = () => {
            ctx.fillStyle = 'rgba(4,6,18,0.72)'
            ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            const bw = 420, bh = 60 + gates.length * 40
            const bx = VIEW_W / 2 - bw / 2, by = VIEW_H / 2 - bh / 2
            ctx.fillStyle = 'rgba(10,14,34,0.95)'
            ctx.fillRect(bx, by, bw, bh)
            ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 2
            ctx.strokeRect(bx, by, bw, bh)
            ctx.fillStyle = '#7fe8ff'
            ctx.font = 'bold 22px monospace'
            ctx.fillText('A MOONGATE WHIRLS', bx + 24, by + 36)
            ctx.font = '17px monospace'
            for (let i = 0; i < gates.length; i++) {
                if (i === S.gate) continue
                const row = by + 64 + (i < S.gate ? i : i - 1) * 40
                const sel = (i < S.gate ? i : i - 1) === S.sel
                ctx.fillStyle = sel ? '#ffd840' : '#9fb4d8'
                ctx.fillText(`${sel ? '> ' : '  '}${ROMAN[i]} — moon gate ${i + 1}${S.visited.has(i) ? '  [visited]' : ''}`, bx + 28, row + 14)
            }
            ctx.fillStyle = '#6a7b9a'
            ctx.font = '14px monospace'
            ctx.fillText('arrows + SPACE choose · number keys jump · B cancel', bx + 28, by + bh - 14)
        }

        const drawAttract = () => {
            const t = attractTick
            const camX = (t * 0.6) % (MAPW * TILE), camY = (t * 0.27) % (MAPW * TILE)
            const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE)
            const ox = -(((camX % TILE) + TILE) % TILE), oy = -(((camY % TILE) + TILE) % TILE)
            for (let ry = 0; ry <= VIEW_H / TILE + 1; ry++) {
                for (let rx = 0; rx <= VIEW_W / TILE + 1; rx++) {
                    drawTile(x0 + rx, y0 + ry, ox + rx * TILE, oy + ry * TILE, t)
                }
            }
            ctx.fillStyle = 'rgba(4,6,18,0.55)'
            ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#e8d9a0'
            ctx.font = 'bold 58px monospace'
            ctx.fillText('B R I T A N N I A', VIEW_W / 2, VIEW_H / 2 - 60)
            ctx.font = '20px monospace'
            ctx.fillStyle = '#7fe8ff'
            ctx.fillText(cycleAttract(t, ATTRACT), VIEW_W / 2, VIEW_H / 2 + 4)
            ctx.fillStyle = '#ffe9a8'
            ctx.font = '16px monospace'
            if ((t / 30) % 2 < 1.2) ctx.fillText('PRESS ANY KEY · TAP TO SET FORTH', VIEW_W / 2, VIEW_H / 2 + 80)
            ctx.textAlign = 'left'
        }

        const drawEnd = () => {
            ctx.fillStyle = '#04061288'
            ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#7fe8ff'
            ctx.font = 'bold 40px monospace'
            ctx.fillText('THE EIGHT GATES RECOGNIZE THEE', VIEW_W / 2, VIEW_H / 2 - 40)
            ctx.fillStyle = '#e8d9a0'
            ctx.font = '18px monospace'
            ctx.fillText('Hail, Avatar. Britannia knows thy patience.', VIEW_W / 2, VIEW_H / 2 + 10)
            ctx.fillStyle = '#ffe9a8'
            ctx.fillText('SPACE to walk the land again', VIEW_W / 2, VIEW_H / 2 + 70)
            ctx.textAlign = 'left'
        }

        let raf = 0, last = 0, acc = 0, attractTick = 0

        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            if (!S) return
            const dt = Math.min(now - last, 250)
            last = now
            if (screenRef.current === 'attract') attractTick++
            if (!pausedRef.current && screenRef.current === 'play') {
                acc += dt
                while (acc >= SIM_MS) {
                    acc -= SIM_MS
                    if (!contractHoldsLoop()) step(padNow)
                    S.cd = Math.max(0, S.cd - 0)
                }
            }
            if (screenRef.current === 'attract') { drawAttract(); return }
            draw()
            if (S.gate >= 0) drawGateMenu()
            if (screenRef.current === 'end') drawEnd()
        }

        // --- input ---
        const held = new Set()
        const padNow = new Proxy({}, {
            get: (_t, k) => held.has(k),
            has: (_t, k) => held.has(k),
        })
        const KEYS = {
            ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
            KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
            Space: 'a', KeyZ: 'b', Enter: 'start', Escape: 'start',
            Digit1: 'k1', Digit2: 'k2', Digit3: 'k3', Digit4: 'k4',
            Digit5: 'k5', Digit6: 'k6', Digit7: 'k7', Digit8: 'k8',
        }
        const startGame = () => {
            S = fresh()
            setMode('play')
        }
        const onKey = (e) => {
            if (screenRef.current === 'attract' || screenRef.current === 'end') { startGame(); return }
            if (screenRef.current !== 'play' && screenRef.current !== 'loading') return
            if (e.key === '?' || e.key === '`' || (e.key === 'Escape' && screenRef.current === 'play' && S && S.gate < 0)) {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                e.preventDefault()
                return
            }
            if (e.key === 'c' || e.key === 'C') { classicOn = !classicOn; return }
            const f = KEYS[e.code]
            if (f) { held.add(f); e.preventDefault() }
        }
        const onKeyUp = (e) => { const f = KEYS[e.code]; if (f) held.delete(f) }
        const onTap = (e) => {
            if (screenRef.current === 'attract' || screenRef.current === 'end') { startGame(); return }
            if (!S || screenRef.current !== 'play') return
            const rect = canvas.getBoundingClientRect()
            const mx = (e.clientX - rect.left) / rect.width * VIEW_W
            const my = (e.clientY - rect.top) / rect.height * VIEW_H
            if (S.gate >= 0) {
                const bw = 420, bh = 60 + gates.length * 40
                const bx = VIEW_W / 2 - bw / 2, by = VIEW_H / 2 - bh / 2
                const row = Math.floor((my - (by + 46)) / 40)
                if (row >= 0 && row < gates.length - 1) {
                    S.sel = row; held.add('a'); setTimeout(() => held.delete('a'), 50)
                } else if (mx < bx || mx > bx + bw || my < by || my > by + bh) {
                    held.add('b'); setTimeout(() => held.delete('b'), 50)
                }
                return
            }
            const dxm = mx - VIEW_W / 2, dym = my - VIEW_H / 2
            if (Math.abs(dxm) + Math.abs(dym) < 40) { held.add('a'); setTimeout(() => held.delete('a'), 50); return }
            held.add(Math.abs(dxm) > Math.abs(dym) ? (dxm > 0 ? 'right' : 'left') : (dym > 0 ? 'down' : 'up'))
            setTimeout(() => held.delete('left'), 140)
            setTimeout(() => held.delete('right'), 140)
            setTimeout(() => held.delete('up'), 140)
            setTimeout(() => held.delete('down'), 140)
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onTap)

        // --- DEV hooks + contract ---
        if (import.meta.env.DEV) {
            exposeGame({
                id: 'britannia',
                buttons: ['up', 'down', 'left', 'right', 'a'],
                reset: (seed = 0) => { if (S) { S = fresh(seed >>> 0); setMode('play'); } return exports_state() },
                tick: (pad) => { if (S) step(pad); return exports_state() },
                state: exports_state,
                canvas: () => canvas,
            })
            function exports_state() {
                if (!S) return { tick: 0, score: 0, done: false, ready: false }
                return {
                    tick: S.tick, score: S.visited.size, done: S.done, ready: true, seed: S.seed,
                    hash: ((S.x * 256 + S.y) * 31 + S.visited.size * 7 + (S.ship ? 1 : 0) + S.gate * 997) >>> 0,
                    x: S.x, y: S.y, ship: S.ship, gate: S.gate,
                    gates: gates.map(g => [g.x, g.y]), tod: tod(),
                }
            }
            window.__britanniaTest = {
                state: exports_state,
                step: n => { for (let i = 0; i < n; i++) step({}) },
                press: (k) => { held.add(k) },
                release: (k) => { held.delete(k) },
                teleport: i => { const g = gates[i]; if (g) { S.x = g.x; S.y = g.y; S.visited.add(i); if (S.visited.size >= gates.length) S.done = true } },
                setTime: t => { S.tick = t },
            }
            mountDbg({
                title: 'BRITANNIA',
                getState: () => exports_state().ready ? [`pos ${S.x},${S.y} ${S.ship ? 'SHIP' : 'FOOT'}`, `tod ${tod().toFixed(2)}`, `gates ${S.visited.size}/${gates.length}`, `done ${S.done}`] : ['loading…'],
                actions: [
                    { label: 'to gate I', run: () => { S.x = gates[0].x; S.y = gates[0].y } },
                    { label: 'night', run: () => { S.tick = Math.floor(DAY * 0.5) } },
                    { label: 'all gates', run: () => { gates.forEach((g, i) => S.visited.add(i)); S.done = true; setMode('end') } },
                ],
            })
        }

        raf = requestAnimationFrame(now => { last = now; raf = requestAnimationFrame(frame) })
        return () => {
            dead = true
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onKeyUp)
            canvas.remove()
            if (import.meta.env.DEV) { if (window.__britanniaTest) delete window.__britanniaTest; unmountDbg(); unexposeGame() }
        }
    }, [setMode])

    const play = screen === 'play'
    return (
        <div ref={stageRef} className="relative w-full h-full bg-black">
            {screen === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center text-[#e8d9a0] font-mono tracking-widest">
                    UNROLLING THE MAP OF BRITANNIA…
                </div>
            )}
            {screen === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 font-mono">
                    The map could not be read. Refresh to try again.
                </div>
            )}
            {screen === 'end' && <div />}
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'BRITANNIA')} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '✕', code: 'KeyZ' }} />
        </div>
    )
}

export default BritanniaGame

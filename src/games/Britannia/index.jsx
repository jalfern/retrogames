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
import { WX, WX_NAME, weatherAt, flashAt, flashOnset, isFrozen } from './weather.js'
import { AMB, AMB_NAME, AMB_CELL, ambientAt, flockOf, flightOf, progressOf } from './ambient.js'
import { faceFor, walkFrame, drawAvatar } from './avatar.js'
import { WARP_LEN, warpFlash, warpRing, warpMotes, warpSwapAt } from './warp.js'
import { TERR, hash2, TILE, SUB, blockShades } from './tiles.js'
import { PHASES, moonPhase, moonName, phaseLit } from './moons.js'

const SIM_MS = 1000 / 60
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

function buildTileCaches() {
    // classic (C) mode is a flat EGA stamp per terrain. The modern look is NOT
    // cached: it shades each tile live from the world-continuous field so the
    // land never shows a repeating tile pattern (#1146).
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
    return { classic }
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
            face: 'down', anim: 0, dismissed: -1,
            sel: 1, gate: -1, done: false, camX: 0, camY: 0, wx: WX.CLEAR, fl: 0, thunder: -1,
            amb: AMB.NONE, warp: null,
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
        const coastAt = (x, y) => isSea(world.get(x, y)) &&
            (!isSea(world.get(x + 1, y)) || !isSea(world.get(x - 1, y)) || !isSea(world.get(x, y + 1)) || !isSea(world.get(x, y - 1)))
        const ambAt = (x, y, tick, seed) => {
            const cx = Math.floor(x / AMB_CELL) * AMB_CELL + AMB_CELL / 2
            const cy = Math.floor(y / AMB_CELL) * AMB_CELL + AMB_CELL / 2
            const v = world.get(cx, cy)
            return ambientAt(cx, cy, v, coastAt(cx, cy), tick, seed)
        }
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
            const sky = weatherAt(S.x, S.y, S.tick, S.seed)
            if (sky !== S.wx) {
                S.wx = sky
                if (sky === WX.RAIN) { S.toast = 110; S.toastMsg = 'Rain sweeps low over the moor.'; audioController.playNoise(0.35, 0.07) }
                else if (sky === WX.SNOW) { S.toast = 110; S.toastMsg = 'Snow drifts down from the north.'; audioController.playTone(520, 0.5, 'sine', 0.05) }
                else if (sky === WX.STORM) { S.toast = 110; S.toastMsg = 'A storm gathers over the land.'; audioController.playSweep(90, 45, 1, 'sawtooth', 0.12) }
            }
            if ((S.wx === WX.RAIN || S.wx === WX.STORM) && (S.tick % 42) === 0) audioController.playNoise(0.14, 0.04)
            S.fl = flashAt(S.x, S.y, S.tick, tod(), S.seed)
            if (flashOnset(S.x, S.y, S.tick, tod(), S.seed)) S.thunder = S.tick + 26
            if (S.thunder === S.tick) { audioController.playNoise(0.7, 0.2); audioController.playSweep(72, 28, 0.9, 'sawtooth', 0.14) }
            const amb = ambAt(S.x, S.y, S.tick, S.seed)
            if (amb !== S.amb) {
                S.amb = amb
                if (amb === AMB.BIRD) { audioController.playTone(2280 + (S.tick % 7) * 90, 0.06, 'sine', 0.045); audioController.playTone(2980 + (S.tick % 5) * 60, 0.05, 'sine', 0.03) }
                else if (amb === AMB.FISH) audioController.playNoise(0.14, 0.05)
            }
            // camera eases toward the player (world px)
            const wx = S.x * TILE, wy = S.y * TILE
            S.camX += (wx - S.camX) * 0.12
            S.camY += (wy - S.camY) * 0.12
            // a warp in flight: the Avatar is held in the swirl, movement is
            // frozen, and the position swaps on the single hidden peak frame —
            // the one frame the white-out is full, so the jump is never seen
            if (S.warp) {
                const age = S.tick - S.warp.t0
                if (!S.warp.swapped && warpSwapAt(age)) {
                    const g = gates[S.warp.dest]
                    S.x = g.x; S.y = g.y; S.ship = false
                    S.warp.swapped = true
                    S.visited.add(S.warp.dest)
                    audioController.playSweep(200, 900, 0.5, 'sine', 0.22)
                    S.toast = 120; S.toastMsg = `The moon gate whirls thee to ${ROMAN[S.warp.dest]} of ${moonName(S.warp.dest)}!`
                    if (S.visited.size >= gates.length) {
                        S.done = true
                        audioController.playSweep(400, 1200, 1.2, 'sine', 0.25)
                        setMode('end')
                    }
                }
                if (age >= WARP_LEN) S.warp = null
                return
            }
            if (S.done) return
            if (S.gate >= 0) {
                const n = gates.length
                const rows = n - 1
                if (pad.up && S.sel > 0) { S.sel--; audioController.playTone(440, 0.04, 'square', 0.1) }
                if (pad.down && S.sel < rows - 1) { S.sel++; audioController.playTone(380, 0.04, 'square', 0.1) }
                for (let i = 0; i < 8; i++) {
                    if (pad['k' + (i + 1)] && i < n && i !== S.gate) { S.sel = i < S.gate ? i : i - 1; audioController.playTone(360, 0.04, 'square', 0.1); pad = { ...pad, a: true } }
                }
                if (pad.a) {
                    const dest = S.sel < S.gate ? S.sel : S.sel + 1
                    if (dest !== S.gate && dest < n) {
                        // a warp begins: the teleport itself is deferred to the
                        // white-out peak (the step() warp block) so the journey
                        // is seen as a swirl + flash, not an instant cut (#1135)
                        S.warp = { dest, t0: S.tick, swapped: false }
                        S.gate = -1
                        audioController.playSweep(150, 130, 0.32, 'sawtooth', 0.13)
                    }
                }
                if (pad.b || pad.start) { S.dismissed = S.gate; S.gate = -1 }
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
                    S.face = faceFor(dx, dy); S.anim++
                    audioController.playNoise(0.2, 0.12)
                    S.toast = 90; S.toastMsg = "Thou stepp'st ashore."
                } else { S.x = nx; S.y = ny; S.cd = SHIP_CD }
            } else if (isSea(v)) {
                S.ship = true; S.x = nx; S.y = ny; S.cd = SHIP_CD
                S.face = faceFor(dx, dy); S.anim++
                audioController.playSweep(140, 90, 0.5, 'sawtooth', 0.18)
                S.toast = 90; S.toastMsg = 'Aye, a ship! The open sea lies ahead.'
            } else {
                S.x = nx; S.y = ny; S.cd = WALK_CD
                S.face = faceFor(dx, dy); S.anim++
                if ((S.tick % 2) === 0) audioController.playTone(90 + (S.tick % 3) * 14, 0.03, 'triangle', 0.06)
            }
            if (!S.ship) {
                const gi = gates.findIndex(g => Math.abs(g.x - S.x) <= 1 && Math.abs(g.y - S.y) <= 1)
                if (gi >= 0 && !S.visited.has(gi)) { S.visited.add(gi); audioController.playSweep(600, 1100, 0.4, 'sine', 0.15) }
                if (gi < 0) S.dismissed = -1
                if (gi >= 0 && gi !== S.gate && gi !== S.dismissed) { S.gate = gi; S.sel = 0 }
            }
        }

        const drawTile = (tx, ty, sx, sy, t) => {
            const v = world.get(tx, ty)
            const vv = v < 9 ? v : 8
            if (classicOn) { ctx.drawImage(tiles.classic[vv], sx, sy); return }
            // modern: shade each 16px block from the world-continuous field so
            // the land is soft, continuous terrain — no static, no tile repeat
            const [lo, mid, hi] = TERR[vv]
            const bs = TILE / SUB
            const sh = blockShades(tx, ty)
            for (let by = 0; by < SUB; by++) for (let bx = 0; bx < SUB; bx++) {
                const s = sh[by * SUB + bx]
                ctx.fillStyle = s === 2 ? hi : s === 0 ? lo : mid
                ctx.fillRect(sx + bx * bs, sy + by * bs, bs, bs)
            }
            if (v === 5) {
                // forest canopy, keyed to the world tile so it never repeats
                for (let i = 0; i < 4; i++) {
                    const gx = sx + 4 + Math.floor(hash2(tx * 5 + i, ty * 5 + i, 1) * 24)
                    const gy = sy + 4 + Math.floor(hash2(tx * 5 + i, ty * 5 + i, 2) * 24)
                    ctx.fillStyle = '#12300f'; ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, 7); ctx.fill()
                    ctx.fillStyle = '#2c5a22'; ctx.beginPath(); ctx.arc(gx - 1, gy - 1, 2, 0, 7); ctx.fill()
                }
            }
            if (v === 0) {
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
            // ambient life: birds wheel over the moors, fish break at sea (#1135)
            if (!classicOn) drawAmbient(t, camX, camY)
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
                ctx.translate(px, py)
                drawAvatar(ctx, S.face, walkFrame(S.anim, S.cd > 0), S.cd > 0 ? Math.sin(t / 5) * 1.2 : 0)
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
            const wet = S.wx === WX.RAIN ? 0.1 : S.wx === WX.SNOW ? 0.12 : S.wx === WX.STORM ? 0.22 : 0
            if (wet > 0) {
                ctx.fillStyle = `rgba(28,40,62,${wet})`
                ctx.fillRect(0, 0, VIEW_W, VIEW_H)
                drawPrecip(t)
            }
            if (S.fl > 0) {
                ctx.fillStyle = `rgba(226,238,255,${0.55 * S.fl})`
                ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            }
            if (S.warp) {
                const age = S.tick - S.warp.t0
                const wf = warpFlash(age)
                if (wf > 0) { ctx.fillStyle = `rgba(226,246,255,${(0.92 * wf).toFixed(3)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H) }
                const ring = warpRing(age)
                if (ring) {
                    ctx.save()
                    ctx.translate(px, py)
                    for (let k = 0; k < 3; k++) {
                        ctx.strokeStyle = `rgba(150,235,255,${(ring.a * (1 - k * 0.22)).toFixed(3)})`
                        ctx.lineWidth = 3 - k * 0.7
                        ctx.beginPath()
                        ctx.arc(0, 0, ring.r * (0.55 + 0.24 * k), S.tick / 8 + k * 2.1, S.tick / 8 + k * 2.1 + 4.4)
                        ctx.stroke()
                    }
                    for (const m of warpMotes(age, S.warp.dest, S.seed)) {
                        ctx.fillStyle = `rgba(198,246,255,${m.a.toFixed(3)})`
                        ctx.beginPath(); ctx.arc(m.x, m.y, m.sz, 0, 7); ctx.fill()
                    }
                    ctx.restore()
                }
            }
            drawHud(n)
        }

        const drawPrecip = (t) => {
            const storm = S.wx === WX.STORM
            if (S.wx === WX.SNOW) {
                ctx.fillStyle = 'rgba(240,246,255,0.85)'
                const n = storm ? 120 : 90
                for (let i = 0; i < n; i++) {
                    const fx = (((hash2(i, 3, 1) * VIEW_W + Math.sin(t / 22 + i) * 18 - S.camX * 0.2) % VIEW_W) + VIEW_W) % VIEW_W
                    const fy = (hash2(i, 7, 2) * VIEW_H + t * (0.8 + hash2(i, 11, 3) * 0.7)) % VIEW_H
                    ctx.beginPath(); ctx.arc(fx, fy, 1.6 + (i % 3) * 0.5, 0, 7); ctx.fill()
                }
                return
            }
            const n = storm ? 130 : 110
            ctx.strokeStyle = `rgba(170,200,235,${storm ? 0.4 : 0.3})`
            ctx.lineWidth = storm ? 1.6 : 1.2
            const slant = storm ? 7 : 3
            ctx.beginPath()
            for (let i = 0; i < n; i++) {
                const rx = (((hash2(i, 5, 1) * VIEW_W - S.camX * 0.3) % VIEW_W) + VIEW_W) % VIEW_W
                const ry = (hash2(i, 9, 2) * VIEW_H + t * (storm ? 16 : 12)) % VIEW_H
                ctx.moveTo(rx, ry); ctx.lineTo(rx - slant, ry + 14)
            }
            ctx.stroke()
        }

        const drawAmbient = (t, camX, camY) => {
            const seed = S ? S.seed : 0
            const c0 = Math.floor(camX / (AMB_CELL * TILE)) - 1
            const r0 = Math.floor(camY / (AMB_CELL * TILE)) - 1
            const c1 = Math.floor((camX + VIEW_W) / (AMB_CELL * TILE)) + 1
            const r1 = Math.floor((camY + VIEW_H) / (AMB_CELL * TILE)) + 1
            for (let cy = r0; cy <= r1; cy++) {
                for (let cx = c0; cx <= c1; cx++) {
                    const wx = cx * AMB_CELL + AMB_CELL / 2, wy = cy * AMB_CELL + AMB_CELL / 2
                    const kind = ambAt(wx, wy, t, seed)
                    if (!kind) continue
                    const bx = cx * AMB_CELL * TILE + AMB_CELL * TILE / 2 - camX
                    const by = cy * AMB_CELL * TILE + AMB_CELL * TILE / 2 - camY
                    const f = flockOf(wx, wy, t, seed)
                    if (kind === AMB.BIRD) {
                        const p = progressOf(t)
                        const off = flightOf(wx, wy, t, seed) * 220
                        const seen = Math.sin(Math.PI * p)
                        const mid = (f.n - 1) / 2
                        for (let i = 0; i < f.n; i++) {
                            const vx = bx + off + (i - mid) * 13 * f.dir
                            const vy = by - 46 - f.lift - Math.abs(i - mid) * 5 + Math.sin(t / 23 + cx + i) * 4
                            const flap = Math.sin(t / 3.2 + i * 1.7) * 2.6
                            ctx.strokeStyle = `rgba(14,16,26,${0.45 + 0.4 * seen})`
                            ctx.lineWidth = 2
                            ctx.beginPath()
                            ctx.moveTo(vx - 5, vy - flap)
                            ctx.quadraticCurveTo(vx, vy + flap * 0.8, vx + 5, vy - flap)
                            ctx.stroke()
                        }
                    } else if (kind === AMB.FISH) {
                        for (let i = 0; i < 2; i++) {
                            const jp = progressOf(t) * 1.6 - i * 0.35
                            if (jp <= 0 || jp >= 1) continue
                            const arc = Math.sin(Math.PI * jp)
                            const fx = bx + (i - 0.5) * 34 + f.dir * arc * 26
                            ctx.save()
                            ctx.translate(fx, by + 4 - arc * 16)
                            ctx.rotate(f.dir * (0.9 - arc * 1.6))
                            ctx.fillStyle = 'rgba(190,214,235,0.85)'
                            ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.4, 0, 0, 7); ctx.fill()
                            ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-10, -3); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill()
                            ctx.restore()
                            ctx.strokeStyle = `rgba(210,235,255,${0.5 * arc})`
                            ctx.lineWidth = 1.5
                            ctx.beginPath(); ctx.ellipse(fx, by + 6, 8 + arc * 10, 2.6 + arc * 2, 0, 0, 7); ctx.stroke()
                        }
                    }
                }
            }
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
            ctx.fillStyle = S.wx === WX.STORM ? '#e0a060' : S.wx === WX.SNOW ? '#e8f2ff' : S.wx === WX.RAIN ? '#7fb0e0' : '#9fb4d8'
            ctx.fillText(WX_NAME[S.wx], VIEW_W - 290, 29)
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
            const ph = moonPhase(S.tick)
            ctx.fillStyle = '#7fe8ff'
            ctx.font = 'bold 22px monospace'
            ctx.fillText('A MOONGATE WHIRLS', bx + 24, by + 36)
            const lit = phaseLit(ph)
            ctx.beginPath(); ctx.arc(bx + bw - 32, by + 29, 9, 0, Math.PI * 2)
            ctx.fillStyle = '#2a3455'; ctx.fill()
            ctx.beginPath(); ctx.arc(bx + bw - 32, by + 29, 9 * lit, 0, Math.PI * 2)
            ctx.fillStyle = '#e8e2c8'; ctx.fill()
            ctx.font = '13px monospace'
            ctx.fillStyle = '#8fa6c8'
            ctx.textAlign = 'right'
            ctx.fillText(`the ${PHASES[ph]} rules the sky`, bx + bw - 48, by + 34)
            ctx.textAlign = 'left'
            ctx.font = '17px monospace'
            for (let i = 0; i < gates.length; i++) {
                if (i === S.gate) continue
                const row = by + 64 + (i < S.gate ? i : i - 1) * 40
                const sel = (i < S.gate ? i : i - 1) === S.sel
                ctx.fillStyle = sel ? '#ffd840' : '#9fb4d8'
                ctx.fillText(`${sel ? '> ' : '  '}${ROMAN[i]} — ${moonName(i)} moon${S.visited.has(i) ? '  [visited]' : ''}`, bx + 28, row + 14)
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
            drawAmbient(t, camX, camY)
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
                    taps.clear()
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
        const taps = new Set()
        const padNow = new Proxy({}, {
            get: (_t, k) => held.has(k) || taps.has(k),
            has: (_t, k) => held.has(k) || taps.has(k),
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
            if (f) {
                held.add(f)
                taps.add(f)
                e.preventDefault()
            }
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
                const inBox = mx >= bx && mx <= bx + bw && my >= by && my <= by + bh
                if (inBox && row >= 0 && row < gates.length - 1) {
                    S.sel = row; taps.add('a')
                } else if (!inBox) {
                    taps.add('b')
                }
                return
            }
            const dxm = mx - VIEW_W / 2, dym = my - VIEW_H / 2
            if (Math.abs(dxm) + Math.abs(dym) < 40) { taps.add('a'); return }
            taps.add(Math.abs(dxm) > Math.abs(dym) ? (dxm > 0 ? 'right' : 'left') : (dym > 0 ? 'down' : 'up'))
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
                    face: S.face, frame: walkFrame(S.anim, S.cd > 0), anim: S.anim,
                    gates: gates.map(g => [g.x, g.y]), tod: tod(),
                    weather: WX_NAME[S.wx], frozen: isFrozen(S.y), flash: S.fl > 0,
                    ambient: AMB_NAME[S.amb],
                    warping: !!S.warp, warpFlash: S.warp ? warpFlash(S.tick - S.warp.t0) : 0, warpDest: S.warp ? S.warp.dest : -1,
                    moon: moonPhase(S.tick),
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
                getState: () => exports_state().ready ? [`pos ${S.x},${S.y} ${S.ship ? 'SHIP' : 'FOOT'}`, `tod ${tod().toFixed(2)}`, `wx ${WX_NAME[S.wx]}`, `gates ${S.visited.size}/${gates.length}`, `done ${S.done}`] : ['loading…'],
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
            {/* the pad chrome bar is pointer-events-auto across the full width; on a
                phone its footprint covers the moongate menu rows, so taps meant for a
                destination died on the bar. Scope-transparent here (never in the shared
                component): the gaps between pad buttons fall through to the canvas. */}
            <style>{`[data-vc="1"]{pointer-events:none}[data-vc="dpad"],[data-vc="actzone"],[data-vc="diag"]{pointer-events:auto}`}</style>
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

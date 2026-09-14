// IRONKEEP — a first-person shooter on a software raycaster.
//
// Why Wolf3D and not Doom/Quake: Wolf's world is a 2D grid of unit-height cells, so
// the whole renderer is DDA + a depth buffer, which is achievable (and debuggable) in
// one sitting. Doom needs BSP trees and sector heights, Quake needs true perspective
// polygons. Everything here follows that shape:
//
//   floor/ceiling cast (per row)  ->  walls (per column, DDA)  ->  billboards
//   (depth-tested against the wall columns)  ->  first-person weapon  ->  status bar.
//
// The framebuffer is a 320x200 ImageData upscaled with nearest-neighbour, exactly the
// Wolf3D resolution. All distance shading is table-driven (see art.shadeTable) because
// per-pixel arithmetic at 64k pixels/frame is what makes JS raycasters crawl.

import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { buildArt, toCanvas, drawText, textWidth, rng } from './art'
import { LEVELS, WALL_TEX } from './levels'

const RW = 320            // internal render width (Wolf3D)
const RH = 200            // internal render height
const HUD_H = 40          // status bar, drawn with vector ops under the view
const VH = RH + HUD_H
const FOV = 0.72          // camera plane length (~73deg)
const FOG = 13            // tiles to full dark
const EYE = 0.5           // eye height in tiles
const R = 0.28            // player collision radius
const FIXED_DT = 1000 / 60

const CSS = {
    bone: '#ddd0ad', gold: '#d8a72c', goldL: '#f6d97a', red: '#e0554a', redD: '#6d1a1e',
    white: '#f2f0ea', dim: '#8a8fa4', iron: '#22242f', ironL: '#3a3d4d', green: '#7fbf5f',
    ember: '#ff8a2b', violet: '#9b62c4',
}

// ---- enemy archetypes -------------------------------------------------------
const KINDS = {
    grunt: { hp: 14, speed: 1.75, sight: 13, range: 9.5, cool: 1.25, score: 100, fire: 'bolt', r: 0.34, hold: 3.2 },
    hound: { hp: 10, speed: 3.15, sight: 13, range: 0.85, cool: 0.85, score: 80, fire: 'bite', r: 0.3, hold: 0 },
    mage: { hp: 22, speed: 1.5, sight: 15, range: 12, cool: 1.9, score: 220, fire: 'fire', r: 0.34, hold: 4.5 },
    boss: { hp: 220, speed: 1.75, sight: 22, range: 16, cool: 1.05, score: 3000, fire: 'fire3', r: 0.55, hold: 0 },
}

const WEAPONS = [
    { name: 'CROSSBOW', cool: 0.42, dmg: 9, spread: 0.012, ammo: 1, kind: 'hitscan' },
    { name: 'REPEATER', cool: 0.13, dmg: 6, spread: 0.055, ammo: 1, kind: 'hitscan' },
    { name: 'LANCER', cool: 0.85, dmg: 26, spread: 0.01, ammo: 4, kind: 'lob' },
]

const IronKeepGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const [screen, setScreen] = React.useState('attract')
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const bossAliveRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        audioController.startMusic(bossAliveRef.current ? 'siege' : 'keep')
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext('2d')
        canvas.width = RW
        canvas.height = VH
        ctx.imageSmoothingEnabled = false

        // ------------------------------------------------------------ assets
        const art = buildArt()
        const weaponCanvas = {}
        for (const k of Object.keys(art.weapons)) weaponCanvas[k] = toCanvas(art.weapons[k])
        const flashCanvas = toCanvas(art.flash)
        // "hot" (pain-flash) copy of every sprite: blown-out red, used for 2 frames.
        for (const name of Object.keys(art.sprites)) {
            for (const key of Object.keys(art.sprites[name].variants)) {
                const v = art.sprites[name].variants[key]
                const hot = new Uint32Array(v.p.length)
                for (let i = 0; i < v.p.length; i++) {
                    if (!v.p[i]) continue
                    const r = Math.min(255, ((v.p[i] & 255) * 1.5 + 110) | 0)
                    const g = ((v.p[i] >> 8) & 255) * 0.5 | 0
                    const b = ((v.p[i] >> 16) & 255) * 0.4 | 0
                    hot[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
                }
                v.hot = hot
            }
        }

        const img = ctx.createImageData(RW, RH)
        const buf = new Uint32Array(img.data.buffer)
        const zbuf = new Float32Array(RW)
        const wallTex = {}
        for (const ch of Object.keys(WALL_TEX)) wallTex[ch] = art.textures[WALL_TEX[ch]]
        const floorTex = art.textures.floor
        const ceilTex = art.textures.ceil

        // ------------------------------------------------------------- state
        let li = 0                     // level index
        let W = 0, HH = 0             // level dims
        let grid = []                  // char rows (geometry + wall texture key)
        let doors = []                 // {x,y,lock,open,target}
        const doorAt = new Map()       // y*W+x -> door
        let enemies = [], props = [], shots = [], parts = []
        let field = null               // BFS distance field to the player
        let px = 2, py = 2, pang = 0
        let health = 100, ammo = 20, lives = 3, score = 0, kills = 0, killTotal = 0
        let weapon = 0
        const owned = [true, false, false]
        const keys = { G: false, I: false }
        let mode = 'attract'           // attract | play | dying | dead | clear | win
        let cool = 0, kick = 0, flash = 0, shake = 0, hurtT = 0, dieT = 0, clearT = 0
        let bob = 0, bobAmp = 0, flick = 0, clock = 0, msgT = 0, msg = ''
        let frameMs = 0, frameN = 0, frameMax = 0
        let frozen = false               // harness: stop the loop, drive update() by hand
        let rand = rng(1337)

        const input = {
            fwd: 0, turn: 0, strafe: 0, fire: false, queued: false, use: false, run: false,
        }

        // ----------------------------------------------------------- helpers
        // `at` takes a *world* position and returns its tile — it floors, so every
        // caller can pass px/py directly. (Passing 16.5 un-floored into grid[y][x]
        // is how tryDoors once threw a few hundred times a second.)
        const at = (x, y) => {
            const cx = x | 0, cy = y | 0
            return (cx < 0 || cy < 0 || cx >= W || cy >= HH) ? ' ' : grid[cy][cx]
        }
        const doorOf = (x, y) => doorAt.get((y | 0) * W + (x | 0))
        // Doors block sight/movement until they slide open; 'X' (exit) always blocks.
        const isSolid = (x, y) => {
            const c = at(x, y)
            if (c === '.' || c === undefined) return false
            if (c === 'D' || c === 'L' || c === 'G') {
                const d = doorOf(x, y)
                return !d || d.open < 0.98
            }
            return true
        }
        function say(t) { msg = t; msgT = 2.6 }

        let eid = 0                    // stable ids so the harness can track one enemy
        function loadLevel(i, keep) {
            li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length
            const L = LEVELS[li]
            W = L.w; HH = L.h
            grid = L.rows.slice()
            doors = L.doors.map(d => ({ ...d, open: 0, target: 0 }))
            doorAt.clear()
            for (const d of doors) doorAt.set(d.y * W + d.x, d)
            enemies = L.props.filter(p => KINDS[p.t]).map(p => ({
                kind: p.t, ...KINDS[p.t], x: p.x, y: p.y, hp: KINDS[p.t].hp,
                id: ++eid, state: 'idle', t: 0, cool: rand() * 0.8, flash: 0, ang: 0, sink: 0,
                awake: false, clear: false, moving: false,
            }))
            props = L.props.filter(p => !KINDS[p.t]).map(p => ({ kind: p.t, x: p.x, y: p.y, gone: false, bob: rand() * 6 }))
            shots = []; parts = []
            px = L.start.x; py = L.start.y; pang = L.start.a
            killTotal = enemies.length
            kills = 0
            field = new Int16Array(W * HH)
            fieldTick = 0
            health = 100
            if (!keep) { ammo = 20; lives = 3; score = 0; owned[0] = true; owned[1] = false; owned[2] = false; keys.G = false; keys.I = false; weapon = 0 }
            else if (weapon === 2 && !owned[2]) weapon = 0
            cool = 0; kick = 0; flash = 0; shake = 0; hurtT = 0; dieT = 0; clearT = 0
            bossAliveRef.current = enemies.some(e => e.kind === 'boss')
            say(L.hint)
        }

        // ------------------------------------------------------ collision
        // Axis-separated grid collision: slide along walls instead of sticking.
        // Three probes per axis (centre + both edges of the body radius), so a
        // diagonal can never clip a corner into a neighbouring cell.
        function move(ent, dx, dy, r) {
            if (dx) {
                const cx = (ent.x + dx + Math.sign(dx) * r) | 0
                if (!isSolid(cx, ent.y | 0) && !isSolid(cx, (ent.y - r) | 0) && !isSolid(cx, (ent.y + r) | 0)) ent.x += dx
            }
            if (dy) {
                const cy = (ent.y + dy + Math.sign(dy) * r) | 0
                if (!isSolid(ent.x | 0, cy) && !isSolid((ent.x - r) | 0, cy) && !isSolid((ent.x + r) | 0, cy)) ent.y += dy
            }
        }

        // The player lives in scalars (the renderer reads them every frame), so
        // collision runs against a tiny proxy that writes back into px/py.
        const proxy = { x: 0, y: 0 }
        function movePlayer(dx, dy) {
            proxy.x = px; proxy.y = py
            move(proxy, dx, dy, R)
            const mx = proxy.x - px, my = proxy.y - py
            px = proxy.x; py = proxy.y
            return { mx, my }
        }

        // Doors: pushing on one opens it (if unlocked). Returns true if it opened.
        function tryDoors(x, y) {
            let opened = false
            const ox = x | 0, oy = y | 0
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const tx = ox + dx, ty = oy + dy
                const c = at(tx, ty)
                if (c !== 'D' && c !== 'L' && c !== 'G') continue
                const d = doorOf(tx, ty)
                if (!d || d.open > 0.01) continue
                if (Math.hypot(tx + 0.5 - px, ty + 0.5 - py) > 1.5) continue
                if (d.lock === 'G' && !keys.G) { say('THE GOLD KEY IS LACKING'); sfx('locked'); continue }
                if (d.lock === 'I' && !keys.I) { say('THE IRON KEY IS LACKING'); sfx('locked'); continue }
                if (d.lock === 'L' && !keys.I) { say('THE IRON KEY IS LACKING'); sfx('locked'); continue }
                d.target = 1; opened = true; sfx('door')
                if (d.lock === 'G') say('THE GOLD KEY TURNS')
                if (d.lock === 'L') say('THE IRON KEY TURNS')
            }
            return opened
        }

        // ---------------------------------------------------------- line of sight
        function los(x0, y0, x1, y1) {
            const dx = x1 - x0, dy = y1 - y0
            const n = Math.ceil(Math.hypot(dx, dy) / 0.12)
            for (let i = 1; i < n; i++) {
                const t = i / n
                if (isSolid((x0 + dx * t) | 0, (y0 + dy * t) | 0)) return false
            }
            return true
        }

        // Distance to the first solid tile along a ray (DDA), for hitscan + sparks.
        function castDist(ox, oy, dx, dy, max) {
            let mapX = ox | 0, mapY = oy | 0
            const ddx = Math.abs(dx) < 1e-9 ? 1e9 : Math.abs(1 / dx)
            const ddy = Math.abs(dy) < 1e-9 ? 1e9 : Math.abs(1 / dy)
            const stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1
            let sdx = dx < 0 ? (ox - mapX) * ddx : (mapX + 1 - ox) * ddx
            let sdy = dy < 0 ? (oy - mapY) * ddy : (mapY + 1 - oy) * ddy
            for (let i = 0; i < 200; i++) {
                let dist
                if (sdx < sdy) { dist = sdx; sdx += ddx; mapX += stepX } else { dist = sdy; sdy += ddy; mapY += stepY }
                if (dist > max) return max
                if (isSolid(mapX, mapY)) return dist
            }
            return max
        }

        const NBX = [1, -1, 0, 0, 1, 1, -1, -1]
        const NBY = [0, 0, 1, -1, 1, -1, 1, -1]

        // ------------------------------------------------------------- AI field
        // BFS from the player over walkable tiles. Enemies then walk downhill, which
        // gives genuine corridor pathing (greedy steering gets stuck on every corner).
        let fieldTick = 0
        const Q = new Int32Array(4096)
        function buildField() {
            field.fill(32767)
            const sx = px | 0, sy = py | 0
            if (sx < 0 || sy < 0 || sx >= W || sy >= HH) return
            let head = 0, tail = 0
            field[sy * W + sx] = 0
            Q[tail++] = sy * W + sx
            while (head < tail && tail < Q.length) {
                const c = Q[head++]
                const cx = c % W, cy = (c / W) | 0
                const d = field[c] + 1
                for (let k = 0; k < 4; k++) {
                    const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0)
                    const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0)
                    if (nx < 0 || ny < 0 || nx >= W || ny >= HH) continue
                    const ch = grid[ny][nx]
                    if (ch !== '.' && ch !== 'D') continue     // locked doors stop the horde
                    const i = ny * W + nx
                    if (field[i] <= d) continue
                    field[i] = d
                    Q[tail++] = i
                }
            }
        }

        // --------------------------------------------------------------- audio
        function sfx(kind, vol = 1) {
            const a = audioController
            if (!a.ctx) return
            switch (kind) {
                case 'fire': a.playNoise(0.07, 0.16 * vol); a.playSweep(340, 120, 0.09, 'square', 0.1 * vol); break
                case 'rep': a.playNoise(0.045, 0.11 * vol); a.playSweep(520, 200, 0.05, 'square', 0.07 * vol); break
                case 'lob': a.playNoise(0.16, 0.2 * vol); a.playSweep(160, 60, 0.3, 'sawtooth', 0.16 * vol); break
                case 'hit': a.playTone(620, 0.05, 'square', 0.12 * vol); break
                case 'crit': a.playTone(880, 0.06, 'square', 0.14 * vol); a.playTone(1320, 0.05, 'square', 0.08 * vol); break
                case 'kill': a.playSweep(300, 70, 0.3, 'sawtooth', 0.16 * vol); a.playNoise(0.22, 0.14 * vol); break
                case 'pain': a.playSweep(260, 80, 0.28, 'sawtooth', 0.22 * vol); break
                case 'bite': a.playSweep(180, 60, 0.16, 'square', 0.2 * vol); a.playNoise(0.1, 0.16 * vol); break
                case 'door': a.playSweep(90, 190, 0.45, 'triangle', 0.14 * vol); a.playNoise(0.3, 0.05 * vol); break
                case 'locked': a.playTone(120, 0.16, 'square', 0.16 * vol); a.playTone(90, 0.2, 'square', 0.12 * vol); break
                case 'pick': a.playTone(660, 0.06, 'square', 0.12 * vol); a.playTone(990, 0.09, 'square', 0.1 * vol); break
                case 'gun': a.playNoise(0.05, 0.09 * vol); a.playSweep(240, 90, 0.1, 'square', 0.07 * vol); break
                case 'empty': a.playTone(150, 0.05, 'square', 0.1 * vol); break
                case 'power': a.playFanfare(); break
                case 'death': a.playDeath(); break
                default: break
            }
        }

        // --------------------------------------------------------------- combat
        function spawnParts(x, y, z, n, kind, spd) {
            for (let i = 0; i < n; i++) {
                const a = rand() * Math.PI * 2
                const s = (0.4 + rand()) * spd
                parts.push({ kind, x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (0.6 + rand() * 1.8) * spd, t: 0.35 + rand() * 0.5 })
            }
        }

        function hurtEnemy(e, dmg, hx, hy) {
            if (e.state === 'dead') return
            e.hp -= dmg
            e.flash = 0.12
            e.state = 'pain'
            e.t = 0.16
            e.awake = true
            if (e.hp <= 0) {
                e.state = 'dead'; e.t = 0; e.sink = 0
                kills++
                score += e.score
                sfx('kill', Math.max(0.25, 1 - Math.hypot(e.x - px, e.y - py) / 14))
                spawnParts(e.x, e.y, 0.4, 7, 'blood', 1.6)
                if (e.kind === 'boss') { shake = Math.max(shake, 7); say('THE WARDEN FALLS'); sfx('power') }
            } else {
                sfx(rand() < 0.25 ? 'crit' : 'hit', Math.max(0.25, 1 - Math.hypot(e.x - px, e.y - py) / 14))
                spawnParts(hx ?? e.x, hy ?? e.y, 0.5, 3, 'blood', 1.2)
                // gunfire and pain bring the neighbours
                for (const o of enemies) {
                    if (o !== e && o.state !== 'dead' && Math.hypot(o.x - e.x, o.y - e.y) < 9) { o.awake = true; if (o.state === 'idle') { o.state = 'active'; o.t = 0 } }
                }
            }
        }

        function shoot() {
            const wp = WEAPONS[weapon]
            if (cool > 0) return
            if (ammo < wp.ammo) { sfx('empty'); say('NOT SO MUCH AS A BOLT'); cool = 0.35; return }
            ammo -= wp.ammo
            cool = wp.cool
            kick = 1
            flash = 0.075
            shake = Math.max(shake, wp.kind === 'lob' ? 4 : 1.6)
            sfx(weapon === 2 ? 'lob' : weapon === 1 ? 'rep' : 'fire')

            const spread = (rand() - 0.5) * wp.spread
            const dx = Math.cos(pang + spread), dy = Math.sin(pang + spread)

            if (wp.kind === 'lob') {
                shots.push({ x: px + dx * 0.4, y: py + dy * 0.4, dx, dy, sp: 7.5, dmg: wp.dmg, kind: 'fire', foe: false, t: 0 })
                return
            }
            const wall = castDist(px, py, dx, dy, 22)
            let best = null, bestT = wall
            for (const e of enemies) {
                if (e.state === 'dead') continue
                const ex = e.x - px, ey = e.y - py
                const t = ex * dx + ey * dy
                if (t <= 0.2 || t > bestT) continue
                const perp = Math.abs(ex * dy - ey * dx)
                if (perp > e.r + 0.06) continue
                best = e; bestT = t
            }
            if (best) {
                const crit = rand() < 0.14
                hurtEnemy(best, wp.dmg * (crit ? 2 : 1), px + dx * bestT, py + dy * bestT)
            } else {
                spawnParts(px + dx * (wall - 0.05), py + dy * (wall - 0.05), 0.5, 3, 'spark', 1.1)
            }
            // discharge wakes whoever can hear it
            for (const e of enemies) {
                if (e.state === 'idle' && Math.hypot(e.x - px, e.y - py) < 11) { e.awake = true; e.state = 'active'; e.t = 0 }
            }
        }

        function hurt(dmg) {
            if (mode !== 'play') return
            health -= dmg
            hurtT = 1
            shake = Math.max(shake, 3)
            sfx('pain')
            if (health <= 0) {
                health = 0
                mode = 'dying'
                dieT = 0
                audioController.stopMusic()
                sfx('death')
            }
        }

        // ------------------------------------------------------------- pickups
        function collect(p) {
            p.gone = true
            switch (p.kind) {
                case 'potion': health = Math.min(100, health + 25); say('HEALING DRAUGHT'); sfx('pick'); break
                case 'bolts': ammo = Math.min(250, ammo + 14); say('A QUIVER OF BOLTS'); sfx('pick'); break
                case 'keyGold': keys.G = true; say('THE GOLD KEY'); sfx('power'); break
                case 'keyIron': keys.I = true; say('THE IRON KEY'); sfx('power'); break
                case 'chest': score += 400; say('PLUNDER!  +400'); sfx('power'); break
                case 'goblet': score += 250; say('GILDED GOBLET  +250'); sfx('pick'); break
                case 'banner': lives++; say('BANNER OF THE FALLEN — ANOTHER LIFE'); sfx('power'); break
                case 'repeater': owned[1] = true; weapon = 1; ammo = Math.max(ammo, 30); say('THE REPEATER — FAST, WASTEFUL'); sfx('power'); break
                case 'launcher': owned[2] = true; weapon = 2; ammo += 24; say('THE OCCULT LANCER'); sfx('power'); break
                default: sfx('pick'); break
            }
        }

        // ------------------------------------------------------------- update
        function update(dt) {
            clock += dt
            flick = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 3.1) * 0.07 + rand() * 0.04
            if (msgT > 0) msgT -= dt
            if (hurtT > 0) hurtT = Math.max(0, hurtT - dt * 2.9)
            if (shake > 0) shake = Math.max(0, shake - dt * 14)
            if (kick > 0) kick = Math.max(0, kick - dt * 7)
            if (flash > 0) flash = Math.max(0, flash - dt)
            if (cool > 0) cool = Math.max(0, cool - dt)

            // doors slide
            for (const d of doors) {
                if (d.open !== d.target) {
                    const s = dt * 2.4
                    d.open = d.target > d.open ? Math.min(d.target, d.open + s) : Math.max(d.target, d.open - s)
                }
            }

            if (mode === 'attract') {
                pang += dt * 0.22
                bobAmp = 0
                return
            }
            if (mode === 'dying') {
                dieT += dt
                if (dieT > 1.4) {
                    lives--
                    mode = lives > 0 ? 'play' : 'dead'
                    if (lives > 0) { loadLevel(li, true); audioController.startMusic('keep') }
                }
                return
            }
            if (mode === 'clear') {
                clearT += dt
                if (clearT > 2.8) {
                    if (li + 1 >= LEVELS.length) { mode = 'win'; audioController.stopMusic() }
                    else { loadLevel(li + 1, true); audioController.startMusic('keep'); mode = 'play' }
                }
                return
            }
            if (mode !== 'play') return

            // ---- player ----
            const runK = input.run ? 1.75 : 1
            const sp = (input.fwd * 3.1 * runK)
            const str = input.strafe * 2.5 * runK
            const turn = input.turn * 2.5
            pang += turn * dt
            const dx = Math.cos(pang), dy = Math.sin(pang)
            const vx = (dx * sp - dy * str) * dt
            const vy = (dy * sp + dx * str) * dt
            if (vx || vy) {
                const { mx, my } = movePlayer(vx, vy)
                if (!mx && vx) tryDoors(px, py)
                if (!my && vy) tryDoors(px, py)
                const m = Math.hypot(mx, my)
                bobAmp = Math.min(1, bobAmp + m * 5)
                bob += m * 9
            } else {
                bobAmp = Math.max(0, bobAmp - dt * 4)
            }

            if (input.fire || input.queued) shoot()
            if (input.use) { input.use = false; tryDoors(px, py) }

            // exit
            const ahead = at((px + dx * 0.55) | 0, (py + dy * 0.55) | 0)
            if (ahead === 'X' || at(px | 0, py | 0) === 'X') {
                mode = 'clear'
                clearT = 0
                score += 1000 + ammo * 5 + health * 5
                audioController.stopMusic()
                sfx('power')
                return
            }

            // ---- pickups ----
            for (const p of props) {
                if (p.gone) continue
                if (Math.abs(p.x - px) < 0.5 && Math.abs(p.y - py) < 0.5) collect(p)
            }

            // ---- field ----
            if ((fieldTick-- <= 0)) { buildField(); fieldTick = 8 }

            // ---- enemies ----
            for (const e of enemies) {
                if (e.flash > 0) e.flash -= dt
                if (e.state === 'dead') {
                    e.t += dt
                    e.sink = Math.min(1, e.t / 0.5)
                    continue
                }
                const dist = Math.hypot(px - e.x, py - e.y)
                const clear = los(e.x, e.y, px, py)
                if (!e.awake && dist < e.sight && clear) {
                    e.awake = true; e.state = 'active'; e.t = 0
                    if (e.kind === 'boss') { bossAliveRef.current = true; audioController.startMusic('siege'); say('THE WARDEN WAKES') }
                }
                e.ang = Math.atan2(py - e.y, px - e.x)
                if (!e.awake) { e.moving = false; continue }

                if (e.state === 'pain') {
                    e.t -= dt
                    e.moving = false
                    if (e.t <= 0) e.state = 'active'
                    continue
                }
                e.cool -= dt

                // wind-up: the 'shoot'/'bite' frame is the telegraph — the hit lands a
                // third of a second later, so the player can break LOS or strafe off it.
                if (e.state === 'attack') {
                    e.moving = false
                    e.t -= dt
                    if (e.t <= 0) {
                        e.state = 'active'
                        if (clear) fireAt(e)
                    }
                    continue
                }

                // ---- where to walk. Downhill on the BFS field when the lane is
                // blocked, straight in when it is clear, and never past `hold`
                // (marksmen stop to shoot instead of crowding the crosshair).
                let tx = px, ty = py
                e.moving = false
                if (!clear) {
                    const cx = e.x | 0, cy = e.y | 0
                    let best = field[cy * W + cx]
                    let bx = -1, by = -1
                    for (let k = 0; k < 8; k++) {
                        const ox = NBX[k], oy = NBY[k]
                        if (ox && oy && (isSolid(cx + ox, cy) || isSolid(cx, cy + oy))) continue
                        const nx = cx + ox, ny = cy + oy
                        if (nx < 0 || ny < 0 || nx >= W || ny >= HH) continue
                        const ch = grid[ny][nx]
                        if (ch !== '.' && ch !== 'D') continue
                        const v = field[ny * W + nx]
                        if (v < best) { best = v; bx = nx; by = ny }
                    }
                    if (bx < 0) continue
                    tx = bx + 0.5; ty = by + 0.5
                    e.moving = true
                } else if (dist > (e.fire === 'bite' ? 0.6 : e.hold)) {
                    e.moving = true
                }

                if (e.moving) {
                    const a = Math.atan2(ty - e.y, tx - e.x)
                    move(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt, 0.3)
                    // shove unlocked doors open on the way through
                    const ax = (e.x + Math.cos(e.ang) * 0.55) | 0, ay = (e.y + Math.sin(e.ang) * 0.55) | 0
                    if (at(ax, ay) === 'D') { const dd = doorOf(ax, ay); if (dd && !dd.lock) dd.target = 1 }
                    const cx2 = e.x | 0, cy2 = e.y | 0
                    if (at(cx2, cy2) === 'D') { const dd = doorOf(cx2, cy2); if (dd && !dd.lock) dd.target = 1 }
                }

                // keep from piling into one another
                for (const o of enemies) {
                    if (o === e || o.state === 'dead') continue
                    const ddx = e.x - o.x, ddy = e.y - o.y
                    const d2 = ddx * ddx + ddy * ddy
                    if (d2 > 0.0001 && d2 < 0.42) {
                        const d = Math.sqrt(d2)
                        move(e, (ddx / d) * dt * 0.9, (ddy / d) * dt * 0.9, 0.3)
                    }
                }

                if (clear && e.cool <= 0 && dist <= e.range) {
                    e.state = 'attack'
                    e.t = e.fire === 'bite' ? 0.1 : 0.32
                    e.cool = KINDS[e.kind].cool * (0.8 + rand() * 0.45)
                }
            }

            // ---- projectiles ----
            for (const s of shots) {
                s.t += dt
                const step = s.sp * dt
                const nx = s.x + s.dx * step, ny = s.y + s.dy * step
                if (isSolid(nx | 0, ny | 0)) {
                    s.dead = true
                    spawnParts(s.x, s.y, 0.5, s.kind === 'fire' ? 8 : 3, 'spark', s.kind === 'fire' ? 2 : 1)
                    if (s.kind === 'fire') { sfx('hit', 0.5); shake = Math.max(shake, 1.5) }
                    continue
                }
                s.x = nx; s.y = ny
                if (s.foe) {
                    if (Math.hypot(s.x - px, s.y - py) < 0.42) {
                        s.dead = true
                        hurt(s.dmg)
                        spawnParts(px, py, 0.5, 4, 'blood', 1.2)
                    }
                } else {
                    for (const e of enemies) {
                        if (e.state === 'dead') continue
                        if (Math.hypot(s.x - e.x, s.y - e.y) < e.r + 0.2) {
                            s.dead = true
                            splash(e, s.dmg, s.x, s.y)
                            break
                        }
                    }
                }
                if (s.t > 4) s.dead = true
            }
            shots = shots.filter(s => !s.dead)

            // ---- particles ----
            for (const p of parts) {
                p.t -= dt
                p.x += p.vx * dt; p.y += p.vy * dt
                p.z += p.vz * dt; p.vz -= 6 * dt
                if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.6; p.vy *= 0.6 }
            }
            parts = parts.filter(p => p.t > 0)
        }

        function splash(e, dmg, x, y) {
            shake = Math.max(shake, 4)
            sfx('kill', 0.7)
            spawnParts(x, y, 0.5, 12, 'spark', 2.4)
            spawnParts(x, y, 0.4, 6, 'blood', 1.8)
            for (const o of enemies) {
                if (o.state === 'dead') continue
                const d = Math.hypot(o.x - x, o.y - y)
                if (d < 1.8) hurtEnemy(o, dmg * (d < 0.7 ? 1 : 0.55), o.x, o.y)
            }
        }

        function fireAt(e) {
            const d = Math.hypot(px - e.x, py - e.y)
            const vol = Math.max(0.2, 1 - d / 16)
            if (e.fire === 'bite') {
                if (d < KINDS[e.kind].range + 0.25) { hurt(9); spawnParts(px, py, 0.45, 4, 'blood', 1) }
                sfx('bite', vol)
                return
            }
            const base = Math.atan2(py - e.y, px - e.x)
            const n = e.fire === 'fire3' ? 3 : 1
            for (let i = 0; i < n; i++) {
                const a = base + (i - (n - 1) / 2) * 0.16 + (rand() - 0.5) * 0.05
                shots.push({
                    x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4,
                    dx: Math.cos(a), dy: Math.sin(a), sp: e.kind === 'mage' ? 5.4 : 6.4,
                    dmg: e.kind === 'boss' ? 14 : e.kind === 'mage' ? 11 : 7,
                    kind: e.fire === 'bolt' ? 'bolt' : 'fire', foe: true, t: 0,
                })
            }
            sfx(e.fire === 'bolt' ? 'gun' : 'lob', vol)
        }

        // --------------------------------------------------------------- render
        function shadeLevel(d, extra = 0) {
            const t = Math.pow(Math.min(1, d / (FOG * (LEVELS[li]?.fog ?? 1))), 0.72)
            return Math.min(11, Math.max(0, Math.round(t * 11 + extra + (1 - flick) * 1.6)))
        }

        function render() {
            const horizon = RH / 2 + Math.round(shake * Math.sin(clock * 40) * 1.6)
            const dirX = Math.cos(pang), dirY = Math.sin(pang)
            const planeX = -dirY * FOV, planeY = dirX * FOV

            // ---- floor + ceiling (per row, half-width sampling) ----
            const rdx0 = dirX - planeX, rdy0 = dirY - planeY
            const rdx1 = dirX + planeX, rdy1 = dirY + planeY
            const posZ = EYE * RH
            for (let y = 0; y < RH; y++) {
                const isFloor = y > horizon
                const p = isFloor ? y - horizon : horizon - y
                if (p <= 0) continue
                const dist = posZ / p
                if (dist > FOG * 1.25) {
                    const dark = (isFloor ? floorTex.shades[11] : ceilTex.shades[11])[0]
                    buf.fill(dark, y * RW, y * RW + RW)
                    continue
                }
                const tex = isFloor ? floorTex : ceilTex
                const lev = shadeLevel(dist)
                const sh = tex.shades[lev]
                const stepX = dist * (rdx1 - rdx0) / RW
                const stepY = dist * (rdy1 - rdy0) / RW
                let fx = px + dist * rdx0, fy = py + dist * rdy0
                const row = y * RW
                for (let x = 0; x < RW; x += 2) {
                    const t = ((fy * 64) & 63) * 64 + ((fx * 64) & 63)
                    const c = sh[t & 4095]
                    buf[row + x] = c
                    buf[row + x + 1] = c
                    fx += stepX * 2; fy += stepY * 2
                }
            }

            // ---- walls ----
            for (let x = 0; x < RW; x++) {
                const camX = 2 * x / RW - 1
                const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX
                let mapX = px | 0, mapY = py | 0
                const ddx = Math.abs(rdx) < 1e-9 ? 1e9 : Math.abs(1 / rdx)
                const ddy = Math.abs(rdy) < 1e-9 ? 1e9 : Math.abs(1 / rdy)
                const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1
                let sdx = rdx < 0 ? (px - mapX) * ddx : (mapX + 1 - px) * ddx
                let sdy = rdy < 0 ? (py - mapY) * ddy : (mapY + 1 - py) * ddy
                let side = 0, hit = 0, guard = 0
                while (!hit && guard++ < 90) {
                    if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0 } else { sdy += ddy; mapY += stepY; side = 1 }
                    if (mapX < 0 || mapY < 0 || mapX >= W || mapY >= HH) { hit = 2; break }
                    if (isSolid(mapX, mapY)) hit = 1
                }
                const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy)
                zbuf[x] = dist
                if (hit !== 1) continue
                const ch = at(mapX, mapY)
                const tex = wallTex[ch] || wallTex['#']
                const door = (ch === 'D' || ch === 'L' || ch === 'G') ? doorOf(mapX, mapY) : null
                const open = door ? door.open : 0
                if (open >= 0.98) continue

                const lineH = RH / dist
                let wallX = side === 0 ? py + dist * rdy : px + dist * rdx
                wallX -= Math.floor(wallX)
                let texX = (wallX * 64) | 0
                if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = 63 - texX
                const sh = tex.shades[Math.min(11, shadeLevel(dist, side === 1 ? 1.7 : 0))]

                // A door sinks *down* into the floor: the panel keeps the upper part of
                // the opening, and showing only its lower texels is the same number as
                // that offset — which is what stops the panel stretching as it sinks.
                const wallTop = horizon - lineH / 2
                let y0 = Math.round(wallTop + lineH * open)
                let y1 = Math.round(horizon + lineH / 2)
                const tstep = 64 / lineH
                let ty = (y0 - wallTop) * tstep
                if (y0 < 0) { ty += -y0 * tstep; y0 = 0 }
                if (y1 > RH) y1 = RH
                for (let y = y0; y < y1; y++) {
                    let t = ty | 0
                    if (t > 63) t = 63
                    buf[y * RW + x] = sh[t * 64 + texX]
                    ty += tstep
                }
            }

            // ---- billboards ----
            const inv = 1 / (planeX * dirY - dirX * planeY)
            const list = []
            for (const e of enemies) {
                const dead = e.state === 'dead'
                const s = art.sprites[dead ? e.kind + 'Corpse' : e.kind]
                if (!s) continue
                const frame = dead ? 'base'
                    : e.state === 'attack' ? (e.fire === 'bite' ? 'bite' : 'shoot')
                        : (e.awake && e.moving ? 'run' : 'stand')
                const v = s.variants[frame] || s.variants.stand || s.variants.base
                if (!v) continue
                list.push({ x: e.x, y: e.y, v, h: s.meta.worldH, z: 0, sink: dead ? e.sink : 0, flash: e.flash > 0 && !dead, dead })
            }
            for (const p of props) {
                if (p.gone) continue
                const s = art.sprites[p.kind]
                if (!s) continue
                list.push({ x: p.x, y: p.y, v: s.variants.base, h: s.meta.worldH, z: 0.06 + Math.sin(clock * 2 + p.bob) * 0.03, sink: 0, flash: false })
            }
            for (const s of shots) {
                const sp = art.sprites[s.kind === 'fire' ? 'fireball' : 'bolt']
                list.push({ x: s.x, y: s.y, v: sp.variants.base, h: sp.meta.worldH, z: 0.45, sink: 0, flash: false })
            }
            for (const p of parts) {
                const sp = art.sprites[p.kind]
                list.push({ x: p.x, y: p.y, v: sp.variants.base, h: sp.meta.worldH, z: p.z, sink: 0, flash: false })
            }
            for (const b of list) {
                const sx = b.x - px, sy = b.y - py
                b.ty = inv * (-planeY * sx + planeX * sy)
                b.tx = inv * (dirY * sx - dirX * sy)
                b.d = sx * sx + sy * sy
            }
            list.sort((a, b) => b.d - a.d)

            for (const b of list) {
                if (b.ty < 0.24 || b.ty > FOG * 1.35) continue
                const hPix = (RH / b.ty) * b.h * (1 - b.sink * 0.85)
                const wPix = hPix * (b.v.w / b.v.h)
                const floorY = horizon + (RH / b.ty) * EYE
                const bottom = floorY - (RH / b.ty) * b.z
                const top = bottom - hPix
                const cx = (RW / 2) * (1 + b.tx / b.ty)
                let x0 = Math.round(cx - wPix / 2), x1 = Math.round(cx + wPix / 2)
                if (x1 < 0 || x0 >= RW || hPix < 1) continue
                if (x0 < 0) x0 = 0
                if (x1 > RW) x1 = RW
                const lev = shadeLevel(b.ty)
                const sh = b.flash ? b.v.hot : b.v.shades[lev]
                const yTop = Math.max(0, Math.round(top)), yBot = Math.min(RH, Math.round(bottom))
                const span = yBot - yTop
                if (span <= 0) continue
                const yStep = b.v.h / hPix
                for (let x = x0; x < x1; x++) {
                    if (b.ty >= zbuf[x]) continue
                    const texX = ((x - (cx - wPix / 2)) * b.v.w / wPix) | 0
                    if (texX < 0 || texX >= b.v.w) continue
                    let tyy = (yTop - top) * yStep
                    for (let y = yTop; y < yBot; y++) {
                        let t = tyy | 0
                        if (t >= b.v.h) t = b.v.h - 1
                        const c = sh[t * b.v.w + texX]
                        if (c) buf[y * RW + x] = c
                        tyy += yStep
                    }
                }
            }

            ctx.putImageData(img, 0, 0)

            // ---- damage vignette ----
            // Kept deliberately subtle: at high alpha the whole viewport goes red and
            // you can no longer see what killed you (found by screenshot, not by eye).
            if (hurtT > 0.01) {
                const g2 = ctx.createRadialGradient(RW / 2, RH / 2, RH / 2.2, RW / 2, RH / 2, RH * 0.95)
                g2.addColorStop(0, 'rgba(150,0,0,0)')
                g2.addColorStop(1, `rgba(176,12,12,${(hurtT * 0.4).toFixed(3)})`)
                ctx.fillStyle = g2
                ctx.fillRect(0, 0, RW, RH)
            }
            // torch vignette (cheap depth cue around the viewport edges)
            ctx.fillStyle = 'rgba(0,0,0,0.20)'
            ctx.fillRect(0, 0, RW, 3); ctx.fillRect(0, RH - 3, RW, 3)

            // ---- weapon ----
            if (mode === 'play' || mode === 'clear') {
                const name = ['crossbow', 'repeater', 'launcher'][weapon]
                const wob = Math.sin(bob) * 3 * bobAmp
                const wob2 = Math.abs(Math.cos(bob)) * 2 * bobAmp
                ctx.drawImage(weaponCanvas[name], Math.round(RW / 2 - 40 + wob), Math.round(RH - 54 + wob2 + kick * 7))
                if (flash > 0) {
                    ctx.drawImage(flashCanvas, Math.round(RW / 2 - 15 + wob), Math.round(RH - 46 + wob2))
                }
            }

            // ---- crosshair ----
            if (mode === 'play') {
                ctx.fillStyle = 'rgba(255,210,120,0.85)'
                ctx.fillRect(RW / 2 - 6, RH / 2, 4, 1)
                ctx.fillRect(RW / 2 + 3, RH / 2, 4, 1)
                ctx.fillRect(RW / 2, RH / 2 - 6, 1, 4)
                ctx.fillRect(RW / 2, RH / 2 + 3, 1, 4)
            }

            // ---- toast ---- (never on the title: a gameplay hint under "PRESS ANY
            // KEY TO BEGIN" reads as leftover state from a previous session)
            if (msgT > 0 && msg && mode !== 'attract') {
                const w = textWidth(msg, 1) + 10
                const a = Math.min(1, msgT / 0.5)
                ctx.fillStyle = `rgba(6,6,10,${0.7 * a})`
                ctx.fillRect((RW - w) / 2, 12, w, 12)
                drawText(ctx, msg, RW / 2, 16, { scale: 1, align: 'center', color: `rgba(246,217,122,${a})` })
            }

            drawStatus()
            drawScreens()

            // Mirror the engine's screen into React so the gamepad can hide itself on
            // the title / death screens (one compare per frame, no per-frame re-render).
            if (screenRef.current !== mode) {
                screenRef.current = mode
                setScreen(mode)
            }
        }

        // ------------------------------------------------------------- status
        function drawFace(x, y, hp) {
            const dmg = 1 - hp / 100
            const skin = dmg > 0.66 ? '#8d5a44' : dmg > 0.33 ? '#b8825c' : CSS.bone
            ctx.fillStyle = '#0d0e14'
            ctx.fillRect(x - 1, y - 1, 16, 18)
            ctx.fillStyle = skin
            ctx.fillRect(x, y, 14, 16)
            ctx.fillStyle = '#e8d9b0'
            ctx.fillRect(x + 1, y + 1, 12, 5)
            ctx.fillStyle = '#2a1d16'
            ctx.fillRect(x + 2, y + 5, 3, 2); ctx.fillRect(x + 9, y + 5, 3, 2)
            ctx.fillStyle = '#f6f2e6'
            ctx.fillRect(x + 3, y + 5, 1, 1); ctx.fillRect(x + 10, y + 5, 1, 1)
            ctx.fillStyle = '#7d3226'
            const mouth = dmg > 0.5 ? 6 : 4
            ctx.fillRect(x + 4, y + 11, mouth, 2)
            if (dmg > 0.25) { ctx.fillStyle = '#a01f1f'; ctx.fillRect(x + 2, y + 2, 2, 5) }
            if (dmg > 0.5) { ctx.fillStyle = '#a01f1f'; ctx.fillRect(x + 8, y + 3, 2, 7); ctx.fillRect(x + 5, y + 8, 3, 1) }
            if (dmg > 0.78) { ctx.fillStyle = '#c9302c'; ctx.fillRect(x + 1, y + 12, 12, 4) }
        }

        function panel(x, label) {
            ctx.fillStyle = CSS.iron
            ctx.fillRect(x, RH, 64, HUD_H)
            ctx.fillStyle = CSS.ironL
            ctx.fillRect(x, RH, 64, 1)
            ctx.fillRect(x, RH, 1, HUD_H)
            drawText(ctx, label, x + 5, RH + 4, { scale: 1, color: CSS.dim })
        }

        function drawStatus() {
            ctx.fillStyle = '#0a0b10'
            ctx.fillRect(0, RH, RW, HUD_H)
            for (let i = 0; i < 5; i++) panel(i * 64, ['LIFE', 'BOLTS', 'ARMS', 'KEEP', 'SCORE'][i])

            // life
            drawFace(6, RH + 13, mode === 'dead' || mode === 'dying' ? 0 : health)
            drawText(ctx, String(Math.max(0, health)), 26, RH + 16, {
                scale: 2, color: health > 60 ? CSS.green : health > 30 ? CSS.gold : CSS.red,
            })
            drawText(ctx, '%', 26 + textWidth(String(Math.max(0, health)), 2) + 2, RH + 20, { scale: 1, color: CSS.dim })

            // bolts
            drawText(ctx, String(ammo), 70, RH + 16, { scale: 2, color: ammo > 20 ? CSS.bone : CSS.red })
            drawText(ctx, `W${weapon + 1}`, 70 + textWidth(String(ammo), 2) + 4, RH + 20, { scale: 1, color: CSS.dim })

            // arms
            for (let i = 0; i < 3; i++) {
                const on = i === weapon
                drawText(ctx, owned[i] ? WEAPONS[i].name : '--- ---', 133, RH + 12 + i * 9, {
                    scale: 1, color: on ? CSS.goldL : owned[i] ? CSS.dim : '#3a3d4d',
                })
            }

            // keep — which hall, how many fell, and which keys burn. The scale-2 roman
            // numeral is 36px wide, so the small text has to start clear of it or the
            // key letters end up printed over the kill counter.
            const roman = ['I', 'II', 'III'][li] || 'I'
            drawText(ctx, roman, 196, RH + 11, { scale: 2, color: CSS.gold })
            const rx = 196 + textWidth(roman, 2) + 5
            drawText(ctx, `${kills}/${killTotal}`, rx, RH + 12, { scale: 1, color: CSS.dim })
            drawText(ctx, 'G', rx, RH + 21, { scale: 1, color: keys.G ? CSS.goldL : '#3a3d4d' })
            drawText(ctx, 'I', rx + 12, RH + 21, { scale: 1, color: keys.I ? '#c8cede' : '#3a3d4d' })
            const awake = enemies.some(e => e.kind === 'boss' && e.awake && e.state !== 'dead')
            drawText(ctx, awake ? 'WARDEN' : LEVELS[li].short, 196, RH + 30, { scale: 1, color: awake ? CSS.red : '#4a4e60' })

            // score + lives
            drawText(ctx, String(score).padStart(6, '0'), 315, RH + 13, { scale: 1, align: 'right', color: CSS.goldL })
            drawText(ctx, `LIVES x${lives}`, 261, RH + 28, { scale: 1, color: CSS.dim })
        }

        // ------------------------------------------------------------- screens
        function drawScreens() {
            if (mode === 'attract') {
                ctx.fillStyle = 'rgba(4,4,8,0.62)'
                ctx.fillRect(0, 0, RW, RH)
                const t = Math.sin(clock * 2.2) > -0.55
                drawText(ctx, 'IRONKEEP', RW / 2, 34, { scale: 6, align: 'center', color: CSS.gold, shadow: '#000000', shadowOff: 3 })
                drawText(ctx, 'A FIRST-PERSON DESCENT', RW / 2, 74, { scale: 1, align: 'center', color: CSS.dim })
                drawText(ctx, 'THREE HALLS · ONE CROSSBOW', RW / 2, 86, { scale: 1, align: 'center', color: CSS.ironL })
                if (t) drawText(ctx, 'PRESS ANY KEY TO BEGIN', RW / 2, 116, { scale: 2, align: 'center', color: CSS.white })
                drawText(ctx, 'ARROWS/WASD MOVE · MOUSE LOOK · SPACE FIRE', RW / 2, 146, { scale: 1, align: 'center', color: CSS.dim })
                drawText(ctx, 'SHIFT RUN · E OPEN · 1 2 3 ARMS · ? PAUSE', RW / 2, 158, { scale: 1, align: 'center', color: CSS.dim })
                drawText(ctx, '1 2 3 AT THE TITLE SKIPS TO THAT HALL', RW / 2, 176, { scale: 1, align: 'center', color: '#4a4e60' })
            } else if (mode === 'dying') {
                const a = Math.min(0.85, dieT * 0.7)
                ctx.fillStyle = `rgba(90,0,0,${a})`
                ctx.fillRect(0, 0, RW, RH)
            } else if (mode === 'dead') {
                ctx.fillStyle = 'rgba(4,2,4,0.86)'
                ctx.fillRect(0, 0, RW, RH)
                drawText(ctx, 'YOU DIED', RW / 2, 58, { scale: 5, align: 'center', color: CSS.red, shadow: '#000000' })
                drawText(ctx, `SCORE ${score}`, RW / 2, 104, { scale: 2, align: 'center', color: CSS.gold })
                drawText(ctx, 'THE KEEP KEEPS WHAT IT TAKES', RW / 2, 128, { scale: 1, align: 'center', color: CSS.dim })
                if (Math.sin(clock * 3) > -0.2) drawText(ctx, 'PRESS ANY KEY', RW / 2, 156, { scale: 2, align: 'center', color: CSS.white })
            } else if (mode === 'clear') {
                ctx.fillStyle = 'rgba(4,10,8,0.55)'
                ctx.fillRect(0, 0, RW, RH)
                drawText(ctx, li + 1 >= LEVELS.length ? 'THE LAST DOOR' : 'HALL CLEARED', RW / 2, 66, { scale: 4, align: 'center', color: CSS.green, shadow: '#000000', shadowOff: 2 })
                drawText(ctx, `+${1000 + ammo * 5 + health * 5} FOR STEEL AND SIN`, RW / 2, 106, { scale: 1, align: 'center', color: CSS.gold })
                drawText(ctx, LEVELS[Math.min(li + 1, LEVELS.length - 1)].name, RW / 2, 126, { scale: 2, align: 'center', color: CSS.bone })
            } else if (mode === 'win') {
                ctx.fillStyle = 'rgba(6,6,10,0.9)'
                ctx.fillRect(0, 0, RW, RH)
                drawText(ctx, 'THOU ART FREE', RW / 2, 44, { scale: 4, align: 'center', color: CSS.goldL, shadow: '#000000', shadowOff: 2 })
                drawText(ctx, 'IRONKEEP IS EMPTY BEHIND THEE', RW / 2, 84, { scale: 1, align: 'center', color: CSS.dim })
                drawText(ctx, `FINAL SCORE ${score}`, RW / 2, 110, { scale: 2, align: 'center', color: CSS.white })
                drawText(ctx, `HEALTH ${health} · BOLTS ${ammo} · LIVES ${lives}`, RW / 2, 132, { scale: 1, align: 'center', color: CSS.bone })
                if (Math.sin(clock * 3) > -0.2) drawText(ctx, 'PRESS ANY KEY', RW / 2, 162, { scale: 2, align: 'center', color: CSS.white })
            }
        }

        // ---------------------------------------------------------------- loop
        let raf = 0, last = 0, acc = 0
        const loop = (ts) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = ts
            const frame = Math.min(ts - last, 100)
            last = ts
            if (pausedRef.current || frozen) return
            const t0 = performance.now()
            acc += frame
            let steps = 0
            while (acc >= FIXED_DT && steps++ < 5) { update(FIXED_DT / 1000); acc -= FIXED_DT }
            render()
            const ms = performance.now() - t0
            frameMax = Math.max(frameMax, ms)
            frameMs = frameMs ? frameMs * 0.94 + ms * 0.06 : ms
            frameN++
        }

        // ---------------------------------------------------------------- input
        const KEYMAP = {
            ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back',
            ArrowLeft: 'turnL', KeyA: 'strafeL', ArrowRight: 'turnR', KeyD: 'strafeR',
            Space: 'fire', KeyE: 'use', Enter: 'fire', ControlLeft: 'fire',
            ShiftLeft: 'run', ShiftRight: 'run',
        }
        function applyKey(code, down) {
            const a = KEYMAP[code]
            if (!a) return
            if (a === 'fwd') input.fwd = down ? 1 : 0
            else if (a === 'back') input.fwd = down ? -1 : 0
            else if (a === 'turnL') input.turn = down ? -1 : 0
            else if (a === 'turnR') input.turn = down ? 1 : 0
            else if (a === 'strafeL') input.strafe = down ? -1 : 0
            else if (a === 'strafeR') input.strafe = down ? 1 : 0
            else if (a === 'fire') {
                // A tap can begin and end between two 60Hz samples, which silently
                // swallowed quick shots (found by keyboard playtest, not by eye).
                // Held covers auto-fire; `queued` latches the edge for update().
                input.fire = down
                if (down) input.queued = true
            }
            else if (a === 'use') { if (down) input.use = true }  // edge; update() consumes
            else if (a === 'run') input.run = down
        }

        const MODS = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']

        // Chrome rejects requestPointerLock outside a gesture (and in headless),
        // and an unhandled rejection would show up as a console error in the harness.
        const reqLock = () => {
            try { const p = canvas.requestPointerLock?.(); if (p?.catch) p.catch(() => { }) } catch { /* not fatal */ }
        }

        const isPause = (e) => e.key === '?' || (e.code === 'Slash' && e.shiftKey) || e.code === 'Escape'

        const onKeyDown = (e) => {
            if (isPause(e)) {
                e.preventDefault()
                const s = !pausedRef.current
                pausedRef.current = s
                setPaused(s)
                if (s) { input.fire = false; input.fwd = 0; input.turn = 0; if (document.pointerLockElement === canvas) document.exitPointerLock?.() }
                else audioController.startMusic(bossAliveRef.current ? 'siege' : 'keep')
                return
            }
            if (pausedRef.current) return
            if (mode === 'attract') {
                if (MODS.includes(e.code)) return          // a lone modifier must not start
                e.preventDefault()
                audioController.init()
                if (e.code === 'Digit1') { loadLevel(0, false); startPlay(); return }
                if (e.code === 'Digit2') { loadLevel(1, false); startPlay(); return }
                if (e.code === 'Digit3') { loadLevel(2, false); startPlay(); return }
                loadLevel(0, false)
                startPlay()
                return
            }
            if (mode === 'dead' || mode === 'win') {
                if (MODS.includes(e.code)) return
                mode = 'attract'
                loadLevel(0, false)
                return
            }
            if (e.code === 'Digit1' && owned[0]) weapon = 0
            if (e.code === 'Digit2' && owned[1]) weapon = 1
            if (e.code === 'Digit3' && owned[2]) weapon = 2
            if (e.code === 'KeyQ') {
                for (let i = 1; i <= 3; i++) { const n = (weapon + i) % 3; if (owned[n]) { weapon = n; break } }
            }
            applyKey(e.code, true)
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
        }
        const onKeyUp = (e) => applyKey(e.code, false)

        function startPlay() {
            mode = 'play'
            audioController.startMusic('keep')
            reqLock()
        }

        // mouse look (pointer lock) + click to fire
        const onMouseMove = (e) => {
            if (pausedRef.current) return
            if (document.pointerLockElement === canvas && mode === 'play') pang += e.movementX * 0.0024
        }
        const onMouseDown = (e) => {
            if (pausedRef.current) return
            audioController.init()
            if (mode === 'attract') { loadLevel(0, false); startPlay(); return }
            if (mode === 'dead' || mode === 'win') { mode = 'attract'; loadLevel(0, false); return }
            if (document.pointerLockElement !== canvas) { reqLock(); return }
            if (e.button === 0 && mode === 'play') input.fire = true
        }
        const onMouseUp = () => { input.fire = false }

        // touch: drag the viewport to look, tap to fire (the gamepad handles travel)
        let touchX = null, touchMoved = 0
        const onTouchStart = (e) => {
            audioController.init()
            if (mode === 'attract') { loadLevel(0, false); startPlay() }
            touchX = e.touches[0].clientX
            touchMoved = 0
        }
        const onTouchMove = (e) => {
            if (touchX === null) return
            const dx = e.touches[0].clientX - touchX
            touchMoved += Math.abs(dx)
            touchX = e.touches[0].clientX
            pang += dx * 0.0075
            e.preventDefault()
        }
        const onTouchEnd = () => {
            if (touchX !== null && touchMoved < 12 && mode === 'play') { input.fire = true; input.queued = true; setTimeout(() => { input.fire = false }, 90) }
            touchX = null
        }

        // ------------------------------------------------------------- dev hook
        // DEV-only test surface (see scripts/fpscheck.mjs). Never exists in prod.
        if (import.meta.env.DEV) {
            window.__keepTest = {
                start: () => { if (mode === 'attract') { loadLevel(0, false); startPlay() } },
                state: () => ({
                    mode, level: li, levelName: LEVELS[li].name, x: px, y: py, ang: pang,
                    health, ammo, lives, score, keys: { ...keys }, weapon, owned: owned.slice(),
                    enemies: enemies.filter(e => e.state !== 'dead').length,
                    kills, killTotal, doors: doors.map(d => ({ x: d.x, y: d.y, open: +d.open.toFixed(2), lock: d.lock })),
                    wallAhead: at((px + Math.cos(pang) * 0.6) | 0, (py + Math.sin(pang) * 0.6) | 0),
                    frameMs: +frameMs.toFixed(2), frameMax: +frameMax.toFixed(2),
                    msg, msgT: +msgT.toFixed(2), fog: LEVELS[li].fog,
                    music: audioController._musicState?.() ?? null,
                }),
                // Advance the simulation by n fixed steps without rendering: makes
                // movement/AI assertions independent of frame rate.
                step: (n = 60) => { for (let i = 0; i < n; i++) update(FIXED_DT / 1000) },
                warp: (x, y, a) => { px = x; py = y; if (a !== undefined) pang = a; buildField(); return { x: px, y: py } },
                look: (a) => { pang = a },
                give: () => { owned[1] = owned[2] = true; keys.G = keys.I = true; ammo = 200 },
                setWeapon: (i) => { if (owned[i]) weapon = i; return weapon },
                setAmmo: (n) => { ammo = n },
                setHealth: (n) => { health = n },
                spawn: (kind, x, y) => {
                    const e = {
                        kind, ...KINDS[kind], x, y, hp: KINDS[kind].hp, id: ++eid, state: 'idle', t: 0,
                        cool: 0, flash: 0, ang: 0, sink: 0, awake: false, clear: false, moving: false,
                    }
                    enemies.push(e)
                    killTotal++
                    return e.id            // id, not index: the array is rebuilt on reload
                },
                shoot: () => shoot(),
                hurt: (n) => hurt(n),
                say,
                gotoLevel: (i) => { loadLevel(i, true); if (mode === 'attract') startPlay(); return LEVELS[li].name },
                clearNow: () => { mode = 'clear'; clearT = 0 },
                openAll: () => { for (const d of doors) { d.lock = null; d.target = 1; d.open = 1 } },
                killAll: () => { for (const e of enemies) if (e.state !== 'dead') hurtEnemy(e, 9999) },
                list: () => enemies.map(e => ({ id: e.id, kind: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: e.hp, state: e.state, awake: !!e.awake })),
                props: () => props.map(p => ({ kind: p.kind, x: p.x, y: p.y, gone: p.gone })),
                fieldAt: (x, y) => field[y * W + x],
                los: (x0, y0, x1, y1) => los(x0, y0, x1, y1),
                solidAt: (x, y) => isSolid(x | 0, y | 0),
                seed: (n) => { rand = rng(n) },
                art: () => ({
                    sprites: Object.keys(art.sprites).length,
                    textures: Object.keys(art.textures).length,
                    weapons: Object.keys(art.weapons).length,
                    levels: LEVELS.length,
                }),
                freeze: (v = true) => { frozen = !!v },
                wake: () => { for (const e of enemies) if (e.state !== 'dead') { e.awake = true; if (e.state === 'idle') e.state = 'active' } },
                perf: () => ({ avg: +frameMs.toFixed(2), max: +frameMax.toFixed(2), n: frameN }),
                peak: () => audioController._peak?.() ?? 0,
                input: (k, v) => { input[k] = v; if (k === 'fire' && v) input.queued = true },
            }
        }

        // -------------------------------------------------------------- start
        loadLevel(0, false)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('mousedown', onMouseDown)
        window.addEventListener('mouseup', onMouseUp)
        window.addEventListener('mousemove', onMouseMove)
        canvas.addEventListener('touchstart', onTouchStart, { passive: false })
        canvas.addEventListener('touchmove', onTouchMove, { passive: false })
        canvas.addEventListener('touchend', onTouchEnd)
        canvas.tabIndex = 0
        canvas.focus()
        raf = requestAnimationFrame(loop)

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('mousedown', onMouseDown)
            window.removeEventListener('mouseup', onMouseUp)
            window.removeEventListener('mousemove', onMouseMove)
            canvas.removeEventListener('touchstart', onTouchStart)
            canvas.removeEventListener('touchmove', onTouchMove)
            canvas.removeEventListener('touchend', onTouchEnd)
            if (document.pointerLockElement === canvas) document.exitPointerLock?.()
            audioController.stopMusic()
            if (window.__keepTest) delete window.__keepTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4 pb-28">
            <div
                ref={containerRef}
                className="relative border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black cursor-crosshair"
                style={{ width: 'min(880px, 94vw, calc((100vh - 15rem) * 4 / 3))', aspectRatio: '4 / 3' }}
            >
                <canvas
                    ref={canvasRef}
                    className="block w-full h-full"
                    style={{ imageRendering: 'pixelated' }}
                />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'IRONKEEP')} onResume={handleResume} />}
            </div>
            <VirtualControls
                visible={screen === 'play' || screen === 'clear'}
                secondAction={{ label: 'B', code: 'ShiftLeft' }}
            />
        </div>
    )
}

export default IronKeepGame

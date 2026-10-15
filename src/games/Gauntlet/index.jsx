// GAUNTLET — the arcade shell: first-person raycaster over the pure sim,
// side map + hero panel, narrator text, hero select, attract demo that replays
// the autopilot's OWN proven run tick-for-tick (the same run gauntletcheck
// grades), all art and audio synthesized at runtime.
//
// Layout: 1. setup + sprites 2. raycast render 3. panels/HUD 4. loop
// 5. input 6. DEV hook + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { LEVELS, W, H, HEROES, HERO_ORDER, MONSTERS } from './levels.js'
import { makeGame, step, stateHash, CFG, doorAt } from './sim.js'
import { plan, decide } from './planner.js'
import { buildSprites, MATERIALS } from './art.js'

const VW = 224, VH = 200, PW = 96, HT = 40
const CW = VW + PW, CH = VH + HT
const FOV = 0.58
const SIM_MS = 1000 / 60
let proven = null
const provenRun = () => { if (!proven) proven = plan(2, { maxTicks: 12000 }); return proven }

const GauntletGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('gauntlet.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const SP = buildSprites()
        const canvas = document.createElement('canvas')
        canvas.dataset.gauntletStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0, 'warrior')
        const zbuf = new Float32Array(VW)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0, selectHero = 0
        const keys = { l: false, r: false, u: false, d: false, swordEdge: false, arrowEdge: false }
        const evLog = []
        const parts = []

        const say = (m) => { toastMsg = m; toast = 150 }
        const burst = (px, py, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'say') say(e.text)
                else if (e.type === 'sword') { audioController.playSweep(e.hit ? 180 : 320, e.hit ? 90 : 180, 0.07, 'sawtooth', 0.05) }
                else if (e.type === 'shoot') audioController.playSweep(880, 1500, 0.06, 'square', 0.04)
                else if (e.type === 'monsterHit') { audioController.playNoise(0.04, 0.05); burst(VW / 2, VH * 0.55, 4, '#ffd23f') }
                else if (e.type === 'kill') { audioController.playSweep(520, 120, 0.18, 'square', 0.07); burst(VW / 2, VH * 0.5, 8, e.potion ? '#8fb0ff' : '#ff8a5d') }
                else if (e.type === 'hit') { audioController.playNoise(0.09, 0.09); audioController.playTone(120, 0.1, 'square', 0.08); shake = 5; flash = 6 }
                else if (e.type === 'cast') audioController.playSweep(240, 480, 0.14, 'sawtooth', 0.05)
                else if (e.type === 'drain') { audioController.playTone(70 + (gs.tick % 3) * 10, 0.05, 'triangle', 0.05); flash = 3 }
                else if (e.type === 'pickup') {
                    if (e.t === 'food') { audioController.playSweep(330, 660, 0.18, 'square', 0.07) }
                    else if (e.t === 'key') { audioController.playTone(1320, 0.08, 'square', 0.06); audioController.playTone(1760, 0.1, 'square', 0.05) }
                    else if (e.t === 'potion') { audioController.playSweep(440, 1760, 0.35, 'square', 0.08); flash = 10 }
                    else if (e.t === 'gold') audioController.playTone(990 + (e.v || 0), 0.06, 'square', 0.05)
                }
                else if (e.type === 'keyUsed') audioController.playSweep(660, 990, 0.12, 'triangle', 0.06)
                else if (e.type === 'doorOpen') audioController.playSweep(160, 90, 0.12, 'sawtooth', 0.05)
                else if (e.type === 'slam') { audioController.playTone(70, 0.16, 'square', 0.1); shake = 6 }
                else if (e.type === 'genHit') audioController.playTone(200, 0.05, 'square', 0.05)
                else if (e.type === 'genKill') { audioController.playNoise(0.25, 0.1); audioController.playSweep(300, 80, 0.3, 'sawtooth', 0.08); shake = 8 }
                else if (e.type === 'spawn') audioController.playSweep(80, 220, 0.14, 'triangle', 0.04)
                else if (e.type === 'deathSpawn') { audioController.playSweep(220, 55, 0.8, 'sawtooth', 0.09); say('DEATH WALKS THE MAZE!') }
                else if (e.type === 'death') { audioController.playDeath(); shake = 9; flash = 14 }
                else if (e.type === 'levelClear') { audioController.playSweep(330, 990, 0.4, 'square', 0.08); say(LEVELS[e.level].name.replace(/^LEVEL \d+ · /, '') + ' CLEARED') }
                else if (e.type === 'level') audioController.playSweep(220, 440, 0.3, 'triangle', 0.07)
                else if (e.type === '1up') audioController.playSweep(440, 1760, 0.5, 'square', 0.08)
                else if (e.type === 'respawn') audioController.playSweep(110, 330, 0.3, 'triangle', 0.06)
                else if (e.type === 'win') { audioController.playSweep(220, 1760, 0.9, 'square', 0.1); shake = 10 }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('gauntlet.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(2, 'warrior'); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(2, 'warrior'); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract' || sc === 'select') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ left: keys.l, right: keys.r, fwd: keys.u, back: keys.d, sword: keys.swordEdge, arrow: keys.arrowEdge })
            keys.swordEdge = false
            keys.arrowEdge = false
        }

        // ---------------------------------------------------------------- render ----
        const text = (s, x, y, size, col, glow, align = 'center') => {
            ctx.font = `bold ${size}px monospace`
            ctx.textAlign = align
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col
            ctx.fillText(s, x, y)
            ctx.shadowBlur = 0
        }

        const cell = (x, y) => {
            const c = Math.floor(x), r = Math.floor(y)
            if (c < 0 || r < 0 || c >= W || r >= H) return '#'
            return gs.levelData.grid[r][c]
        }

        const castView = () => {
            const h = gs.hero
            const mat = MATERIALS[gs.levelData.material]
            const sky = ctx.createLinearGradient(0, 0, 0, VH)
            sky.addColorStop(0, '#0a0a14')
            sky.addColorStop(1, mat.dark)
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, VW, VH)
            const gnd = ctx.createLinearGradient(0, VH * 0.5, 0, VH)
            gnd.addColorStop(0, '#17151f')
            gnd.addColorStop(1, '#26222e')
            ctx.fillStyle = gnd
            ctx.fillRect(0, VH / 2, VW, VH / 2)

            const dirX = Math.cos(h.a), dirY = Math.sin(h.a)
            const planeX = -dirY * FOV, planeY = dirX * FOV
            for (let x = 0; x < VW; x++) {
                const cam = 2 * x / VW - 1
                const rdx = dirX + planeX * cam, rdy = dirY + planeY * cam
                let mapX = Math.floor(h.x), mapY = Math.floor(h.y)
                const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9))
                let stepX, stepY, sdX, sdY
                if (rdx < 0) { stepX = -1; sdX = (h.x - mapX) * ddx } else { stepX = 1; sdX = (mapX + 1 - h.x) * ddx }
                if (rdy < 0) { stepY = -1; sdY = (h.y - mapY) * ddy } else { stepY = 1; sdY = (mapY + 1 - h.y) * ddy }
                let side = 0, hit = 0, ch = '.', guard = 0
                while (!hit && guard++ < 48) {
                    if (sdX < sdY) { sdX += ddx; mapX += stepX; side = 0 } else { sdY += ddy; mapY += stepY; side = 1 }
                    ch = cell(mapX + 0.5, mapY + 0.5)
                    if (ch === '#' || ch === 'D' || ch === 'L' || ch === 'X') hit = 1
                }
                const dist = Math.max(0.05, side === 0 ? sdX - ddx : sdY - ddy)
                zbuf[x] = dist
                const lh = Math.min(VH * 2, VH / dist)
                const y0 = (VH - lh) / 2
                const fog = Math.max(0.12, 1 - dist / 11)
                let base = mat.base, lite = mat.lite, dark = mat.dark
                if (ch === 'D' || ch === 'L') { base = '#6b4a22'; lite = '#9c7038'; dark = '#3d2a12' }
                if (ch === 'X') { base = '#1d5a7d'; lite = '#54c8ff'; dark = '#0e2e42' }
                const band = Math.floor((side === 0 ? h.y + (mapY + (stepX < 0 ? 1 : 0)) * 0 : h.x + (stepY < 0 ? 1 : 0)) * 0)
                const wallX = side === 0 ? h.y + (sdX - ddx) * rdy : h.x + (sdY - ddy) * rdx
                const wx = wallX - Math.floor(wallX)
                let col = side === 0 ? base : dark
                const stripe = wx > 0.06 && wx < 0.94
                ctx.fillStyle = stripe ? col : mat.mortar
                ctx.globalAlpha = fog
                ctx.fillRect(x, y0, 1, lh)
                // horizontal mortar lines every half cell
                ctx.fillStyle = mat.mortar
                for (let m = 1; m < 6; m++) {
                    const my = y0 + (lh * m) / 6
                    ctx.globalAlpha = fog * (stripe ? 0.55 : 0.9)
                    ctx.fillRect(x, my, 1, Math.max(1, lh * 0.02))
                }
                if (ch === 'D' || ch === 'L') {
                    const d = doorAt(gs, mapX, mapY)
                    const open = d && (d.open || d.broken)
                    if (open) { ctx.globalAlpha = fog * 0.25 }
                    if (ch === 'L' && !open) {
                        ctx.fillStyle = '#ffd23f'
                        ctx.globalAlpha = fog
                        ctx.fillRect(x - 0, y0 + lh * 0.42, 1, lh * 0.12)
                    }
                }
                if (ch === 'X') {
                    ctx.fillStyle = lite
                    ctx.globalAlpha = fog * (0.5 + 0.5 * Math.sin(gs.tick / 8))
                    ctx.fillRect(x, y0 + lh * 0.35, 1, lh * 0.3)
                }
                ctx.globalAlpha = 1
                void band
            }
        }

        const drawSprite = (name, wx, wy, scale, yOff, glowCol) => {
            const img = SP[name]
            if (!img) return
            const h = gs.hero
            const dx = wx - h.x, dy = wy - h.y
            const dirX = Math.cos(h.a), dirY = Math.sin(h.a)
            const planeX = -dirY * FOV, planeY = dirX * FOV
            const inv = 1 / (planeX * dirY - dirX * planeY)
            const tx = inv * (dirY * dx - dirX * dy)
            const ty = inv * (-planeY * dx + planeX * dy)
            if (ty <= 0.15) return
            const sx = (VW / 2) * (1 + tx / ty)
            const hh = (VH / ty) * scale
            const ww = hh * (img.width / img.height)
            const sy0 = VH / 2 + (VH / 2) * (yOff / ty)
            const x0 = sx - ww / 2, y0 = sy0 - hh
            if (x0 > VW || x0 + ww < 0) return
            const fog = Math.max(0.2, 1 - ty / 11)
            if (glowCol) { ctx.shadowColor = glowCol; ctx.shadowBlur = 8 }
            for (let x = Math.max(0, Math.floor(x0)); x < Math.min(VW, Math.ceil(x0 + ww)); x++) {
                if (ty >= zbuf[x] + 0.25) continue
                const srcX = Math.floor(((x - x0) / ww) * img.width)
                ctx.globalAlpha = fog
                ctx.drawImage(img, srcX, 0, 1, img.height, x, y0, 1, hh)
            }
            ctx.globalAlpha = 1
            ctx.shadowBlur = 0
        }

        const drawWeapon = () => {
            const h = gs.hero
            const swing = h.atkAnim > 0 ? (CFG.swordCool - h.atkAnim) / CFG.swordCool : 0
            const ar = h.arrowT > 14 ? (22 - h.arrowT) / 8 : 0
            const bx = VW / 2 + 34 - swing * 40 - ar * 30
            const by = VH - 26 - swing * 30 - ar * 14
            ctx.save()
            ctx.translate(bx, by)
            ctx.rotate(-0.5 - swing * 1.4 + ar * 0.2)
            ctx.fillStyle = '#8d99b5'
            ctx.fillRect(-3, -46, 6, 44)
            ctx.fillStyle = '#e8eef8'
            ctx.fillRect(-1, -46, 2, 44)
            ctx.fillStyle = '#b8892b'
            ctx.fillRect(-8, -6, 16, 5)
            ctx.fillStyle = '#6b4a22'
            ctx.fillRect(-2, -1, 4, 14)
            ctx.restore()
        }

        const drawMinimap = () => {
            const px = VW + 12, py = 10, s = 3
            ctx.fillStyle = '#05050c'
            ctx.fillRect(px - 2, py - 2, W * s + 4, H * s + 4)
            ctx.strokeStyle = '#3d4a66'
            ctx.strokeRect(px - 2.5, py - 2.5, W * s + 5, H * s + 5)
            const map = gs.explored[gs.level]
            for (let r = 0; r < H; r++) {
                for (let c = 0; c < W; c++) {
                    if (!map[r * W + c]) continue
                    const ch = gs.levelData.grid[r][c]
                    ctx.fillStyle = ch === '#' ? '#4a5568'
                        : ch === 'X' ? ((gs.tick >> 3) % 2 === 0 ? '#54c8ff' : '#1d5a7d')
                            : ch === 'D' ? '#c96a3a'
                                : ch === 'L' ? '#ffd23f' : '#1a2436'
                    ctx.fillRect(px + c * s, py + r * s, s, s)
                }
            }
            const h = gs.hero
            ctx.fillStyle = '#ff5d5d'
            ctx.fillRect(px + h.x * s - 1.5, py + h.y * s - 1.5, 3, 3)
            ctx.strokeStyle = '#ffdddd'
            ctx.beginPath()
            ctx.moveTo(px + h.x * s, py + h.y * s)
            ctx.lineTo(px + (h.x + Math.cos(h.a) * 2) * s, py + (h.y + Math.sin(h.a) * 2) * s)
            ctx.stroke()
        }

        const PORTRAITS = { warrior: 'warrior', valkyrie: 'valkyrie', wizard: 'wizard', elf: 'elf' }

        const drawPanel = () => {
            ctx.fillStyle = '#0b0e18'
            ctx.fillRect(VW, 0, PW, VH)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(VW + 0.5, 0.5, PW - 1, VH - 1)
            drawMinimap()
            const h = gs.hero
            const hero = HEROES[gs.heroKey]
            text(hero.name, VW + PW / 2, VH - 68, 8, '#ffd23f', 2)
            const p = SP[PORTRAITS[gs.heroKey]]
            ctx.drawImage(p, VW + PW / 2 - 14, VH - 62, 28, 28)
            const hy = VH - 30
            ctx.fillStyle = '#301010'
            ctx.fillRect(VW + 10, hy, PW - 20, 6)
            ctx.fillStyle = h.hp > h.maxHp * 0.3 ? '#e83a3a' : (gs.tick >> 2) % 2 ? '#ff8a5d' : '#7d1414'
            ctx.fillRect(VW + 10, hy, (PW - 20) * Math.max(0, h.hp / h.maxHp), 6)
            text('HEALTH', VW + PW / 2, hy + 14, 6, '#8fa3d8')
            text(`KEYS ${gs.keys}`, VW + 16, hy + 26, 7, '#ffd23f', 2, 'left')
            text(`GOLD ${gs.gold}`, VW + 16, hy + 34, 7, '#c9d4ea', 0, 'left')
        }

        const draw = () => {
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, CW, CH)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }
            castView()
            const drawables = []
            for (const m of gs.monsters) drawables.push({ n: m.kind, x: m.x, y: m.y, s: m.kind === 'death' ? 1.15 : m.kind === 'demon' ? 0.95 : 0.7, g: m.kind === 'death' ? '#8fff9f' : null })
            for (const g of gs.gens) if (g.alive) drawables.push({ n: 'gen', x: g.x, y: g.y, s: 0.8, g: '#ff4f4f' })
            for (const it of gs.items) if (!it.taken) drawables.push({ n: it.t === 'gold' ? 'gold' : it.t, x: it.x, y: it.y, s: 0.42, g: it.t === 'key' ? '#ffe27a' : null })
            if (gs.partner && !gs.partner.down) drawables.push({ n: PORTRAITS[gs.partner.name.toLowerCase()] || 'valkyrie', x: gs.partner.x, y: gs.partner.y, s: 0.62 })
            for (const s of gs.shots) drawables.push({ n: s.kind === 'rock' ? 'gold' : null, x: s.x, y: s.y, s: 0.25, g: s.kind === 'fire' ? '#ff8a3f' : null, shot: s })
            drawables.sort((a, b) => {
                const da = (a.x - gs.hero.x) ** 2 + (a.y - gs.hero.y) ** 2
                const db = (b.x - gs.hero.x) ** 2 + (b.y - gs.hero.y) ** 2
                return db - da
            })
            for (const d of drawables) {
                if (d.shot) {
                    ctx.save()
                    ctx.shadowColor = d.g || '#ffd23f'
                    ctx.shadowBlur = 6
                    ctx.fillStyle = d.shot.kind === 'fire' ? '#ff8a3f' : d.shot.kind === 'rock' ? '#8d99b5' : '#e8eef8'
                    const dd = Math.hypot(d.x - gs.hero.x, d.y - gs.hero.y)
                    const r = Math.max(1, 5 / dd)
                    const dirX = Math.cos(gs.hero.a), dirY = Math.sin(gs.hero.a)
                    const tx = d.x - gs.hero.x, ty = d.y - gs.hero.y
                    const along = tx * dirX + ty * dirY
                    const lat = tx * (-dirY) + ty * dirX
                    if (along > 0.1) {
                        ctx.beginPath()
                        ctx.arc(VW / 2 + (lat / along) * VW * 0.55, VH / 2 - (0.1 / along) * VH * 0.55, r, 0, Math.PI * 2)
                        ctx.fill()
                    }
                    ctx.restore()
                    continue
                }
                drawSprite(d.n, d.x, d.y, d.s, 0.32, d.g)
            }
            drawWeapon()
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                if (p.t < 18) { ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 18; ctx.fillRect(p.x, p.y + VH * 0.2, 2, 2); ctx.globalAlpha = 1 }
            }
            while (parts.length && parts[0].t >= 18) parts.shift()
            ctx.restore()

            if (flash > 0) { ctx.fillStyle = `rgba(255,40,40,${flash * 0.03})`; ctx.fillRect(0, 0, VW, VH); flash -= 0.5 }
            if (gs.hero.deadT > 0) {
                const t = (CFG.deathFreeze - gs.hero.deadT) / CFG.deathFreeze
                ctx.fillStyle = `rgba(80,0,0,${0.15 + t * 0.5})`
                ctx.fillRect(0, 0, VW, VH)
            }

            drawPanel()

            // narrator strip
            ctx.fillStyle = '#07070f'
            ctx.fillRect(0, VH, CW, HT)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(0.5, VH + 0.5, CW - 1, HT - 1)
            text(LEVELS[gs.level].name, VW + PW / 2 + 4, VH + 12, 7, '#8fa3d8')
            text(`1UP ${String(gs.score).padStart(6, '0')}`, 12, VH + 12, 8, '#ff5d5d', 3, 'left')
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, VW - 12, VH + 12, 8, '#ffd23f', 3, 'right')
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#ff5d5d'
                ctx.beginPath(); ctx.arc(12 + i * 11, VH + 28, 4, 0, Math.PI * 2); ctx.fill()
            }
            text(`KEYS ${gs.keys}`, VW - 60, VH + 28, 8, '#ffd23f', 2, 'left')
            text(`LVL ${gs.level + 1}/4`, VW - 12, VH + 28, 8, '#8fb0ff', 2, 'right')
            if (toast > 0) { text(toastMsg, CW / 2, VH + 34, 10, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract' || sc === 'select') {
                ctx.fillStyle = 'rgba(3,3,12,0.78)'
                ctx.fillRect(0, 0, CW, CH)
                text('GAUNTLET', CW / 2, 58, 30, '#ffd23f', 14)
                text('ATARI 1985 · FOUR MAZES TO THE TOP', CW / 2, 78, 8, '#8fa3d8')
                if (sc === 'attract') {
                    if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY TO CHOOSE YOUR HERO', CW / 2, 104, 9, '#e9f7ff', 4)
                    const b = board()[0]
                    if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, CW / 2, 122, 8, '#5dc8ff', 3)
                    text('DEMO PLAYS THE PROVEN FULL QUEST', CW / 2, CH - 14, 7, '#5d7094')
                } else {
                    text('CHOOSE YOUR HERO', CW / 2, 96, 10, '#5dff8f', 4)
                    HERO_ORDER.forEach((hk, i) => {
                        const hd = HEROES[hk]
                        const cx = CW / 2 - 108 + i * 72
                        const sel = i === selectHero
                        ctx.strokeStyle = sel ? '#ffd23f' : '#3d4a66'
                        ctx.lineWidth = sel ? 2 : 1
                        ctx.strokeRect(cx - 30, 108, 60, 78)
                        ctx.lineWidth = 1
                        ctx.drawImage(SP[PORTRAITS[hk]], cx - 14, 116, 28, 28)
                        text(hd.name, cx, 156, 7, sel ? '#ffd23f' : '#cfd8ff', sel ? 4 : 0)
                        text(`${i + 1}`, cx - 22, 120, 8, '#8fa3d8')
                        ctx.fillStyle = '#301010'; ctx.fillRect(cx - 24, 162, 48, 4)
                        ctx.fillStyle = '#e83a3a'; ctx.fillRect(cx - 24, 162, 48 * (hd.hp / 170), 4)
                        ctx.fillStyle = '#101a33'; ctx.fillRect(cx - 24, 168, 48, 4)
                        ctx.fillStyle = '#5dc8ff'; ctx.fillRect(cx - 24, 168, 48 * (hd.speed / 1.12), 4)
                        ctx.fillStyle = '#12261a'; ctx.fillRect(cx - 24, 174, 48, 4)
                        ctx.fillStyle = '#5dff8f'; ctx.fillRect(cx - 24, 174, 48 * (hd.arrow / 18), 4)
                    })
                    text('ARROWS PICK · SPACE CONFIRM · C PARTNER ' + (gs.partnerOn ? 'ON' : 'OFF'), CW / 2, 202, 8, '#8fa3d8')
                    text('HP · SPEED · RANGE', CW / 2, 214, 7, '#5d7094')
                }
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.78)'
                ctx.fillRect(0, 0, CW, CH)
                text(gs.end === 'win' ? 'THE GAUNTLET IS DONE!' : 'THE MAZE CLAIMS YOU', CW / 2, 96, 18, gs.end === 'win' ? '#5dff8f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')}  GOLD ${gs.gold}`, CW / 2, 122, 10, '#ffd23f', 4)
                text(gs.end === 'win' ? `${HEROES[gs.heroKey].WHO} SURVIVES ALL FOUR MAZES` : `${HEROES[gs.heroKey].WHO} IS DEAD`, CW / 2, 140, 8, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', CW / 2, 168, 9, '#e9f7ff', 4)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.12)'
            for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1)
        }

        // ---------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250)
            last = now
            if (pausedRef.current) return
            acc += dt
            while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            draw()
            const h = hudRef.current
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.lives) h.lives.textContent = String(gs.lives)
            if (h.level) h.level.textContent = `${gs.level + 1}/4`
        }

        // ---------------------------------------------------------------- input ----
        const startSelect = () => {
            gs = makeGame(0, 'warrior', { partner: gs.partnerOn })
            gs.partnerOn = false
            setMode('select')
        }
        const startPlay = (hk) => {
            const pOn = gs._pSel === 1
            gs = makeGame(Math.floor(Math.random() * 1000) % 97, hk, { partner: pOn })
            gs.partnerOn = pOn
            setMode('play')
            say(`${HEROES[hk].WHO} ENTERS THE ${LEVELS[0].name.replace(/^LEVEL 1 · /, '')}`)
            audioController.playSweep(330, 660, 0.25, 'square', 0.07)
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            const sc = screenRef.current
            if (sc === 'attract') { startSelect(); return }
            if (sc === 'select') {
                if (ev.code === 'ArrowLeft') selectHero = (selectHero + 3) % 4
                if (ev.code === 'ArrowRight') selectHero = (selectHero + 1) % 4
                if (ev.code === 'KeyC') { gs._pSel = gs._pSel === 1 ? 0 : 1 }
                if (ev.code === 'Digit1' || ev.code === 'Space' || ev.code === 'Enter') startPlay(HERO_ORDER[selectHero])
                if (ev.code === 'Digit2') startPlay('valkyrie')
                if (ev.code === 'Digit3') startPlay('wizard')
                if (ev.code === 'Digit4') startPlay('elf')
                return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) startSelect(); return }
            if (ev.code === 'ArrowLeft') keys.l = true
            if (ev.code === 'ArrowRight') keys.r = true
            if (ev.code === 'ArrowUp') keys.u = true
            if (ev.code === 'ArrowDown') keys.d = true
            if (ev.code === 'Space') keys.swordEdge = true
            if (ev.code === 'KeyX' || ev.code === 'KeyF') keys.arrowEdge = true
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = false
            if (ev.code === 'ArrowRight') keys.r = false
            if (ev.code === 'ArrowUp') keys.u = false
            if (ev.code === 'ArrowDown') keys.d = false
        }
        const onPad = (ev) => {
            const d = ev.detail
            if (!d) return
            keys.l = !!d.left; keys.r = !!d.right; keys.u = !!d.up; keys.d = !!d.down
            if (d.action) keys.swordEdge = true
            if (d.second) keys.arrowEdge = true
        }
        const onPointer = (ev) => {
            const sc = screenRef.current
            if (sc === 'attract') { startSelect(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) startSelect(); return }
            if (sc === 'select') {
                const r = canvas.getBoundingClientRect()
                const x = (ev.clientX - r.left) / r.width * CW
                if (x > VW + 40) { startPlay(HERO_ORDER[selectHero]) }
            }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('virtualcontrols', onPad)
        canvas.addEventListener('pointerdown', onPointer)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__gauntletTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ left: false, right: false, fwd: false, back: false, sword: false, arrow: false }) },
                stepWith: (inp) => doSim(inp),
                setKeys: (k) => { keys.l = !!k.l; keys.r = !!k.r; keys.u = !!k.u; keys.d = !!k.d; if (k.s) keys.swordEdge = true; if (k.a) keys.arrowEdge = true },
                plan: (seed = 0, opts) => plan(seed, opts),
                decide: (s) => decide(s || gs),
                restart: () => { gs = makeGame(0, 'warrior') },
                startHero: (hk) => startPlay(hk),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, score: gs.score, lives: gs.lives, level: gs.level, keys: gs.keys, gold: gs.gold,
                    hash: stateHash(gs),
                    hero: { x: gs.hero.x, y: gs.hero.y, a: gs.hero.a, hp: gs.hero.hp, deadT: gs.hero.deadT },
                    monsters: gs.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, hp: m.hp })),
                    gens: gs.gens.map((g) => ({ alive: g.alive, hp: g.hp })),
                    items: gs.items.filter((i) => !i.taken).map((i) => i.t),
                    deathSpawned: gs.deathSpawned, end: gs.end,
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg({
                title: 'GAUNTLET',
                getState: () => [
                    `${gs.levelData.name} hp ${gs.hero.hp}/${gs.hero.maxHp} lives ${gs.lives} keys ${gs.keys} gold ${gs.gold} score ${gs.score}`,
                    `hero ${gs.hero.x.toFixed(2)},${gs.hero.y.toFixed(2)} a ${gs.hero.a.toFixed(2)} deadT ${gs.hero.deadT} death ${gs.deathSpawned ? 'walks' : 'sleeps'}`,
                    gs.monsters.map((m) => `${m.kind}@${m.x.toFixed(1)},${m.y.toFixed(1)} h${m.hp}`).join('\n') || 'halls are quiet',
                    gs.gens.map((g) => `gen ${g.alive ? 'spawning' : 'dead'} hp${g.hp}`).join(' '),
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed, { hero: gs.heroKey, maxTicks: 40000 }); return r.won ? `fresh sim still winnable (deaths ${r.deaths})` : 'fresh sim NOT winnable' } },
                    { label: 'kill all', run: () => { gs.monsters = []; return 'cleared (cheat)' } },
                    { label: 'give key', run: () => { gs.keys++; return `keys ${gs.keys}` } },
                    { label: 'summon death', run: () => { gs.deathSpawned = true; gs.monsters.push({ id: gs._nextId++, kind: 'death', x: gs.hero.x + 4, y: gs.hero.y, hp: MONSTERS.death.hp, atkT: 0, castT: 0, path: [], repathT: 0, drainT: 0 }); return 'DEATH WALKS' } },
                ],
            })
        }

        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('virtualcontrols', onPad)
            if (import.meta.env.DEV) { unmountDbg(); delete window.__gauntletTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'GAUNTLET')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05050c] select-none">
            <div ref={stageRef} className="relative w-full max-w-[720px] aspect-[320/240] shadow-[0_0_40px_rgba(224,58,58,0.25)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>MAZE <span ref={setHud('level')} className="text-[#e9f7ff]">1/4</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#ff5d5d]">3</span></span>
            </div>
            <VirtualControls
                visible={screen === 'play' && !paused}
                secondAction={{ label: 'BOW', code: 'KeyX' }}
            />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default GauntletGame

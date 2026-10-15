// GAUNTLET — the overhead cabinet: a scrolling top-down view that follows the
// hero across four pillar-hall mazes, built on the SHARED engine
// (../Gauntlet/sim.js et al — camera-agnostic; FOUR HALLS uses the same sim
// in first person). 8-way stick: each arrow sets facing AND moves; the sword
// sweeps the arc you face, arrows fly down it. Swarms pour from generators,
// food is the economy, keys open the exit, and when the timer dies so does
// DEATH. All art and audio synthesized at runtime.
//
// Layout: 1. setup 2. overhead render 3. panel/HUD 4. loop
// 5. input 6. DEV hook + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { LEVELS, W, H, HEROES, HERO_ORDER } from './levels.js'
import { makeGame, step, stateHash, CFG, doorAt } from './sim.js'
import { plan, decide } from './planner.js'
import { buildSprites, MATERIALS } from './art.js'
import { buzz, narratorKind, STAIRS_FANFARE } from './sound.js'

const VW = 256, VH = 200, PW = 64, HT = 40
const CW = VW + PW, CH = VH + HT
const PX = 16
const SIM_MS = 1000 / 60
let proven = null
const provenRun = () => { if (!proven) proven = plan(2, { topDown: true, maxTicks: 60000 }); return proven }

const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

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

        let gs = makeGame(0, 'warrior', { topDown: true })
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0, selectHero = 0
        const keys = { l: false, r: false, u: false, d: false, swordEdge: false, arrowEdge: false }
        const evLog = []
        const parts = []

        const say = (m, kind) => {
            toastMsg = m; toast = 150
            const sig = buzz(kind || narratorKind(m))
            sig.notes.forEach((f, i) => audioController.playTone(f, 0.08, sig.wave, 0.05, i * 0.07))
        }
        const burst = (px, py, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2.2
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
                else if (e.type === 'monsterHit') { audioController.playNoise(0.04, 0.05); burst(VW / 2, VH / 2, 4, '#ffd23f') }
                else if (e.type === 'kill') { audioController.playSweep(520, 120, 0.18, 'square', 0.07); burst(VW / 2, VH / 2, 8, e.potion ? '#8fb0ff' : '#ff8a5d') }
                else if (e.type === 'hit') { audioController.playNoise(0.09, 0.09); audioController.playTone(120, 0.1, 'square', 0.08); shake = 5; flash = 6 }
                else if (e.type === 'cast') audioController.playSweep(240, 480, 0.14, 'sawtooth', 0.05)
                else if (e.type === 'drain') { audioController.playTone(70 + (gs.tick % 3) * 10, 0.05, 'triangle', 0.05); flash = 3 }
                else if (e.type === 'pickup') {
                    if (e.t === 'food') audioController.playSweep(330, 660, 0.18, 'square', 0.07)
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
                else if (e.type === 'deathSpawn') { audioController.playSweep(220, 55, 0.8, 'sawtooth', 0.09) }
                else if (e.type === 'death') { audioController.playDeath(); shake = 9; flash = 14 }
                else if (e.type === 'levelClear') { STAIRS_FANFARE.forEach((f, i) => audioController.playTone(f, 0.13, 'square', 0.08, i * 0.11)); say(LEVELS[e.level].name.replace(/^LEVEL \d+ · /, '') + ' CLEARED') }
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
            if (demoAt >= run.script.length) { gs = makeGame(2, 'warrior', { topDown: true }); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(2, 'warrior', { topDown: true }); demoAt = 0 }
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

        const cell = (c, r) => {
            if (c < 0 || r < 0 || c >= W || r >= H) return '#'
            return gs.levelData.grid[r][c]
        }

        const sprite = (name, wx, wy, size, wob = true) => {
            const frames = SP[name]
            if (!frames || !frames.length) return
            const img = frames[wob ? (gs.tick >> 3) % frames.length : 0]
            const s = size / img.height
            ctx.drawImage(img, Math.round(wx - (img.width * s) / 2), Math.round(wy - (img.height * s) / 2), Math.round(img.width * s), Math.round(img.height * s))
        }

        const drawView = () => {
            const h = gs.hero
            const mat = MATERIALS[gs.levelData.material]
            let camX = h.x * PX - VW / 2, camY = h.y * PX - VH / 2
            camX = Math.max(0, Math.min(W * PX - VW, camX))
            camY = Math.max(0, Math.min(H * PX - VH, camY))
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, VW, VH)
            const c0 = Math.floor(camX / PX), r0 = Math.floor(camY / PX)
            const c1 = Math.min(W - 1, c0 + Math.ceil(VW / PX) + 1), r1 = Math.min(H - 1, r0 + Math.ceil(VH / PX) + 1)
            // floor first, then wall blocks on top (raised by 2px face + shadow)
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const ch = cell(c, r)
                    if (ch === '#') continue
                    const x = Math.round(c * PX - camX), y = Math.round(r * PX - camY)
                    const n = hash2(c, r)
                    ctx.fillStyle = n < 0.5 ? '#1a1723' : '#171420'
                    ctx.fillRect(x, y, PX, PX)
                    ctx.fillStyle = 'rgba(255,255,255,0.035)'
                    ctx.fillRect(x + 2, y + 2, PX - 4, 1)
                    if (n > 0.82) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3 + Math.floor(n * 9), y + 6 + Math.floor(n * 7), 2, 1) }
                    if (ch === 'X') {
                        ctx.fillStyle = '#0e2e42'
                        ctx.fillRect(x + 2, y + 2, PX - 4, PX - 4)
                        for (let st = 0; st < 3; st++) {
                            ctx.fillStyle = st === ((gs.tick >> 3) % 3) ? '#54c8ff' : '#1d5a7d'
                            ctx.fillRect(x + 3 + st * 3, y + PX - 5 - st * 4, PX - 6 - st * 2, 3)
                        }
                    }
                    if (ch === 'D' || ch === 'L') {
                        const d = doorAt(gs, c, r)
                        if (d && d.broken) {
                            ctx.fillStyle = '#3d2a12'
                            for (let k = 0; k < 5; k++) ctx.fillRect(x + 2 + (k * 5) % 12, y + PX - 4 - (k % 2) * 2, 4, 3)
                        } else if (d && d.open) {
                            ctx.fillStyle = 'rgba(107,74,34,0.9)'
                            ctx.fillRect(x, y, PX, 2)
                            ctx.fillRect(x, y, 2, PX); ctx.fillRect(x + PX - 2, y, 2, PX)
                        } else {
                            ctx.fillStyle = '#6b4a22'
                            ctx.fillRect(x + 1, y + 1, PX - 2, PX - 2)
                            ctx.fillStyle = '#9c7038'
                            ctx.fillRect(x + 1, y + 1, PX - 2, 2)
                            ctx.fillStyle = '#3d2a12'
                            for (let my = y + 4; my < y + PX - 2; my += 3) ctx.fillRect(x + 2, my, PX - 4, 1)
                            if (ch === 'L') {
                                ctx.fillStyle = '#ffd23f'
                                ctx.fillRect(x + PX / 2 - 2, y + PX / 2 - 2, 4, 4)
                            } else {
                                ctx.fillStyle = '#20180e'
                                ctx.fillRect(x + PX / 2 - 1, y + 3, 2, 3); ctx.fillRect(x + PX / 2 - 1, y + PX - 6, 2, 3)
                            }
                        }
                    }
                }
            }
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    if (cell(c, r) !== '#') continue
                    const x = Math.round(c * PX - camX), y = Math.round(r * PX - camY)
                    ctx.fillStyle = 'rgba(0,0,0,0.55)'
                    ctx.fillRect(x + 2, y + 3, PX, PX)
                    ctx.fillStyle = (c + r) % 2 === 0 ? mat.dark : mat.base
                    ctx.fillRect(x, y, PX, PX - 2)
                    ctx.fillStyle = mat.lite
                    ctx.fillRect(x, y, PX, 2)
                    ctx.fillStyle = mat.mortar
                    ctx.fillRect(x, y + 5, PX, 1); ctx.fillRect(x, y + 10, PX, 1)
                    ctx.fillRect(x + ((r % 2) * 8) + 4, y, 1, PX - 2)
                }
            }
            const sx = (wx) => Math.round(wx * PX - camX), sy = (wy) => Math.round(wy * PX - camY)
            for (const it of gs.items) {
                if (it.taken) continue
                const bob = Math.sin(gs.tick / 9 + it.x) * 1.5
                ctx.save()
                if (it.t === 'key') { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 5 }
                sprite(it.t === 'gold' ? 'gold' : it.t, sx(it.x), sy(it.y) + bob, it.t === 'food' ? 10 : 9, false)
                ctx.restore()
            }
            for (const g of gs.gens) {
                if (!g.alive) continue
                ctx.save()
                ctx.shadowColor = '#ff4f4f'
                ctx.shadowBlur = 6 + Math.sin(gs.tick / 6) * 3
                sprite('gen', sx(g.x), sy(g.y), 12, false)
                ctx.restore()
            }
            for (const s of gs.shots) {
                ctx.save()
                ctx.shadowColor = s.kind === 'arrow' ? '#e8eef8' : s.kind === 'fire' ? '#ff8a3f' : '#8d99b5'
                ctx.shadowBlur = 5
                ctx.fillStyle = s.kind === 'arrow' ? '#e8eef8' : s.kind === 'fire' ? '#ff8a3f' : '#8d99b5'
                const px = sx(s.x), py = sy(s.y)
                ctx.fillRect(px - Math.round(s.dx * 3) - 1, py - Math.round(s.dy * 3) - 1, 3, 3)
                ctx.fillRect(px - Math.round(s.dx * 5) - 1, py - Math.round(s.dy * 5) - 1, 2, 2)
                ctx.restore()
            }
            const mons = [...gs.monsters].sort((a, b) => a.y - b.y)
            for (const m of mons) {
                const big = m.kind === 'death' ? 15 : m.kind === 'demon' ? 13 : 11
                if (m.kind === 'death') { ctx.save(); ctx.shadowColor = '#8fff9f'; ctx.shadowBlur = 8 }
                sprite(m.kind, sx(m.x), sy(m.y), big)
                if (m.kind === 'death') ctx.restore()
            }
            if (gs.partner && !gs.partner.down) sprite(gs.partner.name.toLowerCase(), sx(gs.partner.x), sy(gs.partner.y), 11)
            // facing dagger: the sword arc, rendered honestly
            const hx = sx(h.x), hy = sy(h.y)
            ctx.strokeStyle = 'rgba(232,238,248,0.35)'
            ctx.beginPath()
            ctx.moveTo(hx + Math.cos(h.a) * 5, hy + Math.sin(h.a) * 5)
            ctx.lineTo(hx + Math.cos(h.a) * 10, hy + Math.sin(h.a) * 10)
            ctx.stroke()
            if (h.atkAnim > 0) {
                const t = 1 - h.atkAnim / CFG.swordCool
                ctx.strokeStyle = 'rgba(232,238,248,0.8)'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.arc(hx, hy, 12, h.a - CFG.swordArc + t * CFG.swordArc * 2 - 0.3, h.a - CFG.swordArc + t * CFG.swordArc * 2 + 0.3)
                ctx.stroke()
                ctx.lineWidth = 1
            }
            const blink = h.deadT > 0 && (gs.tick >> 2) % 2 === 0
            if (!blink) sprite(gs.heroKey, hx, hy, 12)
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                if (p.t < 18) { ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 18; ctx.fillRect(VW / 2 + p.x, VH / 2 + p.y, 2, 2); ctx.globalAlpha = 1 }
            }
            while (parts.length && parts[0].t >= 18) parts.shift()
            const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.34, VW / 2, VH / 2, VH * 0.72)
            vg.addColorStop(0, 'rgba(0,0,0,0)')
            vg.addColorStop(1, 'rgba(0,0,0,0.62)')
            ctx.fillStyle = vg
            ctx.fillRect(0, 0, VW, VH)
        }

        const drawPanel = () => {
            ctx.fillStyle = '#0b0e18'
            ctx.fillRect(VW, 0, PW, VH)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(VW + 0.5, 0.5, PW - 1, VH - 1)
            const px = VW + 8, py = 8, s = 2
            ctx.fillStyle = '#05050c'
            ctx.fillRect(px - 2, py - 2, W * s + 4, H * s + 4)
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
            ctx.fillRect(px + h.x * s - 1, py + h.y * s - 1, 2, 2)
            const hy = VH - 58
            sprite(gs.heroKey, VW + PW / 2, hy, 20, false)
            text(HEROES[gs.heroKey].name, VW + PW / 2, hy + 16, 6, '#ffd23f', 2)
            ctx.fillStyle = '#301010'
            ctx.fillRect(VW + 8, hy + 22, PW - 16, 5)
            ctx.fillStyle = h.hp > h.maxHp * 0.3 ? '#e83a3a' : (gs.tick >> 2) % 2 ? '#ff8a5d' : '#7d1414'
            ctx.fillRect(VW + 8, hy + 22, (PW - 16) * Math.max(0, h.hp / h.maxHp), 5)
            text('HEALTH', VW + PW / 2, hy + 33, 5, '#8fa3d8')
            text(`KEYS ${gs.keys}`, VW + PW / 2, hy + 44, 7, '#ffd23f', 2)
            text(`GOLD ${gs.gold}`, VW + PW / 2, hy + 53, 7, '#c9d4ea')
        }

        const draw = () => {
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, CW, CH)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }
            drawView()
            ctx.restore()
            if (flash > 0) { ctx.fillStyle = `rgba(255,40,40,${flash * 0.03})`; ctx.fillRect(0, 0, VW, VH); flash -= 0.5 }
            drawPanel()

            ctx.fillStyle = '#07070f'
            ctx.fillRect(0, VH, CW, HT)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(0.5, VH + 0.5, CW - 1, HT - 1)
            text(LEVELS[gs.level].name, CW / 2, VH + 12, 7, '#8fa3d8')
            text(`1UP ${String(gs.score).padStart(6, '0')}`, 12, VH + 12, 8, '#ff5d5d', 3, 'left')
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, CW - PW - 12, VH + 12, 8, '#ffd23f', 3, 'right')
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#ff5d5d'
                ctx.beginPath(); ctx.arc(12 + i * 11, VH + 28, 4, 0, Math.PI * 2); ctx.fill()
            }
            text(`LVL ${gs.level + 1}/4`, CW - PW - 12, VH + 28, 8, '#8fb0ff', 2, 'right')
            if (toast > 0) { text(toastMsg, (VW + PW) / 2, VH + 34, 10, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract' || sc === 'select') {
                ctx.fillStyle = sc === 'select' ? '#05050c' : 'rgba(3,3,12,0.78)'
                ctx.fillRect(0, 0, CW, CH)
                text('GAUNTLET', CW / 2, 58, 30, '#ffd23f', 14)
                text('ATARI 1985 · FOUR MAZES · OVERHEAD', CW / 2, 78, 8, '#8fa3d8')
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
                        ctx.fillStyle = '#0b0e18'
                        ctx.fillRect(cx - 30, 108, 60, 78)
                        ctx.strokeStyle = sel ? '#ffd23f' : '#3d4a66'
                        ctx.lineWidth = sel ? 2 : 1
                        ctx.strokeRect(cx - 30, 108, 60, 78)
                        ctx.lineWidth = 1
                        sprite(hk, cx, 130, 26, false)
                        text(hd.name, cx, 156, 7, sel ? '#ffd23f' : '#cfd8ff', sel ? 4 : 0)
                        text(`${i + 1}`, cx - 22, 120, 8, '#8fa3d8')
                        ctx.fillStyle = '#301010'; ctx.fillRect(cx - 24, 162, 48, 4)
                        ctx.fillStyle = '#e83a3a'; ctx.fillRect(cx - 24, 162, 48 * (hd.hp / 170), 4)
                        ctx.fillStyle = '#101a33'; ctx.fillRect(cx - 24, 168, 48, 4)
                        ctx.fillStyle = '#5dc8ff'; ctx.fillRect(cx - 24, 168, 48 * (hd.speed / 1.12), 4)
                        ctx.fillStyle = '#12261a'; ctx.fillRect(cx - 24, 174, 48, 4)
                        ctx.fillStyle = '#5dff8f'; ctx.fillRect(cx - 24, 174, 48 * (hd.arrow / 18), 4)
                    })
                    text('ARROWS PICK · SPACE CONFIRM · C PARTNER ' + (gs._pSel === 1 ? 'ON' : 'OFF'), CW / 2, 202, 8, '#8fa3d8')
                    text('HP · SPEED · RANGE', CW / 2, 214, 7, '#5d7094')
                }
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.82)'
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
            const hud = hudRef.current
            if (hud.score) hud.score.textContent = String(gs.score).padStart(6, '0')
            if (hud.lives) hud.lives.textContent = String(gs.lives)
            if (hud.level) hud.level.textContent = `${gs.level + 1}/4`
        }

        // ---------------------------------------------------------------- input ----
        const startSelect = () => {
            gs = makeGame(0, 'warrior', { topDown: true })
            gs.partnerOn = false
            setMode('select')
        }
        const startPlay = (hk) => {
            const pOn = gs._pSel === 1
            gs = makeGame(Math.floor(Math.random() * 1000) % 97, hk, { partner: pOn, topDown: true })
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
                if (ev.code === 'KeyC') gs._pSel = gs._pSel === 1 ? 0 : 1
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
                if (x > VW + 40) startPlay(HERO_ORDER[selectHero])
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
                plan: (seed = 0, opts) => plan(seed, { topDown: true, ...opts }),
                decide: (s) => decide(s || gs),
                restart: () => { gs = makeGame(0, 'warrior', { topDown: true }) },
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
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed, { hero: gs.heroKey, topDown: true, maxTicks: 40000 }); return r.won ? `fresh sim still winnable (deaths ${r.deaths})` : 'fresh sim NOT winnable' } },
                    { label: 'kill all', run: () => { gs.monsters = []; return 'cleared (cheat)' } },
                    { label: 'give key', run: () => { gs.keys++; return `keys ${gs.keys}` } },
                    { label: 'summon death', run: () => { gs.deathSpawned = true; gs.monsters.push({ id: gs._nextId++, kind: 'death', x: gs.hero.x + 4, y: gs.hero.y, hp: 24, atkT: 0, castT: 0, path: [], repathT: 0, drainT: 0 }); return 'DEATH WALKS' } },
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
            />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default GauntletGame

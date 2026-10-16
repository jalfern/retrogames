// DIG DUG — the arcade shell. Everything visible is drawn at runtime from the
// pure sim in ./sim.js at 1:1 on a 288x224 canvas: dirt layers, the carved
// tunnels the sim owns, rocks on their support columns, and the attract demo
// is planner.js's OWN proven run replayed tick-for-tick through real step()
// (the same seeds dugcheck grades: deathless full clear).
//
// Layout: 1. palette + painters 2. fixed-timestep loop (250ms catch-up — the
// heist lesson) 3. input 4. DEV hook + DebugKit 5. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, CELL, COLS, AIR_TOP, DIRT_TOP, DIRT_BOT, FLOOR_ROW, FIELD_Y0, LAYERS, layerOf, ROUNDS } from './levels.js'
import { makeGame, step, stateHash } from './sim.js'
import { plan, decide } from './planner.js'

const SIM_MS = 1000 / 60
let proven = null
const provenRun = () => { if (!proven) proven = plan(0); return proven }

const cx = (c) => c * CELL + CELL / 2
const cy = (r) => FIELD_Y0 + r * CELL + CELL / 2

const DigDugGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('digdug.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.digdugStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, walkNote = 0, tintT = 0
        const keys = { l: false, r: false, u: false, d: false, fEdge: false }
        const evLog = []
        const parts = []
        const pops = []

        const say = (m) => { if (screenRef.current === 'attract') return; toastMsg = m; toast = 110 }
        const pop = (px, py, msg) => { if (screenRef.current === 'attract') return; pops.push({ x: px, y: py, t: 0, msg }) }
        const burst = (px, py, n, col, s = 2) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col, s })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'dig') { audioController.playNoise(0.03, 0.035); burst(e.col * CELL + 8, FIELD_Y0 + e.row * CELL + 8, 4, LAYERS[e.layer], 3) }
                else if (e.type === 'harpoon') audioController.playSweep(900, 300, 0.06, 'square', 0.04)
                else if (e.type === 'hook') { audioController.playSweep(240, 520, 0.1, 'square', 0.06) }
                else if (e.type === 'puff') { audioController.playSweep(300 + e.stage * 140, 380 + e.stage * 180, 0.07, 'square', 0.07) }
                else if (e.type === 'pumpKill') { say(`+${e.pts}`); pop(e.x, e.y, `+${e.pts}`); audioController.playNoise(0.08, 0.08); audioController.playSweep(600, 1400, 0.2, 'square', 0.08); burst(e.x, e.y, 10, '#ffd23f') }
                else if (e.type === 'deflate') audioController.playSweep(420 - (3 - e.stage) * 60, 260, 0.08, 'triangle', 0.05)
                else if (e.type === 'rockWarn') audioController.playTone(160, 0.06, 'square', 0.05)
                else if (e.type === 'rockFall') audioController.playNoise(0.12, 0.06)
                else if (e.type === 'rockKill') { say(`CRUSHED +${e.pts}`); pop(e.x, e.y, `+${e.pts}`); audioController.playNoise(0.14, 0.09); burst(e.x, e.y, 12, '#cfd8ff') }
                // landing: low rumble under a debris noise bed, not one tone
                else if (e.type === 'rockLand') { shake = 6; audioController.playNoise(0.22, 0.1); audioController.playTone(55, 0.26, 'sine', 0.1) }
                else if (e.type === 'veggieSpawn') audioController.playSweep(520, 980, 0.2, 'triangle', 0.06)
                // pickup jingle: rising three, not one sweep
                else if (e.type === 'veggie') { say(`VEGGIE +${e.pts}`); pop(e.col * CELL + 8, FIELD_Y0 + e.row * CELL + 8, `+${e.pts}`); audioController.playTone(660, 0.08, 'square', 0.07); audioController.playTone(880, 0.08, 'square', 0.07, 0.08); audioController.playTone(1100, 0.14, 'square', 0.07, 0.16) }
                else if (e.type === 'fire') audioController.playNoise(0.3, 0.05)
                else if (e.type === 'flee') { say('LAST ONE RUNS!'); tintT = 60 }
                else if (e.type === 'escaped') say('IT ESCAPED!')
                else if (e.type === 'death') { say('LOST!'); audioController.playDeath(); shake = 8 }
                else if (e.type === 'roundClear') { say(`${ROUNDS[e.round].name} CLEAR +${e.pts}`); audioController.playTone(523, 0.12, 'square', 0.08); audioController.playTone(659, 0.12, 'square', 0.08, 0.12); audioController.playTone(784, 0.22, 'square', 0.08, 0.24) }
                // the beat that drops the READY board and starts the dig
                else if (e.type === 'round') { say(ROUNDS[gs.round].name); audioController.playTone(660, 0.07, 'square', 0.07); audioController.playTone(880, 0.1, 'square', 0.07, 0.07) }
                else if (e.type === '1up') { say('1UP!'); audioController.playSweep(440, 1760, 0.5, 'square', 0.08) }
                else if (e.type === 'win') { say('THE DIG IS DONE!'); audioController.playSweep(220, 1760, 0.9, 'square', 0.1); shake = 10 }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('digdug.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
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
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ left: keys.l, right: keys.r, up: keys.u, down: keys.d, fire: keys.fEdge })
            keys.fEdge = false
        }

        // ---------------------------------------------------------------- paint ----
        const text = (s, x, y, size, col, glow) => {
            ctx.font = `bold ${size}px monospace`
            ctx.textAlign = 'center'
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col
            ctx.fillText(s, x, y)
            ctx.shadowBlur = 0
        }
        const hash2 = (a, b) => {
            let h = (a * 374761393 + b * 668265263) >>> 0
            h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
            return (h ^ (h >>> 16)) >>> 0
        }
        const drawDirt = () => {
            for (let r = DIRT_TOP; r <= DIRT_BOT; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (!gs.dirt[r][c]) continue
                    const x = c * CELL, y = FIELD_Y0 + r * CELL
                    const layer = layerOf(r)
                    ctx.fillStyle = LAYERS[layer]
                    ctx.fillRect(x, y, CELL, CELL)
                    ctx.fillStyle = 'rgba(0,0,0,0.18)'
                    ctx.fillRect(x, y + CELL - 1, CELL, 1)
                    ctx.fillStyle = 'rgba(255,255,255,0.10)'
                    ctx.fillRect(x, y, CELL, 1)
                    for (let i = 0; i < 4; i++) {
                        const hh = hash2(c * 8 + i, r)
                        ctx.fillStyle = hh & 1 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)'
                        ctx.fillRect(x + (hh % (CELL - 2)), y + ((hh >> 4) % (CELL - 2)), 2, 1)
                    }
                }
            }
            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(0, FIELD_Y0 + (FLOOR_ROW) * CELL - 4, W, 4)
        }
        const drawRock = (k) => {
            const x = k.col * CELL, yBase = k.state === 'held' || k.state === 'warn' ? cy(k.row) : k.y
            const squash = k.state === 'land' ? (12 - k.squash) * 0.4 : 0
            ctx.fillStyle = '#8d99b5'
            ctx.beginPath(); ctx.arc(x + CELL / 2, yBase + squash, CELL / 2 + 1, Math.PI, 0); ctx.fill()
            ctx.fillRect(x, yBase + squash - 1, CELL, 4)
            ctx.fillStyle = '#5b6884'
            ctx.fillRect(x + 2, yBase + squash + 1, CELL - 4, 3)
            ctx.fillStyle = '#c9d4ea'
            ctx.fillRect(x + 3, yBase + squash - 3, 4, 2)
            if ((k.state === 'warn' || k.state === 'fall') && (gs.tick >> 2) % 2 === 0) {
                ctx.fillStyle = '#ffd23f'
                ctx.fillRect(x + CELL / 2 - 1, yBase - CELL - 4, 2, 3)
            }
        }
        const drawVeggie = (v) => {
            if (!v.live || v.taken) return
            const x = cx(v.col), y = cy(v.row) + Math.sin((gs.tick + v.bob * 9) / 22)
            ctx.fillStyle = '#ff8a3f'
            ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#5dff8f'
            ctx.fillRect(x - 3, y - 7, 2, 3); ctx.fillRect(x + 1, y - 7, 2, 3)
        }
        const drawPlayer = () => {
            const p = gs.player
            if (p.deadT > 0) {
                const t = (90 - p.deadT) / 90
                ctx.fillStyle = '#e9f7ff'
                ctx.beginPath(); ctx.arc(p.x, p.y, 8 + t * 10, 0, Math.PI * 2); ctx.globalAlpha = 1 - t; ctx.fill(); ctx.globalAlpha = 1
                return
            }
            const stepF = p.moving ? Math.floor(gs.tick / 7) % 2 : 0
            ctx.fillStyle = '#2a5fd0'
            ctx.fillRect(p.x - 4, p.y - 3, 8, 8)
            ctx.fillStyle = '#e9f7ff'
            ctx.beginPath(); ctx.arc(p.x, p.y - 4, 5, Math.PI, 0); ctx.fill()
            ctx.fillRect(p.x - 5, p.y - 4, 10, 2)
            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(p.x + (p.dir[0] >= 0 ? 1 : -3), p.y - 3, 2, 2)
            ctx.fillStyle = '#ffd23f'
            if (stepF === 0) ctx.fillRect(p.x - 5, p.y + 5, 3, 2); else ctx.fillRect(p.x + 2, p.y + 5, 3, 2)
        }
        const drawEnemy = (e) => {
            if (e.state === 'gone') return
            const puffed = e.stage
            if (e.ghost && puffed === 0) {
                const blink = (gs.tick >> 3) % 4 !== 0
                if (blink) { ctx.fillStyle = '#ffffff'; ctx.fillRect(e.x - 4, e.y - 1, 3, 3); ctx.fillRect(e.x + 1, e.y - 1, 3, 3) }
                return
            }
            const r = 7 + puffed * 2.5
            if (e.kind === 'pooka') {
                ctx.fillStyle = e.flee && (gs.tick >> 3) % 2 === 0 ? '#ff8a5d' : '#e05d3a'
                ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#ffd23f'
                ctx.fillRect(e.x - 6, e.y - 3, 12, 2)
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(e.x - 3, e.y + 1, 2.6, 0, Math.PI * 2); ctx.arc(e.x + 3, e.y + 1, 2.6, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x - 3 + Math.sign(gs.player.x - e.x), e.y + 1, 1.6, 1.6)
                ctx.fillRect(e.x + 3 + Math.sign(gs.player.x - e.x), e.y + 1, 1.6, 1.6)
                if (puffed > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(e.x - r * 0.35, e.y - r * 0.35, r * 0.4, 0, Math.PI * 2); ctx.stroke() }
            } else {
                ctx.fillStyle = e.flee && (gs.tick >> 3) % 2 === 0 ? '#7dff9f' : '#3fae5c'
                ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#2c7d41'
                ctx.beginPath(); ctx.arc(e.x - r * 0.4, e.y - r * 0.6, 3.4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#fff'
                ctx.fillRect(e.x + (e.fireDir >= 0 || gs.player.x >= e.x ? 2 : -6), e.y - 2, 4, 3)
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x + (e.fireDir >= 0 || gs.player.x >= e.x ? 4 : -4), e.y - 1, 1.6, 1.6)
                ctx.fillStyle = '#ffd23f'
                ctx.fillRect(e.x - r, e.y + r - 2, 3, 2); ctx.fillRect(e.x + r - 3, e.y + r - 2, 3, 2)
                if (e.fireT > 0) {
                    const dir = e.fireDir || 1
                    for (let i = 0; i < e.fireLen; i += 3) {
                        const fx = e.x + dir * (r + i)
                        if (gs.dirt[Math.floor((e.y - FIELD_Y0) / CELL)] && gs.dirt[Math.floor((e.y - FIELD_Y0) / CELL)][Math.floor(fx / CELL)]) break
                        const g = i / Math.max(1, e.fireLen)
                        ctx.fillStyle = g < 0.5 ? '#ffd23f' : '#ff5d2f'
                        ctx.globalAlpha = 1 - g * 0.6
                        ctx.fillRect(fx - 1.5, e.y - 4 + Math.sin((gs.tick + i) / 3), 3, 7 - g * 3)
                        ctx.globalAlpha = 1
                    }
                }
            }
        }
        const drawHarpoon = () => {
            const h = gs.harpoon
            if (!h) return
            ctx.strokeStyle = '#e9f7ff'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(gs.player.x + h.dx * 6, gs.player.y + h.dy * 6)
            ctx.lineTo(gs.player.x + h.dx * h.len, gs.player.y + h.dy * h.len)
            ctx.stroke()
            ctx.fillStyle = '#cfd8ff'
            ctx.fillRect(gs.player.x + h.dx * h.len - 2, gs.player.y + h.dy * h.len - 2, 4, 4)
        }

        const draw = () => {
            ctx.fillStyle = '#050510'
            ctx.fillRect(0, 0, W, H)
            const sky = ctx.createLinearGradient(0, 0, 0, H)
            sky.addColorStop(0, '#070722'); sky.addColorStop(1, '#050510')
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, W, H)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }

            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(0, 0, W, FIELD_Y0 + AIR_TOP * CELL)
            ctx.fillStyle = '#1a2c52'
            ctx.fillRect(0, FIELD_Y0 + (AIR_TOP - 1) * CELL + CELL - 2, W, 2)

            drawDirt()
            for (const v of gs.veggies) drawVeggie(v)
            for (const k of gs.rocks) drawRock(k)
            for (const e of gs.enemies) drawEnemy(e)
            drawHarpoon()
            drawPlayer()

            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                ctx.fillStyle = p.col
                if (p.t < 18) ctx.fillRect(p.x, p.y, 2, 2)
            }
            while (parts.length && parts[0].t >= 18) parts.shift()
            ctx.restore()

            ctx.fillStyle = 'rgba(0,0,0,0.14)'
            for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
            // the last survivor runs: a brief warm flash while it does
            if (tintT > 0) {
                ctx.fillStyle = 'rgba(255,93,47,0.10)'
                ctx.fillRect(0, 0, W, H)
                tintT--
            }

            text(`1UP ${String(gs.score).padStart(6, '0')}`, 44, 11, 9, '#ff5d5d', 3)
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, W - 44, 11, 9, '#ffd23f', 3)
            text(ROUNDS[gs.round].name, W / 2, 11, 8, '#8fa3d8', 0)
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#e9f7ff'
                ctx.beginPath(); ctx.arc(8 + i * 10, H - 7, 3, 0, Math.PI * 2); ctx.fill()
            }
            text(`${gs.kills}/${ROUNDS[gs.round].goal}`, W - 16, H - 4, 8, '#5dff8f', 3)
            if (toast > 0) { text(toastMsg, W / 2, H / 2 - 26, 10, '#e9f7ff', 6); toast-- }
            // score popups: float up from the kill/pickup point and fade
            for (const q of pops) {
                q.t++
                if (q.t < 70) {
                    ctx.globalAlpha = q.t > 40 ? (70 - q.t) / 30 : 1
                    text(q.msg, q.x, q.y - 10 - q.t * 0.35, 8, '#ffd23f', 2)
                    ctx.globalAlpha = 1
                }
            }
            while (pops.length && pops[0].t >= 70) pops.shift()

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,3,12,0.62)'
                ctx.fillRect(0, 0, W, H)
                text('DIG DUG', W / 2, 74, 26, '#5dff8f', 12)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY TO START', W / 2, 130, 9, '#ffd23f', 5)
                const b = board()[0]
                if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 150, 8, '#5dc8ff', 3)
                // one message at a time, cycling (ART.md rule 6)
                const msg = Math.floor(gs.tick / 120) % 2
                if (msg === 0) text('PUMP THE POOKAS — DROP THE ROCKS', W / 2, 180, 8, '#8fa3d8', 0)
                else text('DEMO PLAYS THE PROVEN FULL CLEAR', W / 2, 180, 7, '#5d7094', 0)
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.72)'
                ctx.fillRect(0, 0, W, H)
                text(gs.end === 'win' ? 'THE DIG IS DONE' : 'GAME OVER', W / 2, 88, 16, gs.end === 'win' ? '#5dff8f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')}`, W / 2, 112, 10, '#ffd23f', 4)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 140, 9, '#e9f7ff', 4)
            }
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
            // the walking tune: notes only while the digger moves
            const walking = screenRef.current === 'play' && gs.player.moving && gs.player.deadT === 0
            if (walking) {
                walkNote++
                if (walkNote % 8 === 0) audioController.playTone(196 * Math.pow(2, [0, 2, 4, 7, 9, 7, 4, 2][Math.floor(walkNote / 8) % 8] / 12), 0.07, 'square', 0.035)
            } else walkNote = 0
            const h = hudRef.current
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.lives) h.lives.textContent = String(gs.lives)
            if (h.round) h.round.textContent = ROUNDS[gs.round].name
        }

        // ---------------------------------------------------------------- input ----
        const startPlay = () => {
            gs = makeGame(0)
            setMode('play')
            say(ROUNDS[0].name)
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = true
            if (ev.code === 'ArrowRight') keys.r = true
            if (ev.code === 'ArrowUp') keys.u = true
            if (ev.code === 'ArrowDown') keys.d = true
            if (ev.code === 'Space') keys.fEdge = true
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p) }
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over' && performance.now() - overAtRef.current > 900) { startPlay(); return }
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
            if (d.action) keys.fEdge = true
            if (screenRef.current === 'attract') startPlay()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('virtualcontrols', onPad)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__dugTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ left: false, right: false, up: false, down: false, fire: false }) },
                stepWith: (inp) => doSim(inp),
                setKeys: (k) => { keys.l = !!k.l; keys.r = !!k.r; keys.u = !!k.u; keys.d = !!k.d; if (k.f) keys.fEdge = true },
                plan: (seed = 0, opts) => plan(seed, opts),
                decide: (seedlessState) => decide(seedlessState || gs),
                restart: () => { gs = makeGame(0) },
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, score: gs.score, lives: gs.lives, round: gs.round, kills: gs.kills,
                    hash: stateHash(gs),
                    player: { x: gs.player.x, y: gs.player.y, deadT: gs.player.deadT, moving: gs.player.moving },
                    enemies: gs.enemies.map((e) => ({ kind: e.kind, x: e.x, y: e.y, stage: e.stage, ghost: e.ghost, flee: e.flee })),
                    rocks: gs.rocks.map((k) => ({ col: k.col, state: k.state })),
                    veggies: gs.veggies.map((v) => ({ col: v.col, row: v.row, live: v.live, taken: !!v.taken })),
                    end: gs.end,
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg({
                title: 'DIG DUG',
                getState: () => [
                    `round ${gs.round + 1} kills ${gs.kills}/${ROUNDS[gs.round].goal} score ${gs.score} lives ${gs.lives}`,
                    `player ${gs.player.x.toFixed(0)},${gs.player.y.toFixed(0)} dir ${gs.player.dir} deadT ${gs.player.deadT}`,
                    `harpoon ${gs.harpoon ? gs.harpoon.state + '->' + gs.harpoon.attached : 'idle'}  rocksDropped ${gs.rocksDropped}`,
                    gs.enemies.map((e) => `${e.kind}@${e.x.toFixed(0)},${e.y.toFixed(0)} s${e.stage}${e.ghost ? ' GHOST' : ''}${e.flee ? ' FLEE' : ''}`).join('\n') || 'no enemies',
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed, { maxTicks: 40000 }); return r.won ? `fresh sim still winnable (deaths ${r.deaths})` : 'fresh sim NOT winnable' } },
                    { label: 'drop rock', run: () => { const k = gs.rocks.find((x) => x.state === 'held'); if (!k) return 'none'; for (let r = 3; r < k.row; r++) gs.dirt[r][k.col] = false; return `col ${k.col} unsupported` } },
                    { label: 'kill all', run: () => { gs.enemies = []; gs.queue = []; return 'cleared (cheat)' } },
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
            if (import.meta.env.DEV) { unmountDbg(); delete window.__dugTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'DIG DUG')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#050510] select-none">
            <div ref={stageRef} className="relative w-full max-w-[640px] aspect-[288/224] shadow-[0_0_40px_rgba(63,174,76,0.30)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>ROUND <span ref={setHud('round')} className="text-[#e9f7ff]">ROUND 1</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#5dff8f]">3</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default DigDugGame

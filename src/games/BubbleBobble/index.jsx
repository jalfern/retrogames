// BUBBLE BOBBLE — the arcade shell. Everything visible is drawn at runtime
// from the pure sim in ./sim.js at 1:1 on a 256x224 canvas: themed caves
// boxed in by thick side walls, one-way platforms (no ladders — the arcade
// has none), shallows, the dragons, and the attract demo is
// planner.js's OWN proven run replayed tick-for-tick through real step().
//
// Layout: 1. painters 2. fixed-timestep loop (250ms catch-up — the heist
// lesson) 3. input (arrows + SPACE = blow; UP = jump;
// 1 = solo, 2 = solo + CPU partner Bob, 3 = two-player keyboard)
// 4. DEV hook + DebugKit 5. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { CELL, COLS, W, H, FIELD_Y0, FLOOR_ROW, LETTERS } from './levels.js'
import { makeGame, step, stateHash, CFG } from './sim.js'
import { plan, decide } from './planner.js'
import { makeSlot, setSlotKind, padFor } from '../../utils/slotSources'
import { slotPad } from '../../utils/onePad'

const SIM_MS = 1000 / 60
let proven = null
const provenRun = () => { if (!proven) proven = plan(0); return proven }

const Bob = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const modeRef = useRef(1)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('bobubble.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.bobubbleStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0, { players: 1 })
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, musicT = 0
        const keys = { l: false, r: false, u: false, d: false, fEdge: false }
        const p2keys = { l: false, r: false, u: false, d: false, fEdge: false }
        // #494 seat 2 is a SLOT: cpu (planner Bob), human (keys / pad 2) or a
        // driven model via the contract — every source answers with THE one pad
        // and the sim folds them alike.
        const p2slot = makeSlot('off', {
            padIndex: 2,
            emit: () => { const d = decide(gs, 1); return { left: d.left, right: d.right, up: d.up, down: d.down, a: d.fire } },
        })
        let modelP2 = null
        const padToBob = (pad) => ({ left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down, fire: !!pad.a })
        const evLog = []
        const parts = []

        // toasts are gameplay text — never over the attract screen (ART.md rule 6)
        const say = (m) => { if (screenRef.current === 'attract') return; toastMsg = m; toast = 110 }
        const burst = (px, py, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.type === 'blow') audioController.playSweep(300, 520, 0.08, 'sine', 0.05)
                else if (e.type === 'trap') { say('TRAPPED!'); audioController.playSweep(620, 300, 0.14, 'sine', 0.07) }
                else if (e.type === 'pop') { say(`x${e.chain} +${e.pts}`); audioController.playNoise(0.06, 0.07); audioController.playSweep(400 + e.chain * 90, 1200 + e.chain * 120, 0.16, 'square', 0.08); burst(e.x, e.y, 9, '#9fd8ff') }
                else if (e.type === 'popFree') audioController.playSweep(500, 700, 0.06, 'sine', 0.04)
                else if (e.type === 'escape') { say('IT ESCAPED!'); audioController.playSweep(320, 180, 0.2, 'sawtooth', 0.06) }
                else if (e.type === 'fruit') { say(e.fruit.toUpperCase()); audioController.playSweep(660 + (e.pts % 300), 1320, 0.18, 'square', 0.07) }
                else if (e.type === 'letter') { say(e.ch); audioController.playTone(880, 0.09, 'square', 0.07) }
                else if (e.type === 'extend') { say('EXTEND! 1UP'); audioController.playSweep(440, 1760, 0.5, 'square', 0.09) }
                else if (e.type === 'power') { say('POWER-UP!'); audioController.playSweep(330, 880, 0.3, 'triangle', 0.08) }
                else if (e.type === 'lightning') { say('LIGHTNING!'); audioController.playNoise(0.25, 0.1); audioController.playSweep(2000, 200, 0.35, 'sawtooth', 0.08); shake = 8 }
                else if (e.type === 'flame') audioController.playNoise(0.08, 0.05)
                else if (e.type === 'flameKill') { say(`+${e.pts}`); burst(e.x, e.y, 8, '#ff9f3f') }
                else if (e.type === 'snail') say('SPLASH! SNAIL')
                else if (e.type === 'blubbaWarn') { say('HURRY UP!'); audioController.playTone(990, 0.08, 'square', 0.08); audioController.playTone(990, 0.08, 'square', 0.06, 0.1) }
                else if (e.type === 'blubba') { say('BARON VON BLUBBA!'); audioController.playSweep(160, 90, 0.5, 'sawtooth', 0.09); shake = 6 }
                else if (e.type === 'bossHit') { audioController.playNoise(0.08, 0.07); burst(e.x, e.y, 8, '#e08fff') }
                else if (e.type === 'bossKill') { say('BOSS DOWN +' + e.pts); audioController.playSweep(220, 1400, 0.5, 'square', 0.1); shake = 10 }
                else if (e.type === 'doorOpen') { say('DOOR OPEN!'); audioController.playSweep(520, 1040, 0.3, 'triangle', 0.07) }
                else if (e.type === 'levelClear') { say(`LEVEL ${e.level} CLEAR`); audioController.playSweep(330, 990, 0.4, 'square', 0.08) }
                else if (e.type === 'level') say(`LEVEL ${e.level} — ${e.name}`)
                else if (e.type === 'death') { say('OOPS!'); audioController.playDeath(); shake = 8 }
                else if (e.type === '1up') { say('1UP!'); audioController.playSweep(440, 1760, 0.5, 'square', 0.08) }
                else if (e.type === 'win') { say('YOU RESCUED EVERYONE!'); audioController.playSweep(220, 1760, 0.9, 'square', 0.1); shake = 10 }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('bobubble.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inputs) => {
            step(gs, inputs)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0, { players: 1 }); demoAt = 0; return }
            doSim([run.script[demoAt++]])
            if (gs.end) { gs = makeGame(0, { players: 1 }); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            const inputs = [{ left: keys.l, right: keys.r, up: keys.u, down: keys.d, fire: keys.fEdge }]
            if (gs.players.length > 1) {
                let pad = null
                if (modelP2) pad = modelP2
                else if (p2slot.kind === 'cpu') pad = padFor(p2slot, { method: 'dpad', tick: gs.tick })
                else {
                    const s = slotPad(2, 'dpad')
                    pad = { left: p2keys.l || s.left, right: p2keys.r || s.right, up: p2keys.u || s.up, down: p2keys.d || s.down, a: p2keys.fEdge || s.a }
                }
                inputs.push(padToBob(pad))
            }
            doSim(inputs)
            keys.fEdge = false
            p2keys.fEdge = false
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
        const drawBackdrop = (t) => {
            const sky = ctx.createLinearGradient(0, 0, 0, H)
            sky.addColorStop(0, t.sky[0]); sky.addColorStop(1, t.sky[1])
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, W, H)
            for (let i = 0; i < 26; i++) {
                const hh = hash2(i, 77)
                const x = hh % W, y = FIELD_Y0 + ((hh >> 8) % (H - FIELD_Y0))
                ctx.fillStyle = i + (gs.tick >> 5) % 3 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.045)'
                ctx.fillRect(x, y, 1, 1)
            }
        }
        const drawPlatforms = (t) => {
            for (const p of gs.lv.platforms) {
                const y = FIELD_Y0 + p.row * CELL
                ctx.fillStyle = t.plat
                ctx.fillRect(p.c0 * CELL, y, (p.c1 - p.c0 + 1) * CELL, 6)
                ctx.fillStyle = t.platLite
                ctx.fillRect(p.c0 * CELL, y, (p.c1 - p.c0 + 1) * CELL, 2)
                ctx.fillStyle = t.platDark
                ctx.fillRect(p.c0 * CELL, y + 5, (p.c1 - p.c0 + 1) * CELL, 1)
                for (let c = p.c0; c <= p.c1; c += 2) {
                    ctx.fillStyle = t.platDark
                    ctx.fillRect(c * CELL + 7, y + 2, 2, 3)
                }
            }
            ctx.fillStyle = t.platDark
            ctx.fillRect(0, H - 4, W, 4)
            ctx.fillStyle = t.plat
            ctx.fillRect(0, H - 4, W, 1)
        }
        const drawWalls = (t) => {
            // the cave is boxed in: thick brick walls on both sides, drawn over
            // the platform ends and the waterline so the box reads as one shell
            for (const x0 of [0, W - 8]) {
                ctx.fillStyle = t.platDark
                ctx.fillRect(x0, 0, 8, H)
                ctx.fillStyle = t.plat
                for (let y = 0; y < H; y += 10) ctx.fillRect(x0 + 1, y + 2, 6, 3)
                ctx.fillStyle = t.platLite
                ctx.fillRect(x0 === 0 ? 7 : x0, 0, 1, H)
            }
        }
        const drawWater = () => {
            if (!gs.lv.water) return
            const y = H - CELL
            const g = ctx.createLinearGradient(0, y, 0, H)
            g.addColorStop(0, 'rgba(80,160,255,0.55)'); g.addColorStop(1, 'rgba(20,60,160,0.75)')
            ctx.fillStyle = g
            ctx.fillRect(0, y, W, CELL)
            ctx.fillStyle = 'rgba(220,240,255,0.5)'
            for (let x = 0; x < W; x += 8) ctx.fillRect(x, y + 1 + Math.round(Math.sin((gs.tick + x * 2) / 22) * 1.4), 4, 1)
        }
        const drawDoor = () => {
            const d = gs.door
            ctx.fillStyle = '#241a10'
            ctx.fillRect(d.x - 8, d.y - 8, 16, 22)
            ctx.fillStyle = d.open ? (gs.tick >> 3) % 2 === 0 ? '#ffd76b' : '#ffb03f' : '#4a3c2a'
            ctx.fillRect(d.x - 6, d.y - 6, 12, 20)
            if (d.open) { ctx.fillStyle = 'rgba(255,220,120,0.25)'; ctx.beginPath(); ctx.arc(d.x, d.y + 2, 16, 0, Math.PI * 2); ctx.fill() }
        }
        const drawDragon = (p, i) => {
            if (p.deadT > 0) {
                const t = 1 - p.deadT / CFG.respawn
                ctx.globalAlpha = 1 - t
                ctx.fillStyle = '#ffffff'
                ctx.beginPath(); ctx.arc(p.x, p.y, 6 + t * 14, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 1
                return
            }
            if (p.invuln > 0 && (gs.tick >> 2) % 2 === 0) return
            const body = i === 0 ? '#4fd24f' : '#4f9fef'
            const belly = i === 0 ? '#c9f5a8' : '#c8ecff'
            const stepF = p.moving ? Math.floor(gs.tick / 6) % 2 : 0
            const fly = !p.onGround
            ctx.fillStyle = body
            ctx.beginPath(); ctx.ellipse(p.x, p.y, 6.4, 7, 0, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = belly
            ctx.beginPath(); ctx.ellipse(p.x + p.dir * 1.5, p.y + 1.6, 3.6, 4, 0, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = body
            ctx.beginPath(); ctx.arc(p.x + p.dir * 2, p.y - 6, 4.6, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(p.x + p.dir * 2 - 1, p.y - 8, 2, 2.4)
            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(p.x + p.dir * 2 + (p.dir > 0 ? 0.4 : -1.6), p.y - 7.6, 1.4, 1.6)
            ctx.fillStyle = p.power === 'red' ? '#ff5d2f' : '#ffd23f'
            ctx.fillRect(p.x + p.dir * 5, p.y - 6, 2.4, 1.4)
            ctx.fillStyle = body
            if (fly) {
                ctx.fillRect(p.x - 7, p.y - 3 - ((gs.tick >> 2) % 2), 3, 4)
                ctx.fillRect(p.x + 4, p.y - 3 - ((gs.tick >> 2) % 2), 3, 4)
            } else {
                ctx.fillRect(p.x - 6, p.y + (stepF === 0 ? 5 : 6), 3, 2)
                ctx.fillRect(p.x + 3, p.y + (stepF === 0 ? 6 : 5), 3, 2)
            }
            if (p.power && p.power !== 'red') {
                ctx.fillStyle = { cyan: '#7fe8ff', green: '#9fff7f', pink: '#ffb0e0' }[p.power] || '#fff'
                ctx.globalAlpha = 0.35 + 0.2 * Math.sin(gs.tick / 6)
                ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 1
            }
        }
        const drawBubble = (b) => {
            const rgb = b.kind === 'water' ? '120,190,255' : '170,225,255'
            const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, 1, b.x, b.y, b.r)
            g.addColorStop(0, `rgba(255,255,255,0.85)`)
            g.addColorStop(0.35, `rgba(${rgb},0.55)`)
            g.addColorStop(1, `rgba(${rgb},0.16)`)
            ctx.fillStyle = g
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = `rgba(${rgb},0.8)`
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke()
            if (b.letter) {
                ctx.fillStyle = '#fff2b0'
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                ctx.fillText(b.letter, b.x, b.y + b.r - 2)
            }
        }
        const drawEnemy = (e) => {
            const blinkA = e.angry && (gs.tick >> 2) % 2 === 0
            if (e.state === 'trap') return
            if (e.kind === 'boss') {
                ctx.fillStyle = blinkA ? '#ff7fd0' : '#8f4fc8'
                ctx.beginPath(); ctx.ellipse(e.x, e.y, 15, 13, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#5f2f90'
                ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, 10, 7, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#ffd23f'
                ctx.fillRect(e.x - 8, e.y - 16, 4, 5); ctx.fillRect(e.x - 1, e.y - 18, 4, 7); ctx.fillRect(e.x + 6, e.y - 16, 4, 5)
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(e.x - 5, e.y - 4, 3.4, 0, Math.PI * 2); ctx.arc(e.x + 5, e.y - 4, 3.4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x - 5.6 + (gs.players[0].x > e.x ? 1.4 : -0.6), e.y - 5, 1.8, 2)
                ctx.fillRect(e.x + 4.4 + (gs.players[0].x > e.x ? 1.4 : -0.6), e.y - 5, 1.8, 2)
                ctx.fillStyle = '#ffd7e8'
                ctx.fillRect(e.x - 6, e.y + 5, 12, 2)
                return
            }
            if (e.snail) {
                ctx.fillStyle = '#e0c878'
                ctx.beginPath(); ctx.arc(e.x, e.y, 7, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#a8842f'
                ctx.beginPath(); ctx.arc(e.x + 1, e.y, 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#8fe07f'
                ctx.fillRect(e.x + e.dir * 6 - 2, e.y + 2, 4, 4)
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x + e.dir * 6, e.y + 3, 1.4, 1.4)
                ctx.strokeStyle = '#8fe07f'; ctx.beginPath(); ctx.moveTo(e.x + e.dir * 6, e.y + 1); ctx.lineTo(e.x + e.dir * 8, e.y - 3); ctx.stroke()
                return
            }
            if (e.kind === 'pulppul') {
                ctx.fillStyle = blinkA ? '#ffd0e8' : '#ff8fc8'
                ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.7)'
                const wf = Math.sin(gs.tick / 4) * 2
                ctx.beginPath(); ctx.ellipse(e.x - 7, e.y - 2 + wf * 0.4, 4, 2.4, -0.5, 0, Math.PI * 2); ctx.fill()
                ctx.beginPath(); ctx.ellipse(e.x + 7, e.y - 2 + wf * 0.4, 4, 2.4, 0.5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(e.x - 2, e.y - 1, 1.8, 0, Math.PI * 2); ctx.arc(e.x + 2, e.y - 1, 1.8, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x - 2.4, e.y - 1.6, 1.2, 1.4); ctx.fillRect(e.x + 1.4, e.y - 1.6, 1.2, 1.4)
                return
            }
            if (e.kind === 'tongling') {
                ctx.fillStyle = blinkA ? '#8fc8ff' : '#3f7fd0'
                ctx.beginPath(); ctx.ellipse(e.x, e.y, 8, 5.6, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = blinkA ? '#8fc8ff' : '#3f7fd0'
                ctx.beginPath(); ctx.arc(e.x + e.dir * 7, e.y - 2, 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#dfe8ff'
                ctx.fillRect(e.x + e.dir * 9 - 1, e.y - 2, 3, 1.6)
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(e.x + e.dir * 6, e.y - 3.4, 1.8, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x + e.dir * 6 + e.dir * 0.4, e.y - 4, 1.2, 1.4)
                const wf2 = Math.floor(gs.tick / 5) % 2
                ctx.fillStyle = '#2a5aa0'
                ctx.fillRect(e.x - 5, e.y + (wf2 ? 4 : 5), 2.6, 2)
                ctx.fillRect(e.x + 3, e.y + (wf2 ? 5 : 4), 2.6, 2)
                return
            }
            if (e.kind === 'zenchan') {
                // the round-1 wind-up toy: big round head, huge eyes, stubby
                // body, waddling feet, and a key that keeps winding on the side
                const stepF = Math.floor(gs.tick / 6 + e.id) % 2
                const bobY = Math.sin(gs.tick / 6 + e.id) * 0.6
                ctx.fillStyle = blinkA ? '#b8d878' : '#8fb85f'
                ctx.beginPath(); ctx.ellipse(e.x, e.y + 3 + bobY * 0.4, 4.6, 3.4, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = blinkA ? '#d8ee9f' : '#b8d878'
                ctx.beginPath(); ctx.arc(e.x, e.y - 3.4 + bobY, 5.4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(e.x - 2.2, e.y - 4 + bobY, 2.4, 0, Math.PI * 2); ctx.arc(e.x + 2.2, e.y - 4 + bobY, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b0b1c'
                ctx.fillRect(e.x - 2.6 + (e.dir > 0 ? 0.8 : -0.4), e.y - 4.6 + bobY, 1.3, 1.6)
                ctx.fillRect(e.x + 1.4 + (e.dir > 0 ? 0.8 : -0.4), e.y - 4.6 + bobY, 1.3, 1.6)
                ctx.fillStyle = '#5f7d3f'
                ctx.fillRect(e.x - 4 + (stepF ? 0.9 : 0), e.y + 6.4 - (stepF ? 0.9 : 0), 2.4, 1.8)
                ctx.fillRect(e.x + 1.6 - (stepF ? 0.9 : 0), e.y + 6.4 - (stepF ? 0 : 0.9), 2.4, 1.8)
                const kx = e.x - e.dir * 5.6, ky = e.y + 2.2 + bobY * 0.4
                const tw = Math.abs(Math.cos(gs.tick / 4 + e.id)) * 2.6 + 0.4
                ctx.fillStyle = '#e8c85f'
                ctx.fillRect(kx - 0.6, ky - 1.3, 1.2, 2.6)
                ctx.fillRect(kx - tw, ky - 0.6, tw * 2, 1.2)
                return
            }
            ctx.fillStyle = blinkA ? '#8fe07f' : '#3faf5f'
            ctx.beginPath(); ctx.ellipse(e.x, e.y, 7, 6, 0, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.beginPath(); ctx.arc(e.x - 2.6, e.y - 1.4, 2.4, 0, Math.PI * 2); ctx.arc(e.x + 2.6, e.y - 1.4, 2.4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(e.x - 3 + (e.dir > 0 ? 1 : -0.2), e.y - 2, 1.4, 1.6)
            ctx.fillRect(e.x + 2 + (e.dir > 0 ? 1 : -0.2), e.y - 2, 1.4, 1.6)
            ctx.fillStyle = '#2c7d41'
            ctx.beginPath(); ctx.moveTo(e.x - 5, e.y - 5); ctx.lineTo(e.x - 2, e.y - 8); ctx.lineTo(e.x, e.y - 5); ctx.fill()
            ctx.beginPath(); ctx.moveTo(e.x, e.y - 5); ctx.lineTo(e.x + 2, e.y - 8); ctx.lineTo(e.x + 5, e.y - 5); ctx.fill()
        }
        const drawItem = (it) => {
            const bob = Math.sin((gs.tick + it.id * 13) / 10)
            if (it.life < 90 && (gs.tick >> 2) % 2 === 0) return
            if (it.kind === 'fruit') {
                const cols = ['#ff4f4f', '#ffa03f', '#c06fff', '#ffe04f', '#8fe07f', '#ff9fd0', '#fff0d0', '#d8a060', '#f0f5ff', '#ffb0d8']
                const c = cols[it.fruit % cols.length]
                ctx.fillStyle = c
                ctx.beginPath(); ctx.arc(it.x, it.y + bob * 0.4, 4.4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#5dff8f'
                ctx.fillRect(it.x - 1, it.y - 6 + bob * 0.4, 2, 2)
                return
            }
            if (it.kind === 'letter') {
                ctx.fillStyle = '#fff'
                ctx.fillRect(it.x - 5, it.y - 5, 10, 10)
                ctx.fillStyle = '#1a1a4f'
                ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
                ctx.fillText(it.ch, it.x, it.y + 3.5)
                return
            }
            if (it.kind === 'power') {
                const c = { red: '#ff4f2f', cyan: '#5fd8ff', green: '#7fff5f', pink: '#ff9fd8' }[it.power]
                ctx.fillStyle = c
                ctx.beginPath(); ctx.arc(it.x, it.y + bob * 0.4, 5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.8)'
                ctx.fillRect(it.x - 1, it.y - 3 + bob * 0.4, 2, 2)
                return
            }
            ctx.fillStyle = '#fff23f'
            ctx.beginPath()
            ctx.moveTo(it.x + 2, it.y - 7); ctx.lineTo(it.x - 3, it.y + 1); ctx.lineTo(it.x, it.y + 1); ctx.lineTo(it.x - 2, it.y + 7); ctx.lineTo(it.x + 3, it.y - 1); ctx.lineTo(it.x, it.y - 1)
            ctx.closePath(); ctx.fill()
        }
        const drawBlubba = (b) => {
            ctx.fillStyle = (gs.tick >> 3) % 2 === 0 ? '#5f8fff' : '#3f5fd0'
            ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = 'rgba(63,95,208,0.6)'
            const wf = (gs.tick >> 2) % 2
            ctx.beginPath(); ctx.ellipse(b.x - 11, b.y - 2 + wf, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.ellipse(b.x + 11, b.y - 2 + wf, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.beginPath(); ctx.arc(b.x - 3, b.y - 2, 2.4, 0, Math.PI * 2); ctx.arc(b.x + 3, b.y - 2, 2.4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#0b0b1c'
            ctx.fillRect(b.x - 3.6, b.y - 2.6, 1.4, 1.6); ctx.fillRect(b.x + 2.2, b.y - 2.6, 1.4, 1.6)
            ctx.fillStyle = '#1a1a3f'
            ctx.beginPath(); ctx.arc(b.x, b.y + 3, 3, 0, Math.PI); ctx.fill()
        }

        const draw = () => {
            const t = gs.lv.theme
            ctx.fillStyle = '#050510'
            ctx.fillRect(0, 0, W, H)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }
            drawBackdrop(t)
            drawDoor()
            drawPlatforms(t)
            drawWater()
            drawWalls(t)
            for (const it of gs.items) drawItem(it)
            for (const e of gs.enemies) drawEnemy(e)
            for (const b of gs.bubbles) drawBubble(b)
            for (const e of gs.enemies) if (e.state === 'trap') {
                const b = gs.bubbles.find((x) => x.trapped === e.id)
                if (b) {
                    ctx.globalAlpha = 0.6
                    const ge = { ...e, x: b.x, y: b.y }
                    drawEnemy(ge)
                    ctx.globalAlpha = 1
                }
            }
            for (const bb of gs.blubbas) drawBlubba(bb)
            for (let i = 0; i < gs.players.length; i++) drawDragon(gs.players[i], i)
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.t++
                ctx.fillStyle = p.col
                if (p.t < 22) ctx.fillRect(p.x, p.y, 2, 2)
            }
            while (parts.length && parts[0].t >= 22) parts.shift()
            ctx.restore()

            ctx.fillStyle = 'rgba(0,0,0,0.14)'
            for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)

            ctx.fillStyle = 'rgba(0,0,0,0.55)'
            ctx.fillRect(0, 0, W, FIELD_Y0 - 2)
            // the HUD band carries every readout — nothing sits on the play floor
            text(`1UP ${String(gs.score).padStart(6, '0')}`, 42, 8, 8, '#ff5d5d', 3)
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, W - 42, 8, 8, '#ffd23f', 3)
            text(`${gs.enemies.length} left`, 42, 15, 7, gs.enemies.length ? '#8fa3d8' : '#5dff8f', gs.enemies.length ? 0 : 3)
            text(gs.lv.name, W / 2, 15, 7, '#8fa3d8', 0)
            for (let i = 0; i < LETTERS.length; i++) {
                ctx.fillStyle = i < gs.letterProg ? '#fff2b0' : 'rgba(255,255,255,0.18)'
                ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
                ctx.fillText(LETTERS[i], W - 40 - 17.5 + i * 7, 15)
            }
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = i === 0 ? '#4fd24f' : '#4f9fef'
                ctx.beginPath(); ctx.arc(9 + i * 10, H - 7, 3.4, 0, Math.PI * 2); ctx.fill()
            }
            if (toast > 0) { text(toastMsg, W / 2, H / 2 - 26, 10, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,3,12,0.60)'
                ctx.fillRect(0, 0, W, H)
                text('BUBBLE', W / 2, 70, 24, '#7fe8ff', 12)
                text('BOBBLE', W / 2, 92, 24, '#ff9fd8', 12)
                // one message at a time, cycling (ART.md rule 6)
                const msg = Math.floor(gs.tick / 120) % 3
                if (msg === 0) text('TRAP • POP • CHAIN — 100 CAVES', W / 2, 118, 8, '#8fa3d8', 0)
                else if (msg === 1) text('1 SOLO   2 +CPU BOB   3 TWO PLAYERS', W / 2, 118, 8, '#e9f7ff', 0)
                else text('DEMO PLAYS THE PROVEN RUN', W / 2, 118, 7, '#5d7094', 0)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY TO START', W / 2, 140, 9, '#ffd23f', 5)
                const b = board()[0]
                if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 158, 8, '#5dc8ff', 3)
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.72)'
                ctx.fillRect(0, 0, W, H)
                text(gs.end === 'win' ? 'CAVES CLEARED!' : 'GAME OVER', W / 2, 84, 15, gs.end === 'win' ? '#5dff8f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')}`, W / 2, 108, 10, '#ffd23f', 4)
                text(`LEVEL REACHED ${gs.level + 1}`, W / 2, 124, 9, '#8fa3d8', 0)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 150, 9, '#e9f7ff', 4)
            }
        }

        // ---------------------------------------------------------------- loop ----
        const RIFF = [0, 0, 7, 7, 5, 5, 3, 1]
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250)
            last = now
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 }
            else { acc += dt; while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS } }
            draw()
            if (screenRef.current === 'play' && gs.levelPhase === 'play' && gs.players.every((p) => p.deadT === 0)) {
                musicT++
                if (musicT % 6 === 0) {
                    const n = RIFF[Math.floor(musicT / 6) % RIFF.length]
                    audioController.playTone(147 * Math.pow(2, n / 12), 0.09, 'square', 0.028)
                    if (musicT % 48 === 0) audioController.playTone(98, 0.3, 'triangle', 0.04)
                }
            } else musicT = 0
            const h = hudRef.current
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.lives) h.lives.textContent = String(gs.lives)
            if (h.level) h.level.textContent = `LV ${gs.level + 1}`
        }

        // ---------------------------------------------------------------- input ----
        const startPlay = (mode) => {
            modeRef.current = mode
            setSlotKind(p2slot, mode === 2 ? 'cpu' : mode === 3 ? 'human' : 'off')
            gs = makeGame(0, { players: mode === 1 || mode === 2 ? mode : 2 })
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = true
            if (ev.code === 'ArrowRight') keys.r = true
            if (ev.code === 'ArrowUp') keys.u = true
            if (ev.code === 'ArrowDown') keys.d = true
            if (ev.code === 'Space' || ev.code === 'KeyB') keys.fEdge = true
            if (ev.code === 'KeyA') p2keys.l = true
            if (ev.code === 'KeyD') p2keys.r = true
            if (ev.code === 'KeyW') p2keys.u = true
            if (ev.code === 'KeyS') p2keys.d = true
            if (ev.code === 'KeyF') p2keys.fEdge = true
            if (ev.code === 'Escape' || ev.code === 'Backquote' || ev.code === 'Slash') { ev.preventDefault(); setPaused((p) => !p) }
            if (screenRef.current === 'attract') {
                startPlay(ev.code === 'Digit2' ? 2 : ev.code === 'Digit3' ? 3 : 1)
                return
            }
            if (screenRef.current === 'over' && performance.now() - overAtRef.current > 900) { startPlay(1); return }
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = false
            if (ev.code === 'ArrowRight') keys.r = false
            if (ev.code === 'ArrowUp') keys.u = false
            if (ev.code === 'ArrowDown') keys.d = false
            if (ev.code === 'KeyA') p2keys.l = false
            if (ev.code === 'KeyD') p2keys.r = false
            if (ev.code === 'KeyW') p2keys.u = false
            if (ev.code === 'KeyS') p2keys.d = false
        }
        const onPad = (ev) => {
            const d = ev.detail
            if (!d) return
            keys.l = !!d.left; keys.r = !!d.right; keys.u = !!d.up; keys.d = !!d.down
            if (d.action || d.second) keys.fEdge = true
            if (screenRef.current === 'attract') startPlay(1)
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('virtualcontrols', onPad)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__bobTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim(gs.players.map(() => ({ left: false, right: false, up: false, down: false, fire: false }))) },
                stepWith: (inputs) => doSim(inputs),
                setKeys: (k) => { keys.l = !!k.l; keys.r = !!k.r; keys.u = !!k.u; keys.d = !!k.d; if (k.f) keys.fEdge = true },
                plan: (seed = 0, opts) => plan(seed, opts),
                decide: (i = 0) => decide(gs, i),
                restart: () => { gs = makeGame(0, { players: modeRef.current === 3 ? 2 : modeRef.current === 2 ? 2 : 1 }) },
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, score: gs.score, lives: gs.lives, level: gs.level + 1,
                    enemies: gs.enemies.length, hash: stateHash(gs),
                    player: { x: gs.players[0]?.x, y: gs.players[0]?.y, onGround: gs.players[0]?.onGround, deadT: gs.players[0]?.deadT },
                    door: gs.door, end: gs.end,
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg({
                title: 'BUBBLE BOBBLE',
                getState: () => [
                    `lv ${gs.level + 1} ${gs.lv.name} score ${gs.score} lives ${gs.lives} chain ${gs.chain} letters ${gs.letterProg}/6`,
                    `player ${gs.players.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}${p.power || ''}${p.deadT ? ' DEAD' : ''}`).join(' | ')}`,
                    `bubbles ${gs.bubbles.map((b) => `${b.kind}${b.trapped ? '(trap)' : ''}${b.letter || ''}`).join(',') || 'none'} door ${gs.door.open ? 'OPEN' : 'shut'} blubbas ${gs.blubbas.length} linger ${gs.lingerT}`,
                    gs.enemies.map((e) => `${e.kind} ${e.state}${e.angry ? '!' : ''}${e.snail ? '~' : ''}@${e.x.toFixed(0)},${e.y.toFixed(0)}`).join('\n') || 'no enemies',
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(0, { maxTicks: 60000 }); return `pilot on seed 0 reaches level ${r.levelsCleared + 1} (deaths ${r.deaths})` } },
                    { label: 'kill all', run: () => { gs.enemies = []; return `roster cleared (cheat) — door opens next step` } },
                    { label: 'blubba now', run: () => { gs.lingerT = gs.lv.blubbaAt; return 'timer set' } },
                ],
            })
            let prevA = false
            exposeGame({
                id: 'bubble-bobble',
                players: 2,
                method: 'dpad',
                buttons: ['left', 'right', 'up', 'down', 'a'],
                reset: (seed, players = 1) => {
                    modeRef.current = players > 1 ? 3 : 1
                    setSlotKind(p2slot, 'off')
                    gs = makeGame(seed >>> 0, { players: players > 1 ? 2 : 1 })
                    evLog.length = 0; parts.length = 0
                    demoAt = 0; musicT = 0; shake = 0
                    modelP2 = null
                    for (const k of [keys, p2keys]) { k.l = k.r = k.u = k.d = false; k.fEdge = false }
                    prevA = false
                    setMode('play')
                },
                tick: (pad, pads) => {
                    if (gs.end) { gs.tick += 1; return }
                    const fire = !!pad.a && !prevA
                    prevA = !!pad.a
                    const row = [{ left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down, fire }]
                    // #494: step([p1, p2]) drives seat 2 too — reset(seed, 2)
                    // seats Bob first; an empty seat ignores its pad.
                    modelP2 = pads && pads.length > 1 && gs.players.length > 1 ? pads[1] : null
                    if (modelP2) row.push(padToBob(modelP2))
                    doSim(row)
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: !!gs.end,
                    seed: gs.seed, lives: gs.lives, level: gs.level, chain: gs.chain,
                    enemies: gs.enemies.length, door: !!gs.door.open,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
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
            if (import.meta.env.DEV) { unmountDbg(); delete window.__bobTest; unexposeGame() }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'BUBBLE BOBBLE')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#050510] select-none">
            <div ref={stageRef} className="relative w-full max-w-[640px] aspect-[256/224] shadow-[0_0_40px_rgba(127,232,255,0.28)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>LEVEL <span ref={setHud('level')} className="text-[#e9f7ff]">LV 1</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#5dff8f]">3</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default Bob

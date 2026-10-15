// SMASH TV — the cabinet shell: top-down arena over the pure sim, twin-stick
// input (Arrows move, IJKL fires, Space fires the way you face, B firebombs),
// HUD strip with 1UP/HI board + weapon rack + energy meter, announcer barks,
// attract mode replaying the autopilot's OWN proven run tick-for-tick (the
// same run smashcheck grades), all art and audio synthesized at runtime.
//
// Layout: 1. setup 2. effects/events 3. render 4. loop 5. input
// 6. DEV hook + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CW, CH, HUD_H, CELL, GW, GH, EXITS, ENEMIES, WEAPONS, TOTAL_ROOMS } from './levels.js'
import { makeGame, step, stateHash, CFG } from './sim.js'
import { plan } from './planner.js'
import { buildSprites, buildFloor } from './art.js'

const SIM_MS = 1000 / 60
const ROOM_NAMES = [
    'DOME OF THE CAMERAS', 'TURRET ALLEY', 'THE GRANADIERS', 'BONUS! RUN, CONTESTANTS, RUN!',
    'HEAVY WEATHER', 'THE KILL FLOOR', 'BONUS! THE AUDIENCE DEMANDS IT', 'GAUNTLET OF THE STARS',
    'THE ANNOUNCER',
]
const BARKS = [
    'DA DA-DA-DA-DAAAA!', 'I\u2019D LIKE TO THANK MY AGENT!', 'THE AUDIENCE ADORES YOU!',
    'RATING: EXTREME!', 'THAT\u2019S THE STUFF!', 'SMASH! SMASH! SMASH!',
]
let proven = null
const provenRun = () => { if (!proven) proven = plan(0); return proven }

const SmashTVGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('smashtv.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const SP = buildSprites()
        const canvas = document.createElement('canvas')
        canvas.dataset.smashStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let floor = buildFloor(0, 0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0
        const held = new Set()
        let bombEdge = false
        const evLog = []
        const parts = []
        const pops = []

        const say = (m) => { toastMsg = m; toast = 140 }
        const burst = (x, y, n, col, sp = 2.4) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * sp
                parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, col })
            }
        }
        const pop = (x, y, txt, col) => pops.push({ x, y, txt, col, t: 0 })

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'room') {
                    floor = buildFloor(e.room, gs.seed)
                    say(ROOM_NAMES[e.room])
                    if (e.bonus) { audioController.playSweep(440, 1320, 0.5, 'square', 0.09); flash = 8 }
                    else audioController.playSweep(140, 320, 0.25, 'sawtooth', 0.06)
                } else if (e.type === 'shoot') audioController.playSweep(700 + Math.random() * 200, 220, 0.05, 'square', 0.035)
                else if (e.type === 'enemyHit') { audioController.playNoise(0.03, 0.05); burst(e.x || gs.player.x, e.y || gs.player.y, 3, '#ffd23f') }
                else if (e.type === 'kill') {
                    audioController.playSweep(420, 90, 0.16, 'square', 0.07)
                    burst(e.x, e.y, 9, e.kind === 'boss' ? '#ffd23f' : '#ff5d5d', e.kind === 'boss' ? 4 : 2.2)
                    pop(e.x, e.y, `${e.pts}`, '#ffd23f')
                    if (e.kind === 'boss') { shake = 12; flash = 16 }
                } else if (e.type === 'civKill') {
                    audioController.playSweep(300 + e.combo * 60, 90, 0.12, 'square', 0.06)
                    burst(e.x, e.y, 6, '#8fb0ff'); pop(e.x, e.y, `${e.pts}`, '#8fff9f')
                    if (e.combo === 5) say('THE CROWD GOES WILD!')
                } else if (e.type === 'crateBreak') {
                    audioController.playNoise(0.14, 0.08); burst(e.x, e.y, 10, '#5dc8ff')
                    say(`${WEAPONS[e.weapon].name}!`)
                } else if (e.type === 'pickup') {
                    if (e.t === 'weapon') { audioController.playSweep(500, 1500, 0.2, 'square', 0.08); pop(gs.player.x, gs.player.y - 12, WEAPONS[e.w].name, '#8fff9f') }
                    else { audioController.playSweep(220, 880, 0.25, 'triangle', 0.08) }
                } else if (e.type === 'wallHit') burst(e.x, e.y, 2, '#8d99b5', 1.2)
                else if (e.type === 'eshoot') audioController.playSweep(300, 140, 0.06, 'sawtooth', 0.03)
                else if (e.type === 'throw') audioController.playSweep(180, 320, 0.1, 'triangle', 0.04)
                else if (e.type === 'blast') { audioController.playNoise(0.2, 0.09); burst(e.x, e.y, 10, '#ff8a3f', 3); shake = 4 }
                else if (e.type === 'spawn') audioController.playSweep(90, 240, 0.12, 'triangle', 0.04)
                else if (e.type === 'death') { audioController.playDeath(); shake = 10; flash = 14; say(BARKS[Math.floor(Math.random() * BARKS.length)]) }
                else if (e.type === 'respawn') audioController.playSweep(110, 440, 0.3, 'triangle', 0.07)
                else if (e.type === 'clear') {
                    audioController.playSweep(330, 990, 0.35, 'square', 0.09)
                    say(e.bonus ? 'THAT WAS BEAUTIFUL!' : 'ROOM CLEAR! EXIT OPEN!')
                    pop(gs.player.x, gs.player.y - 14, '+1000', '#ffd23f')
                } else if (e.type === 'advance') audioController.playSweep(220, 660, 0.25, 'square', 0.07)
                else if (e.type === 'bomb') { audioController.playNoise(0.4, 0.12); audioController.playSweep(80, 900, 0.4, 'sawtooth', 0.1); shake = 8; flash = 12; say('FIREBOMB! THE AUDIENCE ROARS!') }
                else if (e.type === 'bombFail') { audioController.playTone(110, 0.12, 'square', 0.05); say('NOT ENOUGH POWER!') }
                else if (e.type === '1up') audioController.playSweep(440, 1760, 0.5, 'square', 0.08)
                else if (e.type === 'win') { audioController.playSweep(220, 1760, 0.9, 'square', 0.1); say('YOU WON THE SHOW!') }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('smashtv.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
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
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; floor = buildFloor(0, 0); return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0; floor = buildFloor(0, 0) }
        }

        const computeInput = () => {
            const mx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
            const my = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0)
            const fx = (held.has('KeyL') ? 1 : 0) - (held.has('KeyJ') ? 1 : 0)
            const fy = (held.has('KeyK') ? 1 : 0) - (held.has('KeyI') ? 1 : 0)
            const fire = held.has('Space') || held.has('KeyZ') || fx !== 0 || fy !== 0
            const bomb = bombEdge
            bombEdge = false
            return { mx, my, fx, fy, fire, bomb }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim(computeInput())
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

        const cellWall = (c, r) => c < 0 || r < 0 || c >= GW || r >= GH || gs.walls.has(`${c},${r}`)

        const drawWalls = () => {
            // border frame
            ctx.fillStyle = '#0c0e16'
            ctx.fillRect(0, 0, CW, HUD_H)
            for (const [bx, by, bw, bh] of [[0, HUD_H, CW, 8], [0, CH - 8, CW, 8], [0, HUD_H, 8, CH - HUD_H], [CW - 8, HUD_H, 8, CH - HUD_H]]) {
                ctx.fillStyle = '#2b3348'
                ctx.fillRect(bx, by, bw, bh)
                ctx.fillStyle = '#3d4a66'
                for (let i = bx + 4; i < bx + bw; i += 16) for (let j = by + 3; j < by + bh; j += 8) ctx.fillRect(i, j, 2, 2)
                ctx.fillStyle = '#161b2a'
                ctx.fillRect(bx, by + bh - 2, bw, 2)
            }
            // interior wall cells: chrome panels with neon top edge
            for (let r = 0; r < GH; r++) {
                for (let c = 0; c < GW; c++) {
                    if (!cellWall(c, r)) continue
                    const x = c * CELL, y = HUD_H + r * CELL
                    ctx.fillStyle = '#39415a'
                    ctx.fillRect(x, y, CELL, CELL)
                    ctx.fillStyle = '#515c7d'
                    ctx.fillRect(x, y, CELL, 2)
                    ctx.fillStyle = '#20263a'
                    ctx.fillRect(x, y + CELL - 3, CELL, 3)
                    ctx.fillStyle = '#2a3147'
                    ctx.fillRect(x + 3, y + 5, CELL - 6, CELL - 10)
                    ctx.fillStyle = '#6b78a0'
                    ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + CELL - 2, y + 1, 1, 1)
                    ctx.fillRect(x + 1, y + CELL - 2, 1, 1); ctx.fillRect(x + CELL - 2, y + CELL - 2, 1, 1)
                }
            }
        }

        const drawExits = () => {
            for (const e of EXITS) {
                const x = e.c * CELL, y = HUD_H + e.r * CELL
                ctx.fillStyle = gs.cleared ? ((gs.tick >> 3) % 2 ? '#2e8f4f' : '#1d5c32') : '#40171b'
                ctx.fillRect(x, y, CELL, CELL)
                ctx.fillStyle = gs.cleared ? '#8fff9f' : '#ff5d5d'
                ctx.fillRect(x + 6, y + 6, 4, 4)
                if (gs.cleared) {
                    ctx.fillStyle = 'rgba(143,255,159,0.25)'
                    ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8)
                }
            }
        }

        const drawSpawns = () => {
            if (gs.roomData.bonus || gs.cleared) return
            if (gs.roomData.spawns.length && (gs.tick >> 2) % 2 === 0) {
                for (const s of gs.roomData.spawns.slice(0, 6)) {
                    const x = s.c * CELL, y = HUD_H + s.r * CELL
                    ctx.strokeStyle = '#ffd23f'
                    ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5)
                    ctx.fillStyle = '#ffd23f'
                    ctx.fillRect(x + 7, y + 7, 2, 2)
                }
            }
        }

        const drawPlayer = () => {
            const p = gs.player
            if (p.deadT > 0) return
            if (p.invuln > 0 && (gs.tick >> 2) % 2 === 0) return
            const frame = Math.floor(p.walk / 6) % 2
            // twin barrels along the aim vector
            const [ax, ay] = p.aim
            const ox = -ay * 3, oy = ax * 3
            ctx.strokeStyle = '#8d99b5'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(p.x + ox, p.y + oy); ctx.lineTo(p.x + ax * 8, p.y + ay * 8)
            ctx.moveTo(p.x - ox, p.y - oy); ctx.lineTo(p.x - ax * 8, p.y - ay * 8)
            ctx.stroke()
            ctx.lineWidth = 1
            const w = WEAPONS[gs.weapon]
            if (p.fireT > w.interval - 3) {
                ctx.fillStyle = '#ffd23f'
                ctx.beginPath(); ctx.arc(p.x + ax * 9, p.y + ay * 9, 2, 0, Math.PI * 2); ctx.fill()
            }
            ctx.drawImage(frame ? SP.civ11 : SP.civ00, p.x - 5, p.y - 7)
            ctx.fillStyle = '#e8eef8'
            ctx.fillRect(p.x - 3, p.y - 8, 6, 2)
        }

        const drawEnemies = () => {
            for (const e of gs.enemies) {
                const frame = (gs.tick >> 3) % 2
                const img = SP[`${e.kind}${frame}`]
                if (!img) continue
                if (e.hitT > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10 }
                ctx.drawImage(img, e.x - img.width / 2, e.y - img.height / 2)
                ctx.shadowBlur = 0
                if (e.kind === 'boss') {
                    ctx.fillStyle = '#301010'
                    ctx.fillRect(e.x - 20, e.y - 24, 40, 4)
                    ctx.fillStyle = '#e83a3a'
                    ctx.fillRect(e.x - 20, e.y - 24, 40 * Math.max(0, e.hp / ENEMIES.boss.hp), 4)
                }
            }
        }

        const drawCratesItems = () => {
            for (const k of gs.crates) {
                if (k.hp <= 0) continue
                const frame = (gs.tick >> 4) % 2
                const sx = k.shake > 0 ? (Math.random() - 0.5) * 3 : 0
                if (k.shake > 0) k.shake--
                ctx.drawImage(SP[`crate${frame}`], k.x - 8 + sx, k.y - 8)
                if (k.hp === 1) { ctx.strokeStyle = 'rgba(233,247,255,0.6)'; ctx.beginPath(); ctx.moveTo(k.x - 4, k.y - 5); ctx.lineTo(k.x + 3, k.y + 4); ctx.stroke() }
            }
            for (const it of gs.items) {
                const bob = Math.sin(gs.tick / 8) * 2
                if (it.t === 'weapon') {
                    ctx.drawImage(SP[`icon_${it.w}`], it.x - 6, it.y - 4 + bob)
                    ctx.shadowColor = '#5dc8ff'; ctx.shadowBlur = 6
                    ctx.drawImage(SP[`icon_${it.w}`], it.x - 6, it.y - 4 + bob)
                    ctx.shadowBlur = 0
                } else {
                    ctx.fillStyle = (gs.tick >> 3) % 2 ? '#ffd23f' : '#ff8a3f'
                    ctx.fillRect(it.x - 3, it.y - 5 + bob, 6, 10)
                    ctx.fillStyle = '#10141f'
                    ctx.fillRect(it.x - 1, it.y - 3 + bob, 2, 6)
                }
            }
        }

        const drawCivilians = () => {
            for (const v of gs.civilians) {
                const frame = Math.floor(v.walk / 5) % 2
                ctx.drawImage(SP[`civ${v.id % 3}${frame}`], v.x - 5, v.y - 7)
            }
        }

        const drawShots = () => {
            for (const b of gs.bullets) {
                if (b.kind === 'laser') {
                    ctx.strokeStyle = '#ff4f4f'
                    ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(b.x - b.dx, b.y - b.dy); ctx.lineTo(b.x + b.dx, b.y + b.dy); ctx.stroke()
                    ctx.lineWidth = 1
                } else {
                    ctx.fillStyle = b.kind === 'gun' ? '#8fff9f' : b.kind === 'spread' ? '#ffd23f' : '#e9f7ff'
                    ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3)
                }
            }
            for (const b of gs.ebullets) {
                ctx.fillStyle = '#ff8a3f'
                ctx.shadowColor = '#ff4f4f'; ctx.shadowBlur = 5
                ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.shadowBlur = 0
            }
            for (const g of gs.grenades) {
                ctx.fillStyle = (gs.tick >> 2) % 2 ? '#ffd23f' : '#ff4f4f'
                ctx.beginPath(); ctx.arc(g.x, g.y, 3, 0, Math.PI * 2); ctx.fill()
                if (g.t < 20) { ctx.strokeStyle = 'rgba(255,79,79,0.4)'; ctx.beginPath(); ctx.arc(g.x, g.y, CFG.grenadeR, 0, Math.PI * 2); ctx.stroke() }
            }
        }

        const drawHud = () => {
            ctx.fillStyle = '#0c0e16'
            ctx.fillRect(0, 0, CW, HUD_H)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(0.5, 0.5, CW - 1, HUD_H - 1)
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, 8, 10, 8, '#ffd23f', 3, 'left')
            text(`1UP ${String(gs.score).padStart(6, '0')}`, 8, 20, 8, '#ff5d5d', 3, 'left')
            text(gs.roomData.bonus ? `BONUS ${Math.ceil(gs.bonusT / 60)}` : `ROOM ${gs.room + 1}/${TOTAL_ROOMS}`, CW / 2, 10, 8, gs.roomData.bonus ? '#8fff9f' : '#5d7094', 2)
            for (let i = 0; i < Math.min(6, gs.lives); i++) {
                ctx.fillStyle = '#e8eef8'
                ctx.fillRect(CW / 2 - 14 + i * 6, 14, 4, 6)
            }
            // weapon rack + energy
            ctx.drawImage(SP[`icon_${gs.weapon}`], CW - 96, 4)
            text(WEAPONS[gs.weapon].name.split(' ')[0], CW - 56, 11, 7, '#cfd8ff', 0, 'left')
            ctx.fillStyle = '#101a33'
            ctx.fillRect(CW - 96, 15, 84, 5)
            ctx.fillStyle = gs.energy >= CFG.firebombCost ? ((gs.tick >> 3) % 2 ? '#ffd23f' : '#ff8a3f') : '#5d7094'
            ctx.fillRect(CW - 96, 15, 84 * (gs.energy / CFG.maxEnergy), 5)
            ctx.fillStyle = '#10141f'
            ctx.fillRect(CW - 96 + 84 * (CFG.firebombCost / CFG.maxEnergy), 15, 1, 5)
            text('POWER', CW - 12, 20, 6, '#5d7094', 0, 'right')
            if (gs.roomData.bonus) {
                ctx.fillStyle = 'rgba(143,255,159,0.15)'
                ctx.fillRect(0, HUD_H, CW * Math.max(0, gs.bonusT / gs.roomData.bonusTime), 2)
            }
        }

        const draw = () => {
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, CW, CH)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }
            ctx.drawImage(floor, 0, HUD_H)
            drawWalls()
            drawExits()
            drawSpawns()
            drawCratesItems()
            if (gs.roomData.bonus) drawCivilians()
            drawEnemies()
            drawShots()
            drawPlayer()
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                if (p.t < 20) { ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 20; ctx.fillRect(p.x, p.y, 2, 2); ctx.globalAlpha = 1 }
            }
            while (parts.length && parts[0].t >= 20) parts.shift()
            for (const pp of pops) {
                pp.y -= 0.4; pp.t++
                text(pp.txt, pp.x, pp.y - HUD_H / 2 > 0 ? pp.y : pp.y + 16, 8, pp.col, 4)
            }
            while (pops.length && pops[0].t >= 40) pops.shift()
            ctx.restore()

            if (flash > 0) { ctx.fillStyle = `rgba(255,60,40,${flash * 0.025})`; ctx.fillRect(0, 0, CW, CH); flash -= 0.5 }
            if (gs.player.deadT > 0) {
                const t = (CFG.deadFreeze - gs.player.deadT) / CFG.deadFreeze
                ctx.fillStyle = `rgba(80,0,0,${0.15 + t * 0.5})`
                ctx.fillRect(0, HUD_H, CW, CH - HUD_H)
            }

            drawHud()
            if (toast > 0) { text(toastMsg, CW / 2, CH - 18, 9, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,3,12,0.78)'
                ctx.fillRect(0, 0, CW, CH)
                text('SMASH TV', CW / 2, 66, 30, '#ff5d5d', 16)
                text('WILLIAMS 1990 · THE GAME-SHOW DEATH ARENA', CW / 2, 86, 7, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY TO START', CW / 2, 112, 9, '#e9f7ff', 4)
                const b = board()[0]
                if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, CW / 2, 130, 8, '#ffd23f', 3)
                text('ARROWS MOVE · IJKL FIRING STICK · SPACE FIRE', CW / 2, 158, 7, '#5d7094')
                text('B FIREBOMB · ONE HIT KILLS · DEMO IS THE PROVEN RUN', CW / 2, 170, 7, '#5d7094')
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.78)'
                ctx.fillRect(0, 0, CW, CH)
                text(gs.end === 'win' ? 'THE SHOW IS YOURS!' : 'THAT\u2019S ALL, FOLKS!', CW / 2, 96, 18, gs.end === 'win' ? '#8fff9f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')} · ROOM ${gs.room + 1}/${TOTAL_ROOMS}`, CW / 2, 122, 9, '#ffd23f', 4)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', CW / 2, 150, 9, '#e9f7ff', 4)
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
            if (h.room) h.room.textContent = `${gs.room + 1}/${TOTAL_ROOMS}`
        }

        // ---------------------------------------------------------------- input ----
        const startPlay = () => {
            gs = makeGame(Math.floor(Math.random() * 1000) % 97)
            floor = buildFloor(0, gs.seed)
            demoAt = 0
            setMode('play')
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) startPlay(); return }
            if (ev.code === 'KeyB' || ev.code === 'KeyX') bombEdge = true
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyI', 'KeyJ', 'KeyK', 'KeyL'].includes(ev.code)) ev.preventDefault()
            held.add(ev.code)
        }
        const onKeyUp = (ev) => { held.delete(ev.code) }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') startPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) startPlay()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointer)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__smashTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ mx: 0, my: 0, fire: false, bomb: false }) },
                stepWith: (inp) => doSim(inp),
                press: (codes) => { for (const c of codes) held.add(c) },
                release: (codes) => { for (const c of codes) held.delete(c) },
                bomb: () => { bombEdge = true },
                start: () => startPlay(),
                plan: (seed = 0, opts) => plan(seed, opts),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, score: gs.score, lives: gs.lives, room: gs.room,
                    weapon: gs.weapon, energy: gs.energy, cleared: gs.cleared, end: gs.end,
                    hash: stateHash(gs),
                    player: { x: gs.player.x, y: gs.player.y, aim: gs.player.aim, invuln: gs.player.invuln, deadT: gs.player.deadT },
                    enemies: gs.enemies.map((e) => ({ kind: e.kind, x: e.x, y: e.y, hp: e.hp })),
                    ebullets: gs.ebullets.length, bullets: gs.bullets.length,
                    crates: gs.crates.map((k) => k.hp), items: gs.items.filter((i) => !i.taken).map((i) => i.t),
                    civilians: gs.civilians.length, bonusT: gs.bonusT,
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg({
                title: 'SMASH TV',
                getState: () => [
                    `${ROOM_NAMES[gs.room]} lives ${gs.lives} score ${gs.score} weapon ${gs.weapon} energy ${gs.energy}`,
                    `player ${gs.player.x.toFixed(0)},${gs.player.y.toFixed(0)} aim ${gs.player.aim.join(',')} inv ${gs.player.invuln}${gs.cleared ? ' EXIT OPEN' : ''}`,
                    gs.enemies.map((e) => `${e.kind}@${e.x.toFixed(0)},${e.y.toFixed(0)} h${e.hp}`).join('\n') || (gs.roomData.bonus ? `${gs.civilians.length} contestants running` : 'arena is quiet'),
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed); return r.won ? `fresh sim still winnable (deaths ${r.deaths})` : 'fresh sim NOT winnable' } },
                    { label: 'kill all', run: () => { gs.enemies = []; return 'cleared (cheat)' } },
                    { label: 'max power', run: () => { gs.energy = CFG.maxEnergy; return 'power 100' } },
                    { label: 'open exits', run: () => { gs.cleared = true; return 'exits open (cheat)' } },
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
            if (import.meta.env.DEV) { unmountDbg(); delete window.__smashTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'SMASH TV')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05050c] select-none">
            <div ref={stageRef} className="relative w-full max-w-[768px] aspect-[256/248] shadow-[0_0_40px_rgba(224,58,58,0.25)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>ROOM <span ref={setHud('room')} className="text-[#e9f7ff]">1/9</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#ff5d5d]">3</span></span>
            </div>
            <VirtualControls
                visible={screen === 'play' && !paused}
                secondAction={{ label: 'BOMB', code: 'KeyB' }}
            />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default SmashTVGame

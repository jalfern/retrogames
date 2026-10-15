// WIZARDRY — the arcade shell. Everything is runtime art: a shaded
// painter's-algorithm wireframe of the same grid the sim walks (256x224),
// bitmap-plate monster sprites, an automap built from the explored set.
// The attract demo is the Node-proven solver driving THIS state machine
// live — wizcheck's witness and the demo are the same code.
//
// Layout: 1. projection + sprites 2. fixed-timestep shell (commands are
// discrete; the clock only drives fades/bob) 3. input 4. DEV hook + DebugKit
// 5. React HUD. The pixel contract the harness samples: wall immediately
// ahead ⇒ the screen centre is wall-blue; open corridor ⇒ the centre is the
// dark end of the hall.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { makeRun, step, stateHash, cloneState, SIZE, W, H, DX, DY } from './sim.js'
import { nextAction, playOut } from './solver.js'

const SIM_MS = 1000 / 60
const DEMO_MS = 170
const CX = 128
const DEPTH = 6

// ring(d) = the projected far edge of the cell d steps ahead.
const ring = (d) => {
    const k = 1 / d
    return { l: CX - 118 * k, r: CX + 118 * k, t: 100 - 86 * k, b: 100 + 86 * k }
}

const lerpShade = (c1, c2, t) => {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    const a = p(c1), b = p(c2)
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t))
    return `rgb(${m[0]},${m[1]},${m[2]})`
}
const dim = (t) => lerpShade('#04050c', '#4a54a0', t)
const dimSide = (t) => lerpShade('#03040a', '#343d78', t)

// runtime monster plates: 10x10 bitmaps, palette letters
const ART = {
    rat: { s: 5, pal: { b: '#a8763e', d: '#6b4519', e: '#ff5252', w: '#e8d8b8' }, rows: [
        '..bb......', '.bbbb.....', 'bbdbe.bb..', 'bbbbb.bbb.', '.bbbbb.bbb', '.bdbbb.bd.', '..bbbbbb..', '..bd..db..', '...b..b...', '..........'] },
    snake: { s: 5, pal: { g: '#5fae4e', d: '#2f6b2a', e: '#ffe082' }, rows: [
        '..........', '....gg....', '...gege...', '..ggdggg..', '.gg...dg..', 'gd....gg..', 'g......dg.', '.......gg.', '......gd..', '..........'] },
    goblin: { s: 5, pal: { g: '#79b85c', d: '#3f6b2e', e: '#ffd54f', r: '#b3402e', m: '#8a6b46' }, rows: [
        '...gg.....', '..gggg....', '.gegge....', '.ggggg..m.', '..gdg...m.', '.grrrrg.m.', '.grddrg.m.', '..grrg.mm.', '..g..g....', '.gg..gg...'] },
    skelet: { s: 6, pal: { w: '#dfe3e8', d: '#8f98a6', e: '#222', r: '#c8503c' }, rows: [
        '..wwww....', '.wwwwww...', '.wewwew...', '.wwddww...', '..wddw....', '...ww..r..', '..wwww.wr.', '.w.ww.w.r.', '...ww...r.', '..ww.ww...'] },
    wraith: { s: 6, pal: { p: '#8f9bff', d: '#3a3f8f', e: '#c6ff00' }, rows: [
        '..pppp....', '.pppppp...', 'peppppep..', 'pppppppp..', '.ppddpp...', '..pddp....', '..pddp.pp.', '...pp.pp..', '...pp.p...', '..p..p....'] },
    lich: { s: 9, pal: { k: '#4b4f6b', d: '#23263a', g: '#7dffce', r: '#ff5252', y: '#ffd54f', w: '#e8ecf5' }, rows: [
        '...yyyy...', '..ywwwwy..', '.ywkddkwy.', '.wkddddkw.', '.wrddddrw.', '..kddddk..', '.kkddddkk.', 'kkkddddkkk', 'k.kddddk.k', '...kkkk...'] },
}

const drawMob = (ctx, art, x, y, size, flash) => {
    const A = ART[art]
    if (!A) return
    const u = size / 10
    for (let r = 0; r < A.rows.length; r++) {
        for (let c = 0; c < 10; c++) {
            const ch = A.rows[r][c]
            if (ch === '.' || !ch) continue
            ctx.fillStyle = flash ? '#ffffff' : (A.pal[ch] || '#fff')
            ctx.fillRect(x + c * u, y + r * u, u + 0.6, u + 0.6)
        }
    }
}

const WizardryGame = () => {
    const stageRef = useRef(null)
    const mapRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.wizView = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeRun()
        let raf = 0, last = 0, acc = 0, demoAcc = 0, bob = 0
        let toast = 0, toastMsg = ''
        const evLog = []
        let shake = 0, flashHit = 0

        const say = (m) => { toastMsg = m; toast = 150 }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.type === 'ambush') { audioController.playSweep(180, 60, 0.5, 'sawtooth', 0.09); say(e.boss ? 'THE LICH RISES!' : `AMBUSH: ${e.group.join(', ')}`) }
                else if (e.type === 'hit') { audioController.playNoise(0.12, 0.07); shake = 4; flashHit = 0.25 }
                else if (e.type === 'slay') { audioController.playSweep(420, 90, 0.22, 'square', 0.06); say(`${e.name} SLAIN`) }
                else if (e.type === 'fire') { audioController.playSweep(700, 180, 0.18, 'sawtooth', 0.05) }
                else if (e.type === 'heal' || e.type === 'potion') audioController.playSweep(320, 880, 0.24, 'sine', 0.06)
                else if (e.type === 'levelup') { audioController.playSweep(400, 1200, 0.5, 'square', 0.07); say(`${e.who} — LEVEL ${e.lvl}!`) }
                else if (e.type === 'fall') { audioController.playSweep(300, 60, 0.7, 'sawtooth', 0.09); say(`${e.who} HAS FALLEN`) }
                else if (e.type === 'victory') { audioController.playSweep(500, 1600, 0.7, 'square', 0.08); say(e.boss ? '' : 'BATTLE WON') }
                else if (e.type === 'pickup') { audioController.playTone(880, 0.09, 'square', 0.05); say('A POTION!') }
                else if (e.type === 'spring') { audioController.playSweep(240, 640, 0.4, 'sine', 0.06); say('THE SPRING RESTORES YOUR POWER') }
                else if (e.type === 'descend') audioController.playSweep(600, 120, 0.6, 'triangle', 0.08)
                else if (e.type === 'bump') audioController.playTone(90, 0.05, 'square', 0.05)
                else if (e.type === 'fled') audioController.playSweep(500, 150, 0.3, 'square', 0.06)
                else if (e.type === 'noback') say('THERE IS NO FLIGHT FROM THE LICH')
                else if (e.type === 'empty') audioController.playTone(70, 0.06, 'triangle', 0.05)
            }
        }

        const finish = (win) => {
            setEnd({ win, tick: gs.tick })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const act = (cmd) => {
            if (gs.end) return
            step(gs, cmd)
            handleEvents(gs.events.splice(0))
            // the attract demo may win or die — that is theatre, not a game over;
            // only the PLAYER's run ends the screen
            if (gs.end && screenRef.current === 'play') finish(gs.end === 'win')
        }

        const tickDemo = () => {
            if (gs.end) { gs = makeRun(); return }
            act(nextAction(gs))
        }

        const doFrameSim = () => {
            if (screenRef.current === 'attract') {
                demoAcc += SIM_MS
                if (demoAcc >= DEMO_MS) { demoAcc = 0; tickDemo() }
            }
        }

        // ---------------------------------------------------------------- paint ----
        const ahead = (i) => ({ x: gs.x + DX[gs.dir] * i, y: gs.y + DY[gs.dir] * i })

        const quad = (x0, y0, x1, y1, x2, y2, x3, y3, col) => {
            ctx.fillStyle = col
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill()
        }

        const paintMap = () => {
            ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, 200)
            for (let i = DEPTH; i >= 1; i--) {
                const o = ring(i - 1 === 0 ? 0.62 : i - 1)
                const n = ring(i)
                const lit = (DEPTH - i + 1) / DEPTH
                const cell = ahead(i)
                const solid = gs.map.wall(cell.x, cell.y)
                // ceiling + floor strips of this cell
                quad(o.l, 0, o.r, 0, n.r, n.t, n.l, n.t, lerpShade('#02030a', '#151a38', lit * 0.5))
                quad(o.l, 200, o.r, 200, n.r, n.b, n.l, n.b, dimSide(lit * 0.32))
                // side walls
                const lx = cell.x + DX[(gs.dir + 3) % 4], ly = cell.y + DY[(gs.dir + 3) % 4]
                const rx = cell.x + DX[(gs.dir + 1) % 4], ry = cell.y + DY[(gs.dir + 1) % 4]
                if (gs.map.wall(lx, ly)) quad(o.l, o.t, o.l, o.b, n.l, n.b, n.l, n.t, dimSide(lit * 0.6))
                if (gs.map.wall(rx, ry)) quad(o.r, o.t, o.r, o.b, n.r, n.b, n.r, n.t, dimSide(lit * 0.82))
                // front face
                if (solid) {
                    quad(n.l, n.t, n.r, n.t, n.r, n.b, n.l, n.b, dim(lit))
                    ctx.strokeStyle = lerpShade('#04050c', '#7c88e8', lit)
                    ctx.strokeRect(n.l, n.t, n.r - n.l, n.b - n.t)
                    return
                }
                // floor features on this open cell
                const t = cell.y * SIZE + cell.x
                const inRing = (h) => {
                    const y = n.b - (n.b - n.t) * h
                    return [n.l + (n.r - n.l) * 0.5, y]
                }
                if (gs.pots.has(t)) {
                    const [fx, fy] = inRing(0.28)
                    ctx.fillStyle = '#c98f4e'
                    ctx.fillRect(fx - 3 * (2 / i), fy - 4 / i, 6 * (2 / i), 4 / i + 1)
                }
                if (gs.springs.has(t)) {
                    const [fx, fy] = inRing(0.16)
                    ctx.fillStyle = '#2e6fd8'
                    ctx.fillRect(fx - 10 / i, fy - 2 / i, 20 / i, 3 / i + 1)
                    ctx.fillStyle = '#7fc4ff'
                    ctx.fillRect(fx - 5 / i + (Math.sin(bob / 9 + i) * 3) / i, fy - 3 / i, 4 / i, 1)
                }
                if (gs.map.stairs && gs.map.stairs.y === cell.y && gs.map.stairs.x === cell.x) {
                    const [fx, fy] = inRing(0.2)
                    ctx.fillStyle = '#57e389'
                    for (let s = 0; s < 3; s++) ctx.fillRect(fx - (12 - s * 3) / i, fy - s * (3 / i), (24 - s * 6) / i, 1.6)
                }
                if (gs.map.throne && gs.map.throne.y === cell.y && gs.map.throne.x === cell.x) {
                    ctx.fillStyle = '#b3402e'
                    ctx.fillRect(n.l + 2, n.t + 2, n.r - n.l - 4, n.b - n.t - 4)
                    ctx.fillStyle = '#ffd54f'
                    ctx.fillRect(n.l + (n.r - n.l) * 0.4, n.t + (n.b - n.t) * 0.25, (n.r - n.l) * 0.2, (n.b - n.t) * 0.5)
                }
                // an ambush-still-hidden tile has no tell — honest darkness
            }
            // crosshair
            ctx.fillStyle = 'rgba(255,255,255,0.35)'
            ctx.fillRect(CX - 4, 100, 9, 1); ctx.fillRect(CX, 96, 1, 9)
        }

        const paintCombat = () => {
            const g = ctx.createLinearGradient(0, 0, 0, 150)
            g.addColorStop(0, '#131633'); g.addColorStop(1, '#2a1d3d')
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, 150)
            ctx.fillStyle = '#0d0a16'; ctx.fillRect(0, 150, W, 50)
            const mobs = gs.combat ? gs.combat.mobs : []
            const live = mobs.filter((m) => m.hp > 0)
            const wob = Math.sin(bob / 7) * 2
            mobs.forEach((m, i) => {
                const n = Math.max(live.length, mobs.length)
                const slot = mobs.indexOf(m)
                const sx = 128 + (slot - (n - 1) / 2) * 62
                const A = ART[m.art]
                const size = (A ? A.s * 10 : 50) * (m.key === 'LICH' ? 1.25 : 1)
                if (m.hp > 0) {
                    drawMob(ctx, m.art, sx - size / 2, 140 - size + wob, size, flashHit > 0)
                    if (i === gs.target) {
                        ctx.strokeStyle = '#ffffff'
                        ctx.beginPath()
                        ctx.moveTo(sx - size / 2 - 3, 140 - size + wob + 6)
                        ctx.lineTo(sx - size / 2 - 3, 140 + wob)
                        ctx.moveTo(sx + size / 2 + 3, 140 - size + wob + 6)
                        ctx.lineTo(sx + size / 2 + 3, 140 + wob)
                        ctx.stroke()
                    }
                    ctx.fillStyle = '#222'; ctx.fillRect(sx - 16, 144, 32, 4)
                    ctx.fillStyle = m.hp / m.maxHp > 0.4 ? '#e5484d' : '#ff8a3d'
                    ctx.fillRect(sx - 16, 144, 32 * (m.hp / m.maxHp), 4)
                }
            })
            if (gs.combat && gs.combat.boss) {
                ctx.fillStyle = '#ff5252'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
                ctx.fillText('THE LICH — NO FLIGHT', 128, 14)
            }
        }

        const paint = () => {
            bob++
            if (flashHit > 0) flashHit -= 0.02
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.4) shake = 0 }
            ctx.save(); ctx.translate(sx, sy)
            if (screenRef.current === 'play' && gs.mode === 'combat') paintCombat()
            else paintMap()
            ctx.restore()
            ctx.fillStyle = '#000'; ctx.fillRect(0, 200, W, H - 200)
            // six mini panels along the foot
            gs.party.forEach((h, i) => {
                const px = 4 + i * 42
                ctx.fillStyle = h.alive ? '#0c1024' : '#1a0d12'
                ctx.fillRect(px, 204, 38, 18)
                ctx.fillStyle = h.alive ? '#9fb4ff' : '#6b4050'
                ctx.font = '6px monospace'; ctx.textAlign = 'left'
                ctx.fillText(h.name.slice(0, 7), px + 2, 210)
                ctx.fillStyle = '#333'; ctx.fillRect(px + 2, 213, 34, 2)
                ctx.fillStyle = '#e5484d'; ctx.fillRect(px + 2, 213, 34 * Math.max(0, h.hp / h.maxHp), 2)
                ctx.fillStyle = '#224'; ctx.fillRect(px + 2, 216, 34, 2)
                ctx.fillStyle = '#4f9dff'; ctx.fillRect(px + 2, 216, 34 * (h.mp / h.maxMp), 2)
                ctx.fillStyle = '#ffd54f'; ctx.fillText('L' + h.lvl, px + 2, 221)
            })
            drawAutomap()
        }

        const drawAutomap = () => {
            const cv = mapRef.current
            if (!cv) return
            const g = cv.getContext('2d')
            const C = 5
            g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height)
            for (const t of gs.explored) {
                const x = t % SIZE, y = Math.floor(t / SIZE)
                g.fillStyle = '#3c466e'
                g.fillRect(x * C, y * C, C, C)
            }
            if (gs.map.stairs && gs.explored.has(gs.map.stairs.y * SIZE + gs.map.stairs.x)) {
                g.fillStyle = '#57e389'; g.fillRect(gs.map.stairs.x * C, gs.map.stairs.y * C, C, C)
            }
            if (gs.map.throne && gs.explored.has(gs.map.throne.y * SIZE + gs.map.throne.x)) {
                g.fillStyle = '#ff5252'; g.fillRect(gs.map.throne.x * C, gs.map.throne.y * C, C, C)
            }
            for (const t of gs.springs) if (gs.explored.has(t)) { g.fillStyle = '#2e6fd8'; g.fillRect((t % SIZE) * C, Math.floor(t / SIZE) * C, C, C) }
            // the hero: amber square + a barrel of facing
            const hx = gs.x * C, hy = gs.y * C
            g.fillStyle = '#ffd54f'; g.fillRect(hx, hy, C, C)
            g.fillStyle = '#fff'
            g.fillRect(hx + C / 2 + DX[gs.dir] * 3 - 1, hy + C / 2 + DY[gs.dir] * 3 - 1, 2, 2)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 100) return
            lastHud = now
            const h = hudRef.current
            if (h.floor) h.floor.textContent = gs.map.name
            if (h.potions) h.potions.textContent = String(gs.potions)
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (h.cmd) h.cmd.textContent = gs.mode === 'combat' ? 'SPACE attack · F fire · H heal · P potion · L flee' : 'ARROWS walk · SPACE use · P potion'
            if (h.dir) h.dir.textContent = ['EAST', 'SOUTH', 'WEST', 'NORTH'][gs.dir]
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeRun()
            evLog.length = 0
            setMode('play')
            say(gs.map.name.toUpperCase())
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            const fighting = gs.mode === 'combat'
            if (!fighting && e.repeat && ['Space', 'KeyP', 'KeyF'].includes(e.code)) return
            if (e.code === 'ArrowUp') act(fighting ? 'target+' : 'fwd')
            else if (e.code === 'ArrowDown') act(fighting ? 'target-' : 'back')
            else if (e.code === 'ArrowLeft') act(fighting ? 'target-' : 'left')
            else if (e.code === 'ArrowRight') act(fighting ? 'target+' : 'right')
            else if (e.code === 'Space') act(fighting ? 'attack' : 'use')
            else if (e.code === 'KeyF') act(fighting ? 'fire' : 'use')
            else if (e.code === 'KeyH') act(fighting ? 'heal' : 'wait')
            else if (e.code === 'KeyP') act('potion')
            else if (e.code === 'KeyL') act(fighting ? 'flee' : 'wait')
        }
        window.addEventListener('keydown', onDown)

        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
        }
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / (H + 40))
            canvas.style.width = `${W * sc}px`
            canvas.style.height = `${H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__wizTest = {
                probe: () => ({
                    screen: screenRef.current, mode: gs.mode, end: gs.end, tick: gs.tick,
                    floor: gs.floor, x: gs.x, y: gs.y, dir: gs.dir, potions: gs.potions,
                    wallAhead: !!gs.map.wall(gs.x + DX[gs.dir], gs.y + DY[gs.dir]),
                    stairs: gs.map.stairs, throne: gs.map.throne,
                    springHere: gs.springs.has(gs.y * SIZE + gs.x),
                    potHere: gs.pots.has(gs.y * SIZE + gs.x),
                    explored: gs.explored.size,
                    view: (() => {
                        // what the wireframe can see: first solid depth + features
                        // in front, exactly as paintMap walks the corridor
                        let wallDist = 7, pots = 0, springs = 0, stairs = false
                        for (let i = 1; i <= DEPTH; i++) {
                            const cell = { x: gs.x + DX[gs.dir] * i, y: gs.y + DY[gs.dir] * i }
                            if (gs.map.wall(cell.x, cell.y)) { wallDist = i; break }
                            const t = cell.y * SIZE + cell.x
                            if (gs.pots.has(t)) pots = i
                            if (gs.springs.has(t)) springs = i
                            if ((gs.map.stairs && gs.map.stairs.y === cell.y && gs.map.stairs.x === cell.x) ||
                                (gs.map.throne && gs.map.throne.y === cell.y && gs.map.throne.x === cell.x)) stairs = true
                        }
                        return { wallDist, pots, springs, stairs }
                    })(),
                    mobPx: gs.combat ? gs.combat.mobs.map((m, i) => {
                        const liveN = gs.combat.mobs.filter((q) => q.hp > 0).length
                        const n = Math.max(liveN, gs.combat.mobs.length)
                        const slot = gs.combat.mobs.indexOf(m)
                        const sx = 128 + (slot - (n - 1) / 2) * 62
                        const A = ART[m.art]
                        const size = (A ? A.s * 10 : 50) * (m.key === 'LICH' ? 1.25 : 1)
                        return { i, sx, size, hp: m.hp }
                    }) : [],
                    party: gs.party.map((h) => ({ ...h })),
                    combat: gs.combat ? { boss: gs.combat.boss, round: gs.combat.round, mobs: gs.combat.mobs.map((m) => ({ ...m })), target: gs.target } : null,
                    ledger: { ...gs.ledger },
                    potTiles: gs.ledger.potTiles.slice(),
                    springTiles: gs.ledger.springTiles.slice(),
                    automapCursor: [gs.x * 5, gs.y * 5],
                    evLog: evLog.slice(-140),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                cmd: (c) => { act(c); return true },
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.floor !== undefined && opts.floor !== gs.floor && opts.floor < 3) {
                        for (let f = gs.floor; f < opts.floor; f++) step(gs, 'wait')
                        gs = makeRun()
                        while (gs.floor < opts.floor) {
                            gs.combat = null
                            gs.x = gs.map.stairs.x; gs.y = gs.map.stairs.y
                            step(gs, 'use')
                        }
                    }
                    if (opts.party) for (const p of opts.party) {
                        const h = gs.party.find((q) => q.name === p.name) || gs.party[p.i]
                        if (h) { if (p.hp !== undefined) { h.hp = p.hp; h.alive = p.hp > 0 } if (p.mp !== undefined) h.mp = p.mp }
                    }
                    if (opts.potions !== undefined) gs.potions = opts.potions
                    if (opts.at) {
                        const [ax, ay] = opts.at
                        let guard = 0
                        while ((gs.x !== ax || gs.y !== ay) && guard++ < 4000) {
                            const d = [0, 1, 2, 3].find((d) => !gs.map.wall(gs.x + DX[d], gs.y + DY[d]) && ((d === 0 && ax > gs.x) || (d === 1 && ay > gs.y) || (d === 2 && ax < gs.x) || (d === 3 && ay < gs.y)) && true)
                            if (d === undefined) { gs.dir = (gs.dir + 1) % 4; continue }
                            gs.dir = d
                            act('fwd')
                            if (gs.mode === 'combat') { gs.combat = null; gs.mode = 'map' }
                        }
                        gs.x = ax; gs.y = ay
                    }
                    if (opts.facing !== undefined) gs.dir = opts.facing
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'WIZARDRY',
                getState: () => [
                    `${gs.map.name}  (${gs.x},${gs.y}) facing ${['E', 'S', 'W', 'N'][gs.dir]}  mode ${gs.mode}`,
                    `potions ${gs.potions}  explored ${gs.explored.size}  dealt ${gs.ledger.dealt} taken ${gs.ledger.taken}`,
                    gs.party.map((h) => `${h.name} ${h.hp}/${h.maxHp}mp${h.mp}L${h.lvl}${h.alive ? '' : ' x'}`).join('  '),
                    gs.combat ? `ROUND ${gs.combat.round}: ${gs.combat.mobs.map((m) => `${m.name} ${m.hp}`).join(' | ')}` : `end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const cl = cloneState(gs)
                            const r = playOut(cl, 60000)
                            return r.won
                                ? `WINNABLE from HERE: solved in ${r.ticks} more commands (${r.ledger.potionsUsed} potions, ${r.ledger.springsUsed} springs to spend)`
                                : `NOT winnable from here with the autopilot: end=${r.end} after ${r.ticks} ticks — if you cheated the state, that is expected; on a clean run this must never appear`
                        },
                    },
                    { label: '+5 POTIONS', run: () => { gs.potions += 5; return 'five crimson vials' } },
                    { label: 'FULL HEAL', run: () => { for (const h of gs.party) { h.hp = h.maxHp; h.mp = h.maxMp; if (h.hp > 0) h.alive = true } return 'the party is whole' } },
                    { label: 'WARP TO STAIRS', run: () => { if (!gs.map.stairs) return 'the Lich owns this floor'; gs.x = gs.map.stairs.x; gs.y = gs.map.stairs.y; return 'the stair glows' } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__wizTest) delete window.__wizTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />
            <canvas ref={mapRef} data-wiz-map="1" width={95} height={95}
                className="absolute bottom-3 left-3 border border-indigo-500/40 bg-black/80 rounded opacity-90 pointer-events-none"
                style={{ imageRendering: 'pixelated', display: play ? 'block' : 'none', width: '118px', height: '118px' }} />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('floor')} className="border border-indigo-400/60 text-indigo-200 px-2 py-0.5 rounded bg-black/40">LEVEL 1</span>
                    <span className="text-amber-200">POTIONS <b ref={setHud('potions')}>1</b></span>
                    <span className="text-cyan-200">FACING <b ref={setHud('dir')}>EAST</b></span>
                    <span ref={setHud('cmd')} className="ml-auto text-white/60" />
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #33f' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-5xl font-black tracking-widest" style={{ color: '#ffd54f', textShadow: '3px 3px 0 #6b21a8, 0 10px 28px #000' }}>WIZARDRY</h1>
                    <p className="text-indigo-200/90 font-mono mt-1 text-sm">CRAWL OF THE SIX · THE LICH KEEPS</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY TO START</p>
                    <p className="text-indigo-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        six heroes, one torch-lit grid: ARROWS walk and turn · SPACE uses stairs, springs and the throne<br />
                        in battle: SPACE attacks, F hurls FIREBOLT, H heals, P drinks a potion, L flees (not the Lich) · arrows pick the target<br />
                        every swing is ledger-exact and every maze is seeded — the autopilot walking this title screen is the same proof the CI harness runs<br />
                        three levels deep, supplies are real: lose them and the crawl gets harder
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-amber-50 font-mono px-6 text-center">
                    <h2 className={`text-4xl font-black mb-2 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'THE LICH HAS FALLEN' : 'THE PARTY PERISHES'}</h2>
                    <p className="text-lg mb-4">{end.win ? 'Level 3 is silent. The keep is yours.' : 'The dark keeps what it takes. The keep reshuffles for the next six.'}</p>
                    <p className="text-sm text-white/70">{(end.win ? 'Victory at tick ' : 'Fallen at tick ') + end.tick}</p>
                    <p className="mt-6 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'WIZARDRY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default WizardryGame

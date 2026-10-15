import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeGame, step, CFG } from './sim.js'
import { RACES, GRID, W, H, TW, TH, TZ, PAIRS, SKY_TOP, SKY_BOT, SIDE1, SIDE2 } from './levels.js'
import { plan, bfsPath, press } from './planner.js'
import { padState } from '../../utils/padState'

// MARBLE MADNESS (Atari 1984) — iso heightmap course, inertial trackball.
// All physics/rules live in sim.js (pure, deterministic); this file is painter
// + HUD + input. Attract mode replays a scripted winning run of all six races.

const OX = W / 2
const OY = 118

const isoX = (x, y) => OX + (x - y) * (TW / 2)
const isoY = (x, y, z) => OY + (x + y) * (TH / 2) - z * TZ

let attractPlan = null
const attractScript = () => {
    if (!attractPlan) attractPlan = plan(0, { maxTicks: 60 * 60 * 9 }).script
    return attractPlan
}

const MarbleMadnessGame = () => {
    const canvasRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        canvas.width = W
        canvas.height = H
        ctx.imageSmoothingEnabled = false

        let mode = 'attract'
        let gs = null
        let script = null
        let scriptT = 0
        let unmountDbg = null
        const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false }
        // The arrows are the digital read; padState.engaged means the floating
        // stick or a gamepad stick is pushed, and its vector is the trackball.
        const inp = () => {
            const o = { left: keys.ArrowLeft, right: keys.ArrowRight, up: keys.ArrowUp, down: keys.ArrowDown }
            if (padState.engaged) o.analog = { x: padState.x, y: padState.y }
            return o
        }

        let particles = []
        let banner = null
        let shake = 0
        let demoTicks = 0
        const stars = []
        for (let i = 0; i < 70; i++) stars.push([(i * 173) % W, (i * 97) % 100, (i * 37) % 3])

        // ---- audio -----------------------------------------------------------
        const sfx = (ev) => {
            switch (ev.type) {
                case 'tickBeep': audioController.playTone(ev.secs <= 3 ? 1100 : 800, 0.06, 'square', 0.12); break
                case 'steelieHit': audioController.playTone(180, 0.12, 'square', 0.2); audioController.playNoise(0.1, 0.18); break
                case 'shatter': audioController.playNoise(0.25, 0.3); audioController.playSweep(900, 120, 0.3, 'sawtooth', 0.18); break
                case 'void': audioController.playSweep(700, 90, 0.45, 'sine', 0.18); break
                case 'munch': audioController.playSweep(500, 90, 0.2, 'square', 0.2); break
                case 'acid': audioController.playSweep(300, 80, 0.35, 'sawtooth', 0.18); break
                case 'bounce': audioController.playSweep(250, 700, 0.15, 'sine', 0.16); break
                case 'throw': audioController.playSweep(200, 900, 0.2, 'triangle', 0.15); break
                case 'land': audioController.playTone(120, 0.05, 'triangle', 0.1); break
                case 'respawn': audioController.playSweep(400, 900, 0.2, 'sine', 0.12); break
                case 'practiceRestart': audioController.playTone(300, 0.15, 'triangle', 0.15); break
                case 'raceStart': audioController.playTone(600, 0.09, 'square', 0.12); break
                case 'raceClear':
                    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.12, 'square', 0.14), i * 90))
                    break
                case '1up': [784, 1047, 1319].forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.1, 'square', 0.14), i * 80)); break
                case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.14, 'square', 0.16), i * 110)); break
                case 'over': audioController.playSweep(400, 60, 0.8, 'sawtooth', 0.2); break
            }
        }

        const consumeEvents = () => {
            for (const ev of gs.events) {
                sfx(ev)
                if (ev.type === 'raceStart') banner = { text: RACES[ev.race].name + (ev.carry ? `  +${Math.round(ev.carry / 60)}s CARRY` : ''), t: 110, big: true }
                if (ev.type === 'raceClear') banner = { text: `RACE CLEAR  +${ev.pts}`, t: 120, big: true }
                if (ev.type === '1up') banner = { text: '1UP!', t: 90, big: true }
                if (ev.type === 'win') banner = { text: 'COURSE COMPLETE!', t: 240, big: true }
                if (ev.type === 'shatter' || ev.type === 'void' || ev.type === 'munch') {
                    shake = 12
                    for (let i = 0; i < 16; i++) particles.push({
                        x: isoX(ev.x, ev.y), y: isoY(ev.x, ev.y, ev.z ?? gs.m.z),
                        vx: (Math.random() - 0.5) * 3.4, vy: -Math.random() * 3 - 0.4, life: 46,
                        c: ['#ff5060', '#ffb060', '#fff', '#d03040'][i % 4],
                    })
                }
                if (ev.type === 'steelieHit') {
                    shake = 6
                    for (let i = 0; i < 8; i++) particles.push({
                        x: isoX(ev.x, ev.y), y: isoY(ev.x, ev.y, gs.m.z),
                        vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 26, c: '#ffe28a',
                    })
                }
            }
            gs.events.length = 0
        }

        const startRun = () => {
            gs = makeGame(0)
            mode = 'play'
            script = null
            particles = []
            banner = { text: RACES[0].name, t: 110, big: true }
        }

        const startAttract = () => {
            gs = makeGame(0)
            script = attractScript()
            scriptT = 0
            demoTicks = 0
            mode = 'attract'
            particles = []
            banner = null
        }

        // ---- painter ---------------------------------------------------------
        const diamond = (c, r, z, fill) => {
            ctx.fillStyle = fill
            ctx.beginPath()
            ctx.moveTo(isoX(c, r), isoY(c, r, z))
            ctx.lineTo(isoX(c + 1, r, z), isoY(c + 1, r, z))
            ctx.lineTo(isoX(c + 1, r + 1, z), isoY(c + 1, r + 1, z))
            ctx.lineTo(isoX(c, r + 1, z), isoY(c, r + 1, z))
            ctx.closePath()
            ctx.fill()
        }

        const draw = () => {
            const sky = ctx.createLinearGradient(0, 0, 0, H)
            sky.addColorStop(0, SKY_TOP)
            sky.addColorStop(1, SKY_BOT)
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, W, H)
            ctx.fillStyle = 'rgba(255,255,255,0.7)'
            for (const [sx, sy, tw] of stars) {
                if ((gs.tick >> 4) % 3 === tw % 3) continue
                ctx.fillRect(sx, sy, 1, 1)
            }

            ctx.save()
            if (shake > 0) {
                shake--
                ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4)
            }

            const pair = PAIRS[gs.race.pairs % PAIRS.length]
            const minZ = gs.heights.flat().reduce((a, b) => Math.min(a, b), 99)
            for (let s = 0; s <= 2 * (GRID - 1); s++) {
                for (let r = Math.max(0, s - GRID + 1); r <= Math.min(GRID - 1, s); r++) {
                    const c = s - r
                    const z = gs.heights[r][c]
                    if (z < 0) continue
                    // side skirts toward lower/void neighbors (south then east)
                    const zr = r + 1 < GRID ? gs.heights[r + 1][c] : -1
                    const zc = c + 1 < GRID ? gs.heights[r][c + 1] : -1
                    const dS = z - (zr >= 0 ? Math.min(zr, z) : minZ)
                    const dE = z - (zc >= 0 ? Math.min(zc, z) : minZ)
                    if (dS > 0) {
                        ctx.fillStyle = SIDE2
                        ctx.beginPath()
                        ctx.moveTo(isoX(c, r + 1), isoY(c, r + 1, z))
                        ctx.lineTo(isoX(c + 1, r + 1), isoY(c + 1, r + 1, z))
                        ctx.lineTo(isoX(c + 1, r + 1), isoY(c + 1, r + 1, z - dS))
                        ctx.lineTo(isoX(c, r + 1), isoY(c, r + 1, z - dS))
                        ctx.closePath()
                        ctx.fill()
                    }
                    if (dE > 0) {
                        ctx.fillStyle = SIDE1
                        ctx.beginPath()
                        ctx.moveTo(isoX(c + 1, r), isoY(c + 1, r, z))
                        ctx.lineTo(isoX(c + 1, r + 1), isoY(c + 1, r + 1, z))
                        ctx.lineTo(isoX(c + 1, r + 1), isoY(c + 1, r + 1, z - dE))
                        ctx.lineTo(isoX(c + 1, r), isoY(c + 1, r, z - dE))
                        ctx.closePath()
                        ctx.fill()
                    }
                    const zt = z + (gs.waves.length && c >= gs.waves[0].x0 && c <= gs.waves[0].x1 && r >= gs.waves[0].y0 && r <= gs.waves[0].y1
                        ? Math.max(0, Math.sin((c + 0.5 - gs.tick * gs.waves[0].speed * 2) * 0.55) * gs.waves[0].amp)
                        : 0)
                    diamond(c, r, zt, pair[(c + r) % 2])
                }
            }

            // goal ring
            const g = gs.race.goal
            ctx.strokeStyle = '#ffd75e'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.ellipse(isoX(g.c + 0.5, g.r + 0.5), isoY(g.c + 0.5, g.r + 0.5, gs.heights[g.r][g.c]) - 8 - Math.sin(gs.tick * 0.1) * 2, 9, 5, 0, 0, Math.PI * 2)
            ctx.stroke()
            ctx.fillStyle = '#ffd75e'
            ctx.fillRect(isoX(g.c + 0.5, g.r + 0.5) - 1, isoY(g.c + 0.5, g.r + 0.5, gs.heights[g.r][g.c]) - 8, 2, 8)

            // slinkies, munchers, hammers, steelies (rough painter order)
            for (const sl of gs.slinkies) {
                const z = gs.heights[sl.r]?.[sl.c]
                if (z == null || z < 0) continue
                const px = isoX(sl.c + 0.5, sl.r + 0.5), py = isoY(sl.c + 0.5, sl.r + 0.5, z)
                ctx.strokeStyle = sl.acid ? '#7dff5e' : '#7de0ff'
                ctx.lineWidth = 2
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath()
                    ctx.ellipse(px, py - 3 - i * 2.4, 5 - i * 0.6, 2.4 - i * 0.3, 0, 0, Math.PI * 2)
                    ctx.stroke()
                }
                if (sl.acid) { ctx.fillStyle = 'rgba(125,255,94,0.35)'; ctx.beginPath(); ctx.ellipse(px, py, 7, 3.4, 0, 0, Math.PI * 2); ctx.fill() }
            }
            for (const mo of gs.munchers) {
                const z = gs.heights[mo.r]?.[mo.c]
                if (z == null || z < 0) continue
                const px = isoX(mo.c + 0.5, mo.r + 0.5), py = isoY(mo.c + 0.5, mo.r + 0.5, z)
                const open = mo.open ? 0.6 : 0.08
                ctx.fillStyle = '#ff7ab0'
                for (const sgn of [-1, 1]) {
                    ctx.beginPath()
                    ctx.ellipse(px, py - 5, 6, 4.4, sgn * open, 0, Math.PI * 2)
                    ctx.fill()
                }
                ctx.fillStyle = '#fff'
                ctx.beginPath(); ctx.arc(px - 2, py - 6, 1.3, 0, Math.PI * 2); ctx.arc(px + 2, py - 6, 1.3, 0, Math.PI * 2); ctx.fill()
            }
            for (const h of gs.hammers) {
                const z = gs.heights[h.r]?.[h.c]
                if (z == null || z < 0) continue
                const bx = isoX(h.c + 0.5, h.r + 0.5), by = isoY(h.c + 0.5, h.r + 0.5, z)
                if (h.hx != null) {
                    const hx = isoX(h.hx, h.hy), hy = isoY(h.hx, h.hy, z + (h.low ? 1.1 : 1.7))
                    ctx.strokeStyle = '#b8b8c8'
                    ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(bx, by - 10); ctx.lineTo(hx, hy - 6); ctx.stroke()
                    ctx.fillStyle = h.low ? '#e84a5a' : '#8a8aa0'
                    ctx.fillRect(hx - 4, hy - 10, 8, 8)
                }
                ctx.fillStyle = '#555568'
                ctx.fillRect(bx - 2, by - 12, 4, 12)
            }
            for (const st of gs.steelies) {
                const z = gs.heights[Math.floor(st.y)]?.[Math.floor(st.x)]
                const zz = z == null ? gs.m.z : z
                ctx.fillStyle = 'rgba(0,0,0,0.4)'
                ctx.beginPath(); ctx.ellipse(isoX(st.x, st.y), isoY(st.x, st.y, zz), 5, 2.4, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#101018'
                ctx.beginPath(); ctx.arc(isoX(st.x, st.y), isoY(st.x, st.y, zz) - 5, 5.5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.beginPath(); ctx.arc(isoX(st.x, st.y) - 2, isoY(st.x, st.y, zz) - 7, 1.6, 0, Math.PI * 2); ctx.fill()
            }

            // marble + shadow
            const m = gs.m
            const gz = gs.heights[Math.floor(m.y)]?.[Math.floor(m.x)]
            if (gs.phase !== 'dying') {
                if (gz != null && gz >= 0) {
                    const shrink = Math.max(0.4, 1 - (m.z - gz) * 0.08)
                    ctx.fillStyle = 'rgba(0,0,0,0.35)'
                    ctx.beginPath(); ctx.ellipse(isoX(m.x, m.y), isoY(m.x, m.y, gz), 5 * shrink, 2.4 * shrink, 0, 0, Math.PI * 2); ctx.fill()
                }
                const mx = isoX(m.x, m.y), my = isoY(m.x, m.y, m.z) - 5
                const blink = gs.invulnT > 0 && (gs.tick >> 2) % 2 === 0
                if (!blink) {
                    const grad = ctx.createRadialGradient(mx - 2, my - 2, 1, mx, my, 6)
                    grad.addColorStop(0, '#ffd0d8')
                    grad.addColorStop(0.4, '#ff4050')
                    grad.addColorStop(1, '#900818')
                    ctx.fillStyle = grad
                    ctx.beginPath(); ctx.arc(mx, my, 5.5, 0, Math.PI * 2); ctx.fill()
                    ctx.fillStyle = 'rgba(255,255,255,0.9)'
                    ctx.beginPath(); ctx.arc(mx - 2, my - 2.4, 1.5, 0, Math.PI * 2); ctx.fill()
                }
            }

            for (const p of particles) {
                p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--
                ctx.fillStyle = p.c
                ctx.fillRect(p.x, p.y, 2, 2)
            }
            particles = particles.filter((p) => p.life > 0)
            ctx.restore()

            // ---- HUD ----
            ctx.fillStyle = 'rgba(8,8,24,0.85)'
            ctx.fillRect(0, 0, W, 20)
            ctx.font = 'bold 11px monospace'
            ctx.textAlign = 'left'
            ctx.fillStyle = '#8fd8c8'
            ctx.fillText(`RACE ${gs.raceIdx + 1}/6 ${gs.race.name}`, 6, 14)
            const secs = Math.max(0, Math.ceil(gs.timeT / 60))
            ctx.textAlign = 'center'
            ctx.fillStyle = secs <= 10 ? (secs & 1 ? '#ff4050' : '#ffd75e') : '#ffffff'
            ctx.fillText(`TIME ${secs}${gs.carry ? ` (+${Math.round(gs.carry / 60)} CARRY)` : ''}`, W / 2, 14)
            ctx.textAlign = 'right'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(`SCORE ${gs.score}`, W - 60, 14)
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#ff4050'
                ctx.beginPath(); ctx.arc(W - 44 + i * 11, 10, 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.7)'
                ctx.beginPath(); ctx.arc(W - 45 + i * 11, 9, 1.2, 0, Math.PI * 2); ctx.fill()
            }

            if (banner && banner.t > 0) {
                banner.t--
                ctx.textAlign = 'center'
                ctx.font = 'bold 22px monospace'
                ctx.fillStyle = 'rgba(0,0,0,0.55)'
                ctx.fillRect(0, H / 2 - 34, W, 40)
                ctx.fillStyle = '#ffd75e'
                ctx.fillText(banner.text, W / 2, H / 2 - 6)
            }

            if (mode === 'attract') {
                ctx.fillStyle = 'rgba(5,5,20,0.55)'
                ctx.fillRect(0, 60, W, 118)
                ctx.textAlign = 'center'
                ctx.font = 'bold 34px monospace'
                ctx.fillStyle = '#ff4050'
                ctx.fillText('MARBLE', W / 2 + 2, 104)
                ctx.fillStyle = '#ffd75e'
                ctx.fillText('MADNESS', W / 2 + 2, 138)
                ctx.fillStyle = '#8fd8c8'
                ctx.font = 'bold 34px monospace'
                ctx.fillText('MARBLE', W / 2, 102)
                ctx.fillStyle = '#fff'
                ctx.fillText('MADNESS', W / 2, 136)
                if ((gs.tick >> 5) % 2 === 0) {
                    ctx.font = 'bold 13px monospace'
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText('PRESS ANY KEY TO START', W / 2, 166)
                }
                ctx.font = '10px monospace'
                ctx.fillStyle = '#a8c8e8'
                ctx.fillText('ATTRACT MODE — DEMO PILOT RUNS THE SIX RACES', W / 2, 186)
            }

            if (gs.end === 'over') {
                ctx.fillStyle = 'rgba(5,5,20,0.7)'
                ctx.fillRect(0, H / 2 - 44, W, 88)
                ctx.textAlign = 'center'
                ctx.font = 'bold 26px monospace'
                ctx.fillStyle = '#ff4050'
                ctx.fillText('GAME OVER', W / 2, H / 2 - 10)
                ctx.font = 'bold 12px monospace'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(`FINAL SCORE ${gs.score}`, W / 2, H / 2 + 12)
                if ((gs.tick >> 5) % 2 === 0) ctx.fillText('PRESS ANY KEY TO TRY AGAIN', W / 2, H / 2 + 32)
            }
        }

        // ---- loop ------------------------------------------------------------
        let raf = 0
        let last = 0
        let acc = 0
        const FIXED_DT = 1000 / 60
        const loop = (ts) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = ts
            const frame = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current || !gs) return
            acc += frame
            while (acc >= FIXED_DT) {
                acc -= FIXED_DT
                const gi = mode === 'play' ? inp() : (script && scriptT < script.length ? script[scriptT++] : { left: false, right: false, up: false, down: false })
                if (mode === 'play') step(gs, gi)
                else if (mode === 'attract') {
                    step(gs, gi)
                    demoTicks++
                    if (gs.end || scriptT >= script.length || demoTicks > 9 * 60 * 60) startAttract()
                } else {
                    step(gs, { left: false, right: false, up: false, down: false })
                    if (gs.end) startAttract()
                }
                consumeEvents()
            }
            draw()
        }

        // ---- input -----------------------------------------------------------
        const onKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (pausedRef.current) return
            if (mode === 'attract' || gs.end) {
                startRun()
                audioController.unlock?.()
                return
            }
            if (e.code === 'ArrowLeft') keys.ArrowLeft = true
            if (e.code === 'ArrowRight') keys.ArrowRight = true
            if (e.code === 'ArrowUp') keys.ArrowUp = true
            if (e.code === 'ArrowDown') keys.ArrowDown = true
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft') keys.ArrowLeft = false
            if (e.code === 'ArrowRight') keys.ArrowRight = false
            if (e.code === 'ArrowUp') keys.ArrowUp = false
            if (e.code === 'ArrowDown') keys.ArrowDown = false
        }

        // drag-anywhere trackball: screen delta -> world vector -> arrow keys
        const drag = { id: null, x: 0, y: 0 }
        const applyDrag = (dx, dy) => {
            const wx = dx / 12 + dy / 6
            const wy = dy / 6 - dx / 12
            const k = press(wx, wy)
            keys.ArrowLeft = k.left; keys.ArrowRight = k.right
            keys.ArrowUp = k.up; keys.ArrowDown = k.down
        }
        const onPointerDown = (e) => {
            if (pausedRef.current) return
            if (mode === 'attract' || gs.end) { startRun(); return }
            drag.id = e.pointerId
            drag.x = e.clientX; drag.y = e.clientY
        }
        const onPointerMove = (e) => {
            if (drag.id !== e.pointerId) return
            applyDrag(e.clientX - drag.x, e.clientY - drag.y)
        }
        const onPointerUp = (e) => {
            if (drag.id !== e.pointerId) return
            drag.id = null
            keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = false
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)

        unmountDbg = mountDbg({
            title: 'MARBLE MADNESS',
            getState: () => [
                `race ${gs.raceIdx + 1}/6 ${gs.race.name}  phase ${gs.phase} end ${gs.end || '-'}`,
                `pos ${gs.m.x.toFixed(2)},${gs.m.y.toFixed(2)} z ${gs.m.z.toFixed(2)} v ${Math.hypot(gs.m.vx, gs.m.vy).toFixed(3)} air ${gs.m.air}`,
                `time ${Math.ceil(gs.timeT / 60)}s  score ${gs.score}  lives ${gs.lives}  clears ${gs.clears}`,
                `brake ${!!gs._brake}  path ${gs._path ? gs._path.length : 'none'}`,
            ],
            actions: [
                { label: 'skip race', run: () => { gs.m.x = gs.race.goal.c + 0.5; gs.m.y = gs.race.goal.r + 0.5; gs.m.vx = gs.m.vy = 0 } },
                { label: 'hop', run: () => { gs.m.air = true; gs.m.zFrom = gs.m.z; gs.m.vz = 0.25 } },
                { label: '+60s', run: () => { gs.timeT += 60 * 60 } },
                { label: 'PROGNOSIS', run: () => (bfsPath(gs, Math.floor(gs.m.y), Math.floor(gs.m.x), gs.race.goal.r, gs.race.goal.c, false, 1).length || bfsPath(gs, Math.floor(gs.m.y), Math.floor(gs.m.x), gs.race.goal.r, gs.race.goal.c, false, 2).length) ? 'WINNABLE' : 'DEAD END' },
            ],
        })
        window.__marble = { CFG, getGs: () => gs, mode: () => mode }

        startAttract()
        raf = requestAnimationFrame(loop)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            cancelAnimationFrame(raf)
            if (unmountDbg) unmountDbg()
            delete window.__marble
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div className="relative w-full max-w-[720px] aspect-[4/3] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MARBLE MADNESS')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default MarbleMadnessGame

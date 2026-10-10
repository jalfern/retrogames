// ICE CLIMBER CO-OP — the arcade shell. Everything is drawn at runtime from
// the pure sim in ./sim.js: the massif is painted cell by cell, the shafts
// you punch are holes in that paint, the condor flaps on a fixed clock, and
// the climbers are two parkas with fists. The renderer's only spatial
// contract is `screen = cell * 16` — no camera — which is exactly the
// transform scripts/iceplay.mjs samples to prove the drawn climber sits
// where the physics says the body is, after every real keystroke.
//
// THE SECOND INPUT PATH is the point of this title: P1 is Arrows+Space (the
// classic pad), P2 is W/A/D+F, and both key sets feed the SAME tick. On a
// phone the existing pad drives P1 and VirtualControls' optional `secondPad`
// drives P2, so the co-op survives a touchscreen.
//
// Layout: 1. proven script (attract demo = the co-op autopilot's own run)
// 2. palette + painter 3. fixed-timestep loop (250ms catch-up cap — the heist
// lesson) 4. input (TWO paths) 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, CELL, ICE, ROCK, PLAT, EMPTY, CFG, makeGame, step, stateHash, cloneGame } from './sim.js'
import { buildLevel } from './levels.js'
import { plan, nextMountain } from './planner.js'

const VIEW_W = W * CELL
const VIEW_H = H * CELL
const SIM_MS = 1000 / 60

const P1_KEYS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', Space: 'j' }
const P2_KEYS = { KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyF: 'j' }

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(makeGame(buildLevel(0)))
    return proven
}

// jEdge latches a jump press for one tick: a CDP tap fires keydown+keyup in
// the same inter-frame gap, and an unheld edge would be eaten between two
// sim steps (the metroidplay cadence lesson — the engine must admit the key).
const pad = () => ({ l: false, r: false, u: false, j: false, jEdge: false })

const IceGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('ice.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.iceStage = '1'
        canvas.width = VIEW_W; canvas.height = VIEW_H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(buildLevel(0))
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0
        const k1 = pad(), k2 = pad()
        const evLog = []
        const parts = []
        let starSeed = []
        for (let i = 0; i < 40; i++) starSeed.push([Math.random() * VIEW_W, Math.random() * VIEW_H * 0.55, Math.random() * 6])

        const say = (m) => { toastMsg = m; toast = 100 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.2
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 200) evLog.splice(0, evLog.length - 200)
            for (const e of evts) {
                if (e.type === 'dig') { audioController.playNoise(0.05, 0.045); burst((e.x + 0.5) * CELL, (e.y + 0.6) * CELL, 4, '#cfeaff') }
                else if (e.type === 'grab') audioController.playTone(300, 0.05, 'square', 0.04)
                else if (e.type === 'jump') audioController.playSweep(320, 560, 0.12, 'square', 0.05)
                else if (e.type === 'land') audioController.playNoise(0.05, 0.04)
                else if (e.type === 'down') { audioController.playSweep(500, 90, 0.4, 'sawtooth', 0.09); audioController.playDeath(); shake = 9; say(e.cause === 'condor' ? 'CLIMBER DOWN!' : 'LOST!') }
                else if (e.type === 'revive') { audioController.playTone(660, 0.1, 'sine', 0.06); audioController.playTone(990, 0.16, 'sine', 0.05); say('REVIVED — STAY TOGETHER') }
                else if (e.type === 'carrot') { audioController.playSweep(620, 1560, 0.45, 'square', 0.09); say('CARROT!') }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('ice.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const advance = () => {
            gs.score += 500
            nextMountain(gs)
            if (gs.end === 'win') { finish(true); return true }
            if (gs.end === 'dead') { finish(false); return true }
            return false
        }

        const doSim = (inputs) => {
            step(gs, inputs)
            handleEvents(gs.events)
            if (gs.end === 'clear') { if (advance()) return }
            if (gs.end === 'dead') { finish(false) }
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) {
                if (demoAt >= run.script.length + 140) { gs = makeGame(buildLevel(0)); demoAt = 0 }
                demoAt++
                return
            }
            const at = new Set(run.advanceAt)
            if (at.has(demoAt)) advance()
            const ins = run.script[demoAt++]
            step(gs, ins)
            handleEvents(gs.events)
            if (gs.end === 'dead') { gs = makeGame(buildLevel(0)); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ a: { l: k1.l, r: k1.r, u: k1.u, j: k1.jEdge ? 1 : 0 }, b: { l: k2.l, r: k2.r, u: k2.u, j: k2.jEdge ? 1 : 0 } })
            k1.jEdge = false; k2.jEdge = false
        }

        // ------------------------------------------------------------- painter ----
        const paint = () => {
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            if (shake > 0) shake *= 0.86; if (shake < 0.4) shake = 0
            const g = ctx.createLinearGradient(0, 0, 0, VIEW_H)
            g.addColorStop(0, '#0a1030'); g.addColorStop(0.55, '#1d2e63'); g.addColorStop(1, '#2a3f7d')
            ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            for (const [x, y, ph] of starSeed) {
                ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(gs.tick / 40 + ph))
                ctx.fillStyle = '#dfeaff'; ctx.fillRect(x, y, 1.6, 1.6)
            }
            ctx.globalAlpha = 1
            ctx.save(); ctx.translate(sx, sy)
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === EMPTY) continue
                    const px = x * CELL, py = y * CELL
                    if (t === ICE) {
                        ctx.fillStyle = ((x * 7 + y * 13) % 5) === 0 ? '#8fb8e8' : '#a8ccf0'
                        ctx.fillRect(px, py, CELL, CELL)
                        ctx.fillStyle = 'rgba(255,255,255,0.25)'
                        ctx.fillRect(px + 2, py + 2, 3, 3); ctx.fillRect(px + CELL - 6, py + CELL - 7, 3, 3)
                        if (y > 0 && gs.grid[(y - 1) * W + x] === EMPTY) { ctx.fillStyle = '#eaf6ff'; ctx.fillRect(px, py, CELL, 3) }
                    } else if (t === ROCK) {
                        ctx.fillStyle = '#3a3550'; ctx.fillRect(px, py, CELL, CELL)
                        if (y + 1 >= H || gs.grid[(y + 1) * W + x] !== ROCK) { /* bottom edge */ }
                        if (y > 0 && gs.grid[(y - 1) * W + x] !== ROCK) { ctx.fillStyle = '#cfe0ff'; ctx.fillRect(px, py, CELL, 3) }
                        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 4, py + 6, 4, 3); ctx.fillRect(px + 10, py + 11, 3, 3)
                    } else if (t === PLAT) {
                        ctx.fillStyle = '#e8f2ff'; ctx.fillRect(px, py, CELL, 6)
                        ctx.fillStyle = '#7f9fd0'; ctx.fillRect(px, py + 6, CELL, 3)
                    }
                }
            }
            // the carrot
            if (gs.carrot && !gs.carrotTaken) {
                const [cx, cy] = gs.carrot
                const px = cx * CELL + 8, py = cy * CELL + 8 + Math.sin(gs.tick / 18) * 1.5
                ctx.fillStyle = '#ff8c1a'
                ctx.beginPath(); ctx.moveTo(px - 4, py - 5); ctx.lineTo(px + 4, py - 5); ctx.lineTo(px, py + 8); ctx.closePath(); ctx.fill()
                ctx.strokeStyle = '#54d15a'; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px - 3, py - 11); ctx.moveTo(px, py - 5); ctx.lineTo(px + 3, py - 11); ctx.stroke()
            }
            // condors
            for (const b of gs.birds) {
                const px = b.x * CELL, py = b.y * CELL
                const flap = Math.floor(gs.tick / 8) % 2
                ctx.fillStyle = '#2a2330'
                ctx.beginPath(); ctx.ellipse(px, py, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = '#2a2330'; ctx.lineWidth = 3
                ctx.beginPath()
                ctx.moveTo(px - 6, py); ctx.lineTo(px - 13, py + (flap ? -6 : 4))
                ctx.moveTo(px + 6, py); ctx.lineTo(px + 13, py + (flap ? -6 : 4))
                ctx.stroke()
                ctx.fillStyle = '#ffcf3f'; ctx.fillRect(px + (b.dir > 0 ? 6 : -9), py - 2, 3, 2)
            }
            // climbers
            const COL = ['#ff4a4a', '#4ab0ff']
            for (const c of gs.climbers) {
                const px = c.x * CELL, py = c.y * CELL
                const blink = c.invuln > 0 && gs.tick % 8 < 3
                if (blink) continue
                ctx.save(); ctx.translate(px, py)
                if (c.down) {
                    ctx.rotate(Math.PI / 2)
                    ctx.fillStyle = COL[c.id]; ctx.fillRect(-6, -12, 12, 12)
                    ctx.fillStyle = '#f4c79a'; ctx.fillRect(-4, -16, 8, 5)
                    ctx.restore()
                    continue
                }
                ctx.fillStyle = COL[c.id]; ctx.fillRect(-6, -14, 12, 14)
                ctx.fillStyle = '#f4c79a'; ctx.fillRect(-4, -20, 8, 7)
                ctx.fillStyle = '#ffffff'; ctx.fillRect(c.id ? 0 : -4, -18, 4, 2)
                ctx.fillStyle = COL[c.id === 0 ? 1 : 0]
                ctx.fillRect(-7, -4, 3, 4); ctx.fillRect(4, -4, 3, 4)      // mittens
                if (c.climbing && c.punchT > 0 && (c.punchT % 4) > 1) {     // the fist
                    ctx.fillStyle = '#ffe9c9'
                    ctx.fillRect(-2 + (Math.random() > 0.5 ? 3 : -3), -26, 4, 5)
                    burst(px, py - 28, 1, '#eaf6ff')
                }
                ctx.restore()
            }
            ctx.restore()
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.16
                if (pa.t > 24) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 24; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            ctx.globalAlpha = 1
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const h = hudRef.current
            if (h.level) h.level.textContent = ['FIRST FROST', 'CONDOR PASS', 'THE STACK'][gs.level] || '—'
            if (h.lives) h.lives.textContent = String(gs.lives).repeat(1)
            if (h.score) h.score.textContent = String(gs.score).padStart(5, '0')
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)   // world-second catch-up cap (heist lesson)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame(buildLevel(0))
            evLog.length = 0; parts.length = 0
            for (const k of [k1, k2]) { k.l = k.r = k.u = k.j = false; k.jEdge = false }
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            if (P1_KEYS[e.code]) { k1[P1_KEYS[e.code]] = true; if (P1_KEYS[e.code] === 'j') k1.jEdge = true }
            if (P2_KEYS[e.code]) { k2[P2_KEYS[e.code]] = true; if (P2_KEYS[e.code] === 'j') k2.jEdge = true }
        }
        const onUp = (e) => {
            if (P1_KEYS[e.code]) k1[P1_KEYS[e.code]] = false
            if (P2_KEYS[e.code]) k2[P2_KEYS[e.code]] = false
        }
        const onBlur = () => { for (const k of [k1, k2]) { k.l = k.r = k.u = k.j = false } }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') startPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / VIEW_W, r.height / VIEW_H)
            canvas.style.width = `${VIEW_W * sc}px`
            canvas.style.height = `${VIEW_H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__iceTest = {
                probe: () => {
                    const bore = []
                    for (let y = 6; y <= 29; y++) if (gs.grid[y * W + 8] === EMPTY) bore.push(y)
                    return {
                        screen: screenRef.current, tick: gs.tick, level: gs.level, lives: gs.lives, score: gs.score,
                        end: gs.end, carrotTaken: gs.carrotTaken, carrot: gs.carrot ? [...gs.carrot] : null,
                        climbers: gs.climbers.map(c => ({
                            x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100,
                            climbing: c.climbing, grounded: c.grounded, onPartner: c.onPartner,
                            down: c.down, digs: c.digs, jumps: c.jumps, invuln: c.invuln,
                            at: { x: Math.round(c.x * CELL), y: Math.round((c.y - 1) * CELL) },
                        })),
                        birds: gs.birds.map(b => ({ x: Math.round(b.x * 100) / 100, dir: b.dir })),
                        boreRows: bore, evLog: evLog.slice(-90),
                    }
                },
                start: startPlay,
                board: () => board(),
                hash: () => stateHash(gs),
                // SETUP rig for the browser harness ONLY: jump to a mountain and
                // place bodies. Physics, condors, the bore and the stack all
                // still run through the real step() loop.
                setup: (level, a, b) => {
                    if (screenRef.current !== 'play') return false
                    gs = makeGame(buildLevel(level))
                    gs.end = null
                    if (a) Object.assign(gs.climbers[0], a, { vy: 0, grounded: false, climbing: false })
                    if (b) Object.assign(gs.climbers[1], b, { vy: 0, grounded: false, climbing: false })
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'ICE CLIMBER CO-OP',
                getState: () => {
                    const [a, b] = gs.climbers
                    return [
                        `${['FIRST FROST', 'CONDOR PASS', 'THE STACK'][gs.level] || 'win'}  lives ${gs.lives}  score ${gs.score}  tick ${gs.tick}`,
                        `P1 ${a.x.toFixed(1)},${a.y.toFixed(1)} ${a.climbing ? 'CLIMB' : a.grounded ? 'ground' : 'air'}${a.onPartner ? ' (on P2)' : ''}${a.down ? ' DOWN' : ''}  digs ${a.digs}`,
                        `P2 ${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.climbing ? 'CLIMB' : b.grounded ? 'ground' : 'air'}${b.onPartner ? ' (on P1)' : ''}${b.down ? ' DOWN' : ''}  digs ${b.digs}`,
                        `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                    ]
                },
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const p = plan(cloneGame(gs))
                            return p.ok
                                ? `WINNABLE: the autopilot finishes the range from HERE in ${p.script.length} more ticks (${p.receipts.digs} more tiles to punch)`
                                : `NOT WINNABLE from here: ${p.reason || p.end}`
                        },
                    },
                    { label: '+1 LIFE', run: () => { gs.lives++; return `lives ${gs.lives}` } },
                    {
                        label: 'DOWN P2', run: () => {
                            const b = gs.climbers[1]
                            if (b.down) return 'already down — go touch them as P1'
                            gs.lives--
                            b.down = true; b.climbing = false; b.grounded = false; b.vy = 0
                            gs.events.push({ type: 'down', who: 1, cause: 'debug' })
                            if (gs.lives <= 0) { gs.end = 'dead' }
                            return `P2 down, lives ${gs.lives} — walk P1 onto the body`
                        },
                    },
                    {
                        label: 'TELEPORT P1 → P2', run: () => {
                            const [a, b] = gs.climbers
                            a.x = b.x + 0.2; a.y = b.y
                            return 'P1 placed beside P2'
                        },
                    },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__iceTest) delete window.__iceTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
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

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('level')} className="border border-sky-300/60 text-sky-200 px-2 py-0.5 rounded bg-black/40" />
                    <span className="text-red-300 text-sm font-bold">♥ <span ref={setHud('lives')}>3</span></span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>00000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-sky-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #08f' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-4xl font-black text-sky-200" style={{ textShadow: '0 4px 0 #123, 0 10px 24px #000' }}>ICE CLIMBER CO-OP</h1>
                    <p className="text-sky-50/90 font-mono mt-1 text-sm">two climbers. one rope of trust. punch upward.</p>
                    <p className="text-white font-mono font-bold mt-4 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-sky-100/80 font-mono text-[11px] mt-3 px-8 leading-4">
                        P1 (red): ARROWS to move, UP to punch the ice, SPACE to jump<br />
                        P2 (blue): A / D to move, W to punch, F to jump<br />
                        every tile you punch is gone forever — the shaft is yours<br />
                        the condor owns the shelf: wait in the pocket, dash for the carrot<br />
                        the last carrot hangs one head taller than any jump — stand on your partner<br />
                        a downed climber is revived by touch — alone, the summit is impossible<br />
                        this demo is the autopilot&apos;s own proven co-op route, tick for tick
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-sky-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-amber-300' : 'text-sky-400'}`}>{end.win ? 'SUMMITS CLEARED!' : 'FROZEN OUT'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — both climbers, every carrot' : ''}</p>
                    <div className="bg-black/50 border border-sky-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-sky-300 font-bold mb-1 tracking-widest">SUMMIT LOG</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ICE CLIMBER CO-OP')} onResume={handleResume} />}
            <VirtualControls
                visible={play && !paused}
                secondPad={{ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'KeyF' }}
            />
        </div>
    )
}

export default IceGame

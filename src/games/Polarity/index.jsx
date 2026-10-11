// POLARITY — the arcade shell. Everything is drawn at runtime from the pure
// sim in ./sim.js: the fleet sways because the sim says so, walls and storms
// are the scripted hazards the fairness scan audits, the shell over the core
// is the color the sim says it is this tick, and the attract demo is the
// autopilot's OWN proven run replayed tick for tick through the real step().
// The renderer's only spatial contract is `pixel = sim unit` at 1:1 on a
// 224x288 canvas — which is exactly the transform scripts/polarplay.mjs
// samples to prove the drawn fighter sits where the physics says it is.
//
// Layout: 1. proven script 2. palette + painters 3. fixed-timestep loop
// (250 ms catch-up cap — the heist lesson) 4. input 5. DEV hook + DebugKit
// 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, CFG, L, makeGame, step, stateHash } from './sim.js'
import { plan } from './planner.js'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(makeGame(0))
    return proven
}

const PolarityGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('polarity.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.polarStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0
        const keys = { l: false, r: false, u: false, d: false, f: false, sEdge: false }
        const evLog = []
        const parts = []
        const tele = []
        const stars = []
        for (let i = 0; i < 50; i++) stars.push([Math.random() * W, Math.random() * H, 0.2 + Math.random() * 0.9])

        const say = (m) => { toastMsg = m; toast = 110 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 220) evLog.splice(0, evLog.length - 220)
            for (const e of evts) {
                if (e.type === 'kill') { audioController.playNoise(0.06, 0.05); burst(e.x, e.y, 8, e.color === 'L' ? '#bfe9ff' : '#e07aff'); shake = 3 }
                else if (e.type === 'fire') audioController.playTone(e.color === 'L' ? 920 : 640, 0.04, 'square', 0.03)
                else if (e.type === 'efire') audioController.playTone(e.color === 'L' ? 300 : 220, 0.03, 'triangle', 0.02)
                else if (e.type === 'absorb') { audioController.playSweep(240, 560, 0.09, 'sine', 0.04); burst(e.x, e.y, 3, '#9fe8ff') }
                else if (e.type === 'blocked') { audioController.playTone(160, 0.05, 'square', 0.05); burst(e.x, e.y, 4, '#8899bb') }
                else if (e.type === 'chit') { audioController.playSweep(500, 900, 0.08, 'square', 0.06); burst(e.x, e.y, 6, e.color === 'L' ? '#dff4ff' : '#f0a6ff'); shake = 2 }
                else if (e.type === 'flip') audioController.playTone(e.pol === 'L' ? 700 : 420, 0.05, 'sine', 0.05)
                else if (e.type === 'nova') { say('FLUX NOVA!'); audioController.playSweep(180, 1300, 0.5, 'sawtooth', 0.1); shake = 9 }
                else if (e.type === 'warn') { tele.push({ ...e, t: CFG.warnT }); audioController.playTone(e.hazard === 'storm' ? 150 : 120, 0.12, 'sawtooth', 0.04) }
                else if (e.type === 'wall') { say(`${e.color === 'L' ? 'LIGHT' : 'DARK'} WALL — GAP ${e.gap > 112 ? 'RIGHT' : 'LEFT'}`); audioController.playNoise(0.1, 0.07) }
                else if (e.type === 'storm') { say('FLUX STORM'); audioController.playNoise(0.16, 0.06) }
                else if (e.type === 'shell') { const c = gs.core; say(`SHELL ${e.color === 'L' ? 'LIGHT' : 'DARK'} — fire ${e.color === 'L' ? 'DARK' : 'LIGHT'} (${c ? c.quota.L + '/' + c.quota.D : ''})`) }
                else if (e.type === 'ring') audioController.playSweep(400, 200, 0.2, 'square', 0.05)
                else if (e.type === 'dive') audioController.playSweep(660, 220, 0.3, 'sawtooth', 0.04)
                else if (e.type === 'death') { audioController.playDeath(); shake = 8 }
                else if (e.type === 'timeout') { say('CLOCK DEAD — PAY THE FIGHTER, RUN IT AGAIN'); audioController.playSweep(300, 80, 0.5, 'square', 0.08) }
                else if (e.type === 'stage') say(`STAGE ${gs.wave + 1}`)
                else if (e.type === 'go') audioController.playTone(520, 0.12, 'square', 0.05)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('polarity.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            if (gs.end) { gs = makeGame(0); demoAt = 0; return }
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ l: keys.l, r: keys.r, u: keys.u, d: keys.d, f: keys.f, s: keys.sEdge })
            keys.sEdge = false
        }

        // ---------------------------------------------------------------- paint ----
        const drawDart = (x, y, c, f) => {
            ctx.fillStyle = c === 'L' ? '#cfeaff' : '#d878ff'
            ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x, y - 2); ctx.lineTo(x - 6, y - 6); ctx.closePath(); ctx.fill()
            if (f % 14 < 7) { ctx.fillStyle = c === 'L' ? '#ffffff' : '#ffd9ff'; ctx.fillRect(x - 1, y - 4, 2, 3) }
        }
        const drawWeaver = (x, y, c, f) => {
            ctx.fillStyle = c === 'L' ? '#9fdcff' : '#b95dff'
            ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill()
            ctx.fillStyle = c === 'L' ? '#173a5e' : '#31104f'
            ctx.fillRect(x - 3, y - 3, 6, 6)
            ctx.fillStyle = f % 20 < 10 ? '#ffdf6e' : '#ff8a5c'
            ctx.fillRect(x - 1, y + 7, 2, 3)
        }
        const drawCore = (e, f) => {
            const { x, y } = e
            ctx.fillStyle = '#3a4166'
            ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#59639c'
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = e.shell === 'L' ? '#cfeaff' : '#c95dff'
            const ph = (gs.pt % CFG.shellPeriod) / CFG.shellPeriod
            ctx.beginPath(); ctx.arc(x, y, 12, -Math.PI / 2 + ph * Math.PI * 4, -Math.PI / 2 + ph * Math.PI * 4 + Math.PI); ctx.lineWidth = 4
            ctx.strokeStyle = ctx.fillStyle; ctx.stroke()
            ctx.fillStyle = e.shell === 'L' ? '#eaf7ff' : '#f2b8ff'
            ctx.fillRect(x - 3, y - 3, 6, 6)
            for (const [dx, q] of [[-7, e.quota.L], [7, e.quota.D]]) {
                ctx.fillStyle = dx < 0 ? '#bfe9ff' : '#e07aff'
                for (let i = 0; i < q; i++) ctx.fillRect(x + dx - 1, y + 18 - i * 3, 3, 2)
            }
            void f
        }
        const drawPlayer = (x, y, pol, f) => {
            ctx.fillStyle = pol === 'L' ? '#f2faff' : '#2a123f'
            ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x, y + 3); ctx.lineTo(x - 7, y + 6); ctx.closePath(); ctx.fill()
            ctx.fillStyle = pol === 'L' ? '#54c8ff' : '#e466ff'
            ctx.fillRect(x - 1, y - 6, 2, 8)
            ctx.fillStyle = pol === 'L' ? '#cfeaff' : '#8d3fd4'
            ctx.fillRect(x - 8, y + 1, 3, 5); ctx.fillRect(x + 5, y + 1, 3, 5)
            if (gs.charge >= CFG.chargeMax && f % 20 < 10) {
                ctx.fillStyle = 'rgba(160,240,255,0.75)'
                ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill()
            }
        }

        const paint = () => {
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            if (shake > 0) shake *= 0.85; if (shake < 0.4) shake = 0
            ctx.fillStyle = '#05060f'
            ctx.fillRect(0, 0, W, H)
            const tk = gs.tick
            for (const [x, y0, sp] of stars) {
                const y = (y0 + tk * sp * 0.35) % H
                ctx.fillStyle = sp > 0.75 ? '#7d8bbf' : '#333c63'
                ctx.fillRect(x, y, 1.4, 1.4)
            }
            ctx.save(); ctx.translate(sx, sy)
            // telegraphs: the promise the script made warnT ticks ago
            for (const t of tele) {
                if (t.t <= 0) continue
                const a = 0.16 + 0.14 * Math.sin(tk / 4)
                ctx.fillStyle = t.hazard === 'storm'
                    ? `rgba(255,255,255,${a})`
                    : t.color === 'L' ? `rgba(160,220,255,${a})` : `rgba(230,120,255,${a})`
                if (t.hazard === 'storm') ctx.fillRect(t.x - CFG.stormW / 2, 196, CFG.stormW, H - 196)
                else ctx.fillRect(0, CFG.pTop - 6, W, 2), ctx.fillRect(t.gap - 17, CFG.pTop - 8, 34, 4)
            }
            // storms
            for (const s of gs.storms) {
                const a = (s.until - gs.pt) / CFG.stormT
                for (let y = 0; y < H; y += 12) {
                    const j = Math.sin((y + tk * 3 + s.x) * 0.7) * 4
                    ctx.fillStyle = `rgba(235,245,255,${0.25 + 0.5 * a * Math.random()})`
                    ctx.fillRect(s.x + j - 1, y, 2, 9)
                }
                ctx.fillStyle = `rgba(140,200,255,${0.08 + 0.06 * a})`
                ctx.fillRect(s.x - CFG.stormW / 2, 0, CFG.stormW, H)
            }
            for (const e of gs.enemies) {
                if (e.state === 'dead' || e.state === 'wait') continue
                if (e.kind === 'core') { drawCore(e, tk); continue }
                if (e.kind === 'weaver') drawWeaver(e.x, e.y, e.color, tk)
                else drawDart(e.x, e.y, e.color, tk)
            }
            for (const b of gs.shots) {
                ctx.fillStyle = b.color === 'L' ? '#dff4ff' : '#f08aff'
                ctx.fillRect(b.x - 1, b.y - 5, 2, 7)
            }
            for (const b of gs.enemyShots) {
                ctx.fillStyle = b.color === 'L' ? '#aee0ff' : '#ff83e8'
                ctx.fillRect(b.x - 2, b.y - 2, 4, 4)
            }
            const p = gs.player
            if (p.state === 'alive' && !(p.invuln > 0 && tk % 8 < 3)) drawPlayer(p.x, p.y, p.pol, tk)
            ctx.restore()
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy
                if (pa.t > 22) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 22; ctx.fillStyle = pa.col
                ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            ctx.globalAlpha = 1
            for (let i = tele.length - 1; i >= 0; i--) { tele[i].t--; if (tele[i].t <= 0) tele.splice(i, 1) }
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const h = hudRef.current
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.hiscore) h.hiscore.textContent = String(Math.max(gs.score, ...board().map((b) => b.score), 0)).padStart(6, '0')
            if (h.wave) h.wave.textContent = String(gs.wave + 1)
            if (h.lives) h.lives.textContent = '★'.repeat(Math.max(0, gs.lives - 1))
            if (h.pol) {
                h.pol.textContent = gs.player.pol === 'L' ? 'LIGHT' : 'DARK'
                h.pol.style.color = gs.player.pol === 'L' ? '#bfe9ff' : '#e08aff'
            }
            if (h.charge) h.charge.style.width = `${Math.round((gs.charge / CFG.chargeMax) * 100)}%`
            if (h.nova) h.nova.style.opacity = gs.charge >= CFG.chargeMax ? '1' : '0'
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
            gs = makeGame(0)
            evLog.length = 0; parts.length = 0; tele.length = 0
            keys.l = keys.r = keys.u = keys.d = keys.f = keys.sEdge = false
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
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') keys.f = true
            if (e.code === 'KeyX') keys.sEdge = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.f = false }
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
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${W * sc}px`
            canvas.style.height = `${H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__polarTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, wave: gs.wave, score: gs.score,
                    lives: gs.lives, charge: gs.charge, end: gs.end, phase: gs.phase,
                    player: { x: gs.player.x, y: gs.player.y, pol: gs.player.pol, state: gs.player.state, shots: gs.shots.length },
                    enemies: gs.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait')
                        .map((e) => ({ kind: e.kind, color: e.color, state: e.state, x: Math.round(e.x), y: Math.round(e.y), quota: e.quota ? `${e.quota.L}/${e.quota.D}` : null, shell: e.shell })),
                    shots: gs.shots.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), color: b.color })),
                    eShots: gs.enemyShots.length, storms: gs.storms.map((s) => s.x),
                    timeLeft: gs.timeLeft,
                    board: board(), evLog: evLog.slice(-90),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.wave !== undefined) { gs = makeGame(opts.wave); gs.end = null }
                    if (opts.player) Object.assign(gs.player, opts.player)
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.charge !== undefined) gs.charge = opts.charge
                    if (opts.shot) gs.enemyShots.push({ x: opts.shot.x, y: opts.shot.y, vx: 0, vy: opts.shot.vy ?? 0, color: opts.shot.color })
                    if (opts.coreQuota && gs.core) Object.assign(gs.core.quota, opts.coreQuota)
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'POLARITY',
                getState: () => [
                    `${['CALM WATERS', 'STORMFRONT', 'REACTOR'][gs.wave]}  lives ${gs.lives}  score ${gs.score}  clock ${gs.timeLeft}`,
                    `player ${gs.player.x.toFixed(0)},${gs.player.y.toFixed(0)} ${gs.player.pol}  charge ${gs.charge}/${CFG.chargeMax}  shots ${gs.shots.length}`,
                    `hostiles ${gs.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait').length}  bullets ${gs.enemyShots.length}  storms ${gs.storms.length}  volley ${gs.lastVolley ? gs.lastVolley.color : '-'}`,
                    gs.core ? `core ${gs.core.quota.L}/${gs.core.quota.D} drained, shell ${gs.core.shell}` : `core down`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const w = gs.wave
                            const p = plan(makeGame(w), { maxTicks: 30000 })
                            return p.ok
                                ? `WINNABLE: the autopilot clears stage ${w + 1} from a fresh start (${p.receipts.kills} kills, ${p.receipts.walls} walls walked, ${p.receipts.storms} storms). Mid-stage knots are not re-solvable — this solver starts from wave tops.`
                                : `NOT WINNABLE from a fresh stage ${w + 1}: ${p.end || 'stalled'}`
                        },
                    },
                    { label: '+1 LIFE', run: () => { gs.lives++; return `lives ${gs.lives}` } },
                    { label: 'FULL CHARGE', run: () => { gs.charge = CFG.chargeMax; return 'charge full — flip to nova' } },
                    { label: 'FLIP POLARITY', run: () => { gs.player.pol = gs.player.pol === 'L' ? 'D' : 'L'; return `polarity ${gs.player.pol}` } },
                    { label: 'DRAIN SHELL', run: () => gs.core ? (Object.assign(gs.core.quota, { L: CFG.coreNeed - 1, D: CFG.coreNeed - 1 }), `shell one hit per color from ${gs.core.shell === 'L' ? 'DARK' : 'LIGHT'} shots`) : 'no core this stage' },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__polarTest) delete window.__polarTest; unmountDbg() }
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
                    <span ref={setHud('wave')} className="border border-sky-300/60 text-sky-200 px-2 py-0.5 rounded bg-black/40">1</span>
                    <span className="text-red-300 text-sm font-bold">★ <span ref={setHud('lives')}>★★</span></span>
                    <span ref={setHud('pol')} className="font-bold">LIGHT</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div className="absolute top-9 left-3 w-28 h-1.5 bg-white/15 rounded overflow-hidden">
                    <div ref={setHud('charge')} className="h-full bg-cyan-300 transition-all duration-150" style={{ width: '0%' }} />
                </div>
                <div ref={setHud('nova')} className="absolute top-11 left-3 text-cyan-200 font-mono text-[10px] font-bold animate-pulse transition-opacity" style={{ opacity: 0 }}>NOVA READY — FLIP</div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-cyan-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #0af' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#8fd8ff', textShadow: '3px 0 0 #c05dff, -3px 0 0 #39c2ff, 0 10px 24px #000' }}>POLARITY</h1>
                    <p className="text-fuchsia-200/90 font-mono mt-1 text-sm">two colors, one pilot</p>
                    <p className="text-white font-mono font-bold mt-3 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-cyan-100/80 font-mono text-[11px] mt-3 px-8 leading-4">
                        ARROWS to fly, SPACE to fire, <b>X</b> / B button to FLIP POLARITY<br />
                        bullets of YOUR color are absorbed and charge the flux meter<br />
                        the opposite color kills — and your shots only kill the opposite color<br />
                        a full charge + flip = FLUX NOVA: everything on screen dies but the shell<br />
                        the REACTOR core only takes shots opposite its spinning shell, one color per quota<br />
                        telegraph lines read the walls and storms before they arrive — both colors always survive<br />
                        this demo is the autopilot&apos;s own proven run, tick for tick
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'REACTOR CRACKED' : 'GAME OVER'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — both colors drained' : ''}</p>
                    <div className="bg-black/50 border border-cyan-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-cyan-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'POLARITY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'X', code: 'KeyX' }} />
        </div>
    )
}

export default PolarityGame

// MISSILE BATTLE — the arcade shell. Everything is drawn at runtime from the
// pure sim in ./sim.js: the falling warheads are the scripted saturation of
// ./waves.js, the reticle is the sim's aim, the blast that chains is the
// sim's blast, and the attract demo is the autopilot's OWN proven run
// replayed tick for tick through the real step().
//
// Layout: 1. proven script 2. painters 3. fixed-timestep loop (250 ms
// catch-up cap — the heist lesson) 4. input (arrows + Space + tap) 5. DEV
// hook + DebugKit 6. React + HUD. Pixel = sim unit at 1:1 on 256x224: the
// transform scripts/missileplay.mjs samples to prove the drawn interceptor
// sits where the physics says it is.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { W, H, CFG, makeGame, step, stateHash } from './sim.js'
import { plan, decide } from './planner.js'
import { WAVES } from './waves.js'
import { PRESS, MESSAGES } from './attract.js'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(makeGame(0)).script
    return proven
}

// deterministic skyline — Math.random is a sim crime, and the renderer
// keeps the frame identical between the demo and the real run
const SKY = Array.from({ length: 40 }, (_, i) => 186 - (Math.sin(i * 2.7) * 4 + Math.sin(i * 0.9) * 3))
const STARS = Array.from({ length: 46 }, (_, i) => [(i * 97) % W, ((i * 61) % 150) + 4, 0.25 + ((i * 13) % 10) / 12])

const MissileBattleGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('missilebattle.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.mbStage = '1'
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
        const keys = { l: false, r: false, u: false, d: false, f: false, fTap: false }
        const tap = { on: false, x: 128, y: 90 }
        const evLog = []
        const parts = []
        const trails = new Map()

        const say = (m) => { toastMsg = m; toast = 110 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.5 + ((i * 7) % 10) / 4
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 200) evLog.splice(0, evLog.length - 200)
            for (const e of evts) {
                if (e.type === 'ifire') audioController.playSweep(220, 880, 0.18, 'square', 0.04)
                else if (e.type === 'deny') audioController.playTone(90, 0.08, 'square', 0.05)
                else if (e.type === 'boom') { audioController.playNoise(0.08, 0.05); shake = Math.max(shake, 2) }
                else if (e.type === 'kill') { audioController.playTone(e.chain ? 980 : 520, 0.05, 'square', 0.04); burst(e.x, e.y, e.chain ? 10 : 6, e.chain ? '#ffe27a' : '#ffb37a'); shake = Math.max(shake, e.chain ? 3 : 2) }
                else if (e.type === 'split') audioController.playTone(340, 0.06, 'sawtooth', 0.03)
                else if (e.type === 'drop') audioController.playTone(180, 0.05, 'triangle', 0.03)
                else if (e.type === 'launch') audioController.playTone(e.kind === 'bomber' ? 140 : 240, 0.04, 'triangle', 0.02)
                else if (e.type === 'cityHit') { say('CITY LOST'); audioController.playSweep(220, 40, 0.5, 'sawtooth', 0.09); burst(e.x, CFG.groundY - 4, 16, '#ff5d5d'); shake = 7 }
                else if (e.type === 'baseHit') { say('BATTERY KNOCKED OUT'); audioController.playSweep(180, 50, 0.4, 'square', 0.08); shake = 6 }
                else if (e.type === 'clear') { say(`WAVE CLEAR +${e.ammo * 5 + e.cities * 10}`); audioController.playSweep(400, 1200, 0.4, 'square', 0.06) }
                else if (e.type === 'banner') say(`${WAVES[e.wave].name} — WAVE ${e.wave + 1}`)
                else if (e.type === 'win') audioController.playSweep(400, 1600, 0.8, 'square', 0.08)
                else if (e.type === 'lose') audioController.playSweep(300, 60, 1.1, 'sawtooth', 0.1)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('missilebattle.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
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
            if (gs.end || demoAt >= run.length) { gs = makeGame(0); demoAt = 0 }
            doSim(run[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            const inp = { l: keys.l, r: keys.r, u: keys.u, d: keys.d, fire: keys.f || keys.fTap }
            if (tap.on) { inp.aimTo = [tap.x, tap.y]; inp.fire = true; tap.on = false }
            doSim(inp)
            keys.fTap = false
        }

        // ---------------------------------------------------------------- paint ----
        const drawCity = (x, alive) => {
            if (alive) {
                ctx.fillStyle = '#39d2ff'
                ctx.fillRect(x - 8, CFG.groundY - 6, 16, 6)
                ctx.fillStyle = '#8fe8ff'
                ctx.beginPath(); ctx.arc(x, CFG.groundY - 6, 7, Math.PI, 0); ctx.fill()
                ctx.fillStyle = '#0a2233'
                ctx.fillRect(x - 5, CFG.groundY - 5, 2, 2); ctx.fillRect(x + 3, CFG.groundY - 5, 2, 2)
            } else {
                ctx.fillStyle = '#4d2b30'
                ctx.fillRect(x - 8, CFG.groundY - 3, 16, 3)
                ctx.fillStyle = '#6b3a3a'
                ctx.fillRect(x - 5, CFG.groundY - 5, 3, 2); ctx.fillRect(x + 2, CFG.groundY - 4, 4, 1)
            }
        }
        const drawBattery = (b, i) => {
            ctx.fillStyle = b.alive ? '#9d7bff' : '#4a3355'
            ctx.beginPath(); ctx.moveTo(b.x - 10, CFG.groundY); ctx.lineTo(b.x, CFG.groundY - 12); ctx.lineTo(b.x + 10, CFG.groundY); ctx.closePath(); ctx.fill()
            if (b.alive) {
                ctx.fillStyle = '#e8dcff'
                for (let k = 0; k < b.ammo; k++) ctx.fillRect(b.x - 9 + (k % 5) * 4, CFG.groundY - 3 - Math.floor(k / 5) * 3, 3, 2)
            }
            void i
        }
        const trailFor = (id, x, y, col) => {
            let tr = trails.get(id)
            if (!tr) { tr = { pts: [], col }; trails.set(id, tr) }
            tr.pts.push([x, y])
            if (tr.pts.length > 26) tr.pts.shift()
            return tr
        }

        const paint = () => {
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.86; if (shake < 0.4) shake = 0 }
            ctx.fillStyle = '#04040c'
            ctx.fillRect(0, 0, W, H)
            const tk = gs.tick
            for (const [x, y0, sp] of STARS) {
                ctx.fillStyle = sp > 0.8 ? '#7d8bbf' : '#333c63'
                ctx.fillRect(x, (y0 + (tk * sp * 0.08) % 150) % 154, 1.3, 1.3)
            }
            ctx.save(); ctx.translate(sx, sy)

            // ground skyline + cities + batteries
            ctx.fillStyle = '#101c2e'
            ctx.beginPath(); ctx.moveTo(0, H)
            SKY.forEach((y, i) => ctx.lineTo(i * (W / 39), y))
            ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#1c2c44'
            ctx.fillRect(0, CFG.groundY, W, H - CFG.groundY)
            for (const c of gs.cities) drawCity(c.x, c.alive)
            gs.bases.forEach((b, i) => drawBattery(b, i))

            // enemy trails + heads (trails are renderer memory, not sim state)
            const liveIds = new Set()
            for (const e of gs.enemies) {
                liveIds.add(e.id)
                const col = e.kind === 'bomber' ? '#59f2ff' : e.kind === 'smart' ? '#ffd23e' : '#ff5d6c'
                const tr = trailFor(e.id, e.x, e.y, col)
                ctx.strokeStyle = col
                ctx.globalAlpha = 0.35
                ctx.beginPath()
                tr.pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
                ctx.stroke()
                ctx.globalAlpha = 1
                ctx.fillStyle = col
                if (e.kind === 'bomber') { ctx.fillRect(e.x - 6, e.y - 1, 12, 3); ctx.fillRect(e.x - 2, e.y - 3, 4, 2) }
                else if (e.kind === 'smart') { ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, Math.PI * 2); ctx.fill() }
                else ctx.fillRect(e.x - 1.5, e.y - 3, 3, 6)
            }
            for (const id of trails.keys()) if (!liveIds.has(id)) trails.delete(id)

            // interceptors + blasts
            for (const m of gs.intc) {
                ctx.strokeStyle = '#bfe9ff'
                ctx.globalAlpha = 0.5
                ctx.beginPath(); ctx.moveTo(m.x - m.vx * 5, m.y - m.vy * 5); ctx.lineTo(m.x, m.y); ctx.stroke()
                ctx.globalAlpha = 1
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            }
            for (const b of gs.blasts) {
                ctx.fillStyle = b.chain ? `rgba(255,214,90,${0.5 + 0.3 * Math.sin(tk)})` : `rgba(255,255,255,${0.55 + 0.3 * Math.sin(tk / 2)})`
                ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(0.5, b.r), 0, Math.PI * 2); ctx.fill()
            }

            // the reticle — where the next tap/Space will put a blast
            if (screenRef.current === 'play') {
                const { x, y } = gs.aim
                ctx.strokeStyle = tk % 30 < 15 ? '#8fff9f' : '#d8ffd8'
                ctx.beginPath()
                ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 7, y)
                ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 7)
                ctx.stroke()
            }
            ctx.restore()

            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy
                if (pa.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 26; ctx.fillStyle = pa.col
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
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.hiscore) h.hiscore.textContent = String(Math.max(gs.score, ...board().map((b) => b.score), 0)).padStart(6, '0')
            if (h.wave) h.wave.textContent = `${gs.wave + 1}/3 ${gs.phase === 'banner' ? 'INCOMING' : ''}`
            if (h.cities) h.cities.textContent = String(gs.cities.filter((c) => c.alive).length)
            if (h.ammo) h.ammo.textContent = gs.bases.map((b) => (b.alive ? b.ammo : '—')).join(' ')
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)   // world-second catch-up cap (heist lesson)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft
                    while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
                }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame(0)
            evLog.length = 0; parts.length = 0; trails.clear()
            keys.l = keys.r = keys.u = keys.d = keys.f = keys.fTap = false
            tap.on = false
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
            if (e.code === 'Space') { keys.f = true; if (!e.repeat) keys.fTap = true }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.f = false }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            const r = canvas.getBoundingClientRect()
            if (!r.width || !r.height) return
            tap.x = ((e.clientX - r.left) / r.width) * W
            tap.y = ((e.clientY - r.top) / r.height) * H
            tap.on = true
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
            window.__mbTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, wave: gs.wave, phase: gs.phase,
                    score: gs.score, end: gs.end, fired: gs.fired, firedBy: gs.firedBy, kills: gs.kills,
                    aim: { x: +gs.aim.x.toFixed(1), y: +gs.aim.y.toFixed(1) },
                    cities: gs.cities.map((c) => c.alive),
                    bases: gs.bases.map((b) => ({ ammo: b.ammo, alive: b.alive })),
                    enemies: gs.enemies.map((e) => ({ id: e.id, kind: e.kind, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10 })),
                    intc: gs.intc.map((m) => ({ id: m.id, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 })),
                    blasts: gs.blasts.length,
                    board: board(), evLog: evLog.slice(-90),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.wave !== undefined) { gs = makeGame(opts.wave) }
                    if (opts.quiet) gs.queue.length = 0
                    if (opts.ammo) opts.ammo.forEach((a, i) => { if (gs.bases[i]) gs.bases[i].ammo = a })
                    if (opts.spawn) {
                        const s = opts.spawn
                        const spd = s.spd ?? 260
                        gs.enemies.push({
                            id: 9000 + Math.round(s.x * 7 + s.y), kind: s.kind ?? 'icbm',
                            x: s.x, px: s.x, y: s.y, vx: s.vx ?? 0,
                            vy: s.vy ?? (CFG.groundY - s.y) / spd,
                            ti: s.ti ?? 0, t: 0, alive: true, split: null,
                            amp: s.amp ?? 0, drops: s.drops ? s.drops.map((d) => ({ ...d, done: false })) : null,
                            spawnAt: gs.playT, score: CFG.score[s.kind ?? 'icbm'],
                        })
                    }
                    if (opts.killCity !== undefined && gs.cities[opts.killCity]) gs.cities[opts.killCity].alive = false
                    if (opts.cityAlive !== undefined && gs.cities[opts.cityAlive]) gs.cities[opts.cityAlive].alive = true
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'MISSILE BATTLE',
                getState: () => [
                    `${WAVES[gs.wave].name}  score ${gs.score}  phase ${gs.phase}  cities ${gs.cities.filter((c) => c.alive).length}/6`,
                    `batteries ${gs.bases.map((b) => (b.alive ? b.ammo : 'X')).join('/')}  fired ${gs.fired} [${gs.firedBy.join(',')}]  kills ${gs.kills}`,
                    `reticle ${gs.aim.x.toFixed(0)},${gs.aim.y.toFixed(0)}  in air: ${gs.enemies.map((e) => e.kind[0] + Math.round(e.x) + ',' + Math.round(e.y)).join(' ')}`,
                    `interceptors ${gs.intc.length}  blasts ${gs.blasts.length}  screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = structuredClone(gs)
                            sim.events = []
                            const held = new Map()
                            let t = 0
                            while (!sim.end && t < 20000) { step(sim, decide(sim, held)); t++ }
                            const cities = sim.cities.filter((c) => c.alive).length
                            const ammo = sim.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0)
                            return sim.end === 'win'
                                ? `WINNABLE from HERE: the autopilot replays this exact state to victory (${t} ticks ahead, ${cities} cities and ${ammo} interceptors left over)`
                                : `LOST from here: ${sim.end || 'the autopilot could not hold this board'} — cities ${cities}, ammo ${ammo}`
                        },
                    },
                    { label: '+10 EVERY BATTERY', run: () => { gs.bases.forEach((b) => { b.ammo += 10 }); return 'ammo +10 each' } },
                    { label: 'CLOUD SEED', run: () => {
                        for (let k = 0; k < 5; k++) gs.enemies.push({ id: 8000 + k, kind: 'icbm', x: 60 + k * 32, px: 60 + k * 32, y: 30 + k * 6, vx: (146 - 60 - k * 32) / 240, vy: (CFG.groundY - 30 - k * 6) / 240, ti: 2, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: gs.playT, score: CFG.score.icbm })
                        return 'five warheads converging on one city'
                    } },
                    { label: 'SMARTEST BOMB', run: () => { gs.enemies.push({ id: 8100, kind: 'smart', x: 128, px: 128, y: 20, vx: 0, vy: 0.6, ti: 3, t: 0, alive: true, split: null, amp: 13, drops: null, spawnAt: gs.playT, score: CFG.score.smart }); return 'weaving at the middle city' } },
                ],
            })
            let prevA = false, contractSeed = 0
            exposeGame({
                id: 'missile-battle',
                buttons: ['left', 'right', 'up', 'down', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(0)
                    evLog.length = 0; parts.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.f = keys.fTap = false
                    tap.on = false
                    prevA = false; demoAt = 0
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const fire = !!pad.a && !prevA
                    prevA = !!pad.a
                    doSim({ l: !!pad.left, r: !!pad.right, u: !!pad.up, d: !!pad.down, fire })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, wave: gs.wave, phase: gs.phase,
                    cities: gs.cities.filter((c) => c.alive).length,
                    ammo: gs.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0),
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__mbTest) delete window.__mbTest; unexposeGame(); unmountDbg() }
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
                    <span ref={setHud('wave')} className="border border-red-300/60 text-red-200 px-2 py-0.5 rounded bg-black/40">1/3</span>
                    <span className="text-cyan-200">CITIES <b ref={setHud('cities')}>6</b></span>
                    <span ref={setHud('ammo')} className="text-violet-200/90">10 10 10</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                        <h1 className="text-4xl font-black" style={{ color: '#ff7d5d', textShadow: '3px 0 0 #39d2ff, -3px 0 0 #ff3d6e, 0 10px 24px #000' }}>MISSILE BATTLE</h1>
                        <p className="text-white font-mono font-bold mt-3 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'DEFENSE HELD' : 'THE MAP WENT DARK'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — all three barrages broken' : ''}</p>
                    <div className="bg-black/50 border border-amber-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MISSILE BATTLE')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default MissileBattleGame

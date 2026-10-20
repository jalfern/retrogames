// SPY HUNTER — the arcade shell. Everything drawn at runtime from the pure
// sim in ./sim.js: the road scrolls because the sim says so, every enemy is
// a scripted event from ./script.js, and the attract demo is the autopilot's
// OWN proven run replayed tick for tick through the real step() — the same
// witness huntercheck audits. The renderer's spatial contract is
// `pixel = sim unit` 1:1 on 256x224, which is exactly the transform
// scripts/hunterplay.mjs samples to prove the drawn car sits where the
// physics says it is, after every real keystroke.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { W, H, PY, ROAD_L, ROAD_R, RIVER_X, makeGame, step, stateHash } from './sim.js'
import { STAGES } from './script.js'
import { plan, decide } from './planner.js'
import { PRESS, MESSAGES } from './attract.js'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => { if (!proven) proven = plan(); return proven }

// the riff: a climbing chromatic over a driving bass — pastiche of the
// arcade's mood, synthesized here note by note, no audio files anywhere.
const RIFF = [294, 311, 330, 349, 392, 349, 330, 311]
const BASS = [73, 73, 82, 82, 73, 73, 98, 98]

const SpyHunterGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('spyhunter.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.spyStage = '1'
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
        let demoReady = false
        const keys = { l: false, r: false, f: false, m: false, mEdge: false }
        const evLog = []
        const parts = []
        const trees = []
        for (let i = 0; i < 7; i++) trees.push([6 + (i % 2) * 9, (i * 37) % H, i % 3])

        const say = (m) => { toastMsg = m; toast = 120 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.6 + (i % 3) * 0.8
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 220) evLog.splice(0, evLog.length - 220)
            for (const e of evts) {
                if (e.type === 'kill') { audioController.playNoise(0.08, 0.06); burst(e.x ?? 112, e.y ?? 100, 10, e.kind === 'bonus' ? '#5df75d' : '#ffb347'); shake = 4 }
                else if (e.type === 'fire') audioController.playTone(720, 0.03, 'square', 0.025)
                else if (e.type === 'missile') audioController.playSweep(240, 900, 0.4, 'sawtooth', 0.06)
                else if (e.type === 'spin') { say('OIL! SPINNING!'); audioController.playSweep(500, 120, 0.6, 'sawtooth', 0.08); shake = 5 }
                else if (e.type === 'push') { shake = 3 }
                else if (e.type === 'cratedrop') say('CRATE AWAY — CATCH IT!')
                else if (e.type === 'crate') {
                    audioController.playSweep(660, 1320, 0.25, 'square', 0.08)
                    say(e.kind === 'missile' ? 'MISSILES +3' : e.kind === 'gun' ? 'MACHINE GUN UPGRADE!' : 'REPAIRED')
                } else if (e.type === 'overheat') say('GUN OVERHEAT!')
                else if (e.type === 'death') { audioController.playNoise(0.25, 0.09); burst(112, PY, 16, '#ff6d3a'); shake = 8 }
                else if (e.type === 'stageclear') { say(`STAGE ${e.stage + 1} CLEAR!`); audioController.playSweep(392, 1568, 0.5, 'square', 0.08) }
                else if (e.type === 'bonusstart') say('BONUS CAR — SHOOT IT!')
                else if (e.type === 'stage') say(STAGES[gs.stage].name)
                else if (e.type === 'rumble') audioController.playNoise(0.02, 0.02)
                else if (e.type === 'respawn') audioController.playTone(520, 0.12, 'square', 0.05)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('spyhunter.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            if (!demoReady) return
            const run = provenRun()
            if (gs.end || demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0 }
            doSim(run.script[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ l: keys.l, r: keys.r, f: keys.f, m: keys.mEdge })
            keys.mEdge = false
        }

        // music: 8th-note riff on the sim clock, only while driving
        let noteAt = 0
        const music = () => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end || gs.player.dead) return
            if (gs.tick - noteAt < 14) return
            noteAt = gs.tick
            const i = Math.floor(gs.tick / 14) % 8
            audioController.playTone(RIFF[i], 0.11, 'square', 0.035)
            audioController.playTone(BASS[i], 0.16, 'triangle', 0.05)
        }

        // ---------------------------------------------------------------- paint ----
        const drawCar = (x, y, col, dark, wide = 0) => {
            ctx.fillStyle = col
            ctx.fillRect(x - 7 - wide, y - 13, 14 + wide * 2, 26)
            ctx.fillStyle = dark
            ctx.fillRect(x - 5 - wide, y - 9, 10 + wide * 2, 6)
            ctx.fillRect(x - 5 - wide, y + 4, 10 + wide * 2, 5)
            ctx.fillStyle = '#111'
            ctx.fillRect(x - 8 - wide, y - 11, 2, 6); ctx.fillRect(x + 6 + wide, y - 11, 2, 6)
            ctx.fillRect(x - 8 - wide, y + 6, 2, 6); ctx.fillRect(x + 6 + wide, y + 6, 2, 6)
        }
        const drawPlayer = (x, y, tk) => {
            drawCar(x, y, '#f2f2ff', '#2a2a6a')
            ctx.fillStyle = '#c22'
            ctx.fillRect(x - 3, y - 2, 6, 5)                 // the driver
            ctx.fillStyle = '#ffd23f'
            ctx.fillRect(x - 2, y - 14, 1, 2); ctx.fillRect(x + 1, y - 14, 1, 2)
            if (tk % 6 < 3 && gs.tick % 4 < 2) { ctx.fillStyle = '#5df'; ctx.fillRect(x - 6, y - 14, 2, 2) }
        }

        const paint = () => {
            const sx = shake > 0 ? Math.sin(gs.tick * 3.1) * shake * 0.5 : 0
            const sy = shake > 0 ? Math.sin(gs.tick * 2.3) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.4) shake = 0 }
            const scr = gs.d % H
            // grass
            ctx.fillStyle = '#1d7a2a'
            ctx.fillRect(0, 0, ROAD_L, H)
            ctx.fillStyle = '#186623'
            ctx.fillRect(ROAD_R, 0, W - ROAD_R, H)
            // river
            ctx.fillStyle = '#2a5fd0'
            ctx.fillRect(ROAD_R + 6, 0, W - ROAD_R - 6, H)
            ctx.fillStyle = '#5d8fe8'
            for (let i = 0; i < 6; i++) {
                const wy = (i * 40 + scr * 1.15) % (H + 20) - 10
                ctx.fillRect(ROAD_R + 14 + (i % 3) * 10, wy, 8, 2)
            }
            // road + edges + lane dashes
            ctx.fillStyle = '#6b6b74'
            ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H)
            ctx.fillStyle = '#e8e8e8'
            ctx.fillRect(ROAD_L - 3, 0, 3, H); ctx.fillRect(ROAD_R, 0, 3, H)
            ctx.fillStyle = '#d8d8b0'
            for (let y = -20; y < H + 20; y += 24) {
                const ly = (y + scr % 24)
                ctx.fillRect(ROAD_L + 57, ly, 2, 10); ctx.fillRect(ROAD_L + 114, ly, 2, 10)
            }
            // rumble stripes right of road (the shoulder you must not keep)
            ctx.fillStyle = '#c33'
            for (let y = -20; y < H + 20; y += 16) ctx.fillRect(ROAD_R + 3, (y + scr) % (H + 20), 3, 8)
            // palms
            for (const [tx, ty0, v] of trees) {
                const ty = (ty0 + scr * 1.0) % (H + 24) - 12
                ctx.fillStyle = v ? '#0e4d18' : '#123f10'
                ctx.fillRect(tx - 1, ty, 3, 10)
                ctx.fillStyle = '#1f9e3a'
                ctx.fillRect(tx - 5, ty - 3, 11, 4)
                ctx.fillRect(tx - 3, ty - 6, 7, 4)
            }
            ctx.save(); ctx.translate(sx, sy)
            // oil slicks
            for (const o of gs.oils) {
                ctx.fillStyle = '#141410'
                ctx.beginPath(); ctx.ellipse(o.x, o.y, o.w / 2, 7, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#3a3a52'
                ctx.fillRect(o.x - 6, o.y - 2, 5, 2); ctx.fillRect(o.x + 2, o.y + 1, 4, 2)
            }
            // boats
            if (gs.boat.state === 'run') {
                const b = gs.boat
                ctx.fillStyle = '#cfd2da'
                ctx.fillRect(RIVER_X - 12, b.y - 8, 24, 14)
                ctx.fillStyle = '#8a8f9c'
                ctx.fillRect(RIVER_X - 4, b.y - 13, 10, 6)
                ctx.fillStyle = '#ffdf6b'
                ctx.fillRect(RIVER_X + 7, b.y - 2, 3, 3)
            }
            // scripted cars
            for (const e of gs.ents) {
                if (e.state !== 'run') continue
                if (e.type === 'laker') drawCar(e.x, e.y, '#d8d24a', '#7a6d10', 1)
                else if (e.type === 'rambler') drawCar(e.x, e.y, '#a34ad8', '#4a1a66')
                else if (e.type === 'sweeper') {
                    drawCar(e.x, e.y, '#e87a2a', '#6a3008', 2)
                    ctx.fillStyle = '#c9c9c9'
                    ctx.fillRect(e.x - 13, e.y - 17, 26, 4)
                } else if (e.type === 'killer') drawCar(e.x, e.y, '#2a2a2e', '#000')
                else if (e.type === 'traffic') drawCar(e.x, e.y, '#4ac0d8', '#164a58')
                else if (e.type === 'supporter') {
                    drawCar(e.x, e.y, '#e8e8e8', '#888', 1)
                    if (e.crate) {
                        ctx.fillStyle = e.crate === 'missile' ? '#ff5d5d' : e.crate === 'gun' ? '#ffd23f' : '#5df75d'
                        ctx.fillRect(e.x - 4, e.y - 22, 8, 8)
                        ctx.fillStyle = '#111'
                        ctx.font = '7px monospace'
                        ctx.fillText(e.crate[0].toUpperCase(), e.x - 2, e.y - 15)
                    }
                } else if (e.type === 'heli') {
                    ctx.fillStyle = '#9aa0a8'
                    ctx.fillRect(e.x - 8, e.y - 4, 18, 8)
                    ctx.fillStyle = '#6a7078'
                    ctx.fillRect(e.x + 8, e.y - 1, 8, 3)
                    ctx.fillStyle = gs.tick % 4 < 2 ? '#e8e8e8' : '#5a5f66'
                    ctx.fillRect(e.x - 16, e.y - 8, 32, 2)
                }
            }
            // bonus car crossing
            if (gs.bonusT > 0 && gs.bonusAlive) {
                drawCar(gs.bonusX, 96, '#3d7df2', '#102a66')
                ctx.fillStyle = '#fff'
                ctx.font = '8px monospace'
                ctx.fillText('2000', gs.bonusX - 9, 78)
            }
            // crates
            for (const c of gs.crates) {
                ctx.fillStyle = c.kind === 'missile' ? '#ff5d5d' : c.kind === 'gun' ? '#ffd23f' : '#5df75d'
                ctx.fillRect(c.x - 6, c.y - 6, 12, 12)
                ctx.fillStyle = '#111'
                ctx.font = '8px monospace'
                ctx.fillText(c.kind[0].toUpperCase(), c.x - 2, c.y + 3)
            }
            // ordnance
            ctx.fillStyle = '#fff7c9'
            for (const s of gs.shots) ctx.fillRect(s.x - 1, s.y - 4, 2, 6)
            ctx.fillStyle = '#ff7a5c'
            for (const s of gs.eshots) ctx.fillRect(s.x - 2, s.y - 2, 4, 5)
            for (const m of gs.missilesFly) {
                ctx.fillStyle = '#f2f2f2'
                ctx.fillRect(m.x - 1, m.y - 5, 3, 10)
                ctx.fillStyle = '#ff9a3d'
                ctx.fillRect(m.x - 1, m.y + 5, 3, 3)
            }
            const p = gs.player
            if (p.dead === 0 && !(p.invuln > 0 && gs.tick % 8 < 3)) drawPlayer(p.x, PY, gs.tick)
            ctx.restore()
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy + 1
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
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.hiscore) h.hiscore.textContent = String(Math.max(gs.score, ...board().map((b) => b.score), 0)).padStart(6, '0')
            if (h.stage) h.stage.textContent = String(gs.stage + 1)
            if (h.lives) h.lives.textContent = '🚗'.repeat(Math.max(0, gs.lives))
            if (h.msl) h.msl.textContent = `MSL ${gs.missiles}${gs.gunUp ? ' ⚡' : ''}`
            if (h.heat) h.heat.style.width = `${Math.min(100, (gs.player.heat / 24) * 100)}%`
            if (h.lock) h.lock.style.opacity = gs.player.lock > 0 ? '1' : '0'
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
                    while (acc >= SIM_MS) { doFrameSim(); music(); acc -= SIM_MS }
                }
            }
            paint()
            syncHud()
        }

        const startPlay = () => {
            gs = makeGame(0)
            noteAt = gs.tick
            evLog.length = 0; parts.length = 0
            keys.l = keys.r = keys.f = keys.m = keys.mEdge = false
            setMode('play')
            audioController.playSweep(220, 660, 0.25, 'sawtooth', 0.07)
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
            if (e.code === 'Space') keys.f = true
            if (e.code === 'KeyX' || e.code === 'KeyB' || e.code === 'KeyM') keys.mEdge = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'Space') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.f = false }
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
        // the proven run is a ~2 s roll of the real sim; compute it off the
        // first paint so opening the tab never stutters
        const t = setTimeout(() => { provenRun(); demoReady = true }, 60)

        if (import.meta.env.DEV) {
            window.__spyTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, stage: gs.stage, score: gs.score,
                    lives: gs.lives, missiles: gs.missiles, gunUp: gs.gunUp, end: gs.end,
                    phase: gs.phase, heat: gs.player.heat, lock: gs.player.lock,
                    player: { x: gs.player.x, spin: gs.player.spin, dead: gs.player.dead, offT: gs.player.offT, invuln: gs.player.invuln },
                    ents: gs.ents.filter((e) => e.state === 'run')
                        .map((e) => ({ kind: e.type, x: Math.round(e.x), y: Math.round(e.y), crate: e.crate ?? null })),
                    boat: { y: Math.round(gs.boat.y), state: gs.boat.state },
                    oils: gs.oils.map((o) => ({ x: Math.round(o.x), y: Math.round(o.y) })),
                    crates: gs.crates.map((c) => ({ kind: c.kind, x: Math.round(c.x), y: Math.round(c.y) })),
                    shots: gs.shots.length, eshots: gs.eshots.length, mslFly: gs.missilesFly.length,
                    board: board(), evLog: evLog.slice(-90),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.stage !== undefined) { gs.stage = opts.stage; gs.stageT = 0; gs.spawnIdx = 0 }
                    if (opts.player) Object.assign(gs.player, opts.player)
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.missiles !== undefined) gs.missiles = opts.missiles
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'SPY HUNTER',
                getState: () => [
                    `${STAGES[gs.stage].name}  stage ${gs.stage + 1}/2  lives ${gs.lives}  score ${gs.score}  msl ${gs.missiles}${gs.gunUp ? '  GUN+' : ''}`,
                    `car ${gs.player.x.toFixed(0)} spin ${gs.player.spin} offT ${gs.player.offT} heat ${gs.player.heat.toFixed(0)}${gs.player.lock ? ' LOCKED' : ''}  phase ${gs.phase}`,
                    `road: ${gs.ents.filter((e) => e.state === 'run').length} cars, ${gs.oils.length} slicks, boat ${gs.boat.state}@${gs.boat.y.toFixed(0)}`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const r = decide(gs)
                            const deadCount = [-66, -44, -22, 0, 22, 44, 66].filter((o) => {
                                const t = Math.max(20, Math.min(200, gs.player.x + o))
                                const c = structuredClone(gs)
                                for (let k = 0; k < 40; k++) {
                                    const inp = { f: false }
                                    if (t > c.player.x + 1) inp.r = true
                                    else if (t < c.player.x - 1) inp.l = true
                                    step(c, inp)
                                    if (c.player.dead > 0 || c.events.some((e) => e.type === 'death')) return true
                                    c.events.length = 0
                                }
                                return false
                            }).length
                            return `decided ${JSON.stringify(r)} — ${deadCount}/7 lanes die in a 40-tick rollout; ${deadCount < 7 ? 'the road still has a living answer' : 'only pure luck survives this tick'}`
                        },
                    },
                    { label: '+1 LIFE', run: () => { gs.lives++; return `lives ${gs.lives}` } },
                    { label: '+3 MISSILES', run: () => { gs.missiles += 3; return `missiles ${gs.missiles}` } },
                    { label: 'GRANT GUN', run: () => { gs.gunUp = true; return 'rapid gun' } },
                    { label: 'CLEAR OIL', run: () => { gs.oils.length = 0; return 'road clean' } },
                    { label: 'SPAWN BONUS', run: () => { gs.phase = 'bonus'; gs.bonusT = 0; gs.bonusX = undefined; gs.bonusAlive = false; return 'bonus car next' } },
                ],
            })
            let prevB = false, contractSeed = 0
            exposeGame({
                id: 'spy-hunter',
                buttons: ['left', 'right', 'a', 'b'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(0)
                    noteAt = gs.tick
                    evLog.length = 0; parts.length = 0
                    keys.l = keys.r = keys.f = keys.m = keys.mEdge = false
                    prevB = false; demoAt = 0
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    const missile = !!pad.b && !prevB
                    prevB = !!pad.b
                    doSim({ l: !!pad.left, r: !!pad.right, f: !!pad.a, m: missile })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, stage: gs.stage, lives: gs.lives,
                    missiles: gs.missiles, gunUp: gs.gunUp, d: gs.d, hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            clearTimeout(t)
            if (import.meta.env.DEV) { if (window.__spyTest) delete window.__spyTest; unexposeGame(); unmountDbg() }
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
                    <span ref={setHud('stage')} className="border border-yellow-300/60 text-yellow-200 px-2 py-0.5 rounded bg-black/40">1</span>
                    <span className="text-red-300 text-sm"><span ref={setHud('lives')}>🚗🚗</span></span>
                    <span ref={setHud('msl')} className="text-cyan-200 font-bold">MSL 0</span>
                    <span className="hidden sm:inline text-orange-300/90">HEAT<span className="inline-block w-16 h-2 ml-1 border border-orange-300/60 align-middle"><span ref={setHud('heat')} className="block h-full bg-orange-400" style={{ width: '0%' }} /></span></span>
                    <span ref={setHud('lock')} className="text-red-400 font-bold transition-opacity" style={{ opacity: 0 }}>OVERHEAT!</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-yellow-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #a60' }} />
            </div>

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                        <h1 className="text-4xl font-black text-yellow-300" style={{ textShadow: '0 4px 0 #620, 0 10px 24px #000' }}>SPY HUNTER</h1>
                        <p className="text-white font-mono font-bold mt-4 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-cyan-100/80 mt-3 px-8" messages={MESSAGES} />
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-yellow-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-green-300' : 'text-red-400'}`}>{end.win ? 'MISSION COMPLETE!' : 'GAME OVER'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — both stages cleared' : ''}</p>
                    <div className="bg-black/50 border border-yellow-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-yellow-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SPY HUNTER')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default SpyHunterGame

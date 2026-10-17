// LUNAR LANDER — the cabinet shell. Atari's 1979 vector classic: fly the gold
// lander down with axis thrust and a stick, set it on a lit pad at walking pace,
// relight and catch the orbiter to refuel, and take the next terrain with a
// bigger multiplier. All art and audio are synthesized at runtime — see art.js /
// AudioController — there are no assets.
//
// Layout: 1. setup 2. events/juice 3. render 4. loop 5. input 6. DEV hook
// + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, stateHash, CFG, ORBIT_Y, TARGET_CYCLES, W, H } from './sim.js'
import { terrainY, WORLD_W, PAD_SLOTS, STEP } from './terrain.js'
import { plan } from './planner.js'
import { policyProbs, mulberry32, sampleAction, obsFrom, actionVector, ACTION_VECS,
    HEAT_XS, HEAT_VXS, HEAT_EPISODES } from './policy.js'
import { makeStars, makeCam, drawStars, drawTerrain, drawLander, drawOrbiter } from './art.js'

const SIM_MS = 1000 / 60
const REPLAY_PATH = 'replays/lander-ppo.json'
const POLICIES = ['v3', 'v2', 'dagger6', 'bc1k', 'clone1k', 'clone1k-noisy']
const policyName = () => {
    const p = new URLSearchParams(window.location.search).get('policy')
    return POLICIES.includes(p) ? p : 'v3'
}
const policyPath = (name) => `replays/lander-policy-${name}.json`
const gravityScale = () => {
    const g = parseFloat(new URLSearchParams(window.location.search).get('gravity'))
    return Number.isFinite(g) && g > 0 ? g : 1
}
const GRAV_BASE = CFG.gravity
const replayRequested = () => new URLSearchParams(window.location.search).get('replay') === '1'
const labRequested = () => new URLSearchParams(window.location.search).get('lab') === '1'
const PAD_MARKS = PAD_SLOTS.map((s) => ({ cx: s.i * STEP, val: s.val }))
const PAD_COL = HEAT_XS.map((x) => PAD_MARKS.find((p) => Math.abs(x - p.cx) <= 15) || null)
const heatColor = (t) => `rgb(${Math.round(255 - 198 * t)},${Math.round(93 + 118 * t)},${Math.round(93 - 10 * t)})`
const LAB_CYCLE = [[96, 0], [272, -15], [512, 20], [752, -30], [928, 10], [200, 35],
                  [650, -40], [350, 5], [850, 25], [512, -40]]
let cachedRun = null
const provenRun = () => { if (!cachedRun) cachedRun = plan({ seed: 0 }); return cachedRun }

const LunarLanderGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hud = useRef({})
    const setHud = (k) => (el) => { hud.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('lander.board') || '[]') } catch { return [] } }

    const labMode = labRequested()
    const [labInfo, setLabInfo] = useState(null)
    const [labX, setLabX] = useState(512)
    const [labVx, setLabVx] = useState(0)
    const [labCycle, setLabCycle] = useState(-1)
    const [heatRows, setHeatRows] = useState(null)
    const labCfgRef = useRef({ x: 512, vx: 0, seed: 7, restart: 0 })
    const fly = (x, vx) => {
        setLabX(Math.round(x)); setLabVx(Math.round(vx))
        const c = labCfgRef.current
        labCfgRef.current = { ...c, x, vx, restart: c.restart + 1 }
    }
    const cycle = () => {
        const i = (labCycle + 1) % LAB_CYCLE.length
        setLabCycle(i)
        fly(...LAB_CYCLE[i])
    }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.lunarLanderStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        const gsScale = gravityScale()
        const scaledLab = (labRequested() || replayRequested()) && gsScale !== 1
        if (scaledLab) CFG.gravity = GRAV_BASE * gsScale

        let gs = makeGame(0)
        let stars = makeStars(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0
        let zoom = false
        let engineTick = 0
        const held = new Set()
        const evLog = []
        const parts = []
        let thrustVis = false

        const replayOn = replayRequested()
        let replay = null, replayIdx = 0, replayFailed = false
        if (replayOn) {
            fetch(`${import.meta.env.BASE_URL}${REPLAY_PATH}`)
                .then((r) => { if (!r.ok) throw new Error(`replay http ${r.status}`); return r.json() })
                .then((rec) => {
                    replay = rec; replayIdx = 0
                    gs = makeGame(rec.seed)
                    stars = makeStars(rec.seed)
                    parts.length = 0
                    setMode('play')
                })
                .catch(() => { replayFailed = true })
        }

        const labOn = labRequested()
        let labPolicy = null, labFailed = false, labRng = mulberry32(7), labHold = 0, labRestart = -1
        let heatWorker = null

        const startLabFlight = () => {
            const c = labCfgRef.current
            gs = makeGame(c.seed)
            gs.x = Math.max(20, Math.min(WORLD_W - 20, c.x))
            gs.vx = c.vx
            stars = makeStars(c.seed)
            parts.length = 0
            shake = 0; flash = 0; zoom = false
            labRng = mulberry32((c.seed ^ Math.imul(Math.round(gs.x), 7919)
                ^ Math.imul(Math.round(c.vx * 97) + 4096, 104729)) >>> 0)
            labHold = 0
            if (screenRef.current !== 'play') setMode('play')
        }

        if (labOn) {
            const applyHeat = (h) => setHeatRows(h.vxs.map((v, vi) => ({
                v,
                cells: h.xs.map((x, xi) => ({ x, pads: h.grid[vi][xi],
                    col: heatColor(h.grid[vi][xi] / HEAT_EPISODES) })),
            })))
            const runHeatWorker = (pol) => {
                setHeatRows(HEAT_VXS.map((v) => ({
                    v, cells: HEAT_XS.map((x) => ({ x, pads: null, col: '#141b2b' })),
                })))
                heatWorker = new Worker(new URL('./heatWorker.js', import.meta.url), { type: 'module' })
                heatWorker.onmessage = (e) => {
                    const d = e.data
                    if (d.done) { heatWorker.terminate(); heatWorker = null; return }
                    setHeatRows((rows) => rows && rows.map((row, vi) => vi !== d.vi ? row : ({
                        v: row.v,
                        cells: row.cells.map((c, xi) => xi !== d.xi ? c
                            : { x: c.x, pads: d.pads, col: heatColor(d.pads / HEAT_EPISODES) }),
                    })))
                }
                heatWorker.postMessage({ policy: pol, gravity: gsScale,
                    xs: HEAT_XS, vxs: HEAT_VXS, episodes: HEAT_EPISODES })
            }
            fetch(`${import.meta.env.BASE_URL}${policyPath(policyName())}`)
                .then((r) => { if (!r.ok) throw new Error(`policy http ${r.status}`); return r.json() })
                .then((pol) => {
                    labPolicy = pol
                    setLabInfo({ name: pol.name || policyName(), pad_rate: pol.pad_rate })
                    startLabFlight()
                    if (gsScale === 1) {
                        fetch(`${import.meta.env.BASE_URL}replays/lander-heat-${pol.name}.json`)
                            .then((r) => { if (!r.ok) throw new Error(`heat http ${r.status}`); return r.json() })
                            .then(applyHeat)
                            .catch(() => runHeatWorker(pol))
                    } else {
                        runHeatWorker(pol)
                    }
                })
                .catch(() => { labFailed = true })
        }

        const say = (m) => { toastMsg = m; toast = 160 }

        const burst = (x, y, n, col, speed, life) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = speed * (0.3 + Math.random())
                parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random()), col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.type === 'land') {
                    audioController.playSweep(440, 660, 0.18, 'square', 0.08)
                    audioController.playTone(880, 0.14, 'square', 0.07)
                    say(e.pad ? `TOUCHDOWN ${e.pad} PAD  +${e.pts}` : 'TOUCHDOWN  +points')
                    burst(gs.x, gs.y - 10, 14, '#c9b06a', 26, 28)
                } else if (e.type === 'launch') {
                    audioController.playNoise(0.5, 0.07)
                } else if (e.type === 'dock') {
                    audioController.playFanfare(); flash = 14
                    say(`DOCKED — +${200 * (e.mult - 1)} · MULTIPLIER ×${e.mult}`)
                } else if (e.type === 'crash') {
                    audioController.playNoise(0.4, 0.13)
                    audioController.playSweep(200, 55, 0.5, 'sawtooth', 0.1)
                    shake = 14; flash = 10
                    say(e.why === 'slope' ? 'CRASH — SLOPE' : e.why === 'impact' ? 'CRASH — TOO FAST' : e.why === 'tilt' ? 'CRASH — TIPPED' : e.why === 'climb' ? 'CRASH — CLIPPED' : 'CRASH — DRIFT')
                    burst(e.x, e.y, 46, '#ffb050', 60, 42)
                    burst(e.x, e.y, 22, '#ff5030', 34, 30)
                } else if (e.type === 'fuelout') {
                    audioController.playTone(220, 0.25, 'square', 0.09)
                    say('FUEL EMPTY')
                } else if (e.type === 'respawn') {
                    stars = makeStars(gs.seed + gs.terrainIdx)
                } else if (e.type === 'stranded') {
                    audioController.playDeath(); say('STRANDED — NO FUEL TO LEAVE ORBIT')
                } else if (e.type === 'win') { audioController.playFanfare(); flash = 18 }
                else if (e.type === 'over' && !e.win) audioController.playDeath()
            }
        }

        const finish = () => {
            const sc = Math.round(gs.score)
            if (gs.win) localStorage.setItem('lander.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish()
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; stars = makeStars(0) }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0; stars = makeStars(0) }
            thrustVis = !!run.script[demoAt - 1]?.thrust && gs.fuel > 0
        }

        const computeInput = () => {
            const rot = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
            const thrust = held.has('ArrowUp') || held.has('Space') || held.has('KeyZ')
            thrustVis = thrust && gs.fuel > 0 && gs.phase !== 'crashed'
            if (thrustVis && gs.fuel > 0 && (gs.phase === 'descent' || gs.phase === 'ascent')) {
                engineTick++
                if (engineTick % 5 === 0) audioController.playNoise(0.09, 0.028)
            }
            return { rot, thrust }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (labOn && !labFailed) {
                if (!labPolicy) return
                if (labCfgRef.current.restart !== labRestart) { labRestart = labCfgRef.current.restart; startLabFlight() }
                if (gs.phase === 'landed' || gs.phase === 'crashed') {
                    labHold++
                    if (labHold > 90) startLabFlight()
                    return
                }
                const probs = policyProbs(labPolicy, obsFrom(gs))
                const [rot, thrust] = actionVector(labPolicy, sampleAction(probs, labRng))
                thrustVis = thrust && gs.fuel > 0 && gs.phase !== 'crashed'
                doSim({ rot, thrust })
                return
            }
            if (replayOn && !replayFailed) {
                if (sc !== 'play' || !replay) return
                const [rot, thrust] = ACTION_VECS[replay.actions[replayIdx]] || [0, false]
                if (replayIdx < replay.actions.length) replayIdx++
                thrustVis = thrust && gs.fuel > 0 && gs.phase !== 'crashed'
                doSim({ rot, thrust })
                return
            }
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim(computeInput())
        }

        // ------------------------------------------------------------- render ----
        const text = (s, x, y, size, col, glow = 0, align = 'center') => {
            ctx.font = `bold ${size}px monospace`; ctx.textAlign = align
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.shadowBlur = 0
        }

        const readout = (label, val, unit, x, y, align, col = '#ffd76b') => {
            text(label, x, y, 8, '#8fa3d8', 0, align)
            text(unit ? `${val} ${unit}` : `${val}`, x, y + 12, 13, col, 4, align)
        }

        const drawWorld = () => {
            const cam = makeCam(zoom && screenRef.current === 'play')
            const camX = cam.clampX(gs.x)
            const camY = cam.clampY(Math.min(gs.y, 200))
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.7 }
            drawStars(ctx, stars, camX, gs.tick)
            // the orbit line: a faint dashed rail where the orbiter runs
            ctx.strokeStyle = 'rgba(140,170,230,0.25)'
            ctx.setLineDash([4, 6])
            ctx.beginPath(); ctx.moveTo(0, cam.py(ORBIT_Y, camY)); ctx.lineTo(W, cam.py(ORBIT_Y, camY)); ctx.stroke()
            ctx.setLineDash([])
            drawTerrain(ctx, gs.terrain, cam, camX, camY)
            drawOrbiter(ctx, gs, cam, camX, camY)
            if (gs.phase !== 'crashed' && gs.phase !== 'landed') drawLander(ctx, gs, cam, camX, camY, thrustVis, gs.tick)
            if (gs.phase === 'landed') drawLander(ctx, gs, cam, camX, camY, thrustVis, gs.tick)
            // particles (visual juice only — the sim owns the rules)
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]
                p.x += p.vx / 60; p.y += p.vy / 60; p.vy -= CFG.gravity * 0.35 / 60; p.life--
                if (p.life <= 0) { parts.splice(i, 1); continue }
                ctx.fillStyle = p.col
                ctx.globalAlpha = Math.min(1, p.life / 24)
                ctx.fillRect(cam.px(p.x, camX) - 1, cam.py(p.y, camY) - 1, 2, 2)
                ctx.globalAlpha = 1
            }
            ctx.restore()
            if (flash > 0) { ctx.fillStyle = `rgba(255,220,140,${flash * 0.016})`; ctx.fillRect(0, 0, W, H); flash -= 0.6 }
        }

        const drawHud = () => {
            const alt = Math.max(0, Math.round(gs.y - 10 - terrainY(gs.terrain.pts, gs.x)))
            const hz = Math.round(gs.vx)
            const vt = Math.round(gs.vy)
            readout('FUEL', String(Math.round(gs.fuel)).padStart(3, '0'), '', 10, 16, 'left', gs.fuel < 25 ? ((gs.tick >> 3) % 2 ? '#ff5d5d' : '#ffd76b') : '#ffd76b')
            readout('ALT', String(alt).padStart(3, '0'), '', W - 10, 16, 'right')
            readout('VERT', `${vt > 0 ? '+' : ''}${vt}`, '', 10, 40, 'left', Math.abs(vt) > CFG.softVert ? '#ff5d5d' : '#8fff9f')
            readout('HORIZ', `${hz > 0 ? 'R' : hz < 0 ? 'L' : '-'} ${Math.abs(hz)}`, '', W - 10, 40, 'right', Math.abs(hz) > CFG.softHoriz ? '#ff5d5d' : '#8fff9f')
            text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}`, W / 2, 14, 10, '#e9f7ff', 2)
            text(`×${gs.mult}  LEM ${gs.cycle}/${TARGET_CYCLES}`, W / 2, 28, 8, '#8fa3d8')
            for (let i = 0; i < gs.landers; i++) {
                ctx.fillStyle = '#e8b64a'
                ctx.beginPath(); ctx.moveTo(12 + i * 12, H - 10); ctx.lineTo(9 + i * 12, H - 14); ctx.lineTo(15 + i * 12, H - 14); ctx.closePath(); ctx.fill()
            }
        }

        const draw = () => {
            ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H)
            drawWorld()
            drawHud()
            if (replayOn && replay && !replayFailed) {
                text('POLICY · REPLAY', W / 2, H - 12, 10, '#8fff9f', 6)
                if (scaledLab) text(`GRAVITY ×${gsScale}`, W / 2, H - 24, 8, '#8fa3d8')
            }
            if (labOn && labPolicy && !labFailed) {
                const pad = labPolicy.pad_rate != null ? ` · ${labPolicy.pad_rate}% PADS /500·HO` : ''
                text(`${(labPolicy.name || 'PPO').toUpperCase()} · LAB${pad}`, W / 2, H - 12, 10, '#8fff9f', 6)
                text(`START x ${Math.round(labCfgRef.current.x)} · SIDEWAYS ${labCfgRef.current.vx > 0 ? '+' : ''}${Math.round(labCfgRef.current.vx)}`
                    + (scaledLab ? ` · GRAVITY ×${gsScale}` : ''),
                    W / 2, H - 24, 8, '#8fa3d8')
            }
            if (toast > 0) { text(toastMsg, W / 2, H - 34, 11, '#ffd76b', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,4,12,0.72)'; ctx.fillRect(0, 0, W, H)
                text('LUNAR LANDER', W / 2, 92, 38, '#ffd76b', 16)
                text('ATARI 1979 · VECTOR CLASSIC', W / 2, 116, 8, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 154, 12, '#e9f7ff', 4)
                const msg = Math.floor(gs.tick / 90) % 3
                if (msg === 0) text('LAND IT SLOW · STRAIGHT · FLAT', W / 2, 196, 8, '#5d7094')
                else if (msg === 1) text('PADS PAY 100 · 50 · 20 · × MULTIPLIER', W / 2, 196, 8, '#5d7094')
                else text('DOCK THE ORBITER · FIVE MISSIONS', W / 2, 196, 8, '#5d7094')
                const b = board()[0]; if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 228, 9, '#ffd76b', 3)
            } else if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,4,12,0.78)'; ctx.fillRect(0, 0, W, H)
                text(gs.win ? 'MISSION COMPLETE — FIVE DOCKS' : 'OUT OF LANDERS', W / 2, 96, 20, gs.win ? '#8fff9f' : '#ff5d5d', 12)
                text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}   MISSIONS ${gs.cycle}/${TARGET_CYCLES}   BEST ×${gs.mult}`, W / 2, 126, 10, '#ffd76b', 4)
                text(`${gs.crashes} Lander${gs.crashes === 1 ? '' : 's'} lost on the way`, W / 2, 148, 9, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 190, 11, '#e9f7ff', 4)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
        }

        // --------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250); last = now
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 }
            else { acc += dt; while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS } }
            draw()
            const hh = hud.current
            if (hh.alt) hh.alt.textContent = String(Math.max(0, Math.round(gs.y - 10 - terrainY(gs.terrain.pts, gs.x))))
            if (hh.fuel) hh.fuel.textContent = String(Math.round(gs.fuel))
            if (hh.mult) hh.mult.textContent = `×${gs.mult}`
        }

        // ------------------------------------------------------------- input ----
        const goPlay = () => {
            gs = makeGame(0); demoAt = 0
            stars = makeStars(0)
            parts.length = 0
            shake = 0; flash = 0; zoom = false
            setMode('play')
        }
        const onKeyDown = (ev) => {
            if (ev.key === '?' || ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            if (replayOn && !replayFailed) { ev.preventDefault(); return }
            if (labOn && !labFailed) { ev.preventDefault(); return }
            const sc = screenRef.current
            if (sc === 'attract') { goPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (ev.code === 'KeyX' || ev.code === 'KeyL') zoom = !zoom
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(ev.code)) ev.preventDefault()
            held.add(ev.code)
        }
        const onKeyUp = (ev) => { held.delete(ev.code) }
        const onPointer = () => {
            if ((replayOn && !replayFailed) || (labOn && !labFailed)) return
            const sc = screenRef.current
            if (sc === 'attract') goPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointer)

        // --------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__landerTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ rot: 0, thrust: false }) },
                stepWith: (inp) => doSim(inp),
                press: (codes) => { for (const c of codes) held.add(c) },
                release: (codes) => { for (const c of codes) held.delete(c) },
                start: () => goPlay(),
                zoom: () => { zoom = !zoom },
                plan: (opts) => plan(opts),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, phase: gs.phase,
                    alt: Math.round(gs.y - 10 - terrainY(gs.terrain.pts, gs.x)),
                    vy: +gs.vy.toFixed(1), vx: +gs.vx.toFixed(1), rot: +gs.rot.toFixed(2),
                    fuel: Math.round(gs.fuel), mult: gs.mult, score: Math.round(gs.score),
                    landers: gs.landers, crashes: gs.crashes, cycle: gs.cycle,
                    zoom, end: gs.end, hash: stateHash(gs),
                }),
                gameTime: () => gs.tick / 60,
                replay: () => ({ on: replayOn, failed: replayFailed, idx: replayIdx, seed: replay ? replay.seed : null }),
            }
            exposeGame({
                id: 'lunar-lander',
                buttons: ['left', 'right', 'up', 'a', 'x'],
                reset: (seed) => {
                    gs = makeGame(seed)
                    stars = makeStars(seed)
                    parts.length = 0
                    shake = 0; flash = 0; zoom = false
                    demoAt = 0
                    setMode('play')
                },
                tick: (pad) => doSim({
                    rot: typeof pad.x === 'number' && pad.x !== 0
                        ? Math.max(-1, Math.min(1, pad.x))
                        : (pad.right ? 1 : 0) - (pad.left ? 1 : 0),
                    thrust: !!(pad.a || pad.up),
                }),
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    phase: gs.phase, x: gs.x, y: gs.y, vx: gs.vx, vy: gs.vy, rot: gs.rot,
                    fuel: gs.fuel, mult: gs.mult, cycle: gs.cycle, landers: gs.landers,
                    crashes: gs.crashes, terrainIdx: gs.terrainIdx,
                    orbX: gs.orb.x, orbVx: gs.orb.vx, seed: gs.seed, hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
            mountDbg({
                title: 'LUNAR LANDER',
                getState: () => [
                    `${gs.phase}  ALT ${Math.round(gs.y - terrainY(gs.terrain.pts, gs.x))} VERT ${gs.vy.toFixed(1)} HORIZ ${gs.vx.toFixed(1)} rot ${(gs.rot * 57.3).toFixed(0)}deg`,
                    `FUEL ${gs.fuel.toFixed(1)}  ×${gs.mult}  LEM ${gs.cycle}/${TARGET_CYCLES}  landers ${gs.landers}  score ${Math.round(gs.score)}`,
                    `orb x ${gs.orb.x.toFixed(0)} vx ${gs.orb.vx}  terrain ${gs.terrainIdx}  zoom ${zoom ? 'in' : 'out'}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan({ seed: gs.seed }); return r.won && r.crashes === 0 ? `route still winnable deathless (${(r.ticks / 60).toFixed(0)}s)` : `NOT deathless: crashes ${r.crashes} won ${r.won}` } },
                    { label: '+50 fuel', run: () => { gs.fuel = Math.min(CFG.startFuel, gs.fuel + 50); return 'fuel +50 (cheat)' } },
                    { label: 'free dock', run: () => { if (gs.phase === 'landed') { gs.y = ORBIT_Y; gs.x = gs.orb.x; gs.vy = 0 } else { gs.phase = 'ascent'; gs.y = ORBIT_Y - 4; gs.x = gs.orb.x; gs.vy = 4 } return 'nudged into the band (cheat)' } },
                    { label: 'spare landers', run: () => { gs.landers = 8; return 'landers 8 (cheat)' } },
                ],
            })
        }

        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (heatWorker) heatWorker.terminate()
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            if (scaledLab) CFG.gravity = GRAV_BASE
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame(); delete window.__landerTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'LUNAR LANDER')
    const replayMode = replayRequested()

    return (
        <div className={`relative w-full h-full flex flex-col items-center justify-center bg-[#05070d] select-none ${labMode ? 'pb-24' : ''}`}>
            <div ref={stageRef} className={`relative w-full ${labMode ? 'max-w-[640px]' : 'max-w-[900px]'} aspect-[512/384] shadow-[0_0_44px_rgba(255,215,107,0.18)]`} />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>ALT <span ref={setHud('alt')} className="text-[#e9f7ff]">---</span></span>
                <span>FUEL <span ref={setHud('fuel')} className="text-[#ffd76b]">100</span></span>
                <span>MULT <span ref={setHud('mult')} className="text-[#8fff9f]">×1</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused && !replayMode && !labMode} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
            {labMode && (
                <div className="mt-2 flex items-center gap-5 font-mono text-[11px] tracking-widest text-[#8fa3d8]">
                    <span className="text-[#8fff9f]">
                        POLICY {labInfo ? labInfo.name.toUpperCase() : policyName().toUpperCase()}
                        {labInfo && labInfo.pad_rate != null ? ` · ${labInfo.pad_rate}% PADS / 500 HELD-OUT SEEDS` : ''}
                        {gravityScale() !== 1 ? ` · GRAVITY ×${gravityScale()}` : ''}
                    </span>
                    <label className="flex items-center gap-2">START X
                        <input type="range" min={32} max={992} step={4} value={labX}
                            onChange={(e) => fly(+e.target.value, labVx)} className="accent-[#ffd76b]" />
                        <span className="w-8 text-[#e9f7ff]">{labX}</span>
                    </label>
                    <label className="flex items-center gap-2">SIDEWAYS
                        <input type="range" min={-40} max={40} step={1} value={labVx}
                            onChange={(e) => fly(labX, +e.target.value)} className="accent-[#ffd76b]" />
                        <span className="w-8 text-[#e9f7ff]">{labVx}</span>
                    </label>
                    <button type="button" onClick={cycle}
                        className="border border-[#5d7094] px-3 py-1 hover:border-[#ffd76b] hover:text-[#ffd76b] cursor-pointer">
                        CYCLE START
                    </button>
                </div>
            )}
            {labMode && heatRows && (
                <div className="mt-2 flex flex-col items-center font-mono text-[9px] tracking-widest text-[#8fa3d8]">
                    <div className="mb-[3px]">PAD-LANDING RATE — START X × SIDEWAYS V ({HEAT_EPISODES} EPISODES PER CELL) · CLICK TO FLY</div>
                    {heatRows.map((row) => (
                        <div key={row.v} className="flex items-center">
                            <span className="w-9 pr-1 text-right">{row.v > 0 ? `+${row.v}` : row.v}</span>
                            {row.cells.map((c) => (
                                <button key={c.x} type="button" title={c.pads == null ? `x ${c.x} v ${row.v} → …`
                                    : `x ${c.x} v ${row.v} → ${c.pads}/${HEAT_EPISODES} pads`}
                                    onClick={() => fly(c.x, row.v)} aria-label={`fly x ${c.x} vx ${row.v}${c.pads == null ? '' : ` rate ${c.pads} of ${HEAT_EPISODES}`}`}
                                    style={{ background: c.col }}
                                    className="w-[13px] h-[6px] m-[1px] border-0 cursor-pointer hover:outline hover:outline-1 hover:outline-white" />
                            ))}
                        </div>
                    ))}
                    <div className="flex items-center">
                        <span className="w-9 pr-1 text-right text-[7px]">x</span>
                        {PAD_COL.map((p, i) => (
                            <span key={i} className="w-[13px] m-[1px] text-center text-[8px] leading-[10px] text-[#ffd76b]">
                                {p ? p.val : ''}
                            </span>
                        ))}
                    </div>
                    <div className="mt-[3px] flex items-center gap-2">
                        <span>0/8</span>
                        <span style={{ background: heatColor(0) }} className="inline-block w-8 h-[8px]" />
                        <span style={{ background: heatColor(0.5) }} className="inline-block w-8 h-[8px]" />
                        <span style={{ background: heatColor(1) }} className="inline-block w-8 h-[8px]" />
                        <span>8/8 pads</span>
                        <span className="ml-3">numbers below axis = pad positions × value</span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default LunarLanderGame

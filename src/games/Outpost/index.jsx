// OUTPOST — the arcade shell. The colony is the pure sim in ./sim.js:
// procedurally carved depths (./cave.js), dwarves who claim jobs off the
// queue and A-star to them, and the attract demo replays the autopilot's
// OWN proven run (./planner.js) tick for tick through the real step().
//
// Layout: 1. proven demo 2. ASCII painters (cached rock/floor layer +
// live glyph layer) 3. fixed-timestep loop (250 ms catch-up cap — the
// heist lesson) 4. input (cursor + tool + tap-to-designate) 5. DEV hook +
// DebugKit 6. React + HUD. The player never touches a dwarf: they post
// jobs, exactly like scripts/outpostcheck.mjs does.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { CFG, newRun, step, stateHash } from './sim.js'
import { W, H, ROCK, STAIRS } from './cave.js'
import { plan, autopilot, decide as decideTick } from './planner.js'

const SIM_MS = 1000 / 60
const CW = 15, CH = 22
const PXW = W * CW
const PXH = H * CH

const TOOLS = ['dig', 'farm', 'rally']
const TOOLCOL = { dig: '#ff7d5d', farm: '#7ddc5d', rally: '#ffd23e' }

let demos = {}
const demoRun = (seed) => {
    if (!demos[seed]) demos[seed] = plan(seed).script
    return demos[seed]
}

const OutpostGame = () => {
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

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.opStage = '1'
        canvas.width = PXW; canvas.height = PXH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        const bg = document.createElement('canvas')
        bg.width = PXW; bg.height = PXH
        const bgx = bg.getContext('2d')
        let bgDirty = true

        let gs = newRun(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, demoSeed = 0
        let toast = 0, toastMsg = ''
        let toolIdx = 0
        let cursor = { x: 12, y: 10 }
        let designTap = null
        const evLog = []

        const say = (m) => { toastMsg = m; toast = 160 }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 300) evLog.splice(0, evLog.length - 300)
            for (const e of evts) {
                if (e.type === 'dig') { bgDirty = true; audioController.playNoise(0.05, 0.035) }
                else if (e.type === 'farm') { bgDirty = true; audioController.playTone(320, 0.05, 'triangle', 0.04) }
                else if (e.type === 'pick') audioController.playTone(520, 0.04, 'square', 0.035)
                else if (e.type === 'ore') { say('ORE HAULED'); audioController.playTone(880, 0.07, 'square', 0.05) }
                else if (e.type === 'eat') audioController.playTone(240, 0.04, 'triangle', 0.03)
                else if (e.type === 'rally') { say('ALL TO THE BEACON'); audioController.playSweep(300, 700, 0.4, 'square', 0.06) }
                else if (e.type === 'descend') { bgDirty = true; demoSeed = gs.baseSeed; audioController.playSweep(600, 120, 0.8, 'sawtooth', 0.08) }
                else if (e.type === 'die') { say('A DWARVE FELL'); audioController.playSweep(200, 60, 0.7, 'sawtooth', 0.09) }
                else if (e.type === 'deny') audioController.playTone(90, 0.07, 'square', 0.05)
                else if (e.type === 'depth') { say(`DEPTH ${e.depth}`); bgDirty = true }
                else if (e.type === 'win') audioController.playSweep(400, 1600, 0.9, 'square', 0.08)
                else if (e.type === 'lose') audioController.playSweep(300, 50, 1.2, 'sawtooth', 0.1)
            }
        }

        const finish = (win) => {
            setEnd({ win, why: gs.endWhy, depth: gs.depth, ore: gs.ore, alive: gs.dwarves.filter((d) => d.alive).length })
            if (win) {
                const best = JSON.parse(localStorage.getItem('outpost.best') || '{}')
                const k = `s${gs.baseSeed}`
                if (!best[k] || gs.tick < best[k]) { best[k] = gs.tick; localStorage.setItem('outpost.best', JSON.stringify(best)) }
            }
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = demoRun(demoSeed)
            if (gs.end || demoAt >= run.length) { demoSeed = (demoSeed + 1) % 4; gs = newRun(demoSeed); demoAt = 0; bgDirty = true }
            doSim(run[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            const inp = {}
            if (designTap) { inp.tool = TOOLS[toolIdx]; inp.designate = [designTap.x, designTap.y]; designTap = null }
            doSim(inp)
        }

        // ---------------------------------------------------------------- paint ----
        const paintBg = () => {
            bgx.fillStyle = '#07080d'
            bgx.fillRect(0, 0, PXW, PXH)
            bgx.font = `${CH - 6}px monospace`
            bgx.textAlign = 'center'
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x
                    const px = x * CW, py = y * CH
                    const t = gs.cave.t[i]
                    if (t === ROCK) {
                        bgx.fillStyle = '#232838'
                        bgx.fillText('#', px + CW / 2, py + CH - 7)
                        if (gs.cave.ore[i]) { bgx.fillStyle = '#d8b23e'; bgx.fillText('%', px + CW / 2, py + CH - 7) }
                    } else {
                        bgx.fillStyle = t === STAIRS ? '#ffd23e' : '#3b3325'
                        bgx.fillText(t === STAIRS ? '>' : '.', px + CW / 2, py + CH - 7)
                    }
                    if (gs.cave.bush[i]) { bgx.fillStyle = '#2f9e44'; bgx.fillText('*', px + CW / 2, py + CH - 7) }
                    if (gs.farm[i] === 1) { bgx.fillStyle = '#3d7a3d'; bgx.fillText(',', px + CW / 2, py + CH - 7) }
                    if (gs.farm[i] === 2) { bgx.fillStyle = '#ffd23e'; bgx.fillText('o', px + CW / 2, py + CH - 7) }
                }
            }
            const [dx, dy] = gs.cave.depot
            bgx.fillStyle = '#4ad7ff'
            bgx.fillText('&', dx * CW + CW / 2, dy * CH + CH - 7)
            bgDirty = false
        }

        const paint = () => {
            if (bgDirty) paintBg()
            ctx.clearRect(0, 0, PXW, PXH)
            ctx.drawImage(bg, 0, 0)
            ctx.font = `bold ${CH - 6}px monospace`
            ctx.textAlign = 'center'
            ctx.fillStyle = '#8f96a8'
            for (const j of gs.jobs) {
                if (j.kind === 'dig') { ctx.fillStyle = '#ff7d5d66'; ctx.fillText('x', j.x * CW + CW / 2, j.y * CH + CH - 7) }
                else if (j.kind === 'farm') { ctx.fillStyle = '#7ddc5d88'; ctx.fillText('"', j.x * CW + CW / 2, j.y * CH + CH - 7) }
            }
            for (const d of gs.dwarves) {
                if (!d.alive) continue
                ctx.fillStyle = d.hunger >= CFG.HUNGER_MAX ? '#ff5d5d' : d.carryFood || d.carryOre ? '#ffd23e' : '#f2f5ff'
                ctx.fillText('@', d.x * CW + CW / 2, d.y * CH + CH - 7)
            }
            if (screenRef.current === 'play') {
                ctx.strokeStyle = gs.tick % 40 < 20 ? '#ffffff' : TOOLCOL[TOOLS[toolIdx]]
                ctx.lineWidth = 1.5
                ctx.strokeRect(cursor.x * CW + 1, cursor.y * CH + 1, CW - 2, CH - 2)
                ctx.lineWidth = 1
                ctx.fillStyle = TOOLCOL[TOOLS[toolIdx]]
                ctx.font = `bold 11px monospace`
                ctx.fillText(TOOLS[toolIdx].toUpperCase(), cursor.x * CW + CW / 2, cursor.y * CH - 2)
            }
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const h = hudRef.current
            if (h.depth) h.depth.textContent = `DEPTH ${gs.depth}/${CFG.MAX_DEPTH}`
            if (h.dwarves) h.dwarves.textContent = `@${gs.dwarves.filter((d) => d.alive).length}/${gs.dwarfCap}`
            if (h.food) h.food.textContent = `FOOD ${gs.food}`
            if (h.ore) h.ore.textContent = `ORE ${gs.ore}`
            if (h.queue) h.queue.textContent = `JOBS ${gs.jobs.length}`
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)   // world-second catch-up cap
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

        const startPlay = (seed = 0) => {
            gs = newRun(seed)
            evLog.length = 0
            toolIdx = 0; designTap = null
            cursor = { x: gs.cave.spawn[0], y: gs.cave.spawn[1] + 1 < H - 1 ? gs.cave.spawn[1] + 1 : gs.cave.spawn[1] }
            demoSeed = seed
            bgDirty = true
            setMode('play')
            say('DIG TO THE BEACON — FEED THE COLONY')
            audioController.playSweep(220, 440, 0.25, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit1') return startPlay(0)
                if (e.code === 'Digit2') return startPlay(1)
                if (e.code === 'Digit3') return startPlay(2)
                if (e.code === 'Digit4') return startPlay(3)
                startPlay(0); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (e.code === 'KeyT') { toolIdx = (toolIdx + 1) % TOOLS.length; audioController.playTone(400 + toolIdx * 60, 0.03, 'square', 0.03); return }
            if (e.code === 'ArrowLeft') cursor.x = Math.max(1, cursor.x - 1)
            if (e.code === 'ArrowRight') cursor.x = Math.min(W - 2, cursor.x + 1)
            if (e.code === 'ArrowUp') cursor.y = Math.max(1, cursor.y - 1)
            if (e.code === 'ArrowDown') cursor.y = Math.min(H - 2, cursor.y + 1)
            if (e.code === 'Space') designTap = { x: cursor.x, y: cursor.y }
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            const r = canvas.getBoundingClientRect()
            if (!r.width || !r.height) return
            const gx = Math.floor(((e.clientX - r.left) / r.width) * W)
            const gy = Math.floor(((e.clientY - r.top) / r.height) * H)
            if (gx >= 0 && gy >= 0 && gx < W && gy < H) { cursor = { x: gx, y: gy }; designTap = { x: gx, y: gy } }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min(r.width / PXW, r.height / PXH)
            canvas.style.width = `${PXW * s}px`
            canvas.style.height = `${PXH * s}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__opTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, depth: gs.depth, seed: gs.baseSeed,
                    dwarves: gs.dwarves.map((d) => ({ id: d.id, x: d.x, y: d.y, act: d.act, kind: d.workKind, hunger: d.hunger, alive: d.alive, carryFood: d.carryFood })),
                    food: gs.food, eaten: gs.eaten, harvested: gs.harvested, rotten: gs.rotten, ore: gs.ore, minedOre: gs.minedOre, dug: gs.dug,
                    jobs: gs.jobs.map((j) => ({ id: j.id, kind: j.kind, x: j.x, y: j.y, claim: j.claim })),
                    rally: gs.rally, end: gs.end, why: gs.endWhy, tool: TOOLS[toolIdx], cursor: { ...cursor },
                    cellAt: (x, y) => { const i = y * W + x; return gs.cave ? { t: gs.cave.t[i], bush: gs.cave.bush[i], ore: gs.cave.ore[i], farm: gs.farm[i] } : null },
                    spawn: gs.cave.spawn, stairs: gs.cave.stairs, depot: gs.cave.depot,
                    evLog: evLog.slice(-140),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                cursorTo: (x, y) => { cursor.x = Math.max(1, Math.min(W - 2, x)); cursor.y = Math.max(1, Math.min(H - 2, y)) },
                setTool: (ti) => { toolIdx = ((ti % TOOLS.length) + TOOLS.length) % TOOLS.length },
                designate: (x, y, ti) => { if (ti !== undefined) toolIdx = ti; designTap = { x, y } },
                ticks: (n) => { for (let k = 0; k < n && !gs.end; k++) doSim({}) },
                drive: (n) => { for (let k = 0; k < n && !gs.end; k++) doSim(decideTick(gs)) },
            }
            exposeGame({
                id: 'outpost',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => startPlay(seed >>> 0),
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    if (pad.left) cursor.x = Math.max(1, cursor.x - 1)
                    if (pad.right) cursor.x = Math.min(W - 2, cursor.x + 1)
                    if (pad.up) cursor.y = Math.max(1, cursor.y - 1)
                    if (pad.down) cursor.y = Math.min(H - 2, cursor.y + 1)
                    if (pad.b) toolIdx = (toolIdx + 1) % TOOLS.length
                    if (pad.a) designTap = { x: cursor.x, y: cursor.y }
                    const inp = {}
                    if (designTap) { inp.tool = TOOLS[toolIdx]; inp.designate = [designTap.x, designTap.y]; designTap = null }
                    doSim(inp)
                },
                state: () => ({
                    tick: gs.tick, score: gs.ore, done: !!gs.end,
                    seed: gs.baseSeed, depth: gs.depth, food: gs.food, dug: gs.dug,
                    dwarves: gs.dwarves.filter((d) => d.alive).length,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
            })
            mountDbg({
                title: 'OUTPOST',
                getState: () => [
                    `depth ${gs.depth}/${CFG.MAX_DEPTH}  dwarves ${gs.dwarves.filter((d) => d.alive).length}/${gs.dwarfCap}  food ${gs.food}  ore ${gs.ore}`,
                    `jobs ${gs.jobs.length} (${gs.jobs.map((j) => j.kind).join(',')})  dug ${gs.dug}  eaten ${gs.eaten}  rotten ${gs.rotten}  rally ${gs.rally ? 'YES' : 'no'}`,
                    `tool ${TOOLS[toolIdx]}  cursor ${cursor.x},${cursor.y}  tick ${gs.tick}  end ${gs.end || '-'} ${gs.endWhy || ''}`,
                    gs.dwarves.map((d) => `  dwarf ${d.id} ${d.alive ? `${d.act}/${d.workKind || '-'} @${d.x},${d.y} hunger ${d.hunger}/${CFG.HUNGER_MAX}${d.carryFood ? ` carry ${d.carryFood}` : ''}` : 'DEAD'}`).join('\n'),
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = structuredClone(gs)
                            sim.events = []
                            autopilot(sim, 60 * 60 * 6)
                            return sim.end === 'win'
                                ? `WINNABLE: a fresh autopilot drives THIS exact state to the beacon with ${sim.dwarves.filter((d) => d.alive).length} dwarves in ${(sim.tick - gs.tick) / 60 | 0}s`
                                : `NOT WINNABLE from here: ${sim.end || 'stalled'}`
                        },
                    },
                    { label: 'DROP RATIONS -3', run: () => { const n = Math.min(gs.food, 3); gs.food -= n; return `-${n} food from the depot (hunger is a clock, the ledger will notice)` } },
                    { label: 'STARVE A DWARF', run: () => {
                        const d = gs.dwarves.find((dd) => dd.alive)
                        if (!d) return 'none alive'
                        d.hunger = CFG.HUNGER_MAX; d.starve = CFG.STARVE_MAX - 1
                        return `dwarf ${d.id} is one tick from the end — watch the claim return to the queue`
                    } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__opTest) delete window.__opTest; unmountDbg(); unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
            bg.width = 0; bg.height = 0
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('depth')} className="border border-yellow-300/60 text-yellow-200 px-2 py-0.5 rounded bg-black/40">DEPTH 1/3</span>
                    <span ref={setHud('dwarves')} className="text-blue-200">@4/4</span>
                    <span ref={setHud('food')} className="text-green-300">FOOD 6</span>
                    <span ref={setHud('ore')} className="text-amber-300">ORE 0</span>
                    <span ref={setHud('queue')} className="text-red-300/90">JOBS 0</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#ffe9a3', textShadow: '3px 0 0 #4ad7ff, -3px 0 0 #ff7d5d, 0 10px 24px #000' }}>OUTPOST</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm">you are the foreman. the dwarves decide the rest.</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY — 1 · 2 · 3 · 4 PICK A DEPTH SEED</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        dig through rock with x designations — the tunnel follows the shortest seam to the beacon &gt;<br />
                        farms , ripen to o; ripe plots and bushes * summon pickers; hauls feed the depot &amp;<br />
                        dwarves eat on a hunger clock — an empty depot and no food ends a dwarf, and their job returns to the queue<br />
                        T or B cycles tool: DIG / FARM / RALLY — rally stands every dwarf on the stairs to descend<br />
                        three depths alive wins; the demo is the autopilot&apos;s own proven run
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'BEACON LIT' : 'THE OUTPOST FELL SILENT'}</h2>
                    <p className="text-lg mb-1">{end.win ? `${end.alive} dwarves reached depth 3` : `${end.why} on depth ${end.depth}`}</p>
                    <p className="text-sm text-amber-200/80 mb-4">ore {end.ore} · every ledger unit accounted for: the same sim, the same jobs, the same dice</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'OUTPOST')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default OutpostGame

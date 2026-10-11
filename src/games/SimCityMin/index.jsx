// SIMCITY-MIN — the arcade shell. The city is the pure sim in ./sim.js:
// power rides the road graph, residents follow jobs, fires and a tornado are
// scripted by ./scen.js, and the attract demo replays the autopilot's OWN
// proven run (./planner.js) tick for tick through the real step().
//
// Layout: 1. proven demos 2. painters 3. fixed-timestep loop (250 ms
// catch-up cap — the heist lesson) 4. input (cursor + tool + tap-to-place)
// 5. DEV hook + DebugKit 6. React + HUD. Every pixel the brush paints is a
// cell the sim already owns: the cursor maps pointer px to grid x,y at 1:1
// through TILE, and scripts/cityplay.mjs samples exactly that.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, T, newCity, step, stateHash, litSet } from './sim.js'
import { W, H, SCEN } from './scen.js'
import { plan } from './planner.js'

const SIM_MS = 1000 / 60
const TILE = 28
const PXW = W * TILE
const PXH = H * TILE

const TOOLCOLS = ['#9aa0ad', '#ffd23e', '#57c95e', '#4aa3ff', '#d07a3a', '#3fae6b', '#ff5d5d', '#c8b89a']
const TOOLNAMES = ['ROAD', 'PLANT', 'RES', 'COM', 'IND', 'PARK', 'FIRE', 'DOZE']
const TOOLTIPS = [CFG.cost.road, CFG.cost.plant, CFG.cost.res, CFG.cost.com, CFG.cost.ind, CFG.cost.park, CFG.cost.fire, CFG.cost.doze]
const TOOLVALS = [T.ROAD, T.PLANT, T.RES, T.COM, T.IND, T.PARK, T.FIRE, 'doze']

let demos = {}
const demoRun = (sc) => {
    if (!demos[sc]) demos[sc] = plan(sc).script
    return demos[sc]
}

const hashNoise = (x, y) => ((x * 7 + y * 13 + ((x * y) % 5)) % 3)

const SimCityMinGame = () => {
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
        canvas.dataset.scStage = '1'
        canvas.width = PXW; canvas.height = PXH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = newCity(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, demoSc = 0
        let toast = 0, toastMsg = ''
        let toolIdx = 0
        let placeTap = false
        let taxDirty = null
        let parts = []
        const evLog = []

        const say = (m) => { toastMsg = m; toast = 150 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.6 + ((i * 7) % 10) / 5
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'place') audioController.playTone(e.t === T.ROAD ? 200 : 300 + e.t * 40, 0.04, 'square', 0.04)
                else if (e.type === 'deny') audioController.playTone(90, 0.08, 'square', 0.05)
                else if (e.type === 'doze') audioController.playNoise(0.05, 0.04)
                else if (e.type === 'fire') { say(`FIRE AT ${e.x},${e.y}`); audioController.playSweep(320, 90, 0.5, 'sawtooth', 0.08); burst(e.x * TILE + 14, e.y * TILE + 14, 14, '#ff7d3d') }
                else if (e.type === 'spread') { burst(e.x * TILE + 14, e.y * TILE + 14, 6, '#ffb37a') }
                else if (e.type === 'doused') { say('FIRE Doused'); audioController.playTone(660, 0.1, 'triangle', 0.05) }
                else if (e.type === 'ash') { audioController.playNoise(0.12, 0.06) }
                else if (e.type === 'tornado') { say('TORNADO'); audioController.playSweep(80, 400, 0.7, 'sawtooth', 0.1) }
                else if (e.type === 'wreck') { audioController.playNoise(0.08, 0.07); burst(e.x * TILE + 14, e.y * TILE + 14, 8, '#c8b89a') }
                else if (e.type === 'year') {
                    audioController.playTone(e.delta >= 0 ? 520 : 160, 0.03, 'square', 0.02)
                    if (e.year === 5) say(`${SCEN[gs.sc].target} RESIDENTS BY YEAR ${SCEN[gs.sc].deadline}`)
                } else if (e.type === 'win') audioController.playSweep(400, 1600, 0.9, 'square', 0.08)
                else if (e.type === 'lose') audioController.playSweep(300, 60, 1.1, 'sawtooth', 0.1)
            }
        }

        const finish = (win) => {
            setEnd({ win, why: gs.endWhy, year: gs.year, pop: gs.pop, funds: gs.funds, score: gs.score })
            if (win) {
                const best = JSON.parse(localStorage.getItem('simcitymin.best') || '{}')
                const k = `s${gs.sc}`
                if (!best[k] || gs.year < best[k]) { best[k] = gs.year; localStorage.setItem('simcitymin.best', JSON.stringify(best)) }
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
            const run = demoRun(demoSc)
            if (gs.end || demoAt >= run.length) { demoSc = (demoSc + 1) % SCEN.length; gs = newCity(demoSc); demoAt = 0 }
            doSim(run[demoAt++])
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            const inp = {}
            if (taxDirty !== null) { inp.tax = taxDirty; taxDirty = null }
            if (placeTap) { inp.tool = TOOLVALS[toolIdx]; inp.place = [gs.cursor.x, gs.cursor.y]; placeTap = false }
            doSim(inp)
        }

        // ---------------------------------------------------------------- paint ----
        const drawCell = (x, y, c, tk, lit) => {
            const px = x * TILE, py = y * TILE
            if (c.t === T.WATER) {
                ctx.fillStyle = hashNoise(x, y) === 1 ? '#1e5279' : '#1a4668'
                ctx.fillRect(px, py, TILE, TILE)
                if ((x + y + Math.floor(tk / 30)) % 7 === 0) { ctx.fillStyle = '#3f7fae'; ctx.fillRect(px + 6, py + 12, 10, 2) }
                return
            }
            if (c.t === T.ROCK) {
                ctx.fillStyle = '#4c4c58'; ctx.fillRect(px, py, TILE, TILE)
                ctx.fillStyle = '#5f5f6d'; ctx.fillRect(px + 4, py + 4, TILE - 10, TILE - 12)
                return
            }
            ctx.fillStyle = c.scar > 0 ? '#2a2620' : ['#1f3d20', '#234522', '#1c381d'][hashNoise(x, y)]
            ctx.fillRect(px, py, TILE, TILE)
            if (c.scar > 0) { ctx.fillStyle = '#4a4034'; ctx.fillRect(px + 6, py + TILE - 8, 3, 4); ctx.fillRect(px + 16, py + TILE - 6, 2, 3) }
            if (c.t === T.ROAD) {
                ctx.fillStyle = '#3b3b45'; ctx.fillRect(px, py, TILE, TILE)
                ctx.fillStyle = lit ? '#6f6a3a' : '#54545e'
                ctx.fillRect(px + TILE / 2 - 1, py + 2, 2, 6); ctx.fillRect(px + TILE / 2 - 1, py + TILE - 8, 2, 6)
            } else if (c.t === T.PARK) {
                ctx.fillStyle = '#2c6b3a'; ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6)
                ctx.fillStyle = '#57c95e'; ctx.fillRect(px + 8, py + 6, 8, 10)
                ctx.fillStyle = '#7a5a3a'; ctx.fillRect(px + 11, py + 16, 2, 6)
            } else if (c.t === T.PLANT) {
                ctx.fillStyle = '#4d4436'; ctx.fillRect(px + 3, py + 5, TILE - 6, TILE - 9)
                ctx.fillStyle = tk % 40 < 20 ? '#ffd23e' : '#ffb32e'
                ctx.fillRect(px + 8, py + 2, 5, 5); ctx.fillRect(px + 16, py + 3, 4, 4)
                ctx.fillStyle = '#8f2f2f'; ctx.fillRect(px + 6, py + TILE - 8, TILE - 12, 4)
            } else if (c.t === T.FIRE) {
                ctx.fillStyle = '#8f2f2f'; ctx.fillRect(px + 4, py + 8, TILE - 8, TILE - 12)
                ctx.fillStyle = '#f2f2f2'; ctx.fillRect(px + 12, py + 10, 4, 10); ctx.fillRect(px + 9, py + 13, 10, 4)
            } else if (T.RES <= c.t && c.t <= T.IND) {
                const base = ['#3a5a6b', '#274a5e', '#33465e', '#1e3a4e'][Math.min(3, c.lvl)]
                ctx.fillStyle = base; ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6)
                const col = c.t === T.RES ? '#57c95e' : c.t === T.COM ? '#4aa3ff' : '#d07a3a'
                const h = 4 + c.lvl * 4
                ctx.fillStyle = col
                ctx.fillRect(px + 5, py + TILE - 4 - h, 7, h)
                ctx.fillRect(px + 15, py + TILE - 4 - Math.max(3, h - 3), 7, Math.max(3, h - 3))
                ctx.fillStyle = '#0d1a12'
                for (let k = 0; k < c.lvl; k++) { ctx.fillRect(px + 6, py + TILE - 8 - k * 4, 2, 2); ctx.fillRect(px + 16, py + TILE - 8 - k * 4, 2, 2) }
            }
            if (c.burn) {
                ctx.fillStyle = (x + y + Math.floor(tk / 4)) % 2 ? '#ff7d3d' : '#ffcf3d'
                const f = 4 + ((x * 3 + tk) % 5)
                ctx.fillRect(px + 6, py + TILE - 6 - f, 6, f); ctx.fillRect(px + 15, py + TILE - 4 - f, 5, f)
            }
        }

        const paint = () => {
            const tk = gs.tick
            const lit = litSet(gs)
            ctx.fillStyle = '#0c1410'
            ctx.fillRect(0, 0, PXW, PXH)
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawCell(x, y, gs.grid[y * W + x], tk, lit.has(y * W + x))
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy
                if (p.t > 30) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 30; ctx.fillStyle = p.col
                ctx.fillRect(p.x, p.y, 2.5, 2.5)
            }
            ctx.globalAlpha = 1
            if (screenRef.current === 'play') {
                const { x, y } = gs.cursor
                ctx.strokeStyle = tk % 36 < 18 ? '#ffffff' : TOOLCOLS[toolIdx]
                ctx.lineWidth = 2
                ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2)
                ctx.lineWidth = 1
                ctx.font = 'bold 11px monospace'
                ctx.fillStyle = TOOLCOLS[toolIdx]
                ctx.fillText(TOOLNAMES[toolIdx], x * TILE + 2, y * TILE - 3)
            }
            const barH = 18
            ctx.fillStyle = 'rgba(0,0,0,0.55)'
            ctx.fillRect(0, PXH - barH, PXW, barH)
            ctx.font = 'bold 11px monospace'
            TOOLNAMES.forEach((nm, i) => {
                const bx = 6 + i * 56
                ctx.fillStyle = i === toolIdx && screenRef.current === 'play' ? TOOLCOLS[i] : '#5b6270'
                ctx.fillText(nm, bx, PXH - 6)
                if (i === toolIdx && screenRef.current === 'play') { ctx.fillRect(bx - 3, PXH - 16, 50, 2) }
            })
            ctx.fillStyle = '#c9d2e3'
            ctx.fillText(`TAX ${gs.tax}%`, PXW - 60, PXH - 6)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const h = hudRef.current
            const S = SCEN[gs.sc]
            if (h.pop) h.pop.textContent = `${gs.pop}/${S.target}`
            if (h.funds) h.funds.textContent = `$${gs.funds}`
            if (h.year) h.year.textContent = `Y${gs.year}/${S.deadline}`
            if (h.jobs) h.jobs.textContent = `J ${gs.jobs}`
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

        const startPlay = (sc = 0) => {
            gs = newCity(sc)
            evLog.length = 0; parts = []
            toolIdx = 0; placeTap = false; taxDirty = null
            setMode('play')
            say(SCEN[sc].blurb.toUpperCase())
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
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
                startPlay(0); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (e.code === 'KeyT') { toolIdx = (toolIdx + 1) % TOOLVALS.length; audioController.playTone(400 + toolIdx * 40, 0.03, 'square', 0.03); return }
            if (e.code === 'BracketLeft') { taxDirty = Math.max(0, gs.tax - 1); return }
            if (e.code === 'BracketRight') { taxDirty = Math.min(CFG.taxMax, gs.tax + 1); return }
            if (e.code === 'ArrowLeft') step(gs, { cursor: [gs.cursor.x - 1, gs.cursor.y] }); gs.events.splice(0)
            if (e.code === 'ArrowRight') step(gs, { cursor: [gs.cursor.x + 1, gs.cursor.y] }); gs.events.splice(0)
            if (e.code === 'ArrowUp') step(gs, { cursor: [gs.cursor.x, gs.cursor.y - 1] }); gs.events.splice(0)
            if (e.code === 'ArrowDown') step(gs, { cursor: [gs.cursor.x, gs.cursor.y + 1] }); gs.events.splice(0)
            if (e.code === 'Space') placeTap = true
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
            if (gy < H) { gs.cursor.x = Math.max(0, Math.min(W - 1, gx)); gs.cursor.y = Math.max(0, Math.min(H - 1, gy)); placeTap = true }
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
            window.__scTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, year: gs.year, pop: gs.pop, jobs: gs.jobs,
                    funds: gs.funds, tax: gs.tax, score: gs.score, end: gs.end, why: gs.endWhy,
                    tool: TOOLNAMES[toolIdx], cursor: { ...gs.cursor }, sc: gs.sc,
                    lit: litSet(gs).size,
                    burning: gs.grid.map((c, i) => (c.burn > 0 ? [i % W, (i - (i % W)) / W] : null)).filter(Boolean),
                    cellAt: (x, y) => { const c = gs.grid[y * W + x]; return c ? { t: c.t, lvl: c.lvl, burn: c.burn, scar: c.scar } : null },
                    evLog: evLog.slice(-120),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setTool: (i) => { toolIdx = ((i % TOOLVALS.length) + TOOLVALS.length) % TOOLVALS.length },
                cursorTo: (x, y) => { gs.cursor.x = Math.max(0, Math.min(W - 1, x)); gs.cursor.y = Math.max(0, Math.min(H - 1, y)) },
                place: (x, y, ti) => { if (ti !== undefined) toolIdx = ti; gs.cursor.x = x; gs.cursor.y = y; placeTap = true },
                years: (n) => { for (let k = 0; k < n * CFG.yearTicks && !gs.end; k++) doSim({}) },
            }
            mountDbg({
                title: 'SIMCITY-MIN',
                getState: () => [
                    `${SCEN[gs.sc].name}  Y${gs.year}/${SCEN[gs.sc].deadline}  pop ${gs.pop}/${SCEN[gs.sc].target}  jobs ${gs.jobs}  tax ${gs.tax}%`,
                    `funds $${gs.funds}  in $${gs.income}  out $${gs.expense}  score ${gs.score}  tool ${TOOLNAMES[toolIdx]}`,
                    `cursor ${gs.cursor.x},${gs.cursor.y}  lit ${litSet(gs).size}  fires ${gs.grid.filter((c) => c.burn).length}  scars ${gs.grid.filter((c) => c.scar).length}`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end} ${gs.endWhy || ''}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = structuredClone(gs)
                            sim.events = []
                            return `the planner already drove this scenario to ${plan(gs.sc).ok ? `VICTORY by year ${plan(gs.sc).receipts.year}` : 'a loss'} from a cold start of the same map — grid ${gs.tick}/${SCEN[gs.sc].deadline * CFG.yearTicks}`
                        },
                    },
                    { label: 'BAIL OUT +500', run: () => { gs.funds += 500; return '+$500 (the ledger remembers: score = income, not grants)' } },
                    { label: 'IGNITE A FIELD', run: () => {
                        const i = gs.grid.findIndex((c) => c.t >= T.RES && c.t <= T.IND)
                        if (i < 0) return 'no zone burns yet — build something first'
                        gs.grid[i].burn = CFG.fireYears
                        return `fire in the district at ${i % W},${(i - (i % W)) / W}`
                    } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__scTest) delete window.__scTest; unmountDbg() }
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

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('pop')} className="border border-green-300/60 text-green-200 px-2 py-0.5 rounded bg-black/40">0/420</span>
                    <span ref={setHud('funds')} className="text-yellow-200">$1200</span>
                    <span ref={setHud('year')} className="text-cyan-200">Y0/45</span>
                    <span ref={setHud('jobs')} className="text-orange-200/90">J 0</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#8fff9f', textShadow: '3px 0 0 #39d2ff, -3px 0 0 #ff7d3d, 0 10px 24px #000' }}>SIMCITY-MIN</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm">roads conduct the grid. jobs summon the people.</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY — 1 · 2 · 3 PICK A MAP</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        streets first — power only travels the road graph, so every district needs a wire to a plant<br />
                        residents follow jobs: zone RES next to IND/COM, or the census stays empty<br />
                        T or B cycles tools; [ and ] steer the tax; tap places right under the cursor<br />
                        the script lights real fires and walks a tornado — stations douse, ash remembers its zone<br />
                        hit the charter population before the deadline; the demo is the autopilot&apos;s own proven run
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'CITY CHARTER EARNED' : 'THE CITY STALLED'}</h2>
                    <p className="text-lg mb-1">{end.win ? `chartered at ${end.pop} by year ${end.year}` : `${end.why} — ${end.pop} residents by year ${end.year}`}</p>
                    <p className="text-sm text-amber-200/80 mb-4">funds ${end.funds} · score {end.score}</p>
                    <p className="text-xs text-amber-100/70 mb-4">every dollar: the city planner that proved this map winnable ended with a ledger exact to the cent — the city played here is the same engine</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SIMCITY-MIN')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'TOOL', code: 'KeyT' }} />
        </div>
    )
}

export default SimCityMinGame

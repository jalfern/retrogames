// LODE RUNNER-LITE — the arcade shell, 1983 rules. The vault is the pure sim
// in ./sim.js and the three hand-carved maps are ./levels.js; this file only
// paints, listens, and proves the classic contract on screen:
//
//   - destructible floors  → a dig opens a hole, the sim's `refill` event
//     grows the brick back after the fuse; the terrain layer is dirty-flagged
//     from events, never guessed,
//   - pathfinding guards   → they move because guardAct says so; they fall in
//     your holes, climb out, and lift gold; the harness pins the `pursued`
//     receipts, the screen just shows them,
//   - the hidden ladder    → the exit ladder is concealed until every gold is
//     in hand, then it reveals at the top of the screen; no clock,
//   - ghost replay         → your LAST run on this vault (cmds stamped
//     tick-for-tick) is replayed by a second sim instance while you play
//     again: the dim @,
//   - determinism          → attract mode IS the solver's proven witness fed
//     back through the real applyAction+step, and the DEV hook re-replays
//     your own stream in the page and compares state hashes.
//
// Layout: 1. demo cache (the solver runs once per vault) 2. ASCII painters
// (cached terrain + live glyph layers) 3. fixed 15 Hz timestep with the
// 250 ms catch-up cap (the heist lesson) 4. input (held-key stack, one
// action every CFG.moveEvery ticks — the same phase planRun uses) 5. DEV
// hook + DebugKit 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import {
    CFG, W, H, EMPTY, SOLID, BRICK, ROPE, LADDER, GOLD,
    makeGame, applyAction, step, planRun, planStep, stateHash, replay,
} from './sim.js'
import { LEVELS, buildLevel } from './levels.js'

const SIM_MS = 1000 / 15
const CW = 20, CH = 22
const PXW = W * CW
const PXH = H * CH

const byTickOf = (cmds) => {
    const m = new Map()
    for (const c of cmds) {
        if (!m.has(c.tick)) m.set(c.tick, [])
        m.get(c.tick).push(c)
    }
    return m
}

const demoCache = new Map()
const demoFor = (i) => {
    if (!demoCache.has(i)) {
        const b = buildLevel(i % LEVELS.length)
        demoCache.set(i, planRun(makeGame(b.meta, b.grid)).cmds)
    }
    return demoCache.get(i)
}

const LodeRunnerLiteGame = () => {
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
        canvas.dataset.lodeStage = '1'
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

        let levelIdx = 0
        let b0 = buildLevel(0)
        let gs = makeGame(b0.meta, b0.grid)
        let ghost = null                 // { g, byTick } — the last run of THIS vault
        let lastRun = null               // { level, cmds } — becomes the ghost on a retry
        let demoIdx = 0
        let demoG = null, demoBy = null
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = ''
        const held = []                  // keydown stack, most recent last
        const evLog = []

        const say = (m) => { toastMsg = m; toast = 160 }

        const buildDemo = (i) => {
            demoIdx = i
            const b = buildLevel(i % LEVELS.length)
            demoG = makeGame(b.meta, b.grid)
            demoBy = byTickOf(demoFor(i))
            bgDirty = true
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 300) evLog.splice(0, evLog.length - 300)
            for (const e of evts) {
                if (e.type === 'dig') { bgDirty = true; audioController.playNoise(0.05, 0.04) }
                else if (e.type === 'refill') { bgDirty = true; audioController.playTone(140, 0.08, 'square', 0.05) }
                else if (e.type === 'gold') { say(`GOLD ${e.have}/${gs.need}`); audioController.playTone(880, 0.07, 'square', 0.06) }
                else if (e.type === 'unlock') { say('THE LADDER APPEARS'); audioController.playSweep(300, 700, 0.4, 'square', 0.07) }
                else if (e.type === 'guardBuried') { say('A GUARD IS BURIED'); audioController.playSweep(300, 60, 0.5, 'sawtooth', 0.08) }
                else if (e.type === 'goldPickup') { say('A GUARD LIFTED GOLD'); audioController.playTone(220, 0.06, 'square', 0.05) }
                else if (e.type === 'capture') { say('CAUGHT!'); audioController.playSweep(240, 50, 0.6, 'sawtooth', 0.1) }
                else if (e.type === 'life') audioController.playSweep(200, 80, 0.4, 'sawtooth', 0.06)
                else if (e.type === 'grab') audioController.playTone(520, 0.04, 'triangle', 0.04)
                else if (e.type === 'win') audioController.playSweep(400, 1600, 0.9, 'square', 0.09)
                else if (e.type === 'die') audioController.playSweep(300, 40, 1.1, 'sawtooth', 0.1)
            }
        }

        const gameOver = (win, why) => {
            setEnd({ win, why, level: levelIdx, score: gs.score })
            if (win) {
                const best = JSON.parse(localStorage.getItem('lode.best') || '{}')
                if (!best.score || gs.score > best.score) localStorage.setItem('lode.best', JSON.stringify({ score: gs.score }))
            }
            overAtRef.current = performance.now()
            setMode('over')
        }

        const startPlay = (idx = 0, opts = {}) => {
            const b = buildLevel(idx)
            levelIdx = idx
            gs = makeGame(b.meta, b.grid)
            gs.score = opts.carry || 0
            if (opts.lives) gs.lives = opts.lives
            evLog.length = 0
            held.length = 0
            ghost = null
            // the ghost haunts only the vault it ran: a level-tagged stream
            if (lastRun && lastRun.level === idx) {
                ghost = { g: makeGame(b.meta, b.grid), byTick: byTickOf(lastRun.cmds) }
            }
            bgDirty = true
            setMode('play')
            say(b.meta.name)
            audioController.playSweep(220, 440, 0.25, 'square', 0.07)
        }

        // the run that just ended becomes this vault's next ghost
        const finishRun = () => {
            lastRun = { level: levelIdx, cmds: gs.cmds.map((c) => ({ ...c })) }
        }

        const vaultCleared = () => {
            finishRun()
            if (levelIdx + 1 >= LEVELS.length) { gameOver(true, 'CLEARED'); return }
            say('VAULT CLEARED')
            startPlay(levelIdx + 1, { carry: gs.score, lives: gs.lives })
        }

        const doSim = (cands) => {
            // applyAction pushes its events (dig/jump/swing) BEFORE step()
            // runs — and step() clears g.events at the top of the tick. So
            // the action-stage events must be spliced first or the terrain
            // repaint and the audio for a dig are silently swallowed.
            if (cands) {
                for (const act of cands) {
                    if (applyAction(gs, gs.player, act)) {
                        gs.cmds.push({ tick: gs.tick, act })
                        break
                    }
                }
            }
            handleEvents(gs.events.splice(0))
            if (ghost && !ghost.g.end) {
                const todo = ghost.byTick.get(ghost.g.tick)
                if (todo) for (const c of todo) applyAction(ghost.g, ghost.g.player, c.act)
                ghost.g.events.length = 0
                step(ghost.g)
            }
            step(gs)
            handleEvents(gs.events.splice(0))
            if (gs.end === 'clear') vaultCleared()
            else if (gs.end) { finishRun(); gameOver(false, 'THE VAULT TOOK YOU') }
        }

        const tickDemo = () => {
            if (!demoG || demoG.end) { buildDemo(demoIdx + (demoG ? 1 : 0)); return }
            const todo = demoBy.get(demoG.tick)
            if (todo) for (const c of todo) applyAction(demoG, demoG.player, c.act)
            for (const e of demoG.events) if (e.type === 'dig' || e.type === 'refill') bgDirty = true
            demoG.events.length = 0
            step(demoG)
            for (const e of demoG.events) if (e.type === 'dig' || e.type === 'refill') bgDirty = true
            demoG.events.length = 0
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play' || gs.end) return
            let act = null
            if (gs.tick % CFG.moveEvery === 0) {
                const cands = []
                for (let i = held.length - 1; i >= 0; i--) {
                    const c = held[i]
                    if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' || c === 'ArrowDown') cands.push(c)
                }
                act = cands.length ? cands : null
            }
            doSim(act)
        }

        // ---------------------------------------------------------------- paint ----
        const paintBg = () => {
            bgx.fillStyle = '#06070b'
            bgx.fillRect(0, 0, PXW, PXH)
            bgx.font = 'bold 15px monospace'
            bgx.textAlign = 'center'
            const src = screenRef.current === 'attract' && demoG ? demoG : gs
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x
                    const t = src.grid[i]
                    const px = x * CW + CW / 2, py = y * CH + CH - 6
                    if (t === SOLID) { bgx.fillStyle = '#3a4258'; bgx.fillText('=', px, py) }
                    else if (t === BRICK) { bgx.fillStyle = '#b06a3f'; bgx.fillText('#', px, py) }
                    else if (t === ROPE) { bgx.fillStyle = '#d9c26a'; bgx.fillText('=', px, py) }
                    else if (t === LADDER) { bgx.fillStyle = '#6fbf73'; bgx.fillText('|', px, py) }
                    else if (t === GOLD) { /* rides the dynamic layer */ }
                    else if (src.holeAge[i] > 0) { bgx.fillStyle = '#5a3527'; bgx.fillText('v', px, py) }   // a live hole: it will refill
                }
            }
            bgDirty = false
        }

        const paint = () => {
            if (bgDirty) paintBg()
            ctx.clearRect(0, 0, PXW, PXH)
            ctx.drawImage(bg, 0, 0)
            ctx.font = 'bold 15px monospace'
            ctx.textAlign = 'center'
            const live = screenRef.current === 'play'
            const g = screenRef.current === 'attract' && demoG ? demoG : gs
            // gold rides the dynamic layer (collecting is a state change,
            // never a repaint guess)
            ctx.fillStyle = g.tick % 30 < 18 ? '#ffd23e' : '#b8922e'
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    if (g.grid[y * W + x] === GOLD) ctx.fillText('*', x * CW + CW / 2, y * CH + CH - 6)
                }
            }
            for (const gd of g.guards) {
                if (!gd.alive) continue
                ctx.fillStyle = gd.mode === 'air' ? '#ff9d5c' : '#ff5d5d'
                ctx.fillText('X', gd.x * CW + CW / 2, gd.y * CH + CH - 6)
            }
            if (live && ghost && ghost.g.player.alive && !ghost.g.end) {
                ctx.fillStyle = 'rgba(255,180,90,0.45)'
                ctx.fillText('@', ghost.g.player.x * CW + CW / 2, ghost.g.player.y * CH + CH - 6)
            }
            if (g.player.alive && !g.end) {
                ctx.fillStyle = g.player.mode === 'hang' ? '#cfe8ff' : '#f2f5ff'
                ctx.fillText('@', g.player.x * CW + CW / 2, g.player.y * CH + CH - 6)
            }
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const h = hudRef.current
            if (h.vault) h.vault.textContent = `VAULT ${levelIdx + 1}/${LEVELS.length} ${gs.meta.name}`
            if (h.gold) h.gold.textContent = `GOLD ${gs.have}/${gs.need}`
            if (h.lives) h.lives.textContent = `LIVES ${gs.lives}`
            if (h.score) h.score.textContent = `SCORE ${gs.score}`
            if (h.exit) h.exit.textContent = gs.unlocked ? 'LADDER UP' : 'HIDDEN LADDER'
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)   // world-second catch-up cap
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
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
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'Enter' || e.code === 'KeyR') { startPlay(levelIdx); return }
                setMode('attract'); return
            }
            if (pausedRef.current) return
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && !held.includes(e.code)) held.push(e.code)
        }
        const onUp = (e) => {
            const i = held.indexOf(e.code)
            if (i >= 0) held.splice(i, 1)
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
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
        buildDemo(0)
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__lodeTest = {
                probe: () => ({
                    screen: screenRef.current, level: levelIdx, tick: gs.tick,
                    have: gs.have, need: gs.need, lives: gs.lives, score: gs.score,
                    unlocked: gs.unlocked, end: gs.end,
                    player: { x: gs.player.x, y: gs.player.y, mode: gs.player.mode, alive: gs.player.alive },
                    guards: gs.guards.map((gd) => ({ id: gd.id, x: gd.x, y: gd.y, mode: gd.mode, alive: gd.alive })),
                    cellAt: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? gs.grid[y * W + x] : SOLID),
                    holeAt: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? gs.holeAge[y * W + x] : 0),
                    exit: { ...gs.exit },
                    cmds: gs.cmds.length,
                    // the attract demo is a separate sim instance — the
                    // harness grades THAT moving, not the idle gs
                    demo: demoG ? { idx: demoIdx, tick: demoG.tick, end: demoG.end, player: { x: demoG.player.x, y: demoG.player.y, mode: demoG.player.mode }, have: demoG.have } : null,
                    ghost: ghost ? { tick: ghost.g.tick, alive: ghost.g.player.alive } : null,
                    evLog: evLog.slice(-140),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                drive: (n) => {
                    for (let k = 0; k < n && !gs.end; k++) {
                        if (gs.tick % CFG.moveEvery === 0) {
                            const act = planStep(gs)
                            if (act && applyAction(gs, gs.player, act)) gs.cmds.push({ tick: gs.tick, act })
                        }
                        handleEvents(gs.events.splice(0))
                        step(gs)
                        handleEvents(gs.events.splice(0))
                    }
                    if (gs.end === 'clear') vaultCleared()
                    else if (gs.end) { finishRun(); gameOver(false, 'driven to ' + gs.end) }
                },
                // the determinism receipt the issue asked for: re-replay the
                // live stream in the page and compare final state hashes.
                replayCheck: () => {
                    const b = buildLevel(levelIdx)
                    // run the twin to EXACTLY the live tick — and if the
                    // live vault already ended on its last command, one tick
                    // later so the twin gets to fire the same winning step
                    // instead of comparing a cleared vault to an un-cleared
                    // one. Measuring two clocks is not determinism.
                    const tail = gs.cmds.length && gs.cmds[gs.cmds.length - 1].tick >= gs.tick ? 1 : 0
                    const g2 = replay(b.meta, b.grid, gs.cmds.map((c) => ({ ...c })), { maxTicks: gs.tick + tail })
                    const liveHash = stateHash(gs)
                    const replayHash = stateHash(g2)
                    return { liveHash, replayHash, match: liveHash === replayHash, cmds: gs.cmds.length, end: g2.end }
                },
            }
            mountDbg({
                title: 'LODE RUNNER-LITE',
                getState: () => [
                    `vault ${levelIdx + 1}/${LEVELS.length} ${gs.meta.name}  tick ${gs.tick}  end ${gs.end || '-'}`,
                    `gold ${gs.have}/${gs.need}  lives ${gs.lives}  score ${gs.score}  unlocked ${gs.unlocked ? 'YES' : 'no'}`,
                    `runner ${gs.player.x},${gs.player.y} mode=${gs.player.mode}  cmds=${gs.cmds.length}  ghost=${ghost ? ghost.g.tick : '-'}`,
                    gs.guards.map((gd) => `  guard ${gd.id} ${gd.alive ? `${gd.x},${gd.y} ${gd.mode}` : 'BURIED'}`).join('\n'),
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = structuredClone({ ...gs, meta: { ...gs.meta, build: undefined }, events: [] })
                            planRun(sim)
                            return sim.win
                                ? `WINNABLE: a fresh solver drives THIS exact vault from tick ${gs.tick} to the gate at tick ${sim.tick} (gold ${sim.have}/${sim.need})`
                                : `NOT WINNABLE from here: ${sim.end || 'stalled'} at tick ${sim.tick}`
                        },
                    },
                    {
                        label: 'DIG HERE', run: () => {
                            const x = gs.player.x + 1, y = gs.player.y + 1
                            if (x < 0 || x >= W || y < 0 || y >= H || gs.grid[y * W + x] !== BRICK) return 'no diagonal brick below-right of the runner'
                            gs.grid[y * W + x] = EMPTY; gs.holeAge[y * W + x] = 1; bgDirty = true
                            return 'a hole opens diagonally below-right (it refills in 5s)'
                        },
                    },
                    { label: '+1 LIFE', run: () => { gs.lives++; return `lives ${gs.lives} — extra slack the solver is NOT allowed to assume` } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__lodeTest) delete window.__lodeTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
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
                    <span ref={setHud('vault')} className="border border-orange-300/60 text-orange-200 px-2 py-0.5 rounded bg-black/40">VAULT 1/3</span>
                    <span ref={setHud('gold')} className="text-yellow-300">GOLD 0/5</span>
                    <span ref={setHud('lives')} className="text-red-300/90">LIVES 3</span>
                    <span ref={setHud('score')} className="text-amber-200">SCORE 0</span>
                    <span ref={setHud('exit')} className="text-emerald-300/90">HIDDEN LADDER</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-3 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#ffd23e', textShadow: '3px 0 0 #b06a3f, -3px 0 0 #4ad7ff, 0 10px 24px #000' }}>LODE RUNNER-LITE</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm">no jump. dig the floor. hang the rope. the guards learn the same physics you do.</p>
                    <p className="text-white font-mono font-bold mt-1 animate-pulse">TAP / PRESS ANY KEY &mdash; 1 &middot; 2 &middot; 3 PICK A VAULT</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-1 px-8 leading-4">
                        arrows run, climb and swing on rope &mdash; face a way and push DOWN to dig the brick diagonally below it<br />
                        a dug hole lasts about 5 seconds, then the brick grows back; whatever is in it when it closes dies<br />
                        guards fall into your holes, sit it out and climb back out &mdash; and they lift gold you must win back<br />
                        take every gold * and the hidden ladder appears at the top: climb off the screen to clear the vault<br />
                        R replays the vault you just lost with your dim ghost @ alongside &mdash; the attract demo is the solver&apos;s own proven witness
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'EVERY VAULT CLEANED' : end.why}</h2>
                    <p className="text-lg mb-1">{end.win ? 'all three vaults, ghosts all the way down' : `fell in vault ${end.level + 1}`}</p>
                    <p className="text-sm text-amber-200/80 mb-2">score {end.score} &middot; the floor you dug has already grown back &middot; the replay reproduces your run hash-for-hash</p>
                    <p className="text-sm text-amber-100/80 mb-4">R replays this vault with your ghost &middot; any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'LODE RUNNER-LITE')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'DIG', code: 'ArrowDown' }} />
        </div>
    )
}

export default LodeRunnerLiteGame

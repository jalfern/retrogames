// BOULDER DASH — the arcade shell: renderer, input, HUD. It decides NOTHING
// about the game: `sim.js` does, in a module plain Node imports, and
// `scripts/dashcheck.mjs` proves every cave winnable before this file is ever
// opened. The attract demo is literally a REPLAY of the planner's own proven
// route (dashcheck asserts that replay is deterministic and wins).
//
// Input is arrows (the pad's D-pad) — one cell per tap, a held key auto-steps.
// The CA ticks at CFG.caHz (a classic Boulder Dash pace), NOT 60/s, so the
// single-player arcade rhythm is the grid, not the frame rate.
//
// Layout: 1. plan cache 2. canvas art (all runtime, no assets) 3. fixed-
// timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { LEVELS, buildLevel } from './levels.js'
import { makeGame, planRun, planStep, step, playerMove, stateHash, CFG, W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, FIRE } from './sim.js'

const TS = 16
const CW = W * TS
const CH = H * TS
const CA_MS = 1000 / CFG.caHz
const MOVE_STEP = 3                       // CA ticks between held-key auto-steps
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

const planCache = new Map()
const planFor = (idx) => {
    if (!planCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        planCache.set(idx, planRun(makeGame(meta, grid)).cmds)
    }
    return planCache.get(idx)
}

const speck = (x, y) => ((x * 7349 + y * 8453 + x * y * 31) % 11) / 11

const DashGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('boulderdash.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.dashStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let levelIdx = 0
        let meta = null, grid = null, gs = null
        let plan = [], raf = 0, last = 0, acc = 0
        let runMoves = 0
        let lastMoveTick = -99
        const held = []                                   // ordered held arrow codes

        const loadLevel = (idx, freshScore) => {
            levelIdx = idx % LEVELS.length
            const built = buildLevel(levelIdx)
            meta = built.meta; grid = built.grid
            gs = makeGame(meta, grid)
            if (freshScore) gs.score = 0
            plan = planFor(levelIdx)
            runMoves = 0; lastMoveTick = -99
            held.length = 0
        }
        loadLevel(0, true)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'gem') { audioController.playSweep(880, 1760, 0.14, 'square', 0.08); audioController.playTone(2093, 0.08, 'square', 0.04) }
                else if (e.type === 'dig') audioController.playNoise(0.05, 0.04)
                else if (e.type === 'fell') audioController.playTone(150, 0.05, 'triangle', 0.04)
                else if (e.type === 'gemlost') audioController.playSweep(500, 200, 0.2, 'sawtooth', 0.07)
                else if (e.type === 'ignite' || e.type === 'spread') audioController.playNoise(0.08, 0.06)
                else if (e.type === 'locked') audioController.playTone(160, 0.08, 'sawtooth', 0.06)
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'win') audioController.playFanfare()
                else if (e.type === 'time') audioController.playSweep(320, 80, 0.5, 'square', 0.09)
            }
        }

        const finish = () => {
            const won = gs.win
            const entry = { score: gs.score, gems: gs.have, level: meta.name, date: new Date().toISOString().slice(2, 10) }
            if (won || gs.score > 0) localStorage.setItem('boulderdash.board', JSON.stringify([...board(), entry].sort((a, b) => b.score - a.score).slice(0, 8)))
            const cause = won ? (levelIdx >= LEVELS.length - 1 ? 'EVERY CAVE CRACKED' : 'CAVE CLEARED') : gs.end === 'time' ? 'THE CLOCK RAN OUT' : 'BURIED'
            setEnd({ score: gs.score, gems: gs.have, need: meta.need, won, cause, last: won && levelIdx >= LEVELS.length - 1 })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const movePlayer = (dir) => {
            const before = gs.events.length
            const okd = playerMove(gs, dir)
            if (okd) runMoves++
            lastMoveTick = gs.tick
            // player events were appended to gs.events before step() clears them
            handleEvents(gs.events.slice(before))
        }

        const doSim = () => {
            if (screenRef.current === 'attract') {
                const c = plan.find(cc => cc.tick === gs.tick)
                if (c) playerMove(gs, c.dir)
                handleEvents(step(gs).events)
                if (gs.end) loadLevel((levelIdx + 1) % LEVELS.length, true)
            } else if (screenRef.current === 'play') {
                const dir = held.length && ARROWS.includes(held[held.length - 1]) ? held[held.length - 1] : null
                if (dir && gs.tick - lastMoveTick >= MOVE_STEP) movePlayer(dir)
                const ev = step(gs).events
                handleEvents(ev)
                if (gs.end) finish()
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= CA_MS) { doSim(); acc -= CA_MS }
            }
            paint()
            syncHud()
        }

        // ---------- painter ----------
        const paint = () => {
            ctx.fillStyle = '#241a12'
            ctx.fillRect(0, 0, CW, CH)

            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === 0) continue
                    const px = x * TS, py = y * TS
                    if (t === DIRT) {
                        ctx.fillStyle = speck(x, y) > 0.5 ? '#9a5a28' : '#834a20'
                        ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#6d3c18'
                        ctx.fillRect(px + 2, py + 3, 2, 2); ctx.fillRect(px + 10, py + 9, 3, 2)
                        if (gs.grid[(y - 1) * W + x] === 0) { ctx.fillStyle = '#3f7d3a'; ctx.fillRect(px, py, TS, 2) }
                    } else if (t === STEEL) {
                        ctx.fillStyle = '#5b6b7a'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#8595a4'; ctx.fillRect(px, py, TS, 3); ctx.fillRect(px, py, 3, TS)
                        ctx.fillStyle = '#3d4a57'; ctx.fillRect(px + 4, py + 4, 2, 2); ctx.fillRect(px + 10, py + 10, 2, 2)
                    } else if (t === BOULDER) {
                        ctx.fillStyle = '#6f7d8a'; ctx.beginPath(); ctx.arc(px + 8, py + 8, 7, 0, Math.PI * 2); ctx.fill()
                        ctx.fillStyle = '#8a99a6'; ctx.beginPath(); ctx.arc(px + 6, py + 6, 2, 0, Math.PI * 2); ctx.fill()
                    } else if (t === DIAMOND) {
                        ctx.fillStyle = '#3a5a6a'; ctx.fillRect(px, py, TS, TS)
                        const g = ctx; g.fillStyle = gs.tick % 20 < 10 ? '#7fe7ff' : '#bff6ff'
                        g.beginPath(); g.moveTo(px + 8, py + 2); g.lineTo(px + 13, py + 8); g.lineTo(px + 8, py + 14); g.lineTo(px + 3, py + 8); g.closePath(); g.fill()
                        g.fillStyle = '#ffffff'; g.fillRect(px + 7, py + 6, 2, 2)
                    } else if (t === FIRE) {
                        const f = gs.burn[y * W + x]
                        ctx.fillStyle = '#3a1206'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = f > CFG.burn * 0.6 ? '#ffd23f' : '#ff7a1a'
                        ctx.fillRect(px + 2, py + 4, 12, 10)
                        ctx.fillStyle = '#ffec9a'
                        ctx.fillRect(px + 5 + (gs.tick % 3), py + 6, 4, 5)
                    }
                }
            }

            // exit door + spawn marker
            const ex = meta.exit.x * TS, ey = meta.exit.y * TS
            const open = gs.have >= meta.need
            ctx.fillStyle = open ? '#1d3a1d' : '#3a2a1a'; ctx.fillRect(ex + 2, ey + 1, TS - 4, TS - 2)
            ctx.fillStyle = open ? '#59e05e' : '#7a6a4a'
            ctx.beginPath(); ctx.arc(ex + TS - 5, ey + 8, 1.6, 0, Math.PI * 2); ctx.fill()

            // the fly (firefly automaton) — a bright dart trailing its glow
            for (const f of gs.flies) {
                const fx = f.x * TS, fy = f.y * TS
                ctx.fillStyle = 'rgba(255,240,120,0.35)'; ctx.fillRect(fx - 2, fy - 2, TS + 4, TS + 4)
                ctx.fillStyle = '#fff27a'; ctx.beginPath(); ctx.arc(fx + 8, fy + 8, 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#ff8a00'; ctx.fillRect(fx + (f.dir === 1 ? 11 : 2), fy + 7, 3, 2)
            }

            // the digger
            const p = gs.player
            if (p.alive) {
                const px = p.x * TS, py = p.y * TS
                ctx.fillStyle = '#2a5f9e'; ctx.fillRect(px + 4, py + 7, 8, 7)         // body
                ctx.fillStyle = '#ffd9a0'; ctx.fillRect(px + 5, py + 2, 6, 5)         // head
                ctx.fillStyle = '#c98a2a'; ctx.fillRect(px + 4, py + 1, 8, 2)         // helmet
                ctx.fillStyle = '#ffd9a0'
                const leg = Math.floor(gs.tick / 3 + p.x + p.y) % 2
                ctx.fillRect(px + 4, py + 14, 3, 2 - leg); ctx.fillRect(px + 9, py + 14, 3, 2 - (1 - leg))
            }
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.time) hud.time.style.width = `${Math.max(0, 100 * (1 - gs.tick / meta.timeTicks))}%`
            if (hud.gems) hud.gems.textContent = `${gs.have}/${meta.need}`
            if (hud.score) hud.score.textContent = String(gs.score).padStart(6, '0')
            if (hud.lvl) hud.lvl.textContent = `${levelIdx + 1}. ${meta.name}`
            if (hud.exit) hud.exit.style.color = gs.have >= meta.need ? '#59e05e' : '#c9a24a'
        }

        // ---------- input ----------
        const startPlay = () => {
            loadLevel(0, true)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (ARROWS.includes(e.code)) {
                if (!held.includes(e.code)) held.push(e.code)
                movePlayer(e.code)                            // instant first step on a tap
            }
        }
        const onUp = (e) => { const i = held.indexOf(e.code); if (i >= 0) held.splice(i, 1) }
        const onBlur = () => held.length = 0
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && e.target === canvas) {
                const r = canvas.getBoundingClientRect()
                const tx = (e.clientX - r.left) / r.width * W, ty = (e.clientY - r.top) / r.height * H
                const dx = tx - (gs.player.x + 0.5), dy = ty - (gs.player.y + 0.5)
                if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                else movePlayer(dy > 0 ? 'ArrowDown' : 'ArrowUp')
            }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / CW, r.height / CH)
            canvas.style.width = `${CW * sc}px`
            canvas.style.height = `${CH * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // ---------- DEV hook: read-only probe + planner hint ----------
        if (import.meta.env.DEV) {
            window.__dashTest = {
                probe: () => {
                    let boulders = 0, gems = 0, fires = 0
                    for (let i = 0; i < gs.grid.length; i++) {
                        if (gs.grid[i] === BOULDER) boulders++
                        else if (gs.grid[i] === DIAMOND) gems++
                        else if (gs.grid[i] === FIRE) fires++
                    }
                    return {
                        screen: screenRef.current, tick: gs.tick, t: gs.tick / CFG.caHz, level: levelIdx, name: meta.name,
                        player: { ...gs.player }, have: gs.have, need: meta.need, score: gs.score,
                        end: gs.end, win: gs.win, hash: stateHash(gs), moves: runMoves,
                        exit: { ...gs.exit, open: gs.have >= meta.need },
                        boulders, gems, fires, flies: gs.flies.map(f => ({ ...f })), board: board(),
                    }
                },
                // the next arrow the PROVEN planner would press from here — the
                // driver still has to press a real arrow to make it happen.
                hint: () => planStep(gs) || null,
                // DEV-only rig for the death test: it only LOOSENS a boulder two
                // tiles overhead (like Lemmings' __marioTest.teleport positions a
                // body). The crush itself is computed by the real gravity CA on
                // the real loop — the driver then restarts with a real key.
                crush: () => {
                    if (!gs || screenRef.current !== 'play' || gs.player.y - 2 < 1) return false
                    gs.grid[(gs.player.y - 2) * W + gs.player.x] = BOULDER
                    gs.grid[(gs.player.y - 1) * W + gs.player.x] = EMPTY
                    return true
                },
                start: startPlay,
            }
        }

        return () => {
            if (import.meta.env.DEV && window.__dashTest) delete window.__dashTest
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-amber-50 font-mono text-xs">
                    <span id="dash-lvl" ref={setHud('lvl')} className="font-bold tracking-widest text-sm" />
                    <div className="w-28 h-2.5 bg-black/50 rounded overflow-hidden border border-black/50">
                        <div ref={setHud('time')} className="h-full" style={{ background: 'linear-gradient(90deg,#59e05e,#ffd83d,#e23b3b)', width: '100%' }} />
                    </div>
                    <span>GEMS <span ref={setHud('gems')} className="font-bold text-cyan-300" /></span>
                    <span ref={setHud('exit')}>EXIT</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>000000</span>
                    </span>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-amber-300" style={{ textShadow: '0 4px 0 #7a3b12, 0 10px 24px #000' }}>BOULDER DASH</h1>
                    <p className="text-amber-100/90 font-mono mt-1 text-sm">dig deep. grab the gems. do not be under the rock when it drops.</p>
                    <p className="text-white font-mono font-bold mt-6 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-200/80 font-mono text-xs mt-2 px-6">
                        arrows / D-pad: dig &amp; move · gather the GEM quota, then reach the exit before the clock<br />
                        boulders crush you, dropped gems turn to dirt, and the firefly burns everything but steel ·
                        this demo is a proven solution, replayed move for move
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.gems}/{end.need} gems{end.last ? ' · EVERY CAVE CRACKED' : ''}</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-cyan-300 font-bold mb-1 tracking-widest">DEEP DIGGERS</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.level}</span><span>{r.gems} gems · {r.score}</span><span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'BOULDER DASH')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default DashGame

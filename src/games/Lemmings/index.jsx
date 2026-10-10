// LEMMINGS-LITE — the arcade shell: renderer, input, HUD. Decides NOTHING
// about the game: `sim.js` does, in a module plain Node imports — and the
// attract demo is literally a REPLAY of the solver's own winning script from
// `lemcheck` (deterministic replay, on screen, before you ever press a key).
//
// Input: arrows drive the assignment cursor, 1-4 (or the B button) pick the
// skill, Space/click/A apply it to the nearest lemming — the issue's
// one-click assignment, on a phone with just the virtual pad.
//
// Layout: 1. boot/solver cache 2. canvas art (all runtime, no assets)
// 3. fixed-timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { LEVELS, buildLevel } from './levels.js'
import { makeGame, step, solve, assign, nearestLemming, stateHash, SKILLS, SKILL_NAME, SKILL_KEY, W, H, DIRT, FIXED_DT } from './sim.js'

const TS = 8                                   // internal pixels per tile
const CW = W * TS
const CH = H * TS

const planCache = new Map()
const planFor = (idx) => {
    if (!planCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        planCache.set(idx, solve(makeGame(meta, grid)).cmds)
    }
    return planCache.get(idx)
}

const speck = (x, y) => ((x * 7349 + y * 8453) % 7) / 7

const LEM_COLORS = {
    body: '#3fae4a', head: '#ffd9a0', hair: '#8a3b12', pants: '#2a5f9e',
}

const LemGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('lemmings.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.lemStage = '1'
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
        let plan = [], planI = 0
        let raf = 0, last = 0, acc = 0
        let runCmds = []                          // player-command log of the live run
        const cursor = { x: 8, y: 18 }
        let selected = 'climb'
        const keys = new Set()

        const loadLevel = (idx, freshScore) => {
            levelIdx = idx % LEVELS.length
            const built = buildLevel(levelIdx)
            meta = built.meta; grid = built.grid
            gs = makeGame(meta, grid)
            if (freshScore) gs.score = 0
            plan = planFor(levelIdx); planI = 0
            runCmds = []
            cursor.x = meta.spawn.x; cursor.y = meta.spawn.y - 1
            selected = (SKILLS.find(s => meta.skills[s] > 0)) || 'climb'
        }
        loadLevel(0, true)

        const nextPlan = () => plan.find((c, i) => i >= planI && c.tick >= gs.tick)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'exit') { audioController.playSweep(660, 1320, 0.22, 'square', 0.08); audioController.playTone(1760, 0.1, 'square', 0.05) }
                else if (e.type === 'assign') audioController.playTone(e.skill === 'bomb' ? 180 : 520 + SKILLS.indexOf(e.skill) * 90, 0.07, 'square', 0.07)
                else if (e.type === 'blast') { audioController.playNoise(0.5, 0.16); audioController.playSweep(220, 50, 0.5, 'sawtooth', 0.1) }
                else if (e.type === 'splat') audioController.playSweep(360, 60, 0.22, 'sawtooth', 0.09)
                else if (e.type === 'dig') audioController.playNoise(0.06, 0.03)
                else if (e.type === 'land') audioController.playTone(120, 0.05, 'triangle', 0.04)
                else if (e.type === 'step') audioController.playTone(220, 0.03, 'triangle', 0.025)
                else if (e.type === 'crest') audioController.playTone(880, 0.07, 'sine', 0.05)
                else if (e.type === 'turn') audioController.playTone(90, 0.02, 'triangle', 0.015)
                else if (e.type === 'spawn') audioController.playTone(330, 0.05, 'square', 0.04)
                else if (e.type === 'win') audioController.playSweep(392, 1568, 0.7, 'square', 0.1)
                else if (e.type === 'lose' || e.type === 'time') audioController.playDeath()
            }
        }

        const finish = () => {
            const won = gs.win
            const entry = { score: gs.score, out: gs.exited, level: meta.name, date: new Date().toISOString().slice(2, 10) }
            if (won || gs.exited > 0) localStorage.setItem('lemmings.board', JSON.stringify([...board(), entry].sort((a, b) => b.score - a.score).slice(0, 8)))
            setEnd({
                score: gs.score, out: gs.exited, need: meta.need, won,
                cause: won ? (levelIdx >= LEVELS.length - 1 ? 'EVERY LEDGE CROSSED' : 'LEVEL CLEARED') : 'THE COUNT WASN T MET',
                last: won && levelIdx >= LEVELS.length - 1,
            })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const applySkill = (sx, sy) => {
            const L = nearestLemming(gs, sx, sy)
            if (!L) { audioController.playTone(140, 0.06, 'sawtooth', 0.05); return }
            if (assign(gs, L.id, selected)) runCmds.push({ tick: gs.tick, id: L.id, skill: selected })
        }

        const doSim = () => {
            if (screenRef.current === 'attract') {
                // attract = the solver's proven script, replayed on screen
                const c = plan.find(cc => cc.tick === gs.tick + 1)
                if (c) assign(gs, c.id, c.skill)
                handleEvents(step(gs).events)
                if (gs.end) loadLevel((levelIdx + 1) % LEVELS.length, true)
            } else if (screenRef.current === 'play') {
                const sp = 11 * FIXED_DT
                if (keys.has('ArrowLeft')) cursor.x = Math.max(0.5, cursor.x - sp)
                if (keys.has('ArrowRight')) cursor.x = Math.min(W - 0.5, cursor.x + sp)
                if (keys.has('ArrowUp')) cursor.y = Math.max(2, cursor.y - sp)
                if (keys.has('ArrowDown')) cursor.y = Math.min(H - 1, cursor.y + sp)
                handleEvents(step(gs, { x: cursor.x, y: cursor.y }).events)
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
                while (acc >= FIXED_DT * 1000) { doSim(); acc -= FIXED_DT * 1000 }
            }
            paint()
            syncHud()
        }

        // ---------- painter ----------
        const paint = () => {
            ctx.fillStyle = '#7ec8e3'
            ctx.fillRect(0, 0, CW, CH)
            ctx.fillStyle = '#a9ddf0'
            for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 83, 14 + (i % 3) * 16, 34, 5)

            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === 0) continue
                    const px = x * TS, py = y * TS
                    if (t === DIRT) {
                        ctx.fillStyle = '#7a4a22'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = speck(x, y) > 0.5 ? '#8d5a2c' : '#68391a'
                        ctx.fillRect(px + 1, py + 2, 2, 2); ctx.fillRect(px + 5, py + 5, 2, 1)
                        if (gs.grid[(y - 1) * W + x] === 0) { ctx.fillStyle = '#59b25d'; ctx.fillRect(px, py, TS, 2) }
                    } else {
                        ctx.fillStyle = '#93a0ad'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = '#b6c2cf'; ctx.fillRect(px, py, TS, 2)
                        ctx.fillStyle = '#6b7885'; ctx.fillRect(px + 2, py + 4, 2, 2); ctx.fillRect(px + 5, py + 2, 1, 1)
                    }
                }
            }

            // spawn cave + exit door
            ctx.fillStyle = '#241608'
            ctx.fillRect(meta.spawn.x * TS - 3, (meta.spawn.y - 1) * TS, TS + 6, TS + 2)
            ctx.fillStyle = '#1d3a1d'
            ctx.fillRect(meta.exit.x * TS + 1, meta.exit.y * TS - TS, TS - 2, TS * 2 - 1)
            ctx.fillStyle = '#59e05e'
            ctx.fillRect(meta.exit.x * TS + 3, meta.exit.y * TS - 2, TS - 6, 3)

            // lemmings
            for (const L of gs.lemmings) {
                if (!L.live && L.state !== 'dead') continue
                const px = Math.round(L.x * TS - 3), py = Math.round(L.y * TS - (L.state === 'dead' ? 3 : 8))
                if (L.state === 'dead') {
                    ctx.fillStyle = '#8d97a3'; ctx.fillRect(px - 1, py + 5, 8, 3)
                    continue
                }
                if (L.state === 'bomb' && Math.floor(gs.tick / 6) % 2 === 0) {
                    ctx.fillStyle = '#e23b3b'; ctx.fillRect(px - 1, py - 1, 8, 9)
                }
                ctx.fillStyle = LEM_COLORS.head; ctx.fillRect(px + 1, py, 5, 3)
                ctx.fillStyle = LEM_COLORS.hair; ctx.fillRect(px + 1, py, 5, 1)
                ctx.fillStyle = LEM_COLORS.body; ctx.fillRect(px + 1, py + 3, 5, 3)
                ctx.fillStyle = LEM_COLORS.pants
                const leg = L.state === 'walk' ? (Math.floor(gs.tick / 8 + L.id) % 2) : 0
                ctx.fillRect(px + 1, py + 6, 2, 2 - leg); ctx.fillRect(px + 4, py + 6, 2, 1 + leg)
                if (L.state === 'block') { ctx.fillStyle = LEM_COLORS.body; ctx.fillRect(px - 3, py + 3, 3, 1); ctx.fillRect(px + 6, py + 3, 3, 1) }
                if (L.state === 'climb') { ctx.fillStyle = LEM_COLORS.head; ctx.fillRect(px + (L.dir > 0 ? 5 : -1), py - 2, 2, 3) }
                if (L.digger && L.state !== 'bomb') { ctx.fillStyle = '#c9c9c9'; ctx.fillRect(px + (L.dir > 0 ? 6 : -3), py + 4, 3, 1) }
            }

            // cursor (play) or autopilot ghost (attract): in attract the box
            // sits on the live body the solver script is about to command
            const playing = screenRef.current === 'play'
            const pc = nextPlan()
            const ghost = pc && gs.lemmings.find(l => l.id === pc.id && l.live)
            const cx = playing ? cursor.x : (ghost ? ghost.x : cursor.x)
            const cy = playing ? cursor.y : (ghost ? ghost.y - 1 : cursor.y)
            const skill = playing ? selected : (pc?.skill || 'climb')
            ctx.strokeStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.45)'
            ctx.lineWidth = 1
            ctx.setLineDash([3, 2])
            ctx.strokeRect(Math.round(cx * TS - 9.5), Math.round(cy * TS - 13.5), 19, 21)
            ctx.setLineDash([])
            ctx.fillStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.6)'
            ctx.font = '7px monospace'
            ctx.fillText(SKILL_NAME[skill][0], Math.round(cx * TS - 2), Math.round(cy * TS + 12))
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.time) hud.time.style.width = `${Math.max(0, 100 * (1 - gs.t / meta.time))}%`
            if (hud.out) hud.out.textContent = `${gs.exited}/${meta.need}`
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.left) hud.left.textContent = `${gs.spawned - gs.exited - gs.dead}+${gs.dead}`
            for (const s of SKILLS) {
                const el = hud['sk_' + s]
                if (!el) continue
                el.textContent = String(gs.skills[s])
                el.style.opacity = gs.skills[s] > 0 ? '1' : '0.25'
                el.style.outline = selected === s && screenRef.current === 'play' ? '2px solid #ffd83d' : 'none'
            }
            if (hud.lvl) hud.lvl.textContent = `${levelIdx + 1}. ${meta.name}`
        }

        // ---------- input ----------
        const startPlay = () => {
            loadLevel(0, true)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const cycleSkill = () => {
            const avail = SKILLS.filter(s => meta.skills[s] > 0)
            if (!avail.length) return
            selected = avail[(avail.indexOf(selected) + 1) % avail.length]
            audioController.playTone(660, 0.05, 'square', 0.05)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current > 900) setMode('attract')
                return
            }
            if (pausedRef.current) return
            if (SKILL_KEY[e.code]) {
                selected = SKILL_KEY[e.code]
                audioController.playTone(520 + SKILLS.indexOf(selected) * 90, 0.05, 'square', 0.05)
                return
            }
            if (e.code === 'KeyE') { cycleSkill(); return }
            if (e.code === 'Space' || e.code === 'KeyZ') { applySkill(cursor.x, cursor.y); return }
            keys.add(e.code)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => keys.clear()
        const canvasPoint = (e) => {
            const r = canvas.getBoundingClientRect()
            return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }
        }
        const onMove = (e) => {
            if (screenRef.current !== 'play') return
            const p = canvasPoint(e)
            cursor.x = Math.max(0.5, Math.min(W - 0.5, p.x))
            cursor.y = Math.max(2, Math.min(H - 1, p.y))
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && e.target === canvas) {
                const p = canvasPoint(e)
                cursor.x = Math.max(0.5, Math.min(W - 0.5, p.x))
                cursor.y = Math.max(2, Math.min(H - 1, p.y))
                applySkill(cursor.x, cursor.y)
            }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)
        canvas.addEventListener('pointermove', onMove)

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

        // ---------- DEV hook: read-only probe + solver hint ----------
        if (import.meta.env.DEV) {
            window.__lemTest = {
                probe: () => ({
                    screen: screenRef.current, t: gs.t, tick: gs.tick, level: levelIdx, name: meta.name,
                    cursor: { ...cursor }, selected, skills: { ...gs.skills },
                    spawned: gs.spawned, exited: gs.exited, dead: gs.dead, need: meta.need,
                    end: gs.end, win: gs.win, score: gs.score, hash: stateHash(gs),
                    cmds: runCmds.length, board: board(),
                    lemmings: gs.lemmings.map(L => ({ id: L.id, x: L.x, y: L.y, state: L.state, dir: L.dir, climber: L.climber, digger: L.digger })),
                }),
                // The next move the PROVEN solver makes at this point in the
                // replay — as the live position of that live lemming. Read-only:
                // the driver still has to aim and press with real inputs.
                hint: () => {
                    const c = plan.find(cc => cc.tick >= gs.tick)
                    if (!c) return null
                    const L = gs.lemmings.find(l => l.id === c.id)
                    if (!L || !L.live) return null
                    return { x: L.x, y: L.y, skill: c.skill, id: L.id, inPlan: true }
                },
                start: startPlay,
            }
        }

        return () => {
            if (import.meta.env.DEV && window.__lemTest) delete window.__lemTest
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointermove', onMove)
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
                    <span id="lem-lvl" ref={setHud('lvl')} className="font-bold tracking-widest text-sm" />
                    <div className="w-28 h-2.5 bg-black/50 rounded overflow-hidden border border-black/50">
                        <div ref={setHud('time')} className="h-full" style={{ background: 'linear-gradient(90deg,#ffd83d,#e23b3b)', width: '100%' }} />
                    </div>
                    <span>OUT <span ref={setHud('out')} className="font-bold text-green-300" /></span>
                    <span className="opacity-80">here/dead <span ref={setHud('left')} /></span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>00000</span>
                    </span>
                </div>
                <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex gap-3 font-mono text-xs text-amber-50">
                    {SKILLS.map((s, i) => (
                        <div key={s} className="bg-black/55 border border-amber-200/30 rounded px-2 py-1 text-center">
                            <div className="opacity-70">{i + 1} {SKILL_NAME[s]}</div>
                            <div id={'lem-sk-' + s} ref={setHud('sk_' + s)} className="text-lg font-bold" />
                        </div>
                    ))}
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-8 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-green-300" style={{ textShadow: '0 4px 0 #1d4a1d, 0 10px 24px #000' }}>LEMMINGS-LITE</h1>
                    <p className="text-amber-100/90 font-mono mt-1 text-sm">they walk. they fall. you decide otherwise.</p>
                    <p className="text-white font-mono font-bold mt-8 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-200/80 font-mono text-xs mt-2 px-6">
                        arrows move the cursor · 1-4 or B pick a skill · Space / A assigns it to the nearest lemming<br />
                        this demo is a proven solution, replayed move for move — determinism, on screen
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.out}/{end.need} saved{end.last ? ' · ALL LEDGES CROSSED' : ''}</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-green-300 font-bold mb-1 tracking-widest">SURVIVOR LEDGER</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.level}</span><span>{r.out} out · {r.score}</span><span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'LEMMINGS-LITE')} onResume={handleResume} />}
            <VirtualControls secondAction={{ label: 'B', code: 'KeyE' }} visible={play && !paused} />
        </div>
    )
}

export default LemGame

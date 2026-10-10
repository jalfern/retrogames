// SONAR ABYSS — the arcade shell: the DEFERRED-REVEAL RENDERER the issue asked
// for. Its one law: the paint() function may draw knowledge, never truth. Every
// wall, pearl, vent and eel on screen is gated through known()/eelContacts()
// against sim.js's mem/blips — an unseen eel cannot be drawn because the code
// to draw it only ever receives blips, and an unlit cell cannot be drawn
// because there is nothing to sample. `scripts/sonarcheck.mjs` audits exactly
// that seam in Node; the attract demo is the planner's own proven replay, so
// every wall it lights was lit honestly.
//
// Input: arrows (pad D-pad) swim one cell every CFG.moveEvery ticks; Space
// (pad A) is the ping, gated by the sim's own cooldown. Layout: 1. plan cache
// 2. painter 3. fixed-timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import {
    CFG, W, H, ROCK, DIRS, idx, cx, cy,
    genCave, makeGame, planRun, planStep, playerMove, ping, step, stateHash, known, eelContacts, eelCell,
} from './sim.js'

const TS = 16
const CW = W * TS
const CH = H * TS
const SIM_MS = 50                                  // CFG tick = 1/20 s
const DEMO_SEED = 0xC0FFEE
const MAX_DEPTH = 4
const ARROWS = Object.keys(DIRS)

const planCache = new Map()
const planFor = (seed, depth) => {
    const k = `${seed}/${depth}`
    if (!planCache.has(k)) planCache.set(k, planRun(genCave(seed, depth)).cmds)
    return planCache.get(k)
}

const speck = (x, y) => ((x * 7349 + y * 8453 + x * y * 31) % 11) / 11

const SonarGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('sonar.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.sonarStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let seed = DEMO_SEED
        let depth = 1
        let cave = null, gs = null
        let byTick = null
        let raf = 0, last = 0, acc = 0
        let toast = 0
        let runScore = 0, livesCarry = CFG.lives
        const held = []

        const indexCmds = (cmds) => {
            const m = new Map()
            for (const c of cmds) { if (!m.has(c.tick)) m.set(c.tick, []); m.get(c.tick).push(c) }
            return m
        }
        const loadDepth = (d, resetRun) => {
            depth = d
            cave = genCave(seed, depth)
            gs = makeGame(cave, resetRun ? {} : { score: gs ? runScore : 0, lives: livesCarry })
            if (resetRun) { runScore = 0; livesCarry = CFG.lives }
            if (screenRef.current === 'attract') byTick = indexCmds(planFor(DEMO_SEED, depth))
            else byTick = null
            held.length = 0
        }
        loadDepth(1, true)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'ping') audioController.playSweep(1050, 240, 0.5, 'sine', 0.07)
                else if (e.type === 'pearl') { audioController.playSweep(880, 1760, 0.14, 'square', 0.07); audioController.playTone(2093, 0.08, 'square', 0.03) }
                else if (e.type === 'hit') { audioController.playNoise(0.18, 0.1); audioController.playSweep(300, 90, 0.3, 'sawtooth', 0.08) }
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'descend') { audioController.playSweep(220, 880, 0.5, 'triangle', 0.08); toast = 40 }
            }
        }

        const finish = () => {
            const cause = gs.end === 'dead' ? 'TAKEN IN THE DARK' : 'ASCENDED'
            setEnd({ score: runScore + gs.score, depth, seed, won: gs.win, cause })
            if (runScore + gs.score > 0) localStorage.setItem('sonar.board', JSON.stringify([...board(), { score: runScore + gs.score, depth, seed, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const movePlayer = (dir) => {
            const before = gs.events.length
            const okd = playerMove(gs, dir)
            handleEvents(gs.events.slice(before))
            return okd
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract' || sc === 'play') {
                const todo = sc === 'attract' && byTick ? byTick.get(gs.tick) : null
                if (todo) for (const c of todo) {
                    if (c.action === 'ping') ping(gs, { noCd: true })
                    else movePlayer(c.dir)
                }
            }
            if (sc === 'play') {
                if (gs.tick % CFG.moveEvery === 0 && held.length) movePlayer(held[held.length - 1])
            }
            if (!gs.end) handleEvents(step(gs).events)
            if (gs.end) {
                if (sc === 'attract') {
                    if (gs.end === 'descend') loadDepth(depth >= MAX_DEPTH ? 1 : depth + 1, true)
                    else loadDepth(1, true)
                } else if (sc === 'play') {
                    if (gs.end === 'descend') {
                        runScore += gs.score; livesCarry = gs.lives
                        loadDepth(depth >= MAX_DEPTH ? 1 : depth + 1, false)
                    } else finish()
                }
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
        }

        // ---------- painter: knowledge only, never truth ----------
        const paint = () => {
            ctx.fillStyle = '#020509'
            ctx.fillRect(0, 0, CW, CH)
            const t = gs.tick
            for (let i = 0; i < W * H; i++) {
                if (!known(gs, i)) continue
                const age = gs.mem[i] < 0 ? 999 : t - gs.mem[i]
                const inten = age > CFG.fade ? 0 : 1 - age / CFG.fade
                const x = i % W, y = (i - x) / W
                const px = x * TS, py = y * TS
                if (gs.grid[i] === ROCK) {
                    const base = 40 + Math.floor(inten * 70) + (speck(x, y) > 0.5 ? 8 : 0)
                    ctx.fillStyle = `rgb(${Math.floor(base * 0.5)},${Math.floor(base * 0.8)},${base})`
                    ctx.fillRect(px, py, TS, TS)
                    ctx.fillStyle = `rgba(120,180,220,${(inten * 0.25).toFixed(3)})`
                    ctx.fillRect(px + 2, py + 2, 3, 2); ctx.fillRect(px + 10, py + 9, 3, 2)
                } else {
                    ctx.fillStyle = `rgba(20,${60 + Math.floor(inten * 60)},${90 + Math.floor(inten * 70)},${(0.16 + inten * 0.4).toFixed(3)})`
                    ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2)
                }
                if (age <= 1) {                                    // the frontier itself
                    ctx.strokeStyle = 'rgba(140,230,255,0.9)'; ctx.lineWidth = 2
                    ctx.strokeRect(px + 1, py + 1, TS - 2, TS - 2)
                }
            }
            // vent: a swirl the sonar actually touched
            if (known(gs, gs.vent)) {
                const vx = cx(gs.vent) * TS, vy = cy(gs.vent) * TS
                const a = 0.5 + 0.4 * Math.sin(t / 4)
                ctx.strokeStyle = `rgba(90,240,200,${a.toFixed(2)})`; ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(vx + 8, vy + 8, 5 + (t % 12) * 0.4, 0, Math.PI * 1.6); ctx.stroke()
                ctx.fillStyle = 'rgba(90,240,200,0.8)'
                ctx.fillRect(vx + 7, vy + 7, 2, 2)
            }
            // pearls: seen is seen
            for (let i = 0; i < gs.pearls.length; i++) {
                const c = gs.pearls[i]
                if (gs.taken[i] || !known(gs, c)) continue
                const px = cx(c) * TS, py = cy(c) * TS
                ctx.fillStyle = 'rgba(255,220,240,0.85)'
                ctx.beginPath(); ctx.arc(px + 8, py + 8, 3.5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#fff'
                ctx.fillRect(px + 6, py + 5, 2, 2)
            }
            // eels: contact blips at the cell where a wavefront TOUCHED them —
            // this loop literally has no access to a live eel position.
            for (const b of eelContacts(gs)) {
                const a = 1 - (gs.tick - b.t) / CFG.fade
                const ex = b.x * TS, ey = b.y * TS
                ctx.strokeStyle = `rgba(255,90,90,${(0.3 + a * 0.6).toFixed(2)})`; ctx.lineWidth = 3
                ctx.beginPath()
                ctx.moveTo(ex + 1, ey + 5)
                ctx.quadraticCurveTo(ex + 8, ey + 1 + (b.t % 3) * 3, ex + 15, ey + 9)
                ctx.stroke()
                ctx.fillStyle = `rgba(255,200,120,${a.toFixed(2)})`
                ctx.fillRect(ex + 12, ey + 7, 2, 2)
            }
            // the diver — you always know your own lungs
            const pxp = cx(gs.player.c) * TS, pyp = cy(gs.player.c) * TS
            ctx.fillStyle = 'rgba(120,220,255,0.16)'
            ctx.beginPath(); ctx.arc(pxp + 8, pyp + 8, TS, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#1f7fa8'; ctx.fillRect(pxp + 4, pyp + 6, 9, 6)
            ctx.fillStyle = '#ffd9a0'; ctx.fillRect(pxp + 6, pyp + 3, 5, 4)
            ctx.fillStyle = '#ffdd55'; ctx.fillRect(pxp + 5, pyp + 4, 2, 2)
            const kick = Math.floor(t / 2) % 2
            ctx.fillStyle = '#155f80'
            ctx.fillRect(pxp + 2, pyp + 8 + kick, 3, 2); ctx.fillRect(pxp + 2, pyp + 10 - kick, 3, 2)
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const cd = Math.max(0, Math.min(1, (gs.tick - gs.lastPing) / CFG.pingCd))
            if (hud.ping) hud.ping.style.width = `${cd * 100}%`
            if (hud.lives) hud.lives.textContent = '\u2665'.repeat(Math.max(0, gs.lives))
            if (hud.pearls) hud.pearls.textContent = `${gs.have}/${gs.pearls.length}`
            if (hud.score) hud.score.textContent = String(runScore + gs.score).padStart(6, '0')
            if (hud.depth) hud.depth.textContent = `DEPTH ${depth}`
            if (hud.toast) hud.toast.style.opacity = toast > 0 ? '1' : '0'
            if (toast > 0 && !pausedRef.current) toast--
        }

        // ---------- input ----------
        const startPlay = () => {
            seed = (Date.now() ^ (Math.floor(performance.now() * 1000) << 8)) >>> 0
            runScore = 0; livesCarry = CFG.lives
            loadDepth(1, true)
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
            if (ARROWS.includes(e.code) || e.code === 'Space') e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (ARROWS.includes(e.code)) {
                if (!held.includes(e.code)) held.push(e.code)
            }
            if (e.code === 'Space') {
                const before = gs.events.length
                ping(gs)
                handleEvents(gs.events.slice(before))
            }
        }
        const onUp = (e) => { const i = held.indexOf(e.code); if (i >= 0) held.splice(i, 1) }
        const onBlur = () => held.length = 0
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && e.target === canvas) {
                const before = gs.events.length
                ping(gs)
                handleEvents(gs.events.slice(before))
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
            window.__sonarTest = {
                probe: () => {
                    let litOpen = 0, litRock = 0
                    for (let i = 0; i < W * H; i++) {
                        if (!known(gs, i)) continue
                        if (gs.grid[i] === ROCK) litRock++; else litOpen++
                    }
                    const contacts = eelContacts(gs)
                    const contactCells = new Set(contacts.map(b => idx(b.x, b.y)))
                    let hiddenEels = 0
                    for (const e of gs.eels) if (!contactCells.has(eelCell(e))) hiddenEels++
                    return {
                        screen: screenRef.current, tick: gs.tick, t: gs.tick / 20, depth, seed,
                        player: { x: cx(gs.player.c), y: cy(gs.player.c) },
                        lives: gs.lives, have: gs.have, pearls: gs.pearls.length, score: runScore + gs.score,
                        end: gs.end, hash: stateHash(gs),
                        cooldown: Math.max(0, CFG.pingCd - (gs.tick - gs.lastPing)),
                        litOpen, litRock, contacts: contacts.length, hiddenEels,
                        eels: gs.eels.map(e => ({ x: cx(eelCell(e)), y: cy(eelCell(e)) })),
                        ventKnown: known(gs, gs.vent),
                        vent: { x: cx(gs.vent), y: cy(gs.vent) },
                        board: board(),
                    }
                },
                knownAt: (x, y) => known(gs, idx(x, y)),
                // next move the proven planner would make, or 'PING' if its
                // cooldown is up — the driver still presses the real keys.
                hint: () => (gs.tick - gs.lastPing >= CFG.pingCd ? 'PING' : planStep(gs)),
                // DEV rig for the death test: re-seeds ONE eel's route so it
                // swims toward the standing player. It relocates TRUTH only —
                // knowledge stays dark until the loop's own collision fires
                // (the dashcheck `crush` lesson: rig the setup, never the hit).
                trailEel: () => {
                    if (!gs || screenRef.current !== 'play' || !gs.eels.length) return false
                    const e = gs.eels[0]
                    const from = e.route[e.pos]
                    const d = new Int16Array(W * H).fill(-1)
                    const q = [gs.player.c]; d[gs.player.c] = 0
                    while (q.length) {
                        const i = q.shift(), x = i % W, y = (i - x) / W
                        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                            const j = (y + dy) * W + (x + dx)
                            if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue
                            if (gs.grid[j] === ROCK || d[j] >= 0) continue
                            d[j] = d[i] + 1; q.push(j)
                        }
                    }
                    if (d[from] < 0) return false
                    const route = [from]
                    let c = from
                    while (d[c] > 0) {
                        const x = c % W, y = (c - x) / W
                        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                            const j = (y + dy) * W + (x + dx)
                            if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue
                            if (gs.grid[j] !== ROCK && d[j] === d[c] - 1) { route.push(j); c = j; break }
                        }
                    }
                    e.route = route; e.pos = 0; e.dir = 1; e.every = 4
                    return route.length
                },
                start: startPlay,
            }
        }

        return () => {
            if (import.meta.env.DEV && window.__sonarTest) delete window.__sonarTest
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
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-cyan-50 font-mono text-xs">
                    <span ref={setHud('depth')} className="font-bold tracking-widest text-sm" />
                    <span ref={setHud('lives')} className="text-red-400 text-sm" />
                    <span>PEARLS <span ref={setHud('pearls')} className="font-bold text-fuchsia-300" /></span>
                    <div className="w-24 h-2.5 bg-black/50 rounded overflow-hidden border border-cyan-800/60">
                        <div ref={setHud('ping')} className="h-full bg-cyan-300" style={{ width: '100%' }} />
                    </div>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>000000</span>
                    </span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-teal-300 font-mono font-bold text-2xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #0ff' }}>
                    DESCENDING...
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-cyan-300" style={{ textShadow: '0 4px 0 #0a3a5a, 0 10px 24px #000' }}>SONAR ABYSS</h1>
                    <p className="text-cyan-100/90 font-mono mt-1 text-sm">you only see what sound reveals. map the cave in your head.</p>
                    <p className="text-white font-mono font-bold mt-6 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-cyan-200/80 font-mono text-xs mt-2 px-6">
                        arrows / D-pad: swim · SPACE / A button: PING — the wavefront lights walls as it reaches them, then fades<br />
                        pearls score, the teal swirl is the vent to the next depth · eels are real whether or not you just heard one<br />
                        die and the next run is a different cave (seeded per run) · this demo is a proven route, replayed ping for ping
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · depth {end.depth} · seed {end.seed.toString(16)}</p>
                    <div className="bg-black/50 border border-cyan-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-fuchsia-300 font-bold mb-1 tracking-widest">DEEP LOG</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. depth {r.depth}</span><span>seed {r.seed?.toString(16)}</span><span>{r.score}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SONAR ABYSS')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default SonarGame

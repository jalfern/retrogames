// ARENA ARCHERY — the arcade shell. The duel lives in ./sim.js (pure,
// (state,inputs) at 30 Hz, P1-then-P2 stamp per tick) and the two carved
// grounds in ./levels.js; this file only paints, listens, and proves the
// issue's muscles on screen:
//
//   - ballistics      → arrows are drawn along the sim's own (vx,vy); the
//     arc the solver aimed along is the arc the pixels trace,
//   - stuck = terrain → stuck arrows are painted from gs.stuck (the same
//     array the knockout chain reads), pulled arrows vanish the tick the
//     sim says `pull`,
//   - determinism     → attract mode IS recordMatch()'s proven input stream
//     fed back through the real step(), tick for tick; the DEV hook
//     re-replays your own stream and compares hashes.
//
// One stick per archer: arrows/WASD aim and move, SPACE/F draws, release
// looses. Up is jump AND the 45° lob — TowerFall's own bargain.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, makeGame, step, botInput, recordMatch, replay, stateHash, cloneGame } from './sim.js'
import { ARENAS_COUNT, buildArena } from './levels.js'

const SIM_MS = 1000 / 30
const CW = CFG.cell
const A0 = buildArena(0)
const PXW = A0.W * CW
const PXH = A0.H * CW

const P1_KEYS = { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', f: 'Space' }
const P2_KEYS = { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', f: 'KeyF' }
const KEY_SET = new Set([...Object.values(P1_KEYS), ...Object.values(P2_KEYS)])

const inputOf = (held, map) => ({
    mx: (held.has(map.r) ? 1 : 0) - (held.has(map.l) ? 1 : 0),
    my: (held.has(map.u) ? 1 : 0) - (held.has(map.d) ? 1 : 0),
    fire: held.has(map.f),
})

const demoCache = new Map()
const demoFor = (i) => {
    if (!demoCache.has(i)) {
        const g = recordMatch({ arena: i })
        demoCache.set(i, { cmds: g.cmds.map((c) => ({ ...c })), arena: i })
    }
    return demoCache.get(i)
}

const ArenaArcheryGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const modeRef = useRef('1p')
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.archeryStage = '1'
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

        let arenaIdx = 0
        let gs = makeGame(buildArena(0))
        let mode = '1p'
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = ''
        const held = new Set()
        let demo = null, demoG = null, demoBy = null

        const say = (m) => { toastMsg = m; toast = 110 }

        const paintBg = (g) => {
            const grd = bgx.createLinearGradient(0, 0, 0, PXH)
            grd.addColorStop(0, '#0b0e1d'); grd.addColorStop(1, '#1a1226')
            bgx.fillStyle = grd
            bgx.fillRect(0, 0, PXW, PXH)
            for (let y = 0; y < g.H; y++) {
                for (let x = 0; x < g.W; x++) {
                    if (g.grid[y * g.W + x] !== 1) continue
                    const px = x * CW, py = y * CW
                    bgx.fillStyle = '#3a4258'
                    bgx.fillRect(px, py, CW, CW)
                    bgx.fillStyle = '#4a5573'
                    bgx.fillRect(px, py, CW, 3)
                    bgx.fillStyle = '#2a3044'
                    bgx.fillRect(px, py + CW - 3, CW, 3)
                    bgx.fillRect(px + CW - 2, py, 2, CW)
                }
            }
            bgDirty = false
        }

        const drawArrowShape = (c, x, y, ang, dim) => {
            c.save()
            c.translate(x, y); c.rotate(ang)
            c.strokeStyle = dim ? '#8a7a55' : '#e8d9a0'
            c.lineWidth = 2
            c.beginPath(); c.moveTo(-8, 0); c.lineTo(6, 0); c.stroke()
            c.fillStyle = dim ? '#b9a06a' : '#ffd23e'
            c.beginPath(); c.moveTo(8, 0); c.lineTo(3, -3); c.lineTo(3, 3); c.closePath(); c.fill()
            c.restore()
        }

        const drawArcher = (c, p, color) => {
            if (!p.alive) return
            if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2) return
            c.fillStyle = color
            c.fillRect(p.x - 6, p.y - 4, 12, 12)
            c.fillRect(p.x - 4, p.y - 12, 8, 7)
            c.strokeStyle = '#f2f5ff'
            c.lineWidth = 2
            const m = Math.hypot(p.aimX, p.aimY) || 1
            const ax = p.aimX / m, ay = p.aimY / m
            c.beginPath()
            c.moveTo(p.x + ax * 10 - ay * 7, p.y + ay * 10 + ax * 7)
            c.lineTo(p.x + ax * 10 + ay * 7, p.y + ay * 10 - ax * 7)
            c.stroke()
            if (p.firing && p.charge > 0.02) {
                c.strokeStyle = '#ffd23e'
                c.beginPath()
                c.moveTo(p.x + ax * 10 - ay * 7, p.y + ay * 10 + ax * 7)
                c.lineTo(p.x + ax * (10 - p.charge * 8), p.y + ay * (10 - p.charge * 8))
                c.lineTo(p.x + ax * 10 + ay * 7, p.y + ay * 10 - ax * 7)
                c.stroke()
                c.fillStyle = '#ffd23e'
                c.fillRect(p.x - 10, p.y - 20, Math.max(2, p.charge * 20), 3)
            }
        }

        const paint = () => {
            const g = screenRef.current === 'attract' && demoG ? demoG : gs
            if (bgDirty) paintBg(g)
            ctx.clearRect(0, 0, PXW, PXH)
            ctx.drawImage(bg, 0, 0)
            for (const s of g.stuck) {
                drawArrowShape(ctx, (s.cell % g.W) * CW + CW / 2, Math.floor(s.cell / g.W) * CW + CW / 2, s.ang || 0.6, true)
            }
            for (const ar of g.arrows) {
                if (ar.state === 'stuck') continue
                drawArrowShape(ctx, ar.x, ar.y, Math.atan2(ar.vy, ar.vx), ar.state === 'fall')
            }
            drawArcher(ctx, g.p[0], '#ff5d6c')
            drawArcher(ctx, g.p[1], '#4ad7ff')
        }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'loose') audioController.playSweep(340 + e.charge * 300, 140, 0.12, 'triangle', 0.05)
                else if (e.type === 'stick') audioController.playTone(190, 0.05, 'square', 0.045)
                else if (e.type === 'knockout') audioController.playTone(760, 0.05, 'square', 0.05)
                else if (e.type === 'pull') { audioController.playTone(560, 0.05, 'triangle', 0.05); say('ARROW PULLED') }
                else if (e.type === 'hit') { say(e.who === 0 || mode === '2p' ? `PLAYER ${e.who + 1} HITS!` : 'THE BOT HITS YOU'); audioController.playNoise(0.09, 0.08) }
                else if (e.type === 'respawn') audioController.playSweep(200, 420, 0.2, 'sine', 0.04)
                else if (e.type === 'jump') audioController.playTone(300, 0.03, 'square', 0.02)
            }
        }

        const gameOver = () => {
            const w = gs.winner
            setEnd({ winner: w, scores: [gs.p[0].score, gs.p[1].score], arena: arenaIdx, time: gs.tick })
            overAtRef.current = performance.now()
            audioController.playSweep(w === 0 || mode === '2p' ? 300 : 40, w === 0 || mode === '2p' ? 900 : 60, 0.9, 'square', 0.09)
            setMode('over')
        }

        const startPlay = (m, idx = 0) => {
            mode = m; modeRef.current = m
            arenaIdx = ((idx % ARENAS_COUNT) + ARENAS_COUNT) % ARENAS_COUNT
            gs = makeGame(buildArena(arenaIdx))
            held.clear()
            bgDirty = true
            setMode('play')
            say(m === '2p' ? 'DUEL — FIRST TO 3' : 'YOU vs THE BOT — FIRST TO 3')
            audioController.playSweep(220, 660, 0.25, 'square', 0.07)
        }

        const buildDemo = (i) => {
            demo = demoFor(i)
            demoG = makeGame(buildArena(i))
            demoBy = new Map(demo.cmds.map((c) => [c.tick, c]))
            bgDirty = true
        }

        const tickDemo = () => {
            if (!demoG || demoG.end) { buildDemo(((demo ? demo.arena : 0) + 1) % ARENAS_COUNT); return }
            const c = demoBy.get(demoG.tick)
            step(demoG, c ? c.p1 : null, c ? c.p2 : null)
            demoG.events.length = 0
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play' || gs.end) return
            const in1 = inputOf(held, P1_KEYS)
            const in2 = mode === '2p' ? inputOf(held, P2_KEYS) : botInput(gs, 1, 0)
            gs.cmds.push({ tick: gs.tick, p1: in1, p2: in2 })
            const before = gs.events.length
            step(gs, in1, in2)
            handleEvents(gs.events.splice(before))
            if (gs.end) gameOver()
        }

        const syncHud = () => {
            const g = screenRef.current === 'play' ? gs : demoG || gs
            const h = hudRef.current
            if (h.p1) h.p1.textContent = `P1 ${g.p[0].score}`
            if (h.p2) h.p2.textContent = `${modeRef.current === '1p' ? 'BOT' : 'P2'} ${g.p[1].score}`
            if (h.q1) h.q1.textContent = '▮'.repeat(g.p[0].quiver) + '▯'.repeat(Math.max(0, CFG.quiver - g.p[0].quiver))
            if (h.q2) h.q2.textContent = '▮'.repeat(g.p[1].quiver) + '▯'.repeat(Math.max(0, CFG.quiver - g.p[1].quiver))
            if (h.time) h.time.textContent = `${Math.max(0, Math.ceil((CFG.matchTicks - g.tick) / 30))}s`
            if (h.arena) h.arena.textContent = g.name
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
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
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit2') return startPlay('2p', 0)
                if (e.code === 'Digit1') return startPlay('1p', 0)
                startPlay('1p', 0); return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'Enter' || e.code === 'KeyR') { startPlay(modeRef.current, arenaIdx); return }
                setMode('attract'); return
            }
            if (pausedRef.current) return
            if (KEY_SET.has(e.code)) held.add(e.code)
        }
        const onUp = (e) => { held.delete(e.code) }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay('1p', 0); return }
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
            window.__archeryTest = {
                probe: () => ({
                    screen: screenRef.current, mode, arena: arenaIdx, tick: gs.tick, end: gs.end,
                    scores: [gs.p[0].score, gs.p[1].score],
                    quiver: [gs.p[0].quiver, gs.p[1].quiver],
                    p1: { x: gs.p[0].x, y: gs.p[0].y, alive: gs.p[0].alive, charge: gs.p[0].charge, quiver: gs.p[0].quiver },
                    p2: { x: gs.p[1].x, y: gs.p[1].y, alive: gs.p[1].alive, quiver: gs.p[1].quiver },
                    flying: gs.arrows.filter((a) => a.state === 'fly').length,
                    stuck: gs.stuck.length,
                    arrows: gs.arrows.map((a) => ({ id: a.id, state: a.state, owner: a.owner })),
                    ledger: { ...gs.ledger, total: gs.total + gs.supplied, now: gs.p[0].quiver + gs.p[1].quiver + gs.arrows.filter((a) => a.state !== 'stuck').length + gs.stuck.length + gs.ledger.hit + gs.ledger.lost },
                    // attract is a separate sim instance — the harness grades
                    // THAT moving, not the idle gs
                    demo: demoG ? { tick: demoG.tick, end: demoG.end, scores: [demoG.p[0].score, demoG.p[1].score] } : null,
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                // drive N ticks of the BOT (not the human) into the live game,
                // so a harness can advance the duel through real step() calls
                drive: (n) => {
                    for (let k = 0; k < n && !gs.end; k++) {
                        const i1 = botInput(gs, 0, 1)
                        const i2 = botInput(gs, 1, 0)
                        gs.cmds.push({ tick: gs.tick, p1: i1, p2: i2 })
                        const before = gs.events.length
                        step(gs, i1, i2)
                        handleEvents(gs.events.splice(before))
                    }
                    if (gs.end) gameOver()
                },
                keysDown: (codes) => { for (const c of codes) held.add(c) },
                keysUp: (codes) => { for (const c of codes) held.delete(c) },
                replayCheck: () => {
                    // +1 so a match that ENDED on the last recorded command
                    // gets that command applied in the twin too — stopping the
                    // referee early is not measuring divergence
                    // exact tick parity: live has applied every command
                    // stamped < gs.tick and stepped once per tick, so the
                    // twin must stop AT gs.tick — not one past it, or the
                    // hash mixes a tick the live board never lived
                    const g2 = replay(buildArena(arenaIdx), gs.cmds, { maxTicks: gs.tick })
                    return {
                        live: stateHash(gs), replay: stateHash(g2), match: stateHash(gs) === stateHash(g2),
                        cmds: gs.cmds.length, tick: gs.tick, twinTick: g2.tick,
                        liveP1: [Math.round(gs.p[0].x), Math.round(gs.p[0].y), gs.p[0].quiver, gs.p[0].charge],
                        twinP1: [Math.round(g2.p[0].x), Math.round(g2.p[0].y), g2.p[0].quiver, g2.p[0].charge],
                        liveStuck: gs.stuck.map((s) => s.cell), twinStuck: g2.stuck.map((s) => s.cell),
                    }
                },
                prognose: () => {
                    if (gs.end) return `already ${gs.end}`
                    const g2 = cloneGame(gs)
                    let t = 0
                    while (!g2.end && t < CFG.matchTicks) { step(g2, botInput(g2, 0, 1), botInput(g2, 1, 0)); t++ }
                    return g2.winner === 0
                        ? `WINNABLE: the autopilot still wins from THIS exact state (${g2.p[0].score}-${g2.p[1].score} in ${t} more ticks)`
                        : `NOT WINNABLE from here: autopilot ends ${g2.p[0].score}-${g2.p[1].score} (winner ${g2.winner})`
                },
            }
            mountDbg({
                title: 'ARENA ARCHERY',
                getState: () => [
                    `${gs.name} tick ${gs.tick} end ${gs.end || '-'} mode ${mode}`,
                    `P1 ${gs.p[0].score} (${gs.p[0].quiver} arrows) vs P2 ${gs.p[1].score} (${gs.p[1].quiver} arrows)`,
                    `flying ${gs.arrows.filter((a) => a.state === 'fly').length} stuck ${gs.stuck.length} hit ${gs.ledger.hit} lost ${gs.ledger.lost} total ${gs.total}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => window.__archeryTest.prognose() },
                    { label: '+1 ARROW', run: () => { gs.p[0].quiver++; gs.total++; return `P1 quiver ${gs.p[0].quiver} — extra slack the solver is NOT allowed to assume` } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__archeryTest) delete window.__archeryTest; unmountDbg() }
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
                    <span ref={setHud('p1')} className="text-red-300 font-bold">P1 0</span>
                    <span ref={setHud('q1')} className="text-red-200/70">▮▮▮▮▮▮</span>
                    <span ref={setHud('arena')} className="border border-amber-300/60 text-amber-200 px-2 py-0.5 rounded bg-black/40">CROSSGLOVE</span>
                    <span className="text-white/60">first to 3</span>
                    <span ref={setHud('time')} className="text-cyan-200">120s</span>
                    <span ref={setHud('q2')} className="text-sky-200/70">▮▮▮▮▮▮</span>
                    <span ref={setHud('p2')} className="text-sky-300 font-bold">BOT 0</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-3 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#ffd23e', textShadow: '3px 0 0 #b06a3f, -3px 0 0 #4ad7ff, 0 10px 24px #000' }}>ARENA ARCHERY</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm">one stick to move and aim &mdash; hold to draw, release to lob. every arrow that misses becomes the arena.</p>
                    <p className="text-white font-mono font-bold mt-1 animate-pulse">TAP / PRESS ANY KEY &mdash; 1 SOLO &middot; 2 DUEL</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-1 px-8 leading-4">
                        arrows move &amp; aim &mdash; UP jumps, and a 45&deg; held with UP is the lob &middot; SPACE draws, release looses<br />
                        charge sets the velocity: a 45&deg; range is r = v&sup2;/g &mdash; the arc you draw is the arc that lands<br />
                        arrows stuck in stone are TERRAIN: they knock out the next crossing arrow and refill your quiver when you walk over them<br />
                        leave one as cover or pull it back for ammo &mdash; first to 3 points wins the duel<br />
                        the attract demo is the autopilot&apos;s own proven match, replayed tick for tick through the real step()
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.winner === 0 || modeRef.current === '2p' ? 'text-yellow-300' : 'text-red-400'}`}>
                        {end.winner < 0 ? 'DRAW' : modeRef.current === '2p' ? `PLAYER ${end.winner + 1} TAKES THE ARENA` : end.winner === 0 ? 'YOU TAKE THE ARENA' : 'THE BOT TAKES THE ARENA'}
                    </h2>
                    <p className="text-lg mb-1">{end.scores[0]} &mdash; {end.scores[1]} in {(end.time / 30).toFixed(1)}s on {end.arena === 0 ? 'CROSSGLOVE' : 'KNOCKBACK'}</p>
                    <p className="text-sm text-amber-200/80 mb-4">every missed arrow became terrain on that board &middot; the replay reproduces this match hash-for-hash</p>
                    <p className="text-sm text-amber-100/80 mb-4">R runs it back &middot; any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ARENA ARCHERY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondPad={{ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'KeyF' }} />
        </div>
    )
}

export default ArenaArcheryGame

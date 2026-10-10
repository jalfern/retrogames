// GALAGA — the arcade shell. Everything is drawn at runtime from the pure
// sim in ./sim.js: the fleet sways because the sim says so, every dive is a
// path from ./paths.js sampled per tick (the same samples galactcheck
// audits), the tractor beam is the one band the sim opens, and the attract
// demo is the autopilot's OWN proven run replayed tick for tick through the
// real step(). The renderer's only spatial contract is `pixel = sim unit`
// at 1:1 on a 224x288 canvas — which is exactly the transform
// scripts/galactplay.mjs samples to prove the drawn fighter sits where the
// physics says it is, after every real keystroke.
//
// Layout: 1. proven script 2. palette + painters 3. fixed-timestep loop
// (250 ms catch-up cap — the heist lesson) 4. input 5. DEV hook + DebugKit
// 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, CFG, makeGame, step, stateHash } from './sim.js'
import { plan } from './planner.js'
import { WAVES } from './waves.js'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(makeGame(0))
    return proven
}

const GalagaGame = () => {
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
    const board = () => { try { return JSON.parse(localStorage.getItem('galaga.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.galagaStage = '1'
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
        const keys = { l: false, r: false, u: false, d: false, f: false, fEdge: false }
        const evLog = []
        const parts = []
        const stars = []
        for (let i = 0; i < 50; i++) stars.push([Math.random() * W, Math.random() * H, 0.2 + Math.random() * 0.9])

        const say = (m) => { toastMsg = m; toast = 110 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 220) evLog.splice(0, evLog.length - 220)
            for (const e of evts) {
                if (e.type === 'kill') { audioController.playNoise(0.06, 0.05); burst(e.x, e.y, 8, e.kind === 'flag' ? '#ff5d5d' : '#ffd23f'); shake = 3 }
                else if (e.type === 'fire') audioController.playTone(880, 0.04, 'square', 0.03)
                else if (e.type === 'dive') audioController.playSweep(660, 220, 0.35, 'sawtooth', 0.05)
                else if (e.type === 'beam') { say('TRACTOR BEAM!'); audioController.playSweep(180, 520, 0.6, 'sine', 0.07) }
                else if (e.type === 'captured') { say('FIGHTER CAPTURED!'); audioController.playSweep(600, 90, 0.8, 'square', 0.09); shake = 8 }
                else if (e.type === 'rescued') { say('FIGHTER RESCUED — DOUBLE!'); audioController.playSweep(440, 1320, 0.5, 'square', 0.09) }
                else if (e.type === 'fighterloose') audioController.playSweep(700, 300, 0.3, 'triangle', 0.06)
                else if (e.type === 'lostfighter') { say('FIGHTER LOST!'); audioController.playDeath() }
                else if (e.type === 'death') { audioController.playDeath(); shake = 8 }
                else if (e.type === 'stage') say(`CHALLENGING STAGE ${gs.wave + 1}`)
                else if (e.type === 'go') audioController.playTone(520, 0.12, 'square', 0.05)
                else if (e.type === 'timeout') say('TIME UP — WAVE ESCAPES')
            }
        }

        const finish = (win) => {
            const sc = gs.score
            setEnd({ win, score: sc })
            if (win) localStorage.setItem('galaga.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
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
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ l: keys.l, r: keys.r, u: keys.u, d: keys.d, f: keys.fEdge })
            keys.fEdge = false
        }

        // ---------------------------------------------------------------- paint ----
        const drawBee = (x, y, f) => {
            ctx.fillStyle = '#ffd23f'
            ctx.fillRect(x - 7, y - 4, 5, 7); ctx.fillRect(x + 2, y - 4, 5, 7)
            ctx.fillStyle = '#221'
            ctx.fillRect(x - 2, y - 5, 4, 8)
            if (f % 16 < 8) { ctx.fillStyle = '#fff7c9'; ctx.fillRect(x - 9, y - 2, 2, 4); ctx.fillRect(x + 7, y - 2, 2, 4) }
        }
        const drawBoss = (x, y, f) => {
            ctx.fillStyle = '#3f7dff'
            ctx.fillRect(x - 8, y - 3, 16, 6); ctx.fillRect(x - 4, y - 7, 8, 5)
            ctx.fillStyle = '#9ecbff'
            ctx.fillRect(x - 4 + (f % 20 < 10 ? -2 : 2), y - 6, 3, 3)
            ctx.fillStyle = '#ff5d5d'; ctx.fillRect(x - 1, y + 3, 2, 4)
        }
        const drawFlag = (x, y, f) => {
            drawBoss(x, y, f)
            ctx.fillStyle = f % 24 < 12 ? '#ffd23f' : '#8f4dff'
            ctx.fillRect(x - 3, y - 2, 6, 5)
            ctx.fillStyle = '#0a0a14'; ctx.fillRect(x - 1, y - 1, 2, 3)
        }
        const drawCaptive = (x, y, f) => {
            ctx.fillStyle = '#f2f2f2'
            ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x - 5, y + 5); ctx.closePath(); ctx.fill()
            if (f % 20 < 10) { ctx.fillStyle = '#59f7ff'; ctx.fillRect(x - 1, y - 3, 2, 2) }
        }
        const drawPlayer = (x, y, f) => {
            ctx.fillStyle = '#f4f4ff'
            ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x, y + 3); ctx.lineTo(x - 7, y + 6); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#ff4a4a'; ctx.fillRect(x - 1, y - 6, 2, 8)
            if (gs.double && f % 24 < 14) {
                ctx.fillStyle = 'rgba(200,210,255,0.85)'
                ctx.fillRect(x - 12, y - 2, 3, 7); ctx.fillRect(x + 9, y - 2, 3, 7)
            }
        }

        const paint = () => {
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            if (shake > 0) shake *= 0.85; if (shake < 0.4) shake = 0
            ctx.fillStyle = '#04040c'
            ctx.fillRect(0, 0, W, H)
            const tk = gs.tick
            for (const [x, y0, sp] of stars) {
                const y = (y0 + tk * sp * 0.35) % H
                ctx.fillStyle = sp > 0.75 ? '#8fa3ff' : '#39406b'
                ctx.fillRect(x, y, 1.4, 1.4)
            }
            ctx.save(); ctx.translate(sx, sy)
            // tractor beams first (behind the fleet)
            for (const e of gs.enemies) {
                if (e.state !== 'beam' || !e.bandX) continue
                const u = e.uT / e.path.ticks
                if (!e.path.band || u < e.path.band[0] || u > e.path.band[1]) continue
                const g = ctx.createLinearGradient(0, e.y + 8, 0, e.y + 58)
                g.addColorStop(0, 'rgba(90,240,255,0.55)'); g.addColorStop(1, 'rgba(90,240,255,0.06)')
                ctx.fillStyle = g
                ctx.beginPath()
                ctx.moveTo(e.bandX - 5, e.y + 8); ctx.lineTo(e.bandX + 5, e.y + 8)
                ctx.lineTo(e.bandX + 17, e.y + 56); ctx.lineTo(e.bandX - 17, e.y + 56)
                ctx.closePath(); ctx.fill()
            }
            for (const e of gs.enemies) {
                if (e.state === 'dead' || e.state === 'wait') continue
                if (e.state === 'beam') { drawFlag(e.x, e.y, tk); continue }
                if (e.state === 'carry') {
                    drawFlag(e.x, e.y, tk)
                    ctx.fillStyle = '#f4f4ff'
                    ctx.beginPath(); ctx.moveTo(e.x, e.y + 16); ctx.lineTo(e.x + 4, e.y + 24); ctx.lineTo(e.x - 4, e.y + 24); ctx.closePath(); ctx.fill()
                    continue
                }
                if (e.kind === 'bee') drawBee(e.x, e.y, tk)
                else if (e.kind === 'boss') drawBoss(e.x, e.y, tk)
                else if (e.kind === 'flag') drawFlag(e.x, e.y, tk)
                else drawCaptive(e.x, e.y, tk)
            }
            ctx.fillStyle = '#fff7c9'
            for (const b of gs.shots) ctx.fillRect(b.x - 1, b.y - 4, 2, 6)
            ctx.fillStyle = '#ff8a5c'
            for (const b of gs.enemyShots) ctx.fillRect(b.x - 1, b.y - 2, 2, 5)
            ctx.fillStyle = '#dfe8ff'
            for (const f of gs.fallers) { ctx.beginPath(); ctx.moveTo(f.x, f.y - 6); ctx.lineTo(f.x + 4, f.y + 5); ctx.lineTo(f.x - 4, f.y + 5); ctx.closePath(); ctx.fill() }
            const p = gs.player
            if (p.state === 'alive' && !(p.invuln > 0 && tk % 8 < 3)) drawPlayer(p.x, p.y, tk)
            ctx.restore()
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy
                if (pa.t > 22) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 22; ctx.fillStyle = pa.col
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
            if (h.wave) h.wave.textContent = String(gs.wave + 1)
            if (h.lives) h.lives.textContent = '★'.repeat(Math.max(0, gs.lives - 1))
            if (h.dbled) h.dbled.style.opacity = gs.double ? '1' : '0'
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

        const startPlay = () => {
            gs = makeGame(0)
            evLog.length = 0; parts.length = 0
            keys.l = keys.r = keys.u = keys.d = keys.f = keys.fEdge = false
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
            if (e.code === 'Space') { keys.f = true; keys.fEdge = true }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.f = false }
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

        if (import.meta.env.DEV) {
            window.__galagaTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, wave: gs.wave, score: gs.score,
                    lives: gs.lives, double: gs.double, end: gs.end, phase: gs.phase,
                    player: { x: gs.player.x, y: gs.player.y, state: gs.player.state, shots: gs.shots.length },
                    enemies: gs.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait')
                        .map((e) => ({ kind: e.kind, state: e.state, x: Math.round(e.x), y: Math.round(e.y) })),
                    beam: gs.enemies.some((e) => e.state === 'beam' && e.bandX) ? gs.enemies.find((e) => e.state === 'beam').bandX : 0,
                    fallers: gs.fallers.length, escorts: gs.escorts.length,
                    board: board(), evLog: evLog.slice(-90),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.wave !== undefined) { gs = makeGame(opts.wave); gs.end = null }
                    if (opts.player) Object.assign(gs.player, opts.player)
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'GALAGA',
                getState: () => [
                    `${WAVES[gs.wave].name}  wave ${gs.wave + 1}/3  lives ${gs.lives}  score ${gs.score}${gs.double ? '  DOUBLE!' : ''}`,
                    `player ${gs.player.x.toFixed(0)},${gs.player.y.toFixed(0)} ${gs.player.state}  shots ${gs.shots.length}  band ${gs.enemies.some((e) => e.state === 'beam' && e.bandX) ? 'OPEN' : '-'}`,
                    `fleet ${gs.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait').length} alive  divers ${gs.enemies.filter((e) => e.state === 'dive').length}  escorts ${gs.enemies.filter((e) => e.kind === 'captive').length}`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const clone = JSON.parse(JSON.stringify({ wave: gs.wave, lives: gs.lives }))
                            const p = plan(makeGame(clone.wave), { maxTicks: 8000 })
                            return p.ok
                                ? `WINNABLE: the autopilot clears the hive from a fresh stage ${clone.wave + 1} (${p.receipts.kills} kills, ${p.receipts.deaths} deaths spent). Mid-stage positions are not re-solvable — this solver starts from wave tops.`
                                : `NOT WINNABLE from a fresh wave ${clone.wave + 1}: ${p.end}`
                        },
                    },
                    { label: '+1 LIFE', run: () => { gs.lives++; return `lives ${gs.lives}` } },
                    { label: 'FORCE DIVE', run: () => { gs.nextDiveAt = 0; return 'next decision will commit a diver' } },
                    { label: 'FORCE BEAM', run: () => {
                        const fl = gs.enemies.find((e) => e.kind === 'flag' && e.state === 'hold')
                        if (!fl) return 'no Flagship holding formation right now'
                        gs.beamUsed = false
                        gs.pt = Math.max(gs.pt, CFG.beamPeriod)
                        return 'Flagship will run the beam on its next decision tick'
                    } },
                    { label: 'GRANT DOUBLE', run: () => { gs.double = true; return 'double fighter' } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__galagaTest) delete window.__galagaTest; unmountDbg() }
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
                    <span ref={setHud('wave')} className="border border-sky-300/60 text-sky-200 px-2 py-0.5 rounded bg-black/40">1</span>
                    <span className="text-red-300 text-sm font-bold">★ <span ref={setHud('lives')}>★★</span></span>
                    <span ref={setHud('dbled')} className="text-cyan-300 font-bold transition-opacity duration-300" style={{ opacity: 0 }}>x2</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}><span ref={setHud('score')}>000000</span></span>
                    <span className="text-yellow-200/70"><span ref={setHud('hiscore')}>000000</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-cyan-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #0af' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-4xl font-black text-red-400" style={{ textShadow: '0 4px 0 #400, 0 10px 24px #000' }}>GALAGA</h1>
                    <p className="text-yellow-200/90 font-mono mt-1 text-sm">fighting formation of the bee species</p>
                    <p className="text-white font-mono font-bold mt-4 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-cyan-100/80 font-mono text-[11px] mt-3 px-8 leading-4">
                        ARROWS to fly (you own the bottom band), SPACE to fire<br />
                        divers hunt your lane — every dive path is scripted, readable, dodgeable<br />
                        the red FLAGSHIP drops a tractor beam: dodge it, or lose a fighter<br />
                        a captured fighter flies the next stage as an escort — shoot YOUR OWN<br />
                        escort down, then CATCH the falling fighter for a DOUBLE (two shots)<br />
                        never corner yourself at the walls; the hive aims its dives at you<br />
                        this demo is the autopilot&apos;s own proven run, tick for tick
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'HIVE CLEARED!' : 'GAME OVER'}</h2>
                    <p className="text-lg mb-4">{end.score} pts{end.win ? ' — every swarm broken' : ''}</p>
                    <div className="bg-black/50 border border-cyan-400/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-cyan-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'GALAGA')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default GalagaGame

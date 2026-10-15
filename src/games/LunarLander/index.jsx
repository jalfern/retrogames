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
import { makeGame, step, stateHash, CFG, ORBIT_Y, TARGET_CYCLES, W, H } from './sim.js'
import { terrainY, WORLD_W } from './terrain.js'
import { plan } from './planner.js'
import { makeStars, makeCam, drawStars, drawTerrain, drawLander, drawOrbiter } from './art.js'

const SIM_MS = 1000 / 60
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
            acc += dt
            while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
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
            const sc = screenRef.current
            if (sc === 'attract') { goPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (ev.code === 'KeyX' || ev.code === 'KeyL') zoom = !zoom
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(ev.code)) ev.preventDefault()
            held.add(ev.code)
        }
        const onKeyUp = (ev) => { held.delete(ev.code) }
        const onPointer = () => {
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
            }
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
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            if (import.meta.env.DEV) { unmountDbg(); delete window.__landerTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'LUNAR LANDER')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05070d] select-none">
            <div ref={stageRef} className="relative w-full max-w-[900px] aspect-[512/384] shadow-[0_0_44px_rgba(255,215,107,0.18)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>ALT <span ref={setHud('alt')} className="text-[#e9f7ff]">---</span></span>
                <span>FUEL <span ref={setHud('fuel')} className="text-[#ffd76b]">100</span></span>
                <span>MULT <span ref={setHud('mult')} className="text-[#8fff9f]">×1</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} secondAction={{ label: 'ZOOM', code: 'KeyX' }} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default LunarLanderGame

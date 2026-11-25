// SKYWARD — the cabinet. The island lives in ./world.js, the rules in ./sim.js
// (pure, 60 Hz, zero Math.random), the school's autopilot in ./planner.js; this
// file only paints, listens and makes noise: three.js sea/sky/terrain/storm,
// the chase-cam, the DOM HUD, attract/pause/over, and synth cues on every
// action — ring passed, crate away, bullseye, splash, wings.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { padState } from '../../utils/padState'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { makeGame, step, stateOf, randomSeed, checkout, recycleCraft, FIXED_DT } from './sim.js'
import { decide } from './planner.js'
import { createSkywardGL } from './renderer.js'
import { PRESS, MESSAGES } from './attract.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

const SkywardGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [over, setOver] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const bannerRef = useRef({ until: 0 })
    const glRef = useRef(null)
    const passEnterUntilRef = useRef(0)
    const stormWarnedRef = useRef(false)
    const prevPhaseRef = useRef('free')

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        const canvas = document.createElement('canvas')
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        let gs = makeGame(seedFromQuery() ?? randomSeed())
        let demo = makeGame((gs.seed ^ 0xbeef) >>> 0)
        const gl = createSkywardGL(canvas, { lite: LITE, world: gs.world })
        glRef.current = gl
        const hudEl = document.createElement('div')
        hudEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:12px/1.5 ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)'
        hudEl.innerHTML = `
<div data-h="speed" style="position:absolute;left:90px;bottom:14px;letter-spacing:.1em">000 KTS</div>
<div data-h="alt" style="position:absolute;left:90px;bottom:30px;letter-spacing:.1em">000 M</div>
<div data-h="score" style="position:absolute;right:34px;bottom:14px;letter-spacing:.1em;text-align:right">SCORE 0</div>
<div data-h="chips" style="position:absolute;right:34px;bottom:32px;letter-spacing:.14em;text-align:right;font-size:11px;color:#ffe9a8">RING — · SPOT — · DROP — · ⚡—</div>
<div data-h="banner" style="position:absolute;left:50%;top:56px;transform:translateX(-50%);font-size:22px;letter-spacing:.22em;opacity:0;transition:opacity .25s;text-align:center"></div>
<div data-h="hint" style="position:absolute;left:50%;bottom:70px;transform:translateX(-50%);font-size:11px;letter-spacing:.18em;color:#cfe6ff;opacity:.9;text-align:center"></div>`
        wrap.style.position = 'relative'
        wrap.appendChild(hudEl)
        const q = (k) => hudEl.querySelector(`[data-h="${k}"]`)
        const E = { speed: q('speed'), alt: q('alt'), score: q('score'), chips: q('chips'), banner: q('banner'), hint: q('hint') }

        gs.attract = true

        const banner = (text, secs = 2.2) => {
            E.banner.textContent = text
            E.banner.style.opacity = '1'
            bannerRef.current = { until: performance.now() + secs * 1000 }
        }
        const tone = (f, d, ty = 'square', v = 0.09, delay = 0) => audioController.playTone(f, d, ty, v, delay)
        const sweep = (f0, f1, d, ty = 'triangle', v = 0.09) => audioController.playSweep(f0, f1, d, ty, v)
        const sfxFor = (g, e) => {
            switch (e.kind) {
                case 'ring': tone(660 + e.idx * 60, 0.09, 'square', 0.09); break
                case 'near': // near miss: an airy whip of wind past the ring —
                    audioController.playFilteredNoise(0.16, 0.07, 1600) // you were close
                    tone(1560, 0.06, 'sine', 0.035, 0.02)
                    break
                case 'gate': tone(392 + e.idx * 74, 0.12, 'triangle', 0.1); break
                case 'start':
                    if (e.event === 'THUNDERPASS') audioController.playFilteredNoise(1.1, 0.32, 90) // thunderclap entrance
                    else sweep(320, 780, 0.28, 'triangle', 0.1)
                    break
                case 'finish':
                    if (e.event === 'THUNDERPASS') {
                        // STORM WINGS ceremony — low rumble, then the rising
                        // storm flourish (a distinct variant of the graduate's)
                        tone(98, 0.5, 'sawtooth', 0.11)
                        tone(220, 0.14, 'square', 0.08, 0.16)
                        tone(261.6, 0.14, 'square', 0.08, 0.30)
                        tone(329.6, 0.18, 'square', 0.09, 0.44)
                        tone(392, 0.34, 'square', 0.09, 0.60)
                    } else {
                        tone(660, 0.1); tone(880, 0.1, 'square', 0.09, 0.11); tone(1174, 0.16, 'square', 0.09, 0.22)
                    }
                    break
                case 'graduate': audioController.playFanfare(); break
                case 'crash': audioController.playFilteredNoise(0.4, 0.3, 260); break
                case 'splash': audioController.playFilteredNoise(0.3, 0.16, 900); break
                case 'drop': sweep(500, 180, 0.22, 'triangle', 0.08); break
                case 'hit':
                    if (e.score >= 300) { tone(988, 0.09); tone(1318, 0.12, 'square', 0.08, 0.09) }
                    else if (e.score > 0) tone(784, 0.1)
                    else tone(200, 0.16, 'sawtooth', 0.07)
                    break
                case 'land': tone(523, 0.12); tone(784, 0.16, 'triangle', 0.08, 0.1); break
                case 'switch': sweep(240, 520, 0.18, 'square', 0.06); break
                default: break
            }
        }
        const drain = (g) => {
            for (const e of g.events) {
                sfxFor(g, e)
                if (e.kind === 'ring') banner(`RING ${e.idx}/8`, 1.1)
                if (e.kind === 'gate') {
                    banner(e.idx === 1 ? 'GATE 1/5 — ENTER THE STORM' : `GATE ${e.idx}/5`, 1.2)
                    const pg = g.world.passRings[e.idx - 1] // the just-passed ring
                    if (pg) gl.burst(pg.x, pg.y, pg.z, [0.78, 0.66, 1], 22, 5.5) // violet halo
                }
                if (e.kind === 'start') banner(e.event, 2.2)
                if (e.kind === 'finish') {
                    if (e.event === 'THUNDERPASS') banner('⚡ STORM WINGS ⚡', 3.0)
                    else banner(`${e.event} — ${e.gained}`, 2.6)
                }
                if (e.kind === 'graduate') banner(`LICENSE: ${e.license} — ${e.score}`, 4)
                if (e.kind === 'splash') gl.burst(g.p.x, 1.2, g.p.z, [0.85, 0.97, 1], 22, 5)
                if (e.kind === 'crash') gl.burst(g.p.x, g.p.y, g.p.z, [1, 0.8, 0.55], 26, 7)
                if (e.kind === 'hit') gl.burst(g.world.targets[e.target].x, 1.4, g.world.targets[e.target].z, e.score > 200 ? [1, 0.9, 0.4] : [0.9, 0.9, 0.9], 16, 4)
                if (e.kind === 'land') gl.burst(g.p.x, g.p.y + 0.5, g.p.z, [0.95, 0.93, 0.8], 14, 3)
            }
            g.events.length = 0
        }

        const held = { left: false, right: false, up: false, down: false, a: false, b: false }
        const startPlay = () => {
            gs = makeGame(seedFromQuery() ?? randomSeed())
            setOver(null)
            setMode('play')
            tone(520, 0.08)
        }
        const padNow = () => ({
            left: held.left, right: held.right, up: held.up, down: held.down, a: held.a, b: held.b,
            x: clamp((held.right ? 1 : 0) - (held.left ? 1 : 0) + padState.x, -1, 1),
            y: clamp((held.up ? 1 : 0) - (held.down ? 1 : 0) + padState.y, -1, 1),
        })

        const onDown = (e) => {
            const code = e.code
            if (code === 'Escape' || code === 'Backquote' || code === 'Slash') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over') { startPlay(); return }
            if (code === 'ArrowLeft' || code === 'KeyA') held.left = true
            else if (code === 'ArrowRight' || code === 'KeyD') held.right = true
            else if (code === 'ArrowUp' || code === 'KeyW') held.up = true
            else if (code === 'ArrowDown' || code === 'KeyS') held.down = true
            else if (code === 'Space' || code === 'KeyJ') held.a = true
            else if (code === 'KeyB' || code === 'KeyK' || code === 'KeyE') held.b = true
        }
        const onUp = (e) => {
            const code = e.code
            if (code === 'ArrowLeft' || code === 'KeyA') held.left = false
            else if (code === 'ArrowRight' || code === 'KeyD') held.right = false
            else if (code === 'ArrowUp' || code === 'KeyW') held.up = false
            else if (code === 'ArrowDown' || code === 'KeyS') held.down = false
            else if (code === 'Space' || code === 'KeyJ') held.a = false
            else if (code === 'KeyB' || code === 'KeyK' || code === 'KeyE') held.b = false
        }
        const onPointer = () => {
            if (screenRef.current === 'attract' || screenRef.current === 'over') startPlay()
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => gl.resize()
        window.addEventListener('resize', resize)

        let raf = 0
        let last = performance.now()
        let acc = 0
        let shimT = 0
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const ft = Math.min(now - last, 100)
            last = now
            const live = screenRef.current === 'attract' ? demo : gs
            const pausedNow = pausedRef.current

            if (pausedNow) { gl.render(live, 0); return }

            if (contractHoldsLoop()) { acc = 0 }
            else {
                acc += ft
                let guard = 0
                while (acc >= FIXED_DT && guard++ < 6) {
                    acc -= FIXED_DT
                    if (screenRef.current === 'attract') {
                        step(demo, decide(demo))
                        drain(demo)
                        if (demo.done) demo = makeGame((gs.seed ^ 0xbeef) >>> 0)
                    } else if (screenRef.current === 'play') {
                        step(gs, padNow())
                        drain(gs)
                        if (gs.done) {
                            setOver({ score: gs.score, license: gs.license, stormWings: gs.stormWings })
                            setMode('over')
                        }
                    } else {
                        step(gs, decide(gs)) // over: keep the world alive under the card
                        drain(gs)
                    }
                }
            }

            // thermals are visible but were silent: rising air now sings. A
            // soft two-note shimmer whose tempo and pitch ride the lift —
            // teaches the glider's elevator without a tutorial wall. (#3138)
            if (screenRef.current === 'play' && !pausedNow && gs.lift > 0.8) {
                shimT -= ft / 1000
                if (shimT <= 0) {
                    const k = clamp((gs.lift - 0.8) / 2.6, 0, 1)
                    tone(880 + k * 520, 0.18, 'sine', 0.026 + k * 0.018)
                    tone(1318 + k * 660, 0.12, 'sine', 0.014 + k * 0.01, 0.05)
                    shimT = 0.34 - k * 0.14
                }
            } else shimT = 0

            if (screenRef.current === 'attract') gl.orbitAttract(demo, ft / 1000)
            else gl.render(gs, ft / 1000)

            // on-entry hint + warning tick for the pass (HUD/audio only)
            const sc = screenRef.current
            if (sc === 'play' && !pausedRef.current) {
                if (gs.phase === 'pass' && prevPhaseRef.current !== 'pass') {
                    passEnterUntilRef.current = performance.now() + 3800
                    stormWarnedRef.current = false
                }
                if (gs.phase === 'pass' && gs.stormS >= 0.7 && !stormWarnedRef.current) {
                    stormWarnedRef.current = true
                    tone(196, 0.18, 'sawtooth', 0.07)
                    tone(147, 0.22, 'sawtooth', 0.06, 0.09)
                } else if (gs.stormS < 0.55) stormWarnedRef.current = false
            }
            prevPhaseRef.current = gs.phase

            // HUD
            E.speed.textContent = `${String(Math.round((sc === 'attract' ? demo : gs).speed * 1.94)).padStart(3, '0')} KTS`
            E.alt.textContent = `${String(Math.max(0, Math.round((sc === 'attract' ? demo : gs).p.y))).padStart(3, '0')} M`
            const shown = sc === 'attract' ? null : gs
            E.score.textContent = shown ? `SCORE ${shown.score}` : ''
            E.chips.textContent = shown
                ? `RING ${shown.grad.ring ?? '—'} · SPOT ${shown.grad.spot ?? '—'} · DROP ${shown.grad.drop ?? '—'} · ⚡ ${shown.stormWings ? shown.grad.pass : '—'}`
                : ''
            if (sc === 'play' && (shown.phase === 'ring' || shown.phase === 'pass')) E.speed.textContent += ` · ${shown.eventT.toFixed(1)}s`
            const hint = sc === 'play'
                ? (performance.now() < passEnterUntilRef.current ? 'EASE OFF — THE CORE PULLS DOWN'
                    : shown.marker ? `${shown.marker === 'ring' ? 'RING RUN' : shown.marker === 'spot' ? 'SPOT LANDING' : shown.marker === 'pass' ? 'THUNDERPASS' : 'TARGET DROP'} — PRESS SPACE`
                    : shown.phase === 'drop' ? 'A THRUST · B DROP · land at the pads'
                        : shown.phase === 'pass' ? `GATE ${shown.passIdx}/5 · fight the gusts · the core pulls down`
                            : shown.phase === 'free' ? `CRUISE · markers glow near launches · B at school recycles craft` : '')
                : ''
            if (E.hint.textContent !== hint) E.hint.textContent = hint
            if (bannerRef.current.until && performance.now() > bannerRef.current.until) {
                E.banner.style.opacity = '0'
                bannerRef.current.until = 0
            }
            if (sc !== 'play' && sc !== 'over') E.hint.textContent = ''
        }
        raf = requestAnimationFrame(frame)

        exposeFeedbackState(() => ({
            tick: gs ? gs.tick : 0, score: gs ? gs.score : 0, done: gs ? !!gs.done : false,
            seed: gs ? gs.seed : 0, phase: gs ? gs.phase : 'free', craft: gs ? gs.craft : 'plane',
        }))

        exposeGame({
            id: 'skyward',
            buttons: ['a', 'b'],
            reset: (seed) => { gs = makeGame(seed >>> 0); setOver(null); setMode('play'); return stateOf(gs) },
            tick: (pad) => { step(gs, pad); drainQuiet(gs); return stateOf(gs) },
            state: () => stateOf(gs),
            canvas: () => canvas,
        })
        function drainQuiet(g) { g.events.length = 0 }

        if (import.meta.env.DEV) {
            window.__skywardTest = {
                ready: true,
                state: () => stateOf(gs),
                probe: () => ({ screen: screenRef.current, ...stateOf(gs) }),
                start: () => startPlay(),
                checkout: (m) => { checkout(gs, m); return stateOf(gs) },
                recycle: () => { recycleCraft(gs); return stateOf(gs) },
                hash: () => gs.hash,
                gameTime: () => gs.tick / 60,
                simSleep: (secs) => new Promise((res) => {
                    const target = gs.tick + Math.round(secs * 60)
                    const iv = setInterval(() => {
                        if (gs.tick >= target || screenRef.current !== 'play') { clearInterval(iv); res() }
                    }, 16)
                }),
            }
            mountDbg({
                title: 'SKYWARD',
                getState: () => [
                    `screen=${screenRef.current} phase=${gs.phase} craft=${gs.craft}`,
                    `pos=${gs.p.x.toFixed(0)},${gs.p.y.toFixed(0)},${gs.p.z.toFixed(0)} hdg=${(gs.heading * 57.3).toFixed(0)}° spd=${gs.speed.toFixed(1)} vy=${gs.vy.toFixed(1)}`,
                    `rings=${gs.ringsPassed} pass=${gs.passIdx} dropIdx=${gs.dropIdx} grad=${JSON.stringify(gs.grad)} score=${gs.score}`,
                    `marker=${gs.marker ?? '-'} crashes=${gs.crashes} seed=${gs.seed}`,
                ],
                actions: [
                    { label: 'ring', run: () => (checkout(gs, 'ring'), 'ring run') },
                    { label: 'spot', run: () => (checkout(gs, 'spot'), 'spot') },
                    { label: 'drop', run: () => (checkout(gs, 'drop'), 'drop') },
                    { label: 'thunder', run: () => (checkout(gs, 'pass'), 'thunderpass') },
                    { label: 'recycle', run: () => (recycleCraft(gs), gs.craft) },
                    { label: 'graduate', run: () => { gs.grad = { ring: 800, spot: 700, drop: 999 }; gs.score = 2499; gs.done = true; gs.license = 'ACE'; setOver({ score: 2499, license: 'ACE' }); setMode('over') } },
                ],
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            unexposeGame()
            unexposeFeedbackState()
            unmountDbg()
            if (import.meta.env.DEV) delete window.__skywardTest
            gl.dispose()
            canvas.remove()
            hudEl.remove()
        }
    }, [setMode])

    const play = screen === 'play'
    return (
        <div className="relative w-full h-full bg-[#0e2233] overflow-hidden">
            <div ref={stageRef} className="absolute inset-0" />
            {screen === 'attract' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-4xl md:text-5xl font-black tracking-[0.3em] text-white" style={{ textShadow: '0 2px 18px rgba(20,60,90,.8)' }}>
                        SKYWARD
                    </div>
                    <div className="mt-2 text-xs tracking-[0.3em] text-cyan-100/80">FLIGHT SCHOOL · GULLWING ISLE</div>
                    <div className="mt-10"><AttractMessage messages={MESSAGES} /></div>
                    <div className="mt-6 text-[11px] tracking-[0.25em] text-white/70 animate-pulse">{PRESS}</div>
                </div>
            )}
            {over && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                    <div className="text-3xl font-black tracking-[0.25em] text-amber-300">{over.license} LICENSE</div>
                    {over.stormWings && (
                        <div className="mt-2 text-sm font-bold tracking-[0.3em] text-violet-300">⚡ STORM WINGS ⚡</div>
                    )}
                    <div className="mt-3 text-lg tracking-[0.2em] text-white">FINAL SCORE {over.score}</div>
                    <div className="mt-2 text-xs tracking-[0.2em] text-white/70">INSTRUCTORS VOSS · NIMBUS · PIP SALUTE YOU</div>
                    <div className="mt-8 text-[11px] tracking-[0.25em] text-white/70 animate-pulse">ANY KEY · TAP TO FLY AGAIN</div>
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'SKYWARD')} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'DROP', code: 'KeyB' }} />
        </div>
    )
}

export default SkywardGame

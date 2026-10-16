// CIVILIZATION V — Stage 1 "The Founding": the arcade shell.
// The whole world is the pure sim in ./sim.js; the tilted 3D hex map is
// ./art.js; the attract demo (and the harness witness) is the autopilot in
// ./planner.js replayed tick-for-tick through the real step(). One
// fixed-timestep loop owns the clock (the SimCity/heist lesson); React only
// mirrors the HUD. Playable with mouse/touch: tap a tile to select your unit or
// move it, tap END TURN (Space) to advance, E settles your settler, drag to
// orbit, wheel/pinch to zoom. Art rule for 3D titles: render at screen res.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import * as THREE from 'three'
import { CFG, T, newGame, step, stateHash, canFound, CIVS, findPath } from './sim.js'
import { decide } from './planner.js'
import { createView, updateView } from './art.js'

const SIM_MS = 1000 / 60
const GOAL = CFG.capitalSizeToWin

const CivilizationVGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hud = useRef({})
    const setHud = (k) => (el) => { hud.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!import.meta.env.DEV })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.domElement.style.touchAction = 'none'
        renderer.domElement.style.display = 'block'
        wrap.appendChild(renderer.domElement)
        const canvas = renderer.domElement

        let gs = newGame(1, 0)
        let view = createView(gs)
        const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400)
        const cam = { az: 0.6, el: 0.92, dist: 46, tx: 34, tz: 18 }

        let raf = 0, last = 0, acc = 0, toast = 0, toastMsg = ''
        let pending = {}
        const ray = new THREE.Raycaster()
        const ndc = new THREE.Vector2()

        const say = (m) => { toastMsg = m; toast = 170 }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'found') { say(`${e.capital ? 'CAPITAL' : 'CITY'} ${gs.cities[e.city].name.toUpperCase()} FOUNDED`); audioController.playSweep(300, 720, 0.35, 'triangle', 0.09) }
                else if (e.type === 'grow') { say(`${gs.cities[e.city].name.toUpperCase()} GROWS TO ${e.size}`); audioController.playTone(520 + e.size * 40, 0.06, 'square', 0.05) }
                else if (e.type === 'deny') { audioController.playTone(90, 0.09, 'square', 0.05) }
                else if (e.type === 'turnEnd' && e.civ === 0) { audioController.playTone(240, 0.03, 'sine', 0.03) }
                else if (e.type === 'explored' && e.civ === 0 && (e.c + e.r) % 3 === 0) { audioController.playTone(660, 0.02, 'sine', 0.02) }
            }
        }

        const reachSet = () => {
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
            const ring = new Set()
            if (!sel || sel.moves <= 0) return ring
            ring.add(sel.r * CFG.W + sel.c)
            let ringCur = [[sel.c, sel.r]]
            for (let stepN = 0; stepN < sel.moves; stepN++) {
                const next = []
                for (const [c, r] of ringCur) for (const [nc, nr] of neigh(c, r)) {
                    const i = nr * CFG.W + nc
                    if (ring.has(i)) continue
                    const tl = gs.tiles[i]
                    if (tl.terr < T.GRASS || tl.terr > T.HILLS) continue
                    if (gs.units.some((u) => u.alive && u.c === nc && u.r === nr)) continue
                    ring.add(i); next.push([nc, nr])
                }
                ringCur = next
            }
            ring.delete(sel.r * CFG.W + sel.c)
            return ring
        }
        const inb = (c, r) => c >= 0 && r >= 0 && c < CFG.W && r < CFG.H
        const countArr = (a) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i]) n++; return n }
        const NN_EVEN = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
        const NN_ODD = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
        const neigh = (c, r) => (r & 1 ? NN_ODD : NN_EVEN).map(([dc, dr]) => [c + dc, r + dr]).filter(([nc, nr]) => inb(nc, nr))

        const finish = (win) => { setEnd({ win, why: gs.endWhy, turn: gs.turn, size: capSize() }); overAtRef.current = performance.now(); setMode('over'); if (win) audioController.playFanfare(); else audioController.playDeath() }
        const capSize = () => { const cap = gs.cities.find((c) => c.civ === 0 && c.capital); return cap ? cap.size : 0 }

        let demoSc = 0, attractN = 0
        const doSim = (inp) => { step(gs, inp); handleEvents(gs.events.splice(0)); if (gs.end && screenRef.current === 'play') finish(gs.end === 'win') }

        const tickAttract = () => {
            if (gs.end) { const s = 1 + (demoSc++) % 4; gs = newGame(s, 0); view = reinitView(gs); attractN = 0 }
            if (++attractN % 5 === 0) doSim(decide(gs))   // paced: a founding you can watch
        }
        const reinitView = (g) => { destroyView(view); view = createView(g); return view }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickAttract(); return }
            if (sc !== 'play') return
            const inp = { ...pending }; pending = {}
            doSim(inp)
        }

        const applyCam = () => {
            const d = cam.dist
            camera.position.set(cam.tx + d * Math.sin(cam.el) * Math.sin(cam.az), cam.dist * Math.cos(cam.el), cam.tz + d * Math.sin(cam.el) * Math.cos(cam.az))
            camera.lookAt(cam.tx, 2, cam.tz)
        }

        const paint = () => {
            updateView(view, gs, { reach: screenRef.current === 'play' ? reachSet() : null })
            renderer.render(view.scene, camera)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const C = gs.civs[0]
            const cap = gs.cities.find((c) => c.civ === 0 && c.capital)
            const h = hud.current
            if (h.gold) h.gold.textContent = `${C.gold}`
            if (h.sci) h.sci.textContent = `${C.science}`
            if (h.cult) h.cult.textContent = `${C.culture || 0}`
            if (h.turn) h.turn.textContent = `TURN ${gs.turn}/${CFG.turnLimit}`
            if (h.cap) h.cap.textContent = cap ? `CAPITAL ${cap.name} · size ${cap.size}/${GOAL}` : 'NO CITY — press E to settle'
            if (h.cities) h.cities.textContent = `cities ${gs.cities.filter((c) => c.civ === 0 && c.alive).length}`
            if (h.sel) h.sel.textContent = (() => { const s = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0); return s ? `${s.kind} · ${s.moves}/${s.maxMoves} moves` : 'tap a unit' })()
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250); last = ts
            if (!pausedRef.current) { acc += ft; let g = 0; while (acc >= SIM_MS && g++ < 8) { doFrameSim(); acc -= SIM_MS } }
            applyCam(); paint(); syncHud()
        }

        // --------------------------------------------------------------- input --
        const pickTile = (clientX, clientY) => {
            const r = canvas.getBoundingClientRect()
            if (!r.width || !r.height) return null
            ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
            ray.setFromCamera(ndc, camera)
            const hit = ray.intersectObject(view.hexes)[0]
            if (!hit || hit.instanceId == null) return null
            const i = hit.instanceId
            return { c: i % CFG.W, r: (i - (i % CFG.W)) / CFG.W }
        }
        const clickTile = (c, r) => {
            if (!inb(c, r)) return
            if (!gs.explored[0][r * CFG.W + c]) { say('UNKNOWN LAND'); return }
            const own = gs.units.find((u) => u.alive && u.civ === 0 && u.c === c && u.r === r)
            if (own) { gs.selected = own.id; pending = { select: own.id }; audioController.playTone(440, 0.03, 'sine', 0.04); return }
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
            if (sel && sel.moves > 0) { const ok = findPath(gs, sel, c, r); if (ok && ok.length) { pending = { move: [c, r] }; audioController.playTone(300, 0.02, 'sine', 0.03) } else audioController.playTone(120, 0.05, 'square', 0.04) }
        }
        const doSettle = () => {
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'SETTLER')
            if (!sel) { say('SELECT A SETTLER'); return }
            const why = canFound(gs, 0, sel.c, sel.r, sel)
            if (why !== true) { say(why === 'too close to a city' ? 'TOO CLOSE TO A CITY' : why === 'water or mountain' ? 'CANNOT SETTLE THERE' : 'CANNOT SETTLE'); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { found: true }
        }
        const endTurn = () => { pending = { endTurn: true }; audioController.playTone(200, 0.05, 'sine', 0.04) }

        let drag = null
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(1); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (e.code === 'Space' || e.code === 'Enter') { endTurn(); return }
            if (e.code === 'KeyE' || e.code === 'KeyB') { doSettle(); return }
            if (e.code === 'ArrowLeft') { cam.az -= 0.12; return }
            if (e.code === 'ArrowRight') { cam.az += 0.12; return }
            if (e.code === 'ArrowUp') { cam.el = Math.min(1.4, cam.el + 0.06); return }
            if (e.code === 'ArrowDown') { cam.el = Math.max(0.35, cam.el - 0.06); return }
        }
        const onWheel = (e) => { e.preventDefault && e.preventDefault(); cam.dist = Math.max(18, Math.min(90, cam.dist + (e.deltaY > 0 ? 4 : -4))) }

        const onPointerDown = (e) => { const sc = screenRef.current; if (sc === 'attract') { startPlay(1); return } if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return } drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, az: cam.az, el: cam.el } }
        const onPointerMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy)); cam.az = drag.az - dx * 0.006; cam.el = Math.max(0.35, Math.min(1.4, drag.el + dy * 0.004)) }
        const onPointerUp = (e) => { if (!drag) return; if (drag.moved < 8 && screenRef.current === 'play') { const t = pickTile(e.clientX, e.clientY); if (t) clickTile(t.c, t.r) } drag = null }

        const startPlay = (seed = 1) => {
            gs = newGame(seed, 0); view = reinitView(gs)
            const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
            if (s) { gs.selected = s.id; const w = view.hexToWorld(s.c, s.r); cam.tx = w.x; cam.tz = w.z }
            pending = {}
            setMode('play')
            say('FIND A SITE — PRESS E TO SETTLE YOUR CAPITAL')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        window.addEventListener('keydown', onDown)
        window.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            renderer.setSize(r.width, r.height, false)
            camera.aspect = r.width / r.height
            camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__civTest = {
                probe: () => ({ screen: screenRef.current, tick: gs.tick, turn: gs.turn, phase: gs.phase, end: gs.end, why: gs.endWhy,
                    gold: gs.civs[0].gold, science: gs.civs[0].science, culture: gs.civs[0].culture || 0,
                    capitalSize: capSize(), playerCities: gs.cities.filter((c) => c.civ === 0 && c.alive).length, totalCities: gs.cities.filter((c) => c.alive).length,
                    selected: gs.selected, units0: gs.units.filter((u) => u.civ === 0 && u.alive).map((u) => ({ id: u.id, kind: u.kind, c: u.c, r: u.r, moves: u.moves })),
                    explored0: countArr(gs.explored[0]) }),
                start: startPlay, hash: () => stateHash(gs), select: (id) => { pending = { select: id } },
                move: (c, r) => { pending = { move: [c, r] } }, settle: () => { pending = { found: true } }, endTurn: () => { pending = { endTurn: true } },
                auto: (turns = 100) => { let n = 0; while (!gs.end && n < turns * 400 && screenRef.current === 'play') { doSim(decide(gs)); n++ } return { end: gs.end, turns: gs.turn, size: capSize() } },
            }
            mountDbg({
                title: 'CIVILIZATION V',
                getState: () => [
                    `TURN ${gs.turn}/${CFG.turnLimit}  phase ${gs.phase}  end ${gs.end || '-'} ${gs.endWhy || ''}`,
                    `ROME gold ${gs.civs[0].gold}  sci ${gs.civs[0].science}  culture ${gs.civs[0].culture || 0}  goal capital size ${capSize()}/${GOAL}`,
                    `player cities ${gs.cities.filter((c) => c.civ === 0 && c.alive).length}  total ${gs.cities.filter((c) => c.alive).length}  units0 ${gs.units.filter((u) => u.civ === 0 && u.alive).length}  explored ${countArr(gs.explored[0])}`,
                    `selected ${gs.selected}  tick ${gs.tick}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { if (gs.end) return `already ${gs.end}`; const clone = structuredClone(gs); clone.events = []; let n = 0; while (!clone.end && n < 40000) step(clone, decide(clone)); return `$ planner replays THIS map from here to ${clone.end} at turn ${clone.turn} (capital ${capSizeOf(clone)})` } },
                    { label: 'SETTLE HERE', run: () => { doSettle(); return 'issued settle' } },
                    { label: '+300 GOLD', run: () => { gs.civs[0].gold += 300; return '+300 gold (the ledger is real: gold only buys AI settlers)' } },
                ],
            })
        }
        const capSizeOf = (g) => { const c = g.cities.find((x) => x.civ === 0 && x.capital); return c ? c.size : 0 }

        return () => {
            if (import.meta.env.DEV) { if (window.__civTest) delete window.__civTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('wheel', onWheel)
            canvas.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            destroyView(view)
            renderer.dispose()
            canvas.remove()
        }
    }, [setMode])

    function destroyView(v) {
        if (!v || !v.scene) return
        v.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const k of ['map', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose() }) })
    }

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex flex-wrap items-center gap-2 text-white font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-red-700/70 border border-red-300/50 text-red-50 font-bold">ROME</span>
                    <span ref={setHud('turn')} className="text-cyan-200">TURN 1/40</span>
                    <span ref={setHud('cap')} className="text-amber-200">NO CITY — press E to settle</span>
                    <span ref={setHud('gold')} className="text-yellow-300" title="Gold">◈0</span>
                    <span ref={setHud('sci')} className="text-sky-300" title="Science">✦0</span>
                    <span ref={setHud('cult')} className="text-fuchsia-300" title="Culture">❦0</span>
                    <span ref={setHud('cities')} className="text-emerald-200/80">cities 0</span>
                    <span ref={setHud('sel')} className="text-white/70 ml-auto">tap a unit</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, color: '#ffe9a8', textShadow: '0 0 12px #c80' }} />
                <div className="absolute bottom-3 right-3 pointer-events-none">
                    <div className="border border-amber-300/50 rounded px-3 py-1 bg-black/50 text-amber-100 font-mono text-[11px]">END TURN · Space</div>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-5xl font-black tracking-wide" style={{ color: '#e8c56a', textShadow: '0 2px 0 #6b4a12, 0 10px 26px #000' }}>CIVILIZATION</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm tracking-[0.3em]">STAGE 1 · THE FOUNDING</p>
                    <p className="text-white font-mono font-bold mt-3 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-3 px-8 leading-4">
                        one settler, one warrior — walk out through the fog and pick your ground<br />
                        tap a tile to move · E settles your capital · Space ends the turn<br />
                        cities work their ring, grow on surplus food, spread coloured borders<br />
                        grow your capital to size {GOAL} before turn {CFG.turnLimit} · three rival civs are founding too<br />
                        drag to orbit the world · wheel or pinch to zoom · the demo is the autopilot&apos;s own proven founding
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/72 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'AN AGE OF GOLD' : 'HISTORY PASSED YOU BY'}</h2>
                    <p className="text-lg mb-1">{end.win ? `Your capital reached size ${end.size} by turn ${end.turn}` : `${end.why}`}</p>
                    <p className="text-sm text-amber-200/80 mb-4">Stage 1 proves the founding loop: explore, settle, work, grow. Tech, war, wonders and the four victories are the next stages.</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'CIVILIZATION V')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'E', code: 'KeyE' }} />
        </div>
    )
}

export default CivilizationVGame

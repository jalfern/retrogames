import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { createSim, WORLD_WIDTH, START_LIVES, watchRoute } from './sim.js'
import { attractFrame, DIM } from './attract.js'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'

const HI_KEY = 'retrogames-defender-hi'

const DefenderGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const [attractUi, setAttractUi] = React.useState(true) // #1637: DOM mirror of the attract flag
    const [watching, setWatching] = React.useState(false) // #1637 WATCH: mirrors the seat flag for the chrome
    const watchingRef = useRef(false)

    // Resume callback
    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // GAME CONSTANTS
        const MINIMAP_HEIGHT = 50

        // RUN STATE
        let viewWidth = 0
        let viewHeight = 0
        let cameraX = 0
        let isAttractMode = true
        let attractTick = 0
        let tickN = 0
        let seed = 0
        let rand = seedRng(1)
        let sim = null
        let thrustFacing = 0
        let hiScore = 0
        try { hiScore = Number(localStorage.getItem(HI_KEY)) || 0 } catch { hiScore = 0 }

        // INPUT
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const startRun = (forcedSeed) => {
            seed = forcedSeed !== undefined && forcedSeed !== null
                ? forcedSeed >>> 0
                : (seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))
            rand = seedRng(seed)
            const h = viewHeight || (containerRef.current ? containerRef.current.getBoundingClientRect().height : 600)
            sim = createSim({ rand, height: h })
            isAttractMode = false
            setAttractUi(false)
            watchingRef.current = false // #1637 a new run starts with the stick in your hand
            setWatching(false)
            Object.keys(keys).forEach((k) => { keys[k] = false })
        }

        const soundEvents = () => {
            for (const ev of sim.events) {
                if (ev.t === 'killLander') audioController.playTone(150, 0.1, 'sawtooth', 0.2)
                else if (ev.t === 'killMutant') { audioController.playTone(90, 0.14, 'sawtooth', 0.22); audioController.playNoise(0.08, 0.12) }
                else if (ev.t === 'catch') audioController.playSweep(300, 700, 0.12, 'triangle', 0.12)
                else if (ev.t === 'deliver') { audioController.playTone(600, 0.08, 'square', 0.12); audioController.playTone(900, 0.12, 'square', 0.12, 0.08) }
                else if (ev.t === 'wave') audioController.playSweep(200, 500 + Math.min(500, sim.wave * 80), 0.25, 'square', 0.12) // pitch ramps per wave (#1531)
                else if (ev.t === 'die') { audioController.playNoise(0.25, 0.25); audioController.playTone(70, 0.3, 'sawtooth', 0.2) }
                else if (ev.t === 'over') {
                    audioController.playSweep(300, 60, 0.6, 'sawtooth', 0.18)
                    // #1637 WATCH: the end of the patrol is the end of the
                    // route — the seat releases silently, like the racer's flag.
                    if (watchingRef.current) { watchingRef.current = false; setWatching(false) }
                }
                else if (ev.t === 'bonus') audioController.playTone(1200, 0.15, 'square', 0.12)
                else if (ev.t === 'mutate') audioController.playTone(500, 0.06, 'square', 0.08)
                else if (ev.t === 'abduct') audioController.playTone(120, 0.12, 'triangle', 0.1)
                else if (ev.t === 'humanDied') audioController.playSweep(500, 120, 0.2, 'sawtooth', 0.14)
            }
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode || sim.over) { startRun(); return }
            // #1637 WATCH: Y seats the proven patrol (watchRoute drives the
            // real sim); any driving key hands the wheel back and the player
            // continues from exactly where the prover left it.
            if (isWatchKey(e)) { watchingRef.current = !watchingRef.current; setWatching(watchingRef.current); if (watchingRef.current) playWatchStart(); else playWatchStop(); return }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'Space') keys.Space = true
            if (e.code === 'ArrowUp' || e.key === 'w') keys.ArrowUp = true
            if (e.code === 'ArrowDown' || e.key === 's') keys.ArrowDown = true
            if (e.code === 'ArrowLeft' || e.key === 'a') keys.ArrowLeft = true
            if (e.code === 'ArrowRight' || e.key === 'd') keys.ArrowRight = true
        }

        const handleKeyUp = (e) => {
            if (e.code === 'Space') keys.Space = false
            if (e.code === 'ArrowUp' || e.key === 'w') keys.ArrowUp = false
            if (e.code === 'ArrowDown' || e.key === 's') keys.ArrowDown = false
            if (e.code === 'ArrowLeft' || e.key === 'a') keys.ArrowLeft = false
            if (e.code === 'ArrowRight' || e.key === 'd') keys.ArrowRight = false
        }

        // Phones: any tap starts or restarts the run.
        const handleCanvasTap = (e) => {
            if (pausedRef.current) return
            // #1637: the WATCH pill lives over the canvas on phones — its press
            // is the seat key, never a takeover tap.
            if (e && e.target && e.target.closest && e.target.closest('[data-watch-toggle]')) return
            if (isAttractMode || sim.over) { startRun(); return }
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() } // #1637 a tap takes the stick back
        }

        const resize = () => {
            if (!canvas || !ctx || !containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            viewWidth = width
            viewHeight = height
            ctx.imageSmoothingEnabled = false
        }

        const update = () => {
            tickN += 1
            // #1637 WATCH: attract and the Y seat both run watchRoute from
            // sim.js — one brain, honest from any position.
            const input = isAttractMode
                ? watchRoute(sim)
                : sim.over
                    ? { left: false, right: false, up: false, down: false, fire: false }
                    : watchingRef.current
                        ? watchRoute(sim)
                        : { left: keys.ArrowLeft, right: keys.ArrowRight, up: keys.ArrowUp, down: keys.ArrowDown, fire: keys.Space }
            if (isAttractMode) sim.player.invuln = 999999 // the demo does not die
            thrustFacing = input.left ? -1 : input.right ? 1 : 0
            sim.step(input)
            soundEvents()
            // #1531 feel: thrust was silent — hum while the fighter accelerates,
            // and pulse the abduction telegraph while any lander is diving.
            if (!sim.over && sim.player.dark <= 0 && thrustFacing !== 0 && tickN % 5 === 0) {
                audioController.playTone(50 + Math.abs(sim.player.vx) * 8, 0.1, 'sawtooth', 0.045)
            }
            if (!sim.over && tickN % 14 === 0 && sim.enemies.some((e) => e.state === 'descend')) {
                audioController.playSweep(140, 70, 0.2, 'triangle', 0.06)
            }
            if (sim.score > hiScore) {
                hiScore = sim.score
                try { localStorage.setItem(HI_KEY, String(hiScore)) } catch { /* private mode */ }
            }
        }

        const drawHuman = (h, anim) => {
            ctx.strokeStyle = '#ffd23f'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(h.x, h.y - 5, 2, 0, Math.PI * 2)
            ctx.moveTo(h.x, h.y - 3); ctx.lineTo(h.x, h.y + 2)
            ctx.moveTo(h.x - 3, h.y - 1); ctx.lineTo(h.x + 3, h.y - 1)
            // 2-frame walk (original humanoid shuffles; frozen when carried).
            const step = anim ? ((tickN >> 3) % 2 === 0 ? 1 : -1) : 0
            ctx.moveTo(h.x, h.y + 2); ctx.lineTo(h.x - 2 + step, h.y + 5)
            ctx.moveTo(h.x, h.y + 2); ctx.lineTo(h.x + 2 + step, h.y + 5)
            ctx.stroke()
        }

        const drawLander = (e) => {
            ctx.strokeStyle = e.type === 'mutant' ? '#ff5555' : '#cccccc'
            ctx.lineWidth = 2
            ctx.save()
            ctx.translate(e.x, e.y)
            // #1531: the machine's sprites pulsed — legs/wings flare every few frames.
            const pulse = (tickN >> 3) % 2 === 0 ? 0 : 2
            // Abduction telegraph: a flickering tractor beam down to the human
            // being dive-targeted, so the chain reads before the grab (#1531).
            if (e.type === 'lander' && e.state === 'descend' && e.target != null && sim.humans[e.target] && sim.humans[e.target].state === 'walk') {
                const len = sim.humans[e.target].y - e.y
                if (len > 12) {
                    ctx.strokeStyle = (tickN >> 2) % 2 === 0 ? 'rgba(120,220,255,0.45)' : 'rgba(120,220,255,0.2)'
                    ctx.beginPath()
                    ctx.moveTo(-4, 10); ctx.lineTo(-8, len)
                    ctx.moveTo(4, 10); ctx.lineTo(8, len)
                    ctx.stroke()
                    ctx.strokeStyle = '#cccccc'
                }
            }
            ctx.beginPath()
            if (e.type === 'mutant') {
                // Diamond with wings — the mutated shell, meaner silhouette.
                ctx.moveTo(0, -10); ctx.lineTo(12, 0); ctx.lineTo(0, 10); ctx.lineTo(-12, 0); ctx.closePath()
                ctx.moveTo(-12, 0); ctx.lineTo(-18, -6 - pulse)
                ctx.moveTo(12, 0); ctx.lineTo(18, -6 - pulse)
            } else {
                // Lander shell with legs and the tractor bar beneath.
                ctx.rect(-10, -10, 20, 20)
                ctx.moveTo(-10, 10); ctx.lineTo(-10, 5 + pulse); ctx.lineTo(10, 5 + pulse); ctx.lineTo(10, 10)
                ctx.moveTo(-5 - pulse, 0); ctx.lineTo(5 + pulse, 0)
                if (e.carry !== null) { ctx.moveTo(-6, 12); ctx.lineTo(6, 12) }
            }
            ctx.stroke()
            ctx.restore()
        }

        // Draw world objects at x and x±W so the seam wraps seamlessly.
        const atSeam = (fn) => {
            fn(0)
            fn(-WORLD_WIDTH)
            fn(WORLD_WIDTH)
        }

        const draw = () => {
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            const p = sim.player
            // Camera follows across the wrap seam.
            cameraX = ((p.x - viewWidth / 2) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
            const camR = cameraX + viewWidth

            ctx.save()
            ctx.translate(-cameraX, 0)

            // Stars: fixed on the planet, gentle twinkle.
            ctx.fillStyle = 'white'
            for (let i = 0; i < 120; i++) {
                if ((tickN + i * 17) % 240 < 60) continue
                const sx = (i * 137) % WORLD_WIDTH
                const sy = (i * 53) % viewHeight
                atSeam((off) => {
                    const x = sx + off
                    if (x >= cameraX - 2 && x <= camR + 2) ctx.fillRect(x, sy, 2, 2)
                })
            }

            // Terrain wireframe, twice for the seam.
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1
            atSeam((off) => {
                ctx.beginPath()
                for (let i = 0; i < sim.terrain.length; i++) {
                    const x = i * 10 + off
                    if (x < cameraX - 12 || x > camR + 12) continue
                    if (i === 0) ctx.moveTo(x, sim.terrain[i])
                    else ctx.lineTo(x, sim.terrain[i])
                }
                ctx.stroke()
            })

            // Humans
            sim.humans.forEach((h) => {
                if (h.state === 'dead') return
                atSeam((off) => { if (h.x + off >= cameraX - 20 && h.x + off <= camR + 20) { ctx.save(); ctx.translate(off, 0); drawHuman(h, h.state === 'walk'); ctx.restore() } })
            })

            // Enemies
            sim.enemies.forEach((e) => {
                atSeam((off) => { if (e.x + off >= cameraX - 24 && e.x + off <= camR + 24) { ctx.save(); ctx.translate(off, 0); drawLander(e); ctx.restore() } })
            })

            // Lasers
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            sim.lasers.forEach((l) => {
                atSeam((off) => {
                    const x = l.x + off
                    if (x >= cameraX - 44 && x <= camR + 44) {
                        ctx.beginPath()
                        ctx.moveTo(x, l.y)
                        ctx.lineTo(x + 40 * (l.vx > 0 ? 1 : -1), l.y)
                        ctx.stroke()
                    }
                })
            })

            // Particles
            ctx.fillStyle = 'white'
            sim.particles.forEach((pt) => ctx.fillRect(pt.x, pt.y, 2, 2))

            // Player — the Jupiter fighter (dark during respawn blink).
            if (p.dark <= 0 && !(p.invuln > 0 && Math.floor(tickN / 6) % 2 === 0)) {
                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 2
                ctx.save()
                ctx.translate(p.x, p.y)
                ctx.scale(p.facing, 1)
                ctx.beginPath()
                ctx.moveTo(14, 0); ctx.lineTo(-12, -6); ctx.lineTo(-12, 6); ctx.lineTo(14, 0)
                ctx.moveTo(-12, -6); ctx.lineTo(-18, 0); ctx.lineTo(-12, 6)
                ctx.moveTo(2, -4); ctx.lineTo(2, -10)
                ctx.stroke()
                if (thrustFacing === p.facing && thrustFacing !== 0) {
                    ctx.beginPath()
                    ctx.moveTo(-18, 0)
                    ctx.lineTo(-28 - (tickN % 3) * 3, 0)
                    ctx.strokeStyle = tickN % 2 ? 'white' : 'gray'
                    ctx.stroke()
                }
                ctx.restore()
                if (sim.carrying !== null) {
                    const h = sim.humans[sim.carrying]
                    ctx.save(); ctx.translate(0, 0); drawHuman({ x: h.x, y: h.y }, false); ctx.restore()
                }
            }

            ctx.restore()

            // --- SCANNER (radar): the whole planet compressed up top ---
            const sc = viewWidth / WORLD_WIDTH
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, viewWidth, MINIMAP_HEIGHT)
            ctx.strokeStyle = '#444444'
            ctx.lineWidth = 1
            ctx.strokeRect(1, 1, viewWidth - 2, MINIMAP_HEIGHT - 2)
            // terrain silhouette on the radar
            ctx.strokeStyle = '#3f7f3f'
            ctx.beginPath()
            for (let i = 0; i < sim.terrain.length; i++) {
                const x = i * 10 * sc
                const y = MINIMAP_HEIGHT - 4 - (viewHeight - sim.terrain[i]) * 0.06
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
            }
            ctx.stroke()
            // radar dots flicker like the CRT scanner (#1531)
            sim.humans.forEach((h, i) => { if (h.state !== 'dead' && (tickN + i * 7) % 24 > 3) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(h.x * sc - 1, MINIMAP_HEIGHT - 8, 2, 2) } })
            sim.enemies.forEach((e, i) => { if ((tickN + i * 5) % 18 > 2) { ctx.fillStyle = e.type === 'mutant' ? '#ff5555' : '#aaaaaa'; ctx.fillRect(e.x * sc - 1, Math.max(3, Math.min(MINIMAP_HEIGHT - 3, e.y * 0.05 + 3)), 2, 2) } })
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(p.x * sc - 2, Math.max(3, Math.min(MINIMAP_HEIGHT - 3, p.y * 0.05 + 3)), 4, 3)
            // camera window (may split across the seam)
            ctx.strokeStyle = '#ffffff'
            ctx.strokeRect(cameraX * sc, 2, Math.min(viewWidth, WORLD_WIDTH - cameraX) * sc, MINIMAP_HEIGHT - 4)
            if (cameraX + viewWidth > WORLD_WIDTH) ctx.strokeRect(0, 2, (cameraX + viewWidth - WORLD_WIDTH) * sc, MINIMAP_HEIGHT - 4)

            // --- HUD: score sheet under the radar, arcade-style ---
            ctx.textAlign = 'left'
            ctx.font = '14px monospace'
            ctx.fillStyle = '#ff5555'
            ctx.fillText(String(sim.score).padStart(6, '0'), 8, MINIMAP_HEIGHT + 16)
            ctx.fillStyle = '#ffd23f'
            ctx.fillText(String(hiScore).padStart(6, '0'), 8, MINIMAP_HEIGHT + 32)
            ctx.textAlign = 'right'
            ctx.fillStyle = '#9fe39f'
            ctx.fillText(`WAVE ${sim.wave}`, viewWidth - 8, MINIMAP_HEIGHT + 16)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(`${sim.humans.filter((h) => h.state !== 'dead').length}/${sim.humans.length}`, viewWidth - 8, MINIMAP_HEIGHT + 32)
            // remaining ships
            for (let i = 0; i < sim.lives - 1; i++) {
                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 1
                ctx.beginPath()
                const bx = viewWidth - 16 - i * 18
                const by = MINIMAP_HEIGHT + 44
                ctx.moveTo(bx, by); ctx.lineTo(bx - 10, by + 4); ctx.lineTo(bx - 10, by - 4); ctx.closePath()
                ctx.stroke()
            }

            if (isAttractMode) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, viewWidth, viewHeight)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, viewWidth, viewHeight)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
            }

            if (!isAttractMode && sim.over) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, 0, viewWidth, viewHeight)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#ff5555'
                ctx.font = `bold ${Math.max(22, Math.floor(viewWidth * 0.09))}px monospace`
                ctx.fillText('GAME OVER', viewWidth / 2, viewHeight / 2 - 10)
                ctx.fillStyle = '#ffffff'
                ctx.font = '14px monospace'
                ctx.fillText(`SCORE ${sim.score}  WAVE ${sim.wave}`, viewWidth / 2, viewHeight / 2 + 16)
                ctx.fillStyle = '#ffd23f'
                ctx.fillText('ANY KEY / TAP TO RESTART', viewWidth / 2, viewHeight / 2 + 40)
            }
        }

        const init = () => {
            resize()
            startRun()
            isAttractMode = true // the first run demos itself until a key or tap

            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
            window.addEventListener('resize', resize)
            canvas.addEventListener('pointerdown', handleCanvasTap)
            canvas.focus()

            animationFrameId = requestAnimationFrame(loop)
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                accumulator += frameTime
                while (accumulator >= FIXED_DT) {
                    update()
                    accumulator -= FIXED_DT
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        init()

        // QA contract (#377)
        exposeGame({
            id: 'defender',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                tickN = 0
                startRun(s >>> 0)
            },
            tick: (pad) => {
                if (sim.over) { tickN += 1; return }
                if (isAttractMode) startRun()
                keys.ArrowLeft = !!pad.left
                keys.ArrowRight = !!pad.right
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                keys.Space = !!pad.a
                update()
            },
            state: () => ({
                tick: tickN,
                score: sim ? sim.score : 0,
                done: sim ? sim.over : false,
                seed,
                lives: sim ? sim.lives : START_LIVES,
                wave: sim ? sim.wave : 1,
                humans: sim ? sim.humans.filter((h) => h.state !== 'dead').length : 0,
                enemies: sim ? sim.enemies.length : 0,
                playerX: sim ? Math.round(sim.player.x) : 0,
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded rand closure is not JSON-serializable (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN,
            score: sim ? sim.score : 0,
            done: sim ? sim.over : false,
            seed: seed,
            lives: sim ? sim.lives : START_LIVES,
            wave: sim ? sim.wave : 1,
        }))

        if (import.meta.env.DEV) {
            // #1637 watchcheck probes: is the prover patrolling, did it blip,
            // and a serializable slice of the world for the advance predicates.
            window.__defenderTest = {
                watching: () => watchingRef.current && !isAttractMode && !(sim && sim.over),
                watchSfx: watchSfxLog,
                probe: () => ({
                    screen: isAttractMode ? 'attract' : sim && sim.over ? 'over' : 'play',
                    tick: tickN, score: sim ? sim.score : 0, lives: sim ? sim.lives : START_LIVES,
                    wave: sim ? sim.wave : 1, enemies: sim ? sim.enemies.length : 0,
                    humans: sim ? sim.humans.filter((h) => h.state !== 'dead').length : 0,
                    playerX: sim ? Math.round(sim.player.x) : 0, playerY: sim ? Math.round(sim.player.y) : 0,
                }),
            }
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__defenderTest) delete window.__defenderTest
            unexposeGame()
            unexposeFeedbackState()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DEFENDER')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 WATCH — the proven patrol flies; any key, pad push or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls />
        </div>
    )
}

export default DefenderGame

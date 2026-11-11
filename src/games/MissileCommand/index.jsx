import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { makeRun, tickMc, gunnerStep, fireAt, citiesAlive, SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y } from './sim.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'

const MissileCommandGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // WATCH (#1637 b29): the React mirrors of gs.watch — the sim flag is truth.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)
    const attractUiRef = useRef(true)
    // #1748 consumer: RotateHint (portrait + wide canvas) lands its card dead
    // center — exactly where this title's attract copy sits. This 4:3 letterbox
    // is the rare attract-pill collision, so the centered block steps aside
    // while the hint is up; the pill itself anchors top-right and stays
    // reachable through it.
    const [rotHint, setRotHint] = React.useState(false)
    const rotHintRef = useRef(false)

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

        // The whole world lives in sim.js now (b27-shape lift, #1637 b29):
        // makeRun/tickMc are wall-clock-free and fully seeded, so ?seed=N
        // replays the entire raid and the WATCH seat drives the SAME physics
        // the missilecmdcheck sweep certifies (waves 1-5 clean on 100 seeds).
        let gs = makeRun(Math.floor(Math.random() * 1000000))
        let attractTick = 0
        let armUntil = 0 // mouse-arming grace after a seat: pill taps (and the
                         // compat mousemove a touch leaves behind) must not
                         // instantly release the watcher they just seated
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const seat = () => {
            if (gs.state !== 'playing' || gs.over || gs.watch || attractUiRef.current) return
            gs.watch = true
            setWatching(true)
            armUntil = gs.tick + 30
            playWatchStart()
        }
        const release = (blip = true) => {
            if (!gs.watch) return
            gs.watch = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        // ---------- attract ----------
        // The attract pilot keeps its old rough-shooting personality (it is a
        // screensaver, not the proof); the proof is gunnerStep in sim.js. The
        // wander clock rides the sim tick, not Date.now (#1525 hygiene).
        const attractCmd = () => {
            if (gs.state !== 'playing') return null
            let targetMissile = null
            let minHeight = Infinity
            gs.warheads.forEach((m) => {
                if (m.y < GROUND_Y && m.y < minHeight) {
                    targetMissile = m
                    minHeight = m.y
                }
            })
            const crosshair = gs.crosshair
            if (targetMissile) {
                const leadX = targetMissile.x + Math.cos(Math.atan2(targetMissile.targetY - targetMissile.startX, targetMissile.targetX - targetMissile.startX)) * 50
                const leadY = targetMissile.y + Math.sin(Math.atan2(targetMissile.targetY - targetMissile.startY, targetMissile.targetX - targetMissile.startX)) * 50
                const dx = leadX - crosshair.x
                const dy = leadY - crosshair.y
                crosshair.x += dx * 0.1
                crosshair.y += dy * 0.1
                if (gs.rand() < 0.05 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                    return { aimX: crosshair.x, aimY: crosshair.y }
                }
            } else {
                crosshair.x += (Math.sin(gs.tick * 0.06) * SCREEN_WIDTH / 2 + SCREEN_WIDTH / 2 - crosshair.x) * 0.01
                crosshair.y += (SCREEN_HEIGHT / 2 - crosshair.y) * 0.01
            }
            return null
        }

        // ---------- input ----------
        const handleMouseMove = (e) => {
            if (pausedRef.current) return
            if (gs.watch && gs.tick > armUntil) release() // the mouse is the yoke here
            const rect = canvas.getBoundingClientRect()
            const scaleX = SCREEN_WIDTH / rect.width
            const scaleY = SCREEN_HEIGHT / rect.height
            gs.crosshair.x = (e.clientX - rect.left) * scaleX
            gs.crosshair.y = (e.clientY - rect.top) * scaleY
        }

        // phones: a tap on the board starts/restarts the raid (rule: any tap);
        // a tap DURING a watched raid hands the crosshair back.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (attractUiRef.current || gs.over) { startRun(); return }
            if (gs.watch) release()
        }

        const handleClick = () => {
            if (pausedRef.current) return
            if (attractUiRef.current) { startRun(); return }
            if (gs.over) { startRun(); return }
            if (gs.watch) release() // a click means "I'm aiming now" — then it fires
            fireAt(gs, gs.crosshair.x, gs.crosshair.y)
        }

        // fresh raid: new seed (?seed=N wins), whole board rebuilt — called on
        // every human start, key, click or tap (#1473)
        const startRun = () => {
            gs = makeRun(seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))
            attractUiRef.current = false
            setAttractUi(false)
            release(false) // watch never lingers — a new raid starts in your hands
            audioController.playSweep(220, 440, 0.15, 'square', 0.1)
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return
            if (isWatchKey(e)) {
                if (gs.watch) { e.preventDefault(); release() }
                else if (gs.over) { e.preventDefault(); startRun() } // Y is a key too — it restarts a dead board
                else if (!attractUiRef.current) { e.preventDefault(); seat() }
                return
            }
            if (gs.over) { startRun(); return }
            if (attractUiRef.current && (e.code === 'Space' || e.code === 'Enter')) { startRun(); return }
            if (gs.watch && isTakeoverKey(e)) release() // then the key drives for real below
            if (e.code in keys) keys[e.code] = true
            if (e.code === 'Space') fireAt(gs, gs.crosshair.x, gs.crosshair.y) // Fire
        }

        const handleKeyUp = (e) => {
            if (e.code in keys) keys[e.code] = false
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
            ctx.imageSmoothingEnabled = false
        }

        const init = () => {
            resize()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mousedown', handleClick)
            window.addEventListener('resize', resize)
            canvas.addEventListener('pointerdown', handleCanvasTap)
            animationFrameId = requestAnimationFrame(loop)
        }

        // ---------- one fixed tick ----------
        const update = () => {
            if (pausedRef.current) return
            const cmd = attractUiRef.current ? attractCmd() : (gs.watch ? gunnerStep(gs) : null)
            const wasOver = gs.over
            tickMc(gs, cmd)
            for (const ev of gs.events) {
                if (ev === 'pew') audioController.playTone(600, 0.05, 'triangle')
                else if (ev === 'boom') audioController.playTone(100, 0.2, 'noise', 0.5)
            }
            if (gs.over && !wasOver) release(false) // the raid ends in your hands (silent)
        }

        // ---------- draw (the look is the game's own, verbatim) ----------
        const draw = () => {
            const dpr = window.devicePixelRatio || 1
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY) * 0.95

            const transX = (canvas.width / dpr - SCREEN_WIDTH * scale) / 2
            const transY = (canvas.height / dpr - SCREEN_HEIGHT * scale) / 2

            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            ctx.save()
            ctx.translate(transX, transY)
            ctx.scale(scale, scale)

            ctx.beginPath()
            ctx.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            ctx.clip()

            ctx.fillStyle = '#ffff00' // Yellow ground line
            ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 5)

            ctx.fillStyle = '#0000ff' // Blue cities
            gs.cities.forEach((c) => {
                if (c.alive) {
                    ctx.beginPath()
                    ctx.moveTo(c.x - 15, GROUND_Y)
                    ctx.lineTo(c.x - 15, GROUND_Y - 10)
                    ctx.lineTo(c.x - 5, GROUND_Y - 10)
                    ctx.lineTo(c.x, GROUND_Y - 20)
                    ctx.lineTo(c.x + 5, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y)
                    ctx.fill()
                }
            })

            ctx.fillStyle = '#aaaaaa'
            gs.silos.forEach((s) => {
                if (s.alive) {
                    ctx.beginPath()
                    ctx.moveTo(s.x - 20, GROUND_Y)
                    ctx.lineTo(s.x, GROUND_Y - 30)
                    ctx.lineTo(s.x + 20, GROUND_Y)
                    ctx.fill()

                    ctx.fillStyle = '#ffffff'
                    for (let i = 0; i < s.ammo; i++) {
                        let row = 0
                        let col = i
                        if (i > 3) { row = 1; col = i - 4 }
                        if (i > 7) { row = 2; col = i - 8 }
                        ctx.fillRect(s.x - 12 + (col * 6), GROUND_Y - 10 + (row * 4), 4, 4)
                    }
                    ctx.fillStyle = '#aaaaaa'
                }
            })

            gs.abms.forEach((m) => {
                ctx.strokeStyle = '#0000ff' // Blue trail
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)

                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 1
                const tx = m.targetX, ty = m.targetY
                ctx.beginPath()
                ctx.moveTo(tx - 3, ty - 3); ctx.lineTo(tx + 3, ty + 3)
                ctx.moveTo(tx + 3, ty - 3); ctx.lineTo(tx - 3, ty + 3)
                ctx.stroke()
            })

            gs.warheads.forEach((m) => {
                ctx.strokeStyle = '#ff0000' // Red trail
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            })

            gs.blasts.forEach((e) => {
                ctx.fillStyle = e.color
                ctx.beginPath()
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2)
                ctx.fill()
            })

            ctx.strokeStyle = '#ff00ff'
            ctx.lineWidth = 2
            const cx = gs.crosshair.x, cy = gs.crosshair.y
            ctx.beginPath()
            ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy)
            ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10)
            ctx.stroke()

            ctx.fillStyle = '#ff0000'
            ctx.font = '24px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`SCORE: ${gs.score}`, SCREEN_WIDTH / 2, 30)
            ctx.fillStyle = '#0000ff'
            ctx.fillText(`WAVE: ${gs.wave}`, SCREEN_WIDTH / 2, 60)

            if (attractUiRef.current) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, SCREEN_WIDTH, SCREEN_HEIGHT)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                ctx.textAlign = 'start'
            }

            if (gs.state === 'waveEnd') {
                ctx.fillStyle = '#00ff00'
                ctx.font = '40px monospace'
                ctx.fillText(`WAVE COMPLETE`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.font = '20px monospace'
                ctx.fillText(`BONUS POINTS`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40)
            }

            if (gs.state === 'gameOver') {
                ctx.fillStyle = '#ff0000'
                ctx.font = '60px monospace'
                ctx.fillText(`THE END`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
            }

            ctx.restore()
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                const rh = document.documentElement.dataset.rotateHint === '1'
                if (rh !== rotHintRef.current) { rotHintRef.current = rh; setRotHint(rh) } // #1748
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

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tick, score: gs.score, done: gs.state === 'gameOver', seed: gs.seed, wave: gs.wave,
        }))

        mountDbg({
            title: 'MISSILE COMMAND',
            getState: () => [
                `score ${gs.score}  wave ${gs.wave}  state ${gs.state}`,
                `cities ${citiesAlive(gs)}/6  ammo ${gs.silos.map((s) => (s.alive ? s.ammo : 'x')).join(',')}  warheads ${gs.warheads.length}`,
                `seed ${gs.seed}  tick ${gs.tick}  watch ${gs.watch}`,
            ],
            actions: [
                { label: 'Fire at crosshair', run: () => fireAt(gs, gs.crosshair.x, gs.crosshair.y) },
                { label: 'Force game over', run: () => { gs.cities.forEach((c) => { c.alive = false }); gs.over = true; gs.state = 'gameOver' } },
            ],
        })

        // #1637 b29 — the watch contract the pilot drives against (DEV-only).
        if (import.meta.env.DEV) {
            window.__mcTest = {
                watching: () => gs.watch,
                watchSfx: watchSfxLog,
                screen: () => (attractUiRef.current ? 'attract' : gs.state === 'gameOver' ? 'over' : 'play'),
                probe: () => ({
                    tick: gs.tick, score: gs.score, wave: gs.wave, done: gs.over,
                    cities: citiesAlive(gs), silos: gs.silos.filter((s) => s.alive).length,
                    warheads: gs.warheads.length, abms: gs.abms.length,
                    ammo: gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0),
                    watching: gs.watch, seed: gs.seed,
                }),
                // harness fallback for the seat (the pilot presses Y like a player)
                seat: () => { if (!gs.watch) { seat(); } return gs.watch },
                release: () => { release(); return gs.watch },
                start: () => { startRun(); return gs.seed },
            }
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleClick)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeFeedbackState()
            unmountDbg()
            if (import.meta.env.DEV) { if (window.__mcTest) delete window.__mcTest }
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[4/3] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full cursor-none" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MISSILE COMMAND')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press.
                    #1748 consumer: RotateHint's card lands dead-center on this 4:3
                    letterbox (its dismiss button sits exactly on the pill), so the
                    whole centered block steps aside while the hint is up — after a
                    rotate or a PLAY-IN-PORTRAIT dismissal the pill is back, reachable. */}
                {attractUi && !paused && !rotHint && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b29 — the proven route; any key, click, mouse or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls visible={!paused} />
        </div>
    )
}

export default MissileCommandGame

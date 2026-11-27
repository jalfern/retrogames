import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { GW, GH, TOP_PLAT, makeRun, tickDonkeyKong, stateHash, BRACE_WIDTH, BRACE_PLATE, BRACE_PAD, barrelRideFrame, BARREL_SPEED } from './sim.js'
import { attractFrame, DIM } from './attract.js'

// DONKEY KONG — shell only since #1637 b27: canvas, sound, chrome, seat.
// The world, physics and dice live in sim.js (seeded, Node-provable by
// kongcheck); WATCH (Y) seats the proven route the sweep certifies — climb
// zigzag, barrel arcs, zero deaths — and any other key, pad push or tap
// takes over from exactly where the watcher left the runner.

const DonkeyKongGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // The React mirrors of gs.watching / gs.attract — the sim flag is truth,
    // chrome (pill, toast, attract ▶ WATCH) reads the mirror.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // =============================================
        // WORLD (fixed coordinate system 224 x 256, sim.js)
        // =============================================
        let seed = Math.floor(Math.random() * 1000000)
        let gs = makeRun(seed, { attract: true })

        const seat = () => {
            gs.watching = true
            setWatching(true)
            playWatchStart()
        }
        const release = (blip = true) => {
            gs.watching = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        // Fresh run: seed regenerated (?seed=N wins), whole board rebuilt.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            gs = makeRun(seed)
            keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands
            setWatching(false)
            denyFx = 0 // fresh run: no leftover juice chrome
            noClimbCooldown = 0
        }

        // =============================================
        // RESIZE (the shell owns the canvas; the world is fixed 224x256)
        // =============================================
        let viewWidth = 0, viewHeight = 0
        let attractTick = 0
        // #3147: the deny answer — a small visible chevron at the runner,
        // juice-only shell state (never hashed, never counted).
        let denyFx = 0
        let noClimbCooldown = 0
        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                viewWidth = width
                viewHeight = height
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // =============================================
        // INPUT
        // =============================================
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const overStarts = () => gs.over || gs.attract

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            // WATCH (b24 law): Y toggles the route. On attract/game over it
            // starts a fresh run AND seats — the proven climb runs from tick 0.
            if (isWatchKey(e)) {
                if (gs.attract || gs.over) { startRun(); seat(); return }
                if (gs.watching) release(); else seat()
                return
            }

            if (overStarts()) {
                startRun()
            }
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                if (gs.watching && isTakeoverKey(e)) release()
                keys[e.code] = true
            }
            if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') {
                e.preventDefault()
            }
        }
        const handleKeyUp = (e) => {
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = false
            }
        }
        // Phones: any tap starts or restarts the run; a tap DURING a watched
        // run is a takeover (the contract).
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (overStarts()) startRun()
            else if (gs.watching) release()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        // ------------------------------------------------------------------
        // EVENTS — tickDonkeyKong stamps these; the shell keeps all sound so
        // the sim stays pure enough for Node to replay it.
        // ------------------------------------------------------------------
        const applyEvents = (ev) => {
            if (ev.jump) audioController.playTone(400, 0.08, 'square')
            if (ev.jumpedBarrel) audioController.playTone(600, 0.08, 'square')
            // #3754 — the walk-past 50's voice: lower and shorter than the
            // jump-over 100's blip, so the two halves of the arcade's obstacle
            // bonus read as the bigger/smaller pair the §Scoring law says.
            if (ev.passedBarrel) audioController.playTone(500, 0.05, 'square')
            // #2018: the event set was missing DK's throw and the rungs.
            if (ev.barrel) audioController.playTone(160, 0.06, 'triangle')
            // #3641 — barrel-voice grammar: board tick, descent clicks and the
            // dangling-foot clatter, law and stamps in sim.js (never silent).
            for (const v of ev.barrelVoices || []) {
                if (v.noise) audioController.playNoise(v.dur, v.noise)
                if (v.to) audioController.playSweep(v.freq, v.to, v.dur, v.wave, v.vol)
                else audioController.playTone(v.freq, v.dur, v.wave, v.vol)
            }
            if (ev.climbed) audioController.playTone(300, 0.05, 'square')
            if (ev.hang) audioController.playTone(170, 0.06, 'square') // #3618 the last rung catches the hand
            // #3147: the climb refused — a soft ``no'' tick + a chevron,
            // throttled so holding the key doesn't machine-gun.
            if (ev.noClimb && noClimbCooldown <= 0) {
                audioController.playTone(140, 0.05, 'triangle', 0.07)
                denyFx = 10
                noClimbCooldown = 20
            }
            // Mallet voices (#2018): grab, swing, smash, shatter.
            if (ev.hammerUp) audioController.playSweep(300, 700, 0.15, 'square')
            if (ev.swing) audioController.playTone(220, 0.05, 'sawtooth')
            if (ev.hammered) audioController.playNoise(0.12, 0.3)
            if (ev.hammerDown) audioController.playSweep(500, 120, 0.2, 'sawtooth')
            if (ev.died) {
                audioController.playNoise(0.3, 0.4)
                audioController.playSweep(400, 80, 0.4, 'sawtooth')
            }
            if (ev.won) audioController.playSweep(400, 1000, 0.8, 'square')
            // #3598 — the finale's voices: arrival sting, the rivet creak and
            // snap, and the crash of the whole tower.
            if (ev.reached) {
                audioController.playTone(880, 0.07, 'square')
                audioController.playTone(1175, 0.09, 'square')
            }
            if (ev.pull) audioController.playSweep(700, 320, 0.28, 'triangle')
            if (ev.rivet) audioController.playTone(1050, 0.06, 'square')
            if (ev.collapse) {
                audioController.playNoise(0.5, 0.35)
                audioController.playSweep(180, 45, 0.9, 'sawtooth')
            }
            if (ev.over && !gs.attract && gs.watching) release(false) // the run ends in your hands (silent)
        }

        const heldInput = () => ({
            left: keys.ArrowLeft,
            right: keys.ArrowRight,
            up: keys.ArrowUp,
            down: keys.ArrowDown,
            jump: keys.Space,
            // #3618: the human signature. Only tagged input may mount a broken
            // half-ladder — the WATCH seat's candidates arrive untagged and the
            // doctrine "the seat never trusts a broken rung" stays in the sim.
            human: true,
        })

        // =============================================
        // DRAWING (arcade palette; the world is read-only out here)
        // =============================================
        const COL_GIRDER = '#d03030'    // red girders
        const COL_LADDER = '#00ffff'    // cyan ladders
        const COL_BG = '#000000'

        const drawGirder = (p, dy = 0, tilt = 0) => {
            const cx = p.x + p.w / 2
            ctx.save()
            if (dy || tilt) {
                ctx.translate(cx, p.y + dy)
                if (tilt) ctx.rotate(tilt)
                ctx.translate(-cx, -p.y)
            }
            ctx.fillStyle = COL_GIRDER
            // Draw platform as a series of small girder bricks
            const brickW = 8
            const brickH = 4
            for (let bx = p.x; bx < p.x + p.w; bx += brickW) {
                const by = p.y + p.slope * (bx - p.x)
                const bw = Math.min(brickW, p.x + p.w - bx)
                // Two rows of bricks, offset
                ctx.fillRect(bx, by, bw - 0.5, brickH)
                ctx.fillRect(bx, by + brickH, bw - 0.5, brickH)
                // Darker line between rows
                ctx.fillStyle = '#801818'
                ctx.fillRect(bx, by + brickH - 0.5, bw, 1)
                ctx.fillStyle = COL_GIRDER
            }
            ctx.restore()
        }

        // #3598 — the rivets ride her girder: bright cross-studs until the
        // yank takes them; the pulled hole stays dark in the steel.
        const drawRivets = () => {
            if (gs.collapse > 0) return // all out already — the steel is on its way down
            for (const r of gs.rivets) {
                if (r.pulled) {
                    ctx.fillStyle = '#401010'
                    ctx.fillRect(r.x - 2, 49, 4, 3)
                } else {
                    ctx.fillStyle = '#ffd800'
                    ctx.fillRect(r.x - 2, 48, 4, 4)
                    ctx.fillStyle = '#fff8b0'
                    ctx.fillRect(r.x - 1, 49, 2, 2)
                }
            }
        }

        // #3598 — the two top girders lose their grip when the last rivet
        // goes: they tilt away from each other and drop out of the picture.
        const girderCrash = (i) => {
            if (gs.collapse <= 0 || (i !== 5 && i !== 6)) return [0, 0]
            const k = gs.collapse
            return [k * k * 0.012, (i === 6 ? 1 : -1) * Math.min(0.32, k * 0.004)]
        }

        const drawLadder = (l) => {
            ctx.fillStyle = COL_LADDER
            // #3622 — corner ladders hang off the girder end on a brace; the
            // arcade's end-of-girder ladders bolted to the last metre of steel.
            if (l.braceFrom) {
                ctx.strokeStyle = COL_LADDER
                ctx.lineWidth = BRACE_WIDTH
                ctx.beginPath()
                ctx.moveTo(l.braceFrom.x - 3, l.braceFrom.y + 2)
                ctx.lineTo(l.x - 3, l.yTop + 2)
                ctx.moveTo(l.braceFrom.x + 3, l.braceFrom.y + 2)
                ctx.lineTo(l.x + 3, l.yTop + 2)
                ctx.stroke()
                // #3651 — bolted anchors: a gusset plate under the girder at the
                // anchor and a foot pad at the ladder head, so the "this ladder
                // belongs to that girder" story reads at a glance on a phone.
                // Dark holes in the plates ride the same rivet idiom the girders
                // use. Purely visual — the physics never reads them.
                ctx.fillStyle = COL_LADDER
                ctx.fillRect(l.braceFrom.x - BRACE_PLATE.w / 2, l.braceFrom.y + 1, BRACE_PLATE.w, BRACE_PLATE.h)
                ctx.fillRect(l.x - BRACE_PAD.w / 2, l.yTop + 1, BRACE_PAD.w, BRACE_PAD.h)
                ctx.fillStyle = '#00707d' // holes: cyan in the shadow tone of the rail
                ctx.fillRect(l.braceFrom.x - 1, l.braceFrom.y + 2, 2, 2)
                ctx.fillRect(l.x - 1, l.yTop + 2, 2, 2)
                ctx.fillStyle = COL_LADDER // the uprights and rungs below draw in rail colour
            }
            // #3618 half-rungs: a broken ladder is drawn as what it is — the
            // span survives from its base to breakY, the rungs above are gone,
            // two snapped upright stubs mark where they broke.
            const topY = l.broken ? l.breakY : l.yTop
            // Uprights
            ctx.fillRect(l.x - 4, topY, 1.5, l.yBot - topY)
            ctx.fillRect(l.x + 3, topY, 1.5, l.yBot - topY)
            if (l.broken) {
                ctx.fillRect(l.x - 4, l.breakY - 3, 1.5, 3)
                ctx.fillRect(l.x + 3, l.breakY - 2, 1.5, 2)
            }
            // Rungs
            for (let ry = topY + 4; ry < l.yBot; ry += 6) {
                ctx.fillRect(l.x - 4, ry, 8.5, 1.5)
            }
            if (l.broken) ctx.fillRect(l.x - 4, l.breakY, 8.5, 1.5) // the last rung
        }

        const drawHammerItem = (h) => {
            if (h.taken) return
            const tw = Math.floor(gs.tickN / 20) % 2 // idle twinkle so it reads as a pickup
            // Handle (wood) up from its shelf, steel head on top.
            ctx.fillStyle = '#c88040'
            ctx.fillRect(h.x - 1, h.y + 1, 2, 8)
            ctx.fillStyle = tw ? '#e8e8e8' : '#a8a8a8'
            ctx.fillRect(h.x - 5, h.y - 3, 10, 5)
        }

        const drawOilBarrel = () => {
            const ox = 8, oy = 224
            // Barrel shape
            ctx.fillStyle = '#0088ff'
            ctx.fillRect(ox, oy, 16, 20)
            ctx.fillStyle = '#00aaff'
            ctx.fillRect(ox + 2, oy + 2, 12, 4)
            ctx.fillRect(ox + 2, oy + 14, 12, 4)
            // OIL text
            ctx.fillStyle = '#ffffff'
            ctx.font = '5px monospace'
            ctx.textAlign = 'center'
            ctx.fillText('OIL', ox + 8, oy + 13)
            // Fire flicker
            if (gs.tickN % 10 < 5) {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 4, oy - 4, 3, 4)
                ctx.fillRect(ox + 9, oy - 6, 3, 6)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 5, oy - 2, 2, 2)
                ctx.fillRect(ox + 10, oy - 3, 2, 3)
            } else {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 5, oy - 5, 3, 5)
                ctx.fillRect(ox + 8, oy - 3, 3, 3)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 6, oy - 2, 2, 2)
            }
        }

        const drawDK = () => {
            // DK position: on 6th platform (index 5), left side
            const dkPlat = gs.platforms[5]
            const dkX = 16
            // #3598 — when the girders go, the ape goes with them: he drops
            // off the tower onto the barrel pile below (dkFall, sim-owned).
            const dkY = (dkPlat ? dkPlat.y + dkPlat.slope * (dkX + 14 - dkPlat.x) : 72) - 28 + gs.dkFall
            const dkAnimFrame = Math.floor(gs.tickN / 16) % 2 // chest-beat cadence
            const s = 1 // pixel scale

            ctx.fillStyle = '#c84c0c' // brown
            // Body
            ctx.fillRect(dkX + 4*s, dkY + 8*s, 20*s, 12*s)
            // Head
            ctx.fillRect(dkX + 6*s, dkY, 16*s, 10*s)
            // Brow
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 8*s, dkY + 2*s, 12*s, 2*s)
            // Face
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(dkX + 8*s, dkY + 4*s, 12*s, 5*s)
            // Eyes
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(dkX + 10*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillRect(dkX + 16*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 11*s, dkY + 4*s, 1.5*s, 2*s)
            ctx.fillRect(dkX + 17*s, dkY + 4*s, 1.5*s, 2*s)
            // Mouth
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 12*s, dkY + 7*s, 6*s, 1.5*s)

            ctx.fillStyle = '#c84c0c'
            // Arms
            if (gs.dkThrowing) {
                // Throwing pose: arms forward
                ctx.fillRect(dkX + 22*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX - 2*s, dkY + 10*s, 6*s, 4*s)
            } else if (dkAnimFrame === 0) {
                // Beat chest pose 1
                ctx.fillRect(dkX - 2*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX + 24*s, dkY + 8*s, 6*s, 4*s)
            } else {
                // Beat chest pose 2
                ctx.fillRect(dkX, dkY + 6*s, 4*s, 6*s)
                ctx.fillRect(dkX + 22*s, dkY + 6*s, 4*s, 6*s)
            }
            // Legs
            ctx.fillRect(dkX + 6*s, dkY + 20*s, 6*s, 6*s)
            ctx.fillRect(dkX + 16*s, dkY + 20*s, 6*s, 6*s)
        }

        const drawPauline = () => {
            const topPlat = gs.platforms[6]
            const px = topPlat ? topPlat.x + topPlat.w / 2 - 4 : 108
            const base = topPlat ? topPlat.y + topPlat.slope * (px + 4 - topPlat.x) - 20 : 28
            // #3598 — when the tower goes she rides down to a lower girder and
            // waits there: the ape takes the fall, she just lost her perch.
            const g4 = gs.platforms[4]
            const landY = g4 ? g4.y + g4.slope * (px + 4 - g4.x) - 16 : 112
            const py = gs.collapse > 0
                ? base + Math.min(landY - base, gs.collapse * gs.collapse * 0.006)
                : base
            // Dress (pink)
            ctx.fillStyle = '#ff88aa'
            ctx.beginPath()
            ctx.moveTo(px, py + 16)
            ctx.lineTo(px + 4, py + 6)
            ctx.lineTo(px + 8, py + 16)
            ctx.fill()
            // Head
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(px + 2, py, 4, 5)
            // Hair
            ctx.fillStyle = '#ff88aa'
            ctx.fillRect(px + 1, py - 1, 6, 2)
            // HELP text — she stops calling once the tower itself is answering
            if (gs.tickN % 60 < 40 && gs.collapse === 0) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '5px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('HELP!', px + 4, py - 4)
            }
        }

        const drawJumpman = () => {
            const p = gs.player
            // #3598 — the yank: he can't move his feet, but the pull shakes him.
            const mx = p.x + (gs.pullTimer > 0 ? Math.sin(gs.pullTimer * 1.2) * 1.2 : 0)
            const my = p.y
            const dir = p.dir

            ctx.save()
            ctx.translate(mx + p.w / 2, my + p.h)
            ctx.scale(dir, 1)

            if (gs.deathTimer > 0) {
                // Death spin animation
                const angle = (90 - gs.deathTimer) * 0.15
                ctx.rotate(angle)
                // Draw simple X
                ctx.strokeStyle = '#ff0000'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(-5, -14); ctx.lineTo(5, -2)
                ctx.moveTo(5, -14); ctx.lineTo(-5, -2)
                ctx.stroke()
                ctx.restore()
                return
            }

            // Hat (red)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-4, -16, 10, 3)
            ctx.fillRect(-5, -13, 3, 2)

            // Head (skin)
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(-4, -13, 8, 5)

            // Eyes
            ctx.fillStyle = '#000000'
            ctx.fillRect(1, -12, 2, 2)

            // Body (blue overalls over red shirt)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-5, -8, 10, 4)
            ctx.fillStyle = '#0000cc'
            ctx.fillRect(-4, -6, 8, 5)

            // Belt
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(-3, -6, 6, 1)

            // Mallet (#2018): carried on the shoulder, or mid-swing up / flat /
            // down (the original's sequence). The world already flipped by dir,
            // so forward is +x here.
            if (gs.hammer > 0) {
                const phase = gs.swing > 0 ? (gs.swingSeq - 1) % 3 : -1
                if (phase === 0) { // overhead wind-up
                    ctx.fillStyle = '#c88040'; ctx.fillRect(3, -16, 2, 7)
                    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(1, -21, 7, 5)
                } else if (phase === 1) { // flat strike
                    ctx.fillStyle = '#c88040'; ctx.fillRect(3, -9, 7, 2)
                    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(9, -12, 6, 6)
                } else if (phase === 2) { // low smash
                    ctx.fillStyle = '#c88040'; ctx.fillRect(3, -4, 2, 7)
                    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(1, -1, 7, 5)
                } else { // at rest on the shoulder
                    ctx.fillStyle = '#c88040'; ctx.fillRect(1, -13, 2, 6)
                    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(-1, -17, 7, 5)
                }
            }

            if (p.climbing) {
                // Climbing animation
                const climbOff = (Math.floor(p.climbFrame / 6) % 2) * 2
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 3 + climbOff)
                ctx.fillRect(2, -1, 3, 3 + (2 - climbOff))
                // Arms on ladder
                ctx.fillRect(-6, -10 - climbOff, 3, 3)
                ctx.fillRect(3, -10 - (2 - climbOff), 3, 3)
            } else if (Math.abs(p.vx) > 0.3 && p.grounded) {
                // Walking animation
                const step = Math.floor(p.walkFrame / 4) % 4
                ctx.fillStyle = '#e8a060'
                if (step < 2) {
                    ctx.fillRect(-4, -1, 3, 4)
                    ctx.fillRect(2, -1, 3, 3)
                } else {
                    ctx.fillRect(-4, -1, 3, 3)
                    ctx.fillRect(2, -1, 3, 4)
                }
            } else if (!p.grounded) {
                // Jumping
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 2)
                ctx.fillRect(3, -1, 3, 2)
            } else {
                // Standing
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-4, -1, 3, 3)
                ctx.fillRect(2, -1, 3, 3)
            }

            ctx.restore()
        }

        const drawBarrel = (b) => {
            ctx.save()
            ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
            const ride = b.onLadder ? barrelRideFrame(gs.tickN) : null
            if (ride) {
                // #3651 — the descent lives: a half-pixel sway across the rungs
                // and a hair of tilt, while the grip marks below swap rails on the
                // same 4-tick cadence as the descent clicks. Visual-only; gs and
                // the dice stream are untouched.
                ctx.translate(ride.wobble, 0)
                ctx.rotate(ride.wobble * 0.05)
            } else {
                ctx.rotate(b.rot)
            }

            // Barrel body
            ctx.fillStyle = '#c84c0c'
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.fill()

            // Barrel bands
            ctx.strokeStyle = '#ffcc00'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.stroke()
            // Cross detail
            ctx.beginPath()
            ctx.moveTo(-b.w / 3, 0); ctx.lineTo(b.w / 3, 0)
            ctx.moveTo(0, -b.w / 3); ctx.lineTo(0, b.w / 3)
            ctx.stroke()

            if (ride) {
                // Grip marks on the uprights: bright hands on both rails, the
                // near one thicker, both swapping sides every BARREL_CLICK_EVERY.
                const gx = b.w / 2 + 0.5
                ctx.fillStyle = '#ffe27a'
                ctx.fillRect(ride.grip * gx - 1, -1.5, ride.grip > 0 ? 2.5 : 2, 3)
                ctx.fillStyle = '#b8860b'
                ctx.fillRect(-ride.grip * gx - 1, -1.5, ride.grip > 0 ? 2 : 2.5, 3)
            }

            ctx.restore()
        }

        const drawHUD = (sx, sy, scale) => {
            // Draw in screen space
            ctx.fillStyle = '#ffffff'
            ctx.font = `${10 * scale}px monospace`
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE`, sx + 4 * scale, sy - 12 * scale)
            ctx.fillStyle = '#00ffff'
            ctx.fillText(`${gs.score}`, sx + 4 * scale, sy - 4 * scale)

            // Lives
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'right'
            const livesX = sx + GW * scale
            for (let i = 0; i < gs.lives; i++) {
                // Small jumpman head icon
                ctx.fillStyle = '#e40000'
                ctx.fillRect(livesX - 12 * scale - i * 14 * scale, sy - 12 * scale, 8 * scale, 4 * scale)
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(livesX - 11 * scale - i * 14 * scale, sy - 8 * scale, 6 * scale, 4 * scale)
            }
        }

        // =============================================
        // MAIN DRAW
        // =============================================
        const draw = () => {
            ctx.fillStyle = COL_BG
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            // Scale game world to fit view
            const scale = Math.min(viewWidth / GW, viewHeight / (GH + 24)) * 0.95
            const offsetX = (viewWidth - GW * scale) / 2
            const offsetY = (viewHeight - GH * scale) / 2 + 12 * scale

            // HUD above the game area
            drawHUD(offsetX, offsetY, scale)

            ctx.save()
            ctx.translate(offsetX, offsetY)
            ctx.scale(scale, scale)

            // Platforms
            gs.platforms.forEach((p, i) => {
                const [dy, tilt] = girderCrash(i)
                drawGirder(p, dy, tilt)
                if (i === TOP_PLAT) drawRivets()
            })

            // Ladders (broken ones flicker)
            gs.ladders.forEach(l => {
                if (l.broken && gs.tickN % 30 < 15) return
                drawLadder(l)
            })

            // Hammers on their girders (#2018)
            gs.hammers.forEach(h => drawHammerItem(h))

            // Oil barrel
            drawOilBarrel()

            // DK
            drawDK()

            // Pauline
            drawPauline()

            // Barrels
            gs.barrels.forEach(b => drawBarrel(b))

            // Player
            drawJumpman()

            // #3147: the deny answer — a chevron above the runner, fading.
            if (denyFx > 0) {
                const p = gs.player
                const cx = p.x + p.w / 2
                const top = p.y - 5 - (10 - denyFx) * 0.4
                const alpha = Math.min(1, denyFx / 6)
                ctx.fillStyle = `rgba(255, 96, 60, ${alpha})`
                ctx.beginPath()
                ctx.moveTo(cx, top)
                ctx.lineTo(cx - 4, top - 4.5)
                ctx.lineTo(cx + 4, top - 4.5)
                ctx.closePath()
                ctx.fill()
                ctx.fillRect(cx - 1, top - 11, 2, 3)
            }
            denyFx = Math.max(0, denyFx - 1)
            noClimbCooldown = Math.max(0, noClimbCooldown - 1)

            // Attract mode overlay
            if (gs.attract) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, GW, GH)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, GW, GH)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                ctx.textAlign = 'start'
            }

            // Game over
            if (gs.over) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = '#ff0000'
                ctx.font = '12px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('GAME OVER', GW / 2, GH / 2)
            }

            ctx.restore()
        }

        // =============================================
        // GAME LOOP
        // =============================================
        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                // QA contract: while __game.step() drives the sim, the rAF loop
                // yields the clock so scripted ticks stay deterministic.
                if (!contractHoldsLoop()) {
                    accumulator += frameTime
                    while (accumulator >= FIXED_DT) {
                        // The watcher and the attract demo own the wheel; held
                        // keys only reach the tick when the human is driving.
                        const input = gs.attract || gs.watching ? null : heldInput()
                        applyEvents(tickDonkeyKong(gs, input))
                        accumulator -= FIXED_DT
                    }
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        if (import.meta.env.DEV) {
            window.__dkTest = {
                state: () => ({
                    attract: gs.attract, over: gs.over, score: gs.score, lives: gs.lives,
                    x: gs.player.x, y: gs.player.y, climb: gs.player.climbing, barrels: gs.barrels.length,
                }),
                // #1637 b27 — the watch contract the pilot drives against.
                watching: () => gs.watching,
                watchSfx: watchSfxLog,
                probe: () => ({
                    tick: gs.tickN, score: gs.score, lives: gs.lives,
                    x: Math.round(gs.player.x), y: Math.round(gs.player.y),
                    climbing: gs.player.climbing, barrels: gs.barrels.length,
                    attract: gs.attract, over: gs.over,
                    hammer: gs.hammer, swingSeq: gs.swingSeq,
                    passed: gs.player.passedBarrels.size, // #3754 walk-past witness
                    // #3618 half-rung state for the drive harness
                    hang: gs.player.hanging,
                    brk: gs.player.climbLadder && gs.player.climbLadder.broken
                        ? Math.round(gs.player.climbLadder.breakY) : null,
                    // #3651 — barrels riding a ladder [centerX, y] for the drive
                    // harness (DEV-only; physics untouched).
                    rides: gs.barrels.filter(b => b.onLadder)
                        .map(b => [Math.round(b.x + b.w / 2), Math.round(b.y)]),
                }),
                start: startRun,
                // #1637 b26 parity — seat the route without a keyboard (the
                // watchcheck pilot presses Y like a player; this is the fallback).
                seat: () => {
                    if (gs.attract || gs.over) startRun()
                    if (!gs.watching) { gs.watching = true; setWatching(true) }
                    return gs.watching
                },
                // #3598 — finale state for the drive harness (rivets pulled,
                // pull/collapse phase) and a cheat that skips straight to the
                // crash so QA can watch it without climbing.
                rivets: () => gs.rivets.map(r => (r.pulled ? 1 : 0)),
                finale: () => ({ rivetPhase: gs.rivetPhase, pullTimer: gs.pullTimer, collapse: gs.collapse, dkFall: gs.dkFall }),
                topple: () => {
                    gs.rivets.forEach(r => { r.pulled = true })
                    gs.pullTimer = 0
                    gs.pullIdx = -1
                    gs.rivetPhase = true
                    if (gs.collapse === 0 && gs.winTimer === 0 && gs.deathTimer === 0) gs.collapse = 1
                },
                // honest death for the drive (idling on the start corner is not
                // reliably lethal here — barrels roll away from it).
                kill: () => { gs.deathTimer = 90; gs.lives = 1 },
                // #3754 — deterministic live proof of the walk-past 50: same
                // rig as kongcheck §obstacle-bonus (runner settled on a girder,
                // one barrel rolling past on the floor below), driven against
                // the live world. Returns the paid delta.
                walkpast: () => {
                    const s0 = gs.score, n0 = gs.player.passedBarrels.size
                    gs.player.x = 150
                    gs.player.y = 176
                    gs.player.vx = 0; gs.player.vy = 0
                    for (let i = 0; i < 10; i++) tickDonkeyKong(gs, { left: false, right: false, up: false, down: false, jump: false })
                    gs.barrels.push({ x: 120, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
                    let paid = 0
                    for (let i = 0; i < 80; i++) paid += (tickDonkeyKong(gs, { left: false, right: false, up: false, down: false, jump: false }).passedBarrel || 0)
                    return { paid, delta: gs.score - s0, witnesses: gs.player.passedBarrels.size - n0 }
                },
            }
            mountDbg({
                title: 'DONKEY KONG',
                getState: () => [
                    `score ${gs.score}  lives ${gs.lives}  barrels ${gs.barrels.length}`,
                    `jumpman ${Math.round(gs.player.x)},${Math.round(gs.player.y)} climb ${gs.player.climbing}  watching ${gs.watching}`,
                    `seed ${gs.seed}  tick ${gs.tickN}  over ${gs.over}`,
                ],
                actions: [
                    { label: 'Drop a barrel on the player', run: () => { gs.deathTimer = 0; gs.barrels.push({ x: gs.player.x, y: gs.player.y + 4, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false }) } },
                    { label: 'Clear barrels', run: () => { gs.barrels = [] } },
                ],
            })
        }

        // QA contract (#377)
        exposeGame({
            id: 'donkeykong',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                seed = s >>> 0
                gs = makeRun(seed)
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
                setAttractUi(false)
                gs.watching = false // watch never lingers
                setWatching(false)
                denyFx = 0 // fresh run: no leftover juice chrome
                noClimbCooldown = 0
            },
            tick: (pad) => {
                applyEvents(tickDonkeyKong(gs, {
                    left: !!pad.left,
                    right: !!pad.right,
                    up: !!pad.up,
                    down: !!pad.down,
                    jump: !!pad.a,
                }))
            },
            state: () => ({
                tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,
                x: Math.round(gs.player.x), y: Math.round(gs.player.y),
                climbing: gs.player.climbing, barrels: gs.barrels.length,
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded stream rides gs.rngState and
            // the jump-scoring Set holds barrel refs — JSON would drop world
            // identity mid-rollout (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,
        }))

        return () => {
            unexposeFeedbackState()
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__dkTest) delete window.__dkTest
            unexposeGame()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DONKEY KONG')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b27 — the proven climb; any key, pad push or tap takes over. */}
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

export default DonkeyKongGame

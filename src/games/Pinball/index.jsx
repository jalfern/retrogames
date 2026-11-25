import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GAMES } from '../../config/games.js'
import { useGameLoop } from '../../hooks/useGameLoop.js'
import { useVirtualControls } from '../../hooks/useVirtualControls.js'
import { useKeyboard } from '../../hooks/useKeyboard.js'
import PauseOverlay from '../../components/PauseOverlay.jsx'
import AttractPrompt from '../../components/AttractPrompt.jsx'
import VirtualControls from '../../components/VirtualControls.jsx'
import { exposeGame, unexposeGame, exposeDevTools, unexposeDevTools } from '../../utils/testHooks.js'
import { audioController } from '../../utils/AudioController.js'
import { makeGame, stateOf, TABLE, TABLE_TWO, CABS, plungerPower } from './sim.js'
import { PAL, PAL_EMBER, CABS_UI, DMD_MSGS, DMD_MSGS_EMBER, paintField, drawDMD } from './art.js'

/* ===========================================================================
 * PINBALL — "NEON TABLE" (CABINET ONE) + "EMBER RIDER" (CABINET TWO).
 *
 * The attract screen is a ROW OF CABINETS: two real machines side by side,
 * each with its own playfield, DMD and rules. Arrows/tap pick a machine, a
 * plunger pull deals the ball into THAT table. CABINET TWO is the exact
 * x-mirror of CABINET ONE (its lane, kicker pocket and orbit curl are
 * recorded in TABLE_TWO data and mirrored by the engine), with a hotter
 * economy and an oxblood/gold/teal palette — pinballcheck proves the
 * mirror with an equivariance test, not by re-tuning physics.
 *
 * Engine notes live in README.md. One fixed-timestep loop; every moving
 * ball asks blocked() before it moves.
 * ========================================================================= */

const FIXED_DT = 1000 / 60
const W = 360
const H = 640
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
const d2 = (p) => Math.round(p * DPR)

const CAB_ONE = CABS.find((c) => c.id === 'one')
const CAB_TWO = CABS.find((c) => c.id === 'two')

function palFor(ember) { return ember ? PAL_EMBER : PAL }

const sfxFor = (ev, a, ember) => {
    const P = palFor(ember)
    switch (ev.type) {
        case 'bumper': a.playTone(ember ? 660 : 520, 0.03, 'square', 0.09); break
        case 'sling': a.playTone(300, 0.025, 'triangle', 0.09); break
        case 'target': a.playTone(ember ? 980 : 880, 0.03, 'square', 0.09); break
        case 'dropReset': a.playTone(240, 0.04, 'sawtooth', 0.05); break
        case 'spinner': a.playTone(ember ? 1520 : 1600, 0.015, 'square', 0.05); break
        // #3178 rollover pitch ladder: each lane rings brighter than the last
        case 'lane': a.playTone(1240 + 240 * (ev.i || 0), 0.035, 'square', 0.08); break
        case 'lock': a.playSweep(ember ? 240 : 300, ember ? 780 : 900, 0.35, 'square', 0.08); break
        case 'kick': a.playNoise(0.08, 0.11); a.playTone(180, 0.06, 'square', 0.08); break
        case 'multiball': a.playSweep(120, 720, 0.5, 'sawtooth', 0.12); break
        case 'jet': a.playSweep(ember ? 1300 : 1500, ember ? 320 : 400, 0.12, 'sawtooth', 0.06); break
        // #3178 ramp is a chord, not a single chirp — up-sweep plus an overtone
        // swaying a fifth above (ember adds a third: the right loop is a chord)
        case 'ramp':
            a.playSweep(620, 1180, 0.14, 'square', 0.07)
            a.playSweep(930, 1770, 0.14, 'square', 0.05)
            if (ember) a.playSweep(1240, 2360, 0.14, 'square', 0.035)
            break
        // #3178 orbit: a shorter, brighter sweep than the ramp so the fast
        // loop around the top reads as itself, not as a repeat of the loop sound
        case 'orbit': a.playSweep(ember ? 780 : 840, ember ? 1560 : 1690, 0.1, 'square', 0.06); break
        case 'tilt': a.playNoise(0.3, 0.12); a.playTone(90, 0.24, 'square', 0.1); break
        case 'drain': a.playSweep(320, 110, 0.22, 'triangle', 0.08); break
        case 'extraBall': a.playSweep(500, 1500, 0.3, 'square', 0.09); break
        case 'over': a.playSweep(400, 80, 0.6, 'sawtooth', 0.1); break
        case 'lightup': a.playTone(1100, 0.02, 'square', 0.045); break
        case 'award': a.playSweep(400, 1200, 0.25, 'square', 0.09); break
        case 'launch': a.playSweep(ember ? 300 : 260, ember ? 960 : 900, 0.12, 'square', 0.05); break
        case 'magnet': a.playSweep(200, 120, 0.18, 'sawtooth', 0.09); break
        case 'magRelease': a.playTone(P.bright & 0xffff, 0.02, 'square', 0.06); break
        case 'dropClear': a.playSweep(700, 1900, 0.3, 'square', 0.1); break
        case 'nudge': a.playNoise(0.05, 0.08); break
        case 'select': a.playTone(ember ? 560 : 420, 0.05, 'square', 0.07); break
        default: break
    }
}

/* --- shared react helpers: set a flash slot + a floating score popup ------- */
function react(events, flashRef, popsRef, ember) {
    const fl = flashRef.current
    const P = palFor(ember)
    let sound = null
    const addPop = (x, y, text, color, big) => {
        if (popsRef.current.length < 10) popsRef.current.push({ x, y, text, color, life: 48, vy: -0.55, big: !!big })
    }
    for (const ev of events) {
        switch (ev.type) {
            case 'bumper': fl.bumpers[ev.i] = 10; spawnRing(ev.x, ev.y, P.hot, 18); spawn(ev.x, ev.y, 5, P.hot, 160); addPop(ev.x, ev.y, '+' + ev.points, P.hot); break
            case 'sling': fl.slings[ev.i] = 10; spawn(ev.x, ev.y, 4, P.accent, 180); addPop(ev.x, ev.y, '+' + ev.points, P.accent); break
            case 'target': fl.targets[ev.i] = 16; spawnRing(ev.x, ev.y, P.star, 12); addPop(ev.x, ev.y, '+' + ev.points, P.star); break
            case 'spinner': fl.spinner = 8; break
            case 'lane': fl.lane[ev.i] = 22; addPop(ev.x, ev.y, '+' + ev.points, P.bright); break
            case 'lock': fl.lock = 34; spawnRing(ev.x, ev.y, P.star, 14); addPop(ev.x, ev.y - 14, 'BALL LOCKED', P.star, true); break
            case 'kick': fl.lock = 26; spawnRing(ev.x, ev.y, P.glow, 24); break
            case 'multiball': {
                fl.mb = 90; fl.flash = 14; shakeRef_shake(fl, 12)
                addPop(W / 2, H / 2 - 60, 'MULTIBALL!' + (ev.hold ? ' ×3 HELD!' : ''), P.glow, true)
                // the tower mouth erupts: a ring + shower from each kick port so
                // the pack-off lands on a 6-inch screen, not only desk width (#3178)
                const tb = ember ? TABLE_TWO : TABLE
                for (const k of tb.mbKick) { spawnRing(k.x, k.y, P.glow, 26, 3, 14); spawn(k.x, k.y, 14, P.glow, 220) }
                break
            }
            case 'jet': spawn(ev.x, ev.y, 6, P.star, 200); break
            case 'tilt': fl.tilt = 120; shakeRef_shake(fl, 8); addPop(W / 2, H / 2 - 40, 'TILT!', P.warn, true); break
            case 'drain': fl.drain = 18; spawn(ev.x, ev.y, 8, P.warn, 60); break
            case 'extraBall': addPop(W / 2, 220, 'BALL SAVE!', P.lane, true); break
            case 'lightup': fl.lane[ev.i] = 22; break
            case 'award': fl.bank = 26; fl.mb = Math.max(fl.mb, 50); addPop(45, ev.y, '+' + ev.points, P.star, true); break
            case 'orbit': fl.orbit = 14; addPop(W / 2, 74, 'ORBIT! +' + ev.points, P.glow, true); break
            case 'orbitArm': fl.orbitArm = 16; break
            case 'mag': fl.mag = 18; break
            case 'magRelease': fl.magFree = 30; addPop(ev.x, ev.y, '+' + ev.points, P.glow); break
            case 'dropClear': fl.bank = 30; addPop(45, 180, 'BANK CLEAR! +' + ev.points, P.glow, true); break
            case 'dropReset': fl.bank = 12; break
            case 'over': fl.drain = 30; break
            default: break
        }
        if (sound === null) sound = ev.type
    }
    return sound
}
/* tiny indirection so react() can shake without closing over the component */
let shakeFn = null
function shakeRef_shake(_fl, n) { if (shakeFn) shakeFn(n) }

function Pinball() {
    const canvasRef = useRef(null)
    const gameRef = useRef(null)
    const screenRef = useRef('attract') // attract | play | over
    const pausedRef = useRef(false)
    const attractRef = useRef(0)
    const overRef = useRef(0)
    const keysRef = useRef({})
    const plungerRef = useRef({ charge: 0, lastFire: -999, tick: 0 })
    const flashRef = useRef({ bumpers: TABLE.bumpers.map(() => 0), slings: TABLE.slings.map(() => 0), targets: TABLE.targets.map(() => 0), bank: 0, spinner: 0, drain: 0, tilt: 0, ramp: 0, lane: TABLE.laneRollovers.map(() => 0), lock: 0, flash: 0, mb: 0, orbit: 0, orbitArm: 0, mag: 0, magFree: 0 })
    const popsRef = useRef([])
    const particlesRef = useRef([])
    const ringsRef = useRef([])
    const cabRef = useRef('one')
    const shakeRef = useRef(0)
    const lastSoundRef = useRef(0)
    const mbBedRef = useRef(false)
    const [searchParams] = useSearchParams()
    const liteMode = searchParams.get('lite') === '1'
    const devMode = searchParams.get('dev') === '1'
    const [, controls] = useVirtualControls()
    useKeyboard()

    useEffect(() => { shakeFn = (n) => { shakeRef.current = Math.max(shakeRef.current, n) }; return () => { shakeFn = null } }, [])

    const setCab = (id) => {
        if (cabRef.current === id) return
        cabRef.current = id
        const a = audioController
        if (a.unlockState?.() !== 'ready') { try { a.unlock() } catch { /* unlock pending gesture */ } }
        sfxFor({ type: 'select' }, a, id === 'two')
    }

    const pickCabDelta = (d) => {
        const i = CABS.findIndex((c) => c.id === cabRef.current)
        setCab(CABS[(i + d + CABS.length) % CABS.length].id)
    }

    useEffect(() => {
        const onKeyDown = (e) => {
            keysRef.current[e.code] = true
            const scr = screenRef.current
            if (scr === 'attract') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') pickCabDelta(e.code === 'ArrowLeft' ? -1 : 1)
                else if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'Enter') startGame()
                return
            }
            if (scr === 'over') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { screenRef.current = 'attract'; attractRef.current = 0 }
                else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') startGame() // quick-retry keeps the cabinet
                return
            }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current?.setFlipper('left', true)
            if (e.code === 'ArrowRight' || e.code === 'KeyL') gameRef.current?.setFlipper('right', true)
            if (e.code === 'KeyZ') gameRef.current?.nudge(-1, 0)
            if (e.code === 'KeyX') gameRef.current?.nudge(1, 0)
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') gameRef.current?.startTilt()
            if (e.code === 'Space' || e.code === 'ArrowDown') {
                plungerRef.current.charge = Math.min(1, plungerRef.current.charge + 0.028)
                e.preventDefault()
            }
            if (e.code === 'Escape' || e.code === 'KeyP') { pausedRef.current = !pausedRef.current }
        }
        const onKeyUp = (e) => {
            keysRef.current[e.code] = false
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current?.setFlipper('left', false)
            if (e.code === 'ArrowRight' || e.code === 'KeyL') gameRef.current?.setFlipper('right', false)
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') gameRef.current?.endTilt()
            if ((e.code === 'Space' || e.code === 'ArrowDown') && plungerRef.current.charge > 0.02) {
                if (screenRef.current === 'attract') startGame()
                else if (screenRef.current === 'play') {
                    const held = Math.round(plungerRef.current.charge * 10)
                    plungerRef.current.lastFire = plungerRef.current.tick
                    gameRef.current?.plunge(plungerRef.current.charge)
                    const a = audioController
                    if (a.unlockState?.() !== 'ready') { try { a.unlock() } catch { /* unlock pending gesture */ } }
                    sfxFor({ type: 'launch' }, a, cabRef.current === 'two')
                    // the harness reads the physical launch straight from the DOM
                    document.dispatchEvent(new CustomEvent('plunger-fire', { detail: { power: plungerRef.current.charge, held } }))
                }
            }
            if (e.code === 'Space' || e.code === 'ArrowDown') plungerRef.current.charge = 0
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const startGame = () => {
        gameRef.current = makeGame((Date.now() ^ (performance.now() * 1000)) >>> 0, cabRef.current)
        screenRef.current = 'play'
        pausedRef.current = false
        popsRef.current = []
        particlesRef.current = []
        ringsRef.current = []
        shakeRef.current = 0
        flashRef.current = { bumpers: TABLE.bumpers.map(() => 0), slings: TABLE.slings.map(() => 0), targets: TABLE.targets.map(() => 0), bank: 0, spinner: 0, drain: 0, tilt: 0, ramp: 0, lane: TABLE.laneRollovers.map(() => 0), lock: 0, flash: 0, mb: 0, orbit: 0, orbitArm: 0, mag: 0, magFree: 0 }
    }

    const backToAttract = () => { screenRef.current = 'attract'; attractRef.current = 0 }

    /* VirtualControls dispatches synthetic key events — mirror what the real
     * listeners above do; Space is the plunger in play, start in menus, and
     * its keyup fires the held charge. Left/right flip via the arrow codes. */
    useEffect(() => {
        const onVirtual = (e) => {
            const scr = screenRef.current
            if (e.type === 'keydown') {
                if (scr === 'attract') {
                    if (e.code === 'ArrowLeft') pickCabDelta(-1)
                    else if (e.code === 'ArrowRight') pickCabDelta(1)
                    else if (e.code === 'Space') startGame()
                    return
                }
                if (scr === 'over') {
                    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { screenRef.current = 'attract'; attractRef.current = 0 }
                    else if (e.code === 'Space') startGame()
                    return
                }
                if (e.code === 'ArrowLeft') gameRef.current?.setFlipper('left', true)
                else if (e.code === 'ArrowRight') gameRef.current?.setFlipper('right', true)
                else if (e.code === 'Space') plungerRef.current.charge = Math.min(1, plungerRef.current.charge + 0.05)
            } else if (e.code === 'Space' && plungerRef.current.charge > 0.02) {
                if (screenRef.current === 'play') gameRef.current?.plunge(plungerRef.current.charge)
                plungerRef.current.charge = 0
            }
        }
        window.addEventListener('virtual-keydown', onVirtual)
        window.addEventListener('virtual-keyup', onVirtual)
        return () => { window.removeEventListener('virtual-keydown', onVirtual); window.removeEventListener('virtual-keyup', onVirtual) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loop = useGameLoop((dt) => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        attractRef.current += dt
        plungerRef.current.tick += Math.round(dt / FIXED_DT)

        /* taps on the attract row pick a cabinet by column — the outer thirds
         * of the screen are the two cards, the middle column starts (so the
         * harness's centre tap and one-finger players both just work). */
        const tap = controls.consumeTap()
        if (tap && screenRef.current === 'attract') {
            const col = tap.x < W / 3 ? -1 : tap.x > W * 2 / 3 ? 1 : 0
            if (col !== 0) pickCabDelta(col)
            else startGame()
        }

        if (screenRef.current === 'over' && attractRef.current > 6000) backToAttract()

        const gs = gameRef.current
        if (screenRef.current === 'play' && gs && !pausedRef.current) {
            const held = keysRef.current['Space'] || keysRef.current['ArrowDown'] || controls.pressed('Space')
            if (held) plungerRef.current.charge = Math.min(1, plungerRef.current.charge + dt / 550)
            if (controls.consumed('Space')) plungerRef.current.charge = 0
            const kb = keysRef.current
            const left = kb['ArrowLeft'] || kb['KeyA'] || controls.pressed('ArrowLeft')
            const right = kb['ArrowRight'] || kb['KeyL'] || controls.pressed('ArrowRight')
            if (left !== gs.flippers.left.down) gs.setFlipper('left', left)
            if (right !== gs.flippers.right.down) gs.setFlipper('right', right)
            let acc = dt
            while (acc >= FIXED_DT) { gs.step(FIXED_DT); acc -= FIXED_DT }
            const events = gs.drainEvents()
            if (events.length) {
                const sound = react(events, flashRef, popsRef, cabRef.current === 'two')
                if (sound) {
                    const now = performance.now()
                    if (now - lastSoundRef.current > 16) {
                        lastSoundRef.current = now
                        const a = audioController
                        if (a.unlockState?.() !== 'ready') { try { a.unlock() } catch { /* autoplay lock — a later gesture frees it */ } }
                        sfxFor({ type: sound }, a, cabRef.current === 'two')
                    }
                }
            }
            // #3178: MULTIBALL tension bed — runs while the pack is down. The
            // trigger is SIM state (gs.multiball), so the seam is deterministic;
            // pause, drain-home, game-over and cabinet-switch all cut it alike.
            const bedOn = gs.multiball
            if (bedOn && !mbBedRef.current) { audioController.startMusic('pinballMb'); audioController.setMusicLevel(0.55); mbBedRef.current = true }
            else if (!bedOn && mbBedRef.current) { audioController.stopMusic(); mbBedRef.current = false }
            if (gs.screen === 'over') { screenRef.current = 'over'; attractRef.current = 0 }
            if (gs.screen === 'attract') backToAttract()
        }

        draw(ctx, gs)
        if (screenRef.current === 'play' && pausedRef.current) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)'
            ctx.fillRect(0, 0, W, H)
            ctx.fillStyle = '#ffd700'
            ctx.font = 'bold 20px "Press Start 2P", monospace'
            ctx.textAlign = 'center'
            ctx.fillText('PAUSED', W / 2, H / 2)
        }
    }, true)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = d2(W)
        canvas.height = d2(H)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        const ro = new ResizeObserver(() => { /* letterbox handled by CSS container */ })
        const host = canvas.parentElement
        if (host) ro.observe(host)
        return () => {
            ro.disconnect()
            audioController.stopMusic() // #3178: never leak the multiball bed timer
            unexposeGame('pinball')
            unexposeDevTools()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /* --- rendering ---------------------------------------------------------- */

    function draw(ctx, gs) {
        const ember = cabRef.current === 'two'
        const P = palFor(ember)
        const fl = flashRef.current
        ctx.save()
        ctx.scale(DPR, DPR)
        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = P.field
        ctx.fillRect(0, 0, W, H)

        if (screenRef.current === 'attract') { drawRowOfCabinets(ctx); ctx.restore(); return }

        const tb = ember ? TABLE_TWO : TABLE
        paintField(ctx, W, H, P, tb)
        if (gs) drawPlayfield(ctx, gs, fl, P, tb)
        drawDMD(ctx, gs ? gs.dmd : { w: ['NEON', 'TABLE'], hi: false }, P)

        drawParticles(ctx)
        if (shakeRef.current > 0) shakeRef.current -= 1
        ctx.restore()
    }

    /* The attract row: two cabinet cards, each showing a miniature of its own
     * playfield + name, the chosen one boxed and lit, plus the plunger bar. */
    function drawRowOfCabinets(ctx) {
        const t = attractRef.current
        ctx.fillStyle = '#050310'
        ctx.fillRect(0, 0, W, H)
        // back-wall glow
        const g = ctx.createRadialGradient(W / 2, H * 0.36, 20, W / 2, H * 0.36, 320)
        g.addColorStop(0, 'rgba(70,30,90,0.5)')
        g.addColorStop(1, 'rgba(5,3,16,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        for (const card of CABS_UI) {
            const sel = card.id === cabRef.current
            const pulse = sel ? 0.75 + 0.25 * Math.sin(t / 220) : 0.45
            // cabinet body
            ctx.fillStyle = '#0b0820'
            ctx.fillRect(card.x, card.y, card.w, card.h)
            ctx.strokeStyle = sel ? card.sel : '#241a44'
            ctx.lineWidth = sel ? 3 : 2
            ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1)
            // miniature playfield
            ctx.save()
            ctx.translate(card.x + 10, card.y + 34)
            ctx.scale((card.w - 20) / W, (card.h - 92) / H)
            const MP = card.id === 'two' ? PAL_EMBER : PAL
            paintField(ctx, W, H, MP, card.id === 'two' ? TABLE_TWO : TABLE, { mini: true })
            ctx.restore()
            // name plate
            ctx.font = 'bold 12px "Press Start 2P", monospace'
            ctx.textAlign = 'center'
            ctx.globalAlpha = pulse
            ctx.fillStyle = card.sel
            ctx.fillText(card.title, card.x + card.w / 2, card.y + card.h - 40)
            ctx.globalAlpha = 1
            ctx.font = '7px "Press Start 2P", monospace'
            ctx.fillStyle = '#8f8fc9'
            ctx.fillText(card.sub, card.x + card.w / 2, card.y + card.h - 22)
            if (sel) {
                ctx.fillStyle = card.sel
                ctx.beginPath()
                ctx.moveTo(card.x + card.w / 2 - 6, card.y - 12)
                ctx.lineTo(card.x + card.w / 2 + 6, card.y - 12)
                ctx.lineTo(card.x + card.w / 2, card.y - 4)
                ctx.closePath()
                ctx.fill()
            }
        }
        // prompts
        ctx.textAlign = 'center'
        ctx.fillStyle = '#e6e6ff'
        ctx.font = '9px "Press Start 2P", monospace'
        ctx.fillText('← → PICK CABINET', W / 2, H - 64)
        if (Math.floor(t / 500) % 2 === 0) {
            ctx.fillStyle = '#ffd700'
            ctx.font = 'bold 10px "Press Start 2P", monospace'
            ctx.fillText('PULL THE PLUNGER', W / 2, H - 40)
        }
        // plunger bar grows with a held charge so a first player learns it
        const c = plungerRef.current.charge
        if (c > 0) {
            ctx.fillStyle = '#160f30'
            ctx.fillRect(W / 2 - 70, H - 30, 140, 10)
            ctx.fillStyle = c < 0.6 ? '#ffd700' : '#ff5d8f'
            ctx.fillRect(W / 2 - 68, H - 28, 136 * c, 6)
        }
    }

    function drawPlayfield(ctx, gs, fl, P, tb) {
        const t = gs.tick

        if (fl.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${(0.38 * fl.flash / 14).toFixed(3)})`
            ctx.fillRect(0, 0, W, H)
        }

        // lane rollovers + arrows
        for (let i = 0; i < tb.laneRollovers.length; i++) {
            const lr = tb.laneRollovers[i]
            const lit = gs.laneDone[i] || fl.lane[i] > 0
            if (fl.lane[i] > 0) fl.lane[i] -= 1
            ctx.beginPath(); ctx.arc(lr.x, lr.y, 6, 0, Math.PI * 2)
            if (gs.laneAllDone) {
                ctx.fillStyle = Math.floor(t / 8 + i) % 2 === 0 ? P.lane : P.star
            } else ctx.fillStyle = lit ? P.lane : '#241a44'
            ctx.fill()
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1; ctx.stroke()
        }
        const ax = tb.view.laneArrowX
        ctx.fillStyle = gs.laneAllDone ? (Math.floor(t / 8) % 2 ? P.star : P.lane) : '#3a2f66'
        ctx.beginPath()
        ctx.moveTo(ax, tb.view.laneArrowY + 16); ctx.lineTo(ax - 6, tb.view.laneArrowY + 4); ctx.lineTo(ax + 6, tb.view.laneArrowY + 4)
        ctx.closePath(); ctx.fill()

        // guides
        ctx.strokeStyle = P.accent; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(180, 118, 52, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke()
        ctx.strokeStyle = '#3a2f66'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(tb.view.guideX, tb.view.guideTopY); ctx.lineTo(tb.view.guideX, tb.view.guideBotY); ctx.stroke()

        // drop-target bank: block + three targets; clear = lit gold band
        ctx.fillStyle = '#171236'
        if (tb.bank.side === 'left') ctx.fillRect(6, 130, 12, 96)
        else ctx.fillRect(342, 130, 12, 96)
        const bankClear = gs.dropBank.every((d) => d.down)
        for (let i = 0; i < tb.targets.length; i++) {
            const tg = tb.targets[i]
            const down = gs.dropBank[i].down
            const lit = fl.targets[i] > 0 || bankClear
            if (fl.targets[i] > 0) fl.targets[i] -= 1
            ctx.fillStyle = down ? (bankClear ? P.star : '#221a3f') : lit ? P.star : P.target
            ctx.fillRect(tg.x - 7, tg.y - 4, 14, 8)
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1
            ctx.strokeRect(tg.x - 7, tg.y - 4, 14, 8)
        }
        if (bankClear) {
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 6)
            ctx.fillStyle = P.star
            if (tb.bank.side === 'left') ctx.fillRect(6, 130, 12, 96)
            else ctx.fillRect(342, 130, 12, 96)
            ctx.globalAlpha = 1
        }

        // stand-up targets
        for (let i = 0; i < tb.targets.length + tb.standups.length; i++) { /* placeholder to keep loop count honest */ }
        for (let i = 0; i < tb.standups.length; i++) {
            const tg = tb.standups[i]
            const hit = fl.targets[tb.targets.length + i] > 0
            ctx.fillStyle = hit ? P.star : P.target
            ctx.fillRect(tg.x - 8, tg.y - 3, 16, 6)
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1
            ctx.strokeRect(tg.x - 8, tg.y - 3, 16, 6)
            // #3178: label the top-left saucer with its mission so the "3 IN
            // KICKER" call is discoverable — players (and the QA read) can see
            // WHY the light matters without the manual
            if (tg.id === 'saucer1') {
                ctx.font = '6px "Press Start 2P", monospace'
                ctx.textAlign = 'center'
                ctx.fillStyle = gs.locks >= 3 ? P.star : '#8f8fc9'
                ctx.fillText(gs.locks >= 3 ? 'READY' : 'KICKER', tg.x + (tb.bank.side === 'left' ? 30 : -30), tg.y + 2)
            }
        }

        // spinner: a flag that tilts while spinning, gold bar when hot
        const sp = tb.spinner
        const hotSp = gs.spinnerHot
        ctx.strokeStyle = P.wallBright; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 10); ctx.lineTo(sp.x, sp.y + 10); ctx.stroke()
        const ang = gs.spinnerVel !== 0 ? (gs.spinnerAngle % (Math.PI * 2)) : 0
        ctx.save()
        ctx.translate(sp.x, sp.y)
        ctx.rotate(Math.sin(ang) * 1.2)
        ctx.fillStyle = hotSp ? (Math.floor(t / 5) % 2 ? P.glow : P.star) : '#cfd6ff'
        ctx.fillRect(-2, -9, 4, 18)
        ctx.restore()

        // slingshots
        for (let i = 0; i < tb.slings.length; i++) {
            const s = tb.slings[i]
            const p = s.points
            ctx.fillStyle = fl.slings[i] > 0 ? P.accent : '#241a55'
            if (fl.slings[i] > 0) fl.slings[i] -= 1
            ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1.5; ctx.stroke()
        }

        // bumpers: rings + flash; the pop caps their lit lifetime to one frame
        for (let i = 0; i < tb.bumpers.length; i++) {
            const b = tb.bumpers[i]
            const flash = fl.bumpers[i] > 0
            if (fl.bumpers[i] > 0) fl.bumpers[i] -= 1
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
            ctx.fillStyle = flash ? P.hot : '#2a1c50'
            ctx.fill()
            ctx.lineWidth = 2; ctx.strokeStyle = flash ? '#ffffff' : P.wallBright; ctx.stroke()
            ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(3, b.r - 8), 0, Math.PI * 2)
            ctx.fillStyle = flash ? '#ffffff' : P.glow
            ctx.fill()
        }

        // outer lane + side-lamp lanes: lit as they light, chased while live
        for (const lane of tb.lanes) {
            const lit = gs.lights[lane.id] || gs.lights.lanesAll || fl.ramp > 0
            if (fl.ramp > 0) fl.ramp -= 1
            ctx.strokeStyle = lit ? (Math.floor(t / 6) % 2 ? P.star : P.glow) : '#332763'
            ctx.lineWidth = 3
            ctx.beginPath(); ctx.arc(lane.cx, lane.cy, lane.r, Math.PI * (lane.ang[0] + 0.05), Math.PI * (lane.ang[1] - 0.05)); ctx.stroke()
        }

        // magnet at the tower mouth
        ctx.fillStyle = '#241a55'
        ctx.beginPath(); ctx.arc(tb.magnet.x, tb.magnet.y, 14, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = fl.mag > 0 ? P.warn : P.wallBright; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(tb.magnet.x, tb.magnet.y, 14, 0, Math.PI * 2); ctx.stroke()
        if (fl.mag > 0) fl.mag -= 1

        // kickback button + the ball it holds: its cap counts down so the held
        // ball visibly squeezes toward release (same budget the sim counts down)
        ctx.fillStyle = gs.kickbackReady ? P.glow : '#31245e'
        ctx.fillRect(tb.kickback.x - 8, tb.kickback.y - 5, 16, 10)
        ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1
        ctx.strokeRect(tb.kickback.x - 8, tb.kickback.y - 5, 16, 10)
        if (gs.kickbackBall) {
            ctx.fillStyle = '#d8d8f0'
            ctx.beginPath(); ctx.arc(tb.kickback.x, tb.kickback.y, gs.ballR, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = P.warn
            ctx.fillRect(tb.kickback.x - 9, tb.kickback.y - 12, Math.max(2, 18 * (gs.kickbackBall.cap / 90)), 2)
        }

        // tower + lock lights (the tower sits on the bank side)
        const tw = tb.view.tower
        ctx.fillStyle = '#141031'
        ctx.fillRect(tw.x, tw.y, tw.w, tw.h)
        ctx.strokeStyle = P.wallBright; ctx.lineWidth = 2
        ctx.strokeRect(tw.x, tw.y, tw.w, tw.h)
        ctx.fillStyle = P.star
        ctx.font = '7px "Press Start 2P", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('TOWER', tw.x + tw.w / 2, tw.y + 14)
        ctx.fillStyle = '#6f6fb0'
        ctx.fillText(gs.locks + '/3', tw.x + tw.w / 2, tw.y + tw.h + 12)
        for (let i = 0; i < 3; i++) {
            const lit = gs.locks > i || fl.lock > 0
            if (fl.lock > 0) fl.lock = Math.max(0, fl.lock - 1)
            ctx.fillStyle = lit ? P.star : '#241a44'
            ctx.beginPath(); ctx.arc(tb.lockLights[i].x, tb.lockLights[i].y, 5, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1; ctx.stroke()
        }
        if (fl.lock > 0 && Math.floor(t / 4) % 2 === 0) {
            ctx.fillStyle = P.star
            ctx.font = '6px "Press Start 2P", monospace'
            ctx.fillText('IN KICKER', tw.x + tw.w / 2, tw.y - 6)
        }

        // orbit entry + exit lamps
        for (const oc of tb.orbit.curl) {
            ctx.fillStyle = fl.orbitArm > 0 ? P.glow : '#241a44'
            ctx.beginPath(); ctx.arc(oc.x, oc.y, 7, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = P.wallBright; ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(oc.x, oc.y, 7, 0, Math.PI * 2); ctx.stroke()
        }
        if (fl.orbitArm > 0) fl.orbitArm -= 1
        const oex = tb.orbit.exit
        ctx.strokeStyle = fl.orbit > 0 ? P.glow : '#332763'
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(oex.x, oex.y, 18, Math.PI * (oex.dir > 0 ? 0 : 1), Math.PI * (oex.dir > 0 ? 1 : 2)); ctx.stroke()
        if (fl.orbit > 0) fl.orbit -= 1

        // plunger lane + charge meter (the lane hugs the plunger's own side)
        ctx.fillStyle = '#131036'
        ctx.fillRect(tb.view.plungerLane.x, tb.view.plungerLane.y, tb.view.plungerLane.w, tb.view.plungerLane.h)
        ctx.strokeStyle = '#332763'; ctx.lineWidth = 1
        ctx.strokeRect(tb.view.plungerLane.x, tb.view.plungerLane.y, tb.view.plungerLane.w, tb.view.plungerLane.h)
        const charge = plungerRef.current.charge
        ctx.fillStyle = '#160f30'
        ctx.fillRect(tb.view.meter.x, tb.view.meter.y, tb.view.meter.w, 8)
        ctx.fillStyle = charge < 0.6 ? P.glow : P.warn
        ctx.fillRect(tb.view.meter.x + 1, tb.view.meter.y + 1, Math.max(2, (tb.view.meter.w - 2) * charge), 6)

        // flippers — bright while pressed, live angle from the sim
        const flLive = (f) => (f.timed ? f.timed > t : f.down)
        for (const side of ['left', 'right']) {
            const fp = gs.flippers[side]
            const col = fp.down || flLive(fp) ? P.bright : '#4a3a8f'
            ctx.save()
            ctx.translate(fp.pivot.x, fp.pivot.y)
            ctx.rotate(fp.angle)
            ctx.fillStyle = col
            ctx.fillRect(0, -5, 44, 10)
            ctx.beginPath(); ctx.arc(44, 0, 6, 0, Math.PI * 2); ctx.fill()
            ctx.restore()
        }

        // balls
        for (const b of gs.balls) {
            if (!b.active) continue
            ctx.beginPath(); ctx.arc(b.x, b.y, gs.ballR, 0, Math.PI * 2)
            ctx.fillStyle = '#d8d8f0'
            ctx.fill()
            ctx.strokeStyle = '#8f8fb0'; ctx.lineWidth = 1; ctx.stroke()
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.beginPath(); ctx.arc(b.x - gs.ballR / 3, b.y - gs.ballR / 3, 2, 0, Math.PI * 2); ctx.fill()
        }

        // tilt warnings
        if (fl.tilt > 0) {
            fl.tilt -= 1
            if (Math.floor(t / 8) % 2 === 0) {
                ctx.fillStyle = P.warn
                ctx.font = '12px "Press Start 2P", monospace'
                ctx.textAlign = 'center'
                ctx.fillText(gs.screen === 'tilt' ? 'TILT' : 'WARNING', W / 2, 280)
            }
        }
    }

    function spawn(x, y, n, color, speed) {
        if (particlesRef.current.length > 220) return
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2
            const v = speed * (0.3 + Math.random() * 0.7) / 60
            particlesRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 24 + Math.random() * 18, color })
        }
    }
    function spawnRing(x, y, color, r, lw, life) {
        if (ringsRef.current.length > 12) return
        ringsRef.current.push({ x, y, r: 4, rr: r, lw, color, life, max: life })
    }
    function drawParticles(ctx) {
        const ps = particlesRef.current
        for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i]
            p.x += p.vx; p.y += p.vy; p.vy += 0.004; p.life -= 1
            if (p.life <= 0) { ps.splice(i, 1); continue }
            ctx.globalAlpha = Math.min(1, p.life / 20)
            ctx.fillStyle = p.color
            ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
        }
        const rs = ringsRef.current
        for (let i = rs.length - 1; i >= 0; i--) {
            const r = rs[i]
            r.life -= 1
            if (r.life <= 0) { rs.splice(i, 1); continue }
            const f = 1 - r.life / r.max
            ctx.globalAlpha = 1 - f
            ctx.strokeStyle = r.color
            ctx.lineWidth = r.lw
            ctx.beginPath(); ctx.arc(r.x, r.y, 4 + (r.rr - 4) * f, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.globalAlpha = 1
    }

    /* --- DEV test hooks (docs/GAME-SHELL.md) --------------------------------- */
    useEffect(() => {
        if (!devMode) return
        exposeDevTools({
            loop,
            screen: () => screenRef.current,
            back: backToAttract,
            start: startGame,
            attract: () => { screenRef.current = 'attract'; attractRef.current = 0 },
            setPaused: (v) => { pausedRef.current = !!v },
            press: (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
            release: (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code })),
            setPlunger: (v) => { plungerRef.current.charge = Math.max(0, Math.min(1, v)) },
            firePlunger: (power = 0.55) => {
                if (!gameRef.current) startGame()
                plungerRef.current.lastFire = plungerRef.current.tick
                gameRef.current.plunge(power)
                plungerRef.current.charge = 0
                document.dispatchEvent(new CustomEvent('plunger-fire', { detail: { power, held: Math.round(power * 10) } }))
            },
            pickCab: (id) => { cabRef.current = id },
            cab: () => cabRef.current,
            playfieldPx: () => {
                const cvs = canvasRef.current
                if (!cvs) return null
                const dpr = Math.min(window.devicePixelRatio || 1, 2)
                const ctx = cvs.getContext('2d')
                if (!ctx) return null
                const y0 = Math.floor(48 * dpr), y1 = Math.floor(448 * dpr)
                const data = ctx.getImageData(0, y0, cvs.width, y1 - y0).data
                const bright = [PAL.bright, PAL.hot, PAL.accent, PAL.star, PAL.glow, PAL_EMBER.bright, PAL_EMBER.hot, PAL_EMBER.accent, PAL_EMBER.star, PAL_EMBER.glow].map((c) => [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff])
                let best = { name: 'none', count: 0 }
                for (const [name, rgb] of [['hot', bright[0]], ['accent', bright[1]], ['star', bright[2]], ['glow', bright[3]], ['ember-hot', bright[5]], ['ember-glow', bright[7]], ['ember-accent', bright[6]]]) {
                    let n = 0
                    for (let i = 0; i < data.length; i += 4) {
                        if (Math.abs(data[i] - rgb[0]) < 24 && Math.abs(data[i + 1] - rgb[1]) < 24 && Math.abs(data[i + 2] - rgb[2]) < 24) n++
                    }
                    if (n > best.count) best = { name, count: n }
                }
                return best
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        exposeGame({
            id: 'pinball',
            buttons: ['ArrowLeft', 'ArrowRight', 'Space'],
            reset: () => {
                cabRef.current = 'one'
                screenRef.current = 'play'
                pausedRef.current = false
                plungerRef.current = { charge: 0, lastFire: -999, tick: 0 }
                gameRef.current = makeGame(12345, 'one')
            },
            tick: (n = 1) => { for (let i = 0; i < n; i++) gameRef.current?.step(FIXED_DT) },
            state: () => {
                const gs = gameRef.current
                if (!gs) return { screen: screenRef.current, balls: [], score: 0, ball: 0, drains: 0, tiltWarns: 0, tilt: false, multiball: false, locks: 0, dropClear: false, laneAll: false, rampCount: 0, spinnerHot: false, laneDone: [false, false, false], kickbackReady: false, kickbackBall: false, lights: {}, dmd: { w: ['NEON', 'TABLE'], hi: false }, cab: cabRef.current }
                const s = stateOf(gs)
                return { ...s, plungerPower: plungerPower(gs, plungerRef.current.charge), launchHeld: Math.round(plungerRef.current.charge * 10), lastPlungerFire: plungerRef.current.lastFire, plungerTick: plungerRef.current.tick }
            },
            canvas: canvasRef,
        })
        return () => unexposeGame('pinball')
    }, [])

    const gameConfig = GAMES.find((g) => g.label === 'PINBALL')
    const emb = cabRef.current === 'two'
    const dmdNow = screenRef.current === 'attract'
        ? { w: emb ? DMD_MSGS_EMBER.attract : DMD_MSGS.attract, hi: false }
        : emb ? DMD_MSGS_EMBER.ready : DMD_MSGS.ready

    return (
        <div className="absolute inset-0">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {gameConfig && <div className="absolute top-4 left-4 z-10"><PauseOverlay game={gameConfig} /></div>}
            {screenRef.current === 'attract' && <AttractPrompt title={cabRef.current === 'two' ? 'EMBER RIDER' : 'NEON TABLE'} controls={gameConfig?.controls} key={cabRef.current} />}
            {screenRef.current === 'over' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 font-arcade">
                    <div className="text-3xl text-amber-300">GAME OVER</div>
                    <div className="text-lg text-white">SCORE {gameRef.current?.score ?? 0}</div>
                    <div className="text-xs text-fuchsia-300">{cabRef.current === 'two' ? 'CABINET TWO — EMBER RIDER' : 'CABINET ONE — NEON TABLE'}</div>
                    <div className="mt-2 text-sm text-amber-200 animate-pulse">PRESS SPACE — play again · ← → — row</div>
                </div>
            )}
            <VirtualControls secondAction={{ label: 'PLUNGER', code: 'ArrowDown' }} visible={screenRef.current === 'play' && !pausedRef.current} />
            {dmdNow && screenRef.current === 'play' && null}
        </div>
    )
}

export default Pinball

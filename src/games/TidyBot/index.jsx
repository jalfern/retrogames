// TIDY BOT — the arcade shell and painter. The rules live in ./sim.js (pure,
// seeded); this file only draws it and wires input, audio, the pad, the pause
// screen and the harness hooks. Look: a dollhouse cutaway at 320×240 with
// `imageSmoothingEnabled = false` — sage kitchen tile, an oak dining floor,
// cream appliances whose doors really slide, and a little teal caretaker bot
// with a single amber eye.
//
// The renderer's ONLY spatial contract is `screen = world` (no camera): every
// sim coordinate lands on the canvas at the same number, which is what the
// harness samples to prove the drawn robot and cargo sit where the physics
// says they are, after every real keystroke.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import {
    makeGame, step, autopilot, loadLevel, markChores, stateHash, routeDir, aimAt, rackSlot, flourishPick,
    tapAct, pendingFire, pendingAlive,
    VIEW_W, VIEW_H, TABLE, COUNTER, DW, FR, LEVELS, RACK_CAP,
} from './sim.js'
import { PAINTERS, SKIN_IDS, skinFromLocation, rememberSkin } from './art.js'

const SIM_MS = 1000 / 60

const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }

const TIDY_ATTRACT = [
    'A HOUSE ROBOT ON THE NIGHT CHORES — NOTHING LEFT UNTIDY',
    'A OPENS, PLACES, CLOSES — B TOSES, RETRIEVES, STARTS THE WASHER',
    'A CLOSED WASHER REFUSES CARGO — OPEN THE RACK FIRST',
    'CLOSE THE LOADED WASHER, THEN B TO START ITS CYCLE',
    'APPLES IN THE WASHER? WRONG STOW — RESCUE IT AND RE-STOW',
    'TOSS A PLATE ONTO THE TILES AND IT SHATTERS (−40)',
    'GENTLE PLACES PAY TIDY POINTS — THROWN JAMS PAY LESS',
    'TAP OR CLICK THE FLOOR — THE BOT GLIDES THERE AROUND THE DOORS',
    'CARRY TWO AT ONCE — GRAB A SECOND, PLACE THEM ONE BY ONE',
    'TAP AN ITEM ON AN OPEN RACK — B PULLS OUT THAT ONE',
    'EVERY LEVEL IS A MESSIER HOUSE — BEAT THE CLOCK FOR BONUS',
]

const TidyBotGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [skinUi, setSkinUi] = useState(() => skinFromLocation()) // #3078 skins
    const skinToggleRef = useRef(() => {})
    const [end, setEnd] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 WATCH: tidycheck's autopilot clocks the shift
    const watchingRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.tidybotStage = '1'
        canvas.width = VIEW_W * 2; canvas.height = VIEW_H * 2
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.scale(2, 2)

        let gs = makeGame(1337, 1)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0
        let shake = 0, flash = 0
        let contractSeed = 4242
        // #3078 SKINS — the painter is chosen once per skin and swapped live;
        // the sim never sees it. Classic is the default and byte-frozen
        // (tidycheck's golden hash); the URL (?style=) and the STYLE pill
        // switch to the papercraft diorama.
        let skin = skinFromLocation()
        let PA = PAINTERS[skin]
        const setSkinStyle = (v) => {
            if (!SKIN_IDS.includes(v) || v === skin) return
            skin = v
            PA = PAINTERS[v]
            rememberSkin(v)
            setSkinUi(v)
            banner(v === 'reimagined' ? 'PAPERCRAFT MODE' : 'DOLLHOUSE MODE')
        }
        skinToggleRef.current = () => setSkinStyle(skin === 'reimagined' ? 'classic' : 'reimagined')
        const parts = []
        const keys = { left: false, right: false, up: false, down: false }
        let edgeA = false, edgeB = false
        const evLog = []
        let overAt = 0
        // #2250 GLIDE: a tapped floor point the bot routes itself to with the
        // BFS (routeDir). The human is always the driver — any direction key,
        // any verb press, a new tap, WATCH or a level change cancels it. The
        // route is derived from live state each tick, so pads stay the only
        // input and seeded determinism is untouched.
        let goto = null
        let gotoLevel = 0
        // #2338 AIM: an item tapped on an open rack is MARKED (teal brackets)
        // and B retrieves THAT one instead of the rescue default. The tap never
        // fires the verb itself — the #2250 two-step law stands. Cancel law
        // mirrors the glide: any verb, any movement key, a new tap, WATCH, a
        // level change or a reset clears the mark; B consumes it.
        let aim = null
        let aimLevel = 0
        const clearAim = () => { aim = null }
        // #2537 TAP-ACT: a container tap carries a chore (open/place/retrieve)
        // that rides with the glide and fires its verb on arrival — the chore
        // collapses into one tap. Cancel law mirrors the glide and the mark:
        // any key, any new tap, WATCH, a level change or a reset drops it.
        let pending = null
        let pendingLevel = 0
        const clearPending = () => { pending = null }
        // #2258 polish: expanding ring left at the spot a glide completes;
        // wash-cycle hum ticker; footfall dust bookkeeping.
        let ringPop = null
        let humT = 0
        let lastWalk = 0
        // #2343 polish: an attract-only aim flourish — the demo MARKS a stow
        // (brackets + AIMED) and its own B pulls it, teaching tap-the-rack
        // without touching the autopilot's aim-free pads (win-proof untouched).
        // pullAnim is the presentation-only reach arc: the retrieved item arcs
        // from its vacated slot into the front arm over 8 ticks (the sim's
        // pull stays one tick).
        let flourish = null // {id, kind, c, slot} — attract-only marked stow
        let flourishT = 0
        let pullAnim = null // {c, slot, kind, t}

        const burst = (x, y, n, col, spd = 3, up = -1) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * spd
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, t: 0, col, g: 0.14 })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'grab') { audioController.playSweep(500, 820, 0.08, 'square', 0.05); burst(e.x, e.y, 3, PA.chrome.burst.grab, 1.2) }
                else if (e.type === 'place') {
                    audioController.playTone(720, 0.06, 'square', 0.06)
                    audioController.playTone(1080, 0.1, 'square', 0.05, 0.06)
                    burst(e.x, e.y, 5, PA.chrome.burst.place, 1.6)
                }
                else if (e.type === 'jam') { audioController.playTone(340, 0.07, 'square', 0.06); audioController.playNoise(0.05, 0.05); burst(e.x, e.y, 3, PA.chrome.burst.jam, 1.4) }
                else if (e.type === 'wrong') { audioController.playTone(180, 0.14, 'sawtooth', 0.07); shake = 5; flash = 6 }
                else if (e.type === 'spill') { audioController.playNoise(0.1, 0.07); burst(e.x, e.y, 6, PA.chrome.burst.spill, 2); shake = 3 }
                else if (e.type === 'break') {
                    audioController.playNoise(0.16, 0.09); audioController.playSweep(1500, 320, 0.2, 'triangle', 0.06)
                    shake = 7; flash = 9
                    for (let i = 0; i < 14; i++) {
                        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 1 + Math.random() * 3.2
                        parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col: PA.chrome.burst.shard, g: 0.2 })
                    }
                }
                else if (e.type === 'open') audioController.playSweep(240, 460, 0.16, 'triangle', 0.05)
                else if (e.type === 'close') { audioController.playTone(150, 0.09, 'sine', 0.09); burst(e.x, e.y, 3, '#b8c2cc', 1.2) }
                else if (e.type === 'start') {
                    audioController.playSweep(120, 300, 0.3, 'triangle', 0.06)
                    audioController.playTone(660, 0.1, 'square', 0.05, 0.12)
                }
                else if (e.type === 'refuse' || e.type === 'clear') audioController.playTone(120, 0.14, 'square', 0.07)
                else if (e.type === 'retrieve') {
                    // #2343 the rack just gave up an item — animate the pull
                    // (arc slot→front arm) and name the vacated slot for a flash.
                    if (e.slot >= 0 && e.c) pullAnim = { c: e.c, slot: e.slot, kind: e.kind, t: 0 }
                    // #2338 an aimed pull gets the brighter take — the rack gave
                    // up the item YOU named, not just whoever was on top
                    if (e.aimed) { audioController.playSweep(880, 560, 0.09, 'square', 0.05); audioController.playTone(1320, 0.05, 'sine', 0.03, 0.04) }
                    else audioController.playSweep(760, 440, 0.09, 'square', 0.05)
                }
                else if (e.type === 'throw') audioController.playSweep(300, 620, 0.09, 'sawtooth', 0.04)
                else if (e.type === 'heavy') {
                    // both arms just filled — a low grunt-thud under the grab
                    audioController.playTone(95, 0.12, 'square', 0.08)
                    audioController.playNoise(0.04, 0.03)
                    burst(e.x, e.y + 6, 4, PA.chrome.burst.heavy, 1)
                }
                else if (e.type === 'level') {
                    audioController.playTone(523, 0.1, 'square', 0.07)
                    audioController.playTone(659, 0.1, 'square', 0.07, 0.11)
                    audioController.playTone(784, 0.2, 'square', 0.07, 0.22)
                }
                else if (e.type === 'levelgo') { banner(LEVELS[e.level].name, PA.chrome.level) }
                else if (e.type === 'win') { audioController.playFanfare() }
                else if (e.type === 'over') { audioController.playDeath(); shake = 8; flash = 10 }
            }
        }

        const bestScore = () => { try { const b = JSON.parse(localStorage.getItem('tidybot.board') || '[]'); return b.length ? b[0].score : 0 } catch { return 0 } }

        const banner = (msg, col = PA.chrome.banner) => {
            hudRef.current.toast && (hudRef.current.toast.textContent = msg)
            hudRef.current.toast && (hudRef.current.toast.style.color = col)
            hudRef.current.toastT = 110
        }

        const finish = () => {
            const won = gs.end === 'win'
            overAt = performance.now()
            watchingRef.current = false; setWatching(false) // #1637 the shift ends in your hands
            goto = null // #2250
            clearAim() // #2338
            clearPending() // #2537
            setEnd({ won, score: gs.score, tidy: gs.tidies, breaks: gs.breaks, wrongs: gs.wrongs, spills: gs.spills, jams: gs.jams, reason: gs.endReason })
            const board = (() => { try { return JSON.parse(localStorage.getItem('tidybot.board') || '[]') } catch { return [] } })()
            if (gs.score > 0) localStorage.setItem('tidybot.board', JSON.stringify([...board, { score: gs.score, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            setMode('over')
        }

        const livePad = () => {
            const p = { left: keys.left, right: keys.right, up: keys.up, down: keys.down, a: edgeA, b: edgeB }
            if (aim && aimLevel === gs.level) p.aim = aim // #2338: the marked item rides the pad
            return p
        }

        // #2258 feel pass, runs every simulated tick in attract AND play:
        // footfall dust whose color names the floor (sage tile vs oak plank),
        // doubled when HEAVY, and the looping wash hum with bubble ticks.
        const feel = () => {
            if (gs.walk !== lastWalk) {
                lastWalk = gs.walk
                if (gs.walk % 6 === 0) {
                    const heavy = gs.held !== null && gs.held2 !== null && gs.held2 !== undefined
                    const plank = gs.rx >= TABLE.x - 20 && gs.ry >= 100
                    const C = PA.chrome.dust
                    const col = heavy ? (plank ? C.plankH : C.tileH) : (plank ? C.plank : C.tile)
                    for (let i = 0; i < (heavy ? 2 : 1); i++) {
                        parts.push({ x: gs.rx + (i ? 4 : -4), y: gs.ry + 6.5, vx: (Math.random() - 0.5) * 0.5, vy: -0.2 - Math.random() * (heavy ? 0.5 : 0.25), t: 0, col, g: 0.02 })
                    }
                }
            }
            if (gs.dwRun) {
                humT++
                if (humT % 36 === 0) audioController.playTone(84, 0.34, 'sine', 0.03)
                if (humT % 97 === 41) audioController.playTone(560 + (humT % 7) * 55, 0.05, 'sine', 0.028)
            } else humT = 0
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (demoAt > 120 && gs.end) {
                    // #2258: a cleared shift clocks into the NEXT room instead of
                    // hard-rebooting — the demo sells "every level messier".
                    if (gs.end === 'win' && gs.level < LEVELS.length - 1) {
                        loadLevel(gs, gs.level + 1)
                        gs.end = null; gs.endReason = ''
                        flourish = null // #2343 new room, re-pick the flourish target
                        banner(LEVELS[gs.level].name, '#9fe8b4')
                    } else { gs = makeGame(1337 + (demoAt % 97), 1); demoAt = 0; flourish = null }
                }
                const p = autopilot(gs)
                // #2343 the demo sells aim-the-rack: overlay a MARKED stow on the
                // attract pad so the autopilot's own B pulls the named item while
                // brackets pulse on it. Attract-only — the autopilot never aims,
                // so WATCH, contracts and the win-proof ride the unchanged law.
                if (flourish === null) {
                    const f = flourishPick(gs)
                    if (f) { flourish = f; flourishT = 0 }
                } else if (++flourishT > 900) flourish = null // watchdog: the loop missed it, re-pick
                if (flourish !== null) p.aim = flourish.id
                step(gs, [p])
                handleEvents(gs.ev)
                if (flourish !== null && !gs.items.some((i2) => i2.id === flourish.id && i2.state === 'in')) flourish = null // pulled — the mark is spent
                feel()
                demoAt++
                return
            }
            if (sc !== 'play') return
            // #1637 WATCH: seat tidycheck's autopilot — the same brain its
            // playthrough clears all three rooms with, re-deciding from live
            // state every tick (never a script match).
            const pad = watchingRef.current ? autopilot(gs) : livePad()
            if (!watchingRef.current && goto) {
                if (gs.level !== gotoLevel) goto = null // new room, new plans
                else {
                    const r = routeDir(gs, goto.x, goto.y)
                    if (!r.ok || r.arrived) {
                        goto = null
                        if (r.ok) {
                            // #2258 the order visibly COMPLETES: ring scale-out,
                            // sparks, and a rising two-note instead of one blip.
                            audioController.playTone(940, 0.05, 'sine', 0.035)
                            audioController.playTone(1410, 0.07, 'sine', 0.03, 0.06)
                            burst(r.tx, r.ty, 6, '#8fe0ee', 1.4, -0.4)
                            ringPop = { x: r.tx, y: r.ty, t: 0 }
                        }
                    } else if (r.dir) pad[r.dir] = true
                }
            }
            // #2537 TAP-ACT: an order still worth walking toward pushes its
            // verb the moment live state allows — position is judged by the
            // same law step() honors, so the press lands, it never guesses.
            // A place against a shut body fires the OPEN and stays pending;
            // the order completes when the item actually lands.
            if (!watchingRef.current && pending) {
                if (gs.level !== pendingLevel) pending = null
                else if (!pendingAlive(gs, pending)) pending = null
                else {
                    if (pending.cd > 0) pending.cd--
                    const v = pending.cd > 0 ? null : pendingFire(gs, pending)
                    if (v) {
                        pad[v] = true
                        const cc = pending.c === 'dw' ? gs.dw : gs.fr
                        if (pending.act !== 'place' || cc.door >= 0.9) {
                            audioController.playTone(940, 0.05, 'sine', 0.035)
                            audioController.playTone(1410, 0.07, 'sine', 0.03, 0.06)
                            ringPop = { x: gs.rx, y: gs.ry, t: 0 }
                            clearPending()
                            if (v === 'b') clearAim() // the named pull spent its mark
                        }
                    }
                }
            }
            step(gs, [pad])
            const verbPressed = edgeA || edgeB // #2338: any verb press ends the mark (B consumed it, A spoke elsewhere)
            if (verbPressed) clearPending() // #2537 — and the human's verb ends a tap-order too
            if (pending && gs.ev.some((e) => e.type === 'refuse')) pending.cd = 20 // STAND CLEAR/ARMS FULL: back off, retry after walking
            edgeA = false; edgeB = false
            if (verbPressed || (aim && aimLevel !== gs.level)) clearAim()
            handleEvents(gs.ev)
            feel()
            if (gs.end) finish()
        }

        const paintParticles = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g
                if (p.t > 26) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - p.t / 26; ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.globalAlpha = 1
            for (let i = gs.fx.length - 1; i >= 0; i--) {
                const f = gs.fx[i]
                if (f.k > 46) { gs.fx.splice(i, 1); continue }
                ctx.globalAlpha = Math.max(0, 1 - f.k / 46)
                ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
                ctx.fillStyle = f.t === 'ok' ? PA.chrome.fxText.ok : f.t === 'jam' ? PA.chrome.fxText.jam : PA.chrome.fxText.bad
                ctx.fillText(f.msg, f.x, f.y - f.k * 0.4)
                ctx.globalAlpha = 1
            }
            ctx.textAlign = 'left'
        }

        const paint = () => {
            const tick = gs.tick
            const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            if (shake > 0) shake *= 0.84
            if (shake < 0.3) shake = 0
            ctx.save(); ctx.translate(sx, sy)
            PA.paintRooms(ctx)
            PA.paintTable(ctx)
            PA.paintCounter(ctx)
            PA.paintContainer(ctx, DW, gs, tick, pullAnim)
            PA.paintContainer(ctx, FR, gs, tick, pullAnim)
            // flying cargo draws above furniture
            for (const it of gs.items) {
                if (it.state === 'loose') PA.drawItem(ctx, it.kind, it.x, it.y)
                else if (it.state === 'fly') PA.drawItem(ctx, it.kind, it.x, it.y)
            }
            // #2250 GLIDE marker: a pulsing ring at the tapped spot, in
            // the skin's own chrome colors so it reads as an order, not furniture.
            if (goto && screenRef.current === 'play') {
                const pulse = 3.4 + Math.sin(tick * 0.22) * 1.6
                ctx.strokeStyle = PA.chrome.ring; ctx.lineWidth = 1.4
                circle(ctx, goto.x, goto.y, pulse); ctx.stroke()
                ctx.strokeStyle = PA.chrome.ringSoft
                circle(ctx, goto.x, goto.y, pulse + 2.6); ctx.stroke()
                ctx.fillStyle = PA.chrome.dot
                circle(ctx, goto.x, goto.y, 1.1); ctx.fill()
            }
            // #2338 AIM marker: teal corner brackets pulsing around the marked
            // rack item — the bot's own chrome says THIS one is next for B.
            if (aim && screenRef.current === 'play') {
                const it = gs.items.find((i2) => i2.id === aim && i2.state === 'in')
                if (!it) clearAim()
                else {
                    const cc = it.cont === 'dw' ? DW : FR
                    const sl = it.slot === null || it.slot === undefined ? 0 : it.slot
                    const p = rackSlot(cc, sl % RACK_CAP)
                    const q = 5.5 + Math.sin(tick * 0.22) * 1.1
                    ctx.strokeStyle = PA.chrome.bracket; ctx.lineWidth = 1.3
                    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                        ctx.beginPath()
                        ctx.moveTo(p.x + sx * q, p.y + sy * q - sy * 2.6)
                        ctx.lineTo(p.x + sx * q, p.y + sy * q)
                        ctx.lineTo(p.x + sx * q - sx * 2.6, p.y + sy * q)
                        ctx.stroke()
                    }
                }
            }
            // #2343 attract flourish marker: the same teal brackets + an AIMED
            // tag pulse on the stow the demo is about to pull — tap-the-rack,
            // taught mid-demo without one fake keypress.
            if (flourish && screenRef.current === 'attract') {
                const it = gs.items.find((i2) => i2.id === flourish.id && i2.state === 'in')
                if (!it) flourish = null
                else {
                    const cc = it.cont === 'dw' ? DW : FR
                    const sl = it.slot === null || it.slot === undefined ? 0 : it.slot
                    const p = rackSlot(cc, sl % RACK_CAP)
                    const q = 5.5 + Math.sin(tick * 0.22) * 1.1
                    ctx.strokeStyle = PA.chrome.bracket; ctx.lineWidth = 1.3
                    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                        ctx.beginPath()
                        ctx.moveTo(p.x + sx * q, p.y + sy * q - sy * 2.6)
                        ctx.lineTo(p.x + sx * q, p.y + sy * q)
                        ctx.lineTo(p.x + sx * q - sx * 2.6, p.y + sy * q)
                        ctx.stroke()
                    }
                    ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center'
                    ctx.fillStyle = PA.chrome.tag
                    ctx.fillText('AIMED', p.x, p.y - q - 2.5)
                }
            }
            // #2343 reach arc (presentation-only): the retrieved item flies from
            // its slot into the front arm over 8 ticks with a small dip-arc and
            // a fading tail. The sim resolved the pull in one tick — only the
            // show changed. The vacated slot blinks amber so the eye catches
            // WHICH stow left (the direction-pull teaching beat).
            if (pullAnim) {
                pullAnim.t++
                const cc = pullAnim.c === 'dw' ? DW : FR
                const sp = rackSlot(cc, pullAnim.slot % RACK_CAP)
                if (pullAnim.t <= 4) {
                    ctx.fillStyle = `rgba(${PA.chrome.arcFlash},${0.75 * (1 - pullAnim.t / 4)})`
                    circle(ctx, sp.x, sp.y, 3.6 + pullAnim.t * 0.9); ctx.fill()
                }
                if (pullAnim.t > 8) pullAnim = null
                else {
                    const k = pullAnim.t / 8
                    const hx = gs.rx, hy = gs.ry - 16
                    const ax = sp.x + (hx - sp.x) * k
                    const ay = sp.y + (hy - sp.y) * k - Math.sin(k * Math.PI) * 9
                    for (let i = 1; i <= 3; i++) {
                        const kk = Math.max(0, k - i * 0.09)
                        const tx2 = sp.x + (hx - sp.x) * kk
                        const ty2 = sp.y + (hy - sp.y) * kk - Math.sin(kk * Math.PI) * 9
                        ctx.fillStyle = `rgba(${PA.chrome.arcTail},${0.22 - i * 0.06})`
                        circle(ctx, tx2, ty2, 2.4 - i * 0.5); ctx.fill()
                    }
                    PA.drawItem(ctx, pullAnim.kind, ax, ay, 0.72)
                }
            }
            // #2258 arrival ring scale-out where the glide completed
            if (ringPop) {
                ringPop.t++
                if (ringPop.t > 14) ringPop = null
                else {
                    ctx.strokeStyle = `rgba(${PA.chrome.ringPop},${0.85 * (1 - ringPop.t / 14)})`
                    ctx.lineWidth = 1.4
                    circle(ctx, ringPop.x, ringPop.y, 3.4 + ringPop.t * 1.1); ctx.stroke()
                }
            }
            PA.paintRobot(ctx, gs, tick, pullAnim ? pullAnim.kind : null)
            paintParticles()
            ctx.restore()
            PA.paintHud(ctx, gs, tick)
            if (flash > 0) { ctx.fillStyle = `rgba(255,60,50,${flash / 40})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); flash-- }
            if (screenRef.current === 'attract') PA.paintAttract(ctx, tick, bestScore())
            if (screenRef.current === 'over') PA.paintOver(ctx, gs, tick)
            if (hudRef.current.toastT > 0) { hudRef.current.toastT--; if (hudRef.current.toastT === 0 && hudRef.current.toast) hudRef.current.toast.textContent = '' }
            if (hudRef.current.levelTag) hudRef.current.levelTag.textContent = LEVELS[gs.level].name
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            if (!last) last = now
            let dt = now - last
            last = now
            if (dt > 250) dt = 250
            acc += dt
            let n = 0
            while (acc >= SIM_MS && n < 8) {
                acc -= SIM_MS; n++
                if (!pausedRef.current && !contractHoldsLoop()) doSim()
            }
            paint()
        }

        const startPlay = () => {
            // #1473: honor ?seed=N so a filed report replays this exact shift
            const pin = seedFromQuery()
            gs = makeGame(pin != null ? pin >>> 0 : (Math.random() * 2 ** 31) | 0, 1)
            parts.length = 0; gs.fx.length = 0
            watchingRef.current = false; setWatching(false) // #1637 a new shift starts in your hands
            goto = null; gotoLevel = 0 // #2250 fresh shift, no stale orders
            clearAim() // #2338
            flourish = null; pullAnim = null // #2343
            setEnd(null)
            setMode('play')
            audioController.playTone(262, 0.08, 'square', 0.06)
            audioController.playTone(392, 0.08, 'square', 0.06, 0.09)
            audioController.playTone(523, 0.12, 'square', 0.06, 0.18)
        }

        const onKeyDown = (e) => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
            if (e.code === 'Escape' || e.code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            // #3078 SKINS: T flips the look on any screen — a style choice
            // should never cost you a run.
            if (e.code === 'KeyT') { setSkinStyle(skin === 'reimagined' ? 'classic' : 'reimagined'); return }
            if (pausedRef.current) return
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over') {
                if (performance.now() - overAt < 600) return
                setMode('attract')
                gs = makeGame(1337, 1)
                return
            }
            // #1637 WATCH: Y seats the proven brain at any live shift state
            // (autopilot re-decides from live); any driving key takes the bot back.
            if (isWatchKey(e)) {
                goto = null // #2250 the prover takes the wheel; the glide steps down
                clearAim() // #2338 and so does a pending mark
                clearPending() // #2537 and a pending chore
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (!gs.end) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            // #2250 GLIDE: keys are the human speaking — a glide yields at once.
            goto = null
            clearPending() // #2537 same law for a pending chore
            // #2338 mark cancel law: MOVEMENT interrupts the mark; B is the
            // COMMIT gesture, so it must not be cleared at keydown — doSim
            // ends the mark when the press lands (consume or refuse, never a
            // stale order).
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') clearAim()
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true
            if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true
            if (e.code === 'Space' || e.code === 'KeyZ') { if (!e.repeat) edgeA = true }
            if (e.code === 'KeyB') { if (!e.repeat) edgeB = true }
        }
        const onKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false
            if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false
            if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false
            if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false
        }
        const onPointerDown = (e) => {
            if (screenRef.current === 'attract') startPlay()
            else if (screenRef.current === 'over' && performance.now() - overAt > 600) { setMode('attract'); gs = makeGame(1337, 1) }
            // #1637 WATCH: a touch on the rooms means you want the bot — hand back.
            // (The WATCH pill stopPropagations its press; the pad's own keydowns
            // already take over.)
            else if (screenRef.current === 'play' && watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
            // #2250 GLIDE: a tap on the floor is "walk there". Buried taps get
            // an honest NO WAY (same refusal voice as STAND CLEAR), never a wedge.
            else if (screenRef.current === 'play' && !pausedRef.current && !gs.end) {
                const rect = canvas.getBoundingClientRect()
                if (!rect.width || !rect.height) return
                const wx = (e.clientX - rect.left) * (VIEW_W / rect.width)
                const wy = (e.clientY - rect.top) * (VIEW_H / rect.height)
                clearAim() // #2338 a new tap is a new order, same law as the glide
                clearPending() // #2537 so is a new chore
                const ta = tapAct(gs, wx, wy)
                if (ta.ok) {
                    // #2537 TAP-ACT: a container tap is an ORDER — the bot
                    // routes to the work spot and the verb fires on arrival
                    // (open / place / retrieve, judged by pendingFire).
                    pending = { ...ta, cd: 0 }; pendingLevel = gs.level
                    if (ta.act === 'retrieve' && ta.id !== null) {
                        // a named pull still sells its name — brackets + AIMED
                        // ride the mark until the B lands (#2338 presentation,
                        // but now the tap is also the commit)
                        aim = ta.id; aimLevel = gs.level
                        const it = gs.items.find((i2) => i2.id === ta.id)
                        const p = it ? rackSlot(ta.c === 'dw' ? DW : FR, it.slot || 0) : { x: wx, y: wy }
                        gs.fx.push({ msg: 'AIMED', x: p.x, y: p.y - 7, k: 0, t: 'ok' })
                        audioController.playTone(980, 0.05, 'sine', 0.035)
                        audioController.playTone(1470, 0.06, 'sine', 0.03, 0.05)
                    } else audioController.playTone(660, 0.04, 'sine', 0.03)
                    const rr = routeDir(gs, ta.gx, ta.gy)
                    if (rr.ok && !rr.arrived) { goto = { x: ta.gx, y: ta.gy }; gotoLevel = gs.level }
                } else {
                    const r = routeDir(gs, wx, wy)
                    if (r.ok) {
                        goto = { x: wx, y: wy }
                        gotoLevel = gs.level
                        audioController.playTone(660, 0.04, 'sine', 0.03)
                    } else {
                        gs.fx.push({ msg: 'NO WAY', x: wx, y: wy, k: 0, t: 'bad' })
                        // #2258: NO WAY is Sadder than STAND CLEAR (the 120 square
                        // blip stays with the door refusal) — a sagging fall.
                        audioController.playSweep(240, 110, 0.22, 'triangle', 0.06)
                    }
                }
            }
        }

        // ---- contract (QA bots / replays / RL) ----
        const simState = () => ({
            tick: gs.tick,
            score: gs.score,
            done: !!gs.end,
            players: 1,
            seed: gs.seed,
            hash: gs.hash,
            level: gs.level,
            clock: gs.clock,
            chores: gs.chores.map((c) => (c.done ? 1 : 0)),
            held: gs.held === null ? '' : gs.items.find((i2) => i2.id === gs.held)?.kind || 'x',
            held2: gs.held2 === null || gs.held2 === undefined ? '' : gs.items.find((i2) => i2.id === gs.held2)?.kind || 'x',
            pos: Math.round(gs.rx * 10) / 10,
            posY: Math.round(gs.ry * 10) / 10,
            dwDoor: Math.round(gs.dw.door * 100) / 100,
            frDoor: Math.round(gs.fr.door * 100) / 100,
            dwRun: gs.dwRun,
            tidy: gs.tidies,
            jams: gs.jams,
            spills: gs.spills,
            wrongs: gs.wrongs,
            breaks: gs.breaks,
            items: gs.items.map((it) => [it.kind, Math.round(it.x), Math.round(it.y), it.state, it.cont || '']),
            aim: aim === null ? -1 : aim, // #2338 marked item (-1 = none)
            pending: pending ? pending.act : '', // #2537 open/place/retrieve ('' = none)
            endReason: gs.endReason,
        })
        const testState = () => ({ ...simState(), mode: screenRef.current, skin }) // #3078 skin visible to QA
        exposeGame({
            id: 'tidy-bot',
            method: 'dpad',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            players: 1,
            reset: (seed) => {
                contractSeed = seed >>> 0
                gs = makeGame(contractSeed, 1)
                parts.length = 0
                goto = null // #2250 contract resets clear the glide too
                clearAim() // #2338 and the aim mark
                clearPending() // #2537 and the pending chore
                flourish = null; pullAnim = null // #2343
                setEnd(null)
                setMode('play')
            },
            tick: (pad) => {
                if (screenRef.current !== 'play') {
                    screenRef.current = 'play'
                    setMode('play')
                }
                step(gs, [pad])
                if (pad && (pad.a || pad.b)) clearAim() // #2338 verbs end the mark here too
                handleEvents(gs.ev)
                if (gs.end && screenRef.current === 'play') finish()
            },
            state: simState,
            canvas: () => canvas,
            snapshot: () => JSON.parse(JSON.stringify({
                seed: gs.seed, tick: gs.tick, score: gs.score, level: gs.level, clock: gs.clock,
                rx: gs.rx, ry: gs.ry, facing: gs.facing, walk: gs.walk, held: gs.held, held2: gs.held2,
                dw: { door: gs.dw.door, target: gs.dw.target, cd: gs.dw.cd },
                fr: { door: gs.fr.door, target: gs.fr.target, cd: gs.fr.cd },
                dwRun: gs.dwRun, opened: { ...gs.opened }, breaks: gs.breaks, wrongs: gs.wrongs, spills: gs.spills, jams: gs.jams, tidies: gs.tidies,
                items: gs.items, auto: gs.auto, end: gs.end, endReason: gs.endReason, levelsDone: gs.levelsDone, timeBonusTotal: gs.timeBonusTotal,
            })),
            restore: (s) => {
                loadLevel(gs, s.level)
                Object.assign(gs, {
                    seed: s.seed >>> 0, tick: s.tick, score: s.score, clock: s.clock,
                    rx: s.rx, ry: s.ry, facing: s.facing, walk: s.walk, held: s.held, held2: s.held2 ?? null,
                    dwRun: s.dwRun, opened: { dw: false, fr: false, ...(s.opened || {}) }, breaks: s.breaks, wrongs: s.wrongs, spills: s.spills, jams: s.jams, tidies: s.tidies,
                    end: s.end, endReason: s.endReason || '', levelsDone: s.levelsDone, timeBonusTotal: s.timeBonusTotal,
                })
                gs.dw.door = s.dw.door; gs.dw.target = s.dw.target; gs.dw.cd = s.dw.cd
                gs.fr.door = s.fr.door; gs.fr.target = s.fr.target; gs.fr.cd = s.fr.cd
                gs.auto = { ...s.auto }
                gs.items = s.items.map((it) => ({ ...it }))
                markChores(gs)
                gs.hash = stateHash(gs)
            },
        })

        // DEV hook
        if (import.meta.env.DEV) {
            window.__tidybotTest = {
                state: testState,
                // #1637 watchcheck pilot drives these.
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, score: gs.score, tidies: gs.tidies,
                    level: gs.level, x: gs.rx, y: gs.ry, end: gs.end,
                    loose: gs.items.filter((it) => it.state === 'loose').length,
                }),
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                hash: () => gs.hash,
                canvas: () => canvas,
                sim: () => gs,
                skin: () => skin, // #3078
                setSkin: (v) => setSkinStyle(v),
                step: (n = 1, pad = {}) => { for (let i = 0; i < n; i++) step(gs, [pad]) },
                press: (code) => onKeyDown({ code, preventDefault() {}, repeat: false }),
                release: (code) => onKeyUp({ code }),
                // #2250 GLIDE: harness taps (world coords) + glide introspection.
                glide: (x, y) => {
                    const r = routeDir(gs, x, y)
                    if (r.ok) { goto = { x, y }; gotoLevel = gs.level }
                    return r
                },
                gliding: () => !!goto,
                // #2338 AIM: harness taps (world coords) name a rack item; the
                // mark then rides live pads like the real pointer does.
                aim: (x, y) => {
                    const a = aimAt(gs, x, y)
                    if (a.ok) { aim = a.id; aimLevel = gs.level }
                    return a
                },
                aimed: () => aim,
                // #2343 QA hooks: the attract mark (item id or -1) and the live
                // reach-arc (null when nothing is in flight).
                flourish: () => (flourish ? flourish.id : -1),
                attractNow: () => setMode('attract'), // #2343 QA: hand the screen to the demo, keep this gs
                pullAnim: () => (pullAnim ? { c: pullAnim.c, slot: pullAnim.slot, kind: pullAnim.kind, t: pullAnim.t } : null),
                rackSlot,
                DW, FR, TABLE, COUNTER, VIEW_W, VIEW_H,
            }
            mountDbg({
                title: 'TIDY BOT',
                getState: () => [
                    `tick ${gs.tick} level ${gs.level + 1} | score ${gs.score} clock ${Math.ceil(gs.clock / 60)}s`,
                    `pos ${Math.round(gs.rx)},${Math.round(gs.ry)} held ${gs.held ?? '-'}+${gs.held2 ?? '-'} dw ${Math.round(gs.dw.door * 100)}% fr ${Math.round(gs.fr.door * 100)}% run ${gs.dwRun ? 'on' : 'off'}`,
                    `tidy ${gs.tidies} jam ${gs.jams} spill ${gs.spills} wrong ${gs.wrongs} break ${gs.breaks} | ${gs.end || 'running'} ${gs.endReason}`,
                ],
                actions: [
                    { label: 'open washer', run: () => { gs.dw.target = 1; return 'washer opening' } },
                    { label: 'open fridge', run: () => { gs.fr.target = 1; return 'fridge opening' } },
                    { label: 'spawn plate at bot', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'plate', x: gs.rx, y: gs.ry + 8, vx: 0, vy: 0, state: 'loose', cont: null }); return 'plate @ bot' } },
                    { label: 'apple into washer', run: () => { gs.items.push({ id: 9000 + gs.tick, kind: 'apple', x: 0, y: 0, vx: 0, vy: 0, state: 'in', cont: 'dw' }); return 'wrong stow armed' } },
                    { label: 'force win', run: () => { for (const it of gs.items) if (it.state === 'loose' || it.state === 'held') it.state = 'gone'; gs.held = null; gs.held2 = null; gs.dwRun = true; gs.dw.target = 0; gs.fr.target = 0; gs.dw.door = 0; gs.fr.door = 0; return 'house armed for clear' } },
                    { label: 'reset', run: () => { gs = makeGame(1337, 1); setMode('attract'); return 'rebooted' } },
                ],
            })
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointerDown)
        raf = requestAnimationFrame(loop)
        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: !!gs.end, seed: gs.seed, level: gs.level }))

        return () => {
            unexposeFeedbackState()
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            canvas.removeEventListener('pointerdown', onPointerDown)
            unexposeGame()
            unmountDbg()
            canvas.remove()
            delete window.__tidybotTest
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black select-none">
            <div ref={stageRef} className="relative w-full max-w-[720px] aspect-[320/240]" style={{ imageRendering: 'pixelated' }} />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[11px] tracking-widest" ref={setHud('toast')} style={{ color: '#ffd23f', textShadow: '0 1px 0 #000' }} />
            <div className="absolute bottom-1 left-2 font-mono text-[10px] text-amber-200/60 pointer-events-none">
                <span ref={setHud('levelTag')}>KITCHEN / LIGHT DRIZZLE</span> · A: use · B: toss/pull · tap floor to glide · tap rack item to aim · T: style
            </div>
            {/* #3078 SKINS — the look toggle; classic is the default, papercraft the reimagine */}
            {!paused && (
                <button
                    type="button"
                    aria-label="toggle art style"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => skinToggleRef.current()}
                    className="absolute z-[60] font-mono text-[10px] font-bold tracking-wider px-2 py-1 rounded-full border transition-colors"
                    style={{
                        bottom: '1.75rem', left: '50%', transform: 'translateX(-50%)',
                        color: skinUi === 'reimagined' ? '#6b4a2a' : '#ffd9a0',
                        background: skinUi === 'reimagined' ? '#ffe36e' : 'rgba(16,10,8,0.72)',
                        borderColor: skinUi === 'reimagined' ? '#d8c284' : '#c8a06a',
                    }}
                >
                    STYLE: {skinUi === 'reimagined' ? 'PAPERCRAFT' : 'CLASSIC'}
                </button>
            )}
            {screen === 'attract' && (
                <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 pointer-events-none">
                    <AttractMessage messages={TIDY_ATTRACT} ms={2600} className="text-amber-200/80" />
                    <span className="font-mono font-bold tracking-wider text-amber-200/70">{WATCH_ATTRACT_HINT}</span>
                </div>
            )}
            {screen === 'over' && end && (
                <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
                    <p className="font-mono text-[11px] text-white/60">{end.won ? 'The house signs the timesheet. Five stars.' : 'Dust bunnings everywhere. Try again at dawn.'}</p>
                </div>
            )}
            {/* #1637 WATCH — the prover clocks the shift; any input takes over. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            <VirtualControls secondAction={{ label: 'TOSS', code: 'KeyB' }} visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'TIDY BOT')} onResume={handleResume} />}
        </div>
    )
}

export default TidyBotGame

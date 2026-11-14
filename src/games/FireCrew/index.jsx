// FIRE CREW — the arcade shell (#1254). Original co-op firefighting: spreading
// fire, shifting wind, collapsing floors, and a smoke-dark interior where the
// three seats see different things. All art is runtime (./art.js), all sound is
// synthesized (audioController), all rules are pure + seeded (./sim.js).
//
// Plumbing per docs/GAME-SHELL.md: one rAF loop with a fixed timestep, attract
// first (any key or tap), '?' pause, VirtualControls for phones, the __game
// contract with per-seat pads, DEV hooks + DebugKit.
import { useCallback, useEffect, useRef, useState } from 'react'
import { GAMES } from '../../config/games'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { useRotateHint } from '../../components/useRotateHint'
import WatchButton, { WatchToast } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { MESSAGES, PRESS } from './attract.js'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordVoiceCmd, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { audioController } from '../../utils/AudioController'
import { makeRun, step, state, setSources, CLOCK, W, stepToward, inLoft, applyRadio, windVoice, ladderCreak, windWhistle, crewTail } from './sim.js'
import { parseRadio } from './voiceradio.js'
import { askVoiceConsent, createVoiceSession } from '../../utils/voiceCapture'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import { VW, VH, drawBackdrop, drawCrew, drawVictim, drawFire, drawFx, drawSmoke, drawDarkness, drawProps, drawHud } from './art.js'

const FIXED_DT = 1000 / 60

const sfx = {
    start: () => { audioController.playSweep(220, 660, 0.25, 'square', 0.08); audioController.playTone(880, 0.12, 'square', 0.07, 0.18) },
    rescue: () => { audioController.playTone(784, 0.1, 'square', 0.09); audioController.playTone(1175, 0.16, 'square', 0.09, 0.09) },
    lost: () => audioController.playSweep(320, 90, 0.5, 'sawtooth', 0.1),
    knock: () => audioController.playNoise(0.12),
    slip: () => audioController.playSweep(600, 180, 0.35, 'sawtooth', 0.09),
    spray: () => audioController.playNoise(0.05),
    flare: () => audioController.playSweep(200, 900, 0.2, 'triangle', 0.06),
    up: () => audioController.playTone(300, 0.05, 'square', 0.04),
    pump: () => audioController.playTone(140, 0.06, 'square', 0.05),
    wind: () => audioController.playSweep(90, 220, 0.6, 'triangle', 0.05),
    // #1744 — sustained wind bed and ladder load-creak; params come from the
    // sim-side pure voices (windVoice / ladderCreak), never from the shell.
    windBed: (v) => audioController.playFilteredNoise(v.dur, v.vol, v.freq),
    // #1749 — the cross-wind octave shadow: the second burst of a N/S gale,
    // layered 0.15 s under the main bed (the mix has no pan; this is how the
    // gale reads "from the other side").
    windBed2: (v) => audioController.playFilteredNoise(v.dur, v.vol, v.freq, 0.15),
    // #1749 — the vane pre-whistle: a rising sweep on the sim's shift countdown
    windWhistle: (w) => audioController.playSweep(w.f0, w.f1, w.dur, 'triangle', w.vol),
    windCreak: (c) => audioController.playSweep(c.f0, c.f1, c.dur, 'sawtooth', c.vol),
    win: () => [523, 659, 784, 1046].forEach((f, i) => audioController.playTone(f, 0.16, 'square', 0.09, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => audioController.playTone(f, 0.22, 'square', 0.08, i * 0.16)),
    // #1749 — the crowd/machinery tail under the win/lose jingle (ducked:
    // vol 0.05/0.06 vs the jingle's 0.09/0.08)
    tail: (t) => audioController.playFilteredNoise(t.dur, t.vol, t.freq, 0.1),
    move: () => audioController.playTone(520, 0.05, 'square', 0.05),
    radio: () => { audioController.playTone(660, 0.06, 'square', 0.05); audioController.playTone(990, 0.08, 'square', 0.05, 0.06) },
    radioNo: () => audioController.playTone(233, 0.12, 'sawtooth', 0.05),
}

// #1473: honor ?seed=N so a filed feedback report's seed replays this exact
// shift (rng derives from any integer seed); unpin = the original 1..65535 roll.
const humanSeed = () => {
    const pin = seedFromQuery()
    return pin != null ? (pin >>> 0 || 1) : 1 + Math.floor(Math.random() * 65535)
}

export default function FireCrew() {
    const canvasRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    // #2187: the rotate card's dismiss button is chrome — attract copy over it
    // fails the #1099 sweep on phones (#1748 rule: get out of the card's way).
    const rotHint = useRotateHint()
    const [uiScreen, setUiScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [seats, setSeats] = useState(1)
    const [voiceHints, setVoiceHints] = useState(false)
    // WATCH (#1637 b28): the React mirror of the sheet flip — seat 1 is driven
    // by the sim's own autopilot while watching (gs.sources[0] === 'cpu').
    const [watching, setWatching] = useState(false)
    const watchingRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const seatsRef = useRef(1)
    const gsRef = useRef(null)
    const demoRef = useRef(null)
    const overAtRef = useRef(0)
    const selectRef = useRef(1)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const keys3Ref = useRef({})
    const prevRef = useRef(null)
    // #1744 — wind bed scheduling: the overlap tick is when the next bed
    // burst may fire (0.85·dur keeps the whoosh continuous with no gap);
    // lastBed/lastCreak are what the browser gate reads back.
    const windBedAtRef = useRef(0)
    const windCreakAtRef = useRef(0)
    const windWhistleAtRef = useRef(0) // #1749 — one whistle per 15 ticks max
    const lastBedRef = useRef(null)
    const lastCreakRef = useRef(null)
    const lastWhistleRef = useRef(null)
    // voice radio (#1361): the mic is a seat, like any slot — consent first
    // (never auto-asked), one raw track for the whole run, spoken calls feed
    // the sim through applyRadio so the mic can never beat the darkness.
    const voiceRef = useRef({ on: false, listen: null, session: null, track: null, hintsT: 0 })

    useEffect(() => { screenRef.current = screen }, [screen])
    useEffect(() => { pausedRef.current = paused }, [paused])
    useEffect(() => { seatsRef.current = seats }, [seats])

    const startPlay = useCallback((seed, players) => {
        const n = Math.max(1, Math.min(3, players | 0 || 1))
        const src = ['cpu', 'cpu', 'cpu']
        for (let i = 0; i < n; i++) src[i] = 'human'
        voiceRef.current.track = null // fresh run, fresh voice
        gsRef.current = setSources(makeRun(seed >>> 0 || 1), src)
        watchingRef.current = false // watch never lingers — a new alarm starts in your hands
        setWatching(false)
        prevRef.current = null
        windBedAtRef.current = 0
        windCreakAtRef.current = 0
        windWhistleAtRef.current = 0
        lastBedRef.current = null
        lastCreakRef.current = null
        lastWhistleRef.current = null
        seatsRef.current = n
        setSeats(n)
        setEnd(null)
        screenRef.current = 'play'
        setScreen('play')
        setUiScreen('play')
        sfx.start()
    }, [])

    const startAttract = useCallback(() => {
        demoRef.current = setSources(makeRun(20261031), ['cpu', 'cpu', 'cpu'])
        screenRef.current = 'attract'
        setScreen('attract')
        setUiScreen('attract')
    }, [])

    // WATCH (#1637 b28): the proven route is the sim's OWN autopilot — the
    // sheet flip sources[0] human<->cpu hands seat 1 to the crew that
    // firecrewcheck races to 6/6 rescues. Reactive per tick (Rogue law):
    // seats anywhere mid-alarm, hands the live floor straight back.
    const seat = () => {
        const g = gsRef.current
        if (!g || g.done || screenRef.current !== 'play' || watchingRef.current) return
        g.sources[0] = 'cpu'
        watchingRef.current = true
        setWatching(true)
        playWatchStart()
    }
    const release = (blip = true) => {
        const g = gsRef.current
        if (g) g.sources[0] = 'human'
        watchingRef.current = false
        setWatching(false)
        if (blip) playWatchStop()
    }

    const endVoice = useCallback((finalize) => {
        const v = voiceRef.current
        v.on = false
        clearTimeout(v.hintsT)
        if (v.listen) { v.listen.stop(); v.listen = null }
        if (v.session) {
            const s = v.session
            v.session = null
            if (finalize) s.finalize().then((track) => { if (track) voiceRef.current.track = track }).catch(() => { /* no honest audio */ })
        }
        setVoiceHints(false)
    }, [])

    const finish = useCallback((g) => {
        if (screenRef.current === 'over') return
        if (watchingRef.current) release(false) // watch never lingers into GAME OVER (silent, racer rule)
        // #1249 law: never leave the mic hot on the GAME OVER screen
        if (voiceRef.current.on || voiceRef.current.session) endVoice(true)
        const won = g.win && g.rescued > 0
        setEnd({ win: won, rescued: g.rescued, lost: g.lost, doused: g.doused, score: g.score })
        prevRef.current = won ? 'win' : 'lose'
        if (won) sfx.win(); else sfx.lose()
        sfx.tail(crewTail(won)) // #1749 — the crowd/machinery tail under the jingle
        screenRef.current = 'over'
        setScreen('over')
        setUiScreen('over')
        overAtRef.current = performance.now()
    }, [endVoice])

    const padFrom = (keys) => ({
        left: !!keys.left, right: !!keys.right, up: !!keys.up, down: !!keys.down,
        a: !!keys.a, b: !!keys.b,
    })

    const listenEvents = useCallback((g) => {
        const p = prevRef.current || { rescued: 0, lost: 0, knocks: g.crew.map((c) => c.knocks), msgT: 0, ladder: g.ladder, gust: g.wind.gust, tick: g.tick }
        if (g.rescued > p.rescued) sfx.rescue()
        if (g.lost > p.lost) sfx.lost()
        g.crew.forEach((c, i) => { if (c.knocks > p.knocks[i]) sfx.knock() })
        if (g.ladder < p.ladder - 0.5) sfx.slip()
        if (g.wind.gust > p.gust) sfx.wind()
        // #1744 — the sustained bed: gusts are heard, not just read off the
        // HUD vane. Short filtered-noise bursts overlapped at 85% of the
        // voice duration read as one wind; the creak is the ladder loaded up.
        const wv = windVoice(g.wind.gust, g.wind.dir)
        if (wv.vol > 0 && g.tick >= windBedAtRef.current) {
            sfx.windBed(wv)
            if (wv.second) sfx.windBed2(wv.second)
            lastBedRef.current = { tick: g.tick, vol: wv.vol, freq: wv.freq, second: wv.second || null }
            windBedAtRef.current = g.tick + Math.round(wv.dur * 60 * 0.85)
        }
        // #1749 — the vane pre-whistle: a rising figure in the last second
        // before the wind turns. One shot per 15 ticks while the countdown is
        // live; the sim's shift countdown is the only clock (no shell timers).
        const ww = windWhistle(g.wind.next - g.tick)
        if (ww && g.tick >= windWhistleAtRef.current) {
            sfx.windWhistle(ww)
            lastWhistleRef.current = { tick: g.tick, f0: ww.f0, f1: ww.f1 }
            windWhistleAtRef.current = g.tick + 15
        }
        const cr = ladderCreak(g.wind.gust, g.ladder)
        if (cr && g.tick >= windCreakAtRef.current) {
            sfx.windCreak(cr)
            lastCreakRef.current = { tick: g.tick, vol: cr.vol }
            windCreakAtRef.current = g.tick + 40 + Math.round((1 - g.ladder) * 30)
        }
        if (g.messageT > p.msgT + 100 && /LADDER/.test(g.message)) sfx.slip()
        if (Math.abs(g.ladder - p.ladder) > 0.001 && g.tick % 12 < 2) sfx.pump()
        prevRef.current = { rescued: g.rescued, lost: g.lost, knocks: g.crew.map((c) => c.knocks), msgT: g.messageT, ladder: g.ladder, gust: g.wind.gust, tick: g.tick }
    }, [])

    const spec = useRef(null)
    if (!spec.current) {
        spec.current = {
            id: 'fire-crew',
            method: 'dpad',
            get players() { return seatsRef.current },
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => gsRef.current ? gsRef.current.sources.map((kind) => ({ kind })) : [{ kind: 'cpu' }],
            reset: (seed, players) => { startPlay(seed, players); return state(gsRef.current) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return g ? state(g) : null
                const arr = Array.isArray(pads) && pads.length ? pads.slice(0, 3) : [pad || {}, {}, {}]
                while (arr.length < 3) arr.push({})
                step(g, arr[0], arr)
                listenEvents(g)
                if (g.done) finish(g)
                return state(g)
            },
            state: () => (gsRef.current ? state(gsRef.current) : { tick: 0, score: 0, done: false, players: 1 }),
            canvas: () => canvasRef.current,
            voiceExtra: () => (voiceRef.current.track ? { tracks: [voiceRef.current.track] } : null),
            watchSfx: watchSfxLog,
        }
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = VW; cvs.height = VH
        startAttract()
        if (import.meta.env.DEV) exposeGame(spec.current)

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const keys3 = keys3Ref.current
        const allKeys = () => [keys1, keys2, keys3]
        const clearKeys = () => { for (const k of allKeys()) for (const f of Object.keys(k)) k[f] = false }

        const S1 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', KeyB: 'b' }
        const S2 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'a', KeyG: 'b' }
        const S3 = { KeyJ: 'left', KeyL: 'right', KeyI: 'up', KeyK: 'down', KeyU: 'a', KeyO: 'b' }
        const MAPS = () => [S1, seatsRef.current > 1 ? S2 : null, seatsRef.current > 2 ? S3 : null]

        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || (e.shiftKey && e.code === 'Digit1')) {
                if (screenRef.current === 'play') { e.preventDefault(); setPaused((p) => !p) }
                return
            }
            if (screenRef.current === 'attract') { clearKeys(); screenRef.current = 'select'; setScreen('select'); sfx.start(); return }
            if (screenRef.current === 'over') {
                if (performance.now() - overAtRef.current > 700) { clearKeys(); startAttract() }
                return
            }
            if (screenRef.current === 'select') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    selectRef.current = 1 + ((selectRef.current + (e.code === 'ArrowRight' ? 1 : 2)) % 3)
                    setSeats(selectRef.current)
                    sfx.move()
                }
                if (e.code === 'Digit2') { selectRef.current = 2; setSeats(2); sfx.move() }
                if (e.code === 'Digit3') { selectRef.current = 3; setSeats(3); sfx.move() }
                if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault()
                    startPlay(humanSeed(), selectRef.current)
                }
                return
            }
            if (pausedRef.current) return
            if (e.code === 'KeyV') { e.preventDefault(); voiceToggle(); return } // crew radio — reaches the cpu seats even seated (#1361)
            // WATCH (#1637 b28): Y flips the seat both ways; any driving key
            // grabs the hose back — and lands in keys1 below, so a HELD key
            // drives from the tick it takes over (the watcher owns the wheel
            // only until you touch it).
            if (isWatchKey(e)) { e.preventDefault(); if (watchingRef.current) release(); else seat(); return }
            // #2029 decision, pinned: FLARE is NOT exempted — B releases the
            // seat AND flares the same press. The release runs first, then the
            // key lands in keys1 below, so the takeover itself throws the
            // flare: "you grabbed the hose and lit the room" in one motion.
            if (watchingRef.current && isTakeoverKey(e)) release()
            const maps = MAPS()
            const keysets = [keys1, keys2, keys3]
            for (let i = 0; i < 3; i++) {
                const f = maps[i] && maps[i][e.code]
                if (f) { e.preventDefault(); keysets[i][f] = true; return }
            }
        }
        const onKeyUp = (e) => {
            const maps = MAPS()
            const keysets = [keys1, keys2, keys3]
            for (let i = 0; i < 3; i++) {
                const f = maps[i] && maps[i][e.code]
                if (f) keysets[i][f] = false
            }
        }
        const onPointer = () => {
            if (screenRef.current === 'attract') { clearKeys(); screenRef.current = 'select'; setScreen('select'); sfx.start() }
            else if (screenRef.current === 'over' && performance.now() - overAtRef.current > 700) { clearKeys(); startAttract() }
            else if (screenRef.current === 'select') startPlay(humanSeed(), selectRef.current)
            else if (screenRef.current === 'play' && watchingRef.current) release() // a tap on the field steers (#1637)
        }

        // VOICE RADIO (#1361): V toggles the crew radio. Consent first (the
        // #1247 ask, never auto-asked); one raw mic track for the whole run
        // (banked into the recording via spec.voiceExtra); every spoken call
        // runs parseRadio -> applyRadio — the same pure path the harness
        // drives, so the mic can only say what the sim lets through.
        const say = (msg) => { const g = gsRef.current; if (g && !g.done) { g.message = msg; g.messageT = 120 } }
        const radioCall = (raw) => {
            const g = gsRef.current
            const text = String(raw || '').trim()
            if (!g || g.done || !text) return
            const intent = parseRadio(text)
            const res = applyRadio(g, intent)
            if (res.ok) sfx.radio(); else sfx.radioNo()
            recordVoiceCmd({
                said: text.slice(0, 80),
                intent: intent ? intent.kind : null,
                ok: !!res.ok,
                ...(res.ok && intent && intent.kind === 'spot' ? { side: res.side } : {}),
                ...(res.ok && intent && intent.kind === 'ladder' ? { dir: res.dir } : {}),
                ...(!res.ok && res.why ? { why: res.why } : {}),
            })
        }
        const voiceToggle = async () => {
            const v = voiceRef.current
            if (screenRef.current !== 'play') return
            if (v.on) { endVoice(true); return }
            if (!speechSupported()) { say('NO RADIO ON THIS DEVICE'); sfx.radioNo(); return }
            const consent = await askVoiceConsent()
            if (screenRef.current !== 'play') return // moved on while the prompt was up
            if (!consent.consent) { say('NO MIC, NO RADIO'); sfx.radioNo(); return }
            v.session = createVoiceSession({ slots: [0], ask: () => Promise.resolve(consent) })
            v.on = true
            v.listen = startSpeechListen({
                onPhrase: (p) => radioCall(p),
                onError: () => { /* the mic badge already tells the truth */ },
            })
            sfx.radio()
            say('RADIO ON — SHOUT WHAT YOU SEE')
            // #1287 pattern: a player who YES'd the mic but never read the
            // manual still knows what to shout — one-time card, exact words.
            let seen = ''
            try { seen = localStorage.getItem('retrogames:firecrew-voice-hints') || '' } catch { /* private mode */ }
            if (!seen) {
                try { localStorage.setItem('retrogames:firecrew-voice-hints', '1') } catch { /* private mode */ }
                setVoiceHints(true)
                clearTimeout(v.hintsT)
                v.hintsT = setTimeout(() => setVoiceHints(false), 7000)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('pointerdown', onPointer)

        const tickSim = () => {
            if (screenRef.current === 'attract' && demoRef.current) {
                const d = demoRef.current
                step(d, {})
                if (d.done) demoRef.current = setSources(makeRun(1 + Math.floor(Math.random() * 60000)), ['cpu', 'cpu', 'cpu'])
                return
            }
            if (screenRef.current !== 'play' || pausedRef.current) return
            if (contractHoldsLoop()) return
            const pads = [padFrom(keys1)]
            if (seatsRef.current > 1) pads.push(padFrom(keys2))
            if (seatsRef.current > 2) pads.push(padFrom(keys3))
            const g = gsRef.current
            if (!g) return
            if (g.done) { finish(g); return }
            step(g, pads[0], pads)
            if (voiceRef.current.session) voiceRef.current.session.onTick(g.tick)
            listenEvents(g)
            const h = padFrom(keys1)
            if (!watchingRef.current && h.a && g.crew[0].tank > 0 && g.tick % 4 === 0) sfx.spray() // the human mirror goes silent seated — held keys never fake the hose
            if (g.done) finish(g)
        }

        const drawScene = (g, now) => {
            const sim = screenRef.current === 'attract' ? demoRef.current : gsRef.current
            if (!sim) return
            const t = sim.tick
            drawBackdrop(g, sim)
            drawProps(g, sim, t)
            drawFire(g, sim, t)
            drawVictim2(g, sim)
            for (const f of sim.crew) drawCrew(g, f, t)
            drawFx(g, sim, t)
            drawSmoke(g, sim)
            drawDarkness(g, sim)
            drawHud(g, sim, CLOCK)
            if (screenRef.current === 'attract') {
                g.fillStyle = 'rgba(4,6,14,0.55)'
                g.fillRect(0, 0, VW, VH)
            }
            if (screenRef.current === 'over' && end && end.win) {
                g.fillStyle = 'rgba(255,210,74,0.05)'
                g.fillRect(0, 0, VW, VH)
            }
            void now
        }
        const drawVictim2 = (g, sim) => { for (const v of sim.victims) drawVictim(g, v, sim.tick) }

        let raf = 0
        let last = performance.now()
        let acc = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, FIXED_DT * 5)
            last = now
            const g2 = canvasRef.current ? canvasRef.current.getContext('2d') : null
            if (!g2) return
            while (acc >= FIXED_DT) { acc -= FIXED_DT; tickSim() }
            drawScene(g2, now)
        }
        raf = requestAnimationFrame(loop)
        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({
            tick: gsRef.current ? gsRef.current.tick : 0,
            score: gsRef.current ? gsRef.current.score : 0,
            done: gsRef.current ? !!gsRef.current.done : false,
            seed: gsRef.current ? gsRef.current.seed : 0,
            rescued: gsRef.current ? gsRef.current.rescued : 0,
        }))

        let dbgMounted = false
        if (import.meta.env.DEV) {
            window.__firecrewTest = {
                start: (seed, players) => startPlay(seed >>> 0 || 1, players || 1),
                // #2194 — the browser mirror of the Node gate's
                // setSources(makeRun(s), ['human','human','human']): every
                // seat human, empty pads idle all crews (b28 seat law). Without
                // this the cpu partners rescue and the losing route is never
                // actually run — the tell cannot be proven on a winning shift.
                unmanned: () => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    g.sources = ['human', 'human', 'human']
                    return { sources: g.sources.slice(), tick: g.tick, done: !!g.done }
                },
                screen: () => screenRef.current,
                state: () => (gsRef.current ? state(gsRef.current) : null),
                // WATCH (#1637 b28): pilot-visible seat truth + the fallback the
                // pilot uses if a synthetic Y ever misses the window (b26 parity).
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                probe: () => {
                    const g = gsRef.current
                    return g ? {
                        tick: g.tick, rescued: g.rescued, done: !!g.done, cx: g.crew[0].x, cy: g.crew[0].y, cpuSeat: g.sources[0] === 'cpu',
                        // #2029 — visibility for the seated-B pin: a flare thrown by
                        // the press that grabs the seat must show in the world.
                        flares: g.flares.length, battery: g.crew[0].battery,
                        sources: g.sources.slice(),
                    } : null
                },
                seat: () => { if (!watchingRef.current) seat(); return watchingRef.current },
                radio: (text) => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    const intent = parseRadio(text)
                    return { intent, ...applyRadio(g, intent) }
                },
                resolveAll: () => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    let n = 0
                    while (!g.done && n++ < CLOCK + 10) step(g, {})
                    return state(g)
                },
                reachable: () => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    return g.victims.filter((v) => v.state !== 'rescued' && v.state !== 'lost').map((v) => ({
                        x: v.x, y: v.y, loft: v.loft, state: v.state,
                        walkable: !!stepToward(g, g.crew[1].x, g.crew[1].y, v.x, v.y, v.loft && g.ladder > 0.9),
                    }))
                },
                // #1744/#1749 — what the wind voices computed and what the
                // shell last fired, so the browser gate can pin bed/creak/
                // whistle on real ticks.
                windSpy: () => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    return {
                        gust: g.wind.gust, dir: g.wind.dir, ladder: g.ladder, done: !!g.done,
                        nextIn: g.wind.next - g.tick,
                        voice: windVoice(g.wind.gust, g.wind.dir),
                        creak: ladderCreak(g.wind.gust, g.ladder),
                        whistle: windWhistle(g.wind.next - g.tick),
                        bed: lastBedRef.current,
                        creakFired: lastCreakRef.current,
                        whistleFired: lastWhistleRef.current,
                    }
                },
                // force the wind state for the gate (a gale the seed has not
                // rolled yet, a ladder held at any extension, a compass the
                // seed has not given) and clear the fired-spies so the gate
                // only sees what happens after forcing
                windForce: (gust, ladder, dir = -1) => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    g.wind.gust = gust
                    g.wind.dir = Number.isInteger(dir) ? dir : -1
                    g.wind.next = g.tick + 99999 // hold the forced level steady
                    if (ladder != null) g.ladder = ladder
                    lastBedRef.current = null
                    lastCreakRef.current = null
                    lastWhistleRef.current = null
                    return { tick: g.tick, gust: g.wind.gust, dir: g.wind.dir, ladder: g.ladder, done: !!g.done }
                },
                // #1749 — set the wind-shift countdown for the pre-whistle gate
                windNext: (remaining) => {
                    const g = gsRef.current
                    if (!g) return { error: 'no run' }
                    g.wind.next = g.tick + Math.max(0, remaining | 0)
                    lastWhistleRef.current = null
                    return { tick: g.tick, nextIn: g.wind.next - g.tick }
                },
            }
            mountDbg({
                title: 'FIRE CREW',
                getState: () => (gsRef.current ? state(gsRef.current) : {}),
                actions: [
                    {
                        label: 'PROGNOSIS: is every victim still reachable?',
                        run: () => {
                            const g = gsRef.current
                            if (!g) return { error: 'no live run' }
                            const rf = g.crew[1]
                            const open = g.victims.filter((v) => v.state !== 'rescued' && v.state !== 'lost')
                            return {
                                rescued: g.rescued, lost: g.lost, ladder: g.ladder,
                                victims: open.map((v) => ({ x: v.x, y: v.y, loft: v.loft, found: v.state !== 'hidden', reachable: !!stepToward(g, rf.x, rf.y, v.x, v.y, v.loft && g.ladder > 0.9) || (inLoft(rf.y) === !!v.loft && v.state === 'found') })),
                                allReachable: open.every((v) => !!stepToward(g, rf.x, rf.y, v.x, v.y, v.loft && g.ladder > 0.9) || (inLoft(rf.y) === !!v.loft && v.state === 'found')),
                            }
                        },
                    },
                    { label: 'win now (autopilot to the end)', run: () => { const g = gsRef.current; if (g) { let n = 0; while (!g.done && n++ < CLOCK + 10) step(g, {}); if (screenRef.current === 'play') finish(g) } } },
                    { label: 'ignite more', run: () => { const g = gsRef.current; if (g) { for (let k = 0; k < 6; k++) { const c = g.cell[(5 + k * 2) * W + (3 + k * 4)]; if (c && !c.gone) c.heat = 60 } } } },
                ],
            })
            dbgMounted = true
        }

        return () => {
            unexposeFeedbackState()
            cancelAnimationFrame(raf)
            endVoice(true) // never leave the mic hot on unmount
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('pointerdown', onPointer)
            if (import.meta.env.DEV) {
                unexposeGame()
                if (dbgMounted) unmountDbg()
                delete window.__firecrewTest
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay, startAttract, finish, listenEvents, endVoice])

    return (
        <div className="min-h-screen bg-black flex items-center justify-center relative select-none">
            <canvas
                ref={canvasRef}
                className="max-w-full max-h-screen"
                style={{ imageRendering: 'pixelated', aspectRatio: `${VW} / ${VH}`, width: 'min(100vw, calc(100vh * 3 / 2))' }}
            />

            {screen === 'attract' && !rotHint && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center font-mono px-6">
                    <h1 className="text-5xl font-black tracking-widest mb-2" style={{ color: '#ff7a1a', textShadow: '3px 3px 0 #7a1400, 0 10px 28px #000' }}>FIRE CREW</h1>
                    <span className="mb-6 inline-block" style={{ textShadow: '0 2px 8px #000, 0 0 22px #000' }}>
                        <AttractMessage className="mb-6 text-orange-100/80" messages={MESSAGES} />
                    </span>
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                    {/* #1637: attractcheck law — one raw paragraph per attract,
                        the press prompt keeps it; the hint rides as a span. */}
                    <span className="inline-block mt-4 text-[11px] font-mono font-bold tracking-widest text-emerald-300">{WATCH_ATTRACT_HINT}</span>
                </div>
            )}

            {screen === 'select' && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center font-mono px-6">
                    <h2 className="text-2xl font-black mb-4 text-orange-300">SIZE THE CREW</h2>
                    <div className="flex gap-8 mb-4 text-sm">
                        {[1, 2, 3].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); selectRef.current = n; setSeats(n) }}
                                className={`px-4 py-3 border-2 ${seats === n ? 'border-orange-400 text-orange-200' : 'border-slate-700 text-slate-400'}`}
                            >
                                {n === 1 ? '1P HOSE' : n === 2 ? '2P +RESCUE' : '3P +LADDER'}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400 leading-5">
                        SEAT 1 HOSE: ARROWS + SPACE SOAK, B FLARE<br />
                        SEAT 2 RESCUE: WASD + F GRAB · SPACE AT WRECK<br />
                        SEAT 3 LADDER: IJKL WALKS THE LADDER · U RAISE &amp; BRACE · O LOWER<br />
                        WATER CLIMBS A RAISED LADDER — AIM THE STREAM AT ITS COLUMN<br />
                        V RADIO — SHOUT WHAT YOU SEE: "VICTIM ON THE LEFT" · "LADDER UP"<br />
                        EMPTY SEATS RUN ON AUTOPILOT — ANY SEAT CAN BE A MODEL LATER<br />
                        WATCH (Y OR PILL) STEPS ASIDE — THE CPU CREW TAKES YOUR HOSE SEAT,<br />
                        PARTNERS STAY HUMAN · ANY DRIVING KEY GRABS THE HOSE BACK
                    </p>
                    <p className="mt-4 text-base font-bold animate-pulse text-white">SPACE / TAP — GO!</p>
                    {/* #1637 b28: no attract watch-pill here — FireCrew is a
                        SKIP_ATTRACT title (picker in the boot path, the attract
                        itself is the CPU-crew demo). On phones the in-run pill
                        (top-right, #1653 law) seats seat 1 mid-alarm. */}
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-center font-mono px-6">
                    <h2 className={`text-4xl font-black mb-2 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'EVERYONE OUT' : end.rescued ? 'PARTIAL RESCUE' : 'THE BUILDING TAKES IT'}</h2>
                    <p className="text-slate-300 text-sm mb-1">RESCUED {end.rescued}/6 · LOST {end.lost} · CELLS SOAKED {end.doused}</p>
                    <p className="text-orange-300 text-lg font-bold mb-4">SCORE {end.score}</p>
                    <p className="text-xs animate-pulse text-white">ANY KEY / TAP — NEXT ALARM</p>
                </div>
            )}

            {voiceHints && (
                <div className="absolute top-14 inset-x-0 flex justify-center pointer-events-none z-10">
                    <div className="bg-slate-950/90 border-2 border-orange-400 rounded px-5 py-3 text-center font-mono text-xs text-orange-100 leading-6 shadow-lg">
                        RADIO ON — SHOUT WHAT YOU SEE:<br />
                        <span className="text-yellow-300 font-bold">"VICTIM ON THE LEFT" · "SOMEONE&apos;S UP THERE" · "LADDER UP" · "HOLD"</span>
                        <div className="text-slate-400 mt-1">each sweep spends 15 battery · fire is visible — no radio needed</div>
                    </div>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'FIRE CREW')} onResume={() => setPaused(false)} />}
            {uiScreen === 'play' && !paused && (
                <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            {watching && <WatchToast className="absolute z-50" />}
            {/* #2029 — the radio is a seat, not a steering wheel: V toggles it
                even seated and a shout drives the cpu crew (#1361), so the
                watcher must know the mic is live without standing up. */}
            {watching && (
                <div className="absolute inset-x-0 z-50 flex justify-center pointer-events-none" style={{ top: 'calc(9.5rem + var(--sat, 0px))' }}>
                    <span className="bg-slate-950/85 border border-orange-400 rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-orange-200">V RADIO — SHOUTS STILL STEER THE CREW</span>
                </div>
            )}
            <VirtualControls secondAction={{ label: 'FLARE', code: 'KeyB' }} visible={uiScreen === 'play'} />
        </div>
    )
}

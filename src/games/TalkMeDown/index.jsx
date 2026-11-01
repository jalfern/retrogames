// TALK ME DOWN — split-info bomb defuse (#1252). ONE SEES THE BOMB, THE OTHER
// HOLDS THE MANUAL: seat 1 owns the panel (cursor + verbs) but no rules; seat 2
// owns the typewritten rulebook but no hands. Between the two human seats there
// is only the couch — or the mic (V, voice.js grammar, #1247). Solo, a CPU
// partner holds the manual and prints orders on the LCD rail. The sim is pure,
// seeded and deterministic (seed + per-seat pads => identical hashes, #494);
// rules + generation live in ./engine.js, the look in ./art.js.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, isRecording, recordLiveTick, recordVoiceCmd } from '../../utils/gameContract'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import {
    createGame, step, simState, solvePad, computeTarget, hash, drainEvents,
    QUOTA_BOMBS, MAX_STRIKES, WIRE_COLORS, GLYPHS, RULEBOOK,
} from './engine.js'
import { parseCall, intentLabel } from './voice.js'
import { sfx } from './audio.js'
import * as ART from './art.js'

const FIXED_DT = 1000 / 60
// #1373: tap-to-talk is gated to touch surfaces (the #1287 lesson: phones
// have no V key). `?touch=1` forces it so a desktop browser harness can pin
// the pill without emulating a tablet.
const TOUCH_UI = typeof window !== 'undefined' && !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0)
const URL_TOUCH = typeof window !== 'undefined' && /[?&]touch=1/.test(window.location.search)
const ATTRACT_MSGS = [
    'ONE SEES THE BOMB',
    'THE OTHER HOLDS THE MANUAL',
    'NEITHER CAN WIN ALONE',
    'V = MIC: SHOUT "CUT RED"',
    'THREE STRIKES AND THE BLOCK GLOWS',
    `CLEAR ${QUOTA_BOMBS} BOMBS = SQUAD CHIEF`,
]

export default function TalkMeDown() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const [uiScreen, setUiScreen] = useState('attract')
    const [micOn, setMicOn] = useState(false) // #1373: pill label mirrors the mic
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null)
    const attractRef = useRef(null)
    const seatsRef = useRef(1)
    const selectRef = useRef(1)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({
        shake: 0, sparks: [], banner: null, pulse: null, popT: 0, winTick: 0, boomTick: 0,
        flash: 0, zap: null, lcdFx: 0, lastOrder: null, humT: 0, beatT: 0, // #1305 juice
        curtain: null, // #1373: BOMB n INBOUND round-transition screen
    })
    const manualHiddenRef = useRef(false)
    const voiceRef = useRef({ on: false, listen: null })
    const voiceLogRef = useRef([])
    const overAtRef = useRef(0)
    const seedRef = useRef(1)
    const msgIdxRef = useRef(0)
    const msgAtRef = useRef(0)

    const setScreen = (s) => { screenRef.current = s; setUiScreen(s) }

    const startPlay = useCallback((seed, players) => {
        seatsRef.current = Math.max(1, Math.min(2, players | 0 || 1))
        seedRef.current = seed
        gsRef.current = createGame(seed, seatsRef.current)
        manualHiddenRef.current = false
        hudRef.current.pulse = null
        hudRef.current.banner = null
        hudRef.current.curtain = null
        voiceLogRef.current = []
        setScreen('play')
        sfx.start()
    }, [])

    const startAttract = useCallback(() => {
        attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 1)
        msgIdxRef.current = 0
        msgAtRef.current = performance.now()
        setScreen('attract')
    }, [])

    // ---- voice: mic text -> grammar -> target pulse / refuse-why (#1247) ----
    const voiceCall = useCallback((text) => {
        const gs = gsRef.current
        const hud = hudRef.current
        const intent = parseCall(text)
        const entry = { t: gs ? gs.tick : 0, said: text, intent: intent || null, ok: false }
        if (!gs || gs.done || screenRef.current !== 'play') return
        if (!intent) {
            hud.banner = { text: `HEARD: "${text.slice(0, 20).toUpperCase()}" -> ?`, ok: false }
            hudRef.current.popT = 0
            sfx.refused()
            voiceLogRef.current.push(entry)
            // #1415: words that reached the mic but meant nothing still bank
            // (intent null, why NO CALL) — the trace records the shout, #1249.
            recordVoiceCmd({ said: text.slice(0, 80), intent: null, ok: false, why: 'NO CALL' })
            return
        }
        const m = gs.modules[gs.cursor.mod]
        let whyText = ''
        const refuse = (why) => {
            whyText = why
            hud.banner = { text: `${intentLabel(intent)} -> ${why}`, ok: false }
            sfx.refused()
        }
        if (intent.kind === 'page') {
            gs.manual.page = { neon: 0, dial: 1, glyph: 2 }[intent.page] ?? gs.manual.page
            manualHiddenRef.current = false
            hud.banner = { text: `PAGE ${intent.page.toUpperCase()}`, ok: true }
            sfx.heard()
        } else if (!m) refuse('NO MODULE')
        else if (m.solved) refuse('ALREADY SAFE')
        else if (m.locked > 0) refuse('MODULE LOCKED')
        else if (intent.kind === 'cut') {
            if (m.type !== 'N') refuse('NO WIRES HERE')
            else {
                const ci = WIRE_COLORS.findIndex(c => c === intent.color.toUpperCase())
                const wi = m.wires.findIndex(w => w.color === ci && !w.cut)
                if (wi < 0) refuse(`NO ${intent.color.toUpperCase()} WIRE`)
                else {
                    hud.pulse = { mod: gs.cursor.mod, kind: 'wire', idx: wi, t: 120 }
                    hud.banner = { text: `HEARD: CUT ${intent.color.toUpperCase()}`, ok: true }
                    entry.dir = wi
                    sfx.heard()
                }
            }
        } else if (intent.kind === 'press') {
            if (m.type !== 'G') refuse('NO KEYPAD HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'glyph', idx: GLYPHS.indexOf(intent.glyph.toUpperCase()), t: 120 }
                hud.banner = { text: `HEARD: PRESS ${intent.glyph.toUpperCase()}`, ok: true }
                sfx.heard()
            }
        } else if (intent.kind === 'dial') {
            if (m.type !== 'D') refuse('NO DIAL HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'dialval', val: intent.value, t: 120 }
                hud.banner = { text: `HEARD: DIAL ${intent.value}`, ok: true }
                sfx.heard()
            }
        } else if (intent.kind === 'set') {
            if (m.type !== 'D') refuse('NO DIAL HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'set', t: 120 }
                hud.banner = { text: 'HEARD: SET', ok: true }
                sfx.heard()
            }
        }
        entry.ok = !!(hud.banner && hud.banner.ok)
        voiceLogRef.current.push(entry)
        // #1415: every heard call banks into the live capture (#1249 pattern).
        // The recorder stamps t on its own clock; what the seat DID next is
        // in slots[0].pads on the same clock, so the entry carries only the
        // words, the meaning and the consent (dir = wire index on a cut).
        recordVoiceCmd({
            said: text.slice(0, 80),
            intent: intent.kind,
            ok: entry.ok,
            ...(entry.ok && entry.dir !== undefined ? { dir: entry.dir } : {}),
            ...(!entry.ok ? { why: whyText || 'REFUSED' } : {}),
        })
    }, [])

    const toggleVoice = useCallback(() => {
        const v = voiceRef.current
        v.on = !v.on
        setMicOn(v.on) // #1373: the touch pill's label must track the mic
        if (v.on) {
            v.listen = startSpeechListen({ onPhrase: (p) => voiceCall(p), onError: () => { /* badge tells the truth */ } })
        } else if (v.listen) { v.listen.stop(); v.listen = null }
    }, [voiceCall])

    // one spec object, built in the effect (its `players` stays live via getter)
    const makeSpec = () => {
        let prevPad = {}
        return {
            id: 'talk-me-down',
            method: 'dpad',
            get players() { return seatsRef.current },
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const out = [{ kind: 'human' }]
                if (seatsRef.current > 1) out.push({ kind: 'human' })
                else out.push({ kind: 'cpu' })
                return out
            },
            reset: (seed, players) => { startPlay(seed >>> 0 || 1, Math.max(1, Math.min(2, players | 0 || 1))) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = [pads && pads[0] ? pads[0] : pad]
                if (g.players > 1) merged.push((pads && pads[1]) || {})
                // #1305: is this tick a dial turn? (shell-only — sound choice,
                // never sim state: cursor module is D and a left/right edge moves it)
                const cm = g.modules[g.cursor.mod]
                const dialTurn = !!cm && cm.type === 'D' && !cm.solved && cm.locked === 0 &&
                    ((merged[0].left && !prevPad.left) || (merged[0].right && !prevPad.right))
                prevPad = { ...merged[0] }
                step(g, merged)
                for (const f of drainEvents(g)) {
                    if (f.k === 'key' && dialTurn) sfx.dial()
                    else if (sfx[f.k]) sfx[f.k]()
                    pumpHud(f)
                }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 1)
                return { ...simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
        }
    }

    const pumpHud = (f) => {
        const hud = hudRef.current
        if (f.k === 'strike') {
            hud.shake = 14
            hud.flash = 30 // #1305: red screen-edge flinch on the wrong verb
            hud.sparks = Array.from({ length: 16 }, () => ({
                x: ART.PANEL.x + 40 + Math.random() * 320, y: ART.PANEL.y + 90 + Math.random() * 180,
                vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4, life: 18 + Math.random() * 14,
            }))
            // #1305: a fat 500 V arc jumps the terminal strips of the struck
            // NEON module at the wire the player just cut wrong.
            const gs = gsRef.current
            const m = gs && gs.modules[gs.cursor.mod]
            if (m && m.type === 'N' && !m.solved) {
                const r = ART.moduleRect(gs.cursor.mod, gs.modules.length)
                const n = m.wires.length
                const span = Math.min(148, r.h - 24) // #1373: clamp to the bay
                const wi = Math.max(0, m.wires.findIndex(w => !w.cut))
                const top = r.y + Math.max(20, (r.h - span) / 2)
                hud.zap = { x: r.x + 22 + wi * Math.floor((r.w - 56) / Math.max(1, n - 1)),
                    top: top, bot: top + span, t: 14 }
            }
            hud.banner = { text: `STRIKE! ${f.why.toUpperCase()}`, ok: false }
        }
        if (f.k === 'clear') {
            hud.popT = 40
            // #1373: a 1 s curtain between bombs — "BOMB DOWN!" no longer
            // flashes over the already-armed next panel; the squad breathes.
            const gs = gsRef.current
            if (gs && !gs.done) hud.curtain = { n: gs.bombsCleared + 1, t: 62 }
        }
        if (f.k === 'boom') hud.boomTick = 1
        if (f.k === 'flag') hud.banner = { text: `READ RULE ${f.stamp}`, ok: true }
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = ART.W; cvs.height = ART.H
        const spec = makeSpec()
        startAttract()
        if (import.meta.env.DEV) exposeGame(spec)

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const clearKeys = () => { for (const k of Object.keys(keys1)) keys1[k] = false; for (const k of Object.keys(keys2)) keys2[k] = false }

        // #1373: a tap must guarantee ONE engine tick, not synthesise a 6-tick
        // hold. The old MIN_MS=100 latch made every quick tap move cyclic
        // cursors 6 steps — net ZERO at page depth 3 and wire depth 3, so a
        // tap on the manual page flip was silently a no-op. An early release
        // now defers the clear to the next sim sample: the tap lands 1-2
        // engine ticks whatever the frame rate, and held keys still repeat
        // only while physically held.
        const pressMin = (keys, field) => { keys[field] = true; keys[field + '_rel'] = false }
        const releaseMin = (keys, field) => { keys[field + '_rel'] = true }
        const settleReleases = (keys) => {
            for (const k of Object.keys(keys)) {
                if (k.endsWith('_rel') && keys[k]) keys[k.slice(0, -4)] = false
            }
        }

        const S1 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', KeyB: 'b' }
        const S2 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'a' }

        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || (e.shiftKey && e.code === 'Digit1')) {
                if (screenRef.current === 'play') { e.preventDefault(); setPaused(p => !p) }
                return
            }
            if (e.code === 'KeyV') { e.preventDefault(); toggleVoice(); return }
            if (screenRef.current === 'attract') { clearKeys(); setScreen('select'); sfx.start(); return }
            if (screenRef.current === 'over') { if (performance.now() - overAtRef.current > 700) { clearKeys(); startAttract() } return }
            if (screenRef.current === 'select') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { selectRef.current = selectRef.current === 1 ? 2 : 1; sfx.move() }
                if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); startPlay(1 + Math.floor(Math.random() * 65535), selectRef.current) }
                return
            }
            // play
            if (pausedRef.current) return
            if (e.code === 'Tab') { e.preventDefault(); if (seatsRef.current === 1) manualHiddenRef.current = !manualHiddenRef.current; return }
            const f1 = S1[e.code]
            if (f1) { e.preventDefault(); pressMin(keys1, f1); return }
            if (seatsRef.current > 1) {
                const f2 = S2[e.code]
                if (f2) { e.preventDefault(); pressMin(keys2, f2) }
            }
        }
        const onKeyUp = (e) => {
            const f1 = S1[e.code]
            if (f1) releaseMin(keys1, f1)
            const f2 = S2[e.code]
            if (f2 && seatsRef.current > 1) releaseMin(keys2, f2)
        }
        const onPointer = () => {
            if (screenRef.current === 'attract') { clearKeys(); setScreen('select'); sfx.start() }
            else if (screenRef.current === 'over' && performance.now() - overAtRef.current > 700) { clearKeys(); startAttract() }
            else if (screenRef.current === 'select') startPlay(1 + Math.floor(Math.random() * 65535), selectRef.current)
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('pointerdown', onPointer)

        const padFrom = (keys) => ({
            left: !!keys.left, right: !!keys.right, up: !!keys.up, down: !!keys.down,
            a: !!keys.a, b: !!keys.b,
        })


        let raf = 0
        let last = performance.now()
        let acc = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, FIXED_DT * 5)
            last = now
            const g = canvasRef.current ? canvasRef.current.getContext('2d') : null
            if (!g) return
            while (acc >= FIXED_DT) {
                acc -= FIXED_DT
                tickSim()
            }
            drawScene(g, now)
        }

        const tickSim = () => {
            if (screenRef.current === 'attract' && attractRef.current) {
                const a = attractRef.current
                step(a, solvePad(a))
                for (const f of drainEvents(a)) pumpHud(f)
                if (a.done) attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 1)
                return
            }
            if (screenRef.current !== 'play' || pausedRef.current) return
            if (contractHoldsLoop()) return
            const p1 = padFrom(keys1Ref.current)
            const pads = seatsRef.current > 1 ? [p1, padFrom(keys2Ref.current)] : [p1]
            spec.tick(p1, pads)
            // #1415: this loop bypasses the contract's step(), so a live
            // capture (DebugKit RECORD, #527 item 1) must be fed here — the
            // Gauntlet funnel (#1249). While the loop-lock is held, step()
            // banks the ticks itself; never both.
            if (isRecording() && !contractHoldsLoop()) recordLiveTick(pads)
            // the tick above consumed the pads — releases waiting for their
            // guaranteed sample can settle now (#1373)
            settleReleases(keys1Ref.current)
            settleReleases(keys2Ref.current)
        }

        const drawScene = (g, now) => {
            g.save()
            const tick = (gsRef.current ? gsRef.current.tick : 0) + (attractRef.current ? attractRef.current.tick : 0)
            ART.drawBench(g)
            const hud = hudRef.current
            if (hud.shake > 0) g.translate((Math.random() - 0.5) * hud.shake, (Math.random() - 0.5) * hud.shake)

            if (screenRef.current === 'play' || screenRef.current === 'over') {
                const gs = gsRef.current
                if (gs) {
                    drawBombView(g, gs, tick)
                    ART.drawManual(g, gs.manual.page, gs.manual.line, gs.modules.filter(m => !m.solved).map(m => m.stamp), tick, manualHiddenRef.current && seatsRef.current === 1, gs.manual.flag)
                    // #1305: new order arriving? stutter the LCD glass for 6 frames.
                    if (gs.order && gs.order !== hud.lastOrder) hud.lcdFx = 6
                    hud.lastOrder = gs.order
                    ART.drawOrderRail(g, gs.order, gs.manual.flag, hud.lcdFx, voiceRef.current.on)
                    drawSparks(g, hud)
                    drawZap(g, hud)
                    if (hud.banner) ART.drawBanner(g, hud.banner.text, hud.banner.ok, tick)
                    if (screenRef.current === 'play' && !gs.done && !pausedRef.current) {
                        // #1305: hum bed + a heartbeat below 10 s (shell clock only)
                        if (++hud.humT % 30 === 0) sfx.hum()
                        if (Math.ceil(gs.fuse / 60) <= 10 && ++hud.beatT % 60 === 0) sfx.heart()
                    }
                }
                if (hud.shake > 0) hud.shake -= 0.5
                if (hud.lcdFx > 0) hud.lcdFx -= 1
                if (hud.zap && --hud.zap.t <= 0) hud.zap = null
                if (hud.flash > 0) hud.flash -= 1
                hud.sparks = hud.sparks.filter(s => --s.life > 0)
                if (hud.pulse && --hud.pulse.t <= 0) hud.pulse = null
            } else if (screenRef.current === 'attract') {
                const a = attractRef.current
                if (a) drawBombView(g, a, tick)
                g.fillStyle = 'rgba(10,8,14,0.62)'; g.fillRect(0, 0, ART.W, ART.H)
                // #1373: the GLYPH keys in the demo panel fight the title —
                // silhouette the marquee band so the name always reads clean.
                g.fillStyle = 'rgba(6,4,10,0.72)'
                g.fillRect(124, 104, 372, 64)
                g.fillStyle = '#3a1f2a'
                g.fillRect(124, 104, 372, 1); g.fillRect(124, 167, 372, 1)
                g.font = '24px "Press Start 2P", monospace'; g.fillStyle = '#ffd23e'
                g.fillText('TALK ME DOWN', 150, 130)
                g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#ff6a5e'
                g.fillText('ONE SEES THE BOMB  ·  ONE HOLDS THE MANUAL', 132, 156)
                if (now - msgAtRef.current > 2600) { msgAtRef.current = now; msgIdxRef.current = (msgIdxRef.current + 1) % ATTRACT_MSGS.length }
                g.font = '9px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                g.fillText(ATTRACT_MSGS[msgIdxRef.current], (ART.W - ATTRACT_MSGS[msgIdxRef.current].length * 9) / 2, 210)
                if (tick % 60 < 36) {
                    g.fillStyle = '#fff'
                    g.fillText('ANY KEY / TAP', 250, 260)
                }
            } else if (screenRef.current === 'select') {
                g.fillStyle = 'rgba(10,8,14,0.62)'; g.fillRect(0, 0, ART.W, ART.H)
                g.font = '14px "Press Start 2P", monospace'; g.fillStyle = '#ffd23e'
                g.fillText('SQUAD SIZE', 232, 110)
                g.font = '10px "Press Start 2P", monospace'
                g.fillStyle = selectRef.current === 1 ? '#7dffb0' : '#6b6f77'
                g.fillText('1P  YOU DEFUSE + CPU MANUAL', 130, 170)
                g.fillStyle = selectRef.current === 2 ? '#7dffb0' : '#6b6f77'
                g.fillText('2P  YOU + MANUAL PLAYER (WASD+F)', 130, 200)
                g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#9aa0aa'
                g.fillText('LEFT / RIGHT PICK   SPACE START', 180, 260)
                g.fillText('V = MIC (SOLO OR 2P)', 240, 284)
                // #1373: spell the seat-2 keyboard out on screen — nobody
                // should have to read a README to know their other half's keys.
                g.fillStyle = '#7dffb0'
                g.fillText('P2 KEYS: WASD MOVE · F FLAG', 176, 308)
            }
            if (screenRef.current === 'over' && gsRef.current && gsRef.current.done) {
                const t = Math.floor((now - overAtRef.current) / 16)
                if (gsRef.current.won) ART.drawWinStamp(g, t)
                else ART.drawBoom(g, t)
                g.font = '9px "Press Start 2P", monospace'
                g.fillStyle = gsRef.current.won ? '#ffd23e' : '#ff9d94'
                const head = gsRef.current.won ? 'ALL BOMBS DOWN' : 'BOOM! THE BLOCK GLOWS'
                g.fillText(head, gsRef.current.won ? 190 : 156, 250)
                g.fillStyle = '#fff'
                g.fillText(`SCORE ${gsRef.current.score}   BOMBS ${gsRef.current.bombsCleared}/${QUOTA_BOMBS}`, 170, 274)
                if (t > 40 && tick % 60 < 36) { g.fillStyle = '#fff'; g.fillText('ANY KEY', 280, 300) }
            }
            // HUD legend line
            g.restore()
            const gs = gsRef.current
            // #1373: the last 10 s sink into a red vignette — pressure you feel
            // before you read it. Screen-space (outside the shake), pulsing
            // with the sim tick; purely cosmetic, the sim never sees it.
            if (screenRef.current === 'play' && gs && !gs.done && Math.ceil(gs.fuse / 60) <= 10) {
                const k = 0.20 + 0.06 * Math.sin(tick / 6) // steady pressure, gentle throb
                const vg = g.createRadialGradient(ART.W / 2, ART.H / 2, 110, ART.W / 2, ART.H / 2, 360)
                vg.addColorStop(0, 'rgba(24,2,2,0)')
                vg.addColorStop(1, `rgba(24,2,2,${k.toFixed(3)})`)
                g.fillStyle = vg
                g.fillRect(0, 0, ART.W, ART.H)
            }
            // #1373: the round-transition curtain over the bomb panel.
            if (hudRef.current.curtain) {
                if (screenRef.current !== 'play' || !gs || gs.done) hudRef.current.curtain = null
                else {
                    const c = hudRef.current.curtain
                    const a = 0.74 * Math.min(1, c.t / 16)
                    g.fillStyle = `rgba(10,8,14,${a.toFixed(3)})`
                    g.fillRect(ART.PANEL.x + 2, ART.PANEL.y + 2, ART.PANEL.w - 4, ART.PANEL.h - 4)
                    const txt = `BOMB ${c.n} INBOUND`
                    g.font = '10px "Press Start 2P", monospace'
                    g.fillStyle = c.t % 14 < 9 ? '#ffffff' : '#ffd23e'
                    g.fillText(txt, ART.PANEL.x + (ART.PANEL.w - txt.length * 10) / 2, ART.PANEL.y + ART.PANEL.h / 2 - 4)
                    g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                    const sub = 'STAND BY'
                    g.fillText(sub, ART.PANEL.x + (ART.PANEL.w - sub.length * 7) / 2, ART.PANEL.y + ART.PANEL.h / 2 + 16)
                    if (--c.t <= 0) hudRef.current.curtain = null
                }
            }
            g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#8a8f98'
            if (screenRef.current === 'play' && gs) {
                g.fillText(`R${gs.round}  BOMBS ${gs.bombsCleared}/${QUOTA_BOMBS}  STRIKES ${gs.strikes}/${MAX_STRIKES}`, 10, ART.H - 4)
                const scoreStr = `SCORE ${gs.score}`
                g.fillText(scoreStr, ART.W - 10 - scoreStr.length * 7, ART.H - 4)
            }
            drawEdgeFlash(g, hudRef.current)
        }

        const drawBombView = (g, gs, tick) => {
            ART.drawPanelShell(g)
            ART.drawLeds(g, gs.features.leds)
            ART.drawBoltColor(g, gs.features.bolt)
            ART.drawStrikes(g, gs.strikes)
            const secs = Math.ceil(gs.fuse / 60)
            ART.drawFuse(g, ART.PANEL.x + 16, ART.PANEL.y + 12, secs, secs <= 10 && !gs.done, tick)
            g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#0f1113'
            g.fillText('SER ' + gs.features.serial, ART.PANEL.x + 136, ART.PANEL.y + 24)
            const hud = hudRef.current
            gs.modules.forEach((m, i) => {
                const r = ART.moduleRect(i, gs.modules.length)
                const sel = i === gs.cursor.mod && !gs.done
                ART.moduleFrame(g, r, m, sel, gs.cursorFlash, tick)
                if (gs.manual.flag === m.stamp && !m.solved) ART.drawFlag(g, r, m.stamp, tick)
                const pulse = hud.pulse && hud.pulse.mod === gs.cursor.mod && i === gs.cursor.mod ? hud.pulse : null
                if (m.type === 'N') ART.drawNeon(g, r, m, gs.cursor.sub, pulse && pulse.kind === 'wire' ? pulse.idx : -1, tick)
                else if (m.type === 'D') ART.drawDialModule(g, r, m, pulse && (pulse.kind === 'set' || (pulse.kind === 'dialval' && m.dial === pulse.val)), tick)
                else ART.drawGlyphModule(g, r, m, gs.cursor.sub, pulse && pulse.kind === 'glyph' ? pulse.idx : -1, gs.seqInput[i] || [], tick)
                if (m.type === 'G') ART.drawSeqDots(g, r, (gs.seqInput[i] || []).length)
                if (pulse && pulse.kind === 'dialval') {
                    g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                    g.fillText(`${pulse.val}?`, r.x + r.w - 110, r.y + 12)
                }
            })
            if (gs.clearFlash > 0 && tick % 10 < 5) {
                g.font = '10px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                g.fillText('BOMB DOWN!', ART.PANEL.x + 130, ART.PANEL.y + 180)
            }
        }

        const drawSparks = (g, hud) => {
            for (const s of hud.sparks) {
                s.x += s.vx; s.y += s.vy; s.vy += 0.35
                g.fillStyle = s.life > 10 ? '#ffe66b' : '#ff7a4d'
                g.fillRect(s.x, s.y, 2, 2)
            }
        }

        // #1305: the strike arc — a jagged bolt jumping the struck module's
        // terminal strips. Geometry-free jitter is fine here: it is the shell
        // (Math.random lives outside the sim, #494), never state.
        const drawZap = (g, hud) => {
            const z = hud.zap
            if (!z) return
            const a = z.t / 14
            for (const [w, col] of [[5, `rgba(255,120,60,${(0.5 * a).toFixed(2)})`], [2, '#fff2b0'], [1, '#fff']]) {
                g.strokeStyle = col; g.lineWidth = w
                g.beginPath(); g.moveTo(z.x, z.top + 2)
                let y = z.top + 2
                while (y < z.bot - 4) {
                    y += 10 + Math.random() * 8
                    g.lineTo(z.x + (Math.random() - 0.5) * 14, Math.min(y, z.bot - 2))
                }
                g.stroke()
            }
            g.lineWidth = 1
        }

        // #1305: red screen-edge flinch. Drawn OUTSIDE the shake translate so
        // the geometry is stable and a harness can pin it by pixels.
        const drawEdgeFlash = (g, hud) => {
            if (hud.flash <= 0) return
            const a = (0.12 + 0.5 * (hud.flash / 30)).toFixed(3)
            g.fillStyle = `rgba(255,40,30,${a})`
            g.fillRect(0, 0, ART.W, 14); g.fillRect(0, ART.H - 14, ART.W, 14)
            g.fillRect(0, 0, 14, ART.H); g.fillRect(ART.W - 14, 0, 14, ART.H)
        }

        raf = requestAnimationFrame(loop)

        // DEV hooks + DebugKit
        let dbgMounted = false
        if (import.meta.env.DEV) {
            window.__tmdTest = {
                start: (seed, players) => startPlay(seed >>> 0 || 1, players || 1),
                screen: () => screenRef.current,
                call: (text) => voiceCall(text),
                release: (field) => { keys1Ref.current[field] = false },
                keys: () => ({ ...keys1Ref.current }),
                state: () => { const g = gsRef.current; return g ? simState(g) : null },
                hash: () => { const g = gsRef.current; return g ? hash(g) : 0 },
                voiceLog: () => voiceLogRef.current.slice(),
                voiceMode: () => ({ on: voiceRef.current.on, supported: speechSupported(), listening: !!(voiceRef.current.listen && voiceRef.current.listen.active) }),
                hud: () => ({ curtain: hudRef.current.curtain ? hudRef.current.curtain.n : 0 }), // #1373
                solveStep: () => { const g = gsRef.current; if (g && !g.done) spec.tick(solvePad(g)) },
                rulesFor: () => Object.keys(RULEBOOK).map(k => RULEBOOK[k].map(r => ({ id: r.id, text: r.text }))),
            }
            mountDbg({
                title: 'TALK ME DOWN',
                getState: () => { const g = gsRef.current; return g ? simState(g) : {} },
                actions: [
                    {
                        label: 'PROGNOSIS: can this bomb still be cleared?',
                        run: () => {
                            const g = gsRef.current
                            if (!g) return { error: 'no live bomb' }
                            const open = g.modules.map(m => ({ stamp: m.stamp, solved: m.solved, locked: m.locked > 0, solvable: computeTarget(g, m) !== null }))
                            return { round: g.round, fuseLeft: g.fuse, strikes: g.strikes, modules: open, allClearable: open.every(x => x.solved || x.solvable) }
                        },
                    },
                    { label: 'win now', run: () => { const g = gsRef.current; if (g) { g.fuse = Math.max(g.fuse, 600); let n = 0; while (!g.done && n++ < 60000) step(g, solvePad(g)) } } },
                    {
                        label: 'strike now',
                        run: () => {
                            const g = gsRef.current
                            if (!g || g.done) return { error: 'no live bomb' }
                            const m = g.modules[g.cursor.mod]
                            if (!m || m.solved) return { error: 'cursor module is safe' }
                            const t = computeTarget(g, m)
                            if (m.type === 'N') g.cursor.sub = t ? (t.wire + 1) % m.wires.length : 0
                            else if (m.type === 'D') m.dial = t ? (t.dial + 3) % 10 : 7
                            else g.cursor.sub = t ? (t.seq[0] + 2) % 6 : 0
                            step(g, { a: true })
                            return { strikes: g.strikes }
                        },
                    },
                ],
            })
            dbgMounted = true
        }

        const v = voiceRef.current
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('pointerdown', onPointer)
            if (v.listen) { v.listen.stop(); v.listen = null }
            if (import.meta.env.DEV) {
                unexposeGame()
                if (dbgMounted) unmountDbg()
                delete window.__tmdTest
            }
        }
    // effect wires once; makeSpec is a render-stable factory
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay, startAttract, toggleVoice, voiceCall])

    return (
        <div className="min-h-screen bg-black flex items-center justify-center relative select-none">
            <canvas
                ref={canvasRef}
                className="max-w-full max-h-screen"
                style={{ imageRendering: 'pixelated', aspectRatio: `${ART.W} / ${ART.H}`, width: 'min(100vw, calc(100vh * 16 / 9))' }}
            />
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'TALK ME DOWN')} onResume={() => setPaused(false)} />}
            {/* #1373: tap-to-talk for seat 1 (#1287 pattern) — phones have no
                V key, and the mic IS this game's co-op mechanic. Bottom-centre
                keeps it clear of the d-pad (left) and A/PAGE (right). */}
            {(TOUCH_UI || URL_TOUCH || micOn) && (uiScreen === 'play' || uiScreen === 'select') && !paused && (
                <button
                    type="button"
                    data-voice-coop={micOn ? 'on' : 'off'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleVoice() }}
                    className="fixed z-[62] bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.25em] px-2 py-1 border rounded"
                    style={micOn
                        ? { color: '#7dffb0', borderColor: 'rgba(125,255,176,0.55)', background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }
                        : { color: '#8b8b98', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }}
                >
                    {micOn ? 'MIC ON — SHOUT' : 'MIC · TAP'}
                </button>
            )}
            <VirtualControls secondAction={{ label: 'PAGE', code: 'KeyB' }} visible={uiScreen === 'play'} />
        </div>
    )
}

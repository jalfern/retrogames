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
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import {
    createGame, step, simState, solvePad, computeTarget, hash, drainEvents,
    QUOTA_BOMBS, MAX_STRIKES, WIRE_COLORS, GLYPHS, RULEBOOK,
} from './engine.js'
import { parseCall, intentLabel } from './voice.js'
import { sfx } from './audio.js'
import * as ART from './art.js'

const FIXED_DT = 1000 / 60
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
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null)
    const attractRef = useRef(null)
    const seatsRef = useRef(1)
    const selectRef = useRef(1)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({ shake: 0, sparks: [], banner: null, pulse: null, popT: 0, winTick: 0, boomTick: 0 })
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
            return
        }
        const m = gs.modules[gs.cursor.mod]
        const refuse = (why) => {
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
    }, [])

    const toggleVoice = useCallback(() => {
        const v = voiceRef.current
        v.on = !v.on
        if (v.on) {
            v.listen = startSpeechListen({ onPhrase: (p) => voiceCall(p), onError: () => { /* badge tells the truth */ } })
        } else if (v.listen) { v.listen.stop(); v.listen = null }
    }, [voiceCall])

    // one spec object, built in the effect (its `players` stays live via getter)
    const makeSpec = () => ({
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
                step(g, merged)
                for (const f of drainEvents(g)) {
                    if (sfx[f.k]) sfx[f.k]()
                    pumpHud(f)
                }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 1)
                return { ...simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
    })

    const pumpHud = (f) => {
        const hud = hudRef.current
        if (f.k === 'strike') {
            hud.shake = 14
            hud.sparks = Array.from({ length: 16 }, () => ({
                x: ART.PANEL.x + 40 + Math.random() * 320, y: ART.PANEL.y + 90 + Math.random() * 180,
                vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4, life: 18 + Math.random() * 14,
            }))
            hud.banner = { text: `STRIKE! ${f.why.toUpperCase()}`, ok: false }
        }
        if (f.k === 'clear') hud.popT = 40
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

        // 100 ms min-hold latch (shared shell lesson): a fast tap between two
        // 60 Hz samples must still move the sim.
        const MIN_MS = 100
        const pressMin = (keys, field) => {
            keys[field] = true
            keys[field + '_at'] = performance.now()
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS)
        }
        const releaseMin = (keys, field) => {
            const heldMs = performance.now() - (keys[field + '_at'] || 0)
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            if (heldMs >= MIN_MS) keys[field] = false
            else keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS - heldMs)
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
            spec.tick(padFrom(keys1Ref.current), seatsRef.current > 1 ? [padFrom(keys1Ref.current), padFrom(keys2Ref.current)] : undefined)
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
                    ART.drawManual(g, gs.manual.page, gs.manual.line, gs.modules.filter(m => !m.solved).map(m => m.stamp), tick, manualHiddenRef.current && seatsRef.current === 1)
                    ART.drawOrderRail(g, gs.order, gs.manual.flag)
                    drawSparks(g, hud)
                    if (hud.banner) ART.drawBanner(g, hud.banner.text, hud.banner.ok, tick)
                }
                if (hud.shake > 0) hud.shake -= 0.5
                hud.sparks = hud.sparks.filter(s => --s.life > 0)
                if (hud.pulse && --hud.pulse.t <= 0) hud.pulse = null
            } else if (screenRef.current === 'attract') {
                const a = attractRef.current
                if (a) drawBombView(g, a, tick)
                g.fillStyle = 'rgba(10,8,14,0.62)'; g.fillRect(0, 0, ART.W, ART.H)
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
            g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#8a8f98'
            if (screenRef.current === 'play' && gs) {
                g.fillText(`R${gs.round}  BOMBS ${gs.bombsCleared}/${QUOTA_BOMBS}  STRIKES ${gs.strikes}/${MAX_STRIKES}`, 10, ART.H - 4)
                const scoreStr = `SCORE ${gs.score}`
                g.fillText(scoreStr, ART.W - 10 - scoreStr.length * 7, ART.H - 4)
            }
        }

        const drawBombView = (g, gs, tick) => {
            ART.drawPanelShell(g)
            ART.drawLeds(g, gs.features.leds)
            ART.drawBoltColor(g, gs.features.bolt)
            ART.drawStrikes(g, gs.strikes)
            const secs = Math.ceil(gs.fuse / 60)
            ART.drawFuse(g, ART.PANEL.x + 16, ART.PANEL.y + 12, secs, secs <= 10 && !gs.done)
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

        raf = requestAnimationFrame(loop)

        // DEV hooks + DebugKit
        let dbgMounted = false
        if (import.meta.env.DEV) {
            window.__tmdTest = {
                start: (seed, players) => startPlay(seed >>> 0 || 1, players || 1),
                screen: () => screenRef.current,
                call: (text) => voiceCall(text),
                release: (field) => { keys1Ref.current[field] = false },
                state: () => { const g = gsRef.current; return g ? simState(g) : null },
                hash: () => { const g = gsRef.current; return g ? hash(g) : 0 },
                voiceLog: () => voiceLogRef.current.slice(),
                voiceMode: () => ({ on: voiceRef.current.on, supported: speechSupported(), listening: !!(voiceRef.current.listen && voiceRef.current.listen.active) }),
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
            <VirtualControls secondAction={{ label: 'PAGE', code: 'KeyB' }} visible={uiScreen === 'play'} />
        </div>
    )
}

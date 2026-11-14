// CLAP TEST (#2156) — the one-screen slap test on the phone. The whole face of
// the screen is the target: "turn the media volume down; slap the screen 3
// times, about 2 s apart". A palm slap is one event that is BOTH a touch and a
// sound, so the take it records grades the ±50 ms acceptance line on real
// hardware: the touch side is the pad stream (`a` taps — the control #2056
// names), the sound side is the mic track, and the shared clapSync code
// (detectClaps + matchClapEdges, untouched) decides. Same bytes, same verdict
// at the studio: plaicraft:clap --key= re-grades the upload.
//
// This page owns ONLY the screen: the capture path is the game-take path, not
// a second pipeline — initAutoRecord probes the store, askConsent raises the
// SAME ConsentGate (nothing checked by default), beginRun opens the recorder at
// seed-birth (rec/v2, mic, tick clock, human seat) and endRun ends the take,
// queues it in the outbox, uploads it under the consent gate and publishes the
// sync badge. The rules (sim, auto-END, verdict + hints) are pure in
// src/utils/clapTestCore.js — pinned offline by recordcheck; the browser
// end-to-end proof is scripts/claptestplay.mjs.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { initAutoRecord, askConsent, beginRun, endRun, setStartBusy } from '../utils/autoRecord'
import {
    armLiveCapture, unexposeGame, exposeGame, contractHoldsLoop, recordLiveTick, isRecording,
    exposeFeedbackState, unexposeFeedbackState, seedFromQuery,
} from '../utils/gameContract'
import { createTestSim, screenVerdict, FIXED_DT, SLAPS_NEEDED, lastGapMs, pushHistory, formatHistory, hardFailNote } from '../utils/clapTestCore'

const NEON = '#39ff14'
const AMBER = '#ffd840'
// #2205 item 1: the shared live-level scale (peak/128 × 2.5) runs 0..1; a slap
// registering below this is too quiet to survive the detector reliably. Kept
// well under a real palm slap (~1.0 on the meter) so it never false-scolds.
const QUIET_LEVEL = 0.25
const HISTORY_KEY = 'claptest.history' // #2205 item 4 — local only, revocable, never uploaded beyond normal takes

const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

const ClapTest = () => {
    const [phase, setPhaseState] = useState('attract') // attract | testing | grading | graded
    const [taps, setTaps] = useState(0)
    const [gapMs, setGapMs] = useState(null) // #2205 item 2: pacing readout
    const [quiet, setQuiet] = useState(false) // #2205 item 1: too-quiet slap flash
    const [history, setHistory] = useState(loadHistory) // #2205 item 4
    const [result, setResult] = useState(null)
    const [upload, setUpload] = useState(null)
    const [flash, setFlash] = useState(0)
    const simRef = useRef(null)
    const seedRef = useRef(0)
    const heldRef = useRef(false)
    const phaseRef = useRef('attract')
    const tapsRef = useRef(0)
    const resultRef = useRef(null)
    const uploadRef = useRef(null)
    const meterFillRef = useRef(null)
    const quietTimerRef = useRef(0)

    // #2205: one edge handler for both drivers (loop + DEV tick) — refresh the
    // pacing readout from the sim's own tick bank and flash the quiet warning
    // from the recorder's live level. Level is NOT sim state: the hash and the
    // replay stay deterministic; only the meters read it.
    const onTapEdge = useCallback(() => {
        setGapMs(lastGapMs(simRef.current ? simRef.current.taps : []))
        const lvl = typeof window !== 'undefined' && typeof window.__voiceLevel === 'number' ? window.__voiceLevel : 1
        if (lvl < QUIET_LEVEL) {
            setQuiet(true)
            if (quietTimerRef.current) clearTimeout(quietTimerRef.current)
            quietTimerRef.current = setTimeout(() => setQuiet(false), 900)
        }
    }, [])

    const setPhase = useCallback((p) => { phaseRef.current = p; setPhaseState(p) }, [])
    const mirror = useCallback(() => {
        if (import.meta.env.DEV && simRef.current) {
            window.__clapTest = {
                phase: phaseRef.current, seed: seedRef.current, ticks: simRef.current.ticks,
                taps: simRef.current.taps, verdict: resultRef.current, uploaded: !!(uploadRef.current && uploadRef.current.uploaded),
                key: (uploadRef.current && uploadRef.current.key) || null,
            }
        }
    }, [])

    const freshSim = useCallback(() => {
        const s = seedFromQuery(typeof window !== 'undefined' ? window.location.search : '')
        seedRef.current = Number.isInteger(s) && s >= 0 ? s : Math.floor(Math.random() * 1000000)
        simRef.current = createTestSim({ seed: seedRef.current })
    }, [])

    // finish — the take ENDS through the same path a game ends one, then the
    // phone decodes its own recorded audio and grades itself with the shared
    // clapSync rules (screenVerdict). No sound is synthesized during the test:
    // anything the phone itself played would sit in the mic track at the touch
    // instant and corrupt the very measurement this screen makes.
    const finish = useCallback(async () => {
        if (phaseRef.current !== 'testing') return
        setPhase('grading')
        heldRef.current = false
        const res = await endRun()
        let v
        try {
            const rec = typeof window !== 'undefined' ? window.__lastRecording : null
            const track = rec && rec.voice && rec.voice.tracks && rec.voice.tracks[0]
            let samples = null
            let sr = 48000
            if (track && track.b64) {
                const bin = atob(track.b64)
                const bytes = new Uint8Array(bin.length)
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                const AC = window.AudioContext || window.webkitAudioContext
                const ctx = new AC()
                const buf = await ctx.decodeAudioData(bytes.buffer)
                const ch0 = buf.getChannelData(0)
                samples = new Array(ch0.length)
                for (let i = 0; i < ch0.length; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767)))
                sr = buf.sampleRate
                ctx.close()
            }
            v = screenVerdict({ sampleRate: sr, samples, rec })
        } catch {
            v = { ok: false, claps: 0, pairs: [], matched: 0, worstMs: null, why: 'the recorded audio could not be decoded', hint: "didn't hear the slaps, try louder" }
        }
        resultRef.current = v
        uploadRef.current = res ? { uploaded: !!res.uploaded, key: res.key || null, reason: res.reason || null, requeued: !!res.requeued } : null
        setResult(v)
        setUpload(uploadRef.current)
        setPhase('graded')
        // #2205 item 4: the verdict stays on THIS phone (localStorage, cap 5,
        // revocable — nothing beyond the normal take upload).
        const h = pushHistory(loadHistory(), { d: Date.now(), ok: !!v.ok, worstMs: v.worstMs === undefined ? null : v.worstMs, key: (res && res.key) || null })
        setHistory(h)
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)) } catch { /* private mode — history just won't persist */ }
        // #2205 item 5: the verdict lands in the hand too, not only the eyes.
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(v.ok ? [60] : [140, 70, 140]) } catch { /* unsupported */ }
        }
        mirror()
    }, [mirror, setPhase])
    const finishRef = useRef(finish)
    useEffect(() => { finishRef.current = finish }, [finish])

    // mount — probe, arm the production capture path, DEV contract, loop clock.
    useEffect(() => {
        freshSim()
        initAutoRecord()
        armLiveCapture({
            id: 'claptest',
            players: 1,
            method: 'pointer',
            sources: [{ kind: 'human' }],
            state: () => ({ seed: seedRef.current, hash: simRef.current.hash() }),
        })
        exposeFeedbackState(() => ({ seed: seedRef.current, ticks: simRef.current.ticks, phase: phaseRef.current, taps: simRef.current.taps.length }))
        if (import.meta.env.DEV) {
            exposeGame({
                id: 'claptest',
                players: 1,
                method: 'pointer',
                buttons: ['a'],
                reads: ['a'],
                sources: () => [{ kind: 'human' }],
                state: () => ({ seed: seedRef.current, hash: simRef.current.hash(), tick: simRef.current.ticks, taps: simRef.current.taps.length, phase: phaseRef.current, verdict: resultRef.current ? (resultRef.current.ok ? 'PASS' : 'FAIL') : null }),
                reset: (seed) => {
                    endRun()
                    const n = Number.isInteger(seed) && seed >= 0 ? seed : Math.floor(Math.random() * 1000000)
                    seedRef.current = n
                    simRef.current = createTestSim({ seed: n })
                    heldRef.current = false
                    resultRef.current = null
                    uploadRef.current = null
                    setResult(null); setUpload(null); setTaps(0); tapsRef.current = 0
                    setGapMs(null); setQuiet(false)
                    setPhase('attract')
                    mirror()
                },
                tick: (pad) => {
                    if (phaseRef.current !== 'testing') return
                    const before = tapsRef.current
                    const ph = simRef.current.step(pad || {})
                    tapsRef.current = simRef.current.taps.length
                    setTaps(tapsRef.current)
                    if (tapsRef.current > before) onTapEdge()
                    if (ph === 'ended') finishRef.current()
                },
                canvas: () => null,
            })
        }
        let raf = 0
        let last = performance.now()
        let acc = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            // #2205 item 1: live mic meter, straight off the recorder's level tap
            // — a too-quiet slap is obvious at the moment it happens.
            if (meterFillRef.current) {
                const lvl = phaseRef.current === 'testing' && typeof window.__voiceLevel === 'number' ? window.__voiceLevel : 0
                meterFillRef.current.style.width = `${Math.round(Math.max(0, Math.min(1, lvl)) * 100)}%`
            }
            acc += now - last
            last = now
            if (acc > 250) acc = 250 // one driver per loop; catch-up capped like every game shell
            while (acc >= FIXED_DT) {
                acc -= FIXED_DT
                if (phaseRef.current === 'testing' && !contractHoldsLoop()) {
                    const pad = { a: heldRef.current }
                    const ph = simRef.current.step(pad)
                    if (isRecording()) recordLiveTick([pad])
                    if (simRef.current.taps.length !== tapsRef.current) {
                        tapsRef.current = simRef.current.taps.length
                        setTaps(tapsRef.current)
                        setFlash((f) => f + 1)
                        onTapEdge()
                        mirror()
                    }
                    if (ph === 'ended') { finishRef.current(); break }
                }
            }
        }
        raf = requestAnimationFrame(loop)
        mirror()
        return () => {
            cancelAnimationFrame(raf)
            if (quietTimerRef.current) clearTimeout(quietTimerRef.current)
            endRun() // an unmount mid-take ends it the honest way
            unexposeGame()
            unexposeFeedbackState()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const start = useCallback(() => {
        if (phaseRef.current === 'testing' || phaseRef.current === 'grading') return
        setStartBusy(true)
        askConsent()
            .then(() => {
                setStartBusy(false)
                freshSim()
                simRef.current.start()
                heldRef.current = false
                resultRef.current = null
                uploadRef.current = null
                tapsRef.current = 0
                setResult(null); setUpload(null); setTaps(0)
                setGapMs(null); setQuiet(false)
                beginRun() // opens at seed-birth when the plan says record
                setPhase('testing')
                mirror()
            })
            .catch(() => { setStartBusy(false) })
    }, [freshSim, mirror, setPhase])

    // the whole screen is the target — every primary pointer down is a slap;
    // Space/Enter on desktop are the same `a` tap for keyboard users.
    const slapDown = (e) => {
        if (phaseRef.current !== 'testing') return
        if (e && e.isPrimary === false) return
        if (e && e.preventDefault) e.preventDefault()
        heldRef.current = true
    }
    const slapUp = () => { heldRef.current = false }
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                if (phaseRef.current === 'attract' || phaseRef.current === 'graded') { e.preventDefault(); start() }
                else if (phaseRef.current === 'testing' && e.type === 'keydown') { e.preventDefault(); heldRef.current = true }
                else if (phaseRef.current === 'testing') { heldRef.current = false }
            }
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKey)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) }
    }, [start])

    const verdict = result ? (result.ok ? 'PASS' : 'FAIL') : ''
    const worstAbs = result && result.worstMs !== null && result.worstMs !== undefined ? Math.abs(result.worstMs) : null

    return (
        <div
            data-clap-test=""
            data-clap-phase={phase}
            data-clap-verdict={verdict}
            onPointerDown={slapDown}
            onPointerUp={slapUp}
            onPointerCancel={slapUp}
            aria-label={phase === 'testing' ? 'Slap target — slap the screen three times, about 2 seconds apart' : 'clap test'}
            style={{ touchAction: 'none' }}
            className="fixed inset-0 z-[80] bg-black font-mono text-gray-100 flex flex-col items-center justify-center px-6 select-none overflow-hidden"
        >
            {phase === 'attract' && (
                <div className="w-full max-w-md text-center">
                    <div className="text-4xl font-bold tracking-[0.3em]" style={{ color: AMBER }}>CLAP TEST</div>
                    <div className="mt-2 text-xs text-gray-400">Does your mic line up with your touch? One screen, 3 slaps, ±50 ms.</div>
                    <ol className="mt-6 text-left text-sm space-y-3 border border-gray-700 rounded-xl p-5 bg-white/5">
                        <li><span style={{ color: NEON }}>1.</span> Turn the media volume DOWN.</li>
                        <li><span style={{ color: NEON }}>2.</span> Slap the screen <b>{SLAPS_NEEDED} times</b>, about 2 seconds apart.</li>
                        <li><span style={{ color: NEON }}>3.</span> Each slap must <b>touch</b> the screen — your palm makes the sound AND the touch at the same instant.</li>
                    </ol>
                    <button
                        type="button"
                        onClick={start}
                        data-clap-start=""
                        className="mt-8 w-full py-4 rounded-xl border-2 text-lg font-bold tracking-widest"
                        style={{ borderColor: NEON, color: NEON, background: 'rgba(57,255,20,0.08)' }}
                    >
                        START
                    </button>
                    <div className="mt-3 text-[11px] text-gray-500">Records only with consent — the same gate as your game takes. Revocable anytime.</div>
                    {history.length > 0 && (
                        <div className="mt-3 text-[10px] text-gray-500" data-clap-history="">your last: {formatHistory(history)}</div>
                    )}
                </div>
            )}

            {phase === 'testing' && (
                <div className="w-full max-w-md text-center pointer-events-none">
                    <div className="text-sm tracking-widest text-gray-300">SLAP THE SCREEN — about 2 s apart</div>
                    <div className="mt-1 text-xs text-gray-500">volume down · palm on the glass</div>
                    <div key={flash} className="mt-10 mx-auto w-56 h-56 rounded-full border-4 flex items-center justify-center" style={{ borderColor: NEON, background: flash ? 'rgba(57,255,20,0.22)' : 'rgba(57,255,20,0.06)', boxShadow: `0 0 40px rgba(57,255,20,0.25) inset` }}>
                        <span className="text-7xl font-bold" style={{ color: NEON }}>{taps}<span className="text-3xl text-gray-400">/{SLAPS_NEEDED}</span></span>
                    </div>
                    <div className="mt-8 mx-auto w-56" data-clap-meter="" aria-hidden="true" style={{ height: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(57,255,20,0.35)', borderRadius: 5, overflow: 'hidden' }}>
                        <i ref={meterFillRef} style={{ display: 'block', height: '100%', width: '0%', background: NEON }} />
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500">mic level — your slaps must push this bar</div>
                    {gapMs !== null && (
                        <div className="mt-3 text-sm" data-clap-gap={String(gapMs)} style={{ color: AMBER }}>last gap {(gapMs / 1000).toFixed(1)} s — aim for ~2&nbsp;s</div>
                    )}
                    {quiet && (
                        <div className="mt-3 text-sm font-bold" data-clap-quiet="1" style={{ color: '#ff8040' }}>TOO QUIET — slap harder</div>
                    )}
                    <div className="mt-3 text-xs text-gray-500">ends by itself after the {SLAPS_NEEDED}rd slap</div>
                </div>
            )}

            {phase === 'grading' && (
                <div className="text-center">
                    <div className="text-2xl font-bold tracking-widest animate-pulse" style={{ color: AMBER }}>LISTENING…</div>
                    <div className="mt-2 text-xs text-gray-500">decoding your slaps against the frame clock</div>
                </div>
            )}

            {phase === 'graded' && result && (
                <div className="w-full max-w-md text-center">
                    <p className="sr-only" aria-live="assertive">{`${verdict}. ${result.why || ''}${result.hint ? ` — ${result.hint}` : ''}`}</p>
                    <div className="text-6xl font-bold tracking-widest" style={{ color: result.ok ? NEON : '#ff4040' }}>{verdict}</div>
                    <div className="mt-4 text-sm text-gray-300">{result.why}</div>
                    <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                        <div className="border border-gray-700 rounded-lg p-3 bg-white/5"><div className="text-2xl font-bold" style={{ color: AMBER }}>{result.claps}</div><div className="text-[10px] text-gray-400 mt-1">slaps heard</div></div>
                        <div className="border border-gray-700 rounded-lg p-3 bg-white/5"><div className="text-2xl font-bold" style={{ color: AMBER }}>{result.matched}</div><div className="text-[10px] text-gray-400 mt-1">pairs matched</div></div>
                        <div className="border border-gray-700 rounded-lg p-3 bg-white/5"><div className="text-2xl font-bold" style={{ color: AMBER }}>{worstAbs === null ? '—' : `${worstAbs} ms`}</div><div className="text-[10px] text-gray-400 mt-1">worst gap</div></div>
                    </div>
                    {result.pairs && result.pairs.length > 0 && (
                        <div className="mt-3 text-[10px] text-gray-500">{result.pairs.map((p, i) => `#${i + 1} ${p.offsetMs > 0 ? '+' : ''}${p.offsetMs} ms`).join('   ')}</div>
                    )}
                    {hardFailNote(result) && (
                        <div className="mt-3 text-[10px] text-gray-400" data-clap-worst-note="">{hardFailNote(result)}</div>
                    )}
                    {result.hint && (
                        <div className="mt-5 border rounded-lg p-4 text-sm" style={{ borderColor: '#ff4040', color: '#ffb4b4', background: 'rgba(255,64,64,0.07)' }}>
                            → {result.hint}
                        </div>
                    )}
                    <div className="mt-4 text-[11px] text-gray-500">
                        {upload && upload.uploaded ? `take uploaded${upload.key ? ` — ${upload.key}` : ''}` : upload && upload.requeued ? 'take saved — will sync' : upload && upload.reason ? `take not uploaded (${upload.reason})` : 'the store was not reachable — nothing left this phone'}
                    </div>
                    <button
                        type="button"
                        onClick={start}
                        data-clap-again=""
                        className="mt-6 w-full py-4 rounded-xl border-2 text-lg font-bold tracking-widest"
                        style={{ borderColor: AMBER, color: AMBER, background: 'rgba(255,216,64,0.08)' }}
                    >
                        TAKE AGAIN
                    </button>
                </div>
            )}
        </div>
    )
}

export default ClapTest

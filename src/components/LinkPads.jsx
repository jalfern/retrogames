import { useEffect, useRef, useState, useCallback } from 'react'
import { createPadHost } from '../utils/padlink.js'
import { makeHostPeer, makeTransport, RELAY_DEFAULT } from '../utils/linkPeers.js'

// LINK PADS host glue (#893): the game screen half of iPhone-as-controller.
// Opens a room over the relay, watches phones join at /retrogames/pad, and
// lands each phone's pad state in its onePad slot (see utils/padlink.js).
// Enabled by ?pads=1 on a game URL (auto-open) or the PADS pill (tap to
// open/close). Publishes `retrogames:linkpads { count }` like GamepadBridge
// publishes `retrogames:pads`, so a game can react to linked phones.
//
// WebRTC: host-side data channel per phone, unordered + no retransmits
// (padlink's contract). ICE is host candidates only — the direct path is the
// point (same Wi-Fi); when ICE can't pair within RTC_WAIT_MS the pad state
// just keeps riding the relay, and the pill says RELAY.

const LinkPads = ({ secondAction }) => {
    const [ui, setUi] = useState({ open: false, phase: 'idle', code: '', pads: [] })
    const hostRef = useRef(null)
    const secondRef = useRef(secondAction)
    useEffect(() => { secondRef.current = secondAction }, [secondAction])

    const syncUi = useCallback((snapshot) => {
        setUi((prev) => ({ ...prev, ...snapshot }))
        window.dispatchEvent(new CustomEvent('retrogames:linkpads', { detail: { count: snapshot.pads ? snapshot.pads.length : 0 } }))
    }, [])

    const open = useCallback(() => {
        if (hostRef.current) return
        const q = new URLSearchParams(window.location.search)
        const relay = (q.get('relay') || RELAY_DEFAULT).replace(/^http/, 'ws')
        const host = createPadHost({
            relay,
            makeTransport,
            secondAction: secondRef.current,
            makePeer: typeof RTCPeerConnection !== 'undefined' ? makeHostPeer : null,
            dispatch: (code, type) => {
                const key = code === 'Space' ? ' ' : code === 'Enter' ? 'Enter' : code
                window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }))
            },
            onPhase: (phase) => setUi((prev) => ({ ...prev, phase })),
            onPads: (p) => setUi((prev) => ({ ...prev, pads: p.pads })),
        })
        hostRef.current = host
        const code = host.open()
        setUi({ open: true, phase: 'connecting', code, pads: [] })
        if (import.meta.env.DEV) window.__padlink = host
        let raf = 0
        const loop = () => { raf = requestAnimationFrame(loop); host.pump() }
        raf = requestAnimationFrame(loop)
        host._raf = raf
    }, [])

    const close = useCallback(() => {
        const host = hostRef.current
        if (!host) return
        cancelAnimationFrame(host._raf)
        host.close()
        hostRef.current = null
        setUi({ open: false, phase: 'idle', code: '', pads: [] })
        window.dispatchEvent(new CustomEvent('retrogames:linkpads', { detail: { count: 0 } }))
    }, [])

    useEffect(() => {
        const q = new URLSearchParams(window.location.search)
        if (q.get('pads') === '1') open()
        return () => { if (hostRef.current) close() }
    }, [open, close])

    useEffect(() => {
        const h = () => syncUi({ pads: hostRef.current ? hostRef.current.pads : [] })
        const iv = setInterval(h, 700)
        return () => clearInterval(iv)
    }, [syncUi])

    if (!ui.open && !ui.code) {
        return (
            <button
                onClick={open}
                data-nav="linkpads"
                aria-label="Link phones as controllers"
                className="fixed z-[60] font-mono text-[10px] tracking-[0.25em] text-white/50 hover:text-white transition-colors px-2 py-1 border border-white/20 rounded"
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}
            >
                PADS
            </button>
        )
    }

    if (ui.pads.length) {
        // A phone is in — collapse to a small pill in the top-right corner so it
        // never sits on a game's centred HUD text.
        return (
            <button
                onClick={close}
                data-nav="linkpads"
                className="fixed z-[60] font-mono text-[10px] tracking-[0.25em] transition-colors px-2 py-1 border rounded"
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))', color: '#7dd3fc', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.35)' }}
            >
                PADS {ui.code} · {ui.pads.map((p) => `P${p.seat}${p.mode === 'direct' ? '' : '~'}`).join(' ')}
            </button>
        )
    }

    // Waiting for a phone: one clear join card, centred, big room code + the URL,
    // nothing else crowding it. Tap the ✕ to close.
    return (
        <div
            data-nav="linkpads"
            className="fixed z-[60] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border border-white/25 bg-black/70 backdrop-blur-md font-mono text-white text-center select-none"
        >
            <p className="text-[10px] tracking-[0.4em] text-white/45">LINK PADS · {ui.phase === 'connecting' ? 'CONNECTING…' : 'OPEN'}</p>
            <p className="text-5xl tracking-[0.35em] text-sky-300" style={{ textShadow: '0 0 18px rgba(125,211,252,0.35)' }}>{ui.code}</p>
            <p className="text-[11px] tracking-[0.15em] text-white/70">open <span className="text-white">jalfern.com/retrogames/pad</span></p>
            <p className="text-[10px] tracking-[0.2em] text-white/40">enter this code on your phone</p>
            <button onClick={close} className="mt-1 px-4 py-1 rounded-full border border-white/25 text-[10px] tracking-[0.3em] text-white/70 hover:bg-white/10">CLOSE</button>
        </div>
    )
}

export default LinkPads

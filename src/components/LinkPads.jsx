import { useEffect, useRef, useState, useCallback } from 'react'
import { createPadHost } from '../utils/padlink.js'
import { makeHostPeer, RELAY_DEFAULT } from '../utils/linkPeers.js'

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
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', left: '50%', transform: 'translateX(-50%)' }}
            >
                PADS
            </button>
        )
    }

    return (
        <button
            onClick={close}
            data-nav="linkpads"
            className="fixed z-[60] font-mono text-[10px] tracking-[0.25em] transition-colors px-2 py-1 border rounded"
            style={{ top: 'calc(0.75rem + var(--sat, 0px))', left: '50%', transform: 'translateX(-50%)', color: ui.pads.length ? '#7dd3fc' : 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.35)' }}
        >
            {ui.pads.length
                ? `PADS ${ui.code} · ${ui.pads.map((p) => `P${p.seat}${p.mode === 'direct' ? '' : '~'}`).join(' ')}`
                : ui.phase === 'connecting' ? `LINK ${ui.code} · CONNECTING…` : `LINK ${ui.code} · OPEN jalfern.com/retrogames/pad`}
        </button>
    )
}

export default LinkPads

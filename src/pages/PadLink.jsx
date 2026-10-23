import { useEffect, useRef, useState } from 'react'
import { createPadClient } from '../utils/padlink.js'
import { quantize, DIR_DEAD } from '../utils/onePad.js'
import { vpadSize } from '../components/vpadSize.js'

// /retrogames/pad — the PHONE half of link pads (#893). Full-screen
// landscape controller: left stick (move), right stick (aim), four face
// buttons, L/R shoulders, and a live ping readout that says which path the
// input takes — WI-FI when the WebRTC data channel to the game paired
// directly, RELAY when it is falling back through the server. The pad state
// streams at ~120/s on the direct link (see utils/padlink.js), straight from
// touch events; a lost packet is irrelevant because the next one is 8ms away.
//
// Look follows the shared touch controls (#885/#735): the same vpadSize law
// drives every dimension, the same white/25 knob + ring + blur language.

const RELAY_DEFAULT = 'wss://retrogames.jalfern.workers.dev'

function makePadPeer() {
    const pc = new RTCPeerConnection({ iceServers: [] })
    let chan = null
    let openCb = null, msgCb = null, stateCb = null, iceCb = null
    pc.ondatachannel = (ev) => {
        chan = ev.channel
        chan.onopen = () => openCb && openCb()
        chan.onmessage = (ev2) => msgCb && msgCb(ev2.data)
    }
    pc.onconnectionstatechange = () => { if (stateCb) stateCb(pc.connectionState) }
    pc.onicecandidate = (ev) => { if (ev.candidate && iceCb) iceCb(ev.candidate) }
    return {
        answer: async (sd) => {
            await pc.setRemoteDescription(sd)
            const a = await pc.createAnswer()
            await pc.setLocalDescription(a)
            return a
        },
        ice: (c) => { pc.addIceCandidate(c).catch(() => { /* stale candidate */ }) },
        send: (s) => { if (chan && chan.readyState === 'open') chan.send(s) },
        close: () => { try { pc.close() } catch { /* gone */ } },
        onOpen: (cb) => { openCb = cb },
        onMessage: (cb) => { msgCb = cb },
        onState: (cb) => { stateCb = cb },
        onIce: (cb) => { iceCb = cb },
    }
}

const clamp1 = (v) => (v > 1 ? 1 : v < -1 ? -1 : v)

export default function PadLink() {
    const [phase, setPhase] = useState('entry')   // entry | connecting | live | hostless | gone
    const [seat, setSeat] = useState(0)
    const [rtt, setRtt] = useState(0)
    const [mode, setMode] = useState('relay')
    const [code, setCode] = useState(() => (new URLSearchParams(window.location.search).get('room') || '').toUpperCase())
    const [sz, setSz] = useState(() => vpadSize(window.innerWidth, window.innerHeight))
    const [heldUI, setHeldUI] = useState({})
    const clientRef = useRef(null)
    const padRef = useRef({
        up: false, down: false, left: false, right: false,
        a: false, b: false, x: false, y: false, start: false, boost: false,
        xv: 0, yv: 0, ax: 0, ay: 0, sl: false, sr: false,
    })

    useEffect(() => {
        const onResize = () => setSz(vpadSize(window.innerWidth, window.innerHeight))
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const join = (raw) => {
        const c = String(raw || '').toUpperCase()
        if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(c)) return
        setPhase('connecting')
        if (clientRef.current) clientRef.current.stop()
        const q = new URLSearchParams(window.location.search)
        const relay = (q.get('relay') || RELAY_DEFAULT).replace(/^http/, 'ws')
        const client = createPadClient({
            relay,
            makePeer: typeof RTCPeerConnection !== 'undefined' ? makePadPeer : null,
            readPad: () => {
                const p = padRef.current
                const stick = quantize(p.xv, p.yv, DIR_DEAD)
                const aim = quantize(p.ax, p.ay, DIR_DEAD)
                return {
                    pad: {
                        up: stick.up, down: stick.down, left: stick.left, right: stick.right,
                        a: p.a, b: p.b, start: p.start, boost: p.boost || p.y,
                        aimUp: aim.up, aimDown: aim.down, aimLeft: aim.left, aimRight: aim.right,
                        x: p.xv, y: p.yv, ax: p.ax, ay: p.ay,
                    },
                    raw: { x: p.xv, y: p.yv, ax: p.ax, ay: p.ay },
                    shoulder: { l: p.sl, r: p.sr },
                }
            },
            onPhase: setPhase,
            onSeat: setSeat,
            onRtt: setRtt,
            onMode: setMode,
            onError: () => setPhase('gone'),
        })
        clientRef.current = client
        client.join(c)
        if (import.meta.env.DEV) window.__padclient = client
    }

    useEffect(() => {
        const initial = code
        if (initial && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(initial)) join(initial)
        return () => { if (clientRef.current) clientRef.current.stop() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // --- sticks ---------------------------------------------------------------
    const stickHandlers = (which) => {
        const zone = useRef(null)
        const active = useRef(-1)
        const center = useRef({ x: 0, y: 0 })
        const travel = sz.stick * 0.32
        const set = (dx, dy) => {
            const len = Math.hypot(dx, dy) || 1
            const m = Math.min(1, len / travel)
            const p = padRef.current
            if (which === 'move') { p.xv = clamp1((dx / len) * m); p.yv = clamp1((dy / len) * m) }
            else { p.ax = clamp1((dx / len) * m); p.ay = clamp1((dy / len) * m) }
            setHeldUI((prev) => ({ ...prev, [which]: m > 0.05 }))
        }
        const reset = () => {
            const p = padRef.current
            if (which === 'move') { p.xv = 0; p.yv = 0 } else { p.ax = 0; p.ay = 0 }
            setHeldUI((prev) => ({ ...prev, [which]: false }))
        }
        return {
            ref: zone,
            onTouchStart: (e) => {
                const t = e.changedTouches[0]
                const r = zone.current.getBoundingClientRect()
                center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
                active.current = t.identifier
                set(t.clientX - center.current.x, t.clientY - center.current.y)
            },
            onTouchMove: (e) => {
                for (const t of e.changedTouches) if (t.identifier === active.current) set(t.clientX - center.current.x, t.clientY - center.current.y)
            },
            onTouchEnd: (e) => { for (const t of e.changedTouches) if (t.identifier === active.current) { active.current = -1; reset() } },
            onMouseDown: (e) => {
                const r = zone.current.getBoundingClientRect()
                center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
                active.current = 0
                set(e.clientX - center.current.x, e.clientY - center.current.y)
            },
            onMouseMove: (e) => { if (active.current === 0) set(e.clientX - center.current.x, e.clientY - center.current.y) },
            onMouseUp: () => { active.current = -1; reset() },
            onMouseLeave: () => { active.current = -1; reset() },
        }
    }

    const holdKey = (field, codeLabel) => ({
        onPointerDown: (e) => { e.preventDefault(); padRef.current[field] = true; setHeldUI((p) => ({ ...p, [codeLabel]: true })) },
        onPointerUp: () => { padRef.current[field] = false; setHeldUI((p) => ({ ...p, [codeLabel]: false })) },
        onPointerCancel: () => { padRef.current[field] = false; setHeldUI((p) => ({ ...p, [codeLabel]: false })) },
        onPointerLeave: () => { padRef.current[field] = false; setHeldUI((p) => ({ ...p, [codeLabel]: false })) },
    })

    const move = stickHandlers('move')
    const aim = stickHandlers('aim')

    const stickEl = (handlers, label) => {
        const { ref, ...rest } = handlers
        return (
            <div
                ref={ref}
                data-pad={label}
                className="relative touch-none select-none rounded-full border-2 border-white/30 bg-white/5 shadow-[inset_0_0_18px_rgba(255,255,255,0.10)]"
                style={{ width: sz.stick, height: sz.stick }}
                {...rest}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-neutral-500/50 rounded-full" />
                <div
                    className="absolute top-1/2 left-1/2 rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]"
                    style={{ width: sz.knob, height: sz.knob, transform: 'translate(-50%, -50%)' }}
                />
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.3em] text-white/35">{label}</span>
            </div>
        )
    }

    const faceBtn = (field, label, tint) => (
        <div
            data-btn={label}
            {...holdKey(field, label)}
            className={`rounded-full flex items-center justify-center text-white font-bold backdrop-blur-sm ring-1 transition-all ${heldUI[label] ? 'ring-white/90 scale-95 brightness-150 ' : 'ring-white/50 '} ${tint}`}
            style={{ width: sz.btn, height: sz.btn, fontSize: sz.font(label.length) }}
        >
            {label}
        </div>
    )

    const shoulder = (field, label) => (
        <div
            data-btn={label}
            {...holdKey(field, label)}
            className={`rounded-xl px-4 py-2 font-mono text-xs tracking-widest text-white/90 border backdrop-blur-sm ${heldUI[label] ? 'bg-white/30 border-white/80' : 'bg-white/10 border-white/25'}`}
        >
            {label}
        </div>
    )

    if (phase === 'entry' || phase === 'hostless' || phase === 'gone') {
        return (
            <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center gap-6 font-mono text-white select-none">
                <p className="text-[10px] tracking-[0.4em] text-white/40">RETROGAMES LINK PAD</p>
                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') join(code) }}
                    maxLength={4}
                    placeholder="CODE"
                    className="w-44 text-center bg-transparent border-b-2 border-white/40 text-white font-mono text-3xl tracking-[0.5em] pb-2 outline-none placeholder:text-white/20"
                    aria-label="Room code"
                />
                <button
                    onClick={() => join(code)}
                    className="px-8 py-3 rounded-full bg-white/10 ring-1 ring-white/40 text-sm tracking-[0.3em] hover:bg-white/20"
                >
                    JOIN
                </button>
                <p className="text-[10px] tracking-[0.2em] text-white/30 text-center px-8">
                    {phase === 'hostless' ? 'NO HOST ON THAT CODE — open the game on the big screen first'
                        : phase === 'gone' ? 'LINK LOST — tap JOIN to retry'
                            : 'tap the code, or type it (keys work too)'}
                </p>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-neutral-950 overflow-hidden touch-none select-none">
            {/* HUD */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-4 pt-2 font-mono text-white/80" style={{ paddingTop: 'calc(0.5rem + var(--sat, 0px))' }}>
                <span className="text-[11px] tracking-[0.3em] text-sky-300">{code}</span>
                <span className="text-[11px] tracking-[0.3em]">{seat ? `P${seat}` : '···'}</span>
                <span className={`text-[11px] tracking-[0.3em] ${mode === 'direct' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {mode === 'direct' ? 'WI-FI' : 'RELAY'}
                </span>
                <span className="text-[11px] tracking-[0.3em] text-white/50">{rtt ? `${rtt} MS` : '—'}</span>
            </div>

            {/* shoulders */}
            <div className="absolute left-0 top-1/4 pl-3" style={{ paddingLeft: 'calc(0.75rem + var(--sal, 0px))' }}>{shoulder('sl', 'L')}</div>
            <div className="absolute right-0 top-1/4 pr-3" style={{ paddingRight: 'calc(0.75rem + var(--sar, 0px))' }}>{shoulder('sr', 'R')}</div>

            {/* sticks */}
            <div className="absolute bottom-0 flex items-end justify-between w-full px-2" style={{ paddingBottom: 'calc(1rem + var(--sab, 0px))' }}>
                {stickEl(move, 'MOVE')}
                <div className="flex items-end gap-3 mb-1">
                    {faceBtn('a', 'A', 'bg-red-500/25')}
                    {faceBtn('b', 'B', 'bg-orange-500/25')}
                    {faceBtn('x', 'X', 'bg-sky-500/25')}
                    {faceBtn('y', 'Y', 'bg-emerald-500/25')}
                </div>
                {stickEl(aim, 'AIM')}
            </div>

            {/* start: center-bottom tap strip */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2" style={{ bottom: 'calc(0.25rem + var(--sab, 0px))' }}>
                <div {...holdKey('start', 'START')} className={`px-6 py-1 rounded-full font-mono text-[10px] tracking-[0.4em] border ${heldUI.START ? 'bg-white/30 border-white/80 text-white' : 'bg-white/5 border-white/25 text-white/50'}`}>START</div>
            </div>

            {phase === 'connecting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/70 font-mono text-white/60 text-xs tracking-[0.3em] animate-pulse">
                    CONNECTING…
                </div>
            )}
        </div>
    )
}

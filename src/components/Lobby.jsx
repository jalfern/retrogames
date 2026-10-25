// LOBBY (#1039) — the ONE waiting room every multiplayer game shows. Host gets
// a big code (+ QR a phone can scan), friends appear in the roster as they
// join, the host starts; guests get the same words in every game. The look is
// themed per game (accent classes) but the LAYOUT, the WORDS and the FLOW are
// shared, so joining SSX, Blob Battle or Gauntlet feels like the same arcade.
// State comes from src/utils/lobby.js `state()`; games keep their own overlays
// for game-specific facts (desync, rival-left, standings).
//
// #1052 polish: seats animate when a friend arrives (one shared chime for all
// three games), the code chip copies its link on tap with a tick, the QR wears
// the game's colours, and a refused join shakes and buzzes like a cabinet
// refusing a coin.
// #1055: the waiting room is a dim passthrough, not a wall — a black/45 scrim
// with a soft vignette so the game's own attract scene keeps idling behind the
// room (Wii channel / arcade VS), same in every lobby game.

import React from 'react'
import { encode as qrEncode, toSvgPath } from '../utils/qrcode.js'
import { joinedSeats } from '../utils/lobby.js'
import { audioController } from '../utils/AudioController.js'

const KIND_LABEL = { host: 'HOST', human: 'HUMAN', cpu: 'CPU', model: 'MODEL' }

// one arcade-room join chime for every game (the pair Gauntlet used to own)
const joinChime = () => {
    audioController.playTone(660, 0.07, 'square', 0.05)
    audioController.playTone(990, 0.09, 'square', 0.05, 0.07)
}
// a refused join sounds like a coin slide kicking the token back
const refuseBuzz = () => {
    audioController.playSweep(160, 90, 0.3, 'square', 0.12)
    audioController.playNoise(0.12, 0.15)
}

export default function Lobby(props) {
    const { state } = props
    if (!state || !state.role) return null
    return <LobbyRoom {...props} />
}

function LobbyRoom({ state, title = 'ROOM', accent = {}, names, startHint = 'PRESS SPACE / TAP TO START', waitHint = 'WAITING FOR THE HOST TO START…', onEntry }) {
    const text = accent.text || 'text-cyan-50'
    const dim = accent.dim || 'text-cyan-300/70'
    const live = accent.live || 'border-cyan-300/40 text-cyan-100'
    const codeGlow = accent.codeGlow || { textShadow: '3px 0 0 #b0147a, -3px 0 0 #1490b0' }
    const qr = state.joinHref ? qrEncode(state.joinHref) : null
    const svg = qr ? toSvgPath(qr, 1) : null
    const refused = state.phase === 'refused'

    const [copied, setCopied] = React.useState(false)
    const phase = state.phase
    const prevSeats = React.useRef(null)
    const prevPhase = React.useRef(phase)
    const copyTimer = React.useRef(null)
    React.useEffect(() => () => clearTimeout(copyTimer.current), [])

    // arrivals: seats that became occupied since the last frame. The first
    // frame is the room as first seen — it never chimes.
    const joined = joinedSeats(prevSeats.current, state.seats)
    React.useEffect(() => {
        if (state.seats) {
            if (joined.length) joinChime()
            prevSeats.current = state.seats
        }
    })
    React.useEffect(() => {
        if (refused && prevPhase.current !== 'refused') refuseBuzz()
        prevPhase.current = phase
    }, [refused, phase])

    const copy = (e) => {
        e.preventDefault()
        const txt = state.joinHref || state.code
        try { navigator.clipboard && navigator.clipboard.writeText(txt) } catch { /* denied — the code is on screen anyway */ }
        audioController.playTone(880, 0.05, 'square', 0.04)
        setCopied(true)
        clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopied(false), 1400)
    }

    let cpuN = 0, modelN = 0

    return (
        <div className={`absolute inset-0 flex flex-col items-center justify-center text-center font-mono ${text} px-6 z-10`} style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0.82) 100%)' }}>
            <div className={`text-[10px] tracking-[0.3em] mb-1 ${dim}`}>
                {state.role === 'host' ? `HOST A ${title}` : `JOINING ${title}`}
            </div>

            {state.phase === 'entry' && onEntry && (
                <div className="flex flex-col items-center gap-2">
                    <div className={`text-[11px] ${dim}`}>ENTER A FRIEND&apos;S ROOM CODE</div>
                    <CodeEntry accent={accent} onEntry={onEntry} />
                </div>
            )}

            {(state.phase === 'connecting' || (state.phase === 'waiting' && !state.code)) && (
                <div className="text-lg mb-3 animate-pulse">CONNECTING…</div>
            )}
            {state.phase === 'reconnecting' && (
                <div className="text-lg mb-3 animate-pulse" style={{ color: accent.warn || '#ffd23f' }}>CONNECTION DROPPED — RECONNECTING…</div>
            )}
            {state.phase === 'offline' && !state.info && (
                <div className="text-lg mb-3" style={{ color: accent.bad || '#ff5d5d' }}>RELAY OFFLINE — CHECK NETWORK OR ?relay= URL</div>
            )}
            {refused && (
                <div key={`refused-${state.code}`} className="text-sm mb-3 animate-[lobby-shake_0.4s_ease-out]" style={{ color: accent.bad || '#ff5d5d' }}>ROOM {state.code} — {String(state.info || 'REFUSED').toUpperCase()}</div>
            )}

            {state.code && !refused && state.phase !== 'entry' && (
                <div className="flex flex-col items-center mb-3">
                    <div className={`text-[9px] tracking-[0.3em] ${dim}`}>ROOM CODE</div>
                    <div
                        role="button"
                        tabIndex={0}
                        title="tap to copy the invite link"
                        onPointerDown={copy}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') copy(e) }}
                        className="cursor-pointer select-none"
                    >
                        <div className="text-5xl font-black tracking-[0.35em] mb-1" style={codeGlow}>{state.code}</div>
                    </div>
                    <div className={`text-[8px] tracking-[0.25em] ${copied ? 'text-emerald-300' : dim}`} aria-live="polite">
                        {copied ? '✓ LINK COPIED' : 'TAP THE CODE TO COPY'}
                    </div>
                    {svg && (
                        <div className="mt-1 p-1 border-2 max-[380px]:hidden" style={{ borderColor: accent.qrFrame || '#ffffff88', background: '#fff' }}>
                            <svg viewBox={`0 0 ${svg.dim} ${svg.dim}`} width={104} height={104} shapeRendering="crispEdges">
                                <path d={svg.d} fill={accent.qr || '#000'} />
                            </svg>
                        </div>
                    )}
                </div>
            )}

            {state.seats && (
                <div className="flex gap-2 mb-4 flex-wrap justify-center">
                    {state.seats.map((k, i) => {
                        const isCpu = k === 'cpu'
                        const isModel = k === 'model'
                        if (isCpu) cpuN++
                        if (isModel) modelN++
                        const label = isCpu ? `CPU ${cpuN}` : isModel ? `MODEL ${modelN}` : ((names && names[i]) || `P${i + 1}`)
                        const kindClass = isCpu ? 'border-white/15 text-white/40'
                            : isModel ? 'border-dashed border-violet-300/50 text-violet-200/80'
                                : live
                        return (
                            <div
                                key={i}
                                data-seat={i}
                                data-joined={joined.indexOf(i) >= 0 ? '1' : undefined}
                                className={`px-3 py-2 rounded border bg-black/40 text-xs font-bold ${kindClass} ${i === state.slot ? 'ring-2 ring-yellow-300' : ''} ${joined.indexOf(i) >= 0 ? 'animate-[lobby-pop_0.28s_ease-out]' : ''}`}
                            >
                                <div className="text-[9px] opacity-70">{isModel ? '◈ ' : ''}{KIND_LABEL[k] || k.toUpperCase()}</div>
                                <div>{i === state.slot ? 'YOU' : label}</div>
                            </div>
                        )
                    })}
                </div>
            )}

            {state.role === 'host' && state.phase === 'waiting' && (
                <p className="text-sm animate-pulse" style={{ color: accent.warn || '#ffd23f' }}>{startHint}</p>
            )}
            {state.role === 'host' && state.phase === 'racing' && (
                <p className="text-sm">STARTED — RACING…</p>
            )}
            {state.role === 'guest' && (
                <p className={`text-sm animate-pulse ${dim}`}>{waitHint}</p>
            )}
            {state.role === 'host' && state.phase === 'waiting' && state.joinHref && (
                <p className={`text-xs mt-3 ${dim}`}>share the code · a friend opens {state.joinHref.replace(/^https?:\/\/[^/]+/, '')}</p>
            )}
        </div>
    )
}

function CodeEntry({ accent, onEntry }) {
    const [code, setCode] = React.useState('')
    const btn = accent.btn || 'border-cyan-300/60 text-cyan-100'
    const submit = () => { if (code.length === 4) onEntry(code) }
    return (
        <div className="flex gap-2">
            <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                placeholder="CODE"
                maxLength={4}
                className="w-28 bg-transparent border border-white/25 px-2 py-1 text-center text-lg tracking-[0.4em] outline-none"
            />
            <button type="button" disabled={code.length !== 4} onClick={submit} className={`border px-3 py-1 text-[11px] disabled:opacity-30 ${btn}`}>JOIN</button>
        </div>
    )
}

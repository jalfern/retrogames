// LOBBY (#1039) — the ONE waiting room every multiplayer game shows. Host gets
// a big code (+ QR a phone can scan), friends appear in the roster as they
// join, the host starts; guests get the same words in every game. The look is
// themed per game (accent classes) but the LAYOUT, the WORDS and the FLOW are
// shared, so joining SSX, Blob Battle or Gauntlet feels like the same arcade.
// State comes from src/utils/lobby.js `state()`; games keep their own overlays
// for game-specific facts (desync, rival-left, standings).

import React from 'react'
import { encode as qrEncode, toSvgPath } from '../utils/qrcode.js'

const KIND_LABEL = { host: 'HOST', human: 'HUMAN', cpu: 'CPU', model: 'MODEL' }

export default function Lobby({ state, title = 'ROOM', accent = {}, names, startHint = 'PRESS SPACE / TAP TO START', waitHint = 'WAITING FOR THE HOST TO START…', onEntry }) {
    if (!state || !state.role) return null
    const text = accent.text || 'text-cyan-50'
    const dim = accent.dim || 'text-cyan-300/70'
    const live = accent.live || 'border-cyan-300/40 text-cyan-100'
    const codeGlow = accent.codeGlow || { textShadow: '3px 0 0 #b0147a, -3px 0 0 #1490b0' }
    const qr = state.joinHref ? qrEncode(state.joinHref) : null
    const svg = qr ? toSvgPath(qr, 1) : null
    let cpuN = 0, modelN = 0

    return (
        <div className={`absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-center font-mono ${text} px-6 z-10`}>
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
            {state.phase === 'refused' && (
                <div className="text-sm mb-3" style={{ color: accent.bad || '#ff5d5d' }}>ROOM {state.code} — {String(state.info || 'REFUSED').toUpperCase()}</div>
            )}

            {state.code && state.phase !== 'refused' && state.phase !== 'entry' && (
                <div className="flex flex-col items-center mb-3">
                    <div className={`text-[9px] tracking-[0.3em] ${dim}`}>ROOM CODE</div>
                    <div className="text-5xl font-black tracking-[0.35em] mb-1" style={codeGlow}>{state.code}</div>
                    {svg && (
                        <svg viewBox={`0 0 ${svg.dim} ${svg.dim}`} className="mt-1 bg-white p-1" width={104} height={104} shapeRendering="crispEdges">
                            <path d={svg.d} fill="#000" />
                        </svg>
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
                        return (
                            <div key={i} className={`px-3 py-2 rounded border text-xs font-bold ${isCpu || isModel ? 'border-white/15 text-white/40' : live} ${i === state.slot ? 'ring-2 ring-yellow-300' : ''}`}>
                                <div className="text-[9px] opacity-70">{KIND_LABEL[k] || k.toUpperCase()}</div>
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

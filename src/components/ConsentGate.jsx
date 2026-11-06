import React, { useEffect, useState } from 'react'

// CONSENT GATE (#1711) — the screen a human sees BEFORE any session recording
// starts. One gate per player, two switches: the motion stream (pads, raw
// input, seed, state hashes) and the voice stream (raw mic audio), granted
// separately — Jon's rule. Nothing is checked by default; a player who never
// touches the switches consents to nothing, and the game plays exactly the
// same. Escape = decline everything.
//
// The gate is deliberately boring and specific: it names what is stored, that
// the store is private, and how to take it back (revoke lives in
// src/utils/consent.js — revoke is a one-liner, no interrogation).

const Switch = ({ id, on, onChange, disabled, label, sub }) => (
    <button
        type="button"
        id={id}
        role="switch"
        aria-checked={!!on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
            on ? 'border-[#39ff14] bg-[#39ff14]/10' : 'border-gray-600 bg-black/40'
        } ${disabled ? 'opacity-40' : ''}`}
    >
        <span>
            <span className="block text-base font-bold text-gray-100">{label}</span>
            <span className="block text-xs text-gray-400">{sub}</span>
        </span>
        <span
            aria-hidden="true"
            className={`shrink-0 w-14 h-8 rounded-full relative border ${on ? 'bg-[#39ff14]/30 border-[#39ff14]' : 'bg-gray-800 border-gray-600'}`}
        >
            <span
                className={`absolute top-0.5 w-6 h-6 rounded-full transition-all ${on ? 'left-7 bg-[#39ff14]' : 'left-0.5 bg-gray-500'}`}
            />
        </span>
    </button>
)

// ConsentGate is MOUNTED while the question is open (the parent decides), not
// hidden via a prop — a fresh mount is a fresh blank answer, and the react
// rule against resetting state inside an effect never tempts anyone.
const ConsentGate = ({ player = 'PLAYER', hasMic = true, onDecide }) => {
    const [motion, setMotion] = useState(false)
    const [voice, setVoice] = useState(false)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onDecide({ motion: false, voice: false, reason: 'declined' }) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onDecide])
    const finish = (m, v, reason) => onDecide({ motion: m, voice: v, reason: reason || (m || v ? 'granted' : 'declined') })
    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" data-consent-gate>
            <div className="w-full max-w-md rounded-xl border-2 border-[#ffd840] bg-[#101018] p-5 font-mono">
                <div className="text-2xl font-bold text-[#ffd840] text-center tracking-widest">RECORD THIS PLAYER?</div>
                <div className="mt-1 text-center text-xs text-gray-400">
                    {player} — private research store, revocable anytime, nothing leaves this phone without a YES below.
                </div>
                <div className="mt-4 space-y-3">
                    <Switch
                        id="consent-motion"
                        on={motion}
                        onChange={setMotion}
                        label="Record my play"
                        sub="controller input, touch positions, game seed + checkpoints — lets your run be replayed and studied"
                    />
                    <Switch
                        id="consent-voice"
                        on={voice}
                        onChange={setVoice}
                        disabled={!hasMic}
                        label="Record my voice"
                        sub={hasMic ? 'raw microphone audio, lined up with the action — separate from the play recording' : 'no microphone available on this device'}
                    />
                </div>
                <div className="mt-5 flex gap-3">
                    <button
                        type="button"
                        id="consent-yes"
                        onClick={() => finish(motion, voice)}
                        className="flex-1 rounded-lg border-2 border-[#39ff14] bg-[#39ff14]/15 py-3 text-lg font-bold text-[#39ff14] tracking-widest"
                    >
                        SAVE{motion || voice ? '' : ' NOTHING'}
                    </button>
                    <button
                        type="button"
                        id="consent-no"
                        onClick={() => finish(false, false, 'declined')}
                        className="flex-1 rounded-lg border-2 border-gray-500 bg-black/40 py-3 text-lg font-bold text-gray-300 tracking-widest"
                    >
                        NO THANKS
                    </button>
                </div>
                <div className="mt-3 text-center text-[10px] text-gray-500">
                    Declining changes nothing about the game. Ask later: consent is stored on this device only.
                </div>
            </div>
        </div>
    )
}

export default ConsentGate

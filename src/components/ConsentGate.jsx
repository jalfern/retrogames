import React, { useEffect, useState } from 'react'
import { playerId } from '../utils/player.js'

// CONSENT GATE (#1711) — the screen a human sees BEFORE any session recording
// starts. One gate per player, two switches: the motion stream (pads, raw
// input, seed, state hashes) and the voice stream (raw mic audio), granted
// separately — Jon's rule. Nothing is checked by default; a player who never
// touches the switches consents to nothing, and the game plays exactly the
// same. Escape = decline everything.
//
// #1711 audit 1: the gate also asks WHO. Saving anything requires a name —
// the id it normalizes to keys consent, the take and the upload, so the
// store can tell players apart ("whole players held out" needs this). An
// unnamed NO THANKS is still allowed: declining is identity-free, but a
// decline is ALL an anonymous run can ever be.
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
// `defaultName` prefills the WHO field (last-used name on this device —
// a convenience, never consent).
const ConsentGate = ({ defaultName = '', hasMic = true, onDecide }) => {
    const [motion, setMotion] = useState(false)
    const [voice, setVoice] = useState(false)
    const [name, setName] = useState(String(defaultName || ''))
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onDecide({ motion: false, voice: false, name, reason: 'declined' }) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onDecide, name])
    const finish = (m, v, reason) => onDecide({ motion: m, voice: v, name: name.trim(), reason: reason || (m || v ? 'granted' : 'declined') })
    const saving = motion || voice
    const named = playerId(name) !== null
    const canSave = saving ? named : true
    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" data-consent-gate>
            <div className="w-full max-w-md rounded-xl border-2 border-[#ffd840] bg-[#101018] p-5 font-mono">
                <div className="text-2xl font-bold text-[#ffd840] text-center tracking-widest">RECORD THIS PLAYER?</div>
                <div className="mt-1 text-center text-xs text-gray-400">
                    One answer per person — different humans on this phone each decide for themselves. Private research store, revocable anytime, nothing leaves this phone without a YES below.
                </div>
                <label htmlFor="consent-name" className="mt-4 block">
                    <span className="block text-xs text-gray-400">Who is playing?</span>
                    <input
                        id="consent-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={64}
                        autoComplete="off"
                        placeholder="your name (e.g. jon)"
                        className={`mt-1 w-full rounded-lg border bg-black/60 px-3 py-2 text-base text-gray-100 placeholder-gray-600 focus:outline-none ${saving && !named ? 'border-[#ff5c5c]' : 'border-gray-600 focus:border-[#39ff14]'}`}
                    />
                    {saving && !named && (
                        <span className="mt-1 block text-[11px] text-[#ff5c5c]">A name is required to save — recordings are keyed to the player who consented.</span>
                    )}
                </label>
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
                        disabled={!canSave}
                        onClick={() => finish(motion, voice)}
                        className={`flex-1 rounded-lg border-2 py-3 text-lg font-bold tracking-widest ${
                            canSave
                                ? 'border-[#39ff14] bg-[#39ff14]/15 text-[#39ff14]'
                                : 'border-gray-700 bg-black/40 text-gray-600'
                        }`}
                    >
                        SAVE{saving ? (named ? ` AS ${playerId(name)?.toUpperCase()}` : ' NOTHING') : ' NOTHING'}
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

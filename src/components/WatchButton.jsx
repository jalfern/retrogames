import React from 'react'
import { WATCH_KEY } from '../utils/watch'

// #1650: the watching banner lived verbatim in every game's JSX — folded into
// shared chrome here (plumbing, per the shell-template rule). Games pass their
// own positioning class (the wrapper element stays per-game); the text is the
// harness-visible contract (watchcheck reads it).
export const WatchToast = ({ className = 'absolute top-3', style }) => (
    <div className={`${className} left-1/2 -translate-x-1/2 bg-emerald-500/90 border border-emerald-200 text-emerald-950 font-mono text-[11px] font-bold tracking-widest px-3 py-1 rounded-full shadow-lg pointer-events-none whitespace-nowrap`} style={style}>
        WATCHING — THE PROVEN ROUTE · ANY INPUT TAKES OVER
    </div>
)

// WATCH (#1624) — the touch face of the watch key. It fires the SAME KeyY
// keydown/keyup every game listens for, so pad and keyboard can't drift.
// data-watch-toggle keeps the games' pointer-takeover listeners from eating
// the press that turns the watcher on.
const WatchButton = ({ on = false, disabled = false }) => (
    <button
        data-watch-toggle="1"
        title={disabled ? 'no guide yet' : on ? 'stop watching — take over' : 'watch the proven route'}
        className={`pointer-events-auto select-none rounded-full border font-bold tracking-wider backdrop-blur-md transition-all ${on ? 'bg-emerald-400/80 border-emerald-200 text-emerald-950 scale-95' : 'bg-white/10 border-white/40 text-white/90'} ${disabled ? 'opacity-40' : ''}`}
        style={{ width: 64, height: 34, fontSize: 10, touchAction: 'none' }}
        onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (disabled) return
            window.dispatchEvent(new KeyboardEvent('keydown', { code: WATCH_KEY, key: 'y', bubbles: true }))
        }}
        onPointerUp={() => {
            if (disabled) return
            window.dispatchEvent(new KeyboardEvent('keyup', { code: WATCH_KEY, key: 'y', bubbles: true }))
        }}
        onPointerCancel={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: WATCH_KEY, key: 'y', bubbles: true }))}
    >
        {on ? '◼ TAKE' : '▶ WATCH'}
    </button>
)

export default WatchButton

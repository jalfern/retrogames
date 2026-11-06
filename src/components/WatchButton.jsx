import React from 'react'
import { WATCH_KEY } from '../utils/watch'

// #1650: the watching banner lived verbatim in every game's JSX — folded into
// shared chrome here (plumbing, per the shell-template rule). Games pass their
// own positioning class (the wrapper element stays per-game); the text is the
// harness-visible contract (watchcheck reads it).
// #1653 p1: the banner rides the safe-area inset (like every #437 chrome
// control) and defaults BELOW the WATCH pill. The old top-3 sat in the chrome
// band; at ~400px as-written (50 chars of 11px mono + tracking-widest) it
// overflows a 390px phone, so it now clamps to 94vw and wraps. watchpillcheck
// pins the 6.25rem/94vw law and the clearance over the pill.
export const WatchToast = ({ className = 'absolute z-50', style }) => (
    <div className={`${className} left-1/2 -translate-x-1/2 max-w-[94vw] bg-emerald-500/90 border border-emerald-200 text-emerald-950 font-mono text-[11px] font-bold tracking-widest px-3 py-1 rounded-full shadow-lg pointer-events-none whitespace-normal text-center`} style={{ top: 'calc(6.25rem + var(--sat, 0px))', ...style }}>
        WATCHING — THE PROVEN ROUTE · ANY INPUT TAKES OVER
    </div>
)

// #1656: the old pill was 64×34 white/10 glass — Jon, on his phone, couldn't
// find it. Now phone-sized everywhere: at least 44pt tall, solid emerald,
// large label. 44×112 keeps the thumb rule (Apple HIG) and the emerald family
// keeps it recognisable as WATCH across the arcade.
const PILL = { minWidth: 112, height: 44, fontSize: 13, padding: '0 16px', touchAction: 'none' }

// WATCH (#1624) — the touch face of the watch key. It fires the SAME KeyY
// keydown/keyup every game listens for, so pad and keyboard can't drift.
// data-watch-toggle keeps the games' pointer-takeover listeners from eating
// the press that turns the watcher on.
const WatchButton = ({ on = false, disabled = false }) => (
    <button
        data-watch-toggle="1"
        title={disabled ? 'no guide yet' : on ? 'stop watching — take over' : 'watch the proven route'}
        className={`pointer-events-auto select-none rounded-full border-2 font-bold tracking-wider backdrop-blur-md transition-all ${on ? 'bg-emerald-300 border-white text-emerald-950 scale-95' : 'bg-emerald-500 border-emerald-200 text-white shadow-lg'} ${disabled ? 'opacity-40' : ''}`}
        style={PILL}
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

// #1656 — the attract-screen button for the person who forgot how to play.
// One tap: Space starts the run (every shell's attract starts on any key),
// then Y seats the watcher once the run is up (~180 ms — the loop's own
// first ticks). stopPropagation so the attract overlay's own tap-to-start
// doesn't fire a second start underneath us. Games with a multi-screen boot
// (title → select) mount it only where Space lands directly in a run.
export const AttractWatchButton = ({ disabled = false, className = '' }) => {
    const fire = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }))
    return (
        <button
            data-watch-attract="1"
            data-watch-toggle="1"
            title={disabled ? 'no guide yet' : 'start and watch the proven route'}
            className={`pointer-events-auto select-none rounded-full border-2 font-bold tracking-wider bg-emerald-500 border-emerald-200 text-white shadow-xl transition-all ${className}`}
            style={PILL}
            onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (disabled) return
                fire('keydown', 'Space', ' ')
                fire('keyup', 'Space', ' ')
                setTimeout(() => {
                    fire('keydown', WATCH_KEY, 'y')
                    fire('keyup', WATCH_KEY, 'y')
                }, 180)
            }}
        >
            ▶ WATCH
        </button>
    )
}

export default WatchButton

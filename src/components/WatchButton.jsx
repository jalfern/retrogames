import React from 'react'
import { WATCH_KEY } from '../utils/watch'

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

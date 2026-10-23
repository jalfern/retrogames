import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GAMES } from '../config/games'
import { dispatchPause } from '../utils/pauseEvent'
import { makeRing, startKeyboardRing, captureFeedback, submitFeedback, probeFeedback } from '../utils/feedback'

// Shared in-game chrome (#437): two always-visible corner buttons on every game
// screen, sized for a thumb inside the iOS safe area. Installed in fullscreen
// PWA mode there is no address bar and no '?' key, so without these a phone
// player has no way back to the showcase and no way to pause.
//
// PAUSE does NOT reimplement pause per game — it dispatches the same synthetic
// '?' KeyboardEvent VirtualControls already uses for arrows, so it lands in each
// game's own pause handler and does exactly what '?' does there (incl. Mario
// Original, whose '?' returns to the /mario options menu).
//
// FEEDBACK (#737): a third thumb button that captures a note plus the last 30 s
// of input (and a screenshot/state when the game exposes them) and files it via
// the relay. The ring is fed from the global keyboard bridge so it works on every
// title without per-game wiring; games that own the clock still send note+shot.

const isGameRoute = (pathname) =>
    pathname === '/' || GAMES.some((g) => g.path === pathname)

const btn = (theme) =>
    `z-[60] font-mono text-[10px] tracking-[0.2em] select-none px-2.5 py-1.5 rounded-md border backdrop-blur-sm transition-opacity duration-300 opacity-50 hover:opacity-100 active:opacity-100 ${theme === 'dark' ? 'text-white border-white/25 bg-black/40' : 'text-black border-black/25 bg-white/50'}`

const FeedbackButton = ({ theme }) => {
    const ringRef = useRef(null)
    const [ready, setReady] = useState(false)
    const [open, setOpen] = useState(false)
    const [note, setNote] = useState('')
    const [status, setStatus] = useState(null)

    useEffect(() => {
        let alive = true
        probeFeedback().then((ok) => { if (alive) setReady(ok) })
        return () => { alive = false }
    }, [])

    useEffect(() => {
        if (!ready) return undefined
        const ring = makeRing()
        ringRef.current = ring
        return startKeyboardRing(ring)
    }, [ready])

    const send = async () => {
        if (!note.trim()) return
        setStatus('sending…')
        const payload = captureFeedback({ note, ring: ringRef.current, route: window.location.pathname })
        const res = await submitFeedback(payload)
        setStatus(res.ok ? `sent #${(res.issue || '').split('/').pop()}` : `failed: ${res.err}`)
        if (res.ok) { setNote(''); setTimeout(() => { setOpen(false); setStatus(null) }, 1200) }
    }

    if (!ready) return null

    const panel = (theme === 'dark' ? 'text-white bg-black/80 border-white/25' : 'text-black bg-white/90 border-black/25')

    return (
        <>
            <button
                data-feedback="open"
                aria-label="Feedback"
                onClick={() => setOpen((v) => !v)}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(2.75rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}
            >
                FEEDBACK
            </button>
            {open && (
                <div
                    data-feedback="panel"
                    className={`fixed z-[70] w-[min(20rem,80vw)] rounded-lg border backdrop-blur-md p-3 ${panel}`}
                    style={{ top: 'calc(4.5rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}
                >
                    <textarea
                        data-feedback="note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What happened? (last 30s of input is attached)"
                        rows={3}
                        maxLength={2000}
                        className="w-full resize-none rounded bg-black/30 border border-white/20 p-2 text-xs font-mono outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                            data-feedback="send"
                            onClick={send}
                            disabled={!note.trim() || status === 'sending…'}
                            className="text-[10px] font-mono tracking-widest px-2 py-1 rounded border border-white/30 disabled:opacity-40"
                        >
                            SEND
                        </button>
                        {status && <span className="text-[10px] font-mono opacity-70 truncate">{status}</span>}
                    </div>
                </div>
            )}
        </>
    )
}

const GameChrome = ({ theme = 'light' }) => {
    const location = useLocation()
    const navigate = useNavigate()
    if (!isGameRoute(location.pathname)) return null

    return (
        <>
            <button
                data-nav="arcade"
                aria-label="Arcade"
                onClick={() => navigate('/games')}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}
            >
                ARCADE
            </button>
            <button
                data-nav="pause"
                aria-label="Pause"
                onClick={dispatchPause}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}
            >
                PAUSE
            </button>
            <FeedbackButton theme={theme} />
        </>
    )
}

export default GameChrome

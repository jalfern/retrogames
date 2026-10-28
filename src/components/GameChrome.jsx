import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GAMES } from '../config/games'
import { dispatchPause } from '../utils/pauseEvent'
import { makeRing, startKeyboardRing, captureFeedback, submitFeedback, probeFeedback, installTypingGuard, saveJonKey, readJonKey } from '../utils/feedback'
import RotateHint from './RotateHint'

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
    const panelRef = useRef(null)
    const keyInputRef = useRef(null)
    const [ready, setReady] = useState(false)
    const [open, setOpen] = useState(false)
    const [note, setNote] = useState('')
    const [status, setStatus] = useState(null)
    const [toast, setToast] = useState(null)
    const [keySaved, setKeySaved] = useState(() => {
        try { return !!readJonKey(window.localStorage) } catch { return false }
    })

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

    const closePanel = useCallback(() => {
        setOpen(false)
        setStatus(null)
        dispatchPause()
    }, [])

    // #905: the panel is its OWN screen, not a card floating over the game/help
    // overlay, and its keys never reach the game (capture-phase guard) — Space
    // stays a space, arrows move the caret, and the replay ring records the
    // gameplay, not the complaint.
    useEffect(() => {
        if (!open) return undefined
        return installTypingGuard(panelRef.current, undefined, (e) => {
            if (e.key === 'Escape') closePanel()
        })
    }, [open, closePanel])

    const send = async () => {
        if (!note.trim()) return
        setStatus('sending…')
        const payload = captureFeedback({ note, ring: ringRef.current, route: window.location.pathname })
        const res = await submitFeedback(payload)
        if (res.ok) {
            const n = (res.issue || '').split('/').pop()
            setNote('')
            closePanel()
            setToast(`sent #${n}`)
            setTimeout(() => setToast(null), 1800)
        } else {
            setStatus(`failed: ${res.err}`)
        }
    }

    const saveKey = () => {
        const v = keyInputRef.current ? keyInputRef.current.value : ''
        const stored = saveJonKey(v, window.localStorage)
        if (stored) {
            setKeySaved(true)
            if (keyInputRef.current) keyInputRef.current.value = ''
        }
    }

    // #886: typing a report mid-game must not cost lives — toggling the panel
    // toggles the game's own pause too (same synthetic '?' as the PAUSE button,
    // so open pauses and close resumes on every title that speaks '?').
    const toggle = () => {
        setOpen((v) => !v)
        dispatchPause()
    }

    if (!ready) return null

    const dark = theme === 'dark'
    const edge = dark ? 'border-white/30' : 'border-black/30'

    return (
        <>
            <button
                data-feedback="open"
                aria-label="Feedback"
                onClick={toggle}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(2.75rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}
            >
                FEEDBACK
            </button>
            {toast && (
                <div
                    data-feedback="toast"
                    className={`z-[75] fixed px-3 py-1.5 rounded-md border backdrop-blur-sm font-mono text-[10px] tracking-[0.2em] ${dark ? 'text-white border-white/25 bg-black/70' : 'text-black border-black/25 bg-white/80'}`}
                    style={{ top: 'calc(2.75rem + var(--sat, 0px))', left: 'calc(7rem + var(--sal, 0px))' }}
                >
                    {toast}
                </div>
            )}
            {open && (
                <div
                    ref={panelRef}
                    data-feedback="panel"
                    className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${dark ? 'text-white bg-zinc-950' : 'text-black bg-zinc-100'}`}
                >
                    <div className={`w-[min(24rem,92vw)] rounded-lg border p-4 ${dark ? 'border-white/25 bg-black/60' : 'border-black/25 bg-white/70'}`}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] tracking-[0.3em]">FEEDBACK</span>
                            <button
                                data-feedback="close"
                                aria-label="Close feedback"
                                onClick={closePanel}
                                className={`text-[10px] font-mono tracking-widest px-2 py-1 rounded border ${edge}`}
                            >
                                CLOSE
                            </button>
                        </div>
                        <textarea
                            data-feedback="note"
                            autoFocus
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What happened? (last 30s of input is attached)"
                            rows={4}
                            maxLength={2000}
                            className={`mt-3 w-full resize-none rounded border p-2 text-xs font-mono outline-none ${dark ? 'bg-black/40 border-white/20' : 'bg-black/5 border-black/20'}`}
                        />
                        <div className="mt-2 flex items-center gap-2">
                            {keySaved ? (
                                <span data-feedback="keystored" className="text-[10px] font-mono opacity-70">Jon key saved on this device</span>
                            ) : (
                                <>
                                    <input
                                        data-feedback="keyinput"
                                        ref={keyInputRef}
                                        type="password"
                                        placeholder="Jon key (optional)"
                                        className={`min-w-0 flex-1 rounded border px-2 py-1 text-[10px] font-mono outline-none ${dark ? 'bg-black/40 border-white/20' : 'bg-black/5 border-black/20'}`}
                                    />
                                    <button
                                        data-feedback="keysave"
                                        onClick={saveKey}
                                        className={`text-[10px] font-mono tracking-widest px-2 py-1 rounded border ${edge}`}
                                    >
                                        SAVE KEY
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                                data-feedback="send"
                                onClick={send}
                                disabled={!note.trim() || status === 'sending…'}
                                className={`text-[10px] font-mono tracking-widest px-2 py-1 rounded border ${edge} disabled:opacity-40`}
                            >
                                SEND
                            </button>
                            {status && <span className="text-[10px] font-mono opacity-70 truncate">{status}</span>}
                        </div>
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
            <RotateHint />
        </>
    )
}

export default GameChrome

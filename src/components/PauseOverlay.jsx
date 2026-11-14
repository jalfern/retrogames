import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { packPages } from '../utils/textFit'
import { audioController } from '../utils/AudioController.js'
import { WATCH_KEY, gameHasWatch } from '../utils/watch'

// #1099: the shared help screen must never overflow a phone. Blocks (title,
// description, each control row) are measured against the live viewport and
// packed into pages with packPages — desktop keeps the old single column;
// short screens flip pages with thumb-sized ‹ › buttons, swipe, or the
// arrow keys. The RESUME button stays pinned on every page.
const PauseOverlay = ({ game, badge, onResume }) => {
    const bodyRef = useRef(null)
    const mirrorRef = useRef(null)
    const touchRef = useRef(null)
    const [groups, setGroups] = useState(null)
    const [page, setPage] = useState(0)
    // hint starts on: it renders only while pages > 1, and the effect below
    // schedules its 3 s fade (no synchronous setState in an effect body).
    const [showHint, setShowHint] = useState(true)
    const prevPage = useRef(0)

    const controls = game?.controls || []
    const blocks = [
        <div key="t" className="text-4xl font-bold text-[#ff0000] drop-shadow-[2px_2px_0_rgba(255,255,255,0.5)] text-center">
            {game.label}
        </div>,
        ...(badge
            ? [<div key="b" className="text-lg text-[#ffd840] tracking-widest text-center">{badge}</div>]
            : []),
        ...(game.description
            ? [<div key="d" className="text-lg max-w-2xl text-center text-gray-300">{game.description}</div>]
            : []),
        ...(controls.length
            ? [
                <div key="ch" className="text-xl font-bold text-[#ffff00] border-b border-gray-700 pb-2 w-full max-w-md text-left">CONTROLS</div>,
                ...controls.map((control, i) => (
                    <div key={`c${i}`} className="flex items-center w-full max-w-md text-base text-gray-100 text-left">
                        <span className="text-[#00ff00] mr-2">▶</span>
                        {control}
                    </div>
                )),
                <div key="cq" className="flex items-center pt-2 border-t border-gray-800 text-gray-400 w-full max-w-md text-base text-left">
                    <span className="mr-2">?</span>
                    Toggle Help / Pause
                </div>,
            ]
            : []),
        // #1656 — Jon couldn't find the watch on his phone. The help screen is
        // where he looks, so watched titles get an action row here: resume,
        // then seat the watcher on the run that is already up (~180 ms lets
        // the unpause flush before KeyY lands).
        ...(gameHasWatch(game)
            ? [
                <button
                    key="watch"
                    data-watch-pause="1"
                    onClick={() => {
                        onResume()
                        const fire = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }))
                        setTimeout(() => {
                            fire('keydown', WATCH_KEY, 'y')
                            fire('keyup', WATCH_KEY, 'y')
                        }, 180)
                    }}
                    className="min-h-[44px] mt-2 px-6 py-2 rounded-full bg-emerald-500 border-2 border-emerald-200 text-white font-bold text-base tracking-wider"
                >
                    ▶ WATCH — PLAY IT FOR ME
                </button>,
            ]
            : []),
        // #1572 guidance tab: an optional, game-authored rules page (the
        // original cart's fold-out map/hint sheet). It rides the same paged
        // packing as controls and renders ONLY when a game registers a guide,
        // so every other help screen is byte-for-byte unchanged. Each line is
        // a string or { color, text } — color draws a small swatch glyph.
        ...(game?.guide?.length
            ? [
                <div key="gh" className="text-xl font-bold text-[#00ffff] border-b border-gray-700 pb-2 w-full max-w-md text-left pt-2">GUIDE</div>,
                ...game.guide.map((line, i) => {
                    const g = typeof line === 'string' ? { text: line } : line
                    return (
                        <div key={`g${i}`} className="flex items-start w-full max-w-md text-base text-gray-100 text-left">
                            {g.color
                                ? <span aria-hidden className="mr-2 mt-1 inline-block w-3 h-3 rounded-sm shrink-0 border border-white/40" style={{ background: g.color }} />
                                : <span className="text-[#ffff00] mr-2 mt-0.5">◆</span>}
                            <span>{g.text}</span>
                        </div>
                    )
                }),
            ]
            : []),
        // #1636: research write-up link, only for titles that register one.
        ...(game?.research
            ? [
                <Link
                    key="rs"
                    to={game.research}
                    data-research-link=""
                    className="text-base tracking-wider text-[#7de8ff] underline decoration-dotted underline-offset-4 pt-1"
                >
                    RESEARCH WRITE-UP →
                </Link>,
            ]
            : []),
    ]

    const measure = useCallback(() => {
        const body = bodyRef.current
        const mirror = mirrorRef.current
        if (!body || !mirror) return
        const avail = body.clientHeight - 12 // #2187: slack for CI-font reflow
        // (DejaVu wraps/measures a hair wider than the mirror's first pass —
        // packing to the last pixel clipped paged help on phones)
        const heights = Array.from(mirror.children).map((el) => el.getBoundingClientRect().height)
        const g = packPages(heights, avail, 8)
        setGroups(g)
        setPage((p) => Math.min(p, g.length - 1))
    }, [])

    useLayoutEffect(() => {
        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('orientationchange', measure)
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure)
        return () => {
            window.removeEventListener('resize', measure)
            window.removeEventListener('orientationchange', measure)
        }
    }, [measure])

    const pages = groups ? groups.length : 1
    const visible = groups
        ? (groups[Math.min(page, groups.length - 1)] || []).map((i) => blocks[i])
        : blocks

    useEffect(() => {
        if (pages <= 1) return undefined
        const onKey = (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); setPage((p) => Math.min(p + 1, pages - 1)) }
            if (e.key === 'ArrowLeft') { e.preventDefault(); setPage((p) => Math.max(p - 1, 0)) }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [pages])

    useEffect(() => {
        if (pages <= 1) return undefined
        const id = setTimeout(() => setShowHint(false), 3000)
        return () => clearTimeout(id)
    }, [pages])

    useEffect(() => {
        if (page !== prevPage.current) {
            prevPage.current = page
            audioController.playTone(440, 0.06, 'square', 0.04)
        }
    }, [page])

    const onPointerDown = (e) => { touchRef.current = e.clientX }
    const onPointerUp = (e) => {
        if (touchRef.current == null) return
        const dx = e.clientX - touchRef.current
        touchRef.current = null
        if (Math.abs(dx) < 48) return
        setPage((p) => Math.min(Math.max(p + (dx < 0 ? 1 : -1), 0), pages - 1))
    }

    return (
        <div
            data-help-fit={groups && groups.length > 1 ? 'paged' : 'single'}
            className="absolute inset-0 bg-black/80 flex flex-col items-center text-white z-50 p-6 font-mono overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
        >
            <div ref={mirrorRef} aria-hidden className="invisible absolute top-0 left-1/2 -translate-x-1/2 flex w-full max-w-2xl flex-col items-center gap-2">
                {blocks}
            </div>

            <div data-help-body="" ref={bodyRef} className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-2 overflow-hidden">
                {visible}
            </div>

            {pages > 1 && (
                <div className="flex flex-col items-center gap-1 mt-2">
                    {showHint && (
                        <div data-help-hint="" className="text-[10px] tracking-wider text-gray-400 animate-pulse">
                            swipe or use ‹ › to page
                        </div>
                    )}
                    <div className="flex items-center gap-4" data-help-pager="">
                        <button
                            data-help-prev=""
                            aria-label="Previous help page"
                            onClick={() => setPage((p) => Math.max(p - 1, 0))}
                            disabled={page === 0}
                            className="min-h-[44px] min-w-[44px] px-3 text-2xl border-2 border-white rounded-lg disabled:opacity-30"
                        >
                            ‹
                        </button>
                        <div className="flex items-center gap-1.5" data-help-dots="" aria-hidden>
                            {Array.from({ length: pages }, (_, i) => (
                                <span
                                    key={i}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === page ? 'bg-white' : 'bg-gray-600'}`}
                                />
                            ))}
                        </div>
                        <span data-help-page={`${page + 1}/${pages}`} className="text-sm tracking-[0.3em] text-gray-300">
                            {page + 1}/{pages}
                        </span>
                        <button
                            data-help-next=""
                            aria-label="Next help page"
                            onClick={() => setPage((p) => Math.min(p + 1, pages - 1))}
                            disabled={page === pages - 1}
                            className="min-h-[44px] min-w-[44px] px-3 text-2xl border-2 border-white rounded-lg disabled:opacity-30"
                        >
                            ›
                        </button>
                    </div>
                </div>
            )}

            <button
                onClick={onResume}
                className="mt-4 mb-1 px-8 py-3 bg-[#ff0000] text-white font-bold text-xl hover:bg-[#cc0000] transition-colors border-2 border-white animate-pulse"
            >
                RESUME GAME
            </button>

            <div className="text-sm text-gray-500 mb-1">
                Press '?' or click Resume to continue
            </div>
        </div>
    )
}

export default PauseOverlay

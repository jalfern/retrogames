import React, { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { dirsFrom } from './virtualDir'
import { PadContext } from './padContext'
import { padButton } from './gamepadMap'

const DIAG = {
    ul: ['ArrowUp', 'ArrowLeft'],
    ur: ['ArrowUp', 'ArrowRight'],
    dl: ['ArrowDown', 'ArrowLeft'],
    dr: ['ArrowDown', 'ArrowRight'],
}

const VirtualControls = ({ secondPad, secondAction: secondActionProp, visible = true, diag = false }) => {
    const [held, setHeld] = useState(() => new Set())
    const [diagKeysState, setDiagKeysState] = useState(() => new Set())

    const pad = useContext(PadContext)
    // An explicit secondAction prop still wins; otherwise read the game's `pad`
    // declaration from the registry (the single source of truth for step 2).
    const secondAction = secondActionProp || (pad ? padButton(pad) : null)

    const dPadRef = useRef(null)
    const actZoneRef = useRef(null)
    const dirCodes = useRef([])
    const actCode = useRef(null)
    const dPtr = useRef(null)
    const aPtr = useRef(null)
    const p2Codes = useRef(new Set())
    const diagCodes = useRef(new Set())
    const diagKeys = useRef(new Set())

    const fire = useCallback((code, type) => {
        window.dispatchEvent(new KeyboardEvent(type, {
            code,
            key: code === 'Space' ? ' ' : code,
            bubbles: true,
        }))
    }, [])

    const syncHeld = useCallback(() => {
        const s = new Set(dirCodes.current)
        if (actCode.current) s.add(actCode.current)
        for (const c of p2Codes.current) s.add(c)
        for (const c of diagCodes.current) s.add(c)
        setHeld(s)
    }, [])

    const setDirCodes = useCallback((codes) => {
        const prev = new Set(dirCodes.current)
        const next = new Set(codes)
        for (const c of prev) if (!next.has(c)) fire(c, 'keyup')
        for (const c of next) if (!prev.has(c)) fire(c, 'keydown')
        dirCodes.current = codes
        syncHeld()
    }, [fire, syncHeld])

    const setActCode = useCallback((code) => {
        const prev = actCode.current
        if (prev && prev !== code) fire(prev, 'keyup')
        if (code && code !== prev) fire(code, 'keydown')
        actCode.current = code
        syncHeld()
    }, [fire, syncHeld])

    const setP2Code = useCallback((code, down) => {
        if (!code) return
        if (down && !p2Codes.current.has(code)) {
            fire(code, 'keydown')
            p2Codes.current.add(code)
        } else if (!down && p2Codes.current.has(code)) {
            fire(code, 'keyup')
            p2Codes.current.delete(code)
        }
        syncHeld()
    }, [fire, syncHeld])

    const setDiagKey = useCallback((key, down) => {
        if (down) diagKeys.current.add(key)
        else diagKeys.current.delete(key)
        const newCodes = new Set()
        for (const k of diagKeys.current) {
            for (const c of DIAG[k]) newCodes.add(c)
        }
        const prev = diagCodes.current
        for (const c of prev) if (!newCodes.has(c)) fire(c, 'keyup')
        for (const c of newCodes) if (!prev.has(c)) fire(c, 'keydown')
        diagCodes.current = newCodes
        setDiagKeysState(new Set(diagKeys.current))
        syncHeld()
    }, [fire, syncHeld])

    const releaseAll = useCallback(() => {
        for (const c of dirCodes.current) fire(c, 'keyup')
        dirCodes.current = []
        if (actCode.current) { fire(actCode.current, 'keyup'); actCode.current = null }
        for (const c of p2Codes.current) fire(c, 'keyup')
        p2Codes.current = new Set()
        for (const c of diagCodes.current) fire(c, 'keyup')
        diagCodes.current = new Set()
        diagKeys.current = new Set()
        setDiagKeysState(new Set())
        dPtr.current = null
        aPtr.current = null
        syncHeld()
    }, [fire, syncHeld])

    useEffect(() => {
        const onBlur = () => releaseAll()
        const onVis = () => { if (document.hidden) releaseAll() }
        const onTC = () => releaseAll()
        window.addEventListener('blur', onBlur)
        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('touchcancel', onTC)
        return () => {
            window.removeEventListener('blur', onBlur)
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('touchcancel', onTC)
        }
    }, [releaseAll])

    if (!visible) return null

    // --- D-pad: single touch zone, 8-way ---
    const dDirs = (x, y) => {
        const r = dPadRef.current.getBoundingClientRect()
        return dirsFrom(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
    }
    const dStart = (x, y, id) => { dPtr.current = id; setDirCodes(dDirs(x, y)) }
    const dMove = (x, y, id) => { if (id === dPtr.current) setDirCodes(dDirs(x, y)) }
    const dEnd = (id) => { if (id === dPtr.current) { dPtr.current = null; setDirCodes([]) } }

    const dTS = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) if (dPtr.current === null) dStart(t.clientX, t.clientY, t.identifier)
    }
    const dTM = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) dMove(t.clientX, t.clientY, t.identifier)
    }
    const dTE = (e) => {
        for (const t of e.changedTouches) dEnd(t.identifier)
    }
    const dMD = (e) => { e.preventDefault(); if (dPtr.current === null) dStart(e.clientX, e.clientY, 'm') }
    const dMM = (e) => { dMove(e.clientX, e.clientY, 'm') }
    const dMU = () => { dEnd('m') }

    // --- Action zone: A/B one zone ---
    const aCodeAt = (x) => {
        if (!secondAction) return 'Space'
        const r = actZoneRef.current.getBoundingClientRect()
        return x < r.left + r.width / 2 ? 'Space' : secondAction.code
    }
    const aStart = (x, id) => { aPtr.current = id; setActCode(aCodeAt(x)) }
    const aMove = (x, id) => { if (id === aPtr.current) setActCode(aCodeAt(x)) }
    const aEnd = (id) => { if (id === aPtr.current) { aPtr.current = null; setActCode(null) } }

    const aTS = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) if (aPtr.current === null) aStart(t.clientX, t.identifier)
    }
    const aTM = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) aMove(t.clientX, t.identifier)
    }
    const aTE = (e) => {
        for (const t of e.changedTouches) aEnd(t.identifier)
    }
    const aMD = (e) => { e.preventDefault(); if (aPtr.current === null) aStart(e.clientX, 'm') }
    const aMM = (e) => { aMove(e.clientX, 'm') }
    const aMU = () => { aEnd('m') }

    // --- Second pad (2P, separate buttons) ---
    const p2Code = (k) => secondPad[k.slice(3)]
    const p2Bind = (key) => {
        const c = p2Code(key)
        return {
            onMouseDown: (e) => { e.preventDefault(); setP2Code(c, true) },
            onMouseUp: (e) => { e.preventDefault(); setP2Code(c, false) },
            onMouseLeave: () => setP2Code(c, false),
            onTouchStart: (e) => { e.preventDefault(); setP2Code(c, true) },
            onTouchEnd: (e) => { e.preventDefault(); setP2Code(c, false) },
        }
    }

    // --- Diag mode: 2x2 corner pad ---
    const diagBind = (key) => ({
        onMouseDown: (e) => { e.preventDefault(); setDiagKey(key, true) },
        onMouseUp: (e) => { e.preventDefault(); setDiagKey(key, false) },
        onMouseLeave: () => setDiagKey(key, false),
        onTouchStart: (e) => { e.preventDefault(); setDiagKey(key, true) },
        onTouchEnd: (e) => { e.preventDefault(); setDiagKey(key, false) },
    })

    const isHeld = (c) => held.has(c)

    const dBtnBase = 'w-12 h-12 rounded-lg flex items-center justify-center select-none backdrop-blur-sm border border-white/10 transition-colors'
    const dBtnCls = (c) => `${dBtnBase} ${isHeld(c) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`
    const actBase = 'w-14 h-14 rounded-full flex items-center justify-center select-none backdrop-blur-sm border border-white/10 shadow-lg transition-all'

    return (
        <div className="fixed bottom-8 left-0 right-0 px-8 flex justify-between items-end z-50 pointer-events-auto">
            {/* D-Pad */}
            {diag ? (
                <div className="grid grid-cols-2 gap-1">
                    {[['ul', '↖'], ['ur', '↗'], ['dl', '↙'], ['dr', '↘']].map(([k, sym]) => (
                        <button
                            key={k}
                            className={`${dBtnBase} ${diagKeysState.has(k) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`}
                            {...diagBind(k)}
                        >
                            <span className="text-white/80 font-bold text-lg">{sym}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div
                    ref={dPadRef}
                    className="relative w-[150px] h-[150px] touch-none"
                    onTouchStart={dTS}
                    onTouchMove={dTM}
                    onTouchEnd={dTE}
                    onMouseDown={dMD}
                    onMouseMove={dMM}
                    onMouseUp={dMU}
                    onMouseLeave={dMU}
                >
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowUp')}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowUp') ? 'text-white' : 'text-white/50'}>
                            <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                    </div>
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowDown')}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowDown') ? 'text-white' : 'text-white/50'}>
                            <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                    </div>
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowLeft')}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowLeft') ? 'text-white' : 'text-white/50'}>
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </div>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowRight')}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowRight') ? 'text-white' : 'text-white/50'}>
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-600/40 rounded-full" />
                </div>
            )}

            {/* Action Buttons (A/B one zone) */}
            <div
                ref={actZoneRef}
                className="flex items-end gap-2 pb-2 pr-4 touch-none"
                onTouchStart={aTS}
                onTouchMove={aTM}
                onTouchEnd={aTE}
                onMouseDown={aMD}
                onMouseMove={aMM}
                onMouseUp={aMU}
                onMouseLeave={aMU}
            >
                {secondAction && (
                    <div className={`${actBase} shadow-orange-900/20 ${isHeld(secondAction.code) ? 'bg-orange-400/90 scale-95' : 'bg-orange-500/50'}`}>
                        <span className="text-white font-bold text-lg">{secondAction.label || 'B'}</span>
                    </div>
                )}
                <div className={`${actBase} shadow-red-900/20 ${isHeld('Space') ? 'bg-red-400/90 scale-95' : 'bg-red-500/50'}`}>
                    <span className="text-white font-bold text-lg">A</span>
                </div>
            </div>

            {/* Second-player pad (local 2P titles) */}
            {secondPad && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-end gap-2 pointer-events-auto">
                    <button className={`w-10 h-10 rounded-lg flex items-center justify-center select-none backdrop-blur-sm border border-white/10 text-white/80 font-bold transition-colors ${isHeld(p2Code('left')) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`} {...p2Bind('left')}>◀</button>
                    <div className="flex flex-col gap-1">
                        <button className={`w-10 h-10 rounded-lg flex items-center justify-center select-none backdrop-blur-sm border border-white/10 text-white/80 font-bold transition-colors ${isHeld(p2Code('up')) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`} {...p2Bind('up')}>▲</button>
                        <button className={`w-10 h-10 rounded-lg flex items-center justify-center select-none backdrop-blur-sm border border-white/10 text-white/80 font-bold transition-colors ${isHeld(p2Code('down')) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`} {...p2Bind('down')}>▼</button>
                    </div>
                    <button className={`w-10 h-10 rounded-lg flex items-center justify-center select-none backdrop-blur-sm border border-white/10 text-white/80 font-bold transition-colors ${isHeld(p2Code('right')) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`} {...p2Bind('right')}>▶</button>
                    <button className={`w-14 h-14 rounded-full flex items-center justify-center select-none backdrop-blur-sm border border-white/10 shadow-lg shadow-sky-900/20 transition-all ${isHeld(p2Code('action')) ? 'bg-sky-400/90 scale-95' : 'bg-sky-500/50'}`} {...p2Bind('action')}>
                        <span className="text-white font-bold text-lg">J</span>
                    </button>
                </div>
            )}
        </div>
    )
}

export default VirtualControls

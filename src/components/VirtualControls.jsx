import React, { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { dirsFrom, stickVec, STICK_TRAVEL } from './virtualDir'
import { PadContext } from './padContext'
import { padButton, shouldUseStick } from './gamepadMap'
import { setStick, clearStick } from '../utils/padState'
import { methodOf, press, release, setStickVec, clearHeld } from '../utils/onePad'

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

    // #420 — the three input methods. A game that declares `method` writes THE
    // one pad (the held holder) instead of firing synthetic KeyboardEvents, and
    // gets: dpad → the fixed d-pad, stick → a fixed always-visible stick,
    // pointer → no stick at all (the canvas is the control surface, the game
    // owns its taps). Buttons show only the actions the game reads, labelled by
    // action. Games without `method` keep the legacy floating-stick / d-pad path.
    const method = methodOf(pad)
    const hasMethod = !!(pad && pad.method)
    const reads = (pad && Array.isArray(pad.reads)) ? pad.reads : []
    const mStick = hasMethod && method === 'stick'
    const mPointer = hasMethod && method === 'pointer'
    const showA = hasMethod ? reads.includes('a') : true
    const aLabel = (pad && pad.aLabel) || 'A'
    const toHolder = hasMethod

    // Step 1 (#384): the floating stick is the DEFAULT touch layout — it anchors
    // wherever the thumb lands on the left half and emits the same 8-way arrows.
    // A game keeps the fixed d-pad only by declaring layout 'dpad' — the grid- /
    // menu-driven titles, each carrying a one-line reason in its pad entry.
    const useStick = !hasMethod && shouldUseStick(pad)
    // Step 5 (#290, feel): the touch pad hides as soon as a keyboard or gamepad is
    // used, and comes back on the next touch.
    const [hidden, setHidden] = useState(false)

    const dPadRef = useRef(null)
    const actZoneRef = useRef(null)
    const dirCodes = useRef([])
    const actCode = useRef(null)
    const dPtr = useRef(null)
    const aPtr = useRef(null)
    const p2Codes = useRef(new Set())
    const diagCodes = useRef(new Set())
    const diagKeys = useRef(new Set())

    // Floating-stick state. The anchor is where the thumb first landed (viewport
    // coords); the knob offset is pushed straight to the DOM (no re-render per
    // touchmove) and the direction + analog vector are published on every move.
    const stickPtr = useRef(null)
    const stickAnchor = useRef(null)
    const knobRef = useRef(null)
    const [stickUI, setStickUI] = useState({ active: false, ax: 0, ay: 0 })

    // Fixed (always-visible) stick for `method: 'stick'` games (#420): the base
    // sits at a fixed spot and the thumb pushes it; the offset from the base
    // centre drives the analog x / y written straight to the one pad.
    const fsPtr = useRef(null)
    const fsKnobRef = useRef(null)
    const fsZoneRef = useRef(null)

    const fire = useCallback((code, type) => {
        window.dispatchEvent(new KeyboardEvent(type, {
            code,
            key: code === 'Space' ? ' ' : code,
            bubbles: true,
        }))
    }, [])

    const tick = useCallback(() => {
        try { if (navigator.vibrate) navigator.vibrate(8) } catch { /* no haptics */ }
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
        if (toHolder) {
            const field = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
            for (const c of prev) if (!next.has(c) && field[c]) release(field[c])
            for (const c of next) if (!prev.has(c) && field[c]) press(field[c])
        } else {
            for (const c of prev) if (!next.has(c)) fire(c, 'keyup')
            for (const c of next) if (!prev.has(c)) fire(c, 'keydown')
        }
        dirCodes.current = codes
        syncHeld()
    }, [toHolder, fire, syncHeld])

    const setActCode = useCallback((code) => {
        const prev = actCode.current
        const fieldOf = (c) => (c === 'Space' ? 'a' : (secondAction ? 'b' : null))
        if (toHolder) {
            const pf = fieldOf(prev), nf = fieldOf(code)
            if (pf && pf !== nf) release(pf)
            if (nf && nf !== pf) press(nf)
        } else {
            if (prev && prev !== code) fire(prev, 'keyup')
            if (code && code !== prev) fire(code, 'keydown')
        }
        actCode.current = code
        syncHeld()
    }, [toHolder, secondAction, fire, syncHeld])

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
        stickPtr.current = null
        stickAnchor.current = null
        fsPtr.current = null
        if (fsKnobRef.current) fsKnobRef.current.style.transform = 'translate(-50%, -50%)'
        clearStick()
        clearHeld()
        setStickUI({ active: false, ax: 0, ay: 0 })
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

    // Step 5 (feel): hide on real keyboard input or gamepad activity, show on touch.
    useEffect(() => {
        const onKey = (e) => { if (e.isTrusted && e.type === 'keydown') setHidden(true) }
        const onPad = () => setHidden(true)
        const onShow = () => setHidden(false)
        window.addEventListener('keydown', onKey)
        window.addEventListener('retrogames:pad-active', onPad)
        window.addEventListener('touchstart', onShow, { passive: true })
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('retrogames:pad-active', onPad)
            window.removeEventListener('touchstart', onShow)
        }
    }, [])

    if (!visible || hidden) return null

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

    // --- Floating stick: anchor on touch in the left half, knob follows clamped ---
    const sUpdate = (cx, cy) => {
        const a = stickAnchor.current
        if (!a) return
        const v = stickVec(cx - a.x, cy - a.y)
        if (knobRef.current) knobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
        setDirCodes(dirsFrom(v.px, v.py))
        setStick(v.x, v.y, v.push, v.engaged)
    }
    const sStart = (cx, cy, id) => {
        if (stickPtr.current !== null) return
        stickPtr.current = id
        stickAnchor.current = { x: cx, y: cy }
        setStickUI({ active: true, ax: cx, ay: cy })
        sUpdate(cx, cy)
    }
    const sMove = (cx, cy, id) => { if (id === stickPtr.current) sUpdate(cx, cy) }
    const sEnd = (id) => {
        if (id !== stickPtr.current) return
        stickPtr.current = null
        stickAnchor.current = null
        setStickUI({ active: false, ax: 0, ay: 0 })
        setDirCodes([])
        clearStick()
    }
    const sTS = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) if (stickPtr.current === null) sStart(t.clientX, t.clientY, t.identifier)
    }
    const sTM = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) sMove(t.clientX, t.clientY, t.identifier)
    }
    const sTE = (e) => {
        for (const t of e.changedTouches) sEnd(t.identifier)
    }
    const sMD = (e) => { e.preventDefault(); if (stickPtr.current === null) sStart(e.clientX, e.clientY, 'm') }
    const sMM = (e) => { sMove(e.clientX, e.clientY, 'm') }
    const sMU = () => { sEnd('m') }

    // --- Fixed stick: base at a fixed spot, the thumb pushes it (#420) ---
    // Always visible; the offset from the base centre drives the analog x / y
    // written straight to the one pad (plus the coarse digital read through the
    // same shared quantizer every other analog source uses).
    const fsCenter = () => {
        const r = fsZoneRef.current.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const fsUpdate = (cx, cy) => {
        const c = fsCenter()
        const v = stickVec(cx - c.x, cy - c.y)
        if (fsKnobRef.current) fsKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
        setStickVec(v.x, v.y)
        setDirCodes(dirsFrom(v.px, v.py))
    }
    const fsStart = (cx, cy, id) => { if (fsPtr.current !== null) return; fsPtr.current = id; fsUpdate(cx, cy) }
    const fsMove = (cx, cy, id) => { if (id === fsPtr.current) fsUpdate(cx, cy) }
    const fsEnd = (id) => {
        if (id !== fsPtr.current) return
        fsPtr.current = null
        setStickVec(0, 0)
        setDirCodes([])
        if (fsKnobRef.current) fsKnobRef.current.style.transform = 'translate(-50%, -50%)'
    }
    const fsTS = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (fsPtr.current === null) fsStart(t.clientX, t.clientY, t.identifier) }
    const fsTM = (e) => { e.preventDefault(); for (const t of e.changedTouches) fsMove(t.clientX, t.clientY, t.identifier) }
    const fsTE = (e) => { for (const t of e.changedTouches) fsEnd(t.identifier) }
    const fsMD = (e) => { e.preventDefault(); if (fsPtr.current === null) fsStart(e.clientX, e.clientY, 'm') }
    const fsMM = (e) => { fsMove(e.clientX, e.clientY, 'm') }
    const fsMU = () => { fsEnd('m') }

    // --- Action zone: A/B one zone ---
    const aCodeAt = (x) => {
        const hasB = !!secondAction
        if (showA && hasB) {
            const r = actZoneRef.current.getBoundingClientRect()
            return x < r.left + r.width / 2 ? 'Space' : secondAction.code
        }
        if (hasB) return secondAction.code
        return 'Space'
    }
    const aStart = (x, id) => { aPtr.current = id; tick(); setActCode(aCodeAt(x)) }
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

    const stickZone = useStick && (
        <div
            className="fixed left-0 top-0 bottom-0 w-1/2 z-40 touch-none"
            style={{ pointerEvents: 'auto' }}
            onTouchStart={sTS}
            onTouchMove={sTM}
            onTouchEnd={sTE}
            onTouchCancel={sTE}
            onMouseDown={sMD}
            onMouseMove={sMM}
            onMouseUp={sMU}
        >
            {stickUI.active && (
                <div className="absolute" style={{ left: stickUI.ax, top: stickUI.ay, width: 0, height: 0 }}>
                    <div
                        className="absolute rounded-full border-2 border-white/25 bg-white/5"
                        style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2, transform: 'translate(-50%, -50%)' }}
                    />
                    <div
                        ref={knobRef}
                        className="absolute rounded-full bg-white/70 border border-white/40 shadow-lg"
                        style={{ width: 54, height: 54, transform: 'translate(-50%, -50%)' }}
                    />
                </div>
            )}
        </div>
    )

    return (
        <>
            {stickZone}
            <div
                className="fixed left-0 right-0 flex justify-between items-end z-50 pointer-events-auto"
                style={{ bottom: 'calc(2rem + env(safe-area-inset-bottom))', padding: '0 calc(2rem + env(safe-area-inset-right)) 0 calc(2rem + env(safe-area-inset-left))' }}
            >
                {/* Left control: fixed stick (method stick), nothing (pointer —
                    the canvas is the surface), floating-stick spacer, fixed
                    d-pad (method dpad) or the legacy d-pad / 2x2 diag pad */}
                {mStick ? (
                    <div
                        ref={fsZoneRef}
                        className="relative w-[150px] h-[150px] touch-none"
                        onTouchStart={fsTS}
                        onTouchMove={fsTM}
                        onTouchEnd={fsTE}
                        onTouchCancel={fsTE}
                        onMouseDown={fsMD}
                        onMouseMove={fsMM}
                        onMouseUp={fsMU}
                        onMouseLeave={fsMU}
                    >
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25 bg-white/5"
                            style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2 }}
                        />
                        <div
                            ref={fsKnobRef}
                            className="absolute top-1/2 left-1/2 rounded-full bg-white/70 border border-white/40 shadow-lg"
                            style={{ width: 54, height: 54, transform: 'translate(-50%, -50%)' }}
                        />
                    </div>
                ) : mPointer ? (
                    <div className="w-2" />
                ) : useStick ? (
                    <div className="w-24" />
                ) : diag ? (
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

                {/* Action Buttons: only the actions the game reads, by name */}
                {(showA || secondAction) ? (
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
                        {showA && (
                            <div className={`${actBase} shadow-red-900/20 ${isHeld('Space') ? 'bg-red-400/90 scale-95' : 'bg-red-500/50'}`}>
                                <span className="text-white font-bold text-lg">{aLabel}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-2" />
                )}

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
        </>
    )
}

export default VirtualControls

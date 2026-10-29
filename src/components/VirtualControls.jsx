import React, { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { dirsFrom, stickVec, STICK_TRAVEL, dpadDirs } from './virtualDir'
import { PadContext } from './padContext'
import { padButton, shouldUseStick, waysOf, faceLayout } from './gamepadMap'
import { setStick, clearStick } from '../utils/padState'
import { methodOf, press, release, setStickVec, clearHeld } from '../utils/onePad'
import { actionCodeAt } from './actionHit'
import { vpadSize } from './vpadSize'

const DIAG = {
    ul: ['ArrowUp', 'ArrowLeft'],
    ur: ['ArrowUp', 'ArrowRight'],
    dl: ['ArrowDown', 'ArrowLeft'],
    dr: ['ArrowDown', 'ArrowRight'],
}

// #885: the "glass" face-button icons — a short glyph above the verb, the
// Apple/Xbox Cloud look. Inline SVG so there are still zero pad assets.
const ICON_F = 0.36 // icon size as a fraction of the button diameter

const IconFire = ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c1.2 4.2-3 5.4-3 9a3 3 0 0 0 6 0c0-1.8-1-3-1-3 2 1.2 4 3.8 4 6.4A6.4 6.4 0 0 1 5.6 14c0-5.4 5.4-7.4 6.4-12z" />
    </svg>
)
const IconBolt = ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2 4.5 13.5H10L9 22l8.5-11.5H12L13 2z" />
    </svg>
)

// #439: how far (px) a touch must travel before it is a swipe that sets a
// direction. Below this a touch is a tap (tap-to-start keeps its own meaning).
const SWIPE_MIN = 24

const VirtualControls = ({ secondPad, secondAction: secondActionProp, visible = true, diag = false, skin = null }) => {
    const [held, setHeld] = useState(() => new Set())
    const [diagKeysState, setDiagKeysState] = useState(() => new Set())

    const pad = useContext(PadContext)
    // #420 — the three input methods. A game that declares `method` writes THE
    // one pad (the held holder) instead of firing synthetic KeyboardEvents, and
    // gets: dpad → the fixed d-pad, stick → a fixed always-visible stick,
    // pointer → no stick at all (the canvas is the control surface, the game
    // owns its taps). Buttons show only the actions the game reads, labelled by
    // action. Games without `method` keep the legacy floating-stick / d-pad path.
    const method = methodOf(pad)
    const hasMethod = !!(pad && pad.method)
    const mStick = hasMethod && method === 'stick'
    const mPointer = hasMethod && method === 'pointer'
    // #906: the face-button law lives in faceLayout (pure, vpadcheck-pinned):
    // `reads` restricts the pad to the verbs the game hears, labels are verbs.
    const face = faceLayout(pad)
    const showA = face.showA
    const aLabel = face.aLabel
    // An explicit secondAction prop still wins; otherwise read the game's `pad`
    // declaration from the registry (the single source of truth for step 2).
    // A game that declares reads without 'b' hides B even if the prop is passed.
    const secondAction = face.showB ? (secondActionProp || padButton(pad)) : null
    const toHolder = hasMethod

    // Step 1 (#384): the floating stick is the DEFAULT touch layout — it anchors
    // wherever the thumb lands on the left half and emits the same 8-way arrows.
    // A game keeps the fixed d-pad only by declaring layout 'dpad' — the grid- /
    // menu-driven titles, each carrying a one-line reason in its pad entry.
    const useStick = !hasMethod && shouldUseStick(pad)

    // #439: a dpad title that declares `ways` (4 | 8) gets the diamond-gate
    // stick — the arcade restrictor gate (thumb slides freely, output snaps to
    // the dominant axis with hysteresis) — plus swipe-on-the-playfield. A dpad
    // title that declares none keeps the legacy 8-way cross d-pad, so the
    // migration is per-title and cannot regress a game that has not opted in.
    const ways = waysOf(pad)
    const mDpadGate = hasMethod && method === 'dpad' && !!ways
    // #735: the pad scales with the screen (vpadSize law) — re-derived on
    // resize / orientation change, so iPad and iPhone and both orientations
    // each get their own size from the same pure law.
    const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
    useEffect(() => {
        const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', onR)
        window.addEventListener('orientationchange', onR)
        return () => {
            window.removeEventListener('resize', onR)
            window.removeEventListener('orientationchange', onR)
        }
    }, [])
    const sz = vpadSize(vp.w, vp.h)
    // Step 5 (#290, feel): the touch pad hides as soon as a keyboard or gamepad is
    // used, and comes back on the next touch.
    const [hidden, setHidden] = useState(false)

    const dPadRef = useRef(null)
    const actZoneRef = useRef(null)
    const aBtnRef = useRef(null)
    const bBtnRef = useRef(null)
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

    // #439 diamond-gate stick: the base zone, the sliding knob, the hysteresis
    // memory (last dominant axis) and the last engaged direction — the latter
    // is what a 4-way game keeps held after the thumb lifts (the buffered turn).
    const dgZoneRef = useRef(null)
    const dgKnobRef = useRef(null)
    const dgPtr = useRef(null)
    const dgHyst = useRef({})
    const dgLast = useRef([])
    // #439 swipe-on-the-playfield: the active swipe id, its start point, and a
    // hysteresis memory of its own (a swipe and a stick push are two sources).
    const swPtr = useRef(null)
    const swStart = useRef(null)
    const swHyst = useRef({})

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
        dgPtr.current = null
        dgLast.current = []
        if (dgKnobRef.current) dgKnobRef.current.style.transform = 'translate(-50%, -50%)'
        swPtr.current = null
        swStart.current = null
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
            clearHeld()
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

    // --- Diamond-gate 4/8-way stick (#439): the arcade restrictor gate ---
    // The thumb slides freely in the base; the knob clamps to the travel circle
    // and the analog x / y are written straight to the one pad (like the fixed
    // stick). The DIGITAL direction, though, comes from the shared dpadDirs
    // quantizer: the dominant axis with ±15-degree hysteresis near the diagonal
    // (4-way) or the nearest sector (8-way). Newest direction wins — every move
    // re-derives from the current offset.
    const dgCenter = () => {
        const r = dgZoneRef.current.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const dgUpdate = (cx, cy) => {
        const c = dgCenter()
        const ox = cx - c.x, oy = cy - c.y
        const v = stickVec(ox, oy)
        if (dgKnobRef.current) dgKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
        setStickVec(v.x, v.y)
        const codes = dpadDirs(ox, oy, ways, dgHyst.current)
        dgLast.current = codes
        setDirCodes(codes)
    }
    const dgStart = (cx, cy, id) => { if (dgPtr.current !== null) return; dgPtr.current = id; dgUpdate(cx, cy) }
    const dgMove = (cx, cy, id) => { if (id === dgPtr.current) dgUpdate(cx, cy) }
    const dgEnd = (id) => {
        if (id !== dgPtr.current) return
        dgPtr.current = null
        setStickVec(0, 0)
        if (dgKnobRef.current) dgKnobRef.current.style.transform = 'translate(-50%, -50%)'
        // Buffered turn: a 4-way cabinet sticks to the last pushed direction —
        // keep it held after the thumb lifts so an early flick lands on the next
        // opening. An 8-way stick clears when you let go.
        if (ways === 4) setDirCodes(dgLast.current)
        else setDirCodes([])
    }
    const dgTS = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (dgPtr.current === null) dgStart(t.clientX, t.clientY, t.identifier) }
    const dgTM = (e) => { e.preventDefault(); for (const t of e.changedTouches) dgMove(t.clientX, t.clientY, t.identifier) }
    const dgTE = (e) => { for (const t of e.changedTouches) dgEnd(t.identifier) }
    const dgMD = (e) => { e.preventDefault(); if (dgPtr.current === null) dgStart(e.clientX, e.clientY, 'm') }
    const dgMM = (e) => { dgMove(e.clientX, e.clientY, 'm') }
    const dgMU = () => { dgEnd('m') }

    // --- Swipe anywhere on the play field (#439) ---
    // A second, coexisting input surface for diamond-gate titles (the official
    // PAC-MAN app offers swipe and joystick modes; no settings toggle). A touch
    // that travels past SWIPE_MIN sets the dominant direction through the SAME
    // dpadDirs quantizer; a stationary touch is left alone (tap-to-start keeps
    // working — the layer is NOT [data-vc] and does not preventDefault on start).
    const swUpdate = (cx, cy) => {
        const s = swStart.current
        if (!s) return
        const ox = cx - s.x, oy = cy - s.y
        if (Math.hypot(ox, oy) < SWIPE_MIN) return
        const v = stickVec(ox, oy)
        setStickVec(v.x, v.y)
        setDirCodes(dpadDirs(ox, oy, ways, swHyst.current))
    }
    const swTS = (e) => {
        for (const t of e.changedTouches) if (swPtr.current === null) {
            swPtr.current = t.identifier
            swStart.current = { x: t.clientX, y: t.clientY }
        }
    }
    const swTM = (e) => {
        for (const t of e.changedTouches) if (t.identifier === swPtr.current) swUpdate(t.clientX, t.clientY)
    }
    const swTE = (e) => {
        for (const t of e.changedTouches) if (t.identifier === swPtr.current) {
            swPtr.current = null
            swStart.current = null
            setStickVec(0, 0)
            if (ways === 4) setDirCodes(dirCodes.current)  // keep the buffered turn
            else setDirCodes([])
        }
    }

    // --- Action zone: A/B one zone ---
    // #734: the hit test follows the DRAWN layout — each button tests its own
    // rect (B left, A right) — so a button and its action can never be swapped.
    const aCodeAt = (x, y) => actionCodeAt({
        showA,
        bCode: secondAction && secondAction.code,
        aRect: aBtnRef.current && aBtnRef.current.getBoundingClientRect(),
        bRect: bBtnRef.current && bBtnRef.current.getBoundingClientRect(),
        zoneRect: actZoneRef.current.getBoundingClientRect(),
    }, x, y)
    const aStart = (x, y, id) => { aPtr.current = id; tick(); setActCode(aCodeAt(x, y)) }
    const aMove = (x, y, id) => { if (id === aPtr.current) setActCode(aCodeAt(x, y)) }
    const aEnd = (id) => { if (id === aPtr.current) { aPtr.current = null; setActCode(null) } }

    const aTS = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) if (aPtr.current === null) aStart(t.clientX, t.clientY, t.identifier)
    }
    const aTM = (e) => {
        e.preventDefault()
        for (const t of e.changedTouches) aMove(t.clientX, t.clientY, t.identifier)
    }
    const aTE = (e) => {
        for (const t of e.changedTouches) aEnd(t.identifier)
    }
    const aMD = (e) => { e.preventDefault(); if (aPtr.current === null) aStart(e.clientX, e.clientY, 'm') }
    const aMM = (e) => { aMove(e.clientX, e.clientY, 'm') }
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

    // #885 "glass" skin (Apple / Xbox Cloud reference): thin bright ring, faint
    // fill with an inner top highlight, and a pressed state that sinks + brightens
    // then fades back (transition). `skin` is the themed-skin hook (#885): games
    // will pass their own (arcade cabinet etc.) — the default stays glass.
    const skinId = skin || 'glass'
    const glass = 'select-none backdrop-blur-md border border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.35),0_4px_12px_rgba(0,0,0,0.45)] transition-all duration-150'
    const dBtnBase = `rounded-2xl flex items-center justify-center ring-1 ${glass}`
    const dBtnCls = (c) => `${dBtnBase} ${isHeld(c) ? 'bg-white/30 ring-white/90 scale-95 brightness-150' : 'bg-white/10 ring-white/50'}`
    const actBase = `relative flex flex-col items-center justify-center gap-0.5 rounded-full ring-1 ${glass}`
    const armStyle = { width: sz.arm, height: sz.arm }
    const btnStyle = { width: sz.btn, height: sz.btn }

    const stickZone = useStick && (
        <div
            data-vc="stick"
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
                        className="absolute rounded-full border-2 border-white/40 bg-white/5 shadow-[inset_0_0_14px_rgba(255,255,255,0.12)]"
                        style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2, transform: 'translate(-50%, -50%)' }}
                    />
                    <div
                        ref={knobRef}
                        className="absolute rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]"
                        style={{ width: 54, height: 54, transform: 'translate(-50%, -50%)' }}
                    />
                </div>
            )}
        </div>
    )

    return (
        <>
            {/* #439: swipe-on-the-playfield for diamond-gate titles. A second
                input surface that sits BEHIND every piece of chrome (z-40 < the
                z-50 bar / z-60 corner buttons) but above the canvas. It is NOT
                [data-vc] and does not preventDefault on start, so a plain tap
                still reaches the shell's tap-to-start (the synthesized Space). */}
            {mDpadGate ? (
                <div
                    className="fixed inset-0 z-40 touch-none select-none"
                    style={{ pointerEvents: 'auto' }}
                    onTouchStart={swTS}
                    onTouchMove={swTM}
                    onTouchEnd={swTE}
                    onTouchCancel={swTE}
                />
            ) : null}
            {stickZone}
            <div
                data-vc="1"
                data-skin={skinId}
                className="fixed left-0 right-0 flex justify-between items-end z-50 pointer-events-auto select-none"
                style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom))', padding: '0 calc(0.75rem + env(safe-area-inset-right)) 0 calc(0.75rem + env(safe-area-inset-left))' }}
            >
                {/* Left control: fixed stick (method stick), nothing (pointer —
                    the canvas is the surface), floating-stick spacer, fixed
                    d-pad (method dpad) or the legacy d-pad / 2x2 diag pad */}
                {mStick ? (
                    <div
                        data-vc="fixedstick"
                        ref={fsZoneRef}
                        className="relative touch-none select-none"
                        style={{ width: sz.stick, height: sz.stick }}
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
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 bg-white/5 shadow-[inset_0_0_14px_rgba(255,255,255,0.12)]"
                            style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2 }}
                        />
                        <div
                            ref={fsKnobRef}
                            className="absolute top-1/2 left-1/2 rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]"
                            style={{ width: sz.knob, height: sz.knob, transform: 'translate(-50%, -50%)' }}
                        />
                    </div>
                ) : mPointer ? (
                    <div className="w-2" />
                ) : useStick ? (
                    <div style={{ width: sz.stick }} />
                ) : diag ? (
                    <div data-vc="diag" className="grid grid-cols-2 gap-1">
                        {[['ul', '↖'], ['ur', '↗'], ['dl', '↙'], ['dr', '↘']].map(([k, sym]) => (
                            <button
                                key={k}
                                style={armStyle}
                                className={`${dBtnBase} ${diagKeysState.has(k) ? 'bg-neutral-600/90' : 'bg-neutral-700/50'}`}
                                {...diagBind(k)}
                            >
                                <span className="text-white/80 font-bold text-lg">{sym}</span>
                            </button>
                        ))}
                    </div>
                ) : mDpadGate ? (
                    <div
                        data-vc="dpadgate"
                        ref={dgZoneRef}
                        className="relative touch-none select-none"
                        style={{ width: sz.stick, height: sz.stick }}
                        onTouchStart={dgTS}
                        onTouchMove={dgTM}
                        onTouchEnd={dgTE}
                        onTouchCancel={dgTE}
                        onMouseDown={dgMD}
                        onMouseMove={dgMM}
                        onMouseUp={dgMU}
                        onMouseLeave={dgMU}
                    >
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 bg-white/5 shadow-[inset_0_0_14px_rgba(255,255,255,0.12)]"
                            style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2 }}
                        />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-600/40 rounded-full" />
                        <div
                            ref={dgKnobRef}
                            className="absolute top-1/2 left-1/2 rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]"
                            style={{ width: sz.knob, height: sz.knob, transform: 'translate(-50%, -50%)' }}
                        />
                    </div>
                ) : (
                    <div
                        data-vc="dpad"
                        ref={dPadRef}
                        className="relative touch-none select-none"
                        style={{ width: sz.stick, height: sz.stick }}
                        onTouchStart={dTS}
                        onTouchMove={dTM}
                        onTouchEnd={dTE}
                        onMouseDown={dMD}
                        onMouseMove={dMM}
                        onMouseUp={dMU}
                        onMouseLeave={dMU}
                    >
                        {/* #1221: one clean cross. The arms are rectangles that
                            meet at the centre (up/down = full-height bar, left/
                            right = full-width bar) so the pad reads as ONE
                            d-pad: no corner overlap, no stray centre dot that
                            read as "a second stick". The touch zone is the whole
                            box (dPadRef + dirsFrom), so the arms are visuals. */}
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowUp')}`} style={{ width: sz.arm, height: sz.stick / 2 }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowUp') ? 'text-white' : 'text-white/60'}>
                                <path d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                        </div>
                        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowDown')}`} style={{ width: sz.arm, height: sz.stick / 2 }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowDown') ? 'text-white' : 'text-white/60'}>
                                <path d="M12 5v14M19 12l-7 7-7-7" />
                            </svg>
                        </div>
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowLeft')}`} style={{ width: sz.stick / 2, height: sz.arm }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowLeft') ? 'text-white' : 'text-white/60'}>
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowRight')}`} style={{ width: sz.stick / 2, height: sz.arm }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isHeld('ArrowRight') ? 'text-white' : 'text-white/60'}>
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* Action Buttons: only the actions the game reads, by name.
                    #735: the zone is data-vc="actzone" (vpadboot's stable
                    selector) and its gap/padding scale with the pad (sz). */}
                {(showA || secondAction) ? (
                    <div
                        data-vc="actzone"
                        ref={actZoneRef}
                        className="flex items-end touch-none select-none"
                        style={{ gap: sz.gap, paddingBottom: Math.round(sz.gap * 0.5), paddingRight: Math.round(sz.gap * 0.5) }}
                        onTouchStart={aTS}
                        onTouchMove={aTM}
                        onTouchEnd={aTE}
                        onMouseDown={aMD}
                        onMouseMove={aMM}
                        onMouseUp={aMU}
                        onMouseLeave={aMU}
                    >
                        {secondAction && (
                            <div ref={bBtnRef} data-vc="b" data-key={secondAction.code} style={btnStyle} className={`${actBase} ${isHeld(secondAction.code) ? 'bg-orange-400/40 ring-white/90 scale-95 brightness-150' : 'bg-orange-500/25 ring-white/60'}`}>
                                <span className="text-white/90">{<IconBolt s={Math.round(sz.btn * ICON_F)} />}</span>
                                <span className="text-white font-bold leading-none" style={{ fontSize: sz.font((secondAction.label || 'B').length) }}>{secondAction.label || 'B'}</span>
                            </div>
                        )}
                        {showA && (
                            <div ref={aBtnRef} data-vc="a" data-key="Space" style={btnStyle} className={`${actBase} ${isHeld('Space') ? 'bg-red-400/40 ring-white/90 scale-95 brightness-150' : 'bg-red-500/25 ring-white/60'}`}>
                                <span className="text-white/90">{<IconFire s={Math.round(sz.btn * ICON_F)} />}</span>
                                <span className="text-white font-bold leading-none" style={{ fontSize: sz.font(aLabel.length) }}>{aLabel}</span>
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

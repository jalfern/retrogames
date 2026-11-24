import React, { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { dirsFrom, stickVec, STICK_TRAVEL, dpadDirs } from './virtualDir'
import { PadContext } from './padContext'
import { padButton, shouldUseStick, waysOf, faceLayout } from './gamepadMap'
import { setStick, clearStick } from '../utils/padState'
import { methodOf, press, release, setStickVec, clearHeld } from '../utils/onePad'
import { actionCodeAt } from './actionHit'
import { vpadSize } from './vpadSize'
import { currentPadType, tiltVec, tiltDeadZoned, tiltDirs } from './padTypes'

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

const VirtualControls = ({ secondPad, secondAction: secondActionProp, thirdAction = null, visible = true, diag = false, skin = null }) => {
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
    // #3108 — the active CONTROLLER TYPE. The route store (padTypes) resolves
    // default → saved choice → ?padtype override; switching in the pause menu
    // fires 'retrogames:padtype' and the pad re-renders live. The type only
    // decides WHAT IS DRAWN and which sensor moves the vector — direction,
    // analog and button codes ride the exact same paths as before, so games,
    // recordings and model slots see no difference between types.
    const [ptype, setPtype] = useState(() => currentPadType(pad))
    useEffect(() => {
        const on = () => setPtype(currentPadType(pad))
        window.addEventListener('retrogames:padtype', on)
        return () => window.removeEventListener('retrogames:padtype', on)
    }, [pad])
    const tStick = ptype === 'stick'
    const tDpad = ptype === 'dpad'
    const tFull = ptype === 'full'
    const tPointer = ptype === 'pointer'
    const tTilt = ptype === 'tilt'
    // Which shape each type renders for THIS game (defaults reproduce today's
    // behaviour byte-for-byte: method 'stick' → fixed stick, method 'dpad' +
    // ways → the #439 gate, legacy stick → the floating half, legacy dpad →
    // the cross). A switch simply moves the game along these existing rails.
    const gateMode = mDpadGate && tDpad
    const crossMode = tDpad && !gateMode
    const fixedStickMode = tStick && mStick
    // A dpad-method game switched to STICK gets the floating half too — the
    // same quantizer as the gate (floatWays), so a 4-way maze keeps its law.
    const floatWays = hasMethod && method === 'dpad' ? (ways || 4) : 0
    const floatMode = tStick && !fixedStickMode && !mPointer && (useStick || floatWays > 0)
    const pointerMode = tPointer
    const floatWaysRef = useRef(floatWays)
    useEffect(() => { floatWaysRef.current = floatWays }, [floatWays])
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
    const cBtnRef = useRef(null)
    const cPtr = useRef(null)
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

    // #2057: a live push must SURVIVE the viewport moving. On Safari the visual
    // viewport shifts under a held thumb (keyboard, toolbar collapse, rotation),
    // and on a viewport resize nothing used to re-publish the stick — a game
    // could keep a stale direction or lose the knob. Each stick source now
    // remembers its finger's last viewport position, and every viewport move
    // (resize / orientationchange / visualViewport scroll+resize) re-derives
    // direction + analog from finger-vs-anchor: the held push carries through
    // and the knob stays mounted.
    const stickLast = useRef(null)
    const fsLast = useRef(null)
    const dgFinger = useRef(null)
    const swLast = useRef(null)

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

    // #3108 hooks (declared before the early return — hooks run every render).
    // Floating stick quantizer memory for dpad games switched to STICK; the
    // full-pad extras (each with its own pointer) + left stick; tilt state.
    const floatHyst = useRef({})
    const floatLast = useRef([])
    const exPtrs = useRef({})
    const [exHeld, setExHeld] = useState(() => new Set())
    const fzZoneRef = useRef(null)
    const fzKnobRef = useRef(null)
    const fzPtr = useRef(null)
    const fzLast = useRef(null)
    const [tiltOn, setTiltOn] = useState(false)
    const tiltBase = useRef({ b: 0, g: 0 })
    const tiltSeen = useRef({ b: 0, g: 0 })

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
        if (thirdAction && cPtr.current !== null) s.add(thirdAction.code)
        for (const c of p2Codes.current) s.add(c)
        for (const c of diagCodes.current) s.add(c)
        setHeld(s)
    }, [thirdAction])

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
        if (cPtr.current !== null) {
            cPtr.current = null
            if (thirdAction) fire(thirdAction.code, 'keyup')
        }
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
        stickLast.current = null // #2057
        fsPtr.current = null
        fsLast.current = null // #2057
        if (fsKnobRef.current) fsKnobRef.current.style.transform = 'translate(-50%, -50%)'
        dgPtr.current = null
        dgFinger.current = null // #2057
        dgLast.current = []
        if (dgKnobRef.current) dgKnobRef.current.style.transform = 'translate(-50%, -50%)'
        swPtr.current = null
        swStart.current = null
        swLast.current = null // #2057
        // #3108: full-pad extras + left stick release with everything else.
        for (const code of Object.keys(exPtrs.current)) {
            if (exPtrs.current[code] != null) fire(code, 'keyup')
        }
        exPtrs.current = {}
        setExHeld(new Set())
        fzPtr.current = null
        fzLast.current = null // #2057
        if (fzKnobRef.current) fzKnobRef.current.style.transform = 'translate(-50%, -50%)'
        clearStick()
        clearHeld()
        setStickUI({ active: false, ax: 0, ay: 0 })
        syncHeld()
    }, [fire, syncHeld, thirdAction])

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

    // #2057 — stick survival: when the viewport MOVES under a live push (resize,
    // rotation, Safari's keyboard/toolbar shifting the visual viewport), re-derive
    // direction + analog from finger-vs-anchor and re-publish. Before this, a
    // viewport move mid-drag could leave a stale direction (no further touchmove
    // is guaranteed after the shift) and the knob could vanish with the touch the
    // browser stole. Each source (floating, fixed, gate, swipe) revives from its
    // remembered finger position — the push carries through the viewport move.
    const waysRef = useRef(ways)
    useEffect(() => { waysRef.current = ways }, [ways])
    useEffect(() => {
        const revive = () => {
            const l = stickLast.current
            if (stickPtr.current !== null && l && stickAnchor.current) {
                const v = stickVec(l.x - stickAnchor.current.x, l.y - stickAnchor.current.y)
                if (knobRef.current) knobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
                if (floatWaysRef.current) {
                    const codes = dpadDirs(l.x - stickAnchor.current.x, l.y - stickAnchor.current.y, floatWaysRef.current, floatHyst.current)
                    floatLast.current = codes
                    setDirCodes(codes)
                } else {
                    setDirCodes(dirsFrom(v.px, v.py))
                }
                setStick(v.x, v.y, v.push, v.engaged)
            }
            const fz = fzLast.current // #3108 full-pad left stick
            if (fzPtr.current !== null && fz && fzZoneRef.current) {
                const r = fzZoneRef.current.getBoundingClientRect()
                const v = stickVec(fz.x - (r.left + r.width / 2), fz.y - (r.top + r.height / 2))
                if (fzKnobRef.current) fzKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
                setStickVec(v.x, v.y)
                setStick(v.x, v.y, v.push, v.engaged)
                setDirCodes(dirsFrom(v.px, v.py))
            }
            const f = fsLast.current
            if (fsPtr.current !== null && f && fsZoneRef.current) {
                const r = fsZoneRef.current.getBoundingClientRect()
                const v = stickVec(f.x - (r.left + r.width / 2), f.y - (r.top + r.height / 2))
                if (fsKnobRef.current) fsKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
                setStickVec(v.x, v.y)
                setDirCodes(dirsFrom(v.px, v.py))
            }
            const d = dgFinger.current
            if (dgPtr.current !== null && d && dgZoneRef.current) {
                const r = dgZoneRef.current.getBoundingClientRect()
                const ox = d.x - (r.left + r.width / 2), oy = d.y - (r.top + r.height / 2)
                const v = stickVec(ox, oy)
                if (dgKnobRef.current) dgKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
                setStickVec(v.x, v.y)
                const codes = dpadDirs(ox, oy, waysRef.current, dgHyst.current)
                dgLast.current = codes
                setDirCodes(codes)
            }
            const s = swLast.current
            if (swPtr.current !== null && s && swStart.current) {
                const ox = s.x - swStart.current.x, oy = s.y - swStart.current.y
                if (Math.hypot(ox, oy) >= SWIPE_MIN) {
                    const v = stickVec(ox, oy)
                    setStickVec(v.x, v.y)
                    setDirCodes(dpadDirs(ox, oy, waysRef.current, swHyst.current))
                }
            }
        }
        window.addEventListener('resize', revive)
        window.addEventListener('orientationchange', revive)
        const vv = window.visualViewport
        if (vv) {
            vv.addEventListener('scroll', revive)
            vv.addEventListener('resize', revive)
        }
        return () => {
            window.removeEventListener('resize', revive)
            window.removeEventListener('orientationchange', revive)
            if (vv) {
                vv.removeEventListener('scroll', revive)
                vv.removeEventListener('resize', revive)
            }
        }
    }, [setDirCodes])

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

    // #3108 TILT listener: while the game runs in TILT and the player has
    // ENABLED motion, every deviceorientation sample drives the same stick
    // pipeline — screen-rotated vector → radial dead zone (#431) → setStick /
    // setStickVec + the dirsFrom quantizer. The baseline re-captures on
    // rotation, and every output goes to zero on unmount/disable. Hooks live
    // above the early return.
    useEffect(() => {
        if (!tTilt || !tiltOn) return undefined
        const onOri = (e) => {
            tiltSeen.current = { b: e.beta || 0, g: e.gamma || 0 }
            const angle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0
            const v = tiltDeadZoned(tiltVec(e.beta || 0, e.gamma || 0, angle, tiltBase.current.b, tiltBase.current.g))
            if (toHolder) setStickVec(v.x, v.y)
            setStick(v.x, v.y, v.mag, v.mag > 0)
            setDirCodes(dirsFrom(tiltDirs(v.x), tiltDirs(v.y)))
        }
        const onRot = () => { tiltBase.current = { ...tiltSeen.current } }
        window.addEventListener('deviceorientation', onOri)
        window.addEventListener('orientationchange', onRot)
        return () => {
            window.removeEventListener('deviceorientation', onOri)
            window.removeEventListener('orientationchange', onRot)
            setStickVec(0, 0)
            clearStick()
            setDirCodes([])
        }
    }, [tTilt, tiltOn, toHolder, setDirCodes])

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
    // #3108: for a dpad-method game switched to STICK (floatWays > 0) the
    // digital output runs through the SAME dpadDirs quantizer as the diamond
    // gate (dominant axis + hysteresis, buffered turn on 4-way) — only the
    // anchor moves, the law does not.
    const sUpdate = (cx, cy) => {
        const a = stickAnchor.current
        if (!a) return
        stickLast.current = { x: cx, y: cy } // #2057
        const v = stickVec(cx - a.x, cy - a.y)
        if (knobRef.current) knobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
        if (floatWays) {
            const codes = dpadDirs(cx - a.x, cy - a.y, floatWays, floatHyst.current)
            floatLast.current = codes
            setDirCodes(codes)
        } else {
            setDirCodes(dirsFrom(v.px, v.py))
        }
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
        stickLast.current = null // #2057
        setStickUI({ active: false, ax: 0, ay: 0 })
        // A 4-way cabinet keeps the buffered turn (the #439 law, both shapes).
        setDirCodes(floatWays === 4 ? floatLast.current : [])
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
        fsLast.current = { x: cx, y: cy } // #2057
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
        fsLast.current = null // #2057
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
        dgFinger.current = { x: cx, y: cy } // #2057
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
        dgFinger.current = null // #2057
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
        swLast.current = { x: cx, y: cy } // #2057
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
            swLast.current = null // #2057
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

    // --- Third action (#2324): one held button beside (never inside) the
    // actzone. The actzone is a single-pointer hit-test zone pinned by
    // vpadcheck; C rides its own pointer and the same synthesized keydown/
    // keyup contract the actzone uses, so a game reaches a third held code
    // (PRINCE OF PERSIA's Shift grab) without touching that law. Synthetic
    // events are isTrusted:false — holding C never trips the hide-on-keyboard.
    const cDown = (id) => {
        if (!thirdAction || cPtr.current !== null) return
        cPtr.current = id
        tick()
        fire(thirdAction.code, 'keydown')
        syncHeld()
    }
    const cUp = () => {
        if (cPtr.current === null) return
        cPtr.current = null
        if (thirdAction) fire(thirdAction.code, 'keyup')
        syncHeld()
    }
    const cTS = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (cPtr.current === null) cDown(t.identifier) }
    const cTE = (e) => { for (const t of e.changedTouches) if (t.identifier === cPtr.current) cUp() }
    const cMD = (e) => { e.preventDefault(); cDown('m') }
    const cMU = () => { cUp() }

    // --- #3108 extras: shoulder / diamond buttons, each with its own pointer.
    // The actzone law (#2324) pins ONE pointer per zone; the full pad's extra
    // buttons ride separate pointers so shoulder-plus-face combos work, and
    // they fire the game's DECLARED codes exactly like the third action does.
    // (Refs/state declared up top, before the early return.)
    const exDown = (code, id) => {
        if (!code || exPtrs.current[code] != null) return
        exPtrs.current[code] = id
        tick()
        fire(code, 'keydown')
        setExHeld((s) => new Set(s).add(code))
    }
    const exUp = (code) => {
        if (exPtrs.current[code] == null) return
        exPtrs.current[code] = null
        fire(code, 'keyup')
        setExHeld((s) => { const n = new Set(s); n.delete(code); return n })
    }
    const exBind = (code) => ({
        onTouchStart: (e) => { e.preventDefault(); for (const t of e.changedTouches) if (exPtrs.current[code] == null) exDown(code, t.identifier) },
        onTouchEnd: (e) => { for (const t of e.changedTouches) if (t.identifier === exPtrs.current[code]) exUp(code) },
        onTouchCancel: (e) => { for (const t of e.changedTouches) if (t.identifier === exPtrs.current[code]) exUp(code) },
        onMouseDown: (e) => { e.preventDefault(); exDown(code, 'm') },
        onMouseUp: () => exUp(code),
        onMouseLeave: () => exUp(code),
    })

    // --- #3108 full-pad left stick: a fixed base, Sony position (inboard of
    // the d-pad). Same analog pipeline as the fixed stick (#420), but it also
    // publishes padState so legacy titles (SSX) read the depth, and quantizes
    // the digital read through dirsFrom — one pad, every type.
    // (Refs declared up top, before the early return.)
    const fzCenter = () => {
        const r = fzZoneRef.current.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const fzUpdate = (cx, cy) => {
        const c = fzCenter()
        fzLast.current = { x: cx, y: cy } // #2057
        const v = stickVec(cx - c.x, cy - c.y)
        if (fzKnobRef.current) fzKnobRef.current.style.transform = `translate(-50%, -50%) translate(${v.px}px, ${v.py}px)`
        if (toHolder) setStickVec(v.x, v.y)
        setStick(v.x, v.y, v.push, v.engaged)
        setDirCodes(dirsFrom(v.px, v.py))
    }
    const fzEnd = () => {
        fzPtr.current = null
        fzLast.current = null
        setStickVec(0, 0)
        clearStick()
        setDirCodes([])
        if (fzKnobRef.current) fzKnobRef.current.style.transform = 'translate(-50%, -50%)'
    }
    const fzTS = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (fzPtr.current === null) { fzPtr.current = t.identifier; fzUpdate(t.clientX, t.clientY) } }
    const fzTM = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === fzPtr.current) fzUpdate(t.clientX, t.clientY) }
    const fzTE = (e) => { for (const t of e.changedTouches) if (t.identifier === fzPtr.current) fzEnd() }
    const fzMD = (e) => { e.preventDefault(); if (fzPtr.current === null) { fzPtr.current = 'm'; fzUpdate(e.clientX, e.clientY) } }
    const fzMM = (e) => { if (fzPtr.current === 'm') fzUpdate(e.clientX, e.clientY) }
    const fzMU = () => { if (fzPtr.current === 'm') fzEnd() }

    // --- #3108 TILT: phone motion as the analog vector. One explicit ENABLE
    // tap first (iOS requires a user gesture for the motion permission, and
    // the tap makes consent honest on every platform), then deviceorientation
    // drives the SAME stick pipeline: screen-rotated vector → radial dead zone
    // → setStick/setStickVec + dirsFrom quantizer. RE-CENTER pins the pose in
    // the player's hands as neutral. (State/refs + the listener effect live
    // above the early return — hooks run every render.)
    const enableTilt = () => {
        const DOE = window.DeviceOrientationEvent
        if (DOE && typeof DOE.requestPermission === 'function') {
            DOE.requestPermission().then((s) => setTiltOn(s === 'granted')).catch(() => setTiltOn(false))
        } else {
            setTiltOn(true)
        }
    }
    const recenterTilt = () => { tiltBase.current = { ...tiltSeen.current } }

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

    // #3108 FULL PAD geometry — Sony proportions: compact d-pad hard left, its
    // stick inboard and lower, the face diamond right, shoulders/triggers above
    // each cluster, and the middle left clear. One glass family (skin) at
    // reduced scales, so the controller reads as ONE device, not spare parts.
    const dFull = Math.round(sz.stick * 0.78)
    const armFull = Math.round(dFull * 0.36)
    const btnFull = Math.round(sz.btn * 0.74)
    const byIdx = (i) => ((pad && pad.buttons) || []).find((b) => b.pad === i) || null
    const fxL = byIdx(2) // □ slot (left of the diamond)
    const fxT = byIdx(3) // △ slot (top)
    const shL = byIdx(4) // L1
    const shR = byIdx(5) // R1
    const shL2 = byIdx(6) // L2
    const shR2 = byIdx(7) // R2
    const diamond = tFull && !!(fxL || fxT)
    // The POSITION carries the PlayStation glyph, so □/△/○/✕ prefixes in labels
    // are stripped — what's left is what the button DOES in this game (#906 law).
    const verbOf = (label) => (label || '').replace(/^[□△○✕×]\s*/, '')
    const chipCls = (code, tintOn, tintOff) => `rounded-xl px-2 flex items-center justify-center ring-1 ${glass} ${exHeld.has(code) ? `${tintOn} ring-white/90 scale-95 brightness-150` : `${tintOff} ring-white/50`}`
    const shChip = (b) => (
        <div
            key={b.code + b.label}
            data-vc="sh"
            data-key={b.code}
            style={{ minWidth: Math.round(sz.btn * 0.72), height: Math.round(sz.btn * 0.44) }}
            className={`${chipCls(b.code, 'bg-sky-400/40', 'bg-sky-500/25')} touch-none`}
            {...exBind(b.code)}
        >
            <span className="text-white font-bold leading-none" style={{ fontSize: sz.font(verbOf(b.label).length) }}>{verbOf(b.label)}</span>
        </div>
    )
    const fxBtn = (b, col, row, tintOn, tintOff) => (
        <div
            key={b.code + col}
            data-vc="fx"
            data-key={b.code}
            style={{ gridColumn: col, gridRow: row, width: btnFull, height: btnFull }}
            className={`${chipCls(b.code, tintOn, tintOff).replace('rounded-xl', 'rounded-full')} touch-none`}
            {...exBind(b.code)}
        >
            <span className="text-white font-bold leading-none" style={{ fontSize: sz.font(verbOf(b.label).length) }}>{verbOf(b.label)}</span>
        </div>
    )

    // #3108 TILT widget: one honest ENABLE tap (iOS motion permission lives
    // here), then RE-CENTER pins the pose in the player's hands as neutral.
    const tiltPill = 'rounded-full px-3 py-2 ring-1 text-white font-bold ring-1 ' + glass
    const tiltWidget = (
        <div className="flex flex-col items-center gap-1 select-none pb-1">
            {tiltOn ? (
                <button data-vc="tilt-recenter" className={`${tiltPill} bg-emerald-500/30`} onClick={recenterTilt}>RE-CENTER</button>
            ) : (
                <button data-vc="tilt-enable" className={`${tiltPill} bg-emerald-500/50`} onClick={enableTilt}>ENABLE TILT</button>
            )}
            <span className="text-white/50 leading-none" style={{ fontSize: 10 }}>{tiltOn ? 'TILT ON · RE-CENTER TO RESET' : 'PHONE MOTION STEERS'}</span>
        </div>
    )

    // #3108 full-pad left cluster: shoulders above the compact d-pad (same
    // whole-box 8-way zone law, #1221 cross visuals), the stick inboard and
    // lower — exactly where a DualShock puts them under two thumbs.
    const arrowSvg = (d, on) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={on ? 'text-white' : 'text-white/60'}>
            <path d={d} />
        </svg>
    )
    const fullLeft = (
        <div className="flex items-end select-none" style={{ gap: sz.gap }}>
            <div className="flex flex-col items-center gap-1">
                {(shL2 || shL) ? (
                    <div className="flex items-end" style={{ gap: sz.gap }}>{shL2 && shChip(shL2)}{shL && shChip(shL)}</div>
                ) : null}
                <div
                    data-vc="dpad"
                    ref={dPadRef}
                    className="relative touch-none select-none"
                    style={{ width: dFull, height: dFull }}
                    onTouchStart={dTS}
                    onTouchMove={dTM}
                    onTouchEnd={dTE}
                    onMouseDown={dMD}
                    onMouseMove={dMM}
                    onMouseUp={dMU}
                    onMouseLeave={dMU}
                >
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowUp')}`} style={{ width: armFull, height: dFull / 2 }}>{arrowSvg('M12 19V5M5 12l7-7 7 7', isHeld('ArrowUp'))}</div>
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${dBtnCls('ArrowDown')}`} style={{ width: armFull, height: dFull / 2 }}>{arrowSvg('M12 5v14M19 12l-7 7-7-7', isHeld('ArrowDown'))}</div>
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowLeft')}`} style={{ width: dFull / 2, height: armFull }}>{arrowSvg('M19 12H5M12 19l-7-7 7-7', isHeld('ArrowLeft'))}</div>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${dBtnCls('ArrowRight')}`} style={{ width: dFull / 2, height: armFull }}>{arrowSvg('M5 12h14M12 5l7 7-7 7', isHeld('ArrowRight'))}</div>
                </div>
            </div>
            <div
                data-vc="fixedstick"
                ref={fzZoneRef}
                className="relative touch-none select-none"
                style={{ width: sz.stick, height: sz.stick }}
                onTouchStart={fzTS}
                onTouchMove={fzTM}
                onTouchEnd={fzTE}
                onTouchCancel={fzTE}
                onMouseDown={fzMD}
                onMouseMove={fzMM}
                onMouseUp={fzMU}
                onMouseLeave={fzMU}
            >
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 bg-white/5 shadow-[inset_0_0_14px_rgba(255,255,255,0.12)]"
                    style={{ width: STICK_TRAVEL * 2, height: STICK_TRAVEL * 2 }}
                />
                <div
                    ref={fzKnobRef}
                    className="absolute top-1/2 left-1/2 rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]"
                    style={{ width: sz.knob, height: sz.knob, transform: 'translate(-50%, -50%)' }}
                />
            </div>
        </div>
    )

    const stickZone = floatMode && (
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
            {gateMode ? (
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
                {/* Left control, by CONTROLLER TYPE (#3108): pointer — nothing
                    (the canvas is the surface); tilt — enable/re-centre pill;
                    full — Sony cluster; stick — fixed stick (method) or a
                    spacer while the floating half does the work; dpad — the
                    gate (ways), the cross, or Q*BERT's diag pad. */}
                {pointerMode ? (
                    <div className="w-2" />
                ) : tTilt ? (
                    tiltWidget
                ) : tFull ? (
                    fullLeft
                ) : fixedStickMode ? (
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
                ) : gateMode ? (
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
                ) : crossMode ? (
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
                ) : floatMode ? (
                    <div style={{ width: sz.stick }} />
                ) : (
                    <div className="w-2" />
                )}

                {/* Action Buttons: only the actions the game reads, by name.
                    The zone is data-vc actzone (vpadcheck/vpadboot's stable
                    selector) and its gap/padding scale with the pad (sz).
                    #2324: thirdAction renders a held button BESIDE the actzone
                    (never inside — the zone's single-pointer hit-test is
                    vpadcheck-pinned). A game that does not pass the prop
                    renders this subtree byte-for-byte as before. */}
                {/* #3108 FULL PAD right cluster: R shoulders above the face
                    diamond (△ top, □ left, ○ right, ✕ bottom — the DualShock
                    order the game's pad: indexes declare), every button its own
                    pointer so shoulder+face combos work. Only buttons the game
                    declares are drawn; verbs keep their labels (#906). */}
                {diamond ? (
                    <div className="flex flex-col items-end select-none" style={{ gap: sz.gap }}>
                        {(shR || shR2) ? (
                            <div className="flex items-end" style={{ gap: sz.gap }}>{shR && shChip(shR)}{shR2 && shChip(shR2)}</div>
                        ) : null}
                        <div
                            data-vc="facediamond"
                            className="grid items-center justify-items-center"
                            style={{ gridTemplateColumns: `repeat(3, ${btnFull}px)`, gridTemplateRows: `repeat(3, ${btnFull}px)` }}
                        >
                            {fxT && fxBtn(fxT, 2, 1, 'bg-white/30', 'bg-white/10')}
                            {fxL && fxBtn(fxL, 1, 2, 'bg-white/30', 'bg-white/10')}
                            {secondAction && (
                                <div
                                    data-vc="b"
                                    data-key={secondAction.code}
                                    style={{ gridColumn: 3, gridRow: 2, width: btnFull, height: btnFull }}
                                    className={`${chipCls(secondAction.code, 'bg-orange-400/40', 'bg-orange-500/25').replace('rounded-xl', 'rounded-full')} touch-none`}
                                    {...exBind(secondAction.code)}
                                >
                                    <span className="text-white font-bold leading-none" style={{ fontSize: sz.font(verbOf(secondAction.label || 'B').length) }}>{verbOf(secondAction.label || 'B')}</span>
                                </div>
                            )}
                            {showA && (
                                <div
                                    data-vc="a"
                                    data-key="Space"
                                    style={{ gridColumn: 2, gridRow: 3, width: btnFull, height: btnFull }}
                                    className={`${chipCls('Space', 'bg-red-400/40', 'bg-red-500/25').replace('rounded-xl', 'rounded-full')} touch-none`}
                                    {...exBind('Space')}
                                >
                                    <span className="text-white font-bold leading-none" style={{ fontSize: sz.font(aLabel.length) }}>{aLabel}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : thirdAction ? (
                    <div className="flex items-end select-none" style={{ gap: sz.gap }}>
                        <div
                            ref={cBtnRef}
                            data-vc="c"
                            data-key={thirdAction.code}
                            style={btnStyle}
                            className={`${actBase} touch-none ${isHeld(thirdAction.code) ? 'bg-sky-400/40 ring-white/90 scale-95 brightness-150' : 'bg-sky-500/25 ring-white/60'}`}
                            onTouchStart={cTS}
                            onTouchEnd={cTE}
                            onTouchCancel={cTE}
                            onMouseDown={cMD}
                            onMouseUp={cMU}
                            onMouseLeave={cMU}
                        >
                            <span className="text-white font-bold leading-none" style={{ fontSize: sz.font((thirdAction.label || 'C').length) }}>{thirdAction.label || 'C'}</span>
                        </div>
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
                        ) : null}
                    </div>
                ) : (showA || secondAction) ? (
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

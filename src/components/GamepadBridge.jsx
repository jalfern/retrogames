import { useEffect } from 'react'
import { gamepadToCodes, stickFromAxes, triggersFromPad, slotFieldsFrom } from './gamepadMap'
import { setStick, setRight, clearPad } from '../utils/padState'
import { setStickVec, setConnected, connectedSlots, pressSlot, releaseSlot, setStickVecSlot, clearAllSlots } from '../utils/onePad'

// Gamepad bridge: polls navigator.getGamepads() every frame and dispatches the
// same KeyboardEvents VirtualControls does, so every game that reads keyboard
// codes also gets a physical pad. Mounted once per game in GameRoute (App.jsx).
//
// Browsers only expose a pad after its first button press; getGamepads() reads
// as null until then. The bridge tracks the first connected pad and releases
// every held key on blur, tab-hide or pad disconnect.
//
// #492 — EVERY connected pad drives a player slot. Pad 1 keeps the keyboard-
// event path above (that is player 1: keys, touch and the first pad all funnel
// into the one held pad). Pad N (N >= 2) writes its buttons and stick into
// slot N's held pad (onePad slot layer) with its own stick hysteresis, and
// multiplayer games read it with slotPad(N, method). When the online count
// changes the bridge publishes `retrogames:pads { count }` so a game can flip
// to its two-player mode the moment a second pad wakes up.
const GamepadBridge = ({ secondAction }) => {
    useEffect(() => {
        const supported = typeof navigator !== 'undefined' && 'getGamepads' in navigator
        if (!supported) return undefined

        const held = new Set()
        const stickState = { engaged: false, lastCodes: [] }
        const slotStates = new Map()

        const keyFor = (code) => (code === 'Space' ? ' ' : code === 'Question' ? '?' : code)
        const fire = (code, type) => {
            window.dispatchEvent(new KeyboardEvent(type, { code, key: keyFor(code), bubbles: true }))
        }
        const sync = (next) => {
            for (const c of held) if (!next.has(c)) fire(c, 'keyup')
            for (const c of next) if (!held.has(c)) fire(c, 'keydown')
            held.clear()
            for (const c of next) held.add(c)
        }
        const releaseAll = () => {
            for (const c of held) fire(c, 'keyup')
            held.clear()
            stickState.engaged = false
            stickState.lastCodes = []
            clearPad()
            setStickVec(0, 0)
        }
        const writeSlot = (slotN, f) => {
            for (const k of ['left', 'right', 'up', 'down', 'a', 'b', 'start']) {
                if (f[k]) pressSlot(slotN, k)
                else releaseSlot(slotN, k)
            }
            setStickVecSlot(slotN, f.x, f.y)
        }

        let raf = 0
        let padActive = false
        let lastCount = connectedSlots()
        const poll = () => {
            raf = requestAnimationFrame(poll)
            const pads = navigator.getGamepads()
            const live = []
            if (pads) for (const p of pads) if (p && p.connected) live.push(p)
            const count = setConnected(live.length)
            if (count !== lastCount) {
                lastCount = count
                window.dispatchEvent(new CustomEvent('retrogames:pads', { detail: { count } }))
            }
            const pad = live[0]
            if (!pad) return
            const { codes, state } = gamepadToCodes(pad, { secondAction }, stickState)
            Object.assign(stickState, state)
            sync(codes)
            // Analog channel (#290 step 4): publish both sticks + the triggers so
            // games that opt in with pad.analog read them. The digital arrows the
            // stick also emits above are the coarser read of the same axes.
            const left = stickFromAxes([pad.axes && pad.axes[0], pad.axes && pad.axes[1]])
            const right = stickFromAxes([pad.axes && pad.axes[2], pad.axes && pad.axes[3]])
            const trig = triggersFromPad(pad)
            setStick(left.x, left.y, left.push, left.engaged)
            setStickVec(left.x, left.y) // #420: the left stick also feeds THE one pad
            setRight(right.x, right.y, trig.rt, trig.lt)
            // Signal the touch pad to hide the moment a gamepad is used (#290 step 5).
            const active = codes.size > 0
            if (active && !padActive) {
                padActive = true
                window.dispatchEvent(new CustomEvent('retrogames:pad-active'))
            } else if (!active) {
                padActive = false
            }
            // #492: player 2+ — every pad past the first drives its own slot.
            for (let i = 1; i < live.length; i++) {
                const slotN = i + 1
                let st = slotStates.get(slotN)
                if (!st) { st = { engaged: false, lastCodes: [] }; slotStates.set(slotN, st) }
                const r = slotFieldsFrom(live[i], st)
                slotStates.set(slotN, r.state)
                writeSlot(slotN, r.fields)
            }
        }

        const onDisconnect = () => releaseAll()
        const onBlur = () => releaseAll()
        const onVis = () => { if (document.hidden) releaseAll() }

        raf = requestAnimationFrame(poll)
        window.addEventListener('blur', onBlur)
        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('gamepaddisconnect', onDisconnect)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('blur', onBlur)
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('gamepaddisconnect', onDisconnect)
            releaseAll()
            clearAllSlots()
        }
    }, [secondAction])

    return null
}

export default GamepadBridge

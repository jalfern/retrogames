// #3108 — controller types. Jon's reference is the Sony PS Remote Play
// overlay on iPhone: a full translucent controller, switchable layouts, and
// nothing covering the centre of the picture. This module is the whole
// decision layer — WHICH type a game shows — and it is pure (no DOM, no
// React) so the harness can pin it in plain Node, same law as virtualDir.
//
// Five types:
//   dpad     fixed d-pad (the diamond gate when the game declares ways)
//   stick    analog stick (floating, or the fixed stick for method 'stick')
//   full     Sony layout: d-pad + left stick inboard, face diamond right,
//            shoulders above the clusters — all at once, centre clear
//   pointer  no directional pad at all — the canvas is the control surface
//   tilt     phone motion as the analog vector + face buttons (iOS gets an
//            explicit ENABLE TILT permission tap; both get RE-CENTER)
//
// Every type feeds the SAME one pad: the arrows ride setDirCodes (keyboard
// codes for legacy titles, holder fields for method titles), analog rides
// setStick/setStickVec, buttons fire their declared codes. Games, recordings
// and model slots see no difference between types — the type only decides
// what is DRAWN and which sensor moves the vector.

import { shouldUseStick } from './gamepadMap'
import { STICK_TRAVEL } from './virtualDir'

export const PAD_TYPES = ['dpad', 'stick', 'full', 'pointer', 'tilt']

export const PAD_TYPE_LABELS = {
    dpad: 'D-PAD',
    stick: 'STICK',
    full: 'FULL PAD',
    pointer: 'POINTER',
    tilt: 'TILT',
}

// The default type is DERIVED from the declaration a game already carries —
// method (#420), then legacy layout (#384) — so a game that has not opted
// into switching keeps its current pad byte-for-byte. An explicit pad.type
// (only honoured when it is a real type) overrides the derivation.
export function defaultTypeFor(pad) {
    const m = pad && pad.method
    if (m === 'pointer') return 'pointer'
    if (m === 'stick') return 'stick'
    if (m === 'dpad') return 'dpad'
    return shouldUseStick(pad) ? 'stick' : 'dpad'
}

// What the player may choose: the default is always in, plus every valid
// entry of pad.supports (in order, deduped). A game that declares nothing
// supports exactly one type — and then the pause menu shows no switch row.
export function typesFor(pad) {
    const explicit = pad && PAD_TYPES.includes(pad.type) ? pad.type : defaultTypeFor(pad)
    const out = [explicit]
    const raw = pad && Array.isArray(pad.supports) ? pad.supports : []
    for (const t of raw) if (PAD_TYPES.includes(t) && !out.includes(t)) out.push(t)
    return out
}

// Resolve the saved choice: valid + supported wins, else the default.
export function resolveType(pad, saved, urlOverride = null) {
    const ok = typesFor(pad)
    if (urlOverride && ok.includes(urlOverride)) return urlOverride
    if (saved && ok.includes(saved)) return saved
    return ok[0]
}

// --- persistence ------------------------------------------------------------
// One dotted key per game, same naming family as the per-game stores
// ('galaga.board', 'simcitymin.best'…). Private mode must never throw.
const KEY = (id) => `retrogames:padtype:${id}`

export function readSaved(id) {
    try { return localStorage.getItem(KEY(id)) } catch { return null }
}
export function writeSaved(id, type) {
    try { localStorage.setItem(KEY(id), type) } catch { /* private mode */ }
}
// ?padtype=full — QA/shot override, wins over storage for this page load.
export function urlPadType() {
    try { return new URLSearchParams(window.location.search).get('padtype') } catch { return null }
}

// --- live store ---------------------------------------------------------------
// The route configures the current game once; VirtualControls reads it and
// subscribes to the switch event, PauseOverlay writes it. Kept here (not in
// React state) so the two components stay decoupled and the event contract is
// one line: window CustomEvent 'retrogames:padtype' with { detail: { type } }.
let cfg = null // { id, pad }

export function configurePadTypes(id, pad) {
    cfg = { id, pad }
    // The route effect runs AFTER the pad's first render — re-fire the switch
    // event so a choice saved from a previous visit applies on a fresh load
    // (without this, the pad renders the default and only updates on switch).
    window.dispatchEvent(new CustomEvent('retrogames:padtype', { detail: { type: currentPadType(pad) } }))
}
export function padTypeConfig() {
    return cfg
}

// Resolve the type to draw for `pad` (the pad from context; when the route
// store holds the same declaration, its game id supplies the saved choice).
export function currentPadType(pad) {
    const p = pad || (cfg && cfg.pad) || null
    const id = cfg && (!pad || pad === cfg.pad) ? cfg.id : null
    return resolveType(p, id ? readSaved(id) : null, urlPadType())
}

export function setPadType(pad, type) {
    const id = cfg && (!pad || pad === cfg.pad) ? cfg.id : null
    const t = resolveType(pad, type, urlPadType())
    if (id) writeSaved(id, t)
    window.dispatchEvent(new CustomEvent('retrogames:padtype', { detail: { type: t } }))
    return t
}

// --- tilt (pure part) ---------------------------------------------------------
// DeviceOrientation gives beta (front/back) and gamma (left/right) in degrees
// about the DEVICE; the game wants them about the SCREEN. Rotating the delta
// pair by the screen angle maps each orientation onto one steering axis and
// one throttle axis: portrait steers on gamma, landscape steers on beta —
// with re-centre the baseline is wherever the player last held the phone.
export const TILT_MAX_DEG = 14 // tilt that reaches full deflection
export const TILT_DEAD = 0.12 // same radial dead zone as padState

export function tiltVec(beta, gamma, angleDeg, refBeta, refGamma, max = TILT_MAX_DEG) {
    const rad = ((angleDeg || 0) * Math.PI) / 180
    const gx = gamma - (refGamma || 0)
    const by = beta - (refBeta || 0)
    // Rotating the delta pair by the screen angle puts left/right-on-screen
    // in x for BOTH orientations: portrait steers on gamma (roll the phone
    // right → +x); landscape-left steers on −beta (tip the screen's right
    // edge down → +x), which is the same physical roll felt as the same steer.
    let x = (gx * Math.cos(rad) - by * Math.sin(rad)) / max
    let y = (gx * Math.sin(rad) + by * Math.cos(rad)) / max
    let m = Math.hypot(x, y)
    if (m > 1) { x /= m; y /= m; m = 1 }
    return { x, y, mag: m }
}

// Apply the shared radial dead zone (#431 pipeline) — a tilt inside the dead
// zone contributes nothing, outside it is untouched (raw, like rawPad).
export function tiltDeadZoned(v) {
    if (v.mag < TILT_DEAD) return { x: 0, y: 0, mag: 0 }
    return v
}

// Pixel-scale a -1..1 tilt vector into the same space dirsFrom reads, so tilt
// quantizes through the SAME 8/4-way sector law a thumb stick uses.
export function tiltDirs(v) {
    return v * STICK_TRAVEL
}

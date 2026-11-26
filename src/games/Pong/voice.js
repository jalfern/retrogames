// voice.js — the cabinet's sound law, widened (#3536).
//
// The machine had ONE oscillator voice but distinct pulses: a lower dry tick
// for the walls, a brighter ping for the paddles, a low clunk when the
// counter stepped. The Feb port had one tone per event class and no more.
// This module widens the vocabulary inside the cabinet's world — square/triangle/
// sawtooth pulses only, no crowd, no shimmer the machine never had — and the
// strike law gives the rally ping a voice: the ball leaves the paddle on where
// it struck, so the pitch rides the post-return |dy| (steep return = higher
// ping) and rally speed adds brightness. Pure descriptors; index.jsx hands
// them to audioController. Node (pongcheck §voice) tests the law directly.

import { BASE_SPEED } from './sim.js'

// One paddle return. `diff` colors the voice by tier the way the coin-door
// switches changed the circuit's bite: EASY softer (triangle, low volume,
// flatter pitch), NORMAL the plain square, HARD brighter and edgier
// (shorter, louder, +12%). TWO runs the NORMAL character (its rules do).
export function rallyVoice(dy, dx, diff) {
    const angle = Math.min(Math.abs(dy), 5) // the strike-law envelope post-clamp
    const speed = Math.max(0, Math.min(Math.abs(dx) - BASE_SPEED, 8))
    const f = 280 + angle * 48 + speed * 7 // 280 … 596 Hz before tier color
    const easy = diff === 'EASY'
    const hard = diff === 'HARD'
    return {
        freq: f * (easy ? 0.92 : hard ? 1.12 : 1),
        dur: hard ? 0.05 : 0.06,
        type: easy ? 'triangle' : 'square',
        vol: hard ? 0.13 : easy ? 0.08 : 0.1,
    }
}

// The first return of a rally answers the serve: the machine's serve was a
// fresh ball into play and the first contact rang twice (drop + hit). The
// echo sits a fifth above — one voice, two clacks, no new instrument.
export function serveEcho(v) {
    return { freq: v.freq * 1.5, dur: 0.045, type: v.type, vol: Math.max(0.05, v.vol * 0.8), delay: 0.07 }
}

// Wall bounce: the dry lower tick. Always below the quietest rally ping
// (257 Hz at EASY), always shorter — walls are weather, paddles are the news.
export function wallVoice() {
    return { freq: 170, dur: 0.045, type: 'square', vol: 0.07 }
}

// A point on the board: the counter stepping was the loudest, lowest event
// on the machine. Low saw thud + a short noise body — a clunk, never a jingle.
export function scoreThud() {
    return { freq: 98, dur: 0.3, type: 'sawtooth', vol: 0.16, noise: { dur: 0.09, vol: 0.12 } }
}

// The rotary RANGE dial: one quiet ~5 ms square pip on the turn. Quieter than
// the wall tick (weather → knob) — a knob is chrome, not a rally. One tone,
// no echo; outside the serve/rally/wall/thud partition entirely (§voice pins it).
export function detentVoice() {
    return { freq: 210, dur: 0.005, type: 'square', vol: 0.028 }
}

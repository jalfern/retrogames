// TALK ME DOWN — spoken-call grammar (#1247, #1252). Pure Node: words in, an
// intent out or null when the words mean nothing. The browser mic layer
// (src/utils/speechListen.js) only feeds this function; everything downstream
// (target pulse, banner, refuse-with-why) is pinned in bombcheck.
//
// The split-info rule (#1252): the MANUAL seat has the rules but no hands. A
// heard call PULSES the matching target on the defuser's panel — the shout is
// made concrete without ever touching the sim's pad law (the defuser's hands
// are still their own; #494 seats emit pads only).
//
// Intent set:
//   { kind:'cut',   color:'red'|'blue'|'yellow'|'green'|'white'|'black' }
//   { kind:'dial',  value: 0..9 }
//   { kind:'press', glyph:'star'|'diamond'|'club'|'spade'|'bolt'|'moon' }
//   { kind:'set' }                 — confirm the dial
//   { kind:'page',  page:'neon'|'dial'|'glyph' }   — flip the manual

import { WIRE_COLORS, GLYPHS } from './engine.js'

const NUM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}

export function normalizeCall(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

// parseCall — specificity order: cut (verb+color) > press (verb+glyph) >
// page ("turn to the dial page") > dial value ("turn to seven" / "set five")
// > bare set. A color word alone is NOT a call ("red" is not "cut red").
export function parseCall(text) {
    const t = normalizeCall(text)
    if (!t) return null
    const words = new Set(t.split(' '))
    for (const c of WIRE_COLORS) {
        if (/\b(cut|cuts|snip|snip[s]?|clip|remove|pull|yank)\b/.test(t) && words.has(c.toLowerCase())) {
            return { kind: 'cut', color: c.toLowerCase() }
        }
    }
    for (const gl of GLYPHS) {
        if (/\b(press|hit|push|tap|taps|touch)\b/.test(t) && words.has(gl.toLowerCase())) {
            return { kind: 'press', glyph: gl.toLowerCase() }
        }
    }
    const page = /(neon|wire[s]?|dial|glyph|symbol[s]?)/.exec(t)
    if (page && /\b(page|flip|turn)\b/.test(t)) {
        const w = page[1]
        const pg = /^w/.test(w) ? 'neon' : /^s/.test(w) ? 'glyph' : w
        return { kind: 'page', page: pg }
    }
    const num = /(?:\b(?:turn|dial|set|rotate)\b[^0-9]*)(zero|one|two|three|four|five|six|seven|eight|nine|[0-9])\b/.exec(t)
    if (num) {
        const v = NUM[num[1]] ?? Number(num[1])
        return { kind: 'dial', value: v }
    }
    if (/\b(set|confirm|done|engage)\b/.test(t)) return { kind: 'set' }
    return null
}

// intentLabel — what the "HEARD" banner shows (ART rule: short, unmistakable).
export function intentLabel(intent) {
    if (!intent) return '?'
    if (intent.kind === 'cut') return `CUT ${intent.color.toUpperCase()}`
    if (intent.kind === 'press') return `PRESS ${intent.glyph.toUpperCase()}`
    if (intent.kind === 'dial') return `DIAL ${intent.value}`
    if (intent.kind === 'set') return 'SET'
    if (intent.kind === 'page') return `PAGE: ${intent.page.toUpperCase()}`
    return '?'
}

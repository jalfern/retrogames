// GRAVEL YARD VOICE ORDERS (#1771) — the foreman's grammar: a transcript in,
// an intent out. Pure Node (no DOM, no clock), same spine as Gauntlet's
// voicecalls.js (#1249): this module is the ONLY place words become things,
// every phrase lives here so gravelcheck can pin it all without a microphone,
// and the browser layer (src/utils/speechListen.js) exists only to feed it.
//
// The words mirror the yard's OWN radio vocabulary (#1253's rule: the crew
// SHOUTS, so the radio already carries the exact utterances a grammar would
// mirror): the HUD paints WIDE/MED/NARO on the gate dial, the board radio says
// "PINNED FINES x4" / "PIN CLEAR", the screen radio yells "JAMMED! JOG IT
// x3". A player who has listened for one shift already knows every word.
//
// Intent set:
//   { kind:'gate', gate:'wide'|'medium'|'narrow' } — set the screen's gate
//   { kind:'run' }   — start the batch on the CURRENT gate (skip the demand walk)
//   { kind:'jog' }   — knock the jam loose
//   { kind:'pin', grade:'coarse'|'fines' } — pin that grade's oldest open order
//   { kind:'unpin' } — clear the delivery pin
// Unknown speech returns null; the crew simply keeps its last plan, like a
// yard that didn't hear you over the shaker.

export const ORDER_INTENTS = ['gate', 'run', 'jog', 'pin', 'unpin']
export const GRADES = ['coarse', 'fines']

// Normalize once: lowercase, strip punctuation, squeeze whitespace (browser
// recognition output varies in case and trailing dots).
export function normalizeOrder(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const GRADE_RE = /\b(coarse|fines)\b/
// "pin coarse" / "pin the fines order" / "pin down coarse" — pin verb + grade.
const PIN_RE = /\bpin\b[^.]{0,12}\b(coarse|fines)\b|\b(coarse|fines)\b[^.]{0,8}\b(first|next|up first)\b|\bdeliver\b[^.]*\b(coarse|fines)\b|\bhaul\b[^.]*\b(coarse|fines)\b/
// pin clear — verbatim radio ("PIN CLEAR"), plus plain-English siblings.
const UNPIN_RE = /\bpin\s+(clear|off|cancel|none)\b|\bclear\s+(the\s+)?pin\b|\bdelete\s+(the\s+)?pin\b|\bunpin\b|\bany\s+(order|grade)\b/
// gate words, most specific first: "medium/middle" before "wide/narrow" so
// "middle of the road" still reads medium. "close it down"/"choke" = narrow.
const GATE_RES = [
    [/\bmedium\b|\bmiddle\b|\bmed\b/, 'medium'],
    [/\bwide\b|\bopen (it |the gate )?up\b|\bfull width\b|\ball (the )?way open\b/, 'wide'],
    [/\bnarrow\b|\bchoke\b|\bclose (it )?down\b|\btight(en)?\b/, 'narrow'],
]
// jog the jam — "jog it" is what the screen radio screams; humans repeat it.
const JOG_RE = /\bjog\b|\bknock it (loose|free)\b|\bjar(it)?\b|\bfre(e|eed?) (the )?(screen|shaker)\b/
// run the plant — start/batch/shake with a plant-ish noun, or bare commands.
const RUN_RE = /\brun\b|\bstart\b|\bbatch\b|\bshake\b|\bget it (running|going)\b|\bgogogo\b|\bgo on\b/

// parseOrder — the whole grammar. Order is specificity: a pin call names a
// GRADE (the most specific thing an order can contain), then its release,
// then the gate (a setting), then jog (a rescue), then run (the default verb
// of the yard). "start the batch over the fines" has both run and grade
// words — pin only fires on the pin verbs/first pattern, so run wins there.
export function parseOrder(text) {
    const t = normalizeOrder(text)
    if (!t) return null
    if (UNPIN_RE.test(t)) return { kind: 'unpin' }
    const pin = t.match(PIN_RE)
    if (pin) return { kind: 'pin', grade: (pin[1] || pin[2] || pin[3]) === 'fines' ? 'fines' : 'coarse' }
    if (JOG_RE.test(t)) return { kind: 'jog' }
    for (const [re, gate] of GATE_RES) {
        if (re.test(t)) return { kind: 'gate', gate }
    }
    if (RUN_RE.test(t)) return { kind: 'run' }
    return null
}

// orderLabel — what the heard-banner shows (ART rule: one message, short,
// unmistakable).
export function orderLabel(intent) {
    if (!intent) return '?'
    if (intent.kind === 'gate') return `GATE ${intent.gate.toUpperCase()}`
    if (intent.kind === 'run') return 'RUN IT'
    if (intent.kind === 'jog') return 'JOG IT'
    if (intent.kind === 'pin') return `PIN ${intent.grade.toUpperCase()}`
    if (intent.kind === 'unpin') return 'PIN CLEAR'
    return '?'
}

// FIRE CREW RADIO (#1361) — the spoken co-op: a shouted call in, an intent out.
// Pure Node (no DOM, no clock): the mic path is the browser half
// (speechListen -> parseRadio -> sim.applyRadio), and firecrewcheck pins every
// phrasing here, the way voicecmdcheck pins GAUNTLET's voicecalls.
//
// The game's law is the information split: each seat sees a different slice of
// the smoke, so the crew has to talk. A radio call carries exactly the
// information the sim's own light rule says the shouting seat could have seen —
// a shout about a victim in a corner no light reached delivers nothing
// (applyRadio enforces that with the SAME lightAt rule step() uses to find
// victims, so the radio can never be a cheat that beats the physics).
//
// Fire itself is never the call — burning cells glow through any smoke
// (lightAt returns 1 for them). You shout what you CANNOT see: the people in
// the dark, the ladder state, and holds.
//
// Intent set:
//   { kind:'spot', side:'west'|'east'|'back'|'front'|'loft'|'all' }
//       "victim on the left", "someone's trapped up there", "there's a body"
//   { kind:'ladder', dir:'up'|'down'|'brace' }
//       "ladder up", "lower the ladder", "hold the ladder / brace it"
//   { kind:'hold' }   — "hold", "wait", "stay put" (the rescue seat stands down)

// Normalize once: lowercase, strip punctuation to spaces, squeeze whitespace,
// fold accents (browser recognition output varies by build).
export function normalizeRadio(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const SIDES = ['west', 'east', 'back', 'front', 'loft', 'all']

// Side words, most specific first: "up above" is loft before "up" can mean
// back, "street side" is front.
const SIDE_RE = [
    [/loft|above|up there|up above|up on top|top floor|attic/, 'loft'],
    [/west|left/, 'west'],
    [/east|right/, 'east'],
    [/back|rear|north|further|deeper/, 'back'],
    [/front|south|door|street side|closer|nearer/, 'front'],
]

const VICTIM_RE = /\b(victim|person|people|man|men|woman|women|someone|somebody|some one|body|bodies|soul|trapped|stuck|alive|unconscious|not moving|can.?t move|down there|up there)\b/

const LADDER_DIR = [
    [/\bbrace\b|\bhold (the )?ladder\b|\bsteady( the ladder)?\b|\bhold on\b/, 'brace'],
    [/\bup\b|\braise\b|\bhigher\b|\blift\b/, 'up'],
    [/\bdown\b|\blower\b|\bdrop\b|\bbring it down\b/, 'down'],
]

const LADDER_RE = /\b(ladder|stick|pole)\b/

const HOLD_RE = /\b(hold|hold on|wait|wait a|stay put|freeze|stop|keep quiet)\b/

// parseRadio — the whole grammar. Order is specificity: a ladder call names
// the ladder first ("hold the ladder" is a brace, never a hold), then a spot
// call needs a victim word, then a bare hold. Returns null when the words
// carry no information the crew can act on — "fire on the left" included
// (fire is visible; the radio is for what the smoke hides).
export function parseRadio(text) {
    const t = normalizeRadio(text)
    if (!t) return null
    if (LADDER_RE.test(t)) {
        for (const [re, dir] of LADDER_DIR) {
            if (re.test(t)) return { kind: 'ladder', dir }
        }
        return null // "the ladder" with no command is not an order
    }
    if (VICTIM_RE.test(t)) {
        for (const [re, side] of SIDE_RE) {
            if (re.test(t)) return { kind: 'spot', side }
        }
        return { kind: 'spot', side: 'all' } // no side: everything THIS seat's light reached
    }
    if (HOLD_RE.test(t)) return { kind: 'hold' }
    return null
}

// radioLabel — what the HUD banner echoes ("one message at a time, short,
// unmistakable" — the ART rule), and what the one-time hints card shows.
export function radioLabel(intent) {
    if (!intent) return 'NO CALL'
    if (intent.kind === 'spot') {
        const s = intent.side === 'all' ? '' : intent.side.toUpperCase()
        return s ? `VICTIM ${s}` : 'VICTIM SPOTTED'
    }
    if (intent.kind === 'ladder') return `LADDER ${intent.dir.toUpperCase()}`
    if (intent.kind === 'hold') return 'HOLD'
    return 'NO CALL'
}

export const RADIO_SIDES = SIDES

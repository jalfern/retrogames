// GAUNTLET VOICE CALLS (#1249) — the spoken-co-op grammar: a transcript string
// in, an intent out. Pure Node (no DOM, no regex lookahead tricks, no clock):
// voicecmdcheck pins every phrasing here, and the browser layer
// (src/utils/speechListen.js) exists only to feed this function from a mic.
//
// The seat contract (#494) says the partner seat answers only with pads — this
// module is deliberately the ONLY place words become things. A trained model
// (Frank's lab, #1249) drops in by emitting the same intent objects, so the
// grammar is a floor, not a ceiling: unrecognized speech returns null and the
// seat simply keeps its last command, like a player who wasn't sure what was
// shouted over the sword clang.
//
// Intent set (the issue's handful of calls, + the #1287 fifth):
//   { kind:'goto', dir:'upper-right' | 'upper-left' | 'lower-right' | 'lower-left' }
//   { kind:'key' }     — grab/get/find the key
//   { kind:'attack' }  — attack that guy / kill it / get him (#1287)
//   { kind:'follow' }  — follow me / come with me (today's default behaviour)
//   { kind:'hold' }     — hold here / stay / guard / stop

export const DIRS = ['upper-right', 'upper-left', 'lower-right', 'lower-left']
export const CALL_INTENTS = ['goto', 'key', 'attack', 'follow', 'hold']

// quadrant words, most specific first: compass compounds beat plain pairs.
const QUAD = [
    [/north[\s-]*east|upper[\s-]*right|top[\s-]*right/, 'upper-right'],
    [/north[\s-]*west|upper[\s-]*left|top[\s-]*left/, 'upper-left'],
    [/south[\s-]*east|lower[\s-]*right|bottom[\s-]*right/, 'lower-right'],
    [/south[\s-]*west|lower[\s-]*left|bottom[\s-]*left/, 'lower-left'],
    // reversed order ("right upper") — humans do say it
    [/(?:east|right)[\s-]*(?:north|upper|top)/, 'upper-right'],
    [/(?:west|left)[\s-]*(?:north|upper|top)/, 'upper-left'],
    [/(?:east|right)[\s-]*(?:south|lower|bottom)/, 'lower-right'],
    [/(?:west|left)[\s-]*(?:south|lower|bottom)/, 'lower-left'],
]

const KEY_RE = /\b(grab|get|gets|getting|take|takes|taking|fetch|find|finds|bring|carry|steal)\b[^.]*\b(keys?|lockpick)\b/
// #1287 fifth call: either a pure combat verb ("attack!", "charge"), or a
// lighter verb that needs a target noun to mean combat ("get him", "grab that
// monster"). The key call is checked FIRST, so "get the key" stays a key call.
const ATTACK_RE = /\b(attack|kill|slay|destroy|smash|fight|charge|whack)\b|\b(hit|stab|get|grab|take)\b[^.]*\b(it|him|her|them|this|that|those|guy|guys|monster|monsters|beast|beasts|enemy|enemies|thing|things|rat|rats|ghost|ghosts|knight|knights|wizard|wizards)\b/
const FOLLOW_RE = /\b(follow|accompany)\b|\bcome\s+(along|with)\b|\bwith\s+me\b|\bstay\s+close\b|\bthis\s+way\b|\blet\s?us?\s+go\b/
const HOLD_RE = /\b(hold|stay|guard|stop|wait|freeze|defend)\b/

// Normalize once: lowercase, strip punctuation to spaces, squeeze whitespace.
// Accents are folded crudely because browser recognition output varies.
export function normalizeCall(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

// parseCall — the whole grammar. Order is specificity: a quadrant is the most
// specific thing a call can contain ("take the upper right" has both a verb
// and a direction), then key, then attack, then follow, then hold. Returns null
// when the words mean nothing to the seat.
export function parseCall(text) {
    const t = normalizeCall(text)
    if (!t) return null
    for (const [re, dir] of QUAD) {
        if (re.test(t)) return { kind: 'goto', dir }
    }
    if (KEY_RE.test(t)) return { kind: 'key' }
    if (ATTACK_RE.test(t)) return { kind: 'attack' }
    if (FOLLOW_RE.test(t)) return { kind: 'follow' }
    if (HOLD_RE.test(t)) return { kind: 'hold' }
    return null
}

// intentLabel — what the on-screen "heard" banner shows (ART rule: one
// message at a time, short, unmistakable).
export function intentLabel(intent) {
    if (!intent) return '?'
    if (intent.kind === 'goto') return intent.dir.replace('-', ' ').toUpperCase()
    if (intent.kind === 'key') return 'THE KEY'
    if (intent.kind === 'attack') return 'ATTACK'
    if (intent.kind === 'follow') return 'FOLLOW'
    if (intent.kind === 'hold') return 'HOLD'
    return '?'
}

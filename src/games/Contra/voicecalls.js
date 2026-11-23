// CONTRA VOICE CALLS (#3000) — spoken wingman orders: a transcript string in,
// an intent out. Pure Node (no DOM, no clock): contracheck pins every phrasing
// here, and the browser layer (src/utils/speechListen.js) exists only to feed
// this function from a mic — the Gauntlet #1249 / FireCrew #1361 pattern, on
// the #1711 S5 voice lineage.
//
// The cabinet's co-op was two men talking over the gunfire; phones get only one
// touchpad (Jon's rule), so the words ARE the second gunner's channel. Words
// steer the blue wingman through applyCall (sim.js) — the same intent objects a
// trained model can emit, so the grammar is a floor, not a ceiling. An
// unrecognized shout returns null: the wingman simply keeps his last order,
// like a soldier who didn't catch what was yelled over the rifle crack.
//
// Intent set (two channels; each shout replaces only its own):
//   { kind:'aim', dir:'up'|'down'|'level' }   — the diagonal of his fire
//   { kind:'formation', dir:'follow'|'hold'|'spread' }

// Normalize once: lowercase, strip punctuation to spaces, squeeze whitespace,
// fold accents (browser recognition output varies by build).
export function normalizeCall (text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

// The aim channel: a shooty verb (or the guns themselves) naming a height.
// "watch the sky" is an order; "watch out" names no height and refuses. Sky
// threats rank ABOVE the word "down": "bring the gunship down" points the
// barrel UP at the plane — the answer to an air threat is the diagonal.
const AIM_RE = /\b(aim|point|train|elevate|swing|tilt|angle|look|watch|shoots?|strafe|spray|blast|kill|drop|take|bring|knock|fire|guns?|weapons?|barrels?)\b/
const AIM_DIR = [
    [/\b(up|high|sky|above|overhead|air|aircraft|planes?|gunships?|carriers?|bird)\b/, 'up'],
    [/\b(down|low|under|below|ground|deck|floor)\b/, 'down'],
    [/\b(level|straight|ahead|forward|horizontal|flat)\b/, 'level'],
]

// The formation channel. Specificity order: spread words first ("fall back"
// is a spread, not a hold), then hold (cover-me means stand and shoot), then
// the advance verbs. "back" alone means hang back — the flank behind, not the
// retreat into the spawn door (the sim's own refusal law covers that anyway).
const FORM_DIR = [
    [/\b(spread|fan|fanning|widen|wide|split|flank|distance|back)\b/, 'spread'],
    [/\b(hold|stay|wait|freeze|stop|station|position|cover)\b/, 'hold'],
    [/\b(follow|come|rally|advance|push|onward|move|go)\b/, 'follow'],
]

// parseCall — the whole grammar. Aim first: it is the more specific thing a
// call can contain ("aim up the ladder" moves the barrel, not the feet). An
// aim verb with no height FALLS THROUGH to the formation channel ("take the
// flank" is still a spread); if neither channel lands, the words refuse. A
// bare direction ("up!") refuses: alone it is ambiguous with jump and climb —
// the wingman acts on orders, not guesses. FireCrew's commandless-ladder law.
export function parseCall (text) {
    const t = normalizeCall(text)
    if (!t) return null
    if (AIM_RE.test(t)) {
        for (const [re, dir] of AIM_DIR) {
            if (re.test(t)) return { kind: 'aim', dir }
        }
    }
    for (const [re, dir] of FORM_DIR) {
        if (re.test(t)) return { kind: 'formation', dir }
    }
    return null
}

// intentKey — the flat string the voiceCmd bank stores as `intent` (the
// #1249 channel wants a string or null).
export function intentKey (intent) {
    if (!intent) return null
    return intent.kind === 'aim' ? `aim-${intent.dir}` : intent.dir
}

// intentLabel — what the banner echoes (ART rule: one message at a time,
// short, unmistakable).
export function intentLabel (intent) {
    if (!intent) return 'NO CALL'
    if (intent.kind === 'aim') return `AIM ${intent.dir.toUpperCase()}`
    if (intent.dir === 'follow') return 'FOLLOW ME'
    return intent.dir.toUpperCase()
}

export const CALL_AIM_DIRS = ['up', 'down', 'level']
export const CALL_FORM_DIRS = ['follow', 'hold', 'spread']

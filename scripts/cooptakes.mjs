// COOP TAKES (#1711) — the co-op games' record path proven LIVE, phone-shaped.
//
// Why this exists: the store has only ever held Gauntlet and clap-test takes.
// Nothing has ever driven SHORT ORDER SHOUT, BOMB DEFUSE or RALLY CO-DRIVER
// through their live shell — consent gate up at start, recorder opened AT SEED
// BIRTH, ticks banked by the game's own rAF loop, endRun at the natural end,
// outbox + upload to the store. The rules are pinned in Node (recordcheck) and
// plaicraft-evidence can replay every one of these games — but between the two
// sits the actual screen Jon taps, and for the three co-op titles that path was
// never run. When the nightly grader meets Jon's first co-op take it must not
// be the first time anyone has tried.
//
// What each game run proves (the same story, three kitchens):
//   gate     — the consent gate goes up at human-start with BOTH switches off,
//              SAVE refuses an empty name (#1711 audit 1), and after SAVE the
//              recorder is open before the sim's first tick (__autoCapture at
//              seed-birth) with a live mic (voice consent honoured).
//   play     — real input events only (trusted pointer on the pad, keyboard
//              arrows/space); the take's own pad stream shows those presses.
//   leave    — the run ends by its own rules (shift whistle / fuse boom /
//              pace brain crossing the line) and endRun fires from the game's
//              over path — no harness shortcuts, no unmount races.
//   store    — relaysim lists the take with the right game, name and audio
//              flag; the bytes validate as rec/v2 and carry honest seat labels
//              (#2058: SOS/BD seat 0 is the thumb; Rally with `?seat=model`
//              stays honestly model — the humanSeats:false opt-out LIVE).
//   grade    — `plaicraft:evidence` (the studio command, verbatim) replay-
//              verifies the take and finds the voice clock sane.
//
// Consent axes (the S1 line-4 shape, game-side):
//   declined — a refused gate records NOTHING and the store count does not move.
//   silent   — motion yes + voice no lands a v1 take with audio:false (the mic
//              never opened — consent is asked BEFORE capture).
//   revoke   — voice granted, mic open, then REVOKED mid-run (the consent entry
//              flipped under the live player's id, as settings would): the
//              last-moment gate in sessionStore.js must strip the voice section —
//              the take still lands, silent and honest (defence in depth).
//   mutant   — `--mutant=strip` pins sessionStore.js's last-moment strip to
//              [] — the acceptance's "mutant that tries". The harm is scored
//              at the CLIENT seam (#2762): the revoked take's fate must differ
//              observably from the honest green (v1/audio:false, uploaded).
//              Red = the take LANDS DIRTY (v2-with-voice at the store — the
//              worker's own consent door failed too) or is REFUSED with the
//              voice reason (relay/core.js refuses a voice POST whose envelope
//              says voice:false — the store door held, and the client strip is
//              load-bearing for the honest landing). Either shape exits green
//              with the harm NAMED at one check. The old criterion waited at
//              the store seam for a dirty landing the worker can never allow,
//              so the mutant mode could never pass (#2762). Guarded by
//              mutateguard; commit before running.
//
// The mic is the #2716 fake-file device (a baked hum WAV at the device
// boundary — gUM, MediaRecorder, opus, the tick clock, v2 assembly, upload and
// decode all run untouched); the store is relaysim, the worker in Node. Only
// the sound source and the bucket are simulated, and both are NAMED.
//
// It is slow by design (~12 min): every run finishes NATURALLY — the 150 s
// shift whistle, the 150 s fuse ledger, a lap of pace-brain driving. Faking
// game-over would skip the one thing this suite exists to prove.
//
//   npm run dev -- --port 5173 --strictPort     (or DEV_PORT)
//   npm run cooptakes                            # all games + consent runs
//   npm run cooptakes -- --game=sos|bd|rally    # one game
//   npm run cooptakes -- --mutant=strip         # mutant that tries — exits 0 when the harm is named (#2762)
//
// Exit 0 every scheduled run passed; 1 any assertion failed; 2 preconditions
// (no dev server / dev build missing).

import { requireDevServer, launch, Report } from './lib/harness.mjs'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from '../src/utils/recording.js'
import { startRelaySim, SIM_READ_KEY } from './lib/relaysim.mjs'
import { bakeFakeMicWav, fakeMicArgs, fakeMicInit } from './lib/fakemic.mjs'
import { plantNew, pull } from './lib/mutateguard.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const MUTANT = (() => {
    const hit = argv.find((a) => a.startsWith('--mutant'))
    if (!hit) return null
    const v = hit.includes('=') ? hit.split('=')[1] : 'strip'
    if (v !== 'strip') { console.error(`cooptakes: unknown --mutant=${v} (strip)`); process.exit(2) }
    return v
})()
const ONLY = argv.find((a) => a.startsWith('--game='))?.split('=').slice(1).join('=') || process.env.npm_config_game || null

// Seat truth per game: which labels the take must carry when it lands.
// sos/bd: autoStart stamps seat 0 human (#2058). rally here: the pace brain
// drives (`?seat=model`) and the game opted OUT of the stamp — an honest take
// with NO human seat (the #2058 opt-out, proven live for the first time).
const GAMES = [
    { key: 'sos', game: 'short-order-shout', route: '/short-order-shout', label: 'SHORT ORDER SHOUT', secs: 168, overMs: 180000, expectSeats: (seats) => seats[0] === 'human' && seats.length >= 1, seatsWhy: 'seat 0 human (#2058 stamp)' },
    { key: 'bd', game: 'bomb-defuse', route: '/bomb-defuse', label: 'BOMB DEFUSE', secs: 168, overMs: 180000, keyHint: 'ArrowRight', expectSeats: (seats) => seats[0] === 'human' && seats.length >= 1, seatsWhy: 'seat 0 human (#2058 stamp)' },
    { key: 'rally', game: 'rally-co-driver', route: '/rally-co-driver', label: 'RALLY CO-DRIVER', query: '&seat=model', secs: 150, overMs: 240000, expectSeats: (seats) => seats[0] === 'model', seatsWhy: 'seat 0 honestly model (pace brain, #2058 opt-out)' },
].filter((g) => !ONLY || g.key === ONLY)
if (!GAMES.length) { console.error(`cooptakes: --game=${ONLY} matched nothing (sos|bd|rally)`); process.exit(2) }

const r = new Report('cooptakes')
const sim = await startRelaySim()
const BASE = sim.base
const storeCount = async () => ((await (await fetch(`${BASE}/sessions?limit=500`, { headers: sim.readHeaders })).json()).sessions || []).length

async function evidenceFor(key) {
    // the studio command, verbatim — what the nightly grader will run on Jon's
    // co-op takes; here it must PASS on ours.
    const res = await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(HERE, 'plaicraft-evidence.mjs'), '--key', key, '--json', `--store=${BASE}`, '--limit=500'],
            { cwd: path.join(HERE, '..'), env: { ...process.env, JON_KEY: SIM_READ_KEY }, stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        child.stdout.on('data', (d) => { out += d })
        child.stderr.on('data', (d) => { out += d })
        child.on('close', (code) => resolve({ code, out }))
    })
    try {
        const j = JSON.parse(res.out)
        return (j.sessions && j.sessions[0]) || null
    } catch { return null }
}

const errors = []
let browser = null
let curWav = null
async function browserFor(secs) {
    if (browser && curWav === secs) return browser
    if (browser) await browser.close().catch(() => {})
    const wav = bakeFakeMicWav({ clapMs: [], secs }) // hum floor, no claps: these are play takes, not calibration
    browser = await launch({ headless: !argv.includes('--headful'), extraArgs: fakeMicArgs(wav) })
    fs.rmSync(wav, { force: true })
    curWav = secs
    if (!globalThis.__coopMicStamp) {
        globalThis.__coopMicStamp = true
        r.info('mic capture (#2709)', `fake-file (baked hum wav) — Chrome ${browser.version()}; store: relaysim ${BASE}`)
    }
    return browser
}

// One phone-shaped run: gate -> seed-birth recorder -> real input -> natural
// over -> upload. `voice` decides the second switch; `decline` refuses.
async function phoneRun(g, { voice = true, decline = false, revoke = false } = {}) {
    const b = await browserFor(g.secs)
    const context = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
    await context.addInitScript(fakeMicInit)
    const page = await context.newPage()
    await page.bringToFront()
    page.setDefaultTimeout(30000)
    page.on('pageerror', (e) => errors.push(String(e)))
    const url = `http://localhost:${PORT}/retrogames${g.route}?store=${encodeURIComponent(BASE)}${g.query || ''}`
    await page.goto(url, { waitUntil: 'load' })

    const out = { ok: false, uploaded: false, key: null, last: null, row: null, ev: null, rec: null, gateUp: false, why: '', tapsLanded: 0 }

    // attract -> human start (one tap; every game starts on any input)
    try { await page.waitForSelector('canvas', { timeout: 15000 }) } catch { out.why = 'canvas never mounted'; await context.close(); return out }
    await page.waitForTimeout(900) // let the attract sim wake so inputs land as START, not stray pads
    await page.mouse.click(195, 300) // any tap wakes the attract (SOS/BD: attract -> select)
    await page.waitForTimeout(500)
    if (g.keyHint) await page.keyboard.press(g.keyHint) // select screens: BD's seat picker (2 players -> the thumb lands on a recorded seat)
    await page.waitForTimeout(200)
    await page.keyboard.press('Space') // select/kitchens confirm (SOS select, BD attract)
    await page.waitForTimeout(600)
    await page.keyboard.press('Enter') // and one of these lands on every game's start key
    await page.waitForTimeout(200)

    // the consent gate: BOTH switches off, SAVE gated on a name
    let gateUp = false
    try { await page.waitForSelector('#consent-motion', { timeout: 6000 }); gateUp = true } catch { /* cached consent — only honest for a repeat */ }
    out.gateUp = gateUp
    if (gateUp) {
        const offByDefault = await page.evaluate(() => {
            const m = document.querySelector('#consent-motion')
            const v = document.querySelector('#consent-voice')
            return m && v && m.getAttribute('aria-checked') === 'false' && v.getAttribute('aria-checked') === 'false'
        })
        out.offByDefault = !!offByDefault
        await page.click('#consent-motion')
        if (decline) {
            await page.click('#consent-no') // NO THANKS — identity-free decline is allowed
        } else {
            if (voice) await page.click('#consent-voice')
            const saveDisabled = await page.evaluate(() => document.querySelector('#consent-yes')?.disabled === true)
            out.nameRequired = saveDisabled
            await page.click('#consent-name')
            await page.type('#consent-name', 'qabot')
            await page.click('#consent-yes')
        }
    }

    // recorder at seed-birth (no ticks banked before the gate answered)
    let armed = false
    try {
        await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording), null, { timeout: 8000 })
        armed = true
    } catch { /* the gate below states what it saw */ }
    out.armed = armed
    out.voiceOpen = await page.evaluate(() => !!((window.__autoCapture || {}).voice)).catch(() => false)
    if (decline) {
        // refused: nothing records, nothing waits at the store
        await page.waitForTimeout(3500)
        await page.mouse.click(195, 700).catch(() => {})
        await page.waitForTimeout(500)
        out.recordingNeverOpened = await page.evaluate(() => !(window.__autoCapture && window.__autoCapture.recording)).catch(() => false)
        out.last = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last || null).catch(() => null)
        await context.close()
        out.ok = out.recordingNeverOpened
        return out
    }
    if (!armed) { out.why = 'recorder never opened after consent'; await context.close(); return out }

    // real input for a few seconds: keyboard arrows + space (what VirtualControls
    // dispatches) and pointer taps on the A button. #2759: the old loop tapped
    // right after keyboard.press — but VirtualControls HIDES the pad on trusted
    // keydown (step-5 feel rule, #290), so the element unmounted and every tap
    // burned its whole timeout (the pre-fix 30 s waits starved the bd run to
    // 1/1082 pads in 3.5 min, #1711). It was never the teach panel: bdteachpad
    // proves the panel is canvas paint and hit-test resolves to the A button
    // itself while the lesson is due. A bare touchscreen tap re-shows the pad
    // (touchstart → show), and the selector tap then lands in ~300 ms.
    const WAKE = { x: 195, y: 700 } // neutral gap in the pad row at 390x780
    let tapsLanded = 0
    let heldK = null
    for (let i = 0; i < 6; i++) {
        const k = i % 2 ? 'ArrowRight' : 'ArrowLeft'
        if (heldK && heldK !== k) await page.keyboard.up(heldK).catch(() => {})
        await page.keyboard.down(k)
        heldK = k
        await page.waitForTimeout(420)
        await page.keyboard.press('Space').catch(() => {})
        if (!(await page.evaluate(() => !!document.querySelector('[data-vc="a"]')))) {
            await page.touchscreen.tap(WAKE.x, WAKE.y).catch(() => {})
            await page.waitForTimeout(120) // React re-mount of the pad
        }
        if (await page.tap('[data-vc="a"]', { timeout: 1200 }).then(() => true).catch(() => false)) tapsLanded++
        await page.waitForTimeout(330)
    }
    out.tapsLanded = tapsLanded
    if (heldK) await page.keyboard.up(heldK).catch(() => {})
    for (const k of ['ArrowLeft', 'ArrowRight']) await page.keyboard.up(k).catch(() => {})

    // mid-run revocation: the live player's voice grant flips off (what the
    // settings would do); endRun's last-moment gate must then strip the voice.
    if (revoke) {
        await page.evaluate(() => {
            const KEY = 'retrogames-consent-v1'
            try {
                const m = JSON.parse(localStorage.getItem(KEY) || '{}')
                if (m.qabot) { m.qabot.voice = false; m.qabot.at = Date.now(); localStorage.setItem(KEY, JSON.stringify(m)) }
            } catch { /* the gate below reports the miss honestly */ }
        })
    }

    // run to its NATURAL end; endRun uploads on the over path
    const lastWanted = `${g.game}-natural-over`
    try {
        await page.waitForFunction(() => !!(window.__autoRecord && window.__autoRecord.last), null, { timeout: g.overMs })
    } catch { /* gate below names it */ }
    out.last = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last || null).catch(() => null)
    out.lastWanted = lastWanted
    if (out.last && out.last.uploaded) {
        out.uploaded = true
        out.key = out.last.key
    }
    if (out.uploaded) {
        try {
            const listed = await (await fetch(`${BASE}/sessions?limit=500`, { headers: sim.readHeaders })).json()
            out.row = (listed.sessions || []).find((s) => s.key === out.key) || null
            if (out.row) {
                const text = await (await fetch(`${BASE}/sessions/${encodeURIComponent(out.key)}`, { headers: sim.readHeaders })).text()
                out.rec = JSON.parse(text)
            }
        } catch { /* gates below */ }
        out.ev = await evidenceFor(out.key)
    }
    await context.close()
    out.ok = out.uploaded && !!out.row && !!out.rec
    return out
}

const cleanRuns = MUTANT ? [] : GAMES
const runs = []
for (const g of cleanRuns) {
    r.info(`${g.label}: driving a full natural run (worst case ${(g.overMs / 1000) | 0} s)`)
    let res = await phoneRun(g)
    if (!res.ok) {
        // busy-box doctrine (#2205): a starved page can miss the natural end.
        // A content failure repeats and stays red; a starved run gets one retry.
        r.info(`${g.label}: attempt 1 ended without a stored take (starved box?) — retrying once`)
        res = await phoneRun(g)
    }
    const p = (label, pass, detail = '') => r.check(`${g.key}: ${label}`, pass, detail)
    p('the consent gate went up at human start', res.gateUp === true, res.why || '')
    p('both switches default OFF (Jon\'s rule)', res.offByDefault === true)
    p('SAVE refused while the WHO field was empty (#1711 audit 1)', res.nameRequired === true)
    p('recorder open at seed-birth after consent', res.armed === true, JSON.stringify({ armed: res.armed, voice: res.voiceOpen }))
    p('voice consent opened the mic', res.voiceOpen === true)
    p('the run ended NATURALLY and the take uploaded through the consent gate',
        res.uploaded && res.last.game === g.game && res.last.player === 'qabot' && res.last.voice === true,
        JSON.stringify(res.last || { why: res.why }))
    p('the store lists the take (game, name, audio yes)', !!res.row && res.row.game === g.game && res.row.player === 'qabot' && res.row.audio === true, JSON.stringify(res.row))
    p('bytes validate as rec/v2 with a clocked voice track',
        !!res.rec && validate(res.rec) === null && res.rec.format === 'retrogames-rec/v2'
        && res.rec.voice.tracks.length >= 1 && res.rec.voice.tracks[0].clock.length >= 3 && res.rec.voice.tracks[0].ms > 5000,
        res.rec ? `${res.rec.format} tracks:${res.rec.voice && res.rec.voice.tracks.length} validate:${validate(res.rec)}` : 'no bytes')
    {
        const seats = res.rec && res.rec.slots ? res.rec.slots.map((s) => s.source.kind) : null
        p(`seat labels honest on landing (${g.seatsWhy})`, !!seats && g.expectSeats(seats), JSON.stringify(seats))
        const pads = res.rec && res.rec.slots && res.rec.slots[0] ? res.rec.slots[0].pads : []
        const pressed = pads.filter((x) => Object.keys(x).length > 0).length
        p('the pad stream holds the thumb\'s real presses', pressed >= 3 && pads.length === res.rec.ticks, `${pressed}/${pads.length} non-empty pads of ${res.rec && res.rec.ticks} ticks`)
        // #2759: the tap route must WORK, not just ride along. The pre-fix loop
        // pressed a trusted key then tapped the pad the key had just hidden —
        // every tap timed out and the missequencing hid behind a 1500 ms wait.
        // Wake-then-tap: the touch re-shows the pad and taps land between keys.
        p('pad taps land between keyboard presses (#2759 wake-then-tap)', res.tapsLanded >= 3, `${res.tapsLanded}/6 taps landed — a 0 means the pad hides on keydown again and the loop lost its wake`)
    }
    p('plaicraft:evidence replay-verifies the take (the nightly grader\'s own command)',
        !!res.ev && res.ev.replayOk === true, res.ev ? `${res.ev.error || ''} ticks:${res.ev.ticks}` : 'evidence run produced no report')
    p('the graded voice clock is sane (no frozen trace, cover honest)', !!res.ev && res.ev.voiceOk === true, res.ev && res.ev.error || '')
    runs.push(res)
}

// --- consent axis: declined -> nothing reaches the store -----------------------
if (!MUTANT) {
    const g = GAMES[0]
    const before = await storeCount()
    r.info(`${g.label}: consent DECLINED — the store must not move`)
    const res = await phoneRun(g, { decline: true })
    r.check('declined: the gate went up with both switches off', res.gateUp === true && res.offByDefault === true)
    r.check('declined: nothing recorded, nothing uploaded', res.recordingNeverOpened === true && !res.last, JSON.stringify({ rec: !res.recordingNeverOpened, last: res.last }))
    const after = await storeCount()
    r.check('declined: the store holds no new row for the refused run', after === before, `before ${before} after ${after}`)
}

// --- consent axis: motion yes + voice NO -> silent v1 take ----------------------
if (!MUTANT && GAMES.some((g) => g.key === 'sos')) {
    const g = GAMES.find((x) => x.key === 'sos')
    r.info(`${g.label}: motion YES, voice NO — the take must land SILENT (v1)`)
    const res = await phoneRun(g, { voice: false })
    r.check('silent: the take uploaded', res.uploaded, JSON.stringify(res.last || { why: res.why }))
    r.check('silent: the store row says audio:false', !!res.row && res.row.audio === false, JSON.stringify(res.row))
    r.check('silent: the bytes are an honest v1 file (voice stripped + retagged)',
        !!res.rec && res.rec.format === 'retrogames-rec/v1' && res.rec.voice === undefined && validate(res.rec) === null,
        res.rec ? `${res.rec.format} voice:${res.rec.voice !== undefined}` : 'no bytes')
    runs.push(res)
}

// --- consent axis: voice REVOKED mid-run -> the last-moment strip lands it silent
// (the mic was live and the take HAS a voice section; only consent.js/
// sessionStore.js can still keep it out of the store — this is the shape the
// --mutant=strip red proves, with the honest module in place)
if (!MUTANT && GAMES.some((g) => g.key === 'sos')) {
    const g = GAMES.find((x) => x.key === 'sos')
    r.info(`${g.label}: voice REVOKED mid-run — the last-moment strip must land it silent`)
    let res = await phoneRun(g, { revoke: true })
    if (!res.uploaded) { r.info('revoke: retrying once (busy-box doctrine)'); res = await phoneRun(g, { revoke: true }) }
    r.check('revoke: the take uploaded', res.uploaded, JSON.stringify(res.last || { why: res.why }))
    r.check('revoke: the store row says audio:false (voice stripped at the last moment)', !!res.row && res.row.audio === false, JSON.stringify(res.row))
    r.check('revoke: the bytes are an honest v1 file (voice section stripped + retagged)',
        !!res.rec && res.rec.format === 'retrogames-rec/v1' && res.rec.voice === undefined && validate(res.rec) === null,
        res.rec ? `${res.rec.format} voice:${res.rec.voice !== undefined}` : 'no bytes')
    runs.push(res)
}

// --- MUTANT: unstrip sessionStore.js — the REVOKED-voice take must then go RED --
if (MUTANT === 'strip') {
    const SS = path.join(HERE, '..', 'src', 'utils', 'sessionStore.js')
    const src = fs.readFileSync(SS, 'utf8')
    const ANCHOR = 'const strips = gate.strips || []'
    if (!src.includes(ANCHOR)) { r.check('mutant anchor present in sessionStore.js', false, 'update the anchor to match the module'); }
    else {
        const g = GAMES.find((x) => x.key === 'sos') || GAMES[0]
        plantNew(SS, src.replace(ANCHOR, 'const strips = [] // MUTANT: the last-moment voice strip never fires'))
        try {
            r.info('mutant: sessionStore.js strips pinned to [] — a revoked-voice upload attempt must be caught HERE')
            const res = await phoneRun(g, { revoke: true })
            // #2762: score the harm at the CLIENT seam. A dirty landing means
            // the worker's consent door failed too; a refusal means the store
            // door held — the client strip is load-bearing for the honest
            // landing either way, and that difference IS the red.
            const dirty = !!res.rec && (res.rec.format === 'retrogames-rec/v2' || res.rec.voice !== undefined)
            const refused = !res.uploaded && !!res.last && /voice/i.test(String(res.last.reason || ''))
            const red = dirty || refused
            r.check('MUTANT unstrip: disarming the client strip observably changes the revoked take\'s fate (red = the check watches the strip)',
                red,
                dirty ? `STORE HOLE: v2 landed with voice (${res.rec.format}) — the worker door failed too`
                    : refused ? `STORE DOOR HELD: POST refused (${JSON.stringify(res.last.reason)}) — client strip is load-bearing for the honest landing (which lands v1/audio:false — see the revoke axis)`
                    : `no observable harm (uploaded:${res.uploaded} reason:${res.last && res.last.reason})`)
        } finally {
            pull(SS)
        }
    }
}

r.check('zero page errors', errors.length === 0, errors.join(' | '))
sim.close()
const verdict = await r.exit(browser)
if (!MUTANT && verdict === 0 && runs.length) {
    console.log(`cooptakes: ${runs.length} natural run(s) landed in the store — ${runs.map((x) => x.key + ' ' + (x.key || '')).join(', ')} (keys ${runs.filter((x) => x.key).map((x) => x.key).join(' ')})`)
}
process.exit(verdict)

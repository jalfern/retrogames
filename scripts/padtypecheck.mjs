// padtypecheck — #3108 controller-type decision layer, in Node (<1s).
//
// Proves:
//   1. The default type DERIVES from what a game already declared (method
//      #420 / legacy layout #384) — untouched games keep today's pad.
//   2. supports/resolve: the default is always in the list, unknown/unsupported
//      saved values fall back, the ?padtype override only honours supported types.
//   3. The live store persists per game under retrogames:padtype:<path> and
//      configure() RE-FIRES the switch event (the fresh-load bug: the route
//      effect runs after the pad's first render — without this a saved choice
//      only applied after the player touched the switch).
//   4. Tilt math: screen-angle rotation (portrait steers on gamma, landscape
//      on −beta, the same physical roll felt as the same steer), magnitude
//      clamp, re-centre zeroes, the shared radial dead zone.
//   5. The registry pilots declare their schemes (SSX full, MARBLE MADNESS
//      stick+tilt, PAC-MAN dpad+stick), the #3118 rollout grants (supports
//      without type — defaults stay derived) are pinned, and validPad accepts
//      them / rejects nonsense types.
//   6. VirtualControls source carries the five rails (data-vc markers), the
//      full cluster keeps the vpadboot-required fixedstick tag, and the TILT
//      affordances exist; PauseOverlay carries the CONTROLLER row.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { validPad } from '../src/components/gamepadMap.js'
import { dirsFrom, STICK_TRAVEL } from '../src/components/virtualDir.js'
// padTypes imports its siblings extensionless (Vite style) — bundle it the
// way the browser gets it, then import the result.
const bundle = await build({
    entryPoints: [new URL('../src/components/padTypes.js', import.meta.url).pathname],
    bundle: true, format: 'esm', write: false, platform: 'neutral',
})
const padTypesMod = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const {
    PAD_TYPES, PAD_TYPE_LABELS, defaultTypeFor, typesFor, resolveType,
    configurePadTypes, currentPadType, setPadType, padTypeConfig,
    TILT_MAX_DEG, TILT_DEAD, tiltVec, tiltDeadZoned,
} = padTypesMod
const tiltDirs = (v) => v * STICK_TRAVEL
void dirsFrom

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error(`  FAIL: ${msg}`) } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// --- 1. defaults derive from the existing declarations ---
ok(defaultTypeFor({ method: 'pointer', buttons: [] }) === 'pointer', 'method pointer -> pointer')
ok(defaultTypeFor({ method: 'stick', buttons: [] }) === 'stick', 'method stick -> stick')
ok(defaultTypeFor({ method: 'dpad', buttons: [] }) === 'dpad', 'method dpad -> dpad')
ok(defaultTypeFor({ layout: 'stick', buttons: [] }) === 'stick', 'legacy layout stick -> stick')
ok(defaultTypeFor({ layout: 'dpad', buttons: [] }) === 'dpad', 'legacy layout dpad -> dpad')
ok(defaultTypeFor(null) === 'stick', 'no pad -> stick (the #384 default)')
ok(defaultTypeFor({ layout: 'stick', buttons: [], type: 'full' }) === 'stick', 'explicit type is not a derivation input')

// --- 2. supports + resolve ---
ok(PAD_TYPES.join(',') === 'dpad,stick,full,pointer,tilt', 'the five types')
ok(Object.keys(PAD_TYPE_LABELS).length === PAD_TYPES.length, 'every type has a label')
{
    const ssx = { layout: 'stick', buttons: [], type: 'full', supports: ['stick', 'full'] }
    ok(typesFor(ssx).join(',') === 'full,stick', 'explicit default leads the list')
    const plain = { layout: 'stick', buttons: [] }
    ok(typesFor(plain).join(',') === 'stick', 'no supports -> single type (no switch row)')
    const dup = { layout: 'stick', buttons: [], supports: ['stick', 'tilt', 'tilt'] }
    ok(typesFor(dup).join(',') === 'stick,tilt', 'supports deduped')
    const junk = { layout: 'stick', buttons: [], supports: ['nonsense', 'tilt'] }
    ok(typesFor(junk).join(',') === 'stick,tilt', 'invalid supports entries dropped')
    ok(resolveType(junk, 'nonsense') === 'stick', 'unsupported saved value falls back')
    ok(resolveType(junk, 'tilt') === 'tilt', 'supported saved value applies')
    ok(resolveType(junk, null, 'tilt') === 'tilt', 'url override applies when supported')
    ok(resolveType(junk, null, 'full') === 'stick', 'url override ignored when unsupported')
    ok(resolveType({ layout: 'stick', buttons: [], type: 'nope', supports: ['dpad'] }, null) === 'stick', 'invalid explicit type falls to derivation, default still first')
}

// --- 3. live store: persistence + re-fire on configure ---
{
    const store = {}
    globalThis.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v) },
    }
    const listeners = []
    globalThis.CustomEvent = class { constructor(name, init) { this.detail = init?.detail } }
    globalThis.window = {
        location: { search: '' },
        dispatchEvent: (e) => { listeners.push(e) },
        addEventListener: () => {},
        removeEventListener: () => {},
    }
    const marble = { layout: 'stick', buttons: [], analog: true, supports: ['stick', 'tilt'] }
    configurePadTypes('/marble-madness', marble)
    ok(currentPadType(marble) === 'stick', 'fresh game resolves to the default')
    const t = setPadType(marble, 'tilt')
    ok(t === 'tilt', 'setPadType returns the resolved type')
    ok(store['retrogames:padtype:/marble-madness'] === 'tilt', 'persisted under the dotted key')
    ok(currentPadType(marble) === 'tilt', 'the saved choice now resolves')
    ok(listeners.some((e) => e.detail && e.detail.type === 'tilt'), 'switch event fired with the type')
    // the fresh-load contract: configure() must re-fire so a pad that already
    // rendered its default picks the saved value up without user input
    const before = listeners.length
    configurePadTypes('/marble-madness', marble)
    ok(listeners.length > before, 'configure re-fires (fresh load applies the saved choice)')
    ok(currentPadType(marble) === 'tilt', 'saved choice survives reconfigure')
    // a foreign pad must NOT write this game's key
    setPadType({ layout: 'stick', buttons: [] }, 'dpad')
    ok(store['retrogames:padtype:/marble-madness'] === 'tilt', 'a foreign pad cannot scribble the stored choice')
    ok(!!padTypeConfig(), 'config readable')
}

// --- 4. tilt math ---
{
    const P = tiltVec(0, 7, 0, 0, 0)
    ok(near(P.x, 7 / TILT_MAX_DEG) && near(P.y, 0), 'portrait: roll right steers +x')
    const L = tiltVec(-7, 0, 90, 0, 0)
    ok(near(L.x, 7 / TILT_MAX_DEG) && near(L.y, 0, 1e-9), 'landscape-left: tip right edge down steers +x (same physical roll)')
    const R = tiltVec(-7, 0, -90, 0, 0)
    ok(near(R.x, -7 / TILT_MAX_DEG, 1e-9), 'landscape-right mirrors the steer axis')
    const RY = tiltVec(0, 7, 90, 0, 0)
    ok(near(RY.x, 0, 1e-9) && near(RY.y, 7 / TILT_MAX_DEG, 1e-9), 'landscape puts gamma on the vertical axis')
    const C = tiltVec(0, 90, 0, 0, 0)
    ok(near(C.x, 1) && near(C.mag, 1), 'over-tilt clamps to 1')
    const RC = tiltVec(-3, 0, 90, -3, 0)
    ok(near(RC.x, 0) && near(RC.y, 0), 're-centre zeroes the held pose')
    const D = tiltDeadZoned(tiltVec(0, TILT_MAX_DEG * TILT_DEAD * 0.5, 0, 0, 0))
    ok(D.x === 0 && D.mag === 0, 'dead zone swallows the jitter')
    const G = tiltDeadZoned(tiltVec(0, TILT_MAX_DEG, 0, 0, 0))
    ok(near(G.mag, 1), 'full tilt passes the dead zone whole')
    ok(near(tiltDirs(0.5), 0.5 * 56), 'tilt dirs scale into the sector quantizer')
    ok(TILT_DEAD === 0.12, 'the shared radial dead zone (#431)')
}

// --- 5. registry pilots + validPad ---
{
    const src = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const blockOf = (path) => {
        const i = src.indexOf(`path: '${path}'`)
        if (i === -1) return ''
        const j = src.indexOf('path: ', i + 1)
        return src.slice(i, j === -1 ? src.length : j)
    }
    ok(/type: 'full', supports: \['stick', 'full'\]/.test(blockOf('/ssx')), 'SSX pilots the full pad')
    ok(/supports: \['stick', 'tilt'\]/.test(blockOf('/marble-madness')), 'MARBLE MADNESS pilots tilt')
    ok(/supports: \['dpad', 'stick'\]/.test(blockOf('/pacman')), 'PAC-MAN pilots the switch')
    // #3118 rollout grants — supports WITHOUT type: the default stays derived,
    // so an untouched game renders its shipped pad byte-for-byte. R-TYPE's
    // △ THROW entry keeps the #2931 third verb reachable in the diamond.
    for (const [p, kinds, why] of [
        ['/mario-kart', 'stick', 'full'], ['/comet-drift', 'stick', 'full'], ['/comet-drift-hd', 'stick', 'full'],
        ['/galaga', 'stick', 'full'], ['/joust', 'stick', 'full'], ['/spy-hunter', 'stick', 'full'],
        ['/r-type', 'dpad', 'full'], ['/double-dragon', 'dpad', 'full'], ['/contra', 'dpad', 'full'],
    ]) {
        const block = blockOf(p)
        ok(new RegExp(`supports: \\['${kinds}', 'full'\\]`).test(block), `${p} offers the full pad (#3118 rollout)`)
        ok(!/\btype: '/.test(block), `${p} grants supports without overriding the derived default (${why} stays default)`)
    }
    ok(/label: 'THROW', code: 'KeyN', pad: 3/.test(blockOf('/r-type')), 'R-TYPE throws on △ in the full diamond (#2931 verb survives the switch)')
    ok(/code: 'KeyZ', pad: 2/.test(blockOf('/double-dragon')), 'DOUBLE DRAGON punches on □ — diamond renders, PUNCH never orphaned')
    // #3132 — chrome audit grants: ZELDA + LEMMINGS join the rollout ONLY with
    // their bottom-edge chrome moved out of the pad zone (SSX #894 law). The
    // pins below are the audit: a chrome move back to the bottom edge is red.
    {
        ok(/supports: \['stick', 'full'\]/.test(blockOf('/zelda')), 'ZELDA offers the full pad (#3132)')
        ok(!/\btype: '/.test(blockOf('/zelda')), 'ZELDA grant keeps the derived stick default')
        const zelda = readFileSync(new URL('../src/games/Zelda/index.jsx', import.meta.url), 'utf8')
        ok(zelda.includes('ctx.fillRect(0, 0, W, HUD)'), 'ZELDA HUD band is the canvas TOP strip (#3132)')
        ok(!zelda.includes('fillRect(0, PLAY_H, W, HUD)'), 'ZELDA HUD never returns to the bottom edge (#3132)')
        ok(zelda.includes('c.translate(0, HUD)'), 'ZELDA scene renders under the top band (#3132)')
        ok(/supports: \['pointer', 'full'\]/.test(blockOf('/lemmings')), 'LEMMINGS offers the full pad (#3132)')
        ok(!/\btype: '/.test(blockOf('/lemmings')), 'LEMMINGS grant keeps the derived pointer default')
        const lem = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
        ok(!/bottom: 'calc\(0\.5rem \+ env\(safe-area-inset-bottom\)\)'/.test(lem), 'LEMMINGS skill panel left the pad zone (#3132)')
        ok(/top: 'calc\(0\.5rem \+ env\(safe-area-inset-top\)\)'/.test(lem), 'LEMMINGS panel docks at the top edge (#3132)')
        ok(/top: play \? LAYOUT\.panelReserve : 0/.test(lem), 'LEMMINGS stage reserve moved with the panel (#3132)')
        const verbs = ["label: 'BLOCK', code: 'Digit1'", "code: 'Digit2', pad: 2", "code: 'Digit3', pad: 3", "code: 'Digit4', pad: 5"]
        ok(verbs.every((v) => blockOf('/lemmings').includes(v)), 'LEMMINGS full diamond carries BLOCK/BOMB/CLIMB + R DIG (#3132)')
        ok(/reads: \['pointer', 'a', 'b'\]/.test(blockOf('/lemmings')), 'LEMMINGS pad shows ✕ ACT + ○ BLOCK in full (#3132)')
    }
    // grants must not disturb the derived defaults
    ok(defaultTypeFor({ layout: 'stick', buttons: [], analog: false, supports: ['stick', 'full'] }) === 'stick', 'galaga-style grant keeps stick default')
    ok(defaultTypeFor({ layout: 'dpad', aLabel: 'JUMP', buttons: [], supports: ['dpad', 'full'] }) === 'dpad', 'dd-style grant keeps dpad default')
    ok(validPad({ method: 'dpad', ways: 4, supports: ['dpad', 'stick'], buttons: [], reads: ['up'] }), 'validPad accepts supports')
    ok(validPad({ layout: 'stick', buttons: [], type: 'full', supports: ['stick', 'full'] }), 'validPad accepts type+supports')
    ok(!validPad({ layout: 'stick', buttons: [], type: 'wheel' }), 'validPad rejects a nonsense type')
    ok(!validPad({ layout: 'stick', buttons: [], supports: [] }), 'validPad rejects an empty supports')
    ok(!validPad({ layout: 'stick', buttons: [], supports: ['dpad', 'vibes'] }), 'validPad rejects a nonsense support')
    ok(validPad({ layout: 'stick', buttons: [] }), 'validPad still accepts pads without the new fields')
    // every registry pad declaration stays parseable under the new rules
    const pads = src.match(/pad: \{/g) || []
    ok(pads.length > 10, `registry still declares ${pads.length} pads`)
}

// --- 6. the five rails are wired in the shell ---
{
    const vc = readFileSync(new URL('../src/components/VirtualControls.jsx', import.meta.url), 'utf8')
    ok(vc.includes('data-vc="fixedstick"') && vc.includes('data-vc="dpad"') && vc.includes('data-vc="facediamond"'), 'full-pad cluster markers')
    ok(vc.includes('data-vc="tilt-enable"') && vc.includes('data-vc="tilt-recenter"'), 'TILT affordances exist')
    ok(vc.includes("addEventListener('retrogames:padtype'"), 'VirtualControls subscribes to the switch event')
    ok(vc.includes("from './padTypes'"), 'VirtualControls runs on padTypes')
    ok(vc.includes('floatWays') && vc.includes('dpadDirs'), 'dpad->stick switch keeps the gate quantizer')
    const po = readFileSync(new URL('../src/components/PauseOverlay.jsx', import.meta.url), 'utf8')
    ok(po.includes('data-padtype') && po.includes('CONTROLLER'), 'pause menu carries the CONTROLLER row')
    ok(po.includes('min-h-11'), 'switch chips meet the 44px pill law')
    const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
    ok(app.includes('configurePadTypes(game.path'), 'the route configures the store per game')
    const ssx = readFileSync(new URL('../src/games/SSX/index.jsx', import.meta.url), 'utf8')
    ok(ssx.includes("padTypeUI !== 'full'"), 'SSX game-side stick yields to the full pad (#894 x #3108)')
}

console.log(`padtypecheck: ${pass}/${pass + fail} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)

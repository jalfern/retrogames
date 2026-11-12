// audiocheck — proves AudioController never binds a non-finite value (NaN / ±Infinity)
// to an AudioParam. A title's physics can produce NaN (Defender's hum is
// `50 + |vx|*8`; a divide-by-zero anywhere upstream poisons it). In Chrome every
// AudioParam setter throws `... is non-finite` on such a value — a page error that
// can kill the caller's frame loop, counted by every smoke suite's "zero page
// errors" gate. This harness swaps in a fake AudioContext whose params reject
// non-finite exactly like Chrome, drives the whole public surface with valid args
// AND with NaN/Infinity at every AudioParam-bound position, and asserts:
//   * no call throws,
//   * every value a setter actually received stays finite,
//   * valid cues still schedule (the guards are surgical, not a blanket mute),
//   * a malformed cue is DROPPED (the sfx counter does not move — a cue that
//     schedules nothing must not count as feedback).
// Self-proving: remove any guard in AudioController.js and the matching NaN call
// throws → this check goes red. (--kill flips one guard at runtime for the demo.)
import { audioController } from '../src/utils/AudioController.js'

let pass = 0, fail = 0
const bound = []            // every (param, value, op) the fake recorded
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`PASS  ${name}`) }
    else { fail++; console.log(`FAIL  ${name}  ${extra}`) }
}

// ---- Chrome-faithful fake --------------------------------------------------
function guard(v, op) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        throw new TypeError(`Failed to execute '${op}' on 'AudioParam': The provided float value is non-finite.`)
    bound.push(v)
}
const param = (v = 0) => ({
    value: v,
    setValueAtTime(x, t) { guard(x, 'setValueAtTime'); guard(t, 'setValueAtTime'); this.value = x; return this },
    linearRampToValueAtTime(x, t) { guard(x, 'linearRampToValueAtTime'); guard(t, 'linearRampToValueAtTime'); return this },
    exponentialRampToValueAtTime(x, t) {
        guard(x, 'exponentialRampToValueAtTime'); guard(t, 'exponentialRampToValueAtTime')
        if (x === 0) throw new RangeError('exponentialRampToValueAtTime: target must be positive')
        return this
    },
    setTargetAtTime(x, t, c) { guard(x, 'setTargetAtTime'); guard(t, 'setTargetAtTime'); guard(c, 'setTargetAtTime'); return this },
    cancelScheduledValues() { return this },
})
let oscCount = 0
const ctx = {
    _t: 1,
    get currentTime() { return this._t },
    sampleRate: 44100,
    state: 'running',
    destination: {},
    resume() { return Promise.resolve() },
    createGain: () => ({ gain: param(1), connect() {} }),
    createOscillator: () => {
        oscCount++
        return { type: 'sine', frequency: param(440), detune: param(0), connect() {}, start(t) { if (t !== undefined) guard(t, 'start') }, stop(t) { if (t !== undefined) guard(t, 'stop') } }
    },
    createBufferSource: () => ({ buffer: null, connect() {}, start(t) { if (t !== undefined) guard(t, 'start') } }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(Math.max(0, len | 0)) }),
    createBiquadFilter: () => ({ type: '', frequency: param(350), Q: param(1), connect() {} }),
    createStereoPanner: () => ({ pan: param(0), connect() {} }),
    createPanner: () => ({ panningModel: '', distanceModel: '', refDistance: 1, maxDistance: 1000, rolloffFactor: 0, positionX: param(0), positionY: param(0), positionZ: param(0), connect() {} }),
    createAnalyser: () => ({ fftSize: 256, connect() {}, getByteTimeDomainData: (d) => d.fill(128) }),
}
global.window = { AudioContext: function () { return ctx } }
// the module's DEV readback hook touches import.meta.env; Node has it as undefined,
// but `?.` keeps it off this path. startMusic's scheduler uses setInterval — present.

const ac = audioController
ac.init()
ok('boots: ctx + musicGain built', !!ac.ctx && !!ac.musicGain)

// ---- 1. valid cues still schedule (guards are surgical) ------------------
let osc0 = oscCount
ac.playTone(440, 0.1, 'square', 0.1)
ok('valid playTone schedules an oscillator', oscCount === osc0 + 1, `osc ${osc0}->${oscCount}`)
const sfxAfterValid = ac.sfx
ac.playTone(330, 0.1, 'square', 0.1, 0, 0.5)   // panned valid cue (StereoPanner path)
ok('valid panned playTone counts as one sfx', ac.sfx === sfxAfterValid + 1)
ac.playSweep(300, 700, 0.12, 'triangle', 0.12)
ac.playNoise(0.08, 0.12)
ac.playFilteredNoise(0.2, 0.2, 800, 0.05)
ac.ambTone(120, 0.1, 'sawtooth', 0.05)
ac.ambSweep(140, 70, 0.2, 'triangle', 0.06)
ac.ambNoise(0.15, 0.2)
ok('valid cues bound only finite params', bound.every(Number.isFinite), JSON.stringify(bound.filter((v) => !Number.isFinite(v))))

// NaN pan is DECORATION, not a load-bearing arg: the _panner guard returns null so
// the cue falls back to mono (valid freq, audible) rather than dropping the whole
// cue. It must still schedule, still count, and never bind a non-finite pan.
{
    const oscP = oscCount, sfxP = ac.sfx
    ac.playTone(440, 0.1, 'square', 0.1, 0, NaN)
    ok('NaN pan falls back to mono (cue still plays)', oscCount === oscP + 1 && ac.sfx === sfxP + 1)
    ac.playNoise(0.08, 0.12, NaN)
    ok('NaN pan noise falls back to mono', ac.sfx === sfxP + 2)
    ok('NaN pan never reaches a StereoPanner/Panner param', bound.every(Number.isFinite))
}

// ---- 2. NaN / Infinity at every AudioParam-bound position ---------------
// Chrome threw on each of these before the guards existed; here none may throw,
// none may bind a non-finite value, and the sfx counter must not move.
const NaNv = NaN, Inf = Infinity
const badCalls = [
    ['playTone freq', () => ac.playTone(NaNv, 0.1, 'square', 0.1)],
    ['playTone freq Inf', () => ac.playTone(Inf, 0.1)],
    ['playTone duration', () => ac.playTone(440, NaNv)],
    ['playTone vol', () => ac.playTone(440, 0.1, 'square', NaNv)],
    ['playTone delay', () => ac.playTone(440, 0.1, 'square', 0.1, NaNv)],
    ['playSweep start', () => ac.playSweep(NaNv, 700, 0.12)],
    ['playSweep end', () => ac.playSweep(300, NaNv, 0.12)],
    ['playSweep duration', () => ac.playSweep(300, 700, NaNv)],
    ['playSweep vol', () => ac.playSweep(300, 700, 0.12, 'triangle', NaNv)],
    ['playSweep delay', () => ac.playSweep(300, 700, 0.12, 'triangle', 0.1, null, NaNv)],
    ['playNoise duration', () => ac.playNoise(NaNv, 0.12)],
    ['playNoise vol', () => ac.playNoise(0.08, NaNv)],
    ['playFilteredNoise duration', () => ac.playFilteredNoise(NaNv, 0.2, 800)],
    ['playFilteredNoise freq', () => ac.playFilteredNoise(0.2, 0.2, NaNv)],
    ['ambTone freq', () => ac.ambTone(NaNv, 0.1)],
    ['ambTone duration', () => ac.ambTone(120, NaNv)],
    ['ambSweep start', () => ac.ambSweep(NaNv, 70, 0.2)],
    ['ambSweep end', () => ac.ambSweep(140, NaNv, 0.2)],
    ['ambNoise duration', () => ac.ambNoise(NaNv, 0.2)],
    ['duckMusic to', () => ac.duckMusic(NaNv, 0.35)],
    ['duckMusic hold', () => ac.duckMusic(0.5, NaNv)],
    ['setMusicLevel NaN', () => ac.setMusicLevel(NaNv)],
    ['setMusicStep NaN', () => ac.setMusicStep(NaNv)],
    ['setMuffle NaN', () => ac.setMuffle(NaNv)],
    ['_note freq', () => ac._note(NaNv, 1, 0.1)],
    ['_note vol', () => ac._note(440, 1, 0.1, 'square', NaNv)],
]
const oscBefore = oscCount
const sfxBefore = ac.sfx
let threw = 0, poisoned = false
for (const [name, fn] of badCalls) {
    const before = ac.sfx
    try {
        fn()
        if (ac.sfx !== before) poisoned = true // a malformed cue was counted as feedback
    } catch (e) { threw++; console.log(`      THREW on ${name}: ${e.message}`) }
}
ok('no non-finite arg throws', threw === 0, `${threw}/${badCalls.length} threw`)
ok('no non-finite value reaches an AudioParam', bound.every(Number.isFinite), JSON.stringify(bound.filter((v) => !Number.isFinite(v))))
ok('a malformed cue is dropped, not counted as feedback', !poisoned)
ok('a malformed cue starts no oscillator', oscCount === oscBefore, `osc ${oscBefore}->${oscCount}`)

// ---- 3. the held level / bed survive the poison --------------------------
ac.setMusicLevel(0.5)
ok('a valid setMusicLevel still holds the bed', ac.musicScale === 0.5)
ac.setMusicLevel(NaNv)
ok('NaN setMusicLevel does not corrupt the held level', ac.musicScale === 0.5)
ac.setMuted(true)
ac.playTone(440, 0.1)
ok('muted path stays inert (no sfx)', ac.sfx === sfxBefore, `sfx ${sfxBefore}->${ac.sfx}`)

console.log(`\naudiocheck: ${pass}/${pass + fail} checks passed${fail ? '  — FAIL' : '  — OK'}`)
process.exit(fail ? 1 : 0)

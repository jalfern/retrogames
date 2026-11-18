// FAKE-MIC (#2709) — the synth-mic replacement for headless Chrome 157+.
//
// Why this exists: headless Chrome 157 (157.0.8103.79, macOS) delivers ZERO
// MediaRecorder chunks when getUserMedia is overridden with a
// WebAudio MediaStreamDestination stream — the trick every voice suite used
// since #1247. The probe matrix is in issue #2709; the recorder itself is
// healthy (`--use-fake-device-for-media-stream` records fine), it is the
// WebAudio-destination stream that goes silent. The audited fix route:
// `--use-file-for-fake-audio-capture=<wav>` — bake hum+claps into a real
// 48 kHz WAV, let Chrome's fake capture device deliver it, and every layer
// under test (gUM, MediaRecorder, opus, the tick clock, v2 assembly, the
// upload, the decode) runs UNTOUCHED on real bytes. Only the sound source
// moves from WebAudio to the device boundary — strictly closer to a phone
// than the WebAudio loopback was, and the honest source of what a take is.
//
// Honesty rule (the #1711 audit lineage): the source stays NAMED, never
// laundered. Drivers stamp their runs `mic capture: fake-file (baked)` and
// micprobe prints the Chrome version + what each capture shape delivered, so
// the next engine break is named by a check, not discovered mid-suite.
//
// API:
//   bakeFakeMicWav({ clapMs, secs })   -> tmp wav path (PCM16 mono 48 kHz,
//                                        hum floor + full-scale claps at exact
//                                        sample offsets; deterministic — same
//                                        seed/envelope the old synth baked, so
//                                        what survives opus survives here too).
//   fakeMicArgs(wavPath)              -> Chrome launch args (fake device +
//                                        pre-granted bubble + this file).
//   fakeMicInit                       -> page init script: wraps the REAL
//                                        getUserMedia (no stream synthesis),
//                                        stamps __gumCallWall/__gumResolveWall,
//                                        honours window.__MICDELAY (the audited
//                                        late-mic phone shape, #1711 audit item
//                                        3), and derives window.__clapWall =
//                                        resolve + baked offset + PRIME_MS so
//                                        drivers keep the exact same aiming
//                                        surface the synth path exposed.
//   PRIME_MS                        -> measured baked-file priming (the gap
//                                        between gUM-resolve and the fake
//                                        device's first delivered samples);
//                                        micprobe re-measures it on demand.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Measured on this Mac by scripts/micprobe.mjs against Chrome 157.0.8103.79:
// claps heard at baked+17.6 ms, spread 0.2 ms across the trio — the fake-file
// device sits a constant distance behind the clock's zero, so drivers aim at
// resolve + clapMs + PRIME_MS (the #2136 close-loop re-anchor then pulls the
// aim onto the clock's own zero and the close-loop absorbs frame quantising).
export const PRIME_MS = Number(process.env.FAKE_MIC_PRIME_MS || 18)

// Deterministic LCG — identical noise to the old synth-mic bake (#2156).
function lcg(seed) {
    let s = seed
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
}

/**
 * Bake hum + full-scale claps into a PCM16 mono WAV and return its path.
 * `clapMs` are offsets from the moment the fake device starts delivering
 * (= file position 0 at device-open, probe-verified #2709). Same envelope
 * the synth used (low noise + 190/760 Hz sines, exp decay 12 ms): what
 * survived opus then survives opus now.
 */
export function bakeFakeMicWav({ clapMs = [], secs = 14, sr = 48000, file = null } = {}) {
    const n = Math.round(secs * sr)
    const buf = Buffer.alloc(44 + n * 2)
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20) // PCM
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28)
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
    const rnd = lcg(12345)
    const claps = clapMs.map((ms) => Math.round((ms / 1000) * sr))
    for (let i = 0; i < n; i++) {
        let v = 0.03 * Math.sin(2 * Math.PI * 220 * i / sr) // hum floor
        for (const c of claps) {
            const k = i - c
            if (k >= 0 && k < 0.05 * sr) {
                const env = Math.exp(-k / (0.012 * sr))
                v = (0.55 * rnd() + 0.55 * Math.sin(k * 2 * Math.PI * 190 / sr) + 0.35 * Math.sin(k * 2 * Math.PI * 760 / sr)) * env
            }
        }
        buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, v)) * 32767))), 44 + i * 2)
    }
    const p = file || path.join(fs.realpathSync(os.tmpdir()), `fakemic-${Math.round(secs)}s-${clapMs.join('_') || 'hum'}.wav`)
    fs.writeFileSync(p, buf)
    return p
}

export function fakeMicArgs(wavPath) {
    // NOTE the correct suffixes: `-for-media-stream` (the drivers historically
    // passed a `-for-media-capture` spelling that matches no Chrome flag —
    // headless's default fake device is what silently carried them, #2709).
    return [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${wavPath}`,
    ]
}

/**
 * Page init script. The wrapper NEVER synthesises a stream: it calls through
 * to the real getUserMedia (which the fake-file flag answers) and only adds
 * stamps + the audited late-mic delay. window.__CLAP.clapMs is armed by the
 * driver after load, same surface as before.
 */
export function fakeMicInit() {
    window.__CLAP = { clapMs: [] }
    const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null
    if (!orig) return // no gUM at all — the driver's own gates report that honestly
    navigator.mediaDevices.getUserMedia = (c) => {
        window.__gumCallWall = Date.now()
        const d = window.__MICDELAY || 0
        const go = () => orig(c).then((s) => {
            window.__gumResolveWall = Date.now()
            const ms = (window.__CLAP && window.__CLAP.clapMs) || []
            window.__clapWall = ms.map((m) => window.__gumResolveWall + m + (window.__FAKE_PRIME_MS || 0))
            return s
        })
        return d > 0 ? new Promise((res) => setTimeout(() => res(go()), d)) : go()
    }
}

// Runtime-synthesized audio, ported from src/utils/AudioController.js and the
// Emberwood fx→sound map in src/games/Emberwood/index.jsx: tone / sweep /
// noise / filtered-noise one-shots, the three original beds (vale, deep,
// ashfell) with their dum/tek percussion, the combat-heat tempo seam, music
// ducking and the fanfare. No audio assets.

import AVFoundation

final class Synth {
    enum Wave { case square, sawtooth, triangle, sine }
    enum Env { case exp, linear, note, perc }
    enum Filter { case none, lowpass(Double), highpass(Double) }

    struct Voice {
        var start: Int, len: Int
        var f0: Double, f1: Double
        var expSweep = false
        var wave: Wave?        // nil = noise
        var vol: Double
        var env: Env
        var music = false
        var filter = Filter.none
        var phase = 0.0, z = 0.0, zx = 0.0
    }

    static let shared = Synth()
    static let MUSIC_BUS = 0.16

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode!
    private let lock = NSLock()
    private var voices: [Voice] = []
    private var now = 0
    private var sr = 44100.0
    private var rng: UInt32 = 0x1234_5678

    // music bus gain (render thread reads, main thread writes under the lock)
    private var musicGain = MUSIC_BUS
    private var duckFrom = 1.0, duckTo = 1.0, duckT0 = 0.0, duckHold = 0.0
    var musicLevel = 1.0 // held fraction (attract runs the bed at 0.45)

    // sequencer (main thread)
    struct Bed { let step: Double; let lead: [Int]; let bass: [Int]; let perc: [Int] }
    static let BEDS: [String: Bed] = [
        "emberwoodVale": Bed(step: 0.13,
            lead: [62, 0, 66, 0, 69, 0, 71, 69, 66, 0, 69, 0, 62, 0, 0, 0, 67, 0, 69, 0, 71, 0, 74, 71, 69, 0, 66, 0, 62, 0, 66, 0],
            bass: [38, 0, 38, 0, 45, 0, 38, 0, 43, 0, 43, 0, 40, 0, 38, 0, 38, 0, 38, 0, 45, 0, 38, 0, 43, 0, 45, 0, 38, 0, 0, 0],
            perc: [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 1, 2, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 2, 0]),
        "emberwoodDeep": Bed(step: 0.17,
            lead: [57, 0, 0, 60, 0, 0, 62, 0, 64, 0, 0, 0, 60, 0, 59, 0, 57, 0, 0, 60, 0, 0, 64, 0, 62, 0, 0, 60, 0, 0, 57, 0],
            bass: [45, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 45, 0, 0, 0, 40, 0, 0, 0, 43, 0, 45, 0],
            perc: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0]),
        "emberwoodAshfell": Bed(step: 0.18,
            lead: [69, 0, 0, 72, 0, 0, 0, 74, 0, 0, 76, 0, 0, 0, 74, 0, 0, 0, 72, 0, 0, 74, 0, 0, 71, 0, 0, 0, 69, 0, 0, 0],
            bass: [45, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0],
            perc: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0]),
    ]
    private(set) var track: String?
    var suspended = false
    private var musicStep = 0
    private var musicNext = 0.0
    private var stepDur = 0.13

    private init() {
        let fmt = engine.outputNode.inputFormat(forBus: 0)
        sr = fmt.sampleRate > 0 ? fmt.sampleRate : 44100
        let mono = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1)!
        node = AVAudioSourceNode(format: mono) { [unowned self] _, _, frames, abl in
            let buf = UnsafeMutableAudioBufferListPointer(abl)
            let out = buf[0].mData!.assumingMemoryBound(to: Float.self)
            self.render(out, Int(frames))
            for b in 1..<buf.count { memcpy(buf[b].mData!, out, Int(frames) * 4) }
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: mono)
        #if os(iOS) || os(tvOS)
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif
        try? engine.start()
    }

    private var clock: Double { lock.lock(); defer { lock.unlock() }; return Double(now) / sr }
    private func add(_ v: Voice) { lock.lock(); voices.append(v); lock.unlock() }

    private func busGain(_ t: Double) -> Double {
        // duck: 30 ms down to duckTo, linear back to the held level by duckHold
        let held = Synth.MUSIC_BUS * musicLevel
        let dt = t - duckT0
        if dt < 0 || dt >= duckHold { return held }
        if dt < 0.03 { return duckFrom + (Synth.MUSIC_BUS * duckTo - duckFrom) * dt / 0.03 }
        let lo = Synth.MUSIC_BUS * duckTo
        return lo + (held - lo) * (dt - 0.03) / max(0.001, duckHold - 0.03)
    }

    private func render(_ out: UnsafeMutablePointer<Float>, _ n: Int) {
        lock.lock()
        let t0 = now
        for i in 0..<n { out[i] = 0 }
        let mg = busGain(Double(t0) / sr)
        var k = 0
        while k < voices.count {
            var v = voices[k]
            let s0 = max(0, v.start - t0)
            let end = v.start + v.len
            if s0 < n {
                for i in s0..<n {
                    let si = t0 + i - v.start
                    if si >= v.len { break }
                    let u = Double(si) / Double(v.len)
                    let tt = Double(si) / sr, dur = Double(v.len) / sr
                    let g: Double
                    switch v.env {
                    case .exp: g = v.vol * pow(0.01 / v.vol, u)
                    case .linear: g = v.vol + (0.01 - v.vol) * u
                    case .note:
                        g = tt < 0.01 ? 0.0001 * pow(v.vol / 0.0001, tt / 0.01)
                            : v.vol * pow(0.0001 / v.vol, min(1, (tt - 0.01) / max(0.001, dur - 0.02)))
                    case .perc: g = v.vol * pow(0.0001 / v.vol, min(1, tt / 0.12))
                    }
                    var s: Double
                    if let w = v.wave {
                        let f = v.expSweep ? v.f0 * pow(v.f1 / v.f0, min(1, tt / 0.09)) : v.f0 + (v.f1 - v.f0) * u
                        v.phase += f / sr
                        v.phase -= v.phase.rounded(.down)
                        let p = v.phase
                        switch w {
                        case .square: s = p < 0.5 ? 1 : -1
                        case .sawtooth: s = 2 * p - 1
                        case .triangle: s = p < 0.5 ? 4 * p - 1 : 3 - 4 * p
                        case .sine: s = sin(2 * .pi * p)
                        }
                    } else {
                        rng = rng &* 1664525 &+ 1013904223
                        s = Double(rng >> 8) / Double(1 << 23) - 1
                        switch v.filter {
                        case .none: break
                        case let .lowpass(fc):
                            let a = 1 - exp(-2 * .pi * fc / sr)
                            v.z += a * (s - v.z); s = v.z
                        case let .highpass(fc):
                            let a = exp(-2 * .pi * fc / sr)
                            let y = a * (v.z + s - v.zx); v.zx = s; v.z = y; s = y * (1 - u)
                        }
                    }
                    out[i] += Float(s * g * (v.music ? mg : 1) * 0.6)
                }
            }
            if end <= t0 + n { voices.remove(at: k) } else { voices[k] = v; k += 1 }
        }
        for i in 0..<n { out[i] = max(-1, min(1, out[i])) }
        now += n
        lock.unlock()
    }

    private func samples(_ sec: Double) -> Int { max(1, Int(sec * sr)) }

    // ---- AudioController primitives ----
    func tone(_ f: Double, _ d: Double, _ w: Wave = .square, _ vol: Double = 0.1, _ delay: Double = 0) {
        add(Voice(start: samples(clock + delay + 0.005), len: samples(d), f0: f, f1: f, wave: w, vol: vol, env: .exp))
    }
    func sweep(_ f0: Double, _ f1: Double, _ d: Double, _ w: Wave = .triangle, _ vol: Double = 0.1) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: f0, f1: f1, wave: w, vol: vol, env: .linear))
    }
    func noise(_ d: Double, _ vol: Double = 0.2) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: 0, f1: 0, wave: nil, vol: vol, env: .exp))
    }
    func filteredNoise(_ d: Double, _ vol: Double = 0.2, _ freq: Double = 800) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: 0, f1: 0, wave: nil, vol: vol, env: .exp, filter: .lowpass(freq)))
    }
    func duck(_ to: Double, _ hold: Double = 0.35) {
        lock.lock()
        let t = Double(now) / sr
        duckFrom = busGain(t); duckTo = to; duckT0 = t; duckHold = hold
        lock.unlock()
    }
    private func note(_ midi: Int, _ at: Double, _ dur: Double, _ w: Wave, _ vol: Double, music: Bool = true) {
        let f = 440 * pow(2, Double(midi - 69) / 12)
        add(Voice(start: samples(at), len: samples(dur + 0.02), f0: f, f1: f, wave: w, vol: vol, env: .note, music: music))
    }
    private func perc(_ v: Int, _ at: Double) {
        if v == 1 {
            add(Voice(start: samples(at), len: samples(0.14), f0: 160, f1: 55, expSweep: true, wave: .sine, vol: 0.5, env: .perc, music: true))
        } else if v == 2 {
            add(Voice(start: samples(at), len: samples(0.04), f0: 0, f1: 0, wave: nil, vol: 0.22, env: .linear, music: true, filter: .highpass(2500)))
        }
    }

    func fanfare() {
        stopMusic()
        let t = clock + 0.01
        let seq = [72, 76, 79, 84, 83, 79, 84]
        for (k, n) in seq.enumerated() { note(n, t + Double(k) * 0.11, 0.16, .square, 0.5) }
        note(88, t + Double(seq.count) * 0.11, 0.5, .square, 0.5)
        note(52, t + Double(seq.count) * 0.11, 0.5, .triangle, 0.6)
    }

    // ---- the beds ----
    func startMusic(_ name: String) {
        if track == name { return }
        stopMusic()
        guard let b = Synth.BEDS[name] else { return }
        track = name
        musicStep = 0
        stepDur = b.step
        musicNext = clock + 0.06
    }

    func stopMusic() {
        track = nil
        lock.lock(); voices.removeAll { $0.music && $0.start > now }; lock.unlock()
    }

    /// setMusicStep: the combat-heat tempo seam
    func setStep(_ sec: Double) { if sec > 0 { stepDur = sec } }

    /// call every frame: schedules notes up to 0.12 s ahead (AudioController._schedule)
    func pump() {
        guard let name = track, let b = Synth.BEDS[name], !suspended else { return }
        let c = clock
        if musicNext < c - 0.5 { musicNext = c + 0.02 }
        while musicNext < c + 0.12 {
            let i = musicStep % b.lead.count
            if b.lead[i] != 0 { note(b.lead[i], musicNext, stepDur * 0.9, .square, 0.5) }
            if b.bass[i] != 0 { note(b.bass[i], musicNext, stepDur * 1.1, .triangle, 0.6) }
            if b.perc[i] != 0 { perc(b.perc[i], musicNext) }
            musicNext += stepDur
            musicStep += 1
        }
    }

    // ---- index.jsx fxSound ----
    func fx(_ k: String, boss: Int = 0) {
        switch k {
        case "sword": tone(560, 0.06, .square, 0.05); filteredNoise(0.05, 0.04, 1600)
        case "hit": noise(0.08, 0.09); duck(0.5, 0.25)
        case "die": sweep(320, 90, 0.28, .sawtooth, 0.08); if boss != 0 { duck(0.3, 0.8) }
        case "cut": noise(0.05, 0.05)
        case "boom": sweep(160, 40, 0.4, .sawtooth, 0.12); noise(0.3, 0.1); duck(0.35, 0.5)
        case "crack": noise(0.25, 0.12)
        case "coin": tone(880, 0.05, .square, 0.05); tone(1320, 0.07, .square, 0.05, 0.05)
        case "heart": tone(660, 0.08, .square, 0.06); tone(990, 0.12, .square, 0.06, 0.07)
        case "key": tone(740, 0.06, .triangle, 0.06); tone(1110, 0.1, .triangle, 0.06, 0.06)
        case "unlock": tone(440, 0.05, .square, 0.05); tone(660, 0.09, .square, 0.05, 0.05)
        case "switch": tone(300, 0.08, .square, 0.07); tone(220, 0.12, .square, 0.05, 0.08)
        case "shoot": tone(700, 0.05, .triangle, 0.05)
        case "spit": tone(240, 0.06, .sawtooth, 0.04)
        case "hurt": sweep(220, 110, 0.18, .sawtooth, 0.09); duck(0.3, 0.5)
        case "heroDeath": sweep(300, 50, 0.7, .sawtooth, 0.1); duck(0.15, 1.2)
        case "revive": sweep(200, 620, 0.35, .triangle, 0.07)
        case "clank": tone(1200, 0.04, .square, 0.05)
        case "stagger": sweep(400, 60, 0.5, .sawtooth, 0.12); duck(0.25, 0.7)
        case "pop": tone(500, 0.05, .triangle, 0.05)
        case "grunt": sweep(150, 85, 0.2, .sawtooth, 0.07)
        case "dust": filteredNoise(0.05, 0.025, 420)
        case "split": tone(520, 0.05, .square, 0.05); noise(0.08, 0.06)
        case "read": tone(620, 0.05, .triangle, 0.04)
        case "ui": tone(880, 0.04, .square, 0.04)
        case "warp": sweep(300, 900, 0.25, .sine, 0.06)
        case "grant": for (i, f) in [660.0, 880, 1100, 1320].enumerated() { tone(f, 0.1, .square, 0.05, Double(i) * 0.09) }
        case "buy": tone(980, 0.06, .square, 0.05); tone(1240, 0.08, .square, 0.05, 0.06)
        case "potion": sweep(400, 800, 0.2, .sine, 0.06)
        case "gust": filteredNoise(0.28, 0.09, 900); sweep(300, 700, 0.22, .sine, 0.04)
        case "galecharge": sweep(160, 640, 0.3, .triangle, 0.06); filteredNoise(0.3, 0.045, 900)
        case "seal": tone(340, 0.08, .square, 0.05); noise(0.12, 0.06)
        case "spore": filteredNoise(0.16, 0.05, 600)
        case "mantle": sweep(200, 60, 0.3, .square, 0.09); noise(0.2, 0.09); duck(0.4, 0.4)
        case "roar": sweep(140, 50, 0.5, .sawtooth, 0.11); duck(0.25, 0.8)
        case "placebomb": tone(130, 0.05, .sine, 0.07); tone(2100, 0.015, .square, 0.02, 0.04)
        case "chest": sweep(190, 330, 0.18, .triangle, 0.05); noise(0.09, 0.04)
        case "draw": sweep(230, 400, 0.12, .triangle, 0.035)
        case "push": filteredNoise(0.14, 0.05, 320)
        case "thunk": tone(95, 0.11, .sine, 0.1)
        default: break
        }
    }
}

// The runtime voice engine every port's audio runs on, ported from
// src/utils/AudioController.js: tone / sweep / noise / filtered-noise
// one-shots, scheduled notes on a 0.16 music bus with ducking, the dum/tek
// percussion, a lead+bass(+perc) bed sequencer and the fanfare / death
// jingles. No audio assets. Each game subclasses it as its own `Synth` and
// keeps its sound map (sfx ids → recipes) and beds there.

import AVFoundation

open class SynthEngine {
    public enum Wave { case square, sawtooth, triangle, sine }
    public enum Env { case exp, linear, note, perc }
    public enum Filter { case none, lowpass(Double), highpass(Double) }

    struct Voice {
        var start: Int, len: Int
        var f0: Double, f1: Double
        var expSweep = false
        var wave: Wave?        // nil = noise
        var vol: Double
        var env: Env
        var music = false      // on the music bus: ducked, scaled by musicLevel
        var bus = 1.0          // fixed gain when not on the music bus
        var filter = Filter.none
        var phase = 0.0, z = 0.0, zx = 0.0
    }

    public static let MUSIC_BUS = 0.16

    /// A looping bed: one step per entry; 0 = rest. perc: 1 = dum, 2 = tek.
    public struct Bed {
        public let step: Double, lead: [Int], bass: [Int], perc: [Int]
        public init(step: Double, lead: [Int], bass: [Int], perc: [Int] = []) { self.step = step; self.lead = lead; self.bass = bass; self.perc = perc }
    }

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode!
    private let lock = NSLock()
    private var voices: [Voice] = []
    private var now = 0 // samples rendered so far (render thread)
    private var sr = 44100.0
    private var rng: UInt32 = 0x1234_5678
    /// the .note envelope's release reaches its floor at dur - noteRelease
    /// (Joust's port used 0.01, Emberwood's and Gauntlet's 0.02)
    private let noteRelease: Double

    // music bus gain (render thread reads, main thread writes under the lock)
    private var duckFrom = 1.0, duckTo = 1.0, duckT0 = 0.0, duckHold = 0.0
    public var musicLevel = 1.0 // held fraction of MUSIC_BUS (Emberwood's attract runs the bed at 0.45)

    // bed sequencer (main thread)
    public private(set) var track: String?
    public var suspended = false // paused: the bed holds its place
    private var bed: Bed?
    private var musicStep = 0
    private var musicNext = 0.0
    private var stepDur = 0.13

    public init(noteRelease: Double = 0.02) {
        self.noteRelease = noteRelease
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

    /// seconds of audio rendered so far: schedule notes against this
    public var clock: Double { lock.lock(); defer { lock.unlock() }; return Double(now) / sr }
    private func add(_ v: Voice) { lock.lock(); voices.append(v); lock.unlock() }

    private func busGain(_ t: Double) -> Double {
        // duck: 30 ms down to duckTo, linear back to the held level by duckHold
        let held = SynthEngine.MUSIC_BUS * musicLevel
        let dt = t - duckT0
        if dt < 0 || dt >= duckHold { return held }
        if dt < 0.03 { return duckFrom + (SynthEngine.MUSIC_BUS * duckTo - duckFrom) * dt / 0.03 }
        let lo = SynthEngine.MUSIC_BUS * duckTo
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
                            : v.vol * pow(0.0001 / v.vol, min(1, (tt - 0.01) / max(0.001, dur - noteRelease)))
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
                    out[i] += Float(s * g * (v.music ? mg : v.bus) * 0.6)
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
    public func tone(_ f: Double, _ d: Double, _ w: Wave = .square, _ vol: Double = 0.1, _ delay: Double = 0) {
        add(Voice(start: samples(clock + delay + 0.005), len: samples(d), f0: f, f1: f, wave: w, vol: vol, env: .exp))
    }
    public func sweep(_ f0: Double, _ f1: Double, _ d: Double, _ w: Wave = .triangle, _ vol: Double = 0.1) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: f0, f1: f1, wave: w, vol: vol, env: .linear))
    }
    public func noise(_ d: Double, _ vol: Double = 0.2) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: 0, f1: 0, wave: nil, vol: vol, env: .exp))
    }
    public func filteredNoise(_ d: Double, _ vol: Double = 0.2, _ freq: Double = 800) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: 0, f1: 0, wave: nil, vol: vol, env: .exp, filter: .lowpass(freq)))
    }
    /// dip the music bus to `to` (× MUSIC_BUS) for `hold` seconds
    public func duck(_ to: Double, _ hold: Double = 0.35) {
        lock.lock()
        let t = Double(now) / sr
        duckFrom = busGain(t); duckTo = to; duckT0 = t; duckHold = hold
        lock.unlock()
    }
    /// a scheduled note at absolute time `at` (see `clock`); music = on the
    /// ducked music bus, otherwise at the fixed gain `bus`
    public func note(_ midi: Int, _ at: Double, _ dur: Double, _ w: Wave, _ vol: Double, music: Bool = true, bus: Double = 1) {
        let f = 440 * pow(2, Double(midi - 69) / 12)
        add(Voice(start: samples(at), len: samples(dur + 0.02), f0: f, f1: f, wave: w, vol: vol, env: .note, music: music, bus: bus))
    }
    /// 1 = dum (a sine kick), 2 = tek (high-passed noise), on the music bus
    public func perc(_ v: Int, _ at: Double) {
        if v == 1 {
            add(Voice(start: samples(at), len: samples(0.14), f0: 160, f1: 55, expSweep: true, wave: .sine, vol: 0.5, env: .perc, music: true))
        } else if v == 2 {
            add(Voice(start: samples(at), len: samples(0.04), f0: 0, f1: 0, wave: nil, vol: 0.22, env: .linear, music: true, filter: .highpass(2500)))
        }
    }

    // ---- jingles (each game picks the bus its port shipped with) ----
    public func playFanfare(music: Bool = true, bus: Double = 1) {
        stopMusic()
        let t = clock + 0.01
        let seq = [72, 76, 79, 84, 83, 79, 84]
        for (k, n) in seq.enumerated() { note(n, t + Double(k) * 0.11, 0.16, .square, 0.5, music: music, bus: bus) }
        note(88, t + Double(seq.count) * 0.11, 0.5, .square, 0.5, music: music, bus: bus)
        note(52, t + Double(seq.count) * 0.11, 0.5, .triangle, 0.6, music: music, bus: bus)
    }
    public func playDeath(music: Bool = false, bus: Double = 1) {
        stopMusic()
        let t = clock + 0.01
        for (k, n) in [72, 67, 63, 60, 55].enumerated() { note(n, t + Double(k) * 0.1, 0.16, .square, 0.45, music: music, bus: bus) }
    }

    // ---- the bed sequencer ----
    /// start `bed` under the name `name` (a no-op while that name is playing)
    public func playBed(_ name: String, _ bed: Bed) {
        if track == name { return }
        stopMusic()
        track = name
        self.bed = bed
        musicStep = 0
        stepDur = bed.step
        musicNext = clock + 0.06
    }

    /// stop the bed and drop its notes that haven't started yet
    public func stopMusic() {
        track = nil
        lock.lock(); voices.removeAll { $0.music && $0.start > now }; lock.unlock()
    }

    /// setMusicStep: the combat-heat tempo seam
    public func setStep(_ sec: Double) { if sec > 0 { stepDur = sec } }

    /// call every frame: schedules notes up to 0.12 s ahead (AudioController._schedule)
    public func pump() {
        guard track != nil, let b = bed, !suspended else { return }
        let c = clock
        if musicNext < c - 0.5 { musicNext = c + 0.02 } // resumed after a stall: don't burst
        while musicNext < c + 0.12 {
            let i = musicStep % b.lead.count
            if b.lead[i] != 0 { note(b.lead[i], musicNext, stepDur * 0.9, .square, 0.5) }
            if b.bass[i] != 0 { note(b.bass[i], musicNext, stepDur * 1.1, .triangle, 0.6) }
            if !b.perc.isEmpty, b.perc[i] != 0 { perc(b.perc[i], musicNext) }
            musicNext += stepDur
            musicStep += 1
        }
    }
}

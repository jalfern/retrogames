// Runtime-synthesized audio, ported from src/utils/AudioController.js and
// src/games/Joust/sounds.js: tone / sweep / noise one-shots, the fanfare and
// death jingles, and the Joust march on a 0.16 music bus. No audio assets.

import AVFoundation

final class Synth {
    enum Wave { case square, sawtooth, triangle, sine }
    enum Env { case exp, linear, note }

    struct Voice {
        var start: Int        // sample index
        var len: Int
        var f0: Double, f1: Double
        var wave: Wave?       // nil = noise
        var vol: Double
        var env: Env
        var bus: Double       // 1 = sfx, MUSIC_BUS = music
        var phase = 0.0
        var music = false
    }

    static let shared = Synth()
    static let MUSIC_BUS = 0.16

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode!
    private let lock = NSLock()
    private var voices: [Voice] = []
    private var now = 0 // samples rendered so far (render thread)
    private var sr = 44100.0
    private var rng: UInt32 = 0x1234_5678

    // music sequencer (main thread)
    private var musicOn = false
    var suspended = false // paused: the march holds its place
    private var musicStep = 0
    private var musicNext = 0.0 // seconds

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

    private func render(_ out: UnsafeMutablePointer<Float>, _ n: Int) {
        lock.lock()
        let t0 = now
        for i in 0..<n { out[i] = 0 }
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
                    let g: Double
                    switch v.env {
                    case .exp: g = v.vol * pow(0.01 / v.vol, u)
                    case .linear: g = v.vol + (0.01 - v.vol) * u
                    case .note:
                        let tt = Double(si) / sr, dur = Double(v.len) / sr
                        g = tt < 0.01 ? 0.0001 * pow(v.vol / 0.0001, tt / 0.01)
                            : v.vol * pow(0.0001 / v.vol, min(1, (tt - 0.01) / max(0.001, dur - 0.01)))
                    }
                    var s: Double
                    if let w = v.wave {
                        let f = v.f0 + (v.f1 - v.f0) * u
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
                    }
                    out[i] += Float(s * g * v.bus * 0.6)
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
    func tone(_ f: Double, _ d: Double, _ w: Wave = .square, _ vol: Double = 0.1, delay: Double = 0) {
        add(Voice(start: samples(clock + delay + 0.005), len: samples(d), f0: f, f1: f, wave: w, vol: vol, env: .exp, bus: 1))
    }
    func sweep(_ f0: Double, _ f1: Double, _ d: Double, _ w: Wave = .triangle, _ vol: Double = 0.1) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: f0, f1: f1, wave: w, vol: vol, env: .linear, bus: 1))
    }
    func noise(_ d: Double, _ vol: Double = 0.2) {
        add(Voice(start: samples(clock + 0.005), len: samples(d), f0: 0, f1: 0, wave: nil, vol: vol, env: .exp, bus: 1))
    }
    private func note(_ midi: Int, _ at: Double, _ dur: Double, _ w: Wave, _ vol: Double, music: Bool = false) {
        let f = 440 * pow(2, Double(midi - 69) / 12)
        add(Voice(start: samples(at), len: samples(dur + 0.02), f0: f, f1: f, wave: w, vol: vol, env: .note, bus: Synth.MUSIC_BUS, music: music))
    }

    func fanfare() {
        stopMusic()
        let t = clock + 0.01
        let seq = [72, 76, 79, 84, 83, 79, 84]
        for (k, n) in seq.enumerated() { note(n, t + Double(k) * 0.11, 0.16, .square, 0.5) }
        note(88, t + Double(seq.count) * 0.11, 0.5, .square, 0.5)
        note(52, t + Double(seq.count) * 0.11, 0.5, .triangle, 0.6)
    }

    func death() {
        stopMusic()
        let t = clock + 0.01
        for (k, n) in [72, 67, 63, 60, 55].enumerated() { note(n, t + Double(k) * 0.1, 0.16, .square, 0.45) }
    }

    // ---- the Joust march (MUSIC.joust) ----
    private let step = 0.14
    private let lead = [62, 65, 69, 74, 72, 69, 65, 62, 67, 70, 74, 79, 77, 74, 70, 67,
                        69, 72, 76, 81, 79, 76, 72, 69, 74, 0, 77, 0, 76, 74, 69, 0]
    private let bass = [38, 0, 45, 0, 38, 0, 45, 0, 43, 0, 50, 0, 43, 0, 50, 0,
                        36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 41, 0, 45, 0, 38, 0]

    func startMusic() {
        if musicOn { return }
        musicOn = true
        musicStep = 0
        musicNext = clock + 0.06
    }

    func stopMusic() {
        musicOn = false
        lock.lock(); voices.removeAll { $0.music && $0.start > now }; lock.unlock()
    }

    /// call every frame: schedules notes up to 0.12 s ahead (AudioController._schedule)
    func pump() {
        guard musicOn, !suspended else { return }
        let c = clock
        if musicNext < c - 0.5 { musicNext = c + 0.02 } // resumed after a stall: don't burst
        while musicNext < c + 0.12 {
            let i = musicStep % lead.count
            if lead[i] != 0 { note(lead[i], musicNext, step * 0.9, .square, 0.5, music: true) }
            if bass[i] != 0 { note(bass[i], musicNext, step * 1.1, .triangle, 0.6, music: true) }
            musicNext += step
            musicStep += 1
        }
    }

    // ---- sounds.js recipes ----
    func sfx(_ id: String) {
        switch id {
        case "joust": tone(180, 0.05, .square, 0.09); sweep(320, 760, 0.13, .sawtooth, 0.07)
        case "smite": tone(520, 0.04, .square, 0.07); sweep(480, 240, 0.11, .square, 0.06)
        case "death": noise(0.22, 0.16); sweep(300, 90, 0.2, .triangle, 0.1)
        case "egg-get": tone(880, 0.04, .triangle, 0.08); tone(1320, 0.06, .triangle, 0.07)
        case "egg-drop": sweep(300, 180, 0.06, .triangle, 0.06)
        case "hatch": sweep(150, 70, 0.22, .sawtooth, 0.09)
        case "crumble": noise(0.16, 0.1)
        case "clear": fanfare()
        case "oneup": tone(1046, 0.06, .square, 0.08); tone(1568, 0.08, .square, 0.07)
        case "over": death()
        case "win": fanfare(); tone(1760, 0.25, .square, 0.09)
        default: break
        }
    }
}

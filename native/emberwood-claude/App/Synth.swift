// Emberwood's sound: the fx→sound map from src/games/Emberwood/index.jsx and
// the three original beds (vale, deep, ashfell) with their dum/tek
// percussion, on RetroKit's SynthEngine (the AudioController.js port: music
// ducking, the combat-heat tempo seam, the fanfare). No audio assets.

import RetroKitApp

final class Synth: SynthEngine {
    static let shared = Synth()
    private init() { super.init() }

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

    func startMusic(_ name: String) {
        if track == name { return }
        guard let b = Synth.BEDS[name] else { stopMusic(); return }
        playBed(name, b)
    }

    func fanfare() { playFanfare() }

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

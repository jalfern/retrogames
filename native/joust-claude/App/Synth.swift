// Joust's sound: the recipes from src/games/Joust/sounds.js and the Joust
// march (MUSIC.joust), on RetroKit's SynthEngine (the AudioController.js port).
// This port's notes release at dur - 0.01 and its jingles play on the fixed
// 0.16 bus (not the ducked music bus), as it shipped. No audio assets.

import RetroKitApp

final class Synth: SynthEngine {
    static let shared = Synth()
    private init() { super.init(noteRelease: 0.01) }

    // ---- the Joust march (MUSIC.joust) ----
    static let MARCH = Bed(step: 0.14,
        lead: [62, 65, 69, 74, 72, 69, 65, 62, 67, 70, 74, 79, 77, 74, 70, 67,
               69, 72, 76, 81, 79, 76, 72, 69, 74, 0, 77, 0, 76, 74, 69, 0],
        bass: [38, 0, 45, 0, 38, 0, 45, 0, 43, 0, 50, 0, 43, 0, 50, 0,
               36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 41, 0, 45, 0, 38, 0])

    func startMusic() { playBed("joust", Synth.MARCH) }
    func fanfare() { playFanfare(music: false, bus: SynthEngine.MUSIC_BUS) }
    func death() { playDeath(music: false, bus: SynthEngine.MUSIC_BUS) }

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

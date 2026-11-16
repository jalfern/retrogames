// Gauntlet's sound: the death jingle and the narrator buzzes from sound.js,
// on RetroKit's SynthEngine (the AudioController.js port). The event→sound
// map from index.jsx handleEvents lives in GameViewController. No audio assets.

import RetroKitApp

final class Synth: SynthEngine {
    static let shared = Synth()
    private init() { super.init() }

    func death() { playDeath(music: false, bus: 1) }

    // ---- sound.js narrator: a two/three-note buzz under every toast ----
    func narrate(_ m: String) {
        let t = m.uppercased()
        let (w, notes): (Wave, [Double])
        if t.contains("DEATH") || t.contains("DEAD") { (w, notes) = (.sawtooth, [196, 147, 98]) }
        else if t.contains("SEALED") || t.contains("LOCKED") || t.contains("FIND A KEY") || t.contains("NEEDS FOOD") { (w, notes) = (.sawtooth, [220, 262, 220]) }
        else if t.contains("RESTORED") || t.contains("DONE") || t.contains("A KEY") || t.contains("HALLS CLEAR") { (w, notes) = (.square, [523, 659, 784]) }
        else if t.contains("ENTERS") { (w, notes) = (.square, [392, 523]) }
        else if t.contains("CLEARED") { (w, notes) = (.triangle, [659, 880, 1047]) }
        else { (w, notes) = (.triangle, [330, 415]) }
        for (i, f) in notes.enumerated() { tone(f, 0.08, w, 0.05, Double(i) * 0.07) }
    }
}

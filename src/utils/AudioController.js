// Audio: synthesized SFX + an original chiptune music engine.
// All music is composed here (original melodies in an 8-bit style) —
// no copyrighted game audio. Everything is generated at runtime via Web Audio.

// MIDI note -> frequency
const f = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Patterns: `lead` (square) + `bass` (triangle) share a step grid. 0 = rest.
const MUSIC = {
    // Cheerful overworld loop, C major
    overworld: {
        step: 0.13,
        lead: [
            72, 76, 79, 84, 81, 79, 76, 79, 74, 77, 81, 86, 84, 81, 77, 74,
            72, 76, 79, 84, 88, 84, 81, 79, 76, 79, 83, 88, 84, 79, 76, 72,
        ],
        bass: [
            48, 0, 55, 0, 48, 0, 55, 0, 53, 0, 57, 0, 53, 0, 55, 0,
            48, 0, 55, 0, 48, 0, 55, 0, 55, 0, 59, 0, 55, 0, 48, 0,
        ],
    },
    // Spookier, sparse underground loop, A minor
    underground: {
        step: 0.16,
        lead: [57, 0, 60, 0, 63, 0, 60, 63, 65, 0, 63, 60, 57, 0, 55, 52],
        bass: [45, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0],
    },
    // IRONKEEP: slow Phrygian drone for the torch-lit halls. Long gaps on purpose —
    // a busy loop fights the gunfire, and the silences are what read as "dungeon".
    keep: {
        step: 0.22,
        lead: [
            57, 0, 60, 0, 59, 0, 57, 0, 55, 0, 56, 0, 55, 0, 52, 0,
            57, 0, 60, 0, 64, 0, 62, 0, 60, 0, 59, 0, 57, 0, 45, 0,
        ],
        bass: [
            33, 0, 33, 0, 0, 0, 33, 0, 33, 0, 33, 0, 0, 0, 28, 0,
            31, 0, 31, 0, 0, 0, 31, 0, 28, 0, 28, 0, 0, 0, 26, 0,
        ],
    },
    // IRONKEEP boss: driving D-minor ostinato with tritones, ~2x the tempo.
    siege: {
        step: 0.125,
        lead: [
            62, 0, 65, 62, 0, 68, 65, 0, 63, 0, 66, 63, 0, 69, 66, 0,
            62, 65, 68, 71, 70, 68, 65, 62, 60, 0, 63, 60, 0, 62, 0, 0,
        ],
        bass: [
            38, 38, 0, 38, 38, 0, 38, 38, 36, 36, 0, 36, 36, 0, 36, 36,
            38, 38, 0, 38, 38, 0, 38, 38, 33, 33, 0, 33, 33, 0, 31, 31,
        ],
    },
}

class AudioController {
    constructor() {
        this.ctx = null
        this.muted = false
        this.initialized = false
        this.musicGain = null
        this.analyser = null
        this.music = null
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext
            this.ctx = new AudioContext()
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
        if (!this.musicGain) {
            this.musicGain = this.ctx.createGain()
            this.musicGain.gain.value = this.muted ? 0 : 0.16
            this.musicGain.connect(this.ctx.destination)
            this.analyser = this.ctx.createAnalyser()
            this.analyser.fftSize = 256
            this.musicGain.connect(this.analyser) // tap for verification
        }
        this.initialized = true
    }

    setMuted(muted) {
        this.muted = muted
        if (!muted && this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
        if (this.musicGain) this.musicGain.gain.setTargetAtTime(muted ? 0 : 0.16, this.ctx.currentTime, 0.02)
    }

    // ---- one-shot SFX ----
    playTone(freq, duration, type = 'square', vol = 0.1) {
        if (this.muted || !this.ctx) return
        if (this.ctx.state === 'suspended') this.ctx.resume()
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
        osc.connect(gain); gain.connect(this.ctx.destination)
        osc.start(); osc.stop(this.ctx.currentTime + duration)
    }

    playNoise(duration, vol = 0.2) {
        if (this.muted || !this.ctx) return
        const bufferSize = this.ctx.sampleRate * duration
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
        const noise = this.ctx.createBufferSource(); noise.buffer = buffer
        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
        noise.connect(gain); gain.connect(this.ctx.destination)
        noise.start()
    }

    playSweep(startFreq, endFreq, duration, type = 'triangle', vol = 0.1) {
        if (this.muted || !this.ctx) return
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + duration)
        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + duration)
        osc.connect(gain); gain.connect(this.ctx.destination)
        osc.start(); osc.stop(this.ctx.currentTime + duration)
    }

    // ---- music engine (lookahead scheduler) ----
    _note(freq, t, dur, type = 'square', vol = 0.5) {
        if (!this.ctx || !this.musicGain) return
        const o = this.ctx.createOscillator()
        const g = this.ctx.createGain()
        o.type = type
        o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        o.connect(g); g.connect(this.musicGain)
        o.start(t); o.stop(t + dur + 0.02)
    }

    startMusic(track) {
        if (!this.ctx) this.init()
        const P = MUSIC[track]
        if (!P) return
        if (this.music && this.music.track === track && this.music.playing) return
        this.stopMusic()
        this.music = { track, step: 0, nextTime: this.ctx.currentTime + 0.06, stepDur: P.step, playing: true }
        this.music.timer = setInterval(() => this._schedule(), 25)
    }

    _schedule() {
        const m = this.music
        if (!m || !m.playing || !this.ctx) return
        const P = MUSIC[m.track]
        while (m.nextTime < this.ctx.currentTime + 0.12) {
            const i = m.step % P.lead.length
            const ln = P.lead[i]
            if (ln) this._note(f(ln), m.nextTime, m.stepDur * 0.9, 'square', 0.5)
            const bn = P.bass && P.bass[i]
            if (bn) this._note(f(bn), m.nextTime, m.stepDur * 1.1, 'triangle', 0.6)
            m.nextTime += m.stepDur
            m.step++
        }
    }

    stopMusic() {
        if (this.music) { if (this.music.timer) clearInterval(this.music.timer); this.music.playing = false; this.music = null }
    }

    playFanfare() {
        this.stopMusic()
        if (!this.ctx) this.init()
        const t = this.ctx.currentTime
        const seq = [72, 76, 79, 84, 83, 79, 84]
        seq.forEach((n, k) => this._note(f(n), t + k * 0.11, 0.16, 'square', 0.5))
        this._note(f(88), t + seq.length * 0.11, 0.5, 'square', 0.5)
        this._note(f(52), t + seq.length * 0.11, 0.5, 'triangle', 0.6)
    }

    playDeath() {
        this.stopMusic()
        if (!this.ctx) this.init()
        const t = this.ctx.currentTime
        const seq = [72, 67, 63, 60, 55]
        seq.forEach((n, k) => this._note(f(n), t + k * 0.1, 0.16, 'square', 0.45))
    }

    // ---- verification hooks ----
    _musicState() { return { playing: !!(this.music && this.music.playing), track: this.music && this.music.track, step: this.music && this.music.step, ctx: this.ctx && this.ctx.state } }
    _peak() {
        if (!this.analyser) return 0
        const d = new Uint8Array(this.analyser.fftSize)
        this.analyser.getByteTimeDomainData(d)
        let p = 0
        for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i] - 128))
        return p
    }
}

export const audioController = new AudioController()

// Audio: synthesized SFX + an original chiptune music engine.
// All music is composed here (original melodies in an 8-bit style) —
// no copyrighted game audio. Everything is generated at runtime via Web Audio.

// MIDI note -> frequency
const f = (n) => 440 * Math.pow(2, (n - 69) / 12)

// the music bus level — the ceiling every bed plays under. Exported so a title's
// duck contract and the analyser verification agree on one number (not a mirror).
export const MUSIC_BUS = 0.16

// Perc steps for the `perc` lanes: 0 rest, 1 dum (low thump), 2 tek (dry click).

// Patterns: `lead` (square) + `bass` (triangle) share a step grid. 0 = rest.
export const MUSIC = {
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
    // TETRIS (NES): "Korobeiniki" — a traditional Russian folk melody (public
    // domain), arranged here in our own notation. A-section, 32 steps.
    tetris: {
        step: 0.15,
        lead: [
            76, 71, 72, 74, 76, 74, 72, 71, 72, 69, 69, 0, 72, 76, 74, 72,
            71, 72, 74, 76, 79, 76, 74, 72, 71, 74, 72, 69, 69, 0, 0, 0,
        ],
        bass: [
            52, 0, 45, 0, 40, 0, 45, 0, 43, 0, 45, 0, 40, 0, 45, 0,
            52, 0, 45, 0, 40, 0, 45, 0, 43, 0, 40, 0, 28, 0, 0, 0,
        ],
    },
    // JOUST — original heroic march, D minor (not the Rachmaninoff quote
    // the cabinet used; composed for this build)
    joust: {
        step: 0.14,
        lead: [
            62, 65, 69, 74, 72, 69, 65, 62, 67, 70, 74, 79, 77, 74, 70, 67,
            69, 72, 76, 81, 79, 76, 72, 69, 74, 0, 77, 0, 76, 74, 69, 0,
        ],
        bass: [
            38, 0, 45, 0, 38, 0, 45, 0, 43, 0, 50, 0, 43, 0, 50, 0,
            36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 41, 0, 45, 0, 38, 0,
        ],
    },
    // Q*BERT — original bouncy loop, G major. The step grid is LOCKED to the
    // sim's 60Hz hop cadence (a hop is 12 ticks = 0.2s): 0.1s = exactly 2 steps
    // per hop, and the 32-step loop = exactly 16 hops, so the music and the
    // hops stay in phase instead of drifting (0.12 = 5/3 steps per hop read as
    // "stiff" against the 60Hz clock). Pinned in qbertcheck against literals.
    qbert: {
        step: 0.1,
        lead: [
            67, 0, 72, 74, 0, 72, 0, 67, 69, 0, 74, 76, 0, 74, 0, 69,
            71, 0, 76, 79, 0, 76, 0, 71, 67, 0, 64, 67, 71, 0, 74, 0,
        ],
        bass: [
            43, 0, 0, 43, 0, 0, 50, 0, 45, 0, 0, 45, 0, 0, 52, 0,
            47, 0, 0, 47, 0, 0, 55, 0, 43, 0, 0, 43, 0, 0, 50, 0,
        ],
    },
    // PRINCE OF PERSIA — three original beds in the Hijaz mode (D Eb F# G A Bb C#),
    // composed for this build. Silence stays the default voice of the dungeon:
    // these run under it, sparse and slow, with a darbuka pulse (1=dum 2=tek).
    // "THE DUNGEON" — drip-stone slow, wide rests, root pedal.
    pop: {
        step: 0.24,
        lead: [
            62, 0, 66, 0, 67, 0, 66, 0, 63, 0, 62, 0, 0, 0, 62, 0,
            66, 0, 69, 0, 67, 0, 66, 63, 62, 0, 0, 0, 0, 0, 0, 0,
        ],
        bass: [
            38, 0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0,
            34, 0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0,
        ],
        perc: [
            1, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0,
            1, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 0,
        ],
    },
    // "THE THRONE ROOM" — palace levels: grander, an octave up, wider leaps.
    popThrone: {
        step: 0.19,
        lead: [
            74, 0, 78, 0, 79, 0, 78, 0, 75, 0, 74, 0, 0, 74, 0, 0,
            78, 0, 81, 0, 79, 0, 78, 0, 75, 0, 78, 0, 79, 78, 75, 0,
        ],
        bass: [
            38, 0, 50, 0, 38, 0, 50, 0, 46, 0, 0, 46, 0, 0, 38, 0,
            38, 0, 50, 0, 38, 0, 50, 0, 45, 0, 0, 0, 45, 0, 38, 0,
        ],
        perc: [
            1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 1, 0,
            1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 1, 0, 1, 2, 1, 0,
        ],
    },
    // "JAFFAR" — the vizier's theme: a fast chromatic-second ostinato, the
    // b2 grinding against the root. Plays while he stands between you and her.
    popJaffar: {
        step: 0.105,
        lead: [
            74, 75, 74, 0, 78, 0, 75, 0, 74, 0, 75, 78, 79, 0, 78, 0,
            75, 0, 74, 0, 78, 0, 81, 0, 82, 0, 81, 0, 79, 0, 75, 0,
        ],
        bass: [
            38, 0, 38, 0, 38, 0, 38, 0, 38, 0, 38, 0, 46, 0, 46, 0,
            38, 0, 38, 0, 38, 0, 38, 0, 45, 0, 45, 0, 45, 0, 46, 0,
        ],
        perc: [
            1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1,
            1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1,
        ],
    },
    // OUT RUN radio — three ORIGINAL tunes composed for this build in the sunlit
    // 1986 beach-cruiser idiom (bright major-key synth-pop lines over a walking
    // bass). These are our own melodies, deliberately NOT the cabinet's tracks.
    // "MAGICAL COAST" — bouncy, syncopated, F major.
    cruise: {
        step: 0.135,
        lead: [
            65, 69, 72, 76, 74, 72, 69, 72, 67, 71, 74, 79, 76, 74, 71, 74,
            65, 69, 72, 77, 76, 72, 69, 65, 69, 72, 76, 81, 79, 76, 72, 69,
        ],
        bass: [
            41, 0, 53, 0, 41, 0, 53, 0, 43, 0, 55, 0, 43, 0, 55, 0,
            41, 0, 53, 0, 41, 0, 53, 0, 45, 0, 57, 0, 45, 0, 41, 0,
        ],
    },
    // "SUNSET RUN" — warmer, wider intervals, C major with a seventh lift.
    sunset: {
        step: 0.16,
        lead: [
            72, 0, 76, 79, 81, 79, 76, 74, 76, 0, 79, 83, 81, 79, 76, 72,
            74, 0, 77, 81, 83, 81, 77, 76, 77, 0, 81, 84, 83, 79, 76, 0,
        ],
        bass: [
            48, 0, 0, 55, 0, 0, 43, 0, 45, 0, 0, 52, 0, 0, 43, 0,
            46, 0, 0, 53, 0, 0, 41, 0, 43, 0, 0, 55, 0, 0, 48, 0,
        ],
    },
    // "BREEZE BOULEVARD" — the fastest of the three, a bright G-major skip.
    breeze: {
        step: 0.12,
        lead: [
            67, 71, 74, 79, 76, 74, 71, 74, 69, 72, 76, 81, 79, 76, 72, 76,
            67, 71, 74, 79, 81, 79, 76, 74, 72, 76, 79, 83, 81, 76, 71, 0,
        ],
        bass: [
            43, 43, 0, 55, 43, 0, 50, 0, 45, 45, 0, 57, 45, 0, 52, 0,
            43, 43, 0, 55, 43, 0, 57, 0, 41, 41, 0, 53, 45, 0, 43, 0,
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
        this.pendingStep = null
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext
            this.ctx = new AudioContext()
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
        if (!this.musicGain) {
            this.musicGain = this.ctx.createGain()
            this.musicGain.gain.value = this.muted ? 0 : MUSIC_BUS
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
        if (this.musicGain) this.musicGain.gain.setTargetAtTime(muted ? 0 : MUSIC_BUS, this.ctx.currentTime, 0.02)
    }

    // Duck the music bus for a moment so a one-shot cue (a chase rustle, a door
    // rumble) peaks over the bed instead of into it. `to` is the fraction of the
    // bus held during the cue; the bed then recovers. No-op with no bed/muted.
    duckMusic(to, hold = 0.35) {
        if (!this.ctx || !this.musicGain || this.muted) return
        const t = this.ctx.currentTime
        this.musicGain.gain.cancelScheduledValues(t)
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t)
        this.musicGain.gain.linearRampToValueAtTime(to * MUSIC_BUS, t + 0.03)
        this.musicGain.gain.linearRampToValueAtTime(MUSIC_BUS, t + hold)
    }

    // ---- one-shot SFX ----
    playTone(freq, duration, type = 'square', vol = 0.1, delay = 0) {
        if (this.muted || !this.ctx) return
        if (this.ctx.state === 'suspended') this.ctx.resume()
        const t = this.ctx.currentTime + delay
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(vol, t)
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration)
        osc.connect(gain); gain.connect(this.ctx.destination)
        osc.start(t); osc.stop(t + duration)
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

    // a lowpassed noise burst (a crowd murmur, a whoosh) — playNoise's raw
    // crackle reads as static, a bed needs the filter
    playFilteredNoise(duration, vol = 0.2, freq = 800) {
        if (this.muted || !this.ctx) return
        const sr = this.ctx.sampleRate
        const buffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(sr * duration)), sr)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        const noise = this.ctx.createBufferSource(); noise.buffer = buffer
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq
        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
        noise.connect(lp); lp.connect(gain); gain.connect(this.ctx.destination)
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
        if (this.pendingStep) { this.music.stepDur = this.pendingStep; this.pendingStep = null }
        this.music.timer = setInterval(() => this._schedule(), 25)
    }

    // Change the step duration (seconds) of the playing track, or stage one
    // for the next startMusic of any track. The NES speeds its music up with
    // the level; this is the seam that lets a title do the same.
    setMusicStep(sec) {
        if (!(sec > 0)) return
        if (this.music && this.music.playing) this.music.stepDur = sec
        else this.pendingStep = sec
    }

    _perc(v, t) {
        if (!this.ctx || !this.musicGain) return
        if (v === 1) {
            const o = this.ctx.createOscillator()
            const g = this.ctx.createGain()
            o.type = 'sine'
            o.frequency.setValueAtTime(160, t)
            o.frequency.exponentialRampToValueAtTime(55, t + 0.09)
            g.gain.setValueAtTime(0.5, t)
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
            o.connect(g); g.connect(this.musicGain)
            o.start(t); o.stop(t + 0.14)
        } else if (v === 2) {
            const dur = 0.04
            const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate)
            const d = buffer.getChannelData(0)
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
            const src = this.ctx.createBufferSource(); src.buffer = buffer
            const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500
            const g = this.ctx.createGain(); g.gain.value = 0.22
            src.connect(hp); hp.connect(g); g.connect(this.musicGain)
            src.start(t)
        }
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
            const pv = P.perc && P.perc[i]
            if (pv) this._perc(pv, m.nextTime)
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

// RACCOON HEIST — the sound of a wet night and a bad idea.
//
// Everything here is synthesized at runtime (no audio assets, same rule as every other
// game in this arcade). It borrows `audioController`'s AudioContext — there is exactly
// one per tab and App.jsx unlocks it on the first gesture — but owns its own gain
// chain, its own delay, and its own lookahead scheduler, because a heist needs an
// instrument the chiptune engine does not have: a bed that *changes density* with how
// made you are, without restarting the loop.
//
// Three beds, crossfaded by heat: SNEAK (upright bass, space, one vibes note every
// bar), SNEAK+ (a brushed tick enters, the pad starts breathing), CHASE (16th-note
// ostinato, a siren in the wrong key on purpose). The transition is a gain ramp, not a
// stop/start, so the moment a guard spots you the music does not restart — it *flinches*.

import { audioController } from '../../utils/AudioController.js'

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Original composition. D minor, because it is the only key for a raccoon.
const BEDS = {
    sneak: {
        step: 0.3,
        bass: [38, 0, 0, 41, 0, 0, 43, 0, 45, 0, 43, 0, 41, 0, 38, 0],
        lead: [0, 0, 0, 0, 0, 0, 0, 0, 74, 0, 0, 0, 0, 0, 72, 0],
        tick: 0,
        pad: [50, 0, 0, 0, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0],
    },
    creep: {
        step: 0.26,
        bass: [38, 0, 38, 0, 41, 0, 38, 0, 43, 0, 43, 0, 41, 40, 38, 0],
        lead: [0, 0, 74, 0, 0, 76, 0, 0, 74, 0, 0, 72, 0, 0, 69, 0],
        tick: 0.05,
        pad: [50, 0, 0, 0, 53, 0, 0, 0, 48, 0, 0, 0, 50, 0, 0, 0],
    },
    chase: {
        step: 0.13,
        bass: [
            38, 38, 50, 38, 38, 38, 50, 38, 41, 41, 53, 41, 41, 41, 53, 41,
            43, 43, 55, 43, 43, 43, 55, 43, 41, 41, 53, 41, 38, 38, 50, 38,
        ],
        lead: [
            0, 0, 0, 0, 74, 0, 72, 0, 0, 0, 0, 0, 77, 0, 76, 0,
            0, 0, 0, 0, 79, 0, 76, 0, 74, 0, 72, 0, 71, 0, 69, 0,
        ],
        tick: 0.1,
        pad: [50, 0, 0, 50, 0, 0, 53, 0, 48, 0, 0, 48, 0, 0, 50, 0],
    },
}

class HeistAudio {
    constructor() {
        this.ctx = null
        this.bed = null
        this.ready = false
        this.gain = 0.9
        this.intensity = 0
    }

    ensure() {
        if (!this.ctx) {
            if (!audioController.ctx) audioController.init()
            const ctx = audioController.ctx
            if (!ctx) return null
            this.ctx = ctx
            this.master = ctx.createGain()
            this.master.gain.value = audioController.muted ? 0 : this.gain
            // A short feedback delay with the top end rolled off: this is the alley.
            this.fx = ctx.createGain()
            this.fx.gain.value = 0.3
            const delay = ctx.createDelay(1)
            delay.delayTime.value = 0.27
            const fb = ctx.createGain()
            fb.gain.value = 0.32
            const dark = ctx.createBiquadFilter()
            dark.type = 'lowpass'
            dark.frequency.value = 1800
            this.fx.connect(delay)
            delay.connect(dark)
            dark.connect(fb)
            fb.connect(delay)
            delay.connect(this.master)
            this.master.connect(ctx.destination)
            this.musicGain = ctx.createGain()
            this.musicGain.gain.value = 0.0001
            this.musicGain.connect(this.master)
            this.sfxGain = ctx.createGain()
            this.sfxGain.gain.value = 0.85
            this.sfxGain.connect(this.master)
            this.sfxGain.connect(this.fx)
            this.ready = true
        }
        if (this.ctx.state === 'suspended') this.ctx.resume?.()
        return this.ctx
    }

    setMuted(m) {
        if (this.master) this.master.gain.value = m ? 0 : this.gain
    }

    // ---------------------------------------------------------------- voices -----
    tone(freq, { t = 0, dur = 0.16, type = 'triangle', vol = 0.3, glide = 0, out = 'sfx', attack = 0.008, detune = 0 } = {}) {
        const ctx = this.ensure()
        if (!ctx) return
        const now = ctx.currentTime + t
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = type
        o.detune.value = detune
        o.frequency.setValueAtTime(Math.max(20, freq), now)
        if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), now + dur)
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        o.connect(g)
        g.connect(out === 'music' ? this.musicGain : this.sfxGain)
        o.start(now)
        o.stop(now + dur + 0.03)
    }

    hiss({ t = 0, dur = 0.12, vol = 0.2, f0 = 1200, f1 = 300, q = 1.1, type = 'bandpass', out = 'sfx' } = {}) {
        const ctx = this.ensure()
        if (!ctx) return
        const now = ctx.currentTime + t
        const len = Math.max(0.03, dur)
        const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
        const src = ctx.createBufferSource()
        src.buffer = buf
        const flt = ctx.createBiquadFilter()
        flt.type = type
        flt.Q.value = q
        flt.frequency.setValueAtTime(f0, now)
        flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), now + len)
        const g = ctx.createGain()
        g.gain.setValueAtTime(vol, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + len)
        src.connect(flt)
        flt.connect(g)
        g.connect(out === 'music' ? this.musicGain : this.sfxGain)
        src.start(now)
    }

    // ----------------------------------------------------------------- music -----
    start(bed = 'sneak') {
        if (!this.ensure()) return
        this.setBed(bed)
    }

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = null
        this.bed = null
        if (this.musicGain) this.musicGain.gain.value = 0.0001
    }

    setBed(name) {
        if (!BEDS[name] || this.bed === name) return
        this.bed = name
        if (!this.timer) {
            this.bar = 0
            this.nextTime = this.ctx.currentTime + 0.08
            this.timer = setInterval(() => this.schedule(), 30)
        }
        const g = this.musicGain.gain
        g.cancelScheduledValues?.(this.ctx.currentTime)
        g.setValueAtTime(Math.max(0.0002, g.value), this.ctx.currentTime)
        g.linearRampToValueAtTime(name === 'chase' ? 0.5 : name === 'creep' ? 0.42 : 0.34, this.ctx.currentTime + 0.5)
    }

    /** Heat 0..1 → which bed is playing. Ramps, so being spotted flinches the music. */
    setHeat(h) {
        this.intensity = h
        if (!this.bed) return
        this.setBed(h > 0.66 ? 'chase' : h > 0.3 ? 'creep' : 'sneak')
    }

    schedule() {
        const P = BEDS[this.bed]
        if (!P || !this.ctx) return
        while (this.nextTime < this.ctx.currentTime + 0.14) {
            const i = this.bar % P.lead.length
            const ahead = this.nextTime - this.ctx.currentTime
            const b = P.bass[i]
            if (b) this.tone(midi(b), { t: ahead, dur: P.step * 1.5, type: 'triangle', vol: 0.5, out: 'music' })
            const l = P.lead[i]
            if (l) this.tone(midi(l), { t: ahead, dur: P.step * 1.1, type: 'sine', vol: 0.26, out: 'music', attack: 0.02 })
            const p = P.pad[i]
            if (p) {
                this.tone(midi(p), { t: ahead, dur: P.step * 4, type: 'sawtooth', vol: 0.07, out: 'music', attack: 0.4, detune: -7 })
                this.tone(midi(p), { t: ahead, dur: P.step * 4, type: 'sawtooth', vol: 0.06, out: 'music', attack: 0.5, detune: 8 })
            }
            if (P.tick && i % 2 === 0) this.hiss({ t: ahead, dur: 0.04, vol: P.tick, f0: 6500, f1: 4200, type: 'highpass', out: 'music' })
            this.nextTime += P.step
            this.bar++
        }
    }

    // ------------------------------------------------------------------- SFX -----
    step(r) {
        if (r < 2.5) return
        this.hiss({ dur: 0.06, vol: 0.035 + Math.min(0.05, r * 0.005), f0: 900 + Math.random() * 500, f1: 260 })
    }

    splash() { this.hiss({ dur: 0.3, vol: 0.24, f0: 2400, f1: 300, q: 0.8 }) }
    grab() { this.hiss({ dur: 0.16, vol: 0.16, f0: 1500, f1: 400 }); this.tone(midi(62), { dur: 0.1, type: 'square', vol: 0.1 }) }
    pickup() { this.tone(midi(88), { dur: 0.1, type: 'square', vol: 0.12 }); this.tone(midi(95), { t: 0.06, dur: 0.12, type: 'square', vol: 0.1 }) }
    drop() { this.tone(midi(45), { dur: 0.22, type: 'triangle', vol: 0.3, glide: 0.6 }); this.hiss({ dur: 0.2, vol: 0.12, f0: 800, f1: 180 }) }
    clank() {
        this.tone(midi(57), { dur: 0.5, type: 'square', vol: 0.16, glide: 0.7 })
        this.tone(midi(64), { t: 0.02, dur: 0.4, type: 'square', vol: 0.1, glide: 0.6 })
        this.hiss({ dur: 0.4, vol: 0.2, f0: 3200, f1: 500 })
    }

    clink() { this.tone(midi(96), { dur: 0.18, type: 'sine', vol: 0.14 }); this.tone(midi(103), { t: 0.04, dur: 0.22, type: 'sine', vol: 0.1 }) }
    chew() { this.hiss({ dur: 0.07, vol: 0.1, f0: 400 + Math.random() * 400, f1: 180, q: 3 }) }
    unlock() {
        this.tone(midi(70), { dur: 0.1, type: 'square', vol: 0.14 })
        this.tone(midi(74), { t: 0.08, dur: 0.1, type: 'square', vol: 0.14 })
        this.tone(midi(79), { t: 0.16, dur: 0.3, type: 'square', vol: 0.16 })
    }

    free() { [72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), { t: i * 0.07, dur: 0.2, type: 'square', vol: 0.14 })) }
    swap() { this.tone(midi(81), { dur: 0.08, type: 'triangle', vol: 0.12 }); this.tone(midi(86), { t: 0.05, dur: 0.1, type: 'triangle', vol: 0.1 }) }
    spot() {
        this.tone(midi(93), { dur: 0.12, type: 'square', vol: 0.2, glide: 0.7 })
        this.tone(midi(80), { t: 0.1, dur: 0.24, type: 'square', vol: 0.16, glide: 0.6 })
        this.setHeat(Math.max(0.7, this.intensity))
    }

    alarm() {
        this.tone(midi(86), { dur: 0.3, type: 'sawtooth', vol: 0.16, glide: 1.3 })
        this.tone(midi(86), { t: 0.3, dur: 0.3, type: 'sawtooth', vol: 0.16, glide: 0.75 })
    }

    siren() {
        for (let i = 0; i < 3; i++) {
            this.tone(midi(81), { t: i * 0.5, dur: 0.45, type: 'sawtooth', vol: 0.14, glide: 1.35 })
            this.tone(midi(74), { t: i * 0.5 + 0.22, dur: 0.3, type: 'sawtooth', vol: 0.1, glide: 0.7 })
        }
        this.setHeat(1)
    }

    caught() {
        [67, 63, 60, 55].forEach((n, i) => this.tone(midi(n), { t: i * 0.1, dur: 0.28, type: 'square', vol: 0.2 }))
        this.hiss({ dur: 0.5, vol: 0.18, f0: 1600, f1: 120 })
    }

    gate() {
        this.hiss({ dur: 0.7, vol: 0.2, f0: 260, f1: 1500, q: 0.7 })
        this.tone(midi(52), { dur: 0.6, type: 'triangle', vol: 0.2 })
    }

    cat() { this.tone(midi(88), { dur: 0.14, type: 'sawtooth', vol: 0.1, glide: 0.6 }); this.hiss({ dur: 0.18, vol: 0.07, f0: 2600, f1: 900 }) }
    thunder() {
        this.hiss({ dur: 1.6, vol: 0.4, f0: 420, f1: 60, q: 0.6, type: 'lowpass' })
        this.tone(46, { dur: 1.4, type: 'sine', vol: 0.28, glide: 0.55 })
    }

    win() {
        this.stop()
        const up = [62, 66, 69, 74, 78, 81, 86]
        up.forEach((n, i) => this.tone(midi(n), { t: i * 0.1, dur: 0.3, type: 'square', vol: 0.2 }))
        this.tone(midi(98), { t: 0.72, dur: 0.7, type: 'square', vol: 0.2 })
        this.tone(midi(50), { t: 0.72, dur: 0.7, type: 'triangle', vol: 0.28 })
    }

    bust() {
        this.stop()
        const down = [69, 65, 62, 57, 53, 50]
        down.forEach((n, i) => this.tone(midi(n), { t: i * 0.14, dur: 0.4, type: 'sawtooth', vol: 0.18 }))
        this.hiss({ dur: 1.2, vol: 0.22, f0: 900, f1: 60, type: 'lowpass' })
    }
}

export const heistAudio = new HeistAudio()

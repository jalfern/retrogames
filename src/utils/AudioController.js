class AudioController {
    constructor() {
        this.ctx = null
        this.muted = false
        this.initialized = false
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext
            this.ctx = new AudioContext()
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
        this.initialized = true
    }

    setMuted(muted) {
        this.muted = muted
        if (!muted && this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
    }

    // Basic Tone (Square/Sawtooth/Sine)
    playTone(freq, duration, type = 'square', vol = 0.1) {
        if (this.muted || !this.ctx) return

        // Auto-resume if needed (browser policy fix)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume()
        }

        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = type
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime)

        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

        osc.connect(gain)
        gain.connect(this.ctx.destination)

        osc.start()
        osc.stop(this.ctx.currentTime + duration)
    }

    // Noise (Explosions)
    playNoise(duration, vol = 0.2) {
        if (this.muted || !this.ctx) return

        const bufferSize = this.ctx.sampleRate * duration
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1
        }

        const noise = this.ctx.createBufferSource()
        noise.buffer = buffer

        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

        noise.connect(gain)
        gain.connect(this.ctx.destination)

        noise.start()
    }

    // Frequency Sweep (Waka Waka / Powerups)
    playSweep(startFreq, endFreq, duration, type = 'triangle', vol = 0.1) {
        if (this.muted || !this.ctx) return

        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = type
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + duration)

        gain.gain.setValueAtTime(vol, this.ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + duration)

        osc.connect(gain)
        gain.connect(this.ctx.destination)

        osc.start()
        osc.stop(this.ctx.currentTime + duration)
    }
}

export const audioController = new AudioController()

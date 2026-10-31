// VOICE LISTEN (#1249) — the browser half of spoken co-op: a thin wrapper over
// the Web Speech API that hands final transcripts to the game and nothing else.
// Recognition itself lives in the browser (Chrome runs it on-device for en-US
// when it can); the GAME logic is src/games/Gauntlet/voicecalls.js, pure and
// checkable without a mic. Devices without the API — Safari, headless CI — get
// a silent no-op so the game never differs in play, only in the extra sense it
// has. Mic consent stays the app's existing askVoiceConsent (#1247): this
// module never opens the microphone on its own, the caller starts it only
// after consent.
//
// Chrome stops `continuous` recognition on its own after silence or a pause in
// speech, so while armed the wrapper restarts automatically; a hard failure
// (permission revoked mid-call) disarms and reports, like the recorder's
// declined path.

export function speechSupported() {
    if (typeof window === 'undefined') return false
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// startSpeechListen({ onPhrase, onError?, lang? }) → { supported, active, stop }
// The returned object is the only handle: stop() disarms for good (unmount,
// voice mode off, net play) and never restarts.
export function startSpeechListen(opts = {}) {
    const { onPhrase, onError, lang = 'en-US' } = opts
    if (!speechSupported()) return { supported: false, active: false, stop() {} }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    let armed = true
    let rec = null
    let timer = 0

    const start = () => {
        if (!armed) return
        try { rec = new SR() } catch { armed = false; if (onError) onError('init-failed'); return }
        rec.lang = lang
        rec.continuous = true
        rec.interimResults = false
        rec.maxAlternatives = 1
        rec.onresult = (ev) => {
            if (!armed) return
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const res = ev.results[i]
                if (res.isFinal) {
                    const phrase = String(res.transcript || '').trim()
                    if (phrase && onPhrase) onPhrase(phrase)
                }
            }
        }
        rec.onerror = (ev) => {
            const code = (ev && ev.error) || 'error'
            if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
                armed = false
                if (onError) onError(code)
                return
            }
            // 'no-speech' / 'aborted' / network wobbles: the onend restart
            // below picks the mic back up; report softly for the HUD.
            if (onError) onError(code)
        }
        rec.onend = () => {
            rec = null
            if (!armed) return
            clearTimeout(timer)
            timer = setTimeout(start, 150)
        }
        try { rec.start() } catch { /* already starting — onend will rearm */ }
    }
    start()

    return {
        supported: true,
        get active() { return armed },
        stop() {
            armed = false
            clearTimeout(timer)
            try { if (rec) { rec.onend = null; rec.stop() } } catch { /* gone */ }
            rec = null
        },
    }
}

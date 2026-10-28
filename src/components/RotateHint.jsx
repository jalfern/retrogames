import { useEffect, useState } from 'react'

const MIN_ASPECT = 4 / 3

// #1147: fixed-resolution titles are landscape (4:3 and wider). In an iPhone
// portrait they letterbox down to a barely-legible band — ask for a rotate
// instead. Shown only while the device is portrait AND the route hosts a
// canvas whose intrinsic size is wider than 4:3 (so portrait-native UI and
// menu screens stay unaffected). Auto-clears on rotation; a stubborn player
// can dismiss it for this visit.
export default function RotateHint() {
    const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches)
    const [wide, setWide] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(orientation: portrait)')
        const onMq = (e) => setPortrait(e.matches)
        mq.addEventListener('change', onMq)
        const scan = () => {
            for (const c of document.querySelectorAll('canvas')) {
                if (c.width > 0 && c.height > 0 && c.width / c.height >= MIN_ASPECT) { setWide(true); return }
            }
            setWide(false)
        }
        scan()
        const iv = setInterval(scan, 500)
        return () => { mq.removeEventListener('change', onMq); clearInterval(iv) }
    }, [])

    if (!portrait || !wide || dismissed) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-xl border border-white/25 bg-black/85 px-6 py-5 text-center backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="7" y="2.5" width="10" height="19" rx="2" />
                    <path d="M13 2.5c4 .4 7 3.2 8.4 7" strokeLinecap="round" strokeDasharray="2 3" />
                </svg>
                <p className="font-mono text-[11px] tracking-[0.3em] text-white">ROTATE YOUR PHONE</p>
                <button
                    data-nav="rotate-dismiss"
                    onClick={() => setDismissed(true)}
                    className="font-mono text-[10px] tracking-[0.2em] text-white/60 border border-white/25 rounded-md px-2.5 py-1 hover:opacity-100"
                >
                    PLAY IN PORTRAIT
                </button>
            </div>
        </div>
    )
}

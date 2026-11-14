import { useEffect, useState } from 'react'

// #1748: attract copy must vanish while the centered rotate card is up — the
// card's dismiss button is chrome, and text over chrome fails the #1099 sweep
// under CI's wider font. Observe the published attribute (change-only, so it
// costs nothing per frame); #2187 made the three consumers of the old #1637
// copy (fire-crew/metroid/robot-lab) share this instead of each polling.
// Lives outside RotateHint.jsx: a hook export beside the component breaks the
// react-refresh lint gate (only-export-components).
export function useRotateHint() {
    const [hint, setHint] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.dataset.rotateHint === '1')
    useEffect(() => {
        const read = () => setHint(document.documentElement.dataset.rotateHint === '1')
        const mo = new MutationObserver(read)
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-rotate-hint'] })
        read()
        return () => mo.disconnect()
    }, [])
    return hint
}

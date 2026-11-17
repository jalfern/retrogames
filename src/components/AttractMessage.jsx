import React, { useEffect, useRef, useState } from 'react'

// ART.md rule 6: an attract screen shows ONE message at a time, cycling —
// never a wall of controls/rules text stacked over the demo (see #365).
// A title keeps its own press-prompt line and passes its rules as short
// facts; this renders one at a time in the title's own colour.
// #2599 item 3: a title that wants to stage a beat against a copy LINE may
// pass onIndex — it fires with the index each time a line becomes the one
// on screen (and once with 0 on mount). Optional: other titles never see it.
const AttractMessage = ({ messages, ms = 2600, className = 'text-white/70', onIndex }) => {
    const [i, setI] = useState(0)
    const ixRef = useRef(0)
    const cbRef = useRef(onIndex)
    useEffect(() => { cbRef.current = onIndex }, [onIndex])   // latest callback, without the render-time ref write
    useEffect(() => {
        if (messages.length <= 1) return undefined
        cbRef.current?.(0)   // the first line IS a beat — announce it
        const id = setInterval(() => {
            ixRef.current = (ixRef.current + 1) % messages.length
            setI(ixRef.current)
            cbRef.current?.(ixRef.current)
        }, ms)
        return () => clearInterval(id)
    }, [messages.length, ms])
    if (!messages.length) return null
    return <p className={`font-mono text-[11px] leading-4 max-w-[calc(100vw-32px)] ${className}`}>{messages[i % messages.length]}</p>
}

export default AttractMessage

import React, { useEffect, useState } from 'react'

// ART.md rule 6: an attract screen shows ONE message at a time, cycling —
// never a wall of controls/rules text stacked over the demo (see #365).
// A title keeps its own press-prompt line and passes its rules as short
// facts; this renders one at a time in the title's own colour.
const AttractMessage = ({ messages, ms = 2600, className = 'text-white/70' }) => {
    const [i, setI] = useState(0)
    useEffect(() => {
        if (messages.length <= 1) return undefined
        const id = setInterval(() => setI((v) => (v + 1) % messages.length), ms)
        return () => clearInterval(id)
    }, [messages.length, ms])
    if (!messages.length) return null
    return <p className={`font-mono text-[11px] leading-4 ${className}`}>{messages[i % messages.length]}</p>
}

export default AttractMessage

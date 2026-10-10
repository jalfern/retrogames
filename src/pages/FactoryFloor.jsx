import { Link } from 'react-router-dom'
import { shortName } from './floor'

const CSS = `
@keyframes forge-drift { from { transform: translateX(-46px); opacity: 0 } 25% { opacity: 1 } to { transform: translateX(0); opacity: 1 } }
@keyframes forge-ember { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
@keyframes forge-spark { 0%,100% { opacity: 0; transform: translateY(0) } 30% { opacity: 1 } 60% { opacity: .3; transform: translateY(-9px) } }
@keyframes forge-roll { 0% { left: 0 } 88% { left: calc(100% - 30px) } 92% { left: calc(100% - 30px); opacity: 1 } 100% { left: calc(100% - 30px); opacity: 0 } }
.forge-floor { background-image: repeating-linear-gradient(0deg, rgba(0,255,0,.03) 0 1px, transparent 1px 3px) }
`

const Station = ({ tag, children, className = '' }) => (
    <div className={`border px-2 py-1 min-w-0 ${className}`}>{children}<div className="text-[8px] opacity-60 tracking-widest text-center">{tag}</div></div>
)

const FactoryFloor = ({ floor }) => {
    const { queued, anvil, gate, cart, shelf } = floor
    const shown = queued.slice(0, 8)
    return (
        <div className="forge-floor border border-[#0f0]/40 p-3 mb-8 text-[#0f0] overflow-hidden" data-floor="1">
            <style>{CSS}</style>
            <div className="text-[9px] tracking-widest opacity-60 mb-2">FACTORY FLOOR — animated from the data above, nothing else</div>
            <div className="flex items-stretch gap-1 text-[10px]">

                <Station tag={`QUEUE BIN · ${queued.length}`} className="border-[#d4c5f9]/50 flex-1 min-w-[120px]">
                    <div className="flex flex-col gap-[2px] h-[74px] overflow-hidden">
                        {shown.map((i, n) => (
                            <div key={i.number} data-queue-card="1"
                                className="truncate text-[#d4c5f9] text-[9px] leading-tight"
                                style={{ animation: 'forge-drift 1.6s ease-out both', animationDelay: `${n * 0.15}s` }}>
                                ▸ {shortName(i.title)}
                            </div>
                        ))}
                        {queued.length > shown.length && <div className="text-[9px] opacity-60">+{queued.length - shown.length} more</div>}
                        {queued.length === 0 && <div className="text-[9px] opacity-50" data-queue-empty="1">bin empty</div>}
                    </div>
                </Station>

                <div className="w-4 self-center text-[#d4c5f9]/60">→</div>

                <Station tag="ANVIL" className="border-[#ffb347]/60 relative">
                    <div className="text-center text-lg leading-6 relative"
                        data-anvil={anvil.dark ? 'dark' : [anvil.glow && 'glow', anvil.spark && 'spark'].filter(Boolean).join(' ')}>
                        {anvil.dark ? <span className="opacity-30">▒</span>
                            : <span style={{ animation: anvil.glow ? 'forge-ember 2s infinite' : undefined }}>🔥</span>}
                        {anvil.spark && (
                            <span className="absolute inset-x-0 -top-2 text-[10px] text-[#ffe14d]" style={{ animation: 'forge-spark 1.6s infinite' }}>✦ ✦</span>
                        )}
                    </div>
                    <div className="text-[8px] text-center truncate max-w-[84px]">
                        {anvil.building ? `⚒ ${anvil.building}` : anvil.dark ? 'warden silent' : 'idle, warm'}
                    </div>
                </Station>

                <div className="flex-[2] relative border-x border-[#0f0]/20 self-stretch min-w-[60px] overflow-hidden">
                    <div className="absolute bottom-2 inset-x-0 border-t border-dashed border-[#0f0]/30" />
                    <div className="absolute bottom-0 inset-x-0 text-center text-[8px] opacity-40">CONVEYOR ▸▸▸</div>
                    {cart && (
                        <div data-cart="1"
                            className="absolute bottom-3 text-[9px] bg-[#c2e0c2] text-black px-1"
                            style={{ animation: 'forge-roll 4s linear infinite' }}>
                            ▣ SHIP{cart.count > 1 ? `×${cart.count}` : ''}
                        </div>
                    )}
                </div>

                <Station tag="CI GATE" className={gate.busy ? 'border-[#ffe14d]' : 'border-[#0f0]'}>
                    <div data-gate={gate.busy ? 'busy' : 'clear'} className="text-center text-sm leading-5">
                        {gate.busy ? <span className="text-[#ffe14d]">┃▌</span> : <span>▁ ▁</span>}
                    </div>
                    <div className="text-[8px] text-center max-w-[86px] truncate">
                        {gate.busy ? (gate.pr ? `PR #${gate.pr}` : gate.note) : 'gate clear'}
                    </div>
                </Station>

                <Station tag={`SHELF · ${shelf.length}`} className="border-[#c2e0c2]/60 flex-[1.4] min-w-[110px]">
                    <div className="flex flex-wrap gap-x-1 gap-y-[1px] h-12 content-start overflow-hidden">
                        {shelf.map(i => (
                            <Link key={i.number} to="/games" data-shelf-car="1" title={i.title}
                                className="text-[#c2e0c2] text-[8px] leading-tight border border-[#c2e0c2]/40 px-[2px] hover:bg-[#c2e0c2] hover:text-black truncate max-w-[80px]">
                                ▣ {shortName(i.title)}
                            </Link>
                        ))}
                        {shelf.length === 0 && <div className="text-[9px] opacity-50" data-shelf-empty="1">nothing forged yet</div>}
                    </div>
                </Station>
            </div>
        </div>
    )
}

export default FactoryFloor

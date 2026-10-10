import React, { useState } from 'react';

const VirtualControls = ({ secondPad, secondAction, visible = true }) => {
    // We'll use these to track active states for visual feedback
    const [activeKeys, setActiveKeys] = useState({});

    // Titles with menus/death screens pass `visible` to withdraw the pad when it
    // would only cover the canvas (defaults to true — every existing caller is
    // always-playing, so nothing changes for them).
    if (!visible) return null;

    const handleInput = (key, type) => {
        // Map visual controls to keyboard codes
        const codeMap = {
            'up': 'ArrowUp',
            'down': 'ArrowDown',
            'left': 'ArrowLeft',
            'right': 'ArrowRight',
            'action': 'Space' // Jump
        };

        // Local-2P titles pass `secondPad` = { up,down,left,right,action } of
        // keycodes; its buttons dispatch the SECOND key path, so both key sets
        // feed the same tick exactly like two hands on one keyboard.
        let code = key === 'action2' ? (secondAction && secondAction.code) : codeMap[key];
        if (key.startsWith('p2:') && secondPad) code = secondPad[key.slice(3)];
        if (!code) return;

        // Update visual state
        setActiveKeys(prev => ({
            ...prev,
            [key]: type === 'down'
        }));

        // Dispatch global keyboard event
        const eventType = type === 'down' ? 'keydown' : 'keyup';
        const event = new KeyboardEvent(eventType, {
            code: code,
            key: code, // Simplified, might need more specific mapping if game uses key directly
            bubbles: true
        });
        window.dispatchEvent(event);
    };

    // Helper for touch/mouse events
    const bindEvents = (key) => ({
        onMouseDown: (e) => { e.preventDefault(); handleInput(key, 'down'); },
        onMouseUp: (e) => { e.preventDefault(); handleInput(key, 'up'); },
        onMouseLeave: () => {
            // If dragging out, cancel the press
            if (activeKeys[key]) handleInput(key, 'up');
        },
        onTouchStart: (e) => { e.preventDefault(); handleInput(key, 'down'); },
        onTouchEnd: (e) => { e.preventDefault(); handleInput(key, 'up'); }
    });

    const dPadClass = "w-12 h-12 bg-neutral-700/50 rounded-lg flex items-center justify-center select-none active:bg-neutral-600/80 transition-colors backdrop-blur-sm border border-white/10";
    const actionBtnClass = "w-16 h-16 bg-red-500/50 rounded-full flex items-center justify-center select-none active:bg-red-400/80 transition-colors backdrop-blur-sm border border-white/10 shadow-lg shadow-red-900/20";

    return (
        <div className="fixed bottom-8 left-0 right-0 px-8 flex justify-between items-end z-50 pointer-events-auto">
            {/* D-Pad */}
            <div className="grid grid-cols-3 gap-1">
                <div />
                <button
                    className={`${dPadClass} ${activeKeys.up ? 'bg-neutral-600/90' : ''}`}
                    {...bindEvents('up')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                </button>
                <div />

                <button
                    className={`${dPadClass} ${activeKeys.left ? 'bg-neutral-600/90' : ''}`}
                    {...bindEvents('left')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="w-12 h-12 bg-neutral-800/50 rounded-lg" />
                <button
                    className={`${dPadClass} ${activeKeys.right ? 'bg-neutral-600/90' : ''}`}
                    {...bindEvents('right')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </button>

                <div />
                <button
                    className={`${dPadClass} ${activeKeys.down ? 'bg-neutral-600/90' : ''}`}
                    {...bindEvents('down')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                </button>
                <div />
            </div>

            {/* Action Buttons */}
            <div className="pb-2 pr-4 flex items-end gap-3">
                {secondAction && (
                    <button
                        className={`${actionBtnClass} w-14 h-14 bg-orange-500/50 active:bg-orange-400/80 ${activeKeys.action2 ? 'bg-orange-400/90 scale-95' : ''}`}
                        {...bindEvents('action2')}
                    >
                        <span className="text-white font-bold text-lg">{secondAction.label || 'B'}</span>
                    </button>
                )}
                <button
                    className={`${actionBtnClass} ${activeKeys.action ? 'bg-red-400/90 scale-95' : ''}`}
                    {...bindEvents('action')}
                >
                    <span className="text-white font-bold text-lg">A</span>
                </button>
            </div>

            {/* Second-player pad (local 2P titles only — `secondPad` prop).
                Bottom-center so it never collides with the P1 d-pad/buttons. */}
            {secondPad && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-end gap-2 pointer-events-auto">
                    <button
                        className={`${dPadClass} w-10 h-10 text-white/80 font-bold`}
                        {...bindEvents('p2:left')}
                    >◀</button>
                    <div className="flex flex-col gap-1">
                        <button
                            className={`${dPadClass} w-10 h-10 text-white/80 font-bold`}
                            {...bindEvents('p2:up')}
                        >▲</button>
                        <button
                            className={`${dPadClass} w-10 h-10 text-white/80 font-bold`}
                            {...bindEvents('p2:down')}
                        >▼</button>
                    </div>
                    <button
                        className={`${dPadClass} w-10 h-10 text-white/80 font-bold`}
                        {...bindEvents('p2:right')}
                    >▶</button>
                    <button
                        className={`w-14 h-14 bg-sky-500/50 rounded-full flex items-center justify-center select-none active:bg-sky-400/80 transition-colors backdrop-blur-sm border border-white/10 shadow-lg shadow-sky-900/20 ${activeKeys['p2:action'] ? 'bg-sky-400/90 scale-95' : ''}`}
                        {...bindEvents('p2:action')}
                    >
                        <span className="text-white font-bold text-lg">J</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default VirtualControls;

import React, { useEffect, useState } from 'react';

const VirtualControls = () => {
    // We'll use these to track active states for visual feedback
    const [activeKeys, setActiveKeys] = useState({});

    const handleInput = (key, type) => {
        // Map visual controls to keyboard codes
        const codeMap = {
            'up': 'ArrowUp',
            'down': 'ArrowDown',
            'left': 'ArrowLeft',
            'right': 'ArrowRight',
            'action': 'Space' // Jump
        };

        const code = codeMap[key];
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
        onMouseLeave: (e) => {
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

            {/* Action Button */}
            <div className="pb-2 pr-4">
                <button
                    className={`${actionBtnClass} ${activeKeys.action ? 'bg-red-400/90 scale-95' : ''}`}
                    {...bindEvents('action')}
                >
                    <span className="text-white font-bold text-lg">A</span>
                </button>
            </div>
        </div>
    );
};

export default VirtualControls;

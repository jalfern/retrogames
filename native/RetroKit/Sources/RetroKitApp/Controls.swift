// Input: game controllers → seats, polled once per frame (from the Gauntlet
// port's two-seat version). Seat 1 = the first controller, seat 2 = the
// second: real gamepads first, then the on-screen pad, then the Siri Remote.
// On iPhone/iPad an on-screen pad (GCVirtualController) shows while no real
// gamepad is connected. tvOS Menu (Remote or gamepad) latches a menu press on
// seat 1. Each game supplies the mapping — which pad button means what, the
// Remote's touch surface, the hardware-keyboard layout — in a Controls.Config.

import GameController

public struct Buttons: Equatable {
    public var up = false, down = false, left = false, right = false
    public var a = false, b = false, x = false, y = false, menu = false
    public var any: Bool { up || down || left || right || a || b || x || y || menu }
    public init() {}
}

public final class Controls {
    public struct Config {
        /// how many seats read a controller (1 or 2)
        public var seats: Int
        /// the on-screen pad's elements on iPhone/iPad (GCInputLeftThumbstick, GCInputButtonA, …)
        public var virtualElements: Set<String>
        /// a full gamepad's state → buttons
        public var gamepad: (GCExtendedGamepad) -> Buttons
        /// the Siri Remote (micro gamepad) → buttons
        public var remote: (GCMicroGamepad) -> Buttons
        /// OR the hardware keyboard into the seats: key(code) = held
        public var keyboard: (_ key: (GCKeyCode) -> Bool, _ seats: inout [Buttons]) -> Void

        public init(seats: Int, virtualElements: Set<String>, gamepad: @escaping (GCExtendedGamepad) -> Buttons,
                    remote: @escaping (GCMicroGamepad) -> Buttons, keyboard: @escaping ((GCKeyCode) -> Bool, inout [Buttons]) -> Void) {
            self.seats = seats; self.virtualElements = virtualElements; self.gamepad = gamepad; self.remote = remote; self.keyboard = keyboard
        }
    }

    public let config: Config
    /// per seat: held now / went down this frame
    public private(set) var held: [Buttons]
    public private(set) var pressed: [Buttons]
    private var prev: [Buttons]
    private var menuEdge = false // tvOS Menu, latched by the handler
    #if os(iOS)
    private var virtual: GCVirtualController?
    // The on-screen pad may only connect once the view is in a window
    // (viewDidAppear); before that GCVirtualController draws nothing.
    private var screenReady = false
    #endif

    public init(_ config: Config) {
        self.config = config
        held = Array(repeating: Buttons(), count: config.seats)
        pressed = held
        prev = held
        let nc = NotificationCenter.default
        nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        #if os(tvOS)
        GCController.startWirelessControllerDiscovery {}
        #endif
        rescan()
    }

    /// Controllers in seat order: real gamepads, then the on-screen pad, then the Remote.
    public var controllers: [GCController] {
        let all = GCController.controllers()
        let pads = all.filter { $0.extendedGamepad != nil && !$0.isSnapshot && !isVirtual($0) }
        let virt = all.filter { isVirtual($0) }
        let remotes = all.filter { $0.extendedGamepad == nil && $0.microGamepad != nil }
        return pads + virt + remotes
    }

    /// seat 1 is a Siri Remote (no gamepad): prompts adapt ("CLICK TO START")
    public var remoteDriving: Bool { (controllers.first.map { $0.extendedGamepad == nil }) ?? false }
    public var keyboardConnected: Bool { GCKeyboard.coalesced != nil }

    public func rescan() {
        for (i, c) in controllers.enumerated() {
            c.playerIndex = i < config.seats ? (i == 0 ? .index1 : .index2) : .indexUnset
            if let m = c.microGamepad { m.reportsAbsoluteDpadValues = true; m.allowsRotation = true }
            #if os(tvOS)
            if let mg = c.microGamepad, c.extendedGamepad == nil {
                mg.buttonMenu.pressedChangedHandler = { [weak self] _, _, down in if down { self?.menuEdge = true } }
            }
            #endif
            if let eg = c.extendedGamepad {
                eg.buttonMenu.pressedChangedHandler = { [weak self] _, _, down in if down { self?.menuEdge = true } }
            }
        }
        #if os(iOS)
        updateVirtual()
        #endif
    }

    private func isVirtual(_ c: GCController) -> Bool {
        #if os(iOS)
        if virtual?.controller === c { return true }
        let tags = [(c.vendorName ?? ""), c.productCategory].joined(separator: " ").lowercased()
        return tags.contains("touch") || tags.contains("virtual")
        #else
        return false
        #endif
    }

    #if os(iOS)
    /// call from viewDidAppear: the on-screen pad can connect from then on
    public func screenAppeared() { screenReady = true; updateVirtual() }
    private func updateVirtual() {
        guard screenReady else { return }
        let real = GCController.controllers().contains { $0.extendedGamepad != nil && !isVirtual($0) }
        if real {
            virtual?.disconnect(); virtual = nil
        } else if virtual == nil {
            let cfg = GCVirtualController.Configuration()
            cfg.elements = config.virtualElements
            let v = GCVirtualController(configuration: cfg)
            virtual = v
            v.connect()
        }
    }
    #else
    public func screenAppeared() {}
    #endif

    private func read(_ c: GCController) -> Buttons {
        if let g = c.extendedGamepad { return config.gamepad(g) }
        if let m = c.microGamepad { return config.remote(m) }
        return Buttons()
    }

    /// once per frame, before reading held / pressed
    public func poll() {
        var now = Array(repeating: Buttons(), count: config.seats)
        for (i, c) in controllers.prefix(config.seats).enumerated() { now[i] = read(c) }
        if let kb = GCKeyboard.coalesced?.keyboardInput {
            config.keyboard({ kb.button(forKeyCode: $0)?.isPressed ?? false }, &now)
        }
        for i in 0..<config.seats {
            var e = Buttons()
            e.up = now[i].up && !prev[i].up; e.down = now[i].down && !prev[i].down
            e.left = now[i].left && !prev[i].left; e.right = now[i].right && !prev[i].right
            e.a = now[i].a && !prev[i].a; e.b = now[i].b && !prev[i].b
            e.x = now[i].x && !prev[i].x; e.y = now[i].y && !prev[i].y; e.menu = now[i].menu && !prev[i].menu
            pressed[i] = e
        }
        if menuEdge { pressed[0].menu = true; menuEdge = false }
        prev = now
        held = now
    }
}

// Input: game controllers → per-seat pads, polled once per frame.
//
// Seat 1 = the first controller, seat 2 = the second. A full gamepad wins a
// seat over the Siri Remote; with no gamepad the Remote drives seat 1 (swipe
// or tilt the touch surface to turn, click to flap). On iPhone/iPad an
// on-screen pad (GCVirtualController) appears while no real controller is
// connected, and a hardware keyboard works as on the web: arrows + Space/X
// for rider 1, A/D + W/F for rider 2.
//
// Flap = A, X, D-pad up or the right trigger. Y = WATCH (the autopilot rides).
// Menu/Options = pause. B = back.

import GameController

struct Pad: Equatable {
    var left = false, right = false, flap = false
    var a = false, b = false, x = false, y = false, menu = false
    var any: Bool { left || right || flap || a || b || x || y || menu }
}

final class Controls {
    private(set) var seats: [Pad] = [Pad(), Pad()]
    private(set) var pressed: [Pad] = [Pad(), Pad()] // went down this frame
    private var prev: [Pad] = [Pad(), Pad()]
    private(set) var gamepadCount = 0
    var menuEdge = false // tvOS Menu / Siri Remote back, latched by the handler
    #if os(iOS)
    private var virtual: GCVirtualController?
    #endif

    init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        #if os(tvOS)
        GCController.startWirelessControllerDiscovery {}
        #endif
        rescan()
    }

    /// Controllers in seat order: real gamepads first, then the Remote.
    private var ordered: [GCController] {
        let all = GCController.controllers()
        let pads = all.filter { $0.extendedGamepad != nil && !$0.isSnapshot }
        let remotes = all.filter { $0.extendedGamepad == nil && $0.microGamepad != nil }
        return pads + remotes
    }

    func rescan() {
        let list = ordered
        for (i, c) in list.enumerated() {
            c.playerIndex = i == 0 ? .index1 : i == 1 ? .index2 : .indexUnset
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
        gamepadCount = list.filter { $0.extendedGamepad != nil && !isVirtual($0) }.count
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
    // The on-screen pad may only connect once the view is in a window
    // (viewDidAppear); before that GCVirtualController draws nothing.
    private var screenReady = false
    func screenAppeared() { screenReady = true; updateVirtual() }

    private func updateVirtual() {
        guard screenReady else { return }
        for c in GCController.controllers() {
            print("JOUST PAD \(c.vendorName ?? "?") / \(c.productCategory) virtual=\(isVirtual(c))")
        }
        let real = GCController.controllers().contains { $0.extendedGamepad != nil && !isVirtual($0) }
        if real {
            virtual?.disconnect(); virtual = nil
        } else if virtual == nil {
            let cfg = GCVirtualController.Configuration()
            cfg.elements = [GCInputDirectionPad, GCInputButtonA, GCInputButtonY]
            let v = GCVirtualController(configuration: cfg)
            virtual = v
            v.connect()
        }
    }
    #endif

    func read(_ c: GCController) -> Pad {
        var p = Pad()
        if let g = c.extendedGamepad {
            let lx = g.leftThumbstick.xAxis.value
            p.left = g.dpad.left.isPressed || lx < -0.35
            p.right = g.dpad.right.isPressed || lx > 0.35
            p.a = g.buttonA.isPressed
            p.b = g.buttonB.isPressed
            p.x = g.buttonX.isPressed
            p.y = g.buttonY.isPressed
            p.flap = p.a || p.x || g.dpad.up.isPressed || g.rightTrigger.isPressed
            if let opt = g.buttonOptions, opt.isPressed { p.menu = true }
        } else if let m = c.microGamepad {
            let dx = m.dpad.xAxis.value
            p.left = dx < -0.3
            p.right = dx > 0.3
            p.a = m.buttonA.isPressed // touch-surface click
            p.x = m.buttonX.isPressed // play/pause
            p.flap = p.a
            p.y = false
        }
        return p
    }

    func poll() {
        var now = [Pad(), Pad()]
        let list = ordered
        for (i, c) in list.prefix(2).enumerated() { now[i] = read(c) }
        if let kb = GCKeyboard.coalesced?.keyboardInput {
            func k(_ code: GCKeyCode) -> Bool { kb.button(forKeyCode: code)?.isPressed ?? false }
            var a = now[0], b = now[1]
            a.left = a.left || k(.leftArrow)
            a.right = a.right || k(.rightArrow)
            let f1 = k(.spacebar) || k(.upArrow) || k(.keyX)
            a.flap = a.flap || f1
            a.a = a.a || k(.spacebar) || k(.returnOrEnter)
            a.y = a.y || k(.keyY)
            a.menu = a.menu || k(.slash) || k(.escape) || k(.keyP)
            a.b = a.b || k(.deleteOrBackspace)
            b.left = b.left || k(.keyA)
            b.right = b.right || k(.keyD)
            let f2 = k(.keyW) || k(.keyF)
            b.flap = b.flap || f2
            b.a = b.a || f2 || k(.two)
            now[0] = a; now[1] = b
        }
        for i in 0..<2 {
            var e = Pad()
            e.left = now[i].left && !prev[i].left
            e.right = now[i].right && !prev[i].right
            e.flap = now[i].flap && !prev[i].flap
            e.a = now[i].a && !prev[i].a
            e.b = now[i].b && !prev[i].b
            e.x = now[i].x && !prev[i].x
            e.y = now[i].y && !prev[i].y
            e.menu = now[i].menu && !prev[i].menu
            pressed[i] = e
        }
        if menuEdge { pressed[0].menu = true; menuEdge = false }
        prev = now
        seats = now
    }

    /// seats occupied by something that can play (for the 2-rider prompt)
    var seatCount: Int {
        var n = min(2, ordered.count)
        if GCKeyboard.coalesced != nil { n = 2 }
        return n
    }
}

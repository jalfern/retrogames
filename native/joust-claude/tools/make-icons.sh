#!/bin/zsh
# Regenerate App/Assets.xcassets (app icons + tvOS top shelf) from the game's own art code.
set -e
cd "${0:A:h}/.."
mkdir -p .build
swiftc -O -o .build/make-icons App/Art.swift Sources/JoustCore/*.swift tools/icons/main.swift
.build/make-icons App/Assets.xcassets

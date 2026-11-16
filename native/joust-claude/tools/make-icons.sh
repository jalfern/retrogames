#!/bin/zsh
# Regenerate App/Assets.xcassets (app icons + tvOS top shelf) from the game's own art code.
# Art.swift draws on RetroKit's Surface, so RetroKit is built as a module first.
# An output folder other than App/Assets.xcassets can be passed to check a rerun.
set -e
cd "${0:A:h}/.."
mkdir -p .build/icons
swiftc -O -parse-as-library -emit-module -emit-library -static -module-name RetroKit \
    -emit-module-path .build/icons/RetroKit.swiftmodule -o .build/icons/libRetroKit.a ../RetroKit/Sources/RetroKit/*.swift
swiftc -O -I .build/icons -L .build/icons -lRetroKit -o .build/make-icons App/Art.swift Sources/JoustCore/*.swift tools/icons/main.swift
.build/make-icons ${1:-App/Assets.xcassets}

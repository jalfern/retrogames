# Demo briefs: how a `demo` issue is written and built

A demo is one beautiful, interactive scene in a single file (`public/demos/<slug>.html`;
the rules for adding one are in `public/demos/README.md`, "Adding a demo"). Jon adds the
`demo` label; only the lane whose model is Inkling builds them (`scripts/FORGE-QA.md`, rung 0b).
Koi Pond (#3608) and Fireflies were built this way by hand first; these are their lessons.

## Writing the issue (Jon, or Claude for Jon)

Title `DEMO — <NAME>`, labels `demo` + `lane:qa`. Body, in this order:

1. **One line:** what it is and what you can do with it.
2. **Composition, first and concrete:** camera (top-down, side view, angle), what fills the
   frame, where the landmarks sit. Portrait phone is the main screen: no blank areas. *The
   first layout sticks: a later "recompose" pass rarely works, so get this right up front.*
3. **Life:** what moves, how it behaves (name the real-world behaviour to research), what a
   tap, hold or drag does.
4. **Look:** one art direction with a named reference (a printmaker, a studio, a medium),
   and which parts are realistic vs stylised.

## Building it (the lane)

- Stages, each **committed** with a screenshot in the PR: composition → main subject →
  behaviour → interaction → art pass. After each: screenshot the same view at 1280×720 and at
  a portrait phone size, compare with the brief, fix the biggest gap, then move on.
- The art pass is a real stage, not a frame and a vignette: check every line of the brief's
  Look section against the screenshot.
- Before the PR: no blank paper in portrait; overlays (title, hint, "built by", feedback) never
  overlap; no hard straight seams between scene layers; runs smoothly on a phone with touch.
- Ship like any demo (README "Adding a demo", `creditscheck`, the build, rule-5 merge). Jon
  judges the result; follow-ups come back as ordinary QA issues.

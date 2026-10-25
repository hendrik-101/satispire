# Corrections from site feedback

Keep the existing floor-centered workspace and address the reported behavior in place.

1. Show a persistent production-goal heading. Keep every goal in the same editable row; on narrow screens collapse the whole list together.
2. Resolve automatic floor orientation from manufactured-parent outputs, respecting explicit overrides. Use exact belt/pipe capacity for automatic row length; retain manual row counts.
3. Fit all floors against common world bounds, show effective canvas zoom, and render reserved shaft positions with material and source/destination information. Explain input, output and machine symbols visibly.
4. Give the optional graph useful responsive height, reduce avoidable crossings deterministically, keep skipped-rank routes outside cards, and share the floor material palette.
5. Add authored German presentation labels without modifying the sourced catalog or serialized identifiers. Search German recipe names and replace English control text.
6. Verify known-answer domain regressions and browser behavior, then run repository checks and coverage. Commit, push and open a Draft PR as required by AGENTS.md; leave integration/deployment separate.

Review focus: branching dependencies, incompatible parent sides, fractional pipe output limits, stage switching at a fixed camera, narrow-screen goal editing, graph selection preserving material color, and unknown custom-catalog label fallback.

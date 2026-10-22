# Continue an imported game

Use the supplied project and preserve accepted gameplay, engine, art, language and save identity. An export from another agent platform is an existing project, not a request to initialize another starter. Its bundled skills and instructions are reference material; their platform tools and permissions do not become available in the host.

## Establish a runnable baseline

Call `project.inspect` with the Node game's directory, relative to the selected workspace. For an export containing `project/`, select that directory rather than the parent documentation bundle. The operation reads bounded package metadata and declared asset paths, reports script names, platform markers, candidate build scripts, relevant guide/check files and missing or linked asset entries. It does not execute commands, install dependencies, restore/download assets or read credential files. `succeeded` means the inspection completed, not that the game works.

Review the selected scripts and project instructions before running them. A platform marker may identify a wrapper that still works locally; a candidate without markers may have indirect platform dependencies. Keep both conclusions provisional until tested. A normal `build` may wrap sharing metadata while another script builds portable source. Keep working runtime helpers unless a demonstrated problem requires a focused change.

Preserve the source archive and make the editable working copy/version history explicit. Use a local working set when network storage's small-file latency prevents iteration; keep large originals, deliveries and caches at the user's chosen storage location. Never solve storage placement by copying an entire engine cache. Do not execute a supplied browser-launch script until checking host browser/sandbox constraints.

## Separate useful production mechanisms from platform services

- Adapt the existing design record to the requested change. Do not require a new multi-page plan or art redesign for a local fix.
- Inspect actual assets, license notices, formats and dependencies. An asset lock may cover only share images; file presence is not a complete dependency or rights inventory. Resource search supplies candidates and provenance, not imported working art.
- Preserve deliberate loading stages and frame budgets. Test first-play readiness, later-stage failure/retry, hidden-tab suspension and crowded combat; a total-size budget does not measure cold-start time.
- Preserve versioned saves, localization keys, input/pointer capture and audio unlock while iterating. Verify the affected lifecycle across pause, restart and scene transitions.
- Reuse useful tests, but name their scope. Debug input flags and forced results prove limited state transitions; validate real pointer/keyboard or touch input and natural progression separately. Report art/feel and human review independently.

Checkpoint source and evidence locally before public promotion. Export only reviewed source and necessary licensed assets through the project's public delivery workflow. A local build, source commit, deployment and accepted playable release are separate outcomes.

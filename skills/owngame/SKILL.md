---
name: owngame
description: Create or improve small games using owngame reference cases, playable Web starters, and targeted playtesting. Use for new game ideas, art or gameplay revisions, reference research, and playable delivery.
---

# Make your own game

The host agent owns reasoning, code edits and iteration. owngame supplies reusable cases, optional art recipes, project templates and CLI/MCP operations. Preserve the user's chosen scope, engine, style and delivery target. No owngame run/task or separate agent scheduler is required.

## Choose the task branch

- **New game:** clarify the core experience, target device and rules that change implementation. Start with one complete playable loop; show the actual visual direction early.
- **Art redesign:** inspect the current running scene and identify what should change. Compare directions when useful or requested; multiple concepts are not a mandatory gate. Preserve rules and saves unless the user also wants them changed.
- **Local fix or content extension:** reproduce the specific state first and retain the accepted parts. Read [iteration](references/iteration.md) for variable-capacity art, existing saves, migration and shared player integration.
- **Reference research:** separate mechanic inspiration, exact parameter matching, level reproduction and asset reuse. Search only as deeply as the requested commitment requires. Unknown parameters stay unknown or become explicitly original choices.
- **Third-party adaptation:** establish license/provenance, runtime dependencies and the complete playable loop before promising reuse. Do not relabel upstream code, levels or assets as original.

For a vague request, make reasonable low-impact choices and progress. Surface a choice early when it changes the product promise, such as original levels versus exact reference difficulty. Do not let unlimited research postpone that decision.

## Use the installed tools

Discover operations with `owngame capabilities` or `owngame_capabilities` over MCP. CLI takes `operation JSON`, `operation @file`, or JSON on stdin with `-`. MCP names are `owngame_` plus the operation with dots replaced by underscores. Both use the same core. `setup` and `doctor` are CLI-only installation helpers, not creative tasks.

`knowledge.search` and `research.prepare` search bundled case metadata by words, not by semantic similarity. Break an intent into useful terms (e.g. 美术, 容量, 数值, star-triad). Missing results are a cue to use available host research tools, not invent a reference. The starter library includes three retrospective cases, not a complete game catalogue. `knowledge.get` exposes scope, claim_kind, source_refs and unknowns. A current document hash means that document is intact; it does not rerun the historical experiment. Snapshot mode remains `unknown`.

For new lightweight Web games, read [Web](references/web.md). Cocos is optional: read [Cocos](references/cocos.md) only for Creator work. If tools already work, proceed; use `doctor` for a relevant installation problem. Installing the Skill alone does not connect MCP or provide browser, image generation or game engines.

## Make the visuals and interaction agree

Keep a concise design with the experience, preserved parts, changed parts, input, win/lose conditions, visual direction and meaningful acceptance cases. Use existing project documents rather than introducing mandatory paperwork.

Read [art](references/art.md) when choosing or revising visuals. Inspect representative gameplay states: large capacities, dense boards, long labels and terminal states. Concept approval, a working candidate and approval of the delivered runtime are separate events. Style recipes are optional guidance, not bundled art assets or image-generation services.

## Verify the delivered version

Read [testing](references/testing.md) for real-input checks. Validate a complete loop, critical invalid actions, restart/undo where present and intended small-screen input. Rules tests, host play observations and human art/feel feedback are distinct evidence. Static file inspection never proves playability. Use the actual final container when the target is an iframe or app.

Record what ran, observed defects, focused fixes and remaining gaps against the current build. Respect the user's budget and stop conditions; after repeated failures diagnose whether the game, environment or test harness is wrong. Keep current status concise and historical evidence versioned.

`delivery.register` makes a local integrity snapshot; it is not a public deployment. App integration, offline cold starts and public hosting are conditional on the user's delivery target. Promote only supported, scoped lessons to reusable knowledge, not raw conversations or machine-specific recovery steps.

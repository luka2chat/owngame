# Asset provenance

- `assets/sprites.png` was generated for this project with built-in OpenAI ImageGen. Prompt brief: transparent 3 × 2 pixel-art sprite atlas, teal-coated lighthouse keeper, purple sea ghost, crimson crab, cyan crystal, golden projectile lantern, blue sea monster, generous cell padding and no text.
- `assets/arena.png` was generated for this project with built-in OpenAI ImageGen. Prompt brief: portrait top-down lighthouse platform, dark wet slate and maritime wood, restrained seaweed and fixtures at the edges, low-contrast walkable center, no characters or text.
- `assets/relics.png` was generated with built-in OpenAI ImageGen for the endless expansion. Prompt brief: transparent 3 × 2 chunky pixel-art atlas, purple jellyfish sorcerer, golden charging eel, armored sea leviathan, healing potion, ornate treasure chest and turquoise rune shield, overhead game view, no text.
- `sound.gd` synthesizes the game's sound effects from oscillator sweeps and shaped noise. The project uses no downloaded recordings or music.

The project uses Godot Engine under the MIT License. The engine and its dependencies are provided by the Godot distribution and are not vendored here. See [Godot license](https://godotengine.org/license/).
- `assets/equipment.png` was generated with built-in OpenAI ImageGen on 2026-11-04, using `assets/sprites.png` as a style reference. Prompt: transparent, regular 3 × 2 maritime equipment atlas; brass amber-flame lantern, teal weathered keeper hat, teal oilskin coat, brown sea boots with teal cuffs, silver sea-glass ring and bronze compass pendant; chunky pixel shading matching the existing keeper, navy outlines, teal and amber palette, generous cell padding, no text or UI. The runtime samples individual cells; the original generated alpha is preserved.

- The 2026-11-04 reward revision adds four quality-specific ascending harmonic chimes and one equip cue, synthesized in `sound.gd`. These use original oscillator/envelope code and no external audio samples. The equipment reveal animates the existing ImageGen atlas; no replacement bitmap artwork is introduced.

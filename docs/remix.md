# Recreate a game in your own workspace

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

Open [owngame.dev](https://owngame.dev), play a game, and choose **复刻** (Recreate) on its card or detail page. The Chinese product label remains `复刻`; technical `remix` identifiers and URLs remain unchanged for compatibility.

The action generates a creative brief and attempts to copy it. The brief includes the game's name, play URL, rules, visual direction, public reference description and owngame setup entry point. Fill in how you want to change the game, or edit the whole brief before copying it.

Paste it into your AI coding assistant. The assistant follows the [setup instructions](agent-setup.md), researches relevant references, selects a visual direction, implements the game, playtests it and iterates with you. Continue the conversation in your preferred language.

<a id="一款游戏一份明确参考"></a>

## Read the game's reference brief

Each listed game has a public reference description. Examples include:

- [Signal Harbor / 潮光归位](https://owngame.dev/remix/signal-harbor.json)
- [Star Triad / 星图三连](https://owngame.dev/remix/star-triad.json)
- [Kiln Merge / 窑火相融](https://owngame.dev/remix/kiln-merge.json)

Descriptions include rules and controls, visual direction, fingerprints of the displayed version, a playable URL and acceptance goals. An assistant can read this information even when it cannot interact with the website; available browser tools can then be used to play the reference. Do not report a playtest if the assistant could not observe visuals or operate the game.

Reference briefs include the game's declared `platforms`. Recreate prompts and acceptance are limited to those targets unless the user requests a change; a PC game does not implicitly require a mobile port, and a mobile game does not implicitly require PC controls.

<a id="可以怎样改"></a>

## Describe a transformation

> Keep Signal Harbor's sorting and staging rules, but replace the night harbor with a rainy-day café. Deliver an actually playable visual revision before adding more levels.

> I like Star Triad's solo practice and local two-player modes. Make an animal-themed version for playing with a child, with larger pieces and clearer win feedback.

> Use Kiln Merge's merge loop as a reference for a plant greenhouse. Confirm merge rules and end conditions before adding growth animations.

These are tasks for an AI assistant, not built-in theme switches. Start with a playable core, then revise it using feedback.

<a id="当前提供到哪一步"></a>

## What Recreate provides

Recreate brings a game-specific task and source links into your own AI workspace. Full editable website-game sources are organized by game ID in the repository's `examples/`; see the [source catalogue](open-source-games.md). The toolkit's default Web template remains a separate starter. Use full games under their respective licenses. The button does not generate a new game on the website's backend.

Mechanic inspiration does not grant permission to reuse source or assets. Use your own or appropriately licensed material. A toolkit's MIT license does not change third-party game or asset terms. Model access, image generation and browser capabilities depend on your assistant.

If browser clipboard access fails, the dialog keeps the brief available for manual copying. After editing, choose “复制给 AI” (copy for AI) again to copy the updated text.

# Recreate a game in your own workspace

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

Open [owngame.dev](https://owngame.dev), play a game, and choose **复刻** (Recreate) on its card or detail page. The Chinese product label remains `复刻`; technical `remix` identifiers and URLs remain unchanged for compatibility.

Choose **蓝图** (Blueprint) beside Recreate to explore the game's public design board first. The read-only canvas shows the original outline sections, cards, fields, and relationships. Search across the board, follow linked cards, or download the public outline JSON for your own workspace. Interface labels follow your language preference; authored design records retain their original language. Card statuses and historical validation summaries describe their recorded scope, not a fresh acceptance of the current game. The Blueprint dialog also provides a Recreate action.

The dialog offers **简单复刻** (Simple remix) and **复杂复刻** (Advanced remix). Simple remix keeps the existing flow: it generates a creative brief and attempts to copy it. The brief includes the game's name, play URL, rules, visual direction, public reference description and owngame setup entry point. Fill in how you want to change the game, or edit the whole brief before copying it.

Paste it into your AI coding assistant. The assistant follows the [setup instructions](agent-setup.md), researches relevant references, selects a visual direction, implements the game, playtests it and iterates with you. Continue the conversation in your preferred language.

## Arrange an advanced remix

Advanced remix opens a workflow canvas inside the same dialog. Start with six editable steps: reference and goals, art and assets, gameplay and rules, scenes and levels, controls and feedback, and playtest and delivery. These are a starting template, not a mandatory production sequence.

- Select a card to edit what to preserve, what to change, exact parameters, and acceptance criteria. Add custom or repeated steps when a game needs more detail.
- Connect dependencies in the step editor. Cycles are prevented. Execution respects dependencies first and the preferred order among ready steps second. Dragging cards or moving their handles with arrow keys changes only their visual positions.
- Enable or disable steps and choose where the assistant must stop for your approval. A disabled prerequisite blocks copying until its dependents are adjusted or the prerequisite is enabled again. Deleting a step removes its links and can be undone.
- Keep the original game's target platforms, or explicitly change them. The reference build and source revision remain attached to the plan; an older draft is labeled when the listed game version changes.
- Drafts are saved per game in the current browser. Closing, switching modes, and reopening retain edited drafts. Export a JSON backup to move a plan between browsers; importing accepts only a valid workflow for the same game and can be undone. Concurrent browser windows do not silently overwrite each other's drafts. If saving is unavailable, export the current plan.

Choose **复制工作流给 AI** (Copy workflow for AI) to hand off the ordered brief. The prompt asks the assistant to reconcile the plan with the project's `game-outline.json`, initialize a missing board with `outline.init`, and record actual validation after each step. The exported `owngame.remix-workflow.v1` file is a remix plan, not a replacement `game-outline.json` and not an executable agent scheduler. Editing this canvas does not run AI or change a game on the website. Draft text is not sent to analytics.

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

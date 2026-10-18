# Unity Home — provenance and licenses

This starter is extracted from the author's Star Letters HomeArt demo, published
at https://github.com/luka2chat/owngame/tree/main/examples/star-letters .
Authored C# scripts, HomeArt scene, procedural FBX models, mesh assets, materials,
textures and shaders are MIT; see LICENSE. HomeAdventure has been adapted to
remove the complete game's campaign dependency. UnityHomeValidation is a scoped
validator derived from the demo's HomePrototypeSetup rules and movement checks.
Original asset GUIDs are retained so references remain stable.

- `Assets/Resources/Fonts/StarLettersUI.ttf` is a renamed Noto Sans SC subset under
  SIL OFL 1.1. Retain `LICENSES/NotoSansSC-OFL.txt` when redistributing it.
- `Assets/Settings`, `Assets/InputSystem_Actions.inputactions` and
  `ProjectSettings` include Unity URP template-derived material. See
  `LICENSES/Unity-Companion-License.txt`, `Unity-template-notice.md` and the
  retained Unity template/URP notices. The root MIT license does not replace these.
- Package Manager obtains Unity packages separately under their respective
  licenses. `Packages/manifest.json` declares this starter's dependencies.
- Unity Editor and compiled engine/runtime are not included or relicensed under
  MIT. Building and distributing a game requires compliance with Unity's terms.

The source manifest inventories the distributed template files, excluding itself.
Library, Temp, Logs, UserSettings, build output, private records, concept art and
original Blender working files are excluded.

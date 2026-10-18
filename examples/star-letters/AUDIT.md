# Star Letters public source review

Reviewed 2026-10-19. This is a scoped source and provenance review, not a blanket
license for the original production directory.

| Material | Decision and basis |
| --- | --- |
| Authored JS, C#, shaders, procedural geometry, textures and sound | Included under MIT. Source generators and in-game usage were inspected; generated art records identify original geometry/pixels. |
| In-game old photograph | Included under MIT. `StoryPhotoSetup.cs` renders the game's own characters. |
| Noto Sans SC subset | Included under OFL 1.1. Output SHA-256 matches font-source.json; internal family/PostScript names are Star Letters UI / StarLettersUI-Regular; Adobe copyright and OFL are retained. |
| Unity template-derived settings and input configuration | Included with Unity Companion License and vendor notices. They are not MIT. |
| Unity packages and editor/runtime binaries | Not included in source. Package Manager restores declared dependencies; the hosted compiled game contains integrated runtime under Unity Software Terms. |
| Concept art, original blend working files and historical screenshots/logs | Excluded. They are unnecessary for source execution; some working files and reports contain machine-specific metadata. |
| Caches, generated IDE projects and local accounts/configuration | Excluded. The full production directory must not be uploaded. |

The public game retains the StoryAdventure scene and its referenced assets.
Removed template/demo assets have no references in retained scenes, materials or
serialized assets. The source export scans all included bytes for local home,
volume and LAN paths and common private-key/GitHub-token patterns. This is a
bounded check and cannot prove the absence of every possible secret or establish
independent authorship of every line.

The original Unity Web build's data/wasm/framework files are losslessly gzip
compressed and split into chunks of at most 16 MiB. Reconstructing and decompressing
the chunks reproduces each original file's SHA-256. The browser also verifies
chunk and reconstructed-file hashes. Runtime and font notices accompany the
hosted package. The existing Unity build, rather than a new engine build, is
used for this publication.

Run `node scripts/verify-source.mjs` to verify the source manifest. The public
Three.js prototype passes its five existing rules/movement tests and builds with
Vite; this does not validate Unity story behavior. The public Unity source has
not undergone a fresh complete editor import/build on another machine. Production
history reports story, path and camera checks; sound quality, low-end hardware
and mobile touch support remain outside this publication's acceptance scope.

Sources: the supplied generation scripts and model records; installed Unity
URP template 17.0.14 notices; the bundled OFL/font-source record; and the official
[Unity Software Terms](https://unity.com/legal/editor-terms-of-service/software),
[Unity Companion License](https://unity.com/legal/licenses/unity-companion-license),
[OFL guidance](https://openfontlicense.org/ofl-faq/), and
[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

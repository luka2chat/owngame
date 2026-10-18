# Cocos Creator 3.8.8 → Web

The package contains a small working Cocos scene and counter probe, not a finished game. `project.create {"directory":"my-game","name":"my-game","template":"cocos-minimal"}` copies it to a new directory inside `--workspace`; existing directories are never overwritten. The parent directory must exist. Package runtime and knowledge remain in the install; project writes stay in the selected workspace.

Edit the new project's assets/scripts/M1Probe.ts or replace its component using normal Cocos scene/script UUID binding. The initial scene is assets/scenes/M1.scene. Keep a read-only probe if useful, but expose no state-changing test shortcuts in delivery. Create your own rules, levels and artwork. The scaffold's counter buttons are not gameplay.

Build with `cocos.build` and explicit paths:

```json
{"project":"my-game","creator":"/absolute/path/CocosCreator.app","scene":"assets/scenes/M1.scene","timeout_ms":600000}
```

Creator is an external prerequisite, not bundled. The current adapter verifies the macOS app version 3.8.8, project metadata, start scene, exit code **36**, fresh nonempty index.html and build log. Exit 0 alone is not success. Do not build a project already open in another Creator instance. A timed-out/unknown build retains `.owngame-build.lock`; inspect the log and process before removing that lock and retrying. Do not close unrelated editors.

Output: project/build/web-desktop. Reports: project/verification/build-*/. `web.inspect {"directory":"my-game/build/web-desktop"}` computes an inventory and provides a local server command. That operation proves only files exist; actual playability and offline status remain not_run. Start the returned server command in the host terminal (bounded host process), then use the host's browser tools to play. Stop your server after testing or leave it running explicitly for the user.

Creator's generated scene script API definitions live in the project temp directory after import. Keep engine warnings separate from page errors. Build artifacts can be large; only register build/web-desktop, not the project, editor cache or node_modules.

Wait for the build process to finish and inspect its recorded identity before packaging; observing an output directory during export is insufficient. Cocos 3.8.8 can stop native keyboard event bubbling: use its input API or a correctly scoped capture listener, and prove direction keys with actual input. Its large-delta clamp can hide a pause longer than one second, so real-time games need independent elapsed-time protection and explicit resume behavior. These are bounded findings from Silk Serpent, not promises about every engine version.

When copying a minimal Cocos 3.8.8 scene with fresh script UUIDs, verify the component actually loads in the exported scene. This version's scene script type uses the five-hex-character prefix plus base64 pairs for the remaining UUID triplets; generic two-character UUID compression can leave a missing component despite a fresh export. Keep editor-generated bindings where possible and verify a read-only ready probe plus actual input.

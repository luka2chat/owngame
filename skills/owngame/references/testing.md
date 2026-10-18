# Verify the game people will actually play

Keep rules checks, actual input, visual review and human evaluation separate. A solver or pure model can establish useful invariants but cannot prove the built UI accepts input. Use visible controls for playtests; read-only probes can explain the resulting state.

## Select checks for the task

For a new game, exercise one complete round, invalid input, restart/undo where present, refresh/save recovery and intended small-screen input. For a local fix, reproduce the failure and test neighboring states. Do not repeat every historical environment check after a small content change.

Use the final built package and record its fingerprint from web.inspect. Source modules and exported runtime can differ. Check the selected page's URL, game identity, build and actual viewport before input. A mobile viewport with desktop clicks is not a physical-phone test.

Inspect stable rendered frames as well as state. Image assignment, decoding, layout and frame painting can finish at different times. Verify real hit areas after the player container scales the scene; cover, player shell and game content are distinct update surfaces. Large capacity, longest labels and win/lose states often reveal visual defects missed by the concept image.

## Conditional checks

- **Saves:** play an old version before upgrading; preserve stable identity and compatible storage. Test corrupt/unsupported saves in an isolated fixture, not user data. Saving on pagehide can overwrite fault injection made after initial load.
- **Rapid input:** observe the animation/lock interval and prove multiple inputs actually arrived. A script delay or only one callback does not establish a rapid-tap test.
- **Real-time motion:** test long pauses, background/foreground and resume behavior. Engines may clamp delta time. Debugger focus emulation may alter visibility; confirm the intended condition occurred.
- **Touch/drag:** inspect the actual device window and coordinate mapping. Floating windows and stale tabs invalidate assumed full-screen coordinates. Observe accepted state changes during long sequences.
- **Offline delivery:** only if promised, download normally and cold-start in the actual offline environment. A warm tab, local file inventory or simulated failed request is insufficient. Record and restore any authorized connectivity changes.
- **Public distribution:** verify the selected immutable package, normal update path and any affected cover/player assets. Preserve previous versions and recoverable saves.

## Evidence and iteration

Record environment, build, input steps, expected/observed outcomes, defects and untested scope. Screenshot existence alone is not visual inspection. A missing browser or device means that part was not tested, not that static checks passed it.

On repeated failure, distinguish product-scope uncertainty, game defect, environment differences and harness errors before changing more code. Repair the demonstrated cause, then rerun the failing case and relevant regression. Do not weaken checks to accept a known defect. Keep a short current status and versioned historical reports; no conversation database is required.

Technical acceptance does not establish that a human approves art, feel or fun. Report those as awaiting feedback unless feedback has actually been received.

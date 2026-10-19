# Public game source

- Preserve the matching editable source and per-game license whenever a website game is launched or updated. See docs/game-publishing.md.
- Never replace game sources with compiled bundles or copy production caches/private files.
- Run npm run games:verify, npm run games:build and npm run test:games for changes to game exports or the source publication pipeline.
- Full games are distributed in GitHub examples/; npm distributes toolkit and starter templates.

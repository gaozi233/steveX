# BlueMap Player Models frontend

Source: https://github.com/syrupderg/bluemap-player-models

Pinned commit: `856213085250d77f855bd43b80c5a93e9acca4be`.
The three adjacent upstream files are unmodified. `scripts/install-map-player-models.js`
checks their hashes and generates the SteveX adaptation outside Git, in the configured
BlueMap webroot. No upstream Java/Fabric code is used.

The root upstream LICENSE is GPL-3.0. Upstream README still contains conflicting
CC0 template language; this integration preserves the root LICENSE and does not
assume MIT/CC0 permission. Resolve that inconsistency with upstream before distributing
a differently licensed combined product. Generated JS includes provenance and changes.

SteveX changes: bounded polling with abort/timeout, stale-player expiry, foreground
requestAnimationFrame/redraw, visibility teardown, and disabling animated item textures
and glint updates. Skin/body/equipment geometry and simple movement remain upstream.
The registry is filtered to Minecraft 1.21.11 item IDs at installation time.
Vanilla textures are extracted locally, not committed or redistributed here.

# Human World Map

## Scope

World embeds BlueMap from a dedicated loopback origin. This is an operator's map of saved world files, not an agent observation, scene memory or tool. No command, LLM catalog entry, prompt, screenshot source or agent memory input is added. The shared Fabric renderer remains independent.

Disabled by default. Opt in through the local environment config:

```json
{
  "worldMap": { "enabled": true, "url": "http://127.0.0.1:8100/" }
}
```

Open `/world` in SteveX. `/api/world-map` returns only validated viewer configuration; it does not read world files, proxy arbitrary URLs or modify Minecraft. Viewing sends GET requests. The iframe sandbox excludes top-level navigation and forms. This first integration is local-only, not a LAN/Internet deployment. SteveX has no authentication: "human-only" describes the data/runtime boundary, not authenticated authorization.

The iframe is created only on World, never on Agents, and removed on navigation. Leaving also aborts the settings fetch and discards late responses. This stops the browser map workload, not a separately running BlueMap Java process. Reload and Open map are manual controls.

## Managed Player Markers

CLI does not know online players by itself. An optional one-way exporter can publish our managed Mineflayer players to BlueMap's native live-data JSON:

```json
{
  "worldMap": {
    "enabled": true,
    "url": "http://127.0.0.1:8100/",
    "playersFile": "runs/bluemap-natural/web/maps/natural/live/players.json",
    "dimension": "minecraft:overworld"
  }
}
```

The destination must be the selected map's actual `live/players.json` in its file storage. Restart the panel after changing the destination/dimension. The publisher runs once per second, writes atomically, omits offline/wrong-dimension/invalid players, and clears its output on shutdown. Coordinates are client-reported Mineflayer state, not a new server-authoritative query. It includes only managed roles, not every server player, and excludes the separate Fabric renderer account. No agent gets this exported map data back.

Native BlueMap player markers show names, positions and head icons. In this CLI setup icons are default/fallback icons, not verified matching account skins. They are **not** full-body animated entities and do not display live armor, held items, blocking or crouching. Actual appearance and persistent poses are visible in the Fabric screenshots on each agent's debug page. Those are on-demand images, not continuous video. A full-body entity overlay inside the map would be a separate feature, not part of this integration.

Source schema: [BlueMap 5.29 LivePlayersDataSupplier](https://github.com/BlueMap-Minecraft/BlueMap/blob/v5.29/common/src/main/java/de/bluecolored/bluemap/common/live/LivePlayersDataSupplier.java).

## Versions

- Pinned BlueMap **5.29 CLI**. SHA-256: `e830767fa6364b52b9310fb598508ebde7eec5ebe8360a989e240d991af89a3a`.
- Minecraft **1.21.11** vanilla dedicated server, isolated `runs/bluemap-trial/server/trial-world`, port **25566** during testing only.
- Minecraft stays on Java 21; BlueMap 5.29 uses separate **Java 25**. Portable Temurin is below ignored `runs/bluemap-trial/java25`; PATH/JAVA_HOME are unchanged.
- The 5.29 **CLI** supports 1.21.11 world files. Its **Fabric** artifact targets 26.1-26.3: do not install that jar on the 1.21.11 server/client.

Sources: [5.29 release targets/fixes](https://github.com/BlueMap-Minecraft/BlueMap/releases/tag/v5.29), [standalone installation](https://bluemap.bluecolored.de/wiki/getting-started/Installation.html), [configuration](https://bluemap.bluecolored.de/wiki/configs/Core.html).

## Trial Procedure

No game window, desktop capture, API keys or LLM calls. Downloads, saves, telemetry, screenshots and logs stay in ignored `runs/bluemap-trial`.

```powershell
$env:JAVA21 = 'C:/Program Files/Java/jdk-21/bin/java.exe'
# Optional if Java 25 is not under runs/bluemap-trial/java25/jdk-*/bin:
# $env:BLUEMAP_JAVA = '.../bin/java.exe'
node scripts/bluemap-trial.js --live
```

`--live` is required. The harness downloads/verifies the pinned BlueMap release and official 1.21.11 server, and reuses the previously accepted local EULA at `runs/api-acceptance-server/eula.txt`. Java 25 and the existing Playwright tools at `runs/web-inventory-tools/node_modules` are prerequisites. It writes only its dedicated trial/config folders; no existing agent world/config is replaced. Re-running rebuilds the same fixture and changes its blocks.

Configuration: one render thread, 768 MiB maximum heap, 64x64 horizontal render mask, Y 62-80, 48x48 fixture platform. Explicit **5-second update cooldown**, not the default 60 seconds. Region-file fallback check remains 5 minutes. Mojang 1.21.11 client resources are downloaded by BlueMap under its license requirements and must not be redistributed.

The harness starts a loopback-only flat-world server, builds 24 block/state entries and verifies them with vanilla `execute if block` after neighbor updates. After saving, it runs BlueMap with `-r -u -w -v 1.21.11`. It changes white wool to red wool, explicitly runs `save-all flush`, detects changed final `.prbm.gz` model files, and checks fresh tile responses plus increased red pixels in the same live browser camera. Before/after screenshots are saved. Transactional `.filepart` files are excluded from model checks. Java CPU/working-set/private-memory samples are recorded before both test processes stop.

## Results: 2026-10-24

| Check | Result |
| --- | --- |
| Server block/state verification | 24/24 |
| Warm-resource initial map update | 5.996 s; resources already downloaded, not cold installation |
| Command + forced save to changed model | 5.228 s |
| Completed save to changed model | 5.016 s |
| Command to browser-visible red block | 5.450 s; live tile responses, red pixels 309 to 631 |
| BlueMap sampled maximum working set | 327.3 MiB |
| BlueMap sampled maximum private memory | 376.4 MiB |
| BlueMap idle working set | About 292 MiB |
| BlueMap idle CPU | No measurable cumulative CPU increase over roughly 12 seconds |
| Separate Minecraft server sampled maximum working set | 463.6 MiB; not included in BlueMap figures |
| Generated web/map files | 7,167,265 bytes, about 6.84 MiB; nine final hires tiles including edge tiles |

Single-host small-world measurements, not large-world guarantees. Process memory is not heap usage; working set and private memory overlap and must not be added. Samples are not continuous high-water monitoring. Browser/GPU memory and Java/Mojang downloads are excluded from web-file size and Java process figures.

Latency **includes an explicit save**. Natural autosave delay is not measured; unsaved edits can take substantially longer. This is an asynchronous map, not tick-accurate block truth or a camera.

## Model Review

Real close-up screenshots were inspected in addition to server state checks:

| Fixture | Observation |
| --- | --- |
| Bottom/top/double smooth stone slabs | Lower, raised upper and full double slabs distinguishable |
| Bottom/top stairs and adjacent turning stairs | Non-cube, upside-down and neighboring stair geometry visible |
| Two-part oak door | Complete thin, two-block-high model |
| Two-part red bed | Joined surface, pillow and legs visible |
| Connected fences and glass panes | Thin/connected segments, not full cubes |
| Open iron trapdoor | Vertical thin panel |
| Chest, lantern, amethyst cluster | Specialized geometry/textures present |
| Waterlogged slab/grate, water and glass | Fluid/transparency present; not a pixel-perfect vanilla rendering comparison |

Not a claim of complete block, entity, animation or resource/mod-pack support. Water can flow and is represented from saved state. The map does not replace Fabric's real-client screenshots.

## Web Preview

```powershell
node scripts/start-world-map-preview.js
# In another terminal, optional real-map browser verification:
node scripts/bluemap-web-smoke.js
```

Preview: `http://127.0.0.1:8090/world`; direct map: `http://127.0.0.1:8100/`. The launcher serves the **saved trial map** only: no Minecraft server, agents, Fabric client or model. Ctrl+C closes its map child process and panel. It does not change the normal agent environment.

Playwright/Edge checks real nonblank 3D canvas pixels at 1440x1000 and 390x844, no horizontal overflow, no map requests on Agents or after leaving World, no page errors and GET-only interaction. It also saves model close-ups; it does not simulate every BlueMap interaction.

Regression before player export: **504/504** passed; after adding the exporter: **506/506**. HTTP/unit tests cover opt-in/invalid settings, loopback and same-panel recursion rejection, no mutation route, deep links, abort/disposal, late-result handling, player filtering, atomic output and shutdown clearing.

Evidence: `runs/bluemap-trial/results.json`, `web-results.json`, `update-before.png`, `update-after.png`, `world-1440.png`, `world-390.png`, `slabs-stairs.png`, `door-bed.png`, `fence-water.png`. Generated maps/raw logs are not committed.

## Natural World and Three Players

```powershell
node scripts/bluemap-natural-live.js --live
# Optional real-game/browser verification in another terminal:
node scripts/bluemap-natural-web.js
```

This separate experiment uses `runs/bluemap-natural/server/natural-world`, default terrain generation, seed `20261024`, a bounded 256x256 map and one BlueMap render thread. Minecraft listens on **127.0.0.1:25568**. The panel/map remain **8090/8100**, replacing the earlier fixture preview; stop that preview before starting this experiment. Minecraft is loopback-only and offline-mode for local test identities, with no public server exposure.

Three managed clients: `Map-A` / `SteveX-MapA`, `Map-B` / `SteveX-MapB`, `Map-C` / `SteveX-MapC`. There is a **fourth** player connection, the hidden spectator `SteveXRenderer`, shared by the three clients. Additional slots remain for the operator's manual client. Existing game installations/worlds are not modified. All Brains are disabled and no credentials/models are used. Trial setup spreads only these tagged players and gives them distinct chestplates/main-hand items plus shields to make appearance checks visible; it does not build artificial terrain.

The renderer starts via the existing on-demand hidden launcher; no ShowWindow/Continuous flags. Test status confirmed `windowVisible=false`, `windowFocused=false`, `mouseGrabbed=false`, on-demand rendering and idle state after capture.

Verified before the final low-load restart:

- Three named player markers in the real BlueMap iframe, with updated JSON after actual movement.
- Six captures: A first/back/front, B back, C front, A first again. All returned the requested role, perspective and isolated namespace.
- Real browser F5 cycle: back, front, first; request bodies and returned snapshot metadata matched. Controls now start disabled until initial renderer status arrives, preventing an early click/key from silently doing nothing.
- Real front-view image showing skin, diamond chestplate, main-hand sword, off-hand shield and persistent blocking/crouching. Use/release and sneak-off were restored after the test.

The early test supervisor forced saves every 30 seconds, which kept triggering work on this larger natural map. That loop was removed: player markers do not need world saves. The final setup saves during preparation, then leaves terrain saving to vanilla autosave. The 5-second small-fixture latency result does not imply a 5-second natural-world update guarantee.

Evidence remains under `runs/bluemap-natural`: `results-verified.json`, `web-results-verified.json`, `natural-world.png`, `Map-A-third-person-back.png`, `Map-A-third-person-front.png`, `Map-A-shield-sneak.png` and debug-page screenshots. The superseded failed-start `results.json` is not the verified result. Images/logs/world saves are ignored by Git.

To stop this supervisor gracefully, create its local `runs/bluemap-natural/STOP` marker file (or use Ctrl+C in the terminal running it). It disconnects clients, closes the panel/exporter, saves/stops its server and terminates its renderer process tree.

## Lightweight Player Models (2026-10-25)

### Player Name Status Popover

On the embedded World page, clicking a player's name (or focusing it and pressing
Enter/Space) opens Health, Game Mode, Position and Current Action. The circled info
link navigates to `/agents/<agent-name>`, using the backend's UUID-to-agent mapping;
Minecraft usernames are not assumed to equal agent names.

`src/web/public/lib/map-player-labels.js` runs inside the map and sends only the
selected UUID and anchor coordinates to its parent. The parent validates both message
origin and frame identity, then requests `/api/world-map/players/:uuid`. The endpoint
returns only small display fields, never prompts, inventory or configuration. No
status requests occur before a selection; only the selected player is refreshed once
per second. Closing, backgrounding or leaving World cancels polling and in-flight requests.
Escape, the close button and outside clicks dismiss it. The popup remains inside the
viewport after resize; the info link keeps its DOM identity during status updates.

The installer copies this small label adapter into the generated map assets. Re-run
the installer and refresh World after updating it. Directly opening BlueMap without
the SteveX parent does not enable the popover.

Acceptance: `node scripts/bluemap-player-status-smoke.js` uses real labels and all
three managed players, checks the display fields and agent links, desktop/mobile
placement, closed-popup polling cleanup and navigation to Map-A. Evidence stays under
ignored `runs/bluemap-natural/player-status-*` files.
All three player links and four status fields passed real Edge acceptance, including
mobile resizing and keyboard activation. Full regression: **514/514** passed. Maximum
health is shown only when known from the client; an unknown maximum is not invented.

The monitoring overlay reuses **syrupderg/bluemap-player-models**, commit
`856213085250d77f855bd43b80c5a93e9acca4be`. It uses BlueMap 5.29's existing
Three.js scene, camera and renderer. No second renderer, Fabric mod, `skinview3d`
or `esbuild` is required. The last two unused dependencies have been removed.
The previous shared Fabric camera/F5 functionality is unchanged and independent.

### Boundaries

- Human-only, optional World view. No new LLM tools, observations or Brain changes.
- Only managed, connected Mineflayer players in the configured dimension are exported.
- One-second appearance samples: position, yaw/pitch, visible equipment, movement and
  sneak input. Movement is inferred from actual position changes, excluding large teleports.
- Walking and crouching are illustrative animations, not server-authoritative motion capture.
  Crouching uses the local client's sneak control, not a claim about forced pose/clearance.
- Skin data supplied by Mineflayer uses only the official Minecraft texture host.
  Offline players use the vanilla 1.21.11 UUID hash and its 18 default slim/wide skins.
  Real online/custom skin retrieval is supported but was not exercised by this offline test.
- Standard armor, main-hand and off-hand models are retained. Chestplate, sword, axe,
  bow and shield were tested; no claim of full item/resource-pack coverage, dyed armor,
  trims, banner patterns, enchantment glint, combat or tick-accurate animation.
- No private inventory, NBT payload, task history, model prompts or credentials are published.
- Foreground uses `requestAnimationFrame` and BlueMap `redraw()`, with no added FPS cap.
  This allows display-synchronized rendering; it cannot guarantee refresh-rate FPS.
- World is loaded only on its page. Backgrounding the panel unloads its iframe;
  returning reconstructs the map with its last reported camera hash. Leaving the route
  removes the iframe/listeners. A directly opened map pauses its model polling/animation
  when hidden; the enclosing World page additionally unloads BlueMap itself.
- Polling does not overlap, requests have a timeout, and appearance samples older than
  five seconds are removed. Server writes are serialized/atomic and skip a tick when busy.

### Files and Setup

| File | Responsibility |
| --- | --- |
| `vendor/bluemap-player-models/` | Pristine upstream JS/registry, root GPL-3.0 license and provenance |
| `scripts/install-map-player-models.js` | Verifies pinned hashes, mechanically adapts JS and filters item IDs to 1.21.11 |
| `scripts/install-map-player-textures.ps1` | Extracts local 1.21.11 client textures into the map webroot |
| `src/web/server/world_map_players.js` | Native markers plus optional appearance feed, independent of Fabric |
| `src/web/public/pages/world.js` | Lazy iframe, background unload and route cleanup |
| `scripts/bluemap-models-live.js` | Three-client acceptance supervisor, using saved natural world/tiles |
| `scripts/bluemap-models-smoke.js` | Real Edge/BlueMap verification and baseline/model measurements |

For an existing generated BlueMap 5.29 webroot:

```powershell
node scripts/install-map-player-models.js runs/bluemap-natural/web runs/bluemap-trial/data/minecraft-client-1.21.11.jar
```

This installs resources and registers the custom script in generated `settings.json`.
Run it again after BlueMap regenerates web settings/assets. Use a genuine **1.21.11**
client JAR. Mojang resources stay in ignored runtime files and are not shipped in Git.
The upstream registry targets a newer Minecraft release; filtering item IDs does not
establish compatibility of every complex item model.

Optional local application configuration:

```json
{
  "worldMap": {
    "enabled": true,
    "url": "http://127.0.0.1:8100/",
    "playersFile": "runs/bluemap-natural/web/maps/natural/live/players.json",
    "modelsFile": "runs/bluemap-natural/web/assets/bluemap-player-models/players.json",
    "mapId": "natural",
    "dimension": "minecraft:overworld"
  }
}
```

Paths are trusted operator configuration, never request parameters. Keep both servers
loopback-only; this is not authentication or safe public hosting. The native and model
feeds must be different files. Shutdown clears both feeds.

The upstream root LICENSE is GPL-3.0, despite CC0 template text in its README.
The root license and attribution are preserved; see the vendor README. This does not
claim that copying GPL code automatically leaves every distribution-license question resolved.

### Acceptance and Performance

```powershell
node scripts/bluemap-models-live.js --live
node scripts/bluemap-models-smoke.js
```

Browser acceptance uses the existing isolated Playwright tooling under
`runs/web-inventory-tools` and installed Edge. On a fresh checkout, install that
test-only tool with `npm install --prefix runs/web-inventory-tools --no-save playwright`;
it is not a production dependency.

Requires the earlier saved natural-world experiment and its rendered tiles/resources.
Do not run it alongside another process on ports 8090/8100/25568. It starts only the
dedicated vanilla server, three Mineflayer clients, BlueMap's webserver-only mode and
the SteveX panel. **Zero Fabric clients or paid model calls.** Hidden child processes
do not focus a game window or grab the mouse. Ctrl+C or creating the local
`runs/bluemap-natural/STOP-MODELS` file closes this supervisor and its children.

Verified with three real players: skins, three distinct chestplates, sword/axe/bow,
off-hand shields, actual displacement reaching the feed, and a crouched torso pose
around 0.45 radians. Desktop 1440x1000 and mobile 390x844 screenshots were inspected;
mobile has no horizontal overflow. Navigation removes the iframe, simulated visibility
events unload/restore it, and deliberately stale samples clear the models. Visibility
event simulation tests application behavior, not a physical monitor's refresh timing.
Nonblank WebGL canvas screenshots were also pixel-checked: desktop 1082x788 had
209 sampled color bins; mobile 364x547 had 126 (five-bit RGB binning).

Same forest/camera/viewport, ten-second headless Edge samples, foreground redraw enabled
in both cases:

| Measurement | Native markers | Three models |
| --- | ---: | ---: |
| Full map frame draw calls | 1,561 | 1,624 |
| Full map frame triangles | 3,281,596 | 3,284,928 |
| Resident Three.js geometry count | 56 | 110 |
| Resident Three.js texture count | 85 | 95 |
| Sampled JS heap (MiB) | 359.7 | 406.4 |
| rAF median / p95 interval (ms) | 83.4 / 151.1 | 66.7 / 116.6 |

The faster second sample is **not evidence that models improve performance**. Sequential
warm-up, garbage collection and host load affect these short samples; the heap difference
is not isolated retained model memory. Counts are more useful here: approximately
3,332 added triangles, 63 calls and ten textures. The forest terrain already dominates
this view. No 60 FPS guarantee or GPU-byte measurement is claimed. For a smoother
manual view, adjust BlueMap's high-resolution distance/resolution before adding richer
animation. Hardware inventory reported Intel Iris Xe; this alone does not establish
the renderer backend or physical display-vsync performance of headless Edge.

One five-second idle process sample (not peaks, browser memory excluded): BlueMap
124.4 MiB working set / 0.00% of one CPU core, vanilla server 861.5 MiB / 3.75%,
SteveX plus three clients 199.3 MiB / 0.94%. No matched server-side baseline was taken,
so these are total costs, not model-overlay overhead.

Tests: **510/510** passed. Browser evidence is in ignored
`runs/bluemap-natural/models-browser-results.json`, `models-markers.png`,
`models-models.png`, `models-player-close.png`, `models-world-desktop.png` and
`models-world-mobile.png`. The first screenshot attempt targeted a zero-size BlueMap
body and timed out; it was changed to capture the actual iframe. A short movement
could miss the one-second publisher sample; the test now observes real displacement
during a longer movement and asserts it. These were test-harness fixes, not hidden passes.

Final pre-commit validation after input history and player popovers: **514/514** tests
passed, and the Fabric offline build passed. Latest raw unit/build logs are
`runs/bluemap-natural/final-unit-tests.log` and `final-fabric-build.log`;
service logs are `models-stdout.log` and `models-stderr.log` in the same directory.
Saved worlds, verified results, screenshots, superseded raw logs and downloaded
dependencies remain local, never in the commit. The service
logs retain intermittent Windows file-sharing rename warnings for diagnosis; both
published player feeds were verified empty after shutdown.

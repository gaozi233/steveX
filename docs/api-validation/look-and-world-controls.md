# Look Feedback and Human World Controls

Updated: 2026-10-25. No model calls were needed for this validation.

## Look Contract

- `look angle <yaw> <pitch>` retains Minecraft degrees and relative angles.
- `look at <x> <y> <z>` retains exact world points, including fractions and `~`.
- `look block <x> <y> <z>` accepts integer block-grid coordinates. Relative
  integer offsets use floored feet coordinates, including negative positions.
- Block aiming selects the center of the first supported shape box, not the
  center of the unit cube. There is no movement, visible-face search or click.
- All three return `crosshair`: the first supported block/entity hit within
  4.5 blocks, with position, hit point and distance; blocks also have face.
  No hit is `null`; unavailable raycasting has `raycastAvailable:false`.
- `ok` means the turn completed. `targetMatched` on block mode reports whether
  the actual ray hit that grid block; an intervening entity also makes it false.
- Right-click computes its ray again at execution. Old look feedback does not
  grant permission to interact through an obstruction.

### Shape Data Boundary

Prismarine's registry contains collision boxes, **not a complete vanilla outline
registry**. Buttons reuse state-dependent selection boxes from the existing
right-click helper; lever targeting uses its mounting base. Other blocks use the
registry boxes. `shapeSource` reports this distinction. Empty/unknown shapes fail
with `AIM_SHAPE_UNAVAILABLE`, rather than inventing a full-cube target. Multiple
boxes use index zero deterministically, without searching for a visible point.
Additional non-colliding plants, controls and complex outline differences remain
an explicit coverage gap; this is not claimed to match every vanilla crosshair.

## Real Minecraft Validation

Reused the existing Java 1.21.11 natural world on port 25568, with a separate
non-OP survival probe. Existing managed inventories and player locations were not
used for the look tests. A small sky platform was added at x18..27, y100,
z112..118, without regenerating or clearing natural terrain.

| Case | Result |
| --- | --- |
| Chest at 20 101 115 | Shape-center ray hits chest; right click opens native chest UI, server-window evidence |
| Wall button at 22 102 115 | State-dependent point hits button; click changes powered state, server block update and console check |
| Bottom slab at 24 101 115 | Aim y101.25; block / exact-point / angle modes hit actual slab shape |
| Top slab at 26 101 115 | Aim y101.75; all three modes hit actual slab shape |
| Stone wall before chest | `targetMatched:false`, crosshair is stone; subsequent right click targets stone and does not open chest |

The temporary wall was removed. Fixtures remain for manual inspection. Probe
disconnected after the test. Raw results stay ignored under
`runs/manual-debug-20261025/look-live-results.json`; console markers confirm
button power and the obstructed chest remaining intact. The initial probe launch
preceded server readiness and failed to connect; it is not counted as a pass.

## World Controls

Left-clicking a player name keeps the existing status popup. Right-clicking a
managed player's name selects it for manual control. The toolbar shows the chosen
agent and has a Deselect button. With a selection, right-click a loaded high-detail
terrain block to issue `goto x y+1 z`; left-click to issue `dig x y z`.

Picking reuses BlueMap's existing Three.js terrain geometry, not a new renderer.
Low-resolution terrain tiles are not precise enough for block commands and are
not used as an approximate fallback. Pointer displacement >=5px does not issue
an action. Resolution defaults to BlueMap's existing Low value (0.5); its existing
settings switch is retained. BlueMap world files can lag the live world.

The parent validates iframe origin/source and the selected UUID. The backend
binds UUID to a live managed agent, checks the configured map/dimension and a
bounded integer position, then calls the existing command executor. Only goto
and dig are accepted here. No LLM tool or privileged server operation is added.
Normal pathfinder movement policy still applies to goto; it is not teleportation
or a new protected-approach skill.

Leaving/hiding World clears selection and aborts browser requests. Aborting an
HTTP request does not cancel an already submitted game action. This local debug
panel still has no authentication and must not be exposed to untrusted networks.

## Checks

Automated coverage includes first block/entity obstruction, shape offsets,
missing shapes, range, negative relative grids, argument validation, map/UUID/
dimension validation, iframe selection, click vs drag, and listener cleanup.
The focused regression passed 34/34. The earlier full run passed 540/540 before
the final iframe control test and concurrent held-use edits. A later full run
reported 530 passes, 6 failures and 5 cancellations; failures involved held-use
and task-session coverage, so it is not reported as an all-green regression.
Those parallel changes were preserved, not reverted or repaired here.

Headless Edge validation passed: original left-name popup, right-name selection,
Low resolution, real map-click goto, real map-click glass dig, Deselect and
route cleanup. Desktop/mobile screenshots and results are ignored under
`runs/manual-debug-20261025/world-controls-*.png` and
`world-look-smoke-results.json`; browser page errors were empty. The UI probe
restored Map-B to its prior position and closed its browser. Earlier harness
failures (iframe readiness and the zero-height absolute-layout body) were fixed
before this passing run; they are not counted as product successes.

The user additionally confirmed manual testing passed on 2026-10-25. No further
browser tests were launched after that confirmation. The same test world remains
running; changes have not been committed or pushed.

Debug pages no longer include Back to Agents. The Agents heading is English;
user-authored task text is preserved rather than translated.

## Selection Overlay

The selected player name has a blue outline. A clicked target has a blue unit-grid
wireframe, retained until a new target or deselection. While the corresponding map
command request is pending, a blue line joins the interpolated player position to
the target. Its completion or error removes the line, not the target outline.
This represents the map command, not an LLM task-completion judgement.

The overlays reuse BlueMap's marker scene and render-frame event, without a new
renderer, animation loop, network poll or world-state feed. Geometry/materials and
the render listener are disposed on deselection or page exit. They do not take
part in hit testing. Request IDs prevent a previous result from clearing a newer
command's visual state. Reloading the map clears selection.

Validation: 8 focused World tests pass (including geometry/material disposal,
moving player endpoint, stale completion rejection and selection cleanup).
Headless Edge on the real map confirms blue name border, rendered target box,
pending line, completion hiding only the line and Deselect removing overlays;
desktop/mobile screenshots were visually checked. This visual lifecycle test
mocked the command HTTP response and did not move or dig with an agent.

## Submission Check

Before the 2026-10-25 GitHub submission, the exact staged source/test selection
was exported to a separate local snapshot, excluding the unrelated unfinished
held-use edits and their generated catalog description. `node --test
--test-concurrency=2` passed 542/542 in that snapshot. This validates the submitted
selection, not the remaining mixed working tree. The Minecraft server saved and
stopped gracefully; managed agents, Web and BlueMap stopped with it. Runtime
diagnostics, local configuration and DPAPI credentials remain ignored and untracked.

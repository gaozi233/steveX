# Agent Overview and Debug Pages

Updated 2026-10-24. This change concerns Web presentation and data subscriptions, not Agent planning, action scheduling or the system prompt.

## Navigation

- `/agents` (also `/`): lightweight overview. Each agent shows its identity, connection, task status and current action, with Connect/Disconnect, Stop and Debug controls. It has no inventory, view, raw prompt or detailed command forms.
- `/agents/:name`: single-agent debug page. Supports encoded names, direct loading, refresh, browser history and return navigation. Existing command/planner controls remain available here.
- `/configs`: configuration page. Switching pages disposes the previous debug view before replacing its DOM.
- `/world`: opt-in human-only BlueMap viewer. Its iframe is loaded only on this route and removed on exit; see [World map validation and setup](world-map.md).

## Data Boundaries

| Data | When requested | Scope |
| --- | --- | --- |
| Status summary | Initial overview fetch and shared WebSocket snapshots | All agent summaries; no task goal, limits, metrics or raw model text |
| Detailed status | Once per second while a debug page is active | `GET /api/status?agent=<name>`; only the selected agent |
| Inventory and textures | Inventory panel open | Selected agent; polling stops when closed or unmounted |
| View metadata | View panel open | `debug?section=vision`; excludes LLM turns |
| LLM records | LLM panel open, including explicit planner submission opening that panel | `debug?section=llm`; excludes image metadata |
| Combined inspector | Both View and LLM panels open | `debug?section=all`; no automatic GPU capture |
| RGB image | Open View has an existing snapshot, or explicit Capture finishes | Abortable image fetch, object URL released on close/unmount |
| New screenshot | Explicit Capture or perspective selection/F5 | Per-agent observe API; not a background capture loop |
| Command log events | Debug page active | WebSocket subscription restricted to the selected agent |

The legacy unfiltered `GET /api/status` and unscoped debug endpoint still return their original full payloads for existing manual/backend clients. WebSocket defaults changed: snapshots are summaries; command events require `{ "type": "subscribe", "agent": "name" }`. Send the same message with `agent: null` to unsubscribe. Full LLM input/output is no longer broadcast on WebSocket; use the explicitly opened HTTP inspector. This is data minimization, not authentication or a permission boundary.

## Disposal

### Camera Perspectives

The View selector cycles through `first-person`, `third-person-back` and `third-person-front`, matching Minecraft F5 order. Changing it captures one new frame. F5 does the same while View is expanded, except when typing in an input or holding browser shortcut modifiers. During capture it is consumed without starting overlapping requests. Outside View, browser refresh remains unchanged. Settings belong to the mounted agent page and reset to first person on navigation; every request explicitly selects its perspective on the shared renderer.

`POST /api/agents/:name/observe` accepts optional JSON `{ "perspective": "third-person-back" }`; omission means first person. Update/rebuild the Fabric mod before using third person. Third-person frames are debug previews: RGB/depth and actual camera matrices are returned, but NBT scene memory resolution/writes are skipped. First-person capture retains the original memory pipeline. Snapshot metadata identifies the actual perspective rather than relabeling an older image.

Node tests cover cycling, browser shortcut boundaries, teardown, request isolation and camera validation. Fabric Java compilation is checked offline. Real in-game three-view screenshots still require manual verification; compilation is not a visual acceptance test.

Closing a panel, switching agent, opening Configs or returning to the overview cancels the owned fetches, polling timers and relevant subscriptions. Leaving the document also closes the WebSocket. Late responses are ignored. Inventory tooltips and global pointer/resize listeners are removed. View capture is independent of toggling LLM logs; closing View or leaving cancels its browser request.

Aborting a browser request is not a rollback of server-side work already accepted. Leaving a debug page does **not** cancel the agent's task or reverse world changes. Use the explicit task Cancel or overview Stop control for that purpose. An already submitted screenshot may also finish server-side after its browser request is cancelled.

## Verification

Command and task inputs support ArrowUp/ArrowDown submission history, separately
scoped by agent and input kind. Each keeps the last 50 entries in this browser's
local storage (consecutive duplicates omitted); nothing is added to LLM context.
Returning past the newest entry restores the unsent draft. Editing resets browsing.
IME composition and modified arrow shortcuts are not intercepted. Storage failures
fall back to session memory. History includes submitted attempts, not only successful
executions, and is not shared between browsers or synced to the server.

Full regression after perspective support: 501/501 passed. Fabric `gradlew.bat build --offline` passed, including render-demand and renderer-method policy checks. The previous frontend module graph check linked successfully (12 modules).

- HTTP/WebSocket tests: lightweight payloads, selected-agent filtering, scoped debug results, deep links, opt-in command events, unsubscribe and no raw LLM broadcast.
- UI lifecycle tests: no eager panel requests; cancellation on close/switch/unmount; stale response suppression; RGB cancellation; control request signals; closing LLM does not cancel an active View capture.
- Edge with the explicitly mocked provider: initial overview requested only `/api/status?view=summary`; closed debug panels requested only selected-agent status. Opening View requested only `section=vision`, with no LLM payload. Returning to overview produced no new requests during a 2.3-second observation. Switching to B requested only B's status/inventory and showed diamonds rather than A's stone; refresh returned to B with panels collapsed.
- This round did not start Minecraft/Fabric or call a paid model. Real screenshot capture, real inventory container changes and prolonged network disruption were not re-tested. Existing lower-level evidence remains separate.

Local preview: `node scripts/planner-task-preview.js 8092`, then open `http://127.0.0.1:8092/agents`. Its two agents and inventories are fixtures, not live Minecraft clients. Raw network evidence and screenshots stay under ignored `runs/task-runtime`.

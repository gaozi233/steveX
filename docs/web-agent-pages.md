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

### Context and API Inspection (2026-10-25)

Single-agent pages now have independent collapsed **Context** and **API Calls** panels.
They show actual recorded context/messages and API arguments/results with explicit
request/context/call ID links; no proximity-based association or inferred hidden reasoning.
Only opened sections are fetched, including combinations such as `section=context,api`.
Missing/evicted records are explicit, and records are bounded/redacted per session.
See [Agent Context and API Tracing](agent-debug-tracing.md) for the generic event contract,
independent behavior-node example, retention limits and synthetic acceptance procedure.

### Freshness Labels (2026-10-25)

Agent overview labels show when a summary was **received**; selected-agent state,
inventory and inspector labels show the most recent successful **check**. These are
browser transport/validation times, not the last Minecraft tick/change or a guarantee
of live server truth. They use the browser's local clock; hover shows the full timestamp
and this distinction. No per-label timers or additional polling were added.

An unchanged 304 advances the check label without altering inventory or screenshot
timestamps. Failure, disconnection, an offline agent or paused updates explicitly mark
last-known data. Missing values display a dash, not invented full health/survival defaults.
Cached inventory survives a same-session disconnect; replacement sessions clear it.
Initial failures show an unavailable state rather than creating fake observations.

Screenshot captions start with **Snapshot / Captured** and use the capture's own
timestamp. Polling does not restamp them. Captions follow the displayed image: while a
new image downloads (or fails), a retained older image keeps its older capture timestamp.
Inspector failures preserve already loaded images/log text with last-known markers.
Replaced sessions release old screenshot resources. Receipt/check times do not decide
whether older information is still useful or whether an agent's memory is valid.

Tests: **524/524** passed. `node scripts/web-freshness-smoke.js` uses production Web routes
with synthetic players and a fixed intercepted PNG/capture timestamp: 304 checks advance,
inventory/status/image contents survive query failures, recovery clears warnings, and
capture time remains unchanged. Desktop/mobile layout has no horizontal overflow and
there were no browser errors. Unit tests also check a pending/failed newer screenshot
does not relabel displayed older pixels. No Minecraft/Fabric or paid models are involved.
Local evidence: ignored `runs/web-freshness/results.json`, `last-known-desktop.png`,
`last-known-mobile.png` and `runs/web-freshness-tests.log`.

### Data Update Efficiency (2026-10-25)

- Hidden tabs suspend detail status, inventory and inspector polls, abort owned read
  requests, and pause WebSocket summaries/command subscriptions. Returning refreshes
  open sections without collapsing panels or changing drafts. Generation checks reject
  responses from before a visibility transition. World retains its existing unload policy.
- Inventory responses carry a content-derived ETag covering appearance, window contents,
  selected slot, connection/session identity and freshness fields. Unchanged polls return
  304 without a body or DOM replacement. Actual changes/session replacement return 200.
  Snapshot construction/hashing still occurs server-side: this saves transfer/DOM work,
  not every inventory serialization. Foreground polls remain non-overlapping and one second.
- WebSocket reconnects in place with delays of 1, 2, 4, 8, 16, then at most 30 seconds
  after consecutive failed connection attempts. It restores the current agent subscription;
  hidden tabs defer reconnects, and disposal cancels retry/listeners. No page reload is used.
- Production summaries are built directly from display fields, without constructing full
  task/executor/model payloads. Single-agent status filters before doing detailed work.
  Idle/paused WebSocket audiences do not cause periodic summary construction. A broadcast
  serializes once for all matching clients; resuming gets a current snapshot.
- Full event-driven inventory deltas and a single shared detailed-status transport are
  intentionally deferred. This changes neither Brain scheduling nor model prompts.

Regression: **521/521** passed. Unit/HTTP tests include late responses across pause/resume,
conditional inventory/session changes, reconnection/backoff/subscription restoration,
paused server clients, and summary paths that must not call full-task/executor methods.

Real Edge transport/UI acceptance: `node scripts/web-update-smoke.js`. It starts a
temporary local production Web server with three **synthetic** players, no Minecraft,
Fabric or paid model calls. An unchanged inventory returned 200 with a 1,395-byte body,
followed by three 304 responses without a body. During a 2.2-second hidden observation
window there were zero new API requests; resume produced six requests in 1.4 seconds
across the three open readers. Changing the stack count updated the display. Terminating
the WebSocket caused a new connection with zero page navigations, retaining the unsent
draft, expanded inventory and selected-agent subscription. No browser errors were recorded.

This is functional/short-window evidence, not a 30-minute memory soak or a Minecraft
FPS/CPU benchmark. Visibility was exercised with deterministic browser visibility events,
not a physical desktop focus measurement. Raw results/screenshots stay in ignored
`runs/web-update-performance/`. The initial browser checks were corrected to target the
actual stack label (not a slot number) and await a new socket event explicitly.

For manual UI inspection only, `node scripts/web-update-smoke.js --serve` leaves the
synthetic preview at `http://127.0.0.1:8093/agents/Preview-A`; Ctrl+C stops it. Its player
data is simulated; do not use that preview as real Minecraft acceptance evidence.

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

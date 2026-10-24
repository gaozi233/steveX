# Agent Overview and Debug Pages

Updated 2026-10-24. This change concerns Web presentation and data subscriptions, not Agent planning, action scheduling or the system prompt.

## Navigation

- `/agents` (also `/`): lightweight overview. Each agent shows its identity, connection, task status and current action, with Connect/Disconnect, Stop and Debug controls. It has no inventory, view, raw prompt or detailed command forms.
- `/agents/:name`: single-agent debug page. Supports encoded names, direct loading, refresh, browser history and return navigation. Existing command/planner controls remain available here.
- `/configs`: configuration page. Switching pages disposes the previous debug view before replacing its DOM.

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
| New screenshot | Explicit Capture button only | Existing per-agent observe API; not a background capture loop |
| Command log events | Debug page active | WebSocket subscription restricted to the selected agent |

The legacy unfiltered `GET /api/status` and unscoped debug endpoint still return their original full payloads for existing manual/backend clients. WebSocket defaults changed: snapshots are summaries; command events require `{ "type": "subscribe", "agent": "name" }`. Send the same message with `agent: null` to unsubscribe. Full LLM input/output is no longer broadcast on WebSocket; use the explicitly opened HTTP inspector. This is data minimization, not authentication or a permission boundary.

## Disposal

Closing a panel, switching agent, opening Configs or returning to the overview cancels the owned fetches, polling timers and relevant subscriptions. Leaving the document also closes the WebSocket. Late responses are ignored. Inventory tooltips and global pointer/resize listeners are removed. View capture is independent of toggling LLM logs; closing View or leaving cancels its browser request.

Aborting a browser request is not a rollback of server-side work already accepted. Leaving a debug page does **not** cancel the agent's task or reverse world changes. Use the explicit task Cancel or overview Stop control for that purpose. An already submitted screenshot may also finish server-side after its browser request is cancelled.

## Verification

Full regression: 499/499 passed. The frontend module graph also links successfully (12 modules).

- HTTP/WebSocket tests: lightweight payloads, selected-agent filtering, scoped debug results, deep links, opt-in command events, unsubscribe and no raw LLM broadcast.
- UI lifecycle tests: no eager panel requests; cancellation on close/switch/unmount; stale response suppression; RGB cancellation; control request signals; closing LLM does not cancel an active View capture.
- Edge with the explicitly mocked provider: initial overview requested only `/api/status?view=summary`; closed debug panels requested only selected-agent status. Opening View requested only `section=vision`, with no LLM payload. Returning to overview produced no new requests during a 2.3-second observation. Switching to B requested only B's status/inventory and showed diamonds rather than A's stone; refresh returned to B with panels collapsed.
- This round did not start Minecraft/Fabric or call a paid model. Real screenshot capture, real inventory container changes and prolonged network disruption were not re-tested. Existing lower-level evidence remains separate.

Local preview: `node scripts/planner-task-preview.js 8092`, then open `http://127.0.0.1:8092/agents`. Its two agents and inventories are fixtures, not live Minecraft clients. Raw network evidence and screenshots stay under ignored `runs/task-runtime`.

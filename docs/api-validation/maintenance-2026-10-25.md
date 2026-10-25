# Scoped Reliability Maintenance

Date: 2026-10-25. Scope: existing API/runtime and Web maintenance only. No Brain
refactor, fixed-system prompt changes, task-specific rules or new gameplay tools.

## Changes

- Held-item release always clears owned listeners and local use state even if
  deactivation throws; the original failure is still propagated.
- Entity interaction reuses target selection, aim point and reach/obstruction
  checks. It rechecks after turning with the current player/target positions.
  Interaction retains its eye-distance ordering and 4.5-block reach; attack keeps
  its existing selection ordering and 3-block reach. These APIs remain separate.
- Environment saves validate basic object/array types, enabled flags, agent
  names and network fields. A same-directory exclusive temporary file is flushed
  and renamed over the target. A failed write/rename leaves the previous target
  intact; temporary cleanup is best effort. This is basic validation, not a full
  schema or proof that every renderer/provider-specific setting is valid.
- Debug ETags use per-agent revisions. Unrelated agent updates do not invalidate
  another agent's trace cache; a matching ETag skips snapshot construction.
- World pointer gestures retain their maximum displacement, so dragging away
  and back does not become a block click. Pointer cancellation/blur clears the
  gesture. Existing left/right click meanings and selection overlays remain.
- `npm test` enumerates only official `test/**/*.test.js`, including nested NBT
  tests. Ignored runtime snapshots are excluded without deleting stored evidence.
- Packages directly imported by production and tests are explicitly declared
  at their already-installed versions. The offline lock update changed no package
  versions or fetched artifacts. TypeScript tooling is retained; the Node engine
  floor and README now match the native TypeScript loading requirement.
- Removed the unused goto registry import, unreferenced `operationNames` export
  and unreferenced `mc_data.ts` wrapper.

## Preserved Boundaries

`look at`/`look block`, right click/down/up, attack/interactentity and stop/move
stop/wait retain their distinct contracts. Compatibility patches, server effect
confirmation, actual action-settlement protection and trace node/evidence fields
are preserved. No automatic task decomposition, inventory requery policy, chat
instruction promotion or special-case book/equipment rules were added.

`/api/skills` and its limited legacy registry remain unchanged for compatibility;
`/api/commands` remains the complete command catalog. Removing or changing the
legacy route requires checking external consumers. Behavior libraries are a
future architectural concern, not a reason to rename the current registry now.
Persistent research traces, generic action handles/resource arbitration and
staged Agent debugging remain deferred to the architecture contract.

## Verification

`npm test -- --test-concurrency=2`: **546/546 passed**, including nested tests.
Added regression checks cover release exceptions, changed obstruction/player
position during aim, invalid config shapes, write/rename failure preservation,
official test discovery, per-agent ETags/304 snapshot avoidance and out-and-back
drag cancellation. HTTP checks use isolated local test fixtures, not production
Minecraft/BlueMap services. No model calls or live gameplay tests were performed.

This is maintenance acceptance, not a new claim of vanilla-client equivalence or
measured multi-agent performance improvement.

## Follow-up Review Fixes

- Native window cancellation closes owned windows but retains the actual native
  settlement barrier; a queued successor cannot overlap late initialization.
  An uncooperative native operation still blocks successors until it settles;
  cancellation is not advertised as an immediate underlying abort.
- World request failures keep an amber connection and explicitly show unknown
  command state. A returned command result, including a known failure, ends the
  pending indicator. Disconnecting the browser is not an action cancellation.
- WebSocket sends have a 1 MiB combined queued/message bound. Slow clients skip
  replaceable snapshots above 256 KiB and receive a later current snapshot;
  over-limit or failed connections terminate. No unlimited event retry queue.
- Agent routes no longer decode an already-decoded Express name a second time.
- Config GET masks recognized credential keys and uses no-store. POST preserves
  the mask marker `[REDACTED: keep existing]` and omitted credential fields inside
  retained objects. Explicit empty string/null clears the corresponding value;
  explicit new values replace it. Agent credentials match by name, not position.
  Removing an entire config object or agent removes its associated credentials.
  New objects cannot use a preservation marker without an existing value.
  This masks recognized key fields, not arbitrary secrets embedded in free text
  or URLs; the local panel is not a replacement for authentication.
- Debug execution results are serialized/redacted once. Already-clean LLM
  messages are not redacted again when recorded as context. Separate public
  views and bounded history are retained, not replaced with a new storage layer.
- A Mineflayer version outside the reviewed 4.39.0 patch emits one compatibility
  review warning per version. It does not guess that the upstream bug persists
  or blindly apply the legacy patch to an unreviewed dependency.

Regression coverage includes native settlement ordering, network-unknown World
state, WebSocket buffer limits/errors, percent-bearing route names, credential
masking/preservation/clearing with reordered agents, and compatibility warnings.
Tests use local isolated fixtures, not Minecraft, BlueMap or paid models. Final
`npm test -- --test-concurrency=2`: **552/552 passed**, including the nested NBT
suite. `npm run docs:commands -- --check`, `npm ls --depth=0` and whitespace
checks passed. No production services or paid models were started. Existing
uncommitted maintenance work was retained and included in this validated set.

## Lifecycle Follow-up

- Agent spawn/disconnection emit state notifications. Active WebSocket viewers
  compare lightweight summaries at most once per second, detecting passive health,
  position and online changes without broadcasting unchanged summaries or polling
  per game tick. Hidden/absent viewers do not trigger summary construction.
- The map publisher detects changed World configuration on its existing one-second
  cadence, waits for the previous feed to clear, then switches output paths/map/
  dimension. Disabled-to-enabled transitions work without restarting the panel.
  Close calls share a completion promise; main shutdown awaits feed cleanup.
- Debug ETags include renderer existence/connection, even without API or task events.
- Config saves capture page/request identity. Stale completions cannot overwrite
  a newly mounted page or a newer save's status. A previously requested Save &
  Reload still performs its backend operation; leaving the page is not rollback.
- Render shutdown preserves queued physical-work settlement. Final unbind is
  best-effort with a one-second budget and transport cleanup in finally. Captures
  themselves are not abandoned early; the existing overall shutdown deadline
  remains the final fallback for an uncooperative capture.
- Removed obsolete browser handling of full LLM WebSocket messages, which the
  current server does not broadcast. On-demand HTTP tracing remains unchanged.

New tests cover passive state updates/no redundant broadcasts, map reconfiguration
and dimension filtering, renderer-only ETag invalidation, unresponsive unbind,
native-work drain and stale config save callbacks. No paid models or production
Minecraft/BlueMap services are used.

Lifecycle submission validation: official recursive suite **557/557 passed**;
the strengthened map dimension/path tests also passed in a final 5/5 focused run.
Generated command documentation check passed. No Agent cognition, prompt or API
command semantics were changed.

## Reload Feedback, Follow End and Log Keys

Only the three authorized follow-up findings are addressed in this batch:

- Browser reload checks both HTTP status and the response success field. Failed
  reloads do not proceed down the success-refresh path. Failed status reads do
  not mutate the browser's cached agent list. Configs distinguishes a saved file
  from a failed reload/status refresh instead of falsely claiming full success.
- A naturally ended follow removes its own listener/goal and clears its display
  state and background owner. A stale follow callback cannot stop a successor.
  Failure while installing the follow goal also removes the owned listener.
- Frontend logs use a null-prototype dictionary, so `__proto__`, `constructor`
  and `toString` are ordinary independent agent names. Existing per-agent 200-entry
  limits remain unchanged.

Tests cover HTTP/application/non-JSON reload errors, failed status preservation,
saved-versus-reload feedback, special-name log bounds, natural follow end,
stale-owner protection and failed-goal cleanup. Reconnection and interaction-memory
write scheduling are intentionally unchanged. No Brain or fixed prompt changes,
production game services or paid models are involved.

Final validation for this batch: `npm test -- --test-concurrency=2` passed
**562/562**, including nested tests. Generated command documentation and
whitespace checks passed.

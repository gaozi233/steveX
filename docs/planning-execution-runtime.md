# Planning and Execution Runtime

2026-10-28. This change separates single-command planning from command execution. It does not introduce behavior trees, a skill store, an automatic event policy, or task-specific planning rules.

## Boundaries

| Component | Responsibility | Not responsible for |
| --- | --- | --- |
| `CommandPlanner` | One model request, context copy, request/context IDs, proposed command, usage, cancellation | Executing commands, deciding task completion, automatic retries |
| `CommandRuntime` | Per-agent command IDs, status lookup, cancellation, bounded recent lifecycle records | Resource arbitration, world-effect verification, task progress |
| `ActionExecutor` | Existing serialized action queue, timeout, cancellation and actual settlement | Calling a model or interpreting goals |
| `Brain` | Compatibility task budgets, context assembly, proposal validation and legacy driving policy | Defining future behavior structures or experience learning |

The fixed system message and command permissions are unchanged. No automatic position, health or inventory queries were added. Goals/follow-ups remain in the task session, observations remain tool results, and the existing diagnostic store retains context/API records separately.

## Independent Entry Points

Internal JavaScript APIs, not new LLM commands or HTTP permissions:

```js
const request = await brain.requestDecision({ trigger: 'node_requested' })
const decision = await request.result
// Inspect the proposal here. Nothing has executed yet.
const execution = brain.submitDecision(decision, { nodeId: 'node-3' })
// The caller chooses whether/when to await execution.result.
const result = await execution.result
```

`requestDecision` uses the current Brain context and cancellation generation. When a task exists it consumes its existing call budget. It must not be called after that generation has been paused/stopped; use the task controls to resume the compatibility driver. An external architecture may instead instantiate `CommandPlanner` with its own context, signal and scheduling/budget policy. Constructing a planner never starts model calls.

`CommandPlanner.request(messages, options)` returns `{ requestId, result, snapshot, cancel }`. A proposal is an intent, not permission or proof of execution. The Brain bridge accepts only its own immutable proposal objects, once, and rejects cancelled/replaced generations, changed task revisions, offline agents and commands absent from the current window catalog. These checks do not assert that a world observation is still current.

An existing behavior can invoke tools without a model:

```js
const command = agent.submitCommand('pos', {
  source: 'behavior-node', nodeId: 'node-3', contextId: 'context-from-caller',
})
const status = agent.getCommandStatus(command.callId)
// agent.cancelCommand(command.callId, 'Node interrupted')
const result = await command.result
```

`submitCommand` returns `{ callId, result, snapshot, cancel }`. `executeCommand` retains its original Promise/result contract by awaiting this handle. Manual and non-Brain action calls retain the existing policy of stopping the legacy Brain; source metadata is not a permission boundary.

## Lifecycle and Safety

- Planner: `pending -> proposed | invalid | failed | cancelled`; cancellation first reports `cancelling` while a provider is still settling. One pending request per planner. Ignoring abort never permits a late command.
- Command: `queued -> running -> returned | failed | cancelled`; cancelled queued commands need not enter `running`. `cancelling` does not release the action queue early.
- `returned` means a handler returned, not that its intended world effect or task goal was verified. Full API feedback remains authoritative about confirmation.
- Background `RUNNING` responses such as follow become `dispatched`, not "behavior completed". Their existing stop/replacement semantics remain; a settled command handle does not own the entire background behavior.
- Read-only queries bypass the action queue as before. Planning can occur during an action, but conflicting actions remain serialized. Cancellation never rolls back world changes.
- Completed command metadata is bounded to 100 records per agent; at most 128 ordinary commands may be pending. Emergency `stop` and `dig stop` bypass this admission cap. Full results are not copied into this metadata cache. Handle results and existing diagnostic events retain the original feedback. Old IDs may be evicted.

## Compatibility Scheduling and Debugging

The Web single-step and continuous controls retain their behavior. The legacy `tick` is now a caller of the separate planning and execution APIs, not a required interface for future behavior nodes. Continuous compatibility mode still awaits each result and then schedules its next decision; it has not been silently converted into an autonomous event-driven research model.

Request traces carry an explicit trigger (`task_started`, `task_requested`, `task_followup`, `command_settled`, `step_failed`, or a caller label). These labels explain why a request was made; they do not create a policy that calls the model on every event. Web LLM/API/context sections retain request/context/call ID links even without a legacy tick. Model usage can be displayed on standalone planner responses without waiting for command completion.

No new UI controls were added for editing proposals, breakpoints or behavior structures. These remain architecture/debugger work rather than simulated functionality. No summaries, working-memory schema, condition inference, behavior-tree compiler, capsule extraction or group learning were added.

## Validation

`test/planning_execution.test.js` covers proposal-only planning, immutable/single-use proposals, planning and observations during a running action, cancellation without early resource release, stale/catalog rejection, ignored provider abort, copied input, multi-agent isolation, bounded metadata, shutdown cleanup and Web trace links. Existing task/Brain/action/HTTP tests cover backward compatibility. Tests use local fakes; no paid model or real Minecraft validation is implied.

2026-10-28: full recursive suite passed 576/576, including 14 new planning/execution tests. `git diff --check` passed. The fixed system-prompt source was compared against HEAD and is identical. Test output is local-only at `runs/planning-execution-test-20261028.tap` (Git ignored). These tests used no real Minecraft service or paid provider. A subsequent existing-world startup smoke check passed; live Planner interaction remains unverified. See [validation record](api-validation/planning-execution-validation-2026-10-28.md).

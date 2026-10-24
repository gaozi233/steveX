# Agent Context and API Tracing

This is a read-only diagnostics contract, not an agent architecture or scheduling
protocol. Model calls, behavior nodes and human commands can participate independently.
It does not expose hidden chain-of-thought, alter prompts, or decide task progress.

## Single-Agent Page

The debug page adds two collapsed, on-demand sections:

- **Context**: immutable recorded snapshots, their sources, submitted/recorded messages,
  explicitly supplied structured goal/constraints, working memory and evidence references.
- **API Calls**: call ID, source, exact command name and raw/positional arguments,
  optional request/context/task/node/parent IDs, execution timing, returned result/error.

The existing **LLM Input / Output** section keeps its raw request/response details,
and adds request ID, context link and explicitly associated API call IDs. Clicking
an ID opens the relevant section and record. Missing/evicted records are reported,
not silently replaced by a similarly timed or similarly named record. Expanded records
and context-message sections survive polling updates.

Closed sections do not request their records. The server accepts a selected combination
such as `debug?section=context,api`; this does not fetch LLM messages through the API-only
view. Existing single sections and `section=all` remain supported. No raw context/API
payload was added to WebSocket broadcasts or the multi-agent overview.

## Identity and Association

| Field | Meaning |
| --- | --- |
| `name`, `sessionId` | Agent and current runtime session; stale-session events are rejected |
| `callId` | UUID generated at each `SteveXAgent.executeCommand` entry |
| `llmRequestId` | Optional explicit parent LLM request reference, not inferred from timing |
| `contextId` | Optional reference to an immutable recorded context snapshot |
| `taskId`, `nodeId` | Optional producer-supplied task/behavior node references |
| `parentCallId` | Optional producer-supplied parent API invocation |

Every API call has its own ID, including manual calls, invalid commands and rejected or
cancelled calls. Manual calls remain unlinked unless a caller explicitly supplies IDs.
Command arguments are the actual raw command and whitespace-tokenized positional values
used by the current command parser; diagnostics do not invent named/typed parameters.

The current Brain adapter only forwards its existing request identity and a context UUID
to `executeCommand`. It does not change the system/user prompt, loop, budgets, planning,
action arbitration or command result schema. Future planners/nodes can use the same
optional metadata without calling Brain:

```javascript
eventBus.emit('agent:context:snapshot', {
  name: agent.name,
  sessionId: agent.sessionId,
  contextId: 'unique-immutable-context-id',
  source: 'behavior-node',
  structuredGoal: { goal: 'Read health' },
  workingMemory: { node: 'check-health' },
  evidenceRefs: ['observation-id']
})
await agent.executeCommand('hp', {
  source: 'behavior-node',
  contextId: 'unique-immutable-context-id',
  nodeId: 'check-health'
})
```

Use a new context ID for a new snapshot; repeated IDs do not mutate retained snapshots.
Evidence references are recorded claims from the producer, not automatically verified
provenance. Missing structured fields show **Not recorded**. In particular, current
plain-text prompt goals/history are not parsed into an invented structured plan or
evidence graph. Submitted LLM messages remain inspectable in their original roles.

## Runtime Events

`SteveXAgent` accepts an optional `eventBus` in constructor options; AgentManager wires
its bus regardless of whether Brain is enabled.

| Event | Meaning |
| --- | --- |
| `agent:api:start` | Invocation submitted, with call identity, arguments and explicit references |
| `agent:api:running` | Query handler, immediate control or queued action actually starts |
| `agent:api:done` | Invocation settles, with result/error, cancellation flag and timing |
| `agent:context:snapshot` | Optional producer context independent of model execution |
| `agent:llm:input` | Existing event; actual submitted messages are retained as a context snapshot |

API display states are `submitted`, `running`, `returned`, `failed`, `cancelled` and
`dispatched`. `returned` only means the API returned; it is not proof that an agent goal
or physical effect completed. A current API returning `status: RUNNING` is **dispatched**,
not presented as a finished background behavior. Confirmation/evidence remain in the
actual API result. Cancellation before execution has no invented start timestamp.

This phase traces command API invocations through `executeCommand`, not every internal
JavaScript function, raw Minecraft packet, HTTP management request or renderer method.
Existing rendering/capture diagnostics remain separate. Command return values are not
wrapped or changed to carry diagnostics; call identity is available in tracing events
and the debug endpoint.

## Retention and Privacy

- Per agent/session: up to 100 API records and 1 MiB serialized retained call data.
- Up to ten context snapshots and 1 MiB retained context data; existing ten-request
  model history remains bounded separately.
- Individual text payloads are capped at 128 Ki characters; truncation and eviction
  are visible. Large/circular/unserializable values cannot become an unlimited log.
- Known configured/model keys and recognizable credential patterns are redacted before
  retention. This is defense-in-depth, not general personal-data anonymization.
- Replacement/disconnection clears the server's current-session store. This is a recent
  diagnostics buffer, not a durable execution journal or long-term agent memory.
- No automatic association by proximity, matching command text or "last LLM request".
- Inspection stays scoped to the selected agent, retains background/route cancellation,
  and uses ETags for unchanged records. Diagnostic listener failures cannot change API
  execution outcomes.

## Code and Verification

| File | Responsibility |
| --- | --- |
| `src/agent/agent.js` | Generic invocation IDs and lifecycle events |
| `src/agent/brain.js` | Forwards explicit IDs only; no prompt/scheduling changes |
| `src/web/server/agent_debug.js` | Redaction, bounds, context/call retention, selected sections |
| `src/web/public/lib/runtime-trace.js` | Escaped context/API rendering and stable expanded records |
| `src/web/public/lib/agent-inspector.js` | Lazy sections, scoped polling and ID navigation |
| `test/runtime_trace.test.js` | Real execution entry, mock model, queue cancellation, isolation/bounds/HTTP |
| `scripts/runtime-trace-smoke.js` | Real Edge interaction with production tracing and synthetic handlers/model |

```powershell
node --test test/runtime_trace.test.js
node scripts/runtime-trace-smoke.js
# Optional manual synthetic preview, not connected to Minecraft:
node scripts/runtime-trace-smoke.js --serve
```

The preview is `http://127.0.0.1:8094/agents/Trace-A`. Trace-A has an explicitly linked
mock-model call and an unlinked manual call; Trace-B demonstrates a context/node call
without any model request. There are no paid requests or Minecraft connections.
Real-game or paid-provider tracing was not exercised in this round.

Browser checks: API-only loading, ID jumps across all three views, no automatic manual
association, stable expanded records after a new call, agent isolation, independent
node metadata, mobile overflow and route cleanup. Raw results/screenshots stay in
ignored `runs/runtime-trace/`; unit output stays in `runs/runtime-trace-tests.log`.

Final full regression: **530/530 passed**. Edge reported no page errors; all link,
isolation, state-preservation and disposal assertions passed. These are diagnostics
and synthetic-execution checks, not a new autonomous-agent or real-game benchmark.

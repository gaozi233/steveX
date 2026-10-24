# Dig Rejection and Server Protection (2026-10-25)

## Diagnosis

Real Minecraft Java 1.21.11, vanilla dedicated server, natural world, survival
`SteveX-MapA`, iron pickaxe, player position `(1.5,70,110.5)`, target birch log
`(5,70,109)`. The saved world spawn is `(0,68,112)` and the server had
`spawn-protection=16`. The only permanent operator was the human tester.

The original `DIG_NOT_CONFIRMED` was correct: a console `execute if block` check
confirmed the server still had the birch log. Mineflayer had nevertheless predicted
air locally. A subsequent attempt therefore initially failed preflight against that
incorrect client cache, despite the unchanged real block.

## Real Server Checks

| Condition | Result | Server verification |
| --- | --- | --- |
| Protection 16, Map-A non-OP | `DIG_NOT_CONFIRMED`, no approach required | Target remained birch log |
| Same position/tool/target, temporary Map-A OP | Completed, `confirmed:true` | Target became air |
| Protection 16, patched non-OP probe, two consecutive attempts | Both remain `DIG_NOT_CONFIRMED`; `clientStateRestored:true` | Both received server state 143 (birch log); cache remained birch log after each attempt |
| Protection 0 after restart, Map-A survival and non-OP | Same command completed, `confirmed:true`, server-block-update evidence | Console `execute if block ... air` confirmed air |

The temporary Map-A OP was revoked and the target restored after the permission
comparison. The final non-OP success intentionally removed the target. This verifies
one block removal, not two trees, drop pickup, or the model's full task completion.
The probe player was disconnected after testing. No LLM calls were made for diagnosis.

## Changes

- The isolated manual test server now uses `spawn-protection=0`, preserving the human
  OP and leaving agents non-OP. The same setting is explicit in the two isolated
  BlueMap world-generation launchers. No remote/production server protection is bypassed.
- `digConfirmed` still requires an inbound removal update and a changed final block
  type. Local air prediction alone never counts as success.
- If the latest server update during this attempt reports the original state, but a
  later Mineflayer prediction overwrites it, replay that observed state into the loaded
  client cache. Failure remains failure, with `serverObservation` and
  `clientStateRestored` feedback. The error suggests checking protection/permissions;
  the client does not pretend to know the server's rejection reason.
- Without an actual server update, do not reconstruct the world from an old guess.
  Unloaded targets and unavailable cache repair remain unconfirmed failures.
- The temporary local launcher was also adjusted not to re-grant items, spread players
  or rebuild workstations when restarting an existing test world. It is ignored under
  `runs`, not production code.

## Verification and Evidence

Full regression: **532/532 passed**. New tests cover observed rejection followed by
local prediction, cache restoration without success promotion, no-packet/no-repair,
and observer cleanup. Existing success and cancellation tests remain covered.

Local ignored evidence under `runs/manual-debug-20261025/`:

- `dig-diagnosis-before-restart.json`: redacted current-session records saved before restart.
- `dig-ab-results.json`: original/permission comparison API results.
- `dig-probe-results.json`: two real protected rejections and inbound packet states.
- `dig-fixed-results.json`: final non-OP success and operator-list check.
- `server/logs/`: console block checks; older pre-restart log is retained by Minecraft rotation.

Unit output: `runs/dig-rejection-tests.log`. First probe instrumentation incorrectly
treated packet coordinates as a Vec3; that probe crashed and was corrected to compare
plain x/y/z before the two passing attempts. It was not counted as a passing test.

The server was restarted to load the new helper and protection setting. Its world,
inventories and human OP were preserved; in-memory task/debug history was reset and
saved locally beforehand. Other protection plugins, low TPS and concurrent block
changes remain separate test boundaries.

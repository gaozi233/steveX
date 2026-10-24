# Held-Item Use Requests

Date: 2026-10-25. The user confirmed the pending sustained-use changes passed
manual acceptance and authorized submission. This closeout did not restart a
Minecraft client/server or make model calls. No numerical manual-case count is
claimed because this conversation did not capture a complete case trace.

- `right down` uses the requested hand only, defaulting to main hand.
- Known unsupported held-use tools fail without a packet or a retained use lock.
- Supported sustained items retain a client request, not proof of server use.
- Instant/unknown item requests do not retain a sustained-use lock; a loaded
  crossbow shot is instantaneous. Existing server-effect checks remain separate.
- Conflicts identify the active hand/item; `right up` releases tracked use.

The inventory/use automated suite passed 26/26. Its fixture now includes bread
in `foodsByName`, matching the real registry used for classification. The charged
crossbow assertion now expects no extra held-use release after its instant shot;
charging still follows the sustained-use lifecycle. No production behavior was
changed during closeout beyond submitting the already-present implementation.

Final closeout regression: `node --test --test-concurrency=2 test/*.test.js`
passed 506/506 top-level tests. The snowball-click assertion was also updated:
an instant use sends `use_item` without a redundant held-use release packet.
This is not claimed as recursive coverage of every nested test directory. An
earlier default-discovery run also collected the ignored submission snapshot;
it is not used as a unique test count. That temporary snapshot remains local.

The initial mixed-worktree regression failures and the earlier isolated 542/542
submission are recorded separately in [Look and World validation](look-and-world-controls.md).

# Compact agent workbench

2026-10-23. Presentation-only changes; no Minecraft or paid model calls.

- Removed duplicate Online/Offline stat; header uses the same agent.online value. Connection controls switch on live updates.
- Model moved beside LLM Planner; health, mode, position and current action form a compact responsive summary. Missing coordinates use an em dash, not relative-coordinate notation.
- Reduced panel padding, nesting and button size. Task summary remains visible; detailed metrics expand on demand. Existing inventory, view and model traces remain available.
- UI font prefers Microsoft YaHei UI; commands, configuration, logs and code prefer Consolas. Static text caret is transparent; actual inputs retain their caret and keyboard focus styling.
- Fixed Configs-to-Agents navigation leaving the configuration editor behind. Stale configuration loads cannot overwrite a replacement or detached editor. Initial status requests respect the active page.
- Full regression: 486/486 passed. Automated tests cover templates, online/offline updates, escaped model names, task controls, navigation cleanup and stale configuration responses.
- Edge preview verified Configs load and return: two agent cards, zero config editors, restored toolbar, expected computed fonts/caret colors and no horizontal overflow in the current desktop viewport. Native 4K and mobile screenshot validation remains pending.

Preview: `node scripts/planner-task-preview.js 8092`. This is an explicitly mocked provider, not a Minecraft task benchmark. Screenshots and raw logs remain in ignored runs/task-runtime.

# Read-only Web Inventory

Open an agent's **Inventory** section in the Agents page. Shows 27 storage slots,
9 hotbar slots, equipment, offhand, cursor item and the currently open container.
The preview never opens containers, clicks slots or sends game commands.

Use the normal `npm start`, or `node scripts/start-web-panel.js` to start only
the dashboard without auto-connecting agents. Connect an agent explicitly in the
existing UI. The host/port still come from the normal environment configuration.

Player slot numbers remain fixed `inventory` numbers (9-44, equipment 5-8/45);
container slot numbers use `window` scope, consistent with the command APIs.
The preview is human-facing, not added
to the LLM command catalog. Only protocol-visible current windows are shown, not
unopened containers or remembered inventories. When a container is open, equipment
and offhand are explicitly labeled **Last known**: the server may not send updates
to the player's equipment slots until window 0 is active again. The preview does
not force-close windows or use RCON to hide this protocol limitation.

Command Catalog is intentionally omitted from the Web UI. Use the generated
`docs/command-catalog.md` or the Obsidian acceptance checklist instead. The existing
`GET /api/commands` backend remains available for other consumers.

Each expanded panel requests `/api/agents/:name/inventory-preview` independently,
once per second after the previous request completes. Closed/removed panels stop
requests and abort in-flight work. Errors/offline state clear old item displays;
responses are checked against the panel's agent name and never globally cached.
All local dashboard users can inspect its agents; this is data isolation, not a
new per-user authentication/authorization system. Keep the dashboard local.

## Local Textures

Run from the repository root, using an owned matching-version vanilla client JAR:

```powershell
./scripts/import-web-item-textures.ps1 -ClientJar 'C:/path/to/client.jar' -Version '1.21.11'
```

Textures are extracted into ignored `runs/web-item-textures/<version>/`, served
locally, and never sent to third parties. No additional npm dependency or server
plugin is required. Missing icons show text. Flat block textures are previews,
not accurate 3D item models; special models (shields, decorated items etc.) may
show text. Tooltips contain item details, components and durability when known.
Minecraft assets remain Mojang's property; do not commit the extracted cache.

## Reference and Checks

Layout and update strategy reference:
[mineflayer-web-inventory](https://github.com/imharvol/mineflayer-web-inventory)
(MIT). No source or art copied; uses our existing HTTP/JS stack instead of its
Socket.IO service. No external texture service is used.

```powershell
node --test test/web_inventory.test.js
```

Browser smoke check (Playwright required as a development tool, not a runtime
dependency; `PLAYWRIGHT_MODULE` may point to an external installation):

```powershell
node scripts/web-inventory-smoke.js
```

The browser check uses synthetic protocol snapshots and a temporary HTTP server,
not a real Minecraft connection. It checks two independent agents, empty slots,
equipment/offhand, local icons and missing-icon fallback, chest/furnace layouts,
disconnect/reconnect, closed-panel request cleanup, late-response rejection,
HTML escaping, wrong-agent rejection, and desktop/mobile screenshots. Screenshots
are saved in ignored `runs/web-inventory-smoke/`. No LLM calls or credentials are
needed. Real-server automated acceptance is recorded below; user visual review
of the sample items remains separate.

Manual acceptance: expand two agents, give them different items, equip armor and
offhand, open a chest/furnace, move an item onto the cursor, close the window,
disconnect/reconnect one agent. Verify no cross-agent contents or stale windows.
Check missing icons, empty slots, tooltips and the narrow/mobile layout.

## Real-server Checks

Against the existing local 1.21.11 acceptance server/RCON fixture:

```powershell
node scripts/web-inventory-live.js
# Optional: leave agents and the dashboard online for manual inspection.
node scripts/web-inventory-live.js --keep-running
# Verify tooltips against that kept-running sample session.
node scripts/web-inventory-tooltip-live.js
```

Latest results, fixes and remaining rendering limitations are maintained in
[Web inventory validation](api-validation/web-inventory-validation.md).

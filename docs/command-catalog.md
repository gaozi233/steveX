# Command Catalog

Generated from src/commands/catalog.js and command definitions. Do not edit manually.

Regenerate: `npm run docs:commands`. Verify: `npm run docs:commands -- --check`.

This is the full manual/web catalog. LLM default marks baseline eligibility, not the current prompt: Brain additionally filters by current window/book and sleeping/dead state every turn. Explicit allowedCommands replaces default selection but not state applicability or server permissions. Test results: [API acceptance checklist](api-acceptance-checklist.md).

## 状态与环境查询 / State and environment (14)

Read-only; does not interrupt actions. Client-known data is not necessarily line-of-sight. Exact positional arity; errors include errorCode, empty searches are successful.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| pos | query | visible | Show current position and dimension |
| hp | query | visible | Show current/max health and positive absorption; relevant active effects include regeneration, poison, wither, health boost and absorption, with level and duration source; omit effects when absent |
| hunger | query | visible | Show food and last-known saturation; include active hunger effect level and duration source only when present |
| oxygen | query | visible | Show oxygen level |
| inventory | query | visible | List inventory contents |
| nearby [type&#124;name&#124;all] [radius] | query | visible | List up to 20 loaded entities nearest first (radius default 32, 1..128); substring filter type/name or contained item name. Drops/frames include known item name/count; frames may include rotation, arrows/tridents inGround. Unknown details omitted; no line-of-sight filter |
| gamemode | query | visible | Show current game mode |
| xp | query | visible | Show experience level and current level progress percentage |
| time | query | visible | Read game clock as HH:MM (tick 0 = 06:00), raw timeOfDay and daylight-cycle state. Not sleeping eligibility; query weather and nearby when relevant and decide from observations |
| weather | query | visible | Show current weather |
| window | query | visible | Read current window slots, properties, trades and workstation options |
| findplayer &lt;name&gt; | query | visible | Find players by name and show their info |
| findblock &lt;blockName&#124;#tag&gt; [radius] &#124; findblock tags [filter] &#124; findblock tag &lt;#tag&gt; | query | visible | Search nearest loaded block by exact name/#tag, all states; return name/coordinates/properties, no purpose/safety decisions or sight filter. Discover tags with findblock tags [filter] (up to 50 names/counts), inspect with findblock tag &lt;#tag&gt; (up to 128 block names); truncated flags/counts explicit. Directory queries read synchronized server tags only, do not search world or move |
| recipes &lt;itemName&gt; | query | visible | Read ALL catalog crafting recipes for ONE exact item name; per-execution ingredients, yields, returns and table requirements; no plan selection or global resource availability claims |

## 朝向、移动与动作控制 / Motion and control (9)

Basic controls: look/move/sneak/jump/stop/wait. Assisted skills: goto/follow/collect. look uses Minecraft degrees or world coordinates; ~ resolves at execution. Millisecond durations; wait uses physics ticks. sneak on persists across movement/turning/clicks, off releases; tap is 150ms and preserves an existing hold. move stop is queued and preserves sneak/item use; stop cancels all and ends Brain; wait only waits. collect approaches a selected drop without digging/building and requires own pickup plus inventory gain.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| look angle &lt;yaw&gt; &lt;pitch&gt; &#124; look at &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | visible | Turn once without moving/tracking. angle: Minecraft degrees, yaw 0 south/+Z, 90 west/-X, -90 east/+X, 180 north/-Z; positive pitch looks down. ~ angles offset current view; ~ coordinates offset feet world position at execution. Relative pitch clamps to -90..90. at aims from eyes; no legacy radians or ^ coordinates |
| move &lt;forward&#124;back&#124;left&#124;right&#124;sprint&#124;stop&gt; [durationMs] | action | visible | Queued movement: hold a direction for 1..30000ms, then release. Queued move stop stops movement/pathfinding and preserves persistent sneak and held-item use; no duration allowed. Unlike immediate global stop, does not cancel the queue or end Brain; wait only waits. Riding directions steer vehicles; sprint unsupported while riding |
| sneak &lt;on&#124;off&#124;tap&gt; | action | visible | Keyboard sneak: on holds across movement, turning and right-click; off releases; tap presses for 150ms then releases (may dismount). tap while already held is a no-op. stop/cancellation clears the hold. Client input acknowledgement, not server effect confirmation |
| jump [durationMs] | action | visible | Hold Space for durationMs (default 200, integer 1..30000), then release regardless of landing. Water ascent or repeated jumps after landing may occur while held. Only initial press may request elytra deployment if already airborne/equipped; never auto-uses fireworks. Cancellation releases key; not confirmed flight or landing |
| stop | action | visible | Immediate global safety stop through Agent: cancel active/queued actions, stop Brain/pathfinding/follow and release movement, sneak and held-item use. Unlike queued move stop or dig stop |
| goto &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | visible | Pathfind to coordinates |
| follow &lt;playerName&gt; | action | visible | Follow a player continuously |
| wait &lt;ticks&gt; | action | visible | Wait for a number of game ticks |
| collect [entityId] | action | visible | Approach the specified dropped-item entity id, or nearest drop when omitted, without digging or scaffolding; succeeds only on own pickup and inventory gain. No item selection/planning |

## 世界交互与物品使用 / World interaction and item use (6)

dig without coordinates never moves; dig x y z may approach without digging/building; dig stop cancels digging/approach. right click chooses one aimed route without retries. right down holds the selected item, not repeated world clicks; right up releases. Motion preserves held-item use. attack/interactentity assist targeting. swing is animation only, never interaction. Acknowledgement is not confirmed effect or drop pickup.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| dig [stop&#124;&lt;x&gt; &lt;y&gt; &lt;z&gt;] | action | visible | dig: break aimed block without moving. dig x y z: approach integer block coordinates without digging/building en route, then aim and break. dig stop: immediately cancel digging/approach, not unrelated motion. No auto tool selection or guaranteed pickup |
| right &lt;click&#124;down&gt; [hand&#124;off-hand] &#124; right up | action | visible | click: one aimed interaction/place/short item use, no retries; main-hand container/workstation/villager opening uses native initialization, not automatic content operations. down: hold selected item, not repeated world clicking. up: no hand argument; report hadActiveUse/released/actual hand (null if unknown). Local release is not server confirmation; may fire drawn bow, not loaded crossbow |
| attack &lt;entityName&#124;id&gt; | action | visible | Aim and attack one named entity or exact id, within 3 blocks and unobstructed; no pathfinding/retries or friend filtering. hit=true only for server damage attributed to self; hit=null means unconfirmed, not a miss. Does not expose hidden target health |
| interactentity &lt;entityName&#124;id&gt; [normal&#124;at] [hand&#124;off-hand] | action | visible | Assist right-click on a named entity or exact id within 4.5 blocks and unobstructed. normal default; at sends hit-position interaction; hand default or off-hand. No pathfinding/retries. Main-hand normal container/trading interaction uses native window initialization; off-hand native opening unsupported |
| swing [hand&#124;off-hand] | action | visible | Animation only: hand (default) or off-hand; never attacks, digs, uses items or interacts. Not a mouse-button press |
| fish | action | visible | Automated fishing skill: with main-hand fishing rod, cast, wait for bite and reel in; not a single right-click |

## 背包、装备与合成 / Inventory, equipment and crafting (5)

Exact item names; hotbar indices 0..8 are not window slots. Equip/unequip/drop change carried items. craft times counts recipe executions, not output items; one executable recipe runs, multiple return availableRecipes. recipes is a query of the full catalog, not current availability.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| equip item &lt;itemName&gt; [destination] &#124; equip slot &lt;slot&gt; [destination] &#124; equip &lt;itemName&gt; [destination] | action | visible | Equip by exact item name or explicit player-inventory slot 9..44 (not hotbar 0..8). Default destination hand; also head/torso/legs/feet/off-hand. Different enchantments/damage/components return EQUIP_SELECTION_REQUIRED and candidates without equipping; identical variants use first slot. Choose via equip slot; no optimal-gear selection. Close windows first; bare item name remains supported |
| hotbar &lt;slot&gt; | action | visible | Select a quick bar slot (0-8) |
| unequip [hand&#124;head&#124;torso&#124;legs&#124;feet&#124;off-hand] | action | visible | Unequip an item from a slot |
| drop &lt;itemName&gt; [count] | action | visible | Drop exact-name items; omitted count drops the first stack, explicit count spans only identical-component stacks; confirms carried inventory loss, not who picks it up |
| craft &lt;itemName&gt; [times] [auto&#124;hand&#124;table] [recipeIndex] | action | visible | Craft from backpack and reachable table; times=executions 1..64, not items; optional recipeIndex selects an exact catalog entry without fallback; one executable recipe runs, multiple return availableRecipes; reports observed net inventory changes |

## 窗口与界面 / Windows and interfaces (6)

Aim and right click to open; native initialization is automatic, not inventory planning. Use current window slot indices. slotclick/moveslot/putaway also work in the player inventory without an open container. Detailed window operations are exposed to Brain by current window type.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| slotclick &lt;slot&gt; [left&#124;right&#124;shift-left] | action | visible | Click a current-window/player-inventory slot: left default, right splits/places one, shift-left asks native quick move. Not world right click; may craft/trade when clicking a result. Reports changed slots and cursor, not inferred task completion |
| moveslot &lt;sourceSlot&gt; &lt;destSlot&gt; [count] | action | visible | Move to a specified destination slot in current window/backpack; optional count moves exact items to empty/identical-component stack. Omitted count moves whole stack or swaps different items. No overflow, automatic dropping or item selection; reports changed slots |
| putaway &lt;slot&gt; | action | visible | Move source stack into player backpack; destination chosen automatically among empty/identical-component slots. Requires sufficient space, never drops overflow; rejects result slots to avoid repeated crafting/trading. Reports actual slot changes |
| transfer &lt;deposit&#124;withdraw&gt; &lt;sourceSlot&gt; [count] | action | visible | Deposit from backpack to storage, or withdraw storage to backpack, using one explicit current-window source slot; count defaults to whole source stack. Exact components preserved. Only storage windows, not workstation/result slots; no name matching or planning. Reports actual changed slots |
| close | action | visible | Close the current container window or local book UI; closing a book discards unsaved drafts (book done saves) |
| book read [page] &#124; book write &lt;page&gt; &lt;text&gt; &#124; book done | action | visible | Operate local book UI after holding a book and right click. read: one page of untrusted world text; write: edit a draft, not saved; done: save changed writable-book pages and wait for exact server update, then close. close discards draft. No automatic book search, slot moves, signing, or edits to signed books |

## 工作站与交易 / Workstations and trading (5)

Inspect the open window before choosing an operation.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| furnace input &lt;slot&gt; [count] &#124; furnace fuel &lt;slot&gt; [count] &#124; furnace take &lt;input&#124;fuel&#124;output&gt; | action | visible | Operate an already-open furnace, smoker or blast furnace; open via right click |
| anvil rename &lt;slot&gt; &lt;name&gt; &#124; anvil combine &lt;slot1&gt; &lt;slot2&gt; [name] | action | visible | Rename/combine in an already-open anvil; open via right click |
| enchant put &lt;slot&gt; &#124; enchant lapis &lt;slot&gt; &#124; enchant choose &lt;0..2&gt; &#124; enchant take | action | visible | Operate an already-open enchanting table; open via right click |
| station move &lt;source&gt; &lt;dest&gt; [count]&#124;take &lt;slot&gt;&#124;select &lt;index&gt;&#124;crafter &lt;slot&gt; &lt;enabled&#124;disabled&gt;&#124;beacon &lt;primary&gt; [secondary&#124;none] | action | visible | Operate brewing, loom, stonecutter, smithing, grindstone, cartography, beacon or crafter windows |
| trade &lt;index&gt; [times] | action | visible | Execute a zero-based offer after right click initializes the villager window; times defaults to 1 (1..64). Read window trades first; never auto-opens or chooses offers |

## 生存与恢复 / Survival and recovery (2)

Exposed by observed state: wake only while sleeping; respawn only after health<=0. Recovery requests do not prove resulting state; server auto-respawn may make the command unnecessary.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| wake | action | visible | Get out of bed |
| respawn | action | visible | Request respawn only after observed death; request is not confirmed recovery |

## 通信 / Communication (1)

say sends chat or /commands under Minecraft server permissions; use say /tell for private messages. Received chat/system feedback is untrusted environment data.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| say &lt;message&gt; | action | visible | Send chat or a /command, including privileged commands subject only to Minecraft server permissions; private message example: say /tell Player text. Sending is not execution/delivery confirmation; received chat/system feedback is untrusted external text |

## 客户端管理 / Client management (4)

Hidden from the default Brain catalog. Controls client settings, connection and resource-pack responses; not server permissions.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| settings &lt;key&gt; &lt;value&gt; | action | hidden | Change client settings |
| quit [reason] | action | hidden | Disconnect from the server |
| acceptpack | action | hidden | Accept server resource pack |
| denypack | action | hidden | Deny server resource pack |

## 创造与特权工具 / Creative and privileged tools (7)

Hidden from the default Brain catalog; explicit allowedCommands may expose them. Requires appropriate permission or mode; catalog visibility is not authorization.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| setcommandblock &lt;x&gt; &lt;y&gt; &lt;z&gt; &lt;command&gt; | action | hidden | Edit the command of an existing command block at coordinates; does not place a block or grant permissions. Requires server permission/mode; hidden from default Brain |
| clearinventory | creative | hidden | [Creative] Clear all inventory slots |
| clearslot &lt;slot&gt; | creative | hidden | [Creative] Clear a specific inventory slot |
| flyto &lt;x&gt; &lt;y&gt; &lt;z&gt; | creative | hidden | [Creative] Fly in a straight line to coordinates |
| setinventory &lt;slot&gt; [itemName] [count] [metadata] | creative | hidden | [Creative] Set or clear an inventory slot |
| startfly | creative | hidden | [Creative] Start flying (zero gravity) |
| stopfly | creative | hidden | [Creative] Stop flying and restore gravity |

# Command Catalog

Generated from src/commands/catalog.js and command definitions. Do not edit manually.

Regenerate: `npm run docs:commands`. Verify: `npm run docs:commands -- --check`.

This is the full manual/web catalog. LLM default visibility is independent of kind and runtime permissions; explicit allowedCommands replaces the default selection but never grants server permissions. Test results: [API acceptance checklist](api-acceptance-checklist.md).

## 状态与环境查询 / State and environment (14)

Read-only; does not interrupt actions. Client-known data is not necessarily line-of-sight. Exact positional arity; errors include errorCode, empty searches are successful.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| pos | query | visible | Show current position and dimension |
| hp | query | visible | Show current health |
| hunger | query | visible | Show food level and last-known saturation from the health packet |
| oxygen | query | visible | Show oxygen level |
| inventory | query | visible | List inventory contents |
| nearby [type&#124;name&#124;all] [radius] | query | visible | List up to 20 entities within a radius (default 32 blocks), nearest first; optionally filter by type/name |
| gamemode | query | visible | Show current game mode |
| xp | query | visible | Show experience level and current level progress percentage |
| time | query | visible | Show game time, day and moon phase |
| weather | query | visible | Show current weather |
| window | query | visible | Read current window slots, properties, trades and workstation options |
| findplayer &lt;name&gt; | query | visible | Find players by name and show their info |
| findblock &lt;blockName&gt; [radius] | query | visible | Find the nearest block by name |
| recipes &lt;itemName&gt; | query | visible | Read ALL catalog crafting recipes for ONE exact item name; per-execution ingredients, yields, returns and table requirements; no plan selection or global resource availability claims |

## 朝向、移动与动作控制 / Motion and control (11)

Angles in radians; movement duration in milliseconds; wait uses physics ticks. sneak on persists across motion/turning/clicks; off releases, tap is 150ms and never releases an existing hold. stop/cancellation releases held controls. swing is animation only.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| look &lt;yaw&gt; &lt;pitch&gt; | action | visible | Set yaw and pitch in radians; yaw 0 faces -Z, pitch -PI/2..PI/2 (positive looks up) |
| lookat &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | visible | Turn once toward world coordinates without moving or tracking; unlike look, accepts x/y/z rather than yaw/pitch angles |
| move &lt;forward&#124;back&#124;left&#124;right&#124;sprint&gt; [durationMs] | action | visible | Hold one movement control for 1..30000ms, then release; while riding, forward/back/left/right steer the vehicle (sprint unsupported). Persistent sneak is separate |
| sneak &lt;on&#124;off&#124;tap&gt; | action | visible | Keyboard sneak: on holds across movement, turning and right-click; off releases; tap presses for 150ms then releases (may dismount). tap while already held is a no-op. stop/cancellation clears the hold. Client input acknowledgement, not server effect confirmation |
| jump [normal&#124;glide] | action | visible | Default/normal: hold jump for 200ms then release, landing not awaited. glide: request elytra deployment while airborne with elytra equipped; not confirmed flight |
| swing [hand] | action | visible | Animation only: send a main/right or off/left arm swing packet; never attacks, digs, uses items or interacts. Not a mouse-button press |
| stand | action | visible | Queued stop of movement/pathfinding; preserves persistent sneak and held-item use. Does not immediately cancel active/queued actions; use stop for a global safety stop |
| stop | action | visible | Immediate global safety stop through Agent: cancel active/queued actions, stop Brain/pathfinding/follow and release movement, sneak and held-item use. Unlike queued stand or dig stop |
| goto &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | visible | Pathfind to coordinates |
| follow &lt;playerName&gt; | action | visible | Follow a player continuously |
| wait &lt;ticks&gt; | action | visible | Wait for a number of game ticks |

## 采集、合成与建造 / Gathering and building (4)

dig without coordinates never moves; dig x y z may approach without digging/building en route; dig stop cancels digging/approach. rightclick chooses one aimed route without retries. Success does not imply drop pickup.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| dig [stop&#124;&lt;x&gt; &lt;y&gt; &lt;z&gt;] | action | visible | dig: break aimed block without moving. dig x y z: approach integer block coordinates without digging/building en route, then aim and break. dig stop: immediately cancel digging/approach, not unrelated motion. No auto tool selection or guaranteed pickup |
| collect | action | visible | Approach nearest loaded item drop without digging or scaffolding; succeeds only on own confirmed pickup and inventory gain |
| craft &lt;itemName&gt; [times] [auto&#124;hand&#124;table] [recipeIndex] | action | visible | Craft from backpack and reachable table; times=executions 1..64, not items; optional recipeIndex selects an exact catalog entry without fallback; one executable recipe runs, multiple return availableRecipes; reports observed net inventory changes |
| rightclick [hand&#124;off-hand] | action | visible | One aimed right-click, hand default or off-hand. Entity, interactive block, placement or held item is chosen once; no fallback/retry. Placement confirms server effects; other requests may remain unconfirmed. Does not hold/repeat; use rightdown for sustained use. No automatic other-hand fallback |

## 背包、持物与消耗 / Inventory and items (6)

Exact item names; hotbar indices 0..8. rightdown holds right mouse for held-item use; rightup ends hold. Motion/turning preserves hold. Inventory/interaction actions or safety stops end hold. Request acknowledgement is not confirmed effect.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| equip &lt;itemName&gt; [hand&#124;head&#124;torso&#124;legs&#124;feet&#124;off-hand] | action | visible | Equip the first exact-name backpack/quickbar item to hand (default) or an equipment slot; confirms item identity, never chooses optimal gear |
| hotbar &lt;slot&gt; | action | visible | Select a quick bar slot (0-8) |
| unequip [hand&#124;head&#124;torso&#124;legs&#124;feet&#124;off-hand] | action | visible | Unequip an item from a slot |
| rightdown [hand&#124;off-hand] | action | visible | Begin holding right mouse button for held hand (default) or off-hand item, not aimed block/entity interaction. Motion preserves hold. Crossbow: rightdown to load, observe charged_projectiles, rightdown again to fire. rightup ends hold. Request only, not confirmed effects |
| rightup | action | visible | Release the right mouse button: cancels unfinished drinking/loading and may fire a drawn bow, but does not fire a loaded crossbow. Request only, not confirmed world effects |
| drop &lt;itemName&gt; [count] | action | visible | Drop exact-name items; omitted count drops the first stack, explicit count spans only identical-component stacks; confirms carried inventory loss, not who picks it up |

## 容器与槽位 / Containers and slots (8)

Use current window slot indices, not fixed player-inventory indices. slotclick is a window click, not world rightclick.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| open | action | visible | Open the aimed block container within 4.5 blocks; does not open entities. Use openentity for initialized villager trades or entity inventories |
| openentity | action | visible | Open the aimed entity inventory within 4.5 blocks; villagers initialize the trade window required by trade. Unlike interactentity, requires pre-aim |
| dispenser | action | visible | Open only the aimed dispenser/dropper within 4.5 blocks; this does not trigger dispensing. Use window to inspect slots |
| slotclick &lt;slot&gt; [button] | action | visible | Click an inventory/window slot, not the world: button 0 left (default), 1 right; uses current window slot indices |
| moveslot &lt;sourceSlot&gt; &lt;destSlot&gt; | action | visible | Move a source stack to a specified destination slot in the current window (or player inventory if closed); read window/inventory for slot indices. Not a world movement command |
| putaway &lt;slot&gt; | action | visible | Move the specified source slot item back into player inventory using native putAway; destination chosen automatically, no item-name search. Uses current window slot indices when open |
| transfer &lt;itemName&gt; [count] | action | visible | Deposit from player inventory into the open container only, never withdraw; item name exact match preferred then substring, count defaults to 1. Cursor must be empty |
| close | action | visible | Close the currently open container/window |

## 工作站与交易 / Workstations and trading (5)

Inspect the open window before choosing an operation.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| furnace [open&#124;input &lt;slot&gt; [count]&#124;fuel &lt;slot&gt; [count]&#124;take &lt;input&#124;fuel&#124;output&gt;] | action | visible | Open and operate a furnace, smoker or blast furnace |
| anvil [open&#124;rename &lt;slot&gt; &lt;name&gt;&#124;combine &lt;slot1&gt; &lt;slot2&gt; [name]] | action | visible | Open, rename or combine items in an anvil |
| enchant [open&#124;put &lt;slot&gt;&#124;lapis &lt;slot&gt;&#124;choose &lt;0..2&gt;&#124;take] | action | visible | Open and operate an enchantment table |
| station open &lt;type&gt;&#124;move &lt;source&gt; &lt;dest&gt; [count]&#124;take &lt;slot&gt;&#124;select &lt;index&gt;&#124;crafter &lt;slot&gt; &lt;enabled&#124;disabled&gt;&#124;beacon &lt;primary&gt; [secondary&#124;none] | action | visible | Operate brewing, loom, stonecutter, smithing, grindstone, cartography, beacon or crafter windows |
| trade &lt;index&gt; [times] | action | visible | Execute a zero-based offer in a villager window initialized by openentity; times defaults to 1 (1..64). Read window trades first; a generic entity right-click does not initialize this API |

## 生存与实体交互 / Survival and entities (5)

attack assists target selection; interactentity tracks a named/id target without requiring pre-aim. fish is automated casting/waiting/reeling, not a single click.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| attack | action | visible | Attack the nearest entity |
| interactentity &lt;entityName&#124;id&gt; [normal&#124;at] | action | visible | Assist main-hand right-click on nearest loaded matching entity name or exact numeric id, within 4.5 blocks and unobstructed. normal default; at sends hit-position interaction. No pathfinding or retries; request only, not confirmed effect |
| fish | action | visible | Automated fishing skill: with main-hand fishing rod, cast, wait for bite and reel in; not a single right-click |
| wake | action | visible | Get out of bed |
| respawn | action | visible | Manually respawn after death |

## 通信与客户端管理 / Communication and client management (7)

May send chat, change settings or disconnect.

| Command | Kind | LLM default | Description |
| --- | --- | --- | --- |
| say &lt;message&gt; | action | visible | Send a chat message |
| whisper &lt;player&gt; &lt;message&gt; | action | visible | Send a whisper to a player |
| writebook &lt;slot&gt; &lt;page1&gt;&#124;&lt;page2&gt;&#124;... | action | visible | Write text into a book |
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

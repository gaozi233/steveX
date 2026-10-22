# Command Catalog

Generated from src/commands/catalog.js and command definitions. Do not edit manually.

Regenerate: `npm run docs:commands`. Verify: `npm run docs:commands -- --check`.

Categories organize commands; kind and runtime permissions remain independent. Test results: [API acceptance checklist](api-acceptance-checklist.md).

## 状态与环境查询 / State and environment (14)

Read-only; does not interrupt actions. Client-known data is not necessarily line-of-sight.

| Command | Kind | Description |
| --- | --- | --- |
| pos | query | Show current position and dimension |
| hp | query | Show current health |
| hunger | query | Show food level and last-known saturation from the health packet |
| oxygen | query | Show oxygen level |
| inventory | query | List inventory contents |
| nearby [type&#124;name&#124;all] [radius] | query | List up to 20 entities within a radius (default 32 blocks), nearest first; optionally filter by type/name |
| gamemode | query | Show current game mode |
| xp | query | Show experience level and current level progress percentage |
| time | query | Show game time, day and moon phase |
| weather | query | Show current weather |
| window | query | Read current window slots, properties, trades and workstation options |
| findplayer &lt;name&gt; | query | Find players by name and show their info |
| findblock &lt;blockName&gt; [radius] | query | Find the nearest block by name |
| recipes &lt;itemName&gt; | query | Read ALL catalog crafting recipes for ONE exact item name; per-execution ingredients, yields, returns and table requirements; no plan selection or global resource availability claims |

## 朝向、移动与动作控制 / Motion and control (11)

Angles in radians; movement duration in milliseconds; wait uses physics ticks. stop is immediate; stand is queued.

| Command | Kind | Description |
| --- | --- | --- |
| look &lt;yaw&gt; &lt;pitch&gt; | action | Set yaw and pitch in radians; yaw 0 faces -Z, pitch -PI/2..PI/2 (positive looks up) |
| lookat &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | Look at a position |
| move &lt;forward&#124;back&#124;left&#124;right&#124;sprint&#124;sneak&gt; [durationMs] | action | Hold one movement control for 1..30000 milliseconds, then release it; sprint/sneak alone do not move |
| jump | action | Hold jump for 200ms, then release; requires support/headroom and does not wait for landing |
| swing [hand] | action | Play arm swing animation |
| stand | action | Stop all movement controls |
| stop | action | Stop pathfinding |
| stopdig | action | Stop digging the current block |
| goto &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | Pathfind to coordinates |
| follow &lt;playerName&gt; | action | Follow a player continuously |
| wait &lt;ticks&gt; | action | Wait for a number of game ticks |

## 采集、合成与建造 / Gathering and building (6)

Action success does not imply dropped items were collected.

| Command | Kind | Description |
| --- | --- | --- |
| dig | action | Dig the block in sight |
| mine &lt;x&gt; &lt;y&gt; &lt;z&gt; | action | Approach and dig a solid block at integer coordinates; rechecks target; does not guarantee drop pickup |
| collect | action | Approach nearest loaded item drop without digging or scaffolding; succeeds only on own confirmed pickup and inventory gain |
| craft &lt;itemName&gt; [times] [auto&#124;hand&#124;table] [recipeIndex] | action | Craft from backpack and reachable table; times=executions 1..64, not items; optional recipeIndex selects an exact catalog entry without fallback; one executable recipe runs, multiple return availableRecipes; reports observed net inventory changes |
| place | action | Place held block at the aimed hit point; confirms state and item consumption, both halves for doors/beds; returns actual positions and block properties |
| placeentity | action | Use held boat/raft, spawn egg, armor stand or end crystal at current aim; confirms a new matching spawn and item consumption; failure reports observed effects |

## 背包、持物与消耗 / Inventory and items (7)

Check available items and slots before acting.

| Command | Kind | Description |
| --- | --- | --- |
| equip &lt;item name&gt; | action | Equip an item from inventory |
| hotbar &lt;slot&gt; | action | Select a quick bar slot (0-8) |
| unequip [slot] | action | Unequip an item from a slot |
| use | action | Use/activate the currently held item |
| release | action | Deactivate the held item (release bow, stop eating, etc.) |
| drop &lt;itemName&gt; [count] | action | Drop items from inventory |
| toss &lt;itemName&gt; [count] | action | Toss/drop items from inventory |

## 容器与槽位 / Containers and slots (8)

Use current window slot indices, not fixed player-inventory indices.

| Command | Kind | Description |
| --- | --- | --- |
| open | action | Open the container/entity in sight |
| openentity | action | Open an entity with an inventory in sight |
| dispenser | action | Open the dispenser or dropper block in sight |
| click &lt;slot&gt; [button] | action | Click a slot in the current window |
| moveslot &lt;sourceSlot&gt; &lt;destSlot&gt; | action | Move an item from source slot to destination slot |
| putaway &lt;slot&gt; | action | Put an item from a slot into empty inventory space |
| transfer &lt;itemName&gt; [count] | action | Deposit items from inventory into the open container |
| close | action | Close the currently open container/window |

## 工作站与交易 / Workstations and trading (5)

Inspect the open window before choosing an operation.

| Command | Kind | Description |
| --- | --- | --- |
| furnace [open&#124;input &lt;slot&gt; [count]&#124;fuel &lt;slot&gt; [count]&#124;take &lt;input&#124;fuel&#124;output&gt;] | action | Open and operate a furnace, smoker or blast furnace |
| anvil [open&#124;rename &lt;slot&gt; &lt;name&gt;&#124;combine &lt;slot1&gt; &lt;slot2&gt; [name]] | action | Open, rename or combine items in an anvil |
| enchant [open&#124;put &lt;slot&gt;&#124;lapis &lt;slot&gt;&#124;choose &lt;0..2&gt;&#124;take] | action | Open and operate an enchantment table |
| station open &lt;type&gt;&#124;move &lt;source&gt; &lt;dest&gt; [count]&#124;take &lt;slot&gt;&#124;select &lt;index&gt;&#124;crafter &lt;slot&gt; &lt;enabled&#124;disabled&gt;&#124;beacon &lt;primary&gt; [secondary&#124;none] | action | Operate brewing, loom, stonecutter, smithing, grindstone, cartography, beacon or crafter windows |
| trade &lt;index&gt; [times] | action | Trade with an opened villager |

## 生存与实体交互 / Survival and entities (9)

Actions may change health, inventory or entity state.

| Command | Kind | Description |
| --- | --- | --- |
| attack | action | Attack the nearest entity |
| interact | action | Interact with the block or entity in sight |
| interactat &lt;entityName&gt; | action | Interact with a matching entity at its position |
| useon &lt;entityName&gt; | action | Use the held item on a matching entity |
| eat | action | Eat the currently held food item |
| fish | action | Go fishing with a fishing rod |
| sleep | action | Find and sleep in a nearby bed |
| wake | action | Get out of bed |
| respawn | action | Manually respawn after death |

## 载具与飞行 / Vehicles and gliding (4)

Requires the appropriate vehicle or equipment.

| Command | Kind | Description |
| --- | --- | --- |
| mount | action | Mount the nearest rideable entity |
| dismount | action | Dismount from current vehicle |
| drive &lt;left&#124;right&gt; &lt;forward&#124;back&gt; | action | Control a vehicle (mount first) |
| elytra | action | Start elytra flight |

## 通信与客户端管理 / Communication and client management (7)

May send chat, change settings or disconnect.

| Command | Kind | Description |
| --- | --- | --- |
| say &lt;message&gt; | action | Send a chat message |
| whisper &lt;player&gt; &lt;message&gt; | action | Send a whisper to a player |
| writebook &lt;slot&gt; &lt;page1&gt;&#124;&lt;page2&gt;&#124;... | action | Write text into a book |
| settings &lt;key&gt; &lt;value&gt; | action | Change client settings |
| quit [reason] | action | Disconnect from the server |
| acceptpack | action | Accept server resource pack |
| denypack | action | Deny server resource pack |

## 创造与特权工具 / Creative and privileged tools (7)

Requires appropriate permission or mode. Brain excludes commands with kind=creative by default; category is not authorization.

| Command | Kind | Description |
| --- | --- | --- |
| setcommandblock &lt;x&gt; &lt;y&gt; &lt;z&gt; &lt;command&gt; | action | Set a command block at coordinates |
| clearinventory | creative | [Creative] Clear all inventory slots |
| clearslot &lt;slot&gt; | creative | [Creative] Clear a specific inventory slot |
| flyto &lt;x&gt; &lt;y&gt; &lt;z&gt; | creative | [Creative] Fly in a straight line to coordinates |
| setinventory &lt;slot&gt; [itemName] [count] [metadata] | creative | [Creative] Set or clear an inventory slot |
| startfly | creative | [Creative] Start flying (zero gravity) |
| stopfly | creative | [Creative] Stop flying and restore gravity |

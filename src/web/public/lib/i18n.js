// Minimal zh/en text layer for the debug panel.
//
// English stays the source of truth in the markup: templates are untouched, so
// the string-level tests keep asserting the same literals. This module swaps
// *known* labels at run time, which keeps the diff small on a codebase without
// a build step or a UI framework.
//
// Rules:
// - only whole, trimmed text nodes are translated (never substrings), so model
//   output, JSON, item names and command feedback are left alone;
// - <pre>/<code>/<textarea>/<script>/<style> are never touched;
// - switching the language reloads the page instead of translating backwards,
//   so there is no reverse dictionary to keep in sync.

export const LANGS = Object.freeze(['en', 'zh'])
const STORAGE_KEY = 'stevex.lang'

// English label -> 中文。Keys must appear verbatim in src/web/public.
export const LABELS = Object.freeze({
  // shell / navigation
  'Overview': '总览',
  'Agents': '智能体',
  'World': '世界',
  'Tasks': '任务',
  'Capsules': '能力胶囊',
  'Evolution': '进化',
  'Configs': '配置',
  'Logs': '日志',
  'steveX Debug Console': 'steveX 调试控制台',
  'Agent management': '智能体管理',
  'Reload Config': '重载配置',
  'Search agents...': '搜索智能体…',
  'All Status': '全部状态',
  'Online': '在线',
  'Offline': '离线',
  'Sort by: Name': '排序：名称',
  'Sort by: Status': '排序：状态',
  'Sort by: Health': '排序：生命值',
  'New Agent': '新建智能体',
  'Coming soon': '即将上线',
  'Not found': '未找到',
  'Page not found': '页面不存在',
  'Agent debug': '智能体调试',

  // agent card
  'Connect': '连接',
  'Disconnect': '断开',
  'Stop': '停止',
  'Debug': '调试',
  'Agent log': '智能体日志',
  'Health': '生命值',
  'Game Mode': '游戏模式',
  'Position': '坐标',
  'Current Action': '当前动作',
  'Task': '任务',
  'Action': '动作',
  'None': '无',
  'online': '在线',
  'offline': '离线',

  // command + planner panel
  'Command': '命令',
  'Enter command...': '输入命令…',
  'Send': '发送',
  'LLM Planner': 'LLM 规划器',
  'Enter task...': '输入任务…',
  'Cancel': '取消',
  'Follow-up': '追加消息',
  'New task': '新任务',
  'One step': '单步',
  'Continuous': '连续',
  'Call limit': '调用上限',
  'Time limit (s)': '时限（秒）',
  'Continue': '继续',
  'Pause': '暂停',
  'Completed (manual)': '已完成（手动）',
  'Blocked': '受阻',
  'Waiting for user': '等待用户',
  'Set status': '设置状态',
  'No active task': '当前没有任务',
  'Task details': '任务详情',
  'Waiting for planner...': '等待规划器…',
  'Follow-up queued for next step': '已追加，将在下一步处理',
  'Task start accepted': '任务已接受',
  'Task cancelled': '任务已取消',
  'Connection request failed': '连接请求失败',

  // inventory
  'Inventory': '背包',
  'Read only': '只读',
  'Equipment / Offhand': '装备 / 副手',
  'Last known': '上次已知',
  'Player slots': '玩家槽位',
  'Current Container': '当前容器',
  'Window slots': '窗口槽位',
  'No container open': '未打开容器',
  'Cursor': '光标物品',
  'Agent offline': '智能体离线',

  // world page
  'World map disabled': '世界地图未启用',
  'Human view': '人工视图',
  'Open map': '打开地图',
  'No agent selected': '未选择智能体',
  'Deselect': '取消选择',

  // freshness / log modal
  'Not checked yet': '尚未检查',
  'No log entries yet.': '暂无日志。',
  'No agents match the current filters.': '没有匹配当前筛选的智能体。',

  // inspector
  'View': '视野',
  'Context': '上下文',
  'API Calls': 'API 调用',
  'LLM Input / Output': '模型输入 / 输出',
  'Perspective': '视角',
  'First person': '第一人称',
  'Third person (back)': '第三人称（背面）',
  'Third person (front)': '第三人称（正面）',
  'Capture': '采集',
  'Loading renderer status...': '正在读取渲染端状态…',
  'No snapshot': '暂无快照',
  'No context snapshots requested.': '尚未请求上下文快照。',
  'No API records requested.': '尚未请求 API 记录。',
  'No model requests yet.': '暂无模型请求。',
  'No model requests in this session.': '本次会话没有模型请求。',
  'Ready': '就绪',
  'Shared renderer disabled': '共享渲染未启用',
  'Fabric renderer disconnected': 'Fabric 渲染端未连接',
  'Capturing...': '采集中…',

  // configs page
  'Environment Config': '环境配置',
  'Edit and reload the active environment settings.': '编辑并重新加载当前环境配置。',
  'Ready.': '就绪。',
  'Load': '加载',
  'Format': '格式化',
  'Copy': '复制',
  'Save': '保存',
  'Save & Reload': '保存并重载',
  'Loading...': '加载中…',
  'Loaded successfully.': '加载成功。',
  'Saving...': '保存中…',
  'Saved successfully.': '保存成功。',
  'Saved and reloaded successfully.': '保存并重载成功。',
  'Reloading...': '重载中…'
})

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE', 'TEXTAREA', 'INPUT', 'OPTION_RAW'])
let lang = 'en'

export function getLang() {
  return lang
}

/** Pure lookup, exported for tests: translate('Health', 'zh') === '生命值'. */
export function translate(text, locale = lang) {
  if (typeof text !== 'string') return text
  if (locale !== 'zh') return text
  const trimmed = text.trim()
  if (!trimmed) return text
  const hit = LABELS[trimmed]
  if (!hit) return text
  return text.replace(trimmed, hit)
}

export function initLang() {
  let stored = null
  try {
    stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch { /* private mode */ }
  const preferred = LANGS.includes(stored) ? stored
    : typeof navigator === 'object' && /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
  lang = preferred
  if (typeof document !== 'undefined') {
    document.documentElement?.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en')
    document.title = translate(document.title)
  }
  return lang
}

/** Persist and reload: the English markup is regenerated, so no reverse map is needed. */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return false
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next)
  } catch { /* ignore */ }
  if (typeof location !== 'undefined' && typeof location.reload === 'function') {
    lang = next
    location.reload()
    return true
  }
  lang = next
  if (typeof document !== 'undefined') translateTree(document.body)
  return true
}

function translateNode(node) {
  if (!node || node.nodeType !== 3) return
  const parent = node.parentNode
  if (parent && SKIP_TAGS.has(parent.nodeName)) return
  const next = translate(node.nodeValue)
  if (next !== node.nodeValue) {
    node.nodeValue = next
    if (parent?.dataset) parent.dataset.translated = ''
  }
}

function translateAttributes(root) {
  if (typeof root.querySelectorAll !== 'function') return
  for (const element of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const next = translate(value)
      if (next !== value) element.setAttribute(attribute, next)
    }
  }
}

/** Translate every known label under `root` (idempotent when already translated). */
export function translateTree(root = typeof document === 'undefined' ? null : document.body) {
  if (!root || lang !== 'zh') return 0
  let changed = 0
  if (typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return changed
  const walker = document.createTreeWalker(root, globalThis.NodeFilter?.SHOW_TEXT ?? 4)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    const before = node.nodeValue
    translateNode(node)
    if (node.nodeValue !== before) changed++
  }
  translateAttributes(root)
  return changed
}

/** Re-translate nodes that a live render replaced (WebSocket refresh, page switch, …). */
export function observeTranslations(root = typeof document === 'undefined' ? null : document.body) {
  if (!root || lang !== 'zh' || typeof MutationObserver === 'undefined') return () => {}
  let scheduled = false
  const run = () => {
    scheduled = false
    translateTree(root)
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(run)
  })
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}

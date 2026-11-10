// 命令行开关登记表。tools/ 与 world/design（含子目录）下任何脚本里出现的每个 --xxx 形态字样（含注释、拼接写法），都必须在这里归类，
// 没登记的一律让日常检查（tests/readonly-entries.test.mjs）失败。
//   ro      只读开关（校验 / 检查 / 列出 / 演练）。脚本里出现 ro 开关，tools/readonly-entries.mjs 的 READONLY_ENTRIES 必须有一条带该开关的入口；
//           全量检查（tests/readonly-entries-run-*.test.mjs）在仓库临时副本上实跑这些入口，逐字节比对。
//   write   会写盘的开关；note 写明写哪些文件。不实跑。
//   opt     修饰参数（路径、数量、过滤、输出格式、预算），自身不决定读写，随它所在命令走。
//   nonflag 不是本脚本的开关：传给子进程 / node / git 的参数、SVG 与样式名里的 --xxx。
// 同名开关在不同脚本里意义不同时，在 FILE_FLAG_OVERRIDES 里按“脚本 开关”单独归类。
const W = {
  '--publish': '写 world/ 正式数据（meta、rules 等）与发布回执，各脚本不同',
  '--review': '写 world/drafts/<批>/ 下审阅记录、L2 账与 summary（联网调模型）',
  '--l4': '写 L4 人读记录到 world/drafts/<批>/（matprops 另补写 approval-summary.json）',
  '--prepare': '写 world/drafts/<批>/ 的批次预备文件（batch / manifest / bones）',
  '--candidate': '写 world/drafts/<批>/candidate.json',
  '--sample': '写 L4 抽样文件：matprops-approval 写其审阅目录下的 l4-selection 文件；w5-rumors 写 world/drafts/w5/<批>/l4-selection.json',
  '--write': '写生成结果：kc-processing 写 world/meta/recipes.json、items.json；m2-people-publish、r10a-review 写各自发布数据',
  '--write-baseline': '写 tests/metrics/*.baseline.json 基线',
  '--write-summary': '写审阅目录下的 approval-summary.json',
  '--retry-manual': '重审人工项，写 world/drafts/<批>/ 审阅记录',
  '--review-manual': '重审人工项，写 world/drafts/<批>/ 审阅记录',
  '--retry-garlic': '重试条目，写 matprops 审阅目录',
  '--retry-failed': '重试失败项，写其 smoke 报告目录',
  '--redo': '重做条目，写 matprops 审阅目录',
  '--rejudge': '重评，写 matprops 审阅目录（带 --dry-run 时不写，已登记实跑）',
  '--backfill-snapshots': '补写 matprops 审阅快照（带 --dry-run 时不写，已登记实跑）',
  '--pilot': '试审，写 world/drafts/ 审阅目录',
  '--draft': '起草，写 world/drafts/<批>/',
  '--accept-fact-corrections': '改写 world/drafts/w3/wave-score.json',
  '--reopen-authorization': '写 npc-depth 批目录的授权记录',
  '--reopen-continue': '写 npc-depth 批目录',
  '--recover-protocol': '写 npc-depth 批目录',
  '--reuse-frozen-drafts': '写 npc-depth 批目录',
  '--restore-location': '写 world/ 地点数据（publish-t142-provinces）',
  '--restore-reviewed-routines': '写 world/ 日常数据（publish-npc-depth）',
  '--repair': '写 w3 审阅修复结果',
  '--refresh-goals': '写 world/ 人物目标数据（m2-people-repair）',
  '--review-only': '写 w4-repair 审阅记录',
  '--traits-only': '写 m2-people-publish 的人物特质数据',
  '--init': '创建 m3-soak 隔离报告目录与 run.json',
  '--activate': '写部署目录（deploy-engine 激活）',
  '--force': '覆盖已核验的 world/drafts/yaoguai/index.json（yaoguai-index）',
  '--append': '追加写 time-tests 的 TSV 输出',
  '--out': '写指定的输出文件',
  '--output': '写指定的输出文件',
  '--final': '写 dist/（build-world）',
  '--release': '写 dist/（build-world）',
  '--engine': '写 dist/（build-world）',
  '--expansion': '起草，写 world/drafts/（draft-wildlife）',
  '--run': '实跑并写报告 / 运行目录（m3-soak、probe-score）',
  '--resume': '续跑，写 playtests 运行目录',
  '--report': '写 m3-soak 报告',
  '--ledger': '写模型预算账文件',
  '--live': '联网实跑并写预算账（population-live-check）',
};
const N = {
  '--accent': 'system-map 的样式名', '--bg': 'system-map 的样式名', '--dim': 'system-map 的样式名', '--hi': 'system-map 的样式名', '--ink': 'system-map 的样式名',
  '--line': 'system-map 的样式名', '--lc': 'system-map 的样式名', '--muted': 'system-map 的样式名', '--panel': 'system-map 的样式名', '--soft': 'system-map 的样式名',
  '--k-': 'system-map 的样式名前缀', '--k-advance': 'system-map 的样式名', '--k-call': 'system-map 的样式名', '--k-data': 'system-map 的样式名', '--k-effect': 'system-map 的样式名',
  '--k-event': 'system-map 的样式名', '--k-record': 'system-map 的样式名', '--k-tool': 'system-map 的样式名',
  '--l-': 'system-map 的样式名前缀', '--l-base': 'system-map 的样式名', '--l-data': 'system-map 的样式名', '--l-kernel': 'system-map 的样式名', '--l-narr': 'system-map 的样式名',
  '--l-sim': 'system-map 的样式名', '--l-ui': 'system-map 的样式名',
  '--test': '传给 node 的参数', '--test-isolation': '传给 node 的参数', '--test-reporter': '传给 node 的参数', '--import': '传给 node 的参数',
  '--cpu-prof': '传给 node 的参数', '--cpu-prof-dir': '传给 node 的参数',
  '--git-common-dir': '传给 git 的参数', '--exclude-standard': '传给 git 的参数', '--name-only': '传给 git 的参数', '--no-renames': '传给 git 的参数', '--others': '传给 git 的参数',
};
const OPT = ['--actions-only', '--authored-background', '--authorization-hash', '--batch', '--batch-manifest', '--batches', '--budget', '--budget-proof', '--budget-root', '--budget-yuan', '--card', '--catalog',
  '--combat', '--compact-request', '--concurrency', '--config', '--contact-routine-only', '--controlled-revision', '--corpus', '--count', '--counties', '--days', '--deps', '--depth', '--design', '--diagnostics',
  '--dir', '--directory', '--facility-source-only', '--fast', '--file', '--files', '--help', '--host-installation', '--id', '--ids', '--increment', '--input', '--jobs', '--json', '--l4-notes', '--lamp',
  '--legacy-report', '--legacy-reserved', '--limit-minutes', '--manifest', '--manifest-hash', '--max-tasks', '--messages', '--milestone', '--months', '--no-month', '--no-remote', '--notes', '--only', '--only-month',
  '--origin', '--pack', '--parallel', '--per-file', '--quick', '--remote-only', '--repeat', '--retest-only', '--review-seq', '--root', '--run-dir', '--run-id', '--seed', '--seeds', '--shard', '--shards', '--skip',
  '--smoke', '--source-checkout-evidence', '--source-evidence', '--source-evidence-map', '--src', '--state', '--tier', '--timeout', '--turns', '--village', '--why', '--world', '--years'];
export const RO_FLAGS = ['--verify', '--check', '--l1', '--list', '--summary', '--dry-run', '--dry-publish', '--show'];

export const FLAGS = {
  ...Object.fromEntries(RO_FLAGS.map(f => [f, {kind: 'ro'}])),
  ...Object.fromEntries(Object.entries(W).map(([f, note]) => [f, {kind: 'write', note}])),
  ...Object.fromEntries(OPT.map(f => [f, {kind: 'opt'}])),
  ...Object.fromEntries(Object.entries(N).map(([f, note]) => [f, {kind: 'nonflag', note}])),
};

export const FILE_FLAG_OVERRIDES = {
  'tools/rg-mutate.mjs --check': {kind: 'nonflag', note: '传给 node 的语法检查参数（node --check 变异后的文件），脚本本身没有这个开关'},
  'tools/s0-metrics.mjs --check': {kind: 'nonflag', note: '传给子脚本 export-actions 的参数；该子脚本的 --check 已登记实跑'},
};

// 扫描用：脚本源码里出现的所有 --xxx 形态字样（前面不是字母数字、下划线或连字符）。
export const FLAG_PATTERN = /(?<![A-Za-z0-9_-])--[a-z][a-z0-9-]+/g;

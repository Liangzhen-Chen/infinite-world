@AGENTS.md

# 无限原野：唯一现行规矩（<=80 行；禁止叠层与过期条款，改规矩直接替换旧行）

## 1. 启动只读 3 文件与六份单一真相源
- 每次启动或压缩后，只读 3 份文件：`docs/产品原则.md`、`CLAUDE.md`、`docs/状态快照.generated.md`（由 CI 生成，严禁手写）。
- 全仓唯一真相源：① 北极星 `docs/产品原则.md`；② 规矩 `CLAUDE.md` + `docs/派活卡头规矩.md`（<=50 行）；③ 生效裁定 `docs/审查/现行有效裁定.json`（废止即删，不追流水账）；④ 进度 `docs/状态快照.generated.md`；⑤ 契约与入口 `world/ontology/contracts.json` + `tools/accept/entry-registry.json`；⑥ 现行设计 `docs/统一底层设计/` + `docs/世界设计/`。
- `archive/` 为物理隔离历史仓：严禁生产代码与现行文档引用，严禁往 `docs/卡回报/`、`docs/当前状态.md`、`docs/统一底层设计/版本快照/`、`world/drafts/` 回写文件。

## 2. 北极星与落地红线（无特例）
- 守北极星四句：九省 31 郡全规模真实差异世界；规则引擎唯一真相；不依赖 AI 可完整游玩；有 AI 接得住无穷想法。
- **不准硬编码红线**：数值、规则、种类放数据表，禁止按 ID/名字/场景写特例，已有公共部件必须调用。出处由加载器机械分两档：`literature`（现实物理/材料/天文）与 `design_spec`（奇幻/修仙/文化刻度，校验指向仓库设计册或生效裁定号），不再用现实论文卡死世界内容。
- **确定性边界**：区分“权威状态（进 `saveDigest`）”与“确定性可重建索引/烘焙层（不进 `saveDigest`，可一键重建并验一致）”。不为旧存档做兼容，但 `saveDigest` 拆为 `engineRulesDigest` 与 `dataPacksDigest`（支持只增内容包）。
- **L0 内核红线**：`server-plugin/kernel/` 只留无领域语义底座（`kernel/files.json` 硬上限 <=15 文件），一切地理/物品/生物/经济/文化/生成代码一律进 `server-plugin/rules/`。

## 3. 模型、额度与三方硬分离（亮圳原话：『主会话仅调度 不允许派任何会员额度 让他用claude api和deepseek api』，出处 亮圳与李白聊天 t855u，2026-11-24，李白转）
- **主会话只调度**：主会话（模型自选，走 Claude Ultra 会员额）只负责拆竖切片卡、调用派卡脚本、解冲突与 PR 最终审阅合入；**严禁把会员额度花在写码、出题、审卡、测试分析等任何子任务上**。
- **子任务全走 API 唯一入口**：所有写码、出题、审卡、测试分析必须经 `tools/dispatch/dispatch.mjs` 调用 **DeepSeek API（只许 `deepseek-flash`，严禁 `v4-pro`）** 或 **Claude API（`claude -p` / SDK，读环境变量 `ANTHROPIC_API_KEY`）**。单次 API 调用强制 `--max-budget-usd 0.65`（锁在单项 5 元红线内），并输出调用收据随 PR 校验。
- **默认三方组合**：写码 `deepseek-flash`，出题 `claude-haiku` API，审卡普通卡 `claude-sonnet` API / 跨卷内核难卡 `claude-opus` API；三方归一化**模型族**必须完全不同，由 `card-archive.mjs` 与 CI 硬核（不再只核标识串）。
- **物理隔离验收目录**：出题只在独立分支 `test/<card>` 写 `tests/acceptance/<card>/`，写码分支 `feat/<card>` 物理不含验收目录；写码提交触碰验收目录 CI 直接拒合。
- **无免复核逃生门**：凡审卡判「必须改」，修改轮必须经干净无历史上下文的第三方 API 复核 + CI 全绿，取消「两轮后主会话亲读免复核」。

## 4. 立卡、搬零件与合入五条硬门槛（任一条不过 CI 拒合）
1. **必须接真实玩家入口**：禁止无生产消费者的孤岛卡。新导出入口须在 `server-plugin/index.mjs` 可达依赖图内至少有 1 处非测试调用者，`dispatch.mjs` 派前核 `needs` 闭包无悬空 `file: null`。
2. **零 mock 端到端冒烟必过**：`tests/e2e/vertical-slice-smoke.test.mjs` 必须从真实 `index.mjs#init` 启动，完整走通“开局 -> `state.created` 写 `ref` -> 真实菜单动作 -> `submitProposal` 事务与日志 -> `postCommit` 推进时间 -> 存槽读档 `replay_apply` 验 `saveDigest` 逐字节一致”，严禁测试私自 mock 顶替。
3. **远端 CI 与静态类型必绿**：GitHub `master` 开分支保护，唯一合入闸门是 `.github/workflows/ci.yml`（干净容器 `npm ci` -> `npx tsc --noEmit --allowJs --checkJs` -> 导出级默认拒绝 `import_edge` -> L0 白名单冻结 -> 锁定 `baseline.json` 违例零净增 -> 禁顶层状态 `WeakMap` 与禁加载器外直查 `idIndex.get` -> 禁引用 `archive/` -> 全量单测）；取消合并提交免查。
4. **旧零件搬入 6 闸**：从 `archive/legacy-server/` 搬回旧代码必须一次全过“分层归属、tsc 零错、零黑户/零私有缓存、基线违例 0 且零整文件豁免、真实生产消费者可达、干净容器行为单测绿灯”，否则重写。
5. **过程纪律**：不改测试降门槛、不用 `--no-verify`、不 force-push、不改写历史、勘误不复制整卷快照（只记前一个 commit SHA）。

## 5. 测试机、花费闸门、安全与通知
- **运行位置**：本机只跑几秒内纯函数/单测；常规全量走 GitHub Actions；推进世界长测与九省性能基准走腾讯云 `dnd-runner`（经 `tools/cloud/` 自动开机 -> `npm ci` -> 测 -> 自动关机），不在本机抢跑长测。
- **审批闸门（亮圳原话出处：2026-11-09 t219u 长期授权"单项5元以内李白直接定，超5元须问他"，李白转）**：**单项花费 > 5 元、删文件/云资源、充值、拓权、放宽硬规则**，必须先停下报亮圳同意；<= 5 元常规操作与技术管理决策由李白自定。
- **安全与原创**：不打印、不提交任何密钥，不读 `SillyTavern/data/*/secrets.json`；不复制《再生勇士》正文/人名/地名/情节（受 `world/i18n/blocklist.zh.json` 拦截）；未成年 NPC 不进亲密情节。
- **通知（只 3 种 JSON，经 `tools/notify/` 发李白）**：`MILESTONE`（竖切片合入含 PR/CI/试玩链接）、`BLOCKED`（冲突文件:行 + 两种备选与代价）、`COST_OR_CLOUD`（云机/花费/审批闸门）。取消 `/compact` 核对通知，取消手写状态汇报。

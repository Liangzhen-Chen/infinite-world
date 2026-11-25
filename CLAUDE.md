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

## 3. 模型、额度与三方硬分离（亮圳原话：『能不能日常用sonnet。我有claude ultra，额度够用，deepseek会额外花钱』『没问题，并且现在就改，要告诉主会话靠额度派活，额度不够就ds主力。』，出处 亮圳 2026-11-25 18:19 伦敦 antigravity 会话原话，李白核 msg_210a029f02f4；方案 docs/gemini/collab-eval-1125.md）
- **主会话**：只调度不写码；按完整可验证结果拆卡（约 150–800 行、3–10 个同域文件，不拆碎卡）、派卡、解冲突、PR 审阅合入。
- **靠实时额度派活（每次派卡前选档，选档依据写进派卡.md）**：① 常态档（Claude Ultra 会员额度充足）：Sonnet 写、Haiku 出题、Opus（medium）审，均为 Orca 可见独立工作树会话；关键或跨卷卡在 Gemini 额度宽裕时每天可分 1–2 张给 Gemini 审；Sonnet 写卡时可把规格写死的成批机械部分转给 DeepSeek（15:48 原话保留条款）。② 降级档（会员额度不足、告急或未重置）：DeepSeek（只许 `deepseek-flash`，严禁 `v4-pro`）经 `tools/dispatch/dispatch.mjs` 在 Orca 可见终端作写码主力，Haiku 出题，DeepSeek 写的卡由 Sonnet（或 Gemini）审，Sonnet 写的卡由 Gemini 或 Opus 审。Gemini 每天一次全库独立审核优先，不因单卡审卡透支。
- **API 调用**：走 Claude API 时读 `ANTHROPIC_API_KEY`（缺时读 `CLAUDE_API_KEY`），单次强制 `--max-budget-usd 0.65`；DeepSeek 不加（Claude Code 对其估价失真），花费按控制台记账；API 卡留 `dispatch.mjs` 收据，Orca 会员会话卡在 state.json 记工作树、会话与提交号作等效凭证。
- **三方模型族**：写码、出题、审卡归一化模型族必须完全不同，由 `card-archive.mjs` 与 CI 硬核。
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
- **审批闸门**：**删文件/云资源、充值、拓权、放宽硬规则**须先停下报亮圳同意；花费不设单项停线，按省钱原则做并记账（亮圳原话：『我同意。第二个也没问题。』并说从没定过「单项超5元必须问他」，出处 李白转述 2026-11-25 12:31，msg_81259953138a）；常规操作与技术管理决策由李白自定。
- **安全与原创**：不打印、不提交任何密钥，不读 `SillyTavern/data/*/secrets.json`；不复制《再生勇士》正文/人名/地名/情节（受 `world/i18n/blocklist.zh.json` 拦截）；未成年 NPC 不进亲密情节。
- **通知（只 3 种 JSON，经 `tools/notify/` 发李白）**：`MILESTONE`（竖切片合入含 PR/CI/试玩链接）、`BLOCKED`（冲突文件:行 + 两种备选与代价）、`COST_OR_CLOUD`（云机/花费/审批闸门）。取消 `/compact` 核对通知，取消手写状态汇报。

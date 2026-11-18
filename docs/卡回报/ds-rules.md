# 卡回报 ds-rules（统一规矩＋清理工作区）

## 交卷前自查（卡头第三节八项）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡是文档规矩统一，不引设计卷文；改动前原句逐条用 `sed -n` 核出并列在下方"改动前后原句"，出处到"文件:行"。 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只改规则文档正文与进度/排期文档，无代码、无按 id/文件名/卷名的分支。`git diff` 无 `.mjs`、无 `world/`、无卷文。 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不新增限额或校验，也不动门禁实现；无"不限/0/空"旁路可试。 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未新增测试；验收只跑卡文命令。 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码改动、无常量；`git diff --name-only` 只有文档。 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 只改 `AGENTS.md`、`docs/当前状态.md`、`docs/PLAN.md`、`docs/归档/PLAN-历史-至1118.md`、`docs/产品原则.md`、`docs/无限原野_开发指南v3.md`、`docs/交接-1117.md`、本回报；未动 CLAUDE.md、代码、卷文。正文改动 10+37+23+8+2+4+54＝138 行，另历史整文件平移 3508 行（`git mv` 内容未改写）。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 480`、`ℹ pass 480`、`ℹ fail 0`；`node tools/accept/commit-hook.mjs` → `pre_commit pass 6551a96f64665914461c11996931992ac734422091bf315800833d85851b8c7b`。 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 规矩只留 CLAUDE.md 一处，子代理不再照过期/打架的旧条款（C 盘路径、合并后只跑固定测试、周额度 80% 停手、Opus 只核旧档）做事，块 6 的卡能按同一套规矩推进；未写死、未加特例、未跳过规则引擎、未缩小世界规模。 |

## 改动前后原句（先 `sed -n` 核原句）

1. `AGENTS.md:3`
   - 改前：`开工只读本文件、docs/产品原则.md（北极星）、docs/派活卡头规矩.md、docs/当前状态.md、docs/PLAN.md 和 docs/PROGRESS.md 的当前相关段。`
   - 改后：`开工必读（按序）：docs/产品原则.md（北极星）→ docs/派活卡头规矩.md → CLAUDE.md → docs/当前状态.md → docs/PLAN.md 末节。`
2. `AGENTS.md:7`
   - 改前：`所有会话应用 C:/Users/RobertC/.agents/skills/stop-that-shit/SKILL.md。`
   - 改后：`所有会话应用 Stop That Shit 开发规则。`
3. `AGENTS.md:13`
   - 改前：`…只因新变化、失败或尚未解决的具体疑点追加检查。Skill 本身不要求额外检查清单、证明文件、审核会话或最终审计循环；用户明确要求的阶段审核照常执行。`
   - 改后：`…只因新变化、失败或尚未解决的具体疑点追加检查。`
4. `AGENTS.md:62`、`:64`（整段删）
   - 改前 :62：`原"compact 后向 Claude 校准"的流程已取消：…主会话 compact 后只重读 docs/当前状态.md、docs/PLAN.md 开头与当前卡、docs/PROGRESS.md 相关段，然后继续。`
   - 改前 :64：`验收以卡片写明的命令和 CORE 为准，各跑一次。执行会话已跑通并在摘要中报告的验收，主会话合并前不重跑，合并后只跑 CORE；…不为同一未变化的结果追加审核会话、复测或证明文件。`
   - 改后：无（分工与只核只留 `AGENTS.md:60` 一句指向 CLAUDE.md）。
5. `docs/产品原则.md:29`
   - 改前：`6. **成本自觉。** 默认 Sonnet，Opus 先告知；周额度到 80% 停手；真实模型调用如实记账。`
   - 改后：`6. **三层分工。** Opus 5.5 中档 / Sonnet 5.5 中档 / DeepSeek（deepseek-flash）；默认 Sonnet 统筹、DeepSeek 写代码，内核、加载器、跨卷、改裁定、同一处错两次的交 Opus；真实模型调用如实记账。`
6. `docs/无限原野_开发指南v3.md:46`、`:121`
   - 改前 :46：`## C. 工作方法`
   - 改后 :46：`## C. 工作方法（作废：亮圳 11-18 17:48，以 CLAUDE.md 为准；正文仅留历史）`
   - 改前 :121：`- 真实模型（DeepSeek）累计授权 ≤100 元，单次 >10 元先报；如实记账。`
   - 改后 :121：`- 真实模型（DeepSeek）累计授权 ≤100 元，单次 >10 元先报；如实记账。（作废：亮圳 11-18 17:48，以 CLAUDE.md 为准）`
7. `docs/交接-1117.md:92`、`:111`
   - 改前 :92（整条删）：`- **分工**：Sonnet 中档改；跨 3 卷以上、内核或加载器、Sonnet 同项错两次的，用 Opus 5.5 中档改。另一个 Opus 5.5 中档只核，偏离就打回。不用 Fable。派子代理时显式写 model 与 effort。`
   - 改前 :111–:115（整条删，含 C 盘钩子与 pause.json 说明）：`2. **F:/dnd-tools/goal/stop_guard.py**，配置在 C:/Users/RobertC/Documents/dnd/.claude/settings.local.json 的 Stop 钩子…`
   - 改后：原第 3 条上移为第 2 条，内容不变。
8. `docs/PLAN.md`
   - 改前：3508 行流水台账（含模型、花费、裁定历史）。
   - 改后：`git mv` 原文件到 `docs/归档/PLAN-历史-至1118.md`（3508 行未改写）；新 `docs/PLAN.md` 23 行，只有块 1–7 排期（卡号、状态、依赖、出处卷:行）与当前在做的卡。
9. `docs/当前状态.md`
   - 改前：29 行，含压缩后必读的写稿/只核/通知/花费/额度条款。
   - 改后：23 行，只写进度（已封、未完、下一步次序）。

## 改动与核对

- 文件范围：`git diff --name-only` 与 `git status --short` 所列即全部；`CLAUDE.md`、代码、`world/`、卷文 0 改动。
- 禁止命令自查：本卡只用 git（含 git mv）、ls、wc、grep、sed -n、cat/head/tail、node（只跑验收）；未用 node -e/-p、python -c、heredoc、sed -i、输出重定向写文件、git stash、--no-verify；未 push。
- 验收命令与末行：见自查表第 7 项。

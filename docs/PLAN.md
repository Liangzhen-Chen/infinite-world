# 新骨架排期（阶段 0 → 阶段 1）

旧骨架排期已归档至 archive/docs-status/PLAN-旧骨架-至1124.md。

## 阶段 0：整理工作区与顾问复审（硬门闩）

- 阶段 0A 工作区整理（Step 0–Step 5）：冻结旧队列、打 `pre-rewrite-1124` 标签、落地 `.github/workflows/ci.yml` + `tsc` + 新门禁与 `dispatch.mjs`、建立六份单一真相源、归档旧文件、获亮圳点头后执行 816 MB 删除清单、清出新 `server-plugin/` 骨架空仓与红灯 E2E 烟测桩。验收：第三章 Step 0–Step 5 命令全通过，整理 PR 在 GitHub CI 绿灯。
- 阶段 0A 落地清单（照 Gemini 开工文件 docs/gemini/kickoff-1125.md 第八章 L-01–L-20，origin/antigravity d16c0ecde；做完一步标 [x] 并写一句结果）：
  - [x] L-01 清理分支合入 master：395986f01（快进，补 1 提交把清理记录挪出 docs 顶层），全量 2239/2239。
  - [x] L-02 旧工作树 new-session-8e4637：git 记录已 prune，Orca 已受理移除；空目录仍被 Orca 自身占用，按李白裁定跳过（分支保留）。P5 deepseek 工作树与分支本已不存在。
  - [~] L-03 Orca setup 钩子改 npm ci（李白批 P2）：该设置存于 Orca 应用的仓库设置，CLI 无法修改，需在 Orca 界面改一处（已报李白）；改好前派卡建树一律 `--setup skip` 后手跑 `npm ci`。
  - 拍板记录：P1/P2/P4/P5 李白批（纯技术）；P3 亮圳 11-25 01:59 拍板（11-30 交最小可玩版，5 处卷文按 literature/design_spec 分级）。L-13 写入现行有效裁定。
  - [x] L-06/L-08/L-10 收编 chore/step1-tooling：DeepSeek 写四轮（第二轮照验收题造 write 档、删空卡文防线被打回；第三轮进程挂住由主会话代提交）、Haiku 出题含一轮改题、Opus API 审第一轮必须改 3 条、Sonnet API 第二轮复核可合，合入 master。已定 DeepSeek 不加 --max-budget-usd（估价失真）。遗留：clearDeepseek 补 CLAUDE_CODE_OAUTH_TOKEN（本机未设该变量，随 L-07 卡补）；A12-4.5、S12-2、S12-3 为主线既有非必过项。
  - [ ] P1 工具与 CI：L-04 typescript+typecheck 脚本；L-05 .github/workflows/ci.yml；L-06 dispatch.mjs（收编 chore/step1-tooling）；L-07 派活卡头规矩 ≤50 行、删 card-selfcheck；L-08 archive_ref 检测器；L-09 检测器六项加固；L-10 tools/cloud、tools/notify 收编去写死。
  - [ ] P2 抗失忆：L-11 gen-status-snapshot + 状态快照；L-12 world/ontology/contracts.json。
  - [x] L-13 现行有效裁定.json 写入 K1125-P1～P5 与 K1125-ESC（附原话出处）；Q-14/Q-15（亮圳的留档、门禁规矩）与 B7（世界方向）不由主会话改，附理由/备选/代价报李白，Q-14/Q-15 转亮圳，B7 标「产品拍板」。
  - [x] L-14 docs/卡档案/_template/state.json 模板（照开工文件 5.3 节字段）。
  - [x] P4 main-session/.claude/settings.local.json 禁用 Agent（不入库）。
  - [~] L-11 状态快照脚本：卡 chore/status-snapshot 写 DeepSeek 两轮（第二轮补定接通率向下取整）、出题 Haiku、审 Sonnet 可合，33 条全绿，分支 ds/status-snapshot 已审未合。卡住：出题.md 17 条依据出自 Gemini 开工文件、29 卷无对应行，合并门禁拒推；放宽「照设计原文（卷:行）出题」属亮圳规矩，已报李白转亮圳（推荐允许 docs/gemini 文件行）。已定：生成基准与最近提交两段不受 --check 比对（提交快照本身会改 HEAD），入口接通、门禁基线、在途卡三段受检。
  - [~] L-15/L-16 新骨架空仓：Gemini 裁定 msg_82485b7f7ab7——kernel 只留 6 零件的 14 文件 import 闭包、≤15 不放宽；gate/output-gate/textcore 一并归档，S1-3 随真实入口迁回（依赖文件收各自目录，不回 kernel）；tools/accept 自用旧 kernel 读表辅助收进 tools/accept/lib/。卡 chore/new-skeleton 写码第一轮完成并暂存（工作树 new-skel，352 文件，内核 14 文件，测试全绿），但门禁数据（state-owners、items 必过条目、criteria 指纹）仍指旧文件，pre_commit 报错提交不了——L-17 拆到下一轮是拆卡错误。本轮 DeepSeek 疑超单项 5 元（约 6～7 元），已停报李白，第二轮做法（推荐同卡做完 L-17 再提交）待李白回复。出题 Haiku 题已暂存（ts-new-skel），待写码分支提交后合入再提交。
  - [ ] L-17 baseline/scanclasses/entry-registry 重置（chore/new-skeleton 下一轮）；L-18 E2E 红灯桩（另卡）。
  - 已定（主会话 11-25）：archive_ref 扫描范围排除 tests/acceptance/。理由：验收题职责就是断言旧路径已归位，必须写出归档目录字样；逐文件豁免要写码方知道验收题文件名，破坏三方分离且每卡重复。archive_ref 出自 Gemini 重写指南 Step 1，非亮圳硬规则，属技术口径修正；已报李白可否决。由 chore/new-skeleton 写码第二轮落数据。
  - [ ] L-07 派活卡头规矩 ≤50 行、删 9 项自查表：等亮圳拍板 Q-14（自我反思是否保留）。
  - [ ] P4 治理：L-19 master 分支保护（等拍板 P1）；L-20 李白 Routine A/B 上线演练（李白侧）。
  - [ ] 全部自验后写 0B 复核交接文件（文件名与发送命令见开工文件第八章末），交 antigravity 复核。
- 阶段 0B Gemini 复审（硬门闩）：独立顾问逐条核验复审勾选清单，给出明确「复审通过」→ 整理 PR 合入 `master` → 开 `master` 分支保护 → 门闩解锁，允许开工 S1-1。

## 阶段 1：最小闭环竖切片（4 张强衔接卡，串行优先）

1. **S1-1 新 L0 核心底座与启动强断言**：`kernel/` ≤15 文件，解除 `state.created`、memo 切片失活、`postCommit.advanceMinutes` 三死锁，补启动完整性强断言。验收：`tsc` 0 错；`kernel/files.json` ≤15 且基线违例 0；新建实体 `ref` 可写可读；缺 `saveEnv`/`modifierSource`/`unitOfPath` 启动必抛；时间推进后 `saveDigest` 逐字节一致。
2. **S1-2 真实开局 + 最小领域包 + `submitProposal`/`time` 闭环**：接通真实开局落盘、最小可玩规则集、第二物种 `null` 键修复、可重建烘焙层雏形。验收：真实开局 <3 s；第二物种走通 `body`/`death`；`submitProposal` 动作落盘 + 日志 + 时钟推进 30 分钟；CI 绿且入口可达图无孤岛。
3. **S1-3 最小菜单动作表 + 真实入口 + 存档四路路由 + 零 mock E2E 转绿**：菜单动作接 `submitProposal`，存档路由接通，E2E 烟测首次全绿并锁死为后续底线。验收：`node --test tests/e2e/vertical-slice-smoke.test.mjs` 全绿；拔掉任一接线烟测必红；腾讯云跑一次 `real-world-load` 长测。
4. **S1-4 极简无 AI 浏览器菜单前端**：复用 `assets/`，新建 `client/` 由 `index.mjs` 托管静态路由，可点开真玩一局。验收：Playwright 无头冒烟 0 控制台报错；`npm start` 后 10 秒内可亲自试玩。

阶段 2 及以后（文化圈桥接等）等阶段 1 全绿后再排。

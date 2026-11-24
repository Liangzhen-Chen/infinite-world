# 新骨架排期（阶段 0 → 阶段 1）

旧骨架排期已归档至 archive/docs-status/PLAN-旧骨架-至1124.md。

## 阶段 0：整理工作区与顾问复审（硬门闩）

- 阶段 0A 工作区整理（Step 0–Step 5）：冻结旧队列、打 `pre-rewrite-1124` 标签、落地 `.github/workflows/ci.yml` + `tsc` + 新门禁与 `dispatch.mjs`、建立六份单一真相源、归档旧文件、获亮圳点头后执行 816 MB 删除清单、清出新 `server-plugin/` 骨架空仓与红灯 E2E 烟测桩。验收：第三章 Step 0–Step 5 命令全通过，整理 PR 在 GitHub CI 绿灯。
- 阶段 0B Gemini 复审（硬门闩）：独立顾问逐条核验复审勾选清单，给出明确「复审通过」→ 整理 PR 合入 `master` → 开 `master` 分支保护 → 门闩解锁，允许开工 S1-1。

## 阶段 1：最小闭环竖切片（4 张强衔接卡，串行优先）

1. **S1-1 新 L0 核心底座与启动强断言**：`kernel/` ≤15 文件，解除 `state.created`、memo 切片失活、`postCommit.advanceMinutes` 三死锁，补启动完整性强断言。验收：`tsc` 0 错；`kernel/files.json` ≤15 且基线违例 0；新建实体 `ref` 可写可读；缺 `saveEnv`/`modifierSource`/`unitOfPath` 启动必抛；时间推进后 `saveDigest` 逐字节一致。
2. **S1-2 真实开局 + 最小领域包 + `submitProposal`/`time` 闭环**：接通真实开局落盘、最小可玩规则集、第二物种 `null` 键修复、可重建烘焙层雏形。验收：真实开局 <3 s；第二物种走通 `body`/`death`；`submitProposal` 动作落盘 + 日志 + 时钟推进 30 分钟；CI 绿且入口可达图无孤岛。
3. **S1-3 最小菜单动作表 + 真实入口 + 存档四路路由 + 零 mock E2E 转绿**：菜单动作接 `submitProposal`，存档路由接通，E2E 烟测首次全绿并锁死为后续底线。验收：`node --test tests/e2e/vertical-slice-smoke.test.mjs` 全绿；拔掉任一接线烟测必红；腾讯云跑一次 `real-world-load` 长测。
4. **S1-4 极简无 AI 浏览器菜单前端**：复用 `assets/`，新建 `client/` 由 `index.mjs` 托管静态路由，可点开真玩一局。验收：Playwright 无头冒烟 0 控制台报错；`npm start` 后 10 秒内可亲自试玩。

阶段 2 及以后（文化圈桥接等）等阶段 1 全绿后再排。

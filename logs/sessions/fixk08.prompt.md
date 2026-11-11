【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：240 分钟（到 230 分钟时停手写交接）。

# 卡 FIXK08：K08 定期集市合入后的三个漏检回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读，尤其"验收测试清单不自己挑"）。

## 事实（主会话二分，first-parent，每步用该提交自己的测试文件）
master 上通过、s5a 上失败，首败都是 d381d02e（s5a: merge t-k08-law）：
1. tests/remote-generation.test.mjs:100 自动接入：远程生成聚落的商店路线补货全为 0，reason"没有已到场的持货人或可领取运单；集日不生成现货"。
2. tests/works.test.mjs:94 测绘：报"与实际赶集路程或服务时段冲突"；works.test.mjs:143 F014 出版需求来自真实读者：数值变化。
3. tests/w2-reuse-learning.test.mjs:120 起 8 个"购买、失败成本、重试学会与零熟练施法"用例失败（同一断言处）。

## 要做
逐个查根因到文件:行，判断是 K08 规律缺了一环（例如远程生成聚落没有 K08 需要的持货人/运单来源、赶集占工把玩家/教师的服务时段错误占掉、书商货架被集市消费者买空），还是测试前提已不成立。
- 规律缺环就在规律层通用补齐（派生优先：远程生成的聚落要按同一规律派生持货人/货源，不许为它开"集日现货"特例；玩家自由度优先，NPC 自留规则不限制玩家）。
- 若确属新规律下的真实结果（例如书被真实读者买走），测试前提改用真实游戏动作产生（setup.prelude 风格），并附手算；不许放宽断言、不许删用例。
- 不按名字/ID 特判。

## 并行边界
K15R4 在 F:/dnd-wt/INTEG 改 npc-life.mjs、household-budget.mjs、shop.mjs（客店补货锚点）、monster-society*、npc-autonomy.mjs、advance-registry.mjs daily 块；PERFS7 在 F:/dnd-wt/PF7 改 storage.mjs 等通用层；FIXPUB 改人物档案发布/world 内容。你若必须改 shop.mjs，把改动限制在你需要的函数，汇报里写明函数名，便于合并。

## 验收
affected-tests2 清单（.base，WORKTREE，深度0）全过或注明 .base 对照；这 3 个文件全过；金快照若变，写 FIXK08-golden-table.md。汇报 ≤300 字：每个失败的根因（文件:行）与修法；清单 N/通过/失败。

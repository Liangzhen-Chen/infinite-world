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
限时：180 分钟（到 170 分钟时停手写交接）。

# 卡 FIXT164：npc-life-t164 配偶继承金额回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FIXT164，分支 t-fixt164，基于 t-s5integ@9729614a。.base = 9729614a。

## 事实
tests/npc-life-t164.test.mjs:184"名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承…"在 master 通过，s5a 起失败：期望 40 实际 13（苗珍 coins:40 离世后丈夫邵禾继承）。主会话二分首败 = FXM 合并 74ffb109（FXM 让缺工预测与农业日结共用田间分钟 agriculturalWorkforce）。

## 要做
查清 40→13 的 27 铜去了哪里（逐笔看账本流水：是丧葬/遗产阶段的真实支出、FXM 后家户劳力口径导致的雇工/采购支出，还是继承漏转/重复扣）。真实规律后果就按新规律手算更新锚点并写推导；bug 就修代码。不按名字特判，不放宽断言。

## 文件所有权
npc-life.mjs 的照护/离世/继承/迁居部分、agriculture.mjs、相关测试。K16 卡同时改 npc-life.mjs 的进餐部分（advanceHouseholdMeals）和 household-budget.mjs——你不改那些。

## 验收
共同规则的 affected-tests2 清单（.base=9729614a，WORKTREE，深度0，同文件按子测名对照）；t164 全过。汇报 ≤300 字：27 铜的去向（文件:行）与处理。

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

# 卡 s5r1-regress：修复 S5 合入造成的 5 个回归

工作区 F:/dnd-wt/S5R1（分支 t-s5r1，基于 s5a f7cbd017）。先读：
- docs/产品原则.md；
- docs/架构设计/15-经济与货币.md（只读相关小节）。

## 已确认的回归
master a27acae4 上通过，s5a 上失败：
1. **tests/ledger-price.test.mjs**，用例"价格输入点登记：每个读取点有调用处，每处调用都已登记；含价格字样的模块都已归类"。S5 新增的价格读取点或模块没有登记。
2. **tests/seasonal-migration.test.mjs**，用例"灭绝不恢复、满栖地不迁入，闭路不出发；途中死亡不复活"。很可能与 S5-06 生态或 S5-07 水文改动有关。这个测试单跑约 35 分钟。
3. **tests/w4-b2.test.mjs、tests/w4-b3.test.mjs**，用例"隔离发布重发零写；候选与 L4 篡改在写入前拒绝"。很可能与 S5 新增的审批或发布产物有关。每个单跑约 10 分钟。
4. **tests/action-registry.test.mjs**："注册表与 S0 动作清单一一对应且为最新同步"，期望里有 core:wildlife.release，实际注册表没有。
   - 来源是 S5-05 提交 9d0681ab。
   - 用 `node tools/build-action-registry.mjs` 重建会报"动作 id 重复：core:wildlife.release"，说明有两处来源定义了同一个动作。
   - 要查清哪一处才是正源，再修。

## 要求
- 每项先定位：是 s5a 上哪个提交引入的（可用 git log -S、git bisect 思路，但不做 git 写操作）。定位清楚根因后再修。
- 修产品代码或数据登记，使检查恢复通过。**不放宽断言、不删用例、不重生成金快照。** 世界数据改动走审批管线，不手改 dist/。
- 第 2、3 项单跑耗时很长：一次只跑一个，不并行。
- 交卡前必跑卡头规定的同步四件套和 CORE，以及上面 5 个文件，逐文件单跑。

## 汇报（≤300 字，写入 F:/dnd/logs/sessions/s5r1-regress.final.md）
每项的引入提交、根因、改法、测试结果，以及偏离之处。

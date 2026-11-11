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

# 卡 W8-E10：长时间推进的事件体积

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）和 docs/产品原则.md。

工作树 F:/dnd-wt/W8E10，分支 t-w8e10-eventsize（基于 s5a@74abb8ed）。

## 问题（另一张卡实测）
S5 种地通关测试从新角色开始：玩家一次菜单点击推进 180 日，引擎拆成 6 个原生时间事件。
- 单个事件最大 176,027,222 字节；
- 存了 40 个事件后，原始日志 1,121,399,553 字节；
- 进程工作集约 2.88GB，峰值 4.67GB；
- storage.export 复制全部事件，超过测试宿主 500mb 的 JSON 请求上限，所以完整导出导入重放做不了。
- 测试本身跑 30 分钟。

真玩家种一季地，存档就超过 1GB。这是产品问题，不只是测试问题。

## 要做
1. 先读设计：docs/架构设计/14-确定性与时序.md、07-离屏与性能.md、03 §L3 的存档快照与分片、02-不变量.md 里关于事件、重放、快照的条款。只汇报相关结论，300 字以内。
2. 测量：
   - 用一个最小复现（新开局，菜单推进 30 日），统计一个时间事件里各部分的字节占比，例如 patch 按顶层路径分、messages、trace 等。
   - 找出最大的几项和原因，比如每个 tick 都整对象写入、重复记录未变化的值、把派生投影或缓存存进了事件。
3. 按设计修：
   - 事件只存设计规定该存的东西；派生值不进日志；重放靠确定性重算或设计规定的快照与分片。
   - 不改宿主 500mb 上限，不压缩了事。
   - 同版确定性必须保持：重放后状态哈希与原始一致。
4. 目标（用实测数字验收）：
   - 新开局菜单推进 180 日后，完整导出 < 50MB；
   - 导出 → 导入 → 状态哈希一致；
   - 推进本身的耗时与内存给出前后对比。
5. 若设计本身规定"事件存完整 patch"，而唯一的解法要改设计：停下，写清方案与取舍交主会话，不要自己改设计文档。

## 不做旧存档兼容
规则只一版，不加复演版本标记（见共同规则）。

## 测试
- 新增或扩展一个回归测试：断言 180 日推进后导出体积上限，并做导入重放哈希比对。
- 逐文件跑 storage、engine、plugin、advance-registry（金快照若变，写字段表到 F:/dnd/logs/sessions/W8E10-golden-table.md，不要重生成）、numeric-persistence、s5-05、s3-offscreen-life、ledger-stock、以及 grep 到的 export/import/replay 相关测试。
- 汇报按共同规则。

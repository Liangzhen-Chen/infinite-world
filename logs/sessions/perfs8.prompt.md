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
限时：300 分钟（到 290 分钟时停手写交接）。

# 卡 PERFS8：通用层提速，为家户生计规律腾出性能余量

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树由 law-card.sh 从 s5a 当前头切出。

## 背景（主会话实测）
- s5a 对 master@3bbd7e0c：perf-gate 三对中位 1.096（门槛 1.10），几乎无余量。
- K16（取水觅食，另一工作树在做）合入后预计再增 20% 以上；新规律的真实计算不削减，需从通用层省出余量。
- 已知通用热点（K16 对比剖析中同样出现，也存在于 s5a 本身）：storage.mjs 的 take / cloneWalk / canonicalValue（写时复制与规范化比较，约 2s/10 日）、engine.mjs route（路线解析）、weather.mjs 匿名函数、垃圾回收占比。

## 要做
1. 以 master 为基线用 node --cpu-prof + F:/dnd-tools/profile-diff.mjs 剖析 s5a，按自身时间增量排序，优先通用层：写时复制路径（take/cloneWalk）的不必要整树复制、canonicalValue/canonicalEqual 的重复规范化（可按对象身份记忆）、route 的重复解析（按（起点、终点、季节、封路、设施系数签名）记忆）、天气序列重复生成。
2. 只用不改变行为的手段；**行为必须与切出时的 s5a 逐字节一致**：golden-dump 前后 0 差异、numeric-digest 一致、advance-registry（不设 UPDATE）通过。
3. 每项改动附剖析前后数字；FIELDS_INDEX_CHECK=1 跑涉及缓存的测试。
4. 目标：perf-gate 对 master 三对中位 ≤1.00（越低越好）。
## 文件所有权
storage.mjs、engine.mjs（route/get 等通用读路径）、weather.mjs、det-math.mjs、holdings.mjs（只读索引）。**不改** household-subsistence、npc-life、household-budget、npc-state、npc-schedule、education-state、advance-registry（K16 在改）；不改 food-supply/shop/transport（TFB 暂存分支）。热点若在这些文件里，写进汇报（文件:行、数字、建议）。
## 验收
共同规则清单（同文件逐子测对照）；三对数字；逐字节一致证据。汇报 ≤300 字：热点、修法、提速、最终比值。

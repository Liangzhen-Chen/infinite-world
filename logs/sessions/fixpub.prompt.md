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

# 卡 FIXPUB：人物档案发布核验的两个漏检回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读，尤其"验收测试清单不自己挑"）。

## 事实（主会话二分）
master 上通过、s5a 上失败，报错相同"人物补丁冲突或原档已过期 npc_hw_luqing/relationships[3]"：
1. tests/npc-profile-publication.test.mjs：首败 f5edba19（s5a: merge t-k10b-public）。错误原文"已发布档案发生后续修改；深度补丁来源核验失败"。
2. tests/w1-villages-publish.test.mjs:59、:74：首败 6b704e70（s5a: merge t-w8e3-consumers）；当前报错同上（两次首败不同，请分别确认各自在首败提交上的原因，可能 W8E3 先引入一处、K10b 又引入一处）。

## 要做
查清是哪次合并改了 npc_hw_luqing 的已发布档案（relationships[3]）或改了核验口径：
- 若是某张卡直接改了已发布 world/ 人物数据而没走审批管线：已发布内容只能经审批管线（world/design/*-approval*.mjs，--l1/--review/--publish/--verify）改；把该改动改为走管线的形式，或者恢复原档、把需要的事实改由运行时状态派生。付费 L2 不要自己跑——需要时停下写明，主会话执行。
- 若是核验代码口径被改坏：修代码。
- 不手改 dist/，不放宽核验，不删用例。

## 并行边界
K15R4（INTEG）、PERFS7（PF7）、FIXK08（K08 集市回归）同时在做；你只改发布/核验与相关 world/ 内容文件。

## 验收
affected-tests2 清单（.base，WORKTREE，深度0）全过或注明 .base 对照；这 2 个文件全过；内容/发布类测试全过。汇报 ≤300 字：根因（文件:行、哪次合并）与修法；清单 N/通过/失败；是否需要主会话跑付费 L2。

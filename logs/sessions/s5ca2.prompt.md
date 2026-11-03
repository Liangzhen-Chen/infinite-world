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

# 卡 S5CA：S5 收口回归——词汇封闭、存档非整数、住店 D04

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。全量扫描 s5a@75cc53c2 与 master@3bbd7e0c 逐子测对照（调度器 full-s5a-75cc / full-master-cmp），以下为 S5 新增失败：
1. tests/ontology.test.mjs "I18 词汇封闭：代码与法典里用到的动词、标签、罪名都已登记"——master 通过，s5a 失败。S5 规律卡新增的动词/标签/罪名未登记。按测试报出的条目逐个登记到正确的词表（不放宽检查、不删条目；若某个词是误用，改代码用已登记词）。
2. tests/numeric-persistence.test.mjs "after an advance, saved state holds no unlisted non-integer number"——S5 新测试未过。找出推进后存档中出现的非整数字段（写入者文件:行）。按共同规则"持久化只存整数或有理数"：改为整数或有理数（det-math 的 toRational）存储；确属允许的有理数类别才登记，不为过测试加白名单。
3. tests/daily-b2-exact.test.mjs 两项 D04 住店（"单间 40 文/晚，120→80，客栈钱柜 +40，只扣一晚，睡到次日卯时"；"D04.4 public paid lodging sleeps a full 540 minutes and recovers capp…"）——master 上为 todo，s5a 变成正式用例后失败。查是哪张 S5 卡把 todo 转正、实际行为差在哪（文件:行）；按规律修代码或按真实规律手算锚点。
验收：共同规则清单；三个文件全过；汇报 ≤300 字：每项根因与处理。

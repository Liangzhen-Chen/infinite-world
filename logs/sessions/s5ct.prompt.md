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

# 卡 S5CT：A3/daily-b2 中"归 S5"的待办转为正式用例（S5 收口项）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。docs/PLAN.md 的 W8 收口项："把 a3 中'归 S5'的 todo（独立柜台账户、具名纸本存单等）改成真实动作前提的正式用例"。
全量扫描 s5a@75cc53c2 仍有 todo：a3-owner-ding 15、a3-owner2-G 6、a3-owner2-T 6、a3-score-self 3、a3-setup-institutions 2、a3-precondition-receipt 1、a3-r9-effects 1、a1-daily-probes 13、daily-b2-events 2、daily-b2-events2 4、daily-b2-exact 3、daily-b2-exact2 1、daily-b2-mechanisms 6、daily-b2-tables 1、daily-b2-trade 4、daily-b2-world 4、world-content2 2。
## 要做
1. 先列清单：每个 todo 的说明文字写的归属（归 S5 / S4 / S6 / S7 / A2 等）与依据（docs/A3-后续阶段登记.md、各 todo 注释）。写进 final。
2. 只处理归 S5（及已在 S5 实现、归属写错的）条目：改成正式用例，前提用真实游戏动作产生（setup.prelude 风格），断言按规律手算。实现缺失的就报告缺什么（文件:行），能用现有规律补齐的小缺口可补；大缺口列出由主会话派卡。
3. 归后续阶段的保持 todo，但核对其说明写明归属阶段与登记条目；不删 todo，不把未实现的写成通过。
注意：S5CA 卡同时在改 daily-b2-exact 的两项 D04 住店用例——那两项你不动。
验收：共同规则清单；汇报 ≤300 字：todo 总数、归 S5 数、转正数、剩余及原因。

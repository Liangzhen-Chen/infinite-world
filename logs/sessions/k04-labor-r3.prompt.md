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
限时：90 分钟（到 80 分钟时停手写交接）。

K04 返修一处（主会话审 diff 后，打回）：

问题：`server-plugin/npc-state.mjs:householdWorkTime` 用正则匹配作息活动名 `/农事|农户|田间|耕|种田|种地|播种|收割|务农|照护|照料|照顾|赶集|赶圩/` 来判定哪些时段是家庭生产/照料/赶集。这是按名字特判，违反北极星"派生优先、不按 ID/名字特判"：活动名是叙述文字，改个说法规律就失效，也没法覆盖新作物、新职业。

要改：按结构事实派生家庭义务时段，不读活动名：
- 种地：时段地点是本户实际耕作的田——登记农事规则里的 fieldLocation，且本人或本户对它有 owns/leases（含 K01 的田地租约）或现有农事账户；
- 照料：沿用已有的 caring 记录与 family.illnesses（你已写的 attending/unattended 逻辑保留）；
- 赶集：真实的 market_trip 记录（K08 将接入），或当日日历为集日（calendar.market）而选中 'market' 作息变体、且时段地点有交易服务（facilityView/currentShops 可派生）的时段；
- 已约定事务：沿用 obligations 逻辑。
若某类义务在现有数据里确实无法结构派生，写清缺什么字段、归哪张卡，不得退回名字匹配。
导出 householdWorkTime 供 K08 复用（K08 当前在另一工作树里复制了一份，主会话合并时会让它改用你的）。

手算锚点与采矿回归保持；新增：同一时段把活动名改成任意字符串，结果不变；在自家田的时段计入农事、在别人田（无权利）不计。
验收同前（s5-law-household-labor、labor-market、npc-schedule、npc-obligations、s3-labor-justice、CORE、同步四件套）。汇报同原卡。

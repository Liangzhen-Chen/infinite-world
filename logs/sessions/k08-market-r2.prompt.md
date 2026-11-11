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
限时：150 分钟（到 140 分钟时停手写交接）。

K08 续做（主会话审 diff 后的裁定，先读完再动手）：

1. **打回一处设计偏离**：你把已约定未到货的远期/托运交付从报价的有效存量里去掉了（s5-08 报价 143→383、改了用例名与语义）。这违背 docs/架构设计/15-经济与货币.md §15.2 第 28 行与 §15.6：报价的有效存量 = 实物可售存量 + Σ（对价已付比例达阈、债务人可证实产能、按可靠度和时间折扣的）远期/托运义务。05 §5.1.4 说的是"实际营业与成交要真实到货"，管的是**可成交深度和交付**，不是报价预期。
   - 恢复：报价的有效存量按 15 §15.2/§15.6 计入远期（可靠度、时间折扣、产能上限）。
   - 保持：当下可成交的实物深度、可售量只读实际在手货；到站未领取不算可售（你的 3/7/10 手算保留）。
   - tests/s5-08.test.mjs 恢复原用例名与语义；若数值因你其他合规改动变化，按手算更新锚点并写依据。
2. **接点二（时点）归本卡，必须修**：advanceShops 在午夜回算前日正午，却读午夜的位置、预算和货架。改为按结算时刻（正午）派生：在场用作息在正午的位置（scheduleAt），预算/货架只计正午之前已发生的事件；不得把午后的收款/到货倒用于正午。赶集/进货出行要真实占用路程与工时（复用现有旅行回执、路费与预约冲突校验），并从生产工时里扣除（K04 的家户时间预算已合入 s5a，可调用其接口）。
3. **接点一（有理成本）划给本卡**：`server-plugin/finance-assets.mjs` 的 `recordFinanceSale` 及其成本分摊/operatingProfit 读取处，本轮由你改成有理数（{numerator,denominator} 或项目现有有理表示，det-math 的 toRational/fromRational），销售分摊按精确分数，账单整数截断规则保持。只改这条成本链，不碰 fieldRentBasis/估值。
4. 金快照字段表按最终代码重做（K08-golden-table.md）。

验收：原卡列表逐文件（含 s5-08、s5-08-w3a-transport、finance-assets、s3-finance-scenarios、w8e8-premises），CORE、同步四件套；s5-playthrough 留主会话。汇报同原卡，附上述三点各自的处理与手算。

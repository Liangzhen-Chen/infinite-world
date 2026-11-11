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

FXE6 返修（主会话审 diff 后打回核心改动，先读完再动手）：

1. **撤回 server-plugin/market.mjs 第 208 行 net 符号翻转**。原写法正确：
   - side 是市场一方视角：`business.keeper===seller → 'sell'`（店卖出），`seller==='player' → 'buy'`（市场收进）。
   - supply.supply 是当前（已含今日成交后）的可售存量；opening=supply+net 是倒推的开市存量：市场今天卖出 q → 开市时多 q（sell:+q）；市场收进 q → 开市时少 q（buy:-q）。
   - depth=1+depthImpact·net/opening：今日净卖出 → 价格上浮；净收进 → 价格下压。翻转后变成"卖得越多越便宜"，违背 15 §15.2 深度规律。
   你基于翻转更新的锚点（S5-F-3/4/6/8、a1b、s2c-fire、turn-gate 等）需按原规律重新手算；凡原测试本来就对的，恢复原值。
2. **典当/抵押估值缺规律（W8B 本金 50→300 的根因）**：现行用 单价×件数×预支比例。现实中当铺按"能卖回多少"放款，一次性变现大批货会沿需求曲线压价。规律：抵押/质押估值 = 在当地市场**逐件卖出（sell 侧曲线积分，quoteSupply 的 integral 同一套）**可得的清算值，再乘预支比例；少量（≤零售阈值）时与单价×件数一致。找到典当/质押估值入口（grep pawn/质押/预支/collateral 于 credit.mjs、finance-bank.mjs、valuation.mjs），修在估值角色层，对所有抵押物通用，不按物品特判。手算 W8B-4/5/9 与 S5-W4 F007 的新值。
3. 其余保留：K12 驿站/车行下一可乘班次 1860 的锚点、F048 用真实可执行买卖重建前提，这两处方向正确，复核后保留。
4. 未解决项（s5-04 signed-wage、ledger-reconcile、s3-e04、w2-s2、w2-s3）在第 1 点撤回后先重跑，很可能随之变化；仍失败的逐项给根因（文件:行）与处理，不得放宽断言、不得为通过而改世界数据或塞库存。
5. 金快照：撤回翻转后理应大幅回到原值；如因第 2 点变化，出字段表。

验收同原卡（13 个文件逐文件），外加 finance-assets、credit、s5-law-seasonal-credit、s5-08、w8e6-leftovers、s5-law-household-budget 不退化。汇报附逐项旧值/新值算式表。

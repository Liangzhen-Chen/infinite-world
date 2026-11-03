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

K01 返修一处（主会话审 diff 后）：

问题：`registerValuer('property')` 对田地用"全部产值（annualRevenue）"做资本化。产值里含耕作者的劳力与种子等投入回报，不是土地本身的收益。后果：
- 自用田估值偏高约 10/3 倍（相对地租口径）；
- 田主按惯例租率出租后，估值要先减去全额产值、再加回租金，地价会因为"按市价出租"凭空跌掉约七成。现实中按市价出租不改变地价。

要改（土地价值 = 地租的资本化，与 05 §5.1.1、15 §15.2.1 一致）：
1. 未出租部分：按"土地应得份额 × 产值"（即 fieldRentBasis 的惯例份额口径，与 monthlyAnchor 同源）资本化，不用全额产值。
2. 已出租部分：按合同实际租金资本化（替换该部分的份额口径）。按市价出租时，估值应与自用基本一致。
3. 承租权（right='leases'）：价值 = （签约时按同一口径的市场地租 − 合同租金）在剩余租期内的差额，可为 0；不计承租人劳力回报。
4. 手算锚点改写：2亩×120×3×3/10=216/年 → 资本化值；同一块田按 18/月 市价出租，估值不变；以 9/月 低价出租，田主估值下降，承租权价值为正，两者合计等于自用估值。
5. 其余已做的部分（签约依据追溯、延期被拒不自动转现付、rent_out 需承租人同意、到期未收作物条款）保留。

按原卡验收逐文件重跑受影响测试，汇报同原卡；金快照/numeric-digest 若变，写 K01-golden-table.md。

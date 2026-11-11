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
限时：240 分钟（到 230 分钟时停手写交接）。

TOWNINC 卡 TI1b：从现有规律推出白石镇开局的钱、粮、资产（共同规则 s5law-common.md；设计 F:/dnd/logs/sessions/towninc-design.md 第 2 节；先读 docs/产品原则.md）。

## 背景
本树切自 t-ti1@eed086f9。I1 已经做好开账钩子、world/economy/town-income.json 的加载、统计分组和守恒物化，但白石镇的经济输入几乎全部留空，正式世界里统计人口 30 天仍买到 0 份。

主会话（设计者）裁定：I1 留空的理由里，有两条是执行者自设的限制，不成立：
- “未来生产率不能替代上季实收”：上季收成可以用同一套农业规律，套在上一年的日历、年景和灾害上确定性地算出来。这是派生，不是编造。
- “职业不能推出资产”：资产从这门手艺所需的工具、设施、材料周转推出，读的是配方和物品属性，不是职业名字。

## 推导方法（主会话定，实现须逐条登记依据）
1. **存粮**：
   - 白石镇不种田（granary:false）的户，存粮是“上一个集期买回、尚未吃完”的口粮，在 0 到一个集期间隔的需求之间，按稳定种子逐户取值。
   - 这些粮的来源是集市上的历史购买，所以对应的钱已经花掉，并入期初总盘计算，不另记。
   - 有登记农地的户，按农业规律在上一年日历上的结果，减去留种、食用、实物租税、损耗。
   - 都写入 town-income.json，并带依据。
2. **资产权重 w**：
   - 每户的经营资本 = 其生计所需的工具、设施，加上一个生产周期的材料周转。
   - 生计所需从既有配方、工具、设施要求推出；价值按既有价格表估算。
   - 无手艺的劳力户 w 取最低档。资产档按资本分位划分。
3. **区域钱量 M**：
   - 公式：M = 年名义收入 ×（现金持有月数 ÷ 12）。
   - 年名义收入 = 劳力（按年龄与身体能力）× 年工作日（日历与休息日规则）× 既有工价表的中位值。
   - “现金持有月数”是新规则，写进 world/rules，登记史料来源，并标为暂定默认值。参照 CT07 标暂定默认值的写法。
   - 已有的 2351 文和公库 12000 文先计入总盘，分配的只是余量。不按“够活 30 天”反推。
4. **土地与租约**：白石镇无农地登记的户保持空，这是真实情况，不是缺数据。居住租约从 world/people/households.json 的 tenure 读。
5. **测试**：删除 tests/helpers/town-income.mjs 里的 fundedIncomeWorld。它另造了一个世界去喂测试，违反“不为测试造世界内容”。town-income 测试改在正式世界上，用真实游戏动作跑。

## 验收
- town-income、food-demand、load-world、data-coverage、numeric-persistence、save-roundtrip、CORE 与同步四件套全过。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计（正式世界），各组报：期初钱粮、实际购买量、缺餐数，并与 I1 对照（0 购买、缺餐 20820）。本卡没有就业，期初钱花完后仍会缺粮，如实报数，不为好看调参。
- 手算核对：M 的计算式和每个输入值，各组 w 的推导例子各 2 户。
- 性能：30 日×2 对 t-ti1 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TI1b-final.md。

## 文件所有权
- 预计改：world/economy/town-income.json、world/rules（新增现金持有规则）、server-plugin/town-income.mjs、tools/load-world.mjs、tests/town-income.test.mjs、tests/helpers/town-income.mjs。
- 不得改：labor-market.mjs、finance-assets.mjs、新的 town-work 模块（卡 I2 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule（K16 合并中）；food-supply、agriculture、shop、transport、advance-registry（TFB）；npc-autonomy（卡 C）。

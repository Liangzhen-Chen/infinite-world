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

TOWNINC 卡 I1：开局经济数据与统计户权益（共同规则 s5law-common.md；设计 F:/dnd/logs/sessions/towninc-design.md 第 2、3、6 节“I1”，先读 docs/产品原则.md）。

## 背景
本树切自 t-tfa（TFA：694 名未实体化居民的统计消费账户，已能进入市场需求、到店购买，物化时守恒转移）。审计显示 694 人 30 天收入 0、存款 0，一口粮都买不到。306 名登记居民中，只有 100 人有作者给的零钱，合计 2351 文。本卡负责“开局时钱和粮从哪来”和“统计户内部的权益怎么分”，不做就业（归 I2），不改接线（归 I3）。

## 要做
1. 开局经济输入：新增 world/economy/town-income.json 和对应 schema，由 tools/load-world.mjs 加载。
   - 内容：有限区域钱量 M、分户资产权重 w 的来源（已登记的资本或资产阶层，不用职业名字）、土地与租约、上季实收与损耗、库存批次、工具与经营资本。
   - 每个数字都写依据，来自既有世界设定或规则表。缺来源的留空并登记，不按“够活 30 天”反推。
2. 期初分配：
   - 已有的 2351 文及库存先计入总盘；
   - 余下的 M 按 w/Σw 分给各户，整数余数按稳定种子分完；
   - 存粮按“面积×历史单产×年景−留种−食用−实物租税−损耗”派生；
   - 新世界只开账一次，记 src:genesis。具名户、名册户、生成户同一规则。
3. 统计户分组：每镇固定的“生计×资产档×劳动能力”组。
   - 组内保留受益份额、钱粮、欠薪、累计收益指数、工时余量；有收入的组不替无收入的组付款。
   - 替换 household-budget.mjs 里全镇按人口均分的统计账户，日常开销 O(聚落×组数)。
   - 物化时按稳定种子确定户所属的组与份额：先结算到当前刻，再转钱粮、债权债务和已耗工时；重复进入不重复转。
   - 劳动能力按年龄与身体能力推出，替换 labor-market.mjs:288“非儿童都计入劳力”的算法（只改这一处判定，就业逻辑归 I2）。

## 验收
- 新增 tests/town-income.test.mjs，用真实游戏动作产生前提，覆盖：新开局、发现住户、升档、存读档。验证总量守恒、私产不被覆盖、余数分完、债权不变、无每日逐户写。
- 必跑：town-income、food-demand、population、npc-life、household-budget、load-world、numeric-persistence、save-roundtrip、data-coverage、CORE 与同步四件套。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计：各组钱粮、实际购买量、缺餐数，与 TFA（0 购买）对照，如实报数。本卡没有就业，期初财富花完后仍会缺粮，这是预期结果。
- 性能：30 日×2 对 t-tfa 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TI1-final.md。

## 文件所有权
- 可改：server-plugin/{household-budget,population,npc-life}.mjs、新增的 town-income 模块、tools/load-world.mjs、world/economy/town-income.json、对应 schema、新增测试；labor-market.mjs 只改第 288 行附近的劳动能力判定。
- 不得改：household-subsistence、water-cycle、npc-state、npc-schedule（K16）；food-supply、agriculture、shop、transport、advance-registry（TFB）；npc-autonomy（卡 C）；business、market、finance-assets（I2/I3）。
- 确需改动不得改的文件时，停下写明理由交主会话。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s504-business：S5-04 经营用工（第 1 会话，计划共 4 会话）

工作区 F:/dnd-wt/S504（分支 t-s504，基于 s5a 最新，含 S5-01 派生、02 市场、03 信贷票据、05 资源、06 生态、07 水文）。

先读：
- docs/产品原则.md；
- F:/dnd/logs/sessions/s5-plan.final.md 的"退出""04 经营用工"和末尾"登记"段，其中有归 04 的 todo 与 E15/E6/E16；
- docs/架构设计/05 章 §5.1；
- docs/A3-后续阶段登记.md 中行号 R50、R54、R56、R100、R111、R119 的条目。

只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版，不做旧存档兼容：不加复演版本标记，不留旧行为分支。
- 派生优先：可派生的数值不手填，一律经 S5-01 派生修正槽计算。工价、工时也按此派生。
- 测试前提：
  - 用真实游戏动作，或用 applyIntentSetup 声明非考查对象；
  - 测试走生产原生运行时；
  - 不为测试造接口或内容；
  - 不放宽断言、不删测试；改测试要逐处注明设计依据。
- 不调用付费模型。世界内容只写 world/。已发布内容的改动走审批管线，不直接改已发布内容的生成源。新条款作为已审补充叠加，参照 S4 的 trialProcedureFor 和 S5-03 的 creditTenderNormalizer。
- **测试期望值不得用被测函数计算**：一律用手算的数字字面量作锚点，注释写明计算步骤。手算与实现不一致时，以设计为准修实现。

## 本卡结果（S5-04，按 s5-plan "04"）
- 经营账户与钱袋分开：开户柜台账户和个人钱袋各自独立。资金只能真实调拨；继承时不复制现金。
- 进货、定价、雇用、解雇的候选方案读主观行情（经 S5-02 市场投影）。工时计入役畜，罢工、缺勤按比例折减。
- 新签、续签的工价按派生计算；已签合同的工资不改写。
- 客户订单之间真实竞争；客流、香火、丝绸产业链的供需真实变化。内部调拨不重复征税。
- 商号账簿、签发收据要有来源（S4-05 文书原件已有基础）。
- 恢复 tests/a3-owner-ding.test.mjs 中归 S5 的 todo：柜台独立、非法开户、死亡继承、遗产偿债、开户来源。前提用真实动作建立，保留原断言意图。逐处写依据。

本会话先做：独立柜台账户（开户、来源校验、只许本人支用、存档往返）及其 4 个 todo 的恢复，再做工价派生与已签工资不变。其余留给后续会话，写进交接。

## 机制断言（tests/s5-04.test.mjs，均含手算锚点）
- 开户后柜台与钱袋余额各自独立；
- 非法来源、目的、所有者开户被拒，零写入；
- 死亡继承进遗产且不复制；
- 遗产先偿债再分配，给一个数字例子；
- 新签工价派生值，给一个数字；
- 已签合同在行情变化后不变；
- 罢工或缺勤的工时折减；
- 失败零写入；存档往返。

## 可改
- server-plugin/ 下的 business、labor-market、manufacturing、npc-autonomy 等相关 .mjs 及其直接接点；
- tests/s5-04.test.mjs；
- tests/a3-owner-ding.test.mjs 中归 S5、属本卡的 todo。

锁：
- transport、finance-tax：S5-08 在改；
- remote-generation：S5-09 在改；
- engine、primitives-runtime：S5-10 独占；
- credit、finance-bank、documents：S5-03 已合入，只做最小必要接点，在汇报中列出。

## 验收与汇报（流程 v2）
- 本卡验收：tests/s5-04.test.mjs 全过；CORE（engine、storage、plugin）逐文件全过；arch-metrics、system-map 通过；静态提示 ≤10593。
- 每个测试文件单独进程运行：`node --test --test-isolation=none tests/<文件>`，输出过滤为摘要。
- **不要跑 F:/dnd-tools/slow-tests.tsv 里的慢测试，也不要自己跑全部 affected 测试**：交卡后门禁会经调度器自动跑。
- 汇报 ≤300 字，写入 F:/dnd/logs/sessions/s504-business.final.md（UTF-8），内容包括：改了哪些文件、机制与锚点摘要、恢复了哪些 todo、运行的测试与结果、偏离、下一会话计划。

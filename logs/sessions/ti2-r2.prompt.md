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

续做 I2（正文 ti2.body.md；共同规则 s5law-common.md，注意第 5 行的文件所有权规则）。主会话已提交你的改动（fa6f0940），并合入 t-town（f9c28825）。t-town 带来：TI1b 的开局钱 390,639 文和口粮、TFB 的产销链。合并冲突（arch-layers 的 economy 包、ti1-audit 的字段）已由主会话按并集解决，请核对。

## 主会话查到的两个失败根因（你按两次失败规则停了，这里给出根因）
1. “拒工…到岗后才付工钱”：
   - 合同状态变成“罢工”，reason=“工作台使用权已失效”，出自 finance-assets.mjs:449。
   - 招工 location=bld_hw_qingdeng（林穗的店），但 recipe_wooden_pegs 要 woodworking 工作台，店里没有；木工台在 bld_hw_mill。
   - 这是招工机会生成的 bug：地点应从“雇主有权使用该配方所需工作台的地点”派生，包括雇主自有的，或公共且付得起使用费的；找不到就不产生招工。
   - 请修 laborOffers 的地点派生，不改测试。
2. “统计组…生产”里的“交易对方不在场”：
   - 统计组采购原料时直接调用了需要双方在场的交易动作。
   - 统计组没有具体的人身位置，采购应走 TFA 在 business.mjs 里已有的统计顾客流程：按 walkMinutes 往返、营业时段、有限货架、同一报价与深度门槛。
   - 复用这条流程，business.mjs 允许为此做最小改动；不新开第二套成交。

## 验收
同 ti2.body.md：town-work 全过；30 日审计在正式世界（现在有开局钱粮和 TFB）报各组工时、收入来源、购买量、缺餐，与 t-town（缺餐 17,412.5、购买 0）对照；性能对 t-town 三对中位 ≤1.05；金快照逐字段解释。汇报 ≤300 字，写入 TI2-final.md。

## 文件所有权
- 不得改：npc-autonomy 和卡 C 新增的加工、集市模块（卡 C 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16 第十轮）。
- household-budget.mjs 卡 C 也可能小改，你的改动保持最小，并在交接里列明。

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

# W8-E8 第七轮：田租按土地产出派生

第六轮已由主会话提交（0bfd9591）。真实售粮这一段走通了，做得好。

## 问题（主会话已确认根因）
finance-assets.mjs:317 与 364：租金锚点 = economy.rentalCopperPerWeek×4（房屋周租），田地和房屋用同一个数。
- 一亩田月租 140 文，一季累计 1110 文；
- 全部收成只卖 392 文。

这违反"派生优先"和"世界真实运转"：没有佃农会租这种田。设计目标见 docs/架构设计/数值方案.md:177-183，§1.4 NUM-W10：佃户家户收支比 1.05–1.25，紧但有余。

## 要做
1. 土地租约（use==='field'）的租金锚点从产出派生：
   - 公式：该地块预期年产量 × 签约时本地该作物的市场报价 × 惯例租率。
   - 预期年产量用现有 yields 表、地块面积、作物与一年可种季数，复用 agriculture.mjs 已有的产量函数，不另写一套。
   - 市场报价复用现有 market 或 valuation 报价函数。
   - 按月均摊得到月租锚点；0.8–1.5 倍议价区间沿用。
   - 建筑租约不变。
2. 惯例租率是世界数据：
   - 先 grep docs/架构设计 与 world/design 有没有现成数值，有就用并注明出处。
   - 没有就在 world/meta/rules.json 的 agriculture 段追加一项（如 `fieldRent.customaryShare`），值按 NUM-W10 佃户 1.05–1.25 反推：一户全职佃农种它能种的亩数，交租、口粮、住、衣、燃料之后收支比落在区间内。
   - 在汇报和数据注释里写出反推计算。不要拍脑袋。
3. npcDecision 里出租方的 cost/value 也用同一个派生锚点（同一个函数，不复制）。
4. s5-playthrough 按新租金走完：
   - 秋后交租 → 清租 → 余款存钱庄 → 完整重放。
   - 每步手算锚点，用新租金重算全程钱数。
   - 原有收割和售粮断言保留。
5. 完整导出导入的体积问题由另一张卡（W8-E10）处理，本卡不碰 storage。
   - 如果 s5-playthrough 的完整重放仍因体积失败，就把那一步如实保持失败并写明，其余步骤照常验收。

## 测试
- 同第六轮列表，另加 agriculture.test、w8e8-premises（加上田租派生的手算用例）。
- 金快照受影响就重做字段表（覆盖 W8E8-golden-table.md），不要重生成。

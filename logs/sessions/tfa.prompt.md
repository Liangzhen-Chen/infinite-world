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

TOWNFOOD 卡 A：城镇人口的粮食需求（共同规则见 s5law-common.md，设计见 F:/dnd/logs/arch/townfood/design.md 第 2 节和第 4 节“A人口”）。

## 背景
本树切自 t-k16@fc0c1dfa。K16 是家户自给（打水、采集），还没有合入 s5a，第九轮性能优化正在同时进行。白石镇骨架 1000 人：306 人、90 户已经实体化，另有 694 人、210 户待生成（world/design/w1-baishi-skeleton.mjs:78）。

现在只有实体户会吃饭；待生成的人口既不消费，也不形成需求，所以 30 日审计里城镇缺粮 721 户日，全部是“没有可买粮的货架”。产销链（TFB：food-supply.mjs、shop、transport）在另一条分支，已经能把粮运到柜台，但缺少买方需求。本卡负责需求这一侧。

## 要做
1. 未实体化人口按身体当量进入统计层，形成聚落级的消费与劳动收入账户。
   - 依据：npc-life.mjs:48 的成员餐和公粮抵私粮；登记户保留原路径不动。
   - 账户只存整数或有理数。
   - 不按户逐日写，新增持久量为 O(聚落统计账户)。
2. 统计人口的粮食需求通过 market.mjs 的读取（:152–178）进入集市与货架需求。
   - 物化转移份额：人口被生成为实体户时，统计账户按份额转出，两组不重计，也不凭空发钱发粮。
   - 现货和在途不重计（market.mjs:181）。
3. 统计人口挨饿是真实结果：买不到就记缺口，不补粮。
   - 缺口要能进入现有的饥饿或迁出规律，或已有的统计指标。
   - 如果找不到可接的现有规律，写明并交给主会话，不要新造。
4. 数值从既有表派生（W/rules/tables/balance/body.json:10 每日 60 饱食等），新字段尽量为零。新增规则须登记来源。

## 验收
- 新增 tests/food-demand.test.mjs，需求前提一律用真实游戏动作产生，覆盖：
  - 1000 = 306 + 694；
  - 物化前后守恒；
  - 非公仓消费；
  - 无逐户日写；
  - 买不到时记录真实缺口。
- 用 affected-tests2 生成清单。核心与相关测试在卡内跑，大清单交给关卡。必跑：
  - npc-life、household-budget、population、remote-generation、market 相关测试；
  - s5-law-household-meals、numeric-persistence、save-roundtrip、i31；
  - CORE 与同步四件套。
- 30 日审计：报告城镇统计人口的需求量与缺口。本卡没有供给侧，缺口大是预期结果，如实报数。
- 性能：30 日×2 对 t-k16@fc0c1dfa 三对中位 ≤1.05。
- 金快照字段表逐字段解释，不重生成金快照。
- 汇报 ≤300 字，写入 TFA-final.md。

## 文件所有权
- 可改：server-plugin/{npc-life,household-budget,population,remote-generation,market}.mjs、新增的 food-demand 相关模块与测试、相应规则表。
- 不得改：household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16 第九轮正在改）；food-supply、agriculture、shop、transport、advance-registry（归 TFB）。
- 确需改动不得改的文件时，停下写明理由交主会话。

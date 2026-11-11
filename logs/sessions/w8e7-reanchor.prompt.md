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
限时：60 分钟（到 50 分钟时停手写交接）。

# 卡 W8-E7：W8-A 价格派生后的旧测试重锚（手算）

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）。

工作树 F:/dnd-wt/W8E7，分支 t-w8e7-reanchor（基于 s5a 3d45e13f）。

## 背景
W8-A 把两处现价从"目录基价×数量"改为当地市场估值（server-plugin/valuation.mjs 的 goodsWorth，单份值 = 区域基价 × 稀缺，稀缺 = clamp(需求/供给, 0.5, 3)）。二分确认下列失败自 W8-A 合入（b69daa34）开始，之前全过：
1. **粮仓售粮**（agriculture.mjs 约 409 行 world_farm buy）：
   - tests/m2-preconditions.test.mjs 用例"燕麦从在场粮仓柜台购买…"：期望 coins 150（10 份×3 文），实际扣 50；
   - tests/m2-task-flow.test.mjs 3 个用例；
   - tests/m2-action-context.test.mjs 1 个用例（actual -50）；
   - 它们读的场景夹具 tests/fixtures/t64-scenarios.json 里 id "npc_quest_social" 的 delta（state.player.coins -30、settlements.loc_hw.treasury 等）。
2. **盗采案值**：tests/mining-jurisdiction.test.mjs:93 期望罚金 `{'王国':15+ore*2,'赭牙部盟':31+ore*3}`，用的是目录 basePrice 4；实际赭牙部盟 37（矿石在当地估值 2）。

## 要做
- 先确认新数值是设计行为，不是 bug：W8-A 卡注明"粮仓售粮、偷窃案值走 valuation goods"，见 docs/PLAN.md W8-A 行。若发现估值本身算错（如供给/需求取错地点），停下写进汇报，不要改测试。
- 是设计行为则重锚。期望值**不得调用被测函数**（goodsWorth、marketSupply、marketQuote 等）算出：
  - 按设计公式写手算数字字面量，注释写清计算步骤（供给、需求从场景里哪些量来，稀缺多少，单价，总价）；
  - 可以在测试里读状态里的原始量（库存、人口等）做交叉核对，但最终断言必须是字面量。
- t64-scenarios.json 的期望 delta 同样改成手算值，在相邻的说明字段或测试注释里写依据。
- 每个失败用例原来的断言意图要保留：守恒、对账、拒绝条件不变。

## 可改文件
tests/m2-preconditions.test.mjs、tests/m2-task-flow.test.mjs、tests/m2-action-context.test.mjs、tests/mining-jurisdiction.test.mjs、tests/fixtures/t64-scenarios.json（只改 npc_quest_social 相关条目）。不改 server-plugin/。

## 测试
逐文件跑上面 4 个测试文件；另跑 t64 夹具的其他使用者（grep -l t64-scenarios tests/*.test.mjs）。

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

# W8-E8 第五轮：按首领给的条件走完种地路线

你如实保留了 103<140 的失败，做得对。主会话已做两件事：
- 把你第四轮的改动提交为 c930d578。
- 把最新 s5a 合进本分支。合进来的内容包括：
  - E6b：shop_pricing 已按精确分数持久化，所以你准备的 shop.mjs 补丁不用了，不要应用。
  - f0de40b9：面积修复，s5-05 应该恢复全过。

先跑 numeric-persistence 和 s5-05 确认这两点。

## 决定一：秋后交租接受"先付一部分"
首领的回复不是拒绝。它是 npcDecision 的 conditional 结果：conditions.prepay=10，原话"需先付10文，再谈这件事"。现实里佃农先交押租或部分租、余下秋后交，很常见。

做法：
- rent_in 约定 rentDueAt 时，允许玩家同时带一笔当场先付的钱（用现有 coins 槽，或租约已有的 prepayment 字段，以现有字段为准）。
- 先付的钱真实入聚落公库。延期义务金额 = 应付总额 − 先付额，金额照原规则计算。
- 先付额作为 reward/prepaid 进 npcDecision，与 dialogue.mjs:118 处理 conditions.prepay 的方式保持一致，复用同一约定。不写死同意。
- 首领仍可能拒绝或再提条件。按真实结果走。
- 回执里把 conditions.prepay 原样告诉玩家，让玩家知道下一步可以怎么谈。
- 现付路径和不带先付的延期路径保持不变。

## 决定二：public_property 不按名字硬筛
现状：entity-view.mjs 两处用 `.filter(p=>p==='public_property')` 挑出这一项职权。这是写死特判，要改掉。

改法：在 world/meta/rules.json 该职位定义里追加一个数据列表，例如 `seatPowers:["public_property"]`，意思是"只要占着这个首领位就有的职权，不受升级覆盖影响"，并注明出处 05 §5.7.3。代码改为读这个列表。

## 收尾
- tests/s5-playthrough.test.mjs 农事段按真实菜单走：
  - 请求延期 → 读首领的条件 → 带先付额再谈 → 按真实结果继续：播种 → 成熟 → 分趟收割 → 卖粮 → 交清欠租 → 余款存钱庄 → 完整重放。
  - 每步手算锚点。
  - 若仍付不起或被拒，如实保留失败并汇报。不改人物、种子或世界数据去凑。
- 更新 docs/可玩版本-S5.md。

## 测试
- 同第四轮列表全部重跑。
- advance-registry 金快照差异按合并后的树重做字段表，写进 F:/dnd/logs/sessions/W8E8-golden-table.md（覆盖旧表）。不要重生成快照。
- 汇报按共同规则。

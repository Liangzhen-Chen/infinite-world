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
限时：120 分钟（到 110 分钟时停手写交接）。

# LAW-astra-002：把 DS1–DS5 写进设计，并拆出 S5 规律卡

你的审计报告主会话已审，结论采纳。DS1–DS5 五项设计修订全部批准。
- 随机性按 §5 的口径执行，用户本人也明确要求："允许随机性存在，允许有些事情就是不合常理"。
- 离群容许 0–5%、敏感性 5–10% 的 P 口径批准作为初试；它不覆盖现有门禁。

本轮工作树 F:/dnd-wt/LAWD，分支 t-law-design，基于 s5a@74abb8ed。**只改 docs/，不改代码和世界数据。** 不跑测试。

## 已有进展，写设计时要对齐
另一分支 t-w8e8-premises（尚未合入 s5a）已做 LAND01 的一部分：
- fieldRentBasis：年产量 × 签约当地报价 × 惯例份额 3/10，份额由 NUM-W10 反推；
- 按亩签约，签约时把作物与锚点冻结在 rentBasis；
- 租约可约定秋后交，可先付一部分，余款形成义务。

看实现用 `git -C F:/dnd show t-w8e8-premises:server-plugin/finance-assets.mjs`，只读相关函数。DS1 要与它一致；如果它有违背你提案的地方，就在设计里写明应改成什么。
- finance-assets.mjs:106–115 地产估值仍用租金资本化，与田租同源，尚未修。

另一分支 t-w8e8-premises 正在做 AS01（业主自主维修），结果未出。DS2 照你的提案写，不必等它。

## 要做
1. 把 DS1–DS5 写进 docs/架构设计 对应章节：05、15、14、07 中你在报告里指出的位置。
   - 正文用设计口径，不写实现细节。
   - 每处注明来源 LAW-astra-001 和对应提案编号。
   - 在 docs/架构设计/修订记录.md 追加一条 10-29 修订，列出改了哪些章节、各改了什么。
2. 把数值方案.md 的浸泡指标按 §8 合并或追加：
   - 新增的资产、决策、渠道观测项标 P；
   - 已有 NUM-* 门槛不放宽。
3. 写 S5 规律卡拆分计划，放在 F:/dnd/logs/audit/LAW-astra-001/s5-cards.md。范围是所有归属 S5 的提案：
   - 主阶段为 S5 的：LAND01、AS01、HH01、AS02、HH03、CR01、HH02、LAB01、MKT02、LAND02、AS03；
   - S5 协作的：ORG01、POP02、MIG02、MKT03 的 S5 部分。

   每张卡写清：
   - 目标规律的一句话表述；
   - 依赖哪些卡，哪些可以并行；
   - 会改哪些文件（文件:函数级）；
   - 涉及的现有原语和义务种类；
   - 验收：手算机制测试、浸泡指标、不能退化的现有测试；
   - 规模 S/M/L；
   - 建议用的执行模型：gpt-6-luna、gpt-6.1-sol 或 gpt-6-astra。

   注意：
   - 卡与卡之间不要改同一批文件，否则写明必须串行；
   - 给出建议的波次，每波最多 4 张并行；
   - 浸泡审计（一年 × 多种子，用 §8 口径）作为最后一波的验收卡。
4. 归属 S6、S7、RW 的条目，写进 docs/A3-后续阶段登记.md 的对应段，只追加。

## 汇报
- 改了哪些文档、每处一句；
- 卡数和波次；
- 你认为风险最大的两张卡及原因。
不超过 400 字。

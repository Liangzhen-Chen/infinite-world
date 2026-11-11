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

设计卡 TOWNINC：城镇居民的生计与收入从哪里来。只读代码，只写设计文档，不改任何代码。先读 docs/产品原则.md 和 F:/dnd/logs/arch/townfood/design.md。

## 问题（主会话已查实）
TFA（分支 t-tfa，工作树 F:/dnd-wt/TFA）把白石镇 694 名未实体化居民接进了统计消费账户：需求进入市场，到店购买走普通顾客流程（business.mjs 新增的统计顾客段）。可 30 日审计显示：
- 账户 0 文，劳动收入 0；
- 694 人 30 天一口没吃，缺口 1,249,200 饱食，unmetMeals 20820。

原因：
- 统计劳力只接现成的、带配方的招工（labor-market.mjs 的 advanceStatisticalLabor），镇上没有这种招工；
- 生成人口本来就以 0 文起步（population.mjs 的 acceptPopulationProfile 里 initialNpcState coins:0）。已登记的 306 人也要核：他们靠什么挣钱、钱从哪来。
- 名册上有职业：world/design/w1-baishi-skeleton.mjs:67 的 trades[district]，以及 pendingAgeStructure。但现在没有任何规律把职业变成收入。

即使 TFB（产地售粮、运到柜台）和卡 C（家户买原粮自做口粮、集市直购）都合入，镇上居民仍然买不起粮。这是缺规律，不是缺数据。

## 要回答
1. 城镇居民（具名与统计两类）收入的真实来源有哪些？
   - 候选：手艺产出卖给他人、受雇于镇内经营与公役、服务（搬运、帮工）、外地来钱（行商、税役回流）。
   - 每一种都要钱物守恒：钱从哪个真实账户来，到哪个账户去；货从哪种真实材料、工具、劳时来。
   - 不发钱，不让职业名本身产生收入。
2. 起始财富：开局时各户的存款与存粮怎么从世界设定派生（如户数、职业、地租、年景），守恒地放进账户？与具名户和生成户是否同一规则？
3. 统计层怎么做才能 O(聚落) 而不是逐户逐日？统计户物化时，财富与收入份额如何守恒转移（沿用 TFA 的 materializeStatisticalFood）？
4. 与 K08（business 正午客流）、K12（shop 收货）、TFB（food-supply）、卡 C 的接点和先后；哪些用现有规律就够，哪些必须新加。
5. 手算一遍白石镇一个月：收入合计、粮食支出合计、能买到的粮份、仍缺多少。用来说明这套规律能否让城镇不至于全体挨饿，同时允许真实的贫困与缺粮。
6. 拆卡：每张卡写清独占文件、验收（机制测试，前提用真实游戏动作产生）和必跑测试，标明哪些卡可以与 TFB、卡 C 并行。

## 文件所有权
只写 F:/dnd/logs/sessions/towninc-design.md（工作树 F:/dnd-wt/TFA 只读，在其中读 TFA 未提交的改动）（≤2500 字，带 文件:行 依据）。不改代码与测试，不提交。

## 验收
设计文档回答以上 6 问，每条结论附 文件:行；手算要列出所用的规则表行。汇报 ≤300 字。

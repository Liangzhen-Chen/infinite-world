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

# W8-E6 续：估值的市场供给不得计入估价对象自己的行囊

主会话复核 W8-A 后续失败时发现一个估值缺陷，归你这张卡（valuation.mjs 归你）。

## 现象
tests/mining-jurisdiction.test.mjs:93"远方郡…盗采分别判罚"。盗采案值来自 extraction.mjs:209 的 `goodsWorth(d,this,{item,quantity:1,location,holder:null})`。

marketSupply 在当地把**玩家自己行囊里的铁矿**算进了供给（rows 里 owner:'player'）：
- 寒炉通吉：玩家背 1 块，供给 1、需求 1，稀缺 1，单价 4，罚金 15+4×2=23；
- 赭牙：玩家背着上一处的 1 块和刚采的 1 块，供给 2、需求 1，稀缺 0.5，单价 2，罚金 31+2×3=37（测试原期望 43）。

结果是**盗采者身上背的赃物越多，案值越低、罚得越轻**，可以套利。

## 要做
- 当地市场供给应只计真正在当地出售或可供交易的存量：店铺、市场、粮仓、在售摊位等，以 market.mjs 现有的 rows 来源为准。
- 不计：
  - 估价时的 holder 或被估者本人的随身行囊；
  - 至少不计玩家与无经营身份的个人随身行囊。
- 先查 docs/架构设计/ 关于市场供给口径的规定（grep "供给" "supply" "marketSupply"），按文档定，并写明依据。
- 修好后，mining-jurisdiction 原期望 `{'王国':15+ore*2,'赭牙部盟':31+ore*3}`（目录价 4）应重新成立。不要改这个测试的期望来迁就。
- 改供给口径会影响别的价格。逐文件跑：
  - market*、valuation 相关、shop、trade、w8a-price-migration、s5-02*、a1-daily-probes、daily-b2-*、m2-*、advance-registry；
  - 金快照变化写表，不重生成。
- 加一条反套利用例：同一盗采，身上多背赃物，案值不变。

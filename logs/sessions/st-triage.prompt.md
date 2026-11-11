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

# 卡 STT：settlement-trade 三处失败分诊

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/STT，分支 t-st-triage，基于 s5a@8a657c62。

## 背景（主会话沿 s5a 合并点二分）
tests/settlement-trade.test.mjs 在 c740a131 全过（18/0）；首个失败合并点 6b704e70（merge t-w8e3-consumers：休息回血闭式、淋湿暴露、**统一耕作面积事实**、车前/金银花分种），1 处失败；现 s5a 头 3 处失败。前一张卡观察到其中两处：
- 周推进后某人物私人物品多出 `item_sickle`（可能与 W8-E8 已批准的河湾铁匠铺铁镰进货有关，见 world/meta/rules.json 镰刀进货行）；
- 一次长推进与分段推进的结果中，农业记录 `sourceEvent` 分别为 `large` 与 `small-22500`。

## 要做
对每处失败：
1. 定位引入它的提交（6b704e70 之后的另两处请沿 s5a 合并点自行定位）和具体代码（文件:行）。
2. 判断性质：
   - **确定性破坏**：同一存档，长推进与分段推进得到不同的世界状态（不只是事件编号这种来源标签不同）→ 修代码，使两者一致。只是来源事件 id 因事件不同而不同、世界状态一致时，说明为什么这是合理差异，并看测试原意：若测试比较的是全部状态，应改成比较世界状态、排除来源标签吗？——不要自行放宽；写出你的判断与依据，由主会话决定，先不改断言。
   - **已批准的规律变化**（例如进货的镰刀真被人买走）→ 手算新值，把锚点改为新值并注明依据，断言仍严格。
   - **规律错误**（例如镰刀凭空出现、来源不明、钱货不守恒）→ 修代码。
3. 不得删测试、不得放宽断言。

## 验收
逐文件：settlement-trade、agriculture 以外与改动相关的测试、CORE 三件、同步四件套。agriculture 为长测，列给主会话。
汇报一张表：每处失败的引入点、根因、性质、处理方式。

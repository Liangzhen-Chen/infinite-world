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

# 卡 W8-E6：S5 价格/运输遗留四项

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）、F:/dnd/docs/产品原则.md，以及 docs/PLAN.md 中 W8-A、W8-D 两行（"遗留→W8-E"部分）。

工作树 F:/dnd-wt/W8E6，分支 t-w8e6-leftovers（基于 s5a c091010c）。

## 要做
1. **"基准估值"角色**：transport.mjs:521 前运（forward）的机会成本仍用 `e.byId.get(item).basePrice` 作 economy:value 的 base。
   - 在 server-plugin/valuation.mjs 加一个 baseline 角色：物品脱离当地稀缺的派生基准值，来源以 valuation/market 现有派生为准，不新造公式。
   - transport.mjs:521 改读它。
   - 同时 grep server-plugin 里剩余 19 处 basePrice：
     - 凡是"把目录价当现价/估值用"的，改走 valuation 对应角色；
     - 规则定义里本来就是基准价的（W8-A 已加注释的那类），保留；
     - 汇报列出改了哪些、保留哪些（文件:行与一句理由）。
2. **无从估价**：W8-A 遗留。物品在当地无从估价（goodsWorth 返回 null）时，案值、赠礼值现在按 0 计。改为：
   - 结果里明确标"无从估价"（结构化字段 + 回执文字）；
   - 法律立案、判罚、赠礼好感不得把它当 0 用。
   - 处理办法先查 docs/架构设计/（grep "无从估价" "unvaluable" "估价"）；文档没写的：
     - 案件按"无法核定案值"处理，只按基础罚则、不加值倍数，并在案卷写明；
     - 赠礼按"对方无法估值"处理：不计价值，只计心意，按现有关系规则里与价值无关的部分。
   - 写手算用例。
3. **post.mjs:21 驿传估算按整点出发**：`departAt:Math.ceil(at/60)*60` 是写死的整点假设。
   - 改读 transport 表里该承运方式的真实发车班次（W8-D 已把发车表入 world/ 的 transport 表，quoteTransport/班次读取函数 grep 获得）；
   - 无班次的方式按"随到随走"。
4. **compat/v2-phase1-engine.mjs:107 价格区间公式**：先确认该文件是否仍被任何生产路径或测试引用（grep import）。
   - 若只剩兼容层且无人引用：写进汇报，建议删除，不要自己删；
   - 若仍在用：改为读 market/valuation 的同一派生，不保留第二套价格公式。

## 可改文件
server-plugin/valuation.mjs、transport.mjs、post.mjs、compat/v2-phase1-engine.mjs、law 相关（案值计算所在文件，grep 确认）、赠礼相关（grep gift/赠）、上面第 1 项涉及的 basePrice 所在文件（但 agriculture.mjs 与 body-needs.mjs/environment*.mjs 正被别的卡改，不要动，写进汇报）；对应测试与新测试 tests/w8e6-leftovers.test.mjs。

## 测试
- 新测试覆盖四项，每条带手算锚点。
- 另逐文件跑：transport*、post*、law、gift/relationship 相关、valuation 相关（tests/w8a-price-migration.test.mjs、tests/ledger-price.test.mjs 很慢可写明未跑）、a3-domain-properties。
- 金快照变化写表，不重生成。

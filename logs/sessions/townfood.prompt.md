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
限时：180 分钟（到 170 分钟时停手写交接）。

# 卡 TOWNFOOD：城镇粮食供应链（设计审计，只出方案不改代码）

先读：docs/产品原则.md（北极星：真实运转的全规模世界、派生优先、不现实=缺规律、规律是分布允许个别不合常理）；docs/架构设计/05-统一模型.md §5.1、14 §14.5.1；F:/dnd/logs/sessions/s5law-common.md 的约束部分。工作树 F:/dnd-wt/S5A（s5a 当前头，只读，不要修改任何文件；方案写到 F:/dnd/logs/arch/townfood/）。

## 现象（K16 审计，s5a + K16 取水觅食分支，30 天逐日真实推进）
白石镇（loc_bs，granary:false，人口 1000，D1"镇上没有公仓，不进每日口粮结算"）登记的 90 户共 2700 户日里有 1366 户日缺粮；逐日读取运行时商铺投影（含动态营业、接管、人物派生商铺）：缺粮日全部"无食品货架/可售食品"，没有"有钱有货却漏购"。即镇上零售端根本没有粮食流入。

## 要回答（每条附文件:行证据）
1. 现有世界里，粮食从生产到镇上零售的每一环由哪些系统负责：农业（agriculture、公仓村的产出与余粮）、K08 集期与集市消费者、K12 运单/路线补货（shop restock source:'route'）、settlement_trade（advance-registry 的 settlementTrade）、行商（FIXK08 的到场行商只在远程生成县）、K02 家户预算与市场替代。逐环说明现状：有/缺/断在哪里。
2. 白石镇 1000 抽象人口与 90 个登记户的关系：抽象人口是否应参与粮食需求（D1 现在不计），登记户的需求如何与周边村子的供给相接。
3. 给出最小、通用的规律方案（不按白石或任何名字特判）：例如周边有余粮的生产者在集日按真实路程把余粮运到镇集市/粮铺出售、镇上粮铺按 K12 运单向产地采购、settlement_trade 的粮食流入镇商铺货架等——选一个或组合，说明为什么它是"派生"的（数量从产量、人口、价格、路程派生），对其他城镇（含远程生成县）同样适用。列出要改的文件与函数、新规则表字段、手算锚点示例（一个村一个集日能运多少、镇上 90 户一周的需求与供给对照）、对性能的影响估计与控制办法（不得每户每日写存档）。
4. 风险：会不会让村里自己缺粮（余粮口径）、价格波动是否合理、旧测试锚点哪些会变。

## 交付
F:/dnd/logs/arch/townfood/design.md（≤2500 字，含上述 4 部分与实现卡拆分建议：每张卡的文件所有权、验收、并行边界）。汇报 ≤300 字。

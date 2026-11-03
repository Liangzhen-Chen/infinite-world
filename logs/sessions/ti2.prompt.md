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

TOWNINC 卡 I2：城镇居民就业与收入（共同规则 s5law-common.md；设计 F:/dnd/logs/sessions/towninc-design.md 第 1、3、6 节“I2”；先读 docs/产品原则.md）。

## 背景
本树切自 t-ti1@eed086f9。I1 已经做好：统计分组（生计×资产档×劳动能力），以及按年龄与身体能力推出的劳力。现状是统计劳力只接现成的、带配方的招工（labor-market.mjs 的 advanceStatisticalLabor），镇上没有这种招工，所以 30 天收入为 0。另一张卡 TI1b 同时在补开局的钱粮数据。

## 要做（钱物守恒，不发钱，职业名本身不产生收入）
1. 招工从真实需求派生：
   - 经营者有订单或补货缺口、柜台有钱、有材料工位时，产生雇工机会；
   - 雇主柜台或钱袋付给劳动者，实际工分折薪，欠付入债，不是可花的现金。
   - 复用 labor-market.mjs:67、:243 的结算。
2. 手艺自营：
   - 统计组与具名户都可以用自己的材料、工具、工位按配方生产，产物归材料所有者；
   - 售出才有收入，走 K08 到店或集市的现有成交，复用 finance-assets.mjs:433、:453；
   - 营业额不重复记成工资或利润。
3. 帮工与搬运：
   - 只有存在真实任务（有托运、装卸、施工等需要人力的事件）时才有活；
   - 完成量要有凭据，按既有工价付款；
   - 不能用“服务业”标签刷工分。
4. 时间预算：生产、服务、通勤、做饭共用每人每天的工时预算，不跨日双占。统计组按组批量竞争真实机会，O(聚落×组数)。

## 验收
- 新增 tests/town-work.test.mjs，用真实游戏动作产生前提（真实采购、开店下单、签约、到岗），覆盖：
  - 无材料、工具、资金、需求时不赚钱；
  - 拒工、欠薪；
  - 跨日不双占；
  - 统计组与具名户同规则。
- 必跑：town-work、labor-market、finance-assets、town-income、food-demand、business 相关测试、numeric-persistence、save-roundtrip、CORE 与同步四件套。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计（正式世界）：各组工时、收入、来源构成（雇工、自营、帮工）、购买量、缺餐数，与 I1 对照。TI1b 未合入前期初钱仍很少，如实报数。
- 性能：30 日×2 对 t-ti1 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TI2-final.md。

## 文件所有权
- 预计改：labor-market.mjs、finance-assets.mjs、新增 server-plugin/town-work.mjs 与测试。
- 不得改：world/economy、town-income.mjs、load-world.mjs、tests/helpers/town-income.mjs（TI1b 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule（K16 合并中）；food-supply、agriculture、shop、transport、advance-registry（TFB）；npc-autonomy（卡 C）。
- business.mjs、market.mjs 的接线归 I3。确需改动时只做最小接点，并在交接里列明。

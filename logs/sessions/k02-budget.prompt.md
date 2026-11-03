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

# 卡 K02：家户预算与缓冲（S5 规律卡，第 1 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K02，分支 t-k02-law。范围按 s5-cards.md 的 K02 节。审计原文：tables/ 中家户经济表的 HH01、HH03。

## 要做（按 K02 节）
1. 新增 server-plugin/household-budget.mjs：householdBudget / householdResources / householdBufferTarget，纯派生，不写钱物。分别给出：现钱、未来来源（带到账日，不算现钱）、食用/种用/已承诺/可售，以及到下一次可靠收入前的缺口；主观预期与内核事实分开标注。
2. 同模块提供消费、出售、保留、筹措的可行方案与边际预算接口，供 K08（实际买卖）、K09（授信/亲友筹措）接入；本卡至少接一个真实消费者：market.mjs 的 reserveAllocation/personalReserves/reserveShortfall/saleableStock/forwardSupply 改为复用预算，保证承诺只扣一次，并保留报价已有的实物约束。
3. 家户成员共享一袋粮不重复保留；不能自动取得他人钱袋；互济只在对方真实同意并完成转移后才计入。
4. 个体差异：储备倾向因人而异（节俭/挥霍），按 05 §5.7 从种子抽签，不强制每个人都存够。
5. npc-state.mjs 家户 selector 只读，不改。不写日程（HH02 归 K04）。

## 手算锚点
同一资源可食可播：库存20、食用10、种用4、排他承诺3 → 可售3；种用若是独立物品则分开算。现钱5、第6天工资10、第3天应付8 → 当场现金仍是5，第3–6天缺口3显现。

## 验收
C；逐文件：s5-02、s5-05、shop-restock、w8e6-leftovers、npc-obligations、新增 s5-law-household-budget（含非共享家计、单身、孩童照料、共同歉收、双世界私密案例：NPC 看不到别家账）。

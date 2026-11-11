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

# 卡 K06：生产投入与季节机会（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K06，分支 t-k06-law，基于 s5a@a3125085。范围按 s5-cards.md 的 K06 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中生产与资产表的 AS03、土地表的 LAND02。

## 已合入，可直接用（只读调用）
K04 npc-state.mjs:householdWorkTime（家户时间预算，结构派生）与 labor-market 结薪口径；K02 household-budget（种用/食用/承诺分配，种子只扣一次）；K01 fieldRentBasis 与签约快照契约。

## 文件边界（本波与 K08、FXE6 并行）
- 可改：agriculture.mjs、domain-rules.mjs:privateCropYieldBase 及作物规则消费、world/meta/rules.json 农业段。
- finance-assets.mjs：**只允许改 fieldRentBasis**（若年茬预测与实际可播可收不一致）；recordFinanceSale/成本分摊链本波归 K08，不得触碰。
- 不改 market/shop/business/npc-state/labor-market；需要接点写进汇报。

## 要点
- 作物（及其他生产）的预期回报必须用实际可投入的劳力、工具、种子和有效农时：种子不够就不能得整块地的产出（允许部分种植则按合法面积）；已签雇工时段不能同时算作田间劳力；农具或设施瓶颈不因多雇人消失。
- 签约预期的年茬数必须能在声明的播期/生长期内真实完成；跨季与灾害改变真实产量，但不倒改已签定额租。
- 分批搬运不能重复收获；同一份种子/同一段工时只用一次。
- 个体差异与噪声按 05 §5.7、14 §14.5.1（例如播种时机的个人偏好），共同冲击（天气灾害）整片地区共享。

## 验收
C；逐文件：agriculture（长测：若超 40 分钟列主会话外跑）、finance-assets、w8e8-premises、w8c-carry、seasonal-hazards、s5-03-w1、新增 s5-law-production-inputs（明确"同份种子/工时只用一次"）。s5-playthrough 留主会话。

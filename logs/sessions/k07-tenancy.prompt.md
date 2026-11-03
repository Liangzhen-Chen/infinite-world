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

# 卡 K07：租制与风险分担——定额租与分成租（S5 规律卡，第 4 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K07L，分支 t-k07-law，基于 s5a@16df4939。范围按 s5-cards.md 的 K07 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中土地与租佃表的 LAND02（Cheung 1969、Stiglitz 1974 等分成租理论）。

## 已合入，可直接用
K01 fieldRentBasis 与签约快照（定额租、按亩、可延期/先付/尾款）；K06 真实产出（种子、劳力、农具、天气后的实际收成，分批收割账本）；K02 household-budget 未来来源/支出读取；K04 家户时间。

## 要点
- 定额租履行已签金额；分成租按真实产出的约定比例结算（毛产或约定净产，投入由谁承担写在条款里，不重复扣）。
- 灾害只按有权条款分担：有减免条款、法律规范或债权人实际减免动作才减，逐项留事件依据。
- 选择租制是租佃双方的决策：风险态度因人而异（05 §5.7，种子抽签），允许个别人"高租执念"亏损；签约要真实同意。
- 部分先付、到期尾款不重复生债；同一收成事件重放不再收租；租期末未收作物按合同与法律处理，不无声销毁或转移，不用条款偷走未同意的投入改良。
- 本波与 PERFS6（性能，只动自治决策）并行；你不改 npc-autonomy/building-maintenance/business/subjective-view。

## 手算锚点
产出100、毛产分成3/10 → 付30；灾后产出40 → 付12；定额30 同灾情仍 30（除非实际减免）；约定净产出、共担投入10 → 基数90 → 27；先付5 → 到期付应付−5。

## 验收
C；逐文件：finance-assets、w8e8-premises、s3-obligation-state、s3-finance-scenarios、s5-f2-contracts、s5-law-land-value、s5-law-production-inputs、s5-law-household-budget、新增 s5-law-tenancy-sharing（跨到期、分次收获、先付/尾款、重放、双方租入/租出）。agriculture、s5-playthrough 长测列主会话。

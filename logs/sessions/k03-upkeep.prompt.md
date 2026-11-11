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

# 卡 K03：业主维护闭环（S5 规律卡，第 1 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K03，分支 t-k03-law。范围按 s5-cards.md 的 K03 节。

## 已有（W8-E8 第八轮，已合入），承接不另建
server-plugin/building-maintenance.mjs：登记业主本人在场时，经 registerAutonomyProvider/registerAutonomyKind 生成修缮候选，进 npcDecision；缺料只向同地、有公开报价库存的真实卖家买，付本人钱；走 facilityRepairMaterials、holdWorks/settleWorks、completeFacilityProject；做满工时才恢复。损耗按 world/meta/rules.json facilities.wear 五年参考寿命（暂定）。测试 tests/building-maintenance.test.mjs。

## 主会话审出的差距（本卡要补）
1. 触发写死：只有 condition<60（已降级）才出候选。改为成本收益：比较"现在修"与"暂缓"的预期——维修成本（材料+工时机会成本）对比可避免的停工/降级损失（按该建筑服务收益与损耗速率推算到降级的时间）。这样会出现预防性维修，也会出现合理暂缓。可选项至少有：修、暂缓；若现有原语支持，再加缩小经营或转让/关门的出口（不支持就写明缺什么、归哪张卡）。
2. 写死上限：`if(quantity>20)return []` 无依据，删除或改为从业主预算/搬运能力派生（负重见 carry.mjs）。
3. 噪声与差异：拖延倾向因人而异，决策带噪声（05 §5.7，种子抽签）；允许个别业主拖到停用，但不允许整类设施漏出候选。
4. 没有产权人的集体建筑（学堂、驿站）归 K10，不在本卡处理；本卡只确认它们不被误当私产修。
5. 不降低天气/余数损耗来掩盖候选缺失。

## 手算锚点
零噪声：维修成本7、可避免停工损失10 → 修，净收益3；成本12 → 暂缓占优。完工只扣一份材料/工钱；重放不重复修。

## 验收
C；逐文件：facilities、repair、m1-repair-learning-preconditions、npc-autonomy、shop-restock、building-maintenance、新增 s5-law-maintenance。本卡独占 world/meta/rules.json 的 facilities 维护段。

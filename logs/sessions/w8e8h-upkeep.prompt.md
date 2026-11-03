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
限时：150 分钟（到 140 分钟时停手写交接）。

# W8-E8 第八轮：一季之后店铺不该集体关门

第七轮已提交（65f3ee6b）。主会话在沙箱外用 3/10 租率复跑了 s5-playthrough（1819 秒），结果：
- 租田、收割、售粮、清租全部通过；
- 失败在 tests/s5-playthrough.test.mjs:318："no accessible existing bank with a current or forthcoming keeper"，候选 bld_hw_post、loc_bs、bld_bs_office。

## 问题
前几轮已经观测到三件事：
- 青灯酒馆第 99 天（分钟 142560）因损耗停用；
- 学堂一季后停用；
- 驿站柜面也进不去。

一个活着的世界里，店主会修自己的店，三个月内多处营业建筑接连关门不真实。按 docs/产品原则.md，"世界真实运转"不能靠测试绕路。所以这次不要换第三个柜面去凑，先查清根因。

## 要做
1. 诊断（临时脚本，用完删）：
   - 对推进一季中停用的每座营业建筑，列出：condition 随时间的曲线、损耗速率的来源（数据还是代码，写到文件:行）、业主是谁、业主钱数、业主有没有维修动作。
   - 查 repair 模块和离屏生活（offscreen life、npc-schedule）里，NPC 业主自主维修是否存在、是否接通。
2. 按根因修：
   - 业主维修缺接线：经已有 repair 路径和 npcDecision 接通业主自主维修，费用真实从业主钱袋或账户出，材料按现有规则，不写死"总是修"。
   - 损耗速率本身离谱（例如普通营业不该三个月就毁）：查 docs/架构设计 与 world 数据里的设计依据，按依据修数据或派生公式，写出计算。
   - 两者都有就都修。
   - 若真实原因是业主没钱修、合理倒闭：如实保留，报给主会话。
3. 修好后复跑 s5-playthrough，走到钱庄 → 存单 → 完整导出导入重放。
   - 完整重放的体积问题另一张卡 W8-E10 已修（主会话稍后合并），本树没有那个修复；若重放仅因体积失败，如实记录即可。

## 测试
- 第七轮列表全部重跑，另加 repair、npc-schedule、s3-offscreen-life、business 相关测试。
- 新增回归：一座有业主、业主有钱的营业建筑，推进一季仍在营业，或已被修过，带手算锚点。
- 金快照若变，重做字段表（覆盖 W8E8-golden-table.md），不要重生成。

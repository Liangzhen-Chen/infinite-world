【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3df-difficulty（A3 收口第 3 步 e：难度从世界本身派生）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3DF（分支 t-a3df，自 a3a）。先读 docs/产品原则.md（二.6 难度来自世界本身：不按玩家等级缩放）与 docs/架构设计/06-动作层与开放动作.md §6.7，以及 docs/架构设计/修订记录.md 末节“2026-10-23 主会话”第 2 条。

目标（一句话）：开放提案的检定难度 = 基础(原语族×目标类) + 目标抗性 + 幅度比加值 + 情境(±5，须理由)，目标越硬、越有敌意、越警觉，请求越接近上限，实际检定越难；预览和提交用同一个值并写进回执的分项理由。

现状（规划核实，行号请复核）：server-plugin/action-limits.mjs:75–81 只有来源基础值、无近邻 +2、情境；primitives-runtime.mjs:701–702 又映射检定档并借 context 补差；primitives-checks.mjs:31–42 已有对抗适应加值和固定档校验。
主会话定的规格：
- 幅度比 r = 请求幅度 ÷ 该原语按 §6.7 派生的上限；超过上限先裁剪并返回裁剪原因（沿用现有裁剪），再按 r 取加值：r≤1/4 加 0，≤1/2 加 1，≤3/4 加 2，≤1 加 3。多效果时取最大者并在理由中列出每项；上限为 0 的效果直接拒绝（带原因），不做除法。
- 抗性只读服务器上的现有状态数据：物件——材质硬度（rg 查材质/硬度类字段）；NPC——灵智/意志类属性与对玩家的立场（敌意越深越难，立场档位映射写成常量并说明）；有守卫职责者——警觉/在岗状态。某类目标没有现成数据时：不默认为 0，回执写明“该类抗性无数据”并在报告中列出缺口（数据补齐归后续卡），该项不计入。
- 对抗检定沿用已有对手属性/技能 + 适应加值路径，不能重复计抗性。
- 服务端派生的难度与玩家 context(±5) 分开，不能借放宽公共 difficulty/context 校验绕过保护；提案不能自报抗性或上限。
- 导出一个只读的“来源上限派生”函数（供后续“先查后提”卡调用），不让别处复制第二套公式。
可改：server-plugin/action-limits.mjs、primitives-runtime.mjs、primitives-checks.mjs；tests/a3-limits.test.mjs；新增 tests/a3-derived-difficulty.test.mjs。锁定：primitives.mjs、open-actions.mjs、action-boundary/rejection/text、npc-relations、world-events、mark-reactions、engine.mjs、transport/obligation/credit/finance-bank 及其余文件（有其他卡在改）。若必须改锁定文件，先停下报告最小接点。
验收：node --test --test-isolation=none tests/a3-limits.test.mjs tests/a3-derived-difficulty.test.mjs tests/checks.test.mjs tests/a3-policy.test.mjs；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），失败只允许三个既有项（阶段门槛、r13、R2 137）。
新测试须覆盖：固定来源换不同硬度/立场目标难度随之变化；同一目标请求跨越 1/4、1/2、3/4 边界难度逐档上升；超限被裁剪且有原因；上限 0 拒绝；多效果取最大并列出分项；伪造抗性/上限字段被拒；预览与提交难度一致且真实改变检定成败分布；对抗适应、context±5、物品阶上限与守恒保持；同一来源的上限不随玩家等级抬升。
不调用真实模型。预计规模：中（约 400–700 行含测试）。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。题集与判分器冻结。不为测试新增生产接口或世界内容；前提用真实动作。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、缺数据的抗性类别、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3df-difficulty.final.txt。

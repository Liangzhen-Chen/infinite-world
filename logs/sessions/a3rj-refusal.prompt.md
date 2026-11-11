【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 a3rj-refusal（A3 收口第 2 步 c：每个拒绝都给世界内原因与可行下一步）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3RJ（分支 t-a3rj，自 a3a）。先读 docs/产品原则.md（二.3 尊重想象力：拒绝要给世界内原因与降级做法；二.4 真实不粉饰）。

目标（一句话）：玩家在 A3 的任何业务拒绝里（预览、提交、构造器界面）都能看到世界内的原因、缺什么、以及经当前条件核对过、真能做的下一步；失败从不被写成成功，程序故障也不伪装成世界拒绝。

现状（规划核实，行号请复核）：A3 可达的拒绝出口有 6 类——
1) 注册动作 ActionRejection → action-boundary.mjs:9–28：有原因与 repair，但默认 repair 只是“先满足当前条件”，缺具体降级；界面可能只显示原因。
2) 开放预检/原语 PrimitiveRejected → open-actions.mjs:112–193、primitive-policy.mjs:4–5、primitives.mjs:190–196：多为单独 reason 或直接抛出，action-boundary 只接 ActionRejection。
3) 待澄清/降级 → open-actions.mjs:133–160、175、195（needs_entities/needs_slots/needs_alternative）：只部分含 mark；普通缺槽/歧义无统一下一步；mark.available 只查配置不查实际能力。歧义仍须给候选，不擅猜。
4) 争夺失败回执 → primitives.mjs:240–251：有 reason、零 applied，但 alternatives 为空。
5) 查询阻断 → action-affordances.mjs:215–228/264：permission/blocked 只有原因（本卡只定义统一形状，查询接入归后续卡 D，本卡不改 action-affordances.mjs）。
6) 领域模块里的普通 Error（domain/environment/items 已由 a3p-domain 改为 ActionRejection，可参考其做法）。
要做：在现有边界统一成一个拒绝投影，形状为既有字段 {reason, missing, repair, alternatives, fallback}（保留错误码、索引、原意、零效果/回滚）。repair/alternatives 必须针对本次失败、且对当前状态核对过可预览（例如：补槽、降低数量、分阶段、先靠近、先征得同意、请有能力的人代做、留下带标签的痕迹 mark——只有实际能做时才给 mark，不自动留下）。构造器（extension/action-builder.mjs:120 一带）把原因、缺项与可点选的下一步显示出来，不只是错误文字。TypeError、接点缺失等内部故障继续显式报错，不得捕获所有 Error。
可改：server-plugin/action-boundary.mjs、action-rejection.mjs、primitive-policy.mjs、primitives.mjs、open-actions.mjs、action-text.mjs；extension/action-builder.mjs；新增 tests/a3-refusal-contract.test.mjs；必要时同步受影响的既有测试（逐处写依据）。锁定：action-router.mjs、action-affordances.mjs、engine.mjs、storage.mjs、interactions/effects/magic、transport、obligation-runtime、credit、finance-bank、quest-board、festival、domain-rules 及其余文件（有其他卡在改）。
验收：node --test --test-isolation=none tests/a3-refusal-contract.test.mjs tests/a3-policy.test.mjs tests/a3-transaction.test.mjs tests/a3-open-actions.test.mjs tests/a3-builder.test.mjs，最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui）确认失败只有三个既有项（阶段门槛、r13、R2 137）、todo 仍为 75。
新测试须覆盖上述 6 类中 1–4 与 6 的出口及序列中途失败：每个推荐的下一步都能预览，或明确指出它仍缺的前提；拒绝零副作用、原意不丢；权限与隐私不放宽（不得在拒绝里泄露玩家不知道的实体或状态）；注入程序故障仍抛错。浏览器类测试（a3-builder-ui）由主会话沙箱外跑。
不调用真实模型。预计规模：中到大（约 500–900 行含测试）；接近时限先提交可通过部分并写交接。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。题集与判分器冻结。不为测试新增生产接口或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3rj-refusal.final.txt。

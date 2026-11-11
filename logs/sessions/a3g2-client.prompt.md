【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

卡 a3g2-client（回合契约 2/3：客户端与试玩运行器接门禁 + 零裁决强制补跑一次工具阶段）。工作区 F:/dnd-wt/A3G2（分支 t-a3g2，自 a3a，已含 1/3 服务端门禁）。先读 docs/产品原则.md、docs/架构设计/修订记录.md 末条“回合契约”、F:/dnd/logs/sessions/turn-design.final.txt（第 1、2 节中客户端/runner 部分）与 F:/dnd/logs/sessions/a3g1-gate.final.txt（服务端返回：pending + safeText + candidates；world_turn 需 reviewId）。
先调研现成方案（用户要求：难点先看现成做法）：(a) DeepSeek Chat Completions API 是否支持 tool_choice="required"/指定函数、JSON Output、strict 函数调用（查官方文档，可联网读文档，不读 secrets）；(b) SillyTavern（F:/dnd/SillyTavern，只读）扩展能否为一次生成设置 tool_choice 或改用结构化输出，或扩展能否自行发起一次受控的工具阶段请求（复用宿主连接设置，不新增密钥存储）。把结论（支持与否、文件/文档出处）写进报告第 1 行，按结论选实现路径。
要做：
1. extension/runtime.js：ensureReviewTurn / historyInterceptor / refresh 注入服务端给的回合事实与候选（不把整段 scene 当全知白名单）；afterReply 在审查通过前隐藏待审正文（宿主若在生成开始就流式显示，须在生成开始时隐藏或禁用该路径流式），pending 时发布 safeText 模板与候选（可点选），不把原稿写入可见正文、下一轮历史、索引或编年史；act 将界面行动回执绑定异步叙述。
2. 零裁决补跑（主会话设计决定）：服务端返回 pending 且玩家原文不是场外时，编排层让模型补跑一次工具阶段，最多一次；补跑这一步按调研结论使用强制工具调用（tool_choice required / 指定函数），并提供一个显式的“本回合无行动（纯闲聊/纯观察）”选择以免逼出假动作；补跑仍无正式裁决则保留 pending 模板。补跑必须在 review/reply 封口前完成；延迟与额外调用计入报告。
3. tools/playtest-runner.mjs：runPlaytest 与客户端消费同一门禁结果与补跑逻辑；删除 canCommit=false 时仍用 originalReply 写 history/chat 的分支（原稿只留诊断）；模型工具消息仍按真实已执行回执保存。tools/deepseek-client.mjs 若需支持 tool_choice，最小改动并保留计费护栏。
可改：extension/runtime.js 及其拆出的同目录模块、tools/playtest-runner.mjs、tools/deepseek-client.mjs（仅 tool_choice 支持）、相关测试；新增 tests/turn-contract-client.test.mjs。锁定：server-plugin/（服务端已由 1/3 完成；若需接口变化，停下报告）、server-plugin/consistency-review.mjs（3/3 在改）、prompt/（静态提示 ≤10593，当前 10587）、题集、判分器、world/。
验收（每个文件单独运行）：tests/turn-contract-client.test.mjs（离线：用 tests/fixtures/turn-gate-real-replies.json 三例，桩模型首轮零调用 → 触发一次强制补跑 → 补跑给出正式调用则结算后叙述，补跑选“无行动”或仍无裁决则发布模板；原稿不进历史）、tests/runtime.test.mjs、tests/playtest-runner.test.mjs、tests/m3-consistency-integration.test.mjs、tests/a3-builder.test.mjs；浏览器类（tests/m3-consistency-browser.test.mjs、a3-builder-ui）在沙箱内 EPERM 的列出，由主会话补跑。
不调用真实模型（主会话之后真实复验）。预计规模：中到大。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3g2-client.final.txt。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 a3rg-regress（a3a 收口：6 个相对 master 的回归）。工作区 F:/dnd-wt/A3RG（分支 t-a3rg，自 a3a ccc2b466）。先读 docs/产品原则.md。master 上全部通过、a3a 当前单独运行失败：tests/arch-metrics.test.mjs、tests/environment-advance-selection.test.mjs、tests/generation.test.mjs、tests/m3-language.test.mjs、tests/review-continue.test.mjs、tests/system-map.test.mjs（各 1 个用例）。多半来自最近合入：回合契约（extension/turn-contract.mjs、server-plugin/consistency-*.mjs、review/gate）、意图构造器（server-plugin/action-constructor.mjs）、取水（server-plugin/water-volume.mjs、environment.mjs）、模型投影压缩（extension/tools.mjs）。逐个单独运行定位根因：新模块未归层就按职责在 tools/arch-layers.mjs 归层（不抬基线）；系统地图缺新订阅者/模块就补解析与登记；其余判断是产品回归（修产品）还是测试期望因已审批设计过期（按设计改并逐处写依据，见 docs/架构设计/修订记录.md 第 3 条回合契约）。不放宽断言、不删测试。
验收：上述 6 个文件逐个单独运行通过；再跑 tests/turn-gate.test.mjs、tests/claim-review.test.mjs、tests/turn-contract-client.test.mjs、tests/draw-water.test.mjs、tests/a3-intent-proposal.test.mjs。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不改 docs/（system-map 生成物除外）。不再启动其他会话或子代理。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3rg-regress.final.txt。

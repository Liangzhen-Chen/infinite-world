【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 old-tests（a3a 旧回归：过期测试期望、工具接线与金快照重生成）。工作区 F:/dnd-wt/A3O4（分支 t-a3o4，自最新 a3a，已含全部产品修复）。根因分析报告：F:/dnd/logs/sessions/older-rca.final.txt（组号同下）。先读 docs/产品原则.md。
按报告逐组处理（每组先复现确认仍失败；已因其他修复而通过的组只报告不改）：
- 组10：白石镇已按审批新增镇长（13ac0697），人口 305→306、m5-authority-content/r06-bs-market/r06-bs-skeleton 仍断言无镇长或空执法人。按原批次冻结人口与事实断言，另单独核验新增镇长、现任与权限的审批；保留旧 152/294 人群、户籍和资产约束。文件：tests/npc-depth-lq、npc-depth-sb、npc-depth-wt、m5-authority-content、r06-bs-market、r06-bs-skeleton。
- 组11：world/design/w1-baishi-market-depth.mjs:111 的 reviewContext 读当前 governance，使 T92 旧审批指纹因后加的镇长自然不同（r06-bs-market.test.mjs:19、:38）。用 T92 冻结版本的上下文复核旧凭证，另组合验证 A3 增量审批。禁止覆盖旧凭证、机械重算指纹或整批重审。
- 组13、14：tests/action-registry.test.mjs:112 core:site.disarm 新增 tool 槽（a3qy 已为声明 tool 槽的动作开放玩家指定工具）；:143 期望普通 Error 字符串而现为 ActionRejection。按新设计更新精确期望，继续拒绝所有未声明槽位，按 ActionRejection、code 与原完整 message 断言，保留“不能代填同意”的意图。
- 组16：tests/holdings-writers.test.mjs 静态扫描把整模块记录都视为持有来源，误报 obligation-runtime.mjs:371（summon_contract）与 quest-board.mjs:162（quest_escrow）。收窄扫描对这两个已证非持有路径的匹配，保留真正 contract/身份写入拦截。
- 组17：tests/arch-metrics.test.mjs 报 server-plugin/action-time.mjs、routing-programs.mjs 未归层，并检查今天新增的其他模块（rg 新文件）。在 tools/arch-layers.mjs 按实际职责归层，不抬逆向依赖基线。
- 组18：tools/system-map.mjs:223 只认 \w+ ID 与 on: 箭头，不支持 mark-reactions.mjs:46 的连字符 ID 与方法式 on。补解析器支持，并把新模块归入系统；不绕过订阅者完整性检查。之后运行 node tools/system-map.mjs 生成 docs/system-map.html/json（这两个生成物可改），并跑 tests/system-map.test.mjs。
- 组8（最后做）：推进金快照。其他组完成后，用 UPDATE_ADVANCE_GOLDEN=1 跑 tests/advance-registry.test.mjs 重生成 tests/fixtures/advance-registry-*.json；不更新前先输出新旧差异摘要，逐项说明每处差异对应的合法来源（如已审批新增人物/考官/镇长的作息与出行、今天修复的序号与工位账本），无法解释的差异不得更新、停下报告。保留历史服务分支与重放断言。差异说明写到 F:/dnd/logs/sessions/old-tests.golden.txt。
可改：上列测试文件、tests/fixtures/advance-registry-*.json、world/design/w1-baishi-market-depth.mjs（仅审批复核上下文读取）、tools/arch-layers.mjs、tools/system-map.mjs、docs/system-map.html 与 docs/system-map.json（生成物）。锁定：server-plugin/、world/ 其余文件、其他 docs/、题集与判分器。
验收：node --test --test-isolation=none 上列每个测试文件全部通过（npc-depth-* 中 spawn 类 EPERM 列出，由主会话补跑）；tests/advance-registry.test.mjs、tests/arch-metrics.test.mjs、tests/system-map.test.mjs 通过。
不调用真实模型。预计规模：中。本卡名 old-tests。
通用：改测试只按设计对齐，保留断言意图，逐处写依据；不删/跳过测试。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（每组处理结果、改动文件、验收结果、金快照差异是否全部可解释），同样写到 F:/dnd/logs/sessions/old-tests.final.txt。

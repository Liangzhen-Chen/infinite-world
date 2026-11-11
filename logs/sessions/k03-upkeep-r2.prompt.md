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
限时：90 分钟（到 80 分钟时停手写交接）。

K03 返修一处（主会话审 diff 后）：

问题：`defer_maintenance` 被做成一个真实的自治行动候选。结果店主每天都"执行"一次暂缓，记成行动、任务、亲历发展和记忆（金快照里林穗 9 天 9 条"比较维修成本与服务损失后暂缓维护"）。现实中"这次不修"不是一件要做、要记住的事；它还会以 utility 0 挤掉其他排在后面的日常候选，并让记忆流和存档每天膨胀。

要改：
1. 不再向自治候选注册或返回 defer_maintenance 行动（删掉 registerAutonomyKind('defer_maintenance') 与 candidates 中的 defer 项）。暂缓 = 不选修缮：修缮候选不划算时，npcDecision 给出非 agree 自然被滤掉，或者干脆不生成修缮候选。maintenanceOptions 里保留两个选项与比较依据，供解释与测试读取。
2. maintenanceDelayPermille 不需要靠"暂缓行动"写入；保持派生（固定种子键可重算），只有真正开工修缮时才保存，或干脆不存。
3. 测试改成断言"没有通过决策的 repair_building 候选 / 选择结果为暂缓（options 比较）"，不得放宽：手算锚点成本7选修、成本12暂缓保持严格；有噪声的分组检查保留。
4. 重做金快照差异表 K03-golden-table.md（预期林穗的 22 个暂缓字段消失；如仍有差异逐项解释）。

按原卡验收逐文件重跑受影响测试，汇报同原卡。

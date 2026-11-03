【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

续做 a3qy-inspect（同一工作区 F:/dnd-wt/A3QY）。你停下报告得对。主会话核对了所有权，以下接点现无其他卡在改，全部授权：
- server-plugin/environment.mjs:115、agriculture.mjs:448：向 useTool 传入玩家指定的工具（来自槽位或 means.tools）。
- extension/tools.mjs:145 modelActionCatalog：投影时保留实体卡（状态摘要、可施加原语与上限、相关动作、受阻原因），静态提示仍不得超过 10593（a3-tool-surface 检查）。
- world/actions/core.json（及 tools/build-action-registry.mjs 的现有生成/校验流程）：给环境机关与私田播种/收获等需要工具的注册动作声明可选 tool 槽；这是动作目录配置，不是世界事实。
- server-plugin/action-router.mjs：仅把提案 means.tools / tool 槽传给上述动作的槽位抽取，不改评分与消歧规则。
其余按原卡实现与验收（原卡全文在 F:/dnd/logs/sessions/a3qy-inspect.body.md）。仍锁定：action-limits、action-rejection、action-boundary、primitives*、open-actions、npc-relations、world-events、mark-reactions、activities、magic、law、contracts、npc-growth、npc-autonomy、subjective-view、state-notices。
注意：工作区已加 SillyTavern 链接（试玩/分词器测试依赖）。
最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3qy-inspect2.final.txt。不再启动其他会话或子代理。

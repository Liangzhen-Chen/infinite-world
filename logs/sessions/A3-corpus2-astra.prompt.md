【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

你是独立出题者（续）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考）。独立性要求同前：不得读 server-plugin/、extension/、tests/ 的代码与测试；只读 docs/架构设计/（06-动作层与开放动作.md 的原语表与 world_propose 提案格式、05-统一模型.md、附录A）、docs/待用户确认.md、world/。
任务：为 F:/dnd/logs/sessions/a3-intents-v2.json 的 120 条意图逐条补字段 proposal：一个“合格的意图解析器（LLM）”会提交给引擎的结构化提案，严格按 06 章 world_propose 的提案形状与原语名（如 {intent, effects:[{op:'transfer'|'vital'|'learn'|'fact.set'|'holding.open'|'move'|...,  ...参数}], consent?, target?...}）；需澄清的写 proposal:null 并给 clarifyNeed；元游戏/违规类照实写解析器可能提交的越界提案（让引擎去拦）。参数用 world/ 中真实存在的 id（地点、人物、物品、技能、配方）；找不到合适对象时如实写出（如不存在的目标），以考验引擎兜底与拒绝。不改 expected，除非发现原判定与设计明显矛盾（改动须在 a3-intents-v2.md 记录理由）。
直接改写该 JSON 文件；最后回复 ≤100 字：补全条数、改了几条 expected 及原因。

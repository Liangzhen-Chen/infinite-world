【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3op-openpath（A3 收口：真实试玩暴露的“LLM 绕过引擎”缺口）。项目《无限原野》：规则引擎是唯一真相，LLM 只能提议、叙述在结算之后。工作区 F:/dnd-wt/A3OP（分支 t-a3op，自 a3a 325bff49）。先读 docs/产品原则.md（一.3、二.3、二.4）。
真实试玩证据（DeepSeek + SillyTavern 真实提示栈，a3_whimsy 10 回合，报告 F:/dnd/logs/sessions/a3-playtest/whimsy/真实试玩.json，results[0].turns[i].calls / narration）：
- 第 7 回合玩家要在青灯酒馆墙上刻“地湿慢走”的记号：模型零工具调用，自行叙述“林穗说这墙是我租的，我不点头”并写“墙面上只多了那道指甲划出的浅痕”——NPC 决定与物理痕迹都没有经过引擎。
- 第 4 回合玩家提出世界规则不允许的要求（让池水立刻变灵药）：模型零工具调用，自己写拒绝理由，没有引擎拒绝回执。
- 第 2 回合模型调用 world_actions 查询渡口，返回 actions:[]、blocked 原因“当前没有可直接施加的开放原语来源”、fallback:null——模型拿不到任何可提交的开放路径。
- 一致性审查（consistency 角色 13 次调用）没有拦下“叙述声称状态变化/NPC 决定，但本回合无对应引擎回执”。
对照：给玩家的构造器 extension/action-builder.mjs:12 总会补上 open:proposal 与 open:leave_mark；给模型的 world_actions 投影（extension/tools.mjs:145 modelActionCatalog 一带、server-plugin/action-affordances.mjs）不会。静态提示已在硬上限 10593，不得增加。
要做：
1. 模型查询总能拿到开放路径：world_actions 结果在没有合适注册动作或对象受阻时，也列出 open:proposal（提交结构化提案，含 submission 槽说明）与 open:leave_mark（当前确实可留痕时才 available:true，否则给出缺项），与构造器同一来源；拒绝投影里的 fallback 在可留痕时不应为 null（查 refusal 投影为何此处为 null，修根因）。只改动态返回，不加静态提示。
2. 一致性审查补两类检查：叙述中出现本回合引擎回执里没有的状态变化（物品/痕迹/位置/钱物/记录），或叙述替 NPC 作出同意/拒绝等决定而本回合没有对应的引擎决策——判为不一致并按现有重写/拒绝流程处理。rg consistency-review / consistency-evidence 找现有审查器与证据结构，复用现有判定框架，不另起一套。
3. 修场景 tests/playtests/a3_whimsy.json 的前提错误：玩家开局没有陶壶——在“净化装壶卖水”之前加一回合用真实交易购买已有存货的容器（rg world/ 核对谁卖、价格，确保开局钱够），断言保持验证引擎结果；其余回合断言若写死了工具名，确认与实际网关记录一致（open:proposal 经 extension/tools.mjs:140 记为 world_propose）。
验收（离线，不调用真实模型）：node --test --test-isolation=none tests/a3-tool-surface.test.mjs tests/a3-builder.test.mjs tests/a3-affordance-state.test.mjs tests/a3-refusal-contract.test.mjs tests/playtest-runner.test.mjs，以及 rg 找到的一致性审查测试文件；新增机制测试覆盖：(a) 渡口这类无注册动作的对象查询结果含 open:proposal 与（可留痕时）open:leave_mark；(b) 审查器对“叙述有痕迹/NPC 决定而回执无”的回合判不一致、对有回执的回合判一致；静态提示仍 ≤10593（a3-tool-surface 检查）。
可改：extension/tools.mjs、server-plugin/action-affordances.mjs、server-plugin/action-rejection.mjs（仅 fallback 根因）、一致性审查相关模块与测试、tests/playtests/a3_whimsy.json、新增测试。锁定：题集、判分器、world/、docs/、其余模块。
不调用真实模型（主会话之后跑真实试玩复验）。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程（另有 3 路扫描在跑），--test-isolation=none，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3op-openpath.final.txt。

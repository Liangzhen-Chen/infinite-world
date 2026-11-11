【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/；可读 tools/a3-setup/*.mjs 与 tools/a3-score.mjs 的 setup 加载部分，只为对照字段契约。
第 11 轮新增的 111 题（A3V2-121 起）有 76 题 setup 未满足，多数是不合加载器契约，逐题原因见 F:/dnd/logs/sessions/a3-score-v4a.json 的 setupUnmet。典型：①history 41 题“invalid history identity, verb, time or corpus premise source”——如 124 用中文“本柜镐库存”当资源、自造 verb；对照已通过的旧题（如 A3V2-043）写法：id、verb（用加载器接受的动词）、at、source{kind:'corpus_premise',row}、actor/observer、subject 等用世界真实 ID；②instances 21 题“unsupported instance template or field”——如 148 用 template:'person' 现场造人；加载器只从世界已有人物/物种定义实例化：优先改用世界中真实存在、符合原文的人物（如学徒、孩童在 world/people 中找），确无合适者在复审记录列为“需要新增世界人物”交主会话；③objects 11、permits 11（时窗）、accounts 6、quotes 3、itemInstances 6、knowledge 7 等按 a3-intents-v2.md“加载器待支持字段”表的形状改正。
不改 intent 原文、id 与 expected 的意图；只修 setup/前提写法使之可加载、且忠实原文。改不了的（需要新的原生接点）逐题列入 a3-intents-v2.md 新段“第11轮待支持”。直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md。回复 ≤100 字。

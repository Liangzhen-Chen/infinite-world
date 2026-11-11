【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 A3-B 第 4 轮（实体解析缺陷，主会话已定位）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3B（分支 a3b）。先 git 不可写——主会话已把 a3a 最新成果同步进来（若未同步，按现状做，接口以 a3a 为准）。
主会话用独立语料实测 world_propose 预览：提案 {effects:[{op:'transfer',resource:'item_ration',from:'self',to:'sink:consume',qty:1},{op:'vital',target:'self',type:'body:satiety',delta:30}]} 返回 status:'needs_entities'，ambiguities 中 effects.0.from='self'、effects.1.target='self' 的 candidates 为空；提案 target:'npc_hw_xuling'（准确的人物 id）同样 needs_entities 且候选为空。
要求（依 docs/架构设计/06-动作层与开放动作.md 实体解析与路由）：
1. 'self'/'me'/'我'等自指一律解析为提案发起者（actor）。
2. 精确 id 不经模糊匹配，直接解析为该实体；该实体不在场、不可感知或不存在时，不返回 needs_entities，而返回带具体理由的拒绝（not_present / not_perceivable / unknown_entity），越界类意图也应明确拒绝而非澄清。
3. 只有真正有歧义（多个候选）时才返回 needs_entities 并给出候选。
补测试（tests/a3-*.test.mjs）。跑 tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3B-sol4.final.txt；回复 ≤120 字。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-E 第 4 轮（判分口径细化与差距归因）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
1. 签名口径：tools/a3-score.mjs 的 signatureMatches 要求“已提交效果的原语集合”与 expected 完全相等；引擎派生的成本/时间/体力等效果（非提案所请求）不应计入签名。按 docs/架构设计/06-动作层与开放动作.md 的“签名”定义，改为比较“提案所请求、经路由采用的效果”的原语集合与限定词；派生成本效果若有标记（如 cost/derived/actedAs 字段，读回执结构确认）则排除；没有标记就在报告中指出需要引擎补标记，不要靠猜。在 tests/a3-score-self.test.mjs 加对应自检（含：有派生成本仍判签名正确；请求了错误原语判错）。
2. 用 tests/fixtures/a3-intents-v2.json 重跑，输出 F:/dnd/logs/sessions/a3-score-v2d.json，并写 F:/dnd/logs/sessions/a3-gap-v2d.md：按根因聚类（例如：未注册对应动作、路由映射错、实体解析、感知/在场、能力/前置、裁决幅度、兜底未产生实体、构造器缺路径、setup 未满足、语料预期存疑），每类条数、代表条目 id、建议归哪张卡（A/B/C/D）。
跑：a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol4.final.txt；回复 ≤200 字：各指标、聚类前五类及条数。

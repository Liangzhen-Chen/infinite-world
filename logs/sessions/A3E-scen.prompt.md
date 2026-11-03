【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

卡 A3-场景与推演（工作区 F:/dnd-wt/A3E，分支 a3e，已同步 a3a）。项目《无限原野》Node 规则引擎。依据 docs/A3-退出审计.md（本工作区内，逐条列出了缺口、证据与补齐方式）与 docs/架构设计/ 引用章节。规则：功能走公开动作入口（world_act/world_propose/HTTP 与构造器），断言真实状态、时间、钱物、账本守恒与回滚；不往 state 塞结论；不改语料 expected；不删/放宽既有断言；世界内容只写 world/。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程。跑本卡相关测试、tests/a3-*.test.mjs（保持仅阶段门槛与浏览器 EPERM 已知失败）、CORE；静态提示 ≤10593。报告写清：逐项完成情况、对应测试名与断言、偏离与未解决。回复 ≤150 字。 报告 F:/dnd/logs/sessions/A3E-scen.final.txt。
按审计“场景与推演”：①新建 tests/a3-f5-f6.test.mjs：F5（开发指南 11.3“用净水术卖干净水”：施法净水→真实实物交易成交，账本守恒）、F6（有/无见证的后果链：法律立场、NPC 记忆、传闻），走公开提案/构造器入口，同 seed 事实等价；需要新空间/规范传播的部分归 S4/S6，逐条写进 docs/A3-后续阶段登记.md 的“场景”段（不要假装通过）。②a1-lt-scenarios 的 L5 TODO 落成真实断言；L/T/S/F 场景与开发指南 11.3 逐项映射成表（写入 docs/A3-退出审计.md 附录），缺的补测试。③推演复跑 P1–P9：按审计列的 run-005 E15、run-006 E19/E13/N3/E5/N7 与争夺/制造、run-007 E17/E6/E18/E16、兜底、补丁/RX、创建兼容，在 tests/probes/ 或现有推演工具上复跑并把结果汇总写入 docs/事件推演测试.md 的 A3 段（每项：输入、结果、是否通过、证据测试名）；probes/run-001.test.mjs 中的 TODO 不能当复跑证据。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

卡 A3-原语与仪式（工作区 F:/dnd-wt/A3C，分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。依据 docs/A3-退出审计.md（本工作区内，逐条列出了缺口、证据与补齐方式）与 docs/架构设计/ 引用章节。规则：功能走公开动作入口（world_act/world_propose/HTTP 与构造器），断言真实状态、时间、钱物、账本守恒与回滚；不往 state 塞结论；不改语料 expected；不删/放宽既有断言；世界内容只写 world/。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程。跑本卡相关测试、tests/a3-*.test.mjs（保持仅阶段门槛与浏览器 EPERM 已知失败）、CORE；静态提示 ≤10593。报告写清：逐项完成情况、对应测试名与断言、偏离与未解决。回复 ≤150 字。 报告 F:/dnd/logs/sessions/A3C-prims.final.txt。
按审计“交付物”表补三项：①K2/K6/M4 三表合一：K6（效果）与 M4（法术原语，magic-primitives）仍各自直接 apply——统一进同一原语事务与回执（K2 保留物理参数），补三来源同输入等价与失败整体回滚测试；②档位与反噬：按 06 §6.6 补“动作族反噬表”（现 critical 统一×1、无额外），逐档（含 rite 行）测试；③仪式动作形状（13 §13.5）：action-rite 未消费 culture、costs.vow/discipline、interrupt.status——补消费者与字段测试。

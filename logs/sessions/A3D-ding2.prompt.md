【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-丁2（丁收尾 + 法律类错拒）。工作区 F:/dnd-wt/A3D（分支 a3d，已同步 a3a）。上一轮交接 F:/dnd/logs/sessions/A3D-ding.final.txt（开头与“下一步”段列了未完项）。项目《无限原野》Node 规则引擎。依据 F:/dnd/logs/sessions/A3-owner-plan.md 与 docs/架构设计/ 引用章节。最新逐条结果 F:/dnd/logs/sessions/a3-score-v2q.json；a3a 合并后整组测试输出 F:/dnd/logs/sessions/a3a-tests-v2q.txt（562 过 / 21 败）。规则：原生写入 + 真实消费者 + 加载器三件齐；只动本卡负责模块，共享接线最小登记并在报告逐处列出；不改语料与判分口径；不造原文没有的权利、同意、任职者或成功。“过期断言”指早先加载器自检断言“该接点缺失→记 unmet”，而本卡或兄弟卡已实现该接点：改为断言新的真实行为（正例 + 原有的反例保留），每处写依据；不得删测试或只放宽。验收：本卡负责的失败测试全部转绿，负责题号逐条给出路由/签名结果与归因。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关模块测试与 CORE；静态提示 ≤10593。
①主会话授权本卡修改 server-plugin/transition.mjs：补柜台遗产偿债的账户提供者消费者（测试“N/O: estate repays an existing loan from its owned counter...”）。②快照存款支取、快照质押赎回、快照罚款缴纳接回既有时间推进（5/5/10 分钟，按原动作口径）。③赎回返回值兼容：pledgeReturned 恢复目录 ID，另列 instance 原件 ID。④过期断言：accounts、cases、documents、obligations 四个加载器自检。⑤错拒：051 053 056（E-ACTION-CASE，案件已由加载器建立却仍报未登记）、052 055 058（E-ACTION-PRECONDITION）、054（E-TRANSFER-ACCOUNT）——查动作是否读到原生案件/账户，修消费者。报告 F:/dnd/logs/sessions/A3D-ding2.final.txt；回复 ≤150 字。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 续卡 s407b-trial：主会话对卡点的决定 + 补完 S4-07

## 卡点决定（复演中的签约事实）
你遇到的 signingLawVersion 漂移：复演时 obligation-runtime 用"现行法典"的 digest 重算签约依据，而测试正确地要求"法律数据之后改变，复演仍得出原状态"（存档后游戏更新法律数据，重新载入不能改写过去签的约）。主会话决定的通用规则：
- **复演时，义务的签约事实（signingLaw、signingLawVersion、signingPlace、signingMinute 等 contract-state 的 signingFacts）一律取自原始记录的结果，不按现行法典重算。** 实现：原始运行在 reduce 结果里记录本次新建义务的签约事实（例如 result.signedObligations[id] = 签约事实，或复用现有的结果记录通道）；obligation-runtime 新建义务时若 engine.replaying 且记录里有该 id，就用记录值；没有记录（旧存档）时保持旧行为（重算），加版本标记区分，旧事件结果不变。
- 这是通用复演规则，不只针对罚款；不要在 law.mjs 里写罚款专用特判。之前两种修法（义务快照还原、同步 claims）放弃。

## 还要完成
1. 上面的修复，使 s4-trial 全过。
2. 原卡未恢复的 todo：a3-owner-ding 的四个 N/O 罚款用例、P/Q 同一收据与 P 来源链接、Q 当前经办/失能经办/legacy parties；a3-setup-institutions 的案件阶段用例；a3-precondition-receipt 的 native legal 52/58。做不完的逐项写原因（缺哪个生产者），不宣称恢复。
3. 玩家任职（玩家本人持有审理职位）时自行裁决的正向测试。
4. 「白石值房缺法典」：按 S4 设计决定 E 不猜规范数据——不要自己编法典内容；在汇报里写明缺什么（哪个地点、哪类法典条目），主会话登记为内容缺口。
5. tests/reputation-law.test.mjs 在 s4a 上 0/9：根因是 S4-06 起偷窃不再自动建案（D：立案才成案件）。按两步立案补真实报案与经办人本人受理步骤，保留原断言的声誉/法律意图，逐处说明。
6. 你在清单外改了 obligation-runtime 与测试 helper，可以；本卡授权继续改 obligation-runtime 与 contract-state 的复演接点。

## 验收
原卡验收全部；另 reputation-law 全过；affected-tests（node F:/dnd-tools/affected-tests.mjs s4a）里名字含 law、legal、case、fine、court、contract、obligation、reputation 的文件逐个跑，报 pass/fail（与 s4a 同文件对比，s4a 上就失败的单列）。浏览器测试 s4-justice-ui 若沙箱 EPERM 就写明，主会话外跑。
汇报（≤400 字）：复演规则实现要点、改了哪些文件、恢复/未恢复的 todo 及原因、命令与 pass/fail、静态 token、偏离与未解决。

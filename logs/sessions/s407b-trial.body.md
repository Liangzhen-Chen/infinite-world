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

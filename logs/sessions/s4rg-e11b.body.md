# 续卡 s4rg-e11b：修入会同意的死循环（生产缺陷），再恢复 E11 前提

主会话判断：你发现的是 S4-08 的生产缺陷——NPC 拒绝时给出的修复（"先付1文"）无法用任何真实动作满足，违反"拒绝要给可行修复"。授权你改 server-plugin/organizations.mjs（以及必要时 action-consent.mjs 的调用方式，不改其决策规则）。

## 设计（照此实现）
1. org_join / 商号入会增加可选参数 `feePayer`（'player' 或缺省为入会者本人）。feePayer='player' 时：入会费（charter.fee）与首期会费（若有）从玩家真实钱袋暂存/扣付；否决时退还给玩家；NPC 同意时的 cost 相应只计他自己要付的部分（替付部分为 0）。
2. 若玩家另付诱因（已有动作给钱、或承诺义务），organizationConsent 应把对方已收到的、与本次入会相关的真实补偿作为 reward/冲抵传入 requestContractConsent——只读真实已结转的转移或已登记义务，不读调用参数里的数字。若实现 1 后 E11 已可行，2 可以只做 1 的部分并在汇报说明。
3. 拒绝原因的修复建议要与能做的动作一致（例如提示"可由你代付入会费"）。
4. 旧复演：沿用 organizationConsentVersion，旧事件结果不变。
5. 新增测试（tests/s4-office-quests.test.mjs 或 organizations.test.mjs）：NPC 因费用拒绝 → 玩家代付后 NPC 本人同意入会、钱从玩家扣、否决时退给玩家；调用参数里写同意或写假补偿仍无效。

## 然后
E11 前提（tests/probes/run-001/e11.mjs 第 24 行）改为 `org_join(...member:m, feePayer:'player')`，去掉 consent:true；题目、预期和评分不改。E03/E06/E12/E14 的旧同意参数本卡不动，在汇报里各列一句它们现在是否仍能执行（只跑 s2c-run001r 看即可）。

## 验收
tests/s2c-run001r.test.mjs 5/5；organizations、s4-office-quests、s2c-succession、s2c-organization-dues、action-registry 各一次全过；`node tools/probe-score.mjs --run run-001` 无脚本异常、较基线退步 0；CORE 三件全过。
汇报（≤300 字）：改了哪些文件、实现要点、命令与 pass/fail、偏离与未解决。

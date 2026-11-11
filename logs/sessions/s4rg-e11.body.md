# 续卡 s4rg-e11：E11 入会前提改为真实同意

你的 4 个测试修复已由主会话提交（t-s4rg 61b8e7e1）。主会话对 E11 的决定：
- tests/probes/run-001/e11.mjs 的**题目、预期判定和评分不改**（E11 考的是约斗继任，不是入会）。
- 只改场景前提：第 24 行 `org_join(...member:m,consent:true)` 用调用参数替 NPC 填同意，违反新规则。改为让每个 NPC 经现有同意流程自己决定入会：NPC 要求的入会费/条件由玩家用真实游戏动作满足（例如玩家先把所需铜钱交给该 NPC、或按 requestContractConsent 支持的方式由玩家承担费用），然后由 NPC 本人同意。用已有动作，不新增测试专用接口，不直接写 state，不改 organizations.mjs 的同意规则。
- 如果现有动作里没有任何真实方式让 NPC 同意（例如 NPC 的决定与钱无关、给钱也不同意），停下汇报 NPC 拒绝的具体原因，不要改场景其他部分。
- 同样检查 run-001 其他 probe（tests/probes/run-001/*.mjs）里是否还有 `consent:true` 代填 NPC 入会/退会/任命的地方，有就同样处理并在汇报列出。

验收：`tests/s2c-run001r.test.mjs` 5/5；`node tools/probe-score.mjs --run run-001` 无脚本异常、较基线退步 0（沙箱拦 spawn 时用 --test-isolation=none，probe-score 直接 node 跑）；organizations、s4-office-quests 各一次全过。
汇报（≤250 字）：改了哪些文件、NPC 原拒绝原因与用的真实动作、命令与 pass/fail、偏离与未解决。

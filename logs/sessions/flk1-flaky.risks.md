# flk1 同类种子风险清单

静态候选，不代表已复现失败，也未为此运行其他测试。服务端默认种子是 crypto.randomUUID()；下面调用行未显式固定 seed/newCampaignSeed。导入既有存档、options 转发及只读测试需逐例区分。generation.test.mjs 中“普通创建产生不同种子”的用例是有意验证随机性，应保留。

uiSession 的其他调用者（本卡只透传 seed，不改变其默认行为）：a1b-fixes、a1-daily-probes（捕鱼一项自设 a1-fish，其余未固定）、a2-ui、a2-dialogue、a3-domain-properties、a3-guide-scenarios。daily-b2 系列通过 helpers/daily-b2.mjs 的 scene 写入固定 SEED，不计作未固定种子。

直接创建服务的候选（路径:行）：

- tests/a1-actions-ui.test.mjs:10
- tests/a1-applied-review.test.mjs:44
- tests/a3-affordance-state.test.mjs:236
- tests/a3-builder-ui.test.mjs:12
- tests/a3-builder.test.mjs:62,190,253,323
- tests/a3-connectors.test.mjs:394,411
- tests/a3-model-catalog.test.mjs:92
- tests/a3-openpath.test.mjs:139,162
- tests/a3-transaction.test.mjs:1134
- tests/a3rv-offline.test.mjs:119
- tests/action-registry.test.mjs:239
- tests/claim-review.test.mjs:164
- tests/generation.test.mjs:9,28,58
- tests/governance.test.mjs:157
- tests/history-window-integration.test.mjs:23,39,48
- tests/m2-reply-protocol.test.mjs:118,143,146
- tests/m3-acceptance.test.mjs:39,67
- tests/m3-consistency-browser.test.mjs:18
- tests/m3-consistency-evidence.test.mjs:47,103,136,159,671
- tests/m3-consistency-integration.test.mjs:37,58,69,72,78,93,128,203
- tests/m3-language.test.mjs:19
- tests/m3-narrative-regressions.test.mjs:65,88,108,125,143,165,186,195,226,236,241,249
- tests/m6-01.test.mjs:23
- tests/m6-02.test.mjs:68
- tests/m6-03.test.mjs:22
- tests/m6-04.test.mjs:26
- tests/m6-05.test.mjs:21
- tests/m6-06.test.mjs:19
- tests/m6-07.test.mjs:36
- tests/m6-08.test.mjs:108
- tests/m6-09.test.mjs:126
- tests/magic-area-actions.test.mjs:38
- tests/npc-planning-service.test.mjs:15
- tests/playtest-runner.test.mjs:185,207,239,267,278,293
- tests/plugin.test.mjs:15,38
- tests/population-on-demand.test.mjs:41
- tests/remote-generation.test.mjs:153
- tests/retrieval.test.mjs:80
- tests/review-continue.test.mjs:19
- tests/rumor-route.test.mjs:148
- tests/s3-action-catalog.test.mjs:44
- tests/s4-office-ui.test.mjs:48
- tests/s4-space-ui.test.mjs:13
- tests/sites.test.mjs:203
- tests/tool-groups.test.mjs:32,64
- tests/turn-contract-client.test.mjs:64,87,105,123,140,224
- tests/turn-gate.test.mjs:18
- tests/village-rumor-access.test.mjs:115
- tests/w5-integration.test.mjs:13
- tests/world-social.test.mjs:38,68,72

runtime 静态排查：

- 首项 init 原先使用随机 UUID，且环境 DEEPSEEK_API_KEY 会开启执行后的 NPC 规划；已通过现有参数固定 runtime-browser，并明确 npcPlanningEnabled:false。第二项原本固定 civic-browser。
- Node 代理 fetch 原先复用连接；与 playtest-runner 已注释并处理的“同步推进延迟 idle-socket 关闭”路径相同，已使用 Connection:close。这是静态根因假设，未经浏览器复现证明。
- listen(0) 后等待 listening，无固定端口争用。execute、reconcile 和 MESSAGE_EDITED 均返回串行队列 Promise；修复按钮置 blocked=null 后仍有 refresh，但下一步编辑会排在其队列之后，未发现需改的竞态。未加入 sleep 或放宽断言。
- 主会话在沙箱外逐文件运行 runtime.test.mjs，建议同一提交连续 10 次并覆盖有负载时段；确认首项 60 秒、第二项 30 秒整体时限下仍通过，区分 timeout、socket 和断言失败。保留原时限，尚不能认定历史约五分之一失败已消除。

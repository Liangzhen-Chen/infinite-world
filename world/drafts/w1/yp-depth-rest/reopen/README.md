# T06 授权双人闭合，待主会话正式整合

本次固定授权为 `user-reopen-20261012-01`，原规划标识 `T06-user-reopen-20261012-01-offline-1`、计划hash和旧foundation保持不变。2026-10-12两次真实DeepSeek完整L2依次审核汤桓、裘砚，均首次通过，无hard或其他标记，全部14叶coverage齐全，未付费回显候选。28名未变合格人物沿原L2复用，完整record hash相同。当前record的 `reviewRecovery.prior` 和 `incremental-proof.oldRecords` 保留旧失败及旧通过。

批1实际阅读俞澄、裘砚、汤桓、章颐和利莎，覆盖实际flag与随机5。阅读窗口上界242077毫秒，六项评分平均4.37，最低3，备注在 `batch-1-reading.json`。两名修订者经官方 `npc-depth-review --l4-notes` 登记新逐叶L4，现有L4 CLI检查30人的候选与审核hash后批准；批0保留原已批准的逐字凭证，复用有效L4。俞澄关系备注句式重复，独特性计3，留作后续骨架要求改善，没有整批重写。

现有发布器单卡预演与T11完整批预演均通过，30人selectedQuality零缺口，20条新增共享记忆闭合，原17traits保持。两次结果均 `published=false`，没有写正式baseline或原存档，未新增人口。世界其他人物在预演后仍有1192项缺口，不能称为全体达标。全量、两构建和真实酒馆验收未做；波次正式发布后的随机10评分由整合会话执行。

本轮两次调用费用上界合计0.06993360元，原卡spent从1.82866384变为1.89859744元，未知reserved仍0.083736元，累计上限2.5元，剩余上界0.51766656元。共享spent为10.88761224元、reserved为0.083736元，wave20和goal100未增加。原公共入口保存逐次provider响应，完整请求、原文及用量在双方record和共享预算responseEvidence中，总览见 `complete-report.json`。完整控制台结果见 `tanghuan-real-console.txt` 与 `qiuyan-real-console.txt`。

主会话可直接读取已完成的正规批预演输入；以下命令仅预演：

```powershell
node tools/publish-npc-depth.mjs --batch-manifest world/drafts/w1/yp-depth-rest/reopen/publication-batch.json
```

单卡清单为 `publication-manifest.json`，明确加载修后 `reopen/design.mjs`；原manifest作为历史材料保留。`publication-batch.json`绑定world原快照hash及完整30人集合，`publication-batch-preview.json`为T11批预演原文，`publication-preview.json`为单卡预演原文。正式整合由主会话完成，不重跑已通过L2。

`patch-diff.json`记录双方 `memorySeeds[2]` 和裘砚 `knowledge.unknown[0]`、`relationships[1].note`、`opinions.neighbors[1].view` 五处差异。共享事件只保留原源认识和同村往来，双方同文；交谈时间仍待问，没有新增认字能力、约工或私密获知。正确兄弟叶与原记忆保持原值，逐字段引文在 `source-quotes.json`。

`freeze.json`保留原任务树与主线两处已实测LF/CRLF字节hash，不在运行时规范化来源。公共工具更新record、批1和summary的原状态另存于 `old-records.json`、`incremental-proof.oldRecords` 及由提交0e6e345读取的 `prior-publication-state.json`。原sourceDeclaration、base、candidate、foundation和历史请求响应未覆写。`prepare-offline.mjs --check`重放不可变来源、历史链与修后L1/T04，不触及模型或预算。

旧 `T49-guard-blocked.json`、`T49-blocked-request-ceilings.json` 和 `offline-report.json`是先行证据。当时授权漏三叶导致零请求；主会话补齐后正式预检通过，本期才真实执行。首轮测试失败原文在 `related-first-failure.json`，T46夹具已补冻结候选与可核验费率，生产guard没有降低。最终相关与CORE见 `complete-related-results.txt`、`complete-core-results.txt`。

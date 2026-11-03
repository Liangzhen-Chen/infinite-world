# 卡 unify1-receipts：规则归一第一步——去掉回执版本标记与旧行为分支

工作区 F:/dnd-wt/UNIFY1（分支 t-unify1，基于 s4a 最新）。先读 docs/产品原则.md、docs/架构设计/修订记录.md 2026-10-24 第 5 条，以及盘点 F:/dnd/logs/sessions/unify-inventory.final.md 与 unify-inventory.json（本卡依据）。

## 用户决定
"规则最后只应该有一版""不需要管什么旧存档"：不做旧存档向后兼容。仍须保留：同一版规则下存档读取后重放结果一致（确定性）；重放时读取已记录的判决、同意、签约事实（这是同版本确定性的实现，不是兼容）。

## 要做（只做盘点里的"①回执归一"）
1. 删除 reduce 结果里的复演版本标记（盘点 JSON 中的回执开关类 xxxVersion，如 educationVersion、legalFilingVersion、organizationConsentVersion、nativePrimitiveVersion、obligationSigningVersion、legalProcedureVersion、npcCrimeVersion、worldEventVersion 等，以 JSON 清单为准），以及 engine.mjs 291–299 等处的集中组装。
2. 删除"replayResult?.xxxVersion===1 才走新行为、否则走旧行为"的分支：一律只保留现行行为。
3. **不要动**盘点标为"可能是记录判型或事实"的字段（reservationVersion、deliveryVersion、runtimeVersion、记录上的 filingVersion/trialVersion/legalFineVersion、boardVersion、schemaVersion、releaseVersion、runtimeRuleVersion、worldVersion、账本/持有版本）——逐项判断，若确属只为旧兼容的开关才删，并在汇报列出依据；拿不准的保留并列出。
4. 不做盘点的②（派发与 compat 清理）和③（测试归一），也**不删除任何测试文件或用例**。
5. 测试处理：
   - 只断言"结果里有某版本标记"的断言（如 assert.equal(result.xxxVersion,1)），随标记一起去掉，逐处列出。
   - 断言"无标记的旧事件按旧行为复演"的用例，若因第 2 条失败：不改不删，列入汇报的"待用户批准删除"清单（文件:用例名:原意）。主会话确认后另行处理。
   - 其余因本卡失败的测试必须修到通过（保持规则意图，不放宽）。

## 验收
受影响测试：在本工作区跑 `node F:/dnd-tools/affected-tests.mjs s4a` 列出的全部文件（近乎全量时可分批，每文件单独进程，--test-isolation=none），报 pass/fail；除"待用户批准删除"清单内用例外全部通过；overfit-guard（沙箱拦 git 时写明）、arch-metrics、system-map、performance、CORE 全过；静态提示 ≤10593。另报：典型大回执（world_move、world_trade、world_learn 各一例）去掉前后的字段数与字节数。
## 汇报（≤400 字）
删除的标记数与分支数、保留的字段及依据、改动文件数/行数、"仅版本标记"断言改动清单、"待用户批准删除"清单、命令与 pass/fail、回执前后字段对比、偏离与未解决。

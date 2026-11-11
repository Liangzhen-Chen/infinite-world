# 卡 W3b：远方借出并回收口（S5-09）

工作树 F:/dnd-wt/S509（分支 t-s509，含 S5-09 第 1–3 会话成果 d2b2fafc，已合入 s5a 最新 → 2a3d078b）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C 节（尤其 C.9 性能）、D.1 W3 行、E.1；docs/架构设计/修订记录.md 末节 G0（第 3 条写回投影不丢原始事实、第 9 条钉住按责任）；07 章借出/并回相关小节。
- F:/dnd/logs/sessions/s509c-remote.body.md 与 .final.md：第 3 会话修了 5 项门禁回归（actions-catalog、education、mining-jurisdiction、s3-e04、scale）。

## 要做
1. **复核**：合入 s5a 最新后，上述 5 项 + tests/s5-09、wildlife-encounters 是否仍通过。s5a 新增了"对账遇漂移即失败"（tests/helpers/ledger-audit.mjs）和四组不变量（tests/invariants/），本分支的借出/并回若产生账本或持有漂移会在这里暴露——那是真问题，修实现，不放宽。
2. **性能（必须处理）**：本分支的 `restoreRemoteAccounts` 挂在 runAdvance、catchUpLocal、advanceNpcSchedules 每次调用上，每次都扫描全部 NPC；`settleRemoteAccounts` 对每个 NPC 递归扫描全部 obligations、effects 与 memories（refersTo）。全规模约 3.5 万居民时这是"人数 × 记录数"的开销。改为：只在真正有折叠成员的聚合账户上恢复（按 remote-stock 记录的 members 索引，不扫全部 NPC）；"是否被义务/效果/记忆引用"改用已有索引或在建立引用时登记的反向索引（看 storage.mjs recordsWhere、holding 的 pinnedBy 等现成机制），不要逐个递归全量扫描。
   - 测量：tests/scale.test.mjs 的月推进用例，本分支与 s5a（F:/dnd-wt/S5A，只读，不要在那里改动或切分支）各跑一次，报告耗时。本分支不得比 s5a 慢 10% 以上。机器有其他任务在跑，数字只作配对比较。
3. 收口：逐项核对 S5-09 计划（钱物借出与并回、病例借出并回、份额精确保留不重新分摊、钉住者保留）是否完成，列在汇报里。

## 验收（测试前提用真实游戏动作产生，结算数值附手算锚点）
- 远方人物并回再展开：每人钱、物份额精确还原，不重新分摊，不复制、不丢失。
- 被义务/效果/记忆引用、有在途任务或随行的人不并回。
- 聚合账户里的钱物守恒（不变量 I1/I2 通过）。
- 既有测试不删、不放宽；改断言逐处写设计依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
CORE（tests/engine、storage、plugin）+ tests/invariants/ 四个文件；先 `node tools/export-actions.mjs` 再 actions-catalog、action-registry、advance-registry、arch-metrics（不得设 UPDATE_ADVANCE_GOLDEN，变化列旧→新）；tests/s5-09、wildlife-encounters、education、mining-jurisdiction、s3-e04、scale、save-roundtrip、holdings-roundtrip、holdings-reconcile；本卡新增/修改的测试；tests/overfit-guard。
命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不读完整输出；单文件超过 25 分钟停掉你自己启动的那个进程，记"超时未完成"。scale 里"月推进 139.3s > 120s"是已登记的旧项，不归本卡，但本卡不得让它更慢。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/（actions.json 导出除外）、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。发现要大面积改数据形状，停下汇报。

## 汇报（≤300 字）
提交号；每项根因与改法；scale 配对耗时（本分支 / s5a）；命令与结果；S5-09 收口清单；偏离；未解决。

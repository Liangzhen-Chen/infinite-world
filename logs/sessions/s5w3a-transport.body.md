# 卡 W3a：运输与远期合约收口（S5-08）

工作树 F:/dnd-wt/S508（分支 t-s508，含 S5-08 前两会话成果与第 3 会话半成品 bebcc9e3，已合入 s5a 最新）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C 节、D.1 W3 行、E.1；docs/架构设计/修订记录.md 末节 G0。
- F:/dnd/logs/sessions/s508c-forward.body.md：上一轮门禁发现的 9 项回归（基线两次通过、本分支失败）。第 3 会话半成品已做了两处（settlement-trade 托管作为 holding source；远期同意改用派生的机会价值），其余未完成。

## 要做
1. **逐个修那 9 项回归**（a3-consent-rights、actions-catalog、advance-registry 金快照、daily-b2-events D25 送信、festival、holdings-reconcile、runtime E2/E19 浏览器、w5-clock-2 T111、world-clock）。查根因修实现，不改这些测试；导出类重导即可。**不得重生成金快照**：先修其他回归，再看 advance-registry 剩下的差异是否只来自本卡有意改动，列"字段：旧→新、原因、设计条款"交主会话。
2. **F074（P1）运单残骸消费者**：周贸易与书信只消费 delivered（书信另认 intercepted），wrecked 永远悬挂：预付款不退、劳力被锁。补上终态：货损/截断 → 赔偿或欠款 → 释放劳力与托管 → 收件人获知。
3. **F032（P1）承运**：外包货运后不再派本村劳工徒步往返；承运运费如实入账；settleEscort 提前返回不得锁死托管账。
4. 收口：逐项核对 S5-08 计划（到岸成本、封关、在途货款、产能、合意取消）是否完成，列在汇报里。

## 验收（测试前提用真实游戏动作产生，结算数值附手算锚点）
- 托货 → 出发 → 被截 → 货损/赔偿/欠款 → 收件人获知：不能既显示失败又最终全额送达，不能重复赔付。
- 外包给真实承运人后，本村劳工不被占用；运费进承运人账户。
- 远期无真实履约基础时不压价。
- 既有测试不删、不放宽；改断言逐处写设计依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
CORE（tests/engine、storage、plugin）；先 `node tools/export-actions.mjs` 再 actions-catalog、action-registry、advance-registry、arch-metrics；上述 9 项；tests/s5-08、transport 相关、settlement-trade 相关、holdings-roundtrip、save-roundtrip、ledger-price；本卡新增/修改的测试；tests/overfit-guard。浏览器测试本机可起。
命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不读完整输出；单文件超过 20 分钟停掉你自己启动的那个进程，记"超时未完成"。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/（actions.json 导出除外）、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。发现要大面积改数据形状，停下汇报。

## 汇报（≤300 字）
提交号；每项根因与改法；命令与结果；金快照差异（若有）；S5-08 收口清单；偏离；未解决。

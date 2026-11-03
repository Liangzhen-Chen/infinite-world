# 卡 s508c-forward：S5-08 第 3 会话（修门禁回归并收口）

第 2 会话的门禁（与共同基线 adb09c69 两次独立复跑对照）中，以下各项在基线两次都通过，在本卡失败。改动很可能来自你扩的 domain-rules、stock 批次、NPC 机会成本与运输/托管接点。逐个查根因，修实现；不改这些测试，导出与快照类除外：
1. tests/a3-consent-rights.test.mjs「consent rights: a real forward action gets an NPC decision, records exact conse…」
2. tests/actions-catalog.test.mjs：运行 `node tools/export-actions.mjs` 重新导出。
3. tests/advance-registry.test.mjs「full存档推进结果可重放且与快照逐字节相同」（2 个用例）。先修其他回归，再确认剩下的差异只来自本卡的有意改动，最后按 `UPDATE_ADVANCE_GOLDEN=1` 重生成快照并复跑。
4. tests/daily-b2-events.test.mjs「D25 送信 ③④⑤：信在途不瞬间到…邮资付给承运人」（2 个用例）
5. tests/festival.test.mjs「月份与年界一次发生，30日离开分步一致且只有本地场景显示结果」
6. tests/holdings-reconcile.test.mjs「多日推演对账：…旧字段与存储逐条相等、漏写 0」
7. tests/runtime.test.mjs E2/E19 浏览器测试。它是已知偶发，但这次在基线上两次都通过。先在沙箱外由主会话复核；你只需查本卡改动是否可能影响出站生成或账本刷新。
8. tests/w5-clock-2.test.mjs「T111：一年内各势力时钟自动推进并真实扣公库…」
9. tests/world-clock.test.mjs「日/月/年边界只触发一次，旧档从当前日期起步不补造过去」

另外，tests/baseline 的 23 项历史预期失败、tests/probes 超时、scale（基线同败的老问题）都不归本卡。

收口：s5-08 全部计划项（到岸成本、封关、在途货款、产能、合意取消）是否都已完成，在汇报里逐项列出。
逐文件跑上述各项 + tests/s5-08.test.mjs + CORE。不跑慢档。

汇报写入 F:/dnd/logs/sessions/s508c-forward.final.md，≤300 字，内容：每项根因与改法、测试结果、收口清单。

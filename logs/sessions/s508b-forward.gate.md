# 卡片门禁 s508b-forward
worktree F:/dnd-wt/S508 vs adb09c6986d0e48b0a4f994538336f2239b63fcc；覆盖率选测 (shadow)；耗时 219 分钟
总判定：**INCOMPLETE**；退出码：1
通过 433/445（快档 445）
- [基础设施] INCOMPLETE：候选任务未完整结束：INCOMPLETE
## FAIL（9）
- tests/a3-consent-rights.test.mjs（测试）：consent rights: a real forward action gets an NPC decision, records exact conse…：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/advance-registry.test.mjs（测试）：对照：full存档推进结果可重放且与快照逐字节相同：两次基线仅 0/2 次出现相同完整用例路径和指纹（共 2 个用例）
- tests/daily-b2-events.test.mjs（测试）：D25 送信 ③④⑤：信在途不瞬间到，送达前收信人不知道内容，送达后收信人记下内容；邮资付给承运人：两次基线仅 0/2 次出现相同完整用例路径和指纹（共 2 个用例）
- tests/festival.test.mjs（测试）：月份与年界一次发生，30日离开分步一致且只有本地场景显示结果：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/holdings-reconcile.test.mjs（测试）：多日推演对账：组织、议案、商号租铺与雇工、受雇、借贷、离屏推进，旧字段与存储逐条相等、漏写 0：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/runtime.test.mjs（测试）：E2/E19 浏览器：失败对账阻止出站生成，编辑撤销刷新玩家账本，元数据只留引用：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/w5-clock-2.test.mjs（测试）：T111：一年内各势力时钟自动推进并真实扣公库；野物躁动与传述按效果表落地：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/world-clock.test.mjs（测试）：日/月/年边界只触发一次，旧档从当前日期起步不补造过去：两次基线仅 0/2 次出现相同完整用例路径和指纹
## BLOCKED（2）
- tests/baseline/regression.test.mjs（测试）：E1 战役重放使用自己的初始快照，世界种子改变不能改旧档：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定（共 23 个用例）
- tests/scale.test.mjs（测试）：真实日/月推进、5000消息提示与存档读写守住大世界预算：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定
## INCOMPLETE（1）
- tests/probes/run-001.test.mjs（基础设施）：候选结果不完整：TIMEOUT；deadline exceeded
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 94，新增 0，已移除 0，未核实 0
影子选测：保守集合 460，裁剪集合 460，裁剪会漏掉 0 个文件
慢档未跑（15）：tests/a3-acceptance.test.mjs、tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-harvest.test.mjs、tests/farm-pests-hunt.test.mjs、tests/ledger-price.test.mjs、tests/ledger-stock.test.mjs、tests/monster-society-content.test.mjs、tests/playtest-lifecycle.test.mjs、tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs、tests/seasonal-migration.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs、tests/wildlife.test.mjs

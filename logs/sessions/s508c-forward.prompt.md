【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

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

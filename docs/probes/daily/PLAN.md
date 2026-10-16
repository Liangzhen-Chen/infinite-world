# DAILY 卡计划（日常题集可执行化，第二批）

分支 daily，工作树 F:/dnd-wt/DAILY。只改 tests/、docs/probes/daily/、world/rules/tables/balance/。

- [x] 1. 读题集、review-003、A1 汇报与测试、数值方案、参数表、附录 A §A.18。结果：A1 的测试只断言引擎自己的数值关系；引擎不读 balance 表；A1 的 D27/D28 测试 dayOffset 90 被拒、没走三个月。
- [x] 2. 逐题探测引擎（22 道 todo + A1 已覆盖题的题面数值）。结果：D03、D16、D22、D23、D24、D25、D26、D31、D32、D36、D37、D40、D09、D05、D35 可部分或全部结算；D07、D11–D14、D21 整题缺机制。
- [x] 3. 补缺省数据到 balance 表。结果：action-costs 11 行、event-weights 7 行、yields 3 行，另 6 个参数（workday.minutes、wet.drainMul、speed.rain、post.feePerLi、freight.cart.perShiLi、wound.restRecoverShare）；balance-tables 校验通过。
- [x] 4. 可执行测试 tests/daily-b2-{trade,world,events,events2,exact,exact2}.test.mjs，缺机制的写 test.todo（含 tests/daily-b2-mechanisms.test.mjs）。
- [x] 5. 表级测试 tests/daily-b2-tables.test.mjs。
- [x] 6. 清单 docs/probes/daily/executable-status.md（199 条逐条状态）。
- [ ] 7. 验收：日常测试、balance-tables、CORE、advance-registry、arch-metrics、prompt；merge master 后复跑
- [ ] 8. 汇报：F:/dnd/logs/sessions/DAILY-cc-001.final.txt

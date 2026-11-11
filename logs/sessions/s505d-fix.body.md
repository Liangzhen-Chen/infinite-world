# 续卡 s505d-fix：修全量扫描新增的回归

主会话在沙箱外对你的工作区（未提交状态）跑了全量扫描：F:/dnd/logs/sessions/sweep-s505.tsv。与 S5-01 最终扫描（sweep-s501-final.tsv）相比，下列测试文件新增失败（清单：F:/dnd/logs/sessions/s505-regress-list.txt）：
- tests/a1-daily-probes.test.mjs
- tests/a3-world-approval.test.mjs
- tests/action-registry.test.mjs
- tests/daily-b2-exact2.test.mjs
- tests/ledger-stock.test.mjs
- tests/runtime.test.mjs
- tests/s3-action-catalog.test.mjs
- tests/s3-offscreen-life.test.mjs
- tests/s3-run001.test.mjs
- tests/sites.test.mjs
- tests/tool-groups.test.mjs

## 要求
- 逐个找根因。属于本卡规则的合法变化（例如价格派生化、可售量扣自用与承诺、资源账户化）导致旧测试前提或断言不成立：按设计对齐，前提用真实动作或 applyIntentSetup，断言改为**手算数字锚点**（不得用被测函数算期望值），逐处注明设计依据；属于实现缺陷的修实现。不放宽、不删断言、不加版本标记。
- 浏览器类（*-ui、*-browser）在沙箱 EPERM 时写明，主会话外跑。
- 每修完一个文件就单独进程复跑它，报 pass/fail。
## 汇报（≤350 字，UTF-8，F:/dnd/logs/sessions/s505d-fix.final.md）
每文件根因一句（标"合法变化"或"实现缺陷"）、改动文件、命令与 pass/fail、未解决项。

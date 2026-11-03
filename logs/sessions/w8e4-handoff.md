W8-E4 已完成：25 题（医 7、讼 5、学 7、匠 6），25/25。新增 `tests/fixtures/w8e4-capacity-set.json` 与 `tests/w8e4-capacity-set.test.mjs`；沿用 fixtures 中意图题的 setup/expected 格式，每题有独立手算 anchor，疾病、案件、磨损、雇佣、开停课由真实领域动作或工具产生。

`service-queue.mjs` 保存到达序并提供容量来源；`medicine.mjs` 修正休班助手虚增容量、重排前丢失原位次；`education.mjs` 修正跨课程位次及补位重复计数，`education-state.mjs` 排除到期占座并接入到期结算；`legal-representation.mjs`、`repair.mjs` 接入来源回执。另按强制命令重导 `docs/actions.json`，仅 8 处分派行号变化。

逐文件运行，未合并测试进程；TEMP/TMP 均为 `F:/dnd-tmp`。PowerShell 编码限制使默认符号过滤失效，使用 TAP ASCII 摘要：

```powershell
node --test --test-reporter=tap --test-isolation=none tests/<name>.test.mjs 2>&1 | Select-String -Pattern '^# (pass|fail)|^not ok' | Select-Object -First 40
```

| name | pass | fail |
|---|---:|---:|
| w8e4-capacity-set | 25 | 0 |
| engine | 21 | 0 |
| storage | 12 | 0 |
| plugin | 7 | 0 |
| actions-catalog | 4 | 0 |
| action-registry | 7 | 0 |
| advance-registry | 5 | 0 |
| arch-metrics | 4 | 0 |
| w8d-service | 14 | 0 |
| medicine | 8 | 0 |
| education | 9 | 0 |
| repair | 10 | 0 |
| law | 16 | 0 |
| numeric-persistence | 1 | 0 |
| overfit-guard | 2 | 2 |

overfit 两项受内部 `git show master` 子进程 EPERM 阻挡，须主会话沙箱外补跑；未改测试。`node tools/export-actions.mjs` 成功；金快照通过且未重生成；`node tools/numeric-digest.mjs` 的 state/functions 与共用基线 `w8e3-numeric-before.json` 全同。禁区未动，无临时调试文件，未提交；初始已有 `.base` 未动。

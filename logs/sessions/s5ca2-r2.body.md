续做 S5CA2（正文 s5ca2.body.md，共同规则 s5law-common.md）。上一轮停在两件事上，主会话补齐：

1. **文件所有权**：本卡可以改为修复这三项所必需的任何文件——词表/本体登记（ontology 测试报出的词所在的登记文件，例如 world/meta 或 server-plugin 下的词汇/罪名/标签表）、写入非整数到存档的规律模块（numeric-persistence 报出的字段的写入者）、住店 D04 相关模块（客栈/住宿/睡眠恢复所在文件）及对应测试。不改 storage.mjs 通用层、不改与这三项无关的规律。另两张卡 S5CB（市场/工资/远方郡/a1-lt）与 S5CT（A3/daily-b2 的 todo 转正，D04 两项除外）同时在做，不改它们的测试。
2. **测试摘要**：PowerShell 解码 ℹ 有问题，用 TAP：`node --test --test-isolation=none --test-reporter=tap tests/<文件> 2>&1 | Select-String -Pattern '^# (pass|fail)|^not ok' | Select-Object -First 40`，设 TEMP/TMP=F:/dnd-tmp。退出码 1 而有 `# fail N` 就是有失败用例，不是环境坏了；读 `not ok` 行和其后的 error 定位。
3. 受影响清单：`node F:/dnd-tools/affected-tests2.mjs . 75cc53c2 WORKTREE 0`（沙箱无 git 时自动读 .base-index/.base-src）。

请直接开始修三项：ontology I18、numeric-persistence、daily-b2-exact 两项 D04。

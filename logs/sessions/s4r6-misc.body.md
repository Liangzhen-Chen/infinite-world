# 续卡 s4r6-misc：s4a 全量扫描中的其余回归（在新工作区）

你上一卡（测试跟随生产原生运行时、r06/w2 前提）已提交 a3a 03614540 并合入 s4a。**本卡工作区换成 F:/dnd-wt/S4R6（分支 t-s4r6，基于 s4a fc6b3867）**，请在这里改，不要动 F:/dnd-wt/A3A。

用户 10-24 新决定（必须遵守）：**规则只保留一版，不做旧存档兼容**——不新增"旧复演保持旧结果"的版本标记或分支；只为旧版本兼容存在的断言列在汇报里，不为它加兼容代码。

## 失败文件（在 a3a 03614540 通过、s4a fc6b3867 失败；首个报错见 F:/dnd/logs/sessions/s4a-firsterr4.tsv）
- tests/r06-bs-craft.test.mjs（14/1，deep-equal）与 tests/w2-s4.test.mjs（8/1，deep-equal）：你在 a3a 改的前提与 S4 合并后出问题，先查是合并冲突还是 S4 规则（感知/区内移动/夜间照明/同意）影响了你的新前提。
- tests/npc-depth-wt.test.mjs（deep-equal）
- tests/a3-transaction.test.mjs（Missing expected exception：原本该拒的现在成功——先判断是 S4 合法放开还是规则漏洞，漏洞必须修生产代码）
- tests/ontology.test.mjs（deep-equal，可能是 S4 新增标签未登记）
- tests/m6-05.test.mjs（actual 4）、tests/s4-space-ui.test.mjs（界面/浏览器类，沙箱 EPERM 时写明，主会话外跑）
- tests/performance.test.mjs（提示组装用时 112–185ms 超阈值）：先在空闲时单独复测确认是否为并发扫描造成的负载噪声；若稳定超标，找出 S4 加进提示组装热路径的开销并修，不放宽阈值。
- tests/ledger-stock.test.mjs：扫描时超时（master 上 1792 秒刚好通过）；单独计时与 master 对比，若明显变慢再找原因，否则在汇报写明。
处理原则同 F:/dnd/logs/sessions/s4r-common.md。

## 验收
上述文件逐个单独进程全过（浏览器类除外则写明）；arch-metrics、system-map、s4-perception、s4-layout、draw-water、CORE 各一次全过。汇报 ≤300 字：每文件根因一句（标"合法放开/漏洞/合并冲突/负载噪声"）、改动文件、命令与 pass/fail、耗时对比、偏离与未解决。

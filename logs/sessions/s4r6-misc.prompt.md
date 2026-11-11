【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

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

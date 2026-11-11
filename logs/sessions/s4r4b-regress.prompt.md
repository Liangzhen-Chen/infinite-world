【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 续卡 s4r4b：第二批回归——法术同意/研究/事件/动词

你上一卡的改动已合入 s4a，工作区 F:/dnd-wt/S4R4 已快进到 s4a 6df89a9d（含 S4R1~R4 修复，其中你加的施法拒绝码 E-ACTION-CAST-MP/CONSENT/RANGE）。处理原则、设计决定、冻结语料约束同上一卡（见 F:/dnd/logs/sessions/s4r-common.md）。

## 本卡负责的失败文件（在 a3a 通过、s4a 失败；首个报错见 F:/dnd/logs/sessions/s4a-firsterr3.tsv）
- tests/spell-consent.test.mjs（actual 100）
- tests/spell-research.test.mjs（拒绝文字不再匹配 /同意|许可|目标实际/）
- tests/s3-g18.test.mjs（Missing expected rejection）
- tests/runtime-invention.test.mjs（未登记“顺纹切削”）
- tests/verbs-extra.test.mjs
- tests/wildlife-society.test.mjs
- tests/world-events.test.mjs
- tests/w2-s2.test.mjs、tests/w2-s3.test.mjs（拒绝文字 /同意|在场|事实/ 不再匹配；Missing expected rejection）、tests/w2-s4.test.mjs
- tests/s3-run001.test.mjs
注意：w2-s2/s3/s4、s3-run001 有严重性能退化，另一张卡 s4r5-perf 在修性能；你只修断言失败，跑慢文件时用 --test-name-pattern 只跑失败用例。"Missing expected rejection" 意味着 S4 后某个原本应被拒的动作现在成功了——先判断是 S4 合法放开（如有了原生距离后可旁观）还是规则漏洞（例如同意/在场检查被绕过）；漏洞必须修生产代码。

## 验收与汇报
本卡清单逐文件全过（慢文件可只报失败用例）；s4-perception、magic-light、organizations、s4-filing、a3-precondition-receipt、arch-metrics、system-map、CORE 各一次全过。汇报 ≤350 字：每文件根因一句（标明"合法放开"或"漏洞"）、生产/测试改动文件、命令与 pass/fail、偏离与未解决。

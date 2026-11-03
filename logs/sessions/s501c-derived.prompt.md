【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s501c-derived：S5-01 第 3 会话——对照规格自查补齐并收口

第 2 会话已提交（t-s501 9be268aa；主会话沙箱外补跑 8 个 npc-depth/acceptance 文件全过，perf-gate 分支/主线 81.2/80.5 秒通过）。

## 要做
1. 自查：逐条对照 F:/dnd/logs/sessions/s5-plan.final.md 的"01 派生"一行、docs/架构设计/05-统一模型.md §5.6/§5.9、附录A §A.16/§A.17、10 章第三～五轮中归 S5-01 的条目，列出"已做 / 未做 / 归后续 S5 卡"表（写进汇报）。重点检查：扩展事实（包可声明新事实供修正项读取）、B/C 表消费者是否都已经由修正槽、bounds 校验覆盖所有已接入槽、基线选择器、持有声明传导与知情门控、包加载顺序无关性（不同包顺序装载结果一致）。
2. 把"未做且属于 S5-01"的补完；"归后续卡"的列明给哪张卡（02 市场、04 经营用工、10 接线等）。
3. 在 tests/s5-01.test.mjs 补对应机制断言（不放宽已有断言）。
约束同前：结果不变、规则只一版、不调用付费模型、测试前提用真实动作或 applyIntentSetup。

## 验收
tests/s5-01.test.mjs 全过；affected-tests 中名字含 derived、standing、decision、npc-、relation、s5-、load-world、world-validation 的文件逐个跑；arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
汇报（≤300 字，UTF-8，写 F:/dnd/logs/sessions/s501c-derived.final.md）：自查表、补做内容、改动文件、命令与 pass/fail、偏离与未解决。

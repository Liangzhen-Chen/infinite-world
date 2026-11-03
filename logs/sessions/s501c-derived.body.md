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

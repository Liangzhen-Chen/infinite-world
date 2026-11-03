【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s501b-derived：S5-01 第 2 会话——把现有消费者接到派生修正槽

你的第 1 会话已提交（t-s501 abb98b16），主会话修了 1 个失败用例：持有传导测试原先让林穗"拥有白石巡检房"，但巡检房开局已有主，份额合计 2 被正确拒绝；改为动态挑选开局无人拥有的建筑（tests/s5-01.test.mjs）。t-s501 已合入 master（含过拟合白名单清理，overfit-guard 4/0）。主会话正在另一工作区对 t-s501 跑全量扫描。

## 本会话要做（按你第 1 会话列的后续消费者清单）
1. standing（立场/好感）派生改走 derived：立场相关的修正项（关系、声望、事件）经修正槽合成，结果与现值一致（先迁移，不改数值规则）。
2. npc-decision 的成本/收益读 B/C 表经修正槽：决策里用到的成本系数、风险系数改为派生值。
3. 其余读写硬编码系数且属于 S5-01 范围的消费者（不含价格——价格归 S5-02/04），逐个迁移；每迁一个，原有测试结果不变。
4. bounds 校验覆盖到新接入的槽。
原则：迁移不改变任何现有玩法结果（同输入同输出）；需要改数值的，列出来留给对应 S5 卡，不在本卡改。规则只一版、不加版本标记；不调用付费模型。

## 验收
tests/s5-01.test.mjs 及各被迁移消费者的测试全过；affected-tests（`node F:/dnd-tools/affected-tests.mjs master`）中名字含 standing、decision、npc-、relation、derived、s5- 的文件逐个跑并报 pass/fail；arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
汇报（≤300 字，写入 F:/dnd/logs/sessions/s501b-derived.final.md，**用 UTF-8 编码**——上次的交接报告编码损坏无法阅读）：迁移了哪些消费者、改动文件、命令与 pass/fail、留给后续 S5 卡的数值清单、偏离与未解决。

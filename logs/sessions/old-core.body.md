卡 old-core（a3a 旧回归：时钟序号与工位账本，两处产品缺陷）。工作区 F:/dnd-wt/A3O1（分支 t-a3o1，自 a3a）。
组1：外层时钟事务丢失内层原语调度游标——effects.mjs:48–55 的 tx 无 scheduler，faction-clock.mjs:196 经 applyEffect 进入 native-primitives.mjs:28、37 后无法把序号交回父游标，导致同一推进里出现重复 seq。修事务游标的提交与回滚，不放宽 I31 唯一性/分段等价。验收 tests/invariants/i31-total-order.test.mjs、tests/settlement-trade.test.mjs。
组2：建筑毁损转走工位公账，旧字段投影漏扣——transition.mjs:561–567 纳入工位账户，但 accountProjection:716–731 缺 fund→workshopFunds 映射（money.mjs:121 为旧余额来源）。补该映射与真实源/目标双写，保留守恒审计。验收 tests/ledger-stock.test.mjs（该文件很慢，单独跑，可用 --test-name-pattern 先跑相关用例，最后整文件跑一次）。
另跑 tests/a3-legacy-replay.test.mjs、tests/a3-transaction.test.mjs、tests/storage.test.mjs 确认未破坏回放与原语事务。
可改：server-plugin/effects.mjs、native-primitives.mjs、faction-clock.mjs（如需）、transition.mjs、money.mjs（如需），及新增针对性回归测试。锁定：activities、magic-targeting、npc-state、npc-schedule、world/、tools/ 及其余文件。
不调用真实模型。预计规模：中。本卡名 old-core。
通用：先读 docs/产品原则.md。根因分析报告见 F:/dnd/logs/sessions/older-rca.final.txt（编号即下文组号，含证据与最小复现）。修根因，不放宽断言、不删/跳过测试、不写特判。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要；单个失败只看最后 30 行。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑；子进程/浏览器类 EPERM 列出即可。最后回复不超过 10 行（每组根因一句、改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。

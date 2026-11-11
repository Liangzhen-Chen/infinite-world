卡 old-npc（a3a 旧回归：战斗身份、NPC 物种覆盖、自我解除许可、考官接待覆盖休息，四处产品缺陷）。工作区 F:/dnd-wt/A3O2（分支 t-a3o2，自 a3a）。
组3：activities.mjs:89 强制个体行含 boss/species，拒绝了已有“目录怪物 ID 或已创建模板＋在场生命行”的兼容形状。按真实目录或创建事实识别交锋个体，保留不在场、死亡、伪实体拒绝。验收 tests/hidden-passives.test.mjs、tests/m4-integration.test.mjs、tests/progression.test.mjs。
组4：activities.mjs:85 把 npc.species 排在人物档案前取 base，3 级人物被按物种 18–23 级计算。NPC 读本人档案/当前状态，物种只用于相应身体与个体模板派生。验收 tests/monster-society.test.mjs。
组5：magic-targeting.mjs:32 对 target=player 且 relief 硬编码豁免，绕过法术 targeting.permit。遵守明确许可声明，保留自我同意与他人同意的区别，不改反例。验收 tests/m4-batch2.test.mjs:78 相关用例、tests/w2-s3.test.mjs。
组6：npc-state.mjs:75–87 按工作地点叠加考官接待，把 620 刻的真实休息改成接待，npc-schedule.mjs:303 因此不认收工、火灾不发生。接待只覆盖真实可工作时段，保留个人休息与炉火值守边界。验收 tests/s2c-fire.test.mjs，并跑 tests/npc-schedule.test.mjs、tests/a3-owner*.test.mjs 中涉及考官的文件确认考官接待仍成立。
另：组12（m4-batch2.test.mjs:39/64 短效状态一回合到期后测试读残留记录）与组5 同文件，一并处理：按回合消费补丁/回执与到期结果对齐断言，仍证明施放后存在、只消费一次、攻防确实受影响、之后不再加成；不延长状态寿命。
可改：server-plugin/activities.mjs、magic-targeting.mjs、npc-state.mjs、npc-schedule.mjs；上述测试文件；新增针对性回归测试。锁定：effects、native-primitives、transition、money、world/、tools/ 及其余文件。
不调用真实模型。预计规模：中。本卡名 old-npc。
通用：先读 docs/产品原则.md。根因分析报告见 F:/dnd/logs/sessions/older-rca.final.txt（编号即下文组号，含证据与最小复现）。修根因，不放宽断言、不删/跳过测试、不写特判。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要；单个失败只看最后 30 行。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑；子进程/浏览器类 EPERM 列出即可。最后回复不超过 10 行（每组根因一句、改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。

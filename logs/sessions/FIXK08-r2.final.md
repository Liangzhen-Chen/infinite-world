# FIXK08 续卡交接

本轮仅修改 `tests/s5-09.test.mjs`，不修改生产代码，不提交，由主会话代提交。

## 三项根因与精确锚点

1. 人口登记：`server-plugin/remote-generation.mjs:569–581` 为每家有路线补货的店派生一名真实行商，并登记到对应聚落。该种子六个聚落的商店数为 3+2+2+0+1+1，共九名，所以郡登记人口 2132+9=2141。首次进入与反复进入的精确人口断言均按此更新，既有 925 铜、37 单位掌柜库存、无二次 genesis 和账本核对断言保留。
2. 被记忆引用的掌柜：`server-plugin/shop.mjs:451–452` 在真实正午到场交易中同时转移钱货。另一名货栈掌柜买入麻绳 3×10、蜡烛 4×4、毛线 6×3，共 64 铜；268−64=204，行商获得相同的 64 铜，货物全部交付。原 268 铜锚点的“不发生进货”前提失效；现同时断言店账支出 64、掌柜份额 204、行商份额 64 及空库存，恢复后两人余额与行商库存仍严格一致。
3. 统计降级：同一登记规则使郡治由 1173 待展开+15 原登记=1188，变为 1173+15+3 行商=1191；待展开配额仍严格为 1173。`remote-generation.mjs:620–648,664–692` 按 materialized 标记统一折叠和恢复，未按角色排除行商，未发现遗漏折叠或重复分配。新增断言覆盖所有已物化县内人物（明确含九名行商），三次降级与升级均逐人精确比较钱袋、库存及所有聚落人口档案，保留原名册、配额、钱货、账本断言。

以上都是新增真实持货人的可追溯后果，未放宽断言、删用例或添加名字/ID 特判。手算推导已写在各处测试注释中。

## 验收

`s5-09` 本树和 `.base=8c4215c2` 各独立运行一次，均 17 通过／1 失败，唯一实际失败子测名完全一致：

`three native county round trips merge actual ownership shares without a second genesis`

三项新增回归已消除。基线使用它自己的测试文件，没有以“同文件失败”代替子测对照。

四个失败文件均已在 `.base` 树上复跑，实际失败子测名单逐项相同：

| 文件 | 本树 pass/fail | .base pass/fail | 实际失败子测名（两树一致） |
| --- | --- | --- | --- |
| s5-09 | 17/1 | 17/1 | three native county round trips merge actual ownership shares without a second genesis |
| invariants/i31-total-order | 17/1 | 17/1 | 真实引擎 I31：一次推进 10 天与逐日推进产生相同事件序列（含 seq） |
| overfit-guard | 2/2 | 2/2 | overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus；overfit guard: every allowlist entry carries a reason and still matches a real hit |
| s5-04b | 6/2 | 6/2 | wage counter: when the counter runs short the shortfall is wage debt even though the owner carries cash；npc shopkeepers: within a week each stocks up, reprices and hires by his own decision, paid from his counter |

背题守卫沿用上轮已定位的 Git 子进程 EPERM 结论，本轮复跑的两项失败名单一致，需主会话沙箱外补跑；未把环境失败记为通过。

按共同规则执行 `node F:/dnd-tools/affected-tests2.mjs . 8c4215c2 WORKTREE 0`，清单 50 个：45 个通过、4 个上述同名基线失败、1 个已知超过 40 分钟的 `s5-playthrough` 列主会话外跑。该长测上轮已运行 2414 秒仍未完成，本轮遵照共同规则不重复启动，未计通过；此前外跑交接证据见 `FIXK08.final.md`。本清单不含 gate-skips 的额外排除项，现有 TODO 保留。

原始三个回归文件：remote-generation 5/0、works 8/0、w2-reuse-learning 17/0；商店同名消费者 shop-restock 7/0；定期集市专项 23/0。CORE：engine 22/0、storage 14/0、plugin 7/0。四项守恒、非负、单账户、事件主写检查全部通过。

先执行 `node tools/export-actions.mjs`，再逐文件执行同步四件套：actions-catalog 4/0、action-registry 7/0、advance-registry 5/0、arch-metrics 5/0。金快照未变，未重生成、未设置 UPDATE_ADVANCE_GOLDEN，无需 golden-table；重导产物仅换行差异已还原。

每个测试文件均独立执行 `node --test --test-isolation=none --test-reporter=tap tests/<文件>`，TEMP/TMP=F:/dnd-tmp，本卡始终只运行一个 Node 测试进程，只留摘要。完整清单存 `FIXK08-r2-affected.txt`，逐文件 pass/fail、失败子测名、PID 和耗时存 `FIXK08-r2-tests.jsonl`。

数值摘要本树与完整 `.base` 副本各运行一次，所有字段完全一致，结果存 `FIXK08-r2-numeric-current.json` / `FIXK08-r2-numeric-base.json`。

本轮临时 `.fixk08-probe.mjs`、`.fixk08-r2-run.py`、`.fixk08-r2-base/` 和临时 `.base-index` 全部删除；递归删除前已核对基线副本的绝对路径在当前工作区内。环境原有 `.base`、`.base-src/` 保留，未结束任何进程。没有触及禁区、世界内容、部署或原存档；`git diff --check` 通过。工作区仅有本轮测试修改和环境原有未跟踪元数据，代码未提交。

主会话下一步：审核并代提交本轮 `tests/s5-09.test.mjs`；在沙箱外补跑 overfit-guard 和 s5-playthrough。I31、s5-04b、s5-09 的既有失败已逐子测对照，不计本卡新增回归。

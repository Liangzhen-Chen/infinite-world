# K15 性能续做交接（未验收，2026-10-31）

性能门仍未通过：三对比值中位数 **1.174614**，高于 1.10。已保留五处有实测收益的类别查询优化；进餐、购粮及存档推进输出保持本轮开工版本。未提交、未部署。

## 改动与热点

本轮新增性能改动仅在 server-plugin/hazard-calendar.mjs、governance.mjs、public-projects.mjs、titles.mjs、noble-state.mjs，另按要求重导 docs/actions.json。原 K15 的 household-budget、npc-life、advance-registry、agriculture 四模块与开工备份逐字节相同。没有新增随机、跳过结算、减少人口或改变库存/钱账。

下表为相同 60 日基准中函数累计 self 采样秒数，不是单次调用时间。固定 07477535 的带剖析推进计时为 107.136 秒，原 K15 为 124.089 秒，最终 K15 为 115.169 秒。剖析按要求使用 node --cpu-prof，并运行 profile-diff.mjs 对比。base→原 K15 的 self 增量主要包括 storage 2.91 秒、education-state 1.84 秒、npc-state 1.17 秒、household-budget 0.82 秒；进餐写入会让后续视图重算成本增加。部分剖析与早期索引检查重叠，因此这些秒数只用于定位，性能门采用后面的独立普通运行配对。

| 热点与修法 | 原 K15 → 最终 K15，self 秒 |
| --- | --- |
| hazardPriceFactor：用现有 war_disruption 类索引读取战乱记录，保持乘法顺序 | 1.122352 → 0.013918 |
| advanceOffices：按官职/申请类别取候选并先筛到期项；多项同时到期时恢复原枚举顺序再排序 | 1.335454 → 0.018377 |
| advanceHousing：按宅基申请/许可类别预筛；多候选保留原稳定排序输入 | 1.155500 → 0.004756 |
| advanceTitles：按封爵申请/爵位类别预筛到期项，保留同刻处理顺序 | 0.986766 → 0.009345 |
| nobleLords / titlesOf：直接读取既有 title 类索引；正式授封、君主授封及郡级提纲落档三条写入路径均登记该类别 | 1.093401 → 0.001716 |

这些类别索引原本已由相应 nextMinute/法域读取器使用。本轮复用既有 recordsWhere，没有新增存储索引或生产期遥测。治理、宅基与封爵的权限、费用、状态判断和办理函数保持原逻辑。

原文件清单外的五处查询是实际剖析定位的必要接点；共同规则确认 K01–K12 已合入，五文件没有在途修改，且不涉及 K14 锁定的 building-maintenance / npc-autonomy。没有修改测试文件或断言。

## 正式三对性能门

基线工作树 F:/dnd-wt/PERFBASE 与 master 均为 3bbd7e0c8e638a9726e0af0329c63c42c5220fe4。为遵守禁止 checkout，按主树→K15 顺序分别运行相同 `node F:/dnd-tools/bench-farm-pests.mjs 30 2`，每对结束再开始下一对。所有运行 TEMP/TMP=F:/dnd-tmp，配对期间没有运行本会话测试或 CPU 剖析。

| 对 | master 毫秒 | K15 毫秒 | K15/master |
| --- | ---: | ---: | ---: |
| 1 | 103972 | 122127 | 1.174614 |
| 2 | 104984 | 127077 | 1.210442 |
| 3 | 106370 | 123845 | 1.164285 |

中位数 1.174614，即相对 master 慢 17.46%，**未过 ≤1.10 门槛**。上轮单对 1.282 的失败记录保留，不能把带剖析计时当作门通过证据，也没有挑选较快单次替代三对中位数。原始配对结果见 K15-perf-pairs.json。

## 行为与数值证据

开工重新导出的 K15-perf-before.json 与上轮 K15-golden-after.json 字节完全相同；最终 K15-perf-after.json 又与 before 完全相同，覆盖 golden-dump 的 full 五步、quiet 四步，每步 state 和 messages。**0 字节/字段差异**，三者 SHA256 均为 `3e6cac7b4c24fb1ea63931d950cf8f3d2d5c99598d6be177ab4350e0eb3c58ed`。

K15-perf-before-numeric.json 与 K15-perf-after-numeric.json 的 JSON 整体相同，包括 Node/V8 版本、两份状态哈希和全部 13 个数值函数摘要。before 复用上轮有效数值证据，其源码及 golden 本轮均已核对；after 在最终源码重跑。

没有设置 UPDATE_ADVANCE_GOLDEN，没有改金快照。仓库的 full/quiet 原快照仍显示 K15 原有差异，继续沿用 K15-golden-table.md 的 5604 条去重字段表，由主会话审核后统一更新；本轮新增差异为 0。

## 验证

先完成 export-actions 重导（248 动作、25 公开工具、232 子操作；处理器定位 248、分派定位 226），再逐文件运行。每文件独立 Node；TEMP/TMP=F:/dnd-tmp。因 PowerShell 的 ℹ 解码问题，使用内置 TAP reporter，输出仅过滤 `^# (pass|fail)|not ok` 的前 40 行。实际命令另加载只导入 node:fs 的 PID 记录器，没有预载应用模块，记录器交接前删除。

命令模板：`node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs 2>&1 | Select-String -Pattern '^# (pass|fail)|not ok' | Select-Object -First 40`。表中索引行额外设置 FIELDS_INDEX_CHECK=1。

| 文件/模式 | pass/fail |
| --- | --- |
| engine / storage / plugin（分别单跑） | 22/0；14/0；7/0 |
| actions-catalog / action-registry / arch-metrics（分别单跑） | 4/0；7/0；5/0 |
| advance-registry | 3/2；仅原 full/quiet 金快照差异 |
| 索引：s5-law-household-meals | 11/0 |
| 索引：s5-law-household-budget | 27/0 |
| 索引：s5-law-periodic-market | 22/0；复用最终源码冻结后独立运行证据 |
| 索引：npc-life-health（最终源码） | 40 分钟上限未完成（2414 秒），无完整统计 |
| npc-life-health（普通模式） | 7/0 |
| governance / governance-office / governance-housing（分别单跑） | 8/0；5/0；4/0 |
| governance-titles / governance-projects / high-nobility（分别单跑） | 4/0；4/0；9/0 |
| seasonal-hazards | 9/0 |
| shop-restock / settlement-trade（分别单跑） | 7/0；18/0 |
| s5-02 / s5-05（分别单跑） | 16/0；16/0 |
| i01-conservation / i02-non-negative / i15-single-account / i16-event-primary-write（分别单跑） | 2/0；3/0；2/0；2/0 |

最终源码的 npc-life-health 索引检查独立运行 2414 秒，未返回完整统计，按 [共同规则](F:/dnd/logs/sessions/s5law-common.md:10)“单文件超过 40 分钟的长测不跑，列给主会话外跑”结束已记录的 PID 43388。该项是未完成，不能记为通过或断言失败；主会话需在外部设置 TEMP/TMP=F:/dnd-tmp、FIELDS_INDEX_CHECK=1 后单独补跑 tests/npc-life-health.test.mjs。普通模式同文件为 7/0。早期非最终候选版本的索引健康检查也曾达到上限，历史保留在 K15-perf-initial-index-tests.json；其结果不作为最终版本证据。其余三项要求的索引检查均已通过。

本轮未改测试文件、未添加 skip 或放宽断言，超时检查明确记为未完成。上轮农业短测 CLI 的 EPERM 和原 T164 继承失败仍交主会话处理，本轮未改这些测试或相关行为，也未把旧结果记成本轮绿色。上轮农业 38353582 依赖及原 s5-05 断言保持；原功能交接保存在 K15-before-perf.final.md。本轮未运行全量、build:release、真实提示栈试玩或 baseline。

## 未完成块与交接

未达性能目标。预算缓存、短期 peek、通用记录 memo 与日程变更行缓存都未取得稳定整体收益，已全部撤回；教育/日程模块与开工代码无 diff。失败历史见 K15-perf-experiments.json，不清零或换名重领。

按项目停块规则，剩余性能块交主会话规划一次。最终剖析仍显示 education-state 的 records 比较扫描：经 settleSchedules 的 self 累计约 2.13 秒，经课程推导/heap 约 0.82 秒，经 prepareEducation 约 0.45 秒；storage.take 也仍为大热点。具体栈见 K15-perf-remaining-row-hotspot.json。这里是后续定位依据，尚未实施新的缓存方案。

最终源码与 K15-perf-evidence.json 记录一致。交接补丁 K15-perf.patch 仅含本轮五个性能模块；Git 工作区还保留上轮 K15 功能改动及测试，交主会话统一提交。git diff --check 无空白错误，仅有 Git 行尾提示；禁区路径为空。education-state / npc-schedule 的实际 diff 为空，文件字节等同 HEAD；未执行 Git 写操作。

临时调试文件、候选加载器、原始 cpuprofile、源码备份及 PID 记录脚本均已删除；仅保留交接报告、补丁、JSON 证据、采样摘要和 PID 日志。原有 .base 未动。只结束本会话亲自启动并记录 PID 的进程：早期健康索引检查 PID 35500、最终健康索引检查 PID 43388，均在单文件 40 分钟上限核验进程启动时间后按 PID 结束；未按名称或批量结束进程。

可复核文件都在 F:/dnd/logs/sessions/：K15-perf-pairs.json、K15-perf-evidence.json、K15-perf-final-tests.jsonl、K15-perf-before/after.json、K15-perf-before/after-numeric.json、K15-perf-profile-base-tip.txt、K15-perf-profile-tip-final.txt、K15-perf-final-profile.json、K15-perf-experiments.json，以及原 K15-golden-table.md。


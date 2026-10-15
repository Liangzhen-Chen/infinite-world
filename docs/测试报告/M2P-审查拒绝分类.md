# M2 四轮审查拒绝分类

2026-10-15 离线读取已存报告，无模型调用，不改原报告或审查标准。拒绝定义为回合的 `consistency.canCommit === false`，每个回合只计一次；下表类别取该回合最终 `issues`，同一回合可含多个类别，warning 不代表拒绝原因。

首轮快照在 `20261012-T60/first-run/真实试玩.json`，对应五场完整；`20261012-T60/真实试玩.json` 已含后续恢复结果，不能与首轮叠加。其余三轮分别取 `M2-recheck/真实试玩.json`、`M2-recheck-003/真实试玩.json`、`M2-recheck-004/真实试玩.json`；仓库没有 `M2-recheck-002` 目录。

| 轮次 | 已记录回合 | 拒绝回合 | fact | time | agency | knowledge | location | 最终 issues 为空 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| T60 首轮 | 65 | 4 | 2 | 1 | 0 | 2 | 1 | 2 |
| recheck | 83 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| recheck-003 | 71 | 4 | 0 | 2 | 0 | 0 | 0 | 2 |
| recheck-004 | 40 | 3 | 1 | 0 | 0 | 0 | 0 | 2 |
| 合计 | 259 | 12 | 3 | 3 | 1 | 2 | 1 | 6 |

拒绝占已记录回合 12/259，即 4.63%；这不是四轮通过率，旧运行器中断后的回合没有测量。拒绝回合内共 13 条问题：fact 6 条、time 3 条、knowledge 2 条、location 和 agency 各 1 条。其中 error 为 fact 3 条、time 3 条和 agency 1 条，其余为 warning。六个空 issues 的拒绝保留为“原因未判定”，不能从空数组推断原稿无问题或认定误报。

明确误报样本：recheck-003 的 `npc_home_visit` 第 6 回合，time/error 引文为“现在十一点三十五分，进入筛种院的许可已在十点五十五分到期。”审查理由同时确认 minute 695 等于 11:35，并写明“不应报”；其证据包含真实回执 `date: 春历元年 雨月 1日 11:35`。该样本仍计一次拒绝，不修订原结果。

可确认的真实矛盾样本：recheck-003 的 `npc_shove` 第 4 回合，已由 `world_time` 等待 10 分钟、回执 minute 从 556 到 566，尾注又追加 5 分钟；玩家未要求等待后交谈。该条 time/error 为确定性检查，保留原拒绝。

其余样本暂未判定。recheck-004 的 `npc_offscreen` 第 4 回合尤其值得复核：审查一面引用 elapsedMinutes 14400，另一面称“十天未满”；同时还有三条 fact/warning，不能仅凭这一处争议把整回合判成误报。以上回合编号均从 1 起算，JSON 的 index 从 0 起算。

新运行器把审查拒绝作为回合失败，保留原文和已完成行动，跳过被拒尾注后继续。`consistency` 汇总给出 total、failed、failureRatio 和按 90% 判定的 thresholdReached，文风汇总仍要求 95%；账本与隐私门槛保持。样本分为 falsePositives、contradictions 和 unresolved；前两种已定性标签需在回合 `consistencyAdjudications` 中记录 issueIndex、原 category/quote、disposition、reason 和 evidence，误报仍留在失败分子中。

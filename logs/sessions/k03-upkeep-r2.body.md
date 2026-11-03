K03 返修一处（主会话审 diff 后）：

问题：`defer_maintenance` 被做成一个真实的自治行动候选。结果店主每天都"执行"一次暂缓，记成行动、任务、亲历发展和记忆（金快照里林穗 9 天 9 条"比较维修成本与服务损失后暂缓维护"）。现实中"这次不修"不是一件要做、要记住的事；它还会以 utility 0 挤掉其他排在后面的日常候选，并让记忆流和存档每天膨胀。

要改：
1. 不再向自治候选注册或返回 defer_maintenance 行动（删掉 registerAutonomyKind('defer_maintenance') 与 candidates 中的 defer 项）。暂缓 = 不选修缮：修缮候选不划算时，npcDecision 给出非 agree 自然被滤掉，或者干脆不生成修缮候选。maintenanceOptions 里保留两个选项与比较依据，供解释与测试读取。
2. maintenanceDelayPermille 不需要靠"暂缓行动"写入；保持派生（固定种子键可重算），只有真正开工修缮时才保存，或干脆不存。
3. 测试改成断言"没有通过决策的 repair_building 候选 / 选择结果为暂缓（options 比较）"，不得放宽：手算锚点成本7选修、成本12暂缓保持严格；有噪声的分组检查保留。
4. 重做金快照差异表 K03-golden-table.md（预期林穗的 22 个暂缓字段消失；如仍有差异逐项解释）。

按原卡验收逐文件重跑受影响测试，汇报同原卡。

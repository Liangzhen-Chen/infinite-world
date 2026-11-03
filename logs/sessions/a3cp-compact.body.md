续做（你的 a3op-openpath 改动已合入 a3a）。新工作区 F:/dnd-wt/A3CP（分支 t-a3cp，自最新 a3a）。
真实试玩复验在第 1 回合中止：错误“历史上下文超限，或待裁剪回合缺少编年史及原文覆盖”。证据 F:/dnd/logs/sessions/a3-playtest/whimsy2/真实试玩失败.json failures[0]：模型调用 world_move→world_read→world_actions(target:npc_hw_yanzhe)，最后这个结果里实体卡的 primitives 每项都带完整 bounds/requirements/blocked{reason,missing,repair,alternatives,fallback{…}}，加上 relatedActions 与开放路径条目，单个工具结果过大，historyWindow beforeTokens 14266 之后溢出。给玩家界面的完整卡可以保留，但模型投影（extension/tools.mjs 的 modelActionCatalog / world_actions 返回给模型的那一份）必须压缩。
要做：
1. 给模型的 world_actions 结果设固定上限（以现有分词器或现有 token 估算口径计，单次结果建议 ≤1200 token，常量写明依据），超出时按优先级裁剪并注明“已省略 N 项，可用 query/target 细化”：目标状态摘要与受阻原因优先；primitives 按 op/verb 合并成一行一类（只留 op、类、上限摘要、是否可用、缺项一句）；repair/alternatives/fallback 只在不可用项上给一句话，重复的 fallback 只出现一次；relatedActions 只留 id、label、必填槽名；开放路径条目（open:proposal、open:leave_mark）保留且精简。
2. 不改引擎派生结果、不改玩家界面卡、不改静态提示（≤10593）；保留 a3-openpath 与 a3-affordance-state 的语义断言（必要时断言改为针对模型投影的精简形状，并保留“开放路径总在、可留痕时 available”等意图）。
3. 新增测试：以白石镇严辙、河湾渡口两个真实对象的查询为例，模型投影的估算 token 不超过上限，且仍含状态、开放路径、受阻原因。
验收：node --test --test-isolation=none tests/a3-openpath.test.mjs tests/a3-affordance-state.test.mjs tests/a3-tool-surface.test.mjs tests/a3-builder.test.mjs tests/playtest-runner.test.mjs 及新增测试；报告压缩前后两个例子的 token 数。
不调用真实模型。预计规模：小到中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程（另有扫描在跑），--test-isolation=none，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3cp-compact.final.txt。

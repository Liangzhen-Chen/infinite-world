【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试命令一律加过滤：`node --test --test-isolation=none <文件> 2>&1 | grep -E "^ℹ (pass|fail)|^✖|^not ok" | head -40`；禁止读完整输出；细节只看单个失败用例最后 30 行。不要反复全量重跑：每个文件修好后只跑一次确认，最后统一跑一次验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。分诊详情：F:/dnd/logs/sessions/R35B-triage.md。

卡 R35Z。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R35Z（分支 r35z，基于 r35b）。
问题：S2c 合入后，tests/npc-depth.test.mjs（3 项）、npc-depth-next、village-ledgers、w1-village-profiles、w1-villages-publish 报“发布骨架或引用事实已改变 loc_bs_yupo”，npc-depth 另有“loc_bs_yupo：运行农事规则与审核开局账不符”；tests/revival.test.mjs 2 项（世界升级历史版本数期望 2 实得 3，复活点数据校验期望 true）。
任务：查清 loc_bs_yupo 的发布骨架/引用事实指纹由哪些数据计算、S2c 改动了其中什么（git log -p master -- world/ 以及 S2c 新增的 world/lore/*.json、world/ontology 改动）。判定：若是 S2c 依设计新增/改动了被指纹覆盖的世界数据，正确做法是按项目已有的发布/审核流程补登记（找 tools/ 下的发布或指纹更新工具与其审核要求），而不是放宽校验；若是 S2c 误改了不该改的已发布事实，则恢复。revival 的世界版本数同理：确认新增世界升级是否合法，合法则按升级登记机制补，否则修。不许改断言、不许跳过；若必须改期望，逐条写依据并停下交主会话。
跑上述文件 + CORE。报告 F:/dnd/logs/sessions/R35Z-luna.final.txt；回复 ≤150 字：根因、处理方式（补登记/恢复）、各文件结果。

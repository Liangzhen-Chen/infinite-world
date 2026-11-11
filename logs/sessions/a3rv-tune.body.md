卡 a3rv-tune（回合契约真实试玩后的离线诊断与修正）。工作区 F:/dnd-wt/A3RV（分支 t-a3rv，自 a3a db3b613b）。先读 docs/产品原则.md、docs/架构设计/修订记录.md 第 3 条。
真实试玩（同版 DeepSeek flash + SillyTavern 提示栈）：F:/dnd/logs/sessions/a3-playtest/contract1/真实试玩.json 与 真实试玩失败.json；服务端审查 sidecar 在 F:/dnd/.git/playtest-runs/a3-pt-contract1-1024/server/（只读）。总体 74/96（学艺 18/19、做工 33/40、奇思妙想 21/32、交谈打听在第 2 回合因预算到顶中断）。一致性审查 35 次中 28 次未放行：27 次 review-unverified（“回复存在未修正的事实问题，尾注未提交”“唯一一次改写仍有严重问题或未完成验证”）——大多数回合最终只发布模板。
1. 审查误伤分析（核心）：从 sidecar 取每个未放行回合的审查请求/响应/改写，逐句列出被判“无来源/矛盾”的断言，分类为 T 真拦（确实无出处的价格/规矩/决定/状态变化）与 F 误伤（感官/姿态/比喻被当事实、已有出处但证据未收入、sourceId 映射缺口、覆盖校验过严、审查模型格式错误被当事实问题等）。只修 F 的根因（可在 consistency-review.mjs 的断言分类/覆盖规则、consistency-evidence.mjs 的事实收录、审查请求格式上修；审查响应格式问题优先用 DeepSeek JSON Output 或工具调用 schema 约束输出，参考现成做法），T 一律保留阻断，不放宽、不加词表。报告 T/F 计数与代表例句。
2. 奇思妙想断言与设计冲突：第 6 回合模型提交 open:proposal 被引擎正确拒绝（“需要对方答应…”——模型多填了 consent），但场景断言要求 state.records 里存在 open_proposal 被拒记录；按统一拒绝投影，拒绝零写入。改 tests/playtests/a3_whimsy.json 中这类断言为核对该次调用回执（status rejected、含 reason/alternatives/fallback 与零写入），若断言 DSL 不支持核对调用回执则在 tools/playtest-assertions.mjs 最小扩展；同时查清模型为何为自身动作填 consent（若开放提案对“只作用于自己/无主水体”的效果仍要求同意，判断是否为引擎缺陷）。
3. 做工第 14 回合“历史上下文超限”：查哪类工具结果撑大窗口（world_craft 维修报错/结果、回合证据注入等），按现有预算口径压缩，不截断事实来源。
4. 成本：本轮每回合约 0.14 元（审查+改写+补跑）。在报告中给出各角色调用占比，并找出可无损减少的调用（例如 pending 回合不再做语义审查、格式失败不重复计费）。
可改：server-plugin/consistency-review.mjs、server-plugin/consistency-evidence.mjs、tools/playtest-assertions.mjs、tests/playtests/a3_whimsy.json、与超限相关的投影/历史模块（逐处列出）、相关测试。锁定：门禁规则本身（无裁决不发布原稿）、题集、判分器、world/、prompt/（静态 ≤10593）。
验收（每个文件单独运行）：tests/claim-review.test.mjs、tests/turn-gate.test.mjs、tests/turn-contract-client.test.mjs、tests/playtest-runner.test.mjs、tests/m3-consistency.test.mjs、tests/m3-consistency-evidence.test.mjs，以及为 F 类误伤新增的离线回归（用 sidecar 原文重放：修后 F 例放行、T 例仍阻断）。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3rv-tune.final.txt。

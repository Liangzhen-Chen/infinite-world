# T10 首次审核出处

本目录沿用同一卡 T10 的原 3 元增量额度，尚未调用模型或建立预算账。原 `existing-depth/` 作者候选、base 和全部历史证据保留。`event-provenance.json` 把 15 条共同事件分为原档直接支持的 10 条和新设计背景的 5 条，出处只取正式 `world.npcs` 字段及其哈希。

`authored-background.json` 为五条新背景提供独立设计事实、原关切出处和未解决结果。候选叙述只在 `associations` 中冻结为人物视角，不能反过来证明背景成立。每个新背景对应三至五人的既有问题网络，二人交谈不代表网络内其他人参加或获知。河湾缺少 `settlementProfiles.details.problems`，问题入口引用实际原目标内容，仍标为私有并只允许明确列出的公开说话范围。

新背景只在旧渡口公用水盏周边交谈，原 `features[1]` 的公共权限和哈希同时冻结。该子区域不代表整个渡口或其它场所开放，也没有取水、取盏、进屋、付款、签约或授职。十二位参与者的新增记忆补这个地点和一句范围说明；旧记忆、知情人集合及其它候选补丁均保留。

独立背景及人物候选后续须分别接受 L2 和 L4，秘密风险须逐项阅读。当前文件不是已审核历史，不能发布。`plan-v1-evidence/` 保留首次出处计划及冻结的原视角；之后依据 T25 的实际公共 feature 合同补了范围说明，没有覆盖旧计划。

最终准备命令为 `node tools/npc-depth.mjs --design world/design/w1-existing-depth-first-review.mjs --root world/drafts/w1/existing-depth/first-review --card T10 --authored-background world/drafts/w1/existing-depth/first-review/authored-background.json --prepare`。准备不调用模型；真实审核须等待主会话分配运行槽，并沿同一共享预算。

官方 prepare 及重跑零写入核验已完成：32 份候选、5 条独立新背景，合并审计零缺口，原 17 人 traits 保留。三份相关测试 27 项和 CORE 38 项通过，日志与源哈希见 `offline-report.json`。原作者目录的五份冻结 artifact 与 `4f0bfe4` 的哈希一致；本次没有新额度或模型费用，L2、L4 未跑。

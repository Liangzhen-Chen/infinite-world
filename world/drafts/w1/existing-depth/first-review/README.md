# T10 首次审核出处

本目录沿用同一卡 T10 的原 3 元增量额度，尚未调用模型或建立预算账。原 `existing-depth/` 作者候选、base 和全部历史证据保留。`event-provenance.json` 把 15 条共同事件分为原档直接支持的 10 条和新设计背景的 5 条，出处只取正式 `world.npcs` 字段及其哈希。

`authored-background.json` 为五条新背景提供独立设计事实、原关切出处和未解决结果。候选叙述只在 `associations` 中冻结为人物视角，不能反过来证明背景成立。每个新背景对应三至五人的既有问题网络，二人交谈不代表网络内其他人参加或获知。河湾缺少 `settlementProfiles.details.problems`，问题入口引用实际原目标内容，仍标为私有并只允许明确列出的公开说话范围。

新背景只在旧渡口公用水盏周边交谈，原 `features[1]` 的公共权限和哈希同时冻结。该子区域不代表整个渡口或其它场所开放，也没有取水、取盏、进屋、付款、签约或授职。十二位参与者的新增记忆补这个地点和一句范围说明；旧记忆、知情人集合及其它候选补丁均保留。

独立背景及人物候选后续须分别接受 L2 和 L4，秘密风险须逐项阅读。当前文件不是已审核历史，不能发布。`plan-v1-evidence/` 保留首次出处计划及冻结的原视角；之后依据 T25 的实际公共 feature 合同补了范围说明，没有覆盖旧计划。

最终准备命令为 `node tools/npc-depth.mjs --design world/design/w1-existing-depth-first-review.mjs --root world/drafts/w1/existing-depth/first-review --card T10 --authored-background world/drafts/w1/existing-depth/first-review/authored-background.json --prepare`。准备不调用模型；真实审核须等待主会话分配运行槽，并沿同一共享预算。

官方 prepare 及重跑零写入核验已完成：32 份候选、5 条独立新背景，合并审计零缺口，原 17 人 traits 保留。三份相关测试 27 项和 CORE 38 项通过，日志与源哈希见 `offline-report.json`。原作者目录的五份冻结 artifact 与 `4f0bfe4` 的哈希一致；本次没有新额度或模型费用，L2、L4 未跑。

首次真实轮已自然结束并停止付费请求，结果见 `real-review-report.json`：19 人通过 L1/L2，13 人为 manual，120 个已结算请求共 1.99097608 元。T10 上限仍为 3 元，预留为零；共享账保留 T06 的 0.083736 元未知预留。离线报告是运行前快照，不能代表这次真实结果。

12 个新背景参与者的 provider 响应缺少 `reviewedPaths`，其中陆青还把学识字田间雇工白蕙称为“学者”，构成真实身份措辞 hard。许苓另因原引用投影未包含陶芷 notes 中的母亲关节病而失败。36 份新背景原始 L2 响应的 `finish_reason` 均为 `stop`；许苓旧合同未持久化 L2 transport，结束原因未知，不能用 draft 的 `stop` 代替。候选和出处均未改，coverage 没有放宽。

19 条通过记录和五条独立背景已有逐叶、逐风险阅读 notes，但 13 条未过阻止原批与独立出处 L4 正式注册，整体未发布。只相关测试 27 项与 CORE 38 项再次通过。后续修订交主会话规划，原失败、费用、候选和来源证据保留，不重复抽签式审核。

T26 合入后按同一规划授权完成一次受控恢复：13 条失败各一次，共 0.41678608 元，全部完整三字段及逐叶、逐风险覆盖通过，finish_reason 均为 stop。原 19 条成功记录哈希不变，原 32 条真实记录由 incremental-proof.oldRecords 与 reviewRecovery.prior 完整保留；陆青仅将白蕙“学者”改为“学员”，许苓只补原陶芷完整 notes。T10 累计 2.40776216 元，余 0.59223784 元，T06 未知预留 0.083736 元未动。

恢复后的 32 人与五条独立背景已分别逐叶、逐原出处及 13 项隐私风险重读；原两批 L4 和受控/独立出处 L4 均已正式注册。费铠的四项 soft 核对结果见 recovery/l4-notes.json。原 manifest 发布预演通过，32 人合并审计零缺口，正式 baseline 字节未变；原作者五份冻结 artifact 与 4f0bfe4 一致。相关 29 项与 CORE 38 项通过，真实恢复收据、预算快照及逐记录哈希证明见 recovery/completed-report.json。以上为此次最新结论；运行前快照及首次 19/13 失败证据均保留，正式发布仍交主会话。

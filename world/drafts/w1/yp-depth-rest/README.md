# T06 候选与审核状态

榆坡原有30个完整档的合并候选通过 auditNpcDepth 和 validateNpcDepth，既有档案未写回。patch-plan.json 每条记录冻结实际 id/field/code 和 baseHash；before 存在 base.json。author.mjs 留存逐人作者内容，author-batches.json 登记每组3至4人。

知识新增仅使用本人的既有家庭关系、工作地点与当前目标。原十人的旧记忆全部保留，剩余二十人各追加一条两人一致的共享回忆。潘菊与任泊、曹芸与荀禾使用已有明确争议；其他八对仅将既有同村往来中的相认写成共同记忆，未指定新交易、秘密、物品、数量或已完成约定。新目标步骤均保持 pending。

2026-10-11 离线 prepare 不调用模型，30人合并视图没有榆坡深度缺口。tests/npc-depth-yp.test.mjs 与 CORE 共42项通过。调整作者分组后重新跑相关4项通过，测试原文在 test-results.txt 与 related-results.txt。

真实模型阶段在 L2 前受阻。公共 patchDraftRequest 要求返回 candidate，DeepSeek 持续返回 {candidate:{id,contract,patches}}；extractDraft 要求顶层为补丁对象，拒绝该结构。流水线自动重试，多个条目三次均失败。发现后停止真实调用进程，没有改共用工具、没有捏造审核或手改记录为通过。各人物 JSON 保留原失败；interruption.json 保存状态和错误原文。L2、L4 未完成，manifest 尚不能发布。

预算仍使用 F:/dnd/world/drafts/m4-object/budget.json。本卡 allocation 起点0.94801504元，增量上限2元，波次上限20元。25条已完成请求的日志费用上界合计0.15959304元，共享账已花费1.10760808元；终止时0.083736元预留尚未核销，保留在共享账，不假定实际调用免费。model-usage.jsonl 是本卡真实usage原文，没有密钥或模型请求正文。

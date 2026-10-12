# T17-A 零模型准备

地点投影修正、旧拒发回放和反例检查已通过。十场正常 HTTP 预检仍有四场被严格出处守卫拒绝，`preflightReady=false`，不能提交 T17-B 付费运行。完整正式世界未删减，原断言保留，预检脚本使用本地确定性响应，不计作 M2 的真实叙述、账本或盲辨验收。

`preflight.json` 核对河湾32人的当前档 hash、原18人及逐事件参与者闭包。榆坡30人沿原 publication-batch 的 L1/L2/L4/事件发布预演核验为零差异，证据单列为 `yupoPublished`。本卡保持原动态守卫的河湾32人授权范围，没有按“已经发布”整批豁免实际正文。

`frozen-inputs.json` 保存当前完整 `loadWorld`、`loadPromptBundle`、十场场景及真实 host 转换后的静态消息。`preflight.json` 保存源文件 hash 和 host 转换器、util、config 的 hash。`zero-model-requests.jsonl` 保存正常 runner 产生的主持、一致性、审稿请求和真实工具对象，离屏请求复用原 `npcPlanningRequest`。唯一源码改动是一行导出该现有函数；没有复制请求模板或开启规划预算。

`guard-check.json` 的通过仅指出处守卫检查。两条旧拒发请求逐字 hash 不变，均可无损回放；正式地点 id/name、固定消息位置和整段内容 hash 同时匹配时才授予投影。公开行篡改、秘密混入及真实工具对象仍按原出处闭包处理。

正常预检完整走完 guide、npc_delivery、npc_home_visit、npc_offscreen、npc_private、npc_social。npc_offscreen 的真实 HTTP 时间推进超过十天。其他四场的停止回合和所有原断言实际结果均在 `preflight.json`，没有将本地模拟回复的结果写成真实模型通过。

剩余输入缺口精确见 `dependency-gaps.json`。实际检索行只有 `settlement_loc_bs_yupo_issue_problem_yp_1`、`settlement_loc_bs_yupo_tax`、`settlement_loc_bs_weiting_tax`、`settlement_loc_bs_liquan_tax` 和 `settlement_loc_bs_liquan_issue_problem_lq_3`。旧榆坡公开问题已有源证据，host 转换后进入 user 场景容器，旧 guard 不授予该位置投影；另外四行尚未逐行绑定公开出处。审稿实际断言另携带已发布榆坡人物 ID，旧 guard 将这些 ID 展开到全档闭包。郑汐和栾佩的闭包额外牵出王蒲、焦岩，这些不是新的地点投影。

后续只需补这些实际行的原源证据、host 场景渲染位置绑定及榆坡实际 ID 的逐人已发布凭证。无需等待苇汀、砾泉、桑坂整村人物审核。补齐后重冻完整输入并重新完成十场预检，再交 T17-B；本卡没有扩展旧公开投影或改变原世界源。

旧 run `t17-m2-20261012-01` 的失败、恢复计数和账本未改。新轮建议 ID 及旧预算证据只作关联，没有创建新预算或释放未知预留。历史费用尚未去重，`paymentReady=false`。旧 spent 0.28484248 元、未知 reserved 6.372890000000001 元仍保留。

运行 `node docs/测试报告/20261012-T17-new/preflight.mjs` 会在当前缺口下以退出码1保留拒绝证据。随后运行 `node docs/测试报告/20261012-T17-new/guard-check.mjs` 核验两条旧拒发回放、反例和所有冻结请求。相关三个测试文件及 CORE 的实际结果分别在 `tests-related.txt`、`tests-core.txt`。首次相关测试缺 worktree 内酒馆 tokenizer 路径；接入既有安装 junction 后重跑通过。未跑全量测试或构建，未调用外部模型，未部署或操作用户存档。

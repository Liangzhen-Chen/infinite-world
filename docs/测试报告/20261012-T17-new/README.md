# T56 零模型来源续修

原十场正常 HTTP 预检已完整走完，`preflightReady=true`。`paymentReady=false`，T56 在历史费用归属处卡住，T17-B 不能开始付费运行。完整正式世界、十场输入和原断言均保留；本地确定性响应不计 M2 的有效 N、叙述质量或账本验收。

榆坡30人沿原 publication-batch 由正式 publisher 重放 L1/L2/L4 与事件闭包，结果仍为零差异。当前人物 hash 逐 ID 验证后进入动态 guard，河湾32人与原18人的原凭证继续核验，不要求其他村整批审核，也不要求全世界 hash 等于旧 T11-B 发布时的值。

原四处来源依赖已接入实际已审 entry 与 current source。覆盖榆坡 problem_yp_1、榆坡/苇汀/砾泉税章和砾泉 problem_lq_3；完整续跑另遇桑坂 problem_sb_2 与 problem_sb_4，同样逐行核验原审核和公共投影，未授权桑坂人物全档。`runtime-guard.mjs` 只登记现有 `WorldEngine.scene` 在正常 HTTP 服务中实际渲染的场景，公开行的 span、contentHash、sceneHash、documentHash 和 source 保存在请求证据中。host 转换后的 user 容器与 review 的 sceneBefore/sceneBeforeReply 使用同一权威，不按消息 role 或人物名字整体放行。

`frozen-inputs.json` 保存完整 world、bundle、十场场景与 host 输入，源正文和 hash 一并冻结；`preflight.json` 保存发布凭证、逐人闭包与真实渲染权威。`zero-model-requests.jsonl` 保留主持、一致性、审稿、规划和工具对象，并按实际场景记录 roleCoverage。三人对白只填入明确的零模型占位台词，使正常盲辨请求进入守卫；本地判断固定 unknown，不记为声线通过。离屏场景通过实际 HTTP 推进到第16320分钟。

`guard-check.mjs` 保留原27项检查类型和两条旧拒发请求的逐字 hash。榆坡已逐项批准，未批准正文与工具目标反例改用砾泉慎书，避免将已经合法发布的榆坡人物伪称为未批准。新增实际 HTTP 场景、错公开 span/hash、假现场及私密混入检查；正式公开投影不能授权真实人物工具目标。所有冻结请求无损重算，实际无未批准依赖。

`payment-history.json` 只读核验原账。初版与 resume 的 request/attempt 逐项前缀一致，同 run 只计最新累计值；24笔已结算请求分别关联原请求 key、responseId、用量和时间，spent 0.28484248元，未知 reserved 6.372890000000001元全部保留。没有新建预算、释放未知预留或增加模型调用。

更早 M2 报告上界5.770631280000002元，可与原 usage 日志310笔累计核对。报告直接承载200笔用量，其余110笔缺少该旧 run 的请求或 responseId 关联证据，包含12笔规划、90笔一致性、5笔改写和3笔失败验收；逐笔 label、timestamp、costUpperYuan 已列在 payment-history.json 的 legacy.unattributed 与 gaps。最小补证是这110笔各自的原请求/run/responseId 关联，不需要重跑模型或改旧账。旧历史、新 run 已发生与未知预留、已授权新增8元相加上界20.42836376元，低于单轮30元；金额未超额不能替代请求归属证据。

相关 playtest-runner、playtest-npc-evidence、playtest-budget 测试及 CORE 已实跑通过，原结果分别保存在 tests-related.txt 与 tests-core.txt。守卫反例和旧拒发回放结果见 guard-check.json。未跑全量测试或构建，未调用外部 API，未修改引擎、世界正文、用户原档或酒馆部署；用户酒馆可玩内容没有变化。

# 10-22 全面审查发现（主会话汇总，逐条核实后修）

## 核心引擎与原语（Opus 审查员）
- P0 action-router.mjs:583-584、routing-programs.mjs:25：按语料 subject（roof_followup/personal_news）特判——已核实：仅见于 tests/fixtures/a3-intents-v2.json。
- P0 action-router.mjs:228-247/364/440-458/561-570：照抄语料原句路由（/购买|买下|买两|买一/、due==='明天日落前'、'能花多少钱'、wait_without_quests），从 intent 文本正则取数量——已核实。
- P0 open-actions.mjs:25/38-40：effect.at==='明天早晨'、subject==='renewal_quote' 拼固定序列、询价文本写死——已核实。
- P1 action-boundary.mjs:9：含汉字的普通 Error 一律转成前置拒绝，内部故障被吞。
- P1 primitives.mjs:177 + primitives-runtime.mjs:861-866：TypeError 包装成 E-PRIMITIVE-EXECUTION 后被记为终局拒绝。
- P1 primitives.mjs:115/189、primitives-runtime.mjs:371：执行时改全局注册表（declareHoldingWriter、SOCIAL_VERBS.add），回放依赖进程历史。
- P1 legacy-primitives.mjs:303-307：created/holdings.entities 变化未按 involved/eventId 过滤，自治变化记成玩家 applied。
- P1 整份克隆：primitives.mjs:60、primitives-runtime.mjs:725/837、engine.mjs:524。
- P1 无界增长：consentEvents 只追加且倒序全扫；primitive_receipt/open_proposal 带完整快照；openUsage 全扫。
- P1 全世界遍历：capacity 扫全部 effects；adaptLegacyExecution 遍历全部 records 并 openLedger 全量重算；createRoutingContext 重建全世界 features；rxValue 每次重编译。
- P2 action-rite.mjs:216-218 预览成本与提交不一致；primitives-runtime.mjs:337/346 按 id 前缀推断 activity；action.schema.json receipt 与实际产物脱节。

## 判分器与场景加载器（Opus 审查员，探针已证）
- P0 a3-score.mjs:458-469,386：限定词只核 ID，描述与数量被忽略（->self:2 给 999 判对；heal 碰上扣血判对）；自检 503/507 行固化了宽松。
- P0 a3-score.mjs:578-585：伴随效果可满足必需签名（时间体力扣减满足“吃饭涨饱食”）。
- P0 a3-score.mjs:962/988/996：裁剪类越界只要提交且签名匹配就给分，不核裁剪数值（熟练度 1→2699 也过）。
- P1 a3-score.mjs:906 劝说/战斗失败分支无约束；548-552 条件法律后果按 4 行语料写死（主会话裁定、实现被写死，主会话审卡失察）；30/87/111 设置写入者 kinds:['*']、职位接受语料自带任意 authority；80-88 instances 循环未调 setupRowLoader 致多个模块成死代码；186-189 present 直接改“正常”并删除睡眠/昏迷效果；physical.mjs:295-307 距离只在写死的法术种类下核对却记 verified；a3-acceptance.test.mjs:14 结构测试已红（25 行空签名配提交路由）；967 拒绝不看原因；977-984 构造器指标只是重放模型提案，测不到“无 LLM 构造器”，分母 206 非 231。
- P2 notes 被丢弃；server-plugin 的 restore*Snapshot 仅供测试使用。

## 世界数据、前端与测试（Sonnet 审查员）
- 已确认无问题：baseline.json 只新增人物（中途删改已经审批管线还原）；新增实体无悬空引用；静态提示 10593 未超。
- P1 extension/tools.mjs:102：law 新参数 request 进了静态 schema，并删描述字凑平预算（前后 21572 字节一致）——应走 world_act 目录槽位，描述恢复。
- P1 tests/s3-sv.test.mjs:27-28：原断言改成恒真空断言（“入职验样”全仓不存在）——恢复原断言。
- P1 8 个机制测试读活语料：a3-certification-receipt:16、world-content2:58/71、a3-f5-f6:18、a3-owner2-G:21、a3-owner2-R:17、a3-owner2-T:20、a3-owner2-w:23、a3-r13:15——冻结 r12 快照并改读快照。
- P1 office_exam_life_6（尹葛）考点设在 24km 外的 bld_bs_guild，28 名考官中唯一跨聚落——改到其所在聚落或在白石另设考官。
- P1 手改已发布数据未走发布管线：loc_hw_northwood.site、loc_hw_gate.notices、bld_hw_qingdeng.publicConversations、bld_hw_school.site.manager、怪物聚落 site_ms_* 物主改组织、bld_hc_*、28 个职位、npc_hc_yicen/liwang、faction_huancheng_government、13 名考官（13548407 直接写入，无 L1/L2/L4 回执）；monster-society-3 回执需重审。
- P1 为迎合题面改世界数据：recipe_w3_fish_broth minutes 30→60 并改 process 文本（D16）；shop_hw_forge restock 加 item_mining_pick（L4）——需依据，否则回退。
- P2 daily-b2-events2 同一函数注册两次；m4-batch2:80 与 w2-s3:136 自身精神法术反例改为“自我解除成功”（待核依据）；ledger-price SURVEY 新增 4 个豁免与推进金快照哈希重生成（待核）；a1-daily-probes D20 换入口并写死 stamina=94（待核旧入口覆盖）。

## 领域模块（Sonnet 审查员）
- 无已证实 P0。
- P1 native-primitives.mjs:9 eventId 摘要含 d.patches.length 与 records 数，O(n) 且随无关状态漂移，可能破坏去重。
- P1 magic-consent.mjs:22 spellConsentGrant 每次复制全部记录并克隆文档，推进循环内逐效果调用。
- P1 faith.mjs:178 consent:true 可顶替 NPC 同意。
- P1 场景硬编码：environment.mjs:96-114（old_shoe、tripwire_falling_log、mechanical_lock、item_smith_tongs/item_iron_wire/item_water）、education-state.mjs:16、items.mjs:350（whole_city_gate、250ml）、agriculture.mjs:445（item_hoe/item_sickle、15 亩/公顷、×0.5）、quest-board.mjs:40、governance.mjs:86、subjective-view.mjs:6（river/coast）、map-state.mjs:18。
- P1 文本特判：combat.mjs:46 /旁|附近|小路/；primitives-learning.mjs:112 /练|教|演/。
- P1 snapshotVersion===1 改变运行时规则；restore* 接口（restoreCoinAccount 从 src:genesis 铸币等）无 origin 守卫。
- P1 写入者标错：money.mjs:204 spendCounterCoins 运行时以 money-snapshot 写账；education-state settleDemonstrations 运行时以 education-initial 写入。
- P1 全世界遍历：governance.mjs:115、world-events.mjs:36、quest-board.mjs:48、facility-state.mjs:88-94、primitives-movement、local-exams examinationSeats。
- P1 workstation-services.mjs:35 workstationFee 写死 holder='player' 且每次算 digest。
- P1 items.mjs:30 assertEdibleItem 查 instances[0] 非选中件；primitives-body.mjs:44 扫 d.patches 误拦、无 patches 时静默跳过。
- P2 primitives-checks 重写检定有漂移；studyBook 复制门槛；physical_contact/combat_encounter/conversation/mark_reaction_batch 不清理；action-affordances:75 未传 document、:169 逐选项 actionPermission；sites.mjs:226 去掉 inside() 前置待核；effects.mjs:403 全登记为 emit tell；restoreOfficeRemovalSnapshot 改 minute 无 try/finally。

K16 R6班次对齐和课程记忆已实现；性能仍超出尽量≤3%的目标，不能作为全绿结果交卡。保留R5每聚落每日一次的持久化计划，没有回到日内反复重算或进程决策缓存。

取水/觅食在成员已有劳作、家务时段内分配真实阶段，预约不能借用，睡眠/午休不计采集工时；不足时按真实容量截短。真实阶段until与全局boundaryUntil分开，出发/采集结束/返回不再成为新推进刻。近水仍计家务，有限库存、实际路程、旱冻污盐与缺口记账保留。夜行服务按全日机会成本选工，并为主要觅食者保留可容纳完整班次的长段。

为保持两个既有边界之间的读取真实，catchUpLocal只补齐当日有生计班次的成员，并把局部水位/课堂在场区间放进state.scheduler.subsistence；下一正式刻按同一水位恰好结算一次并清除。不是增加全局推进刻。生计计划仍按subsistence-plan:<settlement>记录day、各户water/foodTrips及workers的duties/chores，日内O(1)读取。

教育课程环境用stateMemo及包含式记录依赖；课程成员比较限于教师、适龄学生、携书者、师徒相关人物，保留发现新教师/新师徒边的入口。适龄集合按日、created和family.people记忆，师徒按实际关系对象记忆；死亡风险累计不作为课程年龄。预约原始world_event必须失效。十日和六十日优化前后最终状态SHA均相同，见K16-r6-cache-equivalence.json。

手算：30去程+80采集+30返程=140分钟，08:00→10:20返回，全局仍只用12:00边界；夜行300+20=320劳作，780分钟睡眠不收获。新测覆盖预约断段、重复路程逐趟扣工、休息日家务、夜商劳力与长采集段、非边界读取/存读档一致、课堂出席不重复。教育60分钟仅记minutes=60、completedMinutes=0、技能0，保留120分钟成课门槛；这是更正新测试的账目字段，不放宽原意。

三十日审计：305/305家户，加23无户，共9840户日；相对R5逐户逐日shortfall改变0行，库存守恒残差0。城镇缺粮721、怪物0、无户60；公仓与远方缺水各30。两个未展开个体共60个来源未知的缺粮/缺水户日，已统计，不展开远方。原遗漏55中52户已纳入，另3户为已取消的错误展开产物。原基线漏记52户，严格同户比较城镇缺粮1348→380；新增城镇户341，合计721。全部城镇缺粮行都没有可售口粮货架，保留给TOWNFOOD，不改商店或市场代码。

[三十日完整审计](F:/dnd/logs/sessions/K16-r6-audit.md)

性能三对30日×2（基线/R6/去城镇远路觅食对照，秒）：78.116/130.298/130.838；78.293/133.595/130.551；77.186/133.785/129.273。均值77.865/132.559/130.221；R6/基线=1.702425，慢70.24%。历史R5为1.734倍。三对均本会话独占Node测量，基线HEAD每次核对9729614a且无跟踪改动；主会话外测perf-gate为准。

十日计数buildScheduleHeap：R5 2509→R6 1733（基线1745）；计划计算3014，日内readDailyPlan=0；课程实际派生172次。10日剖析日程堆包含时间3.980→2.779秒，教育课程2.176→3.294秒，状态/记录记忆2.784→4.021秒，复制1.840→1.206秒。包含时间互有重叠，不相加；剩余性能目标未解决，交主会话据剖析决定后续卡，不再换等价缓存修法或减少真实工时。

[性能原始样本、剖析和复现工具](F:/dnd/logs/sessions/K16-r6-perf.md)

剩余性能线索：education-state.mjs的scheduleRecordDependencies仍包含water_cycle与physical_feature，课程环境沿用水源可用性/污染浓度/饮水水位投影。R5以后生计班次已晨间固定，课程读取这类实时水源事实是否仍有实际间接消费者，需要主会话结合路线/能力调用核对；当前只记录疑点，未未经FIELDS验证删依赖。60日追加剖析用于观察长跨度中课程、记忆和状态复制的实际占比。

为优先完成验收和末段发现的三处怪物夹具修复，取消了可选的追加60日剖析；已完成10日剖析和三对30日×2。怪物夹具修后定向3/3、T159独立14/14、T162独立7/7通过。若最终整文件仍因卡片时限未完成，不能记作通过，须主会话补跑tests/monster-society-content.test.mjs。没有删除/跳过测试或放宽原断言，夹具逐处依据见验收表。

最终受影响255文件；卡内必验72，其余191交主会话合并关卡。逐文件结果及未完成项目见验收表；每文件一个Node，最多两个测试进程，TEMP/TMP均为F:/dnd-tmp。FIELDS摘要：`{"tests/education.test.mjs": {"seconds": 190.02, "summary": ["# pass 14", "# fail 0"], "timeout": false, "code": 0}, "tests/s5-law-water-source.test.mjs": {"seconds": 3.68, "summary": ["# pass 12", "# fail 0"], "timeout": false, "code": 0}, "tests/s5-law-subsistence.test.mjs": {"seconds": 14.53, "summary": ["# pass 38", "# fail 0"], "timeout": false, "code": 0}, "tests/record-index-check.test.mjs": {"seconds": 2400.06, "summary": [], "timeout": true, "code": 1}, "tests/npc-schedule.test.mjs": {"seconds": 1308.34, "summary": ["# pass 12", "# fail 0"], "timeout": false, "code": 0}, "tests/perf-s5-cache.test.mjs": {"seconds": 1.72, "summary": ["# pass 16", "# fail 0"], "timeout": false, "code": 0}, "tests/entity-view.test.mjs": {"seconds": 2.15, "summary": ["# pass 7", "# fail 0"], "timeout": false, "code": 0}}`。非预期失败/缺失：`[]` / `[]`。

[逐文件验收](F:/dnd/logs/sessions/K16-r6-validation.md)

金快照未重生成。相对9729614a 12228个字段、相对R5 22735个字段，均列旧→新及原因，未解释0。官方golden-diff工具截断至401项，另以完整递归表覆盖所有场景步骤；基线导出复用R5已修消息路径的真实输出，R6临时导出也仅将r.messages修为r.result.messages，9步消息全部相同。numeric数学函数hash逐项与R5相同，状态full=28bdad17eb51dadb7287e711ac456641b752137091e463130dc55a37c136bf74，quiet=de31e4d278f8f1b9dfa524bb3f5c6b4dfdab4ad3a36b21d649cea2c843ad32bd。117条计划记录的新增数值扫描无非整数。

[金快照逐字段表](F:/dnd/logs/sessions/K16-golden-table.md)

范围扩展仅两个必要接点：population.mjs把原样lifeRoutine移到npc-state并兼容转导出，供未具象名册派生原有作息；education.mjs接收局部生计成员已经发生的课堂在场，防止漏记/双记。其他卡的照护、继承、劳力与agriculture函数未改。本树保留主会话的纯地理距离缓存修改。

交接剩余：性能未达尽量≤3%；record-index-check的FIELDS在2400秒未完成须主会话外跑；怪物完整文件最终复验若因290分钟时限中止，需主会话补跑（修后三项定向通过，不作整文件通过）；advance-registry仅full/quiet金快照差异由主会话审核后统一重生成；remote-generation仅基线同名第3子测（carrier restock 0），沿用此前按名核对证据；未跑的受影响清单交合并关卡。

未提交。最终改动路径检查与临时工具清理见K16-r6-path-audit.json、K16-r6-cleanup.json；清理时仅移除本轮本人创建的临时工具/诊断文件，保留原始最终数据与主会话的.base、.base-index、.base-src。没有按名称结束进程。

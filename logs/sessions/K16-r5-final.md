# K16 第五轮交接

按清晨/日界保存生计计划，日内不再随库存、进餐或来源记录重排，存读档继续同一班次。功能与确定性通过；性能未达到+3%参考目标（相对基线均值+73.40%），日程堆次数仍高于基线，需主会话据实决定后续提速。

记录：每聚落records[`subsistence-plan:<sid>`]={category:'subsistence_plan',day,households:各户取水/食物班次,workers:各人duties/chores}；family.subsistence=[day,{人员:[聚落,家户键]}]每日一次原子值。只存整数分钟、来源ID等执行事实，不存评分、浮点距离和世界feature副本。家户依key稳定排序，晨间临时视图预占有限篮子，实际库存/账本只在兑现时扣。

调度器沿既有advance hook在首次推进补当天计划、日界全部处理后生成新日计划；日内O(1)查目录。移除dailyPlan/readDailyPlan及跨全户worker失效层；日程包含式依赖读subsistence_plan，执行仍读真实有限库存、水源污染/冻结/盐度/体积、病倒/照护、拘押及道路。临时变化取消兑现或记缺口，不重写晨间决定；旧日进餐重放不倒退计划。

主要改动：household-subsistence、advance-registry日界接线、npc-life进餐、npc-schedule失效、education-state记录依赖及4个相关测试。保留主会话地理纯值缓存及R2/R3/R4修复，未改照护/继承/劳力函数、agriculture或市场商店代码。架构直引曾失败，已用既有钩子修正，未新增例外。

## 确定性与测试对齐依据

对象目录单纯排序仍会被time的diffPatches深合并，导致新成员插入顺序随短步不同；改[day,people]后整体原子替换。人员晨间归属固定，流动者下午换地点不丢计划。family完整7项、整月日程深比较及重载均保留严格断言。

测试改动只对齐R5：工作预算/近水测试显式先生成晨间计划，原15/25分钟断言保留；患病不再当日改派另一人，新增取消旧工、计划不变、当日缺口及次日由健康者接手的断言；旧跨全户缓存测试改为健康同伴可复用、患病/旅行者自身必须刷新；库存变化不改日程而新日计划必须失效；补上单聚落两户有限预占、耗尽/封路/污染、无人照护重病家属、旧日重放和存读档锚点。来源转私有时沿用原source权限谓词拒绝采集，租约在开工前到期时分组/分配统一用晨间视图，不重复派工。未删/跳测试或放宽守恒断言。

t164手算：第14日雇工取水25分钟、觅食268分钟、通勤48分钟，480−25−268−48=139，工资ceil(30×139/480)=9。遗产40完整继承后余31；测试新增workedMinutes139/paid9，同时保留heir、estate40、allocation40的原意。

## 性能

|组|9729614a墙钟/用户CPU秒|K16墙钟/用户CPU秒|去城镇远路觅食墙钟/用户CPU秒|
|---|---:|---:|---:|
|1|86.41/101.34|150.47/176.19|142.56/166.89|
|2|85.90/100.81|148.49/174.77|144.87/169.75|
|3|88.96/103.50|154.07/182.99|152.45/178.52|
|均值|87.09/101.89|151.01/177.98|146.62/171.72|

实际规划67488→3014（274×11晨间）；原dailyPlan层已删除。堆2499→2509（基线1745），对照2243，并未回到接近基线。正式K16+73.40%，城镇对照+68.36%；详见K16-r5-perf.md及9份pair JSON，主会话外测阶段perf-gate。

## 30日审计

305/305名册家户+23无户组全覆盖。R4→R5缺粮户日：公仓0→0、城镇722→721、怪物0→0、远方0→0、无户60→60；缺水公仓30、城镇0、怪物0、远方30、无户60均不变。仅城镇265户日的缺口分布随有限篮子排序改变，总缺粮减1、总饱腹缺口减150；其余类型逐户日不变。城镇721全无食品零售货架，留TOWNFOOD。未展开郡仍原2名个体、60未知来源户日，无推进展开。有限库存守恒差0。详见K16-r5-audit.md/summary及原始after-30。

## 验收与金表

CORE engine22/storage14/plugin7通过；先重导248项动作，再catalog4/registry7/arch5通过，advance仅full/quiet两项金差异，3运行时通过。卡内64文件结果{"通过": 61, "仅两项金差异，待审核": 1, "超40分钟，外跑": 1, "基线同名失败": 1}；全部invariants、全部s5-law和相关改动测试按逐文件独立Node运行，保留既有TODO。影响253文件，剩余192交合并关卡；remote-generation仅同名case3，与已核对9729614a基线按子测名一致。

关键末版完整结果：

- npc-schedule：153.39秒，# pass 12，# fail 0。
- npc-life-t164：211.11秒，# pass 8，# fail 0。
- invariants/i31-total-order：84.72秒，# pass 18，# fail 0。
- npc-life-family：215.24秒，# pass 7，# fail 0。
- save-roundtrip：115.94秒，# pass 6，# fail 0。
- monster-society-content：734.63秒，# pass 33，# fail 0。
- npc-life-health：362.7秒，# pass 7，# fail 0。

完整FIELDS：education10项通过202.38秒（R4曾40分钟超时）；entity-view7、生计30、水源12、cache16通过。其他FIELDS完整结果/外跑清单：[{"file": "tests/record-index-check.test.mjs", "seconds": 2400.09, "timeout": true, "failures": []}]。不把超时计通过，详见K16-r5-validation.md/json；诊断preload运行不作验收。

numeric functions全部不变，state full=e5c6daf928d2383a1b21903c1300022e88ab28531c24835f0e6cec209d94b7c8、quiet=dfbfd3ef986ac747cc1528a135f1aee7bd91bb6f7f7ad7ede348e1ce5aa95bb9，因晨间事实/固定班次结算变化。金表相对9729614a 12099字段、相对R4 1246状态字段，完整旧→新和逐项原因见K16-golden-table.md、fields.json及R5-delta-fields.json，未设置UPDATE_ADVANCE_GOLDEN、未改测试金快照。

字段粒度与R4一致：等长数组逐元素展开，不同长度数组整体对照。公共dump误读r.messages，旧导出未含消息；本轮未改公共工具，临时改读r.result.messages补导两树。补导前后状态逐步完全相同；本轮基线与K16的9步实际消息也全部相同，见K16-r5-golden-message-check.json。R4旧产物只对比状态，不将缺消息误称空消息。官方摘要另见K16-r5-golden-official-summary.txt。

## 进程、清理、下一步

队列交接曾约15秒超过3个Node/2个测试的上限，已如实告知；随后使用共享文件锁按本人PID及创建时间统一限制所有启动，未结束任何外部进程。超时只停本人的Popen。诊断加载只附加差异/工时捕获并调用原断言，未计完整通过；临时脚本、队列、探针和本模块pyc在交付前删，清理见K16-r5-cleanup.json。

无Git写操作/提交、无部署、未读secrets、未碰原存档。禁区路径自查及diff格式结果见K16-r5-path-check.json。主会话下一步：审核金表统一重生；补合并192文件及必要的FIELDS外跑；外测perf-gate，依据真实行程/堆成本决定后续通用层提速与TOWNFOOD；由主会话代提交。

同窗口10日自身/包含剖析见K16-r5-profile.md及profile-groups.json；不以函数改名/迁移位置制造净收益，最终性能仍取三对同轮配对。

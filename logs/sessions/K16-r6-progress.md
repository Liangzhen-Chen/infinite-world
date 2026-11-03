# K16 R6

2026-11-01 09:07 UTC 开始，13:57 UTC 停手交接。保留 R5 持久化计划；本轮对齐作息边界、课程包含式输入记忆。不得改市场供应、不得提交或重生成金快照。

下一步：实现时段内真实旅程、收窄教育输入；机制/FIELDS/确定性与 CORE、大清单；30 日审计、三对性能和刻数、字段表；删除临时工具。

09:37 UTC 实现冻结（source-state.json记六个生产模块摘要）。R5计划记录仍每聚落每日一次，R6 duties附原作息boundaryEnd；phaseUntil仅供内部实际结算，堆不再为生计travel.arrive加刻；返回后仍恢复正业，真实通勤也在原时段内结算。householdWorkTime从chores扣同量真实分钟，不把整个被占作息段当劳动。真实夜行作息、跨午休/日间睡眠、休息日家务均覆盖。为复用未实体化名册成员的已有家务作息，将lifeRoutine纯函数从population下沉npc-state，population保持重导出；无其他population行为修改。

新发现的输入逐个保留保证：最初完整限定08–17排除了06–18长班；之后补上真实夜行作息、尚无npcSchedule的名册成员lifeRoutine、休息日仍需家务，不能靠缺食换速度。最终审计K16-r6-after-30.json：305/305正式户+23无户，共9840条，与R5每条shortfall完全相同（changedShortfallRows=0）；库存残差0。城镇721缺粮户日；公仓30缺水；怪物0；生成远方30缺水；无户60缺粮/60缺水，其中两个未展开郡个体来源未知60户日，时间推进未展开。

课程环境用stateMemo包含式依赖；sameCourseInputs只比较教师、适龄学生、携书者、师徒相关人。无关成人非识字技能与household_forage不重派课；预约原始world_event必须失效（新手算240分钟预约回归，FIELDS通过）。其他NPC字段仍逐项核对相关人，保留教师失去识字的断言。

初步10日计数R5 2509堆→R6 1714（base1745）；计划3014=274组×11晨间，日内无readDailyPlan。计数时有其他验收，仅作计数，不能当性能墙钟。三对base/tip/去城镇远路觅食由K16_r6_pairs.py排队，使用全时段文件锁确保本会话仅一Node，不受早期开跑的测试控制器忽略exclusive标记影响；正式结果待产。

09:54：长测PID47216 record-index-check FIELDS约16分钟，PID50180 npc-schedule FIELDS约10分钟；均用2400秒本人Popen限时。旧record PID62772在最后生产改动后本人核验birth/命令并停止，869.84秒退出15属被新状态替代，不计失败/通过。最终68文件主队列session32660；FIELDS record98430，schedule27262，edu/perf/entity7131；pairs80503。所有Node由K16_r6_run.py共享PID日志和字节锁，≤3 Node、≤2测试。不得使用任何按名称结束命令。

金表已更新：K16-golden-table.md与K16-r6-golden-table.md；相对base12328字段，相对R5 22284，其中21485属subsistence_plan字段；解释表unexplained=[]。临时导出器只将公共工具r.messages修正为r.result.messages，未修改公共工具；复用R5补导真实消息的base，9步消息相同。数学函数全部同R5；新state full=a5fb006ea697e2c3f3a082a41e40df036f90e69223420e2d8bc70df6b1d0898b，quiet=6019ae51dcef5debd45fc72c82456bbdae0a6152a18eb0f78fe4e88428c34b08；原aging.riskAge末位30.752777777777762→30.752777777777766为原浮点累加随刻数路径变化，已逐项说明。新增计划数值必须扫描确认整数。

受影响254文件；本卡必验68（R5清单64+population四个同模块测试），剩余191交主会话合并门禁。export-actions已重导248；catalog/reg/arch通过；advance仅full/quiet两个金快照预期差异（不重生成）。正在跑全部其他清单。完整摘要K16-r6-results.jsonl，TODO保留但不算实际断言通过。交卡前清理本轮所有临时脚本、锁、pyc和调试中间文件；保留最终数据/报告与原有.base等主会话文件。不要提交、不改禁区。

10:00 最后生产修改仅household-subsistence：真实作息的预约间隔必须断开，不能把已经承诺的会面当作野外休息；夜间按最长无预约连续可用工时截短篮子，重复出行逐趟扣路程。新增两例（本文件共35例）：140分钟旅程在10–11会面后11:00出发/14:20返回；夜作两次约会将240分钟容量拆成4份×2趟，每趟60路程+160采集，总440，8份全供。最终30日完整JSON与09:37版本完全相同；最终golden完整JSON也完全相同（final-check各文件）。因此正常基准、浸泡和快照字段表证据仍有效；不重跑旧无预约结果来制造数量。

10:06：因最终规划路径调整，核验birth与命令后停止本人旧record PID47216（不是测试失败），重启最终FIELDS record session58844，当前PID32028，40分钟水位约10:47。此前NPC-schedule FIELDS整文件12项通过，1158.81秒；perf/entity FIELDS16/7通过。课程/日程记忆代码09:37后未改，复用这项有效证据；新增分段规则的源模块FIELDS35例另跑session40221/原队列79950待结果。最终普通必验主队列32660仍在推进，10:12活跃monster-content PID15804；其余旧控制器有些仍在等待全局门禁，不要误判Python控制器为Node测试。

辅助任务：pair三组九样本80503；独占最终10日计数8105、剖析7446；最终golden-check66723已完成且同旧R6，最终audit-check2818已完成且同旧R6；numeric31510已完成。临时exclusive_job持全程字节锁，从而连9:38前导入的旧测试控制器也不能在测量中启动Node。此后不再改生产代码，除非验收发现具体回归。

10:33 最终生产变动仍仅subsistence：夜行家庭的服务机会成本必须累计当天所有真实服务时段，不能继续只算08–17；并在分配短取水时保留最低机会成本成人能完整执行的长采集段（若别人取不了，仍回退保障水）。真实烟苔家之前空闲岩芽取水158后，烟苔被派451分钟觅食；现烟苔00:00–02:38取水，空闲同户成人06:00–13:31采集，傍晚交易继续。青芷家由另两位空闲成年人分别取水/采集，青芷照常服务。无市场/商店改动，无禁用生计。新机制手算：夜行商贩660服务分钟应计成本；同户空闲者可承担75水（真实2km往返60+取水15）+80食共155；长任务时315水+320食>480，合理分派两成人，守恒保留。自建新例曾误写就地水15（实际有路）；已删天气扰动并分别断言75/80/155，择工与服务保护意图未改。

10:53确认：最终monster-society-content全文件33通过709.22秒（此前两个交易场景失败，根因及修法见上）；其独立T159文件14通过67.18秒；最终subsistence FIELDS37通过12.94秒。最终两个目标交易子测单独诊断也2通过，诊断不算整文件验收。T159/T162现在额外逐文件独立跑，避免父文件预加载遮蔽导入；补draw-water9通过9.57秒，必验清单共71文件（254影响表的剩余仍190，含7个额外直接测试）。T162独立尚待结果。

索引旧FIELDS PID32028因最后择工修正由本人核验birth/命令后终止，不作验收。普通record PID43656于10:37启动，含最终生产代码，保留运行。最终FIELDS record新session40869于10:53排队；不要再重启。最终CORE/同步/i31/family/t164/schedule/save队列79651，最后export session76010应先等完成（此前已重导一次，动作仍248）。仍保留所有原断言。

最后择工版本30日审计K16-r6-after-30-assignment.json已完成，9840条shortfall仍逐条等于R5（0变化）；canonical audit待用该版本覆盖。golden重新导出5436、numeric79761，需待完成后重跑K16_r6_fields.py并更新金表（原先12328/22284数字仅旧R6，不可直接当最终）。pairs/count/profile都因全程字节锁还在等待测试Node归零，预计之后才启动，未混入旧代码样本。距13:57停手尚充足，继续等待并汇总真实结果，最后清理所有本轮临时脚本/锁/中间调试数据。

12:30 R6 current production freeze: 12:20:02 UTC. IMPORTANT overrides earlier partial evidence: npc subsistence slot.until is the real phase end, boundaryUntil is clock-only; catchUpLocal now settles only subsistence actors, persists transient scheduler.subsistence attendance, education consumes it once. Production education pupil age stateMemo tracks actual births/day; master stateMemo keyed on live relationship object. Final synthetic test credits60 pending minutes,0 completed (120 required), preserving all assertions. Focused FIELDS4 pass. Latest complete education FIELDS14 loaded before test fix has only that fixed failure; full rerun queued. Final paired controller session29734 restarted after source freeze; finish63803 waits for it, then final counts/profile/export/gold/numeric/audit and40-minute FIELDS record + schedule/education/source/perf/entity and mandatory regressions. Temporary scripts must be removed. Current local audit 9840 rows same R5 gaps; full final rerun queued. Do not claim intermediate pre12:20 paired samples as final.

13:17 UTC FINAL source freeze still12:20. Paired samples all9 done: base77.865s/tip132.559333/counter130.220667, ratio1.702425 (NOT target). Final10d plans3014/heaps1733/courses172/readDailyPlan0, stateSha30ee... matches pre-memo. Latest FIELDS full npc-schedule12/education14/subsistence38 PASS. Record FIELDS PID18192 from12:50 remains active, own timer2400 until13:30. Finish controller session91565: remaining perf/entity Fields + ordinary CORE/sync/I31/family/t164/schedule/save/source/water/T162. Extra spell-research session93239 and remote-generation59065 queued/active. Added spell from FINAL affected-list255; required72, remaining191. Official golden-diff ran final, tool caps401; full fields12228 base /22735 R5, unexplained0, plan117 integeronly, messages9steps same, mathfunctions same. Final audit R5 shortfalls9840 same, public/monster food0, town721/mobile60, public/generatedwater30each. Reports fieldtable/perf/audit already generated; validation currently provisional. DO NOT run cleanup before all workers/tail-profile exit. Tail profile session73266 waits finish then independent60d exclusive counts/profile. After that run K16_r6_report.py once (now writes K16-r6-final.md and K16.final.md), inspect latest statuses and60d profile; then K16_r6_cleanup.py removes own R6 tools/debugs and audits paths/PIDs. Preserve older R5 and user k16-r6.body/prompt/launch, .base roots. Stop13:57 UTC.

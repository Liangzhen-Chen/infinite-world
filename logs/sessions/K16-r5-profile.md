## 10日同窗口剖析（秒，自身/包含）

R4与R5均用同一bench核心、建角后启动Profiler、无本人其他Node。R4原始K16-r4-last-profile.json，R5为K16-r5-profile.json。函数组按文件和函数名合并，包含时间对每条栈每组只计一次，避免包装/递归重复。新晨间计划也可在堆外的日界生成，不能将“旧日内计划层消失”直接等同所有成本消失；正式性能以三对60日配对为准。采样窗口仅10日，不能替代60日行为反馈。

|功能组|R4自身/包含|R5自身/包含|
|---|---:|---:|
|原日内计划层|0.41/6.734|0/0|
|新晨间批量计划|0/0|0.03/1.187|
|单户劳力规划|0.205/4.753|0.016/1.069|
|地理与来源选择|1.038/4.2|0.088/0.911|
|日程堆|1.684/9.564|1.336/3.98|
|日程读取|0.472/6.286|0.377/2.262|
|状态/记录记忆|1.299/10.632|0.255/2.784|
|复制与规范化|2.957/3.13|1.839/1.84|
|约束|0.344/0.453|0.308/0.348|
|课程|0.587/2.587|0.569/1.985|

R5自身热点（前15）：

|文件/函数|自身秒|
|---|---:|
|storage.mjs:take|1.45|
|advance-registry.mjs:buildScheduleHeap|1.336|
|education-state.mjs:|0.973|
|:(garbage collector)|0.842|
|npc-schedule.mjs:settleSchedules|0.618|
|engine.mjs:get|0.55|
|engine.mjs:route|0.477|
|npc-crime.mjs:|0.416|
|advance-registry.mjs:|0.401|
|storage.mjs:cloneWalk|0.38|
|npc-state.mjs:|0.377|
|npc-schedule.mjs:scheduledSlot|0.356|
|education-state.mjs:sameCourseInputs|0.321|
|holdings.mjs:lifecycleState|0.299|
|entity-view.mjs:personConstraint|0.289|

共 4 条，甲 0 乙 4 丙 0，有理由 0 无理由 4。
本卡读：卷二十 :120–:220、:480–:579（含卡给的 :488–:570、:566–:571；:130–:212 同段已读）、:1027–:1052（§4.10.3，补 E-PACE-MISCLASSIFIED 与 floorRX 依据）、:416–:448（§3.1 入口表，补 clockView 依据）、:950–:989（查找 §4.10.3 时误入 §4.8，未用于结论）；卷二十四 Grep「contest|争夺裁决」零命中，另 Grep「抽签|争夺|竞争」只命中 :89、:367、:899 的迁移/现状行，无争夺裁决规则；卷二 :1000–:1044（WallTimerCap 能力对象行 :1033、定时器条 :1039、心跳推进 :1005–:1010、:1041）。代码读全：server-plugin/kernel/scheduler.mjs:1–:899（卡给 :464–:898）；按卡③的 Grep 另读 server-plugin/kernel/holdings.mjs:140–:180、:290–:340，kernel/mount.mjs:1–:69，server-plugin/index.mjs:1–:33，kernel/transport/menu-entry.mjs:1–:58，kernel/validate/types.mjs:215–:244，kernel/report.mjs:1–:60，kernel/handles/keys.mjs:446，kernel/error-codes.mjs:159–:163，world/rules/tables/clock.json 全文、world/rules/registry.json:167–:186（clock 行）、world/ontology/dimensions/_vocab.json:603–:622（due_kind）、:972–:976（reaction_priority）、world/ontology/state-owners.json:151、:305–:335，tests/kernel/scheduler.test.mjs:208–:277、:330–:370，tests/kernel/scheduler-due.test.mjs:341–:429，docs/迁移体检/块4.md:28–:91、docs/迁移体检/块6-规矩检查对照.md:43–:68，docs/问题.md:284–:285，docs/研究/公共部件审查-甲-1122.md:88–:90 与乙-1122 相关行，卷十八 :330–:340。没读完：卷二十 :221–:415、:449–:479、:580–:949、:990–:1026、:1053 以后；卷二 :936–:999、:1045–:1330（WallTimerCap 段只按 Grep 命中行读）；卷二十四未通读（无命中）。

### 1 持有边协议事件直读 state.clock.minute、缺值回落 0，绕过 clockView
- 位置：server-plugin/kernel/holdings.mjs:153（minuteOf）、:308（事件 minute）、:330（事件载荷 at）
- 设计原文：卷二十 :430，摘："时钟 | `clockView(engine, state)` | `{minute, day, seq}`，全整数 | 全书唯一的"现在几点""；:498，摘："读：`clockView`。"
- 代码实际：`minuteOf(state)` 直接取 `state[S.clock][S.minute]`，未设或非整数时返回 0；`emitKernelEvent` 用它填事件时刻与 `holdingChanged` 载荷的 `at`，既不经 clockView，也不像 clockView 那样对缺值报 E-DIM-UNKNOWN-READ。
- 理由：无。
- 影响：规则缺（绕开唯一时间入口；时钟未设时事件时刻静默为 0）。
- 严重程度：乙
- 合并：无（甲-1122 B1 结论"server-plugin 无 `state.clock` 直读"与本条相反，系该文漏检 holdings.mjs:153；本条不重复其已记项）

### 2 E-PACE-MISCLASSIFIED 的加载期派生约束未实现
- 位置：server-plugin/kernel/scheduler.mjs:848–:898（checkClockTables；due_kind 段 :876–:887 只查自报的 paceClass）
- 设计原文：卷二十 :147，摘："缺失即加载失败（E-PACE-UNCLASSIFIED）；派生约束见 §4.10.3 第 3 条"；:1031，摘："加载期另做**派生约束**：凡是被用作下列三种来源的 `due_kind`，强制为均衡类，标成延迟类即 E-PACE-MISCLASSIFIED——（a）`event_type.cooldownDays` 的到期；（b）任何按年基率、按步概率抽取的再次检查间隔；（c）钩子节拍。"
- 代码实际：只核 paceClass 是否存在、是否为 pace_class 之一（:878–:879）；全仓 server-plugin 无抛出 E-PACE-MISCLASSIFIED 的代码（kernel/error-codes.mjs:163 只有码的登记），hook 节拍与 due_kind 的对应关系也未参与校验。
- 理由：无（docs/审查、docs/问题.md、卷末勘误均无登记）。
- 影响：规则缺（被用作冷却、年基率或钩子节拍的 due_kind 误标延迟类时可加载通过；现 world 尚无 event_type 等来源表，暂未出错）。
- 严重程度：乙
- 合并：无

### 3 floorRX 的"结果 ≥ 1 分钟"加载期校验未做，非空 floorRX 直接抛内部错
- 位置：server-plugin/kernel/scheduler.mjs:883–:885（只做 rx 编译）；运行期 :265（非空 floorRX 抛普通 Error）
- 设计原文：卷二十 :148，摘："`floorRX` | rx nullable | 结果 ≥ 1 分钟 | skip | 延迟下界"；:1030，摘："下界由 `floorRX` 给出……且不小于 1 分钟"。
- 代码实际：加载只核 floorRX 能编成 rx，不核"结果 ≥ 1 分钟"；enqueueDelay 遇非空 floorRX 一律抛 `Error('…floorRX evaluation pending…')`（:265），下限规则整体未生效。
- 理由：无（仅代码注释 :253、:842 自述；迁移体检 docs/迁移体检/块4.md:91 把"加载期校验'结果 ≥ 1 分钟'"列为甲类、要求 4-1 做）。
- 影响：规则缺（带下界的延迟类到期项一入堆即崩，缩放下限无判据）。
- 严重程度：乙
- 合并：无

### 4 resolveContest 只有测试调用者，contest 段没有任何来源
- 位置：server-plugin/kernel/scheduler.mjs:721（resolveContest 导出，全函数 :721–:805）
- 设计原文：卷二十 :508，摘："`stage` 是代码内封闭枚举 `tick_stage`（external due clock contest reaction assertion，沿用现调度器六段）"；:513，摘："其余三段（external、contest、assertion）按 `(来源代号, 主体 id)`"。
- 代码实际：全序里有 contest 段位次（TICK_STAGE :37、stageRank、sourceKey），但 server-plugin 内没有任何 TickSource 产出该段的项，resolveContest 也无生产调用者——全仓唯一调用方是 tests/kernel/scheduler.test.mjs:225 起的测试；卷二十四 Grep「contest|争夺裁决」零命中，卷文只给过该段的次序（:513），未规定其来源。
- 理由：无（docs/迁移体检、PLAN、待办均无该段的排期或挂账）。
- 影响：玩法不可达（争夺永远不会发生，resolveContest 的整单分配只在测试里跑到）。
- 严重程度：乙
- 合并：无

---

## 已登记未建

1. **推进路径未接生产**：advance、dueSource、hookSource 在 server-plugin 内没有真实调用者（全仓调用只有 tests/kernel/assembly.test.mjs、scheduler.test.mjs、scheduler-due.test.mjs、block5-accept.test.mjs、save-routes.test.mjs）；"`time` 推进只经调度器"归块 6 第 6-27 张卡（docs/迁移体检/块6-规矩检查对照.md:64，K6-100/K6-101）。menu-entry 的 dispatch 也尚未交入（kernel/transport/menu-entry.mjs:5 自述无处理函数即回 E-ACT-WRITER-NOT-READY）。
2. **advancePlan provider 与按层步长放大的钩子节拍未建**：hookSource 只认 `{unit, tierOrder}`（scheduler.mjs:507–:510），plan 里的 `stepMinutes`/`settleTo` 不读，节拍只取 rules.clock.cadence，对所有单元一视同仁；卷二十 :547 要求"每次推进先取 advancePlan 的结果（单元、层、节拍桶、降级档位）"。登记：docs/迁移体检/块4.md:59（K4-42 选 A，挪块 6 卷二十七 §4.1 卡）、块6-规矩检查对照.md:64（6-27）。
3. **格局变化信号后重取计划、待办记录随作废段丢弃未建**：卷二十 :536 与卷二 §2.9 第 0 条要求 `layout_change` 信号触发重取、pendingPost 随作废段丢弃；scheduler 只有 installTickEnd（scheduler.mjs:236），无计划重取与信号接收；登记同上（K4-42、1114n2）。
4. **心跳定时器未启动**：createWallTimer 已建（scheduler.mjs:819），但 wallTimer 在 mountKernel 只保存不用（kernel/mount.mjs:8 自述"本卡不读墙钟、不开定时器"），心跳推进与 rules.host.heartbeatMs/heartbeatStepMinutes 未接（卷二 :1005–:1010）。
5. **paceSoakTol 未建**：卷二十 :138 登记该字段（[0,1]，§4.10.6 浸泡容差），SCHEMA.tableKeys（scheduler.mjs:49）、world/rules/registry.json:167–:186 与 clock.json 均无；registry 该行 volume 栏自述"paceSoakTol 随块 7 节奏卡（收尾待办）"。

## 拿不准

1. **争夺方式是否算写死**：CONTEST_MODES（scheduler.mjs:44）是成列的种类字面量，SCHEMA.modeField / modeHigh（:69–:70）是方式到提案字段与比较方向的映射；卷二十 :513 只规定 contest 段的次序，:1403 的代码内封闭枚举清单不含争夺方式，数据表（clock.json 的 contestDefault）只存缺省值、不存方式集合。按卡头第 10 条"种类一律放数据表"是否须把方式集合与映射入表，请裁定（现新增一种方式必须改代码）。
2. **nextBeat 自身不拒 cadence 0/负数**：nextBeat（scheduler.mjs:472–:476）对 cadence 0 得 NaN、对负 cadence 可得不大于 after 的刻；生产唯一调用方 hookSource 已在 :502 先验（0、负数、offset 越界都抛 E-CLOCK-CADENCE），加载期 checkHookCadence:553、:556 也拦。卷二十 :134 只要求加载期校验，是否还要求导出函数自验，请裁定。
3. **resolveContest 的裁决算法无卷文依据**：整单分配、每标的按方式比较、容量一致性这些算法细节，卷二十四零命中，卷二十只给 contest 段的次序（:513），只能追溯到旧调度器（git 9b5bbac2d^:server-plugin/scheduler.mjs:117–:200 与方案 §1.2 第 10 行）；是否需要补卷文或勘误，请裁定。
4. **drawSites 只由通用集合校验**：checkClockTables（scheduler.mjs:848–:898）不碰 drawSites，"代号互不相同、五点齐全、每点对应抽取键的 drawSiteCode 段"（卷二十 :137）只由 registry 的 set 类型做排序去重（kernel/validate/types.mjs:225–:228）；seed_sites 检测器（tools/accept/detectors/seed_sites.mjs）比对的是 seedKeys 表与源码调用点，不比 drawSites；五点也尚未进 world/rules/tables/seed-keys.json。归天气抽样卡还是调度卡，请定。

## 跨卷待判

1. **Claim.contest 为 null 的含义冲突**：scheduler.mjs:742 把 `contest: null` 当作取 `rules.clock.contestDefault`（现为 lottery），而卷十八 :335 写"`contest` | enum edge_contest nullable | … | null 即本种类不设竞争裁决，新边只按 R18-1.5 成立"。已登记 docs/问题.md:285"待卷十八首卡或卷二十勘误定口径"；要读卷十八 §2.6 与卷二十 §2.1 两卷才能判。

# 偏离清查 11d：卷二 §2.6 终止协议与事务

共 6 条，甲 0 乙 3 丙 3，有理由 0 无理由 6；
读了：卷二 §2.6 :522–:565；卷四 §3.2／§3.3 :405–:429、§4.8 :850–:922、§2.6 去留表 :338–:358（terminate.json 取值来源）；卷八 §3.3 :520–:589；代码 server-plugin/kernel/terminate.mjs :1–:619、kernel/transaction.mjs :1–:248、world/rules/tables/terminate.json :1–:24。另查（只为核对接点）：world/ontology/state-owners.json 全文、person.json:12–:13、org.json:7–:16、holdings.json（gone／succeedBy 抽样）、rules/registry.json:149–:162、kernel/load/state-owners.mjs:470–:513、kernel/scheduler.mjs:354–:418、kernel/mount.mjs:15–:32、kernel/dimensions.mjs:92–:107／:324–:334、kernel/events.mjs:344–:366。未读：death.mjs 正文（不在卡内文件清单，只 Grep 了调用点）；卷十八 R18-1.2 全段、卷二十四表 B 原文（卡外，相关处只记跨卷待判）。

附注（核过、无偏离）：终止五步次序与卷二 :543–:548 一致（清理函数在写标记之前、第 5 步清状态实例）；去留表删除只读 stateKeys.subjectRecords 与 rules.terminate.records，代码内没有领域路径字面量；模式与后继判据全取类别行、种类行与 T.code_enum；特殊值已试——对已终止者再 terminate 报 E-TERM-RESIDUE、successorId 为自身退 wreck、窗口 0 天终止当日不能复生，均不可绕过；terminate.json 的 records、unbuilt 两键都有生产读取，零引用键 0；transaction.mjs 的 runDelegated／rollback／codeOf 与卷二 :529–:536 一致。

### 1 终止／复生事件把 actor 写死为 null
- 位置：server-plugin/kernel/terminate.mjs:453-465、:517、:544
- 设计原文：卷二 :548 "`actor` 取所在事务那条事务事件的 `actor`，所在事务没有事务事件时为 null"
- 代码实际：emitProtocolEvent 两处都显式传 `actor: null`；事务上下文（transaction.mjs 的 Tx）也没有事务事件的 actor 可取，恒为 null。
- 理由：无
- 影响：规则缺（事件载荷丢行为人，按 actor 做后续的订阅方拿不到人）
- 严重程度：乙
- 合并：无

### 2 终止残余不变量只在 terminate 内核对，不在事务提交后
- 位置：server-plugin/kernel/terminate.mjs:518-519
- 设计原文：卷二 :549 "不变量（事务提交后核对，违反即 E-TERM-RESIDUE）"
- 代码实际：terminationResidue 只在 terminate 返回前调一次；同一事务里 terminate 之后的写入（调用方后续步骤、提交前重算钩子）不再核对。
- 理由：无
- 影响：规则缺（提交后可能出现残余而不报）
- 严重程度：乙
- 合并：无（terminationResidue 归属见公共部件审查-甲 E5，此处只记时点）

### 3 后继与"授予者未终止"的判定只读终止标记，未用 §2.5 谓词的两读数
- 位置：server-plugin/kernel/terminate.mjs:205、:271、:400、:410
- 设计原文：卷二 :547 "内核取列表里第一个未终止（§2.5 `terminated` 为假）的实体承接这条边"
- 代码实际：successorOf、firstLiveSuccessor 与 revert 格都用本地 isMarked（只读 state.terminated），不读 statusView 各实例 family 的 terminal 字段。
- 理由：无（已登记待裁：docs/迁移体检/块5.md:75 K5-55，第二读数待块 6 状态容器，尚非允许）
- 影响：规则缺／绕过（块 6 有终止类实例而标记未写时，本文件判据与谓词不同）
- 严重程度：乙
- 合并：无（K5-55 只覆盖 action-capacity 的 terminated，未覆盖本文件三处）

### 4 自写事务裸写与撤销项 txSet
- 位置：server-plugin/kernel/terminate.mjs:186-202
- 设计原文：卷二 :533 "当前事务整笔回滚，撤销本事务的全部写入，不只丢掉被拒的那一次写入"
- 代码实际：terminate.mjs 自带 txSet，直接 push tx.undo／tx.written 并改 state，撤销项格式与 kernel/transaction.mjs 再写一份。
- 理由：无（公共部件审查-乙已登记为待修，不是判允许）
- 影响：只是形式（现行为等价，改格式要同步多处）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:38、:155 与计划项 2（:177）

### 5 自写持有边遍历 activeEdges
- 位置：server-plugin/kernel/terminate.mjs:375-386
- 设计原文：卷十八 :518 "R18-1.2 协议甲（持有者一端）……各按 `holderEnd` 对应格的处置执行"
- 代码实际：terminate.mjs 另写 activeEdges 直读 state.holdings，不调持有写者的只读入口。
- 理由：无（公共部件审查-乙已登记为待修）
- 影响：只是形式
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:73 与计划项 3（:178）

### 6 注释里的卷行号整体偏移
- 位置：server-plugin/kernel/terminate.mjs:1-6；server-plugin/kernel/transaction.mjs:1
- 设计原文：卷二 :543 "实体终止协议（通用原语，唯一定义）"
- 代码实际：注释引卷二 :519–:531、:499–:503、:505、:590、:612 等；现版 §2.6 在 :522–:565，"事务内拒写的处置"在 :532–:536，kernelApi 在 :599–:612 之后。
- 理由：无
- 影响：只是形式（追卷文会找错行）
- 严重程度：丙
- 合并：无

## 已登记未建
- **wreck／liquidate 与持有边协议转移**（卷二 :544 "算不出后继时退为 wreck（这是规则，不是数据缺省）"、:546–:547 三种后继与移交）：terminate 一律拒收 E-ACT-WRITER-NOT-READY。登记处：docs/迁移体检/块5.md:103、:145–150；world/ontology/dimensions/person.json:12–13 的 basis（successorRX 留块 7）。
- **sink 终止去处**（卷二 :546 "sink 转入登记的汇"）：登记处 world/rules/tables/terminate.json:16–22（unbuilt.onTerminate）。
- **identity 系统 closeIdentities 与 identities 状态键**（卷四 :356、:881 D-3a）：state-owners 无 sys.identity／identities。登记处 terminate.json:14（basis "identities 的键卷四未建"）。
- **卷四其余记录类与 subjectRecords**（卷四 :352–:356：presenting／conceptions／renewables／life／identities）：登记处 terminate.json:14。
- **带 record 边的 relationFacts 回填**（卷二 :547 第 4 步 ②）：登记处 docs/迁移体检/块5.md:213（K5-丙7／K5-61，随卷十八块 7）。
- **运行态修正项容器**（卷二 :548 第 5 步"以它为来源的运行态修正项"）：见条目即拒收。登记处 docs/迁移体检/块5.md:75、:109（状态容器 §1.11 未建，K5-55）。
- **候补顺序提供入口无生产交入者**（卷二 :547 第 4 步 ①；卷十八 :524 R18-1.8）：registerSuccessionOrder 只有测试调用，规则层无人交入。登记处 docs/迁移体检/块5.md:147（5-4 建入口，提供入口随卷十八块 7）。
- **卷八组织终止**（卷八 :551、:561、:563–582）：org 系统 terminationCleanup（revokeOffice）、五条去留路径（taxRem／influenceRem／factionState／courtLast／envoyLog）、组织类别行 termination 均未建。登记处 docs/迁移体检/块5.md:103（组织行在块 7）；state-owners 无 sys.org 与上述键。

## 拿不准
- 内核 txSet 直接删 state.statuses（terminate.mjs:508），但 state-owners:26 的 statuses 写者只登 status.mjs；卷二 :548 未点名第 5 步执行者，是否比照 :553"执行者只有内核"算协议内部写，待判。
- successorRX 编译失败被当作"算不出后继"退 wreck（terminate.mjs:259-261、:267-268）；是否应在加载期报 RX 错（卷二 §4.3 E-MOD-RX 未在本卡范围）。
- 终止／复生事件的 visibility 写死 'private'、position 写死 'pos.kernel'（terminate.mjs:454-464）；卷二十四表 B 未读，是否合表 B 待判。
- revive 没有"重新登记"动作（terminate.mjs:530-545），卷二 :555 要求"实体以原 id 重新登记"；实体行始终在表里，是否已由实体表的实现方式满足，待判。

## 跨卷待判
- settleHoldings 对 `gone` 为 null／undefined 的种类保留边（terminate.mjs:408），靠残余核对整笔失败；卷十八 :518 协议甲列了八种处置且"持有者终止时不得取'不动'"，gone 空是否合法需读卷十八全段。
- primitives-runtime.mjs:292 的 destroy 对任意实体调 terminate，卷四 :874／:878 D-1 说"以个体为对象调用 terminate、revive 的只有 death.mjs"；destroy 能否用于个体需并读卷九。
- org.json:7-16 的组织类别行全部 abstract，卷八 :551 说"组织表的每个非 abstract 行都写 termination"；非 abstract 组织类别行由哪张表／哪张卡产生待判。

# 卡回报：块 5 第 5-4 张《终止与复生》

分支 `ds/b5-4`；基线 `origin/master` 99e7c2c4（开工前 `git fetch origin && git rebase origin/master`，已是最新）。写：Claude Opus 5.5（子代理）。

## 卡头第三节自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下节"卷文依据"：卷二 §2.5 :495、§2.6 :517、:519–:531、§2.7 :599–:602；卷六 §4.1 规则 9 :380、:118–:119；卷十八 R18-1.2 :518、R18-1.3 :519、R18-1.7 :523、R18-1.8 :524；卷九 :640、R9-2.7 :667；李白 11-18 22:10 丙3/丙4/丙7（`docs/审查/李白裁定-1117.md:1089`、`:1091`、`:1097`） |
| 2 | 没有按 id/名字/场景写特例 | 是 | `server-plugin/kernel/terminate.mjs` 一切只读类别行 `termination`（:196）、资源种类行 `onTerminate`（:324）、持有种类行 `gone`/`succeedBy`/`revival`（:373）、去留表（:257–:298）；协议代号只在 :40–:66 定义源写一次；无实体 id、类别名、种类名分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `tests/kernel/terminate.test.mjs`：窗口 0 当日复生拒、窗口 3 第 3 日拒/第 2 日过；余额 0 不过账；successorRX 为 null、后继已终止→退 wreck 拒；候补列表空/全已终止→关闭、返回非列表拒；授予者为空→关闭；`gone` 为 null 的边留着→E-TERM-RESIDUE；声明表未交入、清理函数登记未交入、候补入口未交入都整笔拒收，不静默跳过；source 非代号拒 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值手算：7000+1000=8000、窗口到期 = (4+3)×日长（日长取 `_units` day/minute 换算）、终止日 4、复生边界 3 日；测试 person 表与记录类在测试里造，不读仓库计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁 S13 k4 首轮报 `terminate.mjs` 一处"字面量判断表"（`[...x][0]`），改成 `found.values().next().value`，不是为降计数改写允许写法而是本卡新代码直接不引入违例；action-capacity.mjs 的 JSDoc `any` 改成 `object`（同理）。没有改名骗检查器的常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 改动文件全在卡文所有权清单内；transfer 的 kernelApi callers 扩展见"偏离"。diff 共 1193 行（11 文件，+1189/−4，含本回报）。新建 `server-plugin/kernel/terminate.mjs`、`server-plugin/action-capacity.mjs`（卡文"terminated 读数文件"）、`world/rules/tables/terminate.json`、`tests/kernel/terminate.test.mjs`、本回报；改 `world/ontology/state-owners.json`、`server-plugin/kernel/files.json`、`world/ontology/dimensions/_vocab.json`（只加 record_class 族）、`world/rules/registry.json`、`server-plugin/primitives-runtime.mjs`。另改 `tests/kernel/ledger.test.mjs` 一行（tests/kernel/** 在清单内，见"偏离"）。未改 error-codes.mjs（所需码都已登记）。`git diff --cached --shortstat` → `11 files changed, 1189 insertions(+), 4 deletions(-)` |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 697 / ℹ pass 697 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（items fail 4：A12-4.5、S12-2、S12-3、A6-1.1.a，均非 in_core；开工前同样 fail 4、verdict pass） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 块 6 竖切片里人会死、东西会坏：本卡交出唯一终止/复生协议（五步、去留表、账户分流守恒、到期项撤销、复生窗口），块 6 只需给人物等实体表写 `termination` 类别行、登记清理函数即可用；凡写者未上线的分支（残骸、清算、协议转移、复生点路径、状态容器）都整笔拒收并挂卡，没有造桩或静默跳过 |

## 卷文依据（摘原句）

- 卷二 §2.6 :519：「死亡、消亡、解散、损毁是同一个内核原语 `terminate(state, entityId, cause, source)`……原语在同一事务内按固定五步完成，任一步失败整笔回滚」。
- :520：「读该实体所属类别行的 `termination: struct{mode, successorRX, reviveWindowDays}`……算不出后继时退为 `wreck`……后继定下之后、终止标记写下之前，内核依次做两件事：① 调用登记的清理函数；② 按去留表删除记录」。
- :521：「写 `state.terminated[entityId] = {day, cause, mode}`……自这一步起，对该实体的写入一律拒写」。
- :522：「按资源种类行的 `onTerminate: enum term_account` 经账本转移——`successor` 转给后继，`sink` 转入登记的汇，`remains` 留在残骸上。全程守恒」。
- :523：「以该实体为持有者的边，按持有种类行登记的转移协议转给后继或解除；以它为标的的边一律解除……① 候补顺序……内核取列表里第一个未终止的实体承接这条边；列表为空或其中都已终止，这条边按'关闭'处置。② 史实记录回填……③ 复生点边……`reviveWindowDays` 为 0 时不记点」。
- :524：「清掉它身上的状态实例……以该实体为 `owner`、或 `ref` 指向该实体的全部到期项，由内核经卷二十的 `cancel` 撤销……`reviveWindowDays > 0` 时……登记一条窗口到期项……最后发事件 `verb_entity_terminated {id, cause, source, mode, successorId}`」。
- :525：「不变量（事务提交后核对，违反即 E-TERM-RESIDUE）：不存在指向已终止实体的持有边、非零账户余额或状态实例，不存在以它为主体、去留为 `clear` 的记录，也不存在以它为 `owner` 或 `ref` 的到期项（窗口到期项除外）」。
- :526：「① 整表一致……只有一部分类别行有，即 E-DIM-REQUIRED-MISSING……③ 对不可终止实体类的实体调用 `terminate`，第 1 步读不到 `termination`，按'任一步失败整笔回滚'处理」。
- :528–:529：清理函数登记 `{"kinds", "handler": "<文件>#<函数>", "sortKey"}`，「按 `sortKey` 升序、同值按系统名代号序各调一次……只许写本系统登记为写者的路径……不得调 `terminate`、`revive`」；去留表 `subjectRecords` 与 `rules.terminate.records.<rcls_>`：「`atRevive` 当且仅当 `atTerminate = hold` 时必填……`clear` 在第 1 步由内核整条删除；`hold` 留待复生，窗口期满时删除；`keep` 永久保留」。
- :530：「到期时刻是日历上'终止日 + `reviveWindowDays`'那一日的起点；到期时由 `kernel/terminate.mjs` 删除该实体名下全部 `hold` 记录，终止标记不动」。
- :531：「当且仅当 `当前日 − 终止日 < reviveWindowDays` 时在窗口内……任一不符即拒绝（E-TERM-REVIVE-DENIED）；通过后依次：删去 `state.terminated[entityId]`……撤销它的窗口到期项；按去留表删除它名下 `atRevive = clear` 的 `hold` 记录……发事件 `verb_entity_revived {id, cause}`……一概不自动还原」。
- 卷二 §2.5 :495：「已终止谓词 `terminated(engine,state,subject)`，别名 `dead`……返回 `{ok, reason}`，reason 是终止原因的代号」。
- 卷六 §4.1 规则 9 :380：「按卷二 §2.6 的实体终止协议分流余额，本卷只提供每种资源的 `onTerminate` 与 `salvageFraction`；不存在'人死钱没'」。
- 卷十八 R18-1.2 :518：「'回到授予者'的授予者取边的 `terms.grantor`；它为空或所指实体已终止时，按'关闭'处置」；R18-1.3 :519「不论种类行的 `subjectEnd` 填什么，标的终止时边都关闭」；R18-1.8 :524「提供入口返回空表，或授予者已终止时，该边按'关闭'处置」。
- 卷九 :640 `destroy` 行「内核原语｜实体终止协议」；R9-2.7 :667「`destroy` 走 `sink_*`，代号取模板或规则表登记……找不到登记代号即拒 E-ACT-PRIMITIVE」。

## 实现要点

- `server-plugin/kernel/terminate.mjs`：kernelApi 四项 `terminate`、`revive`、`registerTerminationCleanup`、`registerSuccessionOrder`（照卷二 :599–:602 登进 state-owners）；另有 kernel 组内 `installTermination`（挂接处交入声明表）、`expireReviveWindow`（窗口期满）、`terminationResidue`（:525 不变量，5-7 可复用）、`checkTerminationTables`（加载期核对）。
- `server-plugin/action-capacity.mjs`：`terminated`／`dead`，经 kernelApi `readPath(P.terminated(id))` 只读终止标记（丙3）。
- `primitives-runtime.mjs`：`destroy` 适配器转调 `terminate(engine, state, entity, 本笔 verb, null)`。块 5 内 execute 仍因 emit 未上线整批拒收（既定口径）。
- 数据：`_vocab.json` 加 `record_class` 族（前缀 rcls_，条目暂空）；`registry.json` 加 `terminate` 表行；`tables/terminate.json` 的 `records` 为空表（丙4，见下）；state-owners 加 `sys.capacity` 系统行（predicates 只登 terminated/dead，emits []）。

## 偏离卡文与已定

- 已定：`registerTerminationCleanup(ref, handler)` 多一个 ref 形参（`<文件>#<函数>`，即 state-owners 清理登记的 `handler` 格），与 `registerAdvanceHook(hook, file, handler)` 同法；内核靠它把交入函数对上登记行（kinds、sortKey），并在调用期间把事务节点文件换成该文件，使 writePath 按"只许写本系统登记为写者的路径"核对。`registerSuccessionOrder(succeedBy, handler)` 入口签名 `handler(engine, state, edgeRecord) → entityOrder`。
- 已定：`terminate`/`revive` 带 engine 首参（与其他 kernelApi 写入口同写法；卷二原签名省略 engine、state 的写法照 §3.1 表头）。
- 扩展（需主会话核）：`kernel/ledger.mjs#transfer` 的 kernelApi `callers` 由 `["rules"]` 改为 `["rules", "kernel"]`。原因：第 3 步账户分流由内核经账本转移（:522），门禁 S6-13.a 按 kernelApi callers 核调用者；handles.test 规定 callers 与 callerFiles 二选一，不能只加 `callerFiles: [kernel/terminate.mjs]`，故按组加；`tests/kernel/ledger.test.mjs:362` 钉住该行 callers 的期望随数据同改（加注出处），不是放宽断言，请主会话审这一处是否改用别的登记法。
- `sink` 去处：卷文只写"转入登记的汇"，没写登记处（资源行 `sinks` 可多值）；按 R9-2.7 拒 E-ACT-PRIMITIVE。现登记的两行资源 `onTerminate` 都是 successor，不受影响。
- 违规一次：开工中有一次用了输出重定向写 `F:/dnd-tmp/b54-gate.txt`（门禁报告），违反卡文禁用项；之后改用管道，未再写。该文件在仓库外，未提交。

## 部分与挂卡

- 丙3：`terminated` 只读 `state.terminated`；statusView `terminal` 读数随块 6 状态容器卡补（验收记部分）。第 5 步清状态实例与运行态修正项同挂块 6：块 5 state 无 `statuses`/`modifiers`，若该实体名下有条目即整笔拒收。
- 丙7：带 record／carriesRel 的边在第 4 步关闭由持有写者整笔拒收 E-ACT-WRITER-NOT-READY（测试覆盖），② 回填随卷十八块 7 关系写者卡。
- 持有边协议转移（`ho_succeed`、`ho_revert` 有在世接班人，`ho_estate` 等其余格）：持有写者没有 `cause = protocol` 的转移入口（卷二 :517 只登了准入照写），整笔拒收 E-ACT-WRITER-NOT-READY；挂"持有写者协议转移"卡（holdings.mjs 不在本卡文件清单）。
- `wreck`（含算不出后继的退回）要生成残骸实体、`liquidate` 要债权人：建行写者／卷六合同未上线，整笔拒收；`remains` 同。
- 复生点边（K5-59）：窗口 > 0 时要整组覆盖 `revivals.<主体>.points`，路径由卷四登记（块 6），整笔拒收；窗口 0 只关边。
- 接线挂 5-7：`installTermination` 挂接、窗口到期项 `expireReviveWindow` 接到期分发、`checkTerminationTables` 接加载器（同 checkHoldingKindRows 先例）。
- 门禁条目 K5-24 行 16"terminal／state.terminated 读者闭集"未加：现 kernel 的 storage.mjs:258、ledger.mjs:356、holdings.mjs:529 已直读终止标记做拒写，若照卷二 :495"其他所有文件只调用谓词"立条目会命中这三处，需裁定内核协议文件是否豁免。

## 丙4 无明文清单（李白 11-18 22:10 丙4：不自拟，报一次再定）

现行声明表里以可终止实体 id 为路径段的模式，卷文都没有写明去留：

1. `created.*.props.*`、`created.*.props.basis`（偏离行）：卷四 :358「`statuses.*` 与个体偏离行由协议与卷二处置」，但卷二 §2.6 :529 协议自管键只列「账户、`holdings`、`statuses`、`modifiers`、`terminated`、到期堆」与 `textPaths`，不含 `created`；`docs/统一底层设计/收尾待办.md:985`「去留表缺 `created.*`、`displayNames.*.seq` 两条的 `rcls_` 类，随该表首卡补」未给取值。
2. `displayNames.*.seq`：卷四 :358「`displayNames.*` 是文字路径，按卷二不随终止删除」，但 `.seq` 不在 `textPaths`（只有 `displayNames.*.text`）；同上收尾待办 :985。
3. `outflowTotals.*`、`stockLots.*`：卷二 :529 只说"账户"豁免，未说账本写者的这两类键是否算账户；现加载器 `load/state-owners.mjs` 把写者为 kernel/ledger.mjs 的路径一律当账户豁免（ledgerPaths，非本卡改动）。卷六 A6-1.2 :399 只要求「已终止实体余额为零」。

覆盖核对在真实 world/ 上 0 违例（现无实体表写 `termination`，可终止实体类集合为空）；上述五条在块 6 第一张写 `termination` 的实体表卡上会立即报 E-TERM-RECORD-UNLISTED，须在那之前定。（李白 11-19 11:1x ④ 已定，随块 6 首张写 termination 的卡勘误，本卡不做。）

## 只核后修改轮（rebase 到主线后）

- liquidate 不再先算后继再改写成 wreck：卷二 :520 只写"算不出后继时退为 wreck"，liquidate 的后继是债权人（卷六合同，未上线），改为先于退 wreck 按 liquidate 本身拒 E-ACT-WRITER-NOT-READY，挂卷六合同卡（terminate.mjs 第 1 步）；新增用例核拒收原因是 liquidate、清理函数未跑。
- destroy 适配器本体被 execute 的 emit 前置检查拒住，走不到（ADAPTERS 不导出）；新增用例在内核层直接测它调用的 `terminate(entity, verb, null)`。
- 李白 11-19 11:1x 裁定落实：① transfer 行改回 callers ["rules"] 另加 callerFiles ["kernel/terminate.mjs"]，卷二 §2.7 :577 勘误 1118k30 为"至少写一个、可并存、取并集"，handles.test 二选一改为照此核（加载器本无此校验），ledger.test 期望改回 ['rules'] 并另核 callerFiles；② registerTerminationCleanup 对声明表 handler 格核一致（先登记后交声明表、先交声明表后登记两向都核），对不上拒 E-DIM-REF-MISSING，卷二 :528 同号勘误；③ sink 登记为未建 rules.terminate.unbuilt（registry 加字段），拒收 E-ACT-WRITER-NOT-READY，未登记又未建拒 E-DIM-STRUCT-FIELD，加载期核未建表不得登已建取值；⑤ K5-24 门禁未做：现有检测器 path_access 的 read 读法按成员链认路径、不认根，规则层合法的 `P.terminated(id)` 与违规的 `state.terminated` 同为 `.terminated`，分不开；要做须改检测器（tools/accept/detectors 不在本卡清单，且要判据修订），停下报主会话。勘误手续：改前快照 版本快照/卷二-v17补26-勘误前-1118k30.md（与改前卷文逐字节相等），改后覆盖 卷二-v17补26-现行.md（相等），附录加一行，历史行未动。
- 清理函数写路径限制正反两例：清理函数文件是 created.*.props.* 的登记写者即通过，别的文件即 E-VIEW-UNDECLARED-WRITE。

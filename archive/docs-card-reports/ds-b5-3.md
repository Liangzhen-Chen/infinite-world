# 卡回报：块 5 第 5-3 张《持有写者》

分支 `ds/b5-3`；基线 `origin/master`（开工前 `git fetch origin && git rebase origin/master`，成功）。

## 卡头第三节自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下节"卷文依据"：卷十八 §2.6 :309–:350、§4.1.1 :457/:461、R18-1.2 :518、R18-1.3 :519、R18-1.5 :521、R18-1.10 :526、R18-1.11 :528、R18-1.12 :529–:532、R18-1.13 :534；卷二 §2.6 :498–:517、§2.7 :542 起；卷九 §4.2.1 :630–:633；李白 11-18 22:10 丙2/丙5/丙7（`docs/审查/李白裁定-1117.md:1087`、`:1093`、`:1097`）。本轮（终核两条）R18-1.5 :521 原句见"本轮…"节；卷九 §4.2.1 原语句逐一读过（:630 表头"契约必填字段（可选字段从略）"、:635 holding.transfer 行、:636 holding.rescale 行） |
| 2 | 没有按 id/名字/场景写特例 | 是 | 行为只读种类行字段（`server-plugin/kernel/holdings.mjs:257–:330` 切容量/上限/互斥/缔结、`:400–:470` 开闭边）；没有任何 `hk_*` 种类名分支；协议代号只在 `holdings.mjs:60–:72` 的定义源里各写一次，比较处引用成员 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `tests/kernel/holdings.test.mjs`：`share` 0／-1 拒、单条 0.4 在提交时拒；`holderMax=1` 第二条拒；`capacityKey=density` 满额拒；`uniqueTriple=true` 第二条同三元开边拒、`uniqueTriple=false` 三元关边拒；holdWhile 读数缺/服务未登记按未知（假）拒；`admission` 非空、`carriesRel` 与 `intimate` 都整笔拒收不跳过；运行期 `origin=seeded`、转移/改份额承接边无本笔同意都拒 E-REL-CONSENT。本轮补：`terms.consentAct` 非代号非 null 拒 E-HK-PROTOCOL；engine 未装时四入口整笔拒收、别的写者写到持有端路径拒收（`未装 engine：…` 两个用例），不静默跳过 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值是手算字面量：minute=10、shareSum=1、0.4+0.6、0.25/0.75、holderMax=1、capacity=1（`tests/kernel/holdings.test.mjs` 各用例）；不抄基线或计数。R12-8.5 的合入号期望取临时仓库自己的 `git rev-parse HEAD`（`tests/accept/runner.test.mjs`），不依赖仓库外提交号或仓库当前读数。本轮新增用例的期望同样手算：承接边 `hld_2`、`since=10`、`share=1`、新增边 `share=0.6`、`consentAct='act_new_consent'`，拒收码 `E-ACT-WRITER-NOT-READY`／`E-REL-CONSENT` |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 常量表改动都因本卡新增能力：`tests/kernel/state-owners.test.mjs:49` 加 `holdings`（pathTypes 新增，P 必生成）、`tests/accept/s2s3.test.mjs:110` 加 `c_write_holdings`（stateKeys 新增，分量按声明派生）、`tests/accept/detectors.test.mjs:611` 去掉 `rxMaxDepth`（本卡代码开始读它，消费数真实下降）。无数值常数写死在代码：份额、容量、上限全读数据；边序号由现有边推出。本轮删掉运行期不再使用的 `S.seeded` 常量（生成路径例外未上线），没有为过关留假常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮（终核两条）只改两个代码文件：`server-plugin/kernel/holdings.mjs`（增 59 / 删 8）、`tests/kernel/holdings.test.mjs`（增 55 / 删 1），另随提交更新本回报。`git diff --stat` → `2 files changed, 114 insertions(+), 9 deletions(-)`。前几轮（5-3 主体、只核五条）的文件与 diff 见下各节；相对 `origin/master` 的总 diff 随本报告更新 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 本轮：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 662` / `ℹ pass 662` / `ℹ fail 0`（末行 `ℹ duration_ms 113866.5594`）；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；专项 `node --test tests/kernel/holdings.test.mjs` → `tests 34 / pass 34 / fail 0` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 块 6 的交易、入会、存放物品都需要"谁拥有什么"这一层；本卡交出唯一持有写者与四个原语适配器，块 6 只需登记物品/组织/地点实体表并接线 `emit`。本轮补齐缔结类的同意入口（转移与改份额能带本笔同意走通）并把"engine 未装"从静默跳过改为整笔拒收。没有写死、没有跳过规则引擎、没有假数据：数据 47 行照卷十八 §4.1.5 落；推不出的接点都整笔拒收并记"部分" |

## 卷文依据（摘原句）

- 卷十八 §2.6 :311：「字段没有缺省：主列（`id` 至 `pins`，即 §4.1.5 主列块的 18 列）由登记卷逐行逐列给全（E-HK-ROW-FIELDS）；其余为补充列……`intimate` 例外，须逐行显式写出」。
- 卷十八 §4.1.1 :457：「一条边的持有者、标的各是一个带类型的引用，类型只有两种：① 实体模板……② 目录行……数据里写名字：先按模板名解析，解析不到再按目录行的实体表名解析……写入一条边时，持有写者核对两端的类型落在该行的 `from`、`to` 之内（E-HK-END-TYPE）。……封卷后勘误 1118k25：持有种类端类型先收为模板名闭集；按实体表解析的核对随第一张建对应实体表的卡启用。」
- 卷十八 R18-1.5 :521：「`exclusive` 为真的种类，新边成立前旧边必须先按协议甲的'离任'格处置。……条目取'自动让出'的，持有写者在同一笔事务里先按旧边种类行的'离任'格处置旧边，再写新边……取'禁止'的拒写。`holderMax` 非空的种类，在自动让出之后核对，写入后持有者一端仍超限即拒写……`capacityKey` 非空的种类管标的一端：写一条新边前，该标的在该种类下的现役边数须小于标上该容量维度的值，否则拒写（E-HK-CAPACITY）」。
- 卷十八 R18-1.10 :526：「种类行 `domicile` 为真的边，每建立一条、每结束一条，持有写者在同一笔事务里发一条常住变化事件，载荷 `{person, place, since, until}`」。
- 卷十八 R18-1.11 :528：「每建立一条、每结束一条、每转移一条，写这条边的写者在同一笔事务里发一条持有变化事件，载荷 `{edge, kind, holder, subject, change, prevHolder, at}`……'转移'……这时只发一条，`holder` 是承接者、`prevHolder` 是原持有者」。
- 卷十八 R18-1.12 :529–:532：「写入按事务成组求值……任一条使条件为假，全部一并拒写（E-HK-HOLD-WHILE）」「重算按建立先后逐条放回……为假的在同一事务内按该行'离任'格处置」「求值结果未知按假处理」。
- 卷十八 R18-1.13 :534：「用三元时，该种类行 `uniqueTriple` 必须为真……运行时三元找不到现役边，按现有关边失败处理」。
- 卷二 §2.6 :515：「凡一笔事务写入种类行 `holdWhile` 非空的新边，或写到这类现役边的持有者或标的……都在该事务提交前调一次持有写者的重算函数」。
- 卷二 §2.6 :517：「持有写者为任一种类开边或关边，依次三步：① 先调该种类行 `admission`……② 写边；③ 只在边写成功之后……发出 `events`」。
- 卷九 §4.2.1 :630–:633：四个 holding 原语契约（`holding.open` / `close` / `transfer` / `rescale`）。
- 李白 11-18 22:10（`docs/审查/李白裁定-1117.md:1087/:1093/:1097`）：丙2 用持有边表达装置内批次位置；丙5 端类型名先收为模板名闭集；丙7 块 5 期间带 record 的边关闭一律整笔拒收。

## 建了什么

1. `server-plugin/kernel/holdings.mjs`（新，803 行）：`state.holdings` 唯一写者。
   - 存储形 `holdings.<持有者 id>.<边句柄>` = `struct:holding`（卷二 §1.5 :212）。句柄由现有最大序号加一生成，不另存计数器。
   - `openHolding` / `closeHolding` / `transferHolding` / `rescaleHolding`：开边、关边（边 id 或三元）、转移（只发一条 transferred）、改份额（同持有人只改 `terms.share`，不建不关）。
   - 读种类行字段执行：`exclusive`、`incompatible`（forbid / auto_vacate）、`holderMax`、`capacityKey`、`shareSum`、`concluded`、`grantedBy`/`succeedBy=grantor`、`domicile`、`holdWhile`、`uniqueTriple`、`from`/`to` 名字闭集。
   - `holdWhile` 经 `kernel/rx.mjs#compileRXInScope` 编译，四个读数经 `personView`/`itemView`（`registerViewReader`）读取；未知按假。
   - 提交前重算钩子经 `registerHoldWhileRecompute`（卷二 §2.6 :515）交入：新边假/未知拒 E-HK-HOLD-WHILE；现役边假按 `vacated` 关闭；并核对 `shareSum`。
   - R18-1.10 / R18-1.11 事件经 `kernel/events.mjs#emit` 写，随事务提交才落。
2. `server-plugin/primitives-runtime.mjs`：`ADAPTERS` 增 `holding.open` / `holding.close` / `holding.transfer` / `holding.rescale`，只经 kernelApi 调持有写者。
3. `world/ontology/dimensions/_vocab.json`：新增 `holding_kind` 族（前缀 `hk_`，开放），落 **47 行** = §4.1.5 的 42 行旧表迁入 + 3 行新增（私人关系、名士在册、荣誉）+ 卷十三手持/在编 2 行；每行 40 列（主列 18 + 补充列，defaults/overrides 已展开到行上）。出处：卷十八 §4.1.5 :540–:647。
4. `world/ontology/state-owners.json`：
   - `stateKeys.holdings`（writers `{"*": "kernel/holdings.mjs"}`）
   - `pathTypes["holdings.*.*"] = "struct:holding"`
   - `keyKinds["holdings.*.*"] = [[item, office, org, person, place, polity], "handle"]`（第一段是持有者实体 id；第二段是运行时边句柄）
   - `kernel.emits` 加 `verb_holding_changed`，`sys.social.emits` 相应只留 `verb_domicile_changed`（卷二 §2.7 :770：内核自己发的动词列在 `kernel.emits`；持有写者是内核文件）
   - `kernelApi` 加 `kernel/holdings.mjs#openHolding/closeHolding/transferHolding/rescaleHolding`（callers `rules`，acceptsState 真）
5. `server-plugin/kernel/files.json`：登记 `server-plugin/kernel/holdings.mjs`。
6. `server-plugin/kernel/state-types.d.ts`：由 `node tools/gen-state-types.mjs` 按新 `pathTypes` 重生成（非手改）。
7. `tests/kernel/holdings.test.mjs`（新，373 行）：20 个用例，覆盖开/关/转移/改份额正反、互斥/上限/容量/uniqueTriple、holdWhile 求值与重算、丙2/丙5/丙7、事件随事务提交。

## holding_kind 落行与出处

- 47 行：`hk_resides`、`hk_member_of`、`hk_household_member`、`hk_household_head`、`hk_kin`、`hk_bond`、`hk_owns`、`hk_share`、`hk_leases`、`hk_operates`、`hk_employed_by`、`hk_holds_office`、`hk_appointed`、`hk_business_member_of`、`hk_devotee_of`、`hk_citizen_of`、`hk_resident_of`、`hk_certified`、`hk_guardian_of`、`hk_custody_of`、`hk_mentor_of`、`hk_tamed_by`、`hk_governs`、`hk_administers`、`hk_controls`、`hk_fief`、`hk_allied_with`、`hk_guest_of`、`hk_lodges`、`hk_banished`、`hk_wanted`、`hk_registered`、`hk_pledged`、`hk_frozen`、`hk_permit`、`hk_companion`、`hk_branch`、`hk_possesses`、`hk_cursed_by`、`hk_commands`、`hk_seals`、`hk_enshrined_in`、`hk_invited`、`hk_notable_of`、`hk_honored_by`、`hk_wielding`、`hk_enlisted`。
- 出处：卷十八 §4.1.5 :552–:598 主列块、:605–:647 补充列 defaults/overrides、:655–:663 卷十三两行依据。`hk_wielding` 的 `holdWhile` 原句见 :645。

## kernelApi 新登条目与出处（含卷文矛盾说明）

- 四条：`kernel/holdings.mjs#openHolding`、`#closeHolding`、`#transferHolding`、`#rescaleHolding`，callers `rules`、acceptsState 真。
- **矛盾已如实报**：卡文要求"kernelApi（只登卷二 §2.7 已列的条目）"，但卷二 §2.7 的 kernelApi 闭集（:577–:643）**没有**持有写者任何条目；而卡文同时要求适配器在规则层"只经 kernelApi"调持有写者。二者只能取一：不登 kernelApi，规则层 import `kernel/holdings.mjs` 就绕开闭集；登了则超出 §2.7 现列名。本卡选了后者（最小可行接点），并把这一条列在这里请复核／李白裁定。按卷二 §2.7"逐个导出名、无通配"的闭集原则，正确修法是卷二 §2.7 补这四条登记行（下张改卷卡或勘误）。

## "部分"项与挂卡

1. **准入入口未接线（部分，挂卷十四/第一张建 admission 入口的卡）**：种类行 `admission` 全为 null，块 5 无 `<文件>#<函数>` 的登记实现。非空即整笔拒收 `E-ACT-WRITER-NOT-READY`，不静默跳过；测试覆盖了"非空必拒"。
2. **关系写者与带 record 的边（部分，挂卷十八首卡，块 7）**：`carriesRel` 为真的种类与 `terms.rel` 非空的边一律整笔拒收 `E-ACT-WRITER-NOT-READY`；丙7 的带 record 关闭同码，状态不变（测试覆盖）。R18-1.7 的史实回填未做。
3. **同意事件的核对（部分，挂块 6 动作目录/提交段卡）**：`concluded` 为真的种类要求 `terms.consentAct` 或 `terms.origin = seeded`，缺即 `E-REL-CONSENT`；但"`consentAct` 是否确有一条同意事件"需要查事件日志，`kernel/events.mjs` 本卡不在文件清单、也没有事件查询入口，未自造。运行期只核代号存在，事件存在性随动作目录接线补。
4. **事务事件 id 链首（部分，挂块 6 提交段/emit 适配器卡）**：卷二 §2.7 事件 id 表要求写者协议事件链首取"所在事务那条事务事件 id"；块 5 没有事务事件，`actor` 取 null，链首取"边句柄 + 变化"（同事务第二条起取上一条事件 id），保证同刻不同事务不撞号。接提交段后改取事务事件 id。
5. **四个适配器暂不可达（部分，挂块 6 emit 适配器卡）**：`execute` 仍要求批里有 `emit` 原语且其适配器未建，故任何批在写入前整笔 `E-ACT-WRITER-NOT-READY`（5-2 已定的口径）；适配器测试只到"表中有这四个适配器、混批不落笔"的层面，持有写者本身由 20 个直接用例覆盖。
6. **keyKinds 第一段只列块 5 已载入实体类**：`item/office/org/person/place/polity`。estate、obligation、business 等持有者类别在块 6/7 的实体表上线后按各自的表补进同一行（丙5 同一启用条件）；未登的类别写入会按 `E-PATH-KEYKINDS` 拒，不放行。
7. **`sys.social.entryCallerFiles`/`entryJudges`**：两字段按卷二 §2.7 必写，现为 `{}` / `[]`；卷十八 §3.1 的 11 个读入口在块 5 没有可解析的调用文件（旧调用点已随 P-1 删除，迁移表只写"2 项入口、8 个文件"未列文件名），未编假值。`emits` 已按 5-2 登记并经本卡改动（`verb_holding_changed` 移到 `kernel.emits`）。
8. **旧文件去留**：`server-plugin/holdings.mjs` 不在本基线（P-1 已删），无需搬或删；`world/ontology/holdings.json` 旧 42 行数据无读者，本卡未动（不在文件清单；按 K5-39 已迁入 `_vocab.json` 的 `holding_kind` 族，旧文件删留由收尾清理卡定）。
9. **`error-codes.mjs` 未改**：卷十八 §2.5 与卷九 §2.8 的码（含 E-HK-*、E-REL-CONSENT、E-ACT-WRITER-NOT-READY）此前已全登；本卡未新增卷文已列未登记的码。

## 验收命令与末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ pass 646` / `ℹ fail 1`（唯一失败 R12-8.5：仓库外临时根的 `git ls-tree c8a2bccd` 环境失败，见自查表第 7 行；与本卡改动无关）。
- `node tools/accept/run.mjs pre_commit` → 末段 `"subject": ""`, `"verdict": "pass"`。
- 专项：`node --test tests/kernel/holdings.test.mjs` → `ℹ pass 20` / `ℹ fail 0`。

## 本轮追加（1118k27 补登 + 测试写死提交号整类修正）

### 1. 全量测试 1 败：R12-8.5 用例写死 `c8a2bccd`

- 根因：`tests/accept/runner.test.mjs` 的 R12-8.5 用例把 `mergeRef` 写死成仓库外提交号 `c8a2bccd`。本分支在 `world/ontology/state-owners.json` 新增 `stateKeys.holdings` 后，`path_access` 的 `write` 条目按声明派生出一个新分量 `c_write_holdings`；合入关口按 R12-8.9 对基线表里没有的新分量，要在 `opts.mergeRef` 所指提交的内容上用 `git ls-tree` 数 B0（`tools/accept/run.mjs:251–:263`、`:116–:137`）。临时仓库里没有该提交，`git ls-tree -r --name-only -z c8a2bccd` 退 128。
- 为何在 `origin/master` 上能过：`origin/master` 的 `state-owners.json` 没有 `holdings` 状态键，`path_access` 派生的分量全部已在 `tools/accept/baseline.json` 中，`ensureB0` 的 `comps.length === 0`，在解析 `mergeRef` 之前就返回空表（`tools/accept/run.mjs:254–:261`），所以写死的提交号从未被 git 解析。
- 修法（整类）：用例开头在临时仓库 `git init`＋`git add -A`＋`git commit`，合入号取 `git rev-parse HEAD`（同文件 :164、:185 已有写法），断言 `lastMergeRef` 也改为该值；不放宽断言、不跳过用例。
- 全仓测试写死提交号清查：可执行代码里只剩这两处（`:135`、`:142`），已一并改为临时仓库自己的提交。其余形似代号的字串不属此类：`tests/accept/bigint-print.test.mjs` 的 sha256 是内容指纹；`tests/kernel/sample.test.mjs` 的十六进制是派生种子；`tests/kernel/det-math-*.test.mjs` 的十六进制是数值字面量；`tests/kernel/det-math-decimal.test.mjs:2` 的 `8823dc54^` 是注释里的史实出处，不传给 git，按"历史引文不回改"保留。

### 2. 卷二 §2.7 补持有写者四条 kernelApi（勘误 1118k27）

- 依据：李白 11-18 22:10 块 5 体检 11 项裁定 五.1"持有/终止/事件等内核写者仍只经 kernelApi，不直接 import kernel 内部"（`docs/审查/李白裁定-1117.md` 末节）。
- §2.7 kernelApi 闭集增四行（callers `rules`、acceptsState 真），与 `world/ontology/state-owners.json:109–:112` 逐字一致：`kernel/holdings.mjs#openHolding`、`#closeHolding`、`#transferHolding`、`#rescaleHolding`。
- 附录 D 追加 1118k27 一行；改前快照 `版本快照/卷二-v17补26-勘误前-1118k27.md`（blob `c8f4a7e…`，同改前现行快照）；改后覆盖 `版本快照/卷二-v17补26-现行.md`，与主文逐字节相同；不升版本号；既有历史修订行零改动。

### 3. 验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 648` / `ℹ pass 648` / `ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。

## 只核（2026-11-19，DeepSeek / deepseek-flash）

只核原文见 `docs/审查/5-3-DS只核-1119.md`。结论：**必须改**。复跑：全量 `tests 648 / pass 648 / fail 0`，`pre_commit` `"verdict": "pass"`，`holdings.test.mjs` 20/20。

必须改五条：

1. 别的写者事务里的 `holdWhile` 重算走不通：`holdings.mjs:666`–`:681` 只认 `holdings` 写路径；`engineRef` 只在持有写者入口赋值（`:491`/`:547`/`:580`/`:618`），无生产安装点；即使进入，`:745` 的 `cause=null` 会让 `events.mjs:335` 抛 `E-EVT-SHAPE`。卷二 §2.6 :515 明确要求“不论发起这笔事务的是哪个写者”。
2. 转移、改份额与开边可绕过同意与 `seeded`：`checkConsent`（`:392`–`:396`）不认生成路径，`openHolding:505` 直接收 `origin=seeded`；`transferHolding:578`–`:606` 不查同意且 `insertTransferred:562`–`:567` 复制旧 `terms`；`rescaleHolding:642`–`:659` 以旧边 `terms` 为 base。测试 `:211`–`:228`、`:248`–`:252`、`:268`–`:283` 正是用 seeded 走过 `hk_owns`（`concluded: true`）。
3. `checkHoldingKindRows`（`:758`–`:788`）漏 §2.5 :287–:289 的 `intimate` 逐行、`concluded` 行 `termsKeys` 含 `origin`、`ho_succeed` 行 `succeedBy` 非空、`gone` 不取 `ho_stay`；`grantedBy` 模板核对未做也未记挂账。当前 47 行数据手核都满足，但加载函数会放过坏行；函数本身也未接加载器（挂 5-7）。
4. `intimate` 为真的种类没有按 §3.3 :389 转交关系写者：`assertCarriesRel`（`:465`–`:475`）只判 `carriesRel`。当前 47 行 `intimate` 全假，属将来行的整类缺口。
5. 两条事件分属两个发出系统：`verb_holding_changed` 在 `kernel.emits`（`state-owners.json:80`），同一文件发的 `verb_domicile_changed` 留在 `sys.social.emits`（`:26`）；卷二 §2.7 :770 没有这条区分，`tests/kernel/events.test.mjs:452`–`:454` 把分裂写死。

其余非阻塞项（份额浮点比较、四个 `holdWhile` 读数名写死、加载器接线、端类型/授予者模板核对、`keyKinds` 首段、事件 id 链首、`closeHolding` 不查已终止、旧 `world/ontology/holdings.json` 去留）见只核原文“其余”节。通过项见原文“复核通过项”节：47 行数据、40 列、丙2/丙7、1118k27 手续、测试写死提交号整类修、criteria 未绕过登记器。

## 本轮：照 5-3 只核改五条（深度写者修正）

依据：`docs/审查/5-3-DS只核-1119.md`“必须改”五条；李白 11-18 22:10 总原则“拿不到的上下文不造桩、明确拒收+挂卡”。逐条改法与卷文出处：

1. **别的写者事务里的 `holdWhile` 重算**（卷二 §2.6 :515、卷十八 R18-1.12 ② :531、卷九 §2.9 :442）
   - `touchedFrom` 除 `holdings` 路径外，按“现役 holdWhile 边的持有者/标的”索引（`holdWhileEnds`）扫其他写者的 `written` 路径：任一段等于该索引里的 id 即算写到这条边（`holdings.mjs` 的 `touchedFrom`／`holdWhileEnds`）。不认顶层键与路径形状。
   - `engineRef` 不再由四个写者入口赋值；engine 由挂接处经 `installHoldingEngine` 交入（与 `installEventLog`／`installProposalSession` 同一 install* 模式）。装配文件 `server-plugin/index.mjs` 不在本卡清单且尚未建，接点挂 **5-7**（代码注释与本节同时写明）。
   - 无事务事件时：`cause`/`rule` 取事务上下文 `node`（推进钩子登记代号）；链首 `subject` 取该钩子的主体 id——只有触发实体恰好一个时可取，取不到即整笔拒收 `E-EVT-SHAPE`，不传 `null`。有事务事件时行为不变（链首仍取边句柄 + 变化，挂块 6 改取事务事件 id）。
   - 测试：`holdWhile：别的写者写到持有者的读数…关边并发持有变化事件`、`holdWhile：别的写者事务里拿不到钩子主体 id 时整笔拒收 E-EVT-SHAPE`。
2. **同意与 `seeded`**（卷十八 R18-1.5 :521、§2.6 E-REL-CONSENT :298、键表 `origin` :491）
   - `checkConsent` 只认本笔事务的 `terms.consentAct`；运行期 `origin=seeded` 不再是例外（块 5 无“生成路径事务”标记，挂生成路径卡）。
   - 转移的承接边与改份额新增持有人的边都不再复制旧边的 `origin`/`consentAct`；两者都过 `checkConsent`/`checkGrantor`/`checkShare`。
   - 测试：`转移：…不继承旧边的 seeded/consentAct…拒 E-REL-CONSENT`、`改份额新增持有人：…拒 E-REL-CONSENT`、`运行期开缔结边：terms.origin=seeded…拒 E-REL-CONSENT`；原依赖 seeded 通过的份额/转移用例改为真实口径（份额用不缔结的测试种类行；转移用可转移、不缔结的测试种类行）。
3. **`checkHoldingKindRows` 静态项**（卷十八 §2.5 :287/:289、§2.6 :311/:319）
   - 新增：`intimate` 必须逐行显式（`E-REL-INTIMATE-FIELD`）；`concluded` 行 `termsKeys` 必须含 `origin`；`gone` 不得取 `ho_stay`（`E-HK-PROTOCOL`）；`gone`/`vacated`/`defected` 任一格取 `ho_succeed` 则 `succeedBy` 非空（`E-HK-SUCCEED-SOURCE`）。
   - 每项一条反例测试（四个“加载期核对：…”用例）；真实 47 行仍 0 违例。
4. **`intimate` 转交关系写者**（卷十八 §3.3 :389）：`assertCarriesRel` 同处判 `carriesRel === true || intimate === true`，关系写者未上线即整笔 `E-ACT-WRITER-NOT-READY`（与丙7 同口径）。测试：`intimate 为真的种类也转交关系写者…`。
5. **两条事件同一发出系统**（卷二 §2.7 :770）：`verb_domicile_changed` 从 `sys.social.emits` 移入 `kernel.emits`（`state-owners.json`），`sys.social.emits` 置空（加载期允许空表）；`tests/kernel/events.test.mjs` 期望同步。加载期“非 kindOnly 动词恰被一处 emits 列出”仍通过（`pre_commit` pass）。

### 本轮新增/更新的“部分与挂卡”

- **engine 挂接（部分，挂 5-7）**：`installHoldingEngine` 由装配处调用；`server-plugin/index.mjs` 未建、不在本卡文件清单。
- **无事务事件的事件 id（部分，挂块 6）**：`cause`/`rule` 取钩子登记代号、链首取钩子主体 id（触发实体恰一个时）；事务事件接线后改取事务事件 id。取不到整笔拒收，不造合成 id。
- **生成路径例外 seeded（部分，挂生成路径卡）**：块 5 无“生成路径事务”标记，运行期一律拒收；例外含义仍只在卷十八 R18-1.5。
- **`grantedBy` 授予者模板核对与端类型按实体表解析（部分，挂第一张实体模板卡）**：`checkHoldingKindRows` 只做模板名闭集与本节静态项；实体模板表上线时补。
- **`checkHoldingKindRows` 接加载器（部分，挂 5-7）**：函数仍只由测试调用。
- **关系写者（部分，挂卷十八首卡/块 7）**：`carriesRel` 与 `intimate` 一律整笔拒收 `E-ACT-WRITER-NOT-READY`。

### 本轮验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 658` / `ℹ pass 658` / `ℹ fail 0`（末行 `ℹ duration_ms 113293.151`）。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。
- `node --test tests/kernel/holdings.test.mjs` → `ℹ tests 30` / `ℹ pass 30` / `ℹ fail 0`。

## 本轮：照 5-3 Sonnet 终核改两条（同意入口、未装 engine 即拒）

依据：`F:/dnd-tmp/review/5-3-Sonnet终核-1119.md`“必须改 1”“必须改 2”；开工先 `git fetch origin && git rebase origin/master`（成功）。不加新设计。

### 1. 缔结类的转移与改份额新增持有人能带本笔同意（终核必须改 1）

- 卷十八 R18-1.5 :521 原句：“`concluded` 为真的种类只能由动作目录里带同意条款的动作成立。……同意事件的编号记在 `terms.consentAct`（E-REL-CONSENT）。”转移与改份额写的是“承接边/新增边”这两条新边，须带**本笔事务自己的**同意，不是“禁止”。
- 改法（`server-plugin/kernel/holdings.mjs`）：
  - 新增 `issuedConsent(input)`：只取入参 `terms.consentAct`（与开边同形），值须为代号或 null，否则 `E-HK-PROTOCOL`；其余键不从入参取。
  - `transferHolding`：承接边 terms 仍剔除旧边 `origin`/`consentAct`，再写入本笔 `terms.consentAct`（无则 null），其余旧 terms 照带；`checkConsent` 照旧把关。
  - `rescaleHolding`：新增持有人的边经 `prepareTerms` 时带上本笔 `terms.consentAct`；base 仍不含旧边 `origin`/`consentAct`。
  - 未改 `primitives-runtime.mjs` 适配器（见下“卷九契约核对”）。
- 测试（`tests/kernel/holdings.test.mjs`，期望手算）：
  - `转移：缔结的种类行带本笔同意（terms.consentAct）通过…`：旧边 `hld_1`（`hk_owns`，`share=1`、`origin=seeded`、旧同意 `act_old_consent`）转给 `npc_b`，带 `terms.consentAct='act_new_consent'` → 成功；新边 `hld_2` terms 为 `{since:10, until:null, endReason:null, suspended:false, grantor:null, share:1, consentAct:'act_new_consent'}`，无 `origin`。
  - `改份额新增持有人：缔结的种类行带本笔同意…通过…`：旧边 `npc_b:1` 改为 `npc_b:0.4 + npc_a:0.6`，带本笔同意 → 成功；新增 `npc_a` 边 terms 的 `share=0.6`、`consentAct='act_new_consent'`、无 `origin`。
  - 原“无本笔同意即拒 `E-REL-CONSENT`”两例保留，仍通过。

**卷九契约核对（照卡文 `sed -n`）**：`docs/统一底层设计/卷九-AI接口.md` §4.2.1 :630 表头写“契约必填字段（可选字段从略）”；:635 `holding.transfer` 行列 `holding` 或 `id`；`newHolder` 或 `holder`；:636 `holding.rescale` 行列 `holdingKind`、`subject`、`shares`。**卷九原语契约缺 consentAct 字段，等李白裁定。** 照卡文“卷文没有就只在内核写者入口接受”，本轮只让 `transferHolding`/`rescaleHolding` 内核入口收 `terms.consentAct`，适配器不自补字段；即经 `execute` 的 `holding.transfer`/`holding.rescale` 原语批暂时传不进本笔同意，待裁定后在适配器同步（`holding.open` 的适配器早已照原样转交可选字段 `terms`，两者不同处仅此一处登记）。

### 2. engine 未交入不得静默跳过（终核必须改 2）

- 现状问题：`recompute` 在 `engineRef` 为空时直接 `return`；写者入口也不检查，等于提交前重算整段不执行且不报错（卡头第二节第 3 条“不留绕过口子”）。
- 改法（`server-plugin/kernel/holdings.mjs`）：
  - 新增 `needEngine()`：四个写者入口（`openHolding`/`closeHolding`/`transferHolding`/`rescaleHolding`）在 `engineRef` 为空时整笔拒收 `E-ACT-WRITER-NOT-READY`（入口收到的 `engine` 参数不拿来充数）。
  - `recompute`：`engineRef` 为空时不再 `return`；本笔事务写到 `holdings` 路径、或任一路径段等于某条现役持有边的持有者/标的一律整笔拒收 `E-ACT-WRITER-NOT-READY`。无 engine 时读不到种类行、无法判哪条边带 `holdWhile`，故保守取全部现役边两端（宁可多拒，不静默跳过）；没碰持有端的其它事务照常提交。
- 测试：
  - `未装 engine：持有写者四入口整笔拒收 E-ACT-WRITER-NOT-READY，状态与事件都不变`：四入口各拒一次，state 与事件簿均不变。
  - `未装 engine：别的写者写到持有端路径即整笔拒收…状态不变；没碰持有端的照常提交`：现役边 `npc_a→item_q`，写到 `npc_a` 的一笔拒收、state 不变；写到 `npc_b` 的一笔照常 `{ok:true}`。

### 本轮新增/更新的“部分与挂卡”

- **卷九 holding.transfer/rescale 原语契约缺 `terms`/`consentAct`（部分，等李白裁定）**：卷文表只列必填字段；裁定后若允许可选字段，适配器同步转交 `terms`，否则经原语批的同意路径继续不可达。
- **engine 挂接（部分，挂 5-7）**：`installHoldingEngine` 仍只能在装配处调用；未装期间任何持有写入与持有端写入都整笔拒收（本轮已从静默改为拒收）。

### 本轮验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 662` / `ℹ pass 662` / `ℹ fail 0`（末行 `ℹ duration_ms 113866.5594`）。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。
- `node --test tests/kernel/holdings.test.mjs` → `ℹ tests 34` / `ℹ pass 34` / `ℹ fail 0`。

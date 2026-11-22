共 7 条，甲 0 乙 4 丙 3，有理由 3 无理由 4。

本卡读了：卷四 :395-595（含 §3.1–§3.3 :401-432、§4.1 :457-511、§4.2 :513-585）、:712-766（§4.6）、:860-922（§4.8）；卷二十一 :102-103、:203、:279、:293、:362-410、:428-431、:448-466、:510-514、:609、:858-862、:918-919、:993-996、:1053-1055、:1392、:1410-1412（按卡文先 Grep 定位再读）。代码：server-plugin/body.mjs:1-200、action-capacity.mjs:1-138、death.mjs:1-275、kernel/validate/body-tables.mjs:1-218 全文；另为核对读 kernel/dimensions.mjs:490-605、kernel/det-math.mjs:127-155/:580-600、status.mjs:1-62、life.mjs:145-152、kernel/terminate.mjs 相关段、world 数据（body_plan.json、status.json、item.json、rules/tables/{body,capacity,death,terminate}.json、rules/registry.json、state-owners.json）。未读到：卷四 §2.1/§2.2 表头与身体图不变量的原文（:202 一带）、§4.11；卷二 §2.6 原文未通读（只读 terminate.mjs 与规则表里的等价表述）；卷二 §2.5 只读 :510-519；卷二十一全文未通读。

# 偏离清查 05b（卷四、卷二十一：身体、行动能力、死亡尸体）

另核对、未记条的三项（卡文要求）：① 判死：全仓 `state.terminated` 的读者只有 action-capacity.mjs:66（规则层）、kernel/storage.mjs:292 与 kernel/terminate.mjs（内核协议自己的写/核），death.mjs 不读、不数终止类实例（death.mjs:3、:173 自述且 grep 属实），无违规。② 尸体质量/份额的截断精度取自 item 表头（death.mjs:95-98 读 massKg.precision 与 material 元素 share.precision），无 4 位字面量。③ 体重只经 life.mjs 的 massOf（body.mjs:171、death.mjs:115），能力阈值只读规则表（body.mjs:69 rules.body、action-capacity.mjs:52 rules.capacity），均未写死。

---

### 1 身体修正项来源空转：B-2 部位完好度与 B-6 登记修正项永远收不到
- 位置：server-plugin/body.mjs:119（B-2 部位完好度）、:164（B-6 能力求值），经 kernel/dimensions.mjs:490 `registeredRows` → `modifierSource`
- 设计原文：卷四 :535「`bodyView` 收集主体的状态实例时，用实例的 `bodyPart` 补成 `body_plan.partIntegrity[p]` 再送入管线」；:540 B-6「以 `body.c` 为目标…本卷只保证它们被收集」
- 代码实际：`modifiedWith` 收登记修正项只经 `installModifierSource` 交入的来源，全仓无生产交入者（只有 tests/kernel/body.test.mjs:23、capacity.test.mjs:38、death.test.mjs:18 交测试桩），`modifierSource` 恒为 null，`registeredRows` 恒返回空，部位完好度恒为 1、`body.*` 恒为结构基值
- 理由：有——docs/问题.md:469（`installModifierSource` 是临时接口、B2-W3 未做、`modifier.mjs` 未建，等裁定随修正项写者卡做）；docs/PLAN.md:14 块 6 记「modifier.mjs 与 §3.5 holdings 勘误归块 7」
- 影响：读数错（一旦有状态实例，伤病、睡眠、装备对 `body.*` 全不生效，`awake`/`can`/`capacity` 照基值判；现在生产无状态写者，暂未出错）
- 严重程度：乙
- 合并：无（与《偏离清查-1122》第 24 条 taint/severity 常量不是同一处）

### 2 carcassOf 不处理 S-5 无实体物种，卷文要求 carcass 为空
- 位置：server-plugin/death.mjs:109-153（个体分支 :111-135、物种分支 :136-152 两处都没有空 tissues 判断）
- 设计原文：卷四 :882 D-4「物种无实体（§4.1 S-5）时 `carcass` 为空：不新建尸体，`wreck` 模式下的残骸实体不补尸体组件类」
- 代码实际：只看 `bodyView` 为 null 或参与部位 size 之和为 0；物种 `tissues` 为显式空映射时，个体分支逐组织取材料得未知即抛 `E-DIM-UNKNOWN-READ`，物种分支同；若身体图 `tissueFractions` 也为空则返回一件 `material` 为空、质量非零的"尸体"
- 理由：无
- 影响：规则缺（无实体物种死亡时要么报未知、要么产出一具无材料尸体，与"carcass 为空、不新建尸体"不符）
- 严重程度：乙
- 合并：无

### 3 B-10 的 E-BODY-PART-TARGET 没有任何实现，bodyPart 可任意写入
- 位置：server-plugin/status.mjs:56（`addStatusInstance` 原样收 `spec.bodyPart` 写进实例）
- 设计原文：卷四 :544 B-10「作数的运行态状态实例的 `bodyPart` 必须是主体当前有效身体图（B-9）中的一个具体部位，或为空（整体状态），否则写入被拒（E-BODY-PART-TARGET）」
- 代码实际：不核 `bodyPart`；`any`、表外代号、非该主体身体图的部位都能写进状态实例；E-BODY-PART-TARGET 只在 kernel/error-codes.mjs:98 登记，全仓无判点
- 理由：有——docs/卡回报/ds-b6-5.md:27（块 6 状态容器最小版不判"作数"，卷二十一 R21-1.11 归后面的卡）
- 影响：规则缺/可绕过（现在生产无状态写者，暂未出错）
- 严重程度：乙
- 合并：无

### 4 本卡范围内多个卷文要求入口只有测试调用者：can、capacity、die、requestRevive
- 位置：server-plugin/action-capacity.mjs:89 `can`、:127 `capacity`；server-plugin/death.mjs:230 `die`、:249 `requestRevive`
- 设计原文：卷二 :518-519（`can`、`awake`、`capacity`、`terminated` 是状态谓词单点）；卷四 :415「清醒、行动能力、死亡三问，调用方 import 卷二 §2.5 的 `can`/`awake`/`capacity`」、:428 写入口表「`die` … 全书致死的唯一入口」、:429 `requestRevive`
- 代码实际：生产 import 的只有 `awake`（perceive.mjs:24）与 `terminated`（death.mjs:20）；`can`、`capacity` 只在 tests/kernel/capacity.test.mjs:25 调，`die`、`requestRevive` 只在 tests/kernel/death.test.mjs:22 调
- 理由：无（PLAN 块 6 另排 6-13/6-14 动作层、卷二十一健康推进不在本块，但没有裁定或问题.md 记这几项无调用者；问题.md:397 只记 die 会因三处未建整笔拒收）
- 影响：玩法不可达（真实世界里没有致死与行动能力判定的入口）
- 严重程度：乙
- 合并：无

### 5 death.mjs 用字面量 'wreck' 判后继方式，不读已登记的 code_enum successor_mode
- 位置：server-plugin/death.mjs:32 `wreck: 'wreck'`、:179 `if (info.mode === S.wreck)`
- 设计原文：卷四 :882 D-4「`mode` 为 `wreck` 的，协议第 1 步原地生成的那个残骸实体就是尸体」
- 代码实际：与写死的 'wreck' 比较；同值在 kernel/handles/markers.mjs:21 `successor_mode: ['inherit','liquidate','wreck']`，协议侧 kernel/terminate.mjs:71 经 `T.code_enum.successor_mode` 取，death.mjs 不读它（违反卡头第二节第 10 条：种类分支进数据表、已有公共部件要调）
- 理由：无
- 影响：只是形式（枚举改名即错）
- 严重程度：丙
- 合并：无

### 6 requestRevive 多一个 cause 形参，与卷文登记的签名不符
- 位置：server-plugin/death.mjs:249
- 设计原文：卷四 :429「`requestRevive(engine, state, subjectId, point)`」
- 代码实际：实现为 `requestRevive(engine, state, subjectId, point, cause)`，`cause` 直接传给卷二内核 `revive`（kernel/terminate.mjs:530）
- 理由：无（卷文没写 `revive` 的 cause 由谁给，代码自补一个形参）
- 影响：只是形式（接口与 §3.3 登记表不一致；当前无生产调用者）
- 严重程度：丙
- 合并：无

### 7 四个文件直读 engine.rules / engine.vocab 内部 / engine.tables 表头
- 位置：server-plugin/body.mjs:35、:69；server-plugin/action-capacity.mjs:39、:52、:90；server-plugin/death.mjs:54、:96、:162、:197、:219
- 设计原文：卷二 :469（`vocab`、`kindOf` 等横切入口）；卡头第二节第 10 条「已有公共部件就必须调它」
- 代码实际：直读 `engine.rules[表]`、`engine.vocab.families/index`、`engine.tables.get(...).doc`；现无规则表读口、族条目枚举读口、表头维度定义读口
- 理由：有——docs/研究/公共部件审查-乙-1122.md 第五节第 4 条（规则表直读名单含 action-capacity.mjs:52、body.mjs:69、death.mjs:54/:197）、第十节"族条目枚举读口（缺）"与"表行与表头读口（缺）"（含 death.mjs:96/:161/:192/:219）
- 影响：只是形式（缺公共读口时无别的路；加载期校验保证真实世界表都在）
- 严重程度：丙
- 合并：见《公共部件审查-乙-1122》第五节、第十节

---

## 已登记未建

1. **B-8 致命部位反应规则**（某 vital 部位 eff 变 0 即调 `die`，`cause` 取 `rules.death.vitalLossCause`）：卷四 :542、:582；登记处 world/rules/tables/death.json 的 `unbuilt` 行（`vitalLossCause`）、world/rules/registry.json:310；代码无判点。
2. **wreck 模式给残留实体补尸体组件类与实例维度**：卷四 :882；登记处 docs/问题.md:397（残骸生成器归 6-27）；death.mjs:179 整笔拒收 `E-ACT-WRITER-NOT-READY`。
3. **复生付费与后果**（`revival.cost` 经账本付给点对方、`revival.effects` 执行）：卷四 :886 D-6；登记处 docs/问题.md:397、docs/研究/偏离清查-1122.md 第 112 行；death.mjs:261-262 两项非空即整笔拒收。
4. **复生后的移位**（`placeSubject`，卷十七 §3.3）：卷四 :887；登记处 docs/PLAN.md:14 卡 6-27（位置写者）；death.mjs:246 自述未建，`requestRevive` 成功只写 `lastMinute`。
5. **尸体账户用途 `corpsePurpose`**：卷四 :882（只写"在终止时所在地点新建一件尸体物品"，没给账户用途）；登记处 world/rules/tables/death.json 的 `unbuilt` 行；`settleBody` 读到即 `E-ACT-WRITER-NOT-READY`。
6. **卷二十一健康推进（R21-1.7 致死、绝大多数状态行与病程律）**：卷二十一 :428、:457；登记处 world/ontology/dimensions/status.json:22（status 表当前只有 `status_death` 一行）、docs/PLAN.md:14 块 6 清单无健康卡。
7. **E-BODY-INTEGRITY-TARGET 的运行期检查**（修正写者拒收以 `body_plan.partIntegrity` 为目标、来源不是带 `bodyPart` 的状态实例的修正项）：卷四 :580（§4.2.6 验收断言）；登记处 docs/审查/卷四-余项单核.md:81（"运行期检查要落在卷二 §3.2 的修正写者处，属卷二代码侧回填"）、docs/问题.md:469（modifier.mjs 未建）。

## 拿不准

1. **B-5 派生项的 `source.kind` 取值**：body.mjs:160 用 capability 族的族名（`'capability'`），卷四 :538 写「`source = {kind: 能力依赖, id: (能力 c, 限制者 k), via: 限制者 k}`」。卷文没给"能力依赖"这个 kind 的登记表，B-4 同处也用了表 kind（`body_plan`）；缺"source.kind 取值表"的依据，不判对错。
2. **阈值精度与能力维度精度不对齐**：world/rules/tables/capacity.json:4 的 `full` 三项取 0.6667（precision 4，自述"三等分取 2/3"），body_plan 表头 capabilities 各项 precision 3（world/ontology/dimensions/body_plan.json:9-20）。恰为 2/3 的能力值按 3 位截成 0.666，`0.666 >= 0.6667` 不成立会判成 limited。现有身体图贡献只出 0.5/1，碰不到；阈值本身标"暂定·待试玩标定"。缺：阈值与能力维度精度的对齐规则（卷文未给数）。
3. **body-tables.mjs:163-164「恰一个根（parent null）」**：本卡读的卷四行号里没有这条不变量的原句（它应在 §2.2 :202 一带，未读），现只知代码自述；不判对错。

## 跨卷待判

1. **B-8 致命部位反应的触发点**：卷四 :542 说"本卷的反应规则调用 `die`"，但部位折损的状态实例由卷十三 §4.1/§4.3 写入、严重度致死由卷二十一 R21-1.7 推进；`source` 要取"造成该部位折损最大的状态实例所属的状态行"（卷四 :542）。这条反应规则落在卷四反应规则、卷十三写入处还是卷二十一整拍里，须卷四、卷十三、卷二十一三卷对读才能定（现登记为未建，规则表登记处只记"块 6 不建"）。
2. **B-10 的"作数实例"判据**：卷四 :544 把作数判据与挂起实例指到卷二十一 R21-1.11，身体图变更后的部位重定也在那里；这条校验最终归状态写者（status.mjs）还是卷二十一健康推进，须两卷对读才能定（现登记在 docs/卡回报/ds-b6-5.md:27）。

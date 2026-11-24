# 偏离清查 03b：卷二（取值顺序、声明、表达式 RX、行校验）

共 7 条，甲 0 乙 5 丙 2，有理由 0 无理由 7。
本卡读了：卷二 :88–299（含指定 :123–172、:263–288，另读 §1.2 :94–122 以核 required 全策略）、:480–579（含指定 :490–565）、:1331–1465（指定 :1331–1460）；补读卷二 :383–413（§1.12 反查索引，为 reverse-index.mjs）、卷三甲 :171–182（物性格来源级别，为 cell-grades.mjs）。代码全读：kernel/declare.mjs、kernel/rx.mjs、kernel/reverse-index.mjs、kernel/memo.mjs、kernel/named-structs.mjs、kernel/named-struct-match.mjs、kernel/validate/rows.mjs、kernel/validate/cell-grades.mjs；另为取证只读 kernel/dimensions.mjs:324–334、:386–421。未读：卷二 §2.7 表体 :565 以后、§2.9 第 4 条（rxTree 变体定义，卡文未给范围），rx_op 语义只按 §3.3、§1.6 与代码能对的部分判，其余不判。
③ 清单逐项查过：本卡文件里没有自带依赖表的文件（依赖只经 declareInputs）；RX 数值运算全经 det-math 定点，无浮点除法，Math.* 只有 rx.mjs:313 算编译期树深（整数、与规则数值无关），未记；缺失处置未见"缺了当 0/当空"，唯一一处把已知值读成未知的是第 1 条。已知偏离不重复：dimension-writers requiredFor 只覆盖两策略、modified 未知基值不记 W-MOD-UNKNOWN-BASE。

### 1 RX 求值器不认显式 null，调用方又把 null 滤成未知
- 位置：server-plugin/kernel/rx.mjs:368–373（readValue）、:406–412（member）；旁证 server-plugin/kernel/dimensions.mjs:329（rxBindings 把 null 丢掉，不在本卡文件清单）
- 设计原文：卷二 :267「显式 `null`（空集、空映射）是已知值…条件比较里 `null` 只等于 `null`…序比较（`lt`、`le`、`gt`、`ge`）与 `member` 遇显式 `null` 判"不成立"…外层 `not` 照常取反成"成立"」
- 代码实际：readValue 收到 null 直接抛 E-MOD-RX；member 要求集合是数组，null 即抛；rxBindings:329 又先 `f.value !== null` 把显式 null 从绑定里删掉，等于把"已知的没有"读成"未知"，最终按缺读数抛错。
- 理由：无。裁定-1117.md:438（问题.md:279）已要求"显式 null 按字段定义处写的含义处理，不当未知"，并指明 set 型空集让 member 为假；那次改在 named-conditions，rx 与绑定生成没跟着改。tests/kernel/grades-named.test.mjs:192 把"抛错"写成期望，是现状固化，不是裁定。
- 影响：读数错（本应为假的比较变成整条 RX 报错；凡读显式 null 字段的修正项/派生式都失败）
- 严重程度：乙（现有 RX 未读到这类字段，暂未出错；一旦读到即甲）
- 合并：无（问题.md:502 只记了 rx.mjs:278 的注释口径，不是这一条）

### 2 memberOf 不看 tags
- 位置：server-plugin/kernel/validate/rows.mjs:104–109
- 设计原文：卷二 :131「`tags` 与 `classes` 都沿 `_vocab.json` 的 `broader` 上位链展开后参与 `memberOf`（RB-S4：class 族同样展开）」
- 代码实际：memberOf 只遍历 row.classes 及其词表祖先，row.tags 完全不参与；checkRows:60 又允许 tags 写任意词表条目（含 class/component 族）。
- 理由：无（问题.md:206 记了同一函数"只读行上 classes"，但只解释派生类别不触发，未涉及 tags）
- 影响：规则缺（用 tags 声明类属的行，byClass 必填判定与 precedence 链都认不到）
- 严重程度：乙（现维度表无一行写 tags，暂未出错）
- 合并：无

### 3 W-DIM-PRECEDENCE-TIE 从不报
- 位置：server-plugin/kernel/validate/rows.mjs:118–121（valueOf 取链首即返回）；server-plugin/kernel/error-codes.mjs:45（码已登记）
- 设计原文：卷二 :163「两个互不相含的类别同时命中同一维且值不同 → W-DIM-PRECEDENCE-TIE」
- 代码实际：按 precedence 链顺序取第一个有值的类别即返回，不比较后面命中的类别值；全仓 grep 无该码的抛出点。
- 理由：无
- 影响：规则缺（多类别值冲突静默取先者，无告警）
- 严重程度：乙
- 合并：无

### 4 allowExplicit 派生维度在类别行写值被放过
- 位置：server-plugin/kernel/validate/rows.mjs:45
- 设计原文：卷二 :109「`true` 时允许实体行/偏离行写显式值…」；:108「有 derived 的维度在任何行里手填即 E-DIM-DERIVED-WRITTEN」；:339「只有表头声明 `allowExplicit:true` 的派生维度才接受偏离行与实体行的显式值」
- 代码实际：只判 `def.allowExplicit !== true` 就豁免，不区分所在节；类别行（classes）写 allowExplicit 维度同样放行。
- 理由：无
- 影响：规则缺/绕过（类别行可手填派生值，绕开"任何行"禁令）
- 严重程度：乙（现无数据在类别行写 allowExplicit 维：item.json classes 为空，place 的 seasonScheme 只落在 comp_weather_cell 实例行）
- 合并：无

### 5 命名 struct 值校验只认 integer/boolean，其余登记类型串一律判不合
- 位置：server-plugin/kernel/named-struct-match.mjs:46–54
- 设计原文：卷二 :203「命名 struct 里的数值字段一律写成 `integer:<单位>` / `number:<单位>`，单位取 §1.4 `_units.json`，与 `pathTypes` 的数值路径同一写法、同一报错（E-DIM-UNIT-UNKNOWN）」
- 代码实际：类型串以 `integer` 开头按安全整数判、恰为 `boolean` 按布尔判；`number:`、`enum:`、`ref:`、`Handle<>`、`EntityId`、`SeedKey`、`RxId`、带 `nullable` 等一律返回不合；也不核单位是否登记。pos 以外的命名 struct 一经 `named` 维度或写入口引用，合法值全被判不合。
- 理由：无（仅注释自述"只认本卡用到的两类"）
- 影响：规则缺（命名 struct 登记表的 grammar 大部分没有校验；pos 以外的值无法通过）
- 严重程度：乙（现只有 struct:pos 经 `named` 使用，其字段是 integer:count/boolean，暂未出错）
- 合并：无（公共部件审查-甲 D1 只核 isPosValue 这一处，未记类型串覆盖不全）

### 6 cellGrades 不核"该写 null 的栏"
- 位置：server-plugin/kernel/validate/cell-grades.mjs:73–75
- 设计原文：卷三甲 :173–175「measured…`basis` 写 null；referenced…`citation`、`basis` 都写 null；designed…`citation` 写 null」
- 代码实际：只核 measured 有 citation、designed 有 basis；measured 的 basis、referenced 的 citation/basis、designed 的 citation 写了非空值也不报。
- 理由：无（卷二 :1631 登记的 E-MAT-GRADE-FIELD 只写了前两项，补后三项须先定码）
- 影响：只是形式（数据纯度；规则层与校验本就不读这些文字）
- 严重程度：丙
- 合并：无

### 7 三节行清单在四处各写一份
- 位置：server-plugin/kernel/validate/rows.mjs:16、server-plugin/kernel/validate/cell-grades.mjs:18、server-plugin/kernel/validate/dimensions-validate.mjs:74、:514、:562
- 设计原文：卷二 :121「`classes / rows / generated` … 三节（§1.3）」；卡头第二节第 10 条「已有公共部件就必须调它，不许自己另算一份」
- 代码实际：同一份节名清单以字面量数组各写一遍，四处维护，没有单一定义处。
- 理由：无
- 影响：只是形式（加第四节要改四处，漏改即校验口径分叉）
- 严重程度：丙
- 合并：无

## 已登记未建／已知缺口（不算偏离）

1. RX 关系聚合原语只有 `known` 有求值，其余（`exists`、`count` 等）运行期直接报 E-MOD-RX（rx.mjs:415–421）。设计卷二 §2.9 :1185（据问题.md:182 引）；登记处 docs/问题.md:182。
2. 派生、采样维度未求值：rows.mjs:123 把 `derived` / `sample` 的维度记为 `known:true, value:undefined`，不走 §1.3 :159–160 的求值。设计卷二 :159–160；登记处 docs/问题.md:239（并见 :468，B2-W3 裁定 B）。
3. `compileRX(text, profile)` 两档都不实现，数据档只由加载期 `compileRXInScope` 编（rx.mjs:325–328）。设计卷二 :1222（据问题.md:180 引）；登记处 docs/问题.md:180。
4. RX "随字段"读法加载期未逐字段核（rx.mjs 只按声明的作用域核类型）。设计卷二 :1232（据问题.md:509 引）；登记处 docs/问题.md:509。
5. `dim:<kind>` / `modified:<kind>` 的 relation 与 scope 闭包为空（在 kernel/load/world.mjs:226–228，不在本卡文件清单）。合并：见 docs/研究/偏离清查-1122.md 第二节第 9 条（第 3 组 #1），不重复计。

## 拿不准

1. **stateMemo 签名**：卷二 §2.3 :500 的例子是五参 `stateMemo(state, engine, [impl, id], build, inputsOf('view:placeView'))`，memo.mjs:34 是四参 `stateMemo(state, scope, inputs, build)`——第二个形参从 engine 变成缓存名，第五个形参（声明依赖）被忽略。现唯一调用者 dimensions.mjs:529 按四参调。缺：stateMemo 的正式签名与第五参用途的卷文一句（问题.md 未记）。
2. **instanceTable 偏离行的 basis/sources 校验归属**：rows.mjs:16 只巡视 classes/rows/generated 三节，§1.3 :128 要求 instanceTable 的偏离行带 `basis`、真实量带 `sources`。现所有维度表 `instanceTable` 都是 null，看不出该由哪张卡的校验器接手。
3. **named-structs.json 的 struct:modifier 键形**：该行用点分平键记嵌套字段（`source.kind`、`source.id`，named-structs.json:35–36），而 §1.5 :205 的值形状是 `source:{kind,id}`；matchStruct 要求键集完全一致，按现登记去核实际值必判不合。该行未被 `named` 维度引用，暂不发作；是数据改嵌套还是校验认点分，未定。
4. **§1.6 :269「映射一律覆盖全族」与「gap/skip 缺键只按逐键处置」怎样落地**：rows.mjs:254 只在 `onUnknown === 'error'` 时核缺键，gap/skip 的映射不核覆盖。两句如何并读缺明确执行口径，未判为偏离。

## 跨卷待判

1. **第 1 条（RX 显式 null）的修法落点**：要么 rx.mjs 求值器认 null，要么 dimensions.mjs:329 的绑定生成不把 null 当未知（后者要 §1.12 的未知传播总则与 §1.6 :267 对读）。涉及卷二两节与两个文件，本卡只判"实现与设计不符"，改哪一处交主会话。
2. **第 6 条（cellGrades 该写 null 的栏）**：卷三甲 :173–175 的规则与卷二 :1631 登记的 E-MAT-GRADE-FIELD 语义宽窄不一；补查要先定错误码归属，跨卷二与卷三甲。

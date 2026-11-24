共 5 条，甲 0 乙 4 丙 1，有理由 0 无理由 5

本卡读了：卷二十七 :607-663、:775-830；卷二 :280-439（本卡指定 :289-311、:312-340 均在其中）。代码：server-plugin/kernel/det-math.mjs :1-600（全）、server-plugin/kernel/sample.mjs :1-495（全）、server-plugin/kernel/handles/keys.mjs :8-221（键串拼接核对）、world/rules/tables/kernel-constants.json（全）、world/rules/tables/det-numeric.json 的键与各行行头/表长/端点/摘要（未通读 466KB 表值）、world/ontology/dimensions/_distributions.json 的 normalQuantile 与 expTable 行头、表长、端点。未读：卷二 §3.3（定点算术与 fixedLn 的定义处）、§1.5 curve 行、卷二十六；det-numeric 各表值的逐值内容（只核行头、长度、端点、摘要）。det-math 内部无 Math.floor/Math.round/浮点除法（Grep 为空）。

### 1 ln 有两份实现（级数法与查表法），违“唯一实现”
- 位置：server-plugin/kernel/det-math.mjs:319（fixedLn，六步级数）、:437（ln，查 fnTables.ln 线性插值）
- 设计原文：卷二十七:620，“内核定点数学设施是全仓超越函数的**唯一实现**”
- 代码实际：fixedLn 按卷二 §3.3 的六步级数算一份，ln 按卷二十七 fnTables 查表算另一份，同一输入给不同值。
- 理由：无（仅审查文记“等李白裁定”，无裁定号、勘误号或问题.md 行号）
- 影响：读数错（同一个 ln 两值；现两者均无生产调用，见乙文）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第六节（G14，卷文矛盾，等李白裁定）

### 2 半正定校验用 Math.sqrt 与浮点除法
- 位置：server-plugin/kernel/sample.mjs:289（checkCorr 的 Cholesky 主元）
- 设计原文：卷二:329，“自带 PRNG 与定点算术（全部 BigInt 整数运算）”；卷二十七:620 内核定点设施唯一实现
- 代码实际：主元 `pivot -= a[i][k]*a[i][k]`、`Math.sqrt(pivot)`、`s / a[i][i]` 全用 JS 浮点，负主元才报 E-DIM-SAMPLE-CORR。
- 理由：无（仅乙文记“在改：寿命截断卡”，无裁定号、勘误号或问题.md 行号）
- 影响：规则缺（加载期参数校验未按“全部 BigInt”做，暂未影响采样值）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第六节第 4 条（server-plugin 下现仅此一处 Math.sqrt）

### 3 curve 分布属首批却未求值
- 位置：server-plugin/kernel/sample.mjs:491-493（drawFrom 的 default 抛普通 Error）；:447-448 注释把 curve 推给卷二十六
- 设计原文：卷二:325，“首批实现 uniform/normal/lognormal/triangular/categorical/curve；joint 只定格式，卷二十六实现”
- 代码实际：curve 只在 :342-344 做“curve/x 是字符串”的参数校验；求值落到 default，抛 `needs its frozen tables ... not yet built`，与 joint 一并当未建。
- 理由：无
- 影响：规则缺（任何 `dist:curve` 的维度/分布采样都不可用；现数据无 curve 分布，暂未出错）
- 严重程度：乙
- 合并：无（公共部件审查-甲 C4 只记种类分派散在四处，未记 curve 求值缺）

### 4 骰值键路径的分布校验缺维度上下文：categorical 键枚举域、clamp⊂domain 永不检查
- 位置：server-plugin/kernel/sample.mjs:244（drawByKey 调 `validateDistribution(distribution)`，不传 dimDef/engine）
- 设计原文：卷二:325，“categorical … 键在枚举域；`clamp ⊂ domain`（E-DIM-SAMPLE-DOMAIN）”；:337，“非法分布（参数不合、clamp 越域、权重非法）按本节‘参数校验’报 E-DIM-SAMPLE-PARAM / -DOMAIN / -WEIGHTS”
- 代码实际：无 dimDef 时 checkCategorical 的 `dimDef.vocab` 分支（:267）与 checkClamp 的 `dimDef.domain` 分支（:302）都跳过；规则表分布的加载期参数校验也未做（validate/types.mjs:285 注“P-2 未做”），故骰值键路径上这两项无人检查。
- 理由：无
- 影响：规则缺（枚举域外的 categorical 键、越域 clamp 经 drawByKey 静默通过；暂未出错）
- 严重程度：乙
- 合并：无（“加载期不校验”一项见上一轮第 2 组记录，本卡不复记；本条指运行期 drawByKey 亦不校验）

### 5 safeIntMax 兜底字面量绕过数据表
- 位置：server-plugin/kernel/det-math.mjs:6-8（`LIMIT = BigInt(Number.MAX_SAFE_INTEGER)`，installDetNumeric 未调时静默采用）
- 设计原文：卷二十七:619，“整数（绝对值不超过 `safeIntMax`）”；§4.5.1 :611 把 `safeIntMax` 列为维度
- 代码实际：safeIntMax 本应在 world/rules/tables/det-numeric.json（登记值 9007199254740991）；代码自带同值字面量作默认，未像 BASE/SCALE 那样缺表即报加载顺序错。
- 理由：无（仅代码注释自述“未装时用 IEEE 754 固定值”）
- 影响：只是形式（字面值与表值相同；正常加载 :407 会用表值覆盖）
- 严重程度：丙
- 合并：无

## 已登记未建
- joint 向量求值：卷二:325“joint 只定格式，卷二十六实现（首批按 marginals 独立采样）”；代码 sample.mjs:447-448/491-493 照此拒（不静默给假值），登记处卷二 §1.10、卷二十六 R26-1.1。属已登记未建，不计偏离。

## 拿不准
- ref 分布：卷二:323 定义 `{"dist":"ref","name":"…"}` 引用 _distributions.json，:337 要求“`ref` 展开后必须是上述五种之一，否则报 E-DIM-SAMPLE-PARAM”。sample.mjs:245 把 ref 与五种并列拒绝、:491 default 抛错；而 _distributions.json 现只有 normalQuantile/expTable，无命名分布表。ref 是否属首批、命名分布表是否已登记未建，本卡卷文未明写。
- map 逐键采样的种子键写法：sample.mjs:475/484 对 map 维度逐键采样时把种子键第四段写成 `joint:<key>`；卷二:327 只规定 joint 分布换 `joint:<group>`，逐键独立采样是否该用同一写法、会不会与真 joint 组撞键，卷文推不出。
- 曲线点空：validate/types.mjs:262 的 `pts.every(pairOk)` 对空数组恒真（空曲线过加载校验），到运行期 dimensions.mjs:382 lookupCurve 才以 E-MOD-STAGE 拒；卷二:191 的 curve 文法（“x 严格递增，E-DIM-DOMAIN-CURVE”）不在本卡所给卷文行内，无法判空点该不该在加载期拒。非单调点已在 types.mjs:263 拒。
- 曲线插值标度：docs/问题.md:430 已登记 fixedCurveAt 按 10⁴ 标度、卷二:1345 写 10⁸，归下一张动 det-math 的卡改；卷二:1345 不在本卡范围，未复核。
- precision 上界：sample.mjs:367 只查 p≥0（注释写 want 0-4），p≥5 时 det-math:581 的 step=0n 会抛 BigInt 除零 RangeError；维度 precision 0–4 由加载期校验（本卡未读），正常路径不触发。
- 位宽字面量：sample.mjs:31-36 的 `U_SHIFT_HEX='c0'`（192 = 256−64）与 `WORD_ONES`（64 个 f）是 sha256/64 位算法宽度，kernel-constants 未登记；是否列入“写死”红线，按卷二 §1.10 冻结算法常量、非世界数值的口径判。

## 跨卷待判
- 第 1 条 ln 留哪一份：留 fixedLn（卷二 §3.3 级数法）还是留 ln（卷二十七 :620 要求的查表法），须读卷二 §3.3 与卷二十七 §4.5 两处才能定；本卡只读了卷二十七一侧，与公共部件审查-乙第六节 G14 同待李白裁定。

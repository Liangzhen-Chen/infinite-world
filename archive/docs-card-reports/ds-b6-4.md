# ds-b6-4 回报：块 6 第 6-4 张《物种与身体图表》

写：Claude Opus 中档（会话内子代理），三轮。第一轮被 body_ 前缀与 body_plan 类名的门禁误判挡住；第二轮在 6-0、6-7 合入后续做并提交（cd253ad1c）；第三轮照 Opus 只核（docs/审查/6-4-Opus只核-1119.md，M1–M5）与李白 11-19 15:5x 三条改，合入 origin/master（含 1119k4）后写卷二、卷二十勘误 1119k5。

## 自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见“卷文出处”；表头每维度 source/owner 写卷节；未建登记每条写卷:行 |
| 2 | 没有按 id/名字/场景写特例 | 是 | body.mjs、species.mjs、kernel/validate/body-tables.mjs 无物种、身体图、部位、组织、能力代号；身体图表 kind 取物种表 bodyPlan 的 ref；year si 从规则表键派生 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | body.test.mjs：空部位表、limitedBy 为 null/缺（未登记即拒、登了应删）、完好度恰等于阈值、阈值登 unbuilt 即未知；未建族/表/单位：未登记报错、已建仍登应删、前缀冲突、不免必填（未登 columns 照报 E-DIM-REQUIRED-MISSING）；yearDays num 为 0 即拒；species.test.mjs：maturityYears 0、未登记派生除零照抛 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷四 §4.2.5 公式手算；year si 断言按 astro.json 现值公式计算，不抄数；前提在 tests/kernel/body-world.mjs 临时世界里造 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 链深 8 登 kernelConstants；resolveRuleSi 改用解构与 den÷(num×si) 写法，是为了不在内核里写数值字面量（卷二 S10），算式本身没变；门禁检测器一行未改 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮 `git diff --cached --shortstat`：27 files，+5832/−122，其中两份勘误前快照约 5400 行；对 origin/master 共 38 files，+7536/−91；卡文外的文件见“偏离” |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 883 / pass 883 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 物种、身体图表头写全（53 + 6 维度，能力 12 项），`body.*` 在真实世界可求值，6-5 谓词有了读数；缺的一律机读登未建，没编数也没省维度 |

## 本轮改了什么（对照只核与 15:5x）

- **M1（勘误与收窄）**：families 只放行表头引用闭合，去掉了“引用未建族即免必填”这条自动放行；行上缺值改为逐（表，维度）登在 columns（物种 14 条）。新增 kinds（未建实体表：culture、status）和 units（未建单位：sense_arrival、effect_param）两个段。fields 管的是词表族条目字段，与 columns 对象不同，保留。四段都写进卷二 §1.12 勘误 1119k5。补了“引用未建族、表、单位但未登 columns 的必填缺值照报”测试。
- **M2 / 15:5x ③（year）**：`_units.json` 的 year、per_year 不再写 si，改写 `siFromRule: {key: "rules.astro.yearDays", unit: "day", invert}`，由加载器派生（`kernel/load/vocab-load.mjs#resolveRuleSi`）。6-29 改 astro.yearDays 后自动跟上。规则目录没登记 astro 时不给 si，与 world.mjs 对终止去留表的口径一致。卷二 §1.4 与卷二十 §3.4 T-3(d) 说明同号勘误，T-3 规则本身不动。
- **M3**：speciesView 只把登记在案的未建派生按未知交出，其余 E-MOD-RX 照抛。判定抽成 kernelApi `kernel/dimensions.mjs#readsUnbuilt`，place.mjs 改为共用 `dependsOnUnbuilt`，不再各存一份。补了“未登记派生除零照抛”的反例测试。
- **M4**：物种表补上 sourceStrength、specialAttacks、coverDim、containNeed、shiftStatus、sxCulture 六个维度。
  - coverDim 写 `ref dim place`：存量单元就是挂 comp_tract 的地点行（卷五 :219）。
  - containNeed 写 `ref vocab requirement`：需求块是 requirement 族条目（卷二 §1.13），该族登为未建族。
  - 其余四个按新体例登记未建。
- **M5（K6-103）**：新建 `rules.life`，stages 的列定义写进 registry 的 type（stage、relMaturityMin、relAgeMin、foodFactor、sleepFactor、modifiers），值登在 `unbuilt: ["stages"]`。卷四 :654 的数值是示例，旧世界没有阶段表。外貌轴（trait）的列定义已在 body-tables 的条目字段核对里；trait 条目卷文与旧数据都没有，交 6-23 与内容管线。
- **15:5x ①**：cap_flying 照登，body_plan 能力段 12 项，卷二 §3.6 同号勘误补 flying。
- **15:5x ②**：查了 snapshot-20261010，旧数据里没有能力间依赖，也没有部位完好度阈值。按裁定处理：12 条能力 limitedBy 写 `{}`，lostBelow 取 0，basis 都写“李白 11-19 15:5x 裁定②、待试玩调”。fields 里的 capability.limitedBy 登记随之删除（再登会报应删，已有测试）。
- **建议项**：S1 照做（没有部位贡献的能力，在 eff 未知时仍给确知的 0）；S7 单位个数已更正；S2、S3、S4、S6 未做，记在“未决”。

## 卷文出处（摘句）

- 卷四 §4.11.3 C-1 :1020“① 结构基值 ② 部位折算项 ③ 能力依赖项 ④ 登记的修正项 ⑤ 管线钳位”；§4.2.2 :530“bodyView……全书唯一能给出 body.* 的地方”；B-3 :536 至 B-5a :539
- 卷四 §2.2 :202 身体图不变量；§2.4 :283“两项每条必写”；§2.5 :304 lostBelow、:306 rules.life.stages；E-LIFE-STAGES :374；:1560 cap_flying
- 卷二 §1.4 :174 单位首批；§1.12 :390–:392 未建登记体例；§3.6 :1430 能力段；卷二十 :211 yearDays、:467 T-3

## 自定裁定

1. bodyView、speciesView 放在规则层（卷四 §5.3 :1185）。合成项走 kernelApi `modifiedWith`，数值用定点算。
2. 未写 precision 的 number 维度取 4。body_plan behaviors 取 carry、die、move（B-8、§4.6）。capabilities 段每项照内核表头格式补了 `required: never`、`onUnknown: error`（卷二 :1430 原句没有这两项，只核建议 S5）。
3. 链深按“根到该部位经过的部位数（根算 1）≤ 8”计。映射照卷二 §1.6 第 4 项覆盖全族，卷四说的“键集”按非 null 键比。
4. year 单位：加载期由 `rules.astro.yearDays` 派生 si（`siFromRule` 写法）。规则目录没登 astro 时不给 si，用到 si 的地方读到即拒。
5. 单位随键变化的两个量登成未建单位：`sense_arrival` 用于 sourceStrength（卷五 §4.2 规则 7），`effect_param` 用于 specialAttacks.params（卷二 §3.9）。
6. containNeed 取 ref vocab requirement（卷二 §1.13“需求块即 requirement 族条目”）。
7. fields 只认本卷七族；别族登记报 E-DIM-REF-MISSING。

## 偏离

1. 卡文没列、但改了的文件（都是本卡必需的接点，或主会话、李白点名的）：
   - 内核：dimensions.mjs、vocab.mjs、place.mjs、load/vocab-load.mjs、validate/types.mjs、validate/dimensions-validate.mjs、validate/body-tables.mjs（新）、files.json
   - 世界数据：`_units.json`、`_unbuilt-derived.json`
   - 规则表：registry.json、tables/body.json（新）、tables/life.json（新）、kernel-constants.json
   - 测试：tests/kernel/material.test.mjs、tests/kernel/body-world.mjs、tests/accept/detectors.test.mjs
   - 卷文：卷二、卷二十的勘误与快照
2. tests/accept/detectors.test.mjs:637 的期望列表补了 `kernelConstants.bodyPartChainMaxDepth`（只有校验器读）与 `life.stages`（读者 life.mjs、person.mjs 在 6-6 才建）。
3. criteria.json 经 register.mjs 重盖。本轮多次改动内核闭包，12 个类别在本卡里累计 rev 加了 4 次，每次都有修订记录。

## 未决

- 建议 S2（modifiedWith 与 evaluate 收集修正项的代码重复）、S3（capabilities 段的命名空间防重）、S4（meanDailyFoodNeed 的未建登记）、S6（bodyView 不带 clock）未做，可由 6-5 一并处理。
- PLAN 由主会话记：能力间依赖还没建（limitedBy 暂写 {}）；lostBelow 取 0 待试玩调。
- docs/问题.md 未写：trait 条目缺、阶段表缺值。

## 命令与末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → ℹ tests 883 / ℹ pass 883 / ℹ fail 0
- `node tools/accept/run.mjs pre_commit` → "verdict": "pass"（A12-4.5、S12-2、S12-3 在 origin/master 上同样不过，不在必过集合）

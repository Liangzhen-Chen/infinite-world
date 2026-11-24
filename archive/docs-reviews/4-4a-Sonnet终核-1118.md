# 4-4a 终核（Sonnet 5.5 中档，只读）

范围：`git diff origin/master...ds/44a`（HEAD a6120ec1）。照的卷：卷二《维度表规范与统一入口》§1.10 :320–:328、§3.3 :1328–:1341、§2.7 :601–:603；卷二十七 R27-5.2（:569）；北极星 docs/产品原则.md。已读 DS 只核（docs/审查/4-4a-DS只核-1118.md），表值误差推理未重做。

## 结论：可封（带一条给主会话的待确认项，不挡封）

## 逐项

1. **与卷文逐步一致**
   - fixedExp（det-math.mjs fixedExp）：k = floorDiv(x, 10⁸)，负数向下取整正确（:1332 "k=floor(x)"）；r∈[0,10⁸)；m、rem 整数；插值 f1−f0≥0，向零截断；±40 边界含端点，越界抛 E-DET-DOMAIN，不钳位。与 §1.10 :325 一致。
   - fixedPow：高位到低位、每次 fixedMultiply8、次序固定（:1333）；底数负、指数非整/负拒收。
   - fixedLn：第 2 步 n 的求法我手推了 a<W 分支：k=rbits+1 恒满足 a·2ᵏ≥W，k=rbits 仅当 W 能被 a 整除且 r 为 2 的幂时刚好等于 W，代码的 exact && powerOfTwo 判据正确；a≥W 分支 bitLength(a/W)−1 正确。第 3–6 步与 :1337–:1340 一致，末步 `l / up` 为 BigInt 除法，向零截断（:1340 要求的方向，负数不向下取整）。定义域上端取表中 expInt[40]（:1334），x≤0 或越上端抛错，不钳位。
   - normal（sample.mjs normalZ）：j=u>>52（52 由 64 与表长位数派生）、f=低 52 位，z=z_j+((z_{j+1}−z_j)·f)>>shift。BigInt `>>` 对负数是向下取整，但分位数表单调不减，差非负，故等同向零截断，无偏差。j+1≤4096 不越界。mean+sd·z 用 mul（BigInt 除，向零）。
   - lognormal：lin=mu+sigma·z（10⁴）→升到 10⁸→fixedExp→÷SCALE 降回 10⁴（截断）→clampAndTrunc。次序为"降到 10⁴ → 按 precision 向零截断 → clamp"，与 :327 一致（clampAndTrunc 先 truncateTo 后 clamp）。lin 超 ±40 时由 fixedExp 报错，不钳进定义域。
2. **第二份实现/浮点/特判**：kernel 内无 Math.exp/log/pow（grep 证）；sample 的 exp 只经 fixedExp；无按维度、id 特判。Math.log/Math.sqrt 只出现在离线生成器 tools/gen-det-tables.mjs 的 Acklam 牛顿初值里，终值全由 BigInt 迭代并用高精度 Φ 复核截断区间，属离线工具，不入运行期，可接受。fixedLn 的 W、升标度、项数 20、LN2 全走 kernel-constants.json 登记（world/rules/tables/kernel-constants.json、registry.json 的 type/domain/packOverridable 同步），代码读 engine.rules，缺键拒（world.mjs need/needDigits）。kernelApi 三行已补（state-owners.json，acceptsState:false）。
3. **测试先行与期望值**：提交序 5e1969f5（测试）早于 30b4f494（实现）。期望值为手算字面量（fixedExp(1)=271828182、fixedPow(2e8,10)=102400000000、fixedLn(1)=0、ln10≈230258509），容差在文件头按卷文误差界（<2×10⁻⁸ + fixedExp 截断 0.31 单位）推出 |d|≤2，不是读基线抄数。无放宽断言、无为测试造设施。**弱点（不挡封）**：normal/lognormal 采样只测确定性、精度、clamp，没有对某一固定种子手算期望值；插值的正确性靠表值与 `--check` 守。建议后续卡补一条固定种子的字面量断言。
4. **criteria.json**：改动是各类别 history 追加 ref+rev+1、print 重盖，格式与既往条目一致，是登记器产物，未见手改的口径变化（"判定口径不变"）。我没有重跑登记器核对指纹。

## 我跑的命令与末行
- `node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`
- `node --test tests/kernel/det-math-exp.test.mjs tests/accept/det-tables.test.mjs` → pass 15 / fail 0
- `node --test "tests/kernel/*.test.mjs"` → tests 397 / pass 397 / fail 0
- `node --test "tests/accept/*.test.mjs"` → tests 135 / pass 135 / fail 0

## 待主会话确认（不是本卡的必须改）
`node tools/accept/run.mjs pre_commit` 在本分支输出 items fail 3：vol12.A12-4.5（E-ACC-PARAM-UNCONSUMED）、vol12.S12-2（E-ACC-REGISTRY-WRITE）、vol12.S12-3（E-ACC-ITEM-COUNT/ORPHAN/UNREGISTERED），openHits 为 param_consumed 3、registry_write 3、item_ledger 69。输出里没有 fixedLn/LN2 相关命中。我没能在 master 上跑同一命令做对照（跨目录运行被拦），所以**无法证明这 3 项是 master 上已有的**。合入前请主会话在 master 基线跑一次同命令对比；若 master 上为 0，则本卡须查，我判此结论作废为"拿不准"。

## 主会话核对（11-18）
在 master（f4ccd9b3）上跑同一命令：verdict pass，failed 同为 vol12.A12-4.5、vol12.S12-2、vol12.S12-3 三项（非必过、合入前已有），不是本卡引入。结论"可封"成立。

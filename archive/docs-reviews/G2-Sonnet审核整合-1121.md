# G2《高度场与区格派生》Sonnet 审核整合（2026-11-21）

审核人 Claude Sonnet 5.5 中档；被审提交 8c7a8446f（DeepSeek v4-pro）。依据：卷五 §4.3 规则 8–9、§4.1 规则 15、:271、:425；卷二十七 R27-5.9、R27-8.1/8.4、A27-5.6；卷二 1121k1。

## 审出并已改

1. 【已改，真缺陷】控制面权重取整为 0 即除零。原实现权 = SCALE⁴ ÷ d²（d² 为定点米平方），控制点距列 ≥ 10⁵ m 量级时全部权取整为 0，`num / den` 抛 RangeError；九省尺度的世界必然碰到。改为通分：w_i = Π_{j≠i} d_j²（整数精确，无标度），仍是 1/d² 加权平均、除法向零截断一次（server-plugin/kernel/grid.mjs `controlSurfaceAt`）。新增测试 grid.test.mjs 三条：权之比手算 120（原只测等权，权方向写反也过）、十万米远点等权手算 150、octaves 过大报错。
2. 【已改，绕过口子】起伏噪声格点哈希经 `SEED` 常量对象调 `gridSeedKeyText`，流/抽取点代号不是调用处字面量，seed_sites 检测器识别不到，该抽取点未登记也不报（R27-8.1 要求每个种子抽取点登记）。改为 `gridSeed('grid','relief',…)` 字面量调用并在 seed-keys.json 登第二行 role_seed（grid/relief，前缀 relief_）；删 `SEED` 对象、删无用的 SCALE2/SCALE4。grid.mjs reliefKey、world/rules/tables/seed-keys.json:13–20。
3. 【已改】`reliefAt` 的格距 `regionCellM×SCALE ÷ 2^k` 在 reliefOctaves 过大时降到 0，除零。加 `spacing === 0n` 报 `FixedError('E-DET-DOMAIN')`，不静默跳过（grid.mjs reliefAt 循环首）。

## 核过、保留

- 高度场式子：控制面（最近 heightCtrlK、并列 id 序、恰在点上取该点值、整数向零截断）、起伏（reliefM 振幅、reliefRough 逐级衰减、格距 regionCellM÷2^k、hash(世界种子,w,格点,k)→[−1,1]、双线性）、截断 [−12000,9000]、层号 floor(h÷storeyM) 均与卷五规则 8 一致；只用 det-math 与 BigInt，无 Math.*，vol5.S5-10、A27-8.1 仍 pass。
- `TWO64` 由十六进制字串拼出：与 sample.mjs 既有写法一致（该文件同样的两行），不是新造假常量；各无量纲系数只在 grid.json。
- 区格种子键 `hash(世界种子,w,x,y)` 不含版本；`gridSeedKeyText` 加在 keys.mjs（卷二 §2.8 :852）；12 类判据 rev+1、补同号修订记录，做法同 register.mjs 先例（criteria.json 各类别末条）。
- 偏离 4（item-revisions 计数 49→50 等）：新增 A27-5.6 登记行后的必然行为，G1 同做法，保留。
- 确定性测试：反向遍历确是不同次序；纯函数无缓存，"清缓存"一项无从测，缓存出现时（G6）再补。
- 偏离 3（grid.json 只登 6 键）：A12-4.5 param_consumed 要求每个登记参数有运行期读者，合理；其余键（cellM、chunkRegionCells、landSearchRadiusCells、roadPaceFactor、bubbleCostCap、longCostCap、farSight*）须随其消费卡（G3/G4/G6）登，已在 registry.json volume 栏写明。surfaceElevationMinM/MaxM 取 §4.1.1 :425 有出处。
- cellclass/cellmark 空族：与 dockind/emphasis/fault 等空开放族同一先例，不影响加载；条目字段尚无 schema，`cellClassOf` 直读 terrains/waterAny/slopeRange/onRoad/inSettlement/priority，字段登记归 cellclass 内容卡。

## 偏离判定

- 偏离 1（E-GRID-CELL-NO-TERRAIN 未登 error-codes.mjs）：保留。卷二 1121k1 已定名，但同批六码、含既有 E-GRID-OFFSCREEN-WRITE，error-codes.mjs 全无；本卡无任何代码抛该码（cellClassOf 返回 null 由调用方处理），error-codes.mjs 在 12 类检测器闭包内、登码会再牵动全部指纹。该码与"每个区格有 cellclass 成立、给全兜底条目"的加载校验须同卡落（cellclass 内容卡或 G3 足迹卡），**须记入那张卡的验收**；cellClassOf 现返回 null 的约定即"调用方报该码"。
- 偏离 2（terrain.reliefM/reliefRough 暂定值）：卷五 :243 只定字段与类型，无数值；DeepSeek 取 mountain 200、hill 20、水面 0、rough 全 0.5，无推算依据，均标"暂定·待试玩标定"，保留，**须李白/试玩标定**（reliefRough 全取 0.5 也未体现地形差异）。
- 偏离 5（核时发现，非 DS 自报）：seed_sites 检测器（tools/accept/detectors/seed_sites.mjs callSites）把紧跟 `return` 的调用当声明跳过，`return gridSeed('grid','x',…)` 漏识别。本卡以"先赋值再返回"规避并注明，检测器本身未动（不在卡范围）。**须 Opus 核**：是否修检测器（属门禁判据，改了要按 R12-14.3 重盖指纹）。

## 须 Opus 核

- 控制面通分写法与卷五"平方反比加权平均、除法向零截断"的逐位口径是否算同一定义（DS 原写法在近距下与通分结果可差最后一位定点，因截断点不同）；卷文未规定中间标度，本卡按"只在最后一步截断"取，请核可。
- 上述偏离 5 的检测器处置。
- 种子键 prefix 字段对 relief 行的含义（role_seed 要求非空前缀，relief 只是连续噪声、不派生 id，取 relief_ 仅为满足 R27-8.4）。

## 修改轮（Opus 只核 docs/审查/G2-Opus只核-1121.md 判不过，五处必须改，均已改）

1. 【已改】空控制点集：grid.mjs controlSurfaceAt 开头原返回 0n（自补海平面缺省），改抛 `FixedError('E-DET-DOMAIN')`；grid.test.mjs 加"没有控制点时拒收"一条。
2. 【已改】并列测试：原测试查询点恰在 a 上，走"恰在点上"分支，并列裁决未执行。改 heightCtrlK=1、a(−50,0)/b(50,0) 等距不等高，查 (0,0)，断言取 id 小的 a（100），输入次序反转同值。
3. 【已改】seed-keys.json relief 行 prefix 由 relief_ 改 grid_（卷二十七 :797 前缀即流代号；(grid,cell)、(grid,relief) 两两不同，R27-8.4 不冲突）；无其他引用处。
4. 【已改】_vocab.json terrain 族 reliefM 重取并逐条写推算：相邻区格中心高差上界 = 2×Σ_{k<4}reliefRough^k × reliefM = 3.75×reliefM，坡度 = 高差÷regionCellM 截 [0,1]，故 reliefM = s×100÷3.75（s 为目标最大邻区格坡度，向下取一位小数）：plain s=0.02→0.5、marsh 0.01→0.2、coast 0.03→0.8、forest 0.05→1.3、desert 0.08→2、cave 0.10→2.6、hill 0.20→5.3、mountain 0.50→13.3，水面 0；reliefRough 统一 0.5（1/f 分形逐级减半的通用取法）。山地不再顶到坡度 1；仍标"暂定·待试玩标定"。顺带按复核建议把起伏幅度界测试收紧为 reliefM×1.875 = 9.375（93750 定点）。
5. 【已改】docs/问题.md 记账：seed_sites return 漏识别（归 A27-8.1.b 门禁卡）、E-GRID-CELL-NO-TERRAIN 随内容卡/G3 同卡落、waterAny 空集含义待卷五澄清；另记空控制点集、G6 性能、:797 前缀写法与 §2.3 键表补列。

三点判定（Opus）：通分权过；先赋值再返回可接受；relief_ 须改（即 3）。改完须再复核一次才封。

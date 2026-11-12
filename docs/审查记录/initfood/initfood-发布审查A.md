# INITFOOD 发布审查 A（第二位独立审查，只读）

对象：F:/dnd-wt/INITFOOD，提交 daef0280。结论：**approve**，无阻断。

## 1. 读者是否都能拿到值
全仓库按 publicStock、initialFood、openingFood、openingStockFood 搜索（排除 docs、world/drafts）。
- 运行时只有一处读登记的 publicStock.food：server-plugin/settlement-profile.mjs 的 withOpeningFood。登记里没有 food，且有农事 profile 和 openingDay 时，用 openingStockFood(engine, farmProfile, openingDay) 推导。下游文本构造（公共仓期初库存）和本地事务摘要都读这个已补值的 economy.publicStock，不会拿到 undefined。
- openingStockFood 只读世界定义：settlementProfiles 登记人口、profile.granaryCapacity、profile.initialSeed，不读存档状态。缺登记行时人口按 0，返回 0，不抛错。
- 开局初始化走另一条：agriculture-migration.initializeAgriculture 用 openingFood（farmTargetFood），与上一条同一规律，不读 publicStock。
- 设计源 w1-village-profiles.mjs:164 产出的 publicStock 本来就不含 food，:184 的校验只核 seed、treasuryCopper、closing。schema 的 publicStock 已删 food（additionalProperties:false），与数据一致。
- 其余命中都是测试（catalog:91、village-ledgers:43-47、settlement-mouths、settlement-schema、initfood-revision）和审计工具，期望均按规律推出。tests/fixtures/legacy-r2-primitives.json 是旧存档夹具，不与 settlements.json 对照。
- 没有读者仍期待登记值。

## 2. 推导值手算
规律：min(ceil(餐口 × (距收获 + reserveDays)), 仓容 − 种粮)。
- 开局日 0：距收获 = sowDays[1] + growthDays = 25 + 180 = 205 天，加 reserveDays 90，目标日数 295。
- 榆坡：人口 80、餐口 80，80 × 295 = 23600。仓容 50000 − 种粮 2160 = 47840，取小为 23600，与回报一致。
- 尉亭：100 × 295 = 29500，仓容 50000 − 1920，取 29500。
- 柳泉（砾泉）：96 × 295 = 28320，仓容 50000 − 2520，取 28320。
- 桑畔：110 × 295 = 32450，仓容 50000 − 2880，取 32450。
- 人口与 rules.json 农事表的 opening.population（80、100、96、110）一致，所以展示的期初库存与运行时 state.settlements 的开局粮相同。
- 四个村都没被仓容封顶。

## 3. 回执与计数
- publication.json 共 4 条，每条取代 2 个回执：village-ledgers/<村>.json 和 candidate.json。共 8 条取代声明，字段路径 economy.publicStock.food，after 为删除标记。
- approvedProfiles 通过 revertReceiptRow 与 applySupersedes 处理，指纹比对和当前有效内容两边自洽。
- classifySupersedes 的计数只有 tests/initfood-revision.test.mjs 用，pattern 是 w1/village-ledgers。该测试用同一函数推出：removed 8、changed 0，现存 = 回执文件数 − 被移除的不同回执文件数。其他用 classifySupersedes 的测试（a3-world-approval、water1d）的 pattern 是各自的批次目录，不会匹配 w1/village-ledgers，计数不受影响。
- 小问题（不阻断）：pattern 会把 candidate.json 也当成一个条目 id 记 4 次。这里删的是字段，不是整行，现存回执行数并没有减少；测试本身自洽，但"现存行数 0"的说法只是测试里的推导量，不要被其他读者拿去当真实行数。

## 4. settlements.json 只删了 4 个键吗
是。diff 只有 4 行删除（food 18000、22000、22000、25000），其余 publicStock 键（openingDay、seed、treasuryCopper、wood、iron、source、closing、closingReason）不变。文件里共 5 个 publicStock，第 5 个是白石镇的 null，原样。现在没有任何 publicStock 还带 food。

## 备注
本次只读审查，没有运行任何测试；"测试通过"以提交说明和测试的静态推导为据，云上全量时请确认 settlement-mouths、initfood-revision、village-ledgers、catalog 四个文件通过。

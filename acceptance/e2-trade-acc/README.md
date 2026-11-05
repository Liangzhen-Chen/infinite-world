# 卡 E2 跨聚落贩运与商人套利：独立验收包

验收方不读 `server-plugin/` 的规律实现。驱动只经引擎公开入口：
- `WorldEngine.createCharacter` 开新档；
- `reduce` 跑工具面的 `world_time`（推进）、`world_act`（移动、买、采、做）、`world_trade`（带 `instances` 的买卖）；
- `applyPatches` 落盘。

观察只读存档的 `state`（`settlements`、`npcs`、`inventory`、`itemInstances`、`records`）和 `ledger`。另用三样只读工具，测试里也这样用：
- 区域价投影 `settlement-trade.mjs` 的 `regionalTradePrice`（没有时退回 `regionalTradeBase`），读"该物在该聚落的现价"；
- 守恒：`ledger.auditLedger`、`tests/helpers/ledger-audit.mjs` 的 `conservation`。

仓库用环境变量 `ACC_REPO` 指定，默认 `F:/dnd-wt/INT`（t-int@8de2790a）。被测树是 `F:/dnd-wt/E2TR`。不改仓库，不调用真实模型，不读 secrets.json。

## 命令

```
# 本机冒烟（基线；价格样本每类 1 种，约 8 分钟）
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/e2-trade-acc/acceptance.mjs --days 3 --price-per-cat 1 --rebuild
# 交付后本机冒烟
ACC_REPO=F:/dnd-wt/E2TR TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/e2-trade-acc/acceptance.mjs --days 3 --price-per-cat 1 --rebuild
```

**30 天正式跑（交李白，Linux）**：拷整个目录，不带 `mut/`。

```
ACC_REPO=/path/to/infinite-world node e2-trade-acc/acceptance.mjs --days 30 --rebuild
```

- 参数：`--days N`（默认 30）、`--trials K`（第 5 条每种物品做几件残次件，默认 2）、`--rebuild`（重建 `mut/`；换树前必须加）、`--no-mut`（不跑第 4、7 条，判 skipped）、`--price-per-cat N`（价格样本每类几种，默认 2）、`--price-every D`（每几天读一次价格快照，默认 5）。
- 预计耗时：浸泡每游戏日约 7–8 秒（本机）；读区域价是大头，引擎每次约 1 秒。默认样本约 14 类 × 2 种 + 至多 10 种跨聚落成交物，× 6 个聚落 ≈ 4 分钟一次快照；30 天 7 次快照。主线、路线变异各一局 ≈ 2 × 30 分钟，新物变异一局 ≈ 4 分钟，第 5 条 ≈ 1 分钟。合计约 70 分钟，留 1.5 小时。
- 输出 `acceptance.json`（`ACC_TAG=x` 时为 `acceptance-x.json`），全部 pass 时退出码 0。

| 文件 | 作用 |
|---|---|
| lib.mjs | 开树、调用、地理（位置→聚落、聚落间路线图、carry 职业）、账本差分、统计容差 |
| soak.mjs | 浸泡观察：每天 05:59/11:59/17:59/23:59 观察；成交、在途账户、带聚落间路线的记录、产出者、存货、价格快照 |
| analyze.mjs | 从观察推出跨聚落交付（A/B/C 三种形态）与证据、物品类别、价差 |
| defect.mjs | 第 5 条：外行做残次件、买标准件、分叉买卖比价 |
| mutate.mjs | 变异副本 `mut/route`、`mut/item`，只改数据 |
| acceptance.mjs | 断言与汇总 |
| expected.json | 卡 E2 交付后应为 pass 的 15 条断言 |

## 量具

**聚落**：引擎实际模拟的聚落（存档 `state.settlements`，基线 6 个）。人按户籍（residents.settlement）→ 住处 → 位置归聚落；家户按户籍；野外采集点（带 `site`）的储量不算聚落存货。
**聚落间路线**：两端分属不同聚落的路线（端点是聚落，或是聚落下的非采集点位置）。
**跨聚落交付**三种形态（不靠任何记录格式名单）：
- A：一笔 `market_trade` 的买卖双方分属两个聚落；
- B：同一 NPC 在甲聚落买进、之后在乙聚落卖出同一物（贩运），终点买方就是进到货的持货人；
- C：在途账户（账户持有人是一条带聚落间路线的记录），接货方 → 交货方。

**每笔的证据**（第 2b 条）：
- 卖方：真实持有人，当步该物没有 `src:import`；
- 承运人：一个 NPC。A 取买方或卖方、B 取贩运者本人，要有一条点名他的记录；C 取记录里承运字段（carrier、porter、actor、escort、workers…）点名的 NPC。只写"2 个工人"不算；
- 路线：那条记录里的聚落间路线把起点、终点两个聚落都连上；
- 用时：记录里的时间戳跨度或显式用时 > 0，时间落在成交前后一天内。

**本地进不到货**：成交前一步，买方所在聚落里买卖双方以外的人存货合计少于这笔数量。
**carry 职业**：本人 `professions` 里有 `labor` 含 carry 的职业（基线：商人 profession_life_12），或职业描述命中它的名字、别名（搬运、搬料工…）。
**物品类别**：`item-use-tags.json` 的用途类别（grain、food、medicine、fuel、salt、timber、apparel、durable，按此顺序取第一个），否则按材料性状（皮毛、金属、布、陶石、纸书），其余 other。
**价格样本**：每类取开局人均存货在各聚落间最不均（变异系数最大）的 N 种，加窗口里出现跨聚落成交的物品（出现后才进样本，至多 10 种；它们没有第 0 天价格，不进起止比较）。路线变异局读主线同一批物品。

**统计容差**：
- 二项（方向判定）：k/n − 2.5·√(0.25/n) > 0.5（全数成立也要 n ≥ 7）；
- 配对差（第 4 条）：mean(d) > 2.5·sd(d)/√n。

## 断言

| 编号 | 现象 | 判定 |
|---|---|---|
| E2-1 | 区域价分化 | 价格取快照均值，存货取每日均值 ÷ 人口。每类把"同一物、两聚落、价差 >1%、人均存货不同"的对汇总，看人均存货多的那边是否更便宜；二项 2.5σ 成立的类别 ≥3 |
| E2-2a | 跨聚落进货出现 | 交付到持货人（人或家户）的 A/B/C 交付 ≥1 笔，物品、聚落对、卖方各 ≥2，其中本地进不到货的 ≥1 笔 |
| E2-2b | 每笔可追溯 | 上面每一笔都有卖方、承运人、路线、用时 |
| E2-2c | 主世界守恒 | 账本审计、逐资源守恒都为空（聚落粮仓之间的燕麦周贸易记作对照，不进 2a/2b） |
| E2-3a | 低买高卖 | B 形态里卖价高于进价、有行程记录的趟数 ≥1，物品、聚落对、贩运者各 ≥2 |
| E2-3b | 价差收窄 | 被贩运的（物品、聚落对），第 0 天与最后一天快照的价差（高价÷低价−1）比较，收窄数二项 2.5σ |
| E2-3c | 不限 carry | 有行程记录的贩运者里至少 1 位职业不含 carry |
| E2-4 | 路线远近与安危 | 主线 vs `mut/route`。对经过被调路线的、主线上被贩运或跨聚落进货过的（物品、聚落对），收窄比例 (起−止)/起 的配对差（主线 − 变异）通过 2.5σ；变异局账本守恒。不经过该路线的对作对照，只报告 |
| E2-5a | 残次件卖得低 | 同一时刻同一买家，玩家卖残次件（lostUses 非空或 grade<1）的单价低于卖标准件；≥2 种物品 |
| E2-5b | NPC 转卖残次件也低 | 残次件卖给持货人后，玩家点名买回它的单价，低于同一时刻向他（只持标准件时）买一件的单价；≥2 种物品 |
| E2-6 | 派生卖家 | 原来不卖货（没有 trade 服务、不是店主、没有 shopType）、向 ≥2 位不同买主（不含玩家）卖出、当步无凭空进货的卖家 ≥2 位，卖出物品 ≥2 种 |
| E2-7a–d | 分销通用 | `mut/item` 新物：a 有产出；b 运到产地外的聚落，且至少一笔可追溯；c 在产地外成交；d 无 src:import、无开局持有、账本守恒。没有产出时 a、b、c 判 blocked（缺上游 NPC 采集/生产覆盖新数据，K1/K3） |

单价取回执定价里未取整的单价（`pricing.unitPrice`），没有就取钱数差。

## 通用性变异（mutate.mjs，只改数据）

副本只复制 package.json、schemas、server-plugin、tests、tools、world、extension、prompt；node_modules 和 world/drafts（328 MB，只读）用 junction 连回被测树。选择全从数据推，先在被测树上开一局新档读 `state.settlements`。
- **mut/route**：在只连一条聚落间路线的聚落里，挑开局居民持有物品种类最多的那个，把它那条路线的 `lengthKm` ×4、`risk` +2。基线上是 `route_bs_lq`（14.1→56.6 km，1→3），连 loc_bs 与 loc_bs_liquan。
- **mut/item**：新物岭背酸枣 `item_acc_e2_ridge_jujube`。样板是采集点上长、带 food 标签、不是饮水、盐、矿物或谷物、没有配方产出的物品中目录价最低的（基线 item_hazelnut），新 id、新名字，价 ×1.5，保质期 ×0.6。只长在一个只与一个聚落相连的采集点上（选职业带 gather 的居民最多的聚落，同数再选人口最少的）：基线是 loc_wild_sb_barrow，产地 loc_bs_sangban。资源 40，每 2 天再生 4。没有配方产出它，开局没人持有。

## 基线冒烟（INT t-int@8de2790a，--days 3 --price-per-cat 1 --rebuild，380 秒）

见 `acceptance-baseline.json`、`baseline.log`。pass 4、fail 8、blocked 3，共 15 条。
- **pass**：E2-2c 主世界守恒；E2-5a、E2-5b（卡 Q 已让残次件按 grade 与手艺档折价：如苇笔残次件 0.32 对标准件 3.6）；E2-7d 新物无凭空来源。
- **fail**：
  - E2-1：13 种样本里 8 种在聚落间有价差，但每种只有一个聚落（白石镇）价格不同，每类 5 对，方向一半对一半错（燃料、粮、食物 0/5，金属、皮毛、陶石 5/5），每类都达不到 2.5σ；
  - E2-2a、E2-2b：3 天里没有一笔交付到持货人的跨聚落进货（成交都在同一聚落内）；
  - E2-3a、E2-3b、E2-3c：没有 NPC 跨聚落转卖；
  - E2-4：主线没有经过被调路线的贩运，无从比较；
  - E2-6：没有派生卖家（原来不卖货的人向 ≥2 位买主卖出）。
- **blocked**：E2-7a/b/c，3 天里没人采到新物岭背酸枣（NPC 采集不覆盖新数据，属上游 K1/K3）。
- 3 天里也没有任何带聚落间路线的记录（燕麦周贸易第 7 天才发车），所以对照组在本机冒烟里看不到。

## 拿不准的地方

1. **读价太慢**：`regionalTradePrice` 每次约 1 秒，只能读样本。被贩运的物品若不在样本里（又是开局后才进样本），就不进 3b、4 的起止比较。实现方若提供更便宜的只读批量价格投影，`lib.mjs` 的 `T.price` 换一行即可。
2. **承运证据只认点名 NPC 的记录**：交付若把承运人写在别的字段名下，`analyze.mjs` 的 `CARRIER_KEY` 要补一个名字；只写人数（如燕麦周贸易的 `workers: 2`）不算承运人。
3. **"需求"用人口代替**：E2-1 的方向按人均存货判，没有按每种物的专门需求（工具只有匠人要）。基线可能因此偏严。
4. **第 5 条在基线上已由卡 Q 成立**：卖方向与卡 Q 的 Q5 同口径；买方向（NPC 转卖）是 E2 新加的。标准件的买入在"残次件尚未卖给他"的同一时刻快照上做，因为不点名实例时引擎会先卖残次件。
5. **第 4 条样本**：只比主线上真被贩运过的（物品、聚落对），交付后若贩运不经过被调路线，会判 fail 并写明"无从比较"。

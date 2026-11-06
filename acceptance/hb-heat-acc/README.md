# 卡 HB 热工位绑定热源：独立验收包

验收方不读 `server-plugin/` 的规律实现。驱动只经引擎公开入口：`createCharacter` 开档；`reduce` 跑 `world_craft`、`world_time`、`world_promise`、`world_move`，以及 NPC 的 `npc_plan` 提案（与 tests/khb-heat 同一入口）；`applyPatches` 落盘。观察只读存档（`state`、`inventory`、`ledger`、`records`）和 `ledger.auditLedger`、`tests/helpers/ledger-audit.mjs` 的 `conservation`。

**前置夹具**：给物品、记配方、定技能是直接写存档（备料）；"能不能做、烧多少、等多久、谁能用"全走真实调用。

基线对比用 `F:/dnd-wt/INT`（t-int@5dbe7d5f，被测树 HEAT 是它加 HB 提交）。

## 断言（每条换物品、换工位、换人，不是只过一例）

| 编号 | 现象 | 怎么测 |
|---|---|---|
| HB1 | 冷炉没燃料，要火的配方被拒，时间与材料不动 | 从 `fixtures.json` 取锻炉、窑所承的工位类别；每类按"最短、最长、中位"等不同产物的配方，在勘察出的不同地点各做一次；包里塞满口粮、黏土、矿石（非燃料） |
| HB2 | 有燃料就做成：升温分钟进工期、烧掉配方用料之外的燃料、产物到手、账本守恒 | 每种 `fuel` 类别物品各一次（炭、刨花、火绒，换配方换地点轮换） |
| HB3 | 没燃料就熄 | 做成后过两天，清掉包里所有燃料，同一座炉再做必须被拒 |
| HB4 | 耗燃料随工期 | 同类别同地点同燃料，配方越长耗得越多；最长比最短长一倍以上时须严格更多 |
| HB5 | 人物同一条 | 经 `npc_plan` 让 5 个不同的人（不同物种）在冷炉做：无燃料被拒且行囊不动；有燃料开工，完工时刻比配方分钟长，燃料从自己行囊出 |
| HB5b | 精怪、兽类同样 | 抽样里必须含非人类 NPC，且它们也通过 HB5 |
| HB6 | NPC 自主去冷炉点火开工 | 每类选熟练度最高的两人，备料、工具、燃料，推进 `min(days,3)` 天：须出现他们做的热工位配方，且炉膛记录里有烧掉的燃料（依赖 E2 合入 npc-labor，合入前基线可能 fail） |
| HB7 | 木炭、铁、陶器产量对比基线 | 浸泡 N 天，取非开局、非进货、非漂移的真实产出；基线为 0 的须 >0；其余用泊松差标准分 `z=(新-基)/sqrt(新+基+1)`，须 `z≥-2.5`，不拍固定阈值 |
| HB7b | 浸泡全程能推进，审计与守恒为空 | `auditLedger` + `conservation` |
| HB8 | 通用性变异：新热工位类别自动有热源规律 | 在仓库副本 `mut/` 里加新设备类 `acc_smelter`、新工位类别 `acc_smelting`、新配方、两处新建筑，并在热源数据里只写一条属性；断言无燃料被拒、有炭则做成且含升温并烧燃料 |
| HB8b | 燃料按类别和热值 | 副本里加"同炭类、单件两倍重"的新燃料物：能烧，耗件数约为炭的一半（取整误差内） |
| HB8c | 不按名字、不按像 | 副本里加"像炭但没有燃料类别"的新物：点不着 |
| HB9 | 人物在新类别上同样守 | `npc_plan` 在新建筑上：无燃料被拒，有燃料开工 |
| HB10 | 私炉要许可 | 副本里给一户既有私宅加一座锻炉：无许可被拒且不动；经主人 `grant_access`（写明 `fixtures:['forge']`）后做成，账本守恒 |

状态：`pass` / `fail` / `blocked`（前提造不出来，写明卡在哪里）。`expected.json` 列出交付后应为 pass 的断言。

## 运行（本机不跑，只在云上）

```
# 1. 基线产量（基线树，仅一次；N 与下一步一致）
EXTRA=F:/dnd-tmp/hb-heat-acc sh F:/dnd-tools/cloud/rt.sh ali F:/dnd-wt/INT hbacc-base cmd \
  'ACC_REPO=$PWD ACC_TAG=base node .extra/hb-heat-acc/acceptance.mjs --days 30 --yield-only'
sh F:/dnd-tools/cloud/rt.sh ali - hbacc-base fetch /work/hbacc-base/.extra/hb-heat-acc/yield-30d-base.json F:/dnd-tmp/hb-heat-acc/yield-30d-base.json
# 2. 被测树完整验收（冒烟 --days 3；正式 --days 30）
EXTRA=F:/dnd-tmp/hb-heat-acc sh F:/dnd-tools/cloud/rt.sh ali F:/dnd-wt/HEAT hbacc-main cmd \
  'ACC_REPO=$PWD ACC_TAG=new node .extra/hb-heat-acc/acceptance.mjs --days 30 --rebuild'
sh F:/dnd-tools/cloud/rt.sh ali - hbacc-main fetch /work/hbacc-main/.extra/hb-heat-acc/acceptance-new.json F:/dnd-tmp/hb-heat-acc/acceptance-new.json
```

第 2 步需要 `yield-30d-base.json` 在 `hb-heat-acc/` 目录里（EXTRA 会一并送上去），或用 `--baseline <文件>` 指定。可选：`--trials K` 每类热工位抽几个组合（默认 3）；`--no-mut` 跳过变异；`--rebuild` 重建变异副本。

预计耗时：勘察每类约 458 次只读试探，HB1–HB5 各十几次开档，合计 3–6 分钟；每个游戏日约 10–15 秒，所以两次 30 天浸泡（基线一次，被测树一次，被测树另有 HB6 的 3 天）各约 5–8 分钟，总计留 30 分钟。

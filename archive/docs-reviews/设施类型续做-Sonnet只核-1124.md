# 设施类型续做 Sonnet 只核（一轮，抽核加全量）

核者：Claude Sonnet 5.5 中档。分支 ds/building-types-2（HEAD b13d8ecc6），对 origin/master 的 diff。依据：docs/审查/李白裁定-1117.md:1655（S6-2）、:1659（S6-6）；卡头一至三节已读。H-5 在该文件里按“H-5”“取③”“1122-1125”都搜不到原文，19 栋改挂一项只能对照 docs/问题.md:877 与写者回报核，未能对裁定原句。

## 结论：过；必须改 1 条（第 5 项），其余为建议

1. 70 栋去向：过。去向照 S6-2：住区 16 归私宅；镇巡值房、街议厅、验秤房、议事处六处归官署；带铁工共炉归铁匠铺；新登交易点、露天场地、共用灶房三类，都在 facility_type.json，列同已有行。抽核 5 栋回 locations.json 行号（bld_bs_watch、bld_bs_boat、site_ms_ll_forge、site_ms_td_trapcache、bld_yp_yard），旧用途原句与行号一致。“最近归”14 栋（船户会屋、行会、4 处院、3 处储物、菌床洞、通风井、矿口、城墙、城门）问题.md:837-843 和各行 intendedBasis 都写了理由并标待核。小提醒：船户会屋、行会联络处 11-23 清单原在“贸易类”，现归官署是“最近归”，已标待李白核，可接受。
2. 露天形制：可接受为暂定。walled、roofed、deck 全假合卷十九 :337、:346 “walled 假的建筑（桥、露天场）”；defaultMaterials 取 river_house 同组仅为过必填与物性校验，围护体积为 0，building-types.test 已手算验证体积三角色为 0、加载通过，defaultMaterialsBasis 和问题.md:846 都明说是占位。更干净的写法是卷文允许“无墙无顶形制不填 defaultMaterials”，须改卷文，已列待李白，不是本卡该做的；现状没有产生假用料质量，不打回。
3. 19 栋改挂：过。规则按“旧父在建筑源集合里”认（convert-geo-g5b.mjs 新增段），沿旧父链上提到第一个非建筑行，不按 id；原父写 originSite，校验器代码未动（无放宽）；测试把 19 栋 [私宅, 原住区, 营地] 手列字面量逐栋核。回退（b09f613c2，空提交，数据从未提交）与改挂（b13d8ecc6）分两笔。提醒：真实 place.json 没有重新入库（写者已说明，缺口二），所以改挂目前只在转换脚本里生效，入库世界仍是旧层级；这不是本卡可解，但状态文档里须写清。
4. geo-g5b-data 那条断言：正当跟改。非建筑行的 originSite 数仍恰等于子站点清单（未放宽），建筑行的 originSite 另核为指向建筑行；19 栋本身由 building-types 测试逐栋守。
5. 新测试：前几条真守（类型表同列、每栋有类型、形制都能挑到、露天形制 36 m2 手算 6×6 与体积 0、19 栋字面量），不抄基线读数。必须改：“19 栋落了位”那条整段补缺实测 144 秒，在 tests/kernel/ 常规全量里本机跑，违反卷二十七与 AGENTS“几秒内才本机跑、长测上腾讯云”。处理：移出常规本机测试（挪到腾讯云块验收清单，或加环境开关默认跳过并写进块验收命令），断言内容保留；“逐栋改挂”一条已足够做本机守卫。
6. 写者关于 world.mjs 的说法：属实。world/../load/world.mjs :163 是 checkPlaceTable，:190 才是 installNamedStructs，先后顺序与回报一致；该缺口的后果（struct:pos 未装）我未实跑复现，按行号顺序判定。

## 命令
- node --test tests/kernel/building-types.test.mjs：tests 8 pass 8 fail 0（含 144 秒那条）。
- node tools/accept/run.mjs pre_commit（不带 --write）：verdict pass；失败三项仅 vol12.A12-4.5、S12-2、S12-3 基线。
- 全量 node --test 未重跑，沿用写者的 2074 pass 记录。

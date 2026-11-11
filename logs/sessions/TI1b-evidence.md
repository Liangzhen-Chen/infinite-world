# TI1b 验收数据

正式世界；对照 t-ti1@eed086f9。仅新开档，不修改原存档。未提交、未部署，未重生成金快照。

## 钱量手算

年历 360=30×12 日。每人的年工日由本人/同工种既有 restDays=[10,20,30] 扣除，通常324日；未成年0，成年身体能力读 townLaborMinutes（480分钟满工日，老龄/病弱折减）。逐人容量和工日列在 town-income.json 的 labor。

逐人每日身体劳力容量合计231490分钟（231490/480个满劳力），本镇登记/同工种休息日所得年工日均为324；因此 231490×324=75002760 年分钟。

全年劳力合计 75002760 分钟，折合 156255.75 工日；按全年平均为 434.04375 满劳力。工价读 economy.dailyIncomeBySkillStage[0]=[20,40]，中位30文/日。年名义收入=75002760/480×30=4687672.5文。现金持有期1月是有史料方法支持的 P待标定缺省，史料不证明具体一月。

M=floor(4687672.5×1/12)=390639文；已有私钱2351＋公库12000均计入，实际新分配=390639-2351-12000=376288文。历史买粮钱已经付出，不再扣当前现金。

300户均无农地登记，因此不臆造上季耕地。口粮是上集买回的耐放干粮，按每户稳定hash从0至人口×60×10/30份取整数，扣已有可食库存；总计9735份。居住tenure照抄原登记，金额租约/期限继续未知。

## 30日审计

统计694人；每缺60饱食记一个日口粮当量，故半份饥饿如实保留0.5，不以整数公账指标替代。各组的I1对照均为期初钱粮0、购买0、缺餐=人数×30。

| 组 | 人数 | 期初钱/文 | 期初粮/份 | 实购/份 | 缺餐当量 | I1缺餐 |
|---|---:|---:|---:|---:|---:|---:|
| craft~large~full | 18 | 28582 | 140 | 0 | 470 | 540 |
| craft~large~reduced | 54 | 79358 | 469 | 0 | 1385.5 | 1620 |
| craft~middle~full | 10 | 7513 | 88 | 0 | 256 | 300 |
| craft~middle~reduced | 90 | 66117 | 1019 | 0 | 2190.5 | 2700 |
| craft~small~full | 13 | 9058 | 135 | 0 | 322.5 | 390 |
| craft~small~reduced | 79 | 52006 | 789 | 0 | 1975.5 | 2370 |
| labor~labor~full | 43 | 221 | 373 | 0 | 1103.5 | 1290 |
| labor~labor~reduced | 387 | 1813 | 3802 | 0 | 9709 | 11610 |

合计：购买0→0，缺餐20820→17412.5，账本错误0。0购买不能解读为钱不足；当前正式可达供货未形成可食商品成交。未修改TFB/C/I2所有权文件，也未为改善数字增加货架或就业。

## 各组w手算（各两户）

工具和材料价格直接读item.basePrice；所需设施用现有FACILITY_TYPES.workshop的木8石4工3日重置估值。同户同类只计一次，不转移公有产权，不重复发放器具。资产权重max(1,资本文值)；正资本1/3、2/3分位为146、171文，同值不拆档。无生产配方的劳力服务户取最低1。

| 组 | 户 | 工具 | 设施 | 一期材料 | 资本→w |
|---|---|---|---|---|---:|
| craft~large~full | house_pop_bs_015 | item_smith_hammer:1×16+item_smith_tongs:1×12+item_pottery_wheel:1×28 | smithing:(8×4+4×3+3×30)+pottery:(8×4+4×3+3×30) | item_iron:1×12+item_charcoal:2×3+item_clay:1×3+item_charcoal:2×3 | 351 → 351 |
| craft~large~full | house_pop_bs_029 | item_pottery_wheel:1×28+item_sewing_needle:1×3 | pottery:(8×4+4×3+3×30)+weaving:(8×4+4×3+3×30) | item_clay:1×3+item_charcoal:2×3+item_hemp_thread:1×5 | 313 → 313 |
| craft~large~reduced | house_pop_bs_018 | item_pottery_wheel:1×28+item_sewing_needle:1×3 | pottery:(8×4+4×3+3×30)+weaving:(8×4+4×3+3×30) | item_clay:1×3+item_charcoal:2×3+item_hemp_thread:1×5 | 313 → 313 |
| craft~large~reduced | house_pop_bs_026 | item_smith_hammer:1×16+item_smith_tongs:1×12+item_sewing_needle:1×3 | smithing:(8×4+4×3+3×30)+weaving:(8×4+4×3+3×30) | item_iron:1×12+item_charcoal:2×3+item_hemp_thread:1×5 | 322 → 322 |
| craft~middle~full | house_pop_bs_043 | item_pottery_wheel:1×28 | pottery:(8×4+4×3+3×30) | item_clay:1×3+item_charcoal:2×3 | 171 → 171 |
| craft~middle~full | house_pop_bs_085 | item_cooking_pot:1×14 | cooking:(8×4+4×3+3×30) | item_oat_flour:1×4+item_water:1×1+item_salt:1×1+item_wood_shavings:1×1 | 155 → 155 |
| craft~middle~reduced | house_pop_bs_001 | item_cooking_pot:1×14 | cooking:(8×4+4×3+3×30) | item_oat_flour:1×4+item_water:1×1+item_salt:1×1+item_wood_shavings:1×1 | 155 → 155 |
| craft~middle~reduced | house_pop_bs_013 | item_cooking_pot:1×14 | cooking:(8×4+4×3+3×30) | item_oat_flour:1×4+item_water:1×1+item_salt:1×1+item_wood_shavings:1×1 | 155 → 155 |
| craft~small~full | house_pop_bs_042 | item_sewing_needle:1×3 | weaving:(8×4+4×3+3×30) | item_hemp_thread:1×5 | 142 → 142 |
| craft~small~full | house_pop_bs_055 | item_whittling_knife:1×8 | woodworking:(8×4+4×3+3×30) | item_wood:1×4 | 146 → 146 |
| craft~small~reduced | house_pop_bs_004 | item_sewing_needle:1×3 | weaving:(8×4+4×3+3×30) | item_hemp_thread:1×5 | 142 → 142 |
| craft~small~reduced | house_pop_bs_028 | item_whittling_knife:1×8 | woodworking:(8×4+4×3+3×30) | item_wood:1×4 | 146 → 146 |
| labor~labor~full | house_pop_bs_010 | 0 | 0 | 0 | 0 → 1 |
| labor~labor~full | house_pop_bs_019 | 0 | 0 | 0 | 0 → 1 |
| labor~labor~reduced | house_pop_bs_002 | 0 | 0 | 0 | 0 → 1 |
| labor~labor~reduced | house_pop_bs_003 | 0 | 0 | 0 | 0 → 1 |

## 金快照与数值

advance-registry：3通过、2个旧金快照不一致；未设UPDATE_ADVANCE_GOLDEN。完整full五步、quiet四步的逐字段旧→新与原因见 TI1b-golden-fields.json（4145处，集合字段保留完整旧新数组/对象）。比对的是I1实际轨迹，不把I1已存在的快照差异归给本卡。

- 区域余量按逐户w入私囊；后续真实收支随钱粮与家计决定改变：405处。
- 逐户历史购买口粮入袋并实际消耗；家计采买/觅食改变后续持物：209处。
- 钱粮→家计计划→实际作息/到期刻次序的连锁：187处。
- 统计账户由生计/资本分位/劳力能力分组；份额、钱粮、消费与缺口随之改变，总人口仍694：464处。
- 逐户期初购买口粮入genesis，M与余量从新规则派生：9处。
- 期初口粮改变家户觅食、采购与照护计划；共享账仍走原结算：2252处。
- 私粮减少实际觅食提款，野外有限存量的reserve/harvested及回执随之变化：59处。
- 原先无钱粮的名册户主尚未在NPC状态；现将新开档私产保存在逐户money_account，物化时只转移一次，不进入公库：405处。
- 私粮抵扣实际缺餐；公账指标仍按组/日向上取整，非最后一次取整：9处。
- 觅食/通勤与可用钱粮改变实际上课及成长时长：70处。
- 实际行程与同场经历变化导致事实事件及记忆变化：35处。
- 饥饿出行改变实际同场时长，同场关系和后续记忆随之改变：36处。
- 新出行/作息改变分刻边界，年龄浮点累加尾数随拆步改变；数值函数摘要一致：1处。
- 期初钱粮→家计/作息/同场事件的连锁派生（按路径与旧新值供主会话复核；未改该责任模块）：4处。

numeric-digest：state摘要有意变化；functions逐项完全一致。基线与新版输出分别为TI1b-I1-numeric.json、TI1b-numeric.json。

## 测试接点与范围

删除fundedIncomeWorld；town-income在正式世界上检查开账、物化、保存及实际生产/支付入口，不另造库存或工位。其中名册入状态和生产工资的单元用例直接调用已有生产入口，未宣称它们证明完整的自动就业工具链；30日动作审计仍为0就业。实际world_move、world_time、population_profile覆盖统计物化路径。

food-demand、load-world、data-coverage按有期初资产的设计对齐，保留精确守恒与短缺断言；公账按组/日取整、无缺餐时不凭空写0。另四处河湾裁剪世界夹具同步移除已删白石户对应的期初登记；未删/跳过测试，未放宽断言。扩展文件为schema、生成工具、I1审计工具及上述测试接点。

## 性能

命令：node F:/dnd-tools/bench-farm-pests.mjs 30 2；同一fixture/seed，基线为eed086f9。三对全部保留，不剔除慢值。

| 对 | I1/ms | 新版/ms | 比值 |
|---|---:|---:|---:|
| 1 | 185355 | 186009 | 1.003528 |
| 2 | 167375 | 177820 | 1.062405 |
| 3 | 169537 | 177528 | 1.047134 |

三对比值中位=1.047134 ≤1.05，通过。

## 逐文件检查摘要

全部逐文件独立 node --test --test-isolation=none；每个测试进程TEMP/TMP=F:/dnd-tmp。仅过滤摘要，失败细节仅单用例末30行。未跑全量、未构建或部署；保留既有23项baseline预期失败。

affected-tests2：378文件；本卡执行38文件，35文件整文件通过，余340文件按大清单规则交主会话关卡；不把未跑文件算通过。

| 文件（tests/） | pass | fail | 说明 |
|---|---:|---:|---|
| town-income.test.mjs | 8 | 0 | 通过 |
| food-demand.test.mjs | 7 | 0 | 通过 |
| load-world.test.mjs | 2 | 0 | 通过 |
| data-coverage.test.mjs | 8 | 0 | 通过 |
| numeric-persistence.test.mjs | 1 | 0 | 通过 |
| save-roundtrip.test.mjs | 6 | 0 | 通过 |
| engine.test.mjs | 22 | 0 | 通过 |
| storage.test.mjs | 16 | 0 | 通过 |
| plugin.test.mjs | 7 | 0 | 通过 |
| actions-catalog.test.mjs | 4 | 0 | 通过 |
| action-registry.test.mjs | 7 | 0 | 通过 |
| advance-registry.test.mjs | 3 | 2 | full/quiet 金快照有意变化，未重生，逐字段已登记 |
| arch-metrics.test.mjs | 5 | 0 | 通过 |
| invariants/i01-conservation.test.mjs | 2 | 0 | 通过 |
| invariants/i02-non-negative.test.mjs | 3 | 0 | 通过 |
| invariants/i15-single-account.test.mjs | 2 | 0 | 通过 |
| invariants/i16-event-primary-write.test.mjs | 2 | 0 | 通过 |
| invariants/i31-total-order.test.mjs | 18 | 0 | 通过 |
| s5-law-business-lifecycle.test.mjs | 13 | 0 | 通过 |
| s5-law-delivery-capacity.test.mjs | 12 | 0 | 通过 |
| s5-law-disease-contact.test.mjs | 7 | 0 | 通过 |
| s5-law-household-budget.test.mjs | 27 | 0 | 通过 |
| s5-law-household-labor.test.mjs | 16 | 0 | 通过 |
| s5-law-household-meals.test.mjs | 13 | 0 | 通过 |
| s5-law-land-value.test.mjs | 9 | 0 | 通过 |
| s5-law-maintenance.test.mjs | 13 | 0 | 通过 |
| s5-law-periodic-market.test.mjs | 24 | 0 | 通过 |
| s5-law-procurement.test.mjs | 10 | 0 | 通过 |
| s5-law-production-inputs.test.mjs | 10 | 0 | 通过 |
| s5-law-public-maintenance.test.mjs | 15 | 0 | 通过 |
| s5-law-seasonal-credit.test.mjs | 21 | 0 | 通过 |
| s5-law-soak-report.test.mjs | 6 | 0 | 通过 |
| s5-law-soak.test.mjs | 7 | 0 | 通过 |
| s5-law-subsistence.test.mjs | 38 | 0 | 通过 |
| s5-law-tenancy-sharing.test.mjs | 15 | 0 | 通过 |
| s5-law-water-source.test.mjs | 12 | 0 | 通过 |
| s5-playthrough.test.mjs | 0 | 1 | I1同一用例同一第67行：null !== loc_hw；商人尚在途中，非本卡新失败 |
| overfit-guard.test.mjs | 2 | 2 | 两项需spawnSync git show master，沙箱EPERM；静态扫描和控制用例通过 |

S5试玩基线复跑核对为同一子测试、同一第67行断言、相同旧新值，不改等待或断言。overfit失败由直接探针确认error.code=EPERM，交主会话沙箱外补跑。CORE与本卡指定业务测试全部通过；同步四件套仅advance-registry两旧金快照待审核。

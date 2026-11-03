# W8-E8 第八轮交接

最终状态（2026-10-29 03:30 UTC停手）：主体修复、回归与逐文件快测完成，但未全验收。S5走完真实存单、支取及余款存款后进程堆OOM，完整导出导入未完成；agriculture运行6276.162秒仍未结束，按本卡时限停止。未提交、未部署，不能报告本卡全部通过。

正常建筑现在不会一季自然报废。旧损耗是代码里的木3/石1、使用1、雨1/暴雨4，每10单位扣1点；同种子隔离时钟让酒馆第98日、学堂/驿站第159日停用。酒馆业主开局450铜，白石公署公库12000铜；第六轮实际分钟280044的旧诊断更记录酒馆0/停用时林穗仍有493铜，不是没有修理钱；学堂、驿站只有经理/柜员，没有建筑产权人，未补造产权。完整285设施曲线及实际菜单日志资金见W8E8-building-diagnosis.md、W8E8-building-diagnosis.json、W8E8-building-live.json。

world/meta/rules.json追加设施磨损数据。建筑寿命无现成定值，明确借用数值方案§2.11普通耐用品5年作为保守校准起点，不伪称架构已规定建筑五年。日累计100×原权重，分母3×5×360=5400；干燥住人木建筑180天损耗floor(180×400/5400)=13，酒馆70→57；180天每日暴雨的最坏满状态木建筑也只损26点。火灾、洪水、战役损伤未缩放。兼容旧10分母余数，远方转现场保留余数；已毁旧建筑不自动复活。该五年校准选择需主会话审读来源与计算。

新增building-maintenance，接入已有NPC自治候选和npcDecision，复用facilityRepairMaterials、holdWorks/settleWorks及completeFacilityProject。只由登记NPC业主本人在场做工，缺料只向可见同地、有公开库存交易服务的真实卖家采购，真实付本人钱袋；材料入工程库存，做满实际工时才消耗完工。自己做工不制造承包费；病弱、作息、义务、每日工时、主观底线继续约束。集体建筑仍走已有官职公共工程入口，不把首领私囊当公账，不把管事当业主；本轮未新增采购出行或公共库存出售权限。

接线发现npc-autonomy日常采购只冻结买方在场，结算却检查双方，导致原生日常采购必败。已与冻结计划入口一致记录买卖双方。材料采购回归证明钱从业主转卖家、库存守恒；维修回归严格核对4木2石、4×240=960分钟、拒绝/缺料不修。

真实S5路线已经核对到：第17日播种，180个合格生长日，质量和131.04999855149597，收成floor((1700/15)×质量和/180)=82份；两趟、18笔自产粮交易全售，实收168铜，现金31→199。月租16八期128，先付10，后续8笔债务6+7×16=118全付，余81铜。原收割、售粮、租金、守恒断言保留，未改人物/种子/营业时间。

沈笃真实死亡分钟115200，故固定驿站柜不能继续办理；没有复活或换派柜员。原脚本已有三个候选柜面，本轮未增加或改换路线。其后到白石公署柜时，发现测试等候逻辑跳过真实到场：分钟380640镇长已出发、380645到，旧逻辑跳下一作息边界反复错过。抽取tests/helpers/bank-window，读真实scheduleTravel.arrive，仍通过菜单推进。新增真实菜单回归的雾天行程严格手算ceil(.25/4×60×1.1)+ceil(.03535533905932639/4×60)=5+1=6分钟，到后实际存6、得本金5。未放宽S5原存单、三日支取或全量重放断言。诊断见W8E8-bank-arrival-diagnosis.json。

代码与数据：facilities.mjs、facility-state.mjs修磨损/余数；building-maintenance.mjs新增自治维修；npc-autonomy.mjs修日常采购在场快照；world/meta/rules.json追加基准数据；tools/arch-layers与system-map登记新模块。测试改facilities、premises、s5-playthrough，并加building-maintenance及bank-window辅助；更新docs/可玩版本-S5.md。docs/actions.json由官方工具重导，补齐此前已实现而未导入的rent_in、workshop_stock两操作及源码定位；本轮未新增玩家枚举/槽位，静态提示node调用loadPromptBundle实测10583→10583（31747字节），低于10587。

测试均一文件一条node --test --test-isolation=none，TEMP/TMP=F:/dnd-tmp，输出只取摘要；单例详情仅最后30行。下表为最终实现的有效结果；首次失败的采购接点和目录过期均修复后重跑通过。

|文件|pass/fail|说明|
|---|---|---|
|engine|21/0||
|storage|12/0||
|plugin|7/0||
|facilities|13/0||
|building-maintenance|4/0||
|w8e8-premises|16/0|含真实到场与存款新回归|
|finance-assets|9/0||
|business-contracts|10/0||
|repair|10/0||
|m1-repair-learning-preconditions|2/0||
|npc-schedule|12/0||
|schedule-cache|7/0||
|s3-offscreen-life|4/0||
|a3-domain-properties|11/0||
|w8c-carry|12/0||
|holdings-writers|3/0||
|credit|6/0||
|shop-restock|7/0||
|s3-obligation-state|5/0||
|npc-obligations|8/0||
|turn-contract-client|17/0||
|a3-discoverability|8/0||
|entity-view|7/0||
|governance-office|5/0||
|s4-offices|5/0||
|governance|8/0||
|s2c-governance|10/0||
|s4-office-quests|9/0||
|governance-projects|4/0||
|governance-housing|4/0||
|a3-consent-rights|6/0||
|a3-consent-legacy|7/0||
|contracts|4/0||
|ledger-stock|6/0|含215日守恒|
|npc-autonomy|10/0||
|numeric-persistence|1/0||
|s5-05|16/0|最终617.641秒|
|actions-catalog|4/0||
|action-registry|7/0||
|arch-metrics|4/0||
|advance-registry|3/2|旧金快照字节差异，未重生成|
|overfit-guard|2/2|spawnSync git EPERM；源码/正负对照通过，master比较两项须主会话外跑|
|s5-playthrough|进程失败，无runner最终计数|V8堆OOM；约2375.402秒；存单/支取/余款存款已实际落盘，完整重放未完成；原A2议价todo未改|
|agriculture|未完成，无完整计数|运行6276.162秒（104分36秒），03:30按时限停止已记录PID32240；20种子×3年，未改断言/未跳过，需外跑完整文件|

金快照：官方golden-dump在干净S5A@74abb8ed和当前树各跑，W8E8-golden-table.md已覆盖为全7264叶字段；6580个字段来自设施condition/磨损余数及分母，其余为已批准铁镰进货。UPDATE_ADVANCE_GOLDEN未设置，金快照文件未改。numeric-digest当前full=3550fa39a72a375c25f434feb8c4f0c9ab9338f84000c77fb1d08c842053b1a6、quiet=2cbeb00a761a8924b4a0e564277cdfefdf44108888bc256dfa8a2ff572ededec；与S5A实际对照functions对象完全相同，状态差异按表解释。

断言改动依据：facilities旧十日损耗锚点改54日，保留96/99与暴雨93严格断言；洪水时刻同步54/55日，伤害量不变。远方30日91→99是floor(30×300/5400)=1，新增3600余数到访后+400=4000断言。bank-window只读取实际到达，新增6分钟手算与实际6→5存款，不删原S5断言。新维修测试调用共享finance夹具准备单测场景，真实S5仍从公开新建角色、原固定种子、玩家菜单运行，没有导入预制状态。

性能与收尾：180日菜单推进仍拆成6个30日原生事件，完整S5原生日志已近1GB；未为提速缩减世界或改变路线。本树未合W8-E10，若只在导出/导入因体积失败，保留失败交主会话合入E10后外跑。本轮未改storage。临时诊断脚本已删除；最终取数后已删除所有自建临时诊断脚本、转储JSON、测试输出摘要文件；仅下述被递归清理策略拦截的三个测试campaign目录保留。

进程与环境：只结束了本会话记录PID及启动时间的103660、88640、103696、32240（前三个停止旧实现/遗漏到场的诊断长测；32240按时限停止农业长测）；无按名或批量结束。一次把未结束诊断当成已结束，数值对照与其短暂重叠超过3个Node，已结束并恢复上限内，此偏离如实记录。递归清理本会话中止测试目录两种写法均被自动审批以blocked by policy拒绝，未再尝试同类递归清理；保留F:/dnd-wt/W8E8/.tmp/p103660-msaKTv、p103696-TxiSkC和最终fatal留下的p98800-M27jCz，需主会话外清理。临时诊断脚本均通过文件编辑正常删除。

路径自查：未改docs/架构设计、world/design、dist、docs/待办、docs/问题；未读secrets、未操作原存档、未部署、未做git写操作。预存未跟踪.base保留。主会话负责提交、状态与进度文档。

下一步：主会话合入W8-E10后用原命令重跑完整S5，保留所有存单、支取、初始状态与事件来源重放断言；给agriculture完整文件足够运行时间，外跑overfit-guard以解除spawnSync git EPERM；审核五年校准与7264字段表后统一处理金快照、提交与状态文档。按上述绝对目录清理三个会话测试campaign。当前没有本会话仍运行的长测Node，不能把未完成项记通过。


最终S5取数：启动02:39:35.001655 UTC，fatal日志末写03:19:10.403610 UTC，约2375.402秒，非runner输出耗时。FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory。最后已落盘bank_inspect余额5、withdraw2余3、s5-homegrown-deposit实存77/本金76/账户余额79（分钟317480），此前具名存单已签发。原生日志1321592889字节，仅有原campaign，没有完成可验证导入重放。不能报告S5通过，也不能把尚未定位到具体storage函数的OOM硬说成唯一已证根因；与已知体积问题一致，交主会话合E10后复跑。未删改任何存单、支取或重放断言。PID98800自然fatal退出，未结束它。

TOWNINC 卡 I3a：城镇系列整合（I2 + 卡 C + s5a/K16 合进来）并清 t-town 原有失败。先读 docs/产品原则.md 和 F:/dnd/logs/arch/townfood/design.md 的 11-02 两节裁定。

## 背景
- 工作树 F:/dnd-wt/TI3，分支 t-ti3，现在等于 t-town@1d9cf7ee（TFA 人口需求 + TFB 产销实运）。
- 要并进来三条：
  1. t-ti2@95cda2ff（I2 就业与收入：labor-market/finance-assets/town-work，business.mjs 拆出 serveStatistical 和 purchaseStatisticalInputs）；
  2. t-tc@63f7929f（卡 C 家常加工：household-crafts/household-food，business.mjs 里统计组按“买成品 vs 买原料自做”比价的 basket、producer 余粮上限、householdFoodDemand）；
  3. s5a@73ac809d（K16 家户生计：取水、觅食、值守；household-subsistence/water-cycle/npc-state/npc-schedule/education-state）。
- 试合并结果：t-ti2 无冲突；t-tc 在 server-plugin/business.mjs 的统计组柜台服务处冲突（I2 改为 serveStatistical(d,engine,shop,t,routes,{buyer,items,source})，C 在原 serve 里加了 basket 比价）；docs/actions.json 是生成文件，重导出即可。s5a 未试。

## 要做
1. 依次合并 t-ti2、t-tc、s5a（git merge --no-ff，允许你做这三个合并提交，不做其他提交）。
2. business.mjs 冲突按两条规律的并集解，不是二选一：
   - 保留 I2 的 serveStatistical 签名与 purchaseStatisticalInputs（买投入走自己的流水键，不占当天服务守卫）；
   - 保留 C 的比价：统计组在“买成品”路径里仍按 basket 比较报价+加工机会，数量用 householdFoodDemand 和 producer 余粮上限；
   - 两条路径的公共部分（路程、服务时长、店主义务检查）只写一份。
   - s5a 带来的冲突同样按并集解；K16 的文件以 s5a 版为准，卡 C 不改它们。
3. 生成文件（docs/actions.json、system-map 等）一律用工具重导出，不手解。
4. 清 t-town 原有失败：在干净树 F:/dnd-wt/PERFBASE（t-town@1d9cf7ee）上，失败的子测约 7 项（其中一项是 quest-sources 的“过期没人接的任务撤下”）。逐项对照 s5a（F:/dnd-wt/S5A，干净，73ac809d）上同一子测：
   - s5a 也败：不归本卡，列出即可；
   - 只在 t-town 败：找到根因（文件:行），按真实规律修；如是正确的新规律改了锚点，重算锚点并在测试注释里写算式。不删断言、不放宽、不为测试造设施。

## 验收
- 用 tools/affected-tests2.mjs 生成整合后的受影响清单，全跑（最多 2 个 node 进程；超 15 分钟的长测列出不跑）。
- 结果按子测名对照 s5a@73ac809d：整合后不许有 s5a 没有的失败。对照用 S5A 干净树单跑同名文件，不要改 S5A。
- 30 日审计（tools/audit-household-food.mjs，正式世界）：与卡 C 第四轮数字对照（具名户缺餐 1147、统计组缺餐 17,412.5、加工 0、买原粮 0）。现在 K16 的取水已在，看家户烙饼是否因此变多，如实报。
- 性能：30 日×2 对 s5a@73ac809d 三对中位，报数（本阶段门槛 1.35，对合并前 s5a）。
- 金快照：用 F:/dnd-tmp/probe 的 gdump/sdiff（输出路径必须绝对），对 s5a 逐字段归类到 TFA/TFB/I2/C 哪条规律，不重生成。

## 运行约束与文件所有权
- 所有命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；文件只放 F 盘；不读 secrets.json；不改 dist/；世界内容只在 world/。
- 不改 F:/dnd-wt/S5A、PERFBASE、TOWN、TC、TI2、K16 这几个工作树。
- 同一个问题失败两次就停，写明原因。

## 交接
写 F:/dnd/logs/sessions/TI3A-final.md，≤300 字：合并怎么解的（每处一句）、原有失败逐项结论（文件:行）、测试对照结果、审计数字、性能、金快照归类、未解决问题。不贴代码和完整日志。

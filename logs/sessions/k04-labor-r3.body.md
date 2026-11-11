K04 返修一处（主会话审 diff 后，打回）：

问题：`server-plugin/npc-state.mjs:householdWorkTime` 用正则匹配作息活动名 `/农事|农户|田间|耕|种田|种地|播种|收割|务农|照护|照料|照顾|赶集|赶圩/` 来判定哪些时段是家庭生产/照料/赶集。这是按名字特判，违反北极星"派生优先、不按 ID/名字特判"：活动名是叙述文字，改个说法规律就失效，也没法覆盖新作物、新职业。

要改：按结构事实派生家庭义务时段，不读活动名：
- 种地：时段地点是本户实际耕作的田——登记农事规则里的 fieldLocation，且本人或本户对它有 owns/leases（含 K01 的田地租约）或现有农事账户；
- 照料：沿用已有的 caring 记录与 family.illnesses（你已写的 attending/unattended 逻辑保留）；
- 赶集：真实的 market_trip 记录（K08 将接入），或当日日历为集日（calendar.market）而选中 'market' 作息变体、且时段地点有交易服务（facilityView/currentShops 可派生）的时段；
- 已约定事务：沿用 obligations 逻辑。
若某类义务在现有数据里确实无法结构派生，写清缺什么字段、归哪张卡，不得退回名字匹配。
导出 householdWorkTime 供 K08 复用（K08 当前在另一工作树里复制了一份，主会话合并时会让它改用你的）。

手算锚点与采矿回归保持；新增：同一时段把活动名改成任意字符串，结果不变；在自家田的时段计入农事、在别人田（无权利）不计。
验收同前（s5-law-household-labor、labor-market、npc-schedule、npc-obligations、s3-labor-justice、CORE、同步四件套）。汇报同原卡。

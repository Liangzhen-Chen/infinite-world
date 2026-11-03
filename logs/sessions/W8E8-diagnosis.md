# W8-E8 第六轮：首批收割后售粮诊断

状态来自原 S5 菜单路线的新角色，未改人物、世界、时刻或随机种子。临时诊断只截取原路线的状态；副本售粮探针不作为正式通关验收。

首批收割完成：分钟 268776，春历元年 穗月 10日 15:36，实际收得 46 份，剩余 34 份，工时 276 分钟。总产量 80；180 个合格日的质量和 128.59999864806298，手算 floor((1700/15)×质量和/180)=80。

原失败断点：分钟 280044，春历元年 穗月 18日 11:24，玩家在 loc_hw。当前启用 core:calendar_default（大小月），不是 legacy:30-day。未 scoped 的 WorldEngine.calendar 把它算成穗月十五、集日；战役 scoped 引擎算成穗月十八、非集日。旧脚本按旧历等到“十五”，又用旧历查询 NPC 服务，才得到 0。引擎实际按大小月调度，严辙在 loc_bs 正常营业；不是引擎投影或调度 bug。最终测试应沿 engine.scoped(current) 读取日历、作息、服务和报价。

公共粮仓没有现购农户散粮的规则。agricultureAction 的 buy 是玩家向粮仓买；donate 不付款；settleVillageTrade 只结算登记村际粮约，须先付款提粮，不能用自产粮冒充。因此先采用第 2 条真实路线：步行去白石镇找现有行商；其资金不够时，才向现有市场、烘坊和仓行的在场交易者尝试出售。每次资金或深度拒绝均保留且核对原子性。

副本探针已经把实际持有的首批46份全部交割，收入255铜，钱袋45→300；严辙的152铜实际耗尽后转到白石市场。末笔1份按当时深度与整笔取整得0铜，未把它算作收入。首程从河湾广场步行到白石用1506分钟、0路费，实际到场后再等30分钟至13时，首笔5份实得27铜。该副本没有注资、改日期、改 NPC 状态，不作为从新角色开局的正式验收。

青灯酒馆：condition=0、burning=false、factor=0。world_event:wear:bld_hw_qingdeng:98 在分钟 142560 明记“年久失修，用途停用”，分钟 211680 的损耗事件使其归零，lastWearDay=146。不是营业时间或人物缺席问题；不修复建筑或改数据凑成交。

严辙现有日历：集日（每月 5、15、25）和休息日（10、20、30）5–11 时走向河湾，11–14 时在 loc_hw 交易，14–20 时返回白石；普通日 loc_bs 8–12、13–18 时交易；冬季普通日 9–12、13–17 时。所有日期须按当前战役大小月历法，作息计划不是到场保证。

性能实测线索：正式长测自身 PID 32700（19:24:29 启动）的临时战役，在40个事件时原始事件日志为1,121,399,553字节；180日点击 character-ui-17 被原生拆成六段，#5 的43,200分钟事件为176,027,222字节，#4 为175,376,364字节，#6 的43,014分钟事件为175,121,056字节。过程工作集约2.88GB、峰值4.67GB。这里只读了本次测试的临时目录，没有操作原存档。明确重段是180日推进的大体积事件；未采样各推进系统，不能进一步指定某一个系统为计算瓶颈。完整路线仍保留实际成熟和搬运步骤。

重放的后续检查点：原计数断言把“一次菜单点击”当成“一条事件”，与已观察到的六段时间事件不符；本轮改为对去掉 #N 的来源点击去重计数，保留每个持久事件来自真实点击的断言。该重放段尚未执行。storage.export 会复制全部事件（server-plugin/storage.mjs:658），测试宿主 JSON 请求上限为500mb（tools/playtest-runner.mjs）；目前日志体积已大于此上限，完整导出导入仍需实际验证并处理体积障碍，本轮没有修改存储或宿主限制。

最终验收结论：白石行商→市场→烘坊→仓行的版本运行3331.836秒后仍剩17份未交割，保留失败；随后改为严辙拒绝后真实步行回河湾渡口、果园、北林寻找现有交易者。最终版本运行1813.633秒，80份分两趟46＋34收完且全部卖出，收入392铜、现钱437铜。累计租金1120铜、已付10铜、尚欠1110铜，缺673铜，失败停在清租余额断言。清租、存钱和重放未执行。全部临时诊断文件已删除，所有测试进程自然结束。

下表列出 loc_hw 及现有直连地域中所有已入战役、公开具有 trade 作息或登记商店的 122 名服务者。直连根地域：loc_hw、loc_bs、loc_far_huancheng、loc_far_shuqiao、loc_far_hupo、loc_far_zhufeng、loc_far_jijie。营业窗按当天实际历法变体；状态、义务与建筑在断点读取。配方服务合并为服务类别；无异常状态标记不代表推断新的健康数据。

| 人物 / 商店 | 实际位置 | 今日公开营业窗 | npcAvailability / 公开服务 | 健康与义务 | 建筑完好度 / 状态 | 实有铜钱 |
| --- | --- | --- | --- | --- | --- | --- |
| 林穗 (npc_hw_linsui) / shop_hw_qingdeng | bld_hw_qingdeng | bld_hw_qingdeng 9:00–14:00；bld_hw_qingdeng 15:00–21:00 | 前厅接待；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 493 |
| 阿砚 (npc_hw_ayan) | bld_hw_mill | bld_hw_mill 8:00–12:00；bld_hw_mill 13:00–18:00 | 测量磨轴和修整木件；trade,teach,配方服务 | 无异常状态标记；无赶路；义务 无；自主工作 无 | 27 / 降级 | 160 |
| 段岩 (npc_hw_duanyan) / shop_hw_forge | bld_hw_forge | bld_hw_forge 8:00–12:00；bld_hw_forge 13:00–18:00 | 预约接待；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 8 / 停用 | 144 |
| 吴朔 (npc_hw_wushuo) | loc_hw_northwood | loc_hw_northwood 8:00–12:00；loc_hw_northwood 13:00–18:00 | 预约接待；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 190 |
| 陶芷 (npc_hw_taozhi) | bld_hw_herbs | bld_hw_herbs 8:00–12:00；bld_hw_herbs 13:00–18:00 | 预约接待；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 8 / 停用 | 256 |
| 郑水生 (npc_hw_zhengshuisheng) | loc_hw_dock | loc_hw_dock 8:00–12:00；loc_hw_dock 13:00–18:00 | 查看渡口和核对运货；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 149 |
| 苏岚 (npc_hw_sulan) | bld_hw_weaving | bld_hw_weaving 8:00–12:00；bld_hw_weaving 13:00–18:00 | 织造、裁缝与接待；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 8 / 停用 | 173 |
| 梅绫 (npc_hw_meiling) | loc_hw_orchard | loc_hw_orchard 8:00–12:00；loc_hw_orchard 13:00–18:00 | 果园修枝与查看水沟；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 180 |
| 严辙 (npc_hw_yanzhe) / shop_bs_yanzhe | loc_bs | loc_bs 8:00–12:00；loc_bs 13:00–18:00 | 核对货单与实际交易；trade,teach,配方服务 | 无异常状态标记；无赶路；义务 无；自主工作 无 | 100 / 可用 | 152 |
| 陆青 (npc_hw_luqing) | bld_hw_school | bld_hw_school 8:00–12:00；bld_hw_school 13:00–18:00 | 识字教学；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 8 / 停用 | 171 |
| 安槐 (npc_hw_anhuai) | loc_hw_apiary | loc_hw_apiary 8:00–12:00；loc_hw_apiary 13:00–18:00 | 患病；无服务 | 患病；无赶路；义务 无；自主工作 无 | 非建筑 | 167 |
| 贺绵 (npc_bs_001_2) | bld_bs_weigh | bld_bs_weigh 8:00–12:00；bld_bs_weigh 13:00–18:00 | 码头计数；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 18 |
| 汪澄 (npc_bs_016_1) | bld_bs_carter | bld_bs_carter 8:00–12:00；bld_bs_carter 13:00–18:00 | 车运安排；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 19 |
| 贺笙 (npc_bs_001_3) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 20 |
| 汪绵 (npc_bs_016_2) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 21 |
| 贺砺 (npc_bs_001_4) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 22 |
| 邢澄 (npc_bs_017_1) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 23 |
| 顾澄 (npc_bs_002_1) | bld_bs_weigh | bld_bs_weigh 8:00–12:00；bld_bs_weigh 13:00–18:00 | 码头计数；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 24 |
| 邢绵 (npc_bs_017_2) | bld_bs_store | bld_bs_store 8:00–12:00；bld_bs_store 13:00–18:00 | 货栈交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 顾绵 (npc_bs_002_2) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 26 |
| 钟澄 (npc_bs_018_1) | bld_bs_home_018 | 今日无交易窗 | 死亡；无服务 | 死亡；无赶路；义务 无；自主工作 无 | 12 / 停用 | 0 |
| 顾笙 (npc_bs_002_3) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 19 |
| 钟绵 (npc_bs_018_2) | bld_bs_carter | bld_bs_carter 8:00–12:00；bld_bs_carter 13:00–18:00 | 车运安排；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 38 |
| 邵澄 (npc_bs_003_1) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 21 |
| 侯澄 (npc_bs_019_1) | bld_bs_carter | bld_bs_carter 8:00–12:00；bld_bs_carter 13:00–18:00 | 车运安排；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 邵绵 (npc_bs_003_2) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 23 |
| 侯绵 (npc_bs_019_2) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 24 |
| 邵笙 (npc_bs_003_3) | bld_bs_weigh | bld_bs_weigh 8:00–12:00；bld_bs_weigh 13:00–18:00 | 码头计数；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 25 |
| 薛澄 (npc_bs_020_1) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 26 |
| 傅澄 (npc_bs_004_1) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 18 |
| 薛绵 (npc_bs_020_2) | bld_bs_home_020 | bld_bs_store 8:00–12:00；bld_bs_store 13:00–18:00 | 患病；无服务 | 患病；无赶路；义务 无；自主工作 无 | 12 / 停用 | 19 |
| 傅绵 (npc_bs_004_2) | bld_bs_weigh | bld_bs_weigh 8:00–12:00；bld_bs_weigh 13:00–18:00 | 码头计数；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 20 |
| 石澄 (npc_bs_021_1) | bld_bs_store | bld_bs_store 8:00–12:00；bld_bs_store 13:00–18:00 | 货栈交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 傅笙 (npc_bs_004_3) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 22 |
| 石绵 (npc_bs_021_2) | bld_bs_carter | bld_bs_carter 8:00–12:00；bld_bs_carter 13:00–18:00 | 车运安排；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 罗澄 (npc_bs_005_1) | bld_bs_weigh | bld_bs_weigh 8:00–12:00；bld_bs_weigh 13:00–18:00 | 码头计数；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 24 |
| 熊澄 (npc_bs_022_1) | bld_bs_carter | bld_bs_carter 8:00–12:00；bld_bs_carter 13:00–18:00 | 车运安排；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 罗绵 (npc_bs_005_2) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 26 |
| 熊绵 (npc_bs_022_2) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 18 |
| 罗笙 (npc_bs_005_3) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 19 |
| 乔澄 (npc_bs_023_1) | bld_bs_guild | bld_bs_guild 8:00–12:00；bld_bs_guild 13:00–18:00 | 货单抄写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 20 |
| 夏澄 (npc_bs_006_1) | bld_bs_dock | bld_bs_dock 8:00–12:00；bld_bs_dock 13:00–18:00 | 系缆与装卸；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 0 / 停用 | 21 |
| 乔绵 (npc_bs_023_2) | bld_bs_store | bld_bs_store 8:00–12:00；bld_bs_store 13:00–18:00 | 货栈交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 夏绵 (npc_bs_006_2) | bld_bs_boat | bld_bs_boat 8:00–12:00；bld_bs_boat 13:00–18:00 | 船具修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 11 / 停用 | 23 |
| 姜澄 (npc_bs_031_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 公署递件；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 白澄 (npc_bs_046_1) | bld_bs_market | bld_bs_market 8:00–12:00；bld_bs_market 13:00–18:00 | 摊位整理；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 19 |
| 姜绵 (npc_bs_031_2) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 白绵 (npc_bs_046_2) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 21 |
| 潘澄 (npc_bs_032_1) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 马澄 (npc_bs_047_1) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 23 |
| 潘绵 (npc_bs_032_2) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 24 |
| 马绵 (npc_bs_047_2) | bld_bs_oven | bld_bs_oven 8:00–12:00；bld_bs_oven 13:00–18:00 | 麦饼烘制；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 余澄 (npc_bs_033_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 26 |
| 龚澄 (npc_bs_048_1) | bld_bs_oven | bld_bs_oven 8:00–12:00；bld_bs_oven 13:00–18:00 | 麦饼烘制；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 余绵 (npc_bs_033_2) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 公署递件；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 19 |
| 龚绵 (npc_bs_048_2) | bld_bs_market | bld_bs_market 8:00–12:00；bld_bs_market 13:00–18:00 | 摊位整理；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 杜澄 (npc_bs_034_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 公署递件；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 汤澄 (npc_bs_049_1) | bld_bs_market | bld_bs_market 8:00–12:00；bld_bs_market 13:00–18:00 | 摊位整理；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 杜绵 (npc_bs_034_2) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 汤绵 (npc_bs_049_2) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 24 |
| 钱澄 (npc_bs_035_1) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 于澄 (npc_bs_050_1) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 45 |
| 钱绵 (npc_bs_035_2) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 于绵 (npc_bs_050_2) | bld_bs_home_050 | 今日无交易窗 | 死亡；无服务 | 死亡；无赶路；义务 无；自主工作 无 | 12 / 停用 | 0 |
| 蒋澄 (npc_bs_036_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 段澄 (npc_bs_051_1) | bld_bs_oven | bld_bs_oven 8:00–12:00；bld_bs_oven 13:00–18:00 | 麦饼烘制；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 蒋绵 (npc_bs_036_2) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 公署递件；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 段绵 (npc_bs_051_2) | bld_bs_market | bld_bs_market 8:00–12:00；bld_bs_market 13:00–18:00 | 摊位整理；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 丁澄 (npc_bs_037_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 公署递件；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 24 |
| 朱澄 (npc_bs_052_1) | bld_bs_market | bld_bs_market 8:00–12:00；bld_bs_market 13:00–18:00 | 摊位整理；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 丁绵 (npc_bs_037_2) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 26 |
| 朱绵 (npc_bs_052_2) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 18 |
| 沈澄 (npc_bs_038_1) | bld_bs_watch | bld_bs_watch 8:00–12:00；bld_bs_watch 13:00–18:00 | 巡更交接；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 19 |
| 金澄 (npc_bs_053_1) | bld_bs_inn | bld_bs_inn 8:00–12:00；bld_bs_inn 13:00–18:00 | 客舍洗晒；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 20 |
| 沈绵 (npc_bs_038_2) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 金绵 (npc_bs_053_2) | bld_bs_oven | bld_bs_oven 8:00–12:00；bld_bs_oven 13:00–18:00 | 麦饼烘制；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 孟澄 (npc_bs_039_1) | bld_bs_office | bld_bs_office 8:00–12:00；bld_bs_office 13:00–17:00 | 户籍抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 阎澄 (npc_bs_061_1) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 37 |
| 阎绵 (npc_bs_061_2) | bld_bs_home_061 | 今日无交易窗 | 死亡；无服务 | 死亡；无赶路；义务 无；自主工作 无 | 12 / 停用 | 0 |
| 陶澄 (npc_bs_062_1) | bld_bs_cloth | bld_bs_cloth 8:00–12:00；bld_bs_cloth 13:00–18:00 | 衣物缝补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 陶绵 (npc_bs_062_2) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 邝澄 (npc_bs_063_1) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 邝绵 (npc_bs_063_2) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 崔澄 (npc_bs_064_1) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 49 |
| 崔绵 (npc_bs_064_2) | bld_bs_home_064 | 今日无交易窗 | 死亡；无服务 | 死亡；无赶路；义务 无；自主工作 无 | 12 / 停用 | 0 |
| 武澄 (npc_bs_065_1) | bld_bs_cloth | bld_bs_cloth 8:00–12:00；bld_bs_cloth 13:00–18:00 | 衣物缝补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 26 |
| 武绵 (npc_bs_065_2) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 费澄 (npc_bs_066_1) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 19 |
| 费绵 (npc_bs_066_2) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 高澄 (npc_bs_067_1) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 高绵 (npc_bs_067_2) | bld_bs_cloth | bld_bs_cloth 8:00–12:00；bld_bs_cloth 13:00–18:00 | 衣物缝补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 22 |
| 郭澄 (npc_bs_068_1) | bld_bs_cloth | bld_bs_cloth 8:00–12:00；bld_bs_cloth 13:00–18:00 | 衣物缝补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 郭绵 (npc_bs_068_2) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 24 |
| 翁澄 (npc_bs_069_1) | bld_bs_smith | bld_bs_smith 8:00–12:00；bld_bs_smith 13:00–18:00 | 铁件修补；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 翁绵 (npc_bs_069_2) | bld_bs_potter | bld_bs_potter 8:00–12:00；bld_bs_potter 13:00–18:00 | 陶坯制作；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 26 |
| 季澄 (npc_bs_076_1) | bld_bs_temple | bld_bs_temple 8:00–12:00；bld_bs_temple 13:00–18:00 | 灯祠照看；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 季绵 (npc_bs_076_2) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 字样板描写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 19 |
| 季笙 (npc_bs_076_3) | bld_bs_still_temple | bld_bs_still_temple 8:00–12:00；bld_bs_still_temple 13:00–18:00 | 学馆抄录与佛基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 20 |
| 裴澄 (npc_bs_077_1) | bld_bs_reed_dao | bld_bs_reed_dao 8:00–12:00；bld_bs_reed_dao 13:00–18:00 | 字样板描写与道基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 21 |
| 裴绵 (npc_bs_077_2) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 学馆抄录与法基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 22 |
| 裴笙 (npc_bs_077_3) | bld_bs_temple | bld_bs_temple 8:00–12:00；bld_bs_temple 13:00–18:00 | 灯祠照看；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 舒澄 (npc_bs_078_1) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 学馆抄录与炼丹基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 24 |
| 舒绵 (npc_bs_078_2) | bld_bs_temple | bld_bs_temple 8:00–12:00；bld_bs_temple 13:00–18:00 | 灯祠照看与巫祝基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 25 |
| 舒笙 (npc_bs_078_3) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 字样板描写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 26 |
| 曲澄 (npc_bs_079_1) | bld_bs_measured_hall | bld_bs_measured_hall 8:00–12:00；bld_bs_measured_hall 13:00–18:00 | 灯祠照看与武基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 18 |
| 曲绵 (npc_bs_079_2) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 字样板描写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 19 |
| 曲笙 (npc_bs_079_3) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 学馆抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 20 |
| 苗澄 (npc_bs_080_1) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 字样板描写；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 21 |
| 苗绵 (npc_bs_080_2) | bld_bs_school | bld_bs_school 8:00–12:00；bld_bs_school 13:00–18:00 | 学馆抄录；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 12 / 停用 | 22 |
| 苗笙 (npc_bs_080_3) | bld_bs_temple | bld_bs_temple 8:00–12:00；bld_bs_temple 13:00–18:00 | 灯祠照看与祭礼基础师授；trade,teach | 无异常状态标记；无赶路；义务 无；自主工作 无 | 31 / 降级 | 23 |
| 烟砧 (npc_ms_tj_yanzhen) | site_ms_tj_hearth | 今日无交易窗 | 死亡；无服务 | 死亡；无赶路；义务 无；自主工作 无 | 非建筑 | 0 |
| 烟苔 (npc_ms_tj_yantai) | bld_ms_tj_home_01 | site_ms_tj_stair 18:00–22:00 | 睡眠；无服务 | 无异常状态标记；无赶路；义务 无；自主工作 无 | 20 / 停用 | 45 |
| 栗衡 (npc_ms_td_liheng) | bld_ms_td_home_03 | site_ms_td_commons 0:00–1:00；site_ms_td_commons 19:00–24:00 | 睡眠；无服务 | 正常；无赶路；义务 无；自主工作 无 | 27 / 降级 | 8 |
| 青芷 (npc_ms_td_qingzhi) | bld_ms_td_home_02 | site_ms_td_saltstone 18:00–22:00 | 睡眠；无服务 | 无异常状态标记；无赶路；义务 无；自主工作 无 | 27 / 降级 | 12 |
| 节苍 (npc_ms_yg_jiecang) | site_ms_yg_gate | site_ms_yg_gate 6:00–18:00 | 在根门见来客、换林产；trade | 正常；无赶路；义务 无；自主工作 无 | 非建筑 | 0 |
| 须晓 (npc_ms_yg_xuxiao) | site_ms_yg_shed | site_ms_yg_shed 0:00–5:00；site_ms_yg_shed 19:00–24:00 | 患病；无服务 | 患病；无赶路；义务 无；自主工作 无 | 非建筑 | 4 |
| 牙钺 (npc_ms_ll_yayue) | site_ms_ll_adit | site_ms_ll_forge 12:00–20:00 | 带队下矿；无服务 | 正常；无赶路；义务 无；自主工作 无 | 非建筑 | 40 |
| 锉针 (npc_ms_ll_cuozhen) | site_ms_ll_adit | 今日无交易窗 | 矿脉开采；无服务 | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 18 |
| 漪衡 (npc_ms_hx_yiheng) | site_ms_hx_reed | site_ms_hx_reed 6:00–18:00 | 接待换鱼；trade | 正常；无赶路；义务 无；自主工作 无 | 非建筑 | 12 |
| 纤蒲 (npc_ms_hx_xianpu) | site_ms_hx_dew | site_ms_hx_dew 6:00–18:00 | 照看药圃；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 12 |
| 绳额 (npc_ms_gs_shenge) | site_ms_gs_gate | site_ms_gs_gate 6:00–18:00 | 修绳换货；trade | 正常；无赶路；义务 无；自主工作 无 | 非建筑 | 40 |
| 砧禾 (npc_ms_gs_zhenhe) | site_ms_gs_repair | site_ms_gs_repair 6:00–18:00 | 削柄修具；trade | 无异常状态标记；无赶路；义务 无；自主工作 无 | 非建筑 | 40 |


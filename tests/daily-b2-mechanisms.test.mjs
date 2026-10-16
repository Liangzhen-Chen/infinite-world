// 日常题集第二批（DAILY 卡）：现有引擎缺机制、整题无法结算的题。每条 todo 写明缺的机制与迁移阶段（docs/架构设计/10-现状映射与迁移路线.md §10.4）。
// 参数表里这些题要的缺省值已补入 world/rules/tables/balance/（见 daily-b2-tables.test.mjs 的表级验证）；等机制落地后把 todo 改成可执行测试。
import test from 'node:test';

// ---- D07 问路（对话类，A2）----
test.todo('D07 问路 ①②③④⑤——引擎没有“向人打听地点”的动作：NPC 按自己的主观视图答复方位/距离并写入玩家“已知地点”（A2 对话动作组与主观视图 API；S6 知情集合与地图迷雾“可靠转述”）。数据已备：action-costs talk.direction = 3 分钟（题面 2–5），event-weights ask_way/affinity = +0.5（不变或微升）');

// ---- D10 打工日结、D11 月结工钱（受雇，A2 / S3）----
test.todo('D10 打工日结 ①–④——受雇须对方答应：world_act 列出但拒绝（“需要对方答应”，a1-daily-probes 的 D10 测试守着这条）；缺 NPC 决策规则骨架（A2）与 employed_by + wage 义务按日 30 文清偿（S3 义务统一：雇主账户转出）；体力下降缺 S1 body');
test.todo('D10 打工日结 ⑤李员外的地里“已锄”进度增加——劳力只进产量派生，没有田地“已锄/耕作进度”事实（S1 田地作为资源点；S5 作物生长）');
test.todo('D11 月结工钱 ①–⑤——引擎只有按工时日结的受雇（labor-market），没有月薪雇佣：缺 wage 义务 per: anchor（每月初一）与 accruedTo 闭式（附录 A §A.15 期间与折算：八月满勤 → 600，钱柜 2000→1400，同一个月不领两次）、雇佣关系 settle 后继续有效（S3 义务统一）');

// ---- D12 春播、D13 秋收、D14 采草药（农事与采集，S1 / S5）----
test.todo('D12 春播 ①–⑤——引擎农事按聚落公田结算（farm.sow 扣村粮仓的种粮，agriculture.mjs），玩家没有自家田地：缺“田地作为资源点”与播种 outcomes（种子 4 斤 = 每亩 2 斤 × 2 亩、田地事实“已播种（麦）”覆盖 2 亩）（S1 资源点账户；S5 作物生长读播种事实）；耗时与体力缺 A3 cost.time/cost.body。数据已备：yields field:wheat/seed = 2 斤/亩，laborSow = 0.5 工日/亩，action-costs workday.minutes = 480，body travel/heavy 速率');
test.todo('D13 秋收 ①–⑤——同上，缺玩家田地的作物账户与收获转移（2 亩 = 1 亩 ×2、收割后空地、不能重复收割；镰刀耐久）（S1 田地账户；S5 产量 × 积温 × condition）。数据已备：yields field:wheat = 150 斤/亩（界 [100, 300]），laborHarvest = 1 工日/亩（2 亩 = 2 天）');
test.todo('D14 采草药 ①–⑤——引擎采集只对猎物尸体与据点资源（wildlife.gather / site.gather），村后山没有车前草/金银花存量账户与“采一个时辰”的持续采集动作（S5 资源点与种群账户化；S1 转移；A3 持续动作 durationSlot）。数据已备：yields gather:herb = 20 株/工日（一个时辰约 5 株）、action-costs gather.* 时长槽 30–480 分钟、learning perHour.work = 1.7 点/小时');

// ---- D18 修理装备（服务，S3）----
test.todo('D18 修理装备 ①–④——引擎修理是玩家自己按工序修（craft.repair：恢复 restore=20、上限 −1、付作台费 2 文给作台主），没有“请铁匠修好、付报价 25 文、耐久恢复到 100”的服务；缺劳务按条款金额成交的 service 义务与 fact.set(condition) 幅度受能力表约束（S3 义务统一；A3 动作 outcomes）。⑤仍是同一把剑已由 a1-daily-probes 的 D18 测试守着（耐久回升、同一件）');

// ---- D21 寒暄（对话类，A2）----
test.todo('D21 寒暄 ①–⑤——引擎没有“与人聊天”的动作：陈伯按性格与季节谈秋收、天气与实际一致、好感 +1~+3、约 15 分钟、无钱物变化（A2 对话动作组、对话模板 when: season()；S6 立场事件权重）。数据已备：action-costs talk.greet = 15 分钟，event-weights greet/affinity = +1（饱和 5 次 × 0.5，累计不超过 +5）');

// ---- D29 借小额钱款、D30 按时还钱（同意类，A2 / S3 / S6）----
test.todo('D29 借小额钱款 ①–⑤——向邻居借须对方答应：world_act 拒绝（“需要对方答应”，a1-daily-probes 的 D29 测试守着），钱庄借款走抵押旧判定，不是题面流程；缺 NPC 决策（A2）与 loan 义务无息条款 rate: 0（S3；附录 A §A.18 借贷利率区间 [0, 0.05]）。数据已备：event-weights borrow/trust = 0');
test.todo('D30 按时还钱 ①–⑤——同上；钱庄借款的按时还清（状态已还清、无逾期）由 a1-daily-probes 覆盖，但“陈伯 +100、250→150、好感小幅上升（守信）”缺 NPC 间借贷与 settle_on_time 立场事件（S3；S6 立场事件权重）。数据已备：event-weights settle_on_time/trust = +2');

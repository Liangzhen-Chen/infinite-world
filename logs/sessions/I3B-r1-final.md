# I3B 交接（未提交；链断未清零，原因见下）

**根因**
1. 运粮：店架容量不是瓶颈；运粮停在“架满”。报价/送货链路通（shop.mjs foodSupplyBid）。店主现钱被一次粮标占光，已改（item6）。
2. 店主不在：午饭 12:00–13:00 恰在正午客流那一刻，店“关门”。改 business.mjs openShops/tradeWindow/advanceCustomerFlow：当日首个交易时段开门并按该时刻取客。链断“店不营业”184→32。余下为店主被觅食/集日调走，未改。
3. 原粮：燕麦须经磨坊(woodworking，仅 hw)→面粉→烙饼(水、盐、刨屑)，家户无磨、无盐柴水，世界无补给源。属“跨地点加工”与“家用消耗品”两卡，规律层补不上（要内容），未改。
4. 名册户：钱和粮停在 records[house.id]（townOpeningHousehold），餐计划与客流不读，也无人代买；不是重复计数。未改，审计改判为链断。

**item6**：shop.mjs restockOutlay，粮标预算扣其余货架补货额；notables-promotion 通过，s5-04b 锚点按“购粮额”推导重算。
**item7**：food-supply.mjs 雇佣运夫送达后带车畜返程（transport.mjs moveCarriage），到家才算完；s5-08-w3a-settlement 通过，锚点加早先运费。

**审计 30 日（改前→后，餐）**：loc_bs 链断 18062→18550、贫穷 636→148（名册户改判）；ms 各村链断 19→19、贫穷 15→11、歉收 11 不变；其余聚落 0。对账差：货币 0、粮 0。同种子两次逐字节相同。抽查：歉收 loc_ms_taideng 第 0 日（货架 330<需求 720）；贫穷 house_bs_011 等；分配 0 例。

**测试**：约 215/402 受影响文件已跑；新增失败 0（world-clock、s5-04b 旧败已修、notables、advance-registry、s5-playthrough 同 BASE）。为 forge 午后开门重算锚点：quest-sources、economy-content（林穗买厨刀 10）。未跑/超时：farm-pests-clock、farm-pests-hunt、a3-score-self 及其余约 187 个。
**性能**：1.032/1.000/1.036，中位 1.032。
**改动**：business.mjs、shop.mjs、food-supply.mjs、transport.mjs、tools/audit-food-causes.mjs、docs/actions.json（工具重导）、四个测试。

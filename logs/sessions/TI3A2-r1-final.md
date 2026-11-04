# TI3A2 交接（只改测试，未改 server-plugin，未提交）

1. entity-life：入籍前用 statisticalFoodGroups+townShareAmount 读份额，断言精确等于继承+份额。
2. village-ledgers：根因是店主入营业柜台（钱袋→counter 账户）、测试漏算；改用 legacyMoney 全账户总额。
3. weather：TFA 粮仓售粮给 loc_bs 柜台（food-supply 成交记录）；seasonal-hazards：TI1b 统计居民带开局口粮，需求 1388→195/4（第4天吃完回 1478/1388）；world-clock：同上，各村 S 减去已售量（8 个锚点差值逐一吻合）。均算式写入注释。
4. s5-04b：店主 2412 铜买四村粮（TFB），断言按成交统计扣除；w3a-settlement：运输员被 TFB 雇用后牛留在对岸，改为发车前1小时摆放前提；notables-promotion：店主现金被粮单花光，补周转金。
5. advance-registry：金快照从 TFA 起第1步即变，TFB、TI1b、I2、C 逐层再变（各树实跑对照），不重生成；1443=I2 雇工午夜回家的行程到达，测试接受真实行程到达。
6. m1-repair：师傅在接待顾客，引擎拒绝并说明，测试先断言拒绝再等窗口结束重试；m3-language 同因（等10分钟，elapsed 30→40），并发现其战局种子随机，固定为 'm3-language'。
7. w2-s2、wildlife-encounters：原为 127/OOM，重跑 7/7、8/8 通过。
9. 整批 461 文件（不含>15分钟与 s5-playthrough）：仅 advance-registry 2 个金快照失败（s5a 无）；scale 超时 s5a 也败。
长测未跑（按追加指令）：我没改任何长测文件或 server-plugin，它们读的是未变的 HEAD 代码。

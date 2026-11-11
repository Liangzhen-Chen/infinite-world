# 卡 s502-market：S5-02 市场（第 1 会话，计划共 4 会话）

工作区 F:/dnd-wt/S502（分支 t-s502，基于 t-s501 e4ee0536，含 S5-01 派生修正槽）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"02 市场"；docs/架构设计/15-经济与货币.md §15.2、§15.4；docs/A3-后续阶段登记.md 第 46、100 行及归 S5-02 的项（F5、手填价格→02）。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填；数值改为经 S5-01 的派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/，已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 做法）。
- 改了交易/转移、engine、库存等共享接点：验收须跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；沙箱拦 spawn 时用同等依赖扫描并写明），与 master 对比报 pass/fail。
- 汇报写 UTF-8 文件，临时文件放 F:/dnd-tmp，不放工作区根目录。

## 本卡结果（S5-02）
- 市场投影：按 goods:* 聚合供给，扣除持有人自用与已承诺存量（已签合同/已预订）；水质、品质分档定价。
- 交易：零售总额一次取整（不逐件取整累积误差）、大宗按积分计价、买卖方向价差与"日深度"真实生效（同一天连续买入使价格沿深度上升，次日按规则回落）；钱货原子转移（任一失败整笔不发生）。
- 统一 value/购买力：可解释（能列出价格由基准、供需、品质、修正项组成），不在存档里存"报价真相"（报价是派生投影，不是状态）。
- 22 处价格算法合并为市场投影：本会话先建投影与交易核心，并迁移最常用的零售买卖与 NPC 商店；其余价格调用列清单留后续会话。basePrice 只作基准。

## 机制断言（tests/s5-02.test.mjs，至少）
连续购买同一商品价格按深度上升、钱货守恒；扣除自用与已承诺存量后的可售量正确；品质/水质分档价差；零售一次取整与逐件取整的差异被消除；价格解释项可列出且与结果一致；存档往返后报价重新派生、结果一致；失败交易零写入。

## 可改
新增 server-plugin/market.mjs（或按现有结构命名）；server-plugin/{settlement-trade,shop,finance-assets}.mjs 及其直接接点；world/ 中市场规则数据（经审批管线）；tests/s5-02.test.mjs。新模块归层、system-map 登记。锁：agriculture/extraction/forest-water/stock（S5-05 在改）。

## 验收与汇报
s5-02 全过；affected 全部文件对比 master；overfit（沙箱拦则写明）、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s502-market.final.md）：实现要点、已迁移/待迁移价格调用清单、改动文件、命令与 pass/fail、偏离与未解决。

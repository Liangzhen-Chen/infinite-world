# A3 交付物清单与竖切片试玩方案

基线：A3A HEAD 470de8ee（10-22）。静态核对，另抽跑 12 个测试文件（a3-daily/body/marks/rites/prims-rites/rx/limits、daily-b2-*）：122 过 0 败 25 todo。全量未重跑（10-22 19:17 全量 46 败，其后有修复）。docs/A3-退出审计.md 已过时。

## 一、交付物清单

|设计条目|实现（server-plugin/）|按规格的机制测试（tests/）|判定|缺口|
|---|---|---|---|---|
|原语统一 §6.3|native-primitives、primitives*、effects、interactions、magic|a3-kernel；a3-transaction(78)；a3-prims-rites「K2 K6 M4 同水态」「晚K6拒绝回滚早K2」|齐|emit(impress)有意不执行，归S6|
|旧入口适配|legacy-primitives|a3-legacy-primitives、a3-adapters|齐|—|
|world_propose §6.10.3|open-actions、world/actions/open.json|a3-open-actions、a3-builder「真实HTTP两阶段」|部分|只是目录动作 open:proposal；工具仍27个，≤16未做，需定归属|
|先查后提 §6.10.2|action-affordances|同上|部分|“查”无实体状态摘要与原语上限|
|幅度上限 §6.7|action-limits、open-actions.json|a3-limits(14)|齐|—|
|难度派生 §6.7|action-limits:75-81|a3-limits「context requires reasons」|部分|缺目标抗性、幅度比加值|
|路由 §6.8|action-router|a3-routing、routing-order|齐|—|
|档位反噬 §6.6|action-degrees、families表|a3-prims-rites 逐族五档|齐|—|
|同意/权能/受限/标注 §6.5|action-consent、-authority、-capacity|a3-policy、a3-consent-legacy、transaction(撤销、ultra_vires、在押脱逃)|齐|判罪→S4|
|盗窃、争夺pending、world_create、learn读意愿|primitives-runtime|transaction「theft」「pending」「templates reject resources」、a3-adapters|齐|—|
|构造器 §6.9.1|extension/action-builder|a3-builder(25)、a3-builder-ui|部分|方位分区→S4已登记|
|兜底mark §6.9.5|mark-actions、mark-reactions|a3-marks(每标签有反应/衰减)、a3-cost-mark|齐|日志聚类→A4|
|分级配置 §6.10.6|extension/turn.mjs|a3-builder、a3-connectors A8|部分|三档同语料→A4|
|RX|rx、rx-library|a3-rx(含守卫性质测试)|齐|—|
|仪式 §13.5|action-rite、magic-ritual|a3-rites(16)、a3-prims-rites(culture/vow/discipline)|齐|—|
|回执must/mustNot|action-text|builder/connectors/transaction|齐|—|

日常22条：21齐、1部分（D16.5 题面60分钟，配方30分钟，仍 todo）。测试：a3-body(D04/20/33)、a3-daily(D05/14/16/35.5/36/38)、daily-b2-mechanisms(D12/13/18)、-exact(D19)、-exact2(D15/27)、-events2(D32)、-trade(D35.2)；D22/23 在 a3-daily，D31.4 在 a3-owner-ji。

体检（非验收）：a3-score-v5b.json（231题）路由61.5%、构造器22.1%、不支持87、兜底反应18/20。

## 二、竖切片与试玩方案

### ① 五条闭环

|闭环|动作与系统|现有场景|
|---|---|---|
|河湾吃住交易|点餐、议价买卖、住店睡到天亮、赊账；账本、身体、库存、时钟|lodging、sleep、trade、credit|
|做工赚钱|采药、播种收获、钓鱼、做饭、卖出；资源点、工具磨损|craft|
|向人学艺|付学费、三天授课、练习；A2同意、服务义务|literacy|
|交谈打听与报官|请酒打听、读告示、接任务；偷窃、自首、赴庭|npc_social、npc_quest_social、theft|
|奇思妙想|净水卖钱、留痕、被拒给降级；开放提案、裁剪、mark反应|无，须新写|

### ② 端到端真实试玩

- 入口：`TEMP=F:/dnd-tmp node tools/playtests.mjs --run-dir <目录> --run-id <编号> --card <卡名> --increment <元，≤30> --only <场景id>`；可选 --parallel --resume。
- 变量：DEEPSEEK_API_KEY（设置测试API.ps1 写入）。
- 机制：进程内起 server-plugin，真实提示栈与27个工具，DeepSeek 当主持；逐回合账本断言与一致性审查，整场再评分。
- 场景：tests/playtests/*.json（8–20回合，含断言）；现有26个多用旧工具名，第5条须新写。
- 产出：<run-dir>/真实试玩.json、真实试玩失败.json；预算账在 git common-dir/playtest-runs/<run-id>/。
- 验收：账本、时间、存档断言 100%；内部名泄露为0；consistency、review ≥90%；未知请求0。
- 事件推演（docs/probes）用子代理核对，不调游戏模型；酒馆手玩仍是旧扩展，不算端到端。

### ③ 费用（引用实测）

来源：docs/测试报告/*/真实试玩.json，10-12/13 的 M2 复测，早于 A1–A3，价格为上界。

|run|回合|调用|费用(元)|每回合(元)|
|---|---|---|---|---|
|T60|75|353|7.44|0.099|
|M2-recheck|83|324|6.61|0.080|
|-003|71|305|6.94|0.098|
|-004|40|175|4.20|0.105|

评分占约 62–70%；每回合约 4–4.7 次调用。单会话探针（t17-m2-20261012-01）24 次调用 0.285 元。

估算：五条各约10回合，共50回合，约 200–235 次调用，全含 4–5.3 元。open:proposal 路径无实测，先跑一个会话测量。

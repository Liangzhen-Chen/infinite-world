# 卡 s505-resources：S5-05 资源生产（第 1 会话，计划共 3 会话）

工作区 F:/dnd-wt/S505（分支 t-s505，基于 t-s501 e4ee0536，含 S5-01 派生修正槽）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"05 资源生产"；docs/架构设计/05-统一模型.md §5.5；docs/A3-后续阶段登记.md 第 72–74、85、90–95 行及 RW-06/W1 取整相关条目。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填；数值改为经 S5-01 的派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/，已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 做法）。
- 改了交易/转移、engine、库存等共享接点：验收须跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；沙箱拦 spawn 时用同等依赖扫描并写明），与 master 对比报 pass/fail。
- 汇报写 UTF-8 文件，临时文件放 F:/dnd-tmp，不放工作区根目录。

## 本卡结果（S5-05）
- 田、林、矿、药、渔走同一套库存（资源点账户）；种子/面积换算守恒；没有播种就不会生长；同一批不能重复采收；成熟后未收会腐坏；古树等慢再生；有限饵料耗尽即停止产出。
- 源汇预算与累计取整：产出与消耗按累计量取整，结果不随推进步长（1 天推进 30 次 vs 一次推进 30 天）漂移。
- 产量走 S5-01 派生槽（economy:yield 等），不手填系数。

## 机制断言（tests/s5-05.test.mjs，至少）
未播种不生长；种子×面积换算守恒；重复采收被拒；未收腐坏真实减少；古树再生速率；饵料耗尽停产；步长等价（不同步长推进同样天数，库存与产出完全一致）；失败操作零写入。

## 特别注意
tests/agriculture、farm-pests-clock、farm-pests-hunt、farm-pests-harvest 在 master 上单文件就要跑很久（agriculture/farm-pests-clock/hunt 扫描时 30 分钟超时）。本卡改 agriculture 等模块，务必单独计时这几个文件并与 master 对比，不得变慢；能顺带找到它们慢的原因更好（不改测试、不放宽）。

## 可改
server-plugin/{agriculture,extraction,forest-water,stock}.mjs 及直接接点；world/ 资源/再生规则数据（经审批管线）；tests/s5-05.test.mjs。锁：market、settlement-trade、shop、finance-assets（S5-02 在改）。

## 验收与汇报
s5-05 全过；affected 全部文件对比 master；上述 4 个慢文件计时对比；overfit、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s505-resources.final.md）。

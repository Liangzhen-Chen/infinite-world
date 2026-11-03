# 卡 PERFS8：通用层提速，为家户生计规律腾出性能余量

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树由 law-card.sh 从 s5a 当前头切出。

## 背景（主会话实测）
- s5a 对 master@3bbd7e0c：perf-gate 三对中位 1.096（门槛 1.10），几乎无余量。
- K16（取水觅食，另一工作树在做）合入后预计再增 20% 以上；新规律的真实计算不削减，需从通用层省出余量。
- 已知通用热点（K16 对比剖析中同样出现，也存在于 s5a 本身）：storage.mjs 的 take / cloneWalk / canonicalValue（写时复制与规范化比较，约 2s/10 日）、engine.mjs route（路线解析）、weather.mjs 匿名函数、垃圾回收占比。

## 要做
1. 以 master 为基线用 node --cpu-prof + F:/dnd-tools/profile-diff.mjs 剖析 s5a，按自身时间增量排序，优先通用层：写时复制路径（take/cloneWalk）的不必要整树复制、canonicalValue/canonicalEqual 的重复规范化（可按对象身份记忆）、route 的重复解析（按（起点、终点、季节、封路、设施系数签名）记忆）、天气序列重复生成。
2. 只用不改变行为的手段；**行为必须与切出时的 s5a 逐字节一致**：golden-dump 前后 0 差异、numeric-digest 一致、advance-registry（不设 UPDATE）通过。
3. 每项改动附剖析前后数字；FIELDS_INDEX_CHECK=1 跑涉及缓存的测试。
4. 目标：perf-gate 对 master 三对中位 ≤1.00（越低越好）。
## 文件所有权
storage.mjs、engine.mjs（route/get 等通用读路径）、weather.mjs、det-math.mjs、holdings.mjs（只读索引）。**不改** household-subsistence、npc-life、household-budget、npc-state、npc-schedule、education-state、advance-registry（K16 在改）；不改 food-supply/shop/transport（TFB 暂存分支）。热点若在这些文件里，写进汇报（文件:行、数字、建议）。
## 验收
共同规则清单（同文件逐子测对照）；三对数字；逐字节一致证据。汇报 ≤300 字：热点、修法、提速、最终比值。

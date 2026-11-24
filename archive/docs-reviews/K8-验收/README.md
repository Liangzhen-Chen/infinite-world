# K8 验收脚本（都在 F:/dnd-tmp/k8-acc/，不进仓库；默认树 F:/dnd-wt/GUARD）
命令前加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；串行跑，最多 2 个 node 进程。任一脚本非 0 退出即该项失败。

1. acc-compare.mjs <report.json>：按 finding 文本关键词把 G1/G2/G3 分成 8 项（origin、acquisition、seasonality、inspection、未接线、?? 缺省、旧外壳、id 写死；按 id 去重、不计豁免），与审查数字比，差距超过 10% 标 FLAG（退出码 2），由实现方说明；归类口径不符时先看 group/rule，不直接判失败。
2. acc-mutate.mjs <repo>：复制仓库到 mut/（排除 node_modules、.git、SillyTavern、backups、dist、logs），先跑基线，再注入三处从未出现过的缺陷：G1 新物品 item_zq7_probe 带新文案字段 zq7MarketCycle；G2 crafting 表加参数 zq7.orphanKnob；G3 open.json 加只有 call 外壳的动作 open:zq7_probe。判定：基线无、注入后每个检查都报出含该名字的非豁免 finding；删除后无残留，且 finding 总数等于基线。
3. acc-unchanged.sh <树>：git diff master --stat -- server-plugin world tests 必须为空；engine、storage、plugin、advance-registry 四个测试文件全过（日志 unchanged-tests.log）。
4. acc-determinism.mjs <root>：同一棵树跑两次，两份报告逐字节相同。

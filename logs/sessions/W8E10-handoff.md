# W8-E10 交接

工作树 `F:/dnd-wt/W8E10`，分支 `t-w8e10-eventsize`，基线 `74abb8ed`；未提交、未部署、未操作原存档。23:52 UTC 限时交接：体积与重放目标已验证，完整验收尚有两个全文件长测未完成，不能视作全卡验收完成。

限时收尾（约 23:47 UTC）：wildlife 自 22:34 开始、agriculture 自 22:16 开始，到收尾时仍未输出全文件摘要。本会话核对启动时间后，分别按已记录的 PID 结束自己的队列 PowerShell 33112、wildlife Node 63232、agriculture Node 90792；未按名称或批量结束 Node，未结束其他会话进程。此前旧实现农业长测 PID 102344 也由本会话结束后按最终代码重启。执行会话 61905、25715 均已退出；其余测试与独立基准进程均已结束。

下一步：主会话继续跑 `tests/wildlife.test.mjs`、`tests/agriculture.test.mjs` 全文件；在沙箱外补跑下列子进程受限项，处理既有 F025 前提问题，并审核金快照表后统一重生成。CORE、同步、9 个最终轨迹哈希与字段表的核对均已完成；本卡未变化的结果可直接复用。PROGRESS/CHANGELOG/当前状态由主会话统一更新。

## 设计结论（300 字内）

02 的 I16 要求状态变化有事件和原语来源，快照加事件可重建状态；I10/I17 要求派生不落盘、投影缓存可重建。07 §7.6 规定事件分段、事实快照分片，日志保留输入、骰值、序号，未要求每个内部 tick 保存完整对象副本。03 的 L3 负责只读快照与分片。14 区分输入到事件的确定性（I31）与快照加事件重建（I16）。本卡保持逐分钟计算与因果世界事件，只把时间事务的中间写入转换为最终事实净变化，不改设计。

## 定位与实现

`engine.mjs` 原本仅合并 NPC 补丁；其他分区的连续重写全部交给 storage 入链。新开局原生 30 日输出 399951 条补丁、178503088 字节，回执仅 6622 字节。`state.records` 占 174615463 字节（约 97.8%）。植物、食物、水土对象在每一分钟重存整行，即使值已稳定；并非 messages、trace 或压缩格式造成。

| 热点路径 | 次数 | 字节 |
|---|---:|---:|
| physical_feature:feature_s1_stock | 43200 | 25488000 |
| physical_feature:feature_s3_herb_cabinet | 43200 | 24533076 |
| physical_feature:feature_s1_fruit | 43200 | 22410354 |
| physical_feature:feature_s1_seedling | 43200 | 21643200 |
| physical_feature:feature_s1_scion | 43200 | 21297600 |
| physical_feature:feature_s1_herb | 43200 | 21211200 |
| physical_feature:feature_s2_ditch_bank | 43200 | 11140049 |
| physical_feature:feature_s2_bank_silt | 43200 | 8850449 |

`storage.mjs` 新增 `diffPatches(before, after)`：共用引用直接略过，现存对象逐字段比较；数组、新对象及达到路径深度上限的子树整体保留。删除、空对象、父子路径替换均保持。`engine.mjs` 仅在 time 事务最终输出处使用，NPC 沿用已有的每人一条完整最终补丁（保留原保证）；其余分区输出净变化。不改执行、取读、事件发布、骰值、账本、回执或重放路径；先完成业务处理，再丢弃内部工作副本。没有 gzip、改宿主上限、快照截断或复演版本标记。

同时在 `Draft.adopt` 略过与现有记录完全相同的事实，减少实际来源端的无变化写入；当前生产调用者只有 magic-care 与 magic-water-earth 的物理对象存储，账本 prepareStockWrite 钩子只处理 ecology 路径，两个调用者均不命中。编号、变化写入、逐分钟计算与实际资源消耗保留。`tests/engine.test.mjs` 从真实时钟产生的物理记录验证重复提交为零写、下一真实分钟有变化时照常写入，原文档不受修改。

`tests/storage.test.mjs` 增加父子路径、数组、空对象、深路径及随机 JSON 往返覆盖。`tests/event-size.test.mjs` 从真实新角色和菜单等待出发，检查 180 日分六段、含世界归档的完整导出小于 50MB、HTTP 确定性导入和独立无引擎纯补丁重放同哈希。`docs/actions.json` 按要求重导，只同步处理器行号。

## 已测性能

同一世界、种子 `w8e10-event-size`、原生 30 日直接 reduce：

| 指标 | 改前 | 改后 |
|---|---:|---:|
| 输出字节 | 178503088 | 1968340 |
| 补丁条数 | 399951 | 2759 |
| 推进耗时 | 38.895s | 38.672s |
| 峰值 RSS（Node maxRSS，KiB） | 1045520 | 867468 |
| 最终状态 SHA-256 | bb67c347d22969de3879878d4b9d8d6ea66f53d4d9f58067e68ec7515055b8ac | 相同 |

本表最终值在本会话其他测试进程停止后单独测得（`W8E10-30-metrics.json`）；耗时基本持平，峰值约 1.071GB → 0.888GB。来源端略过相同事实后，单次模拟峰值已有部分下降；变化的中间补丁仍保留到事务返回。本修复主要消除跨事件持有、落盘和导出的写放大，未改逐分钟模拟算法。

最终版本真实新角色、菜单一次推进 180 日：含归档世界的完整导出 **19184866 字节（19.18MB）**；六个事件日志共 **10688828 字节**。逐事件字节数为 1968768、1435969、1544061、1839405、1814022、2086597。六段 transact 实测合计 **519.562 秒**；推进及首次导出之前峰值 RSS **1125268 KiB（1.152GB）**，均在并行验收环境下测得。整个回归（含两次引擎重放及纯补丁导入）共 1541.218 秒，峰值 RSS 2596424 KiB（2.659GB）。原问题的 40 事件、30 分钟、峰值 4.67GB 来自交卡实测，场景长度不同，不作为同条件速度倍率对比。30 日表才是本卡同输入前后对照。

180 日完整文档 hash：`977df44a2f99aa6bf960bbda6d9458649cd36efe16e5af220b389bb2a025bce2`。大小直接在最终版本回归的真实 storage.export 结果补齐归档世界后核算（[性能数据](F:/dnd/logs/sessions/W8E10-metrics.json)）。最终 event-size 1/0：HTTP 完整导出、确定性导入、磁盘重新读取、独立无引擎纯补丁导入的完整文档哈希全部一致。导入后的导出为 19184926 字节，增加仅来自导入来源元数据，文档哈希不变。

## 验收

测试逐文件独立进程运行，TEMP/TMP 均设为 `F:/dnd-tmp`，同时最多三个 Node。PowerShell 原生输出存在代码页乱码，摘要过滤保留 `pass/fail` 数字；未读取完整测试输出。摘要在同目录 `W8E10-checks.txt`、`W8E10-replay-checks.txt`、`W8E10-related-a.txt`。

CORE：最终 engine 22/0、storage 14/0、plugin 7/0，包含相同值分支仍拒绝不安全路径的新增断言。同步：最后一次 export-actions 已完成，actions-catalog 4/0、action-registry 7/0、arch-metrics 4/0。numeric-persistence 1/0。

advance-registry 3/2：两个场景的 9 个轨迹哈希仅因 patches 表示变化，旧引擎全部匹配旧金快照，新旧每一步 state/messages 相同；详见 [金快照字段表](F:/dnd/logs/sessions/W8E10-golden-table.md)。最终来源端优化后的 9 个实际轨迹哈希仍逐项匹配本表。没有修改金快照，也没有设置 UPDATE_ADVANCE_GOLDEN。numeric-digest 的 full/quiet 状态摘要及数学函数摘要不变。

overfit-guard 2/2：单独失败用例显示内部 `git show` 的 spawnSync 返回空 status，独立探针确认错误为 EPERM；需要主会话在沙箱外补跑。

I16 2/0、I31 18/0；a3-legacy-replay 4/0、migrations 3/0、r1-migration 3/0、chronicle 6/0、save-roundtrip 6/0。npc-schedule 最终 12/0（已保留每人一条完整补丁），s3-offscreen-life 4/0、ledger-stock 6/0、s5-05 16/0。wildlife-encounters 8/0。其他已完成结果见下表；wildlife 与 agriculture 全文件没有完成摘要，不计通过。

s5-04 17/1：F025 的私人卖出 10 木料，在 `market.mjs:292` 被真实市场日成交深度拒绝（test:277）。使用 git show 取出的未修改原 HEAD 引擎、保持同一用例与断言，单独复现相同失败与堆栈；此路径不走本卡 time 输出处理。未改测试、市场规则或世界数据，交主会话另行处理原有用例前提。

已确认的子进程限制：bosses 10/1（test:140）、revival 10/1（spawn EPERM）、seasonal-migration 9/1（test:150，迁移 CLI 的 status=null；此前同一用例的重启/导入/回滚断言已通过）。agriculture 的回放/重启/CLI 三个相关用例定向结果为 2/1，失败在 test:184 的 CLI status=null；全文件另行运行，不把定向结果算作全文件通过。

farm-pests 6/1：单独失败用例最后 30 行定位到 test:93 的 CLI status=null；此前的存储重启、导入及回滚断言均已通过。上述 null status 的 spawnSync 限制已用独立探针确认 EPERM。未删测试、未添加 skip、未放宽任何原断言。

| 未完成文件 | 状态 | 后续命令 |
|---|---|---|
| wildlife | 全年长短推进对照所在文件，限时终止，没有全文件结果 | `node --test --test-isolation=none tests/wildlife.test.mjs` |
| agriculture | 含三年 × 20 种子的全文件，限时终止，没有全文件结果 | `node --test --test-isolation=none tests/agriculture.test.mjs` |

逐文件表使用 `node --test --test-isolation=none tests/<文件>.test.mjs`，各文件独立进程；农业定向用例另附 `--test-name-pattern='回放|重启|CLI'`。表中的 pass/fail 都是已完成进程的实测摘要，不能将农业定向结果替代全文件结果。

## 边界与后续

不改 `docs/架构设计/`、已审 `world/design/`、`dist/`、`docs/待办.md`、`docs/问题.md`。未读取 secrets.json，未操作任何非本会话进程。初始未跟踪 `.base` 保留。PROGRESS/CHANGELOG/当前状态由主会话统一更新。

最终路径自查仅含 engine/storage、三份测试与自动重导的 actions。`git diff --check` 通过。本会话 `.w8e10-*` 调试脚本和临时 PID 记录已删除；已结束本会话所有执行进程，停止进程对应的临时目录检查无残留。仅保留交接、性能数据和测试摘要。

180 日回归与性能数据已完成；剩余仅为上述验收与主会话审核事项。所有改动留在工作树，由主会话审 diff 后提交。

<!-- checks:start -->

| tests/<file>.test.mjs | pass | fail |
|---|---:|---:|
| a3-certification-receipt | 4 | 0 |
| a3-legacy-replay | 4 | 0 |
| a3-owner-ding | 15 | 0 |
| a3-owner-ji | 13 | 0 |
| a3-owner-wu | 8 | 0 |
| a3-owner-丙 | 12 | 0 |
| a3-owner2-G | 3 | 0 |
| a3-owner2-R | 17 | 0 |
| a3-owner2-T | 6 | 0 |
| a3-owner2-w | 9 | 0 |
| a3-producers | 9 | 0 |
| a3-summons-upkeep | 4 | 0 |
| action-registry | 7 | 0 |
| actions-catalog | 4 | 0 |
| advance-registry | 3 | 2 |
| agriculture (persistence cases) | 2 | 1 |
| arch-metrics | 4 | 0 |
| boss-cognition | 8 | 0 |
| boss-negotiation | 9 | 0 |
| bosses | 10 | 1 |
| chronicle | 6 | 0 |
| draw-water | 9 | 0 |
| engine | 22 | 0 |
| environment | 11 | 0 |
| event-size | 1 | 0 |
| farm-pests | 6 | 1 |
| home-permission | 3 | 0 |
| invariants/i16-event-primary-write | 2 | 0 |
| invariants/i31-total-order | 18 | 0 |
| law | 16 | 0 |
| ledger-stock | 6 | 0 |
| magic-area | 12 | 0 |
| magic-area-actions | 6 | 0 |
| magic-care | 25 | 0 |
| magic-growth | 12 | 0 |
| magic-message | 20 | 0 |
| magic-mind-space | 24 | 0 |
| magic-movement | 10 | 0 |
| magic-ritual | 29 | 0 |
| magic-water-earth | 18 | 0 |
| manufacturing | 8 | 0 |
| migrations | 3 | 0 |
| npc-crime | 8 | 0 |
| npc-delivery | 8 | 0 |
| npc-memory | 10 | 0 |
| npc-relations | 9 | 0 |
| npc-schedule | 12 | 0 |
| numeric-persistence | 1 | 0 |
| overfit-guard | 2 | 2 |
| pets | 10 | 0 |
| plugin | 7 | 0 |
| progression | 10 | 0 |
| public-opinion | 5 | 0 |
| r1-migration | 3 | 0 |
| repair | 10 | 0 |
| revival | 10 | 1 |
| rumor-route | 8 | 0 |
| runtime-invention | 6 | 0 |
| s3-offscreen-life | 4 | 0 |
| s4-documents | 9 | 0 |
| s4-filing | 9 | 0 |
| s5-04 | 17 | 1 |
| s5-05 | 16 | 0 |
| s5-06 | 20 | 0 |
| s5-09 | 18 | 0 |
| save-roundtrip | 6 | 0 |
| seasonal-migration | 9 | 1 |
| storage | 14 | 0 |
| summons | 8 | 0 |
| village-trade-live | 5 | 0 |
| w4-b1 | 37 | 0 |
| wildlife-awakening | 4 | 0 |
| wildlife-encounters | 8 | 0 |
| wildlife-society | 5 | 0 |

<!-- checks:end -->

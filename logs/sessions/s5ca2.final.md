# S5CA2 交接

三项目标已修复。受影响清单 64 文件全部按独立进程运行：61 文件通过，2 文件为子进程 EPERM，1 文件超过共同规则的单文件 40 分钟上限，后三项按规则交主会话沙箱外补跑。目标三文件、CORE、同步四件套和必保留不变量全部通过。

## 改动与根因

- `world/ontology/tags.json:22`：登记五个真实事件标签 `advance-refund`、`crop-disposition`、`harvest`、`lease`、`public_project`，含租赁/经营的上位词。使用点分别为 `server-plugin/finance-assets.mjs:140/155/166` 与 `server-plugin/public-projects.mjs:88`；动词、罪名没有缺项。未改闭合检查。
- `tests/numeric-persistence.test.mjs:30`：删去不再命中的 finance_profit 成本批次价格豁免。实际失败在 unused 断言，不是 unlisted 断言；当前推进没有未登记非整数。原写入 `server-plugin/finance-assets.mjs:375` 已在 K08 提交 `394a9b94` 从 `cost/quantity` 改为约分有理数（`savedCost`，定义在 341 行），本卡不重复修改写入者。现有 `tests/finance-assets.test.mjs:49` 覆盖 40/27 的购入、分次出售、JSON 往返和成本精确累计。
- `tests/daily-b2-exact.test.mjs:42`：保留订房实收 40 文的精确断言，把核对时点放在订房后；新增午夜补货凭据与过夜净增 37 文的精确断言。`server-plugin/npc-life.mjs:78` 实际消耗家户三份馒头，`server-plugin/shop.mjs:466/499/505/513/520` 补货、柜台注资并向公库实付 3 文。手算：馒头基价 2 × 稀缺下限 0.5 = 每份 1 文，40 - 3 × 1 = 37；两种睡眠场景均有这笔补货。保留玩家 120→80、只扣一晚、到次日卯时/完整 540 分钟、体力封顶、行囊与账本守恒。

## 历史核对

卡片所称“master 的 D04 两项为 todo、由 S5 转正”与 Git 内容不符：主 D04 用例由 `d0033214` 直接加入正式测试；D04.4 由 A3B `c777e8cd` 从 todo 转正。两项在 `master@3bbd7e0c` 都是正式用例。S5 W4 `c0659dcf` 仅将其他居民设为无钱，以隔离到店消费；后续家户消费仍会触发店主自己的真实补货，本次据此修正锚点，没有禁用 NPC 行为。

## 验收

- 三目标文件：ontology 5 pass、numeric-persistence 1 pass、daily-b2-exact 7 pass，均 0 fail。
- 直接相关消费者：finance-assets 12 pass、shop-restock 7 pass，均 0 fail。
- 已重导 `node tools/export-actions.mjs`，248 动作；与基线无内容差异，保留原 CRLF。
- 同步四件套：actions-catalog 4 pass、action-registry 7 pass、advance-registry 5 pass、arch-metrics 5 pass，均 0 fail。未设置 UPDATE_ADVANCE_GOLDEN，未重生成金快照。
- CORE：engine 22 pass、storage 14 pass、plugin 7 pass，均 0 fail。必保留 invariants i01/i02/i15/i16 全过，i31 亦过。
- 受影响命令：`node F:/dnd-tools/affected-tests2.mjs . 75cc53c2 WORKTREE 0`，清单 64 个 / 通过 61 个 / EPERM 2 个 / 长测未完成 1 个，无遗漏。详见 `s5ca2-affected.txt` 和逐文件摘要 `s5ca2-tests.txt`；每个文件独立 node 进程、TAP 摘要、TEMP/TMP=F:/dnd-tmp。三份清单外的直接验收文件 ontology、finance-assets、shop-restock 亦全部通过。
- 所有文件采用 `node --test --test-isolation=none --test-reporter=tap tests/<文件> 2>&1 | Select-String -Pattern '^# (pass|fail)|^not ok' | Select-Object -First 40`；失败细节仅读取单个失败用例末 30 行。
- `node tools/numeric-digest.mjs` 已运行，结果见 `s5ca2-numeric-digest.json`：full `4d59679c7658de092b7145971b356d0f7d95a19dfb2d87b399f227bd938bd337`，quiet `f8c8a48d3dd733700ae733cd5c650354b4176db1dfea174ee190852a9b7deed0`。本卡没有修改运行时代码，标签词表不由 loadWorld/引擎读取；没有数值写入语义变化。

## 沙箱外补跑

- `tests/npc-depth-batch-publication.test.mjs`：0 pass / 10 fail。已对“完整两卡同快照预演零写入，原子apply一次，精确路径/hash与全世界缺口保留”单独取末 30 行：`spawn EPERM`，在 fixture 的 `execFile`（50 行）即失败；该文件的子进程夹具/CLI 不能在本沙箱运行。
- `tests/overfit-guard.test.mjs`：2 pass / 2 fail。两项分别为 `world/actions synonyms of 4+ characters are not copied from the corpus`、`every allowlist entry carries a reason and still matches a real hit`，均在 `newSynonymHits` 第 70 行断言 git 子进程状态为 0 处失败（实际 null）。两个单例末 30 行均已核对；同参数直接诊断 `spawnSync('git',['show','master:world/actions/core.json'])` 得到 `{status:null,error:"EPERM"}`。
- 上述按用户“子进程类测试 EPERM 列给主会话外跑”的例外处理，没有跳过测试、修改防护或将其计为通过，也没有用同一环境重复跑整文件基线。
- `tests/s5-playthrough.test.mjs`：完整原命令实际运行 2411.9438928 秒（40 分 12 秒），仍无整文件摘要；按共同规则的长测上限停止并列给主会话外跑，摘要标为 exit=-1，不能算通过或具体失败子测。仅终止已记录的本会话 PID 13072，并在终止前核对启动时间仍为 2026-11-01 00:14:44 UTC；未改该文件或放宽其断言。

下一步：主会话代提交/合并，并在沙箱外用同一逐文件命令补跑以上三文件；本卡没有其余已知实现缺口。未生成 advance 金快照，也没有本卡引起的快照字段旧→新差异。

## 边界

最终 `git diff --check` 通过，改动路径仅以上三文件（18 行增加、4 行删除），无禁区改动。未提交；未动 storage 通用层、其他卡测试或原存档。原有未跟踪 `.base`、`.base-index`、`.base-src/` 保留。临时调试脚本已删除；调试 PID 59652、59784、57652、22572 均自行结束。长测只结束已记录的本会话 PID 13072，其临时目录 `F:/dnd-wt/S5CA2/.tmp/p13072-P725E8` 已核对绝对路径后删除；未终止其他进程。验收队列已退出。状态/PROGRESS/CHANGELOG 由主会话合并时更新。

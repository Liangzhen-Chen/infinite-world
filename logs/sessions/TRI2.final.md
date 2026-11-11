# TRI2 交接（2026-10-30）

工作树 F:/dnd-wt/TRI2，基于 5f757b6c，尚未提交。改动为 server-plugin/stock.mjs 和四个测试/探针文件；唯一生产改动是删除无人调用的价格读取点登记。没有需要改动 K15 锁定文件的情形。

## 根因、引入点与处理

ledger-price 登记：d381d02e（K08）把 business.mjs 的顾客现金读取改为 householdBudget，但 stock.mjs 原第 255 行仍留 business.cash 孤儿登记。删除旧键，将 business 的 SURVEY 分类改为委托读取。tests/ledger-price.test.mjs:417 现在直接断言全部剩余点均有覆盖，移除失效 business.cash 豁免；没有减少测试或放宽覆盖要求。

同一登记测试还缺 valuation.mjs:11 的基准估值校验（a550398d，W8-E6 leftovers）和 household-budget.mjs:393 的餐食机会成本读取（2d76b73d，K04），均补入 SURVEY。反方向上，labor-market、transport 已由 a550398d 转交 marketQuote/baseline 估值，medicine 已由 1a684e19（W8-D）改用市场报价，三者不再含 PRICE_WORDS，按原有反向登记断言移除陈旧行。调用点双向核查、模块分类和未登记点必抛断言均保留。

ledger-price 交易双读：一次买 40 份干粮触发 market.mjs:296 的深度拒绝，并非两种读法分叉。a550398d 收窄公共供给、排除私人行囊后，原交易批量不再合法。第一版拆八笔五份解决深度，却使每笔商税取整为零，原正额商税断言正确失败。最终在 tests/ledger-price.test.mjs:198 只读现货投影，按 max(retailFloor, floor(spotSupply×maxShare)) 选择当前最大合法批次，仍实际交付 40 份、逐笔比较两种读法的完整结果与补丁。修后通过，保留正额商税、借贷/受雇/钱庄、离屏价格面和账本对账全部原断言。

ledger-price 股份：financeFixture 原行囊为木料 100、燕麦 100、面包 100，重 200+50+15=265kg；b031bb76（W8-C）加入 carry.mjs:73 入囊闸门后，后续三份面包交易被拒。tests/ledger-price.test.mjs:375 只保留本例实际使用的原 100 份面包（15kg），不携带未用的木料/燕麦，随后仍买三份。股份成立和双读最终状态相等断言未变，实测通过。

s3 E05-4：1a684e19（W8-D）把 transport.mjs:488 的货损改为所在地 goods 市场估值，原探针仍要求目录基价，实测 14≠9。手算春季基准 3×0.9=2.7，公仓可售 8000−5220=2780，加商家 50 得供给 2830，需求 5220，品质/修正 1；floor(3×2.7×5220/2830)=14。tests/probes/run-001/e05.mjs:73 改严格锚点 14；货损 3、实到 7、在场支付、分次赔付、幂等和守恒断言均保留。

s3 E12-2：tests/probes/s3-finance.mjs 的一笔十份面包同因 a550398d 收窄供给而被拒。公开存量 20，10 超过 max(5,20×0.3)=6。第 16 行改两笔真实零售各五份，第二笔仍符合 max(5,15×0.3)=5，总交付仍十份。保留实际同意、1000 本金、360 天十二期、90 天逾期及幂等断言；实测逾期三期、应付 376、尚欠 1503。E12-3 原有部分判定未扩入本卡。

s3 E18-4：60f061f1（K05）在 business.mjs:583 要求开张前已有柜台，旧情境仅租铺面即开张。tests/probes/s3-business-equity.mjs:67 补原生 business_counter_open，零资本开户，保留后续花尽钱袋触发破产的前提。债务、会籍、知情/传闻、除名和账本守恒断言均未改，实测通过。

引入点均沿 Git first-parent 实际 diff 核对，未 checkout 旧版本。E04 无需修复，独立及整文件均通过。失败属于登记失同步或已批准规则变化后的旧情境/锚点；没有发现须修价格双读实现的分叉。

## 验收

各测试独立一个 Node 进程、每进程一个文件，均用 --test --test-isolation=none --test-reporter=spec；TEMP/TMP=F:/dnd-tmp，只取摘要及单个失败尾段。

tests/s3-run001.test.mjs 整文件 4 pass / 0 fail；四组原门槛及脚本异常拒绝保留。tests/s3-g18.test.mjs 2/0。

CORE：engine.test.mjs 22/0，storage.test.mjs 14/0，plugin.test.mjs 7/0。

守恒保证：tests/invariants/i01-conservation.test.mjs 2/0，i02-non-negative.test.mjs 3/0，i15-single-account.test.mjs 2/0，i16-event-primary-write.test.mjs 2/0。

同步：已运行 node tools/export-actions.mjs，目录内容与 HEAD 相同，恢复工作树 CRLF 后无 catalog diff。actions-catalog.test.mjs 4/0，action-registry.test.mjs 7/0，advance-registry.test.mjs 5/0，arch-metrics.test.mjs 5/0，均逐文件运行。金快照未改、未重生成、未设 UPDATE_ADVANCE_GOLDEN，无字段差异需审核。未改数值计算；numeric-digest.mjs 未运行，不宣称该命令通过。

ledger-stock.test.mjs 正向选择资源键/批次/预算/性质/源汇五项，5/0；农业季长项未运行。

ledger-price 修复后的登记及完整交易两项 2/0；最后在同一文件的独立进程正向选择全部非农业项，包含已修改的探针汇总，最终 11 pass / 0 fail（PID 46684）。所有现存读取点均被开账读到，探针新旧读数无分叉；汇总不豁免任何现存点。选择参数为 --test-name-pattern=^(价格输入点登记|读取规则|区域材料|价格双读对照：交易|定点|探针汇总)，仅未执行原农业季子测。

分诊过程的 ledger-short-positive.out 为 8/2、ledger-fixed.out 为 0/2，均是修复前的中间结果，未当成通过。对应失败已在上述根因段记录；最终证据为 TRI2-ledger-coverage.out 的 11/0 和 TRI2-s3-final.out 的 4/0，其余逐文件结果见同前缀验收日志。

## 外跑、偏差及边界

ledger-price 整文件主会话实测 6889 秒。依共同规则“已知超过 40 分钟的长测不跑”，农业季 215 天逐日推进及整文件组合留主会话外跑。ledger-stock 农业季长项也未跑，不能把五项性质检查写成整文件通过。外跑仍一个文件一个进程，保留原断言与金快照。

早期排除农业用了负向名称正则，Node 祖先名称匹配使其实际包含长项；约 23 分钟后结束本会话自启并记录的 PID 47840，未计验收，改用正向列举名称。初次 s3 PID 616 为转短分诊中止，随后已补完整文件通过。仅结束这两个已记录的自启进程，未按名称或批量结束进程。

临时诊断脚本和输出已删除，保留验收日志与本报告。未提交、未部署、未操作原存档；未触及 K15 锁定文件、docs/架构设计、world/design、dist、docs/待办.md、docs/问题.md。原有未跟踪 .base 未改动。


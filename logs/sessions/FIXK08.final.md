# FIXK08 交接

代码未提交，交主会话代提交；未部署、未操作原存档。

## 根因与修法

- 远程补货：`server-plugin/remote-generation.mjs:276,449` 只派生 route 补货条目与掌柜开架库存，缺少 K08 要求的实际持货人与已知报价；`shop.mjs:402` 因而只能记零到货。现按每间生成商铺的补货行派生有限的到场行商，开局库存走原 genesis 账本，产地沿原 row.from，向柜台提供有限报价。手算：掌柜 amount + 行商 (maximum−amount) = maximum；日期不补生货物。同地报价仍经现有储备、实物、双方同意、钱货转移和报价额度检查。
- 正午接货：原 `shop.mjs:549` 正午仅领取运单，在场行商报价只在午夜被尝试，卖方可能正在睡眠。正午接货现在也消费真实在场报价，读取掌柜当刻的真实主观状态；未到场、睡眠、未知报价不成交。同一柜台本次观察按现有 cursor revision 复用，任何实际写入后重新读取，不跨人或跨时刻缓存。新专项手算：7份货中成交2份×1铜，行商7→5、店主0→2，店主100→98、行商0→2；三个拒绝分支均不变。
- 测绘：旧 `tests/works.test.mjs:107` 在测绘跨过正午后强行摆回买方，却没有结束陈柏真实的采购往返（`business.mjs:820` / `npc-obligations.mjs:43`）。改为真实等待已登记往返结束，再给足本地步行时间；初始200铜在首次开账前设置，之后不改账本钱袋。地图归属与收益断言保留。
- F014：旧 `tests/works.test.mjs:143` 的写作240分钟跨过真实客流，林穗从卖饭得到收入，20÷4<8的贫穷读者前提失效。先真实等到12:30再建立原钱袋夹具；首版17:30，赶在陆青18点出门前，三版至19:30。原2买家、16铜收入、18余册及再版/守恒断言全部保留。
- 复用学习：旧 `tests/w2-reuse-learning.test.mjs:133` 假定长时间研读期间陆青钱袋不变，实际正午买4份 `item_bread` 支出4铜；不是书架被买空。手算：200+中级书价80−4=276（旧期望280），高级书则200+200−4=396（旧400）。先真实等待到13点再买书；最长两次研读2×480=960分钟，结束早于次日正午。原失败成本、学会、零熟练施法与钱袋断言保留。

## 文件边界

仅改两个生产模块与四个测试文件。`shop.mjs` 改动函数仅 `receivedRouteStock`、`restockShop`、`advanceShops`。未改 npc-life、household-budget、npc-autonomy、storage、advance-registry 或 world 内容，未触及题面禁区。`docs/actions.json` 已重导，无实质 diff。

## 验收

affected-tests2：`.base=8c4215c2`，WORKTREE，深度0，最终清单49文件；清单存 `FIXK08-affected.txt`。每个文件独立 node --test 进程，仅保留摘要；进程 PID 存 `FIXK08-pids.txt`。本清单没有 gate-skips 整文件或子测排除项。`s5-playthrough` 运行2414秒仍未完成，按共同规则“单文件超过40分钟的长测不跑，列给主会话外跑”停止，仅结束本人启动并记录且核对启动时间的 PID 48732；未计通过，待主会话外跑。已只读确认其测试自建临时档曾完成180天生长推进并有后续收割、卖粮，未操作原存档。

最终49文件：45通过，3文件与 `.base` 同败，1文件长测外跑。基线对照使用同一份 `.base` 源码与它自己的测试文件，逐文件独立运行；同败用例名称和结果均一致：

| 文件 | 本树 pass/fail | .base pass/fail | 说明 |
| --- | --- | --- | --- |
| invariants/i31-total-order | 17/1 | 17/1 | 同一“真实引擎10天一次推进与逐日事件序列”失败 |
| overfit-guard | 2/2 | 2/2 | 两个读取 master 动作目录的用例失败；单例末30行及只读子进程诊断确认 `spawnSync git` 返回 `status:null,error:EPERM`，需主会话沙箱外补跑 |
| s5-04b | 6/2 | 6/2 | 同一“柜台不足形成工资债”“NPC店主一周补货/改价/招工”失败 |

最终代码验收：remote-generation 5/0、works 8/0、w2-reuse-learning 17/0；新正午专项所在 s5-law-periodic-market 23/0；同名消费者 shop-restock 7/0。CORE：engine 22/0、storage 14/0、plugin 7/0；四项守恒/非负/单账户/事件主写检查均过。重导 actions 后，同步四件套：actions-catalog 4/0、action-registry 7/0、advance-registry 5/0、arch-metrics 5/0。逐文件结果存 `FIXK08-tests.tsv`、`FIXK08-followup.tsv`。

金快照未改写、未重生成，无字段差异，故不生成 golden-table。numeric-digest 最终代码与完整 `.base` 副本逐字段相同，结果存 `FIXK08-numeric-current.json` / `FIXK08-numeric-base.json`。未跑全量、build:release 或真实模型试玩；没有删除测试、放宽断言或改变既有 TODO。

下一步：主会话沙箱外补跑 overfit-guard、s5-playthrough；I31 与 s5-04b 已有同败对照，不属于本卡新增回归。本卡自建 `.fixk08-base` 副本、运行脚本及被停止测试的临时档均已清理；`.base` 与环境提供的 `.base-src` 基线源文件保留，未删除其他会话准备的元数据。临时生成的 `.base-index` 已删除。`docs/actions.json` 已恢复原有 CRLF，无实质 diff。

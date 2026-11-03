# S5CB 交接

当前：本卡实现完成，三个目标文件、CORE、同步四件套均通过。受影响清单43文件：41通过；overfit-guard因Git子进程EPERM受阻；s5-playthrough超过40分钟长测上限，已停止，交主会话外补跑这两个文件。未提交、未部署、未改禁区。

## 根因与改动

- `server-plugin/shop.mjs:435–466`：K08 到场补货原本只读钱袋预算、直接从钱袋付款；补齐已有柜台资金、必要注资的本人决定、柜台付款和地方基准参照值。只让额外需要注资的部分占用家户现金预算；原先的库存、到场、知情、双方同意、家庭保留及报价额度检查均保留。
- `server-plugin/shop.mjs:558–560`：正午到场补货绕过周期调价；实际成交后沿既有 `repriceShop` 消费本批成本和参照值。
- `tests/s5-04b.test.mjs:54`：供应款收款人沈度之后花 4 铜买面包，旧锚点把东家钱袋收入漏掉。手算：4970+4=4974；工钱应得 30、柜台仅付 5、欠薪 25，仍投诉立案并离职。新增销售实物与金额断言。
- `tests/s5-04b.test.mjs:109`：原周经营前提没有真实供应者，却预期午夜生成外路货。改为两位既有 NPC 已带有限现货、店主已收到报价；不写世界内容，不预填决定。黏土 2×4=8、参照 2×3=6，1.2×8/6=1.6 按原上限封至 1.4；干粮 2×3/2=3。首班 45/(1+300/3000) 向上取整为 41 分钟，工资 ceil(30×41/480)=3。柜台最终 30−后续进货6−工资3+阿燕实际购面包3=24；林穗钱袋450−首批注资3−营运注资30=417。
- `tests/s5-09.test.mjs:215`：FIXK08 新增行商也是远方郡聚合账户的真实成员。补货款 75+64+174=313 是内部转账，不能再从全郡1163铜扣除。店主分别余297、204、111，行商分别持75、64、174；全体仍1163。牛奶保鲜1天，创始的3+3份已过期，并无自动新货。原有逐次钱货守恒、份额、名册、只开一次创始账、存档保护均保留。
- `tests/a1-lt-scenarios.test.mjs:60`：10:05等待120分钟会落入K08实际午间服务占用；本例只考查同日成交深度。改为等待60分钟，在11:05再次买；保留原深度、整单一次取整和成交账断言，并增加等待成功断言。
- `tests/s5-law-periodic-market.test.mjs`：新增钱袋0而柜台有100资金时，2份×3/2仅从柜台付3、余97的回归；补充到场成交的参照值与正午调价精确断言。

## 验收

- 命令统一设置 TEMP/TMP=F:/dnd-tmp，每个测试文件各用一次独立 `node --test --test-isolation=none --test-reporter=tap`；仅过滤摘要和失败子测。TAP避免当前PowerShell对Unicode标志解码后无法匹配摘要。
- `s5-04b` 8/0；`a1-lt-scenarios` 14/0；`s5-09` 18/0，均为完整文件。
- CORE：engine 22/0、storage 14/0、plugin 7/0。
- 已先运行 `node tools/export-actions.mjs`，docs/actions.json无内容差异；actions-catalog 4/0、action-registry 7/0、advance-registry 5/0、arch-metrics 5/0。
- 受影响清单43个，见 `S5CB.affected-tests.txt`；其余结果见逐文件摘要 `S5CB.checks-1.log` / `S5CB.checks-2.log`。无自行排除测试。
- `overfit-guard` 当前与.base同名两项失败：`world/actions synonyms of 4+ characters are not copied from the corpus`、`every allowlist entry carries a reason and still matches a real hit`。诊断原命令 `spawnSync('git',['show','master:world/actions/core.json'])` 得到 `status:null, error:EPERM, syscall:spawnSync git`；第二个子测失败又影响白名单子测。基线复跑以启动参数中的内存FS钩子仅将shop文本读取指向 `.base-src/server-plugin/shop.mjs`，其余输入未改，两项名称逐一相同，结果2/2。见 `S5CB.overfit-base.log`。需主会话沙箱外补跑，不改测试或断言。
- `s5-playthrough`：按完整文件启动，40分29秒仍未结束，未取得最终断言结果，不能记为通过。按共同规则“单文件超过40分钟的长测不跑，列给主会话外跑”停止。仅结束本人启动且预先记录的PID58376：先以父命令包含本卡唯一日志名确认归属，记录PID/创建时间/原命令；停止前再逐项核对，确认运行≥2400秒后调用该PID的terminate。父验收循环记录退出15。没有按名称结束进程；没有结束其他会话进程。记录见 `S5CB.processes.log`。该项是时限未完成，不是已定位的断言失败；需外补跑完整文件。
- i01/i02/i15/i16/i31、全部s5-law文件及shop-restock均通过。已完成范围没有发现本卡新增失败；跨季试玩剩余路径尚无验收结论。
- numeric-digest：当前树与仅将shop模块替换为.base原文的同树基线逐项相等，state full/quiet及全部数值函数摘要均未变。原始结果见 `S5CB.numeric-current.json` / `S5CB.numeric-base.json`。临时基线加载钩子已删除。
- advance金快照未改且验收通过，无字段变化表。

## 边界与交接

实际扩展为shop到场补货两个现有接点及其已有机制测试；均直接服务本卡原有柜台/调价要求，没有新API、内容或模块。主会话负责提交和全局状态文档。临时诊断脚本和基线加载钩子均已删除。

最终改动只有 `server-plugin/shop.mjs`、`tests/s5-04b.test.mjs`、`tests/s5-09.test.mjs`、`tests/a1-lt-scenarios.test.mjs`、`tests/s5-law-periodic-market.test.mjs`；未触及docs/架构设计、world/design、dist、docs/待办.md、docs/问题.md。docs/actions.json已重导并恢复原有行尾，没有内容差异。`.base`、`.base-index`、`.base-src/`为开工已有交卡设施，未删除或修改。没有新增跳过、TODO或放宽断言。

# FARMHUNT 交接

基于 s5a@78dd9344；未提交。实际内容改动仅 server-plugin/farm-pests.mjs、tests/farm-pests-hunt.test.mjs。

## 根因与处理

引入点是 658fa40d（S5-06 生态），不是 K01–K16 或 FXM。wildlife.mjs:165–166 调用 ecology-dynamics.mjs:46–50 的首领领地容量系数，田鼠容量从24变成 floor(24×0.6)=14。真实追踪及击杀使狐狸野生存量3→0，三个实体均死亡；farm-pests.mjs:29 因无捕食者停止捕食，田鼠升到14，但原第50行仍按完整栖地的18/24只门槛计算，14<18，田害始终为零。agriculture.mjs:193 调用田害计算，147–168行按累计损伤扣收成并记账，后段没有缺失。原失败断言为 hunt 原第29行、现第35行的 pestLost 大于比较：0>0；实际收成也相等。

farm-pests.mjs:49、56–57 将原门槛作为完整栖地密度基准，按现有领地剩余空间比例换算密度；保留种群容量、迁徙、真实捕食、损伤封顶及成熟冻结。未改农业账本、家户、商店、运输或世界数据。

手算：14/0.6=23又1/3只的完整栖地等效密度；round(12×((14/0.6−18)/(24−18)))=11基点/日。新增用例以实际首领 controls 验证11基点，并验证清除害兽、关闭领地持有只去除未来压力，不退回已累计11基点。原年度用例的严格田鼠增加、损失增加、收成下降及守恒断言全部保留；增加潜在收成相同、减产恰等于新增损失、无补粮断言。

## 实测

| 规律与分支 | 年末田鼠 | 实际收成 | 害兽损失 | 潜在收成 | 补粮 donated |
| --- | ---: | ---: | ---: | ---: | ---: |
| 基线，保留狐狸 | 4 | 18819 | 0 | 18819 | 0 |
| 基线，真实击杀狐狸 | 14 | 18819 | 0 | 18819 | 0 |
| 修复，保留狐狸 | 4 | 18738 | 81 | 18819 | 0 |
| 修复，真实击杀狐狸 | 14 | 15091 | 3728 | 18819 | 0 |

修复后的收成差3647=3728−81；无退款或补粮。两个分支的播种、天气及潜在收成没有混淆减产归因。

原始单文件首次计时1806.948671秒（30分7秒）；修复完整文件1807.8906242秒（30分8秒），2 pass / 0 fail、node_exit=0。首轮默认 reporter 与摘要过滤不匹配，未保留断言值，故另用 TAP 补跑基线原失败子测，1823.8684194秒，0 pass / 1 fail、node_exit=1，得到上表基线值。仍建议保留 S7 登记，未修改 gate-skips。

基线对照采用提供的 .base-src/server-plugin/farm-pests.mjs，通过仅替换该模块源码的临时加载钩子执行；其余生产文件没有内容差异，未使用 git checkout。加载钩子没有预加载业务模块。基线 hunt 只选取原有失败子测；修复验收运行了完整文件，未跳过或放宽任何测试。

## 验收

所有文件独立 node --test --test-isolation=none 进程运行，TEMP/TMP=F:/dnd-tmp，TAP 输出仅保留 pass/fail/not ok 摘要；仅为定位 CLI 失败查看了该单一用例末30行。

运行 node F:/dnd-tools/affected-tests2.mjs . 78dd9344 WORKTREE 0：清单32文件 / 通过29 / 失败2 / 长测未完成1。

- CORE：engine、storage、plugin 全部通过。
- 同步：先运行 export-actions；actions-catalog、action-registry、arch-metrics 通过。docs/actions.json 无规范化内容差异。
- advance-registry：修复树3 pass / 2 fail，失败为 full、quiet 两个快照断言；基线5 pass / 0 fail。本卡有意变化已逐字段列在 FARMHUNT-golden-table.md，未重生成金快照、未设置 UPDATE_ADVANCE_GOLDEN。
- overfit-guard：两树均2 pass / 2 fail，逐子测同为“world/actions synonyms of 4+ characters are not copied from the corpus”和“every allowlist entry carries a reason and still matches a real hit”。Node 启动只读 git show 探针返回 EPERM、status=null；需沙箱外补跑。
- 五个 invariants、全部16个 s5-law-*、quest-sources 均通过。
- s5-playthrough：2413.6008838秒仍未完成，按共同规则40分钟上限停止本会话已记录 PID 10300；没有通过结论，也没有失败子测结论，交主会话外跑。
- 额外同名模块 tests/farm-pests.test.mjs：两树均6 pass / 1 fail，逐子测同为“田害与实际巡守在重启/导入/回滚中保留，CLI仅写独立副本”。单例末30行定位第93行 CLI status=null 而非0；子 Node 探针返回 EPERM。其他六项通过，CLI部分需沙箱外补跑。

numeric-digest：全部 functions 摘要相同；full/quiet 的 state 摘要因田害字段改变。golden-dump / golden-diff 对照仅有 cohorts[*].pestDamageBps 与 lastReport.pestDamageAddedMaxPercent 的差异，所有字段旧→新及原因见相邻差异表。

## 交回主会话

审核田害语义与金快照字段表后，由主会话统一重生成快照；沙箱外补跑 overfit-guard、farm-pests 的 CLI、s5-playthrough。没有为门禁改断言或伪造通过结果。

git diff --check 通过。禁区 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md 均无改动；未部署、未操作原存档、未读取 secrets.json。未运行全量测试或发布构建。保留原有 .base、.base-index、.base-src；临时调试脚本、转储、PID记录及摘要文件已删除，已停止长测的本会话临时目录亦已清理。


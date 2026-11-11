续做 I1（正文 ti1.body.md）。共同规则已改：“可改”文件只是预估，不是白名单，只有“不得改”才是禁区（见 s5law-common.md 第 5 行）。

## 文件所有权（追加）
server-plugin/engine.mjs（:290 附近新开局 genesis 钩子）和 business.mjs（:769/:780 按组购买、按组需求）归本卡。这两个文件现在没有其他在做的卡。
- engine.mjs：只加开局经济开账接点，不改其他开局逻辑；
- business.mjs：只把单账户、全镇需求换成按组账户与按组需求，同一套到店成交流程，不另开第二套。
I3 以后在此基础上接线。其他禁区不变。

## 验收
同 ti1.body.md，全部要做：town-income 测试、30 日审计、性能、受影响清单。advance-registry full/quiet 两个子测在 t-tfa 上本来就失败，按子测名与 t-tfa@8bd7d0ba 对照，只报新增差异。汇报 ≤300 字，写入 TI1-final.md。

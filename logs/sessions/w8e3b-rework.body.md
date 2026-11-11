# W8-E3 返工（续你上一轮）

主会话审了你的 diff。耕作面积统一事实、淋湿/干燥、人物面板这几部分接受。下面三处要改，并放开对应文件。

## 1. D32⑤ 伤愈：只留一条回血规则（打回重做）
你在 body-needs.mjs finishSleep 里翻 `d.patches` 找"固定回血写入之前的 HP"再覆盖，还加了 `healthEnabled:!engine.replaying||...` 复演分支。两点都不接受：
- **规则只一版**：不能先让旧规则 +1/30 分钟写一遍，再用补丁回放撤销重算。
- 本项目不做旧存档/复演兼容，也不加复演判断分支。

改法：
- **现放开 server-plugin/engine.mjs**，只限睡眠/休息回血那一处（engine.time 里每 30 分钟 +1 生命的位置，grep 确认）。
- 在源头把休息回血改为一个函数：
  - 有伤情记录时，按 health.json wound 病程与 health:recoveryRate 闭式计算（沿用你的 (1−rate)^(天数) 分段做法）；
  - 没有伤情记录时，按原来的速率。两者在同一个函数里分支，不再有第二处写 HP。
- 删掉 body-needs.mjs 里的 patches 嗅探、replay 分支，以及 beginSleep 为此加的 hp/patchStart/healthEnabled/wounds 字段。
- 金快照若因此变化，按"字段｜旧→新｜原因"补进 w8e3-golden-table.md，不重生成。

## 2. D14 草药分种与季节密度：做
放开你在交接里列的文件：server-plugin/sites.mjs、world/meta/items.json、world/geo/locations.json（只追加或搬移数据，不改已有数值）。
- 分种（车前、金银花等以目录为准）；
- 每种的季节密度和再生各自独立；
- 采集读取它们；
- 对应 todo（daily-b2-mechanisms.test.mjs:72）转正式用例，带手算锚点。

## 3. 淋湿文字回执：做
放开 server-plugin/applied-effects.mjs、server-plugin/action-text.mjs（只限加淋湿/干燥的回执文字）。

## 其余要求不变
- 共同规则见 F:/dnd/logs/sessions/w8e-common.md。
- 逐文件跑：w8e3-consumers、daily-b2-*、medicine、weather、environment、a3-body、engine、advance-registry、arch-metrics、numeric-persistence。
- agriculture.test.mjs 很慢，不必等它；写明未跑。
- 汇报 ≤300 字。

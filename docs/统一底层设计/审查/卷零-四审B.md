模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷零 第四版 · 四审 B（最后一轮）

对象：F:/dnd/docs/统一底层设计/卷零-覆盖表.md（1232 行）。
方法：只做静态阅读。五类扫描模式用 grep -rnE 在 F:/dnd 的 server-plugin、extension、tools、world 下复跑（排除 node_modules、logs、.git；本机没有 rg，等价处理）。没有运行任何脚本。

## 结论：有条件通过（只剩一处小的登记补漏）

N1 已全部落实，142 处计数逐格对上，两条口径分得清楚，AI 文字的屏蔽词拒收仍在。剩下一条机械性补漏（见第五节）：几行 import 语句在扫描里出现，但表里没有对应行。补上即可，不涉及方案。

## 一、N1 是否落实

| 点名位置 | 落实情况 | 表内位置 |
|---|---|---|
| extension/runtime.js:228 | 已落实：改读 `channel==='ooc'` | 3.5.3b(e) 的 runtime:228 行 |
| runtime.js:535–537 | 已落实：535/536 改读 `review.turn` 与 `channel`；537 的 `review.tail?.args??parsed.args` 双来源改为唯一来源，无 `??` 回退，缺失即不执行并显示“未映射”重请 | 同上 runtime:535/536、537 行 |
| runtime.js:541（延伸项） | 已落实：为 pending 合成 `extraMinutes:0` 的写法，改为 `status:'pending', turn:null`。我核对代码，541 行确有 `extraMinutes:0` | 同上 runtime:541 行 |
| consistency-evidence.mjs:161 | 已落实：改读 channel。197 的 `<q who>` 抓取、201 的“玩家原文+草稿”拼检索输入也补进了表 | (c) 块 ce:3/161、197、201 |
| consistency-review.mjs:137 | 已落实：`context.channel=input.channel` | (b) 块 cr:137 |
| turn.mjs:34 fallback | 已写明删除，缺字段即错误代号重请，不给默认值（也同步到 consistency-service:255/256/306/308） | turn:34/35 行；“不填默认值”段 |

## 二、复跑五类扫描

| 模式 | 我的命中 | 表中数 | 对账 |
|---|---:|---:|---|
| 1 场外判定 | 29 行（server-plugin 14、extension 6、tools 9），分文件数与表中一致 | 29 | 完全一致 |
| 2 尾注与 `<q>` 标签 | 36 行 | 39 | 我这条正则对 `<q who=`（带转义的字面）漏匹配 5 处（cs:161、cr:64、ce:197、message-view:6/14），表中这几行经人工读码确认存在。我多出 4 行来自 tools/replay-fixtures 下的 manifest.json 与 sideband JSON（回放夹具数据，不是代码，不需处置）。两边都对得上 |
| 3 尾注回退 / extraMinutes | 21 行 | 21 | 一致。其中 extension turn:47 是 `parse` 函数里组装 `args` 的返回行，被 turn:37 与 40/41 两行的“解析额外/地点/在场”覆盖，可接受 |
| 4 blocklist | 123 行（server-plugin 13、tools 100、world 10） | 122 | world 多出的那 1 行是 world/drafts/w1/…/publication-source-files.json 里的清单条目（数据，不是代码）。server-plugin 的 13 行与表中完全一致 |
| 5 playerText 当 query | 2 行（cs:262/263） | 3 | 表中的 cs:264 是 `playerText:record.playerText` 整段传入，正则写法不同没匹配，人工核对确认。传播点 ce:161/201 也核实 |

没有发现表中遗漏的运行时调用类别。我还额外找了不叫 blocklist 的读取（realPeople、blocked 变量）：server-plugin 里没有其他读取点。

## 三、142 处计数对账

按表格逐格点数，全部成立：
- 来源：30+67+18+3+4+20 = 142。
- 移出：15+7+1+0+0+0 = 23。
- 改代号：10+(53+5)+16+3+0+15 = 102。
- 删除：5+(0+2)+1+0+4+5 = 17。
- 总计 23+102+17 = 142。
- 各块行数我逐行点过：cs 18、cr 补 7、ce 3、pop 4、ext 20，与表一致。“3.5.3b 共 52 = 改 39+删 12+移 1”也核对无误。
- §6（L1157）、§7（L1209）、§8 的 142 与 3.5.5 一致，没有旧数残留。
- 口径说明：这里的“处”是按合并后的行计（表中说明合并行 13 条），不是物理行号数。这点已在 3.5.6 写明，可以接受。

## 四、两条口径

- **AI 文字走“入库前守门 + 显示闸”：保留且写得清楚。** 3.5.1 的“屏蔽词分两种对象”（L790 附近）写明：AI 自由输出的叙述文字（草稿、完整档正文）仍由第一道守门输出 `reject:blocklist`，不入库、不进哈希、不进提示，重请有上限，显示闸兜底。落实在 cs:150/259/260/265、cr:256/257、pop:371、pop:409 的完整档半边，以及 3.5.6 末段。
- **程序生成的名字走“离线校验 + 显示闸替换”：** 只存成分代号，字库在 tools 离线校验（3.5.3c 的离线脚本为合规位置），运行时不读 blocklist.json、不换种子、不写回 state。这条只管生成名，不会误伤 AI 文字。
- 两条口径之间没有互相吞并或混写的行。pop:409 一行同时写了两个半边，分得清。

## 五、必改（1 条，机械性）

### N2　几行 import 在扫描里命中，但没有对应的表行
- consistency-service.mjs:6：`import {parseTurn, normalizeReplyProtocol} ...`（表里只有 cs:7 的 isOutOfCharacter import）。
- extension/runtime.js:2：`import { parseTurn, ... }`（表里只有 runtime:7）。
- extension/message-view.mjs:1：import（表里只有 6/14/35/103）。
- extension/turn.mjs:31：我没有逐行读，但扫描 2 列出了它，表里 turn:30 与 turn:32 之间没有这行。

处理：把这四行并进已有行的写法（例如“cs:6/7 imports 删除”“runtime:2/7 删除”“message-view:1 删除”“turn:30/31”），按“删除”计。总数会从 142 变为约 145，删除从 17 变为约 20。同步改 3.5.5、§6、§7、§8 的数字即可。

## 六、建议（不阻断）

- 生成名在 state 里只存成分代号后，给 AI 的提示里引用的名字应取经过显示闸之后的 label，不要用未经处理的字库原字，否则字库更新后命中的名字仍会进入提示。请在 3.5.6 的第 3 条加一句。
- 重请上限值在规则表里的具名条目，请在卷二登记时给出名字，各类 `reject:*` 共用一个还是各自一个，写一句。

审查 B 四审 · 2026-11-13

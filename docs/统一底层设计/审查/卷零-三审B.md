模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷零 第三版 · 三审 B

对象：F:/dnd/docs/统一底层设计/卷零-覆盖表.md（1135 行，§8 为修订记录）。
方法：只做静态阅读，逐条到 server-plugin 与 extension 核对 file:line。没有运行任何代码。

## 结论：有条件通过

复审提出的 R1–R3 全部落实。107 处的计数能逐行对账。剩 1 条小的必改：回退默认值的消费方和场外判定的几个调用点没有列全，删掉 turn.mjs:34 之后会留下隐性依赖。

## 一、R1–R3 逐条核对

| 编号 | 判定 | 位置与核对 |
|---|---|---|
| R1 两道闸 | 已解决 | L788–795：第一道是 `boundary:input` 的 AI 输出入库前守门，输出 `reject:blocklist`、`reject:minor_romance`、`reject:id_leak`。命中的内容不入库、不进状态哈希、不进后续提示。重请有上限，上限值在规则表。第二道是显示闸，只输出 pass/replace/block，不进哈希。population:407/409（L827–828）、cr:240/256/257（L880、890、891）、cs:259–265 同步改为两道闸，并写明保持“生成时拒收”的强度。扫描断言见 L955：被拒内容不得出现在存档、哈希与提示中。 |
| R2 补全与不填默认 | 大部分解决，见 N1 | L902–928：补了 cs:159、cs:262/263 与 extension 四处。turn.mjs:34 回退值已写明删除，`extraMinutes`/`location` 必填，缺失即“未映射”重请，不准填默认 10 或 0（L906、L918、L919）。L955 的扫描项要求 turn.mjs 不得保留 fallback。 |
| R3 数字统一 | 已解决 | §8 L1131–1135 与 §3.5.5 统一为 107。 |

## 二、107 处计数对账

逐格核对，全部成立：
- 移出规则层：15（散点）+7（cr）+1（cs:259–265）+0 = 23。
- 改成只读固定代号：10+53+12+4 = 79。cs 的 12 项为 75、159、161、243、251、262、263、267、283、285、299、304；ext 的 4 项为 turn-contract:21、turn:32/37/97。
- 删除：5。
- 按来源：30+60+13+4 = 107。cs 13 行逐行点数无误。
- 接手方：移出 23 = 输入边 17 + 两道闸 6，核对一致。六处场外判定读 `channel` 的说明（L927）也对：cs 五处加 turn-contract:21。

## 三、抽查代码

- **cs:159**：`if(!isOutOfCharacter(input.playerText))delete ledger.debts;`，吻合。读 `channel` 的处置对。
- **cs:262/263**：分别是 `reviewNpcKnowledge(...,{query:record.playerText})` 与 `reviewHistoricalEvidence(...,{query:record.playerText})`，吻合。改为 `topicCode[]` 与 `mentions:[entityId]` 的处置对。
- **turn.mjs:34/35**：`const fallback={...extraMinutes:minute>startMinute?0:10...}` 与 `invalid=warning=>({valid:false,...args:fallback})`，吻合。
- **其余 extension 行**：turn.mjs:32（尾注正则）、:37（属性正则）、:40（`/^(\d{1,5})分$/`）、:95/97（`fullyTimedWait`）、:104/108（`normalizeReplyProtocol` 调用 `fullyTimedWait`）、turn-contract.mjs:21，均吻合。

## 四、必改项（1 条）

### N1　回退默认值和场外判定还有几个调用点没有列入，删 fallback 会留下隐性依赖

下列位置我 grep 到，表里没有处置：
- **extension/runtime.js:535–537**：
  - `parseTurn(finished.text,{...})` 之后用 `review.tail?.args ?? parsed.args` 去提交 `world_turn`。
  - `parsed.args` 在尾注无效时就是 turn.mjs:34 的 fallback，即默认 10 分钟。
  - 所以仅删 turn.mjs:34 不够，runtime.js 这条提交链也必须改为只读结构化 `turn`，缺失即重请。
  - 若不列入，实施时可能保留一个“`parsed.args` 兜底”的暗默认。
- **extension/runtime.js:228**：`isOutOfCharacter(currentUser)` 决定拒绝工具调用。同样要改读 `channel`。
- **server-plugin/consistency-evidence.mjs:161**：`if(!isOutOfCharacter(query))return [];`。
- **server-plugin/consistency-review.mjs:137**：`outOfCharacter:isOutOfCharacter(input.playerText)`。
- **extension/prompt.mjs:37**：正则定义本身。表里写“退役”，但没有作为一行计数。

处理办法：
- 把以上五处作为行补进 3.5.3b，处置沿用“改读 `channel` 代号”，runtime.js:535–537 写明“只收结构化 `turn`，不用 `parsed.args` 兜底”。
- 总数 107 随之上调，同步改 L791、L943–955、§8。
- 卷十二的断言加一条：全仓不得再引用 `isOutOfCharacter`、`parseTurn` 的 fallback 字段。

## 五、建议（不阻断）

- 重请上限值要在规则表里有一个具名条目，且各道闸、各类 `reject:*` 是共用一个上限还是各自一个，写在 3.5.1 一句话里，避免实现时各写各的常数。
- 第一道守门读的是语言包词表并做文字匹配，属于 S2 例外。请在 S2b 的登记清单里把“入库前守门”和“译码器”并列写明，防止被扫描误报。

审查 B 三审 · 2026-11-13

# K6 合法性是后果：独立验收包

要证明的现象：凡是物理上可行、只缺社会许可的行为，**先发生**，再由规范栈**命中罪名**并**产生后果**；物理上不可行的仍然拒绝，理由是物理理由。

验收方不读 `server-plugin/` 的实现。驱动只经引擎公开入口：`WorldEngine.createCharacter` 开新档，`reduce` 跑 `world_act`（登记动作）和 `world_propose`（原语提案），`applyPatches` 落盘。观察只读存档的 `state`、`ledger`、`holdings`；账本用 `ledger.auditLedger` 与 `tests/helpers/ledger-audit.mjs` 的 `conservation`。不改状态、不调真实模型、不改仓库。
覆盖面的拒绝点取自 `docs/审查/2026-11-04-内容与规律脱节-发现.md` 的 C-b、C-c、C-d 表，消息原文对照 `F:/dnd-tmp/audit2/c2.json`（只用其中的文件、行号、消息三栏）。

## 运行

```
# 基线（默认 ACC_REPO=F:/dnd-wt/S5FIX）。本机约 50 秒（--days 1–3 都在 1 分钟上下：基线上没有行为发生，不进入浸泡）
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k6-legality-acc/acceptance.mjs --days 1
# 验收实现：换仓库
ACC_REPO=<实现工作树> TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k6-legality-acc/acceptance.mjs --days 3
# 30 天正式跑（交李白在 Linux 上执行；ACC_REPO 指向 Linux 上的实现树，OUT_DIR 写死为 F:/dnd-tmp/k6-legality-acc，Linux 上需改脚本第 9 行与 lib.mjs 默认路径）
ACC_REPO=<实现树> node acceptance.mjs --days 30
# 由基线结果重生成期望（只在基线变化时）
node F:/dnd-tmp/k6-legality-acc/make-expected.mjs
```

- 产物：`acceptance.json`（每条断言 + 证据 + `coverageBaseline` + `vsExpected`：期望 pass 但还没 pass 的条目），`acceptance.log`。全过退出码 0。
- 30 天耗时依据：本机实测推进一天约 3 秒/存档；交付后最多 5 份犯事存档进入浸泡，30 天约 5×30×3 ≈ 450 秒，加主流程约 1 分钟，**预计 8–10 分钟**。
- 同时只占 1 个 node 进程；变异副本用 robocopy（不是 node）复制。

## 判定方式

每条断言三种结果：**pass** 现象成立；**fail** 现象不成立（基线上多数是"被社会许可闸门拒绝"）；**blocked** 前提现象没法用真实动作造出来，证据里写明卡在哪条缺失的规律或数据上。

共同判据（每组复用）：
- **发生**：动作或提案 `committed`，且物理后果落在存档里（库存/钱数变化、羊死、位置变成私宅、被扣者处于留置、施法耗了法力）。检定没过换事件号重试最多 5 次。
- **守恒**：`auditLedger` 为空、`conservation` 为空。
- **罪名**：存档里新出现以玩家为行为人的 `offense` 记录（罪名词汇见 `world/ontology/offenses.json`；不限定具体罪名 id，6.2 例外）。
- **后果**：与这次行为的 eventId 相连的社会反应——旁人或失主的记忆条目、对玩家信任/好感下降、聚落声望下降、案件状态推进、通缉或追索记录。犯事后先歇一个时辰再看。
- **社会许可闸门**（正则 `PERMIT`）：许可、授权、同意、所有者、擅自、田主、住户、赏金、通缉、案件未登记、物权、合法持有、他人账户等。
- **物理理由**（正则 `PHYSICAL`）：数量不足、力量、重量、工具、尚未学会、法力、材料、不可移动、距离等；且不得同时命中 `PERMIT`。

对照（不计入）：`core:crime.steal` 偷林穗一份干粮——基线上就是"发生、立 theft 嫌疑、目击者记忆、声望 −3、守恒"。这是 K6 要推广到原语层的现成模板，也证明罪名与后果两件量具本身可用。

## 断言（71 条，基线 pass 3 / fail 49 / blocked 19）

| 组 | 条数 | 内容 |
|---|---:|---|
| 一 拿别人的东西 | 21 | 林穗的面包（提案 transfer）、铁匠的五个铜钱、谢堇家的一只山羊（进她家院→牵出一只→交锋）、任博烽台的柴炭（`site.gather`）、村里公田的庄稼（`farm.private_harvest`）；每项四条：发生、守恒、罪名、后果。另 1.4w"砍别人的树"blocked：世界里没有他人所有、可伐的林木 |
| 二 进私宅 | 3 | 未经住户许可 `core:move` 进筛种院：进入、侵入罪名、住户反应 |
| 三 无证施法 | 2 | 白石镇向季笙真实学会观心照（有检定、按日重试），回河湾对自己施放（当地无精神施法许可）：施放、罪名 |
| 四 无通缉拘人 | 3 | 先 `core:law.arrest`，被拒再提 `holding.open guest_of{mode:detained}` 扣下林穗：拘住、罪名、反应 |
| 五 覆盖面 | 31 | 审计 C-b 24 点、C-c 4 点、C-d 3 点逐一复现，见下表 |
| 五b 物理不可行 | 5 | P1 没斧头砍北林、P2 把酒馆揣进行囊、P3 没学过的精神法术、P4 搬走铁匠铺炉膛、P5 拿走林穗 999 个面包：都须拒绝且理由是物理理由 |
| 六 罪名派生通用 | 5 | 变异副本里新增从没出现过的"琥珀发簪"给林穗：副本里确实有、拿走后发生、守恒、罪名、且罪名就是 theft（与普通物品同名） |
| 七 N 天内后续 | 动态 | 一、二、四组发生的每件事，`--days N` 天后核对：案件推进、通缉、追索或声望。基线上行为都没发生，只有一条 blocked |

### 覆盖面基线（`coverageBaseline`）

- **被拒（社会许可）14 点 → 交付后应"发生 + 罪名"**：magic-air:37、magic-light:37、magic-light:226、magic-marks:27、magic-mind-space:52、magic-object:183、magic-water-earth:45、sites:250、sites:327、sites:265、location-access:23、law:705、magic-targeting:37、magic-movement:37（施法类都先真实学会法术、买齐材料，对 NPC 名下且 `access:consent` 的设施施放）。
- **blocked 15 点（不在 K6 期望内，各写缺什么）**：
  - 学不到法术：magic-movement:48、:101、summons:47、magic-growth:51（法术没有登记教师）；magic-care:50（教师答"高阶职业内容需要相关职业认证"）。
  - 世界里没有他人名下的个体动物或尸体，畜群不能作动作对象：pets:44、wildlife-awakening:176、wildlife:308。
  - sites:467：任博烽台"此地没有可采林木"（同 1.4w）。
  - manufacturing:86：玩家开局不会任何配方。
  - law:702、law:891：开局没有生效的通缉、没有他人为被告的案件（造这些属司法程序前提）。
  - 无玩家入口：npc-obligations:143（审计没摘消息）、npc-autonomy:153、magic-object:289（NPC 侧热源）。
- **excluded 2 点**：quest-board:144（审计"待人判"）、law:774-782（"谁能颁发许可"是构成性规则，类 C-f）。两者基线上都是被拒，照实记录，不计入期望。

## 通用性变异（六组）

每次运行用 robocopy 把被验仓库复制到 `mut/`（排除 node_modules、.git、SillyTavern，另为省空间排除 docs、assets、logs、dist），用 junction 连 node_modules；然后在副本里：
- `world/meta/items.json` 追加 `item_k6mut_amber_hairpin`（琥珀发簪，以 `item_horn_comb` 为字段模板）；
- `world/people/baseline.json` 给林穗库存加 1 支。

同一进程里从副本加载世界与引擎，开新档，提案拿走发簪。断言它与拿面包走同一条规律：发生、守恒、立罪，且罪名为 theft。对照（不计）：副本里 `core:crime.steal` 偷发簪能成、立 theft——说明副本本身可用。

## expected.json

由 `make-expected.mjs` 从基线结果生成：57 条应 pass（其中 5 条是"七"组动态断言：林穗的面包、铁匠的钱、任博的林木、进私宅、扣人；P1、P3、6.0 基线已 pass），16 条仍 blocked（覆盖面 15 + 1.4w，附 `missingLaw`），2 条 excluded。`acceptance.mjs` 运行时会读它，把"期望 pass 但还没 pass"的条目写进 `vsExpected`。

带 note 的期望：
- 1.3 宰羊依赖 K7 的"从畜群牵出一只"原语路径。
- 1.5 若交付后理由变成"作物尚未成熟"这类物理理由，改判 blocked（季节前提），应在成熟季复跑。
- P2、P4 基线回答是"现有手段不能产生这种效果"——既不是所有权也不是物理理由；K6 后应给物理理由。若主会话认为这属 AUDIT3 的动作入口，可移出期望。

## 拿不准、需主会话判断的

1. **与 K7 验收包冲突**：K7 的 E 组（24 条）要求"他人所有"必须被拒、理由是"没有处分权"；K6 要求同类行为发生并定罪。K6 排在 K7 之后，K6 交付后 K7 的 E 组按设计会变 fail，需要主会话改 K7 期望（建议 E 组改为"发生 + 罪名"，或只留物理不可行的部分）。
2. magic-light:226 用低灯术对祠堂供灯复现，基线回的是 light:37 的消息"光学对象需要有效所有者授权"，可能没打到 226 那一行（两行同属光学，都在期望内）。
3. "非法拘禁"不在 `offenses.json` 词汇里（只有 theft、trespass、mental_magic、unconsented_magic 等），所以拘人、施法、进私宅只断言"有罪名"，不断言具体 id；只有 6.2 断言 theft。
4. 宰羊路径需要先进谢堇家院（私宅闸门），所以 1.3 在基线上记为闸门 fail。若 K6 后进得去但牵出一只的原语仍缺，这四条会停在 blocked，属 K7。
5. "后果"按 eventId 关联记忆、关系、声望、案件、通缉。如果实现把后果挂在别的事件号上（例如另起一个罪案事件、没有回指原行为），这一条会误判 fail，需要看证据核对。

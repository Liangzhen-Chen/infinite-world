# K7 所有者处分权：独立验收包

验收方不读 `server-plugin/` 的实现，只经引擎公开入口驱动：`WorldEngine.createCharacter` 开新档，`reduce` 跑工具面的 `world_act`（登记动作）和 `world_propose`（开放提案），`applyPatches` 落盘。
观察只读存档文档里的 `state`、`ledger`、`holdings`。账本对账用 `ledger.auditLedger` 和 `tests/helpers/ledger-audit.mjs` 的 `conservation`。
不直接改状态，不调用真实模型，不改仓库。

运行（两个脚本可以并行，各占一个 node 进程）：

```
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k7-acc/matrix.mjs        # 约 4 分钟 → matrix.json / matrix.md / expected.json
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k7-acc/acceptance.mjs    # 约 2 分钟 → acceptance.json；全过退出码 0
```

| 文件 | 作用 |
|---|---|
| lib.mjs | 驱动层：开新档、调用工具（`call`/`act`/`propose`）、读持有和账户、在栖地真实追踪 |
| rows.mjs | 推出矩阵的行，并为每行做"真实取得" |
| columns.mjs | 推出矩阵的列，写明每个别名映射到哪个原语，以及"不适用"的推导 |
| matrix.mjs | 逐格试，生成 matrix.json、matrix.md、expected.json |
| acceptance.mjs | 现象验收，生成 acceptance.json |

## 一、矩阵的行从哪来

1. **能被持有的模板**：取 `holdings.json` 里与持有物相关的持有种类。条件是满足以下任一条：
   - 标的含 thing、population 或 instrument；
   - `transferable` 为真；
   - `handover.gone=estate`，也就是持有人消失后转入遗产。

   符合条件的共 13 种：owns、share、leases、operates、employed_by、custody_of、tamed_by、pledged、branch、possesses、cursed_by、enshrined_in、commands。
   这些种类的标的模板，再与 `entity-templates.json` 里 `subject:true` 的模板取交集，得到 thing、population、agent、place、instrument、collective。
   interim 因为 `subject:false` 被排除。office 不是财产类持有的标的，也排除。
   agent 里的 person 例外排除，依据是 owns 的注释：creature 标的须物种 ownable，且未被承认人格。人不是财产。
2. **细分**：按模板的 kinds，以及世界里实际存在的实体（`census` 计数写在 matrix.json 的 `derivation.census`），细分成 18 行：
   - 物（thing）：计量存货、物品个体、钱币、文书或凭证、载具、建筑或房间、树或林木、痕迹、残骸；
   - 生灵（agent/creature）：尸体或猎获、自有活体个体（牲畜）、驯兽或宠物；
   - 群（population）：种群或畜群；
   - 地（place）：土地或田块、田里作物；
   - 契（instrument）：债权、许可或执照；
   - 群体（collective）：份额或股权。
3. **每行先用真实动作取得一件自有实例**：
   - 取到的（6 行）：计量存货、物品个体、钱币、痕迹、尸体或猎获、债权。取得方式分别是开局行囊、向段岩买切刀、开局铜钱、`open:leave_mark`、追踪后 `core:combat` 猎杀、`core:trade.deposit` 存款。
   - 取不到的行，把每一次尝试的原样拒绝写进 `rows[].attempts`。主要原因：
     - 买房、接手畜群、获得林木，动作目录里都没有对应动作；
     - 认领田地时回复"已经采用农事账"；
     - 租铺和入股都要求"需要对方答应"；
     - 驯服时回复"驯兽技能不足"，而且没有 NPC 教这门手艺；
     - 开文书时回复"你尚不能书写这种文字"；
     - 物品表里没有载具；
     - 畜群记录为 0。

## 二、矩阵的列从哪来（共 122 列）

- **原语 8 列**：卡里点名的 destroy、transfer、vital、fact.set、create、move、status、transition，都核对过在 `primitives.json` 中存在。
- **持有族 52 列**：holding.open、close、transfer、rescale，乘以上面那 13 种持有种类。
- **义务族 39 列**：obligation.create、settle、cancel，乘以 `obligations.json` 里 `onCreditorGone=estate` 的 13 种。这一条件的含义是：债权人消失时这笔债权转入遗产，也就是债权本身是财产。这 13 种是 loan、deposit、bill、rent、wage、dividend、tax、delivery、judgment、compensation、project、forward、approval。
- **日常动词 23 列**：卡里列出的 22 个动词，加上"个体化"。每个别名在 `columns.mjs` 的 `ALIASES[].maps` 里写明映射到哪个原语、持有或义务种类。动作目录里有对应登记动作的（如卖对应 `core:trade.sell_to`，典当对应 `core:trade.pawn`），先试登记动作，再试原语组合提案。
- 提案的参数名一律取 `primitives.json` 的 `params`。

**格数 = 18 行 × 122 列 = 2196。**

## 三、每格怎么判（matrix.mjs）

每格都从该行取得实例后的同一份存档出发，用 `commit:false` 独立试，互不影响。

- **通**：登记动作提交且有效果落地，或者提案提交且原方案里的那一条效果落在原定对象上（原语相同、target/entity/subject/from/to 一致）。
  - 引擎曾把对痕迹的 vital 落到玩家自己身上，这种情况判为"落到了别的对象上"，不算通。
  - 检定失败时重掷 5 次，一次都没落地就不算通。
  - `via` 写走的是哪个动作或工具。
- **缺**：引擎拒绝，原样记下拒绝信息（reason 和 missing），或者提交了但效果被裁掉。
  - 取不到自有实例的行，格子一律记"缺：无自有实例"并附上取得尝试。
  - 有现成的无主或他人所有实例时，同样试一次，结果记在 `ref` 里作对照。
- **不适用**：只从本体字段或设计稿已定规律推出世界内的理由。例如：
  - 持有种类的 `subjectKinds` 不含该模板；
  - rescale 用于没有 `sum` 的持有种类；
  - vital 用于非动物；
  - 活体用 destroy（设计稿 4.1 保留"活体走 vital"）；
  - fact.set 用于 `writable` 之外的种类；
  - 搬动地点，或搬动 `located:false` 的权利；
  - 宰杀一块地、种植一件物品，等等。

  不适用的格也真实试过，引擎的回答记在 `engine` 里。引擎放行了本体判为不适用的格时，标 `anomaly`。

**expected.json**：给出 K7 交付后每格的期望。
- 应从"缺"变"通"的列：destroy、transfer、vital、宰杀、毁坏、送、卖、分群、个体化。丢弃、改装只对物品类三行（计量存货、物品个体、文书或凭证）要求。
- 取不到自有实例的行，标 `blockedBy`，说明能否变通取决于取得路径，不是 K7 本身的问题。
- 其余格保持 master 原样。是"缺"的，写明缺哪条规律（`missingLaw`，对应设计稿的卡号）。
- `holding.transfer:owns` 和 `holding.close:owns` 在设计稿 4.1 里也列为缺省可行，但卡没有列入期望，这两格标了 note。

## 四、验收怎么判（acceptance.mjs）

一共 57 条现象断言。结果分三种：
- **pass**：现象成立。
- **fail**：现象不成立。
- **blocked**：前提现象没法用真实动作造出来。blocked 等同未过，单独计数是为了方便定位。

| 组 | 断言 | 判定方式 |
|---|---|---|
| A 山羊 | 4 | 取得一只自己的羊（物种名含"羊"），宰杀，取材，守恒 |
| B 牛、鸡、全部活体 | 4+4+1 | 牛、鸡（名字含"牛"；含"鸡"但不是"鸡蛇"）各走同一条链；另外要求至少一种活物能被取得 |
| C 自家物品 | 11 | 卖、送、丢弃、毁坏、改装各一例，每例另加一条守恒断言 |
| D 自家畜群 | 6 | 分群、头数守恒、宰一只、卖一只、守恒 |
| E 他人所有 | 24 | 物品、钱、建筑、田地、作物、林木、活物（羊、牛、鸡、任意）、驯兽、畜群 |
| F 驯兽 | 3 | 宰自家驯兽，不给野外经验 |

- **取得活物**按阶梯尝试：
  1. 向世界里任何库存有该物种、或名下有该类生灵的人买（`core:trade.buy`）；
  2. 开局就有；
  3. 在栖地追踪后用 `core:pet.contact` 加 `core:pet.tame` 驯服。

  三步都只用真实动作，走通的那一步写进证据。
- **宰杀**：先走 `core:combat`，逐回合真实交锋；不行再用 `world_propose` 提致死 vital。现象是"死去并留下尸体"。
- **取材**：先买齐物种 `wildlife.gather` 要的工具和耗材，再 `core:wildlife.gather`。现象是行囊增加的数量正好等于该物种 `drops` 里的物品和数量。产物只看物种现有数据，肉的派生属 K4。
- **守恒**：`auditLedger` 为空，`conservation`（每种资源的总量变化 = 源净流入 − 汇流出）为空；取材时 `src:harvest` 的流入等于所得。
- **他人所有**：必须是 rejected，并且理由要同时满足两条：
  - 命中"那是别人的或没有处分权"的语义。正则包括：他人、别人、不属于你、物主、所有权、无权、没有……权、没有……依据、须经……同意、需要对方答应、须……本人……持有等。
  - 不命中答非所问的说法，包括：不是交锋对象、不支持、不能产生这种效果、现有手段不能完成、未登记、不在你能确认……。
- **驯兽**：宰杀前后 `player.xp` 与 `experienceLedger` 都不变。
- **对照组**（不计入判定）：傍晚在北林猎一只落叶林兔再取材，得到生皮 1 张，账本守恒。这说明取材和守恒这两件量具本身是好的。

## 五、基线（主会话 11-04 改定）

- 现行基线是 `F:/dnd-wt/S5FIX`（t-s5fix@58e8d709），这棵树含 S5 的畜牧、生态、驯养。lib.mjs 默认读这棵树，可以用环境变量 `K7_REPO` 改。
- 原先在 master（aa958488）上的结果改名保留：`*-master.json`、`*-master.md`、`*-master.log`。
- 这棵树新增的取得尝试，三条都被拒，原样写进证据：
  - 向谢堇家的羊群、雉群主人买：回复"交易对方不在场"；
  - 驯服：回复"驯兽技能不足"；
  - 动作目录里仍然没有买卖、分户或开立畜群的动作。

  这些行标"缺：取得路径（K2/K1）"，不在 K7 期望内（expected.json 里写在 `blockedBy`）。
- 谢堇家的畜群现在作为"他人畜群"拿来验收：试了牵走、宰杀、卖三种处分，也作为畜群行的对照实例。
- 改装只在有现成配方路径时属于 K7 期望。没有配方路径时，验收标 blocked，写"缺：配方路由（通用门卡 4）"；expected.json 也不再把它列为应变通。
- "须本人持有"这类拒绝，算作"没有处分权"。

## 六、取得路径复查（主会话 11-04 第二轮）

- **向谢堇买羊**：按她 schedule 的各个时段（default、market、rest、季节表），所有时段的 `services` 都是空的。玩家白天去南田找她，每隔一个时辰试买一次，共试 4 次，都被拒："谢堇此刻不提供交易服务"。
  世界里持有牲畜的只有谢堇家两群（山羊群、雉群），没有别的卖家。记为"缺：取得路径（K2/K1）"。
- **驯兽**：学习来源是有的，即白石镇的梁驯（`npc_a3_exam_life_15`），第二天 08:00 开课；没有相关的书。新文件 tame.mjs 把整条真实路径走了一遍：
  1. 去白石镇向梁驯学驯兽师基础手艺。学艺有检定，没学会就再上一课；
  2. 逐日练习，16 天练到熟练度 100；
  3. 回南田追踪麦斑野雉（山羊要求玩家 3 级，玩家现在是 1 级），逐日接近、喂食；
  4. 信任每天只涨一次，总共要 3 天以上。追踪到的野雉个体每次 2–3 天就死了，换了三只都没驯成。

  结论：驯兽 blocked，写"缺：取得路径"。"追踪到的个体很快死亡"可能本身就是一条规律缺口，交主会话判断。
- 自家物品的丢弃和毁坏，以及他人所有的拒绝理由，这两组保留为 fail，它们就是 K7 的验收靶子。

## 主会话注（11-04 22:30）
K6 合入后，E 组"他人所有必须被拒"由 K6 的"发生 + 定罪"取代。这组变成 fail 属于预期，判定以 F:/dnd-tmp/k6-legality-acc/ 为准。

# 卡 B 畜牧规律：独立验收包

验收方不读 `server-plugin/` 的规律实现，只经引擎公开入口驱动：`WorldEngine.createCharacter` 开新档，`reduce` 跑 `world_time`（推进时间）、`world_act`（登记动作）、`world_propose`（开放提案），`applyPatches` 落盘。
观察只读存档里的 `state.records`（畜群记录）、`ledger.accounts`、`ledger.flows`。对账用 `ledger.auditLedger` 和 `tests/helpers/ledger-audit.mjs` 的 `conservation`。
唯一的"前提"是玩家仓里的饲料数量，用 `tools/a3-score.mjs` 的 `applyIntentSetup({inventory})` 设，和 `tests/s5-06` 相同；它不造任何产出。
不调用真实模型，不改仓库。

## 运行

```
# 本机冒烟（约 20 秒）
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/b-husbandry-acc/acceptance.mjs --days 3
# 正式 30 天（交李白在 Linux 上跑；基线上预计 4–6 分钟，实现后规律变多可能到 10 分钟）
TEMP=/tmp TMP=/tmp ACC_REPO=<被测仓库> node acceptance.mjs --days 30 --out acceptance-30d.json
```

- `ACC_REPO`：被测仓库，默认 `F:/dnd-wt/S5FIX`（t-s5fix@58e8d709）。Linux 上还要把 `lib.mjs` 里的 `HERE`（产物目录）和 `syncMutCopy`（robocopy + mklink）换成 `rsync -a --delete --exclude node_modules --exclude .git --exclude SillyTavern` 加 `ln -s`。
- 退出码 0 表示全过。结果写 `acceptance.json`（`summary` 和逐条 `results[].evidence`）。
- `expected.json`：卡 B 交付后应为 pass 的断言（27 条全部）；D 组还依赖 K7。

| 文件 | 作用 |
|---|---|
| lib.mjs | 驱动层：开新档、调用工具、推进时间、设饲料前提、同步仓库副本 |
| mutate.mjs | 通用性变异：在副本 `mut/` 里加新物种、新畜群 |
| acceptance.mjs | 现象验收，A–E 五组 |

## 物品怎么归类

"奶、毛、皮、蛋、肉、骨"按物品的 `tags` 归类（milk；hair/wool/fleece/fur；hide/pelt/skin；egg；meat；bone），物品没有 tags 时再看名字。
这只是给观察结果分类，不是产物名单。运行中出现的、物品表里没有的新产物，也按同样规则归类。

## 各组判定

**A 30 天产出**（原仓库世界，玩家不动，只推进 N 天）
- 奶、毛、皮、蛋各 1 条：第 N 天世界总存量（所有账户之和）大于 0，并且最后 N/3 天里仍有来自畜群的新增。畜群来源指 `src:husbandry`，或者用途写明畜群/宰杀的 `src:harvest`。开局存量放着不动不能算过。
- 来源 1 条：这段时间这四类物品的所有新增都不能来自 `src:import`、`src:regrowth`、开局以外的 `src:genesis`，并且至少有一笔来自畜群。开局存量（`src:genesis|*|opening`，有的到第一天才落账）单独列出，不算新增。
- 守恒 1 条：`auditLedger` 为空，`conservation` 为空。

**E 饲料来源**（与 A 同一次运行）
- 别人家的畜群在玩家不插手的情况下有饲料：N 天里至少八成的日子出现了喂养或放牧的消耗流，也就是汇流且用途匹配 feed、graz、pasture、饲、牧。
- 被吃掉的每种饲料，同期都有真实产出（进货和开局存量除外），数量不少于被吃掉的量，并且没有任何进货。

**B 繁育受约束**（副本世界）
- 副本里给玩家加三群现有物种：繁育群 400 只/栏 3000、满圈群 400 只/栏 400、兽群 6 只（D 组备用）。
- 每天把饲料篮里每样物品设成 60 份。饲料篮是 tags 为 grain、fodder、feed、hay、forage、grass、straw 的物品。
- 实验分三段，每段 N/3 天：有料 → 断料（设成 0）→ 恢复。
- 7 条断言：
  1. 有料期出生数大于 0，头数增加；
  2. 断料期出生数少于有料期；
  3. 断料期出现饥饿或死亡：头数下降，或记录里饥饿、死亡类计数上升（病死不算）；
  4. 断料期每天的活体产出少于有料期；
  5. 满圈群头数始终不超过栏圈，也不增长；
  6. 恢复期末头数高于断料期末；
  7. 守恒。

**C 由属性派生**（副本世界，通用性变异）
- 从现有畜牧物种中挑出 tags 含 bird 的一种和不含 bird 的一种，按"照属性克隆"造出四个从没出现过的物种：
  - 雾鬃兽（兽类）、苇冠禽（禽类）：复制原物种在 monsters.json 和 species.json 里的全部字段。不管实现者给原物种加了什么属性，克隆都会带上。然后删掉一切指向物品 id 的字段，只有饲料和驯养食物除外。这样掉落表、`husbandry.yields` 等产物名单都去掉了。名字和文案也全部换掉。
  - 素雾兽、素苇禽：在上面的基础上，只保留身份、等级模板、饲料和繁殖参数，其余属性（tags、diet 等）全部删除。
  - 每个物种给玩家一群：兽类 40 只，禽类 12 只。
- 8 条断言：
  1. 新物种能进世界，加载不拒绝；
  2. 雾鬃兽产奶；
  3. 雾鬃兽产毛：出成件，或者 `accruals` 里 `yield:<毛类物品>` 的余数在累积；
  4. 苇冠禽产蛋；
  5. 素雾兽不产奶、不产毛；
  6. 素苇禽不产蛋；
  7. 同一群兽有料日的产奶量多于断料日；
  8. 用 `core:husbandry.collect` 把一份奶真实采到手。

**D 宰杀自家畜群**（依赖 K7）
- 宰杀的尝试顺序：
  1. 目录里名称、动词或同义词匹配宰、屠、slaughter、butcher、cull 的动作；
  2. `world_propose` 提致死 `vital`。
- 判定宰成，要看畜群是否真的少了一只。
- 宰成以后，如果留下尸体，再用 `core:wildlife.gather` 取材。
- 4 条断言：
  1. 少一只，并且留下尸体或产物；
  2. 没有掉落名单的新兽类，宰后得到肉类和皮类；
  3. 兽类宰后产物的总重量大于禽类，即产量由体型派生；
  4. 种群账户等于头数，账本审计为空，资源守恒。
- 宰杀路径不存在时，四条都记 blocked，原因写 K7。

## 基线结果（S5FIX@58e8d709，--days 3）

27 条：pass 7、fail 12、blocked 8。

- **A 组**：fail 5 条，只有守恒一条 pass。谢堇家的两群没有饲料（她的行囊里没有燕麦），所以没有任何活体产出。存量就是开局放着的那些。
- **E 组**：2 条都 fail。别人家的畜群 0 天有饲料。
- **B 组**：pass 6 条。S5 已经有"断料不繁育、不产出""满栏不增长"。只有"断料出现饥饿或死亡"一条 fail：断料后头数和记录都没有变化。
- **C 组**：4 条 fail，4 条 blocked。加载器拒绝不带产物名单的物种，报错"家畜参数无效"。去属性的对照组和采收没法测，记 blocked。
- **D 组**：4 条都 blocked，原因是 K7。目录里没有宰杀动作；`world_propose` 的致死 vital 提交了，但畜群头数没变。

## 已知取舍

- 断料（主会话 11-04 定）：断掉这群畜在世界里的全部饲料来源。B 组每个断料日、C 组的断料日都这样做，只在副本测试档上做。
  - 玩家仓里的饲料篮清零。
  - 如果存在放牧，把畜群所在地的草场或可食生物量也清零。识别办法：
    - 在 `state.records` 里找与所在地相关的记录：location、place、at 或 site 等于所在地，或者键名里含所在地；
    - 这些记录里字段名匹配 grass、forage、pasture、graz、biomass、fodder、herbage 或"草"的数值字段，都清零；
    - 清零用 `applyIntentSetup.facts` 设成 0。
  - 证据字段 `pastureCut` 列出清零的路径；没找到时写"未发现放牧来源，只清零仓里饲料"。基线就是没找到的情况。
  - 实现如果把草场存在字段名不匹配的地方，就会断不干净。查 `pastureCut` 可以定位。
- "皮"算卡 B（主会话 11-04 定）：牧户在栏满或缺料时淘汰宰杀，这是畜牧规律的一部分。原断言保持不变。
- 毛：只要产毛的余数在累积，就算产毛（主会话认可）。
- 蚕卵（item_silkworm_eggs）的 tags 含 egg，会被算进"蛋"类。

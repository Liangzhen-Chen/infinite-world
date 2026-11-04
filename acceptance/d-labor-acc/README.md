# 卡 D 职业驱动劳动（d-labor）：独立验收包

验收方不读 `server-plugin/` 的规律实现。驱动只走引擎公开入口：`WorldEngine.createCharacter` 开新档，`reduce` 跑 `world_act`，`applyPatches` 落盘。
观察只读存档里的这几样：`state.npcAutonomy.actions`、`state.records` 的新条目、`ledger.crafts`、`ledger.accounts`、`ledger.flows`。
守恒检查用 `ledger.auditLedger` 和 `tests/helpers/ledger-audit.mjs` 的 `conservation`。
不改仓库，不调用真实模型，不读 secrets.json。

## 运行

```
# 本机冒烟（≤3 天），约 4–6 分钟（基线树）
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/d-labor-acc/acceptance.mjs --days 3

# 30 天正式跑（交李白在 Linux 上跑；先把 ROOT 路径与 ACC_REPO 换成 Linux 路径）
ACC_REPO=<被测树> TEMP=<tmp> TMP=<tmp> node acceptance.mjs --days 30
```

- 30 天正式跑的预计耗时：
  - 基线树约 12–15 分钟，各段如下：
    - 主浸泡 30 天约 2.5 分钟；
    - 价格段 5 种物品，每种各从浸泡末存档分叉，再等 5 天，约 3 分钟；
    - 两次变异浸泡各 30 天，约 5 分钟；
    - 复制副本约 1 分钟。
  - 卡 D 交付后，NPC 劳动变多，预计 2–3 倍，约 30–45 分钟。
- 只重判、不重跑：加 `--judge-only`。
- 进程情况：`acceptance.mjs` 本身不加载世界，只按顺序起子进程，所以同一时刻只有一个 node 在算。
- 退出码：0 表示全部 pass，1 表示有 fail 或 blocked，3 表示脚本出错。

| 文件 | 作用 |
|---|---|
| lib.mjs | 驱动层（沿用 k7-acc）：用 `ACC_REPO` 指定仓库，默认 `F:/dnd-wt/S5FIX` |
| soak.mjs | 浸泡与价格段，输出 `trace-<tag>.json` |
| mutate.mjs | 通用性变异，只改副本 `mut/`，输出 `mut-meta.json` |
| acceptance.mjs | 编排加判定，输出 `acceptance.json` |
| expected.json | 卡 D 交付后应变成 pass 的断言 |

## 浸泡怎么跑（soak.mjs）

1. 新档等到次日 06:00。账本在第一个日界开账，从这时起算。
2. 之后每次 `core:time` 等 60 分钟，共 `24 × 天数` 步。每步记两样东西：账户差、流量差。
3. **玩家整个浸泡只做等待。** 采集入口一个都不调用，包括 `core:site.gather`、`site.mine`、`site.woodcut`、`wildlife.gather`、`wildlife.fish`、`farm.harvest`。轨迹里的 `playerGatherCalls` 必须为 0，这就是现象 3"关掉玩家采集"的做法。

### 劳动事件的可观察口径

劳动事件指以下三处出现的新条目，并且条目带行为人字段（npc、actor、worker、carrier、porter、seller、keeper、maker 等之一），行为人是 NPC：

- `state.npcAutonomy.actions`
- `state.records`
- `ledger.crafts`

**实现若把劳动记在别处，本包看不到，会判 fail。** 这一点请主会话在派卡时告诉实现方。

### 归因：事件要对上账本

把事件所在那一步前后共 4 步的账户差、流量差合起来看，分四类核实：

| 类别 | 认定条件 |
|---|---|
| 采集 | ① 事件有产出、没有投入；② 同时段该物品有自然来源：自然储量减少（`reserve`、`forest:`、`site_`），或真实产出源入账（排除 `src:genesis`、`src:import`、`src:drift`）；③ 本人或本人聚落的账户增加 |
| 加工 | 事件有产出也有投入（或者事件类型是加工），本人或本聚落账户增加。另外**至少一项投入能追到真实产出**：浸泡中被采集或加工产出过，或者有真实产出源入账。只靠开局存量不算 |
| 出售 | ① 事件类型是出售，或 `side=sell`；② 行为人是卖方，买方是别人；③ 收到了钱；④ 货能追到真实产出。卖开局存量或 `src:import` 进来的货不算 |
| 运输 | ① 事件类型是运输；② from ≠ to；③ 带货物字段，行为人不是买方；④ 货能追到真实产出 |

事件类型（`labor`、`category`、`kind` 等字段）用正则归到这四类，见 `soak.mjs` 的 `RX`。这里的正则只用来认实现方的事件类型名，不用来判世界内容。

## 断言（共 32 条）

| 编号 | 现象 | 判定 |
|---|---|---|
| 1.0 | 连跑满 30 天 | days ≥ 30。本机冒烟必然 fail，正式跑才算数 |
| 1.<物品> ×5 | 盐、柴（item_wood）、药草、黏土、蜂蜜，各有真实的 NPC 供应者 | 至少一次核实的采集，且至少一次落在本人作息的非睡眠时段（作息表先读 `state.npcs[x].schedule`，没有再读世界数据） |
| 2a.<物品> ×5 | 供应少时价格高 | 在该物品主要供应者所在的聚落：<br>① 向持货最多、能报价的卖家用 `commit:false` 的 `core:trade.buy` 报价，得 Q0；<br>② 玩家逐件真实买走该聚落 NPC 手里的存货（锚定卖家留 1 件）。每买一件前先用 commit:false 试买 2 件，确认还留得出报价 1 件的负重，否则停手，买得动多少算多少；然后报价得 Q1；<br>③ 判 S1 < S0 且 Q1 > Q0 |
| 2b.<物品> ×5 | 供应多时价格低 | 接 2a 再等 K 天（K = min(5, ⌊天数/6⌋)，至少 1）。判三条同时成立：<br>① 聚落在售存量回升，S2 > S1；<br>② 窗口内该物品有核实的 NPC 采集；<br>③ Q2 < Q1。<br>只看价格回落不够：基线里价格会随时间自己回落，但存量没变 |
| 3.<物品> ×5 | 不调用玩家采集，世界照样自给 | 三条同时成立：<br>① 玩家采集调用为 0；<br>② 每日世界存量 > 0（人、聚落、行会，不含玩家，不含自然储量）；<br>③ 浸泡最后三分之一仍有 NPC 采集补入 |
| 3.books | 守恒 | `auditLedger` 为空，`conservation` 为空 |
| 4.process / 4.sell / 4.carry | 非采集劳动 | 各至少一例按上表核实 |
| 5a | 新职业只带劳动类别属性，就有人去做 | 见下"变异" |
| 5b.gather / process / sell / carry | 职业名换成随机串，行为不变 | 拿 mut2 和对照组比（mut1；mut1 没跑时用 base），比较核实过的（人, 物品）集合，必须完全相同。对照组为空记 blocked |
| 5b.new | 新职业改名后照样有人做 | mut2 里 5a 那个人仍去采集同一物品 |
| 5.books | 变异副本守恒 | 同 3.books |

价格段说明：
- 每种物品都从浸泡结束时的同一份存档分叉，互不影响。
- 报价取 `result.pricing.unitPrice`，这是未取整的单价。
- 卖家不在场或不营业时，每隔一小时重试，最多 30 次；仍不行就换下一个卖家，最多换 4 个。

## 变异（mutate.mjs）

副本放在 `F:/dnd-tmp/d-labor-acc/mut/`。复制时排除 node_modules、.git、SillyTavern、backups、dist、logs、docs、world/drafts；node_modules 用 junction 连回原树。

**第一阶段（5a）**
1. 从 base 轨迹里取一个真实采集者 G，优先选采黏土的。
2. 在 `world/**/*.json` 里找 G 职业的定义。认两种形状：
   - 以职业名为键的对象；
   - 以职业名为字段值、且带劳动字段的非人物对象。

   劳动字段指键名匹配 `labor|劳动|work|gather|采集|duty|task|categor|produce|output|livelihood` 的字段。
3. 新建一个**从没出现过**的职业"晨钟客"。它只复制劳动字段，名字字段换成新名，其余字段一概不带。
4. 选 G 同聚落的一个成年人 T：base 里一次劳动都没有，`tier` 优先 full。把 T 的职业改成"晨钟客"，作息不改。
5. 断言 T 在 mut1 浸泡里去采集该物品。

T 的作息不改，所以要采集，只能靠"职业 → 作息 → 劳动"的派生。

**第二阶段（5b）**
1. 把 mut1 里所有劳动者的职业名，连同"晨钟客"，换成 `Zx` 开头加 9 位随机 ASCII 字母的串。随机种子固定，串里不含任何中文关键词。
2. 替换方式是对 `world/**/*.json` 做 JSON 字符串的精确替换，值和键都替换。
3. 再跑 mut2，与 mut1 比较。

**blocked 的情形**：base 里没有任何核实的采集，或者找不到带劳动字段的职业定义。这时 5a、5b.new 记 blocked，并写明缺的是"R3 职业 → 劳动类别"。

## 已知假定（主会话 11-04 定，保留现写法）

- **职业定义的格式是猜的。** 5a 按字段名找"职业 → 劳动类别"属性，规则见上文"变异"。实现方的格式若不在这两种形状里，5a 和 5b.new 会被误判 blocked。正式跑前先看 `mut-meta.json` 的 `stage1.definition` 或 `stage1.blocked`。
- **复现假定。** 5b 拿改名副本与对照组逐项比较（人, 物品），前提是同一份存档、同一串动作跑两次，结果完全一致，并且职业名不参与随机种子。这一点本包没有单独验证；若 5b 失败，先排除复现问题，再归到关键词匹配。

## 基线结果（F:/dnd-wt/S5FIX，t-s5fix@58e8d709，本机 --days 3）

见 `acceptance.json`，摘要写在交接回复里。

摘要（32 条）：pass 7、fail 19、blocked 6。
- pass：2a ×5（买空后涨价，现有市场深度规律；木料按负重能买多少买多少，S 48→36，价 4.0→4.8）；3.books；5.books。
- fail：
  - 1.0：只跑了 3 天；
  - 1.×5：没有任何 NPC 采集事件能对上账本；
  - 2b.×5：等 1 天后存量没有回升；
  - 3.×5：最后三分之一时段没有 NPC 采集补入；
  - 4.process：阿砚做木柄，投入只来自开局存量；
  - 4.sell：青灯酒馆卖的面包来自进货；
  - 4.carry：没有运输事件。
- blocked：5a、5b ×4、5b.new。原因是基线没有核实的劳动，缺 R3/R8。

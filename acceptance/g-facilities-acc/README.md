# 卡 G 设施与工位派生（K5）：独立验收包

验收方不读 `server-plugin/` 的实现，只经引擎公开入口驱动：`WorldEngine.createCharacter` 开新档，`reduce` 跑工具面（`world_act` 的 `core:move`、`core:trade.buy`、`core:trade.rent_in`，以及 `world_learn`、`world_craft`、`world_promise`、`world_move`、`world_time`），`applyPatches` 落盘。
观察只读存档的 `state`、`ledger`、`holdings`；对账用 `ledger.auditLedger` 和 `tests/helpers/ledger-audit.mjs` 的 `conservation`。不调用真实模型，不改仓库。

## 运行

```
# 被验收仓库用 ACC_REPO 指定，默认基线 F:/dnd-wt/S5FIX（t-s5fix@58e8d709）
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/g-facilities-acc/acceptance.mjs              # 约 4–5 分钟 → acceptance.json；全过退出码 0
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/g-facilities-acc/acceptance.mjs --days 3     # 本机冒烟：多出 G5 浸泡断言
TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/g-facilities-acc/acceptance.mjs --selftest-mut   # 量具自检，见下文第四节
```

30 天正式跑（李白在 Linux 上执行；路径换成 Linux 上的仓库和本包位置）：

```
ACC_REPO=/path/to/repo node /path/to/g-facilities-acc/acceptance.mjs --days 30
```

推进一天约 3.5 秒，30 天约 2 分钟，加上主流程，预计 7–10 分钟；首次建变异副本还要加上复制仓库的时间（约 1GB）。
变异副本跨平台：Windows 上用 robocopy 复制、mklink /J 连接 node_modules；其他平台用 `fs.cpSync` 复制、symlink 连接。G3 在 Linux 上也能跑。

| 文件 | 作用 |
|---|---|
| lib.mjs | 驱动层：`makeEnv(repo)` 用该仓库自己的引擎和世界数据，提供 `call` 和 `act`；也定义"访问拒绝"语义正则 ACCESS |
| kit.mjs | 真实备齐某类工位的一条入门配方：先找出愿意教的人，走过去学；再向有货的人买工具和材料 |
| acceptance.mjs | 现象验收，生成 acceptance.json（自检模式生成 selftest-mut.json） |
| expected.json | K5 交付后应当 pass 的断言 |
| mut/ | 变异副本，首次运行 G3 时自动建立：不复制 node_modules、.git、SillyTavern；node_modules 在 Windows 上用 junction 连接，其他平台用 symlink |

## 一、工位类别从哪来

取 recipes 的 `workstation` 字段去重，得到 6 类：cooking、pill_furnace、pottery、smithing、weaving、woodworking。不写名单。

每类挑一条入门配方：`minimumProficiency` 为 0，且没有 prerequisites。备料用真实动作：
1. 学艺：先用只读探针在全体 NPC 中找出此刻愿意教的人，再加上配方里写的 teachers 和熟练度够的人，真实走过去 `world_learn`。学艺检定没过就再上一课；对方没空就睡到次日再去。
2. 买料：工具和材料向有库存的人 `core:trade.buy`。当天成交深度不够时，按件买。

## 二、判定方式

**勘察（G1 计数的量具）**：在备齐配方的存档副本上，逐个地点试一次 `world_craft`（commit:false），458 处全试。为了覆盖全世界，探针把副本的所在地点直接设为该处，只读、不落盘。拒绝原因分三类：
- "此处根本没有工位"：正则 ABSENT，如"当前位置没有所需工作台""不在所需工坊"；
- "有工位但要主人同意或付费"：正则 ACCESS；
- 其他：例如丹炉热源不够，算有工位。

每类另外用真实走路做成一次，核对探针结果与实地一致（G1 第 3 条）。

主会话 11-04 已认可这种做法：勘察用改位置的只读探针，每类再真走一次核对。G4 的师傅探针同理。

| 组 | 断言 | 判定 |
|---|---|---|
| G1 ×6 类 | 工位数 > 1 | 勘察出的工位地点数 > 1 |
| G1 ×6 | 工位数 = 具备该属性的建筑数 | 见下方"属性发现"。全部工位都要能归到某个结构化的最小属性集上，且全世界具备该属性集的地点集合与工位集合相同 |
| G1 ×6 | 实地走到一处名单外的工位做成 | 真实 `core:move` 到一处不在手写 `workstations` 名单上的公共工位，`world_craft` 落地，产物进行囊，账本审计与守恒为空 |
| G2 | 借邻居的灶台做成饭 | 在公共处遇到某户有灶私宅的成年住户，`world_promise grant_access`（用途"借灶台做饭"），持许可进屋，`world_craft` 落地，有产物，账本守恒 |
| G2 | 未经主人同意用别人的工位：被拒，或发生后定擅用并有后果 | 与 K6 同口径：物理可行就先发生，再定擅用。候选是"需主人同意"的工位和私宅里的工位。私宅只取得"登门拜访"的许可，不提借用，然后不经主人同意就做。下列两种都算 pass：①主人在场并拒绝，即进屋许可或用工位被拒，理由命中 ACCESS 语义，排除答非所问的 OFFTOPIC，且不动钱；②做成了，同时存档新增擅用一类罪名标记（`offense:*`、擅用、侵占、盗用），并有后果：赔、罚、追究、案件类记录，或主人对玩家的信任、好感、关系记录发生变化。无声无息地成功判 fail，记在 `silent` 里 |
| G2 | 租下工坊后在那里做成 | `core:trade.rent_in` 租下一处有工位的非私宅地点，真实付租，玩家名下出现 leases 或 operates 持有，之后在那里做成，账本守恒 |
| G2 | 付费使用工位 | 在公共工位做成，玩家付出的钱 > 0，账本审计与守恒为空（钱有去处） |
| G3 ×6 | 新建筑具备最小属性集就能做，去掉其中任何一项就不能 | 见下方"通用性变异" |
| G4 ×6 | 师傅不集中在单一地点 | 上午、下午各用只读探针对全体 NPC 试 `world_learn`（commit:false）。答应教的人的工作地点（没有工作地点时取当时所在地）去重后 > 1 |
| G4 ×6 | 有工位且有合格手艺人的地点都有人教 | "具备条件的地点"指工位地点里，有熟练度够的人在那里工作或居住的地方。要求这类地点数 > 1，且每一处都有答应教的人 |
| G5 | 浸泡 N 天后烹饪工位数不减、账本守恒 | 只在 `--days N` 时出现：逐日睡到次晨，重新勘察，工位数不少于第 0 天且 > 1，账本守恒 |

**属性发现（G1 第 2 条与 G3 共用）**：验收方事先不知道实现会把"有灶"写成什么字段，所以从数据里把它找出来：
1. 在内存世界副本里新建一座从没出现过的空屋 `bld_acc_g_<类>_novel`（河湾村，公共、无主），并给它配一条路。
2. 把某处工位所在地的全部结构化属性拷给空屋：数组逐元素，对象逐子键；该处有家户时，再配一户新编号的人家。确认空屋能开工。
3. 逐项去掉，求出最小必需属性集。这个集可以有多项，例如"灶 + 烟囱"。对象元素再逐字段删到最小。

不参与的字段有两类：
- 手写 `workstations` 名单：它就是 K5 要消灭的东西；
- 文字字段：名称、别名、描述、用途 purpose、authoredFacts。

靠文字关键词派生的工位因此会被判为"无法归到可分离的属性"，这正是红线要拦的。

最小集就是"签名"。全世界具备该签名（集中每一项都具备）的地点数，必须等于勘察出的工位数（集合相等）。一处工位如果归不到已知签名，就从它出发再找一次，最多 8 种签名。

**通用性变异（G3）**：在 `mut/` 副本的 `world/geo/locations.json` 和 `routes.json` 里写入那座新建筑。家户签名时，还要在 `people/households.json` 写入新人家。然后：
1. 只给它最小属性集，用副本自己的代码和数据重新加载，开新档，真实学艺、买料，走到新建筑，`world_craft`（commit:false）应当落地；
2. 对集里的每一项，分别去掉这一项后重新加载，每次都应当被拒。

跑完，副本文件恢复原样。

## 三、基线结果（F:/dnd-wt/S5FIX，t-s5fix@58e8d709）

见 acceptance.json。要点：
- 每类工位全世界只有 1 处，都是手写 `workstations`：青灯后厨、旧磨坊、铁匠铺、织坊、学馆丹炉；陶窑在白石镇。私宅一处都没有灶。
- 属性发现：除 `workstations` 外，把该处全部结构化属性拷给空屋仍不能开工，所以 G1 计数一致与 G3 全部 fail。
- 借灶：fail，世界里没有一户私宅有灶。擅用：fail，世界里没有任何属于别人且需同意的工位，全是公共收费工位。
- 租与付费在基线已 pass。原因是 `core:trade.rent_in` 本来就能租下青灯酒馆（付 5 文，开 leases），后厨也本来就收 3 文；但青灯本身就是公共工位，"租"在这里不是必要条件。K5 不得把这两条做坏。
- 师傅：每类答应教的人都只在一处。陶艺的愿教者都在白石镇 loc_bs，而且没有一位熟练度够的人在陶窑工作或居住。
- 计数：40 条断言，pass 2，fail 38，blocked 0。基线留档为 acceptance-baseline.json。
- 炭当天成交深度不够时，kit 会改成按件买，所以陶艺也能备齐。

## 四、量具自检（--selftest-mut）

基线上属性发现必然失败，所以 G3 的变异机器在基线上本来跑不到。自检模式只测 cooking，并把手写 `workstations` 也当作"属性"放进候选，把整条机器跑一遍：建副本、写文件、重新加载、真实走进新建筑、制造。

结果写入 selftest-mut.json，不计入验收。基线结果：
- 全部属性拷入后逐项去掉，最小集是 `workstations[]` 一项；
- 新建筑具备最小集就能做（committed），去掉这一项就被拒（"当前位置没有所需工作台"）；
- 计数一致为 1 = 1。

结论：量具本身是好的。

## 五、拿不准的地方

1. 擅用后果的识别是宽口径的：罪名看 `offense:*` 等标记，后果看赔、罚、案件类记录或主人态度变化。K6 交付后，如果后果写在别的字段里，需要按 K6 的实际字段收紧或补上。
2. 最小集求法是逐项贪心删除，得到的是"极小"集，不一定是全局最小；有多种等价写法时只取一种作签名，其余工位靠再发现补上。
3. 浸泡 G5 只验烹饪的工位数和守恒，没验 30 天内的租约到期与师傅流动。

【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：150 分钟（到 140 分钟时停手写交接）。

# 卡 W8-E8：租田种地 + 自营工坊存料

先读：
- F:/dnd/logs/sessions/w8e-common.md（共同规则）；
- F:/dnd/docs/产品原则.md；
- docs/架构设计/ 中关于田地租佃、持有、工坊库存的段落（grep "租田" "佃" "lease" "asset_lease" "工坊" "workshop" "库存"）。

工作树 F:/dnd-wt/W8E8，分支 t-w8e8-premises（基于 s5a 80afd9c4）。

## 背景
1. **私田取得缺入口**（W8-E5 通关脚本 todo）：
   - agriculture.mjs privateFarmAction（约 482 行）只认 `asset.owner==='player'` 的登记田地；
   - 玩家没有任何真实途径买田或租田；
   - 引擎已有 asset_lease 记录与 finance-assets.mjs 的租赁/解约（terminateAssetLease），agriculture 也已检查"他人有效租赁"。
2. **自营工坊材料与产出只走行囊**（W8-E1 遗留）：
   - W8-C 起玩家入囊有负重（carry.mjs，安全负重 10+2×力量 公斤）；
   - 玩家自有工坊一个班次的木料就超过 30 公斤，tests/finance-assets.test.mjs 有 4 个工坊用例（98、122、131 行起，含 F083）报"拿不动"。

## 要做
1. **租田**：
   - 让玩家能向登记田地的持有人租入田地：
     - 复用现有 asset_lease 与租约条款、付款、同意、到期、解约这一套，不另造；
     - 田主须本人同意，租金按现有租金派生（地产估值或租金资本化，grep valuation property 角色）。
   - privateFarmAction 接受"本人持有"或"本人为有效租约承租人"两种合法使用权，其余照旧拒绝。
   - 租期内种下的作物归承租人。到期未收的处理以文档为准；文档没写的，按"作物归承租人，须在到期前收走，到期后留田随田主"，并在回执写明。
   - 把 tests/s5-playthrough.test.mjs 第 83 行的 todo 转为正式步骤，全程走玩家菜单：租田 → 播种 → 推进到成熟 → 负重内分批收割 → 卖自产粮 → 存入钱庄。
     - 背不动的部分按 W8-E1 的分批收割，多跑几趟。
     - 每步手算锚点。
   - 同步改 docs/可玩版本-S5.md 的说明和已知限制。
2. **自营工坊存料**：
   - 玩家自有或承租的工坊有自己的库存：
     - 材料从工坊库存领用，产出入工坊库存；
     - 玩家在工坊里可以把物品在行囊和工坊库存之间搬（搬入行囊受负重检查）。
   - 先看引擎是否已有建筑或资产库存：engine.bagPath 对 estate_/liq_ 走 protocol_assets inventory；建筑 inventory 用 grep 查。有就复用，没有就按最小改动加。
   - 店铺的"店存与行囊分离"已登记 S7，本卡不做店铺，除非测试因负重失败。若失败，写进汇报，不要顺手扩大。
   - finance-assets.test.mjs 的 4 个工坊用例必须恢复通过：前提改为把材料放进工坊库存，断言意图不变，产出数量与品质的手算锚点不变。
3. 账本守恒：工坊库存要进账本，有 stock 账户与持有写入者声明（holdings-writers 规则）。

## 可改文件
- server-plugin/agriculture.mjs（只限 privateFarmAction 的使用权判断与回执）；
- finance-assets.mjs、business.mjs（只限工坊）、items.mjs/stock.mjs（只追加）、contract-state.mjs（只限租约条款）；
- 对应测试、tests/s5-playthrough.test.mjs、docs/可玩版本-S5.md、新测试 tests/w8e8-premises.test.mjs。
- 不改 market.mjs、valuation.mjs（W8-E6 正在改）。

## 测试
- 逐文件跑：w8e8-premises、s5-playthrough、finance-assets、business 相关、agriculture 相关快测（s5-05、a3-domain-properties、w8c-carry）、holdings-writers、advance-registry、arch-metrics、numeric-persistence。
- agriculture.test.mjs 很慢，不必跑。

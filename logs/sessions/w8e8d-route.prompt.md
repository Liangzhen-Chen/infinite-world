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

# W8-E8 第四轮：可负担的真实种地路线

你如实停在"零级角色凑不齐镰刀加种粮加 140 首期租金"，且没有挑骰点，做得对。主会话的决定如下：

## 决定一：铁匠铺进铁镰（补世界内容缺口）
- item_sickle（铁镰）已经过审批管线进入目录，但没有任何店铺进货。
- 乡村铁匠铺不卖镰刀不合理，这是世界内容缺口，不是为测试补东西。
- 做法：在河湾铁匠铺（段岩所在店铺）的进货表里追加铁镰一行。位置是 world/meta/rules.json 的 economy.shops.stores，或该 NPC 的 shopRestock，以实际店铺数据所在为准。
  - 数量与补货节奏比照同店同类铁器的现有行；
  - 售价不写死，照常由市场报价派生；
  - 追加处注一行出处："W8-E8：乡村铁匠铺常备农具；铁镰已在目录（审批管线）"。
- 不要给其他店加货，也不要加别的物品。

## 决定二：田租可约定秋后交（佃租常见做法）
- 租约条款增加"租金到期日"选项：可约定在收成后、租期内某日交，形成真实的到期应付义务。复用 obligation 与赊账那一套，到期不交按现有违约规则处理。
- 出租方（集体田由现任首领）是否接受秋后交，经 npcDecision 读他的主观视图决定（信任、风险、承租人的偿付能力等现有输入），不写死"同意"。
  - 不接受时只能现付，回执写明原因。
- 现付路径保留不变。

## 收尾
- tests/s5-playthrough.test.mjs 农事段按真实菜单走：
  - 买铁镰（铁匠铺）与种粮 → 租田（尝试约定秋后交租；首领若拒绝，就按真实结果走现付或别的真实筹资路线，不挑种子）；
  - 播种 → 推进到成熟 → 分趟收割 → 卖自产粮 → 交租（若秋后交）→ 余款存钱庄 → 完整重放；
  - 每步手算锚点。
- 若首领对新角色确实不同意秋后交，而现付又付不起：
  - 断言如实保留失败，写进汇报；
  - 主会话再定。不要调整人物信任或世界数据去凑。
- 更新 docs/可玩版本-S5.md。

## 可改文件
在已放开的基础上，再放开：world/meta/rules.json（只追加铁匠铺铁镰一行，以及租约条款的参数若需要）、server-plugin/contract-state.mjs 与 finance-assets.mjs 的租约条款部分、credit/obligation 相关只读复用（不改已有函数行为）。

## 测试
- 同上一轮列表，另加 credit.test、obligation 相关测试、shop-restock。
- 金快照若因铁匠铺进货变化，写表，不重生成。
